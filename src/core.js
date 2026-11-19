'use strict';
// ===== Core: math, seeded randomness, storage =====
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const d2 = (ax, ay, bx, by) => { const x = bx - ax, y = by - ay; return x * x + y * y; };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// One hash to rule them all: (seed, a, b, salt) -> uint32. Same inputs, same answer, forever.
function hash(a, b = 0, c = 0, d = 0) {
  let h = (a | 0) ^ 0x9E3779B9;
  h = Math.imul(h ^ (b | 0), 0x85EBCA6B); h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xC2B2AE35); h ^= h >>> 16;
  h = Math.imul(h ^ (d | 0), 0x27D4EB2F); h ^= h >>> 15;
  return h >>> 0;
}
function strHash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Small fast PRNG (mulberry32) with helpers
function RNG(seed) {
  let t = seed >>> 0;
  const f = () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.range = (a, b) => a + f() * (b - a);
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  f.weighted = (list, wf) => { let tot = 0; for (const x of list) tot += wf(x); let r = f() * tot; for (const x of list) { r -= wf(x); if (r <= 0) return x; } return list[list.length - 1]; };
  return f;
}
const R = RNG((Math.random() * 4294967296) >>> 0); // unseeded combat randomness

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const normSeed = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const randomSeed = () => { let s = ''; for (let i = 0; i < 6; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)]; return s; };

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// ===== Persistent meta (embers, unlocks, saved seeds, secrets) =====
const SAVE_KEY = 'emberdeep.v1';
const Meta = {
  data: { embers: 0, unlocks: {}, seeds: [], secrets: {}, stats: { runs: 0, wins: 0, bestFloor: 0, kills: 0 }, muted: false },
  load() {
    try { const s = localStorage.getItem(SAVE_KEY); if (s) Object.assign(this.data, JSON.parse(s)); } catch (e) { }
    this.data.stats = Object.assign({ runs: 0, wins: 0, bestFloor: 0, kills: 0 }, this.data.stats);
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { } },
  has(id) { return !!this.data.unlocks[id]; },
};

