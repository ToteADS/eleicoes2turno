import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': 'http://localhost:8080', '/ads.txt': 'http://localhost:8080' } },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.test.ts', 'src/main.ts'] },
  },
});
