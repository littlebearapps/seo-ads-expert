/**
 * Pacing Controller for Thompson Sampling Budget Optimization
 * Integrates with Thompson Sampling to provide real-time budget pacing and bid adjustments
 */

import { DatabaseManager } from '../database/database-manager.js';
import { LagAwareThompsonSampling } from './lag-aware-thompson-sampling.js';
import { logger } from '../utils/logger.js';

export interface PacingControllerState {
  controllerId: string;
  campaignId: string;
  dailyBudgetMicros: number;
  currentSpendMicros: number;
  paceTarget: number; // 1.0 = on track
  lastSampleTimestamp?: string;
  lastSampledArm?: string;
  expectedValuePerClick: number;
  confidenceInEstimate: number;
  currentBidMultiplier: number;
  spendRateLimit: number; // Max spend rate as fraction of budget
  explorationBudgetFraction: number;
  exploitationConfidenceThreshold: number;
  maxBidAdjustment: number;
  decisionFrequencyMinutes: number;
  updatedAt: string;
  createdAt: string;
}

export interface PacingDecision {
  campaignId: string;
  action: 'increase_bids' | 'decrease_bids' | 'maintain' | 'pause' | 'resume';
  bidMultiplier: number;
  reasoning: string;
  confidence: number;
  expectedImpact: {
    spendChange: number;
    conversionChange: number;
    revenueChange: number;
  };
  sampledArm?: string;
  explorationMode: boolean;
}

export interface PacingConstraints {
  minBidMultiplier: number;
  maxBidMultiplier: number;
  maxDailySpendMicros: number;
  pauseThreshold: number; // Spend rate that triggers pause
  resumeThreshold: number; // Spend rate that allows resume
  emergencyStopThreshold: number; // Hard stop threshold
}

/**
 * Real-time pacing controller that integrates Thompson Sampling decisions
 * with budget management and bid adjustments
 */
export class PacingController {
  private db: DatabaseManager;
  private thompsonSampling: LagAwareThompsonSampling;
  private defaultConstraints: PacingConstraints = {
    minBidMultiplier: 0.75,
    maxBidMultiplier: 1.25,
    maxDailySpendMicros: 0, // Set per campaign
    pauseThreshold: 1.1, // 110% of budget
    resumeThreshold: 0.95, // 95% of budget
    emergencyStopThreshold: 1.2 // 120% of budget
  };

  constructor(db: DatabaseManager, thompsonSampling: LagAwareThompsonSampling) {
    this.db = db;
    this.thompsonSampling = thompsonSampling;
  }

