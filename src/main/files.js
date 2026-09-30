'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Transformer, ResizeFit, ResizeFilterType } = require('@napi-rs/image');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp'];
const MAX_FOLDER_DEPTH = 3;

function isImage(file) {
  return IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

function collect(entry, depth, out) {
  let stat;
  try {
    stat = fs.statSync(entry);
  } catch {
    return;
  }
  if (stat.isFile()) {
    if (isImage(entry)) out.push(entry);
    return;
  }
  if (stat.isDirectory() && depth <= MAX_FOLDER_DEPTH) {
    let names = [];
    try {
      names = fs.readdirSync(entry);
    } catch {
      return;
    }
    names
      .filter((n) => !n.startsWith('.'))
      .sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }))
      .forEach((n) => collect(path.join(entry, n), depth + 1, out));
  }
}

/** Zamienia listę plików i folderów na listę zdjęć (foldery są przeszukiwane w głąb). */
function expandPaths(paths) {
  const out = [];
  for (const p of paths) collect(p, 0, out);
  return [...new Set(out)];
}

async function describe(file) {
  const { size } = fs.statSync(file);
  let width = null;
  let height = null;
  try {
    const meta = await new Transformer(await fs.promises.readFile(file)).metadata(true);
    const swap = (meta.orientation || 1) >= 5;
    width = swap ? meta.height : meta.width;
    height = swap ? meta.width : meta.height;
  } catch {
    // plik nieczytelny — błąd pokaże się przy przetwarzaniu
  }
  return { path: file, name: path.basename(file), size, width, height };
}

async function thumbnail(file, size = 360) {
  const buf = await new Transformer(await fs.promises.readFile(file))
    .rotate()
    .resize({ width: size, height: size, fit: ResizeFit.Inside, filter: ResizeFilterType.Triangle })
    .webp(75);
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

module.exports = { expandPaths, describe, thumbnail, IMAGE_EXTENSIONS };
