import pino from 'pino';
import { format } from 'date-fns';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Import all the components
import { loadProductConfig } from './utils/product-loader.js';
import { CacheManager } from './utils/cache.js';
import { DataPrecedenceEngine, KeywordSources } from './utils/precedence.js';
import { KeywordScoringEngine } from './scoring.js';
import { KeywordClusteringEngine } from './clustering.js';
import { OutputWriterEngine } from './writers.js';
import { GoogleAdsScriptGenerator } from './writers/ads-script.js';
import { UrlHealthChecker } from './validators/url-health.js';
import { generatePlanDiff } from './utils/diff.js';
import { validateProductClaims, ProductClaimsValidation } from './validators/claims.js';

// Import connectors
import { KwpCsvConnector } from './connectors/kwp-csv.js';
import { SearchConsoleConnector } from './connectors/search-console.js';
import { RapidApiKeywordConnector } from './connectors/rapid-keywords.js';
import { RapidApiSerpConnector } from './connectors/rapid-serp.js';

// Import types
import { KeywordData, PlanSummary } from './connectors/types.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface PlanOptions {
  product: string;
  markets: string[];
  maxKeywords: number;
  maxSerpCalls: number;
}

export interface PlanResult {
  summary: PlanSummary;
  outputPaths: string[];
  warnings: string[];
  performance: {
    totalTimeMs: number;
    dataCollectionMs: number;
    processingMs: number;
    outputGenerationMs: number;
  };
}

export class SEOAdsOrchestrator {
  private cacheManager: CacheManager;
  private precedenceEngine: DataPrecedenceEngine;
  private scoringEngine: KeywordScoringEngine;
  private clusteringEngine: KeywordClusteringEngine;
  private writerEngine: OutputWriterEngine;
  private adsScriptGenerator: GoogleAdsScriptGenerator;
  private urlHealthChecker: UrlHealthChecker;

  // Connectors
  private kwpConnector: KwpCsvConnector;
  private gscConnector: SearchConsoleConnector;
  private keywordConnector: RapidApiKeywordConnector;
  private serpConnector: RapidApiSerpConnector;

  constructor() {
    // Initialize all engines
    this.cacheManager = new CacheManager();
    this.precedenceEngine = new DataPrecedenceEngine();
    this.scoringEngine = new KeywordScoringEngine();
    this.clusteringEngine = new KeywordClusteringEngine();
    this.writerEngine = new OutputWriterEngine();
    this.adsScriptGenerator = new GoogleAdsScriptGenerator();
    this.urlHealthChecker = new UrlHealthChecker({
      timeout: 5000,
      checkRobotsTxt: true,
      checkPerformance: true,
      requiredMarkets: ['AU', 'US', 'GB']
    });

    // Initialize connectors
    this.kwpConnector = new KwpCsvConnector();
    this.gscConnector = new SearchConsoleConnector();
    this.keywordConnector = new RapidApiKeywordConnector();
    this.serpConnector = new RapidApiSerpConnector();
  }

