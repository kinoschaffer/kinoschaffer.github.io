// Núcleo: lee DWG/DXF con libredwg (WebAssembly) y lo convierte en una
// lista de primitivas vectoriales en coordenadas del mundo (doble precisión).
//
// Piezas de trazado (pieces):
//   {k:0, p:Float64Array[x0,y0,x1,y1,...]}           polilínea
//   {k:1, cx,cy, ux,uy, vx,vy, a0,a1}                 arco elíptico P(t)=c+u·cos t+v·sin t, t de a0 a a1
//   {k:2, p:Float64Array[x0,y0, c1x,c1y,c2x,c2y,x1,y1, ...]} cadena de Bézier cúbicas
//
// Primitivas:
//   {t:'s', L, c, lw, d, w, pc:[pieces], b:[minx,miny,maxx,maxy]}   trazo
//   {t:'f', L, c, loops:[[pieces]], hl?:[familias], solid, b}        relleno / sombreado
//   {t:'t', L, c, x, y, m:[a,b,c,d], ln:[...], lw:[...], ls, y0, ha, b}  texto
//   {t:'p', L, c, x, y, b}                                           punto
//   {t:'x', L, c, x, y, dx, dy, ray}                                 línea infinita / rayo
//   {t:'wo', loops, b}                                               wipeout (tapa con el fondo)

import { LibreDwg, Dwg_File_Type } from '../vendor/dist/libredwg-web.js';

const TAU = Math.PI * 2;
const FG = -1; // color "primer plano" (ACI 7): blanco sobre fondo oscuro, negro sobre claro
const EM = 1.4; // tamaño de fuente en unidades de altura de texto (altura = mayúscula)

let libPromise = null;
function getLib() {
  if (!libPromise) {
    const base = new URL('../vendor/wasm', import.meta.url).href;
    libPromise = LibreDwg.create(base);
  }
  return libPromise;
}

// ---------------------------------------------------------------- colores ACI
const ACI = (() => {
  const t = new Array(256).fill(0xffffff);
  const base = [0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff, 0x808080, 0xc0c0c0];
  for (let i = 0; i < 10; i++) t[i] = base[i];
  const vals = [1, 0.8, 0.6, 0.5, 0.3];
  const hsv = (h, s, v) => {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
  };
  for (let i = 10; i < 250; i++) {
    const h = (Math.floor(i / 10) - 1) * 15;
    const j = i % 10;
    t[i] = hsv(h, j & 1 ? 0.5 : 1, vals[j >> 1]);
  }
  const grays = [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff];
  for (let i = 0; i < 6; i++) t[250 + i] = grays[i];
  return t;
})();
const aci = (i) => (i === 7 || i === 255 ? FG : ACI[Math.abs(i) & 255]);

// Grosores de línea de libredwg (índice -> 1/100 mm). 29=PorCapa 30=PorBloque 31=Defecto
const LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
function lwValue(raw) {
  if (raw == null) return -1;
  if (raw === 29 || raw === -1) return -1;
  if (raw === 30 || raw === -2) return -2;
  if (raw === 31 || raw === -3) return 25;
  if (raw >= 0 && raw < LW.length) return LW[raw];
  if (raw > 31) return raw; // ya en 1/100 mm
  return 25;
}

// ---------------------------------------------------------------- matrices 2D
// [a,b,c,d,e,f]: x' = a x + c y + e ; y' = b x + d y + f
const I = [1, 0, 0, 1, 0, 0];
function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const trans = (x, y) => [1, 0, 0, 1, x, y];
const rot = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
const scl = (x, y) => [x, 0, 0, y, 0, 0];
const det = (m) => m[0] * m[3] - m[1] * m[2];

// Matriz del sistema de coordenadas del objeto (OCS) proyectada en XY.
function ocs(n, elev) {
  if (!n) return null;
  let nx = n.x || 0, ny = n.y || 0, nz = n.z || 0;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  nx /= len; ny /= len; nz /= len;
  if (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9 && nz > 0) return null;
  let ax, ay, az;
  if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64) { ax = nz; ay = 0; az = -nx; }
  else { ax = -ny; ay = nx; az = 0; }
  const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
  // Ay = N x Ax
  const bx = ny * az - nz * ay, by = nz * ax - nx * az;
  const z = elev || 0;
  return [ax, ay, bx, by, z * nx, z * ny];
}
function withOcs(M, n, elev) {
  const o = ocs(n, elev);
  return o ? mul(M, o) : M;
}

// ---------------------------------------------------------------- estado
let L; // capas
let layerIdx;
let ltypes;
let ltscale;
let blocksByName, blocksByHandle;
let prims, snaps;
let measureCtx = null;
let stats;

function measure(str) {
  if (measureCtx === undefined) return str.length * 0.62;
  if (!measureCtx) {
    try {
      measureCtx = new OffscreenCanvas(8, 8).getContext('2d');
      measureCtx.font = '100px sans-serif';
    } catch (e) { measureCtx = undefined; return str.length * 0.62; }
  }
  return measureCtx.measureText(str).width / 100 * EM;
}

function layerOf(name) {
  let i = layerIdx.get(name);
  if (i === undefined) {
    i = L.length;
    L.push({ name, color: FG, ltype: 'CONTINUOUS', lw: 25, visible: true, count: 0 });
    layerIdx.set(name, i);
  }
  return i;
}

function snap(x, y) { snaps.push(x, y); }

// Contexto heredado por bloques: {M, color, layer, lw, ltype, depth}
function props(e, ctx) {
  let lname = e.layer || '0';
  if (lname === '0' && ctx.layer != null) lname = ctx.layer;
  const li = layerOf(lname);
  const lay = L[li];
  let color;
  if (e.color != null && e.colorIndex !== 256 && e.colorIndex !== 0) color = e.color;
  else {
    const idx = e.colorIndex;
    if (idx == null || idx >= 256) color = lay.color;
    else if (idx === 0) color = ctx.color != null ? ctx.color : FG;
    else color = aci(idx);
  }
  let lw = lwValue(e.lineweight);
  if (lw === -1) lw = lay.lw;
  else if (lw === -2) lw = ctx.lw != null ? ctx.lw : 25;
  let lt = (e.lineType || '').toUpperCase();
  if (!lt || lt === 'BYLAYER') lt = lay.ltype;
  else if (lt === 'BYBLOCK') lt = ctx.ltype || 'CONTINUOUS';
  return { li, lname, color, lw, lt, lts: e.lineTypeScale || 1 };
}

