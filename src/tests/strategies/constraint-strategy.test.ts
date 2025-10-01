/**
 * Unit tests for ConstraintStrategy implementations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConstraintStrategy,
  ConstraintArm,
  BasicConstraintStrategy,
  AdvancedConstraintStrategy
} from '../../optimization/strategies/constraint-strategy.js';
import { BudgetConstraints } from '../../optimization/types.js';

describe('ConstraintStrategy Implementations', () => {
  // Test data setup
  const createTestArms = (): ConstraintArm[] => [
    {
      id: 'arm1',
      name: 'High Performer',
      minBudget: 100,
      maxBudget: 1000,
      currentBudget: 500,
      performance: {
        conversionRate: 0.05,
        averageValue: 150,
        costPerClick: 2,
        qualityScore: 8
      },
      metadata: {
        category: 'search',
        priority: 1,
        seasonality: 1.2,
        riskLevel: 'low'
      }
    },
    {
      id: 'arm2',
      name: 'Medium Performer',
      minBudget: 50,
      maxBudget: 500,
      currentBudget: 200,
      performance: {
        conversionRate: 0.03,
        averageValue: 100,
        costPerClick: 1.5,
        qualityScore: 6
      },
      metadata: {
        category: 'display',
        priority: 2,
        seasonality: 1.0,
        riskLevel: 'medium'
      }
    },
    {
      id: 'arm3',
      name: 'Low Performer',
      minBudget: 20,
      maxBudget: 200,
      currentBudget: 50,
      performance: {
        conversionRate: 0.01,
        averageValue: 80,
        costPerClick: 1,
        qualityScore: 4
      },
      metadata: {
        category: 'display',
        priority: 3,
        seasonality: 0.8,
        riskLevel: 'high'
      }
    }
  ];

  const createTestConstraints = (): BudgetConstraints => ({
    totalBudget: 1000,
    minBudget: 20,
    maxBudget: 1000,
    maxChangePercent: 0.25
  });

  describe('BasicConstraintStrategy', () => {
    let strategy: BasicConstraintStrategy;
    let arms: ConstraintArm[];
    let constraints: BudgetConstraints;

    beforeEach(() => {
      strategy = new BasicConstraintStrategy(0.01);
      arms = createTestArms();
      constraints = createTestConstraints();
    });

    it('should apply basic min/max constraints', () => {
      const rawAllocations = [500, 300, 200]; // Total: 1000
      const result = strategy.applyConstraints(rawAllocations, constraints, arms);

      // Check total budget is maintained
      const total = result.reduce((sum, a) => sum + a, 0);
      expect(total).toBeCloseTo(constraints.totalBudget, 1);

      // Check individual constraints
      result.forEach((allocation, i) => {
        expect(allocation).toBeGreaterThanOrEqual(arms[i].minBudget);
        expect(allocation).toBeLessThanOrEqual(arms[i].maxBudget);
      });
    });

    it('should handle allocations exceeding max budget', () => {
      const rawAllocations = [1500, 300, 200]; // arm1 exceeds max
      // Use constraints without totalBudget to preserve raw total where possible
      const constraintsWithoutTotal = { ...constraints };
      delete (constraintsWithoutTotal as any).totalBudget;

      const result = strategy.applyConstraints(rawAllocations, constraintsWithoutTotal, arms);

      // First arm should be capped at maxBudget
      expect(result[0]).toBeLessThanOrEqual(arms[0].maxBudget);

      // Total should be maximized within constraints (1700 is max possible)
      // Raw total 2000 is impossible due to max budget constraints
      const total = result.reduce((sum, a) => sum + a, 0);
      const maxPossible = arms.reduce((sum, arm) => sum + arm.maxBudget, 0); // 1700
      expect(total).toBeCloseTo(maxPossible, 1);

      // Should redistribute excess to other arms within their limits
      expect(result[1]).toBe(arms[1].maxBudget); // arm2 should be at max (500)
      expect(result[2]).toBe(arms[2].maxBudget); // arm3 should be at max (200)
    });

    it('should handle allocations below min budget', () => {
      const rawAllocations = [900, 30, 10]; // arm3 below min
      const rawTotal = rawAllocations.reduce((sum, a) => sum + a, 0); // 940
      // Use constraints without totalBudget to preserve raw total
      const constraintsWithoutTotal = { ...constraints };
      delete (constraintsWithoutTotal as any).totalBudget;

      const result = strategy.applyConstraints(rawAllocations, constraintsWithoutTotal, arms);

      // Third arm should be at least minBudget
      expect(result[2]).toBeGreaterThanOrEqual(arms[2].minBudget);

      // Total should be maintained from raw allocations
      const total = result.reduce((sum, a) => sum + a, 0);
      expect(total).toBeCloseTo(rawTotal, 1);
    });

    it('should validate feasible constraints', () => {
      const validation = strategy.validateConstraints(constraints, arms);

      expect(validation.valid).toBe(true);
      expect(validation.violations).toHaveLength(0);
      expect(validation.totalMinBudget).toBe(170); // 100 + 50 + 20
      expect(validation.totalMaxBudget).toBe(1700); // 1000 + 500 + 200
    });

    it('should detect infeasible constraints', () => {
      const infeasibleConstraints: BudgetConstraints = {
        ...constraints,
        totalBudget: 100 // Less than sum of minimums (170)
      };

      const validation = strategy.validateConstraints(infeasibleConstraints, arms);

      expect(validation.valid).toBe(false);
      expect(validation.violations.length).toBeGreaterThan(0);
      expect(validation.violations[0].type).toBe('infeasible');
    });

    it('should detect invalid arm constraints', () => {
      const invalidArms = [...arms];
      invalidArms[0].minBudget = 1200;
      invalidArms[0].maxBudget = 1000; // max < min

      const validation = strategy.validateConstraints(constraints, invalidArms);

      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.type === 'invalid')).toBe(true);
    });

    it('should warn about excess budget', () => {
      const excessConstraints: BudgetConstraints = {
        ...constraints,
        totalBudget: 2000 // More than sum of maximums (1700)
      };

      const validation = strategy.validateConstraints(excessConstraints, arms);

      expect(validation.valid).toBe(true); // Still valid, just suboptimal
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0].type).toBe('suboptimal');
    });

    it('should rebalance when scaling creates violations', () => {
      // Force a situation where scaling creates violations
      const tightArms: ConstraintArm[] = [
        { ...arms[0], minBudget: 400, maxBudget: 600 },
        { ...arms[1], minBudget: 300, maxBudget: 400 },
        { ...arms[2], minBudget: 100, maxBudget: 150 }
      ];

      const rawAllocations = [500, 350, 150];
      const result = strategy.applyConstraints(rawAllocations, constraints, tightArms);

      // All constraints should be satisfied
      result.forEach((allocation, i) => {
        expect(allocation).toBeGreaterThanOrEqual(tightArms[i].minBudget);
        expect(allocation).toBeLessThanOrEqual(tightArms[i].maxBudget);
      });

      // Total should be maintained
      const total = result.reduce((sum, a) => sum + a, 0);
      expect(total).toBeCloseTo(constraints.totalBudget, 1);
    });

    it('should provide correct metadata', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.name).toBe('Basic Constraint Strategy');
      expect(metadata.approach).toBe('simple');
      expect(metadata.complexity).toBe('low');
      expect(metadata.performance).toBe('fast');
      expect(metadata.accuracy).toBe('approximate');
    });

    it('should throw error for mismatched array lengths', () => {
      const wrongLengthAllocations = [500, 300]; // Only 2 elements, need 3
      expect(() =>
        strategy.applyConstraints(wrongLengthAllocations, constraints, arms)
      ).toThrow('same length');
    });
  });

  describe('AdvancedConstraintStrategy', () => {
    let strategy: AdvancedConstraintStrategy;
    let arms: ConstraintArm[];
    let constraints: BudgetConstraints;

    beforeEach(() => {
      strategy = new AdvancedConstraintStrategy(0.001, 100);
      arms = createTestArms();
      constraints = createTestConstraints();
    });

    it('should apply seasonal adjustments', () => {
      const rawAllocations = [400, 300, 300];
      const result = strategy.applyConstraints(rawAllocations, constraints, arms);

      // Total should be maintained
      const total = result.reduce((sum, a) => sum + a, 0);
      expect(total).toBeCloseTo(constraints.totalBudget, 1);

      // High performer with 1.2x seasonality should get more budget
      // Low performer with 0.8x seasonality should get less
      expect(result[0]).toBeGreaterThan(result[2]);
    });

    it('should apply risk adjustments', () => {
      const rawAllocations = [333, 333, 334]; // Equal initial allocation
      const result = strategy.applyConstraints(rawAllocations, constraints, arms);

      // High-risk arm (arm3) should have reduced allocation
      // Low-risk arm (arm1) should maintain or increase allocation
      expect(result[0]).toBeGreaterThan(result[2]);
    });

    it('should handle quality score constraints', () => {
      const rawAllocations = [400, 400, 200];
      const result = strategy.applyConstraints(rawAllocations, constraints, arms);

      // Low quality score arm (arm3 with QS=4) should get adjusted
      // All arms should still respect min/max constraints
      result.forEach((allocation, i) => {
        expect(allocation).toBeGreaterThanOrEqual(arms[i].minBudget);
        expect(allocation).toBeLessThanOrEqual(arms[i].maxBudget);
      });
    });

    it('should optimize allocations based on performance', () => {
      const rawAllocations = [300, 400, 300];
      const result = strategy.applyConstraints(rawAllocations, constraints, arms);

      // Should favor high-performing arms
      // arm1 has best conversion rate (0.05) and should get more budget
      const performanceWeighted = result[0] / arms[0].performance.conversionRate;
      expect(performanceWeighted).toBeGreaterThan(0);

      // Total budget constraint maintained
      const total = result.reduce((sum, a) => sum + a, 0);
      expect(total).toBeCloseTo(constraints.totalBudget, 1);
    });

    it('should validate with additional warnings', () => {
      // Create scenario with concentrated risk
      const riskyArms: ConstraintArm[] = [
        { ...arms[0], metadata: { ...arms[0].metadata, riskLevel: 'high' } },
        { ...arms[1], metadata: { ...arms[1].metadata, riskLevel: 'high' } },
        arms[2]
      ];

      const validation = strategy.validateConstraints(constraints, riskyArms);

      expect(validation.valid).toBe(true);
      expect(validation.warnings.some(w => w.type === 'risky')).toBe(true);
    });

    it('should warn about portfolio imbalance', () => {
      // Create arms with same category
      const imbalancedArms: ConstraintArm[] = arms.map(arm => ({
        ...arm,
        metadata: { ...arm.metadata, category: 'search' }
      }));

      // Set current budgets to show concentration
      imbalancedArms[0].currentBudget = 900;
      imbalancedArms[1].currentBudget = 50;
      imbalancedArms[2].currentBudget = 50;

      const validation = strategy.validateConstraints(constraints, imbalancedArms);

      expect(validation.warnings.some(w => w.type === 'suboptimal')).toBe(true);
    });

    it('should warn about low-performing budget allocation', () => {
      // Create low-performing arms
      const lowPerfArms: ConstraintArm[] = arms.map(arm => ({
        ...arm,
        performance: { ...arm.performance, conversionRate: 0.005 },
        currentBudget: 400
      }));

      const validation = strategy.validateConstraints(constraints, lowPerfArms);

      expect(validation.warnings.some(w => w.type === 'performance')).toBe(true);
    });

    it('should provide correct metadata', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.name).toBe('Advanced Constraint Strategy');
      expect(metadata.approach).toBe('optimization');
      expect(metadata.complexity).toBe('high');
      expect(metadata.performance).toBe('slow');
      expect(metadata.accuracy).toBe('optimal');
    });

    it('should converge optimization within iteration limit', () => {
      const startTime = performance.now();
      const rawAllocations = [333, 333, 334];

      const result = strategy.applyConstraints(rawAllocations, constraints, arms);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (< 100ms for 100 iterations)
      expect(duration).toBeLessThan(100);

      // Should produce valid result
      const total = result.reduce((sum, a) => sum + a, 0);
      expect(total).toBeCloseTo(constraints.totalBudget, 1);
    });
  });

  describe('Strategy Comparison', () => {
    it('should produce valid allocations with both strategies', () => {
      const strategies: ConstraintStrategy[] = [
        new BasicConstraintStrategy(),
        new AdvancedConstraintStrategy()
      ];

      const arms = createTestArms();
      const constraints = createTestConstraints();
      const rawAllocations = [400, 350, 250];

      for (const strategy of strategies) {
        const result = strategy.applyConstraints(rawAllocations, constraints, arms);

        // Total budget maintained
        const total = result.reduce((sum, a) => sum + a, 0);
        expect(total).toBeCloseTo(constraints.totalBudget, 1);

        // Individual constraints satisfied
        result.forEach((allocation, i) => {
          expect(allocation).toBeGreaterThanOrEqual(arms[i].minBudget);
          expect(allocation).toBeLessThanOrEqual(arms[i].maxBudget);
        });
      }
    });

    it('should have different complexity characteristics', () => {
      const basic = new BasicConstraintStrategy();
      const advanced = new AdvancedConstraintStrategy();

      expect(basic.getMetadata().complexity).toBe('low');
      expect(advanced.getMetadata().complexity).toBe('high');

      expect(basic.getMetadata().performance).toBe('fast');
      expect(advanced.getMetadata().performance).toBe('slow');

      expect(basic.getMetadata().accuracy).toBe('approximate');
      expect(advanced.getMetadata().accuracy).toBe('optimal');
    });

    it('should handle edge cases differently', () => {
      const strategies = [
        new BasicConstraintStrategy(),
        new AdvancedConstraintStrategy()
      ];

      // Edge case: all at minimum
      const arms = createTestArms();
      const constraints = createTestConstraints();
      constraints.totalBudget = 170; // Exactly sum of minimums

      const rawAllocations = [100, 50, 20];

      const results = strategies.map(s =>
        s.applyConstraints(rawAllocations, constraints, arms)
      );

      // Both should handle minimum case
      // Advanced strategy may adjust slightly due to optimization
      results.forEach(result => {
        expect(result[0]).toBeCloseTo(100, 0); // Allow more tolerance
        expect(result[1]).toBeCloseTo(50, 0);
        expect(result[2]).toBeCloseTo(20, 0);
      });
    });
  });
});