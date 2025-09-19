/**
 * Crawl Command Module (v1.9)
 * Internal HTML crawler and link graph analysis
 */

import { Command } from 'commander';
import { CrawlOrchestrator } from '../../crawl/orchestrator.js';
import { Database } from 'better-sqlite3';
import { getDatabase } from '../../database.js';
import { logger } from '../../utils/logger.js';

export function createCrawlCommand(): Command {
  const crawl = new Command('crawl');

  crawl
    .description('Site crawling and link graph analysis');

  // Start crawl
  crawl
    .command('start')
    .description('Start comprehensive site crawl')
    .requiredOption('--url <url>', 'Starting URL to crawl')
    .option('--max-depth <n>', 'Maximum crawl depth', '4')
    .option('--budget <n>', 'Maximum pages to crawl', '500')
    .option('--concurrency <n>', 'Concurrent requests', '3')
    .option('--emit-graph', 'Emit link graph JSON after crawl')
    .action(async (options) => {
      try {
        logger.info('Starting site crawl', {
          url: options.url,
          maxDepth: options.maxDepth,
          budget: options.budget
        });

        const db = await getDatabase();
        const orchestrator = new CrawlOrchestrator(db, {
          maxDepth: parseInt(options.maxDepth),
          maxPages: parseInt(options.budget),
          concurrency: parseInt(options.concurrency)
        });

        const results = await orchestrator.crawlSite(options.url);

        logger.info('Crawl completed', {
          pagesDiscovered: results.pagesDiscovered,
          pagesCrawled: results.pagesCrawled,
          errors: results.errors.length
        });

        if (options.emitGraph) {
          await orchestrator.emitLinkGraph(results.sessionId);
          logger.info('Link graph emitted to plans directory');
        }

        console.log(`\n✅ Crawl completed successfully`);
        console.log(`   Pages discovered: ${results.pagesDiscovered}`);
        console.log(`   Pages crawled: ${results.pagesCrawled}`);
        console.log(`   Errors: ${results.errors.length}`);
        console.log(`   Session ID: ${results.sessionId}`);

      } catch (error) {
        logger.error('Crawl failed', error);
        console.error('❌ Crawl failed:', error);
        process.exit(1);
      }
    });

  // View crawl results
  crawl
    .command('results')
    .description('View crawl results')
    .option('--session <id>', 'Session ID', 'latest')
    .action(async (options) => {
      try {
        const db = await getDatabase();
        const orchestrator = new CrawlOrchestrator(db);

        const results = await orchestrator.getCrawlResults(options.session);

        console.log('\n📊 Crawl Results');
        console.log('═══════════════════════════════════════');
        console.log(`Session: ${results.sessionId}`);
        console.log(`Started: ${results.startTime}`);
        console.log(`Completed: ${results.endTime}`);
        console.log(`Pages crawled: ${results.pagesCrawled}`);
        console.log(`Links discovered: ${results.linksDiscovered}`);
        console.log(`Orphan pages: ${results.orphanPages}`);
        console.log(`Broken links: ${results.brokenLinks}`);

      } catch (error) {
        logger.error('Failed to get crawl results', error);
        console.error('❌ Failed to get results:', error);
        process.exit(1);
      }
    });

  // Analyze crawl data
  crawl
    .command('analyze')
    .description('Analyze crawl data for issues')
    .requiredOption('--type <type>', 'Analysis type (orphans|duplicates|broken-links|link-opportunities)')
    .option('--session <id>', 'Session ID', 'latest')
    .option('--output <format>', 'Output format (json|csv|markdown)', 'markdown')
    .action(async (options) => {
      try {
        const db = await getDatabase();
        const orchestrator = new CrawlOrchestrator(db);

        const analysis = await orchestrator.analyzeCrawlData(
          options.type,
          options.session
        );

        if (options.output === 'json') {
          console.log(JSON.stringify(analysis, null, 2));
        } else if (options.output === 'csv') {
          // Output as CSV
          const csv = orchestrator.formatAsCSV(analysis);
          console.log(csv);
        } else {
          // Output as markdown
          const markdown = orchestrator.formatAsMarkdown(analysis);
          console.log(markdown);
        }

      } catch (error) {
        logger.error('Analysis failed', error);
        console.error('❌ Analysis failed:', error);
        process.exit(1);
      }
    });

  return crawl;
}