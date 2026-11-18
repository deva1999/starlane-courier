// Starlane Courier — the rules of the run, with no rendering in it.
// The world is a stream of rows rolling toward a rider who stays at z = 0:
// barriers to jump, beams to slide under, gates to dodge, stars to collect.
// Everything here is deterministic for a given seed (random.js), which is
// what makes the screenshot scenes and the playtest log reproducible.

import {
  BOOST_BONUS_SPEED, BOOST_SECONDS, COMBO_MAX, DESPAWN_BEHIND, GRAVITY,
  JUMP_VELOCITY, LANES, LANE_SPEED, OPENING_SAFE_REACH, RIDER_DUCKED,
  RIDER_HALF, RIDER_HEIGHT, ROW_GAP_MIN, ROW_GAP_START, SHIELD_GRACE,
  SLIDE_SECONDS, SPAWN_AHEAD, SPEED_MAX, SPEED_RAMP, SPEED_START, STAR_POINTS,
} from './config.js';
import { makeRandom, pick, randomInt } from './random.js';
import { districtAtDistance } from './districts.js';
import { resolveGates, scheduleGates } from './deliveries.js';
import { launchFromRamp, placeBoostPad, placeRamp, resolveBoostPads } from './roadFeatures.js';
import { KIND_DRONE, driftDrone, makeDrone } from './drones.js';

export { EVENT_DELIVERY, EVENT_DELIVERY_MISS } from './deliveries.js';
export { EVENT_BOOST, EVENT_RAMP } from './roadFeatures.js';
export { KIND_DRONE };

export const KIND_BARRIER = 'barrier';
export const KIND_BEAM = 'beam';
export const KIND_GATE = 'gate';
export const KIND_RAMP = 'ramp';

export const EVENT_STAR = 'star';
export const EVENT_SHIELD = 'shield';
export const EVENT_NEAR = 'near';
export const EVENT_CRASH = 'crash';
export const EVENT_SHIELD_BREAK = 'shieldbreak';
export const EVENT_JUMP = 'jump';
export const EVENT_LAND = 'land';
export const EVENT_SLIDE = 'slide';

/** Collision heights: a barrier is cleared by any real jump… */
const BARRIER_HEIGHT = 0.95;
/** …a beam only by ducking under its underside. */
const BEAM_BOTTOM = 1.02;
/** Seconds without a star or a near miss before the combo falls back. */
const COMBO_KEEP = 4;

/** A fresh run: rider centred, world empty, first rows already queued. */
export function createWorld(seed) {
  const state = {
    mode: 'play',
    time: 0,
    distance: 0,
    speed: SPEED_START,
    score: 0,
    stars: 0,
    combo: 1,
    bestCombo: 1,
    comboTimer: 0,
    shield: false,
    grace: 0,
    districtIndex: 0,
    districtLap: 0,
    deliveries: 0,
    gates: [],
    gatesScheduled: 0,
    pads: [],
    boost: 0,
    boostDuration: BOOST_SECONDS,
    effectiveSpeed: SPEED_START,
    rider: { lane: 1, x: LANES[1], y: 0, vy: 0, grounded: true, sliding: 0 },
    rows: [],
    pickups: [],
    nextRowZ: -34,
    events: [],
    fx: [],
    random: makeRandom(seed),
  };
  while (state.nextRowZ > -SPAWN_AHEAD) spawnRow(state);
  return state;
}

/** Rider height right now: ducked while sliding. */
export function riderHeight(state) {
  return state.rider.sliding > 0 ? RIDER_DUCKED : RIDER_HEIGHT;
}

