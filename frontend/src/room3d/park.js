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
const CRUISE_MIN = 0.8;
const CRUISE_MAX = 9;
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
  // sky: a gradient dome from a warm autumn horizon to the top, by the time of day in Korea
  const SKY = env.night ? ['#0B1230', '#2B355E']
    : env.sky === '#F4A97A' ? ['#6A73B0', '#F6B183']
      : env.sky === '#C9B8D8' ? ['#8C8FC4', '#EBC9D2']
        : ['#6FA8DC', '#F4DFC2'];
  const skyC = SKY[1];
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(toLinear(skyC), 45, 175);
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
  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x6f7a4a, env.night ? 0.42 : 0.62));
  const sun = new THREE.DirectionalLight(env.night ? 0x9fb4ff : 0xffe2b8, env.night ? 0.5 : Math.min(env.light, 0.95));
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  scene.add(sun, sun.target);

  const rnd = mulberry(11);
  const obstacles = [];
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  // ---- ground, paths, horizon -------------------------------------------------------------
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(env.night ? '#4E5A34' : '#8A9A50'));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.04;
  scene.add(meadow);
  // the lawn is a grid with a little colour noise, fading into the meadow at the edge
  const LAWN = (PARK_R + 6) * 2;
  const lawnGeo = new THREE.PlaneGeometry(LAWN, LAWN, 72, 72);
  lawnGeo.rotateX(-Math.PI / 2);
  const lawnCols = [];
  const gA = new THREE.Color(env.night ? '#5E6B3C' : '#9DB25E'), gB = new THREE.Color(env.night ? '#4F5C33' : '#7E9A4C');
  const gC = new THREE.Color(env.night ? '#6A6A3E' : '#B9AE5C'), gM = new THREE.Color(env.night ? '#4E5A34' : '#8A9A50');
  const lp = lawnGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), z = lp.getZ(i);
    const n = (Math.sin(x * 0.23) + Math.sin(z * 0.19 + 1.3) + Math.sin((x + z) * 0.11 + 2.1) + Math.sin((x - z) * 0.37)) / 4;
    const cc = gA.clone().lerp(gB, clamp(0.5 + n, 0, 1));
    if (n > 0.35) cc.lerp(gC, Math.min(0.6, (n - 0.35) * 1.8));
    cc.lerp(gM, clamp((Math.hypot(x, z) - PARK_R) / 5, 0, 1));
    cc.convertSRGBToLinear();
    lawnCols.push(cc.r, cc.g, cc.b);
  }
  lawnGeo.setAttribute('color', new THREE.Float32BufferAttribute(lawnCols, 3));
  const lawn = new THREE.Mesh(lawnGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  lawn.receiveShadow = true;
  scene.add(lawn);

  const domeGeo = new THREE.SphereGeometry(300, 32, 16);
  const top = new THREE.Color(SKY[0]), hor = new THREE.Color(SKY[1]);
  const domeCols = [];
  const dp = domeGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const k = clamp((dp.getY(i) / 300) * 1.7, 0, 1);
    domeCols.push(...hor.clone().lerp(top, Math.pow(k, 0.8)).convertSRGBToLinear().toArray());
  }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(domeCols, 3));
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -1;
  scene.add(dome);
  if (env.night) {
    const sp = [];
    for (let i = 0; i < 420; i++) {
      const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.3;
      sp.push(Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    dome.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6d8, size: 1.6, sizeAttenuation: false, fog: false })));
  }
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
  // rolling autumn hills all around, two rows
  const HILLS = ['#B8642E', '#C98A3A', '#8E5A2E', '#5E6E3A', '#A8452C', '#D9A24A'];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rnd() * 0.25 + row * 0.14;
      const r = (row ? 135 : 95) + rnd() * 20;
      const R = (row ? 38 : 26) + rnd() * 16;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), mat(tint(pick(HILLS), env.night ? '#1B2036' : SKY[1], row ? 0.45 : 0.25)));
      hill.scale.y = 0.32 + rnd() * 0.2;
      hill.position.set(Math.cos(a) * r, -R * 0.08, Math.sin(a) * r);
      scene.add(hill);
    }
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
    obstacles.push({ x, z, r: 0.45 * s, h: 2.6 * s });
  }
  function addGinkgo(x, z) {
    trunks.push({ x, z, h: 2.0, r: 0.16 });
    crowns.push({ x, y: 3.0, z, r: 0.85, color: rnd() < 0.5 ? '#F2C53D' : '#E8B92E', cone: true });
    obstacles.push({ x, z, r: 0.35, h: 2.0 });
  }
  const PATH_A = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const POND = { x: -21, z: -14, r: 5 };
  // corners of the park, each with its own thing to do
  const ZONES = {
    pampas: { x: 19.5, z: 19.5, r: 7.5 },
    cosmos: { x: -19.5, z: 19.5, r: 7.5 },
    persimmon: { x: 12, z: -21, r: 3.5 },
    gym: { x: 26, z: -4.5, r: 3 },
    pavilion: { x: -28.5, z: 0, r: 4.2 },
  };
  const streamCurve = new THREE.CatmullRomCurve3([[-17.4, -17.4], [-12, -22], [-6, -26], [0, -28.5], [6, -31], [10.5, -35]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const streamPts = streamCurve.getSpacedPoints(64);
  const inZone = (x, z, pad) => Object.values(ZONES).some((q) => Math.hypot(x - q.x, z - q.z) < q.r + pad)
    || streamPts.some((q) => Math.hypot(x - q.x, z - q.z) < pad + 0.8);
  // ginkgo avenue along the entrance path (+z)
  for (let z = 15; z < PARK_R - 2; z += 3.6) [-3.0, 3.0].forEach((x) => addGinkgo(x, z));
  // maples between the houses and the park edge
  for (let i = 0, tries = 0; i < (small ? 46 : 64) && tries < 2000; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 20.5 + rnd() * (PARK_R - 22);
    if (PATH_A.some((p) => angDiff(a, p) < 2.4 / r + 0.04)) continue;
    const p = at(a, r);
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 2.5) continue;
    if (inZone(p.x, p.z, 2.4)) continue;
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
  obstacles.push({ x: 0, z: 0, r: 1.9 });
  const bed = new THREE.Mesh(new THREE.RingGeometry(0.5, 2.1, 28), mat('#7A5A3E'));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.015;
  scene.add(bed);
  const MUMS = ['#F2C53D', '#EDE7F4', '#B776C9', '#F08A24', '#E25B4E'];
  const mumMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 48);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + rnd() * 0.1, r = 1.05 + (i % 3) * 0.38;
    dummy.position.set(Math.cos(a) * r, 0.18 + rnd() * 0.08, Math.sin(a) * r);
    dummy.rotation.set(rnd(), rnd(), rnd());
    dummy.scale.setScalar(0.8 + rnd() * 0.5);
    dummy.updateMatrix();
    mumMesh.setMatrixAt(i, dummy.matrix);
    mumMesh.setColorAt(i, col.set(MUMS[i % MUMS.length]).convertSRGBToLinear());
  }
  scene.add(mumMesh);

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
  obstacles.push({ x: POND.x, z: POND.z, r: POND.r + 0.3, h: 0 });

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
  obstacles.push({ x: BATH.x, z: BATH.z, r: 1.0, h: 0.95 });

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

  // ---- zones ---------------------------------------------------------------------------------
  let gymLanding = null;
  const zoneLands = []; // [geometry, position, land(point)] registered once tapping is set up
  const zoneSpots = []; // places the resident birds like to visit
  const ticks = []; // per-frame animations of the zones

  // 억새밭: silver grass that sways, and bends away when a bird walks through
  const PZ = ZONES.pampas;
  const pampasN = small ? 150 : 270;
  const stalkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 1, 4), mat('#B9A46A'), pampasN);
  const plumeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), pampasN);
  const pampas = [];
  for (let i = 0; i < pampasN; i++) {
    // clumps of three stalks fanning out from one spot
    if (i % 3 === 0) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * PZ.r;
      pampas.clumpX = PZ.x + Math.cos(a) * r;
      pampas.clumpZ = PZ.z + Math.sin(a) * r;
    }
    pampas.push({ x: pampas.clumpX + (rnd() - 0.5) * 0.3, z: pampas.clumpZ + (rnd() - 0.5) * 0.3, h: 1.1 + rnd() * 1.0, ph: rnd() * 6, lean: ((i % 3) - 1) * 0.22 + (rnd() - 0.5) * 0.1, push: 0, dir: 1 });
    plumeMesh.setColorAt(i, col.set(pick(['#EDE3CF', '#E6D7BA', '#EAD3C6', '#F2EADB'])).convertSRGBToLinear());
  }
  scene.add(stalkMesh, plumeMesh);
  ticks.push((t, dt) => {
    pampas.forEach((p, i) => {
      let near = 0, dir = p.dir;
      for (const a of actors) {
        if (a.pos.y > 1.6) continue;
        const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
        if (d < 1.1 && 1 - d / 1.1 > near) { near = 1 - d / 1.1; dir = p.x >= a.pos.x ? 1 : -1; }
      }
      p.dir = dir;
      p.push += (near - p.push) * Math.min(1, dt * 6);
      const ang = Math.sin(t * 1.3 + p.ph) * 0.08 + p.lean + p.push * 0.6 * p.dir;
      dummy.position.set(p.x + Math.sin(ang) * p.h / 2, Math.cos(ang) * p.h / 2, p.z);
      dummy.rotation.set(0, 0, -ang);
      dummy.scale.set(1, p.h, 1);
      dummy.updateMatrix();
      stalkMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x + Math.sin(ang) * p.h, Math.cos(ang) * p.h + 0.12, p.z);
      dummy.scale.set(0.13, 0.42, 0.13);
      dummy.updateMatrix();
      plumeMesh.setMatrixAt(i, dummy.matrix);
    });
    stalkMesh.instanceMatrix.needsUpdate = true;
    plumeMesh.instanceMatrix.needsUpdate = true;
  });
  zoneSpots.push(() => { const a = Math.random() * 6.28, r = Math.random() * PZ.r * 0.8; return { p: groundPoint(PZ.x + Math.cos(a) * r, PZ.z + Math.sin(a) * r), surface: 'ground' }; });

  // 코스모스 밭
  const CZ = ZONES.cosmos;
  const cosN = small ? 240 : 420;
  const stemMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 3), mat('#5E8A3A'), cosN);
  const petalGeo = new THREE.CircleGeometry(0.15, 8);
  petalGeo.rotateX(-Math.PI / 2);
  const petalMesh = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), cosN);
  const eyeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 5, 4), mat('#F2C53D'), cosN);
  for (let i = 0; i < cosN; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * CZ.r, hh = 0.45 + rnd() * 0.55;
    const x = CZ.x + Math.cos(a) * r, z = CZ.z + Math.sin(a) * r;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, hh / 2, z);
    dummy.scale.set(1, hh, 1);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, hh, z);
    dummy.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7);
    dummy.scale.setScalar(0.8 + rnd() * 0.5);
    dummy.updateMatrix();
    petalMesh.setMatrixAt(i, dummy.matrix);
    petalMesh.setColorAt(i, col.set(pick(['#F29BC0', '#D9478B', '#F7F1F4', '#E87AAE', '#C93A7A', '#F5B8D2'])).convertSRGBToLinear());
    dummy.position.y += 0.02;
    dummy.updateMatrix();
    eyeMesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(stemMesh, petalMesh, eyeMesh);
  zoneSpots.push(() => { const a = Math.random() * 6.28, r = Math.random() * CZ.r * 0.8; return { p: groundPoint(CZ.x + Math.cos(a) * r, CZ.z + Math.sin(a) * r), surface: 'ground' }; });
  // pumpkins along the flower field and the paths
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, r = CZ.r + 0.8 + rnd() * 1.2;
    const x = i < 8 ? CZ.x + Math.cos(a) * r : (i % 2 ? 1.6 : -1.6), z = i < 8 ? CZ.z + Math.sin(a) * r : 14 + i * 1.7;
    const pk = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(i % 4 ? '#E8812E' : '#F2A23A'));
    const sz = 0.28 + rnd() * 0.2;
    pk.scale.set(sz, sz * 0.75, sz);
    pk.position.set(x, sz * 0.7, z);
    pk.castShadow = true;
    scene.add(pk);
    rod(scene, new THREE.Vector3(x, sz * 1.35, z), new THREE.Vector3(x + 0.04, sz * 1.35 + 0.14, z), 0.03, '#5E6E3A');
  }

  // 감나무: a persimmon tree full of fruit; land on a branch and have one
  const PS = ZONES.persimmon;
  rod(scene, new THREE.Vector3(PS.x, 0, PS.z), new THREE.Vector3(PS.x, 3.6, PS.z), 0.3, '#5E4632');
  [[0, 4.4, 0, 1.8, '#C8552B'], [1.1, 3.9, 0.6, 1.2, '#B8432A'], [-1, 4.0, -0.5, 1.3, '#D9733A']].forEach(([dx, y, dz, r, cc]) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(cc));
    m.position.set(PS.x + dx, y, PS.z + dz);
    m.castShadow = true;
    scene.add(m);
  });
  obstacles.push({ x: PS.x, z: PS.z, r: 0.6 });
  const fruitGeo = new THREE.SphereGeometry(0.17, 10, 8);
  const fruitMat = mat('#F08A1C');
  const fruits = [];
  const persBranches = [{ a: 0.5, y: 2.5 }, { a: 2.6, y: 2.9 }, { a: 4.4, y: 2.3 }].map((b, bi) => {
    const dx = Math.cos(b.a), dz = Math.sin(b.a);
    rod(scene, new THREE.Vector3(PS.x + dx * 0.2, b.y, PS.z + dz * 0.2), new THREE.Vector3(PS.x + dx * 2.2, b.y + 0.15, PS.z + dz * 2.2), 0.07, '#5E4632');
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(fruitGeo, fruitMat);
      const d = 1.0 + k * 0.45;
      f.position.set(PS.x + dx * d + dz * 0.12, b.y - 0.2, PS.z + dz * d - dx * 0.12);
      f.castShadow = true;
      scene.add(f);
      fruits.push({ m: f, branch: bi, back: 0 });
    }
    return { ...b, dx, dz };
  });
  for (let k = 0; k < 16; k++) {
    // more fruit hanging from the crown
    const a = rnd() * Math.PI * 2, r = 1.2 + rnd() * 0.6;
    const f = new THREE.Mesh(fruitGeo, fruitMat);
    f.position.set(PS.x + Math.cos(a) * r, 3.3 + rnd() * 0.8, PS.z + Math.sin(a) * r);
    scene.add(f);
  }
  function eatPersimmon(a, bi) {
    const f = fruits.find((x) => x.branch === bi && x.m.visible);
    act(a, 'EAT', 2.4);
    say(a, f ? pick(['냠냠!', '달다!', '홍시 최고']) : '다 먹었네...', 1.8);
    if (f) { f.m.visible = false; f.back = clock + 40; }
  }
  ticks.push(() => fruits.forEach((f) => { if (!f.m.visible && clock > f.back) f.m.visible = true; }));
  const branchPoint = (b, d) => new THREE.Vector3(PS.x + b.dx * d, b.y + 0.08 + 0.15 * (d / 2.2), PS.z + b.dz * d);
  persBranches.forEach((b, bi) => {
    const mid = branchPoint(b, 1.2);
    const g = new THREE.BoxGeometry(2.2, 0.8, 0.8);
    g.rotateY(-b.a);
    zoneLands.push([g, mid, (pt) => {
      const d = clamp((pt.x - PS.x) * b.dx + (pt.z - PS.z) * b.dz, 0.7, 2.0);
      return { p: branchPoint(b, d), surface: 'twig', after: (who) => eatPersimmon(who, bi) };
    }]);
    zoneSpots.push(() => ({ p: branchPoint(b, 0.8 + Math.random() * 1.1), surface: 'twig', after: (who) => eatPersimmon(who, bi) }));
  });

  // 놀이터: a bird gym with a top bar, a ladder, a ring and a bell
  const GZ = ZONES.gym;
  const gym = new THREE.Group();
  gym.position.set(GZ.x, 0, GZ.z);
  gym.rotation.y = Math.atan2(-GZ.x, -GZ.z);
  scene.add(gym);
  const gpart = (geo, cc, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat(cc)); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; gym.add(m); return m; };
  [-1.1, 1.1].forEach((x) => gpart(new THREE.CylinderGeometry(0.08, 0.08, 2.7, 8), '#C98A4B', x, 1.35, 0));
  gpart(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), '#E0473A', 0, 2.62, 0, Math.PI / 2);
  // ladder leaning on the right post
  [-0.22, 0.22].forEach((z) => gpart(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), '#F2C53D', 1.65, 1.3, z, 0.3));
  for (let k = 0; k < 6; k++) {
    const y = 0.25 + k * 0.42, x = 2.05 - k * 0.13;
    const rung = gpart(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 6), '#4A8FD1', x, y, 0);
    rung.rotation.x = Math.PI / 2;
  }
  const ringG = new THREE.Group();
  ringG.position.set(-0.45, 2.6, 0);
  gym.add(ringG);
  const ropeL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), mat('#6B5A48'));
  ropeL.position.y = -0.45;
  ringG.add(ropeL);
  const gymRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 20), mat('#4A8FD1'));
  gymRing.position.y = -1.15;
  ringG.add(gymRing);
  const bellG = new THREE.Group();
  bellG.position.set(0.55, 2.6, 0);
  gym.add(bellG);
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 10, 1, true), new THREE.MeshStandardMaterial({ color: toLinear('#E7B83C'), metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
  bell.position.y = -0.3;
  bellG.add(bell);
  let ding = 0;
  ticks.push((t, dt) => {
    ding = Math.max(0, ding - dt * 0.6);
    bellG.rotation.x = Math.sin(t * 14) * ding * 0.6;
    ringG.rotation.x = Math.sin(t * 2.2) * 0.12 + Math.sin(t * 9) * ding * 0.2;
  });
  gym.updateMatrixWorld(true);
  obstacles.push({ x: GZ.x, z: GZ.z, r: 1.4, h: 2.6 });
  const gymTop = (u) => gym.localToWorld(new THREE.Vector3(clamp(u, -1.0, 1.0), 2.7, 0));
  gymLanding = (x, z) => ({ p: gymTop(gym.worldToLocal(new THREE.Vector3(x, 0, z)).x), surface: 'gym' });
  const ringDing = (who) => { ding = 1; say(who, pick(['땡그랑!', '땡땡!', '높다!']), 1.4); playCall('chirp', 1.5, loudness(who) * 0.5); };
  {
    const g = new THREE.BoxGeometry(2.4, 0.7, 0.7);
    g.rotateY(gym.rotation.y);
    zoneLands.push([g, gymTop(0), (pt) => {
      const local = gym.worldToLocal(pt.clone());
      return { p: gymTop(local.x), surface: 'gym', after: ringDing };
    }]);
    const ringSpot = gym.localToWorld(new THREE.Vector3(-0.45, 1.5, 0));
    zoneLands.push([new THREE.SphereGeometry(0.5, 8, 6), ringSpot.clone().setY(1.5), () => ({ p: ringSpot.clone(), surface: 'ring', after: (who) => say(who, '흔들흔들', 1.2) })]);
    zoneSpots.push(() => ({ p: gymTop((Math.random() - 0.5) * 1.8), surface: 'gym', after: ringDing }));
  }

  // 정자: a Korean pavilion at the end of the west path; the roof has the best view
  const PV = ZONES.pavilion;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.0, 0.08, 6), mat('#B98552'));
  deck.position.set(PV.x, 0.0, PV.z);
  deck.rotation.y = Math.PI / 6;
  deck.receiveShadow = true;
  scene.add(deck);
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    const x = PV.x + Math.cos(a) * 2.55, z = PV.z + Math.sin(a) * 2.55;
    rod(scene, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.35, z), 0.13, '#9B2F25');
    obstacles.push({ x, z, r: 0.25, h: 2.4 });
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.22, 6, 1, true), new THREE.MeshStandardMaterial({ color: toLinear('#2F6A55'), flatShading: true, side: THREE.DoubleSide }));
  beam.position.set(PV.x, 2.32, PV.z);
  beam.rotation.y = Math.PI / 6;
  scene.add(beam);
  const eave = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.1, 6), mat('#2B3330'));
  eave.position.set(PV.x, 2.45, PV.z);
  eave.rotation.y = Math.PI / 6;
  eave.castShadow = true;
  scene.add(eave);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.5, 6), mat('#3E4A46'));
  roof.position.set(PV.x, 3.25, PV.z);
  roof.rotation.y = Math.PI / 6;
  roof.castShadow = true;
  scene.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat('#C9A24E'));
  finial.position.set(PV.x, 4.08, PV.z);
  scene.add(finial);
  const roofTop = new THREE.Vector3(PV.x, 4.2, PV.z);
  obstacles.push({ x: PV.x, z: PV.z, r: 3.7, h: 4.1, low: 2.35, air: true });
  zoneLands.push([new THREE.CylinderGeometry(1.2, 2.2, 1.4, 6), new THREE.Vector3(PV.x, 3.4, PV.z), () => ({ p: roofTop.clone(), surface: 'roof', after: (who) => say(who, pick(['경치 좋다!', '여기 최고', '단풍 바다다']), 1.8) })]);
  zoneSpots.push(() => (actors.some((o) => o.pos.distanceTo(roofTop) < 0.5) ? null : { p: roofTop.clone(), surface: 'roof' }));
  zoneSpots.push(() => { const a = Math.random() * 6.28; return { p: groundPoint(PV.x + Math.cos(a) * 1.3, PV.z + Math.sin(a) * 1.3), surface: 'ground' }; });

  // 시냇물: a stream from the pond to the edge of the park, with a wooden bridge on the south path
  const swPos = [], swIdx = [];
  streamPts.forEach((q, i) => {
    const tg = streamCurve.getTangentAt(i / (streamPts.length - 1));
    const nx = -tg.z, nz = tg.x, half = 0.8 + Math.sin(i * 0.45) * 0.2;
    swPos.push(q.x + nx * half, 0.025, q.z + nz * half, q.x - nx * half, 0.025, q.z - nz * half);
    if (i > 0) { const b = (i - 1) * 2; swIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    if (i % 3 === 0) {
      [1, -1].forEach((side) => {
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rnd() * 0.14, 0), mat('#BDB6A8'));
        st.position.set(q.x + nx * (half + 0.2) * side, 0.08, q.z + nz * (half + 0.2) * side);
        scene.add(st);
      });
    }
  });
  const swGeo = new THREE.BufferGeometry();
  swGeo.setAttribute('position', new THREE.Float32BufferAttribute(swPos, 3));
  swGeo.setIndex(swIdx);
  swGeo.computeVertexNormals();
  const streamMesh = new THREE.Mesh(swGeo, new THREE.MeshStandardMaterial({ color: toLinear(env.night ? '#2E4A66' : '#86BEDC'), roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide }));
  streamMesh.receiveShadow = true;
  scene.add(streamMesh);
  const bridgeAt = streamPts.reduce((b, q) => (Math.abs(q.x) < Math.abs(b.x) ? q : b), streamPts[0]);
  const bridge = new THREE.Group();
  bridge.position.set(0, 0, bridgeAt.z);
  scene.add(bridge);
  const plankM = mat('#A8703F');
  const bdeck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 3.6), plankM);
  bdeck.position.y = 0.04;
  bdeck.receiveShadow = true;
  bridge.add(bdeck);
  [-1.02, 1.02].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.6), plankM);
    rail.position.set(x, 0.62, 0);
    bridge.add(rail);
    [-1.6, 0, 1.6].forEach((z) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.64, 0.1), plankM);
      post.position.set(x, 0.32, z);
      post.castShadow = true;
      bridge.add(post);
    });
  });
  streamPts.forEach((q, i) => {
    if (i % 2 || Math.hypot(q.x - bridgeAt.x, q.z - bridgeAt.z) < 2.4) return;
    obstacles.push({ x: q.x, z: q.z, r: 0.9, h: 0 });
  });
  zoneSpots.push(() => { const q = pick(streamPts); return Math.hypot(q.x, q.z) < PARK_R - 1 ? { p: groundPoint(q.x + 1.3, q.z + 1.3), surface: 'ground', look: q } : null; });

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

  const PILES = [[3.2, 7.6], [-9.2, -2.6], [22.5, 9], [-9, 26.5], [19, -27], [-24, 8.5]].map(([x, z]) => ({ x, z, cool: 0 }));
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
      center: pos.clone(),
      ridgeA: g.localToWorld(new THREE.Vector3(0, 2.77, -0.85)),
      ridgeB: g.localToWorld(new THREE.Vector3(0, 2.77, 0.85)),
      plate: el(`park-plate${lit ? ' lit' : ''}${card.mine ? ' mine' : ''}`, card.mine ? '내 집' : card.owner.nickname),
    });
    obstacles.push({ x: pos.x, z: pos.z, r: 1.5, h: 2.9 });
  }

  // ---- ground rules ------------------------------------------------------------------------
  function groundPoint(x, z) {
    const d = Math.hypot(x, z);
    if (d > PARK_R - 0.8) { x *= (PARK_R - 0.8) / d; z *= (PARK_R - 0.8) / d; }
    const p = new THREE.Vector3(x, 0, z);
    for (let pass = 0; pass < 2; pass++) {
      obstacles.forEach((o) => {
        if (o.air) return;
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
  /** A flying bird is pushed around anything taller than it is (houses, trunks, the pavilion roof). */
  function airPush(x, z, y) {
    const p = { x, z };
    obstacles.forEach((o) => {
      const h = o.h ?? 3;
      if (y > h - 0.1 || (o.low != null && y < o.low - 0.6)) return;
      const dx = p.x - o.x, dz = p.z - o.z, dd = Math.hypot(dx, dz), rr = o.r + 0.3;
      if (dd < rr) { const k = rr / Math.max(dd, 0.001); p.x = o.x + dx * k; p.z = o.z + dz * k; }
    });
    return p;
  }
  /** Where a bird coming straight down lands: a roof, the pavilion, the gym bar, the bath, or the ground. */
  function surfaceBelow(x, z) {
    for (const hh of houses) {
      if (Math.hypot(x - hh.center.x, z - hh.center.z) < 1.35) {
        const ab = hh.ridgeB.clone().sub(hh.ridgeA);
        const t = clamp(((x - hh.ridgeA.x) * ab.x + (z - hh.ridgeA.z) * ab.z) / ab.lengthSq(), 0, 1);
        return { p: hh.ridgeA.clone().addScaledVector(ab, t), surface: 'roof' };
      }
    }
    const pr = Math.hypot(x - ZONES.pavilion.x, z - ZONES.pavilion.z);
    if (pr < 3.5) return { p: new THREE.Vector3(x, pr < 0.45 ? 4.2 : 4.05 - pr * (1.5 / 3.7), z), surface: 'roof' };
    if (gymLanding && Math.hypot(x - ZONES.gym.x, z - ZONES.gym.z) < 1.3) return gymLanding(x, z);
    if (Math.hypot(x - BATH.x, z - BATH.z) < 1.0) return bathSpot(new THREE.Vector3(x, 0, z));
    return { p: groundPoint(x, z), surface: 'ground' };
  }

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
  let view = 'third'; // 'third': camera behind and following, 'first': through the bird's eyes
  let manualUntil = 0; // a drag pauses the follow camera for a moment
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
    if (x < 0.22) spot = branchSpot();
    else if (x < 0.3) spot = bathSpot();
    else if (x < 0.36) spot = swingSpot();
    else if (x < 0.42) spot = pondSpot();
    else if (x < 0.48) { const p = pick(PILES); spot = { p: groundPoint(p.x + 0.4, p.z + 0.4), surface: 'ground' }; }
    else if (x < 0.7) spot = pick(zoneSpots)();
    else if (x < 0.8) spot = { p: r.house.perch.clone(), surface: 'perch' };
    if (!spot) {
      const base = r.house.front;
      spot = { p: groundPoint(base.x + (Math.random() - 0.5) * 6, base.z + (Math.random() - 0.5) * 6), surface: 'ground' };
    }
    if (spot.surface === 'perch' && actors.some((o) => o !== r && o.pos.distanceTo(spot.p) < 0.4)) return;
    const s = spot;
    goTo(r, s.p, s.surface, () => {
      if (s.surface === 'swing') r.swingDx = s.dx;
      if (s.after) s.after(r);
      if (s.look) r.rotTarget = angleTo(r.pos, s.look);
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
    camera.fov = view === 'first' ? (w / h < 0.7 ? 75 : 65) : w / h < 0.7 ? 58 : 50;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  const camTarget = new THREE.Vector3();
  const camRay = new THREE.Raycaster();
  const camDir = new THREE.Vector3();
  let camLift = 0; // extra pitch while something blocks the usual view
  let camReach = 9; // how far the camera can actually sit before a tree or house gets in the way
  const yawBehind = (r) => Math.atan2(-Math.cos(r), Math.sin(r));
  const rotForYaw = (yaw) => Math.atan2(Math.cos(yaw), -Math.sin(yaw));
  let fpPitch = 0;
  function stepCamera(dt, snap, moving) {
    // third person: while the bird moves, the camera swings round behind it (a drag pauses this)
    if (view === 'third' && moving && clock > manualUntil && !entering) {
      cam.yawT = lerpAngle(cam.yawT, yawBehind(player.b.group.rotation.y), 1 - Math.exp(-dt * 1.6));
    }
    if (view === 'first') {
      const k = snap ? 1 : 1 - Math.exp(-dt * 12);
      cam.yaw = lerpAngle(cam.yaw, cam.yawT, k);
      const s = player.b.group.scale.x || 1;
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      camera.position.set(player.pos.x + fx * 0.3 * s, player.pos.y + 0.95 * s, player.pos.z + fz * 0.3 * s);
      look.copy(camera.position);
      const cp = Math.cos(fpPitch);
      camera.lookAt(camera.position.x + fx * cp, camera.position.y + Math.sin(fpPitch), camera.position.z + fz * cp);
      sun.position.set(look.x + 10, look.y + 22, look.z - 8);
      sun.target.position.set(look.x, 0, look.z);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 10);
    cam.yaw = lerpAngle(cam.yaw, cam.yawT, k);
    cam.pitch += (cam.pitchT - cam.pitch) * k;
    cam.dist += (cam.distT - cam.dist) * k;
    camTarget.set(player.pos.x, player.pos.y + 0.9, player.pos.z);
    if (snap) look.copy(camTarget);
    else look.lerp(camTarget, 1 - Math.exp(-dt * 6));
    // if a tree or a house is right behind the bird, look from higher up instead of sitting inside the leaves
    const reachAt = (pitch) => {
      const cp = Math.cos(pitch);
      const dir = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(pitch), Math.cos(cam.yaw) * cp);
      camRay.set(look, dir);
      camRay.far = cam.dist;
      const hit = camRay.intersectObjects(occluders, false)[0];
      return { pitch, dir, reach: hit ? hit.distance - 0.4 : cam.dist };
    };
    let best = reachAt(cam.pitch);
    for (const extra of [0.35, 0.7]) {
      if (best.reach >= Math.min(cam.dist, 3.2)) break;
      const alt = reachAt(Math.min(1.4, cam.pitch + extra));
      if (alt.reach > best.reach + 0.5) best = alt;
    }
    camLift += ((best.pitch - cam.pitch) - camLift) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    const cpl = Math.cos(cam.pitch + camLift);
    camDir.set(Math.sin(cam.yaw) * cpl, Math.sin(cam.pitch + camLift), Math.cos(cam.yaw) * cpl);
    const want = clamp(best.reach, 2.0, cam.dist);
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
  zoneLands.forEach(([geo, pos, fn]) => land(geo, pos, fn));

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
    if (view === 'first') fpPitch = clamp(fpPitch + ((e.clientY - drag.y) / Math.max(h, 1)) * 1.6, -0.9, 0.9);
    else cam.pitchT = clamp(cam.pitchT + ((e.clientY - drag.y) / Math.max(h, 1)) * 1.8, 0.08, 1.3);
    manualUntil = clock + 2;
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
    let target, surface = 'ground', dx = 0, after = null;
    const hit = ray.intersectObjects(landables, false)[0];
    if (hit) {
      const L = hit.object.userData.land(hit.point);
      if (!L) { say(player, '자리가 없어요', 1); return; }
      target = L.p;
      surface = L.surface;
      dx = L.dx ?? 0;
      after = L.after || null;
    } else {
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;
      if (p.distanceTo(player.pos) > 40) return;
      target = groundPoint(p.x, p.z);
    }
    player.action = null;
    goTo(player, target, surface, () => {
      if (after) after(player);
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
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const n = Math.hypot(ix, iy);
    const dx = (fx * iy + rx * ix) / n, dz = (fz * iy + rz * ix) / n;
    if (!flying && !onGround(player.pos)) {
      // on a branch, roof or the bath: hop down the way the stick points, then walk on
      if (!player.move || player.move.type !== 'fly') {
        player.action = null;
        flyTo(player, groundPoint(player.pos.x + dx * 1.6, player.pos.z + dz * 1.6), 'ground', null);
      }
      return true;
    }
    player.move = null;
    player.action = null;
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
      const q = airPush(x, z, player.pos.y);
      x = q.x;
      z = q.z;
    }
    player.pos.x = x;
    player.pos.z = z;
    player.rotTarget = dirAngle(dx, dz);
    return true;
  }
  let cruise = CRUISE;
  let climb = 0;
  function stepFlight(dt) {
    if (!flying || player.move) return;
    let c = climb;
    if (keys.has('KeyE')) c += 1;
    if (keys.has('KeyQ')) c -= 1;
    if (!landing) {
      cruise = clamp(cruise + clamp(c, -1, 1) * 2.4 * dt, CRUISE_MIN, CRUISE_MAX);
      player.pos.y += (cruise - player.pos.y) * (1 - Math.exp(-dt * 3));
      const q = airPush(player.pos.x, player.pos.z, player.pos.y);
      player.pos.x = q.x;
      player.pos.z = q.z;
      return;
    }
    // coming down onto whatever is below: a roof, the pavilion, the gym, the bath or the ground
    const below = surfaceBelow(player.pos.x, player.pos.z);
    player.pos.y += (below.p.y - player.pos.y) * (1 - Math.exp(-dt * 3.5));
    const k = 1 - Math.exp(-dt * 6);
    player.pos.x += (below.p.x - player.pos.x) * k;
    player.pos.z += (below.p.z - player.pos.z) * k;
    if (Math.abs(player.pos.y - below.p.y) < 0.06) {
      player.pos.copy(below.p);
      flying = false;
      landing = false;
      player.surface = below.surface;
      if (below.surface === 'roof') say(player, pick(['지붕 위다!', '높다!']), 1.2);
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
  let rustleAt = 0;
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
    ticks.forEach((f) => f(clock, dt));
    if ((steering || player.move) && onGround(player.pos) && clock > rustleAt) {
      if (Math.hypot(player.pos.x - PZ.x, player.pos.z - PZ.z) < PZ.r) { say(player, '사각사각', 1.1); rustleAt = clock + 5; }
      else if (Math.hypot(player.pos.x - CZ.x, player.pos.z - CZ.z) < CZ.r) { say(player, pick(['꽃향기~', '코스모스다']), 1.3); rustleAt = clock + 6; }
    }

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

    if (view === 'first') {
      // through the bird's eyes: the bird turns with the view, and is not drawn
      player.b.group.visible = false;
      if (!player.move && !steering && !entering) player.rotTarget = rotForYaw(cam.yaw);
    }
    stepCamera(dt, false, steering || !!player.move);
    marker.material.opacity = Math.max(0, 0.8 - (clock - markerT) * 1.4);
    marker.scale.setScalar(1 + (clock - markerT) * 0.8);
    dome.position.copy(camera.position);
    renderer.render(scene, camera);

    houses.forEach((hh) => place(hh.plate, hh.top, 0.2, 34));
    actors.forEach((a) => {
      const show = (a.isPlayer || a.pos.distanceTo(player.pos) < 7 || a.bubbleUntil > clock) && a.b.group.visible;
      if (a.isPlayer && view === 'first') { a.tagEl.hidden = true; a.bubbleEl.hidden = true; return; }
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
      cruise = Math.max(player.pos.y + 2.2, CRUISE);
      say(player, '훨훨', 0.9);
      return true;
    },
    /** Hold to go up (1) or down (-1) while flying; 0 to stop. */
    setClimb(dir) {
      climb = dir;
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
    /** 'third' (camera behind, following) or 'first' (through the bird's eyes). */
    setView(next) {
      view = next === 'first' ? 'first' : 'third';
      if (view === 'first') {
        cam.yaw = cam.yawT = yawBehind(player.b.group.rotation.y);
        fpPitch = 0;
      } else {
        player.b.group.visible = true;
        cam.yaw = cam.yawT = yawBehind(player.b.group.rotation.y);
      }
      resize();
      stepCamera(0, true, false);
      return view;
    },
    /** Become another bird on the spot (owners with several birds). */
    swapBird(v) {
      const old = player.b;
      const nb = makeBird(v.colors, v.species);
      nb.group.position.copy(old.group.position);
      nb.group.rotation.y = old.group.rotation.y;
      nb.group.visible = view !== 'first';
      scene.remove(old.group);
      old.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      scene.add(nb.group);
      player.b = nb;
      player.pos = nb.group.position;
      player.name = v.name;
      player.tagEl.textContent = v.name;
      hearts(player.pos.clone());
      say(player, `${v.name} 차례!`, 1.6);
      playCall('chirp', 1.1, 0.8);
    },
    /** Tests only (mock builds): put the bird somewhere and turn the camera. */
    debugTeleport(x, z, yaw, pitch) {
      player.move = null;
      flying = false;
      player.pos.set(x, 0, z);
      cam.yaw = cam.yawT = yaw;
      if (pitch != null) cam.pitch = cam.pitchT = pitch;
      manualUntil = clock + 3;
      stepCamera(0, true, false);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (window.__angpark === api) delete window.__angpark;
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
  if (import.meta.env.VITE_MOCK === '1') window.__angpark = api;
  return api;
}
