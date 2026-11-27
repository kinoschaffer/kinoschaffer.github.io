import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);
const Native = window.Android || null; // puente Java (sólo en la APK)

const UNITS = { 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 8: 'µin', 9: 'mil', 10: 'yd', 11: 'Å', 12: 'nm', 13: 'µm', 14: 'dm', 15: 'dam', 16: 'hm', 17: 'Gm', 18: 'UA', 19: 'al', 20: 'pc' };

const canvas = $('cv');
const R = new Renderer(canvas);
let data = null;
let ext = null;
let fitScale = 1, minScale = 1e-9, maxScale = 1e9;
let currentFile = null;

// ---------------------------------------------------------------- utilidades
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function loading(on, text) {
  $('loading').classList.toggle('hidden', !on);
  if (text) $('loadingText').textContent = text;
}
function fmt(v, digits = 4) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  let d = digits;
  if (a !== 0 && a < 1) d = Math.min(12, digits + Math.ceil(-Math.log10(a)));
  return v.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: d });
}
const unitLabel = () => (data && UNITS[data.units]) || '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- recientes
const RKEY = 'dwgvisor.recent';
function getRecent() { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch (e) { return []; } }
function setRecent(list) { try { localStorage.setItem(RKEY, JSON.stringify(list.slice(0, 20))); } catch (e) { /* */ } }
function addRecent(name, uri) {
  if (!uri) return;
  const list = getRecent().filter((r) => r.uri !== uri);
  list.unshift({ name, uri, t: Date.now() });
  setRecent(list);
}
function renderRecent() {
  const list = Native ? getRecent() : [];
  const ul = $('recentList');
  ul.innerHTML = '';
  $('recentEmpty').classList.toggle('hidden', list.length > 0);
  $('recentTitle').classList.toggle('hidden', !Native);
  if (!Native) $('recentEmpty').classList.add('hidden');
  for (const r of list) {
    const li = document.createElement('li');
    const ext = (r.name.split('.').pop() || '').toLowerCase();
    const when = new Date(r.t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
    li.innerHTML = `<div class="ext ${ext === 'dxf' ? 'dxf' : ''}">${esc(ext.toUpperCase() || 'CAD')}</div><div class="meta"><div class="name">${esc(r.name)}</div><div class="when">${esc(when)}</div></div><button class="del" aria-label="Quitar">✕</button>`;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.del')) {
        setRecent(getRecent().filter((x) => x.uri !== r.uri));
        renderRecent();
        return;
      }
      loading(true, 'Abriendo…');
      Native.openUri(r.uri);
    });
    ul.appendChild(li);
  }
}

// ---------------------------------------------------------------- carga
let worker = null;
function getWorker() {
  if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  return worker;
}

let useWorker = true;

// Plan B: procesar en el hilo principal si el Worker no puede cargar el motor
async function openOnMainThread(buffer, name, uri) {
  loading(true, 'Cargando motor DWG…');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const { processFile } = await import('./core.js');
    const d = await processFile(buffer, (t) => loading(true, t));
    loading(false);
    showDrawing(d, name);
    if (uri) addRecent(name, uri);
    return true;
  } catch (e) {
    loading(false);
    toast('Error: ' + (e.message || e), 5000);
    return false;
  }
}

function openBuffer(buffer, name, uri) {
  loading(true, 'Preparando…');
  if (!useWorker) return openOnMainThread(buffer, name, uri);
  let w;
  try { w = getWorker(); } catch (e) { useWorker = false; return openOnMainThread(buffer, name, uri); }
  const copy = buffer.slice(0);
  return new Promise((resolve) => {
    let settled = false, alive = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      useWorker = false;
      try { w.terminate(); } catch (e) { /* */ }
      worker = null;
      openOnMainThread(buffer, name, uri).then(resolve);
    };
    const timer = setTimeout(() => { if (!alive) fallback(); }, 6000);
    w.onmessage = (ev) => {
      const m = ev.data;
      alive = true;
      if (settled) return;
      if (m.type === 'progress') loading(true, m.text);
      else if (m.type === 'error') {
        if (m.stage === 'init') { fallback(); return; }
        settled = true; clearTimeout(timer);
        loading(false);
        toast('Error: ' + m.message, 5000);
        resolve(false);
      } else if (m.type === 'done') {
        settled = true; clearTimeout(timer);
        loading(false);
        showDrawing(m.data, name);
        if (uri) addRecent(name, uri);
        resolve(true);
      }
    };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); fallback(); };
    w.postMessage({ type: 'open', buffer: copy, name }, [copy]);
  });
}

