// 앵파크 realtime client. Protocol: docs/park-realtime.md (v1), server: realtime/ module.
// Positions go out at most 5 times a second and only when they changed; the server batches
// everyone's changes into one "presence" message per channel every 200 ms.
import { ParrotColors, Species } from '../api';

export const PROTOCOL_VERSION = 1;

export interface NetLook {
  name: string;
  species: Species;
  colors: ParrotColors;
  /** the 앵로그 handle of a logged-in bird owner, so others can visit the house */
  home?: string | null;
}
export interface NetState {
  x: number;
  y: number;
  z: number;
  ry: number;
  m: number;
}
export interface NetPlayer extends NetState {
  pid: number;
  look: NetLook;
}
export type NetStatus = 'connecting' | 'online' | 'offline';

export interface NetHandlers {
  status(s: NetStatus): void;
  welcome(players: NetPlayer[], online: number): void;
  joined(p: NetPlayer): void;
  moved(pid: number, s: NetState): void;
  left(pid: number): void;
  look(pid: number, look: NetLook): void;
  emote(pid: number, id: string): void;
  say(pid: number, n: number): void;
  online(n: number): void;
}

export interface NetClient {
  emote(id: 'chirp' | 'dance'): void;
  say(n: number): void;
  setLook(look: NetLook): void;
  close(): void;
}

/** Where the realtime server is: VITE_REALTIME_URL, or the local dev server; null means play offline. */
export function realtimeUrl(): string | null {
  const fromEnv = import.meta.env.VITE_REALTIME_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK !== '1') return `ws://${location.hostname}:8090/ws`;
  return null;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function connectPark(url: string, firstLook: NetLook, getState: () => NetState | null, on: NetHandlers): NetClient {
  let look = firstLook;
  let ws: WebSocket | null = null;
  let me = -1;
  let closedByUs = false;
  let attempts = 0;
  let moveTimer = 0;
  let pingTimer = 0;
  let retryTimer = 0;
  let lastSent = '';

  const send = (msg: object) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  function open() {
    on.status('connecting');
    try {
      ws = new WebSocket(url);
    } catch {
      retry();
      return;
    }
    ws.onopen = () => {
      const s = getState() ?? { x: 0, y: 0, z: 23, ry: 0, m: 0 };
      send({ type: 'hello', v: PROTOCOL_VERSION, look, ...pos(s) });
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case 'welcome': {
          attempts = 0;
          me = msg.pid;
          on.status('online');
          on.welcome((msg.players ?? []).filter((p: NetPlayer) => p.pid !== me), msg.online ?? 1);
          lastSent = '';
          window.clearInterval(moveTimer);
          moveTimer = window.setInterval(sendMove, Math.max(200, msg.moveMs ?? 200));
          window.clearInterval(pingTimer);
          pingTimer = window.setInterval(() => send({ type: 'ping', t: Date.now() }), msg.heartbeatMs ?? 10_000);
          break;
        }
        case 'presence': {
          (msg.joined ?? []).forEach((p: NetPlayer) => p.pid !== me && on.joined(p));
          (msg.moved ?? []).forEach((r: number[]) => r[0] !== me && on.moved(r[0], { x: r[1], y: r[2], z: r[3], ry: r[4], m: r[5] }));
          (msg.looks ?? []).forEach((l: { pid: number; look: NetLook }) => l.pid !== me && on.look(l.pid, l.look));
          (msg.emotes ?? []).forEach((e: [number, string]) => e[0] !== me && on.emote(e[0], e[1]));
          (msg.says ?? []).forEach((e: [number, number]) => e[0] !== me && on.say(e[0], e[1]));
          (msg.left ?? []).forEach((pid: number) => on.left(pid));
          if (typeof msg.online === 'number') on.online(msg.online);
          break;
        }
        default:
          break;
      }
    };
    ws.onclose = (ev) => {
      window.clearInterval(moveTimer);
      window.clearInterval(pingTimer);
      ws = null;
      if (closedByUs) return;
      on.status('offline');
      // a different protocol version will not get better by retrying
      if (ev.code === 4001) return;
      retry();
    };
    ws.onerror = () => {
      // onclose follows
    };
  }

  function retry() {
    if (closedByUs || attempts >= 6) {
      on.status('offline');
      return;
    }
    const wait = Math.min(30_000, 1500 * 2 ** attempts);
    attempts += 1;
    retryTimer = window.setTimeout(open, wait);
  }

  function pos(s: NetState) {
    return { x: round(s.x), y: round(s.y), z: round(s.z), ry: round(s.ry), m: s.m };
  }

  function sendMove() {
    const s = getState();
    if (!s) return;
    const p = pos(s);
    const key = `${p.x},${p.y},${p.z},${p.ry},${p.m}`;
    if (key === lastSent) return;
    lastSent = key;
    send({ type: 'move', ...p });
  }

  // a hidden tab stops its timers; the server then drops it after the heartbeat timeout, which is fine
  open();

  return {
    emote(id) {
      send({ type: 'emote', id });
    },
    say(n) {
      send({ type: 'say', n });
    },
    setLook(next) {
      look = next;
      send({ type: 'look', look });
    },
    close() {
      closedByUs = true;
      window.clearInterval(moveTimer);
      window.clearInterval(pingTimer);
      window.clearTimeout(retryTimer);
      ws?.close(1000);
      ws = null;
    },
  };
}
