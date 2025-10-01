/**
 * Global Test Setup
 * Ensures clean test environment for all tests
 */

import { beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';

// Clean test databases before each test
beforeEach(async () => {
  const testDbs = [
    'data/test-alerts.db',
    'data/test-complete.db',
    'data/test-playbooks.db',
    'data/test-alert-integration.db'
  ];

  for (const db of testDbs) {
    await fs.unlink(db).catch(() => {});
    await fs.unlink(`${db}-wal`).catch(() => {});
    await fs.unlink(`${db}-shm`).catch(() => {});
  }
});

// Clean experiment directories
afterEach(async () => {
  try {
    const dirs = await fs.readdir('.');
    for (const dir of dirs) {
      if (dir.startsWith('test-experiments-isolated-')) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (e) {
    // Ignore readdir errors
  }
});

// Final cleanup
afterAll(async () => {
  await fs.rm('coverage', { recursive: true, force: true }).catch(() => {});
  await fs.rm('.vitest', { recursive: true, force: true }).catch(() => {});
});
