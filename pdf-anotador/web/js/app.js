import { Viewer, openPdf } from './viewer.js';
import { COLORS, newId, drawAnnot, hitDist, simplify, exportPdf, PT_MM, fmtNum, snapshot, restore, translate, handles, dragHandle } from './annot.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const Native = window.Android || null;

const canvas = $('cv');
const V = new Viewer(canvas);
const TOP = 52, BOTTOM = 64; // alturas de barras (px CSS)

const state = {
  pdf: null, bytes: null, name: '', key: '', pageIndex: 0,
  annots: {}, calib: null,
  layers: {}, active: {}, sel: null,
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
    state.layers = (saved && saved.layers) || {};
    state.active = (saved && saved.active) || {};
    state.sel = null;
    // anotaciones antiguas sin capa -> primera capa de su página
    for (const [pi, list] of Object.entries(state.annots)) {
      const ls = getLayers(+pi);
      for (const a of list || []) if (!a.layer || !ls.some((l) => l.id === a.layer)) a.layer = ls[0].id;
    }
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
  state.sel = null;
  state.pageIndex = i;
  updateSelBar();
  if (!$('layersSheet').classList.contains('hidden')) renderLayers();
  updateLayerChip();
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
    store.save(state.key, { annots: state.annots, calib: state.calib, layers: state.layers, active: state.active, name: state.name, page: state.pageIndex, t: Date.now() });
  }, 300);
}

// ---------------------------------------------------------------- capas (por página)
let layerSeq = 1;
const newLayerId = () => 'c' + Date.now().toString(36) + (layerSeq++);
function getLayers(pi = state.pageIndex) {
  let ls = state.layers[pi];
  if (!ls || !ls.length) ls = state.layers[pi] = [{ id: 'base', name: 'Capa 1', visible: true }];
  return ls;
}
function activeLayer(pi = state.pageIndex) {
  const ls = getLayers(pi);
  return ls.find((l) => l.id === state.active[pi]) || ls[ls.length - 1];
}
function layerVisible(pi, id) {
  const l = getLayers(pi).find((x) => x.id === id);
  return !l || l.visible;
}
const visibleAnnots = (pi = state.pageIndex) => (state.annots[pi] || []).filter((a) => layerVisible(pi, a.layer));
function updateLayerChip() {
  if (!state.pdf) return;
  const ls = getLayers();
  const chip = $('layerChip');
  const show = ls.length > 1 && !['pan', 'select'].includes(state.tool);
  chip.textContent = 'Capa: ' + activeLayer().name;
  chip.classList.toggle('hidden', !show);
}

function addAnnot(a) {
  const L = activeLayer();
  if (!a.layer) a.layer = L.id;
  if (!L.visible) { L.visible = true; toast('Capa «' + L.name + '» visible de nuevo'); }
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
  updateSelBar();
  updateLayerChip();
  if (!$('layersSheet').classList.contains('hidden')) renderLayers();
  V.requestDraw();
}
const deep = (o) => JSON.parse(JSON.stringify(o));
// operación de página completa (capas): guarda el antes y el después
function pageOp(mutate) {
  const pi = state.pageIndex;
  const before = deep({ annots: state.annots[pi] || [], layers: getLayers(pi), active: state.active[pi] || null });
  mutate();
  const after = deep({ annots: state.annots[pi] || [], layers: getLayers(pi), active: state.active[pi] || null });
  state.undo.push({ op: 'page', page: pi, before, after });
  state.redo = [];
  state.sel = null;
  changed();
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
  if (op.op === 'edit') { restore(op.a, inverse ? op.before : op.after); return; }
  if (op.op === 'page') {
    const snap = deep(inverse ? op.before : op.after);
    state.annots[op.page] = snap.annots; state.layers[op.page] = snap.layers; state.active[op.page] = snap.active;
    return;
  }
  if (add) { if (op.op === 'del') list.splice(Math.min(op.i, list.length), 0, op.a); else list.push(op.a); }
  else { const i = list.indexOf(op.a); if (i >= 0) list.splice(i, 1); }
}
async function undo() {
  const op = state.undo.pop(); if (!op) return;
  if (op.page !== undefined && op.page !== state.pageIndex) await gotoPage(op.page, false);
  state.sel = null; applyOp(op, true); state.redo.push(op); changed();
}
async function redo() {
  const op = state.redo.pop(); if (!op) return;
  if (op.page !== undefined && op.page !== state.pageIndex) await gotoPage(op.page, false);
  state.sel = null; applyOp(op, false); state.undo.push(op); changed();
}
$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);

