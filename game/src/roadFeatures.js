// Starlane Courier — the road's gifts: boost pads and ramps. A boost
// pad is a chevron strip flush with the deck: ride over it and the
// scooter bursts forward — faster, view kicked wider, streaks harder,
// and untouchable for the burst's duration. A ramp is a wedge in one
// lane: ride up it grounded and it throws the courier into a long arc,
// with a ring of stars laid along that arc to reward the line. This
// module owns both features' spawning shapes and their triggers;
// world.js owns the physics they feed.

import { LANES, RAMP_VELOCITY } from './config.js';

export const EVENT_BOOST = 'boost';
export const EVENT_RAMP = 'ramp';

/** The star arc a ramp throws the rider through, in its own lane:
 * offsets ahead of the ramp and the heights the arc passes through,
 * following the ramp trajectory at a typical approach speed. */
const ARC_OFFSETS = [3, 6, 9, 12, 15];
const ARC_HEIGHTS = [2.35, 3.7, 4.65, 5.2, 5.35];

/** Lay a boost pad on the deck at a z, in one lane. */
export function placeBoostPad(state, lane, z) {
  state.pads.push({ lane, z, taken: false });
}

/** Lay a ramp in one lane, with its star arc strung along the jump. */
export function placeRamp(state, lane, z) {
  state.rows.push({ kind: 'ramp', lane, z, cleared: false });
  for (let i = 0; i < ARC_OFFSETS.length; i += 1) {
    state.pickups.push({
      kind: 'star', lane, z: z - ARC_OFFSETS[i], y: ARC_HEIGHTS[i], taken: false,
    });
  }
}

/**
 * Fire any pad under the rider this step: the pad is spent, the burst
 * timer starts, and the event layer announces it. Returns true when a
 * pad fired, so the caller can skip re-checking.
 */
export function resolveBoostPads(state, events, fx) {
  const rider = state.rider;
  for (const pad of state.pads) {
    if (pad.taken || Math.abs(pad.z) > 1.1) continue;
    if (Math.abs(rider.x - LANES[pad.lane]) > 1.15) continue;
    pad.taken = true;
    state.boost = state.boostDuration;
    fx.push({ kind: 'boost', lane: pad.lane });
    events.push(EVENT_BOOST);
    return true;
  }
  return false;
}

/**
 * Fire a ramp the rider reaches grounded in its lane: the take-off is
 * harder than a jump and the slide is cancelled — the arc is the ride.
 * A rider already airborne over the ramp, or in another lane, simply
 * passes it by.
 */
export function launchFromRamp(state, row, events) {
  const rider = state.rider;
  if (!rider.grounded) return false;
  if (Math.abs(rider.x - LANES[row.lane]) > 1.15) return false;
  rider.vy = RAMP_VELOCITY;
  rider.grounded = false;
  rider.sliding = 0;
  events.push(EVENT_RAMP);
  return true;
}
