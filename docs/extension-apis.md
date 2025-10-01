# Extension APIs Documentation
## Thompson Sampling v2.0 Optimizer Extension Points

### Overview

The Thompson Sampling v2.0 budget optimizer provides several extension points for customization and enhancement. This document describes the protected APIs, composition patterns, and safe extension mechanisms.

---

## Protected Extension Interface

### ThompsonSamplingOptimizer Base Class

The base `ThompsonSamplingOptimizer` provides protected methods that can be safely overridden or extended:

#### Statistical Sampling Methods

```typescript
protected sampleBeta(alpha: number, beta: number): number
```
- **Purpose**: Sample from Beta distribution for conversion rate modeling
- **Parameters**:
  - `alpha`: Success count (α parameter)
  - `beta`: Failure count (β parameter)
- **Returns**: Random sample from Beta(α, β) distribution
- **Extension Notes**: Override for custom Beta sampling algorithms

```typescript
protected sampleGamma(shape: number, rate: number): number
```
- **Purpose**: Sample from Gamma distribution for conversion value modeling
- **Parameters**:
  - `shape`: Shape parameter (k)
  - `rate`: Rate parameter (β)
- **Returns**: Random sample from Gamma(k, β) distribution
- **Extension Notes**: Override for custom Gamma sampling methods

#### Bayesian Analysis Methods

```typescript
protected bayesianUpdate(arm: Arm): BayesianPosterior
```
- **Purpose**: Compute Bayesian posterior distributions
- **Parameters**: `arm` - Campaign/ad group performance data
- **Returns**: Updated posterior parameters (α, β for Beta; shape, rate for Gamma)
- **Extension Notes**: Core method for custom prior/posterior logic

```typescript
protected calculateExpectedImprovement(
  currentAllocation: number,
  optimalAllocation: number,
  posterior: BayesianPosterior
): number
```
- **Purpose**: Expected improvement calculation for budget adjustments
- **Parameters**: Current vs optimal allocations plus posterior distribution
- **Returns**: Expected improvement value
- **Extension Notes**: Override for custom improvement metrics

#### Constraint and Validation Methods

```typescript
protected applyConstraints(
  rawAllocations: number[],
  constraints: BudgetConstraints,
  arms: Arm[]
): number[]
```
- **Purpose**: Apply budget and business constraints to raw allocations
- **Parameters**: Raw allocations, constraint rules, arm data
- **Returns**: Constraint-compliant allocations
- **Extension Notes**: Add custom business rules and constraints

```typescript
protected betaQuantile(alpha: number, beta: number, p: number): number
```
- **Purpose**: Calculate Beta distribution quantiles for confidence intervals
- **Parameters**: Distribution parameters and probability level
- **Returns**: Quantile value
- **Extension Notes**: Override for different confidence calculation methods

#### Reasoning and Output Methods

```typescript
protected generateReasoning(
  arms: Arm[],
  allocations: AllocationResult[],
  explorationFloor: number
): string
```
- **Purpose**: Generate human-readable optimization reasoning
- **Parameters**: Arms data, final allocations, exploration settings
- **Returns**: Markdown-formatted reasoning explanation
- **Extension Notes**: Customize reasoning format and content

```typescript
protected normalizeAllocations(
  rawAllocations: number[],
  totalBudget: number,
  arms: Arm[]
): AllocationResult[]
```
- **Purpose**: Normalize raw allocations to budget totals with metadata
- **Parameters**: Raw allocations, total budget, arms data
- **Returns**: Normalized allocation results with performance metrics
- **Extension Notes**: Add custom normalization logic and metadata

---

## Extension Patterns

### 1. Lag-Aware Extension (Example)

```typescript
export class LagAwareThompsonSamplingOptimizer extends ThompsonSamplingOptimizer {
  // Override core methods to incorporate conversion lag modeling
  protected override async bayesianUpdate(arm: Arm): Promise<BayesianPosterior> {
    const lagAwarePosterior = await this.computeLagAwarePosterior(arm, constraints);
    return this.adjustForConversionLag(lagAwarePosterior, arm.lagProfile);
  }

  // Add new lag-specific methods
  private async computeLagAwarePosterior(
    arm: Arm,
    constraints: LagAwareConstraints
  ): Promise<BayesianPosterior> {
    // Implementation using lag profiles and predictive modeling
  }
}
```

### 2. Multi-Platform Extension

