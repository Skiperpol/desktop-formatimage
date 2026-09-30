'use strict';

// Pobiera model BiRefNet Lite (licencja MIT) do folderu models/ i sprawdza sumę SHA-256.
// Uruchamiane przed budowaniem instalatora (npm run fetch-model), bo plik modelu
// (224 MB) jest za duży, żeby trzymać go w repozytorium.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx';
const SHA256 = '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333';
const TARGET = path.join(__dirname, '..', 'models', 'birefnet-general-lite.onnx');

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function main() {
  if (fs.existsSync(TARGET) && (await sha256(TARGET)) === SHA256) {
    console.log('Model jest już pobrany:', TARGET);
    return;
  }
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  const part = `${TARGET}.part`;
  console.log('Pobieranie modelu BiRefNet Lite (224 MB)…');
  const res = await fetch(URL);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
  const got = await sha256(part);
  if (got !== SHA256) {
    fs.rmSync(part, { force: true });
    throw new Error(`Nieprawidłowa suma SHA-256 modelu: ${got}`);
  }
  fs.renameSync(part, TARGET);
  console.log('Zapisano:', TARGET);
}

main().catch((err) => {
  console.error('Nie udało się pobrać modelu:', err.message);
  process.exit(1);
});
