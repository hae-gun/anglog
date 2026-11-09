// Shapes returned by the Spring API (backend/src/main/java/com/jjaklog/**/…View.java).

export type Species = 'BUDGIE' | 'LOVEBIRD' | 'COCKATIEL' | 'QUAKER' | 'GREEN_CHEEKED_CONURE' | 'OTHER';
export type Mood = 'HAPPY' | 'CALM' | 'SLEEPY' | 'PLAYFUL' | 'GRUMPY' | 'HUNGRY';

export interface UserSummary {
  id: number;
  handle: string;
  nickname: string;
}

export interface ParrotColors {
  face: string;
  head: string;
  body: string;
  wing: string;
  tail: string;
}

export interface Parrot {
  id: number;
  name: string;
  species: Species;
  speciesLabel: string;
  birthDate: string | null;
  adoptedDate: string | null;
  colors: ParrotColors;
}

export interface ParrotInput {
  name: string;
  species: Species;
  birthDate: string | null;
  adoptedDate: string | null;
  colors: ParrotColors;
}

export interface ImageView {
  url: string;
  width: number;
  height: number;
}

export interface Post {
  id: number;
  author: UserSummary;
  parrot: Parrot | null;
  body: string;
  weightG: number | null;
  mood: Mood | null;
  moodLabel: string | null;
  images: ImageView[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface NewPost {
  body: string;
  parrotId: number | null;
  weightG: number | null;
  mood: Mood | null;
  images: Blob[];
}

export interface Page<T> {
  items: T[];
  nextCursor: number | null;
}

export interface Comment {
  id: number;
  author: UserSummary;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface GuestbookEntry {
  id: number;
  author: UserSummary;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export interface Room {
  owner: UserSummary;
  parrots: Parrot[];
  frames: { postId: number; imageUrl: string; width: number; height: number; createdAt: string }[];
  today: {
    latestWeightG: number | null;
    weighedAt: string | null;
    latestMood: Mood | null;
    latestMoodLabel: string | null;
    moodAt: string | null;
  };
  stats: {
    postCount: number;
    streakDays: number;
    followerCount: number;
    followingCount: number;
    featherCount: number;
    feathersToday: number;
    guestbookCount: number;
  };
  relation: { isMe: boolean; following: boolean; featherLeftToday: boolean };
  badges: { code: string; label: string }[];
  feathers: { color: string; visitorHandle: string | null; visitDate: string }[];
}

export interface RoomCard {
  owner: UserSummary;
  parrots: Parrot[];
  coverImageUrl: string | null;
  latestPostAt: string | null;
  /** the owner wrote a diary today (Korea time): the house window is lit */
  postedToday: boolean;
  following: boolean;
  featherLeftToday: boolean;
}

export type FeedTab = 'latest' | 'following';

export interface Api {
  me(): Promise<UserSummary | null>;
  devLogin(handle: string, nickname: string): Promise<UserSummary>;
  signUp(handle: string, nickname: string, password: string): Promise<UserSummary>;
  login(handle: string, password: string): Promise<UserSummary>;
  logout(): Promise<void>;
  /** A short-lived token that tells 앵파크 this bird is mine (one bird per account there). */
  parkToken(): Promise<{ token: string; expiresInSec: number }>;

  myParrots(): Promise<Parrot[]>;
  createParrot(input: ParrotInput): Promise<Parrot>;
  updateParrot(id: number, input: ParrotInput): Promise<Parrot>;

  feed(tab: FeedTab, cursor?: number | null): Promise<Page<Post>>;
  post(id: number): Promise<Post>;
  createPost(input: NewPost): Promise<Post>;
  deletePost(id: number): Promise<void>;
  like(id: number, on: boolean): Promise<{ liked: boolean; likeCount: number }>;

  comments(postId: number, after?: number | null): Promise<Page<Comment>>;
  addComment(postId: number, body: string): Promise<Comment>;
  deleteComment(id: number): Promise<void>;

  follow(handle: string, on: boolean): Promise<{ following: boolean; followerCount: number }>;

  room(handle: string): Promise<Room>;
  roomPosts(handle: string, cursor?: number | null): Promise<Page<Post>>;
  leaveFeather(handle: string): Promise<{ featherCount: number; feathersToday: number }>;
  guestbook(handle: string, cursor?: number | null): Promise<Page<GuestbookEntry>>;
  writeGuestbook(handle: string, body: string): Promise<GuestbookEntry>;
  deleteGuestbook(id: number): Promise<void>;

  exploreRooms(): Promise<RoomCard[]>;
  /** null when there is no other room yet */
  randomRoom(exclude?: string | null): Promise<string | null>;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const SPECIES: { value: Species; label: string }[] = [
  { value: 'LOVEBIRD', label: '모란앵무' },
  { value: 'BUDGIE', label: '사랑앵무' },
  { value: 'COCKATIEL', label: '왕관앵무' },
  { value: 'QUAKER', label: '퀘이커' },
  { value: 'GREEN_CHEEKED_CONURE', label: '그린칙코뉴어' },
  { value: 'OTHER', label: '기타' },
];

export const MOODS: { value: Mood; label: string }[] = [
  { value: 'HAPPY', label: '신나요' },
  { value: 'CALM', label: '평온해요' },
  { value: 'SLEEPY', label: '졸려요' },
  { value: 'PLAYFUL', label: '장난꾸러기' },
  { value: 'GRUMPY', label: '삐졌어요' },
  { value: 'HUNGRY', label: '배고파요' },
];
