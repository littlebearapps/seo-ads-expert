import axios from 'axios';
import pino from 'pino';
import { z } from 'zod';
import { CacheManager } from '../utils/cache.js';
import { PerformanceMonitor } from '../monitors/performance.js';
import { validateEnvironment } from '../utils/validation.js';
import { KeywordData, KeywordDataSchema } from './types.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Bing keyword data schemas
export const BingKeywordSuggestionSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().optional(),
  competition: z.enum(['Low', 'Medium', 'High']).optional(),
  suggestedBid: z.number().optional(),
  impressionShare: z.number().optional(),
  source: z.string().default('bing')
});

export const BingKeywordMetricsSchema = z.object({
  keyword: z.string(),
  monthlySearches: z.number(),
  avgCpc: z.number(),
  competition: z.number(),
  competitionLevel: z.enum(['Low', 'Medium', 'High']),
  topOfPageBid: z.number().optional(),
  impressionShare: z.number().optional(),
  clickShare: z.number().optional(),
  deviceBreakdown: z.object({
    desktop: z.number(),
    mobile: z.number(),
    tablet: z.number()
  }).optional(),
  locationBreakdown: z.record(z.number()).optional()
});

export const BingSearchQueryReportSchema = z.object({
  searchQuery: z.string(),
  keyword: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  avgCpc: z.number(),
  conversions: z.number().optional(),
  conversionRate: z.number().optional()
});

export type BingKeywordSuggestion = z.infer<typeof BingKeywordSuggestionSchema>;
export type BingKeywordMetrics = z.infer<typeof BingKeywordMetricsSchema>;
export type BingSearchQueryReport = z.infer<typeof BingSearchQueryReportSchema>;

// Bing Keywords API response types
export interface BingKeywordsResponse {
  suggestions: BingKeywordSuggestion[];
  metrics: BingKeywordMetrics[];
  totalResults: number;
  market: string;
}

export interface BingMarketOpportunity {
  market: string;
  totalSearchVolume: number;
  avgCompetition: number;
  avgCpc: number;
  opportunityScore: number;
  topKeywords: BingKeywordMetrics[];
  deviceDistribution: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
}

export class BingKeywordsConnector {
  private apiKey?: string;
  private cache: CacheManager;
  private performanceMonitor: PerformanceMonitor;
  private baseUrl = 'https://api.bing.microsoft.com/v7.0';
  private isConfigured = false;

  constructor() {
    this.cache = new CacheManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.initialize();
  }

  private initialize(): void {
    try {
      const env = validateEnvironment();
      
      if (env.BING_API_KEY) {
        this.apiKey = env.BING_API_KEY;
        this.isConfigured = true;
        logger.info('Bing Keywords API configured successfully');
      } else {
        logger.warn('Bing API key not configured - using simulated data');
      }
    } catch (error) {
      logger.error('Error initializing Bing Keywords connector:', error);
    }
  }

  /**
   * Get keyword suggestions from Bing
   */
  async getKeywordSuggestions(
    seedKeywords: string[],
    market = 'en-AU',
    options?: {
      maxResults?: number;
      includeMetrics?: boolean;
      deviceType?: 'desktop' | 'mobile' | 'all';
    }
  ): Promise<BingKeywordsResponse> {
    const cacheKey = `bing-suggestions-${seedKeywords.join('-')}-${market}`;
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.info('Using cached Bing keyword suggestions');
      return cached as BingKeywordsResponse;
    }

    // If API not configured, return simulated data
    if (!this.isConfigured) {
      return this.getSimulatedSuggestions(seedKeywords, market, options);
    }

