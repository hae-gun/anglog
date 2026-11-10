import { tr } from '../i18n';
import type { ParrotColors, Species } from '../api';

/*
 * Reads a parrot photo in the browser and suggests a species and the five part colors.
 * The photo never leaves the device: it is drawn small on a canvas, read once and dropped.
 *
 * Steps
 *  1. shrink to about 112 px and turn every pixel into Lab (distances there match what eyes see)
 *  2. background: flood fill from the border through pixels close to the border colors
 *  3. group the remaining bird pixels into a few color clusters (k-means)
 *  4. score each species from the cluster mix (grey share, warm face patch, dark cap, barring...)
 *  5. hand each part (face, head, body, wing, tail) the cluster that fits that species
 *
 * This is color reasoning, not image recognition: color mutations (a blue lovebird, a lutino
 * cockatiel) and busy backgrounds can fool it, so the result is shown as a guess the owner can fix.
 */

type Lab = [number, number, number];

export interface PhotoCluster {
  lab: Lab;
  hex: string;
  /** share of the bird pixels, 0..1 */
  share: number;
  /** centroid in the frame, 0..1 */
  x: number;
  y: number;
  L: number;
  /** chroma (colorfulness) */
  C: number;
  /** hue angle in degrees, 0..360 */
  h: number;
}

export interface PhotoAnalysis {
  clusters: PhotoCluster[];
  /** dark-light alternation inside the bird, roughly 0..1 (budgie wings and heads score high) */
  barring: number;
  /** share of the frame the bird took */
  coverage: number;
  /** species ranked by score, best first */
  ranking: { species: Species; score: number }[];
  /** best guess, or null when no species clearly wins */
  species: Species | null;
  confident: boolean;
  /** why the guess is shaky, in Korean, or null */
  caution: string | null;
}

// ---------- color math ----------

