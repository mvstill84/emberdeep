// ===== HUD =====
const HUD = {
  u: 1,
  draw(c, dt) {
    const p = World.players[0];
    c.setTransform(Render.dpr, 0, 0, Render.dpr, 0, 0);
    if (Input.last === 'touch') this.touch(c, innerWidth, innerHeight);
    const u = this.u = clamp(Math.min(innerWidth, innerHeight) / 620, 0.6, 1), s = Render.dpr * u, W = innerWidth / u, H = innerHeight / u;
    c.setTransform(s, 0, 0, s, 0, 0);
    p.manaFlash = (p.manaFlash || 0) - dt;
    c.textBaseline = 'alphabetic';
    const pad = 16, font = (n, w = 700) => `${w} ${n}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    // hearts
    for (let i = 0; i < p.maxHp / 2; i++) {
      const x = pad + 11 + i * 25, y = pad + 12, hp = p.hp - i * 2;
      heartPath(c, x, y, 10);
      c.fillStyle = '#2a1830'; c.fill(); c.strokeStyle = '#ff5470'; c.lineWidth = 1.5; c.stroke();
      if (hp >= 2) { heartPath(c, x, y, 10); c.fillStyle = '#ff5470'; c.fill(); }
      else if (hp === 1) { c.save(); c.beginPath(); c.rect(x - 15, y - 15, 15, 30); c.clip(); heartPath(c, x, y, 10); c.fillStyle = '#ff5470'; c.fill(); c.restore(); }
    }
    if (p.revives) { c.fillStyle = '#ffb02e'; c.font = font(13); c.textAlign = 'left'; c.fillText('+' + p.revives + ' revive', pad + p.maxHp / 2 * 25 + 6, pad + 17); }
    // embers
    c.fillStyle = '#ffb057'; c.beginPath(); c.moveTo(pad + 10, pad + 30); c.lineTo(pad + 16, pad + 38); c.lineTo(pad + 10, pad + 46); c.lineTo(pad + 4, pad + 38); c.fill();
    c.font = font(16, 800); c.textAlign = 'left'; c.fillText(Game.runEmbers, pad + 23, pad + 44);
    if (p.keys > 0) { const kx = pad + 70; c.strokeStyle = '#ffd27a'; c.lineWidth = 2.5; c.beginPath(); c.arc(kx, pad + 38, 4, 0, TAU); c.moveTo(kx + 4, pad + 38); c.lineTo(kx + 14, pad + 38); c.moveTo(kx + 11, pad + 38); c.lineTo(kx + 11, pad + 43); c.stroke(); c.fillStyle = '#ffd27a'; c.fillText(p.keys, kx + 19, pad + 44); }
    // items
    p.items.forEach((id, i) => { const it = ITEMS.find(x => x.id === id); itemIcon(c, it, pad + 11 + (i % 10) * 24, pad + 66 + Math.floor(i / 10) * 24, 10); });
    // weapons
    const tch = Input.last === 'touch', bx = tch ? (W - 300) / 2 : pad, by = tch ? pad - 4 : H - pad - 64; // on touch, keep thumbs' corners clear
    p.weapons.forEach((w, i) => {
      const active = i === p.wi; c.font = font(active ? 15 : 13, 800);
      const y = active ? by : tch ? by + 66 : by - 46, h = active ? 62 : 40, ww = clamp(c.measureText(w.name).width + 70, active ? 250 : 210, Math.min(420, W - 40));
      c.fillStyle = active ? 'rgba(20,14,38,0.85)' : 'rgba(20,14,38,0.6)'; roundRect(c, bx, y, ww, h, 10); c.fill();
      c.strokeStyle = active ? RARITY[w.rarity].c : 'rgba(120,100,180,0.5)'; c.lineWidth = active ? 2 : 1; c.stroke();
      weaponIcon(c, w, bx + 26, y + h / 2, active ? 30 : 22);
      c.textAlign = 'left'; c.fillStyle = RARITY[w.rarity].c; c.font = font(active ? 15 : 13, 800);
      const stolen = p.stolen && p.stolen.idx === i;
      c.fillText(stolen ? 'Engulfed! ' + Math.ceil(p.stolen.t) + 's' : fitText(c, w.name, ww - 60), bx + 50, y + (active ? 26 : 25));
      if (active) {
        c.fillStyle = 'rgba(233,228,255,0.65)'; c.font = font(12, 600);
        c.fillText(weaponLine(w), bx + 50, y + 45);
        const bar = (f, col) => { c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(bx + 50, y + 51, ww - 64, 5); c.fillStyle = col; c.fillRect(bx + 50, y + 51, (ww - 64) * clamp(f, 0, 1), 5); };
        if (w.type === 'bow' && p.charge > 0) bar(p.charge, p.charge >= 1 ? '#fff' : ELEM[w.elem].c);
        if (w.type === 'wand' || w.type === 'staff') bar(p.mana / p.maxMana, p.exhausted || p.manaFlash > 0 ? '#ff4d6d' : '#4fa3ff');
        if (w.type === 'spellbook') { const f = 1 - clamp((w.cdT || 0) / (w.cd / p.st.rate), 0, 1); bar(f, f >= 1 ? '#ffffff' : ELEM[w.elem].c); }
      }
    });
    if (p.weapons.length > 1 && Input.last !== 'touch') { c.fillStyle = 'rgba(233,228,255,0.45)'; c.font = font(11, 600); c.fillText(Input.last === 'pad' ? 'Y to swap' : 'Q to swap', bx + 218, by - 20); }
    this.minimap(c, W, pad, font);
    // boss bar
    const b = World.boss;
    if (b && b.spawnT <= 0) {
      const bw = Math.min(520, W * 0.6), x = (W - bw) / 2, y = H - pad - 30;
      c.fillStyle = 'rgba(10,6,20,0.8)'; roundRect(c, x - 4, y - 4, bw + 8, 18, 6); c.fill();
      c.fillStyle = b.raged ? '#ff3a5a' : b.D.c; c.fillRect(x, y, bw * clamp(b.hp / b.maxHp, 0, 1), 10);
      c.textAlign = 'center'; c.fillStyle = '#ffe2b0'; c.font = font(14, 800); c.fillText(b.name + ', ' + b.title, W / 2, y - 10);
    }
    // nearby pickup card
    const k = World.near;
    const key = Input.last === 'touch' ? 'Tap USE' : Input.last === 'pad' ? 'X' : 'E';
    if (k && k.kind === 'weapon') this.compare(c, W, H, p, k.w, key, font);
    else if (k) {
      let title, line1, line2 = '', col;
      if (k.kind === 'chest') { title = 'Treasure Chest'; line1 = 'Open it'; col = '#ffd27a'; }
      else if (k.kind === 'lockchest') { title = 'Locked Chest'; col = '#d9c4ff'; line1 = p.keys > 0 ? `Use a key (you have ${p.keys})` : 'Needs a key'; line2 = k.msg || 'Holds at least Uncommon loot'; }
      else if (k.kind === 'portal') {
        title = k.last ? 'The Way Out' : 'Portal'; col = '#7fd8ff';
        line1 = k.last ? 'Climb out of the deep' : 'Descend to the next level';
        if (World.unclaimed()) { line2 = k.confirm ? '⚠ Press again to leave the rewards behind' : '⚠ There are unclaimed rewards in this room'; col = '#ffb057'; }
      }
      else { title = k.item.n; line1 = k.item.d; col = k.item.c; const sy = SYNERGIES.find(sy => sy.need.includes(k.item.id) && sy.need.some(n => p.items.includes(n)) && !p.syn.includes(sy.id)); if (sy) line2 = '✦ Completes synergy: ' + sy.n; }
      c.font = font(13, 600); const cw = Math.min(W - 40, Math.max(280, c.measureText(line1).width + 40, c.measureText(line2).width + 40));
      const x = (W - cw) / 2, y = H * 0.62;
      c.fillStyle = 'rgba(14,9,28,0.9)'; roundRect(c, x, y, cw, line2 ? 76 : 58, 10); c.fill(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
      c.textAlign = 'center'; c.fillStyle = col; c.font = font(16, 800); c.fillText(title, W / 2, y + 22);
      c.fillStyle = '#e9e4ff'; c.font = font(13, 600); c.fillText(fitText(c, line1, cw - 20), W / 2, y + 42);
      if (line2) { c.fillStyle = line2.startsWith('✦') ? '#7fffd4' : line2.startsWith('⚠') ? '#ffb057' : 'rgba(233,228,255,0.6)'; c.fillText(fitText(c, line2, cw - 20), W / 2, y + 62); }
      c.fillStyle = '#ffb057'; c.font = font(12, 800); c.fillText(key, W / 2, y + (line2 ? 92 : 74));
    }
    this.enemyBox(c, W, H, pad, font);
    // banner
    const bn = Game.bannerData;
    if (bn) {
      bn.t += dt; const a = clamp(Math.min(bn.t / 0.25, (bn.dur - bn.t) / 0.5), 0, 1);
      if (bn.t > bn.dur) Game.bannerData = null;
      c.globalAlpha = a; c.textAlign = 'center';
      if (bn.title) { c.font = font(Math.min(38, W / 14), 800); c.fillStyle = '#ffd27a'; c.shadowColor = '#ff7a2a'; c.shadowBlur = 18; c.fillText(bn.title, W / 2, H * 0.24); c.shadowBlur = 0; }
      if (bn.sub) { c.font = font(16, 600); c.fillStyle = '#e9e4ff'; c.fillText(bn.sub, W / 2, H * 0.24 + (bn.title ? 30 : 0)); }
      c.globalAlpha = 1;
    }
  },
  // side-by-side: what you hold vs. what's on the floor
  compare(c, W, H, p, nw, key, font) {
    const cur = p.weapons.length < 2 ? null : p.weapons[p.wi];
    const cw = Math.min(260, (W - 50) / 2), gap = 14, y0 = H * 0.5, y = y0, x0 = W / 2 - cw - gap / 2, x1 = W / 2 + gap / 2;
    const stats = w => {
      const rows = [[w.type === 'spellbook' ? 'Spell' : 'Damage', w.type === 'spellbook' ? SPELLS[w.spell].n : Math.round(w.dmg), w.dmg]];
      rows.push([w.type === 'bow' ? 'Draw' : w.type === 'spellbook' ? 'Cooldown' : 'Speed', w.type === 'bow' ? w.charge.toFixed(2) + 's' : w.type === 'spellbook' ? w.cd.toFixed(1) + 's' : (1 / w.cd).toFixed(1) + '/s', w.type === 'bow' ? -w.charge : w.type === 'spellbook' ? -w.cd : 1 / w.cd]);
      if (w.type === 'spellbook') rows[0].push(Math.round(w.dmg) + ' dmg');
      rows.push(['Element', w.elem === 'none' ? '-' : w.elem]);
      return rows;
    };
    const card = (w, x, label, other, y = y0) => {
      const lines = w ? w.quirks.map(q => QUIRKS.find(z => z.id === q).d) : [];
      if (w && !lines.length) lines.push(WBASE[w.type].d);
      c.font = font(14, 800); const extra = w ? (wrapText(c, w.name, cw - 60, 2).length - 1) * 16 : 0;
      const h = 132 + lines.length * 16 + extra;
      c.fillStyle = 'rgba(14,9,28,0.92)'; roundRect(c, x, y, cw, h, 10); c.fill();
      c.strokeStyle = w ? RARITY[w.rarity].c : '#555'; c.lineWidth = label === 'NEW' ? 2 : 1.2; c.stroke();
      c.textAlign = 'left'; c.fillStyle = 'rgba(233,228,255,0.5)'; c.font = font(10, 800); c.fillText(label, x + 12, y + 16);
      if (!w) { c.fillStyle = '#aaa'; c.font = font(13, 600); c.fillText('Empty slot', x + 12, y + 40); return h; }
      weaponIcon(c, w, x + cw - 26, y + 26, 26, -0.8);
      c.fillStyle = RARITY[w.rarity].c; c.font = font(14, 800);
      const nl = wrapText(c, w.name, cw - 60, 2);
      nl.forEach((t, i) => c.fillText(t, x + 12, y + 36 + i * 16));
      const yo = (nl.length - 1) * 16; y += yo;
      c.fillStyle = 'rgba(233,228,255,0.6)'; c.font = font(11, 600); c.fillText(`${RARITY[w.rarity].n} ${w.type}`, x + 12, y + 52);
      const mine = stats(w), theirs = other ? stats(other) : null;
      mine.forEach((r, i) => {
        const ry = y + 74 + i * 18;
        c.fillStyle = 'rgba(233,228,255,0.55)'; c.font = font(12, 600); c.fillText(r[0], x + 12, ry);
        c.textAlign = 'right'; c.fillStyle = '#e9e4ff'; c.font = font(12, 800);
        let txt = String(r[1]) + (r[3] ? ' · ' + r[3] : '');
        if (label === 'NEW' && theirs && typeof r[2] === 'number' && typeof theirs[i][2] === 'number' && r[0] === theirs[i][0]) {
          const d = r[2] - theirs[i][2], rel = Math.abs(d) / Math.max(0.001, Math.abs(theirs[i][2]));
          if (rel > 0.03) { c.fillStyle = d > 0 ? '#4ade80' : '#ff6b6b'; txt += d > 0 ? ' ▲' : ' ▼'; }
        }
        c.fillText(txt, x + cw - 12, ry); c.textAlign = 'left';
      });
      c.fillStyle = 'rgba(233,228,255,0.7)'; c.font = font(11, 600);
      lines.forEach((l, i) => c.fillText(fitText(c, l, cw - 24), x + 12, y + 132 + i * 16 - 4));
      return h;
    };
    const h = Math.max(card(cur, x0, 'EQUIPPED', null), card(nw, x1, 'NEW', cur));
    c.textAlign = 'center'; c.fillStyle = '#ffb057'; c.font = font(12, 800);
    c.fillText(`${key} to ${cur ? 'swap' : 'take'}`, W / 2, y + h + 18);
  },
  enemyBox(c, W, H, pad, font) { // name of the last thing you hit
    const lh = World.lastHit; if (!lh || lh.t <= 0) return;
    const e = lh.e, a = clamp(lh.t / 0.5, 0, 1), bw = 170, tch = Input.last === 'touch';
    const x = tch ? pad : (W - bw) / 2, y = tch ? pad + 92 : pad;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(14,9,28,0.75)'; roundRect(c, x, y, bw, 40, 8); c.fill();
    c.textAlign = 'left'; c.fillStyle = e.D.c; c.font = font(12, 800); c.fillText(e.D.n || '', x + 10, y + 16);
    const tags = [e.burn > 0 && 'burning', e.chill > 0 && 'chilled', e.freeze > 0 && 'frozen', e.stun > 0 && 'stunned', e.bones > 0 && 'reforming', e.dead && 'slain'].filter(Boolean);
    c.textAlign = 'right'; c.fillStyle = e.burn > 0 ? '#ff9a3c' : 'rgba(233,228,255,0.6)'; c.font = font(10, 700); c.fillText(tags.join(' · '), x + bw - 10, y + 16);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 10, y + 25, bw - 20, 6);
    c.fillStyle = '#ff4d6d'; c.fillRect(x + 10, y + 25, (bw - 20) * clamp(e.dead ? 0 : e.hp / e.maxHp, 0, 1), 6);
    c.globalAlpha = 1; c.textAlign = 'left';
  },
  minimap(c, W, pad, font) {
    const m = 15, tb = Input.touchButtons().find(b => b.id === 'pause'), ox = W - pad - GRID * m - (Input.last === 'touch' ? (tb.r * 2 + 10) / this.u : 0), oy = pad;
    c.fillStyle = 'rgba(10,6,20,0.55)'; roundRect(c, ox - 6, oy - 6, GRID * m + 12, GRID * m + 12, 8); c.fill();
    const tint = World.theme.tint;
    c.strokeStyle = hexA(tint, 0.5); c.lineWidth = 2;
    for (const r of World.rooms) if (r.visited) for (const id of r.links) { const n = World.rooms[id]; if (!n.known) continue; c.beginPath(); c.moveTo(ox + r.cx * m + m / 2, oy + r.cy * m + m / 2); c.lineTo(ox + n.cx * m + m / 2, oy + n.cy * m + m / 2); c.stroke(); }
    for (const r of World.rooms) {
      if (!r.known) continue;
      const x = ox + r.cx * m + 2, y = oy + r.cy * m + 2, s = m - 4;
      c.fillStyle = r === World.room ? '#ffe2b0' : r.visited ? hexA(tint, 0.6) : 'rgba(80,70,120,0.6)';
      c.fillRect(x, y, s, s);
      if (r.type === 'boss') { c.fillStyle = '#ff3a5a'; c.beginPath(); c.arc(x + s / 2, y + s / 2, 3, 0, TAU); c.fill(); }
      if (r.visited && World.pickups.some(k => k.kind === 'lockchest' && k.room === r)) { c.fillStyle = '#d9c4ff'; c.fillRect(x + s - 4, y, 4, 4); }
      if (r.visited && World.pickups.some(k => k.kind === 'key' && k.room === r)) { c.fillStyle = '#ffd27a'; c.fillRect(x, y, 4, 4); }
      if (r.type === 'exit') { c.strokeStyle = '#7fd8ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x + s / 2, y + s / 2, 3.5, 0, TAU); c.stroke(); }
      if (r.type === 'armory') { c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(x + s / 2, y + s / 2, 3, 0, TAU); c.fill(); }
    }
    c.textAlign = 'right'; c.fillStyle = 'rgba(233,228,255,0.6)'; c.font = font(12, 700);
    c.fillText(`${levelLabel(World.world, World.level)} · ${World.theme.n}`, ox + GRID * m + 6, oy + GRID * m + 22);
    c.fillStyle = 'rgba(233,228,255,0.35)'; c.font = font(11, 600); c.fillText('Seed ' + Game.seed, ox + GRID * m + 6, oy + GRID * m + 37);
    if (Game.secret) { c.fillStyle = '#7fffd4'; c.fillText(Game.secret.n, ox + GRID * m + 6, oy + GRID * m + 52); }
  },
  touch(c, W, H) {
    const max = Math.min(W, H) * 0.09;
    const stick = (st, hx, hy) => {
      const x = st ? st.ox : hx, y = st ? st.oy : hy;
      c.strokeStyle = `rgba(233,228,255,${st ? 0.35 : 0.12})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, max, 0, TAU); c.stroke();
      if (st) { const v = Input.stickVec(st, max); c.fillStyle = 'rgba(255,200,140,0.45)'; c.beginPath(); c.arc(x + v.x * max, y + v.y * max, max * 0.42, 0, TAU); c.fill(); }
    };
    stick(Input.sticks.L, W * 0.16, H * 0.62); if (Input.sticks.R) stick(Input.sticks.R);
    const p = World.players[0], w = p.weapons[p.wi];
    for (const b of Input.touchButtons()) {
      if (b.id === 'use' && !World.near) continue;
      if (b.id === 'swap' && p.weapons.length < 2) continue;
      const held = b.id === 'attack' && Input.atk !== null;
      c.fillStyle = b.id === 'use' ? 'rgba(255,176,87,0.35)' : b.id === 'attack' ? (held ? 'rgba(255,122,42,0.45)' : 'rgba(255,122,42,0.22)') : 'rgba(40,28,80,0.55)';
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
      c.strokeStyle = b.id === 'attack' ? 'rgba(255,200,140,0.7)' : 'rgba(233,228,255,0.4)'; c.lineWidth = b.id === 'attack' ? 2.5 : 1.5; c.stroke();
      if (b.id === 'attack') { weaponIcon(c, w, b.x, b.y, b.r * 1.0, -0.8); continue; }
      c.fillStyle = '#f4eeff'; c.textAlign = 'center'; c.font = `800 ${Math.round(b.r * 0.42)}px ui-rounded, system-ui, sans-serif`;
      c.fillText({ roll: p.cls === 'mage' ? 'BLINK' : 'ROLL', swap: 'SWAP', use: 'USE', pause: 'II' }[b.id], b.x, b.y + b.r * 0.15);
    }
  },
};
function wrapText(c, s, w, max) {
  const words = s.split(' '), out = []; let line = '';
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; }
  if (line) out.push(line);
  if (out.length > max) { const rest = out.slice(max - 1).join(' '); out.length = max - 1; out.push(fitText(c, rest, w)); }
  return out;
}
function fitText(c, s, w) { if (c.measureText(s).width <= w) return s; while (s.length > 3 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
function weaponLine(w) {
  const dmg = Math.round(w.dmg), spd = (1 / w.cd).toFixed(1);
  const el = w.elem !== 'none' ? ' · ' + w.elem : '';
  if (w.type === 'spellbook') return `${SPELLS[w.spell].d} · ${dmg} dmg · ${spd}/s`;
  return w.type === 'bow' ? `${dmg} dmg · ${w.charge.toFixed(2)}s draw${el}` : `${dmg} dmg · ${spd}/s${el}`;
}

// ===== Game: state, runs, menus =====
const Game = {
  state: 'menu', seed: '', seedNum: 0, mods: {}, cls: 'fighter', secret: null, hs: 0, runEmbers: 0, runTime: 0, bannerData: null, deadT: 0,
  hitstop(t) { this.hs = Math.max(this.hs, t); },
  banner(title, sub, dur = 2) { this.bannerData = { title, sub, dur, t: 0 }; },
  newRun(seedStr, cls) {
    Snd.init(); Screen.goFull();
    this.cls = cls || Meta.data.lastClass || 'fighter';
    if (this.cls !== 'fighter' && !Meta.has(this.cls)) this.cls = 'fighter';
    Meta.data.lastClass = this.cls;
    this.seed = normSeed(seedStr) || randomSeed();
    this.seedNum = strHash(this.seed);
    const sec = SECRETS[this.seedNum];
    this.secret = sec || null; this.mods = sec ? { ...sec.mods } : {};
    this.runEmbers = 0; this.runTime = 0; this.deadT = 0; this.hs = 0; this.keysSpawned = 0; this.chestsSpawned = 0;
    Meta.data.stats.runs++; Meta.save();
    Music.setSeed(this.seedNum); Music.on = true;
    World.startLevel(1, 1);
    if (sec) {
      const first = !Meta.data.secrets[this.seed];
      if (first) { Meta.data.secrets[this.seed] = sec.n; Meta.data.embers += 25; Meta.save(); }
      setTimeout(() => this.banner('Secret Seed: ' + sec.n, sec.d + (first ? '  (+25 embers)' : ''), 3.4), 2700);
    }
    this.state = 'play'; Menu.hide();
  },
  nextLevel(last) {
    if (last) { this.end(true); return; }
    if (World.level < 3) World.startLevel(World.world, World.level + 1, true);
    else World.startLevel(World.world + 1, 1, true);
  },
  onDeath() { this.deadT = 1.4; Music.target = 0; },
  end(won) {
    this.state = won ? 'win' : 'dead';
    Meta.data.embers += this.runEmbers;
    Meta.data.stats.bestDepth = Math.max(Meta.data.stats.bestDepth || 0, World.depth);
    if (won) Meta.data.stats.wins++;
    Meta.save(); Music.on = false;
    Snd.play(won ? 'portal' : 'death');
    Menu.show(won ? 'win' : 'dead');
  },
  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; Menu.show('pause'); }
    else if (this.state === 'pause') { this.state = 'play'; Menu.hide(); }
  },
  saveSeed() {
    const list = Meta.data.seeds.filter(s => s.seed !== this.seed);
    list.unshift({ seed: this.seed, date: new Date().toLocaleDateString(), level: levelLabel(World.world, World.level), won: this.state === 'win', secret: this.secret ? this.secret.n : '' });
    Meta.data.seeds = list.slice(0, 40); Meta.save();
  },
  frame(ts) {
    try { this.step(ts); } catch (err) { console.error(err); }
    Input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  },
  step(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000); this.last = ts;
    if (Input.pressed.has('escape') || Input.pressed.has('p')) this.togglePause();
    if (this.state === 'play' && Screen.portrait()) this.togglePause();
    if (Input.pressed.has('m')) Snd.setMuted(!Meta.data.muted);
    let rdt = 0;
    if (this.state === 'play') {
      rdt = dt;
      if (this.hs > 0) { this.hs -= dt; rdt = dt * 0.15; }
      else { World.update(dt); this.runTime += dt; }
      if (this.deadT > 0) { this.deadT -= dt; if (this.deadT <= 0) this.end(false); }
    }
    if (World.map) Render.draw(rdt); else Menu.drawBg(dt);
  },
};

