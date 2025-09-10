import pino from 'pino';
import { GoogleAdsApi } from 'google-ads-api';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * One-Click Apply System for Google Ads Campaigns
 * 
 * Enables automated campaign creation from generated plans
 * with comprehensive validation and rollback capabilities.
 */

// ============================================================================
// SCHEMAS
// ============================================================================

export const CampaignApplyRequestSchema = z.object({
  planPath: z.string(),
  customerId: z.string(),
  testMode: z.boolean().default(false),
  budgetOverride: z.number().optional(),
  startDate: z.string().optional(),
  autoStart: z.boolean().default(false)
});

export type CampaignApplyRequest = z.infer<typeof CampaignApplyRequestSchema>;

export const ApplyResultSchema = z.object({
  success: z.boolean(),
  campaignId: z.string().optional(),
  adGroupIds: z.array(z.string()),
  keywordCount: z.number(),
  adCount: z.number(),
  errors: z.array(z.object({
    entity: z.string(),
    message: z.string(),
    code: z.string().optional()
  })),
  warnings: z.array(z.string()),
  rollbackAvailable: z.boolean()
});

export type ApplyResult = z.infer<typeof ApplyResultSchema>;

// ============================================================================
// ONE-CLICK APPLY CLASS
// ============================================================================

export class OneClickApplier {
  private client: GoogleAdsApi | null = null;
  private customer: any = null;
  private createdResources: {
    campaigns: string[];
    adGroups: string[];
    keywords: string[];
    ads: string[];
  } = {
    campaigns: [],
    adGroups: [],
    keywords: [],
    ads: []
  };
  
  constructor() {
    this.initializeClient();
  }
  
