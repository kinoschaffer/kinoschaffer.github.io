// Renderizador vectorial con zoom "infinito".
//
// Todo se transforma a coordenadas de pantalla en doble precisión (JS) en cada
// fotograma, y las curvas (arcos, elipses, splines) se subdividen según el
// tamaño en pantalla, descartando las partes fuera de la vista. Así el canvas
// nunca recibe coordenadas gigantes y la calidad no se pierde con el zoom.

const TAU = Math.PI * 2;
const SAFE = 20000; // coordenadas de pantalla "seguras" para el canvas
const USE_ELLIPSE = true;
const EM = 1.4;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.view = { cx: 0, cy: 0, s: 1 };
    this.dark = true;
    this.showLw = false;
    this.data = null;
    this.layerVis = [];
    this.overlay = null;
    this.lastDrawMs = 0;
    this.snapCanvas = document.createElement('canvas');
    this.snapView = null;
    this.colorCache = new Map();
    this.dpr = 1;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  resize(cssW, cssH, dpr) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.snapView = null;
    }
  }

  setData(data) {
    this.data = data;
    this.layerVis = data.layers.map((l) => l.visible);
    // Agrupar por estilo para dibujar muchos objetos con una sola llamada stroke()
    const strokeB = new Map();
    const fills = [], texts = [], points = [];
    for (const p of data.prims) {
      if (p.t === 's' || p.t === 'x') {
        const key = p.c + '|' + p.lw + '|' + (p.d ? p.d.join(',') : '') + '|' + (p.w || 0);
        let b = strokeB.get(key);
        if (!b) { b = { c: p.c, lw: p.lw, d: p.d, w: p.w || 0, items: [] }; strokeB.set(key, b); }
        b.items.push(p);
      } else if (p.t === 'f') fills.push(p);
      else if (p.t === 't') texts.push(p);
      else if (p.t === 'p') points.push(p);
    }
    this.strokeBuckets = [...strokeB.values()];
    this.fills = fills;
    this.texts = texts;
    this.points = points;
    this.snapView = null;
    this.lastDrawMs = 0;
    this.cancelJob();
    this.buildIndex();
  }

  css(c) {
    const bg = this.dark ? 0x16181d : 0xffffff;
    if (c === -1 || c === bg || (this.dark && c === 0x000000) || (!this.dark && c === 0xffffff)) c = this.dark ? 0xffffff : 0x000000;
    let s = this.colorCache.get(c);
    if (!s) { s = '#' + (c >>> 0 & 0xffffff).toString(16).padStart(6, '0'); this.colorCache.set(c, s); }
    return s;
  }
  get bgCss() { return this.dark ? '#16181d' : '#ffffff'; }

  // ------------------------------------------------------------------ dibujo
  // Dibujo completo. Si el plano es pesado, se dibuja por partes en un canvas
  // de trabajo (sin bloquear la interfaz) mientras se muestra la imagen anterior.
  draw(fast) {
    const ctx = this.ctx;
    if (fast && this.snapView && this.lastDrawMs > 45) {
      this.cancelJob();
      this.drawSnapshot();
      if (this.overlay) this.overlay(ctx);
      return;
    }
    this.cancelJob();
    if (!this.data || !this.snapView || this.lastDrawMs < 60) {
      const t0 = performance.now();
      const it = this.frameGen(ctx, this.T(), Infinity);
      while (!it.next().done) { /* síncrono */ }
      this.lastDrawMs = performance.now() - t0;
      this.saveSnapshot(this.canvas);
      if (this.overlay) this.overlay(ctx);
      return;
    }
    // dibujo progresivo
    const work = this.workCanvas || (this.workCanvas = document.createElement('canvas'));
    if (work.width !== this.W || work.height !== this.H) { work.width = this.W; work.height = this.H; }
    const wctx = work.getContext('2d', { alpha: false });
    const view = { ...this.view };
    const job = { cancelled: false, budget: 14 };
    const it = this.frameGen(wctx, this.T(), job);
    this.drawSnapshot();
    if (this.overlay) this.overlay(ctx);
    let spent = 0;
    const step = () => {
      if (job.cancelled) return;
      const t0 = performance.now();
      job.deadline = t0 + job.budget;
      const r = it.next();
      spent += performance.now() - t0;
      if (!r.done) { job.raf = requestAnimationFrame(step); return; }
      this.job = null;
      this.lastDrawMs = spent;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(work, 0, 0);
      this.saveSnapshot(work, view);
      if (this.overlay) this.overlay(ctx);
    };
    this.job = job;
    job.raf = requestAnimationFrame(step);
  }

  cancelJob() {
    if (this.job) { this.job.cancelled = true; cancelAnimationFrame(this.job.raf); this.job = null; }
  }

  saveSnapshot(src, view) {
    const sc = this.snapCanvas;
    if (sc.width !== this.W || sc.height !== this.H) { sc.width = this.W; sc.height = this.H; }
    sc.getContext('2d').drawImage(src, 0, 0);
    this.snapView = view || { ...this.view };
  }

  // Generador de un fotograma completo; cede el control cuando se agota el tiempo.
  *frameGen(ctx, T, job) {
    this.out = ctx;
    this.job_ = job === Infinity ? null : job;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bgCss;
    ctx.fillRect(0, 0, this.W, this.H);
    if (!this.data) return;
    this.markVisible(T);
    yield* this.drawFills(T);
    yield* this.drawStrokes(T);
    this.drawPoints(T);
    yield* this.drawTexts(T);
    this.out = this.ctx;
  }

  timeUp() {
    const j = this.job_;
    return j && performance.now() > j.deadline;
  }

  // Índice espacial en rejilla para descartar rápido lo que no se ve
  buildIndex() {
    const d = this.data;
    const e = d.ext;
    const w = Math.max(e[2] - e[0], 1e-9), h = Math.max(e[3] - e[1], 1e-9);
    const g = { x0: e[0] - w, y0: e[1] - h, n: 128 };
    g.cw = (3 * w) / g.n; g.ch = (3 * h) / g.n;
    const n = g.n, cells = new Array(n * n);
    const big = [];
    const prims = d.prims;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      p.id = i;
      const b = p.b;
      if (!isFinite(b[0]) || !isFinite(b[2])) { big.push(i); continue; }
      const i0 = Math.floor((b[0] - g.x0) / g.cw), i1 = Math.floor((b[2] - g.x0) / g.cw);
      const j0 = Math.floor((b[1] - g.y0) / g.ch), j1 = Math.floor((b[3] - g.y0) / g.ch);
      if (i0 < 0 || j0 < 0 || i1 >= n || j1 >= n || (i1 - i0 + 1) * (j1 - j0 + 1) > 64) { big.push(i); continue; }
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const k = jj * n + ii;
        (cells[k] || (cells[k] = [])).push(i);
      }
    }
    g.cells = cells; g.big = big;
    this.grid = g;
    this.stamp = new Uint32Array(prims.length);
    this.frameNo = 0;
  }

  markVisible(T) {
    const g = this.grid;
    this.useStamp = false;
    if (!g) return;
    const wx0 = T.cx + (T.x0 - T.hw) / T.s, wx1 = T.cx + (T.x1 - T.hw) / T.s;
    const wy0 = T.cy - (T.y1 - T.hh) / T.s, wy1 = T.cy - (T.y0 - T.hh) / T.s;
    const i0 = Math.max(0, Math.floor((wx0 - g.x0) / g.cw)), i1 = Math.min(g.n - 1, Math.floor((wx1 - g.x0) / g.cw));
    const j0 = Math.max(0, Math.floor((wy0 - g.y0) / g.ch)), j1 = Math.min(g.n - 1, Math.floor((wy1 - g.y0) / g.ch));
    const ncell = i1 >= i0 && j1 >= j0 ? (i1 - i0 + 1) * (j1 - j0 + 1) : 0;
    if (ncell > g.n * g.n * 0.15) return; // vista amplia: revisar todo
    const f = ++this.frameNo;
    const st = this.stamp;
    for (const i of g.big) st[i] = f;
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const c = g.cells[jj * g.n + ii];
      if (c) for (let k = 0; k < c.length; k++) st[c[k]] = f;
    }
    this.useStamp = true;
  }

  drawSnapshot() {
    const ctx = this.ctx, sv = this.snapView, v = this.view;
    const k = v.s / sv.s;
    const hw = this.W / 2, hh = this.H / 2;
    // punto del mundo en el centro de la instantánea, en pantalla actual
    const ox = (sv.cx - v.cx) * v.s + hw, oy = hh - (sv.cy - v.cy) * v.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.bgCss;
    ctx.fillRect(0, 0, this.W, this.H);
    if (k > 1e-6 && k < 1e6) {
      ctx.setTransform(k, 0, 0, k, ox - hw * k, oy - hh * k);
      ctx.drawImage(this.snapCanvas, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  T() {
    const v = this.view, pad = 4 * this.dpr;
    return {
      cx: v.cx, cy: v.cy, s: v.s, hw: this.W / 2, hh: this.H / 2,
      x0: -pad, y0: -pad, x1: this.W + pad, y1: this.H + pad,
    };
  }

  lineWidthFor(lw) {
    const base = Math.max(1, this.dpr * 0.75);
    if (!this.showLw || !(lw > 0)) return base;
    return Math.max(base, lw * 0.04 * this.dpr);
  }

  // Devuelve 0 = fuera, 1 = punto (subpíxel), 2 = visible
  cull(b, T) {
    const X0 = (b[0] - T.cx) * T.s + T.hw, X1 = (b[2] - T.cx) * T.s + T.hw;
    const Y0 = T.hh - (b[3] - T.cy) * T.s, Y1 = T.hh - (b[1] - T.cy) * T.s;
    if (X1 < T.x0 || X0 > T.x1 || Y1 < T.y0 || Y0 > T.y1) return 0;
    if (X1 - X0 < 0.8 && Y1 - Y0 < 0.8) return 1;
    return 2;
  }

  visible(p) {
    return this.layerVis[p.L] && (!this.useStamp || this.stamp[p.id] === this.frameNo);
  }

  *drawStrokes(T) {
    const ctx = this.out;
    const sink = new StrokeSink();
    const dots = [];
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    for (const bk of this.strokeBuckets) {
      const col = this.css(bk.c);
      let lw = this.lineWidthFor(bk.lw);
      if (bk.w) lw = Math.max(lw, bk.w * T.s);
      const dash = this.screenDash(bk.d, T.s);
      const setup = () => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath(); sink.begin(ctx, T); };
      setup();
      let n = 0;
      dots.length = 0;
      const items = bk.items;
      for (let idx = 0; idx < items.length; idx++) {
        const p = items[idx];
        if (!this.visible(p)) continue;
        if (p.t === 'x') { emitXLine(p, sink, T); n++; continue; }
        const b = p.b;
        const X0 = (b[0] - T.cx) * T.s + T.hw, X1 = (b[2] - T.cx) * T.s + T.hw;
        const Y0 = T.hh - (b[3] - T.cy) * T.s, Y1 = T.hh - (b[1] - T.cy) * T.s;
        if (X1 < T.x0 || X0 > T.x1 || Y1 < T.y0 || Y0 > T.y1) continue;
        if (X1 - X0 < 0.8 && Y1 - Y0 < 0.8) { dots.push(X0, Y0); continue; }
        if (X0 > -SAFE && X1 < SAFE && Y0 > -SAFE && Y1 < SAFE) emitFast(p.pc, ctx, T);
        else { sink.begin(ctx, T); emitPieces(p.pc, sink, T); }
        if (++n >= 3000) {
          ctx.stroke(); n = 0;
          if (this.timeUp()) { yield; }
          setup();
        }
      }
      if (n) ctx.stroke();
      if (dots.length) {
        ctx.fillStyle = col;
        const d = Math.max(1, this.dpr * 0.75);
        for (let i = 0; i < dots.length; i += 2) ctx.fillRect(dots[i], dots[i + 1], d, d);
      }
      if (this.timeUp()) yield;
    }
    ctx.setLineDash([]);
  }

  screenDash(d, s) {
    if (!d) return [];
    let total = 0;
    for (const v of d) total += v;
    const px = total * s;
    if (px < 4 * this.dpr || px > 1e6) return [];
    const min = Math.max(1, this.dpr * 0.8);
    return d.map((v, i) => (i % 2 === 0 ? Math.max(v * s, min) : Math.max(v * s, 0.5)));
  }

  *drawFills(T) {
    const ctx = this.out;
    const sink = new FillSink();
    for (const p of this.fills) {
      if (!this.visible(p)) continue;
      const c = this.cull(p.b, T);
      if (c === 0) continue;
      const col = this.css(p.c);
      if (c === 1) { ctx.fillStyle = col; ctx.fillRect((p.b[0] - T.cx) * T.s + T.hw, T.hh - (p.b[1] - T.cy) * T.s, 1, 1); continue; }
      ctx.beginPath();
      sink.begin(ctx, T);
      for (const lp of p.loops) { emitPieces(lp, sink, T); sink.close(); }
      if (p.solid) {
        ctx.fillStyle = col;
        ctx.fill('evenodd');
      } else {
        this.drawPattern(p, T, col);
      }
      if (this.timeUp()) yield;
    }
    ctx.globalAlpha = 1;
  }

  drawPattern(p, T, col) {
    const ctx = this.out;
    // zona visible ∩ caja del sombreado, en coordenadas del mundo
    const vx0 = Math.max(T.cx + (T.x0 - T.hw) / T.s, p.b[0]), vx1 = Math.min(T.cx + (T.x1 - T.hw) / T.s, p.b[2]);
    const vy0 = Math.max(T.cy - (T.y1 - T.hh) / T.s, p.b[1]), vy1 = Math.min(T.cy - (T.y0 - T.hh) / T.s, p.b[3]);
    if (vx1 <= vx0 || vy1 <= vy0) return;
    const corners = [[vx0, vy0], [vx1, vy0], [vx1, vy1], [vx0, vy1]];
    const minSp = 2.5 * this.dpr;
    let dense = false;
    for (const f of p.hl) {
      const on = f.ox * -f.dy + f.oy * f.dx;
      if (Math.abs(on) * T.s < minSp) { dense = true; break; }
    }
    if (dense) {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.clip('evenodd');
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, this.dpr * 0.6);
    ctx.setLineDash([]);
    ctx.beginPath();
    let segs = 0;
    const X = (x) => (x - T.cx) * T.s + T.hw, Y = (y) => T.hh - (y - T.cy) * T.s;
    for (const f of p.hl) {
      const nx = -f.dy, ny = f.dx;
      const on = f.ox * nx + f.oy * ny;
      const od = f.ox * f.dx + f.oy * f.dy;
      let pmin = Infinity, pmax = -Infinity;
      for (const [x, y] of corners) { const v = (x - f.bx) * nx + (y - f.by) * ny; if (v < pmin) pmin = v; if (v > pmax) pmax = v; }
      let k0 = Math.floor(pmin / on), k1 = Math.ceil(pmax / on);
      if (k0 > k1) { const t = k0; k0 = k1; k1 = t; }
      if (k1 - k0 > 5000) continue;
      let plen = 0;
      for (const v of f.dash) plen += Math.abs(v);
      const useDash = f.dash.length > 0 && plen * T.s >= 3 * this.dpr;
      for (let k = k0; k <= k1; k++) {
        const Ox = f.bx + k * f.ox, Oy = f.by + k * f.oy;
        let smin = Infinity, smax = -Infinity;
        for (const [x, y] of corners) { const v = (x - Ox) * f.dx + (y - Oy) * f.dy; if (v < smin) smin = v; if (v > smax) smax = v; }
        if (!useDash) {
          ctx.moveTo(X(Ox + f.dx * smin), Y(Oy + f.dy * smin));
          ctx.lineTo(X(Ox + f.dx * smax), Y(Oy + f.dy * smax));
          segs++;
          continue;
        }
        // el patrón de esta línea arranca desplazado k*od
        let s = Math.floor((smin - k * od) / plen) * plen + k * od;
        const dotLen = 1 / T.s;
        while (s < smax && segs < 300000) {
          for (const v of f.dash) {
            const len = Math.abs(v);
            if (v >= 0) {
              const a = Math.max(s, smin), b = Math.min(s + (len || dotLen), smax);
              if (b > a) {
                ctx.moveTo(X(Ox + f.dx * a), Y(Oy + f.dy * a));
                ctx.lineTo(X(Ox + f.dx * b), Y(Oy + f.dy * b));
                segs++;
              }
            }
            s += len;
            if (s >= smax) break;
          }
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawPoints(T) {
    const ctx = this.out;
    const d = Math.max(2, 2 * this.dpr);
    for (const p of this.points) {
      if (!this.visible(p)) continue;
      const x = (p.x - T.cx) * T.s + T.hw, y = T.hh - (p.y - T.cy) * T.s;
      if (x < T.x0 || x > T.x1 || y < T.y0 || y > T.y1) continue;
      ctx.fillStyle = this.css(p.c);
      ctx.fillRect(x - d / 2, y - d / 2, d, d);
    }
  }

  *drawTexts(T) {
    const ctx = this.out;
    const minPx = 1.5 * this.dpr, linePx = 4.5 * this.dpr;
    ctx.font = (EM * 100) + 'px sans-serif';
    ctx.textBaseline = 'alphabetic';
    const aligns = ['left', 'center', 'right'];
    let tinyPath = null;
    let n = 0;
    for (const p of this.texts) {
      if (!this.visible(p)) continue;
      if (this.cull(p.b, T) === 0) continue;
      const m = p.m;
      const A = m[0] * T.s, B = -m[1] * T.s, C = m[2] * T.s, D = -m[3] * T.s;
      const hpx = Math.hypot(C, D);
      if (hpx < minPx) continue;
      const E = (p.x - T.cx) * T.s + T.hw, F = T.hh - (p.y - T.cy) * T.s;
      const col = this.css(p.c);
      if (hpx < linePx) {
        // texto diminuto: una raya a lo largo de la línea base
        if (!tinyPath) tinyPath = new Map();
        let arr = tinyPath.get(col); if (!arr) { arr = []; tinyPath.set(col, arr); }
        for (let i = 0; i < p.ln.length; i++) {
          const w = p.lw[i]; if (!w) continue;
          const u0 = -p.ha * w / 2, v = p.y0 - i * p.ls + 0.4;
          arr.push(E + A * u0 + C * v, F + B * u0 + D * v, E + A * (u0 + w) + C * v, F + B * (u0 + w) + D * v);
        }
        continue;
      }
      ctx.setTransform(A / 100, B / 100, -C / 100, -D / 100, E, F);
      ctx.fillStyle = col;
      ctx.textAlign = aligns[p.ha] || 'left';
      for (let i = 0; i < p.ln.length; i++) {
        const s = p.ln[i];
        if (s) ctx.fillText(s, 0, -(p.y0 - i * p.ls) * 100);
      }
      if (++n % 200 === 0 && this.timeUp()) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        yield;
        ctx.font = (EM * 100) + 'px sans-serif';
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (tinyPath) {
      ctx.lineWidth = Math.max(1, this.dpr * 0.75);
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([]);
      for (const [col, arr] of tinyPath) {
        ctx.strokeStyle = col;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 4) { ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

// Camino rápido: el objeto entero cabe en coordenadas seguras para el canvas
function emitFast(pcs, ctx, T) {
  const s = T.s, cx = T.cx, cy = T.cy, hw = T.hw, hh = T.hh;
  let lx = NaN, ly = NaN;
  for (const pc of pcs) {
    if (pc.k === 0) {
      const p = pc.p;
      const x = (p[0] - cx) * s + hw, y = hh - (p[1] - cy) * s;
      if (!(Math.abs(x - lx) <= 0.01 && Math.abs(y - ly) <= 0.01)) ctx.moveTo(x, y);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo((p[i] - cx) * s + hw, hh - (p[i + 1] - cy) * s);
      lx = (p[p.length - 2] - cx) * s + hw; ly = hh - (p[p.length - 1] - cy) * s;
    } else if (pc.k === 1) {
      const ccx = (pc.cx - cx) * s + hw, ccy = hh - (pc.cy - cy) * s;
      const ux = pc.ux * s, uy = -pc.uy * s, vx = pc.vx * s, vy = -pc.vy * s;
      const sx = ccx + ux * Math.cos(pc.a0) + vx * Math.sin(pc.a0), sy = ccy + uy * Math.cos(pc.a0) + vy * Math.sin(pc.a0);
      if (!(Math.abs(sx - lx) <= 0.01 && Math.abs(sy - ly) <= 0.01)) ctx.moveTo(sx, sy);
      const ru = Math.hypot(ux, uy), rv = Math.hypot(vx, vy);
      const dot = ux * vx + uy * vy, cross = ux * vy - uy * vx;
      if (USE_ELLIPSE && ru > 0 && rv > 0 && Math.abs(dot) < 1e-9 * ru * rv) {
        const rot = Math.atan2(uy, ux);
        if (cross > 0) ctx.ellipse(ccx, ccy, ru, rv, rot, pc.a0, pc.a1, pc.a1 < pc.a0);
        else ctx.ellipse(ccx, ccy, ru, rv, rot, -pc.a0, -pc.a1, pc.a1 > pc.a0);
      } else {
        // ejes no ortogonales (bloques con escala no uniforme y giro): Bézier
        const sink = FAST_SINK; sink.begin(ctx, T); sink.has = true; sink.at = true; sink.px = sx; sink.py = sy;
        emitArc(pc, sink, T, false);
      }
      lx = ccx + ux * Math.cos(pc.a1) + vx * Math.sin(pc.a1); ly = ccy + uy * Math.cos(pc.a1) + vy * Math.sin(pc.a1);
    } else {
      const p = pc.p;
      const x = (p[0] - cx) * s + hw, y = hh - (p[1] - cy) * s;
      if (!(Math.abs(x - lx) <= 0.01 && Math.abs(y - ly) <= 0.01)) ctx.moveTo(x, y);
      for (let i = 2; i + 5 < p.length; i += 6) {
        ctx.bezierCurveTo((p[i] - cx) * s + hw, hh - (p[i + 1] - cy) * s, (p[i + 2] - cx) * s + hw, hh - (p[i + 3] - cy) * s, (p[i + 4] - cx) * s + hw, hh - (p[i + 5] - cy) * s);
      }
      lx = (p[p.length - 2] - cx) * s + hw; ly = hh - (p[p.length - 1] - cy) * s;
    }
  }
}

// ---------------------------------------------------------------------------
// Sumideros: reciben geometría en coordenadas de pantalla (doble precisión).

class StrokeSink {
  begin(ctx, T) {
    this.ctx = ctx; this.T = T;
    this.has = false; this.at = false; this.px = 0; this.py = 0;
  }
  move(x, y) { this.px = x; this.py = y; this.has = true; this.at = false; }
  line(x, y) {
    if (!this.has) { this.move(x, y); return; }
    const px = this.px, py = this.py, T = this.T;
    this.px = x; this.py = y;
    if ((px < T.x0 && x < T.x0) || (px > T.x1 && x > T.x1) || (py < T.y0 && y < T.y0) || (py > T.y1 && y > T.y1)) { this.at = false; return; }
    if (px > -SAFE && px < SAFE && py > -SAFE && py < SAFE && x > -SAFE && x < SAFE && y > -SAFE && y < SAFE) {
      if (!this.at) this.ctx.moveTo(px, py);
      this.ctx.lineTo(x, y);
      this.at = true;
      return;
    }
    // Liang–Barsky
    const dx = x - px, dy = y - py;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy], q = [px - T.x0, T.x1 - px, py - T.y0, T.y1 - py];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) { this.at = false; return; } continue; }
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) { this.at = false; return; } if (r > t0) t0 = r; }
      else { if (r < t0) { this.at = false; return; } if (r < t1) t1 = r; }
    }
    if (t0 > 0 || !this.at) this.ctx.moveTo(px + dx * t0, py + dy * t0);
    this.ctx.lineTo(px + dx * t1, py + dy * t1);
    this.at = t1 >= 1;
  }
  bez(c1x, c1y, c2x, c2y, x, y) {
    if (!this.has) { this.move(x, y); return; }
    if (!this.at) this.ctx.moveTo(this.px, this.py);
    this.ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
    this.px = x; this.py = y; this.at = true;
  }
  close() { this.has = false; this.at = false; }
}

// Para rellenos: aplana a polígono y lo recorta contra la vista (Sutherland–Hodgman)
class FillSink {
  begin(ctx, T) { this.ctx = ctx; this.T = T; this.pts = []; }
  get has() { return this.pts.length > 0; }
  get px() { return this.pts[this.pts.length - 2]; }
  get py() { return this.pts[this.pts.length - 1]; }
  move(x, y) { if (this.pts.length) this.close(); this.pts.push(x, y); }
  line(x, y) { if (!this.pts.length) { this.pts.push(x, y); return; } this.pts.push(x, y); }
  bez(c1x, c1y, c2x, c2y, x, y) {
    if (!this.pts.length) { this.pts.push(x, y); return; }
    const n = this.pts.length;
    flattenBez(this.pts[n - 2], this.pts[n - 1], c1x, c1y, c2x, c2y, x, y, this.pts, 0);
  }
  close() {
    let pts = this.pts;
    this.pts = [];
    if (pts.length < 6) return;
    let big = false;
    for (let i = 0; i < pts.length; i++) if (pts[i] < -SAFE || pts[i] > SAFE) { big = true; break; }
    if (big) pts = clipPoly(pts, this.T);
    if (pts.length < 6) return;
    const ctx = this.ctx;
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }
}

function flattenBez(x0, y0, x1, y1, x2, y2, x3, y3, out, depth) {
  const dx = x3 - x0, dy = y3 - y0;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx), d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  const l2 = dx * dx + dy * dy;
  if (depth > 18 || (d1 + d2) * (d1 + d2) <= 0.0625 * Math.max(l2, 1e-12)) { out.push(x3, y3); return; }
  const x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2, x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2, x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2, ya = (y01 + y12) / 2, xb = (x12 + x23) / 2, yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2, ym = (ya + yb) / 2;
  flattenBez(x0, y0, x01, y01, xa, ya, xm, ym, out, depth + 1);
  flattenBez(xm, ym, xb, yb, x23, y23, x3, y3, out, depth + 1);
}

function clipPoly(pts, T) {
  const m = 200;
  const edges = [
    (x, y) => x >= T.x0 - m, (x, y) => x <= T.x1 + m, (x, y) => y >= T.y0 - m, (x, y) => y <= T.y1 + m,
  ];
  const inter = [
    (ax, ay, bx, by) => { const t = (T.x0 - m - ax) / (bx - ax); return [T.x0 - m, ay + (by - ay) * t]; },
    (ax, ay, bx, by) => { const t = (T.x1 + m - ax) / (bx - ax); return [T.x1 + m, ay + (by - ay) * t]; },
    (ax, ay, bx, by) => { const t = (T.y0 - m - ay) / (by - ay); return [ax + (bx - ax) * t, T.y0 - m]; },
    (ax, ay, bx, by) => { const t = (T.y1 + m - ay) / (by - ay); return [ax + (bx - ax) * t, T.y1 + m]; },
  ];
  let cur = pts;
  for (let e = 0; e < 4 && cur.length >= 6; e++) {
    const inside = edges[e], it = inter[e];
    const out = [];
    const n = cur.length;
    let sx = cur[n - 2], sy = cur[n - 1], sin = inside(sx, sy);
    for (let i = 0; i < n; i += 2) {
      const ex = cur[i], ey = cur[i + 1], ein = inside(ex, ey);
      if (ein) {
        if (!sin) out.push(...it(sx, sy, ex, ey));
        out.push(ex, ey);
      } else if (sin) out.push(...it(sx, sy, ex, ey));
      sx = ex; sy = ey; sin = ein;
    }
    cur = out;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Emisión de piezas

function emitPieces(pcs, sink, T) {
  let first = true;
  const s = T.s, cx = T.cx, cy = T.cy, hw = T.hw, hh = T.hh;
  for (const pc of pcs) {
    if (pc.k === 0) {
      const p = pc.p;
      const x = (p[0] - cx) * s + hw, y = hh - (p[1] - cy) * s;
      startAt(sink, x, y, first);
      for (let i = 2; i < p.length; i += 2) sink.line((p[i] - cx) * s + hw, hh - (p[i + 1] - cy) * s);
    } else if (pc.k === 1) {
      emitArc(pc, sink, T, first);
    } else {
      const p = pc.p;
      let x0 = (p[0] - cx) * s + hw, y0 = hh - (p[1] - cy) * s;
      startAt(sink, x0, y0, first);
      for (let i = 2; i + 5 < p.length; i += 6) {
        const x1 = (p[i] - cx) * s + hw, y1 = hh - (p[i + 1] - cy) * s;
        const x2 = (p[i + 2] - cx) * s + hw, y2 = hh - (p[i + 3] - cy) * s;
        const x3 = (p[i + 4] - cx) * s + hw, y3 = hh - (p[i + 5] - cy) * s;
        emitBez(sink, T, x0, y0, x1, y1, x2, y2, x3, y3, 0);
        x0 = x3; y0 = y3;
      }
    }
    first = false;
  }
}

function startAt(sink, x, y, first) {
  if (first || !sink.has) { sink.move(x, y); return; }
  if (Math.abs(sink.px - x) < 0.01 && Math.abs(sink.py - y) < 0.01) return;
  sink.move(x, y);
}

function outside(T, minx, miny, maxx, maxy) {
  return maxx < T.x0 || minx > T.x1 || maxy < T.y0 || miny > T.y1;
}

function emitBez(sink, T, x0, y0, x1, y1, x2, y2, x3, y3, depth) {
  const minx = Math.min(x0, x1, x2, x3), maxx = Math.max(x0, x1, x2, x3);
  const miny = Math.min(y0, y1, y2, y3), maxy = Math.max(y0, y1, y2, y3);
  if (outside(T, minx, miny, maxx, maxy)) { sink.line(x3, y3); return; }
  if (depth < 60 && (maxx - minx > SAFE / 4 || maxy - miny > SAFE / 4)) {
    const x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2, x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2, x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
    const xa = (x01 + x12) / 2, ya = (y01 + y12) / 2, xb = (x12 + x23) / 2, yb = (y12 + y23) / 2;
    const xm = (xa + xb) / 2, ym = (ya + yb) / 2;
    emitBez(sink, T, x0, y0, x01, y01, xa, ya, xm, ym, depth + 1);
    emitBez(sink, T, xm, ym, xb, yb, x23, y23, x3, y3, depth + 1);
    return;
  }
  sink.bez(x1, y1, x2, y2, x3, y3);
}

function emitArc(pc, sink, T, first) {
  const s = T.s;
  const cx = (pc.cx - T.cx) * s + T.hw, cy = T.hh - (pc.cy - T.cy) * s;
  const ux = pc.ux * s, uy = -pc.uy * s, vx = pc.vx * s, vy = -pc.vy * s;
  const R = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy));
  const a0 = pc.a0, a1 = pc.a1;
  const sx = cx + ux * Math.cos(a0) + vx * Math.sin(a0), sy = cy + uy * Math.cos(a0) + vy * Math.sin(a0);
  startAt(sink, sx, sy, first);
  if (!(R > 0) || !isFinite(R)) return;
  // ángulo máximo por segmento de Bézier para un error < 0.2 px
  let dmax = (Math.PI / 2) * Math.pow(0.2 / (2.7e-4 * R), 1 / 6);
  if (dmax > Math.PI / 2) dmax = Math.PI / 2;
  const A = { cx, cy, ux, uy, vx, vy, dmax };
  const span = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2)));
  for (let i = 0; i < n; i++) arcRec(A, sink, T, a0 + span * i / n, a0 + span * (i + 1) / n, 0);
}

