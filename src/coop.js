// ===== Co-op =====
// The host runs the real game. Guests send their controls and draw what the host sends back.
// Maps come from the seed, so only the moving parts travel: players, foes, shots, loot, hazards.
const Coop = {
  on: false, host: false, slot: 0, inRun: false,
  lobby: [],          // [{ slot, cls, unl }]
  pending: [],        // players who joined mid-run, added at the next level
  inputs: {},         // host: latest controls per guest slot
  seen: {},           // host: press counters already used, per slot
  ev: [], sendT: 0, tileT: 0, lastMap: null, lastThp: '',
  cnt: { roll: 0, swap: 0, use: 0, bag: 0, potion: 0, relic: 0 }, inT: 0,
  ents: new Map(),    // guest: replicated foes by id
  pausedBy: '',

  // ---------- connecting ----------
  home() {
    this.reset();
    NetTest.onDone = () => this.lobbyScreen();
    Menu.html(`<h2>Co-op</h2><div class="sub">Up to 3 players, each on their own device, on the same WiFi. One device hosts. A PC or iPad makes the steadiest host.</div>
      <button class="btn" id="c-host">Host a game</button>
      <div class="drow" style="justify-content:center"><input class="seed" id="c-code" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" style="width:140px;text-align:center"><button class="btn" id="c-join" style="width:auto;margin:0">Join</button></div>
      <div class="sub" style="margin-top:14px">No internet? Join the same WiFi and pass QR codes between screens.</div>
      <div class="row"><button class="btn small" id="c-qhost">Host with QR</button><button class="btn small" id="c-qjoin">Join with QR</button></div>
      <div class="sub" id="c-msg" style="min-height:1.2em;color:#ff8a9a"></div>
      <div class="row"><button class="btn small" id="c-test">Connection test</button><button class="btn small" id="b-back">Back</button></div>`);
    const msg = t => { const el = document.getElementById('c-msg'); if (el) el.textContent = t; };
    Menu.on('c-host', async () => { msg(''); this.startHosting(); if (await Net.host()) this.lobbyScreen(); else { msg(Net.status); this.reset(); } });
    const join = async () => { const c = (document.getElementById('c-code').value || '').trim(); if (c.length !== 4) { msg('Room codes are 4 letters'); return; } this.startGuest(); if (await Net.join(c)) this.lobbyScreen(); else msg(Net.status); };
    Menu.on('c-join', join);
    document.getElementById('c-code').onkeydown = e => { if (e.key === 'Enter') join(); };
    Menu.on('c-qhost', () => { NetTest.qrMode = true; this.startHosting(); Net.reset(); Net.role = 'host'; Net.mySlot = 0; Net.code = 'QR'; this.lobbyScreen(); });
    Menu.on('c-qjoin', () => { NetTest.qrMode = true; this.startGuest(); NetTest.qrJoin(); });
    Menu.on('c-test', () => { NetTest.onDone = null; NetTest.home(); });
    Menu.on('b-back', () => { this.reset(); Menu.show('title'); });
  },
  reset() {
    Net.reset(); NetTest.stop();
    this.on = false; this.host = false; this.slot = 0; this.inRun = false; this.lobby = []; this.pending = []; this.inputs = {}; this.seen = {};
    this.ents = new Map(); this.ev = []; Game.coopN = 1; Meta.over = null;
  },
  startHosting() {
    this.reset(); this.on = true; this.host = true; this.slot = 0;
    this.lobby = [{ slot: 0, cls: null }];
    Net.onMsg = (peer, m) => this.hostMsg(peer, m);
    Net.onChange = () => this.hostPeersChanged();
  },
  startGuest() {
    this.reset(); this.on = true; this.host = false;
    Net.onMsg = (peer, m) => this.guestMsg(m);
    Net.onChange = () => this.guestPeersChanged();
  },
  myUnl() { return Object.assign({}, Meta.data.unlocks); },
  classOk(cls, unl) { return !!CLASSES[cls]; }, // every class is open in co-op, so nobody gets locked out by the no-repeats rule

  // ---------- lobby ----------
  lobbyScreen() {
    if (!this.on) return this.home();
    Net.onMsg = this.host ? (peer, m) => this.hostMsg(peer, m) : (peer, m) => this.guestMsg(m);
    Net.onChange = this.host ? () => this.hostPeersChanged() : () => this.guestPeersChanged();
    const me = this.lobby.find(l => l.slot === this.slot);
    const connected = this.host || (Net.peers[0] && Net.peers[0].open && this.lobby.length);
    const head = this.host ? (Net.code && Net.code !== 'QR' ? `Room code <b style="font-size:28px;letter-spacing:.14em;color:#ffb057">${Net.code}</b>` : 'QR room') : connected ? 'Connected to the host' : (Net.status || 'Connecting…');
    const rows = [0, 1, 2].map(s => {
      const l = this.lobby.find(x => x.slot === s);
      return `<div class="card"><div class="grow"><b style="color:${PCOL[s]}">P${s + 1}${s === 0 ? ' · host' : ''}${s === this.slot ? ' (you)' : ''}</b><small>${l ? (l.cls ? CLASSES[l.cls].n : 'choosing a class…') : 'open'}</small></div></div>`;
    }).join('');
    const taken = new Set(this.lobby.filter(l => l.slot !== this.slot && l.cls).map(l => l.cls));
    const unl = this.myUnl();
    const picks = connected ? Object.keys(CLASSES).map(k => {
      const lock = false, tk = taken.has(k), sel = me && me.cls === k;
      return `<button class="btn small" id="cl-${k}" ${lock || tk ? 'disabled' : ''} style="${sel ? 'border-color:' + PCOL[this.slot] + ';color:#fff' : ''}">${CLASSES[k].n}${tk ? ' · taken' : lock ? ' · locked' : ''}</button>`;
    }).join('') : '';
    const ready = this.lobby.length > 0 && this.lobby.every(l => l.cls);
    Menu.html(`<h2>Co-op Lobby</h2><div class="sub">${head}${this.inRun && !this.host ? '<br>A run is underway. You\'ll join at the next level.' : ''}</div>
      <div class="list">${rows}</div>
      ${connected ? `<div class="sub" style="margin-top:10px">Pick your class. No repeats: first come, first served.</div><div class="row" style="flex-wrap:wrap">${picks}</div>` : ''}
      ${this.host ? `<button class="btn" id="c-start" ${ready ? '' : 'disabled'}>${ready ? 'Start the run' : 'Waiting for everyone to pick'}</button>` : `<div class="sub">${connected ? (this.inRun ? 'Waiting for the next level…' : 'Waiting for the host to start…') : ''}</div>`}
      <div class="row">${this.host && NetTest.qrMode ? '<button class="btn small" id="c-inv">Invite with QR</button>' : ''}<button class="btn small" id="c-leave">Leave</button></div>`);
    for (const k of Object.keys(CLASSES)) Menu.on('cl-' + k, () => this.pick(k));
    Menu.on('c-start', () => this.hostStart());
    Menu.on('c-inv', () => NetTest.qrInvite());
    Menu.on('c-leave', () => { this.reset(); Menu.show('title'); });
  },
  pick(cls) {
    if (this.host) { this.assign(0, cls); }
    else if (Net.peers[0]) Net.send(Net.peers[0], { t: 'pick', cls });
  },
  // host: the lobby is the source of truth
  assign(slot, cls) {
    const l = this.lobby.find(x => x.slot === slot); if (!l) return;
    if (this.lobby.some(x => x.slot !== slot && x.cls === cls)) return; // taken
    if (!this.classOk(cls, slot === 0 ? this.myUnl() : l.unl)) return;
    l.cls = cls; this.pushLobby();
  },
  pushLobby() {
    const list = this.lobby.map(l => ({ slot: l.slot, cls: l.cls }));
    Net.broadcast({ t: 'lobby', list, inRun: this.inRun });
    if (!this.inRun || Game.state === 'menu') { if (document.querySelector('#c-start') || !this.inRun) this.lobbyScreen(); }
  },
  hostPeersChanged() {
    for (const p of Net.peers) if (p.open && !this.lobby.some(l => l.slot === p.slot)) this.lobby.push({ slot: p.slot, cls: null, unl: {} });
    const gone = this.lobby.filter(l => l.slot !== 0 && !Net.peers.some(p => p.slot === l.slot && p.open));
    if (gone.length) {
      this.lobby = this.lobby.filter(l => !gone.includes(l));
      this.pending = this.pending.filter(l => !gone.some(g => g.slot === l.slot));
      if (this.inRun) for (const g of gone) { const pl = World.players.find(p => p.slot === g.slot); if (pl) { pl.gone = true; World.players = World.players.filter(p => p !== pl); Game.banner('', `P${g.slot + 1} left the game`, 1.6); } }
    }
    if (this.inRun) { Net.broadcast({ t: 'lobby', list: this.lobby.map(l => ({ slot: l.slot, cls: l.cls })), inRun: true }); }
    else this.pushLobby();
  },
  guestPeersChanged() {
    const p = Net.peers[0];
    if (this.inRun && (!p || !p.open) && Game.state !== 'menu') { this.lostHost(); return; }
    if (!this.inRun && document.querySelector('.panel h2') && /Lobby/.test(document.querySelector('.panel h2').textContent)) this.lobbyScreen();
  },
  lostHost() {
    this.reset(); Game.state = 'menu'; World.map = null;
    Menu.html(`<h2>Lost the host</h2><div class="sub">The host's game closed or the connection dropped.</div><button class="btn" id="b-back">Back to the title</button>`);
    Menu.on('b-back', () => Menu.show('title'));
  },

  // ---------- host: messages from guests ----------
  hostMsg(peer, m) {
    const slot = peer.slot;
    if (m.t === 'hello') { const l = this.lobby.find(x => x.slot === slot); if (l) l.unl = m.unl || {}; this.pushLobby(); }
    else if (m.t === 'pick') {
      this.assign(slot, m.cls);
      if (this.inRun) { const l = this.lobby.find(x => x.slot === slot); if (l && l.cls && !this.pending.some(q => q.slot === slot) && !World.players.some(q => q.slot === slot)) this.pending.push(l); }
    }
    else if (m.t === 'in') this.inputs[slot] = m;
    else if (m.t === 'drop') { const pl = World.players.find(p => p.slot === slot); if (pl && pl.items[m.i] !== undefined) World.dropItem(pl, m.i); }
    else if (m.t === 'pause') { if (Game.state === 'play') { this.pausedBy = 'P' + (slot + 1); Game.togglePause(); } }
    else if (m.t === 'resume') { if (Game.state === 'pause') Game.togglePause(); }
  },
  netInput(slot) {
    const m = this.inputs[slot], out = { mx: 0, my: 0, aim: null, attack: false, roll: false, swap: false, use: false, useHeld: false, bag: false, potion: false, relic: false, device: 'net' };
    if (!m) return out;
    out.mx = clamp(+m.mx || 0, -1, 1); out.my = clamp(+m.my || 0, -1, 1);
    out.aim = m.aim === null || m.aim === undefined ? null : +m.aim; out.attack = !!m.atk; out.autoAim = !!m.auto; out.assist = !!m.as; out.useHeld = !!m.uh;
    out.device = m.dev || 'net';
    const seen = this.seen[slot] || (this.seen[slot] = {});
    ['roll', 'swap', 'use', 'bag', 'potion', 'relic'].forEach((k, i) => { const c = (m.c || [])[i] || 0; if (c > (seen[k] || 0)) { out[k] = true; seen[k] = c; } });
    return out;
  },

  // ---------- host: running the game ----------
  hostStart() {
    if (!this.lobby.every(l => l.cls)) return;
    const seed = randomSeed();
    this.inRun = true; this.pausedBy = '';
    Game.coopN = this.lobby.length;
    Game.newRun(seed, this.lobby.find(l => l.slot === 0).cls);
    for (const l of this.lobby) if (l.slot !== 0) this.addPlayer(l);
    World.startLevel(World.world, World.level, true); // place everyone and tell the guests
  },
  addPlayer(l) {
    const keepCls = Game.cls;
    Game.cls = l.cls; Meta.over = l.unl || {};
    try { const p = World.makePlayer(l.slot); p.src = 'net' + l.slot; World.players.push(p); }
    finally { Game.cls = keepCls; Meta.over = null; }
    World.players.sort((a, b) => a.slot - b.slot);
  },
  onLevelStart() { // host: called right after a level is built
    if (!this.on || !this.host) return;
    for (const l of this.pending) if (!World.players.some(p => p.slot === l.slot)) this.addPlayer(l);
    if (this.pending.length) { Game.coopN = Math.max(Game.coopN, World.players.length); this.pending = []; const s = World.rooms[0]; World.players.forEach((p, i) => { p.x = s.mx * T + T / 2 + (i - (World.players.length - 1) / 2) * 30; p.y = s.my * T + T / 2; }); }
    this.lastMap = Uint8Array.from(World.map); this.lastThp = '';
    Net.broadcast({ t: 'level', seed: Game.seed, w: World.world, l: World.level, n: Game.coopN, mods: Game.mods, list: World.players.map(p => ({ slot: p.slot, cls: p.cls })) });
    this.sendT = 0;
  },
  hostTick(dt) {
    if (!this.on || !this.host) return;
    this.pingT = (this.pingT || 0) - dt;
    if (this.pingT <= 0) { this.pingT = 1; Net.pingAll(); for (const p of [...Net.peers]) if (p.open && performance.now() - p.last > 6000) { p.open = false; Net.drop(p); } } // a guest gone quiet has left
    if (!this.inRun || !World.map) return;
    this.sendT -= dt; this.tileT -= dt;
    if (this.tileT <= 0) { this.tileT = 0.2; this.sendTiles(); }
    if (this.sendT > 0) return;
    this.sendT = 1 / 20;
    if (this.ev.length) { Net.broadcast({ t: 'ev', e: this.ev }); this.ev = []; }
    Net.broadcast(this.snapshot(), true);
  },
  sendTiles() {
    const m = World.map, L = this.lastMap; if (!L || L.length !== m.length) return;
    const d = []; for (let i = 0; i < m.length; i++) if (m[i] !== L[i]) { d.push(i, m[i]); L[i] = m[i]; }
    const thp = JSON.stringify([...World.thp].concat([...(World.thorns || new Map())].map(([i, t]) => [-1 - i, Math.round(t)])));
    if (!d.length && thp === this.lastThp) return;
    this.lastThp = thp;
    Net.broadcast({ t: 'tiles', d, thp: JSON.parse(thp) });
  },
  // events that guests replay: sounds, particles, shakes, banners
  push(e) { if (this.on && this.host && this.inRun && this.ev.length < 900) this.ev.push(e); },
  fxTo(slot, kind) { const p = Net.peers.find(q => q.slot === slot); if (p) Net.send(p, { t: 'fx', k: kind }); },

  // ---------- packing the world ----------
  SKIP: new Set(['D', 'B', 'p', 'hit', 'hitSet', 'hooks', 'inp', 'near', 'lastNear', 'salvK', 'onFire', 'room', 'by', 'target', 'twin', 'parent', 'owner_', 'path', 'link']),
  clean(v, depth) {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'number') return Number.isInteger(v) ? v : Math.round(v * 100) / 100;
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function' || v instanceof Set || v instanceof Map) return undefined;
    if (Array.isArray(v)) return v.map(x => { const c = this.clean(x, depth + 1); return c === undefined ? null : c; });
    if (t === 'object') {
      if (depth > 0 && (v.D || v.hooks)) return undefined; // a reference to a foe or a player
      const o = {}; for (const k in v) { if (this.SKIP.has(k)) continue; const c = this.clean(v[k], depth + 1); if (c !== undefined) o[k] = c; }
      return o;
    }
    return undefined;
  },
  pack(list) { // [{a,b},{a,c}] -> keys once, values as rows
    const keys = [], idx = new Map(), rows = [];
    for (const o of list) { const c = this.clean(o, 0) || {}, row = []; for (const k in c) { if (!idx.has(k)) { idx.set(k, keys.length); keys.push(k); } row[idx.get(k)] = c[k]; } rows.push(row); }
    return { k: keys, v: rows };
  },
  unpack(p) { if (!p) return []; return p.v.map(row => { const o = {}; p.k.forEach((k, i) => { if (row[i] !== undefined && row[i] !== null) o[k] = row[i]; }); return o; }); },
  snapshot() {
    const W = World, pk = W.pickups;
    const players = W.players.map(p => { const c = this.clean(p, 0); c.nearI = p.near ? pk.indexOf(p.near) : -1; c.salvI = p.salvK ? pk.indexOf(p.salvK) : -1; if (p.stolen) c.stolen = { idx: p.stolen.idx, t: p.stolen.t }; return c; });
    return {
      t: 's', tm: Math.round(W.time * 1000) / 1000, gs: Game.state, pz: this.pausedBy, lk: W.locked, rm: W.room ? W.room.id : -1, ts: W.timeStopT, bd: W.bossDark, ral: W.rally, dep: W.depth,
      mk: W.mark && !W.mark.dead ? W.mark.id : 0, lh: W.lastHit && W.lastHit.e ? { id: W.lastHit.e.id, t: W.lastHit.t, n: W.lastHit.e.D.n, c: W.lastHit.e.D.c } : null,
      rv: W.rooms.map(r => (r.visited ? 1 : 0) + (r.known ? 2 : 0) + (r.cleared ? 4 : 0)).join(''),
      P: players, E: this.pack(W.enemies), R: this.pack(W.projs), K: this.pack(pk), H: this.pack(W.hazards), S: this.pack(W.slime), Wn: this.pack(W.warns),
      Z: this.pack(W.zones), PT: this.pack(W.ptraps), TR: this.pack(W.traps), B: this.pack(W.bolts), X: this.pack(W.texts),
      ch: W.challenge ? { kind: W.challenge.kind, t: W.challenge.t, max: W.challenge.max } : null, fr: W.rooms.filter(r => r.frozen).map(r => r.id).join(','), co: W.rooms.filter(r => r.collapsed).map(r => r.id).join(','), dc: W.decoy ? this.clean(W.decoy, 0) : null, gn: W.gnome ? this.clean(W.gnome, 0) : null, re: Game.runEmbers,
    };
  },

  // ---------- guest ----------
  guestMsg(m) {
    if (m.t === 'welcome') { this.slot = m.slot; Net.send(Net.peers[0], { t: 'hello', unl: this.myUnl() }); }
    else if (m.t === 'full') { this.reset(); Menu.html(`<h2>That game is full</h2><div class="sub">Co-op holds 3 players.</div><button class="btn" id="b-back">Back</button>`); Menu.on('b-back', () => Menu.show('title')); }
    else if (m.t === 'lobby') { this.lobby = m.list; this.inRun = this.inRun || false; this.hostInRun = m.inRun; if (Game.state === 'menu' || !World.map) { this.inRunLobby = m.inRun; this.lobbyScreenGuest(); } }
    else if (m.t === 'level') this.guestLevel(m);
    else if (m.t === 's') this.applySnap(m);
    else if (m.t === 'ev') this.playEvents(m.e);
    else if (m.t === 'tiles') this.applyTiles(m);
    else if (m.t === 'fx') { if (m.k === 'hurt') { Render.kick(9); Render.flash = 0.25; } }
    else if (m.t === 'end') this.guestEnd(m);
  },
  lobbyScreenGuest() { const keep = this.inRun; this.inRun = !!this.hostInRun; this.lobbyScreen(); this.inRun = keep; },
  guestLevel(m) {
    const mine = m.list.find(l => l.slot === this.slot);
    if (!mine) return; // not in this run yet
    const fresh = !this.inRun || Game.seed !== m.seed;
    this.inRun = true;
    Game.mode = 'quick'; Game.char = null; Game.diff = Game.DIFF.quick; Game.cls = mine.cls; Game.coopN = m.n; Game.mods = m.mods || {};
    if (fresh) { Snd.init(); Screen.goFull(); Game.seed = m.seed; Game.seedNum = strHash(m.seed); Game.secret = null; Game.runEmbers = 0; Game.runTime = 0; Game.deadT = 0; Game.hs = 0; Music.setSeed(Game.seedNum); Music.on = true; Meta.data.stats.runs++; Meta.save(); }
    World.players = [];
    World.startLevel(m.w, m.l, true);
    this.ents = new Map(); this.snapAt = 0;
    Game.state = 'play'; Menu.hide();
  },
  applyTiles(m) {
    if (!World.map) return;
    for (let i = 0; i < m.d.length; i += 2) World.map[m.d[i]] = m.d[i + 1];
    World.thp = new Map(); World.thorns = new Map();
    for (const [i, v] of m.thp) { if (i < 0) World.thorns.set(-1 - i, v); else World.thp.set(i, v); }
    World.flowKey = -1;
  },
  playEvents(list) {
    for (const e of list) {
      const k = e[0];
      if (k === 'snd') Snd.play(e[1]);
      else if (k === 'p') World.parts.push({ x: e[1], y: e[2], vx: e[3], vy: e[4], life: e[5], max: e[5], size: e[6], color: e[7], glow: !!e[8] });
      else if (k === 'kick') Render.kick(e[1]);
      else if (k === 'ban') Game.banner(e[1], e[2], e[3]);
    }
    if (World.parts.length > 800) World.parts.splice(0, World.parts.length - 800);
  },
  applySnap(m) {
    const W = World; if (!W.map || !this.inRun) return;
    this.snapAt = performance.now();
    W.time = m.tm; W.locked = m.lk; W.room = m.rm >= 0 ? W.rooms[m.rm] : null; W.timeStopT = m.ts; W.bossDark = m.bd; W.rally = m.ral; W.depth = m.dep || W.depth;
    Game.runEmbers = m.re || 0;
    Music.target = m.lk ? 1 : 0;
    m.rv.split('').forEach((ch, i) => { const r = W.rooms[i]; if (!r) return; const b = +ch; r.visited = !!(b & 1); r.known = !!(b & 2); r.cleared = !!(b & 4); });
    // players: keep the object, lerp toward the host's position
    const old = new Map(W.players.map(p => [p.slot, p]));
    W.players = m.P.map(np => { // fresh object each time (no stale fields), but keep the smoothed position
      const p = old.get(np.slot); np.tx = np.x; np.ty = np.y;
      if (p && Math.hypot(np.x - p.x, np.y - p.y) < 120) { np.x = p.x; np.y = p.y; }
      if (p) { np.inp = p.inp; if (np.slot === this.slot && p.aim !== undefined) np.aim = p.aim; }
      return np;
    });
    const pk = this.unpack(m.K); W.pickups = pk;
    for (const p of W.players) { p.near = p.nearI >= 0 ? pk[p.nearI] : null; p.salvK = p.salvI >= 0 ? pk[p.salvI] : null; p.swings = p.swings || []; p.buffs = p.buffs || []; p.items = p.items || []; p.syn = p.syn || []; }
    W.near = W.meP() ? W.meP().near : null;
    // foes: rebuild their definitions locally, smooth their motion
    const seen = new Set(), list = [];
    for (const ne of this.unpack(m.E)) {
      const prev = this.ents.get(ne.id), e = ne; seen.add(ne.id);
      e.tx = ne.x; e.ty = ne.y;
      if (prev && Math.hypot(ne.x - prev.x, ne.y - prev.y) < 150) { e.x = prev.x; e.y = prev.y; }
      this.ents.set(ne.id, e);
      if (e.boss) { const B = (WORLDS[W.world].bosses.find(b => b.id === e.bid)) || WORLDS[W.world].bosses[0]; e.B = B; e.D = { n: B.title, c: B.c, r: e.r, hp: e.maxHp, ai: 'boss' }; }
      else e.D = e.champ ? Object.assign({}, EDEF[e.type], { n: World.champName(e) }) : EDEF[e.type] || EDEF.goblin;
      list.push(e);
    }
    for (const id of [...this.ents.keys()]) if (!seen.has(id)) this.ents.delete(id);
    W.enemies = list; W.boss = list.find(e => e.boss && !e.dead) || null;
    W.mark = m.mk ? this.ents.get(m.mk) || null : null;
    W.lastHit = m.lh ? { e: this.ents.get(m.lh.id) || { D: { n: m.lh.n, c: m.lh.c }, hp: 0, maxHp: 1, dead: true }, t: m.lh.t } : null;
    W.projs = this.unpack(m.R); W.hazards = this.unpack(m.H); W.slime = this.unpack(m.S); W.warns = this.unpack(m.Wn); W.zones = this.unpack(m.Z);
    W.ptraps = this.unpack(m.PT); W.traps = this.unpack(m.TR); W.bolts = this.unpack(m.B); W.texts = this.unpack(m.X);
    W.decoy = m.dc; W.gnome = m.gn; W.challenge = m.ch;
    const fr = new Set((m.fr || '').split(',').filter(Boolean).map(Number)), co = new Set((m.co || '').split(',').filter(Boolean).map(Number));
    for (const r of W.rooms) { r.frozen = fr.has(r.id) ? {} : null; r.collapsed = co.has(r.id); }
    // pause follows the host
    this.pausedBy = m.pz || '';
    if (m.gs === 'pause' && Game.state === 'play') { Game.state = 'pause'; Menu.show('pause'); }
    else if (m.gs === 'play' && Game.state === 'pause') { Game.state = 'play'; Menu.hide(); }
  },
  guestStep(dt) {
    const W = World, me = W.meP();
    // send my controls
    if (me && Game.state === 'play') {
      const inp = Input.read('auto', me);
      let pressed = false;
      for (const k of ['roll', 'swap', 'use', 'bag', 'potion', 'relic']) if (inp[k]) { this.cnt[k]++; pressed = true; }
      this.inT -= dt;
      if ((this.inT <= 0 || pressed) && Net.peers[0]) {
        this.inT = 1 / 30;
        Net.send(Net.peers[0], { t: 'in', mx: +inp.mx.toFixed(2), my: +inp.my.toFixed(2), aim: inp.aim === null ? null : +inp.aim.toFixed(3), atk: inp.attack ? 1 : 0, auto: inp.autoAim ? 1 : 0, as: inp.assist ? 1 : 0, uh: inp.useHeld ? 1 : 0, dev: inp.device, c: ['roll', 'swap', 'use', 'bag', 'potion', 'relic'].map(k => this.cnt[k]) }, !pressed);
      }
      me.inp = inp;
      if (inp.aim !== null) me.aim = inp.aim;
    }
    if (Game.state !== 'play') return;
    W.time += dt;
    // smooth everything toward the host's latest positions; shots fly on between snapshots
    const k = 1 - Math.exp(-dt * 18);
    for (const p of W.players) if (p.tx !== undefined) { p.x = lerp(p.x, p.tx, k); p.y = lerp(p.y, p.ty, k); }
    for (const e of W.enemies) { if (e.tx !== undefined) { e.x = lerp(e.x, e.tx, k); e.y = lerp(e.y, e.ty, k); } e.t = (e.t || 0) + dt; }
    for (const pr of W.projs) { pr.x += (pr.vx || 0) * dt; pr.y += (pr.vy || 0) * dt; }
    for (const s of W.parts) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; const kk = Math.exp(-(s.drag || 3) * dt); s.vx *= kk; s.vy *= kk; }
    W.parts = W.parts.filter(s => s.life > 0);
    for (const t of W.texts) { t.life -= dt; t.y -= 30 * dt; }
    if (this.snapAt && performance.now() - this.snapAt > 7000) this.lostHost(); // no word from the host for a while
  },
  guestEnd(m) {
    this.inRun = false;
    Game.runEmbers = m.emb || 0;
    Game.state = m.won ? 'win' : 'dead';
    Meta.data.embers += Game.runEmbers;
    Meta.data.stats.bestDepth = Math.max(Meta.data.stats.bestDepth || 0, m.dep || 0);
    if (m.won) Meta.data.stats.wins++;
    Meta.save(); Music.on = false;
    Snd.play(m.won ? 'portal' : 'death');
    Menu.show(m.won ? 'win' : 'dead');
  },
  // the waiting screen inside the portal
  drawHold(c, W, H, font) {
    const me = World.meP(); if (!me || !me.inPortal) return;
    const through = World.players.filter(p => p.inPortal).length, need = World.players.filter(p => !p.dead && !p.downed && !p.gone).length;
    c.fillStyle = 'rgba(8,5,16,0.82)'; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.fillStyle = '#c9a8ff'; c.font = font(26, 800); c.fillText('Through the portal', W / 2, H / 2 - 20);
    c.fillStyle = '#e8dcff'; c.font = font(15, 600); c.fillText(`Waiting for the others to finish up… ${through}/${need} ready`, W / 2, H / 2 + 14);
  },
};

