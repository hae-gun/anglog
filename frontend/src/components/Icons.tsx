const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const HomeIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg>
);
export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
);
export const RoomIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M4 20V8l8-4 8 4v12" /><path d="M4 20h16" /><rect x="9" y="11" width="6" height="5" /></svg>
);
export const HeartIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
);
export const CommentIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M4 5h16v11H9l-5 4z" /></svg>
);
export const FeatherIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M20 4C11 4 6 9 6 16v4" /><path d="M6 16c6 0 11-3 14-12" /><path d="M10 13l4-1" /></svg>
);