const Menu = {
  el: null, bg: [],
  hide() { this.el.classList.add('hidden'); this.el.innerHTML = ''; },
  drawBg(dt) {
    const c = Render.c, W = Render.W, H = Render.H;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#07050f'; c.fillRect(0, 0, W, H);
    if (this.bg.length < 90) this.bg.push({ x: Math.random() * W, y: H + 10, v: 20 + Math.random() * 60, s: 1 + Math.random() * 3, w: Math.random() * TAU });
    c.globalCompositeOperation = 'lighter';
    for (const b of this.bg) { b.y -= b.v * dt * Render.dpr; b.w += dt; b.x += Math.sin(b.w) * 0.3; if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; } Render.drawGlow('#ff7a2a', b.x, b.y, b.s * 6 * Render.dpr, 0.5); }
    c.globalCompositeOperation = 'source-over';
  },
  html(h) { this.el.innerHTML = `<div class="panel">${h}</div>`; this.el.classList.remove('hidden'); },
  on(id, fn) { const b = document.getElementById(id); if (b) b.onclick = () => { Snd.init(); Screen.goFull(); Snd.play('ui'); fn(); }; },
  show(name, arg) {
    const M = Meta.data, ctrl = matchMedia('(pointer:coarse)').matches
      ? 'Left thumb moves. Hold the big button to attack the nearest foe, or drag on the right side to aim by hand. Hold to draw a bow, let go to fire. After a roll, attack right away to lunge.'
      : 'WASD move · Mouse aim · Click attack (hold to draw a bow) · Space or right-click roll · Q swap · E take · Esc pause · M mute<br>Attack right after a roll to lunge. Every melee swing cuts shots out of the air.';
    if (name === 'title') {
      Game.state = 'menu';
      this.html(`<h1>EMBERDEEP</h1><div class="sub">A tiny procedural dungeon. Every seed is a different descent.</div>
        <button class="btn" id="b-new">New Run</button>
        <button class="btn" id="b-seed">Enter a Seed</button>
        <div class="row"><button class="btn" id="b-saved">Saved Seeds</button><button class="btn" id="b-sanct">Sanctum · <span class="ember">${M.embers}</span></button></div>
        <button class="btn small" id="b-mute">${M.muted ? 'Sound: Off' : 'Sound: On'}</button>
        <div class="hint">${ctrl}</div>`);
      this.on('b-new', () => this.show('class'));
      this.on('b-seed', () => this.show('seed'));
      this.on('b-saved', () => this.show('saved'));
      this.on('b-sanct', () => this.show('sanctum'));
      this.on('b-mute', () => { Snd.setMuted(!M.muted); this.show('title'); });
    } else if (name === 'seed') {
      this.html(`<h2>Enter a Seed</h2><div class="sub">Same seed, same dungeon. Some seeds hold secrets.</div>
        <input class="seed" id="seedin" maxlength="16" placeholder="${randomSeed()}" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button class="btn" id="b-go">Descend</button><button class="btn small" id="b-back">Back</button>`);
      const inp = document.getElementById('seedin'); setTimeout(() => inp.focus(), 50);
      inp.onkeydown = e => { if (e.key === 'Enter') this.show('class', inp.value || inp.placeholder); };
      this.on('b-go', () => this.show('class', inp.value || inp.placeholder));
      this.on('b-back', () => this.show('title'));
    } else if (name === 'class') {
      const seed = arg;
      const cards = Object.entries(CLASSES).map(([id, C]) => {
        const open = !C.cost || Meta.has(id), hearts = '♥'.repeat(C.hp / 2);
        const kit = C.kit.map(k => k.name).join(' + ');
        const btn = open ? `<button class="btn" id="cls-${id}">Play</button>` : `<button class="btn" id="buy-${id}" ${M.embers < C.cost ? 'disabled' : ''}>${C.cost} ◆</button>`;
        return `<div class="card" style="${open ? '' : 'opacity:.75'}"><div class="grow"><b style="color:${C.c}">${C.n}</b> <span style="color:#ff5470">${hearts}</span>${open ? '' : ' <small style="display:inline">· locked</small>'}<small>${kit}</small><small>${C.perk}</small><small>${C.move}: ${C.moveD}</small></div>${btn}</div>`;
      }).join('');
      this.html(`<h2>Choose your class</h2><div class="sub">${seed ? 'Seed <b>' + normSeed(seed) + '</b> · ' : ''}You carry <span class="ember">${M.embers} embers</span></div><div class="list">${cards}</div><button class="btn small" id="b-back">Back</button>`);
      for (const id of Object.keys(CLASSES)) {
        this.on('cls-' + id, () => Game.newRun(seed, id));
        this.on('buy-' + id, () => { const C = CLASSES[id]; if (M.embers >= C.cost) { M.embers -= C.cost; M.unlocks[id] = 1; Meta.save(); Snd.play('item'); this.show('class', seed); } });
      }
      this.on('b-back', () => this.show('title'));
    } else if (name === 'saved') {
      const rows = M.seeds.map((s, i) => `<div class="card"><div class="grow"><b>${s.seed}</b>${s.secret ? ` <span class="secret">· ${s.secret}</span>` : ''}<small>${s.won ? 'Escaped' : 'Reached ' + (s.level || 'floor ' + s.floor)} · ${s.date}</small></div><button class="btn" id="play-${i}">Play</button><button class="btn" id="del-${i}">✕</button></div>`).join('');
      this.html(`<h2>Saved Seeds</h2><div class="list">${rows || '<div class="sub">No saved seeds yet. Save one from the pause menu or after a run.</div>'}</div><button class="btn small" id="b-back">Back</button>`);
      M.seeds.forEach((s, i) => { this.on('play-' + i, () => this.show('class', s.seed)); this.on('del-' + i, () => { M.seeds.splice(i, 1); Meta.save(); this.show('saved'); }); });
      this.on('b-back', () => this.show('title'));
    } else if (name === 'sanctum') {
      const rows = UNLOCKS.map(u => {
        const own = Meta.has(u.id), locked = u.req && !Meta.has(u.req);
        return `<div class="card"><div class="grow"><b>${u.n}</b><small>${locked ? 'Requires ' + UNLOCKS.find(x => x.id === u.req).n : u.d}</small></div>${own ? '<span class="ember">✓</span>' : `<button class="btn" id="u-${u.id}" ${M.embers < u.cost || locked ? 'disabled' : ''}>${u.cost} ◆</button>`}</div>`;
      }).join('');
      const found = Object.values(M.secrets);
      this.html(`<h2>The Sanctum</h2><div class="sub">You carry <span class="ember">${M.embers} embers</span>. Spend them to grow stronger between runs.</div>
        <div class="list">${rows}</div>
        <div class="hint">Secret seeds found: ${found.length} / ${Object.keys(SECRETS).length}${found.length ? ' · <span class="secret">' + found.join(', ') + '</span>' : ''}<br>Runs ${M.stats.runs} · Escapes ${M.stats.wins} · Deepest level ${M.stats.bestDepth ? levelLabel(Math.ceil(M.stats.bestDepth / 3), (M.stats.bestDepth - 1) % 3 + 1) : '-'} · Foes slain ${M.stats.kills}</div>
        <div class="row"><button class="btn small" id="b-back">Back</button><button class="btn small" id="b-reset">Reset Progress</button></div>`);
      this.on('b-reset', () => { const b = document.getElementById('b-reset'); if (b.dataset.armed) { M.embers = 0; M.unlocks = {}; Meta.save(); this.show('sanctum'); } else { b.dataset.armed = 1; b.textContent = 'Tap again to wipe embers + unlocks'; } });
      for (const u of UNLOCKS) this.on('u-' + u.id, () => { if (M.embers >= u.cost) { M.embers -= u.cost; M.unlocks[u.id] = 1; Meta.save(); Snd.play('item'); this.show('sanctum'); } });
      this.on('b-back', () => this.show('title'));
    } else if (name === 'pause') {
      const p = World.players[0];
      const items = p.items.map(id => ITEMS.find(x => x.id === id)).map((it, i) => `<div class="card"><div class="grow"><b style="color:${it.c}">${it.n}</b><small>${it.d}</small></div><button class="btn" id="drop-${i}">Drop</button></div>`).join('');
      const syn = p.syn.map(id => SYNERGIES.find(s => s.id === id)).map(s => `<div class="card"><div class="grow"><b class="secret">✦ ${s.n}</b><small>${s.d}</small></div></div>`).join('');
      this.html(`<h2>Paused</h2><div class="sub"><b>${World.theme.n}</b> · Level ${levelLabel(World.world, World.level)}<br>Seed <b>${Game.seed}</b> · ${fmtTime(Game.runTime)}</div>
        <div class="stats" style="grid-template-columns:auto auto auto auto;max-width:540px;font-size:14px">${statBlock(p)}</div>
        <div class="list">${syn}${items || '<div class="sub">No items yet.</div>'}</div>
        <button class="btn" id="b-res">Resume</button>
        <div class="row"><button class="btn small" id="b-save">Save Seed</button><button class="btn small" id="b-mute">${M.muted ? 'Sound: Off' : 'Sound: On'}</button></div>
        <button class="btn small" id="b-quit">Abandon Run</button>`);
      this.on('b-res', () => Game.togglePause());
      p.items.forEach((id, i) => this.on('drop-' + i, () => { World.dropItem(p, i); this.show('pause'); }));
      this.on('b-save', () => { Game.saveSeed(); document.getElementById('b-save').textContent = 'Saved ✓'; });
      this.on('b-mute', () => { Snd.setMuted(!M.muted); document.getElementById('b-mute').textContent = M.muted ? 'Sound: Off' : 'Sound: On'; });
      this.on('b-quit', () => { Game.end(false); });
    } else if (name === 'dead' || name === 'win') {
      const p = World.players[0], won = name === 'win';
      this.html(`<h1 style="font-size:clamp(36px,7vw,60px)">${won ? 'ESCAPED' : 'FALLEN'}</h1>
        <div class="sub">${won ? 'You climbed out of the deep. It will be waiting.' : `Lost on level ${levelLabel(World.world, World.level)}, ${World.theme.n}.`}</div>
        <div class="stats"><span>Class</span><span>${CLASSES[Game.cls].n}</span><span>Seed</span><span>${Game.seed}</span><span>Level reached</span><span>${levelLabel(World.world, World.level)}</span><span>Time</span><span>${fmtTime(Game.runTime)}</span><span>Foes slain</span><span>${p.kills}</span><span>Items</span><span>${p.items.length}</span><span>Embers banked</span><span class="ember">+${Game.runEmbers}</span></div>
        <button class="btn" id="b-again">Same Seed Again</button>
        <button class="btn" id="b-new">New Seed</button>
        <div class="row"><button class="btn small" id="b-save">Save Seed</button><button class="btn small" id="b-sanct">Sanctum · ${M.embers} ◆</button></div>
        <button class="btn small" id="b-title">Title</button>`);
      this.on('b-again', () => Game.newRun(Game.seed, Game.cls));
      this.on('b-new', () => { World.map = null; this.show('class'); });
      this.on('b-save', () => { Game.saveSeed(); document.getElementById('b-save').textContent = 'Saved ✓'; });
      this.on('b-sanct', () => { World.map = null; this.show('sanctum'); });
      this.on('b-title', () => { World.map = null; this.show('title'); });
    }
  },
};
function statBlock(p) {
  const st = p.st, pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%', C = CLASSES[p.cls];
  const rows = [
    ['Class', C.n], ['Hearts', `${p.hp / 2} / ${p.maxHp / 2}`],
    ['Move speed', pct(st.speed / 155 - 1)], ['Attack speed', pct(st.rate - 1)],
    ['Damage', pct(st.dmg - 1)], ['Melee damage', pct(st.meleeDmg - 1)],
    ['Ranged damage', pct(st.rangedDmg - 1)], ['Bow draw time', pct(st.draw - 1)],
    ['Crit chance', Math.round(((p.weapons[p.wi].crit || 0) + st.crit) * 100) + '%'], ['Crit damage', Math.round(st.critMult * 100) + '%'],
    [p.cls === 'mage' ? 'Blink cooldown' : 'Roll cooldown', (st.rollCd + (p.cls === 'mage' ? 0.5 : 0.34)).toFixed(2) + 's'], ['Mana', `${Math.round(p.maxMana)} · regen ${Math.round(p.manaRegen * 100)}%`],
    ['Extra projectiles', st.extraShots], ['Bounces', st.bounce],
    ['Damage taken', st.hurtMult > 1 ? 'x' + st.hurtMult : 'normal'], ['Keys', p.keys],
  ];
  return rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
}
function fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// ===== Boot =====
Meta.load();
Render.init();
Input.init(Render.cv);
Menu.el = document.getElementById('menu');
Menu.el.addEventListener('pointerdown', () => Snd.init());
Menu.show('title');
requestAnimationFrame(t => Game.frame(t));
window.__emberdeep = { Game, World, Meta, Render };
