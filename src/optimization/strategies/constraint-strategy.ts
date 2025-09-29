/**
 * Constraint Strategy Interface
 * Provides different constraint application implementations for budget allocation
 */

import { BudgetConstraints } from '../types.js';

/**
 * Interface for different constraint application strategies
 */
export interface ConstraintStrategy {
  /**
   * Apply constraints to raw budget allocations
   */
  applyConstraints(
    rawAllocations: number[],
    constraints: BudgetConstraints,
    arms: ConstraintArm[]
  ): number[];

  /**
   * Validate constraints are feasible before application
   */
  validateConstraints(constraints: BudgetConstraints, arms: ConstraintArm[]): ConstraintValidationResult;

  /**
   * Get strategy metadata for logging and debugging
   */
  getMetadata(): ConstraintStrategyMetadata;
}

/**
 * Arm data needed for constraint application
 */
export interface ConstraintArm {
  id: string;
  name: string;
  minBudget: number;
  maxBudget: number;
  currentBudget: number;
  performance: {
    conversionRate: number;
    averageValue: number;
    costPerClick: number;
    qualityScore: number;
  };
  metadata?: {
    category?: string;
    priority?: number;
    seasonality?: number;
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

/**
 * Result of constraint validation
 */
export interface ConstraintValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
  warnings: ConstraintWarning[];
  totalMinBudget: number;
  totalMaxBudget: number;
}

/**
 * Constraint violation details
 */
export interface ConstraintViolation {
  type: 'infeasible' | 'conflicting' | 'invalid';
  message: string;
  armIds?: string[];
  suggestedFix?: string;
}

/**
 * Constraint warning details
 */
export interface ConstraintWarning {
  type: 'suboptimal' | 'risky' | 'performance';
  message: string;
  armIds?: string[];
  impact: 'low' | 'medium' | 'high';
}

/**
 * Metadata for constraint strategy
 */
export interface ConstraintStrategyMetadata {
  name: string;
  description: string;
  approach: 'simple' | 'optimization' | 'heuristic' | 'ml-based';
  complexity: 'low' | 'medium' | 'high';
  performance: 'fast' | 'medium' | 'slow';
  accuracy: 'approximate' | 'good' | 'optimal';
}

/**
 * Basic Constraint Strategy
 * Simple min/max budget constraints with proportional adjustment
 */
export class BasicConstraintStrategy implements ConstraintStrategy {
  private readonly tolerance: number;

  constructor(tolerance: number = 0.01) {
    this.tolerance = tolerance;
  }

  applyConstraints(
    rawAllocations: number[],
    constraints: BudgetConstraints,
    arms: ConstraintArm[]
  ): number[] {
    if (rawAllocations.length !== arms.length) {
      throw new Error('Raw allocations and arms arrays must have same length');
    }

    let allocations = [...rawAllocations];
    // Use totalBudget from constraints if provided, otherwise use sum of allocations
    const totalBudget = (constraints as any).totalBudget ?? allocations.reduce((sum, a) => sum + a, 0);

    // Step 1: Apply individual min/max constraints
    for (let i = 0; i < allocations.length; i++) {
      const arm = arms[i];
      allocations[i] = Math.max(arm.minBudget, Math.min(arm.maxBudget, allocations[i]));
    }

    // Step 2: Rebalance to maintain total budget after constraints
    allocations = this.rebalanceToTotal(allocations, arms, totalBudget);

    return allocations;
  }