// Llamado desde Java cuando el usuario elige o comparte un archivo
window.onNativeFile = async (name, uri) => {
  try {
    loading(true, 'Leyendo archivo…');
    const res = await fetch('/__file__/current?' + Date.now());
    if (!res.ok) throw new Error('No se pudo leer el archivo');
    const buf = await res.arrayBuffer();
    await openBuffer(buf, name || 'plano.dwg', uri);
  } catch (e) {
    loading(false);
    toast(String(e.message || e), 5000);
  }
};
window.onNativeError = (msg) => { loading(false); toast(msg, 4000); };
window.onNativeCancel = () => loading(false);

$('btnOpen').addEventListener('click', () => {
  if (Native) { Native.openPicker(); return; }
  $('fileInput').click();
});
$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  e.target.value = '';
  openBuffer(buf, f.name, null);
});
$('btnSample').addEventListener('click', async () => {
  loading(true, 'Cargando ejemplo…');
  try {
    const res = await fetch('samples/ejemplo.dwg');
    openBuffer(await res.arrayBuffer(), 'ejemplo.dwg', null);
  } catch (e) { loading(false); toast('No se pudo cargar el ejemplo'); }
});

// ---------------------------------------------------------------- visor
function showScreen(id) {
  $('home').classList.toggle('hidden', id !== 'home');
  $('viewer').classList.toggle('hidden', id !== 'viewer');
  if (id === 'home') renderRecent();
}

function showDrawing(d, name) {
  data = d;
  currentFile = name;
  ext = d.ext;
  R.setData(d);
  $('fileName').textContent = name;
  const n = d.prims.length;
  $('fileInfo').textContent = `${d.kind.toUpperCase()} · ${n.toLocaleString('es')} objetos${unitLabel() ? ' · ' + unitLabel() : ''}`;
  showScreen('viewer');
  stopMeasure();
  resize();
  fit();
  buildLayers();
  buildInfo();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  R.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  requestDraw();
}
window.addEventListener('resize', resize);

// Área útil (sin barras superiores/inferiores) en píxeles del dispositivo
function usable() {
  const dpr = R.dpr;
  const top = 52 * dpr, bottom = 64 * dpr;
  return { top, bottom, w: R.W, h: R.H - top - bottom };
}

function fit() {
  if (!ext) return;
  const u = usable();
  const w = Math.max(ext[2] - ext[0], 1e-9), h = Math.max(ext[3] - ext[1], 1e-9);
  const s = Math.min(u.w / w, u.h / h) * 0.92;
  fitScale = s;
  const maxAbs = Math.max(Math.abs(ext[0]), Math.abs(ext[1]), Math.abs(ext[2]), Math.abs(ext[3]), w, h);
  // límite de precisión de doble: 1 px >= ~0.05 px de error
  maxScale = 2e14 / maxAbs;
  minScale = s / 1e4;
  R.view.s = s;
  R.view.cx = (ext[0] + ext[2]) / 2;
  // centrar en el área útil
  R.view.cy = (ext[1] + ext[3]) / 2 - ((u.top - u.bottom) / 2) / s;
  requestDraw();
}

let drawPending = false, drawFast = false, fullTimer = 0;
function requestDraw(fast) {
  drawFast = drawFast || !!fast;
  if (!fast) drawFast = false;
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    const f = drawFast;
    drawFast = false;
    R.draw(f);
    updateZoomChip();
  });
  if (fast) {
    clearTimeout(fullTimer);
    fullTimer = setTimeout(() => requestDraw(false), 160);
  }
}

