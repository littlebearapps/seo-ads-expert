/**
 * Lag-Aware Thompson Sampling Budget Optimizer
 *
 * Enhances the base Thompson Sampling optimizer with:
 * - Conversion lag modeling and compensation
 * - Hierarchical empirical Bayes priors
 * - Recency-weighted posterior updates
 * - Predictive conversion estimation
 *
 * v2.0 Thompson Sampling Enhancement
 */

import { ThompsonSamplingOptimizer, Arm, BudgetConstraints, AllocationResult, BayesianPosterior } from './thompson-sampling.js';
import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';
import { FinancialMath } from '../utils/financial-math.js';

export interface LagProfile {
  scopeType: 'action' | 'campaign' | 'global';
  scopeId: string;
  daysSince: number;
  completionCdf: number;
  sampleSize: number;
  confidenceScore: number;
}

export interface LagAwareMeasurement {
  measurementId: string;
  experimentId: string;
  armId: string;
  measurementDate: string;

  // Raw statistics
  successes: number;
  trials: number;
  revenueTotal: number;

  // Lag information
  lagBucket?: string;
  daysSinceImpression?: number;
  isLagAdjusted: boolean;

  // Lag-adjusted statistics
  recencyWeight: number;
  effectiveTrials: number;
  effectiveSuccesses: number;

  // Posterior parameters (after adjustment)
  alphaPosterior: number;
  betaPosterior: number;
  gammaShape: number;
  gammaRate: number;

  // Uncertainty metrics
  explorationBonus: number;
  uncertaintyPenalty: number;
  confidenceIntervalLower?: number;
  confidenceIntervalUpper?: number;
}

export interface HierarchicalPrior {
  level: 'global' | 'campaign' | 'action';
  scopeId: string;
  metric: 'cvr' | 'revenue_per_conversion';
  alphaPrior: number;
  betaPrior: number;
  gammaShapePrior: number;
  gammaRatePrior: number;
  effectiveSampleSize: number;
  confidenceLevel: number;
}

export interface LagAwareConstraints extends BudgetConstraints {
  enableLagAdjustment?: boolean;
  enableHierarchicalPriors?: boolean;
  enableRecencyWeighting?: boolean;

  // Lag adjustment parameters
  minLagDays?: number;
  maxLagDays?: number;
  lagConfidenceThreshold?: number;

  // Recency parameters
  recencyHalfLifeDays?: number;
  minEffectiveTrials?: number;

  // Hierarchical prior parameters
  globalPriorStrength?: number;
  campaignPriorStrength?: number;
}

export class LagAwareThompsonSampling extends ThompsonSamplingOptimizer {
  private db: DatabaseManager;
  private lagProfiles: Map<string, LagProfile[]> = new Map();
  private hierarchicalPriors: Map<string, HierarchicalPrior> = new Map();

  // Feature flags for gradual rollout
  private featureFlags: Map<string, boolean> = new Map();

  constructor(db: DatabaseManager) {
    super();
    this.db = db;
    this.loadFeatureFlags();
  }

