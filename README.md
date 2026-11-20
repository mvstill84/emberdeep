# Emberdeep

A tiny procedural fantasy dungeon crawler. The whole game is `index.html`: no images, no sound files, no libraries.

- Swords, bows and staffs, generated from the seed (rarity, element, quirks, names)
- Items that hook into the attack pipeline, so combinations stack on their own, plus named synergies
- Same seed, same dungeon. Some seeds are secret.
- Embers carry over between runs and buy permanent unlocks in the Sanctum
- Keyboard and mouse, touch twin-sticks, or a gamepad

## Working on it

Edit files in `src/`, then run `node build.mjs` to rebuild `index.html`. GitHub Pages serves `index.html` straight from the repo root of `main`, so a push is a deploy.
