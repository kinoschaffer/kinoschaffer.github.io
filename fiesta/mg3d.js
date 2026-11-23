// Minijuegos 3D de Fiesta Tablero (dibujo y controles). Las reglas están en minigames.js (window.MGL).
// Cada celular simula su propio personaje; el anfitrión reparte posiciones, decide lo compartido y mueve a los bots.
import * as THREE from 'three';
const L = window.MGL;
const X = n => window.SFX && window.SFX.play(n);

/* ======================= Utilidades de dibujo ======================= */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...o });
const glow = (color, i = 0.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.4 });
function mesh(geo, m, cast = true, recv = true) { const x = new THREE.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = recv; return x; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function sprite(text, color = '#fff', h = 0.8) { return window.Board3D.textSprite(text, { color, h }); }
const TEAM_COL = { A: '#339af0', B: '#f03e3e' };
const PAL = {
  grass: { sky: 0x9be3ff, ground: 0x69db7c, rim: 0xffffff, under: 0x4dabf7 },
  ice: { sky: 0xc5dcf5, ground: 0xe7f5ff, rim: 0x74c0fc, under: 0x1c7ed6 },
  lava: { sky: 0x2b0f3a, ground: 0x5c5f66, rim: 0xff922b, under: 0xff5a00, hot: true },
  space: { sky: 0x0b0b2b, ground: 0x7048e8, rim: 0xffd43b, under: 0x0b0b2b, stars: true },
  night: { sky: 0x101a3a, ground: 0x2f9e44, rim: 0xffe066, under: 0x0b1a3a, stars: true },
  beach: { sky: 0x99e9f2, ground: 0xffe8a1, rim: 0xffffff, under: 0x22b8cf },
  candy: { sky: 0xffd6ec, ground: 0xffa8d2, rim: 0xffffff, under: 0x9c5c34 },
};
const PLAYER_COLS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#b197fc', '#ff922b'];

let G = null; // partida en curso

function baseScene(sky, fogFar = 60) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, fogFar * 0.6, fogFar);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(8, 18, 10); sun.castShadow = !(window.Board3D && window.Board3D.low);
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); sun.shadow.bias = -0.0008;
  scene.add(sun); return { scene, sun };
}
function addUnder(sc, pal) {
  const m = pal.hot ? glow(pal.under, 1.2) : mat(pal.under, { flatShading: false, roughness: 0.3 });
  const u = mesh(new THREE.PlaneGeometry(120, 120), m, false, false); u.rotation.x = -Math.PI / 2; u.position.y = pal.hot ? -5 : -0.9; sc.scene.add(u);
  if (pal.hot) sc.scene.add(new THREE.PointLight(0xff6a00, 80, 30, 1.4)).position.set(0, -2, 0);
  if (pal.stars) { const n = 400, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.2, d = 60; pos[i * 3] = Math.cos(a) * Math.cos(e) * d; pos[i * 3 + 1] = Math.sin(e) * d; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sc.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35 }))); }
}
function arenaCircle(sc, R, pal) {
  addUnder(sc, pal);
  const g = mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.9, 0.6, 48), mat(pal.ground, { flatShading: false })); g.position.y = -0.3; sc.scene.add(g);
  const rim = mesh(new THREE.TorusGeometry(R + 0.6, 0.12, 6, 64), mat(pal.rim)); rim.rotation.x = Math.PI / 2; sc.scene.add(rim);
}
function arenaRect(sc, w, d, pal, z0 = 0) {
  addUnder(sc, pal);
  const g = mesh(new THREE.BoxGeometry(w * 2 + 1.2, 0.6, d), mat(pal.ground, { flatShading: false })); g.position.set(0, -0.3, z0); sc.scene.add(g);
}
const sceneOf = p => PAL[p.scene] || PAL.grass;

/* ======================= Mecánicas (cliente) ======================= */
// Cada mecánica: build(sc) arma la escena; ctrl = tipo de control; tick(dt, now, m, prev) reglas del propio jugador;
// draw(now, t) anima la escena; hud() texto de arriba; final() puntaje si se acaba el tiempo.
const K = {};
const ARENA_CAM = { cam: [0, 10.5, 8.4], look: [0, 0, 0.9] };
function dashBtn() { return ['💥 EMPUJÓN', () => { const m = G.me; if (!m || m.st === 1 || G.now < (m.dashReady || 0)) return; m.dashReady = G.now + L.PUSH.cool;
  const a = m.ry || 0; m.vx += Math.sin(a) * L.PUSH.dash; m.vz += Math.cos(a) * L.PUSH.dash; G.send({ t: 'mgact', key: G.key, dash: 1 }); X('jump'); }]; }
function aliveHud() { const n = G.players.filter(p => stOf(p.id) !== 1).length; return `Quedan en pie: ${n} / ${G.players.length}`; }

// ---------- Piso que se cae
K.piso = {
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { const pal = sceneOf(G.p); addUnder(sc, pal.hot ? pal : { ...pal, hot: true, under: 0xff5a00 });
    sc.tiles = []; const cols = G.p.ice ? [0xd0ebff, 0xa5d8ff, 0xe7f5ff, 0x99e9f2] : [0x74c0fc, 0xffd43b, 0x63e6be, 0xff8cc6];
    for (let c = 0; c < 64; c++) { const [x, z] = L.pisoCenter(c); const par = (c % 8 + Math.floor(c / 8));
      const t = mesh(new THREE.BoxGeometry(L.PISO.size - 0.08, 0.6, L.PISO.size - 0.08), mat(cols[G.p.order === 'checker' ? (par % 2) * 2 : par % 4])); t.position.set(x, -0.3, z); sc.scene.add(t); sc.tiles.push(t); }
    sc.sch = L.pisoSchedule(G.seed, G.dur, G.p); },
  tick(dt, now, m) { if (m.st === 0 && L.pisoState(G.sc.sch, L.pisoCellAt(m.x, m.z), now) === 2) out('¡Te caíste!'); if (m.st === 1) m.y -= 9 * dt * (1 - m.y * 0.4); },
  draw(now, t) { const sc = G.sc; sc.tiles.forEach((tile, c) => { const st = L.pisoState(sc.sch, c, now), e = sc.sch.byCell[c];
    if (st === 0) { tile.material.emissive.setHex(0); tile.position.y = -0.3; tile.visible = true; }
    else if (st === 1) { tile.material.emissive.setHex(Math.sin(t * 22) > 0 ? 0xff2200 : 0); tile.material.emissiveIntensity = 0.8; tile.position.y = -0.3 + (Math.random() - 0.5) * 0.05; }
    else { const f = (now - e.fall) / 1000; tile.position.y = -0.3 - 9 * f * f; tile.visible = f < 1.3; } }); },
  hud: aliveHud,
};

// ---------- Recolectar
function boom(c, now, at, r = 1.6) {
  if (now >= at && now < at + 450) { if (!c.boom) { c.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff922b, transparent: true, opacity: 0.8 })); c.boom.position.set(c.x, 0.3, c.z); G.sc.scene.add(c.boom); }
    const k = (now - at) / 450; c.boom.scale.setScalar(0.3 + k * r); c.boom.material.opacity = 0.85 * (1 - k); }
  else if (c.boom && now >= at + 450) { G.sc.scene.remove(c.boom); c.boom = null; }
}
K.monedas = {
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { arenaCircle(sc, L.COIN.R, sceneOf(G.p)); const it = G.p.item || 'coin';
    if (G.p.edge) { sc.scene.children.filter(o => o.geometry && o.geometry.type === 'TorusGeometry').forEach(o => o.visible = false); sc.isle = sc.scene.children.find(o => o.geometry && o.geometry.type === 'CylinderGeometry'); }
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.7, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 0.35 });
    const geos = { coin: new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18), fruit: new THREE.SphereGeometry(0.34, 12, 9), gem: new THREE.OctahedronGeometry(0.38, 0), star: new THREE.IcosahedronGeometry(0.34, 0) };
    const fruitCols = [0xff6b6b, 0xffa94d, 0xffd43b, 0xb197fc];
    sc.coins = L.coinSchedule(G.seed, G.dur, G.p).map((c, i) => {
      const g = new THREE.Group();
      if (c.kind === 'bomb') { g.add(mesh(new THREE.SphereGeometry(0.42, 14, 10), mat(0x222222, { flatShading: false, roughness: 0.3 }))); const sp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa94d })); sp.position.y = 0.55; g.add(sp); }
      else { const m = it === 'coin' ? gold : it === 'fruit' ? mat(c.kind === 'big' ? 0x2f9e44 : fruitCols[i % 4]) : it === 'gem' ? glow([0x4dabf7, 0xe64980, 0x51cf66, 0xfcc419][i % 4], 0.5) : glow(0xffe066, 1);
        const x = it === 'coin' ? coinObj(0.8) : mesh(geos[it], m); g.add(x); if (c.kind === 'big') g.scale.setScalar(1.7); }
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.25, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(c.x, 0.02, c.z); sc.scene.add(sh);
      g.visible = false; sh.visible = false; sc.scene.add(g); return { ...c, g, sh, boom: null }; });
    sc.life = G.p.life || L.COIN.life; },
  tick(dt, now, m, prev) {
    if (G.p.edge) { if (m.fellAt) { m.y -= dt * 9; if (now > m.fellAt + 1600) { m.fellAt = 0; m.x = 0; m.z = 0; m.y = 0; m.st = 0; m.vx = m.vz = 0; } return; }
      if (L.fellOff('monedas', G.p, now, m.x, m.z)) { m.fellAt = now; m.st = 1; X('lose'); flash('🌊 ¡Al agua! −3', 1200); G.send({ t: 'mgact', key: G.key, fell: true }); return; } }
    if (m.st !== 2) for (const c of G.sc.coins) { if (c.kind === 'bomb') continue;
      if (G.taken[c.id] == null && !G.localTaken.has(c.id) && now >= c.t + L.COIN.fall && now < c.t + L.COIN.fall + G.sc.life && Math.hypot(c.x - m.x, c.z - m.z) < 0.8) { G.localTaken.add(c.id); G.send({ t: 'mggrab', key: G.key, id: c.id }); X('coin'); } }
    for (const c of G.sc.coins) if (c.kind === 'bomb' && now >= c.t + L.COIN.fall && prev < c.t + L.COIN.fall && Math.hypot(c.x - m.x, c.z - m.z) < 1.7) { m.stunUntil = now + 1500; flash('💥 ¡Aturdido!', 1200); X('boom'); }
    m.st = now < m.stunUntil ? 2 : 0; m.sc = G.counts[G.myId] || 0;
  },
  draw(now, t) { if (G.sc.isle) { const r = (L.coinR(G.p, now) + 0.6) / (L.COIN.R + 0.6); G.sc.isle.scale.set(r, 1, r); }
    G.sc.coins.forEach(c => { const land = c.t + L.COIN.fall, taken = G.taken[c.id] != null || G.localTaken.has(c.id);
    const act = now >= c.t && now < land + (c.kind === 'bomb' ? 0 : G.sc.life) && !taken; c.g.visible = act; c.sh.visible = act && now < land;
    if (act) { const f = Math.min(1, (now - c.t) / L.COIN.fall); c.g.position.set(c.x, 9 * (1 - f * f) + 0.45, c.z); c.g.rotation.y = t * 3; if (now >= land + G.sc.life - 900) c.g.visible = Math.sin(t * 25) > 0; }
    if (c.kind === 'bomb') boom(c, now, land); }); },
  hud() { const best = Math.max(0, ...Object.values(G.counts)); return `Tus puntos: ${G.counts[G.myId] || 0} · Líder: ${best}`; },
  final: () => G.counts[G.myId] || 0,
};

// ---------- Saltar la barra
K.barra = {
  ctrl: 'joyjump', cam: [0, 9.5, 8.6], look: [0, 0, 0.9],
  extra() { return G.p.duck ? [['🙇 AGACHA', () => { if (G.me) G.me.duckUntil = G.now + 600; }]] : []; },
  build(sc) { addUnder(sc, G.p.scene === 'space' ? PAL.space : PAL.beach);
    const plat = mesh(new THREE.CylinderGeometry(L.BARRA.R + 0.5, L.BARRA.R + 0.2, 0.8, 40), mat(0xb197fc, { flatShading: false })); plat.position.y = -0.4; sc.scene.add(plat);
    const pillar = mesh(new THREE.CylinderGeometry(0.9, 1, 1.3, 16), mat(0xffd43b)); pillar.position.y = 0.65; sc.scene.add(pillar);
    const stripes = canvasTex(128, 16, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#e03131'; g.fillRect(i * 16, 0, 16, 16); } });
    const barM = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.4 }), len = L.BARRA.R + 0.3 - 0.9;
    sc.bars = [0, 1, 2].map(() => { const g = new THREE.Group(); const b = mesh(new THREE.CylinderGeometry(0.17, 0.17, len, 12), barM); b.rotation.z = Math.PI / 2; b.position.set(0.9 + len / 2, 0.32, 0); g.add(b);
      const tip = mesh(new THREE.SphereGeometry(0.25, 10, 8), mat(0xe03131)); tip.position.set(L.BARRA.R + 0.3, 0.32, 0); g.add(tip); sc.scene.add(g); return g; }); },
  tick(dt, now, m, prev) {
    if (G.input.jump && m.st === 0 && m.y <= 0) { m.vy = L.jumpV(G.p); X('jump'); } G.input.jump = false;
    if (m.st === 0) { m.vy -= L.gravity(G.p) * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y === 0) m.vy = 0;
      if (m.duckUntil > now) m.mv = 2;
      if (L.barHit(prev, now, m.x, m.z, m.y, G.p, m.duckUntil > now)) { m.vy = 9; const a = L.barAngle(now, G.p) + Math.PI / 2; m.fly = [Math.cos(a), Math.sin(a)]; out('¡Fuera!'); } }
    else { m.vy -= 20 * dt; m.y += m.vy * dt; m.x += m.fly[0] * 9 * dt; m.z += m.fly[1] * 9 * dt; }
  },
  draw(now) { const n = L.barCount(now, G.p); G.sc.bars.forEach((g, k) => { g.visible = k < n; g.rotation.y = -(L.barAngle(now, G.p) + k * Math.PI * 2 / n); g.position.y = (now < 2200 ? 1.6 - now / 2200 * 1.6 : 0) + (L.barHigh(G.p, k) ? 1.0 : 0);
    if (L.barHigh(G.p, k) && !g.userData.tinted) { g.userData.tinted = true; g.traverse(o => { if (o.material && o.material.map) { o.material = o.material.clone(); o.material.color.setHex(0x74c0fc); } }); } }); },
  hud: aliveHud,
};

// ---------- Esquivar lo que rueda
K.bolas = {
  get ctrl() { return G && G.p.jump ? 'joyjump' : 'joy'; }, cam: [0, 7, 10.5], look: [0, 0, -2],
  build(sc) { arenaRect(sc, L.BOLAS.w, 30, sceneOf(G.p), -2);
    const m = G.p.obj === 'barrel' ? mat(0x8d5524) : G.p.obj === 'log' ? mat(0x7a4f2a) : G.p.obj === 'rock' ? mat(0x5c5f66) : mat(0xffffff, { roughness: 0.9 });
    sc.balls = L.ballSchedule(G.seed, G.dur, G.p).map(b => {
      const geo = G.p.obj === 'log' ? new THREE.CylinderGeometry(b.r, b.r, b.len, 10) : G.p.obj === 'barrel' ? new THREE.CylinderGeometry(b.r, b.r, b.r * 1.6, 12) : new THREE.IcosahedronGeometry(b.r, 1);
      const x = mesh(geo, m); if (G.p.obj === 'log' || G.p.obj === 'barrel') x.rotation.z = Math.PI / 2; const g = new THREE.Group(); g.add(x); if (G.p.side) g.rotation.y = Math.PI / 2;
      g.visible = false; sc.scene.add(g); return { ...b, g, x }; }); },
  tick(dt, now, m) {
    if (G.p.jump) { if (G.input.jump && m.st === 0 && m.y <= 0) { m.vy = 7.4; X('jump'); } G.input.jump = false; m.vy -= 24 * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y === 0) m.vy = 0; }
    if (m.st === 0 && L.ballHit(G.sc.balls, now, m.x, m.z, m.y, G.p)) out('¡Aplastado!');
  },
  draw(now) { G.sc.balls.forEach(b => { const [x, z] = L.ballPos(b, now, G.p); b.g.visible = now >= b.t && Math.abs(x) < 12 && z < 10;
    if (b.g.visible) { b.g.position.set(x, b.r, z); if (G.p.obj === 'log' || G.p.obj === 'barrel') b.g.rotation.x = (G.p.side ? x : z) / b.r; else b.x.rotation.x = (G.p.side ? x : z) / b.r; } }); },
  hud: aliveHud,
};

