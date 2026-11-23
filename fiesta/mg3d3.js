// Juegos de decisión y suerte (tanda 3): escenas 3D y botones de elección.
import * as THREE from 'three';
const M = window.MG3D, A = M.api, XS = window.MGX.shared;
const { mat, glow, mesh, sprite, PAL, addUnder, arenaRect, flash, done, X } = A;
const G = () => A.G;
const RACER = { snail: '🐌', balloon: '🎈', duck: '🦆', rocket: '🚀', turtle: '🐢' };
const RCOL = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xfcc419, 0xcc5de8, 0xff922b];
const ROUL = [['🔴', 0xe03131], ['🔵', 0x1971c2], ['🟢', 0x2f9e44], ['🟡', 0xf59f00]];
const HANDS = ['✊', '✋', '✌️'];

function label(type, o, d, g) {
  const game = XS.GAMES[d.game];
  switch (type) {
    case 'race': return `${RACER[game.style]} ${o + 1}${game.style === 'rocket' ? ['<br><small>muy rápido · frágil</small>', '<br><small>rápido</small>', '<br><small>normal</small>', '<br><small>lento · seguro</small>'][o] : ''}`;
    case 'doors': return `🚪 ${o + 1}`;
    case 'chests': return `💰 ${o + 1}`;
    case 'ropes': return `🪢 ${o + 1}`;
    case 'fishing': return `🎣 ${o + 1}`;
    case 'roulette': return ROUL[o][0];
    case 'dice': return o ? '🎰 Loco<br><small>0 a 10</small>' : '🎲 Seguro<br><small>3 o 4</small>';
    case 'button': return `🔘 ${o + 1}`;
    case 'bridge': return o ? 'Derecha ➡' : '⬅ Izquierda';
    case 'cards': return o ? '⬆ Más alta' : '⬇ Más baja';
    case 'rps': return HANDS[o];
    case 'plinko': return `⬇ ${o + 1}`;
  }
  return String(o + 1);
}


/* ======================= Carreras en 3D: tortugas, cohetes y patos ======================= */
const R3D = ['turtle', 'rocket', 'duck'];
const lx = (i, n) => (i - (n - 1) / 2) * 1.3, Z0 = 1.6, ZLEN = 14;
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.55, metalness: o.m ?? 0, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, flatShading: o.flat ?? false, transparent: !!o.op, opacity: o.op ?? 1 });
function m3(geo, material, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, material); o.position.set(x, y, z); o.castShadow = true; return o; }
function makeTurtle(col) { const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shell = m3(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(col, { r: 0.4, flat: true }), 0, 0.12, 0); shell.scale.set(1, 0.75, 1.15); body.add(shell);
  const rim = m3(new THREE.TorusGeometry(0.42, 0.06, 6, 20), std(new THREE.Color(col).multiplyScalar(0.6)), 0, 0.12, 0); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.15, 1); body.add(rim);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const sp = m3(new THREE.CircleGeometry(0.1, 6), std(0xfff3bf, { r: 0.6 }), Math.cos(a) * 0.2, 0.36, Math.sin(a) * 0.24); sp.rotation.x = -1.2; sp.lookAt(Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.5); body.add(sp); }
  const skin = std(0x8ce99a, { r: 0.6 }), head = new THREE.Group(); head.position.set(0, 0.18, -0.5); body.add(head);
  head.add(m3(new THREE.SphereGeometry(0.17, 12, 10), skin)); [-1, 1].forEach(sd => { head.add(m3(new THREE.SphereGeometry(0.05, 8, 6), std(0xffffff), sd * 0.08, 0.06, -0.12)); head.add(m3(new THREE.SphereGeometry(0.028, 6, 5), std(0x111111), sd * 0.085, 0.065, -0.16)); });
  const legs = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.32], [0.3, 0.32]].map(([x, z]) => { const l = m3(new THREE.CylinderGeometry(0.07, 0.08, 0.22, 8), skin, x, 0.04, z); body.add(l); return l; });
  const tail = m3(new THREE.ConeGeometry(0.05, 0.18, 6), skin, 0, 0.1, 0.52); tail.rotation.x = Math.PI / 2; body.add(tail);
  g.userData = { kind: 'turtle', body, head, legs }; return g; }
