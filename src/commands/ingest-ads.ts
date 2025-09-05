/**
 * Ingest Ads Command - v1.4
 * Imports Google Ads performance data from GAQL or CSV
 */

import { logger } from '../utils/logger.js';
import { GoogleAdsPerformanceConnector } from '../connectors/google-ads-performance.js';
import { DatabaseConnectionPool } from '../database/json-db.js';
import path from 'path';
import fs from 'fs/promises';

interface IngestOptions {
  product: string;
  source: 'gaql' | 'csv';
  filePath?: string;
  dateRange: {
    start: string;
    end: string;
  };
  batchSize: number;
}

export async function ingestPerformanceData(options: IngestOptions): Promise<void> {
  logger.info('Starting performance data ingestion', options);

  // Initialize database
  const db = new DatabaseConnectionPool();
  await db.initialize();

  // Create connector
  const connector = new GoogleAdsPerformanceConnector(
    process.env.GOOGLE_ADS_CUSTOMER_ID || ''
  );

  try {
    let searchTerms;
    let qualityScores;

    if (options.source === 'csv') {
      // Check for CSV files
      const csvAvailability = await connector.checkCSVAvailability(options.product);
      
      if (options.filePath) {
        // Use provided file path
        console.log(`📂 Loading from: ${options.filePath}`);
        searchTerms = await connector.importSearchTermsCSV(options.filePath);
        
        // Try to find quality score CSV in same directory
        const dir = path.dirname(options.filePath);
        const files = await fs.readdir(dir);
        const qsFile = files.find(f => f.includes('quality') && f.endsWith('.csv'));
        if (qsFile) {
          qualityScores = await connector.importQualityScoreCSV(path.join(dir, qsFile));
        } else {
          qualityScores = [];
        }
      } else if (csvAvailability.searchTermsCSV) {
        // Use auto-discovered CSVs
        console.log(`📂 Found CSV files for ${options.product}`);
        searchTerms = await connector.importSearchTermsCSV(csvAvailability.searchTermsCSV);
        
        if (csvAvailability.qualityScoreCSV) {
          qualityScores = await connector.importQualityScoreCSV(csvAvailability.qualityScoreCSV);
        } else {
          qualityScores = [];
        }
      } else {
        throw new Error(`No CSV files found for ${options.product}. Please provide --file parameter or place CSVs in inputs/google_ads/${options.product}/`);
      }
    } else {
      // GAQL mode
      console.log('🔄 Fetching data via Google Ads API...');
      const data = await connector.fetchAllPerformanceData(options.dateRange);
      searchTerms = data.searchTerms;
      qualityScores = data.qualityScores;
    }

    // Store search terms in database
    console.log(`💾 Storing ${searchTerms.length} search terms...`);
    const searchTermsInserted = await db.batchInsert(
      'searchTerms',
      searchTerms.map(term => ({
        date: term.date,
        engine: term.engine,
        campaign_id: term.campaignId,
        ad_group_id: term.adGroupId,
        query: term.query,
        match_type: term.matchType,
        clicks: term.clicks,
        impressions: term.impressions,
        cost: term.cost,
        conversions: term.conversions,
        conv_value: term.conversionValue
      })),
      options.batchSize
    );

    // Store quality scores
    if (qualityScores.length > 0) {
      console.log(`💾 Storing ${qualityScores.length} quality score records...`);
      const qsInserted = await db.batchInsert(
        'qualityScores',
        qualityScores.map(qs => ({
          date: qs.date,
          campaign_id: qs.campaignId,
          ad_group_id: qs.adGroupId,
          keyword: qs.keyword,
          expected_ctr: qs.expectedCtr,
          ad_relevance: qs.adRelevance,
          lp_experience: qs.landingPageExperience,
          quality_score: qs.qualityScore
        })),
        options.batchSize
      );
    }

    // Generate summary
    const summary = {
      product: options.product,
      source: options.source,
      searchTermsCount: searchTerms.length,
      qualityScoresCount: qualityScores.length,
      dateRange: options.dateRange,
      totalSpend: searchTerms.reduce((sum, t) => sum + t.cost, 0),
      totalClicks: searchTerms.reduce((sum, t) => sum + t.clicks, 0),
      totalConversions: searchTerms.reduce((sum, t) => sum + t.conversions, 0),
      timestamp: new Date().toISOString()
    };

    // Save summary
    const outputDir = path.join(process.cwd(), 'performance', options.product, 'ingestion');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, `summary_${new Date().toISOString().split('T')[0]}.json`),
      JSON.stringify(summary, null, 2)
    );

    logger.info('Performance data ingestion complete', summary);

  } finally {
    await db.close();
  }
}