// ---------- Cosas que caen del cielo
K.meteoros = {
  hearts: (id, sc) => [sc, 3],
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { arenaCircle(sc, 6.5, sceneOf(G.p));
    const m = G.p.big ? mat(0x495057, { metalness: 0.6 }) : G.p.fast ? mat(0xd0ebff) : glow(0xff6b00, 0.9);
    sc.mets = L.meteorSchedule(G.seed, G.dur, G.p).map(x => { const o = mesh(G.p.big ? new THREE.BoxGeometry(x.rad, x.rad * 0.6, x.rad * 0.7) : new THREE.DodecahedronGeometry(x.rad * 0.55, 0), m);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(x.rad, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(x.x, 0.03, x.z);
      o.visible = sh.visible = false; sc.scene.add(o, sh); return { ...x, o, sh, boom: null }; });
    if (G.me) G.me.lives = 3; },
  tick(dt, now, m, prev) { if (m.st === 1) return;
    for (const x of G.sc.mets) { const land = x.t + x.fall; if (land > now) break; if (land <= prev) continue;
      if (Math.hypot(x.x - m.x, x.z - m.z) < x.rad) { m.lives--; X('boom'); flash(m.lives > 0 ? `💥 ¡Te dio! Vidas: ${m.lives}` : '💥 ¡Fuera!', 900); m.stunUntil = now + 600; if (m.lives <= 0) { out(); return; } } }
    m.st = now < m.stunUntil ? 2 : 0; m.sc = m.lives; },
  draw(now, t) { G.sc.mets.forEach(x => { const land = x.t + x.fall, act = now >= x.t && now < land; x.o.visible = act; x.sh.visible = act;
    if (act) { const f = (now - x.t) / x.fall; x.o.position.set(x.x, 14 * (1 - f), x.z); x.o.rotation.x = t * 3; x.sh.scale.setScalar(0.3 + f * 0.7); } boom(x, now, land, x.rad * 1.4); }); },
  hud() { return `❤️ ${G.me ? Math.max(0, G.me.lives) : 0} · ` + aliveHud(); },
};

// ---------- Carreras tocando
K.carrera = {
  get ctrl() { return G && G.p.mode === 'mash' ? 'mash' : 'tap2'; }, follow: true,
  build(sc) { const n = G.players.length, width = n * 1.9 + 1.5, len = G.p.len || 40, water = G.p.look === 'water', space = G.p.look === 'space';
    if (space) addUnder(sc, PAL.space);
    const ground = mesh(new THREE.BoxGeometry(width + 20, 0.4, len + 30), mat(water ? 0x1c7ed6 : space ? 0x3b1f7a : 0x8ce99a, { flatShading: false })); ground.position.set(0, -0.2, -len / 2); sc.scene.add(ground);
    G.players.forEach((p, i) => { const l = mesh(new THREE.BoxGeometry(1.6, 0.05, len + 6), mat(water ? 0x74c0fc : new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.45).getHex(), { flatShading: false }), false);
      l.position.set((i - (n - 1) / 2) * 1.9, 0.02, -len / 2 + 1); sc.scene.add(l); });
    const fin = mesh(new THREE.BoxGeometry(width, 0.06, 1), new THREE.MeshStandardMaterial({ map: canvasTex(64, 16, g => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#000' : '#fff'; g.fillRect(i * 4, j * 4, 4, 4); } }) }), false);
    fin.position.set(0, 0.04, -len); sc.scene.add(fin);
    const arch = new THREE.Group(); [-1, 1].forEach(sd => { const p = mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 8), mat(0xffffff)); p.position.set(sd * width / 2, 1.6, 0); arch.add(p); });
    const ban = sprite('🏁 META', '#fff', 0.9); ban.position.y = 3.3; arch.add(ban); arch.position.z = -len; sc.scene.add(arch);
    if (G.p.mode === 'light') { sc.light = mesh(new THREE.SphereGeometry(0.6, 16, 12), glow(0x51cf66, 1.2)); sc.light.position.set(width / 2 + 1, 3, -6); sc.scene.add(sc.light);
      const r = L.rngOf(G.seed), lights = []; let t = 0, green = true; while (t < G.dur) { const d = green ? 1800 + r() * 2200 : 900 + r() * 1300; lights.push([t, t + d, green]); t += d; green = !green; } sc.lights = lights; }
    sc.len = len; },
  isGreen(now) { const l = G.sc.lights.find(([a, b]) => now >= a && now < b); return l ? l[2] : true; },
  tap(side) { const m = G.me; if (!m || m.st === 3 || G.finished || G.now < m.stunUntil) return; const mode = G.p.mode;
    if (mode === 'light' && !K.carrera.isGreen(G.now)) { m.v = 0; m.dist = Math.max(0, m.dist - 2); m.stunUntil = G.now + 700; flash('🔴 ¡En rojo no!', 700); return; }
    if (mode === 'mash') { m.v = Math.min(8.5, m.v + 0.55); return; }
    if (m.last !== side) m.v = Math.min(8.5, m.v + 1.05); else if (G.p.strict) { m.v = 0; m.stunUntil = G.now + 800; flash('🥔 ¡Te caíste!', 700); } else m.v *= 0.55;
    m.last = side; },
  tick(dt, now, m) { if (m.st === 3) return; m.v *= Math.exp(-dt * 1.5); m.dist += m.v * dt; m.z = -m.dist; m.mv = m.v > 0.4 ? 1 : 0; m.ry = Math.PI; m.sc = Math.round(m.dist);
    if (m.dist >= G.sc.len) { m.dist = G.sc.len; m.z = -G.sc.len; m.st = 3; m.mv = 0; done(Math.round(now), '¡Llegaste!'); } },
  draw(now) { const l = G.sc.light; if (l) { const c = K.carrera.isGreen(now) ? 0x51cf66 : 0xff2222; l.material.color.setHex(c); l.material.emissive.setHex(c); l.position.z = (G.me ? G.me.z : 0) - 6; } },
  hud() { return `${G.me ? Math.round(G.me.dist) : 0} / ${G.sc.len} m` + (G.sc.lights ? (K.carrera.isGreen(G.now) ? ' · 🟢 ¡AVANZA!' : ' · 🔴 ¡QUIETO!') : ''); },
  final: () => L.MISS + Math.round(Math.max(0, G.sc.len - G.me.dist) * 1000),
};

// ---------- Persecuciones (cazador, zombis, papa caliente)
function chaseBuild(sc, R) { arenaCircle(sc, R, PAL[G.p.scene] || PAL.candy);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.3; const b = mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 8), mat(0xffd43b)); b.position.set(Math.cos(a) * (R - 1.2), 0.4, Math.sin(a) * (R - 1.2)); sc.scene.add(b); } }
function marker(color, emoji) { const g = new THREE.Group(); const s = sprite(emoji, color, 0.7); s.position.y = 2.35; g.add(s); return g; }
K.cazador = {
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { chaseBuild(sc, 7); sc.hunter = G.teams ? (G.teams.A.length === 1 ? G.teams.A[0] : G.teams.B[0]) : G.players[0].id;
    const h = G.chars[sc.hunter]; if (h) h.g.add(marker('#ff6b6b', '🎯')); },
  speed() { return G.myId === G.sc.hunter ? (G.p.fast ? 1.28 : 1.12) * (G.now < 2500 ? 0 : 1) : 1; },
  tick(dt, now, m) { const o = (G.x.out || {})[G.myId]; if (o != null && m.st !== 1) { m.st = 1; done(o, '🎯 ¡Te atraparon!'); }
    if (G.myId === G.sc.hunter && (G.over || now >= G.dur) && !G.finished) done(G.x.caught || 0, G.over ? '🎯 ¡Atrapaste a todos!' : '¡Tiempo!'); },
  hud() { return G.myId === G.sc.hunter ? `Eres el CAZADOR 🎯 · Atrapados: ${G.x.caught || 0}` : `¡Huye del cazador 🎯! · Atrapados: ${G.x.caught || 0}`; },
  final: () => G.myId === G.sc.hunter ? (G.x.caught || 0) : G.dur,
};
K.zombi = {
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { chaseBuild(sc, 7); sc.marks = {}; },
  speed() { return (G.x.z || {})[G.myId] != null ? 0.85 : 1; },
  tick(dt, now, m) { const z = (G.x.z || {})[G.myId]; if (z != null && !G.finished) { m.st = 2; done(z, z === 0 ? '🧟 ¡Empiezas como zombi! Atrapa a todos' : '🧟 ¡Te convirtieron!'); } },
  draw() { for (const id of Object.keys(G.x.z || {})) if (!G.sc.marks[id] && G.chars[id]) { G.sc.marks[id] = true; G.chars[id].g.add(marker('#69db7c', '🧟')); } },
  hud() { const n = Object.keys(G.x.z || {}).length; return `Zombis: ${n} / ${G.players.length}` + ((G.x.z || {})[G.myId] != null ? ' · ¡Atrapa a los demás!' : ' · ¡Huye!'); },
  final: () => (G.x.z || {})[G.myId] ?? G.dur,
};
K.papa = {
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { chaseBuild(sc, 6); const b = new THREE.Group(); b.add(mesh(new THREE.SphereGeometry(0.4, 14, 10), mat(0x222222, { flatShading: false })));
    sc.spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa94d })); sc.spark.position.y = 0.5; b.add(sc.spark); sc.bomb = b; sc.scene.add(b); },
  tick(dt, now, m) { const o = (G.x.out || {})[G.myId]; if (o != null && m.st !== 1) { m.st = 1; done(o, '💥 ¡BOOM!'); } },
  draw(now, t) { const h = G.chars[G.x.holder]; G.sc.bomb.visible = !!h; if (h) { G.sc.bomb.position.copy(h.g.position); G.sc.bomb.position.y += 2.5; }
    const left = G.x.next ? (G.x.next - now) : 9999; G.sc.spark.scale.setScalar(1 + (left < 2000 ? Math.abs(Math.sin(t * 30)) * 1.2 : 0)); },
  hud() { return G.x.holder === G.myId ? '💣 ¡TIENES LA BOMBA! Toca a alguien' : aliveHud(); },
};
K.canon = {
  get ctrl() { return G && G.sc && G.myId === G.sc.gunner ? 'tapscreen' : 'joy'; }, ...ARENA_CAM,
  build(sc) { arenaCircle(sc, 6.5, PAL.grass); sc.gunner = G.teams ? (G.teams.A.length === 1 ? G.teams.A[0] : G.teams.B[0]) : G.players[0].id;
    const tower = mesh(new THREE.CylinderGeometry(1, 1.2, 2.5, 10), mat(0x868e96)); tower.position.set(0, -0.2, -8.6); sc.scene.add(tower);
    const gun = mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 10), mat(0x212529)); gun.rotation.x = 1.1; gun.position.set(0, 1.5, -8.2); sc.scene.add(gun);
    sc.shots = {}; sc.ground = mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ visible: false }), false, false); sc.ground.rotation.x = -Math.PI / 2; sc.scene.add(sc.ground);
    if (G.me && G.myId === sc.gunner) Object.assign(G.me, { x: 0, z: -7.6, y: 1.1 }); },
  onTap(ray) { const hit = ray.intersectObject(G.sc.ground)[0]; if (!hit) return; if (G.now - (G.sc.lastShot || -9999) < (G.p.big ? 1100 : 650)) return; G.sc.lastShot = G.now;
    G.send({ t: 'mgact', key: G.key, x: +hit.point.x.toFixed(2), z: +hit.point.z.toFixed(2) }); },
  tick(dt, now, m, prev) {
    if (G.myId === G.sc.gunner) { m.x = 0; m.z = -7.6; m.y = 1.1; if ((G.over || now >= G.dur) && !G.finished) done(Object.keys(G.x.out || {}).length, G.over ? '💣 ¡Le diste a todos!' : '¡Tiempo!'); return; }
    if (m.st === 1) return; for (const e of G.ev || []) if (e.t <= now && e.t > prev && Math.hypot(e.x - m.x, e.z - m.z) < e.r) { out('💥 ¡Te dio!'); G.send({ t: 'mgact', key: G.key, hit: true }); } },
  draw(now) { for (const e of G.ev || []) { let s = G.sc.shots[e.id]; if (!s) { s = G.sc.shots[e.id] = { x: e.x, z: e.z, boom: null,
      sh: new THREE.Mesh(new THREE.RingGeometry(e.r * 0.8, e.r, 24), new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.6, side: THREE.DoubleSide })),
      ball: mesh(G.p.big ? new THREE.BoxGeometry(1, 0.6, 0.7) : new THREE.SphereGeometry(0.4, 12, 9), mat(0x212529)) };
      s.sh.rotation.x = -Math.PI / 2; s.sh.position.set(e.x, 0.04, e.z); G.sc.scene.add(s.sh, s.ball); }
    const left = e.t - now, act = left > 0; s.sh.visible = act; s.ball.visible = act; if (act) { const f = 1 - left / (G.p.big ? 1500 : 1000); s.ball.position.set(e.x * f, 2 + 10 * Math.sin(f * Math.PI * 0.9), -8 + (e.z + 8) * f); }
    if (now >= e.t && !s.sounded) { s.sounded = true; X('boom'); } boom(s, now, e.t, e.r * 1.3); } },
  hud() { return G.myId === G.sc.gunner ? `Eres el CAÑONERO 💣 · Toca el piso para disparar · Fuera: ${Object.keys(G.x.out || {}).length}` : aliveHud(); },
  final: () => G.myId === G.sc.gunner ? Object.keys(G.x.out || {}).length : G.dur,
};

// ---------- Pintar
K.pintar = {
  ctrl: 'joy', ...ARENA_CAM,
  build(sc) { addUnder(sc, sceneOf(G.p)); const base = mesh(new THREE.BoxGeometry(12.4, 0.5, 12.4), mat(G.p.ice ? 0xe7f5ff : 0xdee2e6)); base.position.y = -0.26; sc.scene.add(base);
    sc.cells = []; const g = new THREE.PlaneGeometry(1.14, 1.14);
    for (let c = 0; c < 100; c++) { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.set((c % 10 + 0.5) * 1.2 - 6, 0.01, (Math.floor(c / 10) + 0.5) * 1.2 - 6); m.receiveShadow = true; sc.scene.add(m); sc.cells.push(m); }
    sc.cols = G.teams ? [TEAM_COL.A, TEAM_COL.B] : G.players.map((p, i) => p.color || PLAYER_COLS[i]); sc.last = ''; },
  myCol() { return G.teams ? (G.teamOf(G.myId) === 'A' ? 0 : 1) : G.players.findIndex(p => p.id === G.myId); },
  count(col) { return (G.x.paint || '').split(',').filter(v => v !== '' && +v === col).length; },
  draw() { const s = G.x.paint || ''; if (s === G.sc.last) return; G.sc.last = s; s.split(',').forEach((v, i) => { const c = G.sc.cells[i]; if (c) c.material.color.set(v === '-1' || v === '' ? '#ffffff' : G.sc.cols[+v]); }); },
  hud() { const counts = G.sc.cols.map((_, i) => K.pintar.count(i)); return `Tus casillas: ${counts[K.pintar.myCol()] || 0} · Más pintadas: ${Math.max(0, ...counts)}`; },
  final: () => K.pintar.count(K.pintar.myCol()),
};