function dashFor(p, M) {
  const pat = ltypes.get(p.lt);
  if (!pat) return null;
  const k = ltscale * p.lts * Math.sqrt(Math.abs(det(M))) || 1;
  const out = [];
  let on = true;
  for (const v of pat) {
    const isOn = v >= 0;
    const len = Math.abs(v) * k;
    if (out.length === 0) {
      if (!isOn) { out.push(0); }
      out.push(len);
      on = isOn;
      continue;
    }
    if (isOn === on) out[out.length - 1] += len;
    else { out.push(len); on = isOn; }
  }
  if (out.length % 2 === 1) {
    // patrón impar: fusionar el último con el primero si son del mismo tipo
    if (on) { out[0] += out.pop(); } else out.push(0);
  }
  let total = 0;
  for (const v of out) total += v;
  if (!(total > 0)) return null;
  return out;
}

// ---------------------------------------------------------------- piezas
function tp(M, x, y) { return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }

function arcPiece(M, cx, cy, ux, uy, vx, vy, a0, a1) {
  const c = tp(M, cx, cy);
  return {
    k: 1, cx: c[0], cy: c[1],
    ux: M[0] * ux + M[2] * uy, uy: M[1] * ux + M[3] * uy,
    vx: M[0] * vx + M[2] * vy, vy: M[1] * vx + M[3] * vy,
    a0, a1,
  };
}
function arcPt(pc, t) {
  return [pc.cx + pc.ux * Math.cos(t) + pc.vx * Math.sin(t), pc.cy + pc.uy * Math.cos(t) + pc.vy * Math.sin(t)];
}

// Construye piezas a partir de vértices con abombamiento (bulge), en OCS, transformadas por M.
function bulgePieces(M, verts, closed, out, withSnaps) {
  const n = verts.length;
  if (n === 0) return out;
  let run = [];
  const flush = () => {
    if (run.length >= 4) out.push({ k: 0, p: Float64Array.from(run) });
    run = [];
  };
  const segs = closed ? n : n - 1;
  if (n === 1) {
    const q = tp(M, verts[0].x, verts[0].y);
    out.push({ k: 0, p: Float64Array.from([q[0], q[1], q[0], q[1]]) });
    return out;
  }
  for (let i = 0; i < segs; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const bulge = a.bulge || 0;
    const pa = tp(M, a.x, a.y), pb = tp(M, b.x, b.y);
    if (withSnaps) snap(pa[0], pa[1]);
    if (Math.abs(bulge) < 1e-10) {
      if (run.length === 0) run.push(pa[0], pa[1]);
      run.push(pb[0], pb[1]);
    } else {
      flush();
      const dx = b.x - a.x, dy = b.y - a.y;
      const c = Math.hypot(dx, dy);
      if (c < 1e-14) continue;
      const h = (c / 2) * (1 - bulge * bulge) / (2 * bulge);
      const mx = (a.x + b.x) / 2 - (dy / c) * h;
      const my = (a.y + b.y) / 2 + (dx / c) * h;
      const r = Math.hypot(a.x - mx, a.y - my);
      const a0 = Math.atan2(a.y - my, a.x - mx);
      const th = 4 * Math.atan(bulge);
      out.push(arcPiece(M, mx, my, r, 0, 0, r, a0, a0 + th));
      if (withSnaps) { const cc = tp(M, mx, my); snap(cc[0], cc[1]); }
    }
  }
  flush();
  if (withSnaps && !closed) { const q = tp(M, verts[n - 1].x, verts[n - 1].y); snap(q[0], q[1]); }
  return out;
}

// --------------------------------------------------------------- splines
function cubicFromHermite(p, d, t) {
  // p: puntos [{x,y}], d: derivadas, t: parámetros -> cadena de Bézier
  const out = [p[0].x, p[0].y];
  for (let i = 0; i < p.length - 1; i++) {
    const h = t[i + 1] - t[i];
    out.push(p[i].x + d[i].x * h / 3, p[i].y + d[i].y * h / 3,
      p[i + 1].x - d[i + 1].x * h / 3, p[i + 1].y - d[i + 1].y * h / 3,
      p[i + 1].x, p[i + 1].y);
  }
  return out;
}

// Interpolación cúbica C2 por puntos de ajuste, parametrizada por longitud de cuerda.
function fitSpline(pts, t0, t1, closed) {
  const P = [];
  for (const q of pts) {
    if (!P.length || Math.hypot(q.x - P[P.length - 1].x, q.y - P[P.length - 1].y) > 1e-12) P.push({ x: q.x, y: q.y });
  }
  if (closed && P.length > 2 && Math.hypot(P[0].x - P[P.length - 1].x, P[0].y - P[P.length - 1].y) > 1e-12) P.push({ ...P[0] });
  const n = P.length;
  if (n < 2) return null;
  if (n === 2) return [P[0].x, P[0].y, ...lerpCtl(P[0], P[1])];
  const t = [0];
  for (let i = 1; i < n; i++) t.push(t[i - 1] + (Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y) || 1e-9));
  // Sistema tridiagonal para derivadas D_i (C2)
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n);
  const rx = new Float64Array(n), ry = new Float64Array(n);
  const h = (i) => t[i + 1] - t[i];
  const chordLen = (i) => h(i);
  for (let i = 1; i < n - 1; i++) {
    const h0 = h(i - 1), h1 = h(i);
    a[i] = h1; b[i] = 2 * (h0 + h1); c[i] = h0;
    rx[i] = 3 * (h1 * (P[i].x - P[i - 1].x) / h0 + h0 * (P[i + 1].x - P[i].x) / h1);
    ry[i] = 3 * (h1 * (P[i].y - P[i - 1].y) / h0 + h0 * (P[i + 1].y - P[i].y) / h1);
  }
  const tanLen = (v) => Math.hypot(v.x || 0, v.y || 0);
  if (t0 && tanLen(t0) > 1e-12) {
    const l = tanLen(t0); b[0] = 1; c[0] = 0;
    const s = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) / chordLen(0);
    rx[0] = t0.x / l * s; ry[0] = t0.y / l * s;
  } else {
    b[0] = 2; c[0] = 1;
    rx[0] = 3 * (P[1].x - P[0].x) / h(0); ry[0] = 3 * (P[1].y - P[0].y) / h(0);
  }
  if (t1 && tanLen(t1) > 1e-12) {
    const l = tanLen(t1); a[n - 1] = 0; b[n - 1] = 1;
    const s = Math.hypot(P[n - 1].x - P[n - 2].x, P[n - 1].y - P[n - 2].y) / chordLen(n - 2);
    rx[n - 1] = t1.x / l * s; ry[n - 1] = t1.y / l * s;
  } else {
    a[n - 1] = 1; b[n - 1] = 2;
    rx[n - 1] = 3 * (P[n - 1].x - P[n - 2].x) / h(n - 2); ry[n - 1] = 3 * (P[n - 1].y - P[n - 2].y) / h(n - 2);
  }
  // Thomas
  const cp = new Float64Array(n), dx = new Float64Array(n), dy = new Float64Array(n);
  cp[0] = c[0] / b[0]; dx[0] = rx[0] / b[0]; dy[0] = ry[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m;
    dx[i] = (rx[i] - a[i] * dx[i - 1]) / m;
    dy[i] = (ry[i] - a[i] * dy[i - 1]) / m;
  }
  for (let i = n - 2; i >= 0; i--) { dx[i] -= cp[i] * dx[i + 1]; dy[i] -= cp[i] * dy[i + 1]; }
  const D = [];
  for (let i = 0; i < n; i++) D.push({ x: dx[i], y: dy[i] });
  return cubicFromHermite(P, D, t);
}
function lerpCtl(a, b) {
  return [a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3, a.x + 2 * (b.x - a.x) / 3, a.y + 2 * (b.y - a.y) / 3, b.x, b.y];
}