function makeRocket(col) { const g = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.55; g.add(body);
  const hull = m3(new THREE.CylinderGeometry(0.22, 0.25, 0.9, 16), std(0xf8f9fa, { r: 0.3, m: 0.3 })); hull.rotation.x = Math.PI / 2; body.add(hull);
  const band = m3(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 16), std(col, { r: 0.35, m: 0.2 }), 0, 0, 0.1); band.rotation.x = Math.PI / 2; body.add(band);
  const nose = m3(new THREE.ConeGeometry(0.22, 0.42, 16), std(col, { r: 0.3, m: 0.3 }), 0, 0, -0.66); nose.rotation.x = -Math.PI / 2; body.add(nose);
  const win = m3(new THREE.SphereGeometry(0.1, 12, 8), std(0x74c0fc, { r: 0.1, m: 0.5, e: 0x1c7ed6, ei: 0.4 }), 0, 0.17, -0.18); win.scale.set(1, 0.6, 1); body.add(win);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 2; const fin = m3(new THREE.BoxGeometry(0.04, 0.32, 0.3), std(col, { flat: true }), Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.36); fin.rotation.z = a - Math.PI / 2; body.add(fin); }
  const flame = new THREE.Group(); flame.position.z = 0.5; body.add(flame);
  const f1 = m3(new THREE.ConeGeometry(0.16, 0.6, 12), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.9 }), 0, 0, 0.28); f1.rotation.x = Math.PI / 2; flame.add(f1);
  const f2 = m3(new THREE.ConeGeometry(0.09, 0.4, 10), new THREE.MeshBasicMaterial({ color: 0xfff3bf }), 0, 0, 0.18); f2.rotation.x = Math.PI / 2; flame.add(f2);
  const glow = new THREE.PointLight(0xff922b, 6, 3, 1.5); glow.position.z = 0.4; flame.add(glow);
  g.userData = { kind: 'rocket', body, flame }; return g; }
function makeDuck(col) { const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const yel = std(col, { r: 0.25 });
  const b = m3(new THREE.SphereGeometry(0.36, 18, 14), yel, 0, 0.18, 0); b.scale.set(1, 0.72, 1.25); body.add(b);
  const tail = m3(new THREE.ConeGeometry(0.14, 0.28, 10), yel, 0, 0.32, 0.42); tail.rotation.x = -0.9; body.add(tail);
  const head = m3(new THREE.SphereGeometry(0.22, 16, 12), yel, 0, 0.55, -0.26); body.add(head);
  const beak = m3(new THREE.SphereGeometry(0.11, 12, 8), std(0xff922b, { r: 0.3 }), 0, 0.5, -0.46); beak.scale.set(1.2, 0.45, 1); body.add(beak);
  [-1, 1].forEach(sd => { body.add(m3(new THREE.SphereGeometry(0.05, 8, 6), std(0xffffff), sd * 0.1, 0.62, -0.42)); body.add(m3(new THREE.SphereGeometry(0.03, 6, 5), std(0x111111), sd * 0.1, 0.63, -0.46));
    const w = m3(new THREE.SphereGeometry(0.14, 10, 8), yel, sd * 0.3, 0.22, 0.05); w.scale.set(0.4, 0.7, 1.1); body.add(w); });
  const whirl = m3(new THREE.TorusGeometry(0.55, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: 0x1864ab, transparent: true, opacity: 0.8 }), 0, 0.02, 0); whirl.rotation.x = -Math.PI / 2; whirl.visible = false; g.add(whirl);
  g.userData = { kind: 'duck', body, whirl }; return g; }
