'use strict';

// Usuwanie tła + zmniejszanie + zapis WebP.
// Odwzorowuje rembg (sesja bria-rmbg) i zmniejszanie.py:
// model dostaje obraz 1024×1024 znormalizowany średnią/odchyleniem ImageNet,
// maska jest normalizowana min-max, a wynik zmniejszany do zadanego dłuższego boku.
//
// Do obróbki obrazów używamy @napi-rs/image zamiast sharp: sharp na Linuksie
// konfliktuje z biblioteką GLib, którą ładuje Electron (electron/electron#46323).

const fs = require('node:fs');
const path = require('node:path');
const { Transformer, FastResizeFilter, ResizeFit, JsColorType } = require('@napi-rs/image');
const ort = require('onnxruntime-node');

const MODEL_SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session = null;
let sessionModelPath = null;

async function loadSession(modelPath) {
  if (session && sessionModelPath === modelPath) return session;
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 3,
    // Z areną pamięci drugie uruchomienie modelu w procesie Electrona kończy się awarią.
    enableCpuMemArena: false,
    enableMemPattern: false,
  });
  sessionModelPath = modelPath;
  return session;
}

/** Zamienia piksele w natywnym układzie pliku (L, LA, RGB, RGBA; 8 lub 16 bit) na RGBA 8 bit. */
function toRgba(raw, count, colorType) {
  const layouts = {
    [JsColorType.L8]: [1, 1, false],
    [JsColorType.La8]: [2, 1, true],
    [JsColorType.Rgb8]: [3, 1, false],
    [JsColorType.Rgba8]: [4, 1, true],
    [JsColorType.L16]: [1, 2, false],
    [JsColorType.La16]: [2, 2, true],
    [JsColorType.Rgb16]: [3, 2, false],
    [JsColorType.Rgba16]: [4, 2, true],
  };
  const layout = layouts[colorType];
  if (!layout) throw new Error('Nieobsługiwana głębia kolorów zdjęcia.');
  const [channels, bytes, hasAlpha] = layout;
  if (raw.length !== count * channels * bytes) throw new Error('Nie udało się odczytać pikseli zdjęcia.');
  if (channels === 4 && bytes === 1) return raw;

  // przy 16 bitach bierzemy starszy bajt (dane są little-endian)
  const hi = bytes - 1;
  const out = Buffer.alloc(count * 4, 255);
  for (let p = 0; p < count; p++) {
    const s = p * channels * bytes;
    const o = p * 4;
    if (channels <= 2) {
      const v = raw[s + hi];
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      if (hasAlpha) out[o + 3] = raw[s + bytes + hi];
    } else {
      out[o] = raw[s + hi];
      out[o + 1] = raw[s + bytes + hi];
      out[o + 2] = raw[s + 2 * bytes + hi];
      if (hasAlpha) out[o + 3] = raw[s + 3 * bytes + hi];
    }
  }
  return out;
}

