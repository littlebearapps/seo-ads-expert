/**
 * Metric Aggregator and Monitoring Dashboard
 *
 * Aggregates real-time metrics and provides dashboard views for monitoring.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';
import { format, subDays, subHours, startOfDay, endOfDay } from 'date-fns';

export interface MetricSnapshot {
  timestamp: Date;
  campaigns: CampaignMetrics[];
  summary: OverallSummary;
  alerts: Alert[];
  recommendations: Recommendation[];
}

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  current: {
    spend: number;
    clicks: number;
    conversions: number;
    revenue: number;
    impressions: number;
    ctr: number;
    cvr: number;
    cpc: number;
    cpa: number;
    roas: number;
  };
  comparison: {
    period: 'hour' | 'day' | 'week';
    spendChange: number;
    clicksChange: number;
    conversionsChange: number;
    ctrChange: number;
    cvrChange: number;
    cpaChange: number;
  };
  budget: {
    daily: number;
    spent: number;
    remaining: number;
    utilization: number;
    projectedEnd: Date | null;
  };
  performance: {
    score: number; // 0-100
    trend: 'improving' | 'stable' | 'declining';
    confidence: number; // 0-1
  };
}

export interface OverallSummary {
  totalSpend: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  avgCTR: number;
  avgCVR: number;
  avgCPA: number;
  overallROAS: number;
  budgetUtilization: number;
  performanceScore: number;
}

export interface Alert {
  id: string;
  type: 'budget' | 'performance' | 'anomaly' | 'opportunity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  campaignId?: string;
  message: string;
  timestamp: Date;
  actionRequired: boolean;
}

export interface Recommendation {
  id: string;
  type: 'budget_increase' | 'budget_decrease' | 'bid_adjustment' | 'pause_campaign' | 'investigate';
  campaignId: string;
  action: string;
  expectedImpact: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
}

export interface DashboardFilters {
  campaignIds?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  metrics?: string[];
  includeAlerts?: boolean;
  includeRecommendations?: boolean;
}

export class MetricAggregator {
  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Get current metric snapshot
   */
  async getSnapshot(filters?: DashboardFilters): Promise<MetricSnapshot> {
    const campaignIds = filters?.campaignIds || await this.getAllCampaignIds();
    const campaigns = await this.getCampaignMetrics(campaignIds, filters);
    const summary = this.calculateSummary(campaigns);
    const alerts = await this.getActiveAlerts(campaignIds);
    const recommendations = await this.getRecommendations(campaignIds);

    return {
      timestamp: new Date(),
      campaigns,
      summary,
      alerts,
      recommendations,
    };
  }

  /**
   * Get all campaign IDs from database
   */
  private async getAllCampaignIds(): Promise<string[]> {
    try {
      const rows = this.database.prepare(`
        SELECT DISTINCT campaign_id
        FROM fact_channel_spend
        WHERE date >= date('now', '-30 days')
      `).all() as any[];

      return rows.map(r => r.campaign_id);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get metrics for campaigns
   */
  private async getCampaignMetrics(
    campaignIds: string[],
    filters?: DashboardFilters
  ): Promise<CampaignMetrics[]> {
    const metrics: CampaignMetrics[] = [];

    for (const campaignId of campaignIds) {
      const current = await this.getCurrentMetrics(campaignId, filters);
      const comparison = await this.getComparison(campaignId, 'day');
      const budget = await this.getBudgetStatus(campaignId);
      const performance = await this.getPerformanceScore(campaignId);

      metrics.push({
        campaignId,
        campaignName: `Campaign ${campaignId}`,
        current,
        comparison,
        budget,
        performance,
      });
    }

    return metrics;
  }

  /**
   * Get current metrics for a campaign
   */
  private async getCurrentMetrics(campaignId: string, filters?: DashboardFilters): Promise<any> {
    const dateFilter = filters?.dateRange
      ? `AND date >= '${format(filters.dateRange.start, 'yyyy-MM-dd')}'
         AND date <= '${format(filters.dateRange.end, 'yyyy-MM-dd')}'`
      : `AND date = date('now')`;

    try {
      const row = this.database.prepare(`
        SELECT
          SUM(cost) as spend,
          SUM(clicks) as clicks,
          SUM(conversions) as conversions,
          SUM(conversion_value) as revenue,
          SUM(impressions) as impressions
        FROM fact_channel_spend
        WHERE campaign_id = ?
        ${dateFilter}
      `).get(campaignId) as any;

      if (!row) {
        return this.getDefaultMetrics();
      }

      const spend = row.spend || 0;
      const clicks = row.clicks || 0;
      const conversions = row.conversions || 0;
      const revenue = row.revenue || 0;
      const impressions = row.impressions || 0;

      return {
        spend,
        clicks,
        conversions,
        revenue,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cvr: clicks > 0 ? conversions / clicks : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpa: conversions > 0 ? spend / conversions : 0,
        roas: spend > 0 ? revenue / spend : 0,
      };
    } catch (error) {
      return this.getDefaultMetrics();
    }
  }

  /**
   * Get default metrics when data is unavailable
   */
  private getDefaultMetrics(): any {
    return {
      spend: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      impressions: 0,
      ctr: 0,
      cvr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
    };
  }

  /**
   * Get comparison metrics
   */
  private async getComparison(
    campaignId: string,
    period: 'hour' | 'day' | 'week'
  ): Promise<any> {
    const current = await this.getCurrentMetrics(campaignId);

    let previousDate: string;
    switch (period) {
      case 'hour':
        previousDate = format(subHours(new Date(), 1), 'yyyy-MM-dd HH:00:00');
        break;
      case 'day':
        previousDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');
        break;
      case 'week':
        previousDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        break;
    }

    const previous = await this.getMetricsForDate(campaignId, previousDate);

    return {
      period,
      spendChange: this.calculateChange(current.spend, previous.spend),
      clicksChange: this.calculateChange(current.clicks, previous.clicks),
      conversionsChange: this.calculateChange(current.conversions, previous.conversions),
      ctrChange: this.calculateChange(current.ctr, previous.ctr),
      cvrChange: this.calculateChange(current.cvr, previous.cvr),
      cpaChange: this.calculateChange(current.cpa, previous.cpa),
    };
  }

  /**
   * Get metrics for a specific date
   */
  private async getMetricsForDate(campaignId: string, date: string): Promise<any> {
    try {
      const row = this.database.prepare(`
        SELECT
          SUM(cost) as spend,
          SUM(clicks) as clicks,
          SUM(conversions) as conversions,
          SUM(conversion_value) as revenue,
          SUM(impressions) as impressions
        FROM fact_channel_spend
        WHERE campaign_id = ?
        AND date = date(?)
      `).get(campaignId, date) as any;

      if (!row) {
        return this.getDefaultMetrics();
      }

      return {
        spend: row.spend || 0,
        clicks: row.clicks || 0,
        conversions: row.conversions || 0,
        revenue: row.revenue || 0,
        impressions: row.impressions || 0,
        ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
        cvr: row.clicks > 0 ? row.conversions / row.clicks : 0,
        cpc: row.clicks > 0 ? row.spend / row.clicks : 0,
        cpa: row.conversions > 0 ? row.spend / row.conversions : 0,
        roas: row.spend > 0 ? row.revenue / row.spend : 0,
      };
    } catch (error) {
      return this.getDefaultMetrics();
    }
  }

  /**
   * Calculate percentage change
   */
  private calculateChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  /**
   * Get budget status for a campaign
   */
  private async getBudgetStatus(campaignId: string): Promise<any> {
    // Get daily budget (would normally come from Google Ads API)
    const dailyBudget = await this.getDailyBudget(campaignId);

    // Get today's spend
    const todaySpend = await this.getTodaySpend(campaignId);

    const remaining = Math.max(0, dailyBudget - todaySpend);
    const utilization = dailyBudget > 0 ? todaySpend / dailyBudget : 0;

    // Project when budget will be depleted
    const hoursIntoDay = new Date().getHours();
    const currentRate = hoursIntoDay > 0 ? todaySpend / hoursIntoDay : 0;
    const hoursRemaining = remaining > 0 && currentRate > 0
      ? remaining / currentRate
      : null;

    const projectedEnd = hoursRemaining !== null
      ? new Date(Date.now() + hoursRemaining * 60 * 60 * 1000)
      : null;

    return {
      daily: dailyBudget,
      spent: todaySpend,
      remaining,
      utilization,
      projectedEnd,
    };
  }

  /**
   * Get daily budget for a campaign
   */
  private async getDailyBudget(campaignId: string): Promise<number> {
    // This would normally query Google Ads API
    // For now, return a default or from ts_arms table
    try {
      const row = this.database.prepare(`
        SELECT entity_id, alpha
        FROM ts_arms
        WHERE entity_id = ?
        AND arm_type = 'campaign'
      `).get(campaignId) as any;

      // Use alpha as a proxy for budget (simplified)
      return row ? 20 + row.alpha * 2 : 30;
    } catch (error) {
      return 30; // Default $30 daily budget
    }
  }

  /**
   * Get today's spend for a campaign
   */
  private async getTodaySpend(campaignId: string): Promise<number> {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const row = this.database.prepare(`
        SELECT SUM(cost) as spend
        FROM fact_channel_spend
        WHERE campaign_id = ?
        AND date = ?
      `).get(campaignId, today) as any;

      return row?.spend || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate performance score
   */
  private async getPerformanceScore(campaignId: string): Promise<any> {
    const metrics = await this.getCurrentMetrics(campaignId);
    const historical = await this.getHistoricalAverage(campaignId);

    // Calculate component scores
    const ctrScore = this.scoreMetric(metrics.ctr, historical.avgCTR, 'higher');
    const cvrScore = this.scoreMetric(metrics.cvr, historical.avgCVR, 'higher');
    const cpaScore = this.scoreMetric(metrics.cpa, historical.avgCPA, 'lower');
    const roasScore = this.scoreMetric(metrics.roas, historical.avgROAS, 'higher');

    // Weighted average
    const score = (ctrScore * 0.2 + cvrScore * 0.3 + cpaScore * 0.3 + roasScore * 0.2) * 100;

    // Determine trend
    const recentTrend = await this.getRecentTrend(campaignId);
    const trend = recentTrend > 0.05 ? 'improving' : recentTrend < -0.05 ? 'declining' : 'stable';

    // Calculate confidence based on sample size
    const sampleSize = metrics.clicks;
    const confidence = Math.min(1, Math.sqrt(sampleSize / 100));

    return {
      score: Math.round(score),
      trend,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Get historical average metrics
   */
  private async getHistoricalAverage(campaignId: string): Promise<any> {
    try {
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

      const row = this.database.prepare(`
        SELECT
          AVG(clicks * 1.0 / NULLIF(impressions, 0)) as avg_ctr,
          AVG(conversions * 1.0 / NULLIF(clicks, 0)) as avg_cvr,
          AVG(cost * 1.0 / NULLIF(conversions, 0)) as avg_cpa,
          AVG(conversion_value * 1.0 / NULLIF(cost, 0)) as avg_roas
        FROM fact_channel_spend
        WHERE campaign_id = ?
        AND date >= ?
      `).get(campaignId, thirtyDaysAgo) as any;

      return {
        avgCTR: row?.avg_ctr || 0.02,
        avgCVR: row?.avg_cvr || 0.02,
        avgCPA: row?.avg_cpa || 50,
        avgROAS: row?.avg_roas || 2,
      };
    } catch (error) {
      return {
        avgCTR: 0.02,
        avgCVR: 0.02,
        avgCPA: 50,
        avgROAS: 2,
      };
    }
  }

  /**
   * Score a metric against baseline
   */
  private scoreMetric(current: number, baseline: number, direction: 'higher' | 'lower'): number {
    if (baseline === 0) return 0.5;

    const ratio = current / baseline;

    if (direction === 'higher') {
      // Higher is better
      return Math.min(1, Math.max(0, ratio));
    } else {
      // Lower is better
      return Math.min(1, Math.max(0, 2 - ratio));
    }
  }

  /**
   * Get recent performance trend
   */
  private async getRecentTrend(campaignId: string): Promise<number> {
    try {
      const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

      const rows = this.database.prepare(`
        SELECT
          date,
          conversions * 1.0 / NULLIF(clicks, 0) as cvr
        FROM fact_channel_spend
        WHERE campaign_id = ?
        AND date >= ?
        ORDER BY date
      `).all(campaignId, sevenDaysAgo) as any[];

      if (rows.length < 2) return 0;

      // Calculate linear trend
      const n = rows.length;
      const sumX = n * (n + 1) / 2;
      const sumY = rows.reduce((sum, r) => sum + (r.cvr || 0), 0);
      const sumXY = rows.reduce((sum, r, i) => sum + (i + 1) * (r.cvr || 0), 0);
      const sumX2 = n * (n + 1) * (2 * n + 1) / 6;

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

      return slope;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate overall summary
   */
  private calculateSummary(campaigns: CampaignMetrics[]): OverallSummary {
    const totals = campaigns.reduce((acc, c) => ({
      spend: acc.spend + c.current.spend,
      clicks: acc.clicks + c.current.clicks,
      conversions: acc.conversions + c.current.conversions,
      revenue: acc.revenue + c.current.revenue,
      impressions: acc.impressions + c.current.impressions,
      budgetTotal: acc.budgetTotal + c.budget.daily,
      budgetSpent: acc.budgetSpent + c.budget.spent,
      performanceSum: acc.performanceSum + c.performance.score,
    }), {
      spend: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      impressions: 0,
      budgetTotal: 0,
      budgetSpent: 0,
      performanceSum: 0,
    });

    return {
      totalSpend: totals.spend,
      totalClicks: totals.clicks,
      totalConversions: totals.conversions,
      totalRevenue: totals.revenue,
      avgCTR: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      avgCVR: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
      avgCPA: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
      overallROAS: totals.spend > 0 ? totals.revenue / totals.spend : 0,
      budgetUtilization: totals.budgetTotal > 0 ? totals.budgetSpent / totals.budgetTotal : 0,
      performanceScore: campaigns.length > 0 ? totals.performanceSum / campaigns.length : 0,
    };
  }

  /**
   * Get active alerts
   */
  private async getActiveAlerts(campaignIds: string[]): Promise<Alert[]> {
    const alerts: Alert[] = [];

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const rows = this.database.prepare(`
        SELECT
          id,
          recommendation_type,
          entity_id,
          confidence_score,
          created_at
        FROM optimization_recommendations
        WHERE
          entity_id IN (${campaignIds.map(() => '?').join(',')})
          AND created_at >= ?
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 10
      `).all(...campaignIds, oneHourAgo) as any[];

      for (const row of rows) {
        alerts.push({
          id: row.id,
          type: this.mapRecommendationType(row.recommendation_type),
          severity: row.confidence_score > 0.8 ? 'high' : 'medium',
          campaignId: row.entity_id,
          message: this.getAlertMessage(row.recommendation_type, row.entity_id),
          timestamp: new Date(row.created_at),
          actionRequired: row.confidence_score > 0.7,
        });
      }
    } catch (error) {
      this.logger.debug('Failed to get alerts', { error });
    }

    return alerts;
  }

  /**
   * Map recommendation type to alert type
   */
  private mapRecommendationType(type: string): 'budget' | 'performance' | 'anomaly' | 'opportunity' {
    if (type.includes('budget')) return 'budget';
    if (type.includes('anomaly')) return 'anomaly';
    if (type.includes('opportunity') || type.includes('scale')) return 'opportunity';
    return 'performance';
  }

  /**
   * Get alert message
   */
  private getAlertMessage(type: string, campaignId: string): string {
    const messages: Record<string, string> = {
      budget_increase: `Campaign ${campaignId} budget nearly depleted`,
      investigate_anomaly: `Performance anomaly detected for campaign ${campaignId}`,
      scale_opportunity: `Scaling opportunity identified for campaign ${campaignId}`,
      immediate_scale: `Conversion spike detected for campaign ${campaignId}`,
      quality_improvement: `Quality score drop for campaign ${campaignId}`,
    };

    return messages[type] || `Alert for campaign ${campaignId}`;
  }

  /**
   * Get recommendations
   */
  private async getRecommendations(campaignIds: string[]): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      const rows = this.database.prepare(`
        SELECT
          id,
          recommendation_type,
          entity_id,
          current_value,
          recommended_value,
          expected_improvement,
          confidence_score
        FROM optimization_recommendations
        WHERE
          entity_id IN (${campaignIds.map(() => '?').join(',')})
          AND status = 'pending'
        ORDER BY confidence_score DESC
        LIMIT 5
      `).all(...campaignIds) as any[];

      for (const row of rows) {
        recommendations.push({
          id: row.id,
          type: this.mapRecommendationTypeSimple(row.recommendation_type),
          campaignId: row.entity_id,
          action: this.getRecommendationAction(row),
          expectedImpact: this.getExpectedImpact(row),
          confidence: row.confidence_score,
          priority: row.confidence_score > 0.8 ? 'high' : row.confidence_score > 0.5 ? 'medium' : 'low',
        });
      }
    } catch (error) {
      this.logger.debug('Failed to get recommendations', { error });
    }

    return recommendations;
  }

  /**
   * Map recommendation type to simple type
   */
  private mapRecommendationTypeSimple(type: string): 'budget_increase' | 'budget_decrease' | 'bid_adjustment' | 'pause_campaign' | 'investigate' {
    if (type.includes('budget') && type.includes('increase')) return 'budget_increase';
    if (type.includes('budget') && type.includes('decrease')) return 'budget_decrease';
    if (type.includes('bid')) return 'bid_adjustment';
    if (type.includes('pause')) return 'pause_campaign';
    return 'investigate';
  }

  /**
   * Get recommendation action text
   */
  private getRecommendationAction(row: any): string {
    if (row.recommended_value && row.current_value) {
      const change = ((row.recommended_value - row.current_value) / row.current_value * 100).toFixed(1);
      return `Adjust from $${row.current_value} to $${row.recommended_value} (${change}% change)`;
    }
    return `Review and optimize ${row.recommendation_type}`;
  }

  /**
   * Get expected impact text
   */
  private getExpectedImpact(row: any): string {
    if (row.expected_improvement) {
      return `Expected improvement: ${(row.expected_improvement * 100).toFixed(1)}%`;
    }
    return 'Potential for significant improvement';
  }

  /**
   * Export dashboard data
   */
  async exportDashboard(format: 'json' | 'csv', filters?: DashboardFilters): Promise<string> {
    const snapshot = await this.getSnapshot(filters);

    if (format === 'json') {
      return JSON.stringify(snapshot, null, 2);
    }

    // CSV export
    const csvRows = ['Campaign,Spend,Clicks,Conversions,Revenue,CTR,CVR,CPA,ROAS,Budget Utilization,Performance Score'];

    for (const campaign of snapshot.campaigns) {
      csvRows.push([
        campaign.campaignId,
        campaign.current.spend.toFixed(2),
        campaign.current.clicks,
        campaign.current.conversions.toFixed(1),
        campaign.current.revenue.toFixed(2),
        (campaign.current.ctr * 100).toFixed(2) + '%',
        (campaign.current.cvr * 100).toFixed(2) + '%',
        campaign.current.cpa.toFixed(2),
        campaign.current.roas.toFixed(2),
        (campaign.budget.utilization * 100).toFixed(1) + '%',
        campaign.performance.score,
      ].join(','));
    }

    return csvRows.join('\n');
  }
}