// ---- hooks into the rest of the game ----
(() => {
  const startLevel = World.startLevel.bind(World);
  World.startLevel = function (w, l, keep) { startLevel(w, l, keep); if (Coop.on && Coop.host && Coop.inRun) Coop.onLevelStart(); };
  const part = World.part.bind(World);
  World.part = function (x, y, vx, vy, life, size, color, glow) { part(x, y, vx, vy, life, size, color, glow); if (Coop.on && Coop.host && Coop.inRun) Coop.push(['p', Math.round(x), Math.round(y), Math.round(vx), Math.round(vy), Math.round(life * 100) / 100, Math.round(size * 10) / 10, color, glow ? 1 : 0]); };
  const play = Snd.play.bind(Snd);
  Snd.play = function (n, ...a) { const r = play(n, ...a); if (n !== 'ui' && Coop.on && Coop.host && Coop.inRun) Coop.push(['snd', n]); return r; };
  const kick = Render.kick.bind(Render);
  Render.kick = function (n) { kick(n); if (Coop.on && Coop.host && Coop.inRun) Coop.push(['kick', n]); };
  const banner = Game.banner.bind(Game);
  Game.banner = function (a, b, d) { banner(a, b, d); if (Coop.on && Coop.host && Coop.inRun) Coop.push(['ban', a, b, d]); };
  const end = Game.end.bind(Game);
  Game.end = function (won) {
    if (Coop.on && Coop.host && Coop.inRun) { Net.broadcast({ t: 'end', won, emb: Game.runEmbers, dep: World.depth }); Coop.inRun = false; }
    end(won);
  };
  const tp = Game.togglePause.bind(Game);
  Game.togglePause = function () {
    if (Coop.on && !Coop.host && Coop.inRun) { if (Net.peers[0]) Net.send(Net.peers[0], { t: Game.state === 'play' ? 'pause' : 'resume' }); return; }
    if (Coop.on && Coop.host && Game.state === 'play' && !Coop.pausedBy) Coop.pausedBy = 'P1';
    tp();
    if (Game.state === 'play') Coop.pausedBy = '';
  };
})();