// ---------- Tocar objetivos
function popFx(pos, text, color) { const s = sprite(text, color, 0.7); s.position.copy(pos); G.sc.scene.add(s); G.fx.push({ o: s, t: 0 }); }
K.tiro = {
  ctrl: 'tapscreen', cam: [0, 2.6, 8], look: [0, 2.6, -3], stage: true,
  build(sc) { const night = G.p.target === 'luz'; sc.scene.background = new THREE.Color(night ? 0x0b1a3a : G.p.target === 'burbuja' ? 0x74c0fc : 0x9be3ff); sc.scene.fog = null;
    const back = mesh(new THREE.PlaneGeometry(30, 14), mat(night ? 0x1b2a4a : G.p.target === 'topo' ? 0x8ce99a : 0xffe8cc, { flatShading: false }), false); back.position.set(0, 4, -5); sc.scene.add(back);
    const floor = mesh(new THREE.PlaneGeometry(30, 20), mat(night ? 0x1e3a2a : 0x69db7c, { flatShading: false }), false); floor.rotation.x = -Math.PI / 2; floor.position.z = 2; sc.scene.add(floor);
    if (G.p.target === 'topo') for (let i = -2; i <= 2; i++) for (let j = 0; j < 3; j++) { const h = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), mat(0x5c3b1e), false); h.position.set(i * 1.6, 0.6 + j * 1.6 - 0.5, -4.4); h.rotation.x = Math.PI / 2; sc.scene.add(h); }
    const cols = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xfcc419, 0xcc5de8], s = G.p.small ? 0.5 : 1;
    sc.targets = L.targetSchedule(G.seed, G.dur, G.p).map((c, i) => { let o;
      if (c.bad) { o = new THREE.Group(); o.add(mesh(new THREE.SphereGeometry(0.45 * s, 12, 9), mat(0x212529))); const f = mesh(new THREE.SphereGeometry(0.1, 6, 5), glow(0xff922b, 1.5)); f.position.y = 0.5 * s; o.add(f); }
      else if (G.p.target === 'topo') { o = new THREE.Group(); o.add(mesh(new THREE.SphereGeometry(0.45, 12, 9), mat(c.gold ? 0xfcc419 : 0x8d6e63))); const n = mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xff8787)); n.position.set(0, 0, 0.42); o.add(n); }
      else if (G.p.target === 'pato') { o = new THREE.Group(); o.add(mesh(new THREE.SphereGeometry(0.4, 12, 9), mat(c.gold ? 0xfcc419 : 0xffffff))); const hd = mesh(new THREE.SphereGeometry(0.25, 10, 8), mat(0x2f9e44)); hd.position.set(0.35 * c.dir, 0.3, 0); o.add(hd); }
      else if (G.p.target === 'burbuja') o = mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: c.gold ? 0xfcc419 : 0xe7f5ff, transparent: true, opacity: 0.7, roughness: 0.05 }));
      else if (G.p.target === 'luz') o = mesh(new THREE.SphereGeometry(0.25, 10, 8), glow(c.gold ? 0xffd43b : 0xc0eb75, 1.5));
      else { o = new THREE.Group(); o.add(mesh(new THREE.SphereGeometry(0.5 * s, 14, 10), mat(c.gold ? 0xfcc419 : cols[i % 5], { flatShading: false, roughness: 0.3 }))); const st = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), mat(0xffffff)); st.position.y = -1.05; o.add(st); }
      o.visible = false; o.userData.id = c.id; sc.scene.add(o); return { ...c, o }; }); },
  onTap(ray) { const act = G.sc.targets.filter(c => c.o.visible); const hits = ray.intersectObjects(act.map(c => c.o), true); if (!hits.length) return;
    let o = hits[0].object; while (o && o.userData.id == null) o = o.parent; const c = G.sc.targets[o.userData.id]; if (!c) return;
    G.localTaken.add(c.id); G.send({ t: 'mggrab', key: G.key, id: c.id }); X(c.bad ? 'bad' : 'coin'); popFx(c.o.position, c.bad ? '💥 −3' : c.gold ? '+3' : '+1', c.bad ? '#ff6b6b' : '#ffd43b'); },
  draw(now) { G.sc.targets.forEach(c => { const act = L.targetActive(c, now) && G.taken[c.id] == null && !G.localTaken.has(c.id); c.o.visible = act;
    if (act) { const [x, y] = L.targetPos(c, now, G.p); c.o.position.set(x, y, -4); if (G.p.target === 'topo') { const k = (now - c.t) / c.life; c.o.position.y = y - 0.6 + Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.9; } } }); },
  tick(dt, now, m) { m.sc = G.counts[G.myId] || 0; },
  hud: () => K.monedas.hud(), final: () => G.counts[G.myId] || 0,
};

// ---------- Memoria
const PAD_COLS = ['#51cf66', '#ff6b6b', '#fcc419', '#4dabf7', '#cc5de8', '#ff922b'];
function light(i, ms) { G.sc.lit = G.sc.lit || {}; G.sc.lit[i] = G.now + ms; }
K.memoria = {
  ctrl: 'buttons', cam: [0, 6.5, 6], look: [0, 0, -1.2], stage: true,
  build(sc) { const n = G.p.pads || 4; sc.n = n; sc.scene.background = new THREE.Color(0x1e0b3a); sc.scene.fog = null;
    const floor = mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.4, 40), mat(0x3b1f7a, { flatShading: false })); floor.position.set(0, -0.2, -1.2); sc.scene.add(floor);
    sc.pads = PAD_COLS.slice(0, n).map((c, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; const m = mesh(new THREE.CylinderGeometry(1, 1, 0.25, 24), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05 }));
      m.position.set(Math.cos(a) * 2.6, 0.1, Math.sin(a) * 2.6 - 1.2); sc.scene.add(m); return m; });
    sc.seq = L.memSeq(G.seed, n); sc.level = 0; sc.phase = 'show'; sc.t0 = 600; sc.input = 0; sc.lit = {}; },
  buttons() { return PAD_COLS.slice(0, G.sc.n).map((c, i) => `<button data-i="${i}" style="background:${c};width:${G.sc.n > 4 ? 30 : 46}%;height:76px;border-radius:18px"></button>`).join(''); },
  onButton(i) { const sc = G.sc; if (sc.phase !== 'input' || G.finished) return; light(i, 250); X('beep');
    if (sc.seq[sc.input] === i) { sc.input++; if (sc.input >= sc.level + 3) { sc.level++; flash('✅ ¡Bien!', 600); sc.phase = 'show'; sc.t0 = G.now + 900; sc.input = 0; } }
    else { flash('❌ ¡Uy!', 1200); X('bad'); sc.phase = 'over'; done(sc.level, null); } },
  tick(dt, now, m) { m.sc = G.sc.level; },
  draw(now) { const sc = G.sc, step = G.p.fast ? 330 : 600;
    if (sc.phase === 'show' && G.me) { const len = sc.level + 3, k = Math.floor((now - sc.t0) / step);
      if (now >= sc.t0 && k < len && (now - sc.t0) % step < step * 0.7) light(sc.seq[k], 30);
      if (k >= len) { sc.phase = 'input'; flash('👆 ¡Tu turno!', 700); } }
    sc.pads.forEach((p, i) => { const on = (sc.lit[i] || 0) > now; p.material.emissiveIntensity = on ? 1.6 : 0.05; p.position.y = on ? 0.18 : 0.1; }); },
  hud() { return `Ronda ${G.sc.level + 1} · ${G.sc.phase === 'show' ? 'Mira la secuencia…' : G.sc.phase === 'input' ? 'Repite la secuencia' : '¡Fin!'}`; },
  final: () => G.sc.level,
};

// ---------- Reflejos
K.reflejo = {
  ctrl: 'tapscreen', cam: [0, 3.2, 7.5], look: [0, 1.5, 0], stage: true,
  build(sc) { sc.scene.background = new THREE.Color(0xffc078); sc.scene.fog = null; arenaRect(sc, 6, 14, { ...PAL.beach, ground: 0xe8b07a }, 0);
    for (let i = 0; i < 5; i++) { const c = mesh(new THREE.CylinderGeometry(0.3, 0.35, 2 + i % 2, 8), mat(0x2f9e44)); c.position.set(-6 + i * 3, 1, -6); sc.scene.add(c); }
    sc.rounds = L.reflexRounds(G.seed, G.p); sc.r = 0; sc.res = []; sc.sign = null; sc.state = 'wait';
    if (G.p.fly) { sc.fly = mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0x212529)); sc.scene.add(sc.fly); } },
  setSign(text, color) { const sc = G.sc; if (sc.signTxt === text) return; sc.signTxt = text; if (sc.sign) sc.scene.remove(sc.sign); sc.sign = null; if (!text) return; sc.sign = sprite(text, color, 1.6); sc.sign.position.set(0, 4, 0); sc.scene.add(sc.sign); },
  onTap() { const sc = G.sc, now = G.now; if (G.finished || sc.r >= 3 || sc.state === 'done') return; const rd = sc.rounds[sc.r];
    if (now < rd.go) { sc.res.push(1500); flash('❌ ¡Muy pronto! +1.5 s', 900); } else { const v = Math.round(now - rd.go); sc.res.push(v); flash(`⏱️ ${v} ms`, 900); }
    sc.state = 'done'; },
  tick(dt, now, m) { const sc = G.sc; if (sc.r >= 3) return; const rd = sc.rounds[sc.r];
    if (sc.state !== 'done' && now > rd.go + 1500) { sc.res.push(1500); sc.state = 'done'; flash('⌛ ¡Muy lento!', 800); }
    if (sc.state === 'done' && now > rd.go + 1600) { sc.r++; sc.state = 'wait'; if (sc.r >= 3) { const tot = sc.res.reduce((a, b) => a + b, 0); done(tot, `Total: ${tot} ms`); } }
    m.sc = sc.res.length; },
  draw(now, t) { const sc = G.sc; if (sc.r >= 3) { K.reflejo.setSign(null); return; } const rd = sc.rounds[sc.r];
    if (now >= rd.go && sc.state !== 'done') { if (sc.signTxt !== '¡YA!' && sc.signTxt !== '🪰 ¡AHORA!') X('go'); } if (now >= rd.go && sc.state !== 'done') K.reflejo.setSign(G.p.fly ? '🪰 ¡AHORA!' : '¡YA!', '#51cf66');
    else if (rd.fake && now >= rd.fake && now < rd.fake + 900) K.reflejo.setSign('¡¿YA?!', '#fcc419');
    else K.reflejo.setSign(sc.state === 'done' ? null : '…', '#ffffff');
    if (sc.fly) { const landed = now >= rd.go; sc.fly.position.set(landed ? 0 : Math.sin(t * 7) * 2, landed ? 1.2 : 2.5 + Math.sin(t * 11) * 0.6, landed ? 1 : Math.cos(t * 5)); } },
  hud() { return `Ronda ${Math.min(3, G.sc.r + 1)} de 3 · Toca la pantalla con la señal`; },
  final: () => G.sc.res.reduce((a, b) => a + b, 0) + (3 - G.sc.res.length) * 1500,
};

// ---------- Tirar la cuerda / remar / carrito
K.cuerda = {
  ctrl: 'mash', cam: [0, 6, 10], look: [0, 0.5, 0], stage: true,
  build(sc) { const boat = G.p.look === 'boat'; sc.boat = boat;
    if (boat) { addUnder(sc, { ...PAL.beach, under: 0x1c7ed6 }); sc.boats = [0, 1].map(k => { const g = new THREE.Group(); const hull = mesh(new THREE.BoxGeometry(1.6, 0.5, 3.4), mat(k ? 0xf03e3e : 0x339af0)); hull.position.y = 0.1; g.add(hull); g.position.set(k ? 2 : -2, -0.6, 6); sc.scene.add(g); return g; });
      const fin = mesh(new THREE.BoxGeometry(8, 0.1, 0.4), mat(0xffffff)); fin.position.set(0, -0.5, -14); sc.scene.add(fin); sc.camF = true; }
    else { arenaRect(sc, 8, 8, G.p.look === 'cart' ? PAL.grass : PAL.candy, 0);
      const mid = mesh(new THREE.BoxGeometry(0.2, 0.05, 6), mat(0xffffff)); mid.position.y = 0.01; sc.scene.add(mid);
      sc.rope = mesh(new THREE.CylinderGeometry(0.07, 0.07, 12, 8), mat(0xe8b07a)); sc.rope.rotation.z = Math.PI / 2; sc.rope.position.y = 0.8; sc.scene.add(sc.rope);
      if (G.p.look === 'cart') { sc.cart = mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), mat(0xffd43b)); sc.cart.position.y = 0.5; sc.scene.add(sc.cart); sc.rope.visible = false; } } },
  place(id) { const sc = G.sc, team = G.teamOf(id), list = G.teams[team], k = list.indexOf(id);
    if (sc.boat) return [(team === 'A' ? -2 : 2) + (k - (list.length - 1) / 2) * 0.6, 6 - k * 0.8];
    return [(team === 'A' ? -1 : 1) * (1.6 + k * 1.1), 0]; },
  tap() { const m = G.me; if (!m || G.finished) return; m.taps = (m.taps || 0) + 1; X('tap'); },
  tick(dt, now, m) { m.sc = m.taps || 0; m.ry = G.sc.boat ? Math.PI : G.teamOf(G.myId) === 'A' ? Math.PI / 2 : -Math.PI / 2;
    if ((G.over || now >= G.dur) && !G.finished) done(m.taps || 0, '¡Fin!'); },
  draw(now, t) { const sc = G.sc, r = G.x.rope || 0;
    if (sc.boat) { const b = G.x.boats || [0, 0]; sc.boats.forEach((g, k) => { g.position.z = 6 - b[k] * 20; g.rotation.z = Math.sin(t * 6 + k) * 0.04; }); }
    else { if (sc.rope) sc.rope.position.x = r * 4; if (sc.cart) sc.cart.position.x = r * 5; } },
  offset() { const sc = G.sc; if (sc.boat) { const b = G.x.boats || [0, 0]; return id => [0, -(G.teamOf(id) === 'A' ? b[0] : b[1]) * 20]; } const r = (G.x.rope || 0) * 4; return () => [r, 0]; },
  camPos() { if (!G.sc.boat) return null; const b = G.x.boats || [0, 0], z = 6 - Math.max(b[0], b[1]) * 20; return [[0, 7, z + 9], [0, 0, z - 3]]; },
  hud() { const team = G.teamOf(G.myId); return `Equipo ${team === 'A' ? '🔵 Azul' : '🔴 Rojo'} · ¡Toca rápido! · Toques: ${G.me ? G.me.taps || 0 : 0}`; },
  final: () => G.me.taps || 0,
};

