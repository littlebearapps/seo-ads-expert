/**
 * v1.4 Analytics Connector
 * Implements Task 1.2 from v1.4 implementation plan
 * Provides unified interface for GA4 events and Plausible pageviews
 */

import { GA4RealtimeClient } from './ga4-realtime.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';
import { z } from 'zod';

// Schemas for conversion events and pageview data
export const ConversionEventSchema = z.object({
  eventName: z.string(),
  timestamp: z.string(),
  source: z.string(),
  medium: z.string(),
  campaign: z.string().optional(),
  count: z.number(),
  value: z.number().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional()
});

export const PageviewDataSchema = z.object({
  page: z.string(),
  pageviews: z.number(),
  visitors: z.number(),
  bounceRate: z.number(),
  avgDuration: z.number(),
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional()
});

export const UTMParamsSchema = z.object({
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional()
});

export type ConversionEvent = z.infer<typeof ConversionEventSchema>;
export type PageviewData = z.infer<typeof PageviewDataSchema>;
export type UTMParams = z.infer<typeof UTMParamsSchema>;
export type DateRange = { startDate: string; endDate: string };

interface AnalyticsConfig {
  ga4Enabled: boolean;
  plausibleEnabled: boolean;
  ga4PropertyId?: string;
  plausibleDomain?: string;
  plausibleApiKey?: string;
  conversionEvents: string[];
}

/**
 * Unified Analytics Connector
 * Integrates both GA4 and Plausible Analytics
 */
export class AnalyticsConnector {
  private ga4Client: GA4RealtimeClient;
  private config: AnalyticsConfig;

  constructor(config?: Partial<AnalyticsConfig>) {
    this.config = {
      ga4Enabled: true,
      plausibleEnabled: false,
      conversionEvents: ['CWS_Click', 'Waitlist_Submit', 'purchase', 'add_to_cart', 'begin_checkout', 'sign_up'],
      ...config
    };

    // Initialize GA4 client
    this.ga4Client = new GA4RealtimeClient({
      propertyId: this.config.ga4PropertyId || process.env.GA4_PROPERTY_ID || '',
      conversionEvents: this.config.conversionEvents
    });
  }

  /**
   * Fetch conversion events from GA4
   * Implements the GA4 events requirement from v1.4 plan
   */
  async fetchConversionEvents(dateRange: DateRange): Promise<ConversionEvent[]> {
    if (!this.config.ga4Enabled) {
      logger.debug('GA4 is disabled, skipping conversion events fetch');
      return [];
    }

    try {
      // Fetch conversions from GA4 with source/medium breakdown
      const ga4Conversions = await this.ga4Client.fetchConversions({
        eventNames: this.config.conversionEvents,
        groupBySource: true
      });

      // Map GA4 data to our unified schema
      const events: ConversionEvent[] = ga4Conversions.map(conv => ({
        eventName: conv.conversionEvent,
        timestamp: conv.timestamp,
        source: conv.source,
        medium: conv.medium,
        campaign: conv.campaign,
        count: conv.conversions,
        value: conv.conversionValue
      }));

      logger.info(`Fetched ${events.length} conversion events from GA4`);
      return events;
    } catch (error) {
      logger.error('Error fetching GA4 conversion events:', error);
      throw error;
    }
  }

  /**
   * Fetch pageviews by UTM parameters
   * Supports both GA4 and Plausible
   */
  async fetchPageviews(utmParams: UTMParams): Promise<PageviewData[]> {
    const pageviews: PageviewData[] = [];

    // Fetch from GA4 if enabled
    if (this.config.ga4Enabled) {
      try {
        const ga4Pages = await this.fetchGA4Pageviews(utmParams);
        pageviews.push(...ga4Pages);
      } catch (error) {
        logger.error('Error fetching GA4 pageviews:', error);
      }
    }

    // Fetch from Plausible if enabled
    if (this.config.plausibleEnabled) {
      try {
        const plausiblePages = await this.fetchPlausiblePageviews(utmParams);
        pageviews.push(...plausiblePages);
      } catch (error) {
        logger.error('Error fetching Plausible pageviews:', error);
      }
    }

    return pageviews;
  }

