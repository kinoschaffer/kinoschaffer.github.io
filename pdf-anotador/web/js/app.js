import { Viewer, openPdf } from './viewer.js';
import { COLORS, newId, drawAnnots, drawAnnot, hitDist, simplify, exportPdf, PT_MM, lengthLabel, fmtNum } from './annot.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const Native = window.Android || null;

const canvas = $('cv');
const V = new Viewer(canvas);
const TOP = 52, BOTTOM = 64; // alturas de barras (px CSS)

const state = {
  pdf: null, bytes: null, name: '', key: '', pageIndex: 0,
  annots: {}, calib: null,
  undo: [], redo: [],
  tool: 'pan', color: 0, width: 2,
  draft: null, area: null, loupe: null,
};

// ---------------------------------------------------------------- utilidades
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function loading(on, text) {
  $('loading').classList.toggle('hidden', !on);
  if (text) $('loadingText').textContent = text;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dpr = () => V.dpr;

// ---------------------------------------------------------------- recientes
const RKEY = 'pdfanot.recent';
const getRecent = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch (e) { return []; } };
const setRecent = (l) => { try { localStorage.setItem(RKEY, JSON.stringify(l.slice(0, 20))); } catch (e) { /* */ } };
function addRecent(name, uri) {
  if (!uri) return;
  setRecent([{ name, uri, t: Date.now() }, ...getRecent().filter((r) => r.uri !== uri)]);
}
function renderRecent() {
  const list = Native ? getRecent() : [];
  const ul = $('recentList');
  ul.innerHTML = '';
  $('recentTitle').classList.toggle('hidden', !list.length);
  $('recentEmpty').classList.toggle('hidden', list.length > 0);
  for (const r of list) {
    const li = document.createElement('li');
    const when = new Date(r.t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
    li.innerHTML = `<div class="ext">PDF</div><div class="meta"><div class="name">${esc(r.name)}</div><div class="when">${esc(when)}</div></div><button class="del" aria-label="Quitar">✕</button>`;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.del')) { setRecent(getRecent().filter((x) => x.uri !== r.uri)); renderRecent(); return; }
      loading(true, 'Abriendo…');
      Native.openUri(r.uri);
    });
    ul.appendChild(li);
  }
}

// ---------------------------------------------------------------- abrir
async function openBytes(buf, name, uri) {
  loading(true, 'Abriendo PDF…');
  try {
    const bytes = new Uint8Array(buf);
    const pdf = await openPdf(bytes.slice());
    if (state.pdf) { try { state.pdf.destroy(); } catch (e) { /* */ } }
    state.pdf = pdf;
    state.bytes = bytes;
    state.name = name;
    state.key = (pdf.fingerprints && pdf.fingerprints[0]) || name + ':' + bytes.length;
    const saved = await store.load(state.key);
    state.annots = (saved && saved.annots) || {};
    state.calib = (saved && saved.calib) || null;
    state.undo = []; state.redo = [];
    state.pageIndex = Math.min((saved && saved.page) || 0, pdf.numPages - 1);
    $('fileName').textContent = name;
    showScreen('viewer');
    resize();
    await gotoPage(state.pageIndex, true);
    setTool('pan');
    if (uri) addRecent(name, uri);
    const n = countAnnots();
    if (n) toast(`${n} anotación${n === 1 ? '' : 'es'} recuperada${n === 1 ? '' : 's'}`);
  } catch (e) {
    console.error(e);
    toast('No se pudo abrir el PDF: ' + (e.message || e), 5000);
    showScreen('home');
  } finally {
    loading(false);
  }
}
const countAnnots = () => Object.values(state.annots).reduce((a, l) => a + (l ? l.length : 0), 0);