// ---------- Torre
K.torre = {
  ctrl: 'tapscreen', stage: true,
  build(sc) { sc.scene.background = new THREE.Color(0x9be3ff); sc.scene.fog = null; const base = mesh(new THREE.BoxGeometry(3, 0.6, 3), mat(0x868e96)); base.position.y = -0.3; sc.scene.add(base);
    const g = mesh(new THREE.PlaneGeometry(80, 80), mat(0x69db7c, { flatShading: false }), false); g.rotation.x = -Math.PI / 2; g.position.y = -0.6; sc.scene.add(g);
    sc.cake = G.p.look === 'cake'; sc.top = { x: 0, w: 2.6 }; sc.h = 0; sc.dir = 1; sc.mov = null; sc.speed = G.p.fast ? 3.2 : 2.2; if (G.me) K.torre.next(); },
  next() { const sc = G.sc, cols = sc.cake ? [0xfff0f6, 0xffc9de, 0xf783ac, 0x8d5524] : [0xff6b6b, 0x4dabf7, 0x51cf66, 0xfcc419, 0xcc5de8];
    const m = mesh(new THREE.BoxGeometry(sc.top.w, 0.5, 2.6), mat(cols[sc.h % cols.length], { flatShading: false })); m.position.set(-3.2, sc.h * 0.5 + 0.25, 0); sc.scene.add(m); sc.mov = m; sc.mx = -3.2; sc.dir = 1; },
  onTap() { const sc = G.sc; if (!sc.mov || G.finished) return; const x = sc.mx, l = Math.max(x - sc.top.w / 2, sc.top.x - sc.top.w / 2), r = Math.min(x + sc.top.w / 2, sc.top.x + sc.top.w / 2), w = r - l;
    if (w <= 0.05) { sc.falling = sc.mov; sc.mov = null; done(sc.h, `🏗️ ${sc.h} pisos`); return; }
    const perfect = Math.abs(w - sc.top.w) < 0.06; sc.mov.geometry.dispose(); sc.mov.geometry = new THREE.BoxGeometry(w, 0.5, 2.6); sc.mov.position.x = (l + r) / 2; sc.top = { x: (l + r) / 2, w }; sc.h++; sc.speed *= 1.05;
    X(perfect ? 'coin' : 'tap'); if (perfect) flash('✨ ¡Perfecto!', 500); K.torre.next(); },
  tick(dt, now, m) { const sc = G.sc; if (sc.mov) { sc.mx += sc.dir * sc.speed * dt; if (Math.abs(sc.mx) > 3.2) { sc.dir *= -1; sc.mx = Math.sign(sc.mx) * 3.2; } sc.mov.position.x = sc.mx; }
    if (sc.falling) { sc.falling.position.y -= dt * 6; sc.falling.rotation.z += dt * 2; } m.sc = sc.h; m.x = -2.4; m.z = 1.8; m.y = 0; },
  camPos() { const y = G.sc.h * 0.5; return [[5, y + 3.5, 7.5], [0, y, 0]]; },
  hud() { const best = Math.max(0, ...G.players.filter(p => p.id !== G.myId).map(p => (G.net[p.id] || [])[5] || 0)); return `Tu torre: ${G.sc.h} pisos · Mejor rival: ${best}`; },
  final: () => G.sc.h,
};

// ---------- Corredor
K.corredor = {
  ctrl: 'lanes', follow2: true,
  build(sc) { const pal = sceneOf(G.p); sc.scene.background = new THREE.Color(pal.sky); sc.scene.fog = new THREE.Fog(pal.sky, 20, 45);
    const n = G.players.length; sc.items = L.runnerSchedule(G.seed, G.dur, G.p); sc.got = new Set(); sc.coins = 0;
    G.players.forEach((p, i) => { const x0 = (i - (n - 1) / 2) * 4.2; const g = mesh(new THREE.BoxGeometry(3.6, 0.3, 500), mat(pal.ground, { flatShading: false })); g.position.set(x0, -0.15, -240); sc.scene.add(g);
      [-1, 1].forEach(s => { const w = mesh(new THREE.BoxGeometry(0.15, 0.5, 500), mat(pal.rim)); w.position.set(x0 + s * 1.85, 0.1, -240); sc.scene.add(w); }); });
    const mi = G.players.findIndex(p => p.id === G.myId); sc.x0 = L.spawnPos('corredor', Math.max(0, mi), n)[0];
    const coinM = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.7, roughness: 0.25 }), rockM = mat(G.p.scene === 'ice' ? 0x74c0fc : 0x868e96);
    sc.meshes = sc.items.map(it => { const o = it.kind === 'coin' ? coinObj(0.7) : mesh(new THREE.DodecahedronGeometry(0.55, 0), rockM);
      o.position.set(sc.x0 + it.lane * 1.1, it.kind === 'coin' ? 0.6 : 0.4, -it.z); o.visible = mi >= 0; sc.scene.add(o); return o; });
    if (G.me) G.me.lane = 0; },
  lane(d) { const m = G.me; if (!m || G.finished) return; m.lane = Math.max(-1, Math.min(1, (m.lane || 0) + d)); },
  tick(dt, now, m) { const sc = G.sc, dist = L.runnerDist(now, G.p); m.z = -dist; m.ry = Math.PI; m.mv = 1;
    const tx = sc.x0 + (m.lane || 0) * 1.1; m.x += (tx - m.x) * Math.min(1, dt * (G.p.fast ? 9 : 13));
    sc.items.forEach((it, i) => { if (sc.got.has(i) || Math.abs(it.z - dist) > 0.6 || Math.abs(sc.x0 + it.lane * 1.1 - m.x) > 0.6) return; sc.got.add(i); sc.meshes[i].visible = false;
      if (it.kind === 'coin') { sc.coins++; X('coin'); } else if (now > (m.stunUntil || 0)) { X('bad'); sc.coins = Math.max(0, sc.coins - 2); m.stunUntil = now + 900; flash('💥 −2', 600); } });
    m.st = now < (m.stunUntil || 0) ? 2 : 0; m.sc = sc.coins; },
  draw(now, t) { G.sc.meshes.forEach((o, i) => { if (G.sc.items[i].kind === 'coin') o.rotation.y = t * 3; }); },
  hud() { return `🪙 ${G.sc.coins} · Mejor rival: ${Math.max(0, ...G.players.filter(p => p.id !== G.myId).map(p => (G.net[p.id] || [])[5] || 0))}`; },
  final: () => G.sc.coins,
};

// ---------- Laberinto
function haloTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,232,161,.3)'); gr.addColorStop(0.5, 'rgba(255,214,120,.14)'); gr.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
K.laberinto = {
  ctrl: 'joy',
  build(sc) { const mz = L.maze(G.seed, G.p.big); sc.mz = mz; const dark = G.p.dark, hedge = G.p.big;
    sc.scene.background = new THREE.Color(dark ? 0x05060f : 0x9be3ff); sc.scene.fog = null;
    // oscuro: casi sin luz ambiente; el personaje lleva su propia luz (a quien solo mira se le deja ver más)
    if (dark) sc.scene.children.filter(o => o.isLight).forEach(l => { l.intensity *= G.me ? 0.06 : 0.35; if (l.castShadow) l.castShadow = false; });
    const floor = mesh(new THREE.BoxGeometry(mz.n * mz.cell + 1, 0.4, mz.n * mz.cell + 1), mat(dark ? 0x343a40 : 0xe9ecef, { flatShading: false })); floor.position.y = -0.2; sc.scene.add(floor);
    const wm = mat(hedge ? 0x2b8a3e : dark ? 0x495057 : 0x845ef7), H = 1.1, T = 0.18;
    const wall = (x, z, w, d) => { const o = mesh(new THREE.BoxGeometry(w, H, d), wm); o.position.set(x, H / 2, z); sc.scene.add(o); };
    for (let c = 0; c < mz.n * mz.n; c++) { const [cx, cz] = mz.center(c), h = mz.cell / 2, w = mz.walls[c];
      if (w[0]) wall(cx, cz - h, mz.cell + T, T); if (w[3]) wall(cx - h, cz, T, mz.cell + T);
      if (w[2] && Math.floor(c / mz.n) === mz.n - 1) wall(cx, cz + h, mz.cell + T, T); if (w[1] && c % mz.n === mz.n - 1) wall(cx + h, cz, T, mz.cell + T); }
    const [ex, ez] = mz.center(mz.exit); const flag = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 20), glow(0x51cf66, 1)); flag.position.set(ex, 0.05, ez); sc.scene.add(flag);
    const f2 = sprite('🏁', '#fff', 0.8); f2.position.set(ex, 1.6, ez); sc.scene.add(f2);
    if (dark && G.me) { sc.lamp = new THREE.PointLight(0xffe8a1, 45, 7.5, 1.2); sc.scene.add(sc.lamp);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03; sc.halo = halo; sc.scene.add(halo); } },
  move(m, dx, dz) { [m.x, m.z] = L.mazeMove(G.sc.mz, m.x, m.z, dx, dz); },
  tick(dt, now, m) { if (m.st === 0 && G.sc.mz.cellAt(m.x, m.z) === G.sc.mz.exit) { m.st = 3; done(Math.round(now), '🏁 ¡Saliste!'); } const sc = G.sc; if (sc.lamp) { sc.lamp.position.set(m.x, 2.3, m.z); sc.halo.position.x = m.x; sc.halo.position.z = m.z; sc.lamp.intensity = 45 + Math.sin(now / 160) * 4;
      // viñeta: oscuro alrededor, círculo de luz sobre mi personaje
      if (!sc.vig) { sc.vig = document.createElement('div'); sc.vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;transition:none'; G.hud.prepend(sc.vig); }
      const v = new THREE.Vector3(m.x, 0.6, m.z).project(sc.camera), px = (v.x + 1) / 2 * 100, py = (1 - v.y) / 2 * 100, r = Math.min(innerWidth, innerHeight) * 0.42;
      sc.vig.style.background = `radial-gradient(circle ${r}px at ${px}% ${py}%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(3,4,12,.75) 80%, rgba(3,4,12,.96) 100%)`; } },
  camPos() { const m = G.me || { x: 0, z: 0 }, f = Math.max(1, 0.62 / (innerWidth / innerHeight)); return [[m.x, 9 * f, m.z + 4.5 * f], [m.x, 0, m.z]]; },
  hud: () => G.p.dark ? '🔦 Tu luz te guía · busca la salida 🏁 (abajo a la derecha)' : '🏁 Busca la bandera verde (abajo a la derecha)',
  final: () => L.MISS + 1000 * G.sc.mz.path(Math.max(0, G.sc.mz.cellAt(G.me.x, G.me.z))).length,
};

// ---------- Zona
K.colina = {
  ctrl: 'joy', ...ARENA_CAM, get physics() { return G && G.p.push; },
  extra() { return G.p.push ? [dashBtn()] : []; },
  build(sc) { arenaCircle(sc, 7, sceneOf(G.p)); if (G.p.edge) sc.scene.children.filter(o => o.geometry && o.geometry.type === 'TorusGeometry').forEach(o => o.visible = false); sc.zone = mesh(new THREE.CylinderGeometry(1, 1, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xffd43b, emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }), false);
    sc.scene.add(sc.zone); if (G.p.fast) { sc.spot = new THREE.SpotLight(0xfff3bf, 120, 20, 0.35, 0.4); sc.scene.add(sc.spot, sc.spot.target); } sc.inT = 0; },
  tick(dt, now, m) {
    if (m.fellAt) { m.y -= dt * 9; if (now > m.fellAt + 1500) { m.fellAt = 0; m.x = 0; m.z = 0; m.y = 0; m.vx = m.vz = 0; m.st = 0; } m.sc = Math.round(G.sc.inT); return; }
    if (L.fellOff('colina', G.p, now, m.x, m.z)) { m.fellAt = now; m.st = 1; X('lose'); flash('🌊 ¡Te caíste!', 1000); return; }
    const [x, z, r] = L.zoneAt(G.seed, now, G.p); if (Math.hypot(m.x - x, m.z - z) < r) { G.sc.inT += dt * 1000; m.st = 2; } else m.st = 0; m.sc = Math.round(G.sc.inT); },
  draw(now, t) { const [x, z, r] = L.zoneAt(G.seed, now, G.p); G.sc.zone.position.set(x, 0.04, z); G.sc.zone.scale.set(r, 1, r); G.sc.zone.material.opacity = 0.45 + Math.sin(t * 4) * 0.1;
    if (G.sc.spot) { G.sc.spot.position.set(x, 10, z); G.sc.spot.target.position.set(x, 0, z); } },
  hud() { return `👑 Tiempo dentro: ${(G.sc.inT / 1000).toFixed(1)} s`; },
  final: () => Math.round(G.sc.inT),
};

// ---------- Contar
K.contar = {
  ctrl: 'buttons', cam: [0, 5, 9], look: [0, 0.5, 0], stage: true,
  build(sc) { arenaRect(sc, 9, 10, PAL.grass, 0); const what = G.p.what; sc.data = L.countSchedule(G.seed, G.p); sc.guess = 0; sc.phase = 'watch';
    const gold = c => new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.25 });
    const good = what === 'pollito' ? mat(0xffe066) : what === 'oveja' ? mat(0xffffff) : gold(0xffc928), bad = what === 'pollito' ? mat(0xffffff) : what === 'oveja' ? mat(0x343a40) : gold(0xadb5bd);
    sc.objs = sc.data.list.map(it => { const o = new THREE.Group(); const body = what === 'moneda' ? coinObj(0.9, it.good ? null : 0xadb5bd) : mesh(new THREE.SphereGeometry(what === 'oveja' ? 0.55 : 0.35, 10, 8), it.good ? good : bad);
      o.add(body); if (what === 'pollito') { const bk = mesh(new THREE.ConeGeometry(0.08, 0.2, 5), mat(0xff922b)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.05, 0.38); o.add(bk); }
      o.visible = false; sc.scene.add(o); return { ...it, o }; }); },
  buttons() { return G.sc.phase === 'answer' ? `<button data-i="-1" style="width:22%">−</button><button data-i="0" style="width:40%;font-size:2rem" disabled>${G.sc.guess}</button><button data-i="1" style="width:22%">+</button><button data-i="9" style="width:90%">✅ Listo</button>` : ''; },
  onButton(i) { const sc = G.sc; if (sc.phase !== 'answer' || G.finished) return; if (i === 0) return;
    if (i === 9) { sc.phase = 'done'; done(Math.abs(sc.guess - sc.data.real), `Eran ${sc.data.real}`); refreshButtons(); return; }
    sc.guess = Math.max(0, sc.guess + i); refreshButtons(); },
  tick(dt, now) { const sc = G.sc; if (sc.phase === 'watch' && now > 14500) { sc.phase = 'answer'; flash('¿Cuántos eran?', 1500); refreshButtons(); } },
  draw(now) { G.sc.objs.forEach(it => { const k = (now - it.t) / 1000, x = it.dir * (-9 + k * it.sp * 2); it.o.visible = now >= it.t && Math.abs(x) < 9.5;
    if (it.o.visible) { it.o.position.set(x, 0.4 + Math.abs(Math.sin(k * 10)) * 0.3, it.lane * 2.5); it.o.rotation.y = it.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } }); },
  hud() { const what = { pollito: 'pollitos amarillos', oveja: 'ovejas blancas', moneda: 'monedas doradas' }[G.p.what]; return G.sc.phase === 'watch' ? `Cuenta los ${what}` : '¿Cuántos eran?'; },
  final: () => Math.abs(G.sc.guess - G.sc.data.real) + 5,
};

