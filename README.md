# starlane-courier

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/deva1999/starlane-courier/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/deva1999/starlane-courier/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Starlane Courier** is a tiny 3D delivery rush for the browser: you ride a hover-scooter down a floating sky-lane, switching lanes, jumping barriers and sliding under beams to collect star parcels. Every star feeds a combo multiplier, a shield orb saves you from one crash, and the lane only gets faster — one unshielded hit ends the delivery.

The run travels through **three districts** in sequence and then cycles with rising intensity: the green valley it starts in, a sunset coast with water and palm islets beside the lane under a low orange sun, and a neon night city of dark towers, lit windows and glowing cyan rails — sky, fog, light, road and roadside all change at each boundary, and a banner names the district you have just entered. Along the way the lane keeps offering work and mischief:

- **Delivery orders** — a wide glowing gate spans the lane with one lane marked as the drop point; cross in the marked lane for a large bonus and a celebration, cross anywhere else and the parcel is fumbled and the combo is gone. The HUD counts your deliveries and the distance to the next gate, and the results screen reports them.
- **Boost pads** — chevron strips flush with the deck that burst you forward: extra speed, a kicked-wide view, full-stretch speed streaks, and invulnerability for the burst's duration.
- **Ramps** — orange wedges that launch the courier into a long arc, with a ring of stars strung along the flight path for anyone who takes the line.
- **Drones** — security drones that drift slowly sideways across all three lanes as they approach, so the lane they threaten has to be read late, not at spawn.

The camera rides low and close behind the courier, and every event lands on screen: floating payout text when a star or a delivery lands, an edge flash for a near miss, a fumbled gate or a broken shield, a brief screen shake on near misses and crashes, speed streaks as the pace climbs, and a marker pill every 250 m. The first seconds of a run are a safe star-lined opening; after that the speed curve bends upward and the rows pack tighter, so a minute in looks and feels nothing like the start.

It is a complete game: title screen, responsive keyboard and touch controls, score / stars / combo / deliveries / speed / distance HUD, synthesised sound effects and music (WebAudio, no audio files), pause, a game-over results screen with your deliveries and best score, and instant restart. No build step and no network: the game is plain static files under `game/` with three.js vendored beside it.

## How to play

- **← / →** or **A / D** — switch lane
- **↑ / W / SPACE** — jump a barrier
- **↓ / S** — slide under a beam (also slams you down mid-jump)
- **P** — pause, **M** — mute; on touch screens, swipe to steer, jump and slide

Dodge the red gate pylons entirely, jump the orange barriers, slide the purple beams, and never trust a drone to stay in the lane it appeared in. Stars pay 25 × your combo — watch the payout float up as you collect — and near misses raise the combo too, with a white edge flash to confirm how close it was. Delivery gates are the big money: the green marker hangs over the lane that pays, and the HUD always knows how far the next gate is. Boost pads are a free burst and a free pass through trouble; ramps are a free flight with stars on the arc. The run ends on a crash — unless your shield is lit, or a boost burst is carrying you through.

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
# then open http://localhost:8080 in a desktop browser

mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # hand-in: copies game/ + screenshots/ to out/ and writes out/dossier.json
```

## How it is put together

- `game/src/world.js` — the rules: rows of hazards and pickups, the safe opening, the bending speed/ramp and density curves, physics, collisions, combo and scoring; deterministic from a seed
- `game/src/districts.js` — the three districts (green valley, sunset coast, neon night city): each one's full palette and light, and the distance-to-district arithmetic the run cycles through
- `game/src/deliveries.js` — delivery orders: gate scheduling, the marked target lane, the bonus for crossing in it and the fumbled combo for crossing anywhere else
- `game/src/roadFeatures.js` — the road's gifts: boost pads (burst, protection) and ramps (the launch and the star arc strung along it)
- `game/src/drones.js` — drones: the sideways drift that carries a hazard across all three lanes as it approaches
- `game/src/render.js` — the three.js stage: the low close camera, floating road, per-district scenery (valley islets, coast palms on water, city towers), delivery gates, pads, ramps, drones, the courier, pooled obstacles and particles
- `game/src/main.js` — screens, the fixed-step loop, HUD (now with deliveries and next-gate distance) and the event-feedback layer (edge flashes, floating payouts, speed streaks, distance markers, district banners, screen shake); also the `window.__GAME__` hooks the automated playtest drives
- `game/src/shots.js` — the deterministic screenshot scenes (`?shot=play&seed=7`, `?shot=rush&seed=42` and friends) with their autopilot, which now also steers for delivery gates
- `game/src/input.js`, `game/src/audio.js`, `game/src/config.js`, `game/src/random.js` — input, synthesised sound, tuning, seeded randomness
- `main.ts` — the hand-in program, which verifies the screenshot set before copying and reports the dossier's contents; `vendor/makefun-game.ts` is the competition kit's dossier library, unchanged
- `PLAYTEST.md` + `playtest-log.json` — the automated playtest: boot, the safe opening and difficulty curve, a scripted run with feedback verification, staged district, delivery, boost, ramp and drone checks, staged near-miss and shield-break duels, crash and restart, with the machine-readable log

---
<sub>Entered on [make.fun](https://make.fun/?ref=gx4yrk51&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
