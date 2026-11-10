// Play mode: I bring my bird into someone's room.
// Tap the floor to walk, tap the perch/shelf/sill/scale to fly there, tap a bird to go say hi.
// The host birds live their own little lives (perch, wander, come over) and answer when spoken to.
import * as THREE from 'three';
import { playCall, playFx } from '../lib/sound';
import { makeBird } from './bird.js';
import { buildRoomScene, D, disposeScene, featherMesh, PERCH, W } from './scene.js';
import { tr } from '../i18n';

/** Lines in both languages: L(['안녕'], ['Hi']). pick() takes the current language's list. */
const L = (ko, en) => ({ ko, en });

const clamp = THREE.MathUtils.clamp;
const FLOOR = { x0: 0.6, x1: W - 0.6, z0: 1.4, z1: D - 0.5 };
const OBSTACLES = [
  { x: W - 1.2, z: 1.2, r: 0.4 },
  { x: W - 0.8, z: D - 1.2, r: 0.55 },
];
const CHIRPS = L(['짹짹!', '짹!', '삐요', '짹짹짹'], ['Tweet!', 'Chirp!', 'Peep', 'Tweet tweet']);
const REPLIES = L(['짹!', '삐약', '누구야?', '반가워!', '짹짹'], ['Chirp!', 'Peep', 'Who\'s that?', 'Hi there!', 'Tweet']);
const PLAY_LINES = L(['신난다!', '한 번 더!', '짹짹짹!', '같이 춤추자'], ['Yay!', 'Again!', 'Tweet tweet!', 'Let\'s dance']);
const PREEN_LINES = L(['시원해~', '거기 거기', '콕콕', '고마워'], ['Ahh~', 'Right there', 'Peck peck', 'Thanks']);
const HELLO = L(['왔어?', '놀러왔구나!', '짹! 반가워', '여기야 여기'], ['You\'re here?', 'Came to play!', 'Chirp! Hi', 'Over here']);

const angleTo = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
function lerpAngle(a, b, k) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
}
const pick = (a) => { const arr = Array.isArray(a) ? a : tr(a.ko, a.en); return arr[Math.floor(Math.random() * arr.length)]; };
const onFloor = (p) => p.y < 0.05;
function floorPoint(x, z) {
  const p = new THREE.Vector3(clamp(x, FLOOR.x0, FLOOR.x1), 0, clamp(z, FLOOR.z0, FLOOR.z1));
  OBSTACLES.forEach((o) => {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d < o.r + 0.4) {
      const k = (o.r + 0.4) / Math.max(d, 0.001);
      p.x = o.x + dx * k;
      p.z = o.z + dz * k;
    }
  });
  return p;
}

/**
 * visitor: { name, colors, species }
 * Returns { dispose, chirp(), playTogether(), preen(), dropFeather(color) }.
 */
