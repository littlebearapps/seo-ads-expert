/**
 * v1.4 Google Analytics 4 Real-Time Data Integration
 * Provides live data fetching from GA4 using the Analytics Data API
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { google } from 'googleapis';
import pino from 'pino';
import { z } from 'zod';
import { CacheManager } from '../utils/cache.js';
import { PerformanceMonitor } from '../monitors/performance.js';
import { validateEnvironment } from '../utils/validation.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// GA4 Real-time schemas
export const GA4MetricsSchema = z.object({
  activeUsers: z.number(),
  screenPageViews: z.number(),
  eventCount: z.number(),
  conversions: z.number(),
  engagementRate: z.number(),
  averageEngagementTime: z.number(),
  bounceRate: z.number(),
  newUsers: z.number(),
  sessions: z.number(),
  sessionsPerUser: z.number(),
  timestamp: z.string()
});

export const GA4DimensionDataSchema = z.object({
  source: z.string(),
  medium: z.string(),
  campaign: z.string().optional(),
  landingPage: z.string().optional(),
  deviceCategory: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional()
});

export const GA4EventDataSchema = z.object({
  eventName: z.string(),
  eventCount: z.number(),
  eventValue: z.number().optional(),
  conversions: z.number().optional(),
  timestamp: z.string()
});

export const GA4PageDataSchema = z.object({
  pagePath: z.string(),
  pageTitle: z.string(),
  pageViews: z.number(),
  uniquePageViews: z.number(),
  avgTimeOnPage: z.number(),
  entrances: z.number(),
  bounceRate: z.number(),
  exitRate: z.number(),
  timestamp: z.string()
});

export const GA4ConversionDataSchema = z.object({
  conversionEvent: z.string(),
  conversions: z.number(),
  conversionValue: z.number().optional(),
  source: z.string(),
  medium: z.string(),
  campaign: z.string().optional(),
  timestamp: z.string()
});

export type GA4Metrics = z.infer<typeof GA4MetricsSchema>;
export type GA4DimensionData = z.infer<typeof GA4DimensionDataSchema>;
export type GA4EventData = z.infer<typeof GA4EventDataSchema>;
export type GA4PageData = z.infer<typeof GA4PageDataSchema>;
export type GA4ConversionData = z.infer<typeof GA4ConversionDataSchema>;

// Configuration for GA4 real-time
interface GA4RealtimeConfig {
  propertyId: string;
  refreshInterval: number; // milliseconds
  includeRealtime: boolean;
  dateRange: 'today' | 'yesterday' | 'last7Days' | 'last30Days';
  conversionEvents: string[];
}

/**
 * Google Analytics 4 Real-Time Client
 * Provides live data fetching and monitoring capabilities
 */
export class GA4RealtimeClient {
  private analyticsDataClient?: BetaAnalyticsDataClient;
  private cache: CacheManager;
  private performanceMonitor: PerformanceMonitor;
  private config: GA4RealtimeConfig;
  private isConnected = false;
  private refreshTimer?: NodeJS.Timeout;
  private oauth2Client?: any;

  constructor(config?: Partial<GA4RealtimeConfig>) {
    this.cache = new CacheManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.config = {
      propertyId: '',
      refreshInterval: 60000, // 1 minute default
      includeRealtime: true,
      dateRange: 'today',
      conversionEvents: ['purchase', 'add_to_cart', 'begin_checkout', 'sign_up'],
      ...config
    };
    this.initialize().catch(error => {
      logger.error('Failed to initialize GA4 real-time client:', error);
    });
  }

  private async initialize(): Promise<void> {
    try {
      const env = validateEnvironment();
      
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || 
          !env.GOOGLE_REFRESH_TOKEN || !env.GA4_PROPERTY_ID) {
        logger.warn('GA4 real-time credentials not fully configured');
        return;
      }

      // Set property ID from environment
      this.config.propertyId = env.GA4_PROPERTY_ID;

      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
      );

      this.oauth2Client.setCredentials({
        refresh_token: env.GOOGLE_REFRESH_TOKEN
      });

