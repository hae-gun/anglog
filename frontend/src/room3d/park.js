// The park: 짹로그's town square. Neighbours' birdhouses stand around it, their birds hang out
// outside (tree branch, bird bath, swing, their own door perch), and you walk your bird around
// and pop into a house through its round door.
// Residents are the real registered birds, moved by a little AI, so the park is never empty
// even when nobody else is online.
import * as THREE from 'three';
import { playCall } from '../lib/sound';
import { makeBird, toLinear } from './bird.js';
import { disposeScene, mat, rod, skyNow } from './scene.js';

const PW = 30;
const PD = 24;
const C = new THREE.Vector3(15, 0, 12);
const SLOTS = 12;
const FACE = Math.PI / 4; // every house faces the camera so its door shows
const MAX_RESIDENTS = 8;
const clamp = THREE.MathUtils.clamp;

const CHIRPS = ['짹짹!', '짹!', '삐요', '짹짹짹'];
const REPLIES = ['짹!', '삐약', '누구야?', '반가워!', '짹짹', '안녕!'];
const HELLO = ['안녕!', '처음 보는 얼굴이네', '짹! 같이 놀자', '우리 집 놀러 와'];
const PLAY_LINES = ['신난다!', '한 번 더!', '짹짹짹!', '같이 춤추자'];

const angleTo = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
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
function tint(hex, toward, k) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color(toward), k).getHexString();
}

/** Slot 0 is front and centre, then alternating left and right around the ring. */
function slotPos(i) {
  const step = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
  const a = Math.PI / 4 + (step / SLOTS) * Math.PI * 2;
  return new THREE.Vector3(C.x + Math.cos(a) * 10.6, 0, C.z + Math.sin(a) * 8.2);
}

/**
 * cards: RoomCard-like { owner, parrots, postedToday, mine? } in slot order (mine first if any).
 * visitor: { name, colors, species }.
 * Callbacks: onEnter(handle), onBirdTap({ handle, nickname, birdName }), onEmptyLot().
 * startAt: a handle to come out of (back from that house), or null to fly in.
 * Returns { chirp(), playTogether(): name|null, enter(handle): boolean, dispose() }.
 * @param {HTMLElement} container
 * @param {any[]} cards
 * @param {{ visitor: any, startAt?: string | null, onEnter?: (h: string) => void, onBirdTap?: (who: any) => void, onEmptyLot?: () => void }} opts
 */