  /**
   * Enhanced budget allocation with lag-aware modeling
   */
  async allocateBudgetLagAware(
    arms: Arm[],
    totalBudget: number,
    constraints: LagAwareConstraints
  ): Promise<AllocationResult[]> {

    try {
      // Load lag profiles and hierarchical priors
      await this.loadLagProfiles(arms);
      await this.loadHierarchicalPriors(arms);

      // Check feature flags
      const lagAwareEnabled = this.isFeatureEnabled('lag_aware_posterior_updates');
      const hierarchicalEnabled = this.isFeatureEnabled('hierarchical_empirical_bayes');
      const recencyEnabled = this.isFeatureEnabled('recency_lag_adjusted_stats');

      if (!lagAwareEnabled) {
        // Fall back to base Thompson Sampling
        logger.debug('Lag-aware features disabled, falling back to base Thompson Sampling');
        return super.allocateBudget(arms, totalBudget, constraints);
      }

      // Enhanced allocation with lag compensation
      const result = await this.allocateBudgetWithLagCompensation(arms, totalBudget, constraints);

      // Final safety check - if any NaN detected, fallback completely
      for (const allocation of result) {
        if (!isFinite(allocation.proposedDailyBudget) ||
            !isFinite(allocation.expectedImprovement) ||
            !isFinite(allocation.thompsonScore) ||
            !isFinite(allocation.explorationBonus) ||
            !isFinite(allocation.confidenceInterval[0]) ||
            !isFinite(allocation.confidenceInterval[1])) {
          logger.warn('NaN detected in final result, falling back to base Thompson Sampling', {
            proposedDailyBudget: allocation.proposedDailyBudget,
            expectedImprovement: allocation.expectedImprovement,
            thompsonScore: allocation.thompsonScore,
            explorationBonus: allocation.explorationBonus,
            confidenceInterval: allocation.confidenceInterval
          });
          return super.allocateBudget(arms, totalBudget, constraints);
        }
      }

      return result;
    } catch (error) {
      logger.warn('Error in lag-aware allocation, falling back to base Thompson Sampling:', error);
      return super.allocateBudget(arms, totalBudget, constraints);
    }
  }

