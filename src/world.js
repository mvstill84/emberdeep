// ===== World: level generation, entities, combat =====
const T = 32, CW = 32, CH = 24, GRID = 6, MW = CW * GRID, MH = CH * GRID;
const VOID = 0, FLOOR = 1, WALL = 2, PILLAR = 3, DOOR = 4, SHUT = 5, CHASM = 6; // chasm: you can't walk it, but shots and fliers cross
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const solidT = t => t === VOID || t === WALL || t === PILLAR || t === SHUT;
const walkBlockT = t => solidT(t) || t === CHASM;

// a seeded rng per room, for things that should be the same on every device
const rng0 = r => RNG(hash(Game.seedNum, World.depth, r.id, 4242));
const World = {
  eid: 0,
  world: 1, level: 1, depth: 1, theme: null, map: null, roomId: null, rooms: [], room: null, locked: false, waves: [], waveT: 0,
  players: [], enemies: [], projs: [], parts: [], pickups: [], bolts: [], texts: [], hazards: [], slime: [], zones: [], warns: [], ptraps: [], lastHit: null, timeStopT: 0, decoy: null, gnome: null, bossDark: false, thorns: new Map(), rally: false,
  flow: null, flowKey: -1, flowT: 0, boss: null, time: 0,

  // ---------- generation ----------
  gen(w, l) {
    this.world = w; this.level = l; this.depth = (w - 1) * 3 + l; this.theme = WORLDS[w];
    const style = this.theme.style;
    const rng = RNG(hash(Game.seedNum, w * 10 + l, 101));
    const map = this.map = new Uint8Array(MW * MH);
    const rid = this.roomId = new Int16Array(MW * MH).fill(-1);
    this.thp = new Map(); // hit points of breakable rocks / stumps
    this.traps = []; this.stalT = 4;
    const cells = new Map(), key = (x, y) => x + y * GRID;
    const rooms = this.rooms = [];
    const add = (cx, cy) => { const r = { id: rooms.length, cx, cy, links: [], type: 'combat', cleared: false, visited: false, known: false, doors: [], doorTo: {} }; rooms.push(r); cells.set(key(cx, cy), r); return r; };
    const link = (a, b) => { a.links.push(b.id); b.links.push(a.id); };
    // ---- layout: a start, an exit, and two or three routes between them, with a few side rooms off the routes.
    // Route types: horde (more foes), gauntlet (heavy hazards), elite (a champion). Signposted at the start room.
    const K = (x, y) => x + ',' + y;
    const flipX = rng.chance(0.5), flipY = rng.chance(0.5), turn = rng.chance(0.5); // vary the orientation run to run
    const tf = ([x, y]) => { const a = flipX ? GRID - 1 - x : x, b = flipY ? GRID - 1 - y : y; return turn ? [b, a] : [a, b]; };
    const S = [1, rng.int(2, 3)], E = [GRID - 2, rng.int(2, 3)]; // one column in from the edges leaves room for side rooms
    const inG = ([x, y]) => x >= 0 && y >= 0 && x < GRID && y < GRID, md = ([x, y]) => Math.abs(x - E[0]) + Math.abs(y - E[1]);
    let paths = [], best = [];
    const want = rng.chance(0.3) ? 2 : 3;
    for (let attempt = 0; attempt < 60 && best.length < want; attempt++) {
      const used = new Set([K(...S), K(...E)]); paths = [];
      for (let i = 0; i < want; i++) {
        let found = null;
        for (let tries = 0; tries < 40 && !found; tries++) {
          const firsts = DIRS.map(([dx, dy]) => [S[0] + dx, S[1] + dy]).filter(c => inG(c) && !used.has(K(...c)));
          if (!firsts.length) break;
          const path = [rng.pick(firsts)], seen = new Set([K(...path[0])]);
          while (path.length <= 5) {
            const cur = path[path.length - 1];
            if (md(cur) === 1 && path.length >= 2) { found = path; break; }
            const opts = DIRS.map(([dx, dy]) => [cur[0] + dx, cur[1] + dy]).filter(c => inG(c) && !used.has(K(...c)) && !seen.has(K(...c)));
            if (!opts.length) break;
            opts.sort((p, q) => md(p) - md(q) + (rng() - 0.5) * 2.4); // drift toward the exit, with some wander
            path.push(opts[0]); seen.add(K(...opts[0]));
          }
        }
        if (!found) break;
        found.forEach(c => used.add(K(...c))); paths.push(found);
      }
      if (paths.length > best.length) best = paths;
    }
    paths = best;
    const types = (w === 1 && l === 1) ? ['horde'] : ['horde', 'gauntlet', 'elite'].filter(t => (t !== 'elite' || l > 1) && (t !== 'gauntlet' || style !== 'cave' || l === 3));
    const rtypes = paths.map(() => rng.pick(types));
    if (rtypes.length === 3 && rtypes[0] === rtypes[1] && rtypes[1] === rtypes[2] && types.length > 1) rtypes[2] = rng.pick(types.filter(t => t !== rtypes[0]));
    const start = add(...tf(S)); start.type = 'start';
    const routeRooms = [];
    paths.forEach((p, i) => {
      let prev = start;
      p.forEach((c, j) => { const r = add(...tf(c)); r.route = rtypes[i]; r.routeIdx = i; link(prev, r); prev = r; routeRooms.push(r); if (rtypes[i] === 'elite' && j === Math.floor((p.length - 1) / 2)) r.champion = true; });
      paths[i].last = prev;
    });
    const end = add(...tf(E)); end.type = l === 3 ? 'boss' : 'exit';
    paths.forEach(p => link(p.last, end));
    // side rooms: dead ends off the routes (challenge, armory, treasure)
    const sideKinds = [];
    if (!(w === 1 && l === 1) && rng.chance(0.55)) sideKinds.push('challenge');
    if (l === 2) sideKinds.push('armory');
    for (let i = rng.int(0, 2); i > 0; i--) sideKinds.push('combat');
    for (const kind of sideKinds) {
      const spots = [];
      for (const r of routeRooms) for (const [dx, dy] of DIRS) { const nx = r.cx + dx, ny = r.cy + dy; if (nx >= 0 && ny >= 0 && nx < GRID && ny < GRID && !cells.has(key(nx, ny))) spots.push([r, nx, ny]); }
      if (!spots.length) break;
      const [r, nx, ny] = rng.pick(spots), sr = add(nx, ny); sr.type = kind; sr.side = true; link(r, sr);
    }
    const dist = new Map([[0, 0]]), q = [0];
    while (q.length) { const id = q.shift(); for (const n of rooms[id].links) if (!dist.has(n)) { dist.set(n, dist.get(id) + 1); q.push(n); } }
    rooms.forEach(r => r.dist = dist.get(r.id));
    // bounding rects (odd sizes keep a clean center tile)
    for (const r of rooms) {
      if (r.type === 'boss') { r.w = 29; r.h = 21; }
      else if (r.type === 'exit') { r.w = 25; r.h = 17; }
      else if (r.type === 'start' || r.type === 'armory') { r.w = 13; r.h = 11; }
      else if (r.type === 'challenge') { r.w = 19; r.h = 15; }
      else {
        // shapes: regular, long one way or the other, or big. Gauntlets lean big and long.
        r.shape = r.side ? 'normal' : rng.pick(r.route === 'gauntlet' ? ['big', 'big', 'longH', 'longV', 'normal'] : ['normal', 'normal', 'normal', 'longH', 'longV', 'big']);
        if (r.shape === 'longH') { r.w = rng.pick([27, 29]); r.h = rng.pick([9, 11]); }
        else if (r.shape === 'longV') { r.w = rng.pick([11, 13]); r.h = rng.pick([19, 21]); }
        else if (r.shape === 'big') { r.w = rng.pick([27, 29]); r.h = rng.pick([19, 21]); }
        else { r.w = rng.pick([15, 17, 19, 21, 23, 25]); r.h = rng.pick([11, 13, 15, 17, 19]); }
      }
      r.x = r.cx * CW + Math.floor((CW - r.w) / 2); r.y = r.cy * CH + Math.floor((CH - r.h) / 2);
      r.mx = r.x + (r.w - 1) / 2; r.my = r.y + (r.h - 1) / 2;
      r.dirs = r.links.map(id => [Math.sign(rooms[id].cx - r.cx), Math.sign(rooms[id].cy - r.cy)]);
      this.carveRoom(r, RNG(hash(Game.seedNum, w * 10 + l, r.id, 3)), style);
    }
    // corridors + doors (doors sit just outside each room's bounding rect)
    for (const a of rooms) for (const bid of a.links) {
      const b = rooms[bid]; if (b.id < a.id) continue;
      const cr = RNG(hash(Game.seedNum, a.id, b.id, 17)), wiggle = style !== 'crypt' && style !== 'sewer';
      if (a.cy === b.cy) {
        const L = a.cx < b.cx ? a : b, Rr = L === a ? b : a, y0 = L.my, x0 = L.x + L.w, x1 = Rr.x - 1;
        this.corridor(x0, x1, y0, true, wiggle, cr);
        for (let y = y0 - 1; y <= y0 + 1; y++) { const i1 = y * MW + x0, i2 = y * MW + x1; map[i1] = map[i2] = DOOR; L.doors.push(i1); Rr.doors.push(i2); L.doorTo[i1] = Rr.id; Rr.doorTo[i2] = L.id; }
      } else {
        const U = a.cy < b.cy ? a : b, D = U === a ? b : a, x0 = U.mx, y0 = U.y + U.h, y1 = D.y - 1;
        this.corridor(y0, y1, x0, false, wiggle, cr);
        for (let x = x0 - 1; x <= x0 + 1; x++) { const i1 = y0 * MW + x, i2 = y1 * MW + x; map[i1] = map[i2] = DOOR; U.doors.push(i1); D.doors.push(i2); U.doorTo[i1] = D.id; D.doorTo[i2] = U.id; }
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
    // room membership (inset one tile so you are properly inside before doors slam), obstacles, encounters
    for (const r of rooms) {
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (map[y * MW + x] === FLOOR) rid[y * MW + x] = r.id;
      const rr = RNG(hash(Game.seedNum, w * 10 + l, r.id, 7));
      if (r.type === 'combat' || r.type === 'boss' || r.type === 'exit') this.obstacles(r, rr, style);
      if (r.type === 'combat' && r.route === 'gauntlet') this.obstacles(r, rr, style); // gauntlets: twice the clutter
      if (r.type === 'combat' && !(w === 1 && l === 1) && rr.chance(r.route === 'gauntlet' ? 0.85 : r.shape !== 'normal' ? 0.35 : 0.1)) this.chasms(r, RNG(hash(Game.seedNum, w * 10 + l, r.id, 61)), r.route === 'gauntlet');
      if (r.type === 'combat' || r.type === 'exit') this.planWaves(r, rr);
      if (r.type === 'combat') this.placeTraps(r, RNG(hash(Game.seedNum, w * 10 + l, r.id, 77)), style, l, r.route === 'gauntlet');
      r.deco = [];
      for (let i = 0; i < r.w * r.h / 12; i++) r.deco.push({ x: r.x + rr.int(0, r.w - 1), y: r.y + rr.int(0, r.h - 1), k: rr.int(0, 3), a: rr() * TAU, s: rr.range(0.6, 1.2) });
    }
    // keys and locked chests: a chest only appears once a key has been put into the run
    const kr = RNG(hash(Game.seedNum, this.depth, 333));
    const spots = rooms.filter(r => r.type === 'combat'), deadEnds = spots.filter(r => r.links.length === 1);
    const keyHere = kr.chance(0.5), avail = Game.keysSpawned - Game.chestsSpawned + (keyHere ? 1 : 0), chestHere = avail > 0 && kr.chance(0.65);
    this.keyRoom = keyHere ? (kr.pick(deadEnds.length ? deadEnds : spots) || null) : null;
    this.chestRoom = chestHere ? (kr.pick(spots.filter(r => r !== this.keyRoom)) || null) : null;
    if (this.keyRoom) Game.keysSpawned++;
    if (this.chestRoom) Game.chestsSpawned++;
    this.flow = new Int16Array(MW * MH);
  },
  placeKeyAndChest() {
    const spot = (r, salt) => { const rr = RNG(hash(Game.seedNum, this.depth, r.id, salt)); for (let i = 0; i < 60; i++) { const tx = r.x + 2 + rr.int(0, r.w - 5), ty = r.y + 2 + rr.int(0, r.h - 5); if (this.map[ty * MW + tx] === FLOOR && this.roomId[ty * MW + tx] === r.id) return { x: tx * T + T / 2, y: ty * T + T / 2 }; } return this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2); };
    if (this.keyRoom) this.pickups.push({ kind: 'key', ...spot(this.keyRoom, 41), t: 0, room: this.keyRoom });
    if (this.chestRoom) this.pickups.push({ kind: 'lockchest', ...spot(this.chestRoom, 42), t: 1, room: this.chestRoom });
  },
  // Carve the inside of a room. Caves and forests grow from a cellular automaton; crypts are unions of halls.
  carveRoom(r, rng, style) {
    const map = this.map, w = r.w, h = r.h, cx = (w - 1) / 2, cy = (h - 1) / 2;
    const g = new Uint8Array(w * h); // 1 = floor
    const open = r.type === 'boss' || r.type === 'start' || r.type === 'armory' || r.type === 'exit';
    if (style === 'crypt' || style === 'sewer') {
      const fillR = (x0, y0, x1, y1) => { for (let y = Math.max(1, y0); y <= Math.min(h - 2, y1); y++) for (let x = Math.max(1, x0); x <= Math.min(w - 2, x1); x++) g[y * w + x] = 1; };
      if (open) fillR(1, 1, w - 2, h - 2);
      else {
        const kind = rng.pick(['hall', 'cross', 'pillared', 'ring']);
        const mw = Math.max(5, Math.round(w * rng.range(0.35, 0.7)) | 1), mh = Math.max(5, Math.round(h * rng.range(0.35, 0.7)) | 1);
        fillR(cx - (mw - 1) / 2, cy - (mh - 1) / 2, cx + (mw - 1) / 2, cy + (mh - 1) / 2);
        const arm = rng.pick([1, 1, 2]);
        if (kind !== 'ring') { fillR(1, cy - arm, w - 2, cy + arm); fillR(cx - arm, 1, cx + arm, h - 2); }
        if (kind === 'hall') fillR(2, cy - 2, w - 3, cy + 2);
        if (kind === 'pillared') { fillR(2, 2, w - 3, h - 3); for (let y = 3; y < h - 3; y += 3) for (let x = 3; x < w - 3; x += 3) if (Math.abs(x - cx) > 1 && Math.abs(y - cy) > 1) g[y * w + x] = 0; }
        if (kind === 'ring') { fillR(1, 1, w - 2, 2); fillR(1, h - 3, w - 2, h - 2); fillR(1, 1, 2, h - 2); fillR(w - 3, 1, w - 2, h - 2); fillR(1, cy - 1, w - 2, cy + 1); fillR(cx - 1, 1, cx + 1, h - 2); }
        for (let i = rng.int(1, 3); i > 0; i--) { // side alcoves / tomb niches
          const ax = rng.int(1, w - 5), ay = rng.int(1, h - 5); fillR(ax, ay, ax + rng.int(2, 3), ay + rng.int(2, 3));
          const lx = ax + 1, ly = ay + 1;
          for (let x = Math.min(lx, cx); x <= Math.max(lx, cx); x++) g[ly * w + x] = 1;
          for (let y = Math.min(ly, cy); y <= Math.max(ly, cy); y++) g[y * w + cx] = 1;
        }
      }
    } else {
      const dens = open ? 0.82 : style === 'forest' ? 0.6 : 0.52;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
        const e = ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2;
        g[y * w + x] = rng.chance(e < 0.45 ? 0.92 : e < 1.05 ? dens : 0.12) ? 1 : 0;
      }
      for (let it = 0; it < 4; it++) {
        const n = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          let walls = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!g[(y + oy) * w + x + ox]) walls++;
          n[y * w + x] = walls >= 5 ? 0 : 1;
        }
        g.set(n);
      }
    }
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y * w + x] = 1;
    // tunnels from each doorway to the middle, so every exit connects
    for (const [dx, dy] of r.dirs) {
      let off = 0;
      const len = dx ? (dx > 0 ? w - 1 - cx : cx) : (dy > 0 ? h - 1 - cy : cy);
      for (let s = 0; s <= len; s++) {
        if (style !== 'crypt' && style !== 'sewer' && s > 1 && s < len - 1 && rng.chance(0.35)) off = clamp(off + rng.pick([-1, 1]), -1, 1);
        if (s >= len - 1) off = 0;
        const px = dx ? cx + dx * s : cx + off, py = dy ? cy + dy * s : cy + off;
        for (let o = -1; o <= 1; o++) { const xx = dx ? px : px + o, yy = dx ? py + o : py; if (xx >= 0 && yy >= 0 && xx < w && yy < h) g[yy * w + xx] = 1; }
      }
    }
    // keep only the region connected to the center
    const keep = new Uint8Array(w * h), st = [cy * w + cx]; keep[cy * w + cx] = 1;
    while (st.length) { const i = st.pop(), x = i % w, y = (i - x) / w; for (const [ox, oy] of DIRS) { const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (g[j] && !keep[j]) { keep[j] = 1; st.push(j); } } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (keep[y * w + x]) map[(r.y + y) * MW + r.x + x] = FLOOR;
  },
  corridor(a0, a1, c, horiz, wiggle, rng) {
    const len = a1 - a0, ph = rng() * TAU, fr = rng.range(0.25, 0.5), amp = wiggle ? rng.int(1, 2) : 0;
    for (let i = 0; i <= len; i++) {
      const env = clamp(Math.min(i, len - i) / 2, 0, 1), off = Math.round(Math.sin(ph + i * fr) * amp * env);
      for (let o = -1; o <= 1; o++) {
        const along = a0 + i, across = c + off + o;
        const x = horiz ? along : across, y = horiz ? across : along;
        this.map[y * MW + x] = FLOOR;
      }
    }
  },
  obstacles(r, rng, style) {
    const map = this.map, ok = (x, y) => {
      if (map[y * MW + x] !== FLOOR) return false;
      if (Math.abs(x - r.mx) <= 2 || Math.abs(y - r.my) <= 2) return false; // keep the cross lanes open
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (map[(y + oy) * MW + x + ox] !== FLOOR) return false;
      return true;
    };
    const brk = this.theme.breakable;
    const put = (x, y) => { if (ok(x, y)) { map[y * MW + x] = PILLAR; if (brk) this.thp.set(y * MW + x, 3); } };
    if (r.type === 'boss' || r.type === 'exit') { const dx = r.type === 'exit' ? 7 : 9, dy = r.type === 'exit' ? 4 : 6; for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(r.mx + dx * sx, r.my + dy * sy); return; }
    if (style === 'crypt' || style === 'sewer') {
      const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
      for (let i = rng.int(2, 4); i > 0; i--) { const dx = rng.int(3, Math.max(3, hw - 2)), dy = rng.int(3, Math.max(3, hh - 2)); for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(r.mx + dx * sx, r.my + dy * sy); }
    } else {
      const p = style === 'forest' ? 0.07 : 0.035;
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (rng.chance(p)) put(x, y);
    }
  },
  // ---------- champions: a beefed-up foe with a twist ----------
  CHAMPS: { armored: { n: 'Armored', c: '#b8c2d4' }, swift: { n: 'Swift', c: '#7fe0ff' }, splitting: { n: 'Splitting', c: '#9fe38a' }, regenerating: { n: 'Regenerating', c: '#ff7a9a' } },
  ABILITIES: { volley: 'Volley', shockwave: 'Shockwave', blink: 'Blink', summon: 'Summoner', slam: 'Quake' },
  champAbility(e, p, dt) {
    e.abT -= dt; if (e.abT > 0 || !p || d2(e.x, e.y, p.x, p.y) > 520 * 520) return;
    e.abT = R.range(4.5, 6.5); const a = Math.atan2(p.y - e.y, p.x - e.x), col = (this.CHAMPS[e.champ] || { c: '#fff' }).c;
    if (e.ab === 'volley') { for (let i = -2; i <= 2; i++) this.eshot(e.x, e.y, a + i * 0.16, 230, 'orb', 6); Snd.play('eshot'); }
    else if (e.ab === 'shockwave') { for (let i = 0; i < 12; i++) this.eshot(e.x, e.y, i * TAU / 12 + a, 170, 'orb', 7); this.burst(e.x, e.y, 24, col, 200, 0.5); Snd.play('heavy'); }
    else if (e.ab === 'blink') { const ang = R() * TAU, s = this.freeSpot(p.x + Math.cos(ang) * 90, p.y + Math.sin(ang) * 90); this.warn(s.x, s.y, e.r + 10, 0.7, 0, 'claw', { onFire: () => { this.burst(e.x, e.y, 16, col, 160, 0.4); e.x = s.x; e.y = s.y; this.burst(e.x, e.y, 16, col, 160, 0.4); } }); }
    else if (e.ab === 'summon') { const pool = this.theme.pools[this.level - 1]; for (let i = 0; i < 2; i++) { const s = this.freeSpot(e.x + R.range(-50, 50), e.y + R.range(-50, 50)), m = this.makeEnemy(R.pick(pool.filter(t => EDEF[t].cost <= 2)) || pool[0], s.x, s.y); m.minion = true; m.spawnT = 0.5; this.enemies.push(m); } Snd.play('summon'); }
    else if (e.ab === 'slam') { this.warn(p.x, p.y, 62, 0.9, 1, 'slam'); }
  },
  champName(e) { return (this.CHAMPS[e.champ] || { n: '' }).n + ' ' + (EDEF[e.type] || { n: '?' }).n + ' Champion'; },
  makeChampion(rng, x, y, type) {
    const pool = this.theme.pools[this.level - 1].filter(t => !['blight', 'rat', 'stirge', 'cubeling'].includes(t));
    type = type || rng.pick(pool.length ? pool : this.theme.pools[this.level - 1]);
    const mod = rng.pick(Object.keys(this.CHAMPS)), e = this.makeEnemy(type, x, y);
    e.champ = mod; e.maxHp = e.hp = e.maxHp * 4.5; e.r = Math.round(e.r * 1.35);
    e.D = Object.assign({}, e.D, { n: this.champName(e), sp: e.D.sp * (mod === 'swift' ? 1.6 : 1.1), touch: (e.D.touch || 1) + 1, embers: (e.D.embers || 1) * 4 });
    e.ab = rng.pick(Object.keys(this.ABILITIES)); e.abT = 2.5; e.D.n += ' · ' + this.ABILITIES[e.ab]; // a move regular foes don't have
    e.spawnT = 0.6; return e;
  },
  // ---------- challenge rooms: one chance only ----------
  startChallenge(r, p) {
    r.entry = this.entryFor(r, p); this.awayT = 0;
    const rng = rng0(r), kind = rng.chance(0.5) ? 'survive' : 'hunt';
    this.locked = true; this.setDoors(r, true, r.entry); Snd.play('door'); Music.target = 1; this.waves = [];
    this.challenge = { kind, t: kind === 'survive' ? 30 : 25, max: kind === 'survive' ? 30 : 25, spawnT: 0.5, r };
    if (kind === 'hunt') { const s = this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2); const e = this.makeChampion(rng, s.x, s.y); e.hunted = true; this.enemies.push(e); }
    Game.banner(kind === 'survive' ? 'Trial: Survive' : 'Trial: The Hunt', kind === 'survive' ? 'Hold out for 30 seconds. Leave and the way collapses.' : 'Slay the champion in 25 seconds. Leave and the way collapses.', 2.6);
  },
  updChallenge(dt) {
    const C = this.challenge; if (!C || this.room !== C.r) return;
    C.t -= dt;
    if (C.kind === 'survive') {
      C.spawnT -= dt;
      if (C.spawnT <= 0 && C.t > 3) { C.spawnT = 2.6; const pool = this.theme.pools[this.level - 1], r = C.r, n = 2 + Math.floor(this.depth / 3) + this.coopN() - 1, wave = [];
        for (let i = 0; i < n; i++) wave.push({ type: R.pick(pool), x: (r.x + 2 + R.int(0, r.w - 5)) * T + T / 2, y: (r.y + 2 + R.int(0, r.h - 5)) * T + T / 2 });
        this.spawnWave(wave); }
      if (C.t <= 0) this.finishChallenge(true);
    } else {
      const champ = this.enemies.find(e => e.hunted);
      if (!champ || champ.dead) this.finishChallenge(true);
      else if (C.t <= 0) { this.burst(champ.x, champ.y, 40, '#c9a8ff', 220, 0.6); this.text(champ.x, champ.y - 40, 'The champion escapes', '#c9a8ff'); champ.dead = true; this.finishChallenge(false); }
    }
  },
  finishChallenge(won) {
    const r = this.challenge.r; this.challenge = null;
    for (const e of this.enemies) if (!e.dead) { e.dead = true; this.burst(e.x, e.y, 14, e.D.c, 160, 0.4); }
    this.enemies = []; this.waves = [];
    this.clearRoom();
    if (won) {
      const cx = r.mx * T + T / 2, cy = r.my * T + T / 2, rng = rng0(r), rar = Math.max(2, rollRarity(rng, this.depth + 2, 'boss'));
      this.pickups.push({ kind: 'weapon', w: makeWeapon(rng, { depth: this.depth + 1, src: 'boss', rarity: rar }), x: cx - 30, y: cy, t: 0 });
      this.pickups.push({ kind: 'chest', x: cx + 30, y: cy, t: 0, room: r, n: 3 }, { kind: 'stone', x: cx, y: cy + 36, t: 0 });
      Game.banner('Trial complete', 'Claim your reward', 1.6); Snd.play('portal');
    } else Game.banner('', 'Trial failed', 1.4);
  },
  collapseChallenge(r) { // backed out: the entrance caves in for good
    this.challenge = null; this.locked = false; this.room = null; r.cleared = true; r.collapsed = true;
    for (const e of this.enemies) e.dead = true; this.enemies = []; this.waves = [];
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    for (const i of r.doors) { this.map[i] = WALL; const x = (i % MW) * T + T / 2, y = Math.floor(i / MW) * T + T / 2; this.burst(x, y, 16, '#8a7a6a', 180, 0.6); }
    const nb = this.rooms[r.entry]; if (nb) for (const i of nb.doors) if (nb.doorTo[i] === r.id) this.map[i] = WALL;
    Snd.play('heavy'); Render.kick(10); Music.target = 0; Game.banner('', 'The way collapses behind you', 1.6);
  },
  // ---------- several players ----------
  live(p) { return !!p && !p.dead && !p.downed && !p.inPortal && !p.gone; }, // can act and be hit
  lives() { return this.players.filter(p => this.live(p)); },
  nearestP(x, y) { let best = null, bd = Infinity; for (const p of this.players) if (this.live(p)) { const d = d2(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } } return best; },
  meP() { const s = typeof Coop !== 'undefined' && Coop.on ? Coop.slot : 0; return this.players.find(p => p.slot === s) || this.players[0]; },
  coopN() { return Math.max(1, Game.coopN || 1); },
  // ---------- chasms: gaps in the floor you have to work around ----------
  chasms(r, rng, heavy) {
    const map = this.map, rid = this.roomId, inR = i => rid[i] === r.id;
    const doorT = r.doors.map(i => [i % MW, Math.floor(i / MW)]);
    const nearDoor = (x, y) => doorT.some(([dx, dy]) => Math.abs(dx - x) + Math.abs(dy - y) <= 3);
    const tryPattern = kind => {
      const set = [];
      const mark = (x, y) => { const i = y * MW + x; if (x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1 && inR(i) && map[i] === FLOOR && !nearDoor(x, y)) set.push(i); };
      if (kind === 'river') { // a band across the room with one or two bridges
        const across = r.w >= r.h; // band runs across the long axis so you have to find the crossing
        const len = across ? r.h : r.w, span = across ? r.w : r.h, at = Math.floor(span * rng.range(0.35, 0.65)), thick = rng.int(2, 3);
        const bridges = []; for (let b = rng.int(1, 2); b > 0; b--) { const c = rng.int(1, len - 4); bridges.push([c, c + 1 + rng.int(0, 1)]); }
        for (let k = 0; k < len; k++) { if (bridges.some(([a, b]) => k >= a && k <= b)) continue; for (let t = 0; t < thick; t++) { const wob = Math.round(Math.sin(k * 0.7 + r.id) * 0.8); if (across) mark(r.x + at + t + wob, r.y + k); else mark(r.x + k, r.y + at + t + wob); } }
      } else { // scattered holes
        for (let h = rng.int(heavy ? 3 : 2, heavy ? 6 : 4); h > 0; h--) {
          const cx = r.x + 2 + rng.int(0, r.w - 5), cy = r.y + 2 + rng.int(0, r.h - 5), rx = rng.range(1.2, heavy ? 3.2 : 2.4), ry = rng.range(1.2, heavy ? 2.8 : 2.2);
          for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) mark(x, y);
        }
      }
      if (!set.length) return false;
      for (const i of set) map[i] = CHASM;
      // every door must still reach every other, and most of the floor; islands left over become chasm too
      const seen = new Uint8Array(MW * MH), q = [r.doors[0]]; seen[r.doors[0]] = 1;
      const inBox = (x, y) => x >= r.x - 1 && y >= r.y - 1 && x <= r.x + r.w && y <= r.y + r.h;
      while (q.length) { const i = q.pop(), x = i % MW, y = (i - x) / MW; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, j = ny * MW + nx; if (!seen[j] && inBox(nx, ny) && (map[j] === FLOOR || map[j] === DOOR || map[j] === PILLAR)) { seen[j] = 1; q.push(j); } } }
      let floor = 0, reach = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const i = y * MW + x; if (inR(i) && map[i] === FLOOR) { floor++; if (seen[i]) reach++; } }
      if (r.doors.some(i => !seen[i]) || reach < floor * 0.7) { for (const i of set) map[i] = FLOOR; return false; }
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const i = y * MW + x; if (inR(i) && map[i] === FLOOR && !seen[i]) map[i] = CHASM; }
      return true;
    };
    const kinds = heavy ? ['river', 'holes', 'river'] : ['holes', 'river'];
    let made = 0; for (const k of kinds) { if (tryPattern(k)) made++; if (!heavy && made) break; }
    r.chasm = made > 0;
  },
  // ---------- environmental hazards ----------
  // Placed per room, seeded. Sparse early in a world, more by x-3. Boss and start rooms stay clean.
  placeTraps(r, rng, style, l, heavy) {
    const ch = heavy ? 1 : ({ crypt: [0.2, 0.35, 0.5], forest: [0.2, 0.35, 0.5], sewer: [0.5, 0.65, 0.8], cave: [0, 0, 0.2] }[style] || [0, 0, 0])[l - 1];
    if (!rng.chance(ch)) return;
    if (heavy && style !== 'cave') { for (let i = 0; i < 2; i++) this.placeTrapsOnce(r, rng, style, l); return; } // gauntlet: a second layer
    this.placeTrapsOnce(r, rng, style, l);
  },
  placeTrapsOnce(r, rng, style, l) {
    if (style === 'cave') { r.stal = true; return; } // falling stalactites, 1-3 only
    const tr = this.traps, doorT = r.doors.map(i => [i % MW, Math.floor(i / MW)]);
    const base = (x, y) => this.map[y * MW + x] === FLOOR && this.roomId[y * MW + x] === r.id && doorT.every(([dx, dy]) => Math.abs(dx - x) + Math.abs(dy - y) > 3) && (Math.abs(x - r.mx) > 1 || Math.abs(y - r.my) > 1);
    const free = (px, py, rad) => !tr.some(t => d2(t.x, t.y, px, py) < (t.r + rad + 24) ** 2);
    const tiles = []; for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (base(x, y)) tiles.push([x, y]);
    if (tiles.length < 8) return;
    const blobs = rad => Array.from({ length: 4 }, () => [rng.range(-0.35, 0.35) * rad, rng.range(-0.3, 0.3) * rad, rad * rng.range(0.55, 0.8)]);
    const add = o => { o.room = r.id; tr.push(o); };
    const pool = (kind, n, r0, r1) => { for (let i = 0; i < n; i++) for (let k = 0; k < 20; k++) { const [x, y] = rng.pick(tiles), rad = rng.range(r0, r1), px = x * T + T / 2, py = y * T + T / 2; if (free(px, py, rad)) { add({ kind, x: px, y: py, r: rad, b: blobs(rad), ph: rng() * 9 }); break; } } };
    if (style === 'crypt') {
      const spikes = rng.chance(0.7);
      if (spikes) for (let k = 0; k < 20; k++) { // a run of spike plates that pop in a ripple
        const [sx, sy] = rng.pick(tiles), horiz = rng.chance(0.5), n = rng.int(3, 6), ph = rng() * 2.8, run = [];
        for (let i = 0; i < n; i++) { const x = horiz ? sx + i : sx, y = horiz ? sy : sy + i; if (base(x, y)) run.push([x, y]); }
        if (run.length >= 3 && free(sx * T + T / 2, sy * T + T / 2, 16)) { run.forEach(([x, y], i) => add({ kind: 'spikes', x: x * T + T / 2, y: y * T + T / 2, r: 15, ph: ph + i * 0.22 })); break; }
      }
      if (!spikes || rng.chance(0.4)) pool('gas', rng.int(1, 2), 48, 48);
    } else if (style === 'forest') {
      const pits = rng.chance(0.75);
      if (pits) for (let i = rng.int(1, 3); i > 0; i--) for (let k = 0; k < 20; k++) { // 2x2 covered pit
        const [x, y] = rng.pick(tiles); if (!base(x + 1, y) || !base(x, y + 1) || !base(x + 1, y + 1)) continue;
        const px = (x + 1) * T, py = (y + 1) * T; if (free(px, py, 28)) { add({ kind: 'pit', x: px, y: py, r: 28, hidden: true, ph: rng() * 9 }); break; }
      }
      if (!pits || rng.chance(0.5)) pool('bramble', rng.int(1, 2), 38, 56);
    } else if (style === 'sewer') {
      pool('acid', rng.int(2, 4), 30, 50);
      if (rng.chance(0.7)) pool('sludge', rng.int(1, 3), 40, 60);
    }
  },
  acidPool(x, y, r, life) {
    if (this.solidAt(x, y)) return;
    const temp = this.traps.filter(t => t.life !== undefined); if (temp.length > 40) temp[0].life = 0;
    this.traps.push({ kind: 'acid', x, y, r, life, max: life, ph: R() * 9, b: Array.from({ length: 3 }, () => [R.range(-0.3, 0.3) * r, R.range(-0.25, 0.25) * r, r * R.range(0.55, 0.8)]) });
  },
  trapDmg(e, f) { return Math.max(8, e.maxHp * f); },
  hurtByTrap(e, n) { this.damage(e, n, { trap: true, x: e.x, y: e.y, depth: 1, burn: true, elem: 'none' }); },
  pitFall(t, q, isP) { // drop in, take the hit, climb out at the rim
    if (t.hidden) { t.hidden = false; this.burst(t.x, t.y, 26, '#6a8a4a', 180, 0.5); Snd.play('heavy'); }
    let a = Math.atan2(q.y - t.y, q.x - t.x); if (q.x === t.x && q.y === t.y) a = R() * TAU;
    const rim = k => ({ x: t.x + Math.cos(a + k) * (t.r + q.r + 6), y: t.y + Math.sin(a + k) * (t.r + q.r + 6) });
    let s = rim(Math.PI); if (this.solidAt(s.x, s.y)) s = rim(0); if (this.solidAt(s.x, s.y)) s = this.freeSpot(s.x, s.y);
    q.x = s.x; q.y = s.y;
    this.burst(q.x, q.y, 10, '#8a7a5a', 120, 0.4);
    if (isP) { q.roll = 0; q.pushX = q.pushY = 0; this.text(q.x, q.y - 24, 'Pitfall!', '#ffb057'); this.hurt(q, 1, null, { n: 'Pit trap' }); Render.kick(5); }
    else { q.kx = q.ky = 0; q.stun = Math.max(q.stun || 0, 0.6); this.hurtByTrap(q, this.trapDmg(q, 0.35)); }
  },
  updTraps(dt) {
    if (this.traps.some(t => t.life !== undefined)) this.traps = this.traps.filter(t => t.life === undefined || (t.life -= dt) > 0);
    const ps = this.players.filter(q => this.live(q));
    if (!ps.length) return;
    for (let i = 0; i < ps.length; i++) this.updTrapsFor(ps[i], dt, i === 0);
  },
  updTrapsFor(p, dt, first) {
    const now = this.time;
    let slow = 1, inAcid = false, inGas = false;
    const foes = !first ? [] : this.enemies.filter(e => !e.dead && !e.boss && e.spawnT <= 0 && !(e.bones > 0));
    const on = (t, q, k = 0.85) => d2(t.x, t.y, q.x, q.y) < (t.r * k) ** 2;
    const pOk = p && !p.dead;
    for (const t of this.traps) {
      if (t.kind === 'spikes') {
        const c = (now + t.ph) % 2.8, st = c < 1.9 ? 0 : c < 2.35 ? 1 : 2;
        if (first) { if (st === 2 && t.st !== 2) t.hit = new Set(); t.st = st; }
        if (st === 2) {
          if (pOk && !t.hit.has(p) && d2(t.x, t.y, p.x, p.y) < (t.r + p.r * 0.4) ** 2) { t.hit.add(p); this.hurt(p, 1, null, { n: 'Spike trap' }); }
          for (const e of foes) if (!FLIERS.has(e.type) && !t.hit.has(e) && d2(t.x, t.y, e.x, e.y) < (t.r + e.r * 0.4) ** 2) { t.hit.add(e); this.hurtByTrap(e, this.trapDmg(e, 0.25)); }
        }
      } else if (t.kind === 'gas') {
        const c = (now + t.ph) % 5.5, st = c < 3 ? 0 : c < 3.8 ? 1 : 2;
        if (first && st === 1 && t.st === 0 && pOk && d2(t.x, t.y, p.x, p.y) < 400 ** 2) Snd.play('fizzle');
        if (first) t.st = st;
        if (st === 2) {
          if (pOk && on(t, p)) inGas = true;
          for (const e of foes) if (on(t, e)) { e.gasT = (e.gasT || 0) + dt; if (e.gasT >= 1) { e.gasT = 0; this.hurtByTrap(e, this.trapDmg(e, 0.12)); } }
        }
      } else if (t.kind === 'pit') {
        if (pOk && p.blinkInv <= 0 && on(t, p, 0.72)) this.pitFall(t, p, true);
        for (const e of foes) if (!FLIERS.has(e.type) && on(t, e, 0.72)) this.pitFall(t, e, false);
      } else if (t.kind === 'bramble' || t.kind === 'sludge') {
        if (pOk && on(t, p)) slow = Math.min(slow, t.kind === 'sludge' ? 0.55 : 0.65);
      } else if (t.kind === 'acid') {
        if (pOk && on(t, p)) inAcid = true;
        for (const e of foes) if (!FLIERS.has(e.type) && on(t, e)) { e.acidT = (e.acidT || 0) + dt; if (e.acidT >= 1) { e.acidT = 0; this.hurtByTrap(e, this.trapDmg(e, 0.12)); } }
      }
    }
    if (pOk) {
      p.trapSlow = slow;
      // acid and gas: a moment to step out, then half a heart every second you stay
      p.acidT = inAcid ? (p.acidT || 0) + dt : 0; if (p.acidT >= 0.8) { p.acidT = -0.2; this.text(p.x, p.y - 24, 'Acid!', '#a8ff4a'); this.hurt(p, 1, null, { n: 'Acid' }); }
      p.gasT = inGas ? (p.gasT || 0) + dt : 0; if (p.gasT >= 0.8) { p.gasT = -0.2; this.text(p.x, p.y - 24, 'Poison gas!', '#b6d86a'); this.hurt(p, 1, null, { n: 'Poison gas' }); }
    }
    // stalactites: a shadow, then a rock
    const rm = this.room;
    if (first && this.locked && rm && rm.stal && pOk) {
      this.stalT -= dt;
      if (this.stalT <= 0) {
        this.stalT = R.range(5.5, 9);
        const a = R() * TAU, d = R.range(0, 90), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!this.solidAt(x, y)) this.warn(x, y, 26, 1.1, 1, 'rock', { onFire: w => { for (const e of this.enemies) if (!e.dead && !e.boss && e.spawnT <= 0 && d2(w.x, w.y, e.x, e.y) < (w.r + e.r * 0.5) ** 2) this.hurtByTrap(e, this.trapDmg(e, 0.3)); } });
      }
    }
  },
  // Foes try to step around hazards they can see, some more carefully than others
  trapSteer(e, mx, my) {
    const fly = FLIERS.has(e.type), care = e.care ?? (e.care = R.range(0.15, 0.85));
    let ax = 0, ay = 0, sf = 1;
    for (const t of this.traps) {
      const dx = e.x - t.x, dy = e.y - t.y, dd = dx * dx + dy * dy, range = t.r + e.r + 30;
      if (dd > range * range) continue;
      const d = Math.sqrt(dd) || 1;
      if (!fly && (t.kind === 'sludge' || t.kind === 'bramble') && d < t.r * 0.85) sf = Math.min(sf, 0.65);
      const danger = (t.kind === 'spikes' && t.st >= 1) || (t.kind === 'gas' && t.st >= 1) || (!fly && ((t.kind === 'pit' && !t.hidden) || t.kind === 'acid'));
      if (danger) { const w = (1 - d / range) * care; ax += dx / d * w; ay += dy / d * w; }
    }
    if (!ax && !ay && sf === 1) return [mx, my];
    const m = Math.hypot(mx, my), nx = mx / m + ax * 1.8, ny = my / m + ay * 1.8, n = Math.hypot(nx, ny) || 1;
    return [nx / n * m * sf, ny / n * m * sf];
  },
  planWaves(r, rng) {
    const pool = this.theme.pools[this.level - 1];
    let budget = 2 + Math.ceil(this.depth * 0.85) + rng.int(0, 1) + Math.floor(r.w * r.h / 190) + (r.type === 'exit' ? 4 : 0);
    budget = Math.round(budget * (1 + 0.25 * (this.coopN() - 1))); // a few more foes per extra player
    if (r.route === 'horde') budget = Math.round(budget * 1.7); else if (r.route === 'elite') budget = Math.round(budget * 0.65);
    const nW = (r.type === 'exit' ? 3 : budget >= 7 ? 2 : 1) + (r.route === 'horde' ? 1 : 0) + (r.w * r.h > 500 ? 1 : 0), free = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (this.roomId[y * MW + x] === r.id && this.map[y * MW + x] === FLOOR) free.push([x, y]);
    r.waves = [];
    for (let w = 0; w < nW; w++) {
      let b = Math.ceil(budget / (nW - w)); budget -= b;
      const wave = [];
      for (let guard = 0; b > 0 && guard < 50; guard++) {
        const type = rng.pick(pool), c = EDEF[type].cost;
        if (c > b) { if (guard > 30) { wave.push({ type: pool[0], ...this.tilePos(rng.pick(free)) }); b--; } continue; }
        wave.push({ type, ...this.tilePos(rng.pick(free)) }); b -= c;
        if (type === 'blight' || type === 'gnoll' || type === 'rat') wave.push({ type, ...this.tilePos(rng.pick(free)) }); // they come in packs
      }
      r.waves.push(wave);
    }
  },
  tilePos([x, y]) { return { x: x * T + T / 2, y: y * T + T / 2 }; },

  // ---------- run setup ----------
  startLevel(w, l, keepPlayers) {
    this.gen(w, l);
    this.enemies = []; this.projs = []; this.parts = []; this.pickups = []; this.bolts = []; this.texts = []; this.hazards = []; this.slime = []; this.mark = null; this.resSeen = new Set(); this.challenge = null; this.awayT = 0; this.zones = []; this.warns = []; this.ptraps = []; this.lastHit = null; this.timeStopT = 0; this.decoy = null; this.gnome = null; this.bossDark = false; this.thorns = new Map(); for (const q of this.players) q.relicCd = 0; this.near = null; this.lastNear = null;
    this.locked = false; this.waves = []; this.boss = null; this.room = null;
    const s = this.rooms[0];
    this.placeKeyAndChest();
    const cp = Game.mode === 'campaign' && Game.char && Game.char.corpse;
    if (cp && cp.seed === Game.seed && cp.world === w && cp.stage === l) this.pickups.push({ kind: 'corpse', x: cp.x, y: cp.y, t: 1 });
    if (Game.mode === 'quick' && this.depth > 1) { this.pickups.push({ kind: 'merchant', x: s.mx * T + T / 2 + T * 3, y: s.my * T + T / 2 - T, t: 1 }); this.merchant = Merchant.stock(this.depth); }
    if (!keepPlayers) this.players = [this.makePlayer(0)];
    this.groupTook = {};
    this.players.forEach((p, i) => { p.x = s.mx * T + T / 2 + (i - (this.players.length - 1) / 2) * 30; p.y = s.my * T + T / 2; p.vx = p.vy = 0; p.inPortal = false; p.near = null; if (p.downed) { p.downed = false; p.hp = Math.max(p.hp, 2); } });
    Render.snapCamera();
    Game.banner(this.theme.n, `Level ${levelLabel(w, l)}`, 2.6);
    Music.target = 0;
  },
  baseStats(cls0) {
    const cls = cls0 || Game.cls || 'fighter', lvl = Game.mode === 'campaign' && Game.char ? Game.char.lvl : 1;
    return { speed: 155, rollCd: 0.42, dmg: (Game.mods.glass ? 3 : 1) * (1 + 0.03 * (lvl - 1)), meleeDmg: cls === 'fighter' ? 1.2 : cls === 'mage' ? 0.8 : 1, rangedDmg: 1, draw: cls === 'ranger' ? 0.8 : 1, rate: 1, extraShots: 0, bounce: 0, reach: 1, homing: 0, reflect: false, magicDmg: 1, manaAdd: 0, regenMult: 1, addElem: new Set(), crit: 0, critMult: 2, hurtMult: 1, hungryN: 15, parry: 0.35, pierceAdd: 0, aura: false };
  },
  // Rebuild stats from scratch from the items held, so items can be dropped cleanly
  recalc(p) {
    p.st = this.baseStats(p.cls); p.hooks = { shoot: [], hit: [], kill: [], roll: [], hurt: [], clear: [] };
    p.maxHp = p.baseHp; p.revives = 0;
    for (const id of p.items) ITEMS.find(it => it.id === id).apply(p);
    p.syn = SYNERGIES.filter(s => s.need.every(id => p.items.includes(id))).map(s => s.id);
    for (const s of SYNERGIES) if (p.syn.includes(s.id) && s.apply) s.apply(p);
    for (const b of p.buffs || []) potionById(b.id).buff(p); // active potion effects
    if (p.baseMana !== undefined) { p.maxMana = p.baseMana + p.st.manaAdd; p.mana = Math.min(p.mana, p.maxMana); p.manaRegen = p.baseRegen * p.st.regenMult; }
    p.hp = Math.min(p.hp, p.maxHp);
  },
  dropItem(p, idx) {
    const id = p.items[idx]; if (!id) return;
    p.items.splice(idx, 1); this.recalc(p);
    const s = this.freeSpot(p.x + 30, p.y);
    this.pickups.push({ kind: 'item', item: ITEMS.find(it => it.id === id), x: s.x, y: s.y, t: 0, dropped: true });
  },
  makePlayer(slot) {
    const sr = RNG(hash(Game.seedNum, 0, 11)), C = CLASSES[Game.cls || 'fighter'];
    const st = this.baseStats(), ch = Game.mode === 'campaign' ? Game.char : null;
    const hp = Game.mods.glass ? 2 : C.hp + (Meta.has('heart1') ? 2 : 0) + (Meta.has('heart2') ? 2 : 0) + (ch ? 2 * Math.floor(ch.lvl / 5) : 0);
    const kit = Meta.has('kit') ? 1 : 0, gold = Game.mods.allLegendary;
    const starter = k => makeWeapon(sr, { type: k.type, spell: k.spell, rarity: gold ? 4 : kit, elem: kit || gold || k.type === 'wand' || k.type === 'spellbook' ? undefined : 'none', name: kit || gold ? undefined : k.name });
    const maxMana = Math.round(100 * C.mana);
    return {
      slot, src: 'auto', x: 0, y: 0, r: 9, vx: 0, vy: 0, hp, maxHp: hp, baseHp: hp, parryT: 0, swapT: 0, lungeQ: false, inv: 0, roll: 0, rollCd: 0, rdx: 1, rdy: 0, aim: 0, slowT: 0,
      cls: Game.cls || 'fighter', guard: (Game.cls || 'fighter') === 'fighter', guardT: 0, weapons: ch ? Campaign.loadoutWeapons(ch) : C.kit.map(starter),
      wi: 0, cd: 0, charge: 0, echo: 0, swings: [], items: [], syn: [], st,
      hooks: { shoot: [], hit: [], kill: [], roll: [], hurt: [], clear: [] },
      revives: 0, kills: 0, embers: 0, rs: this.newRunStats(), killer: null, lastWho: null, dead: false, color: '#ffe9c4', swingDir: 1,
      mana: maxMana + (ch ? 2 * (ch.lvl - 1) : 0), maxMana: maxMana + (ch ? 2 * (ch.lvl - 1) : 0), manaRegen: C.regen, baseRegen: C.regen, baseMana: maxMana + (ch ? 2 * (ch.lvl - 1) : 0), exhausted: false, keys: 0, stolen: null,
      potion: ch ? ch.load.potion : null, relic: ch ? ch.load.relic : null, relicCd: 0, buffs: [], roomsCleared: 0, dispReady: false, auraT: 0, manaIdle: 0, lungeWin: 0, lunge: 0, blinkInv: 0, trapT: 0,
    };
  },

  // ---------- tiles & collision ----------
  tile(x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return VOID; return this.map[ty * MW + tx]; },
  solidAt(x, y) { return solidT(this.tile(x, y)); },
  resolve(e) {
    let hit = false;
    const x0 = Math.floor((e.x - e.r) / T), x1 = Math.floor((e.x + e.r) / T), y0 = Math.floor((e.y - e.r) / T), y1 = Math.floor((e.y + e.r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || (e.fly ? solidT : walkBlockT)(this.map[ty * MW + tx])) {
        const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
        const dx = e.x - cx, dy = e.y - cy, dd = dx * dx + dy * dy;
        if (dd < e.r * e.r) {
          hit = true;
          if (dd > 0.0001) { const d = Math.sqrt(dd), push = e.r - d; e.x += dx / d * push; e.y += dy / d * push; }
          else {
            const l = e.x - tx * T, r = tx * T + T - e.x, u = e.y - ty * T, b = ty * T + T - e.y, m = Math.min(l, r, u, b);
            if (m === l) e.x -= l + e.r; else if (m === r) e.x += r + e.r; else if (m === u) e.y -= u + e.r; else e.y += b + e.r;
          }
        }
      }
    }
    return hit;
  },
  move(e, dx, dy) {
    if (e.ghost) { e.x += dx; e.y += dy; const r = this.room; if (r) { e.x = clamp(e.x, (r.x + 1) * T, (r.x + r.w - 1) * T); e.y = clamp(e.y, (r.y + 1) * T, (r.y + r.h - 1) * T); } return false; }
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
  roomAt(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return null;
    const id = this.roomId[ty * MW + tx]; return id >= 0 ? this.rooms[id] : null;
  },
  freeSpot(x, y) {
    const okAt = (px, py) => !this.solidAt(px, py) && this.tile(px, py) !== DOOR && this.tile(px, py) !== CHASM;
    if (okAt(x, y)) return { x, y };
    for (let rad = 1; rad < 6; rad++) for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * TAU / 8) * rad * T, py = y + Math.sin(a * TAU / 8) * rad * T;
      if (okAt(px, py)) return { x: Math.floor(px / T) * T + T / 2, y: Math.floor(py / T) * T + T / 2 };
    }
    return { x, y };
  },
  buildFlow(ps) {
    const r = this.room; if (!r) return;
    if (!Array.isArray(ps)) ps = [ps]; ps = ps.filter(Boolean); if (!ps.length) return;
    const ks = ps.map(p => Math.floor(p.y / T) * MW + Math.floor(p.x / T)), k = ks.join(',');
    if (k === this.flowKey) return; this.flowKey = k;
    const f = this.flow; f.fill(-1);
    const x0 = r.x - 1, x1 = r.x + r.w, y0 = r.y - 1, y1 = r.y + r.h;
    const q = []; for (const s of ks) if (f[s] === -1) { f[s] = 0; q.push(s); }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % MW, y = (i - x) / MW;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = ny * MW + nx; if (f[j] !== -1 || walkBlockT(this.map[j])) continue;
        f[j] = f[i] + 1; q.push(j);
      }
    }
  },
  flowDir(e, p) {
    const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T), i = ty * MW + tx, f = this.flow;
    if (e.ghost || !f || f[i] < 0 || d2(e.x, e.y, p.x, p.y) < 50 * 50 || (f[i] <= 3 && this.los(e.x, e.y, p.x, p.y))) return Math.atan2(p.y - e.y, p.x - e.x);
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
  randomRoomTile(r, awayFrom, minD) {
    for (let k = 0; k < 40; k++) {
      const tx = r.x + 1 + R.int(0, r.w - 3), ty = r.y + 1 + R.int(0, r.h - 3), px = tx * T + T / 2, py = ty * T + T / 2;
      if (this.roomId[ty * MW + tx] === r.id && this.map[ty * MW + tx] === FLOOR && (!awayFrom || d2(px, py, awayFrom.x, awayFrom.y) > minD * minD)) return { x: px, y: py };
    }
    return null;
  },

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    for (const p of this.players) if (this.live(p)) { this.cur = p; this.updPlayer(p, dt); }
    this.updDowned(dt);
    if (this.challenge) this.updChallenge(dt);
    for (const e of this.enemies) if (e.champ === 'regenerating' && !e.dead && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
    this.updRooms();
    if (this.room && this.locked) { this.flowT -= dt; if (this.flowT <= 0) { this.flowT = 0.15; this.buildFlow(this.decoy ? [this.decoy] : this.lives()); } }
    this.timeStopT -= dt;
    this.updAllies(dt);
    if (this.timeStopT <= 0) for (const e of this.enemies) { this.foeCtx = e; this.updEnemy(e, dt); }
    this.foeCtx = null;
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
      const a = en[i], b = en[j]; if (a.dead || b.dead || a.bones > 0 || b.bones > 0 || a.ghost || b.ghost) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, dd = dx * dx + dy * dy;
      if (dd < rr * rr && dd > 0.01) { const d = Math.sqrt(dd), push = (rr - d) / 2, nx = dx / d, ny = dy / d; const wa = a.boss ? 0 : 1, wb = b.boss ? 0 : 1; a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb; }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
    this.rally = this.enemies.some(e => e.type === 'banner');
    this.updProjs(dt);
    this.updHazards(dt);
    this.updWarns(dt);
    if (this.lastHit) this.lastHit.t -= dt;
    this.updPickups(dt);
    for (const s of this.parts) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; const k = Math.exp(-(s.drag || 3) * dt); s.vx *= k; s.vy *= k; }
    this.parts = this.parts.filter(s => s.life > 0);
    if (this.parts.length > 800) this.parts.splice(0, this.parts.length - 800);
    for (const b of this.bolts) b.life -= dt; this.bolts = this.bolts.filter(b => b.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 30 * dt; } this.texts = this.texts.filter(t => t.life > 0);
    if (this.locked && this.waves.length) {
      this.waveT -= dt;
      const alive = this.enemies.filter(e => !e.boss).length;
      if (alive <= 1 && this.waveT <= 0) this.spawnWave(this.waves.shift());
    }
    if (this.locked && !this.challenge && !this.waves.length && !this.enemies.length) this.clearRoom();
  },

  updPlayer(p, dt) {
    this.near = p.near || null;
    const inp = Input.read(p.src, p);
    p.inp = inp;
    if (p.fallT > 0) { p.fallT -= dt; p.inv = Math.max(p.inv, 0.1); if (p.fallT <= 0) this.climbOut(p); return; }
    if (inp.autoAim) { const a = this.autoTarget(p); if (a !== null) p.aim = a; }
    else if (inp.aim !== null) p.aim = inp.assist ? this.assist(p, inp.aim) : inp.aim;
    else if (inp.device !== 'kb' && (inp.mx || inp.my) && !p.charge) p.aim = Math.atan2(inp.my, inp.mx);
    p.inv -= dt; p.rollCd -= dt; p.slowT -= dt; p.lungeWin -= dt; p.manaIdle += dt; p.parryT -= dt; p.swapT -= dt;
    p.mana = Math.min(p.maxMana, p.mana + dt * (p.exhausted ? 10 : p.manaIdle > 0.9 ? 34 : 14) * p.manaRegen); p.blinkInv -= dt; p.thornCd = (p.thornCd || 0) - dt;
    if (Dev.active('mana')) { p.mana = p.maxMana; p.exhausted = false; }
    if (p.exhausted && p.mana >= p.maxMana * 0.5) { p.exhausted = false; Snd.play('charge'); }
    if (p.stolen) { // a gelatinous cube is holding one of your weapons
      p.stolen.t -= dt;
      if (p.stolen.t <= 0 || p.stolen.by.dead) { this.text(p.x, p.y - 24, 'Weapon recovered!', '#6fe3c8'); if (p.stolen.by) p.stolen.by.holding = null; p.stolen = null; }
      else if (p.wi === p.stolen.idx) p.wi = 1 - p.stolen.idx;
    }
    for (const ww of p.weapons) ww.cdT = (ww.cdT || 0) - dt; // each weapon keeps its own cooldown
    if (p.cls === 'fighter' && !p.guard && p.weapons[p.wi].cat === 'melee') { p.guardT += dt; if (p.guardT >= 10) { p.guard = true; p.guardT = 0; this.text(p.x, p.y - 24, 'Guard up', '#cfe3ff'); Snd.play('charge'); } }
    const w = p.weapons[p.wi], melee = w.cat === 'melee';
    // swings keep cutting enemy shots for as long as the blade is moving
    for (const s of p.swings) { s.t += dt; if (s.t < s.dur + 0.1) this.cutShots(p, s); if (s.t <= s.dur + 0.03) this.swingHits(p, s); }
    p.swings = p.swings.filter(s => s.t < s.dur + 0.12);
    if (p.lunge > 0) {
      p.lunge -= dt;
      p.fly = true; this.move(p, Math.cos(p.aim) * 520 * dt, Math.sin(p.aim) * 520 * dt); p.fly = false;
      this.part(p.x, p.y, R.range(-20, 20), R.range(-20, 20), 0.3, 3, '#ffd27a', true);
      if (p.lunge <= 0) this.swing(p, p.lungeW, false, true);
      return;
    }
    if (p.pushX || p.pushY) { p.fly = true; this.move(p, p.pushX * dt, p.pushY * dt); p.fly = false; const k = Math.exp(-7 * dt); p.pushX *= k; p.pushY *= k; if (Math.abs(p.pushX) + Math.abs(p.pushY) < 5) p.pushX = p.pushY = 0; }
    if (p.roll > 0) {
      if (inp.attack && melee) p.lungeQ = true; // attack any time during the roll to lunge out of it
      p.roll -= dt;
      const sp = 340 * (p.roll > 0.12 ? 1 : 0.6);
      p.fly = true; this.move(p, p.rdx * sp * dt, p.rdy * sp * dt); p.fly = false; // rolls carry you over gaps
      if (R.chance(0.6)) this.part(p.x, p.y, R.range(-20, 20), R.range(-20, 20), 0.35, 3, '#bfe3ff');
      if (p.cls === 'ranger') { p.trapT -= dt; if (p.trapT <= 0) { p.trapT = 0.11; this.caltrop(p); } }
      if (p.roll <= 0) {
        p.lungeWin = 0.3;
        if (p.lungeQ && melee) { p.lungeQ = false; p.lungeWin = 0; p.lunge = 0.13; p.lungeW = w; w.cdT = w.cd / p.st.rate; Snd.play('roll'); }
      }
    } else {
      if (inp.roll && p.rollCd <= 0) {
        let dx = inp.mx, dy = inp.my; if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
        const l = Math.hypot(dx, dy); p.rdx = dx / l; p.rdy = dy / l;
        p.charge = 0; p.slowT = 0; p.lungeQ = false;
        if (p.cls === 'mage') this.blink(p);
        else { if (this.tile(p.x, p.y) === FLOOR) { p.safeX = Math.floor(p.x / T) * T + T / 2; p.safeY = Math.floor(p.y / T) * T + T / 2; p.safeMap = this.map; } p.roll = 0.34; p.rollCd = p.st.rollCd + 0.34; p.trapT = 0; Snd.play('roll'); }
        for (const h of p.hooks.roll) h();
      }
      const sp = p.st.speed * (p.charge > 0 ? 0.68 : 1) * (p.slowT > 0 ? 0.5 : 1) * (p.slimed ? 0.6 : 1) * (p.trapSlow || 1);
      const k = 1 - Math.exp(-18 * dt);
      p.vx = lerp(p.vx, inp.mx * sp, k); p.vy = lerp(p.vy, inp.my * sp, k);
      // walking into a pit takes a quarter second of pushing, so a thumb slip on the stick doesn't drop you
      let press = 0;
      if (Math.abs(inp.mx) > 0.3 && this.tile(p.x + Math.sign(inp.mx) * (p.r + 3), p.y) === CHASM) press = Math.max(press, Math.abs(inp.mx));
      if (Math.abs(inp.my) > 0.3 && this.tile(p.x, p.y + Math.sign(inp.my) * (p.r + 3)) === CHASM) press = Math.max(press, Math.abs(inp.my));
      p.edgeT = press ? (p.edgeT || 0) + dt * press : Math.max(0, (p.edgeT || 0) - dt * 3);
      if (press && R.chance(dt * 14)) this.part(p.x + Math.sign(inp.mx) * p.r, p.y + Math.sign(inp.my) * p.r, R.range(-20, 20), 40, 0.4, 2, '#8a7a6a');
      p.fly = p.edgeT >= 0.25 || Math.abs(p.pushX) + Math.abs(p.pushY) > 40; this.move(p, p.vx * dt, p.vy * dt); p.fly = false;
    }
    if (p.roll <= 0 && p.lunge <= 0) {
      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), t = this.map[ty * MW + tx];
      if (t === CHASM) { this.fallIn(p); return; }
      if (t === FLOOR || t === DOOR) { p.safeX = tx * T + T / 2; p.safeY = ty * T + T / 2; p.safeMap = this.map; }
    }
    if (p.buffs.length) { let changed = false; for (const b of p.buffs) { b.t -= dt; if (b.t <= 0) changed = true; } if (changed) { p.buffs = p.buffs.filter(b => b.t > 0); this.recalc(p); } }
    if (p.st.aura) { p.auraT -= dt; if (p.auraT <= 0) { p.auraT = 0.5; this.chain({ x: p.x, y: p.y }, 7 * p.st.dmg, 1, p, p.x, p.y); } }
    if (inp.potion) this.usePotion(p);
    if (inp.relic) this.useRelic(p);
    if (inp.swap && p.weapons.length > 1 && !p.stolen) { p.wi = 1 - p.wi; p.charge = 0; p.swapT = 0.12; Snd.play('ui'); }
    // E / USE: tap to take; hold half a second on a weapon or relic to salvage it for embers
    if (inp.bag) this.toBag(p);
    const nk = this.near, salv = nk && (nk.kind === 'weapon' || nk.kind === 'relic');
    if (salv) {
      if (inp.useHeld) { if (p.salvK !== nk) { p.salvK = nk; p.salvT = 0; } if (p.salvT >= 0) { p.salvT += dt; if (p.salvT >= 0.5) { this.salvage(p, nk); p.salvT = -1; } } }
      else { if (p.salvT > 0 && p.salvK === nk) this.interact(p); p.salvT = 0; p.salvK = null; }
    } else { p.salvT = inp.useHeld && p.salvT < 0 ? -1 : 0; p.salvK = null; if (inp.use) this.interact(p); }
    if (p.echo > 0) { p.echo -= dt; if (p.echo <= 0) this.swing(p, p.echoW, true); }
    if (p.roll > 0) { p.charge = 0; return; }
    const W2 = p.weapons[p.wi];
    const ready = inp.attack && W2.cdT <= 0 && p.swapT <= 0, cdSet = () => W2.cdT = W2.cd / p.st.rate;
    switch (W2.type) {
      case 'sword': case 'axe': case 'hammer': case 'spear':
        if (ready && p.lungeWin > 0) { p.lungeWin = 0; p.lunge = 0.13; p.lungeW = W2; cdSet(); Snd.play('roll'); }
        else if (ready) { this.swing(p, W2); cdSet(); if (hasQ(W2, 'echo')) { p.echo = 0.14; p.echoW = W2; } }
        break;
      case 'bow':
        if (inp.attack && W2.cdT <= 0 && p.swapT <= 0) {
          const prev = p.charge; p.charge = Math.min(1, Math.max(0.001, p.charge + dt * p.st.rate / (W2.charge * p.st.draw)));
          if (prev < 1 && p.charge >= 1) { Snd.play('charge'); for (let i = 0; i < 8; i++) this.part(p.x, p.y, Math.cos(i * TAU / 8) * 60, Math.sin(i * TAU / 8) * 60, 0.3, 2.5, ELEM[W2.elem].c, true); }
        } else if (p.charge > 0) { this.fireBow(p, W2); p.charge = 0; cdSet(); }
        break;
      case 'crossbow': if (ready) { this.fireCrossbow(p, W2); cdSet(); } break;
      case 'wand': case 'staff': if (ready) {
        const cost = WBASE[W2.type].mana;
        if (!p.exhausted && p.mana >= cost) { p.mana -= cost; p.manaIdle = 0; this.fireBolt(p, W2); cdSet(); if (p.mana < 0.5) { p.mana = 0; p.exhausted = true; } }
        else { if (!p.exhausted) { p.mana = 0; p.exhausted = true; } W2.cdT = 0.25; p.manaFlash = 0.4; Snd.play('fizzle'); }
      } break;
      case 'spellbook': if (ready) { this.cast(p, W2); cdSet(); } break;
    }
  },
  usePotion(p) {
    const P = p.potion && potionById(p.potion); if (!P) return;
    p.potion = null; Snd.play('heart'); this.burst(p.x, p.y, 20, P.c, 160, 0.5);
    if (P.use) P.use(p);
    if (P.buff) { p.buffs = p.buffs.filter(b => b.id !== P.id); p.buffs.push({ id: P.id, t: P.dur, max: P.dur }); this.recalc(p); }
    Game.banner('', P.n, 1.2);
  },
  useRelic(p) {
    const Rl = p.relic && relicById(p.relic); if (!Rl || !Rl.active) return;
    if (p.relicCd > 0) { Snd.play('fizzle'); this.text(p.x, p.y - 24, `Recharging: ${p.relicCd} room${p.relicCd > 1 ? 's' : ''}`, '#aaa'); return; }
    p.relicCd = Rl.cd; Rl.use(p); Snd.play('synergy');
  },
  throwBomb(p) {
    const w = { elem: 'none', quirks: [] };
    const b = this.mkProj(p, w, p.aim, { speed: 330, r: 7, kind: 'bomb', life: 0.75, dmg: 0, blast: { rad: 95, dmg: 45 * p.st.dmg, elem: 'none' }, pierce: 99, bounce: 1, homing: 0, drag: 2.2 });
    b.hit = new Set(this.enemies); // sails over foes and goes off where it lands
  },
  timeStop(sec) { this.timeStopT = sec; Render.kick(6); Game.banner('', 'Time stands still', 1.2); },
  spawnDecoy(p) { this.decoy = { x: p.x, y: p.y, vx: 0, vy: 0, t: 7, r: 9, dead: false, isDecoy: true }; this.burst(p.x, p.y, 20, '#c8a0ff', 160, 0.5); },
  spawnGnome(p) { const s = this.freeSpot(p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30); this.gnome = { x: s.x, y: s.y, t: 12, cd: 0.6, aim: p.aim, p }; this.burst(s.x, s.y, 20, '#7dff7a', 160, 0.5); Snd.play('blink'); },
  updAllies(dt) {
    if (this.decoy) { this.decoy.t -= dt; if (this.decoy.t <= 0) { this.burst(this.decoy.x, this.decoy.y, 16, '#c8a0ff', 140, 0.4); this.decoy = null; } }
    const g = this.gnome;
    if (g) {
      g.t -= dt; g.cd -= dt;
      let best = null, bd = 420 * 420;
      for (const e of this.enemies) { if (e.dead || e.spawnT > 0 || e.air || e.bones > 0) continue; const dd = d2(g.x, g.y, e.x, e.y); if (dd < bd && this.los(g.x, g.y, e.x, e.y)) { bd = dd; best = e; } }
      if (best) g.aim = Math.atan2(best.y - g.y, best.x - g.x);
      if (best && g.cd <= 0) {
        g.cd = 0.55; const p = g.p;
        this.projs.push({ x: g.x + Math.cos(g.aim) * 12, y: g.y + Math.sin(g.aim) * 12, vx: Math.cos(g.aim) * 480, vy: Math.sin(g.aim) * 480, owner: 'p', life: 1, r: 5, kind: 'bolt', dmg: 13 * p.st.dmg * (1 + 0.1 * (this.depth - 1)), elem: 'none', color: '#ffd27a', hit: new Set(), depth: 1, pierce: 0, bounce: 0, homing: 0, p });
        Snd.play('thunk'); this.burst(g.x + Math.cos(g.aim) * 14, g.y + Math.sin(g.aim) * 14, 4, '#ffd27a', 80, 0.2);
      }
      if (g.t <= 0) { this.burst(g.x, g.y, 16, '#7dff7a', 140, 0.4); this.gnome = null; }
    }
  },
  blink(p) { // Mage: hop up to ~150px, through shots, stopping at walls
    const x0 = p.x, y0 = p.y, test = { x: p.x, y: p.y, r: p.r };
    let bx = p.x, by = p.y;
    for (let d = 10; d <= 205; d += 10) {
      test.x = x0 + p.rdx * d; test.y = y0 + p.rdy * d;
      const blocked = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => this.solidAt(test.x + ox * p.r, test.y + oy * p.r));
      if (blocked) break;
      if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => this.tile(test.x + ox * p.r, test.y + oy * p.r) === CHASM)) { bx = test.x; by = test.y; }
    }
    this.burst(x0, y0, 16, '#b58bff', 160, 0.4);
    p.x = bx; p.y = by; p.vx = p.vy = 0;
    this.burst(p.x, p.y, 16, '#d6a2ff', 160, 0.4);
    this.bolts.push({ x1: x0, y1: y0, x2: p.x, y2: p.y, life: 0.12, seed: R() * 1000, col: '#d6a2ff' });
    p.blinkInv = 0.3; p.rollCd = p.st.rollCd + 0.5;
    Snd.play('blink');
  },
  caltrop(p) { // Ranger: spikes left behind while rolling
    this.ptraps.push({ x: p.x + R.range(-6, 6), y: p.y + R.range(-6, 6), r: 12, life: 6, hits: 2, dmg: 6 * p.st.dmg * p.st.rangedDmg, p, a: R() * TAU });
    const mine = this.ptraps.filter(t => t.p === p && !t.fading); // cap of 6: the oldest fade out
    for (let i = 0; i < mine.length - 6; i++) { mine[i].fading = true; mine[i].life = Math.min(mine[i].life, 0.4); }
  },
  cutShots(p, s) {
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    for (const pr of this.projs) {
      if (pr.owner !== 'e' || pr.dead) continue;
      const px = pr.x - p.x, py = pr.y - p.y, dd = Math.hypot(px, py);
      const inArc = s.kind === 'spear' ? (px * ca + py * sa > -6 && px * ca + py * sa < s.reach + pr.r + 6 && Math.abs(-px * sa + py * ca) < pr.r + 18)
        : dd <= s.reach + pr.r + 10 && Math.abs(angDiff(s.a, Math.atan2(py, px))) <= s.arc / 2 + 0.35;
      if (!inArc) continue;
      if (p.st.reflect) {
        const sp = Math.hypot(pr.vx, pr.vy) * 1.6, na = Math.atan2(py, px);
        Object.assign(pr, { owner: 'p', vx: Math.cos(na) * sp, vy: Math.sin(na) * sp, dmg: s.dmg * 0.7, color: '#bfe3ff', elem: 'none', hit: new Set(), depth: 1, p, life: 1, pierce: 0, bounce: 0, homing: 1.5, kind: 'bolt' });
      } else pr.dead = true;
      p.parryT = p.st.parry; // a clean cut buys a moment where shots can't touch you
      if (this.hasSyn('thornwall') && p.thornCd <= 0) { p.thornCd = 0.8; this.ring(p.x, p.y, 10, 6 * p.st.dmg, 'none'); }
      this.burst(pr.x, pr.y, 6, '#ffffff', 120, 0.25); Snd.play('deflect');
    }
  },
  autoTarget(p) { // touch attack button: face the nearest foe you can see
    let best = null, bd = 520 * 520;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.bones > 0 || e.air) continue;
      const dd = d2(p.x, p.y, e.x, e.y); if (dd < bd && this.los(p.x, p.y, e.x, e.y)) { bd = dd; best = e; }
    }
    if (!best) for (const e of this.enemies) { if (e.dead || e.spawnT > 0 || e.bones > 0) continue; const dd = d2(p.x, p.y, e.x, e.y); if (dd < bd) { bd = dd; best = e; } }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : null;
  },
  assist(p, a) {
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.bones > 0) continue;
      const ea = Math.atan2(e.y - p.y, e.x - p.x), dd = d2(p.x, p.y, e.x, e.y);
      if (Math.abs(angDiff(a, ea)) < 0.45 && dd < 500 * 500 && dd < bd) { bd = dd; best = ea; }
    }
    return best === null ? a : best;
  },
  critRoll(p, w) { return R.chance((w.crit || 0) + p.st.crit) ? p.st.critMult + (hasQ(w, 'brutal') ? 0.75 : 0) : 1; },
  twinM(w) { return hasQ(w, 'twin') ? 0.6 : 1; }, // Twin: two shots at 60% each
  shotCount(p, w) { return 1 + p.st.extraShots + (hasQ(w, 'twin') ? 1 : 0); },
  mkProj(p, w, a, o) {
    const pr = Object.assign({
      x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12, owner: 'p', life: 1.1, pierce: hasQ(w, 'pierce') ? 1 : 0,
      bounce: p.st.bounce, elem: w.elem, homing: p.st.homing + (hasQ(w, 'seeking') ? 2.5 : 0) + (w.elem === 'arcane' ? 1.2 : 0),
      hit: new Set(), depth: 0, p, wn: w.name, wcat: w.cat, leech: hasQ(w, 'leech'), color: ELEM[w.elem].c, stun: hasQ(w, 'stun') && R.chance(0.25) ? 0.7 : 0,
    }, o);
    pr.vx = Math.cos(a) * o.speed; pr.vy = Math.sin(a) * o.speed;
    if (pr.kind !== 'spark' && pr.kind !== 'bomb') pr.pierce += p.st.pierceAdd;
    for (const h of p.hooks.shoot) h(pr);
    this.projs.push(pr); return pr;
  },
  fireBow(p, w) {
    const c = p.charge, full = c >= 1, n = this.shotCount(p, w), cm = this.critRoll(p, w); if (p.rs) p.rs.atk++;
    for (let i = 0; i < n; i++) {
      const a = p.aim + (i - (n - 1) / 2) * 0.1;
      this.mkProj(p, w, a, { speed: w.speed * (0.55 + 0.45 * c), r: full ? 5 : 4, kind: 'arrow', life: 1.3, dmg: w.dmg * p.st.dmg * p.st.rangedDmg * (0.3 + 0.7 * c) * (full ? 1.3 : 1) * cm * this.twinM(w), crit: cm > 1, pierce: (full ? 1 : 0) + (hasQ(w, 'pierce') ? 1 : 0), full });
    }
    Snd.play('arrow'); Render.kick(full ? 3 : 1);
  },
  fireCrossbow(p, w) {
    if (p.rs) p.rs.atk++;
    const n = this.shotCount(p, w), cm = this.critRoll(p, w);
    for (let i = 0; i < n; i++) this.mkProj(p, w, p.aim + (i - (n - 1) / 2) * 0.09, { speed: w.speed, r: 4, kind: 'arrow', full: true, life: 1.2, dmg: w.dmg * p.st.dmg * p.st.rangedDmg * cm * this.twinM(w), crit: cm > 1, pierce: 99 });
    Snd.play('arrow'); Snd.play('thunk'); Render.kick(3);
  },
  fireBolt(p, w) {
    if (p.rs) p.rs.atk++;
    const n = this.shotCount(p, w), staff = w.type === 'staff';
    for (let i = 0; i < n; i++) {
      const cm = this.critRoll(p, w), a = p.aim + (i - (n - 1) / 2) * 0.16 + R.range(-w.spread, w.spread);
      this.mkProj(p, w, a, { speed: w.speed, r: staff ? 6 : 4, kind: 'bolt', life: 1.0, dmg: w.dmg * p.st.dmg * p.st.magicDmg * cm * this.twinM(w), crit: cm > 1, elemPow: staff ? 2 : 1 });
    }
    Snd.play('bolt');
  },
  cast(p, w) {
    if (p.rs) p.rs.atk++;
    const dmg = w.dmg * p.st.dmg * p.st.magicDmg, a = p.aim, cm = this.critRoll(p, w);
    if (w.spell === 'fireball') {
      this.mkProj(p, w, a, { speed: 300, r: 8, kind: 'fireball', life: 1.4, dmg: dmg * 0.3, blast: { rad: 74, dmg: dmg * cm }, crit: cm > 1, pierce: 0, bounce: 0 });
      Snd.play('whoosh');
    } else if (w.spell === 'chain') {
      this.mkProj(p, w, a, { speed: 950, r: 5, kind: 'zap', life: 0.45, dmg: dmg * cm, crit: cm > 1, chains: 4, homing: 3 });
      Snd.play('zap');
    } else if (w.spell === 'icestorm') {
      let tx = p.x, ty = p.y;
      for (let d = 0; d <= 180; d += 12) { const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d; if (this.solidAt(x, y)) break; tx = x; ty = y; }
      this.zones.push({ x: tx, y: ty, r: 64, t: 0, dur: 0.95, tick: 0, dmg: dmg * cm, p });
      Snd.play('charge');
    } else {
      for (let i = 0; i < 5; i++) this.mkProj(p, w, a + (i - 2) * 0.32, { speed: 330, r: 4, kind: 'bolt', life: 1.4, dmg: dmg * cm, crit: cm > 1, homing: 7 });
      Snd.play('bolt');
    }
    Render.kick(2);
  },
  swing(p, w, echo, lunge) {
    const wide = hasQ(w, 'wide') ? 1.25 : 1, reach = w.reach * p.st.reach * (lunge ? 1.15 : 1) * wide, arc = (lunge ? Math.max(w.arc, 1.6) : w.arc) * wide, a = p.aim, type = w.type, cm = this.critRoll(p, w);
    const dmg = w.dmg * p.st.dmg * p.st.meleeDmg * (echo ? 0.45 : 1) * (lunge ? 1.6 : 1) * cm;
    if (lunge) { Render.kick(5); this.burst(p.x + Math.cos(a) * reach * 0.6, p.y + Math.sin(a) * reach * 0.6, 14, '#ffd27a', 200, 0.35); }
    p.swingDir = -p.swingDir;
    const dur = { sword: 0.15, axe: 0.21, hammer: 0.22, spear: 0.12 }[type];
    if (!echo && p.rs) p.rs.atk++;
    const src = { melee: true, wtype: type, wn: w.name, dmg, elem: w.elem, x: p.x, y: p.y, depth: 0, p, leech: hasQ(w, 'leech'), crit: cm > 1, blunt: type === 'hammer', stun: type === 'hammer' ? 0.9 : hasQ(w, 'stun') && R.chance(0.25) ? 0.7 : 0 };
    const sw = { a, arc, reach, t: 0, dur, color: ELEM[w.elem].c, dir: p.swingDir, kind: type, dmg, src, hit: new Set(), tiles: new Set() };
    p.swings.push(sw); this.cutShots(p, sw); this.swingHits(p, sw);
    Snd.play(type === 'hammer' || type === 'axe' ? 'heavy' : 'swing');
    if (hasQ(w, 'wave')) this.mkProj(p, w, a, { speed: 380, r: 13, kind: 'wave', life: 0.42, dmg: dmg * 0.6, pierce: 99, bounce: 0, homing: 0 });
  },
  // The hitbox follows the blade: anything inside the part of the arc swept so far gets hit (once per swing)
  swingHits(p, s) {
    const prog = clamp(s.t / s.dur + 0.2, 0, 1), src = s.src;
    src.x = p.x; src.y = p.y;
    const a0 = s.a - s.arc / 2 * s.dir, ca = Math.cos(s.a), sa = Math.sin(s.a);
    let first = false;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.air || s.hit.has(e)) continue;
      const ex = e.x - p.x, ey = e.y - p.y, dd = Math.hypot(ex, ey);
      let hit;
      if (s.kind === 'spear') { const along = ex * ca + ey * sa, perp = Math.abs(-ex * sa + ey * ca); hit = along > -6 && along < s.reach * Math.min(1, prog * 1.6) + e.r && perp < e.r + 10; }
      else {
        const tol = dd > 1 ? Math.asin(Math.min(1, e.r / dd)) : Math.PI, rel = angDiff(a0, Math.atan2(ey, ex)) * s.dir;
        hit = dd <= s.reach + e.r && ((rel >= -tol && rel <= s.arc * prog + tol) || dd < e.r + p.r + 8);
      }
      if (hit) { s.hit.add(e); if (!s.landed) first = true; s.landed = true; this.damage(e, s.dmg, src); }
    }
    // breakable rocks and stumps in the blade's path
    const cur = s.kind === 'spear' ? s.a : a0 + s.arc * s.dir * prog;
    for (const f of [0.55, 0.9]) {
      const tx = Math.floor((p.x + Math.cos(cur) * s.reach * f) / T), ty = Math.floor((p.y + Math.sin(cur) * s.reach * f) / T), i = ty * MW + tx;
      if (this.thp.has(i) && !s.tiles.has(i)) { s.tiles.add(i); this.hitTile(i, s.kind === 'hammer' ? 2 : 1); }
    }
    if (s.kind === 'hammer' && !s.shocked && prog >= 0.7) { s.shocked = true; this.shock(p.x + Math.cos(s.a) * s.reach * 0.8, p.y + Math.sin(s.a) * s.reach * 0.8, 50, s.dmg * 0.5, p); }
    if (first) { Game.hitstop(s.kind === 'hammer' || s.kind === 'axe' ? 0.06 : 0.035); Render.kick(s.kind === 'hammer' ? 5 : 2.5); }
  },
  hitTile(i, n) {
    const hp = this.thp.get(i) - n, x = (i % MW) * T + T / 2, y = Math.floor(i / MW) * T + T / 2, col = this.theme.style === 'forest' ? '#8a6a3a' : '#5a4a6a';
    this.burst(x, y, 6, col, 120, 0.35); Snd.play('thunk');
    if (hp > 0) { this.thp.set(i, hp); return; }
    this.thp.delete(i); this.map[i] = FLOOR; this.flowKey = -1;
    this.burst(x, y, 22, col, 220, 0.6); Render.kick(3); Snd.play('heavy');
  },
  shock(x, y, rad, dmg, p) {
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, size: rad, color: '#ffe2b0', glow: true, ring: true });
    this.burst(x, y, 10, '#d9c4a0', 160, 0.35);
    for (const e of this.enemies) if (!e.dead && e.spawnT <= 0 && d2(x, y, e.x, e.y) < (rad + e.r) ** 2) this.damage(e, dmg, { x, y, depth: 1, aoe: true, elem: 'none', blunt: true, stun: 0.5, p });
  },

  // ---------- damage & effects ----------
  damage(e, dmg, src) {
    if (e.dead || e.spawnT > 0 || e.air) return;
    if (!e.boss) this.lastHit = { e, t: 3 };
    const p = src.p || this.cur || this.players[0]; if (src.p) this.cur = src.p;
    if (e.bones > 0) { // a collapsed skeleton: only crushing or fire finishes it
      if (src.blunt || src.elem === 'fire' || src.extraElem === 'fire' || (!src.burn && p.st.addElem.has('fire') && (src.depth || 0) === 0)) { e.bones = 0; e.reformed = true; this.kill(e, src); }
      else { this.burst(e.x, e.y, 3, '#e8e2cf', 80, 0.2); Snd.play('deflect'); }
      return;
    }
    if (e.invuln) { this.burst(e.x, e.y, 4, '#b6ff7a', 100, 0.25); Snd.play('deflect'); if (!e.immT || e.immT < World.time) { e.immT = World.time + 1; this.text(e.x, e.y - e.r - 8, 'Immune', '#b6ff7a'); } return; }
    if (e.B && e.B.shield && !(e.vuln > 0) && !src.aoe) { // bone knight's shield blocks the front
      const from = src.proj ? Math.atan2(-src.proj.vy, -src.proj.vx) : Math.atan2(src.y - e.y, src.x - e.x);
      if (Math.abs(angDiff(e.face, from)) < 1.15) { dmg *= 0.1; this.burst(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, 6, '#d6e0ff', 150, 0.25); Snd.play('deflect'); }
    }
    if (e.boss && e.vuln > 0) dmg *= e.B.heart ? (src.elem === 'fire' || src.extraElem === 'fire' ? 3 : 2) : 1.5;
    if (this.rally && !e.boss && e.type !== 'banner') dmg *= 0.7;
    if (e.D.ai === 'charger' && e.state === 0 && e.D.hp > 100 && !src.aoe) {
      const from = src.proj ? Math.atan2(-src.proj.vy, -src.proj.vx) : Math.atan2(src.y - e.y, src.x - e.x);
      if (Math.abs(angDiff(e.face, from)) < 0.9) dmg *= 0.7; // owlbears tank frontal hits a bit
    }
    if (src.melee && e.freeze > 0 && this.hasSyn('shatter')) dmg *= 3;
    if (p.cls === 'ranger') {
      if (src.proj && src.proj.wcat === 'ranged') dmg *= 1 + 0.35 * clamp((Math.hypot(e.x - p.x, e.y - p.y) - 90) / 240, 0, 1); // farther shots hit harder
      if (!src.burn && (!this.mark || this.mark.dead) && e.type !== 'banner' && e.type !== 'crystal') { this.mark = e; this.text(e.x, e.y - e.r - 14, 'Marked', '#ff6b6b'); }
      if (this.mark === e) dmg *= 1.25;
    }
    if (e.champ === 'armored') dmg *= 0.6;
    const res = RESIST[e.type];
    if (res) { // resistances and weak spots, capped so nothing gets silly
      const phys = src.melee ? { sword: 'slash', axe: 'slash', spear: 'pierce', hammer: 'blunt' }[src.wtype] : src.proj ? (src.proj.kind === 'wave' ? 'slash' : src.proj.wcat === 'ranged' ? 'pierce' : null) : src.blunt ? 'blunt' : null;
      const el = src.burn ? 'fire' : src.elem;
      const m = clamp((res[phys] || 1) * (res[el] || 1) * (src.extraElem && src.extraElem !== el ? res[src.extraElem] || 1 : 1), 0.6, 1.6);
      if (m !== 1 && !src.burn) { const k = e.type + (m > 1 ? '+' : '-'); if (!this.resSeen.has(k)) { this.resSeen.add(k); this.text(e.x, e.y - e.r - 18, m > 1 ? 'Weak!' : 'Resisted', m > 1 ? '#9fe38a' : '#b8b8c8'); } }
      dmg *= m;
    }
    // a regular foe at full health can't be taken out by one ordinary hit; crits still can
    if (!e.boss && !src.crit && !src.burn && e.hp >= e.maxHp - 0.01) dmg = Math.min(dmg, e.maxHp * 0.6);
    if (Dev.active('oneHit') && !src.burn) dmg = Math.max(dmg, e.hp + 1);
    if (Dev.active('dmgNums')) this.texts.push({ x: e.x + R.range(-8, 8), y: e.y - e.r - 6, s: String(Math.round(dmg)), c: src.crit ? '#ffe066' : src.burn ? '#ff9a5a' : '#ffffff', life: 0.8 });
    if (p.rs && !src.trap) { p.rs.dmg += Math.max(0, Math.min(dmg, e.hp)); if (!src.burn) p.rs.best = Math.max(p.rs.best, dmg); }
    e.hp -= dmg; e.flash = 0.09;
    if (src.crit) this.text(e.x, e.y - e.r - 6, Math.round(dmg) + '!', '#ffd27a');
    if (src.stun && !(e.ccImm > 0)) { const s = src.stun * (e.boss ? 0.12 : 1); e.stun = Math.max(e.stun || 0, s); e.ccImm = s + 2; } // then two seconds where stuns and freezes slide off
    let kx, ky;
    if (src.proj) { const l = Math.hypot(src.proj.vx, src.proj.vy) || 1; kx = src.proj.vx / l; ky = src.proj.vy / l; }
    else { const l = Math.hypot(e.x - src.x, e.y - src.y) || 1; kx = (e.x - src.x) / l; ky = (e.y - src.y) / l; }
    // melee shoves: sword least, then spear, axe, hammer. Never bosses or mini-bosses, never mid-charge.
    const charging = e.boss || e.mini || e.D.anchored || (e.D.ai === 'charger' && e.state === 2) || (e.st > 0 && ['rush', 'walk', 'flank'].includes(e.D.ai)) || (e.D.ai === 'swoop' && e.state === 1);
    if (!charging) {
      const K = src.melee ? ({ sword: [130, 0.15], spear: [190, 0.22], axe: [260, 0.3], hammer: [360, 0.42] }[src.wtype] || [160, 0.15]) : src.blunt ? [260, 0.2] : [70, 0];
      const heavy = (e.D.hp > 70 ? 0.5 : 1) * (src.melee && p.cls === 'fighter' ? 1.3 : 1);
      e.kx += kx * K[0] * heavy; e.ky += ky * K[0] * heavy;
      if (K[1]) e.stagger = Math.max(e.stagger || 0, K[1] * heavy * (e.ccImm > 0 && !(e.stun > 0) ? 0.5 : 1));
    }
    this.burst(e.x, e.y, 3, e.D.c, 110, 0.3);
    Snd.play('hit');
    const depth = src.depth || 0;
    if (!src.burn) {
      const pow = src.elemPow || 1;
      const elems = new Set([src.elem]);
      if (depth === 0 || src.shard) for (const el of p.st.addElem) elems.add(el);
      if (src.extraElem) elems.add(src.extraElem);
      const mg = p.cls === 'mage';
      if (elems.has('fire')) { e.burnS = p.slot; e.burn = 2.6 * pow * (mg ? 1.5 : 1); e.burnDmg = Math.max(e.burnDmg || 0, 3 * p.st.dmg * pow); }
      if (elems.has('frost')) { e.chill = 1.8 * pow; if (!(e.ccImm > 0) && R.chance((e.boss ? 0.02 : 0.12) * pow * (mg ? 2 : 1))) { e.freeze = 1.1; e.ccImm = 3.1; } }
      if (elems.has('storm') && depth < 2 && R.chance(0.3 * pow)) this.chain(e, dmg * 0.5, depth + 1, p, e.x, e.y, mg ? 3 : 2);
      if (this.hasSyn('steam') && e.burn > 0 && e.chill > 0 && !src.steam && depth < 3) {
        e.burn = 0; e.chill = 0; this.explode(e.x, e.y, 60, dmg * 0.9 + 8 * p.st.dmg, depth + 1, '#e8f6ff', { steam: true });
      }
      if (depth <= 1) for (const h of p.hooks.hit) h(e, src);
    }
    if (e.hp <= 0) this.kill(e, src);
  },
  kill(e, src) {
    if (e.dead) return;
    const p = src.p || this.cur || this.players[0]; if (src.p) this.cur = src.p;
    if (e.D.reform && !e.reformed && !src.blunt && src.elem !== 'fire' && !(src.burn)) { // skeletons fall apart, then get back up
      e.bones = 3.4; e.reformed = true; e.hp = e.maxHp * 0.5; e.kx = e.ky = 0; e.burn = 0; e.stun = 0;
      this.burst(e.x, e.y, 12, '#e8e2cf', 160, 0.4); Snd.play('kill');
      return;
    }
    e.dead = true;
    if (e.champ) {
      if (e.champ === 'splitting') for (const s of [-1, 1]) { const t = this.freeSpot(e.x + s * 18, e.y), m = this.makeEnemy(e.type, t.x, t.y); m.spawnT = 0.15; m.kx = s * 220; this.enemies.push(m); }
      if (!e.hunted) { const rng = RNG((Math.random() * 1e9) | 0); this.pickups.push({ kind: 'weapon', w: makeWeapon(rng, { depth: this.depth, src: 'boss', rarity: Math.max(2, rollRarity(rng, this.depth + 1, 'boss')) }), x: e.x, y: e.y, t: 0 }); } // elite route payoff: Rare or better
    }
    if (e.D.split) for (const s of [-1, 1]) { // a cube splits into two smaller ones
      const t = this.freeSpot(e.x + s * 14, e.y), m = this.makeEnemy(e.D.split, t.x, t.y);
      m.spawnT = 0.15; m.kx = s * 220; m.ky = R.range(-60, 60); this.enemies.push(m);
    }
    this.burst(e.x, e.y, e.boss ? 80 : 18, e.D.c, e.boss ? 320 : 200, 0.6);
    this.burst(e.x, e.y, 8, '#ffffff', 120, 0.3);
    Snd.play('kill'); Render.kick(e.boss ? 14 : 3);
    p.kills++; Meta.data.stats.kills++;
    if (p.rs) { const wn = src.wn || (src.proj && src.proj.wn) || (p.weapons[p.wi] || {}).name; if (wn) p.rs.wk[wn] = (p.rs.wk[wn] || 0) + 1; }
    Game.runXp += e.boss ? 40 * this.world : e.type === 'mimic' ? 20 : e.minion ? 1 : 2 * e.D.embers;
    const em = Math.round((e.boss ? 12 * this.world : e.D.embers) * (Game.mods.emberMult || 1) * (p.relic === 'amulet' ? 1.25 : 1) + (p.relic === 'amulet' ? R() * 0.5 : 0));
    for (let i = 0; i < em; i++) this.pickups.push({ kind: 'ember', x: e.x, y: e.y, vx: R.range(-120, 120), vy: R.range(-120, 120), t: 0 });
    if (!e.boss && !e.minion && R.chance(0.035)) this.pickups.push({ kind: 'half', x: e.x, y: e.y, t: 0 });
    if (!e.boss && !e.minion && R.chance(0.015)) this.dropMinor(e.x, e.y);
    if (!e.boss && !e.minion && R.chance(0.007)) this.pickups.push({ kind: 'stone', x: e.x, y: e.y, t: 0 });
    if (e.boss) this.pickups.push({ kind: 'stone', x: e.x + 20, y: e.y, t: 0 });
    if (src.leech && R.chance(0.08)) this.heal(1);
    for (const h of p.hooks.kill) h(e, src);
    if (e.boss) { const other = this.enemies.find(x => x !== e && x.boss && !x.dead); if (other) { this.boss = other; Game.banner('', 'One knight remains', 1.2); } else this.bossDown(e); }
    if (e.type === 'mimic') { if (this.boss === e) this.boss = null; this.chestLoot(e.x, e.y); }
  },
  heal(n, p = this.cur || this.players[0]) {
    if (!p || p.hp >= p.maxHp) return;
    const was = p.hp; p.hp = Math.min(p.maxHp, p.hp + n); if (p.rs) p.rs.healed += p.hp - was; Snd.play('heart');
    this.text(p.x, p.y - 20, '+' + (n / 2) + '♥', '#ff5470');
  },
  explode(x, y, rad, dmg, depth, color, extra = {}) {
    this.burst(x, y, 26, color, rad * 3.2, 0.45);
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: rad, color, glow: true, ring: true });
    Snd.play('explode'); Render.kick(5);
    for (const e of this.enemies) if (!e.dead && d2(x, y, e.x, e.y) < (rad + e.r) ** 2) this.damage(e, dmg, { x, y, depth, aoe: true, elem: 'none', blunt: true, ...extra });
    if (rad >= 70) for (const i of [...this.thp.keys()]) { const tx = (i % MW) * T + T / 2, ty = Math.floor(i / MW) * T + T / 2; if (d2(x, y, tx, ty) < rad * rad) this.hitTile(i, 3); }
  },
  // hops === 2: fan out from the origin (Storm Coil). More hops: jump foe to foe (Chain Lightning).
  chain(from, dmg, depth, p, x = from.x, y = from.y, hops = 2) {
    let n = 0, cx = x, cy = y; const done = new Set([from]);
    while (n < hops) {
      let best = null, bd = 150 * 150;
      for (const e of this.enemies) { if (done.has(e) || e.dead || e.spawnT > 0 || e.bones > 0) continue; const dd = d2(cx, cy, e.x, e.y); if (dd < bd) { bd = dd; best = e; } }
      if (!best) break;
      done.add(best); n++;
      this.bolts.push({ x1: cx, y1: cy, x2: best.x, y2: best.y, life: 0.14, seed: R() * 1000 });
      this.damage(best, dmg, { x: cx, y: cy, depth, elem: 'none', p });
      if (hops > 2) { cx = best.x; cy = best.y; }
    }
    if (n) Snd.play('zap');
  },
  ring(x, y, n, dmg, elem) {
    const p = this.cur || this.players[0], w = { elem, quirks: [] };
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n + R() * 0.2;
      const pr = this.mkProj(p, w, a, { speed: 300, r: 4, kind: 'spark', life: 0.45, dmg, depth: 1, homing: 0, bounce: 0, pierce: 0 });
      if (this.hasSyn('tempest') && elem === 'storm') { pr.chains = 2; const p2 = this.mkProj(p, w, a + Math.PI / n, { speed: 340, r: 4, kind: 'spark', life: 0.5, dmg, depth: 1, homing: 0, bounce: 0, pierce: 0 }); p2.chains = 2; }
      if (this.hasSyn('cinderwake') && elem === 'storm') pr.extraElem = 'fire';
    }
  },
  spawnShard(e, a, s) {
    const p = s.p || this.cur || this.players[0];
    this.projs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, owner: 'p', life: 0.45, r: 3, kind: 'shard', dmg: s.dmg * 0.45, elem: s.elem, color: '#d9b3ff', hit: new Set([e]), depth: (s.depth || 0) + 1, shard: true, pierce: 0, bounce: 0, homing: 0, p });
  },
  hasSyn(id) { return this.players.some(p => p.syn.includes(id)); },

  fallIn(p) { // over the edge: a short drop, then you climb out where you last stood
    p.fallT = 0.45; p.roll = 0; p.lunge = 0; p.charge = 0; p.pushX = p.pushY = 0; p.vx = p.vy = 0; p.edgeT = 0;
    this.burst(p.x, p.y, 12, '#8a7a6a', 120, 0.4); Snd.play('roll');
  },
  climbOut(p) {
    const ok = p.safeMap === this.map; // a spot from this level, or failing that, back the way you came
    const s = this.freeSpot(ok ? p.safeX : p.x - (p.rdx || 0) * T * 3, ok ? p.safeY : p.y - (p.rdy || 0) * T * 3); p.x = s.x; p.y = s.y;
    this.text(p.x, p.y - 24, 'Fell!', '#ffb057'); this.burst(p.x, p.y, 10, '#bfe3ff', 120, 0.4);
    p.inv = 0; p.blinkInv = 0; this.hurt(p, 1, null, { n: 'A fall into the dark' }); p.inv = Math.max(p.inv, 1.2);
  },
  enemyFall(e) { // shoved into a pit: regular foes are gone, champions climb back out a quarter lighter
    this.burst(e.x, e.y, 14, '#8a7a6a', 140, 0.5); Snd.play('kill');
    const s = this.freeSpot(e.x, e.y); e.x = s.x; e.y = s.y; e.kx = e.ky = 0;
    if (e.champ) { e.hp -= e.maxHp * 0.25; this.text(e.x, e.y - 30, 'Fell!', '#ffb057'); if (e.hp > 0) { e.stun = Math.max(e.stun || 0, 0.8); e.spawnT = 0.3; return; } }
    this.text(e.x, e.y - 24, 'Fell!', '#ffb057');
    e.reformed = true; e.hp = 0; this.kill(e, { p: this.cur || this.players[0], blunt: true, pit: true, x: e.x, y: e.y });
  },
  // run summary: who or what did the damage, kept small since it rides along on shots and warnings
  SHOT_N: { arrowE: 'arrow', web: 'web', skull: 'skull', seed: 'seed', feather: 'feather', bone: 'bone' },
  WARN_N: { slam: 'slam', rain: 'barrage', claw: 'claws', boulder: 'boulder', rock: 'rockfall', root: 'roots', acid: 'acid' },
  who(e, how) { return { n: e.boss ? e.title : e.D.n, how: how || '', type: e.type, bid: e.bid || '', look: e.look || '', champ: e.champ || '', r: e.r }; },
  newRunStats() { return { atk: 0, lost: 0, healed: 0, dmg: 0, best: 0, wk: {} }; },
  hurt(p, n = 1, from, who) {
    if (p.inv > 0 || p.roll > 0.03 || p.lunge > 0 || p.blinkInv > 0 || p.dead || p.downed || p.inPortal || Game.state !== 'play') return;
    if (Dev.active('god')) { this.text(p.x, p.y - 24, 'God mode', '#ff6bd5'); p.inv = 0.4; return; }
    if (p.relic === 'displace' && p.dispReady) { p.dispReady = false; p.inv = 0.8; this.text(p.x, p.y - 24, 'Missed!', '#7fd8ff'); this.burst(p.x, p.y, 14, '#7fd8ff', 160, 0.4); Snd.play('blink'); return; }
    if (p.guard) { // Fighter's Guard eats one hit
      p.guard = false; p.guardT = 0; p.inv = 0.8; this.text(p.x, p.y - 24, 'Blocked!', '#cfe3ff'); this.burst(p.x, p.y, 18, '#cfe3ff', 200, 0.4); Snd.play('deflect'); Render.kick(4);
      return;
    }
    const lost = Math.min(p.hp, n * (p.st.hurtMult || 1)); p.hp -= n * (p.st.hurtMult || 1); p.inv = 1.15;
    if (p.rs) p.rs.lost += lost; p.lastWho = who || null;
    if (from) { const a = Math.atan2(p.y - from.y, p.x - from.x); p.pushX = Math.cos(a) * 300; p.pushY = Math.sin(a) * 300; } // hits shove you, pits included
    Snd.play('hurt');
    if (p === this.meP()) { Render.kick(9); Game.hitstop(this.coopN() > 1 ? 0.03 : 0.09); Render.flash = 0.25; } else if (typeof Coop !== 'undefined') Coop.fxTo(p.slot, 'hurt');
    this.burst(p.x, p.y, 20, '#ff4060', 220, 0.5);
    for (const pr of this.projs) if (pr.owner === 'e' && d2(p.x, p.y, pr.x, pr.y) < 110 * 110) { pr.dead = true; this.burst(pr.x, pr.y, 3, '#ff8aa0', 60, 0.2); }
    for (const h of p.hooks.hurt) h();
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--; p.hp = this.hasSyn('rebirth') ? p.maxHp : 4; p.inv = 2.5; Game.banner('Phoenix!', 'The feather burns away', 1.6);
        this.explode(p.x, p.y, 140, 40, 2, '#ffb02e');
        const i = p.items.indexOf('phoenix'); if (i >= 0) p.items.splice(i, 1);
      } else if (this.coopN() > 1) { // downed: a teammate can bring you back
        p.killer = p.lastWho; p.downed = true; p.hp = 0; p.reviveT = 0; p.roll = 0; p.charge = 0; this.burst(p.x, p.y, 40, '#ffe9c4', 220, 0.8);
        this.text(p.x, p.y - 30, 'Down!', '#ff6b6b');
        if (!this.players.some(q => this.live(q))) { for (const q of this.players) q.dead = true; Game.onDeath(); }
      } else { p.killer = p.lastWho; p.dead = true; this.burst(p.x, p.y, 60, '#ffe9c4', 260, 1); Game.onDeath(); }
    }
  },

  // ---------- enemies ----------
  makeEnemy(type, x, y) {
    // health keeps pace with how fast players grow (item levels, sharpening, small items), roughly +45% of the start per level; deeper rooms also bring more of them
    const D = EDEF[type], hpM = (1 + 0.45 * (this.depth - 1)) * ((Game.diff && Game.diff.hp) || 1) * (1 + 0.4 * (this.coopN() - 1));
    return { id: ++this.eid, type, fly: FLIERS.has(type), D, x, y, r: D.r, hp: D.hp * hpM, maxHp: D.hp * hpM, kx: 0, ky: 0, spawnT: 0.8, flash: 0, burn: 0, burnTick: 0, chill: 0, freeze: 0, stun: 0, bones: 0, t: R.range(0, 2), state: 0, st: 0, cool: R.range(0.8, 2.2), face: 0, strafe: R.chance(0.5) ? 1 : -1, side: R.chance(0.5) ? 1 : -1, ghost: D.ai === 'wraith', raise: R.range(4, 6), dead: false };
  },
  spawnWave(wave) {
    const r = this.room;
    for (const s of wave) {
      let { x, y } = s;
      const p = this.nearestP(x, y) || this.players[0];
      if (d2(x, y, p.x, p.y) < 150 * 150) { const t = this.randomRoomTile(r, p, 180); if (t) { x = t.x; y = t.y; } }
      this.enemies.push(this.makeEnemy(s.type, x, y));
    }
    this.waveT = 1.2; Snd.play('spawn');
  },
  eshot(x, y, a, sp, kind = 'orb', r = 6, extra) {
    sp *= (1 + 0.035 * (this.depth - 1)) * ((Game.diff && Game.diff.shot) || 1);
    const color = { arrowE: '#ffd27a', web: '#e8e0ff', skull: '#b6ff7a', seed: '#c8ff7a', feather: '#e8d0a8', bone: '#e8e2cf' }[kind] || '#ff4d8d';
    const pr = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: 'e', life: 6, r, kind, color, hit: null, who: this.foeCtx ? this.who(this.foeCtx, this.SHOT_N[kind] || 'bolt') : this.ctxWho ? Object.assign({}, this.ctxWho, { how: this.SHOT_N[kind] || 'bolt' }) : null };
    if (extra) Object.assign(pr, extra);
    this.projs.push(pr); return pr;
  },
  updEnemy(e, dt) {
    if (e.dead) return;
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    e.flash -= dt; e.t += dt; if (e.ccImm > 0) e.ccImm -= dt;
    if (e.bones > 0) { e.bones -= dt; if (e.bones <= 0) { e.flash = 0.2; this.burst(e.x, e.y, 10, '#e8e2cf', 120, 0.3); Snd.play('spawn'); } return; }
    if (e.burn > 0) { e.burn -= dt; e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.45; this.damage(e, e.burnDmg, { x: e.x, y: e.y, depth: 1, burn: true, elem: 'none', p: this.players.find(q => q.slot === e.burnS) }); this.part(e.x + R.range(-6, 6), e.y, R.range(-15, 15), -60, 0.5, 3, '#ff7a2a', true); } }
    if (e.chill > 0) e.chill -= dt;
    const kd = Math.exp(-9 * dt);
    if (e.kx || e.ky) {
      const f0 = e.fly; if (!e.boss) e.fly = true; this.move(e, e.kx * dt, e.ky * dt); e.fly = f0;
      e.kx *= kd; e.ky *= kd; if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      if (!e.fly && !e.boss && !e.ghost && this.tile(e.x, e.y) === CHASM) { this.enemyFall(e); if (e.dead) return; }
    }
    if (e.dead || e.bones > 0) return;
    if (e.freeze > 0) { e.freeze -= dt; return; }
    if (e.stun > 0) { e.stun -= dt; return; }
    if (e.stagger > 0) { e.stagger -= dt; return; }
    const real = this.nearestP(e.x, e.y); if (!real) return;
    const p = this.decoy || real; // a decoy pulls every foe's attention
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy), toP = Math.atan2(dy, dx);
    const slow = e.chill > 0 ? 0.55 : 1, sp = e.D.sp * slow * (this.rally && !e.boss ? 1.35 : 1);
    let mx = 0, my = 0;
    const go = (a, s) => { mx = Math.cos(a) * s; my = Math.sin(a) * s; };
    const dashing = () => { if (e.st > 0) { e.st -= dt; mx = e.dvx * slow; my = e.dvy * slow; return true; } return false; };
    switch (e.D.ai) {
      case 'rush': case 'walk': {
        e.face = toP;
        if (dashing()) break;
        go(this.flowDir(e, p), sp);
        e.cool -= dt;
        const range = e.D.ai === 'rush' ? 130 : 70;
        if (e.cool <= 0 && dist < range && this.los(e.x, e.y, p.x, p.y)) { e.st = e.D.ai === 'rush' ? 0.28 : 0.22; const s = sp * (e.D.ai === 'rush' ? 2.6 : 2.4); e.dvx = Math.cos(toP) * s; e.dvy = Math.sin(toP) * s; e.cool = R.range(1.3, 2.2); }
        break;
      }
      case 'ooze': {
        go(this.flowDir(e, p), sp); e.face = toP;
        e.slimeT = (e.slimeT || 0) - dt; // leaves a slick that outlives it
        if (e.D.slime && e.slimeT <= 0) { e.slimeT = 0.16; this.slime.push({ x: e.x + R.range(-3, 3), y: e.y + R.range(-3, 3), r: e.r * 0.95 * (0.85 + R() * 0.3), life: 5, max: 5 }); if (this.slime.length > 220) this.slime.shift(); }
        break;
      }
      case 'kite': {
        const see = this.los(e.x, e.y, p.x, p.y);
        if (e.st > 0) {
          e.st -= dt * slow; e.face = toP;
          if (e.st <= 0) {
            const n = this.depth >= 3 && e.D.shot !== 'web' ? 3 : 1;
            for (let i = 0; i < n; i++) this.eshot(e.x, e.y, toP + (i - (n - 1) / 2) * 0.22, e.D.shot === 'web' ? 190 : 235, e.D.shot, e.D.shot === 'web' ? 7 : 4);
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
      case 'trapper': {
        if (dist < 180) go(toP + Math.PI + e.strafe * 0.5, sp); else if (dist > 280) go(this.flowDir(e, p), sp); else go(toP + Math.PI / 2 * e.strafe, sp * 0.5);
        e.cool -= dt * slow; e.face = toP;
        if (e.cool <= 0 && dist < 380) {
          const tx = p.x + p.vx * 0.6 + R.range(-24, 24), ty = p.y + p.vy * 0.6 + R.range(-24, 24);
          if (!this.solidAt(tx, ty)) { this.hazards.push({ x: tx, y: ty, r: 14, arm: 0.9, life: 8, fx: e.x, fy: e.y, who: this.who(e, 'snare') }); Snd.play('eshot'); }
          e.cool = R.range(2.6, 3.8);
        }
        break;
      }
      case 'swoop': case 'wraith': {
        if (e.state === 1) { e.st -= dt; mx = e.dvx * slow; my = e.dvy * slow; if (e.st <= 0) { e.state = 0; e.cool = R.range(1.2, 2.2); } break; }
        const orbit = toP + Math.PI + Math.sin(e.t * 2) * 0.9, ox = p.x + Math.cos(orbit) * 110, oy = p.y + Math.sin(orbit) * 110;
        go(Math.atan2(oy - e.y, ox - e.x), sp * 0.8);
        e.cool -= dt;
        if (e.cool <= 0 && dist < 260) { e.state = 1; e.st = 0.45; const s = e.D.ai === 'wraith' ? 250 : 280; e.dvx = Math.cos(toP) * s; e.dvy = Math.sin(toP) * s; }
        break;
      }
      case 'caster': case 'necro': case 'blink': {
        const keep = e.D.ai === 'blink' ? 200 : 220;
        if (dist > keep + 50) go(this.flowDir(e, p), sp); else if (dist < keep - 50) go(toP + Math.PI, sp * 0.8); else go(toP + Math.PI / 2 * e.strafe, sp * 0.4);
        e.cool -= dt * slow; e.face = toP;
        if (e.D.ai === 'blink') {
          e.blinkCd = (e.blinkCd || 0) - dt;
          if (dist < 120 && e.blinkCd <= 0) {
            const t = this.randomRoomTile(this.room, p, 220);
            if (t) { this.burst(e.x, e.y, 14, e.D.c, 160, 0.4); e.x = t.x; e.y = t.y; this.burst(e.x, e.y, 14, e.D.c, 160, 0.4); Snd.play('blink'); e.blinkCd = 3; }
          }
        }
        if (e.D.ai === 'necro') {
          e.raise -= dt;
          if (e.raise <= 0 && this.enemies.length < 9) { const t = this.randomRoomTile(this.room, p, 120); if (t) { const s = this.makeEnemy('skeleton', t.x, t.y); s.minion = true; this.enemies.push(s); Snd.play('spawn'); } e.raise = R.range(5.5, 7.5); }
        }
        if (e.state === 1) {
          e.st -= dt; e.sub = (e.sub || 0) - dt;
          if (e.sub <= 0) { e.sub = 0.07; e.spin = (e.spin || 0) + 0.45; this.eshot(e.x, e.y, e.spin, 130); this.eshot(e.x, e.y, e.spin + Math.PI, 130); Snd.play('eshot'); }
          if (e.st <= 0) { e.state = 0; e.cool = R.range(2.2, 3.2); }
        } else if (e.cool <= 0) {
          if (e.D.ai === 'blink') { e.state = 2; e.sub = 0; e.n = 3; e.cool = R.range(1.8, 2.6); }
          else if (this.level >= 2 && R.chance(0.45)) { e.state = 1; e.st = 1.1; }
          else { const n = 8 + this.level * 2, off = R() * TAU; for (let i = 0; i < n; i++) this.eshot(e.x, e.y, off + i * TAU / n, 125); Snd.play('eshot'); e.cool = R.range(2.2, 3.2); }
        }
        if (e.state === 2) { // fey: three quick triple bursts
          e.sub -= dt;
          if (e.sub <= 0) { e.sub = 0.14; for (let i = -1; i <= 1; i++) this.eshot(e.x, e.y, toP + i * 0.25, 150, 'orb', 5); Snd.play('eshot'); if (--e.n <= 0) e.state = 0; }
        }
        break;
      }
      case 'flank': {
        e.face = toP;
        if (dashing()) break;
        const side = toP + Math.PI / 2 * e.side, tx = p.x - Math.cos(toP) * 60 + Math.cos(side) * 90, ty = p.y - Math.sin(toP) * 60 + Math.sin(side) * 90;
        go(dist > 220 ? this.flowDir(e, p) : Math.atan2(ty - e.y, tx - e.x), sp);
        e.cool -= dt;
        if (e.cool <= 0 && dist < 190 && this.los(e.x, e.y, p.x, p.y)) { e.st = 0.36; e.dvx = Math.cos(toP) * sp * 3; e.dvy = Math.sin(toP) * sp * 3; e.cool = R.range(1.6, 2.6); }
        break;
      }
      case 'charger': {
        if (e.state === 0) { e.face = lerpAng(e.face, toP, 4 * dt); go(this.flowDir(e, p), sp); e.cool -= dt; if (e.cool <= 0 && dist < 300 && this.los(e.x, e.y, p.x, p.y)) { e.state = 1; e.st = 0.65; } }
        else if (e.state === 1) { e.face = lerpAng(e.face, toP, 6 * dt); e.st -= dt; if (e.st <= 0) { e.state = 2; e.st = 0.75; e.dvx = Math.cos(e.face) * 340; e.dvy = Math.sin(e.face) * 340; Snd.play('roar'); } }
        else if (e.state === 2) { e.st -= dt; if (this.move(e, e.dvx * dt, e.dvy * dt) || e.st <= 0) { e.state = 3; e.st = 1.1; Render.kick(4); this.burst(e.x, e.y, 10, e.D.c, 150, 0.3); if (this.level >= 2) for (let i = 0; i < 8; i++) this.eshot(e.x, e.y, i * TAU / 8, 110); } }
        else { e.st -= dt; if (e.st <= 0) { e.state = 0; e.cool = R.range(1.5, 2.5); } }
        break;
      }
      case 'crystal': // phylactery: pulses slow orbs at you
        e.cool -= dt; if (e.cool <= 0) { e.cool = R.range(2.0, 2.8); for (let i = -1; i <= 1; i++) this.eshot(e.x, e.y, toP + i * 0.3, 110, 'orb', 6); Snd.play('eshot'); }
        break;
      case 'banner': break;
      case 'mimic': { // hops at you, lunges to bite, spits teeth
        const rage = e.hp < e.maxHp * 0.5;
        e.face = toP;
        if (e.st > 0) { e.st -= dt; mx = e.dvx; my = e.dvy; if (e.st <= 0) { const n = rage ? 14 : 10; for (let i = 0; i < n; i++) this.eshot(e.x, e.y, i * TAU / n + e.t, 140, 'orb', 5); Snd.play('heavy'); Render.kick(5); } break; }
        const ph = e.t % 0.7; e.squash = ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI) : 0;
        if (ph < 0.35) go(this.flowDir(e, p), sp * 1.7);
        e.cool -= dt;
        if (e.cool <= 0) {
          if (dist < 220 && R.chance(0.6)) { e.st = 0.4; e.dvx = Math.cos(toP) * 360; e.dvy = Math.sin(toP) * 360; Snd.play('roar'); }
          else { for (let i = -2; i <= 2; i++) this.eshot(e.x, e.y, toP + i * 0.18, 190, 'orb', 5); Snd.play('eshot'); }
          e.cool = rage ? R.range(0.9, 1.4) : R.range(1.4, 2.0);
        }
        break;
      }
      case 'boss': this.updBoss(e, p, dt, toP, dist, go); break;
    }
    if ((mx || my) && !e.boss && this.traps.length) [mx, my] = this.trapSteer(e, mx, my);
    if (e.champ && e.ab) this.champAbility(e, real, dt);
    if (mx || my) this.move(e, mx * dt, my * dt);
    if (!p.isDecoy && !e.air && dist < e.r + p.r - 2 && p.inv <= 0 && p.roll <= 0.03 && p.blinkInv <= 0 && p.lunge <= 0) {
      if (e.D.engulf) {
        p.slowT = 2.2;
        if (!p.stolen && p.weapons.length > 1 && !e.holding) { p.stolen = { idx: p.wi, t: 5, by: e }; e.holding = p.weapons[p.wi]; p.wi = 1 - p.wi; p.charge = 0; this.text(p.x, p.y - 24, 'Weapon engulfed!', '#6fe3c8'); Snd.play('fizzle'); }
      }
      this.hurt(p, e.D.touch, e, this.who(e));
    }
  },
  // ---------- bosses: phases, signature mechanics, and move sets per phase ----------
  phaseThresholds() { return Game.mode === 'campaign' ? [0.66, 0.33] : [0.5]; },
  updBoss(e, p, dt, toP, dist, go) {
    const B = e.B, real = this.nearestP(e.x, e.y) || this.players[0];
    // phase changes
    const want = 1 + this.phaseThresholds().filter(t => e.hp / e.maxHp < t).length;
    if (want > (e.phase || 1) && !e.twin) { e.phase = want; this.bossPhase(e); return; }
    const ph = Math.min(e.phase || 1, B.moves.length), late = ph >= 3 || (Game.mode !== 'campaign' && ph >= 2);
    e.spin = (e.spin || 0) + dt * (late ? 1.6 : 1.1);
    if (e.vuln > 0) e.vuln -= dt;
    if (B.crystals) this.lichCrystals(e, dt);
    if (B.acid && !e.air) { e.acidT = (e.acidT || 0) - dt; if (e.acidT <= 0) { e.acidT = 0.45; this.acidPool(e.x + R.range(-12, 12), e.y + R.range(-12, 12), R.range(24, 34), 5); } } // weeps acid as it moves
    if (e.state === 'stunned') { e.st -= dt; if (e.st <= 0) { e.state = 0; e.cool = 0.4; } return; }
    if (e.state === 0) {
      go(toP, B.look === 'owlbear' ? 70 : B.id === 'knight' ? 55 : 40); e.cool -= dt;
      if (!e.charging) e.face = lerpAng(e.face, toP, 5 * dt);
      if (e.cool <= 0) {
        let opts = B.moves[ph - 1].filter(m => m !== e.last);
        if (this.enemies.length > 6) opts = opts.filter(m => !['horn', 'raise', 'summon', 'cubs'].includes(m));
        if (B.look === 'owlbear' && dist < 110) opts = ['swipe'];
        if (!opts.length) opts = ['fans'];
        const pick = R.pick(opts); e.last = pick;
        e.state = pick; e.st = { charge: 0.65, shieldwall: 0.7, fans: 1.6, volley: 2.0, horn: 1.0, leap: 0.45, stalk: 1.5, boulder: 1.4, flail: 3.0, teleport: 0.6, spiral: 2.6, skulls: 1.6, raise: 1.0, prison: 1.2, sweep: 2.4, slam: 0.75, swipe: 0.45, screech: 1.2, cubs: 0.8, roots: 2.0, seeds: 1.8, summon: 1.0, thornwall: 1.0, brambles: 1.6, acidspray: 1.7 }[pick];
        e.sub = 0; e.n = 0; e.runs = 0;
      }
      return;
    }
    e.st -= dt; e.sub -= dt;
    const ring = (n, sp, off = 0, kind = 'orb') => { for (let i = 0; i < n; i++) this.eshot(e.x, e.y, off + i * TAU / n, sp, kind, kind === 'feather' ? 5 : 6); };
    const spawn = (list, near) => { for (const k of list) { const t = near ? this.freeSpot(e.x + R.range(-60, 60), e.y + R.range(-60, 60)) : this.randomRoomTile(this.room, p, 100); if (t) { const m = this.makeEnemy(k, t.x, t.y); m.minion = true; this.enemies.push(m); } } Snd.play('spawn'); };
    switch (e.state) {
      case 'charge': case 'shieldwall':
        if (e.n === 0) { e.face = lerpAng(e.face, toP, 8 * dt); if (e.st <= 0) { e.n = 1; e.st = 0.85; e.charging = true; e.dvx = Math.cos(e.face) * 390; e.dvy = Math.sin(e.face) * 390; Snd.play('roar'); } }
        else {
          if (e.state === 'shieldwall') { e.fireT = (e.fireT || 0) - dt; if (e.fireT <= 0) { e.fireT = 0.05; this.hazards.push({ x: e.x, y: e.y, r: 20, arm: 0, life: 4.5, fire: true, who: this.who(e, 'flames') }); } }
          const hit = this.move(e, e.dvx * dt, e.dvy * dt);
          if (hit || e.st <= 0) {
            e.charging = false;
            if (hit) { const tx = Math.floor((e.x + Math.cos(e.face) * (e.r + 10)) / T), ty = Math.floor((e.y + Math.sin(e.face) * (e.r + 10)) / T), ti = ty * MW + tx; if (this.thp.has(ti)) this.hitTile(ti, 3); }
            ring(late ? 18 : 12, 140, e.spin); Render.kick(8); Snd.play('explode');
            if (B.selfStun && hit) { e.state = 'stunned'; e.st = 2.2; e.vuln = 2.2; Game.banner('', 'Stunned!', 0.9); return; }
            if (B.look === 'owlbear' && e.runs++ < 1) { e.n = 0; e.st = 0.4; } else e.st = -1;
          }
        }
        break;
      case 'fans':
        if (e.sub <= 0) { e.sub = 0.5; const n = late ? 9 : 7; for (let i = 0; i < n; i++) this.eshot(e.x, e.y, toP + (i - (n - 1) / 2) * 0.16, 175); Snd.play('eshot'); }
        break;
      case 'volley':
        if (e.sub <= 0) {
          e.sub = 0.5;
          for (let i = 0; i < 7; i++) this.eshot(e.x, e.y, toP + (i - 3) * 0.13, 230, 'arrowE', 4);
          for (let i = 0; i < (late ? 3 : 2); i++) this.warn(p.x + R.range(-60, 60), p.y + R.range(-60, 60), 34, 0.9, 1, 'rain');
          Snd.play('eshot');
        }
        break;
      case 'horn':
        if (e.n === 0) { e.n = 1; Snd.play('roar'); Game.banner('', 'The war horn sounds!', 1.2); spawn(B.summon); }
        break;
      case 'leap':
        if (e.n === 0) { if (e.st <= 0) { e.n = 1; e.air = true; e.st = 9; e.leapW = this.warn(p.x, p.y, B.look === 'owlbear' ? 85 : 70, 1.5, 2, 'slam', { follow: 0.95 }); Snd.play('whoosh'); this.burst(e.x, e.y, 20, '#c8b090', 200, 0.4); } }
        else if (e.leapW.fired) {
          const s = this.freeSpot(e.leapW.x, e.leapW.y); e.x = s.x; e.y = s.y; e.air = false;
          ring(late ? 18 : 12, 150, e.spin, B.look === 'owlbear' ? 'feather' : 'orb'); Render.kick(14);
          if (late && e.runs++ < 1) { e.n = 0; e.st = 0.35; } else e.st = -1;
        }
        break;
      case 'stalk': // bugbear creeps through the dark, then pounces
        if (e.n === 0) { go(toP, 85); if (e.st <= 0.35 || dist < 90) { e.n = 1; e.st = 0.35; e.dvx = Math.cos(toP) * 430; e.dvy = Math.sin(toP) * 430; Snd.play('roar'); e.eyesFlash = 0.6; } }
        else { this.move(e, e.dvx * dt, e.dvy * dt); if (e.st <= 0) { ring(late ? 12 : 8, 130, e.spin); Render.kick(6); } }
        break;
      case 'boulder': // thrown boulders land as breakable cover
        if (e.sub <= 0 && e.n < (late ? 3 : 2)) {
          e.sub = 0.5; e.n++;
          const tx = p.x + R.range(-40, 40), ty = p.y + R.range(-40, 40);
          this.warn(tx, ty, 30, 1.0, 1, 'boulder', { onFire: (w, hitAny) => { const ix = Math.floor(w.x / T), iy = Math.floor(w.y / T), i = iy * MW + ix; if (!hitAny && this.map[i] === FLOOR && this.roomId[i] >= 0) { this.map[i] = PILLAR; this.thp.set(i, 3); this.flowKey = -1; } } });
          Snd.play('whoosh');
        }
        break;
      case 'flail': // a chain-flail spin that keeps widening
        go(toP, 45);
        if (e.sub <= 0) { e.sub = 0.24; const k = 1 - e.st / 3; ring(late ? 10 : 8, 110 + 130 * k, e.spin * 3); Snd.play('heavy'); }
        break;
      case 'teleport':
        if (e.n === 0) { e.n = 1; const t = this.randomRoomTile(this.room, p, 220); this.burst(e.x, e.y, 24, B.c, 200, 0.5); if (t) { e.x = t.x; e.y = t.y; } this.burst(e.x, e.y, 24, B.c, 200, 0.5); Snd.play('blink'); }
        else if (e.n === 1 && e.st <= 0.3) { e.n = 2; ring(late ? 22 : 16, 130, e.spin); Snd.play('eshot'); }
        break;
      case 'spiral':
        if (e.sub <= 0) { e.sub = late ? 0.06 : 0.085; const arms = late ? 4 : 3; for (let i = 0; i < arms; i++) this.eshot(e.x, e.y, e.spin * 2.2 + i * TAU / arms, 120); Snd.play('eshot'); }
        break;
      case 'skulls':
        if (e.sub <= 0) { e.sub = 0.35; this.eshot(e.x, e.y, toP + R.range(-0.8, 0.8), 120, 'skull', 8, { homing: late ? 2.1 : 1.7, life: 5 }); Snd.play('eshot'); }
        break;
      case 'raise':
        if (e.n === 0) { e.n = 1; Game.banner('', 'The dead rise...', 1.2); spawn(B.summon.slice(0, late ? 3 : 2)); }
        break;
      case 'prison': // a ring of bones closes in, with one gap to slip through
        if (e.n === 0) {
          e.n = 1; const gap = R() * TAU, N = 30;
          for (let i = 0; i < N; i++) {
            const a = i * TAU / N; if (Math.abs(angDiff(a, gap)) < 0.42) continue;
            const x = p.x + Math.cos(a) * 230, y = p.y + Math.sin(a) * 230; if (this.solidAt(x, y)) continue;
            this.eshot(x, y, a + Math.PI, 80, 'bone', 7, { life: 3.4 });
          }
          Snd.play('roar'); Game.banner('', 'Bone prison! Find the gap', 1.2);
        }
        break;
      case 'sweep':
        if (e.sub <= 0) { e.sub = 0.05; const a = e.spin * 2.4, k = B.look === 'treant' ? 'seed' : 'orb'; this.eshot(e.x, e.y, a, 160, k, 6); this.eshot(e.x, e.y, a + Math.PI, 160, k, 6); }
        break;
      case 'slam': // bone knight: telegraphed overhead slam. If it whiffs, he's stuck
        if (e.n === 0) {
          e.n = 1; e.face = toP;
          this.warn(e.x + Math.cos(toP) * 56, e.y + Math.sin(toP) * 56, 60, 0.7, 2, 'claw', { onFire: (w, hitAny) => { ring(late ? 10 : 6, 130, e.spin); if (!hitAny) { e.state = 'stunned'; e.st = 1.8; e.vuln = 1.8; this.text(e.x, e.y - e.r - 10, 'Stuck!', '#ffe066'); } } });
        }
        break;
      case 'swipe':
        if (e.n === 0) { e.n = 1; e.face = toP; this.warn(e.x + Math.cos(toP) * 52, e.y + Math.sin(toP) * 52, 58, 0.42, 1, 'claw'); }
        break;
      case 'screech': // pushes you back and fills the air with feathers
        if (e.sub <= 0 && e.n < 2) {
          e.sub = 0.5; e.n++; ring(22, 135, e.spin + e.n * 0.2, 'feather'); Snd.play('roar'); Render.kick(8);
          if (real && !real.dead) { const a = Math.atan2(real.y - e.y, real.x - e.x); real.pushX = Math.cos(a) * 520; real.pushY = Math.sin(a) * 520; }
        }
        break;
      case 'cubs':
        if (e.n === 0) { e.n = 1; Game.banner('', 'Her cubs join the fight!', 1.2); spawn(['cub', 'cub'], true); }
        break;
      case 'roots':
        if (e.sub <= 0) { e.sub = 0.4; const a = R() * TAU, d = e.n++ === 0 ? 0 : R.range(30, 110); this.warn(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 42, 0.85, 1, 'root'); }
        if (e.st <= 0.05 && B.heart) { e.vuln = 3; this.text(e.x, e.y - e.r - 14, 'Heart exposed!', '#ffd27a'); }
        break;
      case 'seeds':
        if (e.sub <= 0) { e.sub = 0.45; for (let i = 0; i < 5; i++) this.eshot(e.x, e.y, toP + (i - 2) * 0.22 + R.range(-0.05, 0.05), 190, 'seed', 5); Snd.play('eshot'); }
        break;
      case 'summon':
        if (e.n === 0) { e.n = 1; spawn(B.summon.slice(0, late ? 4 : 3)); }
        break;
      case 'thornwall':
        if (e.n === 0) { e.n = 1; this.thornWall(e, p); }
        break;
      case 'acidspray': // lobs globs that land as acid pools
        if (e.sub <= 0 && e.n < (late ? 5 : 3)) {
          e.sub = 0.35; e.n++;
          const a = R() * TAU, d = e.n === 1 ? 0 : R.range(40, 120);
          this.warn(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 34, 0.9, 1, 'acid', { onFire: w => this.acidPool(w.x, w.y, 38, 8) });
          Snd.play('eshot');
        }
        break;
      case 'brambles': // the floor turns to brambles except a couple of lanes
        if (e.n === 0) {
          e.n = 1; const r = this.room, lx = r.x + 2 + R.int(0, r.w - 6), ly = r.y + 2 + R.int(0, r.h - 6);
          for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) {
            if ((x >= lx && x <= lx + 2) || (y >= ly && y <= ly + 2)) continue;
            const i = y * MW + x; if (this.map[i] !== FLOOR) continue;
            this.warn(x * T + T, y * T + T, 30, 1.4, 1, 'root');
          }
          Game.banner('', 'Brambles! Find the open lanes', 1.2); Snd.play('roar');
        }
        break;
    }
    if (e.st <= 0 && e.st > -3 && !e.air && e.state !== 'stunned') { e.state = 0; e.cool = late ? R.range(0.55, 1.0) : R.range(0.9, 1.5); }
  },
  bossPhase(e) {
    const B = e.B, n = e.phase;
    e.state = 0; e.cool = 1.4; e.air = false; e.charging = false;
    Game.banner(e.name, `Phase ${n}`, 1.6); Snd.play('boss'); Render.kick(12);
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    this.burst(e.x, e.y, 50, B.c, 300, 0.7);
    if (B.id === 'warlord' && n === 2) { const t = this.freeSpot(e.x + 60, e.y); const b = this.makeEnemy('banner', t.x, t.y); b.minion = true; b.spawnT = 0.4; this.enemies.push(b); Game.banner('War Banner!', 'Knock it down or the goblins grow fierce', 2); }
    if (B.id === 'owlbear' && n === 2) { e.state = 'cubs'; e.st = 0.8; e.n = 0; }
    if (B.id === 'knight' && n === 3) { // splits into two smaller knights
      const hp = Math.max(1, e.hp / 2); e.hp = hp; e.maxHp = hp; e.r = 22;
      const twin = Object.assign({}, e, { x: e.x + 40, twin: true, hp, kx: 0, ky: 0, state: 0, cool: 1.0, flash: 0, spawnT: 0.3 });
      twin.x = this.freeSpot(e.x + 40, e.y).x; this.enemies.push(twin);
      Game.banner('The Bone Knight splits!', 'Two knights, one fight', 2);
    }
  },
  lichCrystals(e, dt) { // phylacteries: while any stand, the lich can't be hurt
    const cs = this.enemies.filter(x => x.type === 'crystal' && !x.dead);
    if (!e.crystalsInit) { e.crystalsInit = true; this.spawnCrystals(e); return; }
    if (cs.length) { e.invuln = true; return; }
    if (e.invuln) { e.invuln = false; e.exposedT = 8; Game.banner('', 'The Lich is exposed!', 1.4); Snd.play('synergy'); }
    if (e.exposedT > 0) { e.exposedT -= dt; if (e.exposedT <= 0) { this.spawnCrystals(e); Game.banner('', 'The phylacteries reform', 1.2); } }
  },
  spawnCrystals(e) {
    const r = this.room, spots = [[r.x + 3, r.y + 3], [r.x + r.w - 4, r.y + 3], [r.x + (r.w >> 1), r.y + r.h - 4]];
    for (const [tx, ty] of spots) { const s = this.freeSpot(tx * T + T / 2, ty * T + T / 2), c = this.makeEnemy('crystal', s.x, s.y); c.minion = true; c.spawnT = 1; c.hp = c.maxHp = EDEF.crystal.hp * (1 + 0.15 * (this.depth - 1)) * ((Game.diff && Game.diff.hp) || 1); this.enemies.push(c); }
    e.invuln = true;
  },
  thornWall(e, p) { // a temporary wall of brambles splits the arena; fire burns it away
    const r = this.room, horiz = R.chance(0.5), line = horiz ? r.y + 2 + R.int(0, r.h - 5) : r.x + 2 + R.int(0, r.w - 5);
    const len = horiz ? r.w : r.h, g1 = R.int(2, Math.floor(len / 2) - 2), g2 = R.int(Math.floor(len / 2) + 1, len - 4);
    for (let k = 1; k < len - 1; k++) {
      if ((k >= g1 && k <= g1 + 1) || (k >= g2 && k <= g2 + 1)) continue;
      const x = horiz ? r.x + k : line, y = horiz ? line : r.y + k, i = y * MW + x;
      if (this.map[i] !== FLOOR) continue;
      const cx = x * T + T / 2, cy = y * T + T / 2;
      if (d2(cx, cy, p.x, p.y) < 40 * 40 || d2(cx, cy, e.x, e.y) < (e.r + 24) ** 2) continue;
      this.map[i] = PILLAR; this.thp.set(i, 3); this.thorns.set(i, 9);
    }
    this.flowKey = -1; Snd.play('roar'); Game.banner('', 'Thorn walls rise', 1.2);
  },
  spawnBoss(r) {
    const rng = RNG(hash(Game.seedNum, this.world, 909)), B = (Game.devBoss && this.theme.bosses.find(b => b.id === Game.devBoss)) || rng.pick(this.theme.bosses);
    const hp = (640 + 150 * this.depth) * ((Game.diff && Game.diff.boss) || 1) * (1 + 0.55 * (this.coopN() - 1));
    const D = { hp, r: B.r || 30, sp: 38, c: B.c, ai: 'boss', touch: 1, embers: 0 }; // bosses hit for half a heart; only the big telegraphed moves take a whole one
    const e = { id: ++this.eid, bid: B.id, type: 'boss', D, B, boss: true, look: B.look, x: r.mx * T + T / 2, y: (r.my - 2) * T + T / 2, r: D.r, hp, maxHp: hp, kx: 0, ky: 0, spawnT: 1.4, flash: 0, burn: 0, burnTick: 0, chill: 0, freeze: 0, stun: 0, bones: 0, t: 0, state: 0, cool: 1.5, face: Math.PI / 2, dead: false, phase: 1, vuln: 0 };
    e.name = properName(rng, 2); e.title = B.title;
    this.boss = e; this.enemies.push(e);
    this.bossDark = !!B.dark;
    Game.banner(e.name, `${e.title}  ·  ${B.tip}`, 3); Snd.play('boss'); Snd.play('roar'); Render.kick(6);
  },
  // ground warnings: a circle fills up, then whatever is in it gets hit
  warn(x, y, r, dur, dmg, kind, extra) { const w = Object.assign({ x, y, r, t: 0, dur, dmg, kind, who: this.foeCtx ? this.who(this.foeCtx, this.WARN_N[kind]) : { n: kind === 'rock' ? 'A falling stalactite' : 'The dungeon' } }, extra); this.warns.push(w); return w; },
  updWarns(dt) {
    const p = this.players.find(q => !q.dead);
    for (const w of this.warns) {
      w.t += dt;
      if (w.follow && w.t < w.follow && p) { w.x = lerp(w.x, p.x, 1 - Math.exp(-6 * dt)); w.y = lerp(w.y, p.y, 1 - Math.exp(-6 * dt)); }
      if (!w.fired && w.t >= w.dur) {
        w.fired = true;
        const col = { root: '#8dff7a', slam: '#d9c4a0', rain: '#ffd27a', claw: '#ff8060', boulder: '#8a7a6a', rock: '#9a8a7a', acid: '#a8ff4a' }[w.kind] || '#ff4d6d';
        this.burst(w.x, w.y, 18, col, w.r * 4, 0.4); Render.kick(w.kind === 'slam' || w.kind === 'boulder' ? 10 : 4);
        Snd.play(w.kind === 'slam' ? 'explode' : 'heavy');
        let hitAny = false;
        if (w.dmg > 0) for (const q of this.players) if (this.live(q) && d2(w.x, w.y, q.x, q.y) < (w.r + q.r * 0.5) ** 2) { hitAny = true; this.hurt(q, w.dmg, null, w.who); }
        if (w.onFire) { this.ctxWho = w.who; w.onFire(w, hitAny); this.ctxWho = null; }
      }
    }
    this.warns = this.warns.filter(w => w.t < w.dur + 0.35);
    for (const [i, t] of this.thorns) { // thorn walls wither on their own
      const nt = t - dt;
      if (nt <= 0 || this.map[i] !== PILLAR) { this.thorns.delete(i); if (this.map[i] === PILLAR) { this.map[i] = FLOOR; this.thp.delete(i); this.flowKey = -1; } }
      else this.thorns.set(i, nt);
    }
  },
  bossDown(e) {
    this.boss = null; this.bossDark = false;
    for (const [i] of this.thorns) if (this.map[i] === PILLAR) { this.map[i] = FLOOR; this.thp.delete(i); }
    this.thorns.clear();
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    for (const m of this.enemies) if (m.minion && !m.dead) { m.dead = true; this.burst(m.x, m.y, 10, m.D.c, 120, 0.4); }
    this.warns = [];
    Game.hitstop(0.25);
    const r = this.room, cx = r.mx * T + T / 2, cy = r.my * T + T / 2;
    Meta.data.stats.bestDepth = Math.max(Meta.data.stats.bestDepth || 0, this.depth);
    const last = Game.mode === 'campaign' ? true : this.world >= WORLD_COUNT && this.level >= 3; // in Campaign, a world boss ends the run
    this.pickups.push({ kind: 'portal', x: cx, y: cy + T * 2.5, t: 0, last });
    this.pickups.push({ kind: 'chest', x: cx, y: cy - T * 0.5, t: 0, room: r, n: 3 });
    this.pickups.push({ kind: 'heart', x: cx - T * 2, y: cy + T * 1.5, t: 0 });
    const wr = RNG(hash(Game.seedNum, this.depth, 4242));
    if (Game.mode === 'campaign') { const ch = Game.char, rare = 0.08 + 0.05 * (this.world - 1) + 0.01 * Math.min(10, (ch && ch.stats.clears) || 0); this.pickups.push({ kind: 'weapon', x: cx + T * 2, y: cy + T * 1.5, w: makeWeapon(wr, { depth: this.depth, rarity: wr.chance(rare) ? 2 : 1 }), t: 0 }); }
    else if (!last) for (let i = 0; i < this.coopN(); i++) this.pickups.push({ kind: 'weapon', x: cx + T * 2 + i * 44, y: cy + T * 1.5, w: makeWeapon(wr, { depth: this.depth, src: 'boss' }), t: 0 }); // one per player
    const br = RNG(hash(Game.seedNum, this.depth, 4343));
    if (!last && br.chance(0.35)) this.pickups.push({ kind: 'relic', x: cx + T * 3.5, y: cy - T * 0.5, t: 0, id: br.pick(RELICS).id });
  },

  // ---------- rooms ----------
  updRooms() {
    for (const p of this.players) { const r = this.live(p) && this.roomAt(p.x, p.y); if (r && p.inRoom !== r.id) { p.cameFrom = p.inRoom; p.inRoom = r.id; } }
    if (this.locked) { this.checkAway(); return; }
    const me = this.meP();
    for (const p of [me, ...this.players.filter(q => q !== me)]) {
      if (!this.live(p)) continue;
      const r = this.roomAt(p.x, p.y);
      if (!r) continue;
      if (!r.visited) { r.visited = true; for (const id of r.links) this.rooms[id].known = true; }
      r.known = true;
      if (!r.cleared && r !== this.room || (r.frozen && !this.locked)) { this.room = r; this.flowKey = -1; this.pullIn(r, p); this.enterRoom(r, p); return; }
      if (p === me && r !== this.room) { this.room = r; this.flowKey = -1; }
    }
  },
  // Everyone has stepped out through the open door and moved off: the fight waits for you (or the trial collapses)
  checkAway() {
    const r = this.room; if (!r || r.type === 'boss' || r.entry === null || r.entry === undefined) return;
    const door = this.doorPos(r, r.entry);
    const away = this.players.filter(q => this.live(q)).every(q => this.roomAt(q.x, q.y) !== r && d2(q.x, q.y, door.x, door.y) > (r.type === 'challenge' ? 40 : 150) ** 2);
    this.awayT = away ? (this.awayT || 0) + 1 / 60 : 0;
    if (r.type === 'challenge') { if (this.awayT > 0.3) this.collapseChallenge(r); return; }
    if (this.awayT < 1.2) return;
    r.frozen = { enemies: this.enemies.filter(e => !e.dead), waves: this.waves, waveT: this.waveT };
    this.enemies = []; this.waves = []; this.locked = false; this.room = null; this.hazards = [];
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    Music.target = 0; this.text(this.meP().x, this.meP().y - 30, 'You fell back', '#c9a8ff');
  },
  pullIn(r, p) { // the doors are about to lock: bring stragglers inside next to whoever walked in
    for (const q of this.players) {
      if (q === p || q.gone || q.inPortal || q.dead) continue;
      if (this.roomAt(q.x, q.y) === r) continue;
      const s = this.freeSpot(p.x + R.range(-24, 24), p.y + R.range(-24, 24)); q.x = s.x; q.y = s.y; q.vx = q.vy = 0;
      this.burst(q.x, q.y, 24, '#b98cff', 160, 0.5);
    }
  },
  // co-op: stand next to a downed friend for 3 seconds to bring them back
  updDowned(dt) {
    for (const p of this.players) {
      if (!p.downed || p.dead) continue;
      const helper = this.players.some(q => this.live(q) && d2(q.x, q.y, p.x, p.y) < 44 * 44);
      p.reviveT = helper ? (p.reviveT || 0) + dt : Math.max(0, (p.reviveT || 0) - dt * 0.5);
      if (p.reviveT >= 3) { p.downed = false; p.hp = 2; p.inv = 2; p.reviveT = 0; this.text(p.x, p.y - 30, 'Revived!', '#9fe38a'); this.burst(p.x, p.y, 30, '#9fe38a', 180, 0.6); Snd.play('heart'); }
    }
  },
  setDoors(r, shut, keepTo) { for (const i of r.doors) { if (r.collapsed && r.doorTo[i] === r.entry) continue; this.map[i] = shut && !(keepTo !== undefined && keepTo !== null && r.doorTo[i] === keepTo) ? SHUT : DOOR; } },
  entryFor(r, p) { // which neighbor did they come from? fall back to the door nearest them
    if (p && p.cameFrom !== undefined && r.links.includes(p.cameFrom)) return p.cameFrom;
    let best = null, bd = Infinity;
    for (const i of r.doors) { const x = (i % MW) * T + T / 2, y = Math.floor(i / MW) * T + T / 2, d = p ? d2(x, y, p.x, p.y) : 0; if (d < bd) { bd = d; best = r.doorTo[i]; } }
    return best;
  },
  doorPos(r, to) { let x = 0, y = 0, n = 0; for (const i of r.doors) if (r.doorTo[i] === to) { x += (i % MW) * T + T / 2; y += Math.floor(i / MW) * T + T / 2; n++; } return n ? { x: x / n, y: y / n } : { x: r.mx * T, y: r.my * T }; },
  enterRoom(r, p) {
    if (r.frozen) { // back into a fight you stepped out of: everything is as you left it
      this.locked = true; this.awayT = 0; this.enemies = r.frozen.enemies; this.waves = r.frozen.waves; this.waveT = r.frozen.waveT; r.frozen = null;
      for (const e of this.enemies) if (this.roomAt(e.x, e.y) !== r) { const s = this.freeSpot(r.mx * T + T / 2 + R.range(-60, 60), r.my * T + T / 2 + R.range(-40, 40)); e.x = s.x; e.y = s.y; }
      Snd.play('door'); Music.target = 1; return;
    }
    if (r.type === 'challenge') return this.startChallenge(r, p);
    if (r.type === 'combat' || r.type === 'boss' || r.type === 'exit') {
      for (const q of this.players) q.dispReady = true;
      r.entry = r.type === 'boss' ? null : this.entryFor(r, p); this.awayT = 0;
      this.locked = true; this.setDoors(r, true, r.entry); Snd.play('door'); Music.target = 1;
      if (r.champion) { const s = this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2 - T * 2); this.enemies.push(this.makeChampion(rng0(r), s.x, s.y)); Game.banner('', 'A champion guards this room', 1.6); }
      if (r.type === 'boss') { this.waves = []; this.spawnBoss(r); }
      else if (r.type === 'exit') { this.waves = r.waves.map(w => w.slice()); this.waveT = 0.3; this.spawnWave(this.waves.shift()); Game.banner('', 'The way down is guarded', 1.6); }
      else { this.waves = r.waves.map(w => w.slice()); this.waveT = 0.3; this.spawnWave(this.waves.shift()); }
    } else {
      r.cleared = true;
      if (r.type === 'armory') {
        const rng = RNG(hash(Game.seedNum, this.depth, r.id, 77)), grp = R(), cx = r.mx * T + T / 2, cy = r.my * T + T / 2;
        const a = makeWeapon(rng, { depth: this.depth, src: 'armory' });
        let b; for (let i = 0; i < 6; i++) { b = makeWeapon(rng, { depth: this.depth, src: 'armory' }); if (b.cat !== a.cat) break; }
        this.pickups.push({ kind: 'weapon', w: a, x: cx - 40, y: cy, group: grp, t: 0 }, { kind: 'weapon', w: b, x: cx + 40, y: cy, group: grp, t: 0 });
        Game.banner('Armory', 'Take one weapon', 1.6);
      }
    }
  },
  clearRoom() {
    const r = this.room; this.locked = false; r.cleared = true; this.setDoors(r, false);
    if (r.route === 'horde') this.pickups.push({ kind: 'half', x: r.mx * T + T / 2, y: r.my * T + T / 2, t: 0 });
    if (r.route === 'gauntlet') { const s = this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2); if (R.chance(0.25)) this.pickups.push({ kind: 'stone', x: s.x + 16, y: s.y, t: 0 }); if (R.chance(0.35)) this.dropMinor(s.x - 16, s.y); }
    for (const pr of this.projs) if (pr.owner === 'e') pr.dead = true;
    this.hazards = [];
    Snd.play('clear'); Music.target = 0;
    for (const p of this.players) {
      if (p.gone) continue;
      if (p.downed) { p.downed = false; p.hp = 2; p.inv = 2; this.text(p.x, p.y - 30, 'Back up!', '#9fe38a'); }
      this.cur = p; for (const h of p.hooks.clear) h();
      p.roomsCleared++;
      if (p.relicCd > 0) { p.relicCd--; if (!p.relicCd && p.relic) this.text(p.x, p.y - 30, relicById(p.relic).n + ' ready', '#ffd27a'); }
      if (p.relic === 'regen' && p.roomsCleared % 3 === 0) this.heal(1, p);
    }
    if (r.type === 'combat') { const s = this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2); if (R.chance(0.18)) this.dropMinor(s.x - 14, s.y); if (R.chance(0.08)) this.pickups.push({ kind: 'stone', x: s.x + 14, y: s.y, t: 0 }); }
    if (r.type === 'exit') {
      const cx = r.mx * T + T / 2, cy = r.my * T + T / 2;
      this.pickups.push({ kind: 'portal', x: cx, y: cy + T * 2.5, t: 0, last: false });
      this.pickups.push({ kind: 'chest', x: cx, y: cy - T * 0.5, t: 0, room: r, n: 2 });
      this.pickups.push({ kind: 'half', x: cx - T * 2, y: cy + T * 1.5, t: 0 });
      Meta.data.stats.bestDepth = Math.max(Meta.data.stats.bestDepth || 0, this.depth);
    }
    if (r.type === 'combat' && !r.noRoll) {
      r.noRoll = true;
      const rr = RNG(hash(Game.seedNum, this.depth, r.id, 66)), roll = rr();
      const spot = this.freeSpot(r.mx * T + T / 2, r.my * T + T / 2);
      const L = (Game.diff && Game.diff.loot) || 1;
      if (roll < 0.12 * L) this.pickups.push({ kind: 'weapon', ...spot, w: makeWeapon(rr, { depth: this.depth }), t: 0 });
      else if (roll < 0.19 * L) this.pickups.push({ kind: 'potion', ...spot, id: rr.pick(POTIONS).id, t: 0 });
      else if (roll < 0.40) this.pickups.push({ kind: rr.chance(0.6) ? 'half' : 'heart', ...spot, t: 0 });
    }
  },
  chooseItems(rng, n, p) {
    const pool = ITEMS.filter(it => (it.pool === 'base' || Meta.has(it.pool)) && (it.id === 'heart' || !p.items.includes(it.id)));
    rng.shuffle(pool); return pool.slice(0, n);
  },

  // ---------- hazards (kobold traps) and spell zones ----------
  updHazards(dt) {
    this.updTraps(dt);
    for (const s of this.slime) s.life -= dt;
    if (this.slime.length && this.slime[0].life <= 0) this.slime = this.slime.filter(s => s.life > 0);
    const ps = this.players.filter(q => this.live(q));
    for (const p of this.players) p.slimed = this.live(p) && this.slime.some(s => s.life > 0.6 && d2(s.x, s.y, p.x, p.y) < (s.r * 0.8) ** 2);
    for (const h of this.hazards) {
      h.arm -= dt; h.life -= dt;
      if (h.fire) { if (R.chance(dt * 6)) this.part(h.x + R.range(-10, 10), h.y, 0, -50, 0.5, 3, '#ff7a2a', true); for (const p of ps) if (d2(h.x, h.y, p.x, p.y) < (h.r + p.r - 4) ** 2 && p.roll <= 0.03 && p.inv <= 0) this.hurt(p, 1, null, h.who || { n: 'Flames' }); continue; }
      for (const p of ps) if (h.life > 0 && h.arm <= 0 && d2(h.x, h.y, p.x, p.y) < (h.r + p.r - 2) ** 2 && p.roll <= 0.03 && p.inv <= 0) { h.life = 0; this.hurt(p, 1, null, h.who || { n: 'A snare' }); this.burst(h.x, h.y, 10, '#c8c8c8', 140, 0.3); }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
    for (const t of this.ptraps) {
      t.life -= dt;
      for (const e of this.enemies) {
        if (t.fading || t.hits <= 0 || e.dead || e.spawnT > 0 || e.air || e.bones > 0 || e.ghost) continue;
        if (d2(t.x, t.y, e.x, e.y) < (t.r + e.r) ** 2 && !(t.hitSet || (t.hitSet = new Set())).has(e)) {
          t.hitSet.add(e); t.hits--; e.chill = Math.max(e.chill, 1.4);
          this.damage(e, t.dmg, { x: t.x, y: t.y, depth: 1, elem: 'none', p: t.p });
        }
      }
    }
    this.ptraps = this.ptraps.filter(t => t.life > 0 && t.hits > 0);
    for (const z of this.zones) {
      z.t += dt; z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.07;
        const a = R() * TAU, d = Math.sqrt(R()) * z.r, x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
        this.part(x, y - 50, 0, 520, 0.1, 3, '#bfefff', true);
        this.burst(x, y, 3, '#bfefff', 70, 0.2);
        for (const e of this.enemies) if (!e.dead && e.spawnT <= 0 && d2(x, y, e.x, e.y) < (22 + e.r) ** 2) this.damage(e, z.dmg, { x, y, depth: 1, aoe: true, elem: 'frost', p: z.p });
      }
    }
    this.zones = this.zones.filter(z => z.t < z.dur);
  },

  // ---------- pickups ----------
  updPickups(dt) {
    const ps = this.players.filter(q => this.live(q));
    for (const k of this.pickups) {
      k.t += dt;
      const p = this.nearestP(k.x, k.y); if (!p) continue;
      const dd = d2(p.x, p.y, k.x, k.y);
      if (k.kind === 'ember') {
        k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= Math.exp(-5 * dt); k.vy *= Math.exp(-5 * dt);
        if (k.t > 0.35 && (dd < 170 * 170 || !this.locked)) { const d = Math.sqrt(dd) || 1, s = 420 + k.t * 200; k.x += (p.x - k.x) / d * s * dt; k.y += (p.y - k.y) / d * s * dt; }
        if (dd < 16 * 16 && k.t > 0.3) { k.gone = true; for (const q of this.players) q.embers++; Game.runEmbers++; Snd.play('ember'); } // everyone gets every ember
      } else if ((k.kind === 'heart' || k.kind === 'half') && dd < 20 * 20 && p.hp < p.maxHp) { k.gone = true; this.heal(k.kind === 'heart' ? 2 : 1, p); }
      else if (k.kind === 'item' && k.item && k.item.minor && dd < 22 * 22 && k.t > (k.dropped ? 3 : 0.3)) { k.gone = true; this.takeMinor(p, k.item); }
      else if (k.kind === 'stone' && dd < 22 * 22 && k.t > 0.3) { k.gone = true; this.sharpen(p, 'stone'); }
      else if (k.kind === 'key' && dd < 22 * 22) { k.gone = true; for (const q of this.players) q.keys++; Snd.play('item'); this.text(p.x, p.y - 24, '+1 Key', '#ffd27a'); this.burst(k.x, k.y, 16, '#ffd27a', 140, 0.5); }
    }
    this.pickups = this.pickups.filter(k => !k.gone);
    for (const p of this.players) {
      let near = null, bd = 40 * 40;
      if (this.live(p)) for (const k of this.pickups) if (['weapon', 'item', 'chest', 'portal', 'lockchest', 'potion', 'relic', 'corpse', 'merchant'].includes(k.kind) && k.t > 0.5 && !(k.item && k.item.minor)) { const dd = d2(p.x, p.y, k.x, k.y); if (dd < bd) { bd = dd; near = k; } }
      if (near !== p.near && p.near) p.near.confirm = false;
      p.near = near;
    }
    this.near = this.meP() ? this.meP().near || null : null;
  },
  interact(p) {
    const k = p.near || this.near; if (!k || k.gone) return;
    if (k.kind === 'portal') {
      if (this.unclaimed() && !k.confirm) { k.confirm = true; Snd.play('ui'); return; }
      if (this.coopN() > 1) { // wait on the other side until everyone's through
        p.inPortal = true; p.near = null; Snd.play('portal'); this.burst(p.x, p.y, 30, '#b98cff', 200, 0.6);
        if (!this.players.some(q => this.live(q))) { k.gone = true; Game.nextLevel(k.last); }
        return;
      }
      k.gone = true; Snd.play('portal'); Game.nextLevel(k.last); return;
    }
    if (k.kind === 'merchant') { if (p !== this.meP()) { k.msg = 'Only the host can trade for now'; return; } Game.state = 'pause'; Menu.show('merchant'); return; }
    if (k.kind === 'corpse') { // your remains: everything you lost spills back out
      k.gone = true; const cp = Game.char.corpse, L = cp.loot; let i = 0;
      const at = () => { const a = i++ * 1.3; return this.freeSpot(k.x + Math.cos(a) * 34, k.y + Math.sin(a) * 34); };
      for (const w of L.weapons) this.pickups.push({ kind: 'weapon', w, ...at(), t: 0 });
      for (const id of L.relics || (L.relic ? [L.relic] : [])) this.pickups.push({ kind: 'relic', id, ...at(), t: 0 });
      if (L.potion) this.pickups.push({ kind: 'potion', id: L.potion, ...at(), t: 0 });
      Game.char.corpse = null; Meta.save();
      Game.banner('Remains recovered', 'Beat the boss to keep it all', 2); Snd.play('synergy'); this.burst(k.x, k.y, 30, '#9fd8ff', 200, 0.6);
      this.pickups = this.pickups.filter(o => !o.gone); return;
    }
    if (k.kind === 'potion' || k.kind === 'relic') {
      k.gone = true; const slot = k.kind, old = p[slot];
      p[slot] = k.id; if (slot === 'relic') p.relicCd = 0;
      if (old) this.pickups.push({ kind: slot, id: old, x: k.x, y: k.y + 2, t: 0 });
      const D = slot === 'potion' ? potionById(k.id) : relicById(k.id);
      Snd.play('item'); this.text(p.x, p.y - 24, D.n, D.c);
      this.pickups = this.pickups.filter(o => !o.gone); return;
    }
    if (k.kind === 'lockchest') {
      const r = this.roomAt(k.x, k.y) || k.room;
      if (this.locked) { k.msg = 'Finish the fight first'; Snd.play('fizzle'); return; }
      if (p.keys <= 0) { k.msg = 'Locked. Find a key.'; Snd.play('fizzle'); return; }
      for (const q of this.players) q.keys = Math.max(0, q.keys - 1); k.gone = true;
      const rr = RNG(hash(Game.seedNum, this.depth, 777));
      if (rr.chance(0.25)) { // surprise
        const m = this.makeEnemy('mimic', k.x, k.y), hpM = 1 + 0.35 * (this.depth - 1);
        m.hp = m.maxHp = EDEF.mimic.hp * hpM; m.mini = true; m.spawnT = 0.5; m.name = 'Mimic'; m.title = 'It was never a chest';
        this.enemies.push(m); this.boss = m; this.room = r; r.noRoll = true; this.locked = true; this.setDoors(r, true); this.waves = [];
        Game.banner('Mimic!', 'It was never a chest', 1.6); Snd.play('roar'); Render.kick(8); Music.target = 1;
      } else this.chestLoot(k.x, k.y);
      this.pickups = this.pickups.filter(o => !o.gone);
      return;
    }
    if (k.kind === 'chest') {
      k.gone = true;
      const rng = RNG(hash(Game.seedNum, this.depth, k.room.id, 55));
      const items = this.chooseItems(rng, k.n + this.coopN() - 1, p), grp = R();
      items.forEach((it, i) => this.pickups.push({ kind: 'item', item: it, group: grp, x: k.x + (i - (items.length - 1) / 2) * 56, y: k.y + 6, t: 0 }));
      this.burst(k.x, k.y, 30, '#ffd27a', 200, 0.6); Snd.play('item');
      Game.banner('', this.coopN() > 1 ? 'One each' : 'Choose one', 1.2);
    } else if (k.kind === 'item') {
      if (!this.takeFromGroup(p, k)) return;
      this.giveItem(p, k.item);
    } else if (k.kind === 'weapon') {
      if (!this.takeFromGroup(p, k)) return;
      if (p.weapons.length < 2) { p.weapons.push(k.w); p.wi = p.weapons.length - 1; }
      else { const old = p.weapons[p.wi]; p.weapons[p.wi] = k.w; this.pickups.push({ kind: 'weapon', x: k.x, y: k.y + 2, w: old, t: 0 }); }
      p.charge = 0; Snd.play('item'); this.text(p.x, p.y - 24, k.w.name, RARITY[k.w.rarity].c);
    }
    this.pickups = this.pickups.filter(o => !o.gone);
  },
  dropMinor(x, y) { const it = R.pick(MINORS); this.pickups.push({ kind: 'item', item: it, x, y, t: 0 }); },
  takeMinor(p, it) {
    if (p.items.filter(id => id === it.id).length >= MINOR_CAP) { p.embers += 8; Game.runEmbers += 8; this.text(p.x, p.y - 24, it.n + ' maxed · +8 embers', '#ffb057'); Snd.play('ember'); return; }
    p.items.push(it.id); this.recalc(p); Snd.play('item'); this.burst(p.x, p.y, 14, it.c, 140, 0.4);
    const n = p.items.filter(id => id === it.id).length;
    this.text(p.x, p.y - 24, it.n + (n > 1 ? ' ×' + n : '') + ' · ' + it.d, it.c);
  },
  // Sharpening: +6% damage per step, up to +3. Goes on the weapon in hand, or the other one if that's maxed.
  sharpen(p, how) {
    const w = [p.weapons[p.wi], ...p.weapons.filter((x, i) => i !== p.wi)].find(x => x && (x.plus || 0) < 3);
    if (!w) { p.embers += 15; Game.runEmbers += 15; this.text(p.x, p.y - 24, 'Both weapons maxed · +15 embers', '#ffb057'); Snd.play('ember'); return false; }
    w.plus = (w.plus || 0) + 1; w.dmg *= 1.06; w.name = w.name.replace(/ \+\d$/, '') + ' +' + w.plus;
    this.text(p.x, p.y - 24, 'Sharpened: ' + w.name, '#e8f4ff'); Snd.play('charge'); this.burst(p.x, p.y, 20, '#e8f4ff', 160, 0.5);
    return true;
  },
  // "Pick one" groups (chests, armory): one pick per player, then the rest vanish
  takeFromGroup(p, k) {
    if (!k.group) { k.gone = true; return true; }
    const took = this.groupTook || (this.groupTook = {}), who = took[k.group] || (took[k.group] = []);
    if (who.includes(p.slot)) { k.msg = 'You already took one'; Snd.play('fizzle'); return false; }
    k.gone = true; who.push(p.slot);
    if (who.length >= this.players.filter(q => !q.gone).length) for (const o of this.pickups) if (o.group === k.group && o !== k) { o.gone = true; this.burst(o.x, o.y, 10, '#555', 80, 0.4); }
    return true;
  },
  // Campaign: send a floor weapon or relic into the Void Bag instead of carrying or scrapping it
  canBag() { const k = this.near; return Game.mode === 'campaign' && !!Game.char && !!k && (k.kind === 'weapon' || k.kind === 'relic'); },
  toBag(p) {
    if (!this.canBag()) return;
    const k = this.near, h = Game.char;
    if (!this.canSalvage(k)) { // already yours: it just goes home
      k.gone = true; this.text(k.x, k.y - 22, 'Back to your stash', '#b98cff'); this.burst(k.x, k.y, 18, '#9a6bff', 140, 0.5); Snd.play('portal');
      this.pickups = this.pickups.filter(o => !o.gone); this.near = null; return;
    }
    const cap = Campaign.cap(h), wpn = k.kind === 'weapon';
    const used = wpn ? h.stash.weapons.length + Game.bag.weapons.length : h.stash.relics.length + Game.bag.relics.length;
    if (used >= (wpn ? cap.w : cap.r)) { this.text(k.x, k.y - 22, 'Stash is full', '#ff8a9a'); Snd.play('fizzle'); return; }
    k.gone = true;
    if (k.group) for (const o of this.pickups) if (o.group === k.group && o !== k) { o.gone = true; this.burst(o.x, o.y, 10, '#555', 80, 0.4); }
    if (wpn) Game.bag.weapons.push(k.w); else Game.bag.relics.push(k.id);
    this.burst(k.x, k.y, 26, '#9a6bff', 170, 0.6); Snd.play('portal');
    this.text(k.x, k.y - 22, 'Into the Void Bag', '#b98cff');
    this.pickups = this.pickups.filter(o => !o.gone); this.near = null;
  },
  salvageValue(k) { return k.kind === 'relic' ? Math.round(relicById(k.id).cost * 0.1) : [3, 8, 20, 50, 125][k.w.rarity]; },
  canSalvage(k) { // in Campaign, gear that came from your stash can't be turned into free embers
    if (k.kind === 'weapon' && Game.mode === 'campaign' && Game.char && Game.char.stash.weapons.some(w => w.uid === k.w.uid)) return false;
    if (k.kind === 'relic' && Game.mode === 'campaign' && Game.char && Game.char.stash.relics.includes(k.id)) return false;
    return true;
  },
  salvage(p, k) {
    if (!this.canSalvage(k)) { this.text(k.x, k.y - 20, 'From your stash', '#aaa'); Snd.play('fizzle'); return; }
    const n = this.salvageValue(k);
    k.gone = true;
    if (k.group) for (const o of this.pickups) if (o.group === k.group && o !== k) { o.gone = true; this.burst(o.x, o.y, 10, '#555', 80, 0.4); }
    for (let i = 0; i < n; i++) this.pickups.push({ kind: 'ember', x: k.x, y: k.y, vx: R.range(-150, 150), vy: R.range(-150, 150), t: 0 });
    this.burst(k.x, k.y, 24, '#ffb057', 180, 0.5); Snd.play('heavy'); Snd.play('ember');
    this.text(k.x, k.y - 22, `+${n} embers`, '#ffb057');
    this.pickups = this.pickups.filter(o => !o.gone); this.near = null;
  },
  chestLoot(x, y) {
    const rng = RNG(hash(Game.seedNum, this.depth, 778));
    this.pickups.push({ kind: 'weapon', x, y, t: 0, w: makeWeapon(rng, { depth: this.depth, src: 'chest' }) });
    if (rng.chance(0.25)) this.pickups.push({ kind: 'relic', x: x + 40, y, t: 0, id: rng.pick(RELICS).id });
    else if (rng.chance(0.5)) this.pickups.push({ kind: 'potion', x: x + 40, y, t: 0, id: rng.pick(POTIONS).id });
    for (let i = 0; i < 8; i++) this.pickups.push({ kind: 'ember', x, y, vx: R.range(-140, 140), vy: R.range(-140, 140), t: 0 });
    this.burst(x, y, 30, '#ffd27a', 220, 0.6); Snd.play('item');
  },
  unclaimed() { return this.pickups.some(k => k.kind === 'chest' || (k.kind === 'item' && !k.dropped)); },
  giveItem(p, it) {
    const had = p.syn.slice();
    p.items.push(it.id); this.recalc(p); if (it.onPick) it.onPick(p); Snd.play('item');
    this.burst(p.x, p.y, 24, it.c, 200, 0.6);
    const got = SYNERGIES.find(s => p.syn.includes(s.id) && !had.includes(s.id));
    if (got) { Game.banner('Synergy: ' + got.n, got.d, 2.6); Snd.play('synergy'); this.burst(p.x, p.y, 50, '#ffffff', 300, 0.8); }
    else Game.banner(it.n, it.d, 2);
  },

  // ---------- projectiles ----------
  endProj(pr) {
    pr.dead = true;
    if (pr.blast) this.explode(pr.x, pr.y, pr.blast.rad, pr.blast.dmg, 1, pr.blast.elem === 'none' ? '#ffb057' : '#ff7a2a', { elem: pr.blast.elem || 'fire', p: pr.p, crit: pr.crit });
    else this.burst(pr.x, pr.y, 4, pr.color, 90, 0.25);
  },
  updProjs(dt) {
    for (const pr of this.projs) {
      if (pr.dead) continue;
      if (pr.owner === 'e' && this.timeStopT > 0) continue; // frozen in place
      if (pr.drag) { const k = Math.exp(-pr.drag * dt); pr.vx *= k; pr.vy *= k; }
      pr.life -= dt; if (pr.life <= 0) { if (pr.owner === 'p') this.endProj(pr); else pr.dead = true; continue; }
      if (pr.owner === 'p' && pr.homing > 0) {
        let best = null, bd = 280 * 280;
        for (const e of this.enemies) { if (e.dead || e.spawnT > 0 || e.bones > 0 || e.air || pr.hit.has(e)) continue; const dd = d2(pr.x, pr.y, e.x, e.y); if (dd < bd) { bd = dd; best = e; } }
        if (best) {
          const a = Math.atan2(pr.vy, pr.vx), ta = Math.atan2(best.y - pr.y, best.x - pr.x), sp = Math.hypot(pr.vx, pr.vy);
          const na = a + clamp(angDiff(a, ta), -pr.homing * dt, pr.homing * dt);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
      if (this.solidAt(nx, ny)) {
        if (pr.owner === 'p') { const ti = Math.floor(ny / T) * MW + Math.floor(nx / T); if (this.thp.has(ti)) { this.hitTile(ti, pr.blast || (this.thorns.has(ti) && (pr.elem === 'fire' || pr.extraElem === 'fire')) ? 3 : 1); if (!pr.blast) { pr.dead = true; continue; } } }
        if (pr.kind === 'wave') { pr.dead = true; continue; }
        if (pr.bounce > 0) {
          pr.bounce--;
          if (this.solidAt(nx, pr.y)) pr.vx = -pr.vx; if (this.solidAt(pr.x, ny)) pr.vy = -pr.vy;
          if (!this.solidAt(nx, pr.y) && !this.solidAt(pr.x, ny)) { pr.vx = -pr.vx; pr.vy = -pr.vy; }
          pr.hit = new Set(); pr.life = Math.max(pr.life, 0.5);
          if (this.hasSyn('balllightning')) this.chain({ x: pr.x, y: pr.y }, pr.dmg * 0.6, 1, pr.p, pr.x, pr.y);
          this.burst(pr.x, pr.y, 3, pr.color, 80, 0.2);
        } else if (pr.owner === 'p') this.endProj(pr);
        else { pr.dead = true; this.burst(pr.x, pr.y, 4, pr.color, 90, 0.25); }
        continue;
      }
      pr.x = nx; pr.y = ny;
      if (pr.owner === 'p') {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || e.air || pr.hit.has(e)) continue;
          if (d2(pr.x, pr.y, e.x, e.y) < (pr.r + e.r) ** 2) {
            let dmg = pr.dmg, crit = pr.crit;
            if (!crit && pr.hit.size === 0 && pr.homing > 0 && pr.p.syn.includes('deadeye')) { dmg *= pr.p.st.critMult; crit = true; }
            pr.hit.add(e);
            this.damage(e, dmg, { proj: pr, dmg, elem: pr.elem, depth: pr.depth, shard: pr.shard, p: pr.p, x: pr.x, y: pr.y, leech: pr.leech, extraElem: pr.extraElem, crit, stun: pr.stun, elemPow: pr.elemPow });
            if (pr.chains) this.chain(e, pr.dmg * 0.8, 1, pr.p, e.x, e.y, pr.chains);
            if (pr.blast) { this.endProj(pr); break; }
            if (pr.pierce > 0) pr.pierce--; else { this.endProj(pr); break; }
          }
        }
      } else {
        if (pr.homing) { // homing skulls drift after the nearest player
          const tp = this.nearestP(pr.x, pr.y);
          if (tp) { const a = Math.atan2(pr.vy, pr.vx), ta = Math.atan2(tp.y - pr.y, tp.x - pr.x), sp = Math.hypot(pr.vx, pr.vy), na = a + clamp(angDiff(a, ta), -pr.homing * dt, pr.homing * dt); pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp; }
        }
        for (const p of this.players) if (this.live(p) && d2(pr.x, pr.y, p.x, p.y) < (pr.r + p.r - 3) ** 2 && p.inv <= 0 && p.roll <= 0.03) {
          pr.dead = true;
          if (p.parryT > 0 || p.lunge > 0) { this.burst(pr.x, pr.y, 6, '#ffffff', 120, 0.25); Snd.play('deflect'); continue; }
          if (pr.kind === 'web') p.slowT = 1.4; this.hurt(p, 1, { x: pr.x - pr.vx * 0.05, y: pr.y - pr.vy * 0.05 }, pr.who);
        }
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
