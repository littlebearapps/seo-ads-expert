# Thompson Sampling Engine & Safe Write Operations - Deep Dive

**Purpose**: Technical deep dive into the two most critical and complex systems
**Last Updated**: 2025-10-09
**For**: Claude on iOS (Linear MCP access)

---

## 🎯 Part 1: Thompson Sampling Budget Optimization Engine

### Overview

**What**: Bayesian optimization algorithm for budget allocation across Google Ads campaigns

**Goal**: Maximize conversions (or ROAS) by intelligently allocating budget to high-performing campaigns while exploring uncertain opportunities

**Key Insight**: Balance exploitation (allocate to known winners) with exploration (test uncertain campaigns to find hidden gems)

**Algorithm**: Multi-armed bandit problem solved via Thompson Sampling

---

### Mathematical Foundation

#### **Beta-Binomial CVR Modeling**

**Purpose**: Model conversion rate uncertainty for each campaign

**Approach**:
- Each campaign has a **Beta distribution** for conversion rate (CVR)
- Parameters: α (successes = conversions), β (failures = non-conversions)
- Prior: Beta(1, 1) = Uniform(0, 1) = complete uncertainty
- Update: Beta(α + conversions, β + clicks - conversions)

**Formula**:
```
CVR ~ Beta(α, β)
where:
  α = prior_α + observed_conversions
  β = prior_β + observed_clicks - observed_conversions

Expected CVR = α / (α + β)
Variance = (α * β) / ((α + β)² * (α + β + 1))
```

**Interpretation**:
- High α, low β → High conversion rate, low uncertainty
- Low α, high β → Low conversion rate, low uncertainty
- Low α, low β → Unknown conversion rate, HIGH uncertainty (explore!)

---

#### **Gamma Value Estimation**

**Purpose**: Estimate expected value per conversion for each campaign

**Approach**:
- Each campaign has a **Gamma distribution** for value per conversion
- Parameters: shape (k), scale (θ)
- Estimated from historical conversion values

**Formula**:
```
Value ~ Gamma(k, θ)
where:
  k = (mean_value / std_dev)²
  θ = std_dev² / mean_value

Expected Value = k * θ
Variance = k * θ²
```

**Fallback**: If no conversion value data, use CPA (Cost Per Acquisition) as proxy

---

#### **Thompson Sampling Algorithm**

**Input**:
- Historical performance per campaign (impressions, clicks, conversions, cost)
- Total budget to allocate
- Budget constraints per campaign (min/max)

**Process**:
```
For each sampling round (N = 10,000 iterations):
  1. For each campaign:
     a. Sample CVR from Beta(α, β) → sampled_cvr
     b. Sample Value from Gamma(k, θ) → sampled_value
     c. Calculate expected conversions = clicks * sampled_cvr
     d. Calculate expected value = conversions * sampled_value
     e. Calculate ROI = expected_value / cost

  2. Rank campaigns by ROI (or expected conversions)

  3. Allocate budget top-down until total budget exhausted:
     - Start with highest ROI campaign
     - Allocate up to max budget constraint
     - Move to next campaign

  4. Record allocation for this round

After N rounds:
  - Average allocations across all rounds
  - This is the final recommended budget distribution
```

**Why 10,000 iterations**: Converges to stable allocations, captures uncertainty

---

### Uncertainty Quantification

**Concept**: High uncertainty → more exploration, low uncertainty → more exploitation

**Metrics**:
- **Posterior Standard Deviation**: Spread of Beta/Gamma distributions
- **Coefficient of Variation**: std_dev / mean (relative uncertainty)
- **Credible Intervals**: 95% CI for CVR and Value

**Exploration Bonus**:
- Campaigns with high uncertainty get **bonus** allocations
- Implemented via Thompson Sampling (naturally balances exploration/exploitation)
- No manual tuning required (Bayesian magic!)

---

### Multi-Armed Bandit Optimization

**Analogy**: Slot machines (bandits) with unknown payout rates

**Goal**: Which machine should you pull next to maximize total winnings?