  /**
   * Initialize pacing controller for a campaign
   */
  async initializeCampaignPacing(
    campaignId: string,
    dailyBudgetMicros: number,
    config?: Partial<PacingControllerState>
  ): Promise<string> {
    const controllerId = `pacing_${campaignId}_${Date.now()}`;
    const now = new Date().toISOString();

    const state: PacingControllerState = {
      controllerId,
      campaignId,
      dailyBudgetMicros,
      currentSpendMicros: 0,
      paceTarget: 1.0,
      expectedValuePerClick: 0.0,
      confidenceInEstimate: 0.0,
      currentBidMultiplier: 1.0,
      spendRateLimit: 1.0,
      explorationBudgetFraction: 0.1,
      exploitationConfidenceThreshold: 0.8,
      maxBidAdjustment: 0.25,
      decisionFrequencyMinutes: 60,
      updatedAt: now,
      createdAt: now,
      ...config
    };

    this.db.run(`
      INSERT OR REPLACE INTO pacing_controller_state (
        controller_id, campaign_id, daily_budget_micros, current_spend_micros,
        pace_target, last_sample_timestamp, last_sampled_arm,
        expected_value_per_click, confidence_in_estimate,
        current_bid_multiplier, spend_rate_limit,
        exploration_budget_fraction, exploitation_confidence_threshold,
        max_bid_adjustment, decision_frequency_minutes,
        updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      state.controllerId, state.campaignId, state.dailyBudgetMicros,
      state.currentSpendMicros, state.paceTarget, state.lastSampleTimestamp,
      state.lastSampledArm, state.expectedValuePerClick, state.confidenceInEstimate,
      state.currentBidMultiplier, state.spendRateLimit,
      state.explorationBudgetFraction, state.exploitationConfidenceThreshold,
      state.maxBidAdjustment, state.decisionFrequencyMinutes,
      state.updatedAt, state.createdAt
    ]);

    logger.info(`✅ Pacing controller initialized for campaign ${campaignId}`, {
      controllerId,
      dailyBudgetMicros,
      config
    });

    return controllerId;
  }

  /**
   * Make pacing decision based on current spend and Thompson Sampling insights
   */
  async makePacingDecision(
    campaignId: string,
    currentSpendMicros: number,
    hoursIntoDay: number,
    constraints?: Partial<PacingConstraints>
  ): Promise<PacingDecision> {
    const state = await this.getPacingState(campaignId);
    if (!state) {
      throw new Error(`No pacing controller found for campaign ${campaignId}`);
    }

    const effectiveConstraints = { ...this.defaultConstraints, ...constraints };
    effectiveConstraints.maxDailySpendMicros = state.dailyBudgetMicros;

    // Calculate current pace
    const expectedSpendAtThisHour = (state.dailyBudgetMicros * hoursIntoDay) / 24;
    const currentPace = expectedSpendAtThisHour > 0 ? currentSpendMicros / expectedSpendAtThisHour : 0;

    // Emergency stop check
    if (currentSpendMicros >= state.dailyBudgetMicros * effectiveConstraints.emergencyStopThreshold) {
      return {
        campaignId,
        action: 'pause',
        bidMultiplier: 0.0,
        reasoning: `Emergency stop: spend ${currentSpendMicros} exceeds ${effectiveConstraints.emergencyStopThreshold}x budget`,
        confidence: 1.0,
        expectedImpact: {
          spendChange: -currentSpendMicros,
          conversionChange: 0,
          revenueChange: 0
        },
        explorationMode: false
      };
    }

    // Get Thompson Sampling recommendation
    const samplingResult = await this.getThompsonSamplingRecommendation(campaignId, state);

    // Determine exploration vs exploitation mode
    const remainingBudget = state.dailyBudgetMicros - currentSpendMicros;
    const explorationBudget = state.dailyBudgetMicros * state.explorationBudgetFraction;
    const isExplorationMode = remainingBudget > explorationBudget &&
                              state.confidenceInEstimate < state.exploitationConfidenceThreshold;

    // Calculate bid adjustment
    let bidMultiplier: number;
    let action: PacingDecision['action'];
    let reasoning: string;

    if (currentPace > effectiveConstraints.pauseThreshold) {
      // Overpacing - reduce bids
      const pacingFactor = Math.min(currentPace / effectiveConstraints.pauseThreshold, 2.0);
      bidMultiplier = Math.max(
        state.currentBidMultiplier / pacingFactor,
        effectiveConstraints.minBidMultiplier
      );
      action = 'decrease_bids';
      reasoning = `Overpacing at ${(currentPace * 100).toFixed(1)}% - reducing bids`;
    } else if (currentPace < effectiveConstraints.resumeThreshold) {
      // Underpacing - increase bids if Thompson Sampling suggests value
      if (samplingResult.expectedValue > 0 && isExplorationMode) {
        const pacingFactor = Math.max(effectiveConstraints.resumeThreshold / currentPace, 0.5);
        bidMultiplier = Math.min(
          state.currentBidMultiplier * pacingFactor,
          effectiveConstraints.maxBidMultiplier
        );
        action = 'increase_bids';
        reasoning = `Underpacing at ${(currentPace * 100).toFixed(1)}% with positive Thompson sampling signal`;
      } else {
        bidMultiplier = state.currentBidMultiplier;
        action = 'maintain';
        reasoning = `Underpacing but Thompson sampling suggests caution or low confidence`;
      }
    } else {
      // On pace - maintain or slight adjustments based on Thompson Sampling
      if (samplingResult.confidence > 0.8 && samplingResult.expectedValue > state.expectedValuePerClick * 1.1) {
        bidMultiplier = Math.min(
          state.currentBidMultiplier * 1.05,
          effectiveConstraints.maxBidMultiplier
        );
        action = 'increase_bids';
        reasoning = `On pace with high-confidence positive signal from Thompson sampling`;
      } else {
        bidMultiplier = state.currentBidMultiplier;
        action = 'maintain';
        reasoning = `On pace - maintaining current bids`;
      }
    }

    // Ensure bid multiplier is within constraints
    bidMultiplier = Math.max(
      effectiveConstraints.minBidMultiplier,
      Math.min(bidMultiplier, effectiveConstraints.maxBidMultiplier)
    );

    // Calculate expected impact
    const bidChange = bidMultiplier / state.currentBidMultiplier;
    const expectedImpact = {
      spendChange: samplingResult.expectedSpendChange * bidChange,
      conversionChange: samplingResult.expectedConversions * bidChange,
      revenueChange: samplingResult.expectedRevenue * bidChange
    };

    // Update pacing state
    await this.updatePacingState(campaignId, {
      currentSpendMicros,
      paceTarget: currentPace,
      lastSampleTimestamp: new Date().toISOString(),
      lastSampledArm: samplingResult.selectedArm,
      expectedValuePerClick: samplingResult.expectedValue,
      confidenceInEstimate: samplingResult.confidence,
      currentBidMultiplier: bidMultiplier
    });

    const decision: PacingDecision = {
      campaignId,
      action,
      bidMultiplier,
      reasoning,
      confidence: samplingResult.confidence,
      expectedImpact,
      sampledArm: samplingResult.selectedArm,
      explorationMode: isExplorationMode
    };

    logger.info(`📊 Pacing decision for campaign ${campaignId}`, {
      decision,
      currentPace: currentPace.toFixed(3),
      currentSpend: currentSpendMicros,
      budget: state.dailyBudgetMicros,
      hoursIntoDay
    });

    return decision;
  }

  /**
   * Get Thompson Sampling recommendation for pacing decisions
   */
  private async getThompsonSamplingRecommendation(
    campaignId: string,
    state: PacingControllerState
  ): Promise<{
    selectedArm: string;
    expectedValue: number;
    confidence: number;
    expectedSpendChange: number;
    expectedConversions: number;
    expectedRevenue: number;
  }> {
    try {
      // Create dummy arms for current campaign state
      const arms = [{
        id: `campaign_${campaignId}`,
        name: `Campaign ${campaignId}`,
        type: 'campaign' as const,
        metrics30d: {
          spend: 1000,
          clicks: 100,
          conversions: 10,
          revenue: 1000,
          impressions: 10000,
          cpc: 10,
          cpm: 100,
          ctr: 0.01,
          cvr: 0.1,
          roas: 1.0
        }
      }];

      // Get Thompson Sampling allocation recommendation
      const allocation = await this.thompsonSampling.allocateBudgetLagAware(
        arms,
        state.dailyBudgetMicros / 1000000, // Convert to currency units
        {
          minDailyBudget: state.dailyBudgetMicros * 0.1 / 1000000,
          maxDailyBudget: state.dailyBudgetMicros / 1000000,
          riskTolerance: 0.1
        }
      );

      if (allocation.length === 0) {
        return {
          selectedArm: `campaign_${campaignId}`,
          expectedValue: 0,
          confidence: 0,
          expectedSpendChange: 0,
          expectedConversions: 0,
          expectedRevenue: 0
        };
      }

      const result = allocation[0];
      return {
        selectedArm: result.armId,
        expectedValue: result.expectedImprovement,
        confidence: result.confidenceInterval[1] - result.confidenceInterval[0], // Use confidence interval width
        expectedSpendChange: result.proposedDailyBudget * 1000000, // Convert back to micros
        expectedConversions: result.expectedImprovement * 100, // Estimate conversions
        expectedRevenue: result.expectedImprovement * 1000 // Estimate revenue
      };
    } catch (error) {
      logger.warn(`Failed to get Thompson sampling recommendation for ${campaignId}:`, error);
      return {
        selectedArm: `campaign_${campaignId}`,
        expectedValue: 0,
        confidence: 0,
        expectedSpendChange: 0,
        expectedConversions: 0,
        expectedRevenue: 0
      };
    }
  }

  /**
   * Get current pacing state for a campaign
   */
  async getPacingState(campaignId: string): Promise<PacingControllerState | null> {
    const row = this.db.get<any>(`
      SELECT * FROM pacing_controller_state
      WHERE campaign_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [campaignId]);

    if (!row) return null;

    return {
      controllerId: row.controller_id,
      campaignId: row.campaign_id,
      dailyBudgetMicros: row.daily_budget_micros,
      currentSpendMicros: row.current_spend_micros,
      paceTarget: row.pace_target,
      lastSampleTimestamp: row.last_sample_timestamp,
      lastSampledArm: row.last_sampled_arm,
      expectedValuePerClick: row.expected_value_per_click,
      confidenceInEstimate: row.confidence_in_estimate,
      currentBidMultiplier: row.current_bid_multiplier,
      spendRateLimit: row.spend_rate_limit,
      explorationBudgetFraction: row.exploration_budget_fraction,
      exploitationConfidenceThreshold: row.exploitation_confidence_threshold,
      maxBidAdjustment: row.max_bid_adjustment,
      decisionFrequencyMinutes: row.decision_frequency_minutes,
      updatedAt: row.updated_at,
      createdAt: row.created_at
    };
  }

