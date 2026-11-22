// Catálogo de minijuegos + lógica compartida (sin gráficos).
// window.MGCAT: lista de minijuegos. window.MGL: reglas, cronogramas y bots (los corre el anfitrión).
(function () {
  'use strict';
  const rngOf = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const hashStr = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const SPEED = 4.6, MISS = 100000;

  /* ======================= Catálogo ======================= */
  const ALL = ['ffa', 'team', '1vN', 'duel'];
  // [id, mecánica, nombre, icono, descripción, duración(s), parámetros, formatos]
  const C = [
    // --- Piso que se cae
    ['piso', 'piso', 'Piso Traicionero', '🟨', 'Las baldosas parpadean en rojo y caen a la lava. ¡Muévete y aguanta!', 30, { order: 'random', scene: 'lava' }],
    ['filas', 'piso', 'Baldosas en Fila', '🧱', 'Las filas caen desde los bordes hacia el centro. ¡No te quedes en la orilla!', 30, { order: 'rows', scene: 'space' }],
    ['encoge', 'piso', 'Isla que se Encoge', '🏝️', 'La isla se hunde desde afuera hacia adentro. ¡Busca el centro!', 30, { order: 'ring', scene: 'beach' }],
    ['espiral', 'piso', 'Espiral Mortal', '🌀', 'Las baldosas caen en espiral. Adivina por dónde sigue.', 30, { order: 'spiral', scene: 'night' }],
    ['ajedrez', 'piso', 'Ajedrez Caliente', '♟️', 'Primero caen las baldosas de un color y luego las del otro.', 30, { order: 'checker', scene: 'lava' }],
    ['hielo', 'piso', 'Hielo Quebradizo', '🧊', 'El hielo se rompe… ¡y además resbala!', 30, { order: 'random', ice: true, scene: 'ice' }],
    // --- Recolectar
    ['monedas', 'monedas', 'Lluvia de Monedas', '🪙', 'Caen monedas del cielo. Las grandes valen 3. ¡Cuidado con las bombas!', 25, { item: 'coin', scene: 'grass' }],
    ['frutas', 'monedas', 'Frutas al Vuelo', '🍎', 'Atrapa las frutas que caen de los árboles. Las sandías valen 3.', 25, { item: 'fruit', bomb: 0.1, scene: 'grass' }],
    ['gemas', 'monedas', 'Cosecha de Gemas', '💎', 'Gemas brillantes caen en la cueva. Las grandes valen 3.', 25, { item: 'gem', rate: 1.3, scene: 'night' }],
    ['estrellas', 'monedas', 'Estrellas Fugaces', '⭐', 'Las estrellas duran muy poco en el suelo. ¡Sé rápido!', 25, { item: 'star', life: 1800, rate: 0.8, scene: 'space' }],
    ['tormenta', 'monedas', 'Tormenta de Bombas', '💣', 'Muchas monedas… y muchísimas bombas.', 25, { item: 'coin', bomb: 0.38, rate: 0.75, scene: 'lava' }],
    ['patinaje', 'monedas', 'Monedas en el Hielo', '⛸️', 'Recoge monedas sobre hielo resbaloso.', 25, { item: 'coin', ice: true, scene: 'ice' }],
    // --- Saltar la barra
    ['barra', 'barra', 'Salta la Barra', '🌀', 'Una barra gira cada vez más rápido: toca SALTA justo cuando pase.', 30, {}],
    ['helice', 'barra', 'Doble Hélice', '🚁', 'Dos barras desde el principio. ¡Mucho ritmo!', 30, { bars: 2, speed: 0.8 }],
    ['tornado', 'barra', 'Tornado', '🌪️', 'La barra arranca rapidísimo.', 25, { speed: 1.4 }],
    ['lunar', 'barra', 'Barra Lunar', '🌙', 'Gravedad baja: saltas alto y lento. Calcula bien.', 30, { lowG: true, speed: 1.1, scene: 'space' }],
    ['traviesa', 'barra', 'Barra Traviesa', '🔁', 'La barra cambia de dirección sin avisar.', 30, { zigzag: true }],
    // --- Esquivar lo que rueda
    ['avalancha', 'bolas', 'Avalancha', '⛄', 'Bolas de nieve gigantes ruedan hacia ti. ¡Esquívalas!', 30, { obj: 'snow', scene: 'ice' }],
    ['barriles', 'bolas', 'Barriles Locos', '🛢️', 'Barriles rodando cada vez más rápido.', 30, { obj: 'barrel', rate: 1.2, scene: 'grass' }],
    ['troncos', 'bolas', 'Troncos Rodantes', '🪵', 'Troncos largos: ¡salta por encima con SALTA!', 30, { obj: 'log', jump: true, scene: 'grass' }],
    ['rocas', 'bolas', 'Rocas del Volcán', '🪨', 'Rocas enormes bajan por la ladera.', 30, { obj: 'rock', big: true, scene: 'lava' }],
    ['lateral', 'bolas', 'Ataque Lateral', '↔️', 'Las bolas vienen de los costados.', 30, { obj: 'snow', side: true, scene: 'candy' }],
    // --- Cosas que caen del cielo
    ['meteoros', 'meteoros', 'Lluvia de Meteoritos', '☄️', 'Mira las sombras y apártate. Tienes 3 vidas.', 30, { scene: 'space' }],
    ['yunques', 'meteoros', 'Yunques', '⚒️', 'Caen yunques pesados. Pocas sombras, pero grandes.', 30, { big: true, scene: 'grass' }],
    ['granizo', 'meteoros', 'Granizo Gigante', '🌨️', 'Granizo rápido y por todos lados.', 30, { fast: true, scene: 'ice' }],
    // --- Carreras tocando
    ['carrera', 'carrera', 'Carrera Loca', '🏁', 'Toca IZQ y DER alternando. ¡Primero a la meta gana!', 18, { mode: 'alt' }],
    ['natacion', 'carrera', 'Natación', '🏊', 'Brazada izquierda, brazada derecha… ¡hasta la otra orilla!', 20, { mode: 'alt', look: 'water', len: 34 }],
    ['cohete', 'carrera', 'Cohete Turbo', '🚀', 'Toca el botón lo más rápido que puedas.', 15, { mode: 'mash', look: 'space' }],
    ['semaforo', 'carrera', 'Semáforo', '🚦', 'Avanza solo con luz verde. Si tocas en rojo, te devuelven atrás.', 22, { mode: 'light', len: 32 }],
    ['sacos', 'carrera', 'Carrera de Sacos', '🥔', 'Alterna IZQ y DER, pero si te equivocas te caes.', 20, { mode: 'alt', strict: true, len: 32 }],
    // --- Persecuciones
    ['cazador', 'cazador', 'El Cazador', '🎯', 'Uno caza y los demás huyen. Si atrapa a todos, gana el cazador.', 30, {}, ['1vN']],
    ['lobo', 'cazador', 'Lobo y Ovejas', '🐺', 'El lobo es más rápido, pero se cansa cada vez que atrapa a alguien.', 30, { fast: true }, ['1vN']],
    ['zombis', 'zombi', 'Zombis', '🧟', 'Uno empieza como zombi. A quien toca, se convierte. ¡Sé el último!', 30, {}, ['ffa']],
    ['papa', 'papa', 'Papa Caliente', '🥔', 'Si tienes la bomba, ¡pásala tocando a otro antes de que explote!', 30, {}, ['ffa', 'duel']],
    ['petardo', 'papa', 'Petardo Rebotón', '🧨', 'La bomba explota más seguido. ¡No la sueltes tarde!', 25, { fast: true }, ['ffa', 'duel']],
    // --- Pintar
    ['pintar', 'pintar', 'Pinta el Piso', '🎨', 'Camina para pintar el piso de tu color. Gana quien pinte más.', 25, {}],
    ['guerra', 'pintar', 'Guerra de Colores', '🖌️', 'Brocha grande y poco tiempo.', 20, { brush: 1 }],
    ['nieve', 'pintar', 'Huellas en la Nieve', '👣', 'Deja tus huellas en la nieve resbalosa.', 25, { ice: true, scene: 'ice' }],
    // --- Tocar objetivos
    ['globos', 'tiro', 'Revienta Globos', '🎈', 'Toca los globos para reventarlos. El primero que toca se lo lleva.', 20, { target: 'globo' }],
    ['topos', 'tiro', 'Martillazo', '🔨', 'Golpea a los topos que asoman. Los dorados valen 3.', 20, { target: 'topo' }],
    ['patos', 'tiro', 'Tiro al Pato', '🦆', 'Los patos cruzan rápido. ¡Toca para atraparlos!', 20, { target: 'pato', move: 1 }],
    ['burbujas', 'tiro', 'Burbujas', '🫧', 'Las burbujas suben. Revienta todas las que puedas.', 20, { target: 'burbuja', move: 1 }],
    ['nobomba', 'tiro', 'No Toques la Bomba', '💥', 'Toca los globos, pero si tocas una bomba pierdes 3.', 20, { target: 'globo', bad: 0.35 }],
    ['luciernagas', 'tiro', 'Luciérnagas', '✨', 'De noche, pequeñas y rápidas.', 20, { target: 'luz', move: 1, small: true }],
    // --- Memoria
    ['simon', 'memoria', 'Simón Dice', '🟢', 'Mira la secuencia de colores y repítela. Cada ronda es más larga.', 40, {}],
    ['simonrapido', 'memoria', 'Simón Veloz', '⚡', 'La secuencia se muestra muy rápido.', 40, { fast: true }],
    ['simon6', 'memoria', 'Memoria de Seis', '🔷', 'Seis colores en vez de cuatro.', 45, { pads: 6 }],
    // --- Reflejos
    ['desenfunda', 'reflejo', 'Desenfunda', '🤠', 'Toca apenas aparezca "¡YA!". Si tocas antes, te penalizan. 3 rondas.', 20, {}],
    ['falso', 'reflejo', 'Señal Falsa', '🟡', 'A veces aparece una señal falsa amarilla. ¡No caigas!', 22, { fake: true }],
    ['mosca', 'reflejo', 'Atrapa la Mosca', '🪰', 'Toca cuando la mosca se pose. 3 rondas.', 22, { fly: true }],
    // --- En equipo
    ['cuerda', 'cuerda', 'Tira la Cuerda', '🪢', 'Toca sin parar para tirar de la cuerda hacia tu lado.', 15, {}, ['team', '1vN', 'duel']],
    ['carrito', 'cuerda', 'Empuja el Carrito', '🛒', 'Empujen el carrito hasta el lado contrario.', 15, { look: 'cart' }, ['team', '1vN', 'duel']],
    ['remo', 'cuerda', 'Remo en Equipo', '🚣', 'Remen tocando sin parar. El primer bote en llegar gana.', 15, { look: 'boat' }, ['team', '1vN', 'duel']],
    // --- Torre
    ['torre', 'torre', 'Torre Alta', '🏗️', 'El bloque se mueve: toca para soltarlo. Lo que sobresale se cae.', 35, {}],
    ['pasteles', 'torre', 'Torre de Pasteles', '🎂', 'Apila pisos de pastel lo más alto posible.', 35, { look: 'cake' }],
    ['torrerapida', 'torre', 'Torre Rápida', '⏩', 'El bloque se mueve cada vez más rápido.', 30, { fast: true }],
    // --- Corredor
    ['selva', 'corredor', 'Corredor de la Selva', '🌴', 'Corres solo: toca IZQ/DER para cambiar de carril. Junta monedas y esquiva.', 25, { scene: 'grass' }],
    ['tunel', 'corredor', 'Túnel de Hielo', '❄️', 'Igual, pero más rápido y resbaloso.', 25, { fast: true, scene: 'ice' }],
    ['vagoneta', 'corredor', 'Vagoneta Minera', '⛏️', 'Viajas en una vagoneta por la mina. ¡Cuidado con las rocas!', 25, { scene: 'night' }],
    // --- Laberinto
    ['laberinto', 'laberinto', 'Laberinto', '🌀', 'Encuentra la salida antes que nadie.', 35, {}],
    ['oscuro', 'laberinto', 'Laberinto Oscuro', '🔦', 'Solo ves cerca de ti.', 40, { dark: true }],
    ['setos', 'laberinto', 'Laberinto de Setos', '🌳', 'Un laberinto más grande.', 45, { big: true }],
    // --- Zona
    ['colina', 'colina', 'Rey de la Colina', '👑', 'Quédate dentro del círculo que se mueve. Suma tiempo adentro.', 25, {}],
    ['foco', 'colina', 'Foco de Luz', '🔦', 'De noche: sigue la luz que se mueve rápido.', 25, { fast: true, scene: 'night' }],
    ['achica', 'colina', 'Círculo que se Achica', '⭕', 'El círculo se hace cada vez más chico.', 25, { shrink: true }],
    // --- Contar
    ['pollitos', 'contar', '¿Cuántos Pollitos?', '🐥', 'Cuenta cuántos pollitos amarillos pasan. ¡Ojo con los patos!', 25, { what: 'pollito' }],
    ['ovejas', 'contar', 'Cuenta Ovejas', '🐑', 'Cuenta las ovejas blancas. Las negras no cuentan.', 25, { what: 'oveja' }],
    ['cuentamonedas', 'contar', 'Cuenta Monedas', '🪙', 'Cuenta las monedas doradas que caen.', 25, { what: 'moneda' }],
    // --- Vasos
    ['vasos', 'vasos', 'Vasos Locos', '🥤', 'Sigue el vaso que tiene la moneda. 3 rondas.', 30, {}],
    ['cofres', 'vasos', 'Cofres Pirata', '🏴‍☠️', 'Sigue el cofre con el tesoro. Cada vez más rápido.', 30, { fast: true }],
    // --- Precisión
    ['ruleta', 'ruleta', 'Ruleta Exacta', '🎯', 'Detén la aguja en la zona dorada. 3 intentos.', 25, { mode: 'ruleta' }],
    ['tren', 'ruleta', 'Frena el Tren', '🚂', 'Frena el tren lo más cerca posible de la raya. 3 intentos.', 25, { mode: 'tren' }],
    ['reloj', 'ruleta', 'Reloj Ciego', '⏱️', 'Detén el reloj en 5.00 s. Se oculta a los 2 s. 3 intentos.', 30, { mode: 'reloj' }],
    // --- Pesca
    ['pesca', 'pesca', 'Pesca Rápida', '🎣', 'Cuando el corcho se hunda, ¡toca! Si tocas antes, se espanta el pez.', 25, {}],
    ['pescahielo', 'pesca', 'Pesca en el Hielo', '🐟', 'Los peces pican menos, pero valen más.', 25, { ice: true }],
    // --- Uno contra todos
    ['canon', 'canon', 'Cañonero', '💣', 'El solitario dispara bolas tocando el piso. Los demás esquivan.', 30, {}, ['1vN']],
    ['yunquero', 'canon', 'Lluvia de Yunques', '⚒️', 'El solitario tira yunques enormes, pero más lentos.', 30, { big: true }, ['1vN']],
  ];
  const KIND_META = { // menor-es-mejor y formato del puntaje
    piso: ['surv'], barra: ['surv'], bolas: ['surv'], meteoros: ['surv'], cazador: ['tag'], zombi: ['surv'], papa: ['surv'], canon: ['tag'],
    monedas: ['count', 'monedas'], pintar: ['count', 'casillas'], tiro: ['count', 'puntos'], memoria: ['count', 'rondas'], torre: ['count', 'pisos'],
    corredor: ['count', 'monedas'], colina: ['secs'], vasos: ['count', 'aciertos'], pesca: ['count', 'puntos'], cuerda: ['count', 'toques'],
    carrera: ['time'], laberinto: ['time'], reflejo: ['ms'], contar: ['err'], ruleta: ['err'],
  };
  const MGCAT = C.map(([id, kind, name, icon, desc, dur, p, formats]) => ({ id, kind, name, icon, desc, dur: dur * 1000, p: p || {}, formats: formats || ALL,
    lower: ['time', 'ms', 'err'].includes(KIND_META[kind][0]), fmt: KIND_META[kind][0], unit: KIND_META[kind][1] }));
  const BYID = Object.fromEntries(MGCAT.map(m => [m.id, m]));
  function fmtScore(id, v) {
    const m = BYID[id]; if (!m) return String(v); if (v === null || v === undefined) return 'sin resultado';
    switch (m.fmt) {
      case 'surv': return v >= m.dur ? '💪 ¡aguantó hasta el final!' : 'aguantó ' + (v / 1000).toFixed(1) + ' s';
      case 'tag': return v < 1000 ? '🎯 atrapó a ' + v : v >= m.dur ? '💪 ¡no lo atraparon!' : 'aguantó ' + (v / 1000).toFixed(1) + ' s';
      case 'count': return v + ' ' + m.unit;
      case 'secs': return (v / 1000).toFixed(1) + ' s dentro';
      case 'time': return v < MISS ? '🏁 ' + (v / 1000).toFixed(2) + ' s' : 'no llegó';
      case 'ms': return v >= 9000 ? '❌ falló' : v + ' ms';
      case 'err': return v === 0 ? '🎯 ¡exacto!' : 'error: ' + v;
    }
    return String(v);
  }

  /* ======================= Reglas por mecánica ======================= */
  const BOT_K = { facil: 0, normal: 1, dificil: 2 };
  const pickK = (b, arr) => arr[b.k];
  const between = (r, [a, c]) => a + r() * (c - a);
  function moveTo(b, tx, tz, sp, dt) { const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d > 0.08) { const m = Math.min(d, sp * dt); b.x += dx / d * m; b.z += dz / d * m; b.ry = Math.atan2(dx, dz); b.mv = 1; } else b.mv = 0; }
  const clampCircle = (R, inner = 0) => (x, z) => { const d = Math.hypot(x, z) || 0.0001; const c = Math.max(inner, Math.min(R, d)); return [x / d * c, z / d * c]; };
  const clampRect = (w, z0, z1) => (x, z) => [Math.max(-w, Math.min(w, x)), Math.max(z0, Math.min(z1, z))];

  // ---------- Piso
  const PISO = { n: 8, size: 1.5, half: 6 };
  function pisoSchedule(seed, dur, p) {
    const r = rngOf(seed), n = PISO.n, all = [...Array(n * n).keys()], cx = c => c % n, cz = c => Math.floor(c / n);
    let order;
    if (p.order === 'rows') { order = []; for (let k = 0; k < n / 2; k++) { const rows = shuffle([k, n - 1 - k], r); rows.forEach(row => order.push(...shuffle(all.filter(c => cz(c) === row), r))); } }
    else if (p.order === 'ring') { const ring = c => Math.max(Math.abs(cx(c) - 3.5), Math.abs(cz(c) - 3.5)); order = shuffle(all.slice(), r).sort((a, b) => ring(b) - ring(a)); }
    else if (p.order === 'spiral') { order = []; let x0 = 0, y0 = 0, x1 = n - 1, y1 = n - 1;
      while (x0 <= x1 && y0 <= y1) { for (let x = x0; x <= x1; x++) order.push(y0 * n + x); for (let y = y0 + 1; y <= y1; y++) order.push(y * n + x1);
        if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) order.push(y1 * n + x); if (x1 > x0) for (let y = y1 - 1; y > y0; y--) order.push(y * n + x0); x0++; y0++; x1--; y1--; }
      const rot = Math.floor(r() * 4) * 7; order = order.slice(rot).concat(order.slice(0, rot)).filter((v, i, a) => a.indexOf(v) === i); }
    else if (p.order === 'checker') { const par = Math.floor(r() * 2); order = shuffle(all.filter(c => (cx(c) + cz(c)) % 2 === par), r).concat(shuffle(all.filter(c => (cx(c) + cz(c)) % 2 !== par), r)); }
    else order = shuffle(all, r);
    const keep = 6, ev = []; let t = 2200, gap = 2600 / (p.speed || 1), k = p.order === 'rows' ? 8 : p.order === 'spiral' ? 4 : 3, idx = 0;
    while (t < dur - 1800 && idx < order.length - keep) {
      const batch = order.slice(idx, idx + Math.min(k, order.length - keep - idx)); idx += batch.length;
      ev.push({ warn: t, fall: t + 1150, cells: batch }); t += gap; gap = Math.max(1150, gap * 0.9);
      if (p.order !== 'rows' && p.order !== 'spiral' && ev.length % 2) k = Math.min(7, k + 1);
    }
    const byCell = {}; ev.forEach(e => e.cells.forEach(c => byCell[c] = e)); return { ev, byCell };
  }
  const pisoCellAt = (x, z) => { const cx = Math.floor((x + PISO.half) / PISO.size), cz = Math.floor((z + PISO.half) / PISO.size); return (cx < 0 || cz < 0 || cx >= PISO.n || cz >= PISO.n) ? -1 : cz * PISO.n + cx; };
  const pisoState = (sch, cell, now) => { const e = sch.byCell[cell]; if (!e) return 0; return now >= e.fall ? 2 : now >= e.warn ? 1 : 0; };
  const pisoCenter = c => [(c % PISO.n + 0.5) * PISO.size - PISO.half, (Math.floor(c / PISO.n) + 0.5) * PISO.size - PISO.half];

  // ---------- Monedas / meteoros
  const COIN = { R: 6.6, fall: 900, life: 4300 };
  function coinSchedule(seed, dur, p) {
    const r = rngOf(seed), list = []; let t = 700, id = 0; const bomb = p.bomb ?? 0.13, rate = p.rate || 1;
    while (t < dur - 1300) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (COIN.R - 0.6), q = r();
      list.push({ id: id++, t, x: Math.cos(a) * d, z: Math.sin(a) * d, kind: q < bomb ? 'bomb' : q < bomb + 0.12 ? 'big' : 'coin' });
      t += (240 + r() * 300) * rate; }
    return list;
  }
  const coinValue = c => c.kind === 'big' ? 3 : c.kind === 'coin' ? 1 : 0;
  function meteorSchedule(seed, dur, p) {
    const r = rngOf(seed), list = []; let t = 1500, gap = p.fast ? 380 : 650, id = 0;
    while (t < dur - 600) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 6.2;
      list.push({ id: id++, t, x: Math.cos(a) * d, z: Math.sin(a) * d, rad: p.big ? 1.6 : 1.0, fall: p.big ? 1600 : p.fast ? 900 : 1300 });
      t += gap; gap = Math.max(p.fast ? 150 : 230, gap * 0.95); }
    return list;
  }

  // ---------- Barra
  const BARRA = { R: 6.6, inner: 1.15, h: 0.55 };
  const barAngle = (ms, p) => { const t = ms / 1000, sp = p.speed || 1; return p.zigzag ? 1.4 * t + 0.03 * t * t + 4 * Math.sin(t * 0.55) : sp * (1.25 * t + 0.052 * t * t); };
  const barCount = (ms, p) => (p.bars || 1) + (ms > 15000 ? 1 : 0);
  const gravity = p => p.lowG ? 9 : 24, jumpV = p => p.lowG ? 4.8 : 7.4;
  function barHit(prev, now, x, z, y, p) {
    if (now < 2200) return false; const r = Math.hypot(x, z); if (r < BARRA.inner - 0.3 || r > BARRA.R + 0.3 || y > BARRA.h) return false;
    const pa = Math.atan2(z, x), n = barCount(now, p);
    for (let b = 0; b < n; b++) { const off = b * Math.PI * 2 / n, d0 = wrap(barAngle(prev, p) + off - pa), d1 = wrap(barAngle(now, p) + off - pa);
      if (Math.sign(d0) !== Math.sign(d1) && Math.abs(d1 - d0) < 1.5) return true; }
    return false;
  }

  // ---------- Bolas
  const BOLAS = { w: 5.4, zMin: -3, zMax: 5 };
  function ballSchedule(seed, dur, p) {
    const r = rngOf(seed), list = []; let t = 1200, gap = 1100 / (p.rate || 1), id = 0;
    while (t < dur - 800) {
      const log = p.obj === 'log', rad = log ? 0.45 : p.big ? 0.9 + r() * 0.6 : 0.55 + r() * 0.75;
      const b = { id: id++, t, r: rad, v: (6 + r() * 3 + t / 6000) * (p.rate || 1), len: log ? 3 + r() * 4 : 0 };
      if (p.side) { b.dir = r() < 0.5 ? 1 : -1; b.lane = BOLAS.zMin + 0.5 + r() * (BOLAS.zMax - BOLAS.zMin - 1); }
      else b.lane = (r() * 2 - 1) * (BOLAS.w - 0.3);
      list.push(b); t += gap; gap = Math.max(log ? 700 : 330, gap * 0.94); }
    return list;
  }
  // posición de la bola: [x, z]
  const ballPos = (b, now, p) => { const d = b.v * (now - b.t) / 1000; return p.side ? [b.dir * (-9 + d), b.lane] : [b.lane, -14 + d]; };
  function ballHit(list, now, x, z, y, p) {
    for (const b of list) { if (now < b.t) break; const [bx, bz] = ballPos(b, now, p); if (Math.abs(bx) > 12 || bz > 10) continue;
      const hw = p.obj === 'log' ? b.len / 2 + 0.25 : b.r + 0.28, hd = b.r + 0.3;
      const inX = p.side ? Math.abs(bx - x) < hd : Math.abs(bx - x) < hw, inZ = p.side ? Math.abs(bz - z) < hw : Math.abs(bz - z) < hd;
      if (inX && inZ && y < b.r * 1.6) return true; }
    return false;
  }

  // ---------- Laberinto (generado con semilla)
  function maze(seed, big) {
    const n = big ? 11 : 9, r = rngOf(seed), walls = []; // walls[c] = [N,E,S,W]
    for (let i = 0; i < n * n; i++) walls.push([1, 1, 1, 1]);
    const seen = new Set([0]), st = [0];
    while (st.length) { const c = st[st.length - 1], x = c % n, y = Math.floor(c / n);
      const nb = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]].filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen.has(ny * n + nx); });
      if (!nb.length) { st.pop(); continue; }
      const [dx, dy, w1, w2] = nb[Math.floor(r() * nb.length)], nc = (y + dy) * n + x + dx; walls[c][w1] = 0; walls[nc][w2] = 0; seen.add(nc); st.push(nc); }
    // abrir algunas paredes extra para que haya varios caminos
    for (let k = 0; k < n; k++) { const c = Math.floor(r() * n * n), w = Math.floor(r() * 4), x = c % n, y = Math.floor(c / n);
      const [dx, dy, w2] = [[0, -1, 2], [1, 0, 3], [0, 1, 0], [-1, 0, 1]][w]; const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < n && ny < n) { walls[c][w] = 0; walls[ny * n + nx][w2] = 0; } }
    const cell = 1.6, half = n * cell / 2, exit = n * n - 1;
    const path = (from) => { const prev = { [from]: -1 }, q = [from]; while (q.length) { const c = q.shift(); if (c === exit) break; const x = c % n, y = Math.floor(c / n);
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], w) => { if (walls[c][w]) return; const nc = (y + dy) * n + x + dx; if (!(nc in prev)) { prev[nc] = c; q.push(nc); } }); }
      const out = []; let c = exit; while (c !== -1 && c !== undefined) { out.unshift(c); c = prev[c]; } return out; };
    const center = c => [(c % n + 0.5) * cell - half, (Math.floor(c / n) + 0.5) * cell - half];
    const cellAt = (x, z) => { const cx = Math.floor((x + half) / cell), cz = Math.floor((z + half) / cell); return cx < 0 || cz < 0 || cx >= n || cz >= n ? -1 : cz * n + cx; };
    return { n, walls, cell, half, exit, path, center, cellAt };
  }
  // Mueve dentro del laberinto sin atravesar paredes
  function mazeMove(mz, x, z, dx, dz) {
    const rad = 0.3, tryAxis = (nx, nz) => { const c = mz.cellAt(x, z); if (c < 0) return [nx, nz];
      const [cx, cz] = mz.center(c), h = mz.cell / 2 - rad, w = mz.walls[c];
      if (w[0] && nz < cz - h) nz = cz - h; if (w[2] && nz > cz + h) nz = cz + h; if (w[3] && nx < cx - h) nx = cx - h; if (w[1] && nx > cx + h) nx = cx + h;
      return [Math.max(-mz.half + rad, Math.min(mz.half - rad, nx)), Math.max(-mz.half + rad, Math.min(mz.half - rad, nz))]; };
    return tryAxis(x + dx, z + dz);
  }

  // ---------- Zona (rey de la colina)
  const zoneAt = (seed, now, p) => { const t = now / 1000, s = (seed % 1000) / 160, f = p.fast ? 1.8 : 1;
    const x = Math.sin(t * 0.33 * f + s) * 4.2, z = Math.cos(t * 0.27 * f + s * 1.3) * 3.6; const rad = p.shrink ? Math.max(0.9, 2.6 - t * 0.07) : p.fast ? 1.6 : 2.1; return [x, z, rad]; };

  // ---------- Tiro (objetivos para tocar)
  function targetSchedule(seed, dur, p) {
    const r = rngOf(seed), list = []; let t = 600, id = 0;
    while (t < dur - 600) { const bad = r() < (p.bad || 0);
      list.push({ id: id++, t, x: (r() * 2 - 1) * 3.2, y: 1 + r() * 4.2, life: p.target === 'topo' ? 1100 : p.small ? 1500 : 2300, gold: !bad && r() < 0.12, bad, dir: r() < 0.5 ? 1 : -1, sp: 1.5 + r() * 2 });
      t += p.small ? 260 : 330 + r() * 250; }
    return list;
  }
  const targetValue = c => c.bad ? -3 : c.gold ? 3 : 1;
  const targetPos = (c, now, p) => { const k = (now - c.t) / 1000;
    if (p.target === 'pato' || p.target === 'luz') return [c.dir * (-4.5 + k * c.sp * 2.2), c.y + (p.target === 'luz' ? Math.sin(k * 5) * 0.5 : 0)];
    if (p.target === 'burbuja') return [c.x + Math.sin(k * 3) * 0.3, 0.2 + k * 2.3];
    if (p.target === 'topo') return [Math.round(c.x / 1.6) * 1.6, 0.6 + Math.floor(c.y) % 3 * 1.6];
    return [c.x, c.y + k * 0.6]; };
  const targetActive = (c, now) => now >= c.t && now < c.t + c.life;

  // ---------- Contar
  function countSchedule(seed, p) {
    const r = rngOf(seed), list = []; let t = 800, real = 0;
    while (t < 12500) { const good = r() < 0.6; if (good) real++; list.push({ t, good, lane: r() * 2 - 1, sp: 3 + r() * 3, dir: r() < 0.5 ? 1 : -1 }); t += 220 + r() * 520; }
    return { list, real };
  }
  // ---------- Vasos
  function cupsSchedule(seed, p) {
    const r = rngOf(seed), rounds = [];
    for (let k = 0; k < 3; k++) { const swaps = []; const n = 4 + k * 3 + (p.fast ? 3 : 0);
      for (let i = 0; i < n; i++) { const a = Math.floor(r() * 3); let b = Math.floor(r() * 2); if (b >= a) b++; swaps.push([a, b]); }
      rounds.push({ start: Math.floor(r() * 3), swaps, dur: Math.max(220, (520 - k * 120) * (p.fast ? 0.75 : 1)) }); }
    return rounds;
  }
  // ---------- Memoria
  const memSeq = (seed, pads) => { const r = rngOf(seed), s = []; for (let i = 0; i < 30; i++) s.push(Math.floor(r() * pads)); return s; };
  // ---------- Corredor
  function runnerSchedule(seed, dur, p) {
    const r = rngOf(seed), list = []; let z = 12, id = 0;
    while (z < 400) { const lane = Math.floor(r() * 3) - 1, kind = r() < 0.55 ? 'coin' : 'rock'; list.push({ id: id++, z, lane, kind });
      if (kind === 'coin' && r() < 0.5) for (let k = 1; k < 4; k++) list.push({ id: id++, z: z + k * 1.2, lane, kind: 'coin' });
      z += 3 + r() * 4; }
    return list;
  }
  const runnerSpeed = (now, p) => (p.fast ? 9 : 7) + now / 4000;
  const runnerDist = (now, p) => { const t = now / 1000; return (p.fast ? 9 : 7) * t + t * t / 8; };
  // ---------- Pesca: picadas por jugador
  const fishBites = (seed, id, p) => { const r = rngOf(seed ^ hashStr(id)), out = []; let t = 1500; while (t < 30000) { t += (p.ice ? 2600 : 1700) + r() * 2800; out.push(t); } return out; };
  // ---------- Reflejo
  function reflexRounds(seed, p) { const r = rngOf(seed), out = []; let t = 1500;
    for (let k = 0; k < 3; k++) { const fake = p.fake && r() < 0.6 ? t + 900 + r() * 1200 : null; const go = t + 2000 + r() * 2500 + (fake ? 900 : 0); out.push({ go, fake }); t = go + 2200; }
    return out; }

  /* ======================= Bots del anfitrión ======================= */
  // ctx = { id, kind, p, seed, dur, teams, format, bots{}, now }
  const arenaOf = kind => ({ monedas: clampCircle(6.6), meteoros: clampCircle(6.5), cazador: clampCircle(7), zombi: clampCircle(7), papa: clampCircle(6), pintar: clampRect(5.9, -5.9, 5.9),
    colina: clampCircle(7), canon: clampCircle(6.5), barra: clampCircle(BARRA.R, BARRA.inner), bolas: clampRect(BOLAS.w, BOLAS.zMin, BOLAS.zMax), piso: clampRect(5.95, -5.95, 5.95) }[kind]);
  function spawnPos(kind, i, n) {
    if (kind === 'carrera' || kind === 'corredor') return [(i - (n - 1) / 2) * (kind === 'corredor' ? 4.2 : 1.9), 0];
    if (kind === 'bolas') return [n > 1 ? -4 + 8 * i / (n - 1) : 0, 3];
    if (kind === 'laberinto') return [-0.5 * (n - 1) * 0.3 + i * 0.3 - 6.4, -6.4];
    const STAGE_Z = { tiro: 3, memoria: -5, reflejo: -0.5, contar: -5.2, vasos: -2.6, ruleta: -1.6, pesca: -5.5, torre: -4, cuerda: 3 };
    if (kind in STAGE_Z) return [(i - (n - 1) / 2) * (kind === 'reflejo' ? 2.2 : 1.6), STAGE_Z[kind]];
    const rad = kind === 'barra' ? 4 : kind === 'pintar' ? 3.5 : 2.8, a = i / n * Math.PI * 2 + 0.4;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  }
  // Puntaje planificado para las mecánicas donde el bot no se mueve "de verdad"
  const PLAN = {
    memoria: (b, r, c) => ({ score: Math.round(between(r, [[2, 5], [4, 7], [6, 10]][b.k]) - (c.p.fast ? 1 : 0)), at: c.dur * (0.4 + r() * 0.5) }),
    reflejo: (b, r) => ({ score: Math.round(between(r, [[1300, 2200], [950, 1500], [720, 1100]][b.k]) + (r() < [0.3, 0.15, 0.06][b.k] ? 1500 : 0)), at: 16000 }),
    torre: (b, r, c) => ({ score: Math.round(between(r, [[5, 10], [8, 15], [12, 22]][b.k]) * (c.p.fast ? 0.8 : 1)), at: c.dur * (0.5 + r() * 0.45) }),
    corredor: (b, r) => ({ score: Math.round(between(r, [[10, 22], [18, 32], [28, 45]][b.k])), at: null }),
    contar: (b, r) => ({ score: Math.round(Math.abs(between(r, [[-4, 4], [-2.5, 2.5], [-1.4, 1.4]][b.k]))), at: 17000 + r() * 4000 }),
    vasos: (b, r) => { let s = 0; for (let i = 0; i < 3; i++) if (r() < [0.45, 0.62, 0.82][b.k]) s++; return { score: s, at: null }; },
    ruleta: (b, r) => ({ score: Math.round(between(r, [[25, 70], [12, 40], [4, 22]][b.k])), at: 18000 + r() * 5000 }),
    pesca: (b, r, c) => ({ score: Math.round(between(r, [[3, 6], [5, 8], [7, 11]][b.k]) * (c.p.ice ? 1.4 : 1)), at: null }),
    carrera: null, laberinto: null,
  };
  const SURV = ['piso', 'barra', 'bolas', 'meteoros', 'zombi', 'papa', 'canon', 'cazador'];

  const host = {
    init(id, seed, players, dur, teams, format) {
      const m = BYID[id], p = m.p, kind = m.kind, r = rngOf(seed ^ 0x5bd1e995);
      const ctx = { id, kind, p, seed, dur, teams, format, bots: {}, now: 0, players: players.map(x => x.id), rr: r };
      const teamOf = pid => teams ? (teams.A.includes(pid) ? 'A' : 'B') : null; ctx.teamOf = teamOf;
      if (kind === 'piso') ctx.sch = pisoSchedule(seed, dur, p);
      if (kind === 'monedas') ctx.coins = coinSchedule(seed, dur, p);
      if (kind === 'meteoros') ctx.mets = meteorSchedule(seed, dur, p);
      if (kind === 'bolas') ctx.balls = ballSchedule(seed, dur, p);
      if (kind === 'laberinto') ctx.mz = maze(seed, p.big);
      if (kind === 'tiro') ctx.targets = targetSchedule(seed, dur, p);
      // roles
      if (kind === 'cazador') ctx.hunter = teams ? (teams.A.length === 1 ? teams.A[0] : teams.B[0]) : players[0].id;
      if (kind === 'zombi') ctx.zombies = { [players[Math.floor(r() * players.length)].id]: 0 };
      if (kind === 'papa') { ctx.holder = players[Math.floor(r() * players.length)].id; ctx.booms = []; let t = 0; for (let k = 0; k < players.length - 1; k++) { t += (p.fast ? 5000 : 7000) + r() * 3000; ctx.booms.push(Math.min(t, dur - 300)); } ctx.immune = 0; }
      if (kind === 'canon') ctx.gunner = teams ? (teams.A.length === 1 ? teams.A[0] : teams.B[0]) : players[0].id;
      if (kind === 'pintar') ctx.paint = new Array(100).fill(-1);
      if (kind === 'cuerda') ctx.rope = 0;
      players.forEach((pl, i) => {
        if (!pl.bot) return;
        const k = BOT_K[pl.lvl] ?? 1, [x, z] = spawnPos(kind, i, players.length);
        const survive = r() < [0.15, 0.4, 0.7][k];
        const b = ctx.bots[pl.id] = { id: pl.id, x, z, y: 0, ry: kind === 'carrera' || kind === 'corredor' ? Math.PI : 0, st: 0, sc: 0, mv: 0, k, vy: 0, tx: x, tz: z, retarget: 0, v: 0,
          quitAt: survive ? Infinity : dur * (0.2 + r() * 0.72), stunUntil: 0, speedN: 0.85 + r() * 0.3, score: null, dist: 0, lives: 3, taps: 0 };
        if (PLAN[kind]) { const pl2 = PLAN[kind](b, r, ctx); b.plan = pl2.score; b.planAt = pl2.at; }
        if (kind === 'laberinto') { b.route = ctx.mz.path(ctx.mz.cellAt(x, z)); b.ri = 0; }
      });
      ctx.net0 = true; return ctx;
    },
    // Avanza la simulación. net = {pos, taken, counts, ev, x, team, over}. Devuelve {id: puntaje} nuevos.
    step(ctx, dt, now, net) {
      const prev = ctx.now; ctx.now = now; const out = {}, p = ctx.p, kind = ctx.kind, clamp = arenaOf(kind);
      net.x = net.x || {};
      const posOf = id => ctx.bots[id] ? [ctx.bots[id].x, ctx.bots[id].z, ctx.bots[id].y, 0, ctx.bots[id].st] : net.pos[id];
      const alive = id => { const a = posOf(id); return a && a[4] !== 1; };
      const finish = (b, v, st = 1) => { if (b.score != null) return; b.score = v; b.st = st; out[b.id] = v; };
      // ---- lógica global (decide el anfitrión)
      if (kind === 'cazador') {
        net.x.out = net.x.out || {}; const h = posOf(ctx.hunter);
        if (h && now > 2500) for (const id of ctx.players) { if (id === ctx.hunter || net.x.out[id] != null) continue; const a = posOf(id);
          if (a && Math.hypot(a[0] - h[0], a[1] - h[1]) < 0.95) { net.x.out[id] = Math.round(now); if (ctx.bots[id]) finish(ctx.bots[id], Math.round(now)); if (p.fast) ctx.tired = now + 1500; } }
        const runners = ctx.players.filter(id => id !== ctx.hunter), caught = runners.filter(id => net.x.out[id] != null).length;
        net.x.caught = caught; if (caught === runners.length && !net.team) { net.team = ctx.teamOf(ctx.hunter) || 'A'; net.over = true; }
        if (now >= ctx.dur && !net.team) net.team = ctx.teamOf(runners[0]) || 'B';
        if (ctx.bots[ctx.hunter] && (net.over || now >= ctx.dur)) finish(ctx.bots[ctx.hunter], caught, 3);
      }
      if (kind === 'zombi') {
        net.x.z = ctx.zombies;
        for (const zid of Object.keys(ctx.zombies)) { const zp = posOf(zid); if (!zp) continue;
          for (const id of ctx.players) { if (id in ctx.zombies) continue; const a = posOf(id); if (a && now - ctx.zombies[zid] > 800 && Math.hypot(a[0] - zp[0], a[1] - zp[1]) < 0.95) ctx.zombies[id] = Math.round(now); } }
        for (const id of ctx.players) if (ctx.zombies[id] != null && ctx.bots[id] && ctx.bots[id].score == null && ctx.zombies[id] > 0) { ctx.bots[id].score = ctx.zombies[id]; out[id] = ctx.zombies[id]; }
        if (Object.keys(ctx.zombies).length >= ctx.players.length) net.over = true;
      }
      if (kind === 'papa') {
        net.x.out = net.x.out || {}; const live = ctx.players.filter(id => net.x.out[id] == null);
        if (ctx.booms.length && now >= ctx.booms[0]) { ctx.booms.shift(); net.x.out[ctx.holder] = Math.round(now); if (ctx.bots[ctx.holder]) finish(ctx.bots[ctx.holder], Math.round(now));
          const rest = ctx.players.filter(id => net.x.out[id] == null); if (rest.length <= 1) net.over = true; else ctx.holder = rest[Math.floor(ctx.rr() * rest.length)]; ctx.immune = now + 1000; }
        else if (now > ctx.immune) { const h = posOf(ctx.holder); if (h) for (const id of live) { if (id === ctx.holder) continue; const a = posOf(id); if (a && Math.hypot(a[0] - h[0], a[1] - h[1]) < 0.95) { ctx.holder = id; ctx.immune = now + 900; break; } } }
        net.x.holder = ctx.holder; net.x.next = ctx.booms[0] || null;
      }
      if (kind === 'canon') {
        net.ev = net.ev || []; net.x.out = net.x.out || {};
        const runners = ctx.players.filter(id => id !== ctx.gunner);
        if (runners.every(id => net.x.out[id] != null || (ctx.bots[id] && ctx.bots[id].score != null) || (net.pos[id] && net.pos[id][4] === 1))) { if (!net.team) { net.team = ctx.teamOf(ctx.gunner) || 'A'; net.over = true; } }
        if (now >= ctx.dur && !net.team) net.team = ctx.teamOf(runners[0]) || 'B';
      }
      if (kind === 'pintar') {
        const R = p.brush ? 1 : 0;
        ctx.players.forEach((id, idx) => { const a = posOf(id); if (!a) return; const cx = Math.floor((a[0] + 6) / 1.2), cz = Math.floor((a[1] + 6) / 1.2);
          const col = ctx.teams ? (ctx.teamOf(id) === 'A' ? 0 : 1) : idx;
          for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < 10 && z < 10) ctx.paint[z * 10 + x] = col; } });
        net.x.paint = ctx.paint.join(',');
      }
      if (kind === 'cuerda') {
        const rate = ids => ids.reduce((a, id) => a + (ctx.bots[id] ? ctx.bots[id].taps : ((net.pos[id] || [])[5] || 0)), 0);
        const A = ctx.teams.A, B = ctx.teams.B, ta = rate(A) / A.length, tb = rate(B) / B.length;
        ctx.lastA = ctx.lastA ?? ta; ctx.lastB = ctx.lastB ?? tb;
        const da = ta - ctx.lastA, db = tb - ctx.lastB; ctx.lastA = ta; ctx.lastB = tb;
        if (p.look === 'boat') { ctx.ba = (ctx.ba || 0) + da * 0.022; ctx.bb = (ctx.bb || 0) + db * 0.022; net.x.boats = [ctx.ba, ctx.bb];
          if (!net.team && (ctx.ba >= 1 || ctx.bb >= 1)) { net.team = ctx.ba >= ctx.bb ? 'A' : 'B'; net.over = true; } }
        else { ctx.rope = Math.max(-1, Math.min(1, ctx.rope + (db - da) * 0.012)); net.x.rope = ctx.rope;
          if (!net.team && Math.abs(ctx.rope) >= 1) { net.team = ctx.rope < 0 ? 'A' : 'B'; net.over = true; } }
        if (now >= ctx.dur && !net.team) net.team = p.look === 'boat' ? ((ctx.ba || 0) === (ctx.bb || 0) ? 'tie' : (ctx.ba || 0) > (ctx.bb || 0) ? 'A' : 'B') : ctx.rope === 0 ? 'tie' : ctx.rope < 0 ? 'A' : 'B';
      }
      // ---- bots
      for (const b of Object.values(ctx.bots)) {
        if (b.score != null && !['carrera'].includes(kind)) { if (b.st === 1) b.y -= 9 * dt; b.mv = 0; continue; }
        const live = now < b.quitAt, k = b.k;
        const go = (tx, tz, sp) => { moveTo(b, tx, tz, sp, dt); if (clamp) [b.x, b.z] = clamp(b.x, b.z); };
        b.retarget -= dt;
        switch (kind) {
          case 'piso': {
            if (live && (b.retarget <= 0 || pisoState(ctx.sch, pisoCellAt(b.tx, b.tz), now + 1300) > 0)) { b.retarget = 1 + Math.random() * 1.5;
              for (let t = 0; t < 20; t++) { const c = Math.floor(Math.random() * 64); if (pisoState(ctx.sch, c, now + 2600) === 0) { [b.tx, b.tz] = pisoCenter(c); break; } } }
            if (live) go(b.tx, b.tz, SPEED * 0.8); else b.mv = 0;
            if (pisoState(ctx.sch, pisoCellAt(b.x, b.z), now) === 2) finish(b, Math.round(now));
            break; }
          case 'monedas': {
            if (now > b.stunUntil) {
              if (b.retarget <= 0) { b.retarget = [0.7, 0.4, 0.15][k]; let best = null, bd = 1e9; const life = p.life || COIN.life;
                for (const c of ctx.coins) { if (c.kind === 'bomb' || net.taken[c.id] != null) continue; if (now < c.t + COIN.fall - 700 || now > c.t + COIN.fall + life - 300) continue;
                  const d = Math.hypot(c.x - b.x, c.z - b.z) - coinValue(c) * 0.8; if (d < bd) { bd = d; best = c; } }
                if (best) { b.tx = best.x; b.tz = best.z; } }
              go(b.tx, b.tz, SPEED * [0.62, 0.78, 0.92][k] * b.speedN * (p.ice ? 0.8 : 1));
              for (const c of ctx.coins) { if (c.kind === 'bomb') { if (now >= c.t + COIN.fall && prev < c.t + COIN.fall && Math.hypot(c.x - b.x, c.z - b.z) < 1.7) b.stunUntil = now + 1500; continue; }
                host.action(ctx, b.id, { t: 'mggrab', id: c.id, auto: [b.x, b.z] }, now, net); }
            } else b.mv = 0;
            b.st = now < b.stunUntil ? 2 : 0; b.sc = net.counts[b.id] || 0; break; }
          case 'barra': {
            if (b.retarget <= 0) { b.retarget = 2 + Math.random() * 2; const a = Math.random() * 6.28, d = 2 + Math.random() * 3.5; b.tx = Math.cos(a) * d; b.tz = Math.sin(a) * d; }
            go(b.tx, b.tz, SPEED * 0.45);
            if (live && b.y <= 0) { const pa = Math.atan2(b.z, b.x), n = barCount(now, p), a1 = barAngle(now, p), a2 = barAngle(now + 300, p);
              for (let j = 0; j < n; j++) { const off = j * Math.PI * 2 / n, d0 = wrap(a1 + off - pa), d1 = wrap(a2 + off - pa); if (Math.sign(d0) !== Math.sign(d1) && Math.abs(d1 - d0) < 1.5 && Math.abs(d0) > 0.05) { b.vy = jumpV(p); break; } } }
            b.vy -= gravity(p) * dt; b.y = Math.max(0, b.y + b.vy * dt); if (b.y === 0) b.vy = 0;
            if (barHit(prev, now, b.x, b.z, b.y, p)) finish(b, Math.round(now));
            break; }
          case 'bolas': {
            if (live) { let danger = null;
              for (const c of ctx.balls) { if (now < c.t) break; const [bx, bz] = ballPos(c, now + 500, p), [cx0, cz0] = ballPos(c, now, p);
                if (p.side) { if (Math.abs(bz - b.z) < c.r + 0.9 && ((c.dir > 0 && cx0 < b.x + 0.5 && bx > b.x - 1.5) || (c.dir < 0 && cx0 > b.x - 0.5 && bx < b.x + 1.5))) { danger = c; break; } }
                else if (cz0 < b.z + 0.5 && bz > b.z - 3 && Math.abs(c.lane - b.x) < (p.obj === 'log' ? c.len / 2 + 0.8 : c.r + 0.9)) { danger = c; break; } }
              if (danger) { if (p.jump && b.y <= 0 && danger.len) b.vy = 7.4;
                else if (p.side) b.tz = danger.lane > 1 ? danger.lane - danger.r - 1 : danger.lane + danger.r + 1;
                else { const half = p.obj === 'log' ? danger.len / 2 : danger.r, l = danger.lane - half - 0.8, rr = danger.lane + half + 0.8; b.tx = (Math.abs(l - b.x) < Math.abs(rr - b.x) && l > -BOLAS.w) || rr > BOLAS.w ? l : rr; } }
              go(b.tx, b.tz, SPEED * 0.9); } else b.mv = 0;
            b.vy -= 24 * dt; b.y = Math.max(0, b.y + b.vy * dt); if (b.y === 0) b.vy = 0;
            if (ballHit(ctx.balls, now, b.x, b.z, b.y, p)) finish(b, Math.round(now));
            break; }
          case 'meteoros': {
            if (live) { let threat = null; for (const m of ctx.mets) { if (m.t > now + 300) break; if (now > m.t + m.fall) continue; if (Math.hypot(m.x - b.x, m.z - b.z) < m.rad + 0.6) { threat = m; break; } }
              if (threat) { const dx = b.x - threat.x, dz = b.z - threat.z, d = Math.hypot(dx, dz) || 1; b.tx = b.x + dx / d * 2.5; b.tz = b.z + dz / d * 2.5; }
              else if (b.retarget <= 0) { b.retarget = 1.5; b.tx = (Math.random() * 2 - 1) * 4; b.tz = (Math.random() * 2 - 1) * 4; }
              go(b.tx, b.tz, SPEED * 0.85); }
            else { let nx = null, nd = 1e9; for (const m of ctx.mets) { const l = m.t + m.fall; if (l < now + 150) continue; if (l > now + 1600) break; const d = Math.hypot(m.x - b.x, m.z - b.z); if (d < nd) { nd = d; nx = m; } }
              if (nx) go(nx.x, nx.z, SPEED * 0.7); } // se distrae y se lo pega
            for (const m of ctx.mets) { const land = m.t + m.fall; if (land > now) break; if (land <= prev) continue; if (Math.hypot(m.x - b.x, m.z - b.z) < m.rad) { b.lives--; b.st = 2; b.stunUntil = now + 600; if (b.lives <= 0) finish(b, Math.round(now)); } }
            if (b.score == null && now > b.stunUntil) b.st = 0; b.sc = b.lives; break; }
          case 'carrera': {
            if (b.score != null) { b.mv = 0; break; }
            const len = p.len || 40, target = [2.5, 3.5, 4.5][k] * b.speedN * (p.mode === 'light' ? 0.75 : 1);
            b.v += (target + Math.sin(now / 400 + b.speedN * 9) * 0.6 - b.v) * Math.min(1, dt * 2); b.dist += b.v * dt; b.z = -b.dist; b.mv = 1; b.ry = Math.PI;
            if (b.dist >= len) { b.dist = len; b.z = -len; b.mv = 0; finish(b, Math.round(now), 3); } b.sc = Math.round(b.dist); break; }
          case 'cazador': {
            const isH = b.id === ctx.hunter, h = posOf(ctx.hunter); if (net.x.out && net.x.out[b.id] != null) break;
            if (isH) { let best = null, bd = 1e9; for (const id of ctx.players) { if (id === b.id || net.x.out[id] != null) continue; const a = posOf(id); if (!a) continue; const d = Math.hypot(a[0] - b.x, a[1] - b.z); if (d < bd) { bd = d; best = a; } }
              if (best) go(best[0], best[1], SPEED * [0.85, 1.0, 1.12][k] * (p.fast ? 1.15 : 1) * (now < (ctx.tired || 0) ? 0.3 : 1) * (now < 2500 ? 0 : 1)); }
            else if (h) { const dx = b.x - h[0], dz = b.z - h[1], d = Math.hypot(dx, dz) || 1; let tx = b.x + dx / d * 3 + (-dz / d) * 1.5, tz = b.z + dz / d * 3 + (dx / d) * 1.5; if (Math.hypot(tx, tz) > 6) { tx = -dz / d * 5; tz = dx / d * 5; }
              go(tx, tz, SPEED * [0.72, 0.85, 0.95][k] * (live ? 1 : 0.5)); }
            break; }
          case 'zombi': {
            const isZ = b.id in ctx.zombies;
            if (isZ) { let best = null, bd = 1e9; for (const id of ctx.players) { if (id in ctx.zombies) continue; const a = posOf(id); if (!a) continue; const d = Math.hypot(a[0] - b.x, a[1] - b.z); if (d < bd) { bd = d; best = a; } }
              if (best) go(best[0], best[1], SPEED * 0.8); b.st = 2; }
            else { let near = null, nd = 1e9; for (const zid of Object.keys(ctx.zombies)) { const a = posOf(zid); if (!a) continue; const d = Math.hypot(a[0] - b.x, a[1] - b.z); if (d < nd) { nd = d; near = a; } }
              if (near && nd < 5) { const dx = b.x - near[0], dz = b.z - near[1], d = nd || 1; let tx = b.x + dx / d * 3 + (-dz / d) * 2, tz = b.z + dz / d * 3 + (dx / d) * 2; if (Math.hypot(tx, tz) > 6) { tx = -dz / d * 5; tz = dx / d * 5; } go(tx, tz, SPEED * [0.7, 0.82, 0.92][k] * (live ? 1 : 0.6)); }
              else b.mv = 0; }
            break; }
          case 'papa': {
            if (net.x.out[b.id] != null) break;
            if (ctx.holder === b.id) { let best = null, bd = 1e9; for (const id of ctx.players) { if (id === b.id || net.x.out[id] != null) continue; const a = posOf(id); if (!a) continue; const d = Math.hypot(a[0] - b.x, a[1] - b.z); if (d < bd) { bd = d; best = a; } }
              if (best) go(best[0], best[1], SPEED * [0.75, 0.9, 1.0][k]); }
            else { const h = posOf(ctx.holder); if (h) { const dx = b.x - h[0], dz = b.z - h[1], d = Math.hypot(dx, dz) || 1; if (d < 4.5) { let tx = b.x + dx / d * 3 + (-dz / d) * 2, tz = b.z + dz / d * 3 + (dx / d) * 2; if (Math.hypot(tx, tz) > 5) { tx = -dz / d * 4; tz = dx / d * 4; } go(tx, tz, SPEED * [0.68, 0.8, 0.9][k]); } else b.mv = 0; } }
            b.st = ctx.holder === b.id ? 2 : 0; break; }
          case 'canon': {
            if (b.id === ctx.gunner) { // apunta a alguien con algo de error
              if (now > (b.nextShot || 2000)) { const targets = ctx.players.filter(id => id !== b.id && net.x.out[id] == null && alive(id)); if (targets.length) { const a = posOf(targets[Math.floor(Math.random() * targets.length)]);
                const err = [1.8, 1.1, 0.6][k]; host.action(ctx, b.id, { t: 'mgact', x: a[0] + (Math.random() * 2 - 1) * err, z: a[1] + (Math.random() * 2 - 1) * err }, now, net); }
                b.nextShot = now + (p.big ? 1300 : 800) + Math.random() * 400; }
              b.x = 0; b.z = -7.6; b.ry = 0; break; }
            let threat = null; for (const e of net.ev) { if (e.t < now - 50) continue; if (Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.7) { threat = e; break; } }
            if (threat && live) { const dx = b.x - threat.x, dz = b.z - threat.z, d = Math.hypot(dx, dz) || 1; b.tx = b.x + dx / d * 2.5; b.tz = b.z + dz / d * 2.5; }
            else if (b.retarget <= 0) { b.retarget = 1.2; b.tx = (Math.random() * 2 - 1) * 4.5; b.tz = (Math.random() * 2 - 1) * 4.5; }
            go(b.tx, b.tz, SPEED * [0.7, 0.85, 0.95][k]);
            for (const e of net.ev) if (e.t <= now && e.t > prev && Math.hypot(e.x - b.x, e.z - b.z) < e.r) { net.x.out[b.id] = Math.round(now); finish(b, Math.round(now)); }
            break; }
          case 'pintar': {
            if (b.retarget <= 0) { b.retarget = [1.4, 0.9, 0.6][k]; const mine = ctx.teams ? (ctx.teamOf(b.id) === 'A' ? 0 : 1) : ctx.players.indexOf(b.id); let best = null, bd = 1e9;
              for (let t = 0; t < 14; t++) { const c = Math.floor(Math.random() * 100); if (ctx.paint[c] === mine) continue; const x = (c % 10 + 0.5) * 1.2 - 6, z = (Math.floor(c / 10) + 0.5) * 1.2 - 6, d = Math.hypot(x - b.x, z - b.z); if (d < bd) { bd = d; best = [x, z]; } }
              if (best) [b.tx, b.tz] = best; }
            go(b.tx, b.tz, SPEED * [0.65, 0.8, 0.95][k]); b.sc = 0; break; }
          case 'colina': {
            const [zx, zz, zr] = zoneAt(ctx.seed, now + [700, 350, 100][k], p);
            if (b.retarget <= 0) { b.retarget = [0.5, 0.3, 0.15][k];
              if (now > (b.wanderUntil || 0) && Math.random() < [0.12, 0.06, 0.025][k]) { b.wanderUntil = now + 1800; b.wx = (Math.random() * 2 - 1) * 5; b.wz = (Math.random() * 2 - 1) * 5; }
              if (now < (b.wanderUntil || 0)) { b.tx = b.wx; b.tz = b.wz; } else { b.tx = zx + (Math.random() - 0.5) * zr; b.tz = zz + (Math.random() - 0.5) * zr; } }
            go(b.tx, b.tz, SPEED * [0.6, 0.75, 0.9][k]); const [cx, cz, cr] = zoneAt(ctx.seed, now, p); if (Math.hypot(b.x - cx, b.z - cz) < cr) b.sc += dt * 1000; break; }
          case 'laberinto': {
            const mz = ctx.mz; if (b.score != null) break;
            if (b.ri < b.route.length) { const [tx, tz] = b.ri === b.route.length - 1 ? mz.center(mz.exit) : mz.center(b.route[b.ri]); moveTo(b, tx, tz, SPEED * [0.4, 0.55, 0.7][k] * b.speedN, dt); if (Math.hypot(tx - b.x, tz - b.z) < 0.15) b.ri++; }
            if (mz.cellAt(b.x, b.z) === mz.exit) finish(b, Math.round(now), 3); break; }
          case 'tiro': {
            if (b.retarget <= 0) { b.retarget = [0.75, 0.5, 0.32][k];
              const avail = ctx.targets.filter(c => targetActive(c, now) && net.taken[c.id] == null && now - c.t > [600, 400, 250][k] && (!c.bad || Math.random() < [0.3, 0.15, 0.05][k]));
              if (avail.length && Math.random() < 0.85) host.action(ctx, b.id, { t: 'mggrab', id: avail[0].id }, now, net); }
            b.sc = net.counts[b.id] || 0; break; }
          case 'cuerda': { b.taps += dt * [5.5, 7.5, 9.5][k] * b.speedN; b.mv = 1; b.sc = Math.round(b.taps); break; }
          case 'corredor': { b.sc = Math.round(b.plan * Math.min(1, now / ctx.dur)); b.mv = 1; break; }
          case 'pesca': case 'vasos': { b.sc = Math.round(b.plan * Math.min(1, now / ctx.dur)); break; }
          default: { // planificados: memoria, reflejo, torre, contar, ruleta
            if (b.planAt != null && now >= b.planAt) finish(b, b.plan, 3); else if (b.planAt) b.sc = kind === 'torre' || kind === 'memoria' ? Math.round(b.plan * now / b.planAt) : 0; }
        }
      }
      return out;
    },
    // acciones de los jugadores (agarrar algo, disparar)
    action(ctx, pid, msg, now, net) {
      const p = ctx.p;
      if (msg.t === 'mggrab' && ctx.kind === 'monedas' && net.taken[msg.id] == null) {
        const c = ctx.coins[msg.id], life = p.life || COIN.life;
        if (!c || c.kind === 'bomb' || now < c.t + COIN.fall - 300 || now > c.t + COIN.fall + life + 400) return;
        if (msg.auto && Math.hypot(c.x - msg.auto[0], c.z - msg.auto[1]) > 0.8) return;
        net.taken[msg.id] = pid; net.counts[pid] = (net.counts[pid] || 0) + coinValue(c);
      }
      if (msg.t === 'mggrab' && ctx.kind === 'tiro' && net.taken[msg.id] == null) {
        const c = ctx.targets[msg.id]; if (!c || now < c.t - 200 || now > c.t + c.life + 400) return;
        net.taken[msg.id] = pid; net.counts[pid] = (net.counts[pid] || 0) + targetValue(c);
      }
      if (msg.t === 'mgact' && ctx.kind === 'canon' && pid === ctx.gunner && Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
        if (now - (ctx.lastShot || -9999) < (p.big ? 1100 : 650)) return; ctx.lastShot = now;
        net.ev = (net.ev || []).filter(e => e.t > now - 1500);
        net.ev.push({ id: Math.round(now), x: Math.max(-6.5, Math.min(6.5, msg.x)), z: Math.max(-6.5, Math.min(6.5, msg.z)), t: Math.round(now + (p.big ? 1500 : 1000)), r: p.big ? 1.7 : 1.1 });
      }
    },
    final(ctx, id, net) {
      const b = ctx.bots[id]; if (!b) return null; if (b.score != null) return b.score;
      const k = ctx.kind;
      if (k === 'monedas' || k === 'tiro') return net.counts[id] || 0;
      if (k === 'carrera') return MISS + Math.round(((ctx.p.len || 40) - b.dist) * 1000);
      if (k === 'laberinto') return MISS + 1000 * b.route.length;
      if (k === 'colina') return Math.round(b.sc);
      if (k === 'cuerda') return Math.round(b.taps);
      if (k === 'cazador') return id === ctx.hunter ? (net.x.caught || 0) : ctx.dur;
      if (k === 'zombi') return ctx.zombies[id] != null ? (ctx.zombies[id] || 0) : ctx.dur;
      if (k === 'pintar') return paintCount(ctx, id, net);
      if (b.plan != null) return b.plan;
      return ctx.dur;
    },
    // puntajes que decide el anfitrión al final (anula lo que mandó cada celular)
    override(ctx, scores, net) {
      const outs = (net.x && net.x.out) || {};
      for (const id of ctx.players) {
        const b = ctx.bots[id];
        if (ctx.kind === 'monedas' || ctx.kind === 'tiro') scores[id] = net.counts[id] || 0;
        else if (ctx.kind === 'pintar') scores[id] = paintCount(ctx, id, net);
        else if (ctx.kind === 'zombi' && ctx.zombies[id] != null) scores[id] = ctx.zombies[id];
        else if (ctx.kind === 'cazador' && id === ctx.hunter) scores[id] = net.x.caught || 0;
        else if (ctx.kind === 'canon' && id === ctx.gunner) scores[id] = Object.keys(outs).length;
        else if (ctx.kind === 'cuerda' && !(id in scores)) scores[id] = b ? Math.round(b.taps) : ((net.pos[id] || [])[5] || 0);
        else if (outs[id] != null && !(id in scores)) scores[id] = outs[id];
      }
    },
    pos(ctx) { const o = {}; for (const [id, b] of Object.entries(ctx.bots)) o[id] = [+b.x.toFixed(2), +b.z.toFixed(2), +b.y.toFixed(2), +b.ry.toFixed(2), b.st, Math.round(b.sc), b.mv ? 1 : 0]; return o; },
  };
  function paintCount(ctx, id, net) { const col = ctx.teams ? (ctx.teamOf(id) === 'A' ? 0 : 1) : ctx.players.indexOf(id); return ctx.paint.filter(c => c === col).length; }

  window.MGCAT = MGCAT;
  window.MGL = { rngOf, wrap, hashStr, SPEED, MISS, BYID, fmtScore, host, spawnPos, arenaOf, PISO, pisoSchedule, pisoCellAt, pisoState, pisoCenter, COIN, coinSchedule, coinValue,
    meteorSchedule, BARRA, barAngle, barCount, barHit, gravity, jumpV, BOLAS, ballSchedule, ballPos, ballHit, maze, mazeMove, zoneAt, targetSchedule, targetValue, targetPos, targetActive,
    countSchedule, cupsSchedule, memSeq, runnerSchedule, runnerDist, fishBites, reflexRounds, clampCircle, clampRect };
})();