  async generatePlan(options: PlanOptions): Promise<PlanResult> {
    const startTime = Date.now();
    let dataCollectionStart = startTime;

    logger.info('🚀 Starting comprehensive SEO & Ads plan generation');
    logger.info(`📋 Product: ${options.product}, Markets: ${options.markets.join(', ')}`);

    try {
      // Step 1: Load product configuration
      console.log('📋 Loading product configuration...');
      const productConfig = loadProductConfig(options.product);
      logger.info(`✅ Product config loaded: ${productConfig.target_pages.length} pages, ${productConfig.seed_queries.length} seed queries`);

      // Step 2: Collect data from all sources
      console.log('📊 Collecting keyword data from all sources...');
      const keywordSources = await this.collectKeywordData(productConfig, options);
      
      const dataCollectionMs = Date.now() - dataCollectionStart;
      const processingStart = Date.now();

      // Step 3: Apply data precedence and merge sources
      console.log('🔄 Applying data precedence and merging sources...');
      const precedenceResult = this.precedenceEngine.mergeKeywordSources(keywordSources);
      logger.info(`✅ Data merged: ${precedenceResult.keywords.length} unique keywords from ${precedenceResult.sourceCounts.kwp + precedenceResult.sourceCounts.gsc + precedenceResult.sourceCounts.estimated} total`);

      // Step 4: Score all keywords
      console.log('🎯 Scoring keywords with enhanced algorithm...');
      const scoringResult = this.scoringEngine.scoreKeywords(precedenceResult.keywords);
      logger.info(`✅ Keywords scored: Average score ${scoringResult.scoringStats.averageScore.toFixed(3)}`);

      // Step 5: Cluster keywords by use case and intent
      console.log('🧩 Clustering keywords by use case and intent...');
      const clusteringResult = this.clusteringEngine.clusterKeywords(
        scoringResult.keywords,
        productConfig,
        { maxClusters: 15, minKeywordsPerCluster: 2 }
      );
      logger.info(`✅ Keywords clustered: ${clusteringResult.clusters.length} ad groups created`);

      // Step 6: Analyze competitors from SERP data
      console.log('🏆 Analyzing competitor landscape...');
      const competitorData = await this.collectCompetitorData(clusteringResult.clusters, options);

      const processingMs = Date.now() - processingStart;
      const outputStart = Date.now();

      // Step 7: Generate all output files
      console.log('📄 Generating marketing plan outputs...');
      const outputPaths = await this.generateOutputs(
        clusteringResult.clusters,
        scoringResult.keywords,
        competitorData,
        productConfig,
        options
      );

      const outputGenerationMs = Date.now() - outputStart;
      const totalTimeMs = Date.now() - startTime;

      // Step 8: Generate comprehensive summary
      const summary = this.generatePlanSummary(
        scoringResult,
        clusteringResult,
        precedenceResult,
        options,
        { totalTimeMs, dataCollectionMs, processingMs, outputGenerationMs }
      );

      // Step 9: Save cache and quota stats
      this.cacheManager.saveQuotaStats();

      const result: PlanResult = {
        summary,
        outputPaths,
        warnings: [
          ...precedenceResult.warnings,
          ...scoringResult.warnings,
          ...clusteringResult.warnings
        ],
        performance: {
          totalTimeMs,
          dataCollectionMs,
          processingMs,
          outputGenerationMs
        }
      };

      logger.info(`🎉 Plan generation completed in ${(totalTimeMs / 1000).toFixed(1)}s`);
      this.logPerformanceStats(result.performance);

      return result;

    } catch (error) {
      logger.error('❌ Plan generation failed:', error);
      throw error;
    }
  }

