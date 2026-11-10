// Low-poly parrots with a soft toon look and a thin ink outline: closer to the real birds
// (teardrop body, folded wings with flight feathers, hooked beak, two toes forward and two back,
// species tails and real size differences) while keeping the big head and round shiny eyes.
// Colors come from the owner's customizer (face, head, body, wing, tail); the species sets the shape:
//   LOVEBIRD  15 cm. short and round, short rounded tail, blue rump (green and blue birds only), big pale beak
//   BUDGIE    18 cm, the lightest. slim, two long pointed tail feathers, barred head and wings,
//             cere, purple cheek patches, throat spots, small beak half hidden in feathers
//   COCKATIEL 31 cm. stands upright, tall curving crest, orange cheeks, white wing patch, very long tail
//   QUAKER    29 cm, the heaviest. sturdy, grey scalloped forehead and chest, blue flight feathers, horn beak
//   GREEN_CHEEKED_CONURE  26 cm. dark cap, bare white eye rings, scalloped chest, maroon belly and tail,
//             blue flight feathers, dark beak
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const SPH = new THREE.SphereGeometry(1, 20, 14);
const SPH_LO = new THREE.SphereGeometry(1, 10, 8);
const toLinear = (hex) => new THREE.Color(hex).convertSRGBToLinear();

/** A sphere pulled to a point along +x (a feather); bend curls the tip along -y. */
function taper(tip, bend = 0, seg = [12, 8]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (x <= 0) continue;
    const f = 1 - tip * Math.pow(x, 1.4);
    p.setY(i, p.getY(i) * f - bend * x * x);
    p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}
const FEATHER = taper(0.9);
// crest feather: the tip curls forward
const CREST = taper(0.85, 0.35);
// upper beak: round at the base, narrowing and curling down into a hook
const BEAK = taper(0.82, 0.95, [16, 12]);

const toonGrad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.LuminanceFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
const MATS = new Map();
export function toon(hex) {
  if (!MATS.has(hex)) MATS.set(hex, new THREE.MeshToonMaterial({ color: toLinear(hex), gradientMap: toonGrad }));
  return MATS.get(hex);
}
const lineMat = new THREE.MeshBasicMaterial({ color: toLinear('#2B2622'), side: THREE.BackSide });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function shade(hex, f) {
  return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
}
function lighten(hex, k) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#FFFFFF'), k);
  return '#' + c.getHexString();
}
function mix(a, b, k) {
  const c = new THREE.Color(a);
  c.lerp(new THREE.Color(b), k);
  return '#' + c.getHexString();
}

function blob(parent, hex, x, y, z, sx, sy, sz, rz, line, geo = SPH) {
  const m = new THREE.Mesh(geo, toon(hex));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rz) m.rotation.z = rz;
  m.castShadow = true;
  parent.add(m);
  if (line) {
    const o = new THREE.Mesh(geo, lineMat);
    o.position.copy(m.position);
    o.rotation.copy(m.rotation);
    o.scale.set(sx + line, sy + line, sz + line);
    parent.add(o);
  }
  return m;
}

const tmpV = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// folded wings lie along the back
const WZ = -0.06;
// body center height: a little leg shows under the belly
const TY = 0.53;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion();
/**
 * One feather from a root point, pointing backwards: droop tips it down, yaw fans it sideways.
 * len is the full length; width across the vane, thick the thin side.
 * flat = the vane lies level like a tail feather; otherwise it stands upright (flight and crest feathers).
 */
function feather(parent, hex, [x, y, z], len, width, thick, droop, yaw, line, flat = true, geo = FEATHER) {
  const m = new THREE.Mesh(geo, toon(hex));
  m.rotation.set(0, yaw, Math.PI + droop);
  m.scale.set(len / 2, flat ? thick : width, flat ? width : thick);
  tmpV.set(len / 2, 0, 0).applyEuler(m.rotation);
  m.position.set(x + tmpV.x, y + tmpV.y, z + tmpV.z);
  m.castShadow = true;
  parent.add(m);
  if (line) {
    const o = new THREE.Mesh(geo, lineMat);
    o.position.copy(m.position);
    o.rotation.copy(m.rotation);
    o.scale.set(len / 2 + line, m.scale.y + line, m.scale.z + line);
    parent.add(o);
  }
  return m;
}

/** Blue rump colour for a green (or blue) lovebird body, null for other bodies. */
export function rumpColor(body) {
  const hsl = {};
  new THREE.Color(body).getHSL(hsl);
  if (hsl.s < 0.25 || hsl.l > 0.85 || hsl.h < 0.2 || hsl.h > 0.7) return null;
  return '#4A8FD1';
}

