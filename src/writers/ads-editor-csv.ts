import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as csv from 'csv-stringify/sync';
import pino from 'pino';
import { KeywordCluster } from '../clustering.js';
import { formatCsvDeterministic } from '../utils/deterministic.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Modern Ads Editor CSV Export System
 * 
 * Generates Google Ads Editor compatible CSV files for bulk upload.
 * Based on official Google Ads Editor CSV format documentation.
 * 
 * Supports:
 * - Campaigns
 * - Ad Groups
 * - Keywords
 * - Responsive Search Ads (RSAs)
 * - Negative Keywords
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
}

export interface AdsEditorCampaignRow {
  'Campaign': string;
  'Campaign type': 'Search';
  'Campaign status': 'Enabled' | 'Paused';
  'Campaign daily budget': number;
  'Networks': string;
  'Language targeting': string;
  'Location': string;
  'Bid strategy type': string;
  'Start date': string;
  'Labels': string;
}

export interface AdsEditorAdGroupRow {
  'Campaign': string;
  'Ad group': string;
  'Ad group status': 'Enabled' | 'Paused';
  'Ad group type': 'Search Standard';
  'Max CPC': number;
  'Labels': string;
}

export interface AdsEditorKeywordRow {
  'Campaign': string;
  'Ad group': string;
  'Keyword': string;
  'Type': 'Broad' | 'Phrase' | 'Exact';
  'Max CPC': number;
  'Final URL': string;
  'Status': 'Enabled' | 'Paused';
  'Labels': string;
}

export interface AdsEditorRSARow {
  'Campaign': string;
  'Ad group': string;
  'Status': 'Enabled' | 'Paused';
  'Ad type': 'Responsive search ad';
  'Headline 1': string;
  'Headline 1 position': string;
  'Headline 2': string;
  'Headline 2 position': string;
  'Headline 3': string;
  'Headline 4': string;
  'Headline 5': string;
  'Headline 6': string;
  'Headline 7': string;
  'Headline 8': string;
  'Headline 9': string;
  'Headline 10': string;
  'Headline 11': string;
  'Headline 12': string;
  'Headline 13': string;
  'Headline 14': string;
  'Headline 15': string;
  'Description 1': string;
  'Description 2': string;
  'Description 3': string;
  'Description 4': string;
  'Final URL': string;
  'Path 1': string;
  'Path 2': string;
  'Tracking template': string;
  'Labels': string;
}

export interface AdsEditorNegativeKeywordRow {
  'Campaign': string;
  'Ad group': string;
  'Keyword': string;
  'Type': 'Campaign negative' | 'Negative';
  'Match type': 'Broad' | 'Phrase' | 'Exact';
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
    
