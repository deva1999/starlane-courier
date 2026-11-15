// Starlane Courier — everything the player sees, drawn with three.js.
// The renderer owns no rules: each frame it reads the world state from
// world.js and poses pooled meshes to match, so the same state always
// draws the same picture. Scenery is a pure function of distance
// travelled, which keeps even the decoration reproducible.

import * as THREE from 'three';
import { COLORS, LANES } from './config.js';
import { KIND_BARRIER, KIND_BEAM, KIND_GATE } from './world.js';
import { makeRandom } from './random.js';

const SCENERY_SPAN = 190;
const SCENERY_COUNT = 46;

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

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);
  camera.position.set(0, 4.6, 8.8);

  scene.add(new THREE.HemisphereLight(0xcfefff, 0x3f7a34, 1.05));
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
  sun.position.set(7, 14, 5);
  scene.add(sun);
  const sunBall = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), new THREE.MeshBasicMaterial({ color: 0xffe28a, fog: false }));
  sunBall.position.set(38, 30, -110);
  scene.add(sunBall);

  // The floating road: a long deck, glowing rails, and scrolling dashes.
  const road = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.5, 320), flat(COLORS.road));
  road.position.set(0, -0.26, -140);
  scene.add(road);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 320),
      flat(COLORS.roadEdge, { emissive: COLORS.roadEdge, emissiveIntensity: 0.5 }),
    );
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

  // Valley floor far below, and scenery whose place is a function of
  // distance: item i sits at wrap(baseZ - distance), so any frame can be
  // rebuilt exactly from the run's numbers alone.
  const valley = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), flat(COLORS.grass));
  valley.rotation.x = -Math.PI / 2;
  valley.position.set(0, -7, -160);
  scene.add(valley);
  const sceneryRandom = makeRandom(20261);
  const scenery = [];
  for (let i = 0; i < SCENERY_COUNT; i += 1) {
    const kind = sceneryRandom();
    let item;
    if (kind < 0.45) item = makeTree(sceneryRandom() < 0.75 ? COLORS.leafA : COLORS.leafB);
    else if (kind < 0.72) {
      item = new THREE.Mesh(new THREE.ConeGeometry(3.2 + sceneryRandom() * 2.4, 5 + sceneryRandom() * 4, 7), flat(COLORS.hill));
      item.position.y = -7 + 1.8;
    } else item = makeCloud();
    const side = sceneryRandom() < 0.5 ? -1 : 1;
    const isCloud = kind >= 0.72;
    item.userData = {
      baseZ: -sceneryRandom() * SCENERY_SPAN,
      x: isCloud ? (sceneryRandom() - 0.5) * 90 : side * (10.5 + sceneryRandom() * 26),
      y: isCloud ? 11 + sceneryRandom() * 9 : (kind < 0.45 ? -7 : undefined),
      spin: (sceneryRandom() - 0.5) * 0.15,
    };
    if (item.userData.y !== undefined) item.position.y = item.userData.y;
    item.rotation.y = sceneryRandom() * Math.PI * 2;
    const scale = 0.85 + sceneryRandom() * 0.9;
    item.scale.setScalar(isCloud ? 1.3 : scale);
    scene.add(item);
    scenery.push(item);
  }

  const rider = makeRider();
  scene.add(rider);
  const riderShadow = rider.getObjectByName('shadow');
  const thrusters = [];
  rider.traverse((child) => { if (child.name === 'thruster') thrusters.push(child); });

  // Pools: enough meshes for the densest stretch of road.
  const pools = {
    [KIND_BARRIER]: [],
    [KIND_GATE]: [],
    [KIND_BEAM]: [],
    star: [],
    shield: [],
  };
  const makers = {
    [KIND_BARRIER]: makeBarrier,
    [KIND_GATE]: makeGate,
    [KIND_BEAM]: makeBeam,
    star: makeStar,
    shield: makeShieldOrb,
  };
  for (const kind of Object.keys(pools)) {
    const count = kind === 'star' ? 40 : 14;
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

    const used = { [KIND_BARRIER]: 0, [KIND_GATE]: 0, [KIND_BEAM]: 0, star: 0, shield: 0 };
    for (const row of state.rows) {
      const pool = pools[row.kind];
      const index = used[row.kind];
      used[row.kind] += 1;
      if (index >= pool.length) continue;
      const mesh = pool[index];
      mesh.visible = true;
      mesh.position.set(row.kind === KIND_BEAM ? 0 : LANES[row.lane], 0, row.z);
    }
    for (const item of state.pickups) {
      if (item.taken) continue;
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

    // Dashes and scenery scroll with distance travelled.
    for (let i = 0; i < dashes.length; i += 1) {
      const dash = dashes[i];
      const base = -((i >> 1) * 7.4);
      dash.position.z = wrapZ(base - state.distance) + 12;
    }
    for (const item of scenery) {
      item.position.z = wrapZ(item.userData.baseZ - state.distance) + 12;
      item.position.x = item.userData.x;
      if (item.userData.y !== undefined) item.position.y = item.userData.y;
      item.rotation.y += item.userData.spin * dt;
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

    // Camera rides behind and a little above, leaning into lane changes;
    // speed widens the view a touch, and impacts shake what is left.
    const speedShare = (state.speed - 19) / 25;
    camera.fov = 68 + THREE.MathUtils.clamp(speedShare, 0, 1) * 8;
    camera.updateProjectionMatrix();
    shake = Math.max(0, shake - dt * 2.2);
    const jolt = shake * shake;
    camera.position.set(
      r.x * 0.55 + (Math.random() - 0.5) * jolt * 0.5,
      4.6 + r.y * 0.22 + (Math.random() - 0.5) * jolt * 0.4,
      8.8,
    );
    camera.lookAt(r.x * 0.72, 1.05 + r.y * 0.3, -9);
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
