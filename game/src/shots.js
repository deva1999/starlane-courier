// Starlane Courier — the screenshot scenes behind ?shot=title|play|over.
// Each scene steps the real rules forward from a fresh world at a fixed
// step, steered by the autopilot below, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The
// maker's screenshots (shots.json) are rendered from these scenes.

import { LANES, LANE_SPEED, STEP } from './config.js';
import {
  KIND_BARRIER, KIND_BEAM, KIND_GATE, createWorld, jump, slide, steer, stepWorld,
} from './world.js';

export const SHOT_TITLE = 'title';
export const SHOT_PLAY = 'play';
export const SHOT_RUSH = 'rush';
export const SHOT_OVER = 'over';

/** Seconds of play the 'play' scene lives through before its frame. */
const PLAY_SECONDS = 13;
/**
 * The 'rush' scene rides much longer, until the speed curve has bent
 * most of the way to its cap: wide view, streaks lit, road at its
 * densest — a frame that cannot be mistaken for the 'play' scene.
 */
const RUSH_SECONDS = 34;
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

/** The lane whose centre the rider's body is currently closest to. */
function nearestLane(x) {
  let best = 0;
  for (let lane = 1; lane < 3; lane += 1) {
    if (Math.abs(LANES[lane] - x) < Math.abs(LANES[best] - x)) best = lane;
  }
  return best;
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
      // second group blocks is a trap with a star in it. And a chase
      // whose path crosses a lane the first group blocks needs real
      // room to spare, however open the star's own lane is — a late
      // crossing is how a rider ends up straddling a blocked lane
      // exactly as its row arrives.
      const chaseLaneOpen = openLanes(first).includes(star.lane)
        && (!second || openLanes(second).includes(star.lane));
      const chaseStep = Math.sign(star.lane - rider.lane);
      let chaseCrossesBlocked = false;
      for (let lane = rider.lane + chaseStep; lane !== star.lane; lane += chaseStep) {
        if (first.some((row) => row.kind !== KIND_BEAM && row.lane === lane)) {
          chaseCrossesBlocked = true;
        }
      }
      const roomToChase = !first || first[0].z < -state.speed * 1.15
        || (chaseLaneOpen && !chaseCrossesBlocked);
      if (roomToChase) steer(state, chaseStep);
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
    // Straddle rescue: the rider's body — not its steering target —
    // is what a row hits. If the body sits inside a barrier's reach
    // and the steering already committed cannot carry it out before
    // the group arrives, jump that barrier instead of trusting the
    // crossing to finish in time.
    const arrival = -first[0].z / state.speed;
    if (arrival < 0.6 && rider.grounded) {
      for (const row of first) {
        if (row.kind !== KIND_BARRIER) continue;
        if (Math.abs(rider.x - LANES[row.lane]) >= 1.45) continue;
        const dir = Math.sign(LANES[rider.lane] - rider.x);
        let exitTime = Infinity;
        if (dir !== 0) {
          exitTime = ((LANES[row.lane] + dir * 1.45) - rider.x) * dir / LANE_SPEED;
        }
        if (exitTime > arrival && row.z > -state.speed * 0.62) {
          jump(state);
          return;
        }
      }
    }

    if (targets.includes(rider.lane)) return;
    if (targets.length === 0) {
      // No lane out: if it is a barrier, jump it.
      const barrier = first.find((row) => row.kind === KIND_BARRIER && row.lane === rider.lane);
      if (barrier && barrier.z > -state.speed * 0.42 && rider.grounded) jump(state);
      return;
    }
    targets.sort((a, b) => Math.abs(a - rider.lane) - Math.abs(b - rider.lane));
    const target = targets[0];
    const dir = Math.sign(target - rider.lane);
    // Crossing discipline: a route that passes through a lane this
    // group blocks is only started when the rider's body can clear
    // that lane's reach before the group arrives. Too late, and the
    // choices are jumping a barrier under the rider or waiting the
    // group out in a lane it leaves open.
    const blockedSet = new Set(
      first.filter((row) => row.kind !== KIND_BEAM).map((row) => row.lane),
    );
    let lastBlocked = null;
    for (let lane = rider.lane + dir; lane !== target; lane += dir) {
      if (blockedSet.has(lane)) lastBlocked = lane;
    }
    if (lastBlocked !== null) {
      const clearX = LANES[lastBlocked] + dir * 1.55;
      const timeToClear = Math.abs(clearX - rider.x) / LANE_SPEED;
      if (arrival < timeToClear + 0.12) {
        const barrierHere = first.find(
          (row) => row.kind === KIND_BARRIER && Math.abs(rider.x - LANES[row.lane]) < 1.5,
        );
        if (barrierHere && rider.grounded && barrierHere.z > -state.speed * 0.62) {
          jump(state);
          return;
        }
        if (!blockedSet.has(nearestLane(rider.x))) return;
      }
    }
    steer(state, dir);
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
  if (name === SHOT_RUSH) {
    runScene(state, createAutopilot(), RUSH_SECONDS);
    return { state, screen: 'play' };
  }
  runScene(state, createAutopilot(), PLAY_SECONDS);
  return { state, screen: 'play' };
}
