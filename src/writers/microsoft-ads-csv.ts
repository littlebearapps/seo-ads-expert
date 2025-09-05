import { stringify } from 'csv-stringify/sync';
import pino from 'pino';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Microsoft Ads bulk import schemas
export const MicrosoftCampaignSchema = z.object({
  'Type': z.literal('Campaign'),
  'Status': z.enum(['Active', 'Paused', 'Deleted']),
  'Campaign': z.string(),
  'Time Zone': z.string().default('AUS Eastern Standard Time'),
  'Budget': z.number(),
  'Budget Type': z.enum(['DailyBudgetStandard', 'DailyBudgetAccelerated']).default('DailyBudgetStandard'),
  'Campaign Type': z.enum(['Search', 'Shopping', 'DynamicSearchAds']).default('Search'),
  'Location': z.string().optional(),
  'Language': z.string().default('English'),
  'Bid Strategy Type': z.string().optional(),
  'Device': z.string().optional(),
  'Start Date': z.string().optional(),
  'End Date': z.string().optional()
});

export const MicrosoftAdGroupSchema = z.object({
  'Type': z.literal('Ad Group'),
  'Status': z.enum(['Active', 'Paused', 'Deleted']),
  'Campaign': z.string(),
  'Ad Group': z.string(),
  'Start Date': z.string().optional(),
  'End Date': z.string().optional(),
  'Network Distribution': z.string().default('SearchOnly'),
  'Search Bid': z.number().optional(),
  'Language': z.string().default('English'),
  'Ad Rotation': z.string().optional(),
  'Cpc Bid': z.number().optional()
});

export const MicrosoftKeywordSchema = z.object({
  'Type': z.literal('Keyword'),
  'Status': z.enum(['Active', 'Paused', 'Deleted']),
  'Campaign': z.string(),
  'Ad Group': z.string(),
  'Keyword': z.string(),
  'Match Type': z.enum(['Exact', 'Phrase', 'Broad']),
  'Bid': z.number().optional(),
  'Param1': z.string().optional(),
  'Param2': z.string().optional(),
  'Param3': z.string().optional(),
  'Final Url': z.string().optional(),
  'Tracking Template': z.string().optional()
});

export const MicrosoftExpandedTextAdSchema = z.object({
  'Type': z.literal('Expanded Text Ad'),
  'Status': z.enum(['Active', 'Paused', 'Deleted']),
  'Campaign': z.string(),
  'Ad Group': z.string(),
  'Title Part 1': z.string(),
  'Title Part 2': z.string(),
  'Title Part 3': z.string().optional(),
  'Text Part 1': z.string(),
  'Text Part 2': z.string().optional(),
  'Editorial Location': z.string().optional(),
  'Editorial Term': z.string().optional(),
  'Editorial Reason Code': z.string().optional(),
  'Editorial Appeal Status': z.string().optional(),
  'Display Url': z.string().optional(),
  'Final Url': z.string(),
  'Path 1': z.string().optional(),
  'Path 2': z.string().optional(),
  'Tracking Template': z.string().optional()
});

export const MicrosoftResponsiveSearchAdSchema = z.object({
  'Type': z.literal('Responsive Search Ad'),
  'Status': z.enum(['Active', 'Paused', 'Deleted']),
  'Campaign': z.string(),
  'Ad Group': z.string(),
  'Headline 1': z.string(),
  'Headline 2': z.string(),
  'Headline 3': z.string(),
  'Headline 4': z.string().optional(),
  'Headline 5': z.string().optional(),
  'Headline 6': z.string().optional(),
  'Headline 7': z.string().optional(),
  'Headline 8': z.string().optional(),
  'Headline 9': z.string().optional(),
  'Headline 10': z.string().optional(),
  'Headline 11': z.string().optional(),
  'Headline 12': z.string().optional(),
  'Headline 13': z.string().optional(),
  'Headline 14': z.string().optional(),
  'Headline 15': z.string().optional(),
  'Description 1': z.string(),
  'Description 2': z.string(),
  'Description 3': z.string().optional(),
  'Description 4': z.string().optional(),
  'Path 1': z.string().optional(),
  'Path 2': z.string().optional(),
  'Final Url': z.string()
});

export const MicrosoftNegativeKeywordListSchema = z.object({
  'Type': z.literal('Negative Keyword List'),
  'Status': z.enum(['Active', 'Deleted']),
  'Name': z.string(),
  'Description': z.string().optional()
});