  private async collectKeywordData(productConfig: any, options: PlanOptions): Promise<KeywordSources> {
    const sources: KeywordSources = {};
    const warnings: string[] = [];

    // Collect KWP CSV data (highest precedence)
    try {
      console.log('  📈 Importing Keyword Planner CSV data...');
      const kwpResult = await this.kwpConnector.importProductData(options.product);
      if (kwpResult.keywords.length > 0) {
        sources.kwp = kwpResult.keywords;
        logger.info(`✅ KWP CSV: ${kwpResult.keywords.length} keywords from ${kwpResult.markets.join(', ')}`);
      } else {
        warnings.push('No KWP CSV data found - add CSV exports to inputs/kwp_csv/ for authoritative data');
        logger.warn('⚠️  No KWP CSV data available');
      }
    } catch (error) {
      logger.warn('⚠️  KWP CSV import failed:', error);
      warnings.push('KWP CSV import failed - will use alternative data sources');
    }

    // Collect Search Console data (medium precedence)
    if (this.gscConnector.isAvailable()) {
      try {
        console.log('  📊 Collecting Search Console organic data...');
        const sites = this.gscConnector.getConfiguredSites();
        if (sites.length > 0) {
          const gscResult = await this.gscConnector.getSearchAnalytics({
            site: sites[0],
            startDate: format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
            endDate: format(new Date(), 'yyyy-MM-dd'),
            markets: options.markets,
            targetPages: productConfig.target_pages.map((p: any) => p.url)
          });
          
          if (gscResult.keywords.length > 0) {
            sources.gsc = gscResult.keywords;
            logger.info(`✅ GSC: ${gscResult.keywords.length} organic queries, ${gscResult.totalClicks} clicks`);
          }
        }
      } catch (error) {
        logger.warn('⚠️  Search Console data collection failed:', error);
        warnings.push('Search Console data unavailable - using estimated data for organic insights');
      }
    } else {
      logger.info('⚠️  Search Console not configured - skipping organic data');
    }

    // Collect RapidAPI keyword expansion data (lowest precedence) 
    if (this.keywordConnector.isConnected()) {
      try {
        console.log('  🔤 Expanding keywords with RapidAPI...');
        
        for (const market of options.markets) {
          const expansionResult = await this.keywordConnector.expandKeywords({
            seedQueries: productConfig.seed_queries.slice(0, 10), // Limit to avoid quota issues
            market: market,
            maxKeywords: Math.floor(options.maxKeywords / options.markets.length)
          });
          
          if (expansionResult.keywords.length > 0) {
            if (!sources.estimated) sources.estimated = [];
            sources.estimated.push(...expansionResult.keywords);
            
            // Record keyword API calls for quota tracking
            for (let i = 0; i < expansionResult.apiCallsMade; i++) {
              this.cacheManager.recordKeywordCall();
            }
          }
        }
        
        if (sources.estimated?.length) {
          logger.info(`✅ Keyword expansion: ${sources.estimated.length} estimated keywords`);
        }
        
      } catch (error) {
        logger.warn('⚠️  RapidAPI keyword expansion failed:', error);
        warnings.push('Keyword expansion failed - using seed queries only');
      }
    }

    // Ensure we have seed queries as fallback
    if (!sources.kwp && !sources.gsc && !sources.estimated) {
      logger.warn('⚠️  No external data sources available, using seed queries as fallback');
      sources.estimated = productConfig.seed_queries.map((query: string) => ({
        keyword: query,
        data_source: 'estimated' as const,
        markets: options.markets,
        intent_score: 1.0,
        final_score: 0,
        recommended_match_type: 'phrase' as const,
        serp_features: []
      }));
    }

    return sources;
  }

  private async collectCompetitorData(clusters: any[], options: PlanOptions): Promise<Map<string, number>> {
    const competitorMap = new Map<string, number>();

    if (!this.serpConnector.isConnected() || !this.cacheManager.canMakeSerpCall()) {
      logger.warn('⚠️  SERP analysis not available - skipping competitor data');
      return competitorMap;
    }

    try {
      // Select top keywords for SERP analysis (limited by quota)
      const keywordsForSerp = clusters
        .flatMap(cluster => cluster.primaryKeywords.slice(0, 2)) // Top 2 per cluster
        .sort((a, b) => b.final_score - a.final_score)
        .slice(0, options.maxSerpCalls)
        .map((k: KeywordData) => k.keyword);

      if (keywordsForSerp.length === 0) {
        return competitorMap;
      }

      // Analyze SERP results for competitor intelligence
      for (const market of options.markets) {
        if (!this.cacheManager.canMakeSerpCall()) break;

        const marketKeywords = keywordsForSerp.slice(0, Math.floor(options.maxSerpCalls / options.markets.length));
        
        const serpResult = await this.serpConnector.analyzeSerpResults({
          keywords: marketKeywords,
          market: market,
          maxCalls: Math.floor(options.maxSerpCalls / options.markets.length)
        });

        // Record SERP calls for quota tracking
        for (let i = 0; i < serpResult.callsMade; i++) {
          this.cacheManager.recordSerpCall();
        }

        // Aggregate competitor data
        serpResult.competitors.forEach((count, domain) => {
          const currentCount = competitorMap.get(domain) || 0;
          competitorMap.set(domain, currentCount + count);
        });

        logger.debug(`📊 SERP analysis (${market}): ${serpResult.callsMade} calls, ${serpResult.competitors.size} competitors found`);
      }

      logger.info(`✅ Competitor analysis: ${competitorMap.size} unique competitors identified`);

    } catch (error) {
      logger.warn('⚠️  SERP competitor analysis failed:', error);
    }

    return competitorMap;
  }

