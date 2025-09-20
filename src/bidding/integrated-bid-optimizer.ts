/**
 * Integrated Bid Optimizer
 *
 * Combines Thompson Sampling budget optimization with intelligent bid strategies.
 * Orchestrates all bidding components for comprehensive optimization.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';
import { BidStrategyAdvisor } from './bid-strategy-advisor.js';
import { CompetitionAnalyzer } from './competition-analyzer.js';
import { SeasonalityDetector } from './seasonality-detector.js';
import { BidAdjustmentCalculator } from './bid-adjustment-calculator.js';
import { ThompsonSamplingOptimizer } from '../optimization/thompson-sampling.js';
import { EventEmitter } from 'events';

export interface IntegratedOptimizationResult {
  budgetAllocations: Array<{
    campaignId: string;
    currentBudget: number;
    recommendedBudget: number;
    confidence: number;
  }>;
  bidStrategies: Array<{
    campaignId: string;
    currentStrategy: string;
    recommendedStrategy: string;
    confidence: number;
  }>;
  bidAdjustments: Array<{
    campaignId: string;
    dimension: string;
    adjustments: Array<{
      segment: string;
      modifier: number;
      confidence: number;
    }>;
  }>;
  seasonalFactors: {
    currentPhase: string;
    upcomingEvents: string[];
    budgetMultiplier: number;
  };
  competitiveInsights: {
    marketIntensity: string;
    recommendedApproach: string;
    bidWarDetected: boolean;
  };
  totalExpectedImpact: {
    impressionChange: number;
    clickChange: number;
    conversionChange: number;
    costChange: number;
    roasChange: number;
  };
  implementationPlan: {
    immediate: string[];
    shortTerm: string[];
    monitoring: string[];
  };
}

export interface OptimizationConfig {
  objective: 'maximize_conversions' | 'target_cpa' | 'target_roas' | 'balanced';
  constraints: {
    totalBudget: number;
    maxBudgetChange: number;
    targetCPA?: number;
    targetROAS?: number;
  };
  riskTolerance: number; // 0-1, affects exploration vs exploitation
  timeHorizon: number; // Days to optimize for
  includeSeasonality: boolean;
  includeCompetition: boolean;
}

export class IntegratedBidOptimizer extends EventEmitter {
  private bidStrategyAdvisor: BidStrategyAdvisor;
  private competitionAnalyzer: CompetitionAnalyzer;
  private seasonalityDetector: SeasonalityDetector;
  private bidAdjustmentCalculator: BidAdjustmentCalculator;
  private thompsonOptimizer: ThompsonSamplingOptimizer;

  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {
    super();

    // Initialize all components
    this.bidStrategyAdvisor = new BidStrategyAdvisor(database, logger);
    this.competitionAnalyzer = new CompetitionAnalyzer(database, logger);
    this.seasonalityDetector = new SeasonalityDetector(database, logger);
    this.bidAdjustmentCalculator = new BidAdjustmentCalculator(database, logger);
    this.thompsonOptimizer = new ThompsonSamplingOptimizer(logger);
  }

  /**
   * Perform comprehensive bid and budget optimization
   */
  async optimizeBidding(
    campaignIds: string[],
    config: OptimizationConfig
  ): Promise<IntegratedOptimizationResult> {
    this.logger.info('Starting integrated bid optimization', { campaignIds, config });
    this.emit('optimization:started', { campaignIds, config });

    try {
      // Gather all data in parallel
      const [
        budgetData,
        strategyData,
        competitionData,
        seasonalityData
      ] = await Promise.all([
        this.gatherBudgetData(campaignIds),
        this.gatherStrategyData(campaignIds),
        this.analyzeCompetitiveEnvironment(campaignIds),
        this.analyzeSeasonality(campaignIds, config)
      ]);

      // Phase 1: Optimize budget allocation with Thompson Sampling
      const budgetAllocations = await this.optimizeBudgetAllocation(
        budgetData,
        config,
        seasonalityData.multiplier
      );

      // Phase 2: Recommend bid strategies based on budget and competition
      const bidStrategies = await this.recommendBidStrategies(
        campaignIds,
        budgetAllocations,
        competitionData,
        config
      );

      // Phase 3: Calculate bid adjustments for each dimension
      const bidAdjustments = await this.calculateAllBidAdjustments(
        campaignIds,
        bidStrategies,
        config
      );

      // Calculate total expected impact
      const totalExpectedImpact = this.calculateTotalExpectedImpact(
        budgetAllocations,
        bidStrategies,
        bidAdjustments
      );

      // Generate implementation plan
      const implementationPlan = this.generateImplementationPlan(
        budgetAllocations,
        bidStrategies,
        bidAdjustments,
        competitionData,
        seasonalityData
      );

      const result: IntegratedOptimizationResult = {
        budgetAllocations,
        bidStrategies,
        bidAdjustments,
        seasonalFactors: {
          currentPhase: seasonalityData.currentPhase,
          upcomingEvents: seasonalityData.upcomingEvents,
          budgetMultiplier: seasonalityData.multiplier
        },
        competitiveInsights: {
          marketIntensity: competitionData.intensity,
          recommendedApproach: competitionData.approach,
          bidWarDetected: competitionData.bidWarDetected
        },
        totalExpectedImpact,
        implementationPlan
      };

      this.emit('optimization:completed', result);
      return result;
    } catch (error) {
      this.logger.error('Integrated optimization failed', { error });
      this.emit('optimization:failed', { error });
      throw error;
    }
  }

  /**
   * Gather budget and performance data for Thompson Sampling
   */
  private async gatherBudgetData(campaignIds: string[]): Promise<any[]> {
    const arms = [];

    for (const campaignId of campaignIds) {
      const perfData = this.database.prepare(`
        SELECT
          campaign_id,
          SUM(cost) as total_cost,
          SUM(conversions) as total_conversions,
          SUM(conversion_value) as total_value,
          SUM(clicks) as total_clicks,
          COUNT(DISTINCT date) as days_active,
          AVG(cost) as daily_budget
        FROM fact_channel_spend
        WHERE campaign_id = ?
          AND date >= date('now', '-30 days')
        GROUP BY campaign_id
      `).get(campaignId) as any;

      if (perfData) {
        arms.push({
          id: campaignId,
          name: `Campaign ${campaignId}`,
          type: 'campaign' as const,
          alpha: Math.max(1, perfData.total_conversions || 0), // Successes
          beta: Math.max(1, perfData.total_clicks - perfData.total_conversions || 0), // Failures
          shape: Math.max(1, perfData.total_conversions || 0), // For Gamma
          scale: perfData.total_conversions > 0 ?
            perfData.total_value / perfData.total_conversions : 1,
          currentBudget: perfData.daily_budget || 10,
          currentDailyBudget: perfData.daily_budget || 10,
          metrics30d: {
            conversions: perfData.total_conversions || 0,
            clicks: perfData.total_clicks || 0,
            revenue: perfData.total_value || 0,
            spend: perfData.total_cost || 0,
            impressions: perfData.total_clicks * 20 || 0, // Estimate if not available
            qualityScore: 7 // Default quality score if not available
          },
          historicalPerformance: {
            conversions: perfData.total_conversions,
            value: perfData.total_value,
            cost: perfData.total_cost,
            clicks: perfData.total_clicks
          }
        });
      }
    }

    return arms;
  }

  /**
   * Gather current bid strategy data
   */
  private async gatherStrategyData(campaignIds: string[]): Promise<any[]> {
    const strategies = [];

    for (const campaignId of campaignIds) {
      const strategy = await this.bidStrategyAdvisor.analyzeBidStrategies(campaignId);
      strategies.push(strategy);
    }

    return strategies;
  }

  /**
   * Analyze competitive environment
   */
  private async analyzeCompetitiveEnvironment(campaignIds: string[]): Promise<any> {
    // Aggregate competition across all campaigns
    let totalIntensity = 0;
    let bidWarsDetected = false;
    const approaches = [];

    for (const campaignId of campaignIds) {
      const competition = await this.competitionAnalyzer.analyzeCompetition(campaignId);
      const bidWar = await this.competitionAnalyzer.detectBidWars(campaignId);

      // Convert intensity to numeric score
      const intensityScore = {
        'low': 1,
        'medium': 2,
        'high': 3,
        'extreme': 4
      }[competition.marketDynamics.intensity];

      totalIntensity += intensityScore;
      bidWarsDetected = bidWarsDetected || bidWar.detected;
      approaches.push(...competition.position.recommendations);
    }

    const avgIntensity = totalIntensity / campaignIds.length;
    const intensity = avgIntensity <= 1.5 ? 'low' :
                     avgIntensity <= 2.5 ? 'medium' :
                     avgIntensity <= 3.5 ? 'high' : 'extreme';

    // Determine recommended approach based on intensity
    let approach = 'balanced';
    if (intensity === 'extreme' || bidWarsDetected) {
      approach = 'defensive - focus on efficiency and avoid bid wars';
    } else if (intensity === 'high') {
      approach = 'selective aggression - compete for high-value segments';
    } else if (intensity === 'low') {
      approach = 'growth-focused - opportunity to gain market share';
    }

    return {
      intensity,
      approach,
      bidWarDetected: bidWarsDetected,
      topRecommendations: approaches.slice(0, 3)
    };
  }

  /**
   * Analyze seasonality patterns
   */
  private async analyzeSeasonality(
    campaignIds: string[],
    config: OptimizationConfig
  ): Promise<any> {
    if (!config.includeSeasonality) {
      return {
        currentPhase: 'normal',
        upcomingEvents: [],
        multiplier: 1.0
      };
    }

    // Aggregate seasonality across campaigns
    const allPatterns = [];
    const allEvents = [];
    let totalMultiplier = 0;

    for (const campaignId of campaignIds) {
      const seasonality = await this.seasonalityDetector.detectSeasonality(
        campaignId,
        config.timeHorizon
      );

      allPatterns.push(...seasonality.patterns);
      allEvents.push(...seasonality.events);

      // Calculate current multiplier
      const forecast = seasonality.forecast[0];
      if (forecast) {
        totalMultiplier += forecast.seasonalMultiplier;
      } else {
        totalMultiplier += 1;
      }
    }

    const avgMultiplier = totalMultiplier / campaignIds.length;

    // Determine current phase
    let currentPhase = 'normal';
    if (avgMultiplier > 1.3) currentPhase = 'peak';
    else if (avgMultiplier > 1.1) currentPhase = 'rising';
    else if (avgMultiplier < 0.7) currentPhase = 'trough';
    else if (avgMultiplier < 0.9) currentPhase = 'declining';

    // Get unique upcoming events
    const uniqueEvents = Array.from(new Set(allEvents.map(e => e.eventName)));

    return {
      currentPhase,
      upcomingEvents: uniqueEvents.slice(0, 5),
      multiplier: avgMultiplier
    };
  }

  /**
   * Optimize budget allocation using Thompson Sampling
   */
  private async optimizeBudgetAllocation(
    arms: any[],
    config: OptimizationConfig,
    seasonalMultiplier: number
  ): Promise<any[]> {
    // Adjust total budget for seasonality, but cap at reasonable limit
    const rawAdjustedBudget = config.constraints.totalBudget * seasonalMultiplier;
    const adjustedBudget = Math.min(rawAdjustedBudget, config.constraints.totalBudget * 1.1); // Cap at 10% increase

    // Prepare Thompson Sampling arms with all required fields
    const tsArms = arms.map(arm => ({
      id: arm.id,
      name: arm.name,
      type: arm.type,
      alpha: arm.alpha,
      beta: arm.beta,
      shape: arm.shape,
      scale: arm.scale,
      metrics30d: arm.metrics30d,
      currentDailyBudget: arm.currentDailyBudget
    }));

    // Run Thompson Sampling optimization
    const allocations = this.thompsonOptimizer.allocateBudget(
      tsArms,
      adjustedBudget,
      {
        minDailyBudget: 2,
        maxDailyBudget: adjustedBudget * 0.5, // No campaign gets more than 50%
        riskTolerance: config.riskTolerance,
        maxChangePercent: config.constraints.maxBudgetChange,
        explorationFloor: config.riskTolerance * 0.2 // Convert risk tolerance to exploration
      }
    );

    // Map allocations back to campaign format
    return arms.map(arm => {
      const allocation = allocations.find(a => a.armId === arm.id);
      const currentBudget = arm.currentBudget;
      const recommendedBudget = allocation?.proposedDailyBudget || currentBudget;

      return {
        campaignId: arm.id,
        currentBudget,
        recommendedBudget,
        confidence: allocation?.thompsonScore || 0,
        expectedValue: allocation?.expectedImprovement || 0,
        changePercent: currentBudget > 0 ? ((recommendedBudget - currentBudget) / currentBudget * 100) : 0
      };
    });
  }

  /**
   * Recommend bid strategies based on optimization results
   */
  private async recommendBidStrategies(
    campaignIds: string[],
    budgetAllocations: any[],
    competitionData: any,
    config: OptimizationConfig
  ): Promise<any[]> {
    const strategies = [];

    for (const campaignId of campaignIds) {
      const budgetAlloc = budgetAllocations.find(b => b.campaignId === campaignId);
      const analysis = await this.bidStrategyAdvisor.analyzeBidStrategies(campaignId);

      // Filter strategies based on config objective
      let recommendedStrategy = analysis.recommendedStrategies[0];

      // Adjust based on budget changes
      if (budgetAlloc && budgetAlloc.changePercent > 20) {
        // Budget increasing significantly - can be more aggressive
        const aggressiveStrategies = analysis.recommendedStrategies.filter(
          s => ['maximize_conversions', 'enhanced_cpc'].includes(s.type)
        );
        if (aggressiveStrategies.length > 0) {
          recommendedStrategy = aggressiveStrategies[0];
        }
      } else if (budgetAlloc && budgetAlloc.changePercent < -20) {
        // Budget decreasing - focus on efficiency
        const efficientStrategies = analysis.recommendedStrategies.filter(
          s => ['target_cpa', 'target_roas'].includes(s.type)
        );
        if (efficientStrategies.length > 0) {
          recommendedStrategy = efficientStrategies[0];
        }
      }

      // Adjust based on competition
      if (competitionData.bidWarDetected) {
        // Avoid automated bidding in bid wars
        const manualStrategies = analysis.recommendedStrategies.filter(
          s => ['manual_cpc', 'enhanced_cpc'].includes(s.type)
        );
        if (manualStrategies.length > 0) {
          recommendedStrategy = manualStrategies[0];
        }
      }

      strategies.push({
        campaignId,
        currentStrategy: analysis.currentStrategy,
        recommendedStrategy: recommendedStrategy.type,
        confidence: recommendedStrategy.confidence,
        rationale: recommendedStrategy.rationale,
        recommendation: recommendedStrategy.recommendation
      });
    }

    return strategies;
  }

  /**
   * Calculate bid adjustments for all campaigns
   */
  private async calculateAllBidAdjustments(
    campaignIds: string[],
    bidStrategies: any[],
    config: OptimizationConfig
  ): Promise<any[]> {
    const adjustments = [];

    for (const campaignId of campaignIds) {
      const strategy = bidStrategies.find(s => s.campaignId === campaignId);

      // Determine adjustment strategy based on bid strategy
      const adjustmentStrategy = {
        objective: config.objective,
        constraints: {
          maxBidModifier: 1.5,
          minBidModifier: 0.5,
          budgetLimit: config.constraints.totalBudget,
          targetCPA: config.constraints.targetCPA,
          targetROAS: config.constraints.targetROAS
        },
        aggressiveness: config.riskTolerance > 0.7 ? 'aggressive' :
                       config.riskTolerance > 0.3 ? 'moderate' : 'conservative'
      };

      const campaignAdjustments = await this.bidAdjustmentCalculator.calculateBidAdjustments(
        campaignId,
        adjustmentStrategy
      );

      // Group adjustments by dimension
      const grouped = this.groupAdjustmentsByDimension(campaignAdjustments.adjustments);

      adjustments.push({
        campaignId,
        dimension: 'multi',
        adjustments: grouped,
        totalImpact: campaignAdjustments.totalExpectedImpact
      });
    }

    return adjustments;
  }

  /**
   * Group adjustments by dimension
   */
  private groupAdjustmentsByDimension(adjustments: any[]): any[] {
    const dimensions = ['device', 'location', 'schedule', 'audience', 'demographic', 'keyword'];
    const grouped = [];

    for (const dimension of dimensions) {
      const dimAdjustments = adjustments.filter(a => a.dimension === dimension);
      if (dimAdjustments.length > 0) {
        grouped.push({
          dimension,
          adjustments: dimAdjustments.map(a => ({
            segment: a.segment,
            modifier: a.recommendedBidModifier,
            confidence: a.confidence,
            impact: a.expectedImpact
          }))
        });
      }
    }

    return grouped;
  }

  /**
   * Calculate total expected impact
   */
  private calculateTotalExpectedImpact(
    budgetAllocations: any[],
    bidStrategies: any[],
    bidAdjustments: any[]
  ): any {
    let totalImpact = {
      impressionChange: 0,
      clickChange: 0,
      conversionChange: 0,
      costChange: 0,
      roasChange: 0
    };

    // Impact from budget changes
    for (const allocation of budgetAllocations) {
      const budgetChange = (allocation.recommendedBudget - allocation.currentBudget) /
                          allocation.currentBudget;

      // Simplified impact model
      totalImpact.impressionChange += budgetChange * 0.8 * 100; // 80% of budget change
      totalImpact.clickChange += budgetChange * 0.6 * 100; // 60% of budget change
      totalImpact.conversionChange += budgetChange * 0.4 * 100; // 40% of budget change
      totalImpact.costChange += budgetChange * 100; // Direct correlation
    }

    // Impact from bid strategies
    for (const strategy of bidStrategies) {
      if (strategy.currentStrategy !== strategy.recommendedStrategy) {
        // Switching strategies has impact
        totalImpact.conversionChange += 10; // Assume 10% improvement
        totalImpact.roasChange += 0.2; // Assume 0.2x ROAS improvement
      }
    }

    // Impact from bid adjustments
    for (const campaignAdj of bidAdjustments) {
      if (campaignAdj.totalImpact) {
        totalImpact.conversionChange +=
          (campaignAdj.totalImpact.conversions || 0) * 0.1; // Aggregate impact
      }
    }

    // Average the percentages
    const campaignCount = budgetAllocations.length;
    return {
      impressionChange: Math.round(totalImpact.impressionChange / campaignCount),
      clickChange: Math.round(totalImpact.clickChange / campaignCount),
      conversionChange: Math.round(totalImpact.conversionChange / campaignCount),
      costChange: Math.round(totalImpact.costChange / campaignCount),
      roasChange: Math.round(totalImpact.roasChange * 10) / 10
    };
  }

  /**
   * Generate implementation plan
   */
  private generateImplementationPlan(
    budgetAllocations: any[],
    bidStrategies: any[],
    bidAdjustments: any[],
    competitionData: any,
    seasonalityData: any
  ): any {
    const immediate = [];
    const shortTerm = [];
    const monitoring = [];

    // Immediate actions (high confidence, high impact)
    for (const allocation of budgetAllocations) {
      if (allocation.confidence > 0.8 && Math.abs(allocation.changePercent) > 10) {
        immediate.push(
          `Adjust ${allocation.campaignId} budget from $${allocation.currentBudget} to $${allocation.recommendedBudget}`
        );
      }
    }

    for (const strategy of bidStrategies) {
      if (strategy.confidence > 0.8 && strategy.currentStrategy !== strategy.recommendedStrategy) {
        immediate.push(
          `Switch ${strategy.campaignId} from ${strategy.currentStrategy} to ${strategy.recommendedStrategy}`
        );
      }
    }

    // Short-term actions (medium confidence or lower impact)
    for (const campaignAdj of bidAdjustments) {
      const highConfidence = campaignAdj.adjustments
        .flatMap(d => d.adjustments)
        .filter(a => a.confidence > 0.7);

      if (highConfidence.length > 0) {
        shortTerm.push(
          `Apply ${highConfidence.length} bid adjustments for ${campaignAdj.campaignId}`
        );
      }
    }

    // Competition-based actions
    if (competitionData.bidWarDetected) {
      immediate.push('Implement bid caps to avoid escalation');
      monitoring.push('Monitor competitor bids daily');
    }

    // Seasonality-based actions
    if (seasonalityData.currentPhase === 'peak' || seasonalityData.currentPhase === 'rising') {
      shortTerm.push('Increase monitoring frequency during peak period');
    }

    if (seasonalityData.upcomingEvents.length > 0) {
      shortTerm.push(`Prepare campaigns for ${seasonalityData.upcomingEvents.join(', ')}`);
    }

    // General monitoring
    monitoring.push('Track conversion rate changes after implementation');
    monitoring.push('Monitor budget utilization daily');
    monitoring.push('Review bid strategy performance weekly');

    return {
      immediate: immediate.slice(0, 5),
      shortTerm: shortTerm.slice(0, 5),
      monitoring: monitoring.slice(0, 5)
    };
  }

  /**
   * Apply optimizations to campaigns
   */
  async applyOptimizations(
    result: IntegratedOptimizationResult,
    testMode: boolean = false
  ): Promise<{
    success: boolean;
    applied: {
      budgets: number;
      strategies: number;
      adjustments: number;
    };
    errors: string[];
  }> {
    const errors: string[] = [];
    let applied = {
      budgets: 0,
      strategies: 0,
      adjustments: 0
    };

    try {
      // Apply budget changes
      for (const allocation of result.budgetAllocations) {
        if (Math.abs(allocation.recommendedBudget - allocation.currentBudget) > 1) {
          if (!testMode) {
            this.database.prepare(`
              UPDATE campaign_settings
              SET daily_budget = ?, updated_at = datetime('now')
              WHERE campaign_id = ?
            `).run(allocation.recommendedBudget, allocation.campaignId);
          }
          applied.budgets++;
        }
      }

      // Apply strategy changes
      for (const strategy of result.bidStrategies) {
        if (strategy.currentStrategy !== strategy.recommendedStrategy) {
          if (!testMode) {
            // Would integrate with Google Ads API here
            this.logger.info('Would apply strategy', { strategy });
          }
          applied.strategies++;
        }
      }

      // Apply bid adjustments
      for (const campaignAdj of result.bidAdjustments) {
        const adjustments = campaignAdj.adjustments
          .flatMap(d => d.adjustments)
          .filter(a => a.confidence > 0.7);

        if (!testMode && adjustments.length > 0) {
          // Would integrate with Google Ads API here
          this.logger.info('Would apply adjustments', {
            campaign: campaignAdj.campaignId,
            count: adjustments.length
          });
        }
        applied.adjustments += adjustments.length;
      }

      return {
        success: errors.length === 0,
        applied,
        errors
      };
    } catch (error) {
      this.logger.error('Failed to apply optimizations', { error });
      errors.push(`Application error: ${error}`);
      return {
        success: false,
        applied,
        errors
      };
    }
  }
}