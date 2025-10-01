import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GoogleAdsApiClient,
  GAQLBuilder,
  Campaign,
  AdGroup,
  Keyword,
  Ad,
  PerformanceStats,
  ReconciliationReport,
  CampaignSchema,
  AdGroupSchema,
  KeywordSchema,
  AdSchema,
  PerformanceStatsSchema
} from '../src/connectors/google-ads-api.js';
import { CampaignReconciler, DriftReport } from '../src/analyzers/campaign-reconciler.js';

describe('Google Ads API Integration', () => {
  describe('GAQLBuilder', () => {
    it('should build basic SELECT query', () => {
      const query = new GAQLBuilder()
        .select('campaign.id', 'campaign.name', 'campaign.status')
        .from('campaign')
        .build();

      expect(query).toBe('SELECT campaign.id, campaign.name, campaign.status FROM campaign');
    });

    it('should build query with WHERE clause', () => {
      const query = new GAQLBuilder()
        .select('campaign.id', 'campaign.name')
        .from('campaign')
        .where('campaign.status = "ENABLED"')
        .build();

      expect(query).toBe('SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = "ENABLED"');
    });

    it('should build query with multiple WHERE conditions', () => {
      const query = new GAQLBuilder()
        .select('ad_group.id', 'ad_group.name')
        .from('ad_group')
        .where('ad_group.status = "ENABLED"')
        .where('campaign.id = 123456')
        .build();

      expect(query).toBe(
        'SELECT ad_group.id, ad_group.name FROM ad_group WHERE ad_group.status = "ENABLED" AND campaign.id = 123456'
      );
    });

    it('should build query with ORDER BY', () => {
      const query = new GAQLBuilder()
        .select('ad_group_criterion.keyword.text', 'metrics.clicks')
        .from('keyword_view')
        .orderByDesc('metrics.clicks')
        .build();

      expect(query).toBe(
        'SELECT ad_group_criterion.keyword.text, metrics.clicks FROM keyword_view ORDER BY metrics.clicks DESC'
      );
    });

    it('should build query with LIMIT', () => {
      const query = new GAQLBuilder()
        .select('campaign.name')
        .from('campaign')
        .limit(10)
        .build();

      expect(query).toBe('SELECT campaign.name FROM campaign LIMIT 10');
    });

    it('should build complex query with all clauses', () => {
      const query = new GAQLBuilder()
        .select(
          'ad_group_ad.ad.id',
          'ad_group_ad.status',
          'metrics.impressions',
          'metrics.clicks'
        )
        .from('ad_group_ad')
        .where('ad_group.id = 789')
        .where('ad_group_ad.status != "REMOVED"')
        .where('metrics.impressions > 0')
        .orderByDesc('metrics.clicks')
        .limit(50)
        .build();

      expect(query).toBe(
        'SELECT ad_group_ad.ad.id, ad_group_ad.status, metrics.impressions, metrics.clicks ' +
        'FROM ad_group_ad ' +
        'WHERE ad_group.id = 789 AND ad_group_ad.status != "REMOVED" AND metrics.impressions > 0 ' +
        'ORDER BY metrics.clicks DESC ' +
        'LIMIT 50'
      );
    });
  });

  describe('GoogleAdsApiClient', () => {
    let client: GoogleAdsApiClient;

    beforeEach(() => {
      // Reset environment variables
      process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_ADS_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_ADS_REFRESH_TOKEN = 'test-refresh-token';
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-developer-token';
      process.env.GOOGLE_ADS_CUSTOMER_IDS = '123-456-7890,098-765-4321';

      client = new GoogleAdsApiClient();
    });

    it('should parse customer IDs from environment', () => {
      const customerIds = client.getCustomerIds();
      expect(customerIds).toHaveLength(2);
      expect(customerIds).toContain('123-456-7890');
      expect(customerIds).toContain('098-765-4321');
    });

    it('should generate consistent cache keys', () => {
      const request1 = {
        customerId: '123',
        query: 'SELECT campaign.id FROM campaign',
        pageSize: 100
      };

      const request2 = {
        customerId: '123',
        query: 'SELECT campaign.id FROM campaign',
        pageSize: 100
      };

      const request3 = {
        customerId: '456',
        query: 'SELECT campaign.id FROM campaign',
        pageSize: 100
      };

      // Private method test via reflection
      const getCacheKey = (client as any).getCacheKey.bind(client);
      
      const key1 = getCacheKey(request1);
      const key2 = getCacheKey(request2);
      const key3 = getCacheKey(request3);

      expect(key1).toBe(key2); // Same request should generate same key
      expect(key1).not.toBe(key3); // Different customer ID should generate different key
      expect(key1).toHaveLength(64); // SHA256 produces 64 character hex string
    });

    it('should check if API is configured', () => {
      const configured = client.isConfigured();
      // Will be false initially since authentication happens asynchronously
      expect(typeof configured).toBe('boolean');
    });
  });

  describe('CampaignReconciler', () => {
    let reconciler: CampaignReconciler;

    beforeEach(() => {
      reconciler = new CampaignReconciler();
    });

    it('should create drift report structure', async () => {
      const planned = {
        campaigns: [
          {
            name: 'Test Campaign',
            status: 'ENABLED',
            budgetMicros: '10000000',
            adGroups: [
              {
                name: 'Test Ad Group',
                keywords: ['keyword1', 'keyword2'],
                ads: [
                  {
                    headlines: ['Headline 1', 'Headline 2'],
                    descriptions: ['Description 1', 'Description 2']
                  }
                ]
              }
            ]
          }
        ],
        targetBudget: 10,
        targetCTR: 0.05,
        targetConversionRate: 0.02
      };

      // Mock the API client to return empty results for testing
      const mockClient = {
        isConfigured: () => false,
        getCampaigns: vi.fn().mockResolvedValue([]),
        getAdGroups: vi.fn().mockResolvedValue([]),
        getKeywords: vi.fn().mockResolvedValue([]),
        getAds: vi.fn().mockResolvedValue([]),
        getPerformanceStats: vi.fn().mockResolvedValue({
          impressions: 0,
          clicks: 0,
          conversions: 0,
          costMicros: '0',
          ctr: 0,
          conversionRate: 0,
          averageCpc: 0
        }),
        reconcile: vi.fn().mockResolvedValue({
          customerId: '123',
          timestamp: new Date().toISOString(),
          discrepancies: {
            campaigns: [],
            adGroups: [],
            keywords: [],
            ads: []
          },
          summary: {
            totalDiscrepancies: 0,
            criticalIssues: 0,
            warnings: 0,
            suggestions: []
          }
        })
      };

      // Replace the internal client with mock
      (reconciler as any).googleAdsClient = mockClient;

      const report = await reconciler.analyzeDrift(planned, '123', 'test-product');

      // Verify report structure
      expect(report).toHaveProperty('customerId', '123');
      expect(report).toHaveProperty('product', 'test-product');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('metrics');
      expect(report.metrics).toHaveProperty('totalDrift');
      expect(report.metrics).toHaveProperty('criticalDrifts');
      expect(report.metrics).toHaveProperty('performanceDrifts');
      expect(report.metrics).toHaveProperty('structuralDrifts');
      expect(report.metrics).toHaveProperty('budgetDrifts');
      expect(report).toHaveProperty('drifts');
      expect(report.drifts).toHaveProperty('campaigns');
      expect(report.drifts).toHaveProperty('adGroups');
      expect(report.drifts).toHaveProperty('keywords');
      expect(report.drifts).toHaveProperty('ads');
      expect(report.drifts).toHaveProperty('budgets');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('automationOpportunities');
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(Array.isArray(report.automationOpportunities)).toBe(true);
    });

    it('should generate recommendations based on drift metrics', async () => {
      const planned = {
        campaigns: [],
        targetBudget: 100
      };

      const mockClient = {
        isConfigured: () => true,
        getCampaigns: vi.fn().mockResolvedValue([]),
        reconcile: vi.fn().mockResolvedValue({
          customerId: '123',
          timestamp: new Date().toISOString(),
          discrepancies: { campaigns: [], adGroups: [], keywords: [], ads: [] },
          summary: { totalDiscrepancies: 0, criticalIssues: 0, warnings: 0, suggestions: [] }
        })
      };

      (reconciler as any).googleAdsClient = mockClient;

      const report = await reconciler.analyzeDrift(planned, '123', 'test-product');

      // Should have at least one recommendation for aligned campaigns
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('well-aligned') || r.includes('optimization'))).toBe(true);
    });

    it('should identify automation opportunities', async () => {
      const planned = {
        campaigns: [
          {
            name: 'Campaign 1',
            budgetMicros: '50000000'
          },
          {
            name: 'Campaign 2',
            budgetMicros: '30000000'
          }
        ],
        targetBudget: 100,
        targetCTR: 0.05
      };

      // Create a report with budget drifts to trigger automation opportunities
      const mockReport: DriftReport = {
        customerId: '123',
        product: 'test-product',
        timestamp: new Date().toISOString(),
        metrics: {
          totalDrift: 5,
          criticalDrifts: 0,
          performanceDrifts: 2,
          structuralDrifts: 0,
          budgetDrifts: 3
        },
        drifts: {
          campaigns: [],
          adGroups: [],
          keywords: [],
          ads: [],
          budgets: [
            {
              entity: 'Campaign 1',
              type: 'budget',
              severity: 'high',
              description: 'Budget drift',
              impact: 'Overspending',
              action: 'Reduce budget'
            }
          ]
        },
        recommendations: [],
        automationOpportunities: []
      };

      // Call the private method directly for testing
      const generateOpportunities = (reconciler as any).identifyAutomationOpportunities.bind(reconciler);
      const mockReconciliation: ReconciliationReport = {
        customerId: '123',
        timestamp: new Date().toISOString(),
        discrepancies: { campaigns: [], adGroups: [], keywords: [], ads: [] },
        summary: { totalDiscrepancies: 0, criticalIssues: 0, warnings: 0, suggestions: [] }
      };

      generateOpportunities(mockReport, mockReconciliation);

      // Should identify budget automation opportunity
      expect(mockReport.automationOpportunities.length).toBeGreaterThan(0);
      expect(mockReport.automationOpportunities.some(o => o.type === 'Budget Automation')).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      const planned = {
        campaigns: [{
          name: 'Test Campaign',
          status: 'ENABLED'
        }]
      };

      const mockClient = {
        isConfigured: () => true,
        getCampaigns: vi.fn().mockRejectedValue(new Error('API Error')),
        reconcile: vi.fn().mockResolvedValue({
          customerId: '123',
          timestamp: new Date().toISOString(),
          discrepancies: { campaigns: [], adGroups: [], keywords: [], ads: [] },
          summary: { totalDiscrepancies: 0, criticalIssues: 0, warnings: 0, suggestions: [] }
        })
      };

      (reconciler as any).googleAdsClient = mockClient;

      // Should not throw, but handle error internally
      const report = await reconciler.analyzeDrift(planned, '123', 'test-product');
      expect(report).toBeDefined();
      expect(report.metrics.totalDrift).toBe(0);
    });

    it('should get quick summary when API not configured', async () => {
      const mockClient = {
        isConfigured: () => false
      };

      (reconciler as any).googleAdsClient = mockClient;

      const summary = await reconciler.getQuickSummary('123');

      expect(summary.isConfigured).toBe(false);
      expect(summary.hasAccess).toBe(false);
      expect(summary.campaignCount).toBe(0);
      expect(summary.totalBudget).toBe(0);
    });

    it('should calculate total budget correctly', async () => {
      const mockClient = {
        isConfigured: () => true,
        getCampaigns: vi.fn().mockResolvedValue([
          {
            id: '1',
            name: 'Campaign 1',
            status: 'ENABLED',
            budget: { amountMicros: '10000000' }
          },
          {
            id: '2',
            name: 'Campaign 2',
            status: 'ENABLED',
            budget: { amountMicros: '20000000' }
          },
          {
            id: '3',
            name: 'Campaign 3',
            status: 'PAUSED',
            budget: { amountMicros: '5000000' }
          }
        ])
      };

      (reconciler as any).googleAdsClient = mockClient;

      const summary = await reconciler.getQuickSummary('123');

      expect(summary.isConfigured).toBe(true);
      expect(summary.hasAccess).toBe(true);
      expect(summary.campaignCount).toBe(2); // Only enabled campaigns
      expect(summary.totalBudget).toBe(30); // $10 + $20 (excluding paused)
      expect(summary.lastSync).toBeDefined();
    });
  });

  describe('Schema Validation', () => {
    it('should validate Campaign schema', () => {
      const validCampaign = {
        id: '123456',
        name: 'Test Campaign',
        status: 'ENABLED',
        advertisingChannelType: 'SEARCH',
        budget: {
          id: '789',
          name: 'Test Budget',
          amountMicros: '10000000',
          deliveryMethod: 'STANDARD'
        },
        biddingStrategy: 'MAXIMIZE_CONVERSIONS',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const result = CampaignSchema.safeParse(validCampaign);
      expect(result.success).toBe(true);
    });

    it('should validate AdGroup schema', () => {
      const validAdGroup = {
        id: '456789',
        name: 'Test Ad Group',
        status: 'ENABLED',
        campaignId: '123456',
        cpcBidMicros: '500000',
        targetingSettings: {
          deviceTargeting: ['DESKTOP', 'MOBILE']
        }
      };

      const result = AdGroupSchema.safeParse(validAdGroup);
      expect(result.success).toBe(true);
    });

    it('should validate Keyword schema', () => {
      const validKeyword = {
        id: '789012',
        text: 'chrome extension',
        matchType: 'EXACT',
        status: 'ENABLED',
        adGroupId: '456789',
        cpcBidMicros: '750000',
        finalUrls: ['https://example.com/landing']
      };

      const result = KeywordSchema.safeParse(validKeyword);
      expect(result.success).toBe(true);
    });

    it('should validate Ad schema', () => {
      const validAd = {
        id: '345678',
        type: 'RESPONSIVE_SEARCH_AD',
        adGroupId: '456789',
        status: 'ENABLED',
        headlines: [
          { text: 'Best Chrome Extension', pinning: 'FIRST' },
          { text: 'Download Now', pinning: null }
        ],
        descriptions: [
          { text: 'Enhance your browsing experience', pinning: null },
          { text: 'Free and easy to use', pinning: null }
        ],
        finalUrls: ['https://example.com/download'],
        path1: 'chrome',
        path2: 'extension'
      };

      const result = AdSchema.safeParse(validAd);
      expect(result.success).toBe(true);
    });

    it('should validate PerformanceStats schema', () => {
      const validStats = {
        impressions: 10000,
        clicks: 500,
        conversions: 25,
        costMicros: '5000000',
        ctr: 0.05,
        conversionRate: 0.05,
        averageCpc: 10.0
      };

      const result = PerformanceStatsSchema.safeParse(validStats);
      expect(result.success).toBe(true);
    });

    it('should reject invalid Campaign status', () => {
      const invalidCampaign = {
        id: '123456',
        name: 'Test Campaign',
        status: 'INVALID_STATUS', // Invalid enum value
        advertisingChannelType: 'SEARCH'
      };

      const result = CampaignSchema.safeParse(invalidCampaign);
      expect(result.success).toBe(false);
    });

    it('should reject invalid Keyword match type', () => {
      const invalidKeyword = {
        id: '789012',
        text: 'chrome extension',
        matchType: 'FUZZY', // Invalid match type
        status: 'ENABLED',
        adGroupId: '456789'
      };

      const result = KeywordSchema.safeParse(invalidKeyword);
      expect(result.success).toBe(false);
    });
  });
});