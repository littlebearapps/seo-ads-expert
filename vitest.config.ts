import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*test*.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 10000, // Reduced to 10 seconds - tests should be faster
    hookTimeout: 5000, // Reduced to 5 seconds for hooks
    pool: 'threads', // Use threads for better performance (forks are slower)
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1
      }
    },
    isolate: false, // Don't isolate tests - share context for better performance
    maxConcurrency: 4, // Run up to 4 test suites in parallel
    // Fix ESM module loading issues
    server: {
      deps: {
        external: ['vitest']
      }
    },
    // Silence console output during tests to reduce noise
    silent: false,
    logHeapUsage: false
  },
  esbuild: {
    target: 'node18'
  }
});