// ---------- Vasos
K.vasos = {
  ctrl: 'buttons', cam: [0, 4.2, 6.5], look: [0, 0.6, 0], stage: true,
  build(sc) { sc.scene.background = new THREE.Color(0x5c3b1e); sc.scene.fog = null; const table = mesh(new THREE.BoxGeometry(9, 0.4, 4), mat(0x8d5524)); table.position.y = -0.2; sc.scene.add(table);
    const chest = G.p.fast; sc.cups = [0, 1, 2].map(i => { const o = chest ? mesh(new THREE.BoxGeometry(1.2, 1, 0.9), mat(0x8d5524)) : mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.2, 16, 1, true), mat(0xff6b6b, { side: THREE.DoubleSide, flatShading: false }));
      o.position.set((i - 1) * 2.2, 0.6, 0); sc.scene.add(o); return o; });
    sc.coin = coinObj(0.65); sc.coin.rotation.x = -Math.PI / 2; sc.coin.position.y = 0.06; sc.scene.add(sc.coin);
    sc.rounds = L.cupsSchedule(G.seed, G.p); sc.r = 0; sc.ok = 0; K.vasos.startRound(800); },
  startRound(at) { const sc = G.sc, rd = sc.rounds[sc.r]; sc.slot = [0, 1, 2]; sc.ball = rd.start; sc.t0 = (G.now || 0) + at; sc.phase = 'show'; sc.pick = null; refreshButtons(); },
  buttons() { return G.sc && G.sc.phase === 'pick' ? [0, 1, 2].map(i => `<button data-i="${i}" style="width:30%">${['⬅️', '⬆️', '➡️'][i]}</button>`).join('') : ''; },
  onButton(pos) { const sc = G.sc; if (sc.phase !== 'pick') return; const cup = sc.slot.indexOf(pos); sc.pick = cup; sc.phase = 'reveal'; sc.tr = G.now;
    if (cup === sc.ball) { sc.ok++; X('coin'); flash('✅ ¡Ahí estaba!', 900); } else { X('bad'); flash('❌ No era ese', 900); } refreshButtons(); },
  tick(dt, now, m) { const sc = G.sc; if (sc.r >= 3) return;
    if (sc.phase === 'show' && now > sc.t0 + 1400) { sc.phase = 'swap'; sc.ts = now; }
    if (sc.phase === 'reveal' && now > sc.tr + 1400) { sc.r++; if (sc.r >= 3) done(sc.ok, `${sc.ok} de 3`); else K.vasos.startRound(300); }
    m.sc = sc.ok; },
  draw(now) { const sc = G.sc; if (sc.r >= 3 || !G.me) return; const rd = sc.rounds[sc.r]; let lift = [0, 0, 0]; const zs = [0, 0, 0]; let px = sc.slot.map(v => (v - 1) * 2.2);
    if (sc.phase === 'show') { const e = now - sc.t0; lift[sc.ball] = e < 0 ? 0 : e < 400 ? e / 400 : e < 1000 ? 1 : Math.max(0, 1 - (e - 1000) / 400); }
    if (sc.phase === 'swap') { const e = now - sc.ts, i = Math.min(rd.swaps.length, Math.floor(e / rd.dur)), f = (e % rd.dur) / rd.dur, pos = [0, 1, 2];
      const apply = ([a, b]) => { const ca = pos.indexOf(a), cb = pos.indexOf(b); pos[ca] = b; pos[cb] = a; };
      for (let j = 0; j < i; j++) apply(rd.swaps[j]);
      px = pos.map(v => (v - 1) * 2.2);
      if (i < rd.swaps.length) { const [a, b] = rd.swaps[i], ca = pos.indexOf(a), cb = pos.indexOf(b); px[ca] = ((a - 1) + (b - a) * f) * 2.2; px[cb] = ((b - 1) + (a - b) * f) * 2.2; zs[ca] = Math.sin(f * Math.PI) * 0.8; zs[cb] = -Math.sin(f * Math.PI) * 0.8; }
      else { sc.slot = pos; sc.phase = 'pick'; refreshButtons(); } }
    if (sc.phase === 'reveal') { lift[sc.ball] = 1; if (sc.pick != null) lift[sc.pick] = 1; }
    sc.cups.forEach((c, k) => { c.position.x = px[k]; c.position.z = zs[k]; c.position.y = 0.6 + lift[k] * 1.1; });
    sc.coin.position.x = sc.cups[sc.ball].position.x; sc.coin.position.z = sc.cups[sc.ball].position.z; },
  hud() { const sc = G.sc; return `Ronda ${Math.min(3, sc.r + 1)} de 3 · Aciertos: ${sc.ok}` + (sc.phase === 'pick' ? ' · ¿Dónde está?' : ''); },
  final: () => G.sc.ok,
};

// ---------- Precisión: ruleta, tren, reloj
K.ruleta = {
  ctrl: 'stop', cam: [0, 5, 8], look: [0, 1, 0], stage: true,
  build(sc) { const mode = G.p.mode; sc.mode = mode; sc.tries = []; sc.r = 0; sc.t0 = 800; sc.stopped = false; const r = L.rngOf(G.seed); sc.targets = [0, 1, 2].map(() => r()); sc.scene.fog = null;
    if (mode === 'ruleta') { sc.scene.background = new THREE.Color(0x1e0b3a); const disc = mesh(new THREE.CylinderGeometry(3, 3, 0.3, 48), mat(0x3b1f7a, { flatShading: false })); disc.rotation.x = Math.PI / 2; disc.position.y = 2; sc.scene.add(disc);
      sc.zone = mesh(new THREE.CylinderGeometry(3.02, 3.02, 0.32, 48, 1, false, 0, 0.35), glow(0xffd43b, 0.6)); sc.zone.position.y = 2; sc.scene.add(sc.zone);
      sc.needle = new THREE.Group(); const nd = mesh(new THREE.BoxGeometry(0.15, 2.8, 0.1), mat(0xffffff)); nd.position.y = 1.4; sc.needle.add(nd); sc.needle.position.set(0, 2, 0.3); sc.scene.add(sc.needle); }
    else if (mode === 'tren') { arenaRect(sc, 6, 10, PAL.grass, 0); const track = mesh(new THREE.BoxGeometry(16, 0.1, 1), mat(0x8d5524)); track.position.y = 0.05; sc.scene.add(track);
      sc.line = mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), glow(0xff2222, 1)); sc.line.position.y = 0.1; sc.scene.add(sc.line);
      sc.train = mesh(new THREE.BoxGeometry(1.6, 1, 0.9), mat(0xe03131)); sc.train.position.y = 0.6; sc.scene.add(sc.train); }
    else { sc.scene.background = new THREE.Color(0x1e0b3a); sc.clockTxt = ''; } },
  val(now) { const sc = G.sc, e = Math.max(0, now - sc.t0) / 1000, tg = sc.targets[Math.min(2, sc.r)];
    if (sc.mode === 'ruleta') return { a: e * (3 + sc.r * 1.2) + tg * 6, target: tg * Math.PI * 2 };
    if (sc.mode === 'tren') return { x: -7 + e * (3.2 + sc.r) + Math.sin(e * 2) * 0.4, target: -1 + tg * 4 };
    return { t: e, target: 5 }; },
  onStop() { const sc = G.sc, now = G.now; if (!G.me || sc.r >= 3 || now < sc.t0 || sc.stopped) return; const v = K.ruleta.val(now); let err;
    if (sc.mode === 'ruleta') { const a = ((v.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); err = Math.round(Math.abs(L.wrap(a - (v.target + 0.175))) * 180 / Math.PI); }
    else if (sc.mode === 'tren') err = Math.round(Math.abs(v.x - v.target) * 30);
    else err = Math.round(Math.abs(v.t - 5) * 100);
    sc.tries.push(err); X(err <= 5 ? 'coin' : 'tap'); sc.stopped = true; sc.stopAt = now; sc.stopV = v; flash(err <= 3 ? `🎯 ¡Casi perfecto! (${err})` : `Error: ${err}`, 1000); },
  tick(dt, now) { const sc = G.sc; if (sc.r >= 3) return; const lim = sc.mode === 'reloj' ? 9 : 7;
    if (!sc.stopped && now > sc.t0 + lim * 1000) { sc.tries.push(sc.mode === 'reloj' ? 400 : 99); sc.stopped = true; sc.stopAt = now; sc.stopV = K.ruleta.val(now); flash('⌛ ¡Se acabó el tiempo!', 900); }
    if (sc.stopped && now > sc.stopAt + 1300) { sc.r++; sc.stopped = false; sc.t0 = now + 600; if (sc.r >= 3) { const tot = sc.tries.reduce((a, b) => a + b, 0); done(tot, `Error total: ${tot}`); } } },
  draw(now) { const sc = G.sc; if (sc.r >= 3) return; const v = sc.stopped ? sc.stopV : K.ruleta.val(now);
    if (sc.mode === 'ruleta') { sc.needle.rotation.z = -v.a; sc.zone.rotation.set(Math.PI / 2, 0, 0); sc.zone.rotateY(-v.target); }
    else if (sc.mode === 'tren') { sc.train.position.x = v.x; sc.line.position.x = v.target + 0.8; }
    else { const txt = v.t < 2 || sc.stopped ? v.t.toFixed(2) : '?.??'; if (txt !== sc.clockTxt) { sc.clockTxt = txt; if (sc.clock) sc.scene.remove(sc.clock); sc.clock = sprite(txt, '#fff', 1.8); sc.clock.position.set(0, 2.2, 0); sc.scene.add(sc.clock); } } },
  hud() { const sc = G.sc, what = { ruleta: 'Detén la aguja en lo dorado', tren: 'Frena el tren en la raya roja', reloj: 'Detén el reloj en 5.00 s' }[sc.mode]; return `Intento ${Math.min(3, sc.r + 1)} de 3 · ${what}`; },
  final: () => G.sc.tries.reduce((a, b) => a + b, 0) + (3 - G.sc.tries.length) * 99,
};

// ---------- Pesca
K.pesca = {
  ctrl: 'tapscreen', cam: [0, 3.5, 6], look: [0, 0, -2], stage: true,
  build(sc) { addUnder(sc, G.p.ice ? { ...PAL.ice, under: 0x1864ab } : PAL.beach); sc.scene.background = new THREE.Color(G.p.ice ? 0xc5dcf5 : 0x99e9f2);
    if (G.p.ice) { const ice = mesh(new THREE.CylinderGeometry(6, 6, 0.3, 32), mat(0xe7f5ff)); ice.position.y = -0.75; sc.scene.add(ice); const hole = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.32, 20), mat(0x1864ab)); hole.position.set(0, -0.74, -2); sc.scene.add(hole); }
    sc.float = new THREE.Group(); sc.float.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(0xff2222))); const f2 = mesh(new THREE.SphereGeometry(0.19, 10, 8, 0, 6.28, Math.PI / 2, Math.PI / 2), mat(0xffffff)); sc.float.add(f2); sc.float.position.set(0, -0.75, -2); sc.scene.add(sc.float);
    sc.bites = L.fishBites(G.seed, G.myId, G.p); sc.pts = 0; sc.block = 0; sc.used = new Set(); sc.win = G.p.ice ? 800 : 950; },
  biteAt(now) { return G.sc.bites.findIndex(b => now >= b && now < b + G.sc.win); },
  onTap() { const sc = G.sc, now = G.now; if (!G.me || now < sc.block || G.finished) return; const i = K.pesca.biteAt(now);
    if (i >= 0 && !sc.used.has(i)) { sc.used.add(i); X('coin'); sc.pts += G.p.ice ? 2 : 1; flash(G.p.ice ? '🐟 +2' : '🐟 +1', 700); }
    else { sc.block = now + 1500; X('bad'); flash('😱 ¡Se espantó!', 900); } },
  tick(dt, now, m) { m.sc = G.sc.pts; },
  draw(now, t) { const sc = G.sc, i = K.pesca.biteAt(now), biting = G.me && i >= 0 && !sc.used.has(i); sc.float.position.y = -0.75 + (biting ? -0.25 : Math.sin(t * 2) * 0.04); sc.float.position.x = biting ? Math.sin(t * 40) * 0.05 : 0; },
  hud() { return `🎣 Puntos: ${G.sc.pts} · ¡Toca cuando el corcho se hunda!`; },
  final: () => G.sc.pts,
};

// ---------- Témpano / Balsa (empujones)
K.sumo = {
  ctrl: 'joy', physics: true, ...ARENA_CAM,
  extra() { return [dashBtn()]; },
  build(sc) { const tilt = G.p.tilt;
    addUnder(sc, { ...(tilt ? PAL.beach : PAL.ice), under: tilt ? 0x1c7ed6 : 0x1864ab });
    sc.water = sc.scene.children.find(o => o.geometry && o.geometry.type === 'PlaneGeometry');
    if (tilt) { sc.floe = new THREE.Group(); const raft = mesh(new THREE.BoxGeometry(L.RAFT * 2, 0.5, L.RAFT * 2), mat(0xc08552)); raft.position.y = -0.25; sc.floe.add(raft);
      for (let i = -4; i <= 4; i += 2) { const log = mesh(new THREE.CylinderGeometry(0.28, 0.28, L.RAFT * 2, 10), mat(0x8d5524)); log.rotation.z = Math.PI / 2; log.position.set(0, 0.02, i * 1.2); sc.floe.add(log); } }
    else { sc.floe = mesh(new THREE.CylinderGeometry(6.2, 5.6, 0.7, 14), mat(0xf1f8ff, { roughness: 0.25 })); sc.floe.position.y = -0.35; }
    sc.scene.add(sc.floe); },
  tick(dt, now, m) { if (m.st === 1) { m.y -= dt * 7; return; } if (L.fellOff('sumo', G.p, now, m.x, m.z)) { out('🌊 ¡Al agua!'); return; }
    if (G.over && !G.finished) done(G.dur, '🏆 ¡Último en pie!'); },
  draw(now, t) { const sc = G.sc;
    if (G.p.tilt) { const [wx, wz] = L.waveForce(now); sc.floe.rotation.z = -wx * 0.012; sc.floe.rotation.x = wz * 0.012; sc.floe.position.y = Math.sin(t * 1.7) * 0.08; }
    else { const r = L.sumoR(G.p, now) / 6.2; sc.floe.scale.set(r, 1, r); }
    if (sc.water) sc.water.position.y = -0.9 + Math.sin(t * 1.3) * 0.05; },
  hud() { return aliveHud() + ' · 💥 EMPUJÓN para empujar'; },
  final: () => G.dur,
};

// ---------- Saltarines (saltar pintando casillas)
K.saltarin = {
  ctrl: 'joy', selfMove: true, cam: [0, 10.5, 8.4], look: [0, 0, 0.9],
  build(sc) { addUnder(sc, PAL.candy); sc.cells = [];
    for (let c = 0; c < 64; c++) { const [x, z] = L.pisoCenter(c); const t = mesh(new THREE.BoxGeometry(1.42, 0.4, 1.42), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })); t.position.set(x, -0.2, z); sc.scene.add(t); sc.cells.push(t); }
    sc.cols = G.teams ? [TEAM_COL.A, TEAM_COL.B] : G.players.map((p, i) => p.color || PLAYER_COLS[i]); sc.last = ''; sc.boxM = {};
    if (G.me) { G.me.hopT = 0; G.me.hopFrom = [G.me.x, G.me.z]; G.me.hopTo = [G.me.x, G.me.z]; } },
  tick(dt, now, m) {
    const k = Math.min(1, (now - m.hopT) / L.SAL.hop); m.x = m.hopFrom[0] + (m.hopTo[0] - m.hopFrom[0]) * k; m.z = m.hopFrom[1] + (m.hopTo[1] - m.hopFrom[1]) * k; m.y = Math.sin(k * Math.PI) * 0.7;
    if (k >= 1 && now < G.dur) { let ix = G.input.x, iz = G.input.z; const kk = G.keys || {}; if (kk.ArrowLeft) ix = -1; if (kk.ArrowRight) ix = 1; if (kk.ArrowUp) iz = -1; if (kk.ArrowDown) iz = 1;
      let [nx, nz] = m.hopTo; if (Math.hypot(ix, iz) > 0.3) { if (Math.abs(ix) > Math.abs(iz)) nx += Math.sign(ix) * L.PISO.size; else nz += Math.sign(iz) * L.PISO.size; m.ry = Math.atan2(Math.abs(ix) > Math.abs(iz) ? Math.sign(ix) : 0, Math.abs(ix) > Math.abs(iz) ? 0 : Math.sign(iz)); }
      if (L.pisoCellAt(nx, nz) < 0) [nx, nz] = m.hopTo; m.hopFrom = m.hopTo; m.hopTo = [nx, nz]; m.hopT = now; m.mv = 1; }
    m.sc = G.counts[G.myId] || 0;
    const cash = G.x.cash; if (cash && cash[2] !== G.lastCash) { G.lastCash = cash[2]; if (cash[0] === G.myId) { X('coin'); flash(`⭐ +${cash[1]}`, 900); } } },
  draw(now, t) { const sc = G.sc, s = G.x.paint || ''; if (s !== sc.last) { sc.last = s; s.split(',').forEach((v, i) => { const c = sc.cells[i]; if (c) c.material.color.set(v === '-1' || v === '' ? '#ffffff' : sc.cols[+v]); }); }
    const live = new Set((G.x.boxes || []).map(b => b[0]));
    for (const [id, cell] of G.x.boxes || []) if (!sc.boxM[id]) { const b = mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), glow(0xffd43b, 0.5)); const [x, z] = L.pisoCenter(cell); b.position.set(x, 0.5, z); const st = sprite('⭐', '#fff', 0.6); st.position.y = 0.8; b.add(st); sc.scene.add(b); sc.boxM[id] = b; }
    for (const id of Object.keys(sc.boxM)) { if (!live.has(+id)) { sc.scene.remove(sc.boxM[id]); delete sc.boxM[id]; } else sc.boxM[id].rotation.y = t * 2; } },
  hud() { const best = Math.max(0, ...Object.values(G.counts)); return `⭐ Tus puntos: ${G.counts[G.myId] || 0} · Líder: ${best}`; },
  final: () => G.counts[G.myId] || 0,
};

