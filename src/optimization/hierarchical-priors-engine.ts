/**
 * Hierarchical Empirical Bayes Priors Engine
 *
 * Implements cross-campaign learning through hierarchical priors:
 * - Global priors learned from all campaign data
 * - Campaign-specific priors with shrinkage to global
 * - Action-specific priors with shrinkage to campaign and global
 *
 * Enables new campaigns to benefit from historical performance patterns
 */

import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';
import { FinancialMath } from '../utils/financial-math.js';

export interface PriorUpdate {
  level: 'global' | 'campaign' | 'action';
  scopeId: string;
  metric: 'cvr' | 'revenue_per_conversion';
  observations: {
    successes: number;
    trials: number;
    revenue?: number;
  }[];
}

export interface LearnedPrior {
  alphaPrior: number;
  betaPrior: number;
  gammaShapePrior?: number;
  gammaRatePrior?: number;
  effectiveSampleSize: number;
  confidenceLevel: number;
}

export interface ShrinkageParameters {
  globalShrinkage: number; // How much to shrink toward global prior
  campaignShrinkage: number; // How much to shrink toward campaign prior
  minSampleSize: number; // Minimum samples before trusting local estimate
}

export class HierarchicalPriorsEngine {
  private db: DatabaseManager;
  private readonly DEFAULT_GLOBAL_STRENGTH = 10;
  private readonly DEFAULT_CAMPAIGN_STRENGTH = 5;
  private readonly DEFAULT_MIN_SAMPLE_SIZE = 50;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Update all hierarchical priors based on recent data
   */
  async updateAllPriors(): Promise<{
    globalPriors: number;
    campaignPriors: number;
    actionPriors: number;
  }> {
    logger.info('🧠 Starting hierarchical priors learning update...');

    const startTime = Date.now();

    // Step 1: Update global priors from all data
    const globalPriors = await this.updateGlobalPriors();

    // Step 2: Update campaign-specific priors
    const campaignPriors = await this.updateCampaignPriors();

    // Step 3: Update action-specific priors
    const actionPriors = await this.updateActionPriors();

    const duration = Date.now() - startTime;
    logger.info(`✅ Hierarchical priors updated in ${duration}ms: ${globalPriors} global, ${campaignPriors} campaign, ${actionPriors} action`);

    return { globalPriors, campaignPriors, actionPriors };
  }

  /**
   * Update global priors from all available data
   */
  private async updateGlobalPriors(): Promise<number> {
    try {
      // Aggregate data from all campaigns
      const globalData = this.db.get<any>(`
        SELECT
          SUM(successes) as total_successes,
          SUM(trials) as total_trials,
          SUM(revenue_total) as total_revenue,
          COUNT(*) as measurement_count
        FROM experiment_measurements
        WHERE created_at >= date('now', '-90 days')
      `);

      if (!globalData || globalData.total_trials === 0) {
        logger.debug('No global data available for prior learning');
        return 0;
      }

      // Learn CVR prior
      const cvrPrior = this.learnBetaPrior(
        globalData.total_successes,
        globalData.total_trials,
        this.DEFAULT_GLOBAL_STRENGTH
      );

      // Learn revenue per conversion prior
      const revenuePrior = this.learnGammaPrior(
        globalData.total_successes,
        globalData.total_revenue,
        this.DEFAULT_GLOBAL_STRENGTH
      );

      // Store global priors
      await this.storePrior({
        level: 'global',
        scopeId: 'global',
        metric: 'cvr',
        alphaPrior: cvrPrior.alphaPrior,
        betaPrior: cvrPrior.betaPrior,
        effectiveSampleSize: cvrPrior.effectiveSampleSize,
        confidenceLevel: cvrPrior.confidenceLevel
      });

      await this.storePrior({
        level: 'global',
        scopeId: 'global',
        metric: 'revenue_per_conversion',
        gammaShapePrior: revenuePrior.gammaShapePrior || 1,
        gammaRatePrior: revenuePrior.gammaRatePrior || 1,
        alphaPrior: 1, // Not used for revenue
        betaPrior: 1,  // Not used for revenue
        effectiveSampleSize: revenuePrior.effectiveSampleSize,
        confidenceLevel: revenuePrior.confidenceLevel
      });

      logger.debug(`Global priors learned: CVR α=${cvrPrior.alphaPrior.toFixed(2)}, β=${cvrPrior.betaPrior.toFixed(2)}`);
      return 2; // CVR + Revenue priors

    } catch (error) {
      logger.warn('Failed to update global priors:', error);
      return 0;
    }
  }