export const MicrosoftCampaignNegativeKeywordSchema = z.object({
  'Type': z.literal('Campaign Negative Keyword'),
  'Status': z.enum(['Active', 'Deleted']),
  'Campaign': z.string(),
  'Keyword': z.string(),
  'Match Type': z.enum(['Exact', 'Phrase'])
});

// Type exports
export type MicrosoftCampaign = z.infer<typeof MicrosoftCampaignSchema>;
export type MicrosoftAdGroup = z.infer<typeof MicrosoftAdGroupSchema>;
export type MicrosoftKeyword = z.infer<typeof MicrosoftKeywordSchema>;
export type MicrosoftExpandedTextAd = z.infer<typeof MicrosoftExpandedTextAdSchema>;
export type MicrosoftResponsiveSearchAd = z.infer<typeof MicrosoftResponsiveSearchAdSchema>;
export type MicrosoftNegativeKeywordList = z.infer<typeof MicrosoftNegativeKeywordListSchema>;
export type MicrosoftCampaignNegativeKeyword = z.infer<typeof MicrosoftCampaignNegativeKeywordSchema>;

// Google to Microsoft format translator
export class GoogleToMicrosoftTranslator {
  /**
   * Translate Google Ads campaign to Microsoft format
   */
  translateCampaign(googleCampaign: any): MicrosoftCampaign {
    return {
      'Type': 'Campaign',
      'Status': this.translateStatus(googleCampaign.status),
      'Campaign': googleCampaign.name,
      'Time Zone': 'AUS Eastern Standard Time',
      'Budget': googleCampaign.budget ? Number(googleCampaign.budget.amountMicros) / 1000000 : 10,
      'Budget Type': 'DailyBudgetStandard',
      'Campaign Type': 'Search',
      'Location': googleCampaign.targetLocations?.join(';'),
      'Language': 'English',
      'Bid Strategy Type': this.translateBiddingStrategy(googleCampaign.biddingStrategy),
      'Start Date': googleCampaign.startDate,
      'End Date': googleCampaign.endDate
    };
  }

  /**
   * Translate Google Ads ad group to Microsoft format
   */
  translateAdGroup(googleAdGroup: any, campaignName: string): MicrosoftAdGroup {
    return {
      'Type': 'Ad Group',
      'Status': this.translateStatus(googleAdGroup.status),
      'Campaign': campaignName,
      'Ad Group': googleAdGroup.name,
      'Network Distribution': 'SearchOnly',
      'Search Bid': googleAdGroup.cpcBidMicros ? Number(googleAdGroup.cpcBidMicros) / 1000000 : 1,
      'Language': 'English',
      'Cpc Bid': googleAdGroup.cpcBidMicros ? Number(googleAdGroup.cpcBidMicros) / 1000000 : 1
    };
  }

  /**
   * Translate Google Ads keyword to Microsoft format
   */
  translateKeyword(googleKeyword: any, campaignName: string, adGroupName: string): MicrosoftKeyword {
    return {
      'Type': 'Keyword',
      'Status': this.translateStatus(googleKeyword.status),
      'Campaign': campaignName,
      'Ad Group': adGroupName,
      'Keyword': googleKeyword.text || googleKeyword.keyword,
      'Match Type': this.translateMatchType(googleKeyword.matchType),
      'Bid': googleKeyword.cpcBidMicros ? Number(googleKeyword.cpcBidMicros) / 1000000 : undefined,
      'Final Url': googleKeyword.finalUrls?.[0]
    };
  }

