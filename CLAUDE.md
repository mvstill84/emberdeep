# Emberdeep: notes for Claude

Emberdeep is Matt's tiny procedural fantasy roguelike: Enter the Gungeon's run-and-gun feel with a D&D coat of paint (swords, bows, spells, Forgotten Realms-ish monsters). One HTML file, hosted on GitHub Pages at https://mvstill84.github.io/emberdeep/. Matt plays mostly on iPhone, sometimes on PC, and runs local co-op with his kids and family.

## Working with Matt

- Ask design questions before building anything with real choices in it. Don't bake in guesses. Small obvious fixes are fine to just do.
- Write plainly: lead with the answer, short sentences, no headers or bold in chat replies, no em dashes, no hype, no recap. Mentor/friend tone. Say so plainly if you think an idea is wrong.
- He likes analogies. He doesn't need to be told an idea is great.
- Don't push while people might be playing if he says they are. A push is a live deploy.
- "Future idea" messages go in IDEAS.md. Don't start them unless he asks.
- When you finish a change: say what changed with real numbers, what you tested, and what he should check by playing. Flag anything you changed beyond what he asked.
- Keep this file and IDEAS.md current. When a design decision changes, update "Design decisions to keep" in the same commit. When an idea ships, delete it from IDEAS.md.

## Build and deploy

- Edit `src/*.js` and `src/shell.html`, then `node build.mjs`. It inlines the sources into `index.html` in this order: core, data, world, render, main, campaign, dev, net, nettest, coop, boot.
- The build number shown in game is `git rev-list --count HEAD + 1`, so build right before committing and the number matches the commit.
- Commit as Matt: `git -c user.name="Matt" -c user.email="mvstill84@users.noreply.github.com" commit -m "..."`, end messages with the Co-Authored-By line for the model you are.
- `git push origin main` deploys. Pages updates in about a minute. `sw.js` is network-first (cache `emberdeep-v2`, 4s timeout), so phones pick up a new build on the next reload.
- Rolling back = a new commit restoring old code (git revert), never a force push.
- `vendor/` holds qrcode-generator, jsQR and PeerJS 1.5.4 (licenses in vendor/README.md). They're lazy-loaded with `QR.load(src, global)`. Don't load scripts from CDNs.

## Source map

- `core.js`: utilities, seeded RNG (`RNG`, `hash`, `rng0`), input (keyboard, mouse, touch twin-stick, gamepad; `Input.touchButtons()` lays out the phone buttons), audio (`Snd`).
- `data.js`: weapons (`WBASE`, `makeWeapon`, `RARITY`, `QUIRKS`, elements), items, minors (small stackable items), potions, relics, synergies, enemy defs, `RESIST` table.
- `world.js`: everything in the dungeon. Level generation (branching routes, rooms, shapes, chasms, traps, side rooms), enemies and AI, bosses, champions, combat (`damage`, `hurt`), pickups, co-op player helpers.
- `render.js`: canvas drawing for the world, tiles, enemies, effects, minimap.
- `main.js`: HUD, menus (title, pause, end screen), `Game` state, difficulty (`Game.DIFF`).
- `campaign.js`: campaign mode, Sanctum unlocks, merchant (`Merchant`, `CampScreens.merchant`).
- `dev.js`: dev mode. Typing the seed POWEROVERWHELMIN toggles it. Uses a separate save key (`emberdeep.dev` vs the real `emberdeep.v1`). Cheats are off in co-op.
- `net.js`: networking. Online uses PeerJS (room id `emberdeep-room-<CODE>`, a reliable and an unreliable channel per guest). Offline uses a QR code handshake (compressed SDP).
- `nettest.js`: the Connection test screen in the Co-op menu.
- `coop.js`: host-authoritative co-op, up to 3 players. Guests send input at 30Hz, the host sends snapshots at 20Hz and events/tile diffs on the reliable channel. Level generation is deterministic from the seed, so guests rebuild maps locally. Anything big or circular on a player or enemy object must go in coop.js's `SKIP` set or it gets sent in every snapshot.

