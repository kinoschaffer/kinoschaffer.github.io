// Minijuegos extra (tanda 2): escenarios 3D y controles. Se registran en mg3d.js.
import * as THREE from 'three';
const M = window.MG3D, A = M.api, XS = window.MGX.shared;
const { mat, glow, mesh, sprite, PAL, TEAM_COL, addUnder, arenaCircle, flash, done, out, X, dashBtn, aliveHud, L } = A;
const G = () => A.G;
const teamCol = id => TEAM_COL[G().teamOf(id)] || '#fff';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function placeTeams(sideX, spread = 2.2) { // coloca a cada equipo en su mitad
  const g = G(); if (!g.teams) return;
  for (const t of ['A', 'B']) g.teams[t].forEach((id, k) => { const x = (t === 'A' ? -1 : 1) * sideX, z = (k - (g.teams[t].length - 1) / 2) * spread; const ch = g.chars[id]; if (ch) ch.g.position.set(x, 0, z); if (id === g.myId && g.me) Object.assign(g.me, { x, z, ry: t === 'A' ? Math.PI / 2 : -Math.PI / 2 }); });
}
const roleOf = (ctxKey) => { const g = G(); return g.teams ? (g.teams.A.length === 1 ? g.teams.A[0] : g.teams.B[0]) : g.players[0].id; };

// ===== Fútbol Gigante
M.register('futbol', {
  ctrl: 'joy', cam: [0, 12, 9.5], look: [0, 0, 0.6],
  extra() { return [['⚽ PATEAR', () => { const g = G(), m = g.me; if (!m || g.now < (m.kickReady || 0)) return; m.kickReady = g.now + 900; g.send({ t: 'mgact', key: g.key, dash: 1 }); X('jump'); }]]; },
  build(sc) { const F = XS.FUT; addUnder(sc, PAL.grass);
    const field = mesh(new THREE.BoxGeometry(F.hx * 2 + 1.5, 0.4, F.hz * 2 + 1), mat(0x2f9e44, { flatShading: false })); field.position.y = -0.2; sc.scene.add(field);
    const line = (w, d, x, z) => { const l = mesh(new THREE.BoxGeometry(w, 0.02, d), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); l.position.set(x, 0.01, z); sc.scene.add(l); };
    line(0.1, F.hz * 2, 0, 0); line(F.hx * 2, 0.1, 0, F.hz); line(F.hx * 2, 0.1, 0, -F.hz);
    [-1, 1].forEach(sd => { const goal = new THREE.Group(); const c = sd < 0 ? TEAM_COL.A : TEAM_COL.B;
      [-1, 1].forEach(e => { const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8), mat(0xffffff)); post.position.set(0, 0.7, e * F.goal); goal.add(post); });
      const bar = mesh(new THREE.BoxGeometry(0.12, 0.12, F.goal * 2), mat(0xffffff)); bar.position.y = 1.4; goal.add(bar);
      const netm = mesh(new THREE.BoxGeometry(0.8, 1.4, F.goal * 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(c), transparent: true, opacity: 0.35 })); netm.position.set(sd * 0.4, 0.7, 0); goal.add(netm);
      goal.position.x = sd * F.hx; sc.scene.add(goal); });
    sc.ball = mesh(new THREE.IcosahedronGeometry(0.42, 1), mat(0xffffff, { flatShading: true })); sc.ball.position.y = 0.42; sc.scene.add(sc.ball);
    placeTeams(3); },
  tick(dt, now, m) { const g = G(), gl = g.x.goal; if (gl && gl[1] !== g.lastGoal) { g.lastGoal = gl[1]; const mine = g.teamOf(g.myId) === gl[0]; X(mine ? 'win' : 'bad'); flash(mine ? '⚽ ¡GOOOL!' : '😱 Gol rival', 1200); }
    const k = g.x.kick; if (k && k[1] !== g.lastKick) { g.lastKick = k[1]; X('hit'); }
    const goals = g.x.goals || [0, 0]; m.sc = g.teamOf(g.myId) === 'A' ? goals[0] : goals[1]; },
  draw(now, t) { const g = G(), b = g.x.ball; if (b) { const s = g.sc.ball; const px = s.position.x, pz = s.position.z; s.position.x += (b[0] - px) * 0.45; s.position.z += (b[1] - pz) * 0.45; s.rotation.z -= (s.position.x - px) / 0.42; s.rotation.x += (s.position.z - pz) / 0.42; } },
  hud() { const g = G(), gl = g.x.goals || [0, 0]; return `🔵 ${gl[0]}  —  ${gl[1]} 🔴 · Tu equipo: ${g.teamOf(g.myId) === 'A' ? '🔵 (ataca →)' : '🔴 (ataca ←)'}`; },
  final: () => { const g = G(), gl = g.x.goals || [0, 0]; return g.teamOf(g.myId) === 'A' ? gl[0] : gl[1]; },
});

