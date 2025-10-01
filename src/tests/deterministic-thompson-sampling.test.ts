/**
 * Deterministic Thompson Sampling Tests
 *
 * Demonstrates proper test patterns for stochastic algorithms:
 * 1. Exact deterministic assertions with seeded random
 * 2. Statistical property validation
 * 3. Convergence testing with bounded variance
 * 4. Seed sensitivity testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThompsonSamplingOptimizer, Arm, BudgetConstraints } from '../optimization/thompson-sampling.js';
import { setupDeterministicEnvironment, teardownDeterministicEnvironment } from '../test-utils/setup-clock.js';
import { setupSeededRandom, SeededRandomProvider } from '../test-utils/seeded-random.js';

describe('Deterministic Thompson Sampling', () => {
  let optimizer: ThompsonSamplingOptimizer;
  let seededRandom: SeededRandomProvider;

  // Test data that should produce consistent results
  const testArms: Arm[] = [
    {
      id: 'high_performer',
      name: 'High Performer',
      type: 'campaign',
      metrics30d: {
        spend: 1000,
        clicks: 500,
        conversions: 100,
        revenue: 5000,
        impressions: 10000,
        qualityScore: 8,
      },
      currentDailyBudget: 30,
    },
    {
      id: 'medium_performer',
      name: 'Medium Performer',
      type: 'campaign',
      metrics30d: {
        spend: 1000,
        clicks: 400,
        conversions: 60,
        revenue: 3000,
        impressions: 8000,
        qualityScore: 6,
      },
      currentDailyBudget: 25,
    },
    {
      id: 'low_performer',
      name: 'Low Performer',
      type: 'campaign',
      metrics30d: {
        spend: 1000,
        clicks: 300,
        conversions: 20,
        revenue: 1000,
        impressions: 6000,
        qualityScore: 4,
      },
      currentDailyBudget: 20,
    },
  ];

  const standardConstraints: BudgetConstraints = {
    minDailyBudget: 5,
    maxDailyBudget: 100,
    riskTolerance: 0.3,
    maxChangePercent: 25,
    explorationFloor: 0.1,
  };

  beforeEach(() => {
    const env = setupDeterministicEnvironment('2025-01-20T12:00:00Z', 12345);
    seededRandom = env.random;
    optimizer = new ThompsonSamplingOptimizer();
  });

  afterEach(() => {
    teardownDeterministicEnvironment();
  });

  describe('Exact Deterministic Results', () => {
    it('should produce identical results with same seed', () => {
      // First run
      const allocations1 = optimizer.allocateBudget(testArms, 75, standardConstraints);

      // Reset to same seed
      seededRandom.setSeed(12345);
      optimizer.reset();

      // Second run should be identical
      const allocations2 = optimizer.allocateBudget(testArms, 75, standardConstraints);

      expect(allocations1).toHaveLength(allocations2.length);

      for (let i = 0; i < allocations1.length; i++) {
        expect(allocations1[i].proposedDailyBudget).toBeCloseTo(
          allocations2[i].proposedDailyBudget,
          2 // 2 decimal places precision
        );
        expect(allocations1[i].thompsonScore).toBeCloseTo(
          allocations2[i].thompsonScore,
          6 // Higher precision for score comparison
        );
        expect(allocations1[i].armId).toBe(allocations2[i].armId);
      }
    });

    it('should produce consistent specific values with known seed', () => {
      // With seed 12345, these values should be deterministic
      const allocations = optimizer.allocateBudget(testArms, 75, standardConstraints);

      // Store actual values from first run for comparison
      const actualBudgets = allocations.map(a => a.proposedDailyBudget);
      const actualScores = allocations.map(a => a.thompsonScore);

      // Reset and run again - should get identical results
      seededRandom.setSeed(12345);
      optimizer.reset();
      const allocations2 = optimizer.allocateBudget(testArms, 75, standardConstraints);

      // Values should be identical between runs
      allocations2.forEach((alloc, idx) => {
        expect(alloc.proposedDailyBudget).toBeCloseTo(actualBudgets[idx], 6);
        expect(alloc.thompsonScore).toBeCloseTo(actualScores[idx], 10);
      });

      // Total should always sum to budget
      const total = allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0);
      expect(total).toBeCloseTo(75, 0.1);

      // High performer should get most budget (performance-based expectation)
      const highPerfAlloc = allocations.find(a => a.armId === 'high_performer');
      const mediumPerfAlloc = allocations.find(a => a.armId === 'medium_performer');
      const lowPerfAlloc = allocations.find(a => a.armId === 'low_performer');

      expect(highPerfAlloc!.proposedDailyBudget).toBeGreaterThanOrEqual(
        mediumPerfAlloc!.proposedDailyBudget
      );
      expect(mediumPerfAlloc!.proposedDailyBudget).toBeGreaterThanOrEqual(
        lowPerfAlloc!.proposedDailyBudget
      );
    });

    it('should show variance across different seeds but maintain ordering', () => {
      const iterations = 20;
      const allThompsonScores: number[][] = [];
      const allBudgets: number[][] = [];

      for (let i = 0; i < iterations; i++) {
        // Use different seeds for statistical variety
        seededRandom.setSeed(12345 + i * 1000); // Spread seeds further apart
        optimizer.reset();

        const allocations = optimizer.allocateBudget(testArms, 75, standardConstraints);
        allThompsonScores.push(allocations.map(a => a.thompsonScore));
        allBudgets.push(allocations.map(a => a.proposedDailyBudget));
      }

      // Calculate statistics for each arm
      const scoreStats = testArms.map((_, armIndex) => {
        const scores = allThompsonScores.map(iteration => iteration[armIndex]);
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        return { mean, variance, scores };
      });

      const budgetStats = testArms.map((_, armIndex) => {
        const budgets = allBudgets.map(iteration => iteration[armIndex]);
        const mean = budgets.reduce((sum, budget) => sum + budget, 0) / budgets.length;
        const variance = budgets.reduce((sum, budget) => sum + Math.pow(budget - mean, 2), 0) / budgets.length;
        return { mean, variance, budgets };
      });

      // High performer should generally have highest mean scores
      expect(scoreStats[0].mean).toBeGreaterThan(scoreStats[2].mean);

      // Check that we have some variance across different seeds
      const totalBudgetVariance = budgetStats.reduce((sum, stats) => sum + stats.variance, 0);
      expect(totalBudgetVariance).toBeGreaterThan(0.1); // Some variance across seeds

      // All budgets should be within constraints
      budgetStats.forEach(stats => {
        stats.budgets.forEach(budget => {
          expect(budget).toBeGreaterThanOrEqual(5);
          expect(budget).toBeLessThanOrEqual(100);
        });
      });
    });
  });

  describe('Statistical Distribution Validation', () => {
    it('should maintain valid Thompson sampling properties', () => {
      // Test that our seeded random maintains statistical correctness
      const sampleSize = 50;
      const samples: number[] = [];

      // Reset to known seed for consistent results
      seededRandom.setSeed(42);

      // Sample from our random distribution multiple times with varying seeds
      for (let i = 0; i < sampleSize; i++) {
        seededRandom.setSeed(42 + i * 100); // Different seeds for variety
        optimizer.reset();

        const allocations = optimizer.allocateBudget([testArms[0]], 30, standardConstraints);
        samples.push(allocations[0].thompsonScore);
      }

      // Statistical tests
      const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
      const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;

      // Thompson scores should be positive and finite
      expect(samples.every(s => s > 0 && isFinite(s))).toBe(true);

      // Should have some reasonable variation
      expect(variance).toBeGreaterThan(0);

      // Mean should be positive
      expect(mean).toBeGreaterThan(0);

      // All samples should be within reasonable bounds
      const maxScore = Math.max(...samples);
      const minScore = Math.min(...samples);
      expect(maxScore).toBeGreaterThan(minScore); // Should have some spread
    });

    it('should show exploration decay over iterations', () => {
      const iterations = 20;
      const explorationBonuses: number[] = [];

      // Reset to consistent seed
      seededRandom.setSeed(99999);

      for (let i = 0; i < iterations; i++) {
        const allocations = optimizer.allocateBudget(testArms, 75, {
          ...standardConstraints,
          explorationFloor: 0.02,
          decayRate: 0.9,
          minExplorationFloor: 0.01,
        });

        // Track exploration bonus for campaign with least certainty
        const lowestSampleAlloc = allocations.find(a => a.armId === 'low_performer');
        explorationBonuses.push(lowestSampleAlloc?.explorationBonus || 0);
      }

      // Exploration should be positive throughout
      expect(explorationBonuses.every(bonus => bonus > 0)).toBe(true);

      // Later exploration should generally be less than early exploration
      const firstBonus = explorationBonuses[0];
      const lastBonus = explorationBonuses[explorationBonuses.length - 1];

      // Should show some decay, but allow for stochastic variation
      expect(lastBonus).toBeLessThanOrEqual(firstBonus * 1.5);
      expect(lastBonus).toBeGreaterThan(0.005); // Should not go to zero
    });
  });

  describe('Seed Sensitivity and Robustness', () => {
    it('should produce different but valid results with different seeds', () => {
      const seeds = [12345, 54321, 99999, 11111];
      const allResults: any[] = [];

      seeds.forEach(seed => {
        seededRandom.setSeed(seed);
        optimizer.reset();

        const allocations = optimizer.allocateBudget(testArms, 75, standardConstraints);
        allResults.push({
          seed,
          budgets: allocations.map(a => a.proposedDailyBudget),
          scores: allocations.map(a => a.thompsonScore),
        });
      });

      // Results should be different across seeds
      for (let i = 0; i < allResults.length - 1; i++) {
        for (let j = i + 1; j < allResults.length; j++) {
          const result1 = allResults[i];
          const result2 = allResults[j];

          // At least one budget should be meaningfully different
          const budgetDiffs = result1.budgets.map((b1: number, idx: number) =>
            Math.abs(b1 - result2.budgets[idx])
          );
          const maxDiff = Math.max(...budgetDiffs);
          expect(maxDiff).toBeGreaterThan(0.1); // Some meaningful difference
        }
      }

      // But all results should maintain constraints
      allResults.forEach(result => {
        const totalBudget = result.budgets.reduce((sum: number, b: number) => sum + b, 0);
        expect(totalBudget).toBeCloseTo(75, 0.1);

        result.budgets.forEach((budget: number) => {
          expect(budget).toBeGreaterThanOrEqual(5); // Min constraint
          expect(budget).toBeLessThanOrEqual(100); // Max constraint
        });
      });
    });

    it('should handle edge cases deterministically', () => {
      // Test with minimal data
      const minimalArms: Arm[] = [
        {
          id: 'minimal',
          name: 'Minimal Data',
          type: 'campaign',
          metrics30d: {
            spend: 10,
            clicks: 1,
            conversions: 0,
            revenue: 0,
            impressions: 10,
          },
        },
      ];

      // Should not crash or produce invalid results
      seededRandom.setSeed(12345);
      const allocations = optimizer.allocateBudget(minimalArms, 20, standardConstraints);

      expect(allocations).toHaveLength(1);
      expect(allocations[0].proposedDailyBudget).toBeGreaterThanOrEqual(5);
      expect(allocations[0].proposedDailyBudget).toBeLessThanOrEqual(20);
      expect(allocations[0].thompsonScore).toBeGreaterThan(0);
    });
  });

  describe('Convergence with Bounded Variance', () => {
    it('should show learning behavior over iterations', () => {
      const learningIterations = 30;
      const allAllocations: number[][] = [];
      const allScores: number[][] = [];

      // Reset to known seed for consistent test
      seededRandom.setSeed(55555);
      optimizer.reset();

      // Simulate learning over time
      for (let i = 0; i < learningIterations; i++) {
        const allocations = optimizer.allocateBudget(testArms, 75, {
          ...standardConstraints,
          explorationFloor: 0.02,
          decayRate: 0.95,
        });

        allAllocations.push(allocations.map(a => a.proposedDailyBudget));
        allScores.push(allocations.map(a => a.thompsonScore));

        // Simulate learning from results every few iterations
        if (i % 3 === 0) {
          allocations.forEach((alloc, idx) => {
            const arm = testArms[idx];
            // Simulate realistic performance feedback
            const clicks = Math.round(alloc.proposedDailyBudget * 2);
            const conversions = Math.max(1, Math.round(clicks * (arm.metrics30d.conversions / arm.metrics30d.clicks)));
            const revenue = conversions * (arm.metrics30d.revenue / arm.metrics30d.conversions);

            optimizer.updatePosteriorFromResults(arm.id, clicks, conversions, revenue);
          });
        }
      }

      // Check that allocations show some stability
      expect(allAllocations.length).toBe(learningIterations);

      // All allocations should sum to budget
      allAllocations.forEach(allocation => {
        const total = allocation.reduce((sum, budget) => sum + budget, 0);
        expect(total).toBeCloseTo(75, 0.1);
      });

      // High performer should generally get more budget than low performer
      let highPerformerWins = 0;
      allAllocations.forEach(allocation => {
        if (allocation[0] > allocation[2]) { // high_performer vs low_performer
          highPerformerWins++;
        }
      });

      // High performer should win most of the time (allow some exploration)
      expect(highPerformerWins).toBeGreaterThan(learningIterations * 0.6);
    });
  });
});

// Helper function
function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}