function buildRace3D(sc, style, n) {
  const scene = sc.scene, W = n * 1.3 + 1.2, H = (o) => { scene.add(o); return o; };
  sc.r3d = { style, n, prev: null, t: 0, fxT: {}, finished: new Set(), lastT: null };
  scene.children.forEach(o => { if (o.isMesh) o.visible = false; }); // ocultar la arena genérica: cada carrera tiene su escenario
  if (style === 'turtle') { scene.background = new THREE.Color(0x9be3ff);
    H(m3(new THREE.BoxGeometry(W + 10, 0.2, 22), std(0x69db7c, { flat: true }), 0, -0.12, -5)).receiveShadow = true;
    for (let i = 0; i < n; i++) { const l = H(m3(new THREE.BoxGeometry(1.05, 0.04, ZLEN + 1.5), std(i % 2 ? 0xc8a165 : 0xd4b07a), lx(i, n), 0.0, Z0 - ZLEN / 2)); l.receiveShadow = true; }
    for (let k = 0; k < 14; k++) { const sd = k % 2 ? 1 : -1, z = Z0 - (k >> 1) * 2.2; const bush = H(m3(new THREE.IcosahedronGeometry(0.45 + Math.random() * 0.3, 0), std(0x2f9e44, { flat: true }), sd * (W / 2 + 0.6 + Math.random()), 0.3, z));
      if (k % 3 === 0) H(m3(new THREE.ConeGeometry(0.12, 0.3, 6), std(0xff8787), bush.position.x + 0.3 * sd, 0.75, z)); } }
  else if (style === 'rocket') { scene.background = new THREE.Color(0x0b0d2b);
    H(m3(new THREE.BoxGeometry(W + 10, 0.2, 22), std(0x1b1f4b, { r: 0.8 }), 0, -0.12, -5));
    for (let i = 0; i < n; i++) { H(m3(new THREE.BoxGeometry(1.0, 0.03, ZLEN + 1.5), std(0x252a63, { r: 0.6 }), lx(i, n), 0.0, Z0 - ZLEN / 2));
      [-0.52, 0.52].forEach(o => H(m3(new THREE.BoxGeometry(0.05, 0.04, ZLEN + 1.5), std(RCOL[i % 6], { e: RCOL[i % 6], ei: 0.8 }), lx(i, n) + o, 0.03, Z0 - ZLEN / 2))); }
    const pts = new Float32Array(600 * 3); for (let k = 0; k < 600; k++) { pts[k * 3] = (Math.random() - 0.5) * 60; pts[k * 3 + 1] = 3 + Math.random() * 25; pts[k * 3 + 2] = -40 + Math.random() * 45; }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pts, 3)); H(new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 })));
    const planet = H(m3(new THREE.SphereGeometry(4, 24, 16), std(0xb197fc, { e: 0x5f3dc4, ei: 0.3 }), 9, 7, -26)); planet.castShadow = false; }
  else if (style === 'duck') { scene.background = new THREE.Color(0x8ad8ff);
    H(m3(new THREE.BoxGeometry(W + 10, 0.2, 22), std(0x51cf66, { flat: true }), 0, -0.3, -5));
    const wg = new THREE.PlaneGeometry(W, ZLEN + 3, 24, 40); wg.rotateX(-Math.PI / 2); const water = H(new THREE.Mesh(wg, std(0x339af0, { r: 0.15, m: 0.1, op: 0.92 }))); water.position.set(0, 0.0, Z0 - ZLEN / 2);
    sc.r3d.water = water; sc.r3d.water0 = Float32Array.from(wg.attributes.position.array);
    for (let i = 0; i <= n; i++) { const x = (i - n / 2) * 1.3; for (let z = Z0; z > Z0 - ZLEN - 1; z -= 0.7) H(m3(new THREE.SphereGeometry(0.07, 8, 6), std((Math.round(z / 0.7) + i) % 2 ? 0xff6b6b : 0xffffff), x, 0.05, z)); }
    [-1, 1].forEach(sd => H(m3(new THREE.BoxGeometry(0.6, 0.35, ZLEN + 3), std(0xc8a165, { flat: true }), sd * (W / 2 + 0.3), 0.0, Z0 - ZLEN / 2))); }
  // arco de meta
  const arch = new THREE.Group(); [-1, 1].forEach(sd => arch.add(m3(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 10), std(0xffffff), sd * (W / 2 - 0.1), 1.2, 0)));
  const ban = m3(new THREE.BoxGeometry(W, 0.45, 0.08), std(0xe03131), 0, 2.35, 0); arch.add(ban);
  const fl = sprite('🏁 META', '#fff', 0.5); fl.position.set(0, 2.36, 0.08); arch.add(fl);
  for (let k = 0; k < 10; k++) arch.add(m3(new THREE.BoxGeometry(W / 10, 0.04, 0.4), std(k % 2 ? 0x111111 : 0xffffff), -W / 2 + W / 20 + k * W / 10, 0.03, 0));
  arch.position.z = Z0 - ZLEN; scene.add(arch);
  return (i) => { const col = RCOL[i % 6], o = style === 'turtle' ? makeTurtle(col) : style === 'rocket' ? makeRocket(col) : makeDuck(style === 'duck' ? [0xffd43b, 0xffa8a8, 0x74c0fc, 0x8ce99a, 0xe599f7, 0xffc078][i % 6] : col);
    if (style !== 'rocket') o.children[0].scale.setScalar(1.3);
    const num = sprite(String(i + 1), '#' + col.toString(16).padStart(6, '0'), 0.45); num.position.y = style === 'rocket' ? 1.25 : 1.15; o.add(num); o.userData.num = num; return o; };
}
function drawRace3D(sc, fr, frp, t, racing) {
  const R = sc.r3d, dt = Math.min(0.1, R.lastT == null ? 0.016 : t - R.lastT); R.lastT = t; const tick = (k, every) => { R.fxT[k] = (R.fxT[k] || 0) - dt; if (R.fxT[k] <= 0) { R.fxT[k] = every; return true; } return false; };
  if (R.water) { const pa = R.water.geometry.attributes.position, a0 = R.water0; for (let v = 0; v < pa.count; v++) pa.array[v * 3 + 1] = Math.sin(a0[v * 3] * 2.1 + t * 2.4) * 0.04 + Math.cos(a0[v * 3 + 2] * 1.7 + t * 1.8) * 0.05; pa.needsUpdate = true; }
  sc.items.forEach((o, i) => { const u = o.userData, p = fr ? fr[i] : 0, v = fr && frp ? (fr[i] - frp[i]) : 0, moving = racing && v > 0.02, back = racing && v < -0.02, z = Z0 - p / XS.RACE.len * ZLEN;
    o.position.x = lx(i, sc.r3d.n); o.position.z = z; const wp = new THREE.Vector3(o.position.x, 0.1, z);
    if (u.kind === 'turtle') { const k = moving ? 1 : 0; u.legs.forEach((l, j) => { l.rotation.x = k * Math.sin(t * 12 + (j % 2 ? Math.PI : 0) + (j > 1 ? Math.PI : 0)) * 0.7; });
      u.body.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.05 : 0; u.head.position.z += ((racing && !moving ? -0.32 : -0.5) - u.head.position.z) * Math.min(1, dt * 8); u.head.scale.setScalar(racing && !moving ? 0.8 : 1);
      if (moving && tick('d' + i, 0.22)) A.burst(wp.clone().add(new THREE.Vector3(0, 0, 0.4)), 0xc8a165, 3, 1.2, 0.07, 0.4);
      if (racing && !moving && tick('z' + i, 0.9)) A.popFx(wp.clone().add(new THREE.Vector3(0.2, 0.9, 0)), 'Z', '#a5d8ff');
      if (u.wasSleep && moving) { A.burst(wp.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffe066, 10, 3, 0.09); A.popFx(wp.clone().add(new THREE.Vector3(0, 1.3, 0)), '❗', '#fff'); X('pop'); } u.wasSleep = racing && !moving && p > 0.1; }
    else if (u.kind === 'rocket') { const on = moving || !racing; u.flame.visible = on || Math.sin(t * 40) > 0.6 && back; const fl = 0.8 + Math.random() * 0.5; u.flame.scale.set(fl, fl, on ? (moving ? 1.3 : 0.6) * fl : 0.3);
      u.body.position.y = 0.55 + Math.sin(t * 3 + i) * 0.06 + (moving ? 0.1 : 0); u.body.rotation.z = racing && !moving ? Math.sin(t * 9) * 0.5 : Math.sin(t * 2 + i) * 0.05; u.body.rotation.x = moving ? -0.08 : 0;
      if (moving && tick('s' + i, 0.06)) A.burst(new THREE.Vector3(o.position.x, 0.55, z + 0.75), 0xadb5bd, 2, 0.6, 0.12, 0.3);
      if (racing && !moving && tick('k' + i, 0.18)) A.burst(new THREE.Vector3(o.position.x, 0.6, z), 0x495057, 3, 0.8, 0.15, 0.8); }
    else if (u.kind === 'duck') { u.body.position.y = Math.sin(t * 3 + i * 1.3) * 0.05; u.body.rotation.z = Math.sin(t * 2.4 + i) * 0.12;
      u.whirl.visible = back; if (back) { u.whirl.rotation.z += dt * 10; u.body.rotation.y += dt * 9; if (tick('w' + i, 0.15)) A.burst(wp.clone(), 0xd0ebff, 3, 1.8, 0.08, 0.6); } else u.body.rotation.y += (0 - u.body.rotation.y) * Math.min(1, dt * 5);
      if (moving && tick('f' + i, 0.12)) A.burst(new THREE.Vector3(o.position.x, 0.05, z + 0.45), 0xffffff, 3, 1.1, 0.08, 0.45); }
    // llegada a la meta: confeti
    if (racing && p >= XS.RACE.len && !R.finished.has(i)) { R.finished.add(i); const first = R.finished.size === 1;
      A.burst(new THREE.Vector3(o.position.x, 1.2, Z0 - ZLEN), first ? 0xffd43b : RCOL[i % 6], first ? 40 : 14, first ? 6 : 3.5, 0.11, 1.6); if (first) { A.shake(0.25, 300); X('win'); } } });
  // cámara: sigue al de adelante y muestra a todos
  if (racing && fr) { const lead = Math.max(...fr), last = Math.min(...fr), zl = Z0 - lead / XS.RACE.len * ZLEN, zb = Z0 - last / XS.RACE.len * ZLEN, mid = (zl + zb) / 2;
    sc.camZ = sc.camZ == null ? mid : sc.camZ + (mid - sc.camZ) * Math.min(1, dt * 2.5); }
  else sc.camZ = sc.camZ == null ? Z0 - 3 : sc.camZ + ((Z0 - 3) - sc.camZ) * Math.min(1, dt * 2);
}