  private async generateOutputs(
    clusters: any[],
    keywords: KeywordData[],
    competitorData: Map<string, number>,
    productConfig: any,
    options: PlanOptions
  ): Promise<string[]> {
    const outputPaths: string[] = [];
    const planDate = format(new Date(), 'yyyy-MM-dd');
    
    const writerOptions = {
      outputPath: 'plans',
      productName: options.product,
      date: planDate,
      markets: options.markets
    };

    try {
      // Generate keywords CSV
      const keywordsCsv = await this.writerEngine.writeKeywordsCsv(keywords, writerOptions);
      outputPaths.push(keywordsCsv);

      // Generate ads JSON
      const adsJson = await this.writerEngine.writeAdsJson(clusters, productConfig, writerOptions);
      outputPaths.push(adsJson);

      // Generate SEO pages markdown
      const seoPages = await this.writerEngine.writeSeoPagesMarkdown(clusters, productConfig, writerOptions);
      outputPaths.push(seoPages);

      // Generate competitors analysis
      const competitors = await this.writerEngine.writeCompetitorsMarkdown(competitorData, clusters, writerOptions);
      outputPaths.push(competitors);

      // Generate negatives list
      const negatives = await this.writerEngine.writeNegativesText(productConfig, clusters, writerOptions);
      outputPaths.push(negatives);

      // Run claims validation on all clusters
      console.log('🛡️ Running use-case level claims validation...');
      let claimsValidation: ProductClaimsValidation | undefined;
      try {
        claimsValidation = await validateProductClaims(clusteringResult.clusters, options.product);
        const failedClusters = claimsValidation.summary.clusters_failed;
        const warningClusters = claimsValidation.summary.clusters_with_warnings;
        
        console.log(`✅ Claims validation: ${claimsValidation.summary.clusters_passed}/${claimsValidation.summary.total_clusters} passed, ${warningClusters} warnings, ${failedClusters} failed`);
        
        if (failedClusters > 0) {
          console.log(`⚠️ ${failedClusters} clusters have high-impact claim violations that should be fixed before launch`);
        }
        if (warningClusters > 0) {
          console.log(`💡 ${warningClusters} clusters have claim warnings - review for better compliance`);
        }
      } catch (error) {
        logger.warn('Claims validation failed:', error);
      }

      // Run URL health checks on all landing pages
      console.log('🔍 Running URL health checks on landing pages...');
      const landingPageUrls = [...new Set(clusteringResult.clusters.map((cluster: any) => cluster.landingPage).filter(Boolean))];
      const urlHealthResults = [];
      
      for (const url of landingPageUrls) {
        try {
          const healthResult = await this.urlHealthChecker.checkUrlHealth(url);
          urlHealthResults.push(healthResult);
          
          if (healthResult.status === 'fail') {
            logger.warn(`❌ URL health check failed for ${url}: ${healthResult.errors.join(', ')}`);
          } else if (healthResult.status === 'warning') {
            logger.warn(`⚠️ URL health warnings for ${url}: ${healthResult.warnings.join(', ')}`);
          }
        } catch (error) {
          logger.error(`❌ Failed to check URL health for ${url}:`, error);
        }
      }

      // Generate URL health report
      const urlHealthSummary = this.urlHealthChecker.generateHealthSummary(urlHealthResults);
      console.log(`✅ URL health checks: ${urlHealthSummary.passedUrls}/${urlHealthSummary.totalUrls} passed, ${urlHealthSummary.failedUrls} failed`);

      // Generate Google Ads Script (only if URL health passes)
      if (urlHealthSummary.failedUrls === 0) {
        console.log('📜 Generating Google Ads Script...');
        const scriptOptions = {
          outputPath: writerOptions.outputPath,
          productName: writerOptions.productName,
          date: writerOptions.date,
          markets: options.markets,
          dryRun: true,
          allowHighBudget: false,
          skipHealthCheck: false
        };
        
        const scriptContent = await this.adsScriptGenerator.generateAdsScript(
          clusters,
          productConfig,
          urlHealthResults,
          scriptOptions
        );

        const scriptPath = await this.writerEngine.writeTextFile(scriptContent, {
          ...writerOptions,
          filename: 'google-ads-script.js'
        });
        outputPaths.push(scriptPath);
        console.log(`✅ Google Ads Script generated: ${scriptPath}`);
      } else {
        logger.error(`❌ Skipping Google Ads Script generation: ${urlHealthSummary.failedUrls} URL health check failures`);
        console.log('🚫 Fix URL health issues before generating Google Ads Script');
      }

      // Generate comprehensive summary
      const summary = this.generatePlanSummary(
        { keywords, scoringStats: { totalKeywords: keywords.length, averageScore: 0, topKeywords: [], intentDistribution: { highest: 0, high: 0, medium: 0, baseline: 0 }, sourceDistribution: { kwp: 0, gsc: 0, estimated: 0 } }, warnings: [] },
        { clusters, clusterStats: { totalClusters: clusters.length, totalKeywords: keywords.length, mappedToPages: 0, unmappedClusters: 0, averageKeywordsPerCluster: 0 }, landingPageGaps: [], warnings: [] },
        { keywords, sourceCounts: { kwp: 0, gsc: 0, estimated: 0 }, mergeStats: { totalKeywords: 0, uniqueKeywords: 0, duplicatesResolved: 0, precedenceApplied: 0 }, warnings: [] },
        options,
        { totalTimeMs: 0, dataCollectionMs: 0, processingMs: 0, outputGenerationMs: 0 }
      );

      const summaryJson = await this.writerEngine.writeSummaryJson(summary, {
        keywordsCsv,
        adsJson,
        seoPagesMarkdown: seoPages,
        competitorsMarkdown: competitors,
        negativesText: negatives,
        summaryJson: ''
      }, writerOptions);
      outputPaths.push(summaryJson);

      // Generate semantic plan diff for evolution tracking
      console.log('📊 Generating plan evolution diff...');
      const planPath = join(writerOptions.outputPath, writerOptions.productName, writerOptions.date);
      try {
        const diffSummary = await generatePlanDiff(planPath, writerOptions.productName, writerOptions.date);
        console.log(diffSummary);
        
        // Add diff.json to output paths
        const diffJsonPath = join(planPath, 'diff.json');
        outputPaths.push(diffJsonPath);
        
        logger.info('✅ Plan diff generated successfully');
      } catch (error) {
        logger.warn('⚠️ Plan diff generation failed (likely first run):', error);
        console.log('💡 Run plan generation again after changes to see evolution tracking');
      }

      // Generate claims validation report
      if (claimsValidation) {
        console.log('📋 Generating claims validation report...');
        const claimsPath = await this.writerEngine.writeJsonFile(claimsValidation, {
          ...writerOptions,
          filename: 'claims-validation.json'
        });
        outputPaths.push(claimsPath);
        
        logger.info('✅ Claims validation report generated');
      }

      logger.info(`✅ All outputs generated: ${outputPaths.length} files`);

    } catch (error) {
      logger.error('❌ Output generation failed:', error);
      throw error;
    }

    return outputPaths;
  }