// ===== Relevos
M.register('relevos', {
  ctrl: 'mash', camPos() { return [[0, 9, 15], [0, 0, -2]]; },
  build(sc) { addUnder(sc, PAL.grass); const g = G(); sc.leg = 24;
    [['A', -1.6], ['B', 1.6]].forEach(([t, x]) => { const lane = mesh(new THREE.BoxGeometry(2.6, 0.1, 30), mat(new THREE.Color(TEAM_COL[t]).lerp(new THREE.Color(0xffffff), 0.5).getHex(), { flatShading: false })); lane.position.set(x, 0, -3); sc.scene.add(lane); });
    const fin = mesh(new THREE.BoxGeometry(6, 0.12, 0.6), mat(0xffffff)); fin.position.set(0, 0.05, -17); sc.scene.add(fin);
    sc.baton = { A: mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), glow(0xffd43b, 0.6)), B: mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), glow(0xffd43b, 0.6)) }; sc.scene.add(sc.baton.A, sc.baton.B); },
  // posición en la pista según el avance del equipo
  where(id) { const g = G(), t = g.teamOf(id), list = g.teams[t], k = list.indexOf(id), r = g.x.relay || { A: 0, B: 0, leg: 24 }, leg = r.leg || 24, prog = r[t] || 0, total = leg * list.length;
    const zAt = d => 12 - d / total * 29, x = t === 'A' ? -1.6 : 1.6, active = Math.min(list.length - 1, Math.floor(prog / leg));
    if (k === active) return [x, zAt(prog), true]; if (k < active) return [x + (t === 'A' ? -1.3 : 1.3), zAt((k + 1) * leg), false]; return [x + (t === 'A' ? -1.3 : 1.3), zAt(k * leg), false]; },
  tap() { const g = G(), m = g.me; if (!m || g.finished) return; const [, , active] = M_relevos().where(g.myId); if (!active) { flash('⏳ Espera tu tramo', 400); return; } m.taps = (m.taps || 0) + 1; X('tap'); },
  tick(dt, now, m) { const g = G(); m.sc = m.taps || 0; const [x, z, active] = M_relevos().where(g.myId); m.x = x; m.z = z; m.ry = Math.PI; m.mv = active ? 1 : 0;
    if ((g.over || now >= g.dur) && !g.finished) done(m.taps || 0, '¡Fin!'); },
  offset() { return null; },
  draw() { const g = G(); for (const p of g.players) { if (p.id === g.myId) continue; const [x, z, active] = M_relevos().where(p.id); g.net[p.id] = [x, z, 0, Math.PI, 0, 0, active ? 1 : 0]; }
    for (const t of ['A', 'B']) { const list = g.teams[t], r = g.x.relay || {}, leg = r.leg || 24, act = list[Math.min(list.length - 1, Math.floor((r[t] || 0) / leg))], ch = g.chars[act]; if (ch) { g.sc.baton[t].position.copy(ch.g.position); g.sc.baton[t].position.y += 1.2; g.sc.baton[t].position.x += 0.4; } } },
  hud() { const g = G(), r = g.x.relay || { A: 0, B: 0, leg: 24 }, tot = t => (r.leg || 24) * g.teams[t].length; const [, , act] = M_relevos().where(g.myId);
    return `🔵 ${Math.round(r.A / tot('A') * 100)}% · 🔴 ${Math.round(r.B / tot('B') * 100)}% · ${act ? '¡CORRE! Toca rápido' : 'Espera tu tramo'}`; },
  final: () => G().me.taps || 0,
});
const M_relevos = () => G().K;

// ===== Vóley de Playa
M.register('voley', {
  ctrl: 'joy', cam: [0, 11, 10], look: [0, 0.8, 0.5],
  build(sc) { const V = XS.VOL; addUnder(sc, PAL.beach);
    const sand = mesh(new THREE.BoxGeometry(V.hx * 2 + 2, 0.4, V.hz * 2 + 2), mat(0xffe8a1, { flatShading: false })); sand.position.y = -0.2; sc.scene.add(sand);
    const netm = mesh(new THREE.BoxGeometry(0.06, 1.1, V.hz * 2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); netm.position.y = 1.45; sc.scene.add(netm);
    [-1, 1].forEach(e => { const p = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8), mat(0x868e96)); p.position.set(0, 1.05, e * V.hz); sc.scene.add(p); });
    sc.ball = mesh(new THREE.SphereGeometry(0.33, 16, 12), mat(0xfff3bf, { flatShading: false })); sc.scene.add(sc.ball);
    sc.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); sc.shadow.rotation.x = -Math.PI / 2; sc.shadow.position.y = 0.02; sc.scene.add(sc.shadow);
    sc.mark = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24), new THREE.MeshBasicMaterial({ color: 0xff6b6b, side: THREE.DoubleSide })); sc.mark.rotation.x = -Math.PI / 2; sc.mark.position.y = 0.03; sc.scene.add(sc.mark);
    placeTeams(3, 2.5); },
  tick(dt, now, m) { const g = G(), side = g.teamOf(g.myId) === 'A' ? -1 : 1; m.x = side < 0 ? Math.min(-0.3, m.x) : Math.max(0.3, m.x);
    const p = g.x.point; if (p && p[1] !== g.lastPt) { g.lastPt = p[1]; const mine = g.teamOf(g.myId) === p[0]; X(mine ? 'coin' : 'bad'); flash(mine ? '🏐 ¡Punto!' : '😱 Punto rival', 900); }
    const h = g.x.hit; if (h && h[1] !== g.lastHit) { g.lastHit = h[1]; X('hit'); }
    const pts = g.x.pts || [0, 0]; m.sc = side < 0 ? pts[0] : pts[1]; },
  draw(now) { const g = G(), b = g.x.vball, sc = g.sc; sc.ball.visible = !!b; sc.shadow.visible = !!b; sc.mark.visible = !!g.x.land;
    if (b) { sc.ball.position.x += (b[0] - sc.ball.position.x) * 0.5; sc.ball.position.y += (b[1] + 0.33 - sc.ball.position.y) * 0.5; sc.ball.position.z += (b[2] - sc.ball.position.z) * 0.5; sc.shadow.position.x = sc.ball.position.x; sc.shadow.position.z = sc.ball.position.z; }
    if (g.x.land) sc.mark.position.set(g.x.land[0], 0.03, g.x.land[1]); },
  hud() { const g = G(), p = g.x.pts || [0, 0]; return `🔵 ${p[0]}  —  ${p[1]} 🔴 · Primero en llegar a 7 · Ponte bajo la pelota`; },
  final: () => { const g = G(), p = g.x.pts || [0, 0]; return g.teamOf(g.myId) === 'A' ? p[0] : p[1]; },
});

