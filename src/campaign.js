// ===== Campaign: persistent heroes, stash, loadout, world unlocks, corpse runs =====
const SCRAP = [5, 15, 40, 100, 250]; // embers for scrapping a weapon, by rarity
// XP curve v2: about one level per world clear early on, slowing down after that
const xpNeed = lvl => Math.round(100 * Math.pow(lvl, 1.6));
const xpNeedV1 = lvl => Math.round(80 * Math.pow(lvl, 1.35));
function migrateHero(h) { // heroes made on the old, faster curve get re-leveled from their total XP
  if (!h || h.xpv === 2) return;
  let total = h.xp; for (let l = 1; l < h.lvl; l++) total += xpNeedV1(l);
  total = Math.round(total * 0.45); // XP per kill was also cut, so scale old XP to match
  h.lvl = 1; while (total >= xpNeed(h.lvl)) { total -= xpNeed(h.lvl); h.lvl++; }
  h.xp = total; h.xpv = 2;
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const Campaign = {
  data() { const M = Meta.data; if (!M.camp) M.camp = { slots: [null, null, null] }; for (const h of M.camp.slots) migrateHero(h); return M.camp; },
  hero(i) { return this.data().slots[i]; },
  create(i, name, cls) {
    const rng = RNG((Math.random() * 4294967296) >>> 0), C = CLASSES[cls];
    const weapons = C.kit.map(k => makeWeapon(rng, { type: k.type, spell: k.spell, rarity: 0, elem: k.type === 'wand' || k.type === 'spellbook' ? undefined : 'none', name: k.name }));
    const h = { name: name || C.n, cls, lvl: 1, xp: 0, xpv: 2, embers: 0, unlocks: {}, stash: { weapons, relics: [], potions: [] }, load: { w: weapons.map(w => w.uid), relic: null, potion: null }, cleared: 0, corpse: null, shop: null, stats: { runs: 0, deaths: 0, kills: 0, clears: 0 } };
    this.data().slots[i] = h; Meta.save(); return h;
  },
  loadoutWeapons(h) {
    const pick = h.load.w.map(u => h.stash.weapons.find(w => w.uid === u)).filter(Boolean);
    for (const w of h.stash.weapons) if (pick.length < 2 && !pick.includes(w)) pick.push(w);
    return pick.slice(0, 2).map(w => JSON.parse(JSON.stringify(w)));
  },
  start(i, world, useCorpse) {
    const h = this.hero(i); Game.char = h; Game.charIdx = i;
    if (!useCorpse && h.corpse && h.corpse.world === world) h.corpse = null; // a fresh dungeon abandons your remains
    const seed = useCorpse && h.corpse ? h.corpse.seed : randomSeed();
    Game.loadPotion = h.load.potion; Game.loadRelic = h.load.relic;
    h.stats.runs++; Meta.save();
    Game.newRun(seed, h.cls, { campaign: true, world });
  },
  // End of a campaign run: embers and XP always stick; new gear only if you beat the world boss
  finish(won) {
    const h = Game.char, p = World.players[0], W = World.world;
    const res = { won, embers: Game.runEmbers, xp: Game.runXp, levels: 0, banked: [], lost: [] };
    h.embers += Game.runEmbers; h.xp += Game.runXp; h.stats.kills += p.kills;
    while (h.xp >= xpNeed(h.lvl)) { h.xp -= xpNeed(h.lvl); h.lvl++; res.levels++; }
    if (Game.loadPotion && p.potion !== Game.loadPotion) { // the packed potion got drunk (or swapped away)
      const i = h.stash.potions.indexOf(Game.loadPotion); if (i >= 0) h.stash.potions.splice(i, 1);
      if (!h.stash.potions.includes(h.load.potion)) h.load.potion = null;
    }
    const have = new Set(h.stash.weapons.map(w => w.uid));
    const newW = p.weapons.filter(w => !have.has(w.uid));
    const newRelic = p.relic && !h.stash.relics.includes(p.relic) ? p.relic : null;
    const newPotion = p.potion && p.potion !== Game.loadPotion ? p.potion : null;
    if (won) {
      for (const w of newW) { h.stash.weapons.push(w); res.banked.push(w.name); }
      if (newRelic) { h.stash.relics.push(newRelic); res.banked.push(relicById(newRelic).n); }
      if (newPotion) { h.stash.potions.push(newPotion); res.banked.push(potionById(newPotion).n); }
      res.unlocked = W >= h.cleared + 1 && W < WORLD_COUNT ? WORLDS[W + 1].n : null;
      h.cleared = Math.max(h.cleared, W); h.stats.clears++;
    } else {
      h.stats.deaths++;
      if (newW.length || newRelic || newPotion) {
        h.corpse = { seed: Game.seed, world: W, stage: World.level, x: p.x, y: p.y, loot: { weapons: newW, relic: newRelic, potion: newPotion } };
        res.lost = newW.map(w => w.name).concat(newRelic ? [relicById(newRelic).n] : [], newPotion ? [potionById(newPotion).n] : []);
      }
    }
    h.shop = null; Meta.save();
    Menu.show('campDone', res);
  },
  shopStock(h) {
    if (!h.shop) { const rng = RNG((Math.random() * 4294967296) >>> 0); h.shop = { potions: rng.shuffle(POTIONS.map(x => x.id)).slice(0, 3), relics: rng.shuffle(RELICS.map(x => x.id)).slice(0, 2) }; Meta.save(); }
    return h.shop;
  },
};

// ===== Quick-play merchant: spend this run's embers between stages =====
const Merchant = {
  stock(depth) {
    const rng = RNG(hash(Game.seedNum, depth, 919));
    const ps = rng.shuffle(POTIONS.slice()).slice(0, 2).map(P => ({ kind: 'potion', id: P.id, price: Math.round(P.cost * 0.5) }));
    const Rl = rng.pick(RELICS), w = makeWeapon(rng, { depth, src: 'armory' });
    return ps.concat([{ kind: 'relic', id: Rl.id, price: Math.round(Rl.cost * 0.4) }, { kind: 'weapon', w, price: [30, 50, 90, 150, 260][w.rarity] }]);
  },
};

// ===== Menu screens for both modes =====
const CampScreens = {
  camp() {
    Game.state = 'menu';
    const slots = Campaign.data().slots.map((h, i) => h
      ? `<div class="card"><div class="grow"><b style="color:${CLASSES[h.cls].c}">${esc(h.name)}</b> <small style="display:inline">Level ${h.lvl} ${CLASSES[h.cls].n}</small><small>${h.cleared ? 'Cleared ' + WORLDS[h.cleared].n : 'Has not cleared a world yet'} · ${h.embers} embers</small></div><button class="btn" id="hero-${i}">Play</button><button class="btn" id="del-${i}">✕</button></div>`
      : `<div class="card"><div class="grow"><b>Empty slot</b><small>Create a new hero</small></div><button class="btn" id="new-${i}">Create</button></div>`).join('');
    Menu.html(`<h2>Campaign</h2><div class="sub">Each hero keeps their gear, level and Sanctum. Clear a world's boss to unlock the next.</div><div class="list">${slots}</div><button class="btn small" id="b-back">Back</button>`);
    Campaign.data().slots.forEach((h, i) => {
      Menu.on('hero-' + i, () => Menu.show('hub', i));
      Menu.on('new-' + i, () => Menu.show('campNew', i));
      Menu.on('del-' + i, () => { const b = document.getElementById('del-' + i); if (b.dataset.armed) { Campaign.data().slots[i] = null; Meta.save(); Menu.show('camp'); } else { b.dataset.armed = 1; b.textContent = 'Delete?'; } });
    });
    Menu.on('b-back', () => Menu.show('title'));
  },
  campNew(i) {
    const cards = Object.entries(CLASSES).map(([id, C]) => `<div class="card"><div class="grow"><b style="color:${C.c}">${C.n}</b> <span style="color:#ff5470">${'♥'.repeat(C.hp / 2)}</span><small>${C.kit.map(k => k.name).join(' + ')}</small><small>${C.perk}</small><small>${C.move}: ${C.moveD}</small></div><button class="btn" id="mk-${id}">Choose</button></div>`).join('');
    Menu.html(`<h2>New Hero</h2><input class="seed" id="hname" maxlength="16" placeholder="Name your hero" autocomplete="off" style="text-transform:none;letter-spacing:.04em"><div class="list">${cards}</div><button class="btn small" id="b-back">Back</button>`);
    for (const id of Object.keys(CLASSES)) Menu.on('mk-' + id, () => { const n = document.getElementById('hname').value.trim(); Campaign.create(i, n, id); Menu.show('hub', i); });
    Menu.on('b-back', () => Menu.show('camp'));
  },
  hub(i) {
    Game.state = 'menu'; World.map = null;
    const h = Campaign.hero(i), C = CLASSES[h.cls], cp = h.corpse;
    const worlds = [1, 2, 3].map(w => {
      const open = w <= h.cleared + 1, here = cp && cp.world === w;
      const btns = !open ? '<small style="display:inline">Locked</small>' : here
        ? `<button class="btn" id="corpse-${w}">Return to remains</button><button class="btn" id="go-${w}">New dungeon</button>`
        : `<button class="btn" id="go-${w}">Descend</button>`;
      return `<div class="card" style="${open ? '' : 'opacity:.5'}"><div class="grow"><b style="color:${WORLDS[w].tint}">${WORLDS[w].n}</b>${w <= h.cleared ? ' <span class="secret">✓</span>' : ''}<small>${here ? `Your remains lie on level ${levelLabel(w, cp.stage)}` : w <= h.cleared ? 'Cleared. Replay to farm gear.' : open ? 'Beat the boss on ' + levelLabel(w, 3) + ' to clear' : 'Clear the world before it'}</small></div>${btns}</div>`;
    }).join('');
    const pct = Math.round(h.xp / xpNeed(h.lvl) * 100);
    Menu.html(`<h2 style="margin-bottom:4px">${esc(h.name)}</h2><div class="sub" style="margin-bottom:12px"><span style="color:${C.c}">Level ${h.lvl} ${C.n}</span> · XP ${pct}% · <span class="ember">${h.embers} embers</span></div>
      <div class="list">${worlds}</div>
      <div class="row"><button class="btn small" id="b-load">Loadout</button><button class="btn small" id="b-hsanct">Sanctum</button><button class="btn small" id="b-hshop">Shop</button></div>
      <button class="btn small" id="b-back">Heroes</button>`);
    for (const w of [1, 2, 3]) { Menu.on('go-' + w, () => Campaign.start(i, w, false)); Menu.on('corpse-' + w, () => Campaign.start(i, w, true)); }
    Menu.on('b-load', () => Menu.show('loadout', i));
    Menu.on('b-hsanct', () => Menu.show('heroSanctum', i));
    Menu.on('b-hshop', () => Menu.show('heroShop', i));
    Menu.on('b-back', () => Menu.show('camp'));
  },
  loadout(i) {
    const h = Campaign.hero(i), L = h.load;
    const wcard = (w, k) => {
      const on = L.w.includes(w.uid);
      return `<div class="card"><div class="grow"><b style="color:${RARITY[w.rarity].c}">${esc(w.name)}</b><small>${RARITY[w.rarity].n} ${w.type} · ${weaponLine(w)}</small>${w.quirks.length ? `<small>${w.quirks.map(q => QUIRKS.find(x => x.id === q).d).join(' · ')}</small>` : ''}</div>
        <button class="btn" id="eq-w-${k}">${on ? 'Equipped' : 'Equip'}</button>${on ? '' : `<button class="btn" id="sc-w-${k}">Scrap ${SCRAP[w.rarity]}◆</button>`}</div>`;
    };
    const rcard = (id, k) => { const D = relicById(id), on = L.relic === id; return `<div class="card"><div class="grow"><b style="color:${D.c}">${D.n}</b><small>${D.d}</small></div><button class="btn" id="eq-r-${k}">${on ? 'Equipped' : 'Equip'}</button></div>`; };
    const pcard = (id, k) => { const D = potionById(id), on = L.potion === id && h.stash.potions.indexOf(id) === k; return `<div class="card"><div class="grow"><b style="color:${D.c}">${D.n}</b><small>${D.d} · used up when you drink it</small></div><button class="btn" id="eq-p-${k}">${on ? 'Packed' : 'Pack'}</button></div>`; };
    Menu.html(`<h2>Loadout</h2><div class="sub">Take 2 weapons, 1 relic and 1 potion into the dungeon. Your stash gear is never lost.</div>
      <div class="list"><div class="sub" style="margin:4px 0">Weapons (${h.stash.weapons.length})</div>${h.stash.weapons.map(wcard).join('')}
      <div class="sub" style="margin:10px 0 4px">Relics</div>${h.stash.relics.map(rcard).join('') || '<small>None yet. Find them in chests or buy them in the Shop.</small>'}
      <div class="sub" style="margin:10px 0 4px">Potions</div>${h.stash.potions.map(pcard).join('') || '<small>None yet.</small>'}</div>
      <button class="btn small" id="b-back">Back</button>`);
    h.stash.weapons.forEach((w, k) => {
      Menu.on('eq-w-' + k, () => { if (!L.w.includes(w.uid)) { L.w = [L.w[1] || L.w[0], w.uid].filter(Boolean).slice(-2); Meta.save(); } Menu.show('loadout', i); });
      Menu.on('sc-w-' + k, () => { if (h.stash.weapons.length <= 2) return; h.stash.weapons.splice(k, 1); h.embers += SCRAP[w.rarity]; Snd.play('ember'); Meta.save(); Menu.show('loadout', i); });
    });
    h.stash.relics.forEach((id, k) => Menu.on('eq-r-' + k, () => { L.relic = L.relic === id ? null : id; Meta.save(); Menu.show('loadout', i); }));
    h.stash.potions.forEach((id, k) => Menu.on('eq-p-' + k, () => { L.potion = L.potion === id ? null : id; Meta.save(); Menu.show('loadout', i); }));
    Menu.on('b-back', () => Menu.show('hub', i));
  },
  heroSanctum(i) {
    const h = Campaign.hero(i), list = UNLOCKS.filter(u => !['ranger', 'mage', 'kit'].includes(u.id));
    const rows = list.map(u => { const own = h.unlocks[u.id], locked = u.req && !h.unlocks[u.req]; return `<div class="card"><div class="grow"><b>${u.n}</b><small>${locked ? 'Requires ' + UNLOCKS.find(x => x.id === u.req).n : u.d}</small></div>${own ? '<span class="ember">✓</span>' : `<button class="btn" id="u-${u.id}" ${h.embers < u.cost || locked ? 'disabled' : ''}>${u.cost} ◆</button>`}</div>`; }).join('');
    Menu.html(`<h2>${esc(h.name)}'s Sanctum</h2><div class="sub"><span class="ember">${h.embers} embers</span> · Level ${h.lvl}: +${3 * (h.lvl - 1)}% damage, +${2 * (h.lvl - 1)} mana, +${Math.floor(h.lvl / 5)} hearts</div><div class="list">${rows}</div><button class="btn small" id="b-back">Back</button>`);
    for (const u of list) Menu.on('u-' + u.id, () => { if (h.embers >= u.cost) { h.embers -= u.cost; h.unlocks[u.id] = 1; Meta.save(); Snd.play('item'); Menu.show('heroSanctum', i); } });
    Menu.on('b-back', () => Menu.show('hub', i));
  },
  heroShop(i) {
    const h = Campaign.hero(i), S = Campaign.shopStock(h);
    const card = (kind, id, k) => { const D = kind === 'potion' ? potionById(id) : relicById(id), owned = kind === 'relic' && h.stash.relics.includes(id); return `<div class="card"><div class="grow"><b style="color:${D.c}">${D.n}</b><small>${D.d}</small></div><button class="btn" id="buy-${kind}-${k}" ${owned || h.embers < D.cost ? 'disabled' : ''}>${owned ? 'Owned' : D.cost + ' ◆'}</button></div>`; };
    Menu.html(`<h2>Shop</h2><div class="sub">Purchases go to your stash. Stock changes after every run.<br><span class="ember">${h.embers} embers</span></div><div class="list">${S.potions.map((id, k) => card('potion', id, k)).join('')}${S.relics.map((id, k) => card('relic', id, k)).join('') || ''}</div><button class="btn small" id="b-back">Back</button>`);
    ['potion', 'relic'].forEach(kind => (kind === 'potion' ? S.potions : S.relics).forEach((id, k) => Menu.on(`buy-${kind}-${k}`, () => {
      const D = kind === 'potion' ? potionById(id) : relicById(id); if (h.embers < D.cost) return;
      h.embers -= D.cost; (kind === 'potion' ? h.stash.potions : h.stash.relics).push(id); (kind === 'potion' ? S.potions : S.relics).splice(k, 1);
      Meta.save(); Snd.play('item'); Menu.show('heroShop', i);
    })));
    Menu.on('b-back', () => Menu.show('hub', i));
  },
  campDone(r) {
    const h = Game.char, i = Game.charIdx;
    const body = r.won
      ? `<h1 style="font-size:clamp(34px,7vw,56px)">WORLD CLEARED</h1><div class="sub">${WORLDS[World.world].n} is yours.${r.unlocked ? ` <b>${r.unlocked}</b> is now open.` : ''}</div>
         <div class="sub">${r.banked.length ? 'Added to your stash: <b>' + r.banked.map(esc).join(', ') + '</b>' : 'No new gear this time.'}</div>`
      : `<h1 style="font-size:clamp(34px,7vw,56px)">FALLEN</h1><div class="sub">${r.lost.length ? `Your remains hold <b>${r.lost.map(esc).join(', ')}</b> on level ${levelLabel(World.world, World.level)}. Return to them on your next run.` : 'You lost nothing you had banked.'}</div>`;
    Menu.html(`${body}<div class="stats"><span>Embers kept</span><span class="ember">+${r.embers}</span><span>XP</span><span>+${r.xp}${r.levels ? ` · <b class="secret">Level up! Now ${h.lvl}</b>` : ''}</span><span>Time</span><span>${fmtTime(Game.runTime)}</span></div>
      <button class="btn" id="b-hub">Back to ${esc(h.name)}</button>`);
    Menu.on('b-hub', () => Menu.show('hub', i));
  },
  merchant() {
    const st = World.merchant || [], p = World.players[0];
    const rows = st.map((it, k) => {
      if (it.sold) return '';
      const D = it.kind === 'potion' ? potionById(it.id) : it.kind === 'relic' ? relicById(it.id) : null;
      const name = D ? D.n : it.w.name, col = D ? D.c : RARITY[it.w.rarity].c, desc = D ? D.d : `${RARITY[it.w.rarity].n} ${it.w.type} · ${weaponLine(it.w)}`;
      return `<div class="card"><div class="grow"><b style="color:${col}">${esc(name)}</b><small>${desc}</small></div><button class="btn" id="m-${k}" ${Game.runEmbers < it.price ? 'disabled' : ''}>${it.price} ◆</button></div>`;
    }).join('');
    Menu.html(`<h2>Wandering Merchant</h2><div class="sub">"Embers for wares, friend." You have <span class="ember">${Game.runEmbers}</span> this run. What you don't spend is banked at the end.</div><div class="list">${rows || '<div class="sub">Sold out.</div>'}</div><button class="btn" id="b-leave">Leave</button>`);
    st.forEach((it, k) => Menu.on('m-' + k, () => {
      if (it.sold || Game.runEmbers < it.price) return;
      Game.runEmbers -= it.price; it.sold = true; Snd.play('item');
      if (it.kind === 'weapon') World.pickups.push({ kind: 'weapon', w: it.w, x: p.x + 24, y: p.y, t: 0 });
      else { const old = p[it.kind]; p[it.kind] = it.id; if (it.kind === 'relic') p.relicCd = 0; if (old) World.pickups.push({ kind: it.kind, id: old, x: p.x + 24, y: p.y, t: 0 }); }
      Menu.show('merchant');
    }));
    Menu.on('b-leave', () => { Game.state = 'play'; Menu.hide(); });
  },
};
{
  const base = Menu.show.bind(Menu);
  Menu.show = function (name, arg) { if (CampScreens[name]) CampScreens[name](arg); else base(name, arg); };
}
