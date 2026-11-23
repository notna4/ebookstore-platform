import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173 },
  // Carbon UI is the bulk of the bundle; app code is small.
  build: { chunkSizeWarningLimit: 700 },
  css: { preprocessorOptions: { scss: { quietDeps: true } } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // The checkout tests type into many fields and wait for the simulated payment; allow for slow machines.
    testTimeout: 15_000,
    // Unit tests run in demo mode, whatever a developer has in .env.local.
    env: { VITE_API_URL: '' },
  },
});