    logger.info(`✅ Generated ${outputPaths.length} Ads Editor CSV files`);
    return outputPaths;
  }
  
  /**
   * Export campaigns CSV
   */
  private async exportCampaigns(options: AdsEditorExportOptions): Promise<string> {
    const campaigns: AdsEditorCampaignRow[] = [];
    
    // Create one campaign per market if multiple markets, otherwise single campaign
    const markets = options.markets && options.markets.length > 0 ? options.markets : ['US'];
    
    for (const market of markets) {
      const campaignName = markets.length > 1 
        ? `${this.productName} - ${market} Search`
        : this.campaignName;
      
      campaigns.push({
        'Campaign': campaignName,
        'Campaign type': 'Search',
        'Campaign status': 'Paused', // Start paused for safety
        'Campaign daily budget': this.defaultBudget,
        'Networks': 'Google Search;Search Partners',
        'Language targeting': this.getLanguageForMarket(market),
        'Location': this.getLocationForMarket(market),
        'Bid strategy type': 'Manual CPC',
        'Start date': this.getTodayDate(),
        'Labels': `${this.productName};Chrome Extension;${market}`
      });
    }
    
    const csvContent = this.generateCsv(campaigns);
    const outputPath = join(options.outputPath, 'campaigns.csv');
    writeFileSync(outputPath, csvContent);
    
    logger.info(`✅ Generated campaigns.csv with ${campaigns.length} campaigns`);
    return outputPath;
  }
  
  /**
   * Export ad groups CSV
   */
  private async exportAdGroups(options: AdsEditorExportOptions): Promise<string> {
    const adGroups: AdsEditorAdGroupRow[] = [];
    
    for (const cluster of options.clusters) {
      // Skip unmapped clusters
      if (!cluster.mapped_landing_page) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      
      adGroups.push({
        'Campaign': this.campaignName,
        'Ad group': adGroupName,
        'Ad group status': 'Enabled',
        'Ad group type': 'Search Standard',
        'Max CPC': cluster.suggested_bid || this.defaultMaxCpc,
        'Labels': `${cluster.use_case || 'General'};${cluster.intent || 'Informational'}`
      });
    }
    
    const csvContent = this.generateCsv(adGroups);
    const outputPath = join(options.outputPath, 'ad_groups.csv');
    writeFileSync(outputPath, csvContent);
    
    logger.info(`✅ Generated ad_groups.csv with ${adGroups.length} ad groups`);
    return outputPath;
  }
  
  /**
   * Export keywords CSV
   */
  private async exportKeywords(options: AdsEditorExportOptions): Promise<string> {
    const keywords: AdsEditorKeywordRow[] = [];
    
    for (const cluster of options.clusters) {
      if (!cluster.mapped_landing_page) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      const finalUrl = cluster.mapped_landing_page;
      
      for (const keyword of cluster.keywords) {
        // Add broad match modifier version
        keywords.push({
          'Campaign': this.campaignName,
          'Ad group': adGroupName,
          'Keyword': `+${keyword.keyword.replace(/ /g, ' +')}`,
          'Type': 'Broad',
          'Max CPC': keyword.suggested_bid || this.defaultMaxCpc,
          'Final URL': finalUrl,
          'Status': 'Enabled',
          'Labels': keyword.source || 'seed'
        });
        
        // Add phrase match version for high-value keywords
        if (keyword.score && keyword.score > 0.7) {
          keywords.push({
            'Campaign': this.campaignName,
            'Ad group': adGroupName,
            'Keyword': `"${keyword.keyword}"`,
            'Type': 'Phrase',
            'Max CPC': (keyword.suggested_bid || this.defaultMaxCpc) * 1.2,
            'Final URL': finalUrl,
            'Status': 'Enabled',
            'Labels': `${keyword.source || 'seed'};high-value`
          });
        }
        
        // Add exact match for very high-value keywords
        if (keyword.score && keyword.score > 0.85) {
          keywords.push({
            'Campaign': this.campaignName,
            'Ad group': adGroupName,
            'Keyword': `[${keyword.keyword}]`,
            'Type': 'Exact',
            'Max CPC': (keyword.suggested_bid || this.defaultMaxCpc) * 1.5,
            'Final URL': finalUrl,
            'Status': 'Enabled',
            'Labels': `${keyword.source || 'seed'};premium`
          });
        }
      }
    }
    
    const csvContent = this.generateCsv(keywords);
    const outputPath = join(options.outputPath, 'keywords.csv');
    writeFileSync(outputPath, csvContent);
    
    logger.info(`✅ Generated keywords.csv with ${keywords.length} keywords`);
    return outputPath;
  }
  
  /**
   * Export Responsive Search Ads CSV
   */
  private async exportRSAs(options: AdsEditorExportOptions): Promise<string> {
    const rsas: AdsEditorRSARow[] = [];
    
    for (const cluster of options.clusters) {
      if (!cluster.mapped_landing_page || !cluster.headlines || !cluster.descriptions) continue;
      
      const adGroupName = this.sanitizeAdGroupName(cluster.name);
      
      // Ensure we have at least 3 headlines and 2 descriptions (RSA minimum)
      const headlines = this.ensureMinimumAssets(cluster.headlines, 15, 30);
      const descriptions = this.ensureMinimumAssets(cluster.descriptions, 4, 90);
      
      const rsa: AdsEditorRSARow = {
        'Campaign': this.campaignName,
        'Ad group': adGroupName,
        'Status': 'Enabled',
        'Ad type': 'Responsive search ad',
        'Headline 1': headlines[0] || '',
        'Headline 1 position': 'Pinned to position 1', // Pin "Chrome Extension" headline
        'Headline 2': headlines[1] || '',
        'Headline 2 position': '',
        'Headline 3': headlines[2] || '',
        'Headline 4': headlines[3] || '',
        'Headline 5': headlines[4] || '',
        'Headline 6': headlines[5] || '',
        'Headline 7': headlines[6] || '',
        'Headline 8': headlines[7] || '',
        'Headline 9': headlines[8] || '',
        'Headline 10': headlines[9] || '',
        'Headline 11': headlines[10] || '',
        'Headline 12': headlines[11] || '',
        'Headline 13': headlines[12] || '',
        'Headline 14': headlines[13] || '',
        'Headline 15': headlines[14] || '',
        'Description 1': descriptions[0] || '',
        'Description 2': descriptions[1] || '',
        'Description 3': descriptions[2] || '',
        'Description 4': descriptions[3] || '',
        'Final URL': cluster.mapped_landing_page,
        'Path 1': 'Chrome',
        'Path 2': this.productName.substring(0, 15),
        'Tracking template': '{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}',
        'Labels': `RSA;${cluster.use_case || 'General'}`
      };
      
      rsas.push(rsa);
    }
    
    const csvContent = this.generateCsv(rsas);
    const outputPath = join(options.outputPath, 'responsive_search_ads.csv');
    writeFileSync(outputPath, csvContent);
    
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
   * Get language code for market
   */
  private getLanguageForMarket(market: string): string {
    const languageMap: Record<string, string> = {
      'US': '1000', // English
      'GB': '1000', // English
      'UK': '1000', // English
      'AU': '1000', // English
      'CA': '1000', // English
      'DE': '1001', // German
      'FR': '1002', // French
      'ES': '1003', // Spanish
      'IT': '1004', // Italian
    };
    
    return languageMap[market] || '1000'; // Default to English
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