export function mountPark(container, cards, { visitor, startAt = null, onEnter, onBirdTap, onEmptyLot } = {}) {
  const env = skyNow();
  const scene = new THREE.Scene();
  const small = window.innerWidth < 720;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(env.night ? '#1B2036' : tint(env.sky, '#FFFFFF', 0.35));
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

  // ---- light -------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fae7a, env.night ? 0.4 : 0.8));
  const sun = new THREE.DirectionalLight(env.night ? 0x9fb4ff : 0xfff1d6, env.night ? 0.5 : env.light);
  sun.position.set(C.x + 8, 18, C.z - 8);
  sun.target.position.copy(C);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 60 });
  scene.add(sun, sun.target);

  // ---- ground, path, decor -------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.4, PD), mat(env.night ? '#6E8F67' : '#B3D69A'));
  ground.position.set(PW / 2, -0.2, PD / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  // meadow beyond the park so the camera never looks into the void
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat(env.night ? '#55704F' : '#9CC783'));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(PW / 2, -0.03, PD / 2);
  scene.add(meadow);
  const pathMat = mat(env.night ? '#A99C84' : '#EAD9B5');
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.0, 7.3, 48), pathMat);
  ring.rotation.x = -Math.PI / 2;
  ring.scale.set(1, 0.8, 1);
  ring.position.set(C.x, 0.01, C.z);
  ring.receiveShadow = true;
  scene.add(ring);
  const entry = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 7), pathMat);
  entry.rotation.x = -Math.PI / 2;
  entry.rotation.z = FACE;
  entry.position.set(C.x + 7.6, 0.012, C.z + 6.4);
  entry.receiveShadow = true;
  scene.add(entry);

  // big tree in the middle, with two branches to sit on
  rod(scene, new THREE.Vector3(C.x, 0, C.z), new THREE.Vector3(C.x, 3.8, C.z), 0.36, '#8A6A4A');
  const BR1 = { y: 2.5, z: C.z, x0: C.x + 0.8, x1: C.x + 2.4 };
  const BR2 = { y: 2.1, x: C.x, z0: C.z + 0.8, z1: C.z + 2.4 };
  rod(scene, new THREE.Vector3(C.x + 0.2, BR1.y, BR1.z), new THREE.Vector3(BR1.x1 + 0.2, BR1.y, BR1.z), 0.08, '#8A6A4A');
  rod(scene, new THREE.Vector3(BR2.x, BR2.y, C.z + 0.2), new THREE.Vector3(BR2.x, BR2.y, BR2.z1 + 0.2), 0.08, '#8A6A4A');
  [[0, 4.6, 0, 1.9, '#6FA35A'], [-1, 4.0, 1, 1.2, '#7DB665'], [1.3, 4.2, -0.7, 1.3, '#62964F']].forEach(([dx, y, dz, r, c]) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(c));
    m.position.set(C.x + dx, y, C.z + dz);
    m.castShadow = true;
    scene.add(m);
  });

  // bird bath
  const BATH = { x: C.x - 3.2, z: C.z + 3.0, r: 0.7, y: 0.84 };
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.7, 10), mat('#D9D4CA'));
  ped.position.set(BATH.x, 0.35, BATH.z);
  ped.castShadow = true;
  scene.add(ped);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 0.2, 16), mat('#E7E2D8'));
  bowl.position.set(BATH.x, 0.76, BATH.z);
  bowl.castShadow = true;
  scene.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), new THREE.MeshStandardMaterial({ color: toLinear('#8CC8E8'), roughness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(BATH.x, 0.865, BATH.z);
  scene.add(water);

  // swing: the seat hangs from a pivot and sways, riders follow it
  const SW = { x: C.x + 3.8, z: C.z - 3.4, top: 2.7, len: 1.55 };
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

  const rnd = mulberry(7);
  // edge trees
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.3;
    const x = clamp(C.x + Math.cos(a) * 14.2, 0.8, PW - 0.8);
    const z = clamp(C.z + Math.sin(a) * 11.4, 0.8, PD - 0.8);
    if (x > C.x + 4 && z > C.z + 4) continue; // keep the front open towards the camera
    rod(scene, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.8, z), 0.14, '#8A6A4A');
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9 + rnd() * 0.3, 2.2 + rnd() * 0.8, 7), mat(i % 2 ? '#5E9150' : '#6FA35A'));
    cone.position.set(x, 1.9, z);
    cone.castShadow = true;
    scene.add(cone);
  }
  // lamps (lit at night)
  const bulbMat = new THREE.MeshBasicMaterial({ color: toLinear(env.night ? '#FFD98A' : '#F3EDE0') });
  [[-8.6, -1.2], [8.6, 1.2], [-1.2, -7.2], [3.2, 6.6]].forEach(([dx, dz]) => {
    rod(scene, new THREE.Vector3(C.x + dx, 0, C.z + dz), new THREE.Vector3(C.x + dx, 2.4, C.z + dz), 0.05, '#4A4038');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bulbMat);
    b.position.set(C.x + dx, 2.55, C.z + dz);
    scene.add(b);
  });

  // ---- houses ------------------------------------------------------------------
  const houses = [];
  const houseHits = [];
  const obstacles = [{ x: C.x, z: C.z, r: 0.8 }, { x: BATH.x, z: BATH.z, r: 1.0 }];
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
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
    const pos = slotPos(i);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = FACE;
    scene.add(g);
    if (!card) {
      // an empty lot waiting for a neighbour
      part(g, new THREE.BoxGeometry(2.0, 0.04, 1.8), mat('#D9C49A'), 0, 0.02, 0);
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
    const wall = mat(tint(body, '#FFF8EC', 0.6));
    const roofC = lead ? lead.colors.head : '#C98A4B';
    part(g, new THREE.BoxGeometry(2.0, 0.25, 1.8), mat('#B98552'), 0, 0.125, 0);
    part(g, new THREE.BoxGeometry(1.8, 1.5, 1.6), wall, 0, 1.0, 0);
    const roof = part(g, roofGeo, mat(tint(roofC, '#5A4030', 0.15)), 0, 1.75, 0);
    roof.castShadow = true;
    part(g, new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: toLinear('#2B2622') }), 0, 1.0, 0.805);
    part(g, new THREE.TorusGeometry(0.36, 0.05, 6, 24), mat(lead ? lead.colors.wing : '#7FAE86'), 0, 1.0, 0.81);
    part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mat('#8A6A4A'), 0, 0.62, 1.03).rotation.x = Math.PI / 2;
    const lit = !!card.postedToday;
    part(g, new THREE.CircleGeometry(0.17, 18), new THREE.MeshBasicMaterial({ color: toLinear(lit ? '#FFD86B' : env.night ? '#2E3A4E' : '#5A6878') }), 0, 2.15, 0.958);
    part(g, new THREE.TorusGeometry(0.18, 0.035, 6, 18), mat('#FFFFFF'), 0, 2.15, 0.96);
    if (card.mine) {
      // a little flag on my own roof
      part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), mat('#4A4038'), 0, 3.05, 0);
      part(g, new THREE.BoxGeometry(0.04, 0.24, 0.4), mat('#F5C842'), 0, 3.25, 0.2);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.0, 2.1), hitMat);
    hit.position.y = 1.5;
    hit.userData = { kind: 'house', index: houses.length };
    g.add(hit);
    houseHits.push(hit);
    g.updateMatrixWorld(true);
    const plate = el(`park-plate${lit ? ' lit' : ''}${card.mine ? ' mine' : ''}`, card.mine ? '내 집' : card.owner.nickname);
    houses.push({
      card,
      handle: card.owner.handle,
      door: g.localToWorld(new THREE.Vector3(0, 1.0, 0.8)),
      perch: g.localToWorld(new THREE.Vector3(0, 0.68, 1.12)),
      front: g.localToWorld(new THREE.Vector3(0, 0, 2.0)),
      top: g.localToWorld(new THREE.Vector3(0, 2.9, 0)),
      plate,
    });
    obstacles.push({ x: pos.x, z: pos.z, r: 1.45 });
  }

  // ---- ground rules ---------------------------------------------------------------
  function groundPoint(x, z) {
    const p = new THREE.Vector3(clamp(x, 0.8, PW - 0.8), 0, clamp(z, 0.8, PD - 0.8));
    obstacles.forEach((o) => {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (d < o.r + 0.35) {
        const k = (o.r + 0.35) / Math.max(d, 0.001);
        p.x = o.x + dx * k;
        p.z = o.z + dz * k;
      }
    });
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

  // ---- actors --------------------------------------------------------------------
  let clock = 0;
  const actors = [];
  function actor(b, name, opts) {
    const a = {
      b, name, pos: b.group.position, move: null, action: null, surface: 'ground', isPlayer: !!opts.isPlayer,
      pitch: opts.pitch ?? 1, house: opts.house ?? null, rotTarget: 0, swingDx: 0,
      nextThink: 2 + Math.random() * 6, nextChirp: 5 + Math.random() * 12,
      tagEl: el(opts.isPlayer ? 'room-tag room-tag-me' : 'room-tag', name),
      bubbleEl: el('room-bubble'), bubbleUntil: 0, scale: 1,
    };
    a.bubbleEl.hidden = true;
    actors.push(a);
    return a;
  }
  const residents = [];
  houses.forEach((h) => {
    if (h.card.mine) return;
    h.card.parrots.slice(0, 2).forEach((p, j) => {
      if (residents.length >= MAX_RESIDENTS) return;
      const b = makeBird(p.colors, p.species);
      scene.add(b.group);
      const r = actor(b, p.name, { house: h, pitch: [0.92, 1.05, 0.86, 1.12, 0.98][residents.length % 5] });
      if (j === 0 && residents.length % 3 === 0) {
        r.pos.copy(h.perch);
        r.surface = 'perch';
      } else {
        r.pos.copy(groundPoint(h.front.x + (Math.random() - 0.5) * 2, h.front.z + (Math.random() - 0.5) * 2));
      }
      r.b.group.rotation.y = r.rotTarget = angleTo(r.pos, C);
      residents.push(r);
    });
  });
  const pb = makeBird(visitor.colors, visitor.species);
  scene.add(pb.group);
  const player = actor(pb, visitor.name, { isPlayer: true });

  function say(a, text, sec = 1.6) {
    a.bubbleEl.textContent = text;
    a.bubbleEl.hidden = false;
    a.bubbleUntil = clock + sec;
  }
  const loudness = (a) => (a.isPlayer ? 0.85 : clamp(1 - a.pos.distanceTo(player.pos) / 10, 0, 0.7));
  const act = (a, name, sec) => { a.action = { name, until: clock + sec }; };

  // ---- movement -------------------------------------------------------------------
  function flyTo(a, to, surface, after) {
    const from = a.pos.clone();
    const d = from.distanceTo(to);
    a.move = { type: 'fly', from, to: to.clone(), t0: clock, dur: 0.35 + d / 6, peak: Math.max(from.y, to.y) + Math.min(2.6, 0.8 + d * 0.15), surface, after };
    a.rotTarget = angleTo(from, to);
  }
  function walkTo(a, to, after) {
    a.move = { type: 'walk', to: to.clone(), surface: 'ground', after };
    a.rotTarget = angleTo(a.pos, to);
  }
  function goTo(a, to, surface, after) {
    if (onGround(a.pos) && to.y < 0.05 && a.pos.distanceTo(to) < 8 && !blocked(a.pos, to)) walkTo(a, to, after);
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
      const dx = m.to.x - a.pos.x, dz = m.to.z - a.pos.z, d = Math.hypot(dx, dz), s = 3 * dt;
      if (d > s) { a.pos.x += (dx / d) * s; a.pos.z += (dz / d) * s; return; }
      a.pos.x = m.to.x;
      a.pos.z = m.to.z;
    }
    a.move = null;
    a.surface = m.surface;
    if (m.after) m.after();
  }

  // spots to hang out
  const branchSpot = () => (Math.random() < 0.5
    ? { p: new THREE.Vector3(BR1.x0 + Math.random() * (BR1.x1 - BR1.x0), BR1.y + 0.07, BR1.z), surface: 'branch' }
    : { p: new THREE.Vector3(BR2.x, BR2.y + 0.07, BR2.z0 + Math.random() * (BR2.z1 - BR2.z0)), surface: 'branch' });
  const bathSpot = (near) => {
    const a = near ? Math.atan2(near.z - BATH.z, near.x - BATH.x) + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
    return { p: new THREE.Vector3(BATH.x + Math.cos(a) * BATH.r, BATH.y, BATH.z + Math.sin(a) * BATH.r), surface: 'bath' };
  };
  const swingRiders = () => actors.filter((a) => a.surface === 'swing' && !a.move);
  function swingSpot() {
    const taken = swingRiders().map((a) => a.swingDx);
    const dx = [-0.45, 0.45, 0].find((x) => !taken.some((t) => Math.abs(t - x) < 0.4));
    if (dx === undefined) return null;
    const p = swing.localToWorld(new THREE.Vector3(dx, -SW.len + 0.04, 0));
    return { p, surface: 'swing', dx };
  }
  function besides(b) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (b.surface === 'branch' || b.surface === 'bath' || b.surface === 'swing' || b.surface === 'perch') {
      if (b.surface === 'bath') return bathSpot(b.pos);
      if (b.surface === 'swing') { const s = swingSpot(); if (s) return s; }
      if (b.surface === 'branch') {
        const nudge = (v0, lo, hi) => {
          const a = clamp(v0 + side * 0.9, lo, hi);
          return Math.abs(a - v0) > 0.5 ? a : clamp(v0 - side * 0.9, lo, hi);
        };
        if (Math.abs(b.pos.y - (BR1.y + 0.07)) < 0.1) return { p: new THREE.Vector3(nudge(b.pos.x, BR1.x0, BR1.x1), b.pos.y, BR1.z), surface: 'branch' };
        return { p: new THREE.Vector3(BR2.x, b.pos.y, nudge(b.pos.z, BR2.z0, BR2.z1)), surface: 'branch' };
      }
    }
    return { p: groundPoint(b.pos.x + side * 1.0, b.pos.z + 0.5), surface: 'ground' };
  }
  function nearestResident() {
    let best = null, bd = Infinity;
    residents.forEach((r) => { const d = r.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = r; } });
    return best;
  }
  function faceEachOther(a, b) {
    a.rotTarget = angleTo(a.pos, b.pos);
    b.rotTarget = angleTo(b.pos, a.pos);
  }

  // ---- resident life ----------------------------------------------------------------
  function think(r) {
    if (r.move || (r.action && r.action.until > clock)) return;
    const x = Math.random();
    const near = r.pos.distanceTo(player.pos);
    let spot = null;
    if (x < 0.14 && near < 9 && !entering) {
      spot = besides(player);
      flyTo(r, spot.p, spot.surface, () => { faceEachOther(r, player); say(r, pick(HELLO)); playCall('chirp', r.pitch, loudness(r)); });
      return;
    }
    if (x < 0.36) spot = branchSpot();
    else if (x < 0.5) spot = bathSpot();
    else if (x < 0.6) spot = swingSpot();
    else if (x < 0.75) spot = { p: r.house.perch.clone(), surface: 'perch' };
    if (!spot) {
      const base = Math.random() < 0.6 ? r.house.front : C;
      spot = { p: groundPoint(base.x + (Math.random() - 0.5) * 5, base.z + (Math.random() - 0.5) * 5), surface: 'ground' };
    }
    if (spot.surface === 'perch' && actors.some((o) => o !== r && o.pos.distanceTo(spot.p) < 0.4)) return;
    goTo(r, spot.p, spot.surface, () => {
      if (spot.surface === 'swing') r.swingDx = spot.dx;
      if (spot.surface === 'bath') { act(r, 'HAPPY', 2.5); r.rotTarget = angleTo(r.pos, new THREE.Vector3(BATH.x, 0, BATH.z)); }
      else if (spot.surface === 'perch') r.rotTarget = FACE - Math.PI / 2; // look out of the door
    });
  }
  function keepApart() {
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i], b = actors[j];
        if (a.move || b.move || a.scale < 1 || b.scale < 1) continue;
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

  // ---- going in and coming out of houses ----------------------------------------------
  let entering = null;
  function enterHouse(h) {
    if (entering && entering.phase !== 'out') return;
    if (entering) { player.scale = 1; player.pos.copy(entering.h.perch); }
    entering = { h, phase: 'approach' };
    player.action = null;
    const toPerch = () => {
      flyTo(player, h.perch, 'perch', () => {
        player.rotTarget = FACE - Math.PI / 2;
        say(player, h.card.mine ? '다녀왔어요!' : '실례합니다!', 1.2);
        playCall('chirp', 1, 0.8);
        setTimeout(() => {
          if (!entering) return;
          entering = { h, phase: 'in', t0: clock };
          player.rotTarget = angleTo(h.door, h.perch) + Math.PI;
        }, 650);
      });
    };
    if (player.pos.distanceTo(h.front) > 0.5 && onGround(player.pos) && player.pos.distanceTo(h.front) < 8 && !blocked(player.pos, h.front)) walkTo(player, h.front, toPerch);
    else toPerch();
  }

  // ---- camera ----------------------------------------------------------------------
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const offset = new THREE.Vector3(16, 13, 16);
  const look = new THREE.Vector3();
  const pan = new THREE.Vector3();
  let w = 1, h = 1;
  function resize() {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = aspect < 1 ? clamp(10.5 / aspect, 12, 20) : Math.max(12, 18 / aspect);
    Object.assign(camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  // look a little past the player towards the middle, so more of the park than the edge shows
  const focus = () => {
    const f = new THREE.Vector3(player.pos.x + (C.x - player.pos.x) * 0.3 + pan.x, 0.8, player.pos.z + (C.z - player.pos.z) * 0.3 + pan.z);
    f.x = clamp(f.x, 5, PW - 5);
    f.z = clamp(f.z, 4, PD - 4);
    return f;
  };
  function stepCamera(dt, snap) {
    if (snap) look.copy(focus());
    else look.lerp(focus(), 1 - Math.exp(-dt * 3.2));
    camera.position.copy(look).add(offset);
    camera.lookAt(look);
  }

  // ---- input: tap to go, drag to look around ---------------------------------------------
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
  land(new THREE.BoxGeometry(BR1.x1 - BR1.x0 + 0.4, 0.7, 0.7), new THREE.Vector3((BR1.x0 + BR1.x1) / 2, BR1.y, BR1.z),
    (pt) => ({ p: new THREE.Vector3(clamp(pt.x, BR1.x0, BR1.x1), BR1.y + 0.07, BR1.z), surface: 'branch' }));
  land(new THREE.BoxGeometry(0.7, 0.7, BR2.z1 - BR2.z0 + 0.4), new THREE.Vector3(BR2.x, BR2.y, (BR2.z0 + BR2.z1) / 2),
    (pt) => ({ p: new THREE.Vector3(BR2.x, BR2.y + 0.07, clamp(pt.z, BR2.z0, BR2.z1)), surface: 'branch' }));
  land(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 12), new THREE.Vector3(BATH.x, 0.7, BATH.z), (pt) => bathSpot(pt));
  land(new THREE.BoxGeometry(2.0, 0.9, 1.4), new THREE.Vector3(SW.x, SW.top - SW.len, SW.z), () => swingSpot());

  function screenToGround(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, p) ? p : null;
  }
  let down = null;
  let dragging = false;
  let lastG = null;
  const onDown = (e) => {
    down = [e.clientX, e.clientY];
    dragging = false;
    lastG = screenToGround(e.clientX, e.clientY);
    renderer.domElement.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!down) return;
    if (!dragging && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) dragging = true;
    if (!dragging) return;
    const g = screenToGround(e.clientX, e.clientY);
    if (g && lastG) {
      pan.x += lastG.x - g.x;
      pan.z += lastG.z - g.z;
      pan.x = clamp(pan.x, -PW, PW);
      pan.z = clamp(pan.z, -PD, PD);
      stepCamera(0, true);
      lastG = screenToGround(e.clientX, e.clientY);
    }
  };
  const onUp = (e) => {
    const wasDrag = dragging;
    down = null;
    dragging = false;
    if (wasDrag || entering) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);

    const birdHit = ray.intersectObjects(residents.map((x) => x.b.group), true)[0];
    if (birdHit) {
      const res = residents.find((x) => { let o = birdHit.object; while (o) { if (o === x.b.group) return true; o = o.parent; } return false; });
      if (res) {
        pan.set(0, 0, 0);
        const spot = besides(res);
        goTo(player, spot.p, spot.surface, () => {
          if (spot.surface === 'swing') player.swingDx = spot.dx;
          faceEachOther(player, res);
          act(res, 'CHIRP', 0.7);
          say(res, pick(HELLO));
          playCall('chirp', res.pitch, loudness(res));
        });
        if (onBirdTap) onBirdTap({ handle: res.house.handle, nickname: res.house.card.owner.nickname, birdName: res.name });
        return;
      }
    }
    const houseHit = ray.intersectObjects(houseHits, false)[0];
    if (houseHit) {
      if (houseHit.object.userData.kind === 'house') {
        pan.set(0, 0, 0);
        enterHouse(houses[houseHit.object.userData.index]);
      } else if (onEmptyLot) onEmptyLot();
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
      const p = screenToGround(e.clientX, e.clientY);
      if (!p) return;
      target = groundPoint(p.x, p.z);
    }
    pan.set(0, 0, 0);
    player.action = null;
    goTo(player, target, surface, () => {
      if (surface === 'swing') { player.swingDx = dx; say(player, '흔들흔들', 1.2); }
      if (surface === 'bath') { act(player, 'HAPPY', 2.5); say(player, '첨벙첨벙', 1.4); }
    });
    marker.position.set(target.x, target.y + 0.03, target.z);
    markerT = clock;
  };
  const onCancel = () => { down = null; dragging = false; };
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onCancel);

  // ---- start: come out of the house we were in, or fly in from the entrance -------------
  const from = startAt ? houses.find((x) => x.handle === startAt) : null;
  if (from) {
    player.pos.copy(from.perch);
    player.surface = 'perch';
    player.scale = 0.01;
    player.rotTarget = player.b.group.rotation.y = FACE - Math.PI / 2;
    entering = { h: from, phase: 'out', t0: 0 };
  } else {
    player.pos.set(C.x + 11, 4.5, C.z + 10);
    flyTo(player, groundPoint(C.x + 6.4, C.z + 5.4), 'ground', () => { say(player, '공원이다!', 1.6); playCall('chirp', 1, 0.8); });
  }
  stepCamera(0, true);

  // ---- loop ----------------------------------------------------------------------------
  const v = new THREE.Vector3();
  function place(e, pos, lift) {
    v.copy(pos);
    v.y += lift;
    v.project(camera);
    const off = v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15;
    e.style.visibility = off ? 'hidden' : 'visible';
    e.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  let raf = 0;
  let swingAmp = 0.1;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    // swing
    const riders = swingRiders();
    swingAmp += ((riders.length ? 0.35 : 0.08) - swingAmp) * (1 - Math.exp(-dt * 0.8));
    swing.rotation.x = reduce ? 0 : Math.sin(clock * 1.7) * swingAmp;
    swing.updateMatrixWorld(true);
    riders.forEach((a) => a.pos.copy(swing.localToWorld(v.set(a.swingDx, -SW.len + 0.04, 0))));

    // door in and out
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
        flyTo(player, h0.front, 'ground', () => { say(player, h0.card.mine ? '다시 공원으로!' : '재밌었다!', 1.4); playCall('chirp', 1, 0.7); });
      }
    }

    actors.forEach((a) => {
      stepMove(a, dt);
      let mode;
      if (a.move) mode = a.move.type === 'fly' ? 'FLY' : 'WALK';
      else if (a.action && a.action.until > clock) mode = a.action.name;
      else mode = a.isPlayer ? 'idle' : a.surface === 'branch' || a.surface === 'perch' ? 'CALM' : 'idle';
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
    stepCamera(dt, false);
    marker.material.opacity = Math.max(0, 0.8 - (clock - markerT) * 1.4);
    marker.scale.setScalar(1 + (clock - markerT) * 0.8);
    renderer.render(scene, camera);

    houses.forEach((hh) => place(hh.plate, hh.top, 0.2));
    actors.forEach((a) => {
      const show = a.isPlayer || a.pos.distanceTo(player.pos) < 4 || a.bubbleUntil > clock;
      a.tagEl.hidden = !show || a.scale < 0.5;
      if (show) place(a.tagEl, a.pos, 1.4);
      if (!a.bubbleEl.hidden) place(a.bubbleEl, a.pos, 1.4);
    });
  }
  raf = requestAnimationFrame(frame);

  // ---- what the page can call --------------------------------------------------------------
  return {
    chirp() {
      if (entering) return;
      act(player, 'CHIRP', 0.7);
      say(player, pick(CHIRPS), 1.2);
      playCall('chirp', 1, 0.85);
      residents.forEach((r) => {
        if (r.pos.distanceTo(player.pos) > 6) return;
        setTimeout(() => {
          act(r, 'CHIRP', 0.7);
          say(r, pick(REPLIES));
          playCall('chirp', r.pitch, loudness(r));
          if (!r.move) r.rotTarget = angleTo(r.pos, player.pos);
        }, 350 + Math.random() * 700);
      });
    },
    /** Dance with the nearest bird; returns its name, or null when the park is empty. */
    playTogether() {
      if (entering) return null;
      const r = nearestResident();
      if (!r) return null;
      player.move = null;
      const go = () => {
        faceEachOther(player, r);
        act(player, 'DANCE', 2.4);
        act(r, 'DANCE', 2.4);
        say(r, pick(PLAY_LINES), 2);
        playCall('call', r.pitch, loudness(r));
        setTimeout(() => playCall('chirp', 1, 0.8), 500);
      };
      if (r.pos.distanceTo(player.pos) < 1.6 && Math.abs(r.pos.y - player.pos.y) < 0.4) go();
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
      pan.set(0, 0, 0);
      enterHouse(hh);
      return true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onCancel);
      disposeScene(scene);
      renderer.dispose();
      cv.remove();
      labels.remove();
    },
  };
}
