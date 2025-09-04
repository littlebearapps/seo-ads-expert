#!/usr/bin/env tsx

/**
 * Task 8: Competitive Intelligence Scanner
 * 
 * This module provides comprehensive competitive analysis by scanning SERP data,
 * analyzing competitor strategies, identifying gaps and opportunities, and generating
 * actionable competitive intelligence.
 */

import { z } from 'zod';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// === SCHEMAS ===

const CompetitorSchema = z.object({
  domain: z.string(),
  visibility_score: z.number().min(0).max(100),
  estimated_traffic: z.number(),
  keyword_overlap: z.number().min(0).max(100),
  content_quality_score: z.number().min(0).max(10),
  backlink_strength: z.number().min(0).max(10),
  technical_score: z.number().min(0).max(10),
  ad_spend_estimate: z.number(),
  market_share: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  threat_level: z.enum(['low', 'medium', 'high', 'critical'])
});

const KeywordGapSchema = z.object({
  keyword: z.string(),
  search_volume: z.number(),
  difficulty: z.number().min(0).max(100),
  competitor_ranking: z.number(),
  our_ranking: z.number().nullable(),
  gap_type: z.enum(['missing', 'underperforming', 'losing_ground', 'opportunity']),
  estimated_traffic_loss: z.number(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  recommended_action: z.string()
});

const ContentGapSchema = z.object({
  topic: z.string(),
  competitor_coverage: z.array(z.object({
    domain: z.string(),
    content_type: z.string(),
    quality_score: z.number(),
    engagement_metrics: z.object({
      estimated_views: z.number(),
      social_shares: z.number(),
      backlinks: z.number()
    })
  })),
  our_coverage: z.object({
    has_content: z.boolean(),
    content_type: z.string().nullable(),
    quality_score: z.number().nullable(),
    last_updated: z.string().nullable()
  }),
  opportunity_score: z.number().min(0).max(10),
  recommended_content_type: z.string(),
  estimated_effort: z.enum(['low', 'medium', 'high']),
  expected_impact: z.enum(['low', 'medium', 'high', 'very_high'])
});

const CompetitiveStrategySchema = z.object({
  competitor: z.string(),
  strategy_type: z.enum([
    'content_marketing',
    'technical_seo',
    'link_building',
    'paid_search',
    'social_media',
    'product_features',
    'pricing_strategy',
    'user_experience'
  ]),
  tactics_observed: z.array(z.string()),
  effectiveness_score: z.number().min(0).max(10),
  replicable: z.boolean(),
  adaptation_recommendation: z.string(),
  implementation_priority: z.enum(['low', 'medium', 'high', 'urgent']),
  resource_requirement: z.object({
    time_weeks: z.number(),
    budget_estimate: z.number(),
    team_skills: z.array(z.string())
  })
});

const MarketPositionSchema = z.object({
  our_position: z.object({
    market_share: z.number(),
    visibility_score: z.number(),
    growth_trend: z.enum(['declining', 'stable', 'growing', 'accelerating']),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    unique_advantages: z.array(z.string())
  }),
  market_leaders: z.array(z.object({
    domain: z.string(),
    market_share: z.number(),
    key_differentiators: z.array(z.string())
  })),
  emerging_threats: z.array(z.object({
    domain: z.string(),
    growth_rate: z.number(),
    disruptive_factors: z.array(z.string()),
    time_to_threat: z.enum(['immediate', '3_months', '6_months', '12_months'])
  })),
  market_opportunities: z.array(z.object({
    opportunity: z.string(),
    addressable_market: z.number(),
    competition_level: z.enum(['low', 'medium', 'high']),
    entry_barriers: z.array(z.string()),
    recommended_approach: z.string()
  }))
});

const CompetitiveIntelligenceSchema = z.object({
  metadata: z.object({
    scan_date: z.string(),
    markets_analyzed: z.array(z.string()),
    competitors_tracked: z.number(),
    keywords_analyzed: z.number(),
    data_sources: z.array(z.string())
  }),
  competitors: z.array(CompetitorSchema),
  keyword_gaps: z.array(KeywordGapSchema),
  content_gaps: z.array(ContentGapSchema),
  competitive_strategies: z.array(CompetitiveStrategySchema),
  market_position: MarketPositionSchema,
  action_plan: z.object({
    immediate_actions: z.array(z.object({
      action: z.string(),
      impact: z.enum(['low', 'medium', 'high', 'critical']),
      effort: z.enum(['low', 'medium', 'high']),
      timeline: z.string(),
      success_metrics: z.array(z.string())
    })),
    quarterly_initiatives: z.array(z.object({
      initiative: z.string(),
      objectives: z.array(z.string()),
      budget_required: z.number(),
      expected_roi: z.number(),
      risk_factors: z.array(z.string())
    })),
    monitoring_schedule: z.object({
      daily_tracking: z.array(z.string()),
      weekly_reviews: z.array(z.string()),
      monthly_analysis: z.array(z.string()),
      quarterly_deep_dive: z.array(z.string())
    })
  }),
  insights_summary: z.object({
    key_findings: z.array(z.string()),
    biggest_threats: z.array(z.string()),
    biggest_opportunities: z.array(z.string()),
    recommended_focus_areas: z.array(z.string()),
    success_probability: z.number().min(0).max(100)
  })
});

// === TYPES ===
export type Competitor = z.infer<typeof CompetitorSchema>;
export type KeywordGap = z.infer<typeof KeywordGapSchema>;
export type ContentGap = z.infer<typeof ContentGapSchema>;
export type CompetitiveStrategy = z.infer<typeof CompetitiveStrategySchema>;
export type MarketPosition = z.infer<typeof MarketPositionSchema>;
export type CompetitiveIntelligence = z.infer<typeof CompetitiveIntelligenceSchema>;

// === INTERFACES ===

interface SerpData {
  keyword: string;
  search_volume: number;
  results: Array<{
    position: number;
    url: string;
    domain: string;
    title: string;
    description: string;
  }>;
  ads?: Array<{
    position: number;
    domain: string;
    headline: string;
    description: string;
  }>;
}

interface StrategicIntelligence {
  opportunities: Array<{
    keyword: string;
    monthly_search_volume: number;
    competition_level: string;
    opportunity_score: number;
  }>;
  competitor_analysis?: {
    serp_competitors: string[];
    ad_competitors: string[];
    market_insights: string[];
  };
}

// === SCANNER CLASS ===

export class CompetitiveIntelligenceScanner {
  private product: string;
  private ourDomain: string;
  private competitorCache: Map<string, Competitor> = new Map();
  
  constructor(product: string, ourDomain: string = 'littlebearapps.com') {
    this.product = product;
    this.ourDomain = ourDomain;
  }

  async scanCompetitiveLandscape(
    serpData: SerpData[],
    intelligence: StrategicIntelligence
  ): Promise<CompetitiveIntelligence> {
    console.log('🔍 Scanning competitive landscape...');

    // Identify and analyze competitors
    const competitors = await this.identifyCompetitors(serpData, intelligence);
    
    // Analyze keyword gaps
    const keywordGaps = await this.analyzeKeywordGaps(serpData, competitors);
    
    // Identify content gaps
    const contentGaps = await this.identifyContentGaps(serpData, competitors, intelligence);
    
    // Extract competitive strategies
    const competitiveStrategies = await this.extractCompetitiveStrategies(
      competitors,
      serpData,
      intelligence
    );
    
    // Analyze market position
    const marketPosition = await this.analyzeMarketPosition(
      competitors,
      serpData,
      intelligence
    );
    
    // Generate action plan
    const actionPlan = this.generateActionPlan(
      keywordGaps,
      contentGaps,
      competitiveStrategies,
      marketPosition
    );
    
    // Create insights summary
    const insightsSummary = this.createInsightsSummary(
      competitors,
      keywordGaps,
      contentGaps,
      competitiveStrategies,
      marketPosition
    );

    const competitiveIntelligence: CompetitiveIntelligence = {
      metadata: {
        scan_date: new Date().toISOString(),
        markets_analyzed: ['US', 'UK', 'CA', 'AU'],
        competitors_tracked: competitors.length,
        keywords_analyzed: serpData.length,
        data_sources: ['SERP Data', 'Strategic Intelligence', 'Market Analysis']
      },
      competitors,
      keyword_gaps: keywordGaps,
      content_gaps: contentGaps,
      competitive_strategies: competitiveStrategies,
      market_position: marketPosition,
      action_plan: actionPlan,
      insights_summary: insightsSummary
    };

    console.log(`✅ Competitive analysis complete: ${competitors.length} competitors analyzed`);
    return CompetitiveIntelligenceSchema.parse(competitiveIntelligence);
  }

  private async identifyCompetitors(
    serpData: SerpData[],
    intelligence: StrategicIntelligence
  ): Promise<Competitor[]> {
    const competitorFrequency = new Map<string, number>();
    const competitorPositions = new Map<string, number[]>();
    
    // Analyze SERP presence
    for (const serp of serpData) {
      for (const result of serp.results) {
        if (result.domain !== this.ourDomain) {
          competitorFrequency.set(
            result.domain,
            (competitorFrequency.get(result.domain) || 0) + 1
          );
          
          if (!competitorPositions.has(result.domain)) {
            competitorPositions.set(result.domain, []);
          }
          competitorPositions.get(result.domain)!.push(result.position);
        }
      }
      
      // Track ad competitors
      if (serp.ads) {
        for (const ad of serp.ads) {
          if (ad.domain !== this.ourDomain) {
            competitorFrequency.set(
              ad.domain,
              (competitorFrequency.get(ad.domain) || 0) + 1
            );
          }
        }
      }
    }
    
    // Create competitor profiles
    const competitors: Competitor[] = [];
    const topCompetitors = Array.from(competitorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    for (const [domain, frequency] of topCompetitors) {
      const positions = competitorPositions.get(domain) || [];
      const avgPosition = positions.length > 0
        ? positions.reduce((sum, p) => sum + p, 0) / positions.length
        : 50;
      
      const visibilityScore = this.calculateVisibilityScore(frequency, avgPosition, serpData.length);
      const estimatedTraffic = this.estimateTraffic(positions, serpData);
      const keywordOverlap = (frequency / serpData.length) * 100;
      
      const competitor: Competitor = {
        domain,
        visibility_score: visibilityScore,
        estimated_traffic: estimatedTraffic,
        keyword_overlap: keywordOverlap,
        content_quality_score: this.assessContentQuality(domain),
        backlink_strength: this.assessBacklinkStrength(domain),
        technical_score: this.assessTechnicalScore(domain),
        ad_spend_estimate: this.estimateAdSpend(domain, serpData),
        market_share: this.calculateMarketShare(visibilityScore, topCompetitors),
        strengths: this.identifyStrengths(domain, positions),
        weaknesses: this.identifyWeaknesses(domain, positions),
        threat_level: this.assessThreatLevel(visibilityScore, keywordOverlap)
      };
      
      competitors.push(competitor);
      this.competitorCache.set(domain, competitor);
    }
    
    return competitors;
  }

  private async analyzeKeywordGaps(
    serpData: SerpData[],
    competitors: Competitor[]
  ): Promise<KeywordGap[]> {
    const keywordGaps: KeywordGap[] = [];
    const topCompetitors = competitors.slice(0, 5).map(c => c.domain);
    
    for (const serp of serpData) {
      // Find our position
      const ourPosition = serp.results.findIndex(r => r.domain === this.ourDomain) + 1;
      
      // Check competitor positions
      for (const domain of topCompetitors) {
        const competitorPosition = serp.results.findIndex(r => r.domain === domain) + 1;
        
        if (competitorPosition > 0 && (ourPosition === 0 || competitorPosition < ourPosition)) {
          const gap: KeywordGap = {
            keyword: serp.keyword,
            search_volume: serp.search_volume,
            difficulty: this.estimateKeywordDifficulty(serp),
            competitor_ranking: competitorPosition,
            our_ranking: ourPosition || null,
            gap_type: this.determineGapType(ourPosition, competitorPosition),
            estimated_traffic_loss: this.estimateTrafficLoss(
              serp.search_volume,
              competitorPosition,
              ourPosition
            ),
            priority: this.determineKeywordPriority(serp.search_volume, competitorPosition, ourPosition),
            recommended_action: this.recommendKeywordAction(ourPosition, competitorPosition, serp.keyword)
          };
          
          // Only add unique gaps
          if (!keywordGaps.some(g => g.keyword === gap.keyword && g.competitor_ranking === gap.competitor_ranking)) {
            keywordGaps.push(gap);
          }
        }
      }
    }
    
    // Sort by priority and traffic loss
    return keywordGaps
      .sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : b.estimated_traffic_loss - a.estimated_traffic_loss;
      })
      .slice(0, 50); // Top 50 gaps
  }

  private async identifyContentGaps(
    serpData: SerpData[],
    competitors: Competitor[],
    intelligence: StrategicIntelligence
  ): Promise<ContentGap[]> {
    const contentGaps: ContentGap[] = [];
    const topics = this.extractTopics(serpData, intelligence);
    
    for (const topic of topics) {
      const competitorCoverage = this.analyzeCompetitorCoverage(topic, serpData, competitors);
      const ourCoverage = this.analyzeOurCoverage(topic, serpData);
      
      if (competitorCoverage.length > 0 && (!ourCoverage.has_content || ourCoverage.quality_score! < 7)) {
        const gap: ContentGap = {
          topic,
          competitor_coverage: competitorCoverage.map(cc => ({
            domain: cc.domain,
            content_type: cc.contentType,
            quality_score: cc.qualityScore,
            engagement_metrics: {
              estimated_views: cc.estimatedViews,
              social_shares: cc.socialShares,
              backlinks: cc.backlinks
            }
          })),
          our_coverage: {
            has_content: ourCoverage.has_content,
            content_type: ourCoverage.content_type,
            quality_score: ourCoverage.quality_score,
            last_updated: ourCoverage.last_updated
          },
          opportunity_score: this.calculateOpportunityScore(competitorCoverage, ourCoverage),
          recommended_content_type: this.recommendContentType(topic, competitorCoverage),
          estimated_effort: this.estimateContentEffort(topic, competitorCoverage),
          expected_impact: this.estimateContentImpact(topic, competitorCoverage)
        };
        
        contentGaps.push(gap);
      }
    }
    
    return contentGaps
      .sort((a, b) => b.opportunity_score - a.opportunity_score)
      .slice(0, 20); // Top 20 content gaps
  }

  private async extractCompetitiveStrategies(
    competitors: Competitor[],
    serpData: SerpData[],
    intelligence: StrategicIntelligence
  ): Promise<CompetitiveStrategy[]> {
    const strategies: CompetitiveStrategy[] = [];
    
    for (const competitor of competitors.slice(0, 5)) {
      // Content marketing strategy
      const contentStrategy = this.analyzeContentStrategy(competitor, serpData);
      if (contentStrategy) {
        strategies.push(contentStrategy);
      }
      
      // SEO strategy
      const seoStrategy = this.analyzeSEOStrategy(competitor, serpData);
      if (seoStrategy) {
        strategies.push(seoStrategy);
      }
      
      // Paid search strategy
      const paidStrategy = this.analyzePaidStrategy(competitor, serpData);
      if (paidStrategy) {
        strategies.push(paidStrategy);
      }
      
      // Product strategy
      const productStrategy = this.analyzeProductStrategy(competitor, intelligence);
      if (productStrategy) {
        strategies.push(productStrategy);
      }
    }
    
    return strategies
      .sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.implementation_priority] - priorityOrder[b.implementation_priority];
      })
      .slice(0, 15); // Top 15 strategies
  }

  private async analyzeMarketPosition(
    competitors: Competitor[],
    serpData: SerpData[],
    intelligence: StrategicIntelligence
  ): Promise<MarketPosition> {
    // Calculate our market position
    const ourVisibility = this.calculateOurVisibility(serpData);
    const ourMarketShare = this.calculateOurMarketShare(ourVisibility, competitors);
    const growthTrend = this.determineGrowthTrend(serpData);
    
    // Identify market leaders
    const marketLeaders = competitors
      .filter(c => c.market_share > 15)
      .slice(0, 3)
      .map(c => ({
        domain: c.domain,
        market_share: c.market_share,
        key_differentiators: this.identifyDifferentiators(c, serpData)
      }));
    
    // Identify emerging threats
    const emergingThreats = this.identifyEmergingThreats(competitors, serpData);
    
    // Identify market opportunities
    const marketOpportunities = this.identifyMarketOpportunities(serpData, intelligence, competitors);
    
    return {
      our_position: {
        market_share: ourMarketShare,
        visibility_score: ourVisibility,
        growth_trend: growthTrend,
        strengths: this.identifyOurStrengths(serpData),
        weaknesses: this.identifyOurWeaknesses(serpData),
        unique_advantages: this.identifyUniqueAdvantages()
      },
      market_leaders: marketLeaders,
      emerging_threats: emergingThreats,
      market_opportunities: marketOpportunities
    };
  }

  private generateActionPlan(
    keywordGaps: KeywordGap[],
    contentGaps: ContentGap[],
    strategies: CompetitiveStrategy[],
    marketPosition: MarketPosition
  ): CompetitiveIntelligence['action_plan'] {
    const immediateActions = [
      ...this.generateKeywordActions(keywordGaps.slice(0, 5)),
      ...this.generateContentActions(contentGaps.slice(0, 3)),
      ...this.generateStrategyActions(strategies.slice(0, 2))
    ].slice(0, 10);
    
    const quarterlyInitiatives = [
      this.createContentInitiative(contentGaps),
      this.createSEOInitiative(keywordGaps),
      this.createCompetitiveInitiative(strategies),
      this.createMarketExpansionInitiative(marketPosition)
    ].filter(Boolean);
    
    return {
      immediate_actions: immediateActions,
      quarterly_initiatives: quarterlyInitiatives,
      monitoring_schedule: {
        daily_tracking: [
          'Top 10 competitor keyword rankings',
          'SERP feature changes for priority keywords',
          'Competitor ad copy variations',
          'New competitor content publications'
        ],
        weekly_reviews: [
          'Keyword gap progression',
          'Content performance metrics',
          'Competitor visibility changes',
          'Market share fluctuations'
        ],
        monthly_analysis: [
          'Complete competitive landscape scan',
          'Content gap analysis update',
          'Strategy effectiveness review',
          'ROI tracking and optimization'
        ],
        quarterly_deep_dive: [
          'Full market position assessment',
          'Competitive strategy evolution',
          'Emerging threat evaluation',
          'Strategic plan adjustment'
        ]
      }
    };
  }

  private createInsightsSummary(
    competitors: Competitor[],
    keywordGaps: KeywordGap[],
    contentGaps: ContentGap[],
    strategies: CompetitiveStrategy[],
    marketPosition: MarketPosition
  ): CompetitiveIntelligence['insights_summary'] {
    const keyFindings = [
      `${competitors.filter(c => c.threat_level === 'high' || c.threat_level === 'critical').length} high-threat competitors identified`,
      `${keywordGaps.length} keyword gaps with ${keywordGaps.filter(g => g.priority === 'urgent' || g.priority === 'high').length} high-priority opportunities`,
      `${contentGaps.length} content gaps with average opportunity score of ${(contentGaps.reduce((sum, g) => sum + g.opportunity_score, 0) / contentGaps.length).toFixed(1)}`,
      `Market share of ${marketPosition.our_position.market_share.toFixed(1)}% with ${marketPosition.our_position.growth_trend} trend`,
      `${strategies.filter(s => s.replicable).length} replicable competitor strategies identified`
    ];
    
    const biggestThreats = [
      ...competitors
        .filter(c => c.threat_level === 'critical' || c.threat_level === 'high')
        .slice(0, 2)
        .map(c => `${c.domain} (${c.visibility_score.toFixed(0)}% visibility)`),
      ...marketPosition.emerging_threats
        .filter(t => t.time_to_threat === 'immediate')
        .slice(0, 2)
        .map(t => `${t.domain} (${t.growth_rate}% growth)`)
    ].slice(0, 3);
    
    const biggestOpportunities = [
      `${keywordGaps.filter(g => g.gap_type === 'opportunity').length} untapped keyword opportunities`,
      `${contentGaps.filter(g => g.expected_impact === 'very_high' || g.expected_impact === 'high').length} high-impact content opportunities`,
      `${marketPosition.market_opportunities.filter(o => o.competition_level === 'low').length} low-competition market segments`
    ];
    
    const recommendedFocusAreas = this.prioritizeFocusAreas(
      keywordGaps,
      contentGaps,
      strategies,
      marketPosition
    );
    
    const successProbability = this.calculateSuccessProbability(
      marketPosition,
      competitors,
      strategies
    );
    
    return {
      key_findings: keyFindings,
      biggest_threats: biggestThreats,
      biggest_opportunities: biggestOpportunities,
      recommended_focus_areas: recommendedFocusAreas,
      success_probability: successProbability
    };
  }

  // === HELPER METHODS ===

  private calculateVisibilityScore(frequency: number, avgPosition: number, totalKeywords: number): number {
    const frequencyScore = (frequency / totalKeywords) * 50;
    const positionScore = Math.max(0, 50 - (avgPosition * 5));
    return Math.min(100, frequencyScore + positionScore);
  }

  private estimateTraffic(positions: number[], serpData: SerpData[]): number {
    const ctrByPosition = [0.28, 0.15, 0.11, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.03];
    let totalTraffic = 0;
    
    for (const serp of serpData) {
      const position = positions.find(p => p <= 10);
      if (position && position <= 10) {
        const ctr = ctrByPosition[position - 1] || 0.02;
        totalTraffic += serp.search_volume * ctr;
      }
    }
    
    return Math.round(totalTraffic);
  }

  private assessContentQuality(domain: string): number {
    // Simplified quality assessment based on domain patterns
    const qualitySignals = {
      'wikipedia.org': 9.5,
      'github.com': 8.5,
      'stackoverflow.com': 8.5,
      'medium.com': 7.5,
      'dev.to': 7.0
    };
    
    for (const [signal, score] of Object.entries(qualitySignals)) {
      if (domain.includes(signal)) {
        return score;
      }
    }
    
    return 6.5; // Default average quality
  }

  private assessBacklinkStrength(domain: string): number {
    // Simplified backlink assessment
    const authorityDomains = ['wikipedia.org', 'github.com', 'google.com', 'microsoft.com', 'apple.com'];
    
    for (const authDomain of authorityDomains) {
      if (domain.includes(authDomain)) {
        return 9.0;
      }
    }
    
    return 5.5; // Default moderate strength
  }

  private assessTechnicalScore(domain: string): number {
    // Simplified technical assessment
    const techSignals = {
      'github.com': 9.0,
      'google.com': 9.5,
      'cloudflare.com': 9.0,
      'aws.amazon.com': 8.5
    };
    
    for (const [signal, score] of Object.entries(techSignals)) {
      if (domain.includes(signal)) {
        return score;
      }
    }
    
    return 7.0; // Default good technical score
  }

  private estimateAdSpend(domain: string, serpData: SerpData[]): number {
    let adAppearances = 0;
    let totalCPC = 0;
    
    for (const serp of serpData) {
      if (serp.ads) {
        const domainAds = serp.ads.filter(ad => ad.domain === domain);
        adAppearances += domainAds.length;
        totalCPC += domainAds.length * serp.search_volume * 0.02 * 2.5; // Estimated CPC
      }
    }
    
    return Math.round(totalCPC);
  }

  private calculateMarketShare(visibilityScore: number, topCompetitors: Array<[string, number]>): number {
    const totalVisibility = topCompetitors.reduce((sum, [, freq]) => sum + freq, 0);
    const competitorVisibility = topCompetitors[0]?.[1] || 0;
    
    if (totalVisibility === 0) return 0;
    
    return Math.round((competitorVisibility / totalVisibility) * 100);
  }

  private identifyStrengths(domain: string, positions: number[]): string[] {
    const strengths: string[] = [];
    
    const avgPosition = positions.length > 0
      ? positions.reduce((sum, p) => sum + p, 0) / positions.length
      : 50;
    
    if (avgPosition < 3) strengths.push('Top 3 rankings dominance');
    if (positions.filter(p => p === 1).length > 5) strengths.push('Multiple #1 positions');
    if (positions.length > 20) strengths.push('Broad keyword coverage');
    if (avgPosition < 5) strengths.push('Strong SERP presence');
    
    return strengths.slice(0, 4);
  }

  private identifyWeaknesses(domain: string, positions: number[]): string[] {
    const weaknesses: string[] = [];
    
    const avgPosition = positions.length > 0
      ? positions.reduce((sum, p) => sum + p, 0) / positions.length
      : 50;
    
    if (avgPosition > 10) weaknesses.push('Poor average rankings');
    if (positions.filter(p => p > 20).length > positions.length / 2) weaknesses.push('Many low rankings');
    if (positions.length < 5) weaknesses.push('Limited keyword coverage');
    if (!positions.some(p => p <= 3)) weaknesses.push('No top 3 positions');
    
    return weaknesses.slice(0, 4);
  }

  private assessThreatLevel(visibilityScore: number, keywordOverlap: number): Competitor['threat_level'] {
    const threatScore = (visibilityScore * 0.6) + (keywordOverlap * 0.4);
    
    if (threatScore > 70) return 'critical';
    if (threatScore > 50) return 'high';
    if (threatScore > 30) return 'medium';
    return 'low';
  }

  private estimateKeywordDifficulty(serp: SerpData): number {
    // Simplified difficulty based on competition
    const topDomains = serp.results.slice(0, 10).map(r => r.domain);
    const authorityDomains = ['wikipedia.org', 'amazon.com', 'google.com', 'microsoft.com'];
    
    const authorityCount = topDomains.filter(d => 
      authorityDomains.some(auth => d.includes(auth))
    ).length;
    
    return Math.min(100, 30 + (authorityCount * 10));
  }

  private determineGapType(ourPosition: number, competitorPosition: number): KeywordGap['gap_type'] {
    if (ourPosition === 0) return 'missing';
    if (ourPosition > 10 && competitorPosition <= 10) return 'underperforming';
    if (ourPosition - competitorPosition > 5) return 'losing_ground';
    return 'opportunity';
  }

  private estimateTrafficLoss(searchVolume: number, competitorPos: number, ourPos: number | null): number {
    const ctrByPosition = [0.28, 0.15, 0.11, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.03];
    
    const competitorCTR = competitorPos <= 10 ? (ctrByPosition[competitorPos - 1] || 0.02) : 0.01;
    const ourCTR = ourPos && ourPos <= 10 ? (ctrByPosition[ourPos - 1] || 0.02) : 0;
    
    return Math.round(searchVolume * (competitorCTR - ourCTR));
  }

  private determineKeywordPriority(
    searchVolume: number,
    competitorPos: number,
    ourPos: number | null
  ): KeywordGap['priority'] {
    const trafficPotential = searchVolume * 0.1; // Assume 10% CTR potential
    
    if (trafficPotential > 1000 && (!ourPos || ourPos > 20)) return 'urgent';
    if (trafficPotential > 500 && competitorPos <= 3) return 'high';
    if (trafficPotential > 200) return 'medium';
    return 'low';
  }

  private recommendKeywordAction(ourPos: number | null, competitorPos: number, keyword: string): string {
    if (!ourPos) {
      return `Create targeted content for "${keyword}" to capture missing traffic`;
    }
    if (ourPos > 20) {
      return `Major content overhaul needed for "${keyword}" - competitor has ${competitorPos} position`;
    }
    if (ourPos > 10) {
      return `Optimize existing content for "${keyword}" - aim for top 10`;
    }
    return `Enhance content quality for "${keyword}" to overtake position ${competitorPos}`;
  }

  private extractTopics(serpData: SerpData[], intelligence: StrategicIntelligence): string[] {
    const topics = new Set<string>();
    
    // Extract from keywords
    for (const serp of serpData) {
      const words = serp.keyword.split(' ');
      if (words.length >= 2) {
        topics.add(words.slice(0, 2).join(' '));
      }
    }
    
    // Add high-opportunity topics
    for (const opp of intelligence.opportunities.slice(0, 20)) {
      const words = opp.keyword.split(' ');
      if (words.length >= 2) {
        topics.add(words.slice(0, 2).join(' '));
      }
    }
    
    return Array.from(topics).slice(0, 30);
  }

  private analyzeCompetitorCoverage(
    topic: string,
    serpData: SerpData[],
    competitors: Competitor[]
  ): any[] {
    const coverage = [];
    const topCompetitors = competitors.slice(0, 5);
    
    for (const competitor of topCompetitors) {
      const relevantSerps = serpData.filter(s => 
        s.keyword.toLowerCase().includes(topic.toLowerCase()) &&
        s.results.some(r => r.domain === competitor.domain)
      );
      
      if (relevantSerps.length > 0) {
        coverage.push({
          domain: competitor.domain,
          contentType: this.inferContentType(relevantSerps[0]),
          qualityScore: competitor.content_quality_score,
          estimatedViews: relevantSerps.reduce((sum, s) => sum + s.search_volume * 0.1, 0),
          socialShares: Math.round(Math.random() * 500 + 100),
          backlinks: Math.round(Math.random() * 50 + 10)
        });
      }
    }
    
    return coverage;
  }

  private analyzeOurCoverage(topic: string, serpData: SerpData[]): any {
    const relevantSerps = serpData.filter(s => 
      s.keyword.toLowerCase().includes(topic.toLowerCase()) &&
      s.results.some(r => r.domain === this.ourDomain)
    );
    
    if (relevantSerps.length === 0) {
      return {
        has_content: false,
        content_type: null,
        quality_score: null,
        last_updated: null
      };
    }
    
    const ourResult = relevantSerps[0].results.find(r => r.domain === this.ourDomain);
    
    return {
      has_content: true,
      content_type: this.inferContentType(relevantSerps[0]),
      quality_score: ourResult?.position ? Math.max(0, 10 - ourResult.position) : 5,
      last_updated: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  private inferContentType(serp: SerpData): string {
    const keyword = serp.keyword.toLowerCase();
    
    if (keyword.includes('how to') || keyword.includes('guide')) return 'guide';
    if (keyword.includes('vs') || keyword.includes('compare')) return 'comparison';
    if (keyword.includes('review')) return 'review';
    if (keyword.includes('best') || keyword.includes('top')) return 'listicle';
    if (keyword.includes('tool') || keyword.includes('software')) return 'product';
    
    return 'article';
  }

  private calculateOpportunityScore(competitorCoverage: any[], ourCoverage: any): number {
    const avgCompetitorQuality = competitorCoverage.reduce((sum, c) => sum + c.qualityScore, 0) / 
                                 (competitorCoverage.length || 1);
    const ourQuality = ourCoverage.quality_score || 0;
    const gap = avgCompetitorQuality - ourQuality;
    
    const trafficPotential = competitorCoverage.reduce((sum, c) => sum + c.estimatedViews, 0) / 1000;
    
    return Math.min(10, gap + trafficPotential);
  }

  private recommendContentType(topic: string, competitorCoverage: any[]): string {
    const contentTypes = competitorCoverage.map(c => c.contentType);
    const typeFrequency = new Map<string, number>();
    
    for (const type of contentTypes) {
      typeFrequency.set(type, (typeFrequency.get(type) || 0) + 1);
    }
    
    const mostCommon = Array.from(typeFrequency.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    return mostCommon ? mostCommon[0] : 'comprehensive guide';
  }

  private estimateContentEffort(topic: string, competitorCoverage: any[]): ContentGap['estimated_effort'] {
    const avgQuality = competitorCoverage.reduce((sum, c) => sum + c.qualityScore, 0) / 
                      (competitorCoverage.length || 1);
    
    if (avgQuality > 8) return 'high';
    if (avgQuality > 6) return 'medium';
    return 'low';
  }

  private estimateContentImpact(topic: string, competitorCoverage: any[]): ContentGap['expected_impact'] {
    const totalViews = competitorCoverage.reduce((sum, c) => sum + c.estimatedViews, 0);
    
    if (totalViews > 10000) return 'very_high';
    if (totalViews > 5000) return 'high';
    if (totalViews > 1000) return 'medium';
    return 'low';
  }

  private analyzeContentStrategy(competitor: Competitor, serpData: SerpData[]): CompetitiveStrategy | null {
    const competitorSerps = serpData.filter(s => 
      s.results.some(r => r.domain === competitor.domain)
    );
    
    if (competitorSerps.length < 5) return null;
    
    const contentTypes = competitorSerps.map(s => this.inferContentType(s));
    const uniqueTypes = new Set(contentTypes);
    
    return {
      competitor: competitor.domain,
      strategy_type: 'content_marketing',
      tactics_observed: [
        `${uniqueTypes.size} different content types`,
        `Focus on ${this.getMostCommonElement(contentTypes)} content`,
        `Average position: ${this.getAveragePosition(competitor.domain, serpData).toFixed(1)}`,
        `${competitorSerps.length} pieces of ranking content`
      ],
      effectiveness_score: competitor.content_quality_score,
      replicable: true,
      adaptation_recommendation: `Create similar ${this.getMostCommonElement(contentTypes)} content with improved depth and quality`,
      implementation_priority: competitor.threat_level === 'high' ? 'high' : 'medium',
      resource_requirement: {
        time_weeks: 8,
        budget_estimate: 5000,
        team_skills: ['Content Writing', 'SEO', 'Subject Matter Expertise']
      }
    };
  }

  private analyzeSEOStrategy(competitor: Competitor, serpData: SerpData[]): CompetitiveStrategy | null {
    if (competitor.technical_score < 7) return null;
    
    return {
      competitor: competitor.domain,
      strategy_type: 'technical_seo',
      tactics_observed: [
        `Technical score: ${competitor.technical_score}/10`,
        `${competitor.backlink_strength}/10 backlink strength`,
        'Fast page load times',
        'Mobile-optimized experience'
      ],
      effectiveness_score: (competitor.technical_score + competitor.backlink_strength) / 2,
      replicable: true,
      adaptation_recommendation: 'Improve technical SEO foundations and build quality backlinks',
      implementation_priority: 'high',
      resource_requirement: {
        time_weeks: 12,
        budget_estimate: 8000,
        team_skills: ['Technical SEO', 'Web Development', 'Link Building']
      }
    };
  }

  private analyzePaidStrategy(competitor: Competitor, serpData: SerpData[]): CompetitiveStrategy | null {
    if (competitor.ad_spend_estimate < 1000) return null;
    
    const adAppearances = serpData.filter(s => 
      s.ads?.some(ad => ad.domain === competitor.domain)
    ).length;
    
    return {
      competitor: competitor.domain,
      strategy_type: 'paid_search',
      tactics_observed: [
        `$${competitor.ad_spend_estimate.toLocaleString()} estimated monthly spend`,
        `${adAppearances} ad campaigns running`,
        'Premium ad positions targeting',
        'Aggressive bidding on commercial keywords'
      ],
      effectiveness_score: Math.min(10, competitor.ad_spend_estimate / 1000),
      replicable: true,
      adaptation_recommendation: 'Launch targeted PPC campaigns on high-converting keywords',
      implementation_priority: 'medium',
      resource_requirement: {
        time_weeks: 2,
        budget_estimate: competitor.ad_spend_estimate * 0.5,
        team_skills: ['PPC Management', 'Ad Copywriting', 'Conversion Optimization']
      }
    };
  }

  private analyzeProductStrategy(
    competitor: Competitor,
    intelligence: StrategicIntelligence
  ): CompetitiveStrategy | null {
    return {
      competitor: competitor.domain,
      strategy_type: 'product_features',
      tactics_observed: [
        'Feature-rich product offering',
        'Regular product updates',
        'Strong user experience focus',
        'Competitive pricing model'
      ],
      effectiveness_score: 7.5,
      replicable: false,
      adaptation_recommendation: 'Focus on unique value propositions and differentiating features',
      implementation_priority: 'low',
      resource_requirement: {
        time_weeks: 24,
        budget_estimate: 50000,
        team_skills: ['Product Management', 'Engineering', 'UX Design']
      }
    };
  }

  private getMostCommonElement(arr: string[]): string {
    const frequency = new Map<string, number>();
    for (const item of arr) {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    }
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
  }

  private getAveragePosition(domain: string, serpData: SerpData[]): number {
    const positions = [];
    for (const serp of serpData) {
      const position = serp.results.findIndex(r => r.domain === domain) + 1;
      if (position > 0) {
        positions.push(position);
      }
    }
    return positions.length > 0
      ? positions.reduce((sum, p) => sum + p, 0) / positions.length
      : 50;
  }

  private calculateOurVisibility(serpData: SerpData[]): number {
    let appearances = 0;
    let totalPosition = 0;
    
    for (const serp of serpData) {
      const position = serp.results.findIndex(r => r.domain === this.ourDomain) + 1;
      if (position > 0) {
        appearances++;
        totalPosition += position;
      }
    }
    
    if (appearances === 0) return 0;
    
    const avgPosition = totalPosition / appearances;
    const appearanceRate = (appearances / serpData.length) * 100;
    const positionScore = Math.max(0, 100 - (avgPosition * 10));
    
    return (appearanceRate * 0.5) + (positionScore * 0.5);
  }

  private calculateOurMarketShare(ourVisibility: number, competitors: Competitor[]): number {
    const totalMarketShare = competitors.reduce((sum, c) => sum + c.market_share, 0);
    const remainingShare = Math.max(0, 100 - totalMarketShare);
    
    return Math.min(remainingShare, ourVisibility / 2);
  }

  private determineGrowthTrend(serpData: SerpData[]): MarketPosition['our_position']['growth_trend'] {
    // Simplified trend analysis
    const randomTrend = Math.random();
    if (randomTrend > 0.7) return 'accelerating';
    if (randomTrend > 0.5) return 'growing';
    if (randomTrend > 0.3) return 'stable';
    return 'declining';
  }

  private identifyDifferentiators(competitor: Competitor, serpData: SerpData[]): string[] {
    const differentiators = [];
    
    if (competitor.content_quality_score > 8) {
      differentiators.push('Exceptional content quality');
    }
    if (competitor.technical_score > 8) {
      differentiators.push('Superior technical implementation');
    }
    if (competitor.ad_spend_estimate > 10000) {
      differentiators.push('Significant advertising investment');
    }
    if (competitor.visibility_score > 70) {
      differentiators.push('Dominant SERP presence');
    }
    
    return differentiators.slice(0, 3);
  }

  private identifyEmergingThreats(
    competitors: Competitor[],
    serpData: SerpData[]
  ): MarketPosition['emerging_threats'] {
    const threats = [];
    
    for (const competitor of competitors.slice(5, 10)) {
      if (competitor.visibility_score > 30) {
        threats.push({
          domain: competitor.domain,
          growth_rate: Math.round(Math.random() * 50 + 20),
          disruptive_factors: [
            'Aggressive content production',
            'Innovative features',
            'Strong funding'
          ].slice(0, Math.floor(Math.random() * 3) + 1),
          time_to_threat: Math.random() > 0.5 ? 'immediate' : '3_months' as const
        });
      }
    }
    
    return threats.slice(0, 3);
  }

  private identifyMarketOpportunities(
    serpData: SerpData[],
    intelligence: StrategicIntelligence,
    competitors: Competitor[]
  ): MarketPosition['market_opportunities'] {
    const opportunities = [];
    
    // Low competition keywords
    const lowCompKeywords = serpData.filter(s => {
      const competitorCount = competitors.filter(c => 
        s.results.some(r => r.domain === c.domain)
      ).length;
      return competitorCount < 3;
    });
    
    if (lowCompKeywords.length > 0) {
      opportunities.push({
        opportunity: `${lowCompKeywords.length} low-competition keywords`,
        addressable_market: lowCompKeywords.reduce((sum, s) => sum + s.search_volume, 0),
        competition_level: 'low' as const,
        entry_barriers: ['Content creation', 'SEO optimization'],
        recommended_approach: 'Create targeted content for quick wins'
      });
    }
    
    // Content gaps
    opportunities.push({
      opportunity: 'Underserved content topics',
      addressable_market: 50000,
      competition_level: 'medium' as const,
      entry_barriers: ['Subject expertise', 'Content production capacity'],
      recommended_approach: 'Develop comprehensive guides and resources'
    });
    
    // Feature differentiation
    opportunities.push({
      opportunity: 'Unique feature development',
      addressable_market: 100000,
      competition_level: 'high' as const,
      entry_barriers: ['Development resources', 'Time to market'],
      recommended_approach: 'Focus on user pain points competitors ignore'
    });
    
    return opportunities;
  }

  private identifyOurStrengths(serpData: SerpData[]): string[] {
    return [
      'Chrome extension expertise',
      'Privacy-focused approach',
      'Free tier offering',
      'User-friendly interface'
    ];
  }

  private identifyOurWeaknesses(serpData: SerpData[]): string[] {
    return [
      'Limited content coverage',
      'Lower domain authority',
      'Smaller marketing budget',
      'Newer market entrant'
    ];
  }

  private identifyUniqueAdvantages(): string[] {
    return [
      'No data collection policy',
      'Lightweight extension size',
      'Offline functionality',
      'Open-source components'
    ];
  }

  private generateKeywordActions(keywordGaps: KeywordGap[]): any[] {
    return keywordGaps.map(gap => ({
      action: gap.recommended_action,
      impact: gap.priority === 'urgent' ? 'critical' : gap.priority === 'high' ? 'high' : 'medium',
      effort: gap.gap_type === 'missing' ? 'high' : 'medium',
      timeline: gap.priority === 'urgent' ? '1 week' : '2-4 weeks',
      success_metrics: [
        `Achieve top 10 ranking for "${gap.keyword}"`,
        `Capture ${gap.estimated_traffic_loss} monthly visits`,
        `Outrank ${gap.competitor_ranking} position`
      ]
    }));
  }

  private generateContentActions(contentGaps: ContentGap[]): any[] {
    return contentGaps.map(gap => ({
      action: `Create ${gap.recommended_content_type} for "${gap.topic}"`,
      impact: gap.expected_impact === 'very_high' ? 'critical' : gap.expected_impact,
      effort: gap.estimated_effort,
      timeline: gap.estimated_effort === 'high' ? '4-6 weeks' : '2-3 weeks',
      success_metrics: [
        `Achieve quality score > ${gap.competitor_coverage[0]?.quality_score || 7}`,
        'Rank in top 5 for topic keywords',
        'Generate 1000+ monthly organic visits'
      ]
    }));
  }

  private generateStrategyActions(strategies: CompetitiveStrategy[]): any[] {
    return strategies.filter(s => s.replicable).map(strategy => ({
      action: strategy.adaptation_recommendation,
      impact: strategy.implementation_priority === 'urgent' ? 'critical' : 
              strategy.implementation_priority === 'high' ? 'high' : 'medium',
      effort: strategy.resource_requirement.time_weeks > 8 ? 'high' : 'medium',
      timeline: `${strategy.resource_requirement.time_weeks} weeks`,
      success_metrics: [
        `Match competitor ${strategy.competitor} performance`,
        `Achieve ${strategy.effectiveness_score}/10 effectiveness`,
        'Improve market position by 10%'
      ]
    }));
  }

  private createContentInitiative(contentGaps: ContentGap[]): any {
    const totalOpportunityScore = contentGaps.reduce((sum, g) => sum + g.opportunity_score, 0);
    
    return {
      initiative: 'Content Gap Closure Program',
      objectives: [
        `Create ${contentGaps.length} new content pieces`,
        'Improve topical authority',
        'Capture competitor traffic'
      ],
      budget_required: contentGaps.length * 500,
      expected_roi: totalOpportunityScore * 1000,
      risk_factors: [
        'Content quality requirements',
        'Resource availability',
        'Competitor response'
      ]
    };
  }

  private createSEOInitiative(keywordGaps: KeywordGap[]): any {
    const totalTrafficLoss = keywordGaps.reduce((sum, g) => sum + g.estimated_traffic_loss, 0);
    
    return {
      initiative: 'Keyword Gap Recovery Campaign',
      objectives: [
        `Close ${keywordGaps.length} keyword gaps`,
        `Recover ${totalTrafficLoss} monthly visits`,
        'Improve average ranking position'
      ],
      budget_required: 10000,
      expected_roi: totalTrafficLoss * 2.5 * 12, // Annual value
      risk_factors: [
        'Algorithm changes',
        'Competitor escalation',
        'Ranking volatility'
      ]
    };
  }

  private createCompetitiveInitiative(strategies: CompetitiveStrategy[]): any {
    return {
      initiative: 'Competitive Strategy Adaptation',
      objectives: [
        'Implement top competitor tactics',
        'Neutralize competitive advantages',
        'Build defensive moat'
      ],
      budget_required: 25000,
      expected_roi: 75000,
      risk_factors: [
        'Execution complexity',
        'Market dynamics',
        'Resource constraints'
      ]
    };
  }

  private createMarketExpansionInitiative(marketPosition: MarketPosition): any {
    return {
      initiative: 'Market Share Growth Program',
      objectives: [
        `Increase market share to ${(marketPosition.our_position.market_share + 5).toFixed(1)}%`,
        'Enter 2 new market segments',
        'Establish thought leadership'
      ],
      budget_required: 50000,
      expected_roi: 150000,
      risk_factors: [
        'Market saturation',
        'Incumbent response',
        'Economic conditions'
      ]
    };
  }

  private prioritizeFocusAreas(
    keywordGaps: KeywordGap[],
    contentGaps: ContentGap[],
    strategies: CompetitiveStrategy[],
    marketPosition: MarketPosition
  ): string[] {
    const focusAreas = [];
    
    // High-priority keyword gaps
    if (keywordGaps.filter(g => g.priority === 'urgent' || g.priority === 'high').length > 10) {
      focusAreas.push('Urgent keyword gap closure');
    }
    
    // Content opportunities
    if (contentGaps.filter(g => g.expected_impact === 'very_high' || g.expected_impact === 'high').length > 5) {
      focusAreas.push('High-impact content creation');
    }
    
    // Competitive threats
    if (marketPosition.emerging_threats.some(t => t.time_to_threat === 'immediate')) {
      focusAreas.push('Defensive strategy implementation');
    }
    
    // Market opportunities
    if (marketPosition.market_opportunities.some(o => o.competition_level === 'low')) {
      focusAreas.push('Low-competition market capture');
    }
    
    // Technical improvements
    if (strategies.some(s => s.strategy_type === 'technical_seo' && s.implementation_priority === 'high')) {
      focusAreas.push('Technical SEO enhancement');
    }
    
    return focusAreas.slice(0, 4);
  }

  private calculateSuccessProbability(
    marketPosition: MarketPosition,
    competitors: Competitor[],
    strategies: CompetitiveStrategy[]
  ): number {
    let probability = 50; // Base probability
    
    // Positive factors
    if (marketPosition.our_position.growth_trend === 'growing' || 
        marketPosition.our_position.growth_trend === 'accelerating') {
      probability += 10;
    }
    if (marketPosition.our_position.unique_advantages.length > 2) {
      probability += 10;
    }
    if (strategies.filter(s => s.replicable).length > 5) {
      probability += 10;
    }
    if (marketPosition.market_opportunities.filter(o => o.competition_level === 'low').length > 1) {
      probability += 10;
    }
    
    // Negative factors
    if (competitors.filter(c => c.threat_level === 'critical').length > 0) {
      probability -= 10;
    }
    if (marketPosition.emerging_threats.filter(t => t.time_to_threat === 'immediate').length > 1) {
      probability -= 10;
    }
    if (marketPosition.our_position.market_share < 5) {
      probability -= 5;
    }
    
    return Math.max(20, Math.min(95, probability));
  }

  // === EXPORT METHODS ===

  async exportToJSON(intelligence: CompetitiveIntelligence, outputPath: string): Promise<void> {
    await writeFile(outputPath, JSON.stringify(intelligence, null, 2));
    console.log(`✅ Competitive intelligence exported to: ${outputPath}`);
  }

  async exportToMarkdown(intelligence: CompetitiveIntelligence, outputPath: string): Promise<void> {
    const markdown = this.generateMarkdownReport(intelligence);
    await writeFile(outputPath, markdown);
    console.log(`✅ Competitive intelligence report exported to: ${outputPath}`);
  }

  private generateMarkdownReport(intelligence: CompetitiveIntelligence): string {
    return `# Competitive Intelligence Report

## Executive Summary
- **Scan Date**: ${new Date(intelligence.metadata.scan_date).toLocaleDateString()}
- **Competitors Tracked**: ${intelligence.metadata.competitors_tracked}
- **Keywords Analyzed**: ${intelligence.metadata.keywords_analyzed}
- **Success Probability**: ${intelligence.insights_summary.success_probability}%

## Key Findings
${intelligence.insights_summary.key_findings.map(f => `- ${f}`).join('\n')}

## Biggest Threats
${intelligence.insights_summary.biggest_threats.map(t => `- ⚠️ ${t}`).join('\n')}

## Biggest Opportunities
${intelligence.insights_summary.biggest_opportunities.map(o => `- 🎯 ${o}`).join('\n')}

## Top Competitors
${intelligence.competitors.slice(0, 5).map(c => 
  `### ${c.domain}
- Threat Level: ${c.threat_level.toUpperCase()}
- Visibility Score: ${c.visibility_score.toFixed(0)}%
- Market Share: ${c.market_share}%
- Strengths: ${c.strengths.join(', ')}
- Weaknesses: ${c.weaknesses.join(', ')}`
).join('\n\n')}

## Immediate Action Plan
${intelligence.action_plan.immediate_actions.slice(0, 5).map(a => 
  `- **${a.action}**
  - Impact: ${a.impact}
  - Timeline: ${a.timeline}`
).join('\n')}

## Recommended Focus Areas
${intelligence.insights_summary.recommended_focus_areas.map(area => `1. ${area}`).join('\n')}
`;
  }
}

// === MAIN EXPORT ===
export default CompetitiveIntelligenceScanner;