## Design decisions to keep (and why)

- Health is hearts. `hp` counts half hearts. Most damage is half a heart (1). Bosses hit for half a heart except the big telegraphed moves (leap slam, Bone Knight's overhead slam), which do a full heart.
- Rarity is about variety, not size. Damage multipliers are only 1 / 1.07 / 1.14 / 1.21 / 1.3. Higher rarity gets more quirks (Uncommon 1, Rare 1-2, Epic 2, Legendary 3) and elements. Matt asked for this.
- Item level adds 6% damage per level. Sharpening adds 6% per step (max +3). Stones are deliberately rare.
- Monster health grows `1 + 0.45 * (depth - 1)` times difficulty times co-op scaling. Deeper rooms bring more monsters instead of tankier ones (wave budget `2 + ceil(depth * 0.85)`).
- Two-hit floor: a non-boss at full health can't lose more than 60% of max HP to one non-crit hit. Crits ignore it. Matt wants regular mobs to take a couple of hits.
- Stun and freeze give 2 seconds of immunity afterward (shown as a faint amber ring). Hammers used to stunlock everything.
- Resistances run 0.7x to 1.4x. Nothing is immune to anything. Physical types: slash (sword, axe, sword waves), pierce (spear, bows), blunt (hammer, blasts). A "Resisted"/"Weak!" pop-up appears the first time per monster type per level.
- Pits (CHASM tiles): walking in takes a quarter second of pushing into the edge (stops thumb slips on phones). A roll clears a 2-tile gap but not 3. Falling costs half a heart and puts you back on the last safe tile. Hits shove the player about a tile, so monsters can knock you in. Shoved-in regular monsters die, champions lose 25% HP, bosses can't be pushed in. Fliers ignore pits.
- No DPS number on item cards (decided against: it would push players back toward chasing numbers). A dev-mode-only readout was offered, not built.
- Levels branch: 2 or 3 routes (horde, gauntlet, elite), side rooms (challenge trials that collapse if you leave, armory, combat). Leaving a fight freezes it instead of resetting it. Champions have an extra ability (volley, shockwave, blink, summon, quake) and drop Rare+ weapons. No champions on x-1 levels.
- Co-op: no duplicate classes (first come first served), all classes open in co-op, shared embers and keys, one pick per player from shared loot, revive by standing near a downed friend for 3s (room clear also revives), each player chooses when to enter the portal.
- On phones the weapon panel sits at the bottom center and the boss bar at the top. The use button label changes with context (PICK UP, TALK, OPEN, ENTER, RECOVER).

## Testing

`tests/run.sh` builds, serves the repo on port 8765 and runs the quick Playwright set. `tests/run.sh all` adds full bot runs and the power-curve bot. Each test prints results and any page errors; read the output, they aren't pass/fail asserts. The co-op tests log 404s for a missing favicon, which is harmless. Tests that one-shot enemies need `crit: true` because of the two-hit floor.

`power_curve.py <class> <seed>` is the balance check: at each level it prints the bot's typical hit, DPS, and hits-to-kill for common monsters. Judge time-to-kill (HP / DPS), not raw hit counts, since fast weapons need more hits by design. Last tuned to roughly 0.7s for a goblin at 1-1 and around 1-1.4s by 3-1.

## Open issues

- Matt's iPhone can't join co-op rooms (gets "No answer from room") while his son's iPhone and a Pixel connect to each other fine on the same WiFi. The room is found, so signaling works; the direct WebRTC link fails. Unconfirmed suspects: his phone falling back to cellular, or a non-Safari browser without Local Network permission. A TURN relay fallback and a clearer error message were offered, not built.
- Bosses don't use the newer health curve, so they may feel soft next to deeper regular monsters.
- Matt hasn't tested offline QR co-op with the router's internet unplugged yet.
