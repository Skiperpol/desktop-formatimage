'use strict';

// Model AI do usuwania tła: BiRefNet (wariant general-lite, backbone Swin-T).
// Licencja MIT (© 2024 ZhengPeng), więc można go używać komercyjnie.
// Plik modelu jest dołączany do instalatora (extraResources), a w trybie
// deweloperskim leży w folderze models/ projektu (npm run fetch-model).

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const MODEL = {
  name: 'BiRefNet Lite',
  file: 'birefnet-general-lite.onnx',
  bytes: 224005088,
  // przygotowanie danych jak w rembg (sesja birefnet-general-lite)
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  sigmoid: true,
};

function candidatePaths() {
  return [
    path.join(process.resourcesPath || '', 'models', MODEL.file),
    path.join(app.getAppPath(), 'models', MODEL.file),
  ];
}

/** Zwraca opis modelu ze ścieżką do pliku albo null, jeśli pliku brakuje. */
function findModel() {
  for (const p of candidatePaths()) {
    try {
      if (fs.statSync(p).size === MODEL.bytes) return { ...MODEL, path: p };
    } catch {
      // brak pliku w tej lokalizacji
    }
  }
  return null;
}

module.exports = { findModel, MODEL };
