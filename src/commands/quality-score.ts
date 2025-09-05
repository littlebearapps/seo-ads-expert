/**
 * Quality Score Command - v1.4
 * Analyzes and triages Quality Score issues
 */

import { logger } from '../utils/logger.js';
import { DatabaseConnectionPool } from '../database/json-db.js';
import { QualityScoreAnalyzer } from '../analyzers/quality-score-analyzer.js';
import { QualityScoreReportWriter } from '../writers/quality-score-report-writer.js';
import type { QualityScoreData } from '../connectors/google-ads-performance.js';
import path from 'path';
import fs from 'fs/promises';

interface QualityScoreOptions {
  product: string;
  concurrentChecks: number;
  includeHealth: boolean;
}

interface QualityScoreResult {
  adGroupCount: number;
  lowQsCount: number;
  recommendationsCount: number;
  outputPath: string;
}

export async function analyzeQualityScore(options: QualityScoreOptions): Promise<QualityScoreResult> {
  logger.info('Starting Quality Score analysis', options);

  // Initialize database
  const db = new DatabaseConnectionPool();
  await db.initialize();

  try {
    // Fetch Quality Score data from database
    console.log('📊 Loading Quality Score data...');
    // For JSON database, fetch all and find latest date
    const allQsData = await db.query<any>('qualityScores');
    
    // Find the latest date
    let latestDate = '';
    for (const qs of allQsData) {
      if (qs.date > latestDate) {
        latestDate = qs.date;
      }
    }
    
    // Filter by latest date and map fields
    const qsData = allQsData
      .filter(qs => qs.date === latestDate)
      .map(qs => ({
        date: qs.date,
        campaignId: qs.campaign_id,
        adGroupId: qs.ad_group_id,
        keyword: qs.keyword,
        expectedCtr: qs.expected_ctr,
        adRelevance: qs.ad_relevance,
        landingPageExperience: qs.lp_experience,
        qualityScore: qs.quality_score
      } as QualityScoreData))
      .sort((a, b) => (a.qualityScore - b.qualityScore) || a.keyword.localeCompare(b.keyword));

    console.log(`📝 Found ${qsData.length} keywords to analyze`);

    if (qsData.length === 0) {
      throw new Error('No Quality Score data found. Please run "seo-ads performance ingest-ads" first.');
    }

    // Get campaign names (would normally join with campaigns table)
    for (const qs of qsData) {
      // Add placeholder names for now
      (qs as any).campaignName = `Campaign ${qs.campaignId}`;
      (qs as any).adGroupName = `Ad Group ${qs.adGroupId}`;
    }

    // Initialize analyzer
    const analyzer = new QualityScoreAnalyzer();

    // Load URL health data if requested
    let urlHealthPath: string | undefined;
    if (options.includeHealth) {
      const healthFile = path.join(process.cwd(), 'plans', options.product, 'latest', 'url_health.json');
      try {
        await fs.access(healthFile);
        urlHealthPath = healthFile;
        console.log('✅ Including landing page health data');
      } catch {
        console.log('⚠️  No URL health data found, skipping LP analysis');
      }
    }

    // Analyze Quality Scores
    console.log('⚡ Analyzing Quality Score issues...');
    const analyses = await analyzer.analyzeQualityScore(qsData, urlHealthPath);

    // Count metrics
    const adGroupCount = analyses.length;
    const lowQsCount = analyses.filter(a => a.avgQualityScore < 7).length;
    const totalRecommendations = analyses.reduce((sum, a) => sum + a.recommendations.length, 0);

    // Generate output directory
    const outputDir = path.join(
      process.cwd(),
      'performance',
      options.product,
      'quality-score',
      new Date().toISOString().split('T')[0]
    );
    await fs.mkdir(outputDir, { recursive: true });

    // Generate and write QS triage report
    console.log('📄 Generating Quality Score triage report...');
    const reportWriter = new QualityScoreReportWriter();
    const triageReport = reportWriter.generateTriageReport(analyses);
    await fs.writeFile(path.join(outputDir, 'qs_triage.md'), triageReport);

    // Generate detailed recommendations for each ad group
    const detailedRecs: any[] = [];
    for (const analysis of analyses.slice(0, 10)) { // Top 10 priority ad groups
      const categorized = analyzer.categorizeIssues(analysis);
      
      detailedRecs.push({
        adGroup: analysis.adGroupName,
        campaign: analysis.campaignName,
        avgQualityScore: analysis.avgQualityScore,
        priorityScore: analysis.priorityScore,
        issues: {
          adRelevance: categorized.adRelevance.length,
          landingPageExperience: categorized.landingPageExperience.length,
          expectedCTR: categorized.expectedCTR.length
        },
        recommendations: analysis.recommendations.map(rec => ({
          type: rec.type,
          priority: rec.priority,
          action: rec.action,
          expectedImprovement: rec.expectedImprovement
        }))
      });
    }

    // Write detailed recommendations JSON
    await fs.writeFile(
      path.join(outputDir, 'recommendations.json'),
      JSON.stringify(detailedRecs, null, 2)
    );

    // Generate implementation checklist
    const checklist = reportWriter.generateImplementationChecklist(analyses);
    await fs.writeFile(path.join(outputDir, 'implementation_checklist.md'), checklist);

    // Generate summary
    const summary = {
      analysisDate: new Date().toISOString(),
      product: options.product,
      adGroupsAnalyzed: adGroupCount,
      lowQualityScoreGroups: lowQsCount,
      totalRecommendations: totalRecommendations,
      topIssues: {
        adRelevance: analyses.filter(a => 
          a.issues.some(i => i.component === 'adRelevance')
        ).length,
        landingPageExperience: analyses.filter(a => 
          a.issues.some(i => i.component === 'landingPageExperience')
        ).length,
        expectedCTR: analyses.filter(a => 
          a.issues.some(i => i.component === 'expectedCTR')
        ).length
      },
      averageQualityScore: 
        analyses.reduce((sum, a) => sum + a.avgQualityScore, 0) / analyses.length,
      criticalAdGroups: analyses
        .filter(a => a.avgQualityScore < 5)
        .map(a => ({
          name: a.adGroupName,
          score: a.avgQualityScore,
          priority: a.priorityScore
        }))
    };

    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    logger.info('Quality Score analysis complete', summary);

    return {
      adGroupCount,
      lowQsCount,
      recommendationsCount: totalRecommendations,
      outputPath: outputDir
    };

  } finally {
    await db.close();
  }
}