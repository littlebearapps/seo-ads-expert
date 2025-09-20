import { z } from 'zod';
import { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';

export const FatigueSeveritySchema = z.enum([
  'NONE',      // No fatigue detected
  'MILD',      // Early warning signs
  'MODERATE',  // Clear fatigue indicators
  'SEVERE',    // Critical fatigue requiring immediate action
  'CRITICAL'   // Complete performance collapse
]);

export const FatigueSignalSchema = z.object({
  type: z.enum([
    'CTR_DECLINE',           // Click-through rate declining
    'CVR_DECLINE',           // Conversion rate declining
    'FREQUENCY_INCREASE',    // Frequency capping issues
    'CPC_INCREASE',          // Cost per click rising
    'IMPRESSION_SHARE_DROP', // Losing impression share
    'AUDIENCE_SATURATION',   // Audience becoming saturated
    'CREATIVE_STALENESS',    // Creative assets becoming stale
    'SEASONAL_EFFECT'        // Seasonal performance changes
  ]),
  severity: FatigueSeveritySchema,
  confidence: z.number().min(0).max(1),
  trend: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'VOLATILE']),
  timeframe: z.object({
    startDate: z.string(),
    endDate: z.string(),
    daysActive: z.number()
  }),
  metrics: z.object({
    currentValue: z.number(),
    baselineValue: z.number(),
    percentChange: z.number(),
    zScore: z.number() // Statistical significance
  }),
  description: z.string(),
  recommendation: z.string()
});

export const FatigueAnalysisSchema = z.object({
  adId: z.string(),
  adGroupId: z.string(),
  campaignId: z.string(),
  analysisDate: z.string(),

  overallFatigue: z.object({
    level: FatigueSeveritySchema,
    score: z.number().min(0).max(100), // 0 = no fatigue, 100 = complete fatigue
    confidence: z.number().min(0).max(1)
  }),

  signals: z.array(FatigueSignalSchema),

  performance: z.object({
    daysActive: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    conversions: z.number(),
    spend: z.number(),
    frequency: z.number(),
    reachPercent: z.number()
  }),

  historicalComparison: z.object({
    vs7DaysAgo: z.object({
      ctrChange: z.number(),
      cvrChange: z.number(),
      cpcChange: z.number()
    }),
    vs30DaysAgo: z.object({
      ctrChange: z.number(),
      cvrChange: z.number(),
      cpcChange: z.number()
    }),
    peakPerformance: z.object({
      date: z.string(),
      ctr: z.number(),
      cvr: z.number(),
      declineFromPeak: z.number()
    })
  }),

  predictions: z.object({
    expectedLifespan: z.number(), // days until severe fatigue
    optimalRefreshDate: z.string(),
    performanceProjection: z.array(z.object({
      date: z.string(),
      expectedCtr: z.number(),
      expectedCvr: z.number(),
      confidence: z.number()
    }))
  }),

  recommendations: z.array(z.object({
    action: z.enum([
      'REFRESH_CREATIVE',
      'PAUSE_AD',
      'ADJUST_TARGETING',
      'INCREASE_BUDGET',
      'DECREASE_BUDGET',
      'CREATE_VARIANT',
      'ROTATE_OUT',
      'FREQUENCY_CAPPING',
      'AUDIENCE_EXPANSION'
    ]),
    priority: z.enum(['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW']),
    description: z.string(),
    expectedImpact: z.object({
      metric: z.string(),
      improvement: z.number()
    }),
    timeframe: z.string(),
    effort: z.enum(['LOW', 'MEDIUM', 'HIGH'])
  }))
});

export type FatigueSeverity = z.infer<typeof FatigueSeveritySchema>;
export type FatigueSignal = z.infer<typeof FatigueSignalSchema>;
export type FatigueAnalysis = z.infer<typeof FatigueAnalysisSchema>;

export interface FatigueThresholds {
  ctrDeclineThreshold: number;     // % decline to trigger fatigue warning
  cvrDeclineThreshold: number;     // % decline to trigger fatigue warning
  frequencyThreshold: number;      // Frequency above which fatigue likely
  daysActiveThreshold: number;     // Days active before checking for fatigue
  zScoreThreshold: number;         // Statistical significance threshold
  confidenceThreshold: number;     // Minimum confidence for fatigue detection
}

export class FatigueDetector extends EventEmitter {
  private db: Database;
  private thresholds: FatigueThresholds;

