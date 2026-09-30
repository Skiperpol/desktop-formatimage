'use strict';

// Lokalizacja i pobieranie modelu BRIA RMBG 2.0 (ten sam plik, którego używa rembg).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, net } = require('electron');

const MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx';
const MODEL_SHA256 = '5b486f08200f513f460da46dd701db5fbb47d79b4be4b708a19444bcd4e79958';
const MODEL_BYTES = 1024331469;

function ownModelPath() {
  return path.join(app.getPath('userData'), 'models', 'bria-rmbg-2.0.onnx');
}

function candidatePaths() {
  const home = os.homedir();
  const list = [ownModelPath()];
  // Model pobrany wcześniej przez rembg (Python) — nie ma sensu pobierać go drugi raz.
  if (process.env.REMBG_HOME) list.push(path.join(process.env.REMBG_HOME, 'models', 'bria-rmbg', 'bria-rmbg.onnx'));
  if (process.env.XDG_DATA_HOME) list.push(path.join(process.env.XDG_DATA_HOME, 'rembg', 'models', 'bria-rmbg', 'bria-rmbg.onnx'));
  list.push(path.join(home, '.rembg', 'models', 'bria-rmbg', 'bria-rmbg.onnx'));
  if (process.env.U2NET_HOME) list.push(path.join(process.env.U2NET_HOME, 'bria-rmbg.onnx'));
  list.push(path.join(home, '.u2net', 'bria-rmbg.onnx'));
  return list;
}

function findModel() {
  for (const p of candidatePaths()) {
    try {
      if (fs.statSync(p).size === MODEL_BYTES) return p;
    } catch {
      // brak pliku — sprawdzamy kolejną lokalizację
    }
  }
  return null;
}

let downloading = null;

/**
 * Pobiera model, jeśli go nie ma. Zwraca ścieżkę do pliku.
 * @param {(received: number, total: number) => void} onProgress
 * @param {AbortSignal} [signal]
 */
function ensureModel(onProgress, signal) {
  const existing = findModel();
  if (existing) return Promise.resolve(existing);
  if (!downloading) {
    downloading = download(onProgress, signal).finally(() => {
      downloading = null;
    });
  }
  return downloading;
}

async function download(onProgress, signal) {
  const target = ownModelPath();
  const part = `${target}.part`;
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const res = await net.fetch(MODEL_URL, { signal });
  if (!res.ok || !res.body) throw new Error(`Nie udało się pobrać modelu AI (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || MODEL_BYTES;

  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(part);
  let received = 0;
  let lastReport = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      received += value.length;
      if (Date.now() - lastReport > 200) {
        lastReport = Date.now();
        onProgress(received, total);
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw new Error(`Pobieranie modelu AI zostało przerwane: ${err.message}`);
  }

  if (hash.digest('hex') !== MODEL_SHA256) {
    fs.rmSync(part, { force: true });
    throw new Error('Pobrany model AI jest uszkodzony. Spróbuj ponownie.');
  }
  fs.renameSync(part, target);
  onProgress(total, total);
  return target;
}

module.exports = { findModel, ensureModel, MODEL_BYTES };
