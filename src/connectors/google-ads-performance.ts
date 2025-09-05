/**
 * Google Ads Performance Connector - v1.4
 * Fetches search term performance data and Quality Score metrics
 */

import { google } from 'googleapis';
import { logger } from '../utils/logger.js';
import { cache } from '../cache/manager.js';
import type { SearchTermData, QualityScoreData, DateRange } from './types.js';
import { parse } from 'csv-parse/sync';
import fs from 'fs/promises';
import path from 'path';

export class GoogleAdsPerformanceConnector {
  private customerId: string;
  private readonly cachePrefix = 'google_ads_perf';
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(customerId: string) {
    this.customerId = customerId.replace(/-/g, ''); // Remove dashes from customer ID
  }

  /**
   * Fetch search terms via GAQL (primary method)
   */
  async fetchSearchTerms(dateRange: DateRange): Promise<SearchTermData[]> {
    const cacheKey = `${this.cachePrefix}_search_terms_${this.customerId}_${dateRange.start}_${dateRange.end}`;
    const cached = await cache.get<SearchTermData[]>(cacheKey);
    if (cached) return cached;

    try {
      const query = `
        SELECT 
          search_term_view.search_term,
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group.name,
          metrics.clicks,
          metrics.impressions,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          search_term_view.status
        FROM search_term_view
        WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
          AND search_term_view.status != 'REMOVED'
        ORDER BY metrics.cost_micros DESC
        LIMIT 10000
      `;

      logger.info('Fetching search terms via GAQL', { 
        customerId: this.customerId,
        dateRange 
      });

      // TODO: Integrate with actual Google Ads API when credentials are ready
      // For now, return empty array to allow CSV fallback
      const results: SearchTermData[] = [];
      
      await cache.set(cacheKey, results, this.cacheTTL);
      return results;
    } catch (error) {
      logger.error('Failed to fetch search terms via GAQL', error);
      throw error;
    }
  }

  /**
   * Import search terms from CSV export (fallback method)
   */
  async importSearchTermsCSV(filePath: string): Promise<SearchTermData[]> {
    try {
      const csvContent = await fs.readFile(filePath, 'utf-8');
      
      // Parse CSV with headers
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
        cast_date: false
      });

      // Map CSV columns to our data structure
      const searchTerms: SearchTermData[] = records.map((row: any) => ({
        date: row['Day'] || new Date().toISOString().split('T')[0],
        engine: 'google',
        campaignId: row['Campaign ID'] || row['Campaign'],
        campaignName: row['Campaign'] || '',
        adGroupId: row['Ad group ID'] || row['Ad group'],
        adGroupName: row['Ad group'] || '',
        query: row['Search term'] || row['Query'],
        matchType: row['Match type'] || 'UNKNOWN',
        clicks: parseInt(row['Clicks'] || '0'),
        impressions: parseInt(row['Impressions'] || '0'),
        cost: parseFloat(row['Cost'] || '0'),
        conversions: parseFloat(row['Conversions'] || '0'),
        conversionValue: parseFloat(row['Conv. value'] || '0'),
        ctr: parseFloat(row['CTR']?.replace('%', '') || '0') / 100,
        avgCpc: parseFloat(row['Avg. CPC'] || '0'),
        conversionRate: parseFloat(row['Conv. rate']?.replace('%', '') || '0') / 100
      }));

      logger.info(`Imported ${searchTerms.length} search terms from CSV`, {
        filePath,
        sampleSize: Math.min(5, searchTerms.length)
      });