function srgbToLinear(v: number) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v: number) {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}
const XN = 0.95047, YN = 1, ZN = 1.08883;
function f(t: number) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}
function finv(t: number) {
  return t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27);
}
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / XN;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / YN;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / ZN;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToHex([L, a, b]: Lab): string {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = finv(fx) * XN, Y = finv(fy) * YN, Z = finv(fz) * ZN;
  const R = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
  const G = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
  const B = X * 0.0557 - Y * 0.204 + Z * 1.057;
  return '#' + [R, G, B].map((v) => linearToSrgb(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function hexToLab(hex: string): Lab {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
function dist2(p: Lab, q: Lab) {
  const dL = p[0] - q[0], da = p[1] - q[1], db = p[2] - q[2];
  return dL * dL + da * da + db * db;
}
function chroma(l: Lab) {
  return Math.hypot(l[1], l[2]);
}
function hue(l: Lab) {
  const h = (Math.atan2(l[2], l[1]) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}
/** Same hue and colorfulness, new lightness. */
function withL(l: Lab, L: number): Lab {
  return [Math.max(4, Math.min(96, L)), l[1], l[2]];
}

// ---------- loading ----------

/** Decodes an image file or blob. Throws a Korean message when the browser cannot read it. */
export async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (!file.type.startsWith('image/')) throw new Error(tr('사진 파일만 읽을 수 있어요.', 'Only photo files can be read.'));
  try {
    if ('createImageBitmap' in window) return await createImageBitmap(file);
  } catch {
    // some browsers refuse createImageBitmap for some formats; fall back to <img>
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error(tr('이 사진은 열 수 없어요. JPG나 PNG로 다시 시도해 주세요.', 'Could not open this photo. Please try a JPG or PNG.'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SIZE = 112;

/** Pixels of the photo shrunk to about SIZE on the long side. */
export function readPixels(img: CanvasImageSource & { width: number; height: number }) {
  const k = SIZE / Math.max(img.width, img.height);
  const w = Math.max(8, Math.round(img.width * k));
  const h = Math.max(8, Math.round(img.height * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(tr('이 브라우저에서는 사진을 읽을 수 없어요.', 'This browser cannot read photos.'));
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

// ---------- clustering ----------

/** k-means in Lab with a deterministic k-means++ start. Returns centers and the label of each point. */
function kmeans(points: Lab[], k: number, iters = 14) {
  const n = points.length;
  const centers: Lab[] = [];
  // start from the point nearest the mean color, then spread out (farthest-weighted, no randomness)
  const mean: Lab = [0, 0, 0];
  points.forEach((p) => { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; });
  let first = 0, best = Infinity;
  points.forEach((p, i) => { const d = dist2(p, mean); if (d < best) { best = d; first = i; } });
  centers.push([...points[first]] as Lab);
  const dmin = new Float64Array(n).fill(Infinity);
  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let far = -1, farD = -1;
    for (let i = 0; i < n; i++) {
      const d = dist2(points[i], c);
      if (d < dmin[i]) dmin[i] = d;
      if (dmin[i] > farD) { farD = dmin[i]; far = i; }
    }
    if (farD < 9) break; // everything is already within about 3 Lab units
    centers.push([...points[far]] as Lab);
  }
  const labels = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(points[i], centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      labels[i] = bi;
      const s = sum[bi];
      s[0] += points[i][0]; s[1] += points[i][1]; s[2] += points[i][2]; s[3]++;
    }
    centers.forEach((c, i) => {
      const s = sum[i];
      if (s[3]) { c[0] = s[0] / s[3]; c[1] = s[1] / s[3]; c[2] = s[2] / s[3]; }
    });
  }
  return { centers, labels };
}

// ---------- background ----------

/**
 * Marks background pixels: flood fill from every border pixel, stepping to neighbours whose color
 * is close to the step before and close to one of the main border colors.
 */
function backgroundMask(lab: Lab[], w: number, h: number) {
  const border: Lab[] = [];
  const side: number[] = []; // 0 top, 1 bottom, 2 left, 3 right
  for (let x = 0; x < w; x++) { border.push(lab[x], lab[(h - 1) * w + x]); side.push(0, 1); }
  for (let y = 1; y < h - 1; y++) { border.push(lab[y * w], lab[y * w + w - 1]); side.push(2, 3); }
  const { centers, labels } = kmeans(border, 6, 8);
  const count = new Array(centers.length).fill(0);
  const sides = centers.map(() => [0, 0, 0, 0]);
  labels.forEach((l, i) => { count[l]++; sides[l][side[i]]++; });
  // border colors that cover a real stretch of the edge (a bird touching the frame is not background),
  // or that cross the picture from one side to the opposite one (a perch, a shelf edge)
  const bg = centers.filter((_, i) => {
    const sh = count[i] / border.length;
    const [t, b, l, r] = sides[i];
    const crosses = (l >= 2 && r >= 2) || (t >= 2 && b >= 2);
    return sh > 0.08 || (sh > 0.012 && crosses);
  });

  const isBg = new Uint8Array(w * h);
  const near = (p: Lab) => bg.some((c) => dist2(p, c) < 17 * 17);
  const queue: number[] = [];
  const push = (i: number) => { if (!isBg[i] && near(lab[i])) { isBg[i] = 1; queue.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w, y = (i / w) | 0;
    const step = (j: number) => {
      if (isBg[j]) return;
      if (dist2(lab[i], lab[j]) < 8 * 8 && near(lab[j])) { isBg[j] = 1; queue.push(j); }
    };
    if (x > 0) step(i - 1);
    if (x < w - 1) step(i + 1);
    if (y > 0) step(i - w);
    if (y < h - 1) step(i + w);
  }
  return isBg;
}

/**
 * Keeps the bird: the foreground piece that is big and near the middle, plus pieces close to it
 * (a tail cut off by a perch). Small specks left over from the background are dropped.
 */
function keepCentralBlob(isBg: Uint8Array, w: number, h: number) {
  const comp = new Int32Array(w * h).fill(-1);
  const info: { n: number; x: number; y: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let s = 0; s < w * h; s++) {
    if (isBg[s] || comp[s] >= 0) continue;
    const id = info.length;
    const c = { n: 0, x: 0, y: 0, x0: w, x1: 0, y0: h, y1: 0 };
    const st = [s];
    comp[s] = id;
    while (st.length) {
      const i = st.pop()!;
      const x = i % w, y = (i / w) | 0;
      c.n++; c.x += x; c.y += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const go = (j: number) => { if (!isBg[j] && comp[j] < 0) { comp[j] = id; st.push(j); } };
      if (x > 0) go(i - 1);
      if (x < w - 1) go(i + 1);
      if (y > 0) go(i - w);
      if (y < h - 1) go(i + w);
    }
    c.x /= c.n; c.y /= c.n;
    info.push(c);
  }
  if (info.length < 2) return;
  const score = info.map((c) => c.n * (1.2 - Math.hypot(c.x / w - 0.5, c.y / h - 0.5)));
  let main = 0;
  score.forEach((v, i) => { if (v > score[main]) main = i; });
  const m = info[main];
  const padX = (m.x1 - m.x0) * 0.25, padY = (m.y1 - m.y0) * 0.25;
  const keep = info.map((c, i) => i === main || (c.n >= m.n * 0.04 &&
    c.x1 >= m.x0 - padX && c.x0 <= m.x1 + padX && c.y1 >= m.y0 - padY && c.y0 <= m.y1 + padY));
  for (let i = 0; i < w * h; i++) if (!isBg[i] && !keep[comp[i]]) isBg[i] = 1;
}

// ---------- analysis ----------

const SPECIES_ORDER: Species[] = ['LOVEBIRD', 'BUDGIE', 'COCKATIEL', 'QUAKER', 'GREEN_CHEEKED_CONURE'];

const isGreen = (c: PhotoCluster) => c.C > 18 && c.h >= 105 && c.h < 190;
const isBlue = (c: PhotoCluster) => c.C > 14 && c.h >= 190 && c.h < 300;
const isYellow = (c: PhotoCluster) => c.C > 22 && c.h >= 75 && c.h < 105 && c.L > 55;
/** red, orange and peach faces */
const isWarm = (c: PhotoCluster) => c.C > 24 && (c.h < 75 || c.h >= 330) && c.L > 28;
const isMaroon = (c: PhotoCluster) => c.C > 14 && (c.h < 55 || c.h >= 330) && c.L <= 42;
const isGrey = (c: PhotoCluster) => c.C < 13 && c.L >= 38 && c.L < 86;
const isWhite = (c: PhotoCluster) => c.C < 16 && c.L >= 86;
/** dark brownish grey, like a conure cap */
const isCap = (c: PhotoCluster) => c.C < 22 && c.L >= 18 && c.L < 45;
const isDark = (c: PhotoCluster) => c.L < 22;

function share(cs: PhotoCluster[], test: (c: PhotoCluster) => boolean) {
  return cs.reduce((s, c) => s + (test(c) ? c.share : 0), 0);
}
/** 1 inside [lo, hi], falling to 0 at lo-pad and hi+pad */
function band(v: number, lo: number, hi: number, pad: number) {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return Math.max(0, 1 - d / pad);
}

function scoreSpecies(cs: PhotoCluster[], barring: number): { species: Species; score: number }[] {
  const green = share(cs, isGreen), blue = share(cs, isBlue), yellow = share(cs, isYellow);
  const warm = share(cs, isWarm), maroon = share(cs, isMaroon), grey = share(cs, isGrey);
  const white = share(cs, isWhite), cap = share(cs, isCap);
  const bodyColor = Math.max(green, blue);

  const s: Record<string, number> = {
    // green or blue body with a red, orange or peach face patch; plain wings
    LOVEBIRD: band(bodyColor, 0.35, 0.9, 0.3) * band(warm, 0.06, 0.4, 0.06) * (1 - Math.min(1, barring * 1.6)) * (1 - grey * 0.8) * (1 - Math.min(0.8, cap * 4)),
    // barred head and wings, yellow or white face over a green or blue body
    BUDGIE: band(barring, 0.16, 1, 0.12) * band(yellow + white, 0.06, 0.6, 0.08) * band(bodyColor, 0.2, 0.85, 0.2) * (1 - Math.min(1, warm * 4)),
    // grey (or white) body, yellow face and crest, little green or blue
    COCKATIEL: band(grey + white, 0.3, 1, 0.25) * band(yellow + white + warm, 0.05, 0.8, 0.06) * (1 - Math.min(1, bodyColor * 2.2)),
    // green with a large grey forehead and chest
    QUAKER: band(green + blue, 0.3, 0.85, 0.25) * band(grey + white, 0.14, 0.55, 0.1) * (1 - Math.min(1, warm * 3)) * (1 - Math.min(1, barring * 1.5)),
    // green body, dark cap, maroon belly and tail
    GREEN_CHEEKED_CONURE: band(green, 0.3, 0.85, 0.25) * band(cap, 0.06, 0.35, 0.06) * (0.35 + 0.65 * band(maroon + warm * 0.5, 0.04, 0.35, 0.05)) * (1 - Math.min(1, grey * 1.5)),
  };
  return SPECIES_ORDER.map((sp) => ({ species: sp, score: s[sp] })).sort((a, b) => b.score - a.score);
}

/** Reads a decoded photo. Pure color work, about 20 ms on a phone. */
export function analyzePixels(px: { w: number; h: number; data: Uint8ClampedArray }): PhotoAnalysis {
  const { w, h, data } = px;
  const lab: Lab[] = new Array(w * h);
  for (let i = 0; i < w * h; i++) lab[i] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

  let isBg = backgroundMask(lab, w, h);
  let fg = 0;
  isBg.forEach((b) => { if (!b) fg++; });
  // the fill ate almost everything (bird the same color as the wall) or nothing at all:
  // fall back to an ellipse in the middle, where people put the bird
  if (fg < w * h * 0.06 || fg > w * h * 0.97) {
    isBg = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x / w - 0.5) / 0.34, dy = (y / h - 0.5) / 0.4;
        if (dx * dx + dy * dy > 1) isBg[y * w + x] = 1;
      }
    }
    fg = 0;
    isBg.forEach((b) => { if (!b) fg++; });
  }

  keepCentralBlob(isBg, w, h);
  fg = 0;
  isBg.forEach((b) => { if (!b) fg++; });

  const idx: number[] = [];
  const pts: Lab[] = [];
  for (let i = 0; i < w * h; i++) if (!isBg[i]) { idx.push(i); pts.push(lab[i]); }

  const { centers, labels } = kmeans(pts, 8);
  // people put the bird in the middle of the picture: pixels there count for more than ones at the
  // edges, which are more often leftover background (a cage bar, a cushion)
  const acc = centers.map(() => ({ n: 0, wt: 0, x: 0, y: 0 }));
  const members: Lab[][] = centers.map(() => []);
  let wsum = 0;
  labels.forEach((l, j) => {
    const i = idx[j];
    const dx = (i % w) / w - 0.5, dy = ((i / w) | 0) / h - 0.5;
    const wt = Math.exp(-(dx * dx + dy * dy) / (2 * 0.28 * 0.28));
    acc[l].wt += wt;
    wsum += wt;
    acc[l].n++;
    acc[l].x += (i % w) / w;
    acc[l].y += ((i / w) | 0) / h;
    members[l].push(pts[j]);
  });
  // the color shown is the more vivid half of the cluster: thin dark bars and shadows mixed into a
  // patch make the plain average look muddier than the bird does to the eye
  const vivid = (ms: Lab[], c: Lab): Lab => {
    if (ms.length < 6) return c;
    const sorted = ms.slice().sort((p, q) => chroma(q) + q[0] * 0.25 - (chroma(p) + p[0] * 0.25));
    const top = sorted.slice(0, Math.ceil(sorted.length / 2));
    const m: Lab = [0, 0, 0];
    top.forEach((p) => { m[0] += p[0] / top.length; m[1] += p[1] / top.length; m[2] += p[2] / top.length; });
    return m;
  };
  const clusters: PhotoCluster[] = centers
    .map((c, i) => ({
      lab: c, hex: labToHex(vivid(members[i], c)), share: acc[i].wt / wsum,
      x: acc[i].n ? acc[i].x / acc[i].n : 0.5, y: acc[i].n ? acc[i].y / acc[i].n : 0.5,
      L: c[0], C: chroma(c), h: hue(c),
    }))
    .filter((c) => c.share >= 0.015)
    .sort((a, b) => b.share - a.share);

  // barring: how often a dark pixel sits next to a light one inside the bird
  let pairs = 0, edges = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (isBg[i] || isBg[i + 1]) continue;
      pairs++;
      const a = lab[i][0], b = lab[i + 1][0];
      if ((a < 32 && b > 58) || (b < 32 && a > 58)) edges++;
    }
  }
  const barring = pairs ? Math.min(1, (edges / pairs) * 9) : 0;

  const ranking = scoreSpecies(clusters, barring);
  const [top, second] = ranking;
  const coverage = fg / (w * h);
  let caution: string | null = null;
  // a lot of "bird" usually means the background got mixed in
  if (coverage > 0.33) caution = tr('배경이 섞였을 수 있어요. 새가 크게 나오게 자른 사진이면 더 정확해요.', 'Some background may be mixed in. A photo cropped close to the bird works better.');
  // blue and white color mutations look alike across species (a blue lovebird and a blue quaker)
  else if (share(clusters, isBlue) > share(clusters, isGreen) && top.species !== 'BUDGIE') caution = tr('파란 계열 앵무는 종끼리 색이 비슷해서 헷갈릴 수 있어요.', 'Blue parrots of different species look alike, so this may be off.');
  const confident = !caution && top.score >= 0.35 && top.score - second.score >= 0.15;
  return {
    clusters, barring, coverage, ranking,
    species: top.score >= 0.15 ? top.species : null,
    confident, caution,
  };
}

// ---------- parts ----------

function pick(cs: PhotoCluster[], test: (c: PhotoCluster) => boolean, by: (c: PhotoCluster) => number = (c) => c.share) {
  let best: PhotoCluster | null = null, bv = -Infinity;
  cs.forEach((c) => { if (test(c) && by(c) > bv) { bv = by(c); best = c; } });
  return best as PhotoCluster | null;
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/**
 * Turns the clusters into the five part colors for a species. The species decides where each
 * color goes (a quaker's grey is its face, a cockatiel's grey is its body), so changing the
 * species re-runs this on the same photo instead of resetting to stock colors.
 */
export function partsFor(a: PhotoAnalysis, species: Species, fallback: ParrotColors): ParrotColors {
  const cs = a.clusters.filter((c) => !isDark(c) || species === 'GREEN_CHEEKED_CONURE');
  if (!cs.length) return fallback;
  const hex = (c: PhotoCluster | null, def: string) => (c ? c.hex : def);

  let body: PhotoCluster | null;
  if (species === 'COCKATIEL') body = pick(cs, (c) => isGrey(c) || isWhite(c)) ?? pick(cs, () => true);
  else body = pick(cs, (c) => isGreen(c) || isBlue(c)) ?? pick(cs, (c) => c.C > 15) ?? pick(cs, () => true);
  const b = body!;

  // wing: same hue family as the body but darker; or the body a step darker
  const wingC = pick(cs, (c) => c !== b && c.C > 10 && hueGap(c.h, b.h) < 28 && c.L < b.L - 3, (c) => c.share);
  const wing = wingC ? wingC.hex : labToHex(withL(b.lab, b.L - 9));

  let face: string, head: string, tail = wing;
  switch (species) {
    case 'LOVEBIRD': {
      const warm = cs.filter(isWarm).sort((p, q) => q.share - p.share);
      const f0 = warm[0] ?? pick(cs, (c) => isYellow(c) || isWhite(c));
      face = hex(f0, fallback.face);
      // the forehead is the deeper, redder part of the mask
      const redder = warm.slice(0, 3).filter((c) => c !== f0).sort((p, q) => (p.h - q.h) || (p.L - q.L))[0];
      head = redder ? redder.hex : f0 ? labToHex(withL([f0.lab[0], f0.lab[1] * 1.12, f0.lab[2] * 0.92], f0.L - 8)) : fallback.head;
      break;
    }
    case 'BUDGIE': {
      const f0 = pick(cs, (c) => isYellow(c) || isWhite(c) || (c.C < 18 && c.L > 70));
      face = hex(f0, fallback.face);
      head = face;
      const t = pick(cs, (c) => c !== b && isBlue(c) && c.L < b.L + 5) ?? pick(cs, (c) => c !== b && c.L < 45 && c.C > 8);
      tail = t ? t.hex : wing;
      break;
    }
    case 'COCKATIEL': {
      const f0 = pick(cs, isYellow) ?? pick(cs, (c) => isWhite(c) && c !== b);
      face = hex(f0, fallback.face);
      head = face;
      tail = labToHex(withL(b.lab, b.L - 6));
      break;
    }
    case 'QUAKER': {
      const greys = cs.filter((c) => isGrey(c) || isWhite(c)).sort((p, q) => q.share - p.share);
      face = hex(greys[0] ?? null, fallback.face);
      // forehead a touch darker than the chest
      head = greys[1] ? greys.slice(0, 2).sort((p, q) => p.L - q.L)[0].hex : greys[0] ? labToHex(withL(greys[0].lab, greys[0].L - 5)) : fallback.head;
      break;
    }
    case 'GREEN_CHEEKED_CONURE': {
      face = b.hex;
      head = hex(pick(cs, (c) => isCap(c) && !isMaroon(c)) ?? pick(cs, (c) => c.L < 40 && c.C < 25), fallback.head);
      tail = hex(pick(cs, (c) => isMaroon(c) || (isWarm(c) && c.L < 50)), fallback.tail);
      break;
    }
    default: {
      // unknown bird: the most different colorful patch becomes the face
      const f0 = pick(cs, (c) => c !== b && c.C > 15, (c) => c.share * (1 + hueGap(c.h, b.h) / 60));
      face = hex(f0, labToHex(withL(b.lab, b.L + 12)));
      head = face;
    }
  }
  return { face, head, body: b.hex, wing, tail };
}

/** One call for the form: file in, analysis out. */
export async function analyzePhoto(file: Blob): Promise<PhotoAnalysis> {
  const img = await loadImage(file);
  try {
    return analyzePixels(readPixels(img));
  } finally {
    if ('close' in img) img.close();
  }
}