  validateConstraints(constraints: BudgetConstraints, arms: ConstraintArm[]): ConstraintValidationResult {
    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintWarning[] = [];

    let totalMinBudget = 0;
    let totalMaxBudget = 0;

    // Check individual arm constraints
    for (const arm of arms) {
      if (arm.minBudget < 0) {
        violations.push({
          type: 'invalid',
          message: `Arm ${arm.name} has negative minimum budget: ${arm.minBudget}`,
          armIds: [arm.id],
          suggestedFix: 'Set minimum budget to 0 or positive value'
        });
      }

      if (arm.maxBudget < arm.minBudget) {
        violations.push({
          type: 'invalid',
          message: `Arm ${arm.name} has max budget (${arm.maxBudget}) less than min budget (${arm.minBudget})`,
          armIds: [arm.id],
          suggestedFix: 'Increase max budget or decrease min budget'
        });
      }

      totalMinBudget += Math.max(0, arm.minBudget);
      totalMaxBudget += arm.maxBudget;
    }

    // Check if global minBudget constraint makes problem infeasible
    if (constraints.minDailyBudget && arms.length > 0) {
      const globalMinRequired = constraints.minDailyBudget * arms.length;
      const budget = (constraints as any).totalBudget || constraints.maxDailyBudget || Infinity;
      if (globalMinRequired > budget) {
        violations.push({
          type: 'infeasible',
          message: `Global minimum budget per campaign (${constraints.minDailyBudget}) × ${arms.length} campaigns = ${globalMinRequired}, which exceeds available budget`,
          suggestedFix: `Reduce minimum budget per campaign or increase total budget`
        });
      }
    }

    // Check total budget feasibility
    if (constraints.totalBudget < totalMinBudget) {
      violations.push({
        type: 'infeasible',
        message: `Total budget (${constraints.totalBudget}) is less than sum of minimum budgets (${totalMinBudget})`,
        suggestedFix: `Increase total budget to at least ${totalMinBudget} or reduce minimum budget constraints`
      });
    }

    if (constraints.totalBudget > totalMaxBudget) {
      warnings.push({
        type: 'suboptimal',
        message: `Total budget (${constraints.totalBudget}) exceeds sum of maximum budgets (${totalMaxBudget})`,
        impact: 'medium'
      });
    }

    // Check for risky configurations
    const highRiskArms = arms.filter(arm => arm.metadata?.riskLevel === 'high');
    if (highRiskArms.length > arms.length * 0.5) {
      warnings.push({
        type: 'risky',
        message: `Over 50% of arms are high risk (${highRiskArms.length}/${arms.length})`,
        armIds: highRiskArms.map(arm => arm.id),
        impact: 'high'
      });
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      totalMinBudget,
      totalMaxBudget
    };
  }

  getMetadata(): ConstraintStrategyMetadata {
    return {
      name: 'Basic Constraint Strategy',
      description: 'Simple min/max budget constraints with proportional adjustment',
      approach: 'simple',
      complexity: 'low',
      performance: 'fast',
      accuracy: 'approximate'
    };
  }

  private rebalanceToTotal(
    allocations: number[],
    arms: ConstraintArm[],
    targetTotal: number
  ): number[] {
    const currentTotal = allocations.reduce((sum, a) => sum + a, 0);

    // If already at target, return as-is
    if (Math.abs(currentTotal - targetTotal) <= this.tolerance) {
      return allocations;
    }

    // Try proportional scaling first
    if (currentTotal > 0) {
      const scaleFactor = targetTotal / currentTotal;
      const scaled = allocations.map((a, i) => {
        const scaledValue = a * scaleFactor;
        // Check if scaling violates constraints
        return Math.max(arms[i].minBudget, Math.min(arms[i].maxBudget, scaledValue));
      });

      const scaledTotal = scaled.reduce((sum, a) => sum + a, 0);

      // If scaling gets us close enough, use it
      if (Math.abs(scaledTotal - targetTotal) <= this.tolerance) {
        return scaled;
      }

      // Otherwise, use iterative rebalancing
      allocations = scaled;
    }

    // Iterative rebalancing
    return this.rebalanceViolations(allocations, arms, targetTotal);
  }

  private rebalanceViolations(
    allocations: number[],
    arms: ConstraintArm[],
    totalBudget: number
  ): number[] {
    const result = [...allocations];
    let excess = 0;
    let deficit = 0;

    // Identify violations and calculate excess/deficit
    for (let i = 0; i < result.length; i++) {
      const arm = arms[i];
      if (result[i] > arm.maxBudget) {
        excess += result[i] - arm.maxBudget;
        result[i] = arm.maxBudget;
      } else if (result[i] < arm.minBudget) {
        deficit += arm.minBudget - result[i];
        result[i] = arm.minBudget;
      }
    }

    // Redistribute excess to cover deficit
    if (excess > 0 && deficit > 0) {
      const redistributeAmount = Math.min(excess, deficit);
      this.redistributeBudget(result, arms, redistributeAmount, 'deficit');
    }

    // Ensure total budget is maintained
    const currentTotal = result.reduce((sum, a) => sum + a, 0);
    if (Math.abs(currentTotal - totalBudget) > this.tolerance) {
      const remaining = totalBudget - currentTotal;
      this.redistributeBudget(result, arms, remaining, remaining > 0 ? 'surplus' : 'deficit');
    }

    return result;
  }

