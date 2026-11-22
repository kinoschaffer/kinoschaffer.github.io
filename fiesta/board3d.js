// Tablero 3D de Fiesta Tablero (Three.js). Expone window.Board3D.
import * as THREE from 'three';
import { GLTFLoader } from './lib/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from './lib/addons/utils/SkeletonUtils.js';

const N = 24;
const CHAR_H = 1.35;           // altura de los personajes
const TILE_COL = { B: 0x3b82f6, R: 0xef4444, E: 0xa855f7, S: 0x22c55e };

/* ---------------- Utilidades ---------------- */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0, ...o });
function mesh(geo, material, { cast = true, recv = false } = {}) { const m = new THREE.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = recv; return m; }
function rngOf(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function textSprite(text, { color = '#fff', stroke = '#1e0b3a', bg = null, h = 0.5, font = 900 } = {}) {
  const fs = 96, pad = 28;
  const meas = document.createElement('canvas').getContext('2d'); meas.font = `${font} ${fs}px system-ui, sans-serif`;
  const w = Math.ceil(meas.measureText(text).width + pad * 2), H = fs + pad;
  const tex = canvasTex(w, H, (g) => {
    if (bg) { g.fillStyle = bg; const r = H / 2; g.beginPath(); g.roundRect(4, 4, w - 8, H - 8, r - 4); g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke(); }
    g.font = `${font} ${fs}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = 14; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, H / 2 + 4); }
    g.fillStyle = color; g.fillText(text, w / 2, H / 2 + 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(h * w / H, h, 1); s.renderOrder = 10; return s;
}
function disposeTree(o) {
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    const ms = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
    ms.forEach(m => { if (m.map && !m.map.userData.shared) m.map.dispose(); m.dispose(); });
  });
}

/* ---------------- Piezas decorativas (low-poly) ---------------- */
function palm(r) {
  const g = new THREE.Group(); const trunkM = mat(0x9c6b3c);
  let y = 0, x = 0; const lean = 0.12 + r() * 0.12;
  for (let i = 0; i < 6; i++) { const s = mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.2 - i * 0.012, 0.55, 6), trunkM);
    s.position.set(x, y + 0.27, 0); s.rotation.z = -lean * i * 0.4; g.add(s); y += 0.52; x += lean * i * 0.2; }
  const leafM = mat(0x2f9e44);
  for (let i = 0; i < 7; i++) { const l = mesh(new THREE.ConeGeometry(0.28, 2.0, 4), leafM); l.scale.z = 0.25;
    const a = i / 7 * Math.PI * 2; l.position.set(x + Math.cos(a) * 0.7, y + 0.05, Math.sin(a) * 0.7);
    l.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25); l.rotation.order = 'YXZ'; l.lookAt(x + Math.cos(a) * 3, y - 1.2, Math.sin(a) * 3); l.rotateX(Math.PI / 2); g.add(l); }
  const coco = mat(0x5c3b1e);
  for (let i = 0; i < 3; i++) { const c = mesh(new THREE.SphereGeometry(0.14, 6, 5), coco); c.position.set(x + Math.cos(i * 2) * 0.2, y - 0.15, Math.sin(i * 2) * 0.2); g.add(c); }
  return g;
}
function rock(r, color) { const m = mesh(new THREE.DodecahedronGeometry(0.4 + r() * 0.6, 0), mat(color)); m.scale.set(1, 0.55 + r() * 0.4, 1 + r() * 0.4); m.rotation.y = r() * 6; m.position.y = 0.15; return m; }
function pine(r, snow) {
  const g = new THREE.Group(); const trunk = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 6), mat(0x6b4226)); trunk.position.y = 0.3; g.add(trunk);
  const gm = mat(0x1f7a4a), sm = mat(0xffffff);
  for (let i = 0; i < 3; i++) { const rr = 1.1 - i * 0.28, y = 0.8 + i * 0.65;
    const c = mesh(new THREE.ConeGeometry(rr, 1.1, 7), gm); c.position.y = y; g.add(c);
    if (snow) { const s = mesh(new THREE.ConeGeometry(rr * 0.55, 0.45, 7), sm); s.position.y = y + 0.36; g.add(s); } }
  const s = 0.8 + r() * 0.6; g.scale.set(s, s, s); return g;
}
function snowman() {
  const g = new THREE.Group(), w = mat(0xffffff);
  [[0.55, 0.5], [0.4, 1.25], [0.3, 1.8]].forEach(([rad, y]) => { const s = mesh(new THREE.SphereGeometry(rad, 10, 8), w); s.position.y = y; g.add(s); });
  const nose = mesh(new THREE.ConeGeometry(0.06, 0.35, 6), mat(0xff8c1a)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.8, 0.4); g.add(nose);
  const hat = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 10), mat(0x222222)); hat.position.y = 2.2; g.add(hat);
  const brim = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 10), mat(0x222222)); brim.position.y = 2.02; g.add(brim);
  const scarf = mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 12), mat(0xe03131)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.55; g.add(scarf);
  return g;
}
const stripeTex = (a, b) => { const t = canvasTex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b; for (let i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 - 64, 64); g.lineTo(i - 64, 64); g.fill(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
function lollipop(r) {
  const g = new THREE.Group(); const cols = ['#ff4d8d', '#4dabf7', '#ffd43b', '#51cf66', '#b197fc'];
  const stick = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), mat(0xffffff)); stick.position.y = 1.1; g.add(stick);
  const sw = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); c.strokeStyle = cols[Math.floor(r() * cols.length)]; c.lineWidth = 14;
    c.beginPath(); for (let a = 0; a < 26; a += 0.1) { const rr = a * 2.3; c.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } c.stroke(); });
  const candy = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 24), [mat(0xffffff), new THREE.MeshStandardMaterial({ map: sw, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: sw, roughness: 0.3 })]);
  candy.rotation.x = Math.PI / 2; candy.position.y = 2.6; g.add(candy); g.rotation.y = r() * 6; return g;
}
function candyCane(r) {
  const path = new THREE.CurvePath(); path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.2, 0)));
  const arc = new THREE.EllipseCurve(0.45, 2.2, 0.45, 0.45, Math.PI, 0, true); const pts = arc.getPoints(12).map(p => new THREE.Vector3(p.x, p.y, 0));
  path.add(new THREE.CatmullRomCurve3(pts));
  const t = stripeTex('#ffffff', '#e03131'); t.repeat.set(10, 1);
  const m = mesh(new THREE.TubeGeometry(path, 40, 0.16, 8, false), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }));
  const g = new THREE.Group(); g.add(m); g.rotation.y = r() * 6; return g;
}
function cupcake(r) {
  const g = new THREE.Group(); const cols = [0xff8cc6, 0xa5d8ff, 0xfff3bf, 0xd0bfff];
  const base = mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.8, 12), mat(0xc08552)); base.position.y = 0.4; g.add(base);
  const ice = mesh(new THREE.SphereGeometry(0.82, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(cols[Math.floor(r() * 4)])); ice.position.y = 0.8; ice.scale.y = 0.9; g.add(ice);
  const ch = mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(0xe03131, { roughness: 0.2 })); ch.position.y = 1.6; g.add(ch);
  const s = 0.8 + r() * 0.8; g.scale.set(s, s, s); return g;
}
function gumdrop(r) { const cols = [0xff6b6b, 0x51cf66, 0xfcc419, 0x4dabf7, 0xcc5de8]; const m = mesh(new THREE.SphereGeometry(0.45 + r() * 0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(cols[Math.floor(r() * 5)], { roughness: 0.3 })); m.scale.y = 1.3; return m; }
function crystal(r, color) {
  const g = new THREE.Group(); const m = mat(color, { emissive: color, emissiveIntensity: 0.6, roughness: 0.2 });
  for (let i = 0; i < 3 + Math.floor(r() * 3); i++) { const c = mesh(new THREE.OctahedronGeometry(0.3 + r() * 0.25, 0), m); c.scale.y = 2 + r() * 1.5;
    c.position.set((r() - 0.5) * 0.7, 0.4, (r() - 0.5) * 0.7); c.rotation.set((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6); g.add(c); }
  return g;
}
function volcano(scale, lava) {
  const g = new THREE.Group();
  const cone = mesh(new THREE.CylinderGeometry(1.1, 5, 5, 11, 3), mat(lava ? 0x3d2a24 : 0x7a5235), { recv: true }); cone.position.y = 2.5; g.add(cone);
  const top = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 11), new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff4500, emissiveIntensity: 1.4 })); top.position.y = 5.02; g.add(top);
  if (lava) { const smoke = mat(0x555555, { transparent: true, opacity: 0.55 });
    [[0, 6, 0, 0.9], [0.4, 7.1, 0.2, 1.2], [-0.3, 8.3, -0.2, 1.5]].forEach(([x, y, z, r]) => { const p = mesh(new THREE.IcosahedronGeometry(r, 0), smoke, { cast: false }); p.position.set(x, y, z); g.add(p); }); }
  g.scale.setScalar(scale); return g;
}
function cake(scale) {
  const g = new THREE.Group(); const layers = [[3.2, 1.4, 0xfff0f6], [2.4, 1.2, 0xffc9de], [1.6, 1.0, 0xfff0f6]]; let y = 0;
  layers.forEach(([rad, h, c]) => { const l = mesh(new THREE.CylinderGeometry(rad, rad, h, 20), mat(c, { flatShading: false })); l.position.y = y + h / 2; g.add(l);
    const drip = mesh(new THREE.TorusGeometry(rad, 0.15, 6, 24), mat(0xff6fa8)); drip.rotation.x = Math.PI / 2; drip.position.y = y + h; g.add(drip); y += h; });
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const cnd = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 6), mat(0x74c0fc)); cnd.position.set(Math.cos(a) * 1, y + 0.35, Math.sin(a) * 1); g.add(cnd);
    const fl = mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd43b })); fl.position.set(Math.cos(a) * 1, y + 0.8, Math.sin(a) * 1); fl.scale.y = 1.6; g.add(fl); }
  g.scale.setScalar(scale); return g;
}
function iceCastle(scale) {
  const g = new THREE.Group(); const ice = mat(0xd0ebff, { roughness: 0.15, metalness: 0.1 }); const roof = mat(0x4dabf7);
  const body = mesh(new THREE.BoxGeometry(4, 2.4, 3), ice); body.position.y = 1.2; g.add(body);
  [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5], [0, 0]].forEach(([x, z], i) => { const h = i === 4 ? 4.6 : 3.4;
    const t = mesh(new THREE.CylinderGeometry(0.6, 0.7, h, 8), ice); t.position.set(x, h / 2, z); g.add(t);
    const c = mesh(new THREE.ConeGeometry(0.85, 1.4, 8), roof); c.position.set(x, h + 0.7, z); g.add(c); });
  g.scale.setScalar(scale); return g;
}

/* ---------------- Temas ---------------- */
const THEMES = {
  isla: {
    sky: 0x7dd3fc, fog: [0xa5e4ff, 35, 90], ground: 0x7ccf5a, path: 0xf6dfa8, pillar: 0xd9b77a, hemi: [0xffffff, 0x5c8a3a, 1.1], sun: 2.2,
    waves: [[0.12, 3, 0.5], [0.06, 5, 1.3]], hills: 0.25, seed: 3,
    build(w, r, ok) {
      const water = mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: 0x1fa3e0, roughness: 0.25, metalness: 0.1 }), { cast: false, recv: true });
      water.rotation.x = -Math.PI / 2; water.position.y = -0.35; w.add(water);
      const sand = mesh(new THREE.CylinderGeometry(w.userData.R + 6, w.userData.R + 7.5, 0.6, 40), mat(0xf5deb3, { flatShading: false }), { cast: false, recv: true }); sand.position.y = -0.3; w.add(sand);
      const grass = mesh(new THREE.CylinderGeometry(w.userData.R + 3.5, w.userData.R + 4.5, 0.3, 40), mat(this.ground, { flatShading: false }), { cast: false, recv: true }); grass.position.y = -0.05; w.add(grass);
      const v = volcano(0.85, false); w.add(v);
      for (let i = 0; i < 26; i++) { const p = ok(2.5, w.userData.R + 5); if (p) { const o = r() < 0.65 ? palm(r) : rock(r, 0x8d8d8d); o.position.add(p); w.add(o); } }
      for (let i = 0; i < 10; i++) { const p = ok(1.2, w.userData.R + 3); if (p) { const f = mesh(new THREE.SphereGeometry(0.18, 6, 4), mat([0xff6b9d, 0xffd43b, 0xffffff][i % 3])); f.position.copy(p).setY(0.2); w.add(f); } }
    },
  },
  dulces: {
    sky: 0xffcfe8, fog: [0xffe3f1, 30, 85], ground: 0xffa8d2, path: 0xfff6d5, pillar: 0xc08552, hemi: [0xffffff, 0xff9ccc, 1.25], sun: 1.9,
    waves: [[0.2, 2, 0.2], [0.05, 6, 0.7]], hills: 0.45, seed: 7,
    build(w, r, ok) {
      const gr = mesh(new THREE.CircleGeometry(160, 48), mat(this.ground, { flatShading: false }), { cast: false, recv: true }); gr.rotation.x = -Math.PI / 2; w.add(gr);
      const choc = mesh(new THREE.TorusGeometry(w.userData.R + 4.5, 0.9, 6, 60), mat(0x6b3e26, { roughness: 0.3 }), { cast: false, recv: true }); choc.rotation.x = Math.PI / 2; choc.scale.z = 0.12; choc.position.y = 0.02; w.add(choc);
      w.add(cake(0.95));
      const makers = [lollipop, candyCane, cupcake, gumdrop, gumdrop];
      for (let i = 0; i < 34; i++) { const p = ok(2.2, w.userData.R + 9); if (p) { const o = makers[i % makers.length](r); o.position.add(p); w.add(o); } }
    },
  },
  lava: {
    sky: 0x1d0707, fog: [0x2b0b0b, 22, 70], ground: 0x2f2626, path: 0x5a4a44, pillar: 0x3a302c, hemi: [0xffb08a, 0x200000, 0.7], sun: 1.3,
    waves: [[0.16, 3, 1], [0.08, 4, 0.2]], hills: 0.8, seed: 13, embers: true,
    build(w, r, ok) {
      const gr = mesh(new THREE.CircleGeometry(160, 48), mat(this.ground), { cast: false, recv: true }); gr.rotation.x = -Math.PI / 2; w.add(gr);
      const v = volcano(1.05, true); w.add(v);
      const lavaM = new THREE.MeshStandardMaterial({ color: 0xff5a00, emissive: 0xff3300, emissiveIntensity: 1.2 });
      w.userData.pulse.push(t => { lavaM.emissiveIntensity = 1.0 + Math.sin(t * 2.2) * 0.35; });
      for (let i = 0; i < 9; i++) { const p = ok(3, w.userData.R + 8); if (p) { const l = mesh(new THREE.CircleGeometry(0.9 + r() * 1.4, 9), lavaM, { cast: false }); l.rotation.x = -Math.PI / 2; l.position.copy(p).setY(0.03); w.add(l); } }
      for (let i = 0; i < 22; i++) { const p = ok(2.2, w.userData.R + 9); if (p) { const o = r() < 0.5 ? rock(r, 0x4a3f3b) : crystal(r, r() < 0.5 ? 0xff7b00 : 0xb44dff); o.position.add(p); w.add(o); } }
      const pl = new THREE.PointLight(0xff5500, 60, 22, 1.6); pl.position.set(0, 6, 0); w.add(pl);
    },
  },
  nieve: {
    sky: 0xb8d8f5, fog: [0xdcebfb, 28, 80], ground: 0xf4f8fc, path: 0xa5d8ff, pillar: 0xdbe9f6, hemi: [0xffffff, 0xb0c8e8, 1.15], sun: 1.9,
    waves: [[0.1, 4, 0.3], [0.07, 2, 2]], hills: 0.5, seed: 21, snow: true,
    build(w, r, ok) {
      const gr = mesh(new THREE.CircleGeometry(160, 48), mat(this.ground, { flatShading: false }), { cast: false, recv: true }); gr.rotation.x = -Math.PI / 2; w.add(gr);
      const lake = mesh(new THREE.CircleGeometry(3, 24), new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.05, metalness: 0.3 }), { cast: false, recv: true });
      lake.rotation.x = -Math.PI / 2; lake.position.set(w.userData.R + 6, 0.02, -4); w.add(lake);
      w.add(iceCastle(0.9));
      for (let i = 0; i < 34; i++) { const p = ok(2.3, w.userData.R + 10); if (p) { const o = r() < 0.75 ? pine(r, true) : (r() < 0.6 ? snowman() : crystal(r, 0x74c0fc)); o.position.add(p); o.rotation.y = r() * 6; w.add(o); } }
    },
  },
};

/* ---------------- Estado del motor ---------------- */
let renderer, scene, camera, hemi, sun, clock, canvas, world = null, worldTheme = null, tiles = [], tileTop = [], curve = null;
let visible = false, camMode = 'follow', lastS = null, myId = null;
const avatars = new Map();       // pid -> avatar
const floaters = [];
const look = new THREE.Vector3(), camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();
let crown, dice, diceNum = null, arrow, particles = null;
const loader = new GLTFLoader(), modelCache = {};
const ICON_TEX = {};

function iconTex(type) {
  if (ICON_TEX[type]) return ICON_TEX[type];
  const label = { B: '+3', R: '−3', E: '?', S: 'SALIDA' }[type];
  const t = canvasTex(256, 256, (g) => {
    g.font = `900 ${type === 'S' ? 58 : 130}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(label, 128, 136); g.fillStyle = '#fff'; g.fillText(label, 128, 136);
  });
  t.userData.shared = true; return ICON_TEX[type] = t;
}

function init() {
  canvas = document.createElement('canvas'); canvas.id = 'scene3d';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'none', zIndex: '0', touchAction: 'none' });
  document.body.prepend(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300); camera.position.set(0, 25, 25);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(12, 22, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 }); sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  // Corona
  crown = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.8, roughness: 0.25, emissive: 0x7a5200, emissiveIntensity: 0.4 });
  const ring = mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.35, 16, 1, true), gold); ring.material.side = THREE.DoubleSide; crown.add(ring);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const sp = mesh(new THREE.ConeGeometry(0.14, 0.45, 6), gold); sp.position.set(Math.cos(a) * 0.52, 0.38, Math.sin(a) * 0.52); crown.add(sp);
    const gem = mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: [0xff3355, 0x33aaff, 0x33dd77][i % 3], roughness: 0.1, emissive: 0x220000 })); gem.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); crown.add(gem); }
  const glow = new THREE.PointLight(0xffd54a, 8, 5, 1.5); glow.position.y = 0.3; crown.add(glow);
  crown.userData = { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, idx: -1 }; scene.add(crown);
  // Dado
  const pip = [[], [[.5, .5]], [[.25, .25], [.75, .75]], [[.25, .25], [.5, .5], [.75, .75]], [[.25, .25], [.75, .25], [.25, .75], [.75, .75]],
    [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], [[.25, .25], [.75, .25], [.25, .5], [.75, .5], [.25, .75], [.75, .75]]];
  const faceMat = v => new THREE.MeshStandardMaterial({ roughness: 0.4, map: canvasTex(128, 128, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.fillStyle = v === 1 ? '#e03131' : '#1e0b3a';
    pip[v].forEach(([x, y]) => { g.beginPath(); g.arc(x * 128, y * 128, 13, 0, 7); g.fill(); }); }) });
  dice = mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), [1, 6, 2, 5, 3, 4].map(faceMat)); dice.visible = false; scene.add(dice);
  arrow = mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0x997700, emissiveIntensity: 0.6 }), { cast: false });
  arrow.rotation.x = Math.PI; scene.add(arrow);
  clock = new THREE.Clock();
  addEventListener('resize', resize); resize();
  renderer.setAnimationLoop(frame);
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 58 : 45; camera.updateProjectionMatrix(); }