// ---------- Defiende tu arco
K.arco = {
  hearts: (id, sc) => [sc, G.teams ? 8 : 5],
  ctrl: 'joy', cam: [0, 15.5, 5.2], look: [0, 0, 0.4],
  build(sc) { const H = L.ARCO.half; addUnder(sc, PAL.night);
    const floor = mesh(new THREE.BoxGeometry(H * 2 + 0.6, 0.4, H * 2 + 0.6), mat(0x2b8a3e, { flatShading: false })); floor.position.y = -0.2; sc.scene.add(floor);
    const A = L.arcoSides(G.players, G.teams); sc.side = A.map; sc.walls = [];
    const sideCol = G.teams ? [TEAM_COL.A, TEAM_COL.B, '#adb5bd', '#adb5bd'] : [0, 1, 2, 3].map(sd => { const id = Object.keys(A.map).find(i => A.map[i] === sd); const p = G.players.find(q => q.id === id); return p ? p.color : '#adb5bd'; });
    [[0, H + 0.2, H * 2, 0.4], [0, -H - 0.2, H * 2, 0.4], [-H - 0.2, 0, 0.4, H * 2], [H + 0.2, 0, 0.4, H * 2]].forEach(([x, z, w, d], sd) => {
      const wall = mesh(new THREE.BoxGeometry(w, 0.6, d), mat(new THREE.Color(sideCol[sd]).getHex())); wall.position.set(x, 0.3, z); sc.scene.add(wall); sc.walls.push(wall); });
    sc.balls = []; for (let i = 0; i < 4; i++) { const b = mesh(new THREE.SphereGeometry(0.35, 14, 10), glow(0xffffff, 0.3)); b.visible = false; sc.scene.add(b); sc.balls.push(b); }
    sc.livesTxt = '';
    // colocar a cada jugador en su lado
    const per = {}; G.players.forEach(p => { const sd = A.map[p.id]; per[sd] = (per[sd] || []).concat(p.id); });
    G.players.forEach(p => { const sd = A.map[p.id], list = per[sd], a = (list.indexOf(p.id) - (list.length - 1) / 2) * 2.5, [x, z] = L.arcoPos(sd, a);
      G.chars[p.id].g.position.set(x, 0, z); if (p.id === G.myId) Object.assign(G.me, { x, z, a, ry: sd === 0 ? Math.PI : sd === 1 ? 0 : sd === 2 ? Math.PI / 2 : -Math.PI / 2 }); }); },
  move(m, dx, dz) { const sd = G.sc.side[G.myId]; if ((G.x.lives || [])[sd] === 0) return; m.a = Math.max(-5.4, Math.min(5.4, (m.a || 0) + (sd < 2 ? dx : dz))); [m.x, m.z] = L.arcoPos(sd, m.a); m.ry = sd === 0 ? Math.PI : sd === 1 ? 0 : sd === 2 ? Math.PI / 2 : -Math.PI / 2; },
  tick(dt, now, m) { const sd = G.sc.side[G.myId], lives = G.x.lives || []; m.sc = Math.max(0, lives[sd] ?? 0); m.ry = sd === 0 ? Math.PI : sd === 1 ? 0 : sd === 2 ? Math.PI / 2 : -Math.PI / 2;
    const g = G.x.goal; if (g && g[1] !== G.lastGoal) { G.lastGoal = g[1]; if (g[0] === sd) { X('bad'); flash('😱 ¡Gol en tu arco!', 800); } else X('beep'); }
    if (lives[sd] === 0 && m.st !== 1) { m.st = 1; X('lose'); done(0, '💔 Sin vidas'); }
    if (G.over && !G.finished) done(Math.max(0, lives[sd] || 0), '🏆 ¡Resististe!'); },
  draw(now, t) { const sc = G.sc, b = G.x.balls || []; sc.balls.forEach((m, i) => { m.visible = !!b[i]; if (b[i]) { m.position.x += (b[i][0] - m.position.x) * 0.5; m.position.z += (b[i][1] - m.position.z) * 0.5; m.position.y = 0.35; } });
    (G.x.lives || []).forEach((v, sd) => { const w = sc.walls[sd]; if (w) { w.scale.y = v === 0 ? 2 : 1; w.position.y = v === 0 ? 0.6 : 0.3; if (v === 0) w.material.color.setHex(0x495057); } }); },
  hud() { const lives = G.x.lives || [], sd = G.sc.side[G.myId]; return `❤️ Tus vidas: ${Math.max(0, lives[sd] ?? 0)} · ` + ['Abajo', 'Arriba', 'Izq.', 'Der.'].map((n, i) => lives[i] >= 0 ? `${n} ${lives[i]}` : '').filter(Boolean).join(' · '); },
  final: () => Math.max(0, (G.x.lives || [])[G.sc.side[G.myId]] || 0),
};

// ---------- Guerra de globos de agua
K.agua = {
  ctrl: 'joy', cam: [0, 11, 9], look: [0, 0, 0.9],
  extra() { return [['💦 LANZAR', () => { const m = G.me; if (!m || m.st === 1 || G.now < (m.throwReady || 0)) return; m.throwReady = G.now + L.AGUA.cool; const a = m.ry || 0;
    G.send({ t: 'mgact', key: G.key, throw: [+m.x.toFixed(2), +m.z.toFixed(2), +Math.sin(a).toFixed(3), +Math.cos(a).toFixed(3)] }); X('jump'); }]]; },
  build(sc) { arenaCircle(sc, L.AGUA.R, PAL.grass); L.AGUA.crates.forEach(([x, z]) => { const c = mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat(0xc08552)); c.position.set(x, 0.6, z); sc.scene.add(c); });
    sc.pj = {}; sc.balloonM = [0x4dabf7, 0x74c0fc, 0x339af0].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, transparent: true, opacity: 0.9 })); },
  tick(dt, now, m) { const o = (G.x.out || {})[G.myId]; if (o != null && m.st !== 1) { m.st = 1; X('lose'); done(G.counts[G.myId] || 0, '💦 ¡Empapado!'); }
    const w = (G.x.wet || {})[G.myId] || 0; if (w !== G.lastWet) { if (w > (G.lastWet || 0)) { X('bad'); flash(`💦 ¡Te mojaron! (${w}/3)`, 800); } G.lastWet = w; }
    m.sc = G.counts[G.myId] || 0; if (G.over && !G.finished) done(G.counts[G.myId] || 0, '🏆 ¡Quedaste seco!'); },
  draw(now) { const sc = G.sc, seen = new Set();
    for (const e of G.ev || []) { seen.add(e.id); let o = sc.pj[e.id]; if (!o) { o = sc.pj[e.id] = mesh(new THREE.SphereGeometry(0.28, 12, 9), sc.balloonM[e.id % 3]); sc.scene.add(o); }
      const tt = Math.min((e.te || now) - e.t0, now - e.t0) / 1000, d = tt * L.AGUA.speed; o.position.set(e.x + e.dx * d, 0.9 + Math.sin(Math.min(1, d / L.AGUA.range) * Math.PI) * 0.8, e.z + e.dz * d);
      if (e.te && now > e.te) { o.scale.setScalar(Math.max(0.01, 1 + (now - e.te) / 120)); o.material = o.material; o.visible = now - e.te < 250; if (!o.userData.splash) { o.userData.splash = true; if (e.hit === G.myId || Math.random() < 0.3) X('whoosh'); } } }
    for (const id of Object.keys(sc.pj)) if (!seen.has(+id)) { sc.scene.remove(sc.pj[id]); delete sc.pj[id]; }
    for (const p of G.players) { const w = (G.x.wet || {})[p.id] || 0, ch = G.chars[p.id]; if (ch && ch.label) ch.label.material.color.setRGB(1 - w * 0.25, 1 - w * 0.15, 1); } },
  hud() { const w = (G.x.wet || {})[G.myId] || 0; return `💦 Golpes dados: ${G.counts[G.myId] || 0} · Mojado: ${w}/3 · ` + aliveHud(); },
  final: () => G.counts[G.myId] || 0,
};

// ---------- Ladrón de corona
K.corona = {
  ctrl: 'joy', ...ARENA_CAM,
  speed() { return G.x.holder === G.myId ? 0.9 : 1; },
  build(sc) { chaseBuild(sc, 6.5); const c = new THREE.Group(); const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.8, roughness: 0.25, emissive: 0x7a5200, emissiveIntensity: 0.4 });
    const ring = mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.3, 14, 1, true), gold); ring.material.side = THREE.DoubleSide; c.add(ring);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; const sp = mesh(new THREE.ConeGeometry(0.1, 0.32, 6), gold); sp.position.set(Math.cos(a) * 0.38, 0.28, Math.sin(a) * 0.38); c.add(sp); }
    const cm = window.Board3D && window.Board3D.prop ? window.Board3D.prop('crown') : null; if (cm) { c.clear(); cm.scale.setScalar(0.95); c.add(cm); }
    sc.crown = c; sc.scene.add(c); },
  tick(dt, now, m) { const h = G.x.holder; if (h !== G.lastHolder) { if (h === G.myId) { X('crown'); flash('👑 ¡Tienes la corona!', 800); } else if (G.lastHolder === G.myId) { X('bad'); flash('😱 ¡Te la robaron!', 800); } G.lastHolder = h; }
    m.st = h === G.myId ? 2 : 0; m.sc = G.counts[G.myId] || 0; },
  draw(now, t) { const h = G.chars[G.x.holder]; G.sc.crown.visible = !!h; if (h) { G.sc.crown.position.copy(h.g.position); G.sc.crown.position.y += 2.3 + Math.sin(t * 4) * 0.08; G.sc.crown.rotation.y = t * 2; } },
  hud() { const best = Math.max(0, ...Object.values(G.counts)); return `👑 Tu tiempo: ${((G.counts[G.myId] || 0) / 1000).toFixed(1)} s · Líder: ${(best / 1000).toFixed(1)} s` + (G.x.holder === G.myId ? ' · ¡HUYE!' : ''); },
  final: () => G.counts[G.myId] || 0,
};

/* ======================= HUD y controles ======================= */
const css = document.createElement('style');
css.textContent = `#mgui{position:fixed;inset:0;z-index:7;pointer-events:none;font-family:'Baloo 2',system-ui,sans-serif;color:#fff}
#mgui .mg-title,#mgui .mg-msg,#mgui .mg-btns button{font-family:'Luckiest Guy','Baloo 2',sans-serif!important;font-weight:400!important;letter-spacing:.03em}
#mgui .mg-top{position:absolute;left:4px;right:4px;top:calc(env(safe-area-inset-top) + 6px);display:flex;align-items:flex-start;justify-content:center;gap:5px}
#mgui .mg-pl{flex:1;display:flex;gap:3px;min-width:0}#mgui .mg-pl.L{justify-content:flex-end}#mgui .mg-pl.R{justify-content:flex-start}
#mgui .pc{--c:#fff;position:relative;width:46px;display:flex;flex-direction:column;align-items:center;transition:transform .15s,filter .3s}
#mgui .pc .ring{width:40px;height:40px;border-radius:50%;border:3px solid var(--c);overflow:hidden;background:#fff;box-shadow:0 3px 0 #0007;box-sizing:border-box}
#mgui .pc .ring img{width:100%;height:100%;object-fit:cover;display:block}
#mgui .pc .v{margin-top:-9px;min-width:28px;max-width:52px;padding:1px 5px 0;border-radius:9px;background:#1e0b3a;border:2px solid var(--c);font:400 .86rem 'Luckiest Guy',sans-serif;text-align:center;line-height:1.3;white-space:nowrap;overflow:hidden;box-sizing:border-box}
#mgui .pc .hp{font-size:.56rem;line-height:1;margin-top:2px;white-space:nowrap;letter-spacing:-1px;text-shadow:0 1px 1px #000}
#mgui .pc.me .ring{box-shadow:0 0 0 2px #fff,0 0 12px 2px #fcc419}#mgui .pc.me .v{background:#fcc419;color:#1e0b3a;border-color:#fff}
#mgui .pc.out{filter:grayscale(1) brightness(.55)}#mgui .pc.up .v{animation:pcup .35s ease-out}#mgui .pc.hurt{animation:pchurt .5s}
#mgui .pc .cr{position:absolute;top:-13px;font-size:.95rem;display:none;filter:drop-shadow(0 1px 1px #000)}#mgui .pc.lead .cr{display:block;animation:pcup .6s}
#mgui.many .pc{width:40px}#mgui.many .pc .ring{width:34px;height:34px}#mgui.many .pc .v{font-size:.76rem;min-width:24px}
#mgui .mg-clock{flex:0 0 auto;min-width:62px;height:56px;padding:0 6px;border-radius:16px;background:#1e0b3af0;border:3px solid #fcc419;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 0 #0007;box-sizing:border-box}
#mgui .mg-time{font:400 2.1rem 'Luckiest Guy',sans-serif;color:#fff;line-height:1;padding-top:5px}
#mgui .mg-clock.hurry{border-color:#ff6b6b;animation:hurry .5s infinite alternate}#mgui .mg-clock.hurry .mg-time{color:#ff6b6b}
#mgui .mg-sub{position:absolute;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 70px);text-align:center;font-size:.78rem;font-weight:800;line-height:1.25;text-shadow:0 1px 3px #000}
#mgui .mg-sub span{background:#1e0b3ab0;border-radius:10px;padding:2px 9px;display:inline-block;max-width:100%}
#mgui .mg-title{color:#fcc419;font-size:.8rem}#mgui .mg-score{font-weight:800}
#mgui .bar{display:none}
#mgui .mg-fin{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:400 5.2rem 'Luckiest Guy',sans-serif;color:#fcc419;-webkit-text-stroke:6px #1e0b3a;paint-order:stroke fill;text-shadow:0 10px 0 #1e0b3a;animation:finpop .7s cubic-bezier(.2,1.6,.4,1);pointer-events:none}
@keyframes pcup{0%{transform:scale(1)}40%{transform:scale(1.45)}100%{transform:scale(1)}}
@keyframes pchurt{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px) rotate(-6deg)}40%{transform:translateX(5px) rotate(6deg)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes hurry{from{transform:scale(1)}to{transform:scale(1.1)}}
@keyframes finpop{0%{transform:scale(3) rotate(-12deg);opacity:0}40%{transform:scale(.9) rotate(3deg);opacity:1}100%{transform:scale(1)}}
#mgui .mg-msg{position:absolute;left:0;right:0;top:38%;text-align:center;font-size:2.2rem;font-weight:900;text-shadow:0 3px 0 #1e0b3a,0 0 12px #000;padding:0 10px}
#mgui .mg-joy{position:absolute;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.16);border:3px solid rgba(255,255,255,.4);display:none;transform:translate(-50%,-50%)}
#mgui .mg-knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;background:rgba(255,255,255,.8)}
#mgui .mg-btns{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 16px);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;pointer-events:none}
#mgui .mg-btns button{pointer-events:auto;width:96px;height:96px;border-radius:50%;border:0;font:900 1.1rem system-ui;color:#1e0b3a;background:#fcc419;box-shadow:0 5px 0 #b8860b;touch-action:none;margin:0}
#mgui .mg-btns.wide{justify-content:center}#mgui .mg-btns.wide button{border-radius:20px;height:84px;font-size:1.8rem}
#mgui .mg-btns.race{justify-content:space-between}#mgui .mg-btns.race3 button{width:30%!important}#mgui .mg-btns.race button{width:44%;height:110px;border-radius:24px;font-size:2rem}
#mgui .mg-btns button.on{transform:translateY(4px);box-shadow:0 1px 0 #b8860b}#mgui .mg-btns button:disabled{opacity:1}
#mgui .hint{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 130px);text-align:center;font-weight:700;opacity:.85;text-shadow:0 2px 4px #000;padding:0 12px}`;
document.head.appendChild(css);