  /**
   * Allocation with lag compensation and predictive modeling
   */
  private async allocateBudgetWithLagCompensation(
    arms: Arm[],
    totalBudget: number,
    constraints: LagAwareConstraints
  ): Promise<AllocationResult[]> {

    const allocations: AllocationResult[] = [];
    const sampledScores: Map<string, number> = new Map();
    let totalScore = 0;

    // Phase 1: Enhanced posterior sampling with lag adjustment
    for (const arm of arms) {
      const lagAwarePosterior = await this.computeLagAwarePosterior(arm, constraints);

      // Validate posterior parameters before sampling
      if (!this.isValidPosterior(lagAwarePosterior)) {
        logger.warn(`Invalid posterior parameters for arm ${arm.id}:`, {
          alphaPosterior: lagAwarePosterior.alphaPosterior,
          betaPosterior: lagAwarePosterior.betaPosterior,
          gammaShape: lagAwarePosterior.gammaShape,
          gammaRate: lagAwarePosterior.gammaRate
        });
        // Skip this arm and fall back later if needed
        continue;
      }

      // Sample from lag-adjusted distributions with validation
      const sampledCVR = this.sampleBetaSafe(
        lagAwarePosterior.alphaPosterior,
        lagAwarePosterior.betaPosterior
      );

      const sampledValue = this.sampleGammaSafe(
        lagAwarePosterior.gammaShape,
        lagAwarePosterior.gammaRate
      );

      // Validate sampled values
      if (!isFinite(sampledCVR) || !isFinite(sampledValue)) {
        logger.warn(`Invalid sampling results for arm ${arm.id}:`, {
          sampledCVR,
          sampledValue,
          posterior: lagAwarePosterior
        });
        // Skip this arm and fall back later if needed
        continue;
      }

      // Calculate expected revenue with lag compensation
      const avgCPC = arm.metrics30d.spend / Math.max(arm.metrics30d.clicks, 1);
      const lagAdjustedRevenuePerClick = sampledCVR * sampledValue;
      const expectedROAS = lagAdjustedRevenuePerClick / Math.max(avgCPC, 0.01);

      // Validate intermediate calculations
      if (!isFinite(avgCPC) || !isFinite(lagAdjustedRevenuePerClick) || !isFinite(expectedROAS)) {
        logger.warn(`Invalid intermediate calculations for arm ${arm.id}:`, {
          avgCPC,
          lagAdjustedRevenuePerClick,
          expectedROAS,
          armMetrics: arm.metrics30d
        });
        // Skip this arm and fall back later if needed
        continue;
      }

      // Enhanced exploration bonus with uncertainty from lag model
      const explorationBonus = this.calculateLagAwareExplorationBonus(
        arm,
        lagAwarePosterior,
        constraints
      );

      const thompsonScore = expectedROAS * (1 + explorationBonus);

      // Final validation
      if (!isFinite(thompsonScore)) {
        logger.warn(`Invalid Thompson score for arm ${arm.id}:`, {
          thompsonScore,
          expectedROAS,
          explorationBonus
        });
        // Skip this arm and fall back later if needed
        continue;
      }

      sampledScores.set(arm.id, thompsonScore);
      totalScore += thompsonScore;

      // Store measurement for learning
      await this.storeMeasurement({
        measurementId: `${arm.id}-${Date.now()}`,
        experimentId: arm.id,
        armId: arm.id,
        measurementDate: new Date().toISOString(),
        successes: arm.metrics30d.conversions,
        trials: arm.metrics30d.clicks,
        revenueTotal: arm.metrics30d.revenue,
        isLagAdjusted: true,
        recencyWeight: lagAwarePosterior.recencyWeight || 1.0,
        effectiveTrials: lagAwarePosterior.effectiveTrials || arm.metrics30d.clicks,
        effectiveSuccesses: lagAwarePosterior.effectiveSuccesses || arm.metrics30d.conversions,
        alphaPosterior: lagAwarePosterior.alphaPosterior,
        betaPosterior: lagAwarePosterior.betaPosterior,
        gammaShape: lagAwarePosterior.gammaShape,
        gammaRate: lagAwarePosterior.gammaRate,
        explorationBonus: explorationBonus,
        uncertaintyPenalty: lagAwarePosterior.uncertaintyPenalty || 0
      });
    }

    // Phase 2: Budget allocation with lag-adjusted scores
    for (const arm of arms) {
      const thompsonScore = sampledScores.get(arm.id) || 0;
      const scoreRatio = thompsonScore / Math.max(totalScore, 0.001);

      // Validate score ratio
      if (!isFinite(scoreRatio) || scoreRatio < 0) {
        logger.warn(`Invalid score ratio for arm ${arm.id}: ${scoreRatio}, thompsonScore: ${thompsonScore}, totalScore: ${totalScore}`);
        continue;
      }

      let proposedBudget = totalBudget * scoreRatio;

      // Validate proposed budget before applying constraints
      if (!isFinite(proposedBudget) || proposedBudget < 0) {
        logger.warn(`Invalid proposed budget for arm ${arm.id}: ${proposedBudget}`);
        proposedBudget = constraints.minDailyBudget || 1.0; // Fallback to minimum
      }

      proposedBudget = this.applyConstraints(proposedBudget, arm, constraints);

      // Final validation of proposed budget
      if (!isFinite(proposedBudget) || proposedBudget <= 0) {
        logger.warn(`Invalid final proposed budget for arm ${arm.id}: ${proposedBudget}`);
        proposedBudget = constraints.minDailyBudget || 1.0; // Fallback
      }

      const currentBudget = arm.currentDailyBudget || 0;
      let expectedImprovement = this.calculateExpectedImprovement(
        arm,
        currentBudget,
        proposedBudget
      );

      // Validate expected improvement
      if (!isFinite(expectedImprovement)) {
        logger.warn(`Invalid expected improvement for arm ${arm.id}: ${expectedImprovement}`);
        expectedImprovement = 0; // Safe fallback
      }

      const reasoning = this.generateLagAwareReasoning(
        arm,
        thompsonScore,
        scoreRatio,
        currentBudget,
        proposedBudget
      );

      const explorationBonus = this.calculateLagAwareExplorationBonus(
        arm,
        await this.computeLagAwarePosterior(arm, constraints),
        constraints
      );

      let confidenceInterval: [number, number];
      try {
        confidenceInterval = await this.calculateLagAwareConfidenceInterval(arm);
        if (!isFinite(confidenceInterval[0]) || !isFinite(confidenceInterval[1])) {
          confidenceInterval = [0, 0]; // Safe fallback
        }
      } catch (error) {
        logger.debug(`Error calculating confidence interval for arm ${arm.id}:`, error);
        confidenceInterval = [0, 0]; // Safe fallback
      }

      allocations.push({
        armId: arm.id,
        armName: arm.name,
        currentDailyBudget: currentBudget,
        proposedDailyBudget: proposedBudget,
        expectedImprovement,
        confidenceInterval,
        reasoning,
        thompsonScore,
        explorationBonus
      });
    }

    // If no arms made it through validation, fall back to base Thompson Sampling
    if (allocations.length === 0) {
      logger.warn('No arms passed lag-aware validation, falling back to base Thompson Sampling');
      return super.allocateBudget(arms, totalBudget, constraints);
    }

    return this.normalizeAllocationsLagAware(allocations, totalBudget, constraints);
  }

