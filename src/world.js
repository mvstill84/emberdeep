// ===== World: floor generation, entities, combat =====
const T = 32, CW = 24, CH = 18, GRID = 6, MW = CW * GRID, MH = CH * GRID;
const VOID = 0, FLOOR = 1, WALL = 2, PILLAR = 3, DOOR = 4, SHUT = 5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const solidT = t => t === VOID || t === WALL || t === PILLAR || t === SHUT;

const World = {
  floor: 1, map: null, rooms: [], room: null, locked: false, waves: [], waveT: 0,
  players: [], enemies: [], projs: [], parts: [], pickups: [], bolts: [], texts: [],
  flow: null, flowStamp: 0, flowKey: -1, flowT: 0, boss: null, time: 0,

  // ---------- generation ----------
  gen(f) {
    this.floor = f;
    const rng = RNG(hash(Game.seedNum, f, 101));
    const map = this.map = new Uint8Array(MW * MH);
    const cells = new Map(), key = (x, y) => x + y * GRID;
    const rooms = this.rooms = [];
    const add = (cx, cy) => { const r = { id: rooms.length, cx, cy, links: [], type: 'combat', cleared: false, visited: false, known: false, doors: [] }; rooms.push(r); cells.set(key(cx, cy), r); return r; };
    const link = (a, b) => { a.links.push(b.id); b.links.push(a.id); };
    const start = add(rng.int(1, GRID - 2), rng.int(1, GRID - 2)); start.type = 'start';
    const target = Math.min(8 + f * 2, 15);
    for (let tries = 0; rooms.length < target && tries < 3000; tries++) {
      const r = rng.chance(0.55) ? rooms[Math.max(0, rooms.length - 1 - rng.int(0, 2))] : rng.pick(rooms);
      const [dx, dy] = rng.pick(DIRS), nx = r.cx + dx, ny = r.cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells.has(key(nx, ny))) continue;
      let nb = 0; for (const [ex, ey] of DIRS) if (cells.has(key(nx + ex, ny + ey))) nb++;
      if (nb > 1 && rng.chance(0.75)) continue;
      link(r, add(nx, ny));
    }
    // distances from start (tree, so farthest room is always a dead end)
    const dist = new Map([[0, 0]]), q = [0];
    while (q.length) { const id = q.shift(); for (const n of rooms[id].links) if (!dist.has(n)) { dist.set(n, dist.get(id) + 1); q.push(n); } }
    rooms.forEach(r => r.dist = dist.get(r.id));
    const ends = rooms.filter(r => r.links.length === 1 && r.type !== 'start').sort((a, b) => b.dist - a.dist);
    const boss = ends[0] || rooms[rooms.length - 1]; boss.type = 'boss';
    const t1 = ends[1] || rng.pick(rooms.filter(r => r.type === 'combat')); if (t1) t1.type = 'treasure';
    if (f >= 2 && ends[2]) ends[2].type = 'treasure';
    // a few loops so it's not a pure tree
    for (const r of rooms) for (const [dx, dy] of DIRS) {
      const n = cells.get(key(r.cx + dx, r.cy + dy));
      if (n && n.id > r.id && !r.links.includes(n.id) && r.type !== 'boss' && n.type !== 'boss' && rng.chance(0.15)) link(r, n);
    }
    // room sizes + carve
    for (const r of rooms) {
      if (r.type === 'boss') { r.w = 21; r.h = 15; }
      else if (r.type === 'start' || r.type === 'treasure') { r.w = 11; r.h = 9; }
      else { r.w = rng.pick([13, 15, 17, 19]); r.h = rng.pick([9, 11, 13]); }
      r.x = r.cx * CW + Math.floor((CW - r.w) / 2); r.y = r.cy * CH + Math.floor((CH - r.h) / 2);
      r.mx = r.x + (r.w - 1) / 2; r.my = r.y + (r.h - 1) / 2;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map[y * MW + x] = FLOOR;
    }
    // corridors and doors
    for (const a of rooms) for (const bid of a.links) {
      const b = rooms[bid]; if (b.id < a.id) continue;
      if (a.cy === b.cy) {
        const L = a.cx < b.cx ? a : b, Rr = L === a ? b : a, y0 = L.my;
        for (let x = L.x + L.w; x <= Rr.x - 1; x++) for (let y = y0 - 1; y <= y0 + 1; y++) map[y * MW + x] = FLOOR;
        for (let y = y0 - 1; y <= y0 + 1; y++) { const i1 = y * MW + L.x + L.w, i2 = y * MW + Rr.x - 1; map[i1] = map[i2] = DOOR; L.doors.push(i1); Rr.doors.push(i2); }
      } else {
        const U = a.cy < b.cy ? a : b, D = U === a ? b : a, x0 = U.mx;
        for (let y = U.y + U.h; y <= D.y - 1; y++) for (let x = x0 - 1; x <= x0 + 1; x++) map[y * MW + x] = FLOOR;
        for (let x = x0 - 1; x <= x0 + 1; x++) { const i1 = (U.y + U.h) * MW + x, i2 = (D.y - 1) * MW + x; map[i1] = map[i2] = DOOR; U.doors.push(i1); D.doors.push(i2); }
      }
    }
    // walls hug every walkable tile
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (map[y * MW + x] !== VOID) continue;
      let near = false;
      for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox, yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < MW && yy < MH) { const t = map[yy * MW + xx]; if (t === FLOOR || t === DOOR) { near = true; break; } }
      }
      if (near) map[y * MW + x] = WALL;
    }
    // obstacles + seeded encounters
    for (const r of rooms) {
      const rr = RNG(hash(Game.seedNum, f, r.id, 7));
      if (r.type === 'combat') this.obstacles(r, rr, rr.pick(['none', 'pillars', 'center', 'scatter', 'lanes', 'pillars', 'scatter', 'ring']));
      if (r.type === 'boss') this.obstacles(r, rr, 'boss');
      if (r.type === 'combat') this.planWaves(r, rr, f);
      r.deco = [];
      for (let i = 0; i < r.w * r.h / 14; i++) r.deco.push({ x: r.x + rr.int(0, r.w - 1), y: r.y + rr.int(0, r.h - 1), k: rr.int(0, 3), a: rr() * TAU });
    }
    this.flow = new Int16Array(MW * MH);
    this.decoCache = null;
  },
  obstacles(r, rng, kind) {
    const x0 = r.x + 2, x1 = r.x + r.w - 3, y0 = r.y + 2, y1 = r.y + r.h - 3;
    const put = (x, y) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.map[y * MW + x] = PILLAR; };
    const put4 = (dx, dy) => { put(r.mx + dx, r.my + dy); put(r.mx - dx, r.my + dy); put(r.mx + dx, r.my - dy); put(r.mx - dx, r.my - dy); };
    const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
    if (kind === 'pillars' || kind === 'boss') {
      const dx = kind === 'boss' ? 6 : Math.max(2, Math.floor(r.w / 4)), dy = kind === 'boss' ? 4 : Math.max(2, Math.floor(r.h / 4));
      put4(dx, dy); put4(dx - 1, dy); put4(dx, dy - 1); put4(dx - 1, dy - 1);
    } else if (kind === 'center') {
      const ex = Math.floor(r.w / 7), ey = Math.floor(r.h / 7);
      for (let dx = 0; dx <= ex; dx++) for (let dy = 0; dy <= ey; dy++) put4(dx, dy);
    } else if (kind === 'scatter') {
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) put4(rng.int(1, hw - 2), rng.int(1, hh - 2));
    } else if (kind === 'lanes') {
      const dy = Math.max(2, Math.floor(hh / 2)), len = Math.floor(hw / 2);
      for (let dx = 0; dx <= len; dx++) put4(dx, dy);
    } else if (kind === 'ring') {
      const dx = Math.max(2, Math.floor(hw / 2)), dy = Math.max(2, Math.floor(hh / 2));
      for (let i = 0; i <= dx; i++) if (i !== 0) put4(i, dy);
      for (let j = 0; j <= dy; j++) if (j !== 0 && j !== 1) put4(dx, j);
    }
  },
  planWaves(r, rng, f) {
    const pool = FLOOR_POOL[f];
    let budget = 4 + f * 2 + rng.int(0, 3) + (r.w * r.h > 200 ? 2 : 0);
    const nW = budget >= 8 ? 2 : 1, free = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (this.map[y * MW + x] === FLOOR) free.push([x, y]);
    r.waves = [];
    for (let w = 0; w < nW; w++) {
      let b = Math.ceil(budget / (nW - w)); budget -= b;
      const wave = [];
      for (let guard = 0; b > 0 && guard < 40; guard++) {
        const type = rng.pick(pool), c = EDEF[type].cost;
        if (c > b && b < 3) { wave.push({ type: 'slime', ...this.tilePos(rng.pick(free)) }); b--; continue; }
        if (c > b) continue;
        wave.push({ type, ...this.tilePos(rng.pick(free)) }); b -= c;
      }
      r.waves.push(wave);
    }
  },
  tilePos([x, y]) { return { x: x * T + T / 2, y: y * T + T / 2 }; },

  // ---------- run setup ----------
  startFloor(f, keepPlayers) {
    this.gen(f);
    this.enemies = []; this.projs = []; this.parts = []; this.pickups = []; this.bolts = []; this.texts = [];
    this.locked = false; this.waves = []; this.boss = null; this.room = null;
    const s = this.rooms[0];
    if (!keepPlayers) this.players = [this.makePlayer(0)];
    for (const p of this.players) { p.x = s.mx * T + T / 2; p.y = s.my * T + T / 2; p.vx = p.vy = 0; }
    Render.snapCamera();
    Game.banner(FLOOR_NAMES[f], `Floor ${f}`, 2.6);
    Music.target = 0;
  },
  makePlayer(slot) {
    const sr = RNG(hash(Game.seedNum, 0, 11));
    const st = { speed: 155, rollCd: 0.42, dmg: Game.mods.glass ? 3 : 1, meleeDmg: 1, rate: 1, extraShots: 0, bounce: 0, reach: 1, homing: 0, reflect: false, addElem: new Set() };
    const hp = Game.mods.glass ? 2 : 6 + (Meta.has('heart1') ? 2 : 0) + (Meta.has('heart2') ? 2 : 0);
    const p = {
      slot, src: 'auto', x: 0, y: 0, r: 9, vx: 0, vy: 0, hp, maxHp: hp, inv: 0, roll: 0, rollCd: 0, rdx: 1, rdy: 0, aim: 0,
      weapons: [
        makeWeapon(sr, { type: 'sword', rarity: Game.mods.allLegendary ? 3 : 0, elem: 'none', name: Game.mods.allLegendary ? undefined : 'Worn Blade' }),
        makeWeapon(sr, { type: 'bow', rarity: Game.mods.allLegendary ? 3 : Meta.has('fletcher') ? 1 : 0, name: Game.mods.allLegendary || Meta.has('fletcher') ? undefined : 'Hunter\'s Bow' }),
      ],
      wi: 0, cd: 0, charge: 0, echo: 0, swings: [], items: [], syn: [], st,
      hooks: { shoot: [], hit: [], kill: [], roll: [], hurt: [], clear: [] },
      revives: 0, kills: 0, embers: 0, dead: false, color: '#ffe9c4', swingDir: 1,
    };
    if (p.weapons[1].rarity === 0) { p.weapons[1].elem = 'none'; p.weapons[1].quirks = []; }
    return p;
  },

  // ---------- tiles & collision ----------
  tile(x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return VOID; return this.map[ty * MW + tx]; },
  solidAt(x, y) { return solidT(this.tile(x, y)); },
  resolve(e) {
    let hit = false;
    const x0 = Math.floor((e.x - e.r) / T), x1 = Math.floor((e.x + e.r) / T), y0 = Math.floor((e.y - e.r) / T), y1 = Math.floor((e.y + e.r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || solidT(this.map[ty * MW + tx])) {
        const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
        let dx = e.x - cx, dy = e.y - cy; const dd = dx * dx + dy * dy;
        if (dd < e.r * e.r) {
          hit = true;
          if (dd > 0.0001) { const d = Math.sqrt(dd), push = e.r - d; e.x += dx / d * push; e.y += dy / d * push; }
          else { // center inside tile: push out along shortest axis
            const l = e.x - tx * T, r = tx * T + T - e.x, u = e.y - ty * T, b = ty * T + T - e.y, m = Math.min(l, r, u, b);
            if (m === l) e.x -= l + e.r; else if (m === r) e.x += r + e.r; else if (m === u) e.y -= u + e.r; else e.y += b + e.r;
          }
        }
      }
    }
    return hit;
  },
  move(e, dx, dy) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    let hit = false;
    for (let i = 0; i < n; i++) { e.x += dx / n; if (this.resolve(e)) hit = true; e.y += dy / n; if (this.resolve(e)) hit = true; }
    return hit;
  },
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 12);
    for (let i = 1; i < n; i++) { const t = i / n; if (this.solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
    return true;
  },
  roomAt(x, y, m = 0.6) {
    const tx = x / T, ty = y / T;
    for (const r of this.rooms) if (tx >= r.x + m && tx <= r.x + r.w - m && ty >= r.y + m && ty <= r.y + r.h - m) return r;
    return null;
  },
  freeSpot(x, y) {
    if (!this.solidAt(x, y) && this.tile(x, y) !== DOOR) return { x, y };
    for (let rad = 1; rad < 6; rad++) for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * TAU / 8) * rad * T, py = y + Math.sin(a * TAU / 8) * rad * T;
      if (!this.solidAt(px, py)) return { x: Math.floor(px / T) * T + T / 2, y: Math.floor(py / T) * T + T / 2 };
    }
    return { x, y };
  },
  // BFS flow field toward the player within the current room
  buildFlow(p) {
    const r = this.room; if (!r) return;
    const ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T), k = pty * MW + ptx;
    if (k === this.flowKey) return; this.flowKey = k;
    const f = this.flow; f.fill(-1);
    const x0 = r.x - 1, x1 = r.x + r.w, y0 = r.y - 1, y1 = r.y + r.h;
    const q = [k]; f[k] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % MW, y = (i - x) / MW;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = ny * MW + nx; if (f[j] !== -1 || solidT(this.map[j])) continue;
        f[j] = f[i] + 1; q.push(j);
      }
    }
  },
  flowDir(e, p) {
    const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T), i = ty * MW + tx, f = this.flow;
    if (!f || f[i] < 0 || d2(e.x, e.y, p.x, p.y) < 50 * 50 || (f[i] <= 3 && this.los(e.x, e.y, p.x, p.y))) return Math.atan2(p.y - e.y, p.x - e.x);
    let best = f[i], bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const j = (ty + dy) * MW + tx + dx; if (f[j] < 0) continue;
      if (dx && dy && (f[ty * MW + tx + dx] < 0 || f[(ty + dy) * MW + tx] < 0)) continue;
      if (f[j] < best) { best = f[j]; bx = dx; by = dy; }
    }
    if (!bx && !by) return Math.atan2(p.y - e.y, p.x - e.x);
    return Math.atan2((ty + by) * T + T / 2 - e.y, (tx + bx) * T + T / 2 - e.x);
  },

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    const p0 = this.players[0];
    for (const p of this.players) if (!p.dead) this.updPlayer(p, dt);
    this.updRooms();
    if (this.room && this.locked) { this.flowT -= dt; if (this.flowT <= 0) { this.flowT = 0.15; this.buildFlow(p0); } }
    for (const e of this.enemies) this.updEnemy(e, dt);
    // keep enemies from stacking
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
      const a = en[i], b = en[j]; if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, dd = dx * dx + dy * dy;
      if (dd < rr * rr && dd > 0.01) { const d = Math.sqrt(dd), push = (rr - d) / 2, nx = dx / d, ny = dy / d; const wa = a.boss ? 0 : 1, wb = b.boss ? 0 : 1; a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb; }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
    this.updProjs(dt);
    this.updPickups(dt);
    for (const s of this.parts) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; const k = Math.exp(-(s.drag || 3) * dt); s.vx *= k; s.vy *= k; }
    this.parts = this.parts.filter(s => s.life > 0);
    if (this.parts.length > 800) this.parts.splice(0, this.parts.length - 800);
    for (const b of this.bolts) b.life -= dt; this.bolts = this.bolts.filter(b => b.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 30 * dt; } this.texts = this.texts.filter(t => t.life > 0);
    // waves
    if (this.locked && this.waves.length) {
      this.waveT -= dt;
      const alive = this.enemies.filter(e => !e.boss).length;
      if (alive <= 1 && this.waveT <= 0) this.spawnWave(this.waves.shift());
    }
    if (this.locked && !this.waves.length && !this.enemies.length) this.clearRoom();
  },

  updPlayer(p, dt) {
    const inp = Input.read(p.src, p);
    p.inp = inp;
    if (inp.aim !== null) p.aim = inp.assist ? this.assist(p, inp.aim) : inp.aim;
    else if (inp.device !== 'kb' && (inp.mx || inp.my) && !p.charge) p.aim = Math.atan2(inp.my, inp.mx);
    p.inv -= dt; p.rollCd -= dt;
    if (p.roll > 0) {
      p.roll -= dt;
      const sp = 340 * (p.roll > 0.12 ? 1 : 0.6);
      this.move(p, p.rdx * sp * dt, p.rdy * sp * dt);
      if (R.chance(0.6)) this.part(p.x, p.y, R.range(-20, 20), R.range(-20, 20), 0.35, 3, '#bfe3ff');
    } else {
      if (inp.roll && p.rollCd <= 0) {
        let dx = inp.mx, dy = inp.my; if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
        const l = Math.hypot(dx, dy); p.rdx = dx / l; p.rdy = dy / l;
        p.roll = 0.34; p.rollCd = p.st.rollCd + 0.34; p.charge = 0;
        Snd.play('roll'); for (const h of p.hooks.roll) h();
      }
      const sp = p.st.speed * (p.charge > 0 ? 0.68 : 1);
      const k = 1 - Math.exp(-18 * dt);
      p.vx = lerp(p.vx, inp.mx * sp, k); p.vy = lerp(p.vy, inp.my * sp, k);
      this.move(p, p.vx * dt, p.vy * dt);
    }
    if (inp.swap && p.weapons.length > 1) { p.wi = 1 - p.wi; p.charge = 0; p.cd = Math.max(p.cd, 0.1); Snd.play('ui'); }
    if (inp.use) this.interact(p);
    for (const s of p.swings) s.t += dt; p.swings = p.swings.filter(s => s.t < s.dur + 0.1);
    // weapons
    const w = p.weapons[p.wi];
    p.cd -= dt;
    if (p.echo > 0) { p.echo -= dt; if (p.echo <= 0) this.swing(p, p.echoW, true); }
    if (p.roll > 0) { p.charge = 0; return; }
    if (w.type === 'sword') {
      if (inp.attack && p.cd <= 0) { this.swing(p, w); p.cd = w.cd / p.st.rate; if (hasQ(w, 'echo')) { p.echo = 0.13; p.echoW = w; } }
    } else if (w.type === 'bow') {
      if (inp.attack && p.cd <= 0) {
        const prev = p.charge; p.charge = Math.min(1, Math.max(0.001, p.charge + dt * p.st.rate / w.charge));
        if (prev < 1 && p.charge >= 1) { Snd.play('charge'); for (let i = 0; i < 8; i++) this.part(p.x, p.y, Math.cos(i * TAU / 8) * 60, Math.sin(i * TAU / 8) * 60, 0.3, 2.5, ELEM[w.elem].c, true); }
      } else if (p.charge > 0) { this.fireBow(p, w); p.charge = 0; p.cd = w.cd / p.st.rate; }
    } else if (w.type === 'staff') {
      if (inp.attack && p.cd <= 0) { this.fireStaff(p, w); p.cd = w.cd / p.st.rate; }
    }
  },
  assist(p, a) { // touch/pad aim assist: snap toward a foe inside a 26° cone
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const ea = Math.atan2(e.y - p.y, e.x - p.x), dd = d2(p.x, p.y, e.x, e.y);
      if (Math.abs(angDiff(a, ea)) < 0.45 && dd < 500 * 500 && dd < bd) { bd = dd; best = ea; }
    }
    return best === null ? a : best;
  },
  shotCount(p, w) { return 1 + p.st.extraShots + (hasQ(w, 'twin') ? 1 : 0); },
  mkProj(p, w, a, o) {
    const pr = Object.assign({
      x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12, owner: 'p', life: 1.1, pierce: hasQ(w, 'pierce') ? 1 : 0,
      bounce: p.st.bounce, elem: w.elem, homing: p.st.homing + (hasQ(w, 'seeking') ? 2.5 : 0) + (w.elem === 'arcane' ? 1.2 : 0),
      hit: new Set(), depth: 0, p, leech: hasQ(w, 'leech'), color: ELEM[w.elem].c,
    }, o);
    pr.vx = Math.cos(a) * o.speed; pr.vy = Math.sin(a) * o.speed;
    for (const h of p.hooks.shoot) h(pr);
    this.projs.push(pr); return pr;
  },
  fireBow(p, w) {
    const c = p.charge, full = c >= 1, n = this.shotCount(p, w);
    for (let i = 0; i < n; i++) {
      const a = p.aim + (i - (n - 1) / 2) * 0.1;
      this.mkProj(p, w, a, { speed: w.speed * (0.55 + 0.45 * c), r: full ? 5 : 4, kind: 'arrow', life: 1.3, dmg: w.dmg * p.st.dmg * (0.3 + 0.7 * c) * (full ? 1.3 : 1), pierce: (full ? 1 : 0) + (hasQ(w, 'pierce') ? 1 : 0), full });
    }
    Snd.play('arrow'); Render.kick(full ? 3 : 1);
  },
  fireStaff(p, w) {
    const n = this.shotCount(p, w);
    for (let i = 0; i < n; i++) {
      const a = p.aim + (i - (n - 1) / 2) * 0.16 + R.range(-w.spread, w.spread);
      this.mkProj(p, w, a, { speed: w.speed, r: 5, kind: 'bolt', life: 1.0, dmg: w.dmg * p.st.dmg });
    }
    Snd.play('bolt');
  },
  swing(p, w, echo) {
    const reach = w.reach * p.st.reach, arc = w.arc, a = p.aim;
    const dmg = w.dmg * p.st.dmg * p.st.meleeDmg * (echo ? 0.6 : 1);
    p.swingDir = -p.swingDir;
    p.swings.push({ a, arc, reach, t: 0, dur: 0.15, color: ELEM[w.elem].c, dir: p.swingDir });
    Snd.play('swing');
    const src = { melee: true, dmg, elem: w.elem, x: p.x, y: p.y, depth: 0, p, leech: hasQ(w, 'leech') };
    let any = false;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dd = Math.sqrt(d2(p.x, p.y, e.x, e.y));
      if (dd <= reach + e.r && (Math.abs(angDiff(a, Math.atan2(e.y - p.y, e.x - p.x))) <= arc / 2 || dd < e.r + p.r + 8)) { this.damage(e, dmg, src); any = true; }
    }
    for (const pr of this.projs) {
      if (pr.owner !== 'e' || pr.dead) continue;
      const dd = Math.sqrt(d2(p.x, p.y, pr.x, pr.y));
      if (dd <= reach + pr.r + 4 && Math.abs(angDiff(a, Math.atan2(pr.y - p.y, pr.x - p.x))) <= arc / 2 + 0.25) {
        if (p.st.reflect) {
          const sp = Math.hypot(pr.vx, pr.vy) * 1.6, na = Math.atan2(pr.y - p.y, pr.x - p.x);
          Object.assign(pr, { owner: 'p', vx: Math.cos(na) * sp, vy: Math.sin(na) * sp, dmg: dmg * 0.7, color: '#bfe3ff', elem: 'none', hit: new Set(), depth: 1, p, life: 1, pierce: 0, bounce: 0, homing: 1.5, kind: 'bolt' });
        } else pr.dead = true;
        this.burst(pr.x, pr.y, 6, '#ffffff', 120, 0.25); Snd.play('deflect');
      }
    }
    if (hasQ(w, 'wave')) this.mkProj(p, w, a, { speed: 380, r: 13, kind: 'wave', life: 0.42, dmg: dmg * 0.6, pierce: 99, bounce: 0, homing: 0 });
    if (any) { Game.hitstop(0.035); Render.kick(2.5); }
  },

  // ---------- damage & effects ----------
  damage(e, dmg, src) {
    if (e.dead || e.spawnT > 0) return;
    const p = src.p || this.players[0];
    if (e.type === 'knight' && e.shield && !src.aoe) {
      const from = src.proj ? Math.atan2(-src.proj.vy, -src.proj.vx) : Math.atan2(src.y - e.y, src.x - e.x);
      if (Math.abs(angDiff(e.face, from)) < 1.1) { dmg *= src.melee ? 0.35 : 0.12; this.burst(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, 5, '#9fb4ff', 140, 0.2); Snd.play('deflect'); }
    }
    e.hp -= dmg; e.flash = 0.09;
    // knockback
    let kx, ky;
    if (src.proj) { const l = Math.hypot(src.proj.vx, src.proj.vy) || 1; kx = src.proj.vx / l; ky = src.proj.vy / l; }
    else { const l = Math.hypot(e.x - src.x, e.y - src.y) || 1; kx = (e.x - src.x) / l; ky = (e.y - src.y) / l; }
    const kb = (src.melee ? 260 : 90) * (e.boss ? 0.05 : e.type === 'knight' ? 0.4 : 1);
    e.kx += kx * kb; e.ky += ky * kb;
    this.burst(e.x, e.y, 3, e.D.c, 110, 0.3);
    Snd.play('hit');
    // elements from the weapon plus any items that add elements
    const depth = src.depth || 0;
    const elems = new Set([src.elem]);
    if (depth === 0 || src.shard) for (const el of p.st.addElem) elems.add(el);
    if (src.extraElem) elems.add(src.extraElem);
    if (elems.has('fire')) { e.burn = 2.6; e.burnDmg = Math.max(e.burnDmg || 0, 3 * p.st.dmg); }
    if (elems.has('frost')) { e.chill = 1.8; if (R.chance(e.boss ? 0.02 : 0.12)) e.freeze = 1.1; }
    if (elems.has('storm') && depth < 2 && R.chance(0.3)) this.chain(e, dmg * 0.5, depth + 1, p);
    if (this.hasSyn('steam') && e.burn > 0 && e.chill > 0 && !src.steam && depth < 3) {
      e.burn = 0; e.chill = 0; this.explode(e.x, e.y, 60, dmg * 0.9 + 8 * p.st.dmg, depth + 1, '#e8f6ff', { steam: true });
    }
    if (depth <= 1 && !src.burn) for (const h of p.hooks.hit) h(e, src);
    if (e.hp <= 0) this.kill(e, src);
  },
  kill(e, src) {
    if (e.dead) return; e.dead = true;
    const p = src.p || this.players[0];
    this.burst(e.x, e.y, e.boss ? 80 : 18, e.D.c, e.boss ? 320 : 200, 0.6);
    this.burst(e.x, e.y, 8, '#ffffff', 120, 0.3);
    Snd.play('kill'); Render.kick(e.boss ? 14 : 3);
    p.kills++; Meta.data.stats.kills++;
    const em = Math.round((e.boss ? 12 * this.floor : e.D.embers) * (Game.mods.emberMult || 1));
    for (let i = 0; i < em; i++) this.pickups.push({ kind: 'ember', x: e.x, y: e.y, vx: R.range(-120, 120), vy: R.range(-120, 120), t: 0 });
    if (!e.boss && !e.minion && R.chance(0.035)) this.pickups.push({ kind: 'half', x: e.x, y: e.y, t: 0 });
    if (e.D.split && !e.boss) for (let i = 0; i < 2; i++) { const s = this.makeEnemy(e.D.split, e.x + R.range(-8, 8), e.y + R.range(-8, 8)); s.spawnT = 0; s.kx = R.range(-200, 200); s.ky = R.range(-200, 200); this.enemies.push(s); }
    if (src.leech && R.chance(0.08)) this.heal(1);
    for (const h of p.hooks.kill) h(e, src);
    if (e.boss) this.bossDown(e);
  },
  heal(n) {
    const p = this.players[0]; if (p.hp >= p.maxHp) return;
    p.hp = Math.min(p.maxHp, p.hp + n); Snd.play('heart');
    this.text(p.x, p.y - 20, '+' + (n / 2) + '♥', '#ff5470');
  },
  explode(x, y, rad, dmg, depth, color, extra = {}) {
    this.burst(x, y, 26, color, rad * 3.2, 0.45);
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: rad, color, glow: true, ring: true });
    Snd.play('explode'); Render.kick(5);
    for (const e of this.enemies) if (!e.dead && d2(x, y, e.x, e.y) < (rad + e.r) ** 2) this.damage(e, dmg, { x, y, depth, aoe: true, elem: 'none', ...extra });
  },
  chain(from, dmg, depth, p, x = from.x, y = from.y) {
    let n = 0;
    const tg = this.enemies.filter(e => e !== from && !e.dead && e.spawnT <= 0 && d2(x, y, e.x, e.y) < 140 * 140).sort((a, b) => d2(x, y, a.x, a.y) - d2(x, y, b.x, b.y));
    for (const e of tg) { if (n++ >= 2) break; this.bolts.push({ x1: x, y1: y, x2: e.x, y2: e.y, life: 0.14, seed: R() * 1000 }); this.damage(e, dmg, { x, y, depth, elem: 'none', p }); }
    if (n) Snd.play('zap');
  },
  ring(x, y, n, dmg, elem) {
    const p = this.players[0], w = { elem, quirks: [] };
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n + R() * 0.2;
      const pr = this.mkProj(p, w, a, { speed: 300, r: 4, kind: 'spark', life: 0.45, dmg, depth: 1, homing: 0, bounce: 0, pierce: 0 });
      if (this.hasSyn('cinderwake') && elem === 'storm') pr.extraElem = 'fire';
    }
  },
  spawnShard(e, a, s) {
    const p = s.p || this.players[0];
    const pr = { x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, owner: 'p', life: 0.45, r: 3, kind: 'shard', dmg: s.dmg * 0.45, elem: s.elem, color: '#d9b3ff', hit: new Set([e]), depth: (s.depth || 0) + 1, shard: true, pierce: 0, bounce: 0, homing: 0, p };
    this.projs.push(pr);
  },
  hasSyn(id) { return this.players.some(p => p.syn.includes(id)); },

  hurt(p, n = 1) {
    if (p.inv > 0 || p.roll > 0.03 || p.dead || Game.state !== 'play') return;
    p.hp -= n; p.inv = 1.15;
    Snd.play('hurt'); Render.kick(9); Game.hitstop(0.09); Render.flash = 0.25;
    this.burst(p.x, p.y, 20, '#ff4060', 220, 0.5);
    for (const pr of this.projs) if (pr.owner === 'e' && d2(p.x, p.y, pr.x, pr.y) < 110 * 110) { pr.dead = true; this.burst(pr.x, pr.y, 3, '#ff8aa0', 60, 0.2); }
    for (const h of p.hooks.hurt) h();
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--; p.hp = 4; p.inv = 2.5; Game.banner('Phoenix!', 'The feather burns away', 1.6);
        this.explode(p.x, p.y, 140, 40, 2, '#ffb02e');
        p.items = p.items.filter((x, i, arr) => x !== 'phoenix' || arr.indexOf('phoenix') !== i);
      } else { p.dead = true; this.burst(p.x, p.y, 60, '#ffe9c4', 260, 1); Game.onDeath(); }
    }
  },

  // ---------- enemies ----------
  makeEnemy(type, x, y) {
    const D = EDEF[type], f = this.floor, hpM = (1 + 0.42 * (f - 1));
    return { type, D, x, y, r: D.r, hp: D.hp * hpM, maxHp: D.hp * hpM, kx: 0, ky: 0, spawnT: 0.8, flash: 0, burn: 0, burnTick: 0, chill: 0, freeze: 0, t: R.range(0, 2), state: 0, st: 0, cool: R.range(0.8, 2.2), face: 0, strafe: R.chance(0.5) ? 1 : -1, dead: false };
  },
  spawnWave(wave) {
    const p = this.players[0], r = this.room;
    for (const s of wave) {
      let { x, y } = s;
      if (d2(x, y, p.x, p.y) < 150 * 150) {
        for (let k = 0; k < 30; k++) {
          const tx = r.x + 1 + R.int(0, r.w - 3), ty = r.y + 1 + R.int(0, r.h - 3), px = tx * T + T / 2, py = ty * T + T / 2;
          if (this.map[ty * MW + tx] === FLOOR && d2(px, py, p.x, p.y) > 180 * 180) { x = px; y = py; break; }
        }
      }
      this.enemies.push(this.makeEnemy(s.type, x, y));
    }
    this.waveT = 1.2; Snd.play('spawn');
  },
  eshot(x, y, a, sp, kind = 'orb', r = 6) {
    sp *= 1 + 0.08 * (this.floor - 1);
    this.projs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: 'e', life: 6, r, kind, color: kind === 'arrowE' ? '#ffd27a' : '#ff4d8d', hit: null });
  },
  updEnemy(e, dt) {
    if (e.dead) return;
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    e.flash -= dt; e.t += dt;
    if (e.burn > 0) { e.burn -= dt; e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.45; this.damage(e, e.burnDmg, { x: e.x, y: e.y, depth: 1, burn: true, elem: 'none' }); this.part(e.x + R.range(-6, 6), e.y, R.range(-15, 15), -60, 0.5, 3, '#ff7a2a', true); } }
    if (e.chill > 0) e.chill -= dt;
    const kd = Math.exp(-9 * dt);
    if (e.kx || e.ky) { this.move(e, e.kx * dt, e.ky * dt); e.kx *= kd; e.ky *= kd; if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0; }
    if (e.dead) return;
    if (e.freeze > 0) { e.freeze -= dt; return; }
    const p = this.players.find(q => !q.dead); if (!p) return;
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy), toP = Math.atan2(dy, dx);
    const slow = e.chill > 0 ? 0.55 : 1, sp = e.D.sp * slow;
    let mx = 0, my = 0;
    const go = (a, s) => { mx = Math.cos(a) * s; my = Math.sin(a) * s; };
    switch (e.D.ai) {
      case 'hop': {
        const ph = (e.t % 1.0);
        e.squash = ph < 0.5 ? Math.sin(ph / 0.5 * Math.PI) : 0;
        if (ph < 0.5) go(this.flowDir(e, p), sp * 1.9);
        break;
      }
      case 'kite': {
        const see = this.los(e.x, e.y, p.x, p.y);
        if (e.st > 0) { // drawing the bow
          e.st -= dt * slow; e.face = toP;
          if (e.st <= 0) {
            const n = this.floor >= 2 ? 3 : 1;
            for (let i = 0; i < n; i++) this.eshot(e.x, e.y, toP + (i - (n - 1) / 2) * 0.22, 235, 'arrowE', 4);
            Snd.play('eshot'); e.cool = R.range(1.8, 2.8);
          }
          break;
        }
        if (dist < 140) go(toP + Math.PI, sp);
        else if (dist > 280 || !see) go(this.flowDir(e, p), sp);
        else { if (R.chance(dt * 0.6)) e.strafe *= -1; go(toP + Math.PI / 2 * e.strafe, sp * 0.7); }
        e.cool -= dt * slow;
        if (e.cool <= 0 && see && dist < 420) e.st = 0.6;
        break;
      }
      case 'caster': {
        if (dist > 260) go(this.flowDir(e, p), sp); else if (dist < 170) go(toP + Math.PI, sp * 0.8); else go(toP + Math.PI / 2, sp * 0.4);
        e.cool -= dt * slow;
        if (e.state === 1) { // spiral burst
          e.st -= dt; e.sub = (e.sub || 0) - dt;
          if (e.sub <= 0) { e.sub = 0.07; e.spin = (e.spin || 0) + 0.45; this.eshot(e.x, e.y, e.spin, 130); this.eshot(e.x, e.y, e.spin + Math.PI, 130); Snd.play('eshot'); }
          if (e.st <= 0) { e.state = 0; e.cool = R.range(2.2, 3.2); }
        } else if (e.cool <= 0) {
          if (this.floor >= 2 && R.chance(0.5)) { e.state = 1; e.st = 1.1; }
          else { const n = 8 + this.floor * 2, off = R() * TAU; for (let i = 0; i < n; i++) this.eshot(e.x, e.y, off + i * TAU / n, 125); Snd.play('eshot'); e.cool = R.range(2.2, 3.2); }
        }
        break;
      }
      case 'swoop': {
        if (e.state === 1) { e.st -= dt; mx = e.dvx * slow; my = e.dvy * slow; if (e.st <= 0) { e.state = 0; e.cool = R.range(1.2, 2.2); } break; }
        const orbit = toP + Math.PI + Math.sin(e.t * 2) * 0.9, ox = p.x + Math.cos(orbit) * 110, oy = p.y + Math.sin(orbit) * 110;
        go(Math.atan2(oy - e.y, ox - e.x), sp * 0.8);
        e.cool -= dt;
        if (e.cool <= 0 && dist < 260) { e.state = 1; e.st = 0.45; e.dvx = Math.cos(toP) * 280; e.dvy = Math.sin(toP) * 280; }
        break;
      }
      case 'charger': {
        e.shield = e.state !== 3;
        if (e.state === 0) { e.face = lerpAng(e.face, toP, 4 * dt); go(this.flowDir(e, p), sp); e.cool -= dt; if (e.cool <= 0 && dist < 300 && this.los(e.x, e.y, p.x, p.y)) { e.state = 1; e.st = 0.65; } }
        else if (e.state === 1) { e.face = lerpAng(e.face, toP, 6 * dt); e.st -= dt; if (e.st <= 0) { e.state = 2; e.st = 0.75; e.dvx = Math.cos(e.face) * 340; e.dvy = Math.sin(e.face) * 340; } }
        else if (e.state === 2) { e.st -= dt; if (this.move(e, e.dvx * dt, e.dvy * dt) || e.st <= 0) { e.state = 3; e.st = 1.0; Render.kick(4); this.burst(e.x, e.y, 10, '#9fb4ff', 150, 0.3); for (let i = 0; i < 8; i++) this.eshot(e.x, e.y, i * TAU / 8, 110); } }
        else { e.st -= dt; if (e.st <= 0) { e.state = 0; e.cool = R.range(1.5, 2.5); } }
        break;
      }
      case 'boss': this.updBoss(e, p, dt, toP, dist, go); break;
    }
    if (mx || my) this.move(e, mx * dt, my * dt);
    if (dist < e.r + p.r - 2) this.hurt(p, e.D.touch);
  },
  updBoss(e, p, dt, toP, dist, go) {
    const rage = e.hp < e.maxHp * 0.5, f = this.floor;
    if (rage && !e.raged) { e.raged = true; Game.banner('', 'The ' + e.title.replace(/^the /, '') + ' is enraged!', 1.4); Render.kick(10); Snd.play('boss'); }
    e.spin = (e.spin || 0) + dt * (rage ? 1.6 : 1.1);
    if (e.state === 0) { // drift and choose
      go(toP, 38); e.cool -= dt;
      if (e.cool <= 0) {
        const opts = ['spiral', 'fans', 'charge', 'summon'];
        let pick = R.pick(opts); if (pick === e.last) pick = R.pick(opts); e.last = pick;
        if (pick === 'summon' && this.enemies.length > 5) pick = 'fans';
        e.state = pick; e.st = { spiral: 2.6, fans: 1.7, charge: 0.7, summon: 1.0 }[pick]; e.sub = 0; e.n = 0;
      }
      return;
    }
    e.st -= dt; e.sub -= dt;
    if (e.state === 'spiral') {
      if (e.sub <= 0) { e.sub = rage ? 0.06 : 0.085; const arms = (rage ? 4 : 3) + (f >= 3 ? 1 : 0); for (let i = 0; i < arms; i++) this.eshot(e.x, e.y, e.spin * 2.2 + i * TAU / arms, 120); Snd.play('eshot'); }
    } else if (e.state === 'fans') {
      if (e.sub <= 0) { e.sub = 0.5; const n = rage ? 9 : 7; for (let i = 0; i < n; i++) this.eshot(e.x, e.y, toP + (i - (n - 1) / 2) * 0.16, 175); Snd.play('eshot'); }
    } else if (e.state === 'charge') {
      if (e.n === 0) { e.face = toP; if (e.st <= 0) { e.n = 1; e.st = 0.8; e.dvx = Math.cos(e.face) * 360; e.dvy = Math.sin(e.face) * 360; } }
      else if (this.move(e, e.dvx * dt, e.dvy * dt) || e.st <= 0) {
        const n = rage ? 24 : 16; for (let i = 0; i < n; i++) this.eshot(e.x, e.y, i * TAU / n + e.spin, 140);
        Render.kick(8); Snd.play('explode'); e.st = -1;
      }
    } else if (e.state === 'summon') {
      if (e.n === 0) { e.n = 1; const kinds = f >= 2 ? ['bat', 'slime', 'bat'] : ['slime', 'slime']; for (const k of kinds) { const a = R() * TAU, s = this.freeSpot(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90), m = this.makeEnemy(k, s.x, s.y); m.minion = true; this.enemies.push(m); } Snd.play('spawn'); }
    }
    if (e.st <= 0) { e.state = 0; e.cool = rage ? R.range(0.5, 1.0) : R.range(0.9, 1.6); }
  },
  spawnBoss(r) {
    const rng = RNG(hash(Game.seedNum, this.floor, 909));
    const D = { hp: 700 + 380 * (this.floor - 1), r: 30, sp: 38, c: ['#ff7a3a', '#c77dff', '#ff3a5a', '#7dffb0'][this.floor - 1] || '#ff3a5a', ai: 'boss', touch: 2, embers: 0 };
    const e = { type: 'boss', D, boss: true, x: r.mx * T + T / 2, y: (r.my - 2) * T + T / 2, r: D.r, hp: D.hp, maxHp: D.hp, kx: 0, ky: 0, spawnT: 1.4, flash: 0, burn: 0, burnTick: 0, chill: 0, freeze: 0, t: 0, state: 0, cool: 1.5, face: 0, dead: false };
    e.name = properName(rng, 2); e.title = BOSS_TITLES[(this.floor - 1) % BOSS_TITLES.length];
    this.boss = e; this.enemies.push(e);
    Game.banner(e.name, e.title, 2.2); Snd.play('boss'); Render.kick(6);
  },
  bossDown(e) {
    this.boss = null;
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    Game.hitstop(0.25);
    const r = this.room, cx = r.mx * T + T / 2, cy = r.my * T + T / 2;
    Meta.data.stats.bestFloor = Math.max(Meta.data.stats.bestFloor, this.floor);
    const last = this.floor >= Game.maxFloor();
    this.pickups.push({ kind: 'portal', x: cx, y: cy + T * 2.5, t: 0, last });
    this.pickups.push({ kind: 'chest', x: cx, y: cy - T * 0.5, t: 0, room: r, n: 3 });
    this.pickups.push({ kind: 'heart', x: cx - T * 2, y: cy + T * 1.5, t: 0 });
    if (!last) { const w = makeWeapon(RNG(hash(Game.seedNum, this.floor, 4242)), { floor: this.floor + 1, types: this.weaponTypes(), rarity: 2 }); this.pickups.push({ kind: 'weapon', x: cx + T * 2, y: cy + T * 1.5, w, t: 0 }); }
  },
  weaponTypes() { return Meta.has('staffs') ? ['sword', 'bow', 'staff', 'staff'] : ['sword', 'bow']; },

  // ---------- rooms ----------
  updRooms() {
    const p = this.players[0]; if (!p || p.dead) return;
    const r = this.roomAt(p.x, p.y, 1.1);
    if (r && r !== this.room) {
      this.room = r; this.flowKey = -1;
      if (!r.visited) { r.visited = true; for (const id of r.links) this.rooms[id].known = true; }
      r.known = true;
      if (!r.cleared) this.enterRoom(r);
    }
  },
  setDoors(r, shut) { for (const i of r.doors) this.map[i] = shut ? SHUT : DOOR; },
  enterRoom(r) {
    if (r.type === 'combat' || r.type === 'boss') {
      this.locked = true; this.setDoors(r, true); Snd.play('door'); Music.target = 1;
      if (r.type === 'boss') { this.waves = []; this.spawnBoss(r); }
      else { this.waves = r.waves.map(w => w.slice()); this.waveT = 0.3; this.spawnWave(this.waves.shift()); }
    } else {
      r.cleared = true;
      if (r.type === 'treasure') this.pickups.push({ kind: 'chest', x: r.mx * T + T / 2, y: r.my * T + T / 2, t: 0, room: r, n: 2 });
    }
  },
  clearRoom() {
    const r = this.room; this.locked = false; r.cleared = true; this.setDoors(r, false);
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    Snd.play('clear'); Music.target = 0;
    const p = this.players[0]; for (const h of p.hooks.clear) h();
    if (r.type === 'combat') {
      const rr = RNG(hash(Game.seedNum, this.floor, r.id, 66)), roll = rr();
      const spot = this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2);
      if (roll < 0.17) this.pickups.push({ kind: 'weapon', ...spot, w: makeWeapon(rr, { floor: this.floor, types: this.weaponTypes() }), t: 0 });
      else if (roll < 0.42) this.pickups.push({ kind: rr.chance(0.5) ? 'half' : 'heart', ...spot, t: 0 });
    }
  },
  chooseItems(rng, n, p) {
    const pool = ITEMS.filter(it => (it.pool === 'base' || Meta.has(it.pool)) && (it.id === 'heart' || !p.items.includes(it.id)));
    rng.shuffle(pool); return pool.slice(0, n);
  },

  // ---------- pickups ----------
  updPickups(dt) {
    const p = this.players[0]; if (!p || p.dead) return;
    for (const k of this.pickups) {
      k.t += dt;
      const dd = d2(p.x, p.y, k.x, k.y);
      if (k.kind === 'ember') {
        k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= Math.exp(-5 * dt); k.vy *= Math.exp(-5 * dt);
        if (k.t > 0.35 && (dd < 170 * 170 || !this.locked)) { const d = Math.sqrt(dd) || 1, s = 420 + k.t * 200; k.x += (p.x - k.x) / d * s * dt; k.y += (p.y - k.y) / d * s * dt; }
        if (dd < 16 * 16 && k.t > 0.3) { k.gone = true; p.embers++; Game.runEmbers++; Snd.play('ember'); }
      } else if ((k.kind === 'heart' || k.kind === 'half') && dd < 20 * 20 && p.hp < p.maxHp) { k.gone = true; this.heal(k.kind === 'heart' ? 2 : 1); }
      else if (k.kind === 'portal' && dd < 26 * 26 && k.t > 1) { k.gone = true; Snd.play('portal'); Game.nextFloor(k.last); return; }
    }
    this.pickups = this.pickups.filter(k => !k.gone);
    this.near = null; let bd = 40 * 40;
    for (const k of this.pickups) if (['weapon', 'item', 'chest'].includes(k.kind)) { const dd = d2(p.x, p.y, k.x, k.y); if (dd < bd) { bd = dd; this.near = k; } }
  },
  interact(p) {
    const k = this.near; if (!k) return;
    if (k.kind === 'chest') {
      k.gone = true;
      const rng = RNG(hash(Game.seedNum, this.floor, k.room.id, 55));
      const items = this.chooseItems(rng, k.n, p), grp = R();
      items.forEach((it, i) => this.pickups.push({ kind: 'item', item: it, group: grp, x: k.x + (i - (items.length - 1) / 2) * 56, y: k.y + 6, t: 0 }));
      this.burst(k.x, k.y, 30, '#ffd27a', 200, 0.6); Snd.play('item');
      Game.banner('', 'Choose one', 1.2);
    } else if (k.kind === 'item') {
      for (const o of this.pickups) if (o.group === k.group) { o.gone = true; if (o !== k) this.burst(o.x, o.y, 10, '#555', 80, 0.4); }
      this.giveItem(p, k.item);
    } else if (k.kind === 'weapon') {
      k.gone = true;
      if (p.weapons.length < 2) { p.weapons.push(k.w); p.wi = p.weapons.length - 1; }
      else { const old = p.weapons[p.wi]; p.weapons[p.wi] = k.w; this.pickups.push({ kind: 'weapon', x: k.x, y: k.y + 2, w: old, t: 0 }); }
      p.charge = 0; Snd.play('item'); this.text(p.x, p.y - 24, k.w.name, RARITY[k.w.rarity].c);
    }
    this.pickups = this.pickups.filter(o => !o.gone);
  },
  giveItem(p, it) {
    p.items.push(it.id); it.apply(p); Snd.play('item');
    this.burst(p.x, p.y, 24, it.c, 200, 0.6);
    let got = null;
    for (const s of SYNERGIES) if (!p.syn.includes(s.id) && s.need.every(id => p.items.includes(id))) { p.syn.push(s.id); got = s; }
    if (got) { Game.banner('Synergy: ' + got.n, got.d, 2.6); Snd.play('synergy'); this.burst(p.x, p.y, 50, '#ffffff', 300, 0.8); }
    else Game.banner(it.n, it.d, 2);
  },

  // ---------- projectiles ----------
  updProjs(dt) {
    for (const pr of this.projs) {
      if (pr.dead) continue;
      pr.life -= dt; if (pr.life <= 0) { pr.dead = true; continue; }
      if (pr.owner === 'p' && pr.homing > 0) {
        let best = null, bd = 280 * 280;
        for (const e of this.enemies) { if (e.dead || e.spawnT > 0 || pr.hit.has(e)) continue; const dd = d2(pr.x, pr.y, e.x, e.y); if (dd < bd) { bd = dd; best = e; } }
        if (best) {
          const a = Math.atan2(pr.vy, pr.vx), ta = Math.atan2(best.y - pr.y, best.x - pr.x), sp = Math.hypot(pr.vx, pr.vy);
          const na = a + clamp(angDiff(a, ta), -pr.homing * dt, pr.homing * dt);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
      if (pr.kind !== 'wave' && this.solidAt(nx, ny)) {
        if (pr.bounce > 0) {
          pr.bounce--;
          if (this.solidAt(nx, pr.y)) pr.vx = -pr.vx; if (this.solidAt(pr.x, ny)) pr.vy = -pr.vy;
          if (!this.solidAt(nx, pr.y) && !this.solidAt(pr.x, ny)) { pr.vx = -pr.vx; pr.vy = -pr.vy; }
          pr.hit = new Set(); pr.life = Math.max(pr.life, 0.5);
          if (this.hasSyn('balllightning')) this.chain({ x: pr.x, y: pr.y }, pr.dmg * 0.6, 1, pr.p, pr.x, pr.y);
          this.burst(pr.x, pr.y, 3, pr.color, 80, 0.2);
        } else { pr.dead = true; this.burst(pr.x, pr.y, 4, pr.color, 90, 0.25); }
        continue;
      }
      if (pr.kind === 'wave' && this.solidAt(nx, ny)) { pr.dead = true; continue; }
      pr.x = nx; pr.y = ny;
      if (pr.owner === 'p') {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || pr.hit.has(e)) continue;
          if (d2(pr.x, pr.y, e.x, e.y) < (pr.r + e.r) ** 2) {
            pr.hit.add(e);
            this.damage(e, pr.dmg, { proj: pr, dmg: pr.dmg, elem: pr.elem, depth: pr.depth, shard: pr.shard, p: pr.p, x: pr.x, y: pr.y, leech: pr.leech, extraElem: pr.extraElem });
            if (pr.pierce > 0) pr.pierce--; else { pr.dead = true; break; }
          }
        }
      } else {
        for (const p of this.players) if (!p.dead && d2(pr.x, pr.y, p.x, p.y) < (pr.r + p.r - 3) ** 2) { if (p.inv <= 0 && p.roll <= 0.03) { pr.dead = true; this.hurt(p, 1); } }
      }
    }
    this.projs = this.projs.filter(p => !p.dead);
  },

  // ---------- particles ----------
  part(x, y, vx, vy, life, size, color, glow) { this.parts.push({ x, y, vx, vy, life, max: life, size, color, glow }); },
  burst(x, y, n, color, sp, life) { for (let i = 0; i < n; i++) { const a = R() * TAU, s = R() * sp; this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * R.range(0.5, 1), R.range(1.5, 3.5), color, true); } },
  text(x, y, s, c) { this.texts.push({ x, y, s, c, life: 1.2 }); },
};
function lerpAng(a, b, t) { return a + angDiff(a, b) * Math.min(1, t); }
