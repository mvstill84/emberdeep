// ===== Developer mode =====
// Type the phrase into the seed box to switch it on. Dev mode runs on its own sandbox save
// (a copy of your real one), so nothing you do here touches your real heroes or embers.
const DEV_HASH = strHash('POWEROVERWHELMIN'); // the seed box keeps 16 letters
const Dev = {
  on: false,
  opt: { god: false, oneHit: false, mana: false, dmgNums: false, hitboxes: false, stats: false, speed: 1 },
  run: { mode: 'quick', cls: 'fighter', hero: 0, world: 1, level: 1, boss: '', atBoss: false, keepLoad: true,
    w: [{ type: 'sword', rarity: 2, elem: '', spell: '' }, { type: 'bow', rarity: 2, elem: '', spell: '' }], relic: '', potion: '', items: [] },
  init() {
    try {
      this.on = localStorage.getItem('emberdeep.devmode') === '1';
      Object.assign(this.opt, JSON.parse(localStorage.getItem('emberdeep.devopt') || '{}'));
      Object.assign(this.run, JSON.parse(localStorage.getItem('emberdeep.devrun') || '{}'));
    } catch (e) { }
  },
  saveOpt() { try { localStorage.setItem('emberdeep.devopt', JSON.stringify(this.opt)); localStorage.setItem('emberdeep.devrun', JSON.stringify(this.run)); } catch (e) { } },
  isCode(s) { return strHash(normSeed(s)) === DEV_HASH; },
  enter() {
    try { if (!localStorage.getItem('emberdeep.dev')) localStorage.setItem('emberdeep.dev', localStorage.getItem('emberdeep.v1') || '{}'); localStorage.setItem('emberdeep.devmode', '1'); } catch (e) { }
    location.reload();
  },
  exit() { try { localStorage.removeItem('emberdeep.devmode'); } catch (e) { } location.reload(); },
  resetSandbox() { try { localStorage.setItem('emberdeep.dev', localStorage.getItem('emberdeep.v1') || '{}'); } catch (e) { } location.reload(); },
  active(k) { return this.on && this.opt[k] && !(typeof Coop !== 'undefined' && Coop.on); }, // dev cheats are solo only

  weapon(s) {
    const w = makeWeapon(RNG((Math.random() * 1e9) | 0), { type: s.type, rarity: +s.rarity, elem: s.elem || undefined, spell: s.spell || undefined });
    return w;
  },
  allBosses() { const out = []; for (let w = 1; w <= WORLD_COUNT; w++) for (const B of WORLDS[w].bosses) out.push({ w, id: B.id, n: B.title }); return out; },

  // ---------- starting a test run ----------
  start() {
    const R = this.run; this.saveOpt();
    Game.devBoss = R.boss || null;
    if (R.boss) { const b = this.allBosses().find(b => b.id === R.boss); if (b) { R.world = b.w; R.level = 3; } }
    const w = +R.world, l = +R.level;
    if (R.mode === 'campaign' && Campaign.hero(+R.hero)) Campaign.start(+R.hero, w, false);
    else Game.newRun(randomSeed(), R.cls, { world: w });
    if (l > 1) World.startLevel(w, l, true);
    const p = World.players[0];
    if (R.mode !== 'campaign' || !R.keepLoad) {
      const ws = R.w.filter(s => s.type).map(s => this.weapon(s)); if (ws.length) { p.weapons = ws; p.wi = 0; }
      p.relic = R.relic || null; p.potion = R.potion || null;
    }
    for (const id of R.items) { const it = ITEMS.find(x => x.id === id); if (it) World.giveItem(p, it); }
    World.recalc(p);
    if (R.atBoss && l === 3) this.toBoss();
  },
  toBoss() {
    const r = World.rooms.find(r => r.type === 'boss' || r.type === 'exit'), p = World.players[0]; if (!r) return;
    const s = World.freeSpot(r.mx * T + T / 2, (r.my + 4) * T + T / 2); p.x = s.x; p.y = s.y;
  },

  // ---------- in-run helpers ----------
  killRoom() { const p = World.players[0]; for (const e of World.enemies) if (!e.dead && !e.boss) World.damage(e, 1e9, { x: e.x, y: e.y, p, blunt: true }); for (const r of World.rooms) if (r === World.room && r.waves) r.waves.length = 0; },
  killBoss() { const b = World.boss; if (b && !b.dead) { b.phase = 9; World.damage(b, 1e9, { x: b.x, y: b.y, p: World.players[0], blunt: true }); } },
  revealMap() { for (const r of World.rooms) { r.known = true; r.visited = true; } },
  nextLevel() { const w = World.world, l = World.level; if (l < 3) World.startLevel(w, l + 1, true); else if (w < WORLD_COUNT) World.startLevel(w + 1, 1, true); },
  heal() { const p = World.players[0]; p.hp = p.maxHp; p.mana = p.maxMana; p.exhausted = false; },
  spawn(type) { const p = World.players[0], a = Math.random() * TAU, s = World.freeSpot(p.x + Math.cos(a) * 140, p.y + Math.sin(a) * 140), e = World.makeEnemy(type, s.x, s.y); World.enemies.push(e); },
  dropWeapon(s) { const p = World.players[0]; World.pickups.push({ kind: 'weapon', w: this.weapon(s), x: p.x + 40, y: p.y, t: 0 }); },

  // ---------- menus ----------
  sel(id, opts, val) { return `<select class="dsel" id="${id}">${opts.map(([v, n]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${n}</option>`).join('')}</select>`; },
  bindSel(id, fn) { const el = document.getElementById(id); if (el) el.onchange = () => fn(el.value); },
  check(id, label, on) { return `<label class="dchk"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`; },
  bindCheck(id, fn) { const el = document.getElementById(id); if (el) el.onchange = () => fn(el.checked); },
  wOpts() { return Object.keys(WBASE).map(t => [t, t]); },
  rOpts() { return RARITY.map((r, i) => [i, r.n]); },
  eOpts() { return [['', 'any element'], ...Object.keys(ELEM).map(k => [k, k])]; },
  sOpts() { return [['', 'any spell'], ...Object.keys(SPELLS).map(k => [k, SPELLS[k].n])]; },
  builder(pre, s) {
    return `<div class="drow">${this.sel(pre + 't', [['', '(none)'], ...this.wOpts()], s.type)}${this.sel(pre + 'r', this.rOpts(), s.rarity)}${s.type === 'spellbook' ? this.sel(pre + 's', this.sOpts(), s.spell) : this.sel(pre + 'e', this.eOpts(), s.elem)}</div>`;
  },
  bindBuilder(pre, s, redraw) {
    this.bindSel(pre + 't', v => { s.type = v; redraw(); }); this.bindSel(pre + 'r', v => s.rarity = +v);
    this.bindSel(pre + 'e', v => s.elem = v); this.bindSel(pre + 's', v => s.spell = v);
  },
  toggles() {
    const o = this.opt;
    return `<div class="dgrid">${this.check('o-god', 'God mode', o.god)}${this.check('o-one', 'One-hit kills', o.oneHit)}${this.check('o-mana', 'Endless mana', o.mana)}${this.check('o-dmg', 'Damage numbers', o.dmgNums)}${this.check('o-hit', 'Hitboxes', o.hitboxes)}${this.check('o-stats', 'Stats overlay', o.stats)}</div>
      <div class="drow">Game speed ${this.sel('o-speed', [[0.1, '0.1×'], [0.25, '0.25×'], [0.5, '0.5×'], [1, '1×'], [2, '2×']], o.speed)}</div>`;
  },
  bindToggles() {
    const o = this.opt, s = () => this.saveOpt();
    this.bindCheck('o-god', v => { o.god = v; s(); }); this.bindCheck('o-one', v => { o.oneHit = v; s(); }); this.bindCheck('o-mana', v => { o.mana = v; s(); });
    this.bindCheck('o-dmg', v => { o.dmgNums = v; s(); }); this.bindCheck('o-hit', v => { o.hitboxes = v; s(); }); this.bindCheck('o-stats', v => { o.stats = v; s(); });
    this.bindSel('o-speed', v => { o.speed = +v; s(); });
  },
  menu() {
    const M = Meta.data, R = this.run, heroes = (Campaign.data().slots || []).map((h, i) => h ? [i, `${h.name} · Lv ${h.lvl} ${CLASSES[h.cls].n}`] : null).filter(Boolean);
    const worlds = Array.from({ length: WORLD_COUNT }, (_, i) => [i + 1, `${i + 1} · ${WORLDS[i + 1].n}`]);
    const bosses = [['', '(random)'], ...this.allBosses().map(b => [b.id, `${b.w}-3 · ${b.n}`])];
    const itemChecks = ITEMS.map(it => this.check('it-' + it.id, `<span style="color:${it.c}">${it.n}</span>`, R.items.includes(it.id))).join('');
    const camp = R.mode === 'campaign';
    Menu.html(`<h2 style="color:#ff6bd5">Developer Mode</h2><div class="sub">Sandbox save. Your real progress is untouched.</div>
      <div class="dsec">Test run</div>
      <div class="drow">${this.sel('r-mode', [['quick', 'Quick play'], ['campaign', 'Campaign hero']], R.mode)}${camp ? (heroes.length ? this.sel('r-hero', heroes, R.hero) : '<small>No heroes yet. Make one in Campaign.</small>') : this.sel('r-cls', Object.keys(CLASSES).map(k => [k, CLASSES[k].n]), R.cls)}</div>
      <div class="drow">${this.sel('r-world', worlds, R.world)}${this.sel('r-level', [[1, 'Level 1'], [2, 'Level 2'], [3, 'Level 3']], R.level)}</div>
      <div class="drow">Boss ${this.sel('r-boss', bosses, R.boss)} ${this.check('r-atboss', 'Start at the boss', R.atBoss)}</div>
      ${camp ? this.check('r-keep', "Use the hero's own loadout", R.keepLoad) : ''}
      ${camp && R.keepLoad ? '' : `<div class="sub" style="margin:8px 0 2px">Weapons</div>${this.builder('w0', R.w[0])}${this.builder('w1', R.w[1])}
      <div class="drow">${this.sel('r-relic', [['', 'No relic'], ...RELICS.map(r => [r.id, r.n])], R.relic)}${this.sel('r-potion', [['', 'No potion'], ...POTIONS.map(r => [r.id, r.n])], R.potion)}</div>`}
      <div class="sub" style="margin:8px 0 2px">Items</div><div class="dgrid">${itemChecks}</div>
      <button class="btn" id="d-go">Start test run</button>
      <div class="dsec">Cheats and overlays</div>${this.toggles()}
      <div class="dsec">Progress (sandbox)</div>
      <div class="row"><button class="btn small" id="d-emb">Quick-play embers +100k</button><button class="btn small" id="d-unl">Unlock everything</button></div>
      ${heroes.length ? `<div class="drow">${this.sel('h-pick', heroes, R.hero)} Level <input class="dnum" id="h-lvl" type="number" min="1" max="30" value="${(Campaign.hero(+R.hero) || {}).lvl || 1}"> Cleared ${this.sel('h-clr', Array.from({ length: WORLD_COUNT + 1 }, (_, i) => [i, i ? 'thru ' + i : 'none']), (Campaign.hero(+R.hero) || {}).cleared || 0)}</div>
      <div class="row"><button class="btn small" id="h-set">Apply to hero</button><button class="btn small" id="h-emb">Hero embers +100k</button><button class="btn small" id="h-gear">Stash 5 random Rares</button></div>` : ''}
      <div class="dsec">Sandbox</div>
      <div class="row"><button class="btn small" id="d-reset">Reset sandbox from real save</button><button class="btn small" id="d-exit">Leave dev mode</button></div>
      <button class="btn small" id="b-back">Back</button>`);
    const redraw = () => { this.saveOpt(); this.menu(); };
    this.bindSel('r-mode', v => { R.mode = v; redraw(); }); this.bindSel('r-hero', v => { R.hero = +v; redraw(); }); this.bindSel('r-cls', v => R.cls = v);
    this.bindSel('r-world', v => { R.world = +v; R.boss = ''; redraw(); }); this.bindSel('r-level', v => R.level = +v);
    this.bindSel('r-boss', v => { R.boss = v; const b = this.allBosses().find(b => b.id === v); if (b) { R.world = b.w; R.level = 3; } redraw(); });
    this.bindCheck('r-atboss', v => R.atBoss = v); this.bindCheck('r-keep', v => { R.keepLoad = v; redraw(); });
    this.bindBuilder('w0', R.w[0], redraw); this.bindBuilder('w1', R.w[1], redraw);
    this.bindSel('r-relic', v => R.relic = v); this.bindSel('r-potion', v => R.potion = v);
    for (const it of ITEMS) this.bindCheck('it-' + it.id, v => { R.items = R.items.filter(x => x !== it.id); if (v) R.items.push(it.id); });
    this.bindToggles();
    Menu.on('d-go', () => this.start());
    Menu.on('d-emb', () => { M.embers += 100000; Meta.save(); redraw(); });
    Menu.on('d-unl', () => { for (const u of UNLOCKS) M.unlocks[u.id] = 1; for (const h of Campaign.data().slots || []) if (h) for (const u of UNLOCKS) h.unlocks[u.id] = 1; Meta.save(); redraw(); });
    this.bindSel('h-pick', v => { R.hero = +v; redraw(); });
    Menu.on('h-set', () => { const h = Campaign.hero(+R.hero); if (!h) return; h.lvl = clamp(+document.getElementById('h-lvl').value || 1, 1, 30); h.xp = 0; h.cleared = +document.getElementById('h-clr').value; Meta.save(); redraw(); });
    Menu.on('h-emb', () => { const h = Campaign.hero(+R.hero); if (h) { h.embers += 100000; Meta.save(); redraw(); } });
    Menu.on('h-gear', () => { const h = Campaign.hero(+R.hero); if (!h) return; for (let i = 0; i < 5; i++) h.stash.weapons.push(this.weapon({ type: pickWeaponType(RNG((Math.random() * 1e9) | 0)), rarity: 2 })); Meta.save(); redraw(); });
    Menu.on('d-reset', () => this.resetSandbox()); Menu.on('d-exit', () => this.exit());
    Menu.on('b-back', () => Menu.show('title'));
  },
  // the dev panel on the pause screen
  pausePanel() {
    if (!this.on || Coop.on) return '';
    this.pw = this.pw || { type: 'axe', rarity: 3, elem: '', spell: '' };
    const foes = Object.keys(EDEF).filter(k => !['crystal', 'banner', 'boss'].includes(k));
    return `<div class="dsec" style="color:#ff6bd5">Developer</div>
      <div class="row"><button class="btn small" id="dv-kill">Kill room</button><button class="btn small" id="dv-boss">Kill boss</button><button class="btn small" id="dv-heal">Full heal</button></div>
      <div class="row"><button class="btn small" id="dv-map">Reveal map</button><button class="btn small" id="dv-goboss">To boss room</button><button class="btn small" id="dv-next">Next level</button></div>
      <div class="drow">${this.sel('dv-foe', foes.map(k => [k, EDEF[k].n]), this.lastFoe || 'goblin')}<button class="btn small" id="dv-spawn" style="width:auto;margin:0">Spawn</button></div>
      <div class="drow">${this.sel('dv-item', ITEMS.map(it => [it.id, it.n]), this.lastItem || ITEMS[0].id)}<button class="btn small" id="dv-give" style="width:auto;margin:0">Give item</button></div>
      ${this.builder('dvw', this.pw)}<button class="btn small" id="dv-wpn">Drop this weapon at my feet</button>
      <div class="drow">${this.sel('dv-relic', RELICS.map(r => [r.id, r.n]), '')}<button class="btn small" id="dv-rel" style="width:auto;margin:0">Equip relic</button>${this.sel('dv-pot', POTIONS.map(r => [r.id, r.n]), '')}<button class="btn small" id="dv-potb" style="width:auto;margin:0">Take potion</button></div>
      ${this.toggles()}`;
  },
  bindPause() {
    if (!this.on || Coop.on) return;
    const p = World.players[0], again = () => Menu.show('pause');
    Menu.on('dv-kill', () => { this.killRoom(); Game.togglePause(); });
    Menu.on('dv-boss', () => { this.killBoss(); Game.togglePause(); });
    Menu.on('dv-heal', () => { this.heal(); again(); });
    Menu.on('dv-map', () => { this.revealMap(); Game.togglePause(); });
    Menu.on('dv-goboss', () => { this.toBoss(); Game.togglePause(); });
    Menu.on('dv-next', () => { this.nextLevel(); Game.togglePause(); });
    this.bindSel('dv-foe', v => this.lastFoe = v); this.bindSel('dv-item', v => this.lastItem = v);
    Menu.on('dv-spawn', () => { this.spawn(document.getElementById('dv-foe').value); Game.togglePause(); });
    Menu.on('dv-give', () => { const it = ITEMS.find(x => x.id === document.getElementById('dv-item').value); if (it) World.giveItem(p, it); again(); });
    this.bindBuilder('dvw', this.pw, again);
    Menu.on('dv-wpn', () => { this.dropWeapon(this.pw); Game.togglePause(); });
    Menu.on('dv-rel', () => { p.relic = document.getElementById('dv-relic').value; p.relicCd = 0; World.recalc(p); again(); });
    Menu.on('dv-potb', () => { p.potion = document.getElementById('dv-pot').value; again(); });
    this.bindToggles();
  },

  // ---------- overlays ----------
  drawWorld(c) { // hitboxes, in world space
    if (!this.active('hitboxes')) return;
    c.lineWidth = 1.5;
    const circ = (x, y, r, col) => { c.strokeStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); };
    for (const t of World.traps) circ(t.x, t.y, t.r * 0.85, 'rgba(255,220,80,0.8)');
    for (const e of World.enemies) if (!e.dead) circ(e.x, e.y, e.r, 'rgba(255,80,80,0.9)');
    for (const pr of World.projs) circ(pr.x, pr.y, pr.r || 4, pr.owner === 'p' ? 'rgba(80,200,255,0.9)' : 'rgba(255,120,200,0.9)');
    for (const p of World.players) if (!p.dead) { circ(p.x, p.y, p.r, 'rgba(80,255,120,0.95)'); const w = p.weapons[p.wi]; if (w && w.reach) { c.strokeStyle = 'rgba(80,255,120,0.35)'; c.beginPath(); c.moveTo(p.x, p.y); c.arc(p.x, p.y, w.reach, p.aim - w.arc / 2, p.aim + w.arc / 2); c.closePath(); c.stroke(); } }
  },
  fps: 60,
  drawHud(c, W, H, font, dt) {
    if (!this.on) return;
    c.textAlign = 'right'; c.font = font(11, 800); c.fillStyle = '#ff6bd5';
    const tags = ['DEV', this.opt.god && 'GOD', this.opt.oneHit && '1HIT', this.opt.mana && 'MANA', this.opt.speed !== 1 && this.opt.speed + '×'].filter(Boolean).join(' · ');
    c.fillText(tags, W - 12, H - 12);
    if (!this.opt.stats) return;
    if (dt > 0) this.fps = lerp(this.fps, 1 / dt, 0.05);
    const p = World.players[0], b = World.boss, r = World.room;
    const lines = [
      `${Math.round(this.fps)} fps · ${World.enemies.filter(e => !e.dead).length} foes · ${World.projs.length} shots · ${World.parts.length} parts`,
      `room ${r ? r.id + ' ' + r.type : '-'} · traps ${World.traps.length} · depth ${World.depth}`,
      p ? `hp ${p.hp}/${p.maxHp} · mana ${Math.floor(p.mana)}/${p.maxMana} · dmg ×${p.st.dmg.toFixed(2)} · rate ×${p.st.rate.toFixed(2)} · speed ${Math.round(p.st.speed)}` : '',
      b && !b.dead ? `boss ${b.B.id} · phase ${b.phase} · ${b.state || 'idle'} · ${Math.round(b.hp)}/${Math.round(b.maxHp)} (${Math.round(b.hp / b.maxHp * 100)}%)` : '',
    ].filter(Boolean);
    c.font = font(11, 700);
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + 16, y0 = H - 30 - lines.length * 15;
    c.fillStyle = 'rgba(10,6,20,0.75)'; roundRect(c, W - w - 8, y0 - 14, w, lines.length * 15 + 8, 6); c.fill();
    c.fillStyle = '#e8dcff'; lines.forEach((l, i) => c.fillText(l, W - 16, y0 + i * 15));
  },
};
