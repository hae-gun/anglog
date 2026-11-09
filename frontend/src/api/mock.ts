// An in-memory stand-in for the Spring API, so the app runs with `npm run dev:mock` and no server.
// It follows the same rules as the backend (one like per person, one feather per room per day, ...).
// Data lives only in this tab and resets on reload.

import {
  AdminUser, Api, ApiError, MetamoaEvent, ParkState, Comment, FeedTab, GuestbookEntry, Mood, MOODS, NewPost, Page, Parrot, ParrotInput,
  Post, Room, RoomCard, SPECIES, UserSummary,
} from './types';

interface DbPost {
  id: number; authorId: number; parrotId: number | null; body: string; weightG: number | null;
  mood: Mood | null; images: { url: string; width: number; height: number }[]; createdAt: string;
}

let seq = 1000;
const nextId = () => ++seq;
const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number, h = 9) => { const d = now(); d.setDate(d.getDate() - n); d.setHours(h, 12, 0, 0); return d; };
const seoulDay = (d: Date | string) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));

const users: UserSummary[] = [];
const parrots: (Parrot & { ownerId: number })[] = [];
const posts: DbPost[] = [];
const likes = new Set<string>();
const comments: (Comment & { postId: number; authorId: number })[] = [];
const follows = new Set<string>();
const guestbook: (GuestbookEntry & { ownerId: number; authorId: number })[] = [];
const feathers: { ownerId: number; visitorId: number; day: string; color: string }[] = [];
let meId: number | null = null;

const label = (s: Parrot['species']) => SPECIES.find((x) => x.value === s)!.label;
const moodLabel = (m: Mood | null) => (m ? MOODS.find((x) => x.value === m)!.label : null);
const userById = (id: number) => users.find((u) => u.id === id)!;
const byHandle = (h: string) => {
  const u = users.find((x) => x.handle === h.toLowerCase());
  if (!u) throw new ApiError(404, 'NOT_FOUND', '방을 찾을 수 없어요.');
  return u;
};
const requireMe = () => {
  if (meId == null) throw new ApiError(401, 'LOGIN_REQUIRED', '로그인이 필요해요.');
  return meId;
};
const strip = ({ ownerId: _o, ...p }: Parrot & { ownerId: number }): Parrot => p;

// ---- seed: three households and their birds, with painted placeholder photos -------------------

