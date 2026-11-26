// ===== Data: elements, weapons, items, synergies, enemies, worlds, unlocks, secret seeds =====
const ELEM = {
  none: { c: '#dfe9ff', n: '' },
  fire: { c: '#ff7a2a', n: 'Ember' },
  frost: { c: '#7fd8ff', n: 'Frost' },
  storm: { c: '#f2f25a', n: 'Storm' },
  arcane: { c: '#c77dff', n: 'Arcane' },
};
const RARITY = [
  { n: 'Common', c: '#a3abb5', m: 1 },
  { n: 'Uncommon', c: '#4ade80', m: 1.07 }, // rarity buys more quirks and elements, only a little raw damage
  { n: 'Rare', c: '#4fa3ff', m: 1.14 },
  { n: 'Epic', c: '#b26bff', m: 1.21 },
  { n: 'Legendary', c: '#ff9a2e', m: 1.3 },
];
// Weapon families. cat: melee | ranged | magic
const WBASE = {
  sword: { cat: 'melee', names: ['Blade', 'Sword', 'Saber', 'Longsword', 'Falchion'], dmg: [10, 13], cd: [0.34, 0.44], reach: [46, 58], arc: [110, 140], crit: 0.06, d: 'Balanced and quick.' },
  axe: { cat: 'melee', names: ['Axe', 'Greataxe', 'Hatchet', 'War Axe', 'Bearded Axe'], dmg: [17, 22], cd: [0.58, 0.72], reach: [50, 60], arc: [150, 175], crit: 0.25, d: 'Slow, wide cleave. Crits often.' },
  hammer: { cat: 'melee', names: ['Hammer', 'Warhammer', 'Maul', 'Mace', 'Morningstar'], dmg: [20, 26], cd: [0.75, 0.9], reach: [44, 52], arc: [70, 95], crit: 0.05, d: 'Slowest. Stuns, sends a shockwave, shatters bones.' },
  spear: { cat: 'melee', names: ['Spear', 'Pike', 'Glaive', 'Trident', 'Halberd'], dmg: [9, 12], cd: [0.3, 0.38], reach: [80, 94], arc: [24, 24], crit: 0.08, d: 'Fast, long thrust through everything in a line.' },
  bow: { cat: 'ranged', names: ['Bow', 'Longbow', 'Shortbow', 'Recurve', 'Warbow'], dmg: [12, 16], cd: [0.16, 0.24], charge: [0.45, 0.75], speed: [540, 660], crit: 0.08, d: 'Hold to draw. A full draw pierces.' },
  crossbow: { cat: 'ranged', names: ['Crossbow', 'Arbalest', 'Repeater', 'Heavy Crossbow'], dmg: [20, 26], cd: [0.7, 0.9], speed: [700, 760], crit: 0.1, d: 'Slow reload. Bolts pierce every foe in a line.' },
  wand: { cat: 'magic', mana: 4, names: ['Wand', 'Rod', 'Switch', 'Baton'], dmg: [3.4, 4.6], cd: [0.085, 0.12], speed: [420, 480], spread: [0.03, 0.08], crit: 0.04, d: 'Fast, weak bolts.' },
  staff: { cat: 'magic', mana: 9, names: ['Staff', 'Stave', 'Quarterstaff', 'Crook'], dmg: [6.5, 9], cd: [0.2, 0.28], speed: [350, 400], spread: [0.04, 0.1], crit: 0.05, d: 'Steady bolts. Elements hit twice as hard.' },
  spellbook: { cat: 'magic', names: ['Tome', 'Grimoire', 'Codex', 'Spellbook'], crit: 0.05, d: 'Powerful spells on a cooldown. No mana.' },
};
const SPELLS = {
  fireball: { n: 'Fireball', elem: 'fire', dmg: [36, 46], cd: [2.4, 3.0], d: 'Exploding ball of fire' },
  chain: { n: 'Chain Lightning', elem: 'storm', dmg: [22, 28], cd: [1.8, 2.2], d: 'Arcs between up to 5 foes' },
  icestorm: { n: 'Ice Storm', elem: 'frost', dmg: [8, 10], cd: [2.8, 3.4], d: 'Shards rain on an area, chilling' },
  missiles: { n: 'Magic Missile', elem: 'arcane', dmg: [8, 10], cd: [1.8, 2.2], d: 'Five seeking darts' },
};
const QUIRKS = [
  { id: 'twin', n: 'Twin', suf: 'of Pairs', d: 'Fires a second, weaker projectile', t: ['bow', 'crossbow', 'wand', 'staff'] },
  { id: 'echo', n: 'Echoing', suf: 'of Echoes', d: 'Every swing strikes again, weaker', t: ['sword', 'axe', 'spear'] },
  { id: 'swift', n: 'Swift', suf: 'of Haste', d: '+30% attack speed', t: Object.keys(WBASE) },
  { id: 'heavy', n: 'Heavy', suf: 'of Ruin', d: '+35% damage, slower', t: Object.keys(WBASE) },
  { id: 'seeking', n: 'Seeking', suf: 'of the Hunt', d: 'Shots curve toward foes', t: ['bow', 'crossbow', 'wand', 'staff', 'spellbook'] },
  { id: 'wave', n: 'Crescent', suf: 'of the Moon', d: 'Swings launch a crescent wave', t: ['sword', 'axe'] },
  { id: 'pierce', n: 'Piercing', suf: 'of Lances', d: 'Shots pierce one more foe', t: ['bow', 'wand', 'staff'] },
  { id: 'leech', n: 'Leeching', suf: 'of Thirst', d: 'Kills sometimes heal', t: Object.keys(WBASE) },
  { id: 'stun', n: 'Stunning', suf: 'of Thunderclaps', d: 'Hits may stun', t: ['sword', 'axe', 'spear', 'crossbow'] },
  { id: 'keen', n: 'Keen', suf: 'of Precision', d: '+15% crit chance', t: ['sword', 'axe', 'spear', 'bow', 'crossbow'] },
  { id: 'wide', n: 'Sweeping', suf: 'of the Sweep', d: 'Wider, longer swings', t: ['sword', 'axe', 'hammer', 'spear'] },
  { id: 'brutal', n: 'Brutal', suf: 'of Butchery', d: 'Crits hit much harder', t: ['sword', 'axe', 'hammer', 'spear', 'bow', 'crossbow'] },
];
// What each foe shrugs off or takes extra from. Physical: slash (swords, axes), pierce (spears, arrows), blunt (hammers, blasts). Nobody is immune.
const RESIST = {
  skeleton: { slash: 0.75, pierce: 0.7, blunt: 1.3 }, skelArcher: { slash: 0.75, pierce: 0.7, blunt: 1.3 },
  zombie: { pierce: 0.75, fire: 1.3 },
  cube: { blunt: 0.75, frost: 1.3 }, cubeling: { blunt: 0.75, frost: 1.3 },
  wraith: { slash: 0.8, pierce: 0.8, arcane: 1.3 },
  blight: { fire: 1.4, slash: 1.2 },
  spider: { blunt: 1.25, fire: 1.2 },
  stirge: { pierce: 1.25 },
  otyugh: { pierce: 0.8, fire: 1.2 }, owlbear: { pierce: 0.8 },
  sprite: { arcane: 0.7, storm: 1.25 },
  necro: { arcane: 0.75 },
  mimic: { pierce: 0.75, fire: 1.3 },
  crystal: { blunt: 1.3 }, banner: { fire: 1.3 },
};
const SYL = ['ka', 'vel', 'mor', 'thra', 'zen', 'ul', 'dra', 'sil', 'nyx', 'or', 'bel', 'cai', 'rhun', 'ae', 'lis', 'gor', 'vash', 'myr', 'ith', 'tal', 'grim', 'uk', 'zar'];
function properName(rng, n = 2) {
  let s = ''; for (let i = 0; i < n; i++) s += rng.pick(SYL);
  if (rng.chance(0.3)) s = s.slice(0, 2) + "'" + s.slice(2);
  return s[0].toUpperCase() + s.slice(1);
}

