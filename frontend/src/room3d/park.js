// 앵파크: an autumn park where everyone plays as a parrot.
// Third-person camera (drag to turn, pinch or wheel to zoom), joystick or keys to walk, a fly toggle,
// and tap-to-go for houses, branches, the swing, the bath and other birds.
// Neighbours' birdhouses stand around the ring path; their birds live here as little AIs, so the park
// is never empty. Other people connected at the same time show up as remote birds (see lib/parkNet.ts).
import * as THREE from 'three';
import { playCall, playFx } from '../lib/sound';
import { makeBird, toLinear } from './bird.js';
import { disposeScene, mat, rod, skyNow } from './scene.js';
import { buildPepero, peperoOpen } from './pepero.js';
import { tr } from '../i18n';

/** Lines in both languages: L(['안녕'], ['Hi']). pick() takes the current language's list. */
const L = (ko, en) => ({ ko, en });

const PARK_R = 34;
const RING_IN = 11;
const RING_OUT = 12.6;
const HOUSE_R = 17;
const SLOTS = 12;
const MAX_RESIDENTS = 8;
const MAX_REMOTES_DRAWN = 24;
const CRUISE = 3.0;
const CRUISE_MIN = 0.8;
const CRUISE_MAX = 11.5;
const WORLD_R = 56; // how far you can fly (the realtime server takes up to 110: the 빼빼로 숲 is further north)
const WALK_SPEED = 3.2;
const FLY_SPEED = 6.2;
const clamp = THREE.MathUtils.clamp;

const AUTUMN = ['#D9442B', '#E8662E', '#F08A24', '#C7362F', '#F2B33D', '#B8432A', '#E9A13B'];
const CHIRPS = L(['짹짹!', '짹!', '삐요', '짹짹짹'], ['Tweet!', 'Chirp!', 'Peep', 'Tweet tweet']);
const REPLIES = L(['짹!', '삐약', '누구야?', '반가워!', '짹짹', '안녕!'], ['Chirp!', 'Peep', 'Who\'s that?', 'Hi there!', 'Tweet', 'Hello!']);
const HELLO = L(['안녕!', '처음 보는 얼굴이네', '짹! 같이 놀자', '단풍 예쁘지?'], ['Hi!', 'New face!', 'Chirp! Let\'s play', 'Pretty leaves, huh?']);
const PLAY_LINES = L(['신난다!', '한 번 더!', '짹짹짹!', '같이 춤추자'], ['Yay!', 'Again!', 'Tweet tweet!', 'Let\'s dance']);
// pranks between birds, by kind number (the same numbers go over the network: docs/park-realtime.md, 8)
// me: what the prankster says, them: what the pranked bird says
const PRANKS = [
  { me: L(['콕!', '콕콕!', '헤헤'], ['Poke!', 'Poke poke!', 'Hehe']), them: L(['꽥!', '아야!', '뭐야!'], ['Squawk!', 'Ouch!', 'Hey!']) }, // 0 poke
  { me: L(['비켜!', '영차!', '내 자리야'], ['Move!', 'Heave!', 'My spot']), them: L(['어어어!', '으악!', '왜 밀어!'], ['Whoa!', 'Argh!', 'Don\'t push!']) }, // 1 shove
  { me: L(['냠!', '내 거다!', '맛있다~'], ['Nom!', 'Mine!', 'Yummy~']), them: L(['내 간식!', '돌려줘!', '야!'], ['My snack!', 'Give it back!', 'Hey!']) }, // 2 snatch a snack
  { me: L(['여기 좋다!', '높다!', '출발~'], ['Nice up here!', 'So high!', 'Giddy up~']), them: L(['무거워!', '내려와!', '머리가...'], ['Heavy!', 'Get down!', 'My head...']) }, // 3 sit on the head
  { me: L(['다듬어 줄게~'], ['Let me preen you~']), them: L(['고마워~'], ['Thanks~']) }, // 4 pretend to preen, then poke
];
const MAKE_UP_LINES = L([['미안해~', '헤헤'], ['우리 화해하자', '좋아!'], ['장난이었어', '알아~']], [['Sorry~', 'Hehe'], ['Let\'s make up', 'OK!'], ['Just kidding', 'I know~']]);
const MODE_CODE = { idle: 0, CALM: 0, WALK: 1, FLY: 2, DANCE: 3, HAPPY: 4, CHIRP: 5, PREEN: 6, SPLASH: 7 };
const CODE_MODE = ['idle', 'WALK', 'FLY', 'DANCE', 'HAPPY', 'CHIRP', 'PREEN', 'SPLASH'];

const angleTo = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
const dirAngle = (dx, dz) => Math.atan2(-dz, dx);
function lerpAngle(a, b, k) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
}
const pick = (a) => { const arr = Array.isArray(a) ? a : tr(a.ko, a.en); return arr[Math.floor(Math.random() * arr.length)]; };
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Today's weather in the park, the same for everyone (from the date in Korea):
 * rain some days, the first snow now and then in November, more snow in winter.
 */
function todayWeather() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const key = d.toISOString().slice(0, 10);
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = ((h >>> 0) % 1000) / 1000, m = d.getUTCMonth() + 1;
  if (m === 12 || m <= 2) return r < 0.45 ? 'snow' : r < 0.52 ? 'rain' : 'clear';
  if (m === 11) return r < 0.12 ? 'snow' : r < 0.3 ? 'rain' : 'clear';
  return r < 0.22 ? 'rain' : 'clear';
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
 * Pranks: onPrank(pid, kind) when I prank a live bird (the page asks the server), onPranked({ id, name, remote, kind, back })
 * when a bird pranks me or answers back, onAnswered({ id, name, remote, answer }) when one makes up (1) or flies off (2).
 * opts.startAt: a handle to come out of (back from that house), or null to fly in at the gate.
 * @param {HTMLElement} container
 * @param {any[]} cards
 * @param {{ visitor: any, startAt?: string | null, onEnter?: (h: string) => void, onBirdTap?: (who: any) => void, onEmptyLot?: () => void,
 *   onPrank?: (pid: number, k: number) => void, onPranked?: (who: any) => void, onAnswered?: (who: any) => void,
 *   onZone?: (zone: 'park' | 'pepero') => void }} opts
 */