window.onNativeFile = async (name, uri) => {
  try {
    loading(true, 'Leyendo archivo…');
    const res = await fetch('/__file__/current?' + Date.now());
    if (!res.ok) throw new Error('No se pudo leer el archivo');
    await openBytes(await res.arrayBuffer(), name || 'documento.pdf', uri);
  } catch (e) { loading(false); toast(String(e.message || e), 5000); }
};
window.onNativeError = (m) => { loading(false); toast(m, 4000); };
window.onNativeCancel = () => loading(false);
window.onSaved = (ok, msg) => { loading(false); toast(ok ? 'PDF guardado' + (msg ? ': ' + msg : '') : (msg || 'No se guardó')); };

$('btnOpen').addEventListener('click', () => { if (Native) Native.openPicker(); else $('fileInput').click(); });
$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  e.target.value = '';
  openBytes(buf, f.name, null);
});
$('btnSample').addEventListener('click', async () => {
  loading(true, 'Cargando ejemplo…');
  try { const r = await fetch('samples/plano-ejemplo.pdf'); await openBytes(await r.arrayBuffer(), 'plano-ejemplo.pdf', null); }
  catch (e) { loading(false); toast('No se pudo cargar el ejemplo'); }
});

// ---------------------------------------------------------------- pantallas y páginas
function showScreen(id) {
  $('home').classList.toggle('hidden', id !== 'home');
  $('viewer').classList.toggle('hidden', id !== 'viewer');
  if (id === 'home') renderRecent();
}

async function gotoPage(i, fit) {
  const pdf = state.pdf;
  if (!pdf || i < 0 || i >= pdf.numPages) return;
  cancelDrafts();
  state.pageIndex = i;
  $('pageNav').classList.toggle('hidden', pdf.numPages < 2);
  $('pLabel').textContent = `${i + 1} / ${pdf.numPages}`;
  $('fileInfo').textContent = `Página ${i + 1} de ${pdf.numPages}${state.calib ? ' · escala ' + state.calib.label : ''}`;
  const page = await pdf.getPage(i + 1);
  // primer dibujo: encuadre inmediato, el bitmap llega cuando termina pdf.js
  V.page = page; V.vp1 = page.getViewport({ scale: 1 });
  if (fit) V.fit(TOP * dpr(), BOTTOM * dpr());
  loading(true, 'Dibujando página…');
  try { await V.setPage(page); } finally { loading(false); }
  if (fit) V.fit(TOP * dpr(), BOTTOM * dpr());
  persist();
}
$('pPrev').addEventListener('click', () => gotoPage(state.pageIndex - 1, true));
$('pNext').addEventListener('click', () => gotoPage(state.pageIndex + 1, true));

function resize() {
  V.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
}
window.addEventListener('resize', resize);

V.onRedraw = () => updateZoom();
function updateZoom() {
  if (!V.vp1) return;
  const z = V.view.s / V.fitScale(TOP * dpr(), BOTTOM * dpr());
  $('zoomChip').textContent = z >= 100 ? '×' + Math.round(z).toLocaleString('es') : Math.round(z * 100) + '%';
}

// ---------------------------------------------------------------- anotaciones
const pageList = () => (state.annots[state.pageIndex] || (state.annots[state.pageIndex] = []));

let persistTimer = 0;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!state.key) return;
    store.save(state.key, { annots: state.annots, calib: state.calib, name: state.name, page: state.pageIndex, t: Date.now() });
  }, 300);
}

