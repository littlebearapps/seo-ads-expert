/**
 * Constrained Budget Allocator
 *
 * Implements multi-objective optimization with constraints for budget allocation.
 * Supports various objectives like CPA targets, ROAS goals, and risk management.
 */

import { Arm, BudgetConstraints } from './thompson-sampling.js';

export interface Campaign extends Arm {
  targetCPA?: number;
  targetROAS?: number;
  priority?: number;
  isPaused?: boolean;
  bidStrategy?: 'manual_cpc' | 'enhanced_cpc' | 'target_cpa' | 'target_roas' | 'maximize_clicks';
}

export interface OptimizationObjectives {
  primaryObjective: 'maximize_cws_clicks' | 'maximize_conversions' | 'maximize_revenue' | 'target_cpa' | 'target_roas';
  targetCPA?: number;
  targetROAS?: number;
  maximizeConversions?: boolean;
  maximizeRevenue?: boolean;
  balancedAllocation?: boolean; // Ensure minimum diversity
}

export interface OptimizationResult {
  allocations: Map<string, number>;
  expectedPerformance: {
    totalSpend: number;
    expectedConversions: number;
    expectedRevenue: number;
    expectedCPA: number;
    expectedROAS: number;
    riskScore: number;
  };
  violations: string[];
  feasible: boolean;
}

export class ConstrainedBudgetAllocator {
  private readonly EPSILON = 0.001; // Numerical tolerance

  constructor() {}

  /**
   * Optimize budget allocation with multiple objectives and constraints
   */
  optimize(
    campaigns: Campaign[],
    totalBudget: number,
    constraints: BudgetConstraints,
    objectives: OptimizationObjectives
  ): OptimizationResult {
    // Filter out paused campaigns
    const activeCampaigns = campaigns.filter(c => !c.isPaused);

    if (activeCampaigns.length === 0) {
      return this.createEmptyResult('No active campaigns');
    }

    // Calculate objective scores for each campaign
    const objectiveScores = this.calculateObjectiveScores(activeCampaigns, objectives);

    // Apply constraints and solve optimization
    const allocation = this.solveConstrainedOptimization(
      activeCampaigns,
      totalBudget,
      constraints,
      objectiveScores,
      objectives
    );

    // Calculate expected performance
    const expectedPerformance = this.calculateExpectedPerformance(
      activeCampaigns,
      allocation,
      constraints
    );

    // Check for constraint violations
    const violations = this.checkConstraintViolations(
      activeCampaigns,
      allocation,
      constraints,
      totalBudget
    );

    return {
      allocations: allocation,
      expectedPerformance,
      violations,
      feasible: violations.length === 0
    };
  }

  /**
   * Calculate objective scores for each campaign
   */
  private calculateObjectiveScores(
    campaigns: Campaign[],
    objectives: OptimizationObjectives
  ): Map<string, number> {
    const scores = new Map<string, number>();

    for (const campaign of campaigns) {
      let score = 0;

      // Calculate base performance metrics
      const cpa = campaign.metrics30d.spend / Math.max(campaign.metrics30d.conversions, 1);
      const roas = campaign.metrics30d.revenue / Math.max(campaign.metrics30d.spend, 1);
      const cvr = campaign.metrics30d.conversions / Math.max(campaign.metrics30d.clicks, 1);
      const avgCPC = campaign.metrics30d.spend / Math.max(campaign.metrics30d.clicks, 1);

      switch (objectives.primaryObjective) {
        case 'maximize_cws_clicks':
          // Prioritize campaigns with low CPC and high click volume
          score = (1 / Math.max(avgCPC, 0.01)) * Math.sqrt(campaign.metrics30d.clicks);
          break;

        case 'maximize_conversions':
          // Prioritize campaigns with high CVR
          score = cvr * 100;
          break;

        case 'maximize_revenue':
          // Prioritize campaigns with high ROAS
          score = roas;
          break;

        case 'target_cpa':
          // Score based on proximity to target CPA
          if (objectives.targetCPA) {
            const cpaDiff = Math.abs(cpa - objectives.targetCPA);
            score = Math.exp(-cpaDiff / objectives.targetCPA);
          }
          break;

        case 'target_roas':
          // Score based on proximity to target ROAS
          if (objectives.targetROAS) {
            const roasDiff = Math.abs(roas - objectives.targetROAS);
            score = Math.exp(-roasDiff / objectives.targetROAS);
          }
          break;
      }

      // Apply quality score weighting if available
      if (campaign.metrics30d.qualityScore) {
        score *= (campaign.metrics30d.qualityScore / 10);
      }

      // Apply priority weighting if set
      if (campaign.priority) {
        score *= campaign.priority;
      }

      scores.set(campaign.id, score);
    }

    return this.normalizeScores(scores);
  }