  private redistributeBudget(
    allocations: number[],
    arms: ConstraintArm[],
    amount: number,
    direction: 'surplus' | 'deficit'
  ): void {
    // Find arms that can accept/give budget
    const flexibleArms = arms
      .map((arm, index) => ({ arm, index, allocation: allocations[index] }))
      .filter(({ arm, allocation }) => {
        if (direction === 'surplus') {
          return allocation < arm.maxBudget;
        } else {
          return allocation > arm.minBudget;
        }
      })
      .sort((a, b) => {
        // Prioritize by performance for surplus, by excess capacity for deficit
        if (direction === 'surplus') {
          return b.arm.performance.conversionRate - a.arm.performance.conversionRate;
        } else {
          return (a.allocation - a.arm.minBudget) - (b.allocation - b.arm.minBudget);
        }
      });

    let remaining = Math.abs(amount);

    for (const { arm, index } of flexibleArms) {
      if (remaining <= this.tolerance) break;

      let adjustment: number;
      if (direction === 'surplus') {
        adjustment = Math.min(remaining, arm.maxBudget - allocations[index]);
        allocations[index] += adjustment;
      } else {
        adjustment = Math.min(remaining, allocations[index] - arm.minBudget);
        allocations[index] -= adjustment;
      }

      remaining -= adjustment;
    }
  }
}

/**
 * Advanced Constraint Strategy
 * Complex business rules, seasonal adjustments, and optimization-based allocation
 */
export class AdvancedConstraintStrategy implements ConstraintStrategy {
  private readonly optimizationTolerance: number;
  private readonly maxIterations: number;

  constructor(optimizationTolerance: number = 0.001, maxIterations: number = 100) {
    this.optimizationTolerance = optimizationTolerance;
    this.maxIterations = maxIterations;
  }

  applyConstraints(
    rawAllocations: number[],
    constraints: BudgetConstraints,
    arms: ConstraintArm[]
  ): number[] {
    // Use totalBudget from constraints if provided
    const targetTotal = (constraints as any).totalBudget ?? rawAllocations.reduce((sum, a) => sum + a, 0);

    // Step 1: Apply seasonal adjustments
    const seasonallyAdjusted = this.applySeasonalAdjustments(rawAllocations, arms);

    // Step 2: Apply business rules
    const businessAdjusted = this.applyBusinessRules(seasonallyAdjusted, constraints, arms);

    // Step 3: Optimization-based constraint satisfaction
    const optimized = this.optimizeWithConstraints(businessAdjusted, constraints, arms);

    // Step 4: Ensure we meet the target total budget
    const currentTotal = optimized.reduce((sum, a) => sum + a, 0);
    if (Math.abs(currentTotal - targetTotal) > this.optimizationTolerance) {
      // Use BasicConstraintStrategy to rebalance to exact total
      const basicStrategy = new BasicConstraintStrategy(this.optimizationTolerance);
      return basicStrategy.applyConstraints(optimized, { ...constraints, totalBudget: targetTotal } as any, arms);
    }

    return optimized;
  }