function addAnnot(a) {
  const list = pageList();
  list.push(a);
  state.undo.push({ op: 'add', page: state.pageIndex, a });
  state.redo = [];
  changed();
}
function removeAnnot(a) {
  const list = pageList();
  const i = list.indexOf(a);
  if (i < 0) return;
  list.splice(i, 1);
  state.undo.push({ op: 'del', page: state.pageIndex, a, i });
  state.redo = [];
  changed();
}
function changed() {
  persist();
  updateUndo();
  V.requestDraw();
}
function updateUndo() {
  $('btnUndo').disabled = !state.undo.length;
  $('btnRedo').disabled = !state.redo.length;
  $('btnUndo').style.opacity = state.undo.length ? 1 : 0.35;
  $('btnRedo').style.opacity = state.redo.length ? 1 : 0.35;
}
function applyOp(op, inverse) {
  const list = state.annots[op.page] || (state.annots[op.page] = []);
  const add = (op.op === 'add') !== inverse;
  if (op.op === 'calib') { state.calib = inverse ? op.before : op.after; refreshInfo(); return; }
  if (add) { if (op.op === 'del') list.splice(Math.min(op.i, list.length), 0, op.a); else list.push(op.a); }
  else { const i = list.indexOf(op.a); if (i >= 0) list.splice(i, 1); }
}
async function undo() {
  const op = state.undo.pop(); if (!op) return;
  if (op.page !== undefined && op.page !== state.pageIndex) await gotoPage(op.page, false);
  applyOp(op, true); state.redo.push(op); changed();
}
async function redo() {
  const op = state.redo.pop(); if (!op) return;
  if (op.page !== undefined && op.page !== state.pageIndex) await gotoPage(op.page, false);
  applyOp(op, false); state.undo.push(op); changed();
}
$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);

// ---------------------------------------------------------------- herramientas
const WIDTH_PX = { ink: [0, 1.5, 3, 6], hl: [0, 10, 18, 28], shape: [0, 1.5, 3, 5], text: [0, 14, 20, 30] };
const HINTS = {
  pan: '',
  ink: 'Dibuja con un dedo · dos dedos para mover y ampliar',
  hl: 'Resalta con un dedo · dos dedos para mover y ampliar',
  line: 'Arrastra para trazar una línea', arrow: 'Arrastra para trazar una flecha',
  rect: 'Arrastra para dibujar un rectángulo', ellipse: 'Arrastra para dibujar una elipse',
  cloud: 'Arrastra para marcar una nube de revisión', text: 'Toca donde quieras poner el texto',
  dist: 'Arrastra entre dos puntos para medir', area: 'Toca los vértices del área',
  calib: 'Dibuja una línea sobre una medida conocida (por ejemplo, una cota)',
  erase: 'Toca o pasa el dedo sobre una anotación para borrarla',
};

function setTool(t) {
  cancelDrafts();
  state.tool = t;
  for (const b of $('toolbar').children) b.classList.toggle('on', b.dataset.tool === t);
  const showProps = !['pan', 'erase', 'calib'].includes(t);
  $('props').classList.toggle('hidden', !showProps);
  let h = HINTS[t] || '';
  if ((t === 'dist' || t === 'area') && !state.calib) h += ' · sin escala: medidas en papel (mm). Usa «Escala» para calibrar';
  else if ((t === 'dist' || t === 'area') && state.calib) h += ' · escala ' + state.calib.label;
  $('hint').textContent = h;
  $('hint').classList.toggle('hidden', !h);
  $('areaBar').classList.add('hidden');
  V.requestDraw();
}
for (const b of $('toolbar').children) {
  b.addEventListener('click', () => {
    if (b.dataset.tool === 'calib') { openCalib(null); return; }
    setTool(state.tool === b.dataset.tool && b.dataset.tool !== 'pan' ? 'pan' : b.dataset.tool);
  });
}
function buildProps() {
  const c = $('colors');
  c.innerHTML = '';
  COLORS.forEach((col, i) => {
    const b = document.createElement('button');
    b.style.background = col;
    b.setAttribute('aria-label', 'Color ' + (i + 1));
    b.addEventListener('click', () => { state.color = i; syncProps(); });
    c.appendChild(b);
  });
  for (const b of document.querySelectorAll('.widths button')) b.addEventListener('click', () => { state.width = +b.dataset.w; syncProps(); });
  syncProps();
}
function syncProps() {
  [...$('colors').children].forEach((b, i) => b.classList.toggle('on', i === state.color));
  for (const b of document.querySelectorAll('.widths button')) b.classList.toggle('on', +b.dataset.w === state.width);
  try { localStorage.setItem('pdfanot.props', JSON.stringify({ c: state.color, w: state.width })); } catch (e) { /* */ }
}
try { const p = JSON.parse(localStorage.getItem('pdfanot.props') || 'null'); if (p) { state.color = p.c; state.width = p.w; } } catch (e) { /* */ }
buildProps();

