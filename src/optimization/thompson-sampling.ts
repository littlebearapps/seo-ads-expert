/**
 * Thompson Sampling Budget Optimizer
 *
 * Implements multi-armed bandit optimization using Thompson Sampling with:
 * - Beta-Binomial distribution for conversion rate modeling
 * - Gamma distribution for conversion value modeling
 * - Multi-objective optimization with constraints
 */

import { random } from '../test-utils/seeded-random.js';

export interface Arm {
  id: string;
  name: string;
  type: 'campaign' | 'adgroup' | 'creative';
  metrics30d: {
    spend: number;
    clicks: number;
    conversions: number;
    revenue: number;
    impressions: number;
    qualityScore?: number;
  };
  currentDailyBudget?: number;
  minBudget?: number;
  maxBudget?: number;
}

export interface BudgetConstraints {
  minDailyBudget: number;
  maxDailyBudget: number;
  campaignLimits?: Map<string, number>;
  riskTolerance: number; // 0-1, higher = more exploration
  maxChangePercent?: number; // Max % change per optimization (default 25%)
  daily_cap_AUD?: number;
  daily_cap_USD?: number;
  daily_cap_GBP?: number;
  min_per_campaign?: number;
  explorationFloor?: number; // Minimum exploration rate (default 0.1)
}

export interface AllocationResult {
  armId: string;
  armName: string;
  currentDailyBudget: number;
  proposedDailyBudget: number;
  expectedImprovement: number;
  confidenceInterval: [number, number];
  reasoning: string;
  thompsonScore: number;
  explorationBonus: number;
}

export interface BayesianPosterior {
  cvr_alpha: number;
  cvr_beta: number;
  value_alpha: number;
  value_beta: number;
}

export class ThompsonSamplingOptimizer {
  private readonly DEFAULT_EXPLORATION_FLOOR = 0.1;
  private readonly DEFAULT_MAX_CHANGE_PCT = 25;

  constructor() {}

  /**
   * Reset the optimizer state (for deterministic testing)
   */
  reset(): void {
    // ThompsonSamplingOptimizer is stateless, so no internal state to reset
    // This method exists for test compatibility
  }

  /**
   * Allocate budget using Thompson Sampling
   */
  allocateBudget(
    arms: Arm[],
    totalBudget: number,
    constraints: BudgetConstraints
  ): AllocationResult[] {
    const allocations: AllocationResult[] = [];
    const explorationFloor = constraints.explorationFloor ?? this.DEFAULT_EXPLORATION_FLOOR;

    // Apply currency caps before allocation to ensure proper proportions
    const effectiveBudget = this.applyCurrencyCaps(totalBudget, constraints);

    // Track total sampled scores for normalization
    const sampledScores: Map<string, number> = new Map();
    const explorationBonuses: Map<string, number> = new Map();
    let totalScore = 0;

    // Phase 1: Sample from posterior distributions
    for (const arm of arms) {
      const posterior = this.bayesianUpdate(arm);

      // Sample conversion rate from Beta distribution
      const sampledCVR = this.sampleBeta(posterior.cvr_alpha, posterior.cvr_beta);

      // Sample average conversion value from Gamma distribution
      const sampledValue = this.sampleGamma(posterior.value_alpha, posterior.value_beta);

      // Calculate expected revenue per click
      const avgCPC = arm.metrics30d.spend / Math.max(arm.metrics30d.clicks, 1);
      const expectedRevenuePerClick = sampledCVR * sampledValue;
      const expectedROAS = expectedRevenuePerClick / Math.max(avgCPC, 0.01);

      // Apply exploration bonus based on uncertainty
      const explorationBonus = this.calculateExplorationBonus(
        arm,
        constraints.riskTolerance,
        explorationFloor
      );

      // Thompson score combines expected value with exploration
      const thompsonScore = expectedROAS * (1 + explorationBonus);

      sampledScores.set(arm.id, thompsonScore);
      explorationBonuses.set(arm.id, explorationBonus);
      totalScore += thompsonScore;
    }

    // Phase 2: Allocate budget proportionally with constraints
    for (const arm of arms) {
      const thompsonScore = sampledScores.get(arm.id) || 0;
      const scoreRatio = thompsonScore / Math.max(totalScore, 0.001);

      // Calculate base allocation
      let proposedBudget = effectiveBudget * scoreRatio;

      // Apply constraints
      proposedBudget = this.applyConstraints(
        proposedBudget,
        arm,
        constraints
      );

      // Calculate expected improvement
      const currentBudget = arm.currentDailyBudget || 0;
      const expectedImprovement = this.calculateExpectedImprovement(
        arm,
        currentBudget,
        proposedBudget
      );

      // Generate reasoning
      const reasoning = this.generateReasoning(
        arm,
        thompsonScore,
        scoreRatio,
        currentBudget,
        proposedBudget
      );

      allocations.push({
        armId: arm.id,
        armName: arm.name,
        currentDailyBudget: currentBudget,
        proposedDailyBudget: proposedBudget,
        expectedImprovement,
        confidenceInterval: this.calculateConfidenceInterval(arm, proposedBudget),
        reasoning,
        thompsonScore,
        explorationBonus: explorationBonuses.get(arm.id) || 0
      });
    }

    return this.normalizeAllocations(allocations, effectiveBudget, constraints);
  }

