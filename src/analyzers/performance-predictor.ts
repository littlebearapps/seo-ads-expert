import pino from 'pino';
import { z } from 'zod';
import { PlannedChanges } from '../writers/mutation-applier.js';
import { CacheManager } from '../utils/cache.js';
import { PerformanceMonitor } from '../monitors/performance.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Performance prediction schemas
export const PerformancePredictionSchema = z.object({
  timestamp: z.string(),
  product: z.string(),
  changeType: z.string(),
  baseline: z.object({
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    avgCpc: z.number(),
    conversions: z.number(),
    conversionRate: z.number(),
    cost: z.number(),
    roas: z.number()
  }),
  predicted: z.object({
    impressions: z.object({ value: z.number(), confidence: z.number() }),
    clicks: z.object({ value: z.number(), confidence: z.number() }),
    ctr: z.object({ value: z.number(), confidence: z.number() }),
    avgCpc: z.object({ value: z.number(), confidence: z.number() }),
    conversions: z.object({ value: z.number(), confidence: z.number() }),
    conversionRate: z.object({ value: z.number(), confidence: z.number() }),
    cost: z.object({ value: z.number(), confidence: z.number() }),
    roas: z.object({ value: z.number(), confidence: z.number() })
  }),
  impact: z.object({
    impressions: z.object({ change: z.number(), percentage: z.number() }),
    clicks: z.object({ change: z.number(), percentage: z.number() }),
    ctr: z.object({ change: z.number(), percentage: z.number() }),
    avgCpc: z.object({ change: z.number(), percentage: z.number() }),
    conversions: z.object({ change: z.number(), percentage: z.number() }),
    conversionRate: z.object({ change: z.number(), percentage: z.number() }),
    cost: z.object({ change: z.number(), percentage: z.number() }),
    roas: z.object({ change: z.number(), percentage: z.number() })
  }),
  riskFactors: z.array(z.object({
    factor: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    description: z.string(),
    mitigation: z.string()
  })),
  confidence: z.object({
    overall: z.number(),
    factors: z.array(z.object({
      factor: z.string(),
      weight: z.number(),
      confidence: z.number()
    }))
  }),
  recommendations: z.array(z.string())
});

export const HistoricalDataSchema = z.object({
  product: z.string(),
  timeframe: z.object({
    start: z.string(),
    end: z.string()
  }),
  metrics: z.array(z.object({
    date: z.string(),
    impressions: z.number(),
    clicks: z.number(),
    cost: z.number(),
    conversions: z.number(),
    ctr: z.number(),
    avgCpc: z.number(),
    conversionRate: z.number(),
    roas: z.number()
  })),
  seasonality: z.object({
    weeklyPattern: z.array(z.number()), // 7 days
    monthlyPattern: z.array(z.number()), // 12 months
    trends: z.array(z.object({
      period: z.string(),
      direction: z.enum(['UP', 'DOWN', 'STABLE']),
      magnitude: z.number()
    }))
  }),
  benchmarks: z.object({
    industryAvgCtr: z.number(),
    industryAvgCpc: z.number(),
    industryConversionRate: z.number()
  })
});

export type PerformancePrediction = z.infer<typeof PerformancePredictionSchema>;
export type HistoricalData = z.infer<typeof HistoricalDataSchema>;

export class PerformancePredictor {
  private cache: CacheManager;
  private performanceMonitor: PerformanceMonitor;
  private historicalData: Map<string, HistoricalData> = new Map();
  private models: Map<string, any> = new Map();

  constructor() {
    this.cache = new CacheManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.initializeModels();
  }

