/**
 * Negatives CSV Writer - v1.4
 * Generates Google Ads Editor compatible CSV and API JSON
 */

import { stringify } from 'csv-stringify/sync';
import type { NegativeKeyword } from '../analyzers/ngram-engine.js';

export class NegativesCsvWriter {
  /**
   * Generate Google Ads Editor compatible CSV
   */
  generateEditorCSV(negatives: NegativeKeyword[]): string {
    // Google Ads Editor format for negative keywords
    const records = negatives.map(neg => ({
      'Campaign': this.getCampaignName(neg),
      'Ad group': this.getAdGroupName(neg),
      'Keyword': this.formatKeywordForEditor(neg),
      'Criterion Type': 'Negative Keyword',
      'Campaign Status': 'Enabled',
      'Ad group Status': neg.placementLevel === 'ad_group' ? 'Enabled' : '',
      'Status': 'Enabled',
      'Match Type': this.mapMatchType(neg.matchType),
      'Comment': neg.reason
    }));

    return stringify(records, {
      header: true,
      columns: [
        'Campaign',
        'Ad group',
        'Keyword',
        'Criterion Type',
        'Campaign Status',
        'Ad group Status',
        'Status',
        'Match Type',
        'Comment'
      ]
    });
  }

  /**
   * Generate API-ready JSON format
   */
  generateAPIJson(negatives: NegativeKeyword[]): object {
    // Group by placement level for easier API application
    const grouped = {
      sharedSets: [] as any[],
      campaignNegatives: [] as any[],
      adGroupNegatives: [] as any[]
    };

    for (const neg of negatives) {
      const apiFormat = {
        keyword: {
          text: neg.keyword,
          matchType: neg.matchType
        },
        metadata: {
          reason: neg.reason,
          wasteAmount: neg.wasteAmount,
          confidence: neg.confidence,
          createdAt: new Date().toISOString(),
          createdBy: 'seo-ads-expert-v1.4'
        }
      };

      switch (neg.placementLevel) {
        case 'shared':
          grouped.sharedSets.push({
            ...apiFormat,
            sharedSetName: 'Non-Intent Terms'
          });
          break;
          
        case 'campaign':
          grouped.campaignNegatives.push({
            ...apiFormat,
            campaignId: 'PLACEHOLDER_CAMPAIGN_ID' // Would be replaced with actual IDs
          });
          break;
          
        case 'ad_group':
          grouped.adGroupNegatives.push({
            ...apiFormat,
            campaignId: 'PLACEHOLDER_CAMPAIGN_ID',
            adGroupId: 'PLACEHOLDER_ADGROUP_ID'
          });
          break;
      }
    }

    return {
      version: '1.4',
      generatedAt: new Date().toISOString(),
      totalNegatives: negatives.length,
      estimatedSavings: negatives.reduce((sum, neg) => sum + neg.wasteAmount, 0),
      negativeKeywords: grouped,
      applicationInstructions: {
        shared: 'Create or update shared negative list named "Non-Intent Terms"',
        campaign: 'Apply to all campaigns for the product',
        adGroup: 'Apply to specific ad groups based on relevance'
      }
    };
  }

  /**
   * Generate simple text list for manual application
   */
  generateTextList(negatives: NegativeKeyword[]): string {
    const lines: string[] = [];
    
    // Group by placement level
    const byLevel: { [key: string]: NegativeKeyword[] } = {};
    for (const neg of negatives) {
      if (!byLevel[neg.placementLevel]) byLevel[neg.placementLevel] = [];
      byLevel[neg.placementLevel].push(neg);
    }

    // Shared list
    if (byLevel.shared && byLevel.shared.length > 0) {
      lines.push('# Shared Negative List');
      lines.push('# Add these to a shared list across all campaigns');
      for (const neg of byLevel.shared) {
        lines.push(this.formatKeywordForText(neg));
      }
      lines.push('');
    }

    // Campaign level
    if (byLevel.campaign && byLevel.campaign.length > 0) {
      lines.push('# Campaign Level Negatives');
      lines.push('# Add these at the campaign level');
      for (const neg of byLevel.campaign) {
        lines.push(this.formatKeywordForText(neg));
      }
      lines.push('');
    }

    // Ad group level
    if (byLevel.ad_group && byLevel.ad_group.length > 0) {
      lines.push('# Ad Group Level Negatives');
      lines.push('# Add these to specific ad groups');
      for (const neg of byLevel.ad_group) {
        lines.push(`${this.formatKeywordForText(neg)} # ${neg.reason}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get campaign name for Editor CSV
   */
  private getCampaignName(neg: NegativeKeyword): string {
    if (neg.placementLevel === 'shared') {
      return ''; // Shared lists don't have campaigns
    }
    return 'All Campaigns'; // Placeholder - would be replaced with actual campaign names
  }

  /**
   * Get ad group name for Editor CSV
   */
  private getAdGroupName(neg: NegativeKeyword): string {
    if (neg.placementLevel !== 'ad_group') {
      return '';
    }
    return 'All Ad Groups'; // Placeholder - would be replaced with actual ad group names
  }

  /**
   * Format keyword for Google Ads Editor
   */
  private formatKeywordForEditor(neg: NegativeKeyword): string {
    // Editor expects keywords without match type symbols
    return neg.keyword;
  }

  /**
   * Format keyword for text display
   */
  private formatKeywordForText(neg: NegativeKeyword): string {
    switch (neg.matchType) {
      case 'EXACT':
        return `[${neg.keyword}]`;
      case 'PHRASE':
        return `"${neg.keyword}"`;
      case 'BROAD':
        return `+${neg.keyword.split(' ').join(' +')}`;
      default:
        return neg.keyword;
    }
  }

  /**
   * Map internal match type to Google Ads Editor format
   */
  private mapMatchType(matchType: string): string {
    switch (matchType) {
      case 'EXACT':
        return 'Exact';
      case 'PHRASE':
        return 'Phrase';
      case 'BROAD':
        return 'Broad';
      default:
        return 'Phrase'; // Default to phrase for safety
    }
  }
}