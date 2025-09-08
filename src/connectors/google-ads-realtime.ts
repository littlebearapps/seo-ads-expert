/**
 * v1.4 Google Ads API Real-Time Data Fetching Implementation
 * Provides live data integration with Google Ads API using official client library
 */

import { GoogleAdsApi, Customer, enums } from 'google-ads-api';
import pino from 'pino';
import { z } from 'zod';
import { CacheManager } from '../utils/cache.js';
import { PerformanceMonitor } from '../monitors/performance.js';
import { validateEnvironment } from '../utils/validation.js';
import crypto from 'crypto';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Real-time data schemas
export const RealtimeMetricsSchema = z.object({
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  cost: z.number(),
  ctr: z.number(),
  conversionRate: z.number(),
  averageCpc: z.number(),
  qualityScore: z.number().optional(),
  searchImpressionShare: z.number().optional(),
  searchTopImpressionShare: z.number().optional(),
  timestamp: z.string()
});

export const RealtimeCampaignDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  budget: z.number(),
  metrics: RealtimeMetricsSchema,
  lastUpdate: z.string()
});

export const RealtimeAdGroupDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  campaignId: z.string(),
  status: z.string(),
  cpcBid: z.number(),
  metrics: RealtimeMetricsSchema,
  lastUpdate: z.string()
});

export const RealtimeKeywordDataSchema = z.object({
  id: z.string(),
  text: z.string(),
  matchType: z.string(),
  adGroupId: z.string(),
  qualityScore: z.number().optional(),
  firstPageCpc: z.number().optional(),
  topOfPageCpc: z.number().optional(),
  metrics: RealtimeMetricsSchema,
  lastUpdate: z.string()
});

export type RealtimeMetrics = z.infer<typeof RealtimeMetricsSchema>;
export type RealtimeCampaignData = z.infer<typeof RealtimeCampaignDataSchema>;
export type RealtimeAdGroupData = z.infer<typeof RealtimeAdGroupDataSchema>;
export type RealtimeKeywordData = z.infer<typeof RealtimeKeywordDataSchema>;

// Configuration for real-time data fetching
interface RealtimeConfig {
  refreshInterval: number; // milliseconds
  enableWebsocket: boolean;
  metricsWindow: 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';
  includeQualityScore: boolean;
  includeSearchTerms: boolean;
}

/**
 * Google Ads Real-Time Data Client
 * Provides live data fetching and streaming capabilities
 */
export class GoogleAdsRealtimeClient {
  private client?: GoogleAdsApi;
  private customer?: Customer;
  private cache: CacheManager;
  private performanceMonitor: PerformanceMonitor;
  private config: RealtimeConfig;
  private isConnected = false;
  private customerId?: string;
  private refreshTimer?: NodeJS.Timeout;
  private dataListeners: Map<string, (data: any) => void> = new Map();

  constructor(config?: Partial<RealtimeConfig>) {
    this.cache = new CacheManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.config = {
      refreshInterval: 60000, // 1 minute default
      enableWebsocket: false,
      metricsWindow: 'TODAY',
      includeQualityScore: true,
      includeSearchTerms: true,
      ...config
    };
    this.initialize().catch(error => {
      logger.error('Failed to initialize real-time client:', error);
    });
  }

  private async initialize(): Promise<void> {
    try {
      const env = validateEnvironment();
      
      if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_CLIENT_SECRET || 
          !env.GOOGLE_ADS_REFRESH_TOKEN || !env.GOOGLE_ADS_DEVELOPER_TOKEN ||
          !env.GOOGLE_ADS_CUSTOMER_ID) {
        logger.warn('Google Ads API real-time credentials not fully configured');
        return;
      }

      // Initialize the official Google Ads API client
      this.client = new GoogleAdsApi({
        client_id: env.GOOGLE_ADS_CLIENT_ID,
        client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
        developer_token: env.GOOGLE_ADS_DEVELOPER_TOKEN
      });

      // Set refresh token for authentication
      this.customer = this.client.Customer({
        customer_id: env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, ''),
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN
      });

      this.customerId = env.GOOGLE_ADS_CUSTOMER_ID;
      this.isConnected = true;
      
      logger.info('Google Ads real-time client initialized successfully');
      
