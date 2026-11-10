// 앵파크 배경음: 파일 없이 Web Audio로 그 자리에서 만든다.
// 아주 옅은 나뭇잎 바람과 멀리 작은 새소리 위에, 밝은 패드 화음과 오르골 같은 멜로디가 띄엄띄엄 흐른다.
// (처음 버전의 낮은 바람은 크게 부풀었다 가라앉아 파도처럼 들려서 뺐다)
// 멜로디는 화음 안의 음과 F장조 5음 음계에서 그때그때 골라서 들을 때마다 조금씩 다르다.
// 같은 코드로 미리 듣기 파일도 만든다(OfflineAudioContext에 renderAmbience).

const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS_PER_CHORD = 2;

// F장조. 음 이름 대신 MIDI 번호(60 = 가운데 도)
// 밝은 장조 화음 위주: Fadd9, Cadd9, Bbmaj7, Fmaj7, Dm7 한 번, Bbadd9, Fadd9, Csus4
const CHORDS: { root: number; pad: number[]; tones: number[] }[] = [
  { root: 41, pad: [57, 60, 65, 67], tones: [72, 76, 77, 79, 81, 84] }, // Fadd9
  { root: 36, pad: [55, 60, 62, 64], tones: [72, 74, 76, 79, 84, 86] }, // Cadd9
  { root: 46, pad: [57, 58, 62, 65], tones: [74, 77, 81, 82, 84, 86] }, // Bbmaj7
  { root: 41, pad: [57, 60, 64, 65], tones: [72, 76, 77, 81, 84, 88] }, // Fmaj7
  { root: 38, pad: [57, 60, 62, 65], tones: [72, 74, 77, 81, 84, 86] }, // Dm7
  { root: 46, pad: [58, 60, 62, 65], tones: [74, 77, 79, 82, 84, 86] }, // Bbadd9
  { root: 41, pad: [57, 60, 65, 67], tones: [72, 76, 77, 79, 84, 88] }, // Fadd9
  { root: 36, pad: [55, 60, 62, 65], tones: [72, 74, 77, 79, 84, 86] }, // Csus4(다시 F로 돌아가며 풀림)
];
const PENTA = [72, 74, 77, 79, 81, 84, 86, 88]; // C D F G A C D E, 5음 음계를 한 옥타브 위로

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
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // 앞부분은 조금 비우고(먼 숲의 울림), 뒤로 갈수록 부드럽게 사라진다
      d[i] = (rand() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < ctx.sampleRate * 0.02 ? i / (ctx.sampleRate * 0.02) : 1);
    }
  }
  return buf;
}

function makeNoise(ctx: BaseAudioContext, seconds: number, rand: () => number) {
  // 갈색 잡음(낮은 쪽이 두꺼운 바람 소리)
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function build(ctx: BaseAudioContext, out: AudioNode, rand: () => number): Graph {
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.ratio.value = 3;
  comp.attack.value = 0.05;
  comp.release.value = 0.6;
  // 휴대폰 스피커에서 웅웅거리지 않게 아주 낮은 소리는 걷어 낸다
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 90;
  hp.Q.value = 0.5;
  master.connect(hp).connect(comp).connect(out);

  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 4.5, rand);
  const reverb = ctx.createGain();
  reverb.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(conv).connect(wet).connect(master);

  const music = ctx.createGain();
  music.gain.value = 0.9;
  music.connect(master);
  const nature = ctx.createGain();
  nature.gain.value = 0.55;
  nature.connect(master);
  return { ctx, master, music, nature, reverb, noise: makeNoise(ctx, 8, rand) };
}

