// Starlane Courier — delivery orders. Between the hazards, the lane
// keeps offering work: a wide glowing gate spans all three lanes with
// one lane marked as the drop point. Cross through the marked lane and
// the delivery lands — a large bonus and a celebration. Cross anywhere
// else and the parcel is fumbled: no bonus, and the combo is gone.
// This module owns gate spawning and resolution; world.js calls it
// from the step and supplies the shared constants.

import { DELIVERY_BONUS, DELIVERY_EVERY, DELIVERY_FIRST_AT, LANES } from './config.js';
import { randomInt } from './random.js';

export const EVENT_DELIVERY = 'delivery';
export const EVENT_DELIVERY_MISS = 'deliverymiss';

/** Distance from the run's start to the gate after the given one. */
export function nextGateDistance(deliveriesScheduled) {
  return DELIVERY_FIRST_AT + deliveriesScheduled * DELIVERY_EVERY;
}

/**
 * Keep a gate standing on the spawn horizon: when the next scheduled
 * gate's distance is within the populated reach, place it at the z
 * that distance implies, with its target lane chosen by the run's seed.
 */
export function scheduleGates(state, spawnAhead) {
  for (;;) {
    const at = nextGateDistance(state.gatesScheduled);
    const ahead = at - state.distance;
    if (ahead > spawnAhead) return;
    state.gates.push({
      targetLane: randomInt(state.random, 3),
      z: -ahead,
      resolved: false,
    });
    state.gatesScheduled += 1;
  }
}

/** Metres until the nearest unresolved gate reaches the rider. */
export function metresToNextGate(state) {
  let best = null;
  for (const gate of state.gates) {
    if (gate.resolved) continue;
    const metres = Math.max(0, Math.round(-gate.z));
    if (best === null || metres < best) best = metres;
  }
  if (best !== null) return best;
  const scheduled = nextGateDistance(state.gatesScheduled) - state.distance;
  return Math.max(0, Math.round(scheduled));
}

/**
 * Resolve every gate crossing the rider's plane this step. A gate is
 * crossed in its target lane when the rider's body is within a lane's
 * reach of that lane's centre; anything else is a fumble.
 */
export function resolveGates(state, events, fx) {
  const rider = state.rider;
  for (const gate of state.gates) {
    if (gate.resolved || gate.z < 0.9) continue;
    gate.resolved = true;
    if (Math.abs(rider.x - LANES[gate.targetLane]) < 1.6) {
      const bonus = DELIVERY_BONUS + 25 * (state.combo - 1);
      state.deliveries += 1;
      state.score += bonus;
      state.comboTimer = 4;
      fx.push({ kind: 'delivery', points: bonus, lane: gate.targetLane });
      events.push(EVENT_DELIVERY);
    } else {
      state.combo = 1;
      state.comboTimer = 0;
      fx.push({ kind: 'deliverymiss', lane: gate.targetLane });
      events.push(EVENT_DELIVERY_MISS);
    }
  }
}
