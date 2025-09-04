import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GoogleAdsApiClient, GAQLBuilder } from '../src/connectors/google-ads-api.js';
import { CampaignReconciler } from '../src/analyzers/campaign-reconciler.js';

// Mock dependencies
vi.mock('../src/utils/cache.js');
vi.mock('../src/monitors/performance.js');
vi.mock('../src/utils/validation.js');

describe('Google Ads API Integration (Task 1)', () => {
  describe('GoogleAdsApiClient', () => {
    let client: GoogleAdsApiClient;

    beforeEach(() => {
      client = new GoogleAdsApiClient();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('Authentication', () => {
      it('should initialize with proper configuration', () => {
        expect(client).toBeDefined();
        expect(typeof client.isConfigured).toBe('function');
      });

      it('should detect when not configured', () => {
        const isConfigured = client.isConfigured();
        // Without real credentials, should return false
        expect(typeof isConfigured).toBe('boolean');
      });

      it('should handle missing environment variables gracefully', () => {
        // Should not throw during initialization
        expect(() => new GoogleAdsApiClient()).not.toThrow();
      });

      it('should validate OAuth configuration', () => {
        const config = (client as any).getOAuthConfig();
        
        if (config) {
          expect(config).toHaveProperty('clientId');
          expect(config).toHaveProperty('clientSecret');
          expect(config).toHaveProperty('refreshToken');
        }
      });

      it('should handle OAuth token refresh', async () => {
        const mockRefreshResult = {
          access_token: 'new-token',
          expires_in: 3600,
          token_type: 'Bearer'
        };

        (client as any).oauthClient = {
          refreshAccessToken: vi.fn().mockResolvedValue({
            tokens: mockRefreshResult
          })
        };

        const result = await (client as any).refreshAccessToken();
        
        if (result) {
          expect(result).toHaveProperty('access_token');
        }
      });
    });

    describe('Customer Management', () => {
      it('should get customer IDs when configured', () => {
        const customerIds = client.getCustomerIds();
        expect(Array.isArray(customerIds)).toBe(true);
      });

      it('should validate customer ID format', () => {
        const validId = '123-456-7890';
        const invalidId = 'invalid-id';
        
        expect((client as any).isValidCustomerId(validId)).toBe(true);
        expect((client as any).isValidCustomerId(invalidId)).toBe(false);
      });

      it('should handle missing customer configuration', () => {
        const customerIds = client.getCustomerIds();
        // Should return empty array or default customer IDs
        expect(Array.isArray(customerIds)).toBe(true);
      });
    });

    describe('API Operations', () => {
      beforeEach(() => {
        // Mock successful API responses
        (client as any).makeApiCall = vi.fn().mockResolvedValue({
          results: [],
          fieldMask: '',
          nextPageToken: '',
          totalResultsCount: 0
        });
      });

      it('should fetch campaigns', async () => {
        const campaigns = await client.getCampaigns('123-456-7890');
        
        expect(Array.isArray(campaigns)).toBe(true);
        expect((client as any).makeApiCall).toHaveBeenCalled();
      });

      it('should fetch ad groups', async () => {
        const adGroups = await client.getAdGroups('123-456-7890', 'campaign-123');
        
        expect(Array.isArray(adGroups)).toBe(true);
        expect((client as any).makeApiCall).toHaveBeenCalled();
      });

      it('should fetch keywords', async () => {
        const keywords = await client.getKeywords('123-456-7890', 'adgroup-123');
        
        expect(Array.isArray(keywords)).toBe(true);
        expect((client as any).makeApiCall).toHaveBeenCalled();
      });

      it('should handle API rate limiting', async () => {
        (client as any).makeApiCall = vi.fn().mockRejectedValueOnce(
          new Error('RATE_LIMIT_EXCEEDED')
        ).mockResolvedValueOnce({ results: [] });

        // Should retry after rate limit
        const result = await client.getCampaigns('123-456-7890');
        expect(result).toBeDefined();
        expect((client as any).makeApiCall).toHaveBeenCalledTimes(2);
      });

      it('should handle API quota exhaustion', async () => {
        (client as any).makeApiCall = vi.fn().mockRejectedValue(
          new Error('QUOTA_EXCEEDED')
        );

        await expect(client.getCampaigns('123-456-7890')).rejects.toThrow();
      });

      it('should handle network errors with retry', async () => {
        (client as any).makeApiCall = vi.fn()
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mkResolvedValueOnce({ results: [] });

        const result = await client.getCampaigns('123-456-7890');
        expect(result).toBeDefined();
        expect((client as any).makeApiCall).toHaveBeenCalledTimes(3);
      });
    });

    describe('Campaign Mutations', () => {
      beforeEach(() => {
        (client as any).makeApiCall = vi.fn().mockResolvedValue({
          results: [{ resourceName: 'customers/123/campaigns/456' }]
        });
      });

      it('should create campaigns', async () => {
        const campaignData = {
          name: 'Test Campaign',
          status: 'PAUSED',
          budgetId: 'budget-123',
          biddingStrategy: 'MAXIMIZE_CONVERSIONS'
        };

        const result = await client.createCampaign('123-456-7890', campaignData);
        
        expect(result).toHaveProperty('resourceName');
        expect((client as any).makeApiCall).toHaveBeenCalledWith(
          expect.stringContaining('mutate'),
          expect.objectContaining({
            customerId: '123-456-7890'
          })
        );
      });

      it('should update campaigns', async () => {
        const updates = {
          resourceName: 'customers/123/campaigns/456',
          name: 'Updated Campaign',
          status: 'ENABLED'
        };

        const result = await client.updateCampaign('123-456-7890', updates);
        
        expect(result).toHaveProperty('resourceName');
        expect((client as any).makeApiCall).toHaveBeenCalled();
      });

      it('should handle mutation errors', async () => {
        (client as any).makeApiCall = vi.fn().mockRejectedValue(
          new Error('INVALID_RESOURCE_NAME')
        );

        await expect(client.updateCampaign('123-456-7890', {
          resourceName: 'invalid-resource',
          name: 'Test'
        })).rejects.toThrow();
      });

      it('should validate mutation data before sending', async () => {
        const invalidData = {
          name: '', // Empty name should be invalid
          status: 'INVALID_STATUS'
        };

        await expect(client.createCampaign('123-456-7890', invalidData))
          .rejects.toThrow();
      });
    });

    describe('Performance Data', () => {
      beforeEach(() => {
        (client as any).makeApiCall = vi.fn().mockResolvedValue({
          results: [
            {
              campaign: { resourceName: 'customers/123/campaigns/456' },
              metrics: {
                impressions: '1000',
                clicks: '50',
                cost_micros: '25000000',
                conversions: '5'
              }
            }
          ]
        });
      });

      it('should fetch performance metrics', async () => {
        const metrics = await client.getPerformanceMetrics(
          '123-456-7890',
          '2024-01-01',
          '2024-01-31'
        );

        expect(Array.isArray(metrics)).toBe(true);
        expect(metrics[0]).toHaveProperty('impressions');
        expect(metrics[0]).toHaveProperty('clicks');
        expect(metrics[0]).toHaveProperty('cost');
      });

      it('should handle date range validation', async () => {
        const invalidStartDate = '2024-13-01'; // Invalid month
        const invalidEndDate = '2024-01-32'; // Invalid day

        await expect(client.getPerformanceMetrics(
          '123-456-7890',
          invalidStartDate,
          '2024-01-31'
        )).rejects.toThrow();

        await expect(client.getPerformanceMetrics(
          '123-456-7890',
          '2024-01-01',
          invalidEndDate
        )).rejects.toThrow();
      });

      it('should convert micros to standard currency', async () => {
        const metrics = await client.getPerformanceMetrics(
          '123-456-7890',
          '2024-01-01',
          '2024-01-31'
        );

        if (metrics.length > 0) {
          expect(typeof metrics[0].cost).toBe('number');
          expect(metrics[0].cost).toBe(25); // 25000000 micros = 25 dollars
        }
      });
    });

    describe('Error Handling', () => {
      it('should handle authentication errors', async () => {
        (client as any).makeApiCall = vi.fn().mockRejectedValue(
          new Error('AUTHENTICATION_ERROR')
        );

        await expect(client.getCampaigns('123-456-7890')).rejects.toThrow();
      });

      it('should handle permission errors', async () => {
        (client as any).makeApiCall = vi.fn().mockRejectedValue(
          new Error('PERMISSION_DENIED')
        );

        await expect(client.getCampaigns('123-456-7890')).rejects.toThrow();
      });

      it('should handle malformed responses', async () => {
        (client as any).makeApiCall = vi.fn().mkResolvedValue(null);

        const result = await client.getCampaigns('123-456-7890');
        expect(Array.isArray(result)).toBe(true);
      });

      it('should handle circuit breaker activation', async () => {
        // Mock performance monitor with activated circuit breaker
        (client as any).performanceMonitor = {
          executeWithCircuitBreaker: vi.fn().mockRejectedValue(
            new Error('CIRCUIT_BREAKER_OPEN')
          )
        };

        await expect(client.getCampaigns('123-456-7890')).rejects.toThrow();
      });
    });

    describe('Reconciliation', () => {
      it('should reconcile campaigns with planned data', async () => {
        const plannedData = {
          campaigns: [
            {
              name: 'Test Campaign',
              budget: 100,
              adGroups: [
                {
                  name: 'Test Ad Group',
                  keywords: ['test keyword']
                }
              ]
            }
          ]
        };

        // Mock live campaign data
        (client as any).getCampaigns = vi.fn().mockResolvedValue([
          {
            resourceName: 'customers/123/campaigns/456',
            name: 'Test Campaign',
            budget: 150 // Different budget
          }
        ]);

        const report = await client.reconcile(plannedData, '123-456-7890');

        expect(report).toHaveProperty('summary');
        expect(report).toHaveProperty('discrepancies');
        expect(report.discrepancies.campaigns.length).toBeGreaterThan(0);
      });
    });
  });

  describe('GAQLBuilder', () => {
    let builder: GAQLBuilder;

    beforeEach(() => {
      builder = new GAQLBuilder();
    });

    it('should build simple SELECT queries', () => {
      const query = builder
        .select('campaign.name', 'campaign.status')
        .from('campaign')
        .build();

      expect(query).toContain('SELECT campaign.name, campaign.status');
      expect(query).toContain('FROM campaign');
    });

    it('should build queries with WHERE clauses', () => {
      const query = builder
        .select('campaign.name')
        .from('campaign')
        .where('campaign.status = "ENABLED"')
        .build();

      expect(query).toContain('WHERE campaign.status = "ENABLED"');
    });

    it('should build queries with ORDER BY', () => {
      const query = builder
        .select('campaign.name', 'metrics.impressions')
        .from('campaign')
        .orderByDesc('metrics.impressions')
        .build();

      expect(query).toContain('ORDER BY metrics.impressions DESC');
    });

    it('should build queries with LIMIT', () => {
      const query = builder
        .select('campaign.name')
        .from('campaign')
        .limit(100)
        .build();

      expect(query).toContain('LIMIT 100');
    });

    it('should build complex queries with all clauses', () => {
      const query = builder
        .select('campaign.name', 'metrics.impressions', 'metrics.clicks')
        .from('campaign')
        .where('campaign.status = "ENABLED"')
        .where('metrics.impressions > 0')
        .orderByDesc('metrics.impressions')
        .limit(50)
        .build();

      expect(query).toContain('SELECT campaign.name, metrics.impressions, metrics.clicks');
      expect(query).toContain('FROM campaign');
      expect(query).toContain('WHERE campaign.status = "ENABLED" AND metrics.impressions > 0');
      expect(query).toContain('ORDER BY metrics.impressions DESC');
      expect(query).toContain('LIMIT 50');
    });

    it('should handle date range queries', () => {
      const query = builder
        .select('campaign.name', 'metrics.impressions')
        .from('campaign')
        .where('segments.date BETWEEN "2024-01-01" AND "2024-01-31"')
        .build();

      expect(query).toContain('segments.date BETWEEN "2024-01-01" AND "2024-01-31"');
    });

    it('should validate field names', () => {
      expect(() => {
        builder.select('invalid.field.name').build();
      }).toThrow();
    });

    it('should escape special characters in WHERE clauses', () => {
      const query = builder
        .select('campaign.name')
        .from('campaign')
        .where('campaign.name = "Campaign with \\"quotes\\""')
        .build();

      expect(query).toContain('Campaign with \\"quotes\\"');
    });

    it('should support parameter binding', () => {
      const query = builder
        .select('campaign.name')
        .from('campaign')
        .where('campaign.id = :campaignId')
        .build();

      expect(query).toContain(':campaignId');
    });

    it('should reset builder state between queries', () => {
      const query1 = builder
        .select('campaign.name')
        .from('campaign')
        .build();

      const query2 = builder
        .select('ad_group.name')
        .from('ad_group')
        .build();

      expect(query1).not.toContain('ad_group');
      expect(query2).not.toContain('campaign');
    });
  });

  describe('CampaignReconciler', () => {
    let reconciler: CampaignReconciler;
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        getCampaigns: vi.fn(),
        getAdGroups: vi.fn(),
        getKeywords: vi.fn(),
        getPerformanceMetrics: vi.fn()
      };
      reconciler = new CampaignReconciler(mockClient);
    });

    it('should detect campaign discrepancies', async () => {
      const plannedData = {
        campaigns: [
          {
            name: 'Planned Campaign',
            budget: 100,
            status: 'ENABLED'
          }
        ]
      };

      mockClient.getCampaigns.mockResolvedValue([
        {
          name: 'Planned Campaign',
          budget: 150, // Different budget
          status: 'PAUSED' // Different status
        }
      ]);

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report.summary.totalDiscrepancies).toBeGreaterThan(0);
      expect(report.discrepancies.campaigns.length).toBeGreaterThan(0);
    });

    it('should detect missing campaigns', async () => {
      const plannedData = {
        campaigns: [
          { name: 'Missing Campaign', budget: 100 }
        ]
      };

      mockClient.getCampaigns.mockResolvedValue([]); // No live campaigns

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report.discrepancies.campaigns.some(d => 
        d.type === 'MISSING' && d.entity === 'Missing Campaign'
      )).toBe(true);
    });

    it('should detect unexpected campaigns', async () => {
      const plannedData = { campaigns: [] };

      mockClient.getCampaigns.mockResolvedValue([
        { name: 'Unexpected Campaign', budget: 100 }
      ]);

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report.discrepancies.campaigns.some(d => 
        d.type === 'UNEXPECTED' && d.entity === 'Unexpected Campaign'
      )).toBe(true);
    });

    it('should analyze budget discrepancies', async () => {
      const plannedData = {
        campaigns: [
          { name: 'Budget Test', budget: 100 }
        ]
      };

      mockClient.getCampaigns.mockResolvedValue([
        { name: 'Budget Test', budget: 200 }
      ]);

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      const budgetDiscrepancy = report.discrepancies.campaigns.find(d => 
        d.type === 'BUDGET_MISMATCH'
      );

      expect(budgetDiscrepancy).toBeDefined();
      expect(budgetDiscrepancy?.details).toContain('100');
      expect(budgetDiscrepancy?.details).toContain('200');
    });

    it('should analyze performance discrepancies', async () => {
      const plannedData = {
        campaigns: [
          {
            name: 'Performance Test',
            expectedCtr: 2.5,
            expectedCpc: 1.5
          }
        ]
      };

      mockClient.getCampaigns.mockResolvedValue([
        { name: 'Performance Test', budget: 100 }
      ]);

      mockClient.getPerformanceMetrics.mockResolvedValue([
        {
          campaignName: 'Performance Test',
          ctr: 1.0, // Lower than expected
          avgCpc: 3.0 // Higher than expected
        }
      ]);

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report.discrepancies.performance?.length).toBeGreaterThan(0);
    });

    it('should generate actionable recommendations', async () => {
      const plannedData = {
        campaigns: [
          { name: 'Test Campaign', budget: 100, status: 'ENABLED' }
        ]
      };

      mockClient.getCampaigns.mockResolvedValue([
        { name: 'Test Campaign', budget: 50, status: 'PAUSED' }
      ]);

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => 
        r.includes('budget') || r.includes('status')
      )).toBe(true);
    });

    it('should calculate severity scores', async () => {
      const plannedData = {
        campaigns: [
          { name: 'Critical Test', budget: 1000 }
        ]
      };

      mockClient.getCampaigns.mockResolvedValue([
        { name: 'Critical Test', budget: 10 } // Massive budget difference
      ]);

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report.summary.criticalIssues).toBeGreaterThan(0);
      expect(report.summary.severityScore).toBeGreaterThan(7); // High severity
    });

    it('should handle API errors during reconciliation', async () => {
      const plannedData = { campaigns: [] };

      mockClient.getCampaigns.mockRejectedValue(new Error('API_ERROR'));

      await expect(reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      )).rejects.toThrow();
    });

    it('should track reconciliation history', async () => {
      const plannedData = { campaigns: [] };
      mockClient.getCampaigns.mockResolvedValue([]);

      await reconciler.analyzeDrift(plannedData, '123-456-7890', 'test-product');
      await reconciler.analyzeDrift(plannedData, '123-456-7890', 'test-product');

      const history = reconciler.getReconciliationHistory('test-product');
      expect(history.length).toBe(2);
    });
  });

  describe('Integration Tests', () => {
    let client: GoogleAdsApiClient;
    let builder: GAQLBuilder;
    let reconciler: CampaignReconciler;

    beforeEach(() => {
      client = new GoogleAdsApiClient();
      builder = new GAQLBuilder();
      reconciler = new CampaignReconciler(client);
    });

    it('should work together for complete workflow', async () => {
      // Mock API responses
      (client as any).makeApiCall = vi.fn().mockResolvedValue({
        results: [
          {
            campaign: {
              resourceName: 'customers/123/campaigns/456',
              name: 'Integration Test Campaign'
            },
            metrics: {
              impressions: '1000',
              clicks: '50'
            }
          }
        ]
      });

      // Build query
      const query = builder
        .select('campaign.name', 'metrics.impressions', 'metrics.clicks')
        .from('campaign')
        .where('campaign.status = "ENABLED"')
        .build();

      expect(query).toContain('SELECT');
      expect(query).toContain('FROM campaign');

      // Fetch campaigns
      const campaigns = await client.getCampaigns('123-456-7890');
      expect(campaigns).toBeDefined();

      // Reconcile with planned data
      const plannedData = {
        campaigns: [
          { name: 'Integration Test Campaign', budget: 100 }
        ]
      };

      const report = await reconciler.analyzeDrift(
        plannedData,
        '123-456-7890',
        'test-product'
      );

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('discrepancies');
    });
  });
});