      // Initialize Analytics Data Client
      this.analyticsDataClient = new BetaAnalyticsDataClient({
        auth: this.oauth2Client
      });

      this.isConnected = true;
      logger.info('GA4 real-time client initialized successfully');
      
      // Start auto-refresh if configured
      if (this.config.refreshInterval > 0) {
        this.startAutoRefresh();
      }
    } catch (error) {
      logger.error('Error initializing GA4 real-time client:', error);
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
        await this.fetchRealtimeMetrics();
      } catch (error) {
        logger.error('GA4 auto-refresh failed:', error);
      }
    }, this.config.refreshInterval);

    logger.info(`GA4 auto-refresh started with ${this.config.refreshInterval}ms interval`);
  }

  /**
   * Stop automatic data refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      logger.info('GA4 auto-refresh stopped');
    }
  }

  /**
   * Fetch real-time metrics
   */
  async fetchRealtimeMetrics(): Promise<GA4Metrics> {
    if (!this.analyticsDataClient) {
      throw new Error('GA4 client not initialized');
    }

    try {
      const [response] = await this.analyticsDataClient.runRealtimeReport({
        property: `properties/${this.config.propertyId}`,
        metrics: [
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'eventCount' },
          { name: 'conversions' }
        ],
        minuteRanges: [
          { startMinutesAgo: 30, endMinutesAgo: 0 }
        ]
      });

      const metrics: GA4Metrics = {
        activeUsers: 0,
        screenPageViews: 0,
        eventCount: 0,
        conversions: 0,
        engagementRate: 0,
        averageEngagementTime: 0,
        bounceRate: 0,
        newUsers: 0,
        sessions: 0,
        sessionsPerUser: 0,
        timestamp: new Date().toISOString()
      };

      // Parse response
      if (response.rows && response.rows.length > 0) {
        const row = response.rows[0];
        metrics.activeUsers = parseInt(row.metricValues?.[0]?.value || '0');
        metrics.screenPageViews = parseInt(row.metricValues?.[1]?.value || '0');
        metrics.eventCount = parseInt(row.metricValues?.[2]?.value || '0');
        metrics.conversions = parseInt(row.metricValues?.[3]?.value || '0');
      }

      // Cache the results
      const cacheKey = `ga4_realtime_metrics_${this.config.propertyId}`;
      await this.cache.set(cacheKey, metrics, 60 * 1000); // 1 minute cache

      logger.info('Fetched GA4 real-time metrics');
      return metrics;
    } catch (error) {
      logger.error('Error fetching GA4 real-time metrics:', error);
      throw error;
    }
  }

  /**
   * Fetch traffic sources
   */
  async fetchTrafficSources(options?: {
    limit?: number;
    includeRealtime?: boolean;
  }): Promise<Array<GA4DimensionData & { metrics: Partial<GA4Metrics> }>> {
    if (!this.analyticsDataClient) {
      throw new Error('GA4 client not initialized');
    }

    try {
      const request: any = {
        property: `properties/${this.config.propertyId}`,
        dimensions: [
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
          { name: 'sessionCampaignName' }
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'conversions' }
        ]
      };

      if (options?.includeRealtime ?? this.config.includeRealtime) {
        request.minuteRanges = [{ startMinutesAgo: 30, endMinutesAgo: 0 }];
        const [response] = await this.analyticsDataClient.runRealtimeReport(request);
        return this.parseTrafficSourceResponse(response);
      } else {
        request.dateRanges = [this.getDateRange()];
        request.limit = options?.limit || 50;
        const [response] = await this.analyticsDataClient.runReport(request);
        return this.parseTrafficSourceResponse(response);
      }
    } catch (error) {
      logger.error('Error fetching GA4 traffic sources:', error);
      throw error;
    }
  }

  /**
   * Fetch page performance data
   */
  async fetchPagePerformance(options?: {
    limit?: number;
    landingPagesOnly?: boolean;
  }): Promise<GA4PageData[]> {
    if (!this.analyticsDataClient) {
      throw new Error('GA4 client not initialized');
    }

    try {
      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${this.config.propertyId}`,
        dimensions: [
          { name: options?.landingPagesOnly ? 'landingPagePlusQueryString' : 'pagePath' },
          { name: 'pageTitle' }
        ],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'averageSessionDuration' },
          { name: 'entrances' },
          { name: 'bounceRate' },
          { name: 'exitRate' }
        ],
        dateRanges: [this.getDateRange()],
        limit: options?.limit || 100,
        orderBys: [
          {
            metric: { metricName: 'screenPageViews' },
            desc: true
          }
        ]
      });

      const pages: GA4PageData[] = [];
      
      if (response.rows) {
        for (const row of response.rows) {
          pages.push({
            pagePath: row.dimensionValues?.[0]?.value || '',
            pageTitle: row.dimensionValues?.[1]?.value || '',
            pageViews: parseInt(row.metricValues?.[0]?.value || '0'),
            uniquePageViews: parseInt(row.metricValues?.[1]?.value || '0'),
            avgTimeOnPage: parseFloat(row.metricValues?.[2]?.value || '0'),
            entrances: parseInt(row.metricValues?.[3]?.value || '0'),
            bounceRate: parseFloat(row.metricValues?.[4]?.value || '0'),
            exitRate: parseFloat(row.metricValues?.[5]?.value || '0'),
            timestamp: new Date().toISOString()
          });
        }
      }

      // Cache the results
      const cacheKey = `ga4_page_performance_${this.config.propertyId}`;
      await this.cache.set(cacheKey, pages, 5 * 60 * 1000); // 5 minute cache

      logger.info(`Fetched ${pages.length} pages with performance data`);
      return pages;
    } catch (error) {
      logger.error('Error fetching GA4 page performance:', error);
      throw error;
    }
  }

  /**
   * Fetch conversion events
   */
  async fetchConversions(options?: {
    eventNames?: string[];
    groupBySource?: boolean;
  }): Promise<GA4ConversionData[]> {
    if (!this.analyticsDataClient) {
      throw new Error('GA4 client not initialized');
    }

    const eventNames = options?.eventNames || this.config.conversionEvents;
    
    try {
      const dimensions = [{ name: 'eventName' }];
      if (options?.groupBySource) {
        dimensions.push(
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
          { name: 'sessionCampaignName' }
        );
      }

      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${this.config.propertyId}`,
        dimensions,
        metrics: [
          { name: 'eventCount' },
          { name: 'eventValue' }
        ],
        dateRanges: [this.getDateRange()],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: eventNames
            }
          }
        },
        limit: 500
      });

      const conversions: GA4ConversionData[] = [];
      
      if (response.rows) {
        for (const row of response.rows) {
          conversions.push({
            conversionEvent: row.dimensionValues?.[0]?.value || '',
            conversions: parseInt(row.metricValues?.[0]?.value || '0'),
            conversionValue: parseFloat(row.metricValues?.[1]?.value || '0'),
            source: row.dimensionValues?.[1]?.value || 'direct',
            medium: row.dimensionValues?.[2]?.value || 'none',
            campaign: row.dimensionValues?.[3]?.value,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Cache the results
      const cacheKey = `ga4_conversions_${this.config.propertyId}`;
      await this.cache.set(cacheKey, conversions, 5 * 60 * 1000); // 5 minute cache

      logger.info(`Fetched ${conversions.length} conversion events`);
      return conversions;
    } catch (error) {
      logger.error('Error fetching GA4 conversions:', error);
      throw error;
    }
  }

  /**
   * Fetch Google Ads campaign performance from GA4
   */
  async fetchGoogleAdsCampaigns(): Promise<Array<{
    campaignName: string;
    source: string;
    medium: string;
    sessions: number;
    conversions: number;
    conversionRate: number;
    bounceRate: number;
  }>> {
    if (!this.analyticsDataClient) {
      throw new Error('GA4 client not initialized');
    }

    try {
      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${this.config.propertyId}`,
        dimensions: [
          { name: 'googleAdsCampaignName' },
          { name: 'sessionSource' },
          { name: 'sessionMedium' }
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'conversions' },
          { name: 'bounceRate' }
        ],
        dateRanges: [this.getDateRange()],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionSource',
            stringFilter: {
              value: 'google',
              matchType: 'EXACT'
            }
          }
        },
        limit: 100
      });

      const campaigns = [];
      
      if (response.rows) {
        for (const row of response.rows) {
          const sessions = parseInt(row.metricValues?.[0]?.value || '0');
          const conversions = parseInt(row.metricValues?.[1]?.value || '0');
          
          campaigns.push({
            campaignName: row.dimensionValues?.[0]?.value || '(not set)',
            source: row.dimensionValues?.[1]?.value || '',
            medium: row.dimensionValues?.[2]?.value || '',
            sessions,
            conversions,
            conversionRate: sessions > 0 ? conversions / sessions : 0,
            bounceRate: parseFloat(row.metricValues?.[2]?.value || '0')
          });
        }
      }

      logger.info(`Fetched ${campaigns.length} Google Ads campaigns from GA4`);
      return campaigns;
    } catch (error) {
      logger.error('Error fetching Google Ads campaigns from GA4:', error);
      throw error;
    }
  }

  /**
   * Fetch custom events
   */
  async fetchCustomEvents(eventNames: string[]): Promise<GA4EventData[]> {
    if (!this.analyticsDataClient) {
      throw new Error('GA4 client not initialized');
    }

    try {
      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${this.config.propertyId}`,
        dimensions: [{ name: 'eventName' }],
        metrics: [
          { name: 'eventCount' },
          { name: 'eventValue' }
        ],
        dateRanges: [this.getDateRange()],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: eventNames
            }
          }
        },
        limit: 100
      });

      const events: GA4EventData[] = [];
      
      if (response.rows) {
        for (const row of response.rows) {
          events.push({
            eventName: row.dimensionValues?.[0]?.value || '',
            eventCount: parseInt(row.metricValues?.[0]?.value || '0'),
            eventValue: parseFloat(row.metricValues?.[1]?.value || '0'),
            timestamp: new Date().toISOString()
          });
        }
      }

      logger.info(`Fetched ${events.length} custom events`);
      return events;
    } catch (error) {
      logger.error('Error fetching GA4 custom events:', error);
      throw error;
    }
  }

  /**
   * Helper to parse traffic source response
   */
  private parseTrafficSourceResponse(response: any): Array<GA4DimensionData & { metrics: Partial<GA4Metrics> }> {
    const sources = [];
    
    if (response.rows) {
      for (const row of response.rows) {
        sources.push({
          source: row.dimensionValues?.[0]?.value || '(direct)',
          medium: row.dimensionValues?.[1]?.value || '(none)',
          campaign: row.dimensionValues?.[2]?.value || '(not set)',
          metrics: {
            activeUsers: parseInt(row.metricValues?.[0]?.value || '0'),
            screenPageViews: parseInt(row.metricValues?.[1]?.value || '0'),
            conversions: parseInt(row.metricValues?.[2]?.value || '0'),
            timestamp: new Date().toISOString()
          }
        });
      }
    }
    
    return sources;
  }

  /**
   * Get date range for reports
   */
  private getDateRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    
    let startDate: string;
    switch (this.config.dateRange) {
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = yesterday.toISOString().split('T')[0];
        break;
      case 'last7Days':
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        startDate = week.toISOString().split('T')[0];
        break;
      case 'last30Days':
        const month = new Date(today);
        month.setDate(month.getDate() - 30);
        startDate = month.toISOString().split('T')[0];
        break;
      default:
        startDate = endDate;
    }
    
    return { startDate, endDate };
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.stopAutoRefresh();
    this.isConnected = false;
    logger.info('GA4 real-time client disconnected');
  }
}

// Export singleton instance
export const ga4RealtimeClient = new GA4RealtimeClient();