// ===== Escondite (1 contra 3)
M.register('escondite', {
  ctrl: 'joy',
  speed() { const g = G(); return g.myId === g.sc.seeker ? (g.now < 5000 ? 0 : 1.05) : 0.92; },
  build(sc) { const g = G(), H = XS.HOUSE; sc.seeker = roleOf(); sc.scene.background = new THREE.Color(0x0b0d1a); sc.scene.fog = new THREE.Fog(0x0b0d1a, 6, 16);
    sc.scene.children.filter(o => o.isLight).forEach(l => l.intensity *= 0.25);
    const floor = mesh(new THREE.BoxGeometry(H.half * 2, 0.3, H.half * 2), mat(0x5c3b1e, { flatShading: false })); floor.position.y = -0.15; sc.scene.add(floor);
    [[0, H.half, H.half * 2, 0.3], [0, -H.half, H.half * 2, 0.3], [H.half, 0, 0.3, H.half * 2], [-H.half, 0, 0.3, H.half * 2]].forEach(([x, z, w, d]) => { const wl = mesh(new THREE.BoxGeometry(w, 2, d), mat(0x495057)); wl.position.set(x, 1, z); sc.scene.add(wl); });
    const cols = [0x8d5524, 0x6741d9, 0x1971c2, 0xc92a2a, 0x2f9e44]; H.boxes.forEach(([x, z, hx, hz], i) => { const b = mesh(new THREE.BoxGeometry(hx * 2, 1.3, hz * 2), mat(cols[i % cols.length])); b.position.set(x, 0.65, z); sc.scene.add(b); });
    sc.spot = new THREE.SpotLight(0xfff3bf, 160, XS.LIGHT.len + 2, XS.LIGHT.half, 0.35, 1.2); sc.scene.add(sc.spot, sc.spot.target);
    if (g.me && g.myId !== sc.seeker) { sc.own = new THREE.PointLight(0x9bb7ff, 14, 3.2, 1.6); sc.scene.add(sc.own); }
    const s = g.chars[sc.seeker]; if (s) { const lamp = sprite('🔦', '#fff', 0.6); lamp.position.y = 2.3; s.g.add(lamp); } },
  move(m, dx, dz) { [m.x, m.z] = XS.houseCollide(m.x + dx, m.z + dz); },
  tick(dt, now, m) { const g = G(), o = (g.x.out || {})[g.myId]; if (o != null && m.st !== 1) { m.st = 1; X('lose'); done(o, '🔦 ¡Te encontraron!'); }
    if (g.myId === g.sc.seeker) { if (now < 5000) flash(`🙈 Cuenta… ${Math.ceil((5000 - now) / 1000)}`, 300); if ((g.over || now >= g.dur) && !g.finished) done(g.x.caught || 0, g.over ? '🔦 ¡Encontraste a todos!' : '¡Tiempo!'); }
    else { const e = (g.x.exp || {})[g.myId] || 0; if (e > 120 && m.st !== 1) flash('⚠️ ¡Te están alumbrando!', 300); } },
  draw(now) { const g = G(), sc = g.sc, s = g.chars[sc.seeker]; if (s) { const ry = s.g.rotation.y; sc.spot.position.set(s.g.position.x, 1.8, s.g.position.z); sc.spot.target.position.set(s.g.position.x + Math.sin(ry) * 4, 0, s.g.position.z + Math.cos(ry) * 4); sc.spot.visible = now >= 5000; }
    if (sc.own && g.me) sc.own.position.set(g.me.x, 1.6, g.me.z);
    // el que busca no ve a los escondidos fuera de su luz (solo su silueta cuando están cerca)
    if (g.myId === sc.seeker) for (const p of g.players) { if (p.id === sc.seeker) continue; const ch = g.chars[p.id]; if (!ch) continue; const vis = XS.inLight(s.g.position.x, s.g.position.z, s.g.rotation.y, ch.g.position.x, ch.g.position.z) || Math.hypot(ch.g.position.x - s.g.position.x, ch.g.position.z - s.g.position.z) < 1.6; ch.g.visible = vis && (g.x.out || {})[p.id] == null; } },
  camPos() { const g = G(), me = g.chars[g.myId] || g.chars[g.sc.seeker]; const p = me ? me.g.position : new THREE.Vector3(); const f = Math.max(1, 0.62 / (innerWidth / innerHeight)); return [[p.x, 9 * f, p.z + 5 * f], [p.x, 0, p.z]]; },
  hud() { const g = G(); return g.myId === g.sc.seeker ? `🔦 Eres quien BUSCA · Encontrados: ${g.x.caught || 0}` : `🙈 ¡Escóndete detrás de los muebles! · Encontrados: ${g.x.caught || 0}`; },
  final: () => { const g = G(); return g.myId === g.sc.seeker ? (g.x.caught || 0) : g.dur; },
});

