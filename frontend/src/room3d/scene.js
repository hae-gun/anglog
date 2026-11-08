// Builds the room diorama shared by the profile view and the play mode.
// Objects come from the diary data: frames = photo diaries, scale = latest weight,
// shelf = badges, floor feathers = visitors, birds = the owner's parrots.
import * as THREE from 'three';
import { makeBird, toLinear, UP } from './bird.js';

export const W = 12;
export const D = 9;
export const PERCH = { y: 1.9, z: 0.9, x0: 5.8, x1: 10.4 };

export function mat(hex) {
  return new THREE.MeshStandardMaterial({ color: toLinear(hex), roughness: 0.85, flatShading: true });
}
export function box(scene, x0, y0, z0, x1, y1, z1, hex, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(hex));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = cast;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
export function rod(scene, a, b, r, hex) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat(hex));
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  m.castShadow = true;
  scene.add(m);
  return m;
}

/** Sky through the window, following the time of day in Korea. */
export function skyNow() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })) % 24;
  if (h >= 7 && h < 17) return { sky: '#9CD4F2', light: 1.25, night: false, clear: '#EFE6D6' };
  if (h >= 17 && h < 19) return { sky: '#F4A97A', light: 0.95, night: false, clear: '#EAD6C4' };
  if (h >= 5 && h < 7) return { sky: '#C9B8D8', light: 0.9, night: false, clear: '#E6DEE6' };
  return { sky: '#1B2547', light: 0.45, night: true, clear: '#1B2036' };
}

const BADGE_LOOK = {
  FIRST_DIARY: { shape: 'book', color: '#E7B83C' },
  DIARY_30: { shape: 'book', color: '#7B6BA8' },
  STREAK_7: { shape: 'trophy', color: '#E7B83C' },
  STREAK_30: { shape: 'trophy', color: '#C9CDD2' },
  BIRTHDAY_TODAY: { shape: 'cake', color: '#F2B8CB' },
  TOGETHER_100: { shape: 'heart', color: '#E0473A' },
  ADOPTION_DAY: { shape: 'cake', color: '#F5C842' },
};

const FEATHER_GEO = new THREE.SphereGeometry(1, 10, 6);
export function featherMesh(color) {
  const m = new THREE.Mesh(FEATHER_GEO, mat(color || '#9BC9A0'));
  m.scale.set(0.34, 0.025, 0.1);
  m.receiveShadow = true;
  return m;
}
/** Where the n-th visitor feather lies on the floor. */
export function featherSpot(i) {
  const a = i * 2.39996;
  const r = 1.2 + (i % 7) * 0.45;
  return { x: 6 + Math.cos(a) * r * 1.3, z: 5.2 + Math.sin(a) * r * 0.8, rot: a };
}

/**
 * Returns { scene, env, frameHits, hosts, sun, lamp, landables, weightAnchor, hasWeight }.
 * landables: invisible meshes with userData.land(point) -> { p: Vector3, surface }.
 */
