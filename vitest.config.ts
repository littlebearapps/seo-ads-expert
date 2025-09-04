import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*test*.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 30000, // 30 second timeout for complex tests
    hookTimeout: 15000, // 15 second timeout for hooks
    pool: 'forks', // Use forks instead of threads to avoid ESM issues
    isolate: true,
    // Fix ESM module loading issues
    server: {
      deps: {
        external: ['vitest']
      }
    }
  },
  esbuild: {
    target: 'node18'
  }
});