  /**
   * Initialize prediction models
   */
  private initializeModels(): void {
    // Simple linear regression models for each metric
    // In production, these would be trained ML models
    this.models.set('impressions', {
      budgetCoefficient: 2.5,
      bidCoefficient: 1.8,
      qualityScoreCoefficient: 1.2,
      seasonalityWeight: 0.3
    });

    this.models.set('ctr', {
      qualityScoreCoefficient: 0.15,
      relevanceCoefficient: 0.12,
      adPositionCoefficient: -0.05,
      brandRecognitionWeight: 0.08
    });

    this.models.set('cpc', {
      competitionCoefficient: 0.3,
      qualityScoreCoefficient: -0.2,
      bidCoefficient: 0.8,
      marketDemandWeight: 0.25
    });

    this.models.set('conversions', {
      ctrCoefficient: 2.1,
      landingPageScoreCoefficient: 0.8,
      targetingRelevanceCoefficient: 1.5,
      seasonalityWeight: 0.4
    });
  }

  /**
   * Predict performance impact of planned changes
   */
  async predictImpact(
    changes: PlannedChanges,
    historicalData?: HistoricalData
  ): Promise<PerformancePrediction> {
    logger.info('Predicting performance impact', { 
      product: changes.product,
      mutations: changes.mutations.length 
    });

    // Get or generate historical data
    const history = historicalData || await this.getHistoricalData(changes.product);
    
    // Calculate current baseline
    const baseline = this.calculateBaseline(history);
    
    // Predict new metrics
    const predicted = await this.predictMetrics(changes, baseline, history);
    
    // Calculate impact
    const impact = this.calculateImpact(baseline, predicted);
    
    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(changes, impact);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(changes, history);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(changes, impact, riskFactors);

    const prediction: PerformancePrediction = {
      timestamp: new Date().toISOString(),
      product: changes.product,
      changeType: this.categorizeChanges(changes),
      baseline,
      predicted,
      impact,
      riskFactors,
      confidence,
      recommendations
    };

    // Cache prediction
    await this.cache.set(
      `prediction-${changes.product}-${Date.now()}`,
      prediction,
      3600000 // 1 hour in milliseconds
    );

    return prediction;
  }

  /**
   * Get historical performance data
   */
  private async getHistoricalData(product: string): Promise<HistoricalData> {
    const cached = this.historicalData.get(product);
    if (cached) {
      return cached;
    }

    // In production, this would fetch from Google Ads API
    // For now, generate simulated historical data
    const history = this.generateSimulatedHistory(product);
    this.historicalData.set(product, history);
    
    return history;
  }

  /**
   * Generate simulated historical data
   */
  private generateSimulatedHistory(product: string): HistoricalData {
    const metrics: HistoricalData['metrics'] = [];
    const now = new Date();
    
    // Generate 90 days of data
    for (let i = 89; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Base metrics with some randomness
      const baseImpressions = 1000 + Math.random() * 500;
      const baseCtr = 0.02 + Math.random() * 0.03;
      const baseConversionRate = 0.05 + Math.random() * 0.03;
      
      metrics.push({
        date: date.toISOString().split('T')[0],
        impressions: Math.round(baseImpressions),
        clicks: Math.round(baseImpressions * baseCtr),
        cost: Math.round((baseImpressions * baseCtr * (1 + Math.random() * 2)) * 100) / 100,
        conversions: Math.round(baseImpressions * baseCtr * baseConversionRate * 100) / 100,
        ctr: Math.round(baseCtr * 10000) / 100, // Percentage
        avgCpc: Math.round((1 + Math.random() * 2) * 100) / 100,
        conversionRate: Math.round(baseConversionRate * 10000) / 100, // Percentage
        roas: Math.round((2 + Math.random() * 3) * 100) / 100
      });
    }

    return {
      product,
      timeframe: {
        start: metrics[0].date,
        end: metrics[metrics.length - 1].date
      },
      metrics,
      seasonality: {
        weeklyPattern: [1.0, 0.8, 0.9, 1.1, 1.2, 0.7, 0.6], // Mon-Sun
        monthlyPattern: Array(12).fill(0).map(() => 0.8 + Math.random() * 0.4),
        trends: [
          {
            period: 'last_30_days',
            direction: 'UP',
            magnitude: 0.15
          }
        ]
      },
      benchmarks: {
        industryAvgCtr: 2.5,
        industryAvgCpc: 1.8,
        industryConversionRate: 4.2
      }
    };
  }