  /**
   * Update campaign-specific priors with shrinkage to global
   */
  private async updateCampaignPriors(): Promise<number> {
    try {
      // Get global priors for shrinkage
      const globalCvrPrior = await this.getPrior('global', 'global', 'cvr');
      const globalRevenuePrior = await this.getPrior('global', 'global', 'revenue_per_conversion');

      // Get campaigns with sufficient data
      const campaigns = this.db.all<any>(`
        SELECT
          experiment_id as campaign_id,
          SUM(successes) as total_successes,
          SUM(trials) as total_trials,
          SUM(revenue_total) as total_revenue,
          COUNT(*) as measurement_count
        FROM experiment_measurements
        WHERE created_at >= date('now', '-90 days')
        GROUP BY experiment_id
        HAVING total_trials >= ?
      `, [this.DEFAULT_MIN_SAMPLE_SIZE]);

      let updatedCount = 0;

      for (const campaign of campaigns) {
        // Learn campaign-specific priors with shrinkage
        const cvrPrior = this.learnBetaPriorWithShrinkage(
          campaign.total_successes,
          campaign.total_trials,
          globalCvrPrior,
          this.DEFAULT_CAMPAIGN_STRENGTH
        );

        const revenuePrior = this.learnGammaPriorWithShrinkage(
          campaign.total_successes,
          campaign.total_revenue,
          globalRevenuePrior,
          this.DEFAULT_CAMPAIGN_STRENGTH
        );

        // Store campaign priors
        await this.storePrior({
          level: 'campaign',
          scopeId: campaign.campaign_id,
          metric: 'cvr',
          alphaPrior: cvrPrior.alphaPrior,
          betaPrior: cvrPrior.betaPrior,
          effectiveSampleSize: cvrPrior.effectiveSampleSize,
          confidenceLevel: cvrPrior.confidenceLevel
        });

        await this.storePrior({
          level: 'campaign',
          scopeId: campaign.campaign_id,
          metric: 'revenue_per_conversion',
          gammaShapePrior: revenuePrior.gammaShapePrior || 1,
          gammaRatePrior: revenuePrior.gammaRatePrior || 1,
          alphaPrior: 1,
          betaPrior: 1,
          effectiveSampleSize: revenuePrior.effectiveSampleSize,
          confidenceLevel: revenuePrior.confidenceLevel
        });

        updatedCount += 2;
      }

      logger.debug(`Updated priors for ${campaigns.length} campaigns`);
      return updatedCount;

    } catch (error) {
      logger.warn('Failed to update campaign priors:', error);
      return 0;
    }
  }