export function mountPlay(container, room, { visitor, onFrameTap } = {}) {
  const built = buildRoomScene(room);
  const { scene, env, frameHits, landables, toys } = built;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(env.clear);
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

  let clock = 0;
  const mood = room.today ? room.today.latestMood : null;
  const actors = [];
  function actor(b, name, opts) {
    const a = {
      b, name, pos: b.group.position, move: null, action: null, surface: opts.surface, isPlayer: !!opts.isPlayer,
      pitch: opts.pitch ?? 1, home: opts.home ?? null, homeRot: opts.homeRot ?? 0, rotTarget: b.group.rotation.y,
      nextThink: 3 + Math.random() * 5, nextChirp: 6 + Math.random() * 8,
      tagEl: el(opts.isPlayer ? 'room-tag room-tag-me' : 'room-tag', name),
      bubbleEl: el('room-bubble'), bubbleUntil: 0,
    };
    a.bubbleEl.hidden = true;
    actors.push(a);
    return a;
  }

  const hosts = built.hosts.map((h, i) => actor(h, h.parrot.name, { surface: 'perch', home: h.home, homeRot: h.homeRot, pitch: [0.92, 1.05, 0.86, 1.12][i % 4] }));
  const pb = makeBird(visitor.colors, visitor.species);
  scene.add(pb.group);
  const player = actor(pb, visitor.name, { isPlayer: true, surface: 'air' });
  player.pos.set(W - 1.2, 3.4, D - 0.4);

  // ---- speech and sound -----------------------------------------------------
  function say(a, text, sec = 1.6) {
    a.bubbleEl.textContent = text;
    a.bubbleEl.hidden = false;
    a.bubbleUntil = clock + sec;
  }
  function loudness(a) {
    if (a.isPlayer) return 0.85;
    return clamp(1 - a.pos.distanceTo(player.pos) / 12, 0.15, 0.8);
  }
  function act(a, name, sec) {
    a.action = { name, until: clock + sec };
  }

  // ---- movement ------------------------------------------------------------
  function flyTo(a, to, surface, after) {
    const from = a.pos.clone();
    const d = from.distanceTo(to);
    a.move = { type: 'fly', from, to: to.clone(), t0: clock, dur: 0.35 + d / 5, peak: Math.max(from.y, to.y) + Math.min(2, 0.7 + d * 0.15), surface, after };
    a.rotTarget = angleTo(from, to);
  }
  function walkTo(a, to, after) {
    a.move = { type: 'walk', to: to.clone(), surface: 'floor', after };
    a.rotTarget = angleTo(a.pos, to);
  }
  function goTo(a, to, surface, after) {
    if (onFloor(a.pos) && to.y < 0.05 && a.pos.distanceTo(to) < 7) walkTo(a, to, after);
    else flyTo(a, to, surface, after);
  }
  function arrive(a) {
    const m = a.move;
    a.move = null;
    a.surface = m.surface;
    if (m.after) m.after();
  }
  function stepMove(a, dt) {
    const m = a.move;
    if (!m) return;
    if (m.type === 'fly') {
      const k = Math.min(1, (clock - m.t0) / m.dur);
      a.pos.set(m.from.x + (m.to.x - m.from.x) * k, (1 - k) * (1 - k) * m.from.y + 2 * (1 - k) * k * m.peak + k * k * m.to.y, m.from.z + (m.to.z - m.from.z) * k);
      if (k >= 1) arrive(a);
    } else {
      const dx = m.to.x - a.pos.x, dz = m.to.z - a.pos.z, d = Math.hypot(dx, dz), s = 2.8 * dt;
      if (d <= s) { a.pos.x = m.to.x; a.pos.z = m.to.z; arrive(a); } else { a.pos.x += (dx / d) * s; a.pos.z += (dz / d) * s; }
    }
  }
  /** A spot right next to `b`, on the same kind of surface when possible. */
  function besides(b) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (b.surface === 'perch') {
      const x = clamp(b.pos.x + side * 1.0, PERCH.x0 + 0.2, PERCH.x1 - 0.2);
      return { p: new THREE.Vector3(Math.abs(x - b.pos.x) < 0.6 ? clamp(b.pos.x - side * 1.0, PERCH.x0 + 0.2, PERCH.x1 - 0.2) : x, PERCH.y + 0.08, PERCH.z), surface: 'perch' };
    }
    const fp = floorPoint(b.pos.x + side * 1.0, b.pos.z + 0.4);
    return { p: fp, surface: 'floor' };
  }
  function nearestHost() {
    let best = null, bd = Infinity;
    hosts.forEach((h) => { const d = h.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = h; } });
    return best ? { h: best, d: bd } : null;
  }
  /** Bring `h` next to the player (unless already close), then run `then`. */
  function meet(h, then) {
    if (player.move) player.move = null;
    if (h.pos.distanceTo(player.pos) < 1.5 && Math.abs(h.pos.y - player.pos.y) < 0.4) { then(); return; }
    const spot = besides(player);
    h.action = null;
    flyTo(h, spot.p, spot.surface, then);
  }
  function faceEachOther(a, b) {
    a.rotTarget = angleTo(a.pos, b.pos);
    b.rotTarget = angleTo(b.pos, a.pos);
  }

  // ---- ball ----------------------------------------------------------------
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshStandardMaterial({ color: 0xe0473a, roughness: 0.6, flatShading: true }));
  ball.castShadow = true;
  ball.position.set(8.2, 0.28, 6.6);
  scene.add(ball);
  const ballVel = new THREE.Vector3();
  const axis = new THREE.Vector3();
  function stepBall(dt) {
    actors.forEach((a) => {
      if (!onFloor(a.pos)) return;
      const dx = ball.position.x - a.pos.x, dz = ball.position.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.62 && d > 0.001) {
        ball.position.x = a.pos.x + (dx / d) * 0.62;
        ball.position.z = a.pos.z + (dz / d) * 0.62;
        const sp = Math.max(ballVel.length(), a.move ? 3.2 : 0.8);
        ballVel.set((dx / d) * sp, 0, (dz / d) * sp);
        if (a.isPlayer && a.move && Math.random() < 0.4) say(a, tr('데굴데굴', 'Roll roll'), 0.8);
      }
    });
    ball.position.addScaledVector(ballVel, dt);
    ballVel.multiplyScalar(Math.exp(-dt * 1.1));
    const lo = 0.35;
    if (ball.position.x < lo || ball.position.x > W - lo) { ball.position.x = clamp(ball.position.x, lo, W - lo); ballVel.x *= -0.7; }
    if (ball.position.z < lo || ball.position.z > D - lo) { ball.position.z = clamp(ball.position.z, lo, D - lo); ballVel.z *= -0.7; }
    const sp = Math.hypot(ballVel.x, ballVel.z);
    if (sp > 0.01) { axis.set(ballVel.z, 0, -ballVel.x).normalize(); ball.rotateOnWorldAxis(axis, (sp * dt) / 0.28); }
  }

  // ---- particles (hearts) and falling feathers ------------------------------
  const sparks = [];
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff6b8a, transparent: true });
  function hearts(at) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), heartMat.clone());
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8));
      scene.add(m);
      sparks.push({ m, vy: 0.6 + Math.random() * 0.5, life: 1.6 });
    }
  }
  const falling = [];
  function stepParticles(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.m.position.y += s.vy * dt;
      s.m.material.opacity = Math.max(0, s.life / 1.6);
      if (s.life <= 0) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); sparks.splice(i, 1); }
    }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      f.m.position.y = Math.max(0.03, f.y0 - f.t * 0.9);
      f.m.position.x = f.x0 + Math.sin(f.t * 3.2) * 0.25;
      f.m.rotation.z = Math.sin(f.t * 3.2) * 0.5;
      if (f.m.position.y <= 0.03) { f.m.rotation.z = 0; falling.splice(i, 1); }
    }
  }

  // ---- toys: the bell under the perch, the mirror -------------------------------------
  const bell = toys.bell;
  function ring(times = 3) {
    for (let k = 0; k < times; k++) {
      setTimeout(() => {
        if (gone) return;
        bell.vel += (k % 2 ? -1 : 1) * 2.6;
        bell.velX += (Math.random() - 0.5) * 1.2;
        playFx('bell', 0.35);
      }, k * 330);
    }
  }
  function stepToys(dt) {
    // a damped pendulum, both ways
    bell.vel += (-18 * bell.swing - 1.6 * bell.vel) * dt;
    bell.swing += bell.vel * dt;
    bell.velX += (-18 * bell.swingX - 1.6 * bell.velX) * dt;
    bell.swingX += bell.velX * dt;
    bell.pivot.rotation.set(bell.swingX, 0, bell.swing);
  }
  const MIRROR_LINES = L(['누구야?', '거울 속에 나다', '안녕 나야!', '너 귀엽다'], ['Who\'s that?', 'It\'s me in there', 'Hi, me!', 'You\'re cute']);
  /** Play with a toy once you are at it. */
  function playToy(a, toy) {
    if (toy === 'bell') {
      a.rotTarget = 0;
      act(a, 'PECK', 1.4);
      ring(3);
      say(a, tr('딸랑딸랑', 'Jingle jingle'), 1.4);
    } else if (toy === 'mirror' && toys.mirror) {
      a.rotTarget = angleTo(a.pos, toys.mirror.face);
      act(a, 'SING', 3);
      say(a, pick(MIRROR_LINES), 1.8);
      [0, 600, 1300].forEach((ms) => setTimeout(() => { if (!gone) playCall('chirp', a.pitch, a.isPlayer ? 0.8 : loudness(a)); }, ms));
    }
  }
  let gone = false;
  // the mirror: render the birds, the floor and the ball from the mirrored camera into a texture,
  // and project it onto the glass. Only layer 1 shows up in it (walls would block the mirrored view).
  let mirror = null;
  if (toys.mirror) {
    const rt = new THREE.WebGLRenderTarget(512, 512);
    const texMat = new THREE.Matrix4();
    const glassMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: texMat }, tint: { value: new THREE.Color(0xe3ecef) } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; void main() { vUv = textureMatrix * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform vec3 tint; varying vec4 vUv; void main() { vec4 c = texture2DProj(tDiffuse, vUv); gl_FragColor = linearToOutputTexel(vec4(c.rgb * tint, 1.0)); }',
    });
    toys.mirror.glass.material.dispose();
    toys.mirror.glass.material = glassMat;
    const floorCopy = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: new THREE.Color('#E3C29A').convertSRGBToLinear(), roughness: 0.9 }));
    floorCopy.rotation.x = -Math.PI / 2;
    floorCopy.position.set(W / 2, 0.001, D / 2);
    floorCopy.layers.set(1);
    scene.add(floorCopy);
    scene.traverse((o) => { if (o.isLight) o.layers.enable(1); });
    ball.layers.enable(1);
    const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    cam2.layers.set(1);
    mirror = { rt, texMat, cam2, glassMat, floorCopy, z: toys.mirror.z, birdsOn: new WeakSet() };
  }
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const refl = new THREE.Vector3();
  function renderMirror() {
    if (!mirror) return;
    actors.forEach((a) => { if (!mirror.birdsOn.has(a.b.group)) { a.b.group.traverse((o) => o.layers.enable(1)); mirror.birdsOn.add(a.b.group); } });
    const { cam2, z } = mirror;
    cam2.left = camera.left; cam2.right = camera.right; cam2.top = camera.top; cam2.bottom = camera.bottom;
    cam2.near = camera.near; cam2.far = camera.far;
    cam2.updateProjectionMatrix();
    cam2.position.copy(camera.position);
    cam2.position.z = 2 * z - camera.position.z;
    refl.copy(look);
    refl.z = 2 * z - look.z;
    cam2.up.set(0, 1, 0);
    cam2.lookAt(refl);
    cam2.updateMatrixWorld();
    mirror.texMat.copy(bias).multiply(cam2.projectionMatrix).multiply(cam2.matrixWorldInverse);
    toys.mirror.glass.visible = false;
    renderer.setRenderTarget(mirror.rt);
    renderer.clear();
    renderer.render(scene, cam2);
    renderer.setRenderTarget(null);
    toys.mirror.glass.visible = true;
  }

  // ---- host life -------------------------------------------------------------
  function think(h) {
    if (h.move || (h.action && h.action.until > clock)) return;
    const d = h.pos.distanceTo(player.pos);
    const r = Math.random();
    if (r < 0.16) {
      // off to play with a toy
      const toy = toys.mirror && Math.random() < 0.5 ? 'mirror' : 'bell';
      const at = toy === 'bell' ? bell.spot.clone() : toys.mirror.spot.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0));
      flyTo(h, at, toy === 'bell' ? 'perch' : 'floor', () => playToy(h, toy));
      return;
    }
    if (d > 4 && r < 0.35) {
      const spot = besides(player);
      flyTo(h, spot.p, spot.surface, () => { faceEachOther(h, player); say(h, pick(HELLO)); playCall('chirp', h.pitch, loudness(h)); });
    } else if (h.surface === 'perch' && r < 0.7) {
      flyTo(h, floorPoint(2.5 + Math.random() * 7, 3 + Math.random() * 4.5), 'floor', () => act(h, mood === 'HUNGRY' ? 'HUNGRY' : 'WALK', 0.01));
    } else if (h.surface !== 'perch') {
      flyTo(h, h.home, 'perch', () => { h.rotTarget = h.homeRot; });
    }
  }
  function keepApart() {
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i], b = actors[j];
        if ((a.move && a.move.type === 'fly') || (b.move && b.move.type === 'fly')) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 0.4) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = 0.9;
        if (d >= min || d < 0.0001) continue;
        const push = (min - d) / 2, nx = dx / d, nz = dz / d;
        // whoever is walking gets nudged; perch birds slide along the perch
        [[a, -1], [b, 1]].forEach(([s, sign]) => {
          s.pos.x += sign * nx * push;
          if (s.surface !== 'perch') s.pos.z += sign * nz * push;
          if (s.surface === 'perch') s.pos.x = clamp(s.pos.x, PERCH.x0 + 0.2, PERCH.x1 - 0.2);
          else if (onFloor(s.pos)) { const fp = floorPoint(s.pos.x, s.pos.z); s.pos.x = fp.x; s.pos.z = fp.z; }
        });
      }
    }
  }

  // ---- camera ----------------------------------------------------------------
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const roomCenter = new THREE.Vector3(W / 2, 1.6, D / 2 - 0.4);
  const offset = new THREE.Vector3(16, 13, 16);
  const look = roomCenter.clone();
  let w = 1, h = 1, viewH = 10, portrait = false;
  function resize() {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    portrait = aspect < 1;
    viewH = portrait ? clamp(8.5 / aspect, 9, 17) : Math.max(9.2, 13.5 / aspect);
    Object.assign(camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  function stepCamera(dt) {
    const target = portrait ? roomCenter.clone().lerp(new THREE.Vector3(player.pos.x, 1.6, player.pos.z), 0.75) : roomCenter;
    look.lerp(target, 1 - Math.exp(-dt * 3));
    camera.position.copy(look).add(offset);
    camera.lookAt(look);
  }

  // ---- taps --------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0x2b2622, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  let markerT = -9;
  const hostMeshes = () => hosts.map((x) => x.b.group);
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const frame = ray.intersectObjects(frameHits, false)[0];
    if (frame && onFrameTap) { onFrameTap(frame.object.userData.postId); return; }
    const birdHit = ray.intersectObjects(hostMeshes(), true)[0];
    if (birdHit) {
      const h = hosts.find((x) => { let o = birdHit.object; while (o) { if (o === x.b.group) return true; o = o.parent; } return false; });
      if (h && !h.move) {
        const spot = besides(h);
        goTo(player, spot.p, spot.surface, () => {
          faceEachOther(player, h);
          act(h, 'CHIRP', 0.7);
          say(h, pick(HELLO));
          playCall('chirp', h.pitch, loudness(h));
        });
        return;
      }
    }
    let target, surface = 'floor';
    const hit = ray.intersectObjects(landables, false)[0];
    let toy = null;
    if (hit) { const got = hit.object.userData.land(hit.point); target = got.p; surface = got.surface; toy = got.toy || null; }
    else {
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(floorPlane, p)) return;
      target = floorPoint(p.x, p.z);
    }
    player.action = null;
    goTo(player, target, surface, toy ? () => playToy(player, toy) : null);
    marker.position.set(target.x, target.y + 0.03, target.z);
    markerT = clock;
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // ---- loop ------------------------------------------------------------------
  const v = new THREE.Vector3();
  function place(e, pos, lift) {
    v.copy(pos);
    v.y += lift;
    v.project(camera);
    const off = v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2;
    e.style.visibility = off ? 'hidden' : 'visible';
    e.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
  }
  // entrance: fly in through the open side of the room
  flyTo(player, floorPoint(6.8, 5.8), 'floor', () => { say(player, tr('놀러왔어요!', 'Came to play!'), 1.8); playCall('chirp', 1, 0.8); });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    actors.forEach((a) => {
      stepMove(a, dt);
      let mode;
      if (a.move) mode = a.move.type === 'fly' ? 'FLY' : 'WALK';
      else if (a.action && a.action.until > clock) mode = a.action.name;
      else mode = a.isPlayer ? 'idle' : mood;
      a.b.pose(mode, reduce ? 0 : clock);
      a.b.group.rotation.y = lerpAngle(a.b.group.rotation.y, a.rotTarget, 1 - Math.exp(-dt * 9));
      if (a.bubbleUntil < clock) a.bubbleEl.hidden = true;
    });
    hosts.forEach((hh) => {
      if (clock > hh.nextThink) { hh.nextThink = clock + 7 + Math.random() * 7; think(hh); }
      if (clock > hh.nextChirp) { hh.nextChirp = clock + 8 + Math.random() * 10; if (!hh.move) { act(hh, 'CHIRP', 0.5); playCall(Math.random() < 0.2 ? 'call' : 'chirp', hh.pitch, loudness(hh) * 0.6); } }
      if (!hh.move && !(hh.action && hh.action.until > clock) && hh.pos.distanceTo(player.pos) < 1.8) hh.rotTarget = angleTo(hh.pos, player.pos);
    });
    keepApart();
    stepBall(dt);
    stepToys(dt);
    stepParticles(dt);
    stepCamera(dt);
    marker.material.opacity = Math.max(0, 0.8 - (clock - markerT) * 1.4);
    marker.scale.setScalar(1 + (clock - markerT) * 0.8);
    renderMirror();
    renderer.render(scene, camera);
    actors.forEach((a) => { const up = 0.3 + 1.1 * (a.b.size || 1); place(a.tagEl, a.pos, up); place(a.bubbleEl, a.pos, up); });
  }
  raf = requestAnimationFrame(frame);

  // ---- actions the page can call -----------------------------------------------
  return {
    chirp() {
      act(player, 'CHIRP', 0.7);
      say(player, pick(CHIRPS), 1.2);
      playCall('chirp', 1, 0.85);
      hosts.forEach((hh) => {
        if (hh.pos.distanceTo(player.pos) > 7) return;
        setTimeout(() => {
          act(hh, 'CHIRP', 0.7);
          if (mood === 'GRUMPY') { say(hh, tr('꽥!', 'Squawk!')); playCall('screech', hh.pitch, loudness(hh)); }
          else { say(hh, pick(REPLIES)); playCall('chirp', hh.pitch, loudness(hh)); }
          if (!hh.move) hh.rotTarget = angleTo(hh.pos, player.pos);
        }, 400 + Math.random() * 600);
      });
    },
    /** Returns the friend's name, or null when the room has no bird. */
    playTogether() {
      const n = nearestHost();
      if (!n) return null;
      const hh = n.h;
      meet(hh, () => {
        faceEachOther(player, hh);
        act(player, 'DANCE', 2.4);
        act(hh, 'DANCE', 2.4);
        hearts(player.pos.clone().lerp(hh.pos, 0.5));
        say(hh, pick(PLAY_LINES), 2);
        playCall('call', hh.pitch, loudness(hh));
        setTimeout(() => playCall('chirp', 1, 0.8), 500);
      });
      return hh.name;
    },
    preen() {
      const n = nearestHost();
      if (!n) return null;
      const hh = n.h;
      meet(hh, () => {
        faceEachOther(player, hh);
        act(player, 'PREEN', 2.6);
        act(hh, 'PREENED', 2.6);
        say(hh, pick(PREEN_LINES), 2.2);
        setTimeout(() => playCall('chirp', hh.pitch * 0.9, loudness(hh) * 0.6), 1800);
      });
      return hh.name;
    },
    dropFeather(color) {
      const m = featherMesh(color);
      const p = player.pos;
      const fp = floorPoint(p.x, p.z);
      m.position.set(fp.x, p.y + 0.8, fp.z);
      m.rotation.y = Math.random() * Math.PI;
      scene.add(m);
      falling.push({ m, t: 0, y0: p.y + 0.8, x0: fp.x });
      act(player, 'CHIRP', 0.6);
      say(player, tr('깃털 놓고 갈게!', 'Leaving a feather!'), 1.8);
      playCall('chirp', 1, 0.8);
    },
    dispose() {
      gone = true;
      if (mirror) { mirror.rt.dispose(); mirror.glassMat.dispose(); }
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
