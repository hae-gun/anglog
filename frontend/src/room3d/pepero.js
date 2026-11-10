// 빼빼로 숲: an event space next to the park (north, up the ginkgo avenue and along a cream road),
// where the trees are giant chocolate sticks. Birds sit on the tops, on sticks laid across between
// two of them, on gift boxes and on the big bundle in the middle. Nobody eats them: chocolate is
// poison to parrots, and the signs and the birds say so.
//
// Open only around 11월 11일 (Korea time), or with ?pepero=1 to try it (?pepero=0 hides it).
import * as THREE from 'three';
import { mat } from './scene.js';
import { tr } from '../i18n';

export const PEPERO = { x: 0, z: 86, r: 21 };
const ROAD_HALF = 1.4;
const OPEN_FROM = [11, 1]; // month, day (Korea time), both ends included
const OPEN_TO = [11, 18];

export function peperoOpen() {
  const q = new URLSearchParams(window.location.search).get('pepero');
  if (q === '1') return true;
  if (q === '0') return false;
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const md = (k.getUTCMonth() + 1) * 100 + k.getUTCDate();
  return md >= OPEN_FROM[0] * 100 + OPEN_FROM[1] && md <= OPEN_TO[0] * 100 + OPEN_TO[1];
}

const BISCUIT = '#E3B574';
const FLAVORS = [
  { coat: '#5A3322' }, // chocolate
  { coat: '#4E2B1D', bits: ['#D6A362', '#C8924F'] }, // almond
  { coat: '#F4A6BC' }, // strawberry
  { coat: '#F7EFE2', bits: ['#F28DA8', '#8FD3C1', '#F6D46B', '#8DB8EE'] }, // white with sprinkles
  { coat: '#A8C47A' }, // green tea
  { coat: '#F3E9DA', bits: ['#3A2418'] }, // cookies and cream
];
const BOXES = ['#F6B6C8', '#A9DCC9', '#F6DE8D', '#CDB8E8', '#A9CBEE'];
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds the forest into the scene and returns its ground rules and places.
 * ctx: { rnd, perchSegs, obstacles, parkR, snowy, night, small, tint, snow }
 */
