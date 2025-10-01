# Test Reliability & Code Quality Strategy for SEO Ads Expert

## Problem Statement

**Symptom**: Running `npm test` in fresh Claude Code sessions shows ~20-30% test failures, even after previous sessions achieved ~95% pass rates.

**Root Causes Identified**:
1. Test isolation issues (shared databases, file systems)
2. Non-deterministic behavior (timestamps, random data)
3. Mock implementations vs real implementations
4. Leftover test artifacts (3+ test databases found)
5. 1,002 tests across 65 files with overlapping concerns

---

## Immediate Actions (Next 2 Hours)

### 1. Create Clean Test Baseline

```bash
# Clean all test artifacts
npm run test:clean  # Create this script

# Run tests in isolation
npm run test:ci  # Create this script with --no-threads --run
```

**Create in package.json**:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ci": "vitest run --no-threads --reporter=verbose",
    "test:clean": "rm -rf data/test-*.db test-experiments-* coverage .vitest",
    "test:unit": "vitest run tests/",
    "test:integration": "vitest run src/tests/",
    "pretest": "npm run test:clean"
  }
}
```

### 2. Fix Test Isolation

**Update vitest.config.ts**:
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // CRITICAL CHANGES:
    testTimeout: 10000,
    hookTimeout: 5000,
    pool: 'forks',  // Changed from 'threads' - better isolation
    poolOptions: {
      forks: {
        singleFork: true  // Run tests in sequence, not parallel
      }
    },
    isolate: true,  // Changed from false - isolate each test file
    maxConcurrency: 1,  // Changed from 4 - one at a time

    // Clean setup
    setupFiles: ['./tests/helpers/test-setup.ts'],

    silent: false,
    logHeapUsage: true  // Monitor memory issues
  }
});
```

### 3. Create Global Test Setup

**File: tests/helpers/test-setup.ts**
```typescript
import { beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  const dirs = await fs.readdir('.').catch(() => []);
  for (const dir of dirs) {
    if (dir.startsWith('test-experiments-isolated-')) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

// Final cleanup
afterAll(async () => {
  await fs.rm('coverage', { recursive: true, force: true }).catch(() => {});
  await fs.rm('.vitest', { recursive: true, force: true }).catch(() => {});
});
```

### 4. Add Deterministic Test Fixtures

**File: tests/helpers/test-fixtures.ts**
```typescript
import { vi } from 'vitest';

/**
 * Get deterministic timestamp for tests
 */
export function getTestTimestamp(daysOffset = 0): string {
  const baseDate = new Date('2025-01-15T12:00:00Z');
  baseDate.setDate(baseDate.getDate() + daysOffset);
  return baseDate.toISOString();
}

/**
 * Mock Date.now() for deterministic tests
 */
export function mockSystemTime(date = '2025-01-15T12:00:00Z') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(date));
}

/**
 * Restore real time
 */
export function restoreSystemTime() {
  vi.useRealTimers();
}

/**
 * Get unique test database path per test file
 */
export function getTestDbPath(testName: string): string {
  const sanitized = testName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `data/test-${sanitized}-${Date.now()}.db`;
}
```

---

## Short-Term Actions (Next 1 Week)

### 5. Separate Test Categories

**Critical Tests** (must pass 100%):
- v2.0 core features (Thompson Sampling, Guardrails, Bid Strategies, Creative Optimization)
- Currently: 54/54 tests passing ✅

**Integration Tests** (target 90%):
- Multi-component workflows
- Database operations
- API mocking

**Legacy Tests** (audit and deprecate):
- Tests for features no longer used
- Duplicate test coverage
- Outdated API expectations

### 6. Create Test Health Dashboard