  /**
   * Normalize allocations with robust NaN handling
   */
  private normalizeAllocationsLagAware(
    allocations: AllocationResult[],
    totalBudget: number,
    constraints: LagAwareConstraints
  ): AllocationResult[] {
    // Validate all allocations first
    for (const allocation of allocations) {
      if (!isFinite(allocation.proposedDailyBudget) || allocation.proposedDailyBudget <= 0) {
        logger.warn(`Invalid allocation detected, fixing: ${allocation.armId} = ${allocation.proposedDailyBudget}`);
        allocation.proposedDailyBudget = constraints.minDailyBudget || 1.0;
      }
    }

    // Use base class normalize with validated allocations
    return super.normalizeAllocations(allocations, totalBudget, constraints);
  }

  /**
   * Compute lag-aware posterior with hierarchical priors and recency weighting
   */
  private async computeLagAwarePosterior(
    arm: Arm,
    constraints: LagAwareConstraints
  ): Promise<LagAwareMeasurement> {

    // Get base posterior
    const basePosterior = this.bayesianUpdate(arm);

    // Start with base statistics
    let effectiveTrials = arm.metrics30d.clicks;
    let effectiveSuccesses = arm.metrics30d.conversions;
    let alphaPosterior = basePosterior.cvr_alpha;
    let betaPosterior = basePosterior.cvr_beta;
    let gammaShape = basePosterior.value_alpha;
    let gammaRate = basePosterior.value_beta;
    let uncertaintyPenalty = 0;
    let recencyWeight = 1.0;

    // Apply hierarchical priors if enabled
    if (this.isFeatureEnabled('hierarchical_empirical_bayes')) {
      const priors = this.getEffectivePriors(arm.id);
      if (priors.cvr && this.isValidPrior(priors.cvr)) {
        alphaPosterior = priors.cvr.alphaPrior + arm.metrics30d.conversions;
        betaPosterior = priors.cvr.betaPrior + arm.metrics30d.clicks - arm.metrics30d.conversions;
      }
      if (priors.revenue && this.isValidPrior(priors.revenue)) {
        gammaShape = priors.revenue.gammaShapePrior + arm.metrics30d.conversions;
        gammaRate = priors.revenue.gammaRatePrior + arm.metrics30d.revenue;
      }
    }

    // Apply lag adjustment if enabled and lag profiles available
    if (this.isFeatureEnabled('lag_aware_posterior_updates')) {
      const lagAdjustment = await this.calculateLagAdjustment(arm, constraints);
      if (lagAdjustment) {
        effectiveSuccesses = lagAdjustment.adjustedSuccesses;
        effectiveTrials = lagAdjustment.adjustedTrials;
        uncertaintyPenalty = lagAdjustment.uncertaintyPenalty;

        // Recompute posteriors with lag-adjusted data
        alphaPosterior = (this.getEffectivePriors(arm.id).cvr?.alphaPrior || 1) + effectiveSuccesses;
        betaPosterior = (this.getEffectivePriors(arm.id).cvr?.betaPrior || 1) + effectiveTrials - effectiveSuccesses;
      }
    }

    // Apply recency weighting if enabled
    if (this.isFeatureEnabled('recency_lag_adjusted_stats')) {
      recencyWeight = this.calculateRecencyWeight(constraints.recencyHalfLifeDays || 14);
      effectiveTrials *= recencyWeight;
      effectiveSuccesses *= recencyWeight;
    }

    return {
      measurementId: `${arm.id}-${Date.now()}`,
      experimentId: arm.id,
      armId: arm.id,
      measurementDate: new Date().toISOString(),
      successes: arm.metrics30d.conversions,
      trials: arm.metrics30d.clicks,
      revenueTotal: arm.metrics30d.revenue,
      isLagAdjusted: true,
      recencyWeight,
      effectiveTrials,
      effectiveSuccesses,
      alphaPosterior,
      betaPosterior,
      gammaShape,
      gammaRate,
      explorationBonus: 0, // Will be calculated separately
      uncertaintyPenalty
    };
  }