// grosor en puntos de página según el zoom actual (se ve igual al dibujarlo)
function widthPt(kind) { return (WIDTH_PX[kind] || WIDTH_PX.shape)[state.width] * dpr() / V.view.s; }
const labelSize = () => 12 * dpr() / V.view.s;

function cancelDrafts() {
  state.draft = null;
  state.area = null;
  state.loupe = null;
  $('areaBar').classList.add('hidden');
}

// ---------------------------------------------------------------- dibujo
V.overlay = (ctx) => {
  const list = state.annots[state.pageIndex];
  if (list && list.length) drawAnnots(ctx, list, V.view, dpr(), state.calib);
  if (state.draft) drawAnnot(ctx, state.draft, V.view, dpr(), state.calib);
  if (state.area) {
    drawAnnot(ctx, { ...state.area, open: true }, V.view, dpr(), state.calib);
    const p = state.area.pts;
    ctx.fillStyle = state.area.color;
    for (let i = 0; i < p.length; i += 2) {
      const [x, y] = V.toScreen(p[i], p[i + 1]);
      ctx.beginPath(); ctx.arc(x, y, (i ? 4 : 7) * dpr(), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (state.loupe) drawLoupe(ctx, state.loupe[0], state.loupe[1]);
};

// Lupa para colocar puntos con precisión
function drawLoupe(ctx, x, y) {
  const d = dpr(), r = 56 * d, zoom = 2.5;
  let cx = x, cy = y - 110 * d;
  if (cy - r < TOP * d) cy = y + 110 * d;
  const src = r / zoom;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, x - src, y - src, src * 2, src * 2, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2 * d;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1 * d;
  ctx.beginPath(); ctx.moveTo(cx - 12 * d, cy); ctx.lineTo(cx + 12 * d, cy); ctx.moveTo(cx, cy - 12 * d); ctx.lineTo(cx, cy + 12 * d); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- gestos
const ptrs = new Map();
let g = null; // gesto activo
let lastTap = null;

function devXY(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr()];
}
function startPinch() {
  const [a, b] = [...ptrs.values()];
  g = { type: 'pinch', mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

const DRAG_TOOLS = ['line', 'arrow', 'rect', 'ellipse', 'cloud', 'dist', 'calib'];
const LOUPE_TOOLS = ['line', 'arrow', 'dist', 'calib', 'area'];

canvas.addEventListener('pointerdown', (e) => {
  if (!state.pdf) return;
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = devXY(e);
  ptrs.set(e.pointerId, { x, y });
  if (ptrs.size === 2) {
    // segundo dedo: cancelar lo que se empezaba a dibujar y pasar a pellizco
    if (g && g.type === 'draw') state.draft = null;
    state.loupe = null;
    startPinch();
    V.requestDraw();
    return;
  }
  if (ptrs.size > 2) return;
  const t = state.tool;
  const [dx, dy] = V.toDoc(x, y);
  g = { type: 'tap', id: e.pointerId, sx: x, sy: y, x, y, t: performance.now(), moved: false };
  if (t === 'pan' || t === 'text') { g.type = 'pan'; return; }
  if (t === 'erase') { g.type = 'erase'; eraseAt(x, y); return; }
  if (t === 'area') { g.type = 'areaTap'; state.loupe = [x, y]; V.requestDraw(); return; }
  const color = COLORS[state.color];
  if (t === 'ink' || t === 'hl') {
    state.draft = { id: newId(), type: t, color: t === 'hl' && state.color === 0 ? '#facc15' : color, w: widthPt(t), pts: [dx, dy] };
    if (t === 'hl') state.draft.color = state.color === 0 ? '#facc15' : color;
  } else if (DRAG_TOOLS.includes(t)) {
    const type = t === 'calib' ? 'dist' : t;
    state.draft = { id: newId(), type, color: t === 'calib' ? '#0ea5e9' : color, w: t === 'dist' || t === 'calib' ? 1.2 * dpr() / V.view.s : widthPt('shape'), pts: [dx, dy, dx, dy], size: labelSize(), calibDraft: t === 'calib' };
    if (LOUPE_TOOLS.includes(t)) state.loupe = [x, y];
  }
  g.type = 'draw';
  V.requestDraw();
});

canvas.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const [x, y] = devXY(e);
  ptrs.set(e.pointerId, { x, y });
  if (!g) return;
  if (g.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    V.panBy(mx - g.mx, my - g.my);
    V.zoomAt(mx, my, d / g.d);
    g.mx = mx; g.my = my; g.d = d;
    updateZoom();
    return;
  }
  if (e.pointerId !== g.id) return;
  const ddx = x - g.x, ddy = y - g.y;
  g.x = x; g.y = y;
  if (!g.moved && Math.hypot(x - g.sx, y - g.sy) > 8 * dpr()) g.moved = true;
  if (g.type === 'pan') {
    if (g.moved) { V.panBy(ddx, ddy); }
  } else if (g.type === 'erase') {
    eraseAt(x, y);
  } else if (g.type === 'areaTap') {
    state.loupe = [x, y]; V.requestDraw();
  } else if (g.type === 'draw' && state.draft) {
    const [dx, dy] = V.toDoc(x, y);
    const p = state.draft.pts;
    if (state.draft.type === 'ink' || state.draft.type === 'hl') {
      const [lx, ly] = V.toScreen(p[p.length - 2], p[p.length - 1]);
      if (Math.hypot(x - lx, y - ly) >= 1.5 * dpr()) p.push(dx, dy);
    } else {
      p[2] = dx; p[3] = dy;
      if (state.loupe) state.loupe = [x, y];
    }
    V.requestDraw();
  }
});

function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  const [x, y] = devXY(e);
  ptrs.delete(e.pointerId);
  const gg = g;
  if (gg && gg.type === 'pinch') {
    if (ptrs.size === 1) { // queda un dedo: seguir moviendo sin dibujar
      const [id, p] = [...ptrs.entries()][0];
      g = { type: 'pan', id, sx: p.x, sy: p.y, x: p.x, y: p.y, t: 0, moved: true };
    } else if (ptrs.size === 0) g = null;
    return;
  }
  if (ptrs.size) return;
  g = null;
  if (!gg) return;
  state.loupe = null;
  const quick = performance.now() - gg.t < 450 && !gg.moved;
  if (gg.type === 'pan') {
    if (quick) onTap(x, y);
    V.requestDraw();
    return;
  }
  if (gg.type === 'areaTap') { areaTap(x, y); return; }
  if (gg.type === 'draw' && state.draft) finishDraft();
  V.requestDraw();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) { g = null; state.draft = null; state.loupe = null; V.requestDraw(); } });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [x, y] = devXY(e);
  V.zoomAt(x, y, Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)));
  updateZoom();
}, { passive: false });

