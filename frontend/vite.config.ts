import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev`      : talks to the Spring server on :8080 through the proxy below.
// `npm run dev:mock` : no server needed; an in-memory fake API (src/api/mock.ts) answers instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/media': 'http://localhost:8080',
    },
  },
});