  /**
   * Normalize scores to sum to 1
   */
  private normalizeScores(scores: Map<string, number>): Map<string, number> {
    const total = Array.from(scores.values()).reduce((sum, s) => sum + s, 0);

    if (total === 0) {
      // Equal distribution if all scores are zero
      const equalScore = 1 / scores.size;
      scores.forEach((_, key) => scores.set(key, equalScore));
    } else {
      // Normalize to sum to 1
      scores.forEach((score, key) => scores.set(key, score / total));
    }

    return scores;
  }

  /**
   * Solve constrained optimization problem
   */
  private solveConstrainedOptimization(
    campaigns: Campaign[],
    totalBudget: number,
    constraints: BudgetConstraints,
    objectiveScores: Map<string, number>,
    objectives: OptimizationObjectives
  ): Map<string, number> {
    const allocation = new Map<string, number>();

    // Initial allocation based on objective scores
    let remainingBudget = totalBudget;

    // First pass: Allocate minimum budgets
    for (const campaign of campaigns) {
      const minBudget = campaign.minBudget ?? constraints.min_per_campaign ?? constraints.minDailyBudget;
      allocation.set(campaign.id, minBudget);
      remainingBudget -= minBudget;
    }

    if (remainingBudget <= 0) {
      // If minimum budgets exceed total, scale down proportionally
      return this.scaleDownToTotal(allocation, totalBudget, constraints);
    }

    // Second pass: Distribute remaining budget based on scores
    const totalScore = Array.from(objectiveScores.values()).reduce((sum, s) => sum + s, 0);

    for (const campaign of campaigns) {
      const score = objectiveScores.get(campaign.id) ?? 0;
      const scoreRatio = score / Math.max(totalScore, this.EPSILON);

      // Calculate additional budget based on score
      let additionalBudget = remainingBudget * scoreRatio;

      // Apply maximum constraints
      const currentAllocation = allocation.get(campaign.id) ?? 0;
      const maxBudget = campaign.maxBudget ?? constraints.maxDailyBudget;
      const maxAdditional = maxBudget - currentAllocation;

      additionalBudget = Math.min(additionalBudget, maxAdditional);

      // Apply max change constraint if campaign has current budget
      if (campaign.currentDailyBudget && campaign.currentDailyBudget > 0) {
        const maxChangePct = constraints.maxChangePercent ?? 25;
        const maxIncrease = campaign.currentDailyBudget * (1 + maxChangePct / 100) - currentAllocation;
        additionalBudget = Math.min(additionalBudget, maxIncrease);
      }

      allocation.set(campaign.id, currentAllocation + additionalBudget);
    }

    // Apply balanced allocation if requested
    if (objectives.balancedAllocation) {
      return this.applyBalancedAllocation(allocation, campaigns, constraints);
    }

    return this.finalizeAllocation(allocation, totalBudget);
  }

  /**
   * Scale down allocations to fit within total budget
   */
  private scaleDownToTotal(
    allocation: Map<string, number>,
    totalBudget: number,
    constraints: BudgetConstraints
  ): Map<string, number> {
    const currentTotal = Array.from(allocation.values()).reduce((sum, a) => sum + a, 0);
    const scale = totalBudget / currentTotal;

    allocation.forEach((budget, campaignId) => {
      const scaled = budget * scale;
      // Ensure minimum budget is still met if possible
      const minBudget = constraints.min_per_campaign ?? constraints.minDailyBudget;
      allocation.set(campaignId, Math.max(scaled, Math.min(minBudget, totalBudget / allocation.size)));
    });

    return allocation;
  }

