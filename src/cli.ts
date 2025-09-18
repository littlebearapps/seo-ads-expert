#!/usr/bin/env node
import { Command } from 'commander';
import pino from 'pino';
import { validateEnvironment } from './utils/validation.js';
import { validateProductExists } from './utils/product-loader.js';
import { costMonitor } from './utils/cost-monitor.js';
import { googleAPIManager } from './utils/google-api-manager.js';
import path from 'path';
import { promises as fs } from 'fs';

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
  .version('1.7.0');

program
  .command('plan')
  .description('Generate SEO & Ads plan for a product')
  .requiredOption('-p, --product <name>', 'Product name (convertmyfile, palettekit, notebridge)')
  .option('-m, --markets <markets>', 'Target markets (comma-separated)', 'AU,US,GB')
  .option('--max-keywords <number>', 'Maximum keywords to analyze', '200')
  .option('--max-serp-calls <number>', 'Maximum SERP API calls', '30')
  .option('--format <format>', 'Output format: all (default), ads-editor, microsoft-ads', 'all')
  .option('--export <export>', 'Export additional data: utm-template', '')
  .option('--validate-only', 'Run validation checks only (no plan generation)')
  .option('--skip-health-check', 'Skip URL health checks (development/emergency)')
  .option('--diff-only', 'Generate diff against previous run only')
  .option('--dry-run', 'Show what would be generated without execution')
  .option('--include-bing', 'Include Bing/Edge keyword data for Microsoft Ads')
  .action(async (options) => {
    const startTime = Date.now();
    
    try {
      // Enhanced startup logging
      console.log('🚀 SEO & Ads Expert - Plan Generation');
      if (options.dryRun) console.log('🧪 DRY RUN MODE - No files will be generated');
      console.log('');
      
      // Enhanced validation with progress indicators
      console.log('⚡ Phase 1: Validation & Setup');
      process.stdout.write('  🔍 Environment validation... ');
      validateEnvironment();
      console.log('✅');
      
      process.stdout.write('  🏷️  Product validation... ');
      if (!validateProductExists(options.product)) {
        console.log('❌');
        console.error(`\n🚨 Product '${options.product}' not found`);
        console.error('💡 Available products: convertmyfile, palettekit, notebridge');
        process.exit(1);
      }
      console.log('✅');
      
      // Display configuration
      console.log('\n📋 Configuration:');
      console.log(`   Product: ${options.product}`);
      console.log(`   Markets: ${options.markets}`);
      console.log(`   Max Keywords: ${options.maxKeywords}`);
      console.log(`   Max SERP Calls: ${options.maxSerpCalls}`);
      console.log(`   Format: ${options.format}`);
      if (options.export) console.log(`   Export: ${options.export}`);
      if (options.validateOnly) console.log('   Mode: Validation Only');
      if (options.skipHealthCheck) console.log('   ⚠️  URL Health Checks: DISABLED');
      if (options.diffOnly) console.log('   Mode: Diff Only');
      
      // Handle special modes
      if (options.validateOnly) {
        console.log('\n⚡ Running validation checks only...');
        const { runValidationChecks } = await import('./orchestrator.js');
        const validationResult = await runValidationChecks({
          product: options.product,
          markets: options.markets.split(','),
          skipHealthCheck: options.skipHealthCheck
        });
        
        if (validationResult.success) {
          console.log('\n🎉 All validations passed!');
          console.log(`✅ Schema validation: ${validationResult.schema.valid ? 'PASS' : 'FAIL'}`);
          console.log(`✅ URL health checks: ${validationResult.health.healthy}/${validationResult.health.total} URLs healthy`);
          console.log(`✅ Claims validation: ${validationResult.claims.valid ? 'PASS' : 'FAIL'}`);
        } else {
          console.error('\n❌ Validation failures detected:');
          if (!validationResult.schema.valid) {
            console.error(`🚨 Schema issues: ${validationResult.schema.errors.join(', ')}`);
          }
          if (validationResult.health.failed > 0) {
            console.error(`🚨 Failed URLs: ${validationResult.health.failed} URLs are unreachable`);
          }
          if (!validationResult.claims.valid) {
            console.error(`🚨 Claims issues: ${validationResult.claims.errors.join(', ')}`);
          }
          process.exit(1);
        }
        return;
      }
      
      if (options.diffOnly) {
        console.log('\n⚡ Generating diff against previous run...');
        const { generateDiffOnly } = await import('./orchestrator.js');
        const diffResult = await generateDiffOnly({
          product: options.product,
          markets: options.markets.split(',')
        });
        
        if (diffResult.changes.length === 0) {
          console.log('\n✨ No changes detected since last run');
        } else {
          console.log(`\n📊 Found ${diffResult.changes.length} changes:`);
          diffResult.changes.forEach(change => {
            console.log(`  ${change.type}: ${change.description}`);
          });
          console.log(`\n📄 Diff saved: ${diffResult.outputPath}`);
        }
        return;
      }
      
      // Export UTM template if requested
      if (options.export === 'utm-template') {
        console.log('\n⚡ Generating UTM template...');
        const { generateUtmTemplate } = await import('./orchestrator.js');
        const utmTemplate = await generateUtmTemplate(options.product);
        console.log('\n📋 UTM Template (copy-paste ready):');
        console.log(`${utmTemplate}`);
        console.log('\n💡 Add this suffix to all campaign URLs');
      }
      
      // Main plan generation with enhanced progress tracking
      console.log('\n⚡ Phase 2: Plan Generation');
      const planOptions = {
        product: options.product,
        markets: options.markets.split(','),
        maxKeywords: parseInt(options.maxKeywords),
        maxSerpCalls: parseInt(options.maxSerpCalls),
        format: options.format,
        skipHealthCheck: options.skipHealthCheck,
        dryRun: options.dryRun,
        includeBingData: options.includeBing || false
      };
      
      const { generatePlan } = await import('./orchestrator.js');
      const result = await generatePlan(planOptions);
      
      // Enhanced completion reporting
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n🎉 Plan generation completed in ${duration}s!`);
      
      if (!options.dryRun) {
        console.log('\n📊 Generation Summary:');
        console.log(`   Keywords analyzed: ${result.keywordCount || 'N/A'}`);
        console.log(`   Ad groups created: ${result.adGroupCount || 'N/A'}`);
        console.log(`   SERP calls used: ${result.serpCalls || 0}/${options.maxSerpCalls}`);
        console.log(`   Cache hit rate: ${result.cacheHitRate || 0}%`);
        
        if (result.warnings && result.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          result.warnings.forEach(warning => console.log(`   ${warning}`));
        }
        
        console.log('\n📁 Files generated:');
        if (options.format === 'all' || options.format === 'ads-editor') {
          console.log(`   📊 ${result.outputPath}/keywords.csv`);
        }
        if (options.format === 'all') {
          console.log(`   📝 ${result.outputPath}/ads.json`);
          console.log(`   📄 ${result.outputPath}/seo_pages.md`);
          console.log(`   🏢 ${result.outputPath}/competitors.md`);
          console.log(`   🚫 ${result.outputPath}/negatives.txt`);
          console.log(`   📋 ${result.outputPath}/summary.json`);
          console.log(`   🔍 ${result.outputPath}/diff.json`);
        }
        
        console.log(`\n💡 View details: npx tsx src/cli.ts show --product ${options.product} --date ${new Date().toISOString().split('T')[0]}`);
      } else {
        console.log('\n🧪 DRY RUN - This is what would have been generated:');
        console.log(`   📊 ${result.plannedFiles?.join('\n   📊 ') || 'Standard output files'}`);
      }
      
    } catch (error) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.error(`\n❌ Plan generation failed after ${duration}s`);
      
      if (error instanceof Error) {
        console.error(`\n🚨 Error: ${error.message}`);
        
        // Enhanced error messages with remediation steps
        if (error.message.includes('validation')) {
          console.error('💡 Try running with --validate-only to see detailed validation errors');
        } else if (error.message.includes('health check')) {
          console.error('💡 Try running with --skip-health-check to bypass URL validation');
        } else if (error.message.includes('SERP') || error.message.includes('API')) {
          console.error('💡 Check API connections with: npx tsx src/cli.ts test');
          console.error('💡 Try reducing --max-serp-calls to avoid rate limits');
        } else if (error.message.includes('timeout')) {
          console.error('💡 The operation timed out. Try reducing --max-keywords or --max-serp-calls');
        } else if (error.message.includes('quota')) {
          console.error('💡 API quota exceeded. Wait before trying again or reduce limits');
        }
        
        // Log full stack trace for debugging
        logger.debug('Full error stack:', error.stack);
      } else {
        console.error(`🚨 Unknown error: ${error}`);
      }
      
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

// v1.4 Performance Analysis Commands
const performance = new Command('performance')
  .description('Performance analysis and optimization commands');

performance
  .command('ingest-ads')
  .description('Import Google Ads performance data')
  .requiredOption('-p, --product <product>', 'Product name')
  .option('-f, --from <source>', 'Data source: gaql or csv', 'csv')
  .option('--file <path>', 'CSV file path if source=csv')
  .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('--end-date <date>', 'End date (YYYY-MM-DD)')
  .option('--batch-size <size>', 'Batch size for memory management', '1000')
  .action(async (options) => {
    console.log('📊 Ingesting Google Ads performance data...\n');
    
    try {
      const { ingestPerformanceData } = await import('./commands/ingest-ads.js');
      await ingestPerformanceData({
        product: options.product,
        source: options.from,
        filePath: options.file,
        dateRange: {
          start: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: options.endDate || new Date().toISOString().split('T')[0]
        },
        batchSize: parseInt(options.batchSize)
      });
      
      console.log('\n✅ Performance data ingested successfully!');
    } catch (error) {
      console.error('❌ Failed to ingest performance data:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

performance
  .command('analyze-waste')
  .description('Analyze waste and propose negative keywords')
  .requiredOption('-p, --product <product>', 'Product name')
  .option('-w, --window <days>', 'Analysis window in days', '30')
  .option('--min-spend <amount>', 'Minimum wasted spend threshold', '10')
  .option('--min-impr <count>', 'Minimum impressions threshold', '100')
  .option('--memory-limit <mb>', 'Memory limit for processing', '512')
  .action(async (options) => {
    console.log('🔍 Analyzing waste and generating negative keywords...\n');
    
    try {
      const { analyzeWaste } = await import('./commands/analyze-waste.js');
      const results = await analyzeWaste({
        product: options.product,
        windowDays: parseInt(options.window),
        minSpend: parseFloat(options.minSpend),
        minImpressions: parseInt(options.minImpr),
        memoryLimit: parseInt(options.memoryLimit)
      });
      
      console.log(`\n✅ Analysis complete!`);
      console.log(`💸 Total waste identified: $${results.totalWaste.toFixed(2)}`);
      console.log(`🚫 Negatives proposed: ${results.negativesCount}`);
      console.log(`📁 Report saved to: ${results.outputPath}`);
    } catch (error) {
      console.error('❌ Failed to analyze waste:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

performance
  .command('quality-score')
  .description('Analyze and triage Quality Score issues')
  .requiredOption('-p, --product <product>', 'Product name')
  .option('--concurrent-checks <n>', 'Concurrent URL health checks', '5')
  .option('--include-health', 'Include landing page health analysis')
  .action(async (options) => {
    console.log('⚡ Analyzing Quality Score issues...\n');
    
    try {
      const { analyzeQualityScore } = await import('./commands/quality-score.js');
      const results = await analyzeQualityScore({
        product: options.product,
        concurrentChecks: parseInt(options.concurrentChecks),
        includeHealth: options.includeHealth || false
      });
      
      console.log(`\n✅ Quality Score analysis complete!`);
      console.log(`📊 Ad groups analyzed: ${results.adGroupCount}`);
      console.log(`⚠️ Low QS ad groups: ${results.lowQsCount}`);
      console.log(`💡 Recommendations: ${results.recommendationsCount}`);
      console.log(`📁 Report saved to: ${results.outputPath}`);
    } catch (error) {
      console.error('❌ Failed to analyze Quality Score:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

performance
  .command('paid-organic-gaps')
  .description('Analyze paid/organic synergy opportunities')
  .requiredOption('-p, --product <product>', 'Product name')
  .action(async (options) => {
    console.log('🔄 Analyzing paid/organic gaps...\n');
    
    try {
      const { analyzePaidOrganicGaps } = await import('./commands/paid-organic-gaps.js');
      const results = await analyzePaidOrganicGaps({
        product: options.product
      });
      
      console.log(`\n✅ Gap analysis complete!`);
      console.log(`🎯 SEO wins without paid: ${results.seoWinsNoPaid}`);
      console.log(`💰 Paid wins without SEO: ${results.paidWinsNoSeo}`);
      console.log(`🌟 Both winning: ${results.bothWinning}`);
      console.log(`📁 Report saved to: ${results.outputPath}`);
    } catch (error) {
      console.error('❌ Failed to analyze gaps:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.addCommand(performance);

// Add budget monitoring command
program
  .command('monitor')
  .description('Monitor API usage and costs')
  .option('--detailed', 'Show detailed service breakdown')
  .action(async (options) => {
    console.log('💰 SEO Ads Expert - Cost Monitor\n');
    
    try {
      const summary = await costMonitor.getUsageSummary();
      
      console.log('📊 Today\'s Usage:');
      console.log(`   Cost: $${summary.today.totalCost.toFixed(4)} / $${summary.limits.dailyCost} (${((summary.today.totalCost / summary.limits.dailyCost) * 100).toFixed(1)}%)`);
      console.log(`   Calls: ${summary.today.totalCalls} / ${summary.limits.dailyCalls} (${((summary.today.totalCalls / summary.limits.dailyCalls) * 100).toFixed(1)}%)`);
      
      console.log('\n📈 This Month:');
      console.log(`   Cost: $${summary.month.toFixed(2)} / $${summary.limits.monthlyCost} (${((summary.month / summary.limits.monthlyCost) * 100).toFixed(1)}%)`);
      
      if (options.detailed || Object.keys(summary.today.services).length > 0) {
        console.log('\n🔧 By Service:');
        Object.entries(summary.today.services).forEach(([service, usage]) => {
          console.log(`   ${service}: $${usage.cost.toFixed(4)} (${usage.calls} calls)`);
        });
      }
      
      if (summary.alerts.length > 0) {
        console.log('\n⚠️  Alerts:');
        summary.alerts.forEach(alert => console.log(`   • ${alert}`));
      } else {
        console.log('\n✅ All usage within limits');
      }
      
      console.log('\n💡 Usage Tips:');
      console.log('• Set lower limits in .env to reduce costs');
      console.log('• Use caching to avoid repeated API calls');
      console.log('• Monitor weekly with: npx tsx src/cli.ts monitor');
      
    } catch (error) {
      console.error('❌ Error monitoring costs:', error instanceof Error ? error.message : error);
    }
  });

// Add Google API management commands
const api = new Command('api')
  .description('Google API management and configuration');

api
  .command('check')
  .description('Check Google API setup and status')
  .option('--detailed', 'Show detailed quota information')
  .action(async (options) => {
    console.log('🔍 Checking Google APIs Setup...\n');
    
    try {
      const initialized = await googleAPIManager.initializeAuth();
      if (!initialized) {
        console.error('❌ Failed to initialize authentication');
        console.error('💡 Make sure to set up credentials first:');
        console.error('   1. Set GOOGLE_CLOUD_PROJECT_ID in .env');
        console.error('   2. Run: node scripts/generate-google-ads-token.js');
        console.error('   3. Or ensure GOOGLE_APPLICATION_CREDENTIALS points to service account key');
        process.exit(1);
      }

      console.log('✅ Authentication successful\n');

      // Check project info
      const projectInfo = await googleAPIManager.checkProjectInfo();
      console.log('📋 Project Information:');
      console.log(`   Project ID: ${projectInfo.projectId}`);
      console.log(`   Project Name: ${projectInfo.projectName}`);
      console.log(`   Billing: ${projectInfo.billingEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      
      // Check API statuses
      console.log('\n🔌 API Status:');
      const apiStatuses = await googleAPIManager.checkAPIStatuses();
      
      for (const api of apiStatuses) {
        console.log(`\n   ${api.service}:`);
        console.log(`     Status: ${api.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`     Auth: ${api.credentials}`);
        
        if (api.error) {
          console.log(`     Error: ❌ ${api.error}`);
        }
        
        if (options.detailed && api.hasQuota && api.quotaDetails) {
          console.log('     Quotas:');
          api.quotaDetails.forEach((quota: any) => {
            console.log(`       • ${quota.name}`);
          });
        }
      }

      // Generate recommendations
      const disabledAPIs = apiStatuses.filter(api => !api.enabled);
      if (disabledAPIs.length > 0) {
        console.log('\n💡 Next Steps:');
        console.log(`   ${disabledAPIs.length} APIs need to be enabled:`);
        disabledAPIs.forEach(api => console.log(`   • ${api.service}`));
        console.log('\n   Run: npx tsx src/cli.ts api enable');
      } else {
        console.log('\n🎉 All required APIs are enabled!');
      }

    } catch (error) {
      console.error('❌ Error checking APIs:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

api
  .command('enable')
  .description('Enable required Google APIs')
  .action(async () => {
    console.log('🔧 Enabling Google APIs...\n');
    
    try {
      const initialized = await googleAPIManager.initializeAuth();
      if (!initialized) {
        console.error('❌ Authentication failed');
        process.exit(1);
      }

      const apisToEnable = [
        'googleads.googleapis.com',
        'analyticsdata.googleapis.com',
        'searchconsole.googleapis.com'
      ];

      const results = await googleAPIManager.enableAPIs(apisToEnable);
      
      console.log('📊 Results:');
      Object.entries(results).forEach(([api, success]) => {
        console.log(`   ${api}: ${success ? '✅ Enabled' : '❌ Failed'}`);
      });

      const successCount = Object.values(results).filter(Boolean).length;
      if (successCount === apisToEnable.length) {
        console.log('\n🎉 All APIs enabled successfully!');
        console.log('💡 Wait 1-2 minutes for changes to propagate, then run: npx tsx src/cli.ts api check');
      } else {
        console.log('\n⚠️  Some APIs failed to enable. Check permissions and try again.');
      }

    } catch (error) {
      console.error('❌ Error enabling APIs:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

api
  .command('report')
  .description('Generate comprehensive API setup report')
  .action(async () => {
    console.log('📋 Generating API Setup Report...\n');
    
    try {
      const initialized = await googleAPIManager.initializeAuth();
      if (!initialized) {
        console.error('❌ Authentication failed - report will be limited');
      }

      const report = await googleAPIManager.generateAPIReport();
      console.log(report);
      
      // Save report to file
      const reportPath = path.join(process.cwd(), 'docs', 'api-setup-report.md');
      await import('fs').then(fs => fs.promises.writeFile(reportPath, report));
      console.log(`\n💾 Report saved to: ${reportPath}`);

    } catch (error) {
      console.error('❌ Error generating report:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.addCommand(api);

// Add experiment commands
import { setupExperimentCommands } from './cli-experiments.js';
setupExperimentCommands(program);

// SERP monitoring commands
program
  .command('serp-monitor')
  .description('Monitor SERP changes and generate alerts')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('-k, --keywords <list>', 'Comma-separated keywords to monitor')
  .option('-m, --markets <list>', 'Markets to monitor (default: AU,US)', 'AU,US')
  .option('--snapshot', 'Create SERP snapshot for comparison')
  .action(async (options) => {
    try {
      const { SerpWatchMonitor } = await import('./monitors/serp-watch.js');
      const monitor = new SerpWatchMonitor();
      
      const keywords = options.keywords ? options.keywords.split(',') : [];
      const markets = options.markets.split(',');
      
      if (options.snapshot) {
        // Create snapshot
        logger.info('📸 Creating SERP snapshot...');
        for (const keyword of keywords) {
          for (const market of markets) {
            await monitor.createSnapshot(keyword, market, options.product);
          }
        }
        logger.info('✅ SERP snapshots created');
      } else {
        // Monitor for changes
        logger.info('👀 Monitoring SERP changes...');
        const changes = await monitor.monitorChanges(options.product, keywords, markets);
        
        if (changes.length > 0) {
          logger.warn(`⚠️ ${changes.length} SERP changes detected!`);
          changes.forEach(change => {
            logger.info(`  - ${change.keyword} (${change.market}): ${change.description}`);
          });
        } else {
          logger.info('✅ No significant SERP changes detected');
        }
      }
    } catch (error) {
      logger.error('❌ SERP monitoring failed:', error);
      process.exit(1);
    }
  });

program
  .command('serp-drift')
  .description('Analyze SERP drift patterns and generate strategic recommendations')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('-d, --days <number>', 'Days to analyze (default: 30)', '30')
  .option('-o, --output <path>', 'Output path for report')
  .action(async (options) => {
    try {
      const { SerpDriftAnalyzer } = await import('./analyzers/serp-drift.js');
      const analyzer = new SerpDriftAnalyzer();
      
      logger.info('📊 Analyzing SERP drift patterns...');
      const analysis = await analyzer.analyzeDrift(options.product, parseInt(options.days));
      
      // Generate report
      const report = analyzer.generateReport(analysis);
      
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, JSON.stringify(report, null, 2));
        logger.info(`✅ SERP drift report saved to: ${options.output}`);
      } else {
        // Console summary
        logger.info('📈 SERP Drift Analysis Summary:');
        logger.info(`  Volatility Score: ${report.volatilityScore}/100`);
        logger.info(`  Trend: ${report.trend}`);
        logger.info(`  Recommended Strategy: ${report.strategy}`);
        if (report.alerts.length > 0) {
          logger.warn(`  ⚠️ ${report.alerts.length} alerts generated`);
        }
      }
    } catch (error) {
      logger.error('❌ SERP drift analysis failed:', error);
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
  .description('Validate product configurations or CSV imports')
  .option('-p, --product <name>', 'Validate specific product')
  .option('--csv <path>', 'Validate CSV file for import')
  .option('--csv-type <type>', 'CSV type: kwp, campaigns, keywords, ads', 'kwp')
  .option('--batch <paths>', 'Validate multiple CSV files (comma-separated)')
  .option('--report', 'Generate detailed validation report')
  .action(async (options) => {
    try {
      // Handle CSV validation
      if (options.csv || options.batch) {
        const { 
          validateKeywordPlannerCsv,
          validateEditorImportCsv,
          validateBatch,
          generateValidationReport
        } = await import('./validators/csv-import-validator.js');
        
        console.log('📊 CSV Import Validation\n');
        
        if (options.batch) {
          // Batch validation
          const files = options.batch.split(',').map((path: string) => ({
            path: path.trim(),
            type: options.csvType as 'kwp' | 'campaigns' | 'keywords' | 'ads'
          }));
          
          const results = await validateBatch(files);
          
          // Display results
          for (const [file, result] of Object.entries(results)) {
            console.log(`\n📄 ${file}:`);
            console.log(`   Status: ${result.valid ? '✅ Valid' : '❌ Invalid'}`);
            console.log(`   Rows: ${result.stats.validRows}/${result.stats.totalRows} valid`);
            if (result.errors.length > 0) {
              console.log(`   Errors: ${result.errors.length}`);
            }
            if (result.warnings.length > 0) {
              console.log(`   Warnings: ${result.warnings.length}`);
            }
          }
          
          if (options.report) {
            const report = generateValidationReport(results);
            const reportPath = `./validation-report-${Date.now()}.md`;
            await import('fs').then(fs => fs.promises.writeFile(reportPath, report));
            console.log(`\n💾 Report saved to: ${reportPath}`);
          }
          
        } else {
          // Single file validation
          const result = options.csvType === 'kwp' 
            ? validateKeywordPlannerCsv(options.csv)
            : validateEditorImportCsv(options.csv, options.csvType as 'campaigns' | 'keywords' | 'ads');
          
          console.log(`📄 File: ${options.csv}`);
          console.log(`   Type: ${options.csvType}`);
          console.log(`   Status: ${result.valid ? '✅ Valid' : '❌ Invalid'}`);
          console.log(`\n📊 Statistics:`);
          console.log(`   Total Rows: ${result.stats.totalRows}`);
          console.log(`   Valid Rows: ${result.stats.validRows}`);
          console.log(`   Error Rows: ${result.stats.errorRows}`);
          console.log(`   Warning Rows: ${result.stats.warningRows}`);
          
          if (result.errors.length > 0) {
            console.log(`\n❌ Errors (first 5):`);
            result.errors.slice(0, 5).forEach(err => {
              console.log(`   Row ${err.row}, Col "${err.column}": ${err.message}`);
            });
            if (result.errors.length > 5) {
              console.log(`   ... and ${result.errors.length - 5} more`);
            }
          }
          
          if (result.warnings.length > 0) {
            console.log(`\n⚠️  Warnings (first 5):`);
            result.warnings.slice(0, 5).forEach(warn => {
              console.log(`   Row ${warn.row}, Col "${warn.column}": ${warn.message}`);
            });
            if (result.warnings.length > 5) {
              console.log(`   ... and ${result.warnings.length - 5} more`);
            }
          }
          
          if (Object.keys(result.stats.missingValues).length > 0) {
            console.log(`\n📉 Missing Values:`);
            for (const [field, count] of Object.entries(result.stats.missingValues)) {
              console.log(`   ${field}: ${count} rows`);
            }
          }
          
          if (options.report) {
            const report = generateValidationReport({ [options.csv]: result });
            const reportPath = `./validation-report-${Date.now()}.md`;
            await import('fs').then(fs => fs.promises.writeFile(reportPath, report));
            console.log(`\n💾 Report saved to: ${reportPath}`);
          }
        }
        
        return;
      }
      
      // Original product validation
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

// Add One-Click Apply command
program
  .command('apply')
  .description('Apply generated plan directly to Google Ads (one-click campaign creation)')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-c, --customer-id <id>', 'Google Ads customer ID')
  .option('--plan-date <date>', 'Plan date (YYYY-MM-DD)', new Date().toISOString().split('T')[0])
  .option('--budget <amount>', 'Override daily budget amount')
  .option('--start-date <date>', 'Campaign start date (YYYY-MM-DD)')
  .option('--auto-start', 'Automatically start campaign after creation')
  .option('--test-mode', 'Run in test mode (no actual creation)')
  .option('--validate-only', 'Only validate account, don\'t create campaign')
  .action(async (options) => {
    console.log('🚀 One-Click Campaign Apply\n');
    
    try {
      const { oneClickApplier } = await import('./appliers/one-click-apply.js');
      const { join } = await import('path');
      
      // Validate account first
      if (options.validateOnly) {
        console.log('🔍 Validating Google Ads account...');
        const validation = await oneClickApplier.validateAccount(options.customerId);
        
        if (validation.valid) {
          console.log('✅ Account validation successful');
        } else {
          console.log('❌ Account validation failed:');
          validation.errors.forEach(err => console.log(`   - ${err}`));
        }
        
        if (validation.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          validation.warnings.forEach(warn => console.log(`   - ${warn}`));
        }
        
        return;
      }
      
      // Build plan path
      const planPath = join('plans', options.product, options.planDate);
      
      console.log(`📄 Loading plan from: ${planPath}`);
      console.log(`🎯 Target account: ${options.customerId}`);
      
      if (options.testMode) {
        console.log('\n🧪 TEST MODE - No actual campaigns will be created\n');
      }
      
      // Apply the plan
      const result = await oneClickApplier.apply({
        planPath,
        customerId: options.customerId,
        testMode: options.testMode || false,
        budgetOverride: options.budget ? parseFloat(options.budget) : undefined,
        startDate: options.startDate,
        autoStart: options.autoStart || false
      });
      
      // Display results
      if (result.success) {
        console.log('\n✅ Campaign created successfully!');
        console.log(`   Campaign ID: ${result.campaignId}`);
        console.log(`   Ad Groups: ${result.adGroupIds.length}`);
        console.log(`   Keywords: ${result.keywordCount}`);
        console.log(`   Ads: ${result.adCount}`);
        
        if (!options.autoStart) {
          console.log('\n💡 Campaign is PAUSED. Start it manually in Google Ads when ready.');
        }
      } else {
        console.log('\n❌ Campaign creation failed');
        result.errors.forEach(err => {
          console.log(`   ${err.entity}: ${err.message}`);
        });
      }
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(warn => console.log(`   - ${warn}`));
      }
      
      if (result.rollbackAvailable) {
        console.log('\n🔄 Rollback available if needed');
      }
      
    } catch (error) {
      console.error('❌ Apply failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Add Edge Store audit command
program
  .command('edge-store-audit')
  .description('Generate comprehensive Edge Store audit report')
  .requiredOption('-p, --product <name>', 'Product name')
  .action(async (options) => {
    console.log(`🏪 Generating Edge Store audit for ${options.product}...\n`);
    
    try {
      const { EdgeStoreAnalyzer } = await import('./analyzers/edge-store-analyzer.js');
      const { EdgeStoreAuditWriter } = await import('./writers/edge-store-audit-writer.js');
      const { join } = await import('path');
      
      // Sample listing data (in production, this would come from actual store data)
      const listing = {
        name: `${options.product.charAt(0).toUpperCase()}${options.product.slice(1)} - Chrome Extension`,
        shortDescription: 'Professional Chrome extension with advanced features for productivity',
        detailedDescription: `Advanced Chrome extension that helps users with productivity and workflow optimization.`,
        keywords: ['chrome extension', 'productivity', 'tools', 'browser extension'],
        category: 'Developer Tools',
        screenshots: [
          { url: 'screenshot1.png', caption: 'Main interface' },
          { url: 'screenshot2.png', caption: 'Features overview' }
        ]
      };
      
      // Sample keyword data (in production, this would come from keyword analysis)
      const keywordData = [
        { keyword: 'chrome extension', volume: 1000, competition: 'medium', cpc: 0.8, score: 0.85 },
        { keyword: 'productivity tools', volume: 800, competition: 'low', cpc: 0.5, score: 0.80 },
        { keyword: 'browser extension', volume: 600, competition: 'low', cpc: 0.4, score: 0.75 },
        { keyword: 'developer tools', volume: 500, competition: 'medium', cpc: 0.9, score: 0.70 }
      ];
      
      // Run analysis
      const analyzer = new EdgeStoreAnalyzer();
      const optimization = await analyzer.analyzeWithKeywordData(listing, keywordData);
      
      // Generate audit report
      const writer = new EdgeStoreAuditWriter();
      const date = new Date().toISOString().split('T')[0];
      const outputPath = join('plans', options.product, date, 'edge-store-audit.md');
      await writer.writeEdgeStoreAudit(options.product, optimization, outputPath);
      
      console.log('✅ Edge Store audit completed!');
      console.log(`📁 Report saved to: ${outputPath}`);
      console.log(`\n📊 Expected Impact:`);
      console.log(`- Discoverability: +${optimization.expectedLift.discoverability}%`);
      console.log(`- Click-Through Rate: +${optimization.expectedLift.ctr}%`);
      console.log(`- Install Rate: +${optimization.expectedLift.installs}%`);
      
    } catch (error) {
      console.error('❌ Edge Store audit failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Add cross-platform analysis command
program
  .command('cross-platform')
  .description('Analyze cross-platform performance (Google + Microsoft Ads)')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('--start <date>', 'Start date (YYYY-MM-DD)')
  .option('--end <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    console.log(`🖥️ Analyzing cross-platform performance for ${options.product}...\n`);
    
    try {
      const { CrossPlatformMonitor } = await import('./monitors/cross-platform-monitor.js');
      
      const monitor = new CrossPlatformMonitor();
      const dateRange = options.start && options.end ? 
        { start: options.start, end: options.end } : 
        undefined;
      
      const { metrics, insights } = await monitor.generateCrossPlatformReport(options.product, dateRange);
      
      console.log('📊 Cross-Platform Performance Report');
      console.log('='.repeat(50));
      
      // Combined metrics
      console.log('\n📈 Combined Performance');
      console.log(`Total Impressions: ${metrics.combined.totalImpressions.toLocaleString()}`);
      console.log(`Total Clicks: ${metrics.combined.totalClicks.toLocaleString()}`);
      console.log(`Total Cost: $${metrics.combined.totalCost.toFixed(2)}`);
      console.log(`Average CTR: ${(metrics.combined.avgCTR * 100).toFixed(2)}%`);
      console.log(`Average CPC: $${metrics.combined.avgCPC.toFixed(2)}`);
      
      // Platform comparison
      if (metrics.platforms.google && metrics.platforms.microsoft) {
        console.log('\n🏆 Platform Comparison');
        console.log(`Google Share: ${metrics.comparison.platformSplit.google}%`);
        console.log(`Microsoft Share: ${metrics.comparison.platformSplit.microsoft}%`);
        console.log(`Performance Leader: ${metrics.comparison.performanceLeader}`);
        console.log(`Cost Efficiency Leader: ${metrics.comparison.costEfficiencyLeader}`);
      }
      
      // Top opportunities
      if (insights.opportunities.length > 0) {
        console.log('\n💡 Top Opportunities');
        insights.opportunities.slice(0, 3).forEach((opp, i) => {
          console.log(`${i + 1}. ${opp.title} (${opp.platform.toUpperCase()})`);
          console.log(`   Impact: ${opp.potentialImpact.toUpperCase()}, Effort: ${opp.effort.toUpperCase()}`);
        });
      }
      
      // Budget recommendations
      console.log('\n💰 Budget Allocation');
      console.log(`Recommended Google: ${insights.budgetAllocation.recommended.google}%`);
      console.log(`Recommended Microsoft: ${insights.budgetAllocation.recommended.microsoft}%`);
      console.log(`Reasoning: ${insights.budgetAllocation.reasoning}`);
      
      console.log('\n✅ Cross-platform analysis completed!');
      
    } catch (error) {
      console.error('❌ Cross-platform analysis failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// v1.8 Schema Generation Commands
program
  .command('schema-emit')
  .description('Generate JSON-LD schema markup for a product')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('--types <types>', 'Schema types to generate (comma-separated)', 'all')
  .option('--validate', 'Validate schemas and show lint report')
  .option('--format <format>', 'Output format: jsonl (default), json, individual', 'jsonl')
  .option('--output <path>', 'Output path (default: plans/product/date/)')
  .option('--apply-claims', 'Apply claims validation gates to clean up forbidden claims')
  .option('--enhanced', 'Generate enhanced schemas with smart defaults')
  .action(async (options) => {
    console.log(`📋 Generating schema markup for ${options.product}...\n`);

    try {
      const { SchemaGenerator } = await import('./schema/schema-generator.js');
      const { SchemaValidator } = await import('./schema/schema-validator.js');
      const { SchemaReporter } = await import('./schema/schema-reporter.js');
      const { SchemaType } = await import('./schema/types.js');
      const { join } = await import('path');
      const { writeFileSync, mkdirSync } = await import('fs');

      // Load existing plan data for context
      const planDate = new Date().toISOString().split('T')[0];
      const planPath = join('plans', options.product, planDate);

      let productData;
      try {
        const keywordsPath = join(planPath, 'keywords.csv');
        // In a real implementation, we'd load existing plan data
        // For now, create sample data based on product
        productData = {
          product: options.product,
          name: options.product === 'convertmyfile' ? 'ConvertMyFile' :
                options.product === 'palettekit' ? 'PaletteKit' :
                options.product === 'notebridge' ? 'NoteBridge' :
                options.product.charAt(0).toUpperCase() + options.product.slice(1),
          description: `Privacy-friendly ${options.product} Chrome extension for enhanced productivity`,
          url: `https://littlebearapps.com/${options.product}`,
          applicationCategory: 'BrowserApplication',
          operatingSystem: 'Any',
          price: '0',
          currency: 'USD',
          ratingValue: 4.8,
          ratingCount: 1234,
          questions: [
            { question: `Is ${options.product} free to use?`, answer: 'Yes, completely free with all features available.' },
            { question: 'How does privacy protection work?', answer: 'All processing happens locally in your browser for complete privacy.' },
            { question: 'What browsers are supported?', answer: 'Chrome and all Chromium-based browsers are fully supported.' }
          ],
          steps: [
            { name: 'Install Extension', text: `Install ${options.product} from the Chrome Web Store` },
            { name: 'Access Features', text: 'Right-click or use the extension icon to access features' },
            { name: 'Complete Task', text: 'Follow the intuitive interface to complete your task' },
            { name: 'Enjoy Results', text: 'Your results are processed locally and securely' }
          ],
          breadcrumbs: [
            { name: 'Home', url: 'https://littlebearapps.com', position: 1 },
            { name: 'Extensions', url: 'https://littlebearapps.com/extensions', position: 2 },
            { name: options.product, url: `https://littlebearapps.com/${options.product}`, position: 3 }
          ],
          article: {
            headline: `Complete Guide to ${options.product}: Privacy-First Browser Extension`,
            author: 'Little Bear Apps',
            datePublished: planDate,
            wordCount: 1500
          }
        };
      } catch (error) {
        console.log('⚠️  No existing plan found, using generated data');
      }

      const generator = new SchemaGenerator();
      const validator = new SchemaValidator();

      // Determine schema types to generate
      let schemaTypes: string[];
      if (options.types === 'all') {
        schemaTypes = generator.getAvailableTypes();
      } else {
        schemaTypes = options.types.split(',').map((t: string) => t.trim());
        // Validate types
        const validTypes = generator.getAvailableTypes();
        const invalidTypes = schemaTypes.filter(t => !validTypes.includes(t));
        if (invalidTypes.length > 0) {
          throw new Error(`Invalid schema types: ${invalidTypes.join(', ')}. Available: ${validTypes.join(', ')}`);
        }
      }

      console.log(`🔧 Generating ${schemaTypes.length} schema types: ${schemaTypes.join(', ')}`);

      // Generate schemas
      const schemas = [];
      for (const type of schemaTypes) {
        try {
          let schema;
          if (options.enhanced) {
            schema = generator.generateEnhanced(type as any, productData);
          } else {
            schema = generator.generate(type as any, productData);
          }

          // Apply claims validation if requested
          if (options.applyClaims) {
            schema = validator.applyClaims(schema);
          }

          schemas.push(schema);
          console.log(`  ✅ ${type} schema generated`);
        } catch (error) {
          console.log(`  ❌ ${type} schema failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Validation and reporting
      if (options.validate) {
        console.log('\n📊 Validation Report:');
        const reporter = new SchemaReporter();
        const report = reporter.generateReport(schemas);

        console.log(`  Pass Rate: ${report.summary.passRate}%`);
        console.log(`  Valid Schemas: ${report.summary.validSchemas}/${report.summary.totalSchemas}`);
        console.log(`  Issues: ${report.summary.totalIssues} (${report.summary.criticalIssues} critical, ${report.summary.majorIssues} major)`);

        if (report.summary.totalIssues > 0) {
          console.log('\n🔍 Top Issues:');
          const topIssues = report.details
            .filter(d => !d.valid)
            .slice(0, 3);

          topIssues.forEach(issue => {
            console.log(`  ❌ ${issue.name}: ${issue.errors.length} errors, ${issue.warnings.length} warnings`);
          });
        }

        if (report.recommendations.length > 0) {
          console.log('\n💡 Top Recommendations:');
          report.recommendations.slice(0, 2).forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec.title} (Priority: ${rec.priority}/10)`);
          });
        }
      }

      // Save schemas
      const outputPath = options.output || planPath;
      mkdirSync(outputPath, { recursive: true });

      let filename: string;
      let content: string;

      switch (options.format) {
        case 'json':
          filename = 'schemas.json';
          content = JSON.stringify(schemas, null, 2);
          break;
        case 'individual':
          // Save each schema as separate file
          schemas.forEach((schema, index) => {
            const schemaFilename = `schema-${schema['@type'].toLowerCase()}.json`;
            const schemaPath = join(outputPath, schemaFilename);
            writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
            console.log(`📁 Saved: ${schemaPath}`);
          });
          filename = ''; // No combined file
          content = '';
          break;
        default: // jsonl
          filename = 'schemas.jsonl';
          content = schemas.map(schema => JSON.stringify(schema)).join('\n');
          break;
      }

      if (filename) {
        const outputFilePath = join(outputPath, filename);
        writeFileSync(outputFilePath, content);
        console.log(`\n📁 Schemas saved to: ${outputFilePath}`);
      }

      // Save validation report if requested
      if (options.validate) {
        const reporter = new SchemaReporter();
        const report = reporter.generateReport(schemas);

        const reportPath = join(outputPath, 'schema-validation-report.md');
        writeFileSync(reportPath, report.markdown);
        console.log(`📊 Validation report saved to: ${reportPath}`);
      }

      console.log(`\n✅ Schema generation completed! Generated ${schemas.length} schemas.`);

    } catch (error) {
      console.error('❌ Schema generation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// v1.8 Content Planning Commands
program
  .command('content-roadmap')
  .description('Generate prioritized content roadmap based on entity gaps')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('--clusters <clusters>', 'Specific clusters (comma-separated)', '')
  .option('--max-items <number>', 'Maximum content items to generate', '20')
  .option('--format <format>', 'Output format: markdown (default), csv, json', 'markdown')
  .option('--include-faqs', 'Include FAQ extraction and recommendations')
  .option('--output <path>', 'Output path (default: plans/product/date/)')
  .action(async (options) => {
    console.log(`📝 Generating content roadmap for ${options.product}...\n`);

    try {
      const { ContentPlanner } = await import('./content/content-planner.js');
      const { FAQExtractor } = await import('./content/faq-extractor.js');
      const { CoverageReport, GapType } = await import('./content/types.js');
      const { join } = await import('path');
      const { writeFileSync, mkdirSync } = await import('fs');

      // Generate sample coverage report (in production, this would come from entity analysis)
      const coverageReport: CoverageReport = {
        product: options.product,
        clusters: [],
        overallScore: 70,
        recommendations: []
      };

      // Define clusters based on product or use provided clusters
      let clusters: string[] = [];
      if (options.clusters) {
        clusters = options.clusters.split(',').map((c: string) => c.trim());
      } else {
        // Default clusters based on product
        const productClusters: Record<string, string[]> = {
          convertmyfile: ['webp-to-png', 'pdf-to-word', 'image-compression', 'video-converter'],
          palettekit: ['color-picker', 'palette-generator', 'color-harmony', 'accessibility-checker'],
          notebridge: ['note-sync', 'markdown-editor', 'cloud-backup', 'collaboration']
        };
        clusters = productClusters[options.product] || ['main-feature'];
      }

      // Generate coverage data for each cluster
      for (const cluster of clusters) {
        const score = 50 + Math.random() * 40; // Random score 50-90 for demo

        coverageReport.clusters.push({
          cluster,
          url: `/${options.product}/${cluster}`,
          score,
          gaps: [
            {
              cluster,
              type: score < 60 ? GapType.MissingEntities : GapType.MissingSections,
              severity: score < 60 ? 'major' : 'minor',
              entities: ['feature-1', 'feature-2', 'feature-3'],
              description: `Content coverage at ${Math.round(score)}%`,
              currentCoverage: score,
              targetCoverage: 90,
              competitorAvg: 85
            }
          ],
          opportunities: ['Expand content depth', 'Add technical details', 'Include examples'],
          competitorComparison: {
            topCompetitor: 'competitor.com',
            theirScore: 85,
            advantages: ['Better depth', 'More examples'],
            disadvantages: ['Complex UI', 'Slower performance']
          }
        });
      }

      const planner = new ContentPlanner();

      // Analyze gaps
      console.log('📊 Analyzing content gaps...');
      const gaps = planner.analyzeGaps(coverageReport);
      console.log(`  Found ${gaps.length} content gaps`);

      // Prioritize content
      console.log('\n📋 Prioritizing content items...');
      const contentItems = planner.prioritizeContent(gaps);
      const maxItems = parseInt(options.maxItems);
      const topItems = contentItems.slice(0, maxItems);
      console.log(`  Prioritized ${topItems.length} content items`);

      // Generate calendar
      console.log('\n📅 Generating content calendar...');
      const calendar = planner.generateCalendar(topItems);
      console.log(`  Calendar spans ${calendar.timeline.length} weeks`);
      console.log(`  Total effort: ${calendar.summary.estimatedEffort} points`);
      console.log(`  Expected impact: ${calendar.summary.expectedImpact}/100`);

      // Extract FAQs if requested
      let faqs: any[] = [];
      if (options.includeFaqs) {
        console.log('\n❓ Extracting FAQs...');
        const faqExtractor = new FAQExtractor();

        for (const cluster of clusters.slice(0, 3)) { // Limit to first 3 clusters
          const clusterFaqs = await faqExtractor.extractFromMultipleSources(
            options.product,
            cluster
          );
          faqs.push(...clusterFaqs);
        }

        console.log(`  Extracted ${faqs.length} FAQs`);

        // Create FAQ bank
        const faqBank = faqExtractor.createFAQBank(faqs, 10);
        faqs = faqBank; // Use the curated FAQ bank
      }

      // Generate output based on format
      const date = new Date().toISOString().split('T')[0];
      const outputPath = options.output || join('plans', options.product, date);
      mkdirSync(outputPath, { recursive: true });

      let outputFile: string;
      let content: string;

      switch (options.format) {
        case 'csv':
          outputFile = 'content-roadmap.csv';
          content = generateCSV(calendar, faqs);
          break;

        case 'json':
          outputFile = 'content-roadmap.json';
          content = JSON.stringify({ calendar, faqs }, null, 2);
          break;

        default: // markdown
          outputFile = 'content-roadmap.md';
          content = generateMarkdown(calendar, gaps, faqs);
          break;
      }

      const filePath = join(outputPath, outputFile);
      writeFileSync(filePath, content);

      console.log(`\n📁 Content roadmap saved to: ${filePath}`);

      // Show summary
      console.log('\n📊 Roadmap Summary:');
      console.log(`  Total items: ${calendar.summary.totalItems}`);

      const byType = Object.entries(calendar.summary.byType);
      if (byType.length > 0) {
        console.log('  By type:');
        byType.forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
      }

      const byPriority = Object.entries(calendar.summary.byPriority);
      if (byPriority.length > 0) {
        console.log('  By priority:');
        byPriority.forEach(([priority, count]) => {
          console.log(`    ${priority}: ${count}`);
        });
      }

      console.log(`\n✅ Content roadmap generation completed!`);

    } catch (error) {
      console.error('❌ Content roadmap generation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }

    // Helper functions for output generation
    function generateMarkdown(calendar: any, gaps: any[], faqs: any[]): string {
      let md = `# Content Roadmap - ${options.product}\n\n`;
      md += `Generated: ${new Date().toISOString()}\n\n`;

      md += `## Summary\n\n`;
      md += `- **Total Content Items**: ${calendar.summary.totalItems}\n`;
      md += `- **Estimated Effort**: ${calendar.summary.estimatedEffort} points\n`;
      md += `- **Expected Impact**: ${calendar.summary.expectedImpact}/100\n`;
      md += `- **Timeline**: ${calendar.timeline.length} weeks\n\n`;

      md += `## Content Calendar\n\n`;
      calendar.timeline.forEach((week: any, i: number) => {
        md += `### Week ${i + 1} (${week.weekOf})\n\n`;
        md += `**Focus**: ${week.focus}\n`;
        md += `**Total Effort**: ${week.totalEffort} points\n\n`;

        week.items.forEach((item: any) => {
          md += `#### ${item.title}\n`;
          md += `- **Type**: ${item.type}\n`;
          md += `- **Priority**: ${item.priority}/10\n`;
          md += `- **Impact**: ${item.impact}/100\n`;
          md += `- **Effort**: ${item.effort}/5\n`;
          md += `- **Target URL**: ${item.targetUrl}\n`;
          md += `- **Description**: ${item.description}\n`;

          if (item.recommendations.length > 0) {
            md += `- **Recommendations**:\n`;
            item.recommendations.forEach((rec: string) => {
              md += `  - ${rec}\n`;
            });
          }

          md += '\n';
        });
      });

      if (faqs.length > 0) {
        md += `## Recommended FAQs\n\n`;
        faqs.forEach((faq: any, i: number) => {
          md += `### ${i + 1}. ${faq.question}\n`;
          md += `${faq.answer}\n`;
          md += `- Source: ${faq.source}\n`;
          md += `- Relevance: ${faq.relevance}/100\n\n`;
        });
      }

      md += `## Content Gaps Analysis\n\n`;
      const bySeverity = {
        critical: gaps.filter(g => g.severity === 'critical'),
        major: gaps.filter(g => g.severity === 'major'),
        minor: gaps.filter(g => g.severity === 'minor')
      };

      if (bySeverity.critical.length > 0) {
        md += `### Critical Gaps\n`;
        bySeverity.critical.forEach(gap => {
          md += `- **${gap.cluster}**: ${gap.description}\n`;
        });
        md += '\n';
      }

      if (bySeverity.major.length > 0) {
        md += `### Major Gaps\n`;
        bySeverity.major.forEach(gap => {
          md += `- **${gap.cluster}**: ${gap.description}\n`;
        });
        md += '\n';
      }

      return md;
    }

    function generateCSV(calendar: any, faqs: any[]): string {
      let csv = 'Title,Type,Priority,Impact,Effort,Due Date,Cluster,Description\n';

      calendar.items.forEach((item: any) => {
        const row = [
          `"${item.title}"`,
          item.type,
          item.priority,
          item.impact,
          item.effort,
          item.dueDate || '',
          item.cluster,
          `"${item.description.replace(/"/g, '""')}"`
        ];
        csv += row.join(',') + '\n';
      });

      return csv;
    }
  });

// v1.8 Phase 4: Link Suggestions
program
  .command('link-suggest')
  .description('Generate internal linking opportunities for content')
  .requiredOption('-p, --product <name>', 'Product name')
  .option('-s, --source <url>', 'Source page URL (or "all" for all pages)')
  .option('--max-links <number>', 'Maximum links per page', '3')
  .option('--min-relevance <number>', 'Minimum relevance score (0-1)', '0.5')
  .option('--format <format>', 'Output format (json|csv|markdown)', 'json')
  .option('-o, --output <path>', 'Output path')
  .action(async (options) => {
    const { LinkOptimizer } = await import('./content/link-optimizer.js');
    const { DatabaseManager } = await import('./database/database-manager.js');

    console.log(`\n🔗 Generating link suggestions for ${options.product}...`);

    try {
      const db = new DatabaseManager({ path: './seo-ads-expert.db' });
      await db.initialize();
      const optimizer = new LinkOptimizer();

      // Get pages for the product
      const pages = db.all(
        'SELECT url, title, content FROM landing_pages WHERE product = ?',
        [options.product]
      );

      if (pages.length === 0) {
        console.error(`❌ No pages found for product: ${options.product}`);
        process.exit(1);
      }

      // Convert DB records to Page format
      const formattedPages = pages.map(p => ({
        url: p.url,
        title: p.title,
        content: p.content || '',
        keywords: [], // TODO: Extract from keywords table
        entities: [], // TODO: Extract from entities table
        existingLinks: [] // TODO: Track existing links
      }));

      // Find opportunities
      const allOpportunities = [];

      if (options.source === 'all') {
        // Generate for all pages
        for (const sourcePage of formattedPages) {
          const opportunities = optimizer.findOpportunities(
            sourcePage,
            formattedPages,
            {
              maxLinksPerPage: parseInt(options.maxLinks),
              requireRelevance: parseFloat(options.minRelevance)
            }
          );
          allOpportunities.push(...opportunities);
        }
      } else {
        // Generate for specific source page
        const sourcePage = formattedPages.find(p => p.url === options.source);

        if (!sourcePage) {
          console.error(`❌ Source page not found: ${options.source}`);
          process.exit(1);
        }

        const opportunities = optimizer.findOpportunities(
          sourcePage,
          formattedPages,
          {
            maxLinksPerPage: parseInt(options.maxLinks),
            requireRelevance: parseFloat(options.minRelevance)
          }
        );
        allOpportunities.push(...opportunities);
      }

      // Validate opportunities
      const { valid, invalid } = optimizer.validateOpportunities(allOpportunities);

      console.log(`\n✅ Found ${valid.length} valid link opportunities`);
      if (invalid.length > 0) {
        console.log(`⚠️  ${invalid.length} opportunities were invalid`);
      }

      // Format output
      let output;
      switch (options.format) {
        case 'csv':
          output = formatLinksAsCSV(valid);
          break;
        case 'markdown':
          output = formatLinksAsMarkdown(valid, options.product);
          break;
        default:
          output = JSON.stringify(valid, null, 2);
      }

      // Save or display
      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(`\n💾 Saved link suggestions to ${options.output}`);
      } else {
        console.log('\n' + output);
      }

    } catch (error) {
      console.error('❌ Error generating link suggestions:', error);
      process.exit(1);
    }

    function formatLinksAsMarkdown(links, product) {
      let md = `# Link Suggestions - ${product}\n\n`;
      md += `Generated: ${new Date().toISOString()}\n\n`;
      md += `## Summary\n\n`;
      md += `- **Total Opportunities**: ${links.length}\n`;
      md += `- **Pages Affected**: ${new Set(links.map(l => l.sourceUrl)).size}\n`;
      md += `- **Average Strength**: ${(links.reduce((sum, l) => sum + l.strength, 0) / links.length).toFixed(1)}/3\n\n`;

      md += `## Link Opportunities\n\n`;

      // Group by source page
      const bySource = {};
      for (const link of links) {
        if (!bySource[link.sourceUrl]) {
          bySource[link.sourceUrl] = [];
        }
        bySource[link.sourceUrl].push(link);
      }

      for (const [source, sourceLinks] of Object.entries(bySource)) {
        md += `### ${source}\n\n`;

        for (const link of sourceLinks) {
          md += `- **Target**: ${link.targetUrl}\n`;
          md += `  - Anchor: "${link.anchorText}"\n`;
          md += `  - Type: ${link.type}\n`;
          md += `  - Strength: ${link.strength}/3\n`;
          md += `  - Rationale: ${link.rationale}\n\n`;
        }
      }

      return md;
    }

    function formatLinksAsCSV(links) {
      let csv = 'Source URL,Target URL,Anchor Text,Type,Strength,Rationale\n';

      for (const link of links) {
        const row = [
          link.sourceUrl,
          link.targetUrl,
          `"${link.anchorText.replace(/"/g, '""')}"`,
          link.type,
          link.strength,
          `"${link.rationale.replace(/"/g, '""')}"`
        ];
        csv += row.join(',') + '\n';
      }

      return csv;
    }
  });

// v1.7 Alert System Commands
const alerts = program.command('alerts').description('Alert management and anomaly detection');

alerts
  .command('check')
  .description('Run anomaly detection across all metrics')
  .requiredOption('-p, --product <name>', 'Product name (or "all" for all products)')
  .option('--window <window>', 'Time window (e.g., "14d:3d" for 14-day baseline, 3-day current)', '14d:3d')
  .option('--output <path>', 'Output path for alerts.json')
  .action(async (options) => {
    const { execSync } = await import('child_process');
    const command = `node ${path.join(process.cwd(), 'src', 'cli-alerts.js')} check -p "${options.product}" --window "${options.window}"${options.output ? ` --output "${options.output}"` : ''}`;
    
    try {
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      process.exit(1);
    }
  });

alerts
  .command('list')
  .description('List current alerts')
  .option('-p, --product <name>', 'Filter by product')
  .option('-s, --status <status>', 'Filter by status (open|ack|snoozed|closed)')
  .action(async (options) => {
    const { execSync } = await import('child_process');
    const args = [];
    if (options.product) args.push(`-p "${options.product}"`);
    if (options.status) args.push(`-s "${options.status}"`);
    const command = `node ${path.join(process.cwd(), 'src', 'cli-alerts.js')} list ${args.join(' ')}`;
    
    try {
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      process.exit(1);
    }
  });

alerts
  .command('ack <alertId>')
  .description('Acknowledge an alert')
  .option('--notes <notes>', 'Add notes')
  .action(async (alertId, options) => {
    const { execSync } = await import('child_process');
    const command = `node ${path.join(process.cwd(), 'src', 'cli-alerts.js')} ack "${alertId}"${options.notes ? ` --notes "${options.notes}"` : ''}`;
    
    try {
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      process.exit(1);
    }
  });

alerts
  .command('snooze <alertId>')
  .description('Snooze an alert')
  .requiredOption('--until <date>', 'Snooze until date (YYYY-MM-DD)')
  .action(async (alertId, options) => {
    const { execSync } = await import('child_process');
    const command = `node ${path.join(process.cwd(), 'src', 'cli-alerts.js')} snooze "${alertId}" --until "${options.until}"`;
    
    try {
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      process.exit(1);
    }
  });

// Add remediation command
program
  .command('remedy')
  .description('Apply remediation for an alert')
  .requiredOption('--alert-id <id>', 'Alert ID to remediate')
  .option('--dry-run', 'Preview actions without applying')
  .option('--apply', 'Apply remediation (default is dry-run)')
  .option('--allow-bid-changes', 'Allow bid adjustments')
  .action(async (options) => {
    const { execSync } = await import('child_process');
    const args = [`--alert-id "${options.alertId}"`];
    if (!options.apply) args.push('--dry-run');
    if (options.apply) args.push('--apply');
    if (options.allowBidChanges) args.push('--allow-bid-changes');
    
    const command = `node ${path.join(process.cwd(), 'src', 'cli-remedy.js')} apply ${args.join(' ')}`;
    
    try {
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      process.exit(1);
    }
  });

program.parse();