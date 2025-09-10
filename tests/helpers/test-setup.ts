/**
 * Test Setup Helpers
 * Optimized database and test environment setup for faster test execution
 */

import { DatabaseManager } from '../../src/database/database-manager.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

// Use in-memory database for tests - MUCH faster than file-based
export async function createTestDatabase(): Promise<DatabaseManager> {
  const db = new DatabaseManager({ 
    path: ':memory:', // In-memory database
    enableWAL: false, // WAL not needed for in-memory
    enableForeignKeys: false, // Skip foreign key checks in tests for speed
    busyTimeout: 1000 // Shorter timeout for tests
  });
  
  await db.initialize();
  return db;
}

// Cached test data directory
let testDataDir: string | null = null;

export async function getTestDataDir(): Promise<string> {
  if (!testDataDir) {
    testDataDir = path.join(process.cwd(), '.test-data', Date.now().toString());
    await fs.mkdir(testDataDir, { recursive: true });
  }
  return testDataDir;
}

// Clean up test data directory
export async function cleanupTestData(): Promise<void> {
  if (testDataDir) {
    await fs.rm(testDataDir, { recursive: true, force: true }).catch(() => {});
    testDataDir = null;
  }
}

// Mock logger to reduce console noise during tests
export const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// Fast test data generators
export function generateTestAdGroup(overrides: any = {}) {
  return {
    id: 'test_ad_group_' + Math.random().toString(36).substr(2, 9),
    name: 'Test Ad Group',
    product: 'test-product',
    landingPageUrl: 'https://example.com/landing',
    currentHeadlines: [
      'Test Headline 1',
      'Test Headline 2',
      'Test Headline 3'
    ],
    currentDescriptions: [
      'Test description one',
      'Test description two'
    ],
    ...overrides
  };
}

export function generateTestPageContent(overrides: any = {}) {
  return {
    path: '/test/page.html',
    headline: 'Test Page Headline',
    subheadline: 'Test Page Subheadline',
    cta: 'Get Started',
    content: 'Test page content',
    ...overrides
  };
}

// Test timing helpers
export function measureTestTime(name: string) {
  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      if (duration > 1000) {
        console.warn(`⚠️ Slow test: ${name} took ${duration.toFixed(0)}ms`);
      }
    }
  };
}