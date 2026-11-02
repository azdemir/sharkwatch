import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev API always runs on 8787 (see dev:server); PORT may belong to this dev server.
const API = 'http://localhost:8787';

export default defineConfig({
  base: '/demo/',
  root: 'src/web', 
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/media': { target: API, changeOrigin: false },
    },
  },
});
