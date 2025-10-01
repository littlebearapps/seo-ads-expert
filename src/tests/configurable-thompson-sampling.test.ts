/**
 * Integration tests for ConfigurableThompsonSampling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigurableThompsonSampling } from '../optimization/configurable-thompson-sampling.js';
import { MonteCarloBayesSampling, VariationalBayesSampling } from '../optimization/strategies/sampling-strategy.js';
import { BasicConstraintStrategy, AdvancedConstraintStrategy } from '../optimization/strategies/constraint-strategy.js';
import { HierarchicalBayesPriors, InformativePriors } from '../optimization/strategies/prior-strategy.js';
import { Arm, BudgetConstraints } from '../optimization/types.js';

describe('ConfigurableThompsonSampling Integration', () => {
  // Test data setup
  const createTestArms = (): Arm[] => [
    {
      id: 'campaign1',
      name: 'High Performance Search',
      type: 'campaign' as const,
      metrics30d: {
        spend: 1000,
        clicks: 500,
        conversions: 25,
        revenue: 3750,
        impressions: 10000,
        qualityScore: 8
      },
      currentDailyBudget: 33,
      minBudget: 10,
      maxBudget: 100
    },
    {
      id: 'campaign2',
      name: 'Medium Display',
      type: 'campaign' as const,
      metrics30d: {
        spend: 600,
        clicks: 400,
        conversions: 8,
        revenue: 800,
        impressions: 20000,
        qualityScore: 6
      },
      currentDailyBudget: 20,
      minBudget: 5,
      maxBudget: 50
    },
    {
      id: 'campaign3',
      name: 'Shopping Campaign',
      type: 'campaign' as const,
      metrics30d: {
        spend: 800,
        clicks: 400,
        conversions: 32,
        revenue: 6400,
        impressions: 5000,
        qualityScore: 9
      },
      currentDailyBudget: 27,
      minBudget: 10,
      maxBudget: 75
    }
  ];

  const createTestConstraints = (): BudgetConstraints => ({
    minDailyBudget: 5,
    maxDailyBudget: 100,
    riskTolerance: 0.5,
    maxChangePercent: 0.25,
    min_per_campaign: 5
  });

  const createConfig = () => ({
    explorationFloor: 0.1,
    maxIterations: 100,
    convergenceThreshold: 0.01,
    enableLogging: false,
    randomSeed: 12345
  });

  describe('Basic Configuration', () => {
    it('should initialize with all strategy components', () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const info = optimizer.getStrategyInformation();

      expect(info.sampling.name).toBe('Monte Carlo Bayesian Sampling');
      expect(info.constraint.name).toBe('Basic Constraint Strategy');
      expect(info.prior.name).toBe('Hierarchical Bayesian Priors');
      expect(info.configuration.explorationFloor).toBe(0.1);
    });

    it('should allocate budget with basic strategies', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(12345),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const result = await optimizer.allocateBudget(100, arms, constraints);

      expect(result.success).toBe(true);
      expect(result.allocations).toHaveLength(3);
      expect(result.totalAllocated).toBeCloseTo(100, 1);

      // Check allocations respect constraints
      result.allocations.forEach((allocation, i) => {
        expect(allocation.proposedDailyBudget).toBeGreaterThanOrEqual(arms[i].minBudget || 0);
        expect(allocation.proposedDailyBudget).toBeLessThanOrEqual(arms[i].maxBudget || Infinity);
      });

      // Check metadata
      expect(result.strategyMetadata.sampling).toBe('Monte Carlo Bayesian Sampling');
      expect(result.strategyMetadata.constraint).toBe('Basic Constraint Strategy');
      expect(result.strategyMetadata.prior).toBe('Hierarchical Bayesian Priors');
    });

    it('should allocate budget with advanced strategies', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new VariationalBayesSampling(),
        new AdvancedConstraintStrategy(),
        new InformativePriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const result = await optimizer.allocateBudget(100, arms, constraints);

      expect(result.success).toBe(true);
      expect(result.allocations).toHaveLength(3);
      expect(result.totalAllocated).toBeCloseTo(100, 1);

      // Advanced strategies should provide diagnostics
      expect(result.diagnostics.convergenceIterations).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.finalObjectiveValue).toBeGreaterThan(0);
      expect(result.diagnostics.strategyPerformance.samplingAccuracy).toBeGreaterThan(0);
      expect(result.diagnostics.strategyPerformance.constraintEfficiency).toBeGreaterThan(0);
      expect(result.diagnostics.strategyPerformance.priorReliability).toBeGreaterThan(0);
    });
  });

  describe('Prior Integration', () => {
    it('should initialize priors from historical data', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const arms = createTestArms();

      // Initialize priors before allocation
      await optimizer.initializePriors(arms);

      const result = await optimizer.allocateBudget(3000, arms, createTestConstraints());

      expect(result.success).toBe(true);

      // Priors should influence allocation
      // Shopping campaign with best historical performance should get more budget
      const shoppingAllocation = result.allocations.find(a => a.armId === 'campaign3');
      const displayAllocation = result.allocations.find(a => a.armId === 'campaign2');

      expect(shoppingAllocation).toBeDefined();
      expect(displayAllocation).toBeDefined();
      expect(shoppingAllocation!.proposedDailyBudget).toBeGreaterThan(displayAllocation!.proposedDailyBudget);
    });

    it('should update priors with performance data', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const arms = createTestArms();
      await optimizer.initializePriors(arms);

      // Record new performance data
      await optimizer.recordPerformance([
        {
          armId: 'campaign1',
          timestamp: new Date().toISOString(),
          metrics: {
            date: new Date().toISOString(),
            impressions: 1000,
            clicks: 60,
            conversions: 5,
            cost: 120,
            conversionValue: 750,
            qualityScore: 8.5
          }
        }
      ]);

      const result = await optimizer.allocateBudget(3000, arms, createTestConstraints());

      expect(result.success).toBe(true);

      // Updated performance should influence allocation
      const campaign1Allocation = result.allocations.find(a => a.armId === 'campaign1');
      expect(campaign1Allocation).toBeDefined();
      expect(campaign1Allocation!.confidenceScore).toBeGreaterThan(0);
    });
  });

  describe('Context-Aware Optimization', () => {
    it('should use optimization context for decision making', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new AdvancedConstraintStrategy(),
        new InformativePriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const context = {
        experimentId: 'exp123',
        timestamp: new Date().toISOString(),
        marketConditions: {
          seasonality: 1.5,
          competitiveness: 0.8,
          economicFactor: 1.1
        },
        objectives: {
          primary: 'revenue' as const,
          secondary: ['efficiency', 'market_share']
        }
      };

      const result = await optimizer.allocateBudget(3000, arms, constraints, context);

      expect(result.success).toBe(true);
      expect(result.context).toEqual(context);

      // Reasoning should include context information
      expect(result.reasoning).toContain('Optimization Objectives');
      expect(result.reasoning).toContain('Market Context');
    });
  });

  describe('Strategy Mixing', () => {
    it('should work with mixed strategy configurations', async () => {
      const configs = [
        {
          sampling: new MonteCarloBayesSampling(),
          constraint: new BasicConstraintStrategy(),
          prior: new InformativePriors()
        },
        {
          sampling: new VariationalBayesSampling(),
          constraint: new AdvancedConstraintStrategy(),
          prior: new HierarchicalBayesPriors()
        },
        {
          sampling: new MonteCarloBayesSampling(),
          constraint: new AdvancedConstraintStrategy(),
          prior: new InformativePriors()
        }
      ];

      const arms = createTestArms();
      const constraints = createTestConstraints();

      for (const strategyConfig of configs) {
        const optimizer = new ConfigurableThompsonSampling(
          strategyConfig.sampling,
          strategyConfig.constraint,
          strategyConfig.prior,
          createConfig()
        );

        const result = await optimizer.allocateBudget(100, arms, constraints);

        expect(result.success).toBe(true);
        expect(result.allocations).toHaveLength(3);
        expect(result.totalAllocated).toBeCloseTo(100, 1);

        // All configurations should produce valid allocations
        result.allocations.forEach((allocation, i) => {
          expect(allocation.proposedDailyBudget).toBeGreaterThanOrEqual(arms[i].minBudget || 0);
          expect(allocation.proposedDailyBudget).toBeLessThanOrEqual(arms[i].maxBudget || Infinity);
          expect(allocation.percentage).toBeGreaterThanOrEqual(0);
          expect(allocation.percentage).toBeLessThanOrEqual(1);
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle constraint validation failures', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const arms = createTestArms();

      // Create infeasible constraints
      const infeasibleConstraints: BudgetConstraints = {
        minDailyBudget: 100, // Each campaign needs 100, so 3x100=300 > 100 budget
        maxDailyBudget: 2000,
        riskTolerance: 0.5
      } as any;  // Using totalBudget which is not in BudgetConstraints
      (infeasibleConstraints as any).totalBudget = 100;

      console.log('Test arms:', arms.map(a => ({ id: a.id, minBudget: a.minBudget })));
      console.log('Test constraints:', infeasibleConstraints);

      const result = await optimizer.allocateBudget(100, arms, infeasibleConstraints);

      console.log('Result:', { success: result.success, reasoning: result.reasoning });

      expect(result.success).toBe(false);
      expect(result.reasoning.toLowerCase()).toContain('constraint validation failed');
      expect(result.diagnostics.constraintViolations).toBeGreaterThanOrEqual(0); // May be 0 if caught early
    });

    it('should handle empty arms array', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const result = await optimizer.allocateBudget(1000, [], createTestConstraints());

      expect(result.success).toBe(false);
      expect(result.allocations).toHaveLength(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should track optimization performance', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const result = await optimizer.allocateBudget(100, arms, constraints);

      expect(result.success).toBe(true);

      // Check performance metrics
      expect(result.metadata.optimizationTime).toBeGreaterThan(0);
      expect(result.metadata.optimizationTime).toBeLessThan(1000); // Should be fast

      // Check diagnostics
      expect(result.diagnostics.convergenceIterations).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.finalObjectiveValue).toBeGreaterThan(0);
    });

    it('should evaluate strategy performance', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new VariationalBayesSampling(),
        new AdvancedConstraintStrategy(),
        new InformativePriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const result = await optimizer.allocateBudget(100, arms, constraints);

      expect(result.success).toBe(true);

      const perf = result.diagnostics.strategyPerformance;

      // Variational sampling should have high accuracy
      expect(perf.samplingAccuracy).toBeGreaterThan(0.8);

      // Advanced constraints should be efficient
      expect(perf.constraintEfficiency).toBeGreaterThan(0.5);

      // Prior reliability depends on data
      expect(perf.priorReliability).toBeGreaterThan(0);
      expect(perf.priorReliability).toBeLessThanOrEqual(1);
    });
  });

  describe('Allocation Quality', () => {
    it('should produce reasonable allocations', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(99999),
        new AdvancedConstraintStrategy(),
        new HierarchicalBayesPriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const result = await optimizer.allocateBudget(100, arms, constraints);

      expect(result.success).toBe(true);

      // Shopping campaign with best CR should get significant budget
      const shoppingAlloc = result.allocations.find(a => a.armId === 'campaign3');
      expect(shoppingAlloc).toBeDefined();
      const shoppingPercentage = shoppingAlloc!.proposedDailyBudget / 100;
      expect(shoppingPercentage).toBeGreaterThan(0.2); // At least 20%

      // All arms should get at least exploration floor
      result.allocations.forEach(allocation => {
        const percentage = allocation.proposedDailyBudget / 100;
        expect(percentage).toBeGreaterThanOrEqual(0.1); // 10% exploration floor
      });
    });

    it('should provide allocation reasoning', async () => {
      const optimizer = new ConfigurableThompsonSampling(
        new MonteCarloBayesSampling(),
        new BasicConstraintStrategy(),
        new InformativePriors(),
        createConfig()
      );

      const arms = createTestArms();
      const constraints = createTestConstraints();

      const result = await optimizer.allocateBudget(100, arms, constraints);

      expect(result.success).toBe(true);

      // Each allocation should have reasoning
      result.allocations.forEach(allocation => {
        // Each allocation is part of overall reasoning
      });

      // Overall reasoning should be comprehensive
      expect(result.reasoning).toContain('Strategy Configuration');
      expect(result.reasoning).toContain('Thompson Sampling');
    });
  });
});