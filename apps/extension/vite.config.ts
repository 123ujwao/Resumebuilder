import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Main extension build: the popup (HTML + React) and the background service
 * worker. Both are emitted as ES modules — the service worker is declared with
 * `"type": "module"` in manifest.json. The content script is built separately
 * (see vite.content.config.ts) because content scripts cannot be ES modules and
 * must be self-contained IIFE bundles.
 *
 * Static files in `public/` (manifest.json) are copied to dist as-is.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
