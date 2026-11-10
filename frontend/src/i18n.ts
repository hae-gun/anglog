// Korean and English screens. Only the app's own words change: diaries, comments, names and
// guestbook notes stay exactly as their writers wrote them.
//
// Each place keeps both words side by side: tr('일기 쓰기', 'Write a diary'). No key files to keep in step.
// The choice lives on this device (localStorage); first visit follows the browser language.
import { useSyncExternalStore } from 'react';

export type Lang = 'ko' | 'en';
const KEY = 'anglog-lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    /* private mode: fall through */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let lang: Lang = initial();
const listeners = new Set<() => void>();
function stamp() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = lang === 'en' ? 'Anglog: Parrot Park' : '앵로그';
}
stamp();

export const getLang = () => lang;
export const isEn = () => lang === 'en';

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  stamp();
  listeners.forEach((f) => f());
}

/** The words for the current language. Both are evaluated, so keep them cheap. */
export function tr<T>(ko: T, en: T): T {
  return lang === 'en' ? en : ko;
}

/** Re-renders the caller when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f); },
    () => lang,
    () => lang,
  );
}

/** "3분 전" / "3m ago" style times. */
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr('방금', 'just now');
  const m = Math.floor(s / 60);
  if (m < 60) return tr(`${m}분 전`, `${m}m ago`);
  const h = Math.floor(m / 60);
  if (h < 24) return tr(`${h}시간 전`, `${h}h ago`);
  const d = Math.floor(h / 24);
  if (d < 7) return tr(`${d}일 전`, `${d}d ago`);
  const dt = new Date(iso);
  return lang === 'en'
    ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: dt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
    : `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}