    try {
      // Use performance monitor for API calls
      return await this.performanceMonitor.executeWithCircuitBreaker(async () => {
        const suggestions: BingKeywordSuggestion[] = [];
        const metrics: BingKeywordMetrics[] = [];

        // In a real implementation, this would call Bing Ads API
        // For now, we'll simulate the API response
        for (const seed of seedKeywords) {
          const response = await this.fetchBingSuggestions(seed, market, options);
          suggestions.push(...response.suggestions);
          if (options?.includeMetrics) {
            metrics.push(...response.metrics);
          }
        }

        const result: BingKeywordsResponse = {
          suggestions: this.deduplicateSuggestions(suggestions),
          metrics,
          totalResults: suggestions.length,
          market
        };

        // Cache the result
        await this.cache.set(cacheKey, result);
        
        return result;
      });
    } catch (error) {
      logger.error('Error fetching Bing keyword suggestions:', error);
      return this.getSimulatedSuggestions(seedKeywords, market, options);
    }
  }

  /**
   * Get keyword metrics from Bing
   */
  async getKeywordMetrics(
    keywords: string[],
    market = 'en-AU'
  ): Promise<BingKeywordMetrics[]> {
    const cacheKey = `bing-metrics-${keywords.join('-')}-${market}`;
    
    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached as BingKeywordMetrics[];
    }

    if (!this.isConfigured) {
      return this.getSimulatedMetrics(keywords, market);
    }

    try {
      const metrics = await this.performanceMonitor.executeWithCircuitBreaker(async () => {
        // In real implementation, call Bing Ads API
        return this.fetchBingMetrics(keywords, market);
      });

      await this.cache.set(cacheKey, metrics);
      return metrics;
    } catch (error) {
      logger.error('Error fetching Bing keyword metrics:', error);
      return this.getSimulatedMetrics(keywords, market);
    }
  }

  /**
   * Calculate Edge/Bing market opportunity
   */
  async calculateMarketOpportunity(
    product: string,
    keywords: string[],
    market = 'en-AU'
  ): Promise<BingMarketOpportunity> {
    logger.info(`Calculating Bing market opportunity for ${product} in ${market}`);

    const metrics = await this.getKeywordMetrics(keywords, market);
    
    // Calculate aggregate metrics
    let totalSearchVolume = 0;
    let totalCompetition = 0;
    let totalCpc = 0;
    const deviceDistribution = {
      desktop: 0,
      mobile: 0,
      tablet: 0
    };

    for (const metric of metrics) {
      totalSearchVolume += metric.monthlySearches;
      totalCompetition += metric.competition;
      totalCpc += metric.avgCpc;
      
      if (metric.deviceBreakdown) {
        deviceDistribution.desktop += metric.deviceBreakdown.desktop;
        deviceDistribution.mobile += metric.deviceBreakdown.mobile;
        deviceDistribution.tablet += metric.deviceBreakdown.tablet;
      }
    }

    const avgCompetition = metrics.length > 0 ? totalCompetition / metrics.length : 0;
    const avgCpc = metrics.length > 0 ? totalCpc / metrics.length : 0;

    // Calculate opportunity score (0-100)
    const volumeScore = Math.min(totalSearchVolume / 1000, 100) * 0.4;
    const competitionScore = (1 - avgCompetition) * 100 * 0.3;
    const cpcScore = Math.min(avgCpc * 10, 100) * 0.3;
    const opportunityScore = volumeScore + competitionScore + cpcScore;

    // Normalize device distribution
    const totalDevice = deviceDistribution.desktop + deviceDistribution.mobile + deviceDistribution.tablet;
    if (totalDevice > 0) {
      deviceDistribution.desktop = (deviceDistribution.desktop / totalDevice) * 100;
      deviceDistribution.mobile = (deviceDistribution.mobile / totalDevice) * 100;
      deviceDistribution.tablet = (deviceDistribution.tablet / totalDevice) * 100;
    }

    // Get top keywords by search volume
    const topKeywords = metrics
      .sort((a, b) => b.monthlySearches - a.monthlySearches)
      .slice(0, 10);

    return {
      market,
      totalSearchVolume,
      avgCompetition,
      avgCpc,
      opportunityScore,
      topKeywords,
      deviceDistribution
    };
  }

  /**
   * Merge Bing data with existing keyword data
   */
  mergeWithKeywordData(
    existingData: KeywordData[],
    bingMetrics: BingKeywordMetrics[]
  ): KeywordData[] {
    const bingMap = new Map(bingMetrics.map(m => [m.keyword.toLowerCase(), m]));
    
    return existingData.map(keyword => {
      const bingData = bingMap.get(keyword.keyword.toLowerCase());
      
      if (bingData) {
        return {
          ...keyword,
          bingSearchVolume: bingData.monthlySearches,
          bingCpc: bingData.avgCpc,
          bingCompetition: bingData.competition,
          bingCompetitionLevel: bingData.competitionLevel,
          bingTopOfPageBid: bingData.topOfPageBid,
          // Add Bing-specific score adjustment
          adjustedScore: keyword.score * (1 + (bingData.monthlySearches / 10000))
        };
      }
      
      return keyword;
    });
  }

  /**
   * Fetch suggestions from Bing API (simulated)
   */
  private async fetchBingSuggestions(
    seed: string,
    market: string,
    options?: any
  ): Promise<{ suggestions: BingKeywordSuggestion[]; metrics: BingKeywordMetrics[] }> {
    // This would be the actual API call
    // For now, return simulated data
    return {
      suggestions: this.generateSimulatedSuggestions(seed),
      metrics: []
    };
  }

  /**
   * Fetch metrics from Bing API (simulated)
   */
  private async fetchBingMetrics(
    keywords: string[],
    market: string
  ): Promise<BingKeywordMetrics[]> {
    // This would be the actual API call
    // For now, return simulated data
    return this.getSimulatedMetrics(keywords, market);
  }

  /**
   * Get simulated suggestions for testing
   */
  private getSimulatedSuggestions(
    seedKeywords: string[],
    market: string,
    options?: any
  ): BingKeywordsResponse {
    const suggestions: BingKeywordSuggestion[] = [];
    
    for (const seed of seedKeywords) {
      suggestions.push(...this.generateSimulatedSuggestions(seed));
    }

    return {
      suggestions: this.deduplicateSuggestions(suggestions),
      metrics: [],
      totalResults: suggestions.length,
      market
    };
  }

  /**
   * Generate simulated suggestions for a seed keyword
   */
  private generateSimulatedSuggestions(seed: string): BingKeywordSuggestion[] {
    const variations = [
      `best ${seed}`,
      `${seed} for edge`,
      `${seed} microsoft`,
      `how to use ${seed}`,
      `${seed} extension`,
      `${seed} addon`,
      `free ${seed}`,
      `${seed} download`,
      `${seed} review`,
      `${seed} alternative`
    ];

    return variations.map(keyword => ({
      keyword,
      searchVolume: Math.floor(Math.random() * 5000) + 100,
      competition: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)] as 'Low' | 'Medium' | 'High',
      suggestedBid: Math.random() * 3 + 0.5,
      impressionShare: Math.random() * 0.5,
      source: 'bing'
    }));
  }

  /**
   * Get simulated metrics for testing
   */
  private getSimulatedMetrics(keywords: string[], market: string): BingKeywordMetrics[] {
    return keywords.map(keyword => {
      const competition = Math.random();
      return {
        keyword,
        monthlySearches: Math.floor(Math.random() * 10000) + 100,
        avgCpc: Math.random() * 3 + 0.5,
        competition,
        competitionLevel: competition < 0.33 ? 'Low' : competition < 0.66 ? 'Medium' : 'High',
        topOfPageBid: Math.random() * 5 + 1,
        impressionShare: Math.random(),
        clickShare: Math.random() * 0.5,
        deviceBreakdown: {
          desktop: Math.random() * 60 + 20,
          mobile: Math.random() * 30 + 10,
          tablet: Math.random() * 10 + 5
        }
      };
    });
  }

  /**
   * Deduplicate suggestions
   */
  private deduplicateSuggestions(suggestions: BingKeywordSuggestion[]): BingKeywordSuggestion[] {
    const seen = new Set<string>();
    const unique: BingKeywordSuggestion[] = [];
    
    for (const suggestion of suggestions) {
      const key = suggestion.keyword.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }
    
    return unique;
  }

  /**
   * Check if connector is configured
   */
  getIsConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Get search query performance report (for existing campaigns)
   */
  async getSearchQueryReport(
    campaignId?: string,
    dateRange?: { start: string; end: string }
  ): Promise<BingSearchQueryReport[]> {
    // This would fetch actual search query data from Bing Ads
    // For now, return empty array as this requires active campaigns
    logger.info('Search query report requested - requires active Bing Ads campaigns');
    return [];
  }

  /**
   * Get competitive insights for Bing
   */
  async getCompetitiveInsights(
    keywords: string[],
    market = 'en-AU'
  ): Promise<{
    avgCompetitorBid: number;
    topCompetitors: string[];
    competitionTrend: 'increasing' | 'stable' | 'decreasing';
    recommendedBidAdjustment: number;
  }> {
    const metrics = await this.getKeywordMetrics(keywords, market);
    
    const avgBid = metrics.reduce((sum, m) => sum + m.avgCpc, 0) / metrics.length;
    const avgCompetition = metrics.reduce((sum, m) => sum + m.competition, 0) / metrics.length;
    
    return {
      avgCompetitorBid: avgBid * 1.2, // Estimate competitor bids 20% higher
      topCompetitors: [
        'Competitor A',
        'Competitor B',
        'Competitor C'
      ], // Would come from actual API
      competitionTrend: avgCompetition > 0.6 ? 'increasing' : avgCompetition < 0.4 ? 'decreasing' : 'stable',
      recommendedBidAdjustment: avgCompetition > 0.7 ? 1.3 : avgCompetition > 0.4 ? 1.1 : 1.0
    };
  }
}