// Minijuegos 3D de Fiesta Tablero. Expone window.MG3D.
// Cada celular simula su propio personaje; el anfitrión reparte las posiciones de todos
// (10 veces por segundo), decide quién agarra cada moneda y mueve a los bots.
import * as THREE from 'three';

/* ======================= Lógica compartida (sin gráficos) ======================= */
function rngOf(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const SPEED = 4.6;

// --- Piso Traicionero
const PISO = { n: 8, size: 1.5, half: 6 };
function pisoSchedule(seed, dur) {
  const r = rngOf(seed), cells = [...Array(PISO.n * PISO.n).keys()];
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const keep = 7, ev = []; let t = 2200, gap = 2600, k = 3, idx = 0;
  while (t < dur - 1800 && idx < cells.length - keep) {
    const batch = cells.slice(idx, idx + Math.min(k, cells.length - keep - idx)); idx += batch.length;
    ev.push({ warn: t, fall: t + 1150, cells: batch });
    t += gap; gap = Math.max(1150, gap * 0.9); if (ev.length % 2) k = Math.min(7, k + 1);
  }
  const byCell = {}; ev.forEach(e => e.cells.forEach(c => byCell[c] = e));
  return { ev, byCell };
}
function pisoCellAt(x, z) { const cx = Math.floor((x + PISO.half) / PISO.size), cz = Math.floor((z + PISO.half) / PISO.size); return (cx < 0 || cz < 0 || cx >= PISO.n || cz >= PISO.n) ? -1 : cz * PISO.n + cx; }
function pisoState(sch, cell, now) { const e = sch.byCell[cell]; if (!e) return 0; return now >= e.fall ? 2 : now >= e.warn ? 1 : 0; }
function pisoCellCenter(c) { return [(c % PISO.n + 0.5) * PISO.size - PISO.half, (Math.floor(c / PISO.n) + 0.5) * PISO.size - PISO.half]; }

// --- Lluvia de Monedas
const COIN = { R: 6.6, fall: 900, life: 4300 };
function coinSchedule(seed, dur) {
  const r = rngOf(seed), list = []; let t = 700, id = 0;
  while (t < dur - 1300) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (COIN.R - 0.6), q = r();
    list.push({ id: id++, t, x: Math.cos(a) * d, z: Math.sin(a) * d, kind: q < 0.13 ? 'bomb' : q < 0.25 ? 'big' : 'coin' });
    t += 240 + r() * 300; }
  return list;
}
const coinValue = c => c.kind === 'big' ? 3 : c.kind === 'coin' ? 1 : 0;
const coinAvail = (c, now) => now >= c.t + COIN.fall && now < c.t + COIN.fall + COIN.life;

// --- Salta la Barra
const BARRA = { R: 6.6, inner: 1.15, h: 0.55 };
const barAngle = ms => { const t = ms / 1000; return 1.25 * t + 0.052 * t * t; };
const barCount = ms => ms > 15000 ? 2 : 1;
function barHit(prevMs, nowMs, x, z, y) {
  if (nowMs < 2200) return false; // la barra empieza inofensiva
  const r = Math.hypot(x, z); if (r < BARRA.inner - 0.3 || r > BARRA.R + 0.3 || y > BARRA.h) return false;
  const pa = Math.atan2(z, x);
  for (let b = 0; b < barCount(nowMs); b++) {
    const d0 = wrap(barAngle(prevMs) + b * Math.PI - pa), d1 = wrap(barAngle(nowMs) + b * Math.PI - pa);
    if (d0 < 0 && d1 >= 0 && Math.abs(d1 - d0) < 1.5) return true;
  }
  return false;
}

// --- Avalancha
const BOLAS = { w: 5.4, zMin: -3, zMax: 5, start: -14, end: 10 };
function ballSchedule(seed, dur) {
  const r = rngOf(seed), list = []; let t = 1200, gap = 1100, id = 0;
  while (t < dur - 800) { const rad = 0.55 + r() * 0.75;
    list.push({ id: id++, t, x: (r() * 2 - 1) * (BOLAS.w - 0.3), r: rad, v: 6 + r() * 3 + t / 6000 });
    t += gap; gap = Math.max(330, gap * 0.94); }
  return list;
}
const ballZ = (b, now) => BOLAS.start + b.v * (now - b.t) / 1000;
function ballHit(list, now, x, z, y) {
  for (const b of list) { if (now < b.t) break; const bz = ballZ(b, now); if (bz > BOLAS.end) continue;
    if (Math.abs(bz - z) < b.r + 0.3 && Math.abs(b.x - x) < b.r + 0.28 && y < b.r * 1.6) return true; }
  return false;
}

// --- Carrera Loca
const RACE = { len: 40 };
const laneX = (i, n) => (i - (n - 1) / 2) * 1.9;

