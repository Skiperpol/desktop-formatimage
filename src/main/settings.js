'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  outputDir: '',
  maxSize: 2000,
  quality: 80,
  removeBackground: true,
  overwrite: false,
};

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaultOutputDir() {
  return path.join(app.getPath('pictures'), 'Bez tła');
}

function clamp(n, min, max, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

function sanitize(raw) {
  const s = { ...DEFAULTS, ...raw };
  return {
    outputDir: typeof s.outputDir === 'string' && s.outputDir ? s.outputDir : defaultOutputDir(),
    maxSize: clamp(s.maxSize, 100, 10000, DEFAULTS.maxSize),
    quality: clamp(s.quality, 1, 100, DEFAULTS.quality),
    removeBackground: Boolean(s.removeBackground),
    overwrite: Boolean(s.overwrite),
  };
}

function loadSettings() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')));
  } catch {
    return sanitize({});
  }
}

function saveSettings(partial) {
  const next = sanitize({ ...loadSettings(), ...partial });
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

module.exports = { loadSettings, saveSettings };
