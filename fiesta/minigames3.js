// Minijuegos de decisión y suerte (tanda 3): reglas compartidas. Se carga después de minigames2.js
// y antes de minigames.js. Flujo común: elegir → revelar → puntos. El anfitrión decide los resultados.
(function () {
  'use strict';
  const rngOf = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const ALL = ['ffa', 'team', '1vN', 'duel'];

  // id, nombre, icono, descripción, tipo de juego
  const GAMES = {
    caracoles: { name: 'Carrera de Caracoles', icon: '🐌', desc: 'Elige un caracol. Lluvia, sal y turbos al azar deciden la carrera.', type: 'race', style: 'snail', racers: 5 },
    aerostaticos: { name: 'Globos Aerostáticos', icon: '🎈', desc: 'Elige un globo. El viento cambia y cualquiera puede ganar.', type: 'race', style: 'balloon', racers: 5 },
    patos: { name: 'Patos de Goma', icon: '🦆', desc: 'Elige un pato. El río tiene remolinos que los hacen girar.', type: 'race', style: 'duck', racers: 6 },
    cohetes: { name: 'Cohetes Caprichosos', icon: '🚀', desc: 'Cohetes potentes pero que pueden fallar, o lentos pero seguros. ¿Cuál eliges?', type: 'race', style: 'rocket', racers: 4 },
    tortugas: { name: 'Tortugas Dormilonas', icon: '🐢', desc: 'Elige una tortuga. Cualquiera se puede quedar dormida en plena carrera.', type: 'race', style: 'turtle', racers: 5 },
    puertas: { name: 'Tres Puertas', icon: '🚪', desc: 'Tres rondas: elige una puerta. Puede haber un gran premio… o un susto.', type: 'doors', rounds: 3 },
    cofres: { name: 'Cofres Pirata', icon: '🏴‍☠️', desc: 'Cada uno elige un cofre distinto (el primero que llega se lo queda). Uno tiene el tesoro grande.', type: 'chests' },
    cuerdas: { name: 'Cuerda Misteriosa', icon: '🪢', desc: 'Cada uno tira de una cuerda distinta. A uno le cae un yunque… a los demás, regalos.', type: 'ropes' },
    pescaciega: { name: 'Pesca a Ciegas', icon: '🐠', desc: 'Elige una caña: cada una saca algo sorpresa. Dos rondas.', type: 'fishing', rounds: 2 },
    ruletatesoro: { name: 'La Ruleta del Tesoro', icon: '🎡', desc: 'Apuesta a un color y gira la ruleta. Tres giros.', type: 'roulette', rounds: 3 },
    dados: { name: 'Dado Seguro o Dado Loco', icon: '🎲', desc: 'Cada ronda elige: dado seguro (3 o 4) o dado loco (0 a 10). Gana quien sume más.', type: 'dice', rounds: 3 },
    boton: { name: 'Botón Peligroso', icon: '🔴', desc: 'Por turnos aprieten un botón. Uno de ellos hace ¡BUM! No seas tú.', type: 'button' },
    puente: { name: 'Puente de Tablas', icon: '🌉', desc: 'Por turnos crucen el puente eligiendo izquierda o derecha. Algunas tablas se rompen.', type: 'bridge' },
    cartas: { name: 'Más Alto o Más Bajo', icon: '🃏', desc: '¿La próxima carta será más alta o más baja? 5 rondas.', type: 'cards', rounds: 5 },
    ppt: { name: 'Piedra, Papel o Tijera Gigante', icon: '✊', desc: 'Todos eligen a la vez y se enfrentan con todos. 3 rondas.', type: 'rps', rounds: 3 },
    plinko: { name: 'Plinko', icon: '🟣', desc: 'Elige desde dónde soltar tu canica. Rebota y cae en un premio. 2 tiradas.', type: 'plinko', rounds: 2 },
  };
  const DUR = { race: 30, doors: 36, chests: 22, ropes: 22, fishing: 28, roulette: 36, dice: 32, button: 60, bridge: 60, cards: 45, rps: 32, plinko: 34 };
  const cat = Object.entries(GAMES).map(([id, g]) => [id, 'decision', g.name, g.icon, g.desc, DUR[g.type], { game: id }, ALL]);
  const meta = { decision: ['pts'] };
  const PICK_MS = { race: 7000, doors: 6000, chests: 7000, ropes: 7000, fishing: 6000, roulette: 6000, dice: 5500, cards: 5500, rps: 5000, plinko: 6000, button: 5000, bridge: 5000 };
  const REVEAL_MS = { race: 13000, doors: 3500, chests: 5000, ropes: 5000, fishing: 4000, roulette: 5500, dice: 3500, cards: 3000, rps: 3500, plinko: 5500, button: 2500, bridge: 2200 };

  // ---------- Carreras deterministas (mismo resultado en todos los celulares)
  const RACE = { len: 30, step: 50 };
  function raceSim(seed, n, style) {
    const r = rngOf(seed ^ 0x2468), pos = new Array(n).fill(0), frames = [], ev = [], done = [], state = Array.from({ length: n }, (_, i) => ({ sleep: 0, boom: false, base: style === 'rocket' ? [1.9, 1.6, 1.3, 1.05][i % 4] : 1 }));
    for (let f = 0; f < 600 && done.length < n; f++) {
      const t = f * RACE.step;
      for (let i = 0; i < n; i++) { if (done.includes(i)) continue; const s = state[i]; let v = (style === 'snail' ? 1.6 : style === 'turtle' ? 2.1 : style === 'duck' ? 2.3 : style === 'balloon' ? 2.2 : 2.6) * s.base * (0.75 + r() * 0.5);
        if (s.sleep > 0) { s.sleep -= RACE.step; v = 0; }
        else if (style === 'turtle' && r() < 0.012) { s.sleep = 1500 + r() * 2500; ev.push([t, i, '💤']); }
        else if (style === 'snail' && r() < 0.01) { const salt = r() < 0.4; s.sleep = salt ? 1400 : 0; if (!salt) s.boostT = t + 1200; ev.push([t, i, salt ? '🧂' : '⚡']); }
        else if (style === 'duck' && r() < 0.012) { s.back = 1.5 + r() * 2; ev.push([t, i, '🌀']); }
        else if (style === 'balloon' && r() < 0.015) { s.gust = (r() < 0.5 ? -1 : 1) * (1 + r()); s.gustT = t + 1200; ev.push([t, i, s.gust > 0 ? '💨' : '🌬️']); }
        else if (style === 'rocket' && !s.boom && r() < [0.006, 0.0045, 0.002, 0.0005][i % 4]) { s.boom = true; s.sleep = 2400; pos[i] = Math.max(0, pos[i] - 6); ev.push([t, i, '💥']); }
        if (s.boostT && t < s.boostT) v *= 2.2;
        if (s.gustT && t < s.gustT) v *= 1 + s.gust * 0.6;
        if (s.back) { pos[i] = Math.max(0, pos[i] - 0.2); s.back -= 0.2; if (s.back <= 0) s.back = 0; v = 0; }
        pos[i] = Math.min(RACE.len, pos[i] + v * RACE.step / 1000);
        if (pos[i] >= RACE.len) done.push(i); }
      frames.push(pos.map(p => +p.toFixed(2)));
    }
    for (let i = 0; i < n; i++) if (!done.includes(i)) done.push(i);
    return { frames, order: done, ev };
  }
  // ---------- Plinko determinista
  const PLINKO = { cols: 7, rows: 8, slots: [1, 3, 0, 8, 0, 3, 1, 5].slice(0, 8) };
  function plinkoPath(seed, col) { const r = rngOf(seed); let x = col; const path = [x];
    for (let row = 0; row < PLINKO.rows; row++) { x += r() < 0.5 ? -0.5 : 0.5; x = Math.max(0, Math.min(PLINKO.cols, x)); path.push(x); }
    return { path, slot: Math.max(0, Math.min(PLINKO.cols, Math.round(x))) }; }
  const PLINKO_VALUES = [1, 3, 0, 8, 5, 0, 3, 1];

  // ---------- Opciones de cada ronda
  function optionsFor(d, ctx, r) {
    const n = ctx.players.length, g = GAMES[d.game];
    switch (g.type) {
      case 'race': return Array.from({ length: g.racers }, (_, i) => i);
      case 'doors': return [0, 1, 2];
      case 'chests': case 'ropes': return Array.from({ length: Math.max(3, n + (g.type === 'chests' ? 1 : 0)) }, (_, i) => i);
      case 'fishing': return [0, 1, 2, 3, 4, 5];
      case 'roulette': return [0, 1, 2, 3];
      case 'dice': return [0, 1];
      case 'button': return d.buttons.map((b, i) => i).filter(i => !d.pressed.includes(i));
      case 'bridge': return [0, 1];
      case 'cards': return [0, 1];
      case 'rps': return [0, 1, 2];
      case 'plinko': return Array.from({ length: PLINKO.cols + 1 }, (_, i) => i);
    }
    return [0, 1];
  }
  const unique = type => type === 'chests' || type === 'ropes';
  const turnBased = type => type === 'button' || type === 'bridge';

  // ---------- Resolver una ronda (anfitrión)
  function resolve(d, ctx, r) {
    const g = GAMES[d.game], ids = ctx.players, picks = d.picks, gain = {}; ids.forEach(id => gain[id] = 0);
    const res = { gain };
    switch (g.type) {
      case 'race': { const sim = raceSim(ctx.seed + d.round, g.racers, g.style); res.order = sim.order; const pts = [5, 3, 1];
        ids.forEach(id => { const k = sim.order.indexOf(picks[id]); if (k >= 0 && k < 3) gain[id] = pts[k]; }); break; }
      case 'doors': { const prizes = [6, 2, -2].sort(() => r() - 0.5); res.prizes = prizes; ids.forEach(id => gain[id] = picks[id] != null ? prizes[picks[id]] : 0); break; }
      case 'chests': { const n = d.opts.length, prizes = Array.from({ length: n }, () => Math.floor(r() * 3)); prizes[Math.floor(r() * n)] = 10; let bad = Math.floor(r() * n); if (prizes[bad] === 10) bad = (bad + 1) % n; prizes[bad] = -3;
        res.prizes = prizes; ids.forEach(id => gain[id] = picks[id] != null ? prizes[picks[id]] : 0); break; }
      case 'ropes': { const n = d.opts.length, prizes = Array.from({ length: n }, () => 2 + Math.floor(r() * 5)); prizes[Math.floor(r() * n)] = -4; res.prizes = prizes; ids.forEach(id => gain[id] = picks[id] != null ? prizes[picks[id]] : 0); break; }
      case 'fishing': { const catches = [0, 1, 2, 3, 5, 8], prizes = d.opts.map(() => catches[Math.floor(r() * catches.length)]); res.prizes = prizes; ids.forEach(id => gain[id] = picks[id] != null ? prizes[picks[id]] : 0); break; }
      case 'roulette': { const land = Math.floor(r() * 4); res.land = land; res.spin = 4 + r() * 2; ids.forEach(id => gain[id] = picks[id] === land ? 4 : 0); break; }
      case 'dice': { res.rolls = {}; ids.forEach(id => { const v = picks[id] === 1 ? Math.floor(r() * 11) : 3 + Math.floor(r() * 2); res.rolls[id] = v; gain[id] = v; }); break; }
      case 'cards': { const next = 1 + Math.floor(r() * 13); res.from = d.card; res.next = next; ids.forEach(id => { const up = picks[id] === 1; gain[id] = next === d.card ? 1 : (up === (next > d.card)) ? 2 : 0; }); d.card = next; break; }
      case 'rps': { const beats = (a, b) => (a === 0 && b === 2) || (a === 1 && b === 0) || (a === 2 && b === 1);
        ids.forEach(a => { if (picks[a] == null) return; ids.forEach(b => { if (a === b || picks[b] == null) return; if (beats(picks[a], picks[b])) gain[a] += 2; else if (picks[a] === picks[b]) gain[a] += 0; }); }); break; }
      case 'plinko': { res.paths = {}; ids.forEach((id, k) => { const p = plinkoPath(ctx.seed * 31 + d.round * 7 + k, picks[id] ?? 3); res.paths[id] = p.path; gain[id] = PLINKO_VALUES[p.slot] || 0; }); break; }
      case 'button': { const id = d.turn, b = picks[id]; res.who = id; res.btn = b; d.pressed.push(b); if (d.buttons[b]) { res.boom = true; d.out[id] = true; ids.forEach(o => { if (!d.out[o]) gain[o] = 3; }); } break; }
      case 'bridge': { const id = d.turn, side = picks[id], row = d.walker[id] || 0; res.who = id; res.row = row; res.side = side;
        const safe = d.safe[row]; d.known[row] = d.known[row] || {}; d.known[row][side] = side === safe ? 'ok' : 'roto';
        if (side === safe) { d.walker[id] = row + 1; gain[id] = 1; res.ok = true; if (d.walker[id] >= d.safe.length) { d.finished[id] = true; gain[id] += 4; res.cross = true; } } else { d.out[id] = true; res.ok = false; } break; }
    }
    return res;
  }

  // ---------- Motor común
  const kind = {
    spawn(i, n) { return [(i - (n - 1) / 2) * 1.6, 3.2]; },
    init(ctx, players, r) {
      const g = GAMES[ctx.p.game], d = { game: ctx.p.game, type: g.type, round: 0, rounds: g.rounds || 1, picks: {}, score: {}, results: [], phase: 'pick', pickMs: PICK_MS[g.type], revealMs: REVEAL_MS[g.type] };
      ctx.players.forEach(id => d.score[id] = 0);
      if (g.type === 'button') { d.buttons = new Array(Math.max(6, ctx.players.length * 2 + 2)).fill(false); d.buttons[Math.floor(r() * d.buttons.length)] = true; d.pressed = []; d.out = {}; d.order = ctx.players.slice().sort(() => r() - 0.5); d.ti = 0; d.turn = d.order[0]; d.rounds = 99; }
      if (g.type === 'bridge') { d.safe = Array.from({ length: 6 }, () => r() < 0.5 ? 0 : 1); d.known = {}; d.walker = {}; d.out = {}; d.finished = {}; d.order = ctx.players.slice().sort(() => r() - 0.5); d.ti = 0; d.turn = d.order[0]; d.rounds = 99; }
      if (g.type === 'cards') d.card = 3 + Math.floor(r() * 9);
      d.opts = optionsFor(d, ctx, r); d.phaseEnd = 1500 + d.pickMs; ctx.d = d; ctx.dr = r;
    },
    botInit(ctx, b) { b.pickAt = null; },
    step(ctx, dt, now, net, out, H) {
      const d = ctx.d, g = GAMES[d.game], r = ctx.dr;
      if (d.phase === 'pick') {
        const need = turnBased(g.type) ? [d.turn] : ctx.players;
        if (now >= d.phaseEnd || need.every(id => d.picks[id] != null)) {
          need.forEach(id => { if (d.picks[id] == null) { const free = d.opts.filter(o => !unique(g.type) || !Object.values(d.picks).includes(o)); d.picks[id] = free.length ? pick(r, free) : pick(r, d.opts); } });
          const res = resolve(d, ctx, r); res.round = d.round; res.picks = { ...d.picks }; d.results.push(res);
          Object.entries(res.gain).forEach(([id, v]) => d.score[id] = (d.score[id] || 0) + v);
          d.phase = 'reveal'; d.phaseEnd = now + d.revealMs; d.revealAt = Math.round(now);
        }
      } else if (d.phase === 'reveal' && now >= d.phaseEnd) {
        d.round++; d.picks = {};
        let over = d.round >= d.rounds;
        if (turnBased(g.type)) { const alive = d.order.filter(id => !d.out[id] && !(d.finished && d.finished[id]));
          if (g.type === 'button' && (Object.keys(d.out).length > 0 || alive.length === 0)) over = true;
          if (g.type === 'bridge' && alive.length === 0) over = true;
          if (!over) { do { d.ti = (d.ti + 1) % d.order.length; } while (d.out[d.order[d.ti]] || (d.finished && d.finished[d.order[d.ti]])); d.turn = d.order[d.ti]; } }
        if (over || now > ctx.dur - 1500) { d.phase = 'end'; net.over = true; }
        else { d.phase = 'pick'; d.opts = optionsFor(d, ctx, r); d.phaseEnd = now + d.pickMs; }
      }
      // estado visible (durante la elección no se ven las elecciones ajenas, salvo en las que son únicas)
      net.x.d = { game: d.game, type: d.type, round: d.round, rounds: d.rounds, phase: d.phase, phaseEnd: Math.round(d.phaseEnd), opts: d.opts, score: d.score, turn: d.turn || null,
        picks: d.phase === 'pick' && !unique(g.type) ? Object.fromEntries(Object.keys(d.picks).map(id => [id, -1])) : d.picks, last: d.results[d.results.length - 1] || null, revealAt: d.revealAt || 0,
        card: d.card, known: d.known, walker: d.walker, out: d.out, finished: d.finished, pressed: d.pressed, nButtons: d.buttons ? d.buttons.length : 0 };
      net.counts = d.score;
    },
    bot(ctx, b, dt, now, net) {
      const d = ctx.d, g = GAMES[d.game]; b.sc = d.score[b.id] || 0; b.mv = 0;
      if (d.phase !== 'pick' || d.picks[b.id] != null) return; if (turnBased(g.type) && d.turn !== b.id) return;
      if (b.pickAt == null || b.pickRound !== d.round) { b.pickRound = d.round; b.pickAt = now + 900 + Math.random() * Math.min(3500, d.pickMs - 1200); }
      if (now < b.pickAt) return;
      let choice; const free = d.opts.filter(o => !unique(g.type) || !Object.values(d.picks).includes(o));
      if (g.type === 'cards') choice = d.card <= 7 ? (Math.random() < [0.6, 0.8, 0.95][b.k] ? 1 : 0) : (Math.random() < [0.6, 0.8, 0.95][b.k] ? 0 : 1);
      else if (g.type === 'dice') choice = Math.random() < [0.5, 0.4, 0.3][b.k] ? 1 : 0;
      else if (g.type === 'bridge') { const row = d.walker[b.id] || 0, kn = d.known[row] || {}; choice = kn[0] === 'ok' ? 0 : kn[1] === 'ok' ? 1 : kn[0] === 'roto' ? 1 : kn[1] === 'roto' ? 0 : (Math.random() < 0.5 ? 0 : 1); }
      else choice = free.length ? free[Math.floor(Math.random() * free.length)] : d.opts[0];
      d.picks[b.id] = choice;
    },
    action(ctx, pid, msg) { const d = ctx.d, g = GAMES[d.game]; if (msg.pick == null || d.phase !== 'pick' || d.picks[pid] != null) return; if (turnBased(g.type) && d.turn !== pid) return;
      const c = +msg.pick; if (!d.opts.includes(c)) return; if (unique(g.type) && Object.values(d.picks).includes(c)) return; d.picks[pid] = c; },
    final(ctx, id) { return ctx.d.score[id] || 0; },
    override(ctx, scores) { for (const id of ctx.players) scores[id] = ctx.d.score[id] || 0; },
  };

  const X = window.MGX; X.cat.push(...cat); Object.assign(X.meta, meta); X.kinds.decision = kind;
  Object.assign(X.shared, { GAMES, RACE, raceSim, PLINKO, PLINKO_VALUES, plinkoPath, PICK_MS, REVEAL_MS });
})();
