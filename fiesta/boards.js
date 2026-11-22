// Tableros con caminos: recorrido principal irregular + atajos y desvíos.
// window.BOARDS.build(tema) -> { nodes:[{id,x,y,z,type,next,prev,branch}], start, landmark, R }
(function () {
  const SPACING = 2.7;
  function rngOf(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Curva Catmull-Rom densa a partir de puntos de control
  function dense(pts, closed) {
    const out = [], n = pts.length, segs = closed ? n : n - 1;
    const P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < 24; k++) { const t = k / 24, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }
  function length(poly, closed) { let L = 0; for (let i = 1; i < poly.length; i++) L += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    if (closed) L += Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]); return L; }
  // count puntos equiespaciados (closed: sin repetir el primero; abierto: interiores sin extremos)
  function resample(poly, closed, count) {
    const pts = closed ? poly.concat([poly[0]]) : poly, L = length(pts, false), out = [];
    const step = closed ? L / count : L / (count + 1);
    let target = closed ? 0 : step, acc = 0;
    for (let i = 1; i < pts.length && out.length < count; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (acc + d >= target && out.length < count) { const k = (target - acc) / d; out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); target += step; }
      acc += d;
    }
    return out;
  }

  // Diseños: puntos de control del camino principal (sentido de avance) y ramas.
  // Rama: desde el punto más cercano a 'a' hasta el más cercano a 'b' pasando por 'pts'.
  const LAYOUTS = {
    isla: { seed: 3, hills: 0.25, main: [[-14, -3], [-9, -9], [-2, -8], [4, -12], [11, -10], [15, -3], [12, 5], [5, 7], [0, 12], [-7, 11], [-11, 6], [-16, 4]],
      branches: [{ kind: 'atajo', a: [-2, -8], b: [5, 7], pts: [[0, -2], [2, 3]] }, { kind: 'desvio', a: [0, 12], b: [-11, 6], pts: [[-3, 17], [-11, 16], [-15, 11]] }],
      landmark: [8, -2], lmScale: 0.6 },
    dulces: { seed: 7, hills: 0.4, main: [[-15, 0], [-12, -8], [-4, -10], [0, -5], [5, -11], [13, -9], [16, -1], [12, 7], [5, 10], [-1, 6], [-6, 11], [-13, 8]],
      branches: [{ kind: 'atajo', a: [0, -5], b: [-1, 6], pts: [[1, 0]] }, { kind: 'desvio', a: [16, -1], b: [5, 10], pts: [[20, 4], [17, 12], [10, 15]] }],
      landmark: [-7, 0], lmScale: 0.7 },
    lava: { seed: 13, hills: 0.8, main: [[-16, -8], [-7, -11], [0, -6], [7, -11], [16, -8], [13, 0], [16, 8], [7, 11], [0, 6], [-7, 11], [-16, 8], [-13, 0]],
      branches: [{ kind: 'atajo', a: [0, -6], b: [0, 6], pts: [[0, 0]] }, { kind: 'desvio', a: [-16, 8], b: [-16, -8], pts: [[-21, 6], [-22, -1], [-21, -7]] }],
      landmark: [8, 0], lmScale: 0.75 },
    nieve: { seed: 21, hills: 0.5, main: [[-16, -9], [-6, -10], [0, -6], [6, -10], [16, -9], [17, 0], [15, 9], [5, 11], [-5, 11], [-15, 9], [-17, 0]],
      branches: [{ kind: 'atajo', a: [-17, 0], b: [17, 0], pts: [[-8, 1], [0, 2], [8, 1]] }, { kind: 'desvio', a: [5, 11], b: [-5, 11], pts: [[6, 17], [0, 19], [-6, 17]] }],
      landmark: [-7, -4], lmScale: 0.65 },
  };

  // Reparto de casillas: B azul +3, R roja −3, E evento, V cambio de sentido, D duelo
  function pickType(r, weights) { let x = r() * weights.reduce((a, w) => a + w[1], 0); for (const [t, w] of weights) { x -= w; if (x <= 0) return t; } return 'B'; }
  const W_MAIN = [['B', 44], ['R', 17], ['E', 14], ['V', 8], ['D', 9]];
  const W = { atajo: [['B', 25], ['R', 35], ['E', 10], ['V', 10], ['D', 20]], desvio: [['B', 60], ['E', 30], ['D', 10]] };

  const cache = {};
  function build(theme) {
    if (cache[theme]) return cache[theme];
    const L = LAYOUTS[theme] || LAYOUTS.isla, r = rngOf(L.seed * 7919);
    const rawMain = dense(L.main, true), scale = (30 * SPACING) / length(rawMain, true);
    const sc = p => [p[0] * scale, p[1] * scale];
    const mainPoly = dense(L.main.map(sc), true), nMain = Math.round(length(mainPoly, true) / SPACING);
    const nodes = resample(mainPoly, true, nMain).map((p, i) => ({ id: i, x: p[0], z: p[1], type: 'B', next: [(i + 1) % nMain], prev: [], branch: null }));
    const nearest = q => { let bi = 0, bd = 1e9; for (let i = 0; i < nMain; i++) { const d = Math.hypot(nodes[i].x - q[0], nodes[i].z - q[1]); if (d < bd) { bd = d; bi = i; } } return bi; };
    L.branches.forEach(br => {
      const ia = nearest(sc(br.a)), ib = nearest(sc(br.b));
      const poly = dense([[nodes[ia].x, nodes[ia].z], ...br.pts.map(sc), [nodes[ib].x, nodes[ib].z]], false);
      const k = Math.max(1, Math.round(length(poly, false) / SPACING) - 1);
      const pts = resample(poly, false, k); let prevId = ia;
      pts.forEach((p, j) => { const id = nodes.length; nodes.push({ id, x: p[0], z: p[1], type: 'B', next: [], prev: [], branch: br.kind });
        nodes[prevId].next.push(id); prevId = id; });
      nodes[prevId].next.push(ib);
      nodes[ia].fork = true;
    });
    nodes.forEach(n => n.next.forEach(m => nodes[m].prev.push(n.id)));
    nodes.forEach(n => { n.type = n.id === 0 ? 'S' : (n.fork || n.prev.length > 1) ? 'B' : pickType(r, n.branch ? W[n.branch] : W_MAIN);
      n.y = L.hills * (1 + Math.sin(n.x * 0.22 + L.seed) * 0.6 + Math.cos(n.z * 0.27) * 0.4); });
    // evitar dos casillas especiales seguidas en el camino principal
    for (let i = 1; i < nMain; i++) if ('VD'.includes(nodes[i].type) && 'VD'.includes(nodes[i - 1].type)) nodes[i].type = 'B';
    const R = Math.max(...nodes.map(n => Math.hypot(n.x, n.z)));
    return cache[theme] = { nodes, start: 0, nMain, landmark: sc(L.landmark), lmScale: L.lmScale, R, hills: L.hills };
  }
  // Distancia en pasos (BFS hacia adelante) — la usan los bots para buscar la corona
  function dist(g, from, to, dir) {
    const seen = new Map([[from, 0]]), q = [from];
    while (q.length) { const u = q.shift(); if (u === to) return seen.get(u); for (const v of (dir < 0 ? g.nodes[u].prev : g.nodes[u].next)) if (!seen.has(v)) { seen.set(v, seen.get(u) + 1); q.push(v); } }
    return 999;
  }
  window.BOARDS = { build, dist, themes: Object.keys(LAYOUTS) };
})();
