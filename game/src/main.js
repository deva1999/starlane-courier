// Starlane Courier — the game itself: it owns the screens (title, play,
// pause, game over), runs the world at a fixed step, turns world events
// into sound, sparks and HUD feedback, and answers the page's buttons.
// The rules live in world.js, the pictures in render.js; this file is
// only the conductor.

import { LANES, STEP } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createScene } from './render.js';
import { buildShotWorld, createAutopilot } from './shots.js';
import {
  EVENT_CRASH, EVENT_JUMP, EVENT_LAND, EVENT_NEAR, EVENT_SHIELD,
  EVENT_SHIELD_BREAK, EVENT_SLIDE, EVENT_STAR, createWorld, jump, slide,
  steer, stepWorld,
} from './world.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 1) || 1;

const canvas = document.getElementById('game');
const view = createScene(canvas);
const input = createInput(window);
const audio = createAudio();

const hud = {
  root: document.getElementById('hud'),
  score: document.getElementById('hud-score'),
  stars: document.getElementById('hud-stars'),
  combo: document.getElementById('hud-combo'),
  speed: document.getElementById('hud-speed'),
  shield: document.getElementById('hud-shield'),
};
const screens = {
  title: document.getElementById('title-screen'),
  over: document.getElementById('over-screen'),
  pause: document.getElementById('pause-screen'),
};
const BEST_KEY = 'starlane-courier-best';

let screen = 'title';
let world = createWorld((Date.now() & 0xffff) + 1);
let pilot = createAutopilot();
let best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
let lastComboShown = 1;
const eventLog = [];

document.getElementById('title-best').textContent = String(best);
document.getElementById('start-button').addEventListener('click', () => input.press('confirm'));
document.getElementById('restart-button').addEventListener('click', () => input.press('confirm'));
document.getElementById('mute-button').addEventListener('click', () => input.press('mute'));

/** Show exactly one screen overlay (or none, while playing). */
function showScreen(name) {
  screen = name;
  screens.title.classList.toggle('hidden', name !== 'title');
  screens.over.classList.toggle('hidden', name !== 'over');
  screens.pause.classList.toggle('hidden', name !== 'pause');
  hud.root.classList.toggle('hidden', name === 'title');
}

/** Start a fresh run from the title or the game-over screen. */
function beginRun() {
  audio.wake();
  world = createWorld((Date.now() & 0xffff) + 1);
  pilot = createAutopilot();
  lastComboShown = 1;
  audio.startMusic();
  showScreen('play');
}

/** The run has ended: record the best, fill the results, show them. */
function finishRun() {
  audio.stopMusic();
  const score = Math.floor(world.score);
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  document.getElementById('final-score').textContent = String(score);
  document.getElementById('final-stars').textContent = String(world.stars);
  document.getElementById('final-distance').textContent = `${Math.floor(world.distance)} m`;
  document.getElementById('final-combo').textContent = `×${world.bestCombo}`;
  document.getElementById('final-best').textContent = String(best);
  showScreen('over');
}

/** Turn the world's events into sound, sparks and camera feel. */
function presentEvents() {
  for (const event of world.events) {
    eventLog.push(event);
    if (eventLog.length > 200) eventLog.shift();
    const r = world.rider;
    if (event === EVENT_STAR) {
      audio.star(world.combo);
      view.burst(r.x, r.y + 1, -0.5, 10, 0xffd43b);
    } else if (event === EVENT_SHIELD) {
      audio.shield();
      view.burst(r.x, r.y + 1, -0.5, 14, 0x3bc9db);
    } else if (event === EVENT_NEAR) {
      audio.near();
      view.burst(r.x + (r.x < 0 ? 1.4 : -1.4), 0.8, -0.5, 5, 0xf1f3f5);
    } else if (event === EVENT_JUMP) audio.jump();
    else if (event === EVENT_SLIDE) audio.slide();
    else if (event === EVENT_SHIELD_BREAK) {
      audio.shieldBreak();
      view.addShake(0.7);
      view.burst(r.x, r.y + 0.8, -0.5, 22, 0x3bc9db);
    } else if (event === EVENT_CRASH) {
      audio.crash();
      view.addShake(1);
      view.burst(r.x, r.y + 0.8, -0.5, 30, 0xff5d5d);
    }
  }
  world.events.length = 0;
}

/** Refresh the HUD numbers from the world state. */
function presentHud() {
  hud.score.textContent = String(Math.floor(world.score));
  hud.stars.textContent = String(world.stars);
  hud.speed.textContent = `${Math.round(world.speed * 3.6)} km/h`;
  hud.shield.classList.toggle('hidden', !world.shield);
  if (world.combo !== lastComboShown) {
    lastComboShown = world.combo;
    hud.combo.textContent = `COMBO ×${world.combo}`;
    hud.combo.classList.remove('pop');
    void hud.combo.offsetWidth;
    hud.combo.classList.add('pop');
  }
  hud.combo.classList.toggle('hidden', world.combo <= 1);
}

