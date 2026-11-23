// Juegos táctiles: se juegan dibujando con el dedo en un panel 2D sobre la escena 3D.
import * as THREE from 'three';
const M = window.MG3D, A = M.api, XS = window.MGX.shared;
const { PAL, arenaRect, flash, done, X } = A;
const G = () => A.G;

const css = document.createElement('style');
css.textContent = `#mgui .tact{position:absolute;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 100px);bottom:calc(env(safe-area-inset-bottom) + 10px);pointer-events:auto;display:flex;flex-direction:column;gap:8px}
#mgui .tact canvas{flex:1;min-height:0;width:100%;border-radius:18px;background:rgba(255,248,231,.96);box-shadow:0 6px 0 #0005;touch-action:none}
#mgui .tact.dark canvas{background:linear-gradient(#1b2b5a,#0d1430)}
#mgui .tact .row{display:flex;gap:10px;justify-content:center}
#mgui .tact .row button{pointer-events:auto;height:56px;min-width:120px;border-radius:16px;border:0;font:400 1.25rem 'Luckiest Guy','Baloo 2',sans-serif;letter-spacing:.03em;color:#1e0b3a;background:#fcc419;box-shadow:0 5px 0 #b8860b;touch-action:none}
#mgui .tact .row button.sec{background:#e9ecef;box-shadow:0 5px 0 #868e96}
#mgui .tact .row button:disabled{opacity:.4}`;
document.head.appendChild(css);