// B-spline (NURBS) -> piezas. Exacto (Bézier) si no es racional y grado <= 3.
function nurbsPieces(M, degree, knots, cps, weights) {
  const p = degree | 0;
  const n = cps.length;
  if (n < 2 || p < 1) return [];
  if (!knots || knots.length !== n + p + 1) {
    // nudos inválidos: uniforme sujeto
    knots = [];
    for (let i = 0; i <= n + p; i++) knots.push(Math.min(Math.max(i - p, 0), n - p));
  }
  let rational = false;
  if (weights && weights.length === n) for (const w of weights) if (Math.abs(w - 1) > 1e-9) { rational = true; break; }
  const W = (i) => (rational ? weights[i] : 1);
  const blossom = (span, ts) => {
    const d = [];
    for (let j = 0; j <= p; j++) {
      const q = cps[span - p + j]; const w = W(span - p + j);
      d.push([q.x * w, q.y * w, w]);
    }
    for (let r = 1; r <= p; r++) {
      const tr = ts[r - 1];
      for (let j = p; j >= r; j--) {
        const i = span - p + j;
        const den = knots[i + p + 1 - r] - knots[i];
        const al = den === 0 ? 0 : (tr - knots[i]) / den;
        d[j] = [(1 - al) * d[j - 1][0] + al * d[j][0], (1 - al) * d[j - 1][1] + al * d[j][1], (1 - al) * d[j - 1][2] + al * d[j][2]];
      }
    }
    return d[p];
  };
  const out = [];
  if (!rational && p <= 3) {
    const chain = [];
    for (let s = p; s < n; s++) {
      const a = knots[s], b = knots[s + 1];
      if (!(b > a)) continue;
      const ctl = [];
      for (let k = 0; k <= p; k++) {
        const ts = [];
        for (let r = 0; r < p - k; r++) ts.push(a);
        for (let r = 0; r < k; r++) ts.push(b);
        const q = blossom(s, ts);
        ctl.push([q[0], q[1]]);
      }
      let c1, c2;
      if (p === 1) { c1 = [ctl[0][0] + (ctl[1][0] - ctl[0][0]) / 3, ctl[0][1] + (ctl[1][1] - ctl[0][1]) / 3]; c2 = [ctl[0][0] + 2 * (ctl[1][0] - ctl[0][0]) / 3, ctl[0][1] + 2 * (ctl[1][1] - ctl[0][1]) / 3]; }
      else if (p === 2) { c1 = [ctl[0][0] + 2 / 3 * (ctl[1][0] - ctl[0][0]), ctl[0][1] + 2 / 3 * (ctl[1][1] - ctl[0][1])]; c2 = [ctl[2][0] + 2 / 3 * (ctl[1][0] - ctl[2][0]), ctl[2][1] + 2 / 3 * (ctl[1][1] - ctl[2][1])]; }
      else { c1 = ctl[1]; c2 = ctl[2]; }
      const last = ctl[p];
      const P0 = tp(M, ctl[0][0], ctl[0][1]);
      if (!chain.length) chain.push(P0[0], P0[1]);
      const C1 = tp(M, c1[0], c1[1]), C2 = tp(M, c2[0], c2[1]), P3 = tp(M, last[0], last[1]);
      chain.push(C1[0], C1[1], C2[0], C2[1], P3[0], P3[1]);
    }
    if (chain.length >= 8) out.push({ k: 2, p: Float64Array.from(chain) });
    return out;
  }
  // Racional o grado alto: muestreo denso por tramo
  const pts = [];
  for (let s = p; s < n; s++) {
    const a = knots[s], b = knots[s + 1];
    if (!(b > a)) continue;
    const N = 48;
    for (let k = pts.length ? 1 : 0; k <= N; k++) {
      const t = a + (b - a) * k / N;
      const q = blossom(s, new Array(p).fill(t));
      const P = tp(M, q[0] / q[2], q[1] / q[2]);
      pts.push(P[0], P[1]);
    }
  }
  if (pts.length >= 4) out.push({ k: 0, p: Float64Array.from(pts) });
  return out;
}

function splinePieces(M, e) {
  const cps = e.controlPoints || [];
  if (cps.length >= 2) return nurbsPieces(M, e.degree || 3, e.knots, cps, e.weights);
  const fit = e.fitPoints || [];
  if (fit.length >= 2) {
    const ch = fitSpline(fit, e.startTangent, e.endTangent, (e.flag & 1) === 1);
    if (!ch) return [];
    const out = new Float64Array(ch.length);
    for (let i = 0; i < ch.length; i += 2) { const q = tp(M, ch[i], ch[i + 1]); out[i] = q[0]; out[i + 1] = q[1]; }
    return [{ k: 2, p: out }];
  }
  return [];
}