  /**
   * Apply currency-specific caps to total budget
   */
  private applyCurrencyCaps(
    totalBudget: number,
    constraints: BudgetConstraints
  ): number {
    let cappedBudget = totalBudget;

    // Check each currency cap and apply the most restrictive one
    if (constraints.daily_cap_AUD !== undefined) {
      cappedBudget = Math.min(cappedBudget, constraints.daily_cap_AUD);
    }

    if (constraints.daily_cap_USD !== undefined) {
      cappedBudget = Math.min(cappedBudget, constraints.daily_cap_USD);
    }

    if (constraints.daily_cap_GBP !== undefined) {
      cappedBudget = Math.min(cappedBudget, constraints.daily_cap_GBP);
    }

    return cappedBudget;
  }

  /**
   * Bayesian posterior update for arm statistics
   */
  protected bayesianUpdate(arm: Arm): BayesianPosterior {
    // Prior parameters for conversion rate (Beta-Binomial)
    const cvr_priorAlpha = 1; // Uniform prior
    const cvr_priorBeta = 1;

    // Prior parameters for conversion value (Gamma)
    const value_priorAlpha = 1; // Exponential prior
    const value_priorBeta = 1;

    // Posterior update for conversion rate
    const cvr_alpha = cvr_priorAlpha + arm.metrics30d.conversions;
    const cvr_beta = cvr_priorBeta + arm.metrics30d.clicks - arm.metrics30d.conversions;

    // Posterior update for conversion value (shape, rate parameterization)
    const value_alpha = value_priorAlpha + arm.metrics30d.conversions;
    const value_beta = value_priorBeta + arm.metrics30d.revenue;

    return { cvr_alpha, cvr_beta, value_alpha, value_beta };
  }

  /**
   * Sample from Beta distribution using acceptance-rejection method
   */
  protected sampleBeta(alpha: number, beta: number): number {
    // For numerical stability, use gamma sampling
    const gamma1 = this.sampleGamma(alpha, 1);
    const gamma2 = this.sampleGamma(beta, 1);
    return gamma1 / (gamma1 + gamma2);
  }

