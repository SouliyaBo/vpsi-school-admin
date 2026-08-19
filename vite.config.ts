import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
// From vitest/config rather than vite, so the `test` block below is typed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The API whitelists http://localhost:5173 in CORS_ORIGINS, so the browser
    // talks to it directly — no dev proxy to keep in sync with production.
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
