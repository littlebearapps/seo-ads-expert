import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as csv from 'csv-stringify/sync';
import pino from 'pino';
import { z } from 'zod';
import { KeywordCluster } from '../clustering.js';
import { formatCsvDeterministic } from '../utils/deterministic.js';
import { 
  CSV_COLUMN_REGISTRIES,
  CSV_SCHEMAS,
  CampaignRow,
  AdGroupRow,
  KeywordRow,
  RSARow,
  SitelinkAssetRow,
  CalloutAssetRow,
  StructuredSnippetAssetRow,
  AssetAssociationRow,
  CSV_SCHEMA_VERSION
} from '../schemas/csv-schemas.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Modern Ads Editor CSV Export System with Ground-Truth Validation
 * 
 * Generates Google Ads Editor compatible CSV files for bulk upload.
 * Uses ground-truth CSV schemas for reliable imports.
 * 
 * Features:
 * - Schema-driven column ordering
 * - Runtime validation with Zod
 * - Character limit enforcement
 * - Complete RSA pinning support
 * - Asset-based structure support
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface AdsEditorExportOptions {
  product: string;
  clusters: KeywordCluster[];
  productConfig: any;
  outputPath: string;
  markets?: string[];
  validateOnly?: boolean; // Dry run for validation
  includeAssets?: boolean; // Include sitelinks, callouts, etc.
}

// Using schema-driven types from csv-schemas.ts
export type AdsEditorCampaignRow = CampaignRow;

export type AdsEditorAdGroupRow = AdGroupRow;

export type AdsEditorKeywordRow = KeywordRow;

export type AdsEditorRSARow = RSARow;

export interface AdsEditorNegativeKeywordRow {
  'Campaign': string;
  'Ad group': string;
  'Keyword': string;
  'Type': 'Campaign negative' | 'Negative';
  'Match type': 'Broad' | 'Phrase' | 'Exact';
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates data against schema and returns validated/cleaned data
 */
function validateRow<T>(schema: z.ZodSchema<T>, data: any, rowType: string): T | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({
        rowType,
        errors: error.errors,
        data
      }, `Validation failed for ${rowType}`);
    }
    return null;
  }
}

/**
 * Truncates text to fit Google Ads character limits
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  // Try to truncate at word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace);
  }
  
  return truncated;
}

/**
 * Formats URL for Google Ads (ensures proper protocol)
 */