  /**
   * Update action-specific priors with shrinkage to campaign and global
   */
  private async updateActionPriors(): Promise<number> {
    try {
      // For now, treat each campaign as an "action"
      // In future, this could be extended to ad groups or individual ads

      // Get conversion actions with sufficient data
      const actions = this.db.all<any>(`
        SELECT
          arm_id as action_id,
          experiment_id as campaign_id,
          SUM(successes) as total_successes,
          SUM(trials) as total_trials,
          SUM(revenue_total) as total_revenue,
          COUNT(*) as measurement_count
        FROM experiment_measurements
        WHERE created_at >= date('now', '-30 days')
        GROUP BY arm_id, experiment_id
        HAVING total_trials >= ?
      `, [Math.floor(this.DEFAULT_MIN_SAMPLE_SIZE / 2)]); // Lower threshold for actions

      let updatedCount = 0;

      for (const action of actions) {
        // Get campaign and global priors for shrinkage
        const campaignCvrPrior = await this.getPrior('campaign', action.campaign_id, 'cvr');
        const campaignRevenuePrior = await this.getPrior('campaign', action.campaign_id, 'revenue_per_conversion');

        const globalCvrPrior = await this.getPrior('global', 'global', 'cvr');
        const globalRevenuePrior = await this.getPrior('global', 'global', 'revenue_per_conversion');

        // Use campaign prior if available, otherwise global
        const effectiveCvrPrior = campaignCvrPrior || globalCvrPrior;
        const effectiveRevenuePrior = campaignRevenuePrior || globalRevenuePrior;

        if (effectiveCvrPrior && effectiveRevenuePrior) {
          // Learn action-specific priors with hierarchical shrinkage
          const cvrPrior = this.learnBetaPriorWithShrinkage(
            action.total_successes,
            action.total_trials,
            effectiveCvrPrior,
            Math.floor(this.DEFAULT_CAMPAIGN_STRENGTH / 2)
          );

          const revenuePrior = this.learnGammaPriorWithShrinkage(
            action.total_successes,
            action.total_revenue,
            effectiveRevenuePrior,
            Math.floor(this.DEFAULT_CAMPAIGN_STRENGTH / 2)
          );

          // Store action priors
          await this.storePrior({
            level: 'action',
            scopeId: action.action_id,
            metric: 'cvr',
            alphaPrior: cvrPrior.alphaPrior,
            betaPrior: cvrPrior.betaPrior,
            effectiveSampleSize: cvrPrior.effectiveSampleSize,
            confidenceLevel: cvrPrior.confidenceLevel
          });

          await this.storePrior({
            level: 'action',
            scopeId: action.action_id,
            metric: 'revenue_per_conversion',
            gammaShapePrior: revenuePrior.gammaShapePrior || 1,
            gammaRatePrior: revenuePrior.gammaRatePrior || 1,
            alphaPrior: 1,
            betaPrior: 1,
            effectiveSampleSize: revenuePrior.effectiveSampleSize,
            confidenceLevel: revenuePrior.confidenceLevel
          });

          updatedCount += 2;
        }
      }

      logger.debug(`Updated priors for ${actions.length} actions`);
      return updatedCount;

    } catch (error) {
      logger.warn('Failed to update action priors:', error);
      return 0;
    }
  }

  /**
   * Learn Beta prior for conversion rate without shrinkage
   */
  private learnBetaPrior(
    successes: number,
    trials: number,
    priorStrength: number
  ): LearnedPrior {

    // Method of moments for Beta distribution
    const p = successes / Math.max(trials, 1);
    const variance = p * (1 - p) / Math.max(trials, 1);

    // Ensure reasonable variance bounds
    const clampedVariance = Math.max(0.001, Math.min(0.25, variance));

    // Convert to Beta parameters
    const alphaPrior = ((1 - p) / clampedVariance - 1 / p) * p * p;
    const betaPrior = alphaPrior * (1 / p - 1);

    // Apply smoothing based on prior strength
    const smoothedAlpha = Math.max(1, alphaPrior * priorStrength / 100);
    const smoothedBeta = Math.max(1, betaPrior * priorStrength / 100);

    return {
      alphaPrior: smoothedAlpha,
      betaPrior: smoothedBeta,
      effectiveSampleSize: trials,
      confidenceLevel: Math.min(0.95, trials / (trials + priorStrength))
    };
  }