M.register('decision', {
  camPos() { const sc = G() && G().sc; if (!sc || !sc.r3d) return null; const cz = sc.camZ ?? (Z0 - 3), w = Math.min(1.6, Math.max(1, 0.62 / (innerWidth / innerHeight)));
    return [[0, 4.6 * w, cz + 6.6 * w], [0, 0.3, cz - 2.2]]; },
  scoreOf(id) { const d = G().x.d; return d && d.score ? d.score[id] || 0 : 0; },
  ctrl: 'buttons', stage: true, cam: [0, 5.5, 9.5], look: [0, 1, -1.5],
  build(sc) {
    const g = G(), game = XS.GAMES[g.p.game], type = game.type; sc.type = type; sc.game = game; sc.scene.background = new THREE.Color(0x2b1257); sc.scene.fog = null;
    arenaRect(sc, 8, 14, { ...PAL.candy, ground: 0x7048e8, under: 0x2b1257 }, -2);
    sc.items = []; sc.fx = []; sc.seenReveal = 0;
    const ring = (n, rad, z0, make) => { for (let i = 0; i < n; i++) { const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * Math.min(2.4, n * 0.45), o = make(i); o.position.set(Math.sin(a) * rad, o.position.y, z0 - Math.cos(a) * rad + rad); const t = sprite(String(i + 1), '#fff', 0.5); t.position.y = 1.9; o.add(t); sc.scene.add(o); sc.items.push(o); } };
    if (type === 'race' && R3D.includes(game.style)) { const n = game.racers; sc.lanes = n; const mk = buildRace3D(sc, game.style, n);
      for (let i = 0; i < n; i++) { const r = mk(i); r.position.set(lx(i, n), 0, Z0); sc.scene.add(r); sc.items.push(r); } }
    else if (type === 'race') { const n = game.racers; sc.lanes = n;
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 1.3; const lane = mesh(new THREE.BoxGeometry(1.1, 0.04, 16), mat(i % 2 ? 0x845ef7 : 0x9775fa, { flatShading: false }), false); lane.position.set(x, 0.02, -6); sc.scene.add(lane);
        const r = new THREE.Group(); const s = sprite(RACER[game.style], '#fff', 0.9); s.position.y = 0.55; r.add(s); const num = sprite(String(i + 1), '#' + RCOL[i % 6].toString(16).padStart(6, '0'), 0.4); num.position.y = 1.3; r.add(num); r.position.set(x, 0, 1.6); sc.scene.add(r); sc.items.push(r); }
      const fin = mesh(new THREE.BoxGeometry(n * 1.3 + 0.6, 0.06, 0.4), mat(0xffffff), false); fin.position.set(0, 0.05, -12.5); sc.scene.add(fin); }
    else if (type === 'doors') ring(3, 0.1, -3, i => { const d = new THREE.Group(); const fr = mesh(new THREE.BoxGeometry(1.6, 2.6, 0.2), mat(0x5c3b1e)); fr.position.y = 1.3; d.add(fr); const door = mesh(new THREE.BoxGeometry(1.3, 2.3, 0.12), mat(RCOL[i])); door.position.set(0, 1.2, 0.12); d.add(door); d.userData.door = door; return d; });
    else if (type === 'chests' || type === 'ropes' || type === 'fishing') { const n = type === 'fishing' ? 6 : type === 'chests' ? Math.max(3, g.players.length + 1) : Math.max(3, g.players.length);
      ring(n, 4, -4, i => { const o = new THREE.Group();
        if (type === 'chests') { const b = mesh(new THREE.BoxGeometry(1, 0.7, 0.7), mat(0x8d5524)); b.position.y = 0.35; o.add(b); const lid = mesh(new THREE.BoxGeometry(1.05, 0.25, 0.75), mat(0xc08552)); lid.position.y = 0.82; o.add(lid); o.userData.lid = lid; }
        else if (type === 'ropes') { const rope = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), mat(0xe8b07a)); rope.position.y = 3; o.add(rope); const h = mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), mat(0xe8b07a)); h.position.y = 1; o.add(h); }
        else { const pole = mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), mat(0x8d5524)); pole.rotation.x = -0.7; pole.position.set(0, 1, -0.6); o.add(pole); const pond = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), mat(0x1c7ed6), false); pond.position.set(0, 0.03, -1.6); o.add(pond); }
        return o; }); }
    else if (type === 'roulette') { sc.wheel = new THREE.Group(); ROUL.forEach(([, c], i) => { const q = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 32, 1, false, i * Math.PI / 2, Math.PI / 2), mat(c, { flatShading: false })); sc.wheel.add(q); });
      sc.wheel.rotation.x = Math.PI / 2; sc.wheel.position.set(0, 2.6, -3); sc.scene.add(sc.wheel); const ptr = mesh(new THREE.ConeGeometry(0.25, 0.6, 4), mat(0xffffff)); ptr.rotation.z = Math.PI; ptr.position.set(0, 5.3, -2.8); sc.scene.add(ptr); }
    else if (type === 'button') { const n = Math.max(6, g.players.length * 2 + 2); sc.panel = []; const cols = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) { const b = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), glow(0xe03131, 0.3)); b.rotation.x = Math.PI / 2; b.position.set((i % cols - (cols - 1) / 2) * 1.2, 2.6 - Math.floor(i / cols) * 1.2, -3); sc.scene.add(b); const t = sprite(String(i + 1), '#fff', 0.4); t.position.set(b.position.x, b.position.y, -2.7); sc.scene.add(t); sc.panel.push(b); } }
    else if (type === 'bridge') { sc.planks = []; for (let r = 0; r < 6; r++) for (let s = 0; s < 2; s++) { const p = mesh(new THREE.BoxGeometry(1.2, 0.15, 1), mat(0xc08552)); p.position.set(s ? 0.8 : -0.8, 0.6, 1 - r * 1.6); sc.scene.add(p); sc.planks.push(p); }
      const chasm = mesh(new THREE.BoxGeometry(6, 0.1, 11), mat(0x0b0b2b), false); chasm.position.set(0, 0.06, -3); sc.scene.add(chasm); }
    else if (type === 'cards') { sc.card = sprite('🂠', '#fff', 2.4); sc.card.position.set(0, 2.6, -2); sc.scene.add(sc.card); sc.cardTxt = ''; }
    else if (type === 'plinko') { const P = XS.PLINKO; sc.board = new THREE.Group(); const back = mesh(new THREE.BoxGeometry(P.cols * 0.8 + 1, P.rows * 0.6 + 1.6, 0.2), mat(0x3b1f7a)); back.position.set(0, 0, -0.2); sc.board.add(back);
      for (let r = 0; r < P.rows; r++) for (let c = 0; c <= P.cols; c++) { if ((r + c) % 2) continue; const peg = mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xffffff)); peg.position.set((c - P.cols / 2) * 0.8, P.rows * 0.3 - r * 0.6, 0); sc.board.add(peg); }
      XS.PLINKO_VALUES.forEach((v, i) => { const s = sprite(String(v), v >= 5 ? '#fcc419' : '#fff', 0.45); s.position.set((i - P.cols / 2) * 0.8, -P.rows * 0.3 - 0.6, 0.1); sc.board.add(s); });
      sc.board.position.set(0, 3, -3); sc.scene.add(sc.board); sc.balls = {}; }
    if (type === 'race' && sc.r3d) { this.cam = [0, 4.8, 4.5]; this.look = [0, 0.3, -3]; }
    else if (type === 'race') { this.cam = [0, 6, 7.5]; this.look = [0, 0, -5]; } else { this.cam = [0, 5.5, 9.5]; this.look = [0, 1.6, -2]; }
  },
  buttons() { const g = G(), d = g.x.d; if (!d || d.phase !== 'pick' || g.finished) return '';
    const turn = d.turn && d.turn !== g.myId; if (turn) return `<div class="note" style="width:100%;text-align:center">Turno de ${g.players.find(p => p.id === d.turn).name}…</div>`;
    if (d.picks[g.myId] != null) return `<div class="note" style="width:100%;text-align:center">✅ Elegiste. Esperando a los demás…</div>`;
    const taken = Object.values(d.picks), n = d.opts.length, w = n <= 2 ? 44 : n <= 4 ? 22 : n <= 6 ? 30 : 22;
    return d.opts.map(o => `<button data-i="${o}" ${taken.includes(o) && (d.type === 'chests' || d.type === 'ropes') ? 'disabled style="opacity:.35;' : 'style="'}width:${w}%;height:${n > 6 ? 56 : 72}px;font-size:${d.type === 'roulette' || d.type === 'rps' ? 2 : 1.05}rem;border-radius:16px">${label(d.type, o, d, g)}</button>`).join(''); },
  onButton(i) { const g = G(); g.send({ t: 'mgact', key: g.key, pick: i }); X('tap'); const d = g.x.d; if (d) { d.picks = { ...d.picks, [g.myId]: i }; } A.refreshButtons(); },
  tick(dt, now, m) { const g = G(), d = g.x.d; if (!d) return; m.sc = (d.score || {})[g.myId] || 0;
    const key = [d.phase, d.round, d.turn, (d.picks || {})[g.myId] != null, Object.keys(d.picks || {}).length].join('|'); if (key !== g.btnKey) { g.btnKey = key; A.refreshButtons(); if (d.phase === 'pick' && d.turn === g.myId) { X('turn'); flash('👉 ¡Tu turno!', 800); } }
    if ((d.phase === 'end' || g.over || now >= g.dur) && !g.finished) done(m.sc, `🎉 ${m.sc} puntos`); },
  draw(now, t) {
    const g = G(), sc = g.sc, d = g.x.d; if (!d) return; const last = d.last, revealing = d.phase === 'reveal' || d.phase === 'end', since = now - (d.revealAt || 0);
    const newReveal = revealing && last && d.revealAt !== sc.seenReveal; if (newReveal) { sc.seenReveal = d.revealAt; sc.revealT0 = now;
      // mostrar lo que ganó cada uno
      setTimeout(() => { const gg = G(); if (!gg || gg !== g) return; Object.entries(last.gain || {}).forEach(([id, v]) => { const ch = g.chars[id]; if (ch && v) A.popFx(ch.g.position.clone().add(new THREE.Vector3(0, 2.4, 0)), (v > 0 ? '+' : '') + v, v > 0 ? '#ffd43b' : '#ff6b6b'); });
        const mine = (last.gain || {})[g.myId]; if (mine != null) X(mine > 3 ? 'win' : mine > 0 ? 'coin' : mine < 0 ? 'bad' : 'tap'); }, { race: 9000, roulette: 4000, plinko: 4200 }[sc.type] || 1300); }
    const rel = now - (sc.revealT0 || now);
    if (sc.type === 'race') { const n = sc.lanes;
      if (revealing && last) { if (!sc.sim || sc.simRound !== last.round) { sc.simRound = last.round; sc.sim = XS.raceSim(g.seed + last.round, n, sc.game.style); sc.evShown = 0; }
        const f = Math.min(sc.sim.frames.length - 1, Math.floor(rel / XS.RACE.step)), fr = sc.sim.frames[f];
        if (sc.r3d) { const fp = sc.sim.frames[Math.max(0, f - 3)]; drawRace3D(sc, fr, fp, t, true); }
        else sc.items.forEach((o, i) => { o.position.z = 1.6 - fr[i] / XS.RACE.len * 14; o.position.y = sc.game.style === 'balloon' ? 1 + Math.sin(t * 2 + i) * 0.2 : Math.abs(Math.sin(t * 8 + i)) * 0.1; });
        while (sc.evShown < sc.sim.ev.length && sc.sim.ev[sc.evShown][0] <= rel) { const [, i, ic] = sc.sim.ev[sc.evShown++]; const wp = sc.items[i].position.clone(); A.popFx(wp.clone().add(new THREE.Vector3(0, 1.6, 0)), ic, '#fff');
          if (ic === '💥') { X('boom'); if (sc.r3d) { A.burst(wp.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xff922b, 30, 6, 0.16, 1.5); A.burst(wp.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x495057, 18, 3, 0.2, 1); A.shake(0.4, 350); } }
          else if (sc.r3d && ic === '🌀') { X('splash'); A.burst(wp.clone(), 0xd0ebff, 14, 3, 0.1, 1.2); }
          else if (sc.r3d && ic === '💤') X('pop'); }
        if (f >= sc.sim.frames.length - 1 && !sc.podium) { sc.podium = true; flash(`🏁 Ganó el ${RACER[sc.game.style]} ${last.order[0] + 1}`, 2500); X('fanfare'); } }
      else { sc.podium = false; if (sc.r3d) { sc.r3d.finished.clear(); drawRace3D(sc, null, null, t, false); } else sc.items.forEach((o, i) => { o.position.z = 1.6; o.position.y = 0; }); }
      // cada jugador se para junto a su corredor
      g.players.forEach((p, k) => { const pk = revealing && last ? last.picks[p.id] : null; if (pk != null && g.chars[p.id]) { const x = (pk - (n - 1) / 2) * 1.3; g.net[p.id] = [x + (k % 2 ? 0.35 : -0.35), 3.2 + Math.floor(k / 2) * 0.6, 0, 0, 0, 0, 0]; if (p.id === g.myId && g.me) { g.me.x = g.net[p.id][0]; g.me.z = g.net[p.id][1]; } } }); }
    if (sc.type === 'doors') sc.items.forEach((o, i) => { const open = revealing && last; o.userData.door.rotation.y = open ? -Math.min(1.6, rel / 400) : 0; o.userData.door.position.x = open ? -Math.min(0.6, rel / 600) : 0;
      if (open && !o.userData.p) { o.userData.p = sprite((last.prizes[i] > 0 ? '+' : '') + last.prizes[i], last.prizes[i] > 3 ? '#fcc419' : last.prizes[i] < 0 ? '#ff6b6b' : '#fff', 0.9); o.userData.p.position.y = 1.2; o.add(o.userData.p); }
      if (!open && o.userData.p) { o.remove(o.userData.p); o.userData.p = null; } });
    if (sc.type === 'chests' || sc.type === 'ropes' || sc.type === 'fishing') sc.items.forEach((o, i) => { const open = revealing && last;
      if (o.userData.lid) o.userData.lid.rotation.x = open ? -Math.min(1.4, rel / 500) : 0;
      if (open && !o.userData.p) { const v = last.prizes[i]; const icon = sc.type === 'ropes' ? (v < 0 ? '🔨' : '🎁') : sc.type === 'fishing' ? (v === 0 ? '👢' : v >= 5 ? '🐋' : '🐟') : (v >= 10 ? '💎' : v < 0 ? '💣' : '🪙');
        o.userData.p = sprite(`${icon} ${v > 0 ? '+' : ''}${v}`, v > 3 ? '#fcc419' : v < 0 ? '#ff6b6b' : '#fff', 0.6); o.userData.p.position.y = sc.type === 'ropes' ? 3 : 1.4; o.add(o.userData.p); }
      if (o.userData.p && sc.type === 'ropes' && open) o.userData.p.position.y = Math.max(1.2, 3 - rel / 400);
      if (!open && o.userData.p) { o.remove(o.userData.p); o.userData.p = null; }
      const who = Object.entries((revealing && last ? last.picks : d.picks) || {}).find(([id, v]) => v === i && (d.type !== 'fishing' || revealing)); o.scale.setScalar(who ? 1.15 : 1); });
    if (sc.type === 'roulette') { if (revealing && last) { const k = Math.min(1, rel / 3800), ease = 1 - Math.pow(1 - k, 3), target = last.spin * Math.PI * 2 + (3.5 - last.land) * Math.PI / 2 - Math.PI / 4; sc.wheel.rotation.y = target * ease; }
      else sc.wheel.rotation.y += 0.02; }
    if (sc.type === 'button') sc.panel.forEach((b, i) => { const pressed = (d.pressed || []).includes(i); b.material.emissiveIntensity = pressed ? 0 : 0.3 + Math.sin(t * 3 + i) * 0.1; b.material.color.setHex(pressed ? 0x495057 : 0xe03131); b.position.z = pressed ? -3.15 : -3;
      if (revealing && last && last.btn === i && last.boom && !sc.boomed) { sc.boomed = true; A.popFx(b.position.clone(), '💥 ¡BUM!', '#ff922b'); X('boom'); } });
    if (sc.type === 'bridge') { sc.planks.forEach((p, k) => { const r = Math.floor(k / 2), s = k % 2, kn = (d.known || {})[r] || {}; p.visible = kn[s] !== 'roto'; p.material.color.setHex(kn[s] === 'ok' ? 0x51cf66 : 0xc08552); });
      g.players.forEach((p, k) => { const row = (d.walker || {})[p.id] || 0, fallen = (d.out || {})[p.id], done2 = (d.finished || {})[p.id]; const z = done2 ? -9 : row === 0 ? 3 : 1 - (row - 1) * 1.6;
        g.net[p.id] = [(k - (g.players.length - 1) / 2) * 0.5, z, fallen ? -3 : 0, Math.PI, fallen ? 1 : 0, 0, 0]; if (p.id === g.myId && g.me) Object.assign(g.me, { x: g.net[p.id][0], z, y: fallen ? -3 : 0 }); }); }
    if (sc.type === 'cards') { const txt = revealing && last ? `${last.from} → ${last.next}` : String(d.card); if (txt !== sc.cardTxt) { sc.cardTxt = txt; sc.scene.remove(sc.card); sc.card = sprite('🃏 ' + txt, '#fff', 1.4); sc.card.position.set(0, 2.8, -2); sc.scene.add(sc.card); } }
    if (sc.type === 'rps') g.players.forEach(p => { const ch = g.chars[p.id]; if (!ch) return; const pk = revealing && last ? last.picks[p.id] : null; const want = pk != null ? HANDS[pk] : '❔';
      if (ch.userData_h !== want) { if (ch.hand) ch.g.remove(ch.hand); ch.hand = sprite(want, '#fff', 0.8); ch.hand.position.y = 2.9; ch.g.add(ch.hand); ch.userData_h = want; } });
    if (sc.type === 'dice') g.players.forEach(p => { const ch = g.chars[p.id]; if (!ch) return; const v = revealing && last && last.rolls ? String(last.rolls[p.id]) : '🎲';
      if (ch.userData_h !== v) { if (ch.hand) ch.g.remove(ch.hand); ch.hand = sprite(v, '#fff', 0.8); ch.hand.position.y = 2.9; ch.g.add(ch.hand); ch.userData_h = v; } });
    if (sc.type === 'plinko') { if (revealing && last && last.paths) { const P = XS.PLINKO, k = Math.min(1, rel / 3800);
        g.players.forEach((p, idx) => { const path = last.paths[p.id]; if (!path) return; let b = sc.balls[p.id]; if (!b) { b = sc.balls[p.id] = mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(new THREE.Color(p.color).getHex())); sc.board.add(b); }
          const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), fr = f - i, x = path[i] + (path[i + 1] - path[i]) * fr; b.position.set((x - P.cols / 2) * 0.8 + (idx - 1.5) * 0.04, P.rows * 0.3 + 0.6 - f * 0.6 - Math.sin(fr * Math.PI) * 0.15, 0.15); }); }
      else Object.values(sc.balls).forEach(b => sc.board.remove(b)), sc.balls = {}; }
  },
  hud() { const g = G(), d = g.x.d; if (!d) return '…'; const left = Math.max(0, Math.ceil((d.phaseEnd - g.now) / 1000)), best = Math.max(0, ...Object.values(d.score || {}));
    const ph = d.phase === 'pick' ? (d.turn ? (d.turn === g.myId ? `👉 ¡Te toca! (${left} s)` : `Turno de ${g.players.find(p => p.id === d.turn).name}`) : `Elige (${left} s)`) : d.phase === 'reveal' ? '👀 ¡Mira!' : '¡Fin!';
    return `${ph} · Tus puntos: ${(d.score || {})[g.myId] || 0} · Líder: ${best}` + (d.rounds > 1 && d.rounds < 99 ? ` · Ronda ${Math.min(d.rounds, d.round + 1)}/${d.rounds}` : ''); },
  final: () => ((G().x.d || {}).score || {})[G().myId] || 0,
});
