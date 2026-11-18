// 수능 응원 파크: an event space next to the park (north, up the ginkgo avenue and along a cream road)
// for the days around 수능. A school gate with 엿 stuck on it and a cheering banner, giant pencils for
// trees, a pencil cup in the middle, bunting, stacks of books, and a running track round the plaza.
// Birds sit on pencil tips, on pencils laid across, on books, on the cup's rim and on the gate.
// Ten treasure boxes on the track hold 응원 별 (the server decides who opens one first).
//
// Open from three days before 수능 to a week after (Korea time), or with ?cheer=1 to try it (?cheer=0 hides it).
import * as THREE from 'three';
import { mat } from './scene.js';
import { tr } from '../i18n';

export const CHEER = { x: 0, z: 86, r: 21 };
const ROAD_HALF = 1.4;
// 2027학년도 수능: 2026년 11월 19일(목)
const EXAM = Date.UTC(2026, 10, 19);
const OPEN_BEFORE = 3, OPEN_AFTER = 7; // days

/** Days from today (Korea time) to 수능: 1 the day before, 0 on the day, negative after. */
export function examDays() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return Math.round((EXAM - Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate())) / 86400000);
}

export function cheerOpen() {
  const q = new URLSearchParams(window.location.search).get('cheer');
  if (q === '1') return true;
  if (q === '0') return false;
  const d = examDays();
  return d <= OPEN_BEFORE && d >= -OPEN_AFTER;
}

/** The line under the park's name: a countdown, the day itself, then thanks. */
export function examLine() {
  const d = examDays();
  if (d > 0) return tr(`수능 D-${d}! 힘내세요`, `${d} day${d > 1 ? 's' : ''} to go. You got this!`);
  if (d === 0) return tr('오늘 수능! 모두 힘내요', 'Exam day! Do your best');
  return tr('수험생 여러분, 수고했어요!', 'Well done, everyone!');
}

const PENCILS = ['#F4C542', '#F4C542', '#F4C542', '#F28DA8', '#8FD3C1', '#8DB8EE', '#C9A2E8', '#F6A65B'];
const BOOKS = ['#D9534F', '#3E7CB1', '#5BAA6A', '#F0B429', '#8E6CC2', '#2F4858', '#E8743B'];
const FLAGS = ['#E84A5F', '#F6C744', '#4FB0C6', '#7BC96F', '#F28DA8', '#FFFFFF', '#8E7CE0'];
const UP = new THREE.Vector3(0, 1, 0);