  /**
   * Calculate baseline metrics from historical data
   */
  private calculateBaseline(history: HistoricalData): PerformancePrediction['baseline'] {
    const recent = history.metrics.slice(-30); // Last 30 days
    
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => sum(arr) / arr.length;
    
    return {
      impressions: Math.round(avg(recent.map(m => m.impressions))),
      clicks: Math.round(avg(recent.map(m => m.clicks))),
      ctr: Math.round(avg(recent.map(m => m.ctr)) * 100) / 100,
      avgCpc: Math.round(avg(recent.map(m => m.avgCpc)) * 100) / 100,
      conversions: Math.round(avg(recent.map(m => m.conversions)) * 100) / 100,
      conversionRate: Math.round(avg(recent.map(m => m.conversionRate)) * 100) / 100,
      cost: Math.round(avg(recent.map(m => m.cost)) * 100) / 100,
      roas: Math.round(avg(recent.map(m => m.roas)) * 100) / 100
    };
  }

  /**
   * Predict new metrics based on changes
   */
  private async predictMetrics(
    changes: PlannedChanges,
    baseline: PerformancePrediction['baseline'],
    history: HistoricalData
  ): Promise<PerformancePrediction['predicted']> {
    const factors = this.extractChangeFactor(changes);
    const models = this.models;
    
    // Predict impressions
    const impressionsModel = models.get('impressions')!;
    const impressionMultiplier = 1 + 
      (factors.budgetChange * impressionsModel.budgetCoefficient / 100) +
      (factors.bidChange * impressionsModel.bidCoefficient / 100) +
      (factors.qualityScoreChange * impressionsModel.qualityScoreCoefficient / 100);
    
    const predictedImpressions = Math.round(baseline.impressions * impressionMultiplier);
    
    // Predict CTR
    const ctrModel = models.get('ctr')!;
    const ctrMultiplier = 1 +
      (factors.qualityScoreChange * ctrModel.qualityScoreCoefficient / 100) +
      (factors.relevanceImprovement * ctrModel.relevanceCoefficient / 100);
    
    const predictedCtr = baseline.ctr * ctrMultiplier;
    const predictedClicks = Math.round(predictedImpressions * (predictedCtr / 100));
    
    // Predict CPC
    const cpcModel = models.get('cpc')!;
    const cpcMultiplier = 1 +
      (factors.competitionIncrease * cpcModel.competitionCoefficient / 100) +
      (factors.qualityScoreChange * cpcModel.qualityScoreCoefficient / 100) +
      (factors.bidChange * cpcModel.bidCoefficient / 100);
    
    const predictedCpc = baseline.avgCpc * cpcMultiplier;
    const predictedCost = predictedClicks * predictedCpc;
    
    // Predict conversions
    const conversionsModel = models.get('conversions')!;
    const conversionMultiplier = 1 +
      (factors.landingPageImprovement * conversionsModel.landingPageScoreCoefficient / 100) +
      (factors.targetingImprovement * conversionsModel.targetingRelevanceCoefficient / 100);
    
    const predictedConversionRate = baseline.conversionRate * conversionMultiplier;
    const predictedConversions = predictedClicks * (predictedConversionRate / 100);
    
    // Calculate ROAS (assuming average order value stays constant)
    const avgOrderValue = baseline.cost > 0 && baseline.conversions > 0 
      ? (baseline.roas * baseline.cost) / baseline.conversions 
      : 50; // Default AOV
    const predictedRoas = predictedConversions > 0 
      ? (predictedConversions * avgOrderValue) / predictedCost 
      : baseline.roas;
    
    // Calculate confidence levels
    const getConfidence = (factor: number) => Math.max(0.1, Math.min(0.9, 0.8 - Math.abs(factor) * 0.1));
    
    return {
      impressions: { 
        value: predictedImpressions, 
        confidence: getConfidence(factors.budgetChange) 
      },
      clicks: { 
        value: predictedClicks, 
        confidence: getConfidence(factors.qualityScoreChange) 
      },
      ctr: { 
        value: Math.round(predictedCtr * 100) / 100, 
        confidence: getConfidence(factors.relevanceImprovement) 
      },
      avgCpc: { 
        value: Math.round(predictedCpc * 100) / 100, 
        confidence: getConfidence(factors.bidChange) 
      },
      conversions: { 
        value: Math.round(predictedConversions * 100) / 100, 
        confidence: getConfidence(factors.targetingImprovement) 
      },
      conversionRate: { 
        value: Math.round(predictedConversionRate * 100) / 100, 
        confidence: getConfidence(factors.landingPageImprovement) 
      },
      cost: { 
        value: Math.round(predictedCost * 100) / 100, 
        confidence: getConfidence(factors.budgetChange + factors.bidChange) 
      },
      roas: { 
        value: Math.round(predictedRoas * 100) / 100, 
        confidence: getConfidence(factors.landingPageImprovement + factors.targetingImprovement) 
      }
    };
  }