  constructor(
    db: Database,
    thresholds: Partial<FatigueThresholds> = {}
  ) {
    super();
    this.db = db;
    this.thresholds = {
      ctrDeclineThreshold: 0.15,  // 15% CTR decline
      cvrDeclineThreshold: 0.20,  // 20% CVR decline
      frequencyThreshold: 3.0,    // Frequency above 3
      daysActiveThreshold: 14,    // Check after 14 days
      zScoreThreshold: 1.96,      // 95% confidence
      confidenceThreshold: 0.7,   // 70% confidence minimum
      ...thresholds
    };
    this.initializeTables();
  }

  async detectFatigue(adId: string): Promise<FatigueAnalysis> {
    const adData = await this.getAdPerformanceData(adId);
    const signals = await this.analyzeFatigueSignals(adData);
    const overallFatigue = this.calculateOverallFatigue(signals);
    const historicalComparison = await this.getHistoricalComparison(adId);
    const predictions = await this.generatePredictions(adData, signals);
    const recommendations = this.generateRecommendations(signals, overallFatigue);

    const analysis: FatigueAnalysis = {
      adId: adData.adId,
      adGroupId: adData.adGroupId,
      campaignId: adData.campaignId,
      analysisDate: new Date().toISOString().split('T')[0],
      overallFatigue,
      signals,
      performance: adData.performance,
      historicalComparison,
      predictions,
      recommendations
    };

    // Store analysis results
    await this.storeFatigueAnalysis(analysis);

    // Emit events for different fatigue levels
    if (overallFatigue.level === 'SEVERE' || overallFatigue.level === 'CRITICAL') {
      this.emit('severeFatigueDetected', analysis);
    } else if (overallFatigue.level === 'MODERATE') {
      this.emit('moderateFatigueDetected', analysis);
    }

    return analysis;
  }

  async batchFatigueDetection(
    adIds: string[]
  ): Promise<FatigueAnalysis[]> {
    const analyses: FatigueAnalysis[] = [];

    for (const adId of adIds) {
      try {
        const analysis = await this.detectFatigue(adId);
        analyses.push(analysis);
      } catch (error) {
        console.error(`Failed to analyze fatigue for ad ${adId}:`, error);
      }
    }

    // Generate batch summary
    const summary = this.generateBatchSummary(analyses);
    this.emit('batchAnalysisComplete', { analyses, summary });

    return analyses;
  }

  async detectCampaignFatigue(campaignId: string): Promise<{
    campaignId: string;
    overallFatigueLevel: FatigueSeverity;
    adAnalyses: FatigueAnalysis[];
    campaignMetrics: {
      avgFatigueScore: number;
      severeFatigueAds: number;
      totalAds: number;
      fatigueRate: number;
    };
    recommendations: Array<{
      action: string;
      affectedAds: number;
      priority: string;
      description: string;
    }>;
  }> {
    const adIds = await this.getAdIdsForCampaign(campaignId);
    const adAnalyses = await this.batchFatigueDetection(adIds);

    const campaignMetrics = this.calculateCampaignFatigueMetrics(adAnalyses);
    const overallFatigueLevel = this.determineCampaignFatigueLevel(campaignMetrics);
    const recommendations = this.generateCampaignRecommendations(adAnalyses);

    return {
      campaignId,
      overallFatigueLevel,
      adAnalyses,
      campaignMetrics,
      recommendations
    };
  }

  private async getAdPerformanceData(adId: string): Promise<{
    adId: string;
    adGroupId: string;
    campaignId: string;
    performance: FatigueAnalysis['performance'];
    dailyMetrics: Array<{
      date: string;
      impressions: number;
      clicks: number;
      conversions: number;
      spend: number;
      ctr: number;
      cvr: number;
      cpc: number;
    }>;
  }> {
    // Query ad performance data from database
    const adInfo = this.db.prepare(`
      SELECT ad_id, ad_group_id, campaign_id, created_date
      FROM ads
      WHERE ad_id = ?
    `).get(adId) as any;

    if (!adInfo) {
      throw new Error(`Ad ${adId} not found`);
    }

    // Get aggregated performance metrics
    const performance = this.db.prepare(`
      SELECT
        COUNT(*) as days_active,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost_micros) / 1000000 as spend,
        AVG(frequency) as frequency,
        AVG(reach_percent) as reach_percent
      FROM daily_performance
      WHERE ad_id = ?
        AND date >= date('now', '-30 days')
    `).get(adId) as any;

    // Get daily metrics for trend analysis
    const dailyMetrics = this.db.prepare(`
      SELECT
        date,
        impressions,
        clicks,
        conversions,
        cost_micros / 1000000 as spend,
        CAST(clicks AS FLOAT) / NULLIF(impressions, 0) as ctr,
        CAST(conversions AS FLOAT) / NULLIF(clicks, 0) as cvr,
        (cost_micros / 1000000) / NULLIF(clicks, 0) as cpc
      FROM daily_performance
      WHERE ad_id = ?
        AND date >= date('now', '-30 days')
      ORDER BY date DESC
    `).all(adId) as any[];

    return {
      adId: adInfo.ad_id,
      adGroupId: adInfo.ad_group_id,
      campaignId: adInfo.campaign_id,
      performance: {
        daysActive: performance?.days_active || 0,
        impressions: performance?.impressions || 0,
        clicks: performance?.clicks || 0,
        conversions: performance?.conversions || 0,
        spend: performance?.spend || 0,
        frequency: performance?.frequency || 0,
        reachPercent: performance?.reach_percent || 0
      },
      dailyMetrics
    };
  }