/** Apply one queued input action to whatever screen is showing. */
function applyAction(action) {
  if (action === 'mute') {
    audio.wake();
    const muted = audio.toggleMute();
    document.getElementById('mute-button').textContent = muted ? '🔇' : '🔊';
    return;
  }
  if (screen === 'title' || screen === 'over') {
    if (action === 'confirm' || action === 'jump') beginRun();
    return;
  }
  if (action === 'pause') {
    if (screen === 'play') {
      audio.stopMusic();
      showScreen('pause');
    } else if (screen === 'pause') {
      audio.startMusic();
      showScreen('play');
    }
    return;
  }
  if (screen !== 'play') return;
  if (action === 'left') steer(world, -1);
  else if (action === 'right') steer(world, 1);
  else if (action === 'jump') jump(world);
  else if (action === 'slide') slide(world);
}

/** Advance the simulation by dt seconds of game time (fixed steps). */
function advance(dt) {
  let remaining = dt;
  while (remaining > 0) {
    const slice = Math.min(STEP, remaining);
    if (screen === 'title') {
      pilot(world);
      stepWorld(world, slice);
      if (world.mode !== 'play') {
        world = createWorld((Date.now() & 0xffff) + 7);
        pilot = createAutopilot();
      }
    } else if (screen === 'play') {
      stepWorld(world, slice);
      if (world.mode === 'over') {
        presentEvents();
        finishRun();
        return;
      }
    }
    remaining -= slice;
  }
  presentEvents();
}

// The live loop: real time in, fixed steps through advance(), one draw.
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  let action;
  while ((action = input.next()) !== null) applyAction(action);
  if (screen !== 'pause') advance(dt);
  presentHud();
  view.draw(world, screen === 'pause' ? 0 : dt);
  requestAnimationFrame(frame);
}

function fitCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * Math.min(window.devicePixelRatio, 2));
  canvas.height = Math.floor(height * Math.min(window.devicePixelRatio, 2));
  view.resize(width, height);
}
window.addEventListener('resize', fitCanvas);

// Screenshot scenes: build the named world, put its screen up, settle a
// few frames so poses and HUD are final, then flag readiness.
fitCanvas();
if (shotName) {
  const shot = buildShotWorld(shotName, shotSeed);
  world = shot.state;
  if (shot.screen === 'over') {
    const score = Math.floor(world.score);
    document.getElementById('final-score').textContent = String(score);
    document.getElementById('final-stars').textContent = String(world.stars);
    document.getElementById('final-distance').textContent = `${Math.floor(world.distance)} m`;
    document.getElementById('final-combo').textContent = `×${world.bestCombo}`;
    document.getElementById('final-best').textContent = String(Math.max(best, score));
  }
  showScreen(shot.screen);
  presentHud();
  for (let i = 0; i < 4; i += 1) view.draw(world, 1 / 60);
  window.__SHOT_READY__ = true;
} else {
  showScreen('title');
  requestAnimationFrame(frame);
}

// Hooks for automated playtests (game-qa): state out, time forward.
window.__GAME__ = {
  beginRun,
  get screen() { return screen; },
};
Object.defineProperty(window, '__GAME_STATE__', { get: () => world });
window.__EVENTS__ = eventLog;
window.render_game_to_text = () => JSON.stringify({
  coords: 'x right, y up, z toward the camera; the rider rides at z=0 and rows approach from -z',
  screen,
  mode: world.mode,
  score: Math.floor(world.score),
  stars: world.stars,
  combo: world.combo,
  shield: world.shield,
  speed: Math.round(world.speed * 10) / 10,
  distance: Math.floor(world.distance),
  rider: {
    lane: world.rider.lane,
    x: Math.round(world.rider.x * 100) / 100,
    y: Math.round(world.rider.y * 100) / 100,
    grounded: world.rider.grounded,
    sliding: world.rider.sliding > 0,
  },
  lanes: LANES,
  rows: world.rows
    .filter((row) => row.z > -45 && row.z < 6)
    .map((row) => ({ kind: row.kind, lane: row.lane, z: Math.round(row.z * 10) / 10 })),
  pickups: world.pickups.filter((item) => !item.taken && item.z > -45 && item.z < 6).length,
});
window.advanceTime = (ms) => {
  advance(ms / 1000);
  presentHud();
  view.draw(world, 0);
  return Promise.resolve();
};
