import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsConnector } from '../src/connectors/analytics-connector.js';
import { GA4RealtimeClient } from '../src/connectors/ga4-realtime.js';

// Mock GA4 client
vi.mock('../src/connectors/ga4-realtime.js', () => ({
  GA4RealtimeClient: vi.fn().mockImplementation(() => ({
    fetchConversions: vi.fn(),
    fetchPagePerformance: vi.fn(),
    fetchTrafficSources: vi.fn(),
    fetchCustomEvents: vi.fn(),
    fetchGoogleAdsCampaigns: vi.fn(),
    isConnected: vi.fn(),
    disconnect: vi.fn()
  }))
}));

describe('AnalyticsConnector', () => {
  let connector: AnalyticsConnector;
  let mockGA4Client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new AnalyticsConnector({
      ga4Enabled: true,
      plausibleEnabled: false
    });
    mockGA4Client = (GA4RealtimeClient as any).mock.results[0].value;
  });

  describe('fetchConversionEvents', () => {
    it('should fetch conversion events from GA4', async () => {
      const mockConversions = [
        {
          conversionEvent: 'purchase',
          conversions: 10,
          conversionValue: 100,
          source: 'google',
          medium: 'cpc',
          campaign: 'test-campaign',
          timestamp: '2025-01-01T00:00:00Z'
        }
      ];

      mockGA4Client.fetchConversions.mockResolvedValue(mockConversions);

      const events = await connector.fetchConversionEvents({
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        eventName: 'purchase',
        timestamp: '2025-01-01T00:00:00Z',
        source: 'google',
        medium: 'cpc',
        campaign: 'test-campaign',
        count: 10,
        value: 100
      });

      expect(mockGA4Client.fetchConversions).toHaveBeenCalledWith({
        eventNames: expect.arrayContaining(['CWS_Click', 'Waitlist_Submit', 'purchase']),
        groupBySource: true
      });
    });

    it('should return empty array when GA4 is disabled', async () => {
      const disabledConnector = new AnalyticsConnector({
        ga4Enabled: false
      });

      const events = await disabledConnector.fetchConversionEvents({
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      expect(events).toEqual([]);
    });
  });

  describe('fetchPageviews', () => {
    it('should fetch pageviews from GA4 with UTM filtering', async () => {
      const mockPages = [
        {
          pagePath: '/landing',
          pageViews: 100,
          uniquePageViews: 80,
          bounceRate: 30,
          avgTimeOnPage: 120,
          entrances: 50,
          exitRate: 25,
          timestamp: '2025-01-01T00:00:00Z'
        }
      ];

      const mockSources = [
        {
          source: 'google',
          medium: 'cpc',
          campaign: 'test',
          landingPage: '/landing',
          metrics: {}
        }
      ];

      mockGA4Client.fetchPagePerformance.mockResolvedValue(mockPages);
      mockGA4Client.fetchTrafficSources.mockResolvedValue(mockSources);

      const pageviews = await connector.fetchPageviews({
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'test'
      });

      expect(pageviews).toHaveLength(1);
      expect(pageviews[0]).toEqual({
        page: '/landing',
        pageviews: 100,
        visitors: 80,
        bounceRate: 30,
        avgDuration: 120,
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'test'
      });
    });

    it('should fetch all pageviews when no UTM params provided', async () => {
      const mockPages = [
        {
          pagePath: '/page1',
          pageViews: 50,
          uniquePageViews: 40,
          bounceRate: 20,
          avgTimeOnPage: 90
        },
        {
          pagePath: '/page2',
          pageViews: 30,
          uniquePageViews: 25,
          bounceRate: 35,
          avgTimeOnPage: 60
        }
      ];

      mockGA4Client.fetchPagePerformance.mockResolvedValue(mockPages);

      const pageviews = await connector.fetchPageviews({});

      expect(pageviews).toHaveLength(2);
      expect(mockGA4Client.fetchTrafficSources).not.toHaveBeenCalled();
    });
  });

  describe('fetchCustomEvents', () => {
    it('should fetch custom events from GA4', async () => {
      const mockEvents = [
        {
          eventName: 'video_play',
          eventCount: 50,
          eventValue: 0,
          timestamp: '2025-01-01T00:00:00Z'
        }
      ];

      mockGA4Client.fetchCustomEvents.mockResolvedValue(mockEvents);

      const events = await connector.fetchCustomEvents(['video_play']);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        eventName: 'video_play',
        timestamp: '2025-01-01T00:00:00Z',
        source: 'ga4',
        medium: 'analytics',
        count: 50,
        value: 0
      });

      expect(mockGA4Client.fetchCustomEvents).toHaveBeenCalledWith(['video_play']);
    });
  });

  describe('fetchGoogleAdsCampaigns', () => {
    it('should fetch Google Ads campaigns from GA4', async () => {
      const mockCampaigns = [
        {
          campaignName: 'Test Campaign',
          sessions: 100,
          conversions: 10,
          conversionRate: 0.1,
          bounceRate: 30
        }
      ];

      mockGA4Client.fetchGoogleAdsCampaigns.mockResolvedValue(mockCampaigns);

      const campaigns = await connector.fetchGoogleAdsCampaigns();

      expect(campaigns).toEqual(mockCampaigns);
      expect(mockGA4Client.fetchGoogleAdsCampaigns).toHaveBeenCalled();
    });
  });

  describe('isConfigured', () => {
    it('should check GA4 connection status', () => {
      mockGA4Client.isConnected.mockReturnValue(true);

      const isConfigured = connector.isConfigured();

      expect(isConfigured).toBe(true);
      expect(mockGA4Client.isConnected).toHaveBeenCalled();
    });

    it('should return false when GA4 is disabled', () => {
      const disabledConnector = new AnalyticsConnector({
        ga4Enabled: false,
        plausibleEnabled: false
      });

      const isConfigured = disabledConnector.isConfigured();

      expect(isConfigured).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect GA4 client', async () => {
      await connector.disconnect();

      expect(mockGA4Client.disconnect).toHaveBeenCalled();
    });
  });
});