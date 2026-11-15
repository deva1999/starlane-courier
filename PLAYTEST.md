# Playtest — Starlane Courier

Automated playtest of the real game in headless Chromium (Playwright),
driving the same screens and keys a player uses. The machine-readable
record of the final run is `playtest-log.json` beside this file:
**18 of 18 checks passed, zero page errors.**

## How it was played

1. Boot the game from `game/` served statically; the title screen must
   appear over a living attract-mode world.
2. Click **START DELIVERY**, then play by keyboard alone: slide, lane
   change left and right, jump — each verified from the game's own
   state (`window.render_game_to_text()` and its event feed).
3. A long run driven by the game's own autopilot (the same pilot that
   steers the screenshot scenes), stepped in 60 ms slices through the
   game's `advanceTime` hook: it must survive, cover distance, and
   collect stars.
4. A deliberate crash: steer into hazards until the run ends, the
   game-over screen must show a real score, then restart with Enter,
   pause and resume with P.

## Final run, the numbers

| Check | Result |
| --- | --- |
| Title screen over a live attract world | pass |
| Start, slide, lane changes, jump (peak height 2.15) | pass |
| Driven run | survived, **+439 m**, **10 stars**, score 1,194, best combo ×6 |
| Event types across the session | slide, jump, land, star |
| Forced crash → results screen (score 1,536) → Enter restart | pass |
| Pause / resume | pass |
| Console and page errors | none |

## Findings, in the order a player would meet them

- **Fixed during testing — first Enter after a crash did nothing.**
  Button clicks queued the `confirm` action through the held-key set,
  so the set stayed "held" and swallowed the next keyboard Enter. The
  restart button worked, the key did not. `input.js` now queues button
  taps directly; the probe and this playtest both restart on the
  first Enter.
- **Fixed during testing — the screenshot pilot steered into the
  barrier it had just dodged.** It forgot a row two units before the
  row crossed the rider, and a following gate could pull it back into
  the barrier's lane. Rows now stay threats until fully past, and the
  pilot reads two row groups ahead and pre-positions. Verified
  headlessly: the pilot now survives 45 s (1,179 m, top speed) on
  every seed tried, collecting 14–34 stars.
- **Performance note, honestly scoped.** In this test environment
  (headless Chromium with SwiftShader software rendering on a shared
  1.5-CPU VM) the game renders at 4–8 FPS at 1280×800; the same scene
  is ~200 low-poly meshes with Lambert materials, which a desktop GPU
  renders trivially. The frame-rate figure is recorded in the log as
  an observation of the test rig, not as a property of the game.
- **The game-over panel covers the rider.** By design: the results
  (score, parcels, distance, best combo, restart) are the readable
  content of that screen; the crash itself is one panel earlier in
  the same run.

## Reproduce

Serve `game/` (`node serve.ts`), open the page, and read
`window.render_game_to_text()` at any moment; `window.advanceTime(ms)`
steps the simulation deterministically. The screenshot scenes in
`shots.json` are rebuilt from `game/src/shots.js` — same seed, same
frame, every time.