// --------------------------------------------------------------- bbox
function bboxPieces(pcs, b) {
  b = b || [Infinity, Infinity, -Infinity, -Infinity];
  for (const pc of pcs) {
    if (pc.k === 1) {
      const rx = Math.hypot(pc.ux, pc.vx), ry = Math.hypot(pc.uy, pc.vy);
      // caja exacta del arco: extremos + puntos de tangencia dentro del rango
      const ts = [pc.a0, pc.a1];
      const tx = Math.atan2(pc.vx, pc.ux), ty = Math.atan2(pc.vy, pc.uy);
      const lo = Math.min(pc.a0, pc.a1), hi = Math.max(pc.a0, pc.a1);
      for (const base of [tx, tx + Math.PI, ty, ty + Math.PI]) {
        let t = base;
        t -= Math.floor((t - lo) / TAU) * TAU;
        while (t <= hi) { ts.push(t); t += TAU; }
      }
      for (const t of ts) {
        const q = arcPt(pc, t);
        if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1];
        if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1];
      }
      if (!isFinite(rx) || !isFinite(ry)) continue;
    } else {
      const p = pc.p;
      for (let i = 0; i < p.length; i += 2) {
        const x = p[i], y = p[i + 1];
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
        if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      }
    }
  }
  return b;
}

function pushStroke(p, M, pcs, extra) {
  if (!pcs.length) return;
  const b = bboxPieces(pcs);
  if (!isFinite(b[0])) return;
  const prim = { t: 's', L: p.li, c: p.color, lw: p.lw, d: dashFor(p, M), pc: pcs, b };
  if (extra) Object.assign(prim, extra);
  prims.push(prim);
  L[p.li].count++;
}

