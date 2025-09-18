#!/usr/bin/env node
/**
 * Entity CLI Commands - v1.8
 * Command-line interface for entity coverage analysis and gap detection
 */

import { Command } from 'commander';
import pino from 'pino';
import { validateEnvironment } from './utils/validation.js';
import { validateProductExists } from './utils/product-loader.js';
import { EntityExtractor } from './entity/entity-auditor.js';
import { EntityScorer } from './entity/entity-scorer.js';
import { CoverageAnalyzer } from './entity/coverage-analyzer.js';
import { DatabaseManager } from './database/database-manager.js';
import path from 'path';
import fs from 'fs/promises';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

const program = new Command();

program
  .name('seo-ads-entity')
  .description('Entity coverage analysis and gap detection for SEO optimization')
  .version('1.8.0');

/**
 * Entity audit command - analyze coverage gaps
 */
program
  .command('audit')
  .description('Analyze entity coverage gaps against competitors')
  .requiredOption('-p, --product <name>', 'Product name (convertmyfile, palettekit, notebridge)')
  .option('-m, --markets <markets>', 'Target markets (comma-separated)', 'AU,US,GB')
  .option('-c, --cluster <cluster>', 'Specific keyword cluster to analyze')
  .option('--competitors <count>', 'Number of top competitors to analyze', '3')
  .option('--min-importance <score>', 'Minimum entity importance score (0-1)', '0.3')
  .option('--output-dir <path>', 'Output directory for reports', 'entity-analysis')
  .action(async (options) => {
    const startTime = Date.now();

    try {
      console.log('🔍 SEO Entity Coverage Audit - v1.8');
      console.log('');

      // Validation
      console.log('⚡ Phase 1: Validation & Setup');
      process.stdout.write('  🔍 Environment validation... ');
      validateEnvironment();
      console.log('✅');

      process.stdout.write('  🏷️  Product validation... ');
      if (!validateProductExists(options.product)) {
        console.log('❌');
        console.error(`\n🚨 Product '${options.product}' not found`);
        process.exit(1);
      }
      console.log('✅');

      // Initialize components
      console.log('\n⚡ Phase 2: Data Collection & Analysis');
      const dbManager = new DatabaseManager();
      const extractor = new EntityExtractor();
      const scorer = new EntityScorer();
      const analyzer = new CoverageAnalyzer();

      // Load existing SERP data
      process.stdout.write('  📊 Loading SERP data... ');
      const serpData = await dbManager.getSERPData(options.product, options.markets.split(','));
      console.log(`✅ (${serpData.length} records)`);

      // Extract entities from SERP data
      process.stdout.write('  🏷️  Extracting entities... ');
      const entities = [];
      for (const serp of serpData) {
        const serpEntities = await extractor.extractFromSERP(serp);
        entities.push(...serpEntities);
      }

      // Normalize and score entities
      const normalizedEntities = extractor.normalize(entities);
      for (const entity of normalizedEntities) {
        entity.importance = scorer.calculateImportance(entity);
      }

      const filteredEntities = normalizedEntities
        .filter(e => e.importance >= parseFloat(options.minImportance))
        .sort((a, b) => b.importance - a.importance);

      console.log(`✅ (${filteredEntities.length} entities found)`);

      // Load page snapshots (mock data for now)
      process.stdout.write('  📄 Loading page snapshots... ');
      const targetPages = await mockPageSnapshots(options.product);
      const competitorPages = await mockCompetitorSnapshots(parseInt(options.competitors));
      console.log(`✅ (${targetPages.length} target, ${competitorPages.length} competitor pages)`);

      // Perform coverage analysis
      console.log('\n⚡ Phase 3: Coverage Analysis');
      const markets = options.markets.split(',');
      const analyses = [];

      for (const market of markets) {
        for (const targetPage of targetPages) {
          process.stdout.write(`  🎯 Analyzing ${targetPage.url} (${market})... `);

          const cluster = {
            name: options.cluster || 'default',
            keywords: ['convert', 'file', 'online', 'tool'],
            intent: 'commercial' as const,
            volume: 10000,
            difficulty: 45
          };

          const analysis = await analyzer.analyzeCoverage(
            targetPage,
            competitorPages,
            filteredEntities,
            cluster,
            options.product,
            market
          );

          analyses.push(analysis);
          console.log(`✅ (${analysis.coverageScore.toFixed(1)}/100)`);
        }
      }

      // Generate reports
      console.log('\n⚡ Phase 4: Report Generation');
      await generateReports(analyses, options.outputDir, options.product);

      // Save to database
      process.stdout.write('  💾 Saving results to database... ');
      await saveAnalysesToDatabase(dbManager, analyses);
      console.log('✅');

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n🎉 Entity audit complete! (${duration}s)`);
      console.log(`📊 Analyzed ${analyses.length} page-market combinations`);
      console.log(`📈 Average coverage score: ${(analyses.reduce((sum, a) => sum + a.coverageScore, 0) / analyses.length).toFixed(1)}/100`);
      console.log(`📁 Reports saved to: ${options.outputDir}/`);

    } catch (error) {
      console.error('\n❌ Entity audit failed:', error.message);
      logger.error('Entity audit error:', error);
      process.exit(1);
    }
  });

/**
 * Entity gaps command - show specific gaps
 */
program
  .command('gaps')
  .description('Show entity gaps for a specific product and market')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('-m, --market <market>', 'Target market', 'US')
  .option('-c, --cluster <cluster>', 'Keyword cluster', 'default')
  .option('--limit <count>', 'Maximum gaps to show', '10')
  .option('--type <type>', 'Gap type (entity|section|schema|all)', 'all')
  .action(async (options) => {
    try {
      console.log(`🔍 Entity Gaps Analysis - ${options.product} (${options.market})`);
      console.log('');

      const dbManager = new DatabaseManager();
      const analysis = await dbManager.getLatestCoverageAnalysis(
        options.product,
        options.cluster,
        options.market
      );

      if (!analysis) {
        console.log('❌ No coverage analysis found. Run "entity audit" first.');
        process.exit(1);
      }

      console.log(`📊 Coverage Score: ${analysis.coverageScore.toFixed(1)}/100`);
      console.log(`🏆 Competitor Average: ${analysis.competitorAverage.toFixed(1)}/100`);
      console.log(`📈 Gap Count: ${analysis.gapCount}`);
      console.log('');

      const limit = parseInt(options.limit);

      if (options.type === 'entity' || options.type === 'all') {
        console.log('🏷️  Entity Gaps:');
        const entityGaps = analysis.entityGaps.slice(0, limit);
        for (const gap of entityGaps) {
          console.log(`  • ${gap.entity} (importance: ${gap.importance.toFixed(2)}, ${Math.round(gap.competitorPresence * 100)}% competitors)`);
          console.log(`    ${gap.rationale}`);
          console.log(`    Suggested: ${gap.suggestedPlacement}`);
          console.log('');
        }
      }

      if (options.type === 'section' || options.type === 'all') {
        console.log('📄 Section Gaps:');
        const sectionGaps = analysis.sectionGaps.slice(0, limit);
        for (const gap of sectionGaps) {
          console.log(`  • ${gap.sectionType} (${Math.round(gap.competitorPresence * 100)}% competitors)`);
          console.log(`    ${gap.suggestedContent}`);
          console.log(`    Estimated effort: ${gap.estimatedWordCount} words`);
          console.log('');
        }
      }

      if (options.type === 'schema' || options.type === 'all') {
        console.log('🏷️  Schema Gaps:');
        const schemaGaps = analysis.schemaGaps.slice(0, limit);
        for (const gap of schemaGaps) {
          console.log(`  • ${gap.schemaType} (${gap.priority} priority, ${Math.round(gap.competitorPresence * 100)}% competitors)`);
          console.log(`    ${gap.rationale}`);
          console.log('');
        }
      }

    } catch (error) {
      console.error('❌ Failed to show gaps:', error.message);
      process.exit(1);
    }
  });

/**
 * Entity enhance command - show enhancement opportunities
 */
program
  .command('enhance')
  .description('Show entity enhancement opportunities for existing content')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('-u, --url <url>', 'Specific URL to analyze')
  .option('--min-impact <score>', 'Minimum impact score (1-5)', '3')
  .action(async (options) => {
    try {
      console.log(`🚀 Entity Enhancement Opportunities - ${options.product}`);
      console.log('');

      const dbManager = new DatabaseManager();
      const recommendations = await dbManager.getRecommendations(
        options.product,
        options.url,
        parseInt(options.minImpact)
      );

      if (recommendations.length === 0) {
        console.log('✨ No enhancement opportunities found with current criteria.');
        console.log('💡 Try lowering the --min-impact threshold or run "entity audit" first.');
        return;
      }

      console.log(`📈 Found ${recommendations.length} enhancement opportunities:`);
      console.log('');

      for (const rec of recommendations) {
        const impact = '★'.repeat(rec.impact);
        const effort = '⚡'.repeat(rec.effort);
        console.log(`${rec.priority}. ${rec.title}`);
        console.log(`   Impact: ${impact} (${rec.impact}/5) | Effort: ${effort} (${rec.effort}/5)`);
        console.log(`   ${rec.description}`);
        console.log(`   Target: ${rec.targetUrl}`);
        console.log('');
      }

      console.log('💡 Recommendations are sorted by priority (impact/effort ratio)');

    } catch (error) {
      console.error('❌ Failed to show enhancement opportunities:', error.message);
      process.exit(1);
    }
  });

// Helper functions

async function mockPageSnapshots(product: string) {
  // Mock implementation - would normally fetch real page content
  return [{
    url: `https://littlebearapps.com/extensions/chrome/${product}`,
    capturedAt: new Date().toISOString(),
    wordCount: 850,
    headings: [
      { level: 1, text: `${product} - Online Tool`, position: 0 },
      { level: 2, text: 'Features', position: 200 },
      { level: 2, text: 'How to Use', position: 400 }
    ],
    sections: [
      { title: 'Features', content: 'Feature content', wordCount: 150, entities: ['convert', 'online'], type: 'features' }
    ],
    presentEntities: ['convert', 'online', 'tool', 'free'],
    schemaTypes: ['SoftwareApplication'],
    contentHash: 'abc123def456'
  }];
}

