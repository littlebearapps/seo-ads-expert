#!/usr/bin/env node
/**
 * SEO & Google Ads Expert Tool v1.9
 * Unified CLI Entry Point
 *
 * This consolidates all 47+ commands from 6 separate CLI files into a single
 * coherent command structure with subcommands.
 */

import { Command } from 'commander';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import subcommand creators
import { createPlanCommand } from './commands/plan.js';
import { createExperimentCommand } from './commands/experiment.js';
import { createAlertsCommand } from './commands/alerts.js';
import { createMicrosoftCommand } from './commands/microsoft.js';
import { createEntityCommand } from './commands/entity.js';
import { createCrawlCommand } from './commands/crawl.js';
import { createSitemapCommand } from './commands/sitemap.js';
import { createHealthCommand } from './commands/health.js';
import { createPerformanceCommand } from './commands/performance.js';
import { createMonitorCommand } from './commands/monitor.js';

// Create main program
const program = new Command();

program
  .name('seo-ads')
  .description('SEO & Google Ads Expert Tool v1.9 - Technical SEO Intelligence & Site Health System')
  .version('1.9.0');

// Add existing commands (v1.0 - v1.8)
program.addCommand(createPlanCommand());
program.addCommand(createPerformanceCommand());
program.addCommand(createMonitorCommand());
program.addCommand(createExperimentCommand());
program.addCommand(createAlertsCommand());
program.addCommand(createMicrosoftCommand());
program.addCommand(createEntityCommand());

// Add new v1.9 commands
program.addCommand(createCrawlCommand());
program.addCommand(createSitemapCommand());
program.addCommand(createHealthCommand());

// Add backward compatibility aliases
program
  .command('link-graph')
  .description('Build link graph (alias to crawl start + emit)')
  .requiredOption('--site <url>', 'Site URL to crawl')
  .option('--max-depth <n>', 'Depth limit', '4')
  .option('--budget <n>', 'Page budget', '500')
  .action(async (opts) => {
    // Delegate to crawl command
    const crawlCmd = program.commands.find(c => c.name() === 'crawl');
    if (crawlCmd) {
      await crawlCmd.parseAsync(['node', 'seo-ads', 'crawl', 'start',
        '--url', opts.site,
        '--max-depth', opts.maxDepth,
        '--budget', opts.budget,
        '--emit-graph'
      ]);
    }
  });

program
  .command('robots-audit')
  .description('Run robots.txt audit (alias)')
  .requiredOption('--site <url>', 'Site URL')
  .action(async (opts) => {
    // Delegate to health command
    const healthCmd = program.commands.find(c => c.name() === 'health');
    if (healthCmd) {
      await healthCmd.parseAsync(['node', 'seo-ads', 'health', 'robots-audit',
        '--site', opts.site
      ]);
    }
  });

program
  .command('indexnow')
  .description('Send IndexNow pings (alias)')
  .requiredOption('--urls <path>', 'Path to URL file')
  .option('--engine <name>', 'bing|yandex', 'bing')
  .option('--dry-run', 'Do not send; log only', false)
  .action(async (opts) => {
    // Delegate to sitemap command
    const sitemapCmd = program.commands.find(c => c.name() === 'sitemap');
    if (sitemapCmd) {
      await sitemapCmd.parseAsync(['node', 'seo-ads', 'sitemap', 'indexnow',
        '--urls', opts.urls,
        '--engine', opts.engine,
        opts.dryRun ? '--dry-run' : ''
      ].filter(Boolean));
    }
  });

// Parse arguments and execute
program.parse(process.argv);

// If no command specified, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}