  private async analyzeFatigueSignals(adData: any): Promise<FatigueSignal[]> {
    const signals: FatigueSignal[] = [];

    // Analyze CTR decline
    const ctrSignal = this.analyzeCTRDecline(adData.dailyMetrics);
    if (ctrSignal) signals.push(ctrSignal);

    // Analyze CVR decline
    const cvrSignal = this.analyzeCVRDecline(adData.dailyMetrics);
    if (cvrSignal) signals.push(cvrSignal);

    // Analyze frequency issues
    const frequencySignal = this.analyzeFrequency(adData.performance);
    if (frequencySignal) signals.push(frequencySignal);

    // Analyze CPC increase
    const cpcSignal = this.analyzeCPCIncrease(adData.dailyMetrics);
    if (cpcSignal) signals.push(cpcSignal);

    // Analyze creative staleness
    const stalenessSignal = this.analyzeCreativeStaleness(adData);
    if (stalenessSignal) signals.push(stalenessSignal);

    return signals;
  }

  private analyzeCTRDecline(dailyMetrics: any[]): FatigueSignal | null {
    if (dailyMetrics.length < 7) return null;

    const recent = dailyMetrics.slice(0, 7); // Last 7 days
    const baseline = dailyMetrics.slice(7, 21); // Previous 14 days

    const recentAvgCTR = recent.reduce((sum, day) => sum + (day.ctr || 0), 0) / recent.length;
    const baselineAvgCTR = baseline.reduce((sum, day) => sum + (day.ctr || 0), 0) / baseline.length;

    if (baselineAvgCTR === 0) return null;

    const percentChange = (recentAvgCTR - baselineAvgCTR) / baselineAvgCTR;
    const zScore = this.calculateZScore(recent.map(d => d.ctr), baseline.map(d => d.ctr));

    if (percentChange < -this.thresholds.ctrDeclineThreshold && Math.abs(zScore) > this.thresholds.zScoreThreshold) {
      const severity = this.determineSeverity(Math.abs(percentChange), [0.15, 0.25, 0.40, 0.60]);

      return {
        type: 'CTR_DECLINE',
        severity,
        confidence: Math.min(1, Math.abs(zScore) / this.thresholds.zScoreThreshold),
        trend: 'DECLINING',
        timeframe: {
          startDate: recent[recent.length - 1].date,
          endDate: recent[0].date,
          daysActive: recent.length
        },
        metrics: {
          currentValue: recentAvgCTR,
          baselineValue: baselineAvgCTR,
          percentChange,
          zScore
        },
        description: `CTR declined ${(Math.abs(percentChange) * 100).toFixed(1)}% over the last 7 days`,
        recommendation: severity === 'SEVERE' || severity === 'CRITICAL' ?
          'Immediate creative refresh or pause ad' :
          'Monitor closely and consider creative variations'
      };
    }

    return null;
  }