export function buildRoomScene(room) {
  const env = skyNow();
  const scene = new THREE.Scene();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9c2a0, env.night ? 0.35 : 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(env.night ? 0x9fb4ff : 0xfff1d6, env.light);
  sun.position.set(W / 2 + 6, 12, -6);
  sun.target.position.set(W / 2, 0, D / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight(0xffc074, env.night ? 1.4 : 0, 10, 2);
  lamp.position.set(W - 1.2, 3.2, 1.2);
  scene.add(lamp);

  // shell
  box(scene, 0, -0.3, 0, W, 0, D, '#E3C29A', false);
  for (let i = 1; i < D; i++) box(scene, 0, 0, i - 0.02, W, 0.004, i + 0.02, '#D2AE84', false);
  box(scene, 2.2, 0, 3.0, 8.8, 0.02, 7.6, '#CFE0B6', false);
  box(scene, -0.25, 0, -0.25, 0, 5, D, '#F3E6CF');
  box(scene, 0, 0, -0.25, 5.6, 5, 0, '#F3E6CF');
  box(scene, 9.6, 0, -0.25, W, 5, 0, '#F3E6CF');
  box(scene, 5.6, 0, -0.25, 9.6, 1.6, 0, '#F3E6CF');
  box(scene, 5.6, 4.4, -0.25, 9.6, 5, 0, '#F3E6CF');
  box(scene, 0, 0, 0, W, 0.3, 0.06, '#C9A27A');
  box(scene, 0, 0, 0.06, 0.06, 0.3, D, '#C9A27A');

  // window with today's sky
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.8), new THREE.MeshBasicMaterial({ color: toLinear(env.sky) }));
  sky.position.set(7.6, 3.0, -0.3);
  scene.add(sky);
  if (!env.night) {
    [[6.5, 3.6], [8.4, 3.2]].forEach(([x, y]) => {
      const cl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      cl.scale.set(1.6, 0.6, 0.1);
      cl.position.set(x, y, -0.28);
      scene.add(cl);
    });
  } else {
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.25, 20), new THREE.MeshBasicMaterial({ color: 0xf3ebc8 }));
    moon.position.set(8.6, 3.8, -0.28);
    scene.add(moon);
  }
  box(scene, 5.5, 1.5, -0.3, 9.7, 1.62, 0.25, '#FFFFFF');
  box(scene, 5.5, 4.38, -0.3, 9.7, 4.5, 0.08, '#FFFFFF');
  box(scene, 5.5, 1.6, -0.3, 5.62, 4.4, 0.08, '#FFFFFF');
  box(scene, 9.58, 1.6, -0.3, 9.7, 4.4, 0.08, '#FFFFFF');
  box(scene, 7.55, 1.6, -0.25, 7.65, 4.4, -0.15, '#FFFFFF', false);

  // long window perch
  rod(scene, new THREE.Vector3(PERCH.x0, PERCH.y, PERCH.z), new THREE.Vector3(PERCH.x1, PERCH.y, PERCH.z), 0.08, '#9C7048');
  [6.1, 10.1].forEach((x) => rod(scene, new THREE.Vector3(x, 0, PERCH.z), new THREE.Vector3(x, PERCH.y, PERCH.z), 0.07, '#8A6A4A'));

  // frames = photo diaries
  const loader = new THREE.TextureLoader();
  const frameHits = [];
  const SLOTS = [
    [1.2, 3.4, 1.6], [1.2, 3.4, 3.2], [1.2, 3.4, 4.8], [1.2, 3.4, 6.4],
    [1.2, 1.9, 2.4], [1.2, 1.9, 4.0], [1.2, 1.9, 5.6], [1.2, 1.9, 7.2],
  ];
  (room.frames || []).slice(0, SLOTS.length).forEach((f, i) => {
    const [size, y, z] = SLOTS[i];
    const aspect = f.width && f.height ? f.width / f.height : 1;
    const fw = aspect >= 1 ? size : size * aspect;
    const fh = aspect >= 1 ? size / aspect : size;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, fh + 0.14, fw + 0.14), mat(i % 2 ? '#2B2622' : '#9C7048'));
    frame.position.set(0.05, y, z);
    frame.castShadow = true;
    scene.add(frame);
    const photoMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    loader.load(f.imageUrl, (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      photoMat.map = tex;
      photoMat.color.set(0xffffff);
      photoMat.needsUpdate = true;
    });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), photoMat);
    photo.rotation.y = Math.PI / 2;
    photo.position.set(0.085, y, z);
    photo.userData.postId = f.postId;
    scene.add(photo);
    frameHits.push(photo);
  });

  // shelf with badges
  box(scene, 0.8, 3.6, 0.02, 4.6, 3.7, 0.55, '#B98552');
  (room.badges || []).slice(0, 6).forEach((b, i) => {
    const look = BADGE_LOOK[b.code] || { shape: 'book', color: '#8FB9A8' };
    const x = 1.2 + i * 0.6;
    let m;
    if (look.shape === 'trophy') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.3, 10), mat(look.color));
      m.position.set(x, 3.88, 0.3);
    } else if (look.shape === 'cake') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 14), mat(look.color));
      m.position.set(x, 3.79, 0.3);
    } else if (look.shape === 'heart') {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat(look.color));
      m.scale.set(1, 1, 0.6);
      m.position.set(x, 3.86, 0.3);
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.28), mat(look.color));
      m.position.set(x, 3.87, 0.3);
    }
    m.castShadow = true;
    scene.add(m);
  });

  // scale with the latest weight
  const hasWeight = room.today && room.today.latestWeightG != null;
  box(scene, 3.4, 0, 6.2, 4.6, 0.16, 7.2, '#F4F2EE');
  box(scene, 3.5, 0.16, 6.3, 4.5, 0.18, 6.6, hasWeight ? '#3A4656' : '#C9CDD2', false);

  // lamp and plant
  rod(scene, new THREE.Vector3(W - 1.2, 0, 1.2), new THREE.Vector3(W - 1.2, 3.3, 1.2), 0.05, '#C9A24E');
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.55, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: toLinear('#E7B83C'), emissive: toLinear('#FFB347'), emissiveIntensity: env.night ? 0.6 : 0, side: THREE.DoubleSide }));
  shade.position.set(W - 1.2, 3.4, 1.2);
  scene.add(shade);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.7, 12), mat('#D9774B'));
  pot.position.set(W - 0.8, 0.35, D - 1.2);
  pot.castShadow = true;
  scene.add(pot);
  [[0, 1.1, 0, 0.55], [0.1, 1.6, 0.05, 0.38]].forEach(([dx, y, dz, r]) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat('#6FA35A'));
    leaf.position.set(W - 0.8 + dx, y, D - 1.2 + dz);
    leaf.castShadow = true;
    scene.add(leaf);
  });

  // visitor feathers
  (room.feathers || []).forEach((f, i) => {
    const s = featherSpot(i);
    const m = featherMesh(f.color);
    m.position.set(s.x, 0.03, s.z);
    m.rotation.y = s.rot;
    scene.add(m);
  });

  // the owner's birds on the perch, facing the viewer
  const hosts = (room.parrots || []).slice(0, 4).map((p, i) => {
    const b = makeBird(p.colors, p.species);
    const home = new THREE.Vector3(6.6 + i * 1.0, PERCH.y + 0.08, PERCH.z);
    b.group.position.copy(home);
    b.group.rotation.y = -Math.PI / 4 + (i % 2 ? 0.45 : -0.25);
    scene.add(b.group);
    return { ...b, parrot: p, home, homeRot: b.group.rotation.y };
  });

  // invisible surfaces you can land on (play mode)
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const landables = [];
  const surface = (geo, pos, land) => {
    const m = new THREE.Mesh(geo, hitMat);
    m.position.copy(pos);
    m.userData.land = land;
    scene.add(m);
    landables.push(m);
    return m;
  };
  const perchHit = surface(new THREE.BoxGeometry(PERCH.x1 - PERCH.x0, 0.6, 0.6), new THREE.Vector3((PERCH.x0 + PERCH.x1) / 2, PERCH.y, PERCH.z),
    (pt) => ({ p: new THREE.Vector3(THREE.MathUtils.clamp(pt.x, PERCH.x0 + 0.2, PERCH.x1 - 0.2), PERCH.y + 0.08, PERCH.z), surface: 'perch' }));
  perchHit.userData.kind = 'perch';
  surface(new THREE.BoxGeometry(3.8, 0.3, 0.55), new THREE.Vector3(2.7, 3.7, 0.3),
    (pt) => ({ p: new THREE.Vector3(THREE.MathUtils.clamp(pt.x, 1.0, 4.4), 3.7, 0.32), surface: 'shelf' }));
  surface(new THREE.BoxGeometry(4.0, 0.25, 0.5), new THREE.Vector3(7.6, 1.62, 0.0),
    (pt) => ({ p: new THREE.Vector3(THREE.MathUtils.clamp(pt.x, 5.8, 9.4), 1.62, 0.05), surface: 'sill' }));
  surface(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.Vector3(4, 0.12, 6.7),
    (pt) => ({ p: new THREE.Vector3(THREE.MathUtils.clamp(pt.x, 3.6, 4.4), 0.18, THREE.MathUtils.clamp(pt.z, 6.4, 7.0)), surface: 'scale' }));

  return { scene, env, sun, lamp, frameHits, hosts, landables, hasWeight, weightAnchor: new THREE.Vector3(4, 0.2, 6.7) };
}

export function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry && o.geometry !== FEATHER_GEO) o.geometry.dispose();
    if (o.material && o.material.map) o.material.map.dispose();
  });
}