**Strategies**:
- **Greedy**: Always pull highest observed payout (no exploration, misses better machines)
- **ε-Greedy**: Random exploration ε% of time (arbitrary parameter choice)
- **UCB**: Upper Confidence Bound (over-explores initially)
- **Thompson Sampling**: Bayesian probability matching (optimal balance!) ⭐

**Why Thompson Sampling Wins**:
- Automatically balances exploration/exploitation (no tuning)
- Optimal regret bounds (theoretical guarantee)
- Incorporates prior knowledge (Beta/Gamma priors)
- Handles non-stationary environments (campaign performance changes)

---

### Code Structure

**Location**: `src/` (v2.0 Thompson Sampling tests)

**Key Files**:
- `thompson-sampling.ts` - Core algorithm implementation
- `configurable-thompson-sampling.ts` - Configurable sampling engine
- `lag-aware-thompson-sampling.ts` - Conversion lag handling
- `bid-strategies.ts` - Intelligent bid adjustment
- `pacing-controller.ts` - Budget pacing algorithms

**Tests**: 120+ tests passing ✅

**Example Usage** (Pseudocode):
```typescript
import { ThompsonSampler } from './thompson-sampling';

const campaigns = [
  { id: 'A', clicks: 1000, conversions: 50, cost: 500 },
  { id: 'B', clicks: 500, conversions: 10, cost: 250 },
  { id: 'C', clicks: 100, conversions: 2, cost: 50 },
];

const sampler = new ThompsonSampler({
  totalBudget: 1000,
  iterations: 10000,
  priorAlpha: 1,
  priorBeta: 1,
});

const allocations = sampler.allocate(campaigns);
// { A: 600, B: 300, C: 100 } (example output)
```

---

## 🔒 Part 2: Safe Write Operations System

### Overview

**What**: Comprehensive mutation validation with guardrails, rollback, and audit logging

**Goal**: Prevent destructive changes to Google Ads accounts while enabling safe optimizations

**Philosophy**: "Trust, but verify" - allow automation with extensive safety checks

**4 Subsystems**:
1. **Mutation Guard** - Validation layer (pre-flight checks)
2. **Budget Enforcer** - Limit enforcement (budget constraints)
3. **Audit Logger** - Compliance layer (tamper-evident logging)
4. **Mutation Applier** - Execution layer (safe mutation application)

---

### 1. Mutation Guard (Validation Layer)

**Purpose**: Validate all mutations before application

**3 Validation Types**:

#### **Budget Limit Validation**
```typescript
interface BudgetLimits {
  perMutation: number;      // Max $ per single mutation
  perAccount: number;       // Max $ per account per day
  perDay: number;           // Global max $ per day
}

// Example check
if (mutation.budget_change > limits.perMutation) {
  throw new ValidationError('Exceeds per-mutation budget limit');
}
```

#### **Quality Score Thresholds**
```typescript
interface QualityScoreRules {
  minQualityScore: number;  // Reject changes to QS < threshold (e.g., 5)
  maxBidIncrease: number;   // Max bid increase % for low QS (e.g., 20%)
}

// Example check
if (keyword.quality_score < rules.minQualityScore) {
  if (mutation.bid_increase_pct > rules.maxBidIncrease) {
    throw new ValidationError('Bid increase too high for low QS keyword');
  }
}
```

#### **Health Checks**
```typescript
interface HealthChecks {
  accountStatus: 'ENABLED' | 'PAUSED' | 'REMOVED';
  policyCompliance: boolean;
  billingStatus: 'ACTIVE' | 'SUSPENDED';
}

// Example check
if (account.status !== 'ENABLED') {
  throw new ValidationError('Account not enabled, cannot mutate');
}
```

**Custom Validation Rules**: User-defined validation logic via plugins

---

### 2. Budget Enforcer (Limit Enforcement)

**Purpose**: Enforce budget constraints at multiple levels

#### **Multi-Tenant Budget Tracking**
```typescript
interface TenantBudget {
  tenantId: string;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  currentSpend: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

// Example enforcement
if (tenant.currentSpend.daily + mutation.cost > tenant.dailyLimit) {
  throw new BudgetExceededError('Daily budget limit exceeded');
}
```