```typescript
export class MultiPlatformThompsonSampling extends ThompsonSamplingOptimizer {
  protected override applyConstraints(
    rawAllocations: number[],
    constraints: MultiPlatformConstraints,
    arms: Arm[]
  ): number[] {
    // Apply platform-specific constraints (Google Ads, Microsoft Ads, etc.)
    const platformConstraints = this.computePlatformConstraints(arms);
    const crossPlatformAllocations = this.optimizeAcrossPlatforms(rawAllocations, platformConstraints);
    return super.applyConstraints(crossPlatformAllocations, constraints, arms);
  }
}
```

### 3. Creative Rotation Extension

```typescript
export class CreativeRotationOptimizer extends ThompsonSamplingOptimizer {
  protected override generateReasoning(
    arms: Arm[],
    allocations: AllocationResult[],
    explorationFloor: number
  ): string {
    const baseReasoning = super.generateReasoning(arms, allocations, explorationFloor);
    const creativeInsights = this.generateCreativeRotationReasoning(arms);
    return `${baseReasoning}\n\n## Creative Rotation Analysis\n${creativeInsights}`;
  }

  private generateCreativeRotationReasoning(arms: Arm[]): string {
    // Analyze creative fatigue and rotation recommendations
  }
}
```

---

## Composition-Based Strategies

### Strategy Interfaces

For maximum flexibility, implement strategy objects for key algorithms:

#### Sampling Strategy

```typescript
interface SamplingStrategy {
  sampleBeta(alpha: number, beta: number): number;
  sampleGamma(shape: number, rate: number): number;
  sampleNormal(mean: number, variance: number): number;
}

class MonteCarloBayesSampling implements SamplingStrategy {
  // Monte Carlo sampling implementation
}

class VariationalBayesSampling implements SamplingStrategy {
  // Variational inference sampling
}
```

#### Constraint Strategy

```typescript
interface ConstraintStrategy {
  applyConstraints(
    allocations: number[],
    constraints: BudgetConstraints,
    arms: Arm[]
  ): number[];
}

class BasicConstraintStrategy implements ConstraintStrategy {
  // Simple min/max budget constraints
}

class AdvancedConstraintStrategy implements ConstraintStrategy {
  // Complex business rules, seasonal adjustments, etc.
}
```

#### Prior Strategy

```typescript
interface PriorStrategy {
  computePriors(arms: Arm[], historicalData: HistoricalData): PriorDistribution[];
  updatePriors(priors: PriorDistribution[], newData: PerformanceData): PriorDistribution[];
}

class HierarchicalBayesPriors implements PriorStrategy {
  // Hierarchical empirical Bayes priors
}

class InformativePriors implements PriorStrategy {
  // Domain-specific informative priors
}
```

### Dependency Injection Usage

```typescript
export class ConfigurableThompsonSampling extends ThompsonSamplingOptimizer {
  constructor(
    private samplingStrategy: SamplingStrategy,
    private constraintStrategy: ConstraintStrategy,
    private priorStrategy: PriorStrategy,
    config: ThompsonSamplingConfig
  ) {
    super(config);
  }

  protected override sampleBeta(alpha: number, beta: number): number {
    return this.samplingStrategy.sampleBeta(alpha, beta);
  }