function paint(bg: string, body: string, face: string, scene: 'perch' | 'bath' | 'sleep' | 'paper'): { url: string; width: number; height: number } {
  const w = 900, h = 900;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, bg); grad.addColorStop(1, '#FFF8EC');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(560, 60, 260, 300);
  g.fillStyle = '#9C7048'; g.fillRect(80, 640, 740, 26);
  if (scene === 'bath') { g.fillStyle = '#9FC6D8'; g.beginPath(); g.ellipse(450, 690, 260, 70, 0, 0, Math.PI * 2); g.fill(); }
  const cx = 430, cy = scene === 'bath' ? 600 : 530;
  g.fillStyle = body; g.beginPath(); g.ellipse(cx, cy, 150, 125, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(cx - 60, cy + 10, 95, 70, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = face; g.beginPath(); g.arc(cx + 120, cy - 120, 95, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#F3E3C8'; g.beginPath(); g.moveTo(cx + 200, cy - 135); g.quadraticCurveTo(cx + 265, cy - 110, cx + 220, cy - 60); g.fill();
  g.fillStyle = '#2B2622';
  if (scene === 'sleep') { g.fillRect(cx + 125, cy - 140, 34, 7); } else { g.beginPath(); g.arc(cx + 140, cy - 135, 13, 0, Math.PI * 2); g.fill(); }
  if (scene === 'paper') { g.fillStyle = '#FFFFFF'; g.save(); g.translate(cx - 180, cy + 30); g.rotate(0.5); g.fillRect(-90, -12, 180, 24); g.restore(); }
  return { url: c.toDataURL('image/jpeg', 0.82), width: w, height: h };
}

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  const mk = (handle: string, nickname: string) => { const u = { id: nextId(), handle, nickname }; users.push(u); return u; };
  const haru = mk('haru', '하루네');
  const bori = mk('bori', '보리네');
  const kongi = mk('kongi', '콩이네');
  const bird = (ownerId: number, name: string, species: Parrot['species'], colors: Parrot['colors'], adopted: string, birth: string | null) => {
    const p = { id: nextId(), ownerId, name, species, speciesLabel: label(species), birthDate: birth, adoptedDate: adopted, colors };
    parrots.push(p); return p;
  };
  const haruBird = bird(haru.id, '하루', 'LOVEBIRD', { face: '#F2784B', head: '#E0473A', body: '#5DBB4A', wing: '#4A9A3B', tail: '#4A9A3B' }, '2025-03-14', null);
  const boriBird = bird(bori.id, '보리', 'QUAKER', { face: '#C9CFC4', head: '#B8C0B4', body: '#7DBB5A', wing: '#5E9A44', tail: '#5E9A44' }, '2024-08-02', '2024-05-20');
  const kongiBird = bird(kongi.id, '콩이', 'COCKATIEL', { face: '#F5E06A', head: '#F2D64A', body: '#B9B6B0', wing: '#8F8C87', tail: '#8F8C87' }, '2023-11-08', null);
  // neighbours who only registered a bird so far, so the park has a few more houses
  bird(mk('mango', '망고네').id, '망고', 'BUDGIE', { face: '#F5E06A', head: '#F2D64A', body: '#6CC24A', wing: '#3E5E2E', tail: '#2E5E8E' }, '2025-09-01', null);
  bird(mk('dubu', '두부네').id, '두부', 'LOVEBIRD', { face: '#F2A65A', head: '#F2D64A', body: '#F7EDB0', wing: '#EFE2A0', tail: '#EFE2A0' }, '2025-06-11', null);
  bird(mk('sora', '소라네').id, '소라', 'GREEN_CHEEKED_CONURE', { face: '#5DA84A', head: '#4A4038', body: '#5DA84A', wing: '#3E7E34', tail: '#A0302A' }, '2024-12-24', null);

  const add = (author: UserSummary, p: Parrot, body: string, day: number, weight: number | null, mood: Mood | null, scenes: ('perch' | 'bath' | 'sleep' | 'paper')[], bg: string) => {
    posts.push({
      id: nextId(), authorId: author.id, parrotId: p.id, body, weightG: weight, mood,
      images: scenes.map((s) => paint(bg, p.colors.body, p.colors.face, s)), createdAt: iso(daysAgo(day, 8 + (day % 5))),
    });
  };
  add(kongi, kongiBird, '콩이 볏이 하루 종일 바짝 서 있었다. 창밖 까치 보고 흥분한 듯', 6, 92, 'PLAYFUL', ['perch'], '#F3E4C4');
  add(bori, boriBird, '보리가 "안녕"을 드디어 말했다!! 녹음은 실패', 5, 101, 'HAPPY', ['perch', 'paper'], '#DDEFD3');
  add(haru, haruBird, '털갈이 시작. 바닥에 초록 깃털이 굴러다닌다', 4, 51, 'GRUMPY', ['sleep'], '#E9DCC8');
  add(haru, haruBird, '종이 찢어서 꼬리에 꽂기 신기록 세 장', 3, 52, 'PLAYFUL', ['paper', 'perch'], '#DCE8F2');
  add(kongi, kongiBird, '목욕하다가 물그릇 엎음. 본인은 만족', 2, 93, 'HAPPY', ['bath'], '#D6E3EF');
  add(haru, haruBird, '창가 횃대에서 꾸벅꾸벅. 오늘은 조용한 날', 1, 52, 'SLEEPY', ['sleep'], '#F1DCCB');
  add(haru, haruBird, '아침 체중 52g. 해바라기씨는 하루 두 알만', 0, 52, 'CALM', ['perch'], '#EDE4D3');

  follows.add(`${bori.id}>${haru.id}`);
  feathers.push({ ownerId: haru.id, visitorId: bori.id, day: seoulDay(daysAgo(1)), color: boriBird.colors.body });
  feathers.push({ ownerId: haru.id, visitorId: kongi.id, day: seoulDay(daysAgo(2)), color: kongiBird.colors.body });
  guestbook.push({ id: nextId(), ownerId: haru.id, authorId: bori.id, author: bori, body: '하루야 털갈이 힘내! 보리도 지난달에 했어', createdAt: iso(daysAgo(1, 20)), canDelete: false });
  const firstHaru = posts.filter((p) => p.authorId === haru.id).slice(-1)[0];
  comments.push({ id: nextId(), postId: firstHaru.id, authorId: kongi.id, author: kongi, body: '52g 딱 좋네요!', createdAt: iso(daysAgo(0, 10)), mine: false });
  likes.add(`${firstHaru.id}:${bori.id}`); likes.add(`${firstHaru.id}:${kongi.id}`);
}

// ---- views ---------------------------------------------------------------------------------------

function toView(p: DbPost): Post {
  const parrot = p.parrotId ? parrots.find((x) => x.id === p.parrotId) : null;
  const likeCount = [...likes].filter((k) => k.startsWith(`${p.id}:`)).length;
  return {
    id: p.id, author: userById(p.authorId), parrot: parrot ? strip(parrot) : null, body: p.body,
    weightG: p.weightG, mood: p.mood, moodLabel: moodLabel(p.mood), images: p.images,
    likeCount, commentCount: comments.filter((c) => c.postId === p.id).length,
    likedByMe: meId != null && likes.has(`${p.id}:${meId}`), createdAt: p.createdAt,
  };
}

function page<T extends { id: number }>(rows: T[], cursor: number | null | undefined, size = 12): Page<T> {
  const sorted = rows.filter((r) => cursor == null || r.id < cursor).sort((a, b) => b.id - a.id);
  const items = sorted.slice(0, size);
  return { items, nextCursor: sorted.length > size ? items[items.length - 1].id : null };
}

function streak(ownerId: number) {
  const days = new Set(posts.filter((p) => p.authorId === ownerId).map((p) => seoulDay(p.createdAt)));
  const d = now();
  if (!days.has(seoulDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(seoulDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function badges(ownerId: number, postCount: number, s: number) {
  const out: { code: string; label: string }[] = [];
  if (postCount >= 1) out.push({ code: 'FIRST_DIARY', label: '첫 일기' });
  if (postCount >= 30) out.push({ code: 'DIARY_30', label: '일기 30편' });
  if (s >= 7) out.push({ code: 'STREAK_7', label: '7일 연속 기록' });
  const today = seoulDay(now());
  parrots.filter((p) => p.ownerId === ownerId).forEach((p) => {
    if (p.birthDate && p.birthDate.slice(5) === today.slice(5)) out.push({ code: 'BIRTHDAY_TODAY', label: `${p.name} 생일` });
    if (p.adoptedDate) {
      const days = (Date.parse(today) - Date.parse(p.adoptedDate)) / 86400000;
      if (days >= 100) out.push({ code: 'TOGETHER_100', label: `${p.name}와 함께한 지 100일` });
    }
  });
  return out;
}

async function imageSize(blob: Blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const r = { width: bmp.width, height: bmp.height };
    bmp.close();
    return r;
  } catch {
    return { width: 1000, height: 1000 };
  }
}

// ---- the fake API --------------------------------------------------------------------------------

// passwords of accounts made in this tab; the seeded neighbours all use "parrot123"
const passwords = new Map<string, string>([['haru', 'parrot123'], ['bori', 'parrot123'], ['kongi', 'parrot123']]);

export const mockApi: Api = {
  // everyone is an admin in the mock, so the admin page can be tried without a server
  async me() { seed(); return wait(meId == null ? null : { ...userById(meId), admin: true }); },
  async devLogin(handle, nickname) {
    seed();
    const h = handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new ApiError(400, 'INVALID_HANDLE', '아이디는 영어 소문자, 숫자, 밑줄로 3~20자여야 해요.');
    let u = users.find((x) => x.handle === h);
    if (!u) { u = { id: nextId(), handle: h, nickname: nickname.trim() || h }; users.push(u); }
    meId = u.id;
    return wait(u);
  },
  async signUp(handle, nickname, password) {
    seed();
    const h = handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new ApiError(400, 'INVALID_HANDLE', '아이디는 영어 소문자, 숫자, 밑줄로 3~20자여야 해요.');
    if (!nickname.trim() || nickname.trim().length > 20) throw new ApiError(400, 'INVALID_NICKNAME', '닉네임은 1~20자로 적어 주세요.');
    if (password.length < 8 || password.length > 64) throw new ApiError(400, 'INVALID_PASSWORD', '비밀번호는 8~64자로 정해 주세요.');
    if (password.toLowerCase() === h) throw new ApiError(400, 'INVALID_PASSWORD', '비밀번호는 아이디와 다르게 정해 주세요.');
    if (users.some((x) => x.handle === h)) throw new ApiError(409, 'HANDLE_TAKEN', '이미 쓰는 아이디예요. 다른 아이디를 골라 주세요.');
    const u = { id: nextId(), handle: h, nickname: nickname.trim() };
    users.push(u);
    passwords.set(h, password);
    meId = u.id;
    return wait(u);
  },
  async login(handle, password) {
    seed();
    const h = handle.trim().toLowerCase();
    const u = users.find((x) => x.handle === h);
    if (!u || passwords.get(h) !== password) throw new ApiError(401, 'BAD_CREDENTIALS', '아이디나 비밀번호가 맞지 않아요.');
    meId = u.id;
    return wait(u);
  },
  async logout() { meId = null; return wait(undefined); },
  // the mock has no realtime server; any string will do
  async parkToken() { if (meId == null) throw new Error('로그인이 필요해요.'); return wait({ token: `mock.${meId}`, expiresInSec: 300 }); },

  async myParrots() { const me = requireMe(); return wait(parrots.filter((p) => p.ownerId === me).map(strip)); },
  async createParrot(input: ParrotInput) {
    const me = requireMe();
    const p = { id: nextId(), ownerId: me, speciesLabel: label(input.species), ...input, name: input.name.trim() };
    parrots.push(p);
    return wait(strip(p));
  },
  async updateParrot(id, input) {
    const me = requireMe();
    const p = parrots.find((x) => x.id === id && x.ownerId === me);
    if (!p) throw new ApiError(403, 'FORBIDDEN', '내 앵무만 고칠 수 있어요.');
    Object.assign(p, input, { speciesLabel: label(input.species) });
    return wait(strip(p));
  },

  async feed(tab: FeedTab, cursor) {
    seed();
    let rows = posts;
    if (tab === 'following') {
      const me = requireMe();
      rows = posts.filter((p) => p.authorId === me || follows.has(`${me}>${p.authorId}`));
    }
    const pg = page(rows, cursor);
    return wait({ items: pg.items.map(toView), nextCursor: pg.nextCursor });
  },
  async post(id) {
    seed();
    const p = posts.find((x) => x.id === id);
    if (!p) throw new ApiError(404, 'NOT_FOUND', '일기을(를) 찾을 수 없어요.');
    return wait(toView(p));
  },
  async createPost(input: NewPost) {
    const me = requireMe();
    const body = input.body.trim();
    if (!body && input.images.length === 0) throw new ApiError(400, 'EMPTY_POST', '사진이나 글 중 하나는 있어야 해요.');
    if (input.weightG != null && (input.weightG < 5 || input.weightG > 2000)) throw new ApiError(400, 'INVALID_WEIGHT', '체중은 그램 단위로 5~2000 사이로 적어 주세요.');
    const images = await Promise.all(input.images.map(async (b) => ({ url: URL.createObjectURL(b), ...(await imageSize(b)) })));
    const p: DbPost = { id: nextId(), authorId: me, parrotId: input.parrotId, body, weightG: input.weightG, mood: input.mood, images, createdAt: iso(now()) };
    posts.push(p);
    return wait(toView(p));
  },
  async deletePost(id) {
    const me = requireMe();
    const i = posts.findIndex((p) => p.id === id);
    if (i < 0) throw new ApiError(404, 'NOT_FOUND', '일기을(를) 찾을 수 없어요.');
    if (posts[i].authorId !== me) throw new ApiError(403, 'FORBIDDEN', '내 글만 지울 수 있어요.');
    posts.splice(i, 1);
    return wait(undefined);
  },
  async like(id, on) {
    const me = requireMe();
    const key = `${id}:${me}`;
    if (on) likes.add(key); else likes.delete(key);
    return wait({ liked: on, likeCount: [...likes].filter((k) => k.startsWith(`${id}:`)).length });
  },

  async comments(postId, after) {
    seed();
    const rows = comments.filter((c) => c.postId === postId && (after == null || c.id > after)).sort((a, b) => a.id - b.id);
    return wait({ items: rows.map((c) => ({ ...c, mine: c.authorId === meId })), nextCursor: null });
  },
  async addComment(postId, body) {
    const me = requireMe();
    if (!body.trim()) throw new ApiError(400, 'EMPTY_COMMENT', '댓글 내용을 적어 주세요.');
    const c = { id: nextId(), postId, authorId: me, author: userById(me), body: body.trim(), createdAt: iso(now()), mine: true };
    comments.push(c);
    return wait(c);
  },
  async deleteComment(id) {
    requireMe();
    const i = comments.findIndex((c) => c.id === id);
    if (i >= 0) comments.splice(i, 1);
    return wait(undefined);
  },

  async follow(handle, on) {
    const me = requireMe();
    const u = byHandle(handle);
    if (u.id === me) throw new ApiError(400, 'SELF_FOLLOW', '내 방은 팔로우할 수 없어요.');
    const key = `${me}>${u.id}`;
    if (on) follows.add(key); else follows.delete(key);
    return wait({ following: on, followerCount: [...follows].filter((k) => k.endsWith(`>${u.id}`)).length });
  },

  async room(handle): Promise<Room> {
    seed();
    const owner = byHandle(handle);
    const mine = posts.filter((p) => p.authorId === owner.id).sort((a, b) => b.id - a.id);
    const weighed = mine.find((p) => p.weightG != null);
    const moody = mine.find((p) => p.mood != null);
    const today = seoulDay(now());
    const s = streak(owner.id);
    const ownFeathers = feathers.filter((f) => f.ownerId === owner.id);
    return wait({
      owner,
      parrots: parrots.filter((p) => p.ownerId === owner.id).map(strip),
      frames: mine.filter((p) => p.images.length).slice(0, 8).map((p) => ({ postId: p.id, imageUrl: p.images[0].url, width: p.images[0].width, height: p.images[0].height, createdAt: p.createdAt })),
      today: {
        latestWeightG: weighed?.weightG ?? null, weighedAt: weighed?.createdAt ?? null,
        latestMood: moody?.mood ?? null, latestMoodLabel: moodLabel(moody?.mood ?? null), moodAt: moody?.createdAt ?? null,
      },
      stats: {
        postCount: mine.length, streakDays: s,
        followerCount: [...follows].filter((k) => k.endsWith(`>${owner.id}`)).length,
        followingCount: [...follows].filter((k) => k.startsWith(`${owner.id}>`)).length,
        featherCount: ownFeathers.length, feathersToday: ownFeathers.filter((f) => f.day === today).length,
        guestbookCount: guestbook.filter((g) => g.ownerId === owner.id).length,
      },
      relation: {
        isMe: meId === owner.id,
        following: meId != null && follows.has(`${meId}>${owner.id}`),
        featherLeftToday: meId != null && ownFeathers.some((f) => f.visitorId === meId && f.day === today),
      },
      badges: badges(owner.id, mine.length, s),
      feathers: ownFeathers.slice(-30).reverse().map((f) => ({ color: f.color, visitorHandle: userById(f.visitorId).handle, visitDate: f.day })),
    });
  },
  async roomPosts(handle, cursor) {
    seed();
    const owner = byHandle(handle);
    const pg = page(posts.filter((p) => p.authorId === owner.id), cursor);
    return wait({ items: pg.items.map(toView), nextCursor: pg.nextCursor });
  },
  async leaveFeather(handle) {
    const me = requireMe();
    const owner = byHandle(handle);
    if (owner.id === me) throw new ApiError(400, 'OWN_ROOM', '내 방에는 깃털을 남길 수 없어요.');
    const today = seoulDay(now());
    if (feathers.some((f) => f.ownerId === owner.id && f.visitorId === me && f.day === today)) {
      throw new ApiError(409, 'ALREADY_LEFT', '오늘은 이미 깃털을 남겼어요. 내일 또 놀러와요.');
    }
    const color = parrots.find((p) => p.ownerId === me)?.colors.body ?? '#9BC9A0';
    feathers.push({ ownerId: owner.id, visitorId: me, day: today, color });
    const own = feathers.filter((f) => f.ownerId === owner.id);
    return wait({ featherCount: own.length, feathersToday: own.filter((f) => f.day === today).length });
  },
  async guestbook(handle, cursor) {
    seed();
    const owner = byHandle(handle);
    const pg = page(guestbook.filter((g) => g.ownerId === owner.id), cursor);
    return wait({
      items: pg.items.map((g) => ({ id: g.id, author: g.author, body: g.body, createdAt: g.createdAt, canDelete: meId != null && (g.authorId === meId || owner.id === meId) })),
      nextCursor: pg.nextCursor,
    });
  },
  async writeGuestbook(handle, body) {
    const me = requireMe();
    const owner = byHandle(handle);
    if (!body.trim()) throw new ApiError(400, 'EMPTY_GUESTBOOK', '방명록 내용을 적어 주세요.');
    const g = { id: nextId(), ownerId: owner.id, authorId: me, author: userById(me), body: body.trim(), createdAt: iso(now()), canDelete: true };
    guestbook.push(g);
    return wait({ id: g.id, author: g.author, body: g.body, createdAt: g.createdAt, canDelete: true });
  },
  async deleteGuestbook(id) {
    requireMe();
    const i = guestbook.findIndex((g) => g.id === id);
    if (i >= 0) guestbook.splice(i, 1);
    return wait(undefined);
  },

  async exploreRooms(): Promise<RoomCard[]> {
    seed();
    const today = seoulDay(now());
    const owners = users.filter((u) => u.id !== meId && parrots.some((p) => p.ownerId === u.id));
    const lastPost = (id: number) => posts.filter((p) => p.authorId === id).sort((a, b) => b.id - a.id)[0];
    const followed = (id: number) => meId != null && follows.has(`${meId}>${id}`);
    owners.sort((a, b) => Number(followed(b.id)) - Number(followed(a.id)) || (lastPost(b.id)?.id ?? 0) - (lastPost(a.id)?.id ?? 0));
    return wait(owners.map((u) => {
      const withPhoto = posts.filter((p) => p.authorId === u.id && p.images.length).sort((a, b) => b.id - a.id)[0];
      return {
        owner: u,
        parrots: parrots.filter((p) => p.ownerId === u.id).map(strip),
        coverImageUrl: withPhoto ? withPhoto.images[0].url : null,
        latestPostAt: lastPost(u.id)?.createdAt ?? null,
        postedToday: !!lastPost(u.id) && seoulDay(lastPost(u.id)!.createdAt) === today,
        following: followed(u.id),
        featherLeftToday: meId != null && feathers.some((f) => f.ownerId === u.id && f.visitorId === meId && f.day === today),
      };
    }));
  },
  async randomRoom(exclude) {
    seed();
    const pool = users.filter((u) => u.id !== meId && u.handle !== exclude && parrots.some((p) => p.ownerId === u.id));
    return wait(pool.length ? pool[Math.floor(Math.random() * pool.length)].handle : null);
  },

  admin: {
    async overview() {
      requireMe();
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = daysAgo(13 - i);
        const date = seoulDay(d);
        return {
          date,
          signups: users.filter((u) => seoulDay(createdAt(u.id)) === date).length + (i % 4 === 1 ? 1 : 0),
          posts: posts.filter((p) => seoulDay(p.createdAt) === date).length,
          active: Math.min(users.length, 1 + Math.round(i * 0.3 + (i % 3))),
        };
      });
      return wait({
        totals: {
          users: users.length, parrots: parrots.length, posts: posts.length, comments: comments.length,
          guestbook: guestbook.length, feathers: feathers.length, suspended: suspended.size,
        },
        days,
        park: mockPark(),
        parkError: null,
      });
    },
    async users(q, cursor) {
      requireMe();
      const t = q.trim().toLowerCase();
      const rows = users.filter((u) => !t || u.handle.includes(t) || u.nickname.toLowerCase().includes(t)).map(adminUser);
      return wait(page(rows, cursor, 50));
    },
    async suspend(id, reason) {
      const me = requireMe();
      if (id === me) throw new ApiError(400, 'ADMIN_TARGET', '관리자 계정은 정지할 수 없어요.');
      suspended.set(id, { at: iso(now()), reason: reason.trim() || null });
      return wait(adminUser(userById(id)));
    },
    async unsuspend(id) {
      requireMe();
      suspended.delete(id);
      return wait(adminUser(userById(id)));
    },
    async posts(cursor) { requireMe(); return wait(page(posts.map(toView), cursor, 30)); },
    async deletePost(id) {
      requireMe();
      const i = posts.findIndex((p) => p.id === id);
      if (i >= 0) posts.splice(i, 1);
      return wait(undefined);
    },
    async comments(cursor) {
      requireMe();
      return wait(page(comments.map((c) => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt, postId: c.postId })), cursor, 50));
    },
    async deleteComment(id) {
      requireMe();
      const i = comments.findIndex((c) => c.id === id);
      if (i >= 0) comments.splice(i, 1);
      return wait(undefined);
    },
    async guestbook(cursor) {
      requireMe();
      return wait(page(guestbook.map((g) => ({ id: g.id, author: g.author, body: g.body, createdAt: g.createdAt, roomHandle: userById(g.ownerId).handle })), cursor, 50));
    },
    async deleteGuestbook(id) {
      requireMe();
      const i = guestbook.findIndex((g) => g.id === id);
      if (i >= 0) guestbook.splice(i, 1);
      return wait(undefined);
    },
    async park() { requireMe(); return wait(mockPark()); },
    async metamoa() { requireMe(); return wait({ enabled: true, spaceId: 'angpark' }); },
    async metamoaUpdate(text) {
      requireMe();
      if (mmPostedAt && Date.now() - mmPostedAt < 86400000) throw new ApiError(429, 'METAMOA_429', '메타모아가 받지 않았어요(429, too_soon).');
      if (!text.trim()) throw new ApiError(400, 'BAD_TEXT', '소식은 200자, 3줄까지 적어 주세요.');
      mmPostedAt = Date.now();
      return wait({ shown_until: new Date(Date.now() + 7 * 86400000).toISOString() });
    },
    async metamoaEvents() { requireMe(); return wait({ events: [...mmEvents] }); },
    async metamoaAddEvent(e) {
      requireMe();
      const ev = { id: `ev_${nextId()}`, ...e };
      mmEvents.push(ev);
      return wait({ event: ev });
    },
    async metamoaDeleteEvent(id) {
      requireMe();
      const i = mmEvents.findIndex((x) => x.id === id);
      if (i >= 0) mmEvents.splice(i, 1);
      return wait(undefined);
    },
    async kick(channel, pid) {
      requireMe();
      kicked.add(`${channel}:${pid}`);
      return wait(undefined);
    },
  },
};