  /**
   * Update pacing state
   */
  private async updatePacingState(
    campaignId: string,
    updates: Partial<PacingControllerState>
  ): Promise<void> {
    const updateFields = Object.keys(updates).map(key =>
      `${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = ?`
    ).join(', ');

    const updateValues = Object.values(updates);
    updateValues.push(new Date().toISOString()); // updated_at
    updateValues.push(campaignId);

    this.db.run(`
      UPDATE pacing_controller_state
      SET ${updateFields}, updated_at = ?
      WHERE campaign_id = ?
    `, updateValues);
  }

  /**
   * Get pacing performance metrics
   */
  async getPacingMetrics(campaignId: string, days: number = 7): Promise<{
    avgPaceTarget: number;
    paceVariance: number;
    decisionCount: number;
    avgBidMultiplier: number;
    budgetUtilization: number;
    explorationRate: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = this.db.get<any>(`
      SELECT
        AVG(pace_target) as avg_pace_target,
        AVG((pace_target - 1.0) * (pace_target - 1.0)) as pace_variance,
        COUNT(*) as decision_count,
        AVG(current_bid_multiplier) as avg_bid_multiplier,
        AVG(current_spend_micros * 1.0 / daily_budget_micros) as budget_utilization,
        AVG(CASE WHEN confidence_in_estimate < exploitation_confidence_threshold THEN 1.0 ELSE 0.0 END) as exploration_rate
      FROM pacing_controller_state
      WHERE campaign_id = ? AND updated_at >= ?
    `, [campaignId, cutoffDate.toISOString()]);

    return {
      avgPaceTarget: metrics?.avg_pace_target || 0,
      paceVariance: metrics?.pace_variance || 0,
      decisionCount: metrics?.decision_count || 0,
      avgBidMultiplier: metrics?.avg_bid_multiplier || 1.0,
      budgetUtilization: metrics?.budget_utilization || 0,
      explorationRate: metrics?.exploration_rate || 0
    };
  }

