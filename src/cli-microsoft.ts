#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { MicrosoftAdsCSVWriter } from './writers/microsoft-ads-csv.js';

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
  .name('export-microsoft')
  .description('Export existing SEO & Ads plan to Microsoft Advertising format')
  .version('1.0.0');

program
  .command('export')
  .description('Export campaigns for Microsoft Advertising from existing plan')
  .requiredOption('-p, --product <name>', 'Product name (convertmyfile, palettekit, notebridge)')
  .option('-d, --date <date>', 'Plan date (YYYY-MM-DD)', new Date().toISOString().split('T')[0])
  .option('--markets <markets>', 'Comma-separated market codes', 'US,GB,AU')
  .option('--budget <number>', 'Daily budget in dollars', '50')
  .option('--include-negatives', 'Include negative keyword lists')
  .option('--use-v15-winners', 'Use v1.5 A/B test winning variants')
  .option('--validate-only', 'Validate without exporting')
  .action(async (options) => {
    try {
      console.log('🚀 Microsoft Ads Export Tool');
      console.log('');
      
      // Load existing plan
      const planPath = join('plans', options.product, options.date);
      if (!existsSync(planPath)) {
        console.error(`❌ Plan not found: ${planPath}`);
        console.error('💡 Generate a plan first: npx tsx src/cli.ts plan --product ' + options.product);
        process.exit(1);
      }
      
      // Load ads.json
      const adsJsonPath = join(planPath, 'ads.json');
      if (!existsSync(adsJsonPath)) {
        console.error(`❌ Ads data not found: ${adsJsonPath}`);
        process.exit(1);
      }
      
      const adsData = JSON.parse(readFileSync(adsJsonPath, 'utf-8'));
      console.log(`📋 Loaded ${adsData.ad_groups.length} ad groups from existing plan`);
      
      // Transform to Microsoft Ads format
      const campaignName = `${options.product} - Microsoft Search`;
      const campaigns = [{
        name: campaignName,
        budget: parseFloat(options.budget),
        status: 'ENABLED',
        adGroups: adsData.ad_groups.map((ag: any) => ({
          name: ag.name,
          campaignName: campaignName,
          status: 'ENABLED',
          keywords: [
            ...(ag.keywords_phrase || []).map((kw: any) => ({
              keyword: typeof kw === 'string' ? kw : kw.keyword,
              matchType: 'PHRASE',
              cpc: typeof kw === 'object' ? (kw.max_cpc || 1.0) : 1.0,
              status: 'ENABLED'
            })),
            ...(ag.keywords_exact || []).map((kw: any) => ({
              keyword: typeof kw === 'string' ? kw : kw.keyword,
              matchType: 'EXACT',
              cpc: typeof kw === 'object' ? (kw.max_cpc || 1.0) : 1.0,
              status: 'ENABLED'
            })),
            ...(ag.keywords_broad || []).map((kw: any) => ({
              keyword: typeof kw === 'string' ? kw : kw.keyword,
              matchType: 'BROAD',
              cpc: typeof kw === 'object' ? (kw.max_cpc || 1.0) : 1.0,
              status: 'ENABLED'
            }))
          ],
          ads: [{
            type: 'RSA',
            status: 'ENABLED',
            headlines: ag.headlines || [
              `${options.product} - Chrome Extension`,
              'Professional Tools',
              'Boost Your Productivity',
              'Download Now',
              'Free & Easy',
              'Best Chrome Extension'
            ],
            descriptions: ag.descriptions || [
              ag.description || 'Enhance your browsing experience',
              'Trusted by thousands of users'
            ],
            finalUrl: ag.landing_page || 'https://littlebearapps.com'
          }]
        }))
      }];
      
      if (options.includeNegatives) {
        // Load negatives.txt if it exists
        const negativesPath = join(planPath, 'negatives.txt');
        if (existsSync(negativesPath)) {
          const negatives = readFileSync(negativesPath, 'utf-8')
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'));
          console.log(`📋 Loaded ${negatives.length} negative keywords`);
          
          // Add negatives to campaigns
          campaigns[0].negativeKeywords = negatives.map(kw => ({
            keyword: kw.trim(),
            matchType: 'PHRASE'
          }));
        }
      }
      
      if (options.validateOnly) {
        console.log('\n✅ Validation Results:');
        console.log(`   Campaigns: ${campaigns.length}`);
        console.log(`   Ad Groups: ${campaigns[0].adGroups.length}`);
        console.log(`   Total Keywords: ${campaigns[0].adGroups.reduce((sum, ag) => sum + ag.keywords.length, 0)}`);
        console.log(`   Budget: $${options.budget}/day`);
        console.log(`   Markets: ${options.markets}`);
        console.log('\n✅ Ready for Microsoft Ads export!');
        return;
      }
      
      // Export to Microsoft Ads CSV
      console.log('\n📊 Generating Microsoft Ads bulk import CSV...');
      const writer = new MicrosoftAdsCSVWriter();
      const outputPath = join(planPath, 'microsoft-ads-bulk-export.csv');
      const csvPath = await writer.exportBulkCsv(campaigns, outputPath);
      
      console.log('\n✅ Microsoft Ads export complete!');
      console.log(`📁 Output file: ${csvPath}`);
      console.log('\n📌 Next Steps:');
      console.log('   1. Open Microsoft Advertising Editor');
      console.log('   2. Import the CSV file');
      console.log('   3. Review and adjust settings');
      console.log('   4. Upload to your Microsoft Ads account');
      
    } catch (error) {
      logger.error('❌ Export failed:', error);
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate Microsoft Ads bulk files')
  .requiredOption('--path <path>', 'Path to Microsoft export file')
  .option('--strict', 'Fail on warnings')
  .action(async (options) => {
    try {
      console.log('🔍 Validating Microsoft Ads bulk file...');
      
      if (!existsSync(options.path)) {
        console.error(`❌ File not found: ${options.path}`);
        process.exit(1);
      }
      
      const content = readFileSync(options.path, 'utf-8');
      const lines = content.split('\n');
      
      // Basic validation
      const issues: string[] = [];
      let campaignCount = 0;
      let adGroupCount = 0;
      let keywordCount = 0;
      let adCount = 0;
      
      for (const line of lines) {
        const cells = line.split(',');
        const type = cells[0];
        
        switch (type) {
          case 'Campaign':
            campaignCount++;
            if (!cells[6]) issues.push('Campaign missing name');
            if (isNaN(parseFloat(cells[4]))) issues.push('Campaign has invalid budget');
            break;
          case 'Ad Group':
            adGroupCount++;
            if (!cells[1]) issues.push('Ad Group missing name');
            break;
          case 'Keyword':
            keywordCount++;
            if (!cells[16]) issues.push('Keyword missing text');
            break;
          case 'Responsive Search Ad':
            adCount++;
            if (!cells[13]) issues.push('RSA missing headline');
            break;
        }
      }
      
      console.log('\n📊 File Summary:');
      console.log(`   Campaigns: ${campaignCount}`);
      console.log(`   Ad Groups: ${adGroupCount}`);
      console.log(`   Keywords: ${keywordCount}`);
      console.log(`   Ads: ${adCount}`);
      
      if (issues.length > 0) {
        console.log('\n⚠️  Issues Found:');
        issues.forEach(issue => console.log(`   - ${issue}`));
        
        if (options.strict) {
          console.error('\n❌ Validation failed (strict mode)');
          process.exit(1);
        }
      } else {
        console.log('\n✅ File is valid for Microsoft Ads import!');
      }
      
    } catch (error) {
      logger.error('❌ Validation failed:', error);
      console.error(error);
      process.exit(1);
    }
  });

program.parse(process.argv);