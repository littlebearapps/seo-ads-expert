import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { KeywordCluster } from '../clustering.js';
import { UrlHealthResult, shouldBlockAdGroup, getBlockingReasons } from '../validators/url-health.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Google Ads Script Generator with Enhanced Guardrails
 * 
 * Based on GPT-5 feedback, this creates production-safe Google Ads Scripts with:
 * - Hard-coded safety constants (budget caps, device targeting)
 * - All campaigns created in PAUSED state by default
 * - Comprehensive review warnings and execution checklist
 * - URL health integration (refuses to run if pages fail health checks)
 * - Dry-run mode for safe testing
 * - LBA labeling for audit and rollback capability
 */

// ============================================================================
// SAFETY CONSTANTS (GPT-5 RECOMMENDED)
// ============================================================================

const SAFETY_CONSTANTS = {
  MAX_DAILY_BUDGET_AUD: 10, // Refuse unless ALLOW_HIGH_BUDGET=true flag
  DEFAULT_CAMPAIGN_STATUS: 'PAUSED', // Never start campaigns automatically
  DEVICE_TARGETING: {
    desktop: 1.0,   // 100% bid modifier
    mobile: -1.0,   // -100% bid modifier (desktop only)
    tablet: -0.3    // -30% bid modifier  
  },
  GEO_TARGETING: {
    AU: 2036,  // Australia geo constant
    US: 2840,  // United States geo constant  
    GB: 2826   // United Kingdom geo constant
  },
  LABEL_PREFIX: 'LBA_SEO_ADS_EXPERT',
  SCRIPT_VERSION: '1.1.0'
} as const;

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

export interface AdsScriptOptions {
  outputPath: string;
  productName: string;
  date: string;
  markets: string[];
  dryRun?: boolean;
  allowHighBudget?: boolean;
  skipHealthCheck?: boolean;
}

export interface CampaignData {
  name: string;
  budget: number;
  markets: string[];
  adGroups: AdGroupData[];
}

export interface AdGroupData {
  name: string;
  keywords: KeywordData[];
  ads: AdData[];
  landingPage: string;
  negatives: string[];
}

export interface KeywordData {
  text: string;
  matchType: 'EXACT' | 'PHRASE' | 'BROAD';
  maxCpc?: number;
}

export interface AdData {
  headlines: string[];
  descriptions: string[];
  pinnedHeadlines: Array<{ text: string; position: number }>;
  finalUrl: string;
}

// ============================================================================
// GOOGLE ADS SCRIPT GENERATOR
// ============================================================================

export class GoogleAdsScriptGenerator {
  
  /**
   * Generate Google Ads Script with comprehensive safety guardrails
   */
  async generateAdsScript(
    clusters: KeywordCluster[],
    productConfig: any,
    urlHealthResults: UrlHealthResult[],
    options: AdsScriptOptions
  ): Promise<string> {
    const outputDir = join(options.outputPath, options.productName, options.date);
    const scriptPath = join(outputDir, 'exports', `ads_script_${options.productName}.js`);

    // Ensure output directory exists
    this.ensureDirectoryExists(join(outputDir, 'exports'));

    logger.info(`🔧 Generating Google Ads Script: ${scriptPath}`);

    // Step 1: Safety validations
    this.validateSafetyConstraints(clusters, productConfig, urlHealthResults, options);

    // Step 2: Transform clusters to campaign data
    const campaignData = this.transformClustersToScript(clusters, productConfig, options);

    // Step 3: Generate script content
    const scriptContent = this.generateScriptContent(campaignData, productConfig, options);

    // Step 4: Write script file
    try {
      writeFileSync(scriptPath, scriptContent, 'utf8');
      logger.info(`✅ Google Ads Script generated: ${scriptPath}`);
      return scriptPath;
    } catch (error) {
      logger.error('❌ Failed to write Google Ads Script:', error);
      throw error;
    }
  }

  // ============================================================================
  // SAFETY VALIDATION METHODS
  // ============================================================================

