// 앵파크 배경음: 파일 없이 Web Audio로 그 자리에서 만든다.
// 화창한 낮 공원 느낌: 마림바가 쿵 짝 쿵 짝 반주하고, 짧은 멜로디가 되풀이되며 조금씩 바뀐다.
// 아주 작은 셰이커로 걷는 리듬을 주고, 멀리 작은 새가 가끔 지저귄다.
// 아련하게 들리지 않도록 maj7, add9 같은 화음과 긴 잔향, 느린 패드는 쓰지 않는다.
// 같은 코드로 미리 듣기 파일도 만든다(OfflineAudioContext에 renderAmbience).

const BPM = 96;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// F장조. MIDI 번호(60 = 가운데 도). 한 마디에 화음 하나, 8마디가 한 바퀴
// F Bb F C | Dm Bb C F: 밝은 으뜸화음으로 자주 돌아온다
const CHORDS: { root: number; fifth: number; stab: number[]; tones: number[] }[] = [
  { root: 41, fifth: 48, stab: [60, 65, 69], tones: [72, 77, 81, 84] }, // F
  { root: 46, fifth: 41, stab: [62, 65, 70], tones: [74, 77, 82, 86] }, // Bb
  { root: 41, fifth: 48, stab: [60, 65, 69], tones: [72, 77, 81, 84] }, // F
  { root: 36, fifth: 43, stab: [60, 64, 67], tones: [72, 76, 79, 84] }, // C
  { root: 38, fifth: 45, stab: [62, 65, 69], tones: [74, 77, 81, 86] }, // Dm
  { root: 46, fifth: 41, stab: [62, 65, 70], tones: [74, 77, 82, 86] }, // Bb
  { root: 36, fifth: 43, stab: [60, 64, 67], tones: [72, 76, 79, 84] }, // C
  { root: 41, fifth: 48, stab: [60, 65, 69], tones: [72, 77, 81, 84] }, // F
];
// F장조 음계, 멜로디 음역(C5 ~ F6)
const SCALE = [72, 74, 76, 77, 79, 81, 82, 84, 86, 88, 89];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A tiny seeded random so a preview file is the same each time it is made. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  music: GainNode;
  nature: GainNode;
  reverb: GainNode;
  noise: AudioBuffer;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, rand: () => number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 4);
  }
  return buf;
}

function makeNoise(ctx: BaseAudioContext, seconds: number, rand: () => number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
  return buf;
}

function build(ctx: BaseAudioContext, out: AudioNode, rand: () => number): Graph {
  const master = ctx.createGain();
  master.gain.value = 0;
  // 휴대폰 스피커에서 웅웅거리지 않게 아주 낮은 소리는 걷어 낸다
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 80;
  hp.Q.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  master.connect(hp).connect(comp).connect(out);

  // 짧은 잔향: 야외 공원이라 멀리 퍼지지 않고 살짝만 울린다
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 1.2, rand);
  const reverb = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  reverb.connect(conv).connect(wet).connect(master);

  const music = ctx.createGain();
  music.gain.value = 0.9;
  music.connect(master);
  const nature = ctx.createGain();
  nature.gain.value = 0.6;
  nature.connect(master);
  return { ctx, master, music, nature, reverb, noise: makeNoise(ctx, 2, rand) };
}

/** Wooden mallet on a bar: bright knock, quick fall. Used for the melody and the chords. */
function marimba(g: Graph, t: number, midi: number, vel: number, pan: number, len = 0.9, send = 0.35) {
  const { ctx } = g;
  const f = hz(midi);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  amp.connect(p);
  p.connect(g.music);
  if (send > 0) {
    const s = ctx.createGain();
    s.gain.value = send;
    p.connect(s).connect(g.reverb);
  }
  // 기음과, 마림바 소리를 만드는 4배 배음(짧게 반짝)
  ([[1, 1, 1], [4, 0.28, 0.12], [10, 0.05, 0.04]] as const).forEach(([mul, lv, decay]) => {
    if (f * mul > 16000) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * mul;
    const e = ctx.createGain();
    e.gain.setValueAtTime(lv, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, len * decay));
    o.connect(e).connect(amp);
    o.start(t);
    o.stop(t + len + 0.02);
  });
}

