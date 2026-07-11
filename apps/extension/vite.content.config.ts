import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Content-script build. Content scripts run in the page context and cannot be
 * ES modules, so this is bundled as a single self-contained IIFE and emitted
 * alongside the main build output (dist/content.js). `emptyOutDir: false` keeps
 * the popup/background output produced by vite.config.ts.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/content-script.ts'),
      name: 'ResumeForgeContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
