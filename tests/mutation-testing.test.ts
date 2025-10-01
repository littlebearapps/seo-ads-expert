import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GoogleAdsApiClient, MockGoogleAdsApiClient, type BudgetInput, type CampaignInput, type AdGroupInput } from '../src/connectors/google-ads-api.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Complete Mutation Testing for Google Ads API Client
 *
 * Tests all mutation operations with GoogleAdsApiClient interface
 * including validation, error handling, and resource linkage.
 *
 * Phase 4: Rewritten to use GoogleAdsApiClient instead of google-ads-api library
 */

describe('Google Ads API Client Mutation Testing', () => {
  let client: GoogleAdsApiClient;
  let testCustomerId: string;
  let createdResourceNames: string[] = [];
  let useMock: boolean = false;

  beforeEach(async () => {
    testCustomerId = process.env.GOOGLE_ADS_TEST_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID || '123-456-7890';

    // Try to use real client, fall back to mock if credentials not properly configured
    try {
      const realClient = new GoogleAdsApiClient();
      await realClient.authenticate();
      client = realClient;
      useMock = false;
      logger.info('Using real GoogleAdsApiClient with OAuth credentials');
    } catch (error) {
      // Credentials not configured, use mock
      client = new MockGoogleAdsApiClient();
      useMock = true;
      logger.info('Using MockGoogleAdsApiClient (no credentials configured)');
    }
  });

  afterEach(async () => {
    // Clean up created resources (only for real client)
    if (!useMock) {
      for (const resourceName of createdResourceNames) {
        try {
          // Resource cleanup would go here if we had delete methods
          // For now, we rely on Google Ads automatic cleanup for test resources
        } catch (error) {
          // Resource may already be removed
        }
      }
    }

    // Clear mock state
    if (useMock && client instanceof MockGoogleAdsApiClient) {
      client._clearResources();
    }

    createdResourceNames = [];
  });

  describe('Campaign Mutations', () => {
    it('should create a campaign with budget', async () => {
      // Create budget first
      const budgetInput: BudgetInput = {
        name: `Test Budget ${Date.now()}`,
        amountMicros: 1000000, // $1
        deliveryMethod: 'STANDARD'
      };

      const budgetResult = await client.createBudget(testCustomerId, budgetInput);

      expect(budgetResult.success).toBe(true);
      expect(budgetResult.resourceName).toContain('campaignBudgets/');
      expect(budgetResult.id).toBeDefined();

      // Create campaign linked to budget
      const campaignInput: CampaignInput = {
        name: `Test Campaign ${Date.now()}`,
        status: 'PAUSED',
        budgetResourceName: budgetResult.resourceName,
        advertisingChannelType: 'SEARCH',
        biddingStrategy: 'MANUAL_CPC'
      };

      const campaignResult = await client.createCampaign(testCustomerId, campaignInput);

      expect(campaignResult.success).toBe(true);
      expect(campaignResult.resourceName).toContain('campaigns/');
      expect(campaignResult.id).toBeDefined();

      createdResourceNames.push(campaignResult.resourceName);
      logger.info('✅ Campaign created successfully with budget linkage');
    });

    it('should create campaign without budget (optional linkage)', async () => {
      const campaignInput: CampaignInput = {
        name: `Test Campaign No Budget ${Date.now()}`,
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        biddingStrategy: 'MANUAL_CPC'
      };

      const campaignResult = await client.createCampaign(testCustomerId, campaignInput);

      expect(campaignResult.success).toBe(true);
      expect(campaignResult.resourceName).toContain('campaigns/');

      createdResourceNames.push(campaignResult.resourceName);
      logger.info('✅ Campaign created without budget linkage');
    });

    it('should reject campaign with non-existent budget', async () => {
      const campaignInput: CampaignInput = {
        name: `Test Campaign ${Date.now()}`,
        status: 'PAUSED',
        budgetResourceName: `customers/${testCustomerId}/campaignBudgets/999999999`,
        advertisingChannelType: 'SEARCH',
        biddingStrategy: 'MANUAL_CPC'
      };

      if (useMock) {
        // Mock should enforce budget existence
        await expect(client.createCampaign(testCustomerId, campaignInput))
          .rejects.toThrow(/Budget.*not found/);
        logger.info('✅ Mock properly rejects campaign with non-existent budget');
      } else {
        // Real API should also reject
        try {
          await client.createCampaign(testCustomerId, campaignInput);
          expect.fail('Should have thrown error for non-existent budget');
        } catch (error: any) {
          expect(error.code).toBeDefined();
          expect(error.retryable).toBe(false);
          logger.info('✅ Real API properly rejects campaign with non-existent budget');
        }
      }
    });

    it('should handle invalid campaign creation (empty name)', async () => {
      const invalidInput: CampaignInput = {
        name: '', // Invalid: empty name
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        biddingStrategy: 'MANUAL_CPC'
      };

      await expect(client.createCampaign(testCustomerId, invalidInput))
        .rejects.toThrow(/name cannot be empty/);

      logger.info('✅ Invalid campaign creation properly rejected (empty name)');
    });
  });

  describe('Ad Group Mutations', () => {
    let testBudgetResourceName: string;
    let testCampaignResourceName: string;

    beforeEach(async () => {
      // Create a test campaign for ad groups
      const budgetInput: BudgetInput = {
        name: `Test Budget ${Date.now()}`,
        amountMicros: 1000000,
        deliveryMethod: 'STANDARD'
      };

      const budgetResult = await client.createBudget(testCustomerId, budgetInput);
      testBudgetResourceName = budgetResult.resourceName;

      const campaignInput: CampaignInput = {
        name: `Test Campaign ${Date.now()}`,
        status: 'PAUSED',
        budgetResourceName: budgetResult.resourceName,
        advertisingChannelType: 'SEARCH',
        biddingStrategy: 'MANUAL_CPC'
      };

      const campaignResult = await client.createCampaign(testCustomerId, campaignInput);
      testCampaignResourceName = campaignResult.resourceName;
      createdResourceNames.push(testCampaignResourceName);
    });

    it('should create an ad group', async () => {
      const adGroupInput: AdGroupInput = {
        name: `Test Ad Group ${Date.now()}`,
        campaignResourceName: testCampaignResourceName,
        status: 'ENABLED',
        cpcBidMicros: 1000000 // $1 CPC
      };

      const result = await client.createAdGroup(testCustomerId, adGroupInput);

      expect(result.success).toBe(true);
      expect(result.resourceName).toContain('adGroups/');
      expect(result.id).toBeDefined();

      createdResourceNames.push(result.resourceName);
      logger.info('✅ Ad group created successfully');
    });

    it('should reject ad group with non-existent campaign', async () => {
      const adGroupInput: AdGroupInput = {
        name: `Test Ad Group ${Date.now()}`,
        campaignResourceName: `customers/${testCustomerId}/campaigns/999999999`,
        status: 'ENABLED',
        cpcBidMicros: 1000000
      };

      if (useMock) {
        // Mock should enforce campaign existence
        await expect(client.createAdGroup(testCustomerId, adGroupInput))
          .rejects.toThrow(/Campaign.*not found/);
        logger.info('✅ Mock properly rejects ad group with non-existent campaign');
      } else {
        // Real API should also reject
        try {
          await client.createAdGroup(testCustomerId, adGroupInput);
          expect.fail('Should have thrown error for non-existent campaign');
        } catch (error: any) {
          expect(error.code).toBeDefined();
          expect(error.retryable).toBe(false);
          logger.info('✅ Real API properly rejects ad group with non-existent campaign');
        }
      }
    });

    it('should handle invalid ad group creation (empty name)', async () => {
      const invalidInput: AdGroupInput = {
        name: '', // Invalid: empty name
        campaignResourceName: testCampaignResourceName,
        status: 'ENABLED'
      };

      await expect(client.createAdGroup(testCustomerId, invalidInput))
        .rejects.toThrow(/name cannot be empty/);

      logger.info('✅ Invalid ad group creation properly rejected (empty name)');
    });

    it('should handle missing campaign resource name', async () => {
      const invalidInput: AdGroupInput = {
        name: `Test Ad Group ${Date.now()}`,
        campaignResourceName: '', // Invalid: missing campaign
        status: 'ENABLED'
      };

      await expect(client.createAdGroup(testCustomerId, invalidInput))
        .rejects.toThrow(/Campaign resource name is required/);

      logger.info('✅ Missing campaign resource name properly rejected');
    });
  });

  describe('Budget Mutations', () => {
    it('should create a budget with valid parameters', async () => {
      const budgetInput: BudgetInput = {
        name: `Test Budget ${Date.now()}`,
        amountMicros: 5000000, // $5
        deliveryMethod: 'STANDARD'
      };

      const result = await client.createBudget(testCustomerId, budgetInput);

      expect(result.success).toBe(true);
      expect(result.resourceName).toContain('campaignBudgets/');
      expect(result.id).toBeDefined();

      logger.info('✅ Budget created successfully');
    });

    it('should handle string amount_micros', async () => {
      const budgetInput: BudgetInput = {
        name: `Test Budget String ${Date.now()}`,
        amountMicros: '2000000', // String format
        deliveryMethod: 'ACCELERATED'
      };

      const result = await client.createBudget(testCustomerId, budgetInput);

      expect(result.success).toBe(true);
      expect(result.resourceName).toContain('campaignBudgets/');

      logger.info('✅ Budget created with string amount_micros');
    });

    it('should reject budget with empty name', async () => {
      const invalidInput: BudgetInput = {
        name: '', // Invalid: empty name
        amountMicros: 1000000
      };

      await expect(client.createBudget(testCustomerId, invalidInput))
        .rejects.toThrow(/name cannot be empty/);

      logger.info('✅ Invalid budget creation properly rejected (empty name)');
    });
  });

  describe('Two-Step Resource Linkage (Mock)', () => {
    it('should enforce budget → campaign linkage order', async () => {
      if (!useMock) {
        logger.info('⏭️  Skipping mock-specific test (using real client)');
        return;
      }

      const mockClient = client as MockGoogleAdsApiClient;

      // Try to create campaign with non-existent budget
      const campaignInput: CampaignInput = {
        name: `Test Campaign ${Date.now()}`,
        budgetResourceName: `customers/${testCustomerId}/campaignBudgets/nonexistent`,
        status: 'PAUSED'
      };

      await expect(mockClient.createCampaign(testCustomerId, campaignInput))
        .rejects.toThrow(/Budget.*not found/);

      logger.info('✅ Mock enforces budget existence before campaign creation');
    });

    it('should enforce campaign → ad group linkage order', async () => {
      if (!useMock) {
        logger.info('⏭️  Skipping mock-specific test (using real client)');
        return;
      }

      const mockClient = client as MockGoogleAdsApiClient;

      // Try to create ad group with non-existent campaign
      const adGroupInput: AdGroupInput = {
        name: `Test Ad Group ${Date.now()}`,
        campaignResourceName: `customers/${testCustomerId}/campaigns/nonexistent`,
        status: 'ENABLED'
      };

      await expect(mockClient.createAdGroup(testCustomerId, adGroupInput))
        .rejects.toThrow(/Campaign.*not found/);

      logger.info('✅ Mock enforces campaign existence before ad group creation');
    });

    it('should track created resources in mock', async () => {
      if (!useMock) {
        logger.info('⏭️  Skipping mock-specific test (using real client)');
        return;
      }

      const mockClient = client as MockGoogleAdsApiClient;

      // Create budget
      const budgetResult = await mockClient.createBudget(testCustomerId, {
        name: `Test Budget ${Date.now()}`,
        amountMicros: 1000000
      });

      expect(mockClient._hasResource(budgetResult.resourceName)).toBe(true);

      // Create campaign
      const campaignResult = await mockClient.createCampaign(testCustomerId, {
        name: `Test Campaign ${Date.now()}`,
        budgetResourceName: budgetResult.resourceName,
        status: 'PAUSED'
      });

      expect(mockClient._hasResource(campaignResult.resourceName)).toBe(true);

      // Verify resource data
      const campaignData = mockClient._getResource(campaignResult.resourceName);
      expect(campaignData.budgetResourceName).toBe(budgetResult.resourceName);

      logger.info('✅ Mock properly tracks created resources and linkages');
    });
  });

  describe('Error Normalization', () => {
    it('should normalize validation errors as non-retryable', async () => {
      try {
        await client.createBudget(testCustomerId, { name: '', amountMicros: 1000000 });
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        // Validation errors should be normalized
        expect(error.message).toBeDefined();
        logger.info('✅ Validation errors properly handled');
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