function updateZoomChip() {
  const z = R.view.s / fitScale;
  let txt;
  if (z >= 1e6) txt = '×' + z.toExponential(1).replace('e+', 'e');
  else if (z >= 10) txt = '×' + Math.round(z).toLocaleString('es');
  else txt = '×' + z.toFixed(z < 1 ? 2 : 1);
  $('zoomChip').textContent = txt;
}

function zoomAt(sx, sy, factor) {
  // sx, sy en píxeles del dispositivo
  const v = R.view;
  const wx = v.cx + (sx - R.W / 2) / v.s, wy = v.cy - (sy - R.H / 2) / v.s;
  const ns = Math.min(maxScale, Math.max(minScale, v.s * factor));
  v.s = ns;
  v.cx = wx - (sx - R.W / 2) / ns;
  v.cy = wy + (sy - R.H / 2) / ns;
}
function screenToWorld(sx, sy) {
  const v = R.view;
  return [v.cx + (sx - R.W / 2) / v.s, v.cy - (sy - R.H / 2) / v.s];
}
function worldToScreen(x, y) {
  const v = R.view;
  return [(x - v.cx) * v.s + R.W / 2, R.H / 2 - (y - v.cy) * v.s];
}

// ---------------------------------------------------------------- gestos
const ptrs = new Map();
let gesture = null; // {type:'pan'|'pinch', ...}
let lastTap = null;
let fling = null;

function devXY(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * R.dpr, (e.clientY - r.top) * R.dpr];
}

function startPan(id) {
  const p = ptrs.get(id);
  gesture = { type: 'pan', id, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: false, hist: [] };
}
function startPinch() {
  const [a, b] = [...ptrs.values()];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const w = screenToWorld(mx, my);
  gesture = { type: 'pinch', d0: d, s0: R.view.s, wx: w[0], wy: w[1] };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = devXY(e);
  ptrs.set(e.pointerId, { x, y });
  fling = null;
  if (ptrs.size === 1) startPan(e.pointerId);
  else if (ptrs.size === 2) startPinch();
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) {
    if (e.pointerType === 'mouse') hover(e);
    return;
  }
  const [x, y] = devXY(e);
  ptrs.set(e.pointerId, { x, y });
  if (!gesture) return;
  const v = R.view;
  if (gesture.type === 'pan' && e.pointerId === gesture.id) {
    const dx = x - gesture.x, dy = y - gesture.y;
    gesture.x = x; gesture.y = y;
    if (!gesture.moved && Math.hypot(x - gesture.sx, y - gesture.sy) > 10 * R.dpr) gesture.moved = true;
    if (gesture.moved) {
      v.cx -= dx / v.s; v.cy += dy / v.s;
      const now = performance.now();
      gesture.hist.push([now, x, y]);
      while (gesture.hist.length && now - gesture.hist[0][0] > 100) gesture.hist.shift();
      requestDraw(true);
    }
  } else if (gesture.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const ns = Math.min(maxScale, Math.max(minScale, gesture.s0 * d / gesture.d0));
    v.s = ns;
    v.cx = gesture.wx - (mx - R.W / 2) / ns;
    v.cy = gesture.wy + (my - R.H / 2) / ns;
    requestDraw(true);
  }
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  const [x, y] = devXY(e);
  const g = gesture;
  ptrs.delete(e.pointerId);
  if (ptrs.size === 1) { startPan([...ptrs.keys()][0]); gesture.moved = true; return; }
  if (ptrs.size >= 2) { startPinch(); return; }
  gesture = null;
  if (g && g.type === 'pan') {
    if (!g.moved && performance.now() - g.t < 500) { onTap(x, y); return; }
    // inercia
    if (g.hist.length >= 2) {
      const [t0, x0, y0] = g.hist[0], [t1, x1, y1] = g.hist[g.hist.length - 1];
      const dt = t1 - t0;
      if (dt > 0 && performance.now() - t1 < 60) {
        fling = { vx: (x1 - x0) / dt, vy: (y1 - y0) / dt, t: performance.now() };
        if (Math.hypot(fling.vx, fling.vy) > 0.3 * R.dpr) requestAnimationFrame(stepFling);
        else fling = null;
      }
    }
  }
  requestDraw(false);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function stepFling() {
  if (!fling) return;
  const now = performance.now();
  const dt = Math.min(40, now - fling.t);
  fling.t = now;
  const v = R.view;
  v.cx -= fling.vx * dt / v.s; v.cy += fling.vy * dt / v.s;
  const k = Math.pow(0.994, dt);
  fling.vx *= k; fling.vy *= k;
  if (Math.hypot(fling.vx, fling.vy) < 0.02 * R.dpr) { fling = null; requestDraw(false); return; }
  requestDraw(true);
  requestAnimationFrame(stepFling);
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [x, y] = devXY(e);
  zoomAt(x, y, Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)));
  requestDraw(true);
}, { passive: false });