function arcRec(A, sink, T, t0, t1, depth) {
  const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
  const x0 = A.cx + A.ux * c0 + A.vx * s0, y0 = A.cy + A.uy * c0 + A.vy * s0;
  const x3 = A.cx + A.ux * c1 + A.vx * s1, y3 = A.cy + A.uy * c1 + A.vy * s1;
  const d = t1 - t0;
  const k = (4 / 3) * Math.tan(d / 4);
  const x1 = x0 + k * (-A.ux * s0 + A.vx * c0), y1 = y0 + k * (-A.uy * s0 + A.vy * c0);
  const x2 = x3 - k * (-A.ux * s1 + A.vx * c1), y2 = y3 - k * (-A.uy * s1 + A.vy * c1);
  const minx = Math.min(x0, x1, x2, x3) - 1, maxx = Math.max(x0, x1, x2, x3) + 1;
  const miny = Math.min(y0, y1, y2, y3) - 1, maxy = Math.max(y0, y1, y2, y3) + 1;
  if (outside(T, minx, miny, maxx, maxy)) { sink.line(x3, y3); return; }
  if (depth < 80 && (Math.abs(d) > A.dmax || maxx - minx > SAFE / 4 || maxy - miny > SAFE / 4)) {
    const tm = (t0 + t1) / 2;
    arcRec(A, sink, T, t0, tm, depth + 1);
    arcRec(A, sink, T, tm, t1, depth + 1);
    return;
  }
  sink.bez(x1, y1, x2, y2, x3, y3);
}

function emitXLine(p, sink, T) {
  // intersección de la recta con la vista (en el mundo) y trazo del tramo visible
  const wx0 = T.cx + (T.x0 - T.hw) / T.s, wx1 = T.cx + (T.x1 - T.hw) / T.s;
  const wy0 = T.cy - (T.y1 - T.hh) / T.s, wy1 = T.cy - (T.y0 - T.hh) / T.s;
  let t0 = p.ray ? 0 : -Infinity, t1 = Infinity;
  const clip = (d, a, lo, hi) => {
    if (Math.abs(d) < 1e-300) return a >= lo && a <= hi;
    let ta = (lo - a) / d, tb = (hi - a) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    return t0 <= t1;
  };
  if (!clip(p.dx, p.x, wx0, wx1) || !clip(p.dy, p.y, wy0, wy1)) return;
  const X = (x) => (x - T.cx) * T.s + T.hw, Y = (y) => T.hh - (y - T.cy) * T.s;
  sink.move(X(p.x + p.dx * t0), Y(p.y + p.dy * t0));
  sink.line(X(p.x + p.dx * t1), Y(p.y + p.dy * t1));
}

const FAST_SINK = new StrokeSink();
