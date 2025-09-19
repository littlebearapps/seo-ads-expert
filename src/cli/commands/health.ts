/**
 * Health Command Module (v1.9)
 * Site health monitoring and indexation analysis
 */

import { Command } from 'commander';
import { HealthAnalyzer } from '../../health/health-analyzer.js';
import { RobotsAuditor } from '../../robots/robots-auditor.js';
import { IndexationAnalyzer } from '../../health/indexation-analyzer.js';
import { getDatabase } from '../../database.js';
import { logger } from '../../utils/logger.js';

export function createHealthCommand(): Command {
  const health = new Command('health');

  health
    .description('Site health monitoring and analysis');

  // Comprehensive health check
  health
    .command('check')
    .description('Comprehensive site health check')
    .requiredOption('--domain <domain>', 'Domain to check')
    .option('--crawl-session <id>', 'Use specific crawl session', 'latest')
    .action(async (options) => {
      try {
        logger.info('Running health check', options);

        const db = await getDatabase();
        const analyzer = new HealthAnalyzer(db);

        const report = await analyzer.runComprehensiveCheck({
          domain: options.domain,
          sessionId: options.crawlSession
        });

        console.log('\n🏥 Site Health Report');
        console.log('═══════════════════════════════════════');
        console.log(`Domain: ${options.domain}`);
        console.log(`Overall Health Score: ${report.healthScore}/100`);
        console.log('\n📊 Key Metrics:');
        console.log(`  Indexation Rate: ${report.indexationRate}%`);
        console.log(`  Orphan Pages: ${report.orphanPages}`);
        console.log(`  Broken Links: ${report.brokenLinks}`);
        console.log(`  Duplicate Content: ${report.duplicateContent}`);
        console.log(`  Missing Meta: ${report.missingMeta}`);

        if (report.criticalIssues.length > 0) {
          console.log('\n🚨 Critical Issues:');
          report.criticalIssues.forEach(issue => {
            console.log(`  - ${issue.description}`);
            console.log(`    Fix: ${issue.recommendation}`);
          });
        }

        if (report.recommendations.length > 0) {
          console.log('\n💡 Recommendations:');
          report.recommendations.forEach(rec => {
            console.log(`  - ${rec}`);
          });
        }

      } catch (error) {
        logger.error('Health check failed', error);
        console.error('❌ Health check failed:', error);
        process.exit(1);
      }
    });

  // Indexation analysis
  health
    .command('indexation')
    .description('Analyze indexation status with GSC data')
    .requiredOption('--domain <domain>', 'Domain to analyze')
    .option('--gsc-path <path>', 'Path to GSC export CSV')
    .option('--output <format>', 'Output format (json|markdown)', 'markdown')
    .action(async (options) => {
      try {
        logger.info('Analyzing indexation', options);

        const db = await getDatabase();
        const analyzer = new IndexationAnalyzer(db);

        const report = await analyzer.analyzeIndexationHealth(
          options.domain,
          options.gscPath
        );

        if (options.output === 'json') {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log('\n📈 Indexation Analysis Report');
          console.log('═══════════════════════════════════════');
          console.log(`\nSummary:`);
          console.log(`  Discovered Not Indexed: ${report.summary.discoveredNotIndexed}`);
          console.log(`  Crawled Not Indexed: ${report.summary.crawledNotIndexed}`);
          console.log(`  Excluded Duplicates: ${report.summary.excludedDuplicates}`);
          console.log(`  Low Quality Indexed: ${report.summary.lowQualityIndexed}`);

          if (report.issues.length > 0) {
            console.log('\n⚠️  Issues Found:');
            report.issues.forEach(issue => {
              console.log(`\n  URL: ${issue.url}`);
              console.log(`  State: ${issue.state}`);
              console.log(`  Fix: ${issue.fix}`);
              console.log(`  Severity: ${issue.severity}`);
            });
          }

          console.log('\n✅ Actionable Recommendations:');
          report.recommendations.forEach(rec => {
            console.log(`  - ${rec}`);
          });
        }

      } catch (error) {
        logger.error('Indexation analysis failed', error);
        console.error('❌ Analysis failed:', error);
        process.exit(1);
      }
    });

  // Robots.txt audit
  health
    .command('robots-audit')
    .description('Audit robots.txt configuration')
    .requiredOption('--site <url>', 'Site URL')
    .option('--check-crawl', 'Check against crawled pages', true)
    .option('--format <format>', 'Output format (console|markdown)', 'console')
    .action(async (options) => {
      try {
        logger.info('Auditing robots.txt', options);

        const db = options.checkCrawl ? await getDatabase() : undefined;
        const auditor = new RobotsAuditor();

        const audit = await auditor.audit(options.site, { crawlDb: db });

        if (options.format === 'markdown') {
          const report = auditor.generateReport(audit, 'markdown');
          console.log(report);
        } else {
          console.log('\n🤖 Robots.txt Audit Report');
          console.log('═══════════════════════════════════════');
          console.log(`Site: ${options.site}`);
          console.log(`Severity: ${audit.severity}`);

          if (audit.sitemaps.length > 0) {
            console.log('\n📍 Sitemap Directives:');
            audit.sitemaps.forEach(sitemap => {
              console.log(`  ✅ ${sitemap}`);
            });
          } else {
            console.log('\n⚠️  No Sitemap directives found');
          }

          if (audit.findings.length > 0) {
            console.log('\n🔍 Findings:');

            const high = audit.findings.filter(f => f.severity === 'HIGH');
            const medium = audit.findings.filter(f => f.severity === 'MEDIUM');
            const low = audit.findings.filter(f => f.severity === 'LOW');

            if (high.length > 0) {
              console.log('\n  🚨 HIGH Severity:');
              high.forEach(f => {
                console.log(`    - ${f.message}`);
                console.log(`      Fix: ${f.fix}`);
              });
            }

            if (medium.length > 0) {
              console.log('\n  ⚠️  MEDIUM Severity:');
              medium.forEach(f => {
                console.log(`    - ${f.message}`);
                console.log(`      Fix: ${f.fix}`);
              });
            }

            if (low.length > 0) {
              console.log('\n  💡 LOW Severity:');
              low.forEach(f => {
                console.log(`    - ${f.message}`);
                console.log(`      Fix: ${f.fix}`);
              });
            }
          }
        }

      } catch (error) {
        logger.error('Robots audit failed', error);
        console.error('❌ Audit failed:', error);
        process.exit(1);
      }
    });

  // Performance recommendations
  health
    .command('recommendations')
    .description('Get performance improvement recommendations')
    .requiredOption('--domain <domain>', 'Domain to analyze')
    .action(async (options) => {
      try {
        logger.info('Generating recommendations', options);

        const db = await getDatabase();
        const analyzer = new HealthAnalyzer(db);

        const recommendations = await analyzer.generateRecommendations(options.domain);

        console.log('\n🎯 Performance Recommendations');
        console.log('═══════════════════════════════════════');
        console.log(`Domain: ${options.domain}\n`);

        Object.entries(recommendations).forEach(([category, items]) => {
          console.log(`\n${category}:`);
          items.forEach((item: any) => {
            console.log(`  - ${item.recommendation}`);
            console.log(`    Impact: ${item.impact} | Effort: ${item.effort}`);
          });
        });

      } catch (error) {
        logger.error('Recommendations generation failed', error);
        console.error('❌ Generation failed:', error);
        process.exit(1);
      }
    });

  return health;
}