  /**
   * Calculate lag adjustment for conversion data
   */
  private async calculateLagAdjustment(
    arm: Arm,
    constraints: LagAwareConstraints
  ): Promise<{
    adjustedSuccesses: number;
    adjustedTrials: number;
    uncertaintyPenalty: number;
  } | null> {

    const lagProfiles = this.lagProfiles.get(`campaign-${arm.id}`) ||
                       this.lagProfiles.get('global');

    if (!lagProfiles || lagProfiles.length === 0) {
      return null;
    }

    // Find most recent lag profile with sufficient confidence
    const recentProfile = lagProfiles.find(profile =>
      profile.confidenceScore >= (constraints.lagConfidenceThreshold || 0.6)
    );

    if (!recentProfile) {
      return null;
    }

    // Estimate total conversions based on lag completion curve
    const observedConversions = arm.metrics30d.conversions;
    const completionRate = recentProfile.completionCdf;

    if (completionRate > 0 && completionRate < 1) {
      const estimatedTotalConversions = observedConversions / completionRate;
      const missingConversions = estimatedTotalConversions - observedConversions;

      // Add uncertainty penalty based on lag model confidence
      const uncertaintyPenalty = (1 - recentProfile.confidenceScore) * 0.1;

      return {
        adjustedSuccesses: estimatedTotalConversions,
        adjustedTrials: arm.metrics30d.clicks, // Trials don't change
        uncertaintyPenalty
      };
    }

    return null;
  }

  /**
   * Calculate recency weight using exponential decay
   */
  private calculateRecencyWeight(halfLifeDays: number): number {
    // For simplicity, assume average data age is 15 days
    const avgDataAgeDays = 15;
    const decayRate = Math.log(2) / halfLifeDays;
    return Math.exp(-decayRate * avgDataAgeDays);
  }

  /**
   * Enhanced exploration bonus with lag uncertainty
   */
  private calculateLagAwareExplorationBonus(
    arm: Arm,
    lagAwarePosterior: LagAwareMeasurement,
    constraints: LagAwareConstraints
  ): number {

    // Base exploration bonus from uncertainty
    const sampleSize = lagAwarePosterior.effectiveTrials || 1;
    const uncertaintyFactor = 1 / Math.sqrt(sampleSize);

    // Add lag model uncertainty
    const lagUncertainty = lagAwarePosterior.uncertaintyPenalty || 0;

    // Scale by risk tolerance
    const riskTolerance = constraints.riskTolerance || 0.3;
    const explorationBonus = (uncertaintyFactor + lagUncertainty) * riskTolerance;

    // Ensure minimum exploration
    const explorationFloor = constraints.explorationFloor || 0.1;
    return Math.max(explorationBonus, explorationFloor);
  }

