// Anotaciones: modelo, dibujo vectorial, borrado y exportación a PDF.
// Todas las coordenadas están en puntos de la página (D), así que las
// anotaciones también son vectoriales y nítidas a cualquier zoom.

export const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#111827', '#9333ea'];

let nextId = 1;
export const newId = () => Date.now().toString(36) + '-' + (nextId++);

// ------------------------------------------------------------------ medidas
export const PT_MM = 25.4 / 72;
export function lengthLabel(lenPt, calib) {
  if (calib && calib.factor) return fmtNum(lenPt * calib.factor) + ' ' + calib.unit;
  return fmtNum(lenPt * PT_MM) + ' mm';
}
export function areaLabel(areaPt2, calib) {
  if (calib && calib.factor) return fmtNum(areaPt2 * calib.factor * calib.factor) + ' ' + calib.unit + '²';
  return fmtNum(areaPt2 * PT_MM * PT_MM) + ' mm²';
}
export function fmtNum(v) {
  const a = Math.abs(v);
  const d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 2 : 4;
  return v.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: d });
}
export function polyArea(p) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return Math.abs(a) / 2;
}
export function polyLen(p, closed) {
  let l = 0;
  const n = p.length / 2;
  for (let i = 0; i < n - 1; i++) l += Math.hypot(p[2 * i + 2] - p[2 * i], p[2 * i + 3] - p[2 * i + 1]);
  if (closed && n > 2) l += Math.hypot(p[0] - p[2 * n - 2], p[1] - p[2 * n - 1]);
  return l;
}

// ------------------------------------------------------------------ dibujo
// view: {s, ox, oy}; dpr para tamaños mínimos
export function drawAnnots(ctx, list, view, dpr, calib, opts = {}) {
  for (const a of list) drawAnnot(ctx, a, view, dpr, calib, opts.selected === a.id);
}

