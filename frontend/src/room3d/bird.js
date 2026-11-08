// Low-poly parrots built from spheres, with a soft toon look and a thin ink outline.
// Colors come from the owner's customizer (face, head, body, wing, tail); the species sets the shape:
//   LOVEBIRD  short and round, short fan tail, blue rump, big pale beak
//   BUDGIE    small and slim, long pointed tail, barred head and wings, cere, purple cheeks, throat dots
//   COCKATIEL stands upright, tall curled crest, round orange cheeks, white wing bar, very long tail
//   QUAKER    big and sturdy, scalloped grey chest, long tail, orange-horn beak
//   GREEN_CHEEKED_CONURE  dark cap, bare white eye rings, scalloped chest, long dark-red tail
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const SPH = new THREE.SphereGeometry(1, 22, 16);
const SPH_LO = new THREE.SphereGeometry(1, 10, 8);
const toLinear = (hex) => new THREE.Color(hex).convertSRGBToLinear();

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

function shade(hex, f) {
  return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
}
function lighten(hex, k) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#FFFFFF'), k);
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

/** Body shape per species. tilt lifts the chest (upright birds), tail = [length, width, feathers]. */
const SHAPES = {
  LOVEBIRD: { scale: 0.95, body: [0.48, 0.43, 0.41], tilt: 0.15, tail: [0.75, 1.15, 3], head: [0.28, 0.78], headR: 1.02, beak: ['#F1DCC0', 1.2] },
  BUDGIE: { scale: 0.8, body: [0.4, 0.4, 0.33], tilt: 0.38, tail: [1.75, 0.75, 2], head: [0.25, 0.82], headR: 0.92, beak: ['#E9D9A8', 0.75] },
  COCKATIEL: { scale: 1.05, body: [0.42, 0.44, 0.36], tilt: 0.62, tail: [2.1, 0.8, 2], head: [0.2, 0.9], headR: 0.95, beak: ['#9A9894', 0.8] },
  QUAKER: { scale: 1.08, body: [0.5, 0.46, 0.42], tilt: 0.32, tail: [1.45, 0.95, 3], head: [0.27, 0.84], headR: 1.05, beak: ['#F0B880', 1.2] },
  GREEN_CHEEKED_CONURE: { scale: 0.95, body: [0.44, 0.43, 0.37], tilt: 0.36, tail: [1.65, 0.85, 3], head: [0.26, 0.83], headR: 0.98, beak: ['#46413D', 1.0] },
  OTHER: { scale: 1, body: [0.47, 0.42, 0.4], tilt: 0.3, tail: [1, 1, 3], head: [0.28, 0.78], headR: 1, beak: ['#F3E3C8', 1] },
};

/** Little crescent marks on a surface: barring, scallops. */
function marks(parent, hex, list, size) {
  list.forEach(([x, y, z, rz = 0]) => blob(parent, hex, x, y, z, size[0], size[1], size[2], rz, 0, SPH_LO));
}

/**
 * Builds a bird. Returns { group, pose(mood, t) }.
 */