  /**
   * Calculate confidence interval with lag adjustment
   */
  private async calculateLagAwareConfidenceInterval(arm: Arm): Promise<[number, number]> {
    const lagAwarePosterior = await this.computeLagAwarePosterior(arm, {
      minDailyBudget: 0,
      maxDailyBudget: 1000000,
      riskTolerance: 0.1
    });

    // Calculate 95% confidence interval using lag-adjusted posteriors
    const lowerCVR = this.betaQuantile(
      lagAwarePosterior.alphaPosterior,
      lagAwarePosterior.betaPosterior,
      0.025
    );
    const upperCVR = this.betaQuantile(
      lagAwarePosterior.alphaPosterior,
      lagAwarePosterior.betaPosterior,
      0.975
    );

    const avgCPC = arm.metrics30d.spend / Math.max(arm.metrics30d.clicks, 1);
    const expectedClicks = arm.currentDailyBudget ?
      (arm.currentDailyBudget / Math.max(avgCPC, 0.01)) : 0;

    const lowerConversions = expectedClicks * lowerCVR;
    const upperConversions = expectedClicks * upperCVR;

    return [
      Math.round(lowerConversions * 10) / 10,
      Math.round(upperConversions * 10) / 10
    ];
  }

  /**
   * Generate reasoning text with lag-aware insights
   */
  private generateLagAwareReasoning(
    arm: Arm,
    thompsonScore: number,
    scoreRatio: number,
    currentBudget: number,
    proposedBudget: number
  ): string {

    let reasoning = this.generateReasoning(
      arm,
      thompsonScore,
      scoreRatio,
      currentBudget,
      proposedBudget
    );

    // Add lag-aware insights
    const lagEnabled = this.isFeatureEnabled('lag_aware_posterior_updates');
    const hierarchicalEnabled = this.isFeatureEnabled('hierarchical_empirical_bayes');

    if (lagEnabled || hierarchicalEnabled) {
      reasoning += ' [Enhanced with ';
      const enhancements = [];

      if (lagEnabled) enhancements.push('lag modeling');
      if (hierarchicalEnabled) enhancements.push('cross-campaign learning');

      reasoning += enhancements.join(', ') + ']';
    }

    return reasoning;
  }

  /**
   * Load lag profiles from database
   */
  private async loadLagProfiles(arms: Arm[]): Promise<void> {
    try {
      // Load campaign-specific profiles
      for (const arm of arms) {
        const profiles = this.db.all<any>(`
          SELECT scope_type, scope_id, days_since, completion_cdf,
                 sample_size, confidence_score
          FROM lag_profiles
          WHERE scope_type = 'campaign' AND scope_id = ?
          ORDER BY days_since ASC
        `, [arm.id]);

        if (profiles.length > 0) {
          this.lagProfiles.set(`campaign-${arm.id}`, profiles.map(p => ({
            scopeType: p.scope_type as 'campaign',
            scopeId: p.scope_id,
            daysSince: p.days_since,
            completionCdf: p.completion_cdf,
            sampleSize: p.sample_size,
            confidenceScore: p.confidence_score
          })));
        }
      }

      // Load global profiles as fallback
      const globalProfiles = this.db.all<any>(`
        SELECT scope_type, scope_id, days_since, completion_cdf,
               sample_size, confidence_score
        FROM lag_profiles
        WHERE scope_type = 'global'
        ORDER BY days_since ASC
      `);

      if (globalProfiles.length > 0) {
        this.lagProfiles.set('global', globalProfiles.map(p => ({
          scopeType: p.scope_type as 'global',
          scopeId: p.scope_id,
          daysSince: p.days_since,
          completionCdf: p.completion_cdf,
          sampleSize: p.sample_size,
          confidenceScore: p.confidence_score
        })));
      }

      logger.debug(`Loaded lag profiles for ${this.lagProfiles.size} scopes`);
    } catch (error) {
      logger.debug('No lag profiles table found, using base Thompson Sampling');
    }
  }