  protected override applyConstraints(
    rawAllocations: number[],
    constraints: BudgetConstraints,
    arms: Arm[]
  ): number[] {
    return this.constraintStrategy.applyConstraints(rawAllocations, constraints, arms);
  }
}
```

---

## Safe Extension Guidelines

### DO: Safe Extension Practices

1. **Use Protected Methods**: Only override methods marked as `protected`
2. **Call Super**: Use `super.methodName()` to preserve base functionality
3. **Add New Methods**: Extend functionality with new private/protected methods
4. **Strategy Pattern**: Use composition for major algorithmic changes
5. **Type Safety**: Maintain strict TypeScript typing for all extensions

### DON'T: Unsafe Practices

1. **Override Private Methods**: These are implementation details subject to change
2. **Modify Core Types**: Don't change `Arm`, `BudgetConstraints`, or `AllocationResult` interfaces
3. **Skip Validation**: Always validate inputs and maintain constraint compliance
4. **Break Contracts**: Ensure overridden methods maintain expected behavior
5. **Ignore Errors**: Properly handle and propagate errors from base methods

### Contract Requirements

Extensions must maintain these contracts:

- **Budget Conservation**: Total allocations must equal input budget
- **Constraint Compliance**: All business constraints must be respected
- **Performance Metrics**: Required metrics must be computed and returned
- **Error Handling**: Graceful failure with informative error messages
- **Deterministic Results**: Same inputs should produce same outputs (given same random seed)

---

## Testing Extension Points

### Subclass Contract Tests

```typescript
describe('MyCustomOptimizer', () => {
  it('should maintain budget conservation', async () => {
    const optimizer = new MyCustomOptimizer(config);
    const result = await optimizer.allocateBudget(1000, arms, constraints);

    const totalAllocated = result.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(totalAllocated).toBeCloseTo(1000, 2);
  });

  it('should respect constraints', async () => {
    const optimizer = new MyCustomOptimizer(config);
    const result = await optimizer.allocateBudget(1000, arms, strictConstraints);

    result.allocations.forEach((allocation, i) => {
      expect(allocation.amount).toBeGreaterThanOrEqual(arms[i].minBudget);
      expect(allocation.amount).toBeLessThanOrEqual(arms[i].maxBudget);
    });
  });

  it('should provide valid posterior distributions', () => {
    const optimizer = new MyCustomOptimizer(config);
    const posterior = optimizer.testBayesianUpdate(mockArm);

    expect(posterior.alpha).toBeGreaterThan(0);
    expect(posterior.beta).toBeGreaterThan(0);
    expect(posterior.shape).toBeGreaterThan(0);
    expect(posterior.rate).toBeGreaterThan(0);
  });
});
```

### Strategy Integration Tests

```typescript
describe('Strategy Integration', () => {
  it('should work with different sampling strategies', async () => {
    const strategies = [
      new MonteCarloBayesSampling(),
      new VariationalBayesSampling()
    ];

    for (const strategy of strategies) {
      const optimizer = new ConfigurableThompsonSampling(
        strategy, constraintStrategy, priorStrategy, config
      );

      const result = await optimizer.allocateBudget(1000, arms, constraints);
      expect(result.success).toBe(true);
      expect(result.allocations).toHaveLength(arms.length);
    }
  });
});
```

---

## Performance Considerations

### Optimization Tips

1. **Cache Expensive Calculations**: Cache prior computations and posterior updates
2. **Batch Operations**: Process multiple arms together where possible
3. **Lazy Evaluation**: Compute expensive metrics only when needed
4. **Memory Management**: Clean up temporary data structures
5. **Async Operations**: Use async/await for database and API calls

### Monitoring Hooks

```typescript
interface OptimizationMetrics {
  executionTime: number;
  memoryUsage: number;
  convergenceIterations: number;
  constraintViolations: number;
}

export abstract class InstrumentedOptimizer extends ThompsonSamplingOptimizer {
  protected abstract recordMetrics(metrics: OptimizationMetrics): void;

  protected override async allocateBudget(
    totalBudget: number,
    arms: Arm[],
    constraints: BudgetConstraints
  ): Promise<OptimizationResult> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await super.allocateBudget(totalBudget, arms, constraints);

      this.recordMetrics({
        executionTime: performance.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed - startMemory.heapUsed,
        convergenceIterations: result.metadata.iterations,
        constraintViolations: result.metadata.violations
      });

      return result;
    } catch (error) {
      this.recordMetrics({
        executionTime: performance.now() - startTime,
        memoryUsage: -1,
        convergenceIterations: -1,
        constraintViolations: -1
      });
      throw error;
    }
  }
}
```

---

## Version Compatibility

### Stable API (v2.0+)

The following methods are guaranteed stable across minor versions:

- `sampleBeta()`, `sampleGamma()`
- `bayesianUpdate()`
- `applyConstraints()`
- `generateReasoning()`
- `normalizeAllocations()`

### Internal API (Subject to Change)

These methods may change in minor versions:

- Private methods (not accessible to extensions)
- Internal data structures
- Performance optimization internals

### Breaking Changes

Major version changes (v2.0 → v3.0) may include:

- Changes to protected method signatures
- New required abstract methods
- Modified constraint interfaces
- Updated return types

---

## Support and Migration

### Getting Help

1. **Documentation**: Check this file for extension patterns
2. **Code Examples**: See `tests/` directory for usage examples
3. **Type Definitions**: Use TypeScript IntelliSense for method signatures
4. **Issues**: Report bugs or feature requests via GitHub issues

### Migration Guide

When upgrading between versions:

1. **Check Breaking Changes**: Review CHANGELOG.md for API changes
2. **Update Type Definitions**: Ensure custom types match new interfaces
3. **Test Extensions**: Run full test suite after upgrading
4. **Performance Testing**: Verify optimization performance is maintained
5. **Gradual Rollout**: Use feature flags for production deployments

---

*Last Updated: 2025-01-20*
*Version: v2.0*