function buildWorld(theme, board) {
  const th = THEMES[theme] || THEMES.isla;
  if (world) { scene.remove(world); disposeTree(world); }
  if (particles) { scene.remove(particles); particles.geometry.dispose(); particles = null; }
  world = new THREE.Group(); world.userData.pulse = []; worldTheme = theme;
  scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(...th.fog); scene.fog.userData = { near: th.fog[1], far: th.fog[2] };
  hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2]; sun.intensity = th.sun;
  // Camino
  const M = 72, pts = [];
  for (let i = 0; i < M; i++) { const a = i / M * Math.PI * 2; let rr = 1; th.waves.forEach(([amp, k, ph]) => rr += amp * Math.sin(k * a + ph)); pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr)); }
  let L = new THREE.CatmullRomCurve3(pts, true).getLength(); const sc = N * 2.7 / L;
  pts.forEach((p, i) => { p.multiplyScalar(sc); const a = i / M * Math.PI * 2; p.y = th.hills * (1 + Math.sin(2 * a + th.seed) * 0.7 + Math.sin(3 * a) * 0.3); });
  curve = new THREE.CatmullRomCurve3(pts, true);
  world.userData.R = Math.max(...pts.map(p => Math.hypot(p.x, p.z)));
  const sp = curve.getSpacedPoints(N); tiles = sp.slice(0, N);
  const road = mesh(new THREE.TubeGeometry(curve, 240, 0.34, 6, true), mat(th.path), { recv: true }); road.scale.y = 0.6; road.position.y = 0.0; world.add(road);
  const pillarM = mat(th.pillar), rimM = mat(0xffffff, { flatShading: false, roughness: 0.4 });
  tileTop = [];
  tiles.forEach((p, i) => {
    const type = board[i] || 'B'; const g = new THREE.Group(); g.position.copy(p);
    const top = mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.3, 30), mat(TILE_COL[type], { flatShading: false, roughness: 0.45 }), { recv: true }); top.position.y = 0.15;
    const rim = mesh(new THREE.CylinderGeometry(1.12, 1.16, 0.2, 30), rimM, { recv: true }); rim.position.y = 0.04;
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), new THREE.MeshBasicMaterial({ map: iconTex(type), transparent: true, depthWrite: false }));
    icon.rotation.x = -Math.PI / 2; icon.position.y = 0.31;
    const next = tiles[(i + 1) % N]; icon.rotation.z = Math.atan2(next.x - p.x, next.z - p.z) + Math.PI;
    g.add(top, rim, icon);
    if (p.y > 0.15) { const pil = mesh(new THREE.CylinderGeometry(0.6, 0.8, p.y + 0.3, 8), pillarM); pil.position.y = -(p.y + 0.3) / 2; g.add(pil); }
    world.add(g); tileTop.push(new THREE.Vector3(p.x, p.y + 0.3, p.z));
  });
  // Decoración (evitando el camino)
  const r = rngOf(th.seed * 999 + 1), placed = [];
  const ok = (minD, maxR) => {
    for (let tries = 0; tries < 30; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * maxR; const p = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      if (Math.hypot(p.x, p.z) < 6.2) continue; // centro reservado al monumento
      let good = true; for (const t of tiles) if (Math.hypot(t.x - p.x, t.z - p.z) < minD + 0.6) { good = false; break; }
      if (good) for (let k = 0; k < M; k += 2) { if (Math.hypot(pts[k].x - p.x, pts[k].z - p.z) < minD) { good = false; break; } }
      if (good) for (const q of placed) if (q.distanceTo(p) < 1.6) { good = false; break; }
      if (good) { placed.push(p); return p; }
    }
    return null;
  };
  th.build(world, r, ok);
  scene.add(world);
  // Partículas
  if (th.snow || th.embers) {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 60; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() - .5) * 60; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: th.snow ? 0xffffff : 0xff8a3d, size: th.snow ? 0.16 : 0.12, transparent: true, opacity: 0.9, depthWrite: false }));
    particles.userData.dir = th.snow ? -1 : 1; scene.add(particles);
  }
  crown.userData.idx = -1;
  avatars.forEach(av => snapAvatar(av));
}