/** Little crescent marks on a surface: barring, scallops. */
function marks(parent, hex, list, size) {
  list.forEach(([x, y, z, rz = 0]) => blob(parent, hex, x, y, z, size[0], size[1], size[2], rz, 0, SPH_LO));
}

/**
 * Body shape per species.
 * size: overall size from the real birds (lovebird about 0.9). tilt lifts the chest (upright birds).
 * tail: feather lengths from the middle outwards; pair = two middle feathers instead of one.
 */
const SHAPES = {
  LOVEBIRD: {
    size: 0.9, body: [0.47, 0.39, 0.39], tilt: 0.55, head: [0.33, 0.9], headR: 1.02, beak: ['#F1DCC0', 1.2],
    tail: { lens: [0.36, 0.35, 0.33], pair: false, w: 0.05, fan: 0.22, down: 0.3 }, wing: 1,
  },
  BUDGIE: {
    size: 0.8, body: [0.44, 0.34, 0.31], tilt: 0.7, head: [0.3, 0.95], headR: 0.92, beak: ['#E9D9A8', 0.72],
    tail: { lens: [1.05, 0.66, 0.5], pair: true, w: 0.025, fan: 0.1, down: 0.42 }, wing: 1.1,
  },
  COCKATIEL: {
    size: 1.2, body: [0.46, 0.35, 0.33], tilt: 0.88, head: [0.24, 1.07], headR: 0.9, beak: ['#9A9894', 0.8],
    tail: { lens: [1.25, 1.0, 0.78], pair: true, w: 0.03, fan: 0.1, down: 0.5 }, wing: 1.2,
  },
  QUAKER: {
    size: 1.25, body: [0.5, 0.42, 0.41], tilt: 0.6, head: [0.35, 0.96], headR: 1.0, beak: ['#F0B880', 1.25],
    tail: { lens: [0.86, 0.78, 0.68], pair: false, w: 0.045, fan: 0.14, down: 0.4 }, wing: 1.1, flight: '#3D6FB8',
  },
  GREEN_CHEEKED_CONURE: {
    size: 1.1, body: [0.47, 0.38, 0.36], tilt: 0.64, head: [0.33, 0.96], headR: 0.96, beak: ['#46413D', 1.0],
    tail: { lens: [1.0, 0.9, 0.78], pair: false, w: 0.04, fan: 0.13, down: 0.42 }, wing: 1.12, flight: '#3B66B0',
  },
  OTHER: {
    size: 1, body: [0.47, 0.4, 0.39], tilt: 0.55, head: [0.33, 0.9], headR: 1, beak: ['#F3E3C8', 1],
    tail: { lens: [0.55, 0.5, 0.45], pair: false, w: 0.045, fan: 0.16, down: 0.35 }, wing: 1,
  },
};

/**
 * Merges the plain meshes under each group by material, so one bird is a few dozen draw calls
 * instead of a hundred (the park can hold fifty birds). Groups that move (head, wings, beak, eyes,
 * crest) stay separate.
 */
function compact(obj) {
  obj.children.slice().forEach((ch) => { if (!ch.isMesh) compact(ch); });
  const byMat = new Map();
  obj.children.forEach((ch) => {
    if (!ch.isMesh) return;
    if (!byMat.has(ch.material)) byMat.set(ch.material, []);
    byMat.get(ch.material).push(ch);
  });
  byMat.forEach((list, mat) => {
    if (list.length < 2) return;
    const geos = list.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = BufferGeometryUtils.mergeBufferGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    const one = new THREE.Mesh(merged, mat);
    one.castShadow = mat !== lineMat;
    list.forEach((m) => obj.remove(m));
    obj.add(one);
  });
}

/**
 * Builds a bird. Returns { group, pose(mood, t), size }.
 * group is for the caller to place, turn and scale (1 = normal); the species size sits inside it.
 */
