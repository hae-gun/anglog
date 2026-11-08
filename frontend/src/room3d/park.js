// 앵파크: an autumn park where everyone plays as a parrot.
// Third-person camera (drag to turn, pinch or wheel to zoom), joystick or keys to walk, a fly toggle,
// and tap-to-go for houses, branches, the swing, the bath and other birds.
// Neighbours' birdhouses stand around the ring path; their birds live here as little AIs, so the park
// is never empty. Other people connected at the same time show up as remote birds (see lib/parkNet.ts).
import * as THREE from 'three';
import { playCall } from '../lib/sound';
import { makeBird, toLinear } from './bird.js';
import { disposeScene, mat, rod, skyNow } from './scene.js';

const PARK_R = 34;
const RING_IN = 11;
const RING_OUT = 12.6;
const HOUSE_R = 17;
const SLOTS = 12;
const MAX_RESIDENTS = 8;
const MAX_REMOTES_DRAWN = 24;
const CRUISE = 3.0;
const WALK_SPEED = 3.2;
const FLY_SPEED = 6.2;
const clamp = THREE.MathUtils.clamp;

const AUTUMN = ['#D9442B', '#E8662E', '#F08A24', '#C7362F', '#F2B33D', '#B8432A', '#E9A13B'];
const CHIRPS = ['짹짹!', '짹!', '삐요', '짹짹짹'];
const REPLIES = ['짹!', '삐약', '누구야?', '반가워!', '짹짹', '안녕!'];
const HELLO = ['안녕!', '처음 보는 얼굴이네', '짹! 같이 놀자', '단풍 예쁘지?'];
const PLAY_LINES = ['신난다!', '한 번 더!', '짹짹짹!', '같이 춤추자'];
const MODE_CODE = { idle: 0, CALM: 0, WALK: 1, FLY: 2, DANCE: 3, HAPPY: 4, CHIRP: 5, PREEN: 6 };
const CODE_MODE = ['idle', 'WALK', 'FLY', 'DANCE', 'HAPPY', 'CHIRP', 'PREEN'];

