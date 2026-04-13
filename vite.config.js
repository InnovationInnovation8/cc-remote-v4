import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// PWA無効化中（開発フェーズ）— Step 15で再有効化
// import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.PAGES_BUILD === '1' ? '/cc-remote-v4/' : '/',
  plugins: [
    react(),
    // VitePWA — Step 15で再有効化時にキャッシュ戦略も見直す
  ],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3737',
        changeOrigin: true,
      },
      '/sse': {
        target: 'http://localhost:3737',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