/** Wind and a little stream, looping forever with slow swells. */
function startNature(g: Graph, t0: number, rand: () => number, until: number | null) {
  const { ctx } = g;
  const loop = (filterType: BiquadFilterType, freq: number, q: number, gain: number, lfoRate: number, lfoDepth: number, pan: number) => {
    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    src.loopStart = rand() * 2;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    // 느리게 부풀었다 가라앉는 바람
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const depth = ctx.createGain();
    depth.gain.value = gain * lfoDepth;
    lfo.connect(depth).connect(amp.gain);
    const cut = ctx.createGain();
    cut.gain.value = freq * 0.35;
    lfo.connect(cut).connect(f.frequency);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = Math.min(freq * 0.4, 260);
    src.connect(hp).connect(f).connect(amp).connect(p).connect(g.nature);
    src.start(t0, rand() * 6);
    lfo.start(t0);
    if (until != null) {
      src.stop(until);
      lfo.stop(until);
    }
    return [src, lfo];
  };
  // 나뭇잎 사이 바람만 아주 옅게. 부풂을 작게 해서 파도처럼 들리지 않게
  return [
    ...loop('bandpass', 2200, 0.7, 0.035, 0.11, 0.25, 0.3),
    ...loop('bandpass', 4200, 0.9, 0.018, 0.17, 0.25, -0.35),
  ];
}

/** A far-off little songbird: two to four quick whistles, very quiet, somewhere left or right. */
function songbird(g: Graph, t: number, rand: () => number) {
  const { ctx } = g;
  const p = ctx.createStereoPanner();
  p.pan.value = (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.5);
  const lv = ctx.createGain();
  lv.gain.value = 0.035 + rand() * 0.02;
  p.connect(lv);
  lv.connect(g.nature);
  const send = ctx.createGain();
  send.gain.value = 1.2;
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

/** One plucked note, like a kalimba or a music box. */
function pluck(g: Graph, t: number, midi: number, vel: number, pan: number) {
  const { ctx } = g;
  const f = hz(midi);
  const amp = ctx.createGain();
  const len = 2.2 + (90 - midi) * 0.03;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.25);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(7000, t);
  tone.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  amp.connect(tone).connect(p);
  p.connect(g.music);
  const send = ctx.createGain();
  send.gain.value = 0.9;
  p.connect(send).connect(g.reverb);
  // 기음, 옥타브, 칼림바 특유의 살짝 어긋난 배음
  ([[1, 1], [2, 0.3], [3, 0.06], [4.07, 0.08]] as const).forEach(([mul, lv]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * mul;
    const e = ctx.createGain();
    e.gain.setValueAtTime(lv, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + (mul > 1.5 ? len * 0.35 : len));
    o.connect(e).connect(amp);
    o.start(t);
    o.stop(t + len + 0.05);
  });
}

/** A soft pad chord: detuned triangles through a dark filter, slow in and slow out. */
function pad(g: Graph, t: number, notes: number[], dur: number, level: number) {
  const { ctx } = g;
  const amp = ctx.createGain();
  const attack = Math.min(3, dur * 0.35);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(level, t + attack);
  amp.gain.setValueAtTime(level, t + dur - 0.5);
  amp.gain.linearRampToValueAtTime(0.0001, t + dur + 2.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1300, t);
  lp.frequency.linearRampToValueAtTime(2100, t + dur * 0.6);
  lp.frequency.linearRampToValueAtTime(1200, t + dur + 2);
  lp.Q.value = 0.3;
  amp.connect(lp);
  lp.connect(g.music);
  const send = ctx.createGain();
  send.gain.value = 0.7;
  lp.connect(send).connect(g.reverb);
  notes.forEach((m, i) => {
    [-3, 3].forEach((cents, k) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(m);
      o.detune.value = cents + (i - 1.5) * 1.5;
      const p = ctx.createStereoPanner();
      p.pan.value = (k ? 0.35 : -0.35) * (i % 2 ? 1 : 0.6);
      const v = ctx.createGain();
      v.gain.value = 0.25 / notes.length;
      o.connect(v).connect(p).connect(amp);
      o.start(t);
      o.stop(t + dur + 3);
    });
  });
}

/** A low, round bass note at each chord change. */
function bass(g: Graph, t: number, midi: number, level: number) {
  const { ctx } = g;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = hz(midi);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.linearRampToValueAtTime(level, t + 0.25);
  e.gain.exponentialRampToValueAtTime(0.0001, t + BAR * BARS_PER_CHORD + 1);
  o.connect(e).connect(g.music);
  o.start(t);
  o.stop(t + BAR * BARS_PER_CHORD + 1.2);
}

/**
 * Writes the music bar by bar. scheduleUntil(time) fills in everything up to that time, so the live
 * player can call it a little ahead of the clock and the preview renderer can call it once.
 */