// ===== El Gigante (1 contra 3)
M.register('gigante', {
  ctrl: 'joy', cam: [0, 12, 9.5], look: [0, 0, 0.6],
  speed() { const g = G(); return g.myId === g.sc.giant ? XS.GIANT.speed : 1; },
  extra() { const g = G(); return g.myId === g.sc.giant ? [['🦶 PISOTÓN', () => { const m = g.me; if (!m || g.now < (m.stompReady || 0) || g.now < 2000) return; m.stompReady = g.now + XS.GIANT.cool; g.send({ t: 'mgact', key: g.key, stomp: 1, x: +m.x.toFixed(2), z: +m.z.toFixed(2) }); X('jump'); }]] : [['SALTA', () => { G().input.jump = true; }]]; },
  build(sc) { const g = G(); arenaCircle(sc, 7, PAL.grass); sc.giant = roleOf(); const gc = g.chars[sc.giant]; if (gc) { gc.baseScale = XS.GIANT.scale; }
    sc.waves = {}; for (let i = 0; i < 10; i++) { const tr = new THREE.Group(); [0, 1].forEach(j => { const c = mesh(new THREE.ConeGeometry(0.7 - j * 0.2, 1, 7), mat(0x2b8a3e)); c.position.y = 0.8 + j * 0.5; tr.add(c); }); const a = i / 10 * 6.28; tr.position.set(Math.cos(a) * 8.5, 0, Math.sin(a) * 8.5); sc.scene.add(tr); } },
  tick(dt, now, m) { const g = G();
    if (g.myId !== g.sc.giant) { if (g.input.jump && m.y <= 0 && m.st === 0) { m.vy = 7; X('jump'); } g.input.jump = false; m.vy = (m.vy || 0) - 24 * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y === 0) m.vy = 0; }
    const o = (g.x.out || {})[g.myId]; if (o != null && m.st !== 1) { m.st = 1; X('lose'); done(o, '🦶 ¡Aplastado!'); }
    if (g.myId === g.sc.giant && (g.over || now >= g.dur) && !g.finished) done(g.x.caught || 0, g.over ? '🦶 ¡Aplastaste a todos!' : '¡Tiempo!'); },
  draw(now) { const g = G(), sc = g.sc; const gc = g.chars[sc.giant]; if (gc) gc.g.scale.setScalar(XS.GIANT.scale);
    for (const e of g.ev || []) { let w = sc.waves[e.id]; if (!w) { w = sc.waves[e.id] = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, side: THREE.DoubleSide })); w.rotation.x = -Math.PI / 2; w.position.set(e.x, 0.05, e.z); sc.scene.add(w); }
      const k = (now - (e.t - XS.GIANT.wind)) / XS.GIANT.wind; if (k < 1) { w.scale.setScalar(0.3); w.material.opacity = 0.3 + 0.3 * Math.sin(k * 20); } else { const f = Math.min(1, (now - e.t) / 350); w.scale.setScalar(1 + f * XS.GIANT.r * 1.6); w.material.opacity = 0.8 * (1 - f); if (!w.userData.s) { w.userData.s = true; X('boom'); } } } },
  hud() { const g = G(); return g.myId === g.sc.giant ? `🦶 Eres el GIGANTE · Aplastados: ${g.x.caught || 0}` : `¡Huye del gigante! (puedes SALTAR la onda) · ` + aliveHud(); },
  final: () => { const g = G(); return g.myId === g.sc.giant ? (g.x.caught || 0) : g.dur; },
});

// ===== Portero (1 contra 3)
M.register('portero', {
  ctrl: 'joy', cam: [0, 10, 11.5], look: [0, 0, -1.2],
  speed() { const g = G(); return g.myId === g.sc.keeper ? XS.GOAL.keeperSpeed : 0; },
  extra() { const g = G(); return g.myId === g.sc.keeper ? [] : [['⚽ ¡PATEAR!', () => { const s = g.x.shot; if (!s || s.shooter !== g.myId || s.phase !== 'aim' || g.shotSent === s.i) return; g.shotSent = s.i; g.send({ t: 'mgact', key: g.key, shoot: +g.sc.aimX.toFixed(2) }); X('hit'); }]]; },
  build(sc) { const g = G(), Q = XS.GOAL; addUnder(sc, PAL.grass); sc.keeper = roleOf();
    const field = mesh(new THREE.BoxGeometry(12, 0.4, 14), mat(0x2f9e44, { flatShading: false })); field.position.set(0, -0.2, 0); sc.scene.add(field);
    const goal = new THREE.Group(); [-1, 1].forEach(e => { const p = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 8), mat(0xffffff)); p.position.set(e * Q.w, 1, 0); goal.add(p); });
    const bar = mesh(new THREE.BoxGeometry(Q.w * 2, 0.12, 0.12), mat(0xffffff)); bar.position.y = 2; goal.add(bar);
    const netm = mesh(new THREE.BoxGeometry(Q.w * 2, 2, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })); netm.position.set(0, 1, -0.4); goal.add(netm); goal.position.z = Q.z - 0.3; sc.scene.add(goal);
    sc.ball = mesh(new THREE.IcosahedronGeometry(0.3, 1), mat(0xffffff)); sc.scene.add(sc.ball);
    sc.aim = mesh(new THREE.ConeGeometry(0.25, 0.6, 4), glow(0xff6b6b, 0.8)); sc.aim.rotation.x = Math.PI; sc.scene.add(sc.aim); sc.aimX = 0; },
  move(m, dx) { const g = G(); if (g.myId !== g.sc.keeper) return; m.x = clamp(m.x + dx, -XS.GOAL.w - 0.5, XS.GOAL.w + 0.5); m.z = XS.GOAL.z; m.ry = 0; },
  tick(dt, now, m) { const g = G(), r = g.x.res; if (r && r[1] !== g.lastRes) { g.lastRes = r[1]; const keeper = g.myId === g.sc.keeper; const good = (r[0] === 'save') === keeper; X(good ? 'coin' : 'bad'); flash(r[0] === 'save' ? '🧤 ¡ATAJADA!' : '⚽ ¡GOL!', 900); }
    m.sc = g.myId === g.sc.keeper ? (g.x.saves || 0) : ((g.x.goalsBy || {})[g.myId] || 0); if (g.myId !== g.sc.keeper) m.ry = Math.PI;
    const s = g.x.shot; if (s && s.shooter === g.myId && s.phase === 'aim' && g.shotSent !== s.i && g.lastAimFlash !== s.i) { g.lastAimFlash = s.i; flash('🎯 ¡Tu tiro! Toca PATEAR', 900); X('turn'); }
    if ((g.over || now >= g.dur) && !g.finished) done(m.sc, '¡Fin!'); },
  draw(now, t) { const g = G(), sc = g.sc, s = g.x.shot, Q = XS.GOAL;
    sc.aimX = Math.sin(now / 420) * Q.w; sc.aim.visible = !!s && s.phase === 'aim'; sc.aim.position.set(sc.aimX, 2.6, Q.z);
    if (s) { const sh = g.chars[s.shooter], from = sh ? [sh.g.position.x, sh.g.position.z - 0.6] : [0, Q.shooterZ];
      if (s.phase === 'fly' && s.tx != null) { const k = clamp((now - s.fly0) / Q.flyMs, 0, 1); sc.ball.position.set(from[0] + (s.tx - from[0]) * k, 0.3 + Math.sin(k * Math.PI) * 0.9, from[1] + (Q.z - from[1]) * k); }
      else if (s.phase === 'aim') sc.ball.position.set(from[0], 0.3, from[1]); } },
  hud() { const g = G(), s = g.x.shot, total = Object.values(g.x.goalsBy || {}).reduce((a, c) => a + c, 0);
    return (g.myId === g.sc.keeper ? '🧤 Eres el PORTERO · ' : '⚽ Tirador · ') + `Atajadas ${g.x.saves || 0} · Goles ${total}` + (s ? ` · Tiro ${s.i + 1}/${s.n}` : ''); },
  final: () => G().me.sc || 0,
});