  private analyzeCVRDecline(dailyMetrics: any[]): FatigueSignal | null {
    if (dailyMetrics.length < 7) return null;

    const recent = dailyMetrics.slice(0, 7);
    const baseline = dailyMetrics.slice(7, 21);

    const recentAvgCVR = recent.reduce((sum, day) => sum + (day.cvr || 0), 0) / recent.length;
    const baselineAvgCVR = baseline.reduce((sum, day) => sum + (day.cvr || 0), 0) / baseline.length;

    if (baselineAvgCVR === 0) return null;

    const percentChange = (recentAvgCVR - baselineAvgCVR) / baselineAvgCVR;
    const zScore = this.calculateZScore(recent.map(d => d.cvr), baseline.map(d => d.cvr));

    if (percentChange < -this.thresholds.cvrDeclineThreshold && Math.abs(zScore) > this.thresholds.zScoreThreshold) {
      const severity = this.determineSeverity(Math.abs(percentChange), [0.20, 0.35, 0.50, 0.70]);

      return {
        type: 'CVR_DECLINE',
        severity,
        confidence: Math.min(1, Math.abs(zScore) / this.thresholds.zScoreThreshold),
        trend: 'DECLINING',
        timeframe: {
          startDate: recent[recent.length - 1].date,
          endDate: recent[0].date,
          daysActive: recent.length
        },
        metrics: {
          currentValue: recentAvgCVR,
          baselineValue: baselineAvgCVR,
          percentChange,
          zScore
        },
        description: `CVR declined ${(Math.abs(percentChange) * 100).toFixed(1)}% over the last 7 days`,
        recommendation: 'Review landing page experience and audience targeting'
      };
    }

    return null;
  }

  private analyzeFrequency(performance: any): FatigueSignal | null {
    if (performance.frequency > this.thresholds.frequencyThreshold) {
      const severity = this.determineSeverity(performance.frequency, [3.0, 4.0, 5.0, 7.0]);

      return {
        type: 'FREQUENCY_INCREASE',
        severity,
        confidence: 0.9,
        trend: 'STABLE',
        timeframe: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          daysActive: 30
        },
        metrics: {
          currentValue: performance.frequency,
          baselineValue: this.thresholds.frequencyThreshold,
          percentChange: (performance.frequency - this.thresholds.frequencyThreshold) / this.thresholds.frequencyThreshold,
          zScore: 0
        },
        description: `High frequency of ${performance.frequency.toFixed(2)} indicates audience saturation`,
        recommendation: 'Implement frequency capping or expand audience targeting'
      };
    }