/** A canvas texture with lines of text, for the signs and the banner. */
function textTexture(lines, { w = 512, h = 256, bg = '#FFF6EA', fg = '#3A2A1E', border = '#3A2A1E' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach(([text, size, color], i) => {
    g.font = `bold ${size}px sans-serif`;
    if (color) g.fillStyle = color;
    g.fillText(text, w / 2, (h * (i + 0.5)) / n + (n > 1 && i === 0 ? 6 : 0), w - 40);
    g.fillStyle = fg;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/**
 * Builds the place into the scene and returns its ground rules and places.
 * ctx: { rnd, perchSegs, obstacles, occludeSpheres, parkR, snowy, night, small, tint, snow }
 */
export function buildCheer(scene, ctx) {
  const { rnd, perchSegs, obstacles, occludeSpheres, parkR, snowy, night, small, tint, snow } = ctx;
  const C = CHEER;
  const gateZ = C.z - C.r + 1.5;
  const pencils = []; // standing: { base, dir, len, r, color, segs }
  const lying = []; // laid across: { a, b, r, color }
  const stacks = [];
  const segs = []; // every perch here
  const lands = []; // [geometry, position, (point) => spot]
  const snowy2 = (hex, k = 0.5) => (snowy ? tint(hex, snow, k) : hex);
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

  /** A pencil standing on its eraser, point up (leaning a little); a bird can sit on the point. */
  function pencil(x, z, len, r, lean = 0, leanA = 0, color = null, y0 = 0) {
    const dir = new THREE.Vector3(Math.cos(leanA) * Math.sin(lean), Math.cos(lean), Math.sin(leanA) * Math.sin(lean)).normalize();
    const p = { base: new THREE.Vector3(x, y0, z), dir, len, r, color: color || PENCILS[Math.floor(rnd() * PENCILS.length)], segs: [] };
    pencils.push(p);
    const top = p.base.clone().addScaledVector(dir, len * 0.985);
    const side = new THREE.Vector3(-dir.z || 1, 0, dir.x).normalize().multiplyScalar(Math.min(0.2, r * 0.6));
    const lift = new THREE.Vector3(0, 0.03, 0);
    addSeg(top.clone().add(side).add(lift), top.clone().sub(side).add(lift), p);
    obstacles.push({ x, z, r: r + 0.12, h: top.y });
    return p;
  }
  /** Where a pencil's middle line is at height y. */
  const along = (p, y) => p.base.clone().addScaledVector(p.dir, (y - p.base.y) / p.dir.y);
  /** A pencil laid across from A to B: a branch to sit on. */
  function lay(A, B, r, owner) {
    lying.push({ a: A, b: B, r, color: PENCILS[Math.floor(rnd() * PENCILS.length)] });
    const lift = new THREE.Vector3(0, r * 0.95 + 0.03, 0);
    addSeg(A.clone().lerp(B, 0.1).add(lift), A.clone().lerp(B, 0.85).add(lift), owner);
  }

  // ---- ground: a sandy school field, a cream road from the park, and a running track round the plaza ----
  const ground = new THREE.Mesh(new THREE.CircleGeometry(C.r + 3, 48), mat(snowy2(night ? '#6E5D47' : '#D8BE93', 0.6)));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(C.x, -0.02, C.z);
  ground.receiveShadow = true;
  scene.add(ground);
  const cream = mat(snowy2(night ? '#B8A68C' : '#F6E7CC'));
  const flat = (geo, m, x, z, y = 0.012) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const roadFrom = parkR - 1.5, roadTo = gateZ + 1;
  flat(new THREE.PlaneGeometry(ROAD_HALF * 2, roadTo - roadFrom), cream, 0, (roadFrom + roadTo) / 2, 0.013);
  flat(new THREE.CircleGeometry(5.2, 36), cream, C.x, C.z);
  flat(new THREE.RingGeometry(10.2, 11.6, 64), mat(snowy2(night ? '#7A4436' : '#C8634B', 0.4)), C.x, C.z);
  const chalk = mat(snowy2('#F7F3EA', 0.2));
  [10.68, 11.12].forEach((rr) => flat(new THREE.RingGeometry(rr - 0.03, rr + 0.03, 72), chalk, C.x, C.z, 0.016));
  flat(new THREE.PlaneGeometry(ROAD_HALF * 2, C.r - 11), cream, 0, C.z - 11 - (C.r - 11) / 2 + 0.6, 0.013);

  // little pencils along the road like fence posts; each point is a perch
  for (let z = roadFrom + 3; z < roadTo - 1.5; z += 3.3) [-1, 1].forEach((s, k) => pencil(s * (ROAD_HALF + 0.55), z, 1.2 + ((z * 7 + k) % 3) * 0.15, 0.1));

  // ---- the gate: two stone pillars with 엿 stuck on them for luck, a banner, a beam on top -------------
  const stone = mat(snowy2('#CFC8BC', 0.3)), stoneTop = mat(snowy2('#A79F92', 0.5));
  const gate = { segs: [] };
  const yeot = [];
  [-1, 1].forEach((s) => {
    const x = s * 2.6;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.6, 0.8), stone);
    pillar.position.set(x, 1.8, gateZ);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 1.0), stoneTop);
    cap.position.set(x, 3.69, gateZ);
    cap.castShadow = true;
    scene.add(cap);
    addSeg(new THREE.Vector3(x - 0.3, 3.8, gateZ), new THREE.Vector3(x + 0.3, 3.8, gateZ), gate);
    obstacles.push({ x, z: gateZ, r: 0.6, h: 3.8 });
    // 엿 stuck on the side you walk up to, every which way
    for (let k = 0; k < 7; k++) yeot.push({ x: x + (rnd() - 0.5) * 0.55, y: 0.9 + rnd() * 2.3, z: gateZ - 0.42, rz: (rnd() - 0.5) * 1.6 });
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 0.16), mat('#8B5E3C'));
  beam.position.set(0, 3.55, gateZ);
  scene.add(beam);
  addSeg(new THREE.Vector3(-2.1, 3.66, gateZ), new THREE.Vector3(2.1, 3.66, gateZ), gate);
  const bannerTex = textTexture([[tr('수험생 여러분 힘내세요!', 'Good luck on the exam!'), 92, '#C62F3C']], { w: 1024, h: 200, bg: '#FFFDF6', border: '#C62F3C' });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 0.84), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.9, side: THREE.DoubleSide }));
  banner.position.set(0, 2.98, gateZ - 0.1);
  banner.rotation.y = Math.PI;
  scene.add(banner);
  {
    const geo = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 6);
    const m = new THREE.InstancedMesh(geo, mat('#C98A3A'), yeot.length);
    const d = new THREE.Object3D();
    yeot.forEach((y, i) => {
      d.position.set(y.x, y.y, y.z);
      d.rotation.set(0, 0, y.rz);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    scene.add(m);
  }

  // ---- the pencil cup in the middle: giant pencils standing in it, small ones poking out to sit on ----
  const cup = { segs: [] };
  const CUP_R = 2.1, CUP_H = 3.2;
  const cupM = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.92, CUP_H, 28, 1, true), new THREE.MeshStandardMaterial({ color: snowy2('#4F7CC9', 0.2), roughness: 0.7, side: THREE.DoubleSide }));
  cupM.position.set(C.x, CUP_H / 2, C.z);
  cupM.castShadow = true;
  cupM.receiveShadow = true;
  scene.add(cupM);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R * 0.985 + 0.02, CUP_R * 0.965 + 0.02, 0.5, 28, 1, true), mat('#FFFFFF'));
  stripe.position.set(C.x, CUP_H * 0.55, C.z);
  scene.add(stripe);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP_R, 0.08, 6, 36), mat('#FFFFFF'));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(C.x, CUP_H, C.z);
  scene.add(rim);
  for (let k = 0; k < 10; k++) {
    const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 0.8) / 10) * Math.PI * 2;
    addSeg(new THREE.Vector3(C.x + Math.cos(a0) * CUP_R, CUP_H + 0.08, C.z + Math.sin(a0) * CUP_R), new THREE.Vector3(C.x + Math.cos(a1) * CUP_R, CUP_H + 0.08, C.z + Math.sin(a1) * CUP_R), cup);
  }
  obstacles.push({ x: C.x, z: C.z, r: CUP_R + 0.2, h: CUP_H });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const p = k === 6
      ? pencil(C.x, C.z, 10.6, 0.48, 0, 0, PENCILS[0], 0.3)
      : pencil(C.x + Math.cos(a) * 1.05, C.z + Math.sin(a) * 1.05, 8.6 + (k % 3) * 0.6, 0.42, 0.11, a, PENCILS[(k * 3) % PENCILS.length], 0.3);
    cup.segs.push(...p.segs);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * 2.35 + 0.4, y = CUP_H + 0.6 + i * 0.62, L = 2.9 - i * 0.07;
    lay(new THREE.Vector3(C.x + Math.cos(a) * 1.15, y, C.z + Math.sin(a) * 1.15), new THREE.Vector3(C.x + Math.cos(a) * L, y + 0.3, C.z + Math.sin(a) * L), 0.12, cup);
  }

  // ---- bunting: poles round the plaza, strings of little flags to the cup and between the poles -------
  const POLE_R = 6.4, POLES = 8, POLE_H = 4.2;
  const poles = [];
  const poleMat = mat('#F7F3EA');
  for (let k = 0; k < POLES; k++) {
    const a = (k / POLES) * Math.PI * 2 + Math.PI / POLES;
    const x = C.x + Math.cos(a) * POLE_R, z = C.z + Math.sin(a) * POLE_R;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, POLE_H, 6), poleMat);
    pole.position.set(x, POLE_H / 2, z);
    pole.castShadow = true;
    scene.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(FLAGS[k % FLAGS.length]));
    knob.position.set(x, POLE_H + 0.05, z);
    scene.add(knob);
    const own = { segs: [] };
    addSeg(new THREE.Vector3(x - 0.15, POLE_H + 0.16, z), new THREE.Vector3(x + 0.15, POLE_H + 0.16, z), own);
    obstacles.push({ x, z, r: 0.25, h: POLE_H });
    poles.push({ x, z, a, own });
  }
  {
    const strings = [];
    poles.forEach((p, k) => {
      const q = poles[(k + 1) % POLES];
      strings.push([new THREE.Vector3(p.x, POLE_H - 0.1, p.z), new THREE.Vector3(q.x, POLE_H - 0.1, q.z), 0.5]);
      strings.push([new THREE.Vector3(C.x + Math.cos(p.a) * 0.9, 8.4, C.z + Math.sin(p.a) * 0.9), new THREE.Vector3(p.x, POLE_H - 0.05, p.z), 0.6]);
    });
    const pts = [], flags = [];
    strings.forEach(([A, B, sag]) => {
      const n = Math.max(4, Math.round(A.distanceTo(B) / 0.55));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = A.clone().lerp(B, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        if (prev) pts.push(prev, p);
        if (i > 0 && i < n) flags.push({ p, dir: B.clone().sub(A).setY(0).normalize() });
        prev = p;
      }
    });
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a7b6a }));
    scene.add(line);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.34, 0], 3));
    tri.computeVertexNormals();
    const fm = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), flags.length);
    const d = new THREE.Object3D(), col = new THREE.Color();
    flags.forEach((f, i) => {
      d.position.copy(f.p);
      d.rotation.set(0, Math.atan2(-f.dir.z, f.dir.x), 0);
      d.updateMatrix();
      fm.setMatrixAt(i, d.matrix);
      fm.setColorAt(i, col.set(FLAGS[i % FLAGS.length]).convertSRGBToLinear());
    });
    scene.add(fm);
  }

  // ---- the pencil woods ---------------------------------------------------------------------
  const keepOut = (x, z) => Math.hypot(x - C.x, z - C.z) < 7.2
    || (Math.abs(x) < 3.4 && z < C.z - 9) // the way in from the gate
    || Math.abs(Math.hypot(x - C.x, z - C.z) - 10.9) < 1.3; // the track
  const want = small ? 40 : 56;
  const woods = [];
  for (let tries = 0; woods.length < want && tries < 3000; tries++) {
    const a = rnd() * Math.PI * 2, rr = 7.4 + Math.sqrt(rnd()) * (C.r - 8.6);
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    if (keepOut(x, z) || woods.some((s) => Math.hypot(s.base.x - x, s.base.z - z) < 2.2)) continue;
    const len = 4 + rnd() * 5.5 + (rr > 14 ? 1.2 : 0);
    woods.push(pencil(x, z, Math.min(len, 10.6), 0.2 + len * 0.026, rnd() * 0.15, rnd() * Math.PI * 2));
  }
  // the camera keeps out of the big pencils (a chain of spheres up each one, like the park's tree crowns)
  woods.forEach((p) => {
    for (let t = 0.6; t < p.len; t += 0.9) {
      const q = p.base.clone().addScaledVector(p.dir, t);
      occludeSpheres.push({ x: q.x, y: q.y, z: q.z, r: p.r + 0.3 });
    }
  });
  // pencils laid across between neighbours, at different heights: the woods' branches
  let laid = 0;
  const joined = new Set();
  woods.forEach((s, i) => {
    if (laid >= (small ? 14 : 22)) return;
    let best = -1, bd = Infinity;
    woods.forEach((o, j) => {
      if (j === i || joined.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) return;
      const d = Math.hypot(o.base.x - s.base.x, o.base.z - s.base.z);
      if (d > 2.3 && d < 4.4 && d < bd) { bd = d; best = j; }
    });
    if (best < 0) return;
    const o = woods[best];
    joined.add(`${Math.min(i, best)}-${Math.max(i, best)}`);
    const y = Math.min(s.len * s.dir.y, o.len * o.dir.y) * (0.35 + rnd() * 0.35);
    const own = { segs: [] };
    lay(along(s, y), along(o, y + (rnd() - 0.5) * 0.4), 0.13, own);
    s.segs.push(...own.segs);
    o.segs.push(...own.segs);
    laid++;
  });

  // stacks of books; the top cover is a perch
  for (let i = 0, tries = 0; i < 9 && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, rr = 7.6 + rnd() * (C.r - 9);
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    if (keepOut(x, z) || pencils.some((s) => Math.hypot(s.base.x - x, s.base.z - z) < 2.0) || stacks.some((b) => Math.hypot(b.x - x, b.z - z) < 3)) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ry = rnd() * Math.PI;
    g.rotation.y = ry;
    const n = 2 + Math.floor(rnd() * 3);
    let y = 0, w = 1.4, dpt = 1.0;
    const pages = mat('#FBF5E6');
    for (let k = 0; k < n; k++) {
      const bw = w - k * 0.08 - rnd() * 0.1, bd = dpt - k * 0.05, bh = 0.2 + rnd() * 0.1;
      const book = new THREE.Group();
      book.position.y = y + bh / 2;
      book.rotation.y = (rnd() - 0.5) * 0.4;
      const cover = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat(BOOKS[Math.floor(rnd() * BOOKS.length)]));
      cover.castShadow = true;
      cover.receiveShadow = true;
      const pg = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.97, bh * 0.72, bd * 0.94), pages);
      pg.position.x = bw * 0.03;
      book.add(cover, pg);
      g.add(book);
      y += bh;
    }
    scene.add(g);
    const own = { x, z, s: 1.3, h: y, segs: [] };
    const ux = Math.cos(ry) * 0.4, uz = -Math.sin(ry) * 0.4;
    addSeg(new THREE.Vector3(x - ux, y + 0.02, z - uz), new THREE.Vector3(x + ux, y + 0.02, z + uz), own);
    stacks.push(own);
    obstacles.push({ x, z, r: 0.85, h: y });
    i++;
  }

  // ---- draw every pencil instanced: eraser, metal band, painted body, sharpened wood, lead ----------
  {
    const all = [
      ...pencils.map((p) => ({ a: p.base, b: p.base.clone().addScaledVector(p.dir, p.len), r: p.r, color: p.color })),
      ...lying,
    ];
    const n = all.length;
    const meshes = {
      eraser: new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), mat('#F29BB0'), n),
      band: new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: '#C9CED6', roughness: 0.35, metalness: 0.5, flatShading: true }), n),
      body: new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true }), n),
      wood: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 1, 1, 6), mat('#F2D2A2'), n),
      lead: new THREE.InstancedMesh(new THREE.CylinderGeometry(0, 1, 1, 6), mat('#3B3B3B'), n),
    };
    const d = new THREE.Object3D(), col = new THREE.Color(), dir = new THREE.Vector3();
    const put = (mesh, i, s, from, to, rx, rz = rx) => {
      d.position.copy(s.a).addScaledVector(dir, (from + to) / 2);
      d.scale.set(rx, to - from, rz);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    };
    all.forEach((s, i) => {
      dir.subVectors(s.b, s.a);
      const L = dir.length();
      dir.normalize();
      d.quaternion.setFromUnitVectors(UP, dir);
      put(meshes.eraser, i, s, 0, L * 0.06, s.r * 0.98);
      put(meshes.band, i, s, L * 0.06, L * 0.11, s.r * 1.04);
      put(meshes.body, i, s, L * 0.11, L * 0.84, s.r);
      put(meshes.wood, i, s, L * 0.84, L * 0.96, s.r * 0.97);
      d.position.copy(s.a).addScaledVector(dir, L * 0.98);
      d.scale.set(s.r * 0.3, L * 0.04, s.r * 0.3);
      d.updateMatrix();
      meshes.lead.setMatrixAt(i, d.matrix);
      meshes.body.setColorAt(i, col.set(snowy2(s.color, 0.12)).convertSRGBToLinear());
    });
    Object.values(meshes).forEach((m) => { m.castShadow = true; scene.add(m); });

    // confetti on the ground
    const nS = small ? 500 : 900;
    const conf = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), nS);
    for (let i = 0; i < nS; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (C.r + 1);
      d.position.set(C.x + Math.cos(a) * rr, 0.02, C.z + Math.sin(a) * rr);
      d.quaternion.identity();
      d.rotation.set(0, rnd() * Math.PI, 0);
      d.scale.setScalar(0.8 + rnd() * 0.6);
      d.updateMatrix();
      conf.setMatrixAt(i, d.matrix);
      conf.setColorAt(i, col.set(FLAGS[i % FLAGS.length]).convertSRGBToLinear());
    }
    scene.add(conf);
    // lights strung under the gate beam (they glow at night)
    const bulb = new THREE.MeshBasicMaterial({ color: night ? 0xffe6a0 : 0xfff3d6 });
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), bulb);
      m.position.set(-2.1 + k * 0.525, 3.42 - Math.sin((k / 8) * Math.PI) * 0.12, gateZ - 0.12);
      scene.add(m);
    }
  }

  // ---- signs ------------------------------------------------------------------------------
  function sign(x, z, ry, lines, w = 2.4, hgt = 1.3) {
    const tex = textTexture(lines, { w: 512, h: Math.round(512 * (hgt / w)) });
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
  sign(4.5, gateZ - 0.6, Math.PI, [[tr('수능 응원 파크', 'Exam Cheer Park'), 76], [examLine(), 40, '#C62F3C']], 2.8, 1.6);
  sign(2.7, parkR + 2.2, Math.PI, [[tr('수능 응원 파크 가는 길', 'To the Exam Cheer Park'), 40], [tr('11월 19일 수능, 함께 응원해요', 'Cheer for the Nov 19 exam'), 32]], 2.4, 1.0);

  // ---- tap targets: tap a pencil, a stack of books, a pole or the cup to sit on it -------------------
  const onSegs = (list) => (pt) => nearestOn(list, pt);
  lands.push([new THREE.CylinderGeometry(3.2, 3.2, 10.5, 12), new THREE.Vector3(C.x, 5.6, C.z), onSegs(cup.segs)]);
  woods.forEach((s) => {
    const h = s.len * s.dir.y;
    const mid = along(s, h / 2);
    lands.push([new THREE.CylinderGeometry(s.r + 0.7, s.r + 0.7, h, 8), new THREE.Vector3(mid.x, h / 2 + 0.3, mid.z), onSegs(s.segs)]);
  });
  stacks.forEach((b) => lands.push([new THREE.BoxGeometry(1.6, b.h + 0.3, 1.6), new THREE.Vector3(b.x, b.h / 2, b.z), onSegs(b.segs)]));
  poles.forEach((p) => lands.push([new THREE.CylinderGeometry(0.6, 0.6, POLE_H, 6), new THREE.Vector3(p.x, POLE_H / 2 + 0.2, p.z), onSegs(p.own.segs)]));
  lands.push([new THREE.BoxGeometry(6.2, 1.2, 1.4), new THREE.Vector3(0, 3.6, gateZ), onSegs(gate.segs)]);

  // ---- treasure boxes for 응원 별 찾기: the same ten spots on every screen (the server knows them only by
  // number, realtime park/Channel.BOXES). They sit on the track, which the pencils keep clear of on every
  // device (small screens grow fewer pencils), so the spots never depend on the woods' layout.
  const chests = [];
  const LID = ['#E84A5F', '#4FB0C6', '#F6C744', '#7BC96F', '#8E7CE0'];
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
  const inside = (x, z) => Math.hypot(x - C.x, z - C.z) < C.r - 0.8;
  const onRoad = (x, z) => Math.abs(x) < ROAD_HALF && z > parkR - 2 && z < gateZ + 3;
  return {
    segs,
    lands,
    /** the 응원 별 boxes, by number: { x, z, group, lid, star } */
    chests,
    /** Where my bird comes down when it flies over from the park. */
    arrival: new THREE.Vector3(0, 0, gateZ + 3.5),
    /** Where it comes down back in the park. */
    home: new THREE.Vector3(0, 0, parkR - 4),
    walkable: (x, z) => inside(x, z) || onRoad(x, z),
    /** Candidate spots to stand when you are off the ground you may walk on. */
    nearest(x, z) {
      const out = [];
      const d = Math.hypot(x - C.x, z - C.z) || 1, k = (C.r - 0.85) / d;
      out.push([C.x + (x - C.x) * Math.min(1, k), C.z + (z - C.z) * Math.min(1, k)]);
      out.push([THREE.MathUtils.clamp(x, -ROAD_HALF + 0.05, ROAD_HALF - 0.05), THREE.MathUtils.clamp(z, parkR - 1.9, gateZ + 2.9)]);
      return out;
    },
    /** 'cheer' once you are past the middle of the road. */
    zoneOf: (p) => (p.z > (parkR + gateZ) / 2 ? 'cheer' : 'park'),
    /** A free perch for a resident bird that wants to visit. */
    spot() {
      const s = segs[Math.floor(Math.random() * segs.length)];
      return { p: s.a.clone().lerp(s.b, 0.2 + Math.random() * 0.6), surface: 'branch' };
    },
    flyLimit: C.z + C.r + 4,
  };
}