// ---- admin page stand-ins ----
const suspended = new Map<number, { at: string; reason: string | null }>();
const kicked = new Set<string>();
let mmPostedAt = 0;
const mmEvents: MetamoaEvent[] = [];
const createdAt = (id: number) => (id < 1010 ? daysAgo(30 + (id % 7)) : daysAgo(id % 3));

function adminUser(u: UserSummary): AdminUser {
  const s = suspended.get(u.id);
  return {
    id: u.id, handle: u.handle, nickname: u.nickname, createdAt: iso(createdAt(u.id)),
    parrots: parrots.filter((p) => p.ownerId === u.id).length, posts: posts.filter((p) => p.authorId === u.id).length,
    lastActive: seoulDay(daysAgo(u.id % 5)), suspendedAt: s?.at ?? null, suspendReason: s?.reason ?? null, admin: u.id === meId,
  };
}

function mockPark(): ParkState {
  const birds = [
    { pid: 3, name: '머란이', species: 'LOVEBIRD', home: 'haru', owner: true, calm: false, addr: 'a1f03c9e' },
    { pid: 5, name: '앵무', species: 'BUDGIE', home: null, owner: false, calm: false, addr: '7c2e11b0' },
    { pid: 8, name: '이상한이름', species: 'OTHER', home: null, owner: false, calm: false, addr: '7c2e11b0' },
    { pid: 9, name: '콩이', species: 'COCKATIEL', home: 'kongi', owner: true, calm: true, addr: '0d9be4a2' },
  ].filter((b) => !kicked.has(`1:${b.pid}`)).map((b, i) => ({ ...b, since: iso(new Date(Date.now() - (i + 1) * 7 * 60000)), x: i * 3 - 4, z: 18 - i * 5 }));
  return {
    online: birds.length, capacity: 50, channels: [{ no: 1, size: birds.length, birds }],
    today: { date: seoulDay(now()), visitors: 23, owners: 4, hellos: 41, peak: 6, since: iso(daysAgo(2)) },
    banned: kicked.size,
  };
}