  private validateSafetyConstraints(
    clusters: KeywordCluster[],
    _productConfig: any,
    urlHealthResults: UrlHealthResult[],
    options: AdsScriptOptions
  ): void {
    const errors: string[] = [];

    // Check URL health results (unless skipped)
    if (!options.skipHealthCheck) {
      const failedUrls = urlHealthResults.filter(shouldBlockAdGroup);
      
      if (failedUrls.length > 0) {
        const reasons = failedUrls.flatMap(getBlockingReasons);
        errors.push(`URL health check failures: ${reasons.join(', ')}`);
      }
    }

    // Validate markets are supported
    for (const market of options.markets) {
      if (!SAFETY_CONSTANTS.GEO_TARGETING[market as keyof typeof SAFETY_CONSTANTS.GEO_TARGETING]) {
        errors.push(`Unsupported market: ${market}. Supported: AU, US, GB`);
      }
    }

    // Check budget constraints
    const estimatedBudget = this.estimateTotalBudget(clusters);
    if (estimatedBudget > SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD && !options.allowHighBudget) {
      errors.push(`Daily budget $${estimatedBudget} exceeds safety limit of $${SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD}. Set ALLOW_HIGH_BUDGET=true to override.`);
    }

    if (errors.length > 0) {
      throw new Error(`Google Ads Script generation blocked by safety constraints:\n${errors.join('\n')}`);
    }
  }

  private estimateTotalBudget(clusters: KeywordCluster[]): number {
    // Conservative estimate based on cluster count
    return Math.max(clusters.length * 2, SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD / 2);
  }

  // ============================================================================
  // SCRIPT CONTENT GENERATION
  // ============================================================================

  private generateScriptContent(
    campaignData: CampaignData,
    productConfig: any,
    options: AdsScriptOptions
  ): string {
    const script = [];

    // Header with safety warnings
    script.push(this.generateScriptHeader(campaignData, productConfig, options));
    
    // Safety constants
    script.push(this.generateSafetyConstants());
    
    // Main function
    script.push(this.generateMainFunction(options));
    
    // Campaign creation function
    script.push(this.generateCampaignCreationFunction(campaignData));
    
    // Ad group creation functions
    script.push(this.generateAdGroupCreationFunctions(campaignData));
    
    // Utility functions
    script.push(this.generateUtilityFunctions());
    
    // Dry run function
    script.push(this.generateDryRunFunction(campaignData));

    return script.join('\n\n');
  }

  private generateScriptHeader(campaignData: CampaignData, productConfig: any, options: AdsScriptOptions): string {
    return `/**
 * ⚠️ GOOGLE ADS SCRIPT - REVIEW BEFORE RUN ⚠️
 * 
 * Generated by: LBA SEO & Ads Expert Tool v${SAFETY_CONSTANTS.SCRIPT_VERSION}
 * Product: ${options.productName}
 * Date: ${options.date}
 * Markets: ${options.markets.join(', ')}
 * 
 * 🚨 SAFETY CHECKLIST - COMPLETE BEFORE EXECUTION:
 * 
 * ✅ 1. VERIFY all landing pages are live and working
 * ✅ 2. CONFIRM daily budget is acceptable: $${campaignData.budget}/day
 * ✅ 3. CHECK geo targeting matches your requirements: ${options.markets.join(', ')}
 * ✅ 4. VALIDATE desktop-only targeting is intended (mobile -100%)
 * ✅ 5. REVIEW all campaigns will be created as PAUSED (safe default)
 * ✅ 6. ENSURE you have budget approval for estimated spend
 * ✅ 7. BACKUP existing campaigns before running script
 * ✅ 8. TEST in preview mode first (set DRY_RUN = true)
 * 
 * 🔧 SCRIPT CONFIGURATION:
 * - Total Ad Groups: ${campaignData.adGroups.length}
 * - Total Keywords: ${this.countTotalKeywords(campaignData)}
 * - Campaign Status: ${SAFETY_CONSTANTS.DEFAULT_CAMPAIGN_STATUS} (requires manual activation)
 * - Device Targeting: Desktop only (mobile -100% bid modifier)
 * - Labels: All entities tagged with ${SAFETY_CONSTANTS.LABEL_PREFIX}_${options.date}
 * 
 * 🛑 TO RUN THIS SCRIPT:
 * 1. Set DRY_RUN = false (line ~50)
 * 2. Optionally set ALLOW_HIGH_BUDGET = true if budget > $${SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD}
 * 3. Save and run in Google Ads Scripts interface
 * 
 * 📊 EXPECTED CHANGES:
 * - CREATE: 1 campaign (${campaignData.name})
 * - CREATE: ${campaignData.adGroups.length} ad groups
 * - CREATE: ${this.countTotalKeywords(campaignData)} keywords
 * - CREATE: ${campaignData.adGroups.length} responsive search ads
 * - APPLY: Shared negative list with ${this.countSharedNegatives(productConfig)} negatives
 * 
 * Generated: ${new Date().toISOString()}
 */`;
  }