export function makeBird(colors, species) {
  const c = colors;
  const S = SHAPES[species] || SHAPES.OTHER;
  const wingC = c.wing;
  const midC = shade(wingC, 0.82);
  const flightC = S.flight ? mix(shade(wingC, 0.75), S.flight, 0.7) : shade(wingC, 0.68);
  const bellyC = lighten(c.body, 0.3);
  const LW = 0.022;
  const group = new THREE.Group();
  const sized = new THREE.Group();
  sized.scale.setScalar(S.size);
  group.add(sized);
  const inner = new THREE.Group();
  sized.add(inner);

  // the torso turns around the middle of the body, so upright species lift the chest and drop the tail
  const torso = new THREE.Group();
  torso.position.set(-0.04, TY, 0);
  torso.rotation.z = S.tilt;
  inner.add(torso);
  const [bx, by, bz] = S.body;
  blob(torso, c.body, 0, 0, 0, bx, by, bz, 0.06, LW);
  // the body narrows towards the tail (a teardrop, not a ball)
  blob(torso, c.body, -bx * 0.62, -by * 0.12, 0, bx * 0.6, by * 0.58, bz * 0.72, 0.12, LW);
  const chest = blob(torso, bellyC, 0.15, -0.07, 0, bx * 0.74, by * 0.76, bz * 0.85, 0.2);
  if (species === 'GREEN_CHEEKED_CONURE') blob(torso, '#8E3B34', -bx * 0.1, -by * 0.62, 0, bx * 0.45, by * 0.4, bz * 0.7, 0.1);
  // the blue rump of green lovebirds (blue ones too). Yellow, white or other colour mutations have none,
  // so it only shows when the body is green or blue, small and low on the back where the wings almost cover it
  const rump = rumpColor(c.body);
  if (species === 'LOVEBIRD' && rump) blob(torso, rump, -bx * 0.78, by * 0.28, 0, 0.11, 0.06, 0.12, 0.25);

  // tail: feathers fanned from the root, middle ones longest
  const T = S.tail;
  const root = [-bx * 0.98, -by * 0.2, 0];
  // the tail hangs at its own angle, but never into the ground: lift it if the longest feather would touch
  const rootY = TY + root[0] * Math.sin(S.tilt) + root[1] * Math.cos(S.tilt);
  const longest = 0.6 * T.lens[0];
  const down = Math.min(T.down, Math.asin(Math.max(-1, Math.min(1, (rootY - 0.03) / longest))));
  const droop = down - S.tilt;
  T.lens.forEach((L, k) => {
    const len = 0.6 * L;
    const col = k === 0 ? c.tail : shade(c.tail, 1 - k * 0.07);
    if (!T.pair && k === 0) {
      feather(torso, col, root, len, 0.075, 0.022, droop, 0, LW * 0.6);
      return;
    }
    const off = T.pair ? k + 0.5 : k;
    [-1, 1].forEach((s) => {
      feather(torso, col, [root[0], root[1] + 0.008 * k, root[2] + s * off * T.w], len, 0.07, 0.02, droop + 0.03 * k, -s * off * T.fan, LW * 0.6);
    });
  });
  // undertail coverts
  blob(torso, shade(c.body, 0.9), root[0] + 0.05, root[1] - 0.04, 0, 0.13, 0.07, 0.1, 0.4);

  // folded wings: coverts, a band of secondaries, and long flight feathers crossing over the tail
  const wingBase = [];
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(0.04, 0.06, (bz - 0.06) * s);
    w.rotation.z = WZ;
    torso.add(w);
    wingBase.push(w.position.y);
    const wl = S.wing;
    // flight feathers first, so the coverts lie over their roots
    [0, 1, 2].forEach((i) => {
      feather(w, i === 0 ? flightC : shade(flightC, 1 - i * 0.07), [-0.22 * wl, -0.07 + i * 0.03, (0.01 - i * 0.008) * s],
        (0.56 - i * 0.07) * wl, 0.085, 0.022, -0.04 + i * 0.06, 0, LW * 0.5, false);
    });
    blob(w, wingC, -0.08, -0.01, 0, 0.28 * wl, 0.19, 0.085, -0.04, LW);
    blob(w, midC, -0.22 * wl, -0.07, 0.01 * s, 0.17 * wl, 0.1, 0.075, -0.06);
    blob(w, lighten(wingC, 0.12), 0.04, 0.05, 0.02 * s, 0.14, 0.1, 0.072, 0.1);
    if (species === 'BUDGIE') {
      // black scallops on the wing
      marks(w, '#1E1E1E', [[0.04, 0.1, 0.075 * s], [-0.08, 0.11, 0.08 * s], [-0.2, 0.08, 0.075 * s], [-0.02, 0.0, 0.085 * s], [-0.14, 0.01, 0.085 * s], [-0.26, -0.02, 0.07 * s]], [0.055, 0.022, 0.018]);
    }
    if (species === 'COCKATIEL') blob(w, lighten(wingC, 0.62), -0.12, -0.05, 0.05 * s, 0.24, 0.06, 0.045, -0.04);
    return w;
  });

  // scalloped chests: crescents placed on the surface of the chest ellipsoid
  if (species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE') {
    const chestC = species === 'QUAKER' ? (c.face || '#C9CFC4') : mix(c.body, '#8C8A6E', 0.45);
    chest.material = toon(chestC);
    const markC = species === 'QUAKER' ? shade(chestC, 0.62) : shade(chestC, 0.55);
    const cx = 0.15, cy = -0.07, rx = bx * 0.74, ry = by * 0.76, rz = bz * 0.85;
    const rows = [];
    for (let r = 0; r < 4; r++) {
      for (let k = -1; k <= 1; k++) {
        const dy = 0.13 - r * 0.085, dz = k * 0.11 + (r % 2 ? 0.055 : 0);
        const q = 1 - (dy / ry) ** 2 - (dz / rz) ** 2;
        if (q <= 0.05) continue;
        rows.push([cx + rx * Math.sqrt(q) - 0.004, cy + dy, dz, 0.15]);
      }
    }
    marks(torso, markC, rows, [0.016, 0.02, 0.06]);
  }

  // feet: short feathered legs, two toes forward and two back, gripping
  const FOOT = species === 'COCKATIEL' || species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE' ? '#8F8783' : '#C9A9A0';
  // each leg is its own group, so a sleeping bird can pull one up into its belly feathers
  const legs = [-1, 1].map((s) => {
    const lg = new THREE.Group();
    lg.position.set(0.05, 0, 0.12 * s);
    inner.add(lg);
    blob(lg, shade(c.body, 0.95), -0.02, 0.2, 0, 0.1, 0.1, 0.08);
    blob(lg, FOOT, 0, 0.08, 0, 0.032, 0.08, 0.032, 0, 0, SPH_LO);
    [[0.07, 0.12], [0.07, -0.18], [-0.06, 0.25], [-0.06, -0.12]].forEach(([dx, a]) => {
      const t = blob(lg, FOOT, dx, 0.02, a * 0.12, 0.07, 0.022, 0.024, 0, 0, SPH_LO);
      t.rotation.y = -a * Math.sign(dx);
    });
    return lg;
  });

  // a soft neck, so the head sits on the body instead of floating on it
  const [hx, hy] = S.head;
  blob(inner, c.body, hx - 0.1, hy - 0.2, 0, 0.24, 0.2, 0.25, 0.3);

  // a knitted scarf (the reward for finishing the first walk with 모란이): a fat ring around the neck,
  // a stripe, and one end hanging down the chest
  if (c.scarf) {
    const scarf = new THREE.Group();
    scarf.position.set(hx - 0.1, hy - 0.26, 0);
    scarf.rotation.z = 0.35;
    inner.add(scarf);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 8, 22), toon(c.scarf));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.05, 1.15, 1);
    scarf.add(ring);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.038, 6, 22), toon(shade(c.scarf, 1.35)));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.05;
    stripe.scale.set(1.05, 1.15, 1);
    scarf.add(stripe);
    // one end down the chest, one fluttering down the back (that is the side the camera mostly sees)
    [[0.24, -0.14, 0.1, -0.25, 0.28], [-0.44, -0.02, -0.06, 1.15, 0.4], [-0.4, -0.08, 0.08, 0.95, 0.32]].forEach(([x, y, z, rz, len]) => {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.075, len, 0.14), toon(c.scarf));
      end.position.set(x, y, z);
      end.rotation.z = rz;
      scarf.add(end);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.045, 0.144), toon(shade(c.scarf, 1.35)));
      fringe.position.set(0, -len / 2 + 0.01, 0);
      end.add(fringe);
    });
  }

  // head
  const head = new THREE.Group();
  head.position.set(hx, hy, 0);
  head.scale.setScalar(S.headR);
  inner.add(head);
  blob(head, c.body, -0.05, 0.12, 0, 0.33, 0.33, 0.33, 0, LW);
  blob(head, c.face, 0.07, 0.06, 0, 0.32, 0.3, 0.33, 0, LW);
  if (species === 'GREEN_CHEEKED_CONURE') {
    // a dark cap over the crown and the back of the head
    blob(head, c.head, -0.02, 0.2, 0, 0.32, 0.26, 0.335, 0.2);
  } else if (species === 'QUAKER') {
    // the grey runs from the forehead down the throat
    blob(head, c.head, 0.16, 0.2, 0, 0.22, 0.17, 0.26);
    blob(head, c.face, 0.17, -0.17, 0, 0.2, 0.14, 0.22);
  } else {
    blob(head, c.head, 0.18, 0.24, 0, 0.2, 0.15, 0.24);
  }

  if (species === 'COCKATIEL') {
    [-1, 1].forEach((s) => blob(head, '#F07C3E', 0.2, -0.02, 0.27 * s, 0.12, 0.11, 0.035));
    const crest = new THREE.Group();
    crest.position.set(0.1, 0.3, 0);
    head.add(crest);
    // long thin crest feathers, sweeping up and back with the tips curling forward
    [0, 1, 2, 3, 4].forEach((i) => {
      const len = 0.62 - i * 0.07;
      feather(crest, i < 2 ? c.head : shade(c.head, 0.93), [-0.05 * i, 0, (i % 2 ? 0.025 : -0.025)], len, 0.06, 0.03,
        -(1.27 - i * 0.15), 0, LW * 0.5, false, CREST);
    });
    head.userData.crest = crest;
  } else if (species === 'BUDGIE') {
    [-1, 1].forEach((s) => blob(head, '#6E5DB8', 0.24, -0.1, 0.25 * s, 0.06, 0.05, 0.03));
    // throat spots
    marks(head, '#1E1E1E', [[0.3, -0.17, 0.07], [0.3, -0.17, -0.07], [0.27, -0.2, 0.17], [0.27, -0.2, -0.17]], [0.028, 0.028, 0.028]);
    // fine barring from the crown down the back of the head
    marks(head, '#1E1E1E', [[-0.24, 0.3, 0, 0.6], [-0.3, 0.2, 0, 0.9], [-0.33, 0.08, 0, 1.2], [-0.12, 0.38, 0, 0.3], [-0.02, 0.43, 0, 0.1],
      [-0.2, 0.28, 0.2, 0.7], [-0.2, 0.28, -0.2, 0.7], [-0.27, 0.15, 0.2, 1.0], [-0.27, 0.15, -0.2, 1.0]], [0.02, 0.01, 0.16]);
    // cere over the beak
    blob(head, '#6F8FD8', 0.36, 0.12, 0, 0.06, 0.04, 0.075);
  } else if (species === 'LOVEBIRD' || species === 'OTHER') {
    [-1, 1].forEach((s) => blob(head, '#FF9C9C', 0.2, -0.02, 0.27 * s, 0.075, 0.045, 0.03));
  }

  // hooked beak: the upper half curls down over a small lower half
  const [beakC, beakK] = S.beak;
  const beak = new THREE.Group();
  beak.position.set(0.35 + 0.02 * beakK, 0.04, 0);
  head.add(beak);
  blob(beak, shade(beakC, 0.86), 0.03, -0.075 * beakK, 0, 0.07 * beakK, 0.05 * beakK, 0.065 * beakK, -0.3, LW * 0.7, SPH_LO);
  blob(beak, beakC, 0.02, 0, 0, 0.13 * beakK, 0.1 * beakK, 0.09 * beakK, -0.35, LW * 0.7, BEAK);
  if (species === 'BUDGIE') {
    // budgies' beaks sit half inside the face feathers
    blob(head, c.face, 0.26, -0.02, 0, 0.12, 0.13, 0.15);
  }

  const eyes = [-1, 1].map((s) => {
    const eg = new THREE.Group();
    eg.position.set(0.24, 0.12, 0.27 * s);
    head.add(eg);
    blob(eg, '#1B1B1B', 0, 0, 0, 0.07, 0.078, 0.05);
    const hl = new THREE.Mesh(SPH_LO, shineMat);
    hl.position.set(0.028, 0.032, 0.035 * s);
    hl.scale.setScalar(0.024);
    eg.add(hl);
    const hl2 = new THREE.Mesh(SPH_LO, shineMat);
    hl2.position.set(-0.02, -0.03, 0.04 * s);
    hl2.scale.setScalar(0.011);
    eg.add(hl2);
    if (species === 'GREEN_CHEEKED_CONURE') {
      // bare white skin around the eye, outside the blinking group
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 16), toon('#F4F1EA'));
      ring.position.set(0.24, 0.12, 0.27 * s + 0.01 * s);
      head.add(ring);
    }
    return eg;
  });

  compact(group);
  const phase = Math.random() * 10;

  /** Opens the wings out sideways (rolling them flat as they open) and beats them up and down. */
  function wingPose(spread, flap) {
    wings.forEach((w, i) => {
      const s = i ? 1 : -1;
      qa.setFromAxisAngle(AX, -s * flap);
      qb.setFromAxisAngle(AY, s * spread);
      qc.setFromAxisAngle(AX, -s * (Math.PI / 2) * Math.min(1, spread / 1.2));
      qd.setFromAxisAngle(AZ, WZ);
      w.quaternion.copy(qa).multiply(qb).multiply(qc).multiply(qd);
    });
  }

  /** Spreads just one wing (a stretch), the other stays folded. */
  function wingOne(i, spread, flap) {
    const w = wings[i], s = i ? 1 : -1;
    qa.setFromAxisAngle(AX, -s * flap);
    qb.setFromAxisAngle(AY, s * spread);
    qc.setFromAxisAngle(AX, -s * (Math.PI / 2) * Math.min(1, spread / 1.2) * 0.6);
    qd.setFromAxisAngle(AZ, WZ);
    w.quaternion.copy(qa).multiply(qb).multiply(qc).multiply(qd);
  }
  const hash = (x) => { const v = Math.sin(x * 12.9898 + phase * 78.233) * 43758.5453; return v - Math.floor(v); };
  /**
   * The head turn that puts one eye towards a target at local yaw `look` (0 = straight ahead),
   * the way parrots look at things: side-on, with one eye. Picks the eye that needs the smaller turn.
   */
  function eyeTurn(look, other) {
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const a = wrap(Math.PI / 2 - look), b = wrap(look - Math.PI / 2);
    const [near, far] = Math.abs(a) < Math.abs(b) ? [a, b] : [b, a];
    const pickA = other && Math.abs(far) < 1.7 ? far : near;
    return clamp(pickA, -1.5, 1.5);
  }
  // 애교 (bowing the head for a scratch), shared by the idle fidget and the BEG action
  function beg(e, s, tt) {
    head.rotation.z = -0.75 * e;
    head.rotation.x = s * 0.3 * e;
    head.scale.setScalar(S.headR * (1 + 0.07 * e));
    inner.rotation.x = Math.sin(tt * 3) * 0.05 * e;
    if (head.userData.crest) head.userData.crest.rotation.z = 0.4 * e;
    return e > 0.5 ? 0.35 : 1;
  }
  // what an idle bird does: every few seconds one small thing, the way real parrots never sit quite still
  const FIDGETS = ['calm', 'side', 'tilt', 'bob', 'fluff', 'side', 'stretch', 'beg', 'calm', 'yawn', 'tilt', 'side'];
  function idle(tt, look, eyeY) {
    const SEG = 3.4, seg = Math.floor(tt / SEG), u = tt / SEG - seg;
    const kind = FIDGETS[Math.floor(hash(seg) * FIDGETS.length)];
    const s = hash(seg + 0.5) < 0.5 ? 1 : -1;
    const e = clamp(Math.min(u / 0.18, (1 - u) / 0.18), 0, 1); // ease in and out of each fidget
    const bump = Math.sin(Math.PI * u);
    inner.position.y = Math.sin(tt * 2.2) * 0.015;
    switch (kind) {
      case 'side': {
        // one eye on you, then a quick switch to the other eye
        const second = u > 0.55;
        const yaw = look != null ? eyeTurn(look, second) : (second ? -s : s) * 1.3;
        head.rotation.y = yaw * e;
        head.rotation.x = -Math.sign(yaw) * 0.22 * e;
        head.rotation.z = 0.08 * e;
        break;
      }
      case 'tilt':
        // a curious head tilt
        head.rotation.x = s * 0.5 * e;
        head.rotation.z = 0.15 * e;
        if (look != null) head.rotation.y = clamp(look, -0.8, 0.8) * 0.6 * e;
        break;
      case 'bob':
        head.position.y = hy + Math.abs(Math.sin(u * Math.PI * 6)) * 0.06 * e;
        head.rotation.z = Math.sin(u * Math.PI * 6) * 0.15 * e;
        break;
      case 'fluff': {
        // puff up, then a quick shake to settle the feathers
        inner.scale.set(1 + 0.1 * e, 1 + 0.07 * e, 1 + 0.12 * e);
        if (u > 0.68 && u < 0.84) inner.rotation.x = Math.sin(u * 220) * 0.2;
        if (e > 0.6 && u < 0.68) eyeY = Math.min(eyeY, 0.55);
        break;
      }
      case 'stretch':
        // one wing stretched down and back, the head up
        wingOne(s > 0 ? 1 : 0, 0.75 * e, -0.35 * e);
        head.rotation.z = 0.2 * e;
        break;
      case 'beg':
        eyeY = Math.min(eyeY, beg(e, s, tt));
        break;
      case 'yawn':
        beak.scale.set(1, 1 + 0.8 * bump * e, 1 + 0.2 * bump * e);
        head.rotation.z = 0.35 * bump * e;
        eyeY = Math.min(eyeY, 1 - 0.85 * bump * e);
        break;
      default:
        head.rotation.z = Math.sin(tt * 0.7) * 0.1;
        head.rotation.y = look != null ? clamp(look, -0.7, 0.7) * 0.5 : Math.sin(tt * 0.45) * 0.35;
    }
    return eyeY;
  }

  /**
   * Pose for a mood or an action. t = seconds.
   * look (optional): local yaw towards something worth watching (the camera, a nearby bird).
   */
  function pose(mood, t, look) {
    const tt = t + phase;
    head.scale.setScalar(S.headR);
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);
    inner.scale.set(1, 1, 1);
    legs.forEach((lg) => { lg.position.y = 0; lg.scale.y = 1; });
    head.position.set(hx, hy, 0);
    head.rotation.set(0, 0, 0);
    beak.scale.set(1, 1, 1);
    wings.forEach((w, i) => { w.rotation.set(0, 0, WZ); w.position.y = wingBase[i]; });
    let eyeY = tt % 4.2 < 0.13 ? 0.15 : 1;
    if (head.userData.crest) head.userData.crest.rotation.z = 0;
    switch (mood) {
      case 'WALK':
        inner.position.y = Math.abs(Math.sin(tt * 13)) * 0.1;
        inner.rotation.z = -0.08;
        head.rotation.z = Math.sin(tt * 13) * 0.06;
        break;
      case 'FLY': {
        // wings open out sideways and beat
        const f = Math.sin(tt * 26);
        wingPose(1.25, 0.15 + f * 0.75);
        wings.forEach((w, i) => { w.position.y = wingBase[i] + 0.06; });
        inner.rotation.z = 0.12 - S.tilt * 0.4;
        if (head.userData.crest) head.userData.crest.rotation.z = 0.5;
        break;
      }
      case 'DANCE': {
        const k = Math.sin(tt * 9);
        inner.position.y = Math.abs(k) * 0.22;
        inner.rotation.y = Math.sin(tt * 4.5) * 0.5;
        head.rotation.z = 0.2 + k * 0.2;
        wingPose(Math.max(0, k) * 0.9, Math.max(0, k) * 0.6);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.5;
        break;
      }
      case 'PREEN':
        head.rotation.y = -0.9;
        head.rotation.z = -0.3 + Math.sin(tt * 10) * 0.14;
        head.position.x = hx + 0.06;
        break;
      case 'PREENED':
        head.rotation.z = -0.35;
        inner.scale.set(1.08, 1.04, 1.08);
        eyeY = 0.15;
        break;
      case 'CHIRP': {
        head.rotation.z = 0.45 + Math.sin(tt * 22) * 0.06;
        beak.scale.set(1, 1.3, 1.2);
        wingPose(0.35, 0.2);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.45;
        break;
      }
      case 'SLEEPY':
        head.position.set(hx - 0.04, hy - 0.08, 0);
        head.rotation.z = -0.4;
        inner.scale.y = 1 + Math.sin(tt * 1.4) * 0.025;
        eyeY = 0.12;
        if (head.userData.crest) head.userData.crest.rotation.z = 0.6;
        break;
      case 'HAPPY': {
        const k = Math.max(0, Math.sin(tt * 5));
        inner.position.y = Math.abs(Math.sin(tt * 5)) * 0.12;
        head.rotation.z = 0.15;
        wingPose(k * 0.6, k * 0.35);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.4;
        break;
      }
      case 'PLAYFUL':
        head.rotation.y = Math.sin(tt * 3) * 0.6;
        head.rotation.z = Math.sin(tt * 6) * 0.15;
        inner.rotation.z = Math.sin(tt * 3) * 0.08;
        break;
      case 'GRUMPY':
        inner.scale.set(1.12, 1.08, 1.12);
        head.rotation.y = 0.9;
        if (head.userData.crest) head.userData.crest.rotation.z = -0.5;
        break;
      case 'SPLASH': {
        // water games: dip the face in, then flick the head up to throw the water over the back.
        // Runs on t without the bird's own phase, so the park can time the spray to the flick.
        const u = (((t % 1.2) + 1.2) % 1.2) / 1.2;
        let dip;
        if (u < 0.45) dip = Math.sin((u / 0.45) * Math.PI * 0.5);
        else if (u < 0.6) dip = 1 - ((u - 0.45) / 0.15) * 1.7;
        else dip = -0.7 + ((u - 0.6) / 0.4) * 0.7;
        const down = Math.max(0, dip), up = Math.max(0, -dip);
        inner.rotation.z = -0.32 * down + 0.12 * up;
        head.rotation.z = -0.95 * down + 0.75 * up;
        head.position.set(hx + 0.1 * down, hy - 0.2 * down, 0);
        beak.scale.set(1, 1 + 0.25 * up, 1 + 0.15 * up);
        wingPose(0.25 + up * 0.7, up * 0.5 + Math.sin(tt * 30) * 0.08 * up);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.5 * up;
        eyeY = down > 0.6 ? 0.2 : 1;
        break;
      }
      case 'HUNGRY':
      case 'EAT': {
        const k = Math.max(0, Math.sin(tt * (mood === 'EAT' ? 9 : 6)));
        head.rotation.z = -0.8 * k;
        head.position.x = hx + 0.08 * k;
        break;
      }
      case 'PETTED': {
        // being scratched: head offered sideways, eyes shut with pleasure, feathers fluffed
        head.rotation.z = -0.5;
        head.rotation.x = 0.35 + Math.sin(tt * 7) * 0.12;
        head.scale.setScalar(S.headR * 1.08);
        inner.scale.set(1.06, 1.04, 1.06);
        inner.rotation.x = Math.sin(tt * 5) * 0.06;
        if (head.userData.crest) head.userData.crest.rotation.z = 0.35;
        eyeY = 0.15;
        break;
      }
      case 'ROOST': {
        // asleep: on one leg, the other pulled up, head turned round and tucked into the back feathers
        legs[1].position.y = 0.13;
        legs[1].scale.y = 0.35;
        inner.scale.set(1.12, 1.06 + Math.sin(tt * 1.2) * 0.02, 1.12);
        head.rotation.set(0, 2.5, -0.35);
        head.position.set(hx - 0.32, hy - 0.12, 0.05);
        if (head.userData.crest) head.userData.crest.rotation.z = 0.7;
        eyeY = 0.12;
        break;
      }
      case 'SING': {
        // bobbing along to a song, beak opening on the beat
        const k = Math.sin(tt * 9.5);
        head.position.y = hy + Math.max(0, k) * 0.08;
        head.rotation.z = 0.25 + k * 0.18;
        inner.position.y = Math.abs(k) * 0.04;
        beak.scale.set(1, 1 + Math.max(0, k) * 0.35, 1.1);
        wingPose(0.15, Math.max(0, k) * 0.15);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.4;
        break;
      }
      case 'PECK': {
        // pecking at a toy: quick jabs forward
        const k = Math.max(0, Math.sin(tt * 14));
        head.rotation.z = -0.5 * k;
        head.position.x = hx + 0.14 * k;
        inner.rotation.z = -0.12 * k;
        break;
      }
      case 'BEG':
        eyeY = Math.min(eyeY, beg(1, 1, tt));
        break;
      // ---- pranks between birds (park.js) ----
      case 'POKE': {
        // a quick jab of the beak at the bird in front, the body leaning into it
        const k = Math.max(0, Math.sin(tt * 16));
        head.position.x = hx + 0.24 * k;
        head.position.y = hy - 0.04 * k;
        head.rotation.z = -0.2 * k;
        inner.rotation.z = -0.22 * k;
        inner.position.x = 0.06 * k;
        beak.scale.set(1, 1 + 0.3 * k, 1.1);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.5;
        break;
      }
      case 'SHOVE': {
        // a sideways bump with the shoulder, one wing out for balance
        const k = Math.max(0, Math.sin(tt * 11));
        inner.rotation.x = 0.3 * k;
        inner.position.z = 0.12 * k;
        inner.rotation.z = -0.1 * k;
        wings.forEach((w, i) => { if (i === 1) w.rotation.set(0.5 * k, 0.6 * k, WZ); });
        head.rotation.x = -0.2 * k;
        break;
      }
      case 'BONKED': {
        // just got pranked: feathers puffed up, head jerked back, eyes squeezed shut, wobbling
        inner.scale.set(1.16, 1.1, 1.16);
        inner.rotation.z = 0.16 + Math.sin(tt * 22) * 0.07;
        head.rotation.z = 0.4;
        head.position.x = hx - 0.06;
        wingPose(0.45, Math.abs(Math.sin(tt * 18)) * 0.3);
        if (head.userData.crest) head.userData.crest.rotation.z = -0.7;
        eyeY = 0.12;
        break;
      }
      case 'SQUISHED': {
        // someone is sitting on my head
        inner.scale.set(1.14, 0.88, 1.14);
        head.position.y = hy - 0.1;
        head.rotation.z = -0.15 + Math.sin(tt * 3) * 0.05;
        if (head.userData.crest) head.userData.crest.rotation.z = 0.8;
        eyeY = 0.45;
        break;
      }
      default:
        eyeY = idle(tt, look, eyeY);
    }
    eyes.forEach((e) => e.scale.set(1, eyeY, 1));
  }

  return { group, pose, size: S.size, colors: c };
}

export { UP, shade, toLinear };