  /**
   * Extract change factors from mutations
   */
  private extractChangeFactor(changes: PlannedChanges): {
    budgetChange: number;
    bidChange: number;
    qualityScoreChange: number;
    relevanceImprovement: number;
    competitionIncrease: number;
    landingPageImprovement: number;
    targetingImprovement: number;
  } {
    let budgetChange = 0;
    let bidChange = 0;
    let qualityScoreChange = 0;
    let relevanceImprovement = 0;
    let competitionIncrease = 0;
    let landingPageImprovement = 0;
    let targetingImprovement = 0;
    
    for (const mutation of changes.mutations) {
      // Budget changes
      if (mutation.type === 'UPDATE_BUDGET' && mutation.budget && mutation.oldBudget) {
        budgetChange += ((mutation.budget - mutation.oldBudget) / mutation.oldBudget) * 100;
      }
      
      // Bid changes
      if (mutation.bid && mutation.oldBid) {
        bidChange += ((mutation.bid - mutation.oldBid) / mutation.oldBid) * 100;
      }
      
      // Quality score improvements (estimated based on keyword additions)
      if (mutation.type === 'ADD_KEYWORD' && mutation.keyword?.score) {
        if (mutation.keyword.score > 70) {
          qualityScoreChange += 5; // High quality keywords improve overall score
        }
        relevanceImprovement += mutation.keyword.score > 60 ? 3 : -2;
      }
      
      // Landing page improvements
      if (mutation.type === 'UPDATE_AD' && mutation.ad?.landingPage) {
        landingPageImprovement += 10; // Assume landing page optimization
      }
      
      // Targeting improvements
      if (mutation.targeting) {
        targetingImprovement += 5; // Assume better targeting
      }
      
      // Competition (more keywords = more competition)
      if (mutation.type === 'ADD_KEYWORD') {
        competitionIncrease += 2;
      }
    }
    
    return {
      budgetChange,
      bidChange,
      qualityScoreChange,
      relevanceImprovement,
      competitionIncrease,
      landingPageImprovement,
      targetingImprovement
    };
  }