  /**
   * Clean up old pacing states (keep last 30 days)
   */
  async cleanupOldStates(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const result = this.db.run(`
      DELETE FROM pacing_controller_state
      WHERE updated_at < ?
    `, [cutoffDate.toISOString()]);

    logger.info(`🧹 Cleaned up ${result.changes} old pacing controller states`);
    return result.changes || 0;
  }

  /**
   * Get all active pacing controllers
   */
  async getActivePacingControllers(): Promise<PacingControllerState[]> {
    const rows = this.db.all<any>(`
      SELECT DISTINCT campaign_id,
        FIRST_VALUE(controller_id) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as controller_id,
        FIRST_VALUE(daily_budget_micros) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as daily_budget_micros,
        FIRST_VALUE(current_spend_micros) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as current_spend_micros,
        FIRST_VALUE(pace_target) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as pace_target,
        FIRST_VALUE(last_sample_timestamp) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as last_sample_timestamp,
        FIRST_VALUE(last_sampled_arm) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as last_sampled_arm,
        FIRST_VALUE(expected_value_per_click) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as expected_value_per_click,
        FIRST_VALUE(confidence_in_estimate) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as confidence_in_estimate,
        FIRST_VALUE(current_bid_multiplier) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as current_bid_multiplier,
        FIRST_VALUE(spend_rate_limit) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as spend_rate_limit,
        FIRST_VALUE(exploration_budget_fraction) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as exploration_budget_fraction,
        FIRST_VALUE(exploitation_confidence_threshold) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as exploitation_confidence_threshold,
        FIRST_VALUE(max_bid_adjustment) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as max_bid_adjustment,
        FIRST_VALUE(decision_frequency_minutes) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as decision_frequency_minutes,
        FIRST_VALUE(updated_at) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as updated_at,
        FIRST_VALUE(created_at) OVER (PARTITION BY campaign_id ORDER BY created_at DESC) as created_at
      FROM pacing_controller_state
      WHERE updated_at >= datetime('now', '-1 day')
    `);

    return rows.map(row => ({
      controllerId: row.controller_id,
      campaignId: row.campaign_id,
      dailyBudgetMicros: row.daily_budget_micros,
      currentSpendMicros: row.current_spend_micros,
      paceTarget: row.pace_target,
      lastSampleTimestamp: row.last_sample_timestamp,
      lastSampledArm: row.last_sampled_arm,
      expectedValuePerClick: row.expected_value_per_click,
      confidenceInEstimate: row.confidence_in_estimate,
      currentBidMultiplier: row.current_bid_multiplier,
      spendRateLimit: row.spend_rate_limit,
      explorationBudgetFraction: row.exploration_budget_fraction,
      exploitationConfidenceThreshold: row.exploitation_confidence_threshold,
      maxBidAdjustment: row.max_bid_adjustment,
      decisionFrequencyMinutes: row.decision_frequency_minutes,
      updatedAt: row.updated_at,
      createdAt: row.created_at
    }));
  }
}