export function buildPepero(scene, ctx) {
  const { rnd, perchSegs, obstacles, parkR, snowy, night, small, tint, snow } = ctx;
  const C = PEPERO;
  const gateZ = C.z - C.r + 1.5;
  const sticks = []; // { base, dir, len, r, flavor, segs }
  const bars = []; // drawn like sticks but lying across
  const boxes = [];
  const segs = []; // every perch in the forest
  const lands = []; // [geometry, position, (point) => spot]
  const nearestOn = (list, pt) => {
    let best = null;
    const ab = new THREE.Vector3(), q = new THREE.Vector3();
    list.forEach((s) => {
      ab.subVectors(s.b, s.a);
      const t = THREE.MathUtils.clamp(q.subVectors(pt, s.a).dot(ab) / ab.lengthSq(), 0, 1);
      q.copy(s.a).addScaledVector(ab, t);
      const d = q.distanceTo(pt);
      if (!best || d < best.d) best = { d, p: q.clone() };
    });
    return best && { p: best.p, surface: 'branch' };
  };
  const addSeg = (a, b, owner) => {
    const s = { a, b };
    segs.push(s);
    perchSegs.push(s);
    if (owner) owner.segs.push(s);
  };

  /** A stick standing up (leaning a little); its top is a perch. */
  function stick(x, z, len, r, lean = 0, leanA = 0, flavor = null) {
    const dir = new THREE.Vector3(Math.cos(leanA) * Math.sin(lean), Math.cos(lean), Math.sin(leanA) * Math.sin(lean)).normalize();
    const st = { base: new THREE.Vector3(x, 0, z), dir, len, r, flavor: flavor || FLAVORS[Math.floor(rnd() * FLAVORS.length)], segs: [] };
    sticks.push(st);
    const top = st.base.clone().addScaledVector(dir, len);
    const side = new THREE.Vector3(-dir.z || 1, 0, dir.x).normalize().multiplyScalar(Math.min(0.24, r * 0.7));
    const lift = new THREE.Vector3(0, r * 0.55 + 0.03, 0);
    addSeg(top.clone().add(side).add(lift), top.clone().sub(side).add(lift), st);
    obstacles.push({ x, z, r: r + 0.12, h: top.y });
    return st;
  }
  /** Where a stick's middle line is at height y. */
  const along = (st, y) => st.base.clone().addScaledVector(st.dir, y / st.dir.y);
  /** A stick laid across from one point to another: a branch to sit on. */
  function bar(A, B, r, owner) {
    bars.push({ a: A, b: B, r, flavor: FLAVORS[Math.floor(rnd() * FLAVORS.length)] });
    const lift = new THREE.Vector3(0, r + 0.03, 0);
    addSeg(A.clone().lerp(B, 0.1).add(lift), A.clone().lerp(B, 0.9).add(lift), owner);
  }

  // ---- ground: cocoa-dusted grass (powdered sugar on snowy days) and a cream road from the park ----
  const groundCol = snowy ? tint(night ? '#7C6656' : '#D9C2AE', snow, 0.55) : night ? '#5E4B3E' : '#B98E6A';
  const ground = new THREE.Mesh(new THREE.CircleGeometry(C.r + 3, 48), mat(groundCol));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(C.x, -0.02, C.z);
  ground.receiveShadow = true;
  scene.add(ground);
  const cream = mat(snowy ? tint('#F6E7CC', snow, 0.5) : night ? '#B8A68C' : '#F6E7CC');
  const roadFrom = parkR - 1.5, roadTo = gateZ + 1;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, roadTo - roadFrom), cream);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.013, (roadFrom + roadTo) / 2);
  road.receiveShadow = true;
  scene.add(road);
  const plazaM = new THREE.Mesh(new THREE.CircleGeometry(5.2, 36), cream);
  plazaM.rotation.x = -Math.PI / 2;
  plazaM.position.set(C.x, 0.012, C.z);
  plazaM.receiveShadow = true;
  scene.add(plazaM);
  const loop = new THREE.Mesh(new THREE.RingGeometry(10.2, 11.6, 64), cream);
  loop.rotation.x = -Math.PI / 2;
  loop.position.set(C.x, 0.012, C.z);
  loop.receiveShadow = true;
  scene.add(loop);
  const toGate = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, C.r - 11), cream);
  toGate.rotation.x = -Math.PI / 2;
  toGate.position.set(0, 0.013, C.z - 11 - (C.r - 11) / 2 + 0.6);
  scene.add(toGate);

  // little sticks along the road like fence posts; each top is a perch
  for (let z = roadFrom + 3; z < roadTo - 1.5; z += 3.3) [-1, 1].forEach((s, k) => stick(s * (ROAD_HALF + 0.55), z, 1.1 + ((z * 7 + k) % 3) * 0.15, 0.09));

  // the gate: two tall sticks and one laid across the top, with lights strung on it
  const gL = stick(-2.1, gateZ, 4.6, 0.3, 0, 0, FLAVORS[0]);
  const gR = stick(2.1, gateZ, 4.6, 0.3, 0, 0, FLAVORS[2]);
  const gate = { segs: [] };
  bar(new THREE.Vector3(-2.9, 4.25, gateZ), new THREE.Vector3(2.9, 4.25, gateZ), 0.22, gate);
  gL.segs.push(...gate.segs);
  gR.segs.push(...gate.segs);

  // ---- the bundle in the middle: seven giant sticks tied with a ribbon, sticks poking out to sit on --
  const bundle = { segs: [] };
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const r0 = k === 6 ? 0 : 0.95;
    const st = k === 6
      ? stick(C.x, C.z, 11, 0.5, 0, 0, FLAVORS[0])
      : stick(C.x + Math.cos(a) * r0, C.z + Math.sin(a) * r0, 9.4 + (k % 3) * 0.5, 0.46, 0.1, a, FLAVORS[k % FLAVORS.length]);
    bundle.segs.push(...st.segs);
  }
  obstacles.push({ x: C.x, z: C.z, r: 1.7, h: 10.5 });
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.2, 8, 28), mat('#E2506F'));
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.set(C.x, 3.0, C.z);
  scene.add(ribbon);
  [-1, 1].forEach((s) => {
    const loopM = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 6, 16), mat('#E2506F'));
    loopM.position.set(C.x + s * 0.55, 3.25, C.z - 1.75);
    loopM.rotation.set(0, 0, s * 0.5);
    loopM.scale.set(1, 0.7, 1);
    scene.add(loopM);
  });
  // sticks pushed into the bundle all the way up, like branches
  for (let i = 0; i < 11; i++) {
    const a = i * 2.35 + 0.4, y = 1.8 + i * 0.68, L = 3.0 - i * 0.07;
    bar(new THREE.Vector3(C.x + Math.cos(a) * 1.2, y, C.z + Math.sin(a) * 1.2), new THREE.Vector3(C.x + Math.cos(a) * L, y + 0.35, C.z + Math.sin(a) * L), 0.13, bundle);
  }

  // ---- the forest itself ----------------------------------------------------------------
  const keepOut = (x, z) => Math.hypot(x - C.x, z - C.z) < 5.4
    || (Math.abs(x) < 3.2 && z < C.z - 9) // the way in from the gate
    || Math.abs(Math.hypot(x - C.x, z - C.z) - 10.9) < 1.3; // the loop path
  const want = small ? 46 : 64;
  const forest = [];
  for (let tries = 0; forest.length < want && tries < 3000; tries++) {
    const a = rnd() * Math.PI * 2, rr = 5.5 + Math.sqrt(rnd()) * (C.r - 7);
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    if (keepOut(x, z) || forest.some((s) => Math.hypot(s.base.x - x, s.base.z - z) < 2.1)) continue;
    const len = 4 + rnd() * 5.5 + (rr > 14 ? 1.2 : 0);
    forest.push(stick(x, z, Math.min(len, 10.6), 0.17 + len * 0.026, rnd() * 0.17, rnd() * Math.PI * 2));
  }
  // sticks laid across between neighbours, at different heights: the forest's branches
  let laid = 0;
  const joined = new Set();
  forest.forEach((s, i) => {
    if (laid >= (small ? 16 : 24)) return;
    let best = -1, bd = Infinity;
    forest.forEach((o, j) => {
      if (j === i || joined.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) return;
      const d = Math.hypot(o.base.x - s.base.x, o.base.z - s.base.z);
      if (d > 2.3 && d < 4.4 && d < bd) { bd = d; best = j; }
    });
    if (best < 0) return;
    const o = forest[best];
    joined.add(`${Math.min(i, best)}-${Math.max(i, best)}`);
    const y = Math.min(s.len * s.dir.y, o.len * o.dir.y) * (0.35 + rnd() * 0.4);
    const A = along(s, y), B = along(o, y + (rnd() - 0.5) * 0.4);
    const own = { segs: [] };
    bar(A, B, 0.13, own);
    s.segs.push(...own.segs);
    o.segs.push(...own.segs);
    laid++;
  });

  // gift boxes on the ground; their lids are perches too
  for (let i = 0, tries = 0; i < 9 && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, rr = 6.5 + rnd() * (C.r - 8);
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    if (keepOut(x, z) || sticks.some((s) => Math.hypot(s.base.x - x, s.base.z - z) < 2.0) || boxes.some((b) => Math.hypot(b.x - x, b.z - z) < 3)) continue;
    const s = 0.9 + rnd() * 0.8, ry = rnd() * Math.PI;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), mat(BOXES[i % BOXES.length]));
    body.position.y = s * 0.4;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const rib = mat('#FFFFFF');
    [[s + 0.02, s * 0.82, 0.14], [0.14, s * 0.82, s + 0.02]].forEach(([w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rib);
      m.position.y = s * 0.4;
      g.add(m);
    });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), rib);
    knot.position.y = s * 0.82;
    g.add(knot);
    scene.add(g);
    const own = { x, z, s, segs: [] };
    const ux = Math.cos(ry) * s * 0.32, uz = -Math.sin(ry) * s * 0.32;
    addSeg(new THREE.Vector3(x - ux, s * 0.8 + 0.02, z - uz), new THREE.Vector3(x + ux, s * 0.8 + 0.02, z + uz), own);
    boxes.push(own);
    obstacles.push({ x, z, r: s * 0.72, h: s * 0.8 });
    i++;
  }

  // ---- draw every stick instanced: biscuit, coating, the round tip, and nuts or sprinkles ----
  {
    const all = [
      ...sticks.map((s) => ({ a: s.base, b: s.base.clone().addScaledVector(s.dir, s.len), r: s.r, flavor: s.flavor, hold: 0.2 })),
      ...bars.map((b) => ({ ...b, hold: 0.12 })),
    ];
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const biscuitMesh = new THREE.InstancedMesh(cyl, mat(BISCUIT), all.length);
    const coatMesh = new THREE.InstancedMesh(cyl, new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true }), all.length);
    const tipMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), coatMesh.material, all.length);
    const bitList = [];
    const d = new THREE.Object3D(), col = new THREE.Color(), dir = new THREE.Vector3();
    all.forEach((s, i) => {
      dir.subVectors(s.b, s.a);
      const len = dir.length();
      dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      // biscuit end
      const hold = len * s.hold;
      d.quaternion.copy(q);
      d.position.copy(s.a).addScaledVector(dir, hold / 2);
      d.scale.set(s.r, hold, s.r);
      d.updateMatrix();
      biscuitMesh.setMatrixAt(i, d.matrix);
      // the dipped part, a little fatter
      const coatLen = len - hold - s.r * 0.6;
      d.position.copy(s.a).addScaledVector(dir, hold + coatLen / 2);
      d.scale.set(s.r * 1.13, coatLen, s.r * 1.13);
      d.updateMatrix();
      coatMesh.setMatrixAt(i, d.matrix);
      const coat = snowy ? tint(s.flavor.coat, snow, 0.12) : s.flavor.coat;
      coatMesh.setColorAt(i, col.set(coat).convertSRGBToLinear());
      d.position.copy(s.a).addScaledVector(dir, hold + coatLen);
      d.scale.set(s.r * 1.13, s.r * 0.6, s.r * 1.13);
      d.updateMatrix();
      tipMesh.setMatrixAt(i, d.matrix);
      tipMesh.setColorAt(i, col);
      if (s.flavor.bits) {
        const n = Math.round(coatLen * (s.r > 0.25 ? 6 : 4));
        const side = new THREE.Vector3(), up2 = new THREE.Vector3();
        side.set(1, 0, 0).applyQuaternion(q);
        up2.set(0, 0, 1).applyQuaternion(q);
        for (let k = 0; k < n; k++) {
          const t = hold + rnd() * coatLen, ang = rnd() * Math.PI * 2;
          const p = s.a.clone().addScaledVector(dir, t)
            .addScaledVector(side, Math.cos(ang) * s.r * 1.14)
            .addScaledVector(up2, Math.sin(ang) * s.r * 1.14);
          bitList.push({ p, s: s.r * (s.flavor.bits.length > 2 ? 0.16 : 0.26), c: s.flavor.bits[Math.floor(rnd() * s.flavor.bits.length)] });
        }
      }
    });
    [biscuitMesh, coatMesh, tipMesh].forEach((m) => { m.castShadow = true; scene.add(m); });
    if (bitList.length) {
      const bitMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), bitList.length);
      bitList.forEach((b, i) => {
        d.position.copy(b.p);
        d.quaternion.identity();
        d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        d.scale.set(b.s, b.s * 0.7, b.s);
        d.updateMatrix();
        bitMesh.setMatrixAt(i, d.matrix);
        bitMesh.setColorAt(i, col.set(b.c).convertSRGBToLinear());
      });
      scene.add(bitMesh);
    }
    // sprinkles scattered on the ground
    const SPR = ['#F28DA8', '#8FD3C1', '#F6D46B', '#8DB8EE', '#FFFFFF', '#C9A2E8'];
    const nS = small ? 500 : 900;
    const spr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.6 }), nS);
    for (let i = 0; i < nS; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (C.r + 1);
      d.position.set(C.x + Math.cos(a) * rr, 0.02, C.z + Math.sin(a) * rr);
      d.quaternion.identity();
      d.rotation.set(0, rnd() * Math.PI, 0);
      d.scale.setScalar(0.8 + rnd() * 0.6);
      d.updateMatrix();
      spr.setMatrixAt(i, d.matrix);
      spr.setColorAt(i, col.set(SPR[i % SPR.length]).convertSRGBToLinear());
    }
    scene.add(spr);
    // fairy lights on the gate (they glow at night)
    const bulb = new THREE.MeshBasicMaterial({ color: night ? 0xffe6a0 : 0xfff3d6 });
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bulb);
      const x = -2.6 + k * 0.65;
      m.position.set(x, 3.95 - Math.sin((k / 8) * Math.PI) * 0.35, gateZ + 0.05);
      scene.add(m);
    }
  }

  // ---- signs: the name of the place, and a word about chocolate ---------------------------------
  function sign(x, z, ry, lines, w = 2.4, hgt = 1.3) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round(512 * (hgt / w));
    const g = c.getContext('2d');
    g.fillStyle = '#FFF6EA';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#5A3322';
    g.lineWidth = 14;
    g.strokeRect(7, 7, c.width - 14, c.height - 14);
    g.fillStyle = '#5A3322';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach(([text, size], i) => {
      g.font = `bold ${size}px sans-serif`;
      g.fillText(text, c.width / 2, (c.height * (i + 0.5)) / n + (n > 1 && i === 0 ? 6 : 0), c.width - 40);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    board.position.y = 1.1 + hgt / 2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, hgt + 0.1, 0.08), mat('#9C7048'));
    back.position.set(0, board.position.y, -0.05);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2 + hgt, 6), mat('#9C7048'));
    post.position.set(0, (1.2 + hgt) / 2, -0.1);
    post.castShadow = true;
    grp.add(board, back, post);
    scene.add(grp);
    obstacles.push({ x, z, r: 0.3, h: 1.2 + hgt });
  }
  sign(3.9, gateZ - 0.6, Math.PI, [[tr('빼빼로 숲', 'Pepero Forest'), 84], [tr('앵무에게 초콜릿은 위험해요. 눈으로만!', 'Chocolate is bad for parrots. Just look!'), 34]], 2.8, 1.6);
  sign(2.7, parkR + 2.2, Math.PI, [[tr('빼빼로 숲 가는 길', 'To the Pepero Forest'), 46], [tr('11월 11일 이벤트', 'Nov 11 event'), 34]], 2.4, 1.0);

  // ---- tap targets: tap a stick, a box or the bundle to sit on it ---------------------------------
  const onSegs = (list) => (pt) => nearestOn(list, pt);
  lands.push([new THREE.CylinderGeometry(3.4, 3.4, 10.5, 12), new THREE.Vector3(C.x, 5.6, C.z), onSegs(bundle.segs)]);
  [...forest, gL, gR].forEach((s) => {
    const h = s.len * s.dir.y;
    const mid = along(s, h / 2);
    lands.push([new THREE.CylinderGeometry(s.r + 0.7, s.r + 0.7, h, 8), new THREE.Vector3(mid.x, h / 2 + 0.3, mid.z), onSegs(s.segs)]);
  });
  boxes.forEach((b) => lands.push([new THREE.BoxGeometry(b.s * 1.2, b.s, b.s * 1.2), new THREE.Vector3(b.x, b.s * 0.45, b.z), onSegs(b.segs)]));

  // ---- treasure boxes for the 빼빼로 찾기 event: the same ten spots on every screen (the server knows them
  // only by number, realtime park/Channel.BOXES). They sit on the loop path, which the sticks keep clear of
  // on every device (small screens grow fewer sticks), so the spots never depend on the forest's layout.
  const chests = [];
  const LID = ['#F6B6C8', '#A9DCC9', '#F6DE8D', '#CDB8E8', '#A9CBEE'];
  const wood = mat('#B07A4A'), trim = mat('#F2C94C');
  for (let k = 0; k < 10; k++) {
    const a = 0.31 + (k / 10) * Math.PI * 2;
    const x = C.x + Math.cos(a) * 10.9, z = C.z + Math.sin(a) * 10.9;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -a + Math.PI / 2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.5), wood);
    body.position.y = 0.21;
    body.castShadow = true;
    g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.52), trim);
    band.position.y = 0.36;
    g.add(band);
    // the lid hinges at the back edge
    const lid = new THREE.Group();
    lid.position.set(0, 0.42, -0.25);
    g.add(lid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12, 1, false, 0, Math.PI), mat(LID[k % LID.length]));
    top.rotation.z = Math.PI / 2;
    top.position.z = 0.25;
    lid.add(top);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), trim);
    lock.position.set(0, 0.0, 0.51);
    lid.add(lock);
    // a little star that bobs over a box you can open
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
    star.position.y = 1.0;
    g.add(star);
    scene.add(g);
    chests.push({ x, z, group: g, lid, star });
  }

  // ---- ground rules ------------------------------------------------------------------------
  const inForest = (x, z) => Math.hypot(x - C.x, z - C.z) < C.r - 0.8;
  const onRoad = (x, z) => Math.abs(x) < ROAD_HALF && z > parkR - 2 && z < gateZ + 3;
  return {
    segs,
    lands,
    /** the 빼빼로 찾기 boxes, by number: { x, z, group, lid, star } */
    chests,
    /** Where my bird comes down when it flies over from the park. */
    arrival: new THREE.Vector3(0, 0, gateZ + 3.5),
    /** Where it comes down back in the park. */
    home: new THREE.Vector3(0, 0, parkR - 4),
    walkable: (x, z) => inForest(x, z) || onRoad(x, z),
    /** Candidate spots to stand when you are off the ground you may walk on. */
    nearest(x, z) {
      const out = [];
      const d = Math.hypot(x - C.x, z - C.z) || 1, k = (C.r - 0.85) / d;
      out.push([C.x + (x - C.x) * Math.min(1, k), C.z + (z - C.z) * Math.min(1, k)]);
      out.push([THREE.MathUtils.clamp(x, -ROAD_HALF + 0.05, ROAD_HALF - 0.05), THREE.MathUtils.clamp(z, parkR - 1.9, gateZ + 2.9)]);
      return out;
    },
    /** 'pepero' once you are past the middle of the road. */
    zoneOf: (p) => (p.z > (parkR + gateZ) / 2 ? 'pepero' : 'park'),
    /** A free perch for a resident bird that wants to visit (anywhere in the forest). */
    spot() {
      const s = segs[Math.floor(Math.random() * segs.length)];
      return { p: s.a.clone().lerp(s.b, 0.2 + Math.random() * 0.6), surface: 'branch' };
    },
    flyLimit: C.z + C.r + 4,
  };
}