**File: scripts/test-health-report.js**
```javascript
const { execSync } = require('child_process');
const fs = require('fs');

// Run tests and capture results
const result = execSync('npm run test:ci --reporter=json > test-results.json 2>&1 || true');
const data = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));

// Categorize results
const categories = {
  'v2.0-core': ['thompson-sampling', 'guardrails', 'bid-strategies', 'creative-optimization'],
  'integration': ['integration/', 'v15-v17', 'v18', 'v19'],
  'legacy': ['test-google-ads-integration', 'test-safe-write', 'test-audit-compliance']
};

// Generate report
console.log('# SEO Ads Expert - Test Health Report\n');
console.log(`Generated: ${new Date().toISOString()}\n`);
console.log(`Total: ${data.numTotalTests} tests`);
console.log(`Passed: ${data.numPassedTests} (${(data.numPassedTests/data.numTotalTests*100).toFixed(1)}%)`);
console.log(`Failed: ${data.numFailedTests} (${(data.numFailedTests/data.numTotalTests*100).toFixed(1)}%)\n`);

// Category breakdown
for (const [category, patterns] of Object.entries(categories)) {
  const categoryTests = data.testResults.filter(t =>
    patterns.some(p => t.name.includes(p))
  );
  const passed = categoryTests.filter(t => t.status === 'passed').length;
  const total = categoryTests.length;
  console.log(`${category}: ${passed}/${total} (${(passed/total*100).toFixed(1)}%)`);
}
```

**Run with**: `node scripts/test-health-report.js`

---

## Medium-Term Actions (Next 2 Weeks)

### 7. Implement Test Contracts

**Concept**: Each major component defines its test contract - what MUST work.

**Example: BudgetEnforcer.test-contract.ts**
```typescript
import { describe, it, expect } from 'vitest';
import { BudgetEnforcer } from '../src/monitors/budget-enforcer';

/**
 * BudgetEnforcer Test Contract
 * These tests MUST pass for production deployment
 */
describe('BudgetEnforcer [CONTRACT]', () => {
  it('MUST prevent spending beyond daily limit', async () => {
    const enforcer = new BudgetEnforcer();
    await enforcer.setDailyBudget('customer-1', 'campaign-1', 100);
    enforcer.recordSpend('customer-1', 'campaign-1', 100);

    const canSpend = await enforcer.canSpend('customer-1', 'campaign-1', 1);
    expect(canSpend).toBe(false);
  });

  it('MUST track multi-tenant budgets separately', async () => {
    const enforcer = new BudgetEnforcer();
    enforcer.recordSpend('customer-1', 'campaign-1', 50);
    enforcer.recordSpend('customer-2', 'campaign-1', 75);

    const spend1 = await enforcer.getDailySpend('customer-1', 'campaign-1');
    const spend2 = await enforcer.getDailySpend('customer-2', 'campaign-1');

    expect(spend1).toBe(50);
    expect(spend2).toBe(75);
  });

  // Add 5-10 more critical behaviors
});
```

### 8. Add Continuous Monitoring

**GitHub Actions workflow**: `.github/workflows/test-reliability.yml`
```yaml
name: Test Reliability Monitor

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  test-reliability:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests 5 times
        run: |
          for i in {1..5}; do
            echo "=== Run $i ==="
            npm run test:ci || true
            npm run test:clean
          done

      - name: Generate reliability report
        run: node scripts/test-reliability-report.js

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: test-reliability-report
          path: test-reliability-report.md
```

---

## Long-Term Strategy (Next Month)

### 9. Migrate to Test Pyramid

**Current**: Too many integration tests, not enough unit tests

**Target Distribution**:
- 70% Unit tests (fast, isolated, deterministic)
- 20% Integration tests (database, multi-component)
- 10% E2E tests (full system with real APIs)

### 10. Add Property-Based Testing

For critical algorithms like Thompson Sampling:

```typescript
import { describe, it } from 'vitest';
import { fc } from 'fast-check';

describe('Thompson Sampling Properties', () => {
  it('MUST respect budget constraints for any input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          campaignId: fc.string(),
          budget: fc.nat(10000),
          conversions: fc.nat(100),
          clicks: fc.nat(1000)
        })),
        (campaigns) => {
          const optimizer = new ThompsonSamplingOptimizer();
          const allocations = optimizer.allocate(campaigns, 50000);

          // Property: Total allocation must not exceed budget
          const total = allocations.reduce((sum, a) => sum + a.amount, 0);
          return total <= 50000;
        }
      )
    );
  });
});
```

---

## Verification Checklist

Use this before claiming "tests are fixed":

### ✅ Pre-Commit Checklist
- [ ] Run `npm run test:clean` first
- [ ] Run `npm run test:ci` (no parallel execution)
- [ ] Check for leftover `.db` files: `find . -name "test-*.db"`
- [ ] Verify no test-experiments folders: `ls -d test-experiments-*`
- [ ] Run tests 3 times in a row - all must pass
- [ ] Check TypeScript compilation: `npx tsc --noEmit`

