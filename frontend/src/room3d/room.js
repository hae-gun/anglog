// The 3D room shown as a profile. Fixed quarter-view camera, small cozy diorama.
// What's in the room comes from the diary:
//   frames on the wall   = latest photo diaries (tap to open)
//   the bird and its pose = the owner's parrots and their latest mood
//   the scale            = latest recorded weight
//   the shelf            = badges (first diary, 7-day streak, birthdays...)
//   feathers on the floor = visitors who stopped by
import * as THREE from 'three';
import { makeBird, toLinear, UP } from './bird.js';

const W = 12;
const D = 9;

function mat(hex) {
  return new THREE.MeshStandardMaterial({ color: toLinear(hex), roughness: 0.85, flatShading: true });
}
function box(scene, x0, y0, z0, x1, y1, z1, hex, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(hex));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = cast;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
function rod(scene, a, b, r, hex) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat(hex));
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  m.castShadow = true;
  scene.add(m);
  return m;
}

/** Sky color through the window, following the time of day in Korea. */
function skyNow() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })) % 24;
  if (h >= 7 && h < 17) return { sky: '#9CD4F2', light: 1.25, night: false };
  if (h >= 17 && h < 19) return { sky: '#F4A97A', light: 0.95, night: false };
  if (h >= 5 && h < 7) return { sky: '#C9B8D8', light: 0.9, night: false };
  return { sky: '#1B2547', light: 0.45, night: true };
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

/**
 * Mounts the room into `container` (a positioned element). Returns { dispose }.
 * onFrameTap(postId) fires when a framed photo is tapped.
 */
export function mountRoom(container, room, { onFrameTap } = {}) {
  const env = skyNow();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(env.night ? '#1B2036' : '#EFE6D6');
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'pan-y';

  const labels = document.createElement('div');
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  container.appendChild(labels);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const center = new THREE.Vector3(W / 2, 1.6, D / 2 - 0.4);
  const offset = new THREE.Vector3(16, 13, 16);

  // lights
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

  // room shell
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
  const skyMat = new THREE.MeshBasicMaterial({ color: toLinear(env.sky) });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.8), skyMat);
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

  // long window perch where the birds sit
  const perchY = 1.9;
  rod(scene, new THREE.Vector3(5.8, perchY, 0.9), new THREE.Vector3(10.4, perchY, 0.9), 0.08, '#9C7048');
  [6.1, 10.1].forEach((x) => rod(scene, new THREE.Vector3(x, 0, 0.9), new THREE.Vector3(x, perchY, 0.9), 0.07, '#8A6A4A'));

  // frames on the left wall: photo diaries
  const loader = new THREE.TextureLoader();
  const frameHits = [];
  const FRAME_SLOTS = [
    [1.2, 3.4, 1.6], [1.2, 3.4, 3.2], [1.2, 3.4, 4.8], [1.2, 3.4, 6.4],
    [1.2, 1.9, 2.4], [1.2, 1.9, 4.0], [1.2, 1.9, 5.6], [1.2, 1.9, 7.2],
  ];
  (room.frames || []).slice(0, FRAME_SLOTS.length).forEach((f, i) => {
    const [size, y, z] = FRAME_SLOTS[i];
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

  // shelf with badges on the back wall
  box(scene, 0.8, 3.6, 0.02, 4.6, 3.7, 0.55, '#B98552');
  (room.badges || []).slice(0, 6).forEach((b, i) => {
    const look = BADGE_LOOK[b.code] || { shape: 'book', color: '#8FB9A8' };
    const x = 1.2 + i * 0.6;
    let m;
    if (look.shape === 'trophy') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.3, 10), mat(look.color));
      m.position.set(x, 3.88, 0.3);
      const base = box(scene, x - 0.1, 3.7, 0.2, x + 0.1, 3.74, 0.4, '#6B4A33');
      base.castShadow = false;
    } else if (look.shape === 'cake') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 14), mat(look.color));
      m.position.set(x, 3.79, 0.3);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), mat('#FFFFFF'));
      candle.position.set(x, 3.95, 0.3);
      scene.add(candle);
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

  // standing lamp
  rod(scene, new THREE.Vector3(W - 1.2, 0, 1.2), new THREE.Vector3(W - 1.2, 3.3, 1.2), 0.05, '#C9A24E');
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.55, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: toLinear('#E7B83C'), emissive: toLinear('#FFB347'), emissiveIntensity: env.night ? 0.6 : 0, side: THREE.DoubleSide }));
  shade.position.set(W - 1.2, 3.4, 1.2);
  scene.add(shade);

  // plant
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

  // feathers from visitors, scattered on the floor
  const fGeo = new THREE.SphereGeometry(1, 10, 6);
  (room.feathers || []).forEach((f, i) => {
    const a = i * 2.39996;
    const r = 1.2 + (i % 7) * 0.45;
    const m = new THREE.Mesh(fGeo, mat(f.color || '#9BC9A0'));
    m.scale.set(0.34, 0.025, 0.1);
    m.position.set(6 + Math.cos(a) * r * 1.3, 0.03, 5.2 + Math.sin(a) * r * 0.8);
    m.rotation.y = a;
    m.receiveShadow = true;
    scene.add(m);
  });

  // the birds
  const mood = room.today ? room.today.latestMood : null;
  const birds = (room.parrots || []).slice(0, 4).map((p, i) => {
    const b = makeBird(p.colors, p.species);
    b.group.position.set(6.6 + i * 1.0, perchY + 0.08, 0.9);
    // face the viewer (camera sits toward +x, +z), each bird turned a little differently
    b.group.rotation.y = -Math.PI / 4 + (i % 2 ? 0.45 : -0.25);
    scene.add(b.group);
    return { ...b, parrot: p };
  });

  // labels (weight on the scale, names over birds)
  const v = new THREE.Vector3();
  const tag = (text, cls) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    labels.appendChild(el);
    return el;
  };
  const weightEl = tag(hasWeight ? `${Number(room.today.latestWeightG)}g` : '체중 기록 없음', 'room-tag room-tag-weight');
  const nameEls = birds.map((b) => tag(b.parrot.name, 'room-tag'));
  // the first bird's tag also carries today's mood, so the two labels never overlap
  if (room.today && room.today.latestMoodLabel && nameEls[0]) {
    const m = document.createElement('span');
    m.className = 'room-tag-mood';
    m.textContent = room.today.latestMoodLabel;
    nameEls[0].appendChild(m);
  }

  let w = 1, h = 1;
  function resize() {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = Math.max(9.2, 13.5 / aspect);
    camera.left = (-viewH * aspect) / 2;
    camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.position.copy(center).add(offset);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function place(el, pos, lift) {
    v.copy(pos);
    v.y += lift;
    v.project(camera);
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
  }

  // taps on frames
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(frameHits, false)[0];
    if (hit && onFrameTap) onFrameTap(hit.object.userData.postId);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  const onMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    renderer.domElement.style.cursor = ray.intersectObjects(frameHits, false).length ? 'pointer' : 'default';
  };
  renderer.domElement.addEventListener('pointermove', onMove);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  let raf = 0;
  let visible = true;
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  io.observe(container);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const t = reduce ? 0 : (now - start) / 1000;
    birds.forEach((b) => b.pose(mood, t));
    renderer.render(scene, camera);
    place(weightEl, new THREE.Vector3(4, 0.2, 6.7), 0.15);
    birds.forEach((b, i) => place(nameEls[i], b.group.position, 1.45));
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.map) o.material.map.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