#### **Alert Triggers**
- **Warning** at 80% of limit (notification sent)
- **Critical** at 95% of limit (escalation to admin)
- **Auto-Pause** at 100% of limit (prevent overspend)

#### **Limit Types**:
- Per mutation (single change max)
- Per account (all changes to one account)
- Per tenant (all accounts under one tenant)
- Per day/week/month (time-based limits)

---

### 3. Audit Logger (Compliance Layer)

**Purpose**: Tamper-evident audit trail for all mutations

#### **Immutable Log Records**
```typescript
interface AuditLogEntry {
  id: string;                // Unique log entry ID
  timestamp: string;         // ISO 8601 timestamp
  action: 'mutation' | 'alert' | 'experiment';
  userId: string;            // Who initiated
  accountId: string;         // Which account
  resourceId: string;        // Campaign/Ad Group/Keyword ID
  resourceType: string;      // 'campaign' | 'ad_group' | 'keyword'
  mutation: {
    type: string;            // 'budget' | 'bid' | 'status'
    before: any;             // Value before change
    after: any;              // Value after change
  };
  status: 'pending' | 'applied' | 'failed' | 'rolled_back';
  metadata: Record<string, any>;
}
```

#### **Retention Policy**
- **90-day retention** (configurable)
- Auto-archive after 90 days to cold storage
- Compliance exports available (GDPR, CCPA, SOC 2)

#### **Rollback Support**
```typescript
// Rollback to previous state
const logEntry = auditLog.getById('log-123');
const rollbackMutation = {
  type: logEntry.mutation.type,
  resourceId: logEntry.resourceId,
  value: logEntry.mutation.before, // Restore previous value
};

await mutationApplier.apply(rollbackMutation, { reason: 'Rollback from log-123' });
```

#### **Tamper-Evident Design**
- Each log entry has **cryptographic hash** (SHA-256)
- Hash includes previous entry hash (blockchain-style chain)
- Tampering with any entry breaks the chain (detectable)

---

### 4. Mutation Applier (Execution Layer)

**Purpose**: Safely apply mutations with retry logic, circuit breakers, and validation

#### **Dry-Run Mode**
```typescript
const result = await mutationApplier.apply(mutations, { dryRun: true });
// Validates mutations without applying
// Returns validation results (pass/fail per mutation)
```

#### **validateOnly Mode** (Google Ads API)
```typescript
const result = await mutationApplier.apply(mutations, { validateOnly: true });
// Sends mutations to Google Ads API with validateOnly=true
// Google validates server-side without applying
// Returns Google's validation errors (if any)
```

#### **Circuit Breaker Protection**
```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;  // Open circuit after N failures (e.g., 5)
  timeout: number;           // Wait N seconds before retry (e.g., 60)
  resetAfter: number;        // Close circuit after N seconds success (e.g., 300)
}

// Example behavior
if (consecutiveFailures >= config.failureThreshold) {
  openCircuit(); // Pause all mutations
  setTimeout(() => {
    attemptRecovery(); // Try one mutation to test
  }, config.timeout);
}
```

#### **Retry Logic with Exponential Backoff**
```typescript
interface RetryConfig {
  maxRetries: number;        // Max retry attempts (e.g., 3)
  initialDelay: number;      // Initial delay in ms (e.g., 1000)
  multiplier: number;        // Backoff multiplier (e.g., 2)
}

// Example retry sequence
// Attempt 1: Immediate
// Attempt 2: Wait 1 second (1000ms)
// Attempt 3: Wait 2 seconds (1000ms * 2)
// Attempt 4: Wait 4 seconds (1000ms * 2 * 2)
```

---

### Integration: How It All Works Together