async function mockCompetitorSnapshots(count: number) {
  // Mock implementation - would normally fetch competitor page content
  const competitors = [];
  for (let i = 0; i < count; i++) {
    competitors.push({
      url: `https://competitor${i + 1}.com/tool`,
      capturedAt: new Date().toISOString(),
      wordCount: 1200,
      headings: [
        { level: 1, text: 'Tool Name', position: 0 },
        { level: 2, text: 'Features', position: 200 },
        { level: 2, text: 'FAQ', position: 600 }
      ],
      sections: [
        { title: 'Features', content: 'Feature content', wordCount: 200, entities: ['convert', 'online'], type: 'features' },
        { title: 'FAQ', content: 'FAQ content', wordCount: 300, entities: ['free', 'privacy'], type: 'faq' }
      ],
      presentEntities: ['convert', 'online', 'tool', 'free', 'privacy', 'secure', 'fast'],
      schemaTypes: ['SoftwareApplication', 'FAQPage'],
      contentHash: `comp${i}hash`
    });
  }
  return competitors;
}

async function generateReports(analyses, outputDir: string, product: string) {
  await fs.mkdir(outputDir, { recursive: true });

  // Generate coverage gaps report
  const gapsReport = generateCoverageGapsReport(analyses, product);
  await fs.writeFile(path.join(outputDir, 'coverage_gaps.md'), gapsReport);

  // Generate recommendations CSV
  const recommendationsCsv = generateRecommendationsCsv(analyses);
  await fs.writeFile(path.join(outputDir, 'recommendations.csv'), recommendationsCsv);

  // Generate entity analysis JSON
  const entityData = generateEntityAnalysisJson(analyses);
  await fs.writeFile(path.join(outputDir, 'entity_analysis.json'), JSON.stringify(entityData, null, 2));

  console.log(`  📄 Generated coverage_gaps.md`);
  console.log(`  📊 Generated recommendations.csv`);
  console.log(`  📋 Generated entity_analysis.json`);
}

