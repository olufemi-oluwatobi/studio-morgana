import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs in `wrangler dev` (port 8787); Vite proxies /api and /files to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787', '/files': 'http://127.0.0.1:8787' },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
