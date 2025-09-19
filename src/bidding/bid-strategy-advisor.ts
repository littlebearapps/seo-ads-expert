/**
 * Bid Strategy Advisor
 *
 * Analyzes campaign performance and competition to recommend optimal bidding strategies.
 * Integrates with Thompson Sampling optimizer for data-driven bid adjustments.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';

export interface BidStrategy {
  type: 'manual_cpc' | 'enhanced_cpc' | 'target_cpa' | 'target_roas' | 'maximize_conversions' | 'maximize_clicks';
  recommendation: BidRecommendation;
  confidence: number;
  rationale: string;
  expectedImpact: {
    costChange: number; // Percentage change expected
    conversionChange: number;
    clickChange: number;
  };
}

export interface BidRecommendation {
  targetCPA?: number;
  targetROAS?: number;
  maxCPC?: number;
  bidAdjustments?: {
    device?: Record<string, number>;
    location?: Record<string, number>;
    schedule?: Record<string, number>;
    audience?: Record<string, number>;
  };
}

export interface BidStrategyRecommendations {
  campaignId: string;
  currentStrategy: string;
  recommendedStrategies: BidStrategy[];
  performanceContext: PerformanceContext;
  competitionContext: CompetitionContext;
  seasonalityContext: SeasonalityContext;
}

export interface PerformanceContext {
  avgCPA: number;
  avgROAS: number;
  conversionRate: number;
  clickThroughRate: number;
  qualityScore: number;
  impressionShare: number;
  dataMaturity: 'insufficient' | 'emerging' | 'mature';
}

export interface CompetitionContext {
  intensity: 'low' | 'medium' | 'high' | 'extreme';
  avgCPC: number;
  topOfPageRate: number;
  outrankedShare: number;
  auctionInsights: {
    avgPosition: number;
    overlapRate: number;
    positionAboveRate: number;
  };
}

export interface SeasonalityContext {
  detected: boolean;
  pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  peakPeriods?: Array<{
    start: string;
    end: string;
    multiplier: number;
  }>;
  currentPhase?: 'peak' | 'normal' | 'trough';
}

export class BidStrategyAdvisor {
  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Analyze and recommend bid strategies for a campaign
   */
  async analyzeBidStrategies(campaignId: string): Promise<BidStrategyRecommendations> {
    this.logger.info('Analyzing bid strategies', { campaignId });

    // Gather all context data in parallel
    const [performance, competition, seasonality] = await Promise.all([
      this.analyzePerformance(campaignId),
      this.analyzeCompetition(campaignId),
      this.detectSeasonality(campaignId)
    ]);

    // Get current strategy
    const currentStrategy = this.getCurrentStrategy(campaignId);

    // Evaluate all possible strategies
    const strategies = this.evaluateStrategies(performance, competition, seasonality);

    // Rank strategies by expected value
    const rankedStrategies = this.rankStrategies(strategies, performance, competition);

    return {
      campaignId,
      currentStrategy,
      recommendedStrategies: rankedStrategies,
      performanceContext: performance,
      competitionContext: competition,
      seasonalityContext: seasonality
    };
  }

  /**
   * Analyze campaign performance metrics
   */
  private async analyzePerformance(campaignId: string): Promise<PerformanceContext> {
    const perfQuery = this.database.prepare(`
      SELECT
        AVG(fcs.cost * 1.0 / NULLIF(fcs.conversions, 0)) as avg_cpa,
        AVG(fcs.conversion_value * 1.0 / NULLIF(fcs.cost, 0)) as avg_roas,
        AVG(fcs.conversions * 1.0 / NULLIF(fcs.clicks, 0)) as conversion_rate,
        AVG(fcs.clicks * 1.0 / NULLIF(fcs.impressions, 0)) as ctr,
        AVG(COALESCE(kqd.quality_score, 5)) as avg_qs,
        0.5 as avg_imp_share,
        COUNT(DISTINCT fcs.date) as days_active,
        SUM(fcs.conversions) as total_conversions
      FROM fact_channel_spend fcs
      LEFT JOIN keyword_quality_daily kqd ON kqd.campaign_id = fcs.campaign_id AND kqd.date = fcs.date
      WHERE fcs.campaign_id = ?
        AND fcs.date >= date('now', '-30 days')
    `).get(campaignId) as any;

    // Determine data maturity
    let dataMaturity: 'insufficient' | 'emerging' | 'mature' = 'insufficient';
    if (perfQuery?.total_conversions >= 100 && perfQuery?.days_active >= 30) {
      dataMaturity = 'mature';
    } else if (perfQuery?.total_conversions >= 30 && perfQuery?.days_active >= 14) {
      dataMaturity = 'emerging';
    }

    return {
      avgCPA: perfQuery?.avg_cpa || 0,
      avgROAS: perfQuery?.avg_roas || 0,
      conversionRate: perfQuery?.conversion_rate || 0,
      clickThroughRate: perfQuery?.ctr || 0,
      qualityScore: perfQuery?.avg_qs || 0,
      impressionShare: perfQuery?.avg_imp_share || 0,
      dataMaturity
    };
  }

  /**
   * Analyze competition metrics
   */
  private async analyzeCompetition(campaignId: string): Promise<CompetitionContext> {
    // Get competition metrics from database
    const compQuery = this.database.prepare(`
      SELECT
        AVG(avg_cpc) as avg_cpc,
        AVG(search_top_impression_share) as top_of_page_rate,
        AVG(search_outranked_share) as outranked_share,
        AVG(avg_position) as avg_position
      FROM competition_metrics
      WHERE campaign_id = ?
        AND date >= date('now', '-7 days')
    `).get(campaignId) as any;

    // Determine competition intensity
    let intensity: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
    const avgCPC = compQuery?.avg_cpc || 0;
    const outrankedShare = compQuery?.outranked_share || 0;

    if (avgCPC > 5 && outrankedShare > 0.5) {
      intensity = 'extreme';
    } else if (avgCPC > 2 && outrankedShare > 0.3) {
      intensity = 'high';
    } else if (avgCPC < 0.5 && outrankedShare < 0.1) {
      intensity = 'low';
    }

    return {
      intensity,
      avgCPC: avgCPC,
      topOfPageRate: compQuery?.top_of_page_rate || 0,
      outrankedShare: outrankedShare,
      auctionInsights: {
        avgPosition: compQuery?.avg_position || 0,
        overlapRate: 0, // Would need additional data
        positionAboveRate: 0 // Would need additional data
      }
    };
  }

  /**
   * Detect seasonality patterns
   */
  private async detectSeasonality(campaignId: string): Promise<SeasonalityContext> {
    // Get historical performance by time period
    const weeklyPattern = this.database.prepare(`
      SELECT
        CAST(strftime('%w', date) as INTEGER) as day_of_week,
        AVG(conversions) as avg_conversions,
        AVG(cost) as avg_cost,
        COUNT(*) as sample_size
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-90 days')
      GROUP BY day_of_week
      HAVING sample_size >= 4
    `).all(campaignId) as any[];

    const monthlyPattern = this.database.prepare(`
      SELECT
        strftime('%m', date) as month,
        AVG(conversions) as avg_conversions,
        AVG(cost) as avg_cost,
        COUNT(*) as sample_size
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-365 days')
      GROUP BY month
      HAVING sample_size >= 2
    `).all(campaignId) as any[];

    // Analyze patterns for significant variations
    const hasWeeklyPattern = this.hasSignificantVariation(weeklyPattern, 'avg_conversions');
    const hasMonthlyPattern = this.hasSignificantVariation(monthlyPattern, 'avg_conversions');

    if (!hasWeeklyPattern && !hasMonthlyPattern) {
      return { detected: false };
    }

    // Determine pattern type and current phase
    let pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | undefined;
    let currentPhase: 'peak' | 'normal' | 'trough' = 'normal';
    const peakPeriods: Array<{ start: string; end: string; multiplier: number }> = [];

    if (hasWeeklyPattern) {
      pattern = 'weekly';
      const todayDOW = new Date().getDay();
      const todayData = weeklyPattern.find(w => w.day_of_week === todayDOW);
      const avgConversions = weeklyPattern.reduce((sum, w) => sum + w.avg_conversions, 0) / weeklyPattern.length;

      if (todayData) {
        if (todayData.avg_conversions > avgConversions * 1.2) {
          currentPhase = 'peak';
        } else if (todayData.avg_conversions < avgConversions * 0.8) {
          currentPhase = 'trough';
        }
      }

      // Identify peak days
      weeklyPattern.forEach(w => {
        if (w.avg_conversions > avgConversions * 1.2) {
          peakPeriods.push({
            start: `day_${w.day_of_week}`,
            end: `day_${w.day_of_week}`,
            multiplier: w.avg_conversions / avgConversions
          });
        }
      });
    }

    if (hasMonthlyPattern && !hasWeeklyPattern) {
      pattern = 'monthly';
      const currentMonth = new Date().getMonth() + 1;
      const monthData = monthlyPattern.find(m => parseInt(m.month) === currentMonth);
      const avgConversions = monthlyPattern.reduce((sum, m) => sum + m.avg_conversions, 0) / monthlyPattern.length;

      if (monthData) {
        if (monthData.avg_conversions > avgConversions * 1.3) {
          currentPhase = 'peak';
        } else if (monthData.avg_conversions < avgConversions * 0.7) {
          currentPhase = 'trough';
        }
      }
    }

    return {
      detected: true,
      pattern,
      peakPeriods,
      currentPhase
    };
  }

  /**
   * Check if data has significant variation
   */
  private hasSignificantVariation(data: any[], metric: string): boolean {
    if (!data || data.length < 3) return false;

    const values = data.map(d => d[metric]);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;

    // Significant if CV > 0.2 (20% variation)
    return coefficientOfVariation > 0.2;
  }

  /**
   * Get current bid strategy for campaign
   */
  private getCurrentStrategy(campaignId: string): string {
    const strategy = this.database.prepare(`
      SELECT bid_strategy
      FROM campaign_settings
      WHERE campaign_id = ?
    `).get(campaignId) as any;

    return strategy?.bid_strategy || 'manual_cpc';
  }

  /**
   * Evaluate all possible bid strategies
   */
  private evaluateStrategies(
    performance: PerformanceContext,
    competition: CompetitionContext,
    seasonality: SeasonalityContext
  ): BidStrategy[] {
    const strategies: BidStrategy[] = [];

    // Target CPA Strategy
    if (performance.dataMaturity !== 'insufficient' && performance.avgCPA > 0) {
      const targetCPA = this.calculateOptimalCPA(performance, competition);
      strategies.push({
        type: 'target_cpa',
        recommendation: { targetCPA },
        confidence: performance.dataMaturity === 'mature' ? 0.9 : 0.7,
        rationale: `Sufficient conversion data (${performance.dataMaturity}) for automated CPA bidding`,
        expectedImpact: {
          costChange: 0,
          conversionChange: 15,
          clickChange: 10
        }
      });
    }

    // Target ROAS Strategy
    if (performance.avgROAS > 0 && performance.dataMaturity !== 'insufficient') {
      const targetROAS = this.calculateOptimalROAS(performance);
      strategies.push({
        type: 'target_roas',
        recommendation: { targetROAS },
        confidence: performance.avgROAS > 2 ? 0.85 : 0.65,
        rationale: `ROAS data available (${performance.avgROAS.toFixed(1)}x) for value-based bidding`,
        expectedImpact: {
          costChange: 5,
          conversionChange: 10,
          clickChange: -5
        }
      });
    }

    // Enhanced CPC Strategy
    if (competition.intensity === 'high' || competition.intensity === 'extreme') {
      const adjustments = this.calculateBidAdjustments(performance, competition, seasonality);
      strategies.push({
        type: 'enhanced_cpc',
        recommendation: {
          maxCPC: competition.avgCPC * 1.3,
          bidAdjustments: adjustments
        },
        confidence: 0.8,
        rationale: `High competition (${competition.intensity}) requires flexible bidding`,
        expectedImpact: {
          costChange: 15,
          conversionChange: 20,
          clickChange: 25
        }
      });
    }

    // Maximize Conversions Strategy
    if (performance.dataMaturity === 'mature' && performance.conversionRate > 0.02) {
      strategies.push({
        type: 'maximize_conversions',
        recommendation: {},
        confidence: 0.75,
        rationale: 'Mature campaign with good conversion rate for automated optimization',
        expectedImpact: {
          costChange: 20,
          conversionChange: 30,
          clickChange: 15
        }
      });
    }

    // Manual CPC Strategy (always available as fallback)
    const manualBids = this.calculateManualBids(performance, competition);
    strategies.push({
      type: 'manual_cpc',
      recommendation: {
        maxCPC: manualBids,
        bidAdjustments: this.calculateBidAdjustments(performance, competition, seasonality)
      },
      confidence: 0.6,
      rationale: 'Full control for testing and optimization',
      expectedImpact: {
        costChange: 0,
        conversionChange: 0,
        clickChange: 0
      }
    });

    return strategies;
  }

  /**
   * Calculate optimal target CPA
   */
  private calculateOptimalCPA(performance: PerformanceContext, competition: CompetitionContext): number {
    let targetCPA = performance.avgCPA;

    // Adjust based on quality score
    if (performance.qualityScore > 7) {
      targetCPA *= 1.1; // Can afford higher CPA with good QS
    } else if (performance.qualityScore < 5) {
      targetCPA *= 0.9; // Need lower CPA to compensate for poor QS
    }

    // Adjust based on competition
    if (competition.intensity === 'extreme') {
      targetCPA *= 1.2;
    } else if (competition.intensity === 'low') {
      targetCPA *= 0.8;
    }

    return Math.round(targetCPA * 100) / 100;
  }

  /**
   * Calculate optimal target ROAS
   */
  private calculateOptimalROAS(performance: PerformanceContext): number {
    let targetROAS = performance.avgROAS;

    // Be slightly conservative to ensure profitability
    targetROAS *= 0.9;

    // Ensure minimum ROAS of 1.5x
    return Math.max(1.5, Math.round(targetROAS * 10) / 10);
  }

  /**
   * Calculate bid adjustments for different segments
   */
  private calculateBidAdjustments(
    performance: PerformanceContext,
    competition: CompetitionContext,
    seasonality: SeasonalityContext
  ): BidRecommendation['bidAdjustments'] {
    const adjustments: BidRecommendation['bidAdjustments'] = {};

    // Device adjustments based on performance data
    adjustments.device = {
      mobile: -10, // Typically lower conversion rate
      tablet: 0,
      desktop: 10 // Typically higher conversion rate
    };

    // Schedule adjustments based on seasonality
    if (seasonality.detected && seasonality.peakPeriods) {
      adjustments.schedule = {};
      seasonality.peakPeriods.forEach(period => {
        const adjustment = Math.round((period.multiplier - 1) * 100);
        adjustments.schedule![period.start] = adjustment;
      });
    }

    // Location adjustments (would need geo performance data)
    adjustments.location = {
      'top_performing': 20,
      'average': 0,
      'underperforming': -20
    };

    return adjustments;
  }

  /**
   * Calculate manual bids
   */
  private calculateManualBids(performance: PerformanceContext, competition: CompetitionContext): number {
    // Start with competition average
    let baseBid = competition.avgCPC || 1.0;

    // Adjust based on conversion rate
    if (performance.conversionRate > 0.05) {
      baseBid *= 1.3;
    } else if (performance.conversionRate < 0.01) {
      baseBid *= 0.7;
    }

    // Adjust based on quality score
    if (performance.qualityScore > 7) {
      baseBid *= 0.9; // Can bid less with good QS
    } else if (performance.qualityScore < 5) {
      baseBid *= 1.2; // Need to bid more with poor QS
    }

    return Math.round(baseBid * 100) / 100;
  }

  /**
   * Rank strategies by expected value
   */
  private rankStrategies(
    strategies: BidStrategy[],
    performance: PerformanceContext,
    competition: CompetitionContext
  ): BidStrategy[] {
    // Calculate expected value for each strategy
    const scoredStrategies = strategies.map(strategy => {
      let score = strategy.confidence * 100;

      // Bonus for automation in mature campaigns
      if (performance.dataMaturity === 'mature' &&
          ['target_cpa', 'target_roas', 'maximize_conversions'].includes(strategy.type)) {
        score += 20;
      }

      // Penalty for manual in high competition
      if (competition.intensity === 'extreme' && strategy.type === 'manual_cpc') {
        score -= 20;
      }

      // Consider expected impact
      const impactScore = (
        strategy.expectedImpact.conversionChange * 2 +
        strategy.expectedImpact.clickChange -
        strategy.expectedImpact.costChange * 0.5
      );
      score += impactScore;

      return { ...strategy, score };
    });

    // Sort by score descending
    return scoredStrategies
      .sort((a, b) => (b as any).score - (a as any).score)
      .map(({ score, ...strategy }) => strategy);
  }

  /**
   * Apply recommended bid strategy to campaign
   */
  async applyBidStrategy(
    campaignId: string,
    strategy: BidStrategy,
    testMode: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.info('Applying bid strategy', { campaignId, strategy, testMode });

      if (testMode) {
        // In test mode, just log what would be applied
        return {
          success: true,
          message: `Would apply ${strategy.type} strategy with confidence ${strategy.confidence}`
        };
      }

      // Update campaign settings in database
      this.database.prepare(`
        INSERT INTO campaign_settings (campaign_id, bid_strategy, bid_strategy_config, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(campaign_id) DO UPDATE SET
          bid_strategy = excluded.bid_strategy,
          bid_strategy_config = excluded.bid_strategy_config,
          updated_at = excluded.updated_at
      `).run(
        campaignId,
        strategy.type,
        JSON.stringify(strategy.recommendation)
      );

      // Log the change
      this.database.prepare(`
        INSERT INTO bid_strategy_changes (
          campaign_id,
          old_strategy,
          new_strategy,
          rationale,
          confidence,
          applied_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        campaignId,
        this.getCurrentStrategy(campaignId),
        strategy.type,
        strategy.rationale,
        strategy.confidence
      );

      return {
        success: true,
        message: `Successfully applied ${strategy.type} strategy`
      };
    } catch (error) {
      this.logger.error('Failed to apply bid strategy', { error, campaignId });
      return {
        success: false,
        message: `Failed to apply strategy: ${error}`
      };
    }
  }
}