function onTap(x, y) {
  if (state.tool === 'text') { openText(x, y); return; }
  const now = performance.now();
  if (lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40 * dpr()) {
    lastTap = null;
    animateZoom(x, y, 2.5);
    return;
  }
  lastTap = { t: now, x, y };
}
function animateZoom(x, y, factor) {
  let i = 0;
  const f = Math.pow(factor, 1 / 10);
  const tick = () => { V.zoomAt(x, y, f); updateZoom(); if (++i < 10) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function finishDraft() {
  const a = state.draft;
  state.draft = null;
  const p = a.pts;
  const s = V.view.s;
  if (a.type === 'ink' || a.type === 'hl') {
    a.pts = simplify(p, 0.35 * dpr() / s);
    addAnnot(a);
    return;
  }
  const lenPx = Math.hypot(p[2] - p[0], p[3] - p[1]) * s;
  if (lenPx < 6 * dpr()) return;
  if (a.calibDraft) { openCalib(Math.hypot(p[2] - p[0], p[3] - p[1])); return; }
  delete a.calibDraft;
  addAnnot(a);
}

function eraseAt(x, y) {
  const list = state.annots[state.pageIndex];
  if (!list || !list.length) return;
  const [dx, dy] = V.toDoc(x, y);
  const tol = 14 * dpr() / V.view.s;
  const ctx = V.ctx;
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitDist(list[i], dx, dy, ctx) <= tol) { removeAnnot(list[i]); return; }
  }
}