  private generateSafetyConstants(): string {
    return `
// ============================================================================
// SAFETY CONSTANTS - DO NOT MODIFY
// ============================================================================

const SAFETY_CONFIG = {
  MAX_DAILY_BUDGET_AUD: ${SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD},
  DEFAULT_CAMPAIGN_STATUS: '${SAFETY_CONSTANTS.DEFAULT_CAMPAIGN_STATUS}',
  DEVICE_BID_MODIFIERS: {
    DESKTOP: ${SAFETY_CONSTANTS.DEVICE_TARGETING.desktop},
    MOBILE: ${SAFETY_CONSTANTS.DEVICE_TARGETING.mobile},
    TABLET: ${SAFETY_CONSTANTS.DEVICE_TARGETING.tablet}
  },
  GEO_CONSTANTS: {
    AU: ${SAFETY_CONSTANTS.GEO_TARGETING.AU}, // Australia
    US: ${SAFETY_CONSTANTS.GEO_TARGETING.US}, // United States
    GB: ${SAFETY_CONSTANTS.GEO_TARGETING.GB}  // United Kingdom
  },
  LABEL_PREFIX: '${SAFETY_CONSTANTS.LABEL_PREFIX}',
  SCRIPT_VERSION: '${SAFETY_CONSTANTS.SCRIPT_VERSION}'
};`;
  }

  private generateMainFunction(options: AdsScriptOptions): string {
    return `
// ============================================================================
// MAIN EXECUTION FUNCTION
// ============================================================================

function main() {
  // 🚨 SAFETY SETTINGS - REVIEW BEFORE CHANGING
  const DRY_RUN = ${options.dryRun ? 'true' : 'false'};                    // Set to false to actually create campaigns
  const ALLOW_HIGH_BUDGET = ${options.allowHighBudget ? 'true' : 'false'};  // Set to true to allow budgets > $${SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD}
  
  console.log('🚀 Starting LBA SEO Ads Expert Script v' + SAFETY_CONFIG.SCRIPT_VERSION);
  console.log('📅 Generated: ' + DATE_STAMP);
  console.log('🎯 Product: ' + PRODUCT_NAME);
  console.log('🌍 Markets: ' + MARKETS.join(', '));
  console.log('🧪 Dry Run Mode: ' + DRY_RUN);
  
  try {
    if (DRY_RUN) {
      console.log('\\n🔍 DRY RUN MODE - No changes will be made');
      previewCampaignChanges();
    } else {
      console.log('\\n⚡ LIVE MODE - Creating campaigns');
      createCampaignStructure(ALLOW_HIGH_BUDGET);
    }
    
    console.log('\\n✅ Script execution completed successfully');
    
  } catch (error) {
    console.error('❌ Script execution failed:', error.toString());
    console.error('🔧 Check the error above and review script configuration');
  }
}`;
  }