  /**
   * Translate Google Ads responsive search ad to Microsoft format
   */
  translateResponsiveSearchAd(googleAd: any, campaignName: string, adGroupName: string): MicrosoftResponsiveSearchAd {
    const headlines = googleAd.headlines || [];
    const descriptions = googleAd.descriptions || [];
    
    const microsoftAd: MicrosoftResponsiveSearchAd = {
      'Type': 'Responsive Search Ad',
      'Status': this.translateStatus(googleAd.status),
      'Campaign': campaignName,
      'Ad Group': adGroupName,
      'Headline 1': headlines[0]?.text || 'Best Chrome Extension',
      'Headline 2': headlines[1]?.text || 'Download Now',
      'Headline 3': headlines[2]?.text || 'Free & Easy',
      'Description 1': descriptions[0]?.text || 'Enhance your browsing experience',
      'Description 2': descriptions[1]?.text || 'Trusted by thousands',
      'Path 1': googleAd.path1,
      'Path 2': googleAd.path2,
      'Final Url': googleAd.finalUrls?.[0] || 'https://example.com'
    };

    // Add optional headlines
    for (let i = 3; i < Math.min(15, headlines.length); i++) {
      const key = `Headline ${i + 1}` as keyof MicrosoftResponsiveSearchAd;
      (microsoftAd as any)[key] = headlines[i].text;
    }

    // Add optional descriptions
    for (let i = 2; i < Math.min(4, descriptions.length); i++) {
      const key = `Description ${i + 1}` as keyof MicrosoftResponsiveSearchAd;
      (microsoftAd as any)[key] = descriptions[i].text;
    }

    return microsoftAd;
  }

  /**
   * Translate status from Google to Microsoft format
   */
  private translateStatus(googleStatus?: string): 'Active' | 'Paused' | 'Deleted' {
    switch (googleStatus?.toUpperCase()) {
      case 'ENABLED':
        return 'Active';
      case 'PAUSED':
        return 'Paused';
      case 'REMOVED':
        return 'Deleted';
      default:
        return 'Paused';
    }
  }

  /**
   * Translate match type from Google to Microsoft format
   */
  private translateMatchType(googleMatchType?: string): 'Exact' | 'Phrase' | 'Broad' {
    switch (googleMatchType?.toUpperCase()) {
      case 'EXACT':
        return 'Exact';
      case 'PHRASE':
        return 'Phrase';
      case 'BROAD':
        return 'Broad';
      default:
        return 'Broad';
    }
  }

  /**
   * Translate bidding strategy
   */
  private translateBiddingStrategy(googleStrategy?: string): string {
    switch (googleStrategy) {
      case 'MAXIMIZE_CONVERSIONS':
        return 'MaxConversions';
      case 'TARGET_CPA':
        return 'TargetCpa';
      case 'TARGET_ROAS':
        return 'TargetRoas';
      case 'MAXIMIZE_CLICKS':
        return 'MaxClicks';
      default:
        return 'ManualCpc';
    }
  }
}

// Main Microsoft Ads CSV writer
export class MicrosoftAdsCSVWriter {
  private translator: GoogleToMicrosoftTranslator;

  constructor() {
    this.translator = new GoogleToMicrosoftTranslator();
  }