/* ---------------- Personajes ---------------- */
function loadModel(id) {
  if (!modelCache[id]) modelCache[id] = new Promise(res => loader.load(`models/${id}.glb`, g => res(g), undefined, () => res(null)));
  return modelCache[id];
}
function labelFor(p) { const s = textSprite(p.name, { bg: p.color, stroke: null, h: 0.36, font: 800 }); s.position.y = CHAR_H + 0.45; return s; }
function makeAvatar(p) {
  const g = new THREE.Group(); scene.add(g);
  const av = { id: p.id, g, model: null, mixer: null, walk: null, tile: p.pos, target: p.pos, queue: [], anim: null, coins: p.coins, crowns: p.crowns, name: p.name, color: p.color, emoji: p.emoji, facing: 0 };
  // Marcador en el piso
  const ring = mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: p.color }), { cast: false }); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring); av.ring = ring;
  // Mientras carga: ficha simple
  const ph = mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), mat(p.color, { flatShading: false })); ph.position.y = 0.6; g.add(ph); av.placeholder = ph;
  av.label = labelFor(p); g.add(av.label);
  const cid = (window.FIESTA_CHARS.find(c => c.emoji === p.emoji) || {}).id;
  if (cid) loadModel(cid).then(gltf => {
    if (!gltf || !avatars.has(av.id)) return;
    const m = SkeletonUtils.clone(gltf.scene);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { o.material.side = THREE.FrontSide; } } });
    m.updateMatrixWorld(true);
    m.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox && o.computeBoundingBox(); } });
    const box = new THREE.Box3().setFromObject(m, true); let h = box.max.y - box.min.y;
    if (!(h > 0.01 && h < 1000)) { box.setFromObject(m); h = box.max.y - box.min.y || 1; }
    const s = CHAR_H / h;
    m.scale.setScalar(s); m.position.y = -box.min.y * s;
    g.remove(ph); disposeTree(ph); g.add(m); av.model = m;
    if (gltf.animations && gltf.animations.length) {
      av.mixer = new THREE.AnimationMixer(m);
      av.walk = av.mixer.clipAction(gltf.animations[0]); av.walk.play(); av.walk.paused = true; av.walk.time = 0; av.walk.weight = 1;
    }
  });
  snapAvatar(av); return av;
}
function slotOffset(av) {
  const same = [...avatars.values()].filter(o => o.tile === av.tile && !o.anim && !o.queue.length);
  if (same.length <= 1) return new THREE.Vector3();
  const k = same.indexOf(av), a = k / same.length * Math.PI * 2 + 0.6; const rad = same.length > 3 ? 0.62 : 0.5;
  return new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
}
function tilePos(i) { return tileTop.length ? tileTop[((i % N) + N) % N].clone() : new THREE.Vector3(); }
function faceDir(i) { const a = tiles[((i % N) + N) % N], b = tiles[(i + 1) % N]; return Math.atan2(b.x - a.x, b.z - a.z); }
function snapAvatar(av) { if (!tileTop.length) return; av.anim = null; av.queue = []; av.tile = av.target; av.g.position.copy(tilePos(av.tile)); av.facing = faceDir(av.tile); av.g.rotation.y = av.facing; }

