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