### ✅ Test Quality Checklist
- [ ] No `vi.fn()` without proper implementation
- [ ] All async functions use `await`
- [ ] Database paths use `getTestDbPath()` helper
- [ ] Timestamps use `getTestTimestamp()` helper
- [ ] All `beforeEach` hooks clean up state
- [ ] All `afterEach` hooks close connections/delete files
- [ ] No hardcoded dates (use test fixtures)
- [ ] No tests depending on execution order

### ✅ Code Quality Checklist
- [ ] Implementation exists for all mocked methods
- [ ] Multi-tenant support where tests expect it
- [ ] Proper error handling (try-catch with cleanup)
- [ ] No global state (use constructor injection)
- [ ] TypeScript strict mode enabled
- [ ] No `any` types in production code

---

## Recommended Workflow for Claude Code Sessions

### Session Start
```bash
# 1. Clean slate
npm run test:clean

# 2. Get baseline
npm run test:ci > baseline-tests.txt 2>&1

# 3. Categorize failures
node scripts/test-health-report.js > test-health.md
```

### During Development
```bash
# Run specific test file
npx vitest run tests/specific-test.test.ts

# Run test category
npm run test:unit  # or test:integration
```

### Before Committing
```bash
# Full validation
npm run test:clean && npm run test:ci

# Run 3 times to verify stability
for i in {1..3}; do
  npm run test:clean
  npm run test:ci || echo "FAIL on run $i"
done
```

### Session End
```bash
# Document what was fixed
echo "## Session $(date +%Y-%m-%d)" >> TEST_LOG.md
echo "- Fixed: [list]" >> TEST_LOG.md
echo "- Pass rate: $(node -p 'require(\"./test-results.json\").numPassedTests')/1002" >> TEST_LOG.md
git add TEST_LOG.md
```

---

## Key Insights

### Why Tests Keep Failing

1. **We're fixing symptoms, not root causes**
   - Fixed mocks → should fix implementations
   - Tests pass → doesn't mean code works
   - 95% pass rate → but different 5% fails each time

2. **Test environment is not clean**
   - 3 test databases persist between runs
   - File locks from previous sessions
   - Shared state across test files

3. **Tests are brittle**
   - Depend on execution order
   - Depend on system time
   - Depend on external state

### How to Ensure SEO Ads Expert Actually Works

1. **Separate test types**
   - Critical tests (must pass 100%)
   - Integration tests (target 90%)
   - Legacy tests (audit and deprecate)

2. **Add monitoring**
   - Run tests on schedule (every 6 hours)
   - Track pass rates over time
   - Alert on degradation

3. **Focus on contracts**
   - Define what MUST work
   - Test those behaviors thoroughly
   - Everything else is nice-to-have

4. **Production validation**
   - Add health checks to running system
   - Monitor real usage, not just tests
   - Alert on actual failures, not test failures

---

## Next Steps

1. **Immediate** (do now):
   - Create test:clean script
   - Update vitest.config.ts
   - Create test-setup.ts

2. **Today**:
   - Run clean test baseline
   - Document current failures
   - Categorize tests (critical/integration/legacy)

3. **This Week**:
   - Implement test contracts for v2.0 core
   - Add test health reporting
   - Set up CI monitoring

4. **Ongoing**:
   - Before each Claude Code session: clean + baseline
   - After each fix: verify 3x stability
   - Weekly: review test health trends

---

## Success Metrics

**Current State**:
- Pass rate: 83.3% (835/1,002)
- Stability: Unknown (varies per session)
- Reliability: Low (different failures each time)

**Target State** (2 weeks):
- Critical tests: 100% (always)
- Integration tests: 90%+
- Legacy tests: Deprecated or fixed
- Stability: 100% (same results across 3 runs)
- Reliability: High (predictable failures only)

**Production Readiness** (1 month):
- All test contracts pass
- CI passing for 2 weeks straight
- Production health checks green
- Real usage metrics validated

---

**Remember**: Tests that pass inconsistently are worse than tests that fail consistently. Stability > coverage.