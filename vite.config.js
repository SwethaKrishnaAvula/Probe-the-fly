import { defineConfig } from 'vite';

// In dev the game calls /api/...; that goes to the Python API (npm run api), which talks to Tiger Cloud.
export default defineConfig({
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
});