export function drawAnnot(ctx, a, view, dpr, calib, selected) {
  const s = view.s, ox = view.ox, oy = view.oy;
  const X = (x) => x * s + ox, Y = (y) => y * s + oy;
  const p = a.pts;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = Math.max(dpr * 0.75, a.w * s);
  ctx.globalAlpha = a.type === 'hl' ? 0.35 : 1;
  switch (a.type) {
    case 'ink': case 'hl': {
      ctx.beginPath();
      ctx.moveTo(X(p[0]), Y(p[1]));
      if (p.length === 2) ctx.lineTo(X(p[0]) + 0.01, Y(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
      if (a.type === 'hl') ctx.lineCap = 'butt';
      ctx.stroke();
      break;
    }
    case 'line': case 'arrow': {
      const x0 = X(p[0]), y0 = Y(p[1]), x1 = X(p[2]), y1 = Y(p[3]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (a.type === 'arrow') arrowHead(ctx, x0, y0, x1, y1, Math.max(ctx.lineWidth * 4, 8 * dpr));
      break;
    }
    case 'rect': {
      ctx.strokeRect(Math.min(X(p[0]), X(p[2])), Math.min(Y(p[1]), Y(p[3])), Math.abs(X(p[2]) - X(p[0])), Math.abs(Y(p[3]) - Y(p[1])));
      break;
    }
    case 'ellipse': {
      const cx = (X(p[0]) + X(p[2])) / 2, cy = (Y(p[1]) + Y(p[3])) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(X(p[2]) - X(p[0])) / 2, Math.abs(Y(p[3]) - Y(p[1])) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'cloud': {
      cloudPath(ctx, X(p[0]), Y(p[1]), X(p[2]), Y(p[3]), Math.max(6 * dpr, 12 * a.w * s));
      ctx.stroke();
      break;
    }
    case 'text': {
      const fs = a.size * s;
      if (fs < 0.8) break;
      ctx.font = `${fs}px sans-serif`;
      ctx.textBaseline = 'top';
      const lines = a.text.split('\n');
      lines.forEach((ln, i) => ctx.fillText(ln, X(p[0]), Y(p[1]) + i * fs * 1.2));
      break;
    }
    case 'dist': {
      const x0 = X(p[0]), y0 = Y(p[1]), x1 = X(p[2]), y1 = Y(p[3]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const t = Math.max(6 * dpr, a.size * s * 0.5);
      tick(ctx, x0, y0, x1, y1, t); tick(ctx, x1, y1, x0, y0, t);
      const len = Math.hypot(p[2] - p[0], p[3] - p[1]);
      label(ctx, lengthLabel(len, calib), (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0), a.size * s, a.color, dpr);
      break;
    }
    case 'area': {
      ctx.beginPath();
      ctx.moveTo(X(p[0]), Y(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
      if (!a.open) ctx.closePath();
      ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1;
      ctx.stroke();
      if (p.length >= 6) {
        let cx = 0, cy = 0; const n = p.length / 2;
        for (let i = 0; i < p.length; i += 2) { cx += p[i]; cy += p[i + 1]; }
        label(ctx, areaLabel(polyArea(p), calib), X(cx / n), Y(cy / n), 0, a.size * s, a.color, dpr);
      }
      break;
    }
  }
  if (selected) {
    const b = bbox(a, ctx);
    ctx.globalAlpha = 1;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#0ea5e9';
    ctx.strokeRect(X(b[0]) - 6 * dpr, Y(b[1]) - 6 * dpr, (b[2] - b[0]) * s + 12 * dpr, (b[3] - b[1]) * s + 12 * dpr);
  }
  ctx.restore();
}

function arrowHead(ctx, x0, y0, x1, y1, size) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - size * Math.cos(a - 0.4), y1 - size * Math.sin(a - 0.4));
  ctx.lineTo(x1 - size * Math.cos(a + 0.4), y1 - size * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}
function tick(ctx, x0, y0, x1, y1, t) {
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + Math.cos(a) * t, y0 + Math.sin(a) * t);
  ctx.lineTo(x0 - Math.cos(a) * t, y0 - Math.sin(a) * t);
  ctx.stroke();
}
function label(ctx, txt, x, y, ang, fs, color, dpr) {
  fs = Math.max(fs, 11 * dpr);
  if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.font = `600 ${fs}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w / 2 - fs * 0.3, -fs * 1.25, w + fs * 0.6, fs * 1.1);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(txt, 0, -fs * 0.7);
  ctx.restore();
}

// Nube de revisión: arcos a lo largo del rectángulo
export function cloudPoints(x0, y0, x1, y1, r) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const pts = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
    const L = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(L / (r * 1.6)));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n, ax + (bx - ax) * (k + 1) / n, ay + (by - ay) * (k + 1) / n]);
  }
  return out;
}
function cloudPath(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  const segs = cloudPoints(x0, y0, x1, y1, r);
  segs.forEach(([ax, ay, bx, by], i) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const rr = Math.hypot(bx - ax, by - ay) / 2;
    const a0 = Math.atan2(ay - my, ax - mx);
    if (i === 0) ctx.moveTo(ax, ay);
    ctx.arc(mx, my, rr, a0, a0 + Math.PI, false);
  });
}

// ------------------------------------------------------------------ geometría
export function bbox(a, ctx) {
  const p = a.pts;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < b[0]) b[0] = p[i]; if (p[i + 1] < b[1]) b[1] = p[i + 1];
    if (p[i] > b[2]) b[2] = p[i]; if (p[i + 1] > b[3]) b[3] = p[i + 1];
  }
  if (a.type === 'text') {
    const lines = a.text.split('\n');
    let w = 0;
    if (ctx) { ctx.save(); ctx.font = `${a.size}px sans-serif`; for (const l of lines) w = Math.max(w, ctx.measureText(l).width); ctx.restore(); }
    else w = Math.max(...lines.map((l) => l.length)) * a.size * 0.55;
    b = [p[0], p[1], p[0] + w, p[1] + lines.length * a.size * 1.2];
  }
  const pad = (a.w || 0) / 2;
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Distancia (en puntos) del punto al trazo de la anotación
export function hitDist(a, x, y, ctx) {
  const p = a.pts;
  const half = (a.w || 0) / 2;
  switch (a.type) {
    case 'ink': case 'hl': {
      let d = Infinity;
      if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) - half;
      for (let i = 0; i < p.length - 2; i += 2) d = Math.min(d, segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]));
      return d - half;
    }
    case 'line': case 'arrow': case 'dist':
      return segDist(x, y, p[0], p[1], p[2], p[3]) - half;
    case 'rect': case 'cloud': {
      const xa = Math.min(p[0], p[2]), xb = Math.max(p[0], p[2]), ya = Math.min(p[1], p[3]), yb = Math.max(p[1], p[3]);
      return Math.min(segDist(x, y, xa, ya, xb, ya), segDist(x, y, xb, ya, xb, yb), segDist(x, y, xb, yb, xa, yb), segDist(x, y, xa, yb, xa, ya)) - half;
    }
    case 'ellipse': {
      const cx = (p[0] + p[2]) / 2, cy = (p[1] + p[3]) / 2, rx = Math.abs(p[2] - p[0]) / 2 || 1e-9, ry = Math.abs(p[3] - p[1]) / 2 || 1e-9;
      let d = Infinity, px = cx + rx, py = cy;
      for (let i = 1; i <= 72; i++) {
        const t = i / 72 * Math.PI * 2, qx = cx + rx * Math.cos(t), qy = cy + ry * Math.sin(t);
        d = Math.min(d, segDist(x, y, px, py, qx, qy)); px = qx; py = qy;
      }
      return d - half;
    }
    case 'text': {
      const b = bbox(a, ctx);
      const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]);
      return Math.hypot(dx, dy);
    }
    case 'area': {
      let d = Infinity;
      const n = p.length / 2;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; d = Math.min(d, segDist(x, y, p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1])); }
      return Math.min(d - half, pointInPoly(x, y, p) ? 0 : Infinity);
    }
  }
  return Infinity;
}
function pointInPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Simplificación de trazos a mano alzada (Ramer–Douglas–Peucker)
export function simplify(p, tol) {
  const n = p.length / 2;
  if (n <= 2) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(p[2 * i], p[2 * i + 1], p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}

// ------------------------------------------------------------------ exportar
// Dibuja las anotaciones dentro del PDF (como contenido vectorial de la página).
export async function exportPdf(bytes, pdfjsDoc, annotsByPage, calib) {
  const lib = await import('../vendor/pdf-lib/pdf-lib.esm.min.js');
  const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const col = (h) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const safe = (f, t) => { let o = ''; for (const ch of t) { try { f.encodeText(ch); o += ch; } catch (e) { o += '?'; } } return o; };

  for (const [pi, list] of Object.entries(annotsByPage)) {
    if (!list || !list.length) continue;
    const page = pages[+pi];
    if (!page) continue;
    const pjPage = await pdfjsDoc.getPage(+pi + 1);
    const vp = pjPage.getViewport({ scale: 1 });
    const U = (x, y) => vp.convertToPdfPoint(x, y); // D -> espacio de usuario PDF
    const path = (pts, close) => {
      let d = '';
      for (let i = 0; i < pts.length; i += 2) { const [ux, uy] = U(pts[i], pts[i + 1]); d += (i ? 'L' : 'M') + ux.toFixed(3) + ' ' + (-uy).toFixed(3) + ' '; }
      return d + (close ? 'Z' : '');
    };
    // ángulo del eje x de la pantalla en espacio de usuario (páginas giradas)
    const o = U(0, 0), ex = U(1, 0);
    const rot = Math.atan2(ex[1] - o[1], ex[0] - o[0]) * 180 / Math.PI;
    const stroke = (d, a, extra = {}) => page.drawSvgPath(d, { x: 0, y: 0, borderColor: col(a.color), borderWidth: a.w, borderOpacity: a.type === 'hl' ? 0.35 : 1, borderLineCap: a.type === 'hl' ? LineCapStyle.Butt : LineCapStyle.Round, ...extra });
    const fill = (d, a, op = 1) => page.drawSvgPath(d, { x: 0, y: 0, color: col(a.color), opacity: op, borderWidth: 0 });
    const text = (t, x, y, size, color, f = font, angleDeg = 0) => {
      const [ux, uy] = U(x, y);
      page.drawText(safe(f, t), { x: ux, y: uy, size, font: f, color: col(color), rotate: degrees(rot + angleDeg) });
    };
    for (const a of list) {
      const p = a.pts;
      switch (a.type) {
        case 'ink': case 'hl': stroke(path(p.length === 2 ? [p[0], p[1], p[0] + 0.01, p[1]] : p, false), a); break;
        case 'line': stroke(path(p, false), a); break;
        case 'arrow': {
          stroke(path(p, false), a);
          const ang = Math.atan2(p[3] - p[1], p[2] - p[0]), sz = Math.max(a.w * 4, 6);
          fill(path([p[2], p[3], p[2] - sz * Math.cos(ang - 0.4), p[3] - sz * Math.sin(ang - 0.4), p[2] - sz * Math.cos(ang + 0.4), p[3] - sz * Math.sin(ang + 0.4)], true), a);
          break;
        }
        case 'rect': stroke(path([p[0], p[1], p[2], p[1], p[2], p[3], p[0], p[3]], true), a, { borderLineCap: LineCapStyle.Round }); break;
        case 'ellipse': {
          const cx = (p[0] + p[2]) / 2, cy = (p[1] + p[3]) / 2, rx = Math.abs(p[2] - p[0]) / 2, ry = Math.abs(p[3] - p[1]) / 2;
          const pts = [];
          for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2; pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t)); }
          stroke(path(pts, true), a);
          break;
        }
        case 'cloud': {
          const r = 12 * a.w;
          const pts = [];
          for (const [ax, ay, bx, by] of cloudPoints(p[0], p[1], p[2], p[3], r)) {
            const mx = (ax + bx) / 2, my = (ay + by) / 2, rr = Math.hypot(bx - ax, by - ay) / 2, a0 = Math.atan2(ay - my, ax - mx);
            for (let i = 0; i <= 16; i++) { const t = a0 + Math.PI * i / 16; pts.push(mx + rr * Math.cos(t), my + rr * Math.sin(t)); }
          }
          stroke(path(pts, false), a);
          break;
        }
        case 'text':
          a.text.split('\n').forEach((ln, i) => text(ln, p[0], p[1] + a.size * (0.8 + i * 1.2), a.size, a.color));
          break;
        case 'dist': {
          stroke(path(p, false), a);
          const t = a.size * 0.5, ang = Math.atan2(p[3] - p[1], p[2] - p[0]) + Math.PI / 2;
          for (const [qx, qy] of [[p[0], p[1]], [p[2], p[3]]]) stroke(path([qx + Math.cos(ang) * t, qy + Math.sin(ang) * t, qx - Math.cos(ang) * t, qy - Math.sin(ang) * t], false), a);
          const len = Math.hypot(p[2] - p[0], p[3] - p[1]);
          drawLabel(page, path, U, lengthLabel(len, calib), (p[0] + p[2]) / 2, (p[1] + p[3]) / 2, Math.atan2(p[3] - p[1], p[2] - p[0]), a.size, col(a.color), fontB, safe, rgb, degrees, rot);
          break;
        }
        case 'area': {
          fill(path(p, true), a, 0.15);
          stroke(path(p, true), a);
          if (p.length >= 6) {
            let cx = 0, cy = 0; const n = p.length / 2;
            for (let i = 0; i < p.length; i += 2) { cx += p[i]; cy += p[i + 1]; }
            drawLabel(page, path, U, areaLabel(polyArea(p), calib), cx / n, cy / n, 0, a.size, col(a.color), fontB, safe, rgb, degrees, rot);
          }
          break;
        }
      }
    }
  }
  return doc.save();
}

function drawLabel(page, path, U, txt, cx, cy, angle, size, color, font, safe, rgb, degrees, rot) {
  const st = safe(font, txt);
  const w = font.widthOfTextAtSize(st, size);
  let a = angle;
  if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
  const ca = Math.cos(a), sa = Math.sin(a);
  const corner = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
  const bx = -w / 2 - size * 0.3, by = -size * 1.25, bw = w + size * 0.6, bh = size * 1.1;
  const rect = [corner(bx, by), corner(bx + bw, by), corner(bx + bw, by + bh), corner(bx, by + bh)].flat();
  page.drawSvgPath(path(rect, true), { x: 0, y: 0, color: rgb(1, 1, 1), opacity: 0.92, borderWidth: 0 });
  // línea base: centro vertical del rótulo en -0.7*size, base ≈ +0.35*size por debajo
  const [x0, y0] = corner(-w / 2, -size * 0.7 + size * 0.35);
  const [ux, uy] = U(x0, y0);
  page.drawText(st, { x: ux, y: uy, size, font, color, rotate: degrees(rot - a * 180 / Math.PI) });
}
