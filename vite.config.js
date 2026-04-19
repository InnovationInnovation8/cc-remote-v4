import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// PWA無効化中（開発フェーズ）— Step 15で再有効化
// import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Production dispatcher URL (post-rename). Used as fallback when .env is
// empty or still points at the pre-rename `lkoron4l.workers.dev` subdomain.
// This guards against stale .env on developer machines shipping a broken
// bundle to production.
const PROD_DISPATCHER_URL = 'https://cc-remote.innovationinnovation8.workers.dev';

function resolveDispatcherUrl(envValue) {
  if (!envValue) return PROD_DISPATCHER_URL;
  if (envValue.includes('lkoron4l.workers.dev')) return PROD_DISPATCHER_URL;
  return envValue;
}

// Serve dev-only assets (dev/*.html) via middleware; never included in production build.
const devOnlyAssets = () => ({
  name: 'dev-only-assets',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/dev_seed.html', (req, res, next) => {
      const filePath = path.resolve(__dirname, 'dev/dev_seed.html');
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.createReadStream(filePath).pipe(res);
      } else {
        next();
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const dispatcherUrl = resolveDispatcherUrl(env.VITE_DISPATCHER_URL);

  return {
    base: process.env.PAGES_BUILD === '1' ? '/cc-remote-v4/' : '/',
    plugins: [
      react(),
      devOnlyAssets(),
      // VitePWA — Step 15で再有効化時にキャッシュ戦略も見直す
    ],
    define: {
      'import.meta.env.VITE_DISPATCHER_URL': JSON.stringify(dispatcherUrl),
    },
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
  };
});