// --------------------------------------------------------------- texto MTEXT
// Algunos DXF UTF-8 llegan decodificados como Latin-1 ("LÃ­nea"): se repara.
function fixUtf8(s) {
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 255) return s; bytes[i] = c; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) { return s; }
}
function decodeSpecial(s) {
  return fixUtf8(s)
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
    .replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%')
    .replace(/%%(\d{3})/g, (_, n) => String.fromCharCode(+n))
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\M\+[0-9a-fA-F]([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function mtextPlain(raw) {
  let s = decodeSpecial(raw || '');
  s = s.replace(/\\[Pp]/g, '\n').replace(/\\~/g, ' ');
  s = s.replace(/\\S([^;]*?)[\^#\/]([^;]*?);/g, '$1/$2');
  s = s.replace(/\\[fFcCHhWwQqTtAaPp][^;\\{}]*;/g, '');
  s = s.replace(/\\[LlOoKkNX]/g, '');
  s = s.replace(/\\\\/g, '\u0001').replace(/\\\{/g, '\u0002').replace(/\\\}/g, '\u0003');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\u0001/g, '\\').replace(/\u0002/g, '{').replace(/\u0003/g, '}');
  return s;
}
function wrapLines(text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!(maxW > 0)) { out.push(para); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const cand = line + w;
      if (line && measure(cand.trimEnd()) > maxW * 1.0001 && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = cand;
    }
    out.push(line);
  }
  return out;
}

function pushText(p, x, y, m, lines, ha, y0, ls) {
  const lw = lines.map((s) => measure(s));
  if (!lines.some((s) => s.trim())) return;
  // caja en el mundo
  const wmax = Math.max(...lw, 0.1);
  const n = lines.length;
  const xs = [-ha * wmax / 2, wmax - ha * wmax / 2];
  const ys = [y0 + 1.1, y0 - (n - 1) * ls - 0.35];
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const u of xs) for (const v of ys) {
    const X = x + m[0] * u + m[2] * v, Y = y + m[1] * u + m[3] * v;
    if (X < b[0]) b[0] = X; if (Y < b[1]) b[1] = Y; if (X > b[2]) b[2] = X; if (Y > b[3]) b[3] = Y;
  }
  prims.push({ t: 't', L: p.li, c: p.color, x, y, m, ln: lines, lw, ls, y0, ha, b });
  L[p.li].count++;
  snap(x, y);
}

function doText(e, ctx, M, p, tb) {
  tb = tb || e;
  const str = decodeSpecial(tb.text || '');
  if (!str) return;
  const Mo = withOcs(M, tb.extrusionDirection, 0);
  const h = tb.textHeight || 1;
  let r = tb.rotation || 0;
  let wf = tb.xScale || 1;
  const obl = tb.obliqueAngle || 0;
  let sx = 1, sy = 1;
  if (tb.generationFlag & 2) sx = -1;
  if (tb.generationFlag & 4) sy = -1;
  const ha0 = tb.halign || 0, va0 = tb.valign || 0;
  let anchor = tb.startPoint || { x: 0, y: 0 };
  let ha = 0, va = 0;
  if (ha0 === 3 || ha0 === 5) {
    const s = tb.startPoint, en = tb.endPoint;
    const dx = en.x - s.x, dy = en.y - s.y, len = Math.hypot(dx, dy);
    if (len > 1e-12) {
      r = Math.atan2(dy, dx);
      const w = measure(str) * h * wf;
      const k = len / Math.max(w, 1e-12);
      // Alineado (3): escala altura y ancho; Ajustar (5): sólo estira el ancho
      if (ha0 === 5) return emitText(p, Mo, s, h, r, wf * k, obl, sx, sy, 0, 0, str);
      return emitText(p, Mo, s, h * k, r, wf, obl, sx, sy, 0, 0, str);
    }
  } else if (ha0 !== 0 || va0 !== 0) {
    anchor = tb.endPoint || anchor;
    if (ha0 === 4) { ha = 1; va = 2; } else ha = ha0;
    if (ha0 !== 4) va = va0;
  }
  emitText(p, Mo, anchor, h, r, wf, obl, sx, sy, ha, va, str);
}
function emitText(p, M, anchor, h, r, wf, obl, sx, sy, ha, va, str) {
  // local (u: unidades de altura a lo largo de la línea base, v: hacia arriba)
  let m = mul(rot(r), [wf * sx, 0, Math.tan(obl), sy, 0, 0]);
  m = mul(scl(h, h), m);
  const o = tp(M, anchor.x, anchor.y);
  const W = mul(M, m);
  const y0 = va === 0 ? 0 : va === 1 ? 0.3 : va === 2 ? -0.5 : -1;
  pushText(p, o[0], o[1], [W[0], W[1], W[2], W[3]], [str], ha, y0, 1.6667);
}

function doMText(e, ctx, M, p) {
  const raw = e.text || '';
  const plain = mtextPlain(raw);
  if (!plain.trim()) return;
  const h = e.textHeight || 1;
  const Mo = M; // MTEXT está en WCS
  let r = e.rotation || 0;
  const d = e.direction;
  if (d && Math.hypot(d.x, d.y) > 1e-9) r = Math.atan2(d.y, d.x);
  const wrapW = e.rectWidth > 0 ? e.rectWidth / h : 0;
  const lines = wrapLines(plain, wrapW);
  const ls = 1.6667 * (e.lineSpacing || 1);
  const ap = e.attachmentPoint || 1;
  const col = (ap - 1) % 3; // 0 izq, 1 centro, 2 der
  const row = Math.floor((ap - 1) / 3); // 0 arriba, 1 medio, 2 abajo
  const n = lines.length;
  const totalH = 1 + (n - 1) * ls;
  const y0 = row === 0 ? -1 : row === 1 ? -1 + totalH / 2 : -1 + totalH;
  const m = mul(scl(h, h), rot(r));
  const o = tp(Mo, e.insertionPoint.x, e.insertionPoint.y);
  const W = mul(Mo, m);
  pushText(p, o[0], o[1], [W[0], W[1], W[2], W[3]], lines, col, y0, ls);
}

// --------------------------------------------------------------- sombreados
function edgePieces(M, path) {
  const pcs = [];
  if (path.vertices) {
    bulgePieces(M, path.vertices, true, pcs, false);
    return pcs;
  }
  for (const ed of path.edges || []) {
    switch (ed.type) {
      case 1: { const a = tp(M, ed.start.x, ed.start.y), b = tp(M, ed.end.x, ed.end.y); pcs.push({ k: 0, p: Float64Array.from([a[0], a[1], b[0], b[1]]) }); break; }
      case 2: {
        let a0 = ed.startAngle, a1 = ed.endAngle;
        const r = ed.radius;
        if (ed.isCCW === false) { a0 = -a0; a1 = -a1; while (a1 > a0) a1 -= TAU; }
        else { while (a1 < a0) a1 += TAU; }
        pcs.push(arcPiece(M, ed.center.x, ed.center.y, r, 0, 0, r, a0, a1));
        break;
      }
      case 3: {
        let a0 = ed.startAngle, a1 = ed.endAngle;
        const ux = ed.end.x, uy = ed.end.y, k = ed.lengthOfMinorAxis;
        if (ed.isCCW === false) { a0 = -a0; a1 = -a1; while (a1 > a0) a1 -= TAU; }
        else { while (a1 < a0) a1 += TAU; }
        pcs.push(arcPiece(M, ed.center.x, ed.center.y, ux, uy, -uy * k, ux * k, a0, a1));
        break;
      }
      case 4: {
        const cps = ed.controlPoints || [];
        const w = cps.map((c) => (c.weight == null ? 1 : c.weight));
        if (cps.length >= 2) pcs.push(...nurbsPieces(M, ed.degree, ed.knots, cps, w));
        else if (ed.fitDatum && ed.fitDatum.length >= 2) {
          const ch = fitSpline(ed.fitDatum, ed.startTangent, ed.endTangent, false);
          if (ch) { const o = new Float64Array(ch.length); for (let i = 0; i < ch.length; i += 2) { const q = tp(M, ch[i], ch[i + 1]); o[i] = q[0]; o[i + 1] = q[1]; } pcs.push({ k: 2, p: o }); }
        }
        break;
      }
    }
  }
  return pcs;
}

function doHatch(e, ctx, M, p) {
  const Mo = withOcs(M, e.extrusionDirection, 0);
  const loops = [];
  for (const bp of e.boundaryPaths || []) {
    const pcs = edgePieces(Mo, bp);
    if (pcs.length) loops.push(pcs);
  }
  if (!loops.length) return;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const lp of loops) bboxPieces(lp, b);
  if (!isFinite(b[0])) return;
  const solid = e.solidFill === 1 || /^SOLID$/i.test(e.patternName || '') || e.gradientFlag === 1;
  let color = p.color;
  if (e.gradientFlag === 1 && e.gradientColors && e.gradientColors.length) {
    const g = e.gradientColors[0];
    color = g.rgb != null ? g.rgb & 0xffffff : color;
  }
  const prim = { t: 'f', L: p.li, c: color, loops, solid, b };
  if (!solid) {
    const k = Math.sqrt(Math.abs(det(Mo)));
    const fam = [];
    for (const dl of e.definitionLines || []) {
      const dir = [Math.cos(dl.angle), Math.sin(dl.angle)];
      const base = tp(Mo, dl.base.x, dl.base.y);
      const D = [Mo[0] * dir[0] + Mo[2] * dir[1], Mo[1] * dir[0] + Mo[3] * dir[1]];
      const dl2 = Math.hypot(D[0], D[1]) || 1;
      const O = [Mo[0] * dl.offset.x + Mo[2] * dl.offset.y, Mo[1] * dl.offset.x + Mo[3] * dl.offset.y];
      const dash = (dl.dashLengths || []).map((v) => v * k);
      fam.push({ bx: base[0], by: base[1], dx: D[0] / dl2, dy: D[1] / dl2, ox: O[0], oy: O[1], dash });
    }
    if (fam.length) prim.hl = fam; else prim.solid = true;
  }
  prims.push(prim);
  L[p.li].count++;
}

// --------------------------------------------------------------- entidades
function processEntity(e, ctx) {
  if (!e || e.isVisible === false) return;
  const M = ctx.M;
  const p = props(e, ctx);
  stats[e.type] = (stats[e.type] || 0) + 1;
  switch (e.type) {
    case 'LINE': {
      const a = tp(M, e.startPoint.x, e.startPoint.y), b = tp(M, e.endPoint.x, e.endPoint.y);
      snap(a[0], a[1]); snap(b[0], b[1]); snap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pushStroke(p, M, [{ k: 0, p: Float64Array.from([a[0], a[1], b[0], b[1]]) }]);
      break;
    }
    case 'CIRCLE': case 'ARC': {
      const Mo = withOcs(M, e.extrusionDirection, 0);
      const r = e.radius;
      let a0 = 0, a1 = TAU;
      if (e.type === 'ARC') { a0 = e.startAngle; a1 = e.endAngle; while (a1 <= a0) a1 += TAU; }
      const pc = arcPiece(Mo, e.center.x, e.center.y, r, 0, 0, r, a0, a1);
      snap(pc.cx, pc.cy);
      if (e.type === 'ARC') { const s = arcPt(pc, a0), f = arcPt(pc, a1), m = arcPt(pc, (a0 + a1) / 2); snap(s[0], s[1]); snap(f[0], f[1]); snap(m[0], m[1]); }
      else for (let i = 0; i < 4; i++) { const q = arcPt(pc, i * Math.PI / 2); snap(q[0], q[1]); }
      pushStroke(p, Mo, [pc]);
      break;
    }
    case 'ELLIPSE': {
      const u = e.majorAxisEndPoint, k = e.axisRatio || 1;
      const nz = e.extrusionDirection && e.extrusionDirection.z < 0 ? -1 : 1;
      let a0 = e.startAngle || 0, a1 = e.endAngle == null ? TAU : e.endAngle;
      while (a1 <= a0) a1 += TAU;
      const pc = arcPiece(M, e.center.x, e.center.y, u.x, u.y, -u.y * k * nz, u.x * k * nz, a0, a1);
      snap(pc.cx, pc.cy);
      const s = arcPt(pc, a0), f = arcPt(pc, a1); snap(s[0], s[1]); snap(f[0], f[1]);
      pushStroke(p, M, [pc]);
      break;
    }
    case 'LWPOLYLINE': {
      const Mo = withOcs(M, e.extrusionDirection, e.elevation);
      const closed = !!(e.flag & 1) || !!(e.flag & 512);
      const pcs = bulgePieces(Mo, e.vertices || [], closed, [], true);
      const w = e.constantWidth > 0 ? e.constantWidth * Math.sqrt(Math.abs(det(Mo))) : 0;
      pushStroke(p, Mo, pcs, w ? { w } : null);
      break;
    }
    case 'POLYLINE2D': case 'POLYLINE3D': case 'POLYLINE': {
      const flag = e.flag || 0;
      const vs = e.vertices || [];
      if (flag & 64) { doPolyface(e, M, p); break; }
      if (flag & 16) { doMesh(e, M, p); break; }
      const Mo = e.type === 'POLYLINE2D' ? withOcs(M, e.extrusionDirection, e.elevation) : M;
      let use = vs;
      if (flag & 6) { const fitted = vs.filter((v) => !(v.flag & 16)); if (fitted.length >= 2) use = fitted; }
      else use = vs.filter((v) => !(v.flag & 16));
      const closed = !!(flag & 1);
      const pcs = bulgePieces(Mo, use.map((v) => ({ x: v.x, y: v.y, bulge: e.type === 'POLYLINE3D' ? 0 : v.bulge })), closed, [], true);
      const w = e.startWidth > 0 && e.startWidth === e.endWidth ? e.startWidth * Math.sqrt(Math.abs(det(Mo))) : 0;
      pushStroke(p, Mo, pcs, w ? { w } : null);
      break;
    }
    case 'SPLINE': {
      const pcs = splinePieces(M, e);
      for (const pc of pcs) { const q = pc.p; snap(q[0], q[1]); snap(q[q.length - 2], q[q.length - 1]); }
      pushStroke(p, M, pcs);
      break;
    }
    case 'POINT': {
      const q = tp(M, e.position.x, e.position.y);
      snap(q[0], q[1]);
      prims.push({ t: 'p', L: p.li, c: p.color, x: q[0], y: q[1], b: [q[0], q[1], q[0], q[1]] });
      L[p.li].count++;
      break;
    }
    case 'TEXT': doText(e, ctx, M, p); break;
    case 'ATTDEF': break; // definiciones de atributo: no se muestran en las inserciones
    case 'ATTRIB': {
      if (e.flags & 1) break;
      if (e.mtext && e.mtext.text && e.mtextFlag) {
        doMText({ ...e.mtext, rotation: e.mtext.rotation, attachmentPoint: e.mtext.attachmentPoint }, ctx, M, p);
      } else doText(e, ctx, M, p, e.text);
      break;
    }
    case 'MTEXT': doMText(e, ctx, M, p); break;
    case 'INSERT': doInsert(e, ctx, p); break;
    case 'DIMENSION': {
      const blk = blocksByName.get(e.name);
      if (blk) processBlockEntities(blk, { M, color: p.color, layer: p.lname, lw: p.lw, ltype: p.lt, depth: ctx.depth + 1 });
      break;
    }
    case 'ACAD_TABLE': case 'TABLE': {
      // el bloque anónimo de la tabla está en coordenadas locales: se inserta en startPoint
      const blk = blocksByHandle.get(e.blockRecordHandle);
      const sp = e.startPoint || { x: 0, y: 0 };
      const dv = e.directionVector;
      const ang = dv && Math.hypot(dv.x, dv.y) > 1e-12 ? Math.atan2(dv.y, dv.x) : 0;
      const Mt = mul(M, mul(trans(sp.x, sp.y), rot(ang)));
      if (blk) processBlockEntities(blk, { M: Mt, color: p.color, layer: p.lname, lw: p.lw, ltype: p.lt, depth: ctx.depth + 1 });
      break;
    }
    case 'HATCH': doHatch(e, ctx, M, p); break;
    case 'SOLID': case 'TRACE': {
      const Mo = withOcs(M, e.extrusionDirection, 0);
      const c = [e.corner1, e.corner2, e.corner4 || e.corner3, e.corner3].map((q) => tp(Mo, q.x, q.y));
      const pts = Float64Array.from([c[0][0], c[0][1], c[1][0], c[1][1], c[3][0], c[3][1], c[2][0], c[2][1], c[0][0], c[0][1]]);
      const loops = [[{ k: 0, p: pts }]];
      prims.push({ t: 'f', L: p.li, c: p.color, loops, solid: true, b: bboxPieces(loops[0]) });
      L[p.li].count++;
      for (const q of c) snap(q[0], q[1]);
      break;
    }
    case '3DFACE': {
      const c = [e.corner1, e.corner2, e.corner3, e.corner4 || e.corner3].map((q) => tp(M, q.x, q.y));
      const fl = e.flag || 0;
      const pcs = [];
      for (let i = 0; i < 4; i++) {
        if (fl & (1 << i)) continue;
        const a = c[i], b = c[(i + 1) % 4];
        pcs.push({ k: 0, p: Float64Array.from([a[0], a[1], b[0], b[1]]) });
      }
      for (const q of c) snap(q[0], q[1]);
      pushStroke(p, M, pcs);
      break;
    }
    case 'LEADER': {
      const vs = e.vertices || [];
      if (vs.length < 2) break;
      const pts = [];
      for (const v of vs) { const q = tp(M, v.x, v.y); pts.push(q[0], q[1]); snap(q[0], q[1]); }
      pushStroke(p, M, [{ k: 0, p: Float64Array.from(pts) }]);
      if (e.isArrowheadEnabled !== false) arrow(p, pts[2], pts[3], pts[0], pts[1], (e.textHeight || 0) || segLen(pts) * 0.06);
      break;
    }
    case 'MLINE': {
      const vs = e.vertices || [];
      if (vs.length < 2) break;
      const nl = e.numberOfLines || (vs[0].lines ? vs[0].lines.length : 0);
      const closed = !!(e.flags & 2);
      for (let j = 0; j < nl; j++) {
        const pts = [];
        for (const v of vs) {
          const ln = v.lines && v.lines[j];
          const off = ln && ln.segmentParams && ln.segmentParams.length ? ln.segmentParams[0] : 0;
          const q = tp(M, v.vertex.x + v.miterDirection.x * off, v.vertex.y + v.miterDirection.y * off);
          pts.push(q[0], q[1]);
        }
        if (closed) pts.push(pts[0], pts[1]);
        pushStroke(p, M, [{ k: 0, p: Float64Array.from(pts) }]);
      }
      for (const v of vs) { const q = tp(M, v.vertex.x, v.vertex.y); snap(q[0], q[1]); }
      break;
    }
    case 'XLINE': case 'RAY': {
      const q = tp(M, e.firstPoint.x, e.firstPoint.y);
      const d = e.unitDirection;
      const dx = M[0] * d.x + M[2] * d.y, dy = M[1] * d.x + M[3] * d.y;
      const l = Math.hypot(dx, dy);
      if (l < 1e-15) break;
      snap(q[0], q[1]);
      prims.push({ t: 'x', L: p.li, c: p.color, lw: p.lw, d: dashFor(p, M), x: q[0], y: q[1], dx: dx / l, dy: dy / l, ray: e.type === 'RAY', b: [-Infinity, -Infinity, Infinity, Infinity] });
      L[p.li].count++;
      break;
    }
    case 'WIPEOUT': {
      const bp = e.clippingBoundaryPath || [];
      if (bp.length < 2 || !e.uPixel || !e.vPixel || !e.position) break;
      let pts = bp;
      if (bp.length === 2) pts = [bp[0], { x: bp[1].x, y: bp[0].y }, bp[1], { x: bp[0].x, y: bp[1].y }];
      const H = (e.imageSize && e.imageSize.y) || 1;
      const out = [];
      for (const q of pts) {
        const u = q.x + 0.5, v = H - 0.5 - q.y;
        const X = e.position.x + e.uPixel.x * u + e.vPixel.x * v;
        const Y = e.position.y + e.uPixel.y * u + e.vPixel.y * v;
        const w = tp(M, X, Y); out.push(w[0], w[1]);
      }
      out.push(out[0], out[1]);
      const loops = [[{ k: 0, p: Float64Array.from(out) }]];
      prims.push({ t: 'wo', L: p.li, loops, b: bboxPieces(loops[0]) });
      break;
    }
    default:
      stats['(sin soporte) ' + e.type] = (stats['(sin soporte) ' + e.type] || 0) + 1;
      stats[e.type]--;
      break;
  }
}
function segLen(pts) { let s = 0; for (let i = 2; i < pts.length; i += 2) s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); return s; }
function arrow(p, fx, fy, tx, ty, size) {
  const dx = tx - fx, dy = ty - fy, l = Math.hypot(dx, dy);
  if (l < 1e-12 || !(size > 0)) return;
  const ux = dx / l, uy = dy / l, s = size, w = s / 6;
  const bx = tx - ux * s, by = ty - uy * s;
  const pts = Float64Array.from([tx, ty, bx - uy * w, by + ux * w, bx + uy * w, by - ux * w, tx, ty]);
  const loops = [[{ k: 0, p: pts }]];
  prims.push({ t: 'f', L: p.li, c: p.color, loops, solid: true, b: bboxPieces(loops[0]) });
}

