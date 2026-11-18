// Starlane Courier — drones, the hazard that will not sit still. A
// security drone hovers over the lane and drifts slowly sideways
// across all three lanes as it approaches, reversing at the outer lane
// centres. The lane it threatens is the lane it is over *now*, not the
// lane it spawned in, so it has to be read late — the dodge that was
// safe two seconds ago may be the collision now. This module owns the
// drift; world.js owns the collision it causes.

import { DRONE_DRIFT_SPEED, LANES } from './config.js';
import { randomInt } from './random.js';

export const KIND_DRONE = 'drone';

/** A drone entering at z, starting over a seeded lane, drifting a
 * seeded way first. Its x is a position, not a lane: it moves. */
export function makeDrone(state, z) {
  const lane = randomInt(state.random, 3);
  return {
    kind: KIND_DRONE,
    lane,
    z,
    cleared: false,
    droneX: LANES[lane],
    droneDir: state.random() < 0.5 ? -1 : 1,
  };
}

/** Advance one drone's sideways drift by dt, bouncing off the outer
 * lane centres so it sweeps the whole width of the road. */
export function driftDrone(row, dt) {
  if (row.kind !== KIND_DRONE) return;
  row.droneX += row.droneDir * DRONE_DRIFT_SPEED * dt;
  if (row.droneX <= LANES[0]) {
    row.droneX = LANES[0];
    row.droneDir = 1;
  } else if (row.droneX >= LANES[2]) {
    row.droneX = LANES[2];
    row.droneDir = -1;
  }
  // The threatened lane, for anything that still thinks in lanes.
  let nearest = 0;
  for (let lane = 1; lane < 3; lane += 1) {
    if (Math.abs(LANES[lane] - row.droneX) < Math.abs(LANES[nearest] - row.droneX)) nearest = lane;
  }
  row.lane = nearest;
}
