// The room as seen on a profile: a fixed quarter-view of the diorama, frames open diaries.
import * as THREE from 'three';
import { buildRoomScene, D, disposeScene, W } from './scene.js';

export function mountRoom(container, room, { onFrameTap } = {}) {
  const { scene, env, frameHits, hosts, hasWeight, weightAnchor } = buildRoomScene(room);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(env.clear);
  container.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' });

  const labels = document.createElement('div');
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  container.appendChild(labels);
  const tag = (text, cls) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    labels.appendChild(el);
    return el;
  };
  const weightEl = tag(hasWeight ? `${Number(room.today.latestWeightG)}g` : '체중 기록 없음', 'room-tag room-tag-weight');
  const nameEls = hosts.map((b) => tag(b.parrot.name, 'room-tag'));
  if (room.today && room.today.latestMoodLabel && nameEls[0]) {
    const m = document.createElement('span');
    m.className = 'room-tag-mood';
    m.textContent = room.today.latestMoodLabel;
    nameEls[0].appendChild(m);
  }

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const center = new THREE.Vector3(W / 2, 1.6, D / 2 - 0.4);
  const offset = new THREE.Vector3(16, 13, 16);
  let w = 1, h = 1;
  function resize() {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = Math.max(9.2, 13.5 / aspect);
    Object.assign(camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.position.copy(center).add(offset);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const v = new THREE.Vector3();
  function place(el, pos, lift) {
    v.copy(pos);
    v.y += lift;
    v.project(camera);
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const toNdc = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    toNdc(e);
    const hit = ray.intersectObjects(frameHits, false)[0];
    if (hit && onFrameTap) onFrameTap(hit.object.userData.postId);
  };
  const onMove = (e) => {
    toNdc(e);
    renderer.domElement.style.cursor = ray.intersectObjects(frameHits, false).length ? 'pointer' : 'default';
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);

  const mood = room.today ? room.today.latestMood : null;
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
    hosts.forEach((b) => b.pose(mood, t));
    renderer.render(scene, camera);
    place(weightEl, weightAnchor, 0.15);
    hosts.forEach((b, i) => place(nameEls[i], b.group.position, 1.45));
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
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