      return searchTerms;
    } catch (error) {
      logger.error('Failed to import search terms CSV', error);
      throw error;
    }
  }

  /**
   * Fetch Quality Score data via GAQL
   */
  async fetchQualityScores(): Promise<QualityScoreData[]> {
    const cacheKey = `${this.cachePrefix}_quality_scores_${this.customerId}`;
    const cached = await cache.get<QualityScoreData[]>(cacheKey);
    if (cached) return cached;

    try {
      const query = `
        SELECT 
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group.name,
          ad_group_criterion.keyword.text,
          ad_group_criterion.quality_info.quality_score,
          ad_group_criterion.quality_info.creative_quality_score,
          ad_group_criterion.quality_info.post_click_quality_score,
          ad_group_criterion.quality_info.search_predicted_ctr,
          ad_group_criterion.status
        FROM ad_group_criterion
        WHERE ad_group_criterion.type = 'KEYWORD'
          AND ad_group_criterion.status = 'ENABLED'
        ORDER BY ad_group_criterion.quality_info.quality_score ASC
        LIMIT 5000
      `;

      logger.info('Fetching Quality Scores via GAQL', { 
        customerId: this.customerId 
      });

      // TODO: Integrate with actual Google Ads API when credentials are ready
      const results: QualityScoreData[] = [];
      
      await cache.set(cacheKey, results, this.cacheTTL);
      return results;
    } catch (error) {
      logger.error('Failed to fetch Quality Scores', error);
      throw error;
    }
  }

  /**
   * Import Quality Score data from CSV export
   */
  async importQualityScoreCSV(filePath: string): Promise<QualityScoreData[]> {
    try {
      const csvContent = await fs.readFile(filePath, 'utf-8');
      
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true
      });

      const qualityScores: QualityScoreData[] = records.map((row: any) => ({
        date: new Date().toISOString().split('T')[0],
        campaignId: row['Campaign ID'] || row['Campaign'],
        campaignName: row['Campaign'] || '',
        adGroupId: row['Ad group ID'] || row['Ad group'],
        adGroupName: row['Ad group'] || '',
        keyword: row['Keyword'] || '',
        qualityScore: parseInt(row['Quality score'] || '0'),
        expectedCtr: this.mapQSComponent(row['Expected CTR']),
        adRelevance: this.mapQSComponent(row['Ad relevance']),
        landingPageExperience: this.mapQSComponent(row['Landing page experience']),
        historicalQualityScore: parseInt(row['Historical Quality Score'] || '0')
      }));

      logger.info(`Imported ${qualityScores.length} Quality Score records from CSV`, {
        filePath
      });

      return qualityScores;
    } catch (error) {
      logger.error('Failed to import Quality Score CSV', error);
      throw error;
    }
  }

  /**
   * Map Quality Score component strings to numeric values
   */
  private mapQSComponent(value: string | undefined): number {
    if (!value) return 0;
    const normalized = value.toLowerCase().trim();
    
    if (normalized.includes('above') || normalized.includes('great')) return 10;
    if (normalized.includes('average')) return 5;
    if (normalized.includes('below') || normalized.includes('poor')) return 2;
    
    // Try to parse as number if it's already numeric
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Fetch both search terms and quality scores
   */
  async fetchAllPerformanceData(dateRange: DateRange): Promise<{
    searchTerms: SearchTermData[];
    qualityScores: QualityScoreData[];
  }> {
    const [searchTerms, qualityScores] = await Promise.all([
      this.fetchSearchTerms(dateRange),
      this.fetchQualityScores()
    ]);

    return { searchTerms, qualityScores };
  }

  /**
   * Check if CSV imports are available as fallback
   */
  async checkCSVAvailability(product: string): Promise<{
    searchTermsCSV: string | null;
    qualityScoreCSV: string | null;
  }> {
    const baseDir = path.join(process.cwd(), 'inputs', 'google_ads', product);
    
    try {
      const files = await fs.readdir(baseDir);
      
      const searchTermsCSV = files.find(f => 
        f.includes('search') && f.endsWith('.csv')
      );
      
      const qualityScoreCSV = files.find(f => 
        f.includes('quality') && f.endsWith('.csv')
      );

      return {
        searchTermsCSV: searchTermsCSV ? path.join(baseDir, searchTermsCSV) : null,
        qualityScoreCSV: qualityScoreCSV ? path.join(baseDir, qualityScoreCSV) : null
      };
    } catch (error) {
      logger.debug('No CSV files available for fallback', { product });
      return { searchTermsCSV: null, qualityScoreCSV: null };
    }
  }
}

// Extended types for v1.4
export interface SearchTermData {
  date: string;
  engine: 'google';
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  query: string;
  matchType: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  conversionValue: number;
  ctr?: number;
  avgCpc?: number;
  conversionRate?: number;
}

export interface QualityScoreData {
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  keyword: string;
  qualityScore: number;
  expectedCtr: number;
  adRelevance: number;
  landingPageExperience: number;
  historicalQualityScore?: number;
}

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}