  /**
   * Sample from Gamma distribution using Marsaglia and Tsang's method
   */
  protected sampleGamma(shape: number, rate: number): number {
    if (shape < 1) {
      // Handle shape < 1 using the method from Kundu and Gupta
      const u = random();
      return this.sampleGamma(1 + shape, rate) * Math.pow(u, 1 / shape);
    }

    // Marsaglia and Tsang's method for shape >= 1
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      const x = this.sampleNormal();
      const v = Math.pow(1 + c * x, 3);

      if (v <= 0) continue;

      const u = random();
      const xSquared = x * x;

      if (u < 1 - 0.0331 * xSquared * xSquared) {
        return d * v / rate;
      }

      if (Math.log(u) < 0.5 * xSquared + d * (1 - v + Math.log(v))) {
        return d * v / rate;
      }
    }
  }

  /**
   * Sample from standard normal distribution using Box-Muller transform
   */
  private sampleNormal(): number {
    const u1 = random();
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Calculate exploration bonus based on uncertainty and risk tolerance
   */
  private calculateExplorationBonus(
    arm: Arm,
    riskTolerance: number,
    explorationFloor: number
  ): number {
    // Calculate uncertainty based on sample size
    const sampleSize = arm.metrics30d.clicks || 1;
    const uncertaintyFactor = 1 / Math.sqrt(sampleSize);

    // For higher risk tolerance, we want more balanced allocation
    // This means less extreme exploration bonuses
    // Use inverse relationship: high risk tolerance = lower variance in bonuses
    const explorationBonus = uncertaintyFactor * (1 - riskTolerance * 0.5);

    // Ensure minimum exploration
    return Math.max(explorationBonus, explorationFloor);
  }

  /**
   * Apply budget constraints to proposed allocation
   */
  protected applyConstraints(
    proposedBudget: number,
    arm: Arm,
    constraints: BudgetConstraints
  ): number {
    let budget = proposedBudget;

    // Apply min/max campaign limits
    const minCampaign = constraints.min_per_campaign ?? constraints.minDailyBudget;
    const maxCampaign = arm.maxBudget ?? constraints.maxDailyBudget;

    budget = Math.max(budget, minCampaign);
    budget = Math.min(budget, maxCampaign);

    // Apply campaign-specific limits if defined
    if (constraints.campaignLimits?.has(arm.id)) {
      budget = Math.min(budget, constraints.campaignLimits.get(arm.id)!);
    }

    // Apply max change percent constraint
    if (arm.currentDailyBudget && arm.currentDailyBudget > 0) {
      const maxChangePct = constraints.maxChangePercent ?? this.DEFAULT_MAX_CHANGE_PCT;
      const maxIncrease = arm.currentDailyBudget * (1 + maxChangePct / 100);
      const maxDecrease = arm.currentDailyBudget * (1 - maxChangePct / 100);

      budget = Math.min(budget, maxIncrease);
      budget = Math.max(budget, maxDecrease);
    }

    return Math.round(budget * 100) / 100; // Round to cents
  }

  /**
   * Calculate expected improvement from budget change
   */
  protected calculateExpectedImprovement(
    arm: Arm,
    currentBudget: number,
    proposedBudget: number
  ): number {
    if (currentBudget === 0) return 1.0;

    const budgetRatio = proposedBudget / currentBudget;
    const cvr = arm.metrics30d.conversions / Math.max(arm.metrics30d.clicks, 1);
    const avgValue = arm.metrics30d.revenue / Math.max(arm.metrics30d.conversions, 1);

    // Assume sqrt relationship between budget and volume
    const volumeMultiplier = Math.sqrt(budgetRatio);

    // Expected improvement in conversion value
    const expectedImprovement = (volumeMultiplier - 1) * cvr * avgValue;

    return Math.max(0, expectedImprovement);
  }

  /**
   * Calculate confidence interval for allocation
   */
  private calculateConfidenceInterval(
    arm: Arm,
    proposedBudget: number
  ): [number, number] {
    const posterior = this.bayesianUpdate(arm);

    // Calculate 95% confidence interval using Beta quantiles
    const lowerCVR = this.betaQuantile(posterior.cvr_alpha, posterior.cvr_beta, 0.025);
    const upperCVR = this.betaQuantile(posterior.cvr_alpha, posterior.cvr_beta, 0.975);

    const avgCPC = arm.metrics30d.spend / Math.max(arm.metrics30d.clicks, 1);
    const expectedClicks = proposedBudget / Math.max(avgCPC, 0.01);

    const lowerConversions = expectedClicks * lowerCVR;
    const upperConversions = expectedClicks * upperCVR;

    return [
      Math.round(lowerConversions * 10) / 10,
      Math.round(upperConversions * 10) / 10
    ];
  }

  /**
   * Beta distribution quantile function (approximation)
   */
  private betaQuantile(alpha: number, beta: number, p: number): number {
    // Simple approximation using normal distribution for large samples
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) * (alpha + beta) * (alpha + beta + 1));
    const stdDev = Math.sqrt(variance);

    // Z-score for the given percentile
    const z = this.normalQuantile(p);

    const result = mean + z * stdDev;
    return Math.max(0, Math.min(1, result));
  }

  /**
   * Normal distribution quantile function (approximation)
   */
  private normalQuantile(p: number): number {
    // Approximation of the inverse normal CDF
    const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
    const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
    const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
               0.0276438810333863, 0.0038405729373609, 0.0003951896511919,
               0.0000321767881768, 0.0000002888167364, 0.0000003960315187];

    const y = p - 0.5;

    if (Math.abs(y) < 0.42) {
      const z = y * y;
      return y * (((a[3] * z + a[2]) * z + a[1]) * z + a[0]) /
                 ((((b[3] * z + b[2]) * z + b[1]) * z + b[0]) * z + 1);
    } else {
      let z = y > 0 ? Math.log(-Math.log(1 - p)) : Math.log(-Math.log(p));
      let x = c[0];
      for (let i = 1; i < 9; i++) {
        x = x * z + c[i];
      }
      return y > 0 ? x : -x;
    }
  }

  /**
   * Generate human-readable reasoning for allocation
   */
  protected generateReasoning(
    arm: Arm,
    thompsonScore: number,
    scoreRatio: number,
    currentBudget: number,
    proposedBudget: number
  ): string {
    const changePct = currentBudget > 0
      ? ((proposedBudget - currentBudget) / currentBudget * 100).toFixed(1)
      : 'N/A';

    const cvr = (arm.metrics30d.conversions / Math.max(arm.metrics30d.clicks, 1) * 100).toFixed(2);
    const cpc = (arm.metrics30d.spend / Math.max(arm.metrics30d.clicks, 1)).toFixed(2);

    let reason = `Thompson score: ${thompsonScore.toFixed(3)} (${(scoreRatio * 100).toFixed(1)}% of total). `;
    reason += `CVR: ${cvr}%, CPC: $${cpc}. `;

    if (currentBudget > 0) {
      if (proposedBudget > currentBudget) {
        reason += `Increasing budget by ${changePct}% based on strong performance.`;
      } else if (proposedBudget < currentBudget) {
        reason += `Decreasing budget by ${Math.abs(parseFloat(changePct))}% to optimize allocation.`;
      } else {
        reason += `Maintaining current budget level.`;
      }
    } else {
      reason += `New allocation of $${proposedBudget.toFixed(2)} daily.`;
    }

    return reason;
  }

  /**
   * Normalize allocations to ensure they sum to total budget while respecting constraints
   */
  protected normalizeAllocations(
    allocations: AllocationResult[],
    totalBudget: number,
    constraints: BudgetConstraints
  ): AllocationResult[] {
    // Calculate current sum
    const currentSum = allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0);

    if (Math.abs(currentSum - totalBudget) < 0.01) {
      return allocations; // Already normalized
    }

    // If we're over budget, we must reduce allocations
    if (currentSum > totalBudget) {
      const overageRatio = totalBudget / currentSum;

      // Scale down all allocations proportionally
      for (const allocation of allocations) {
        let newBudget = allocation.proposedDailyBudget * overageRatio;

        // Ensure we still respect minimum budget constraints
        const minBudget = constraints.min_per_campaign ?? constraints.minDailyBudget;
        newBudget = Math.max(newBudget, minBudget);

        allocation.proposedDailyBudget = Math.round(newBudget * 100) / 100;
      }

      // Recalculate sum after applying minimums
      const newSum = allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0);

      // If we're still over budget after applying minimums, we need to be more aggressive
      if (newSum > totalBudget) {
        // Sort by proposed budget descending to reduce larger budgets first
        const sortedAllocations = [...allocations].sort((a, b) =>
          b.proposedDailyBudget - a.proposedDailyBudget
        );

        let remainingReduction = newSum - totalBudget;

        for (const allocation of sortedAllocations) {
          if (remainingReduction <= 0) break;

          const minBudget = constraints.min_per_campaign ?? constraints.minDailyBudget;
          const maxReduction = allocation.proposedDailyBudget - minBudget;

          if (maxReduction > 0) {
            const reduction = Math.min(maxReduction, remainingReduction);
            allocation.proposedDailyBudget -= reduction;
            allocation.proposedDailyBudget = Math.round(allocation.proposedDailyBudget * 100) / 100;
            remainingReduction -= reduction;
          }
        }
      }

      return allocations;
    }

    // If we're under budget, try to distribute extra budget
    const diff = totalBudget - currentSum;

    // Find campaigns that can accept budget increases
    const adjustableCampaigns = allocations.filter(allocation => {
      const currentBudget = allocation.currentDailyBudget || 0;

      if (currentBudget === 0) return true; // New campaigns are fully adjustable

      const maxChangePct = constraints.maxChangePercent ?? this.DEFAULT_MAX_CHANGE_PCT;
      const maxIncrease = currentBudget * (1 + maxChangePct / 100);

      return allocation.proposedDailyBudget < maxIncrease;
    });

    if (adjustableCampaigns.length === 0) {
      // No campaigns can be adjusted, return as-is
      return allocations;
    }

    // Distribute the difference among adjustable campaigns
    const adjustmentPerCampaign = diff / adjustableCampaigns.length;

    for (const allocation of adjustableCampaigns) {
      const currentBudget = allocation.currentDailyBudget || 0;
      let newBudget = allocation.proposedDailyBudget + adjustmentPerCampaign;

      // Reapply constraints after adjustment
      if (currentBudget > 0) {
        const maxChangePct = constraints.maxChangePercent ?? this.DEFAULT_MAX_CHANGE_PCT;
        const maxIncrease = currentBudget * (1 + maxChangePct / 100);
        newBudget = Math.min(newBudget, maxIncrease);
      }

      // Apply max constraint
      const maxBudget = constraints.maxDailyBudget;
      newBudget = Math.min(newBudget, maxBudget);

      allocation.proposedDailyBudget = Math.round(newBudget * 100) / 100;
    }

    return allocations;
  }

  /**
   * Update posterior distributions based on observed results
   * Used for online learning and adaptation
   */
  updatePosteriorFromResults(
    armId: string,
    clicks: number,
    conversions: number,
    revenue: number
  ): void {
    // This is a placeholder for online learning
    // In a real implementation, this would update the arm's stored statistics
    // For testing purposes, we just validate the inputs
    if (!armId) {
      throw new Error('Arm ID is required for posterior update');
    }
    if (clicks < 0 || conversions < 0 || revenue < 0) {
      throw new Error('Results must be non-negative');
    }
    if (conversions > clicks) {
      throw new Error('Conversions cannot exceed clicks');
    }

    // In production, this would update the arm's alpha/beta parameters
    // For now, we log the update for testing
    console.log(`Updated posterior for ${armId}: clicks=${clicks}, conversions=${conversions}, revenue=${revenue}`);
  }

  /**
   * Calculate multi-objective optimization score
   */
  calculateMultiObjectiveScore(
    arm: Arm,
    objectives: {
      targetCPA?: number;
      targetROAS?: number;
      maximizeConversions?: boolean;
      maximizeRevenue?: boolean;
    }
  ): number {
    let score = 0;
    let weightSum = 0;

    const cpa = arm.metrics30d.spend / Math.max(arm.metrics30d.conversions, 1);
    const roas = arm.metrics30d.revenue / Math.max(arm.metrics30d.spend, 1);

    if (objectives.targetCPA !== undefined) {
      const cpaScore = Math.exp(-Math.abs(cpa - objectives.targetCPA) / objectives.targetCPA);
      score += cpaScore * 0.3;
      weightSum += 0.3;
    }

    if (objectives.targetROAS !== undefined) {
      const roasScore = Math.exp(-Math.abs(roas - objectives.targetROAS) / objectives.targetROAS);
      score += roasScore * 0.3;
      weightSum += 0.3;
    }

    if (objectives.maximizeConversions) {
      const conversionScore = arm.metrics30d.conversions / Math.max(arm.metrics30d.spend, 1);
      score += conversionScore * 0.2;
      weightSum += 0.2;
    }

    if (objectives.maximizeRevenue) {
      const revenueScore = arm.metrics30d.revenue / Math.max(arm.metrics30d.spend, 1);
      score += revenueScore * 0.2;
      weightSum += 0.2;
    }

    return weightSum > 0 ? score / weightSum : 0;
  }
}