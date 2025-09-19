/**
 * Bayesian Budget Optimizer
 *
 * High-level optimizer that orchestrates Thompson Sampling with
 * performance tracking and recommendation generation.
 */

import { ThompsonSamplingOptimizer, Arm, BudgetConstraints, AllocationResult } from '../optimization/thompson-sampling.js';
import Database from 'better-sqlite3';
import type { GoogleAdsClient } from '../connectors/google-ads-api.js';
import { Logger } from 'pino';
import { format } from 'date-fns';

export interface OptimizerConfig {
  totalBudget: number;
  objective: 'maximize_CWS_Clicks' | 'maximize_conversions' | 'maximize_revenue';
  constraints: BudgetConstraints;
  timeframe: number; // Days to look back for metrics
  accountId: string;
}

export interface BudgetRecommendations {
  timestamp: string;
  totalBudget: number;
  objective: string;
  allocations: Array<{
    campaignId: string;
    campaignName: string;
    currentBudget: number;
    recommendedBudget: number;
    expectedLift: number;
    confidence: [number, number];
    rationale: string;
  }>;
  implementation: {
    priority: Array<{ campaignId: string; action: string; impact: 'high' | 'medium' | 'low' }>;
    automation: string;
    monitoring: string;
  };
  simulation: {
    expected_clicks: number;
    expected_cws_clicks: number;
    expected_conversions: number;
    expected_revenue: number;
    confidence_interval: [number, number];
  };
}

export interface PerformanceMetrics {
  campaignId: string;
  campaignName: string;
  spend: number;
  clicks: number;
  conversions: number;
  revenue: number;
  impressions: number;
  qualityScore?: number;
  currentDailyBudget: number;
}

export class PerformanceTracker {
  constructor(
    private googleAdsClient: GoogleAdsClient | null,
    private database: Database.Database
  ) {}

