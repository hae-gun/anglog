// Real lovebird calls (recorded at home, cut into short clips in /public/sounds).
// Each bird plays them at its own pitch so several birds sound like different voices.

const CLIPS = {
  chirp: ['s1', 's2', 's3'],
  call: ['mid1', 'mid2'],
  screech: ['long1', 'long2', 'long3'],
} as const;

export type Call = keyof typeof CLIPS;

let muted = false;
try {
  muted = localStorage.getItem('jjak-muted') === '1';
} catch {
  /* storage optional */
}

const pool = new Map<string, HTMLAudioElement[]>();

function element(name: string): HTMLAudioElement {
  const list = pool.get(name) ?? [];
  pool.set(name, list);
  const free = list.find((a) => a.paused || a.ended);
  if (free) return free;
  const a = new Audio(`/sounds/${name}.mp3`);
  a.preload = 'auto';
  list.push(a);
  return a;
}

/** pitch: 1 = as recorded. volume 0..1 */
export function playCall(kind: Call, pitch = 1, volume = 0.8) {
  if (muted) return;
  const names = CLIPS[kind];
  const a = element(names[Math.floor(Math.random() * names.length)]);
  try {
    a.currentTime = 0;
    a.volume = Math.max(0, Math.min(1, volume));
    // keep the bird's own pitch instead of time-stretching
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    a.playbackRate = pitch * (0.96 + Math.random() * 0.08);
    void a.play().catch(() => undefined);
  } catch {
    /* audio is optional */
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('jjak-muted', m ? '1' : '0');
  } catch {
    /* storage optional */
  }
}

// small synthesized sounds (no files): a toy bell, seeds being cracked, a splash of water
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function noise(c: AudioContext, sec: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}
export type Fx = 'bell' | 'crunch' | 'splash';
export function playFx(kind: Fx, volume = 0.5) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime, out = c.createGain();
  out.connect(c.destination);
  out.gain.value = Math.max(0, Math.min(1, volume));
  if (kind === 'bell') {
    // two bright partials ringing out
    [[2350, 0.5, 1.1], [3520, 0.25, 0.6], [5100, 0.12, 0.35]].forEach(([f, g, len]) => {
      const o = c.createOscillator(), e = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      e.gain.setValueAtTime(g, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(e).connect(out);
      o.start(t);
      o.stop(t + len);
    });
  } else {
    const len = kind === 'crunch' ? 0.06 : 0.35;
    const src = noise(c, len), f = c.createBiquadFilter(), e = c.createGain();
    f.type = kind === 'crunch' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'crunch' ? 2500 : 900;
    e.gain.setValueAtTime(kind === 'crunch' ? 0.6 : 0.5, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(e).connect(out);
    src.start(t);
  }
}