/* ---------- utilidades de dibujo ---------- */
const FONT = "'Luckiest Guy','Baloo 2',sans-serif";
function faceDraw(c, f, x, y, Q, opt = {}) {
  const P = (u, v) => [x + u * Q, y + v * Q];
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  // cabeza
  c.beginPath(); c.ellipse(x + 0.5 * Q, y + 0.5 * Q, f.headW * Q, 0.42 * Q, 0, 0, Math.PI * 2);
  c.fillStyle = opt.ghost ? 'rgba(81,207,102,.18)' : '#ffd8a8'; c.fill(); c.lineWidth = Q * 0.018; c.strokeStyle = opt.ghost ? '#2f9e44' : '#7a4a1a'; if (opt.ghost) c.setLineDash([Q * 0.03, Q * 0.02]); c.stroke();
  // pelo
  if (!opt.ghost) { c.beginPath(); c.ellipse(x + 0.5 * Q, y + 0.16 * Q, f.headW * Q * 0.8, 0.09 * Q, 0, Math.PI, 0); c.fillStyle = '#7a4a1a'; c.fill(); }
  // ojos
  for (const s of [-1, 1]) { const [ex, ey] = P(0.5 + s * f.spread, f.eyeY);
    c.beginPath(); c.arc(ex, ey, f.eyeR * Q, 0, Math.PI * 2); c.fillStyle = opt.ghost ? 'transparent' : '#fff'; c.fill(); c.stroke();
    if (!opt.ghost) { c.beginPath(); c.arc(ex, ey + f.eyeR * Q * 0.15, f.eyeR * Q * 0.45, 0, Math.PI * 2); c.fillStyle = '#1e0b3a'; c.fill(); } }
  // nariz
  c.beginPath(); const [n0x, n0y] = P(0.5, 0.5); const [n1x, n1y] = P(0.5, 0.5 + f.nose);
  c.moveTo(n0x, n0y - Q * 0.03); c.lineTo(n1x - Q * 0.03, n1y); c.lineTo(n1x + Q * 0.01, n1y); c.stroke();
  // boca
  const my = 0.71, w = f.mouthW / 2; const [m0x, m0y] = P(0.5 - w, my - f.curve * 0.5), [m1x, m1y] = P(0.5 + w, my - f.curve * 0.5), [cx, cy] = P(0.5, my + f.curve * 0.9);
  c.beginPath(); c.moveTo(m0x, m0y); c.quadraticCurveTo(cx, cy, m1x, m1y); c.lineWidth = Q * 0.025; c.strokeStyle = opt.ghost ? '#2f9e44' : '#c92a2a'; c.stroke();
  c.restore();
}
function strokesDraw(c, strokes, x, y, Q, col, w, dash) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.lineWidth = w; if (dash) c.setLineDash(dash);
  for (const s of strokes) { if (!s.length) continue; c.beginPath(); c.moveTo(x + s[0][0] * Q, y + s[0][1] * Q); for (const p of s) c.lineTo(x + p[0] * Q, y + p[1] * Q); if (s.length === 1) c.lineTo(x + s[0][0] * Q + 0.5, y + s[0][1] * Q); c.stroke(); }
  c.restore();
}
function bigText(c, txt, x, y, size, col = '#fff') { c.save(); c.font = `${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = size * 0.16; c.strokeStyle = '#1e0b3a'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); c.restore(); }
// longitud acumulada y proyección sobre una polilínea
function pathLen(pts) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; }
function project(p, pts, L) { let best = { d: 1e9, s: 0 }; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let k = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; k = Math.max(0, Math.min(1, k)); const d = Math.hypot(p[0] - a[0] - dx * k, p[1] - a[1] - dy * k); if (d < best.d) best = { d, s: L[i - 1] + Math.sqrt(l2) * k }; } return best; }
function pointAt(s, pts, L) { for (let i = 1; i < pts.length; i++) if (s <= L[i]) { const k = (s - L[i - 1]) / (L[i] - L[i - 1] || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; } return pts[pts.length - 1]; }

/* ---------- reglas de cada juego (lado del jugador) ---------- */
const GAMES = {
  cara: {
    init(t) { t.target = XS.faceTarget(G().seed); t.face = XS.faceStart(); t.drag = null; },
    layout(t, W, H) { if (H >= W * 1.1) { const ts = Math.min(H * 0.27, W * 0.42); const Q = Math.min(W - 16, H - ts - 22); t.tgt = [(W - ts) / 2, 6, ts]; t.main = [(W - Q) / 2, ts + 16, Q]; }
      else { const ts = Math.min(W * 0.3, H * 0.6); const Q = Math.min(H - 12, W - ts - 26); t.tgt = [10, 10 + 24, ts]; t.main = [ts + 20 + (W - ts - 20 - Q) / 2, (H - Q) / 2, Q]; } },
    handles(t) { const f = t.face; return { eye: [0.5 + f.spread, f.eyeY], size: [0.5 - f.spread, f.eyeY + f.eyeR], mouth: [0.5 + f.mouthW / 2, 0.71 - f.curve * 0.5], nose: [0.5, 0.5 + f.nose], head: [0.5 + f.headW, 0.5] }; },
    down(t, u, v) { const hs = this.handles(t); let best = null, bd = 0.09; for (const [k, [hx, hy]] of Object.entries(hs)) { const d = Math.hypot(u - hx, v - hy); if (d < bd) { bd = d; best = k; } } t.drag = best; if (best) X('tap'); },
    move(t, u, v) { const f = t.face, F = XS.FACE, cl = (k, val) => { f[k] = Math.max(F[k][0], Math.min(F[k][1], val)); };
      switch (t.drag) { case 'eye': cl('spread', u - 0.5); cl('eyeY', v); break; case 'size': cl('eyeR', v - f.eyeY); break;
        case 'mouth': cl('mouthW', (u - 0.5) * 2); cl('curve', (0.71 - v) * 2); break; case 'nose': cl('nose', v - 0.5); break; case 'head': cl('headW', u - 0.5); break; } },
    up(t) { t.drag = null; },
    score(t) { return XS.faceScore(t.face, t.target); },
    draw(t, c, now) { const [tx, ty, ts] = t.tgt, [mx, my, Q] = t.main;
      c.fillStyle = '#e7f5ff'; c.fillRect(tx - 4, ty - 4, ts + 8, ts + 8); faceDraw(c, t.target, tx, ty, ts); bigText(c, 'EJEMPLO', tx + ts / 2, ty + ts - 8, ts * 0.11, '#fcc419');
      faceDraw(c, t.face, mx, my, Q);
      if (t.sent) { faceDraw(c, t.target, mx, my, Q, { ghost: true }); bigText(c, `¡${t.sent}% parecido!`, mx + Q / 2, my + Q * 0.93, Q * 0.08, '#51cf66'); return; }
      const hs = this.handles(t), pulse = 1 + Math.sin(now / 180) * 0.12;
      for (const [k, [u, v]] of Object.entries(hs)) { c.beginPath(); c.arc(mx + u * Q, my + v * Q, Q * 0.032 * (t.drag === k ? 1.4 : pulse), 0, Math.PI * 2); c.fillStyle = t.drag === k ? '#fcc419' : 'rgba(77,171,247,.85)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); }
      if (now < 5000) bigText(c, 'Arrastra los puntos azules', mx + Q / 2, my + Q * 0.06, Q * 0.055); },
    buttons: [['¡LISTO!', 'send']],
  },
  dibujo: {
    init(t) { const g = G(); t.key = XS.DKEYS[(g.seed >>> 0) % XS.DKEYS.length]; t.target = XS.DRAWINGS[t.key]; t.strokes = []; t.cur = null; t.showUntil = 3600; },
    layout(t, W, H) { const Q = Math.min(W, H) - 12; t.main = [(W - Q) / 2, (H - Q) / 2, Q]; },
    canDraw(t, now) { return now > t.showUntil && !t.sent; },
    down(t, u, v, now) { if (!this.canDraw(t, now)) return; t.cur = [[u, v]]; t.strokes.push(t.cur); },
    move(t, u, v) { if (t.cur) { const l = t.cur[t.cur.length - 1]; if (Math.hypot(u - l[0], v - l[1]) > 0.006) t.cur.push([u, v]); } },
    up(t) { t.cur = null; },
    score(t) { return XS.drawScore(t.target, t.strokes); },
    action(t, a) { if (a === 'clear' && !t.sent) { t.strokes = []; X('whoosh'); } },
    draw(t, c, now) { const [mx, my, Q] = t.main;
      c.save(); c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 1; for (let i = 1; i < 10; i++) { c.beginPath(); c.moveTo(mx + i * Q / 10, my); c.lineTo(mx + i * Q / 10, my + Q); c.moveTo(mx, my + i * Q / 10); c.lineTo(mx + Q, my + i * Q / 10); c.stroke(); } c.restore();
      if (now < t.showUntil) { strokesDraw(c, t.target, mx, my, Q, '#1971c2', Q * 0.022); const s = Math.ceil((t.showUntil - now) / 1000); bigText(c, `¡Memoriza! ${s}`, mx + Q / 2, my + Q * 0.06, Q * 0.075, '#fcc419'); return; }
      strokesDraw(c, t.strokes, mx, my, Q, '#1e0b3a', Q * 0.018);
      if (t.sent != null) { strokesDraw(c, t.target, mx, my, Q, 'rgba(47,158,68,.75)', Q * 0.014, [Q * 0.02, Q * 0.015]); bigText(c, `¡${t.sent}% parecido!`, mx + Q / 2, my + Q * 0.93, Q * 0.08, '#51cf66'); }
      else if (!t.strokes.length) bigText(c, '¡Ahora dibújalo!', mx + Q / 2, my + Q / 2, Q * 0.08); },
    buttons: [['🧽 Borrar', 'clear', 'sec'], ['¡LISTO!', 'send']],
  },
  fruta: {
    dark: true,
    init(t) { const g = G(); t.list = XS.fruits(g.seed, g.dur); t.cut = new Set(); t.pieces = []; t.trail = []; t.pts = 0; t.shake = 0; },
    layout(t, W, H) { t.W = W; t.H = H; t.rad = Math.min(W, H) * 0.075; },
    down(t, u, v, now) { t.last = [u * t.W, v * t.H]; t.trail = [[...t.last, now]]; },
    move(t, u, v, now) { if (!t.last) return; const p = [u * t.W, v * t.H], a = t.last; t.trail.push([...p, now]);
      for (const f of t.list) { if (t.cut.has(f.id) || f.t > now || now - f.t > 2600) continue; const [fx, fy] = XS.fruitPos(f, now), cx = fx * t.W, cy = fy * t.H;
        const dx = p[0] - a[0], dy = p[1] - a[1], l2 = dx * dx + dy * dy || 1; let k = ((cx - a[0]) * dx + (cy - a[1]) * dy) / l2; k = Math.max(0, Math.min(1, k));
        if (Math.hypot(cx - a[0] - dx * k, cy - a[1] - dy * k) < t.rad) { t.cut.add(f.id);
          if (f.kind === 'bomb') { t.pts = Math.max(0, t.pts - 3); t.shake = now + 350; X('boom'); flash('💥 −3', 700); if (navigator.vibrate) navigator.vibrate(120); }
          else { const v2 = f.kind === 'gold' ? 3 : 1; t.pts += v2; X(f.kind === 'gold' ? 'crown' : 'coin'); const ang = Math.atan2(dy, dx); t.pieces.push({ x: cx, y: cy, t: now, e: f.kind === 'gold' ? '🌟' : f.e, ang, v: v2 }); } } }
      t.last = p; },
    up(t) { t.last = null; },
    score(t) { return t.pts; },
    draw(t, c, now) { const W = t.W, H = t.H; c.save(); if (now < t.shake) c.translate((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const f of t.list) { if (t.cut.has(f.id) || f.t > now || now - f.t > 2600) continue; const [fx, fy] = XS.fruitPos(f, now); if (fy > 1.15) continue;
        const r = t.rad, x = fx * W, y = fy * H; if (f.kind === 'gold') { c.beginPath(); c.arc(x, y, r * 1.1, 0, Math.PI * 2); c.fillStyle = 'rgba(252,196,25,.45)'; c.fill(); }
        c.save(); c.translate(x, y); c.rotate((now - f.t) / 300 * (f.vx > 0 ? 1 : -1)); c.font = `${r * 1.7}px serif`; c.fillText(f.kind === 'bomb' ? '💣' : f.kind === 'gold' ? '🌟' : f.e, 0, 0); c.restore(); }
      for (let i = t.pieces.length - 1; i >= 0; i--) { const p = t.pieces[i], k = (now - p.t) / 1000; if (k > 0.9) { t.pieces.splice(i, 1); continue; }
        c.globalAlpha = 1 - k / 0.9; for (const s of [-1, 1]) { c.save(); c.translate(p.x + Math.cos(p.ang + s * 1.57) * k * 90, p.y + k * k * 600 - 40 * k); c.rotate(s * k * 4); c.beginPath(); c.rect(s < 0 ? -t.rad : 0, -t.rad, t.rad, t.rad * 2); c.clip(); c.font = `${t.rad * 1.7}px serif`; c.fillText(p.e, 0, 0); c.restore(); }
        bigText(c, '+' + p.v, p.x, p.y - k * 80, t.rad * 0.7, '#fcc419'); c.globalAlpha = 1; }
      t.trail = t.trail.filter(p => now - p[2] < 160); if (t.trail.length > 1) { c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(t.trail[0][0], t.trail[0][1]); for (const p of t.trail) c.lineTo(p[0], p[1]); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 7; c.stroke(); c.strokeStyle = 'rgba(77,171,247,.7)'; c.lineWidth = 14; c.globalAlpha = 0.4; c.stroke(); c.globalAlpha = 1; }
      c.restore(); bigText(c, `🍉 ${t.pts}`, W - 60, 34, 30, '#fcc419');
      if (now < 2600) bigText(c, '¡Desliza para cortar!', W / 2, H * 0.4, Math.min(W, H) * 0.07); },
    buttons: [],
  },
  traza: {
    init(t) { t.round = 0; t.total = 0; t.newPath(0); },
    layout(t, W, H) { const Q = Math.min(W, H) - 12; t.main = [(W - Q) / 2, (H - Q) / 2, Q]; },
    down(t, u, v, now) { if (t.fin) return; t.on = true; this.move(t, u, v, now); },
    move(t, u, v, now) { if (!t.on || t.fin) return; const pr = project([u, v], t.pts, t.L); t.finger = [u, v]; t.off = pr.d > XS.PATH_W;
      if (t.prog > 0 || pr.s < 0.04) { if (t.t0 == null && !t.off) t.t0 = now; t.samples++; if (t.off) { t.bad++; if (!t.wasOff) { X('bad'); if (navigator.vibrate) navigator.vibrate(40); } } t.wasOff = t.off; }
      if (!t.off && pr.s <= t.prog + 0.07) t.prog = Math.max(t.prog, pr.s);
      if (t.prog >= t.len - 0.02) this.finishPath(t, now); },
    up(t) { t.on = false; t.finger = null; },
    pathScore(t, now, frac = 1) { const acc = t.samples ? 1 - t.bad / t.samples : 0, el = now - (t.t0 ?? now); return Math.round((acc * 70 + (frac >= 1 ? 30 * Math.max(0, 1 - el / 7000) : 0)) * frac); },
    finishPath(t, now) { const s = this.pathScore(t, now); t.total += s; t.flashS = [s, now]; X('coin'); t.round++; if (t.round >= 3) { t.fin = true; return; } t.newPath(t.round); },
    score(t) { const g = G(); return Math.round((t.total + (t.fin ? 0 : this.pathScore(t, g.now, t.prog / t.len))) / 3); },
    draw(t, c, now) { const [mx, my, Q] = t.main, P = p => [mx + p[0] * Q, my + p[1] * Q];
      const line = (pts, col, w, dash) => { c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.lineWidth = w; if (dash) c.setLineDash(dash); c.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.restore(); };
      if (!t.fin) { line(t.pts, '#a9e34b', XS.PATH_W * 2 * Q); line(t.pts, '#74b816', XS.PATH_W * 2 * Q - 8, null); line(t.pts, 'rgba(255,255,255,.7)', 3, [10, 10]);
        // progreso
        const done = [t.pts[0]]; for (let i = 1; i < t.pts.length && t.L[i] < t.prog; i++) done.push(t.pts[i]); done.push(pointAt(t.prog, t.pts, t.L)); if (t.prog > 0) line(done, '#fcc419', XS.PATH_W * 1.3 * Q);
        const [sx, sy] = P(t.pts[0]), [ex, ey] = P(t.pts[t.pts.length - 1]); c.beginPath(); c.arc(sx, sy, XS.PATH_W * Q * 1.1, 0, Math.PI * 2); c.fillStyle = '#51cf66'; c.fill(); bigText(c, 'GO', sx, sy, Q * 0.045);
        c.font = `${Q * 0.08}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🏁', ex, ey);
        if (t.finger) { const [fx, fy] = P(t.finger); c.beginPath(); c.arc(fx, fy, Q * 0.03, 0, Math.PI * 2); c.fillStyle = t.off ? '#ff6b6b' : '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1e0b3a'; c.stroke(); }
        bigText(c, `Camino ${t.round + 1}/3`, mx + Q / 2, my + 24, Q * 0.055, '#fcc419');
        if (t.prog === 0 && now % 1200 < 800) bigText(c, '¡Empieza en GO!', sx, sy - Q * 0.09, Q * 0.05); }
      else bigText(c, `¡${this.score(t)} puntos!`, mx + Q / 2, my + Q / 2, Q * 0.1, '#51cf66');
      if (t.flashS && now - t.flashS[1] < 1200) bigText(c, `+${t.flashS[0]}`, mx + Q / 2, my + Q * 0.4 - (now - t.flashS[1]) / 20, Q * 0.1, '#fcc419'); },
    buttons: [],
  },
};