/** Dekoduje zdjęcie, obraca je zgodnie z EXIF i zwraca piksele RGBA. */
async function decode(file) {
  const input = await fs.promises.readFile(file);
  const meta = await new Transformer(input).metadata(true);
  const swap = (meta.orientation || 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  const raw = await new Transformer(input).rotate().rawPixels();
  return { pixels: toRgba(raw, width * height, meta.colorType), width, height };
}

function resizeRgba(img, width, height) {
  if (width === img.width && height === img.height) return Promise.resolve(Buffer.from(img.pixels));
  return Transformer.fromRgbaPixels(img.pixels, img.width, img.height)
    .fastResize({ width, height, filter: FastResizeFilter.Lanczos3, fit: ResizeFit.Fill })
    .rawPixels();
}

/** Wymiary jak w PIL Image.thumbnail: proporcjonalnie, nigdy nie powiększa. */
function fitInside(width, height, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function predictMask(img) {
  const rgba = await resizeRgba(img, MODEL_SIZE, MODEL_SIZE);
  const plane = MODEL_SIZE * MODEL_SIZE;

  let max = 1e-6;
  for (let p = 0; p < plane; p++) {
    const o = p * 4;
    if (rgba[o] > max) max = rgba[o];
    if (rgba[o + 1] > max) max = rgba[o + 1];
    if (rgba[o + 2] > max) max = rgba[o + 2];
  }

  const input = new Float32Array(3 * plane);
  for (let p = 0; p < plane; p++) {
    for (let c = 0; c < 3; c++) {
      input[c * plane + p] = (rgba[p * 4 + c] / max - MEAN[c]) / STD[c];
    }
  }

  // Bufor na wynik alokujemy sami: Electron (V8 memory cage) nie pozwala modułom
  // natywnym zwracać pamięci spoza sterty JS, więc wynik utworzony przez onnxruntime
  // kończyłby proces błędem.
  const outputName = session.outputNames[0];
  const h = MODEL_SIZE;
  const w = MODEL_SIZE;
  const pred = new Float32Array(h * w);
  await session.run(
    { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]) },
    { [outputName]: new ort.Tensor('float32', pred, [1, 1, h, w]) },
  );

  let mi = Infinity;
  let ma = -Infinity;
  for (let i = 0; i < pred.length; i++) {
    if (pred[i] < mi) mi = pred[i];
    if (pred[i] > ma) ma = pred[i];
  }
  const range = ma - mi || 1;

  // Maska w kanale R obrazu z pełną alfą, żeby skalowanie nie mnożyło jej przez przezroczystość.
  const mask = Buffer.alloc(w * h * 4, 255);
  for (let i = 0; i < pred.length; i++) mask[i * 4] = Math.floor(((pred[i] - mi) / range) * 255);
  return { pixels: mask, width: w, height: h };
}

function uniqueOutputPath(outputDir, baseName, overwrite) {
  let candidate = path.join(outputDir, `${baseName}.webp`);
  if (overwrite) return candidate;
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${baseName}-${n}.webp`);
    n++;
  }
  return candidate;
}

/**
 * Przetwarza jedno zdjęcie i zwraca informacje o zapisanym pliku.
 * @param {object} job
 * @param {string} job.file         ścieżka do zdjęcia
 * @param {string} job.outputDir    folder docelowy
 * @param {number} job.maxSize      maksymalny dłuższy bok w px
 * @param {number} job.quality      jakość WebP 1–100
 * @param {boolean} job.removeBackground
 * @param {boolean} job.overwrite   zastępuj plik o tej samej nazwie
 * @param {string} [job.modelPath]  wymagany, gdy removeBackground = true
 * @param {(stage: string) => void} [onStage]
 */
async function processImage(job, onStage = () => {}) {
  const { file, outputDir, maxSize, quality, removeBackground, overwrite, modelPath } = job;
  fs.mkdirSync(outputDir, { recursive: true });

  const img = await decode(file);
  const size = fitInside(img.width, img.height, maxSize);
  let out;

  if (removeBackground) {
    if (!session || sessionModelPath !== modelPath) {
      onStage('loading-model');
      await loadSession(modelPath);
    }
    onStage('removing');
    const mask = await predictMask(img);

    onStage('saving');
    out = await resizeRgba(img, size.width, size.height);
    const alpha = await resizeRgba(mask, size.width, size.height);
    for (let i = 3; i < out.length; i += 4) out[i] = alpha[i - 3];
  } else {
    onStage('saving');
    out = await resizeRgba(img, size.width, size.height);
  }

  const webp = await Transformer.fromRgbaPixels(out, size.width, size.height).webp(quality);

  const outPath = uniqueOutputPath(outputDir, path.parse(file).name, overwrite);
  const tmpPath = `${outPath}.part`;
  try {
    await fs.promises.writeFile(tmpPath, webp);
    fs.renameSync(tmpPath, outPath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
  return { output: outPath, bytes: webp.length, width: size.width, height: size.height };
}

module.exports = { processImage, loadSession, uniqueOutputPath, fitInside };
