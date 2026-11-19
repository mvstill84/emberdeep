// ===== Render: canvas 2D with additive glow =====
const Render = {
  cv: null, c: null, W: 0, H: 0, dpr: 1, z: 1, cam: { x: 0, y: 0 }, shake: 0, flash: 0, glows: new Map(), dark: null,
  init() {
    this.cv = document.getElementById('c'); this.c = this.cv.getContext('2d');
    const fit = () => {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = this.cv.width = Math.round(innerWidth * this.dpr); this.H = this.cv.height = Math.round(innerHeight * this.dpr);
      this.z = Math.min(this.H / (16.5 * T), this.W / (21 * T));
    };
    addEventListener('resize', fit); fit();
  },
  kick(n) { this.shake = Math.max(this.shake, n); },
  screenToWorld(sx, sy) { return { x: (sx * this.dpr - this.W / 2) / this.z + this.cam.x, y: (sy * this.dpr - this.H / 2) / this.z + this.cam.y }; },
  worldToScreen(x, y) { return { x: ((x - this.cam.x) * this.z + this.W / 2) / this.dpr, y: ((y - this.cam.y) * this.z + this.H / 2) / this.dpr }; },
  camTarget() {
    const p = World.players[0]; let x = p.x, y = p.y;
    if (p.inp && p.inp.device === 'kb') { const m = this.screenToWorld(Input.mouse.x, Input.mouse.y); x += clamp((m.x - p.x) * 0.18, -70, 70); y += clamp((m.y - p.y) * 0.18, -60, 60); }
    else { x += Math.cos(p.aim) * 30; y += Math.sin(p.aim) * 30; }
    const r = World.roomAt(p.x, p.y, 0);
    if (r) {
      const vw = this.W / this.z, vh = this.H / this.z;
      const bx0 = (r.x - 1.5) * T, bx1 = (r.x + r.w + 1.5) * T, by0 = (r.y - 1.5) * T, by1 = (r.y + r.h + 1.5) * T;
      x = bx1 - bx0 < vw ? (bx0 + bx1) / 2 : clamp(x, bx0 + vw / 2, bx1 - vw / 2);
      y = by1 - by0 < vh ? (by0 + by1) / 2 : clamp(y, by0 + vh / 2, by1 - vh / 2);
    }
    return { x, y };
  },
  snapCamera() { const t = this.camTarget(); this.cam.x = t.x; this.cam.y = t.y; },
  glow(color) {
    let g = this.glows.get(color); if (g) return g;
    g = document.createElement('canvas'); g.width = g.height = 64;
    const x = g.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, hexA(color, 0.9)); gr.addColorStop(0.25, hexA(color, 0.45)); gr.addColorStop(1, hexA(color, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); this.glows.set(color, g); return g;
  },
  drawGlow(color, x, y, rad, a = 1) { const c = this.c; c.globalAlpha = a; c.drawImage(this.glow(color), x - rad, y - rad, rad * 2, rad * 2); c.globalAlpha = 1; },

  draw(dt) {
    const c = this.c, W = this.W, H = this.H;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#07050f'; c.fillRect(0, 0, W, H);
    if (!World.map || !World.players.length) return;
    const t = this.camTarget(), k = 1 - Math.exp(-7 * dt);
    this.cam.x = lerp(this.cam.x, t.x, k); this.cam.y = lerp(this.cam.y, t.y, k);
    this.shake = Math.max(0, this.shake - dt * 40);
    const sx = (R() - 0.5) * this.shake * 1.4, sy = (R() - 0.5) * this.shake * 1.4, z = this.z;
    c.setTransform(z, 0, 0, z, W / 2 - this.cam.x * z + sx * this.dpr, H / 2 - this.cam.y * z + sy * this.dpr);
    this.tiles();
    this.pickups();
    c.globalCompositeOperation = 'lighter';
    for (const s of World.parts) if (!s.glow && !s.ring) { c.globalAlpha = clamp(s.life / s.max, 0, 1) * 0.5; c.fillStyle = s.color; c.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    for (const e of World.enemies) this.enemy(e);
    for (const p of World.players) if (!p.dead) this.player(p);
    this.fx();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (Game.mods.dark) this.darkness();
    // vignette
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    if (this.flash > 0) { this.flash -= dt; c.fillStyle = `rgba(255,40,70,${this.flash * 0.6})`; c.fillRect(0, 0, W, H); }
    HUD.draw(c, dt);
  },

  tiles() {
    const c = this.c, map = World.map, z = this.z, tint = FLOOR_TINT[World.floor] || '#39e6ff';
    const tx0 = Math.max(0, Math.floor((this.cam.x - this.W / 2 / z) / T) - 1), tx1 = Math.min(MW - 1, Math.ceil((this.cam.x + this.W / 2 / z) / T) + 1);
    const ty0 = Math.max(0, Math.floor((this.cam.y - this.H / 2 / z) / T) - 1), ty1 = Math.min(MH - 1, Math.ceil((this.cam.y + this.H / 2 / z) / T) + 1);
    const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? VOID : map[y * MW + x];
    const walk = t => t === FLOOR || t === DOOR;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = map[y * MW + x]; if (t === VOID) continue;
      const px = x * T, py = y * T;
      if (t === FLOOR || t === DOOR || t === PILLAR || t === SHUT) {
        const h = hash(x, y, World.floor) & 7;
        c.fillStyle = h === 0 ? '#1d1634' : h === 1 ? '#150f27' : '#18122c';
        c.fillRect(px, py, T, T);
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      }
      if (t === WALL) {
        c.fillStyle = '#231a3c'; c.fillRect(px, py, T, T);
        if (walk(at(x, y + 1))) { c.fillStyle = '#2f2550'; c.fillRect(px, py + T * 0.45, T, T * 0.55); c.fillStyle = '#3a2e62'; c.fillRect(px, py + T * 0.45, T, 3); }
      }
    }
    // pillars, doors, and glowing wall edges on top
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = hexA(tint, 0.55); c.lineWidth = 2;
    c.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = map[y * MW + x]; if (t !== WALL) continue;
      const px = x * T, py = y * T;
      if (walk(at(x, y + 1))) { c.moveTo(px, py + T * 0.45); c.lineTo(px + T, py + T * 0.45); }
      if (walk(at(x, y - 1))) { c.moveTo(px, py); c.lineTo(px + T, py); }
      if (walk(at(x - 1, y))) { c.moveTo(px, py); c.lineTo(px, py + T); }
      if (walk(at(x + 1, y))) { c.moveTo(px + T, py); c.lineTo(px + T, py + T); }
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    // decor runes
    const r = World.room;
    for (const rm of World.rooms) {
      if (rm.x * T > this.cam.x + this.W / z || (rm.x + rm.w) * T < this.cam.x - this.W / z || rm.y * T > this.cam.y + this.H / z || (rm.y + rm.h) * T < this.cam.y - this.H / z) continue;
      c.strokeStyle = hexA(tint, rm === r && World.locked ? 0.16 : 0.08); c.lineWidth = 1.5;
      for (const d of rm.deco) {
        if (map[d.y * MW + d.x] !== FLOOR) continue;
        const cx = d.x * T + T / 2, cy = d.y * T + T / 2;
        c.beginPath();
        if (d.k === 0) c.arc(cx, cy, 7, 0, TAU);
        else if (d.k === 1) { c.moveTo(cx - 6, cy - 6); c.lineTo(cx + 6, cy + 6); c.moveTo(cx + 6, cy - 6); c.lineTo(cx - 6, cy + 6); }
        else if (d.k === 2) { for (let i = 0; i < 3; i++) { const a = d.a + i * TAU / 3; c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); } }
        else { c.moveTo(cx - 8, cy); c.lineTo(cx, cy - 8); c.lineTo(cx + 8, cy); c.lineTo(cx, cy + 8); c.closePath(); }
        c.stroke();
      }
    }
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = map[y * MW + x], px = x * T, py = y * T;
      if (t === PILLAR) {
        c.fillStyle = '#2a2049'; c.fillRect(px + 1, py + 1, T - 2, T - 2);
        c.fillStyle = '#382c63'; c.fillRect(px + 1, py + 1, T - 2, T * 0.5);
        c.strokeStyle = hexA(tint, 0.6); c.lineWidth = 1.5; c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      } else if (t === SHUT) {
        const pulse = 0.6 + Math.sin(World.time * 6) * 0.25;
        c.fillStyle = '#1a0d14'; c.fillRect(px, py, T, T);
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = hexA('#ff4d6d', 0.5 * pulse);
        for (let i = 0; i < 3; i++) c.fillRect(px + 4 + i * 10, py + 2, 3, T - 4);
        this.drawGlow('#ff4d6d', px + T / 2, py + T / 2, 26, 0.35 * pulse);
        c.globalCompositeOperation = 'source-over';
      }
    }
  },

  pickups() {
    const c = this.c, t = World.time;
    for (const k of World.pickups) {
      const bob = Math.sin(t * 3 + k.x) * 3;
      if (k.kind === 'ember') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#ff9a3c', k.x, k.y, 12, 0.8);
        c.fillStyle = '#ffd27a'; c.beginPath(); c.moveTo(k.x, k.y - 4); c.lineTo(k.x + 3, k.y); c.lineTo(k.x, k.y + 4); c.lineTo(k.x - 3, k.y); c.fill();
        c.globalCompositeOperation = 'source-over';
      } else if (k.kind === 'heart' || k.kind === 'half') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#ff5470', k.x, k.y + bob, 20, 0.6); c.globalCompositeOperation = 'source-over';
        heartPath(c, k.x, k.y + bob, k.kind === 'heart' ? 9 : 6); c.fillStyle = '#ff5470'; c.fill();
      } else if (k.kind === 'weapon') {
        const col = RARITY[k.w.rarity].c;
        c.globalCompositeOperation = 'lighter'; this.drawGlow(col, k.x, k.y + bob, 26, 0.7); c.globalCompositeOperation = 'source-over';
        weaponIcon(c, k.w, k.x, k.y + bob, 22, -0.8);
      } else if (k.kind === 'item') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow(k.item.c, k.x, k.y + bob, 28, 0.8); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#120c22'; c.beginPath(); c.arc(k.x, k.y + 14, 11, 0, TAU); c.fill();
        itemIcon(c, k.item, k.x, k.y + bob - 4, 13);
      } else if (k.kind === 'chest') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffd27a', k.x, k.y, 34, 0.5 + Math.sin(t * 4) * 0.15); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#5a3a1a'; c.fillRect(k.x - 13, k.y - 9, 26, 18);
        c.fillStyle = '#7a5226'; c.fillRect(k.x - 13, k.y - 9, 26, 7);
        c.strokeStyle = '#ffd27a'; c.lineWidth = 2; c.strokeRect(k.x - 13, k.y - 9, 26, 18);
        c.fillStyle = '#ffd27a'; c.fillRect(k.x - 2, k.y - 4, 4, 5);
      } else if (k.kind === 'portal') {
        c.globalCompositeOperation = 'lighter';
        const col = k.last ? '#ffd27a' : '#7fd8ff';
        this.drawGlow(col, k.x, k.y, 50, 0.6);
        c.strokeStyle = hexA(col, 0.9); c.lineWidth = 2;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(k.x, k.y, 12 + i * 6, t * (2 + i) + i, t * (2 + i) + i + 4); c.stroke(); }
        c.globalCompositeOperation = 'source-over';
      }
    }
  },

  player(p) {
    const c = this.c, w = p.weapons[p.wi];
    if (p.inv > 0 && p.roll <= 0 && Math.floor(p.inv * 14) % 2) return;
    c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffe2b0', p.x, p.y, 38, 0.35); c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(p.x, p.y + 8, 9, 4, 0, 0, TAU); c.fill();
    // swings (behind and in front)
    for (const s of p.swings) {
      const k = clamp(s.t / s.dur, 0, 1), a0 = s.a - s.arc / 2 * s.dir, a1 = a0 + s.arc * s.dir * k, fade = 1 - clamp((s.t - s.dur) / 0.1, 0, 1);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = hexA(s.color, 0.35 * fade);
      c.beginPath(); c.arc(p.x, p.y, s.reach, a0, a1, s.dir < 0); c.arc(p.x, p.y, s.reach * 0.45, a1, a0, s.dir > 0); c.closePath(); c.fill();
      c.strokeStyle = hexA('#ffffff', 0.8 * fade); c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, s.reach - 2, a0, a1, s.dir < 0); c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    const rolling = p.roll > 0, sq = rolling ? 0.75 : 1;
    // weapon held
    const swingLive = p.swings.find(s => s.t < s.dur);
    let wa = p.aim;
    if (w.type === 'sword') wa = swingLive ? swingLive.a - swingLive.arc / 2 * swingLive.dir + swingLive.arc * swingLive.dir * clamp(swingLive.t / swingLive.dur, 0, 1) : p.aim + 1.1 * p.swingDir;
    if (!rolling) this.heldWeapon(p, w, wa);
    // body: cloaked figure
    c.save(); c.translate(p.x, p.y); c.scale(sq, 1 / sq);
    if (rolling) c.rotate((0.34 - p.roll) / 0.34 * TAU * Math.sign(p.rdx || 1));
    c.fillStyle = '#3a2a6a'; c.beginPath(); c.arc(0, 0, p.r + 1.5, 0, TAU); c.fill();
    c.fillStyle = p.color; c.beginPath(); c.arc(0, 0, p.r - 1, 0, TAU); c.fill();
    c.fillStyle = '#ff9a3c'; c.beginPath(); c.arc(Math.cos(p.aim) * 4, Math.sin(p.aim) * 4 - 1, 2.6, 0, TAU); c.fill(); // ember eye
    c.restore();
  },
  heldWeapon(p, w, a) {
    const c = this.c, col = ELEM[w.elem].c, rc = RARITY[w.rarity].c;
    c.save(); c.translate(p.x, p.y); c.rotate(a);
    if (w.type === 'sword') {
      const L = Math.min(34, w.reach * 0.55);
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(6, 0); c.lineTo(12, 0); c.stroke();
      c.strokeStyle = rc; c.lineWidth = 2.5; c.beginPath(); c.moveTo(10, -4); c.lineTo(10, 4); c.stroke();
      c.strokeStyle = w.elem === 'none' ? '#e8eefc' : col; c.lineWidth = 3; c.beginPath(); c.moveTo(12, 0); c.lineTo(12 + L, 0); c.stroke();
    } else if (w.type === 'bow') {
      const pull = p.charge * 7;
      c.strokeStyle = rc; c.lineWidth = 2.5; c.beginPath(); c.arc(4, 0, 13, -1.2, 1.2); c.stroke();
      c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(4 + 13 * Math.cos(-1.2), 13 * Math.sin(-1.2)); c.lineTo(6 - pull, 0); c.lineTo(4 + 13 * Math.cos(1.2), 13 * Math.sin(1.2)); c.stroke();
      if (p.charge > 0) {
        c.strokeStyle = p.charge >= 1 ? '#ffffff' : col; c.lineWidth = 2; c.beginPath(); c.moveTo(6 - pull, 0); c.lineTo(24 - pull, 0); c.stroke();
        if (p.charge >= 1) { c.globalCompositeOperation = 'lighter'; this.drawGlow(col, 24 - pull, 0, 14, 0.6 + Math.sin(World.time * 20) * 0.3); }
      }
    } else {
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(4, 2); c.lineTo(24, 2); c.stroke();
      c.globalCompositeOperation = 'lighter'; this.drawGlow(col, 26, 2, 14, 0.9);
      c.fillStyle = col; c.beginPath(); c.arc(26, 2, 3.5, 0, TAU); c.fill();
    }
    c.restore(); c.globalCompositeOperation = 'source-over';
  },

  enemy(e) {
    const c = this.c, t = World.time;
    if (e.spawnT > 0) {
      const k = e.spawnT / (e.boss ? 1.4 : 0.8);
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = hexA(e.D.c, 0.8 * (1 - k)); c.lineWidth = 2;
      c.beginPath(); c.arc(e.x, e.y, e.r * (1 + k * 2), 0, TAU); c.stroke();
      this.drawGlow(e.D.c, e.x, e.y, e.r * 2.5, (1 - k) * 0.7);
      c.globalCompositeOperation = 'source-over';
      return;
    }
    const col = e.flash > 0 ? '#ffffff' : e.freeze > 0 ? '#bfefff' : e.D.c;
    c.globalCompositeOperation = 'lighter'; this.drawGlow(e.D.c, e.x, e.y, e.r * 2.6, e.boss ? 0.5 : 0.28); c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(e.x, e.y + e.r * 0.8, e.r, e.r * 0.4, 0, 0, TAU); c.fill();
    const p = World.players[0], toP = Math.atan2(p.y - e.y, p.x - e.x);
    c.save(); c.translate(e.x, e.y);
    switch (e.type) {
      case 'slime': case 'bigslime': {
        const s = e.squash || 0, hop = s * e.r * 0.6;
        c.translate(0, -hop); c.scale(1 + (0.15 - s * 0.2), 1 - (0.15 - s * 0.25));
        c.fillStyle = col; c.beginPath(); c.arc(0, 0, e.r, Math.PI, 0); c.lineTo(e.r, e.r * 0.5); c.quadraticCurveTo(0, e.r * 0.8, -e.r, e.r * 0.5); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(-e.r * 0.35, -e.r * 0.4, e.r * 0.22, 0, TAU); c.fill();
        eyes(c, toP, e.r * 0.35, 0, e.r * 0.18, '#0b1a10'); break;
      }
      case 'archer': {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -e.r * 1.2); c.lineTo(e.r, 0); c.lineTo(0, e.r * 1.1); c.lineTo(-e.r, 0); c.closePath(); c.fill();
        c.fillStyle = '#2a0f0f'; c.beginPath(); c.arc(Math.cos(toP) * 3, Math.sin(toP) * 3 - 3, 2.2, 0, TAU); c.fill();
        c.rotate(toP); c.strokeStyle = '#c9b38a'; c.lineWidth = 2; c.beginPath(); c.arc(4, 0, 11, -1.1, 1.1); c.stroke();
        if (e.st > 0) {
          c.rotate(0); c.strokeStyle = `rgba(255,80,80,${0.25 + (0.6 - e.st) * 1.2})`; c.lineWidth = 1.5; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(14, 0); c.lineTo(400, 0); c.stroke(); c.setLineDash([]);
        }
        break;
      }
      case 'cultist': {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -e.r * 1.4); c.lineTo(e.r * 1.05, e.r); c.lineTo(-e.r * 1.05, e.r); c.closePath(); c.fill();
        c.fillStyle = '#12061f'; c.beginPath(); c.arc(0, -e.r * 0.15, e.r * 0.45, 0, TAU); c.fill();
        c.fillStyle = '#ff4d8d'; c.beginPath(); c.arc(-2.5, -e.r * 0.2, 1.6, 0, TAU); c.arc(2.5, -e.r * 0.2, 1.6, 0, TAU); c.fill();
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { const a = t * 2.5 + i * TAU / 3; this.drawGlow('#ff4d8d', Math.cos(a) * e.r * 1.6, Math.sin(a) * e.r * 1.6, 9, 0.9); }
        c.globalCompositeOperation = 'source-over'; break;
      }
      case 'bat': {
        const flap = Math.sin(t * 22 + e.x) * 0.6;
        c.fillStyle = col;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-e.r * 2.1, -e.r * (0.6 + flap)); c.lineTo(-e.r * 1.2, e.r * 0.3); c.lineTo(-e.r * 0.5, 0);
        c.moveTo(0, 0); c.lineTo(e.r * 2.1, -e.r * (0.6 + flap)); c.lineTo(e.r * 1.2, e.r * 0.3); c.lineTo(e.r * 0.5, 0); c.fill();
        c.beginPath(); c.arc(0, 0, e.r * 0.75, 0, TAU); c.fill();
        c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(-2.5, -1, 1.5, 0, TAU); c.arc(2.5, -1, 1.5, 0, TAU); c.fill(); break;
      }
      case 'knight': {
        const wind = e.state === 1 ? Math.sin(t * 40) * 2 : 0;
        c.translate(wind, 0);
        c.fillStyle = e.state === 3 ? '#5a6a9a' : col; roundRect(c, -e.r, -e.r, e.r * 2, e.r * 2, 5); c.fill();
        c.fillStyle = '#10142a'; c.fillRect(-e.r * 0.6, -e.r * 0.35, e.r * 1.2, e.r * 0.25);
        c.fillStyle = e.state === 1 ? '#ff4d6d' : '#7fd8ff'; c.fillRect(-e.r * 0.4, -e.r * 0.33, e.r * 0.8, e.r * 0.15);
        if (e.shield) { c.rotate(e.face); c.strokeStyle = '#d6e0ff'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, e.r + 6, -0.9, 0.9); c.stroke(); }
        break;
      }
      case 'boss': {
        c.rotate(e.spin || 0);
        c.fillStyle = col; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r); } c.closePath(); c.fill();
        c.fillStyle = '#12061f'; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.5; c.lineTo(Math.cos(a) * e.r * 0.62, Math.sin(a) * e.r * 0.62); } c.closePath(); c.fill();
        c.rotate(-(e.spin || 0) * 2.5);
        c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA(e.D.c, 0.7); c.lineWidth = 2;
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.arc(Math.cos(a) * e.r * 1.45, Math.sin(a) * e.r * 1.45, 4, 0, TAU); c.stroke(); }
        c.globalCompositeOperation = 'source-over';
        c.rotate((e.spin || 0) * 1.5);
        c.fillStyle = e.raged ? '#ff3a5a' : '#ffd27a'; c.beginPath(); c.arc(Math.cos(toP) * 6, Math.sin(toP) * 6, 6, 0, TAU); c.fill();
        break;
      }
    }
    c.restore();
    if (e.freeze > 0) { c.strokeStyle = 'rgba(190,240,255,0.9)'; c.lineWidth = 2; c.strokeRect(e.x - e.r - 3, e.y - e.r - 3, e.r * 2 + 6, e.r * 2 + 6); }
    if (e.chill > 0 && !e.freeze) { c.globalCompositeOperation = 'lighter'; this.drawGlow('#7fd8ff', e.x, e.y, e.r * 1.6, 0.35); c.globalCompositeOperation = 'source-over'; }
    if (!e.boss && e.hp < e.maxHp) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(e.x - 12, e.y - e.r - 10, 24, 3); c.fillStyle = '#ff4d6d'; c.fillRect(e.x - 12, e.y - e.r - 10, 24 * clamp(e.hp / e.maxHp, 0, 1), 3); }
  },

  fx() {
    const c = this.c;
    c.globalCompositeOperation = 'lighter';
    for (const pr of World.projs) {
      const enemy = pr.owner === 'e';
      if (pr.kind === 'arrow' || pr.kind === 'arrowE') {
        const a = Math.atan2(pr.vy, pr.vx), L = pr.kind === 'arrow' ? (pr.full ? 20 : 14) : 12;
        this.drawGlow(pr.color, pr.x, pr.y, pr.full ? 22 : 14, 0.8);
        c.strokeStyle = enemy ? '#ffd27a' : pr.full ? '#ffffff' : pr.color; c.lineWidth = pr.full ? 3 : 2;
        c.beginPath(); c.moveTo(pr.x - Math.cos(a) * L, pr.y - Math.sin(a) * L); c.lineTo(pr.x, pr.y); c.stroke();
      } else if (pr.kind === 'wave') {
        const a = Math.atan2(pr.vy, pr.vx);
        c.strokeStyle = hexA(pr.color, 0.85); c.lineWidth = 4; c.beginPath(); c.arc(pr.x - Math.cos(a) * 10, pr.y - Math.sin(a) * 10, pr.r + 4, a - 1, a + 1); c.stroke();
        this.drawGlow(pr.color, pr.x, pr.y, 26, 0.5);
      } else {
        this.drawGlow(pr.color, pr.x, pr.y, pr.r * (enemy ? 3.6 : 3.2), enemy ? 0.95 : 0.85);
        c.fillStyle = enemy ? '#ffe0ea' : '#ffffff'; c.beginPath(); c.arc(pr.x, pr.y, pr.r * (enemy ? 0.75 : 0.6), 0, TAU); c.fill();
      }
    }
    for (const s of World.parts) {
      const k = clamp(s.life / s.max, 0, 1);
      if (s.ring) { c.strokeStyle = hexA(s.color, k * 0.8); c.lineWidth = 3; c.beginPath(); c.arc(s.x, s.y, s.size * (1.1 - k * 0.6), 0, TAU); c.stroke(); continue; }
      if (!s.glow) continue;
      c.globalAlpha = k; c.fillStyle = s.color;
      const sz = s.size * (0.5 + k * 0.5); c.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
      if (s.size > 2.5) this.drawGlow(s.color, s.x, s.y, s.size * 3, k * 0.4);
    }
    c.globalAlpha = 1;
    for (const b of World.bolts) {
      const rng = RNG(b.seed + Math.floor(World.time * 30));
      c.strokeStyle = `rgba(250,250,160,${b.life / 0.14})`; c.lineWidth = 2.5; c.beginPath(); c.moveTo(b.x1, b.y1);
      for (let i = 1; i < 6; i++) { const t = i / 6; c.lineTo(lerp(b.x1, b.x2, t) + rng.range(-9, 9), lerp(b.y1, b.y2, t) + rng.range(-9, 9)); }
      c.lineTo(b.x2, b.y2); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.font = 'bold 13px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center';
    for (const tx of World.texts) { c.globalAlpha = clamp(tx.life, 0, 1); c.fillStyle = tx.c; c.fillText(tx.s, tx.x, tx.y); }
    c.globalAlpha = 1;
  },
  darkness() {
    const c = this.c, W = this.W, H = this.H;
    if (!this.dark || this.dark.width !== W || this.dark.height !== H) { this.dark = document.createElement('canvas'); this.dark.width = W; this.dark.height = H; }
    const d = this.dark.getContext('2d');
    d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H); d.fillStyle = 'rgba(2,1,6,0.93)'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => { const s = this.worldToScreen(x, y), sx = s.x * this.dpr, sy = s.y * this.dpr, rr = r * this.z; const g = d.createRadialGradient(sx, sy, 0, sx, sy, rr); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = g; d.fillRect(sx - rr, sy - rr, rr * 2, rr * 2); };
    for (const p of World.players) if (!p.dead) hole(p.x, p.y, 190);
    for (const pr of World.projs) hole(pr.x, pr.y, pr.owner === 'e' ? 40 : 55);
    for (const k of World.pickups) if (k.kind !== 'ember') hole(k.x, k.y, 60);
    c.drawImage(this.dark, 0, 0);
  },
};