export function makeBird(colors, species) {
  const c = colors;
  const S = SHAPES[species] || SHAPES.OTHER;
  const wingC = c.wing;
  const tipC = shade(wingC, 0.7);
  const bellyC = lighten(c.body, 0.3);
  const LW = 0.022;
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  // the torso turns around the middle of the body, so upright species lift the chest and drop the tail
  const torso = new THREE.Group();
  torso.position.set(-0.04, 0.47, 0);
  torso.rotation.z = S.tilt;
  inner.add(torso);
  const [bx, by, bz] = S.body;
  blob(torso, c.body, 0, 0, 0, bx, by, bz, 0.3 - S.tilt * 0.5, LW);
  const chest = blob(torso, bellyC, 0.15, -0.07, 0, bx * 0.74, by * 0.76, bz * 0.85, 0.2);
  if (species === 'LOVEBIRD' || species === 'OTHER') blob(torso, '#4A8FD1', -0.36, -0.04, 0, 0.19, 0.17, 0.2);

  // tail
  const [tl, tw, tn] = S.tail;
  const tails = tn === 2 ? [-0.035, 0.035] : [-0.07, 0, 0.07];
  tails.forEach((z, i) => {
    const len = 0.25 * tl * (tn === 3 && i !== 1 ? 0.88 : 1);
    blob(torso, c.tail, -0.55 - len * 0.7, -0.16 - Math.abs(z) * 0.4, z * 1.4 * tw, len, 0.06 * tw, 0.055 * tw, 0.32 + S.tilt * 0.25 + (i - (tails.length - 1) / 2) * 0.05, LW * 0.6);
  });

  const wingBase = [];
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(-0.06, 0.03, (bz - 0.07) * s);
    w.rotation.z = 0.35;
    torso.add(w);
    wingBase.push(w.position.y);
    blob(w, wingC, 0, 0, 0, 0.36, 0.22, 0.09, 0, LW);
    blob(w, tipC, -0.24, -0.05, 0.012 * s, 0.24, 0.12, 0.07);
    if (species === 'BUDGIE') {
      // black scallops on the wing
      marks(w, '#1E1E1E', [[0.16, 0.08, 0.08 * s], [0.05, 0.1, 0.085 * s], [-0.06, 0.08, 0.085 * s], [0.1, -0.02, 0.088 * s], [-0.01, -0.01, 0.09 * s], [-0.12, -0.03, 0.085 * s]], [0.05, 0.022, 0.018]);
    }
    if (species === 'COCKATIEL') blob(w, lighten(wingC, 0.75), 0.08, 0.02, 0.06 * s, 0.2, 0.08, 0.04, -0.15);
    if (species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE') blob(w, shade(wingC, 0.8), 0.12, 0.08, 0.05 * s, 0.14, 0.09, 0.05);
    return w;
  });

  // scalloped chests: crescents placed on the surface of the chest ellipsoid
  if (species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE') {
    const chestC = species === 'QUAKER' ? (c.face || '#C9CFC4') : lighten(c.body, 0.2);
    chest.material = toon(chestC);
    const markC = species === 'QUAKER' ? shade(chestC, 0.62) : shade(c.body, 0.5);
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

  const FOOT = species === 'COCKATIEL' || species === 'QUAKER' ? '#9C8F8A' : '#C9A9A0';
  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), toon(FOOT));
    leg.position.set(0.06, 0.07, 0.11 * s);
    inner.add(leg);
  });

  // head
  const [hx, hy] = S.head;
  const head = new THREE.Group();
  head.position.set(hx, hy, 0);
  head.scale.setScalar(S.headR);
  inner.add(head);
  blob(head, c.body, -0.05, 0.12, 0, 0.33, 0.33, 0.33, 0, LW);
  blob(head, c.face, 0.07, 0.06, 0, 0.32, 0.3, 0.33, 0, LW);
  if (species === 'GREEN_CHEEKED_CONURE') {
    // a dark cap over the crown and the back of the head
    blob(head, c.head, -0.02, 0.2, 0, 0.32, 0.26, 0.335, 0.2);
  } else {
    blob(head, c.head, 0.18, 0.24, 0, 0.2, 0.15, 0.24);
  }

  if (species === 'COCKATIEL') {
    [-1, 1].forEach((s) => blob(head, '#F07C3E', 0.2, -0.02, 0.27 * s, 0.12, 0.11, 0.035));
    const crest = new THREE.Group();
    crest.position.set(0.1, 0.36, 0);
    head.add(crest);
    [0, 1, 2, 3].forEach((i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.5 - i * 0.08, 8), toon(i === 0 ? c.head : shade(c.head, 0.92)));
      f.geometry.translate(0, (0.5 - i * 0.08) / 2, 0);
      f.position.set(-0.05 * i, 0, 0);
      f.rotation.z = 0.25 + i * 0.16;
      crest.add(f);
    });
    head.userData.crest = crest;
  } else if (species === 'BUDGIE') {
    [-1, 1].forEach((s) => blob(head, '#6E5DB8', 0.24, -0.1, 0.25 * s, 0.06, 0.05, 0.03));
    // throat spots
    marks(head, '#1E1E1E', [[0.3, -0.17, 0.07], [0.3, -0.17, -0.07], [0.27, -0.2, 0.17], [0.27, -0.2, -0.17]], [0.028, 0.028, 0.028]);
    // barring on the back of the head
    marks(head, '#1E1E1E', [[-0.24, 0.3, 0, 0.6], [-0.3, 0.2, 0, 0.9], [-0.33, 0.08, 0, 1.2], [-0.12, 0.38, 0, 0.3]], [0.02, 0.01, 0.2]);
    // cere over the beak
    blob(head, '#6F8FD8', 0.37, 0.12, 0, 0.06, 0.04, 0.07);
  } else if (species === 'LOVEBIRD' || species === 'OTHER') {
    [-1, 1].forEach((s) => blob(head, '#FF9C9C', 0.2, -0.02, 0.27 * s, 0.075, 0.045, 0.03));
  }

  const [beakC, beakK] = S.beak;
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12 * beakK, 0.2 * Math.sqrt(beakK), 14), toon(beakC));
  beak.position.set(0.39 + 0.02 * beakK, 0.02, 0);
  beak.rotation.z = -Math.PI / 2 - 0.55;
  head.add(beak);
  const eyes = [-1, 1].map((s) => {
    const eg = new THREE.Group();
    eg.position.set(0.24, 0.12, 0.27 * s);
    head.add(eg);
    blob(eg, '#1B1B1B', 0, 0, 0, 0.07, 0.078, 0.05);
    const hl = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(0.028, 0.032, 0.035 * s);
    hl.scale.setScalar(0.024);
    eg.add(hl);
    if (species === 'GREEN_CHEEKED_CONURE') {
      // bare white skin around the eye, outside the blinking group
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 16), toon('#F4F1EA'));
      ring.position.set(0.24, 0.12, 0.27 * s + 0.01 * s);
      head.add(ring);
    }
    return eg;
  });

  group.scale.setScalar(S.scale);
  const phase = Math.random() * 10;

  /** Pose for a mood or an action. t = seconds. */
  function pose(mood, t) {
    const tt = t + phase;
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);
    inner.scale.set(1, 1, 1);
    head.position.set(hx, hy, 0);
    head.rotation.set(0, 0, 0);
    beak.scale.set(1, 1, 1);
    wings.forEach((w, i) => { w.rotation.set(0, 0, 0.35); w.position.y = wingBase[i]; });
    let eyeY = tt % 4.2 < 0.13 ? 0.15 : 1;
    if (head.userData.crest) head.userData.crest.rotation.z = 0;
    switch (mood) {
      case 'WALK':
        inner.position.y = Math.abs(Math.sin(tt * 13)) * 0.1;
        inner.rotation.z = -0.08;
        head.rotation.z = Math.sin(tt * 13) * 0.06;
        break;
      case 'FLY': {
        const f = Math.sin(tt * 26);
        wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * (0.7 + f * 0.7); w.position.y = wingBase[i] + 0.12; });
        inner.rotation.z = 0.12 - S.tilt * 0.4;
        if (head.userData.crest) head.userData.crest.rotation.z = 0.5;
        break;
      }
      case 'DANCE': {
        const k = Math.sin(tt * 9);
        inner.position.y = Math.abs(k) * 0.22;
        inner.rotation.y = Math.sin(tt * 4.5) * 0.5;
        head.rotation.z = 0.2 + k * 0.2;
        wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.max(0, k) * 0.9; });
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
        beak.scale.set(1, 1.35, 1.35);
        wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * 0.3; });
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
      case 'HAPPY':
        inner.position.y = Math.abs(Math.sin(tt * 5)) * 0.12;
        head.rotation.z = 0.15;
        wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.max(0, Math.sin(tt * 5)) * 0.5; });
        if (head.userData.crest) head.userData.crest.rotation.z = -0.4;
        break;
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
      case 'HUNGRY':
      case 'EAT': {
        const k = Math.max(0, Math.sin(tt * (mood === 'EAT' ? 9 : 6)));
        head.rotation.z = -0.8 * k;
        head.position.x = hx + 0.08 * k;
        break;
      }
      default:
        inner.position.y = Math.sin(tt * 2.2) * 0.015;
        head.rotation.z = Math.sin(tt * 0.7) * 0.1;
        head.rotation.y = Math.sin(tt * 0.45) * 0.35;
    }
    eyes.forEach((e) => e.scale.set(1, eyeY, 1));
  }

  return { group, pose };
}

export { UP, shade, toLinear };
