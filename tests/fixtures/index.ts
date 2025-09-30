/**
 * Unified Test Fixtures
 * Phase 0.3 - Shared Utilities
 *
 * Purpose: Centralize all mock objects for consistent test setup
 *
 * Benefits:
 * - No more "undefined is not a function" mock errors
 * - Consistent mock behavior across all tests
 * - Single location to update when interfaces change
 * - Batch fix across 25+ mocking-related failures
 *
 * GPT-5 Final Adjustment: Use Vitest types, not jest.Mocked;
 * ensure consistent return shapes
 */

import { vi } from 'vitest';
import type { TimeSource } from '../../src/utils/time-source.js';

/**
 * Mock AuditLogger interface
 * Use Pick instead of jest.Mocked for Vitest compatibility
 */
export type AuditLoggerLike = {
  logMutation: ReturnType<typeof vi.fn>;
  logQuery: ReturnType<typeof vi.fn>;
  getLogs: ReturnType<typeof vi.fn>;
  generateSummary: ReturnType<typeof vi.fn>;
  filterLogs: ReturnType<typeof vi.fn>;
  clearOldLogs: ReturnType<typeof vi.fn>;
};

/**
 * Create mock AuditLogger with consistent return shapes
 */
export function createMockLogger(): AuditLoggerLike {
  return {
    logMutation: vi.fn().mockResolvedValue(undefined),
    logQuery: vi.fn().mockResolvedValue(undefined),
    getLogs: vi.fn().mockResolvedValue([]),
    generateSummary: vi.fn().mockResolvedValue({}),
    filterLogs: vi.fn().mockResolvedValue([]),
    clearOldLogs: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * Mock Google Ads API Client interface
 * Use Pick for specific methods to prevent interface drift
 */
export type GoogleAdsClientLike = {
  query: ReturnType<typeof vi.fn>;
  mutate: ReturnType<typeof vi.fn>;
  createCampaign: ReturnType<typeof vi.fn>;
  createAdGroup: ReturnType<typeof vi.fn>;
  createBudget: ReturnType<typeof vi.fn>;
  createAd: ReturnType<typeof vi.fn>;
  updateCampaign: ReturnType<typeof vi.fn>;
};

/**
 * Create mock Google Ads Client with consistent return shapes
 * IMPORTANT: Consistent return shapes
 * - query returns array (GAQL results)
 * - mutate returns object with results array
 * - resource creation returns object with resourceName
 */
export function createMockGoogleAdsClient(): GoogleAdsClientLike {
  return {
    query: vi.fn().mockResolvedValue([]),  // Array of rows (GAQL results)
    mutate: vi.fn().mockResolvedValue({ results: [] }),  // Mutation response
    createCampaign: vi.fn().mockResolvedValue({ resourceName: 'campaigns/123' }),
    createAdGroup: vi.fn().mockResolvedValue({ resourceName: 'adGroups/456' }),
    createBudget: vi.fn().mockResolvedValue({ resourceName: 'budgets/789' }),
    createAd: vi.fn().mockResolvedValue({ resourceName: 'ads/101112' }),
    updateCampaign: vi.fn().mockResolvedValue({ success: true })
  };
}

/**
 * Create frozen time source for testing
 * @param date - Date to freeze time at (defaults to 2025-09-30T12:00:00Z)
 * @returns TimeSource that always returns the same date/timestamp
 */
export function createFrozenTimeSource(date: Date = new Date('2025-09-30T12:00:00Z')): TimeSource {
  return {
    now: () => new Date(date),
    timestamp: () => date.getTime()
  };
}

/**
 * Create mock database for testing
 * Returns in-memory SQLite database with common operations
 */
export function createMockDatabase() {
  const data = new Map<string, any[]>();

  return {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(() => data.get(sql) || []),
      get: vi.fn(() => (data.get(sql) || [])[0]),
      run: vi.fn((params?: any) => {
        // Store data with SQL as key for retrieval
        if (!data.has(sql)) {
          data.set(sql, []);
        }
        if (params) {
          data.get(sql)!.push(params);
        }
        return { changes: 1, lastInsertRowid: 1 };
      })
    })),
    exec: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn((fn: Function) => fn)
  };
}

/**
 * Create mock experiment for testing
 */
export function createMockExperiment(overrides: Partial<any> = {}) {
  return {
    id: 'exp_test_123',
    name: 'Test Experiment',
    status: 'active',
    type: 'rsa',
    accountId: '9495806872',
    startDate: new Date('2025-09-01'),
    endDate: new Date('2025-09-30'),
    controlId: 'control_123',
    variants: [
      { id: 'control_123', name: 'Control', weight: 50 },
      { id: 'variant_456', name: 'Variant A', weight: 50 }
    ],
    ...overrides
  };
}

/**
 * Create mock campaign for testing
 */
export function createMockCampaign(overrides: Partial<any> = {}) {
  return {
    id: 'camp_test_123',
    name: 'Test Campaign',
    status: 'ENABLED',
    budget: 100.00,
    budgetType: 'DAILY',
    biddingStrategy: 'MAXIMIZE_CONVERSIONS',
    targetCpa: 10.00,
    ...overrides
  };
}

/**
 * Create mock ad group for testing
 */
export function createMockAdGroup(overrides: Partial<any> = {}) {
  return {
    id: 'adgroup_test_123',
    name: 'Test Ad Group',
    campaignId: 'camp_test_123',
    status: 'ENABLED',
    cpcBid: 1.50,
    ...overrides
  };
}

/**
 * Create mock metrics for testing
 */
export function createMockMetrics(overrides: Partial<any> = {}) {
  return {
    impressions: 1000,
    clicks: 50,
    conversions: 5,
    cost: 75.00,
    ctr: 0.05,
    cvr: 0.10,
    cpc: 1.50,
    cpa: 15.00,
    roas: 2.00,
    ...overrides
  };
}

/**
 * Create mock alert for testing
 */
export function createMockAlert(overrides: Partial<any> = {}) {
  return {
    id: 'alert_test_123',
    type: 'spend_spike',
    severity: 'high',
    entityId: 'camp_test_123',
    entityType: 'campaign',
    message: 'Spend spike detected',
    timestamp: new Date('2025-09-30T12:00:00Z'),
    status: 'active',
    ...overrides
  };
}

/**
 * Reset all mocks (call in afterEach)
 */
export function resetAllMocks() {
  vi.clearAllMocks();
  vi.clearAllTimers();
}