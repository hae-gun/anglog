import { httpApi } from './http';
import { mockApi } from './mock';
import type { Api } from './types';

export const isMock = import.meta.env.VITE_MOCK === '1';

/** The real server, or the in-memory fake when started with `npm run dev:mock`. */
export const api: Api = isMock ? mockApi : httpApi;

export * from './types';
