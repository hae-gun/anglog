import type { ParrotColors, Species } from '../api';

const DEFAULT: ParrotColors = { face: '#F2784B', head: '#E0473A', body: '#5DBB4A', wing: '#4A9A3B', tail: '#4A9A3B' };

/** Mixes a hex color towards black (k < 1) or white (k > 1). */
function tone(hex: string, k: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1)));
  return '#' + ch.map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('');
}

// tail outlines per species: short round fan, or long and pointed
const TAILS: Record<string, string> = {
  short: 'M19 39 L9 47 Q11 50 14 48 L22 42z',
  long: 'M19 39 L0 56 L5 56 L23 42z',
  mid: 'M19 39 L4 54 Q8 56 10 54 L23 42z',
};

/**
 * Flat drawing of a parrot in its owner's colors. Used for avatars and the color preview.
 * Same idea as the 3D birds: upright body, folded wing with darker flight feathers, hooked beak.
 */
export function BirdAvatar({ colors = DEFAULT, species, title }: { colors?: ParrotColors; species?: Species; title?: string }) {
  const c = colors;
  const tail = species === 'LOVEBIRD' || species === 'OTHER' || !species ? 'short' : species === 'BUDGIE' || species === 'COCKATIEL' ? 'long' : 'mid';
  const flight = species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE' ? '#3D6FB8' : tone(c.wing, 0.7);
  const beak = species === 'GREEN_CHEEKED_CONURE' ? '#46413D' : species === 'COCKATIEL' ? '#9A9894' : species === 'QUAKER' ? '#F0B880' : '#F3E3C8';
  const foot = species === 'COCKATIEL' || species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE' ? '#8F8783' : '#C9A9A0';
  const chest = species === 'QUAKER' ? c.face : species === 'GREEN_CHEEKED_CONURE' ? tone(c.body, 0.85) : tone(c.body, 1.3);
  return (
    <svg viewBox="0 0 64 56" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="64" height="56" fill="#CFE3F5" />
      <rect x="4" y="47" width="56" height="4" rx="2" fill="#9C7048" />
      <path d={TAILS[tail]} fill={c.tail} />
      {(species === 'LOVEBIRD' || species === 'OTHER' || !species) && <ellipse cx="20" cy="38" rx="4" ry="3" fill="#4A8FD1" />}
      {/* upright teardrop body */}
      <ellipse cx="29" cy="33" rx="15" ry="11" transform="rotate(-38 29 33)" fill={c.body} />
      <ellipse cx="34" cy="34" rx="9" ry="8" transform="rotate(-38 34 34)" fill={chest} />
      {(species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE') && (
        <path d="M31 30 q3 2 6 0 M30 34 q3 2 6 0 M31 38 q3 2 6 0" stroke="#2B2622" strokeOpacity="0.3" strokeWidth="1" fill="none" />
      )}
      {species === 'GREEN_CHEEKED_CONURE' && <ellipse cx="31" cy="42" rx="5" ry="3" fill="#8E3B34" />}
      {/* folded wing: coverts, then flight feathers reaching over the tail */}
      <path d="M33 27 Q24 26 20 33 L15 44 L22 40 Q30 37 32 32z" fill={flight} />
      <path d="M33 27 Q24 26 21 33 Q22 38 28 37 Q33 34 33 27z" fill={c.wing} />
      {species === 'COCKATIEL' && <path d="M30 30 q-4 1 -6 5" stroke={tone(c.wing, 1.7)} strokeWidth="2.4" strokeLinecap="round" fill="none" />}
      {species === 'BUDGIE' && <path d="M24 31 q3 -2 6 0 M23 34 q3 -2 6 0 M25 37 q2 -1.5 4 0" stroke="#1E1E1E" strokeWidth="1.2" fill="none" />}
      {/* feet: two toes forward on the perch */}
      <path d="M31 43 v4 M28 43 v4" stroke={foot} strokeWidth="2" strokeLinecap="round" />
      <path d="M31 47 h3 M28 47 h3" stroke={foot} strokeWidth="1.6" strokeLinecap="round" />
      {species === 'COCKATIEL' && <path d="M38 11 q-3 -10 4 -11 q-2 5 -1 11z M35 12 q-6 -7 -2 -11 q0 5 3 10z" fill={c.head} />}
      <circle cx="40" cy="20" r="10" fill={c.face} />
      {species === 'GREEN_CHEEKED_CONURE'
        ? <path d="M30 20 q1 -11 12 -10 q5 1 7 5 q-8 -2 -13 3 q-3 2 -6 2z" fill={c.head} />
        : species === 'QUAKER'
          ? <path d="M36 11 q8 -3 12 4 q-4 0 -7 2 q-3 -3 -5 -6z" fill={c.head} />
          : <path d="M33 13 q7 -5 13 1 q-6 0 -13 3z" fill={c.head} />}
      {species === 'BUDGIE' && (
        <g>
          <path d="M31 15 q3 -2 5 0 M30 19 q3 -2 5 0" stroke="#1E1E1E" strokeWidth="1.1" fill="none" />
          <circle cx="40" cy="28.5" r="0.9" fill="#1E1E1E" />
          <circle cx="43" cy="29" r="0.9" fill="#1E1E1E" />
          <circle cx="42" cy="25" r="1.6" fill="#6E5DB8" />
        </g>
      )}
      {species === 'GREEN_CHEEKED_CONURE' && <circle cx="42" cy="19" r="3.6" fill="#F4F1EA" />}
      {species === 'COCKATIEL' && <circle cx="42" cy="25" r="3" fill="#F07C3E" />}
      {(species === 'LOVEBIRD' || species === 'OTHER' || !species) && <ellipse cx="42" cy="25" rx="2.4" ry="1.4" fill="#FF9C9C" />}
      <circle cx="42" cy="19" r="2.2" fill="#2B2622" />
      <circle cx="42.8" cy="18.2" r="0.7" fill="#fff" />
      {/* hooked beak: the upper half curls down over the small lower half */}
      <g transform={species === 'BUDGIE' ? 'translate(13.8 6) scale(0.7)' : undefined}>
        <path d="M47 23 q3 3 1 5 q-2 -1 -2 -3z" fill={tone(beak, 0.85)} />
        <path d="M46 17 q7 -1 7 6 q0 3 -2 4 q0 -4 -5 -5 q-1 -2 0 -5z" fill={beak} />
      </g>
      {species === 'BUDGIE' && <ellipse cx="47.5" cy="17.6" rx="1.9" ry="1.3" fill="#6F8FD8" />}
    </svg>
  );
}
