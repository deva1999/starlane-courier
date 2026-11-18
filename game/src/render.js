// Starlane Courier — everything the player sees, drawn with three.js.
// The renderer owns no rules: each frame it reads the world state from
// world.js and poses pooled meshes to match, so the same state always
// draws the same picture. Scenery is a pure function of distance
// travelled, which keeps even the decoration reproducible.

import * as THREE from 'three';
import { BOOST_SECONDS, COLORS, LANES, SPEED_MAX, SPEED_START } from './config.js';
import { KIND_BARRIER, KIND_BEAM, KIND_GATE, KIND_RAMP } from './world.js';
import { KIND_DRONE } from './drones.js';
import { DISTRICTS } from './districts.js';
import { makeRandom } from './random.js';

const SCENERY_SPAN = 190;
const SCENERY_COUNT = 88;
/** Camera anchor: low and close, so the rider fills the lower frame. */
const CAMERA_Y = 2.95;
const CAMERA_Z = 6.3;
const CAMERA_FOV = 66;

function flat(color, extra = {}) {
  // Lambert, not Standard: the same flat-shaded low-poly look at a
  // fraction of the fragment cost, which keeps weak GPUs (and software
  // renderers) at a smooth frame rate.
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

/** A low-poly tree: a trunk and a coloured blob of leaves. */
function makeTree(leafColor) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 6), flat(COLORS.trunk));
  trunk.position.y = 0.55;
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 0), flat(leafColor));
  leaves.position.y = 1.9;
  leaves.scale.y = 1.25;
  tree.add(trunk, leaves);
  return tree;
}

/** A rounded bush: one squashed blob, no trunk. */
function makeBush(color) {
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), flat(color));
  bush.scale.y = 0.78;
  return bush;
}

/** A glowing crystal shard, the valley's one bit of jewellery. */
function makeCrystal(color) {
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    flat(color, { emissive: color, emissiveIntensity: 0.55 }),
  );
  crystal.scale.y = 1.7;
  return crystal;
}

/**
 * A floating grass islet at road level, carrying one small planting.
 * These hug the lane's edge, so the roadside reads busy and close
 * instead of empty valley stretching to the horizon.
 */
function makeIslet(planting) {
  const islet = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.55, 3.1), flat(COLORS.grass));
  base.position.y = -0.28;
  const underside = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.5, 4), flat(0x8a6b4a));
  underside.rotation.x = Math.PI;
  underside.rotation.y = Math.PI / 4;
  underside.position.y = -1.25;
  islet.add(base, underside);
  planting.position.y = planting.userData.groundY ?? 0.02;
  islet.add(planting);
  return islet;
}

/** A puffy cloud of three flattened spheres, unlit so it stays white. */
function makeCloud() {
  const cloud = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: COLORS.cloud });
  for (const [x, s] of [[-1.4, 0.8], [0, 1.15], [1.5, 0.9]]) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), material);
    puff.position.x = x;
    puff.scale.y = 0.55;
    cloud.add(puff);
  }
  return cloud;
}

/** The rider: a red hover-scooter with a helmeted courier on top. */
function makeRider() {
  const rider = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.34, 1.8), flat(COLORS.rider));
  body.position.y = 0.32;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6), flat(COLORS.rider));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.34, -1.25);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.1, 0.5), flat(COLORS.riderTrim, { emissive: COLORS.riderTrim, emissiveIntensity: 0.35 }));
  trim.position.set(0, 0.52, 0.45);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), flat(0x2b6cb0));
  torso.position.set(0, 0.85, 0.28);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), flat(0xf8f9fa));
  helmet.position.set(0, 1.32, 0.22);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), flat(0x1a202c));
  visor.position.set(0, 1.34, -0.05);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.3), flat(COLORS.star, { emissive: COLORS.star, emissiveIntensity: 0.25 }));
  pack.position.set(0, 0.92, 0.62);
  rider.add(body, nose, trim, torso, helmet, visor, pack);
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.6, 8),
      new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.75 }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0.3 * side, 0.3, 1.2);
    glow.name = 'thruster';
    rider.add(glow);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 20),
    new THREE.MeshBasicMaterial({ color: 0x10233a, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.name = 'shadow';
  rider.add(shadow);
  return rider;
}

/** One pooled obstacle mesh per kind. */
function makeBarrier() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 0.5), flat(COLORS.barrier));
  box.position.y = 0.48;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.2, 0.54), flat(COLORS.barrierStripe, { emissive: 0xfff3bf, emissiveIntensity: 0.2 }));
  stripe.position.y = 0.62;
  const stripe2 = stripe.clone();
  stripe2.position.y = 0.3;
  group.add(box, stripe, stripe2);
  return group;
}

