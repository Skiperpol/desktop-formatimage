'use strict';

const ipc = window.api;
const $ = (id) => document.getElementById(id);

const els = {
  app: $('app'),
  empty: $('empty'),
  grid: $('grid'),
  listActions: $('listActions'),
  count: $('count'),
  pickBtn: $('pickBtn'),
  addBtn: $('addBtn'),
  clearBtn: $('clearBtn'),
  folderName: $('folderName'),
  folderParent: $('folderParent'),
  folderBtn: $('folderBtn'),
  openFolderBtn: $('openFolderBtn'),
  sizePresets: $('sizePresets'),
  sizeInput: $('sizeInput'),
  qualityInput: $('qualityInput'),
  qualityValue: $('qualityValue'),
  qualityHelp: $('qualityHelp'),
  removeBgInput: $('removeBgInput'),
  overwriteInput: $('overwriteInput'),
  modelStatus: $('modelStatus'),
  progress: $('progress'),
  progressLabel: $('progressLabel'),
  progressEta: $('progressEta'),
  barFill: $('barFill'),
  notice: $('notice'),
  noticeText: $('noticeText'),
  noticeAction: $('noticeAction'),
  startBtn: $('startBtn'),
  stopBtn: $('stopBtn'),
  dropzone: $('dropzone'),
  cardTpl: $('cardTpl'),
};

const state = {
  settings: null,
  items: new Map(),
  running: false,
  run: null,
  modelReady: false,
  modelName: '',
  home: '',
  platform: '',
};

let nextId = 1;

/* ---------- formatowanie ---------- */

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}
const photos = (n) => `${n} ${plural(n, 'zdjęcie', 'zdjęcia', 'zdjęć')}`;