function doPolyface(e, M, p) {
  const vs = e.vertices || [];
  const pos = vs.filter((v) => v.flag & 64);
  const faces = vs.filter((v) => (v.flag & 128) && !(v.flag & 64));
  const pts = pos.map((v) => tp(M, v.x, v.y));
  const pcs = [];
  for (const f of faces) {
    const idx = [f.polyfaceIndex0, f.polyfaceIndex1, f.polyfaceIndex2, f.polyfaceIndex3].filter((i) => i);
    for (let i = 0; i < idx.length; i++) {
      const a = idx[i], b = idx[(i + 1) % idx.length];
      if (a < 0) continue;
      const A = pts[Math.abs(a) - 1], B = pts[Math.abs(b) - 1];
      if (A && B) pcs.push({ k: 0, p: Float64Array.from([A[0], A[1], B[0], B[1]]) });
    }
  }
  pushStroke(p, M, pcs);
}
function doMesh(e, M, p) {
  const m = e.meshMVertexCount || 0, n = e.meshNVertexCount || 0;
  const vs = (e.vertices || []).map((v) => tp(M, v.x, v.y));
  if (m * n !== vs.length || !m || !n) return;
  const pcs = [];
  for (let i = 0; i < m; i++) { const pts = []; for (let j = 0; j < n; j++) pts.push(...vs[i * n + j]); pcs.push({ k: 0, p: Float64Array.from(pts) }); }
  for (let j = 0; j < n; j++) { const pts = []; for (let i = 0; i < m; i++) pts.push(...vs[i * n + j]); pcs.push({ k: 0, p: Float64Array.from(pts) }); }
  pushStroke(p, M, pcs);
}

