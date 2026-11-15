// Starlane Courier — every tuning number the game runs on, in one place.
// The world logic (world.js), the renderer (render.js) and the screenshot
// scenes (shots.js) all read from here, so a balance change is one edit.

/** The three lanes the courier can ride, as world x positions. */
export const LANES = [-3.2, 0, 3.2];

/** How wide one lane feels for collision: half-extent of the rider. */
export const RIDER_HALF = 0.55;

/** Forward speed at the start of a run, in world units per second. */
export const SPEED_START = 19;
/** Forward speed the run ramps toward and never passes. */
export const SPEED_MAX = 44;
/** Speed gained per second survived. */
export const SPEED_RAMP = 0.32;

/** Sideways speed of a lane change, units per second. */
export const LANE_SPEED = 16;
/** Jump take-off velocity and gravity, units per second (squared). */
export const JUMP_VELOCITY = 11.5;
export const GRAVITY = 30;
/** How long a slide lasts and how low the rider ducks, seconds / units. */
export const SLIDE_SECONDS = 0.72;
export const RIDER_HEIGHT = 1.15;
export const RIDER_DUCKED = 0.55;

/** Distance between spawn rows early on, shrinking as speed grows. */
export const ROW_GAP_START = 26;
export const ROW_GAP_MIN = 15;

/** Scoring: one point per metre, stars pay out through the combo. */
export const STAR_POINTS = 25;
export const COMBO_MAX = 8;
/** Seconds of grace after a shield saves the rider. */
export const SHIELD_GRACE = 2.0;

/** How far ahead of the rider the world is kept populated. */
export const SPAWN_AHEAD = 150;
/** How far behind the rider the world may be forgotten. */
export const DESPAWN_BEHIND = 24;

/** Fixed simulation step: the game never integrates a bigger slice. */
export const STEP = 1 / 120;

/** Bright low-poly palette, shared by renderer and page furniture. */
export const COLORS = {
  sky: 0x8fd8ff,
  fog: 0xaee3ff,
  road: 0x3d4b63,
  roadEdge: 0xffd166,
  grass: 0x69c24a,
  hill: 0x4da653,
  trunk: 0x8a5a33,
  leafA: 0x2f9e44,
  leafB: 0xff8fab,
  cloud: 0xffffff,
  rider: 0xff5d5d,
  riderTrim: 0xffe066,
  barrier: 0xff922b,
  barrierStripe: 0xfff3bf,
  beam: 0x845ef7,
  gate: 0xfa5252,
  star: 0xffd43b,
  shield: 0x3bc9db,
};
