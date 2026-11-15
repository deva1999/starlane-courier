// Starlane Courier — the screenshot scenes behind ?shot=title|play|over.
// Each scene steps the real rules forward from a fresh world at a fixed
// step, steered by the autopilot below, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The
// maker's screenshots (shots.json) are rendered from these scenes.

import { LANES, STEP } from './config.js';
import {
  KIND_BARRIER, KIND_BEAM, KIND_GATE, createWorld, jump, slide, steer, stepWorld,
} from './world.js';

export const SHOT_TITLE = 'title';
export const SHOT_PLAY = 'play';
export const SHOT_OVER = 'over';

/** Seconds of play the 'play' scene lives through before its frame. */
const PLAY_SECONDS = 17;
/** The 'over' scene's pilot plays honestly this far, then stops dodging. */
const DOOMED_AFTER_METRES = 300;
/** Hard cap so a lucky doomed pilot still ends inside a minute. */
const OVER_LIMIT_SECONDS = 75;

/** Rows clustered into the groups they were spawned as, nearest first. */
function rowGroups(state) {
  const rows = state.rows
    .filter((row) => row.z > -52 && row.z < 1)
    .sort((a, b) => b.z - a.z);
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].z - row.z) < 2.5) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

/** The lanes a group leaves open (a beam leaves every lane open). */
function openLanes(group) {
  const blocked = new Set();
  for (const row of group) if (row.kind !== KIND_BEAM) blocked.add(row.lane);
  return [0, 1, 2].filter((lane) => !blocked.has(lane));
}

/**
 * A simple pilot: each decision tick it reads the two nearest row
 * groups, picks a lane that serves both when it can — pre-positioning
 * for the second group while the first is still approaching, which is
 * what keeps a two-lane change from running out of road — jumps a
 * barrier it cannot dodge and slides under every beam. A row stays a
 * threat until it has fully passed (z > 1): forgetting it in the last
 * two units is how an earlier pilot steered into the barrier it had
 * just dodged. With `doomedAfter` set, it plays honestly until that
 * distance, then steers into the next hazard and never jumps or slides.
 */
export function createAutopilot(doomedAfter = Infinity) {
  let nextDecision = 0;
  return function pilot(state) {
    if (state.mode !== 'play' || state.time < nextDecision) return;
    nextDecision = state.time + 0.06;
    const rider = state.rider;
    const doomed = state.distance > doomedAfter;
    const groups = rowGroups(state);
    const first = groups[0];
    if (!first) return;
    const second = groups[1];

    if (doomed) {
      const hazard = first.find((row) => row.kind !== KIND_BEAM);
      if (hazard) {
        if (rider.lane < hazard.lane) steer(state, 1);
        else if (rider.lane > hazard.lane) steer(state, -1);
      }
      return; // and never jump or slide again: the crash is coming
    }

    // When the road ahead allows it, drift toward the nearest line of
    // stars: always when nothing is close, and also when the star's
    // lane is one the nearest group leaves open anyway.
    let star = null;
    for (const item of state.pickups) {
      if (item.kind !== 'star' || item.taken || item.z < -42 || item.z > -8) continue;
      if (!star || item.z > star.z) star = item;
    }
    if (star && star.lane !== rider.lane) {
      // Chase only into a lane both groups leave open: a lane the
      // second group blocks is a trap with a star in it.
      const chaseLaneOpen = openLanes(first).includes(star.lane)
        && (!second || openLanes(second).includes(star.lane));
      const roomToChase = !first || first[0].z < -18 || chaseLaneOpen;
      if (roomToChase) steer(state, Math.sign(star.lane - rider.lane));
    }
    if (!first) return;

    const beam = first.find((row) => row.kind === KIND_BEAM);
    if (beam) {
      if (beam.z > -state.speed * 0.34 && rider.sliding <= 0) slide(state);
      // A beam blocks no lane, but the group behind it might: use the
      // approach to get into a lane that group leaves open.
      if (second && beam.z < -state.speed * 0.5) {
        const open = openLanes(second);
        if (!open.includes(rider.lane) && open.length > 0) {
          steer(state, Math.sign(open[0] - rider.lane));
        }
      }
      return;
    }

    // Lanes the first group leaves open, narrowed to lanes the second
    // group also leaves open when one qualifies: serving both is what
    // pre-positioning means.
    let targets = openLanes(first);
    if (second) {
      const both = targets.filter((lane) => openLanes(second).includes(lane));
      if (both.length > 0) targets = both;
    }
    if (targets.includes(rider.lane)) return;
    if (targets.length === 0) {
      // No lane out: if it is a barrier, jump it.
      const barrier = first.find((row) => row.kind === KIND_BARRIER && row.lane === rider.lane);
      if (barrier && barrier.z > -state.speed * 0.42 && rider.grounded) jump(state);
      return;
    }
    targets.sort((a, b) => Math.abs(a - rider.lane) - Math.abs(b - rider.lane));
    steer(state, Math.sign(targets[0] - rider.lane));
  };
}

/** Step a world forward under a pilot for a fixed number of seconds. */
function runScene(state, pilot, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    pilot(state);
    stepWorld(state, STEP);
    if (state.mode !== 'play') break;
  }
}

/**
 * Build the world a screenshot scene shows, plus the screen the page
 * should present over it: 'title', 'play' or 'over'.
 */
export function buildShotWorld(name, seed) {
  const state = createWorld(seed);
  if (name === SHOT_TITLE) {
    runScene(state, createAutopilot(), 7);
    return { state, screen: 'title' };
  }
  if (name === SHOT_OVER) {
    runScene(state, createAutopilot(DOOMED_AFTER_METRES), OVER_LIMIT_SECONDS);
    return { state, screen: 'over' };
  }
  runScene(state, createAutopilot(), PLAY_SECONDS);
  return { state, screen: 'play' };
}
