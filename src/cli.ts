#!/usr/bin/env node
import { Command } from 'commander';
import pino from 'pino';
import { validateEnvironment } from './utils/validation.js';
import { validateProductExists } from './utils/product-loader.js';

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
    console.log('🚀 SEO & Ads Expert - Plan Generation\n');
    
    try {
      // Validate environment and product
      validateEnvironment();
      
      if (!validateProductExists(options.product)) {
        process.exit(1);
      }
      
      console.log(`📋 Product: ${options.product}`);
      console.log(`🌍 Markets: ${options.markets}`);
      console.log(`🎯 Max Keywords: ${options.maxKeywords}`);
      console.log(`📞 Max SERP Calls: ${options.maxSerpCalls}\n`);
      
      const { generatePlan } = await import('./orchestrator.js');
      await generatePlan({
        product: options.product,
        markets: options.markets.split(','),
        maxKeywords: parseInt(options.maxKeywords),
        maxSerpCalls: parseInt(options.maxSerpCalls),
      });
      
      console.log('\n🎉 Plan generation completed successfully!');
      console.log(`📊 View results: npx tsx src/cli.ts show --product ${options.product} --date ${new Date().toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('\n❌ Plan generation failed:', error instanceof Error ? error.message : error);
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
      console.log(`Keywords: ${plan.total_keywords}`);
      console.log(`Ad Groups: ${plan.total_ad_groups}`);
      console.log(`SERP Calls: ${plan.serp_calls_used}`);
      console.log(`Cache Hit Rate: ${plan.cache_hit_rate}%`);
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

// Add cache management commands
program
  .command('cache')
  .description('Cache management commands')
  .option('--clear', 'Clear all cached data')
  .option('--stats', 'Show cache statistics')
  .action(async (options) => {
    try {
      const { CacheManager } = await import('./utils/cache.js');
      const cache = new CacheManager();
      
      if (options.clear) {
        await cache.clearCache();
        console.log('✅ Cache cleared successfully');
      } else if (options.stats) {
        console.log('📊 Cache Statistics:\n');
        console.log(cache.generateCacheReport());
      } else {
        console.log('💡 Use --clear or --stats with the cache command');
      }
    } catch (error) {
      console.error('❌ Cache operation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Add connection test command
program
  .command('test')
  .description('Test API connections')
  .action(async () => {
    console.log('🧪 Testing API connections...\n');
    
    try {
      validateEnvironment();
      
      const { RapidApiSerpConnector } = await import('./connectors/rapid-serp.js');
      const { RapidApiKeywordConnector } = await import('./connectors/rapid-keywords.js');
      const { SearchConsoleConnector } = await import('./connectors/search-console.js');
      
      console.log('🔍 RapidAPI SERP:', new RapidApiSerpConnector().isConnected() ? '✅ Connected' : '❌ Failed');
      console.log('🔤 RapidAPI Keywords:', new RapidApiKeywordConnector().isConnected() ? '✅ Connected' : '❌ Failed');
      console.log('📊 Google Search Console:', new SearchConsoleConnector().isAvailable() ? '✅ Connected' : '⚠️ Optional');
      
      console.log('\n🎉 Connection test completed!');
    } catch (error) {
      console.error('❌ Connection test failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Add product validation command
program
  .command('validate')
  .description('Validate product configurations')
  .option('-p, --product <name>', 'Validate specific product')
  .action(async (options) => {
    try {
      const { loadProductConfig, getAvailableProducts } = await import('./utils/product-loader.js');
      
      if (options.product) {
        console.log(`🔍 Validating product: ${options.product}\n`);
        const config = loadProductConfig(options.product);
        console.log(`✅ Product configuration valid`);
        console.log(`📋 Markets: ${config.markets.join(', ')}`);
        console.log(`🎯 Seed queries: ${config.seed_queries.length}`);
        console.log(`📄 Target pages: ${config.target_pages.length}`);
        console.log(`🚫 Pre-seeded negatives: ${config.pre_seeded_negatives.length}`);
      } else {
        console.log('🔍 Validating all product configurations...\n');
        const products = getAvailableProducts();
        
        for (const product of products) {
          try {
            loadProductConfig(product);
            console.log(`✅ ${product}: Valid`);
          } catch (error) {
            console.log(`❌ ${product}: Invalid - ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Validation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();