function spawnPos(type, i, n) {
  if (type === 'carrera') return [laneX(i, n), 0];
  if (type === 'bolas') return [n > 1 ? -4 + 8 * i / (n - 1) : 0, 3];
  const rad = type === 'barra' ? 4 : 2.6, a = i / n * Math.PI * 2 + 0.4;
  return [Math.cos(a) * rad, Math.sin(a) * rad];
}
function clampPos(type, x, z) {
  if (type === 'piso') return [Math.max(-PISO.half + 0.05, Math.min(PISO.half - 0.05, x)), Math.max(-PISO.half + 0.05, Math.min(PISO.half - 0.05, z))];
  if (type === 'monedas') { const d = Math.hypot(x, z); return d > COIN.R ? [x / d * COIN.R, z / d * COIN.R] : [x, z]; }
  if (type === 'barra') { const d = Math.hypot(x, z) || 0.001; const c = Math.max(BARRA.inner, Math.min(BARRA.R, d)); return [x / d * c, z / d * c]; }
  if (type === 'bolas') return [Math.max(-BOLAS.w, Math.min(BOLAS.w, x)), Math.max(BOLAS.zMin, Math.min(BOLAS.zMax, z))];
  return [x, z];
}
const raceMiss = dist => 100000 + Math.round(Math.max(0, RACE.len - dist) * 1000);

/* ======================= Bots (los mueve el anfitrión) ======================= */
const BOT_K = { facil: 0, normal: 1, dificil: 2 };
const host = {
  init(type, seed, players, dur) {
    const ctx = { type, seed, dur, bots: {}, now: 0 };
    if (type === 'piso') ctx.sch = pisoSchedule(seed, dur);
    if (type === 'monedas') ctx.coins = coinSchedule(seed, dur);
    if (type === 'bolas') ctx.balls = ballSchedule(seed, dur);
    const r = rngOf(seed ^ 0x5bd1e995);
    players.forEach((p, i) => {
      if (!p.bot) return;
      const k = BOT_K[p.lvl] ?? 1, [x, z] = spawnPos(type, i, players.length);
      const survive = r() < [0.15, 0.4, 0.7][k];
      ctx.bots[p.id] = { x, z, y: 0, ry: 0, st: 0, sc: 0, k, vy: 0, tx: x, tz: z, retarget: 0, v: 0,
        quitAt: survive ? Infinity : dur * (0.2 + r() * 0.72), stunUntil: 0, speedN: 0.85 + r() * 0.3, score: null, dist: 0 };
    });
    return ctx;
  },
  // Avanza la simulación de los bots. net = {taken, counts}. Devuelve puntajes decididos.
  step(ctx, dt, now, net) {
    const prev = ctx.now; ctx.now = now; const out = {};
    for (const [id, b] of Object.entries(ctx.bots)) {
      if (b.score != null) { // ya terminó: animación de caída
        if (b.st === 1) { b.y -= 9 * dt; }
        continue;
      }
      const alive = now < b.quitAt;
      const moveTo = (tx, tz, sp) => { const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { const m = Math.min(d, sp * dt); b.x += dx / d * m; b.z += dz / d * m; b.ry = Math.atan2(dx, dz); b.moving = true; } else b.moving = false;
        [b.x, b.z] = clampPos(ctx.type, b.x, b.z); };
      if (ctx.type === 'piso') {
        b.retarget -= dt;
        if (alive && (b.retarget <= 0 || pisoState(ctx.sch, pisoCellAt(b.tx, b.tz), now + 1300) > 0)) {
          b.retarget = 1 + Math.random() * 1.5; let best = null;
          for (let tries = 0; tries < 20; tries++) { const c = Math.floor(Math.random() * 64);
            if (pisoState(ctx.sch, c, now + 2600) === 0) { best = c; break; } }
          if (best != null) { [b.tx, b.tz] = pisoCellCenter(best); }
        }
        if (alive) moveTo(b.tx, b.tz, SPEED * 0.8);
        if (pisoState(ctx.sch, pisoCellAt(b.x, b.z), now) === 2) { b.st = 1; b.score = Math.round(now); out[id] = b.score; }
      } else if (ctx.type === 'monedas') {
        b.retarget -= dt;
        if (now > b.stunUntil) {
          if (b.retarget <= 0) { b.retarget = [0.7, 0.4, 0.15][b.k];
            let best = null, bd = 1e9;
            for (const c of ctx.coins) { if (c.kind === 'bomb' || net.taken[c.id] != null) continue;
              if (now < c.t + COIN.fall - 700 || now > c.t + COIN.fall + COIN.life - 300) continue;
              const d = Math.hypot(c.x - b.x, c.z - b.z) - coinValue(c) * 0.8; if (d < bd) { bd = d; best = c; } }
            if (best) { b.tx = best.x; b.tz = best.z; } else if (Math.random() < 0.3) { b.tx = (Math.random() * 2 - 1) * 4; b.tz = (Math.random() * 2 - 1) * 4; }
          }
          moveTo(b.tx, b.tz, SPEED * [0.62, 0.78, 0.92][b.k] * b.speedN);
          for (const c of ctx.coins) {
            if (c.kind === 'bomb') { if (now >= c.t + COIN.fall && prev < c.t + COIN.fall && Math.hypot(c.x - b.x, c.z - b.z) < 1.7) b.stunUntil = now + 1500; continue; }
            if (net.taken[c.id] == null && coinAvail(c, now) && Math.hypot(c.x - b.x, c.z - b.z) < 0.8) { net.taken[c.id] = id; net.counts[id] = (net.counts[id] || 0) + coinValue(c); }
          }
        } else b.moving = false;
        b.st = now < b.stunUntil ? 2 : 0; b.sc = net.counts[id] || 0;
      } else if (ctx.type === 'barra') {
        b.retarget -= dt;
        if (b.retarget <= 0) { b.retarget = 2 + Math.random() * 2; const a = Math.random() * 6.28, d = 2 + Math.random() * 3.5; b.tx = Math.cos(a) * d; b.tz = Math.sin(a) * d; }
        moveTo(b.tx, b.tz, SPEED * 0.45);
        // saltar cuando la barra se acerca
        if (alive && b.y <= 0) { const pa = Math.atan2(b.z, b.x);
          for (let k = 0; k < barCount(now); k++) { const ahead = wrap(pa - (barAngle(now) + k * Math.PI)); const speed = 1.25 + 0.104 * now / 1000;
            const eta = ahead / speed; if (ahead > 0 && eta > 0.1 && eta < 0.34) { b.vy = 7.4; break; } } }
        b.vy -= 24 * dt; b.y = Math.max(0, b.y + b.vy * dt); if (b.y === 0) b.vy = 0;
        if (barHit(prev, now, b.x, b.z, b.y)) { b.st = 1; b.score = Math.round(now); out[id] = b.score; b.vy = 9; b.fly = [Math.cos(barAngle(now) + Math.PI / 2), Math.sin(barAngle(now) + Math.PI / 2)]; }
      } else if (ctx.type === 'bolas') {
        if (alive) { // esquivar: busca un hueco en x
          let danger = null; for (const c of ctx.balls) { if (now < c.t) break; const bz = ballZ(c, now); if (bz > b.z + 1 || bz < b.z - 7) continue; if (Math.abs(c.x - b.x) < c.r + 0.9) { danger = c; break; } }
          if (danger) { const left = danger.x - danger.r - 0.8, right = danger.x + danger.r + 0.8; b.tx = (Math.abs(left - b.x) < Math.abs(right - b.x) && left > -BOLAS.w) || right > BOLAS.w ? left : right; }
          moveTo(b.tx, b.tz, SPEED * 0.9);
        } else b.moving = false;
        if (ballHit(ctx.balls, now, b.x, b.z, b.y)) { b.st = 1; b.score = Math.round(now); out[id] = b.score; }
      } else if (ctx.type === 'carrera') {
        const target = [2.5, 3.5, 4.5][b.k] * b.speedN; b.v += (target + Math.sin(now / 400 + b.speedN * 9) * 0.6 - b.v) * Math.min(1, dt * 2);
        b.dist += b.v * dt; b.z = -b.dist; b.moving = true; b.ry = Math.PI;
        if (b.dist >= RACE.len) { b.dist = RACE.len; b.z = -RACE.len; b.st = 3; b.moving = false; b.score = Math.round(now); out[id] = b.score; }
        b.sc = Math.round(b.dist);
      }
    }
    return out;
  },
  final(ctx, id, net) { // puntaje de un bot cuando se acaba el tiempo
    const b = ctx.bots[id]; if (!b) return null; if (b.score != null) return b.score;
    if (ctx.type === 'monedas') return net.counts[id] || 0;
    if (ctx.type === 'carrera') return raceMiss(b.dist);
    return ctx.dur;
  },
  pos(ctx) { const o = {}; for (const [id, b] of Object.entries(ctx.bots)) o[id] = [+b.x.toFixed(2), +b.z.toFixed(2), +b.y.toFixed(2), +b.ry.toFixed(2), b.st, b.sc, b.moving ? 1 : 0]; return o; },
};