// Moneda 3D (modelo de Meshy si ya cargó; si no, un cilindro). De pie, mirando al frente; d = diámetro.
function coinObj(d, color) {
  const g = new THREE.Group(), m = window.Board3D && window.Board3D.prop ? window.Board3D.prop('coin') : null;
  if (m) { if (color != null) { const mm = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 }); m.traverse(o => { if (o.isMesh) o.material = mm; }); } m.scale.setScalar(d); g.add(m); }
  else { const o = mesh(new THREE.CylinderGeometry(d / 2, d / 2, d * 0.13, 18), new THREE.MeshStandardMaterial({ color: color ?? 0xffc928, metalness: 0.7, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: color == null ? 0.35 : 0 })); o.rotation.x = Math.PI / 2; g.add(o); }
  return g;
}
/* ---------- Marcador estilo fiesta: tarjetas de jugadores arriba y reloj al medio ---------- */
function buildCards() {
  const hud = G.hud, ps = G.players, n = ps.length, half = Math.ceil(n / 2), L0 = hud.querySelector('.mg-pl.L'), R0 = hud.querySelector('.mg-pl.R');
  hud.classList.toggle('many', n > 6); G.cards = {};
  ps.forEach((p, i) => { const ch = (window.FIESTA_CHARS || []).find(c => c.emoji === p.emoji), tc = G.teamOf(p.id), col = tc ? (tc === 'A' ? '#4dabf7' : '#ff6b6b') : p.color;
    const el = document.createElement('div'); el.className = 'pc' + (p.id === G.myId ? ' me' : ''); el.style.setProperty('--c', col);
    el.innerHTML = `<span class="cr">👑</span><div class="ring">${ch ? `<img src="models/${ch.id}.jpg" alt="">` : `<span style="font-size:1.6rem">${p.emoji}</span>`}</div><div class="v">0</div><div class="hp"></div>`;
    (i < half ? L0 : R0).appendChild(el); G.cards[p.id] = { el, v: el.querySelector('.v'), hp: el.querySelector('.hp'), sc: null, st: 0, h: null }; });
}
function scoreOf(id) { const k = G.K; if (k.scoreOf) return k.scoreOf(id); if (id === G.myId && G.me) return G.me.sc || 0; return (G.net[id] || [])[5] || 0; }
function hudTick(now) {
  if (!G.cards) buildCards();
  const meta = L.BYID[G.type], fmt = meta.fmt, k = G.K; let lead = null, best = 0;
  for (const p of G.players) { const c = G.cards[p.id], sc = Math.round(scoreOf(p.id)), st = stOf(p.id), hearts = k.hearts ? k.hearts(p.id, sc) : null; let txt;
    if (hearts) { txt = st === 1 || hearts[0] <= 0 ? '💀' : String(hearts[0]); const hh = '❤️'.repeat(Math.max(0, hearts[0])) + '🖤'.repeat(Math.max(0, hearts[1] - Math.max(0, hearts[0]))); if (c.hp.textContent !== hh) c.hp.textContent = hh; }
    else if (fmt === 'surv' || fmt === 'tag') txt = st === 1 ? '💀' : st === 3 ? '🏁' : '❤️';
    else if (fmt === 'secs') txt = (sc / 1000).toFixed(1);
    else if (fmt === 'time') txt = st === 3 ? '🏁' : String(sc);
    else if (fmt === 'ms') txt = st === 3 || sc > 0 ? '✔' : '…';
    else txt = String(sc);
    if (c.v.textContent !== txt) c.v.textContent = txt;
    if (c.sc != null && sc > c.sc && !hearts) { c.el.classList.remove('up'); void c.el.offsetWidth; c.el.classList.add('up'); }
    if (hearts && c.h != null && hearts[0] < c.h) { c.el.classList.remove('hurt'); void c.el.offsetWidth; c.el.classList.add('hurt'); X(p.id === G.myId ? 'hurt' : 'pop'); }
    if (st === 1 && c.st !== 1) { c.el.classList.add('out'); if (p.id !== G.myId) X('pop'); } else if (st !== 1 && c.st === 1) c.el.classList.remove('out');
    c.sc = sc; c.st = st; c.h = hearts ? hearts[0] : null;
    if (['count', 'pts', 'goals', 'secs'].includes(fmt) && sc > best) { best = sc; lead = p.id; } }
  for (const p of G.players) G.cards[p.id].el.classList.toggle('lead', p.id === lead);
  // reloj
  const rem = Math.max(0, G.dur - now), secs = Math.ceil(rem / 1000), tEl = G.hud.querySelector('.mg-time'), clock = G.hud.querySelector('.mg-clock');
  if (tEl.textContent !== String(secs)) { tEl.textContent = secs;
    if (rem > 0 && secs <= 10 && G.dur >= 15000 && !G.finShown) { X(secs <= 3 ? 'tickhi' : 'tick'); if (!G.hurry) { G.hurry = true; clock.classList.add('hurry'); flash('⏰ ¡ÚLTIMOS 10 SEGUNDOS!', 1200); X('v_hurry'); if (window.SFX && SFX.tempo) SFX.tempo(1.18); } } }
  if ((rem <= 0 || G.over) && !G.finShown) { G.finShown = true; clock.classList.remove('hurry'); if (window.SFX && SFX.tempo) SFX.tempo(1);
    const f = document.createElement('div'); f.className = 'mg-fin'; f.textContent = '¡FIN!'; G.hud.appendChild(f); X('whistle'); if (rem <= 0) setTimeout(() => X('v_timeover'), 450); setTimeout(() => f.remove(), 1600); }
}
function makeHud() {
  const d = document.createElement('div'); d.id = 'mgui';
  d.innerHTML = `<div class="mg-top"><div class="mg-pl L"></div><div class="mg-clock"><div class="mg-time"></div></div><div class="mg-pl R"></div></div>
    <div class="mg-sub"><span><b class="mg-title"></b> · <b class="mg-score"></b></span><div class="bar"><div id="mgtb"></div></div></div>
    <div class="mg-msg"></div><div class="mg-joy"><div class="mg-knob"></div></div><div class="mg-btns"></div>`;
  document.body.appendChild(d); return d;
}
function flash(text, ms) { if (!G || !G.hud) return; const el = G.hud.querySelector('.mg-msg'); el.textContent = text || ''; clearTimeout(G.flashT); if (ms) G.flashT = setTimeout(() => { if (G && G.hud) el.textContent = ''; }, ms); }
function refreshButtons() { if (!G || !G.hud || !G.me) return; const k = G.K; if (k.ctrl !== 'buttons') return; const b = G.hud.querySelector('.mg-btns'); b.className = 'mg-btns wide'; b.innerHTML = k.buttons();
  b.querySelectorAll('button').forEach(x => x.addEventListener('pointerdown', e => { e.preventDefault(); x.classList.add('on'); setTimeout(() => x.classList.remove('on'), 100); k.onButton(+x.dataset.i); })); }

function setupControls() {
  const hud = G.hud, joy = hud.querySelector('.mg-joy'), knob = hud.querySelector('.mg-knob'), btns = hud.querySelector('.mg-btns'), k = G.K;
  const cvs = window.Board3D.canvas, listeners = []; let jid = null, ox = 0, oy = 0;
  const on = (el, ev, f, o) => { el.addEventListener(ev, f, o); listeners.push([el, ev, f, o]); };
  const btn = (html, f, cls) => { const b = document.createElement('button'); b.innerHTML = html; on(b, 'pointerdown', e => { e.preventDefault(); b.classList.add('on'); f(); setTimeout(() => b.classList.remove('on'), 90); }); btns.appendChild(b); if (cls) btns.className = 'mg-btns ' + cls; return b; };
  const hint = t => { if (t) hud.insertAdjacentHTML('beforeend', `<div class="hint">${t}</div>`); };
  const ctrl = k.ctrl;
  if (ctrl === 'joy' || ctrl === 'joyjump') {
    if (ctrl === 'joyjump') btn('SALTA', () => { G.input.jump = true; });
    const extra = k.extra ? k.extra() : []; extra.forEach(([label, f]) => btn(label, f));
    hint('Arrastra el dedo para moverte' + (ctrl === 'joyjump' ? ' · SALTA para saltar' : '') + extra.map(e => ' · ' + e[0]).join(''));
    on(cvs, 'pointerdown', e => { if (jid != null) return; jid = e.pointerId; ox = e.clientX; oy = e.clientY; joy.style.display = 'block'; joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; knob.style.transform = ''; });
    on(window, 'pointermove', e => { if (e.pointerId !== jid) return; let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy), mm = 55;
      if (d > mm) { dx = dx / d * mm; dy = dy / d * mm; } knob.style.transform = `translate(${dx}px,${dy}px)`; G.input.x = dx / mm; G.input.z = dy / mm; });
    const end = e => { if (e.pointerId !== jid) return; jid = null; joy.style.display = 'none'; G.input.x = 0; G.input.z = 0; };
    on(window, 'pointerup', end); on(window, 'pointercancel', end);
  } else if (ctrl === 'tap2') { btn('◀ IZQ', () => k.tap('L'), 'race'); btn('DER ▶', () => k.tap('R')); hint('¡Toca IZQ y DER alternando!'); }
  else if (ctrl === 'mash') { btn('¡TOCA!', () => k.tap(), 'wide').style.width = '80%'; hint('¡Toca lo más rápido que puedas!'); }
  else if (ctrl === 'lanes') { btn('◀', () => k.lane(-1), k.extra ? 'race race3' : 'race'); (k.extra ? k.extra() : []).forEach(([l, f]) => btn(l, f)); btn('▶', () => k.lane(1)); hint(G.kind === 'encaja' ? 'Cambia de carril · 🙇 para agacharte' : 'Cambia de carril: junta monedas y esquiva rocas'); }
  else if (ctrl === 'stop') { btn('✋ ¡ALTO!', () => k.onStop(), 'wide').style.width = '80%'; }
  else if (ctrl === 'buttons') refreshButtons();
  if (ctrl === 'tapscreen') { const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    on(cvs, 'pointerdown', e => { v.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(v, G.sc.camera); if (k.onTap) k.onTap(ray); });
    hint({ tiro: 'Toca los objetivos en la pantalla', reflejo: 'Toca la pantalla apenas veas la señal', torre: 'Toca la pantalla para soltar el bloque', pesca: 'Toca la pantalla cuando el corcho se hunda', canon: 'Toca el piso para disparar' }[G.kind]); }
  const keys = {};
  on(window, 'keydown', e => { keys[e.key] = true; if (e.repeat) return;
    if ((e.key === 'x' || e.key === 'Shift') && k.extra) { const ex = k.extra(); if (ex[0]) ex[ex.length - 1][1](); }
    if (e.key === ' ' && k.extra && k.extra()[0] && k.ctrl === 'joy') k.extra()[0][1]();
    if (e.key === ' ') { G.input.jump = true; if (k.onStop) k.onStop(); if (ctrl === 'tapscreen' && k.onTap && G.kind !== 'tiro' && G.kind !== 'canon') k.onTap(); if (ctrl === 'mash') k.tap(); }
    if (ctrl === 'tap2' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) k.tap(e.key === 'ArrowLeft' ? 'L' : 'R');
    if (ctrl === 'lanes' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) k.lane(e.key === 'ArrowLeft' ? -1 : 1); });
  on(window, 'keyup', e => { keys[e.key] = false; });
  G.keys = keys; G.cleanup = () => listeners.forEach(([el, ev, f, o]) => el.removeEventListener(ev, f, o));
}

/* ======================= Ciclo de vida ======================= */
function stOf(id) { return id === G.myId && G.me ? G.me.st : ((G.net[id] || [])[4] || 0); }
function done(score, msg) { if (!G || G.finished || !G.me) return; G.finished = true; const d = G.done; setTimeout(() => d && d(score), 0); if (msg) flash(msg); }
function out(msg) { const m = G.me; if (m.st === 1) return; m.st = 1; X('lose'); done(Math.round(G.now), msg || '¡Fuera!'); }

function prepare({ type, seed, players, myId, dur, key, teams, format }) {
  if (G && G.key === key) return;
  stop();
  const B = window.Board3D; if (!B || !B.ok) return;
  const def = L.BYID[type]; if (!def) return;
  const kind = def.kind, k = K[kind];
  const teamOf = id => teams ? (teams.A.includes(id) ? 'A' : 'B') : null;
  G = { type, kind, K: k, p: def.p, seed, players, myId, dur, key, teams, format, teamOf, started: false, chars: {}, taken: {}, counts: {}, localTaken: new Set(), net: {}, x: {}, ev: [], now: 0, fx: [] };
  const sc = baseScene(sceneOf(def.p).sky, kind === 'carrera' || kind === 'corredor' ? 70 : 55); G.sc = sc;
  sc.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 300);
  const meIdx = players.findIndex(p => p.id === myId);
  G.me = meIdx >= 0 ? { x: 0, z: 0, y: 0, ry: 0, st: 0, sc: 0, mv: 0, vy: 0, v: 0, dist: 0, stunUntil: 0, last: null, vx: 0, vz: 0 } : null;
  players.forEach((p, i) => {
    const tc = teamOf(p.id), ch = B.spawnChar(p.emoji, tc ? TEAM_COL[tc] : p.color, p.id === myId ? 'Tú' : p.name);
    const [x, z] = L.spawnPos(kind, i, players.length);
    ch.g.position.set(x, 0, z); ch.g.rotation.y = ['carrera', 'corredor', 'bolas'].includes(kind) ? Math.PI : k.stage ? 0 : Math.atan2(-x, -z);
    sc.scene.add(ch.g); G.chars[p.id] = ch;
    if (p.id === myId) Object.assign(G.me, { x, z, ry: ch.g.rotation.y });
  });
  k.build(sc);
  if (kind === 'cuerda' && teams) players.forEach(p => { const [x, z] = k.place(p.id); G.chars[p.id].g.position.set(x, 0, z); if (p.id === myId) Object.assign(G.me, { x, z }); });
  placeCamera(0, true);
  B.setOverlay({ frame });
}
function start({ send, done: d, practice }) {
  if (!G || G.started) return;
  G.started = true; G.t0 = performance.now(); G.send = send; G.done = d; G.finished = false; G.lastSent = 0;
  G.hud = makeHud(); G.input = { x: 0, z: 0, jump: false };
  G.hud.querySelector('.mg-title').textContent = (practice ? '🏋️ PRÁCTICA · ' : '') + L.BYID[G.type].icon + ' ' + L.BYID[G.type].name;
  if (G.me) { setupControls(); flash('¡YA!', 700); } else { flash('👀 Mirando', 1800); G.hud.querySelector('.mg-msg').style.top = '72%'; }
}
function stop() {
  if (!G) return;
  const B = window.Board3D; if (B && B.ok) B.setOverlay(null);
  if (G.K && G.K.stopX) G.K.stopX(); if (window.SFX && SFX.tempo) SFX.tempo(1); if (G.hud) G.hud.remove(); if (G.cleanup) G.cleanup();
  G.sc.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  G = null;
}
function net(msg) {
  if (!G || msg.key !== G.key) return;
  for (const [id, a] of Object.entries(msg.p || {})) if (id !== G.myId) G.net[id] = a;
  if (msg.taken) G.taken = msg.taken; if (msg.counts) G.counts = msg.counts; if (msg.ev) G.ev = msg.ev; if (msg.x) G.x = msg.x;
  if (msg.over) G.over = true;
}