/* ---------- panel táctil ---------- */
function setup() {
  const g = G(), sc = g.sc, rules = GAMES[g.p.game], t = sc.t = { sent: null };
  t.newPath = r => { t.pts = XS.pathFor(g.seed + r * 101); t.L = pathLen(t.pts); t.len = t.L[t.L.length - 1]; t.prog = 0; t.samples = 0; t.bad = 0; t.t0 = null; t.on = false; t.off = false; t.wasOff = false; };
  rules.init(t);
  const box = document.createElement('div'); box.className = 'tact' + (rules.dark ? ' dark' : ''); box.innerHTML = '<canvas></canvas><div class="row"></div>';
  g.hud.appendChild(box); g.hud.querySelector('.mg-msg').style.top = '55%';
  const cv = box.querySelector('canvas'), c = cv.getContext('2d'), row = box.querySelector('.row'); sc.cv = cv; sc.c = c; sc.box = box;
  const send = () => { if (t.sent != null || g.finished) return; t.sent = rules.score(t); X('win'); done(t.sent, `🎉 ${t.sent} puntos`); row.querySelectorAll('button').forEach(b => { b.disabled = true; }); };
  t.send = send;
  for (const [txt, act, cls] of rules.buttons) { const b = document.createElement('button'); b.textContent = txt; if (cls) b.className = cls; b.addEventListener('pointerdown', e => { e.preventDefault(); if (act === 'send') send(); else rules.action(t, act); }); row.appendChild(b); }
  if (!rules.buttons.length) row.style.display = 'none';
  const resize = () => { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0); sc.W = r.width; sc.H = r.height; rules.layout(t, r.width, r.height); };
  resize(); sc.resize = resize; window.addEventListener('resize', resize); sc.unresize = () => window.removeEventListener('resize', resize);
  const uv = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; if (t.main && rules !== GAMES.fruta) { const [mx, my, Q] = t.main; return [(x - mx) / Q, (y - my) / Q]; } return [x / r.width, y / r.height]; };
  const live = () => t.sent == null && !g.finished && g.now < g.dur;
  cv.addEventListener('pointerdown', e => { e.preventDefault(); if (!live()) return; try { cv.setPointerCapture(e.pointerId); } catch (_) { } const [u, v] = uv(e); rules.down(t, u, v, g.now); });
  cv.addEventListener('pointermove', e => { if (!live() || !(e.buttons || e.pointerType === 'touch')) return; const [u, v] = uv(e); rules.move(t, u, v, g.now); });
  const up = () => rules.up(t); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

