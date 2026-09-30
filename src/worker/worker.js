'use strict';

// Proces roboczy uruchamiany przez child_process.fork z ELECTRON_RUN_AS_NODE=1.
// Model AI i obróbka zdjęć działają tutaj, żeby okno aplikacji pozostało płynne.
// (utilityProcess Electrona nie nadaje się: jego alokator pamięci przerywa proces
// przy wielogigabajtowych buforach, których potrzebuje model).

const { processImage } = require('./pipeline');

process.on('message', async (msg) => {
  if (!msg || msg.type !== 'process') return;
  const started = Date.now();
  try {
    const result = await processImage(msg.job, (stage) => {
      process.send({ type: 'stage', id: msg.id, stage });
    });
    process.send({ type: 'done', id: msg.id, ms: Date.now() - started, ...result });
  } catch (err) {
    process.send({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
  }
});

process.on('disconnect', () => process.exit(0));