  /**
   * Apply balanced allocation to ensure diversity
   */
  private applyBalancedAllocation(
    allocation: Map<string, number>,
    campaigns: Campaign[],
    constraints: BudgetConstraints
  ): Map<string, number> {
    // Calculate coefficient of variation
    const values = Array.from(allocation.values());
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const cv = Math.sqrt(variance) / mean;

    // If allocation is too concentrated (CV > 1), rebalance
    if (cv > 1) {
      const maxRatio = 3; // Maximum ratio between highest and lowest
      const minAllocation = Math.min(...values);
      const maxAllowed = minAllocation * maxRatio;

      allocation.forEach((budget, campaignId) => {
        if (budget > maxAllowed) {
          allocation.set(campaignId, maxAllowed);
        }
      });
    }

    return allocation;
  }

  /**
   * Finalize allocation ensuring it sums to total budget
   */
  private finalizeAllocation(
    allocation: Map<string, number>,
    totalBudget: number
  ): Map<string, number> {
    const currentTotal = Array.from(allocation.values()).reduce((sum, a) => sum + a, 0);
    const diff = totalBudget - currentTotal;

    if (Math.abs(diff) > this.EPSILON) {
      // Distribute difference proportionally
      const scale = totalBudget / currentTotal;
      allocation.forEach((budget, campaignId) => {
        allocation.set(campaignId, Math.round(budget * scale * 100) / 100);
      });
    }

    // Round to cents
    allocation.forEach((budget, campaignId) => {
      allocation.set(campaignId, Math.round(budget * 100) / 100);
    });

    return allocation;
  }

  /**
   * Calculate expected performance metrics
   */
  calculateExpectedPerformance(
    campaigns: Campaign[],
    allocation: Map<string, number>,
    constraints: BudgetConstraints
  ): {
    totalSpend: number;
    expectedConversions: number;
    expectedRevenue: number;
    expectedCPA: number;
    expectedROAS: number;
    riskScore: number;
  } {
    let totalSpend = 0;
    let expectedConversions = 0;
    let expectedRevenue = 0;
    let riskScore = 0;

    for (const campaign of campaigns) {
      const budget = allocation.get(campaign.id) ?? 0;
      totalSpend += budget;

      // Calculate expected metrics based on historical performance
      const avgCPC = campaign.metrics30d.spend / Math.max(campaign.metrics30d.clicks, 1);
      const cvr = campaign.metrics30d.conversions / Math.max(campaign.metrics30d.clicks, 1);
      const avgValue = campaign.metrics30d.revenue / Math.max(campaign.metrics30d.conversions, 1);

      const expectedClicks = budget / Math.max(avgCPC, 0.01);
      const campaignConversions = expectedClicks * cvr;
      const campaignRevenue = campaignConversions * avgValue;

      expectedConversions += campaignConversions;
      expectedRevenue += campaignRevenue;

      // Calculate risk based on variance and sample size
      const sampleSize = campaign.metrics30d.clicks;
      const uncertaintyFactor = 1 / Math.sqrt(Math.max(sampleSize, 1));
      riskScore += uncertaintyFactor * (budget / totalSpend);
    }

    const expectedCPA = totalSpend / Math.max(expectedConversions, 1);
    const expectedROAS = expectedRevenue / Math.max(totalSpend, 1);

    return {
      totalSpend: Math.round(totalSpend * 100) / 100,
      expectedConversions: Math.round(expectedConversions * 10) / 10,
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      expectedCPA: Math.round(expectedCPA * 100) / 100,
      expectedROAS: Math.round(expectedROAS * 100) / 100,
      riskScore: Math.round(riskScore * 1000) / 1000
    };
  }

