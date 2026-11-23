// Juegos táctiles (se juegan con el dedo sobre la pantalla). Reglas compartidas y bots.
// Se carga después de minigames3.js y antes de minigames.js.
(function () {
  'use strict';
  const rngOf = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const ALL = ['ffa', 'team', '1vN', 'duel'];
  const cat = [
    ['cara', 'tactil', 'Deforma la Cara', '🤪', 'Arrastra los ojos, la boca, la nariz y la cabeza hasta que la cara se parezca al ejemplo. ¡Gana el más parecido!', 25, { game: 'cara' }, ALL],
    ['dibujo', 'tactil', 'Dibuja de Memoria', '✏️', 'Verás un dibujo 3 segundos. Luego desaparece: ¡dibújalo con el dedo lo más parecido posible!', 28, { game: 'dibujo' }, ALL],
    ['fruta', 'tactil', 'Corta la Fruta', '🍉', 'Desliza el dedo para cortar la fruta que salta. Las doradas valen 3. ¡No cortes las bombas!', 25, { game: 'fruta' }, ALL],
    ['traza', 'tactil', 'Traza el Camino', '〰️', 'Sigue el camino con el dedo de principio a fin sin salirte. Cuentan la precisión y la rapidez.', 25, { game: 'traza' }, ALL],
  ];
  // ---- Cara: parámetros [mín, máx]
  const FACE = { spread: [0.12, 0.3], eyeY: [0.3, 0.46], eyeR: [0.035, 0.09], mouthW: [0.12, 0.34], curve: [-0.12, 0.14], nose: [0.025, 0.08], headW: [0.32, 0.47] };
  function faceTarget(seed) { const r = rngOf(seed ^ 991), f = {}; for (const [k, [a, b]] of Object.entries(FACE)) f[k] = a + (b - a) * (0.1 + r() * 0.8); return f; }
  function faceStart(seed) { const f = {}; for (const [k, [a, b]] of Object.entries(FACE)) f[k] = (a + b) / 2; return f; }
  function faceScore(f, t) { let e = 0; for (const [k, [a, b]] of Object.entries(FACE)) e += Math.abs(f[k] - t[k]) / (b - a); return Math.max(0, Math.round(100 * (1 - e / 2.2))); }
  // ---- Dibujos (trazos en coordenadas 0..1)
  const circle = (cx, cy, r, n = 24, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const DRAWINGS = {
    casa: [[[0.2, 0.5], [0.5, 0.2], [0.8, 0.5]], [[0.27, 0.45], [0.27, 0.85], [0.73, 0.85], [0.73, 0.45]], [[0.44, 0.85], [0.44, 0.65], [0.56, 0.65], [0.56, 0.85]]],
    estrella: [[[0.5, 0.12], [0.61, 0.4], [0.9, 0.4], [0.66, 0.58], [0.76, 0.88], [0.5, 0.7], [0.24, 0.88], [0.34, 0.58], [0.1, 0.4], [0.39, 0.4], [0.5, 0.12]]],
    corazon: [[[0.5, 0.85], [0.18, 0.52], ...circle(0.33, 0.38, 0.17, 12, Math.PI * 0.85, Math.PI * 2).slice(1), ...circle(0.67, 0.38, 0.17, 12, Math.PI, Math.PI * 2.15).slice(1), [0.82, 0.52], [0.5, 0.85]]],
    sol: [circle(0.5, 0.5, 0.18), ...Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return [[0.5 + Math.cos(a) * 0.26, 0.5 + Math.sin(a) * 0.26], [0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4]]; })],
    pez: [[...circle(0.45, 0.5, 0.25, 20, -Math.PI * 0.8, Math.PI * 0.8)], [[0.25, 0.35], [0.1, 0.25], [0.1, 0.75], [0.25, 0.65]], circle(0.58, 0.44, 0.03, 8)],
    carita: [circle(0.5, 0.5, 0.36), circle(0.37, 0.4, 0.04, 8), circle(0.63, 0.4, 0.04, 8), circle(0.5, 0.52, 0.2, 14, Math.PI * 0.2, Math.PI * 0.8)],
    arbol: [[[0.45, 0.88], [0.45, 0.62], [0.55, 0.62], [0.55, 0.88]], [[0.5, 0.12], [0.2, 0.62], [0.8, 0.62], [0.5, 0.12]]],
    barco: [[[0.15, 0.62], [0.85, 0.62], [0.72, 0.8], [0.28, 0.8], [0.15, 0.62]], [[0.5, 0.62], [0.5, 0.15], [0.78, 0.55], [0.5, 0.55]]],
    flor: [circle(0.5, 0.35, 0.08, 12), ...[0, 1, 2, 3, 4].map(i => circle(0.5 + Math.cos(i / 5 * Math.PI * 2) * 0.15, 0.35 + Math.sin(i / 5 * Math.PI * 2) * 0.15, 0.08, 12)), [[0.5, 0.43], [0.5, 0.9]], [[0.5, 0.7], [0.65, 0.6]]],
    paraguas: [[...circle(0.5, 0.48, 0.32, 18, Math.PI, Math.PI * 2), [0.18, 0.48]], [[0.5, 0.48], [0.5, 0.82], ...circle(0.44, 0.82, 0.06, 8, 0, Math.PI)]],
  };
  const DKEYS = Object.keys(DRAWINGS);
  function sample(strokes, step = 0.012) { const out = []; for (const s of strokes) for (let i = 1; i < s.length; i++) { const [a, b] = [s[i - 1], s[i]], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / step)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } return out; }
  function drawScore(target, drawn) { const T = sample(target), D = sample(drawn); if (D.length < 5) return 0;
    const md = (P, Q) => { let s = 0; for (const p of P) { let m = 1e9; for (const q of Q) { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (d < m) m = d; } s += Math.sqrt(m); } return s / P.length; };
    const d = (md(T, D) * 1.2 + md(D, T)) / 2.2; return Math.max(0, Math.min(100, Math.round(100 * (1 - d / 0.13)))); }
  // ---- Fruta: lanzamientos
  function fruits(seed, dur) { const r = rngOf(seed ^ 555), list = []; let t = 900, id = 0; while (t < dur - 1500) { const n = 1 + Math.floor(r() * (t > 12000 ? 3 : 2));
    for (let k = 0; k < n; k++) { const q = r(); list.push({ id: id++, t: t + k * 120, x: 0.15 + r() * 0.7, vx: (r() - 0.5) * 0.35, vy: -(1.45 + r() * 0.3), kind: q < 0.16 ? 'bomb' : q < 0.26 ? 'gold' : 'fruit', e: ['🍉', '🍎', '🍊', '🍍', '🍓', '🍌'][Math.floor(r() * 6)] }); } t += 700 + r() * 500; } return list; }
  const FG = 1.9; // gravedad (pantallas por segundo²)
  const fruitPos = (f, now) => { const k = (now - f.t) / 1000; return [f.x + f.vx * k, 1.05 + f.vy * k + FG * k * k / 2]; };
  // ---- Camino a trazar
  function pathFor(seed) { const r = rngOf(seed ^ 313), pts = []; let x = 0.15, y = 0.12; pts.push([x, y]);
    for (let i = 0; i < 6; i++) { y += 0.13; x = 0.15 + r() * 0.7; pts.push([x, y]); } return pts; }
  const PATH_W = 0.06;
  function distToPath(p, pts) { let m = 1e9; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let k = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; k = Math.max(0, Math.min(1, k)); m = Math.min(m, Math.hypot(p[0] - a[0] - dx * k, p[1] - a[1] - dy * k)); } return m; }

  const PLAN = { cara: [[40, 62], [55, 75], [70, 88]], dibujo: [[30, 50], [45, 65], [60, 80]], fruta: [[8, 14], [13, 20], [18, 28]], traza: [[35, 55], [50, 70], [65, 85]] };
  const kind = {
    spawn(i, n) { return [(i - (n - 1) / 2) * 1.5, -4]; },
    botInit(ctx, b) { const g = ctx.p.game, [a, c] = PLAN[g][b.k]; b.plan = Math.round(a + Math.random() * (c - a)); b.planAt = ctx.dur * (g === 'fruta' ? 1 : 0.55 + Math.random() * 0.4) - 200; },
    bot(ctx, b, dt, now, net, H, { finish }) { b.sc = Math.round(b.plan * Math.min(1, now / b.planAt)); if (now >= b.planAt) finish(b, b.plan, 3); },
    final(ctx, id) { return ctx.bots[id] ? ctx.bots[id].plan : 0; },
  };
  const X = window.MGX; X.cat.push(...cat); Object.assign(X.meta, { tactil: ['pts'] }); X.kinds.tactil = kind;
  Object.assign(X.shared, { FACE, faceTarget, faceStart, faceScore, DRAWINGS, DKEYS, drawScore, fruits, fruitPos, FG, pathFor, PATH_W, distToPath, rngOf });
})();