function makeGate() {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 0.7), flat(0x495057));
  post.position.y = 1.7;
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 1.1, 0.76),
    flat(COLORS.gate, { emissive: COLORS.gate, emissiveIntensity: 0.8 }),
  );
  core.position.y = 2.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), flat(0x343a40));
  base.position.y = 0.12;
  group.add(post, core, base);
  return group;
}

function makeBeam() {
  const group = new THREE.Group();
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(10.6, 0.62, 0.5),
    flat(COLORS.beam, { emissive: COLORS.beam, emissiveIntensity: 0.55 }),
  );
  bar.position.y = 1.34;
  group.add(bar);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 0.45), flat(0x495057));
    post.position.set(5.1 * side, 0.85, 0);
    group.add(post);
  }
  return group;
}

function makeStar() {
  const star = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 0),
    flat(COLORS.star, { emissive: COLORS.star, emissiveIntensity: 0.65 }),
  );
  return star;
}

/** A delivery gate: posts and a top bar spanning the whole lane, with
 * a glowing marker panel hanging over the one lane that pays. The
 * marker is named so the draw can slide it to the gate's target lane. */
function makeDeliveryGate() {
  const group = new THREE.Group();
  const postMaterial = flat(0x2b3444);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.6, 0.42), postMaterial);
    post.position.set(5.3 * side, 1.8, 0);
    group.add(post);
  }
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(11.2, 0.5, 0.5),
    flat(0xffd43b, { emissive: 0xffd43b, emissiveIntensity: 0.55 }),
  );
  bar.position.y = 3.55;
  group.add(bar);
  const marker = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 1.15, 0.24),
    flat(0x37e08b, { emissive: 0x37e08b, emissiveIntensity: 0.95 }),
  );
  panel.position.y = 2.75;
  const chevron = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 0.9, 4),
    flat(0x37e08b, { emissive: 0x37e08b, emissiveIntensity: 0.95 }),
  );
  chevron.rotation.x = Math.PI;
  chevron.position.y = 1.85;
  marker.add(panel, chevron);
  marker.name = 'marker';
  group.add(marker);
  return group;
}

/** A boost pad: a flat chevron strip flush with the deck. */
function makeBoostPad() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.07, 3.4),
    flat(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 0.75 }),
  );
  base.position.y = 0.05;
  group.add(base);
  for (const i of [-1, 0, 1]) {
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.0, 4),
      flat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5 }),
    );
    chevron.rotation.x = -Math.PI / 2;
    chevron.rotation.y = Math.PI / 4;
    chevron.position.set(0, 0.12, i * 1.05);
    group.add(chevron);
  }
  return group;
}

/** A ramp: an orange wedge slab the courier rides up and off. */
function makeRamp() {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 3.6), flat(COLORS.barrier));
  slab.rotation.x = 0.42;
  slab.position.y = 0.72;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.44, 0.1, 0.7),
    flat(COLORS.barrierStripe, { emissive: 0xfff3bf, emissiveIntensity: 0.25 }),
  );
  stripe.rotation.x = 0.42;
  stripe.position.set(0, 1.18, -0.7);
  const support = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.15, 0.4), flat(0x495057));
  support.position.set(0, 0.55, 1.35);
  group.add(slab, stripe, support);
  return group;
}

