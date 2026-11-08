import type { ParrotColors, Species } from '../api';

const DEFAULT: ParrotColors = { face: '#F2784B', head: '#E0473A', body: '#5DBB4A', wing: '#4A9A3B', tail: '#4A9A3B' };

/** Flat drawing of a parrot in its owner's colors. Used for avatars and the color preview. */
export function BirdAvatar({ colors = DEFAULT, species, title }: { colors?: ParrotColors; species?: Species; title?: string }) {
  const c = colors;
  return (
    <svg viewBox="0 0 64 56" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="64" height="56" fill="#CFE3F5" />
      <rect x="4" y="47" width="56" height="4" rx="2" fill="#9C7048" />
      <path d={species === 'COCKATIEL' || species === 'BUDGIE' ? 'M14 38 L-2 52 L8 36z' : 'M16 38 L4 46 L12 34z'} fill={c.tail} />
      <ellipse cx="27" cy="34" rx="15" ry="12" fill={c.body} />
      <ellipse cx="22" cy="35" rx="10" ry="7" fill={c.wing} />
      <circle cx="38" cy="22" r="10" fill={c.face} />
      <path d="M31 15 q7 -5 13 1 q-6 0 -13 3z" fill={c.head} />
      {species === 'COCKATIEL' && <path d="M35 13 q-2 -9 5 -12 q-2 6 0 11z" fill={c.head} />}
      {species === 'COCKATIEL' && <circle cx="40" cy="27" r="3" fill="#F07C3E" />}
      <circle cx="40" cy="21" r="2.2" fill="#2B2622" />
      <circle cx="40.8" cy="20.2" r="0.7" fill="#fff" />
      <path d="M46 22 q5 1 3 6 q-3 -1 -4 -3z" fill="#F3E3C8" />
      <rect x="24" y="44" width="2" height="4" fill="#C9A9A0" />
      <rect x="30" y="44" width="2" height="4" fill="#C9A9A0" />
    </svg>
  );
}