  /**
   * Check for constraint violations
   */
  private checkConstraintViolations(
    campaigns: Campaign[],
    allocation: Map<string, number>,
    constraints: BudgetConstraints,
    totalBudget: number
  ): string[] {
    const violations: string[] = [];

    // Check total budget constraint
    const allocatedTotal = Array.from(allocation.values()).reduce((sum, a) => sum + a, 0);
    if (Math.abs(allocatedTotal - totalBudget) > this.EPSILON) {
      violations.push(`Total allocation ${allocatedTotal.toFixed(2)} does not match budget ${totalBudget.toFixed(2)}`);
    }

    // Check individual campaign constraints
    for (const campaign of campaigns) {
      const budget = allocation.get(campaign.id) ?? 0;

      // Check minimum budget
      const minBudget = campaign.minBudget ?? constraints.min_per_campaign ?? constraints.minDailyBudget;
      if (budget < minBudget - this.EPSILON) {
        violations.push(`Campaign ${campaign.name}: Budget ${budget.toFixed(2)} below minimum ${minBudget.toFixed(2)}`);
      }

      // Check maximum budget
      const maxBudget = campaign.maxBudget ?? constraints.maxDailyBudget;
      if (budget > maxBudget + this.EPSILON) {
        violations.push(`Campaign ${campaign.name}: Budget ${budget.toFixed(2)} exceeds maximum ${maxBudget.toFixed(2)}`);
      }

      // Check max change constraint
      if (campaign.currentDailyBudget && campaign.currentDailyBudget > 0) {
        const changePct = Math.abs((budget - campaign.currentDailyBudget) / campaign.currentDailyBudget * 100);
        const maxChangePct = constraints.maxChangePercent ?? 25;

        if (changePct > maxChangePct + this.EPSILON) {
          violations.push(`Campaign ${campaign.name}: Change ${changePct.toFixed(1)}% exceeds limit ${maxChangePct}%`);
        }
      }
    }

    // Check currency-specific caps
    if (constraints.daily_cap_AUD && allocatedTotal > constraints.daily_cap_AUD) {
      violations.push(`Total allocation exceeds AUD daily cap ${constraints.daily_cap_AUD}`);
    }
    if (constraints.daily_cap_USD && allocatedTotal > constraints.daily_cap_USD) {
      violations.push(`Total allocation exceeds USD daily cap ${constraints.daily_cap_USD}`);
    }
    if (constraints.daily_cap_GBP && allocatedTotal > constraints.daily_cap_GBP) {
      violations.push(`Total allocation exceeds GBP daily cap ${constraints.daily_cap_GBP}`);
    }

    return violations;
  }

  /**
   * Create empty result for edge cases
   */
  private createEmptyResult(reason: string): OptimizationResult {
    return {
      allocations: new Map(),
      expectedPerformance: {
        totalSpend: 0,
        expectedConversions: 0,
        expectedRevenue: 0,
        expectedCPA: 0,
        expectedROAS: 0,
        riskScore: 0
      },
      violations: [reason],
      feasible: false
    };
  }

  /**
   * Calculate risk-adjusted score for portfolio optimization
   */
  calculateRiskAdjustedScore(
    campaign: Campaign,
    riskTolerance: number
  ): number {
    const avgCPC = campaign.metrics30d.spend / Math.max(campaign.metrics30d.clicks, 1);
    const cvr = campaign.metrics30d.conversions / Math.max(campaign.metrics30d.clicks, 1);
    const avgValue = campaign.metrics30d.revenue / Math.max(campaign.metrics30d.conversions, 1);

    // Expected return
    const expectedReturn = (cvr * avgValue) / avgCPC;

    // Risk (variance) estimation based on sample size
    const sampleSize = campaign.metrics30d.clicks;
    const variance = 1 / Math.sqrt(Math.max(sampleSize, 1));

    // Sharpe-like ratio
    const riskAdjustedScore = expectedReturn - (1 - riskTolerance) * variance;

    return Math.max(0, riskAdjustedScore);
  }

  /**
   * Apply portfolio theory to diversify risk
   */
  applyPortfolioDiversification(
    campaigns: Campaign[],
    totalBudget: number,
    minDiversification: number = 0.1
  ): Map<string, number> {
    const allocation = new Map<string, number>();

    // Ensure minimum diversification
    const minBudgetPerCampaign = totalBudget * minDiversification;

    for (const campaign of campaigns) {
      allocation.set(campaign.id, minBudgetPerCampaign);
    }

    // Distribute remaining budget based on risk-adjusted returns
    const remaining = totalBudget - (minBudgetPerCampaign * campaigns.length);

    if (remaining > 0) {
      const scores = campaigns.map(c => this.calculateRiskAdjustedScore(c, 0.5));
      const totalScore = scores.reduce((sum, s) => sum + s, 0);

      campaigns.forEach((campaign, i) => {
        const additionalBudget = (scores[i] / totalScore) * remaining;
        const current = allocation.get(campaign.id) ?? 0;
        allocation.set(campaign.id, current + additionalBudget);
      });
    }

    return this.finalizeAllocation(allocation, totalBudget);
  }
}