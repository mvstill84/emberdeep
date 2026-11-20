// ===== Render: canvas 2D with additive glow =====
const Render = {
  cv: null, c: null, W: 0, H: 0, dpr: 1, z: 1, cam: { x: 0, y: 0 }, shake: 0, flash: 0, glows: new Map(), dark: null,
  init() {
    this.cv = document.getElementById('c'); this.c = this.cv.getContext('2d');
    const fit = () => {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = this.cv.width = Math.round(innerWidth * this.dpr); this.H = this.cv.height = Math.round(innerHeight * this.dpr);
      const small = Math.min(innerWidth, innerHeight) < 520;
      this.z = Math.min(this.H / ((small ? 12.5 : 16.5) * T), this.W / ((small ? 17 : 21) * T));
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
    const tx = p.x / T, ty = p.y / T;
    const r = World.rooms.find(r => tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h);
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
    this.background();
    this.shake = Math.max(0, this.shake - dt * 40);
    const sx = (R() - 0.5) * this.shake * 1.4, sy = (R() - 0.5) * this.shake * 1.4, z = this.z;
    c.setTransform(z, 0, 0, z, W / 2 - this.cam.x * z + sx * this.dpr, H / 2 - this.cam.y * z + sy * this.dpr);
    this.tiles();
    this.hazards();
    this.warns();
    this.pickups();
    c.globalCompositeOperation = 'lighter';
    for (const s of World.parts) if (!s.glow && !s.ring) { c.globalAlpha = clamp(s.life / s.max, 0, 1) * 0.5; c.fillStyle = s.color; c.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    for (const e of World.enemies) this.enemy(e);
    this.allies();
    for (const p of World.players) if (!p.dead) this.player(p);
    this.fx();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (Game.mods.dark || World.bossDark) this.darkness();
    const bb = World.boss;
    if (World.bossDark && bb && !bb.dead && !bb.air && bb.spawnT <= 0) { // only his eyes show in the dark
      const sp = this.worldToScreen(bb.x, bb.y), ex = sp.x * this.dpr, ey = sp.y * this.dpr, z = this.z, gl = (bb.eyesFlash || 0) > 0 ? 1 : 0.75;
      bb.eyesFlash = (bb.eyesFlash || 0) - dt;
      c.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) { this.drawGlow('#ff3030', ex + s * 6 * z, ey - 4 * z, 10 * z, gl); c.fillStyle = '#ffe066'; c.beginPath(); c.arc(ex + s * 6 * z, ey - 4 * z, 2.2 * z, 0, TAU); c.fill(); }
      c.globalCompositeOperation = 'source-over';
    }
    if (World.timeStopT > 0) { c.fillStyle = `rgba(120,160,255,${Math.min(0.18, World.timeStopT * 0.1)})`; c.fillRect(0, 0, W, H); }
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    if (this.flash > 0) { this.flash -= dt; c.fillStyle = `rgba(255,40,70,${this.flash * 0.6})`; c.fillRect(0, 0, W, H); }
    HUD.draw(c, dt);
  },

  tiles() {
    const c = this.c, map = World.map, z = this.z, th = World.theme, tint = th.tint;
    const tx0 = Math.max(0, Math.floor((this.cam.x - this.W / 2 / z) / T) - 1), tx1 = Math.min(MW - 1, Math.ceil((this.cam.x + this.W / 2 / z) / T) + 1);
    const ty0 = Math.max(0, Math.floor((this.cam.y - this.H / 2 / z) / T) - 1), ty1 = Math.min(MH - 1, Math.ceil((this.cam.y + this.H / 2 / z) / T) + 1);
    const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? VOID : map[y * MW + x];
    const walk = t => t === FLOOR || t === DOOR || t === PILLAR || t === SHUT;
    const crypt = th.style === 'crypt';
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = map[y * MW + x]; if (t === VOID) continue;
      const px = x * T, py = y * T;
      if (t !== WALL) {
        const h = hash(x, y, World.depth) & 7;
        c.fillStyle = h === 0 ? th.floor[2] : h === 1 ? th.floor[1] : th.floor[0];
        c.fillRect(px, py, T, T);
        if (crypt) { c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1); }
        else if (h < 2) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.arc(px + (hash(x, y, 3) & 31), py + (hash(x, y, 4) & 31), 3 + (h * 2), 0, TAU); c.fill(); }
      } else {
        c.fillStyle = th.wall; c.fillRect(px, py, T, T);
        if (walk(at(x, y + 1))) { c.fillStyle = th.face; c.fillRect(px, py + T * 0.45, T, T * 0.55); }
      }
    }
    // soften cave and forest wall edges with rounded rock lumps
    if (!crypt) {
      c.fillStyle = th.wall;
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        if (map[y * MW + x] !== WALL) continue;
        const h = hash(x, y, 9);
        if (walk(at(x, y - 1))) { c.beginPath(); c.arc(x * T + T / 2 + (h & 7) - 4, y * T + 2, T * 0.42, Math.PI, 0); c.fill(); }
        if (walk(at(x - 1, y))) { c.beginPath(); c.arc(x * T + 2, y * T + T / 2, T * 0.38, Math.PI / 2, -Math.PI / 2); c.fill(); }
        if (walk(at(x + 1, y))) { c.beginPath(); c.arc(x * T + T - 2, y * T + T / 2, T * 0.38, -Math.PI / 2, Math.PI / 2); c.fill(); }
      }
    }
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = hexA(tint, crypt ? 0.5 : 0.32); c.lineWidth = 2;
    c.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (map[y * MW + x] !== WALL) continue;
      const px = x * T, py = y * T;
      if (walk(at(x, y + 1))) { c.moveTo(px, py + T * 0.45); c.lineTo(px + T, py + T * 0.45); }
      if (crypt) {
        if (walk(at(x, y - 1))) { c.moveTo(px, py); c.lineTo(px + T, py); }
        if (walk(at(x - 1, y))) { c.moveTo(px, py); c.lineTo(px, py + T); }
        if (walk(at(x + 1, y))) { c.moveTo(px + T, py); c.lineTo(px + T, py + T); }
      }
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    // decor
    const r = World.room, tm = World.time;
    for (const rm of World.rooms) {
      if (rm.x * T > this.cam.x + this.W / z || (rm.x + rm.w) * T < this.cam.x - this.W / z || rm.y * T > this.cam.y + this.H / z || (rm.y + rm.h) * T < this.cam.y - this.H / z) continue;
      for (const d of rm.deco) {
        if (map[d.y * MW + d.x] !== FLOOR) continue;
        const cx = d.x * T + T / 2 + Math.cos(d.a) * 6, cy = d.y * T + T / 2 + Math.sin(d.a) * 6;
        if (th.deco === 'crystal') {
          if (d.k > 1) continue;
          c.fillStyle = hexA(tint, 0.55); c.beginPath(); c.moveTo(cx, cy - 7 * d.s); c.lineTo(cx + 3 * d.s, cy); c.lineTo(cx, cy + 3 * d.s); c.lineTo(cx - 3 * d.s, cy); c.fill();
          c.globalCompositeOperation = 'lighter'; this.drawGlow(tint, cx, cy - 2, 14 * d.s, 0.25 + Math.sin(tm * 2 + d.a * 5) * 0.08); c.globalCompositeOperation = 'source-over';
        } else if (th.deco === 'candle') {
          if (d.k === 0) {
            c.fillStyle = '#d8d0b8'; c.fillRect(cx - 1.5, cy - 4, 3, 7);
            c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffb057', cx, cy - 6, 16, 0.5 + Math.sin(tm * 9 + d.a * 7) * 0.12);
            c.fillStyle = '#ffd27a'; c.fillRect(cx - 1, cy - 8, 2, 3); c.globalCompositeOperation = 'source-over';
          } else if (d.k === 1) { c.strokeStyle = 'rgba(216,208,184,0.25)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 6, cy); c.lineTo(cx + 6, cy + 2); c.moveTo(cx - 2, cy - 4); c.lineTo(cx + 1, cy + 5); c.stroke(); }
          else { c.strokeStyle = hexA(tint, 0.1); c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, 7, 0, TAU); c.stroke(); }
        } else {
          if (d.k === 0) { c.fillStyle = ['#ff9ad5', '#ffe066', '#b0f0ff'][hash(d.x, d.y) % 3]; c.beginPath(); c.arc(cx, cy, 2.2, 0, TAU); c.fill(); c.globalCompositeOperation = 'lighter'; this.drawGlow(c.fillStyle, cx, cy, 8, 0.4); c.globalCompositeOperation = 'source-over'; }
          else { c.strokeStyle = 'rgba(120,200,110,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 3, cy + 3); c.lineTo(cx - 1, cy - 4); c.moveTo(cx, cy + 3); c.lineTo(cx + 1, cy - 5); c.moveTo(cx + 3, cy + 3); c.lineTo(cx + 4, cy - 3); c.stroke(); }
        }
      }
    }
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = map[y * MW + x], px = x * T, py = y * T, cx = px + T / 2, cy = py + T / 2;
      if (t === PILLAR && World.thorns.has(y * MW + x)) {
        c.fillStyle = '#1f3a20'; c.beginPath(); c.arc(cx - 6, cy + 2, 9, 0, TAU); c.arc(cx + 6, cy - 2, 9, 0, TAU); c.arc(cx, cy - 8, 8, 0, TAU); c.fill();
        c.strokeStyle = '#6a9a3a'; c.lineWidth = 2; c.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * 1.05 + x; c.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); c.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); }
        c.stroke();
      } else if (t === PILLAR) {
        if (th.pillar === 'stalagmite') {
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cx, cy + 10, 13, 5, 0, 0, TAU); c.fill();
          c.fillStyle = th.face; c.beginPath(); c.moveTo(cx - 13, cy + 10); c.lineTo(cx - 3, cy - 16); c.lineTo(cx + 2, cy - 9); c.lineTo(cx + 6, cy - 18); c.lineTo(cx + 13, cy + 10); c.closePath(); c.fill();
          c.strokeStyle = hexA(tint, 0.45); c.lineWidth = 1.5; c.stroke();
        } else if (th.pillar === 'tomb') {
          c.fillStyle = '#2b2f44'; roundRect(c, px + 3, py + 1, T - 6, T - 2, 3); c.fill();
          c.fillStyle = '#3a4060'; roundRect(c, px + 5, py + 3, T - 10, T * 0.45, 2); c.fill();
          c.strokeStyle = hexA(tint, 0.55); c.lineWidth = 1.5; roundRect(c, px + 3, py + 1, T - 6, T - 2, 3); c.stroke();
          c.beginPath(); c.moveTo(cx, py + 8); c.lineTo(cx, py + 20); c.moveTo(cx - 5, py + 12); c.lineTo(cx + 5, py + 12); c.stroke();
        } else if (th.pillar === 'stump') {
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cx, cy + 9, 15, 6, 0, 0, TAU); c.fill();
          c.fillStyle = '#4a3220'; c.fillRect(cx - 12, cy - 4, 24, 13);
          c.fillStyle = '#7a5a36'; c.beginPath(); c.ellipse(cx, cy - 4, 12, 6, 0, 0, TAU); c.fill();
          c.strokeStyle = '#5a4026'; c.lineWidth = 1; c.beginPath(); c.ellipse(cx, cy - 4, 7, 3.5, 0, 0, TAU); c.ellipse(cx, cy - 4, 3, 1.5, 0, 0, TAU); c.stroke();
          c.strokeStyle = hexA(tint, 0.35); c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cy - 4, 12, 6, 0, Math.PI, TAU); c.stroke();
        }
        const hp = World.thp.get(y * MW + x);
        if (hp !== undefined && hp < 3) { // cracks show damage
          c.strokeStyle = 'rgba(10,6,16,0.85)'; c.lineWidth = 2; c.beginPath();
          c.moveTo(cx - 8, cy - 10); c.lineTo(cx - 1, cy - 2); c.lineTo(cx - 6, cy + 6);
          if (hp < 2) { c.moveTo(cx + 8, cy - 8); c.lineTo(cx + 2, cy); c.lineTo(cx + 7, cy + 8); }
          c.stroke();
        }
      } else if (t === SHUT) {
        const pulse = 0.6 + Math.sin(World.time * 6) * 0.25;
        c.fillStyle = '#1a0d14'; c.fillRect(px, py, T, T);
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = hexA('#ff4d6d', 0.5 * pulse);
        for (let i = 0; i < 3; i++) c.fillRect(px + 4 + i * 10, py + 2, 3, T - 4);
        this.drawGlow('#ff4d6d', cx, cy, 26, 0.35 * pulse);
        c.globalCompositeOperation = 'source-over';
      }
    }
  },
  hazards() {
    const c = this.c;
    for (const h of World.hazards) {
      if (h.fire) { c.globalCompositeOperation = 'lighter'; this.drawGlow('#ff7a2a', h.x, h.y, h.r * 1.6, clamp(h.life, 0, 1) * 0.6); this.drawGlow('#ffd27a', h.x, h.y, h.r * 0.7, clamp(h.life, 0, 1) * 0.5); c.globalCompositeOperation = 'source-over'; continue; }
      if (h.arm > 0) {
        const k = 1 - h.arm / 0.9, x = lerp(h.fx, h.x, k), y = lerp(h.fy, h.y, k) - Math.sin(k * Math.PI) * 40;
        c.fillStyle = '#c8c8c8'; c.fillRect(x - 3, y - 3, 6, 6);
        c.strokeStyle = `rgba(255,80,80,${0.3 + k * 0.5})`; c.lineWidth = 1.5; c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.stroke();
      } else {
        c.strokeStyle = '#b8b8c8'; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; c.moveTo(h.x - Math.cos(a) * 9, h.y - Math.sin(a) * 9); c.lineTo(h.x + Math.cos(a) * 9, h.y + Math.sin(a) * 9); }
        c.stroke();
        c.strokeStyle = 'rgba(255,80,80,0.35)'; c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.stroke();
      }
    }
    c.globalCompositeOperation = 'lighter';
    for (const z of World.zones) { c.strokeStyle = hexA('#7fd8ff', 0.5 * (1 - z.t / z.dur)); c.lineWidth = 2; c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.stroke(); this.drawGlow('#7fd8ff', z.x, z.y, z.r, 0.2); }
    c.globalCompositeOperation = 'source-over';
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
        c.globalCompositeOperation = 'lighter'; this.drawGlow(col, k.x, k.y + bob, 26 + k.w.rarity * 4, 0.6 + k.w.rarity * 0.08); c.globalCompositeOperation = 'source-over';
        weaponIcon(c, k.w, k.x, k.y + bob, 22, -0.8);
      } else if (k.kind === 'item') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow(k.item.c, k.x, k.y + bob, 28, 0.8); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#120c22'; c.beginPath(); c.arc(k.x, k.y + 14, 11, 0, TAU); c.fill();
        itemIcon(c, k.item, k.x, k.y + bob - 4, 13);
      } else if (k.kind === 'potion') {
        const P = potionById(k.id);
        c.globalCompositeOperation = 'lighter'; this.drawGlow(P.c, k.x, k.y + bob, 22, 0.7); c.globalCompositeOperation = 'source-over';
        potionIcon(c, P, k.x, k.y + bob, 12);
      } else if (k.kind === 'relic') {
        const Rl = relicById(k.id);
        c.globalCompositeOperation = 'lighter'; this.drawGlow(Rl.c, k.x, k.y + bob, 32, 0.85); c.globalCompositeOperation = 'source-over';
        relicIcon(c, Rl, k.x, k.y + bob, 14);
      } else if (k.kind === 'corpse') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#9fd8ff', k.x, k.y, 40, 0.5 + Math.sin(t * 2) * 0.15); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#c8c0b0'; c.beginPath(); c.arc(k.x - 4, k.y - 2, 6, 0, TAU); c.fill();
        c.strokeStyle = '#c8c0b0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(k.x + 2, k.y + 2); c.lineTo(k.x + 14, k.y + 6); c.moveTo(k.x - 2, k.y + 6); c.lineTo(k.x + 8, k.y + 12); c.stroke();
        c.fillStyle = '#1a1420'; c.beginPath(); c.arc(k.x - 6, k.y - 3, 1.5, 0, TAU); c.arc(k.x - 2, k.y - 3, 1.5, 0, TAU); c.fill();
      } else if (k.kind === 'merchant') {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(k.x, k.y + 12, 13, 5, 0, 0, TAU); c.fill();
        c.fillStyle = '#5a3a6a'; c.beginPath(); c.moveTo(k.x, k.y - 18); c.lineTo(k.x + 13, k.y + 12); c.lineTo(k.x - 13, k.y + 12); c.closePath(); c.fill();
        c.fillStyle = '#12061f'; c.beginPath(); c.arc(k.x, k.y - 5, 6, 0, TAU); c.fill();
        c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(k.x - 2, k.y - 6, 1.3, 0, TAU); c.arc(k.x + 2, k.y - 6, 1.3, 0, TAU); c.fill();
        c.fillStyle = '#8a6a3a'; c.fillRect(k.x + 12, k.y - 6, 9, 9);
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffb057', k.x - 15, k.y - 2, 18, 0.7 + Math.sin(t * 5) * 0.15); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#ffd27a'; c.fillRect(k.x - 17, k.y - 4, 4, 5);
      } else if (k.kind === 'key') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffd27a', k.x, k.y + bob, 22, 0.8); c.globalCompositeOperation = 'source-over';
        c.strokeStyle = '#ffd27a'; c.lineWidth = 3; c.beginPath(); c.arc(k.x - 5, k.y + bob, 4.5, 0, TAU); c.moveTo(k.x - 0.5, k.y + bob); c.lineTo(k.x + 10, k.y + bob); c.moveTo(k.x + 6, k.y + bob); c.lineTo(k.x + 6, k.y + bob + 5); c.moveTo(k.x + 10, k.y + bob); c.lineTo(k.x + 10, k.y + bob + 4); c.stroke();
      } else if (k.kind === 'lockchest') {
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#b6a0ff', k.x, k.y, 36, 0.45 + Math.sin(t * 3) * 0.12); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#3a2a4a'; c.fillRect(k.x - 15, k.y - 10, 30, 20);
        c.fillStyle = '#4e3a66'; c.fillRect(k.x - 15, k.y - 10, 30, 8);
        c.strokeStyle = '#d9c4ff'; c.lineWidth = 2; c.strokeRect(k.x - 15, k.y - 10, 30, 20);
        c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(k.x, k.y - 1, 3.5, 0, TAU); c.fill(); c.fillRect(k.x - 1.5, k.y - 1, 3, 6);
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
    for (const s of p.swings) {
      const k = clamp(s.t / s.dur, 0, 1), fade = 1 - clamp((s.t - s.dur) / 0.12, 0, 1);
      c.globalCompositeOperation = 'lighter';
      if (s.kind === 'spear') {
        const L = s.reach * (k < 0.5 ? k * 2 : 1);
        c.strokeStyle = hexA(s.color, 0.6 * fade); c.lineWidth = 10; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(s.a) * L, p.y + Math.sin(s.a) * L); c.stroke();
        c.strokeStyle = hexA('#ffffff', 0.9 * fade); c.lineWidth = 2.5; c.stroke();
      } else {
        const a0 = s.a - s.arc / 2 * s.dir, a1 = a0 + s.arc * s.dir * k, inner = s.kind === 'axe' ? 0.3 : s.kind === 'hammer' ? 0.55 : 0.45;
        c.fillStyle = hexA(s.color, (s.kind === 'axe' ? 0.45 : 0.35) * fade);
        c.beginPath(); c.arc(p.x, p.y, s.reach, a0, a1, s.dir < 0); c.arc(p.x, p.y, s.reach * inner, a1, a0, s.dir > 0); c.closePath(); c.fill();
        c.strokeStyle = hexA('#ffffff', 0.8 * fade); c.lineWidth = s.kind === 'sword' ? 3 : 5; c.beginPath(); c.arc(p.x, p.y, s.reach - 2, a0, a1, s.dir < 0); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }
    const rolling = p.roll > 0, sq = rolling ? 0.75 : 1;
    const swingLive = p.swings.find(s => s.t < s.dur);
    let wa = p.aim;
    if (w.cat === 'melee' && w.type !== 'spear') wa = swingLive ? swingLive.a - swingLive.arc / 2 * swingLive.dir + swingLive.arc * swingLive.dir * clamp(swingLive.t / swingLive.dur, 0, 1) : p.aim + 1.1 * p.swingDir;
    if (!rolling) this.heldWeapon(p, w, wa, swingLive);
    c.save(); c.translate(p.x, p.y); c.scale(sq, 1 / sq);
    if (rolling) c.rotate((0.34 - p.roll) / 0.34 * TAU * Math.sign(p.rdx || 1));
    c.fillStyle = p.slowT > 0 ? '#3a6a6a' : '#3a2a6a'; c.beginPath(); c.arc(0, 0, p.r + 1.5, 0, TAU); c.fill();
    c.fillStyle = p.color; c.beginPath(); c.arc(0, 0, p.r - 1, 0, TAU); c.fill();
    c.fillStyle = '#ff9a3c'; c.beginPath(); c.arc(Math.cos(p.aim) * 4, Math.sin(p.aim) * 4 - 1, 2.6, 0, TAU); c.fill();
    c.restore();
  },
  heldWeapon(p, w, a, swingLive) {
    const c = this.c, col = ELEM[w.elem].c;
    if (w.type === 'bow') {
      const pull = p.charge * 7, rc = RARITY[w.rarity].c;
      c.save(); c.translate(p.x, p.y); c.rotate(a);
      c.strokeStyle = rc; c.lineWidth = 2.5; c.beginPath(); c.arc(4, 0, 13, -1.2, 1.2); c.stroke();
      c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(4 + 13 * Math.cos(-1.2), 13 * Math.sin(-1.2)); c.lineTo(6 - pull, 0); c.lineTo(4 + 13 * Math.cos(1.2), 13 * Math.sin(1.2)); c.stroke();
      if (p.charge > 0) {
        c.strokeStyle = p.charge >= 1 ? '#ffffff' : col; c.lineWidth = 2; c.beginPath(); c.moveTo(6 - pull, 0); c.lineTo(24 - pull, 0); c.stroke();
        if (p.charge >= 1) { c.globalCompositeOperation = 'lighter'; this.drawGlow(col, 24 - pull, 0, 14, 0.6 + Math.sin(World.time * 20) * 0.3); }
      }
      c.restore(); c.globalCompositeOperation = 'source-over'; return;
    }
    let off = 16, size = 26;
    if (w.type === 'spear') { off = swingLive ? 16 + Math.sin(clamp(swingLive.t / swingLive.dur, 0, 1) * Math.PI) * 26 : 14; size = 44; }
    if (w.cat === 'magic') { off = 14; size = w.type === 'spellbook' ? 16 : 24; }
    if (w.type === 'hammer' || w.type === 'axe') size = 30;
    weaponIcon(c, w, p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, size, a);
    if (w.cat === 'magic') { c.globalCompositeOperation = 'lighter'; this.drawGlow(col, p.x + Math.cos(a) * (off + size * 0.45), p.y + Math.sin(a) * (off + size * 0.45), 14, 0.7); c.globalCompositeOperation = 'source-over'; }
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
    if (e.air) return;
    if (e.bones > 0) { // bone pile, shaking as it reforms
      const jig = e.bones < 1 ? Math.sin(t * 40) * 2 : 0;
      c.strokeStyle = '#d8d0b8'; c.lineWidth = 2.5; c.beginPath();
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + e.t, r = 4 + i * 2; c.moveTo(e.x + jig + Math.cos(a) * r - 4, e.y + Math.sin(a) * r * 0.5); c.lineTo(e.x + jig + Math.cos(a) * r + 4, e.y + Math.sin(a) * r * 0.5 + 2); }
      c.stroke(); c.fillStyle = '#e8e2cf'; c.beginPath(); c.arc(e.x + jig, e.y - 3, 4.5, 0, TAU); c.fill();
      return;
    }
    const col = e.flash > 0 ? '#ffffff' : e.freeze > 0 ? '#bfefff' : e.burn > 0 && Math.sin(World.time * 14 + e.x) > -0.2 ? '#ffa860' : e.D.c;
    c.globalCompositeOperation = 'lighter'; this.drawGlow(e.D.c, e.x, e.y, e.r * 2.6, e.boss ? 0.5 : 0.28); c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(e.x, e.y + e.r * 0.8, e.r, e.r * 0.4, 0, 0, TAU); c.fill();
    const p = World.players[0], toP = Math.atan2(p.y - e.y, p.x - e.x), r = e.r;
    if (e.boss) { // rotating rune ring marks a boss
      c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA(e.D.c, 0.55); c.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + (e.spin || 0) * 0.6; c.beginPath(); c.arc(e.x + Math.cos(a) * r * 1.5, e.y + Math.sin(a) * r * 1.5, 4, 0, TAU); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }
    c.save(); c.translate(e.x, e.y);
    switch (e.boss ? e.look : e.type) {
      case 'goblin': case 'goblinArcher': {
        c.fillStyle = col;
        c.beginPath(); c.moveTo(-r * 0.6, -r * 0.3); c.lineTo(-r * 1.6, -r * 0.9); c.lineTo(-r * 0.7, r * 0.2); c.moveTo(r * 0.6, -r * 0.3); c.lineTo(r * 1.6, -r * 0.9); c.lineTo(r * 0.7, r * 0.2); c.fill();
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        eyes(c, toP, r * 0.35, -r * 0.1, r * 0.17, '#ff3030');
        c.rotate(toP);
        if (e.type === 'goblinArcher') { c.strokeStyle = '#a07040'; c.lineWidth = 2; c.beginPath(); c.arc(4, 0, 10, -1.1, 1.1); c.stroke(); if (e.st > 0) aimLine(c, e.st); }
        else { c.strokeStyle = '#c8c8d0'; c.lineWidth = 2; c.beginPath(); c.moveTo(r, 4); c.lineTo(r + 9, 4); c.stroke(); }
        break;
      }
      case 'kobold': {
        c.rotate(toP);
        c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(-r * 0.8, 0); c.quadraticCurveTo(-r * 1.8, r * 0.6, -r * 2.2, -r * 0.2); c.stroke();
        c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, r * 1.1, r * 0.8, 0, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(r * 0.6, -r * 0.5); c.lineTo(r * 1.5, 0); c.lineTo(r * 0.6, r * 0.5); c.fill();
        c.fillStyle = '#ffe066'; c.beginPath(); c.arc(r * 0.5, -r * 0.3, 1.8, 0, TAU); c.arc(r * 0.5, r * 0.3, 1.8, 0, TAU); c.fill();
        break;
      }
      case 'cube': {
        const wob = Math.sin(t * 3 + e.x) * 1.5;
        c.globalAlpha = 0.45; c.fillStyle = col; roundRect(c, -r - wob, -r + wob, (r + wob) * 2, (r - wob) * 2, 4); c.fill();
        c.globalAlpha = 1; c.strokeStyle = hexA('#bfffef', 0.8); c.lineWidth = 2; roundRect(c, -r - wob, -r + wob, (r + wob) * 2, (r - wob) * 2, 4); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(-r * 0.7, -r * 0.7, r * 0.5, r * 0.25);
        if (e.holding) { c.globalAlpha = 0.85; weaponIcon(c, e.holding, 0, 0, r * 1.3, -0.6); c.globalAlpha = 1; }
        else { c.save(); c.rotate(0.6); c.strokeStyle = 'rgba(220,200,160,0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, 3); c.lineTo(5, 3); c.moveTo(-3, 0); c.lineTo(-3, 6); c.stroke(); c.restore(); }
        break;
      }
      case 'crystal': {
        const pulse = 0.7 + Math.sin(t * 5 + e.x) * 0.3;
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#7dff7a', 0, 0, r * 2.4, 0.6 * pulse); c.globalCompositeOperation = 'source-over';
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -r * 1.4); c.lineTo(r * 0.8, 0); c.lineTo(0, r * 1.2); c.lineTo(-r * 0.8, 0); c.closePath(); c.fill();
        c.strokeStyle = '#e8ffe0'; c.lineWidth = 1.5; c.stroke();
        break;
      }
      case 'banner': {
        c.strokeStyle = '#6a4a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, r); c.lineTo(0, -r * 2.2); c.stroke();
        const wave = Math.sin(t * 6) * 3;
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -r * 2.2); c.lineTo(r * 1.8, -r * 1.8 + wave); c.lineTo(r * 1.4, -r * 1.2); c.lineTo(r * 1.8, -r * 0.6 + wave); c.lineTo(0, -r * 0.8); c.closePath(); c.fill();
        c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(r * 0.8, -r * 1.5, 3, 0, TAU); c.fill();
        break;
      }
      case 'mimic': {
        const s = e.squash || 0, open = e.st > 0 ? 0.9 : 0.25 + s * 0.4 + Math.sin(t * 8) * 0.05;
        c.translate(0, -s * 6);
        c.fillStyle = e.flash > 0 ? '#ffffff' : '#7a5226'; c.fillRect(-r, -r * 0.2, r * 2, r * 0.9);
        c.save(); c.translate(0, -r * 0.2); c.rotate(-open * (Math.cos(toP) >= 0 ? 1 : -1) * 0.5);
        c.fillStyle = e.flash > 0 ? '#ffffff' : '#9a6a32'; c.fillRect(-r, -r * 0.6, r * 2, r * 0.6);
        c.fillStyle = '#f0e8d8'; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-r + 3 + i * r * 0.33, 0); c.lineTo(-r + 3 + i * r * 0.33 + r * 0.16, r * 0.25); c.lineTo(-r + 3 + i * r * 0.33 + r * 0.32, 0); c.fill(); }
        c.restore();
        c.fillStyle = '#c03050'; c.beginPath(); c.ellipse(0, r * 0.05, r * 0.5, r * 0.12 + open * 4, 0, 0, TAU); c.fill();
        c.strokeStyle = '#ffd27a'; c.lineWidth = 2; c.strokeRect(-r, -r * 0.2, r * 2, r * 0.9);
        c.fillStyle = '#ffe066'; c.beginPath(); c.arc(-r * 0.4, -r * 0.55, 2.2, 0, TAU); c.arc(r * 0.4, -r * 0.55, 2.2, 0, TAU); c.fill();
        break;
      }
      case 'stirge': {
        const flap = Math.sin(t * 24 + e.x) * 0.6;
        c.rotate(toP + Math.PI / 2);
        c.fillStyle = col;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 2.1, -r * (0.2 + flap)); c.lineTo(-r * 1.1, r * 0.6); c.moveTo(0, 0); c.lineTo(r * 2.1, -r * (0.2 + flap)); c.lineTo(r * 1.1, r * 0.6); c.fill();
        c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU); c.fill();
        c.strokeStyle = '#ffb0c0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -r * 0.6); c.lineTo(0, -r * 1.8); c.stroke();
        break;
      }
      case 'skeleton': case 'skelArcher': {
        c.fillStyle = col; c.beginPath(); c.arc(0, -2, r, 0, TAU); c.fill();
        c.fillStyle = '#1a1420'; c.beginPath(); c.arc(-r * 0.38, -r * 0.25, r * 0.24, 0, TAU); c.arc(r * 0.38, -r * 0.25, r * 0.24, 0, TAU); c.fill();
        c.fillRect(-r * 0.4, r * 0.35, r * 0.8, 2);
        c.rotate(toP);
        if (e.type === 'skelArcher') { c.strokeStyle = '#a89878'; c.lineWidth = 2; c.beginPath(); c.arc(4, 0, 11, -1.1, 1.1); c.stroke(); if (e.st > 0) aimLine(c, e.st); }
        else { c.strokeStyle = '#8890a0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(r, 5); c.lineTo(r + 12, 5); c.stroke(); }
        break;
      }
      case 'zombie': {
        c.rotate(toP);
        c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -r * 0.6); c.lineTo(r * 1.4, -r * 0.6); c.moveTo(0, r * 0.6); c.lineTo(r * 1.4, r * 0.6); c.stroke();
        c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.fillStyle = '#4a5a30'; c.beginPath(); c.arc(-r * 0.3, r * 0.2, r * 0.35, 0, TAU); c.fill();
        c.fillStyle = '#ffe066'; c.beginPath(); c.arc(r * 0.5, -r * 0.3, 2, 0, TAU); c.arc(r * 0.5, r * 0.3, 2, 0, TAU); c.fill();
        break;
      }
      case 'necro': {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -r * 1.4); c.lineTo(r * 1.05, r); c.lineTo(-r * 1.05, r); c.closePath(); c.fill();
        c.fillStyle = '#12061f'; c.beginPath(); c.arc(0, -r * 0.15, r * 0.45, 0, TAU); c.fill();
        c.fillStyle = '#7dff7a'; c.beginPath(); c.arc(-2.5, -r * 0.2, 1.6, 0, TAU); c.arc(2.5, -r * 0.2, 1.6, 0, TAU); c.fill();
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { const a = t * 2.5 + i * TAU / 3; this.drawGlow('#7dff7a', Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6, 9, 0.8); }
        c.globalCompositeOperation = 'source-over'; break;
      }
      case 'wraith': {
        c.globalAlpha = 0.55 + Math.sin(t * 8 + e.x) * 0.2;
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -r * 1.3);
        for (let i = 0; i <= 6; i++) { const x = -r + i * r / 3, y = r + (i % 2 ? -4 : 3) + Math.sin(t * 6 + i) * 2; c.lineTo(x, y); }
        c.closePath(); c.fill(); c.globalAlpha = 1;
        c.fillStyle = '#e8fbff'; c.beginPath(); c.arc(-3, -r * 0.4, 2, 0, TAU); c.arc(3, -r * 0.4, 2, 0, TAU); c.fill();
        break;
      }
      case 'gnoll': {
        c.rotate(toP);
        c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(r * 0.5, -r * 0.45); c.lineTo(r * 1.7, 0); c.lineTo(r * 0.5, r * 0.45); c.fill();
        c.fillStyle = '#7a5530'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-r * 0.3 + i * 3, (i - 1) * 4, 1.8, 0, TAU); c.fill(); }
        c.fillStyle = '#ff3030'; c.beginPath(); c.arc(r * 0.5, -r * 0.3, 1.6, 0, TAU); c.arc(r * 0.5, r * 0.3, 1.6, 0, TAU); c.fill();
        if (e.st > 0) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 1.5, -4); c.lineTo(-r * 2.6, -4); c.moveTo(-r * 1.5, 4); c.lineTo(-r * 2.6, 4); c.stroke(); }
        break;
      }
      case 'blight': {
        c.strokeStyle = col; c.lineWidth = 2.5; c.lineCap = 'round';
        const step = Math.sin(t * 14 + e.x) * 3;
        c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r * 0.4); c.lineTo(-5, r + step); c.moveTo(0, r * 0.4); c.lineTo(5, r - step);
        c.moveTo(0, -r * 0.2); c.lineTo(-r, -r * 0.8 + step); c.moveTo(0, -r * 0.2); c.lineTo(r, -r * 0.6 - step); c.stroke();
        c.fillStyle = '#ff6040'; c.beginPath(); c.arc(0, -r, 2.2, 0, TAU); c.fill(); c.lineCap = 'butt';
        break;
      }
      case 'cub': case 'owlbear': {
        const wind = e.state === 1 ? Math.sin(t * 40) * 2 : 0;
        c.translate(wind, 0);
        c.fillStyle = e.state === 3 ? '#7a6050' : col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(-r * 0.7, -r * 0.6); c.lineTo(-r * 0.5, -r * 1.3); c.lineTo(-r * 0.2, -r * 0.8); c.moveTo(r * 0.7, -r * 0.6); c.lineTo(r * 0.5, -r * 1.3); c.lineTo(r * 0.2, -r * 0.8); c.fill();
        c.fillStyle = '#efe0c0'; c.beginPath(); c.arc(-r * 0.35, -r * 0.2, r * 0.3, 0, TAU); c.arc(r * 0.35, -r * 0.2, r * 0.3, 0, TAU); c.fill();
        c.fillStyle = e.state === 1 ? '#ff3030' : '#201010'; c.beginPath(); c.arc(-r * 0.35, -r * 0.2, r * 0.12, 0, TAU); c.arc(r * 0.35, -r * 0.2, r * 0.12, 0, TAU); c.fill();
        c.fillStyle = '#ffc040'; c.beginPath(); c.moveTo(-r * 0.15, r * 0.05); c.lineTo(r * 0.15, r * 0.05); c.lineTo(0, r * 0.45); c.fill();
        break;
      }
      case 'sprite': {
        const fl = Math.sin(t * 30) * 0.4;
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = hexA('#c8ffe0', 0.5); c.beginPath(); c.ellipse(-r * 0.9, -r * 0.4, r * 0.9, r * (0.45 + fl * 0.2), -0.5, 0, TAU); c.ellipse(r * 0.9, -r * 0.4, r * 0.9, r * (0.45 + fl * 0.2), 0.5, 0, TAU); c.fill();
        this.drawGlow(e.D.c, 0, 0, r * 2.2, 0.8);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = col; c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.6, 0); c.lineTo(0, r); c.lineTo(-r * 0.6, 0); c.closePath(); c.fill();
        break;
      }
      case 'spider': {
        c.rotate(toP);
        c.strokeStyle = col; c.lineWidth = 2;
        const leg = Math.sin(t * 16 + e.x) * 3;
        c.beginPath();
        for (let i = 0; i < 4; i++) { const ox = -r * 0.4 + i * r * 0.35, l = i % 2 ? leg : -leg; c.moveTo(ox, 0); c.lineTo(ox + l, -r * 1.5); c.moveTo(ox, 0); c.lineTo(ox - l, r * 1.5); }
        c.stroke();
        c.fillStyle = '#3a2a50'; c.beginPath(); c.arc(-r * 0.5, 0, r * 0.8, 0, TAU); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(r * 0.35, 0, r * 0.55, 0, TAU); c.fill();
        c.fillStyle = '#ff3030'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(r * 0.6, (i - 1.5) * 2.2, 1.1, 0, TAU); c.fill(); }
        if (e.st > 0) aimLine(c, e.st);
        break;
      }
      case 'treant': {
        const sway = Math.sin(t * 1.5) * 0.08;
        c.rotate(sway);
        c.fillStyle = '#4a3220'; c.beginPath(); c.moveTo(-r * 0.35, r); c.lineTo(-r * 0.25, -r * 0.2); c.lineTo(r * 0.25, -r * 0.2); c.lineTo(r * 0.35, r); c.closePath(); c.fill();
        c.strokeStyle = '#4a3220'; c.lineWidth = 5; c.beginPath(); c.moveTo(-r * 0.2, r * 0.1); c.lineTo(-r * 1.1, -r * 0.3); c.moveTo(r * 0.2, r * 0.1); c.lineTo(r * 1.1, -r * 0.4); c.stroke();
        c.fillStyle = e.flash > 0 ? '#ffffff' : '#2f6a36'; c.beginPath(); c.arc(-r * 0.5, -r * 0.6, r * 0.55, 0, TAU); c.arc(r * 0.5, -r * 0.65, r * 0.55, 0, TAU); c.arc(0, -r * 1.0, r * 0.6, 0, TAU); c.fill();
        c.fillStyle = e.raged ? '#ff3a5a' : '#c8ff7a'; c.beginPath(); c.arc(-r * 0.15, -r * 0.05, 3, 0, TAU); c.arc(r * 0.15, -r * 0.05, 3, 0, TAU); c.fill();
        break;
      }
      case 'boss': {
        const n = e.shape || 6;
        c.rotate(e.spin || 0);
        c.fillStyle = col; c.beginPath(); for (let i = 0; i < n; i++) { const a = i * TAU / n; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
        c.fillStyle = '#12061f'; c.beginPath(); for (let i = 0; i < n; i++) { const a = i * TAU / n + Math.PI / n; c.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); } c.closePath(); c.fill();
        c.rotate(-(e.spin || 0) * 2.5);
        c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA(e.D.c, 0.7); c.lineWidth = 2;
        const orbs = e.mini ? 4 : 8;
        for (let i = 0; i < orbs; i++) { const a = i * TAU / orbs; c.beginPath(); c.arc(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45, 4, 0, TAU); c.stroke(); }
        c.globalCompositeOperation = 'source-over';
        c.rotate((e.spin || 0) * 1.5);
        c.fillStyle = e.raged ? '#ff3a5a' : '#ffd27a'; c.beginPath(); c.arc(Math.cos(toP) * 6, Math.sin(toP) * 6, 6, 0, TAU); c.fill();
        break;
      }
    }
    c.restore();
    if (World.rally && !e.boss && e.type !== 'banner') { c.strokeStyle = 'rgba(255,77,58,0.55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(e.x, e.y, e.r + 5 + Math.sin(t * 8) * 1.5, 0, TAU); c.stroke(); }
    if (e.boss && e.invuln) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA('#b6ff7a', 0.5 + Math.sin(t * 6) * 0.25); c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y, e.r + 10, 0, TAU); c.stroke(); c.globalCompositeOperation = 'source-over'; }
    if (e.boss && e.vuln > 0) {
      if (e.B.heart) { c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffd27a', e.x, e.y - e.r * 0.3, e.r * 1.2, 0.7 + Math.sin(t * 12) * 0.2); c.fillStyle = '#ff9a3c'; c.beginPath(); c.arc(e.x, e.y - e.r * 0.3, 6, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }
      else { c.fillStyle = '#ffe066'; for (let i = 0; i < 4; i++) { const a = t * 6 + i * TAU / 4; c.beginPath(); c.arc(e.x + Math.cos(a) * e.r, e.y - e.r - 6 + Math.sin(a) * 4, 2.5, 0, TAU); c.fill(); } }
    }
    if (e.B && e.B.shield && !(e.vuln > 0)) { c.save(); c.translate(e.x, e.y); c.rotate(e.face); c.strokeStyle = '#d6e0ff'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, e.r + 8, -1.0, 1.0); c.stroke(); c.restore(); }
    if (e.burn > 0) { // obvious fire: flickering tongues and a hot glow
      c.globalCompositeOperation = 'lighter';
      this.drawGlow('#ff7a2a', e.x, e.y - e.r * 0.3, e.r * 2.2, 0.55 + Math.sin(t * 20 + e.x) * 0.15);
      for (let i = 0; i < 3; i++) {
        const fx = e.x + (i - 1) * e.r * 0.6, h = e.r * (0.9 + 0.4 * Math.sin(t * 18 + i * 2 + e.x)), fy = e.y - e.r * 0.4;
        c.fillStyle = i === 1 ? '#ffd27a' : '#ff7a2a';
        c.beginPath(); c.moveTo(fx - 4, fy); c.quadraticCurveTo(fx - 3, fy - h * 0.6, fx, fy - h); c.quadraticCurveTo(fx + 3, fy - h * 0.6, fx + 4, fy); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    if (e.stun > 0) { c.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = t * 6 + i * TAU / 3; c.beginPath(); c.arc(e.x + Math.cos(a) * e.r, e.y - e.r - 4 + Math.sin(a) * 3, 2, 0, TAU); c.fill(); } }
    if (e.freeze > 0) { c.strokeStyle = 'rgba(190,240,255,0.9)'; c.lineWidth = 2; c.strokeRect(e.x - e.r - 3, e.y - e.r - 3, e.r * 2 + 6, e.r * 2 + 6); }
    if (e.chill > 0 && !e.freeze) { c.globalCompositeOperation = 'lighter'; this.drawGlow('#7fd8ff', e.x, e.y, e.r * 1.6, 0.35); c.globalCompositeOperation = 'source-over'; }
    if (!e.boss && e.hp < e.maxHp) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(e.x - 12, e.y - e.r - 10, 24, 3); c.fillStyle = '#ff4d6d'; c.fillRect(e.x - 12, e.y - e.r - 10, 24 * clamp(e.hp / e.maxHp, 0, 1), 3); }
  },

  fx() {
    const c = this.c;
    c.globalCompositeOperation = 'lighter';
    for (const pr of World.projs) {
      const enemy = pr.owner === 'e', a = Math.atan2(pr.vy, pr.vx);
      if (pr.kind === 'arrow' || pr.kind === 'arrowE') {
        const L = pr.kind === 'arrow' ? (pr.full ? 20 : 14) : 12;
        this.drawGlow(pr.color, pr.x, pr.y, pr.full ? 22 : 14, 0.8);
        c.strokeStyle = enemy ? '#ffd27a' : pr.full ? '#ffffff' : pr.color; c.lineWidth = pr.full ? 3 : 2;
        c.beginPath(); c.moveTo(pr.x - Math.cos(a) * L, pr.y - Math.sin(a) * L); c.lineTo(pr.x, pr.y); c.stroke();
      } else if (pr.kind === 'wave') {
        c.strokeStyle = hexA(pr.color, 0.85); c.lineWidth = 4; c.beginPath(); c.arc(pr.x - Math.cos(a) * 10, pr.y - Math.sin(a) * 10, pr.r + 4, a - 1, a + 1); c.stroke();
        this.drawGlow(pr.color, pr.x, pr.y, 26, 0.5);
      } else if (pr.kind === 'fireball') {
        this.drawGlow('#ff7a2a', pr.x, pr.y, 30, 1); this.drawGlow('#ffd27a', pr.x, pr.y, 12, 1);
        if (R.chance(0.7)) World.part(pr.x, pr.y, R.range(-30, 30), R.range(-30, 30), 0.35, 3, '#ff7a2a', true);
      } else if (pr.kind === 'zap') {
        c.strokeStyle = '#fafaa0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(pr.x, pr.y);
        for (let i = 1; i <= 3; i++) c.lineTo(pr.x - Math.cos(a) * i * 10 + R.range(-5, 5), pr.y - Math.sin(a) * i * 10 + R.range(-5, 5));
        c.stroke(); this.drawGlow('#f2f25a', pr.x, pr.y, 18, 0.9);
      } else if (pr.kind === 'bomb') {
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#2a2a34'; c.beginPath(); c.arc(pr.x, pr.y, 7, 0, TAU); c.fill();
        c.strokeStyle = '#8a6a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(pr.x + 4, pr.y - 5); c.lineTo(pr.x + 8, pr.y - 10); c.stroke();
        c.globalCompositeOperation = 'lighter'; this.drawGlow('#ffd27a', pr.x + 8, pr.y - 10, 8, 0.6 + Math.sin(World.time * 40) * 0.4);
      } else if (pr.kind === 'skull') {
        this.drawGlow('#b6ff7a', pr.x, pr.y, 22, 0.9);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#e8f8d8'; c.beginPath(); c.arc(pr.x, pr.y - 1, 6, 0, TAU); c.fill(); c.fillRect(pr.x - 3.5, pr.y + 2, 7, 4);
        c.fillStyle = '#204010'; c.beginPath(); c.arc(pr.x - 2.2, pr.y - 1, 1.6, 0, TAU); c.arc(pr.x + 2.2, pr.y - 1, 1.6, 0, TAU); c.fill();
        c.globalCompositeOperation = 'lighter';
      } else if (pr.kind === 'seed' || pr.kind === 'feather') {
        this.drawGlow(pr.color, pr.x, pr.y, 16, 0.8);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = pr.kind === 'seed' ? '#c8ff7a' : '#f0e0c0'; c.save(); c.translate(pr.x, pr.y); c.rotate(a);
        c.beginPath(); c.ellipse(0, 0, pr.kind === 'seed' ? 5 : 8, 3, 0, 0, TAU); c.fill(); c.restore();
        c.globalCompositeOperation = 'lighter';
      } else if (pr.kind === 'web') {
        c.globalCompositeOperation = 'source-over';
        c.strokeStyle = 'rgba(232,224,255,0.85)'; c.lineWidth = 1.2; c.beginPath();
        for (let i = 0; i < 4; i++) { const b = i * Math.PI / 4 + pr.x * 0.01; c.moveTo(pr.x - Math.cos(b) * pr.r, pr.y - Math.sin(b) * pr.r); c.lineTo(pr.x + Math.cos(b) * pr.r, pr.y + Math.sin(b) * pr.r); }
        c.stroke(); c.beginPath(); c.arc(pr.x, pr.y, pr.r * 0.6, 0, TAU); c.stroke();
        c.globalCompositeOperation = 'lighter';
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
      c.strokeStyle = b.col ? hexA(b.col, b.life / 0.12) : `rgba(250,250,160,${b.life / 0.14})`; c.lineWidth = 2.5; c.beginPath(); c.moveTo(b.x1, b.y1);
      for (let i = 1; i < 6; i++) { const t = i / 6; c.lineTo(lerp(b.x1, b.x2, t) + rng.range(-9, 9), lerp(b.y1, b.y2, t) + rng.range(-9, 9)); }
      c.lineTo(b.x2, b.y2); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.font = 'bold 13px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center';
    for (const tx of World.texts) { c.globalAlpha = clamp(tx.life, 0, 1); c.fillStyle = tx.c; c.fillText(tx.s, tx.x, tx.y); }
    c.globalAlpha = 1;
  },
  allies() {
    const c = this.c, d = World.decoy, g = World.gnome, t = World.time;
    if (d) {
      c.globalAlpha = 0.6 + Math.sin(t * 10) * 0.2;
      c.globalCompositeOperation = 'lighter'; this.drawGlow('#c8a0ff', d.x, d.y, 34, 0.6); c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#c8a0ff'; c.beginPath(); c.arc(d.x, d.y, 9, 0, TAU); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.beginPath(); c.arc(d.x, d.y, 14 + Math.sin(t * 6) * 2, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    if (g) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(g.x, g.y + 9, 10, 4, 0, 0, TAU); c.fill();
      c.fillStyle = '#7a5226'; c.fillRect(g.x - 9, g.y + 2, 18, 8); // the box
      c.fillStyle = '#e8d0b0'; c.beginPath(); c.arc(g.x, g.y - 2, 6, 0, TAU); c.fill();
      c.fillStyle = '#f4f4f4'; c.beginPath(); c.moveTo(g.x - 6, g.y); c.quadraticCurveTo(g.x, g.y + 9, g.x + 6, g.y); c.fill();
      c.fillStyle = '#e03a3a'; c.beginPath(); c.moveTo(g.x - 7, g.y - 5); c.lineTo(g.x, g.y - 20); c.lineTo(g.x + 7, g.y - 5); c.closePath(); c.fill();
      c.save(); c.translate(g.x, g.y); c.rotate(g.aim); c.fillStyle = '#5a5a6a'; c.fillRect(4, -2.5, 15, 5); c.restore();
    }
  },
  warns() {
    const c = this.c;
    for (const t of World.ptraps) { // ranger caltrops
      c.strokeStyle = hexA('#8dff7a', clamp(t.life, 0, 1) * 0.9); c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 3; i++) { const a = t.a + i * Math.PI / 3; c.moveTo(t.x - Math.cos(a) * 6, t.y - Math.sin(a) * 6); c.lineTo(t.x + Math.cos(a) * 6, t.y + Math.sin(a) * 6); }
      c.stroke();
    }
    for (const w of World.warns) {
      const k = clamp(w.t / w.dur, 0, 1);
      if (!w.fired) {
        const col = w.kind === 'root' ? '#8dff7a' : w.kind === 'rain' ? '#ffd27a' : '#ff4d6d';
        c.fillStyle = hexA(col, 0.12 + 0.25 * k); c.beginPath(); c.arc(w.x, w.y, w.r * k, 0, TAU); c.fill();
        c.strokeStyle = hexA(col, 0.5 + 0.4 * Math.sin(World.time * 20)); c.lineWidth = 2; c.beginPath(); c.arc(w.x, w.y, w.r, 0, TAU); c.stroke();
        if (w.kind === 'slam') { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(w.x, w.y, 30 * (0.4 + k * 0.6), 12 * (0.4 + k * 0.6), 0, 0, TAU); c.fill(); }
      } else {
        const f = 1 - clamp((w.t - w.dur) / 0.35, 0, 1);
        if (w.kind === 'root') { c.strokeStyle = hexA('#6a4a2a', f); c.lineWidth = 4; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + w.x; c.moveTo(w.x, w.y); c.lineTo(w.x + Math.cos(a) * w.r * 0.9, w.y + Math.sin(a) * w.r * 0.9 - 10); } c.stroke(); }
        else { c.strokeStyle = hexA('#ffe2b0', f * 0.8); c.lineWidth = 4; c.beginPath(); c.arc(w.x, w.y, w.r * (1.2 - f * 0.2), 0, TAU); c.stroke(); }
      }
    }
  },
  // themed parallax: two procedurally painted layers per world, scrolling slower than the level
  bgCache: {},
  bgLayer(w, layer) {
    const key = w + ':' + layer; if (this.bgCache[key]) return this.bgCache[key];
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), rng = RNG(hash(w, layer, 31)), th = WORLDS[w];
    if (layer === 0) { x.fillStyle = { cave: '#0b0910', crypt: '#090a12', forest: '#060d09' }[th.style]; x.fillRect(0, 0, S, S); }
    const blob = (cx, cy, r, col) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.fillStyle = col; x.beginPath(); x.arc(cx + ox, cy + oy, r, 0, TAU); x.fill(); } };
    if (th.style === 'cave') {
      if (layer === 0) { for (let i = 0; i < 40; i++) blob(rng() * S, rng() * S, rng.range(20, 70), rng.chance(0.5) ? '#110e17' : '#0e0b14'); for (let i = 0; i < 26; i++) { x.globalAlpha = rng.range(0.15, 0.4); blob(rng() * S, rng() * S, rng.range(1, 2.5), th.tint); } x.globalAlpha = 1; }
      else { for (let i = 0; i < 9; i++) { const sx = rng() * S, h = rng.range(40, 140), wd = rng.range(10, 26); x.fillStyle = 'rgba(24,18,32,0.9)'; x.beginPath(); x.moveTo(sx - wd, 0); x.lineTo(sx, h); x.lineTo(sx + wd, 0); x.fill(); x.beginPath(); x.moveTo(sx - wd, S); x.lineTo(sx, S - h * 0.7); x.lineTo(sx + wd, S); x.fill(); } }
    } else if (th.style === 'crypt') {
      if (layer === 0) { x.strokeStyle = '#11131e'; x.lineWidth = 3; for (let i = 0; i < 4; i++) { const ax = i * S / 4 + 64; x.beginPath(); x.moveTo(ax - 48, S); x.lineTo(ax - 48, 200); x.arc(ax, 200, 48, Math.PI, 0); x.lineTo(ax + 48, S); x.stroke(); } for (let i = 0; i < 18; i++) { x.globalAlpha = rng.range(0.2, 0.5); blob(rng() * S, rng() * S, rng.range(1, 2), '#ffb057'); } x.globalAlpha = 1; }
      else { for (let i = 0; i < 3; i++) { const cx = i * S / 3 + rng.range(0, 80); x.fillStyle = 'rgba(20,22,34,0.95)'; x.fillRect(cx, 0, 30, S); x.fillStyle = 'rgba(28,31,48,0.95)'; x.fillRect(cx - 6, rng.range(0, S), 42, 14); } for (let i = 0; i < 10; i++) { x.globalAlpha = 0.05; blob(rng() * S, rng() * S, rng.range(40, 90), '#b58bff'); } x.globalAlpha = 1; }
    } else {
      if (layer === 0) { for (let i = 0; i < 14; i++) { const tx = rng() * S; x.fillStyle = '#0a140e'; x.fillRect(tx - 5, 0, 10, S); } for (let i = 0; i < 30; i++) blob(rng() * S, rng() * S, rng.range(30, 70), rng.chance(0.5) ? '#0b1710' : '#0d1a12'); }
      else { for (let i = 0; i < 6; i++) { const tx = rng() * S; x.fillStyle = 'rgba(8,18,11,0.95)'; x.fillRect(tx - 9, 0, 18, S); blob(tx, rng() * S, rng.range(40, 80), 'rgba(10,24,14,0.9)'); } for (let i = 0; i < 24; i++) { x.globalAlpha = rng.range(0.3, 0.7); blob(rng() * S, rng() * S, 1.6, '#d8ff7a'); } x.globalAlpha = 1; }
    }
    this.bgCache[key] = this.c.createPattern(cv, 'repeat');
    return this.bgCache[key];
  },
  background() {
    const c = this.c, W = this.W, H = this.H, w = World.world;
    [[0, 0.25], [1, 0.5]].forEach(([layer, f]) => {
      const pat = this.bgLayer(w, layer), drift = layer === 1 && WORLDS[w].style === 'crypt' ? World.time * 6 : 0;
      const ox = -(this.cam.x * this.z * f + drift) % 512, oy = -(this.cam.y * this.z * f) % 512;
      c.save(); c.translate(ox, oy); c.fillStyle = pat; c.fillRect(-ox, -oy, W, H); c.restore();
    });
  },
  darkness() {
    const c = this.c, W = this.W, H = this.H;
    if (!this.dark || this.dark.width !== W || this.dark.height !== H) { this.dark = document.createElement('canvas'); this.dark.width = W; this.dark.height = H; }
    const d = this.dark.getContext('2d');
    d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H); d.fillStyle = 'rgba(2,1,6,0.93)'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => { const s = this.worldToScreen(x, y), sx = s.x * this.dpr, sy = s.y * this.dpr, rr = r * this.z; const g = d.createRadialGradient(sx, sy, 0, sx, sy, rr); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = g; d.fillRect(sx - rr, sy - rr, rr * 2, rr * 2); };
    for (const p of World.players) if (!p.dead) hole(p.x, p.y, World.bossDark ? 150 : 190);
    for (const pr of World.projs) hole(pr.x, pr.y, pr.owner === 'e' ? 40 : 55);
    for (const k of World.pickups) if (k.kind !== 'ember') hole(k.x, k.y, 60);
    c.drawImage(this.dark, 0, 0);
  },
};