const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
function formatBytes(b) {
  if (b >= 1024 * 1024) return `${nf1.format(b / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function formatDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

function splitPath(p) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  const name = parts.pop() || p;
  const parent = p.slice(0, p.length - name.length).replace(/[\\/]$/, '') || '/';
  return { name, parent };
}

// Na Linuksie i macOS katalog domowy skracamy do „~”; na Windowsie pokazujemy pełną ścieżkę.
function tildify(p) {
  const home = state.home;
  if (state.platform !== 'win32' && home && (p === home || p.startsWith(`${home}/`))) return `~${p.slice(home.length)}`;
  return p;
}

function friendlyError(message) {
  const m = String(message || '');
  if (/unsupported image format|Input file contains/i.test(m)) return 'Nieobsługiwany lub uszkodzony plik';
  if (/ENOENT|no such file/i.test(m)) return 'Plik nie istnieje';
  if (/EACCES|EPERM|permission/i.test(m)) return 'Brak uprawnień do zapisu w folderze';
  if (/ENOSPC/i.test(m)) return 'Brak miejsca na dysku';
  return m || 'Nieznany błąd';
}

const STAGE_TEXT = {
  queued: 'W kolejce',
  starting: 'Przygotowanie…',
  'loading-model': 'Ładowanie modelu AI…',
  removing: 'Usuwanie tła…',
  saving: 'Zapisywanie…',
};

/* ---------- ustawienia ---------- */

function renderSettings() {
  const s = state.settings;
  const { name, parent } = splitPath(s.outputDir);
  els.folderName.textContent = name;
  // znaki LRM utrzymują ukośniki na miejscu przy obcinaniu ścieżki od lewej (direction: rtl)
  els.folderParent.textContent = `\u200e${tildify(parent)}\u200e`;
  els.folderParent.title = s.outputDir;
  els.folderName.title = s.outputDir;

  els.sizeInput.value = s.maxSize;
  for (const btn of els.sizePresets.querySelectorAll('button')) {
    btn.setAttribute('aria-checked', String(Number(btn.dataset.size) === s.maxSize));
  }

  els.qualityInput.value = s.quality;
  els.qualityValue.textContent = s.quality;
  els.qualityHelp.textContent =
    s.quality >= 90 ? 'Bardzo wysoka jakość, większe pliki.'
      : s.quality >= 75 ? 'Dobry kompromis między jakością a wagą pliku.'
        : s.quality >= 60 ? 'Lżejsze pliki, drobne różnice widoczne z bliska.'
          : 'Najlżejsze pliki, widoczna utrata jakości.';

  els.removeBgInput.checked = s.removeBackground;
  els.overwriteInput.checked = s.overwrite;
  renderModelStatus();
  renderFooter();
}

async function updateSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  renderSettings();
  state.settings = await ipc.saveSettings(partial);
  renderSettings();
}

let qualityTimer = null;
els.qualityInput.addEventListener('input', () => {
  const q = Number(els.qualityInput.value);
  state.settings.quality = q;
  renderSettings();
  clearTimeout(qualityTimer);
  qualityTimer = setTimeout(() => updateSettings({ quality: q }), 250);
});

els.sizePresets.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-size]');
  if (btn) updateSettings({ maxSize: Number(btn.dataset.size) });
});

els.sizeInput.addEventListener('change', () => {
  const v = Math.round(Number(els.sizeInput.value));
  if (Number.isFinite(v) && v >= 100) updateSettings({ maxSize: Math.min(10000, v) });
  else renderSettings();
});

els.removeBgInput.addEventListener('change', () => updateSettings({ removeBackground: els.removeBgInput.checked }));
els.overwriteInput.addEventListener('change', () => updateSettings({ overwrite: els.overwriteInput.checked }));

els.folderBtn.addEventListener('click', async () => {
  const next = await ipc.pickFolder();
  if (next) {
    state.settings = next;
    renderSettings();
  }
});
els.openFolderBtn.addEventListener('click', () => ipc.openFolder(state.settings.outputDir));

function renderModelStatus() {
  const el = els.modelStatus;
  if (!state.settings.removeBackground) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.classList.toggle('is-ready', state.modelReady);
  el.classList.toggle('is-missing', !state.modelReady);
  el.textContent = state.modelReady
    ? 'Model AI gotowy, działa bez internetu.'
    : 'Brakuje pliku modelu AI. Zainstaluj aplikację ponownie.';
  el.title = state.modelReady ? `${state.modelName} (licencja MIT)` : '';
}

/* ---------- lista zdjęć ---------- */

function todoItems() {
  return [...state.items.values()].filter((i) => i.status === 'pending' || i.status === 'error');
}

async function addPaths(paths) {
  if (!paths || !paths.length) return;
  const known = new Set([...state.items.values()].map((i) => i.path));
  const described = await ipc.addPaths(paths);
  const fresh = described.filter((d) => !known.has(d.path));
  if (!fresh.length) {
    if (!described.length) showNotice('Nie znaleziono zdjęć w obsługiwanym formacie.', 'error', null);
    return;
  }
  hideNotice();
  const added = fresh.map((d) => {
    const item = { ...d, id: `f${nextId++}`, status: 'pending', stage: null, output: null, outBytes: 0, error: null };
    state.items.set(item.id, item);
    els.grid.append(createCard(item));
    return item;
  });
  renderList();
  loadThumbnails(added);
}

async function loadThumbnails(items) {
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!state.items.has(item.id)) continue;
      const src = await ipc.thumbnail(item.path);
      if (src) item.el.querySelector('.img-orig').src = src;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function createCard(item) {
  const el = els.cardTpl.content.firstElementChild.cloneNode(true);
  item.el = el;
  el.dataset.id = item.id;
  el.querySelector('.name').textContent = item.name;
  el.querySelector('.name').title = item.path;
  el.querySelector('.remove').addEventListener('click', () => removeItem(item.id));
  el.querySelector('.thumb').addEventListener('click', (e) => {
    if (item.status === 'done' && !e.target.closest('.remove')) ipc.showItem(item.output);
  });
  updateCard(item);
  return el;
}

function updateCard(item) {
  const el = item.el;
  el.classList.remove('is-pending', 'is-queued', 'is-processing', 'is-done', 'is-error');
  el.classList.add(`is-${item.status}`);
  const detail = el.querySelector('.detail');
  const thumb = el.querySelector('.thumb');
  thumb.title = '';
  detail.title = '';

  if (item.status === 'pending') {
    const dims = item.width ? `${item.width} × ${item.height} px, ` : '';
    detail.textContent = `${dims}${formatBytes(item.size)}`;
  } else if (item.status === 'queued') {
    detail.textContent = STAGE_TEXT.queued;
  } else if (item.status === 'processing') {
    detail.textContent = STAGE_TEXT[item.stage] || STAGE_TEXT.starting;
  } else if (item.status === 'done') {
    detail.textContent = `Zapisano, ${formatBytes(item.outBytes)}`;
    detail.title = item.output;
    thumb.title = 'Pokaż w folderze';
  } else if (item.status === 'error') {
    detail.textContent = item.error;
    detail.title = item.error;
  }
}

function removeItem(id) {
  if (state.running) return;
  const item = state.items.get(id);
  if (!item) return;
  item.el.remove();
  state.items.delete(id);
  renderList();
}

function clearItems() {
  if (state.running) return;
  state.items.clear();
  els.grid.replaceChildren();
  hideNotice();
  renderList();
}

function renderList() {
  const n = state.items.size;
  els.empty.hidden = n > 0;
  els.grid.hidden = n === 0;
  els.listActions.hidden = n === 0;
  els.count.textContent = photos(n);
  els.clearBtn.disabled = state.running;
  renderFooter();
}

/* ---------- przetwarzanie ---------- */

function renderFooter() {
  if (!state.settings) return;
  const n = todoItems().length;
  els.app.classList.toggle('is-running', state.running);
  els.startBtn.hidden = state.running;
  els.stopBtn.hidden = !state.running;
  els.startBtn.disabled = n === 0;
  if (n === 0) {
    els.startBtn.textContent = state.items.size ? 'Wszystkie zdjęcia zapisane' : 'Dodaj zdjęcia, aby zacząć';
  } else if (state.settings.removeBackground) {
    els.startBtn.textContent = `Usuń tło i zapisz ${photos(n)}`;
  } else {
    els.startBtn.textContent = `Zapisz ${photos(n)} jako WebP`;
  }
}

function startBatch() {
  const items = todoItems();
  if (!items.length || state.running) return;
  for (const item of items) {
    item.status = 'queued';
    item.error = null;
    updateCard(item);
  }
  state.running = true;
  state.run = { total: items.length, done: 0, failed: 0, durations: [] };
  hideNotice();
  renderList();
  renderProgress();
  ipc.startBatch(items.map((i) => ({ id: i.id, path: i.path })));
}

function renderProgress() {
  const run = state.run;
  if (!state.running || !run) {
    els.progress.hidden = true;
    return;
  }
  els.progress.hidden = false;

  const finished = run.done + run.failed;
  const current = Math.min(finished + 1, run.total);
  els.progressLabel.textContent = `Zdjęcie ${current} z ${run.total}`;
  els.barFill.style.width = `${(finished / run.total) * 100}%`;

  if (run.durations.length) {
    const avg = run.durations.reduce((a, b) => a + b, 0) / run.durations.length;
    els.progressEta.textContent = `zostało ok. ${formatDuration(avg * (run.total - finished))}`;
  } else {
    els.progressEta.textContent = '';
  }
}

function showNotice(text, kind, actionDir) {
  els.notice.hidden = false;
  els.notice.className = `notice is-${kind}`;
  els.noticeText.textContent = text;
  els.noticeAction.hidden = !actionDir;
  els.noticeAction.onclick = actionDir ? () => ipc.openFolder(actionDir) : null;
}

function hideNotice() {
  els.notice.hidden = true;
}

ipc.onBatchEvent((ev) => {
  const item = ev.id ? state.items.get(ev.id) : null;
  const run = state.run;

  switch (ev.type) {
    case 'item-start':
      if (item) {
        item.status = 'processing';
        item.stage = 'starting';
        updateCard(item);
        item.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      renderProgress();
      break;
    case 'item-stage':
      if (item) {
        item.stage = ev.stage;
        if (ev.stage === 'loading-model' && run) run.modelLoadedFor = item.id;
        updateCard(item);
      }
      break;
    case 'item-done':
      if (run) {
        run.done++;
        // czas ładowania modelu zawyżyłby szacunek pozostałego czasu
        if (run.modelLoadedFor !== ev.id) run.durations.push(ev.ms);
      }
      if (item) {
        item.status = 'done';
        item.output = ev.output;
        item.outBytes = ev.bytes;
        const img = item.el.querySelector('.img-result');
        const reveal = () => {
          item.el.classList.add('just-done');
          updateCard(item);
          setTimeout(() => item.el.classList.remove('just-done'), 800);
        };
        if (ev.thumb) {
          img.onload = reveal;
          img.src = ev.thumb;
        } else {
          reveal();
        }
      }
      renderProgress();
      break;
    case 'item-error':
      if (run) run.failed++;
      if (item) {
        item.status = 'error';
        item.error = friendlyError(ev.message);
        updateCard(item);
      }
      renderProgress();
      break;
    case 'item-cancelled':
      if (item) {
        item.status = 'pending';
        updateCard(item);
      }
      break;
    case 'finished': {
      state.running = false;
      for (const it of state.items.values()) {
        if (it.status === 'queued' || it.status === 'processing') {
          it.status = 'pending';
          updateCard(it);
        }
      }
      renderList();
      renderProgress();
      if (ev.fatal) {
        showNotice(friendlyError(ev.fatal), 'error', null);
      } else if (ev.cancelled) {
        showNotice(`Zatrzymano. Zapisano ${photos(ev.ok)}.`, 'info', ev.ok ? ev.outputDir : null);
      } else if (ev.failed) {
        showNotice(`Zapisano ${photos(ev.ok)}. Nie udało się: ${ev.failed}. Szczegóły są na kartach zdjęć.`, 'error', ev.ok ? ev.outputDir : null);
      } else {
        showNotice(`Gotowe. Zapisano ${photos(ev.ok)} w folderze „${splitPath(ev.outputDir).name}”.`, 'ok', ev.outputDir);
      }
      state.run = null;
      break;
    }
    default:
      break;
  }
});

els.startBtn.addEventListener('click', startBatch);
els.stopBtn.addEventListener('click', () => ipc.cancelBatch());

/* ---------- dodawanie plików ---------- */

async function pickFiles() {
  addPaths(await ipc.pickFiles());
}
els.pickBtn.addEventListener('click', pickFiles);
els.addBtn.addEventListener('click', pickFiles);
els.clearBtn.addEventListener('click', clearItems);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    pickFiles();
  }
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  els.dropzone.classList.add('is-active');
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.dropzone.classList.remove('is-active');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropzone.classList.remove('is-active');
  const paths = [...(e.dataTransfer?.files || [])].map((f) => ipc.pathForFile(f)).filter(Boolean);
  addPaths(paths);
});

/* ---------- start ---------- */

(async () => {
  const [settings, model, info] = await Promise.all([ipc.getSettings(), ipc.modelStatus(), ipc.appInfo()]);
  state.settings = settings;
  state.home = info.home;
  state.platform = info.platform;
  state.modelReady = model.ready;
  state.modelName = model.name;
  renderSettings();
  renderList();
})();
