// Música y efectos de sonido sintetizados (WebAudio): no usa archivos de audio.
// window.SFX.play(nombre), SFX.music(tema | null), SFX.enable(bool)
(function () {
  'use strict';
  let ctx = null, master = null, musicGain = null, sfxGain = null, enabled = true, current = null, timer = null;
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = enabled ? 1 : 0; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.09; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.35; sfxGain.connect(master);
    return ctx;
  }
  // Los navegadores exigen un toque del usuario antes de sonar
  const unlock = () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, unlock, { passive: true }));

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  function tone(freq, t, dur, { type = 'square', vol = 0.5, to = null, out = sfxGain, attack = 0.005 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(t, dur, { vol = 0.5, freq = 1200, q = 0.8, out = sfxGain, type = 'lowpass' } = {}) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.02);
  }
  const arp = (notes, t, step, opts) => notes.forEach((n, i) => tone(midi(n), t + i * step, step * 1.6, opts));

  const FX = {
    tap: t => tone(880, t, 0.05, { type: 'triangle', vol: 0.25 }),
    step: t => tone(520, t, 0.07, { type: 'triangle', vol: 0.25, to: 700 }),
    dice: t => { for (let i = 0; i < 7; i++) noise(t + i * 0.06, 0.04, { vol: 0.35, freq: 2500 + Math.random() * 1500, type: 'bandpass', q: 3 }); },
    hit: t => { tone(220, t, 0.12, { type: 'square', vol: 0.4, to: 660 }); noise(t, 0.08, { vol: 0.3, freq: 3000 }); },
    coin: t => { tone(988, t, 0.08, { type: 'square', vol: 0.3 }); tone(1319, t + 0.07, 0.25, { type: 'square', vol: 0.3 }); },
    lose: t => arp([67, 63, 60], t, 0.11, { type: 'sawtooth', vol: 0.25 }),
    crown: t => arp([60, 64, 67, 72, 76, 79, 84], t, 0.07, { type: 'square', vol: 0.3 }),
    event: t => arp([84, 88, 91, 96], t, 0.05, { type: 'sine', vol: 0.35 }),
    whoosh: t => noise(t, 0.4, { vol: 0.4, freq: 800, type: 'bandpass', q: 1 }),
    fork: t => arp([72, 76], t, 0.1, { type: 'triangle', vol: 0.35 }),
    duel: t => { [0, 0.18, 0.36].forEach(d => { tone(110, t + d, 0.15, { type: 'sine', vol: 0.6, to: 55 }); noise(t + d, 0.1, { vol: 0.3, freq: 300 }); }); arp([57, 60, 63], t + 0.55, 0.12, { type: 'sawtooth', vol: 0.25 }); },
    turn: t => arp([76, 81], t, 0.09, { type: 'triangle', vol: 0.4 }),
    beep: t => tone(660, t, 0.12, { type: 'square', vol: 0.3 }),
    go: t => tone(1320, t, 0.35, { type: 'square', vol: 0.35 }),
    jump: t => tone(300, t, 0.18, { type: 'square', vol: 0.25, to: 900 }),
    boom: t => { noise(t, 0.6, { vol: 0.8, freq: 400 }); tone(90, t, 0.4, { type: 'sine', vol: 0.6, to: 40 }); },
    bad: t => tone(180, t, 0.25, { type: 'sawtooth', vol: 0.3, to: 120 }),
    win: t => { arp([72, 76, 79, 84], t, 0.1, { type: 'square', vol: 0.3 }); tone(midi(88), t + 0.45, 0.6, { type: 'square', vol: 0.3 }); },
    fanfare: t => { arp([60, 60, 60, 64, 67, 64, 67, 72], t, 0.13, { type: 'square', vol: 0.3 }); tone(midi(72), t + 1.1, 0.9, { type: 'triangle', vol: 0.35 }); },
    shop: t => arp([79, 83, 86, 91], t, 0.06, { type: 'triangle', vol: 0.35 }),
    item: t => { arp([67, 74, 79, 86], t, 0.05, { type: 'sine', vol: 0.4 }); noise(t, 0.3, { vol: 0.15, freq: 6000, type: 'highpass' }); },
    ready: t => { tone(midi(79), t, 0.12, { type: 'triangle', vol: 0.4 }); tone(midi(86), t + 0.09, 0.25, { type: 'triangle', vol: 0.4 }); },
    tick: t => { noise(t, 0.035, { vol: 0.5, freq: 2200, type: 'bandpass', q: 6 }); tone(1100, t, 0.04, { type: 'sine', vol: 0.25 }); },
    tickhi: t => { noise(t, 0.04, { vol: 0.6, freq: 3200, type: 'bandpass', q: 6 }); tone(1650, t, 0.07, { type: 'square', vol: 0.22 }); },
    whistle: t => { [0, 0.32].forEach((d, i) => { const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'sine'; o.frequency.value = 2900;
      l.frequency.value = 38; lg.gain.value = 90; l.connect(lg); lg.connect(o.frequency); const dur = i ? 0.55 : 0.2; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.32, t + d + 0.02); g.gain.setValueAtTime(0.32, t + d + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + d + dur);
      o.connect(g); g.connect(sfxGain); o.start(t + d); l.start(t + d); o.stop(t + d + dur + 0.05); l.stop(t + d + dur + 0.05); }); noise(t, 0.6, { vol: 0.12, freq: 3000, type: 'bandpass', q: 2 }); },
    hurt: t => { tone(520, t, 0.18, { type: 'square', vol: 0.35, to: 160 }); noise(t, 0.12, { vol: 0.35, freq: 900 }); },
    pop: t => tone(700, t, 0.07, { type: 'sine', vol: 0.25, to: 300 }),
  };
  let lastPlay = {};
  function play(name) {
    if (!enabled || !init() || ctx.state !== 'running' || !FX[name]) return;
    const now = performance.now(); if (now - (lastPlay[name] || 0) < 40) return; lastPlay[name] = now; // evitar saturar
    FX[name](ctx.currentTime + 0.01);
  }

  // ----- Música: secuenciador simple con bajo, acordes y melodía generada
  const SONGS = {
    isla:   { bpm: 112, root: 62, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4], lead: 'triangle', seed: 3 },
    dulces: { bpm: 124, root: 65, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 3], lead: 'square', seed: 7 },
    lava:   { bpm: 132, root: 57, scale: [0, 3, 5, 7, 10], prog: [0, 0, 5, 3], lead: 'sawtooth', seed: 11 },
    nieve:  { bpm: 96, root: 64, scale: [0, 2, 4, 7, 9, 11], prog: [0, 4, 5, 3], lead: 'sine', seed: 5 },
    mg:     { bpm: 148, root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 4], lead: 'square', seed: 21 },
    lobby:  { bpm: 100, root: 67, scale: [0, 2, 4, 7, 9], prog: [0, 3, 0, 4], lead: 'triangle', seed: 9 },
    // minijuegos: cada estilo con su propia música
    mg_intro:   { bpm: 96, root: 62, scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 3], lead: 'triangle', seed: 31, soft: true },
    mg_tension: { bpm: 140, root: 57, scale: [0, 3, 5, 7, 10], prog: [0, 0, 5, 4], lead: 'sawtooth', seed: 41, minor: true },
    mg_carrera: { bpm: 164, root: 62, scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 3], lead: 'square', seed: 53 },
    mg_deporte: { bpm: 128, root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 0], lead: 'triangle', seed: 61 },
    mg_suerte:  { bpm: 108, root: 65, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], lead: 'sine', seed: 71, swing: true },
    mg_calma:   { bpm: 90, root: 64, scale: [0, 2, 4, 7, 9, 11], prog: [0, 3, 5, 4], lead: 'sine', seed: 83, soft: true },
  };
  const MINOR = [0, 2, 3, 5, 7, 8, 10];
  let tempoK = 1;
  const DEG = [0, 2, 4, 5, 7, 9, 11];
  function makePattern(song) { let a = song.seed * 9301 + 49297; const r = () => (a = (a * 9301 + 49297) % 233280) / 233280; const mel = [];
    for (let i = 0; i < 32; i++) mel.push(r() < 0.72 ? song.scale[Math.floor(r() * song.scale.length)] + (r() < 0.25 ? 12 : 0) : null); return mel; }
  function music(name) {
    if (current === name) return; current = name; clearInterval(timer); timer = null;
    if (!name || !SONGS[name] || !init()) return;
    tempoK = 1; const song = SONGS[name], mel = makePattern(song), DG = song.minor ? MINOR : DEG; let step = 0, next = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      if (!enabled || ctx.state !== 'running') { next = ctx.currentTime + 0.1; return; }
      while (next < ctx.currentTime + 0.25) {
        const stepDur = 60 / song.bpm / 2 / tempoK * (song.swing ? (step % 2 ? 0.8 : 1.2) : 1), bar = Math.floor(step / 8) % 4, chord = song.root + DG[song.prog[bar]];
        if (step % 4 === 0) tone(midi(chord - 24), next, stepDur * 3.5, { type: 'triangle', vol: 0.55, out: musicGain });
        if (step % 4 === 2) tone(midi(chord - 12), next, stepDur * 1.5, { type: 'triangle', vol: 0.35, out: musicGain });
        if (step % 8 === 0) [0, 4, 7].forEach(iv => tone(midi(chord + iv), next, stepDur * 6, { type: 'sine', vol: 0.12, out: musicGain, attack: 0.05 }));
        if (step % 2 === 0 && !song.soft) noise(next, 0.03, { vol: step % 8 === 4 ? 0.25 : 0.08, freq: 7000, type: 'highpass', out: musicGain });
        if (step % 8 === 0 && !song.soft) tone(60, next, 0.18, { type: 'sine', vol: 0.5, to: 35, out: musicGain });
        if (tempoK > 1.05 && step % 2 === 1) noise(next, 0.025, { vol: 0.14, freq: 9000, type: 'highpass', out: musicGain }); // más urgencia al final
        const n = mel[step % 32]; if (n != null) tone(midi(song.root + n + 12), next, stepDur * 0.9, { type: song.lead, vol: 0.22, out: musicGain });
        next += stepDur; step++;
      }
    }, 60);
  }
  function tempo(k) { tempoK = k || 1; }

  // ----- Sonido ambiente de cada escenario (olas, viento, lava, noche, público…)
  let amb = null, ambName = null;
  let ambBuf = null; const loopBuf = () => { if (!ambBuf) { ambBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = ambBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return ambBuf; };
  function ambient(name) {
    if (ambName === name) return; ambName = name;
    if (amb) { const a = amb; amb = null; try { a.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => { a.nodes.forEach(n => { try { n.stop(); } catch (e) { } }); clearInterval(a.timer); a.gain.disconnect(); }, 1500); } catch (e) { } }
    if (!name || !init()) return;
    const t = ctx.currentTime, g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, t, 0.8); g.connect(master);
    const a = amb = { gain: g, nodes: [], timer: null };
    const bed = (freq, type, vol, lfoHz, depth, q = 0.7) => { const src = ctx.createBufferSource(); src.buffer = loopBuf(); src.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const v = ctx.createGain(); v.gain.value = vol; src.connect(f); f.connect(v); v.connect(g); src.start();
      if (lfoHz) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = lfoHz; lg.gain.value = vol * depth; l.connect(lg); lg.connect(v.gain); l.start(); a.nodes.push(l); } a.nodes.push(src); return f; };
    const every = (ms, fn) => { a.timer = setInterval(() => { if (!enabled || ctx.state !== 'running' || amb !== a) return; fn(ctx.currentTime + 0.05); }, ms); };
    if (name === 'olas') { bed(520, 'lowpass', 0.09, 0.11, 0.9); bed(2500, 'bandpass', 0.015, 0.11, 0.9); every(2600, t => Math.random() < 0.4 && tone(midi(84 + Math.floor(Math.random() * 5)), t, 0.12, { type: 'sine', vol: 0.05, to: midi(88) })); }
    else if (name === 'viento') { const f = bed(900, 'bandpass', 0.08, 0.07, 0.8, 1.5); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.09; lg.gain.value = 450; l.connect(lg); lg.connect(f.frequency); l.start(); a.nodes.push(l); }
    else if (name === 'lava') { bed(180, 'lowpass', 0.14, 0.2, 0.5); every(380, t => Math.random() < 0.55 && tone(140 + Math.random() * 160, t, 0.09, { type: 'sine', vol: 0.12, to: 500 + Math.random() * 300, out: g })); }
    else if (name === 'noche') { bed(300, 'lowpass', 0.05, 0.05, 0.5); every(900, t => { if (Math.random() < 0.7) for (let i = 0; i < 3; i++) tone(4300 + Math.random() * 300, t + i * 0.07, 0.04, { type: 'sine', vol: 0.03, out: g }); }); }
    else if (name === 'publico') { bed(1100, 'bandpass', 0.06, 0.15, 0.5, 0.6); bed(400, 'bandpass', 0.05, 0.09, 0.4, 0.6); }
    else if (name === 'espacio') { [55, 82.4, 110.3].forEach(fq => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sine'; o.frequency.value = fq; v.gain.value = 0.035; o.connect(v); v.connect(g); o.start(); a.nodes.push(o); }); }
    else if (name === 'campo') { bed(3000, 'highpass', 0.012, 0.2, 0.6); every(1700, t => Math.random() < 0.5 && arp([88 + Math.floor(Math.random() * 3), 91, 86].slice(0, 2 + Math.floor(Math.random() * 2)), t, 0.07, { type: 'sine', vol: 0.045, out: g })); }
  }
  function enable(on) { enabled = !!on; if (master) master.gain.value = enabled ? 1 : 0; }
  window.SFX = { play, music, tempo, ambient, enable, get enabled() { return enabled; } };
})();
