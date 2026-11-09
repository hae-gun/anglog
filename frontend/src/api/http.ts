import { AdminComment, AdminGuestbook, AdminOverview, AdminUser, Api, ApiError, Comment, ParkState, FeedTab, GuestbookEntry, NewPost, Page, Parrot, ParrotInput, Post, Room, RoomCard, UserSummary } from './types';

// Where the API lives. Empty: the same origin (Vite proxy in development).
// On GitHub Pages: https://api.anglog.nobody-asked.dev (set by the Pages workflow at build time).
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

/** Photo paths come back as /media/...; on another origin they need the API address in front. */
function absolutize(v: unknown): unknown {
  if (!API_BASE) return v;
  if (typeof v === 'string') return v.startsWith('/media/') ? API_BASE + v : v;
  if (Array.isArray(v)) return v.map(absolutize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = absolutize(x);
    return out;
  }
  return v;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  // the session cookie belongs to the API host, so it must be sent along on cross-origin calls
  const init: RequestInit = { method, credentials: API_BASE ? 'include' : 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(API_BASE + url, init);
  } catch {
    // the server is down, the network dropped, or the browser blocked the call (the raw message is "Failed to fetch")
    throw new ApiError(0, 'NETWORK', '앵로그 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: { code?: string; message?: string } | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // an HTML error page from a proxy (502 while the server restarts, and so on)
    throw new ApiError(res.status, 'UNAVAILABLE', '앵로그 서버가 잠시 대답하지 않아요. 조금 뒤 다시 시도해 주세요.');
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? '요청을 처리하지 못했어요.');
  }
  return absolutize(data) as T;
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined) s.set(k, String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const httpApi: Api = {
  me: () => request<UserSummary | undefined>('GET', '/api/auth/me').then((u) => u ?? null),
  devLogin: (handle, nickname) => request('POST', '/api/auth/dev-login', { handle, nickname }),
  signUp: (handle, nickname, password) => request('POST', '/api/auth/signup', { handle, nickname, password }),
  login: (handle, password) => request('POST', '/api/auth/login', { handle, password }),
  logout: () => request('POST', '/api/auth/logout'),
  parkToken: () => request<{ token: string; expiresInSec: number }>('POST', '/api/park/token'),

  myParrots: () => request<Parrot[]>('GET', '/api/parrots/mine'),
  createParrot: (input: ParrotInput) => request('POST', '/api/parrots', input),
  updateParrot: (id, input) => request('PUT', `/api/parrots/${id}`, input),

  feed: (tab: FeedTab, cursor) => request<Page<Post>>('GET', `/api/feed${q({ tab, cursor })}`),
  post: (id) => request('GET', `/api/posts/${id}`),
  createPost: (input: NewPost) => {
    const form = new FormData();
    if (input.body) form.append('body', input.body);
    if (input.parrotId != null) form.append('parrotId', String(input.parrotId));
    if (input.weightG != null) form.append('weightG', String(input.weightG));
    if (input.mood) form.append('mood', input.mood);
    input.images.forEach((blob, i) => form.append('images', blob, `photo-${i + 1}.jpg`));
    return request('POST', '/api/posts', form);
  },
  deletePost: (id) => request('DELETE', `/api/posts/${id}`),
  like: (id, on) => request(on ? 'POST' : 'DELETE', `/api/posts/${id}/like`),

  comments: (postId, after) => request<Page<Comment>>('GET', `/api/posts/${postId}/comments${q({ after })}`),
  addComment: (postId, body) => request('POST', `/api/posts/${postId}/comments`, { body }),
  deleteComment: (id) => request('DELETE', `/api/comments/${id}`),

  follow: (handle, on) => request(on ? 'POST' : 'DELETE', `/api/users/${handle}/follow`),

  room: (handle) => request<Room>('GET', `/api/rooms/${handle}`),
  roomPosts: (handle, cursor) => request<Page<Post>>('GET', `/api/rooms/${handle}/posts${q({ cursor })}`),
  leaveFeather: (handle) => request('POST', `/api/rooms/${handle}/feathers`),
  guestbook: (handle, cursor) => request<Page<GuestbookEntry>>('GET', `/api/rooms/${handle}/guestbook${q({ cursor })}`),
  writeGuestbook: (handle, body) => request('POST', `/api/rooms/${handle}/guestbook`, { body }),
  deleteGuestbook: (id) => request('DELETE', `/api/guestbook/${id}`),

  exploreRooms: () => request<RoomCard[]>('GET', '/api/explore/rooms'),
  randomRoom: (exclude) => request<{ handle: string } | undefined>('GET', `/api/explore/random${q({ exclude })}`).then((r) => r?.handle ?? null),

  admin: {
    overview: () => request<AdminOverview>('GET', '/api/admin/overview'),
    users: (query, cursor) => request<Page<AdminUser>>('GET', `/api/admin/users${q({ q: query || null, cursor })}`),
    suspend: (id, reason) => request<AdminUser>('POST', `/api/admin/users/${id}/suspend`, { reason }),
    unsuspend: (id) => request<AdminUser>('POST', `/api/admin/users/${id}/unsuspend`),
    posts: (cursor) => request<Page<Post>>('GET', `/api/admin/posts${q({ cursor })}`),
    deletePost: (id) => request('DELETE', `/api/admin/posts/${id}`),
    comments: (cursor) => request<Page<AdminComment>>('GET', `/api/admin/comments${q({ cursor })}`),
    deleteComment: (id) => request('DELETE', `/api/admin/comments/${id}`),
    guestbook: (cursor) => request<Page<AdminGuestbook>>('GET', `/api/admin/guestbook${q({ cursor })}`),
    deleteGuestbook: (id) => request('DELETE', `/api/admin/guestbook/${id}`),
    park: () => request<ParkState>('GET', '/api/admin/park'),
    kick: (channel, pid, minutes) => request('POST', '/api/admin/park/kick', { channel, pid, minutes }),
    metamoa: () => request('GET', '/api/admin/metamoa'),
    metamoaUpdate: (text) => request('POST', '/api/admin/metamoa/update', { text }),
    metamoaEvents: () => request('GET', '/api/admin/metamoa/events'),
    metamoaAddEvent: (e) => request('POST', '/api/admin/metamoa/events', e),
    metamoaDeleteEvent: (id) => request('DELETE', `/api/admin/metamoa/events/${encodeURIComponent(id)}`).then(() => undefined),
  },
};