function setWalking(av, on) {
  if (!av.walk) return;
  if (on && av.walk.paused) { av.walk.paused = false; }
  if (!on && !av.walk.paused) { av.walk.paused = true; av.walk.time = 0; av.mixer.update(0); }
}

function floatText(av, text, color) {
  const s = textSprite(text, { color, h: 0.75 }); s.position.copy(av.g.position).add(new THREE.Vector3(0, CHAR_H + 1.0, 0));
  scene.add(s); floaters.push({ s, t: 0 });
}

/* ---------------- Actualización desde el estado del juego ---------------- */
function update(S, me) {
  lastS = S; myId = me;
  if (!renderer || !S || S.phase === 'lobby') return;
  const board = S.board || [];
  if (worldTheme !== (S.theme || 'isla') || !tiles.length) buildWorld(S.theme || 'isla', board);
  const ids = new Set(S.players.map(p => p.id));
  for (const [id, av] of avatars) if (!ids.has(id)) { scene.remove(av.g); disposeTree(av.g); avatars.delete(id); }
  const cur = S.players[S.turn];
  S.players.forEach(p => {
    let av = avatars.get(p.id);
    if (av && (av.emoji !== p.emoji || av.name !== p.name)) { scene.remove(av.g); disposeTree(av.g); avatars.delete(p.id); av = null; }
    if (!av) { av = makeAvatar(p); av.target = av.tile = p.pos; snapAvatar(av); avatars.set(p.id, av); }
    if (p.pos !== av.target) {
      const d = (p.pos - av.target + N) % N;
      if (S.phase === 'moving' && p === cur && d >= 1 && d <= 3) { for (let k = 1; k <= d; k++) av.queue.push({ type: 'hop', to: (av.target + k) % N }); }
      else av.queue.push({ type: 'warp', to: p.pos });
      av.target = p.pos;
    }
    const live = visible && ['moving', 'event', 'crown'].includes(S.phase);
    if (p.coins !== av.coins && live) { const d = p.coins - av.coins; floatText(av, (d > 0 ? '+' : '') + d + ' 🪙', d > 0 ? '#ffd43b' : '#ff6b6b'); av.coins = p.coins; }
    if (p.crowns !== av.crowns && live && p.crowns > av.crowns) floatText(av, '+1 👑', '#ffe066');
    av.coins = p.coins; av.crowns = p.crowns;
    av.g.visible = true; av.label.material.opacity = p.connected ? 1 : 0.4;
  });
  // Corona
  if (S.crown !== crown.userData.idx && tileTop.length) {
    const to = tilePos(S.crown).add(new THREE.Vector3(0, CHAR_H + 1.25, 0));
    if (crown.userData.idx < 0) { crown.position.copy(to); crown.userData.t = 1; } else { crown.userData.from.copy(crown.position); crown.userData.t = 0; }
    crown.userData.to.copy(to); crown.userData.idx = S.crown;
  }
  // Dado
  if (S.phase === 'rolling') { dice.visible = true; if (diceNum) { scene.remove(diceNum); diceNum = null; } }
  else {
    dice.visible = false;
    const showNum = (S.phase === 'moving' || S.phase === 'crown') && S.dice;
    if (showNum && (!diceNum || diceNum.userData.v !== S.dice + '-' + S.rollId)) { if (diceNum) scene.remove(diceNum); diceNum = textSprite(String(S.dice), { color: '#fff', h: 1.1 }); diceNum.userData.v = S.dice + '-' + S.rollId; scene.add(diceNum); }
    if (!showNum && diceNum) { scene.remove(diceNum); diceNum = null; }
  }
}