      // Start auto-refresh if configured
      if (this.config.refreshInterval > 0) {
        this.startAutoRefresh();
      }
    } catch (error) {
      logger.error('Error initializing real-time client:', error);
      this.isConnected = false;
    }
  }

  /**
   * Start automatic data refresh
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshAllData();
      } catch (error) {
        logger.error('Auto-refresh failed:', error);
      }
    }, this.config.refreshInterval);

    logger.info(`Auto-refresh started with ${this.config.refreshInterval}ms interval`);
  }

  /**
   * Stop automatic data refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      logger.info('Auto-refresh stopped');
    }
  }

  /**
   * Fetch real-time campaign data
   */
  async fetchCampaigns(options?: {
    includeRemoved?: boolean;
    limit?: number;
  }): Promise<RealtimeCampaignData[]> {
    if (!this.customer) {
      throw new Error('Google Ads client not initialized');
    }

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.conversions_rate,
        metrics.average_cpc,
        metrics.search_impression_share,
        metrics.search_top_impression_share
      FROM campaign
      WHERE segments.date DURING ${this.config.metricsWindow}
      ${options?.includeRemoved ? '' : 'AND campaign.status != "REMOVED"'}
      ORDER BY metrics.impressions DESC
      ${options?.limit ? `LIMIT ${options.limit}` : 'LIMIT 100'}
    `;

    try {
      const response = await this.customer.query(query);
      
      const campaigns: RealtimeCampaignData[] = response.map((row: any) => ({
        id: row.campaign.id.toString(),
        name: row.campaign.name,
        status: row.campaign.status,
        budget: row.campaign_budget ? Number(row.campaign_budget.amount_micros) / 1000000 : 0,
        metrics: {
          impressions: row.metrics.impressions || 0,
          clicks: row.metrics.clicks || 0,
          conversions: row.metrics.conversions || 0,
          cost: row.metrics.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
          ctr: row.metrics.ctr || 0,
          conversionRate: row.metrics.conversions_rate || 0,
          averageCpc: row.metrics.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
          searchImpressionShare: row.metrics.search_impression_share || 0,
          searchTopImpressionShare: row.metrics.search_top_impression_share || 0,
          timestamp: new Date().toISOString()
        },
        lastUpdate: new Date().toISOString()
      }));

      // Cache the results
      const cacheKey = `realtime_campaigns_${this.customerId}`;
      await this.cache.set(cacheKey, campaigns, 5 * 60 * 1000); // 5 minute cache

      // Notify listeners
      this.notifyListeners('campaigns', campaigns);

      logger.info(`Fetched ${campaigns.length} campaigns with real-time data`);
      return campaigns;
    } catch (error) {
      logger.error('Error fetching real-time campaign data:', error);
      throw error;
    }
  }

  /**
   * Fetch real-time ad group data
   */
  async fetchAdGroups(campaignId?: string, options?: {
    includeRemoved?: boolean;
    limit?: number;
  }): Promise<RealtimeAdGroupData[]> {
    if (!this.customer) {
      throw new Error('Google Ads client not initialized');
    }

    const query = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.campaign,
        ad_group.status,
        ad_group.cpc_bid_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.conversions_rate,
        metrics.average_cpc
      FROM ad_group
      WHERE segments.date DURING ${this.config.metricsWindow}
      ${campaignId ? `AND campaign.id = ${campaignId}` : ''}
      ${options?.includeRemoved ? '' : 'AND ad_group.status != "REMOVED"'}
      ORDER BY metrics.impressions DESC
      ${options?.limit ? `LIMIT ${options.limit}` : 'LIMIT 200'}
    `;

    try {
      const response = await this.customer.query(query);
      
      const adGroups: RealtimeAdGroupData[] = response.map((row: any) => ({
        id: row.ad_group.id.toString(),
        name: row.ad_group.name,
        campaignId: row.ad_group.campaign.toString(),
        status: row.ad_group.status,
        cpcBid: row.ad_group.cpc_bid_micros ? Number(row.ad_group.cpc_bid_micros) / 1000000 : 0,
        metrics: {
          impressions: row.metrics.impressions || 0,
          clicks: row.metrics.clicks || 0,
          conversions: row.metrics.conversions || 0,
          cost: row.metrics.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
          ctr: row.metrics.ctr || 0,
          conversionRate: row.metrics.conversions_rate || 0,
          averageCpc: row.metrics.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
          timestamp: new Date().toISOString()
        },
        lastUpdate: new Date().toISOString()
      }));

      // Cache the results
      const cacheKey = `realtime_adgroups_${campaignId || 'all'}_${this.customerId}`;
      await this.cache.set(cacheKey, adGroups, 5 * 60 * 1000); // 5 minute cache

      // Notify listeners
      this.notifyListeners('adGroups', adGroups);

      logger.info(`Fetched ${adGroups.length} ad groups with real-time data`);
      return adGroups;
    } catch (error) {
      logger.error('Error fetching real-time ad group data:', error);
      throw error;
    }
  }

  /**
   * Fetch real-time keyword data with quality scores
   */
  async fetchKeywords(adGroupId?: string, options?: {
    includeRemoved?: boolean;
    includeQualityScore?: boolean;
    limit?: number;
  }): Promise<RealtimeKeywordData[]> {
    if (!this.customer) {
      throw new Error('Google Ads client not initialized');
    }

    const includeQS = options?.includeQualityScore ?? this.config.includeQualityScore;

    const query = `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.ad_group,
        ad_group_criterion.cpc_bid_micros,
        ${includeQS ? 'ad_group_criterion.quality_info.quality_score,' : ''}
        ad_group_criterion.position_estimates.first_page_cpc_micros,
        ad_group_criterion.position_estimates.top_of_page_cpc_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.conversions_rate,
        metrics.average_cpc
      FROM keyword_view
      WHERE segments.date DURING ${this.config.metricsWindow}
      AND ad_group_criterion.type = "KEYWORD"
      ${adGroupId ? `AND ad_group.id = ${adGroupId}` : ''}
      ${options?.includeRemoved ? '' : 'AND ad_group_criterion.status != "REMOVED"'}
      ORDER BY metrics.impressions DESC
      ${options?.limit ? `LIMIT ${options.limit}` : 'LIMIT 500'}
    `;

    try {
      const response = await this.customer.query(query);
      
      const keywords: RealtimeKeywordData[] = response.map((row: any) => ({
        id: row.ad_group_criterion.criterion_id.toString(),
        text: row.ad_group_criterion.keyword.text,
        matchType: row.ad_group_criterion.keyword.match_type,
        adGroupId: row.ad_group_criterion.ad_group.toString(),
        qualityScore: includeQS ? row.ad_group_criterion.quality_info?.quality_score : undefined,
        firstPageCpc: row.ad_group_criterion.position_estimates?.first_page_cpc_micros 
          ? Number(row.ad_group_criterion.position_estimates.first_page_cpc_micros) / 1000000 
          : undefined,
        topOfPageCpc: row.ad_group_criterion.position_estimates?.top_of_page_cpc_micros
          ? Number(row.ad_group_criterion.position_estimates.top_of_page_cpc_micros) / 1000000
          : undefined,
        metrics: {
          impressions: row.metrics.impressions || 0,
          clicks: row.metrics.clicks || 0,
          conversions: row.metrics.conversions || 0,
          cost: row.metrics.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
          ctr: row.metrics.ctr || 0,
          conversionRate: row.metrics.conversions_rate || 0,
          averageCpc: row.metrics.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
          qualityScore: includeQS ? row.ad_group_criterion.quality_info?.quality_score : undefined,
          timestamp: new Date().toISOString()
        },
        lastUpdate: new Date().toISOString()
      }));

      // Cache the results
      const cacheKey = `realtime_keywords_${adGroupId || 'all'}_${this.customerId}`;
      await this.cache.set(cacheKey, keywords, 5 * 60 * 1000); // 5 minute cache

      // Notify listeners
      this.notifyListeners('keywords', keywords);

      logger.info(`Fetched ${keywords.length} keywords with real-time data`);
      return keywords;
    } catch (error) {
      logger.error('Error fetching real-time keyword data:', error);
      throw error;
    }
  }

  /**
   * Fetch real-time search term performance
   */
  async fetchSearchTerms(options?: {
    campaignId?: string;
    adGroupId?: string;
    limit?: number;
    minImpressions?: number;
  }): Promise<Array<{
    searchTerm: string;
    keyword: string;
    matchType: string;
    metrics: RealtimeMetrics;
  }>> {
    if (!this.customer) {
      throw new Error('Google Ads client not initialized');
    }

    if (!this.config.includeSearchTerms) {
      return [];
    }

    const query = `
      SELECT
        search_term_view.search_term,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.conversions_rate,
        metrics.average_cpc
      FROM search_term_view
      WHERE segments.date DURING ${this.config.metricsWindow}
      ${options?.campaignId ? `AND campaign.id = ${options.campaignId}` : ''}
      ${options?.adGroupId ? `AND ad_group.id = ${options.adGroupId}` : ''}
      ${options?.minImpressions ? `AND metrics.impressions >= ${options.minImpressions}` : ''}
      ORDER BY metrics.impressions DESC
      ${options?.limit ? `LIMIT ${options.limit}` : 'LIMIT 100'}
    `;

    try {
      const response = await this.customer.query(query);
      
      const searchTerms = response.map((row: any) => ({
        searchTerm: row.search_term_view.search_term,
        keyword: row.ad_group_criterion?.keyword?.text || '',
        matchType: row.ad_group_criterion?.keyword?.match_type || '',
        metrics: {
          impressions: row.metrics.impressions || 0,
          clicks: row.metrics.clicks || 0,
          conversions: row.metrics.conversions || 0,
          cost: row.metrics.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
          ctr: row.metrics.ctr || 0,
          conversionRate: row.metrics.conversions_rate || 0,
          averageCpc: row.metrics.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
          timestamp: new Date().toISOString()
        }
      }));

      logger.info(`Fetched ${searchTerms.length} search terms with real-time data`);
      return searchTerms;
    } catch (error) {
      logger.error('Error fetching real-time search term data:', error);
      throw error;
    }
  }

  /**
   * Fetch account-level performance metrics
   */
  async fetchAccountMetrics(): Promise<RealtimeMetrics> {
    if (!this.customer) {
      throw new Error('Google Ads client not initialized');
    }

    const query = `
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.conversions_rate,
        metrics.average_cpc,
        metrics.search_impression_share,
        metrics.search_top_impression_share
      FROM customer
      WHERE segments.date DURING ${this.config.metricsWindow}
    `;

    try {
      const response = await this.customer.query(query);
      
      if (response.length === 0) {
        return {
          impressions: 0,
          clicks: 0,
          conversions: 0,
          cost: 0,
          ctr: 0,
          conversionRate: 0,
          averageCpc: 0,
          timestamp: new Date().toISOString()
        };
      }

      const row = response[0];
      const metrics: RealtimeMetrics = {
        impressions: row.metrics.impressions || 0,
        clicks: row.metrics.clicks || 0,
        conversions: row.metrics.conversions || 0,
        cost: row.metrics.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
        ctr: row.metrics.ctr || 0,
        conversionRate: row.metrics.conversions_rate || 0,
        averageCpc: row.metrics.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
        searchImpressionShare: row.metrics.search_impression_share || 0,
        searchTopImpressionShare: row.metrics.search_top_impression_share || 0,
        timestamp: new Date().toISOString()
      };

      // Cache the results
      const cacheKey = `realtime_account_metrics_${this.customerId}`;
      await this.cache.set(cacheKey, metrics, 5 * 60 * 1000); // 5 minute cache

      // Notify listeners
      this.notifyListeners('accountMetrics', metrics);

      logger.info('Fetched account-level metrics with real-time data');
      return metrics;
    } catch (error) {
      logger.error('Error fetching real-time account metrics:', error);
      throw error;
    }
  }

  /**
   * Refresh all data
   */
  async refreshAllData(): Promise<{
    campaigns: RealtimeCampaignData[];
    adGroups: RealtimeAdGroupData[];
    keywords: RealtimeKeywordData[];
    accountMetrics: RealtimeMetrics;
  }> {
    logger.info('Refreshing all real-time data...');
    
    const [campaigns, adGroups, keywords, accountMetrics] = await Promise.all([
      this.fetchCampaigns(),
      this.fetchAdGroups(),
      this.fetchKeywords(),
      this.fetchAccountMetrics()
    ]);

    logger.info('All real-time data refreshed successfully');
    
    return {
      campaigns,
      adGroups,
      keywords,
      accountMetrics
    };
  }

  /**
   * Subscribe to real-time data updates
   */
  subscribe(dataType: 'campaigns' | 'adGroups' | 'keywords' | 'accountMetrics', 
            callback: (data: any) => void): string {
    const listenerId = crypto.randomBytes(16).toString('hex');
    const key = `${dataType}_${listenerId}`;
    this.dataListeners.set(key, callback);
    logger.info(`Subscribed to ${dataType} updates with ID ${listenerId}`);
    return listenerId;
  }

  /**
   * Unsubscribe from real-time data updates
   */
  unsubscribe(dataType: string, listenerId: string): void {
    const key = `${dataType}_${listenerId}`;
    if (this.dataListeners.delete(key)) {
      logger.info(`Unsubscribed from ${dataType} updates with ID ${listenerId}`);
    }
  }

  /**
   * Notify all listeners of data updates
   */
  private notifyListeners(dataType: string, data: any): void {
    for (const [key, callback] of this.dataListeners.entries()) {
      if (key.startsWith(`${dataType}_`)) {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error notifying listener ${key}:`, error);
        }
      }
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current configuration
   */
  getConfig(): RealtimeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RealtimeConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart auto-refresh if interval changed
    if (config.refreshInterval !== undefined) {
      this.stopAutoRefresh();
      if (this.config.refreshInterval > 0) {
        this.startAutoRefresh();
      }
    }
    
    logger.info('Real-time configuration updated', this.config);
  }

  /**
   * Clean up resources
   */
  async disconnect(): Promise<void> {
    this.stopAutoRefresh();
    this.dataListeners.clear();
    this.isConnected = false;
    logger.info('Real-time client disconnected');
  }
}

// Export singleton instance for convenience
export const realtimeClient = new GoogleAdsRealtimeClient();