  /**
   * Load hierarchical priors from database
   */
  private async loadHierarchicalPriors(arms: Arm[]): Promise<void> {
    try {
      const priors = this.db.all<any>(`
        SELECT level, scope_id, metric, alpha_prior, beta_prior,
               gamma_shape_prior, gamma_rate_prior, effective_sample_size, confidence_level
        FROM hierarchical_priors
        ORDER BY level DESC, scope_id ASC
      `);

      for (const prior of priors) {
        const key = `${prior.level}-${prior.scope_id}-${prior.metric}`;
        this.hierarchicalPriors.set(key, {
          level: prior.level,
          scopeId: prior.scope_id,
          metric: prior.metric,
          alphaPrior: prior.alpha_prior,
          betaPrior: prior.beta_prior,
          gammaShapePrior: prior.gamma_shape_prior,
          gammaRatePrior: prior.gamma_rate_prior,
          effectiveSampleSize: prior.effective_sample_size,
          confidenceLevel: prior.confidence_level
        });
      }

      logger.debug(`Loaded ${priors.length} hierarchical priors`);
    } catch (error) {
      logger.debug('No hierarchical priors table found, using uniform priors');
    }
  }

  /**
   * Get effective priors with fallback hierarchy
   */
  private getEffectivePriors(armId: string): {
    cvr?: HierarchicalPrior;
    revenue?: HierarchicalPrior;
  } {

    const getPrior = (metric: 'cvr' | 'revenue_per_conversion') => {
      // Try action-specific first
      let prior = this.hierarchicalPriors.get(`action-${armId}-${metric}`);
      if (prior) return prior;

      // Then campaign-specific
      prior = this.hierarchicalPriors.get(`campaign-${armId}-${metric}`);
      if (prior) return prior;

      // Finally global
      return this.hierarchicalPriors.get(`global-global-${metric}`);
    };

    return {
      cvr: getPrior('cvr'),
      revenue: getPrior('revenue_per_conversion')
    };
  }

