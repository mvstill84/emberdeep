// ===== Data: elements, weapons, items, synergies, enemies, unlocks, secret seeds =====
const ELEM = {
  none: { c: '#dfe9ff', n: '' },
  fire: { c: '#ff7a2a', n: 'Ember' },
  frost: { c: '#7fd8ff', n: 'Frost' },
  storm: { c: '#f2f25a', n: 'Storm' },
  arcane: { c: '#c77dff', n: 'Arcane' },
};
const RARITY = [
  { n: 'Common', c: '#b8c0cc', m: 1 },
  { n: 'Rare', c: '#4fa3ff', m: 1.22 },
  { n: 'Epic', c: '#b26bff', m: 1.45 },
  { n: 'Legendary', c: '#ffb02e', m: 1.75 },
];
const WBASE = {
  sword: { names: ['Blade', 'Sword', 'Saber', 'Cleaver', 'Longsword', 'Falchion'], dmg: [10, 14], cd: [0.34, 0.46], reach: [46, 60], arc: [105, 145] },
  bow: { names: ['Bow', 'Longbow', 'Shortbow', 'Recurve', 'Warbow'], dmg: [12, 16], cd: [0.16, 0.24], charge: [0.45, 0.75], speed: [540, 660] },
  staff: { names: ['Staff', 'Wand', 'Rod', 'Scepter', 'Stave'], dmg: [4.5, 6.5], cd: [0.13, 0.2], speed: [360, 440], spread: [0.04, 0.14] },
};
const QUIRKS = [
  { id: 'twin', n: 'Twin', suf: 'of Pairs', d: 'Fires an extra projectile', t: ['bow', 'staff'] },
  { id: 'echo', n: 'Echoing', suf: 'of Echoes', d: 'Every swing strikes twice', t: ['sword'] },
  { id: 'swift', n: 'Swift', suf: 'of Haste', d: '+30% attack speed', t: ['sword', 'bow', 'staff'] },
  { id: 'heavy', n: 'Heavy', suf: 'of Ruin', d: '+50% damage, slower', t: ['sword', 'bow', 'staff'] },
  { id: 'seeking', n: 'Seeking', suf: 'of the Hunt', d: 'Shots curve toward foes', t: ['bow', 'staff'] },
  { id: 'wave', n: 'Crescent', suf: 'of the Moon', d: 'Swings launch a crescent wave', t: ['sword'] },
  { id: 'pierce', n: 'Piercing', suf: 'of Lances', d: 'Shots pierce one more foe', t: ['bow', 'staff'] },
  { id: 'leech', n: 'Leeching', suf: 'of Thirst', d: 'Kills sometimes heal', t: ['sword', 'bow', 'staff'] },
];
const SYL = ['ka', 'vel', 'mor', 'thra', 'zen', 'ul', 'dra', 'sil', 'nyx', 'or', 'bel', 'cai', 'rhun', 'ae', 'lis', 'gor', 'vash', 'myr', 'ith', 'tal'];
function properName(rng, n = 2) {
  let s = ''; for (let i = 0; i < n; i++) s += rng.pick(SYL);
  if (rng.chance(0.3)) s = s.slice(0, 2) + "'" + s.slice(2);
  return s[0].toUpperCase() + s.slice(1);
}

// Build a weapon from a seed. Everything about it comes out of the rng.
function makeWeapon(rng, opts = {}) {
  const type = opts.type || rng.pick(opts.types || ['sword', 'bow', 'staff']);
  const B = WBASE[type];
  let rar = opts.rarity;
  if (rar === undefined) {
    const luck = Meta.has('luck') ? 1.5 : 1, f = opts.floor || 1;
    const roll = rng();
    rar = roll < 0.035 * luck * f ? 3 : roll < 0.14 * luck * f ? 2 : roll < 0.42 * luck ? 1 : 0;
  }
  if (Game.mods.allLegendary) rar = 3;
  const R0 = RARITY[rar];
  const w = {
    type, rarity: rar,
    dmg: rng.range(...B.dmg) * R0.m,
    cd: rng.range(...B.cd),
    elem: opts.elem || (rar === 0 && rng.chance(0.6) ? 'none' : rng.pick(['none', 'fire', 'frost', 'storm', 'arcane'])),
    quirks: [],
  };
  if (type === 'sword') { w.reach = rng.range(...B.reach); w.arc = rng.range(...B.arc) * Math.PI / 180; }
  if (type === 'bow') { w.charge = rng.range(...B.charge); w.speed = rng.range(...B.speed); }
  if (type === 'staff') { w.speed = rng.range(...B.speed); w.spread = rng.range(...B.spread); }
  const nq = rar >= 3 ? 2 : rar >= 1 ? 1 : (rng.chance(0.25) ? 1 : 0);
  const pool = QUIRKS.filter(q => q.t.includes(type));
  rng.shuffle(pool);
  for (let i = 0; i < nq; i++) w.quirks.push(pool[i].id);
  if (w.quirks.includes('heavy')) { w.dmg *= 1.5; w.cd *= 1.35; }
  if (w.quirks.includes('swift')) w.cd /= 1.3;
  const base = rng.pick(B.names), el = ELEM[w.elem].n;
  if (opts.name) w.name = opts.name;
  else if (rar === 3) w.name = `${properName(rng)}, ${el ? el + ' ' : ''}${base}`;
  else {
    const q = w.quirks[0] ? QUIRKS.find(x => x.id === w.quirks[0]) : null;
    w.name = `${el ? el + ' ' : ''}${base}${q ? ' ' + q.suf : ''}`;
  }
  return w;
}
const hasQ = (w, id) => w.quirks.includes(id);

