// ===== HUD =====
const HUD = {
  draw(c, dt) {
    const s = Render.dpr, W = innerWidth, H = innerHeight, p = World.players[0];
    c.setTransform(s, 0, 0, s, 0, 0);
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
    // items
    p.items.forEach((id, i) => { const it = ITEMS.find(x => x.id === id); itemIcon(c, it, pad + 11 + (i % 10) * 24, pad + 66 + Math.floor(i / 10) * 24, 10); });
    // weapons
    const bx = pad, by = H - pad - 64;
    p.weapons.forEach((w, i) => {
      const active = i === p.wi, y = active ? by : by - 46, h = active ? 62 : 40, ww = active ? 250 : 210;
      c.fillStyle = active ? 'rgba(20,14,38,0.85)' : 'rgba(20,14,38,0.6)'; roundRect(c, bx, y, ww, h, 10); c.fill();
      c.strokeStyle = active ? RARITY[w.rarity].c : 'rgba(120,100,180,0.5)'; c.lineWidth = active ? 2 : 1; c.stroke();
      weaponIcon(c, w, bx + 26, y + h / 2, active ? 30 : 22);
      c.textAlign = 'left'; c.fillStyle = RARITY[w.rarity].c; c.font = font(active ? 15 : 13, 800);
      c.fillText(fitText(c, w.name, ww - 60), bx + 50, y + (active ? 26 : 25));
      if (active) {
        c.fillStyle = 'rgba(233,228,255,0.65)'; c.font = font(12, 600);
        c.fillText(weaponLine(w), bx + 50, y + 45);
        if (w.type === 'bow' && p.charge > 0) { c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(bx + 50, y + 51, ww - 64, 4); c.fillStyle = p.charge >= 1 ? '#fff' : ELEM[w.elem].c; c.fillRect(bx + 50, y + 51, (ww - 64) * p.charge, 4); }
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
    if (k) {
      let title, line1, line2 = '', col;
      if (k.kind === 'chest') { title = 'Treasure Chest'; line1 = 'Open it'; col = '#ffd27a'; }
      else if (k.kind === 'item') { title = k.item.n; line1 = k.item.d; col = k.item.c; const sy = SYNERGIES.find(sy => sy.need.includes(k.item.id) && sy.need.some(n => p.items.includes(n)) && !p.syn.includes(sy.id)); if (sy) line2 = '✦ Completes synergy: ' + sy.n; }
      else { const w = k.w, cur = p.weapons[p.wi]; title = w.name; col = RARITY[w.rarity].c; line1 = `${RARITY[w.rarity].n} ${w.type} · ${weaponLine(w)}`; line2 = w.quirks.length ? w.quirks.map(q => QUIRKS.find(x => x.id === q).d).join(' · ') : WBASE[w.type].d; if (p.weapons.length >= 2) line2 = (line2 ? line2 + '   ' : '') + `(replaces ${cur.name})`; }
      const key = Input.last === 'touch' ? 'Tap TAKE' : Input.last === 'pad' ? 'X' : 'E';
      c.font = font(13, 600); const cw = Math.min(W - 40, Math.max(280, c.measureText(line1).width + 40, c.measureText(line2).width + 40));
      const x = (W - cw) / 2, y = H * 0.62;
      c.fillStyle = 'rgba(14,9,28,0.9)'; roundRect(c, x, y, cw, line2 ? 76 : 58, 10); c.fill(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
      c.textAlign = 'center'; c.fillStyle = col; c.font = font(16, 800); c.fillText(title, W / 2, y + 22);
      c.fillStyle = '#e9e4ff'; c.font = font(13, 600); c.fillText(fitText(c, line1, cw - 20), W / 2, y + 42);
      if (line2) { c.fillStyle = line2.startsWith('✦') ? '#7fffd4' : 'rgba(233,228,255,0.6)'; c.fillText(fitText(c, line2, cw - 20), W / 2, y + 62); }
      c.fillStyle = '#ffb057'; c.font = font(12, 800); c.fillText(key, W / 2, y + (line2 ? 92 : 74));
    }
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
    if (Input.last === 'touch') this.touch(c, W, H);
  },
  minimap(c, W, pad, font) {
    const m = 15, tb = Input.touchButtons().find(b => b.id === 'pause'), ox = W - pad - GRID * m - (Input.last === 'touch' ? tb.r * 2 + 8 : 0), oy = pad;
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
      if (r.type === 'treasure') { c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(x + s / 2, y + s / 2, 3, 0, TAU); c.fill(); }
    }
    c.textAlign = 'right'; c.fillStyle = 'rgba(233,228,255,0.6)'; c.font = font(12, 700);
    c.fillText(`${levelLabel(World.world, World.level)} · ${Game.seed}`, ox + GRID * m + 6, oy + GRID * m + 22);
    if (Game.secret) { c.fillStyle = '#7fffd4'; c.fillText(Game.secret.n, ox + GRID * m + 6, oy + GRID * m + 38); }
  },
  touch(c, W, H) {
    const max = Math.min(W, H) * 0.09;
    const stick = (st, hx, hy) => {
      const x = st ? st.ox : hx, y = st ? st.oy : hy;
      c.strokeStyle = `rgba(233,228,255,${st ? 0.35 : 0.12})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, max, 0, TAU); c.stroke();
      if (st) { const v = Input.stickVec(st, max); c.fillStyle = 'rgba(255,200,140,0.45)'; c.beginPath(); c.arc(x + v.x * max, y + v.y * max, max * 0.42, 0, TAU); c.fill(); }
    };
    stick(Input.sticks.L, W * 0.16, H * 0.6); stick(Input.sticks.R, W * 0.62, H * 0.62);
    for (const b of Input.touchButtons()) {
      if (b.id === 'use' && !World.near) continue;
      if (b.id === 'swap' && World.players[0].weapons.length < 2) continue;
      c.fillStyle = b.id === 'use' ? 'rgba(255,176,87,0.35)' : 'rgba(40,28,80,0.55)'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(233,228,255,0.4)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#f4eeff'; c.textAlign = 'center'; c.font = `800 ${Math.round(b.r * 0.42)}px ui-rounded, system-ui, sans-serif`;
      c.fillText({ roll: 'ROLL', swap: 'SWAP', use: 'TAKE', pause: 'II' }[b.id], b.x, b.y + b.r * 0.15);
    }
  },
};
function fitText(c, s, w) { if (c.measureText(s).width <= w) return s; while (s.length > 3 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
function weaponLine(w) {
  const dmg = Math.round(w.dmg), spd = (1 / w.cd).toFixed(1);
  const el = w.elem !== 'none' ? ' · ' + w.elem : '';
  if (w.type === 'spellbook') return `${SPELLS[w.spell].d} · ${dmg} dmg · ${spd}/s`;
  return w.type === 'bow' ? `${dmg} dmg · ${w.charge.toFixed(2)}s draw${el}` : `${dmg} dmg · ${spd}/s${el}`;
}

// ===== Game: state, runs, menus =====
const Game = {
  state: 'menu', seed: '', seedNum: 0, mods: {}, secret: null, hs: 0, runEmbers: 0, runTime: 0, bannerData: null, deadT: 0,
  hitstop(t) { this.hs = Math.max(this.hs, t); },
  banner(title, sub, dur = 2) { this.bannerData = { title, sub, dur, t: 0 }; },
  newRun(seedStr) {
    Snd.init();
    this.seed = normSeed(seedStr) || randomSeed();
    this.seedNum = strHash(this.seed);
    const sec = SECRETS[this.seedNum];
    this.secret = sec || null; this.mods = sec ? { ...sec.mods } : {};
    this.runEmbers = 0; this.runTime = 0; this.deadT = 0; this.hs = 0;
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
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000); this.last = ts;
    if (Input.pressed.has('escape') || Input.pressed.has('p')) this.togglePause();
    if (Input.pressed.has('m')) Snd.setMuted(!Meta.data.muted);
    let rdt = 0;
    if (this.state === 'play') {
      rdt = dt;
      if (this.hs > 0) { this.hs -= dt; rdt = dt * 0.15; }
      else { World.update(dt); this.runTime += dt; }
      if (this.deadT > 0) { this.deadT -= dt; if (this.deadT <= 0) this.end(false); }
    }
    if (World.map) Render.draw(rdt); else Menu.drawBg(dt);
    Input.endFrame();
    requestAnimationFrame(t => this.frame(t));
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
  on(id, fn) { const b = document.getElementById(id); if (b) b.onclick = () => { Snd.init(); Snd.play('ui'); fn(); }; },
  show(name) {
    const M = Meta.data, ctrl = matchMedia('(pointer:coarse)').matches
      ? 'Left thumb moves. Right thumb aims and attacks (hold to draw a bow, let go to fire).'
      : 'WASD move · Mouse aim · Click attack (hold to draw a bow) · Space or right-click roll · Q swap · E take · Esc pause · M mute';
    if (name === 'title') {
      Game.state = 'menu';
      this.html(`<h1>EMBERDEEP</h1><div class="sub">A tiny procedural dungeon. Every seed is a different descent.</div>
        <button class="btn" id="b-new">New Run</button>
        <button class="btn" id="b-seed">Enter a Seed</button>
        <div class="row"><button class="btn" id="b-saved">Saved Seeds</button><button class="btn" id="b-sanct">Sanctum · <span class="ember">${M.embers}</span></button></div>
        <button class="btn small" id="b-mute">${M.muted ? 'Sound: Off' : 'Sound: On'}</button>
        <div class="hint">${ctrl}<br>Rolling makes you untouchable. Swords swat shots out of the air.</div>`);
      this.on('b-new', () => Game.newRun());
      this.on('b-seed', () => this.show('seed'));
      this.on('b-saved', () => this.show('saved'));
      this.on('b-sanct', () => this.show('sanctum'));
      this.on('b-mute', () => { Snd.setMuted(!M.muted); this.show('title'); });
    } else if (name === 'seed') {
      this.html(`<h2>Enter a Seed</h2><div class="sub">Same seed, same dungeon. Some seeds hold secrets.</div>
        <input class="seed" id="seedin" maxlength="16" placeholder="${randomSeed()}" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button class="btn" id="b-go">Descend</button><button class="btn small" id="b-back">Back</button>`);
      const inp = document.getElementById('seedin'); setTimeout(() => inp.focus(), 50);
      inp.onkeydown = e => { if (e.key === 'Enter') Game.newRun(inp.value || inp.placeholder); };
      this.on('b-go', () => Game.newRun(inp.value || inp.placeholder));
      this.on('b-back', () => this.show('title'));
    } else if (name === 'saved') {
      const rows = M.seeds.map((s, i) => `<div class="card"><div class="grow"><b>${s.seed}</b>${s.secret ? ` <span class="secret">· ${s.secret}</span>` : ''}<small>${s.won ? 'Escaped' : 'Reached ' + (s.level || 'floor ' + s.floor)} · ${s.date}</small></div><button class="btn" id="play-${i}">Play</button><button class="btn" id="del-${i}">✕</button></div>`).join('');
      this.html(`<h2>Saved Seeds</h2><div class="list">${rows || '<div class="sub">No saved seeds yet. Save one from the pause menu or after a run.</div>'}</div><button class="btn small" id="b-back">Back</button>`);
      M.seeds.forEach((s, i) => { this.on('play-' + i, () => Game.newRun(s.seed)); this.on('del-' + i, () => { M.seeds.splice(i, 1); Meta.save(); this.show('saved'); }); });
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
      const items = p.items.map(id => ITEMS.find(x => x.id === id)).map(it => `<div class="card"><div class="grow"><b style="color:${it.c}">${it.n}</b><small>${it.d}</small></div></div>`).join('');
      const syn = p.syn.map(id => SYNERGIES.find(s => s.id === id)).map(s => `<div class="card"><div class="grow"><b class="secret">✦ ${s.n}</b><small>${s.d}</small></div></div>`).join('');
      this.html(`<h2>Paused</h2><div class="sub">Seed <b>${Game.seed}</b> · Level ${levelLabel(World.world, World.level)} · ${fmtTime(Game.runTime)}</div>
        <div class="list">${syn}${items || '<div class="sub">No items yet.</div>'}</div>
        <button class="btn" id="b-res">Resume</button>
        <div class="row"><button class="btn small" id="b-save">Save Seed</button><button class="btn small" id="b-mute">${M.muted ? 'Sound: Off' : 'Sound: On'}</button></div>
        <button class="btn small" id="b-quit">Abandon Run</button>`);
      this.on('b-res', () => Game.togglePause());
      this.on('b-save', () => { Game.saveSeed(); document.getElementById('b-save').textContent = 'Saved ✓'; });
      this.on('b-mute', () => { Snd.setMuted(!M.muted); document.getElementById('b-mute').textContent = M.muted ? 'Sound: Off' : 'Sound: On'; });
      this.on('b-quit', () => { Game.end(false); });
    } else if (name === 'dead' || name === 'win') {
      const p = World.players[0], won = name === 'win';
      this.html(`<h1 style="font-size:clamp(36px,7vw,60px)">${won ? 'ESCAPED' : 'FALLEN'}</h1>
        <div class="sub">${won ? 'You climbed out of the deep. It will be waiting.' : `Lost on level ${levelLabel(World.world, World.level)}, ${World.theme.n}.`}</div>
        <div class="stats"><span>Seed</span><span>${Game.seed}</span><span>Level reached</span><span>${levelLabel(World.world, World.level)}</span><span>Time</span><span>${fmtTime(Game.runTime)}</span><span>Foes slain</span><span>${p.kills}</span><span>Items</span><span>${p.items.length}</span><span>Embers banked</span><span class="ember">+${Game.runEmbers}</span></div>
        <button class="btn" id="b-again">Same Seed Again</button>
        <button class="btn" id="b-new">New Seed</button>
        <div class="row"><button class="btn small" id="b-save">Save Seed</button><button class="btn small" id="b-sanct">Sanctum · ${M.embers} ◆</button></div>
        <button class="btn small" id="b-title">Title</button>`);
      this.on('b-again', () => Game.newRun(Game.seed));
      this.on('b-new', () => Game.newRun());
      this.on('b-save', () => { Game.saveSeed(); document.getElementById('b-save').textContent = 'Saved ✓'; });
      this.on('b-sanct', () => { World.map = null; this.show('sanctum'); });
      this.on('b-title', () => { World.map = null; this.show('title'); });
    }
  },
};
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
