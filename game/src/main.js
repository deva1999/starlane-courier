// Starlane Courier — the game itself: it owns the screens (title, play,
// pause, game over), runs the world at a fixed step, turns world events
// into sound, sparks and HUD feedback, and answers the page's buttons.
// The rules live in world.js, the pictures in render.js; this file is
// only the conductor.

import { LANES, MARKER_EVERY, SPEED_MAX, STEP, STREAK_SPEED } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createScene } from './render.js';
import { buildShotWorld, createAutopilot } from './shots.js';
import {
  EVENT_BOOST, EVENT_CRASH, EVENT_DELIVERY, EVENT_DELIVERY_MISS, EVENT_JUMP,
  EVENT_LAND, EVENT_NEAR, EVENT_RAMP, EVENT_SHIELD, EVENT_SHIELD_BREAK,
  EVENT_SLIDE, EVENT_STAR, createWorld, jump, slide, steer, stepWorld,
} from './world.js';
import { DISTRICTS } from './districts.js';
import { metresToNextGate } from './deliveries.js';

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
  deliveries: document.getElementById('hud-deliveries'),
  gateDistance: document.getElementById('hud-gate-distance'),
  banner: document.getElementById('district-banner'),
};
const screens = {
  title: document.getElementById('title-screen'),
  over: document.getElementById('over-screen'),
  pause: document.getElementById('pause-screen'),
};

// Event feedback: edge flashes, floating score text, speed streaks and
// distance markers. Everything here is presentation only — it reads
// the world's events and fx queue, changes no rules, and is exposed on
// window.__FX__ so the playtest can prove each effect really fired.
const fxEls = {
  flash: document.getElementById('edge-flash'),
  floaters: document.getElementById('fx-floaters'),
  streaks: document.getElementById('speed-streaks'),
  marker: document.getElementById('distance-marker'),
  distance: document.getElementById('hud-distance'),
};
const fxState = {
  flashCount: 0,
  flashByKind: {},
  lastFlashKind: '',
  floaterCount: 0,
  lastFloaterText: '',
  markerCount: 0,
  lastMarker: 0,
  streakLevel: 0,
  districtChanges: 0,
  lastDistrictName: '',
  bannerCount: 0,
};
let flashTimer = null;
let markerTimer = null;
let bannerTimer = null;
let markerShownFor = 0;
let lastDistrictShown = -1;

/** Name the district the run has just entered, briefly, at the top. */
function showDistrictBanner(index) {
  const district = DISTRICTS[index];
  if (!district) return;
  fxState.districtChanges += 1;
  fxState.bannerCount += 1;
  fxState.lastDistrictName = district.name;
  hud.banner.textContent = district.name;
  hud.banner.style.borderColor = district.banner;
  hud.banner.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => hud.banner.classList.remove('show'), 2100);
}

/** Flash the frame's edge once: colour and strength depend on the event. */
function fireFlash(kind, rgb, strength) {
  fxState.flashCount += 1;
  fxState.flashByKind[kind] = (fxState.flashByKind[kind] ?? 0) + 1;
  fxState.lastFlashKind = kind;
  fxEls.flash.dataset.kind = kind;
  if (flashTimer) clearTimeout(flashTimer);
  fxEls.flash.style.transition = 'none';
  fxEls.flash.style.boxShadow = `inset 0 0 90px 26px rgba(${rgb}, ${strength})`;
  fxEls.flash.style.opacity = '1';
  void fxEls.flash.offsetWidth;
  fxEls.flash.style.transition = 'opacity .55s ease-out';
  fxEls.flash.style.opacity = '0';
  flashTimer = setTimeout(() => { fxEls.flash.dataset.kind = ''; }, 700);
}