/* ======================= Cuadro a cuadro ======================= */
function frame(dt, t) {
  if (!G) return null;
  const sc = G.sc, k = G.K, now = G.started ? performance.now() - G.t0 : 0, prev = G.now; G.now = now;
  const m = G.me;
  if (G.started && m) {
    const ctrl = k.ctrl;
    if (ctrl === 'joy' || ctrl === 'joyjump') {
      let ix = G.input.x, iz = G.input.z; const kk = G.keys || {};
      if (kk.ArrowLeft || kk.a) ix -= 1; if (kk.ArrowRight || kk.d) ix += 1; if (kk.ArrowUp || kk.w) iz -= 1; if (kk.ArrowDown || kk.s) iz += 1;
      const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
      const can = (m.st === 0 || (m.st === 2 && ['colina', 'zombi', 'papa', 'corona'].includes(G.kind))) && now < G.dur && now > m.stunUntil;
      const sp = L.SPEED * (k.speed ? k.speed() : 1);
      // empujones recibidos (los decide el anfitrión)
      const pu = (G.x.push || {})[G.myId]; if (pu && pu[0] !== G.pushSeq) { G.pushSeq = pu[0]; m.vx += pu[1]; m.vz += pu[2]; m.stunUntil = Math.max(m.stunUntil, now + 250); X('hit'); }
      if (k.selfMove) { /* la mecánica mueve al personaje */ }
      else if (k.physics) { const ice = !!G.p.ice, acc = ice ? 9 : 16, fr = ice ? 0.9 : G.p.tilt ? 2.2 : 3.6;
        if (can || (m.st === 2 && now > m.stunUntil)) { m.vx += ix * acc * dt; m.vz += iz * acc * dt; }
        if (G.p.tilt && m.st !== 1) { const [wx, wz] = L.waveForce(now); m.vx += wx * dt; m.vz += wz * dt; }
        const f = Math.exp(-dt * fr); m.vx *= f; m.vz *= f; const v = Math.hypot(m.vx, m.vz);
        if (m.st !== 1) { m.x += m.vx * dt; m.z += m.vz * dt; } m.mv = v > 0.4 ? 1 : 0; if (il > 0.12) m.ry = Math.atan2(ix, iz); else if (v > 0.4) m.ry = Math.atan2(m.vx, m.vz); }
      else if (G.p.ice) { if (can) { m.vx += ix * sp * 2.2 * dt; m.vz += iz * sp * 2.2 * dt; } const f = Math.exp(-dt * 0.9); m.vx *= f; m.vz *= f; const v = Math.hypot(m.vx, m.vz); if (v > sp * 1.1) { m.vx *= sp * 1.1 / v; m.vz *= sp * 1.1 / v; }
        if (m.st !== 1) { m.x += m.vx * dt; m.z += m.vz * dt; } m.mv = v > 0.4 ? 1 : 0; if (v > 0.4) m.ry = Math.atan2(m.vx, m.vz); }
      else if (can && il > 0.12) { if (k.move) k.move(m, ix * sp * dt, iz * sp * dt); else { m.x += ix * sp * dt; m.z += iz * sp * dt; } m.ry = Math.atan2(ix, iz); m.mv = 1; } else m.mv = 0;
      const clamp = L.arenaOf(G.kind, G.p); if (clamp && m.st !== 1 && !k.selfMove) [m.x, m.z] = clamp(m.x, m.z);
    }
    if (k.tick) k.tick(dt, now, m, prev);
    if (now >= G.dur && !G.finished) done(k.final ? k.final() : G.dur, k.final ? '¡Tiempo!' : '¡Sobreviviste!');
    if (now - G.lastSent > 95) { G.lastSent = now; G.send({ t: 'mgpos', key: G.key, a: [+m.x.toFixed(2), +m.z.toFixed(2), +m.y.toFixed(2), +(m.ry || 0).toFixed(2), m.st, Math.round(m.sc || 0), m.mv] }); }
  }
  if (G.started) { const s = G.hud.querySelector('.mg-score'); if (s && now - (G.hudT || 0) > 120) { G.hudT = now; try { s.textContent = (G.me ? '' : '👀 ') + k.hud(); } catch (e) { s.textContent = ''; } hudTick(now); } }
  if (k.draw) k.draw(now, t);
  // personajes
  const off = k.offset ? k.offset() : null;
  G.players.forEach(p => {
    const ch = G.chars[p.id]; if (!ch) return;
    let x, z, y, ry, st, mv;
    if (p.id === G.myId && m) { ({ x, z, y, ry, st } = m); mv = m.mv; if (off) { const o = off(p.id); x += o[0]; z += o[1]; } ch.g.position.set(x, y, z); }
    else { const a = G.net[p.id];
      if (a) { [x, z, y, ry, st, , mv] = a; if (off) { const o = off(p.id); x += o[0]; z += o[1]; } const kk = 1 - Math.exp(-dt * 12); ch.g.position.x += (x - ch.g.position.x) * kk; ch.g.position.z += (z - ch.g.position.z) * kk; ch.g.position.y += (y - ch.g.position.y) * kk; }
      else { st = 0; mv = 0; ry = ch.g.rotation.y; } }
    if (k.stage && G.kind !== 'cuerda') ry = G.kind === 'torre' ? 0.6 : G.kind === 'reflejo' ? (ch.g.position.x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    const d = L.wrap((ry || 0) - ch.g.rotation.y); ch.g.rotation.y += d * Math.min(1, dt * 14);
    ch.setWalking(mv === 1 || (G.kind === 'cuerda' && G.started && now < G.dur)); ch.update(dt);
    const cs = ch.baseScale || (['carrera', 'corredor', 'laberinto', 'karts'].includes(G.kind) ? 1 : 1.3);
    if (st === 1 && ['bolas', 'meteoros', 'canon'].includes(G.kind)) ch.g.scale.set(cs * 1.3, cs * 0.15, cs * 1.3); else if (mv === 2) ch.g.scale.set(cs * 1.15, cs * 0.5, cs * 1.15); else ch.g.scale.setScalar(cs);
    if (st === 2 && ['monedas', 'meteoros'].includes(G.kind)) ch.g.rotation.y += dt * 12;
    if (st === 1 && ['cazador', 'papa'].includes(G.kind)) { ch.g.rotation.x = -1.4; ch.g.position.y = 0.2; } else ch.g.rotation.x = 0;
    ch.g.visible = !(G.kind === 'tiro' || G.kind === 'bolos') && !(st === 1 && ch.g.position.y < -6);
    if (ch.label) ch.label.material.opacity = st === 1 ? 0.35 : 1;
  });
  // que nadie se pierda: flecha sobre mí y nombres más grandes cuando la cámara está lejos
  const lab = Math.max(1, (G.camDist || 12) / 12);
  G.players.forEach(p => { const ch = G.chars[p.id]; if (!ch || !ch.label) return; ch.label.userData.base = ch.label.userData.base || ch.label.scale.clone(); const b = ch.label.userData.base; ch.label.scale.set(b.x * lab, b.y * lab, 1); ch.label.position.y = 1.75 + (lab - 1) * 0.5; });
  const myCh = G.chars[G.myId];
  if (myCh && G.me && G.me.st !== 1) { if (!G.arrow) { G.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 4), new THREE.MeshBasicMaterial({ color: 0xffd43b })); G.arrow.rotation.x = Math.PI; sc.scene.add(G.arrow); }
    G.arrow.visible = !G.K.stage && !['tiro', 'bolos'].includes(G.kind); G.arrow.scale.setScalar(lab); G.arrow.position.copy(myCh.g.position); G.arrow.position.y += (myCh.baseScale || 1.3) * 1.35 + 1.1 * lab + Math.sin(t * 6) * 0.15; G.arrow.rotation.y += dt * 3; }
  else if (G.arrow) G.arrow.visible = false;
  if (G.started && G.me && G.me.st === 1 && !G.spectFlash) { G.spectFlash = true; setTimeout(() => flash('👀 Mirando el resto del juego', 1800), 1300); }
  for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; f.t += dt; f.o.position.y += dt; f.o.material.opacity = 1 - f.t; if (f.t > 1) { sc.scene.remove(f.o); G.fx.splice(i, 1); } }
  placeCamera(dt, false);
  return [sc.scene, sc.camera];
}
// Tamaño de cada arena (mitad del ancho) para la vista panorámica
const ARENA_R = { piso: 6.5, monedas: 7.2, barra: 7.2, bolas: 6.5, meteoros: 7.2, cazador: 7.6, zombi: 7.6, papa: 6.6, corona: 7.2, canon: 8, pintar: 6.6, saltarin: 6.6,
  sumo: 6.6, colina: 7.6, arco: 6.8, agua: 7.6, futbol: 8.2, voley: 7, gigante: 7.6, portero: 6.5, laberinto: 9, escondite: 7.8, karts: 14 };
const stOfP = id => id === G.myId && G.me ? G.me.st : ((G.net[id] || [])[4] || 0);
// Encuadra a todos los jugadores vivos (o toda la arena si all=true) usando la dirección de cámara de la mecánica
function fitCam(all) {
  const sc = G.sc, cam = sc.camera, k = G.K, R = ARENA_R[G.kind] || 7.5;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
  if (!all) G.players.forEach(p => { const ch = G.chars[p.id]; if (!ch || stOfP(p.id) === 1) return; const q = ch.g.position; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); n++; });
  if (all || n === 0) { x0 = -R; x1 = R; z0 = -R; z1 = R; }
  const m = all ? 0.6 : 1.8, half = all ? R : 3.6; // margen y tamaño mínimo
  let cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = Math.max(half * 2, x1 - x0 + m * 2), D = Math.max(half * 2, z1 - z0 + m * 2);
  if (!all) { cx = Math.max(-R, Math.min(R, cx)); cz = Math.max(-R, Math.min(R, cz)); }
  const base = k.cam && k.look ? [k.cam[0] - k.look[0], k.cam[1] - k.look[1], k.cam[2] - k.look[2]] : [0, 10.5, 7.5], bl = Math.hypot(...base), dir = base.map(v => v / bl);
  // en vertical, a quien solo mira se le gira la cancha alargada para que llene la pantalla
  if (all && cam.aspect < 1 && ['futbol', 'voley'].includes(G.kind) && (!G.me || G.me.st === 1)) { [dir[0], dir[2]] = [dir[2], -dir[0]]; [W, D] = [D, W]; }
  const vf = cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
  const tilt = Math.max(0.35, dir[1]); // con cámara inclinada, la profundidad se ve más corta
  const dist = Math.max(all ? 8 : 9, (W / 2) / Math.tan(hf / 2) * 1.14, (D / 2) * tilt / Math.tan(vf / 2) * 1.3);
  return [[cx + dir[0] * dist, dir[1] * dist, cz + dir[2] * dist], [cx, 0, cz + 0.3]];
}
function placeCamera(dt, snap) {
  const sc = G.sc, cam = sc.camera, asp = innerWidth / innerHeight, k = G.K;
  if (cam.aspect !== asp) { cam.aspect = asp; cam.fov = asp < 1 ? 58 : 46; cam.updateProjectionMatrix(); }
  let P, Lk;
  // ¿estoy mirando? (no juego, me eliminaron o ya terminé y no sigo en la arena)
  const spectate = !G.me || G.me.st === 1 || (G.finished && G.me.st === 3)
    || ['futbol', 'voley', 'arco', 'portero', 'pintar', 'saltarin'].includes(G.kind) // aquí hay que ver toda la cancha
    || (G.kind === 'canon' && G.sc.gunner === G.myId);
  const leader = () => { let best = null, bz = Infinity; G.players.forEach(p => { const ch = G.chars[p.id]; if (ch && ch.g.position.z < bz) { bz = ch.g.position.z; best = ch; } }); return best; };
  const custom = k.camPos ? k.camPos() : null;
  if (!G.started && !k.stage && G.kind !== 'karts') { const R = ARENA_R[G.kind] || 8, a = performance.now() / 3800; P = [Math.sin(a) * R * 1.5, R * 1.05, Math.cos(a) * R * 1.5]; Lk = [0, 0, 0]; }
  else if (spectate && ARENA_R[G.kind] && (custom || !k.stage) && !k.follow && !k.follow2 && !['escalada', 'relevos'].includes(G.kind)) [P, Lk] = fitCam(true);
  else if (spectate && G.kind === 'escalada') { let top = null; G.players.forEach(p => { const ch = G.chars[p.id]; if (ch && stOfP(p.id) !== 1 && (!top || ch.g.position.y > top.g.position.y)) top = ch; }); const q = top ? top.g.position : new THREE.Vector3(0, 2, 0); P = [q.x * 0.3, q.y + 6, q.z + 11]; Lk = [q.x * 0.5, q.y + 0.5, q.z * 0.5]; }
  else if (custom) [P, Lk] = custom;
  else if (k.follow) { const me = spectate ? leader() : G.chars[G.myId]; const z = me ? me.g.position.z : 0, x = me ? me.g.position.x : 0; P = [x + 1.1, 4.3, z + 6.8]; Lk = [x - 0.2, 0.8, z - 5]; }
  else if (k.follow2) { const z = G.me ? G.me.z : -L.runnerDist(G.now, G.p), x = G.sc.x0 || 0; P = [x, 3.6, z + 6]; Lk = [x, 0.6, z - 6]; }
  else if (k.stage) { const wide = Math.min(1.5, Math.max(1, 0.62 / asp)); P = [k.cam[0], k.cam[1] * wide, k.cam[2] * wide]; Lk = k.look; }
  else [P, Lk] = fitCam(false);
  // el que mira desde lejos no debe quedar tapado por la neblina de la escena
  const fog = sc.scene.fog; if (fog) { if (fog.userData0 == null) fog.userData0 = [fog.near, fog.far]; const [n0, f0] = fog.userData0, cd = G.camDist || 0;
    if (spectate && cd > f0 - 4) { fog.near = Math.max(n0, cd - 2); fog.far = Math.max(f0, cd + 25); } else { fog.near = n0; fog.far = f0; } }
  const kk = snap ? 1 : 1 - Math.exp(-dt * 3.5);
  cam.position.x += (P[0] - cam.position.x) * kk; cam.position.y += (P[1] - cam.position.y) * kk; cam.position.z += (P[2] - cam.position.z) * kk;
  G.lookAt = G.lookAt || new THREE.Vector3(...Lk); G.lookAt.x += (Lk[0] - G.lookAt.x) * kk; G.lookAt.y += (Lk[1] - G.lookAt.y) * kk; G.lookAt.z += (Lk[2] - G.lookAt.z) * kk;
  cam.lookAt(G.lookAt);
  G.camDist = cam.position.distanceTo(G.lookAt);
}

// API para registrar mecánicas desde otros archivos (mg3d2.js)
const api = { coinObj, THREE, L, mat, glow, mesh, canvasTex, sprite, PAL, TEAM_COL, PLAYER_COLS, addUnder, arenaCircle, arenaRect, sceneOf, flash, done, out, X, dashBtn, chaseBuild, aliveHud, refreshButtons, popFx, get G() { return G; } };
window.MG3D = { prepare, start, stop, net, register(kind, def) { K[kind] = def; }, api, get ok() { return !!(window.Board3D && window.Board3D.ok); } };
window.dispatchEvent(new Event('mg3d-ready'));
