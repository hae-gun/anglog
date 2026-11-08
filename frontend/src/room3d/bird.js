// Low-poly lovebird-style parrot built from spheres, with a soft toon look and a thin ink outline.
// Ported from the 3D prototype. Colors come from the owner's customizer (face, head, body, wing, tail).
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const SPH = new THREE.SphereGeometry(1, 22, 16);
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

function blob(parent, hex, x, y, z, sx, sy, sz, rz, line) {
  const m = new THREE.Mesh(SPH, toon(hex));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rz) m.rotation.z = rz;
  m.castShadow = true;
  parent.add(m);
  if (line) {
    const o = new THREE.Mesh(SPH, lineMat);
    o.position.copy(m.position);
    o.rotation.copy(m.rotation);
    o.scale.set(sx + line, sy + line, sz + line);
    parent.add(o);
  }
  return m;
}

/**
 * Builds a bird. Returns { group, pose(mood, t) }.
 * species tweaks: COCKATIEL gets a crest and orange cheeks, BUDGIE is smaller.
 */
export function makeBird(colors, species) {
  const c = colors;
  const wingC = c.wing;
  const tipC = shade(wingC, 0.7);
  const bellyC = lighten(c.body, 0.3);
  const LW = 0.022;
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  blob(inner, c.body, -0.04, 0.47, 0, 0.47, 0.42, 0.4, 0.3, LW);
  blob(inner, bellyC, 0.11, 0.4, 0, 0.35, 0.32, 0.34, 0.2);
  if (species === 'LOVEBIRD' || species === 'OTHER') blob(inner, '#4A8FD1', -0.4, 0.43, 0, 0.19, 0.17, 0.2);
  const tailLen = species === 'COCKATIEL' ? 1.6 : species === 'BUDGIE' ? 1.4 : 1;
  [-0.07, 0, 0.07].forEach((z, i) => {
    blob(inner, c.tail, -0.66 - (tailLen - 1) * 0.2, 0.31 - Math.abs(z) * 0.4, z * 1.4, 0.25 * tailLen, 0.065, 0.06, 0.45 + (i - 1) * 0.05, LW * 0.6);
  });
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(-0.1, 0.5, 0.33 * s);
    w.rotation.z = 0.35;
    inner.add(w);
    blob(w, wingC, 0, 0, 0, 0.36, 0.22, 0.09, 0, LW);
    blob(w, tipC, -0.24, -0.05, 0.012 * s, 0.24, 0.12, 0.07);
    return w;
  });
  const FOOT = '#C9A9A0';
  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), toon(FOOT));
    leg.position.set(0.06, 0.07, 0.11 * s);
    inner.add(leg);
  });

  const head = new THREE.Group();
  head.position.set(0.28, 0.78, 0);
  inner.add(head);
  blob(head, c.body, -0.05, 0.12, 0, 0.33, 0.33, 0.33, 0, LW);
  blob(head, c.face, 0.07, 0.06, 0, 0.32, 0.3, 0.33, 0, LW);
  blob(head, c.head, 0.18, 0.24, 0, 0.2, 0.15, 0.24);
  const cheek = species === 'COCKATIEL' ? '#F07C3E' : '#FF9C9C';
  [-1, 1].forEach((s) => blob(head, cheek, 0.2, -0.02, 0.27 * s, species === 'COCKATIEL' ? 0.1 : 0.075, species === 'COCKATIEL' ? 0.08 : 0.045, 0.03));
  if (species === 'COCKATIEL') {
    const crest = new THREE.Group();
    crest.position.set(0.08, 0.4, 0);
    head.add(crest);
    [0, 1, 2].forEach((i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42 - i * 0.08, 8), toon(c.head));
      f.position.set(-0.04 * i, 0.16, 0);
      f.rotation.z = 0.35 + i * 0.12;
      crest.add(f);
    });
    head.userData.crest = crest;
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 14), toon(species === 'QUAKER' ? '#F1E4C8' : '#F3E3C8'));
  beak.position.set(0.41, 0.02, 0);
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
    return eg;
  });

  if (species === 'BUDGIE') group.scale.setScalar(0.85);
  const phase = Math.random() * 10;

  /** Pose for the owner's latest mood. t = seconds. */
  function pose(mood, t) {
    const tt = t + phase;
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);
    inner.scale.set(1, 1, 1);
    head.position.set(0.28, 0.78, 0);
    head.rotation.set(0, 0, 0);
    beak.scale.set(1, 1, 1);
    wings.forEach((w) => { w.rotation.set(0, 0, 0.35); w.position.y = 0.5; });
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
        wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * (0.7 + f * 0.7); w.position.y = 0.62; });
        inner.rotation.z = 0.12;
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
        head.position.x = 0.34;
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
        break;
      }
      case 'SLEEPY':
        head.position.set(0.24, 0.7, 0);
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
      case 'HUNGRY': {
        const k = Math.max(0, Math.sin(tt * 6));
        head.rotation.z = -0.8 * k;
        head.position.x = 0.28 + 0.08 * k;
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