/** A soft round bass note, short like a plucked string. */
function bass(g: Graph, t: number, midi: number, vel: number) {
  const { ctx } = g;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = hz(midi);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.linearRampToValueAtTime(vel, t + 0.01);
  e.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.12);
  e.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 1.6);
  o.connect(lp).connect(e).connect(g.music);
  o.start(t);
  o.stop(t + BEAT * 1.7);
}

/** A light shaker tick. */
function shaker(g: Graph, t: number, vel: number, offset: number) {
  const { ctx } = g;
  const src = ctx.createBufferSource();
  src.buffer = g.noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.linearRampToValueAtTime(vel, t + 0.008);
  e.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(hp).connect(e).connect(g.music);
  src.start(t, offset);
  src.stop(t + 0.08);
}

/** A far-off little songbird: two to four quick whistles, very quiet, somewhere left or right. */
function songbird(g: Graph, t: number, rand: () => number) {
  const { ctx } = g;
  const p = ctx.createStereoPanner();
  p.pan.value = (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.5);
  const lv = ctx.createGain();
  lv.gain.value = 0.04 + rand() * 0.02;
  p.connect(lv);
  lv.connect(g.nature);
  const send = ctx.createGain();
  send.gain.value = 0.8;
  lv.connect(send).connect(g.reverb);
  const base = 2600 + rand() * 1400;
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.11 + rand() * 0.08);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const up = rand() < 0.6;
    o.frequency.setValueAtTime(base * (up ? 0.85 : 1.15), at);
    o.frequency.exponentialRampToValueAtTime(base * (up ? 1.25 : 0.8), at + 0.07);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, at);
    e.gain.linearRampToValueAtTime(1, at + 0.012);
    e.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    o.connect(e).connect(p);
    o.start(at);
    o.stop(at + 0.1);
  }
}

/**
 * Writes the music bar by bar. scheduleUntil(time) fills in everything up to that time, so the live
 * player can call it a little ahead of the clock and the preview renderer can call it once.
 *
 * The melody is made of 2-bar ideas: a rhythm is picked once and played twice (question, answer)
 * with the notes following the chords, so it sounds like a little tune rather than random notes.
 */
function composer(g: Graph, t0: number, rand: () => number) {
  let bar = 0;
  let next = t0;
  let nextBird = t0 + 5 + rand() * 6;
  let rhythm: number[] = [];
  let last = 77;

  // 두 마디(8분음표 16칸) 중 어디서 칠지. 강박에 많이, 끝은 비워 숨 쉴 자리를 둔다
  const newRhythm = () => {
    const r: number[] = [];
    for (let step = 0; step < 16; step++) {
      const strong = step % 4 === 0;
      const onBeat = step % 2 === 0;
      const p = step >= 14 ? 0.1 : strong ? 0.85 : onBeat ? 0.55 : 0.3;
      if (rand() < p) r.push(step);
    }
    return r.length >= 4 ? r : [0, 2, 4, 8, 10];
  };

  const noteFor = (step: number, chord: (typeof CHORDS)[number]) => {
    // 강박은 화음 음, 사이는 음계에서 한두 칸 움직인다
    if (step % 4 === 0) {
      const near = [...chord.tones].sort((a, b) => Math.abs(a - last) - Math.abs(b - last));
      return near[rand() < 0.7 ? 0 : 1];
    }
    const i = SCALE.indexOf(last);
    const from = i < 0 ? Math.max(0, SCALE.findIndex((m) => m >= last)) : i;
    const move = rand() < 0.5 ? 1 : -1;
    const j = Math.max(0, Math.min(SCALE.length - 1, from + move * (rand() < 0.75 ? 1 : 2)));
    return SCALE[j];
  };

  return {
    scheduleUntil(time: number) {
      while (next < time) {
        const chord = CHORDS[bar % CHORDS.length];
        const phraseBar = bar % 16;

        // 쿵(베이스) 짝(화음) 쿵 짝
        bass(g, next, chord.root + 12, 0.15);
        bass(g, next + BEAT * 2, chord.fifth + 12, 0.11);
        [1, 3].forEach((b) => {
          chord.stab.forEach((m, k) => marimba(g, next + BEAT * b + k * 0.006, m, 0.075, (k - 1) * 0.35, 0.28, 0.15));
        });
        // 셰이커: 8분음표, 뒷박을 살짝 세게
        for (let s = 0; s < 8; s++) shaker(g, next + s * (BEAT / 2), s % 2 ? 0.05 : 0.025, rand() * 1.5);

        // 멜로디: 처음 두 마디는 반주만, 16마디마다 마지막 2마디도 반주만(쉬는 자리)
        if (bar >= 2 && phraseBar < 14) {
          // 4마디마다 새 리듬을 정하고, 2마디 묶음 두 개(물음, 대답)에 같이 쓴다
          if (bar % 4 === 2 || rhythm.length === 0) rhythm = newRhythm();
          const half = (bar % 2) * 8;
          rhythm.filter((s) => s >= half && s < half + 8).forEach((s) => {
            const at = next + (s - half) * (BEAT / 2);
            const m = noteFor(s, chord);
            last = m;
            marimba(g, at, m, 0.24 + rand() * 0.06, (rand() - 0.5) * 0.4, 0.9, 0.35);
          });
        }

        // 멀리 작은 새가 가끔
        while (nextBird < next + BAR) {
          songbird(g, nextBird, rand);
          nextBird += 8 + rand() * 12;
        }
        bar++;
        next += BAR;
      }
    },
  };
}