  /**
   * Learn Beta prior with shrinkage to higher-level prior
   */
  private learnBetaPriorWithShrinkage(
    successes: number,
    trials: number,
    parentPrior: LearnedPrior | null,
    priorStrength: number
  ): LearnedPrior {

    if (!parentPrior || trials < this.DEFAULT_MIN_SAMPLE_SIZE) {
      // If no parent prior or insufficient data, use shrinkage to parent
      if (parentPrior) {
        const localWeight = trials / (trials + priorStrength);
        const localP = successes / Math.max(trials, 1);
        const parentP = parentPrior.alphaPrior / (parentPrior.alphaPrior + parentPrior.betaPrior);

        const shrunkP = localWeight * localP + (1 - localWeight) * parentP;
        const shrunkVariance = localWeight * (localP * (1 - localP) / Math.max(trials, 1)) +
                              (1 - localWeight) * 0.01; // Assume small parent variance

        const alphaPrior = ((1 - shrunkP) / shrunkVariance - 1 / shrunkP) * shrunkP * shrunkP;
        const betaPrior = alphaPrior * (1 / shrunkP - 1);

        return {
          alphaPrior: Math.max(1, alphaPrior),
          betaPrior: Math.max(1, betaPrior),
          effectiveSampleSize: trials + parentPrior.effectiveSampleSize,
          confidenceLevel: Math.min(0.95, localWeight * 0.8 + (1 - localWeight) * parentPrior.confidenceLevel)
        };
      } else {
        // No parent prior, use local data only
        return this.learnBetaPrior(successes, trials, priorStrength);
      }
    }

    // Sufficient local data, use minimal shrinkage
    const localPrior = this.learnBetaPrior(successes, trials, priorStrength);
    const shrinkageWeight = 0.1; // Light shrinkage

    return {
      alphaPrior: (1 - shrinkageWeight) * localPrior.alphaPrior + shrinkageWeight * parentPrior.alphaPrior,
      betaPrior: (1 - shrinkageWeight) * localPrior.betaPrior + shrinkageWeight * parentPrior.betaPrior,
      effectiveSampleSize: localPrior.effectiveSampleSize,
      confidenceLevel: localPrior.confidenceLevel
    };
  }

  /**
   * Learn Gamma prior for revenue per conversion
   */
  private learnGammaPrior(
    conversions: number,
    revenue: number,
    priorStrength: number
  ): LearnedPrior {

    if (conversions === 0 || revenue === 0) {
      return {
        alphaPrior: 1,
        betaPrior: 1,
        gammaShapePrior: 1,
        gammaRatePrior: 1,
        effectiveSampleSize: 0,
        confidenceLevel: 0
      };
    }

    // Method of moments for Gamma distribution
    const meanRevenue = revenue / conversions;
    const variance = meanRevenue * meanRevenue / Math.max(conversions, 1); // Rough approximation

    // Convert to Gamma parameters (shape, rate)
    const shape = meanRevenue * meanRevenue / Math.max(variance, 0.01);
    const rate = meanRevenue / Math.max(variance, 0.01);

    // Apply prior strength smoothing
    const smoothedShape = Math.max(1, shape * priorStrength / 100);
    const smoothedRate = Math.max(0.01, rate * priorStrength / 100);

    return {
      alphaPrior: 1,
      betaPrior: 1,
      gammaShapePrior: smoothedShape,
      gammaRatePrior: smoothedRate,
      effectiveSampleSize: conversions,
      confidenceLevel: Math.min(0.95, conversions / (conversions + priorStrength))
    };
  }

  /**
   * Learn Gamma prior with shrinkage
   */
  private learnGammaPriorWithShrinkage(
    conversions: number,
    revenue: number,
    parentPrior: LearnedPrior | null,
    priorStrength: number
  ): LearnedPrior {

    if (!parentPrior || conversions < this.DEFAULT_MIN_SAMPLE_SIZE / 5) {
      if (parentPrior) {
        // Use shrinkage to parent
        const localWeight = conversions / (conversions + priorStrength);
        const localPrior = this.learnGammaPrior(conversions, revenue, priorStrength);

        return {
          alphaPrior: 1,
          betaPrior: 1,
          gammaShapePrior: localWeight * (localPrior.gammaShapePrior || 1) +
                          (1 - localWeight) * (parentPrior.gammaShapePrior || 1),
          gammaRatePrior: localWeight * (localPrior.gammaRatePrior || 1) +
                         (1 - localWeight) * (parentPrior.gammaRatePrior || 1),
          effectiveSampleSize: conversions + parentPrior.effectiveSampleSize,
          confidenceLevel: Math.min(0.95, localWeight * 0.8 + (1 - localWeight) * parentPrior.confidenceLevel)
        };
      } else {
        return this.learnGammaPrior(conversions, revenue, priorStrength);
      }
    }

    // Sufficient local data
    const localPrior = this.learnGammaPrior(conversions, revenue, priorStrength);
    const shrinkageWeight = 0.1;

    return {
      alphaPrior: 1,
      betaPrior: 1,
      gammaShapePrior: (1 - shrinkageWeight) * (localPrior.gammaShapePrior || 1) +
                      shrinkageWeight * (parentPrior?.gammaShapePrior || 1),
      gammaRatePrior: (1 - shrinkageWeight) * (localPrior.gammaRatePrior || 1) +
                     shrinkageWeight * (parentPrior?.gammaRatePrior || 1),
      effectiveSampleSize: localPrior.effectiveSampleSize,
      confidenceLevel: localPrior.confidenceLevel
    };
  }