// área por puntos
function areaTap(x, y) {
  const [dx, dy] = V.toDoc(x, y);
  if (!state.area) {
    state.area = { id: newId(), type: 'area', color: COLORS[state.color], w: 1.5 * dpr() / V.view.s, size: labelSize(), pts: [] };
  }
  const p = state.area.pts;
  if (p.length >= 6) {
    const [fx, fy] = V.toScreen(p[0], p[1]);
    if (Math.hypot(fx - x, fy - y) < 22 * dpr()) { closeArea(); return; }
  }
  p.push(dx, dy);
  $('areaBar').classList.toggle('hidden', p.length < 2);
  V.requestDraw();
}
function closeArea() {
  const a = state.area;
  state.area = null;
  $('areaBar').classList.add('hidden');
  if (a && a.pts.length >= 6) addAnnot(a);
  else V.requestDraw();
}
$('aDone').addEventListener('click', closeArea);
$('aUndo').addEventListener('click', () => {
  if (!state.area) return;
  state.area.pts.length = Math.max(0, state.area.pts.length - 2);
  if (!state.area.pts.length) { state.area = null; $('areaBar').classList.add('hidden'); }
  V.requestDraw();
});

// ---------------------------------------------------------------- texto
let textPos = null;
function openText(x, y) {
  textPos = V.toDoc(x, y);
  $('tInput').value = '';
  $('dlgText').classList.remove('hidden');
  setTimeout(() => $('tInput').focus(), 50);
}
function closeText() { $('dlgText').classList.add('hidden'); $('tInput').blur(); }
$('tCancel').addEventListener('click', closeText);
$('tOk').addEventListener('click', () => {
  const txt = $('tInput').value.replace(/\s+$/, '');
  closeText();
  if (!txt || !textPos) return;
  const size = WIDTH_PX.text[state.width] * dpr() / V.view.s;
  addAnnot({ id: newId(), type: 'text', color: COLORS[state.color], w: 0, size, text: txt, pts: [textPos[0], textPos[1]] });
});

