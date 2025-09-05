/**
 * Analyze Waste Command - v1.4
 * Identifies wasted spend and proposes negative keywords
 */

import { logger } from '../utils/logger.js';
import { DatabaseConnectionPool } from '../database/json-db.js';
import { NgramEngine } from '../analyzers/ngram-engine.js';
import { WasteReportWriter } from '../writers/waste-report-writer.js';
import { NegativesCsvWriter } from '../writers/negatives-csv-writer.js';
import type { SearchTermData } from '../connectors/google-ads-performance.js';
import * as path from 'path';
import * as fs from 'fs/promises';

interface AnalyzeWasteOptions {
  product: string;
  windowDays: number;
  minSpend: number;
  minImpressions: number;
  memoryLimit: number;
}

interface AnalyzeWasteResult {
  totalWaste: number;
  negativesCount: number;
  outputPath: string;
}

export async function analyzeWaste(options: AnalyzeWasteOptions): Promise<AnalyzeWasteResult> {
  logger.info('Starting waste analysis', options);

  // Initialize database
  const db = new DatabaseConnectionPool();
  await db.initialize();

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - options.windowDays * 24 * 60 * 60 * 1000);
    const dateRange = {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };

    console.log(`📅 Analyzing period: ${dateRange.start} to ${dateRange.end}`);

    // Fetch search terms from database
    console.log('📊 Loading search term data...');
    // For JSON database, fetch and filter manually
    const allSearchTerms = await db.query<any>('searchTerms');
    
    // Filter by date range and aggregate
    const aggregated = new Map<string, SearchTermData>();
    
    for (const term of allSearchTerms) {
      if (term.date >= dateRange.start && term.date <= dateRange.end && term.engine === 'google') {
        const key = `${term.query}_${term.campaignId}_${term.adGroupId}`;
        
        if (!aggregated.has(key)) {
          aggregated.set(key, {
            date: term.date,
            engine: 'google',
            campaignId: term.campaignId,
            campaignName: term.campaignName || '',
            adGroupId: term.adGroupId,
            adGroupName: term.adGroupName || '',
            query: term.query,
            matchType: term.matchType,
            clicks: 0,
            impressions: 0,
            cost: 0,
            conversions: 0,
            conversionValue: 0
          } as SearchTermData);
        }
        
        const agg = aggregated.get(key)!;
        agg.clicks += term.clicks || 0;
        agg.impressions += term.impressions || 0;
        agg.cost += term.cost || 0;
        agg.conversions += term.conversions || 0;
        agg.conversionValue += term.conv_value || 0;
      }
    }
    
    const searchTerms = Array.from(aggregated.values())
      .filter(term => term.impressions >= options.minImpressions)
      .sort((a, b) => b.cost - a.cost);

    console.log(`📝 Found ${searchTerms.length} search terms to analyze`);

    if (searchTerms.length === 0) {
      throw new Error('No search terms found. Please run "seo-ads performance ingest-ads" first.');
    }

    // Initialize n-gram engine with memory management
    const ngramEngine = new NgramEngine();
    const memoryCheckInterval = Math.floor(searchTerms.length / 10);

    // Process in batches if needed for memory management
    const batchSize = Math.min(5000, Math.floor((options.memoryLimit * 1024 * 1024) / 1000));
    const allWastedTerms = [];

    for (let i = 0; i < searchTerms.length; i += batchSize) {
      const batch = searchTerms.slice(i, i + batchSize);
      
      // Check memory usage
      const memUsage = process.memoryUsage();
      const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      if (memUsageMB > options.memoryLimit * 0.8) {
        logger.warn(`Memory usage high (${memUsageMB}MB), forcing garbage collection`);
        if (global.gc) global.gc();
        await new Promise(resolve => setImmediate(resolve));
      }

      console.log(`🔍 Analyzing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(searchTerms.length / batchSize)}...`);
      
      const wastedTerms = ngramEngine.identifyWastedSpend(batch);
      allWastedTerms.push(...wastedTerms);
    }

    // Generate negative keywords
    console.log('🚫 Generating negative keyword recommendations...');
    const negatives = ngramEngine.generateNegatives(allWastedTerms);

    // Filter by minimum spend threshold
    const significantWaste = allWastedTerms.filter(term => term.wasteAmount >= options.minSpend);
    const totalWaste = significantWaste.reduce((sum, term) => sum + term.wasteAmount, 0);

    // Store proposed negatives in database
    console.log('💾 Saving negative keyword proposals...');
    for (const negative of negatives) {
      await db.insert('proposedNegatives', [{
        id: `${options.product}_${negative.keyword}_${negative.matchType}`,
        proposed_date: new Date().toISOString().split('T')[0],
        keyword: negative.keyword,
        match_type: negative.matchType,
        placement_level: negative.placementLevel,
        reason: negative.reason,
        waste_amount: negative.wasteAmount,
        status: 'proposed'
      }]);
    }

    // Generate reports
    console.log('📄 Generating reports...');
    const outputDir = path.join(process.cwd(), 'performance', options.product, 'waste', dateRange.end);
    await fs.mkdir(outputDir, { recursive: true });

    // Write waste report
    const reportWriter = new WasteReportWriter();
    const wasteReport = reportWriter.generateReport(significantWaste, totalWaste, negatives);
    await fs.writeFile(path.join(outputDir, 'waste_report.md'), wasteReport);

    // Write negatives CSV
    const csvWriter = new NegativesCsvWriter();
    const negativesCSV = csvWriter.generateEditorCSV(negatives);
    await fs.writeFile(path.join(outputDir, 'negatives_proposed.csv'), negativesCSV);

    // Write negatives JSON for API
    const negativesJSON = csvWriter.generateAPIJson(negatives);
    await fs.writeFile(
      path.join(outputDir, 'negatives_proposed.json'),
      JSON.stringify(negativesJSON, null, 2)
    );

    // Generate summary
    const summary = {
      analysisDate: new Date().toISOString(),
      dateRange,
      searchTermsAnalyzed: searchTerms.length,
      ngramsIdentified: allWastedTerms.length,
      totalWaste,
      negativesProposed: negatives.length,
      topWastedTerms: significantWaste.slice(0, 10).map(term => ({
        ngram: term.ngram,
        wasteAmount: term.wasteAmount,
        reason: term.wasteReason,
        impressions: term.impressions,
        clicks: term.clicks
      }))
    };

    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    logger.info('Waste analysis complete', summary);

    return {
      totalWaste,
      negativesCount: negatives.length,
      outputPath: outputDir
    };

  } finally {
    await db.close();
  }
}