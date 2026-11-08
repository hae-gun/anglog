import { ParrotColors, Species } from '../api';

/** The bird you play as without a login (or before registering a bird). Lives only in this browser. */
export interface GuestBird {
  name: string;
  species: Species;
  colors: ParrotColors;
}

const KEY = 'jjak-guest-bird';

export const DEFAULT_GUEST: GuestBird = {
  name: '손님',
  species: 'OTHER',
  colors: { face: '#F3EDE0', head: '#F3EDE0', body: '#9BC9A0', wing: '#7FAE86', tail: '#7FAE86' },
};

export function loadGuestBird(): GuestBird {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GUEST;
    const v = JSON.parse(raw) as GuestBird;
    if (!v || typeof v.name !== 'string' || !v.colors || !v.colors.body) return DEFAULT_GUEST;
    return { name: v.name.slice(0, 20) || DEFAULT_GUEST.name, species: v.species || 'OTHER', colors: v.colors };
  } catch {
    return DEFAULT_GUEST;
  }
}

export function saveGuestBird(b: GuestBird) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // private mode: the bird still works for this visit
  }
}