// ===== Input: keyboard/mouse, touch twin-sticks, gamepads, read through "slots" =====
const Input = {
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, l: false, r: false, rPressed: false },
  last: 'kb', // 'kb' | 'touch' | 'pad'
  sticks: { L: null, R: null }, // touch sticks {id, ox, oy, x, y}
  tbtn: { roll: false, swap: false, use: false }, // touch button presses this frame
  padPrev: [],
  init(canvas) {
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k); this.last = 'kb';
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      Snd.init();
      if (e.pointerType === 'touch') { this.touchDown(e); return; }
      this.last = 'kb';
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) { this.mouse.r = true; this.mouse.rPressed = true; }
    });
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') { this.touchMove(e); return; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    const up = e => {
      if (e.pointerType === 'touch') { this.touchUp(e); return; }
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  },
  // Touch layout: buttons bottom-right, left half = move stick, right half = aim/attack stick
  touchButtons() {
    const w = innerWidth, h = innerHeight, s = Math.min(w, h);
    const r = s * 0.07;
    return [
      { id: 'roll', x: w - r * 1.6, y: h - r * 4.1, r },
      { id: 'swap', x: w - r * 3.9, y: h - r * 4.7, r: r * 0.8 },
      { id: 'use', x: w - r * 1.4, y: h - r * 6.6, r: r * 0.8 },
      { id: 'pause', x: w - r * 0.9, y: r * 0.9 + 6, r: r * 0.6 },
    ];
  },
  touchDown(e) {
    this.last = 'touch';
    const x = e.clientX, y = e.clientY;
    for (const b of this.touchButtons()) {
      if (d2(x, y, b.x, b.y) < (b.r * 1.15) ** 2) {
        if (b.id === 'pause') Game.togglePause(); else this.tbtn[b.id] = true;
        return;
      }
    }
    const side = x < innerWidth * 0.5 ? 'L' : 'R';
    if (!this.sticks[side]) this.sticks[side] = { id: e.pointerId, ox: x, oy: y, x, y };
  },
  touchMove(e) {
    for (const s of ['L', 'R']) { const st = this.sticks[s]; if (st && st.id === e.pointerId) { st.x = e.clientX; st.y = e.clientY; } }
  },
  touchUp(e) {
    for (const s of ['L', 'R']) { const st = this.sticks[s]; if (st && st.id === e.pointerId) this.sticks[s] = null; }
  },
  stickVec(st, max) {
    if (!st) return { x: 0, y: 0, m: 0 };
    let dx = st.x - st.ox, dy = st.y - st.oy; const l = Math.hypot(dx, dy);
    if (l > max) { st.ox = st.x - dx / l * max; st.oy = st.y - dy / l * max; dx = dx / l * max; dy = dy / l * max; }
    const m = Math.min(1, l / max);
    return { x: l ? dx / l * m : 0, y: l ? dy / l * m : 0, m };
  },
  pads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; },
  // Read one player's controls. src: 'auto' follows the last-used device (solo); 'pad0'.. for co-op later.
  read(src, player) {
    const out = { mx: 0, my: 0, aim: null, attack: false, roll: false, swap: false, use: false, device: 'kb' };
    let dev = src;
    if (src === 'auto') {
      const p = this.pads()[0];
      if (p && (p.buttons.some(b => b.pressed) || p.axes.some(a => Math.abs(a) > 0.4))) this.last = 'pad';
      dev = this.last === 'pad' ? 'pad0' : this.last;
    }
    out.device = dev.startsWith('pad') ? 'pad' : dev;
    if (dev === 'kb') {
      const k = this.keys;
      out.mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      out.my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
      const l = Math.hypot(out.mx, out.my); if (l > 1) { out.mx /= l; out.my /= l; }
      const wp = Render.screenToWorld(this.mouse.x, this.mouse.y);
      out.aim = Math.atan2(wp.y - player.y, wp.x - player.x);
      out.attack = this.mouse.l;
      out.roll = this.pressed.has(' ') || this.pressed.has('shift') || this.mouse.rPressed;
      out.swap = this.pressed.has('q') || this.pressed.has('tab');
      out.use = this.pressed.has('e') || this.pressed.has('f');
    } else if (dev === 'touch') {
      const max = Math.min(innerWidth, innerHeight) * 0.09;
      const L = this.stickVec(this.sticks.L, max), Rv = this.stickVec(this.sticks.R, max);
      out.mx = L.x; out.my = L.y;
      if (Rv.m > 0.25) { out.aim = Math.atan2(Rv.y, Rv.x); out.attack = true; out.assist = true; }
      out.roll = this.tbtn.roll; out.swap = this.tbtn.swap; out.use = this.tbtn.use;
    } else {
      const p = this.pads()[+dev.slice(3)] || null;
      if (p) {
        const dz = v => Math.abs(v) < 0.18 ? 0 : v;
        out.mx = dz(p.axes[0]); out.my = dz(p.axes[1]);
        const ax = dz(p.axes[2]), ay = dz(p.axes[3]);
        if (Math.hypot(ax, ay) > 0.3) out.aim = Math.atan2(ay, ax), out.assist = true;
        const btn = i => p.buttons[i] && p.buttons[i].pressed;
        const prev = this.padPrev[p.index] || [];
        const tap = i => btn(i) && !prev[i];
        out.attack = btn(7) || btn(5) || (out.aim !== null && Math.hypot(ax, ay) > 0.6);
        out.roll = tap(0) || tap(4) || tap(6);
        out.swap = tap(3); out.use = tap(2);
        if (tap(9)) Game.togglePause();
      }
    }
    return out;
  },
  endFrame() {
    this.pressed.clear(); this.mouse.rPressed = false;
    this.tbtn.roll = this.tbtn.swap = this.tbtn.use = false;
    for (const p of this.pads()) this.padPrev[p.index] = p.buttons.map(b => b.pressed);
  },
};