// ===== Escalada de lava
M.register('escalada', {
  ctrl: 'joyjump', selfMove: true,
  build(sc) { const g = G(); sc.scene.background = new THREE.Color(0x2b0f3a); sc.scene.fog = new THREE.Fog(0x2b0f3a, 14, 40);
    sc.plats = XS.platforms(g.seed); sc.plats.forEach((p, i) => { const m = mesh(new THREE.CylinderGeometry(p.r, p.r * 0.8, 0.4, 16), mat([0x74c0fc, 0xffd43b, 0x63e6be, 0xff8cc6][i % 4], { flatShading: false })); m.position.set(p.x, p.y - 0.2, p.z); sc.scene.add(m); });
    const col = mesh(new THREE.CylinderGeometry(0.5, 0.5, 80, 10), mat(0x495057)); col.position.y = 38; sc.scene.add(col);
    sc.lava = mesh(new THREE.CylinderGeometry(8, 8, 0.3, 32), glow(0xff5a00, 1.3), false, false); sc.scene.add(sc.lava); sc.lavaL = new THREE.PointLight(0xff6a00, 60, 14, 1.4); sc.scene.add(sc.lavaL);
    if (g.me) Object.assign(g.me, { vy: 0, best: 0, onPlat: 0 }); },
  tick(dt, now, m) { const g = G(), P = g.sc.plats;
    if (m.st === 1) { m.y -= dt * 4; return; }
    let ix = g.input.x, iz = g.input.z; const kk = g.keys || {}; if (kk.ArrowLeft) ix = -1; if (kk.ArrowRight) ix = 1; if (kk.ArrowUp) iz = -1; if (kk.ArrowDown) iz = 1;
    const il = Math.hypot(ix, iz); if (il > 0.12) { const s = 4.2 * Math.min(1, il); m.x += ix / Math.max(1, il) * s * dt; m.z += iz / Math.max(1, il) * s * dt; m.ry = Math.atan2(ix, iz); m.mv = 1; } else m.mv = 0;
    const d = Math.hypot(m.x, m.z); if (d > 6.5) { m.x *= 6.5 / d; m.z *= 6.5 / d; }
    if (g.input.jump && m.onPlat) { m.vy = 9.6; m.onPlat = 0; X('jump'); } g.input.jump = false;
    const oldY = m.y; m.vy -= 22 * dt; m.y += m.vy * dt; m.onPlat = 0;
    if (m.vy <= 0) for (const p of P) { if (Math.hypot(m.x - p.x, m.z - p.z) < p.r + 0.15 && oldY >= p.y - 0.05 && m.y <= p.y) { m.y = p.y; m.vy = 0; m.onPlat = 1; break; } }
    m.best = Math.max(m.best || 0, m.y); m.sc = Math.round(m.best);
    if (m.y < XS.lavaY(now) + 0.1) { m.st = 1; X('lose'); done(Math.round(m.best), `🔥 ¡La lava! ${Math.round(m.best)} m`); } },
  draw(now, t) { const sc = G().sc, ly = XS.lavaY(now); sc.lava.position.y = ly; sc.lavaL.position.y = ly + 2; sc.lava.material.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.25; },
  camPos() { const g = G(), me = g.chars[g.myId], p = me ? me.g.position : new THREE.Vector3(0, XS.lavaY(g.now) + 3, 0), f = Math.max(1, 0.62 / (innerWidth / innerHeight)); return [[p.x * 0.3, p.y + 5 * f, p.z + 9 * f], [p.x * 0.5, p.y + 0.5, p.z * 0.5]]; },
  hud() { const g = G(); return `🧗 Altura: ${g.me ? Math.round(g.me.best || 0) : 0} m · 🔥 Lava: ${Math.max(0, Math.round(XS.lavaY(g.now)))} m · SALTA de plataforma en plataforma`; },
  final: () => Math.round(G().me.best || 0),
});

