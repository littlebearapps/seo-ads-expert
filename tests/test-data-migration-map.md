# Test Data Migration Map

## Property Name Changes (v1.0 → v2.0)

### Mutation Objects
- `budget` → `estimatedCost`
- `campaignId` → `resource`
- `adGroupId` → `resource`
- `keywords` → `targetKeywords`

### Campaign Objects
- `dailyBudget` → `budget.daily`
- `monthlyBudget` → `budget.monthly`
- `targetCPA` → `biddingStrategy.targetCpa`
- `targetROAS` → `biddingStrategy.targetRoas`

### Performance Objects
- `clicks` → `metrics.clicks`
- `impressions` → `metrics.impressions`
- `conversions` → `metrics.conversions`
- `cost` → `metrics.cost`
- `ctr` → `metrics.ctr`
- `cvr` → `metrics.conversionRate`

### Ad Group Objects
- `adGroupId` → `id`
- `adGroupName` → `name`
- `headlines` → `currentHeadlines`
- `descriptions` → `currentDescriptions`

### Experiment Objects
- `experimentId` → `id`
- `variantName` → `name`
- `controlGroup` → `isControl`

## Files Requiring Updates

### High Priority (Core Functionality)
1. `tests/test-safe-write-operations.ts` - Budget validation tests
2. `tests/test-enhanced-validation.ts` - Performance predictor tests
3. `src/tests/bid-strategies.test.ts` - Bid strategy tests

### Medium Priority (Integration Tests)
1. `tests/test-audit-compliance.ts` - Compliance reporting
2. `tests/integration/opportunity-matrix.test.ts` - Opportunity analysis

### Low Priority (Can be deferred)
1. Tests that are working but may have deprecated patterns

## Migration Strategy

1. Start with high-priority tests
2. Update property names systematically
3. Ensure backwards compatibility where needed
4. Add type definitions to prevent future mismatches