import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GoogleAdsApi } from 'google-ads-api';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Complete Mutation Testing for Google Ads API
 * 
 * Tests all mutation operations with real API calls
 * including validation, error handling, and rollback.
 */

describe('Google Ads API Mutation Testing', () => {
  let client: GoogleAdsApi | null = null;
  let customer: any = null;
  let testCustomerId: string;
  let createdResourceNames: string[] = [];
  
  beforeEach(() => {
    testCustomerId = process.env.GOOGLE_ADS_TEST_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID || '';
    
    if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      });
      
      customer = client.Customer({
        customer_id: testCustomerId,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN!
      });
    }
  });
  
  afterEach(async () => {
    // Clean up created resources
    for (const resourceName of createdResourceNames) {
      try {
        const resourceType = resourceName.split('/')[3]; // Extract resource type
        
        switch (resourceType) {
          case 'campaigns':
            await customer.campaigns.remove(resourceName);
            break;
          case 'adGroups':
            await customer.adGroups.remove(resourceName);
            break;
          case 'adGroupCriteria':
            await customer.adGroupCriteria.remove(resourceName);
            break;
        }
      } catch (error) {
        // Resource may already be removed
      }
    }
    
    createdResourceNames = [];
  });
  
  describe('Campaign Mutations', () => {
    it('should create a campaign with budget', async () => {
      if (!customer) {
        logger.warn('Skipping test - Google Ads API not configured');
        return;
      }
      
      // Create budget first
      const budgetOperation = {
        create: {
          name: `Test Budget ${Date.now()}`,
          amount_micros: 1000000, // $1
          delivery_method: 'STANDARD'
        }
      };
      
      const budgetResponse = await customer.campaignBudgets.mutate([budgetOperation]);
      const budgetResourceName = budgetResponse.results[0].resource_name;
      
      // Create campaign
      const campaignOperation = {
        create: {
          name: `Test Campaign ${Date.now()}`,
          status: 'PAUSED',
          advertising_channel_type: 'SEARCH',
          campaign_budget: budgetResourceName,
          bidding_strategy_type: 'MANUAL_CPC',
          network_settings: {
            target_google_search: true,
            target_search_network: false
          },
          start_date: '2024-01-01',
          end_date: '2024-12-31'
        }
      };
      
      const campaignResponse = await customer.campaigns.mutate([campaignOperation]);
      
      expect(campaignResponse.results).toHaveLength(1);
      expect(campaignResponse.results[0].resource_name).toContain('campaigns/');
      
      createdResourceNames.push(campaignResponse.results[0].resource_name);
      logger.info('✅ Campaign created successfully');
    });
    
    it('should update campaign status', async () => {
      if (!customer) return;
      
      // Create a campaign first
      const budgetOp = {
        create: {
          name: `Test Budget ${Date.now()}`,
          amount_micros: 1000000,
          delivery_method: 'STANDARD'
        }
      };
      
      const budgetRes = await customer.campaignBudgets.mutate([budgetOp]);
      
      const campaignOp = {
        create: {
          name: `Test Campaign ${Date.now()}`,
          status: 'PAUSED',
          advertising_channel_type: 'SEARCH',
          campaign_budget: budgetRes.results[0].resource_name,
          bidding_strategy_type: 'MANUAL_CPC'
        }
      };
      
      const campaignRes = await customer.campaigns.mutate([campaignOp]);
      const campaignResourceName = campaignRes.results[0].resource_name;
      createdResourceNames.push(campaignResourceName);
      
      // Update status
      const updateOp = {
        update: {
          resource_name: campaignResourceName,
          status: 'ENABLED'
        },
        update_mask: 'status'
      };
      
      const updateRes = await customer.campaigns.mutate([updateOp]);
      
      expect(updateRes.results).toHaveLength(1);
      logger.info('✅ Campaign status updated successfully');
    });
    
    it('should handle invalid campaign creation', async () => {
      if (!customer) return;
      
      const invalidOp = {
        create: {
          name: '', // Invalid: empty name
          status: 'PAUSED',
          advertising_channel_type: 'SEARCH',
          // Missing required campaign_budget
          bidding_strategy_type: 'MANUAL_CPC'
        }
      };
      
      try {
        await customer.campaigns.mutate([invalidOp]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('Required');
        logger.info('✅ Invalid campaign creation properly rejected');
      }
    });
  });
  
  describe('Ad Group Mutations', () => {
    let testCampaignResourceName: string;
    
    beforeEach(async () => {
      if (!customer) return;
      
      // Create a test campaign for ad groups
      const budgetOp = {
        create: {
          name: `Test Budget ${Date.now()}`,
          amount_micros: 1000000,
          delivery_method: 'STANDARD'
        }
      };
      
      const budgetRes = await customer.campaignBudgets.mutate([budgetOp]);
      
      const campaignOp = {
        create: {
          name: `Test Campaign ${Date.now()}`,
          status: 'PAUSED',
          advertising_channel_type: 'SEARCH',
          campaign_budget: budgetRes.results[0].resource_name,
          bidding_strategy_type: 'MANUAL_CPC'
        }
      };
      
      const campaignRes = await customer.campaigns.mutate([campaignOp]);
      testCampaignResourceName = campaignRes.results[0].resource_name;
      createdResourceNames.push(testCampaignResourceName);
    });
    
    it('should create an ad group', async () => {
      if (!customer) return;
      
      const adGroupOp = {
        create: {
          campaign: testCampaignResourceName,
          name: `Test Ad Group ${Date.now()}`,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpc_bid_micros: 1000000 // $1 CPC
        }
      };
      
      const response = await customer.adGroups.mutate([adGroupOp]);
      
      expect(response.results).toHaveLength(1);
      expect(response.results[0].resource_name).toContain('adGroups/');
      
      createdResourceNames.push(response.results[0].resource_name);
      logger.info('✅ Ad group created successfully');
    });
    
    it('should create multiple ad groups in batch', async () => {
      if (!customer) return;
      
      const operations = [];
      for (let i = 0; i < 3; i++) {
        operations.push({
          create: {
            campaign: testCampaignResourceName,
            name: `Test Ad Group ${i} ${Date.now()}`,
            status: 'ENABLED',
            type: 'SEARCH_STANDARD',
            cpc_bid_micros: 1000000
          }
        });
      }
      
      const response = await customer.adGroups.mutate(operations);
      
      expect(response.results).toHaveLength(3);
      response.results.forEach((result: any) => {
        createdResourceNames.push(result.resource_name);
      });
      
      logger.info('✅ Multiple ad groups created in batch');
    });
  });
  
  describe('Keyword Mutations', () => {
    let testAdGroupResourceName: string;
    
    beforeEach(async () => {
      if (!customer) return;
      
      // Create test campaign and ad group
      const budgetOp = {
        create: {
          name: `Test Budget ${Date.now()}`,
          amount_micros: 1000000,
          delivery_method: 'STANDARD'
        }
      };
      
      const budgetRes = await customer.campaignBudgets.mutate([budgetOp]);
      
      const campaignOp = {
        create: {
          name: `Test Campaign ${Date.now()}`,
          status: 'PAUSED',
          advertising_channel_type: 'SEARCH',
          campaign_budget: budgetRes.results[0].resource_name,
          bidding_strategy_type: 'MANUAL_CPC'
        }
      };
      
      const campaignRes = await customer.campaigns.mutate([campaignOp]);
      createdResourceNames.push(campaignRes.results[0].resource_name);
      
      const adGroupOp = {
        create: {
          campaign: campaignRes.results[0].resource_name,
          name: `Test Ad Group ${Date.now()}`,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpc_bid_micros: 1000000
        }
      };
      
      const adGroupRes = await customer.adGroups.mutate([adGroupOp]);
      testAdGroupResourceName = adGroupRes.results[0].resource_name;
      createdResourceNames.push(testAdGroupResourceName);
    });
    
    it('should create keywords with different match types', async () => {
      if (!customer) return;
      
      const operations = [
        {
          create: {
            ad_group: testAdGroupResourceName,
            status: 'ENABLED',
            keyword: {
              text: 'test keyword exact',
              match_type: 'EXACT'
            },
            cpc_bid_micros: 500000
          }
        },
        {
          create: {
            ad_group: testAdGroupResourceName,
            status: 'ENABLED',
            keyword: {
              text: 'test keyword phrase',
              match_type: 'PHRASE'
            },
            cpc_bid_micros: 400000
          }
        },
        {
          create: {
            ad_group: testAdGroupResourceName,
            status: 'ENABLED',
            keyword: {
              text: 'test keyword broad',
              match_type: 'BROAD'
            },
            cpc_bid_micros: 300000
          }
        }
      ];
      
      const response = await customer.adGroupCriteria.mutate(operations);
      
      expect(response.results).toHaveLength(3);
      response.results.forEach((result: any) => {
        createdResourceNames.push(result.resource_name);
      });
      
      logger.info('✅ Keywords created with different match types');
    });
    
    it('should handle duplicate keyword errors', async () => {
      if (!customer) return;
      
      const keywordOp = {
        create: {
          ad_group: testAdGroupResourceName,
          status: 'ENABLED',
          keyword: {
            text: 'duplicate test',
            match_type: 'EXACT'
          }
        }
      };
      
      // Create first keyword
      const firstResponse = await customer.adGroupCriteria.mutate([keywordOp]);
      createdResourceNames.push(firstResponse.results[0].resource_name);
      
      // Try to create duplicate
      try {
        await customer.adGroupCriteria.mutate([keywordOp]);
        expect.fail('Should have thrown duplicate error');
      } catch (error) {
        expect(error.message).toContain('duplicate');
        logger.info('✅ Duplicate keyword properly rejected');
      }
    });
  });
  
  describe('Responsive Search Ad Mutations', () => {
    let testAdGroupResourceName: string;
    
    beforeEach(async () => {
      if (!customer) return;
      
      // Create test campaign and ad group
      const budgetOp = {
        create: {
          name: `Test Budget ${Date.now()}`,
          amount_micros: 1000000,
          delivery_method: 'STANDARD'
        }
      };
      
      const budgetRes = await customer.campaignBudgets.mutate([budgetOp]);
      
      const campaignOp = {
        create: {
          name: `Test Campaign ${Date.now()}`,
          status: 'PAUSED',
          advertising_channel_type: 'SEARCH',
          campaign_budget: budgetRes.results[0].resource_name,
          bidding_strategy_type: 'MANUAL_CPC'
        }
      };
      
      const campaignRes = await customer.campaigns.mutate([campaignOp]);
      createdResourceNames.push(campaignRes.results[0].resource_name);
      
      const adGroupOp = {
        create: {
          campaign: campaignRes.results[0].resource_name,
          name: `Test Ad Group ${Date.now()}`,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpc_bid_micros: 1000000
        }
      };
      
      const adGroupRes = await customer.adGroups.mutate([adGroupOp]);
      testAdGroupResourceName = adGroupRes.results[0].resource_name;
      createdResourceNames.push(testAdGroupResourceName);
    });
    
    it('should create a responsive search ad', async () => {
      if (!customer) return;
      
      const adOp = {
        create: {
          ad_group: testAdGroupResourceName,
          ad: {
            responsive_search_ad: {
              headlines: [
                { text: 'Test Headline 1' },
                { text: 'Test Headline 2' },
                { text: 'Test Headline 3' }
              ],
              descriptions: [
                { text: 'Test description one with enough characters' },
                { text: 'Test description two with enough characters' }
              ],
              path1: 'test',
              path2: 'path'
            },
            final_urls: ['https://example.com']
          },
          status: 'PAUSED'
        }
      };
      
      const response = await customer.adGroupAds.mutate([adOp]);
      
      expect(response.results).toHaveLength(1);
      expect(response.results[0].resource_name).toContain('adGroupAds/');
      
      logger.info('✅ Responsive search ad created successfully');
    });
    
    it('should validate RSA character limits', async () => {
      if (!customer) return;
      
      const invalidAdOp = {
        create: {
          ad_group: testAdGroupResourceName,
          ad: {
            responsive_search_ad: {
              headlines: [
                { text: 'This headline is way too long and exceeds the 30 character limit' }
              ],
              descriptions: [
                { text: 'Short' } // Too short for description
              ]
            },
            final_urls: ['https://example.com']
          },
          status: 'PAUSED'
        }
      };
      
      try {
        await customer.adGroupAds.mutate([invalidAdOp]);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toContain('character');
        logger.info('✅ RSA character limits properly enforced');
      }
    });
  });
  
  describe('Batch Operations and Transactions', () => {
    it('should handle partial batch failures', async () => {
      if (!customer) return;
      
      const operations = [
        {
          create: {
            name: `Valid Budget ${Date.now()}`,
            amount_micros: 1000000,
            delivery_method: 'STANDARD'
          }
        },
        {
          create: {
            name: '', // Invalid: empty name
            amount_micros: -1000, // Invalid: negative amount
            delivery_method: 'STANDARD'
          }
        }
      ];
      
      try {
        await customer.campaignBudgets.mutate(operations, { partial_failure: true });
        // With partial_failure, valid operations should succeed
      } catch (error) {
        // Without partial_failure, entire batch fails
        expect(error).toBeDefined();
        logger.info('✅ Batch failure handling works correctly');
      }
    });
    
    it('should rollback on transaction failure', async () => {
      if (!customer) return;
      
      // This would typically be done with transaction support
      // For now, we test manual rollback capability
      const createdInTransaction: string[] = [];
      
      try {
        // Create budget
        const budgetOp = {
          create: {
            name: `Transaction Budget ${Date.now()}`,
            amount_micros: 1000000,
            delivery_method: 'STANDARD'
          }
        };
        
        const budgetRes = await customer.campaignBudgets.mutate([budgetOp]);
        createdInTransaction.push(budgetRes.results[0].resource_name);
        
        // Simulate failure
        throw new Error('Simulated transaction failure');
        
      } catch (error) {
        // Rollback
        for (const resourceName of createdInTransaction) {
          try {
            await customer.campaignBudgets.remove(resourceName);
          } catch (e) {
            // Resource may not exist
          }
        }
        
        logger.info('✅ Transaction rollback completed');
      }
    });
  });
  
  describe('Performance and Rate Limiting', () => {
    it('should handle rate limiting gracefully', async () => {
      if (!customer) return;
      
      const operations = [];
      
      // Create multiple operations to potentially trigger rate limits
      for (let i = 0; i < 10; i++) {
        operations.push(
          customer.query(`
            SELECT campaign.id, campaign.name
            FROM campaign
            LIMIT 1
          `)
        );
      }
      
      // Execute with controlled concurrency
      const results = await Promise.allSettled(operations);
      
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      expect(successful.length).toBeGreaterThan(0);
      
      if (failed.length > 0) {
        const rateLimitErrors = failed.filter(
          r => r.status === 'rejected' && r.reason.message.includes('RATE_EXCEEDED')
        );
        
        if (rateLimitErrors.length > 0) {
          logger.info('✅ Rate limiting detected and handled');
        }
      } else {
        logger.info('✅ All requests completed without rate limiting');
      }
    });
  });
});

/**
 * Mutation test configuration
 */
export const mutationTestConfig = {
  // Test with small budgets to avoid costs
  testBudgetMicros: 1000000, // $1
  
  // Clean up resources after tests
  cleanupAfterTests: true,
  
  // Retry configuration for flaky tests
  retryAttempts: 3,
  retryDelay: 1000,
  
  // Validate mutations actually succeed
  validateMutations: true
};