/** Queue one more row of trouble (and sometimes treasure) ahead. */
function spawnRow(state) {
  const z = state.nextRowZ;
  // Rows pack tighter as the run deepens: the gap sheds 1.6 units per
  // hundred metres, faster than the old rate, down to a denser floor.
  const gap = Math.max(ROW_GAP_MIN, ROW_GAP_START - state.distance * 0.016);
  state.nextRowZ -= gap * (0.85 + state.random() * 0.4);
  const roll = state.random();
  const lane = randomInt(state.random, 3);

  // Opening grace: anything the rider would meet within the safe reach
  // is a star line or nothing at all — never a hazard. Because a row
  // reaches the rider after exactly -z units of travel, this holds no
  // matter how the speed curve bends later.
  if (-z < OPENING_SAFE_REACH) {
    if (roll < 0.55) {
      for (let i = 0; i < 5; i += 1) {
        state.pickups.push({ kind: 'star', lane, z: z - i * 2.4, y: 0.75, taken: false });
      }
    }
    return;
  }

  // Pressure: the deeper the run, the more of the mix is hazards and
  // the less is calm star lines. The thresholds slide with distance,
  // so the road a minute in is visibly meaner than the road at spawn.
  const pressure = Math.min(1, state.distance / 850);
  const starLine = 0.16 - 0.05 * pressure;
  const beam = starLine + 0.08;
  const gate = beam + 0.18 + 0.04 * pressure;
  const doubleBarrier = gate + 0.20 + 0.03 * pressure;
  const drone = doubleBarrier + 0.07;
  const ramp = drone + 0.06;
  const boostPad = ramp + 0.05;

  if (roll < starLine) {
    // A line of stars down one lane: the calm between hazards.
    for (let i = 0; i < 5; i += 1) {
      state.pickups.push({ kind: 'star', lane, z: z - i * 2.4, y: 0.75, taken: false });
    }
    return;
  }
  if (roll < beam) {
    // A beam across the whole lane: slide, do not jump.
    state.rows.push({ kind: KIND_BEAM, lane: -1, z, cleared: false });
    return;
  }
  if (roll < gate) {
    // One gate pylon: simply do not be in its lane.
    state.rows.push({ kind: KIND_GATE, lane, z, cleared: false });
    maybeShield(state, z);
    return;
  }
  if (roll < doubleBarrier) {
    // Barriers in two lanes, one lane left open.
    const open = randomInt(state.random, 3);
    for (let l = 0; l < 3; l += 1) {
      if (l !== open) state.rows.push({ kind: KIND_BARRIER, lane: l, z, cleared: false });
    }
    return;
  }
  if (roll < drone) {
    // A drone: it will not stay in the lane it spawns in.
    state.rows.push(makeDrone(state, z));
    return;
  }
  if (roll < ramp) {
    // A ramp, with its star arc strung along the jump it throws.
    placeRamp(state, lane, z);
    return;
  }
  if (roll < boostPad) {
    // A boost pad flush with the deck, and a calm moment around it.
    placeBoostPad(state, lane, z);
    return;
  }
  // A single barrier, with a star arc over it paying anyone who jumps.
  state.rows.push({ kind: KIND_BARRIER, lane, z, cleared: false });
  const arc = [-3.4, -1.7, 0, 1.7, 3.4];
  const heights = [0.8, 1.5, 1.85, 1.5, 0.8];
  for (let i = 0; i < arc.length; i += 1) {
    state.pickups.push({ kind: 'star', lane, z: z + arc[i], y: heights[i], taken: false });
  }
}

/** Now and then, offer a shield orb in a lane of its own. */
function maybeShield(state, z) {
  if (state.shield || state.distance < 300) return;
  if (state.random() < 0.3) {
    state.pickups.push({ kind: 'shield', lane: randomInt(state.random, 3), z: z - 9, y: 0.85, taken: false });
  }
}

/** Steer: -1, 0 or 1 lane from where the rider is heading. */
export function steer(state, direction) {
  const rider = state.rider;
  rider.lane = Math.min(2, Math.max(0, rider.lane + direction));
}

/** Jump, if the rider is on the ground. */
export function jump(state) {
  const rider = state.rider;
  if (!rider.grounded || state.mode !== 'play') return;
  rider.vy = JUMP_VELOCITY;
  rider.grounded = false;
  rider.sliding = 0;
  state.events.push(EVENT_JUMP);
}

/** Slide, cancelling a jump into a fast drop when airborne. */
export function slide(state) {
  const rider = state.rider;
  if (state.mode !== 'play') return;
  if (!rider.grounded) rider.vy = Math.min(rider.vy, -16);
  rider.sliding = SLIDE_SECONDS;
  state.events.push(EVENT_SLIDE);
}

/** Does this row hit a rider at riderX with feet at riderY right now? */
function rowHits(state, row, riderX, riderY) {
  if (row.kind === KIND_BEAM) {
    return riderY + riderHeight(state) > BEAM_BOTTOM;
  }
  if (row.kind === KIND_DRONE) {
    // The drone hovers at courier height and threatens the x it is
    // over right now; only a genuinely high flight clears it.
    return Math.abs(riderX - row.droneX) < RIDER_HALF + 0.8 && riderY < 1.9;
  }
  const laneX = LANES[row.lane];
  const reach = row.kind === KIND_GATE ? RIDER_HALF + 0.8 : RIDER_HALF + 0.9;
  if (Math.abs(riderX - laneX) >= reach) return false;
  if (row.kind === KIND_GATE) return true;
  return riderY < BARRIER_HEIGHT;
}

