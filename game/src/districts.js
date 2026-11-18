// Starlane Courier — the three districts a run travels through, in
// order, and then around again with the road already at full pressure.
// Each district is a complete visual identity: sky, fog, light, road
// dress and roadside props all change together, so crossing a boundary
// is unmistakable at a glance. This module owns only the definitions
// and the distance-to-district arithmetic; world.js tracks which
// district a run is in and render.js dresses the stage from it.

import { DISTRICT_LENGTH } from './config.js';

/** The green valley the run starts in: today's bright sky-lane. */
export const DISTRICT_VALLEY = {
  id: 'valley',
  name: 'GREEN VALLEY',
  sky: 0x8fd8ff,
  fog: 0xaee3ff,
  sunColor: 0xfff1cf,
  sunIntensity: 1.9,
  sunPosition: [30, 21, -105],
  hemiGround: 0x3f7a34,
  road: 0x3d4b63,
  roadEdge: 0xffd166,
  ground: 0x69c24a,
  banner: '#2f9e44',
};

/** The sunset coast: warm orange light, a low sun, water beside the lane. */
export const DISTRICT_COAST = {
  id: 'coast',
  name: 'SUNSET COAST',
  sky: 0xffb26b,
  fog: 0xffc98a,
  sunColor: 0xffd9a0,
  sunIntensity: 1.7,
  sunPosition: [-26, 7, -105],
  hemiGround: 0x8a5a33,
  road: 0x4a3f55,
  roadEdge: 0xff8c42,
  ground: 0x2e86ab,
  banner: '#ff8c42',
};

/** The neon night city: dark sky, glowing rails, lit towers. */
export const DISTRICT_CITY = {
  id: 'city',
  name: 'NEON NIGHT CITY',
  sky: 0x0b1026,
  fog: 0x1b2340,
  sunColor: 0x8ecae6,
  sunIntensity: 0.7,
  sunPosition: [18, 26, -105],
  hemiGround: 0x141a33,
  road: 0x1c2233,
  roadEdge: 0x22d3ee,
  ground: 0x11182b,
  banner: '#22d3ee',
};

/** Districts in travel order; the run cycles through them forever. */
export const DISTRICTS = [DISTRICT_VALLEY, DISTRICT_COAST, DISTRICT_CITY];

/**
 * Which district a given distance is in, and which lap of the cycle:
 * the lap count is the run's rising intensity — later laps keep the
 * speed and density the run has already earned.
 */
export function districtAtDistance(distance) {
  const leg = Math.floor(Math.max(0, distance) / DISTRICT_LENGTH);
  return {
    index: leg % DISTRICTS.length,
    lap: Math.floor(leg / DISTRICTS.length),
    district: DISTRICTS[leg % DISTRICTS.length],
  };
}