/** A security drone: a dark hover body, one red eye, a rotor ring. */
function makeDrone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), flat(0x343a40));
  body.scale.y = 0.62;
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    flat(COLORS.gate, { emissive: COLORS.gate, emissiveIntensity: 1.0 }),
  );
  eye.position.set(0, -0.02, 0.5);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.07, 8, 22),
    flat(0x868e96, { emissive: 0xfa5252, emissiveIntensity: 0.25 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.28;
  group.add(body, eye, ring);
  group.position.y = 1.45;
  return group;
}

function makeShieldOrb() {
  const group = new THREE.Group();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 12),
    flat(COLORS.shield, { emissive: COLORS.shield, emissiveIntensity: 0.7 }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.07, 8, 20),
    flat(0xe3fafc, { emissive: 0xe3fafc, emissiveIntensity: 0.4 }),
  );
  group.add(orb, ring);
  return group;
}

/** Create the whole stage on a canvas. Draw it with draw(state, dt). */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 42, 148);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);

  const hemi = new THREE.HemisphereLight(0xcfefff, 0x3f7a34, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
  sun.position.set(7, 14, 5);
  scene.add(sun);
  const sunBall = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), new THREE.MeshBasicMaterial({ color: 0xffe28a, fog: false }));
  sunBall.position.set(30, 21, -105);
  scene.add(sunBall);

  // The floating road: a long deck, glowing rails, and scrolling dashes.
  // The materials are kept by name because the district palette
  // recolours them as the run crosses each boundary.
  const roadMaterial = flat(COLORS.road);
  const road = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.5, 320), roadMaterial);
  road.position.set(0, -0.26, -140);
  scene.add(road);
  const railMaterial = flat(COLORS.roadEdge, { emissive: COLORS.roadEdge, emissiveIntensity: 0.5 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 320), railMaterial);
    rail.position.set(5.55 * side, 0.12, -140);
    scene.add(rail);
  }
  const dashes = [];
  const dashGeometry = new THREE.BoxGeometry(0.16, 0.04, 2.2);
  const dashMaterial = flat(0xf1f3f5, { emissive: 0xffffff, emissiveIntensity: 0.15 });
  for (let i = 0; i < 26; i += 1) {
    for (const x of [-1.6, 1.6]) {
      const dash = new THREE.Mesh(dashGeometry, dashMaterial);
      dash.position.set(x, 0.03, -i * 7.4);
      scene.add(dash);
      dashes.push(dash);
    }
  }

  // Trackside light posts in pairs, spaced to fill the same wrap span
  // as the scenery: a steady rhythm of lamps at the road's edge sells
  // the speed and frames the lane the rider has to read.
  const posts = [];
  const postPoleMaterial = flat(0x343a40);
  const postLampMaterial = flat(COLORS.roadEdge, { emissive: COLORS.roadEdge, emissiveIntensity: 0.9 });
  for (let i = 0; i < 10; i += 1) {
    for (const side of [-1, 1]) {
      const post = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.25, 0.14), postPoleMaterial);
      pole.position.y = 0.62;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), postLampMaterial);
      lamp.position.y = 1.32;
      post.add(pole, lamp);
      post.position.x = 6.25 * side;
      scene.add(post);
      posts.push({ mesh: post, baseZ: -i * (SCENERY_SPAN / 10) });
    }
  }

  // Valley floor far below, and scenery whose place is a function of
  // distance: item i sits at wrap(baseZ - distance), so any frame can be
  // rebuilt exactly from the run's numbers alone.
  const groundMaterial = flat(COLORS.grass);
  const valley = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMaterial);
  valley.rotation.x = -Math.PI / 2;
  valley.position.set(0, -7, -160);
  scene.add(valley);
  const sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);
  const sceneryRandom = makeRandom(20261);
  const scenery = [];
  for (let i = 0; i < SCENERY_COUNT; i += 1) {
    const band = sceneryRandom();
    const side = sceneryRandom() < 0.5 ? -1 : 1;
    let item;
    let x;
    let y;
    let spin = (sceneryRandom() - 0.5) * 0.15;
    if (band < 0.44) {
      // Near band: floating islets at road level, just outside the
      // rails — close enough to feel the speed, never over the lane.
      const pick = sceneryRandom();
      let planting;
      if (pick < 0.45) {
        planting = makeTree(sceneryRandom() < 0.75 ? COLORS.leafA : COLORS.leafB);
        planting.scale.setScalar(0.72);
      } else if (pick < 0.78) {
        planting = makeBush(sceneryRandom() < 0.7 ? COLORS.leafA : COLORS.leafB);
        planting.userData.groundY = 0.5;
      } else {
        planting = makeCrystal(sceneryRandom() < 0.5 ? COLORS.shield : 0xff8fab);
        planting.userData.groundY = 0.3;
      }
      item = makeIslet(planting);
      x = side * (7.7 + sceneryRandom() * 3.4);
      y = -0.55 - sceneryRandom() * 0.5;
      spin = 0;
    } else if (band < 0.8) {
      // Mid band down on the valley floor: trees and hills as before,
      // but starting nearer the road so the middle ground is populated.
      const kind = sceneryRandom();
      if (kind < 0.55) item = makeTree(sceneryRandom() < 0.75 ? COLORS.leafA : COLORS.leafB);
      else {
        item = new THREE.Mesh(new THREE.ConeGeometry(3.2 + sceneryRandom() * 2.4, 5 + sceneryRandom() * 4, 7), flat(COLORS.hill));
      }
      x = side * (11.5 + sceneryRandom() * 26);
      y = kind < 0.55 ? -7 : -7 + 1.8;
    } else {
      item = makeCloud();
      x = (sceneryRandom() - 0.5) * 90;
      y = 10 + sceneryRandom() * 8;
    }
    item.userData = { baseZ: -sceneryRandom() * SCENERY_SPAN, x, y, spin };
    item.position.y = y;
    item.rotation.y = sceneryRandom() * Math.PI * 2;
    const scale = 0.85 + sceneryRandom() * 0.9;
    item.scale.setScalar(band >= 0.8 ? 1.3 : scale);
    sceneryGroup.add(item);
    scenery.push(item);
  }

  // The coast's own roadside: sandy islets with palms, sitting on the
  // water the ground plane becomes in that district. They scroll on
  // the same wrap as the valley scenery and show only at the coast.
  const coastGroup = new THREE.Group();
  coastGroup.visible = false;
  scene.add(coastGroup);
  const coastItems = [];
  const coastRandom = makeRandom(77003);
  for (let i = 0; i < 12; i += 1) {
    const isle = new THREE.Group();
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 0.7, 9), flat(0xf4d58d));
    sand.position.y = -0.35;
    const palm = makeTree(0x2f9e44);
    palm.rotation.z = (coastRandom() - 0.5) * 0.35;
    isle.add(sand, palm);
    const side = coastRandom() < 0.5 ? -1 : 1;
    isle.position.set(side * (10 + coastRandom() * 14), -6.4, 0);
    isle.userData = { baseZ: -coastRandom() * SCENERY_SPAN, x: isle.position.x, y: -6.4 };
    coastGroup.add(isle);
    coastItems.push(isle);
  }

  // The night city's roadside: dark towers with lit windows, close to
  // the lane, scrolling past like streetlights made of buildings.
  const cityGroup = new THREE.Group();
  cityGroup.visible = false;
  scene.add(cityGroup);
  const cityItems = [];
  const cityRandom = makeRandom(41502);
  const towerMaterial = flat(0x232946);
  const windowMaterials = [
    flat(0xffd166, { emissive: 0xffd166, emissiveIntensity: 0.9 }),
    flat(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 0.9 }),
    flat(0xff8fab, { emissive: 0xff8fab, emissiveIntensity: 0.8 }),
  ];
  for (let i = 0; i < 16; i += 1) {
    const tower = new THREE.Group();
    const height = 6 + cityRandom() * 13;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, height, 3.4), towerMaterial);
    body.position.y = height / 2 - 7;
    tower.add(body);
    for (let wnd = 0; wnd < 5; wnd += 1) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.32, 3.5),
        windowMaterials[Math.floor(cityRandom() * windowMaterials.length)],
      );
      strip.position.y = -5 + cityRandom() * (height - 3);
      tower.add(strip);
    }
    const side = i % 2 === 0 ? -1 : 1;
    tower.position.set(side * (9.5 + cityRandom() * 9), 0, 0);
    tower.userData = { baseZ: -i * (SCENERY_SPAN / 16) - cityRandom() * 6, x: tower.position.x, y: 0 };
    cityGroup.add(tower);
    cityItems.push(tower);
  }

  const rider = makeRider();
  rider.scale.set(1.14, 1, 1.14);
  scene.add(rider);
  const riderShadow = rider.getObjectByName('shadow');
  const thrusters = [];
  rider.traverse((child) => { if (child.name === 'thruster') thrusters.push(child); });

  // Pools: enough meshes for the densest stretch of road.
  const pools = {
    [KIND_BARRIER]: [],
    [KIND_GATE]: [],
    [KIND_BEAM]: [],
    [KIND_RAMP]: [],
    [KIND_DRONE]: [],
    star: [],
    shield: [],
    deliveryGate: [],
    boostPad: [],
  };
  const makers = {
    [KIND_BARRIER]: makeBarrier,
    [KIND_GATE]: makeGate,
    [KIND_BEAM]: makeBeam,
    [KIND_RAMP]: makeRamp,
    [KIND_DRONE]: makeDrone,
    star: makeStar,
    shield: makeShieldOrb,
    deliveryGate: makeDeliveryGate,
    boostPad: makeBoostPad,
  };
  for (const kind of Object.keys(pools)) {
    const count = kind === 'star' ? 40 : kind === 'deliveryGate' ? 3 : kind === 'boostPad' ? 10 : 14;
    for (let i = 0; i < count; i += 1) {
      const mesh = makers[kind]();
      mesh.visible = false;
      scene.add(mesh);
      pools[kind].push(mesh);
    }
  }

  // Particles: one Points cloud, recycled bursts.
  const PARTICLES = 160;
  const positions = new Float32Array(PARTICLES * 3);
  const particleData = [];
  for (let i = 0; i < PARTICLES; i += 1) {
    particleData.push({ life: 0, vx: 0, vy: 0, vz: 0 });
    positions[i * 3 + 1] = -100;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({ color: 0xffe066, size: 0.32, transparent: true, opacity: 0.95 });
  const particleCloud = new THREE.Points(particleGeometry, particleMaterial);
  particleCloud.frustumCulled = false;
  scene.add(particleCloud);
  let particleCursor = 0;

  let shake = 0;
  let prevRiderX = 0;
  let elapsed = 0;
  let lastDistrictIndex = -1;

  /** Spray a burst of sparks at a point (pickup, near miss, crash). */
  function burst(x, y, z, count, color) {
    particleMaterial.color.setHex(color);
    for (let n = 0; n < count; n += 1) {
      const i = particleCursor;
      particleCursor = (particleCursor + 1) % PARTICLES;
      const data = particleData[i];
      data.life = 0.55 + Math.random() * 0.3;
      data.vx = (Math.random() - 0.5) * 5;
      data.vy = Math.random() * 4.5 + 1;
      data.vz = (Math.random() - 0.5) * 5;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
  }

  /** Pose every pooled mesh from the world state, then render. */
  function draw(state, dt) {
    elapsed += dt;
    const r = state.rider;
    const lateral = dt > 0 ? (r.x - prevRiderX) / dt : 0;
    prevRiderX = r.x;

    const hover = r.grounded ? 0.34 + Math.sin(elapsed * 3.2) * 0.045 : 0.34;
    rider.position.set(r.x, r.y + hover, 0);
    rider.rotation.z = THREE.MathUtils.clamp(-lateral * 0.028, -0.5, 0.5);
    rider.rotation.x = THREE.MathUtils.clamp(-r.vy * 0.016, -0.3, 0.35);
    const duck = r.sliding > 0 ? 0.6 : 1;
    rider.scale.y += (duck - rider.scale.y) * Math.min(1, dt * 18);
    riderShadow.position.y = -r.y - hover + 0.02;
    riderShadow.material.opacity = Math.max(0.08, 0.3 - r.y * 0.06);
    const flicker = 0.85 + Math.sin(elapsed * 41) * 0.15;
    for (const glow of thrusters) glow.scale.set(1, 1, flicker);

    const used = {
      [KIND_BARRIER]: 0, [KIND_GATE]: 0, [KIND_BEAM]: 0, [KIND_RAMP]: 0,
      [KIND_DRONE]: 0, star: 0, shield: 0, deliveryGate: 0, boostPad: 0,
    };
    for (const row of state.rows) {
      const pool = pools[row.kind];
      if (!pool) continue;
      const index = used[row.kind];
      used[row.kind] += 1;
      if (index >= pool.length) continue;
      const mesh = pool[index];
      mesh.visible = true;
      if (row.kind === KIND_DRONE) {
        // The drone hovers and bobs over the x its drift has reached.
        mesh.position.set(row.droneX, 1.45 + Math.sin(elapsed * 5 + row.z * 0.4) * 0.12, row.z);
      } else {
        mesh.position.set(row.kind === KIND_BEAM ? 0 : LANES[row.lane], 0, row.z);
      }
    }
    for (const gate of state.gates ?? []) {
      if (gate.resolved) continue;
      const index = used.deliveryGate;
      used.deliveryGate += 1;
      if (index >= pools.deliveryGate.length) continue;
      const mesh = pools.deliveryGate[index];
      mesh.visible = true;
      mesh.position.set(0, 0, gate.z);
      const marker = mesh.getObjectByName('marker');
      if (marker) {
        marker.position.x = LANES[gate.targetLane];
        const pulse = 1 + Math.sin(elapsed * 6) * 0.06;
        marker.scale.setScalar(pulse);
      }
    }
    for (const pad of state.pads ?? []) {
      if (pad.taken) continue;
      const index = used.boostPad;
      used.boostPad += 1;
      if (index >= pools.boostPad.length) continue;
      const mesh = pools.boostPad[index];
      mesh.visible = true;
      mesh.position.set(LANES[pad.lane], 0, pad.z);
    }
    for (const item of state.pickups) {
      // Past the rider's plane a pickup is already missed; drawing it
      // puts a huge blurred blob at the frame's edge for a frame or
      // two, so the visible road only ever shows what can still be won.
      if (item.taken || item.z > 1.5) continue;
      const pool = pools[item.kind];
      const index = used[item.kind];
      used[item.kind] += 1;
      if (index >= pool.length) continue;
      const mesh = pool[index];
      mesh.visible = true;
      mesh.position.set(LANES[item.lane], item.y + Math.sin(elapsed * 2.6 + item.z) * 0.08, item.z);
      mesh.rotation.y = elapsed * 2.4 + item.z;
    }
    for (const kind of Object.keys(pools)) {
      for (let i = used[kind]; i < pools[kind].length; i += 1) pools[kind][i].visible = false;
    }

    // Dashes, light posts and scenery scroll with distance travelled.
    for (let i = 0; i < dashes.length; i += 1) {
      const dash = dashes[i];
      const base = -((i >> 1) * 7.4);
      dash.position.z = wrapZ(base - state.distance) + 12;
    }
    for (const post of posts) {
      post.mesh.position.z = wrapZ(post.baseZ - state.distance) + 12;
    }
    for (const item of scenery) {
      item.position.z = wrapZ(item.userData.baseZ - state.distance) + 12;
      item.position.x = item.userData.x;
      if (item.userData.y !== undefined) item.position.y = item.userData.y;
      item.rotation.y += item.userData.spin * dt;
    }

    // District dress: when the run crosses a boundary, the whole
    // stage changes at once — sky, fog, light, road, ground and which
    // roadside world is standing beside the lane.
    const districtIndex = state.districtIndex ?? 0;
    if (districtIndex !== lastDistrictIndex) {
      lastDistrictIndex = districtIndex;
      const palette = DISTRICTS[districtIndex];
      scene.background.setHex(palette.sky);
      scene.fog.color.setHex(palette.fog);
      sun.color.setHex(palette.sunColor);
      sun.intensity = palette.sunIntensity;
      sunBall.position.set(...palette.sunPosition);
      sunBall.material.color.setHex(districtIndex === 2 ? 0xdbeafe : 0xffe28a);
      hemi.groundColor.setHex(palette.hemiGround);
      roadMaterial.color.setHex(palette.road);
      railMaterial.color.setHex(palette.roadEdge);
      railMaterial.emissive.setHex(palette.roadEdge);
      groundMaterial.color.setHex(palette.ground);
      coastGroup.visible = districtIndex === 1;
      cityGroup.visible = districtIndex === 2;
      sceneryGroup.visible = districtIndex !== 2;
    }
    for (const isle of coastItems) {
      isle.position.z = wrapZ(isle.userData.baseZ - state.distance) + 12;
    }
    for (const tower of cityItems) {
      tower.position.z = wrapZ(tower.userData.baseZ - state.distance) + 12;
    }

    // Particles fall and fade.
    for (let i = 0; i < PARTICLES; i += 1) {
      const data = particleData[i];
      if (data.life <= 0) continue;
      data.life -= dt;
      data.vy -= 9 * dt;
      positions[i * 3] += data.vx * dt;
      positions[i * 3 + 1] += data.vy * dt;
      positions[i * 3 + 2] += data.vz * dt;
      if (data.life <= 0) positions[i * 3 + 1] = -100;
    }
    particleGeometry.attributes.position.needsUpdate = true;

    // Camera rides low and close behind the rider, leaning into lane
    // changes; speed widens the view a touch, and impacts shake what
    // is left. The low anchor keeps the horizon in the top sliver of
    // the frame and the rider big in the lower middle.
    const pace = state.effectiveSpeed ?? state.speed;
    const speedShare = (pace - SPEED_START) / (SPEED_MAX - SPEED_START);
    // A boost burst kicks the view wider on top of the pace widening:
    // the world visibly stretches as the pad's burst takes hold.
    const boostKick = state.boost > 0 ? 9 * Math.min(1, state.boost / BOOST_SECONDS + 0.25) : 0;
    camera.fov = CAMERA_FOV + THREE.MathUtils.clamp(speedShare, 0, 1) * 10 + boostKick;
    camera.updateProjectionMatrix();
    shake = Math.max(0, shake - dt * 2.2);
    const jolt = shake * shake;
    camera.position.set(
      r.x * 0.55 + (Math.random() - 0.5) * jolt * 0.5,
      CAMERA_Y + r.y * 0.26 + (Math.random() - 0.5) * jolt * 0.4,
      CAMERA_Z,
    );
    camera.lookAt(r.x * 0.74, 1.12 + r.y * 0.3, -8.5);
    renderer.render(scene, camera);
  }

  function wrapZ(value) {
    const m = ((value % SCENERY_SPAN) + SCENERY_SPAN) % SCENERY_SPAN;
    return m - SCENERY_SPAN;
  }

  return {
    draw,
    burst,
    addShake(amount) {
      shake = Math.min(1, shake + amount);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    renderer,
  };
}