    return null;
  }

  private analyzeCPCIncrease(dailyMetrics: any[]): FatigueSignal | null {
    if (dailyMetrics.length < 7) return null;

    const recent = dailyMetrics.slice(0, 7);
    const baseline = dailyMetrics.slice(7, 21);

    const recentAvgCPC = recent.reduce((sum, day) => sum + (day.cpc || 0), 0) / recent.length;
    const baselineAvgCPC = baseline.reduce((sum, day) => sum + (day.cpc || 0), 0) / baseline.length;

    if (baselineAvgCPC === 0) return null;

    const percentChange = (recentAvgCPC - baselineAvgCPC) / baselineAvgCPC;

    if (percentChange > 0.25) { // 25% CPC increase
      const severity = this.determineSeverity(percentChange, [0.25, 0.40, 0.60, 1.0]);

      return {
        type: 'CPC_INCREASE',
        severity,
        confidence: 0.8,
        trend: 'DECLINING',
        timeframe: {
          startDate: recent[recent.length - 1].date,
          endDate: recent[0].date,
          daysActive: recent.length
        },
        metrics: {
          currentValue: recentAvgCPC,
          baselineValue: baselineAvgCPC,
          percentChange,
          zScore: 0
        },
        description: `CPC increased ${(percentChange * 100).toFixed(1)}% indicating declining ad relevance`,
        recommendation: 'Review ad relevance and quality score factors'
      };
    }

    return null;
  }

  private analyzeCreativeStaleness(adData: any): FatigueSignal | null {
    if (adData.performance.daysActive > 45) { // 45+ days active
      const severity = this.determineSeverity(adData.performance.daysActive, [45, 60, 90, 120]);

      return {
        type: 'CREATIVE_STALENESS',
        severity,
        confidence: 0.7,
        trend: 'STABLE',
        timeframe: {
          startDate: new Date(Date.now() - adData.performance.daysActive * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          daysActive: adData.performance.daysActive
        },
        metrics: {
          currentValue: adData.performance.daysActive,
          baselineValue: 45,
          percentChange: (adData.performance.daysActive - 45) / 45,
          zScore: 0
        },
        description: `Creative has been active for ${adData.performance.daysActive} days`,
        recommendation: 'Consider creating fresh creative variations'
      };
    }

    return null;
  }

  private calculateZScore(sample1: number[], sample2: number[]): number {
    if (sample1.length === 0 || sample2.length === 0) return 0;

    const mean1 = sample1.reduce((sum, val) => sum + val, 0) / sample1.length;
    const mean2 = sample2.reduce((sum, val) => sum + val, 0) / sample2.length;

    const variance1 = sample1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / sample1.length;
    const variance2 = sample2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / sample2.length;

    const pooledStdDev = Math.sqrt((variance1 + variance2) / 2);

    if (pooledStdDev === 0) return 0;

    return (mean1 - mean2) / pooledStdDev;
  }

  private determineSeverity(value: number, thresholds: [number, number, number, number]): FatigueSeverity {
    if (value >= thresholds[3]) return 'CRITICAL';
    if (value >= thresholds[2]) return 'SEVERE';
    if (value >= thresholds[1]) return 'MODERATE';
    if (value >= thresholds[0]) return 'MILD';
    return 'NONE';
  }

  private calculateOverallFatigue(signals: FatigueSignal[]): FatigueAnalysis['overallFatigue'] {
    if (signals.length === 0) {
      return {
        level: 'NONE',
        score: 0,
        confidence: 1
      };
    }

    // Weight signals by their confidence and severity
    const severityWeights = { NONE: 0, MILD: 20, MODERATE: 50, SEVERE: 80, CRITICAL: 100 };
    let weightedScore = 0;
    let totalConfidence = 0;

    signals.forEach(signal => {
      const severityScore = severityWeights[signal.severity];
      weightedScore += severityScore * signal.confidence;
      totalConfidence += signal.confidence;
    });

    const avgScore = totalConfidence > 0 ? weightedScore / totalConfidence : 0;
    const avgConfidence = totalConfidence / signals.length;

    // Determine overall level based on score
    let level: FatigueSeverity = 'NONE';
    if (avgScore >= 80) level = 'CRITICAL';
    else if (avgScore >= 60) level = 'SEVERE';
    else if (avgScore >= 40) level = 'MODERATE';
    else if (avgScore >= 20) level = 'MILD';

    return {
      level,
      score: avgScore,
      confidence: avgConfidence
    };
  }

  private async getHistoricalComparison(adId: string): Promise<FatigueAnalysis['historicalComparison']> {
    // This would query historical performance data
    // For now, returning mock structure
    return {
      vs7DaysAgo: {
        ctrChange: -0.15,
        cvrChange: -0.10,
        cpcChange: 0.20
      },
      vs30DaysAgo: {
        ctrChange: -0.25,
        cvrChange: -0.18,
        cpcChange: 0.35
      },
      peakPerformance: {
        date: '2024-01-15',
        ctr: 0.08,
        cvr: 0.12,
        declineFromPeak: 0.40
      }
    };
  }

  private async generatePredictions(adData: any, signals: FatigueSignal[]): Promise<FatigueAnalysis['predictions']> {
    // Simple prediction model - in practice would use ML
    const severeFatigueSignals = signals.filter(s => s.severity === 'SEVERE' || s.severity === 'CRITICAL').length;

    let expectedLifespan = 30; // Default 30 days
    if (severeFatigueSignals > 2) expectedLifespan = 7;
    else if (severeFatigueSignals > 0) expectedLifespan = 14;

    const optimalRefreshDate = new Date();
    optimalRefreshDate.setDate(optimalRefreshDate.getDate() + expectedLifespan);

    return {
      expectedLifespan,
      optimalRefreshDate: optimalRefreshDate.toISOString().split('T')[0],
      performanceProjection: [
        {
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          expectedCtr: 0.045,
          expectedCvr: 0.08,
          confidence: 0.7
        }
      ]
    };
  }

  private generateRecommendations(
    signals: FatigueSignal[],
    overallFatigue: FatigueAnalysis['overallFatigue']
  ): FatigueAnalysis['recommendations'] {
    const recommendations: FatigueAnalysis['recommendations'] = [];

    if (overallFatigue.level === 'CRITICAL' || overallFatigue.level === 'SEVERE') {
      recommendations.push({
        action: 'PAUSE_AD',
        priority: 'IMMEDIATE',
        description: 'Pause ad immediately to prevent further performance degradation',
        expectedImpact: { metric: 'CPA', improvement: 0.3 },
        timeframe: 'Immediate',
        effort: 'LOW'
      });
    }

    signals.forEach(signal => {
      switch (signal.type) {
        case 'CTR_DECLINE':
          recommendations.push({
            action: 'REFRESH_CREATIVE',
            priority: signal.severity === 'SEVERE' ? 'HIGH' : 'MEDIUM',
            description: 'Create new ad variations with fresh creative elements',
            expectedImpact: { metric: 'CTR', improvement: 0.25 },
            timeframe: '3-5 days',
            effort: 'MEDIUM'
          });
          break;
        case 'FREQUENCY_INCREASE':
          recommendations.push({
            action: 'FREQUENCY_CAPPING',
            priority: 'HIGH',
            description: 'Implement frequency capping to reduce ad fatigue',
            expectedImpact: { metric: 'CTR', improvement: 0.15 },
            timeframe: '1-2 days',
            effort: 'LOW'
          });
          break;
      }
    });

    return recommendations;
  }

  private generateBatchSummary(analyses: FatigueAnalysis[]): any {
    const totalAds = analyses.length;
    const fatigueDistribution = {
      NONE: 0,
      MILD: 0,
      MODERATE: 0,
      SEVERE: 0,
      CRITICAL: 0
    };

    analyses.forEach(analysis => {
      fatigueDistribution[analysis.overallFatigue.level]++;
    });

    return {
      totalAds,
      fatigueDistribution,
      avgFatigueScore: analyses.reduce((sum, a) => sum + a.overallFatigue.score, 0) / totalAds,
      severeFatigueRate: (fatigueDistribution.SEVERE + fatigueDistribution.CRITICAL) / totalAds
    };
  }

  private async getAdIdsForCampaign(campaignId: string): Promise<string[]> {
    const result = this.db.prepare(`
      SELECT ad_id FROM ads WHERE campaign_id = ? AND status = 'ENABLED'
    `).all(campaignId) as any[];

    return result.map(row => row.ad_id);
  }

  private calculateCampaignFatigueMetrics(analyses: FatigueAnalysis[]): any {
    const totalAds = analyses.length;
    const avgFatigueScore = analyses.reduce((sum, a) => sum + a.overallFatigue.score, 0) / totalAds;
    const severeFatigueAds = analyses.filter(a =>
      a.overallFatigue.level === 'SEVERE' || a.overallFatigue.level === 'CRITICAL'
    ).length;

    return {
      avgFatigueScore,
      severeFatigueAds,
      totalAds,
      fatigueRate: severeFatigueAds / totalAds
    };
  }

  private determineCampaignFatigueLevel(metrics: any): FatigueSeverity {
    if (metrics.fatigueRate > 0.5) return 'SEVERE';
    if (metrics.fatigueRate > 0.3) return 'MODERATE';
    if (metrics.fatigueRate > 0.1) return 'MILD';
    return 'NONE';
  }

  private generateCampaignRecommendations(analyses: FatigueAnalysis[]): any[] {
    // Aggregate recommendations across all ads
    const actionCounts: { [key: string]: number } = {};

    analyses.forEach(analysis => {
      analysis.recommendations.forEach(rec => {
        actionCounts[rec.action] = (actionCounts[rec.action] || 0) + 1;
      });
    });

    return Object.entries(actionCounts).map(([action, count]) => ({
      action,
      affectedAds: count,
      priority: count > analyses.length * 0.5 ? 'HIGH' : 'MEDIUM',
      description: `${count} ads require ${action.toLowerCase().replace('_', ' ')}`
    }));
  }

  private async storeFatigueAnalysis(analysis: FatigueAnalysis): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO fatigue_analyses (
        ad_id, analysis_date, fatigue_level, fatigue_score, confidence,
        signals_json, analysis_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      analysis.adId,
      analysis.analysisDate,
      analysis.overallFatigue.level,
      analysis.overallFatigue.score,
      analysis.overallFatigue.confidence,
      JSON.stringify(analysis.signals),
      JSON.stringify(analysis)
    );
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fatigue_analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_id TEXT NOT NULL,
        analysis_date DATE NOT NULL,
        fatigue_level TEXT NOT NULL,
        fatigue_score REAL NOT NULL,
        confidence REAL NOT NULL,
        signals_json TEXT,
        analysis_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ad_id, analysis_date)
      );

      CREATE INDEX IF NOT EXISTS idx_fatigue_ad_date ON fatigue_analyses (ad_id, analysis_date);
      CREATE INDEX IF NOT EXISTS idx_fatigue_level ON fatigue_analyses (fatigue_level);
      CREATE INDEX IF NOT EXISTS idx_fatigue_score ON fatigue_analyses (fatigue_score);
    `);
  }
}