// ===== Items: each one hooks into the attack pipeline. Synergies fall out of combinations. =====
// Hooks: shoot(proj) | hit(enemy, src) | kill(enemy, src) | roll() | hurt() | clear()
const ITEMS = [
  { id: 'heart', n: 'Ember Heart', d: '+1 heart, heal fully', c: '#ff5470', pool: 'base', g: 'heart', apply(p) { p.maxHp += 2; p.hp = p.maxHp; } },
  { id: 'boots', n: 'Quicksilver Boots', d: 'Move faster, roll more often', c: '#9ff', pool: 'base', g: 'boot', apply(p) { p.st.speed *= 1.15; p.st.rollCd *= 0.6; } },
  { id: 'twinmoon', n: 'Twin Moon', d: '+1 projectile, a bit less damage', c: '#e8e8ff', pool: 'base', g: 'moon', apply(p) { p.st.extraShots++; p.st.dmg *= 0.88; } },
  { id: 'ricochet', n: 'Ricochet Charm', d: 'Shots bounce off walls', c: '#7dffb0', pool: 'base', g: 'ring', apply(p) { p.st.bounce++; } },
  { id: 'haste', n: 'Haste Totem', d: '+22% attack speed', c: '#ffe066', pool: 'base', g: 'bolt', apply(p) { p.st.rate *= 1.22; } },
  { id: 'berserk', n: 'Berserker Band', d: '+30% damage, -1 heart', c: '#ff4040', pool: 'base', g: 'fang', apply(p) { p.st.dmg *= 1.3; p.maxHp = Math.max(2, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); } },
  { id: 'mirror', n: 'Mirror Ward', d: 'Swords reflect enemy shots back', c: '#bfe3ff', pool: 'base', g: 'shield', apply(p) { p.st.reflect = true; } },
  { id: 'hungry', n: 'Hungry Blade', d: 'Every 15 kills, heal half a heart', c: '#ff7aa8', pool: 'base', g: 'fang', apply(p) { p.hooks.kill.push(() => { p.hungry = (p.hungry || 0) + 1; if (p.hungry >= 15) { p.hungry = 0; World.heal(1); } }); } },
  { id: 'reach', n: 'Giant\'s Grip', d: 'Swords reach farther and hit harder', c: '#d9a066', pool: 'base', g: 'sword', apply(p) { p.st.reach *= 1.3; p.st.meleeDmg *= 1.2; } },
  // Elemental Codex
  { id: 'kindling', n: 'Kindling', d: 'Hits set foes on fire', c: '#ff7a2a', pool: 'codexE', g: 'flame', apply(p) { p.st.addElem.add('fire'); } },
  { id: 'frostlens', n: 'Frost Lens', d: 'Hits chill foes, sometimes freezing them', c: '#7fd8ff', pool: 'codexE', g: 'flake', apply(p) { p.st.addElem.add('frost'); } },
  { id: 'storm', n: 'Storm Coil', d: 'Hits may arc lightning to nearby foes', c: '#f2f25a', pool: 'codexE', g: 'bolt', apply(p) { p.st.addElem.add('storm'); } },
  // Arcane Codex
  { id: 'split', n: 'Splitting Rune', d: 'Shots split into shards on hit', c: '#c77dff', pool: 'codexA', g: 'split', apply(p) {
      p.hooks.hit.push((e, s) => { if (!s.proj || s.shard) return; const n = World.hasSyn('constellation') ? 3 : 2; for (let i = 0; i < n; i++) { const a = Math.atan2(s.proj.vy, s.proj.vx) + (i - (n - 1) / 2) * 0.9; World.spawnShard(e, a, s); } });
    } },
  { id: 'volatile', n: 'Volatile Sigil', d: 'Foes explode when they die', c: '#ff9a3c', pool: 'codexA', g: 'burst', apply(p) { p.hooks.kill.push((e, s) => { if ((s.depth || 0) < 3) World.explode(e.x, e.y, 70, 14 * p.st.dmg, (s.depth || 0) + 1, '#ff9a3c'); }); } },
  { id: 'homing', n: 'Homing Glyph', d: 'Shots seek the nearest foe', c: '#d6a2ff', pool: 'codexA', g: 'eye', apply(p) { p.st.homing += 2.5; } },
  // Relic Vault
  { id: 'phoenix', n: 'Phoenix Feather', d: 'Revive once with 2 hearts', c: '#ffb02e', pool: 'relics', g: 'feather', apply(p) { p.revives++; } },
  { id: 'thunder', n: 'Rolling Thunder', d: 'Rolling releases a ring of sparks', c: '#f2f25a', pool: 'relics', g: 'ring', apply(p) { p.hooks.roll.push(() => World.ring(p.x, p.y, 10, 6 * p.st.dmg, 'storm')); } },
  { id: 'thorns', n: 'Thorn Mantle', d: 'Getting hit fires thorns everywhere', c: '#7dff7a', pool: 'relics', g: 'burst', apply(p) { p.hooks.hurt.push(() => World.ring(p.x, p.y, 16, 9 * p.st.dmg, 'none')); } },
];
const SYNERGIES = [
  { id: 'steam', n: 'Steam Burst', need: ['kindling', 'frostlens'], d: 'Hitting a burning, chilled foe makes it burst' },
  { id: 'constellation', n: 'Constellation', need: ['split', 'twinmoon'], d: 'Shots split into three shards' },
  { id: 'balllightning', n: 'Ball Lightning', need: ['storm', 'ricochet'], d: 'Every bounce throws lightning' },
  { id: 'cinderwake', n: 'Cinder Wake', need: ['thunder', 'kindling'], d: 'Roll sparks set foes ablaze' },
];

