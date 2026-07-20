import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'output/**'],
    setupFiles: ['./src/test/setup.ts'],
    globals: true
  }
});