// ---------------------------------------------------------------- herramientas
const WIDTH_PX = { ink: [0, 1.5, 3, 6], hl: [0, 10, 18, 28], shape: [0, 1.5, 3, 5], text: [0, 14, 20, 30] };
const HINTS = {
  pan: '',
  select: 'Toca una anotación para seleccionarla · arrástrala para moverla · usa los círculos para cambiar su forma',
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
  if (t !== 'select') state.sel = null;
  state.tool = t;
  for (const b of $('toolbar').children) if (b.dataset.tool) b.classList.toggle('on', b.dataset.tool === t);
  const showProps = !['pan', 'erase', 'calib', 'select'].includes(t);
  $('props').classList.toggle('hidden', !showProps);
  let h = HINTS[t] || '';
  if ((t === 'dist' || t === 'area') && !state.calib) h += ' · sin escala: medidas en papel (mm). Usa «Escala» para calibrar';
  else if ((t === 'dist' || t === 'area') && state.calib) h += ' · escala ' + state.calib.label;
  $('hint').textContent = h;
  $('hint').classList.toggle('hidden', !h);
  $('areaBar').classList.add('hidden');
  updateSelBar();
  updateLayerChip();
  V.requestDraw();
}
for (const b of $('toolbar').children) {
  b.addEventListener('click', () => {
    if (b.dataset.action === 'layers') { openLayers(); return; }
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
    b.addEventListener('click', () => { state.color = i; syncProps(); editSel((a) => { a.color = col; }); });
    c.appendChild(b);
  });
  for (const b of document.querySelectorAll('.widths button')) b.addEventListener('click', () => {
    state.width = +b.dataset.w; syncProps();
    editSel((a) => {
      if (a.type === 'text') a.size = WIDTH_PX.text[state.width] * dpr() / V.view.s;
      else if (a.type === 'dist' || a.type === 'area') a.w = [0, 0.8, 1.5, 3][state.width] * dpr() / V.view.s;
      else a.w = widthPt(a.type === 'ink' || a.type === 'hl' ? a.type : 'shape');
    });
  });
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
  const sel = state.sel;
  for (const a of visibleAnnots()) drawAnnot(ctx, a, V.view, dpr(), state.calib, a === sel);
  if (sel && state.tool === 'select') {
    const d = dpr();
    for (const h of handles(sel, V.ctx)) {
      const [x, y] = V.toScreen(h.x, h.y);
      ctx.beginPath(); ctx.arc(x, y, 8 * d, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 2.5 * d; ctx.strokeStyle = '#0ea5e9'; ctx.stroke();
      if (h.scale) { ctx.beginPath(); ctx.moveTo(x - 3 * d, y - 3 * d); ctx.lineTo(x + 3 * d, y + 3 * d); ctx.stroke(); }
    }
  }
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
    if (g && (g.type === 'move' || g.type === 'handle') && state.sel) restore(state.sel, g.orig);
    state.loupe = null;
    startPinch();
    V.requestDraw();
    return;
  }
  if (ptrs.size > 2) return;
  const t = state.tool;
  const [dx, dy] = V.toDoc(x, y);
  g = { type: 'tap', id: e.pointerId, sx: x, sy: y, x, y, t: performance.now(), moved: false };
  if (t === 'select') { selectDown(x, y); return; }
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
  } else if (g.type === 'move' || g.type === 'handle') {
    if (g.moved) {
      const [dx, dy] = V.toDoc(x, y);
      if (g.type === 'move') translate(state.sel, g.orig, dx - g.dx0, dy - g.dy0);
      else { dragHandle(state.sel, g.orig, g.h, dx, dy, V.ctx); state.loupe = [x, y]; }
      V.requestDraw();
    }
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
  if (gg.type === 'move' || gg.type === 'handle') {
    if (gg.moved && state.sel) {
      const after = snapshot(state.sel);
      if (JSON.stringify(after) !== JSON.stringify(gg.orig)) {
        state.undo.push({ op: 'edit', page: state.pageIndex, a: state.sel, before: gg.orig, after });
        state.redo = [];
        changed();
      }
    } else if (quick && gg.type === 'handle') {
      // toque sin arrastrar sobre un tirador: seleccionar lo que haya debajo
      const hit = hitTop(x, y);
      if (hit && hit !== state.sel) { state.sel = hit; updateSelBar(); }
    } else if (quick && gg.wasSelected && state.sel && state.sel.type === 'text') editText();
    V.requestDraw();
    return;
  }
  if (gg.type === 'draw' && state.draft) finishDraft();
  V.requestDraw();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => {
  ptrs.delete(e.pointerId);
  if (!ptrs.size) {
    if (g && (g.type === 'move' || g.type === 'handle') && state.sel) restore(state.sel, g.orig);
    g = null; state.draft = null; state.loupe = null; V.requestDraw();
  }
});

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
  const list = visibleAnnots();
  if (!list.length) return;
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