function onTap(x, y) {
  if (measure.mode) { measureTap(x, y); return; }
  const now = performance.now();
  if (lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40 * R.dpr) {
    lastTap = null;
    animateZoom(x, y, 2.5);
    return;
  }
  lastTap = { t: now, x, y };
}

function animateZoom(x, y, factor) {
  const steps = 10;
  let i = 0;
  const f = Math.pow(factor, 1 / steps);
  const tick = () => {
    zoomAt(x, y, f);
    i++;
    if (i < steps) { requestDraw(true); requestAnimationFrame(tick); } else requestDraw(false);
  };
  requestAnimationFrame(tick);
}

function hover(e) {
  if (measure.mode !== 'coord') return;
}

// ---------------------------------------------------------------- medición
const measure = { mode: null, pts: [], snapOn: true, hot: null };

function findSnap(x, y) {
  if (!data || !measure.snapOn) return null;
  const sn = data.snaps;
  const r = 26 * R.dpr / R.view.s;
  const [wx, wy] = screenToWorld(x, y);
  let best = -1, bd = r * r;
  for (let i = 0; i < sn.length; i += 2) {
    const dx = sn[i] - wx;
    if (dx > r || dx < -r) continue;
    const dy = sn[i + 1] - wy;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best >= 0 ? [sn[best], sn[best + 1]] : null;
}

function measureTap(x, y) {
  const s = findSnap(x, y);
  const p = s || screenToWorld(x, y);
  if (measure.mode === 'dist' && measure.pts.length >= 2) measure.pts = [];
  if (measure.mode === 'coord') measure.pts = [];
  measure.pts.push({ x: p[0], y: p[1], snapped: !!s });
  updateMeasure();
  requestDraw(false);
}

function startMeasure(mode) {
  if (measure.mode === mode) { stopMeasure(); return; }
  closeSheets();
  measure.mode = mode;
  measure.pts = [];
  $('measurePanel').classList.remove('hidden');
  $('mTitle').textContent = mode === 'dist' ? 'Distancia' : mode === 'area' ? 'Área' : 'Coordenadas';
  $('mHint').textContent = mode === 'dist' ? 'Toca dos puntos' : mode === 'area' ? 'Toca los vértices del contorno' : 'Toca un punto';
  for (const id of ['tDist', 'tArea', 'tCoord']) $(id).classList.remove('on');
  $({ dist: 'tDist', area: 'tArea', coord: 'tCoord' }[mode]).classList.add('on');
  updateMeasure();
  requestDraw(false);
}
function stopMeasure() {
  measure.mode = null;
  measure.pts = [];
  $('measurePanel').classList.add('hidden');
  for (const id of ['tDist', 'tArea', 'tCoord']) $(id).classList.remove('on');
  requestDraw(false);
}

function row(k, v, big) { return `<span class="k">${k}</span><span class="v ${big ? 'big' : ''}">${v}</span>`; }

function updateMeasure() {
  const u = unitLabel();
  const us = u ? ' ' + u : '';
  const P = measure.pts;
  let html = '';
  if (measure.mode === 'dist') {
    if (P.length < 2) html = row('Puntos', `${P.length} / 2`);
    else {
      const dx = P[1].x - P[0].x, dy = P[1].y - P[0].y;
      const d = Math.hypot(dx, dy);
      let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang < 0) ang += 360;
      html = row('Distancia', fmt(d) + us, true) + row('ΔX', fmt(dx) + us) + row('ΔY', fmt(dy) + us) + row('Ángulo', fmt(ang, 3) + '°');
    }
  } else if (measure.mode === 'area') {
    let a = 0, per = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      a += p.x * q.y - q.x * p.y;
      if (i < P.length - 1 || P.length > 2) per += Math.hypot(q.x - p.x, q.y - p.y);
    }
    a = Math.abs(a) / 2;
    html = row('Área', P.length >= 3 ? fmt(a) + (u ? ' ' + u + '²' : '') : '—', true) + row('Perímetro', P.length >= 2 ? fmt(per) + us : '—') + row('Vértices', P.length);
  } else if (measure.mode === 'coord') {
    if (P.length) html = row('X', fmt(P[0].x, 6), true) + row('Y', fmt(P[0].y, 6), true);
    else html = row('Punto', '—');
  }
  $('mResult').innerHTML = html;
}

