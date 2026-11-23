// Minijuegos extra (tanda 2): reglas compartidas y bots. Se carga ANTES de minigames.js,
// que los incorpora al catálogo y llama a estas funciones desde el anfitrión.
(function () {
  'use strict';
  const SP = 4.6, MISS = 100000;
  const rngOf = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const cat = [
    ['futbol', 'futbol', 'Fútbol Gigante', '⚽', 'Equipos de 2: lleva la pelota al arco rival. Usa PATEAR para un tiro fuerte.', 45, {}, ['team']],
    ['relevos', 'relevos', 'Relevos', '🏃', 'Cada compañero corre su tramo tocando rápido y le pasa el testigo al siguiente.', 30, {}, ['team']],
    ['voley', 'voley', 'Vóley de Playa', '🏐', 'Párate bajo la pelota para devolverla (mira su sombra). Si cae en tu lado, punto para el rival.', 45, {}, ['team']],
    ['escondite', 'escondite', 'Escondite', '🔦', 'El solitario busca con su linterna. Los demás se esconden detrás de los muebles. Si te alumbra, te encontró.', 35, {}, ['1vN']],
    ['gigante', 'gigante', 'El Gigante', '🦶', 'El solitario es un gigante que da PISOTONES. Los demás corren: si los alcanza la onda, quedan fuera.', 30, {}, ['1vN']],
    ['portero', 'portero', 'Portero', '🥅', 'Los tiradores detienen la mira para patear. El portero se mueve para atajar.', 40, {}, ['1vN']],
    ['escalada', 'escalada', 'Escalada de Lava', '🧗', 'Salta de plataforma en plataforma hacia arriba: ¡la lava sube! Gana quien llegue más alto.', 40, {}],
    ['karts', 'karts', 'Karts', '🏎️', 'Dos vueltas al circuito. Mantén ACELERAR y gira con ◀ ▶. La pista tiene bordes. Las flechas amarillas dan turbo.', 45, {}],
    ['bolos', 'bolos', 'Bolos', '🎳', 'Toca para fijar la dirección y otra vez para la fuerza. 4 tiros: ¡derriba todos los pinos!', 40, {}],
    ['ritmo', 'ritmo', 'Ritmo Fiestero', '🎵', 'Toca la flecha correcta cuando llegue a la línea. ¡Al compás!', 30, {}],
    ['encaja', 'encaja', 'Encaja la Figura', '🧱', 'Llegan paredes con un hueco: cámbiate de carril y AGÁCHATE si el hueco es bajo. Tienes 3 vidas.', 35, {}],
  ];
  const meta = { futbol: ['goals'], relevos: ['count', 'metros'], voley: ['pts'], escondite: ['tag'], gigante: ['tag'], portero: ['count', 'puntos'],
    escalada: ['count', 'metros'], karts: ['time'], bolos: ['count', 'pinos'], ritmo: ['pts'], encaja: ['count', 'paredes'] };

  // ---------- datos compartidos (cliente y anfitrión)
  const FUT = { hx: 7, hz: 4.5, goal: 1.4 };
  const VOL = { hx: 6, hz: 4, g: 9, T: 1.5 };
  const HOUSE = { half: 7.5, boxes: [[-4, -3.5, 1.6, 1], [0.5, -4, 1, 1.8], [4.5, -2.5, 1.2, 1.2], [-4.5, 2, 1.2, 2], [0, 0.5, 2, 0.8], [4, 3.5, 1.8, 1], [-1, 4.6, 1, 1], [2.5, -0.5, 0.8, 0.8], [-2.2, -0.8, 0.8, 0.8]] }; // [cx, cz, medio ancho x, medio ancho z]
  function houseCollide(x, z, r = 0.35) {
    for (const [cx, cz, hx, hz] of HOUSE.boxes) { const dx = x - cx, dz = z - cz, ox = hx + r - Math.abs(dx), oz = hz + r - Math.abs(dz);
      if (ox > 0 && oz > 0) { if (ox < oz) x += Math.sign(dx || 1) * ox; else z += Math.sign(dz || 1) * oz; } }
    const H = HOUSE.half - r; return [clamp(x, -H, H), clamp(z, -H, H)];
  }
  function segHitsBox(x1, z1, x2, z2) { // ¿algún mueble tapa la línea de vista?
    for (const [cx, cz, hx, hz] of HOUSE.boxes) { let t0 = 0, t1 = 1; const dx = x2 - x1, dz = z2 - z1;
      const clip = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
      if (clip(-dx, x1 - (cx - hx)) && clip(dx, (cx + hx) - x1) && clip(-dz, z1 - (cz - hz)) && clip(dz, (cz + hz) - z1) && t0 <= t1) return true; }
    return false;
  }
  const LIGHT = { len: 6, half: 0.62, expose: 350 };
  function inLight(sx, sz, sry, x, z) { const dx = x - sx, dz = z - sz, d = Math.hypot(dx, dz); if (d > LIGHT.len || d < 0.01) return false;
    let a = Math.atan2(dx, dz) - sry; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) < LIGHT.half && !segHitsBox(sx, sz, x, z); }
  const GIANT = { r: 2.4, wind: 450, cool: 1600, scale: 2.4, speed: 0.75 };
  const GOAL = { z: -5, w: 3, shooterZ: 4.5, aimMs: 3200, flyMs: 800, pauseMs: 900, keeperSpeed: 0.72 };
  // Escalada: plataformas en espiral
  function platforms(seed) { const r = rngOf(seed), out = [{ x: 0, z: 0, y: 0, r: 3.2 }]; let a = 0;
    for (let i = 1; i < 60; i++) { a += 0.75 + r() * 0.6; const rad = 2.2 + r() * 1.6; out.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, y: i * 1.25, r: 0.95 + r() * 0.35 }); }
    return out; }
  const lavaY = now => { const t = now / 1000; return -2.5 + 0.28 * t + 0.0055 * t * t; };
  // Karts: circuito cerrado
  const TRACK_PTS = [[0, 9], [8, 8], [12, 2], [9, -5], [3, -4], [0, -9], [-7, -8], [-11, -2], [-8, 4], [-3, 3]];
  const TRACK = (() => { const pts = [], n = TRACK_PTS.length;
    for (let i = 0; i < n; i++) { const p0 = TRACK_PTS[(i - 1 + n) % n], p1 = TRACK_PTS[i], p2 = TRACK_PTS[(i + 1) % n], p3 = TRACK_PTS[(i + 2) % n];
      for (let k = 0; k < 20; k++) { const t = k / 20, t2 = t * t, t3 = t2 * t; pts.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); } }
    const cum = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    return { pts, cum, len: cum[cum.length - 1], width: 3.4, laps: 2, boosts: [0.12, 0.45, 0.78] }; })();
  function trackAt(s) { const T = TRACK, L = ((s % T.len) + T.len) % T.len; let i = 0; while (T.cum[i + 1] < L) i++; const a = T.pts[i], b = T.pts[(i + 1) % T.pts.length], k = (L - T.cum[i]) / (T.cum[i + 1] - T.cum[i]);
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, dir: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
  function trackNearest(x, z, hint) { const T = TRACK, n = T.pts.length; let best = 0, bd = 1e9; const from = hint == null ? 0 : hint - 12, to = hint == null ? n : hint + 12;
    for (let j = from; j < to; j++) { const i = ((j % n) + n) % n, p = T.pts[i], d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = i; } } return { i: best, d: Math.sqrt(bd), s: T.cum[best] }; }
  // Ritmo: notas
  function chart(seed, dur) { const r = rngOf(seed), notes = []; let t = 2000; const beat = 500;
    while (t < dur - 1200) { const dens = t < 10000 ? 2 : t < 20000 ? 1 : 0.5; notes.push({ t, lane: Math.floor(r() * 4) }); t += beat * (r() < 0.3 ? dens / 2 : dens); }
    return notes; }
  // Encaja: paredes
  function walls(seed, dur) { const r = rngOf(seed), out = []; let t = 2600, gap = 2700; while (t < dur - 500) { out.push({ t, lane: Math.floor(r() * 3) - 1, low: r() < 0.4 }); t += gap; gap = Math.max(1500, gap * 0.95); } return out; }
  const WALL_TRAVEL = 1700;

  const PLAN = (b, ranges) => Math.round(ranges[b.k][0] + Math.random() * (ranges[b.k][1] - ranges[b.k][0]));
  const teamIdx = (ctx, id) => ctx.teams ? (ctx.teams.A.includes(id) ? 'A' : 'B') : null;
  const near = (ctx, from, ids, posOf) => { let best = null, bd = 1e9, bid = null; for (const id of ids) { const a = posOf(id); if (!a) continue; const d = Math.hypot(a[0] - from[0], a[1] - from[1]); if (d < bd) { bd = d; best = a; bid = id; } } return { p: best, d: bd, id: bid }; };

  const kinds = {
    // ===== Fútbol (2 contra 2)
    futbol: {
      clamp: () => (x, z) => [clamp(x, -FUT.hx + 0.3, FUT.hx - 0.3), clamp(z, -FUT.hz + 0.3, FUT.hz - 0.3)],
      init(ctx) { ctx.ball = { x: 0, z: 0, vx: 0, vz: 0 }; ctx.goals = { A: 0, B: 0 }; ctx.kick = {}; ctx.freeze = 2000; ctx.dashT = {}; },
      botInit(ctx, b, pl) { const t = teamIdx(ctx, pl.id), list = ctx.teams[t], k = list.indexOf(pl.id); b.x = (t === 'A' ? -1 : 1) * (2.5 + k * 1.5); b.z = (k - (list.length - 1) / 2) * 2.2; },
      step(ctx, dt, now, net, out, H, { posOf }) {
        const bl = ctx.ball; net.x.dash = net.x.dash || {};
        if (now >= ctx.freeze) {
          for (const id of ctx.players) { const a = posOf(id); if (!a) continue; const dx = bl.x - a[0], dz = bl.z - a[1], d = Math.hypot(dx, dz);
            if (d < 0.95 && now - (ctx.kick[id] || 0) > 180) { ctx.kick[id] = now; const strong = (net.x.dash[id] || 0) > now, pw = strong ? 13 : 5.5, l = d || 1; bl.vx = dx / l * pw; bl.vz = dz / l * pw; if (strong) net.x.kick = [id, Math.round(now)]; } }
          bl.x += bl.vx * dt; bl.z += bl.vz * dt; const f = Math.exp(-dt * 0.7); bl.vx *= f; bl.vz *= f;
          if (Math.abs(bl.z) > FUT.hz) { bl.z = Math.sign(bl.z) * FUT.hz; bl.vz *= -0.8; }
          if (Math.abs(bl.x) > FUT.hx) { if (Math.abs(bl.z) < FUT.goal) { const scorer = bl.x > 0 ? 'A' : 'B'; ctx.goals[scorer]++; net.x.goal = [scorer, Math.round(now)]; Object.assign(bl, { x: 0, z: 0, vx: 0, vz: 0 }); ctx.freeze = now + 1500; }
            else { bl.x = Math.sign(bl.x) * FUT.hx; bl.vx *= -0.8; } }
        }
        net.x.ball = [+bl.x.toFixed(2), +bl.z.toFixed(2)]; net.x.goals = [ctx.goals.A, ctx.goals.B];
        if (now >= ctx.dur && !net.team) net.team = ctx.goals.A === ctx.goals.B ? 'tie' : ctx.goals.A > ctx.goals.B ? 'A' : 'B';
      },
      bot(ctx, b, dt, now, net, H, { go }) {
        const t = teamIdx(ctx, b.id), dirX = t === 'A' ? 1 : -1, mates = ctx.teams[t], bl = ctx.ball;
        const ballDist = id => { const bb = ctx.bots[id]; const a = bb ? [bb.x, bb.z] : (net.pos[id] || [99, 99]); return Math.hypot(a[0] - bl.x, a[1] - bl.z); };
        const attacker = mates.slice().sort((a, c) => ballDist(a) - ballDist(c))[0] === b.id;
        const sp = SP * [0.7, 0.85, 0.97][b.k];
        if (attacker) { const tx = bl.x - dirX * 0.7, tz = bl.z - (bl.z - 0) * 0.15; const d = Math.hypot(tx - b.x, tz - b.z);
          if (d > 0.4) go(tx, tz, sp); else go(bl.x + dirX, bl.z, sp);
          if (Math.hypot(bl.x - b.x, bl.z - b.z) < 1.3 && Math.sign(bl.x - b.x) === dirX && now > (b.nextDash || 0) && Math.random() < [0.05, 0.1, 0.18][b.k]) { net.x.dash[b.id] = now + 300; b.nextDash = now + 1200; } }
        else go(-dirX * FUT.hx * 0.55 + (bl.x + dirX * FUT.hx) * 0.15, bl.z * 0.6, sp * 0.9);
        b.sc = ctx.goals[t];
      },
      action(ctx, pid, msg, now, net) { if (msg.dash) { net.x.dash = net.x.dash || {}; net.x.dash[pid] = now + 320; } },
      final(ctx, id) { return ctx.goals[teamIdx(ctx, id)] || 0; },
      override(ctx, scores) { for (const id of ctx.players) scores[id] = ctx.goals[teamIdx(ctx, id)] || 0; },
    },
    // ===== Relevos (2 contra 2)
    relevos: {
      init(ctx) { ctx.prog = { A: 0, B: 0 }; ctx.last = {}; ctx.leg = 24; ctx.finT = {}; },
      botInit(ctx, b) { b.taps = 0; },
      step(ctx, dt, now, net) {
        if (now < 2000) { net.x.relay = { A: 0, B: 0, leg: ctx.leg }; return; }
        for (const t of ['A', 'B']) { const list = ctx.teams[t], total = ctx.leg * list.length; if (ctx.prog[t] >= total) continue;
          const runner = list[Math.min(list.length - 1, Math.floor(ctx.prog[t] / ctx.leg))], bb = ctx.bots[runner];
          const taps = bb ? bb.taps : ((net.pos[runner] || [])[5] || 0), prev = ctx.last[runner] ?? taps; ctx.last[runner] = taps;
          ctx.prog[t] = Math.min(total, ctx.prog[t] + Math.max(0, Math.min(6, taps - prev)) * 0.55);
          for (const id of list) if (id !== runner) ctx.last[id] = bb && id === runner ? taps : (ctx.bots[id] ? ctx.bots[id].taps : ((net.pos[id] || [])[5] || 0));
          if (ctx.prog[t] >= total && !ctx.finT[t]) { ctx.finT[t] = now; if (!net.team) { net.team = t; net.over = true; } } }
        net.x.relay = { A: +ctx.prog.A.toFixed(2), B: +ctx.prog.B.toFixed(2), leg: ctx.leg };
        if (now >= ctx.dur && !net.team) net.team = ctx.prog.A === ctx.prog.B ? 'tie' : ctx.prog.A > ctx.prog.B ? 'A' : 'B';
      },
      bot(ctx, b, dt, now) { if (now > 2000) b.taps += dt * [5.5, 7, 8.5][b.k] * (0.9 + Math.random() * 0.2); b.sc = Math.round(b.taps); },
      final(ctx, id) { return Math.round(ctx.prog[teamIdx(ctx, id)]); },
      override(ctx, scores) { for (const id of ctx.players) scores[id] = Math.round(ctx.prog[teamIdx(ctx, id)]); },
    },
    // ===== Vóley (2 contra 2)
    voley: {
      clamp: () => (x, z) => [clamp(x, -VOL.hx, VOL.hx), clamp(z, -VOL.hz, VOL.hz)],
      init(ctx) { ctx.pts = { A: 0, B: 0 }; ctx.serve = 'A'; ctx.vb = null; ctx.wait = 2200; ctx.lastHit = {}; },
      botInit(ctx, b, pl) { const t = teamIdx(ctx, pl.id), list = ctx.teams[t], k = list.indexOf(pl.id); b.x = (t === 'A' ? -1 : 1) * 3; b.z = (k - (list.length - 1) / 2) * 2.5; },
      step(ctx, dt, now, net, out, H, { posOf }) {
        const launch = (fromX, fromZ, fromY, side) => { const tx = side * (1.5 + Math.random() * 3.8), tz = (Math.random() * 2 - 1) * (VOL.hz - 0.6), T = VOL.T;
          ctx.vb = { x: fromX, y: fromY, z: fromZ, vx: (tx - fromX) / T, vz: (tz - fromZ) / T, vy: (0 - fromY + 0.5 * VOL.g * T * T) / T }; ctx.flight = (ctx.flight || 0) + 1; };
        if (!ctx.vb && now >= ctx.wait) { const s = ctx.serve === 'A' ? -1 : 1; launch(s * 4, 0, 1.5, -s); }
        const vb = ctx.vb;
        if (vb) { vb.x += vb.vx * dt; vb.z += vb.vz * dt; vb.vy -= VOL.g * dt; vb.y += vb.vy * dt;
          if (vb.vy < 0 && vb.y < 2.1 && vb.y > 0.3) for (const id of ctx.players) { const a = posOf(id); if (!a || now - (ctx.lastHit[id] || 0) < 500) continue; const side = teamIdx(ctx, id) === 'A' ? -1 : 1;
            if (Math.sign(vb.x) !== side && Math.abs(vb.x) > 0.2) continue; if (Math.hypot(a[0] - vb.x, a[1] - vb.z) < 1.05) { ctx.lastHit[id] = now; launch(vb.x, vb.z, vb.y, -side); net.x.hit = [id, Math.round(now)]; break; } }
          if (ctx.vb && ctx.vb.y <= 0) { const sideA = ctx.vb.x < 0; const winner = sideA ? 'B' : 'A'; ctx.pts[winner]++; net.x.point = [winner, Math.round(now)]; ctx.serve = sideA ? 'A' : 'B'; ctx.vb = null; ctx.wait = now + 1300; } }
        net.x.vball = ctx.vb ? [+ctx.vb.x.toFixed(2), +ctx.vb.y.toFixed(2), +ctx.vb.z.toFixed(2)] : null; net.x.pts = [ctx.pts.A, ctx.pts.B];
        if (ctx.vb) { let x = ctx.vb.x, z = ctx.vb.z, y = ctx.vb.y, vy = ctx.vb.vy; for (let i = 0; i < 200 && y > 0; i++) { x += ctx.vb.vx * 0.02; z += ctx.vb.vz * 0.02; vy -= VOL.g * 0.02; y += vy * 0.02; } net.x.land = [+x.toFixed(2), +z.toFixed(2)]; } else net.x.land = null;
        if ((ctx.pts.A >= 7 || ctx.pts.B >= 7) && !net.team) { net.team = ctx.pts.A > ctx.pts.B ? 'A' : 'B'; net.over = true; }
        if (now >= ctx.dur && !net.team) net.team = ctx.pts.A === ctx.pts.B ? 'tie' : ctx.pts.A > ctx.pts.B ? 'A' : 'B';
      },
      bot(ctx, b, dt, now, net, H, { go }) { const t = teamIdx(ctx, b.id), side = t === 'A' ? -1 : 1, list = ctx.teams[t], k = list.indexOf(b.id), land = net.x.land;
        let tx = side * 3, tz = (k - (list.length - 1) / 2) * 2.5;
        if (land && Math.sign(land[0]) === side) { const mine = list.slice().sort((a, c) => { const pa = ctx.bots[a] ? [ctx.bots[a].x, ctx.bots[a].z] : (net.pos[a] || [0, 0]), pc = ctx.bots[c] ? [ctx.bots[c].x, ctx.bots[c].z] : (net.pos[c] || [0, 0]); return Math.hypot(pa[0] - land[0], pa[1] - land[1]) - Math.hypot(pc[0] - land[0], pc[1] - land[1]); })[0] === b.id;
          if (mine) { if (b.fl !== ctx.flight) { b.fl = ctx.flight; const miss = Math.random() > [0.6, 0.75, 0.88][b.k], a = Math.random() * 6.28, e = miss ? 2.2 : 0.3; b.ex = Math.cos(a) * e; b.ez = Math.sin(a) * e; }
            tx = land[0] + (b.ex || 0); tz = land[1] + (b.ez || 0); } }
        go(clamp(tx, side < 0 ? -VOL.hx : 0.3, side < 0 ? -0.3 : VOL.hx), tz, SP * [0.7, 0.85, 1][b.k]); b.sc = ctx.pts[t]; },
      final(ctx, id) { return ctx.pts[teamIdx(ctx, id)] || 0; },
      override(ctx, scores) { for (const id of ctx.players) scores[id] = ctx.pts[teamIdx(ctx, id)] || 0; },
    },
    // ===== Escondite (1 contra 3)
    escondite: {
      clamp: () => (x, z) => houseCollide(x, z),
      spawn(i, n) { return i === 0 ? [0, -6.5] : [((i - 1) - (n - 2) / 2) * 1.6, 6]; },
      init(ctx, players) { ctx.seeker = ctx.teams ? (ctx.teams.A.length === 1 ? ctx.teams.A[0] : ctx.teams.B[0]) : players[0].id; ctx.exp = {}; ctx.found = {}; },
      botInit(ctx, b, pl, i) { if (pl.id === ctx.seeker) { b.x = 0; b.z = -6.5; } },
      step(ctx, dt, now, net, out, H, { posOf }) {
        const s = posOf(ctx.seeker); net.x.out = ctx.found; net.x.seeker = ctx.seeker;
        if (!s || now < 5000) return; const sry = ctx.bots[ctx.seeker] ? ctx.bots[ctx.seeker].ry : (s[3] || 0);
        for (const id of ctx.players) { if (id === ctx.seeker || ctx.found[id] != null) continue; const a = posOf(id); if (!a) continue;
          if (inLight(s[0], s[1], sry, a[0], a[1])) { ctx.exp[id] = (ctx.exp[id] || 0) + dt * 1000; if (ctx.exp[id] >= LIGHT.expose) { ctx.found[id] = Math.round(now); if (ctx.bots[id]) { ctx.bots[id].score = Math.round(now); ctx.bots[id].st = 1; out[id] = Math.round(now); } } }
          else ctx.exp[id] = Math.max(0, (ctx.exp[id] || 0) - dt * 300); }
        const hiders = ctx.players.filter(id => id !== ctx.seeker), n = hiders.filter(id => ctx.found[id] != null).length; net.x.caught = n; net.x.exp = ctx.exp;
        if (n === hiders.length && !net.team) { net.team = teamIdx(ctx, ctx.seeker) || 'A'; net.over = true; }
        if (now >= ctx.dur && !net.team) net.team = teamIdx(ctx, hiders[0]) || 'B';
      },
      bot(ctx, b, dt, now, net, H, { posOf, live }) {
        const mv = (tx, tz, sp) => { const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz); if (d > 0.1) { const m = Math.min(d, sp * dt); [b.x, b.z] = houseCollide(b.x + dx / d * m, b.z + dz / d * m); b.ry = Math.atan2(dx, dz); b.mv = 1; } else b.mv = 0; };
        if (b.id === ctx.seeker) { if (now < 5000) { b.mv = 0; return; }
          let tgt = null; for (const id of ctx.players) { if (id === b.id || ctx.found[id] != null) continue; const a = posOf(id); if (a && Math.hypot(a[0] - b.x, a[1] - b.z) < [4, 5.5, 7][b.k] && !segHitsBox(b.x, b.z, a[0], a[1])) { tgt = a; break; } }
          if (tgt) { mv(tgt[0], tgt[1], SP * [0.85, 0.95, 1.05][b.k]); b.ry = Math.atan2(tgt[0] - b.x, tgt[1] - b.z); }
          else { // "intuye" dónde está alguien (más seguido cuanto mejor es)
            if (b.retarget <= 0 || Math.hypot((b.wx || 0) - b.x, (b.wz || 0) - b.z) < 0.6) { b.retarget = [3, 2.2, 1.6][b.k];
              const left = ctx.players.filter(id => id !== b.id && ctx.found[id] == null), guess = Math.random() < [0.5, 0.7, 0.88][b.k] && left.length ? posOf(left[Math.floor(Math.random() * left.length)]) : null;
              if (guess) { b.wx = guess[0] + (Math.random() - 0.5) * 2; b.wz = guess[1] + (Math.random() - 0.5) * 2; } else { b.wx = (Math.random() * 2 - 1) * 6.5; b.wz = (Math.random() * 2 - 1) * 6.5; }  [b.wx, b.wz] = houseCollide(b.wx, b.wz, 0.6); }
            mv(b.wx, b.wz, SP * 0.75); }
          b.sc = net.x.caught || 0; return; }
        const s = posOf(ctx.seeker); if (!s) return;
        if (b.retarget <= 0) { b.retarget = 2.5; const box = HOUSE.boxes[Math.floor(Math.random() * HOUSE.boxes.length)], dx = box[0] - s[0], dz = box[1] - s[1], d = Math.hypot(dx, dz) || 1;
          b.hx = box[0] + dx / d * (Math.max(box[2], box[3]) + 0.6); b.hz = box[1] + dz / d * (Math.max(box[2], box[3]) + 0.6); [b.hx, b.hz] = houseCollide(b.hx, b.hz, 0.6); }
        const ds = Math.hypot(s[0] - b.x, s[1] - b.z); if (ds < 3 && live) { const ux = (b.x - s[0]) / (ds || 1), uz = (b.z - s[1]) / (ds || 1); mv(b.x + ux * 2, b.z + uz * 2, SP * [0.6, 0.72, 0.85][b.k]); }
        else if (live) mv(b.hx ?? b.x, b.hz ?? b.z, SP * 0.75); else b.mv = 0;
      },
      final(ctx, id, net) { return id === ctx.seeker ? (net.x.caught || 0) : (ctx.found[id] ?? ctx.dur); },
      override(ctx, scores, net) { for (const id of ctx.players) scores[id] = id === ctx.seeker ? (net.x.caught || 0) : (ctx.found[id] ?? scores[id] ?? ctx.dur); },
    },
    // ===== El Gigante (1 contra 3)
    gigante: {
      clamp: () => (x, z) => { const d = Math.hypot(x, z), R = 7; return d > R ? [x / d * R, z / d * R] : [x, z]; },
      spawn(i, n) { if (i === 0) return [0, 0]; const a = (i - 1) / Math.max(1, n - 1) * Math.PI * 2; return [Math.cos(a) * 5, Math.sin(a) * 5]; },
      init(ctx, players) { ctx.giant = ctx.teams ? (ctx.teams.A.length === 1 ? ctx.teams.A[0] : ctx.teams.B[0]) : players[0].id; ctx.stomps = []; ctx.flat = {}; ctx.lastStomp = -9999; },
      botInit(ctx, b, pl) { if (pl.id === ctx.giant) { b.x = 0; b.z = 0; } },
      step(ctx, dt, now, net, out, H, { posOf }) {
        for (const st of ctx.stomps) { if (st.done || now < st.t) continue; st.done = true;
          for (const id of ctx.players) { if (id === ctx.giant || ctx.flat[id] != null) continue; const a = posOf(id); if (a && a[2] < 0.6 && Math.hypot(a[0] - st.x, a[1] - st.z) < GIANT.r) { ctx.flat[id] = Math.round(now); if (ctx.bots[id]) { ctx.bots[id].score = Math.round(now); ctx.bots[id].st = 1; out[id] = Math.round(now); } } } }
        ctx.stomps = ctx.stomps.filter(st => now - st.t < 1500); net.ev = ctx.stomps.map(st => ({ id: st.id, x: st.x, z: st.z, t: st.t })); net.x.out = ctx.flat; net.x.giant = ctx.giant;
        const runners = ctx.players.filter(id => id !== ctx.giant), n = runners.filter(id => ctx.flat[id] != null).length; net.x.caught = n;
        if (n === runners.length && !net.team) { net.team = teamIdx(ctx, ctx.giant) || 'A'; net.over = true; }
        if (now >= ctx.dur && !net.team) net.team = teamIdx(ctx, runners[0]) || 'B';
      },
      bot(ctx, b, dt, now, net, H, { posOf, go, live }) {
        if (b.id === ctx.giant) { const runners = ctx.players.filter(id => id !== b.id && ctx.flat[id] == null), nr = near(ctx, [b.x, b.z], runners, posOf);
          if (nr.p) { go(nr.p[0], nr.p[1], SP * GIANT.speed * [0.8, 0.9, 1][b.k]); if (nr.d < GIANT.r * [0.6, 0.8, 0.9][b.k] && now - ctx.lastStomp > GIANT.cool) kinds.gigante.action(ctx, b.id, { stomp: 1, x: b.x, z: b.z }, now, net); }
          b.sc = net.x.caught || 0; return; }
        const g = posOf(ctx.giant); if (!g) return; const d = Math.hypot(b.x - g[0], b.z - g[1]);
        if (d < 4.2 && live) { const ux = (b.x - g[0]) / (d || 1), uz = (b.z - g[1]) / (d || 1); let tx = b.x + ux * 3 - uz * 1.5, tz = b.z + uz * 3 + ux * 1.5; if (Math.hypot(tx, tz) > 6.3) { tx = -uz * 5.5; tz = ux * 5.5; } go(tx, tz, SP * [0.75, 0.88, 1][b.k]); }
        else if (!live && d > 0.5) go(g[0], g[1], SP * 0.5); else b.mv = 0;
      },
      action(ctx, pid, msg, now) { if (msg.stomp && pid === ctx.giant && now - ctx.lastStomp >= GIANT.cool - 100 && now > 2000) { ctx.lastStomp = now; const b = ctx.bots[pid];
        const x = b ? b.x : +msg.x, z = b ? b.z : +msg.z; if (Number.isFinite(x) && Number.isFinite(z)) ctx.stomps.push({ id: Math.round(now), x, z, t: now + GIANT.wind }); } },
      final(ctx, id, net) { return id === ctx.giant ? (net.x.caught || 0) : (ctx.flat[id] ?? ctx.dur); },
      override(ctx, scores, net) { for (const id of ctx.players) scores[id] = id === ctx.giant ? (net.x.caught || 0) : (ctx.flat[id] ?? ctx.dur); },
    },
    // ===== Portero (1 contra 3)
    portero: {
      clamp: () => (x, z) => [clamp(x, -GOAL.w - 0.5, GOAL.w + 0.5), z],
      spawn(i, n) { return i === 0 ? [0, GOAL.z] : [((i - 1) - (n - 2) / 2) * 2, GOAL.shooterZ]; },
      init(ctx, players) { ctx.keeper = ctx.teams ? (ctx.teams.A.length === 1 ? ctx.teams.A[0] : ctx.teams.B[0]) : players[0].id; ctx.shooters = ctx.players.filter(id => id !== ctx.keeper);
        ctx.order = []; for (let r = 0; r < 3; r++) ctx.order.push(...ctx.shooters); ctx.i = 0; ctx.t0 = 2000; ctx.phase = 'aim'; ctx.goalsBy = {}; ctx.saves = 0; ctx.res = null; },
      botInit(ctx, b, pl) { if (pl.id === ctx.keeper) { b.x = 0; b.z = GOAL.z; } },
      step(ctx, dt, now, net, out, H, { posOf }) {
        if (ctx.i >= ctx.order.length) { if (!net.over) { net.over = true; const goals = Object.values(ctx.goalsBy).reduce((a, c) => a + c, 0); net.team = ctx.saves > goals ? (teamIdx(ctx, ctx.keeper) || 'A') : (teamIdx(ctx, ctx.shooters[0]) || 'B'); } }
        else { const shooter = ctx.order[ctx.i];
          if (ctx.phase === 'aim' && now > ctx.t0 + GOAL.aimMs && ctx.tx == null) ctx.tx = (Math.random() * 2 - 1) * GOAL.w * 0.9;
          if (ctx.phase === 'aim' && ctx.tx != null) { ctx.phase = 'fly'; ctx.fly0 = now; }
          if (ctx.phase === 'fly' && now >= ctx.fly0 + GOAL.flyMs) { const k = posOf(ctx.keeper), saved = k && Math.abs(k[0] - ctx.tx) < 0.95;
            if (saved) ctx.saves++; else ctx.goalsBy[shooter] = (ctx.goalsBy[shooter] || 0) + 1; ctx.res = [saved ? 'save' : 'goal', Math.round(now)]; ctx.phase = 'pause'; ctx.p0 = now; }
          if (ctx.phase === 'pause' && now >= ctx.p0 + GOAL.pauseMs) { ctx.i++; ctx.phase = 'aim'; ctx.t0 = now; ctx.tx = null; } }
        net.x.shot = ctx.i < ctx.order.length ? { i: ctx.i, n: ctx.order.length, shooter: ctx.order[ctx.i], phase: ctx.phase, t0: Math.round(ctx.t0), tx: ctx.tx, fly0: Math.round(ctx.fly0 || 0) } : null;
        net.x.res = ctx.res; net.x.saves = ctx.saves; net.x.goalsBy = ctx.goalsBy; net.x.keeper = ctx.keeper;
      },
      bot(ctx, b, dt, now, net, H, { go }) {
        if (b.id === ctx.keeper) { const s = net.x.shot; let tx = 0; if (s && s.phase === 'fly' && now - s.fly0 > [450, 300, 180][b.k]) { if (b.guess !== s.i) { b.guess = s.i; b.gx = s.tx + (Math.random() - 0.5) * [3, 2, 1.2][b.k]; } tx = b.gx; } else if (s && s.phase === 'fly') tx = b.x;
          const ks = SP * GOAL.keeperSpeed * [0.85, 1, 1.1][b.k]; b.x += clamp(tx - b.x, -ks * dt, ks * dt); b.z = GOAL.z; b.ry = 0; b.mv = 1; b.sc = ctx.saves; return; }
        const s = net.x.shot; if (s && s.shooter === b.id && s.phase === 'aim' && ctx.tx == null && now > s.t0 + 800 + Math.random() * 1500) { ctx.tx = clamp(Math.sign(Math.random() - 0.5) * GOAL.w * (0.55 + Math.random() * 0.45) + (Math.random() - 0.5) * [1.5, 0.8, 0.3][b.k], -GOAL.w, GOAL.w); }
        b.ry = Math.PI; b.sc = ctx.goalsBy[b.id] || 0; },
      action(ctx, pid, msg, now) { if (msg.shoot != null && ctx.phase === 'aim' && ctx.order[ctx.i] === pid && ctx.tx == null && now > ctx.t0 + 300) ctx.tx = clamp(+msg.shoot || 0, -GOAL.w, GOAL.w); },
      final(ctx, id) { return id === ctx.keeper ? ctx.saves : (ctx.goalsBy[id] || 0); },
      override(ctx, scores) { for (const id of ctx.players) scores[id] = id === ctx.keeper ? ctx.saves : (ctx.goalsBy[id] || 0); },
    },
    // ===== Escalada de lava
    escalada: {
      spawn(i, n) { const a = i / n * Math.PI * 2; return [Math.cos(a) * 1.8, Math.sin(a) * 1.8]; },
      init(ctx) { ctx.plats = platforms(ctx.seed); },
      botInit(ctx, b) { b.pi = 0; b.hopAt = 1500 + Math.random() * 800; b.best = 0; },
      bot(ctx, b, dt, now, net, H, { finish, live }) {
        const P = ctx.plats; if (now >= b.hopAt && b.pi < P.length - 1) { b.hopAt = now + [1100, 850, 700][b.k] * (0.85 + Math.random() * 0.3);
          if (live || Math.random() < 0.5) b.pi++; else { b.falling = true; } }
        const pl = P[b.pi]; if (b.falling) { b.y -= dt * 7; } else { b.x += (pl.x - b.x) * Math.min(1, dt * 6); b.z += (pl.z - b.z) * Math.min(1, dt * 6); b.y += (pl.y - b.y) * Math.min(1, dt * 6); }
        b.best = Math.max(b.best, b.falling ? b.best : pl.y); b.sc = Math.round(b.best); b.mv = 1;
        if (b.y < lavaY(now)) finish(b, Math.round(b.best)); },
      final(ctx, id) { const b = ctx.bots[id]; return b ? Math.round(b.best) : 0; },
    },
    // ===== Karts
    karts: {
      spawn(i, n) { const p = trackAt(-1.5 - Math.floor(i / 2) * 1.8), side = (i % 2 ? 1 : -1) * 0.8; return [p.x + Math.cos(p.dir) * side, p.z - Math.sin(p.dir) * side]; },
      botInit(ctx, b, pl, i) { b.s = -1.5 - Math.floor(i / 2) * 1.8; b.lane = (i % 2 ? 1 : -1) * 0.8; b.v = 0; },
      bot(ctx, b, dt, now, net, H, { finish }) {
        if (now < 2500) return; const T = TRACK, target = [7, 8.1, 9.1][b.k] * (0.93 + 0.07 * Math.sin(now / 900 + b.speedN * 7));
        b.v += (target - b.v) * Math.min(1, dt * 1.5); const boost = T.boosts.some(f => { const d = ((b.s % T.len) + T.len) % T.len - f * T.len; return d > 0 && d < 1.5; }); b.s += (boost ? b.v * 1.35 : b.v) * dt;
        const p = trackAt(b.s); b.x = p.x + Math.cos(p.dir) * b.lane; b.z = p.z - Math.sin(p.dir) * b.lane; b.ry = p.dir; b.mv = 1; b.sc = Math.floor(Math.max(0, b.s) / T.len) + 1;
        if (b.s >= T.len * T.laps) finish(b, Math.round(now), 3); },
      final(ctx, id) { const b = ctx.bots[id]; return b ? MISS + Math.round((TRACK.len * TRACK.laps - b.s) * 100) : MISS; },
    },
    // ===== Bolos / Ritmo / Encaja (cada uno juega su partida; los bots tienen un puntaje planeado)
    bolos: { spawn(i, n) { return [0, 4.6]; },
      botInit(ctx, b) { b.plan = PLAN(b, [[7, 12], [10, 15], [13, 19]]); b.planAt = ctx.dur * (0.55 + Math.random() * 0.35); },
      bot(ctx, b, dt, now, net, H, { finish }) { b.sc = Math.round(b.plan * Math.min(1, now / b.planAt)); if (now >= b.planAt) finish(b, b.plan, 3); },
      final(ctx, id) { return ctx.bots[id] ? ctx.bots[id].plan : 0; } },
    ritmo: { spawn(i, n) { return [(i - (n - 1) / 2) * 1.6, -2]; },
      botInit(ctx, b) { const max = chart(ctx.seed, ctx.dur).length * 3; b.plan = Math.round(max * [0.45, 0.62, 0.8][b.k] * (0.9 + Math.random() * 0.2)); },
      bot(ctx, b, dt, now) { b.sc = Math.round(b.plan * Math.min(1, now / ctx.dur)); b.mv = 1; },
      final(ctx, id) { return ctx.bots[id] ? ctx.bots[id].plan : 0; } },
    encaja: { spawn(i, n) { return [(i % 3 - 1) * 1.6, 2]; },
      botInit(ctx, b) { b.lives = 3; b.passed = 0; b.walls = walls(ctx.seed, ctx.dur); b.wi = 0; b.lane = 0; },
      bot(ctx, b, dt, now, net, H, { finish }) {
        const w = b.walls[b.wi]; if (!w) return; if (now > w.t + WALL_TRAVEL - [500, 700, 850][b.k]) { if (b.decided !== b.wi) { b.decided = b.wi; b.ok = Math.random() < [0.7, 0.85, 0.95][b.k]; b.lane = b.ok ? w.lane : [-1, 0, 1].filter(l => l !== w.lane)[Math.floor(Math.random() * 2)]; } }
        b.x += ((b.lane || 0) * 1.6 - b.x) * Math.min(1, dt * 10); b.mv = 1; b.ry = Math.PI;
        if (now >= w.t + WALL_TRAVEL) { b.wi++; if (b.ok) b.passed++; else { b.lives--; if (b.lives <= 0) finish(b, b.passed); } }
        b.sc = b.passed; },
      final(ctx, id) { return ctx.bots[id] ? ctx.bots[id].passed : 0; } },
  };

  window.MGX = { cat, meta, kinds, shared: { FUT, VOL, HOUSE, houseCollide, segHitsBox, LIGHT, inLight, GIANT, GOAL, platforms, lavaY, TRACK, trackAt, trackNearest, chart, walls, WALL_TRAVEL, hash } };
})();