  /**
   * Initializes Google Ads API client
   */
  private initializeClient(): void {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
      
      if (!clientId || !clientSecret || !developerToken || !refreshToken) {
        logger.warn('Google Ads API credentials not configured');
        return;
      }
      
      this.client = new GoogleAdsApi({
        client_id: clientId,
        client_secret: clientSecret,
        developer_token: developerToken
      });
      
      logger.info('Google Ads API client initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Google Ads API client');
    }
  }
  
  /**
   * Main apply function - creates campaign from plan
   */
  async apply(request: CampaignApplyRequest): Promise<ApplyResult> {
    const result: ApplyResult = {
      success: false,
      adGroupIds: [],
      keywordCount: 0,
      adCount: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: false
    };
    
    try {
      // Validate request
      const validatedRequest = CampaignApplyRequestSchema.parse(request);
      
      // Check if client is available
      if (!this.client) {
        if (validatedRequest.testMode) {
          return this.runTestMode(validatedRequest);
        }
        
        result.errors.push({
          entity: 'client',
          message: 'Google Ads API client not initialized'
        });
        return result;
      }
      
      // Initialize customer
      this.customer = this.client.Customer({
        customer_id: validatedRequest.customerId,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN!
      });
      
      // Load plan data
      const planData = this.loadPlanData(validatedRequest.planPath);
      if (!planData) {
        result.errors.push({
          entity: 'plan',
          message: 'Failed to load plan data'
        });
        return result;
      }
      
      // Create campaign
      logger.info('🚀 Starting one-click campaign creation...');
      
      const campaignId = await this.createCampaign(
        planData.campaign,
        validatedRequest
      );
      
      if (!campaignId) {
        result.errors.push({
          entity: 'campaign',
          message: 'Failed to create campaign'
        });
        return result;
      }
      
      result.campaignId = campaignId;
      this.createdResources.campaigns.push(campaignId);
      
      // Create ad groups
      const adGroupResults = await this.createAdGroups(
        campaignId,
        planData.adGroups
      );
      
      result.adGroupIds = adGroupResults.successful;
      this.createdResources.adGroups.push(...adGroupResults.successful);
      
      if (adGroupResults.errors.length > 0) {
        result.warnings.push(...adGroupResults.errors);
      }
      
      // Create keywords
      const keywordResults = await this.createKeywords(
        adGroupResults.mapping,
        planData.keywords
      );
      
      result.keywordCount = keywordResults.count;
      this.createdResources.keywords.push(...keywordResults.ids);
      
      if (keywordResults.errors.length > 0) {
        result.warnings.push(...keywordResults.errors);
      }
      
      // Create ads
      const adResults = await this.createAds(
        adGroupResults.mapping,
        planData.ads
      );
      
      result.adCount = adResults.count;
      this.createdResources.ads.push(...adResults.ids);
      
      if (adResults.errors.length > 0) {
        result.warnings.push(...adResults.errors);
      }
      
      // Set campaign status
      if (validatedRequest.autoStart) {
        await this.setCampaignStatus(campaignId, 'ENABLED');
        logger.info('✅ Campaign started automatically');
      } else {
        logger.info('⏸️ Campaign created in PAUSED state');
      }
      
      result.success = true;
      result.rollbackAvailable = true;
      
      logger.info(`✅ Campaign created successfully!`);
      logger.info(`   Campaign ID: ${campaignId}`);
      logger.info(`   Ad Groups: ${result.adGroupIds.length}`);
      logger.info(`   Keywords: ${result.keywordCount}`);
      logger.info(`   Ads: ${result.adCount}`);
      
    } catch (error) {
      logger.error({ error }, 'One-click apply failed');
      
      result.errors.push({
        entity: 'system',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Attempt rollback on failure
      if (this.createdResources.campaigns.length > 0) {
        await this.rollback();
      }
    }
    
    return result;
  }
  
  /**
   * Creates campaign
   */
  private async createCampaign(
    campaignData: any,
    request: CampaignApplyRequest
  ): Promise<string | null> {
    try {
      const campaign = {
        name: campaignData.name,
        status: 'PAUSED',
        advertising_channel_type: 'SEARCH',
        campaign_budget: await this.createBudget(
          request.budgetOverride || campaignData.budget
        ),
        bidding_strategy_type: campaignData.biddingStrategy || 'MANUAL_CPC',
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_content_network: false
        },
        geo_target_type_setting: {
          positive_geo_target_type: 'PRESENCE_OR_INTEREST',
          negative_geo_target_type: 'PRESENCE'
        },
        start_date: request.startDate || campaignData.startDate,
        end_date: campaignData.endDate
      };
      
      const response = await this.customer.campaigns.create(campaign);
      
      return response.resource_name.split('/').pop();
      
    } catch (error) {
      logger.error({ error }, 'Failed to create campaign');
      return null;
    }
  }
  
  /**
   * Creates campaign budget
   */
  private async createBudget(amount: number): Promise<string> {
    const budget = {
      name: `Budget_${Date.now()}`,
      amount_micros: Math.round(amount * 1000000),
      delivery_method: 'STANDARD'
    };
    
    const response = await this.customer.campaign_budgets.create(budget);
    return response.resource_name;
  }
  
  /**
   * Creates ad groups
   */
  private async createAdGroups(
    campaignId: string,
    adGroupsData: any[]
  ): Promise<{
    successful: string[];
    mapping: Map<string, string>;
    errors: string[];
  }> {
    const results = {
      successful: [] as string[],
      mapping: new Map<string, string>(),
      errors: [] as string[]
    };
    
    for (const agData of adGroupsData) {
      try {
        const adGroup = {
          campaign: `customers/${this.customer.customer_id}/campaigns/${campaignId}`,
          name: agData.name,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpc_bid_micros: Math.round((agData.maxCpc || 2) * 1000000)
        };
        
        const response = await this.customer.ad_groups.create(adGroup);
        const adGroupId = response.resource_name.split('/').pop();
        
        results.successful.push(adGroupId);
        results.mapping.set(agData.name, adGroupId);
        
      } catch (error) {
        logger.error({ error, adGroup: agData.name }, 'Failed to create ad group');
        results.errors.push(`Ad group "${agData.name}": ${error.message}`);
      }
    }
    
    return results;
  }
  
  /**
   * Creates keywords
   */
  private async createKeywords(
    adGroupMapping: Map<string, string>,
    keywordsData: any[]
  ): Promise<{
    count: number;
    ids: string[];
    errors: string[];
  }> {
    const results = {
      count: 0,
      ids: [] as string[],
      errors: [] as string[]
    };
    
    // Batch keywords by ad group
    const keywordsByAdGroup = new Map<string, any[]>();
    
    for (const kwData of keywordsData) {
      const adGroupId = adGroupMapping.get(kwData.adGroup);
      if (!adGroupId) continue;
      
      if (!keywordsByAdGroup.has(adGroupId)) {
        keywordsByAdGroup.set(adGroupId, []);
      }
      
      keywordsByAdGroup.get(adGroupId)!.push(kwData);
    }
    
    // Create keywords in batches
    for (const [adGroupId, keywords] of keywordsByAdGroup) {
      try {
        const operations = keywords.map(kw => ({
          create: {
            ad_group: `customers/${this.customer.customer_id}/ad_groups/${adGroupId}`,
            text: kw.keyword,
            match_type: kw.matchType || 'BROAD',
            status: 'ENABLED',
            cpc_bid_micros: kw.maxCpc ? Math.round(kw.maxCpc * 1000000) : undefined,
            final_urls: kw.finalUrl ? [kw.finalUrl] : undefined
          }
        }));
        
        const response = await this.customer.ad_group_criteria.mutate(operations);
        
        results.count += response.results.length;
        results.ids.push(...response.results.map((r: any) => 
          r.resource_name.split('/').pop()
        ));
        
      } catch (error) {
        logger.error({ error, adGroupId }, 'Failed to create keywords');
        results.errors.push(`Keywords for ad group ${adGroupId}: ${error.message}`);
      }
    }
    
    return results;
  }
  
  /**
   * Creates responsive search ads
   */
  private async createAds(
    adGroupMapping: Map<string, string>,
    adsData: any[]
  ): Promise<{
    count: number;
    ids: string[];
    errors: string[];
  }> {
    const results = {
      count: 0,
      ids: [] as string[],
      errors: [] as string[]
    };
    
    for (const adData of adsData) {
      const adGroupId = adGroupMapping.get(adData.adGroup);
      if (!adGroupId) continue;
      
      try {
        const ad = {
          ad_group: `customers/${this.customer.customer_id}/ad_groups/${adGroupId}`,
          status: 'ENABLED',
          responsive_search_ad: {
            headlines: adData.headlines.map((h: any) => ({
              text: h.text,
              pinned_field: h.pinned
            })),
            descriptions: adData.descriptions.map((d: string) => ({
              text: d
            })),
            path1: adData.path1,
            path2: adData.path2
          },
          final_urls: [adData.finalUrl]
        };
        
        const response = await this.customer.ads.create(ad);
        const adId = response.resource_name.split('/').pop();
        
        results.count++;
        results.ids.push(adId);
        
      } catch (error) {
        logger.error({ error, adGroup: adData.adGroup }, 'Failed to create ad');
        results.errors.push(`Ad for "${adData.adGroup}": ${error.message}`);
      }
    }
    
    return results;
  }
  
  /**
   * Sets campaign status
   */
  private async setCampaignStatus(
    campaignId: string,
    status: 'ENABLED' | 'PAUSED'
  ): Promise<void> {
    try {
      await this.customer.campaigns.update({
        resource_name: `customers/${this.customer.customer_id}/campaigns/${campaignId}`,
        status
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update campaign status');
    }
  }
  
  /**
   * Loads plan data from file system
   */
  private loadPlanData(planPath: string): any {
    try {
      // Load campaign data
      const campaignPath = join(planPath, 'campaigns.json');
      const adGroupsPath = join(planPath, 'ad_groups.json');
      const keywordsPath = join(planPath, 'keywords.json');
      const adsPath = join(planPath, 'ads.json');
      
      return {
        campaign: JSON.parse(readFileSync(campaignPath, 'utf-8')),
        adGroups: JSON.parse(readFileSync(adGroupsPath, 'utf-8')),
        keywords: JSON.parse(readFileSync(keywordsPath, 'utf-8')),
        ads: JSON.parse(readFileSync(adsPath, 'utf-8'))
      };
      
    } catch (error) {
      logger.error({ error }, 'Failed to load plan data');
      return null;
    }
  }
  
  /**
   * Rollback created resources
   */
  async rollback(): Promise<void> {
    logger.info('🔄 Starting rollback of created resources...');
    
    try {
      // Remove ads
      for (const adId of this.createdResources.ads) {
        await this.customer.ads.remove(adId);
      }
      
      // Remove keywords
      for (const keywordId of this.createdResources.keywords) {
        await this.customer.ad_group_criteria.remove(keywordId);
      }
      
      // Remove ad groups
      for (const adGroupId of this.createdResources.adGroups) {
        await this.customer.ad_groups.remove(adGroupId);
      }
      
      // Remove campaigns
      for (const campaignId of this.createdResources.campaigns) {
        await this.customer.campaigns.remove(campaignId);
      }
      
      logger.info('✅ Rollback completed successfully');
      
    } catch (error) {
      logger.error({ error }, 'Rollback failed - manual cleanup may be required');
    }
    
    // Clear tracked resources
    this.createdResources = {
      campaigns: [],
      adGroups: [],
      keywords: [],
      ads: []
    };
  }
  
  /**
   * Test mode - simulates campaign creation without API calls
   */
  private runTestMode(request: CampaignApplyRequest): ApplyResult {
    logger.info('🧪 Running in TEST MODE - no actual campaigns will be created');
    
    const planData = this.loadPlanData(request.planPath);
    
    if (!planData) {
      return {
        success: false,
        adGroupIds: [],
        keywordCount: 0,
        adCount: 0,
        errors: [{
          entity: 'plan',
          message: 'Failed to load plan data'
        }],
        warnings: [],
        rollbackAvailable: false
      };
    }
    
    // Simulate successful creation
    const result: ApplyResult = {
      success: true,
      campaignId: `test_campaign_${Date.now()}`,
      adGroupIds: planData.adGroups.map((_: any, i: number) => `test_ag_${i}`),
      keywordCount: planData.keywords.length,
      adCount: planData.ads.length,
      errors: [],
      warnings: ['Running in test mode - no actual resources created'],
      rollbackAvailable: false
    };
    
    logger.info('✅ Test mode simulation complete');
    logger.info(`   Would create: 1 campaign`);
    logger.info(`   Would create: ${result.adGroupIds.length} ad groups`);
    logger.info(`   Would create: ${result.keywordCount} keywords`);
    logger.info(`   Would create: ${result.adCount} ads`);
    
    return result;
  }
  
  /**
   * Validates account before applying
   */
  async validateAccount(customerId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const validation = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[]
    };
    
    if (!this.client) {
      validation.valid = false;
      validation.errors.push('Google Ads API client not initialized');
      return validation;
    }
    
    try {
      const customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN!
      });
      
      // Check account status
      const accountInfo = await customer.query(`
        SELECT 
          customer.id,
          customer.descriptive_name,
          customer.currency_code,
          customer.time_zone,
          customer.can_manage_clients
        FROM customer
        LIMIT 1
      `);
      
      if (!accountInfo || accountInfo.length === 0) {
        validation.valid = false;
        validation.errors.push('Customer account not found');
        return validation;
      }
      
      // Check billing
      const billing = await customer.query(`
        SELECT
          billing_setup.status,
          billing_setup.payments_account
        FROM billing_setup
        LIMIT 1
      `);
      
      if (!billing || billing.length === 0 || billing[0].billing_setup.status !== 'APPROVED') {
        validation.warnings.push('Billing not set up - campaigns will not serve');
      }
      
      logger.info(`✅ Account validation successful for ${customerId}`);
      
    } catch (error) {
      validation.valid = false;
      validation.errors.push(error.message);
    }
    
    return validation;
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const oneClickApplier = new OneClickApplier();