# Playtest — Starlane Courier

Automated playtest of the real game in headless Chromium (Playwright),
driving the same screens and keys a player uses, plus staged duels on
the live world for the events a free run cannot be trusted to produce
on cue (a near miss, a shield break). The machine-readable record of
the final run is `playtest-log.json` beside this file:
**29 of 29 checks passed, zero page errors.**

## How it was played

1. Boot the game from `game/` served statically; the title screen must
   appear over a living attract-mode world.
2. Click **START DELIVERY**, then play by keyboard alone: slide, lane
   change left and right, jump — each verified from the game's own
   state (`window.render_game_to_text()` and its event feed).
3. Prove the new difficulty shape on the raw world module: a hands-off
   world that cannot die inside the safe opening, and an
   autopilot-driven world whose speed and row density are measured
   early and late.
4. A long run on the real game driven by the game's own autopilot,
   stepped in 60 ms slices through the `advanceTime` hook and sampled
   every slice for the new feedback: floating score text in the DOM,
   speed streaks, distance-marker pills.
5. Staged events on the live world: a real barrier pulled close and
   jumped for a near miss; a shield flag set and a real hazard steered
   into for a shield break — each must fire its edge flash through the
   real rules. Pause must silence the whole feedback layer.
6. A deliberate crash in real time, the game-over screen, Enter to
   restart, P to pause and resume.

## Final run, the numbers

| Check | Result |
| --- | --- |
| Title screen over a live attract world | pass |
| Start, slide, lane changes, jump (peak height 2.15) | pass |
| Safe opening | hands-off world still alive at 80 m; it died at 5.3 s, once real hazards arrived |
| Difficulty ramp (seed 9, raw module) | speed 22.7 → 37.1 units/s between 5 s and 25 s; rows spawned per 5 s window 3 early vs 13 late |
| Driven run | survived, **+864 m**, **13 stars**, score 2,115, best combo ×8 |
| Star feedback | 13 floaters spawned; payout text `+175` caught in the DOM in its spawn slice |
| Speed streaks | peak level 0.63 at 41.2 units/s |
| Distance markers | pills shown up to **750 m** |
| Near miss / shield break | each fired exactly one edge flash of its kind (`near`, `shieldbreak`); the shield run continued under grace |
| Pause / game over | feedback layer fully silent on both (streak opacity 0, no floaters, no marker) |
| Forced crash → results screen (score 128 on the short staged run) → Enter restart | pass |
| Console and page errors | none |

## Findings, in the order a player would meet them

- **Fixed during testing — the screenshot pilot kept dying
  mid-crossing on the new, denser road.** The first tuning pass
  (faster ramp, tighter rows) killed the autopilot in most seeds
  around 25–35 s, always the same way: caught straddling a blocked
  lane as its row arrived. Three real causes, three fixes: the
  star-chase steered across blocked lanes at the last moment because
  an open destination lane bypassed its room check (the chase now
  prices the crossing, not just the destination); the pilot trusted
  its steering target instead of its body position (a straddle rescue
  now jumps a barrier the body cannot clear in time, using exit-time
  arithmetic); and lane changes themselves were too slow for the new
  density (lane speed 16 → 19, which players feel too). Measured in
  Node across 30 seeds: 45-second survival went from 24/30 after the
  first tuning to **29/30** (the one death at 41 s, at top speed and
  maximum density).
- **Fixed during testing — the game-over screenshot was a black
  monolith.** With the closer camera, seed 5's killer gate pylon at
  z ≈ 0 filled the centre of the frame and hid the rider entirely.
  The scene now uses seed 15: an edge-lane barrier, so the rider, the
  star arc and the crash site stay visible beside the results panel.
- **Fixed during testing — pickups already missed loomed as giant
  blobs at the frame's edges.** A star one unit past the rider's
  plane rendered enormous for a frame or two. The renderer now only
  draws pickups that can still be won (z ≤ 1.5); the road ahead is
  unchanged.
- **Test-rig artifact, not a game bug — floaters pile up in the DOM
  during the driven run.** The stepping loop is synchronous, so the
  floaters' removal timers cannot fire until it ends; in real play
  the frame loop yields constantly and each floater lives its
  0.95 s. The check was redesigned to catch the payout text in the
  exact slice it spawns instead of counting DOM residents.
- **Performance note, honestly scoped.** In this test environment
  (headless Chromium with SwiftShader software rendering on a shared
  1.5-CPU VM) the game renders at 6.3 FPS at 1280×800; the scene is
  now ~380 low-poly meshes with Lambert materials, which a desktop
  GPU renders trivially. The frame-rate figure is recorded in the log
  as an observation of the test rig, not as a property of the game.
- **The game-over panel covers the rider's lower half.** By design:
  the results (score, parcels, distance, best combo, restart) are the
  readable content of that screen; the crash itself is one panel
  earlier in the same run.

## Reproduce

Serve `game/` (`node serve.ts`), open the page, and read
`window.render_game_to_text()` at any moment — it now includes an
`fx` block with the feedback counters; `window.advanceTime(ms)` steps
the simulation deterministically. The screenshot scenes in
`shots.json` are rebuilt from `game/src/shots.js` — same seed, same
frame, every time.