export function mountPark(container, cards, { visitor, startAt = null, onEnter, onBirdTap, onEmptyLot, onPrank, onPranked, onAnswered, onZone } = /** @type {any} */ ({})) {
  const env = skyNow();
  const small = Math.min(window.innerWidth, window.innerHeight) < 720;
  // ?night=1 and ?weather=rain|snow|clear try out the other looks (for checking, and for fun)
  const q = new URLSearchParams(window.location.search);
  if (q.get('night') === '1') Object.assign(env, { sky: '#1B2547', light: 0.45, night: true, clear: '#1B2036' });
  const weather = ['rain', 'snow', 'clear'].includes(q.get('weather') || '') ? q.get('weather') : todayWeather();
  const wet = weather === 'rain', snowy = weather === 'snow';
  const pepOpen = peperoOpen(); // the 빼빼로 숲 event space up north (see pepero.js)
  // sky: a gradient dome from a warm autumn horizon to the top, by the time of day in Korea
  const SKY = env.night ? ['#0B1230', '#2B355E']
    : env.sky === '#F4A97A' ? ['#6A73B0', '#F6B183']
      : env.sky === '#C9B8D8' ? ['#8C8FC4', '#EBC9D2']
        : ['#6FA8DC', '#F4DFC2'];
  if (wet || snowy) {
    // an overcast sky: grey for rain, pale for snow
    const over = wet ? (env.night ? '#20242E' : '#8E98A6') : env.night ? '#3A4256' : '#DCE1E8';
    SKY[0] = tint(SKY[0], over, 0.7);
    SKY[1] = tint(SKY[1], over, 0.7);
  }
  const skyC = SKY[1];
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(toLinear(skyC), wet || snowy ? 26 : 45, wet || snowy ? 120 : 175);
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
  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x6f7a4a, (env.night ? 0.42 : 0.62) * (wet ? 0.95 : snowy ? 1.15 : 1)));
  const sun = new THREE.DirectionalLight(env.night ? 0x9fb4ff : 0xffe2b8, (env.night ? 0.5 : Math.min(env.light, 0.95)) * (wet || snowy ? 0.5 : 1));
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  scene.add(sun, sun.target);

  const rnd = mulberry(11);
  const obstacles = [];
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  // ---- ground, paths, horizon -------------------------------------------------------------
  const SNOW = env.night ? '#AEB7C8' : '#F1F3F5';
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(snowy ? tint(env.night ? '#4E5A34' : '#8A9A50', SNOW, 0.75) : env.night ? '#4E5A34' : '#8A9A50'));
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
    if (snowy) cc.lerp(new THREE.Color(SNOW), 0.62 + n * 0.25); // a thin first snow, the grass showing through
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
  const pathMat = mat(snowy ? tint(env.night ? '#9C8F74' : '#E6D3AE', SNOW, 0.6) : wet ? tint(env.night ? '#9C8F74' : '#E6D3AE', '#7A6E5C', 0.3) : env.night ? '#9C8F74' : '#E6D3AE');
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
      if (pepOpen && !row && angDiff(a, Math.PI / 2) < 0.45) continue; // the 빼빼로 숲 is there
      scene.add(hill);
    }
  }

  // ---- trees: tall maples and ginkgos with low branches to sit on, drawn instanced ----------------
  const trunks = [];
  const crowns = []; // { x, y, z, r, color, cone }
  const limbs = []; // visible branches { a, b, r }
  const occluders = []; // meshes the camera keeps out of (houses)
  const occludeSpheres = []; // tree crowns, as spheres, for the camera (cheaper than casting rays at 600 instances)
  const perchSegs = []; // everything a bird can sit on along its length: { a, b } (already lifted to the top of the wood)
  const climbTrees = []; // { x, z, s, top, rr, segs } trees you can fly up into
  /** A branch from the trunk outwards, a little upwards; the outer part is a perch. */
  function limb(owner, A, B, r, perch = true) {
    limbs.push({ a: A, b: B, r });
    if (!perch) return;
    const lift = new THREE.Vector3(0, r + 0.02, 0);
    const seg = { a: A.clone().lerp(B, 0.3).add(lift), b: B.clone().lerp(A, 0.06).add(lift) };
    perchSegs.push(seg);
    if (owner) owner.segs.push(seg);
  }
  function addMaple(x, z, s = 1, climb = true) {
    const H = 4.2 * s, cy = H + 1.5 * s;
    trunks.push({ x, z, h: cy, r: 0.27 * s });
    const c = pick(AUTUMN);
    crowns.push({ x, y: cy, z, r: 2.5 * s, color: c });
    crowns.push({ x: x + 1.4 * s, y: cy - 0.5 * s, z: z + 0.6 * s, r: 1.6 * s, color: tint(c, '#F2B33D', 0.25) });
    crowns.push({ x: x - 1.1 * s, y: cy - 0.3 * s, z: z - 1.0 * s, r: 1.7 * s, color: tint(c, '#9E2A22', 0.2) });
    crowns.push({ x: x + 0.2 * s, y: cy + 1.6 * s, z: z - 0.2 * s, r: 1.5 * s, color: tint(c, '#F08A24', 0.15) });
    obstacles.push({ x, z, r: 0.5 * s, h: cy });
    if (!climb) return;
    const tr = { x, z, s, top: cy + 3.0 * s, rr: 1.4 * s, segs: [] };
    const n = rnd() < 0.5 ? 3 : 2, a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * Math.PI * 2) / n + (rnd() - 0.5) * 0.5;
      const y = (2.0 + k * 0.45 + rnd() * 0.3) * s, L = (1.35 + rnd() * 0.35) * s;
      limb(tr, new THREE.Vector3(x + Math.cos(a) * 0.2 * s, y, z + Math.sin(a) * 0.2 * s), new THREE.Vector3(x + Math.cos(a) * L, y + 0.35 * s, z + Math.sin(a) * L), 0.075 * s);
    }
    climbTrees.push(tr);
  }
  function addGinkgo(x, z) {
    trunks.push({ x, z, h: 4.4, r: 0.18 });
    crowns.push({ x, y: 5.6, z, r: 1.3, color: rnd() < 0.5 ? '#F2C53D' : '#E8B92E', cone: true });
    obstacles.push({ x, z, r: 0.35, h: 5.6 });
    const tr = { x, z, s: 1, top: 7.15, rr: 0.5, segs: [] };
    const a = rnd() * Math.PI * 2;
    limb(tr, new THREE.Vector3(x, 2.5, z), new THREE.Vector3(x + Math.cos(a) * 1.25, 2.85, z + Math.sin(a) * 1.25), 0.06);
    climbTrees.push(tr);
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
  // the stream runs from the pond out of the park and into the river
  const streamCurve = new THREE.CatmullRomCurve3([[-17.4, -17.4], [-12, -22], [-6, -26], [0, -28.5], [6, -31], [10.5, -35], [13.2, -40.5], [15.2, -45.5], [16.5, -50]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const streamPts = streamCurve.getSpacedPoints(90);

  // 강가 산책로: a walk out of the east gate, through the maples, along the river, and back in at the west gate
  const TRAIL_HALF = 1.3;
  const RIVER_W = 4.2; // half the width of the river
  const riverZ = (x) => -51 + 2.2 * Math.sin(x * 0.08 + 0.6);
  const trailCurve = new THREE.CatmullRomCurve3([[PARK_R - 1.5, 0], [38, -4], [43, -13], [44.5, -24], [40, -33.5], [31, -39.5], [20, -41.5], [8, -40.5], [-4, -41.5], [-16, -41], [-27, -37.5], [-36, -30], [-41, -19], [-40, -8], [-PARK_R + 1.5, -1.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const trailPts = trailCurve.getSpacedPoints(240);
  function nearTrail(x, z) {
    let best = trailPts[0], bd = Infinity;
    for (const q of trailPts) {
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    return { q: best, d: Math.sqrt(bd) };
  }
  // sandy beaches where the trail meets the river: the only places you can walk into the river
  const BEACHES = [-16, 4, 24].map((bx) => {
    const z = riverZ(bx) + RIVER_W - 0.3;
    return { x: bx, z, r: Math.max(4.4, nearTrail(bx, z).d + 0.4) };
  });
  const deepLine = (x) => riverZ(x) + RIVER_W - 2.4;
  const bridges = []; // { x, z, r } the stream is dry under these
  const puddles = []; // { x, z, r } rain puddles on the paths (rainy days only)
  const outsidePark = (x, z) => Math.hypot(x, z) > PARK_R + 1;
  const inZone = (x, z, pad) => Object.values(ZONES).some((q) => Math.hypot(x - q.x, z - q.z) < q.r + pad)
    || streamPts.some((q) => Math.hypot(x - q.x, z - q.z) < pad + 0.8);
  // ginkgo avenue along the entrance path (+z)
  for (let z = 15; z < PARK_R - 2; z += 4.2) [-3.2, 3.2].forEach((x) => addGinkgo(x, z));
  // maples between the houses and the park edge
  for (let i = 0, tries = 0; i < (small ? 34 : 46) && tries < 2000; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 20.5 + rnd() * (PARK_R - 22);
    if (PATH_A.some((p) => angDiff(a, p) < 2.6 / r + 0.04)) continue;
    const p = at(a, r);
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 2.8) continue;
    if (inZone(p.x, p.z, 2.6)) continue;
    if (obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 4.4)) continue;
    addMaple(p.x, p.z, 0.95 + rnd() * 0.3);
    i++;
  }
  // a few maples inside the ring too
  [[8, 7], [-8.5, -6.5], [-8, 7.5], [8.5, -8]].forEach(([x, z]) => addMaple(x, z, 0.85));

  // ---- the giant tree in the middle: branches all the way up, for resting and playing -------------
  const GT_H = 9.6;
  const giantSegs = [];
  {
    const bark = mat('#6E4F36');
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.15, GT_H, 12), bark);
    trunk.position.y = GT_H / 2;
    trunk.castShadow = true;
    scene.add(trunk);
    // roots spreading into the flower bed
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047 + 0.3;
      limbs.push({ a: new THREE.Vector3(Math.cos(a) * 0.55, 1.0, Math.sin(a) * 0.55), b: new THREE.Vector3(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9), r: 0.26 });
    }
    // a wide, high crown
    [[0, 12.8, 0, 3.6], [3.0, 11.6, 1.0, 2.8], [-2.7, 11.8, 1.7, 2.9], [1.3, 11.4, -3.0, 2.7], [-1.9, 11.2, -2.5, 2.6], [0.6, 15.0, 0.4, 2.6], [3.5, 13.0, -1.7, 2.2], [-3.5, 13.2, -0.4, 2.2]].forEach(([x, y, z, r], i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(['#C7362F', '#E8662E', '#D9442B', '#F08A24', '#E9A13B'][i % 5]));
      m.position.set(x, y, z);
      m.castShadow = true;
      scene.add(m);
      occludeSpheres.push({ x, y, z, r: r * 0.92 });
    });
    // thirteen branches spiralling up the trunk, each one a perch, with a twig or two for looks
    const giant = { segs: giantSegs };
    for (let i = 0; i < 13; i++) {
      const a = i * 2.4, y = 1.9 + i * 0.48, L = 3.5 - i * 0.09, tr = 0.6 + (1 - y / GT_H) * 0.5;
      const A = new THREE.Vector3(Math.cos(a) * tr * 0.8, y, Math.sin(a) * tr * 0.8);
      const B = new THREE.Vector3(Math.cos(a) * L, y + 0.5, Math.sin(a) * L);
      limb(giant, A, B, 0.15 - i * 0.004);
      const mid = A.clone().lerp(B, 0.6);
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(i % 2 ? 0.7 : -0.7);
      limbs.push({ a: mid, b: mid.clone().add(side).add(new THREE.Vector3(0, 0.55, 0)), r: 0.045 });
    }
    obstacles.push({ x: 0, z: 0, r: 1.2, h: GT_H }); // the trunk, for flying birds too
    obstacles.push({ x: 0, z: 0, r: 2.6, h: 0.3 }); // the flower bed
  }
  const bed = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.6, 32), mat('#7A5A3E'));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.015;
  scene.add(bed);
  const MUMS = ['#F2C53D', '#EDE7F4', '#B776C9', '#F08A24', '#E25B4E'];
  const mumMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 60);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + rnd() * 0.1, r = 1.4 + (i % 3) * 0.45;
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
  // the edge of the pond is shallow enough to wade in; the middle is not
  obstacles.push({ x: POND.x, z: POND.z, r: POND.r - 1.6, h: 0 });

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

  // perch stands (횟대 놀이대) where the benches used to be: a post with two crossed bars to sit and play on
  const stands = []; // { x, z, segs }
  const poles = []; // { a, b, r } drawn instanced in light wood
  const standBases = [];
  function perchStand(x, z, ry) {
    const st = { x, z, segs: [] };
    const dx = Math.cos(ry), dz = Math.sin(ry);
    poles.push({ a: new THREE.Vector3(x, 0, z), b: new THREE.Vector3(x, 2.1, z), r: 0.075 });
    const bar = (y, ux, uz, half) => {
      const A = new THREE.Vector3(x - ux * half, y, z - uz * half), B = new THREE.Vector3(x + ux * half, y, z + uz * half);
      poles.push({ a: A, b: B, r: 0.05 });
      [[A, 0.06], [B, 0.06]].forEach(([e]) => poles.push({ a: e, b: e.clone().setY(y + 0.12), r: 0.035 })); // little end pegs
      const lift = new THREE.Vector3(0, 0.07, 0);
      const seg = { a: A.clone().lerp(B, 0.06).add(lift), b: B.clone().lerp(A, 0.06).add(lift) };
      perchSegs.push(seg);
      st.segs.push(seg);
    };
    bar(1.05, dx, dz, 1.05);
    bar(1.8, -dz, dx, 0.75);
    standBases.push([x, z]);
    obstacles.push({ x, z, r: 0.45, h: 2.1 });
    stands.push(st);
  }
  [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].forEach((a) => {
    const p = at(a, 9.6);
    perchStand(p.x, p.z, a + Math.PI / 2);
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
    say(a, f ? pick(L(['냠냠!', '달다!', '홍시 최고'], ['Nom nom!', 'Sweet!', 'Persimmons rule'])) : tr('다 먹었네...', 'All gone...'), 1.8);
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
  const ringDing = (who) => { ding = 1; say(who, pick(L(['땡그랑!', '땡땡!', '높다!'], ['Ding!', 'Ding ding!', 'So high!'])), 1.4); playCall('chirp', 1.5, loudness(who) * 0.5); };
  {
    const g = new THREE.BoxGeometry(2.4, 0.7, 0.7);
    g.rotateY(gym.rotation.y);
    zoneLands.push([g, gymTop(0), (pt) => {
      const local = gym.worldToLocal(pt.clone());
      return { p: gymTop(local.x), surface: 'gym', after: ringDing };
    }]);
    const ringSpot = gym.localToWorld(new THREE.Vector3(-0.45, 1.5, 0));
    zoneLands.push([new THREE.SphereGeometry(0.5, 8, 6), ringSpot.clone().setY(1.5), () => ({ p: ringSpot.clone(), surface: 'ring', after: (who) => say(who, tr('흔들흔들', 'Swing swing'), 1.2) })]);
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
  zoneLands.push([new THREE.CylinderGeometry(1.2, 2.2, 1.4, 6), new THREE.Vector3(PV.x, 3.4, PV.z), () => ({ p: roofTop.clone(), surface: 'roof', after: (who) => say(who, pick(L(['경치 좋다!', '여기 최고', '단풍 바다다'], ['What a view!', 'Best spot', 'A sea of leaves'])), 1.8) })]);
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
  const plankM = mat('#A8703F');
  /** A wooden footbridge across the stream; ry turns it to the path. */
  function makeBridge(x, z, ry) {
    const bridge = new THREE.Group();
    bridge.position.set(x, 0, z);
    bridge.rotation.y = ry;
    scene.add(bridge);
    const bdeck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 3.6), plankM);
    bdeck.position.y = 0.04;
    bdeck.receiveShadow = true;
    bridge.add(bdeck);
    [-1.02, 1.02].forEach((bx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.6), plankM);
      rail.position.set(bx, 0.62, 0);
      bridge.add(rail);
      [-1.6, 0, 1.6].forEach((bz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.64, 0.1), plankM);
        post.position.set(bx, 0.32, bz);
        post.castShadow = true;
        bridge.add(post);
      });
    });
    bridges.push({ x, z, r: 1.4 });
  }
  const bridgeAt = streamPts.reduce((b, q) => (Math.abs(q.x) < Math.abs(b.x) ? q : b), streamPts[0]);
  makeBridge(0, bridgeAt.z, 0);
  // where the riverside trail crosses the stream
  {
    let best = null, bd = Infinity;
    streamPts.forEach((q) => { const t = nearTrail(q.x, q.z); if (t.d < bd) { bd = t.d; best = t.q; } });
    const k = trailPts.indexOf(best);
    const tg = trailPts[Math.min(trailPts.length - 1, k + 1)].clone().sub(trailPts[Math.max(0, k - 1)]);
    makeBridge(best.x, best.z, Math.atan2(tg.x, tg.z));
  }
  zoneSpots.push(() => { const q = pick(streamPts); return Math.hypot(q.x, q.z) < PARK_R - 1 ? { p: groundPoint(q.x + 1.3, q.z + 1.3), surface: 'ground', look: q } : null; });

  // ---- the riverside trail ---------------------------------------------------------------------
  {
    const tp = [], ti = [];
    trailPts.forEach((q, i) => {
      const a = trailPts[Math.max(0, i - 1)], b = trailPts[Math.min(trailPts.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl, half = TRAIL_HALF - 0.15;
      tp.push(q.x + nx * half, 0.013, q.z + nz * half, q.x - nx * half, 0.013, q.z - nz * half);
      if (i > 0) { const k = (i - 1) * 2; ti.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    tg.setIndex(ti);
    tg.computeVertexNormals();
    const trail = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: toLinear(env.night ? '#8F8068' : '#D9C39A'), roughness: 0.95, side: THREE.DoubleSide }));
    trail.receiveShadow = true;
    scene.add(trail);
  }
  // the river: wide and slow, with stones and reeds on the near bank
  const riverMat = new THREE.MeshStandardMaterial({ color: toLinear(env.night ? '#2E4A66' : '#7FB6D6'), roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide });
  {
    const rp = [], ri = [];
    for (let i = 0, x = -110; x <= 110; x += 2, i++) {
      const z = riverZ(x);
      rp.push(x, 0.03, z + RIVER_W, x, 0.03, z - RIVER_W);
      if (i > 0) { const k = (i - 1) * 2; ri.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rg.setIndex(ri);
    rg.computeVertexNormals();
    const river = new THREE.Mesh(rg, riverMat);
    river.receiveShadow = true;
    scene.add(river);
  }
  BEACHES.forEach((b) => {
    const sand = new THREE.Mesh(new THREE.CircleGeometry(b.r, 32), mat(env.night ? '#9C8F74' : '#E6D3AE'));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(b.x, 0.014, b.z);
    sand.receiveShadow = true;
    scene.add(sand);
    // the shallow part, paler where the sand shows through
    const shallow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: toLinear(env.night ? '#456A80' : '#A9D8EC'), roughness: 0.2 }));
    shallow.rotation.x = -Math.PI / 2;
    shallow.scale.set(b.r * 0.85, 2.3, 1);
    shallow.position.set(b.x, 0.034, riverZ(b.x) + RIVER_W - 1.1);
    scene.add(shallow);
  });
  {
    const reedN = small ? 160 : 300;
    const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 1, 4), mat('#B9A46A'), reedN);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), mat('#8A6A3E'), reedN);
    let n = 0;
    for (let tries = 0; n < reedN && tries < reedN * 6; tries++) {
      const x = -60 + rnd() * 120;
      // mostly on the near bank, some on the far one
      const z = rnd() < 0.7 ? riverZ(x) + RIVER_W + (rnd() - 0.3) * 1.3 : riverZ(x) - RIVER_W - (rnd() - 0.3) * 1.3;
      if (BEACHES.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 0.5) || nearTrail(x, z).d < TRAIL_HALF + 0.4) continue;
      const hh = 0.8 + rnd() * 0.7;
      dummy.position.set(x, hh / 2, z);
      dummy.rotation.set((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25);
      dummy.scale.set(1, hh, 1);
      dummy.updateMatrix();
      reeds.setMatrixAt(n, dummy.matrix);
      dummy.position.y = hh;
      dummy.scale.set(0.05, 0.16, 0.05);
      dummy.updateMatrix();
      heads.setMatrixAt(n, dummy.matrix);
      n++;
    }
    reeds.count = heads.count = n;
    scene.add(reeds, heads);
  }
  for (let x = -58; x < 58; x += 1.6) {
    if (BEACHES.some((b) => Math.abs(x - b.x) < b.r)) continue;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + rnd() * 0.2, 0), mat('#BDB6A8'));
    st.position.set(x + rnd() * 0.8, 0.08, riverZ(x) + RIVER_W + 0.15);
    scene.add(st);
  }
  // maples on both sides of the trail (a tunnel of autumn colour), more trees across the river
  for (let i = 0, tries = 0; i < (small ? 26 : 44) && tries < 3000; tries++) {
    const q = trailPts[Math.floor(rnd() * trailPts.length)];
    const a = rnd() * Math.PI * 2, d = 3.4 + rnd() * 6;
    const x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
    if (!outsidePark(x, z) || nearTrail(x, z).d < 3.2 || z < riverZ(x) + RIVER_W + 1.6) continue;
    if (BEACHES.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1.5) || inZone(x, z, 2)) continue;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 4.2)) continue;
    addMaple(x, z, 0.95 + rnd() * 0.3);
    i++;
  }
  for (let i = 0, tries = 0; i < (small ? 12 : 22) && tries < 600; tries++) {
    const x = -60 + rnd() * 120, z = riverZ(x) - RIVER_W - 2.5 - rnd() * 9;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 4.2)) continue;
    addMaple(x, z, 1 + rnd() * 0.3, false);
    i++;
  }
  /** A point beside the trail at fraction f, off to the side away from the river (or away from the park). */
  function trailSide(f, off) {
    const k = Math.min(trailPts.length - 2, Math.floor(f * (trailPts.length - 1)));
    const q = trailPts[k], nq = trailPts[k + 1];
    const tx = nq.x - q.x, tz = nq.z - q.z, tl = Math.hypot(tx, tz) || 1;
    const A = { x: q.x - (tz / tl) * off, z: q.z + (tx / tl) * off }, B = { x: q.x + (tz / tl) * off, z: q.z - (tx / tl) * off };
    const wet = (p) => p.z - riverZ(p.x);
    const pick2 = Math.min(wet(A), wet(B)) < 9 ? (wet(A) > wet(B) ? A : B) : (Math.hypot(A.x, A.z) > Math.hypot(B.x, B.z) ? A : B);
    return { ...pick2, ry: Math.atan2(tz, tx) };
  }
  // perch stands along the trail and on each beach, lamps every so often
  [0.1, 0.27, 0.45, 0.62, 0.8, 0.94].forEach((f) => {
    const p = trailSide(f, TRAIL_HALF + 1.1);
    perchStand(p.x, p.z, p.ry);
  });
  BEACHES.forEach((b) => perchStand(b.x + (b.x > 0 ? -2.4 : 2.4), b.z + 1.6, 0.3));
  for (let i = 0; i < 9; i++) {
    const p = trailSide((i + 0.5) / 9, TRAIL_HALF + 0.5);
    rod(scene, new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, 2.6, p.z), 0.05, '#4A4038');
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bulbMat);
    bl.position.set(p.x, 2.75, p.z);
    scene.add(bl);
    obstacles.push({ x: p.x, z: p.z, r: 0.15, h: 2.8 });
  }

  // ---- now that every tree is placed, draw them (and every branch and pole) instanced ------------
  {
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 7), mat('#7A5A3E'), trunks.length);
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
    [[crownMesh, roundCrowns], [coneMesh, coneCrowns]].forEach(([mesh, list]) => {
      list.forEach((c, i) => {
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(0, rnd() * Math.PI, 0);
        dummy.scale.setScalar(c.r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.set(snowy ? tint(c.color, SNOW, 0.28) : c.color).convertSRGBToLinear());
        occludeSpheres.push({ x: c.x, y: c.y, z: c.z, r: c.r * (c.cone ? 0.8 : 0.92) });
      });
      mesh.castShadow = true;
      scene.add(mesh);
    });
    const rods = (list, hex) => {
      const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7), mat(hex), list.length);
      const dir = new THREE.Vector3();
      list.forEach((l, i) => {
        dir.subVectors(l.b, l.a);
        const len = dir.length();
        dummy.position.copy(l.a).addScaledVector(dir, 0.5);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        dummy.scale.set(l.r, len, l.r);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      dummy.quaternion.identity();
      m.castShadow = true;
      scene.add(m);
    };
    rods(limbs, '#6E4F36');
    rods(poles, '#C9925A');
    const baseMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.58, 0.1, 10), mat('#A8703F'), standBases.length);
    standBases.forEach(([x, z], i) => {
      dummy.position.set(x, 0.05, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      baseMesh.setMatrixAt(i, dummy.matrix);
    });
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);
  }

  // ---- 빼빼로 숲 (event only): its own seed, so the park's layout stays the same with or without it ----
  const pep = pepOpen ? buildPepero(scene, { rnd: mulberry(1111), perchSegs, obstacles, parkR: PARK_R, snowy, night: !!env.night, small, tint, snow: SNOW }) : null;
  if (pep) {
    pep.lands.forEach((l) => zoneLands.push(l));
    // now and then a resident flies over for a look
    zoneSpots.push(() => (Math.random() < 0.3 ? pep.spot() : null));
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
      plate: el(`park-plate${lit ? ' lit' : ''}${card.mine ? ' mine' : ''}`, card.mine ? tr('내 집', 'My house') : card.owner.nickname),
    });
    obstacles.push({ x: pos.x, z: pos.z, r: 1.5, h: 2.9 });
  }

  // ---- grass tufts that sway in the wind (?grass=0 turns them off) --------------------------
  // Low-poly clumps of a few blades, drawn instanced in chunks so the ones behind the camera are
  // skipped. The sway runs in the vertex shader: nothing per tuft on the CPU, and no shadows cast.
  const grassTime = { value: 0 };
  if (q.get('grass') !== '0') {
    const gr = mulberry(2026);
    // one tuft: five tapered blades leaning out from the middle, dark at the root, light at the tip
    const pos = [], cols = [];
    const root = new THREE.Color(env.night ? '#46532F' : '#7E9A4C'), tipC = new THREE.Color(env.night ? '#6E7A44' : '#C2D27A');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + gr() * 0.5, lean = 0.18 + gr() * 0.2, h = 0.55 + gr() * 0.45, w = 0.07;
      const ox = Math.cos(a) * 0.09, oz = Math.sin(a) * 0.09;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, h, tz);
      const r0 = root.clone().convertSRGBToLinear(), t0 = tipC.clone().convertSRGBToLinear();
      cols.push(r0.r, r0.g, r0.b, r0.r, r0.g, r0.b, t0.r, t0.g, t0.b);
    }
    const tuft = new THREE.BufferGeometry();
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tuft.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tuft.computeVertexNormals();
    // normals straight up: blades lit like the lawn under them, from both sides
    const nrm = tuft.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    grassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = grassTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          float bend = transformed.y * transformed.y;
          float gust = sin(uTime * 1.3 + wp.x * 0.21 + wp.y * 0.13) * 0.5 + 0.5;
          float flutter = sin(uTime * 3.1 + wp.x * 1.7 + wp.y * 2.3);
          transformed.x += bend * (0.10 + 0.22 * gust + 0.05 * flutter);
          transformed.z += bend * (0.04 * flutter + 0.08 * gust);
        }`);
    };
    // where tufts grow: lawn and meadow, never on paths, water, trunks or houses
    const onPath = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 5.6 || (r > RING_IN - 0.3 && r < RING_OUT + 0.3)) return true;
      if (r < PARK_R && PATH_A.some((pa) => { const ux = Math.cos(pa), uz = Math.sin(pa), along = x * ux + z * uz; return along > 0 && Math.abs(-x * uz + z * ux) < 1.25; })) return true;
      return nearTrail(x, z).d < TRAIL_HALF + 0.35;
    };
    const ok = (x, z) => {
      const r = Math.hypot(x, z);
      if (r > PARK_R + 5 && nearTrail(x, z).d > 7) return false;
      if (onPath(x, z) || waterAt(x, z)) return false;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.8) return false;
      if (BEACHES.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) return false;
      if (z < riverZ(x) + RIVER_W + 0.6) return false;
      if (PILES.some((p) => Math.hypot(x - p.x, z - p.z) < 1.5)) return false;
      return !obstacles.some((o) => !o.air && Math.hypot(x - o.x, z - o.z) < o.r + 0.25);
    };
    const want = Math.round((small ? 14000 : 34000) * (snowy ? 0.35 : 1));
    const CH = 12; // chunk size
    const chunks = new Map();
    for (let tries = 0, n = 0; n < want && tries < want * 4; tries++) {
      // mostly inside the park, some along the trail
      let x, z;
      if (gr() < 0.78) { const a = gr() * Math.PI * 2, r = Math.sqrt(gr()) * (PARK_R + 3); x = Math.cos(a) * r; z = Math.sin(a) * r; }
      else { const t = trailPts[Math.floor(gr() * trailPts.length)], a = gr() * Math.PI * 2, r = TRAIL_HALF + 0.4 + gr() * 6; x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r; }
      if (!ok(x, z)) continue;
      const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push([x, z, gr() * Math.PI * 2, (0.17 + gr() * 0.12) * (snowy ? 0.8 : 1)]);
      n++;
    }
    const tint0 = new THREE.Color();
    chunks.forEach((list, key) => {
      const [cx, cz] = key.split(',').map(Number);
      const g = tuft.clone();
      // instances are placed in world space, so the chunk's bounds are where the chunk is
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * CH, 0.2, (cz + 0.5) * CH), CH * 0.75);
      const m = new THREE.InstancedMesh(g, grassMat, list.length);
      list.forEach(([x, z, ry, sc], i) => {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sc * 1.6, sc, sc * 1.6);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        // a little colour variety: drier near paths, greener in the shade of the park
        const k = gr();
        tint0.setRGB(1, 1, 1);
        if (snowy) tint0.set('#E6ECEF');
        else if (k < 0.18) tint0.set('#E8D27A');
        else if (k < 0.5) tint0.set('#D9EBB8');
        m.setColorAt(i, tint0.convertSRGBToLinear());
      });
      m.receiveShadow = !small;
      scene.add(m);
    });
  }

  // ---- ground rules ------------------------------------------------------------------------
  /** On foot you can be in the park, on the trail, or on a beach (and a little way into the water there). */
  function walkable(x, z) {
    if (x * x + z * z < (PARK_R - 0.8) ** 2) return true;
    if (nearTrail(x, z).d < TRAIL_HALF) return true;
    if (pep && pep.walkable(x, z)) return true;
    return BEACHES.some((b) => Math.hypot(x - b.x, z - b.z) < b.r && z > deepLine(x));
  }
  /** The nearest place you can stand. */
  function toWalkable(x, z) {
    if (walkable(x, z)) return [x, z];
    const cands = [];
    const d = Math.hypot(x, z) || 1;
    cands.push([(x * (PARK_R - 0.85)) / d, (z * (PARK_R - 0.85)) / d]);
    const t = nearTrail(x, z);
    if (t.d > 0) { const k = (TRAIL_HALF - 0.05) / t.d; cands.push([t.q.x + (x - t.q.x) * k, t.q.z + (z - t.q.z) * k]); }
    if (pep) cands.push(...pep.nearest(x, z));
    BEACHES.forEach((b) => {
      const bd = Math.hypot(x - b.x, z - b.z);
      let px = x, pz = z;
      if (bd > b.r - 0.05) { px = b.x + ((x - b.x) * (b.r - 0.05)) / bd; pz = b.z + ((z - b.z) * (b.r - 0.05)) / bd; }
      pz = Math.max(pz, deepLine(px) + 0.05);
      if (walkable(px, pz)) cands.push([px, pz]);
    });
    let best = cands[0], bd = Infinity;
    cands.forEach((c) => { const dd = (c[0] - x) ** 2 + (c[1] - z) ** 2; if (dd < bd) { bd = dd; best = c; } });
    return best;
  }
  function groundPoint(x, z) {
    const [wx, wz] = toWalkable(x, z);
    const p = new THREE.Vector3(wx, 0, wz);
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
    [p.x, p.z] = toWalkable(p.x, p.z);
    return p;
  }
  /** Shallow water you can stand in: the pond's edge, the stream, the river by the beaches. */
  function waterAt(x, z) {
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r - 0.15) return true;
    if (puddles.some((p) => Math.hypot(x - p.x, z - p.z) < p.r)) return true;
    if (Math.abs(z - riverZ(x)) < RIVER_W - 0.1) return true;
    if (z < -15 && z > -52 && x > -19 && x < 19 && !bridges.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) {
      for (const q of streamPts) if ((q.x - x) ** 2 + (q.z - z) ** 2 < 0.56) return true;
    }
    return false;
  }
  /** The closest point on any perch (or on the given ones) to p. */
  function nearestPerch(p, list = perchSegs) {
    let best = null;
    const ab = new THREE.Vector3(), q = new THREE.Vector3();
    for (const s of list) {
      ab.subVectors(s.b, s.a);
      const t = clamp(q.subVectors(p, s.a).dot(ab) / ab.lengthSq(), 0, 1);
      q.copy(s.a).addScaledVector(ab, t);
      const d = q.distanceTo(p);
      if (!best || d < best.d) best = { s, t, d, p: q.clone() };
    }
    return best;
  }
  /** The closest perch point straight below (x, z) that is lower than y, within reach sideways. */
  function perchBelow(x, z, y, reach) {
    let best = null;
    const ab = new THREE.Vector3();
    for (const s of perchSegs) {
      ab.subVectors(s.b, s.a);
      const L2 = ab.x * ab.x + ab.z * ab.z || 1;
      const t = clamp(((x - s.a.x) * ab.x + (z - s.a.z) * ab.z) / L2, 0, 1);
      const px = s.a.x + ab.x * t, py = s.a.y + ab.y * t, pz = s.a.z + ab.z * t;
      const d = Math.hypot(px - x, pz - z);
      if (d > reach || py > y + 0.2) continue;
      if (!best || py > best.p.y) best = { s, t, p: new THREE.Vector3(px, py, pz) };
    }
    return best;
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
  /** The top of a tree's crown, a little lower towards its edge. */
  const canopyAt = (tr, x, z) => {
    const d = Math.hypot(x - tr.x, z - tr.z);
    const k = Math.min(1, d / tr.rr);
    return new THREE.Vector3(tr.x + (x - tr.x) * Math.min(1, tr.rr / Math.max(d, 0.001)) * k, tr.top - 0.35 * tr.s * k * k, tr.z + (z - tr.z) * Math.min(1, tr.rr / Math.max(d, 0.001)) * k);
  };
  /** Where a bird coming straight down from height y lands: a roof, a treetop, a branch, the bath, or the ground. */
  function surfaceBelow(x, z, y = 99) {
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
    const tree = climbTrees.find((tr) => Math.hypot(x - tr.x, z - tr.z) < tr.rr + 0.6 * tr.s && y > tr.top - 1.5);
    if (tree) return { p: canopyAt(tree, x, z), surface: 'canopy' };
    const br = perchBelow(x, z, y, 0.9);
    if (br) return { p: br.p, surface: 'branch' };
    if (Math.hypot(x - BATH.x, z - BATH.z) < 1.0) return bathSpot(new THREE.Vector3(x, 0, z));
    return { p: groundPoint(x, z), surface: 'ground' };
  }

  // ---- actors --------------------------------------------------------------------------------
  let clock = 0;
  let zoneNow = 'park';
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
      r.rid = 'r' + residents.length;
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
  const free = (p) => !actors.some((o) => o.pos.distanceTo(p) < 0.55);
  /** A free spot on a branch: half the time on the giant tree, otherwise any tree or perch stand. */
  function branchSpot(near) {
    for (let k = 0; k < 6; k++) {
      let list = Math.random() < 0.5 ? giantSegs : perchSegs;
      if (near && list === perchSegs) list = perchSegs.filter((sg) => sg.a.distanceTo(near) < 16);
      if (!list.length) list = giantSegs;
      const sg = pick(list);
      const p = sg.a.clone().lerp(sg.b, 0.1 + Math.random() * 0.8);
      if (free(p)) return { p, surface: 'branch' };
    }
    return null;
  }
  const bathSpot = (near) => {
    const a = near ? Math.atan2(near.z - BATH.z, near.x - BATH.x) + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
    return { p: new THREE.Vector3(BATH.x + Math.cos(a) * BATH.r, BATH.y, BATH.z + Math.sin(a) * BATH.r), surface: 'bath' };
  };
  /** Somewhere shallow to play in: the edge of the pond, the stream, or a beach on the river. */
  function wadeSpot() {
    const r = Math.random();
    if (r < 0.45) {
      const a = Math.random() * Math.PI * 2, rr = POND.r - 0.6 - Math.random() * 0.7;
      return { p: new THREE.Vector3(POND.x + Math.cos(a) * rr, 0, POND.z + Math.sin(a) * rr), surface: 'ground', wade: true, look: new THREE.Vector3(POND.x, 0, POND.z) };
    }
    if (r < 0.7) {
      const q = streamPts[6 + Math.floor(Math.random() * 40)];
      if (bridges.some((b) => Math.hypot(q.x - b.x, q.z - b.z) < b.r + 0.5)) return null;
      return { p: new THREE.Vector3(q.x, 0, q.z), surface: 'ground', wade: true };
    }
    const b = pick(BEACHES), x = b.x + (Math.random() - 0.5) * 3.5;
    return { p: groundPoint(x, riverZ(x) + RIVER_W - 0.9 - Math.random() * 1.0), surface: 'ground', wade: true, look: new THREE.Vector3(x, 0, riverZ(x)) };
  }
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
      // along the same branch, a bird's width away
      const n = nearestPerch(b.pos);
      if (n && n.d < 0.4) {
        const step = 0.85 / Math.max(0.5, n.s.a.distanceTo(n.s.b));
        let t = n.t + side * step;
        if (t < 0 || t > 1) t = n.t - side * step;
        return { p: n.s.a.clone().lerp(n.s.b, clamp(t, 0, 1)), surface: 'branch' };
      }
    }
    if (b.surface === 'canopy') {
      const tr = climbTrees.find((t) => Math.hypot(b.pos.x - t.x, b.pos.z - t.z) < t.rr + 1);
      if (tr) return { p: canopyAt(tr, b.pos.x + side * 0.8, b.pos.z + 0.4), surface: 'canopy' };
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
    if (r.move || (r.action && r.action.until > clock) || r.riding || (r.riddenUntil ?? 0) > clock) return;
    // at night most birds stay asleep where they are, and the ones awake look for a branch
    if (env.night && (r.surface === 'branch' || r.surface === 'perch' || r.surface === 'canopy') && Math.random() < 0.85) return;
    const x = env.night ? Math.random() * 0.34 : Math.random();
    let spot = null;
    if (x < 0.14 && r.pos.distanceTo(player.pos) < 12 && !entering) {
      spot = besides(player);
      flyTo(r, spot.p, spot.surface, () => { faceEachOther(r, player); say(r, pick(HELLO)); playCall('chirp', r.pitch, loudness(r)); });
      return;
    }
    if (x < 0.3) spot = branchSpot(r.pos);
    else if (x < 0.34) { const tr = pick(climbTrees.filter((t) => t.top < CRUISE_MAX)); spot = tr && { p: canopyAt(tr, tr.x + 0.3, tr.z), surface: 'canopy' }; }
    else if (x < 0.39) spot = bathSpot();
    else if (x < 0.43) spot = swingSpot();
    else if (x < 0.52) spot = wadeSpot();
    else if (x < 0.56) { const p = pick(PILES); spot = { p: groundPoint(p.x + 0.4, p.z + 0.4), surface: 'ground' }; }
    else if (x < 0.74) spot = pick(zoneSpots)();
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
      if (s.surface === 'bath') { act(r, 'SPLASH', 3.6); r.rotTarget = angleTo(r.pos, new THREE.Vector3(BATH.x, 0, BATH.z)); }
      else if (s.wade) { act(r, 'SPLASH', 3.6 + Math.random() * 2.4); if (Math.random() < 0.5) say(r, pick(L(['첨벙첨벙', '물놀이다!', '시원해'], ['Splish splash', 'Water time!', 'So cool'])), 1.4); }
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
        say(player, hh.card.mine ? tr('다녀왔어요!', 'I\'m home!') : tr('실례합니다!', 'Excuse me!'), 1.2);
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
  /** Distance along dir from o to the first tree crown in the way (crowns that hold o do not count). */
  function sphereHit(o, dir, far) {
    let best = far;
    for (const s of occludeSpheres) {
      const ox = o.x - s.x, oy = o.y - s.y, oz = o.z - s.z;
      const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
      if (c < 0) continue;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      if (b > 0) continue;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) best = t;
    }
    return best;
  }
  function stepCamera(dt, snap, moving) {
    // third person: while the bird moves, the camera swings round behind it (a drag pauses this)
    if (view === 'third' && moving && clock > manualUntil && !entering) {
      cam.yawT = lerpAngle(cam.yawT, yawBehind(player.b.group.rotation.y), 1 - Math.exp(-dt * 1.6));
    }
    if (view === 'first') {
      const k = snap ? 1 : 1 - Math.exp(-dt * 12);
      cam.yaw = lerpAngle(cam.yaw, cam.yawT, k);
      const s = (player.b.group.scale.x || 1) * (player.b.size || 1);
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
      const near = Math.min(hit ? hit.distance : cam.dist, sphereHit(look, dir, cam.dist));
      return { pitch, dir, reach: near < cam.dist ? near - 0.4 : cam.dist };
    };
    let best = reachAt(cam.pitch);
    // under a tree the way out is often lower, not higher
    for (const extra of [-0.3, 0.35, 0.7]) {
      if (best.reach >= Math.min(cam.dist, 3.2)) break;
      const alt = reachAt(clamp(cam.pitch + extra, 0.04, 1.4));
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
  // tap targets are never drawn (the raycaster does not care), so they cost nothing per frame
  const land = (geo, pos, fn) => {
    const m = new THREE.Mesh(geo, hitMat);
    m.position.copy(pos);
    m.userData.land = fn;
    m.visible = false;
    scene.add(m);
    m.updateMatrixWorld(true);
    landables.push(m);
  };
  const onPerch = (segs) => (pt) => { const n = nearestPerch(pt, segs); return n && { p: n.p, surface: 'branch' }; };
  // the giant tree: tap where you want to sit and you get the nearest branch to that spot
  land(new THREE.CylinderGeometry(3.6, 3.6, 7.4, 12), new THREE.Vector3(0, 5.2, 0), onPerch(giantSegs));
  // every other tree: the branches, or the very top of the crown
  climbTrees.forEach((tr) => {
    const lo = 1.7 * tr.s, hgt = tr.top - lo;
    land(new THREE.CylinderGeometry(tr.rr + 0.9 * tr.s, tr.rr + 0.9 * tr.s, hgt, 8), new THREE.Vector3(tr.x, lo + hgt / 2, tr.z), (pt) => {
      if (pt.y > tr.top - 2.2 * tr.s) return { p: canopyAt(tr, pt.x, pt.z), surface: 'canopy' };
      return onPerch(tr.segs)(pt);
    });
  });
  stands.forEach((st) => land(new THREE.CylinderGeometry(1.15, 1.15, 1.6, 8), new THREE.Vector3(st.x, 1.35, st.z), onPerch(st.segs)));
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
    if (player.b.group.visible && view !== 'first' && !flying && ray.intersectObject(player.b.group, true).length) {
      petPlayer();
      return;
    }
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
            // a friendly hello: the other bird offers its head, like parrots preening each other
            act(other, Math.random() < 0.5 ? 'PETTED' : 'CHIRP', 1.8);
            act(player, 'CHIRP', 0.7);
            heartsAt(other, 3);
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
      const got = hit.object.userData.land(hit.point);
      if (!got) { say(player, tr('자리가 없어요', 'No room here'), 1); return; }
      target = got.p;
      surface = got.surface;
      dx = got.dx ?? 0;
      after = got.after || null;
    } else {
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;
      if (p.distanceTo(player.pos) > 40) return;
      target = groundPoint(p.x, p.z);
    }
    player.action = null;
    goTo(player, target, surface, () => {
      if (after) after(player);
      if (surface === 'swing') { player.swingDx = dx; say(player, tr('흔들흔들', 'Swing swing'), 1.2); }
      if (surface === 'bath') { act(player, 'SPLASH', 3.6); say(player, tr('첨벙첨벙', 'Splish splash'), 1.4); player.splashAt = clock + 7; }
      else if (surface === 'ground' && waterAt(player.pos.x, player.pos.z)) { act(player, 'SPLASH', 3.6); player.splashAt = clock + 7; }
      else if (surface === 'canopy') say(player, pick(L(['나무 꼭대기다!', '하늘이 가까워', '여기 최고'], ['Treetop!', 'Close to the sky', 'Best spot'])), 1.4);
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
        // down a branch at a time when there is one ahead, otherwise to the ground
        const ahead = perchBelow(player.pos.x + dx * 1.3, player.pos.z + dz * 1.3, player.pos.y - 0.3, 1.0);
        if (ahead && player.pos.y - ahead.p.y < 2.8 && free(ahead.p)) flyTo(player, ahead.p, 'branch', null);
        else flyTo(player, groundPoint(player.pos.x + dx * 1.6, player.pos.z + dz * 1.6), 'ground', null);
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
      x = clamp(x, -WORLD_R, WORLD_R);
      z = clamp(z, -WORLD_R, pep ? pep.flyLimit : WORLD_R);
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
    if (!landing.below) landing = { below: surfaceBelow(player.pos.x, player.pos.z, player.pos.y) };
    const below = landing.below;
    player.pos.y += (below.p.y - player.pos.y) * (1 - Math.exp(-dt * 3.5));
    const k = 1 - Math.exp(-dt * 6);
    player.pos.x += (below.p.x - player.pos.x) * k;
    player.pos.z += (below.p.z - player.pos.z) * k;
    if (Math.abs(player.pos.y - below.p.y) < 0.06) {
      player.pos.copy(below.p);
      flying = false;
      landing = false;
      player.surface = below.surface;
      if (below.surface === 'roof') say(player, pick(L(['지붕 위다!', '높다!'], ['On the roof!', 'So high!'])), 1.2);
      if (below.surface === 'canopy') say(player, pick(L(['나무 꼭대기다!', '단풍 이불이다'], ['Treetop!', 'A blanket of leaves'])), 1.2);
      if (below.surface === 'branch') say(player, pick(L(['나뭇가지 위!', '여기 좋다'], ['On a branch!', 'Nice here'])), 1.2);
    }
  }

  // ---- remote players (other people online) ------------------------------------------------------
  const remotes = new Map();
  function remoteActor(pid, lk, s) {
    const b = makeBird(lk.colors, lk.species);
    scene.add(b.group);
    const a = actor(b, lk.name, { remote: { pid, home: lk.home || null, target: new THREE.Vector3(s.x, s.y, s.z), ry: s.ry || 0, m: s.m || 0, calm: !!s.calm } });
    a.pos.set(s.x, s.y, s.z);
    a.b.group.rotation.y = a.rotTarget = s.ry || 0;
    remotes.set(pid, a);
    return a;
  }
  function stepRemotes(dt) {
    const k = 1 - Math.exp(-dt * 9);
    remotes.forEach((a) => {
      a.pos.lerp(a.remote.target, k);
      if (a.remote.target.y < 0.05 && waterAt(a.pos.x, a.pos.z)) a.pos.y = -0.1;
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
    const hello = wet ? tr('비가 와요', 'It\'s raining') : snowy ? (new Date().getMonth() === 10 ? tr('첫눈이다!', 'First snow!') : tr('눈이다!', 'Snow!')) : env.night ? tr('밤 공원이다', 'The park at night') : tr('가을이다!', 'Autumn!');
    flyTo(player, groundPoint(0, 23), 'ground', () => { say(player, hello, 1.8); playCall('chirp', 1, 0.8); });
  }
  stepCamera(0, true);

  // ---- snacks: sunflower seeds on the ground, and every bird nearby comes to eat ----------------
  const SEED_N = 90;
  const seedMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), mat('#3E3A35'), SEED_N);
  seedMesh.frustumCulled = false;
  scene.add(seedMesh);
  const seeds = Array.from({ length: SEED_N }, () => ({ alive: false, p: new THREE.Vector3(), ry: 0, y0: 0, t0: 0, pile: null }));
  const piles = []; // { x, z, left, until }
  let seedsDirty = true;
  function drawSeeds() {
    seeds.forEach((sd, i) => {
      dummy.position.copy(sd.p);
      dummy.rotation.set(0, sd.ry, 0.25);
      if (sd.alive) dummy.scale.set(0.075, 0.03, 0.042);
      else dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      seedMesh.setMatrixAt(i, dummy.matrix);
    });
    seedMesh.instanceMatrix.needsUpdate = true;
  }
  function throwSeeds(x, z, from) {
    const pile = { x, z, left: 0, until: clock + 50 };
    for (let k = 0, i = 0; k < 16 && i < SEED_N; i++) {
      const sd = seeds[i];
      if (sd.alive) continue;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.9;
      sd.alive = true;
      sd.pile = pile;
      sd.p.set(x + Math.cos(a) * r, from, z + Math.sin(a) * r);
      sd.y0 = from;
      sd.t0 = clock + Math.random() * 0.15;
      sd.ry = Math.random() * Math.PI;
      pile.left++;
      k++;
    }
    piles.push(pile);
    seedsDirty = true;
    return pile;
  }
  function eatFrom(pile, a) {
    let best = null, bd = Infinity;
    seeds.forEach((sd) => {
      if (!sd.alive || sd.pile !== pile) return;
      const d = Math.hypot(sd.p.x - a.pos.x, sd.p.z - a.pos.z);
      if (d < bd) { bd = d; best = sd; }
    });
    if (!best) return;
    best.alive = false;
    pile.left--;
    seedsDirty = true;
    if (a.pos.distanceTo(player.pos) < 8) playFx('crunch', a.isPlayer ? 0.35 : 0.18);
  }
  const YUM = L(['냠냠', '맛있다!', '해바라기씨다', '오독오독', '하나 더!'], ['Nom nom', 'Yummy!', 'Sunflower seeds', 'Crunch crunch', 'One more!']);
  /** Birds within reach come over, settle round the pile and eat. */
  function callToSnack(pile) {
    residents
      .filter((r) => !r.move && r.scale > 0.5 && r.pos.distanceTo(new THREE.Vector3(pile.x, 0, pile.z)) < 18)
      .slice(0, 6)
      .forEach((r, k) => {
        setTimeout(() => {
          if (gone || pile.left <= 0) return;
          const a = Math.random() * Math.PI * 2, rr = 0.75 + Math.random() * 0.35;
          const spot = groundPoint(pile.x + Math.cos(a) * rr, pile.z + Math.sin(a) * rr);
          r.action = null;
          goTo(r, spot, 'ground', () => {
            r.rotTarget = angleTo(r.pos, new THREE.Vector3(pile.x, 0, pile.z));
            act(r, 'EAT', 4 + Math.random() * 3);
            r.nextThink = clock + 9;
            if (Math.random() < 0.6) say(r, pick(YUM), 1.3);
          });
          r.nextThink = clock + 20;
        }, 300 + k * 350 + Math.random() * 400);
      });
  }
  function stepSnacks() {
    seeds.forEach((sd) => {
      if (!sd.alive || sd.p.y <= 0.031) return;
      const t = clock - sd.t0;
      if (t < 0) return;
      sd.p.y = Math.max(0.03, sd.y0 - 4.5 * t * t);
      seedsDirty = true;
    });
    for (let i = piles.length - 1; i >= 0; i--) {
      const pile = piles[i];
      if (pile.left > 0 && clock < pile.until) {
        actors.forEach((a) => {
          if (!a.action || a.action.name !== 'EAT' || a.action.until < clock || a.move) return;
          if (Math.hypot(a.pos.x - pile.x, a.pos.z - pile.z) > 1.6 || clock < (a.biteAt || 0)) return;
          eatFrom(pile, a);
          a.biteAt = clock + 0.8 + Math.random() * 0.5;
          if (pile.left <= 0 && Math.random() < 0.5) say(a, tr('다 먹었다', 'All gone'), 1.2);
        });
        continue;
      }
      seeds.forEach((sd) => { if (sd.pile === pile) sd.alive = false; });
      piles.splice(i, 1);
      seedsDirty = true;
    }
    if (seedsDirty) { drawSeeds(); seedsDirty = false; }
  }
  let snackAt = 0;
  function snack() {
    if (entering) return 'busy';
    if (clock < snackAt) return 'wait';
    snackAt = clock + 5;
    const ry = player.b.group.rotation.y, fx = Math.cos(ry), fz = -Math.sin(ry);
    const onFoot = onGround(player.pos) && !flying;
    const at = groundPoint(player.pos.x + fx * (onFoot ? 1.0 : 0), player.pos.z + fz * (onFoot ? 1.0 : 0));
    const pile = throwSeeds(at.x, at.z, Math.max(0.6, player.pos.y + 0.5));
    act(player, 'CHIRP', 0.6);
    say(player, tr('간식이다!', 'Snack time!'), 1.3);
    playCall('chirp', 1, 0.8);
    if (onFoot) {
      player.move = null;
      player.rotTarget = angleTo(player.pos, at);
      setTimeout(() => { if (!gone && !player.move) act(player, 'EAT', 3.5); }, 500);
    }
    callToSnack(pile);
    return 'ok';
  }

  // ---- singing: chirp three or more times in a rhythm and the birds nearby sing it back ---------
  let songTimes = [];
  let songCheck = 0;
  let pendingReplies = [];
  let gone = false;
  const later = (ms, fn) => setTimeout(() => { if (!gone) fn(); }, ms);
  function startSong(times) {
    const gaps = times.map((t) => t - times[0]);
    const len = gaps[gaps.length - 1];
    const singers = residents.filter((r) => !r.move && r.scale > 0.5 && r.pos.distanceTo(player.pos) < 10).slice(0, 6);
    if (!singers.length) { act(player, 'SING', len + 0.8); say(player, '♪', 1.2); return; }
    later(450, () => act(player, 'SING', len + 1.0));
    singers.forEach((r, k) => {
      const start = 500 + k * 90;
      later(start, () => {
        act(r, 'SING', len + 0.9);
        r.rotTarget = angleTo(r.pos, player.pos);
        r.nextThink = Math.max(r.nextThink, clock + len + 3);
        say(r, '♪', len + 0.6);
      });
      gaps.forEach((g) => later(start + g * 1000, () => playCall('chirp', r.pitch, Math.max(0.15, loudness(r)))));
    });
    later(600 + len * 1000 + 500, () => {
      heartsAt(player, 3);
      say(player, pick(L(['같이 불렀다!', '우리 합창단', '앵무 합창!'], ['We sang together!', 'Our choir', 'Parrot chorus!'])), 1.6);
    });
  }
  function chirp() {
    if (entering) return;
    act(player, 'CHIRP', 0.7);
    say(player, pick(CHIRPS), 1.2);
    playCall('chirp', 1, 0.85);
    songTimes = songTimes.filter((t) => clock - t < 4);
    songTimes.push(clock);
    if (songTimes.length >= 2) {
      // a rhythm is starting: hold the usual replies, the song comes after
      pendingReplies.forEach(clearTimeout);
      pendingReplies = [];
    } else {
      residents.forEach((r) => {
        if (r.pos.distanceTo(player.pos) > 7) return;
        pendingReplies.push(setTimeout(() => {
          if (gone) return;
          act(r, 'CHIRP', 0.7);
          say(r, pick(REPLIES));
          playCall('chirp', r.pitch, loudness(r));
          if (!r.move) r.rotTarget = angleTo(r.pos, player.pos);
        }, 350 + Math.random() * 700));
      });
    }
    clearTimeout(songCheck);
    songCheck = setTimeout(() => {
      if (gone) return;
      if (songTimes.length >= 3) startSong(songTimes.slice());
      songTimes = [];
    }, 1500); // a pause of a beat and a half ends the tune
  }

  // ---- weather: rain (puddles you can splash in) or snow (footprints) ------------------------------
  const PRECIP_BOX = 34, PRECIP_H = 18;
  let precip = null;
  if (wet || snowy) {
    const n = wet ? (small ? 700 : 1300) : small ? 600 : 1100;
    const pos = new Float32Array(n * (wet ? 6 : 3));
    const seedsP = [];
    for (let i = 0; i < n; i++) seedsP.push([Math.random() * PRECIP_BOX, Math.random() * PRECIP_H, Math.random() * PRECIP_BOX, Math.random() * Math.PI * 2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = wet
      ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: toLinear(env.night ? '#8796B0' : '#C9D4E2'), transparent: true, opacity: 0.55 }))
      : new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: small ? 0.14 : 0.12, transparent: true, opacity: 0.95 }));
    obj.frustumCulled = false;
    scene.add(obj);
    precip = { obj, pos, seeds: seedsP, n };
  }
  if (wet) {
    // puddles on the paths and the plaza
    const spots = [[2.5, 3.2, 0.9], [-3.4, -2.1, 0.7], ...[0.4, 1.3, 2.2, 3.1, 4.0, 4.9, 5.8].map((a) => [Math.cos(a) * ((RING_IN + RING_OUT) / 2), Math.sin(a) * ((RING_IN + RING_OUT) / 2), 0.8 + (a % 1) * 0.4]),
      [1.0, 20, 0.8], [-0.6, -24, 0.9], ...[0.15, 0.35, 0.55, 0.75, 0.9].map((f) => { const q = trailPts[Math.floor(f * (trailPts.length - 1))]; return [q.x, q.z, 0.85]; })];
    const pm = new THREE.MeshStandardMaterial({ color: toLinear(env.night ? '#2A3646' : '#7E8C98'), roughness: 0.08, metalness: 0.2 });
    spots.forEach(([x, z, r]) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), pm);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(r * 1.3, r, 1);
      m.position.set(x, 0.018, z);
      scene.add(m);
      puddles.push({ x, z, r: r * 0.95 });
    });
  }
  function stepWeather(dt) {
    if (!precip) return;
    const cx = player.pos.x - PRECIP_BOX / 2, cz = player.pos.z - PRECIP_BOX / 2, cy = Math.max(0, player.pos.y - 4);
    const { pos, seeds: sp, n } = precip;
    for (let i = 0; i < n; i++) {
      const d = sp[i];
      if (wet) d[1] -= 17 * dt;
      else { d[1] -= 1.1 * dt; d[0] += Math.sin(clock * 0.8 + d[3]) * 0.35 * dt; d[2] += Math.cos(clock * 0.6 + d[3]) * 0.25 * dt; }
      if (d[1] < 0) d[1] += PRECIP_H;
      // wrap the box around the camera so the weather is always where you are
      const x = cx + ((((d[0] - cx) % PRECIP_BOX) + PRECIP_BOX) % PRECIP_BOX);
      const z = cz + ((((d[2] - cz) % PRECIP_BOX) + PRECIP_BOX) % PRECIP_BOX);
      const y = cy + d[1];
      if (wet) {
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x + 0.04; pos[i * 6 + 4] = y + 0.45; pos[i * 6 + 5] = z + 0.02;
      } else { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; }
    }
    precip.obj.geometry.attributes.position.needsUpdate = true;
    // raindrops landing on water near you
    if (wet && Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 12;
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      if (waterAt(x, z)) ripple(x, 0.04, z, 0.35);
    }
  }
  // footprints in the snow: two toes forward, two back
  const printTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(70,78,92,0.9)';
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    [[16, 16, 28, 9], [16, 16, 28, 21], [16, 16, 5, 10], [16, 16, 5, 22]].forEach(([x0, y0, x1, y1]) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); });
    return new THREE.CanvasTexture(c);
  })();
  const PRINT_N = snowy ? 220 : 1;
  const prints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false, opacity: 0.55 }), PRINT_N);
  prints.frustumCulled = false;
  prints.count = 0;
  scene.add(prints);
  let printNext = 0;
  function stepPrints() {
    if (!snowy) return;
    actors.forEach((a) => {
      if (a.remote || a.wet || !onGround(a.pos) || a.scale < 0.5) return;
      const moving = a.move ? a.move.type !== 'fly' : a.isPlayer && a.stepping;
      if (!moving || clock < (a.printAt || 0) || a.pos.distanceTo(player.pos) > 30) return;
      a.printAt = clock + 0.24;
      a.printSide = -(a.printSide || 1);
      const ry = a.b.group.rotation.y, size = (a.b.size || 1) * a.scale;
      dummy.position.set(a.pos.x + Math.sin(ry) * 0.09 * a.printSide * size, 0.02, a.pos.z + Math.cos(ry) * 0.09 * a.printSide * size);
      dummy.rotation.set(-Math.PI / 2, 0, ry);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      prints.setMatrixAt(printNext, dummy.matrix);
      printNext = (printNext + 1) % PRINT_N;
      prints.count = Math.min(PRINT_N, prints.count + 1);
      prints.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- small cute things: side-eye looks, being petted, hearts ---------------------------------
  const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  /** Local yaw from a bird to what it would like to watch: you (the camera) for your own bird, you for birds nearby. */
  function lookFor(a) {
    let tx, tz;
    if (a.isPlayer) {
      if (view === 'first') return undefined;
      tx = camera.position.x; tz = camera.position.z;
    } else if (player.b.group.visible && a.pos.distanceTo(player.pos) < 5) {
      tx = player.pos.x; tz = player.pos.z;
    } else return undefined;
    return wrapA(Math.atan2(-(tz - a.pos.z), tx - a.pos.x) - a.b.group.rotation.y);
  }
  const heartTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#FF6F91';
    g.beginPath();
    g.moveTo(32, 56);
    g.bezierCurveTo(4, 36, 6, 10, 22, 10);
    g.bezierCurveTo(28, 10, 32, 15, 32, 19);
    g.bezierCurveTo(32, 15, 36, 10, 42, 10);
    g.bezierCurveTo(58, 10, 60, 36, 32, 56);
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const heartSprites = Array.from({ length: 14 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    return { sp, life: 0, vx: 0, vz: 0 };
  });
  let heartNext = 0;
  function heartsAt(a, n = 4) {
    const top = (a.b.size || 1) * a.scale * 1.15;
    for (let k = 0; k < n; k++) {
      const h = heartSprites[heartNext];
      heartNext = (heartNext + 1) % heartSprites.length;
      h.sp.position.set(a.pos.x + (Math.random() - 0.5) * 0.4, a.pos.y + top + k * 0.12, a.pos.z + (Math.random() - 0.5) * 0.4);
      h.vx = (Math.random() - 0.5) * 0.4;
      h.vz = (Math.random() - 0.5) * 0.4;
      h.life = 1.4 + k * 0.15;
      h.sp.visible = true;
    }
  }
  function stepHearts(dt) {
    heartSprites.forEach((h) => {
      if (!h.sp.visible) return;
      h.life -= dt;
      if (h.life <= 0) { h.sp.visible = false; return; }
      h.sp.position.x += h.vx * dt;
      h.sp.position.z += h.vz * dt;
      h.sp.position.y += 0.7 * dt;
      const k = Math.min(1, h.life / 0.5);
      h.sp.material.opacity = k;
      h.sp.scale.setScalar(0.42 * (0.6 + 0.4 * Math.min(1, (1.6 - h.life) * 4)));
    });
  }
  const PETTED = L(['헤헤', '좋아', '더 해줘', '거기거기', '사르르'], ['Hehe', 'I like it', 'More please', 'Right there', 'Mmm']);
  /** Your own bird, tapped: it leans into the scratch. */
  function petPlayer() {
    act(player, 'PETTED', 2.4);
    heartsAt(player, 4);
    say(player, pick(PETTED), 1.4);
    playCall('chirp', player.pitch * 1.15, 0.25);
    player.begCount = 99; // no need to ask any more, they know
  }
  // a bird that has been still for a while bows its head now and then: a hint that it can be petted
  function stepBeg() {
    if (player.move || flying || (player.action && player.action.until > clock) || player.wet || view === 'first') { player.stillSince = clock; return; }
    if (env.night) return; // sleepy time, not begging time
    if (clock - (player.stillSince ?? clock) > 12 && (player.begCount || 0) < 3 && clock > (player.begAt || 0)) {
      act(player, 'BEG', 3);
      say(player, tr('쓰담쓰담 해줘', 'Pet me?'), 2.2);
      player.begCount = (player.begCount || 0) + 1;
      player.begAt = clock + 40;
      player.stillSince = clock;
    }
  }

  // ---- water play: ripples where birds stand in water, and the spray when they flick it up ---------
  const ripples = Array.from({ length: 18 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    return { m, life: 0, size: 1 };
  });
  let rippleNext = 0;
  function ripple(x, y, z, size = 1) {
    const r = ripples[rippleNext];
    rippleNext = (rippleNext + 1) % ripples.length;
    r.m.position.set(x, y, z);
    r.life = 1;
    r.size = size;
    r.m.visible = true;
  }
  const dropN = 240;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: toLinear(env.night ? "#9FC4DC" : "#F2FAFF") }), dropN);
  drops.frustumCulled = false;
  scene.add(drops);
  const DR = Array.from({ length: dropN }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), floor: 0 }));
  let dropNext = 0;
  /** Water thrown up from in front of a bird's beak, up and back over its head. */
  function spray(a, n) {
    const ry = a.b.group.rotation.y, fx = Math.cos(ry), fz = -Math.sin(ry);
    const size = (a.b.size || 1) * a.scale;
    const floor = a.surface === 'bath' ? BATH.y + 0.03 : 0.03;
    const ox = a.pos.x + fx * 0.42 * size, oz = a.pos.z + fz * 0.42 * size;
    for (let k = 0; k < n; k++) {
      const d = DR[dropNext];
      dropNext = (dropNext + 1) % dropN;
      d.life = 1.6;
      d.floor = floor;
      d.p.set(ox + (Math.random() - 0.5) * 0.1, floor + 0.05, oz + (Math.random() - 0.5) * 0.1);
      const back = -0.4 + Math.random() * 1.3, side = (Math.random() - 0.5) * 1.4;
      d.v.set(-fx * back - fz * side, 3.0 + Math.random() * 1.8, -fz * back + fx * side).multiplyScalar(Math.sqrt(size));
    }
    ripple(ox, floor + 0.01, oz, 0.7 * size);
    if (a.pos.distanceTo(player.pos) < 9) playFx('splash', a.isPlayer ? 0.3 : 0.12);
  }
  function stepWater(dt, steering) {
    ripples.forEach((r) => {
      if (!r.m.visible) return;
      r.life -= dt * 0.9;
      if (r.life <= 0) { r.m.visible = false; return; }
      r.m.scale.setScalar(r.size * (0.25 + (1 - r.life) * 0.9));
      r.m.material.opacity = r.life * 0.55;
    });
    DR.forEach((d, i) => {
      if (d.life > 0) {
        d.life -= dt;
        d.v.y -= 9 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < d.floor) d.life = 0;
        dummy.position.copy(d.p);
        dummy.scale.setScalar(d.life > 0 ? 1 : 0.001);
      } else {
        dummy.position.set(0, -20, 0);
        dummy.scale.setScalar(0.001);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
    // birds standing in water sink in a little, leave ripples, and now and then start playing
    actors.forEach((a) => {
      if (a.scale < 0.5 || !a.b.group.visible) return;
      const grounded = a.pos.y < 0.05 && !(a.move && a.move.type === 'fly') && !(a.isPlayer && flying);
      const wet = grounded && waterAt(a.pos.x, a.pos.z);
      if (grounded && !a.remote) a.pos.y = wet ? -0.1 : 0;
      if (wet && !a.wet) {
        ripple(a.pos.x, 0.04, a.pos.z, 1.3);
        spray(a, 5);
        if (a.isPlayer) { say(player, pick(L(['첨벙!', '물이다!', '시원해'], ['Splash!', 'Water!', 'So cool'])), 1.2); if (!(a.splashAt > clock)) a.splashAt = clock + 1.3; }
      }
      a.wet = wet;
      if (!wet) return;
      const moving = !!a.move || (a.isPlayer && steering) || (a.remote && a.remote.m === 1);
      if (clock > (a.rippleAt || 0)) { ripple(a.pos.x, 0.04, a.pos.z, moving ? 0.7 : 0.95); a.rippleAt = clock + (moving ? 0.3 : 1.5); }
      if (a.isPlayer && !moving && !(a.action && a.action.until > clock) && clock > (a.splashAt || 0)) {
        act(a, 'SPLASH', 3.6);
        a.splashAt = clock + 7 + Math.random() * 4;
      }
    });
  }

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
    grassTime.value = clock;
    if (pep && pep.zoneOf(player.pos) !== zoneNow) {
      zoneNow = pep.zoneOf(player.pos);
      if (onZone) onZone(zoneNow);
      if (zoneNow === 'pepero') say(player, pick(L(['빼빼로 숲이다!', '냄새만 맡을게', '초콜릿은 먹으면 안 돼!'], ['The Pepero Forest!', 'Just a sniff', 'No chocolate for me!'])), 1.8);
    }

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
        flyTo(player, h0.front, 'ground', () => { say(player, h0.card.mine ? tr('다시 앵파크로!', 'Back to the park!') : tr('재밌었다!', 'That was fun!'), 1.4); playCall('chirp', 1, 0.7); });
      }
    }

    const steering = stepControl(dt);
    stepFlight(dt);
    stepRemotes(dt);
    stepPranks(steering);

    actors.forEach((a) => {
      if (!a.remote) stepMove(a, dt);
      let mode;
      if (a.remote) mode = a.action && a.action.until > clock ? a.action.name : CODE_MODE[a.remote.m] || 'idle';
      else if (a.move) mode = a.move.type === 'fly' ? 'FLY' : 'WALK';
      else if (a.isPlayer && flying) mode = 'FLY';
      else if (a.isPlayer && steering) mode = 'WALK';
      else if (a.action && a.action.until > clock) mode = a.action.name;
      else mode = a.isPlayer ? 'idle' : a.surface === 'branch' || a.surface === 'perch' || a.surface === 'canopy' ? 'CALM' : 'idle';
      // at night birds sleep where they sit: on one leg, head tucked into the back
      if (env.night && mode === 'CALM') mode = 'ROOST';
      if (a.isPlayer && env.night && mode === 'idle' && !a.wet && clock - (a.stillSince ?? clock) > 10) {
        mode = 'ROOST';
        if (!a.roosting) say(a, 'zZ', 2);
      }
      a.roosting = mode === 'ROOST';
      if (a.isPlayer) playerMode = mode;
      a.b.pose(mode, reduce ? 0 : clock + a.pitch * 7, mode === 'idle' || mode === 'CALM' ? lookFor(a) : undefined);
      // the flick of a water game: throw the spray as the head comes up (same clock as the pose)
      if (mode === 'SPLASH' && !reduce) {
        const u = ((clock + a.pitch * 7) % 1.2) / 1.2;
        if (a.splashU != null && a.splashU < 0.56 && u >= 0.56) spray(a, 22);
        a.splashU = u;
      } else a.splashU = null;
      a.b.group.scale.setScalar(a.scale);
      a.b.group.rotation.y = lerpAngle(a.b.group.rotation.y, a.rotTarget, 1 - Math.exp(-dt * 9));
      if (a.bubbleUntil < clock) a.bubbleEl.hidden = true;
    });
    residents.forEach((r) => {
      if (clock > r.nextThink) { r.nextThink = clock + 6 + Math.random() * 8; think(r); }
      if (clock > r.nextChirp) {
        r.nextChirp = clock + 9 + Math.random() * 14;
        if (!r.move && !r.roosting && loudness(r) > 0.05) { act(r, 'CHIRP', 0.5); playCall(Math.random() < 0.15 ? 'call' : 'chirp', r.pitch, loudness(r) * 0.5); }
      }
      if (!r.move && !(r.action && r.action.until > clock) && r.pos.distanceTo(player.pos) < 1.8) r.rotTarget = angleTo(r.pos, player.pos);
    });
    keepApart();
    player.stepping = !!steering && !flying;
    stepWater(dt, steering);
    stepHearts(dt);
    stepSnacks();
    stepWeather(dt);
    stepPrints();
    if (steering) player.stillSince = clock;
    stepBeg();
    ticks.forEach((f) => f(clock, dt));
    if ((steering || player.move) && onGround(player.pos) && clock > rustleAt) {
      if (Math.hypot(player.pos.x - PZ.x, player.pos.z - PZ.z) < PZ.r) { say(player, tr('사각사각', 'Rustle rustle'), 1.1); rustleAt = clock + 5; }
      else if (Math.hypot(player.pos.x - CZ.x, player.pos.z - CZ.z) < CZ.r) { say(player, pick(L(['꽃향기~', '코스모스다'], ['Smells nice~', 'Cosmos!'])), 1.3); rustleAt = clock + 6; }
    }

    // leaf piles burst when someone runs through
    PILES.forEach((p) => {
      if (clock < p.cool) return;
      const who = actors.find((a) => onGround(a.pos) && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 1.3
        && (a.move || (a.isPlayer && steering) || (a.remote && a.remote.m === 1)));
      if (!who) return;
      p.cool = clock + 2.2;
      leafBurst(p.x, p.z);
      if (who.isPlayer) say(player, tr('바스락!', 'Crunch!'), 1.2);
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
      // name tags sit above the bird, so big species carry them higher
      const above = 0.3 + 1.1 * (a.b.size || 1);
      if (show) place(a.tagEl, a.pos, above, 40);
      if (!a.bubbleEl.hidden) place(a.bubbleEl, a.pos, above, 40);
    });
  }
  raf = requestAnimationFrame(frame);

  // ---- pranks: poke, shove, snatch a snack, ride on the head, fake preen ------------------------------
  // Played locally on whoever is involved. With another person the server decides whether a prank
  // happens (close enough, they take pranks, not too often); see Park.tsx and docs/park-realtime.md.
  const timeline = []; // { at, fn }
  const soon = (sec, fn) => timeline.push({ at: clock + sec, fn }); // seconds on the game clock
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xd9cbb4, transparent: true });
  /** A little cloud of dust between two birds scuffling. */
  function dust(a, b) {
    const mid = a.pos.clone().lerp(b.pos, 0.5);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.random() * 0.12, 6, 5), dustMat.clone());
      m.position.copy(mid).add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 1.1));
      scene.add(m);
      sparks.push({ m, vy: 0.3 + Math.random() * 0.4, life: 1.2 });
    }
  }
  /** A few feathers knocked loose. */
  function feathersOff(a) {
    const color = toLinear(a.b.colors?.body || '#9BC9A0');
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.scale.set(1, 0.35, 1.8);
      m.position.copy(a.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6));
      scene.add(m);
      sparks.push({ m, vy: 0.25 + Math.random() * 0.3, life: 1.4 });
    }
  }
  const headTop = (t) => t.pos.clone().add(new THREE.Vector3(0, 1.22 * (t.b.size || 1), 0));
  const local = (a) => !a.remote;
  /** Knocked off balance: slide a step away on the ground, or tumble off a branch. Only for birds this tab moves. */
  function knock(t, from) {
    if (!local(t) || entering) return;
    const dx = t.pos.x - from.pos.x, dz = t.pos.z - from.pos.z, d = Math.hypot(dx, dz) || 1;
    const p = groundPoint(t.pos.x + (dx / d) * 1.4, t.pos.z + (dz / d) * 1.4);
    if (t.isPlayer) { flying = false; landing = false; }
    t.riding = null;
    t.action = null;
    flyTo(t, p, 'ground', null);
    t.move.peak = Math.max(t.pos.y, p.y) + 0.35;
    t.move.dur = 0.45;
  }
  function hopAway(a, from, dist) {
    if (!local(a)) return;
    const dx = a.pos.x - from.pos.x, dz = a.pos.z - from.pos.z, d = Math.hypot(dx, dz) || 1;
    goTo(a, groundPoint(a.pos.x + (dx / d) * dist, a.pos.z + (dz / d) * dist), 'ground', null);
  }
  function startRide(a, t, sec = 4) {
    a.riding = { t, until: clock + sec };
    a.move = null;
    t.riddenUntil = clock + sec;
    if (local(t)) t.move = null;
    act(t, 'SQUISHED', sec);
    act(a, 'PLAYFUL', sec);
  }
  function stopRide(a) {
    const t = a.riding?.t;
    a.riding = null;
    if (t) {
      t.riddenUntil = 0;
      if (t.action && t.action.name === 'SQUISHED') t.action = null;
    }
    if (a.action && a.action.name === 'PLAYFUL') a.action = null;
  }
  function stepPranks(steering) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].at <= clock) { const f = timeline[i].fn; timeline.splice(i, 1); f(); }
    }
    actors.forEach((a) => {
      if (!a.riding) return;
      const t = a.riding.t;
      // the ride ends on time, when the mount leaves, or when I steer my own bird off
      if (clock > a.riding.until || !actors.includes(t) || !t.b.group.visible || (a.isPlayer && steering)) {
        stopRide(a);
        if (local(a) && !(a.isPlayer && steering)) { const s = besides(t); flyTo(a, s.p, s.surface, () => say(a, tr('착지!', 'Landed!'), 1)); }
        return;
      }
      a.pos.copy(headTop(t));
      a.rotTarget = t.b.group.rotation.y;
    });
  }
  /** Plays a prank of kind k by a on t. Effects on a bird only happen where that bird is driven (local). */
  function playPrank(a, t, k) {
    const P = PRANKS[k] || PRANKS[0];
    if (!a.riding) faceEachOther(a, t);
    if (local(t) && !t.riding && !(k === 3)) t.rotTarget = angleTo(t.pos, a.pos);
    const ouch = () => { act(t, 'BONKED', 1.1); say(t, pick(P.them), 1.4); playCall('call', t.pitch ?? 1, loudness(t)); };
    if (k === 0) {
      act(a, 'POKE', 0.45); say(a, pick(P.me), 1);
      soon(0.15, () => { ouch(); feathersOff(t); });
    } else if (k === 1) {
      act(a, 'SHOVE', 0.6); say(a, pick(P.me), 1.1);
      soon(0.2, () => { ouch(); knock(t, a); });
    } else if (k === 2) {
      act(a, 'POKE', 0.35);
      soon(0.25, () => { act(a, 'EAT', 1.3); say(a, pick(P.me), 1.2); ouch(); playFx('crunch', 0.3); });
      soon(1.4, () => hopAway(a, t, 2.2));
    } else if (k === 3) {
      say(a, pick(P.me), 1.4);
      if (local(a)) {
        flyTo(a, headTop(t), 'air', () => { startRide(a, t); say(t, pick(P.them), 1.6); playCall('call', t.pitch ?? 1, loudness(t)); });
      } else {
        // someone else's bird: their own tab flies it onto the head; here the mount just squashes
        soon(0.6, () => { t.riddenUntil = clock + 4; act(t, 'SQUISHED', 4); say(t, pick(P.them), 1.6); });
      }
    } else {
      act(a, 'PREEN', 1.1); act(t, 'PETTED', 1.1);
      say(a, P.me[0], 1.1); soon(0.4, () => say(t, P.them[0], 0.8));
      soon(1.15, () => { act(a, 'POKE', 0.45); say(a, tr('콕!', 'Poke!'), 1); });
      soon(1.3, () => { act(t, 'BONKED', 1.1); say(t, tr('...아야!', '...Ouch!'), 1.4); feathersOff(t); playCall('call', t.pitch ?? 1, loudness(t)); });
    }
  }
  /** x answers the prank y played on it: 0 back, 1 make up, 2 ignore and fly off. */
  function playAnswer(x, y, ans) {
    if (ans === 0) {
      playPrank(x, y, 0);
      soon(0.3, () => { dust(x, y); say(x, tr('투닥투닥!', 'Squabble!'), 1.2); });
    } else if (ans === 1) {
      faceEachOther(x, y);
      if (local(y)) y.rotTarget = angleTo(y.pos, x.pos);
      const [l1, l2] = pick(MAKE_UP_LINES);
      act(x, 'PREEN', 1.6); act(y, 'PETTED', 1.6);
      say(x, l1, 1.4); soon(0.6, () => say(y, l2, 1.2));
      soon(0.3, () => hearts(x.pos.clone().lerp(y.pos, 0.5)));
    } else {
      act(x, 'GRUMPY', 0.8); say(x, tr('흥!', 'Hmph!'), 1.2);
      soon(0.5, () => {
        if (!local(x)) return;
        const dx = x.pos.x - y.pos.x, dz = x.pos.z - y.pos.z, d = Math.hypot(dx, dz) || 1;
        flyTo(x, groundPoint(x.pos.x + (dx / d) * 6, x.pos.z + (dz / d) * 6), 'ground', null);
      });
      soon(0.9, () => say(y, pick(L(['...', '삐졌나?', '같이 놀자~'], ['...', 'Upset?', 'Let\'s play~'])), 1.2));
    }
  }
  const whoOf = (a) => (a.remote ? { id: a.remote.pid, name: a.name, remote: true } : { id: a.rid, name: a.name, remote: false });
  function actorOf(id) {
    if (typeof id === 'number') return remotes.get(id) || null;
    return residents.find((r) => r.rid === id) || null;
  }
  /** A resident bird decides how to take a prank: often back (투닥!), sometimes makes up, sometimes leaves. */
  function residentAnswers(r, depth) {
    soon(0.9 + Math.random() * 0.6, () => {
      if (!actors.includes(r) || r.riding) return;
      const back = Math.random() < Math.max(0.15, 0.55 - depth * 0.15);
      const ans = back ? 0 : Math.random() < 0.65 ? 1 : 2;
      playAnswer(r, player, ans);
      if (ans === 0 && onPranked) onPranked({ ...whoOf(r), kind: 0, back: true });
      if (ans !== 0 && onAnswered) onAnswered({ ...whoOf(r), answer: ans });
    });
  }
  let tudakDepth = 0;

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
      say(player, tr('훨훨', 'Flap flap'), 0.9);
      return true;
    },
    /** Hold to go up (1) or down (-1) while flying; 0 to stop. */
    setClimb(dir) {
      climb = dir;
    },
    isFlying: () => flying && !landing,
    /** Chirp; three or more in a rhythm and the birds nearby sing it back. */
    chirp,
    /** Throw sunflower seeds: 'ok', 'wait' (just threw some), or 'busy'. */
    snack,
    weather,
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
    /** The nearest bird I could prank, or null. */
    prankTarget() {
      const r = nearestFriend();
      if (!r || r.pos.distanceTo(player.pos) > 12) return null;
      return { ...whoOf(r), calm: !!(r.remote && r.remote.calm) };
    },
    /**
     * Prank the nearest bird with kind k: walk over, then play it. With a live bird, onPrank(pid, k) asks the
     * server once I am next to it. Returns { ok, why?, name? }; why is 'none' or 'calm'.
     */
    prank(k) {
      if (entering) return { ok: false, why: 'none' };
      const r = nearestFriend();
      if (!r || r.pos.distanceTo(player.pos) > 12) return { ok: false, why: 'none' };
      if (r.remote && r.remote.calm) return { ok: false, why: 'calm', name: r.name };
      if (player.riding) stopRide(player);
      player.move = null;
      player.action = null;
      const go = () => {
        playPrank(player, r, k);
        if (r.remote) { if (onPrank) onPrank(r.remote.pid, k); }
        else { tudakDepth = 0; residentAnswers(r, 0); }
      };
      const close = r.pos.distanceTo(player.pos) < 1.6 && Math.abs(r.pos.y - player.pos.y) < 0.4;
      if (close || k === 3) go();
      else { const s = besides(r); goTo(player, s.p, s.surface, go); }
      return { ok: true, name: r.name };
    },
    /** My answer to a prank by who (from onPranked): 0 back, 1 make up, 2 ignore. */
    answer(who, ans) {
      const y = actorOf(who.id);
      if (!y) return;
      playAnswer(player, y, ans);
      if (!y.remote && ans === 0) { tudakDepth += 1; residentAnswers(y, tudakDepth); }
    },
    /** Someone else's prank arrived from the server. toPid null means it was on me. */
    prankRemote(fromPid, toPid, k) {
      const a = remotes.get(fromPid);
      const t = toPid == null ? player : remotes.get(toPid);
      if (!a || !t) return;
      playPrank(a, t, k);
      if (t === player && onPranked) onPranked({ ...whoOf(a), kind: k, back: false });
    },
    /** Someone answered a prank. toPid null means they answered mine. */
    answerRemote(fromPid, toPid, ans) {
      const x = remotes.get(fromPid);
      const y = toPid == null ? player : remotes.get(toPid);
      if (!x || !y) return;
      playAnswer(x, y, ans);
      if (y !== player) return;
      if (ans === 0 && onPranked) onPranked({ ...whoOf(x), kind: 0, back: true });
      else if (ans !== 0 && onAnswered) onAnswered({ ...whoOf(x), answer: ans });
    },
    /** Whether a live bird takes pranks. */
    calmRemote(pid, on) {
      const a = remotes.get(pid);
      if (a) a.remote.calm = !!on;
    },
    /** Whether the 빼빼로 숲 is open today, and which side my bird is on now. */
    pepero: !!pep,
    zone: () => zoneNow,
    /** One flight between the park and the 빼빼로 숲, high over the road. Returns where it is going. */
    travel() {
      if (!pep || entering || gone) return null;
      const to = zoneNow === 'pepero' ? 'park' : 'pepero';
      const at0 = to === 'pepero' ? pep.arrival : pep.home;
      const dest = groundPoint(at0.x + (Math.random() - 0.5) * 2, at0.z + (Math.random() - 0.5) * 2);
      const from = player.pos.clone();
      flying = false;
      landing = false;
      player.action = null;
      player.move = { type: 'fly', from, to: dest, t0: clock, dur: 1.2 + from.distanceTo(dest) / 12, peak: Math.max(from.y, dest.y) + 8, surface: 'ground', after: () => heartsAt(player, 3) };
      player.rotTarget = angleTo(from, dest);
      say(player, to === 'pepero' ? tr('빼빼로 숲으로!', 'Off to the forest!') : tr('공원으로!', 'Back to the park!'), 1.4);
      playCall('chirp', 1.1, 0.8);
      return to;
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
      const s = { x: a.remote.target.x, y: a.remote.target.y, z: a.remote.target.z, ry: a.remote.ry, m: a.remote.m, calm: a.remote.calm };
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
      say(player, tr(`${v.name} 차례!`, `${v.name}'s turn!`), 1.6);
      playCall('chirp', 1.1, 0.8);
    },
    /**
     * The server remembered where my bird was (another tab or device had it, or I was here a little
     * while ago): come out there instead of at the gate. Coming out of a house wins over this.
     */
    placeAt(spot) {
      if (startAt || !spot || gone) return false;
      const lim = PARK_R + 30;
      const x = clamp(spot.x, -lim, lim), z = clamp(spot.z, -lim, pep ? pep.flyLimit : lim);
      const below = surfaceBelow(x, z, (spot.y || 0) + 0.3);
      player.move = null;
      flying = false;
      landing = false;
      player.pos.copy(below.p);
      player.surface = below.surface;
      player.rotTarget = player.b.group.rotation.y = spot.ry || 0;
      cam.yaw = cam.yawT = yawBehind(player.b.group.rotation.y);
      stepCamera(0, true);
      say(player, tr('다시 왔어!', 'I\'m back!'), 1.6);
      playCall('chirp', 1, 0.8);
      return true;
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
      gone = true;
      clearTimeout(songCheck);
      pendingReplies.forEach(clearTimeout);
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
