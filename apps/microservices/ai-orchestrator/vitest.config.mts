import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/microservices/ai-orchestrator',
  test: {
    name: 'ai-orchestrator',
    watch: false,
    globals: true,
    // Nest 12 no longer loads reflect-metadata itself
    setupFiles: ['reflect-metadata'],
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/apps/microservices/ai-orchestrator',
      provider: 'v8' as const,
    },
  },
}));