/** A short-lived score text rising beside the rider, then gone. */
function spawnFloater(text, laneX, shield = false) {
  fxState.floaterCount += 1;
  fxState.lastFloaterText = text;
  const el = document.createElement('div');
  el.className = shield ? 'floater shield' : 'floater';
  el.textContent = text;
  // The camera follows the rider at 0.55 of its offset, so the rider
  // sits near the horizontal centre, shifted by just over half its x.
  el.style.left = `${50 + laneX * 3.1}%`;
  el.style.top = '56%';
  fxEls.floaters.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/** Turn the world's detailed fx queue into floaters (play screen only). */
function presentFx() {
  for (const entry of world.fx) {
    if (screen !== 'play') continue;
    if (entry.kind === 'star') spawnFloater(`+${entry.points}`, LANES[entry.lane]);
    else if (entry.kind === 'shield') spawnFloater('SHIELD UP', LANES[entry.lane], true);
    else if (entry.kind === 'delivery') spawnFloater(`DELIVERED +${entry.points}`, LANES[entry.lane], true);
    else if (entry.kind === 'deliverymiss') spawnFloater('MISSED GATE', LANES[entry.lane]);
    else if (entry.kind === 'boost') spawnFloater('BOOST!', LANES[entry.lane], true);
  }
  world.fx.length = 0;
}

/** Silence every transient effect (pause, title, game over). */
function clearFx(keepFlash = false) {
  fxEls.floaters.innerHTML = '';
  fxEls.streaks.style.opacity = '0';
  fxState.streakLevel = 0;
  fxEls.marker.classList.remove('show');
  hud.banner.classList.remove('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  if (!keepFlash) {
    if (flashTimer) clearTimeout(flashTimer);
    fxEls.flash.style.opacity = '0';
    fxEls.flash.dataset.kind = '';
  }
}
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
  // Transient feedback belongs to live play: floaters, streaks and
  // markers die with the screen change. A crash flash is the one
  // exception — it is the crash, already fading as results appear.
  if (name !== 'play') clearFx(name === 'over');
}

/** Start a fresh run from the title or the game-over screen. */
function beginRun() {
  audio.wake();
  world = createWorld((Date.now() & 0xffff) + 1);
  pilot = createAutopilot();
  lastComboShown = 1;
  markerShownFor = 0;
  lastDistrictShown = 0;
  clearFx();
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
  document.getElementById('final-deliveries').textContent = String(world.deliveries);
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
      view.addShake(0.32);
      view.burst(r.x + (r.x < 0 ? 1.4 : -1.4), 0.8, -0.5, 5, 0xf1f3f5);
      if (screen === 'play') fireFlash('near', '255, 255, 255', 0.5);
    } else if (event === EVENT_DELIVERY) {
      audio.delivery();
      view.burst(r.x, r.y + 1.4, -0.5, 26, 0x37e08b);
      if (screen === 'play') fireFlash('delivery', '55, 224, 139', 0.7);
    } else if (event === EVENT_DELIVERY_MISS) {
      audio.deliveryMiss();
      view.addShake(0.25);
      if (screen === 'play') fireFlash('deliverymiss', '255, 146, 43', 0.6);
    } else if (event === EVENT_BOOST) {
      audio.boost();
      view.burst(r.x, r.y + 0.6, 0.4, 18, 0x22d3ee);
    } else if (event === EVENT_RAMP) {
      audio.ramp();
      view.burst(r.x, r.y + 0.4, -0.5, 10, 0xff922b);
    } else if (event === EVENT_JUMP) audio.jump();
    else if (event === EVENT_SLIDE) audio.slide();
    else if (event === EVENT_SHIELD_BREAK) {
      audio.shieldBreak();
      view.addShake(0.7);
      view.burst(r.x, r.y + 0.8, -0.5, 22, 0x3bc9db);
      if (screen === 'play') fireFlash('shieldbreak', '59, 201, 219', 0.85);
    } else if (event === EVENT_CRASH) {
      audio.crash();
      view.addShake(1);
      view.burst(r.x, r.y + 0.8, -0.5, 30, 0xff5d5d);
      if (screen === 'play') fireFlash('crash', '255, 70, 70', 0.95);
    }
  }
  world.events.length = 0;
  presentFx();
}

