// 첫 산책(튜토리얼)을 끝내면 모란이가 주는 목도리. 색은 랜덤이고 이 기기에만 기억한다.
// 앵파크에서 내 앵무 목에 둘러지고, 실시간 서버를 거쳐 다른 사람 화면에도 보인다(colors.scarf).

const KEY = 'anglog-scarf';

// 가을 공원에 어울리는 털실 색들
const YARN = ['#E8573D', '#F2A33A', '#F4D35E', '#6CB86A', '#3E9BD6', '#7A6FD8', '#E86FA6', '#F5F0E6', '#8C5A3C', '#2F4858', '#D94F70', '#47B3A6'];

export function loadScarf(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** A new scarf in a random colour (not the same as the one I already have). */
export function giveScarf(): string {
  const old = loadScarf();
  const pool = YARN.filter((c) => c !== old);
  const color = pool[Math.floor(Math.random() * pool.length)];
  try {
    localStorage.setItem(KEY, color);
  } catch {
    // worn for this visit only
  }
  return color;
}