// ---- live player in the park ----

let live: {
  ctx: AudioContext;
  g: Graph;
  timer: number;
  onVisible: () => void;
} | null = null;

const MUSIC_KEY = 'anglog-park-music';

export function musicOn(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setMusicOn(on: boolean) {
  try {
    localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  } catch {
    // remembered for this visit only
  }
}

/** Starts the park's background sound (call from a tap or key press: browsers block sound before that). */
export function startAmbience(volume = 0.26) {
  if (live) {
    if (live.ctx.state === 'suspended') void live.ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const rand = rng(Date.now());
    const g = build(ctx, ctx.destination, rand);
    const t0 = ctx.currentTime + 0.1;
    g.master.gain.setValueAtTime(0.0001, t0);
    g.master.gain.linearRampToValueAtTime(volume, t0 + 4);
    const c = composer(g, t0 + 0.5, rand);
    c.scheduleUntil(ctx.currentTime + 2);
    const timer = window.setInterval(() => c.scheduleUntil(ctx.currentTime + 2), 400);
    // 다른 탭에 가 있으면 멈춰서 배터리를 아낀다
    const onVisible = () => {
      if (!live) return;
      if (document.hidden) void live.ctx.suspend();
      else void live.ctx.resume();
    };
    document.addEventListener('visibilitychange', onVisible);
    live = { ctx, g, timer, onVisible };
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    live = null;
  }
}

/** Fades out and lets go of everything. */
export function stopAmbience() {
  if (!live) return;
  const { ctx, g, timer, onVisible } = live;
  live = null;
  window.clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
  try {
    const t = ctx.currentTime;
    g.master.gain.cancelScheduledValues(t);
    g.master.gain.setValueAtTime(g.master.gain.value, t);
    g.master.gain.linearRampToValueAtTime(0.0001, t + 1);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1300);
  } catch {
    // already gone
  }
}

/** For a preview file: renders `seconds` of the same sound into an offline context. */
export function renderAmbience(ctx: OfflineAudioContext, seconds: number, seed = 7, volume = 0.5) {
  const rand = rng(seed);
  const g = build(ctx, ctx.destination, rand);
  g.master.gain.setValueAtTime(0.0001, 0);
  g.master.gain.linearRampToValueAtTime(volume, 3);
  g.master.gain.setValueAtTime(volume, seconds - 3);
  g.master.gain.linearRampToValueAtTime(0.0001, seconds);
  composer(g, 0.5, rand).scheduleUntil(seconds - 2);
}