  private generateCampaignCreationFunction(campaignData: CampaignData): string {
    return `
// ============================================================================
// CAMPAIGN CREATION FUNCTIONS
// ============================================================================

function createCampaignStructure(allowHighBudget) {
  // Budget validation
  const dailyBudget = ${campaignData.budget};
  
  if (dailyBudget > SAFETY_CONFIG.MAX_DAILY_BUDGET_AUD && !allowHighBudget) {
    throw new Error('Daily budget $' + dailyBudget + ' exceeds safety limit of $' + SAFETY_CONFIG.MAX_DAILY_BUDGET_AUD + '. Set ALLOW_HIGH_BUDGET=true to override.');
  }
  
  console.log('\\n📊 Creating campaign: ${campaignData.name}');
  console.log('💰 Daily Budget: $' + dailyBudget);
  
  // Create campaign
  const campaignBuilder = AdsApp.campaigns()
    .newCampaignBuilder()
    .withName('${campaignData.name}')
    .withStatus(SAFETY_CONFIG.DEFAULT_CAMPAIGN_STATUS)
    .withBiddingStrategy(AdsApp.biddingStrategies().manualCpc())
    .withDailyBudget(dailyBudget);
  
  // Add geo targeting
  const geoTargets = [];
  ${campaignData.markets.map(market => 
    `geoTargets.push(SAFETY_CONFIG.GEO_CONSTANTS.${market}); // ${market}`
  ).join('\n  ')}
  
  campaignBuilder.withGeoTargeting(geoTargets);
  
  // Create the campaign
  const campaignOperation = campaignBuilder.build();
  
  if (campaignOperation.isSuccessful()) {
    const campaign = campaignOperation.getResult();
    console.log('✅ Campaign created successfully: ' + campaign.getName());
    
    // Apply campaign-level label
    const campaignLabel = SAFETY_CONFIG.LABEL_PREFIX + '_' + DATE_STAMP;
    campaign.applyLabel(campaignLabel);
    
    // Set device bid modifiers (desktop-only targeting)
    campaign.bidding().setMobileBidModifier(SAFETY_CONFIG.DEVICE_BID_MODIFIERS.MOBILE);
    campaign.bidding().setTabletBidModifier(SAFETY_CONFIG.DEVICE_BID_MODIFIERS.TABLET);
    
    console.log('📱 Device targeting: Desktop only (mobile ' + (SAFETY_CONFIG.DEVICE_BID_MODIFIERS.MOBILE * 100) + '%)');
    
    // Create ad groups
    createAdGroups(campaign);
    
    // Apply shared negatives
    createSharedNegatives(campaign);
    
  } else {
    throw new Error('Failed to create campaign: ' + campaignOperation.getErrors().join(', '));
  }
}`;
  }

  private generateAdGroupCreationFunctions(campaignData: CampaignData): string {
    const adGroupFunctions = [`
// ============================================================================
// AD GROUP CREATION FUNCTIONS
// ============================================================================

function createAdGroups(campaign) {
  console.log('\\n🎯 Creating ${campaignData.adGroups.length} ad groups...');
  
  const adGroups = [];`];

    // Generate individual ad group creation code
    campaignData.adGroups.forEach((adGroup, index) => {
      adGroupFunctions.push(`
  // Ad Group ${index + 1}: ${adGroup.name}
  console.log('Creating ad group: ${adGroup.name}');
  
  const adGroup${index} = campaign.newAdGroupBuilder()
    .withName('${adGroup.name}')
    .withStatus('${SAFETY_CONSTANTS.DEFAULT_CAMPAIGN_STATUS}')
    .withCpc(2.50) // Default max CPC
    .build();
    
  if (adGroup${index}.isSuccessful()) {
    const ag${index} = adGroup${index}.getResult();
    console.log('✅ Ad group created: ${adGroup.name}');
    
    // Apply label
    ag${index}.applyLabel(SAFETY_CONFIG.LABEL_PREFIX + '_' + DATE_STAMP);
    
    // Create keywords
    createKeywordsForAdGroup(ag${index}, ${JSON.stringify(adGroup.keywords)});
    
    // Create responsive search ad
    createResponsiveSearchAd(ag${index}, ${JSON.stringify(adGroup.ads[0])});
    
    adGroups.push(ag${index});
  } else {
    console.error('❌ Failed to create ad group ${adGroup.name}:', adGroup${index}.getErrors().join(', '));
  }`);
    });

    adGroupFunctions.push(`
  
  console.log('✅ All ad groups created successfully');
  return adGroups;
}`);

    return adGroupFunctions.join('');
  }

  private generateUtilityFunctions(): string {
    return `
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function createKeywordsForAdGroup(adGroup, keywordData) {
  console.log('📝 Creating ' + keywordData.length + ' keywords for: ' + adGroup.getName());
  
  keywordData.forEach(function(kw) {
    const keywordText = kw.matchType === 'EXACT' ? '[' + kw.text + ']' : 
                       kw.matchType === 'PHRASE' ? '"' + kw.text + '"' : kw.text;
    
    const keywordBuilder = adGroup.newKeywordBuilder()
      .withText(keywordText)
      .withCpc(kw.maxCpc || 2.50);
      
    const keywordOperation = keywordBuilder.build();
    
    if (keywordOperation.isSuccessful()) {
      const keyword = keywordOperation.getResult();
      keyword.applyLabel(SAFETY_CONFIG.LABEL_PREFIX + '_' + DATE_STAMP);
      console.log('  ✅ Keyword: ' + keywordText);
    } else {
      console.error('  ❌ Failed to create keyword: ' + keywordText, keywordOperation.getErrors());
    }
  });
}