function heartPath(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); c.closePath();
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function eyes(c, a, ox, oy, s, col) { c.fillStyle = col; const dx = Math.cos(a) * s * 0.8, dy = Math.sin(a) * s * 0.8; c.beginPath(); c.arc(-ox + dx, oy + dy, s, 0, TAU); c.arc(ox + dx, oy + dy, s, 0, TAU); c.fill(); }
function weaponIcon(c, w, x, y, s, a = -0.8) {
  const rc = RARITY[w.rarity].c, col = ELEM[w.elem].c;
  c.save(); c.translate(x, y); c.rotate(a); c.lineCap = 'round';
  if (w.type === 'sword') {
    c.strokeStyle = '#8a6a3a'; c.lineWidth = s * 0.14; c.beginPath(); c.moveTo(-s * 0.5, 0); c.lineTo(-s * 0.25, 0); c.stroke();
    c.strokeStyle = rc; c.beginPath(); c.moveTo(-s * 0.25, -s * 0.2); c.lineTo(-s * 0.25, s * 0.2); c.stroke();
    c.strokeStyle = w.elem === 'none' ? '#e8eefc' : col; c.lineWidth = s * 0.13; c.beginPath(); c.moveTo(-s * 0.2, 0); c.lineTo(s * 0.55, 0); c.stroke();
  } else if (w.type === 'bow') {
    c.rotate(-0.7);
    c.strokeStyle = rc; c.lineWidth = s * 0.12; c.beginPath(); c.arc(-s * 0.15, 0, s * 0.5, -1.2, 1.2); c.stroke();
    c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(-s * 0.15 + s * 0.5 * Math.cos(-1.2), s * 0.5 * Math.sin(-1.2)); c.lineTo(-s * 0.15 + s * 0.5 * Math.cos(1.2), s * 0.5 * Math.sin(1.2)); c.stroke();
    c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(-s * 0.2, 0); c.lineTo(s * 0.5, 0); c.stroke();
  } else {
    c.strokeStyle = '#7a5a3a'; c.lineWidth = s * 0.12; c.beginPath(); c.moveTo(-s * 0.55, 0); c.lineTo(s * 0.35, 0); c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(s * 0.45, 0, s * 0.17, 0, TAU); c.fill();
    c.strokeStyle = rc; c.lineWidth = 1.5; c.beginPath(); c.arc(s * 0.45, 0, s * 0.25, 0, TAU); c.stroke();
  }
  c.restore();
}
function itemIcon(c, it, x, y, s) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#1a1230'; c.strokeStyle = it.c; c.lineWidth = 2;
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; c.lineTo(Math.cos(a) * s, Math.sin(a) * s); } c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = it.c; c.fillStyle = it.c; c.lineWidth = Math.max(1.5, s * 0.12); c.lineCap = 'round'; c.lineJoin = 'round';
  const q = s * 0.5; c.beginPath();
  switch (it.g) {
    case 'heart': heartPath(c, 0, 0, q * 0.9); c.fill(); break;
    case 'bolt': c.moveTo(q * 0.2, -q); c.lineTo(-q * 0.4, q * 0.1); c.lineTo(q * 0.3, q * 0.1); c.lineTo(-q * 0.2, q); c.stroke(); break;
    case 'flame': c.moveTo(0, -q); c.quadraticCurveTo(q, 0, 0, q); c.quadraticCurveTo(-q, 0, 0, -q); c.fill(); break;
    case 'flake': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.moveTo(Math.cos(a) * q, Math.sin(a) * q); c.lineTo(-Math.cos(a) * q, -Math.sin(a) * q); } c.stroke(); break;
    case 'ring': c.arc(0, 0, q * 0.7, 0, TAU); c.stroke(); break;
    case 'moon': c.arc(0, 0, q * 0.8, 0.6, TAU - 0.6); c.stroke(); break;
    case 'eye': c.ellipse(0, 0, q, q * 0.55, 0, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, q * 0.25, 0, TAU); c.fill(); break;
    case 'burst': for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.moveTo(Math.cos(a) * q * 0.3, Math.sin(a) * q * 0.3); c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.stroke(); break;
    case 'split': c.moveTo(0, q); c.lineTo(0, 0); c.lineTo(-q * 0.7, -q * 0.8); c.moveTo(0, 0); c.lineTo(q * 0.7, -q * 0.8); c.stroke(); break;
    case 'shield': c.moveTo(-q * 0.7, -q * 0.7); c.lineTo(q * 0.7, -q * 0.7); c.lineTo(q * 0.6, q * 0.1); c.lineTo(0, q); c.lineTo(-q * 0.6, q * 0.1); c.closePath(); c.stroke(); break;
    case 'boot': c.moveTo(-q * 0.4, -q); c.lineTo(-q * 0.4, q * 0.6); c.lineTo(q * 0.8, q * 0.6); c.lineTo(q * 0.8, q * 0.2); c.lineTo(q * 0.1, q * 0.1); c.lineTo(q * 0.1, -q); c.stroke(); break;
    case 'fang': c.moveTo(-q * 0.6, -q * 0.6); c.lineTo(0, q); c.lineTo(q * 0.6, -q * 0.6); c.closePath(); c.fill(); break;
    case 'sword': c.moveTo(-q * 0.8, q * 0.8); c.lineTo(q * 0.8, -q * 0.8); c.moveTo(-q * 0.6, q * 0.1); c.lineTo(-q * 0.1, q * 0.6); c.stroke(); break;
    case 'feather': c.moveTo(-q * 0.8, q * 0.8); c.quadraticCurveTo(-q * 0.4, -q, q * 0.8, -q * 0.8); c.quadraticCurveTo(q * 0.4, q * 0.3, -q * 0.8, q * 0.8); c.stroke(); break;
    default: c.arc(0, 0, q * 0.5, 0, TAU); c.fill();
  }
  c.restore();
}
