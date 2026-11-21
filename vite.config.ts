import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PKPilot0015 is published under a GitHub Pages project sub-path.
export default defineConfig({
  base: '/PKPilot0015/',
  plugins: [react()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: { port: 5175, host: true },
  preview: { port: 4175, host: true, strictPort: true },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
});