R.overlay = (ctx) => {
  if (!measure.mode || !measure.pts.length) return;
  const P = measure.pts.map((p) => worldToScreen(p.x, p.y));
  const dpr = R.dpr;
  ctx.save();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = '#f59e0b';
  ctx.fillStyle = 'rgba(245, 158, 11, .18)';
  if (P.length >= 2) {
    // recorte simple: el canvas maneja bien coordenadas moderadas; limitamos las extremas
    const lim = (v) => Math.max(-1e6, Math.min(1e6, v));
    ctx.beginPath();
    ctx.moveTo(lim(P[0][0]), lim(P[0][1]));
    for (let i = 1; i < P.length; i++) ctx.lineTo(lim(P[i][0]), lim(P[i][1]));
    if (measure.mode === 'area' && P.length >= 3) { ctx.closePath(); ctx.fill(); }
    ctx.setLineDash([8 * dpr, 5 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  measure.pts.forEach((p, i) => {
    const [x, y] = P[i];
    if (x < -50 || y < -50 || x > R.W + 50 || y > R.H + 50) return;
    ctx.beginPath();
    if (p.snapped) { ctx.strokeStyle = '#22d3ee'; ctx.rect(x - 6 * dpr, y - 6 * dpr, 12 * dpr, 12 * dpr); }
    else { ctx.strokeStyle = '#f59e0b'; ctx.moveTo(x - 8 * dpr, y); ctx.lineTo(x + 8 * dpr, y); ctx.moveTo(x, y - 8 * dpr); ctx.lineTo(x, y + 8 * dpr); }
    ctx.stroke();
  });
  ctx.restore();
};

$('tDist').addEventListener('click', () => startMeasure('dist'));
$('tArea').addEventListener('click', () => startMeasure('area'));
$('tCoord').addEventListener('click', () => startMeasure('coord'));
$('mClose').addEventListener('click', stopMeasure);
$('mClear').addEventListener('click', () => { measure.pts = []; updateMeasure(); requestDraw(false); });
$('mUndo').addEventListener('click', () => { measure.pts.pop(); updateMeasure(); requestDraw(false); });
$('mSnap').addEventListener('change', (e) => { measure.snapOn = e.target.checked; });

// ---------------------------------------------------------------- capas
function buildLayers() {
  const ul = $('layerList');
  ul.innerHTML = '';
  const order = data.layers.map((l, i) => i).filter((i) => data.layers[i].count > 0 || data.layers[i].name === '0');
  order.sort((a, b) => data.layers[a].name.localeCompare(data.layers[b].name, 'es', { numeric: true }));
  for (const i of order) {
    const l = data.layers[i];
    const li = document.createElement('li');
    const col = R.css(l.color);
    li.innerHTML = `<span class="sw" style="background:${col}"></span><span class="ln">${esc(l.name)}</span><span class="cnt">${l.count}</span><span class="tog"></span>`;
    const sync = () => { li.classList.toggle('on', !!R.layerVis[i]); li.classList.toggle('off', !R.layerVis[i]); };
    sync();
    li.addEventListener('click', () => { R.layerVis[i] = !R.layerVis[i]; sync(); requestDraw(false); });
    li._sync = sync;
    ul.appendChild(li);
  }
}
function setAllLayers(v) {
  R.layerVis = R.layerVis.map(() => v);
  for (const li of $('layerList').children) li._sync();
  requestDraw(false);
}
$('tLayers').addEventListener('click', () => toggleSheet('layersSheet'));
$('lClose').addEventListener('click', closeSheets);
$('lAll').addEventListener('click', () => setAllLayers(true));
$('lNone').addEventListener('click', () => setAllLayers(false));

function toggleSheet(id) {
  const el = $(id);
  const open = el.classList.contains('hidden');
  closeSheets();
  if (open) el.classList.remove('hidden');
  $('tLayers').classList.toggle('on', open && id === 'layersSheet');
}
function closeSheets() {
  let closed = false;
  for (const id of ['layersSheet', 'infoSheet']) {
    if (!$(id).classList.contains('hidden')) closed = true;
    $(id).classList.add('hidden');
  }
  $('tLayers').classList.remove('on');
  return closed;
}

// ---------------------------------------------------------------- info
function buildInfo() {
  const d = data;
  const w = ext[2] - ext[0], h = ext[3] - ext[1];
  const u = unitLabel();
  const rows = Object.entries(d.stats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const unsupported = rows.filter(([k]) => k.startsWith('('));
  const ok = rows.filter(([k]) => !k.startsWith('('));
  $('infoBody').innerHTML = `
    <table>
      <tr><td>Archivo</td><td>${esc(currentFile)}</td></tr>
      <tr><td>Formato</td><td>${d.kind.toUpperCase()}${d.version ? ' (' + esc(d.version) + ')' : ''}</td></tr>
      <tr><td>Unidades</td><td>${u || 'sin unidad'}</td></tr>
      <tr><td>Tamaño</td><td>${fmt(w)} × ${fmt(h)} ${u}</td></tr>
      <tr><td>Primitivas dibujadas</td><td>${d.prims.length.toLocaleString('es')}</td></tr>
      <tr><td>Capas</td><td>${d.layers.length}</td></tr>
      <tr><td>Lectura / geometría</td><td>${d.timing.parse} ms / ${d.timing.geom} ms</td></tr>
    </table>
    <h3>Entidades</h3>
    <table>${ok.map(([k, n]) => `<tr><td>${esc(k)}</td><td>${n.toLocaleString('es')}</td></tr>`).join('')}</table>
    ${unsupported.length ? `<h3>No dibujadas</h3><table>${unsupported.map(([k, n]) => `<tr><td>${esc(k)}</td><td>${n}</td></tr>`).join('')}</table>` : ''}
    <p>Se muestra el espacio modelo. Las fuentes SHX se sustituyen por una fuente del sistema.</p>`;
}
$('btnInfo').addEventListener('click', () => toggleSheet('infoSheet'));
$('iClose').addEventListener('click', closeSheets);
$('oLw').addEventListener('change', (e) => { R.showLw = e.target.checked; requestDraw(false); });

// ---------------------------------------------------------------- otros
$('tFit').addEventListener('click', () => fit());
$('tBg').addEventListener('click', () => {
  R.dark = !R.dark;
  R.colorCache.clear();
  $('viewer').classList.toggle('light', !R.dark);
  $('viewer').style.background = R.bgCss;
  try { localStorage.setItem('dwgvisor.dark', R.dark ? '1' : '0'); } catch (e) { /* */ }
  if (data) buildLayers();
  requestDraw(false);
});
try { if (localStorage.getItem('dwgvisor.dark') === '0') { R.dark = false; $('viewer').classList.add('light'); $('viewer').style.background = R.bgCss; } } catch (e) { /* */ }

$('btnBack').addEventListener('click', () => goHome());
function goHome() {
  closeSheets();
  stopMeasure();
  showScreen('home');
}

// Botón "atrás" de Android: devuelve true si se ha gestionado
window.onBack = () => {
  if (!$('loading').classList.contains('hidden')) return true;
  if (closeSheets()) return true;
  if (measure.mode) { stopMeasure(); return true; }
  if (!$('viewer').classList.contains('hidden')) { goHome(); return true; }
  return false;
};

renderRecent();
if (Native && Native.ready) Native.ready();

// Acceso para depuración
window.__visor = { get data() { return data; }, R, fit, requestDraw };