// ===== Audio: everything synthesized, no sound files =====
const Snd = {
  ctx: null, master: null, sfxBus: null, musBus: null, noiseBuf: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = Meta.data.muted ? 0 : 0.8; this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
    this.musBus = c.createGain(); this.musBus.gain.value = 0.32; this.musBus.connect(this.master);
    const n = c.sampleRate; this.noiseBuf = c.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    Music.boot();
  },
  setMuted(m) { Meta.data.muted = m; Meta.save(); if (this.master) this.master.gain.value = m ? 0 : 0.8; },
  tone(f, dur, type = 'square', vol = 0.2, slide = 0, delay = 0, bus) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, freq = 2000, q = 1, delay = 0, sweep = 0, bus) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  last: {},
  play(name) {
    if (!this.ctx) return;
    const now = performance.now(); if (now - (this.last[name] || 0) < 35) return; this.last[name] = now;
    const r = 1 + (Math.random() - 0.5) * 0.12;
    switch (name) {
      case 'swing': this.noise(0.13, 0.22, 1800 * r, 2, 0, 2.6); break;
      case 'arrow': this.noise(0.09, 0.16, 3000 * r, 3, 0, 0.5); this.tone(700 * r, 0.06, 'triangle', 0.06, 0.5); break;
      case 'charge': this.tone(330, 0.12, 'sine', 0.06, 2); break;
      case 'bolt': this.tone(880 * r, 0.08, 'square', 0.05, 0.5); break;
      case 'hit': this.noise(0.07, 0.2, 900 * r, 1.5); this.tone(180 * r, 0.06, 'square', 0.06, 0.6); break;
      case 'deflect': this.tone(1400 * r, 0.09, 'triangle', 0.1, 1.4); break;
      case 'kill': this.noise(0.22, 0.22, 500 * r, 1, 0, 0.3); this.tone(220 * r, 0.18, 'sawtooth', 0.07, 0.3); break;
      case 'hurt': this.tone(300, 0.3, 'sawtooth', 0.18, 0.3); this.noise(0.2, 0.25, 400, 1); break;
      case 'roll': this.noise(0.16, 0.1, 700, 1, 0, 2); break;
      case 'eshot': this.tone(520 * r, 0.07, 'sine', 0.04, 0.7); break;
      case 'ember': this.tone(1100 * r, 0.05, 'sine', 0.05, 1.3); break;
      case 'heart': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.1, 1, i * 0.06)); break;
      case 'item': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, 1, i * 0.07)); break;
      case 'synergy': [523, 784, 1046, 1568].forEach((f, i) => { this.tone(f, 0.4, 'sine', 0.1, 1, i * 0.09); this.tone(f * 1.5, 0.3, 'triangle', 0.04, 1, i * 0.09 + 0.04); }); break;
      case 'door': this.tone(90, 0.3, 'square', 0.12, 0.6); this.noise(0.25, 0.15, 200, 1); break;
      case 'clear': [659, 784, 988].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.08, 1, i * 0.08)); break;
      case 'explode': this.noise(0.45, 0.35, 300, 0.7, 0, 0.25); this.tone(80, 0.4, 'sawtooth', 0.12, 0.4); break;
      case 'zap': this.noise(0.1, 0.18, 4000, 4, 0, 0.4); this.tone(1600 * r, 0.06, 'sawtooth', 0.05, 0.4); break;
      case 'spawn': this.tone(200 * r, 0.3, 'sine', 0.06, 2.2); break;
      case 'boss': this.tone(55, 1.2, 'sawtooth', 0.2, 0.8); this.noise(1, 0.2, 150, 1); break;
      case 'portal': [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.08, 1.01, i * 0.05)); break;
      case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, 0.9, i * 0.18)); break;
      case 'ui': this.tone(660, 0.05, 'triangle', 0.06); break;
    }
  },
};

// Seeded generative music: a minor-key loop that thickens when a fight starts
const Music = {
  on: false, step: 0, next: 0, intensity: 0, target: 0, seed: 1, timer: null,
  boot() { if (this.timer) return; this.timer = setInterval(() => this.tick(), 30); },
  setSeed(s) {
    this.seed = s; const rng = RNG(hash(s, 777));
    const roots = [110, 116.54, 123.47, 130.81, 98, 103.83];
    this.root = rng.pick(roots);
    const scales = [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 3, 5, 6, 7, 10]];
    this.scale = rng.pick(scales);
    this.arp = Array.from({ length: 16 }, () => rng.chance(0.75) ? rng.int(0, this.scale.length * 2 - 1) : -1);
    this.bass = Array.from({ length: 16 }, (_, i) => i % 4 === 0 ? rng.pick([0, 0, 3, 4, -2]) : (rng.chance(0.2) ? rng.pick([0, 2]) : null));
    this.prog = [0, rng.pick([3, 5, 8]), rng.pick([5, 7, 10]), rng.pick([3, 7])];
  },
  note(deg, oct = 0) {
    const n = this.scale.length, o = Math.floor(deg / n) + oct, i = ((deg % n) + n) % n;
    return this.root * Math.pow(2, o + this.scale[i] / 12);
  },
  tick() {
    const c = Snd.ctx; if (!c || !this.on || !this.scale) return;
    this.intensity = lerp(this.intensity, this.target, 0.02);
    const spb = 60 / 104 / 4;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, t = this.next - c.currentTime;
      const shift = Math.pow(2, this.prog[bar] / 12);
      const b = this.bass[s];
      if (b !== null) this.voice(this.note(b, -1) * shift, spb * 3.5, 'triangle', 0.22, t);
      if (s === 0) this.voice(this.note(0, 0) * shift, spb * 15, 'sine', 0.05, t), this.voice(this.note(2, 0) * shift, spb * 15, 'sine', 0.035, t);
      const a = this.arp[s];
      if (a >= 0 && (this.intensity > 0.3 || s % 2 === 0)) this.voice(this.note(a, 1) * shift, spb * 1.6, 'square', 0.025 + 0.02 * this.intensity, t);
      if (this.intensity > 0.4) {
        if (s % 4 === 0) Snd.noise(0.12, 0.18 * this.intensity, 120, 1, t, 0.5, Snd.musBus);
        if (s % 4 === 2) Snd.noise(0.05, 0.08 * this.intensity, 7000, 1, t, 1, Snd.musBus);
        if (s === 4 || s === 12) Snd.noise(0.12, 0.12 * this.intensity, 1500, 0.8, t, 0.6, Snd.musBus);
      }
      this.step++; this.next += spb;
    }
  },
  voice(f, dur, type, vol, delay) { Snd.tone(f, dur, type, vol, 0, delay, Snd.musBus); },
};