  /**
   * Calculate impact between baseline and predicted
   */
  private calculateImpact(
    baseline: PerformancePrediction['baseline'],
    predicted: PerformancePrediction['predicted']
  ): PerformancePrediction['impact'] {
    const calculateChange = (base: number, pred: number) => ({
      change: Math.round((pred - base) * 100) / 100,
      percentage: base > 0 ? Math.round(((pred - base) / base) * 10000) / 100 : 0
    });

    return {
      impressions: calculateChange(baseline.impressions, predicted.impressions.value),
      clicks: calculateChange(baseline.clicks, predicted.clicks.value),
      ctr: calculateChange(baseline.ctr, predicted.ctr.value),
      avgCpc: calculateChange(baseline.avgCpc, predicted.avgCpc.value),
      conversions: calculateChange(baseline.conversions, predicted.conversions.value),
      conversionRate: calculateChange(baseline.conversionRate, predicted.conversionRate.value),
      cost: calculateChange(baseline.cost, predicted.cost.value),
      roas: calculateChange(baseline.roas, predicted.roas.value)
    };
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    changes: PlannedChanges,
    impact: PerformancePrediction['impact']
  ): PerformancePrediction['riskFactors'] {
    const risks: PerformancePrediction['riskFactors'] = [];

    // Cost increase risk
    if (impact.cost.percentage > 50) {
      risks.push({
        factor: 'High Cost Increase',
        severity: 'HIGH',
        description: `Predicted cost increase of ${impact.cost.percentage.toFixed(1)}%`,
        mitigation: 'Monitor daily spend closely and set up budget alerts'
      });
    }

    // CTR decline risk
    if (impact.ctr.percentage < -20) {
      risks.push({
        factor: 'CTR Decline',
        severity: 'MEDIUM',
        description: `Predicted CTR decline of ${Math.abs(impact.ctr.percentage).toFixed(1)}%`,
        mitigation: 'Review ad copy and keyword relevance'
      });
    }

    // ROAS decline risk
    if (impact.roas.percentage < -15) {
      risks.push({
        factor: 'ROAS Decline',
        severity: 'HIGH',
        description: `Predicted ROAS decline of ${Math.abs(impact.roas.percentage).toFixed(1)}%`,
        mitigation: 'Reassess landing page experience and conversion tracking'
      });
    }

    // Large structural changes
    const campaignDeletions = changes.mutations.filter(m => m.type === 'DELETE_CAMPAIGN');
    const adGroupDeletions = changes.mutations.filter(m => m.type === 'DELETE_AD_GROUP');

    if (campaignDeletions.length > 0) {
      risks.push({
        factor: 'Campaign Deletion',
        severity: 'HIGH',
        description: `${campaignDeletions.length} campaign deletion(s) will significantly impact performance`,
        mitigation: 'Review campaign performance before deletion and prepare backup campaigns'
      });
    }

    if (adGroupDeletions.length > 0) {
      risks.push({
        factor: 'Ad Group Deletion',
        severity: 'MEDIUM',
        description: `${adGroupDeletions.length} ad group deletion(s) may disrupt performance`,
        mitigation: 'Implement changes gradually and monitor closely'
      });
    }

    // Bid increases
    const bidIncreases = changes.mutations.filter(m => 
      m.bid && m.oldBid && m.bid > m.oldBid * 1.5
    );
    if (bidIncreases.length > 0) {
      risks.push({
        factor: 'Aggressive Bid Increases',
        severity: 'MEDIUM',
        description: `${bidIncreases.length} keywords with >50% bid increases`,
        mitigation: 'Consider gradual bid increases and monitor CPC impact'
      });
    }

    return risks;
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(
    changes: PlannedChanges,
    history: HistoricalData
  ): PerformancePrediction['confidence'] {
    const factors = [
      {
        factor: 'Historical Data Quality',
        weight: 0.3,
        confidence: history.metrics.length >= 30 ? 0.9 : 0.5
      },
      {
        factor: 'Change Magnitude',
        weight: 0.2,
        confidence: changes.mutations.length <= 10 ? 0.8 : 0.4
      },
      {
        factor: 'Change Complexity',
        weight: 0.2,
        confidence: this.getChangeComplexity(changes) < 0.5 ? 0.8 : 0.3
      },
      {
        factor: 'Seasonality Account',
        weight: 0.15,
        confidence: 0.7 // Medium confidence in seasonality adjustments
      },
      {
        factor: 'Market Stability',
        weight: 0.15,
        confidence: 0.6 // Moderate confidence in market conditions
      }
    ];

    const overall = factors.reduce((sum, factor) => 
      sum + (factor.weight * factor.confidence), 0
    );

    return {
      overall: Math.round(overall * 100) / 100,
      factors
    };
  }

  /**
   * Get change complexity score
   */
  private getChangeComplexity(changes: PlannedChanges): number {
    let complexity = 0;
    
    for (const mutation of changes.mutations) {
      switch (mutation.type) {
        case 'CREATE_CAMPAIGN':
        case 'DELETE_CAMPAIGN':
          complexity += 0.3;
          break;
        case 'CREATE_AD_GROUP':
        case 'DELETE_AD_GROUP':
          complexity += 0.2;
          break;
        case 'ADD_KEYWORD':
        case 'REMOVE_KEYWORD':
          complexity += 0.1;
          break;
        case 'UPDATE_BUDGET':
        case 'UPDATE_BID':
          complexity += 0.05;
          break;
        default:
          complexity += 0.1;
      }
    }
    
    return Math.min(1.0, complexity);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    changes: PlannedChanges,
    impact: PerformancePrediction['impact'],
    risks: PerformancePrediction['riskFactors']
  ): string[] {
    const recommendations: string[] = [];

    // Keyword quality recommendations
    const lowQualityKeywords = changes.mutations.filter(m =>
      m.type === 'ADD_KEYWORD' && m.keyword?.score && m.keyword.score < 50
    );
    if (lowQualityKeywords.length > 0) {
      recommendations.push(`⚠️ ${lowQualityKeywords.length} low-quality keyword(s) detected - consider improving keyword relevance and quality scores`);
    }

    // Positive impact recommendations
    if (impact.roas.percentage > 20) {
      recommendations.push('🚀 Significant ROAS improvement predicted - consider increasing budget to maximize gains');
    }

    if (impact.conversions.percentage > 30) {
      recommendations.push('📈 Strong conversion growth expected - ensure landing pages can handle increased traffic');
    }

    // Risk-based recommendations
    if (risks.some(r => r.severity === 'HIGH')) {
      recommendations.push('⚠️ High-risk changes detected - implement with careful monitoring');
    }

    if (impact.cost.percentage > 30) {
      recommendations.push('💰 Significant cost increase predicted - ensure budget allocation is sufficient');
    }

    // Performance optimization
    if (impact.ctr.percentage < 0) {
      recommendations.push('📊 CTR may decline - consider A/B testing ad copy improvements');
    }

    if (impact.avgCpc.percentage > 25) {
      recommendations.push('💸 CPC increase expected - review Quality Score optimization opportunities');
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('✅ Changes look positive overall - proceed with standard monitoring');
    }

    recommendations.push('📋 Monitor performance for first 48 hours after implementation');

    return recommendations;
  }

  /**
   * Categorize changes for prediction context
   */
  private categorizeChanges(changes: PlannedChanges): string {
    const types = new Set<string>();
    
    for (const mutation of changes.mutations) {
      if (mutation.type?.includes('BUDGET')) types.add('Budget');
      if (mutation.type?.includes('KEYWORD')) types.add('Keywords');
      if (mutation.type?.includes('AD')) types.add('Ads');
      if (mutation.type?.includes('CAMPAIGN')) types.add('Campaigns');
      if (mutation.type?.includes('BID')) types.add('Bids');
    }
    
    return Array.from(types).join(' + ') || 'Mixed';
  }

  /**
   * Get prediction statistics
   */
  getStatistics(): {
    totalPredictions: number;
    accuracyRate: number;
    avgConfidence: number;
    riskDistribution: Record<string, number>;
  } {
    // In production, this would track actual vs predicted performance
    return {
      totalPredictions: 0,
      accuracyRate: 85.3, // Placeholder
      avgConfidence: 0.72,
      riskDistribution: {
        'LOW': 60,
        'MEDIUM': 30,
        'HIGH': 10
      }
    };
  }

  /**
   * Update prediction model with actual results
   */
  async updateModel(
    predictionId: string,
    actualResults: Partial<PerformancePrediction['baseline']>
  ): Promise<void> {
    logger.info('Updating prediction model', { predictionId });
    
    // In production, this would:
    // 1. Compare predicted vs actual results
    // 2. Calculate accuracy metrics
    // 3. Retrain models with new data
    // 4. Adjust confidence calculations
    
    await this.cache.set(
      `prediction-feedback-${predictionId}`,
      {
        actualResults,
        timestamp: new Date().toISOString()
      },
      86400 // 24 hours
    );
  }
}