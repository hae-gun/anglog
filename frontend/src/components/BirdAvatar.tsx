import type { ParrotColors, Species } from '../api';

const DEFAULT: ParrotColors = { face: '#F2784B', head: '#E0473A', body: '#5DBB4A', wing: '#4A9A3B', tail: '#4A9A3B' };

/** Flat drawing of a parrot in its owner's colors. Used for avatars and the color preview. */
export function BirdAvatar({ colors = DEFAULT, species, title }: { colors?: ParrotColors; species?: Species; title?: string }) {
  const c = colors;
  return (
    <svg viewBox="0 0 64 56" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="64" height="56" fill="#CFE3F5" />
      <rect x="4" y="47" width="56" height="4" rx="2" fill="#9C7048" />
      <path d={species && species !== 'LOVEBIRD' && species !== 'OTHER' ? 'M14 38 L-2 54 L8 36z' : 'M16 38 L4 46 L12 34z'} fill={c.tail} />
      <ellipse cx="27" cy="34" rx="15" ry="12" fill={c.body} />
      {(species === 'QUAKER' || species === 'GREEN_CHEEKED_CONURE') && (
        <g>
          <ellipse cx="35" cy="35" rx="7" ry="8" fill={species === 'QUAKER' ? c.face : '#ffffff'} opacity={species === 'QUAKER' ? 1 : 0.35} />
          <path d="M31 31 q4 2 8 0 M31 35 q4 2 8 0 M31 39 q4 2 8 0" stroke="#2B2622" strokeOpacity="0.35" strokeWidth="1" fill="none" />
        </g>
      )}
      <ellipse cx="22" cy="35" rx="10" ry="7" fill={c.wing} />
      {species === 'BUDGIE' && <path d="M15 33 q3 -2 6 0 M19 36 q3 -2 6 0 M15 38 q3 -2 6 0" stroke="#1E1E1E" strokeWidth="1.3" fill="none" />}
      <circle cx="38" cy="22" r="10" fill={c.face} />
      {species === 'GREEN_CHEEKED_CONURE'
        ? <path d="M28 22 q1 -11 12 -10 q5 1 7 5 q-8 -2 -13 3 q-3 2 -6 2z" fill={c.head} />
        : <path d="M31 15 q7 -5 13 1 q-6 0 -13 3z" fill={c.head} />}
      {species === 'BUDGIE' && (
        <g>
          <path d="M29 17 q3 -2 5 0 M28 21 q3 -2 5 0" stroke="#1E1E1E" strokeWidth="1.1" fill="none" />
          <circle cx="45.5" cy="20" r="1.6" fill="#6F8FD8" />
          <circle cx="37" cy="30" r="0.9" fill="#1E1E1E" />
          <circle cx="40" cy="31" r="0.9" fill="#1E1E1E" />
          <circle cx="39" cy="26.5" r="1.6" fill="#6E5DB8" />
        </g>
      )}
      {species === 'GREEN_CHEEKED_CONURE' && <circle cx="40" cy="21" r="3.6" fill="#F4F1EA" />}
      {species === 'COCKATIEL' && <path d="M35 13 q-3 -10 5 -13 q-2 7 0 12z M32 14 q-5 -8 0 -12 q0 6 2 11z" fill={c.head} />}
      {species === 'COCKATIEL' && <circle cx="40" cy="27" r="3" fill="#F07C3E" />}
      <circle cx="40" cy="21" r="2.2" fill="#2B2622" />
      <circle cx="40.8" cy="20.2" r="0.7" fill="#fff" />
      <path d="M46 22 q5 1 3 6 q-3 -1 -4 -3z" fill="#F3E3C8" />
      <rect x="24" y="44" width="2" height="4" fill="#C9A9A0" />
      <rect x="30" y="44" width="2" height="4" fill="#C9A9A0" />
    </svg>
  );
}