const angleTo = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
const dirAngle = (dx, dz) => Math.atan2(-dz, dx);
function lerpAngle(a, b, k) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tint = (hex, toward, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color(toward), k).getHexString();
const at = (a, r) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
/** Smallest difference between two angles. */
const angDiff = (a, b) => Math.abs(((((a - b + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI);

/** House slot angles, the ones nearest the entrance (+z) first. Paths run along 0, 90, 180, 270 degrees. */
const SLOT_ANGLES = (() => {
  const list = [];
  for (let q = 0; q < 4; q++) [0.32, 0.785, 1.25].forEach((o) => list.push(q * (Math.PI / 2) + o));
  return list.sort((a, b) => angDiff(a, Math.PI / 2) - angDiff(b, Math.PI / 2));
})();

/**
 * cards: RoomCard-like { owner, parrots, postedToday, mine? } in slot order.
 * opts.visitor: { name, colors, species }.
 * Callbacks: onEnter(handle), onBirdTap({ handle|null, nickname|null, birdName, remote }), onEmptyLot().
 * opts.startAt: a handle to come out of (back from that house), or null to fly in at the gate.
 * @param {HTMLElement} container
 * @param {any[]} cards
 * @param {{ visitor: any, startAt?: string | null, onEnter?: (h: string) => void, onBirdTap?: (who: any) => void, onEmptyLot?: () => void }} opts
 */
export function mountPark(container, cards, { visitor, startAt = null, onEnter, onBirdTap, onEmptyLot } = /** @type {any} */ ({})) {
  const env = skyNow();
  const small = Math.min(window.innerWidth, window.innerHeight) < 720;
  const skyC = env.night ? '#1B2036' : tint(env.sky, '#FFF4E0', 0.3);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(toLinear(skyC), 38, 130);
  const renderer = new THREE.WebGLRenderer({ antialias: !small });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(new THREE.Color(skyC)); // the clear colour skips output encoding, fog does not
  container.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });

  const labels = document.createElement('div');
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  container.appendChild(labels);
  const el = (cls, text = '') => {
    const e = document.createElement('div');
    e.className = cls;
    e.textContent = text;
    labels.appendChild(e);
    return e;
  };

  // ---- light ---------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x8a7a4a, env.night ? 0.42 : 0.82));
  const sun = new THREE.DirectionalLight(env.night ? 0x9fb4ff : 0xffe2b8, env.night ? 0.5 : env.light);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  scene.add(sun, sun.target);

  const rnd = mulberry(11);
  const obstacles = [];
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  // ---- ground, paths, horizon -------------------------------------------------------------
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(env.night ? '#4E5A34' : '#9AA35A'));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.04;
  scene.add(meadow);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(PARK_R + 1, 64), mat(env.night ? '#5E6B3C' : '#B4B866'));
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  scene.add(lawn);
  const pathMat = mat(env.night ? '#9C8F74' : '#E6D3AE');
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), pathMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.012;
  plaza.receiveShadow = true;
  scene.add(plaza);
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING_IN, RING_OUT, 72), pathMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.receiveShadow = true;
  scene.add(ring);
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((a) => {
    const len = PARK_R - 4;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, len), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = -a + Math.PI / 2;
    const mid = at(a, 4 + len / 2);
    p.position.set(mid.x, 0.011, mid.z);
    p.receiveShadow = true;
    scene.add(p);
  });
  // distant autumn hills
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
    const r = 120 + rnd() * 40;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(22 + rnd() * 18, 18 + rnd() * 26, 6), mat(tint(pick(AUTUMN), env.night ? '#1B2036' : '#8E9C7A', 0.55)));
    hill.position.set(Math.cos(a) * r, 6, Math.sin(a) * r);
    scene.add(hill);
  }

  // ---- trees (instanced) -------------------------------------------------------------
  const trunks = [];
  const crowns = []; // { x, y, z, r, color, cone }
  function addMaple(x, z, s = 1) {
    trunks.push({ x, z, h: 2.6 * s, r: 0.22 * s });
    const c = pick(AUTUMN);
    crowns.push({ x, y: 3.4 * s, z, r: 1.9 * s, color: c });
    crowns.push({ x: x + 0.9 * s, y: 2.9 * s, z: z + 0.4 * s, r: 1.2 * s, color: tint(c, '#F2B33D', 0.25) });
    crowns.push({ x: x - 0.7 * s, y: 3.0 * s, z: z - 0.6 * s, r: 1.3 * s, color: tint(c, '#9E2A22', 0.2) });
    obstacles.push({ x, z, r: 0.45 * s });
  }
  function addGinkgo(x, z) {
    trunks.push({ x, z, h: 2.0, r: 0.16 });
    crowns.push({ x, y: 3.0, z, r: 0.85, color: rnd() < 0.5 ? '#F2C53D' : '#E8B92E', cone: true });
    obstacles.push({ x, z, r: 0.35 });
  }
  const PATH_A = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const POND = { x: -21, z: -14, r: 5 };
  // ginkgo avenue along the entrance path (+z)
  for (let z = 15; z < PARK_R - 2; z += 3.6) [-3.0, 3.0].forEach((x) => addGinkgo(x, z));
  // maples between the houses and the park edge
  for (let i = 0, tries = 0; i < (small ? 46 : 64) && tries < 2000; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 20.5 + rnd() * (PARK_R - 22);
    if (PATH_A.some((p) => angDiff(a, p) < 2.4 / r + 0.04)) continue;
    const p = at(a, r);
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 2.5) continue;
    if (obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 3.2)) continue;
    addMaple(p.x, p.z, 0.85 + rnd() * 0.45);
    i++;
  }
  // a few maples inside the ring too
  [[7.5, 6.5], [-8, -6], [-7.5, 7], [8, -7.5]].forEach(([x, z]) => addMaple(x, z, 0.8));
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 7), mat('#7A5A3E'), trunks.length);
  const dummy = new THREE.Object3D();
  trunks.forEach((t, i) => {
    dummy.position.set(t.x, t.h / 2, t.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(t.r, t.h, t.r);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
  });
  trunkMesh.castShadow = true;
  scene.add(trunkMesh);
  const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const roundCrowns = crowns.filter((c) => !c.cone);
  const coneCrowns = crowns.filter((c) => c.cone);
  const crownMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), crownMat, roundCrowns.length);
  const coneMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 7), crownMat, coneCrowns.length);
  const col = new THREE.Color();
  [[crownMesh, roundCrowns], [coneMesh, coneCrowns]].forEach(([mesh, list]) => {
    list.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.setScalar(c.r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.set(c.color).convertSRGBToLinear());
    });
    mesh.castShadow = true;
    scene.add(mesh);
  });

  // the big maple in the middle, with two branches to sit on
  rod(scene, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4.2, 0), 0.42, '#7A5A3E');
  const BR1 = { y: 2.6, z: 0, x0: 0.9, x1: 2.6 };
  const BR2 = { y: 2.2, x: 0, z0: 0.9, z1: 2.6 };
  rod(scene, new THREE.Vector3(0.2, BR1.y, 0), new THREE.Vector3(BR1.x1 + 0.2, BR1.y, 0), 0.09, '#7A5A3E');
  rod(scene, new THREE.Vector3(0, BR2.y, 0.2), new THREE.Vector3(0, BR2.y, BR2.z1 + 0.2), 0.09, '#7A5A3E');
  const occluders = [crownMesh, coneMesh];
  [[0, 5.2, 0, 2.3, '#C7362F'], [-1.3, 4.5, 1, 1.5, '#E8662E'], [1.4, 4.7, -0.9, 1.6, '#D9442B'], [0.4, 6.3, 0.2, 1.4, '#F08A24']].forEach(([dx, y, dz, r, c]) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(c));
    m.position.set(dx, y, dz);
    m.castShadow = true;
    scene.add(m);
    occluders.push(m);
  });
  obstacles.push({ x: 0, z: 0, r: 0.9 });

  // ---- pond, bath, swing, benches, lamps -----------------------------------------------------
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 40), new THREE.MeshStandardMaterial({ color: toLinear(env.night ? '#2E4A66' : '#7FB6D6'), roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, 0.03, POND.z);
  scene.add(water);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rnd() * 0.2, 0), mat('#BDB6A8'));
    s.position.set(POND.x + Math.cos(a) * (POND.r + 0.2), 0.12, POND.z + Math.sin(a) * (POND.r + 0.2));
    s.castShadow = true;
    scene.add(s);
  }
  // floating leaves on the pond
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * (POND.r - 0.6);
    const lf = new THREE.Mesh(new THREE.CircleGeometry(0.16, 5), mat(pick(AUTUMN)));
    lf.rotation.x = -Math.PI / 2;
    lf.position.set(POND.x + Math.cos(a) * r, 0.04, POND.z + Math.sin(a) * r);
    scene.add(lf);
  }
  obstacles.push({ x: POND.x, z: POND.z, r: POND.r + 0.3 });

  const BATH = { x: -5.6, z: 3.8, r: 0.7, y: 0.84 };
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.7, 10), mat('#D9D4CA'));
  ped.position.set(BATH.x, 0.35, BATH.z);
  ped.castShadow = true;
  scene.add(ped);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 0.2, 16), mat('#E7E2D8'));
  bowl.position.set(BATH.x, 0.76, BATH.z);
  bowl.castShadow = true;
  scene.add(bowl);
  const bathWater = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), new THREE.MeshStandardMaterial({ color: toLinear('#8CC8E8'), roughness: 0.2 }));
  bathWater.rotation.x = -Math.PI / 2;
  bathWater.position.set(BATH.x, 0.865, BATH.z);
  scene.add(bathWater);
  obstacles.push({ x: BATH.x, z: BATH.z, r: 1.0 });

  const SW = { x: 6.2, z: -4.6, top: 2.7, len: 1.55 };
  [-1.3, 1.3].forEach((dx) => rod(scene, new THREE.Vector3(SW.x + dx, 0, SW.z), new THREE.Vector3(SW.x + dx, SW.top + 0.1, SW.z), 0.07, '#9C7048'));
  rod(scene, new THREE.Vector3(SW.x - 1.4, SW.top, SW.z), new THREE.Vector3(SW.x + 1.4, SW.top, SW.z), 0.07, '#9C7048');
  const swing = new THREE.Group();
  swing.position.set(SW.x, SW.top, SW.z);
  scene.add(swing);
  [-0.7, 0.7].forEach((dx) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, SW.len, 4), mat('#6B5A48'));
    r.position.set(dx, -SW.len / 2, 0);
    swing.add(r);
  });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.3), mat('#C98A4B'));
  seat.position.set(0, -SW.len, 0);
  seat.castShadow = true;
  swing.add(seat);

  [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].forEach((a) => {
    const p = at(a, 9.6);
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = Math.atan2(-p.x, -p.z);
    const plank = (y, z, hh) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.0, hh, 0.32), mat('#A8703F')); m.position.set(0, y, z); m.castShadow = true; g.add(m); };
    plank(0.55, 0, 0.08);
    plank(0.95, -0.25, 0.5);
    [-0.85, 0.85].forEach((x) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.3), mat('#4A4038')); leg.position.set(x, 0.27, 0); g.add(leg); });
    scene.add(g);
    obstacles.push({ x: p.x, z: p.z, r: 0.9 });
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: toLinear(env.night ? '#FFD98A' : '#F3EDE0') });
  for (let i = 0; i < 8; i++) {
    const p = at((i / 8) * Math.PI * 2 + Math.PI / 8, RING_OUT + 0.6);
    rod(scene, new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, 2.6, p.z), 0.05, '#4A4038');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bulbMat);
    b.position.set(p.x, 2.75, p.z);
    scene.add(b);
  }

  // ---- fallen leaves and leaf piles -------------------------------------------------------
  const leafGeo = new THREE.PlaneGeometry(0.2, 0.12);
  leafGeo.rotateX(-Math.PI / 2);
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
  const fallenCount = small ? 1300 : 2600;
  const fallen = new THREE.InstancedMesh(leafGeo, leafMat, fallenCount);
  for (let i = 0; i < fallenCount; i++) {
    let x, z;
    if (i % 3 && trunks.length) {
      const t = trunks[Math.floor(rnd() * trunks.length)];
      const a = rnd() * Math.PI * 2, r = rnd() * 3.2;
      x = t.x + Math.cos(a) * r;
      z = t.z + Math.sin(a) * r;
    } else {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * PARK_R;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r) x += 2 * POND.r;
    dummy.position.set(x, 0.02 + rnd() * 0.01, z);
    dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.8 + rnd() * 0.8);
    dummy.updateMatrix();
    fallen.setMatrixAt(i, dummy.matrix);
    fallen.setColorAt(i, col.set(pick(AUTUMN)).convertSRGBToLinear());
  }
  fallen.receiveShadow = true;
  scene.add(fallen);

  const PILES = [[3.2, 7.6], [-9.2, -2.6], [22.5, 9], [-14, 23], [13, -24], [-25, 4]].map(([x, z]) => ({ x, z, cool: 0 }));
  PILES.forEach((p) => {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#D7752E'));
    mound.scale.set(1.3, 0.45, 1.3);
    mound.position.set(p.x, 0, p.z);
    mound.receiveShadow = true;
    scene.add(mound);
    for (let i = 0; i < 18; i++) {
      const lf = new THREE.Mesh(leafGeo, mat(pick(AUTUMN)));
      const a = rnd() * Math.PI * 2, r = rnd() * 1.2;
      lf.position.set(p.x + Math.cos(a) * r, 0.42 * Math.sqrt(Math.max(0, 1 - (r / 1.3) ** 2)) + 0.03, p.z + Math.sin(a) * r);
      lf.rotation.set(rnd() * 0.6, rnd() * 6, rnd() * 0.6);
      scene.add(lf);
    }
  });

  // leaves drifting down around wherever the camera looks
  const driftCount = small ? 70 : 130;
  const drift = new THREE.InstancedMesh(leafGeo, leafMat, driftCount);
  const D = Array.from({ length: driftCount }, () => ({ x: 0, y: 0, z: 0, vy: 0, ph: 0, spin: 0 }));
  drift.frustumCulled = false;
  scene.add(drift);
  let driftReady = false;
  function resetLeaf(d, center, top) {
    d.x = center.x + (rnd() - 0.5) * 34;
    d.z = center.z + (rnd() - 0.5) * 34;
    d.y = top ? 7 + rnd() * 4 : rnd() * 10;
    d.vy = 0.5 + rnd() * 0.6;
    d.ph = rnd() * 10;
    d.spin = 1 + rnd() * 2;
  }
  D.forEach((d, i) => drift.setColorAt(i, col.set(pick(AUTUMN)).convertSRGBToLinear()));

  // a burst of leaves when someone runs through a pile
  const burstCount = 160;
  const burst = new THREE.InstancedMesh(leafGeo, leafMat, burstCount);
  const B = Array.from({ length: burstCount }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0 }));
  B.forEach((b, i) => burst.setColorAt(i, col.set(pick(AUTUMN)).convertSRGBToLinear()));
  burst.frustumCulled = false;
  scene.add(burst);
  let burstNext = 0;
  function leafBurst(x, z, n = 26) {
    for (let k = 0; k < n; k++) {
      const b = B[burstNext];
      burstNext = (burstNext + 1) % burstCount;
      b.life = 1.6 + Math.random() * 0.6;
      b.p.set(x + (Math.random() - 0.5) * 1.2, 0.3, z + (Math.random() - 0.5) * 1.2);
      const a = Math.random() * Math.PI * 2;
      b.v.set(Math.cos(a) * (0.8 + Math.random() * 1.6), 2.4 + Math.random() * 2.4, Math.sin(a) * (0.8 + Math.random() * 1.6));
      b.spin = 4 + Math.random() * 6;
    }
  }

  // ---- houses --------------------------------------------------------------------------------
  const houses = [];
  const houseHits = [];
  const roofShape = new THREE.Shape([new THREE.Vector2(-1.18, 0), new THREE.Vector2(1.18, 0), new THREE.Vector2(0, 1.0)]);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.9, bevelEnabled: false });
  roofGeo.translate(0, 0, -0.95);
  const part = (g, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  for (let i = 0; i < SLOTS; i++) {
    const card = cards[i] || null;
    const pos = at(SLOT_ANGLES[i], HOUSE_R);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = Math.atan2(-pos.x, -pos.z); // door towards the plaza
    scene.add(g);
    if (!card) {
      part(g, new THREE.BoxGeometry(2.0, 0.04, 1.8), mat('#C9AE84'), 0, 0.02, 0);
      part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), mat('#9C7048'), 0.7, 0.45, 0.7);
      part(g, new THREE.BoxGeometry(0.6, 0.36, 0.05), mat('#F3E6CF'), 0.7, 0.85, 0.72);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.0), hitMat);
      hit.position.y = 0.6;
      hit.userData = { kind: 'lot' };
      g.add(hit);
      houseHits.push(hit);
      continue;
    }
    const lead = card.parrots[0];
    const body = lead ? lead.colors.body : '#9BC9A0';
    const roofC = lead ? lead.colors.head : '#C98A4B';
    part(g, new THREE.BoxGeometry(2.0, 0.25, 1.8), mat('#B98552'), 0, 0.125, 0);
    part(g, new THREE.BoxGeometry(1.8, 1.5, 1.6), mat(tint(body, '#FFF8EC', 0.6)), 0, 1.0, 0);
    part(g, roofGeo, mat(tint(roofC, '#5A4030', 0.15)), 0, 1.75, 0);
    part(g, new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: toLinear('#2B2622') }), 0, 1.0, 0.805);
    part(g, new THREE.TorusGeometry(0.36, 0.05, 6, 24), mat(lead ? lead.colors.wing : '#7FAE86'), 0, 1.0, 0.81);
    part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mat('#8A6A4A'), 0, 0.62, 1.03).rotation.x = Math.PI / 2;
    const lit = !!card.postedToday;
    part(g, new THREE.CircleGeometry(0.17, 18), new THREE.MeshBasicMaterial({ color: toLinear(lit ? '#FFD86B' : env.night ? '#2E3A4E' : '#5A6878') }), 0, 2.15, 0.958);
    part(g, new THREE.TorusGeometry(0.18, 0.035, 6, 18), mat('#FFFFFF'), 0, 2.15, 0.96);
    // a few leaves on the roof, it is autumn after all
    for (let k = 0; k < 5; k++) {
      const lf = part(g, leafGeo, mat(pick(AUTUMN)), (rnd() - 0.5) * 1.6, 2.05 + rnd() * 0.4, (rnd() - 0.5) * 1.4);
      lf.rotation.set(rnd() * 0.8, rnd() * 6, rnd() * 0.8);
    }
    if (card.mine) {
      part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), mat('#4A4038'), 0, 3.05, 0);
      part(g, new THREE.BoxGeometry(0.04, 0.24, 0.4), mat('#F5C842'), 0, 3.25, 0.2);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.0, 2.1), hitMat);
    hit.position.y = 1.5;
    hit.userData = { kind: 'house', index: houses.length };
    g.add(hit);
    houseHits.push(hit);
    occluders.push(hit);
    g.updateMatrixWorld(true);
    houses.push({
      card,
      handle: card.owner.handle,
      door: g.localToWorld(new THREE.Vector3(0, 1.0, 0.8)),
      perch: g.localToWorld(new THREE.Vector3(0, 0.68, 1.12)),
      front: g.localToWorld(new THREE.Vector3(0, 0, 2.2)),
      top: g.localToWorld(new THREE.Vector3(0, 3.0, 0)),
      plate: el(`park-plate${lit ? ' lit' : ''}${card.mine ? ' mine' : ''}`, card.mine ? '내 집' : card.owner.nickname),
    });
    obstacles.push({ x: pos.x, z: pos.z, r: 1.5 });
  }

  // ---- ground rules ------------------------------------------------------------------------
  function groundPoint(x, z) {
    const d = Math.hypot(x, z);
    if (d > PARK_R - 0.8) { x *= (PARK_R - 0.8) / d; z *= (PARK_R - 0.8) / d; }
    const p = new THREE.Vector3(x, 0, z);
    for (let pass = 0; pass < 2; pass++) {
      obstacles.forEach((o) => {
        const dx = p.x - o.x, dz = p.z - o.z, dd = Math.hypot(dx, dz);
        if (dd < o.r + 0.35) {
          const k = (o.r + 0.35) / Math.max(dd, 0.001);
          p.x = o.x + dx * k;
          p.z = o.z + dz * k;
        }
      });
    }
    return p;
  }
  function blocked(a, b) {
    const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz || 1;
    return obstacles.some((o) => {
      const t = clamp(((o.x - a.x) * abx + (o.z - a.z) * abz) / L2, 0, 1);
      return Math.hypot(a.x + abx * t - o.x, a.z + abz * t - o.z) < o.r + 0.2;
    });
  }
  const onGround = (p) => p.y < 0.05;

  // ---- actors --------------------------------------------------------------------------------
  let clock = 0;
  const actors = [];
  function actor(b, name, opts) {
    const a = {
      b, name, pos: b.group.position, move: null, action: null, surface: 'ground', isPlayer: !!opts.isPlayer, remote: opts.remote || null,
      pitch: opts.pitch ?? 1, house: opts.house ?? null, rotTarget: 0, swingDx: 0,
      nextThink: 2 + Math.random() * 6, nextChirp: 5 + Math.random() * 12,
      tagEl: el(opts.isPlayer ? 'room-tag room-tag-me' : opts.remote ? 'room-tag room-tag-live' : 'room-tag', name),
      bubbleEl: el('room-bubble'), bubbleUntil: 0, scale: 1,
    };
    a.bubbleEl.hidden = true;
    actors.push(a);
    return a;
  }
  function dropActor(a) {
    const i = actors.indexOf(a);
    if (i >= 0) actors.splice(i, 1);
    scene.remove(a.b.group);
    a.tagEl.remove();
    a.bubbleEl.remove();
  }
  const residents = [];
  houses.forEach((hh) => {
    if (hh.card.mine) return;
    hh.card.parrots.slice(0, 2).forEach((p, j) => {
      if (residents.length >= MAX_RESIDENTS) return;
      const b = makeBird(p.colors, p.species);
      scene.add(b.group);
      const r = actor(b, p.name, { house: hh, pitch: [0.92, 1.05, 0.86, 1.12, 0.98][residents.length % 5] });
      if (j === 0 && residents.length % 3 === 0) {
        r.pos.copy(hh.perch);
        r.surface = 'perch';
      } else {
        r.pos.copy(groundPoint(hh.front.x + (Math.random() - 0.5) * 3, hh.front.z + (Math.random() - 0.5) * 3));
      }
      r.b.group.rotation.y = r.rotTarget = angleTo(r.pos, new THREE.Vector3());
      residents.push(r);
    });
  });
  const pb = makeBird(visitor.colors, visitor.species);
  scene.add(pb.group);
  const player = actor(pb, visitor.name, { isPlayer: true });
  let flying = false;
  let landing = false;

  function say(a, text, sec = 1.6) {
    a.bubbleEl.textContent = text;
    a.bubbleEl.hidden = false;
    a.bubbleUntil = clock + sec;
  }
  const loudness = (a) => (a.isPlayer ? 0.85 : clamp(1 - a.pos.distanceTo(player.pos) / 12, 0, 0.7));
  const act = (a, name, sec) => { a.action = { name, until: clock + sec }; };

  // ---- movement ---------------------------------------------------------------------------
  function flyTo(a, to, surface, after) {
    const from = a.pos.clone();
    const d = from.distanceTo(to);
    a.move = { type: 'fly', from, to: to.clone(), t0: clock, dur: 0.35 + d / 7, peak: Math.max(from.y, to.y) + Math.min(3, 0.8 + d * 0.12), surface, after };
    a.rotTarget = angleTo(from, to);
  }
  function walkTo(a, to, after) {
    a.move = { type: 'walk', to: to.clone(), surface: 'ground', after };
    a.rotTarget = angleTo(a.pos, to);
  }
  function goTo(a, to, surface, after) {
    if (onGround(a.pos) && to.y < 0.05 && a.pos.distanceTo(to) < 10 && !blocked(a.pos, to) && !(a.isPlayer && flying)) walkTo(a, to, after);
    else flyTo(a, to, surface, after);
  }
  function stepMove(a, dt) {
    const m = a.move;
    if (!m) return;
    if (m.type === 'fly') {
      const k = Math.min(1, (clock - m.t0) / m.dur);
      a.pos.set(m.from.x + (m.to.x - m.from.x) * k, (1 - k) * (1 - k) * m.from.y + 2 * (1 - k) * k * m.peak + k * k * m.to.y, m.from.z + (m.to.z - m.from.z) * k);
      if (k < 1) return;
    } else {
      const dx = m.to.x - a.pos.x, dz = m.to.z - a.pos.z, d = Math.hypot(dx, dz), s = WALK_SPEED * dt;
      if (d > s) { a.pos.x += (dx / d) * s; a.pos.z += (dz / d) * s; return; }
      a.pos.x = m.to.x;
      a.pos.z = m.to.z;
    }
    a.move = null;
    a.surface = m.surface;
    if (a.isPlayer) { flying = false; landing = false; }
    if (m.after) m.after();
  }

  // places to hang out
  const branchSpot = () => (Math.random() < 0.5
    ? { p: new THREE.Vector3(BR1.x0 + Math.random() * (BR1.x1 - BR1.x0), BR1.y + 0.08, BR1.z), surface: 'branch' }
    : { p: new THREE.Vector3(BR2.x, BR2.y + 0.08, BR2.z0 + Math.random() * (BR2.z1 - BR2.z0)), surface: 'branch' });
  const bathSpot = (near) => {
    const a = near ? Math.atan2(near.z - BATH.z, near.x - BATH.x) + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
    return { p: new THREE.Vector3(BATH.x + Math.cos(a) * BATH.r, BATH.y, BATH.z + Math.sin(a) * BATH.r), surface: 'bath' };
  };
  const pondSpot = () => {
    const a = Math.random() * Math.PI * 2;
    return { p: new THREE.Vector3(POND.x + Math.cos(a) * (POND.r + 0.7), 0, POND.z + Math.sin(a) * (POND.r + 0.7)), surface: 'ground', pond: true };
  };
  const swingRiders = () => actors.filter((a) => a.surface === 'swing' && !a.move && !a.remote);
  function swingSpot() {
    const taken = swingRiders().map((a) => a.swingDx);
    const dx = [-0.45, 0.45, 0].find((x) => !taken.some((t) => Math.abs(t - x) < 0.4));
    if (dx === undefined) return null;
    return { p: swing.localToWorld(new THREE.Vector3(dx, -SW.len + 0.04, 0)), surface: 'swing', dx };
  }
  function besides(b) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (b.surface === 'bath') return bathSpot(b.pos);
    if (b.surface === 'swing') { const s = swingSpot(); if (s) return s; }
    if (b.surface === 'branch') {
      const nudge = (v0, lo, hi) => {
        const a = clamp(v0 + side * 0.9, lo, hi);
        return Math.abs(a - v0) > 0.5 ? a : clamp(v0 - side * 0.9, lo, hi);
      };
      if (Math.abs(b.pos.y - (BR1.y + 0.08)) < 0.1) return { p: new THREE.Vector3(nudge(b.pos.x, BR1.x0, BR1.x1), b.pos.y, BR1.z), surface: 'branch' };
      return { p: new THREE.Vector3(BR2.x, b.pos.y, nudge(b.pos.z, BR2.z0, BR2.z1)), surface: 'branch' };
    }
    return { p: groundPoint(b.pos.x + side * 1.0, b.pos.z + 0.5), surface: 'ground' };
  }
  function nearestFriend() {
    let best = null, bd = Infinity;
    actors.forEach((r) => { if (r === player || !r.b.group.visible) return; const d = r.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = r; } });
    return best;
  }
  function faceEachOther(a, b) {
    a.rotTarget = angleTo(a.pos, b.pos);
    if (!b.remote) b.rotTarget = angleTo(b.pos, a.pos);
  }

  // ---- resident life ---------------------------------------------------------------------------
  let entering = null;
  function think(r) {
    if (r.move || (r.action && r.action.until > clock)) return;
    const x = Math.random();
    let spot = null;
    if (x < 0.14 && r.pos.distanceTo(player.pos) < 12 && !entering) {
      spot = besides(player);
      flyTo(r, spot.p, spot.surface, () => { faceEachOther(r, player); say(r, pick(HELLO)); playCall('chirp', r.pitch, loudness(r)); });
      return;
    }
    if (x < 0.3) spot = branchSpot();
    else if (x < 0.4) spot = bathSpot();
    else if (x < 0.48) spot = swingSpot();
    else if (x < 0.56) spot = pondSpot();
    else if (x < 0.64) { const p = pick(PILES); spot = { p: groundPoint(p.x + 0.4, p.z + 0.4), surface: 'ground' }; }
    else if (x < 0.76) spot = { p: r.house.perch.clone(), surface: 'perch' };
    if (!spot) {
      const base = r.house.front;
      spot = { p: groundPoint(base.x + (Math.random() - 0.5) * 6, base.z + (Math.random() - 0.5) * 6), surface: 'ground' };
    }
    if (spot.surface === 'perch' && actors.some((o) => o !== r && o.pos.distanceTo(spot.p) < 0.4)) return;
    const s = spot;
    goTo(r, s.p, s.surface, () => {
      if (s.surface === 'swing') r.swingDx = s.dx;
      if (s.surface === 'bath') { act(r, 'HAPPY', 2.5); r.rotTarget = angleTo(r.pos, new THREE.Vector3(BATH.x, 0, BATH.z)); }
      else if (s.pond) r.rotTarget = angleTo(r.pos, new THREE.Vector3(POND.x, 0, POND.z));
      else if (s.surface === 'perch') r.rotTarget = dirAngle(r.house.front.x - r.house.perch.x, r.house.front.z - r.house.perch.z);
    });
  }
  function keepApart() {
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i], b = actors[j];
        if (a.move || b.move || a.scale < 1 || b.scale < 1 || a.remote || b.remote) continue;
        if (!onGround(a.pos) || !onGround(b.pos)) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = 0.9;
        if (d >= min || d < 0.0001) continue;
        const push = (min - d) / 2, nx = dx / d, nz = dz / d;
        [[a, -1], [b, 1]].forEach(([s, sign]) => {
          const p = groundPoint(s.pos.x + sign * nx * push, s.pos.z + sign * nz * push);
          s.pos.x = p.x;
          s.pos.z = p.z;
        });
      }
    }
  }

  // ---- houses: going in and coming out ---------------------------------------------------------
  const input = { x: 0, y: 0 };
  function enterHouse(hh) {
    if (entering && entering.phase !== 'out') return;
    if (entering) { player.scale = 1; player.pos.copy(entering.h.perch); }
    entering = { h: hh, phase: 'approach' };
    player.action = null;
    input.x = input.y = 0;
    const toPerch = () => {
      flyTo(player, hh.perch, 'perch', () => {
        player.rotTarget = dirAngle(hh.door.x - hh.perch.x, hh.door.z - hh.perch.z);
        say(player, hh.card.mine ? '다녀왔어요!' : '실례합니다!', 1.2);
        playCall('chirp', 1, 0.8);
        setTimeout(() => { if (entering) entering = { h: hh, phase: 'in', t0: clock }; }, 650);
      });
    };
    if (onGround(player.pos) && !flying && player.pos.distanceTo(hh.front) < 10 && !blocked(player.pos, hh.front)) walkTo(player, hh.front, toPerch);
    else toPerch();
  }

  // ---- third-person camera -----------------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const cam = { yaw: 0, pitch: 0.42, dist: 9, yawT: 0, pitchT: 0.42, distT: 9 };
  const look = new THREE.Vector3();
  let w = 1, h = 1;
  function resize() {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a little wider on tall phones so the bird does not fill the screen
    camera.fov = w / h < 0.7 ? 58 : 50;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  const camTarget = new THREE.Vector3();
  const camRay = new THREE.Raycaster();
  const camDir = new THREE.Vector3();
  let camReach = 9; // how far the camera can actually sit before a tree or house gets in the way
  function stepCamera(dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 10);
    cam.yaw = lerpAngle(cam.yaw, cam.yawT, k);
    cam.pitch += (cam.pitchT - cam.pitch) * k;
    cam.dist += (cam.distT - cam.dist) * k;
    camTarget.set(player.pos.x, player.pos.y + 0.9, player.pos.z);
    if (snap) look.copy(camTarget);
    else look.lerp(camTarget, 1 - Math.exp(-dt * 6));
    const cp = Math.cos(cam.pitch);
    camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    camRay.set(look, camDir);
    camRay.far = cam.dist;
    const hit = camRay.intersectObjects(occluders, false)[0];
    const want = hit ? Math.max(2.4, hit.distance - 0.4) : cam.dist;
    // come in at once so the bird is never hidden, go back out gently
    camReach = snap || want < camReach ? want : camReach + (want - camReach) * (1 - Math.exp(-dt * 2.5));
    camera.position.copy(look).addScaledVector(camDir, camReach);
    if (camera.position.y < 0.4) camera.position.y = 0.4;
    camera.lookAt(look);
    // shadows follow the player
    sun.position.set(look.x + 10, look.y + 22, look.z - 8);
    sun.target.position.set(look.x, 0, look.z);
  }

  // ---- input --------------------------------------------------------------------------------------
  const keys = new Set();
  const onKeyDown = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
    if (e.code === 'Space') { e.preventDefault(); api.toggleFly(); }
  };
  const onKeyUp = (e) => keys.delete(e.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0x2b2622, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  let markerT = -9;
  const landables = [];
  const land = (geo, pos, fn) => {
    const m = new THREE.Mesh(geo, hitMat);
    m.position.copy(pos);
    m.userData.land = fn;
    scene.add(m);
    landables.push(m);
  };
  land(new THREE.BoxGeometry(BR1.x1 - BR1.x0 + 0.4, 0.8, 0.8), new THREE.Vector3((BR1.x0 + BR1.x1) / 2, BR1.y, BR1.z),
    (pt) => ({ p: new THREE.Vector3(clamp(pt.x, BR1.x0, BR1.x1), BR1.y + 0.08, BR1.z), surface: 'branch' }));
  land(new THREE.BoxGeometry(0.8, 0.8, BR2.z1 - BR2.z0 + 0.4), new THREE.Vector3(BR2.x, BR2.y, (BR2.z0 + BR2.z1) / 2),
    (pt) => ({ p: new THREE.Vector3(BR2.x, BR2.y + 0.08, clamp(pt.z, BR2.z0, BR2.z1)), surface: 'branch' }));
  land(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 12), new THREE.Vector3(BATH.x, 0.7, BATH.z), (pt) => bathSpot(pt));
  land(new THREE.BoxGeometry(2.0, 0.9, 1.4), new THREE.Vector3(SW.x, SW.top - SW.len, SW.z), () => swingSpot());

  const cv = renderer.domElement;
  function pointerRay(cx, cy) {
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const onDown = (e) => {
    cv.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.distT };
      if (drag) drag.moved = true;
    }
  };
  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.distT = clamp(pinch.dist * (pinch.d / Math.max(d, 1)), 3.5, 18);
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) drag.moved = true;
    if (!drag.moved) return;
    cam.yawT -= ((e.clientX - drag.x) / Math.max(w, 1)) * Math.PI * 1.6;
    cam.pitchT = clamp(cam.pitchT + ((e.clientY - drag.y) / Math.max(h, 1)) * 1.8, 0.08, 1.3);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    const d = drag;
    drag = null;
    if (!d || d.moved || entering) return;
    tap(e.clientX, e.clientY);
  };
  const onCancel = (e) => { pointers.delete(e.pointerId); pinch = null; drag = null; };
  const onWheel = (e) => { e.preventDefault(); cam.distT = clamp(cam.distT * (1 + Math.sign(e.deltaY) * 0.1), 3.5, 18); };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onCancel);
  cv.addEventListener('wheel', onWheel, { passive: false });

  function tap(cx, cy) {
    pointerRay(cx, cy);
    const others = actors.filter((a) => a !== player && a.b.group.visible);
    const birdHit = ray.intersectObjects(others.map((x) => x.b.group), true)[0];
    if (birdHit) {
      const other = others.find((x) => { let o = birdHit.object; while (o) { if (o === x.b.group) return true; o = o.parent; } return false; });
      if (other) {
        const spot = besides(other);
        goTo(player, spot.p, spot.surface, () => {
          if (spot.surface === 'swing') player.swingDx = spot.dx;
          faceEachOther(player, other);
          if (!other.remote) {
            act(other, 'CHIRP', 0.7);
            say(other, pick(HELLO));
            playCall('chirp', other.pitch, loudness(other));
          }
        });
        if (onBirdTap) {
          onBirdTap(other.remote
            ? { handle: other.remote.home || null, nickname: null, birdName: other.name, remote: true }
            : { handle: other.house.handle, nickname: other.house.card.owner.nickname, birdName: other.name, remote: false });
        }
        return;
      }
    }
    const houseHit = ray.intersectObjects(houseHits, false)[0];
    if (houseHit) {
      if (houseHit.object.userData.kind === 'house') enterHouse(houses[houseHit.object.userData.index]);
      else if (onEmptyLot) onEmptyLot();
      return;
    }
    let target, surface = 'ground', dx = 0;
    const hit = ray.intersectObjects(landables, false)[0];
    if (hit) {
      const L = hit.object.userData.land(hit.point);
      if (!L) { say(player, '자리가 없어요', 1); return; }
      target = L.p;
      surface = L.surface;
      dx = L.dx ?? 0;
    } else {
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;
      if (p.distanceTo(player.pos) > 40) return;
      target = groundPoint(p.x, p.z);
    }
    player.action = null;
    goTo(player, target, surface, () => {
      if (surface === 'swing') { player.swingDx = dx; say(player, '흔들흔들', 1.2); }
      if (surface === 'bath') { act(player, 'HAPPY', 2.5); say(player, '첨벙첨벙', 1.4); }
    });
    marker.position.set(target.x, target.y + 0.03, target.z);
    markerT = clock;
  }

  /** Joystick or keys: walk (or fly) relative to where the camera looks. */
  function stepControl(dt) {
    let ix = input.x, iy = input.y;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    const mag = Math.min(1, Math.hypot(ix, iy));
    if (mag < 0.12 || entering) return false;
    player.move = null;
    player.action = null;
    if (!flying && !onGround(player.pos)) { flying = true; landing = false; } // stepping off a branch or perch means flying
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const n = Math.hypot(ix, iy);
    const dx = (fx * iy + rx * ix) / n, dz = (fz * iy + rz * ix) / n;
    const sp = (flying ? FLY_SPEED : WALK_SPEED) * mag;
    let x = player.pos.x + dx * sp * dt, z = player.pos.z + dz * sp * dt;
    if (!flying) {
      const p = groundPoint(x, z);
      x = p.x;
      z = p.z;
      player.surface = 'ground';
    } else {
      const d = Math.hypot(x, z);
      if (d > PARK_R + 6) { x *= (PARK_R + 6) / d; z *= (PARK_R + 6) / d; }
    }
    player.pos.x = x;
    player.pos.z = z;
    player.rotTarget = dirAngle(dx, dz);
    return true;
  }
  function stepFlight(dt) {
    if (!flying || player.move) return;
    const alt = landing ? 0 : CRUISE;
    player.pos.y += (alt - player.pos.y) * (1 - Math.exp(-dt * (landing ? 3.5 : 2.5)));
    if (landing && player.pos.y < 0.06) {
      const p = groundPoint(player.pos.x, player.pos.z);
      player.pos.set(p.x, 0, p.z);
      flying = false;
      landing = false;
      player.surface = 'ground';
    }
  }

  // ---- remote players (other people online) ------------------------------------------------------
  const remotes = new Map();
  function remoteActor(pid, lk, s) {
    const b = makeBird(lk.colors, lk.species);
    scene.add(b.group);
    const a = actor(b, lk.name, { remote: { pid, home: lk.home || null, target: new THREE.Vector3(s.x, s.y, s.z), ry: s.ry || 0, m: s.m || 0 } });
    a.pos.set(s.x, s.y, s.z);
    a.b.group.rotation.y = a.rotTarget = s.ry || 0;
    remotes.set(pid, a);
    return a;
  }
  function stepRemotes(dt) {
    const k = 1 - Math.exp(-dt * 9);
    remotes.forEach((a) => {
      a.pos.lerp(a.remote.target, k);
      a.rotTarget = a.remote.ry;
    });
    if (remotes.size > MAX_REMOTES_DRAWN) {
      const sorted = [...remotes.values()].sort((p, q) => p.pos.distanceToSquared(player.pos) - q.pos.distanceToSquared(player.pos));
      sorted.forEach((a, i) => { a.b.group.visible = i < MAX_REMOTES_DRAWN; });
    }
  }

  // ---- hearts --------------------------------------------------------------------------------
  const sparks = [];
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff6b8a, transparent: true });
  function hearts(p) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), heartMat.clone());
      m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8));
      scene.add(m);
      sparks.push({ m, vy: 0.6 + Math.random() * 0.5, life: 1.6 });
    }
  }

  // ---- start: come out of the house we were in, or fly in through the ginkgo gate ---------------
  const from = startAt ? houses.find((x) => x.handle === startAt) : null;
  if (from) {
    player.pos.copy(from.perch);
    player.surface = 'perch';
    player.scale = 0.01;
    player.rotTarget = player.b.group.rotation.y = dirAngle(from.front.x - from.perch.x, from.front.z - from.perch.z);
    // camera out on the path, looking at the door the bird pops out of
    cam.yaw = cam.yawT = Math.atan2(from.front.x - from.door.x, from.front.z - from.door.z);
    entering = { h: from, phase: 'out', t0: 0 };
  } else {
    player.pos.set(0, 5, PARK_R + 2);
    flyTo(player, groundPoint(0, 23), 'ground', () => { say(player, '가을이다!', 1.6); playCall('chirp', 1, 0.8); });
  }
  stepCamera(0, true);

  // ---- loop ----------------------------------------------------------------------------------
  const v = new THREE.Vector3();
  function place(e, pos, lift, maxDist) {
    v.copy(pos);
    v.y += lift;
    const far = maxDist && v.distanceTo(camera.position) > maxDist;
    v.project(camera);
    const off = far || v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15;
    e.style.visibility = off ? 'hidden' : 'visible';
    if (!off) e.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  let raf = 0;
  let swingAmp = 0.1;
  let playerMode = 'idle';
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    const riders = swingRiders();
    swingAmp += ((riders.length ? 0.35 : 0.08) - swingAmp) * (1 - Math.exp(-dt * 0.8));
    swing.rotation.x = reduce ? 0 : Math.sin(clock * 1.7) * swingAmp;
    swing.updateMatrixWorld(true);
    riders.forEach((a) => a.pos.copy(swing.localToWorld(v.set(a.swingDx, -SW.len + 0.04, 0))));

    if (entering && entering.phase === 'in') {
      const k = Math.min(1, (clock - entering.t0) / 0.45);
      player.scale = 1 - k;
      player.pos.lerpVectors(entering.h.perch, entering.h.door, k);
      if (k >= 1) {
        const h0 = entering.h;
        entering = { h: h0, phase: 'gone' };
        if (onEnter) onEnter(h0.handle);
      }
    } else if (entering && entering.phase === 'out') {
      if (!entering.t0) entering.t0 = clock;
      const k = Math.min(1, (clock - entering.t0) / 0.45);
      player.scale = Math.max(0.01, k);
      player.pos.lerpVectors(entering.h.door, entering.h.perch, k);
      if (k >= 1) {
        const h0 = entering.h;
        entering = null;
        player.scale = 1;
        flyTo(player, h0.front, 'ground', () => { say(player, h0.card.mine ? '다시 앵파크로!' : '재밌었다!', 1.4); playCall('chirp', 1, 0.7); });
      }
    }

    const steering = stepControl(dt);
    stepFlight(dt);
    stepRemotes(dt);

    actors.forEach((a) => {
      if (!a.remote) stepMove(a, dt);
      let mode;
      if (a.remote) mode = a.action && a.action.until > clock ? a.action.name : CODE_MODE[a.remote.m] || 'idle';
      else if (a.move) mode = a.move.type === 'fly' ? 'FLY' : 'WALK';
      else if (a.isPlayer && flying) mode = 'FLY';
      else if (a.isPlayer && steering) mode = 'WALK';
      else if (a.action && a.action.until > clock) mode = a.action.name;
      else mode = a.isPlayer ? 'idle' : a.surface === 'branch' || a.surface === 'perch' ? 'CALM' : 'idle';
      if (a.isPlayer) playerMode = mode;
      a.b.pose(mode, reduce ? 0 : clock + a.pitch * 7);
      a.b.group.scale.setScalar(a.scale);
      a.b.group.rotation.y = lerpAngle(a.b.group.rotation.y, a.rotTarget, 1 - Math.exp(-dt * 9));
      if (a.bubbleUntil < clock) a.bubbleEl.hidden = true;
    });
    residents.forEach((r) => {
      if (clock > r.nextThink) { r.nextThink = clock + 6 + Math.random() * 8; think(r); }
      if (clock > r.nextChirp) {
        r.nextChirp = clock + 9 + Math.random() * 14;
        if (!r.move && loudness(r) > 0.05) { act(r, 'CHIRP', 0.5); playCall(Math.random() < 0.15 ? 'call' : 'chirp', r.pitch, loudness(r) * 0.5); }
      }
      if (!r.move && !(r.action && r.action.until > clock) && r.pos.distanceTo(player.pos) < 1.8) r.rotTarget = angleTo(r.pos, player.pos);
    });
    keepApart();

    // leaf piles burst when someone runs through
    PILES.forEach((p) => {
      if (clock < p.cool) return;
      const who = actors.find((a) => onGround(a.pos) && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 1.3
        && (a.move || (a.isPlayer && steering) || (a.remote && a.remote.m === 1)));
      if (!who) return;
      p.cool = clock + 2.2;
      leafBurst(p.x, p.z);
      if (who.isPlayer) say(player, '바스락!', 1.2);
    });

    // falling leaves around the view
    if (!driftReady) { D.forEach((d) => resetLeaf(d, look, false)); driftReady = true; }
    D.forEach((d, i) => {
      if (!reduce) {
        d.y -= d.vy * dt;
        d.x += Math.sin(clock * 1.3 + d.ph) * 0.6 * dt;
      }
      if (d.y < 0.03 || Math.abs(d.x - look.x) > 20 || Math.abs(d.z - look.z) > 20) resetLeaf(d, look, true);
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(Math.sin(clock * d.spin + d.ph) * 1.2, d.ph, Math.cos(clock * d.spin * 0.7 + d.ph) * 0.8);
      dummy.scale.setScalar(1.2);
      dummy.updateMatrix();
      drift.setMatrixAt(i, dummy.matrix);
    });
    drift.instanceMatrix.needsUpdate = true;
    B.forEach((b, i) => {
      if (b.life > 0) {
        b.life -= dt;
        b.v.y -= 6 * dt;
        b.v.x *= Math.exp(-dt * 1.5);
        b.v.z *= Math.exp(-dt * 1.5);
        if (b.v.y < -1.2) b.v.y = -1.2; // leaves flutter, they do not drop like stones
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < 0.03) { b.p.y = 0.03; b.v.set(0, 0, 0); }
        dummy.position.copy(b.p);
        dummy.rotation.set(clock * b.spin, i, clock * b.spin * 0.6);
        dummy.scale.setScalar(b.life > 0.3 ? 1.2 : b.life * 4);
      } else {
        dummy.position.set(0, -10, 0);
        dummy.scale.setScalar(0.001);
      }
      dummy.updateMatrix();
      burst.setMatrixAt(i, dummy.matrix);
    });
    burst.instanceMatrix.needsUpdate = true;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.m.position.y += s.vy * dt;
      s.m.material.opacity = Math.max(0, s.life / 1.6);
      if (s.life <= 0) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); sparks.splice(i, 1); }
    }

    stepCamera(dt, false);
    marker.material.opacity = Math.max(0, 0.8 - (clock - markerT) * 1.4);
    marker.scale.setScalar(1 + (clock - markerT) * 0.8);
    renderer.render(scene, camera);

    houses.forEach((hh) => place(hh.plate, hh.top, 0.2, 34));
    actors.forEach((a) => {
      const show = (a.isPlayer || a.pos.distanceTo(player.pos) < 7 || a.bubbleUntil > clock) && a.b.group.visible;
      a.tagEl.hidden = !show || a.scale < 0.5;
      if (show) place(a.tagEl, a.pos, 1.4, 40);
      if (!a.bubbleEl.hidden) place(a.bubbleEl, a.pos, 1.4, 40);
    });
  }
  raf = requestAnimationFrame(frame);

  // ---- what the page can call ----------------------------------------------------------------
  const api = {
    /** Joystick vector, x right and y forward, each -1..1. */
    setInput(x, y) {
      input.x = x;
      input.y = y;
    },
    /** Take off, or land when flying. Returns whether the bird is flying afterwards. */
    toggleFly() {
      if (entering) return flying;
      if (flying && !landing) { landing = true; return false; }
      player.move = null;
      flying = true;
      landing = false;
      player.surface = 'air';
      say(player, '훨훨', 0.9);
      return true;
    },
    isFlying: () => flying && !landing,
    chirp() {
      if (entering) return;
      act(player, 'CHIRP', 0.7);
      say(player, pick(CHIRPS), 1.2);
      playCall('chirp', 1, 0.85);
      residents.forEach((r) => {
        if (r.pos.distanceTo(player.pos) > 7) return;
        setTimeout(() => {
          act(r, 'CHIRP', 0.7);
          say(r, pick(REPLIES));
          playCall('chirp', r.pitch, loudness(r));
          if (!r.move) r.rotTarget = angleTo(r.pos, player.pos);
        }, 350 + Math.random() * 700);
      });
    },
    /** One of the preset lines over my head. */
    say(text) {
      say(player, text, 2.6);
    },
    /** Dance with the nearest bird; returns its name, or null when nobody is around. */
    playTogether() {
      if (entering) return null;
      const r = nearestFriend();
      if (!r) return null;
      player.move = null;
      const go = () => {
        faceEachOther(player, r);
        act(player, 'DANCE', 2.4);
        if (!r.remote) { act(r, 'DANCE', 2.4); say(r, pick(PLAY_LINES), 2); playCall('call', r.pitch, loudness(r)); }
        hearts(player.pos.clone().lerp(r.pos, 0.5));
        setTimeout(() => playCall('chirp', 1, 0.8), 500);
      };
      const close = r.pos.distanceTo(player.pos) < 1.6 && Math.abs(r.pos.y - player.pos.y) < 0.4;
      if (close) go();
      else if (r.remote) { const s = besides(r); goTo(player, s.p, s.surface, go); }
      else {
        const spot = besides(player);
        r.action = null;
        flyTo(r, spot.p, spot.surface, go);
      }
      return r.name;
    },
    /** Fly to a house and go in. False when that house is not in this park. */
    enter(handle) {
      const hh = houses.find((x) => x.handle === handle);
      if (!hh) return false;
      enterHouse(hh);
      return true;
    },
    /** My position and pose for the network; hidden while inside a door. */
    state() {
      return { x: player.pos.x, y: player.pos.y, z: player.pos.z, ry: player.b.group.rotation.y, m: MODE_CODE[playerMode] ?? 0 };
    },
    addRemote(pid, lk, s) {
      if (!remotes.has(pid)) remoteActor(pid, lk, s);
    },
    updateRemote(pid, s) {
      const a = remotes.get(pid);
      if (!a) return;
      a.remote.target.set(s.x, s.y, s.z);
      a.remote.ry = s.ry;
      a.remote.m = s.m;
    },
    lookRemote(pid, lk) {
      const a = remotes.get(pid);
      if (!a) return;
      const s = { x: a.remote.target.x, y: a.remote.target.y, z: a.remote.target.z, ry: a.remote.ry, m: a.remote.m };
      dropActor(a);
      remotes.delete(pid);
      remoteActor(pid, lk, s);
    },
    removeRemote(pid) {
      const a = remotes.get(pid);
      if (!a) return;
      dropActor(a);
      remotes.delete(pid);
    },
    clearRemotes() {
      [...remotes.keys()].forEach((pid) => api.removeRemote(pid));
    },
    emoteRemote(pid, id) {
      const a = remotes.get(pid);
      if (!a) return;
      if (id === 'chirp') { act(a, 'CHIRP', 0.7); say(a, pick(CHIRPS), 1.2); playCall('chirp', 1.05, loudness(a)); }
      else if (id === 'dance') { act(a, 'DANCE', 2.4); hearts(a.pos.clone()); }
    },
    sayRemote(pid, text) {
      const a = remotes.get(pid);
      if (a) say(a, text, 2.6);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onCancel);
      cv.removeEventListener('wheel', onWheel);
      disposeScene(scene);
      renderer.dispose();
      cv.remove();
      labels.remove();
    },
  };
  return api;
}