  /**
   * Store measurement for future learning
   */
  private async storeMeasurement(measurement: LagAwareMeasurement): Promise<void> {
    try {
      this.db.run(`
        INSERT OR REPLACE INTO experiment_measurements (
          measurement_id, experiment_id, arm_id, measurement_date,
          successes, trials, revenue_total, lag_bucket, days_since_impression,
          is_lag_adjusted, recency_weight, effective_trials, effective_successes,
          alpha_posterior, beta_posterior, gamma_shape, gamma_rate,
          exploration_bonus, uncertainty_penalty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        measurement.measurementId,
        measurement.experimentId,
        measurement.armId,
        measurement.measurementDate,
        measurement.successes,
        measurement.trials,
        measurement.revenueTotal,
        measurement.lagBucket || null,
        measurement.daysSinceImpression || null,
        measurement.isLagAdjusted ? 1 : 0,
        measurement.recencyWeight,
        measurement.effectiveTrials,
        measurement.effectiveSuccesses,
        measurement.alphaPosterior,
        measurement.betaPosterior,
        measurement.gammaShape,
        measurement.gammaRate,
        measurement.explorationBonus,
        measurement.uncertaintyPenalty
      ]);
    } catch (error) {
      logger.debug('Could not store measurement (table may not exist):', error);
    }
  }

  /**
   * Load feature flags from database
   */
  private loadFeatureFlags(): void {
    try {
      const flags = this.db.all<any>(`
        SELECT flag_name, enabled
        FROM feature_flags
        WHERE enabled = 1
      `);

      for (const flag of flags) {
        this.featureFlags.set(flag.flag_name, flag.enabled === 1);
      }

      logger.debug(`Loaded ${flags.length} enabled feature flags`);
    } catch (error) {
      logger.debug('No feature flags table found, using defaults');
      // Default to base Thompson Sampling
      this.featureFlags.set('lag_aware_posterior_updates', false);
      this.featureFlags.set('hierarchical_empirical_bayes', false);
      this.featureFlags.set('recency_lag_adjusted_stats', false);
    }
  }

  /**
   * Check if feature is enabled
   */
  private isFeatureEnabled(flagName: string): boolean {
    return this.featureFlags.get(flagName) || false;
  }

  /**
   * Update feature flag status
   */
  async updateFeatureFlag(flagName: string, enabled: boolean): Promise<void> {
    this.featureFlags.set(flagName, enabled);

    try {
      this.db.run(`
        UPDATE feature_flags
        SET enabled = ?, updated_at = datetime('now')
        WHERE flag_name = ?
      `, [enabled ? 1 : 0, flagName]);

      logger.info(`Feature flag '${flagName}' ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      logger.warn(`Could not update feature flag '${flagName}':`, error);
    }
  }

  /**
   * Get current feature flag status
   */
  getFeatureFlags(): Map<string, boolean> {
    return new Map(this.featureFlags);
  }

  /**
   * Validate posterior parameters for numerical stability
   */
  private isValidPosterior(posterior: LagAwareMeasurement): boolean {
    const { alphaPosterior, betaPosterior, gammaShape, gammaRate } = posterior;

    // Check for finite, positive values
    if (!isFinite(alphaPosterior) || !isFinite(betaPosterior) ||
        !isFinite(gammaShape) || !isFinite(gammaRate)) {
      return false;
    }

    // Beta distribution requires positive parameters
    if (alphaPosterior <= 0 || betaPosterior <= 0) {
      return false;
    }

    // Gamma distribution requires positive shape and rate
    if (gammaShape <= 0 || gammaRate <= 0) {
      return false;
    }

    // Check for reasonable parameter ranges (prevent extreme values)
    if (alphaPosterior > 1e6 || betaPosterior > 1e6 ||
        gammaShape > 1e6 || gammaRate > 1e6) {
      return false;
    }

    return true;
  }

  /**
   * Validate hierarchical prior parameters
   */
  private isValidPrior(prior: HierarchicalPrior): boolean {
    const { alphaPrior, betaPrior, gammaShapePrior, gammaRatePrior } = prior;

    // Check for finite, positive values
    if (!isFinite(alphaPrior) || !isFinite(betaPrior) ||
        !isFinite(gammaShapePrior) || !isFinite(gammaRatePrior)) {
      return false;
    }

    // All prior parameters must be positive
    if (alphaPrior <= 0 || betaPrior <= 0 ||
        gammaShapePrior <= 0 || gammaRatePrior <= 0) {
      return false;
    }

    // Check for reasonable parameter ranges
    if (alphaPrior > 1e6 || betaPrior > 1e6 ||
        gammaShapePrior > 1e6 || gammaRatePrior > 1e6) {
      return false;
    }

    return true;
  }

  /**
   * Safe Beta sampling with fallbacks
   */
  private sampleBetaSafe(alpha: number, beta: number): number {
    try {
      // Ensure parameters are in valid range
      const safeAlpha = Math.max(0.1, Math.min(alpha, 1e6));
      const safeBeta = Math.max(0.1, Math.min(beta, 1e6));

      const result = this.sampleBeta(safeAlpha, safeBeta);

      if (!isFinite(result) || result < 0 || result > 1) {
        // Fallback to expected value
        return safeAlpha / (safeAlpha + safeBeta);
      }

      return result;
    } catch (error) {
      logger.debug(`Beta sampling failed, using fallback: alpha=${alpha}, beta=${beta}`);
      // Return expected value as fallback
      const safeAlpha = Math.max(0.1, alpha);
      const safeBeta = Math.max(0.1, beta);
      return safeAlpha / (safeAlpha + safeBeta);
    }
  }

  /**
   * Safe Gamma sampling with fallbacks
   */
  private sampleGammaSafe(shape: number, rate: number): number {
    try {
      // Ensure parameters are in valid range
      const safeShape = Math.max(0.1, Math.min(shape, 1e6));
      const safeRate = Math.max(0.01, Math.min(rate, 1e6));

      const result = this.sampleGamma(safeShape, safeRate);

      if (!isFinite(result) || result <= 0) {
        // Fallback to expected value
        return safeShape / safeRate;
      }

      return result;
    } catch (error) {
      logger.debug(`Gamma sampling failed, using fallback: shape=${shape}, rate=${rate}`);
      // Return expected value as fallback
      const safeShape = Math.max(0.1, shape);
      const safeRate = Math.max(0.01, rate);
      return safeShape / safeRate;
    }
  }
}