  private generatePlanSummary(
    scoringResult: any,
    clusteringResult: any,
    precedenceResult: any,
    options: PlanOptions,
    performance: any
  ): PlanSummary {
    const cacheStats = this.cacheManager.getCacheStats();
    const quotaStats = this.cacheManager.getQuotaStats();

    return {
      product: options.product,
      date: format(new Date(), 'yyyy-MM-dd'),
      markets: options.markets,
      total_keywords: scoringResult.keywords.length,
      total_ad_groups: clusteringResult.clusters.length,
      serp_calls_used: quotaStats.serpCallsUsed,
      cache_hit_rate: cacheStats.hitRate,
      data_sources: {
        kwp_count: precedenceResult.sourceCounts.kwp,
        gsc_count: precedenceResult.sourceCounts.gsc,
        estimated_count: precedenceResult.sourceCounts.estimated
      },
      top_opportunities: scoringResult.scoringStats.topKeywords.slice(0, 10).map((k: KeywordData) => ({
        keyword: k.keyword,
        score: k.final_score,
        volume: k.volume,
        competition: k.competition
      })),
      generation_time_ms: performance.totalTimeMs,
      warnings: [
        ...precedenceResult.warnings,
        ...scoringResult.warnings,
        ...clusteringResult.warnings
      ]
    };
  }

