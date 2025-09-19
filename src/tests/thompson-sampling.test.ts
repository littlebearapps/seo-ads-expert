/**
 * Thompson Sampling Test Suite
 *
 * Tests for convergence, exploration-exploitation balance, and constraint enforcement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ThompsonSamplingOptimizer, Arm, BudgetConstraints } from '../optimization/thompson-sampling.js';
import { ConstrainedBudgetAllocator, Campaign, OptimizationObjectives } from '../optimization/constrained-allocator.js';

describe('Thompson Sampling Optimizer', () => {
  let optimizer: ThompsonSamplingOptimizer;

  beforeEach(() => {
    optimizer = new ThompsonSamplingOptimizer();
  });

  describe('Basic Allocation', () => {
    it('should allocate budget proportionally to performance', () => {
      const arms: Arm[] = [
        {
          id: 'high_performer',
          name: 'High Performer',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 500,
            conversions: 50,
            revenue: 2500,
            impressions: 10000,
          },
          currentDailyBudget: 30,
        },
        {
          id: 'low_performer',
          name: 'Low Performer',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 400,
            conversions: 10,
            revenue: 500,
            impressions: 8000,
          },
          currentDailyBudget: 30,
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
        maxChangePercent: 50,
      };

      const allocations = optimizer.allocateBudget(arms, 60, constraints);

      expect(allocations).toHaveLength(2);

      const highPerformerAlloc = allocations.find(a => a.armId === 'high_performer');
      const lowPerformerAlloc = allocations.find(a => a.armId === 'low_performer');

      // High performer should get more budget
      expect(highPerformerAlloc!.proposedDailyBudget).toBeGreaterThan(
        lowPerformerAlloc!.proposedDailyBudget
      );

      // Total should equal budget
      const total = allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0);
      expect(Math.abs(total - 60)).toBeLessThan(0.1);
    });

    it('should respect minimum budget constraints', () => {
      const arms: Arm[] = [
        {
          id: 'camp1',
          name: 'Campaign 1',
          type: 'campaign',
          metrics30d: {
            spend: 100,
            clicks: 50,
            conversions: 5,
            revenue: 250,
            impressions: 1000,
          },
        },
        {
          id: 'camp2',
          name: 'Campaign 2',
          type: 'campaign',
          metrics30d: {
            spend: 100,
            clicks: 40,
            conversions: 2,
            revenue: 100,
            impressions: 800,
          },
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 15,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
        min_per_campaign: 15,
      };

      const allocations = optimizer.allocateBudget(arms, 30, constraints);

      // Both campaigns should get at least minimum
      allocations.forEach(alloc => {
        expect(alloc.proposedDailyBudget).toBeGreaterThanOrEqual(15);
      });
    });

    it('should respect maximum change percent', () => {
      const arms: Arm[] = [
        {
          id: 'camp1',
          name: 'Campaign 1',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 500,
            conversions: 50,
            revenue: 2500,
            impressions: 10000,
          },
          currentDailyBudget: 20,
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
        maxChangePercent: 25,
      };

      const allocations = optimizer.allocateBudget(arms, 50, constraints);
      const allocation = allocations[0];

      // Should not exceed 25% change
      const maxAllowed = 20 * 1.25;
      expect(allocation.proposedDailyBudget).toBeLessThanOrEqual(maxAllowed);
    });
  });

  describe('Exploration vs Exploitation', () => {
    it('should maintain exploration floor', () => {
      const arms: Arm[] = [
        {
          id: 'established',
          name: 'Established Campaign',
          type: 'campaign',
          metrics30d: {
            spend: 10000,
            clicks: 5000,
            conversions: 500,
            revenue: 25000,
            impressions: 100000,
          },
          currentDailyBudget: 40,
        },
        {
          id: 'new',
          name: 'New Campaign',
          type: 'campaign',
          metrics30d: {
            spend: 100,
            clicks: 10,
            conversions: 1,
            revenue: 50,
            impressions: 200,
          },
          currentDailyBudget: 5,
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.5,
        explorationFloor: 0.1,
      };

      const allocations = optimizer.allocateBudget(arms, 50, constraints);
      const newCampaignAlloc = allocations.find(a => a.armId === 'new');

      // New campaign should get at least 10% due to exploration floor
      expect(newCampaignAlloc!.proposedDailyBudget).toBeGreaterThanOrEqual(5);
      expect(newCampaignAlloc!.explorationBonus).toBeGreaterThan(0);
    });

    it('should increase exploration with higher risk tolerance', () => {
      const arms: Arm[] = generateTestArms(3);

      const lowRiskAllocations = optimizer.allocateBudget(arms, 100, {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.1,
      });

      const highRiskAllocations = optimizer.allocateBudget(arms, 100, {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.9,
      });

      // Calculate variance as proxy for exploration
      const lowRiskVariance = calculateVariance(lowRiskAllocations.map(a => a.proposedDailyBudget));
      const highRiskVariance = calculateVariance(highRiskAllocations.map(a => a.proposedDailyBudget));

      // Higher risk tolerance should lead to more balanced allocation (lower variance)
      expect(highRiskVariance).toBeLessThan(lowRiskVariance * 1.2);
    });
  });

  describe('Convergence Properties', () => {
    it('should converge to optimal allocation over iterations', async () => {
      // Create arms with known optimal allocation
      const arms: Arm[] = [
        {
          id: 'best',
          name: 'Best Campaign',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 500,
            conversions: 100,
            revenue: 5000,
            impressions: 10000,
          },
        },
        {
          id: 'medium',
          name: 'Medium Campaign',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 400,
            conversions: 40,
            revenue: 2000,
            impressions: 8000,
          },
        },
        {
          id: 'worst',
          name: 'Worst Campaign',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 300,
            conversions: 10,
            revenue: 500,
            impressions: 6000,
          },
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
      };

      // Run multiple iterations
      const iterations = 100;
      const allocationsHistory: number[][] = [];

      for (let i = 0; i < iterations; i++) {
        const allocations = optimizer.allocateBudget(arms, 100, constraints);
        allocationsHistory.push(allocations.map(a => a.proposedDailyBudget));
      }

      // Calculate average allocation in last 20 iterations
      const lastIterations = allocationsHistory.slice(-20);
      const avgAllocations = arms.map((_, idx) => {
        const sum = lastIterations.reduce((acc, alloc) => acc + alloc[idx], 0);
        return sum / lastIterations.length;
      });

      // Best campaign should get most budget
      expect(avgAllocations[0]).toBeGreaterThan(avgAllocations[1]);
      expect(avgAllocations[1]).toBeGreaterThan(avgAllocations[2]);

      // Check convergence (variance should decrease)
      const earlyVariance = calculateIterationVariance(allocationsHistory.slice(0, 20));
      const lateVariance = calculateIterationVariance(allocationsHistory.slice(-20));

      // Late variance should be lower (more stable)
      expect(lateVariance).toBeLessThan(earlyVariance);
    });
  });

  describe('Multi-currency Support', () => {
    it('should respect currency-specific caps', () => {
      const arms: Arm[] = generateTestArms(2);

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
        daily_cap_AUD: 40,
      };

      const allocations = optimizer.allocateBudget(arms, 50, constraints);
      const total = allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0);

      // Should respect AUD cap even if total budget is higher
      expect(total).toBeLessThanOrEqual(40);
    });
  });

  describe('Confidence Intervals', () => {
    it('should provide reasonable confidence intervals', () => {
      const arms: Arm[] = [
        {
          id: 'high_confidence',
          name: 'High Confidence',
          type: 'campaign',
          metrics30d: {
            spend: 10000,
            clicks: 5000,
            conversions: 500,
            revenue: 25000,
            impressions: 100000,
          },
        },
        {
          id: 'low_confidence',
          name: 'Low Confidence',
          type: 'campaign',
          metrics30d: {
            spend: 100,
            clicks: 10,
            conversions: 1,
            revenue: 50,
            impressions: 200,
          },
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
      };

      const allocations = optimizer.allocateBudget(arms, 50, constraints);

      const highConfAlloc = allocations.find(a => a.armId === 'high_confidence');
      const lowConfAlloc = allocations.find(a => a.armId === 'low_confidence');

      // High confidence should have tighter interval
      const highConfRange = highConfAlloc!.confidenceInterval[1] - highConfAlloc!.confidenceInterval[0];
      const lowConfRange = lowConfAlloc!.confidenceInterval[1] - lowConfAlloc!.confidenceInterval[0];

      expect(highConfRange).toBeLessThan(lowConfRange * 2);
    });
  });
});

describe('Constrained Budget Allocator', () => {
  let allocator: ConstrainedBudgetAllocator;

  beforeEach(() => {
    allocator = new ConstrainedBudgetAllocator();
  });

  describe('Multi-objective Optimization', () => {
    it('should optimize for CPA target', () => {
      const campaigns: Campaign[] = [
        {
          id: 'good_cpa',
          name: 'Good CPA',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 100,
            conversions: 20,
            revenue: 1000,
            impressions: 2000,
          },
          targetCPA: 50,
        },
        {
          id: 'bad_cpa',
          name: 'Bad CPA',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 50,
            conversions: 5,
            revenue: 250,
            impressions: 1000,
          },
          targetCPA: 50,
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
      };

      const objectives: OptimizationObjectives = {
        primaryObjective: 'target_cpa',
        targetCPA: 50,
      };

      const result = allocator.optimize(campaigns, 60, constraints, objectives);

      expect(result.feasible).toBe(true);

      // Good CPA campaign should get more budget
      const goodCpaAlloc = result.allocations.get('good_cpa') ?? 0;
      const badCpaAlloc = result.allocations.get('bad_cpa') ?? 0;
      expect(goodCpaAlloc).toBeGreaterThan(badCpaAlloc);
    });

    it('should optimize for ROAS target', () => {
      const campaigns: Campaign[] = [
        {
          id: 'high_roas',
          name: 'High ROAS',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 200,
            conversions: 40,
            revenue: 4000,
            impressions: 4000,
          },
        },
        {
          id: 'low_roas',
          name: 'Low ROAS',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 150,
            conversions: 20,
            revenue: 1500,
            impressions: 3000,
          },
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
      };

      const objectives: OptimizationObjectives = {
        primaryObjective: 'maximize_revenue',
      };

      const result = allocator.optimize(campaigns, 80, constraints, objectives);

      const highRoasAlloc = result.allocations.get('high_roas') ?? 0;
      const lowRoasAlloc = result.allocations.get('low_roas') ?? 0;

      expect(highRoasAlloc).toBeGreaterThan(lowRoasAlloc);
      expect(result.expectedPerformance.expectedROAS).toBeGreaterThan(2);
    });
  });

  describe('Constraint Violations', () => {
    it('should detect budget cap violations', () => {
      const campaigns: Campaign[] = [
        {
          id: 'camp1',
          name: 'Campaign 1',
          type: 'campaign',
          metrics30d: {
            spend: 100,
            clicks: 50,
            conversions: 5,
            revenue: 250,
            impressions: 1000,
          },
          minBudget: 50,
        },
        {
          id: 'camp2',
          name: 'Campaign 2',
          type: 'campaign',
          metrics30d: {
            spend: 100,
            clicks: 40,
            conversions: 4,
            revenue: 200,
            impressions: 800,
          },
          minBudget: 50,
        },
      ];

      const constraints: BudgetConstraints = {
        minDailyBudget: 50,
        maxDailyBudget: 100,
        riskTolerance: 0.3,
      };

      const objectives: OptimizationObjectives = {
        primaryObjective: 'maximize_conversions',
      };

      // Try to allocate less than minimum required
      const result = allocator.optimize(campaigns, 80, constraints, objectives);

      // Should have violations since 2 * 50 = 100 > 80
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Portfolio Diversification', () => {
    it('should apply balanced allocation when requested', () => {
      const campaigns: Campaign[] = generateTestCampaigns(4);

      const constraints: BudgetConstraints = {
        minDailyBudget: 5,
        maxDailyBudget: 100,
        riskTolerance: 0.5,
      };

      const objectives: OptimizationObjectives = {
        primaryObjective: 'maximize_conversions',
        balancedAllocation: true,
      };

      const result = allocator.optimize(campaigns, 100, constraints, objectives);

      const allocations = Array.from(result.allocations.values());
      const cv = calculateCoefficientOfVariation(allocations);

      // Balanced allocation should have lower CV
      expect(cv).toBeLessThan(1);
    });
  });
});

// Helper functions
function generateTestArms(count: number): Arm[] {
  const arms: Arm[] = [];
  for (let i = 0; i < count; i++) {
    arms.push({
      id: `arm_${i}`,
      name: `Arm ${i}`,
      type: 'campaign',
      metrics30d: {
        spend: 1000 + Math.random() * 1000,
        clicks: 100 + Math.random() * 400,
        conversions: 5 + Math.random() * 45,
        revenue: 250 + Math.random() * 2250,
        impressions: 2000 + Math.random() * 8000,
      },
    });
  }
  return arms;
}

function generateTestCampaigns(count: number): Campaign[] {
  return generateTestArms(count) as Campaign[];
}

function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}

function calculateIterationVariance(iterations: number[][]): number {
  // Calculate variance across iterations for each arm
  const armCount = iterations[0].length;
  let totalVariance = 0;

  for (let arm = 0; arm < armCount; arm++) {
    const armValues = iterations.map(iter => iter[arm]);
    totalVariance += calculateVariance(armValues);
  }

  return totalVariance / armCount;
}

function calculateCoefficientOfVariation(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = calculateVariance(values);
  return Math.sqrt(variance) / mean;
}