// Cohetes a Manivela: cada jugador gira su manivela tocando el botón; al terminar, los cohetes despegan
// y sube más alto el que dio más vueltas.
import * as THREE from 'three';
const M = window.MG3D, A = M.api, XS = window.MGX.shared;
const { flash, done, X } = A;
const G = () => A.G;
const SPAN = 2, ROCKET_Z = -1.3, HMAX = 26;

M.register('manivela', {
  ctrl: 'mash', mashLabel: '🔄 ¡GIRA!', mashHint: 'Cada toque es una vuelta de manivela', stage: true, cam: [0, 4, 9], look: [0, 1.5, -1],
  build(sc) { const g = G(), R = window.RACE3D, n = g.players.length; sc.scene.background = new THREE.Color(0x14183a); sc.scene.fog = null;
    sc.scene.children.forEach(o => { if (o.isMesh) o.visible = false; });
    const add = o => { sc.scene.add(o); return o; };
    add(R.m3(new THREE.BoxGeometry(60, 0.2, 40), R.std(0x2b2f55, { r: 0.9 }), 0, -0.1, -6)).receiveShadow = true;
    // estrellas y luna
    const pts = new Float32Array(500 * 3); for (let k = 0; k < 500; k++) { pts[k * 3] = (Math.random() - 0.5) * 70; pts[k * 3 + 1] = 4 + Math.random() * 60; pts[k * 3 + 2] = -30 - Math.random() * 10; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pts, 3)); add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18 })));
    const moon = add(R.m3(new THREE.SphereGeometry(2.4, 24, 16), R.std(0xfff3bf, { e: 0xffe066, ei: 0.5 }), -9, 16, -30)); moon.castShadow = false;
    sc.pads = g.players.map((p, i) => { const x = (i - (n - 1) / 2) * SPAN, grp = new THREE.Group(); grp.position.set(x, 0, 0); add(grp);
      const col = new THREE.Color(p.color).getHex();
      grp.add(R.m3(new THREE.CylinderGeometry(0.75, 0.85, 0.2, 20), R.std(0x868e96, { m: 0.4, r: 0.4 }), 0, 0.1, ROCKET_Z));
      const ring = R.m3(new THREE.TorusGeometry(0.62, 0.04, 6, 28), R.std(col, { e: col, ei: 0.7 }), 0, 0.21, ROCKET_Z); ring.rotation.x = Math.PI / 2; grp.add(ring);
      // cohete de pie
      const rk = new THREE.Group(); rk.position.set(0, 0.2, ROCKET_Z); const inner = R.makeRocket(col); inner.rotation.x = Math.PI / 2; inner.position.set(0, 0.95, -0.55); rk.add(inner); rk.scale.setScalar(1.5); grp.add(rk);
      const ic = R.avatarSprite(p); ic.position.set(0, 3.2, ROCKET_Z); ic.scale.setScalar(0.8); grp.add(ic);
      // máquina con manivela y medidor de combustible
      const mac = new THREE.Group(); mac.position.set(0.75, 0, -0.1); grp.add(mac);
      mac.add(R.m3(new THREE.BoxGeometry(0.42, 0.7, 0.42), R.std(0x495057, { m: 0.3 }), 0, 0.35, 0));
      const wheel = new THREE.Group(); wheel.position.set(0, 0.58, 0.23); mac.add(wheel);
      const disc = R.m3(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), R.std(col, { m: 0.3 })); disc.rotation.x = Math.PI / 2; wheel.add(disc);
      const arm = R.m3(new THREE.BoxGeometry(0.05, 0.3, 0.05), R.std(0xdee2e6, { m: 0.6 }), 0, 0.15, 0.05); wheel.add(arm);
      const knob = R.m3(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), R.std(0xe03131), 0, 0.3, 0.12); knob.rotation.x = Math.PI / 2; wheel.add(knob);
      const glass = R.m3(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 14), R.std(0xffffff, { op: 0.25, r: 0.1 }), 0.33, 0.95, 0); mac.add(glass); glass.castShadow = false;
      const fuel = R.m3(new THREE.CylinderGeometry(0.09, 0.09, 1, 14), R.std(col, { e: col, ei: 0.6 }), 0.33, 0.21, 0); fuel.scale.y = 0.01; mac.add(fuel);
      // cable del medidor al cohete
      const cable = R.m3(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), R.std(0x212529), 0.38, 0.06, -0.62); cable.rotation.x = Math.PI / 2; mac.add(cable);
      return { id: p.id, x, grp, rk, inner, wheel, fuel, ic, ang: 0, sc: 0, h: 0, peak: false, col }; });
    sc.camY = 1.5; sc.launched = false; sc.max = 1; },
  tap() { const g = G(), m = g.me, sc = g.sc; if (!m || g.now > XS.CRANK.spin || g.now < 200) return; m.cranks = (m.cranks || 0) + 1; X('tap'); if (m.cranks % 10 === 0) { X('coin'); A.buzz(15); } },
  scoreOf(id) { const g = G(); return id === g.myId && g.me ? g.me.cranks || 0 : (g.net[id] || [])[5] || 0; },
  tick(dt, now, m) { const g = G(), sc = g.sc; m.sc = m.cranks || 0; m.mv = now < XS.CRANK.spin ? 1 : 0; m.ry = 0;
    if (now > XS.CRANK.spin && !sc.btnHidden) { sc.btnHidden = true; const b = g.hud.querySelector('.mg-btns'); if (b) b.style.display = 'none'; const h = g.hud.querySelector('.hint'); if (h) h.style.display = 'none'; }
    if (now >= XS.CRANK.launch + 600 && !g.finished) done(m.sc, `🚀 ${m.sc} vueltas`); },
  draw(now, t) { const g = G(), sc = g.sc, dt = Math.min(0.1, sc.lastT == null ? 0.016 : t - sc.lastT); sc.lastT = t; const C = XS.CRANK;
    const scores = sc.pads.map(p => this.scoreOf(p.id)); sc.max = Math.max(10, ...scores);
    sc.pads.forEach((p, i) => { const v = scores[i];
      // la manivela gira según las vueltas (suave)
      const target = v * Math.PI * 2; p.ang += (target - p.ang) * Math.min(1, dt * 10); p.wheel.rotation.z = -p.ang;
      p.fuel.scale.y = Math.max(0.01, Math.min(1, v / sc.max)) * 1.45; p.fuel.position.y = 0.21 + p.fuel.scale.y / 2;
      const fl = p.inner.userData.flame; if (now < C.spin) { fl.visible = v > 0 && Math.sin(t * 20 + i) > 0.7; fl.scale.setScalar(0.4); p.rk.position.x = Math.sin(t * 40) * 0.01 * Math.min(1, v / 20); }
      // despegue
      if (now >= C.spin + 1200) { if (!sc.launched) { sc.launched = true; X('boom'); A.shake(0.35, 600); flash('🚀 ¡DESPEGUE!', 1400); }
        const k = Math.min(1, (now - C.spin - 1200) / (C.launch - C.spin - 2600)), ease = 1 - Math.pow(1 - k, 2.2), goal = 0.4 + v / sc.max * HMAX;
        p.h = goal * ease; p.rk.position.y = 0.2 + p.h; p.ic.position.y = 3.2 + p.h; fl.visible = k < 1; fl.scale.set(1.2 + Math.random() * 0.5, 1.2 + Math.random() * 0.5, 1.6 + Math.random() * 0.8);
        p.rk.rotation.z = Math.sin(t * 9 + i) * 0.03 * (1 - k);
        if (k < 1 && Math.random() < 0.5) A.burst(new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.3, p.rk.position.y - 0.2, ROCKET_Z), Math.random() < 0.4 ? 0xffa94d : 0xadb5bd, 2, 1.2, 0.18, -0.6);
        if (k >= 1 && !p.peak) { p.peak = true; const best = v === sc.max; A.burst(new THREE.Vector3(p.x, p.rk.position.y + 1.2, ROCKET_Z), best ? 0xffd43b : p.col, best ? 60 : 26, best ? 7 : 4.5, 0.14, 1.2);
          A.popFx(new THREE.Vector3(p.x, p.rk.position.y + 2.2, ROCKET_Z), `${v}`, best ? '#ffd43b' : '#ffffff'); X(best ? 'win' : 'pop'); if (best) A.shake(0.3, 400); } } });
    // cámara: al despegar sigue a los cohetes hacia arriba
    const hs = sc.pads.map(p => p.h), top = Math.max(0, ...hs), low = Math.min(...hs); sc.camY += ((now >= C.spin + 1200 ? (top * 0.7 + low * 0.3) + 0.6 : 1.5) - sc.camY) * Math.min(1, dt * 2.2); },
  camPos() { const g = G(), sc = g && g.sc; if (!sc || !sc.pads) return null; const cam = sc.camera, n = sc.pads.length;
    // distancia para que entren todas las plataformas a lo ancho de la pantalla
    const hf = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect), d = Math.max(7.5, ((n - 1) * SPAN + 2.6) / 2 / Math.tan(hf / 2) * 1.08);
    const up = sc.camY, launch = g.now >= XS.CRANK.spin + 1200;
    return launch ? [[0, up + d * 0.15, d * 1.05], [0, up + 1.2, ROCKET_Z]] : [[0, 1.6 + d * 0.32, d * 0.95], [0, 1.1, ROCKET_Z + 0.4]]; },
  hud() { const g = G(), now = g.now, C = XS.CRANK; return now < C.spin ? `🔄 ¡Toca GIRA sin parar! Quedan ${Math.ceil((C.spin - now) / 1000)} s para girar` : '🚀 ¡Despegue! Sube más alto quien giró más'; },
  final() { const m = G().me; return m ? m.cranks || 0 : 0; },
});
