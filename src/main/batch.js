'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { ensureModel } = require('./model');
const { thumbnail } = require('./files');

const WORKER_PATH = path.join(__dirname, '..', 'worker', 'worker.js');

class BatchRunner {
  /** @param {(event: object) => void} send */
  constructor(send) {
    this.send = send;
    this.worker = null;
    this.pending = null;
    this.running = false;
    this.cancelled = false;
    this.abort = null;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = fork(WORKER_PATH, [], {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
    });
    worker.on('message', (msg) => this.onWorkerMessage(msg));
    worker.on('error', () => worker.kill());
    worker.on('exit', () => {
      if (this.worker === worker) this.worker = null;
      if (this.pending) {
        this.pending.reject(new Error('Proces przetwarzania zakończył się niespodziewanie.'));
        this.pending = null;
      }
    });
    this.worker = worker;
    return worker;
  }

  onWorkerMessage(msg) {
    if (!this.pending || msg.id !== this.pending.id) return;
    if (msg.type === 'stage') {
      this.send({ type: 'item-stage', id: msg.id, stage: msg.stage });
    } else if (msg.type === 'done') {
      this.pending.resolve(msg);
      this.pending = null;
    } else if (msg.type === 'error') {
      this.pending.reject(new Error(msg.message));
      this.pending = null;
    }
  }

  runJob(id, job) {
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      worker.send({ type: 'process', id, job });
    });
  }

  /**
   * @param {{id: string, path: string}[]} items
   * @param {object} settings
   */
  async start(items, settings) {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    let ok = 0;
    let failed = 0;

    try {
      let modelPath = null;
      if (settings.removeBackground) {
        this.abort = new AbortController();
        modelPath = await ensureModel(
          (received, total) => this.send({ type: 'model-download', received, total }),
          this.abort.signal,
        );
        this.abort = null;
      }

      for (const item of items) {
        if (this.cancelled) break;
        this.send({ type: 'item-start', id: item.id });
        try {
          const result = await this.runJob(item.id, {
            file: item.path,
            outputDir: settings.outputDir,
            maxSize: settings.maxSize,
            quality: settings.quality,
            removeBackground: settings.removeBackground,
            overwrite: settings.overwrite,
            modelPath,
          });
          let thumb = null;
          try {
            thumb = await thumbnail(result.output);
          } catch {
            // brak miniatury nie jest błędem zapisu
          }
          ok++;
          this.send({ type: 'item-done', id: item.id, output: result.output, bytes: result.bytes, width: result.width, height: result.height, ms: result.ms, thumb });
        } catch (err) {
          if (this.cancelled) {
            this.send({ type: 'item-cancelled', id: item.id });
            break;
          }
          failed++;
          this.send({ type: 'item-error', id: item.id, message: err.message });
        }
      }
      this.send({ type: 'finished', ok, failed, cancelled: this.cancelled, outputDir: settings.outputDir });
    } catch (err) {
      this.send({ type: 'finished', ok, failed, cancelled: this.cancelled, outputDir: settings.outputDir, fatal: this.cancelled ? null : err.message });
    } finally {
      this.running = false;
      this.abort = null;
      if (this.cancelled) removePartials(settings.outputDir);
    }
  }

  cancel() {
    if (!this.running) return;
    this.cancelled = true;
    if (this.abort) this.abort.abort();
    // Model przetwarza jedno zdjęcie nawet kilkanaście sekund, więc zamiast czekać
    // zatrzymujemy proces roboczy od razu. Następne uruchomienie utworzy nowy.
    if (this.worker) this.worker.kill();
  }

  dispose() {
    if (this.worker) this.worker.kill();
  }
}

function removePartials(dir) {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.webp.part')) fs.rmSync(path.join(dir, name), { force: true });
    }
  } catch {
    // folder mógł nie powstać
  }
}

module.exports = { BatchRunner };