/** Refresh the HUD numbers from the world state. */
function presentHud() {
  hud.score.textContent = String(Math.floor(world.score));
  hud.stars.textContent = String(world.stars);
  hud.deliveries.textContent = String(world.deliveries);
  hud.gateDistance.textContent = String(metresToNextGate(world));
  const pace = world.effectiveSpeed ?? world.speed;
  hud.speed.textContent = `${Math.round(pace * 3.6)} km/h`;
  fxEls.distance.textContent = `${Math.floor(world.distance)} m`;
  // A district boundary crossed in live play gets its banner; the
  // title screen's attract world crosses them silently.
  if (screen === 'play' && world.districtIndex !== lastDistrictShown) {
    lastDistrictShown = world.districtIndex;
    showDistrictBanner(world.districtIndex);
  }
  hud.shield.classList.toggle('hidden', !world.shield);
  if (world.combo !== lastComboShown) {
    lastComboShown = world.combo;
    hud.combo.textContent = `COMBO ×${world.combo}`;
    hud.combo.classList.remove('pop');
    void hud.combo.offsetWidth;
    hud.combo.classList.add('pop');
  }
  hud.combo.classList.toggle('hidden', world.combo <= 1);

  // Speed streaks fade in with pace and exist only in live play; a
  // boost burst forces them to full stretch for its duration.
  const level = screen === 'play'
    ? Math.max(
      Math.min(1, Math.max(0, (pace - STREAK_SPEED) / (SPEED_MAX - STREAK_SPEED))),
      world.boost > 0 ? 1 : 0,
    )
    : 0;
  fxState.streakLevel = level;
  fxEls.streaks.style.opacity = String(Math.round(level * 0.9 * 100) / 100);

  // A distance marker pill each MARKER_EVERY metres, gone in ~1.5 s.
  const marker = Math.floor(world.distance / MARKER_EVERY) * MARKER_EVERY;
  if (screen === 'play' && marker > 0 && marker > markerShownFor) {
    markerShownFor = marker;
    fxState.markerCount += 1;
    fxState.lastMarker = marker;
    fxEls.marker.textContent = `${marker} m`;
    fxEls.marker.classList.add('show');
    if (markerTimer) clearTimeout(markerTimer);
    markerTimer = setTimeout(() => fxEls.marker.classList.remove('show'), 1500);
  }
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
    document.getElementById('final-deliveries').textContent = String(world.deliveries);
    document.getElementById('final-best').textContent = String(Math.max(best, score));
  }
  lastDistrictShown = world.districtIndex;
  showScreen(shot.screen);
  // A screenshot is a settled frame, not a moment in a run: distance
  // already covered must not pop a marker pill into the picture.
  markerShownFor = Math.floor(world.distance / MARKER_EVERY) * MARKER_EVERY;
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
window.__FX__ = fxState;
window.render_game_to_text = () => JSON.stringify({
  coords: 'x right, y up, z toward the camera; the rider rides at z=0 and rows approach from -z',
  screen,
  mode: world.mode,
  score: Math.floor(world.score),
  stars: world.stars,
  combo: world.combo,
  bestCombo: world.bestCombo,
  shield: world.shield,
  speed: Math.round(world.speed * 10) / 10,
  effectiveSpeed: Math.round((world.effectiveSpeed ?? world.speed) * 10) / 10,
  distance: Math.floor(world.distance),
  district: DISTRICTS[world.districtIndex]?.id ?? 'valley',
  districtIndex: world.districtIndex,
  districtLap: world.districtLap,
  deliveries: world.deliveries,
  gateIn: metresToNextGate(world),
  gates: (world.gates ?? []).map((gate) => ({
    targetLane: gate.targetLane, z: Math.round(gate.z * 10) / 10, resolved: gate.resolved,
  })),
  pads: (world.pads ?? []).filter((pad) => !pad.taken).length,
  boost: Math.round(world.boost * 100) / 100,
  fx: {
    flashCount: fxState.flashCount,
    flashByKind: fxState.flashByKind,
    lastFlashKind: fxState.lastFlashKind,
    floaterCount: fxState.floaterCount,
    lastFloaterText: fxState.lastFloaterText,
    markerCount: fxState.markerCount,
    lastMarker: fxState.lastMarker,
    streakLevel: Math.round(fxState.streakLevel * 100) / 100,
    flashKind: fxEls.flash.dataset.kind ?? '',
    floaterDom: fxEls.floaters.childElementCount,
    markerShown: fxEls.marker.classList.contains('show'),
    markerText: fxEls.marker.textContent,
    districtChanges: fxState.districtChanges,
    lastDistrictName: fxState.lastDistrictName,
    bannerShown: hud.banner.classList.contains('show'),
    bannerText: hud.banner.textContent,
  },
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
    .map((row) => ({
      kind: row.kind, lane: row.lane, z: Math.round(row.z * 10) / 10,
      ...(row.droneX !== undefined ? { droneX: Math.round(row.droneX * 100) / 100 } : {}),
    })),
  pickups: world.pickups.filter((item) => !item.taken && item.z > -45 && item.z < 6).length,
});
window.advanceTime = (ms) => {
  advance(ms / 1000);
  presentHud();
  view.draw(world, 0);
  return Promise.resolve();
};