M.register('tactil', {
  ctrl: 'tactil', stage: true, cam: [0, 4.2, 8], look: [0, 1.2, -3],
  build(sc) { sc.scene.background = new THREE.Color(0x2b1257); sc.scene.fog = null; arenaRect(sc, 9, 8, { ...PAL.candy, ground: 0x7048e8, under: 0x2b1257 }, -3); },
  tick(dt, now, m) { const g = G(), sc = g.sc; if (!sc.t && g.hud) setup(); const t = sc.t; if (!t) return; const rules = GAMES[g.p.game];
    if (t.sent == null) m.sc = rules.score(t);
    if (rules === GAMES.traza && t.fin && t.sent == null) t.send(); },
  final() { const g = G(), t = g.sc.t, rules = GAMES[g.p.game]; if (!t) return 0; if (t.sent == null) { t.sent = rules.score(t); X('win'); } return t.sent; },
  hud() { const g = G(); if (!g.me) { const best = g.players.map(p => [p, (g.net[p.id] || [])[5] || 0]).sort((a, b) => b[1] - a[1])[0]; return best ? `Va ganando ${best[0].name}: ${best[1]}` : ''; }
    const t = g.sc.t; if (!t) return ''; return g.p.game === 'fruta' ? `🍉 ${t.pts} puntos` : t.sent != null ? `✅ ${t.sent} puntos · esperando a los demás` : '✍️ ¡Usa el dedo!'; },
  draw(now, tt) { const g = G(), sc = g.sc;
    g.players.forEach((p, i) => { const ch = g.chars[p.id]; if (!ch) return; const s = p.id === g.myId && g.me ? g.me.sc : (g.net[p.id] || [])[5] || 0; ch.g.position.y = Math.abs(Math.sin(tt * 3 + i)) * Math.min(0.5, s / 150); });
    if (!sc.t || !sc.c) return; if (sc.cv.clientWidth && Math.abs(sc.cv.clientWidth - sc.W) > 1) sc.resize(); const c = sc.c; c.clearRect(0, 0, sc.W, sc.H); GAMES[g.p.game].draw(sc.t, c, now); },
  stopX() { const sc = G() && G().sc; if (sc && sc.unresize) sc.unresize(); },
});