  validateConstraints(constraints: BudgetConstraints, arms: ConstraintArm[]): ConstraintValidationResult {
    // Start with basic validation
    const basicStrategy = new BasicConstraintStrategy();
    const basicResult = basicStrategy.validateConstraints(constraints, arms);

    // Add advanced validations
    const additionalWarnings: ConstraintWarning[] = [];

    // Check for portfolio balance
    const categoryAllocations = new Map<string, number>();
    arms.forEach(arm => {
      const category = arm.metadata?.category || 'uncategorized';
      categoryAllocations.set(category, (categoryAllocations.get(category) || 0) + arm.currentBudget);
    });

    const totalCurrent = arms.reduce((sum, arm) => sum + arm.currentBudget, 0);

    // Check for budget concentration in any single category
    for (const [category, allocation] of categoryAllocations) {
      const percentage = allocation / totalCurrent;
      if (percentage > 0.8) {
        additionalWarnings.push({
          type: 'suboptimal',
          message: `Category '${category}' represents ${(percentage * 100).toFixed(1)}% of budget - consider diversification`,
          impact: 'medium'
        });
      }
    }

    // Also check for individual arm concentration
    arms.forEach(arm => {
      const percentage = arm.currentBudget / totalCurrent;
      if (percentage > 0.8) {
        additionalWarnings.push({
          type: 'suboptimal',
          message: `Arm '${arm.name}' represents ${(percentage * 100).toFixed(1)}% of budget - consider diversification`,
          armIds: [arm.id],
          impact: 'medium'
        });
      }
    });

    // Check for performance balance
    const lowPerformingArms = arms.filter(arm => arm.performance.conversionRate < 0.01);
    if (lowPerformingArms.length > 0) {
      const lowPerformingBudget = lowPerformingArms.reduce((sum, arm) => sum + arm.currentBudget, 0);
      const totalBudget = arms.reduce((sum, arm) => sum + arm.currentBudget, 0);

      if (lowPerformingBudget / totalBudget > 0.3) {
        additionalWarnings.push({
          type: 'performance',
          message: `${(lowPerformingBudget / totalBudget * 100).toFixed(1)}% of budget allocated to low-performing arms`,
          armIds: lowPerformingArms.map(arm => arm.id),
          impact: 'high'
        });
      }
    }

    return {
      ...basicResult,
      warnings: [...basicResult.warnings, ...additionalWarnings]
    };
  }

  getMetadata(): ConstraintStrategyMetadata {
    return {
      name: 'Advanced Constraint Strategy',
      description: 'Complex business rules, seasonal adjustments, and optimization-based allocation',
      approach: 'optimization',
      complexity: 'high',
      performance: 'slow',
      accuracy: 'optimal'
    };
  }

  private applySeasonalAdjustments(allocations: number[], arms: ConstraintArm[]): number[] {
    return allocations.map((allocation, index) => {
      const arm = arms[index];
      const seasonality = arm.metadata?.seasonality || 1.0;

      // Apply seasonal multiplier with bounds checking
      const adjusted = allocation * seasonality;

      // Ensure adjustment doesn't violate basic constraints
      return Math.max(arm.minBudget, Math.min(arm.maxBudget, adjusted));
    });
  }

  private applyBusinessRules(
    allocations: number[],
    constraints: BudgetConstraints,
    arms: ConstraintArm[]
  ): number[] {
    const result = [...allocations];

    // Rule 1: High-performing arms get priority
    const sortedByPerformance = arms
      .map((arm, index) => ({ arm, index, allocation: result[index] }))
      .sort((a, b) => b.arm.performance.conversionRate - a.arm.performance.conversionRate);

    // Rule 2: Risk adjustment - reduce allocation to high-risk arms
    for (let i = 0; i < result.length; i++) {
      const arm = arms[i];
      if (arm.metadata?.riskLevel === 'high') {
        const reduction = result[i] * 0.1; // 10% reduction for high risk
        result[i] = Math.max(arm.minBudget, result[i] - reduction);
      }
    }

    // Rule 3: Quality score threshold - minimum allocation for low QS
    for (let i = 0; i < result.length; i++) {
      const arm = arms[i];
      if (arm.performance.qualityScore < 3.0) {
        result[i] = Math.max(result[i], arm.minBudget * 1.5);
      }
    }

    // Rebalance to maintain total budget
    const currentTotal = result.reduce((sum, a) => sum + a, 0);
    const scaleFactor = constraints.totalBudget / currentTotal;

    if (Math.abs(scaleFactor - 1) > this.optimizationTolerance) {
      for (let i = 0; i < result.length; i++) {
        result[i] *= scaleFactor;
        result[i] = Math.max(arms[i].minBudget, Math.min(arms[i].maxBudget, result[i]));
      }
    }

    return result;
  }