function composer(g: Graph, t0: number, rand: () => number) {
  let bar = 0;
  let next = t0;
  let lastNote = 79;
  let nextBird = t0 + 4 + rand() * 6;
  // 몇 마디는 멜로디를 쉬고 화음만 둔다(숨 쉬는 자리)
  let restUntil = 2;

  const melodyBar = (t: number, chord: (typeof CHORDS)[number], busy: number) => {
    // 8분음표 칸에 확률로 음을 놓는다. 앞 음과 가까운 음을 더 자주 골라서 노래처럼 이어지게
    for (let step = 0; step < 8; step++) {
      const onBeat = step % 2 === 0;
      if (rand() > (onBeat ? 0.42 : 0.16) * busy) continue;
      const pool = rand() < 0.6 ? chord.tones : PENTA;
      const near = pool.filter((m) => Math.abs(m - lastNote) <= 5);
      const list = near.length && rand() < 0.75 ? near : pool;
      const m = list[Math.floor(rand() * list.length)];
      lastNote = m;
      const swing = onBeat ? 0 : BEAT * 0.08;
      const at = t + step * (BEAT / 2) + swing + (rand() - 0.5) * 0.02;
      pluck(g, at, m, 0.42 + rand() * 0.16, (rand() - 0.5) * 0.7);
      // 가끔 아래 4도나 5도로 살짝 겹친다
      if (rand() < 0.12) pluck(g, at + 0.03, m - (rand() < 0.5 ? 5 : 7), 0.16, (rand() - 0.5) * 0.7);
      // 아주 가끔 한 옥타브 위에서 반짝
      if (rand() < 0.05) pluck(g, at + BEAT, m + 12, 0.12, (rand() - 0.5) * 0.9);
    }
  };

  return {
    scheduleUntil(time: number) {
      while (next < time) {
        const chordIndex = Math.floor(bar / BARS_PER_CHORD) % CHORDS.length;
        const chord = CHORDS[chordIndex];
        if (bar % BARS_PER_CHORD === 0) {
          pad(g, next, chord.pad, BAR * BARS_PER_CHORD, 0.2);
          bass(g, next, chord.root + 12, 0.05);
        }
        // 한 바퀴(16마디)마다 멜로디 밀도가 천천히 오르내린다
        const busy = 0.7 + 0.3 * Math.sin((bar / 16) * Math.PI);
        if (bar >= restUntil) {
          melodyBar(next, chord, busy);
          if (bar % 16 === 15 && rand() < 0.6) restUntil = bar + 1 + Math.floor(rand() * 3);
        }
        // 멀리 작은 새가 가끔
        while (nextBird < next + BAR) {
          songbird(g, nextBird, rand);
          nextBird += 7 + rand() * 12;
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
  sources: AudioScheduledSourceNode[];
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
export function startAmbience(volume = 0.32) {
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
    g.master.gain.linearRampToValueAtTime(volume, t0 + 5);
    const sources = startNature(g, t0, rand, null) as AudioScheduledSourceNode[];
    const c = composer(g, t0 + 1.5, rand);
    c.scheduleUntil(ctx.currentTime + 3);
    const timer = window.setInterval(() => c.scheduleUntil(ctx.currentTime + 3), 500);
    // 다른 탭에 가 있으면 멈춰서 배터리를 아낀다
    const onVisible = () => {
      if (!live) return;
      if (document.hidden) void live.ctx.suspend();
      else void live.ctx.resume();
    };
    document.addEventListener('visibilitychange', onVisible);
    live = { ctx, g, timer, sources, onVisible };
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
    g.master.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    // already gone
  }
}

/** For a preview file: renders `seconds` of the same sound into an offline context. */
export function renderAmbience(ctx: OfflineAudioContext, seconds: number, seed = 7, volume = 0.5) {
  const rand = rng(seed);
  const g = build(ctx, ctx.destination, rand);
  g.master.gain.setValueAtTime(0.0001, 0);
  g.master.gain.linearRampToValueAtTime(volume, 4);
  g.master.gain.setValueAtTime(volume, seconds - 4);
  g.master.gain.linearRampToValueAtTime(0.0001, seconds);
  startNature(g, 0, rand, seconds);
  composer(g, 1.5, rand).scheduleUntil(seconds - 5);
}
