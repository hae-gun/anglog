import { tr } from '../i18n';

// 옷장: 앵파크에서 받은 꾸미기 아이템과, 지금 입고 있는 것. 이 기기에만 기억한다.
// 입은 것은 "scarf:#47B3A6"이나 "pepero" 같은 짧은 글로 실시간 서버를 거쳐 다른 사람 화면에도 보인다
// (서버는 모양만 확인해서, 새 아이템을 넣을 때 서버는 바꾸지 않아도 된다. 모델은 room3d/bird.js).
// 새 아이템: ITEMS에 한 줄, bird.js의 worn.<id>에 모양 한 덩어리.

export type ItemId = 'scarf' | 'pepero';

export interface ItemDef {
  id: ItemId;
  name: () => string;
  /** how to get it, shown while it is still locked */
  how: () => string;
  /** an item that comes in a colour picked when it is given */
  colored?: boolean;
}

export const ITEMS: ItemDef[] = [
  { id: 'scarf', name: () => tr('털실 목도리', 'Knitted scarf'), how: () => tr('모란이와 첫 산책을 끝내면 받아요', 'Finish the first walk with Moran'), colored: true },
  { id: 'pepero', name: () => tr('빼빼로 물기', 'Pepero in the beak'), how: () => tr('11월 빼빼로 숲에서 상자를 열어 빼빼로 5개를 찾으면 받아요', 'Find 5 Pepero in the boxes of the November Pepero Forest') },
];

interface Owned { color?: string }
interface Store { owned: Partial<Record<ItemId, Owned>>; worn: ItemId[] }

const KEY = 'anglog-wardrobe';
const OLD_SCARF_KEY = 'anglog-scarf';
// 가을 공원에 어울리는 털실 색들
const YARN = ['#E8573D', '#F2A33A', '#F4D35E', '#6CB86A', '#3E9BD6', '#7A6FD8', '#E86FA6', '#F5F0E6', '#8C5A3C', '#2F4858', '#D94F70', '#47B3A6'];
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const known = (id: string): id is ItemId => ITEMS.some((i) => i.id === id);

export function loadWardrobe(): Store {
  const empty: Store = { owned: {}, worn: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Store;
      const owned: Store['owned'] = {};
      Object.entries(v.owned || {}).forEach(([id, o]) => {
        if (known(id)) owned[id] = o && typeof o.color === 'string' && COLOR.test(o.color) ? { color: o.color } : {};
      });
      return { owned, worn: (v.worn || []).filter((id): id is ItemId => known(id) && !!owned[id]) };
    }
    // the scarf used to be stored on its own
    const scarf = localStorage.getItem(OLD_SCARF_KEY);
    if (scarf && COLOR.test(scarf)) return { owned: { scarf: { color: scarf } }, worn: ['scarf'] };
  } catch {
    // private mode or a broken value: start empty
  }
  return empty;
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // kept for this visit only
  }
}

/** Gives an item (a new random colour for a coloured one) and puts it on. */
export function giveItem(id: ItemId): Store {
  const s = loadWardrobe();
  const def = ITEMS.find((i) => i.id === id)!;
  let color: string | undefined;
  if (def.colored) {
    const pool = YARN.filter((c) => c !== s.owned[id]?.color);
    color = pool[Math.floor(Math.random() * pool.length)];
  }
  s.owned[id] = color ? { color } : {};
  if (!s.worn.includes(id)) s.worn.push(id);
  save(s);
  return s;
}

export function setWorn(id: ItemId, on: boolean): Store {
  const s = loadWardrobe();
  if (!s.owned[id]) return s;
  s.worn = on ? [...s.worn.filter((x) => x !== id), id] : s.worn.filter((x) => x !== id);
  save(s);
  return s;
}

/** What the bird shows, as sent to the park and to bird.js: ["scarf:#47B3A6", "pepero"]. */
export function wearList(s: Store): string[] {
  return s.worn.map((id) => (s.owned[id]?.color ? `${id}:${s.owned[id]!.color}` : id));
}