  private optimizeWithConstraints(
    allocations: number[],
    constraints: BudgetConstraints,
    arms: ConstraintArm[]
  ): number[] {
    let current = [...allocations];
    let bestObjective = this.calculateObjective(current, arms);

    // Gradient-based optimization with constraint projection
    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const gradient = this.calculateGradient(current, arms);
      const stepSize = 0.01 / (1 + iteration * 0.01); // Adaptive step size

      // Gradient step
      const proposed = current.map((allocation, i) => allocation + stepSize * gradient[i]);

      // Project onto constraint set
      const projected = this.projectOntoConstraints(proposed, constraints, arms);

      // Check improvement
      const newObjective = this.calculateObjective(projected, arms);
      if (newObjective > bestObjective + this.optimizationTolerance) {
        current = projected;
        bestObjective = newObjective;
      } else if (iteration > 10) {
        break; // Early stopping if no improvement
      }
    }

    return current;
  }

  private calculateObjective(allocations: number[], arms: ConstraintArm[]): number {
    // Objective: maximize expected value considering risk
    let totalValue = 0;

    for (let i = 0; i < allocations.length; i++) {
      const arm = arms[i];
      const expectedConversions = allocations[i] / arm.performance.costPerClick * arm.performance.conversionRate;
      const expectedValue = expectedConversions * arm.performance.averageValue;

      // Risk adjustment
      const riskMultiplier = arm.metadata?.riskLevel === 'high' ? 0.8 :
                            arm.metadata?.riskLevel === 'medium' ? 0.9 : 1.0;

      totalValue += expectedValue * riskMultiplier;
    }

    return totalValue;
  }

  private calculateGradient(allocations: number[], arms: ConstraintArm[]): number[] {
    // Numerical gradient calculation
    const epsilon = 0.01;
    const gradient: number[] = [];

    for (let i = 0; i < allocations.length; i++) {
      const originalAllocation = allocations[i];

      // Forward difference
      allocations[i] = originalAllocation + epsilon;
      const forwardValue = this.calculateObjective(allocations, arms);

      allocations[i] = originalAllocation - epsilon;
      const backwardValue = this.calculateObjective(allocations, arms);

      allocations[i] = originalAllocation; // Restore

      gradient[i] = (forwardValue - backwardValue) / (2 * epsilon);
    }

    return gradient;
  }

  private projectOntoConstraints(
    allocations: number[],
    constraints: BudgetConstraints,
    arms: ConstraintArm[]
  ): number[] {
    // Project onto box constraints first
    const boxProjected = allocations.map((allocation, i) =>
      Math.max(arms[i].minBudget, Math.min(arms[i].maxBudget, allocation))
    );

    // Project onto budget constraint using proportional scaling
    const currentTotal = boxProjected.reduce((sum, a) => sum + a, 0);
    // Use totalBudget from constraints if provided, otherwise maintain current total
    const targetTotal = (constraints as any).totalBudget ?? currentTotal;

    if (Math.abs(currentTotal - targetTotal) < this.optimizationTolerance) {
      return boxProjected; // Already at target
    }

    const scaleFactor = targetTotal / currentTotal;
    const scaled = boxProjected.map(allocation => allocation * scaleFactor);

    // Final projection to ensure all constraints are satisfied
    const finalProjected = scaled.map((allocation, i) =>
      Math.max(arms[i].minBudget, Math.min(arms[i].maxBudget, allocation))
    );

    // If final projection violates budget, use iterative rebalancing
    const finalTotal = finalProjected.reduce((sum, a) => sum + a, 0);
    if (Math.abs(finalTotal - targetTotal) > this.optimizationTolerance) {
      // Use BasicConstraintStrategy's rebalancing logic
      const basicStrategy = new BasicConstraintStrategy(this.optimizationTolerance);
      return basicStrategy.applyConstraints(finalProjected, { ...constraints, totalBudget: targetTotal } as any, arms);
    }

    return finalProjected;
  }
}