/* ======================= Gráficos ======================= */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...o });
function mesh(geo, m, cast = true, recv = true) { const x = new THREE.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = recv; return x; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

let G = null; // partida en curso

function baseScene(sky, fogFar) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, fogFar * 0.6, fogFar);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(8, 18, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); sun.shadow.bias = -0.0008;
  scene.add(sun); return { scene, sun };
}

const BUILD = {
  piso(sc) {
    const { scene } = sc; const lavaM = new THREE.MeshStandardMaterial({ color: 0xff5a00, emissive: 0xff3300, emissiveIntensity: 1.3 });
    const lava = mesh(new THREE.PlaneGeometry(80, 80), lavaM, false, false); lava.rotation.x = -Math.PI / 2; lava.position.y = -5; scene.add(lava);
    scene.add(new THREE.PointLight(0xff6a00, 80, 30, 1.4)).position.set(0, -2, 0);
    sc.tiles = []; const cols = [0x74c0fc, 0xffd43b, 0x63e6be, 0xff8cc6];
    for (let c = 0; c < 64; c++) { const [x, z] = pisoCellCenter(c); const m = mat(cols[(c % 8 + Math.floor(c / 8)) % 4], { emissive: 0x000000 });
      const t = mesh(new THREE.BoxGeometry(PISO.size - 0.08, 0.6, PISO.size - 0.08), m); t.position.set(x, -0.3, z); scene.add(t); sc.tiles.push(t); }
    sc.sch = pisoSchedule(G.seed, G.dur);
    sc.update = (now, t) => sc.tiles.forEach((tile, c) => {
      const st = pisoState(sc.sch, c, now), e = sc.sch.byCell[c];
      if (st === 0) { tile.material.emissive.setHex(0); tile.position.y = -0.3; tile.visible = true; }
      else if (st === 1) { const on = Math.sin(t * 22) > 0; tile.material.emissive.setHex(on ? 0xff2200 : 0); tile.material.emissiveIntensity = 0.8; tile.position.y = -0.3 + (Math.random() - 0.5) * 0.05; }
      else { const f = (now - e.fall) / 1000; tile.position.y = -0.3 - 9 * f * f; tile.visible = f < 1.3; }
    });
    sc.cam = [0, 10.5, 8.2]; sc.look = [0, 0, 0.8];
  },
  monedas(sc) {
    const { scene } = sc;
    const ground = mesh(new THREE.CylinderGeometry(COIN.R + 0.6, COIN.R + 1, 0.6, 40), mat(0x69db7c, { flatShading: false })); ground.position.y = -0.3; scene.add(ground);
    const sea = mesh(new THREE.PlaneGeometry(100, 100), mat(0x4dabf7, { flatShading: false, roughness: 0.3 }), false); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.7; scene.add(sea);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const p = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), mat(0xffffff)); p.position.set(Math.cos(a) * (COIN.R + 0.45), 0.35, Math.sin(a) * (COIN.R + 0.45)); scene.add(p); }
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.7, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 0.35 });
    const coinG = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18), bombM = mat(0x222222, { flatShading: false, roughness: 0.3 });
    sc.coins = coinSchedule(G.seed, G.dur).map(c => {
      const g = new THREE.Group();
      if (c.kind === 'bomb') { g.add(mesh(new THREE.SphereGeometry(0.42, 14, 10), bombM)); const f = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), mat(0x8d6e63)); f.position.y = 0.5; g.add(f);
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa94d })); sp.position.y = 0.68; g.add(sp); }
      else { const m = mesh(coinG, gold); m.rotation.x = Math.PI / 2; g.add(m); if (c.kind === 'big') g.scale.setScalar(1.7); }
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(c.x, 0.02, c.z); scene.add(shadow);
      g.visible = false; shadow.visible = false; scene.add(g); return { ...c, g, shadow, boom: null };
    });
    const boomM = new THREE.MeshBasicMaterial({ color: 0xff922b, transparent: true, opacity: 0.8 });
    sc.update = (now, t) => sc.coins.forEach(c => {
      const land = c.t + COIN.fall, taken = G.taken[c.id] != null || G.localTaken.has(c.id);
      const active = now >= c.t && now < land + (c.kind === 'bomb' ? 0 : COIN.life) && !taken;
      c.g.visible = active; c.shadow.visible = active && now < land;
      if (active) { const f = Math.min(1, (now - c.t) / COIN.fall); c.g.position.set(c.x, 9 * (1 - f * f) + 0.45, c.z); c.g.rotation.y = t * 3;
        if (now >= land + COIN.life - 900) c.g.visible = Math.sin(t * 25) > 0; }
      if (c.kind === 'bomb' && now >= land && now < land + 450) {
        if (!c.boom) { c.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), boomM.clone()); c.boom.position.set(c.x, 0.3, c.z); scene.add(c.boom); }
        const k = (now - land) / 450; c.boom.scale.setScalar(0.3 + k * 1.6); c.boom.material.opacity = 0.85 * (1 - k);
      } else if (c.boom && now >= land + 450) { scene.remove(c.boom); c.boom = null; }
    });
    sc.cam = [0, 10.5, 8.4]; sc.look = [0, 0, 0.9];
  },
  barra(sc) {
    const { scene } = sc;
    const plat = mesh(new THREE.CylinderGeometry(BARRA.R + 0.5, BARRA.R + 0.2, 0.8, 40), mat(0xb197fc, { flatShading: false })); plat.position.y = -0.4; scene.add(plat);
    const ring = mesh(new THREE.TorusGeometry(BARRA.R + 0.5, 0.12, 6, 48), mat(0xffffff)); ring.rotation.x = Math.PI / 2; scene.add(ring);
    const pillar = mesh(new THREE.CylinderGeometry(0.9, 1, 1.3, 16), mat(0xffd43b)); pillar.position.y = 0.65; scene.add(pillar);
    const stripes = canvasTex(128, 16, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#e03131'; g.fillRect(i * 16, 0, 16, 16); } });
    const barM = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.4 });
    sc.bars = [0, 1].map(k => { const g = new THREE.Group(); const b = mesh(new THREE.CylinderGeometry(0.17, 0.17, BARRA.R + 0.3 - 0.9, 12), barM); b.rotation.z = Math.PI / 2;
      b.position.set(0.9 + (BARRA.R + 0.3 - 0.9) / 2, 0.32, 0); g.add(b); const tip = mesh(new THREE.SphereGeometry(0.25, 10, 8), mat(0xe03131)); tip.position.set(BARRA.R + 0.3, 0.32, 0); g.add(tip); scene.add(g); return g; });
    const water = mesh(new THREE.PlaneGeometry(100, 100), mat(0x3bc9db, { flatShading: false, roughness: 0.2 }), false); water.rotation.x = -Math.PI / 2; water.position.y = -1.4; scene.add(water);
    sc.update = (now) => sc.bars.forEach((g, k) => { g.visible = k < barCount(now) || (k === 1 && now > 13000 && Math.sin(now / 60) > 0); g.rotation.y = -(barAngle(now) + k * Math.PI); g.position.y = now < 2200 ? 1.6 - now / 2200 * 1.6 : 0; });
    sc.cam = [0, 9.5, 8.6]; sc.look = [0, 0, 0.9];
  },
  bolas(sc) {
    const { scene } = sc;
    const ground = mesh(new THREE.BoxGeometry(BOLAS.w * 2 + 1.2, 0.5, 30), mat(0xf1f3f5, { flatShading: false })); ground.position.set(0, -0.25, -2); scene.add(ground);
    [-1, 1].forEach(sd => { const w = mesh(new THREE.BoxGeometry(0.4, 0.8, 30), mat(0x74c0fc)); w.position.set(sd * (BOLAS.w + 0.6), 0.2, -2); scene.add(w);
      for (let i = 0; i < 7; i++) { const tr = new THREE.Group(); [0, 1, 2].forEach(j => { const c = mesh(new THREE.ConeGeometry(0.9 - j * 0.22, 1, 7), mat(0x2b8a3e)); c.position.y = 0.8 + j * 0.55; tr.add(c); });
        tr.position.set(sd * (BOLAS.w + 2 + (i % 2)), 0, 8 - i * 4); scene.add(tr); } });
    const line = mesh(new THREE.BoxGeometry(BOLAS.w * 2, 0.02, 0.15), new THREE.MeshBasicMaterial({ color: 0xff6b6b }), false); line.position.set(0, 0.01, BOLAS.zMin - 0.2); scene.add(line);
    const snowM = mat(0xffffff, { flatShading: true, roughness: 0.9 });
    sc.balls = ballSchedule(G.seed, G.dur).map(b => { const m = mesh(new THREE.IcosahedronGeometry(b.r, 1), snowM); m.visible = false; scene.add(m); return { ...b, m }; });
    sc.update = (now) => sc.balls.forEach(b => { const z = ballZ(b, now); b.m.visible = now >= b.t && z < BOLAS.end; if (b.m.visible) { b.m.position.set(b.x, b.r, z); b.m.rotation.x = z / b.r; } });
    sc.cam = [0, 7, 10.5]; sc.look = [0, 0, -2];
  },
  carrera(sc) {
    const { scene } = sc; const n = G.players.length;
    const width = n * 1.9 + 1.5;
    const ground = mesh(new THREE.BoxGeometry(width + 20, 0.4, 70), mat(0x8ce99a, { flatShading: false })); ground.position.set(0, -0.2, -20); scene.add(ground);
    G.players.forEach((p, i) => { const l = mesh(new THREE.BoxGeometry(1.6, 0.05, RACE.len + 6), mat(new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.45).getHex(), { flatShading: false }), false);
      l.position.set(laneX(i, n), 0.02, -RACE.len / 2 + 1); scene.add(l); });
    const checker = canvasTex(64, 16, (g) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#000' : '#fff'; g.fillRect(i * 4, j * 4, 4, 4); } });
    checker.magFilter = THREE.NearestFilter;
    const fin = mesh(new THREE.BoxGeometry(width, 0.06, 1), new THREE.MeshStandardMaterial({ map: checker }), false); fin.position.set(0, 0.04, -RACE.len); scene.add(fin);
    const arch = new THREE.Group(); [-1, 1].forEach(sd => { const p = mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 8), mat(0xffffff)); p.position.set(sd * width / 2, 1.6, 0); arch.add(p); });
    const banner = mesh(new THREE.BoxGeometry(width, 0.6, 0.1), new THREE.MeshStandardMaterial({ map: canvasTex(256, 32, (g) => { g.fillStyle = '#e03131'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#fff'; g.font = '900 24px sans-serif'; g.textAlign = 'center'; g.fillText('META', 128, 25); }) }));
    banner.position.y = 3.1; arch.add(banner); arch.position.z = -RACE.len; scene.add(arch);
    for (let i = 0; i < 14; i++) [-1, 1].forEach(sd => { const f = mesh(new THREE.ConeGeometry(0.3, 0.6, 4), mat([0xff6b6b, 0xffd43b, 0x4dabf7, 0xb197fc][i % 4])); f.position.set(sd * (width / 2 + 1.2), 0.3, 2 - i * 3.2); scene.add(f); });
    sc.update = () => {};
    sc.follow = true;
  },
};

function makeHud() {
  const d = document.createElement('div'); d.id = 'mgui';
  d.innerHTML = `<div class="mg-top"><div class="mg-title"></div><div class="bar"><div id="mgtb"></div></div><div class="mg-score"></div></div>
    <div class="mg-msg"></div><div class="mg-joy"><div class="mg-knob"></div></div><div class="mg-btns"></div>`;
  document.body.appendChild(d); return d;
}
const css = document.createElement('style');
css.textContent = `#mgui{position:fixed;inset:0;z-index:7;pointer-events:none;font-family:system-ui,sans-serif;color:#fff}
#mgui .mg-top{position:absolute;left:10px;right:10px;top:calc(env(safe-area-inset-top) + 8px);background:rgba(30,11,58,.8);border-radius:14px;padding:8px 12px;text-align:center}
#mgui .mg-title{font-weight:900;color:#fcc419}#mgui .mg-score{font-weight:800;margin-top:4px}
#mgui .bar{height:8px;background:#0006;border-radius:9px;overflow:hidden;margin-top:6px}#mgui .bar>div{height:100%;background:#fcc419}
#mgui .mg-msg{position:absolute;left:0;right:0;top:38%;text-align:center;font-size:2.4rem;font-weight:900;text-shadow:0 3px 0 #1e0b3a,0 0 12px #000}
#mgui .mg-joy{position:absolute;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.16);border:3px solid rgba(255,255,255,.4);display:none;transform:translate(-50%,-50%)}
#mgui .mg-knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;background:rgba(255,255,255,.8)}
#mgui .mg-btns{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 16px);display:flex;gap:12px;justify-content:flex-end;pointer-events:none}
#mgui .mg-btns button{pointer-events:auto;width:96px;height:96px;border-radius:50%;border:0;font:900 1.1rem system-ui;color:#1e0b3a;background:#fcc419;box-shadow:0 5px 0 #b8860b;touch-action:none}
#mgui .mg-btns.race{justify-content:space-between}#mgui .mg-btns.race button{width:44%;height:110px;border-radius:24px;font-size:2.2rem}
#mgui .mg-btns button.on{transform:translateY(4px);box-shadow:0 1px 0 #b8860b}
#mgui .hint{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 130px);text-align:center;font-weight:700;opacity:.85;text-shadow:0 2px 4px #000}`;
document.head.appendChild(css);

/* ---------- Ciclo de vida ---------- */
function prepare({ type, seed, players, myId, dur, key }) {
  if (G && G.key === key) return;
  stop();
  const B = window.Board3D; if (!B || !B.ok) return;
  G = { type, seed, players, myId, dur, key, started: false, chars: {}, taken: {}, counts: {}, localTaken: new Set(), net: {}, now: 0 };
  const sky = { piso: 0x2b0f3a, monedas: 0x9be3ff, barra: 0xa5d8ff, bolas: 0xc5dcf5, carrera: 0xa5e4ff }[type];
  const sc = baseScene(sky, type === 'carrera' ? 70 : 55); G.sc = sc;
  sc.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 200);
  BUILD[type](sc);
  players.forEach((p, i) => {
    const ch = B.spawnChar(p.emoji, p.color, p.id === myId ? 'Tú' : p.name);
    const [x, z] = spawnPos(type, i, players.length);
    ch.g.position.set(x, 0, z); ch.g.rotation.y = type === 'carrera' ? Math.PI : Math.atan2(-x, -z) + (type === 'bolas' ? 0 : 0);
    if (type === 'bolas') ch.g.rotation.y = Math.PI;
    ch.s = { x, z, y: 0, ry: ch.g.rotation.y, st: 0, sc: 0, mv: 0 };
    sc.scene.add(ch.g); G.chars[p.id] = ch;
  });
  const me = G.chars[myId]; G.me = me ? { ...me.s, vy: 0, v: 0, dist: 0, stunUntil: 0, last: null, outAt: 0 } : null;
  // cámara inicial
  placeCamera(0, true);
  B.setOverlay({ frame });
}
function start({ send, done }) {
  if (!G || G.started) return;
  G.started = true; G.t0 = performance.now(); G.send = send; G.done = done; G.finished = false; G.lastSent = 0;
  G.hud = makeHud(); G.input = { x: 0, z: 0, jump: false };
  const title = { piso: '🟨 Piso Traicionero', monedas: '🪙 Lluvia de Monedas', barra: '🌀 Salta la Barra', bolas: '⛄ Avalancha', carrera: '🏁 Carrera Loca' }[G.type];
  G.hud.querySelector('.mg-title').textContent = title;
  setupControls();
  flash('¡YA!', 700);
}
function stop() {
  if (!G) return;
  const B = window.Board3D; if (B && B.ok) B.setOverlay(null);
  if (G.hud) G.hud.remove();
  if (G.cleanup) G.cleanup();
  G.sc.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  G = null;
}
function net(msg) {
  if (!G || msg.key !== G.key) return;
  for (const [id, a] of Object.entries(msg.p || {})) if (id !== G.myId) G.net[id] = a;
  if (msg.taken) G.taken = msg.taken; if (msg.counts) G.counts = msg.counts;
}

/* ---------- Controles ---------- */
function setupControls() {
  const hud = G.hud, joy = hud.querySelector('.mg-joy'), knob = hud.querySelector('.mg-knob'), btns = hud.querySelector('.mg-btns');
  const cvs = window.Board3D.canvas; let jid = null, ox = 0, oy = 0;
  const listeners = [];
  const on = (el, ev, f, o) => { el.addEventListener(ev, f, o); listeners.push([el, ev, f, o]); };
  if (G.type === 'carrera') {
    btns.classList.add('race'); btns.innerHTML = '<button data-s="L">◀ IZQ</button><button data-s="R">DER ▶</button>';
    hud.insertAdjacentHTML('beforeend', '<div class="hint">¡Toca IZQ y DER alternando!</div>');
    btns.querySelectorAll('button').forEach(b => on(b, 'pointerdown', e => { e.preventDefault(); b.classList.add('on'); tapRace(b.dataset.s); setTimeout(() => b.classList.remove('on'), 90); }));
  } else {
    if (G.type === 'barra') { btns.innerHTML = '<button>SALTA</button>'; const b = btns.firstChild;
      on(b, 'pointerdown', e => { e.preventDefault(); G.input.jump = true; b.classList.add('on'); }); on(b, 'pointerup', () => b.classList.remove('on')); }
    hud.insertAdjacentHTML('beforeend', `<div class="hint">Arrastra el dedo para moverte${G.type === 'barra' ? ' · SALTA cuando pase la barra' : ''}</div>`);
    on(cvs, 'pointerdown', e => { if (jid != null) return; jid = e.pointerId; ox = e.clientX; oy = e.clientY; joy.style.display = 'block'; joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; knob.style.transform = ''; });
    on(window, 'pointermove', e => { if (e.pointerId !== jid) return; let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy), m = 55;
      if (d > m) { dx = dx / d * m; dy = dy / d * m; } knob.style.transform = `translate(${dx}px,${dy}px)`; G.input.x = dx / m; G.input.z = dy / m; });
    const end = e => { if (e.pointerId !== jid) return; jid = null; joy.style.display = 'none'; G.input.x = 0; G.input.z = 0; };
    on(window, 'pointerup', end); on(window, 'pointercancel', end);
  }
  const keys = {};
  on(window, 'keydown', e => { keys[e.key] = true; if (e.key === ' ') G.input.jump = true; if (G.type === 'carrera' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.repeat) tapRace(e.key === 'ArrowLeft' ? 'L' : 'R'); });
  on(window, 'keyup', e => { keys[e.key] = false; });
  G.keys = keys;
  G.cleanup = () => listeners.forEach(([el, ev, f, o]) => el.removeEventListener(ev, f, o));
}
function tapRace(side) {
  const m = G.me; if (!m || m.st === 3 || G.finished) return;
  if (m.last !== side) { m.v = Math.min(8.5, m.v + 1.05); } else { m.v *= 0.55; }
  m.last = side;
}
function flash(text, ms) { if (!G || !G.hud) return; const el = G.hud.querySelector('.mg-msg'); el.textContent = text; clearTimeout(G.flashT); if (ms) G.flashT = setTimeout(() => { if (G && G.hud) el.textContent = ''; }, ms); }

/* ---------- Bucle de cada cuadro ---------- */
function finishMe(score, msg) {
  if (G.finished) return; G.finished = true; const d = G.done; setTimeout(() => d(score), 0); if (msg) flash(msg);
}
function frame(dt, t) {
  if (!G) return null;
  const sc = G.sc, now = G.started ? performance.now() - G.t0 : 0, prev = G.now; G.now = now;
  const m = G.me, myCh = G.chars[G.myId];
  if (G.started && m) {
    // --- entrada
    let ix = G.input.x, iz = G.input.z; const k = G.keys || {};
    if (k.ArrowLeft || k.a) ix -= 1; if (k.ArrowRight || k.d) ix += 1; if (k.ArrowUp || k.w) iz -= 1; if (k.ArrowDown || k.s) iz += 1;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const canMove = m.st === 0 && now < G.dur && now > m.stunUntil;
    if (G.type !== 'carrera') {
      if (canMove && il > 0.12) { m.x += ix * SPEED * dt; m.z += iz * SPEED * dt; m.ry = Math.atan2(ix, iz); m.mv = 1; } else m.mv = 0;
      if (m.st === 0) [m.x, m.z] = clampPos(G.type, m.x, m.z);
    }
    // --- reglas de cada juego
    if (G.type === 'piso') {
      if (m.st === 0 && pisoState(sc.sch, pisoCellAt(m.x, m.z), now) === 2) { m.st = 1; finishMe(Math.round(now), '¡Te caíste!'); }
      if (m.st === 1) m.y -= 9 * dt * (1 + (-m.y) * 0.5);
    } else if (G.type === 'monedas') {
      if (canMove) for (const c of sc.coins) {
        if (c.kind === 'bomb') continue;
        if (G.taken[c.id] == null && !G.localTaken.has(c.id) && coinAvail(c, now) && Math.hypot(c.x - m.x, c.z - m.z) < 0.8) { G.localTaken.add(c.id); G.send({ t: 'mggrab', key: G.key, id: c.id }); }
      }
      for (const c of sc.coins) if (c.kind === 'bomb' && now >= c.t + COIN.fall && prev < c.t + COIN.fall && Math.hypot(c.x - m.x, c.z - m.z) < 1.7) { m.stunUntil = now + 1500; flash('💥 ¡Aturdido!', 1200); }
      m.st = now < m.stunUntil ? 2 : 0; m.sc = G.counts[G.myId] || 0;
    } else if (G.type === 'barra') {
      if (G.input.jump && m.st === 0 && m.y <= 0) m.vy = 7.4; G.input.jump = false;
      if (m.st === 0) { m.vy -= 24 * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y === 0) m.vy = 0;
        if (barHit(prev, now, m.x, m.z, m.y)) { m.st = 1; m.vy = 9; m.fly = [Math.cos(barAngle(now) + Math.PI / 2), Math.sin(barAngle(now) + Math.PI / 2)]; finishMe(Math.round(now), '¡Fuera!'); } }
      else { m.vy -= 20 * dt; m.y += m.vy * dt; m.x += m.fly[0] * 9 * dt; m.z += m.fly[1] * 9 * dt; }
    } else if (G.type === 'bolas') {
      if (m.st === 0 && ballHit(sc.balls, now, m.x, m.z, m.y)) { m.st = 1; finishMe(Math.round(now), '¡Aplastado!'); }
    } else if (G.type === 'carrera') {
      if (m.st !== 3) { m.v *= Math.exp(-dt * 1.5); m.dist += m.v * dt; m.z = -m.dist; m.mv = m.v > 0.4 ? 1 : 0; m.ry = Math.PI; m.sc = Math.round(m.dist);
        if (m.dist >= RACE.len && !G.finished) { m.dist = RACE.len; m.z = -RACE.len; m.st = 3; m.mv = 0; finishMe(Math.round(now), '¡Llegaste!'); } }
    }
    // --- fin del tiempo
    if (now >= G.dur && !G.finished) {
      const v = G.type === 'monedas' ? (G.counts[G.myId] || 0) : G.type === 'carrera' ? raceMiss(m.dist) : G.dur;
      finishMe(v, G.type === 'monedas' || G.type === 'carrera' ? '¡Tiempo!' : '¡Sobreviviste!');
    }
    // --- enviar mi posición
    if (now - G.lastSent > 95) { G.lastSent = now; G.send({ t: 'mgpos', key: G.key, a: [+m.x.toFixed(2), +m.z.toFixed(2), +m.y.toFixed(2), +m.ry.toFixed(2), m.st, m.sc, m.mv] }); }
    // --- HUD
    const tb = document.getElementById('mgtb'); if (tb) tb.style.width = Math.max(0, 100 - now / G.dur * 100) + '%';
    const sEl = G.hud.querySelector('.mg-score');
    if (G.type === 'monedas') { const best = Math.max(0, ...Object.values(G.counts)); sEl.textContent = `Tus monedas: ${G.counts[G.myId] || 0} · Líder: ${best}`; }
    else if (G.type === 'carrera') sEl.textContent = `${Math.round(m.dist)} / ${RACE.len} m`;
    else { const alive = G.players.filter(p => (p.id === G.myId ? m.st : (G.net[p.id] || [])[4]) !== 1).length; sEl.textContent = `Quedan en pie: ${alive} / ${G.players.length}`; }
  }
  // --- dibujar personajes
  sc.update(now, t);
  G.players.forEach(p => {
    const ch = G.chars[p.id]; if (!ch) return;
    let x, z, y, ry, st, mv;
    if (p.id === G.myId && m) { ({ x, z, y, ry, st } = m); mv = m.mv; ch.g.position.set(x, y, z); }
    else { const a = G.net[p.id]; if (a) { [x, z, y, ry, st, , mv] = a; const kk = 1 - Math.exp(-dt * 12); ch.g.position.x += (x - ch.g.position.x) * kk; ch.g.position.z += (z - ch.g.position.z) * kk; ch.g.position.y += (y - ch.g.position.y) * kk; }
      else { st = 0; mv = 0; ry = ch.g.rotation.y; } }
    let d = wrap(ry - ch.g.rotation.y); ch.g.rotation.y += d * Math.min(1, dt * 14);
    ch.setWalking(!!mv); ch.update(dt);
    const cs = G.type === 'carrera' ? 1 : 1.3;
    if (st === 1 && G.type === 'bolas') { ch.g.scale.set(cs * 1.3, cs * 0.15, cs * 1.3); } else ch.g.scale.setScalar(cs);
    if (st === 2) ch.g.rotation.y += dt * 12; // aturdido: da vueltas
    ch.g.visible = !(st === 1 && ch.g.position.y < -6);
    if (ch.label) ch.label.material.opacity = st === 1 ? 0.35 : 1;
  });
  placeCamera(dt, false);
  return [sc.scene, sc.camera];
}
function placeCamera(dt, snap) {
  const sc = G.sc, cam = sc.camera, asp = innerWidth / innerHeight;
  if (cam.aspect !== asp) { cam.aspect = asp; cam.fov = asp < 1 ? 58 : 46; cam.updateProjectionMatrix(); }
  let px, py, pz, lx, ly, lz;
  if (sc.follow) {
    const me = G.chars[G.myId]; const z = me ? me.g.position.z : 0, x = me ? me.g.position.x : 0;
    px = x + 1.1; py = 4.3; pz = z + 6.8; lx = x - 0.2; ly = 0.8; lz = z - 5;
  } else {
    const fit = Math.min(1.7, Math.max(1, 0.6 / asp));
    const me = G.chars[G.myId], alive = G.me && G.me.st !== 1;
    const mx = me && alive ? me.g.position.x : 0, mz = me && alive ? me.g.position.z : 0;
    const fx = { piso: 0.6, monedas: 0.6, barra: 0.5, bolas: 0.85 }[G.type] || 0.5;
    px = sc.cam[0] + mx * fx; py = sc.cam[1] * fit; pz = sc.cam[2] * fit + mz * 0.35; lx = sc.look[0] + mx * fx; ly = sc.look[1]; lz = sc.look[2] + mz * 0.35;
  }
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  cam.position.x += (px - cam.position.x) * k; cam.position.y += (py - cam.position.y) * k; cam.position.z += (pz - cam.position.z) * k;
  G.lookAt = G.lookAt || new THREE.Vector3(lx, ly, lz); G.lookAt.x += (lx - G.lookAt.x) * k; G.lookAt.y += (ly - G.lookAt.y) * k; G.lookAt.z += (lz - G.lookAt.z) * k;
  cam.lookAt(G.lookAt);
}

window.MG3D = {
  types: ['piso', 'monedas', 'barra', 'bolas', 'carrera'],
  prepare, start, stop, net, host,
  get ok() { return !!(window.Board3D && window.Board3D.ok); },
};
window.dispatchEvent(new Event('mg3d-ready'));
