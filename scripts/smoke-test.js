'use strict';

// Test spakowanej aplikacji: uruchamia potok przetwarzania z archiwum app.asar
// (natywne moduły, model AI, zapis WebP) na sztucznym zdjęciu produktu.
//
// Użycie (Electron w trybie Node, tak jak robi to aplikacja):
//   ELECTRON_RUN_AS_NODE=1 "<spakowana aplikacja>" scripts/smoke-test.js "<folder resources>"

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const resources = path.resolve(process.argv[2] || '');
const { processImage } = require(path.join(resources, 'app.asar', 'src', 'worker', 'pipeline.js'));
const { Transformer } = require(path.join(resources, 'app.asar', 'node_modules', '@napi-rs', 'image'));

function syntheticProduct(width, height) {
  // zielone tło (jak przy zdjęciach na green screenie) i jasny „słoik” na środku
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const inside = Math.abs(x - width / 2) < width * 0.18 && Math.abs(y - height / 2) < height * 0.3;
      px[o] = inside ? 225 : 70;
      px[o + 1] = inside ? 170 : 160;
      px[o + 2] = inside ? 90 : 80;
      px[o + 3] = 255;
    }
  }
  return px;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bez-tla-test-'));
  const input = path.join(dir, 'produkt.png');
  const w = 1600;
  const h = 1200;
  fs.writeFileSync(input, await Transformer.fromRgbaPixels(syntheticProduct(w, h), w, h).png());

  const model = {
    path: path.join(resources, 'models', 'birefnet-general-lite.onnx'),
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    sigmoid: true,
  };
  const job = { file: input, outputDir: path.join(dir, 'out'), maxSize: 1000, quality: 80, removeBackground: true, overwrite: false, model };

  // dwa przebiegi pod rząd: drugi sprawdza, że model działa wielokrotnie w jednym procesie
  for (let i = 1; i <= 2; i++) {
    const started = Date.now();
    const r = await processImage(job);
    const meta = await new Transformer(fs.readFileSync(r.output)).metadata();
    const pixels = await new Transformer(fs.readFileSync(r.output)).rawPixels();
    const corner = pixels[3];
    const center = pixels[((meta.height >> 1) * meta.width + (meta.width >> 1)) * 4 + 3];
    console.log(`Przebieg ${i}: ${path.basename(r.output)} ${meta.width}×${meta.height}, ${r.bytes} B, alfa róg=${corner} środek=${center}, ${Date.now() - started} ms`);
    if (meta.width !== 1000 || meta.height !== 750) throw new Error('Zły rozmiar wyniku');
    if (!(corner < 20 && center > 235)) throw new Error('Tło nie zostało usunięte');
  }
  console.log(`Szczytowe zużycie pamięci: ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
  console.log('OK');
}

main().catch((err) => {
  console.error('TEST NIEUDANY:', err);
  process.exit(1);
});