// ---------------------------------------------------------------- escala
const PRESETS = [1, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000];
const UNIT_M = { m: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, ft: 0.3048 };
let calibLen = null, calibPreset = null;
function openCalib(lenPt) {
  calibLen = lenPt;
  calibPreset = null;
  $('cMeasured').classList.toggle('hidden', lenPt == null);
  $('cIntro').textContent = lenPt == null
    ? 'Elige la escala del plano, o pulsa «Calibrar con una cota» y dibuja una línea sobre una medida conocida.'
    : `La línea mide ${fmtNum(lenPt * PT_MM)} mm en el papel. ¿Cuánto mide en la realidad?`;
  $('cValue').value = '';
  const pr = $('cPresets');
  pr.innerHTML = '';
  for (const n of PRESETS) {
    const b = document.createElement('button');
    b.textContent = '1:' + n;
    b.addEventListener('click', () => { calibPreset = n; [...pr.children].forEach((c) => c.classList.toggle('on', c === b)); });
    pr.appendChild(b);
  }
  if (lenPt == null) {
    const b = document.createElement('button');
    b.textContent = 'Calibrar con una cota…';
    b.style.background = '#0e7490';
    b.addEventListener('click', () => { closeCalib(); setTool('calib'); });
    pr.appendChild(b);
  }
  $('dlgCalib').classList.remove('hidden');
  if (lenPt != null) setTimeout(() => $('cValue').focus(), 50);
}
function closeCalib() { $('dlgCalib').classList.add('hidden'); $('cValue').blur(); }
function setCalib(c) {
  state.undo.push({ op: 'calib', before: state.calib, after: c });
  state.redo = [];
  state.calib = c;
  refreshInfo();
  changed();
}
function refreshInfo() {
  const pdf = state.pdf;
  if (!pdf) return;
  $('fileInfo').textContent = `Página ${state.pageIndex + 1} de ${pdf.numPages}${state.calib ? ' · escala ' + state.calib.label : ''}`;
}
$('cCancel').addEventListener('click', () => { closeCalib(); if (state.tool === 'calib') setTool('dist'); });
$('cReset').addEventListener('click', () => { closeCalib(); setCalib(null); toast('Medidas en milímetros de papel'); setTool('dist'); });
$('cOk').addEventListener('click', () => {
  const unit = $('cUnit').value;
  const val = parseFloat(String($('cValue').value).replace(',', '.'));
  if (calibLen != null && val > 0) {
    const factor = val / calibLen;
    // escala equivalente en papel (sólo como referencia)
    const n = (val * UNIT_M[unit]) / (calibLen * PT_MM / 1000);
    setCalib({ factor, unit, label: '1:' + fmtNum(Math.round(n * 10) / 10) });
  } else if (calibPreset) {
    setCalib({ factor: (PT_MM / 1000) * calibPreset, unit: 'm', label: '1:' + calibPreset });
  } else { toast('Escribe la longitud o elige una escala'); return; }
  closeCalib();
  toast('Escala aplicada: ' + state.calib.label);
  setTool('dist');
});

// ---------------------------------------------------------------- guardar
$('btnSave').addEventListener('click', async () => {
  if (!state.pdf) return;
  if (!countAnnots()) { toast('No hay anotaciones que guardar'); return; }
  loading(true, 'Generando PDF anotado…');
  try {
    const out = await exportPdf(state.bytes, state.pdf, state.annots, state.calib);
    const name = state.name.replace(/\.pdf$/i, '') + ' (anotado).pdf';
    if (Native && Native.saveBegin) {
      Native.saveBegin(name);
      const CH = 3 * 256 * 1024;
      for (let i = 0; i < out.length; i += CH) {
        let s = '';
        const part = out.subarray(i, i + CH);
        for (let j = 0; j < part.length; j += 8192) s += String.fromCharCode.apply(null, part.subarray(j, j + 8192));
        Native.saveChunk(btoa(s));
      }
      Native.saveEnd();
      loading(false);
    } else {
      const url = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      loading(false);
      toast('PDF descargado');
    }
  } catch (e) {
    console.error(e);
    loading(false);
    toast('No se pudo generar el PDF: ' + (e.message || e), 5000);
  }
});

// ---------------------------------------------------------------- navegación
$('btnBack').addEventListener('click', goHome);
function goHome() { cancelDrafts(); persist(); showScreen('home'); }
window.onBack = () => {
  if (!$('loading').classList.contains('hidden')) return true;
  if (!$('dlgText').classList.contains('hidden')) { closeText(); return true; }
  if (!$('dlgCalib').classList.contains('hidden')) { closeCalib(); return true; }
  if (state.area || state.draft) { cancelDrafts(); V.requestDraw(); return true; }
  if (!$('viewer').classList.contains('hidden')) {
    if (state.tool !== 'pan') { setTool('pan'); return true; }
    goHome(); return true;
  }
  return false;
};
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

updateUndo();
renderRecent();
window.__app = { state, V, setTool };
if (Native && Native.ready) Native.ready();