  private logPerformanceStats(performance: any): void {
    logger.info('⏱️  Performance breakdown:');
    logger.info(`  📊 Data collection: ${(performance.dataCollectionMs / 1000).toFixed(1)}s`);
    logger.info(`  🧮 Processing: ${(performance.processingMs / 1000).toFixed(1)}s`);
    logger.info(`  📄 Output generation: ${(performance.outputGenerationMs / 1000).toFixed(1)}s`);
    logger.info(`  🎯 Total time: ${(performance.totalTimeMs / 1000).toFixed(1)}s`);
  }
}

// Main exported functions for CLI integration
export async function generatePlan(options: PlanOptions): Promise<void> {
  const orchestrator = new SEOAdsOrchestrator();
  
  try {
    const result = await orchestrator.generatePlan(options);
    
    console.log('\n📊 Plan Generation Summary:');
    console.log(`✅ Keywords analyzed: ${result.summary.total_keywords}`);
    console.log(`✅ Ad groups created: ${result.summary.total_ad_groups}`);
    console.log(`✅ SERP calls used: ${result.summary.serp_calls_used}/${options.maxSerpCalls}`);
    console.log(`✅ Files generated: ${result.outputPaths.length}`);
    
    if (result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.slice(0, 3).forEach(warning => console.log(`  - ${warning}`));
      if (result.warnings.length > 3) {
        console.log(`  ... and ${result.warnings.length - 3} more (see summary.json)`);
      }
    }

  } catch (error) {
    logger.error('❌ Plan generation failed:', error);
    throw error;
  }
}

export async function listPlans(product: string): Promise<any[]> {
  const plansPath = join(process.cwd(), 'plans', product);
  
  if (!existsSync(plansPath)) {
    return [];
  }

  try {
    const planDirs = readdirSync(plansPath)
      .filter(dir => {
        const dirPath = join(plansPath, dir);
        return statSync(dirPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dir);
      })
      .sort((a, b) => b.localeCompare(a)); // Latest first

    const plans = [];
    
    for (const dateDir of planDirs) {
      const summaryPath = join(plansPath, dateDir, 'summary.json');
      
      if (existsSync(summaryPath)) {
        try {
          const summaryContent = readFileSync(summaryPath, 'utf8');
          const summary = JSON.parse(summaryContent);
          
          plans.push({
            date: dateDir,
            markets: summary.markets || [],
            keywordCount: summary.total_keywords || 0,
            adGroupCount: summary.total_ad_groups || 0,
            serpCalls: summary.serp_calls_used || 0,
            cacheHitRate: summary.cache_hit_rate || 0
          });
        } catch (error) {
          logger.debug(`Failed to read summary for ${dateDir}:`, error);
        }
      }
    }

    return plans;
    
  } catch (error) {
    logger.error('❌ Failed to list plans:', error);
    return [];
  }
}

export async function showPlan(product: string, date: string): Promise<any | null> {
  const summaryPath = join(process.cwd(), 'plans', product, date, 'summary.json');
  
  if (!existsSync(summaryPath)) {
    return null;
  }

  try {
    const summaryContent = readFileSync(summaryPath, 'utf8');
    const summary = JSON.parse(summaryContent);
    
    return {
      ...summary,
      outputPath: join('plans', product, date)
    };
    
  } catch (error) {
    logger.error('❌ Failed to read plan summary:', error);
    return null;
  }
}