// ===== Enemies =====
const EDEF = {
  slime: { hp: 24, r: 11, sp: 62, cost: 1, c: '#6cff8a', ai: 'hop', touch: 1, embers: 1 },
  bigslime: { hp: 60, r: 18, sp: 48, cost: 3, c: '#3fe070', ai: 'hop', touch: 1, embers: 2, split: 'slime' },
  archer: { hp: 26, r: 11, sp: 72, cost: 2, c: '#efe6cf', ai: 'kite', touch: 1, embers: 1 },
  cultist: { hp: 36, r: 12, sp: 40, cost: 3, c: '#b26bff', ai: 'caster', touch: 1, embers: 2 },
  bat: { hp: 12, r: 8, sp: 150, cost: 1, c: '#ff4d6d', ai: 'swoop', touch: 1, embers: 1 },
  knight: { hp: 80, r: 15, sp: 58, cost: 4, c: '#9fb4ff', ai: 'charger', touch: 2, embers: 3 },
};
const FLOOR_POOL = [
  null,
  ['slime', 'slime', 'archer', 'cultist', 'bigslime'],
  ['slime', 'archer', 'cultist', 'bat', 'bat', 'bigslime', 'knight'],
  ['archer', 'cultist', 'bat', 'bigslime', 'knight', 'knight'],
  ['archer', 'cultist', 'bat', 'bigslime', 'knight'],
];
const FLOOR_NAMES = [null, 'The Sunken Halls', 'The Ashen Crypt', 'The Hollow Throne', 'The Deep Below'];
const FLOOR_TINT = [null, '#39e6ff', '#c77dff', '#ff7a3a', '#7dffb0'];
const BOSS_TITLES = ['the Ashen Warden', 'Keeper of Cinders', 'the Hollow King', 'Who Waits Below'];

// ===== Sanctum unlocks (permanent) =====
const UNLOCKS = [
  { id: 'heart1', n: 'Sturdy Heart', d: 'Start every run with +1 heart', cost: 30 },
  { id: 'staffs', n: 'Spellbook', d: 'Staffs can appear in the dungeon', cost: 25 },
  { id: 'codexE', n: 'Elemental Codex', d: 'Adds Kindling, Frost Lens and Storm Coil to the item pool', cost: 45 },
  { id: 'fletcher', n: 'Fletcher', d: 'Your starting bow is Rare', cost: 35 },
  { id: 'codexA', n: 'Arcane Codex', d: 'Adds Splitting Rune, Volatile Sigil and Homing Glyph', cost: 60 },
  { id: 'heart2', n: 'Stout Heart', d: 'Another +1 starting heart', cost: 90, req: 'heart1' },
  { id: 'luck', n: 'Lucky Loot', d: 'Rare, Epic and Legendary weapons drop more often', cost: 75 },
  { id: 'relics', n: 'Relic Vault', d: 'Adds Phoenix Feather, Rolling Thunder and Thorn Mantle', cost: 100 },
  { id: 'deep', n: 'The Deep Below', d: 'A fourth floor opens past the Hollow Throne', cost: 150, req: 'relics' },
];

// ===== Secret seeds: only their hashes live in the code, so you can't read them out of the file =====
const SECRETS = {
  3850287304: { n: 'Moonwell', d: 'Darkness falls. Embers count double.', mods: { dark: true, emberMult: 2 } },
  2418072430: { n: 'Glass Cannon', d: 'One heart. Triple damage.', mods: { glass: true } },
  1049012998: { n: 'Golden Hoard', d: 'Every weapon is Legendary.', mods: { allLegendary: true } },
};