function aimLine(c, st) { c.strokeStyle = `rgba(255,80,80,${0.25 + (0.6 - st) * 1.2})`; c.lineWidth = 1.5; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(14, 0); c.lineTo(400, 0); c.stroke(); c.setLineDash([]); }
function heartPath(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); c.closePath();
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function eyes(c, a, ox, oy, s, col) { c.fillStyle = col; const dx = Math.cos(a) * s * 0.8, dy = Math.sin(a) * s * 0.8; c.beginPath(); c.arc(-ox + dx, oy + dy, s, 0, TAU); c.arc(ox + dx, oy + dy, s, 0, TAU); c.fill(); }
// Draws any weapon centered at (x,y), pointing along angle a, about s px long
function weaponIcon(c, w, x, y, s, a = -0.8) {
  const rc = RARITY[w.rarity].c, col = ELEM[w.elem].c, blade = w.elem === 'none' ? '#e8eefc' : col;
  c.save(); c.translate(x, y); c.rotate(a); c.lineCap = 'round';
  const handle = (x0, x1, wd = 0.12) => { c.strokeStyle = '#8a6a3a'; c.lineWidth = Math.max(2, s * wd); c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.stroke(); };
  switch (w.type) {
    case 'sword':
      handle(-s * 0.5, -s * 0.25, 0.14);
      c.strokeStyle = rc; c.beginPath(); c.moveTo(-s * 0.25, -s * 0.2); c.lineTo(-s * 0.25, s * 0.2); c.stroke();
      c.strokeStyle = blade; c.lineWidth = Math.max(2, s * 0.13); c.beginPath(); c.moveTo(-s * 0.2, 0); c.lineTo(s * 0.55, 0); c.stroke();
      break;
    case 'axe':
      handle(-s * 0.5, s * 0.4);
      c.fillStyle = blade; c.beginPath(); c.moveTo(s * 0.2, 0); c.quadraticCurveTo(s * 0.35, -s * 0.5, s * 0.55, -s * 0.45); c.quadraticCurveTo(s * 0.42, 0, s * 0.55, s * 0.1); c.lineTo(s * 0.35, 0); c.closePath(); c.fill();
      c.strokeStyle = rc; c.lineWidth = 1.5; c.stroke();
      break;
    case 'hammer':
      handle(-s * 0.5, s * 0.35);
      c.fillStyle = blade; c.fillRect(s * 0.25, -s * 0.28, s * 0.28, s * 0.56);
      c.strokeStyle = rc; c.lineWidth = 1.5; c.strokeRect(s * 0.25, -s * 0.28, s * 0.28, s * 0.56);
      break;
    case 'spear':
      c.strokeStyle = '#8a6a3a'; c.lineWidth = Math.max(2, s * 0.06); c.beginPath(); c.moveTo(-s * 0.5, 0); c.lineTo(s * 0.32, 0); c.stroke();
      c.fillStyle = blade; c.beginPath(); c.moveTo(s * 0.3, -s * 0.07); c.lineTo(s * 0.52, 0); c.lineTo(s * 0.3, s * 0.07); c.closePath(); c.fill();
      c.strokeStyle = rc; c.lineWidth = 1.5; c.beginPath(); c.moveTo(s * 0.28, -s * 0.08); c.lineTo(s * 0.28, s * 0.08); c.stroke();
      break;
    case 'bow':
      c.rotate(-0.7);
      c.strokeStyle = rc; c.lineWidth = Math.max(2, s * 0.12); c.beginPath(); c.arc(-s * 0.15, 0, s * 0.5, -1.2, 1.2); c.stroke();
      c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(-s * 0.15 + s * 0.5 * Math.cos(-1.2), s * 0.5 * Math.sin(-1.2)); c.lineTo(-s * 0.15 + s * 0.5 * Math.cos(1.2), s * 0.5 * Math.sin(1.2)); c.stroke();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(-s * 0.2, 0); c.lineTo(s * 0.5, 0); c.stroke();
      break;
    case 'crossbow':
      handle(-s * 0.45, s * 0.3, 0.14);
      c.strokeStyle = rc; c.lineWidth = Math.max(2, s * 0.1); c.beginPath(); c.arc(s * 0.05, 0, s * 0.38, -1.0, 1.0); c.stroke();
      c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(s * 0.05 + s * 0.38 * Math.cos(-1), s * 0.38 * Math.sin(-1)); c.lineTo(-s * 0.05, 0); c.lineTo(s * 0.05 + s * 0.38 * Math.cos(1), s * 0.38 * Math.sin(1)); c.stroke();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(-s * 0.05, 0); c.lineTo(s * 0.4, 0); c.stroke();
      break;
    case 'wand':
      c.strokeStyle = '#d9c4a0'; c.lineWidth = Math.max(2, s * 0.08); c.beginPath(); c.moveTo(-s * 0.4, 0); c.lineTo(s * 0.3, 0); c.stroke();
      c.fillStyle = col; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.08 : s * 0.18, b = i * Math.PI / 5; c.lineTo(s * 0.38 + Math.cos(b) * r, Math.sin(b) * r); } c.closePath(); c.fill();
      c.strokeStyle = rc; c.lineWidth = 1; c.stroke();
      break;
    case 'staff':
      c.strokeStyle = '#7a5a3a'; c.lineWidth = Math.max(2, s * 0.1); c.beginPath(); c.moveTo(-s * 0.55, 0); c.lineTo(s * 0.35, 0); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(s * 0.45, 0, s * 0.15, 0, TAU); c.fill();
      c.strokeStyle = rc; c.lineWidth = 1.5; c.beginPath(); c.arc(s * 0.45, 0, s * 0.23, 0, TAU); c.stroke();
      break;
    case 'spellbook':
      c.rotate(-a + 0.0);
      c.fillStyle = '#3a2250'; roundRect(c, -s * 0.5, -s * 0.38, s, s * 0.76, 3); c.fill();
      c.strokeStyle = rc; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#e8dcc0'; c.fillRect(-s * 0.42, -s * 0.3, s * 0.08, s * 0.6);
      c.fillStyle = col; c.beginPath(); c.arc(s * 0.08, 0, s * 0.16, 0, TAU); c.fill();
      break;
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

function potionIcon(c, P, x, y, s) {
  c.save(); c.translate(x, y);
  if (P.id === 'bomb') {
    c.fillStyle = '#2a2a34'; c.beginPath(); c.arc(0, 2, s * 0.65, 0, TAU); c.fill();
    c.strokeStyle = '#8a6a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(s * 0.3, -s * 0.3); c.lineTo(s * 0.6, -s * 0.8); c.stroke();
    c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(s * 0.6, -s * 0.8, 2.2, 0, TAU); c.fill();
  } else {
    c.fillStyle = 'rgba(230,240,255,0.25)'; c.beginPath(); c.arc(0, s * 0.25, s * 0.62, 0, TAU); c.fill();
    c.fillStyle = P.c; c.beginPath(); c.arc(0, s * 0.3, s * 0.5, 0, TAU); c.fill();
    c.fillStyle = 'rgba(230,240,255,0.5)'; c.fillRect(-s * 0.18, -s * 0.75, s * 0.36, s * 0.55);
    c.fillStyle = '#8a6a3a'; c.fillRect(-s * 0.22, -s * 0.92, s * 0.44, s * 0.22);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(-s * 0.2, s * 0.15, s * 0.12, 0, TAU); c.fill();
  }
  c.restore();
}
function relicIcon(c, Rl, x, y, s) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#1a1230'; c.strokeStyle = Rl.c; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, -s); c.lineTo(s, 0); c.lineTo(0, s); c.lineTo(-s, 0); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = Rl.c; c.fillStyle = Rl.c; c.lineWidth = 1.8; const q = s * 0.45; c.beginPath();
  switch (Rl.id) {
    case 'hourglass': c.moveTo(-q, -q); c.lineTo(q, -q); c.lineTo(-q, q); c.lineTo(q, q); c.closePath(); c.stroke(); break;
    case 'decoy': c.arc(0, -q * 0.4, q * 0.45, 0, TAU); c.moveTo(-q * 0.6, q); c.lineTo(0, 0); c.lineTo(q * 0.6, q); c.stroke(); break;
    case 'gnome': c.moveTo(-q * 0.7, q * 0.2); c.lineTo(0, -q); c.lineTo(q * 0.7, q * 0.2); c.closePath(); c.fill(); c.fillRect(-q * 0.6, q * 0.35, q * 1.2, q * 0.5); break;
    case 'regen': c.arc(0, 0, q * 0.7, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(-q * 0.35, 0); c.lineTo(q * 0.35, 0); c.moveTo(0, -q * 0.35); c.lineTo(0, q * 0.35); c.stroke(); break;
    case 'displace': c.moveTo(-q, q * 0.8); c.quadraticCurveTo(0, -q * 1.4, q, q * 0.8); c.stroke(); break;
    default: c.moveTo(0, -q); c.lineTo(q * 0.6, 0); c.lineTo(0, q); c.lineTo(-q * 0.6, 0); c.closePath(); c.fill();
  }
  c.restore();
}