/** Advance the whole world by one fixed step. */
export function stepWorld(state, dt) {
  if (state.mode !== 'play') return;
  state.time += dt;
  // The ramp itself ramps: the boost factor grows from ×1 toward ×2.8
  // over the first ~34 seconds, so the pace curve bends upward and the
  // top speed arrives in well under half the old time.
  const rampBoost = 1 + Math.min(1.8, state.time / 34);
  state.speed = Math.min(SPEED_MAX, state.speed + SPEED_RAMP * rampBoost * dt);
  if (state.boost > 0) state.boost = Math.max(0, state.boost - dt);
  // The boost burst is extra pace on top of the run's own speed: it
  // moves the world, the score and the district clock alike.
  state.effectiveSpeed = state.speed + (state.boost > 0 ? BOOST_BONUS_SPEED : 0);
  state.distance += state.effectiveSpeed * dt;
  state.score += state.effectiveSpeed * dt;
  const here = districtAtDistance(state.distance);
  state.districtIndex = here.index;
  state.districtLap = here.lap;
  if (state.grace > 0) state.grace -= dt;
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 1;
  }

  const rider = state.rider;
  // Lane changes glide sideways toward the target lane's centre.
  const targetX = LANES[rider.lane];
  const dx = targetX - rider.x;
  const maxStep = LANE_SPEED * dt;
  rider.x += Math.abs(dx) < maxStep ? dx : Math.sign(dx) * maxStep;
  // Jumping is plain gravity.
  if (!rider.grounded) {
    rider.vy -= GRAVITY * dt;
    rider.y += rider.vy * dt;
    if (rider.y <= 0) {
      rider.y = 0;
      rider.vy = 0;
      rider.grounded = true;
      state.events.push(EVENT_LAND);
    }
  }
  if (rider.sliding > 0) rider.sliding -= dt;

  // The world rolls toward the rider; the spawn frontier rolls with it,
  // and new rows keep the road full out to the horizon.
  const dz = state.effectiveSpeed * dt;
  for (const row of state.rows) {
    row.z += dz;
    driftDrone(row, dt);
  }
  for (const item of state.pickups) item.z += dz;
  for (const gate of state.gates) gate.z += dz;
  for (const pad of state.pads) pad.z += dz;
  state.nextRowZ += dz;
  while (state.nextRowZ > -SPAWN_AHEAD) spawnRow(state);
  scheduleGates(state, SPAWN_AHEAD);

  collectPickups(state);
  resolveBoostPads(state, state.events, state.fx);
  resolveRows(state);
  resolveGates(state, state.events, state.fx);

  state.rows = state.rows.filter((row) => row.z < DESPAWN_BEHIND);
  state.pickups = state.pickups.filter((item) => !item.taken && item.z < DESPAWN_BEHIND);
  state.gates = state.gates.filter((gate) => !gate.resolved && gate.z < DESPAWN_BEHIND);
  state.pads = state.pads.filter((pad) => !pad.taken && pad.z < DESPAWN_BEHIND);
}

/** Stars and shields are gathered by riding through them. */
function collectPickups(state) {
  const rider = state.rider;
  for (const item of state.pickups) {
    if (item.taken || Math.abs(item.z) > 0.9) continue;
    if (Math.abs(rider.x - LANES[item.lane]) > 1.15) continue;
    const riderMid = rider.y + riderHeight(state) / 2;
    if (Math.abs(riderMid - item.y) > 1.05) continue;
    item.taken = true;
    if (item.kind === 'star') {
      state.stars += 1;
      const points = STAR_POINTS * state.combo;
      state.score += points;
      // The presentation layer gets the exact payout and lane, so the
      // floating score text can show the real number where it happened.
      state.fx.push({ kind: 'star', points, lane: item.lane });
      state.combo = Math.min(COMBO_MAX, state.combo + 1);
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.comboTimer = COMBO_KEEP;
      state.events.push(EVENT_STAR);
    } else {
      state.shield = true;
      state.fx.push({ kind: 'shield', lane: item.lane });
      state.events.push(EVENT_SHIELD);
    }
  }
}

/** Rows crossing the rider's plane either hit, or count as near misses. */
function resolveRows(state) {
  const rider = state.rider;
  for (const row of state.rows) {
    if (row.cleared || row.z < 0) continue;
    if (row.kind === KIND_RAMP) {
      // A ramp is not a hazard: reaching it grounded in its lane is a
      // launch, and passing it any other way is just passing it.
      if (row.z < 0.9) {
        if (launchFromRamp(state, row, state.events)) row.cleared = true;
      } else {
        row.cleared = true;
      }
      continue;
    }
    if (row.z < 0.9 && rowHits(state, row, rider.x, rider.y)) {
      row.cleared = true;
      if (state.grace > 0) continue;
      if (state.boost > 0) continue; // the burst ploughs straight through
      if (state.shield) {
        state.shield = false;
        state.grace = SHIELD_GRACE;
        state.events.push(EVENT_SHIELD_BREAK);
      } else {
        state.mode = 'over';
        state.events.push(EVENT_CRASH);
      }
      continue;
    }
    if (row.z >= 0.9) {
      row.cleared = true;
      if (row.kind !== KIND_BEAM && Math.abs(rider.x - LANES[row.lane]) < 2.3) {
        state.combo = Math.min(COMBO_MAX, state.combo + 1);
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        state.comboTimer = COMBO_KEEP;
        state.score += 10;
        state.events.push(EVENT_NEAR);
      }
    }
  }
}