function generateCoverageGapsReport(analyses, product: string): string {
  let report = `# Entity Coverage Gap Analysis - ${product}\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;

  for (const analysis of analyses) {
    report += `## ${analysis.cluster} - ${analysis.market}\n\n`;
    report += `**Coverage Score**: ${analysis.coverageScore.toFixed(1)}/100 (Competitor Avg: ${analysis.competitorAverage.toFixed(1)})\n\n`;

    if (analysis.entityGaps.length > 0) {
      report += `### Missing Entities\n`;
      const highPriority = analysis.entityGaps.filter(g => g.importance > 0.7);
      const mediumPriority = analysis.entityGaps.filter(g => g.importance >= 0.4 && g.importance <= 0.7);

      if (highPriority.length > 0) {
        report += `- **High Priority**: ${highPriority.map(g => g.entity).join(', ')}\n`;
      }
      if (mediumPriority.length > 0) {
        report += `- **Medium Priority**: ${mediumPriority.map(g => g.entity).join(', ')}\n`;
      }
      report += '\n';
    }

    if (analysis.sectionGaps.length > 0) {
      report += `### Missing Sections\n`;
      for (const gap of analysis.sectionGaps) {
        report += `- ❌ ${gap.sectionType} section (${Math.round(gap.competitorPresence * 100)}% of competitors)\n`;
      }
      report += '\n';
    }

    if (analysis.recommendations.length > 0) {
      report += `### Recommendations\n`;
      for (let i = 0; i < Math.min(5, analysis.recommendations.length); i++) {
        const rec = analysis.recommendations[i];
        report += `${i + 1}. **${rec.title}**\n`;
        report += `   - ${rec.description}\n`;
        report += `   - Impact: ${rec.impact}/5 | Effort: ${rec.effort}/5\n\n`;
      }
    }

    report += '---\n\n';
  }

  return report;
}