// ===== Karts
M.register('karts', {
  ctrl: 'joy', selfMove: true,
  build(sc) { const g = G(), T = XS.TRACK; addUnder(sc, PAL.grass); sc.scene.fog = new THREE.Fog(0x9be3ff, 25, 60);
    const ground = mesh(new THREE.PlaneGeometry(60, 60), mat(0x69db7c, { flatShading: false }), false); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; sc.scene.add(ground);
    const roadM = mat(0x495057, { flatShading: false }); for (let i = 0; i < T.pts.length; i++) { const a = T.pts[i], b = T.pts[(i + 1) % T.pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const seg = mesh(new THREE.BoxGeometry(T.width, 0.05, len + 0.3), roadM, false); seg.position.set((a[0] + b[0]) / 2, 0.01, (a[1] + b[1]) / 2); seg.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); sc.scene.add(seg);
      if (i % 2 === 0) [-1, 1].forEach(sd => { const n = Math.atan2(b[0] - a[0], b[1] - a[1]); const c = mesh(new THREE.BoxGeometry(0.3, 0.25, len * 0.5), mat(i % 4 ? 0xffffff : 0xe03131)); c.position.set(seg.position.x + Math.cos(n) * sd * T.width / 2, 0.12, seg.position.z - Math.sin(n) * sd * T.width / 2); c.rotation.y = n; sc.scene.add(c); }); }
    T.boosts.forEach(f => { const p = XS.trackAt(f * T.len); const b = mesh(new THREE.BoxGeometry(1.6, 0.06, 1.2), glow(0xffd43b, 0.9), false); b.position.set(p.x, 0.04, p.z); b.rotation.y = p.dir; sc.scene.add(b); });
    const start = XS.trackAt(0); const line = mesh(new THREE.BoxGeometry(T.width, 0.07, 0.5), mat(0xffffff), false); line.position.set(start.x, 0.05, start.z); line.rotation.y = start.dir; sc.scene.add(line);
    // los personajes van en karts
    for (const p of g.players) { const ch = g.chars[p.id]; if (!ch) continue; const kart = mesh(new THREE.BoxGeometry(0.9, 0.35, 1.4), mat(new THREE.Color(p.color).getHex())); kart.position.y = 0.2; ch.g.add(kart); }
    if (g.me) { const s0 = g.players.findIndex(p => p.id === g.myId); const p = XS.trackAt(-1.5 - Math.floor(s0 / 2) * 1.8); Object.assign(g.me, { kv: 0, kdir: p.dir, s: -1.5 - Math.floor(s0 / 2) * 1.8, near: 0, lapS: 0 }); } },
  tick(dt, now, m) { const g = G(), T = XS.TRACK; if (m.st === 3) return; if (now < 2500) { if (now > 600) flash(now < 1500 ? '🔴 🔴' : now < 2200 ? '🟡 🟡' : '🟢 ¡YA!', 400); return; }
    let ix = g.input.x; const kk = g.keys || {}; if (kk.ArrowLeft) ix = -1; if (kk.ArrowRight) ix = 1;
    const nr = XS.trackNearest(m.x, m.z, m.near); m.near = nr.i; const off = nr.d > T.width / 2 + 0.2;
    const boost = T.boosts.some(f => Math.hypot(XS.trackAt(f * T.len).x - m.x, XS.trackAt(f * T.len).z - m.z) < 1.1); if (boost && now > (m.boostT || 0)) { m.boostT = now + 1200; X('item'); }
    const vmax = now < (m.boostT || 0) ? 12.5 : off ? 4 : 9.4; m.kv += (vmax - m.kv) * Math.min(1, dt * (m.kv < vmax ? 1.2 : 3));
    m.kdir -= ix * 2.4 * dt * Math.min(1, m.kv / 4); m.x += Math.sin(m.kdir) * m.kv * dt; m.z += Math.cos(m.kdir) * m.kv * dt; m.ry = m.kdir; m.mv = 1;
    // avance acumulado (vueltas): sumar diferencia de posición sobre la pista
    let ds = nr.s - (m.lastS ?? nr.s); if (ds < -T.len / 2) ds += T.len; if (ds > T.len / 2) ds -= T.len; m.lastS = nr.s; m.s += ds;
    m.sc = Math.max(1, Math.floor(Math.max(0, m.s) / T.len) + 1);
    if (m.s >= T.len * T.laps) { m.st = 3; done(Math.round(now), '🏁 ¡Llegaste!'); } },
  camPos() { const g = G(), m = g.me; if (!m) { return [[0, 26, 18], [0, 0, 0]]; } const d = m.kdir || 0; return [[m.x - Math.sin(d) * 6, 3.6, m.z - Math.cos(d) * 6], [m.x + Math.sin(d) * 4, 0.6, m.z + Math.cos(d) * 4]]; },
  hud() { const g = G(), m = g.me; return m ? `🏎️ Vuelta ${Math.min(XS.TRACK.laps, m.sc || 1)} de ${XS.TRACK.laps} · Gira con el dedo` : '🏎️ Carrera'; },
  final: () => { const m = G().me; return L.MISS + Math.round(Math.max(0, XS.TRACK.len * XS.TRACK.laps - m.s) * 100); },
});

