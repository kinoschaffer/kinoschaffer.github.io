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
  };
  const DEG = [0, 2, 4, 5, 7, 9, 11];
  function makePattern(song) { let a = song.seed * 9301 + 49297; const r = () => (a = (a * 9301 + 49297) % 233280) / 233280; const mel = [];
    for (let i = 0; i < 32; i++) mel.push(r() < 0.72 ? song.scale[Math.floor(r() * song.scale.length)] + (r() < 0.25 ? 12 : 0) : null); return mel; }
  function music(name) {
    if (current === name) return; current = name; clearInterval(timer); timer = null;
    if (!name || !SONGS[name] || !init()) return;
    const song = SONGS[name], mel = makePattern(song), stepDur = 60 / song.bpm / 2; let step = 0, next = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      if (!enabled || ctx.state !== 'running') { next = ctx.currentTime + 0.1; return; }
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % 4, chord = song.root + DEG[song.prog[bar]];
        if (step % 4 === 0) tone(midi(chord - 24), next, stepDur * 3.5, { type: 'triangle', vol: 0.55, out: musicGain });
        if (step % 4 === 2) tone(midi(chord - 12), next, stepDur * 1.5, { type: 'triangle', vol: 0.35, out: musicGain });
        if (step % 8 === 0) [0, 4, 7].forEach(iv => tone(midi(chord + iv), next, stepDur * 6, { type: 'sine', vol: 0.12, out: musicGain, attack: 0.05 }));
        if (step % 2 === 0) noise(next, 0.03, { vol: step % 8 === 4 ? 0.25 : 0.08, freq: 7000, type: 'highpass', out: musicGain });
        if (step % 8 === 0) tone(60, next, 0.18, { type: 'sine', vol: 0.5, to: 35, out: musicGain });
        const n = mel[step % 32]; if (n != null) tone(midi(song.root + n + 12), next, stepDur * 0.9, { type: song.lead, vol: 0.22, out: musicGain });
        next += stepDur; step++;
      }
    }, 60);
  }
  function enable(on) { enabled = !!on; if (master) master.gain.value = enabled ? 1 : 0; }
  window.SFX = { play, music, enable, get enabled() { return enabled; } };
})();