function generateRecommendationsCsv(analyses): string {
  let csv = 'priority,type,title,description,impact,effort,target_url,product,cluster,market\n';

  for (const analysis of analyses) {
    for (const rec of analysis.recommendations) {
      const row = [
        rec.priority,
        rec.type,
        `"${rec.title}"`,
        `"${rec.description}"`,
        rec.impact,
        rec.effort,
        rec.targetUrl,
        analysis.product,
        analysis.cluster,
        analysis.market
      ].join(',');
      csv += row + '\n';
    }
  }

  return csv;
}

function generateEntityAnalysisJson(analyses) {
  return {
    generated_at: new Date().toISOString(),
    total_analyses: analyses.length,
    summary: {
      avg_coverage_score: analyses.reduce((sum, a) => sum + a.coverageScore, 0) / analyses.length,
      avg_competitor_score: analyses.reduce((sum, a) => sum + a.competitorAverage, 0) / analyses.length,
      total_gaps: analyses.reduce((sum, a) => sum + a.gapCount, 0),
      total_recommendations: analyses.reduce((sum, a) => sum + a.recommendations.length, 0)
    },
    analyses: analyses.map(a => ({
      product: a.product,
      cluster: a.cluster,
      market: a.market,
      coverage_score: a.coverageScore,
      competitor_average: a.competitorAverage,
      gap_count: a.gapCount,
      top_entity_gaps: a.entityGaps.slice(0, 5).map(g => ({
        entity: g.entity,
        importance: g.importance,
        competitor_presence: g.competitorPresence
      })),
      top_recommendations: a.recommendations.slice(0, 3).map(r => ({
        type: r.type,
        title: r.title,
        priority: r.priority,
        impact: r.impact,
        effort: r.effort
      }))
    }))
  };
}

async function saveAnalysesToDatabase(dbManager: DatabaseManager, analyses) {
  for (const analysis of analyses) {
    await dbManager.saveCoverageAnalysis(analysis);
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

program.parse();