// ===== Bolos
M.register('bolos', {
  ctrl: 'tapscreen', stage: true, cam: [0, 3.2, 7], look: [0, 0.4, -6],
  build(sc) { const g = G(); sc.scene.background = new THREE.Color(0x1e0b3a); sc.scene.fog = null;
    const lane = mesh(new THREE.BoxGeometry(2.2, 0.2, 18), mat(0xe8b07a, { flatShading: false })); lane.position.set(0, -0.1, -4); sc.scene.add(lane);
    [-1, 1].forEach(sd => { const gu = mesh(new THREE.BoxGeometry(0.3, 0.15, 18), mat(0x343a40)); gu.position.set(sd * 1.25, -0.12, -4); sc.scene.add(gu); });
    sc.ball = mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0x7048e8, { flatShading: false, roughness: 0.2 })); sc.ball.position.set(0, 0.28, 3.5); sc.scene.add(sc.ball);
    sc.arrow = mesh(new THREE.ConeGeometry(0.15, 0.6, 6), glow(0xff6b6b, 0.8)); sc.arrow.rotation.x = -Math.PI / 2; sc.scene.add(sc.arrow);
    sc.pinPos = []; for (let r = 0; r < 4; r++) for (let c = 0; c <= r; c++) sc.pinPos.push([(c - r / 2) * 0.42, -11 - r * 0.38]);
    sc.pins = sc.pinPos.map(([x, z]) => { const p = new THREE.Group(); const b = mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 10), mat(0xffffff, { flatShading: false })); b.position.y = 0.25; p.add(b); const s = mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0xe03131)); s.position.y = 0.42; p.add(s); p.position.set(x, 0, z); sc.scene.add(p); return p; });
    sc.standing = sc.pins.map(() => true); sc.roll = 0; sc.frameRoll = 0; sc.total = 0; sc.phase = 'aim'; sc.t0 = 600; sc.rng = L.rngOf(g.seed ^ XS.hash(g.myId)); },
  onTap() { const g = G(), sc = g.sc; if (!g.me || g.finished) return;
    if (sc.phase === 'aim' && g.now > sc.t0) { sc.aimX = Math.sin((g.now - sc.t0) / 380) * 0.85; sc.phase = 'power'; sc.t1 = g.now; X('tap'); }
    else if (sc.phase === 'power') { sc.power = 0.5 + 0.5 * Math.abs(Math.sin((g.now - sc.t1) / 300)); sc.phase = 'roll'; sc.t2 = g.now; X('jump');
      // pinos que caen: los cercanos a la línea de la bola, más si va fuerte, con un poco de suerte
      const reach = 0.24 + sc.power * 0.33; let n = 0; sc.pinPos.forEach(([x], i) => { if (!sc.standing[i]) return; const dx = Math.abs(x - sc.aimX); if (dx < reach || (dx < reach + 0.35 && sc.rng() < 0.45 * sc.power)) { sc.standing[i] = 'falling'; n++; } }); sc.knock = n; } },
  tick(dt, now, m) { const g = G(), sc = g.sc;
    if (sc.phase === 'roll') { const k = Math.min(1, (now - sc.t2) / (1500 - sc.power * 500)); sc.ball.position.set(sc.aimX * k, 0.28, 3.5 - k * 15); sc.ball.rotation.x -= dt * 10;
      if (k >= 1) { sc.pins.forEach((p, i) => { if (sc.standing[i] === 'falling') { sc.standing[i] = false; p.rotation.z = (Math.random() - 0.5) * 3; p.position.y = -0.1; p.position.x += (Math.random() - 0.5) * 0.6; } });
        sc.total += sc.knock; X(sc.knock >= 7 ? 'win' : sc.knock > 0 ? 'coin' : 'bad'); flash(sc.knock === 10 ? '🎳 ¡CHUZA!' : sc.standing.every(s => !s) ? '🎳 ¡Todos!' : `🎳 ${sc.knock} pinos`, 1000);
        sc.phase = 'wait'; sc.t3 = now; } }
    if (sc.phase === 'wait' && now > sc.t3 + 1300) { sc.roll++; sc.frameRoll++; if (sc.roll >= 4) { sc.phase = 'done'; done(sc.total, `🎳 Total: ${sc.total} pinos`); return; }
      if (sc.frameRoll >= 2 || sc.standing.every(s => !s)) { sc.frameRoll = 0; sc.standing = sc.pins.map(() => true); sc.pins.forEach((p, i) => { p.rotation.z = 0; p.position.set(sc.pinPos[i][0], 0, sc.pinPos[i][1]); }); }
      sc.ball.position.set(0, 0.28, 3.5); sc.phase = 'aim'; sc.t0 = now; }
    m.sc = sc.total; },
  draw(now) { const g = G(), sc = g.sc; sc.arrow.visible = sc.phase === 'aim' || sc.phase === 'power'; const ax = sc.phase === 'aim' ? Math.sin((now - sc.t0) / 380) * 0.85 : sc.aimX; sc.arrow.position.set(ax, 0.3, 2.6);
    sc.arrow.scale.setScalar(sc.phase === 'power' ? 0.7 + 1.2 * Math.abs(Math.sin((now - sc.t1) / 300)) : 1); },
  hud() { const sc = G().sc; return `🎳 Tiro ${Math.min(4, sc.roll + 1)} de 4 · Pinos: ${sc.total} · ` + (sc.phase === 'aim' ? 'Toca para fijar la DIRECCIÓN' : sc.phase === 'power' ? 'Toca para fijar la FUERZA' : ''); },
  final: () => G().sc.total,
});

