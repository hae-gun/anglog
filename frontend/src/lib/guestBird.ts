import { ParrotColors, Species } from '../api';
import { tr } from '../i18n';

/** The bird you play as without a login (or before registering a bird). Lives only in this browser. */
export interface GuestBird {
  name: string;
  species: Species;
  colors: ParrotColors;
}

const KEY = 'jjak-guest-bird';

export const DEFAULT_GUEST: GuestBird = {
  get name() { return tr('손님', 'Guest'); },
  species: 'OTHER',
  colors: { face: '#F3EDE0', head: '#F3EDE0', body: '#9BC9A0', wing: '#7FAE86', tail: '#7FAE86' },
};

export function loadGuestBird(): GuestBird {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GUEST;
    const v = JSON.parse(raw) as GuestBird;
    if (!v || typeof v.name !== 'string' || !v.colors || !v.colors.body) return DEFAULT_GUEST;
    // the default name follows the language; a name someone typed stays as typed
    const named = v.name === '손님' || v.name === 'Guest' ? '' : v.name.slice(0, 20);
    return { name: named || DEFAULT_GUEST.name, species: v.species || 'OTHER', colors: v.colors };
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