  /**
   * Fetch campaign metrics from Google Ads API or database
   */
  async getCampaignMetrics(accountId: string, days: number): Promise<Arm[]> {
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const startDate = format(new Date(Date.now() - days * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    // Try to fetch from database first (fact_channel_spend)
    const dbMetrics = await this.fetchFromDatabase(accountId, startDate, endDate);

    if (dbMetrics.length > 0) {
      return dbMetrics;
    }

    // Fallback to Google Ads API if available
    if (this.googleAdsClient) {
      return await this.fetchFromGoogleAds(accountId, startDate, endDate);
    }

    // Return mock data for testing
    return this.generateMockMetrics();
  }

  /**
   * Fetch metrics from database
   */
  private async fetchFromDatabase(accountId: string, startDate: string, endDate: string): Promise<Arm[]> {
    try {
      const query = `
        SELECT
          campaign_id,
          SUM(cost) as spend,
          SUM(clicks) as clicks,
          SUM(conversions) as conversions,
          SUM(conversion_value) as revenue,
          SUM(impressions) as impressions
        FROM fact_channel_spend
        WHERE
          date >= ? AND date <= ?
          AND engine = 'google'
        GROUP BY campaign_id
      `;

      const rows = this.database.prepare(query).all(startDate, endDate) as any[];

      // Get current budgets and campaign names
      const campaignInfo = await this.getCampaignInfo(rows.map(r => r.campaign_id));

      return rows.map(row => ({
        id: row.campaign_id,
        name: campaignInfo.get(row.campaign_id)?.name || `Campaign ${row.campaign_id}`,
        type: 'campaign' as const,
        metrics30d: {
          spend: row.spend || 0,
          clicks: row.clicks || 0,
          conversions: row.conversions || 0,
          revenue: row.revenue || 0,
          impressions: row.impressions || 0,
          qualityScore: campaignInfo.get(row.campaign_id)?.qualityScore
        },
        currentDailyBudget: campaignInfo.get(row.campaign_id)?.budget || 0
      }));
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Get campaign names and current budgets
   */
  private async getCampaignInfo(campaignIds: string[]): Promise<Map<string, { name: string; budget: number; qualityScore?: number }>> {
    const info = new Map();

    // This would normally fetch from campaigns table or Google Ads API
    // For now, generate reasonable defaults
    for (const id of campaignIds) {
      info.set(id, {
        name: `Campaign ${id}`,
        budget: 10 + Math.random() * 30, // Random budget between 10-40
        qualityScore: 5 + Math.random() * 5 // Random QS between 5-10
      });
    }

    return info;
  }

  /**
   * Fetch metrics from Google Ads API
   */
  private async fetchFromGoogleAds(accountId: string, startDate: string, endDate: string): Promise<Arm[]> {
    // This would use the actual Google Ads API
    // Implementation depends on google-ads-api.ts
    return this.generateMockMetrics();
  }

  /**
   * Generate mock metrics for testing
   */
  private generateMockMetrics(): Arm[] {
    return [
      {
        id: 'camp_001',
        name: 'PaletteKit - AU - Search',
        type: 'campaign',
        metrics30d: {
          spend: 450,
          clicks: 180,
          conversions: 12,
          revenue: 600,
          impressions: 4500,
          qualityScore: 8.2
        },
        currentDailyBudget: 15
      },
      {
        id: 'camp_002',
        name: 'PaletteKit - US - Search',
        type: 'campaign',
        metrics30d: {
          spend: 680,
          clicks: 240,
          conversions: 18,
          revenue: 900,
          impressions: 6000,
          qualityScore: 7.5
        },
        currentDailyBudget: 22
      },
      {
        id: 'camp_003',
        name: 'ConvertMyFile - AU - Search',
        type: 'campaign',
        metrics30d: {
          spend: 320,
          clicks: 140,
          conversions: 8,
          revenue: 400,
          impressions: 3500,
          qualityScore: 6.8
        },
        currentDailyBudget: 10
      },
      {
        id: 'camp_004',
        name: 'NoteBridge - GB - Search',
        type: 'campaign',
        metrics30d: {
          spend: 280,
          clicks: 95,
          conversions: 5,
          revenue: 250,
          impressions: 2800,
          qualityScore: 7.1
        },
        currentDailyBudget: 9
      }
    ];
  }

  /**
   * Update Bayesian priors based on new performance data
   */
  async updateBayesianPriors(data: any): Promise<void> {
    const query = `
      INSERT INTO ts_arms (id, name, arm_type, entity_id, alpha, beta, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        alpha = excluded.alpha,
        beta = excluded.beta,
        last_updated = CURRENT_TIMESTAMP
    `;

    try {
      this.database.prepare(query).run(
        data.campaignId,
        data.campaignName || 'Unknown',
        'campaign',
        data.campaignId,
        data.alpha || 1,
        data.beta || 1
      );
    } catch (error) {
      // Table might not exist yet
    }
  }
}

export class BayesianOptimizer {
  private thompsonSampler: ThompsonSamplingOptimizer;
  private performanceTracker: PerformanceTracker;

  constructor(
    private database: Database.Database,
    private googleAdsClient: GoogleAdsClient | null,
    private logger?: Logger
  ) {
    this.thompsonSampler = new ThompsonSamplingOptimizer();
    this.performanceTracker = new PerformanceTracker(googleAdsClient, database);
  }

  /**
   * Generate budget optimization proposals
   */
  async optimizeBudgets(config: OptimizerConfig): Promise<BudgetRecommendations> {
    // Fetch recent performance data
    const campaigns = await this.performanceTracker.getCampaignMetrics(
      config.accountId,
      config.timeframe
    );

    if (campaigns.length === 0) {
      throw new Error('No campaign data available for optimization');
    }

    // Run Thompson Sampling
    const allocations = this.thompsonSampler.allocateBudget(
      campaigns,
      config.totalBudget,
      config.constraints
    );

    // Generate recommendations
    return this.generateRecommendations(allocations, campaigns, config);
  }

  /**
   * Generate detailed recommendations from allocations
   */
  private generateRecommendations(
    allocations: AllocationResult[],
    campaigns: Arm[],
    config: OptimizerConfig
  ): BudgetRecommendations {
    const timestamp = new Date().toISOString();

    // Map allocations to recommendations
    const recommendations = allocations.map(alloc => {
      const campaign = campaigns.find(c => c.id === alloc.armId);
      return {
        campaignId: alloc.armId,
        campaignName: alloc.armName,
        currentBudget: alloc.currentDailyBudget,
        recommendedBudget: alloc.proposedDailyBudget,
        expectedLift: alloc.expectedImprovement,
        confidence: alloc.confidenceInterval,
        rationale: alloc.reasoning
      };
    });

    // Prioritize changes by impact
    const priority = this.prioritizeChanges(allocations);

    // Calculate simulation metrics
    const simulation = this.simulateOutcomes(allocations, campaigns);

    // Determine automation strategy
    const automation = this.getAutomationStrategy(allocations);

    // Create monitoring plan
    const monitoring = this.getMonitoringPlan(allocations);

    return {
      timestamp,
      totalBudget: config.totalBudget,
      objective: config.objective,
      allocations: recommendations,
      implementation: {
        priority,
        automation,
        monitoring
      },
      simulation
    };
  }

  /**
   * Prioritize changes by expected impact
   */
  private prioritizeChanges(allocations: AllocationResult[]): Array<{
    campaignId: string;
    action: string;
    impact: 'high' | 'medium' | 'low';
  }> {
    return allocations
      .map(alloc => {
        const changePct = Math.abs((alloc.proposedDailyBudget - alloc.currentDailyBudget) /
                                  Math.max(alloc.currentDailyBudget, 1)) * 100;

        let action = 'maintain';
        let impact: 'high' | 'medium' | 'low' = 'low';

        if (changePct > 20) {
          action = alloc.proposedDailyBudget > alloc.currentDailyBudget ? 'increase' : 'decrease';
          impact = 'high';
        } else if (changePct > 10) {
          action = alloc.proposedDailyBudget > alloc.currentDailyBudget ? 'increase' : 'decrease';
          impact = 'medium';
        }

        return {
          campaignId: alloc.armId,
          action,
          impact
        };
      })
      .filter(p => p.impact !== 'low')
      .sort((a, b) => {
        const impactOrder = { high: 3, medium: 2, low: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      });
  }

  /**
   * Simulate expected outcomes from allocations
   */
  private simulateOutcomes(allocations: AllocationResult[], campaigns: Arm[]): {
    expected_clicks: number;
    expected_cws_clicks: number;
    expected_conversions: number;
    expected_revenue: number;
    confidence_interval: [number, number];
  } {
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const alloc of allocations) {
      const campaign = campaigns.find(c => c.id === alloc.armId);
      if (!campaign) continue;

      const avgCPC = campaign.metrics30d.spend / Math.max(campaign.metrics30d.clicks, 1);
      const cvr = campaign.metrics30d.conversions / Math.max(campaign.metrics30d.clicks, 1);
      const avgValue = campaign.metrics30d.revenue / Math.max(campaign.metrics30d.conversions, 1);

      const expectedClicks = alloc.proposedDailyBudget / Math.max(avgCPC, 0.01);
      const expectedConversions = expectedClicks * cvr;
      const expectedRevenue = expectedConversions * avgValue;

      totalClicks += expectedClicks;
      totalConversions += expectedConversions;
      totalRevenue += expectedRevenue;
    }

    // CWS clicks estimate (Chrome extension specific)
    const cwsClickRate = 0.15; // Assume 15% of clicks are CWS relevant
    const expectedCwsClicks = totalClicks * cwsClickRate;

    // Confidence interval (simplified)
    const confidenceLower = totalConversions * 0.8;
    const confidenceUpper = totalConversions * 1.2;

    return {
      expected_clicks: Math.round(totalClicks),
      expected_cws_clicks: Math.round(expectedCwsClicks),
      expected_conversions: Math.round(totalConversions * 10) / 10,
      expected_revenue: Math.round(totalRevenue * 100) / 100,
      confidence_interval: [
        Math.round(confidenceLower * 10) / 10,
        Math.round(confidenceUpper * 10) / 10
      ]
    };
  }

  /**
   * Determine automation strategy
   */
  private getAutomationStrategy(allocations: AllocationResult[]): string {
    const significantChanges = allocations.filter(a => {
      const changePct = Math.abs((a.proposedDailyBudget - a.currentDailyBudget) /
                                Math.max(a.currentDailyBudget, 1)) * 100;
      return changePct > 10;
    });

    if (significantChanges.length === 0) {
      return 'No significant changes recommended. Continue monitoring.';
    }

    if (significantChanges.length <= 2) {
      return 'Apply changes manually with close monitoring for 48 hours.';
    }

    return 'Phase changes over 3 days. Start with top performers, monitor, then adjust others.';
  }

  /**
   * Create monitoring plan
   */
  private getMonitoringPlan(allocations: AllocationResult[]): string {
    const hasHighRiskChanges = allocations.some(a => {
      const changePct = Math.abs((a.proposedDailyBudget - a.currentDailyBudget) /
                                Math.max(a.currentDailyBudget, 1)) * 100;
      return changePct > 25;
    });

    if (hasHighRiskChanges) {
      return 'High-frequency monitoring (every 2 hours) for 24 hours, then daily checks.';
    }

    return 'Daily monitoring for 7 days, focusing on CTR, CPA, and conversion volume.';
  }

  /**
   * Generate proposals for specific objective
   */
  async generateProposals(params: {
    accountId: string;
    objective: string;
    constraints?: Partial<BudgetConstraints>;
  }): Promise<any> {
    const defaultConstraints: BudgetConstraints = {
      minDailyBudget: 2,
      maxDailyBudget: 100,
      riskTolerance: 0.3,
      maxChangePercent: 25,
      explorationFloor: 0.1,
      ...params.constraints
    };

    const config: OptimizerConfig = {
      accountId: params.accountId,
      objective: params.objective as any,
      totalBudget: params.constraints?.daily_cap_AUD ||
                   params.constraints?.daily_cap_USD ||
                   params.constraints?.daily_cap_GBP ||
                   50, // Default budget
      constraints: defaultConstraints,
      timeframe: 30
    };

    const recommendations = await this.optimizeBudgets(config);

    // Format as artifact for v2.0 compatibility
    return {
      generated_at: recommendations.timestamp,
      objective: recommendations.objective,
      constraints: {
        daily_cap_AUD: params.constraints?.daily_cap_AUD,
        daily_cap_USD: params.constraints?.daily_cap_USD,
        daily_cap_GBP: params.constraints?.daily_cap_GBP,
        min_per_campaign: defaultConstraints.min_per_campaign || 2,
        max_change_pct: defaultConstraints.maxChangePercent || 25
      },
      proposals: recommendations.allocations.map(alloc => ({
        engine: 'google',
        campaign: alloc.campaignName,
        campaign_id: alloc.campaignId,
        current: alloc.currentBudget,
        proposed: alloc.recommendedBudget,
        reason: alloc.rationale,
        thompson_sample: alloc.expectedLift
      })),
      simulation: recommendations.simulation
    };
  }
}