// ===== Ritmo
const LANE_COL = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419'], ARROWS = ['⬅', '⬇', '⬆', '➡'];
M.register('ritmo', {
  ctrl: 'buttons', stage: true, cam: [0, 3, 7.5], look: [0, 1.2, -2],
  build(sc) { const g = G(); sc.scene.background = new THREE.Color(0x1e0b3a); sc.scene.fog = null;
    const stage = mesh(new THREE.CylinderGeometry(5, 5.4, 0.5, 32), mat(0x7048e8, { flatShading: false })); stage.position.set(0, -0.25, -2); sc.scene.add(stage);
    sc.lights = [0, 1, 2, 3].map(i => { const l = new THREE.PointLight(new THREE.Color(LANE_COL[i]), 0, 8); l.position.set(-3 + i * 2, 3, -1); sc.scene.add(l); return l; });
    sc.notes = XS.chart(g.seed, g.dur); sc.hit = new Set(); sc.score = 0; sc.combo = 0;
    if (g.me && g.hud == null) {} },
  buttons() { return [0, 1, 2, 3].map(i => `<button data-i="${i}" style="background:${LANE_COL[i]};width:22%;height:80px;font-size:2rem">${ARROWS[i]}</button>`).join(''); },
  onButton(i) { const g = G(), sc = g.sc, now = g.now; let best = null, bd = 1e9;
    sc.notes.forEach((n, k) => { if (n.lane !== i || sc.hit.has(k)) return; const d = Math.abs(n.t - now); if (d < bd) { bd = d; best = k; } });
    if (best != null && bd < 230) { sc.hit.add(best); const pts = bd < 110 ? 3 : 1; sc.score += pts; sc.combo++; X(pts === 3 ? 'coin' : 'tap'); flash(pts === 3 ? '✨ ¡Perfecto!' : '👍 Bien', 300); sc.lights[i].intensity = 40; }
    else { sc.combo = 0; X('bad'); } },
  tick(dt, now, m) { const g = G(); m.sc = g.sc.score; m.mv = 1;
    if (!g.noteLayer && g.hud) { const lay = document.createElement('div'); lay.style.cssText = 'position:absolute;left:4%;right:4%;top:15%;bottom:150px;pointer-events:none'; lay.innerHTML = '<div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:#fff;opacity:.8;border-radius:2px"></div>'; g.hud.appendChild(lay); g.noteLayer = lay; g.noteEls = {}; }
    if (g.noteLayer) { const H = g.noteLayer.clientHeight, sc = g.sc;
      sc.notes.forEach((n, k) => { const dtn = n.t - now; const show = dtn < 1800 && dtn > -250 && !sc.hit.has(k); let el = g.noteEls[k];
        if (show && !el) { el = g.noteEls[k] = document.createElement('div'); el.textContent = ARROWS[n.lane]; el.style.cssText = `position:absolute;width:22%;left:${n.lane * 26}%;text-align:center;font-size:2rem;font-weight:900;color:${LANE_COL[n.lane]};text-shadow:0 0 8px #000`; g.noteLayer.appendChild(el); }
        if (el) { if (!show) { el.remove(); delete g.noteEls[k]; } else el.style.top = (H - dtn / 1800 * H - 30) + 'px'; } }); }
    g.sc.lights.forEach(l => l.intensity *= 0.9);
    if (now >= g.dur - 300 && !g.finished) done(g.sc.score, `🎵 ${g.sc.score} puntos`); },
  hud() { const sc = G().sc; return `🎵 Puntos: ${sc.score} · Combo: ${sc.combo}`; },
  final: () => G().sc.score,
});

// ===== Encaja la Figura
M.register('encaja', {
  ctrl: 'lanes', cam: [0, 4.2, 8], look: [0, 0.8, -3],
  extra() { return [['🙇', () => { const g = G(); if (g.me) g.me.duckUntil = g.now + 700; }]]; },
  build(sc) { const g = G(); addUnder(sc, PAL.space); const plat = mesh(new THREE.BoxGeometry(6, 0.4, 30), mat(0x7048e8, { flatShading: false })); plat.position.set(0, -0.2, -10); sc.scene.add(plat);
    sc.walls = XS.walls(g.seed, g.dur).map(w => { const grp = new THREE.Group(); const wm = mat(0x74c0fc, { transparent: true, opacity: 0.85 });
      [-1, 0, 1].forEach(l => { if (l === w.lane) { if (w.low) { const top = mesh(new THREE.BoxGeometry(1.55, 1.6, 0.3), wm); top.position.set(l * 1.6, 1.9, 0); grp.add(top); } } else { const b = mesh(new THREE.BoxGeometry(1.55, 2.7, 0.3), wm); b.position.set(l * 1.6, 1.35, 0); grp.add(b); } });
      grp.visible = false; sc.scene.add(grp); return { ...w, grp }; });
    sc.lives = 3; sc.passed = 0; sc.wi = 0; if (g.me) { g.me.lane = 0; }
 },
  lane(d) { const m = G().me; if (!m) return; m.lane = clamp((m.lane || 0) + d, -1, 1); },
  tick(dt, now, m) { const g = G(), sc = g.sc; m.x += ((m.lane || 0) * 1.6 - m.x) * Math.min(1, dt * 12); m.z = 2; m.ry = Math.PI; m.mv = m.duckUntil > now ? 2 : 1; if ((g.keys || {}).ArrowDown) m.duckUntil = now + 200;
    const w = sc.walls[sc.wi]; if (w && now >= w.t + XS.WALL_TRAVEL) { sc.wi++; const ok = (m.lane || 0) === w.lane && (!w.low || m.duckUntil > now);
      if (ok) { sc.passed++; X('coin'); } else { sc.lives--; X('bad'); flash(sc.lives > 0 ? `💥 ¡Choque! Vidas: ${sc.lives}` : '💥 ¡Fuera!', 900); if (sc.lives <= 0) { m.st = 1; done(sc.passed); } } }
    m.sc = sc.passed; },
  draw(now) { G().sc.walls.forEach(w => { const k = (now - w.t) / XS.WALL_TRAVEL; w.grp.visible = k > -0.2 && k < 1.15; w.grp.position.z = -18 + (2 + 18) * k; }); },
  hud() { const sc = G().sc; return `🧱 Paredes: ${sc.passed} · ❤️ ${sc.lives} · ◀ ▶ carril, 🙇 agacharse`; },
  final: () => G().sc.passed,
});
