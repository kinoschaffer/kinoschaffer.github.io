// Visor de páginas PDF con zoom sin pérdida.
//
// - Una imagen "base" de la página completa (resolución limitada) se usa para
//   moverse y hacer zoom con fluidez.
// - Cuando el gesto se detiene, pdf.js vuelve a dibujar como vectores sólo la
//   zona visible, a la resolución exacta de la pantalla ("detalle"). Por eso el
//   plano queda nítido a cualquier nivel de zoom.
//
// Coordenadas de documento (D): puntos PDF de la página ya girada, y hacia abajo,
// origen en la esquina superior izquierda (viewport de pdf.js a escala 1).
// Pantalla (px del dispositivo) = D * s + (ox, oy)

import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const V = (p) => new URL('../vendor/pdfjs/' + p, import.meta.url).href;

const BASE_MAX_PIXELS = 9e6;
const BASE_MAX_DIM = 4096;

export async function openPdf(data) {
  return pdfjs.getDocument({
    data,
    cMapUrl: V('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: V('standard_fonts/'),
    wasmUrl: V('wasm/'),
    iccUrl: V('iccs/'),
    isEvalSupported: false,
    useWorkerFetch: false, // el hilo principal descarga cmaps y fuentes (más fiable en WebView)
    enableXfa: false,
  }).promise;
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.view = { s: 1, ox: 0, oy: 0 };
    this.page = null;
    this.vp1 = null; // viewport a escala 1
    this.base = null; // {canvas, s}
    this.detail = null; // {canvas, s, ox, oy}
    this.detailCanvases = [document.createElement('canvas'), document.createElement('canvas')];
    this.detailTask = null;
    this.detailTimer = 0;
    this.overlay = null;
    this.onRedraw = null;
    this.raf = 0;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  resize(cssW, cssH, dpr) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.detail = null;
      this.scheduleDetail();
    }
    this.requestDraw();
  }

  async setPage(page) {
    this.cancelDetail();
    this.page = page;
    this.vp1 = page.getViewport({ scale: 1 });
    this.detail = null;
    this.base = null;
    const { width, height } = this.vp1;
    const s = Math.min(BASE_MAX_DIM / Math.max(width, height), Math.sqrt(BASE_MAX_PIXELS / (width * height)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(width * s));
    c.height = Math.max(1, Math.floor(height * s));
    const ctx = c.getContext('2d', { alpha: false });
    const task = page.render({ canvas: c, canvasContext: ctx, viewport: page.getViewport({ scale: s }), background: '#ffffff' });
    this.baseTask = task;
    await task.promise;
    if (this.page !== page) return;
    this.base = { canvas: c, s };
    this.requestDraw();
    this.scheduleDetail();
  }

  get pageW() { return this.vp1 ? this.vp1.width : 1; }
  get pageH() { return this.vp1 ? this.vp1.height : 1; }

  fitScale(insetTop = 0, insetBottom = 0) {
    const w = this.W, h = this.H - insetTop - insetBottom;
    return Math.min(w / this.pageW, h / this.pageH) * 0.96;
  }

  fit(insetTop = 0, insetBottom = 0) {
    const s = this.fitScale(insetTop, insetBottom);
    this.view.s = s;
    this.view.ox = (this.W - this.pageW * s) / 2;
    this.view.oy = insetTop + (this.H - insetTop - insetBottom - this.pageH * s) / 2;
    this.changed();
  }

  // Límite práctico medido: hasta ~1e8 px de página el dibujo es estable
  get maxScale() { return (window.__maxPx || 1e8) / Math.max(this.pageW, this.pageH); }
  get minScale() { return this.fitScale() / 20; }

  toScreen(x, y) { const v = this.view; return [x * v.s + v.ox, y * v.s + v.oy]; }
  toDoc(x, y) { const v = this.view; return [(x - v.ox) / v.s, (y - v.oy) / v.s]; }

  zoomAt(sx, sy, factor) {
    const v = this.view;
    const ns = Math.min(this.maxScale, Math.max(this.minScale, v.s * factor));
    const k = ns / v.s;
    v.ox = sx - (sx - v.ox) * k;
    v.oy = sy - (sy - v.oy) * k;
    v.s = ns;
    this.changed();
  }
  panBy(dx, dy) { this.view.ox += dx; this.view.oy += dy; this.changed(); }

  changed() {
    this.requestDraw();
    this.scheduleDetail();
  }

  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  draw() {
    const ctx = this.ctx, v = this.view, W = this.W, H = this.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(0, 0, W, H);
    if (!this.vp1) return;
    // rectángulo visible de la página en pantalla
    const px0 = Math.max(0, v.ox), py0 = Math.max(0, v.oy);
    const px1 = Math.min(W, v.ox + this.pageW * v.s), py1 = Math.min(H, v.oy + this.pageH * v.s);
    if (px1 > px0 && py1 > py0) {
      // sombra
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(px0 + 3, py0 + 3, px1 - px0, py1 - py0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (this.base) {
        // trozo de la imagen base que corresponde a la zona visible
        const b = this.base;
        const k = b.s / v.s;
        let sx = (px0 - v.ox) * k, sy = (py0 - v.oy) * k, sw = (px1 - px0) * k, sh = (py1 - py0) * k;
        const cw = b.canvas.width, ch = b.canvas.height;
        // ajustar al tamaño real del bitmap
        const dx0 = px0, dy0 = py0;
        const sx1 = Math.min(cw, sx + sw), sy1 = Math.min(ch, sy + sh);
        if (sx1 > sx && sy1 > sy) {
          ctx.drawImage(b.canvas, sx, sy, sx1 - sx, sy1 - sy, dx0, dy0, (sx1 - sx) / k, (sy1 - sy) / k);
        }
      }
      const d = this.detail;
      if (d) {
        const k = v.s / d.s;
        if (k > 1e-3 && k < 1e3) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(px0, py0, px1 - px0, py1 - py0);
          ctx.clip();
          ctx.drawImage(d.canvas, v.ox - d.ox * k, v.oy - d.oy * k, d.canvas.width * k, d.canvas.height * k);
          ctx.restore();
        }
      }
    }
    if (this.overlay) this.overlay(ctx);
  }

  cancelDetail() {
    clearTimeout(this.detailTimer);
    if (this.detailTask) { try { this.detailTask.cancel(); } catch (e) { /* */ } this.detailTask = null; }
  }

  scheduleDetail(delay = 140) {
    this.cancelDetail();
    this.detailTimer = setTimeout(() => this.renderDetail(), delay);
  }

  // Dibujo vectorial de la zona visible a la resolución de la pantalla
  async renderDetail() {
    if (!this.page || !this.base) return;
    const v = { ...this.view };
    // con la imagen base basta si no estamos ampliando por encima de su resolución
    if (v.s <= this.base.s * 0.75) { this.detail = null; this.requestDraw(); return; }
    const d = this.detail;
    if (d && d.s === v.s && d.ox === v.ox && d.oy === v.oy && d.canvas.width === this.W && d.canvas.height === this.H) return;
    const c = this.detailCanvases[0] === (d && d.canvas) ? this.detailCanvases[1] : this.detailCanvases[0];
    if (c.width !== this.W || c.height !== this.H) { c.width = this.W; c.height = this.H; }
    const ctx = c.getContext('2d', { alpha: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const page = this.page;
    const task = page.render({
      canvas: c,
      canvasContext: ctx,
      viewport: page.getViewport({ scale: v.s }),
      transform: [1, 0, 0, 1, v.ox, v.oy],
      background: '#ffffff',
    });
    this.detailTask = task;
    try {
      await task.promise;
    } catch (e) {
      return; // cancelado
    }
    if (this.detailTask !== task || this.page !== page) return;
    this.detailTask = null;
    this.detail = { canvas: c, s: v.s, ox: v.ox, oy: v.oy };
    this.requestDraw();
    if (this.onRedraw) this.onRedraw();
  }
}
