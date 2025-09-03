#!/usr/bin/env node
import { Command } from 'commander';
import pino from 'pino';

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
  .name('seo-ads-expert')
  .description('AI-powered SEO & Google Ads planning tool for Chrome extensions')
  .version('1.0.0');

program
  .command('plan')
  .description('Generate SEO & Ads plan for a product')
  .requiredOption('-p, --product <name>', 'Product name (convertmyfile, palettekit, notebridge)')
  .option('-m, --markets <markets>', 'Target markets (comma-separated)', 'AU,US,GB')
  .option('--max-keywords <number>', 'Maximum keywords to analyze', '200')
  .option('--max-serp-calls <number>', 'Maximum SERP API calls', '30')
  .action(async (options) => {
    logger.info('Starting SEO & Ads plan generation...', options);
    
    try {
      const { generatePlan } = await import('./orchestrator.js');
      await generatePlan({
        product: options.product,
        markets: options.markets.split(','),
        maxKeywords: parseInt(options.maxKeywords),
        maxSerpCalls: parseInt(options.maxSerpCalls),
      });
      
      logger.info('✅ Plan generation completed successfully');
    } catch (error) {
      logger.error('❌ Plan generation failed:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List previous plans for a product')
  .requiredOption('-p, --product <name>', 'Product name')
  .action(async (options) => {
    logger.info('Listing plans for product:', options.product);
    
    try {
      const { listPlans } = await import('./orchestrator.js');
      const plans = await listPlans(options.product);
      
      if (plans.length === 0) {
        console.log(`No plans found for ${options.product}`);
        return;
      }
      
      console.log(`\nPlans for ${options.product}:\n`);
      plans.forEach(plan => {
        console.log(`📊 ${plan.date} - ${plan.markets.join(', ')} (${plan.keywordCount} keywords)`);
      });
      
    } catch (error) {
      logger.error('❌ Failed to list plans:', error);
      process.exit(1);
    }
  });

program
  .command('show')
  .description('Show details of a specific plan')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-d, --date <date>', 'Plan date (YYYY-MM-DD)')
  .action(async (options) => {
    logger.info('Showing plan details:', options);
    
    try {
      const { showPlan } = await import('./orchestrator.js');
      const plan = await showPlan(options.product, options.date);
      
      if (!plan) {
        console.log(`No plan found for ${options.product} on ${options.date}`);
        return;
      }
      
      console.log(`\n📊 ${options.product} - ${options.date}\n`);
      console.log(`Markets: ${plan.markets.join(', ')}`);
      console.log(`Keywords: ${plan.keywordCount}`);
      console.log(`Ad Groups: ${plan.adGroupCount}`);
      console.log(`SERP Calls: ${plan.serpCalls}`);
      console.log(`Cache Hit Rate: ${plan.cacheHitRate}%`);
      console.log(`\nFiles generated:`);
      console.log(`- ${plan.outputPath}/keywords.csv`);
      console.log(`- ${plan.outputPath}/ads.json`);
      console.log(`- ${plan.outputPath}/seo_pages.md`);
      console.log(`- ${plan.outputPath}/competitors.md`);
      console.log(`- ${plan.outputPath}/negatives.txt`);
      console.log(`- ${plan.outputPath}/summary.json`);
      
    } catch (error) {
      logger.error('❌ Failed to show plan:', error);
      process.exit(1);
    }
  });

program.parse();