function formatUrl(url: string): string {
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// ============================================================================
// CSV EXPORT ENGINE
// ============================================================================

export class AdsEditorCsvExporter {
  private productName: string;
  private campaignName: string;
  private defaultBudget: number = 50; // Daily budget in currency units
  private defaultMaxCpc: number = 2; // Default max CPC bid
  
  constructor() {
    logger.info('📊 Ads Editor CSV Exporter initialized');
  }
  
  /**
   * Generate all CSV files for Google Ads Editor import
   */
  async exportAll(options: AdsEditorExportOptions): Promise<string[]> {
    logger.info(`📊 Generating Ads Editor CSV files for ${options.product}`);
    
    this.productName = options.productConfig.product || options.product;
    this.campaignName = `${this.productName} - Search Campaign`;
    
    const outputPaths: string[] = [];
    
    // Ensure output directory exists
    mkdirSync(options.outputPath, { recursive: true });
    
    // Generate campaign CSV
    const campaignPath = await this.exportCampaigns(options);
    outputPaths.push(campaignPath);
    
    // Generate ad groups CSV
    const adGroupsPath = await this.exportAdGroups(options);
    outputPaths.push(adGroupsPath);
    
    // Generate keywords CSV
    const keywordsPath = await this.exportKeywords(options);
    outputPaths.push(keywordsPath);
    
    // Generate RSAs CSV
    const rsasPath = await this.exportRSAs(options);
    outputPaths.push(rsasPath);
    
    // Generate negative keywords CSV
    const negativesPath = await this.exportNegativeKeywords(options);
    outputPaths.push(negativesPath);
    
    // Generate asset CSVs if requested
    if (options.includeAssets !== false) {
      const assetPaths = await this.exportAssets(options);
      outputPaths.push(...assetPaths);
    }
    
    logger.info(`✅ Generated ${outputPaths.length} Ads Editor CSV files`);
    return outputPaths;
  }
  
  /**
   * Export campaigns CSV with schema validation
   */
  private async exportCampaigns(options: AdsEditorExportOptions): Promise<string> {
    const campaigns: CampaignRow[] = [];
    
    // Create one campaign per market if multiple markets, otherwise single campaign
    const markets = options.markets && options.markets.length > 0 ? options.markets : ['US'];
    
    for (const market of markets) {
      const campaignName = markets.length > 1 
        ? `${this.productName} - ${market} Search`
        : this.campaignName;
      
      const campaignData = {
        Campaign: campaignName,
        'Campaign Type': 'Search' as const,
        Status: 'Paused' as const, // Start paused for safety
        Budget: this.defaultBudget,
        'Budget Type': 'Daily' as const,
        'Bid Strategy Type': 'Manual CPC' as const,
        Networks: 'Google Search;Search Partners',
        Languages: this.getLanguageForMarket(market),
        Location: this.getLocationForMarket(market),
        'Campaign Labels': `${this.productName};v${CSV_SCHEMA_VERSION};${market}`,
        // Optional fields
        'Target CPA': undefined,
        'Target ROAS': undefined,
        'Location Bid Modifier': undefined,
        'Excluded Location': undefined,
        'Device': undefined,
        'Device Bid Modifier': undefined,
        'Ad Schedule': undefined,
        'Ad Schedule Bid Modifier': undefined,
        'Start Date': this.getTodayDate(),
        'End Date': undefined
      };
      
      const validated = validateRow(CSV_SCHEMAS.campaigns, campaignData, 'Campaign');
      if (validated) {
        campaigns.push(validated);
      }
    }
    
    // Generate CSV with proper column order from schema
    const csvContent = csv.stringify(campaigns, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.campaigns as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'campaigns.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated campaigns.csv with ${campaigns.length} campaigns`);
    return outputPath;
  }
  
  /**
   * Export ad groups CSV with schema validation
   */
  private async exportAdGroups(options: AdsEditorExportOptions): Promise<string> {
    const adGroups: AdGroupRow[] = [];
    
    for (const cluster of options.clusters) {
      // Use landing page from cluster or config
      const landingPage = cluster.landingPage || 
                         cluster.mapped_landing_page || 
                         options.productConfig?.landingPages?.home || '';
      
      if (!landingPage) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      
      const adGroupData = {
        Campaign: this.campaignName,
        'Ad Group': adGroupName,
        Status: 'Enabled' as const,
        'Max CPC': cluster.suggested_bid || cluster.avgCpc || this.defaultMaxCpc,
        'Final URL': formatUrl(landingPage),
        'Ad Group Labels': `cluster_${cluster.id};${cluster.use_case || 'General'}`,
        // Optional fields
        'Target CPA': undefined,
        'Target ROAS': undefined,
        'Final Mobile URL': undefined,
        'Tracking Template': options.productConfig?.trackingTemplate,
        'Custom Parameters': undefined
      };
      
      const validated = validateRow(CSV_SCHEMAS.ad_groups, adGroupData, 'Ad Group');
      if (validated) {
        adGroups.push(validated);
      }
    }
    
    const csvContent = csv.stringify(adGroups, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.ad_groups as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'ad_groups.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated ad_groups.csv with ${adGroups.length} ad groups`);
    return outputPath;
  }
  
  /**
   * Export keywords CSV with schema validation
   */
  private async exportKeywords(options: AdsEditorExportOptions): Promise<string> {
    const keywordsExact: KeywordRow[] = [];
    const keywordsPhrase: KeywordRow[] = [];
    
    for (const cluster of options.clusters) {
      const landingPage = cluster.landingPage || 
                         cluster.mapped_landing_page || 
                         options.productConfig?.landingPages?.home || '';
      
      if (!landingPage) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      const finalUrl = formatUrl(landingPage);
      
      for (const keyword of cluster.keywords) {
        // Add exact match for high-value keywords
        if (keyword.score && keyword.score > 0.7) {
          const exactData = {
            Campaign: this.campaignName,
            'Ad Group': adGroupName,
            Keyword: `[${keyword.keyword}]`,
            'Match Type': 'Exact' as const,
            Status: 'Enabled' as const,
            'Max CPC': keyword.cpc || keyword.suggested_bid || this.defaultMaxCpc,
            'Final URL': finalUrl,
            'Keyword Labels': `source_${keyword.source || 'seed'};high_value`,
            // Optional fields
            'Final Mobile URL': undefined,
            'Tracking Template': options.productConfig?.trackingTemplate,
            'Custom Parameters': undefined
          };
          
          const validated = validateRow(CSV_SCHEMAS.keywords_exact, exactData, 'Keyword');
          if (validated) {
            keywordsExact.push(validated);
          }
        }
        
        // Add phrase match for all keywords
        const phraseData = {
          Campaign: this.campaignName,
          'Ad Group': adGroupName,
          Keyword: `"${keyword.keyword}"`,
          'Match Type': 'Phrase' as const,
          Status: 'Enabled' as const,
          'Max CPC': (keyword.cpc || keyword.suggested_bid || this.defaultMaxCpc) * 0.9,
          'Final URL': finalUrl,
          'Keyword Labels': `source_${keyword.source || 'seed'}`,
          // Optional fields
          'Final Mobile URL': undefined,
          'Tracking Template': options.productConfig?.trackingTemplate,
          'Custom Parameters': undefined
        };
        
        const validatedPhrase = validateRow(CSV_SCHEMAS.keywords_phrase, phraseData, 'Keyword');
        if (validatedPhrase) {
          keywordsPhrase.push(validatedPhrase);
        }
      }
    }
    
    // Write exact match keywords
    const exactCsvContent = csv.stringify(keywordsExact, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.keywords_exact as any,
      quoted: true,
      quoted_empty: true
    });
    const exactPath = join(options.outputPath, 'keywords_exact.csv');
    writeFileSync(exactPath, formatCsvDeterministic(exactCsvContent));
    
    // Write phrase match keywords
    const phraseCsvContent = csv.stringify(keywordsPhrase, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.keywords_phrase as any,
      quoted: true,
      quoted_empty: true
    });
    const phrasePath = join(options.outputPath, 'keywords_phrase.csv');
    writeFileSync(phrasePath, formatCsvDeterministic(phraseCsvContent));
    
    logger.info(`✅ Generated keywords with ${keywordsExact.length} exact and ${keywordsPhrase.length} phrase`);
    return exactPath; // Return primary file path
  }
  
  /**
   * Export Responsive Search Ads CSV with schema validation
   */
  private async exportRSAs(options: AdsEditorExportOptions): Promise<string> {
    const rsas: RSARow[] = [];
    
    for (const cluster of options.clusters) {
      const landingPage = cluster.landingPage || 
                         cluster.mapped_landing_page || 
                         options.productConfig?.landingPages?.home || '';
      
      if (!landingPage) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      
      // Generate headlines with proper character limits
      const headlines = this.generateHeadlines(cluster, options.productConfig);
      const descriptions = this.generateDescriptions(cluster, options.productConfig);
      
      const rsaData: any = {
        Campaign: this.campaignName,
        'Ad Group': adGroupName,
        'Ad Type': 'Responsive search ad' as const,
        Status: 'Enabled' as const,
        'Final URL': formatUrl(landingPage),
        'Path 1': truncateText(options.productConfig?.brand || 'tools', 15),
        'Path 2': truncateText(cluster.theme || cluster.use_case || 'online', 15),
        'Tracking Template': options.productConfig?.trackingTemplate,
        'Custom Parameters': undefined,
        'Ad Labels': `rsa_v${CSV_SCHEMA_VERSION}`,
        'Final Mobile URL': undefined
      };
      
      // Add headlines with pinning support
      headlines.forEach((headline, index) => {
        const num = index + 1;
        if (num <= 15) {
          rsaData[`Headline ${num}`] = truncateText(headline.text, 30);
          rsaData[`Headline ${num} Pinned`] = headline.pinned || '';
        }
      });
      
      // Fill remaining headline slots with undefined
      for (let i = headlines.length + 1; i <= 15; i++) {
        rsaData[`Headline ${i}`] = undefined;
        rsaData[`Headline ${i} Pinned`] = undefined;
      }
      
      // Add descriptions
      descriptions.forEach((desc, index) => {
        const num = index + 1;
        if (num <= 4) {
          rsaData[`Description ${num}`] = truncateText(desc, 90);
        }
      });
      
      // Fill remaining description slots
      for (let i = descriptions.length + 1; i <= 4; i++) {
        rsaData[`Description ${i}`] = undefined;
      }
      
      const validated = validateRow(CSV_SCHEMAS.ads_rsa, rsaData, 'RSA');
      if (validated) {
        rsas.push(validated);
      }
    }
    
    const csvContent = csv.stringify(rsas, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.ads_rsa as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'ads_rsa.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated responsive_search_ads.csv with ${rsas.length} RSAs`);
    return outputPath;
  }
  
  /**
   * Export negative keywords CSV
   */
  private async exportNegativeKeywords(options: AdsEditorExportOptions): Promise<string> {
    const negatives: AdsEditorNegativeKeywordRow[] = [];
    
    // Add product-level negatives at campaign level
    const campaignNegatives = options.productConfig.pre_seeded_negatives || [];
    for (const negative of campaignNegatives) {
      negatives.push({
        'Campaign': this.campaignName,
        'Ad group': '',
        'Keyword': negative,
        'Type': 'Campaign negative',
        'Match type': 'Broad'
      });
    }
    
    // Add ad group level negatives based on cluster conflicts
    for (const cluster of options.clusters) {
      if (!cluster.mapped_landing_page) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      
      // Add negatives to prevent cross-contamination between ad groups
      for (const otherCluster of options.clusters) {
        if (otherCluster.id === cluster.id || !otherCluster.mapped_landing_page) continue;
        
        // Add key terms from other clusters as negatives
        const otherKeyTerms = this.extractKeyTerms(otherCluster.name);
        for (const term of otherKeyTerms) {
          negatives.push({
            'Campaign': this.campaignName,
            'Ad group': adGroupName,
            'Keyword': term,
            'Type': 'Negative',
            'Match type': 'Phrase'
          });
        }
      }
    }
    
    const csvContent = this.generateCsv(negatives);
    const outputPath = join(options.outputPath, 'negative_keywords.csv');
    writeFileSync(outputPath, csvContent);
    
    logger.info(`✅ Generated negative_keywords.csv with ${negatives.length} negative keywords`);
    return outputPath;
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Generate CSV content from data rows
   */
  private generateCsv(data: any[]): string {
    if (data.length === 0) {
      return '';
    }
    
    // Use csv-stringify for proper CSV formatting
    const csvString = csv.stringify(data, {
      header: true,
      quoted: true,
      quoted_empty: true,
      delimiter: ','
    });
    
    // Apply deterministic formatting
    return formatCsvDeterministic(csvString);
  }
  
  /**
   * Sanitize ad group name for Google Ads
   */
  private sanitizeAdGroupName(name: string): string {
    // Remove special characters and limit length
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .substring(0, 50);
  }
  
  /**
   * Ensure minimum number of assets for RSAs
   */
  private ensureMinimumAssets(assets: string[], minCount: number, maxLength: number): string[] {
    const result: string[] = [];
    
    // Add existing assets
    for (const asset of assets || []) {
      if (asset.length <= maxLength) {
        result.push(asset);
      } else {
        // Truncate if too long
        result.push(asset.substring(0, maxLength - 3) + '...');
      }
    }
    
    // Fill with variations if needed
    while (result.length < minCount && result.length > 0) {
      const baseAsset = result[0];
      const variation = this.createAssetVariation(baseAsset, result.length);
      if (variation.length <= maxLength) {
        result.push(variation);
      } else {
        break;
      }
    }
    
    return result;
  }
  
  /**
   * Create variation of an asset for diversity
   */
  private createAssetVariation(baseAsset: string, index: number): string {
    const variations = [
      'Try', 'Get', 'Free', 'Best', 'Top', 'New', 'Pro', 'Fast', 'Easy', 'Smart'
    ];
    
    if (index < variations.length) {
      return `${variations[index]} ${baseAsset}`;
    }
    
    return baseAsset;
  }
  
  /**
   * Extract key terms from cluster name for negative keywords
   */
  private extractKeyTerms(clusterName: string): string[] {
    const terms = clusterName.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 3)
      .filter(term => !['with', 'from', 'into', 'that', 'this'].includes(term));
    
    return terms;
  }
  
  /**
   * Generate headlines with pinning support
   */
  private generateHeadlines(cluster: KeywordCluster, productConfig: any): Array<{text: string, pinned?: '1' | '2' | '3' | ''}> {
    const headlines: Array<{text: string, pinned?: '1' | '2' | '3' | ''}> = [];
    
    // Pin brand name in position 1 if available
    if (productConfig?.brand) {
      headlines.push({
        text: productConfig.brand,
        pinned: '1'
      });
    }
    
    // Add main benefit in position 2
    if (productConfig?.mainBenefit) {
      headlines.push({
        text: productConfig.mainBenefit,
        pinned: '2'
      });
    }
    
    // Add existing headlines or generate from keywords
    if (cluster.headlines && cluster.headlines.length > 0) {
      cluster.headlines.forEach(h => headlines.push({ text: h }));
    } else {
      // Generate from top keywords
      const topKeywords = cluster.keywords
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 5);
      
      for (const kw of topKeywords) {
        const headline = kw.keyword
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        headlines.push({ text: headline });
      }
    }
    
    // Add value props
    const valueProps = productConfig?.valueProps || [
      'Save Time & Money',
      'Trusted by Thousands',
      'Easy to Use',
      'Professional Results',
      'Start Free Today'
    ];
    
    for (const prop of valueProps) {
      if (headlines.length < 15) {
        headlines.push({ text: prop });
      }
    }
    
    // Ensure minimum 3 headlines
    while (headlines.length < 3) {
      headlines.push({ text: `Best ${cluster.theme || cluster.use_case || 'Solution'}` });
    }
    
    return headlines.slice(0, 15);
  }
  
  /**
   * Generate descriptions for RSAs
   */
  private generateDescriptions(cluster: KeywordCluster, productConfig: any): string[] {
    const descriptions: string[] = [];
    
    // Use existing descriptions if available
    if (cluster.descriptions && cluster.descriptions.length > 0) {
      descriptions.push(...cluster.descriptions);
    } else {
      // Generate default descriptions
      descriptions.push(
        productConfig?.mainDescription || 
        `Professional ${cluster.theme || cluster.use_case || 'tools'} for your business. Get started today with our easy-to-use platform.`
      );
      
      descriptions.push(
        productConfig?.benefitDescription ||
        `Save time and increase productivity. Trusted by professionals worldwide. Try it free.`
      );
      
      if (productConfig?.features && productConfig.features.length > 0) {
        const features = productConfig.features.slice(0, 3).join(', ');
        descriptions.push(`Features: ${features}. Start your free trial today.`);
      }
      
      descriptions.push(
        productConfig?.ctaDescription ||
        `Join thousands of satisfied customers. No credit card required. Start your free trial now!`
      );
    }
    
    return descriptions.slice(0, 4);
  }
  
  /**
   * Get language code for market
   */
  private getLanguageForMarket(market: string): string {
    // Return language codes for Google Ads (using ISO codes)
    const languageMap: Record<string, string> = {
      'US': 'en',
      'GB': 'en',
      'UK': 'en',
      'AU': 'en',
      'CA': 'en',
      'DE': 'de',
      'FR': 'fr',
      'ES': 'es',
      'IT': 'it',
    };
    
    return languageMap[market] || 'en'; // Default to English
  }
  
  /**
   * Get location targeting for market
   */
  private getLocationForMarket(market: string): string {
    const locationMap: Record<string, string> = {
      'US': 'United States',
      'GB': 'United Kingdom',
      'UK': 'United Kingdom',
      'AU': 'Australia',
      'CA': 'Canada',
      'DE': 'Germany',
      'FR': 'France',
      'ES': 'Spain',
      'IT': 'Italy',
    };
    
    return locationMap[market] || 'United States';
  }
  
  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  /**
   * Export asset CSVs (sitelinks, callouts, structured snippets)
   */
  private async exportAssets(options: AdsEditorExportOptions): Promise<string[]> {
    const outputPaths: string[] = [];
    const { productConfig } = options;
    
    // Generate sitelinks
    const sitelinks = await this.exportSitelinks(options);
    if (sitelinks) outputPaths.push(sitelinks);
    
    // Generate callouts
    const callouts = await this.exportCallouts(options);
    if (callouts) outputPaths.push(callouts);
    
    // Generate structured snippets
    const structured = await this.exportStructuredSnippets(options);
    if (structured) outputPaths.push(structured);
    
    // Generate asset associations
    const associations = await this.exportAssetAssociations(options);
    if (associations) outputPaths.push(associations);
    
    return outputPaths;
  }
  
  /**
   * Export sitelinks CSV with schema validation
   */
  private async exportSitelinks(options: AdsEditorExportOptions): Promise<string | null> {
    const sitelinks: SitelinkAssetRow[] = [];
    const { productConfig } = options;
    
    const sitelinkAssets = productConfig?.assets?.sitelinks || [
      { text: 'Features', url: '/features', desc1: 'Powerful features', desc2: 'Easy to use' },
      { text: 'Pricing', url: '/pricing', desc1: 'Affordable plans', desc2: 'Start free' },
      { text: 'About', url: '/about', desc1: 'Learn more', desc2: 'Our story' },
      { text: 'Contact', url: '/contact', desc1: 'Get in touch', desc2: '24/7 support' }
    ];
    
    sitelinkAssets.forEach((sitelink: any, index: number) => {
      const assetData = {
        'Asset Type': 'Sitelink' as const,
        Asset: `sitelink_${index + 1}`,
        'Asset Status': 'Enabled' as const,
        'Link Text': truncateText(sitelink.text, 25),
        'Final URL': formatUrl((productConfig?.domain || '') + sitelink.url),
        'Description 1': truncateText(sitelink.desc1 || '', 35),
        'Description 2': truncateText(sitelink.desc2 || '', 35),
        'Final Mobile URL': undefined
      };
      
      const validated = validateRow(CSV_SCHEMAS.assets_sitelinks, assetData, 'Sitelink');
      if (validated) {
        sitelinks.push(validated);
      }
    });
    
    if (sitelinks.length === 0) return null;
    
    const csvContent = csv.stringify(sitelinks, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.assets_sitelinks as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'assets_sitelinks.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated assets_sitelinks.csv with ${sitelinks.length} sitelinks`);
    return outputPath;
  }
  
  /**
   * Export callouts CSV with schema validation
   */
  private async exportCallouts(options: AdsEditorExportOptions): Promise<string | null> {
    const callouts: CalloutAssetRow[] = [];
    const { productConfig } = options;
    
    const calloutTexts = productConfig?.assets?.callouts || [
      'Free Shipping', '24/7 Support', 'Money Back Guarantee', 'Award Winning',
      'Easy Returns', 'Price Match', 'Same Day Service', 'Expert Help'
    ];
    
    calloutTexts.forEach((text: string, index: number) => {
      const assetData = {
        'Asset Type': 'Callout' as const,
        Asset: `callout_${index + 1}`,
        'Asset Status': 'Enabled' as const,
        'Callout Text': truncateText(text, 25)
      };
      
      const validated = validateRow(CSV_SCHEMAS.assets_callouts, assetData, 'Callout');
      if (validated) {
        callouts.push(validated);
      }
    });
    
    if (callouts.length === 0) return null;
    
    const csvContent = csv.stringify(callouts, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.assets_callouts as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'assets_callouts.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated assets_callouts.csv with ${callouts.length} callouts`);
    return outputPath;
  }
  
  /**
   * Export structured snippets CSV with schema validation
   */
  private async exportStructuredSnippets(options: AdsEditorExportOptions): Promise<string | null> {
    const structured: StructuredSnippetAssetRow[] = [];
    const { productConfig } = options;
    
    const snippets = productConfig?.assets?.structured || [
      { header: 'Service catalog', values: 'Conversion, Design, Development, Marketing' },
      { header: 'Types', values: 'Professional, Enterprise, Custom, Starter' },
      { header: 'Brands', values: productConfig?.brand ? `${productConfig.brand}, Chrome, Google, Extensions` : 'Chrome, Google, Extensions, Tools' }
    ];
    
    snippets.forEach((snippet: any, index: number) => {
      const assetData = {
        'Asset Type': 'Structured snippet' as const,
        Asset: `structured_${index + 1}`,
        'Asset Status': 'Enabled' as const,
        Header: snippet.header,
        Values: snippet.values
      };
      
      const validated = validateRow(CSV_SCHEMAS.assets_structured, assetData, 'Structured');
      if (validated) {
        structured.push(validated);
      }
    });
    
    if (structured.length === 0) return null;
    
    const csvContent = csv.stringify(structured, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.assets_structured as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'assets_structured.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated assets_structured.csv with ${structured.length} snippets`);
    return outputPath;
  }
  
  /**
   * Export asset associations CSV with schema validation
   */
  private async exportAssetAssociations(options: AdsEditorExportOptions): Promise<string | null> {
    const associations: AssetAssociationRow[] = [];
    const { productConfig } = options;
    
    // Get campaigns for association
    const markets = options.markets && options.markets.length > 0 ? options.markets : ['US'];
    
    for (const market of markets) {
      const campaignName = markets.length > 1 
        ? `${this.productName} - ${market} Search`
        : this.campaignName;
      
      // Associate sitelinks at campaign level
      const sitelinkCount = productConfig?.assets?.sitelinks?.length || 4;
      for (let i = 1; i <= sitelinkCount; i++) {
        const assocData = {
          Campaign: campaignName,
          'Ad Group': undefined,
          'Asset Type': 'Sitelink' as const,
          Asset: `sitelink_${i}`,
          Status: 'Enabled' as const
        };
        
        const validated = validateRow(CSV_SCHEMAS.asset_associations, assocData, 'Association');
        if (validated) {
          associations.push(validated);
        }
      }
      
      // Associate callouts at campaign level
      const calloutCount = productConfig?.assets?.callouts?.length || 8;
      for (let i = 1; i <= Math.min(calloutCount, 4); i++) { // Max 4 callouts per campaign
        const assocData = {
          Campaign: campaignName,
          'Ad Group': undefined,
          'Asset Type': 'Callout' as const,
          Asset: `callout_${i}`,
          Status: 'Enabled' as const
        };
        
        const validated = validateRow(CSV_SCHEMAS.asset_associations, assocData, 'Association');
        if (validated) {
          associations.push(validated);
        }
      }
      
      // Associate structured snippets at campaign level
      const structuredCount = productConfig?.assets?.structured?.length || 3;
      for (let i = 1; i <= Math.min(structuredCount, 2); i++) { // Max 2 structured snippets per campaign
        const assocData = {
          Campaign: campaignName,
          'Ad Group': undefined,
          'Asset Type': 'Structured snippet' as const,
          Asset: `structured_${i}`,
          Status: 'Enabled' as const
        };
        
        const validated = validateRow(CSV_SCHEMAS.asset_associations, assocData, 'Association');
        if (validated) {
          associations.push(validated);
        }
      }
    }
    
    if (associations.length === 0) return null;
    
    const csvContent = csv.stringify(associations, {
      header: true,
      columns: CSV_COLUMN_REGISTRIES.asset_associations as any,
      quoted: true,
      quoted_empty: true
    });
    
    const outputPath = join(options.outputPath, 'asset_associations.csv');
    writeFileSync(outputPath, formatCsvDeterministic(csvContent));
    
    logger.info(`✅ Generated asset_associations.csv with ${associations.length} associations`);
    return outputPath;
  }
}

// ============================================================================
// EXPORT FUNCTION
// ============================================================================

/**
 * Main export function for Ads Editor CSV generation
 */
export async function generateAdsEditorCsvs(options: AdsEditorExportOptions): Promise<string[]> {
  const exporter = new AdsEditorCsvExporter();
  return await exporter.exportAll(options);
}