/* ---------------- Bucle ---------------- */
const tmp = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (!visible || !lastS) return;
  const S = lastS, cur = S.players[S.turn], curAv = cur && avatars.get(cur.id);
  avatars.forEach(av => {
    if (!av.anim && av.queue.length) {
      const step = av.queue.shift();
      av.anim = { ...step, t: 0, from: av.g.position.clone(), dur: step.type === 'hop' ? 0.33 : 0.8, fromTile: av.tile };
      av.tile = step.to; if (step.type === 'hop') setWalking(av, true);
    }
    if (av.anim) {
      const a = av.anim; a.t += dt / a.dur; const k = Math.min(1, a.t);
      const to = tilePos(a.to);
      if (a.type === 'hop') {
        av.g.position.lerpVectors(a.from, to, k); av.g.position.y += Math.sin(Math.PI * k) * 0.55;
        const dir = Math.atan2(to.x - a.from.x, to.z - a.from.z); av.g.rotation.y = dir; av.facing = dir;
      } else {
        const s = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2;
        av.g.scale.setScalar(Math.max(0.01, s)); av.g.rotation.y += dt * 14;
        if (k >= 0.5) av.g.position.copy(to);
      }
      if (a.t >= 1) { av.anim = null; av.g.scale.setScalar(1); if (!av.queue.length) { setWalking(av, false); av.facing = faceDir(av.tile); } }
    } else {
      const goal = tilePos(av.tile).add(slotOffset(av));
      av.g.position.lerp(goal, 1 - Math.exp(-dt * 10));
      // Mirar hacia la cámara suavemente cuando está quieto
      const want = Math.atan2(camera.position.x - av.g.position.x, camera.position.z - av.g.position.z);
      let diff = want - av.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); av.g.rotation.y += diff * (1 - Math.exp(-dt * 4));
      if (av.model) { av.model.scale.y = av.model.scale.x * (1 + Math.sin(t * 3 + av.tile) * 0.015); }
    }
    if (av.mixer) av.mixer.update(dt * 1.6);
    const isCur = cur && av.id === cur.id;
    av.ring.scale.setScalar(isCur ? 1.25 + Math.sin(t * 6) * 0.12 : 1);
  });
  // Flecha sobre el jugador actual
  if (curAv) { arrow.visible = S.phase === 'turn'; arrow.position.copy(curAv.g.position).add(tmp.set(0, CHAR_H + 1.25 + Math.sin(t * 5) * 0.12, 0)); arrow.rotation.y += dt * 3; }
  // Dado y número
  if (dice.visible && curAv) { dice.position.copy(curAv.g.position).add(tmp.set(0, CHAR_H + 1.5, 0)); dice.rotation.x += dt * 11; dice.rotation.y += dt * 8; dice.rotation.z += dt * 5; }
  if (diceNum && curAv) diceNum.position.copy(curAv.g.position).add(tmp.set(0, CHAR_H + 1.5, 0));
  // Corona
  const cu = crown.userData;
  if (cu.t < 1) { cu.t = Math.min(1, cu.t + dt / 1.4); const k = cu.t; crown.position.lerpVectors(cu.from, cu.to, k); crown.position.y += Math.sin(Math.PI * k) * 6; }
  else crown.position.y = cu.to.y + Math.sin(t * 2) * 0.15;
  crown.rotation.y += dt * 1.5;
  // Textos flotantes
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; f.s.position.y += dt * 0.9; f.s.material.opacity = Math.min(1, 2.2 - f.t);
    if (f.t > 2.2) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); floaters.splice(i, 1); } }
  // Partículas y efectos del tema
  if (particles) { const a = particles.geometry.attributes.position; const d = particles.userData.dir;
    for (let i = 0; i < a.count; i++) { let y = a.getY(i) + d * dt * (d < 0 ? 1.6 : 2.4); if (y < 0) y = 25; if (y > 25) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t + i) * dt * 0.3); }
    a.needsUpdate = true; }
  if (world) world.userData.pulse.forEach(f => f(t));
  // Cámara
  const focus = curAv ? curAv.g.position : tmp.set(0, 0, 0);
  if (camMode === 'overview' || !curAv) {
    const R = (world && world.userData.R) || 12; const far = camera.aspect < 1 ? 1.35 / camera.aspect : 1.4; camGoal.set(0, R * 1.9 * far, R * 1.25 * far); lookGoal.set(0, 0, 1.0);
  } else {
    const out = new THREE.Vector3(focus.x, 0, focus.z); if (out.lengthSq() < 0.01) out.set(0, 0, 1); out.normalize();
    camGoal.copy(focus).addScaledVector(out, 7.2).add(tmp.set(0, 6.2, 0)); lookGoal.copy(focus).addScaledVector(out, -1.5).add(tmp.set(0, 0.4, 0));
  }
  const kk = 1 - Math.exp(-dt * 2.6); camera.position.lerp(camGoal, kk); look.lerp(lookGoal, kk); camera.lookAt(look);
  if (scene.fog && scene.fog.userData.far) { const extra = Math.max(0, camera.position.distanceTo(look) - 10); scene.fog.near = scene.fog.userData.near + extra; scene.fog.far = scene.fog.userData.far + extra * 1.2; }
  sun.position.set(look.x + 12, 22, look.z + 8); sun.target.position.copy(look);
  renderer.render(scene, camera);
}

/* ---------------- API ---------------- */
let ok = true;
try { init(); } catch (e) { console.warn('3D no disponible', e); ok = false; }
window.Board3D = {
  ok,
  show(on) { if (!ok) return; visible = on; canvas.style.display = on ? 'block' : 'none'; if (on) { clock.getDelta(); } },
  update,
  toggleView() { camMode = camMode === 'follow' ? 'overview' : 'follow'; return camMode; },
  preload(ids) { ids.forEach(loadModel); },
  themes: Object.keys(THEMES),
};
window.dispatchEvent(new Event('board3d-ready'));