  /**
   * Fetch pageviews from GA4
   */
  private async fetchGA4Pageviews(utmParams: UTMParams): Promise<PageviewData[]> {
    try {
      // Fetch page performance data from GA4
      const pages = await this.ga4Client.fetchPagePerformance({
        limit: 100,
        landingPagesOnly: true
      });

      // Filter by UTM parameters if provided
      let filteredPages = pages;
      if (utmParams.utmSource || utmParams.utmMedium || utmParams.utmCampaign) {
        // Fetch traffic sources to match with pages
        const sources = await this.ga4Client.fetchTrafficSources({
          limit: 100,
          includeRealtime: false
        });

        // Create a map of landing pages to their sources
        const pageSourceMap = new Map<string, typeof sources[0]>();
        for (const source of sources) {
          if (source.landingPage) {
            pageSourceMap.set(source.landingPage, source);
          }
        }

        // Filter pages based on UTM matches
        filteredPages = pages.filter(page => {
          const source = pageSourceMap.get(page.pagePath);
          if (!source) return false;

          const matches = [];
          if (utmParams.utmSource) {
            matches.push(source.source === utmParams.utmSource);
          }
          if (utmParams.utmMedium) {
            matches.push(source.medium === utmParams.utmMedium);
          }
          if (utmParams.utmCampaign) {
            matches.push(source.campaign === utmParams.utmCampaign);
          }

          return matches.every(m => m === true);
        });
      }

      // Map to unified schema
      return filteredPages.map(page => ({
        page: page.pagePath,
        pageviews: page.pageViews,
        visitors: page.uniquePageViews,
        bounceRate: page.bounceRate,
        avgDuration: page.avgTimeOnPage,
        ...utmParams
      }));
    } catch (error) {
      logger.error('Error fetching GA4 pageviews:', error);
      return [];
    }
  }

  /**
   * Fetch pageviews from Plausible Analytics
   */
  private async fetchPlausiblePageviews(utmParams: UTMParams): Promise<PageviewData[]> {
    if (!this.config.plausibleDomain || !this.config.plausibleApiKey) {
      logger.debug('Plausible not configured, skipping pageview fetch');
      return [];
    }

    try {
      // Build filters for UTM parameters
      const filters: string[] = [];
      if (utmParams.utmSource) filters.push(`visit:utm_source==${utmParams.utmSource}`);
      if (utmParams.utmMedium) filters.push(`visit:utm_medium==${utmParams.utmMedium}`);
      if (utmParams.utmCampaign) filters.push(`visit:utm_campaign==${utmParams.utmCampaign}`);
      if (utmParams.utmContent) filters.push(`visit:utm_content==${utmParams.utmContent}`);
      if (utmParams.utmTerm) filters.push(`visit:utm_term==${utmParams.utmTerm}`);

      const response = await axios.get('https://plausible.io/api/v1/stats/breakdown', {
        headers: {
          'Authorization': `Bearer ${this.config.plausibleApiKey}`
        },
        params: {
          site_id: this.config.plausibleDomain,
          period: '30d',
          property: 'event:page',
          metrics: 'pageviews,visitors,bounce_rate,visit_duration',
          filters: filters.join(';')
        }
      });

      // Map Plausible response to unified schema
      if (response.data && response.data.results) {
        return response.data.results.map((result: any) => ({
          page: result.page,
          pageviews: result.pageviews || 0,
          visitors: result.visitors || 0,
          bounceRate: result.bounce_rate || 0,
          avgDuration: result.visit_duration || 0,
          ...utmParams
        }));
      }

      return [];
    } catch (error) {
      logger.error('Error fetching Plausible pageviews:', error);
      return [];
    }
  }

  /**
   * Fetch specific custom events from GA4
   */
  async fetchCustomEvents(eventNames: string[], dateRange?: DateRange): Promise<ConversionEvent[]> {
    if (!this.config.ga4Enabled) {
      logger.debug('GA4 is disabled, skipping custom events fetch');
      return [];
    }

    try {
      const events = await this.ga4Client.fetchCustomEvents(eventNames);

      return events.map(event => ({
        eventName: event.eventName,
        timestamp: event.timestamp,
        source: 'ga4',
        medium: 'analytics',
        count: event.eventCount,
        value: event.eventValue
      }));
    } catch (error) {
      logger.error('Error fetching custom events:', error);
      return [];
    }
  }

  /**
   * Fetch Google Ads campaign performance from GA4
   */
  async fetchGoogleAdsCampaigns(): Promise<Array<{
    campaignName: string;
    sessions: number;
    conversions: number;
    conversionRate: number;
    bounceRate: number;
  }>> {
    if (!this.config.ga4Enabled) {
      logger.debug('GA4 is disabled, skipping Google Ads campaigns fetch');
      return [];
    }

    try {
      return await this.ga4Client.fetchGoogleAdsCampaigns();
    } catch (error) {
      logger.error('Error fetching Google Ads campaigns:', error);
      return [];
    }
  }

  /**
   * Check if analytics is properly configured
   */
  isConfigured(): boolean {
    if (this.config.ga4Enabled) {
      return this.ga4Client.isConnected();
    }
    if (this.config.plausibleEnabled) {
      return Boolean(this.config.plausibleDomain && this.config.plausibleApiKey);
    }
    return false;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.ga4Client) {
      await this.ga4Client.disconnect();
    }
    logger.info('Analytics connector disconnected');
  }
}

// Export singleton instance
export const analyticsConnector = new AnalyticsConnector();