// Rarity odds by depth (1-9) and source. Legendary is gated to later worlds and bosses.
function rollRarity(rng, depth, src = 'room') {
  const d = depth;
  // gray fades fast: by the second level of a run Uncommon is as likely, and mostly takes over after that
  const w = [Math.max(8, 50 - 14 * (d - 1)), 30 + 3 * d, 6 + 2.2 * d, d <= 1 ? 0.6 : 0.8 + 1.1 * (d - 1), d < 4 ? 0 : 0.25 * (d - 3)];
  if (src === 'boss') { w[0] *= 0.4; w[3] += 6; if (d >= 3) w[4] += 2 + d * 0.6; }
  if (src === 'armory') { w[0] = 0; w[2] += 6; }
  if (src === 'chest') { w[0] = 0; w[3] += 3; if (d >= 4) w[4] += 0.6; }
  if (Meta.has('luck')) { w[2] *= 1.4; w[3] *= 1.4; w[4] *= 1.4; }
  const rm = (Game.diff && Game.diff.rare) || 1; w[2] *= rm; w[3] *= rm; w[4] *= rm;
  let tot = w.reduce((a, b) => a + b, 0), r = rng() * tot;
  for (let i = 0; i < 5; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}
// Drops lean 60% toward your class's weapon family
function pickWeaponType(rng) {
  const mine = CLASSES[Game.cls || 'fighter'].cat, others = ['melee', 'ranged', 'magic'].filter(c => c !== mine);
  const cat = rng.chance(0.6) ? mine : rng.pick(others);
  return rng.pick(Object.keys(WBASE).filter(k => WBASE[k].cat === cat));
}

// Build a weapon from a seed. Everything about it comes out of the rng.
function makeWeapon(rng, opts = {}) {
  const type = opts.type || pickWeaponType(rng);
  const B = WBASE[type];
  let rar = opts.rarity !== undefined ? opts.rarity : rollRarity(rng, opts.depth || 1, opts.src);
  if (Game.mods.allLegendary) rar = 4;
  const R0 = RARITY[rar];
  const w = { type, cat: B.cat, rarity: rar, crit: B.crit, quirks: [], uid: Math.random().toString(36).slice(2, 10) };
  if (type === 'spellbook') {
    w.spell = opts.spell || rng.pick(Object.keys(SPELLS));
    const S = SPELLS[w.spell]; w.elem = S.elem; w.dmg = rng.range(...S.dmg) * R0.m; w.cd = rng.range(...S.cd);
  } else {
    w.dmg = rng.range(...B.dmg) * R0.m; w.cd = rng.range(...B.cd);
    const elemChance = [0.15, 0.35, 0.55, 1, 1][rar] + (B.cat === 'magic' ? 0.4 : 0);
    w.elem = opts.elem || (rng.chance(elemChance) ? rng.pick(['fire', 'frost', 'storm', 'arcane']) : 'none');
  }
  if (B.reach) { w.reach = rng.range(...B.reach); w.arc = rng.range(...B.arc) * Math.PI / 180; }
  if (B.charge) w.charge = rng.range(...B.charge);
  if (B.speed) w.speed = rng.range(...B.speed);
  if (B.spread) w.spread = rng.range(...B.spread);
  const nq = rar >= 4 ? 3 : rar === 3 ? 2 : rar === 2 ? (rng.chance(0.4) ? 2 : 1) : rar === 1 ? 1 : 0;
  const pool = rng.shuffle(QUIRKS.filter(q => q.t.includes(type)));
  for (let i = 0; i < nq && i < pool.length; i++) w.quirks.push(pool[i].id);
  if (w.quirks.includes('heavy')) { w.dmg *= 1.35; w.cd *= 1.3; }
  // item level: where it dropped. Deeper finds hit harder, so even a gray from 3-1 beats one from 1-1
  w.ilvl = opts.ilvl || opts.depth || 1; w.dmg *= 1 + 0.06 * (w.ilvl - 1);
  if (w.quirks.includes('swift')) w.cd /= 1.3;
  if (w.quirks.includes('keen')) w.crit += 0.15;
  const base = rng.pick(B.names), el = ELEM[w.elem].n;
  if (opts.name) w.name = opts.name;
  else if (type === 'spellbook') w.name = rar === 4 ? `${properName(rng)}'s ${base} of ${SPELLS[w.spell].n}` : `${base} of ${SPELLS[w.spell].n}`;
  else if (rar === 4) w.name = `${properName(rng)}, ${el ? el + ' ' : ''}${base}`;
  else {
    const q = w.quirks[0] ? QUIRKS.find(x => x.id === w.quirks[0]) : null;
    w.name = `${el ? el + ' ' : ''}${base}${q ? ' ' + q.suf : ''}`;
  }
  return w;
}
const hasQ = (w, id) => w.quirks.includes(id);

// ===== Items: each one hooks into the attack pipeline. Synergies fall out of combinations. =====
// Hooks: shoot(proj) | hit(enemy, src) | kill(enemy, src) | roll() | hurt() | clear()
// Minor items: small, common, and they stack (up to 5 of each). The trickle between big finds.
const MINOR_CAP = 5;
const MINORS = [
  { id: 'm_whet', n: 'Whetstone', d: '+8% melee damage', c: '#c8ccd6', g: 'sword', apply(p) { p.st.meleeDmg *= 1.08; } },
  { id: 'm_quiver', n: 'Spare Quiver', d: '+7% ranged damage', c: '#d9b380', g: 'feather', apply(p) { p.st.rangedDmg *= 1.07; } },
  { id: 'm_fletch', n: 'Fletching Kit', d: 'Bows draw 8% faster', c: '#e0c79a', g: 'moon', apply(p) { p.st.draw *= 0.92; } },
  { id: 'm_rune', n: 'Rune Chip', d: '+7% spell damage', c: '#b98cff', g: 'eye', apply(p) { p.st.magicDmg *= 1.07; } },
  { id: 'm_shard', n: 'Mana Shard', d: '+10 max mana', c: '#6fb6ff', g: 'flake', apply(p) { p.st.manaAdd += 10; } },
  { id: 'm_bead', n: 'Focus Bead', d: 'Mana refills 12% faster', c: '#8fd0ff', g: 'ring', apply(p) { p.st.regenMult *= 1.12; } },
  { id: 'm_sigil', n: 'Ember Sigil', d: '+5% damage', c: '#ff9a5a', g: 'flame', apply(p) { p.st.dmg *= 1.05; } },
  { id: 'm_gloves', n: 'Grip Gloves', d: '+6% attack speed', c: '#ffd27a', g: 'bolt', apply(p) { p.st.rate *= 1.06; } },
  { id: 'm_boots', n: 'Worn Boots', d: '+5% move speed', c: '#9fe0e0', g: 'boot', apply(p) { p.st.speed *= 1.05; } },
  { id: 'm_feather', n: 'Swift Feather', d: 'Roll recovers 8% faster', c: '#e8f4ff', g: 'feather', apply(p) { p.st.rollCd *= 0.92; } },
  { id: 'm_clover', n: 'Lucky Clover', d: '+4% crit chance', c: '#7dde7d', g: 'split', apply(p) { p.st.crit += 0.04; } },
  { id: 'm_eye', n: 'Hawk Eye', d: 'Crits hit 10% harder', c: '#ffe066', g: 'eye', apply(p) { p.st.critMult += 0.1; } },
  { id: 'm_haft', n: 'Long Haft', d: 'Melee reaches 5% farther', c: '#c9a070', g: 'sword', apply(p) { p.st.reach *= 1.05; } },
  { id: 'm_blood', n: 'Bloodstone Chip', d: 'Kills have a 3% chance to heal half a heart', c: '#ff5c7a', g: 'heart', apply(p) { p.hooks.kill.push(() => { if (R.chance(0.03)) World.heal(1, p); }); } },
].map(m => Object.assign(m, { pool: 'minor', minor: true }));
const ITEMS = [
  { id: 'heart', n: 'Ember Heart', d: '+1 max heart for the rest of the run, heal fully', c: '#ff5470', pool: 'base', g: 'heart', apply(p) { p.maxHp += 2; }, onPick(p) { p.hp = p.maxHp; } },
  { id: 'boots', n: 'Quicksilver Boots', d: 'Move faster, roll more often', c: '#9ff', pool: 'base', g: 'boot', apply(p) { p.st.speed *= 1.15; p.st.rollCd *= 0.6; } },
  { id: 'twinmoon', n: 'Twin Moon', d: '+1 projectile, a bit less damage', c: '#e8e8ff', pool: 'base', g: 'moon', apply(p) { p.st.extraShots++; p.st.dmg *= 0.88; } },
  { id: 'ricochet', n: 'Ricochet Charm', d: 'Shots bounce off walls', c: '#7dffb0', pool: 'base', g: 'ring', apply(p) { p.st.bounce++; } },
  { id: 'haste', n: 'Haste Totem', d: '+22% attack speed', c: '#ffe066', pool: 'base', g: 'bolt', apply(p) { p.st.rate *= 1.22; } },
  { id: 'berserk', n: 'Berserker Band', d: '+30% damage, but every hit costs a whole heart', c: '#ff4040', pool: 'base', g: 'fang', apply(p) { p.st.dmg *= 1.3; p.st.hurtMult = 2; } },
  { id: 'mirror', n: 'Mirror Ward', d: 'Melee swings reflect enemy shots back', c: '#bfe3ff', pool: 'base', g: 'shield', apply(p) { p.st.reflect = true; } },
  { id: 'hungry', n: 'Hungry Blade', d: 'Every 15 kills, heal half a heart', c: '#ff7aa8', pool: 'base', g: 'fang', apply(p) { p.hooks.kill.push(() => { p.hungry = (p.hungry || 0) + 1; if (p.hungry >= p.st.hungryN) { p.hungry = 0; World.heal(1); } }); } },
  { id: 'reach', n: 'Giant\'s Grip', d: 'Melee reaches farther and hits harder', c: '#d9a066', pool: 'base', g: 'sword', apply(p) { p.st.reach *= 1.3; p.st.meleeDmg *= 1.2; } },
  { id: 'eagle', n: 'Eagle Eye', d: '+12% crit chance, crits hit harder', c: '#ffd27a', pool: 'base', g: 'eye', apply(p) { p.st.crit += 0.12; p.st.critMult += 0.5; } },
  // Elemental Codex
  { id: 'kindling', n: 'Kindling', d: 'Hits set foes on fire', c: '#ff7a2a', pool: 'codexE', g: 'flame', apply(p) { p.st.addElem.add('fire'); } },
  { id: 'frostlens', n: 'Frost Lens', d: 'Hits chill foes, sometimes freezing them', c: '#7fd8ff', pool: 'codexE', g: 'flake', apply(p) { p.st.addElem.add('frost'); } },
  { id: 'storm', n: 'Storm Coil', d: 'Hits may arc lightning to nearby foes', c: '#f2f25a', pool: 'codexE', g: 'bolt', apply(p) { p.st.addElem.add('storm'); } },
  // Arcane Codex
  { id: 'split', n: 'Splitting Rune', d: 'Shots split into shards on hit', c: '#c77dff', pool: 'codexA', g: 'split', apply(p) {
      p.hooks.hit.push((e, s) => { if (!s.proj || s.shard) return; const n = World.hasSyn('constellation') ? 3 : 2; for (let i = 0; i < n; i++) { const a = Math.atan2(s.proj.vy, s.proj.vx) + (i - (n - 1) / 2) * 0.9; World.spawnShard(e, a, s); } });
    } },
  { id: 'volatile', n: 'Volatile Sigil', d: 'Foes explode when they die', c: '#ff9a3c', pool: 'codexA', g: 'burst', apply(p) { p.hooks.kill.push((e, s) => { if ((s.depth || 0) < 3) { const inf = World.hasSyn('inferno'); World.explode(e.x, e.y, inf ? 98 : 70, 14 * p.st.dmg, (s.depth || 0) + 1, '#ff9a3c', inf ? { elem: 'fire' } : {}); } }); } },
  { id: 'homing', n: 'Homing Glyph', d: 'Shots seek the nearest foe', c: '#d6a2ff', pool: 'codexA', g: 'eye', apply(p) { p.st.homing += 2.5; } },
  // Relic Vault
  { id: 'phoenix', n: 'Phoenix Feather', d: 'Revive once with 2 hearts', c: '#ffb02e', pool: 'relics', g: 'feather', apply(p) { p.revives++; } },
  { id: 'thunder', n: 'Rolling Thunder', d: 'Rolling releases a ring of sparks', c: '#f2f25a', pool: 'relics', g: 'ring', apply(p) { p.hooks.roll.push(() => World.ring(p.x, p.y, 10, 6 * p.st.dmg, 'storm')); } },
  { id: 'thorns', n: 'Thorn Mantle', d: 'Getting hit fires thorns everywhere', c: '#7dff7a', pool: 'relics', g: 'burst', apply(p) { p.hooks.hurt.push(() => World.ring(p.x, p.y, 16, 9 * p.st.dmg, 'none')); } },
  ...MINORS,
];
const SYNERGIES = [
  { id: 'steam', n: 'Steam Burst', need: ['kindling', 'frostlens'], d: 'Hitting a burning, chilled foe makes it burst' },
  { id: 'constellation', n: 'Constellation', need: ['split', 'twinmoon'], d: 'Shots split into three shards' },
  { id: 'balllightning', n: 'Ball Lightning', need: ['storm', 'ricochet'], d: 'Every bounce throws lightning' },
  { id: 'cinderwake', n: 'Cinder Wake', need: ['thunder', 'kindling'], d: 'Roll sparks set foes ablaze' },
  { id: 'deadeye', n: 'Deadeye', need: ['eagle', 'homing'], d: 'Seeking shots always crit the first foe they hit' },
  // lighter combos from common items
  { id: 'windrunner', n: 'Windrunner', need: ['boots', 'haste'], d: '+10% move and attack speed', apply(p) { p.st.speed *= 1.1; p.st.rate *= 1.1; } },
  { id: 'bloodlust', n: 'Bloodlust', need: ['berserk', 'hungry'], d: 'Hungry Blade heals every 8 kills', apply(p) { p.st.hungryN = 8; } },
  { id: 'glassedge', n: 'Glass Edge', need: ['berserk', 'eagle'], d: 'Crits deal +100% more damage', apply(p) { p.st.critMult += 1; } },
  { id: 'parrymaster', n: 'Parry Master', need: ['mirror', 'reach'], d: 'Cutting a shot protects you twice as long', apply(p) { p.st.parry = 0.7; } },
  { id: 'swarm', n: 'Seeker Swarm', need: ['homing', 'twinmoon'], d: 'One more seeking projectile', apply(p) { p.st.extraShots++; } },
  // stronger combos from codex and relic items
  { id: 'inferno', n: 'Inferno', need: ['kindling', 'volatile'], d: 'Death blasts are 40% bigger and set foes ablaze' },
  { id: 'shatter', n: 'Shatter', need: ['frostlens', 'reach'], d: 'Frozen foes take triple melee damage' },
  { id: 'tempest', n: 'Tempest', need: ['thunder', 'storm'], d: 'Roll sparks double and chain lightning' },
  { id: 'thornwall', n: 'Thornwall', need: ['thorns', 'mirror'], d: 'Cutting a shot fires a ring of thorns' },
  { id: 'rebirth', n: 'Rebirth', need: ['phoenix', 'heart'], d: 'The phoenix brings you back at full health' },
];

// ===== Enemies (all from the open D&D rules) =====
// ai: rush | kite | trapper | ooze | swoop | walk | caster | necro | wraith | flank | charger | blink | boss
const EDEF = {
  goblin: { n: 'Goblin', hp: 18, r: 9, sp: 95, cost: 1, c: '#7bd36a', ai: 'rush', touch: 1, embers: 1 },
  goblinArcher: { n: 'Goblin Archer', hp: 20, r: 9, sp: 75, cost: 2, c: '#b5d36a', ai: 'kite', touch: 1, embers: 1, shot: 'arrowE' },
  kobold: { n: 'Kobold Trapper', hp: 16, r: 9, sp: 80, cost: 2, c: '#e0884a', ai: 'trapper', touch: 1, embers: 1 },
  cube: { n: 'Gelatinous Cube', hp: 75, r: 24, sp: 34, cost: 3, c: '#6fe3c8', ai: 'ooze', touch: 1, embers: 3, engulf: true, slime: 1, split: 'cubeling' },
  cubeling: { n: 'Cubeling', hp: 22, r: 12, sp: 46, cost: 1, c: '#6fe3c8', ai: 'ooze', touch: 1, embers: 1, slime: 0.55 },
  stirge: { n: 'Stirge', hp: 11, r: 8, sp: 150, cost: 1, c: '#ff4d6d', ai: 'swoop', touch: 1, embers: 1 },
  skeleton: { n: 'Skeleton', hp: 26, r: 10, sp: 70, cost: 2, c: '#e8e2cf', ai: 'walk', touch: 1, embers: 1, reform: true },
  skelArcher: { n: 'Skeleton Archer', hp: 22, r: 10, sp: 68, cost: 2, c: '#d8d0b8', ai: 'kite', touch: 1, embers: 1, reform: true, shot: 'arrowE' },
  zombie: { n: 'Zombie', hp: 62, r: 13, sp: 36, cost: 2, c: '#8fae6a', ai: 'walk', touch: 1, embers: 2 },
  necro: { n: 'Necromancer', hp: 40, r: 12, sp: 40, cost: 3, c: '#b26bff', ai: 'necro', touch: 1, embers: 2 },
  wraith: { n: 'Wraith', hp: 24, r: 11, sp: 120, cost: 2, c: '#9fd8ff', ai: 'wraith', touch: 1, embers: 2 },
  gnoll: { n: 'Gnoll', hp: 32, r: 11, sp: 88, cost: 2, c: '#d9a066', ai: 'flank', touch: 1, embers: 1 },
  blight: { n: 'Twig Blight', hp: 10, r: 8, sp: 110, cost: 1, c: '#a07c4f', ai: 'rush', touch: 1, embers: 1 },
  rat: { n: 'Giant Rat', hp: 10, r: 8, sp: 118, cost: 1, c: '#9a8470', ai: 'rush', touch: 1, embers: 1 },
  otyugh: { n: 'Otyugh', hp: 95, r: 18, sp: 46, cost: 4, c: '#8f8a52', ai: 'charger', touch: 1, embers: 3 },
  owlbear: { n: 'Owlbear', hp: 120, r: 17, sp: 62, cost: 4, c: '#b58a5f', ai: 'charger', touch: 2, embers: 3 },
  sprite: { n: 'Fey Sprite', hp: 30, r: 9, sp: 60, cost: 3, c: '#7dffb0', ai: 'blink', touch: 1, embers: 2 },
  crystal: { n: 'Phylactery', hp: 70, r: 12, sp: 0, cost: 0, c: '#7dff7a', ai: 'crystal', touch: 0, embers: 0, anchored: true },
  banner: { n: 'War Banner', hp: 110, r: 12, sp: 0, cost: 0, c: '#ff4d3a', ai: 'banner', touch: 0, embers: 1, anchored: true },
  cub: { n: 'Owlbear Cub', hp: 45, r: 11, sp: 95, cost: 0, c: '#d0a070', ai: 'rush', touch: 1, embers: 1 },
  mimic: { n: 'Mimic', hp: 220, r: 16, sp: 85, cost: 0, c: '#d9a066', ai: 'mimic', touch: 2, embers: 8 },
  spider: { n: 'Giant Spider', hp: 34, r: 12, sp: 85, cost: 2, c: '#c0a0ff', ai: 'kite', touch: 1, embers: 2, shot: 'web' },
};

// ===== Worlds: three levels each, same theme. =====
const WORLDS = [null,
  {
    n: 'The Sunken Caverns', style: 'cave', tint: '#5fd4ff',
    floor: ['#1d1822', '#18141e', '#221c29'], wall: '#2a2131', face: '#3a2e44', pillar: 'stalagmite', deco: 'crystal', breakable: true,
    pools: [['goblin', 'goblin', 'goblinArcher', 'stirge'], ['goblin', 'goblinArcher', 'stirge', 'kobold', 'cube'], ['goblin', 'goblinArcher', 'kobold', 'cube', 'stirge']],
    bosses: [
      { id: 'warlord', title: 'Hobgoblin Warlord', look: 'goblin', c: '#ff7a3a', summon: ['goblin', 'goblin', 'goblinArcher'],
        tip: 'Knock down his war banner or the goblins snowball',
        moves: [['charge', 'volley', 'fans', 'horn'], ['charge', 'volley', 'horn', 'fans'], ['shieldwall', 'volley', 'horn', 'shieldwall']] },
      { id: 'bugbear', title: 'Bugbear Chieftain', look: 'gnoll', c: '#c98a4a', dark: true,
        tip: 'Watch for his eyes in the dark',
        moves: [['stalk', 'boulder', 'fans', 'stalk'], ['stalk', 'boulder', 'boulder', 'charge'], ['flail', 'stalk', 'boulder', 'flail']] },
    ],
  },
  {
    n: 'The Forgotten Crypts', style: 'crypt', tint: '#b58bff',
    floor: ['#1a1c26', '#15161e', '#1e2130'], wall: '#252939', face: '#353b54', pillar: 'tomb', deco: 'candle',
    pools: [['skeleton', 'skeleton', 'skelArcher', 'zombie'], ['skeleton', 'skelArcher', 'zombie', 'wraith', 'necro'], ['skeleton', 'skelArcher', 'zombie', 'wraith', 'necro', 'cube']],
    bosses: [
      { id: 'lich', title: 'the Lich-Priest', look: 'necro', c: '#c77dff', crystals: true, summon: ['skeleton', 'skeleton', 'skelArcher'],
        tip: 'Shatter the three phylacteries to expose him',
        moves: [['teleport', 'spiral', 'skulls'], ['teleport', 'spiral', 'skulls', 'raise'], ['prison', 'skulls', 'raise', 'prison']] },
      { id: 'knight', title: 'the Bone Knight', look: 'skeleton', c: '#e8e2cf', shield: true, summon: ['skeleton', 'skeleton'],
        tip: 'His shield blocks the front. Dodge the slam, then strike',
        moves: [['charge', 'slam', 'fans', 'slam'], ['slam', 'raise', 'charge', 'sweep'], ['slam', 'charge', 'sweep', 'slam']] },
    ],
  },
  {
    n: 'The Overgrown Ruins', style: 'forest', tint: '#8dff7a',
    floor: ['#13201a', '#101a15', '#17261e'], wall: '#1d3326', face: '#2a4634', pillar: 'stump', deco: 'flower', breakable: true,
    pools: [['gnoll', 'gnoll', 'blight', 'blight', 'spider'], ['gnoll', 'blight', 'spider', 'sprite', 'owlbear'], ['gnoll', 'spider', 'sprite', 'owlbear', 'blight']],
    bosses: [
      { id: 'owlbear', title: 'Owlbear Matriarch', look: 'owlbear', c: '#c8925a', selfStun: true,
        tip: 'Bait her charge into a rock',
        moves: [['leap', 'charge', 'swipe', 'charge'], ['leap', 'charge', 'swipe', 'cubs'], ['leap', 'charge', 'screech', 'charge']] },
      { id: 'treant', title: 'the Blighted Treant', look: 'treant', c: '#7dff7a', heart: true, summon: ['blight', 'blight', 'blight', 'blight'],
        tip: 'Its heart opens after the roots. Fire burns it deep',
        moves: [['roots', 'seeds', 'summon', 'sweep'], ['thornwall', 'roots', 'seeds', 'summon'], ['brambles', 'thornwall', 'roots', 'seeds']] },
    ],
  },
  {
    n: 'The Drowned Sewers', style: 'sewer', tint: '#a8ff4a',
    floor: ['#1b1e17', '#171a13', '#20241b'], wall: '#23271d', face: '#33392a', pillar: 'barrel', deco: 'drip', breakable: true,
    pools: [['rat', 'rat', 'kobold', 'cubeling', 'skelArcher'], ['rat', 'kobold', 'cube', 'otyugh', 'skelArcher'], ['rat', 'cube', 'otyugh', 'kobold', 'wraith', 'skelArcher']],
    bosses: [
      { id: 'colossus', title: 'the Gelatinous Colossus', look: 'cube', c: '#6fe3c8', r: 46, acid: true, summon: ['cubeling', 'cubeling', 'cubeling', 'cubeling'],
        tip: 'It weeps acid wherever it goes. Keep moving',
        moves: [['leap', 'acidspray', 'charge', 'fans'], ['leap', 'acidspray', 'summon', 'charge'], ['leap', 'acidspray', 'summon', 'leap']] },
    ],
  },
];
const WORLD_COUNT = 4;
const FLIERS = new Set(['stirge', 'wraith', 'sprite']); // float over pits, sludge and acid
const levelLabel = (w, l) => `${w}-${l}`;

// ===== Sanctum unlocks (permanent). A full run (~250 embers) buys about one. =====
// ===== Potions (one-shot, R) and relics (F) =====
const POTIONS = [
  { id: 'heal', n: 'Healing Potion', d: 'Restore 1 heart', c: '#ff5470', cost: 60, use(p) { World.heal(2); } },
  { id: 'superheal', n: 'Superior Healing Potion', d: 'Restore every heart', c: '#ff2050', cost: 170, use(p) { World.heal(p.maxHp); } },
  { id: 'haste', n: 'Haste Potion', d: '+40% attack speed for 15s', c: '#ffe066', cost: 80, dur: 15, buff(p) { p.st.rate *= 1.4; } },
  { id: 'swift', n: 'Potion of Swiftness', d: '+30% move speed, rolls recharge faster, 15s', c: '#99ffff', cost: 70, dur: 15, buff(p) { p.st.speed *= 1.3; p.st.rollCd *= 0.6; } },
  { id: 'seeking', n: 'Oil of Seeking', d: 'Shots home in on foes for 20s', c: '#d6a2ff', cost: 90, dur: 20, buff(p) { p.st.homing += 3; } },
  { id: 'piercing', n: 'Oil of Piercing', d: 'Shots pierce 2 more foes for 20s', c: '#bfe3ff', cost: 90, dur: 20, buff(p) { p.st.pierceAdd += 2; } },
  { id: 'fireoil', n: 'Fire Oil', d: 'Every hit sets foes ablaze for 20s', c: '#ff7a2a', cost: 80, dur: 20, buff(p) { p.st.addElem.add('fire'); } },
  { id: 'storm', n: 'Storm Draught', d: 'Lightning arcs from you to nearby foes for 12s', c: '#f2f25a', cost: 110, dur: 12, buff(p) { p.st.aura = true; } },
  { id: 'bomb', n: 'Bomb', d: 'Throw it where you aim. Big blast, breaks rocks', c: '#ff9a3c', cost: 50, use(p) { World.throwBomb(p); } },
];
const RELICS = [
  { id: 'hourglass', n: 'Timeless Hourglass', d: 'Freeze every foe and shot for 4s', c: '#ffd27a', active: true, cd: 3, cost: 550, use(p) { World.timeStop(4); } },
  { id: 'decoy', n: 'Decoy Totem', d: 'Foes chase a decoy instead of you for 7s', c: '#c8a0ff', active: true, cd: 2, cost: 450, use(p) { World.spawnDecoy(p); } },
  { id: 'gnome', n: 'Gnome-in-a-Box', d: 'Deploys a gnome with a hand cannon for 12s', c: '#7dff7a', active: true, cd: 2, cost: 500, use(p) { World.spawnGnome(p); } },
  { id: 'regen', n: 'Ring of Regeneration', d: 'Heal half a heart every 3 rooms cleared', c: '#ff7aa8', active: false, cost: 500 },
  { id: 'displace', n: 'Cloak of Displacement', d: 'The first hit in each fight misses you', c: '#7fd8ff', active: false, cost: 600 },
  { id: 'amulet', n: 'Ember Amulet', d: '+25% embers', c: '#ffb057', active: false, cost: 400 },
];
const potionById = id => POTIONS.find(x => x.id === id), relicById = id => RELICS.find(x => x.id === id);

// ===== Classes =====
const CLASSES = {
  fighter: {
    n: 'Fighter', c: '#ff9a5a', cat: 'melee', hp: 8, cost: 0, move: 'Roll', mana: 0.5, regen: 0.5,
    perk: '+20% melee damage, harder knockback. Guard blocks one hit and recharges in 10s while a melee weapon is out', moveD: 'Roll, then attack to lunge',
    kit: [{ type: 'sword', name: 'Worn Blade' }, { type: 'bow', name: 'Hunter\'s Bow' }],
  },
  ranger: {
    n: 'Ranger', c: '#8dff7a', cat: 'ranged', hp: 6, cost: 220, move: 'Roll', mana: 0.5, regen: 0.5,
    perk: 'Ranged hits deal up to +35% at long range, bows draw 20% faster. First hit marks a foe to take +25% from everything', moveD: 'Rolls scatter caltrops that hurt and slow foes',
    kit: [{ type: 'bow', name: 'Hunter\'s Bow' }, { type: 'spear', name: 'Ash Spear' }],
  },
  mage: {
    n: 'Mage', c: '#b58bff', cat: 'magic', hp: 6, cost: 220, move: 'Blink', mana: 0.75, regen: 1,
    perk: 'Bigger mana pool, faster regen, stronger elements. −20% melee damage', moveD: 'Blink farther than a roll, a bit slower to recharge',
    kit: [{ type: 'wand', name: 'Apprentice Wand' }, { type: 'spellbook', spell: 'missiles', name: 'Primer of Magic Missile' }],
  },
};

const UNLOCKS = [
  { id: 'ranger', n: 'Ranger', d: 'Unlock the Ranger class', cost: 220 },
  { id: 'mage', n: 'Mage', d: 'Unlock the Mage class', cost: 220 },
  { id: 'kit', n: 'Field Kit', d: 'Start runs with Uncommon weapons', cost: 140 },
  { id: 'heart1', n: 'Sturdy Heart', d: 'Start every run with +1 heart', cost: 180 },
  { id: 'codexE', n: 'Elemental Codex', d: 'Adds Kindling, Frost Lens and Storm Coil to the item pool', cost: 220 },
  { id: 'codexA', n: 'Arcane Codex', d: 'Adds Splitting Rune, Volatile Sigil and Homing Glyph', cost: 300 },
  { id: 'heart2', n: 'Stout Heart', d: 'Another +1 starting heart', cost: 420, req: 'heart1' },
  { id: 'luck', n: 'Lucky Loot', d: 'Rare, Epic and Legendary drops are more common', cost: 500 },
  { id: 'armory', n: 'Deep Armory', d: 'Your stash holds 10 more weapons and 4 more relics', cost: 400, camp: true },
  { id: 'relics', n: 'Relic Vault', d: 'Adds Phoenix Feather, Rolling Thunder and Thorn Mantle', cost: 650 },
];

// ===== Secret seeds: only their hashes live in the code, so you can't read them out of the file =====
const SECRETS = {
  3850287304: { n: 'Moonwell', d: 'Darkness falls. Embers count double.', mods: { dark: true, emberMult: 2 } },
  2418072430: { n: 'Glass Cannon', d: 'One heart. Triple damage.', mods: { glass: true } },
  1049012998: { n: 'Golden Hoard', d: 'Every weapon is Legendary.', mods: { allLegendary: true } },
};