function doInsert(e, ctx, p) {
  const blk = blocksByName.get(e.name) || blocksByName.get((e.name || '').toUpperCase());
  // atributos: están en el espacio del padre
  for (const a of e.attribs || []) processEntity(a, ctx);
  if (!blk || ctx.depth > 24) return;
  if (ctx.stack && ctx.stack.includes(blk)) return;
  const bp = blk.basePoint || { x: 0, y: 0 };
  const Mo = withOcs(ctx.M, e.extrusionDirection, 0);
  const rows = Math.max(1, e.rowCount || 1), cols = Math.max(1, e.columnCount || 1);
  if (rows * cols > 100000) return;
  const R = rot(e.rotation || 0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const off = tp(R, c * (e.columnSpacing || 0), r * (e.rowSpacing || 0));
      let m = trans(e.insertionPoint.x + off[0], e.insertionPoint.y + off[1]);
      m = mul(m, R);
      m = mul(m, scl(e.xScale || 1, e.yScale || 1));
      m = mul(m, trans(-bp.x, -bp.y));
      const M = mul(Mo, m);
      const ins = tp(Mo, e.insertionPoint.x + off[0], e.insertionPoint.y + off[1]);
      snap(ins[0], ins[1]);
      processBlockEntities(blk, { M, color: p.color, layer: p.lname, lw: p.lw, ltype: p.lt, depth: ctx.depth + 1, stack: (ctx.stack || []).concat(blk) });
    }
  }
}

function processBlockEntities(blk, ctx) {
  for (const ent of blk.entities || []) {
    if (ent.type === 'ATTDEF') continue;
    try { processEntity(ent, ctx); } catch (err) { stats['(error) ' + ent.type] = (stats['(error) ' + ent.type] || 0) + 1; }
  }
}