// ---------------------------------------------------------------- diálogo genérico
// ask({title, text, value, input, list:[{label, value, on}], ok}) -> Promise(valor | null)
let askResolve = null;
function ask(o) {
  if (askResolve) askResolve(null);
  $('askTitle').textContent = o.title || '';
  $('askText').textContent = o.text || '';
  $('askText').classList.toggle('hidden', !o.text);
  const inp = $('askInput');
  inp.classList.toggle('hidden', !o.input);
  inp.value = o.value || '';
  inp.rows = o.rows || 2;
  const list = $('askList');
  list.innerHTML = '';
  list.classList.toggle('hidden', !o.list);
  $('askOk').classList.toggle('hidden', !!o.list);
  $('askOk').textContent = o.ok || 'Aceptar';
  $('askOk').classList.toggle('danger-btn', !!o.danger);
  $('dlgAsk').classList.remove('hidden');
  return new Promise((res) => {
    askResolve = res;
    for (const it of o.list || []) {
      const b = document.createElement('button');
      b.textContent = it.label;
      if (it.on) b.classList.add('on');
      b.addEventListener('click', () => closeAsk(it.value));
      list.appendChild(b);
    }
    if (o.input) setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
function closeAsk(v) {
  $('dlgAsk').classList.add('hidden');
  $('askInput').blur();
  const r = askResolve; askResolve = null;
  if (r) r(v);
}
$('askCancel').addEventListener('click', () => closeAsk(null));
$('askOk').addEventListener('click', () => closeAsk($('askInput').classList.contains('hidden') ? true : $('askInput').value));

// ---------------------------------------------------------------- texto
async function openText(x, y) {
  const pos = V.toDoc(x, y);
  const v = await ask({ title: 'Texto', input: true, rows: 3, value: '', ok: 'Añadir' });
  const txt = (v || '').replace(/\s+$/, '');
  if (!txt) return;
  const size = WIDTH_PX.text[state.width] * dpr() / V.view.s;
  addAnnot({ id: newId(), type: 'text', color: COLORS[state.color], w: 0, size, text: txt, pts: [pos[0], pos[1]] });
}

// ---------------------------------------------------------------- edición
function hitTop(x, y) {
  const [dx, dy] = V.toDoc(x, y);
  const tol = 14 * dpr() / V.view.s;
  const list = visibleAnnots();
  // la más cercana al dedo; a igual distancia, la seleccionada o la de encima
  let best = null, bd = tol;
  for (let i = list.length - 1; i >= 0; i--) {
    const d = Math.max(0, hitDist(list[i], dx, dy, V.ctx));
    const bonus = list[i] === state.sel ? tol * 0.15 : 0;
    if (d - bonus < bd) { bd = d - bonus; best = list[i]; }
  }
  return best;
}
function selectDown(x, y) {
  const sel = state.sel;
  const [dx, dy] = V.toDoc(x, y);
  if (sel) {
    const hs = handles(sel, V.ctx);
    let best = -1, bd = 24 * dpr();
    hs.forEach((h, i) => { const [hx, hy] = V.toScreen(h.x, h.y); const d = Math.hypot(hx - x, hy - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { g.type = 'handle'; g.h = best; g.orig = snapshot(sel); state.loupe = null; return; }
  }
  const hit = hitTop(x, y);
  if (hit) {
    g.wasSelected = hit === sel;
    state.sel = hit;
    g.type = 'move'; g.orig = snapshot(hit); g.dx0 = dx; g.dy0 = dy;
    updateSelBar();
    V.requestDraw();
    return;
  }
  state.sel = null;
  updateSelBar();
  g.type = 'pan';
  V.requestDraw();
}
// aplica un cambio a la selección con deshacer
function editSel(fn) {
  const a = state.sel;
  if (!a || state.tool !== 'select') return;
  const before = snapshot(a);
  fn(a);
  const after = snapshot(a);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  state.undo.push({ op: 'edit', page: state.pageIndex, a, before, after });
  state.redo = [];
  changed();
}
function updateSelBar() {
  const a = state.tool === 'select' ? state.sel : null;
  $('selBar').classList.toggle('hidden', !a);
  if (state.tool === 'select') $('props').classList.toggle('hidden', !a);
  if (!a) return;
  $('sText').classList.toggle('hidden', a.type !== 'text');
  const L = getLayers().find((l) => l.id === a.layer);
  $('sLayerName').textContent = L ? L.name : '—';
  const ci = COLORS.indexOf(a.color);
  if (ci >= 0) { state.color = ci; [...$('colors').children].forEach((b, i) => b.classList.toggle('on', i === ci)); }
}
async function editText() {
  const a = state.sel;
  if (!a || a.type !== 'text') return;
  const v = await ask({ title: 'Editar texto', input: true, rows: 3, value: a.text, ok: 'Guardar' });
  if (v == null) return;
  const txt = v.replace(/\s+$/, '');
  if (!txt) { removeAnnot(a); state.sel = null; changed(); return; }
  editSel((x) => { x.text = txt; });
}
$('sText').addEventListener('click', editText);
$('sDel').addEventListener('click', () => { const a = state.sel; if (!a) return; state.sel = null; removeAnnot(a); });
$('sDup').addEventListener('click', () => {
  const a = state.sel; if (!a) return;
  const off = 16 * dpr() / V.view.s;
  const c = JSON.parse(JSON.stringify(a));
  c.id = newId();
  c.pts = c.pts.map((v) => v + off);
  pageList().push(c);
  state.undo.push({ op: 'add', page: state.pageIndex, a: c });
  state.redo = [];
  state.sel = c;
  changed();
});
$('sLayer').addEventListener('click', async () => {
  const a = state.sel; if (!a) return;
  const v = await ask({ title: 'Mover a la capa', list: getLayers().map((l) => ({ label: l.name + (l.visible ? '' : ' (oculta)'), value: l.id, on: l.id === a.layer })) });
  if (v == null || v === a.layer) return;
  const L = getLayers().find((l) => l.id === v);
  editSel((x) => { x.layer = v; });
  if (L && !L.visible) { state.sel = null; toast('Movida a «' + L.name + '», que está oculta'); changed(); }
});

// ---------------------------------------------------------------- panel de capas
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const PEN = '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const BIN = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
function openLayers() {
  const el = $('layersSheet');
  if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
  renderLayers();
  el.classList.remove('hidden');
}
function renderLayers() {
  const pi = state.pageIndex;
  $('lTitle').textContent = state.pdf && state.pdf.numPages > 1 ? `Capas · página ${pi + 1}` : 'Capas';
  const ul = $('layerList');
  ul.innerHTML = '';
  const act = activeLayer();
  const list = state.annots[pi] || [];
  const ls = getLayers();
  for (const l of [...ls].reverse()) {
    const n = list.filter((a) => a.layer === l.id).length;
    const li = document.createElement('li');
    li.classList.toggle('active', l === act);
    li.innerHTML = `<span class="radio"></span><span class="ln">${esc(l.name)}</span><span class="cnt">${n}</span>
      <button class="eye ${l.visible ? '' : 'off'}" aria-label="Mostrar u ocultar">${l.visible ? EYE : EYE_OFF}</button>
      <button class="act ren" aria-label="Renombrar">${PEN}</button>
      <button class="act del" aria-label="Borrar capa">${BIN}</button>`;
    li.addEventListener('click', async (e) => {
      if (e.target.closest('.eye')) {
        pageOp(() => { const L = getLayers().find((x) => x.id === l.id); L.visible = !L.visible; });
        return;
      }
      if (e.target.closest('.ren')) {
        const v = await ask({ title: 'Nombre de la capa', input: true, value: l.name, ok: 'Guardar' });
        if (v && v.trim()) pageOp(() => { getLayers().find((x) => x.id === l.id).name = v.trim(); });
        return;
      }
      if (e.target.closest('.del')) {
        if (ls.length === 1) { toast('Cada página necesita al menos una capa'); return; }
        const ok = await ask({ title: 'Borrar capa', text: n ? `Se borrarán también sus ${n} anotaciones.` : '¿Borrar la capa vacía?', ok: 'Borrar', danger: true });
        if (!ok) return;
        pageOp(() => {
          state.layers[pi] = getLayers().filter((x) => x.id !== l.id);
          state.annots[pi] = (state.annots[pi] || []).filter((a) => a.layer !== l.id);
          if (state.active[pi] === l.id) delete state.active[pi];
        });
        return;
      }
      state.active[pi] = l.id;
      if (!l.visible) pageOp(() => { getLayers().find((x) => x.id === l.id).visible = true; });
      persist(); renderLayers(); updateLayerChip();
    });
    ul.appendChild(li);
  }
}
$('lClose').addEventListener('click', () => $('layersSheet').classList.add('hidden'));
$('lAdd').addEventListener('click', async () => {
  const ls = getLayers();
  const v = await ask({ title: 'Nueva capa', input: true, value: 'Capa ' + (ls.length + 1), ok: 'Crear' });
  if (!v || !v.trim()) return;
  const id = newLayerId();
  pageOp(() => { getLayers().push({ id, name: v.trim(), visible: true }); state.active[state.pageIndex] = id; });
  toast('Ahora dibujas en «' + v.trim() + '»');
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
$('btnSave').addEventListener('click', () => {
  if (!state.pdf) return;
  if (!countAnnots()) { toast('No hay anotaciones que guardar'); return; }
  const box = $('exList');
  box.innerHTML = '';
  const pages = Object.keys(state.annots).map(Number).filter((pi) => (state.annots[pi] || []).length).sort((x, y) => x - y);
  for (const pi of pages) {
    if (state.pdf.numPages > 1) { const h = document.createElement('h4'); h.textContent = 'Página ' + (pi + 1); box.appendChild(h); }
    for (const l of getLayers(pi)) {
      const n = state.annots[pi].filter((a) => a.layer === l.id).length;
      if (!n) continue;
      const lab = document.createElement('label');
      lab.className = 'check';
      lab.innerHTML = `<input type="checkbox" data-page="${pi}" data-layer="${esc(l.id)}" ${l.visible ? 'checked' : ''}> <span>${esc(l.name)} <span class="muted">· ${n}</span></span>`;
      box.appendChild(lab);
    }
  }
  $('dlgExport').classList.remove('hidden');
});
$('exCancel').addEventListener('click', () => $('dlgExport').classList.add('hidden'));
$('exOk').addEventListener('click', async () => {
  const chosen = new Set();
  for (const c of $('exList').querySelectorAll('input[type=checkbox]')) if (c.checked) chosen.add(c.dataset.page + '|' + c.dataset.layer);
  if (!chosen.size) { toast('Marca al menos una capa'); return; }
  const ocg = $('exOcg').checked;
  $('dlgExport').classList.add('hidden');
  loading(true, 'Generando PDF anotado…');
  try {
    const layers = {};
    for (const pi of Object.keys(state.annots)) layers[pi] = getLayers(+pi);
    const out = await exportPdf(state.bytes, state.pdf, state.annots, state.calib, {
      include: (pi, lid) => chosen.has(pi + '|' + lid), layers, ocg,
    });
    const name = state.name.replace(/\.pdf$/i, '') + ' (anotado).pdf';
    if (Native && Native.saveBegin) {
      Native.saveBegin(name);
      const CH = 3 * 256 * 1024;
      for (let i = 0; i < out.length; i += CH) {
        let str = '';
        const part = out.subarray(i, i + CH);
        for (let j = 0; j < part.length; j += 8192) str += String.fromCharCode.apply(null, part.subarray(j, j + 8192));
        Native.saveChunk(btoa(str));
      }
      Native.saveEnd();
      loading(false);
    } else {
      const url = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
      const el = document.createElement('a');
      el.href = url; el.download = name;
      document.body.appendChild(el); el.click(); el.remove();
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
  if (!$('dlgAsk').classList.contains('hidden')) { closeAsk(null); return true; }
  if (!$('dlgExport').classList.contains('hidden')) { $('dlgExport').classList.add('hidden'); return true; }
  if (!$('layersSheet').classList.contains('hidden')) { $('layersSheet').classList.add('hidden'); return true; }
  if (state.sel) { state.sel = null; updateSelBar(); V.requestDraw(); return true; }
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
