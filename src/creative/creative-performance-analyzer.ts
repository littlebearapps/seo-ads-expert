/**
 * Creative Performance Analyzer
 *
 * Analyzes ad creative performance across multiple dimensions and metrics.
 * Tracks creative lifecycle, identifies high/low performers, and provides insights.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';

export interface AdCreative {
  adId: string;
  adGroupId: string;
  campaignId: string;
  adType: 'text' | 'responsive_search' | 'responsive_display' | 'image' | 'video';
  status: 'enabled' | 'paused' | 'removed';
  createdAt: Date;
  lastModified: Date;
  content: {
    headlines?: string[];
    descriptions?: string[];
    imageUrl?: string;
    videoUrl?: string;
    finalUrl: string;
    displayUrl?: string;
  };
}

export interface CreativeMetrics {
  adId: string;
  period: string; // Date or date range
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversionValue: number;
  ctr: number;
  cvr: number;
  cpa: number;
  roas: number;
  qualityScore?: number;
  relevanceScore?: number;
  landingPageExperience?: number;
}

export interface CreativePerformance {
  creative: AdCreative;
  metrics: CreativeMetrics[];
  aggregatedMetrics: CreativeMetrics;
  trends: {
    ctrTrend: 'improving' | 'stable' | 'declining';
    cvrTrend: 'improving' | 'stable' | 'declining';
    volumeTrend: 'growing' | 'stable' | 'shrinking';
    trendConfidence: number; // 0-1
  };
  performanceScore: number; // 0-100
  rank: number; // Within ad group
  insights: string[];
  recommendations: string[];
}

export interface CreativeCompetitor {
  adGroupId: string;
  creatives: AdCreative[];
  championCreative?: AdCreative;
  challengerCreatives: AdCreative[];
  testResults?: {
    winner?: string;
    confidence: number;
    significanceLevel: number;
    testDuration: number;
  };
}

export interface CreativeAnalysisResult {
  adGroupId: string;
  campaignId: string;
  totalCreatives: number;
  activeCreatives: number;
  topPerformers: CreativePerformance[];
  poorPerformers: CreativePerformance[];
  overallHealth: {
    score: number; // 0-100
    status: 'excellent' | 'good' | 'fair' | 'poor';
    issues: string[];
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    strategic: string[];
  };
  rotationAnalysis: {
    strategy: 'even' | 'optimized' | 'manual';
    effectiveness: number; // 0-1
    recommendedStrategy: string;
  };
}

export class CreativePerformanceAnalyzer {
  private readonly MIN_IMPRESSIONS = 1000;
  private readonly MIN_DAYS = 7;
  private readonly SIGNIFICANCE_THRESHOLD = 0.95;

  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Analyze creative performance for an ad group
   */
  async analyzeAdGroupCreatives(
    adGroupId: string,
    lookbackDays: number = 30
  ): Promise<CreativeAnalysisResult> {
    this.logger.info('Analyzing creative performance', { adGroupId, lookbackDays });

    // Get all creatives in the ad group
    const creatives = await this.getAdGroupCreatives(adGroupId);

    if (creatives.length === 0) {
      throw new Error(`No creatives found for ad group ${adGroupId}`);
    }

    // Analyze performance for each creative
    const performances = await Promise.all(
      creatives.map(creative => this.analyzeCreativePerformance(creative, lookbackDays))
    );

    // Rank creatives by performance
    const rankedPerformances = this.rankCreatives(performances);

    // Identify top and poor performers
    const topPerformers = rankedPerformances.slice(0, Math.ceil(performances.length * 0.3));
    const poorPerformers = rankedPerformances.slice(-Math.ceil(performances.length * 0.3));

    // Calculate overall health
    const overallHealth = this.calculateOverallHealth(rankedPerformances);

    // Generate recommendations
    const recommendations = this.generateRecommendations(rankedPerformances, overallHealth);

    // Analyze rotation strategy
    const rotationAnalysis = await this.analyzeRotationStrategy(adGroupId, performances);

    return {
      adGroupId,
      campaignId: creatives[0].campaignId,
      totalCreatives: creatives.length,
      activeCreatives: creatives.filter(c => c.status === 'enabled').length,
      topPerformers,
      poorPerformers,
      overallHealth,
      recommendations,
      rotationAnalysis
    };
  }

  /**
   * Get all creatives for an ad group
   */
  private async getAdGroupCreatives(adGroupId: string): Promise<AdCreative[]> {
    const creatives = this.database.prepare(`
      SELECT
        ad_id,
        ad_group_id,
        campaign_id,
        ad_type,
        status,
        created_at,
        last_modified,
        headlines,
        descriptions,
        image_url,
        video_url,
        final_url,
        display_url
      FROM ad_creatives
      WHERE ad_group_id = ?
        AND status IN ('ENABLED', 'PAUSED')
      ORDER BY created_at DESC
    `).all(adGroupId) as any[];

    return creatives.map(row => ({
      adId: row.ad_id,
      adGroupId: row.ad_group_id,
      campaignId: row.campaign_id,
      adType: row.ad_type,
      status: row.status,
      createdAt: new Date(row.created_at),
      lastModified: new Date(row.last_modified),
      content: {
        headlines: row.headlines ? JSON.parse(row.headlines) : undefined,
        descriptions: row.descriptions ? JSON.parse(row.descriptions) : undefined,
        imageUrl: row.image_url,
        videoUrl: row.video_url,
        finalUrl: row.final_url,
        displayUrl: row.display_url
      }
    }));
  }

  /**
   * Analyze performance for a single creative
   */
  private async analyzeCreativePerformance(
    creative: AdCreative,
    lookbackDays: number
  ): Promise<CreativePerformance> {
    // Get historical metrics
    const metrics = await this.getCreativeMetrics(creative.adId, lookbackDays);

    // Calculate aggregated metrics
    const aggregatedMetrics = this.aggregateMetrics(metrics);

    // Analyze trends
    const trends = this.analyzeTrends(metrics);

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(aggregatedMetrics, trends);

    // Generate insights and recommendations
    const insights = this.generateCreativeInsights(creative, aggregatedMetrics, trends);
    const recommendations = this.generateCreativeRecommendations(creative, aggregatedMetrics, trends);

    return {
      creative,
      metrics,
      aggregatedMetrics,
      trends,
      performanceScore,
      rank: 0, // Will be set during ranking
      insights,
      recommendations
    };
  }

  /**
   * Get creative metrics over time
   */
  private async getCreativeMetrics(adId: string, lookbackDays: number): Promise<CreativeMetrics[]> {
    const metrics = this.database.prepare(`
      SELECT
        ad_id,
        date as period,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost_micros) / 1000000.0 as cost,
        SUM(conversions) * 10.0 as conversion_value,
        7.0 as quality_score,
        6.0 as relevance_score,
        5.0 as landing_page_experience
      FROM daily_performance
      WHERE ad_id = ?
        AND date >= date('now', '-' || ? || ' days')
      GROUP BY ad_id, date
      ORDER BY date
    `).all(adId, lookbackDays) as any[];

    return metrics.map(row => ({
      adId: row.ad_id,
      period: row.period,
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      conversions: row.conversions || 0,
      cost: row.cost || 0,
      conversionValue: row.conversion_value || 0,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) : 0,
      cvr: row.clicks > 0 ? (row.conversions / row.clicks) : 0,
      cpa: row.conversions > 0 ? (row.cost / row.conversions) : 0,
      roas: row.cost > 0 ? (row.conversion_value / row.cost) : 0,
      qualityScore: row.quality_score,
      relevanceScore: row.relevance_score,
      landingPageExperience: row.landing_page_experience
    }));
  }

  /**
   * Aggregate metrics across time periods
   */
  private aggregateMetrics(metrics: CreativeMetrics[]): CreativeMetrics {
    if (metrics.length === 0) {
      return {
        adId: '',
        period: 'aggregated',
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cost: 0,
        conversionValue: 0,
        ctr: 0,
        cvr: 0,
        cpa: 0,
        roas: 0
      };
    }

    const totals = metrics.reduce((acc, metric) => ({
      impressions: acc.impressions + metric.impressions,
      clicks: acc.clicks + metric.clicks,
      conversions: acc.conversions + metric.conversions,
      cost: acc.cost + metric.cost,
      conversionValue: acc.conversionValue + metric.conversionValue
    }), {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      conversionValue: 0
    });

    // Calculate averages for quality metrics
    const qualityMetrics = metrics.filter(m => m.qualityScore !== undefined);
    const avgQualityScore = qualityMetrics.length > 0 ?
      qualityMetrics.reduce((sum, m) => sum + (m.qualityScore || 0), 0) / qualityMetrics.length : undefined;

    return {
      adId: metrics[0].adId,
      period: 'aggregated',
      impressions: totals.impressions,
      clicks: totals.clicks,
      conversions: totals.conversions,
      cost: totals.cost,
      conversionValue: totals.conversionValue,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      cvr: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
      cpa: totals.conversions > 0 ? totals.cost / totals.conversions : 0,
      roas: totals.cost > 0 ? totals.conversionValue / totals.cost : 0,
      qualityScore: avgQualityScore
    };
  }

  /**
   * Analyze performance trends
   */
  private analyzeTrends(metrics: CreativeMetrics[]): CreativePerformance['trends'] {
    if (metrics.length < 3) {
      return {
        ctrTrend: 'stable',
        cvrTrend: 'stable',
        volumeTrend: 'stable',
        trendConfidence: 0
      };
    }

    // Split into early and recent periods
    const midpoint = Math.floor(metrics.length / 2);
    const earlyMetrics = metrics.slice(0, midpoint);
    const recentMetrics = metrics.slice(midpoint);

    const earlyAvg = this.aggregateMetrics(earlyMetrics);
    const recentAvg = this.aggregateMetrics(recentMetrics);

    // Calculate trend directions
    const ctrChange = this.calculateTrendDirection(earlyAvg.ctr, recentAvg.ctr, 0.1); // 10% threshold
    const cvrChange = this.calculateTrendDirection(earlyAvg.cvr, recentAvg.cvr, 0.1);
    const volumeChange = this.calculateTrendDirection(earlyAvg.impressions, recentAvg.impressions, 0.15); // 15% threshold

    // Calculate confidence based on data volume and consistency
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const dataConfidence = Math.min(totalImpressions / 10000, 1); // Max confidence at 10k impressions

    return {
      ctrTrend: ctrChange,
      cvrTrend: cvrChange,
      volumeTrend: volumeChange,
      trendConfidence: dataConfidence
    };
  }

  /**
   * Calculate trend direction between two values
   */
  private calculateTrendDirection(
    oldValue: number,
    newValue: number,
    threshold: number
  ): 'improving' | 'stable' | 'declining' {
    if (oldValue === 0) return 'stable';

    const change = (newValue - oldValue) / oldValue;

    if (change > threshold) return 'improving';
    if (change < -threshold) return 'declining';
    return 'stable';
  }

  /**
   * Calculate overall performance score (0-100)
   */
  private calculatePerformanceScore(
    metrics: CreativeMetrics,
    trends: CreativePerformance['trends']
  ): number {
    let score = 50; // Base score

    // CTR component (30% weight)
    if (metrics.ctr > 0.05) score += 15; // Excellent CTR
    else if (metrics.ctr > 0.03) score += 10; // Good CTR
    else if (metrics.ctr > 0.01) score += 5; // Average CTR
    // Poor CTR gets no bonus

    // CVR component (25% weight)
    if (metrics.cvr > 0.05) score += 12.5;
    else if (metrics.cvr > 0.02) score += 8;
    else if (metrics.cvr > 0.01) score += 4;

    // ROAS component (25% weight)
    if (metrics.roas > 4) score += 12.5;
    else if (metrics.roas > 2) score += 8;
    else if (metrics.roas > 1) score += 4;

    // Volume component (10% weight)
    if (metrics.impressions > 10000) score += 5;
    else if (metrics.impressions > 5000) score += 3;
    else if (metrics.impressions > 1000) score += 1;

    // Trend component (10% weight)
    const trendBonus = this.calculateTrendBonus(trends);
    score += trendBonus * trends.trendConfidence;

    // Quality score bonus
    if (metrics.qualityScore && metrics.qualityScore >= 8) score += 5;
    else if (metrics.qualityScore && metrics.qualityScore >= 6) score += 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate trend bonus for performance score
   */
  private calculateTrendBonus(trends: CreativePerformance['trends']): number {
    let bonus = 0;

    // CTR trend
    if (trends.ctrTrend === 'improving') bonus += 3;
    else if (trends.ctrTrend === 'declining') bonus -= 3;

    // CVR trend
    if (trends.cvrTrend === 'improving') bonus += 3;
    else if (trends.cvrTrend === 'declining') bonus -= 3;

    // Volume trend
    if (trends.volumeTrend === 'growing') bonus += 2;
    else if (trends.volumeTrend === 'shrinking') bonus -= 4; // Penalize volume loss more

    return bonus;
  }

  /**
   * Rank creatives by performance
   */
  private rankCreatives(performances: CreativePerformance[]): CreativePerformance[] {
    const ranked = performances
      .filter(p => p.aggregatedMetrics.impressions >= this.MIN_IMPRESSIONS)
      .sort((a, b) => b.performanceScore - a.performanceScore);

    // Assign ranks
    ranked.forEach((performance, index) => {
      performance.rank = index + 1;
    });

    return ranked;
  }

  /**
   * Calculate overall creative health for ad group
   */
  private calculateOverallHealth(performances: CreativePerformance[]): CreativeAnalysisResult['overallHealth'] {
    if (performances.length === 0) {
      return {
        score: 0,
        status: 'poor',
        issues: ['No creatives with sufficient data']
      };
    }

    const avgScore = performances.reduce((sum, p) => sum + p.performanceScore, 0) / performances.length;
    const activeCreatives = performances.filter(p => p.creative.status === 'enabled').length;
    const issues: string[] = [];

    // Check for common issues
    if (activeCreatives < 2) {
      issues.push('Insufficient creative diversity (need at least 2 active creatives)');
    }

    if (activeCreatives > 5) {
      issues.push('Too many active creatives may dilute performance');
    }

    const poorPerformers = performances.filter(p => p.performanceScore < 30).length;
    if (poorPerformers > performances.length * 0.3) {
      issues.push('High number of poor-performing creatives');
    }

    const decliningCreatives = performances.filter(p =>
      p.trends.ctrTrend === 'declining' || p.trends.cvrTrend === 'declining'
    ).length;
    if (decliningCreatives > performances.length * 0.5) {
      issues.push('Many creatives showing declining performance trends');
    }

    // Determine status
    let status: 'excellent' | 'good' | 'fair' | 'poor';
    if (avgScore >= 80 && issues.length === 0) status = 'excellent';
    else if (avgScore >= 65 && issues.length <= 1) status = 'good';
    else if (avgScore >= 45 && issues.length <= 2) status = 'fair';
    else status = 'poor';

    return {
      score: Math.round(avgScore),
      status,
      issues
    };
  }

  /**
   * Generate creative-specific insights
   */
  private generateCreativeInsights(
    creative: AdCreative,
    metrics: CreativeMetrics,
    trends: CreativePerformance['trends']
  ): string[] {
    const insights: string[] = [];

    // Performance insights
    if (metrics.ctr > 0.05) {
      insights.push(`Excellent CTR of ${(metrics.ctr * 100).toFixed(2)}% - well above average`);
    } else if (metrics.ctr < 0.01) {
      insights.push(`Low CTR of ${(metrics.ctr * 100).toFixed(2)}% needs attention`);
    }

    if (metrics.cvr > 0.03) {
      insights.push(`Strong conversion rate of ${(metrics.cvr * 100).toFixed(2)}%`);
    } else if (metrics.cvr < 0.005) {
      insights.push(`Low conversion rate of ${(metrics.cvr * 100).toFixed(2)}% may indicate relevance issues`);
    }

    if (metrics.roas > 3) {
      insights.push(`Excellent ROAS of ${metrics.roas.toFixed(1)}x generating strong returns`);
    } else if (metrics.roas < 1) {
      insights.push(`Poor ROAS of ${metrics.roas.toFixed(1)}x - not profitable`);
    }

    // Trend insights
    if (trends.ctrTrend === 'declining' && trends.trendConfidence > 0.5) {
      insights.push('CTR declining over time - may be experiencing creative fatigue');
    }

    if (trends.volumeTrend === 'shrinking' && trends.trendConfidence > 0.5) {
      insights.push('Impression volume decreasing - losing competitiveness in auctions');
    }

    // Quality insights
    if (metrics.qualityScore && metrics.qualityScore < 5) {
      insights.push(`Low Quality Score of ${metrics.qualityScore} limiting performance`);
    }

    // Creative age insights
    const ageInDays = Math.floor((Date.now() - creative.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (ageInDays > 90 && trends.ctrTrend === 'declining') {
      insights.push(`Creative is ${ageInDays} days old and showing fatigue signs`);
    }

    return insights;
  }

  /**
   * Generate creative-specific recommendations
   */
  private generateCreativeRecommendations(
    creative: AdCreative,
    metrics: CreativeMetrics,
    trends: CreativePerformance['trends']
  ): string[] {
    const recommendations: string[] = [];

    // Performance-based recommendations
    if (metrics.ctr < 0.01) {
      recommendations.push('Revise ad copy to improve relevance and appeal');
      if (creative.adType === 'responsive_search') {
        recommendations.push('Test new headline and description combinations');
      }
    }

    if (metrics.cvr < 0.005) {
      recommendations.push('Review landing page alignment with ad messaging');
      recommendations.push('Consider updating final URL to more relevant page');
    }

    if (metrics.roas < 1) {
      recommendations.push('Consider pausing this creative - not generating positive returns');
    }

    // Trend-based recommendations
    if (trends.ctrTrend === 'declining' && trends.trendConfidence > 0.6) {
      recommendations.push('Refresh creative assets to combat fatigue');
      recommendations.push('Test new creative angles or value propositions');
    }

    if (trends.volumeTrend === 'shrinking') {
      recommendations.push('Increase bid or improve ad rank factors');
      recommendations.push('Expand keyword targeting or add new ad groups');
    }

    // Quality-based recommendations
    if (metrics.qualityScore && metrics.qualityScore < 6) {
      recommendations.push('Improve ad relevance to keywords and landing page');
      recommendations.push('Review and optimize landing page user experience');
    }

    // Creative type specific recommendations
    if (creative.adType === 'responsive_search' && creative.content.headlines) {
      if (creative.content.headlines.length < 10) {
        recommendations.push('Add more headline variations to maximize reach');
      }
      if (creative.content.descriptions && creative.content.descriptions.length < 3) {
        recommendations.push('Add more description variations for better testing');
      }
    }

    return recommendations;
  }

  /**
   * Generate overall recommendations for the ad group
   */
  private generateRecommendations(
    performances: CreativePerformance[],
    health: CreativeAnalysisResult['overallHealth']
  ): CreativeAnalysisResult['recommendations'] {
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const strategic: string[] = [];

    // Immediate actions
    const poorPerformers = performances.filter(p => p.performanceScore < 20);
    if (poorPerformers.length > 0) {
      immediate.push(`Pause ${poorPerformers.length} poor-performing creative(s) with score < 20`);
    }

    const unprofitable = performances.filter(p => p.aggregatedMetrics.roas < 0.5);
    if (unprofitable.length > 0) {
      immediate.push(`Review ${unprofitable.length} unprofitable creative(s) with ROAS < 0.5`);
    }

    // Short-term actions
    const declining = performances.filter(p =>
      p.trends.ctrTrend === 'declining' && p.trends.trendConfidence > 0.5
    );
    if (declining.length > 0) {
      shortTerm.push(`Refresh ${declining.length} creative(s) showing fatigue signs`);
    }

    if (health.status === 'poor' || health.status === 'fair') {
      shortTerm.push('Develop new creative concepts to improve overall performance');
    }

    const activeCount = performances.filter(p => p.creative.status === 'enabled').length;
    if (activeCount < 2) {
      shortTerm.push('Create additional creatives for better testing and coverage');
    }

    // Strategic actions
    if (health.score < 60) {
      strategic.push('Conduct comprehensive creative audit and refresh strategy');
    }

    const topPerformer = performances[0];
    if (topPerformer && topPerformer.performanceScore > 80) {
      strategic.push('Analyze top-performing creative elements for scaling across campaigns');
    }

    strategic.push('Implement systematic creative testing and rotation schedule');
    strategic.push('Set up automated creative fatigue monitoring');

    return {
      immediate,
      shortTerm,
      strategic
    };
  }

  /**
   * Analyze current rotation strategy effectiveness
   */
  private async analyzeRotationStrategy(
    adGroupId: string,
    performances: CreativePerformance[]
  ): Promise<CreativeAnalysisResult['rotationAnalysis']> {
    // Get current rotation settings with graceful fallback
    let settings: any = null;
    let currentStrategy = 'unknown';

    try {
      // Try the full production schema first
      settings = this.database.prepare(`
        SELECT rotation_mode, rotation_preference
        FROM ad_group_settings
        WHERE ad_group_id = ?
      `).get(adGroupId);

      currentStrategy = settings?.rotation_mode || 'unknown';
    } catch (error) {
      // Fallback to simplified schema if ad_group_settings doesn't exist
      try {
        this.logger.debug('ad_group_settings table not found, falling back to ad_groups.rotation_strategy');
        const fallbackSettings = this.database.prepare(`
          SELECT rotation_strategy
          FROM ad_groups
          WHERE ad_group_id = ?
        `).get(adGroupId) as any;

        currentStrategy = fallbackSettings?.rotation_strategy || 'unknown';
      } catch (fallbackError) {
        this.logger.warn('Neither ad_group_settings nor ad_groups table found, using default strategy');
        currentStrategy = 'unknown';
      }
    }

    // Analyze effectiveness based on performance distribution
    const scores = performances.map(p => p.performanceScore);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const scoreVariance = this.calculateVariance(scores, avgScore);

    // High variance indicates rotation is not optimized
    const effectiveness = Math.max(0, 1 - (scoreVariance / 1000)); // Normalize variance

    // Recommend strategy based on creative performance
    let recommendedStrategy = 'optimized_for_conversions';

    if (performances.length < 2) {
      recommendedStrategy = 'need_more_creatives';
    } else if (scoreVariance < 100) {
      recommendedStrategy = 'even_rotation'; // Creatives perform similarly
    } else if (performances[0].performanceScore > performances[performances.length - 1].performanceScore + 30) {
      recommendedStrategy = 'optimized_for_conversions'; // Clear winner
    }

    return {
      strategy: currentStrategy === 'OPTIMIZE' ? 'optimized' :
                currentStrategy === 'ROTATE_EVENLY' ? 'even' : 'manual',
      effectiveness,
      recommendedStrategy
    };
  }

  /**
   * Calculate variance for a set of numbers
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;

    const sumSquaredDiffs = values.reduce((sum, value) => {
      const diff = value - mean;
      return sum + (diff * diff);
    }, 0);

    return sumSquaredDiffs / values.length;
  }

  /**
   * Get creative performance comparison between two periods
   */
  async compareCreativePerformance(
    adId: string,
    period1Days: number,
    period2Days: number
  ): Promise<{
    period1: CreativeMetrics;
    period2: CreativeMetrics;
    changes: {
      ctrChange: number;
      cvrChange: number;
      roasChange: number;
      volumeChange: number;
    };
    significance: number;
  }> {
    // Get metrics for both periods
    const period1End = period2Days;
    const period1Start = period1Days + period2Days;

    const period1Metrics = await this.getCreativeMetricsPeriod(adId, period1Start, period1End);
    const period2Metrics = await this.getCreativeMetricsPeriod(adId, period2Days, 0);

    const period1Agg = this.aggregateMetrics(period1Metrics);
    const period2Agg = this.aggregateMetrics(period2Metrics);

    // Calculate changes
    const changes = {
      ctrChange: this.calculatePercentChange(period1Agg.ctr, period2Agg.ctr),
      cvrChange: this.calculatePercentChange(period1Agg.cvr, period2Agg.cvr),
      roasChange: this.calculatePercentChange(period1Agg.roas, period2Agg.roas),
      volumeChange: this.calculatePercentChange(period1Agg.impressions, period2Agg.impressions)
    };

    // Calculate statistical significance (simplified)
    const totalImpressions = period1Agg.impressions + period2Agg.impressions;
    const significance = Math.min(totalImpressions / 10000, 1);

    return {
      period1: period1Agg,
      period2: period2Agg,
      changes,
      significance
    };
  }

  /**
   * Get creative metrics for a specific period
   */
  private async getCreativeMetricsPeriod(
    adId: string,
    daysAgo: number,
    daysAgoEnd: number
  ): Promise<CreativeMetrics[]> {
    const metrics = this.database.prepare(`
      SELECT
        ad_id,
        date as period,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value
      FROM daily_performance
      WHERE ad_id = ?
        AND date <= date('now', '-' || ? || ' days')
        AND date > date('now', '-' || ? || ' days')
      GROUP BY ad_id, date
      ORDER BY date
    `).all(adId, daysAgoEnd, daysAgo) as any[];

    return metrics.map(row => ({
      adId: row.ad_id,
      period: row.period,
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      conversions: row.conversions || 0,
      cost: row.cost || 0,
      conversionValue: row.conversion_value || 0,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) : 0,
      cvr: row.clicks > 0 ? (row.conversions / row.clicks) : 0,
      cpa: row.conversions > 0 ? (row.cost / row.conversions) : 0,
      roas: row.cost > 0 ? (row.conversion_value / row.cost) : 0
    }));
  }

  /**
   * Calculate percent change between two values
   */
  private calculatePercentChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }
}