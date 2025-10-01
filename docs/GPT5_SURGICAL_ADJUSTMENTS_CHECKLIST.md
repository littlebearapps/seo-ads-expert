# GPT-5 Surgical Adjustments Checklist
## SEO Ads Expert - Final Pre-Execution Fixes

**Date**: 2025-09-30
**Status**: Ready for execution (90-120 minutes total)
**Plan Updated**: ✅ Phase 0, Phase 1, Phase 3A
**Remaining**: Phase 3B split, Phase 6 fixes, Quality Gates 7 & 8

---

## ✅ COMPLETED Updates to Plan

### 1. Phase 0.2 - Time Source Refactor ✅
**File**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` (lines 122-195)
**Status**: Plan updated with corrected implementation
- Changed from `Object.assign` to module-local variable
- Exported `now()` and `timestamp()` functions instead of object
- Usage pattern updated throughout

### 2. Phase 0.3 - Vitest Mock Typings ✅
**File**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` (lines 202-267)
**Status**: Plan updated with Vitest-native types
- Removed `jest.Mocked`, using `Pick<>` type instead
- Added consistent return shapes for API client mocks
- `query` returns array, `mutate` returns object

### 3. Phase 1 - Memory & HTTPS Fixes ✅
**File**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` (lines 343-369, 314-347)
**Status**: Plan updated with GPT-5 guidance
- Memory: Use `process.memoryUsage().rss`, assert percentages
- HTTPS: Localhost/127.0.0.1 allowlist added

### 4. Phase 3A - Split from Phase 3 ✅
**File**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` (line 646)
**Status**: Plan updated with 3A header and exit criteria
- Changed "Phase 3" → "Phase 3A: Foundation"
- Added exit criteria
- Time estimate: 6-8 hours, ~22 tests

### 5. Phase 3A.1 - GAQL Validation Opt-In ✅
**File**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` (lines 665-785)
**Status**: Plan updated with opt-in validation
- Added `GAQLBuilderOptions` interface
- Constructor accepts `{ validateFields?: boolean }`
- Default: lenient (no field validation)
- Test-only: strict mode via opt-in

---

## ✅ ALL ADJUSTMENTS COMPLETE - VERIFIED 2025-09-30

### 6. Phase 3B - Mutations Split ✅ VERIFIED IN PLAN
**Location**: Lines 986-1220 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md
**Status**: Complete and ready for execution

**Template**:
```markdown
---

### Phase 3B: Google Ads API Client - Mutations (6-8 hours, ~22 tests) 🚀

