# starlane-courier

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/deva1999/starlane-courier/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/deva1999/starlane-courier/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Starlane Courier** is a tiny 3D delivery rush for the browser: you ride a hover-scooter down a floating sky-lane above a low-poly valley, switching lanes, jumping barriers and sliding under beams to collect star parcels. Every star feeds a combo multiplier, a shield orb saves you from one crash, and the lane only gets faster — one unshielded hit ends the delivery.

It is a complete game: title screen, responsive keyboard and touch controls, score / stars / combo / speed HUD, synthesised sound effects and music (WebAudio, no audio files), pause, a game-over results screen with your best score, and instant restart. No build step and no network: the game is plain static files under `game/` with three.js vendored beside it.

## How to play

- **← / →** or **A / D** — switch lane
- **↑ / W / SPACE** — jump a barrier
- **↓ / S** — slide under a beam (also slams you down mid-jump)
- **P** — pause, **M** — mute; on touch screens, swipe to steer, jump and slide

Dodge the red gate pylons entirely, jump the orange barriers, slide the purple beams. Stars pay 25 × your combo; near misses raise the combo too. The run ends on a crash — unless your shield is lit.

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
# then open http://localhost:8080 in a desktop browser

mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # hand-in: copies game/ + screenshots/ to out/ and writes out/dossier.json
```

## How it is put together

- `game/src/world.js` — the rules: rows of hazards and pickups, physics, collisions, combo and scoring; deterministic from a seed
- `game/src/render.js` — the three.js stage: floating road, valley scenery, the courier, pooled obstacles and particles
- `game/src/main.js` — screens, the fixed-step loop, HUD and event feedback; also the `window.__GAME__` hooks the automated playtest drives
- `game/src/shots.js` — the deterministic screenshot scenes (`?shot=play&seed=7` and friends) with their autopilot
- `game/src/input.js`, `game/src/audio.js`, `game/src/config.js`, `game/src/random.js` — input, synthesised sound, tuning, seeded randomness
- `main.ts` — the hand-in program; `vendor/makefun-game.ts` is the competition kit's dossier library, unchanged
- `PLAYTEST.md` + `playtest-log.json` — the automated playtest: boot, a scripted run, scoring, crash and restart, with the machine-readable log

---
<sub>Entered on [make.fun](https://make.fun/?ref=gx4yrk51&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