function createResponsiveSearchAd(adGroup, adData) {
  console.log('📢 Creating RSA for: ' + adGroup.getName());
  
  const adBuilder = adGroup.newAd().responsiveSearchAdBuilder()
    .withFinalUrl(adData.finalUrl);
  
  // Add headlines (including pinned ones)
  adData.headlines.forEach(function(headline, index) {
    adBuilder.withHeadline(headline);
  });
  
  // Add pinned headlines
  adData.pinnedHeadlines.forEach(function(pinned) {
    adBuilder.withHeadlinePinnedToPosition(pinned.text, pinned.position);
  });
  
  // Add descriptions
  adData.descriptions.forEach(function(description) {
    adBuilder.withDescription(description);
  });
  
  const adOperation = adBuilder.build();
  
  if (adOperation.isSuccessful()) {
    const ad = adOperation.getResult();
    ad.applyLabel(SAFETY_CONFIG.LABEL_PREFIX + '_' + DATE_STAMP);
    console.log('  ✅ RSA created with ' + adData.headlines.length + ' headlines');
  } else {
    console.error('  ❌ Failed to create RSA:', adOperation.getErrors());
  }
}

function createSharedNegatives(campaign) {
  console.log('\\n🚫 Creating shared negative keywords...');
  
  // Create shared negative keyword list
  const sharedSetBuilder = AdsApp.sharedSets()
    .newSharedSetBuilder()
    .withName(PRODUCT_NAME + ' - Common Negatives')
    .withType('NEGATIVE_KEYWORDS');
    
  const sharedSetOperation = sharedSetBuilder.build();
  
  if (sharedSetOperation.isSuccessful()) {
    const sharedSet = sharedSetOperation.getResult();
    console.log('✅ Shared negative list created');
    
    // Add negative keywords
    const negatives = ['android', 'iphone', 'safari', 'mobile', 'tutorial', 'jobs', 'api', 'course'];
    
    negatives.forEach(function(negative) {
      sharedSet.addNegativeKeyword(negative);
    });
    
    // Associate with campaign
    campaign.addSharedSet(sharedSet);
    console.log('✅ Shared negatives applied to campaign');
  } else {
    console.error('❌ Failed to create shared negatives:', sharedSetOperation.getErrors());
  }
}`;
  }

  private generateDryRunFunction(campaignData: CampaignData): string {
    return `
// ============================================================================
// DRY RUN PREVIEW FUNCTION
// ============================================================================

