/**
 * Competition Analyzer
 *
 * Analyzes competitive landscape to inform bidding strategies.
 * Tracks competitor behavior, auction insights, and market dynamics.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';

export interface CompetitorInsights {
  competitorId: string;
  domain?: string;
  overlapRate: number;
  outrankedShare: number;
  positionAboveRate: number;
  topOfPageRate: number;
  avgPosition: number;
  impressionShare: number;
  estimatedBudget?: number;
  biddingAggressiveness: 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';
}

export interface MarketDynamics {
  marketVolume: number;
  avgCPC: number;
  cpcTrend: 'decreasing' | 'stable' | 'increasing';
  competitorCount: number;
  marketConcentration: number; // Herfindahl index
  entryBarrier: 'low' | 'medium' | 'high';
}

export interface AuctionAnalysis {
  campaignId: string;
  avgAuctionPrice: number;
  winRate: number;
  lossReasons: {
    budget: number;
    rank: number;
    bid: number;
  };
  opportunityGap: number; // Potential impressions if all auctions were won
}

export interface CompetitivePosition {
  strength: 'weak' | 'challenger' | 'strong' | 'leader';
  marketShare: number;
  relativeQualityScore: number;
  pricePremium: number; // How much more/less we pay vs competitors
  recommendations: string[];
}

export class CompetitionAnalyzer {
  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Comprehensive competitive analysis for a campaign
   */
  async analyzeCompetition(campaignId: string): Promise<{
    competitors: CompetitorInsights[];
    marketDynamics: MarketDynamics;
    auctionAnalysis: AuctionAnalysis;
    position: CompetitivePosition;
  }> {
    this.logger.info('Analyzing competition', { campaignId });

    const [competitors, market, auction, position] = await Promise.all([
      this.getCompetitorInsights(campaignId),
      this.analyzeMarketDynamics(campaignId),
      this.analyzeAuctionPerformance(campaignId),
      this.assessCompetitivePosition(campaignId)
    ]);

    return {
      competitors,
      marketDynamics: market,
      auctionAnalysis: auction,
      position
    };
  }

  /**
   * Get detailed competitor insights
   */
  private async getCompetitorInsights(campaignId: string): Promise<CompetitorInsights[]> {
    const competitors = this.database.prepare(`
      SELECT
        competitor_domain,
        AVG(overlap_rate) as overlap_rate,
        AVG(outranked_share) as outranked_share,
        AVG(position_above_rate) as position_above_rate,
        AVG(top_of_page_rate) as top_of_page_rate,
        AVG(avg_position) as avg_position,
        AVG(impression_share) as impression_share,
        COUNT(*) as data_points
      FROM auction_insights
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      GROUP BY competitor_domain
      HAVING data_points >= 7
      ORDER BY overlap_rate DESC
      LIMIT 10
    `).all(campaignId) as any[];

    return competitors.map(comp => ({
      competitorId: comp.competitor_domain,
      domain: comp.competitor_domain,
      overlapRate: comp.overlap_rate || 0,
      outrankedShare: comp.outranked_share || 0,
      positionAboveRate: comp.position_above_rate || 0,
      topOfPageRate: comp.top_of_page_rate || 0,
      avgPosition: comp.avg_position || 0,
      impressionShare: comp.impression_share || 0,
      estimatedBudget: this.estimateCompetitorBudget(comp),
      biddingAggressiveness: this.assessBiddingAggressiveness(comp)
    }));
  }

  /**
   * Analyze overall market dynamics
   */
  private async analyzeMarketDynamics(campaignId: string): Promise<MarketDynamics> {
    // Get market metrics
    const marketData = this.database.prepare(`
      SELECT
        SUM(impressions) as total_impressions,
        AVG(avg_cpc) as avg_cpc,
        COUNT(DISTINCT competitor_domain) as competitor_count,
        AVG(search_impression_share) as avg_impression_share
      FROM auction_insights ai
      JOIN fact_channel_spend fcs ON fcs.campaign_id = ai.campaign_id
      WHERE ai.campaign_id = ?
        AND ai.date >= date('now', '-30 days')
    `).get(campaignId) as any;

    // Get CPC trend
    const cpcTrend = this.database.prepare(`
      SELECT
        date,
        avg_cpc
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
      ORDER BY date
    `).all(campaignId) as any[];

    const trend = this.calculateTrend(cpcTrend.map(d => d.avg_cpc));

    // Calculate market concentration (simplified Herfindahl index)
    const shares = this.database.prepare(`
      SELECT impression_share
      FROM auction_insights
      WHERE campaign_id = ?
        AND date >= date('now', '-7 days')
    `).all(campaignId) as any[];

    const concentration = shares.reduce((sum, s) =>
      sum + Math.pow(s.impression_share || 0, 2), 0
    );

    // Determine entry barrier
    let entryBarrier: 'low' | 'medium' | 'high' = 'medium';
    if (marketData.avg_cpc > 5 && concentration > 0.3) {
      entryBarrier = 'high';
    } else if (marketData.avg_cpc < 1 && concentration < 0.1) {
      entryBarrier = 'low';
    }

    return {
      marketVolume: marketData?.total_impressions || 0,
      avgCPC: marketData?.avg_cpc || 0,
      cpcTrend: trend,
      competitorCount: marketData?.competitor_count || 0,
      marketConcentration: concentration,
      entryBarrier
    };
  }

  /**
   * Analyze auction win/loss patterns
   */
  private async analyzeAuctionPerformance(campaignId: string): Promise<AuctionAnalysis> {
    const auctionData = this.database.prepare(`
      SELECT
        AVG(avg_cpc) as avg_auction_price,
        SUM(impressions) * 1.0 / NULLIF(SUM(eligible_impressions), 0) as win_rate,
        SUM(lost_impressions_budget) as lost_budget,
        SUM(lost_impressions_rank) as lost_rank,
        SUM(lost_impressions_bid) as lost_bid,
        SUM(eligible_impressions) - SUM(impressions) as opportunity_gap
      FROM auction_performance
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
    `).get(campaignId) as any;

    const totalLost = (auctionData?.lost_budget || 0) +
                     (auctionData?.lost_rank || 0) +
                     (auctionData?.lost_bid || 0);

    return {
      campaignId,
      avgAuctionPrice: auctionData?.avg_auction_price || 0,
      winRate: auctionData?.win_rate || 0,
      lossReasons: {
        budget: totalLost ? (auctionData?.lost_budget || 0) / totalLost : 0,
        rank: totalLost ? (auctionData?.lost_rank || 0) / totalLost : 0,
        bid: totalLost ? (auctionData?.lost_bid || 0) / totalLost : 0
      },
      opportunityGap: auctionData?.opportunity_gap || 0
    };
  }

  /**
   * Assess our competitive position
   */
  private async assessCompetitivePosition(campaignId: string): Promise<CompetitivePosition> {
    // Get our metrics vs competitors
    const positionData = this.database.prepare(`
      SELECT
        AVG(search_impression_share) as our_share,
        AVG(search_top_impression_share) as our_top_share,
        AVG(avg_cpc) as our_cpc,
        AVG(quality_score) as our_qs
      FROM fact_channel_spend fcs
      LEFT JOIN keyword_quality_daily kqd ON kqd.campaign_id = fcs.campaign_id
      WHERE fcs.campaign_id = ?
        AND fcs.date >= date('now', '-30 days')
    `).get(campaignId) as any;

    const competitorAvg = this.database.prepare(`
      SELECT
        AVG(impression_share) as avg_comp_share,
        AVG(top_of_page_rate) as avg_comp_top,
        AVG(avg_position) as avg_comp_position
      FROM auction_insights
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
    `).get(campaignId) as any;

    // Determine competitive strength
    let strength: 'weak' | 'challenger' | 'strong' | 'leader' = 'challenger';
    const ourShare = positionData?.our_share || 0;

    if (ourShare > 0.5) {
      strength = 'leader';
    } else if (ourShare > 0.25) {
      strength = 'strong';
    } else if (ourShare < 0.1) {
      strength = 'weak';
    }

    // Calculate relative metrics
    const relativeQS = positionData?.our_qs ? positionData.our_qs / 7 : 0; // Normalized to 0-1
    const pricePremium = competitorAvg?.avg_comp_position ?
      (positionData?.our_cpc || 0) / (competitorAvg.avg_comp_position * 0.5) - 1 : 0;

    // Generate recommendations
    const recommendations = this.generateCompetitiveRecommendations(
      strength,
      ourShare,
      relativeQS,
      pricePremium
    );

    return {
      strength,
      marketShare: ourShare,
      relativeQualityScore: relativeQS,
      pricePremium,
      recommendations
    };
  }

  /**
   * Estimate competitor's budget based on impression share and CPC
   */
  private estimateCompetitorBudget(competitor: any): number {
    // Rough estimation based on impression share and market CPC
    const estimatedDailyImpressions = competitor.impression_share * 10000; // Assume 10k total
    const estimatedCPC = competitor.top_of_page_rate > 0.5 ? 3 : 1.5; // Higher CPC for aggressive bidders
    const estimatedDailyBudget = estimatedDailyImpressions * estimatedCPC * 0.05; // Assume 5% CTR

    return Math.round(estimatedDailyBudget);
  }

  /**
   * Assess competitor's bidding aggressiveness
   */
  private assessBiddingAggressiveness(competitor: any):
    'conservative' | 'moderate' | 'aggressive' | 'very_aggressive' {
    const score = (
      competitor.top_of_page_rate * 0.4 +
      competitor.position_above_rate * 0.3 +
      (1 - competitor.outranked_share) * 0.3
    );

    if (score > 0.75) return 'very_aggressive';
    if (score > 0.5) return 'aggressive';
    if (score > 0.25) return 'moderate';
    return 'conservative';
  }

  /**
   * Calculate trend from time series data
   */
  private calculateTrend(values: number[]): 'decreasing' | 'stable' | 'increasing' {
    if (values.length < 3) return 'stable';

    // Simple linear regression
    const n = values.length;
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + v * i, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgValue = sumY / n;
    const relativeSlope = slope / avgValue;

    if (relativeSlope < -0.05) return 'decreasing';
    if (relativeSlope > 0.05) return 'increasing';
    return 'stable';
  }

  /**
   * Generate competitive recommendations
   */
  private generateCompetitiveRecommendations(
    strength: string,
    marketShare: number,
    relativeQS: number,
    pricePremium: number
  ): string[] {
    const recommendations: string[] = [];

    // Based on competitive position
    if (strength === 'weak') {
      recommendations.push('Focus on niche keywords with lower competition');
      recommendations.push('Improve Quality Score before increasing bids');
    } else if (strength === 'leader') {
      recommendations.push('Maintain position with efficient bidding');
      recommendations.push('Test reducing bids to improve profitability');
    }

    // Based on quality score
    if (relativeQS < 0.5) {
      recommendations.push('Prioritize landing page and ad relevance improvements');
      recommendations.push('Quality Score improvements will reduce required bids');
    }

    // Based on price premium
    if (pricePremium > 0.2) {
      recommendations.push('Paying 20%+ premium vs competitors - optimize for efficiency');
      recommendations.push('Consider dayparting to focus on lower competition periods');
    } else if (pricePremium < -0.2) {
      recommendations.push('Bidding below market - may be missing opportunities');
      recommendations.push('Test incremental bid increases to capture more volume');
    }

    // Based on market share
    if (marketShare < 0.1) {
      recommendations.push('Low impression share - increase bids or budget');
    } else if (marketShare > 0.5) {
      recommendations.push('Dominant position - monitor for new entrants');
    }

    return recommendations;
  }

  /**
   * Get competitor bid estimates
   */
  async estimateCompetitorBids(
    campaignId: string,
    keywords: string[]
  ): Promise<Map<string, { min: number; max: number; estimated: number }>> {
    const estimates = new Map();

    for (const keyword of keywords) {
      // Get auction data for this keyword
      const auctionData = this.database.prepare(`
        SELECT
          AVG(first_page_bid) as first_page,
          AVG(first_position_bid) as first_position,
          AVG(top_of_page_bid) as top_page,
          AVG(avg_cpc) as actual_cpc
        FROM keyword_auction_data
        WHERE campaign_id = ?
          AND keyword = ?
          AND date >= date('now', '-7 days')
      `).get(campaignId, keyword) as any;

      if (auctionData) {
        estimates.set(keyword, {
          min: auctionData.first_page || 0.5,
          max: auctionData.first_position || 5.0,
          estimated: auctionData.top_page || auctionData.actual_cpc || 1.0
        });
      } else {
        // Default estimates if no data
        estimates.set(keyword, {
          min: 0.5,
          max: 5.0,
          estimated: 1.5
        });
      }
    }

    return estimates;
  }

  /**
   * Detect bid wars and recommend de-escalation
   */
  async detectBidWars(campaignId: string): Promise<{
    detected: boolean;
    keywords: string[];
    recommendations: string[];
  }> {
    // Look for rapidly escalating CPCs
    const escalatingKeywords = this.database.prepare(`
      SELECT
        keyword,
        MIN(avg_cpc) as min_cpc,
        MAX(avg_cpc) as max_cpc,
        AVG(avg_cpc) as avg_cpc
      FROM keyword_performance_daily
      WHERE campaign_id = ?
        AND date >= date('now', '-14 days')
      GROUP BY keyword
      HAVING max_cpc > min_cpc * 1.5
      ORDER BY (max_cpc / min_cpc) DESC
      LIMIT 10
    `).all(campaignId) as any[];

    if (escalatingKeywords.length === 0) {
      return {
        detected: false,
        keywords: [],
        recommendations: []
      };
    }

    const recommendations = [
      'Bid war detected - CPCs escalating rapidly',
      'Consider setting bid caps to prevent overspending',
      'Test pausing keywords temporarily to reset market',
      'Explore alternative keywords with lower competition',
      'Implement dayparting to avoid peak competition times'
    ];

    return {
      detected: true,
      keywords: escalatingKeywords.map(k => k.keyword),
      recommendations
    };
  }
}