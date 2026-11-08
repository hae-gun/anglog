import { Api, ApiError, Comment, FeedTab, GuestbookEntry, NewPost, Page, Parrot, ParrotInput, Post, Room, RoomCard, UserSummary } from './types';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? '요청을 처리하지 못했어요.');
  }
  return data as T;
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
  logout: () => request('POST', '/api/auth/logout'),

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
};