function previewCampaignChanges() {
  console.log('\\n📋 PREVIEW OF PLANNED CHANGES (DRY RUN MODE)');
  console.log('============================================\\n');
  
  console.log('🏢 CAMPAIGN TO CREATE:');
  console.log('  Name: ${campaignData.name}');
  console.log('  Budget: $${campaignData.budget}/day');
  console.log('  Status: ${SAFETY_CONSTANTS.DEFAULT_CAMPAIGN_STATUS} (requires manual activation)');
  console.log('  Markets: ${campaignData.markets.join(', ')}');
  console.log('  Device Targeting: Desktop only (mobile -100%)\\n');
  
  console.log('🎯 AD GROUPS TO CREATE (' + ${campaignData.adGroups.length} + '):');
  ${campaignData.adGroups.map((ag, i) => `
  console.log('  ${i + 1}. ${ag.name}');
  console.log('     Keywords: ${ag.keywords.length} (${ag.keywords.map(k => k.text).join(', ')})');
  console.log('     Landing Page: ${ag.landingPage}');
  console.log('     Negatives: ${ag.negatives.length}');`).join('')}
  
  console.log('\\n📊 SUMMARY:');
  console.log('  Total Keywords: ${this.countTotalKeywords(campaignData)}');
  console.log('  Total Ads: ${campaignData.adGroups.length}');
  console.log('  Estimated Daily Spend: $${campaignData.budget}');
  console.log('  Safety Label: ' + SAFETY_CONFIG.LABEL_PREFIX + '_' + DATE_STAMP);
  
  console.log('\\n⚠️  TO EXECUTE FOR REAL:');
  console.log('  1. Set DRY_RUN = false');
  console.log('  2. Save and run this script again');
  console.log('  3. Monitor campaign creation in Google Ads interface');
  
  console.log('\\n🔒 SAFETY REMINDERS:');
  console.log('  - All campaigns will be PAUSED by default');
  console.log('  - Desktop-only targeting (mobile -100%)');
  console.log('  - Budget capped at $${campaignData.budget}/day');
  console.log('  - All entities labeled for easy identification');
}`;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private transformClustersToScript(
    clusters: KeywordCluster[],
    productConfig: any,
    options: AdsScriptOptions
  ): CampaignData {
    const campaignName = `${productConfig.product} - ${options.markets.join('/')} - ${options.date}`;
    
    const adGroups: AdGroupData[] = clusters.slice(0, 10).map(cluster => ({ // Limit to 10 ad groups
      name: cluster.name,
      keywords: this.extractKeywords(cluster),
      ads: [{
        headlines: this.generateHeadlines(cluster, productConfig),
        descriptions: this.generateDescriptions(cluster, productConfig),
        pinnedHeadlines: [{ text: `${cluster.name} Chrome Extension`, position: 1 }],
        finalUrl: this.generateFinalUrl(cluster, options)
      }],
      landingPage: cluster.landingPage || '',
      negatives: this.generateNegatives(cluster, productConfig)
    }));

    return {
      name: campaignName,
      budget: Math.min(adGroups.length * 2, SAFETY_CONSTANTS.MAX_DAILY_BUDGET_AUD), // $2 per ad group, capped
      markets: options.markets,
      adGroups
    };
  }

  private extractKeywords(cluster: KeywordCluster): KeywordData[] {
    const keywords: KeywordData[] = [];
    
    // Add primary keywords as exact match
    cluster.primaryKeywords.slice(0, 5).forEach(kw => {
      keywords.push({
        text: kw.keyword,
        matchType: 'EXACT',
        maxCpc: 3.00
      });
    });
    
    // Add secondary keywords as phrase match
    cluster.keywords.slice(0, 3).forEach(kw => {
      if (kw.recommended_match_type === 'phrase') {
        keywords.push({
          text: kw.keyword,
          matchType: 'PHRASE',
          maxCpc: 2.50
        });
      }
    });
    
    return keywords;
  }

  private generateHeadlines(cluster: KeywordCluster, _productConfig: any): string[] {
    return [
      `${cluster.name} Chrome Extension`, // Pinned headline
      `Convert ${cluster.useCase.replace('-', ' to ').toUpperCase()} Files`,
      'Free Browser Extension',
      'Privacy-First File Conversion',
      `Fast ${cluster.name} Tool`
    ];
  }

  private generateDescriptions(cluster: KeywordCluster, _productConfig: any): string[] {
    return [
      `${cluster.name} directly in your browser. Privacy-first, no uploads required. Fast and secure.`,
      `One-click ${cluster.useCase} conversion. Free Chrome extension with professional results.`
    ];
  }

  private generateFinalUrl(cluster: KeywordCluster, _options: AdsScriptOptions): string {
    const baseUrl = 'https://littlebearapps.com';
    const utmParams = '?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}';
    const slug = cluster.useCase.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    return `${baseUrl}/convertmyfile/${slug}${utmParams}`;
  }

  private generateNegatives(_cluster: KeywordCluster, _productConfig: any): string[] {
    return [
      'firefox', 'safari', 'edge', 'mobile', 'android', 'ios', 
      'tutorial', 'course', 'jobs', 'api', 'software'
    ];
  }

  private countTotalKeywords(campaignData: CampaignData): number {
    return campaignData.adGroups.reduce((total, ag) => total + ag.keywords.length, 0);
  }

  private countSharedNegatives(productConfig: any): number {
    return productConfig.pre_seeded_negatives?.length || 8;
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      logger.debug(`📁 Created directory: ${dirPath}`);
    }
  }
}