  /**
   * Export campaigns to Microsoft Ads bulk import CSV
   */
  async exportBulkCsv(
    campaigns: any[],
    outputPath?: string
  ): Promise<string> {
    logger.info(`Generating Microsoft Ads bulk import CSV for ${campaigns.length} campaigns`);

    const bulkData: any[] = [];
    
    // Process each campaign
    for (const campaign of campaigns) {
      // Add campaign row
      const microsoftCampaign = this.translator.translateCampaign(campaign);
      bulkData.push(microsoftCampaign);

      // Process ad groups
      const adGroups = campaign.adGroups || [];
      for (const adGroup of adGroups) {
        // Add ad group row
        const microsoftAdGroup = this.translator.translateAdGroup(adGroup, microsoftCampaign.Campaign);
        bulkData.push(microsoftAdGroup);

        // Process keywords
        const keywords = adGroup.keywords || [];
        for (const keyword of keywords) {
          const microsoftKeyword = this.translator.translateKeyword(
            keyword,
            microsoftCampaign.Campaign,
            microsoftAdGroup['Ad Group']
          );
          bulkData.push(microsoftKeyword);
        }

        // Process ads
        const ads = adGroup.ads || [];
        for (const ad of ads) {
          const microsoftAd = this.translator.translateResponsiveSearchAd(
            ad,
            microsoftCampaign.Campaign,
            microsoftAdGroup['Ad Group']
          );
          bulkData.push(microsoftAd);
        }

        // Add negative keywords for this ad group
        const negativeKeywords = adGroup.negativeKeywords || [];
        for (const negKeyword of negativeKeywords) {
          bulkData.push({
            'Type': 'Ad Group Negative Keyword',
            'Status': 'Active',
            'Campaign': microsoftCampaign.Campaign,
            'Ad Group': microsoftAdGroup['Ad Group'],
            'Keyword': negKeyword.text || negKeyword,
            'Match Type': this.translator['translateMatchType'](negKeyword.matchType)
          });
        }
      }

      // Add campaign-level negative keywords
      const campaignNegatives = campaign.negativeKeywords || [];
      for (const negKeyword of campaignNegatives) {
        const microsoftNegative: MicrosoftCampaignNegativeKeyword = {
          'Type': 'Campaign Negative Keyword',
          'Status': 'Active',
          'Campaign': microsoftCampaign.Campaign,
          'Keyword': negKeyword.text || negKeyword,
          'Match Type': this.translator['translateMatchType'](negKeyword.matchType) as 'Exact' | 'Phrase'
        };
        bulkData.push(microsoftNegative);
      }
    }

    // Generate CSV
    const csv = this.generateCSV(bulkData);

    // Write to file if path provided
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, csv);
      logger.info(`Microsoft Ads bulk CSV written to ${outputPath}`);
    }

    return csv;
  }

  /**
   * Generate CSV from bulk data
   */
  private generateCSV(bulkData: any[]): string {
    if (bulkData.length === 0) {
      return '';
    }

    // Get all unique columns across all row types
    const allColumns = new Set<string>();
    for (const row of bulkData) {
      Object.keys(row).forEach(key => allColumns.add(key));
    }

    // Sort columns with Type first
    const columns = Array.from(allColumns).sort((a, b) => {
      if (a === 'Type') return -1;
      if (b === 'Type') return 1;
      return a.localeCompare(b);
    });

    // Create CSV rows
    const csvRows: any[] = [];
    
    // Add header row
    csvRows.push(columns);

    // Add data rows
    for (const row of bulkData) {
      const csvRow = columns.map(col => {
        const value = row[col];
        if (value === undefined || value === null) {
          return '';
        }
        // Escape values containing commas or quotes
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(csvRow);
    }

    // Join rows
    return csvRows.map(row => row.join(',')).join('\n');
  }

  /**
   * Generate Microsoft Ads campaign structure from opportunities
   */
  async generateFromOpportunities(
    product: string,
    market: string,
    options?: { 
      includeNegatives?: boolean;
      maxCampaigns?: number;
      budgetMultiplier?: number;
    }
  ): Promise<any[]> {
    logger.info(`Generating Microsoft Ads campaigns from opportunities for ${product} in ${market}`);

    // Get opportunities from orchestrator
    const analysis = await this.orchestrator.generateStrategicIntelligence({ 
      product, 
      market 
    });

    const campaigns: any[] = [];
    const maxCampaigns = options?.maxCampaigns || 5;
    const budgetMultiplier = options?.budgetMultiplier || 1;

    // Create campaigns from opportunities
    const opportunities = analysis.opportunities?.slice(0, maxCampaigns) || [];
    
    for (const opportunity of opportunities) {
      const campaign = {
        name: `${product} - ${opportunity.title}`,
        status: 'PAUSED',
        budget: {
          amountMicros: String(Math.round(opportunity.estimatedBudget * budgetMultiplier * 1000000))
        },
        biddingStrategy: 'MAXIMIZE_CONVERSIONS',
        targetLocations: [market],
        adGroups: []
      };

      // Create ad groups from keywords
      const adGroupMap = new Map<string, any>();
      
      for (const keyword of opportunity.keywords || []) {
        const theme = keyword.theme || 'General';
        
        if (!adGroupMap.has(theme)) {
          adGroupMap.set(theme, {
            name: `${theme} Keywords`,
            status: 'PAUSED',
            cpcBidMicros: String(Math.round((keyword.suggestedBid || 1) * 1000000)),
            keywords: [],
            ads: []
          });
        }

        const adGroup = adGroupMap.get(theme);
        adGroup.keywords.push({
          text: keyword.keyword,
          matchType: keyword.matchType || 'PHRASE',
          cpcBidMicros: String(Math.round((keyword.suggestedBid || 1) * 1000000))
        });
      }

      // Add ads to each ad group
      for (const adGroup of adGroupMap.values()) {
        // Create responsive search ad
        adGroup.ads.push({
          status: 'ENABLED',
          headlines: [
            { text: `Best ${product} Extension` },
            { text: 'Download Now - Free' },
            { text: 'Enhance Your Browser' },
            { text: `${product} for Chrome` },
            { text: 'Easy Installation' },
            { text: 'Trusted by Thousands' }
          ],
          descriptions: [
            { text: `Transform your browsing experience with ${product}` },
            { text: 'Free Chrome extension with premium features' },
            { text: 'Install in seconds, use forever' },
            { text: 'Join thousands of satisfied users' }
          ],
          path1: 'chrome',
          path2: 'extension',
          finalUrls: [`https://chrome.google.com/webstore/detail/${product}`]
        });

        campaign.adGroups.push(adGroup);
      }

      // Add negative keywords if requested
      if (options?.includeNegatives) {
        campaign.negativeKeywords = this.getProductNegatives(product);
      }

      campaigns.push(campaign);
    }

    return campaigns;
  }

  /**
   * Get product-specific negative keywords
   */
  private getProductNegatives(product: string): any[] {
    const negatives = {
      'convert-my-file': ['virus', 'crack', 'torrent', 'free converter'],
      'palette-kit': ['photoshop', 'illustrator', 'free color picker'],
      'notebridge': ['evernote', 'onenote', 'notion'],
      'default': ['free', 'crack', 'illegal', 'torrent']
    };

    const productNegatives = negatives[product as keyof typeof negatives] || negatives.default;
    
    return productNegatives.map(neg => ({
      text: neg,
      matchType: neg.split(' ').length > 1 ? 'PHRASE' : 'EXACT'
    }));
  }

  /**
   * Validate bulk CSV format
   */
  validateBulkFormat(csv: string): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[];
    stats: {
      campaigns: number;
      adGroups: number;
      keywords: number;
      ads: number;
    }
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const stats = {
      campaigns: 0,
      adGroups: 0,
      keywords: 0,
      ads: 0
    };

    try {
      const lines = csv.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        errors.push('CSV must have header row and at least one data row');
        return { valid: false, errors, warnings, stats };
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      if (!headers.includes('Type')) {
        errors.push('CSV must have a "Type" column');
        return { valid: false, errors, warnings, stats };
      }

      const typeIndex = headers.indexOf('Type');
      const campaignNames = new Set<string>();
      const adGroupNames = new Set<string>();

      // Validate each row
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const rowType = values[typeIndex];

        switch (rowType) {
          case 'Campaign':
            stats.campaigns++;
            const campaignIndex = headers.indexOf('Campaign');
            if (campaignIndex >= 0 && values[campaignIndex]) {
              campaignNames.add(values[campaignIndex]);
            } else {
              errors.push(`Row ${i + 1}: Campaign missing name`);
            }
            break;
            
          case 'Ad Group':
            stats.adGroups++;
            const adGroupIndex = headers.indexOf('Ad Group');
            const adGroupCampaignIndex = headers.indexOf('Campaign');
            if (adGroupIndex >= 0 && values[adGroupIndex]) {
              adGroupNames.add(values[adGroupIndex]);
            } else {
              errors.push(`Row ${i + 1}: Ad Group missing name`);
            }
            if (adGroupCampaignIndex >= 0 && !campaignNames.has(values[adGroupCampaignIndex])) {
              warnings.push(`Row ${i + 1}: Ad Group references unknown campaign`);
            }
            break;
            
          case 'Keyword':
            stats.keywords++;
            const keywordIndex = headers.indexOf('Keyword');
            if (!values[keywordIndex]) {
              errors.push(`Row ${i + 1}: Keyword missing text`);
            }
            break;
            
          case 'Responsive Search Ad':
          case 'Expanded Text Ad':
            stats.ads++;
            const finalUrlIndex = headers.indexOf('Final Url');
            if (!values[finalUrlIndex]) {
              warnings.push(`Row ${i + 1}: Ad missing Final Url`);
            }
            break;
        }
      }

      if (stats.campaigns === 0) {
        warnings.push('No campaigns found in CSV');
      }
      if (stats.adGroups === 0) {
        warnings.push('No ad groups found in CSV');
      }
      if (stats.keywords === 0) {
        warnings.push('No keywords found in CSV');
      }

    } catch (error) {
      errors.push(`CSV parsing error: ${error}`);
    }

    return { 
      valid: errors.length === 0, 
      errors, 
      warnings,
      stats
    };
  }

  /**
   * Parse CSV line handling quotes and commas
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }
}