  /**
   * Store learned prior in database
   */
  private async storePrior(prior: {
    level: string;
    scopeId: string;
    metric: string;
    alphaPrior: number;
    betaPrior: number;
    gammaShapePrior?: number;
    gammaRatePrior?: number;
    effectiveSampleSize: number;
    confidenceLevel: number;
  }): Promise<void> {

    const priorId = `${prior.level}-${prior.scopeId}-${prior.metric}`;

    this.db.run(`
      INSERT OR REPLACE INTO hierarchical_priors (
        prior_id, level, scope_id, metric,
        alpha_prior, beta_prior, gamma_shape_prior, gamma_rate_prior,
        effective_sample_size, confidence_level,
        last_update_size, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      priorId,
      prior.level,
      prior.scopeId,
      prior.metric,
      prior.alphaPrior,
      prior.betaPrior,
      prior.gammaShapePrior || 1,
      prior.gammaRatePrior || 1,
      prior.effectiveSampleSize,
      prior.confidenceLevel,
      prior.effectiveSampleSize // Use as last update size
    ]);
  }

  /**
   * Get stored prior from database
   */
  private async getPrior(
    level: string,
    scopeId: string,
    metric: string
  ): Promise<LearnedPrior | null> {

    const result = this.db.get<any>(`
      SELECT alpha_prior, beta_prior, gamma_shape_prior, gamma_rate_prior,
             effective_sample_size, confidence_level
      FROM hierarchical_priors
      WHERE level = ? AND scope_id = ? AND metric = ?
    `, [level, scopeId, metric]);

    if (!result) return null;

    return {
      alphaPrior: result.alpha_prior,
      betaPrior: result.beta_prior,
      gammaShapePrior: result.gamma_shape_prior,
      gammaRatePrior: result.gamma_rate_prior,
      effectiveSampleSize: result.effective_sample_size,
      confidenceLevel: result.confidence_level
    };
  }

  /**
   * Get priors statistics for monitoring
   */
  async getPriorsStats(): Promise<{
    globalPriors: number;
    campaignPriors: number;
    actionPriors: number;
    lastUpdated: string | null;
  }> {

    try {
      const stats = this.db.get<any>(`
        SELECT
          COUNT(CASE WHEN level = 'global' THEN 1 END) as global_count,
          COUNT(CASE WHEN level = 'campaign' THEN 1 END) as campaign_count,
          COUNT(CASE WHEN level = 'action' THEN 1 END) as action_count,
          MAX(updated_at) as last_updated
        FROM hierarchical_priors
      `);

      return {
        globalPriors: stats?.global_count || 0,
        campaignPriors: stats?.campaign_count || 0,
        actionPriors: stats?.action_count || 0,
        lastUpdated: stats?.last_updated || null
      };

    } catch (error) {
      logger.debug('No hierarchical priors table found');
      return {
        globalPriors: 0,
        campaignPriors: 0,
        actionPriors: 0,
        lastUpdated: null
      };
    }
  }

  /**
   * Clean old priors to prevent unbounded growth
   */
  async cleanOldPriors(retentionDays: number = 180): Promise<number> {
    try {
      const result = this.db.run(`
        DELETE FROM hierarchical_priors
        WHERE updated_at < date('now', '-${retentionDays} days')
      `);

      if (result.changes > 0) {
        logger.info(`🧹 Cleaned ${result.changes} old hierarchical priors`);
      }

      return result.changes;
    } catch (error) {
      logger.debug('Could not clean old priors:', error);
      return 0;
    }
  }
}