// --------------------------------------------------------------- principal
function flatten(db) {
  L = []; layerIdx = new Map(); prims = []; snaps = []; stats = {};
  for (const l of db.tables.LAYER.entries || []) {
    const i = L.length;
    layerIdx.set(l.name, i);
    L.push({
      name: l.name,
      color: aci(Math.abs(l.colorIndex == null ? 7 : l.colorIndex) || 7),
      ltype: (l.lineType || 'CONTINUOUS').toUpperCase(),
      lw: (() => { const v = lwValue(l.lineweight); return v < 0 ? 25 : v; })(),
      visible: !(l.off || l.frozen || (l.colorIndex != null && l.colorIndex < 0)),
      count: 0,
    });
  }
  ltypes = new Map();
  for (const lt of db.tables.LTYPE.entries || []) {
    const pat = (lt.pattern || []).map((x) => x.elementLength).filter((x) => x != null);
    if (pat.length && pat.some((v) => v !== 0)) ltypes.set(lt.name.toUpperCase(), pat);
  }
  ltscale = (db.header && db.header.LTSCALE) || 1;
  blocksByName = new Map(); blocksByHandle = new Map();
  let model = null;
  for (const b of db.tables.BLOCK_RECORD.entries || []) {
    blocksByName.set(b.name, b);
    blocksByHandle.set(b.handle, b);
    if (/^\*model_space$/i.test(b.name)) model = b;
  }
  let ents = db.entities || [];
  if (model && model.entities && model.entities.length) ents = model.entities;
  else if (model) ents = ents.filter((e) => !e.isInPaperSpace && (!e.ownerBlockRecordSoftId || e.ownerBlockRecordSoftId === model.handle));
  const ctx = { M: I, color: FG, layer: null, lw: 25, ltype: 'CONTINUOUS', depth: 0 };
  let n = 0;
  for (const e of ents) {
    try { processEntity(e, ctx); } catch (err) { stats['(error) ' + e.type] = (stats['(error) ' + e.type] || 0) + 1; }
    if (++n % 2000 === 0) progress(`Procesando entidades ${n}/${ents.length}…`);
  }
  // extensión (sin líneas infinitas, usando percentiles para ignorar objetos perdidos muy lejos)
  const ext = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pr of prims) {
    if (pr.t === 'x') continue;
    const b = pr.b;
    if (b[0] < ext[0]) ext[0] = b[0]; if (b[1] < ext[1]) ext[1] = b[1];
    if (b[2] > ext[2]) ext[2] = b[2]; if (b[3] > ext[3]) ext[3] = b[3];
  }
  if (!isFinite(ext[0])) { ext[0] = ext[1] = 0; ext[2] = ext[3] = 100; }
  const units = db.header ? db.header.INSUNITS : 0;
  return { layers: L, prims, ext: robustExtents(ext), extFull: ext, snaps: Float64Array.from(snaps), stats, units };
}

// Extensión "robusta": si unos pocos objetos están perdidos muy lejos, encuadra
// la zona donde está la mayoría del dibujo (como haría un usuario a mano).
function robustExtents(full) {
  const cs = prims.filter((p) => p.t !== 'x' && p.t !== 'wo');
  if (cs.length < 20) return full;
  const xs = cs.map((p) => (p.b[0] + p.b[2]) / 2).sort((a, b) => a - b);
  const ys = cs.map((p) => (p.b[1] + p.b[3]) / 2).sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
  const qx0 = q(xs, 0.02), qx1 = q(xs, 0.98), qy0 = q(ys, 0.02), qy1 = q(ys, 0.98);
  const mw = Math.max(qx1 - qx0, qy1 - qy0, 1e-9);
  const bx0 = qx0 - mw * 0.5, bx1 = qx1 + mw * 0.5, by0 = qy0 - mw * 0.5, by1 = qy1 + mw * 0.5;
  const e = [Infinity, Infinity, -Infinity, -Infinity];
  let n = 0;
  for (const p of cs) {
    const cx = (p.b[0] + p.b[2]) / 2, cy = (p.b[1] + p.b[3]) / 2;
    if (cx < bx0 || cx > bx1 || cy < by0 || cy > by1) continue;
    if (p.b[2] - p.b[0] > mw * 4 || p.b[3] - p.b[1] > mw * 4) continue;
    n++;
    if (p.b[0] < e[0]) e[0] = p.b[0]; if (p.b[1] < e[1]) e[1] = p.b[1];
    if (p.b[2] > e[2]) e[2] = p.b[2]; if (p.b[3] > e[3]) e[3] = p.b[3];
  }
  if (n < cs.length * 0.9 || !isFinite(e[0])) return full;
  const fa = (full[2] - full[0]) * (full[3] - full[1]), ea = (e[2] - e[0]) * (e[3] - e[1]);
  return fa > ea * 50 ? e : full;
}

function detectType(bytes) {
  const head = String.fromCharCode(...bytes.subarray(0, 6));
  if (/^AC\d{4}/.test(head) || /^AC1\./.test(head) || /^MC0\.0/.test(head)) return 'dwg';
  return 'dxf';
}

let progress = () => {};

// Lee el archivo y devuelve la geometría lista para dibujar.
export async function processFile(buffer, onProgress) {
  progress = onProgress || (() => {});
  progress('Cargando motor DWG…');
  let lib;
  try { lib = await getLib(); } catch (err) {
    libPromise = null;
    const e = new Error('No se pudo cargar el motor DWG: ' + ((err && err.message) || err));
    e.stage = 'init';
    throw e;
  }
  const bytes = new Uint8Array(buffer);
  const kind = detectType(bytes);
  progress(kind === 'dwg' ? 'Leyendo DWG…' : 'Leyendo DXF…');
  const t0 = performance.now();
  const ptr = lib.dwg_read_data(buffer, kind === 'dwg' ? Dwg_File_Type.DWG : Dwg_File_Type.DXF);
  if (!ptr) throw new Error('No se pudo leer el archivo (formato no compatible o archivo dañado).');
  progress('Convirtiendo…');
  let db;
  try { db = lib.convert(ptr); } finally { try { lib.dwg_free(ptr); } catch (e) { /* */ } }
  const t1 = performance.now();
  progress('Generando geometría…');
  const out = flatten(db);
  out.kind = kind;
  out.version = db.header && (db.header.ACADVER || db.header.version);
  out.timing = { parse: Math.round(t1 - t0), geom: Math.round(performance.now() - t1) };
  return out;
}