```
User initiates mutation
        ↓
1. Mutation Guard validates
   ├── Budget limits OK?
   ├── Quality score OK?
   ├── Health checks OK?
   └── Custom rules OK?
        ↓
2. Budget Enforcer checks limits
   ├── Daily limit OK?
   ├── Weekly limit OK?
   └── Monthly limit OK?
        ↓
3. Audit Logger records intent
   ├── Log entry created (status=pending)
   └── Hash computed
        ↓
4. Mutation Applier executes
   ├── Dry-run first (if enabled)
   ├── validateOnly (if enabled)
   ├── Circuit breaker check
   ├── Apply mutation via Google Ads API
   └── Retry on failure (exponential backoff)
        ↓
5. Audit Logger updates result
   ├── Log entry updated (status=applied or failed)
   └── Chain hash updated
        ↓
6. Budget Enforcer updates spend tracking
   └── Increment current spend counters
```

---

### Code Structure

**Location**: `tests/test-safe-write-operations.ts`

**Test Coverage**: 60+ tests passing ✅

**Key Subsystems Tested**:
- MutationGuard (validation, normalization, custom rules)
- AuditLogger (tamper-evident logging, rollback, analysis)
- MutationApplier (dry-run, validateOnly, circuit breakers, retry)
- MutationBuilder (fluent API for constructing mutations)
- BudgetEnforcer (multi-tenant budgets, limit enforcement)

**Example Usage** (Pseudocode):
```typescript
import { MutationApplier, MutationGuard, AuditLogger } from './safe-write';

const guard = new MutationGuard({
  budgetLimits: { perMutation: 100, perAccount: 1000, perDay: 10000 },
  qualityScoreRules: { minQualityScore: 5, maxBidIncrease: 20 },
});

const logger = new AuditLogger({ retention: 90 });

const applier = new MutationApplier({
  guard,
  logger,
  circuitBreaker: { failureThreshold: 5, timeout: 60, resetAfter: 300 },
  retry: { maxRetries: 3, initialDelay: 1000, multiplier: 2 },
});

const mutations = [
  { type: 'budget', campaignId: '123', newBudget: 500 },
  { type: 'bid', keywordId: '456', newBid: 2.50 },
];

// Dry-run first
const dryRunResult = await applier.apply(mutations, { dryRun: true });
if (!dryRunResult.allValid) {
  console.error('Validation failed:', dryRunResult.errors);
  return;
}

// Apply with confirmation
const result = await applier.apply(mutations, { confirm: true });
console.log('Applied:', result.applied.length);
console.log('Failed:', result.failed.length);
```

---

### GDPR/CCPA Compliance

**Features**:
- Audit logs include user consent timestamps
- Data retention policies enforced (90 days)
- Right to deletion (purge user data on request)
- Data export (portable audit logs in JSON/CSV)
- Anonymization (replace user IDs with pseudonyms after retention)

**Compliance Reporter**:
```typescript
const report = await complianceReporter.generate({
  type: 'gdpr',
  dateRange: '2025-01-01:2025-10-01',
  userId: 'user-123',
});

// Report includes:
// - All mutations by user
// - Consent timestamps
// - Data retention status
// - Deletion requests honored
```

---

## 🎯 Why These Systems Are Critical

### Thompson Sampling
- **Efficiency**: 1000x+ automation speedup (3+ hours → 11 seconds)
- **Intelligence**: Bayesian optimization beats manual budget allocation
- **Adaptability**: Automatically adjusts to changing campaign performance
- **Risk Management**: Explores uncertain campaigns without over-committing budget

### Safe Write Operations
- **Safety**: Prevents destructive changes (budget overruns, low QS bids)
- **Compliance**: GDPR/CCPA/SOC 2 audit trail
- **Rollback**: Undo any mutation using audit logs
- **Reliability**: Circuit breakers prevent cascading failures

**Together**: Enable **autonomous budget optimization** with **enterprise-grade safety**

---

## 🔍 For More Details

- **Architecture**: See Document #1 for component relationships
- **Commands**: See Document #2 for `plan` and `apply` command usage
- **Tests**: See Document #4 for test structure and coverage
- **Google API**: See Document #5 for API integration details

---

**Document Created**: 2025-10-09
**For**: SEO Ads Expert Linear Project
**Claude iOS Compatibility**: ✅ Complete technical deep dive without GitHub access