**Goal**: Complete mutation operations - campaign/ad group/budget creation
**Risk**: Medium-High
**Dependencies**: Phase 3A must be complete
**GPT-5 Recommendation**: Can start Phase 4 after 3A completes (don't wait for 3B)

**Exit Criteria**:
- ✅ Campaign/AdGroup/Budget creation methods
- ✅ Mutation operations complete
- ✅ Metrics aggregation queries
- ✅ Error normalization implemented
- ✅ Mocks simulate two-step budget/campaign linkage

#### 3B.1 Mutation Methods (3-4 hours, ~15 tests)
**Files**: `src/connectors/google-ads-api.ts`

**Action**:
```typescript
export class GoogleAdsApiClient {
  // ADD MISSING METHODS
  async createCampaign(customerId: string, campaign: CampaignInput): Promise<MutationResult> {
    const mutation = {
      customer_id: customerId,
      operations: [{
        create: {
          name: campaign.name,
          advertising_channel_type: campaign.channelType,
          status: campaign.status,
          campaign_budget: campaign.budgetResourceName  // Link to budget
        }
      }]
    };

    return this.mutate('campaigns', mutation);
  }

  async createBudget(customerId: string, budget: BudgetInput): Promise<MutationResult> {
    const mutation = {
      customer_id: customerId,
      operations: [{
        create: {
          name: budget.name,
          amount_micros: budget.amountMicros,
          delivery_method: budget.deliveryMethod || 'STANDARD'
        }
      }]
    };

    const result = await this.mutate('campaign_budgets', mutation);
    // Return resource name for campaign linking
    return {
      ...result,
      resourceName: `customers/${customerId}/campaignBudgets/${result.id}`
    };
  }

  async createAdGroup(customerId: string, adGroup: AdGroupInput): Promise<MutationResult> {
    // Similar pattern
  }

  // Error normalization
  private normalizeError(error: AxiosError): NormalizedError {
    const status = error.response?.status;
    return {
      code: status?.toString() || 'NETWORK_ERROR',
      message: error.message,
      retryable: status ? status >= 500 : true  // 5xx = retry, 4xx = don't retry
    };
  }
}
```

**Tests Fixed**: ~15 mutation tests

#### 3B.2 Mock Two-Step Linkage (2 hours, ~7 tests)
**Files**: `tests/fixtures/index.ts`

**Action**:
```typescript
export function createMockGoogleAdsClient(): GoogleAdsClientLike {
  // In-memory store for created resources
  const createdResources: Record<string, any> = {};

  return {
    query: vi.fn().mockResolvedValue([]),
    mutate: vi.fn().mockResolvedValue({ results: [] }),

    // Budget creation returns resource name
    createBudget: vi.fn().mockImplementation(async (customerId, budget) => {
      const resourceName = `customers/${customerId}/campaignBudgets/123`;
      createdResources[resourceName] = budget;
      return { resourceName, id: '123' };
    }),

    // Campaign creation links to budget
    createCampaign: vi.fn().mockImplementation(async (customerId, campaign) => {
      // Validate budget exists
      if (campaign.budgetResourceName && !createdResources[campaign.budgetResourceName]) {
        throw new Error(`Budget ${campaign.budgetResourceName} not found`);
      }

      return {
        resourceName: `customers/${customerId}/campaigns/456`,
        id: '456',
        budgetResourceName: campaign.budgetResourceName
      };
    }),

    createAdGroup: vi.fn().mockResolvedValue({ resourceName: 'adGroups/789' })
  };
}
```

**Tests Fixed**: ~7 linkage tests

**Phase 3B Complete**: ✅ ~22 tests fixed, 6-8 hours invested
**New Pass Rate**: ~873/1,002 (87.1%)
```

### 7. Phase 6 - AuditLogger Retention Fix ✅ VERIFIED IN PLAN
**Location**: Lines 1608-1648 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md
**Status**: Complete with startRetention/stopRetention lifecycle methods

**Addition to existing Phase 6 content**:
```markdown
#### 6.X AuditLogger Retention Lifecycle (included in Section 6.1)
**Files**: `src/monitors/audit-logger.ts`

**GPT-5 Final Adjustment**: Don't call setInterval unconditionally

**Action**:
```typescript
export class AuditLogger {
  private cleanupInterval?: NodeJS.Timeout;
  private retentionDays: number = 90;

  // Expose lifecycle methods
  startRetention(days: number = 90): void {
    this.retentionDays = days;
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(
        () => this.cleanupOldLogs(),
        24 * 60 * 60 * 1000  // Daily
      );
    }
  }

  stopRetention(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    await this.db.run(
      'DELETE FROM audit_logs WHERE timestamp < ?',
      cutoffDate.toISOString()
    );
  }
}

// In production
const logger = new AuditLogger(db);
logger.startRetention(90);  // Explicit start

// In tests
import { vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  logger = new AuditLogger(testDb);
  // Don't start retention in tests
});

afterEach(() => {
  logger.stopRetention();  // Clean up
  vi.useRealTimers();
});
```

**Why This Approach**:
- No orphan intervals in tests
- Explicit lifecycle control
- Fake timers work reliably
```

### 8. Phase 6 - Compliance Report Period Fix ✅ VERIFIED IN PLAN
**Location**: Section 5.2 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md (lines 1375-1444)
**Status**: Complete with min/max timestamp calculation

**Addition**:
```markdown
#### 6.Y Compliance Report Period Fix (included in compliance section)
**Files**: `src/analyzers/compliance-dashboard.ts`

**GPT-5 Final Adjustment**: Use min/max timestamps, not logs[0]

**Action**:
```typescript
async generateReport(filters?: ReportFilters): Promise<ComplianceReport> {
  const logs = await this.auditLogger.getLogs(filters);

  // WRONG - assumes order
  // period: { start: logs[0].timestamp, end: logs[logs.length-1].timestamp }

  // CORRECT - calculate min/max
  const times = logs.map(l => new Date(l.timestamp).getTime());
  const start = new Date(Math.min(...times)).toISOString();
  const end = new Date(Math.max(...times)).toISOString();

  return {
    period: { start, end },
    totalLogs: logs.length,
    // ... rest of report
  };
}
```

**Why This Approach**:
- Handles logs arriving out of order
- No assumptions about sorting
- Works when logs inserted at different times
```

### 9. Phase 6 - CSV Escaping Fix ✅ VERIFIED IN PLAN
**Location**: Lines 1650-1678 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md
**Status**: Complete with RFC 4180 compliant escapeCSVValue helper

**Addition**:
```markdown
#### 6.Z CSV Export Escaping (included in export section)
**Files**: `src/writers/csv.ts`

**GPT-5 Final Adjustment**: Escape commas, quotes, newlines

**Action**:
```typescript
export class CSVWriter {
  private escapeValue(v: unknown): string {
    const s = String(v ?? '');

    // If contains comma, quote, or newline → wrap in quotes and escape quotes
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
  }

  async exportAuditLogs(logs: AuditLogEntry[]): Promise<string> {
    const headers = ['timestamp', 'user', 'action', 'resource', 'result'];
    const headerRow = headers.join(',');

    const rows = logs.map(log =>
      headers.map(h => this.escapeValue((log as any)[h])).join(',')
    );

    return [headerRow, ...rows].join('\n');
  }
}
```

**Why This Approach**:
- RFC 4180 compliant
- Handles all edge cases (commas in names, quotes in descriptions, newlines in messages)
- Single escape function for consistency
```

### 10. Phase 7 - MCP compareCampaigns Fix ✅ VERIFIED IN PLAN
**Location**: Lines 1801-1846 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md
**Status**: Complete with typo fix and compareCampaigns implementation

**Addition**:
```markdown
#### 7.X MCP Campaign Reconciliation Fix
**Files**: `src/mcp/reconcile.ts`

**GPT-5 Final Adjustment**: Fix typo `comparecamp campaigns` → `compareCampaigns`

**Action**:
```typescript
export class MCPReconciler {
  // WRONG
  // const differences = this.comparecamp campaigns(local, remote);

  // CORRECT
  compareCampaigns(local: Campaign[], remote: Campaign[]): CampaignDifference[] {
    const differences: CampaignDifference[] = [];

    // Compare by ID
    for (const localCampaign of local) {
      const remoteCampaign = remote.find(r => r.id === localCampaign.id);

      if (!remoteCampaign) {
        differences.push({
          type: 'missing_remote',
          campaign: localCampaign
        });
      } else if (this.hasChanges(localCampaign, remoteCampaign)) {
        differences.push({
          type: 'mismatch',
          local: localCampaign,
          remote: remoteCampaign,
          fields: this.diffFields(localCampaign, remoteCampaign)
        });
      }
    }

    return differences;
  }

  private hasChanges(local: Campaign, remote: Campaign): boolean {
    return local.name !== remote.name ||
           local.status !== remote.status ||
           local.budget !== remote.budget;
  }

  private diffFields(local: Campaign, remote: Campaign): string[] {
    const fields: string[] = [];
    if (local.name !== remote.name) fields.push('name');
    if (local.status !== remote.status) fields.push('status');
    if (local.budget !== remote.budget) fields.push('budget');
    return fields;
  }
}

// Add unit test
describe('MCPReconciler', () => {
  it('compares campaigns correctly', () => {
    const local = [{ id: '1', name: 'Campaign A', status: 'ENABLED' }];
    const remote = [{ id: '1', name: 'Campaign A Modified', status: 'ENABLED' }];

    const diffs = reconciler.compareCampaigns(local, remote);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('mismatch');
    expect(diffs[0].fields).toContain('name');
  });
});
```

### 11. Quality Gate 7 - Open Handle/Timer Guard ✅ VERIFIED IN PLAN
**Location**: Lines 2023-2056 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md
**Status**: Complete with vi.getTimerCount() and process.getActiveResourcesInfo checks

**Addition**:
```markdown
### 7. Open Handle/Timer Guard
```typescript
// Add to vitest.config.ts or global test setup
import { afterAll, vi } from 'vitest';

afterAll(() => {
  // Check for pending timers
  const timerCount = vi.getTimerCount();
  if (timerCount > 0) {
    console.warn(`⚠️  ${timerCount} pending timers detected`);
    console.warn('This indicates cleanup is missing in tests');
    vi.clearAllTimers();
  }

  // Check for open handles (if using Node v19+)
  if (process.getActiveResourcesInfo) {
    const handles = process.getActiveResourcesInfo();
    if (handles.length > 0) {
      console.warn(`⚠️  ${handles.length} open handles detected:`);
      handles.forEach(h => console.warn(`  - ${h}`));
    }
  }
});

// Add to phase-specific test suites
describe('Phase 6 - Safe Write Operations', () => {
  afterAll(() => {
    // Verify all intervals cleared
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

**Purpose**: Catch lingering timers and open database handles that cause CI hangs
```

### 12. Quality Gate 8 - API Client Contract Test ✅ VERIFIED IN PLAN
**Location**: Lines 2058-2110 in OPTION_A_COMPREHENSIVE_FIX_PLAN.md
**Status**: Complete with mock/real interface validation tests

**Addition**:
```markdown
### 8. API Client Contract Validation
```typescript
// Add to tests/contracts/api-client-contract.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GoogleAdsApiClient } from '@/connectors/google-ads-api';
import { createMockGoogleAdsClient } from '@tests/fixtures';
import nock from 'nock';

describe('API Client Contract', () => {
  it('mock matches real client interface', () => {
    const mockClient = createMockGoogleAdsClient();
    const realClient = new GoogleAdsApiClient(testConfig);

    // Method names match
    const mockMethods = Object.keys(mockClient).sort();
    const realMethods = Object.keys(realClient).sort();

    expect(mockMethods).toEqual(realMethods);
  });

  it('query returns consistent shape', async () => {
    const mockClient = createMockGoogleAdsClient();
    const results = await mockClient.query('SELECT campaign.id FROM campaign');

    // Must be array (GAQL results format)
    expect(Array.isArray(results)).toBe(true);
  });

  it('mutate returns consistent shape', async () => {
    const mockClient = createMockGoogleAdsClient();
    const result = await mockClient.mutate('campaigns', {});

    // Must be object with results array
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('real client (stubbed) matches mock shapes', async () => {
    // Stub real API with nock
    nock('https://googleads.googleapis.com')
      .post('/v14/customers/123:search')
      .reply(200, { results: [{ campaign: { id: '456' } }] });

    const realClient = new GoogleAdsApiClient(testConfig);
    const results = await realClient.query('SELECT campaign.id FROM campaign');

    // Real client returns same shape as mock
    expect(Array.isArray(results)).toBe(true);
  });
});
```

**Purpose**: Prevent mock-real client drift, ensure shapes stay synchronized
```

---

## Execution Order

### Phase 0: Apply Plan Updates (Done)
- ✅ Time source refactor
- ✅ Vitest mock types
- ✅ GAQL validation opt-in

### Phase 1: Apply Remaining Plan Updates (30 minutes)
1. Add Phase 3B section to plan (15 min)
2. Add Phase 6 surgical fixes to plan (10 min)
3. Add Phase 7 MCP fix to plan (2 min)
4. Add Quality Gates 7 & 8 to plan (3 min)

### Phase 2: Execute Phase 0 (1.5 hours)
1. Create `src/utils/date-adapter.ts` (45 min)
2. Create `src/utils/time-source.ts` (30 min)
3. Create `tests/fixtures/index.ts` (15 min)

### Phase 3: Execute Systematic Fixes (50-60 hours)
Follow updated plan Phase 1 → 7

---

## Success Criteria

- ✅ All 181 failing tests have clear fix strategy in plan
- ✅ All GPT-5 surgical adjustments incorporated
- ✅ No tests accidentally dropped from coverage
- ✅ Plan is 100% executable without ambiguity

---

**Document Version**: 2.0
**Last Updated**: 2025-09-30
**Status**: ✅ ALL ADJUSTMENTS VERIFIED IN PLAN - READY FOR IMMEDIATE EXECUTION

---

## 🎯 EXECUTION READINESS CONFIRMED

All 12 GPT-5 surgical adjustments have been verified as present in the comprehensive fix plan:
- ✅ Adjustments 1-5: Already marked complete in previous verification
- ✅ Adjustments 6-12: Verified present in plan (2025-09-30)

**Plan Status**: 100% complete and ready for mechanical execution
**Next Action**: Begin Phase 0 (Shared Utilities) - 1.5 hours