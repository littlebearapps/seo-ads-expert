/**
 * Bid Adjustment Calculator
 *
 * Calculates optimal bid adjustments based on performance segments.
 * Provides confidence scoring for each adjustment recommendation.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';

export interface BidAdjustment {
  dimension: 'device' | 'location' | 'schedule' | 'audience' | 'demographic' | 'keyword';
  segment: string;
  currentBidModifier: number;
  recommendedBidModifier: number;
  expectedImpact: {
    impressions: number;
    clicks: number;
    conversions: number;
    cost: number;
    ROAS: number;
  };
  confidence: number;
  rationale: string;
  dataPoints: number;
}

export interface SegmentPerformance {
  segment: string;
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
}

export interface AdjustmentStrategy {
  objective: 'maximize_conversions' | 'target_cpa' | 'target_roas' | 'maximize_clicks' | 'balanced';
  constraints: {
    maxBidModifier: number;
    minBidModifier: number;
    budgetLimit?: number;
    targetCPA?: number;
    targetROAS?: number;
  };
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
}

export class BidAdjustmentCalculator {
  private readonly MIN_DATA_POINTS = 30;
  private readonly MIN_CONVERSIONS = 3;
  private readonly CONFIDENCE_THRESHOLD = 0.7;

  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Calculate all bid adjustments for a campaign
   */
  async calculateBidAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<{
    adjustments: BidAdjustment[];
    totalExpectedImpact: {
      impressions: number;
      clicks: number;
      conversions: number;
      cost: number;
      ROAS: number;
    };
    implementationPriority: BidAdjustment[];
  }> {
    this.logger.info('Calculating bid adjustments', { campaignId, strategy });

    // Calculate adjustments for each dimension
    const [device, location, schedule, audience, demographic, keyword] = await Promise.all([
      this.calculateDeviceAdjustments(campaignId, strategy),
      this.calculateLocationAdjustments(campaignId, strategy),
      this.calculateScheduleAdjustments(campaignId, strategy),
      this.calculateAudienceAdjustments(campaignId, strategy),
      this.calculateDemographicAdjustments(campaignId, strategy),
      this.calculateKeywordAdjustments(campaignId, strategy)
    ]);

    // Combine all adjustments
    const allAdjustments = [
      ...device,
      ...location,
      ...schedule,
      ...audience,
      ...demographic,
      ...keyword
    ];

    // Calculate total expected impact
    const totalExpectedImpact = this.calculateTotalImpact(allAdjustments);

    // Prioritize adjustments by expected value
    const implementationPriority = this.prioritizeAdjustments(allAdjustments, strategy);

    return {
      adjustments: allAdjustments,
      totalExpectedImpact,
      implementationPriority
    };
  }

  /**
   * Calculate device bid adjustments
   */
  private async calculateDeviceAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<BidAdjustment[]> {
    const deviceData = this.database.prepare(`
      SELECT
        device_type as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        COUNT(*) as data_points
      FROM device_performance
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY device_type
    `).all(campaignId) as any[];

    const adjustments: BidAdjustment[] = [];
    const campaignAvg = this.getCampaignAverages(campaignId);

    for (const device of deviceData) {
      if (device.data_points < this.MIN_DATA_POINTS) continue;

      const performance = this.calculateSegmentPerformance(device);
      const adjustment = this.calculateOptimalAdjustment(
        performance,
        campaignAvg,
        strategy,
        'device'
      );

      if (adjustment) {
        adjustments.push({
          ...adjustment,
          dimension: 'device',
          segment: device.segment,
          dataPoints: device.data_points
        });
      }
    }

    return adjustments;
  }

  /**
   * Calculate location bid adjustments
   */
  private async calculateLocationAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<BidAdjustment[]> {
    const locationData = this.database.prepare(`
      SELECT
        geo_location as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        COUNT(*) as data_points
      FROM geo_performance
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY geo_location
      HAVING data_points >= ?
    `).all(campaignId, this.MIN_DATA_POINTS) as any[];

    const adjustments: BidAdjustment[] = [];
    const campaignAvg = this.getCampaignAverages(campaignId);

    // Group locations by performance tiers
    const tiers = this.groupLocationsByPerformance(locationData);

    for (const tier of ['top', 'average', 'bottom']) {
      const locations = tiers[tier];
      if (!locations || locations.length === 0) continue;

      // Aggregate tier performance
      const tierPerf = this.aggregatePerformance(locations);
      const adjustment = this.calculateOptimalAdjustment(
        tierPerf,
        campaignAvg,
        strategy,
        'location'
      );

      if (adjustment) {
        adjustments.push({
          ...adjustment,
          dimension: 'location',
          segment: `${tier}_tier_locations`,
          dataPoints: locations.reduce((sum, l) => sum + l.data_points, 0)
        });
      }
    }

    return adjustments;
  }

  /**
   * Calculate schedule bid adjustments
   */
  private async calculateScheduleAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<BidAdjustment[]> {
    const scheduleData = this.database.prepare(`
      SELECT
        CASE
          WHEN CAST(strftime('%H', datetime) as INTEGER) BETWEEN 6 AND 11 THEN 'morning'
          WHEN CAST(strftime('%H', datetime) as INTEGER) BETWEEN 12 AND 17 THEN 'afternoon'
          WHEN CAST(strftime('%H', datetime) as INTEGER) BETWEEN 18 AND 23 THEN 'evening'
          ELSE 'night'
        END as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        COUNT(*) as data_points
      FROM fact_channel_spend_hourly
      WHERE campaign_id = ?
        AND datetime >= datetime('now', '-30 days')
      GROUP BY segment
    `).all(campaignId) as any[];

    const adjustments: BidAdjustment[] = [];
    const campaignAvg = this.getCampaignAverages(campaignId);

    for (const schedule of scheduleData) {
      if (schedule.data_points < this.MIN_DATA_POINTS) continue;

      const performance = this.calculateSegmentPerformance(schedule);
      const adjustment = this.calculateOptimalAdjustment(
        performance,
        campaignAvg,
        strategy,
        'schedule'
      );

      if (adjustment) {
        adjustments.push({
          ...adjustment,
          dimension: 'schedule',
          segment: schedule.segment,
          dataPoints: schedule.data_points
        });
      }
    }

    // Add day of week adjustments
    const dayOfWeekData = this.database.prepare(`
      SELECT
        CASE CAST(strftime('%w', date) as INTEGER)
          WHEN 0 THEN 'Sunday'
          WHEN 1 THEN 'Monday'
          WHEN 2 THEN 'Tuesday'
          WHEN 3 THEN 'Wednesday'
          WHEN 4 THEN 'Thursday'
          WHEN 5 THEN 'Friday'
          WHEN 6 THEN 'Saturday'
        END as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        COUNT(*) as data_points
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY segment
    `).all(campaignId) as any[];

    for (const day of dayOfWeekData) {
      if (day.data_points < 4) continue; // At least 4 weeks of data

      const performance = this.calculateSegmentPerformance(day);
      const adjustment = this.calculateOptimalAdjustment(
        performance,
        campaignAvg,
        strategy,
        'schedule'
      );

      if (adjustment) {
        adjustments.push({
          ...adjustment,
          dimension: 'schedule',
          segment: day.segment,
          dataPoints: day.data_points
        });
      }
    }

    return adjustments;
  }

  /**
   * Calculate audience bid adjustments
   */
  private async calculateAudienceAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<BidAdjustment[]> {
    const audienceData = this.database.prepare(`
      SELECT
        audience_segment as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        COUNT(*) as data_points
      FROM audience_performance
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY audience_segment
      HAVING data_points >= ?
    `).all(campaignId, this.MIN_DATA_POINTS) as any[];

    const adjustments: BidAdjustment[] = [];
    const campaignAvg = this.getCampaignAverages(campaignId);

    for (const audience of audienceData) {
      const performance = this.calculateSegmentPerformance(audience);
      const adjustment = this.calculateOptimalAdjustment(
        performance,
        campaignAvg,
        strategy,
        'audience'
      );

      if (adjustment) {
        adjustments.push({
          ...adjustment,
          dimension: 'audience',
          segment: audience.segment,
          dataPoints: audience.data_points
        });
      }
    }

    return adjustments;
  }

  /**
   * Calculate demographic bid adjustments
   */
  private async calculateDemographicAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<BidAdjustment[]> {
    const demographicData = this.database.prepare(`
      SELECT
        age_range || '_' || gender as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        COUNT(*) as data_points
      FROM demographic_performance
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY age_range, gender
      HAVING data_points >= ?
    `).all(campaignId, this.MIN_DATA_POINTS) as any[];

    const adjustments: BidAdjustment[] = [];
    const campaignAvg = this.getCampaignAverages(campaignId);

    for (const demo of demographicData) {
      const performance = this.calculateSegmentPerformance(demo);
      const adjustment = this.calculateOptimalAdjustment(
        performance,
        campaignAvg,
        strategy,
        'demographic'
      );

      if (adjustment) {
        adjustments.push({
          ...adjustment,
          dimension: 'demographic',
          segment: demo.segment,
          dataPoints: demo.data_points
        });
      }
    }

    return adjustments;
  }

  /**
   * Calculate keyword bid adjustments
   */
  private async calculateKeywordAdjustments(
    campaignId: string,
    strategy: AdjustmentStrategy
  ): Promise<BidAdjustment[]> {
    const keywordData = this.database.prepare(`
      SELECT
        keyword as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value,
        AVG(quality_score) as quality_score,
        AVG(avg_position) as avg_position,
        COUNT(*) as data_points
      FROM keyword_performance_daily
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY keyword
      HAVING data_points >= ? AND conversions >= ?
    `).all(campaignId, this.MIN_DATA_POINTS / 3, this.MIN_CONVERSIONS) as any[];

    const adjustments: BidAdjustment[] = [];
    const campaignAvg = this.getCampaignAverages(campaignId);

    for (const keyword of keywordData) {
      const performance = this.calculateSegmentPerformance(keyword);
      performance.qualityScore = keyword.quality_score;

      const adjustment = this.calculateOptimalAdjustment(
        performance,
        campaignAvg,
        strategy,
        'keyword'
      );

      if (adjustment) {
        // Factor in quality score for keywords
        if (keyword.quality_score < 5) {
          adjustment.recommendedBidModifier *= 0.9; // Reduce bids for low QS
          adjustment.rationale += ' (adjusted for low QS)';
        } else if (keyword.quality_score >= 8) {
          adjustment.recommendedBidModifier *= 1.1; // Increase bids for high QS
          adjustment.rationale += ' (boosted for high QS)';
        }

        adjustments.push({
          ...adjustment,
          dimension: 'keyword',
          segment: keyword.segment,
          dataPoints: keyword.data_points
        });
      }
    }

    return adjustments;
  }

  /**
   * Get campaign average performance
   */
  private getCampaignAverages(campaignId: string): SegmentPerformance {
    const avgData = this.database.prepare(`
      SELECT
        'campaign_avg' as segment,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        SUM(conversion_value) as conversion_value
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
    `).get(campaignId) as any;

    return this.calculateSegmentPerformance(avgData);
  }

  /**
   * Calculate segment performance metrics
   */
  private calculateSegmentPerformance(data: any): SegmentPerformance {
    const clicks = data.clicks || 0;
    const impressions = data.impressions || 0;
    const conversions = data.conversions || 0;
    const cost = data.cost || 0;
    const conversionValue = data.conversion_value || 0;

    return {
      segment: data.segment,
      impressions,
      clicks,
      conversions,
      cost,
      conversionValue,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cvr: clicks > 0 ? conversions / clicks : 0,
      cpa: conversions > 0 ? cost / conversions : 0,
      roas: cost > 0 ? conversionValue / cost : 0
    };
  }

  /**
   * Calculate optimal bid adjustment
   */
  private calculateOptimalAdjustment(
    segmentPerf: SegmentPerformance,
    campaignAvg: SegmentPerformance,
    strategy: AdjustmentStrategy,
    dimension: string
  ): Omit<BidAdjustment, 'dimension' | 'segment' | 'dataPoints'> | null {
    // Skip if insufficient data
    if (segmentPerf.clicks < 10 && segmentPerf.conversions < this.MIN_CONVERSIONS) {
      return null;
    }

    let modifier = 1;
    let rationale = '';

    // Calculate based on strategy objective
    switch (strategy.objective) {
      case 'maximize_conversions':
        // Boost segments with high CVR
        if (campaignAvg.cvr > 0) {
          modifier = segmentPerf.cvr / campaignAvg.cvr;
          rationale = `CVR ${(segmentPerf.cvr * 100).toFixed(1)}% vs avg ${(campaignAvg.cvr * 100).toFixed(1)}%`;
        }
        break;

      case 'target_cpa':
        // Adjust based on CPA performance
        if (strategy.constraints.targetCPA && segmentPerf.cpa > 0) {
          modifier = strategy.constraints.targetCPA / segmentPerf.cpa;
          rationale = `CPA $${segmentPerf.cpa.toFixed(2)} vs target $${strategy.constraints.targetCPA}`;
        }
        break;

      case 'target_roas':
        // Adjust based on ROAS performance
        if (strategy.constraints.targetROAS && segmentPerf.roas > 0) {
          modifier = segmentPerf.roas / strategy.constraints.targetROAS;
          rationale = `ROAS ${segmentPerf.roas.toFixed(1)}x vs target ${strategy.constraints.targetROAS}x`;
        }
        break;

      case 'maximize_clicks':
        // Boost segments with high CTR and low CPC
        if (campaignAvg.ctr > 0) {
          const ctrRatio = segmentPerf.ctr / campaignAvg.ctr;
          const cpcRatio = campaignAvg.cost / campaignAvg.clicks /
                          (segmentPerf.cost / segmentPerf.clicks);
          modifier = (ctrRatio + cpcRatio) / 2;
          rationale = `CTR ${(segmentPerf.ctr * 100).toFixed(1)}% and efficient CPC`;
        }
        break;

      case 'balanced':
        // Balance multiple metrics
        const cvrWeight = 0.4;
        const roasWeight = 0.3;
        const ctrWeight = 0.3;

        let score = 0;
        if (campaignAvg.cvr > 0) score += (segmentPerf.cvr / campaignAvg.cvr) * cvrWeight;
        if (campaignAvg.roas > 0) score += (segmentPerf.roas / campaignAvg.roas) * roasWeight;
        if (campaignAvg.ctr > 0) score += (segmentPerf.ctr / campaignAvg.ctr) * ctrWeight;

        modifier = score / (cvrWeight + roasWeight + ctrWeight);
        rationale = 'Balanced performance optimization';
        break;
    }

    // Apply aggressiveness factor
    const aggressivenessFactor = {
      'conservative': 0.5,
      'moderate': 0.75,
      'aggressive': 1.0
    }[strategy.aggressiveness];

    // Scale the adjustment
    modifier = 1 + (modifier - 1) * aggressivenessFactor;

    // Apply constraints
    modifier = Math.max(
      strategy.constraints.minBidModifier,
      Math.min(strategy.constraints.maxBidModifier, modifier)
    );

    // Skip if adjustment is too small
    if (Math.abs(modifier - 1) < 0.05) {
      return null;
    }

    // Calculate expected impact
    const expectedImpact = this.calculateExpectedImpact(
      segmentPerf,
      modifier,
      campaignAvg
    );

    // Calculate confidence
    const confidence = this.calculateConfidence(
      segmentPerf,
      campaignAvg,
      dimension
    );

    return {
      currentBidModifier: 1,
      recommendedBidModifier: Math.round(modifier * 100) / 100,
      expectedImpact,
      confidence,
      rationale
    };
  }

  /**
   * Calculate expected impact of bid adjustment
   */
  private calculateExpectedImpact(
    segmentPerf: SegmentPerformance,
    modifier: number,
    campaignAvg: SegmentPerformance
  ): BidAdjustment['expectedImpact'] {
    // Simplified impact model
    const clickElasticity = 0.5; // 50% of bid change translates to click change
    const conversionElasticity = 0.3; // 30% for conversions

    const bidChange = modifier - 1;

    return {
      impressions: segmentPerf.impressions * (1 + bidChange * 0.8),
      clicks: segmentPerf.clicks * (1 + bidChange * clickElasticity),
      conversions: segmentPerf.conversions * (1 + bidChange * conversionElasticity),
      cost: segmentPerf.cost * modifier,
      ROAS: segmentPerf.roas // Assume ROAS remains stable
    };
  }

  /**
   * Calculate confidence score for adjustment
   */
  private calculateConfidence(
    segmentPerf: SegmentPerformance,
    campaignAvg: SegmentPerformance,
    dimension: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Data volume factor
    const dataVolume = Math.min(segmentPerf.clicks / 100, 1);
    confidence += dataVolume * 0.2;

    // Conversion volume factor
    const conversionVolume = Math.min(segmentPerf.conversions / 10, 1);
    confidence += conversionVolume * 0.2;

    // Statistical significance (simplified)
    if (segmentPerf.conversions >= 20) {
      confidence += 0.1;
    }

    // Dimension-specific adjustments
    if (dimension === 'device') {
      confidence += 0.1; // Device data is usually reliable
    } else if (dimension === 'keyword' && segmentPerf.qualityScore) {
      if (segmentPerf.qualityScore >= 7) {
        confidence += 0.05;
      }
    }

    return Math.min(confidence, 1);
  }

  /**
   * Group locations by performance tiers
   */
  private groupLocationsByPerformance(locations: any[]): Record<string, any[]> {
    // Calculate performance score for each location
    const scoredLocations = locations.map(loc => {
      const perf = this.calculateSegmentPerformance(loc);
      const score = perf.cvr * 0.5 + (perf.roas / 10) * 0.5; // Simple scoring
      return { ...loc, score };
    });

    // Sort by score
    scoredLocations.sort((a, b) => b.score - a.score);

    // Divide into tiers
    const tierSize = Math.ceil(scoredLocations.length / 3);

    return {
      top: scoredLocations.slice(0, tierSize),
      average: scoredLocations.slice(tierSize, tierSize * 2),
      bottom: scoredLocations.slice(tierSize * 2)
    };
  }

  /**
   * Aggregate performance across multiple segments
   */
  private aggregatePerformance(segments: any[]): SegmentPerformance {
    const aggregated = {
      segment: 'aggregated',
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      conversion_value: 0
    };

    for (const segment of segments) {
      aggregated.impressions += segment.impressions || 0;
      aggregated.clicks += segment.clicks || 0;
      aggregated.conversions += segment.conversions || 0;
      aggregated.cost += segment.cost || 0;
      aggregated.conversion_value += segment.conversion_value || 0;
    }

    return this.calculateSegmentPerformance(aggregated);
  }

  /**
   * Calculate total expected impact
   */
  private calculateTotalImpact(adjustments: BidAdjustment[]): BidAdjustment['expectedImpact'] {
    return adjustments.reduce((total, adj) => ({
      impressions: total.impressions + (adj.expectedImpact.impressions || 0),
      clicks: total.clicks + (adj.expectedImpact.clicks || 0),
      conversions: total.conversions + (adj.expectedImpact.conversions || 0),
      cost: total.cost + (adj.expectedImpact.cost || 0),
      ROAS: total.ROAS + (adj.expectedImpact.ROAS || 0) / adjustments.length
    }), {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      ROAS: 0
    });
  }

  /**
   * Prioritize adjustments for implementation
   */
  private prioritizeAdjustments(
    adjustments: BidAdjustment[],
    strategy: AdjustmentStrategy
  ): BidAdjustment[] {
    // Score each adjustment
    const scored = adjustments.map(adj => {
      let score = 0;

      // Confidence weight
      score += adj.confidence * 30;

      // Expected impact weight
      switch (strategy.objective) {
        case 'maximize_conversions':
          score += (adj.expectedImpact.conversions - adj.expectedImpact.cost / 100) * 10;
          break;
        case 'target_roas':
          score += adj.expectedImpact.ROAS * 20;
          break;
        case 'maximize_clicks':
          score += (adj.expectedImpact.clicks - adj.expectedImpact.cost / 50) * 5;
          break;
        default:
          score += adj.expectedImpact.conversions * 10;
      }

      // Magnitude of change
      const changeMagnitude = Math.abs(adj.recommendedBidModifier - 1);
      score += changeMagnitude * 20;

      // Data quality
      score += Math.min(adj.dataPoints / 100, 10);

      return { ...adj, score };
    });

    // Sort by score and filter by confidence
    return scored
      .filter(adj => adj.confidence >= this.CONFIDENCE_THRESHOLD)
      .sort((a, b) => (b as any).score - (a as any).score)
      .map(({ score, ...adj }) => adj)
      .slice(0, 10); // Top 10 priorities
  }

  /**
   * Apply bid adjustments to campaign
   */
  async applyBidAdjustments(
    campaignId: string,
    adjustments: BidAdjustment[],
    testMode: boolean = false
  ): Promise<{ success: boolean; applied: number; errors: string[] }> {
    const errors: string[] = [];
    let applied = 0;

    for (const adjustment of adjustments) {
      try {
        if (testMode) {
          this.logger.info('Test mode - would apply adjustment', { adjustment });
        } else {
          // Store adjustment in database
          this.database.prepare(`
            INSERT INTO bid_adjustments (
              campaign_id,
              dimension,
              segment,
              bid_modifier,
              confidence,
              rationale,
              applied_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            campaignId,
            adjustment.dimension,
            adjustment.segment,
            adjustment.recommendedBidModifier,
            adjustment.confidence,
            adjustment.rationale
          );

          applied++;
        }
      } catch (error) {
        errors.push(`Failed to apply ${adjustment.dimension}:${adjustment.segment} - ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      applied,
      errors
    };
  }
}