/**
 * Sitemap Command Module (v1.9)
 * Intelligent sitemap generation and management
 */

import { Command } from 'commander';
import { SitemapGenerator } from '../../sitemap/sitemap-generator.js';
import { IndexNowService } from '../../bing/indexnow.js';
import { getDatabase } from '../../database.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export function createSitemapCommand(): Command {
  const sitemap = new Command('sitemap');

  sitemap
    .description('Sitemap generation and management');

  // Generate sitemaps
  sitemap
    .command('generate')
    .description('Generate sitemaps from crawl data')
    .option('--output <dir>', 'Output directory', './sitemaps/')
    .option('--session <id>', 'Crawl session ID', 'latest')
    .option('--sections', 'Generate sectioned sitemaps', true)
    .option('--pretty', 'Pretty-print XML', false)
    .action(async (options) => {
      try {
        logger.info('Generating sitemaps', options);

        const db = await getDatabase();
        const generator = new SitemapGenerator(db);

        const sitemaps = await generator.generateSitemaps({
          sessionId: options.session,
          sectioned: options.sections,
          pretty: options.pretty
        });

        // Ensure output directory exists
        await fs.mkdir(options.output, { recursive: true });

        // Write sitemap files
        for (const sitemap of sitemaps) {
          const filePath = path.join(options.output, sitemap.filename);
          await fs.writeFile(filePath, sitemap.content, 'utf-8');
          console.log(`✅ Generated: ${sitemap.filename} (${sitemap.urlCount} URLs)`);
        }

        console.log(`\n📁 Sitemaps saved to: ${options.output}`);

      } catch (error) {
        logger.error('Sitemap generation failed', error);
        console.error('❌ Generation failed:', error);
        process.exit(1);
      }
    });

  // Validate sitemaps
  sitemap
    .command('validate')
    .description('Validate existing sitemaps')
    .requiredOption('--url <url>', 'Sitemap URL or file path')
    .action(async (options) => {
      try {
        const generator = new SitemapGenerator();
        const validation = await generator.validateSitemap(options.url);

        console.log('\n📋 Sitemap Validation Report');
        console.log('═══════════════════════════════════════');
        console.log(`Valid XML: ${validation.isValid ? '✅' : '❌'}`);
        console.log(`URLs found: ${validation.urlCount}`);

        if (validation.errors.length > 0) {
          console.log('\nErrors:');
          validation.errors.forEach(err => console.log(`  - ${err}`));
        }

        if (validation.warnings.length > 0) {
          console.log('\nWarnings:');
          validation.warnings.forEach(warn => console.log(`  - ${warn}`));
        }

      } catch (error) {
        logger.error('Validation failed', error);
        console.error('❌ Validation failed:', error);
        process.exit(1);
      }
    });

  // Submit to Google Search Console
  sitemap
    .command('submit')
    .description('Submit sitemaps to Google Search Console')
    .requiredOption('--domain <domain>', 'Domain name')
    .option('--sitemap-url <url>', 'Sitemap URL')
    .option('--all', 'Submit all sitemaps in directory')
    .option('--dir <path>', 'Directory containing sitemaps', './sitemaps/')
    .action(async (options) => {
      try {
        logger.info('Submitting sitemap to GSC', options);

        const { GSCSitemapSubmitter } = await import('../../sitemap/gsc-sitemap-submitter.js');
        const submitter = new GSCSitemapSubmitter();

        // Validate authentication
        const authValid = await submitter.validateAuth();
        if (!authValid) {
          console.error('❌ Google Search Console authentication failed');
          console.log('Please ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN are set');
          process.exit(1);
        }

        if (options.sitemapUrl) {
          // Submit single sitemap
          const success = await submitter.submitSitemap(options.domain, options.sitemapUrl);

          if (success) {
            console.log(`✅ Submitted sitemap: ${options.sitemapUrl}`);
          } else {
            console.error(`❌ Failed to submit sitemap: ${options.sitemapUrl}`);
            process.exit(1);
          }
        } else if (options.all) {
          // Submit all sitemaps in directory
          const files = await fs.readdir(options.dir);
          const sitemapFiles = files.filter(f => f.endsWith('.xml'));

          if (sitemapFiles.length === 0) {
            console.log('No sitemap files found in directory');
            return;
          }

          const baseUrl = `https://${options.domain}`;
          const sitemapUrls = sitemapFiles.map(f => `${baseUrl}/${f}`);

          const result = await submitter.submitMultipleSitemaps(options.domain, sitemapUrls);

          console.log(`\n📊 Submission Results:`);
          console.log(`  ✅ Submitted: ${result.submitted.length}`);
          console.log(`  ❌ Failed: ${result.failed.length}`);

          if (result.submitted.length > 0) {
            console.log('\nSubmitted sitemaps:');
            result.submitted.forEach(url => console.log(`  - ${url}`));
          }

          if (result.failed.length > 0) {
            console.log('\nFailed sitemaps:');
            result.failed.forEach(url => console.log(`  - ${url}`));
          }
        } else {
          console.log('Please specify --sitemap-url or --all');
          process.exit(1);
        }

      } catch (error) {
        logger.error('Submission failed', error);
        console.error('❌ Submission failed:', error);
        process.exit(1);
      }
    });

  // List submitted sitemaps
  sitemap
    .command('list')
    .description('List sitemaps submitted to Google Search Console')
    .requiredOption('--domain <domain>', 'Domain name')
    .action(async (options) => {
      try {
        const { GSCSitemapSubmitter } = await import('../../sitemap/gsc-sitemap-submitter.js');
        const submitter = new GSCSitemapSubmitter();

        const sitemaps = await submitter.listSitemaps(options.domain);

        if (sitemaps.length === 0) {
          console.log('No sitemaps found for this domain');
          return;
        }

        console.log(`\n📋 Submitted Sitemaps for ${options.domain}:`);
        console.log('═══════════════════════════════════════════════════════');

        for (const sitemap of sitemaps) {
          console.log(`\n📍 ${sitemap.path}`);
          if (sitemap.lastSubmitted) {
            console.log(`   Last Submitted: ${new Date(sitemap.lastSubmitted).toLocaleDateString()}`);
          }
          if (sitemap.lastDownloaded) {
            console.log(`   Last Downloaded: ${new Date(sitemap.lastDownloaded).toLocaleDateString()}`);
          }
          if (sitemap.errors) {
            console.log(`   Errors: ${sitemap.errors}`);
          }
          if (sitemap.warnings) {
            console.log(`   Warnings: ${sitemap.warnings}`);
          }
          if (sitemap.contents) {
            console.log(`   Types: ${sitemap.contents.map((c: any) => c.type).join(', ')}`);
            const totalUrls = sitemap.contents.reduce((sum: number, c: any) => sum + (c.submitted || 0), 0);
            const totalIndexed = sitemap.contents.reduce((sum: number, c: any) => sum + (c.indexed || 0), 0);
            console.log(`   URLs: ${totalUrls} submitted, ${totalIndexed} indexed`);
          }
        }

      } catch (error) {
        logger.error('Failed to list sitemaps', error);
        console.error('❌ Failed to list sitemaps:', error);
        process.exit(1);
      }
    });

  // IndexNow ping
  sitemap
    .command('indexnow')
    .description('Send IndexNow pings to Bing/Yandex')
    .requiredOption('--urls <path>', 'Path to URL file')
    .option('--engine <name>', 'bing|yandex', 'bing')
    .option('--key <key>', 'IndexNow API key')
    .option('--dry-run', 'Preview without sending', false)
    .action(async (options) => {
      try {
        const urlContent = await fs.readFile(options.urls, 'utf-8');
        const urls = urlContent.split('\n').filter(u => u.trim());

        if (options.dryRun) {
          console.log(`🔍 Dry run: Would send ${urls.length} URLs to ${options.engine}`);
          urls.slice(0, 5).forEach(url => console.log(`  - ${url}`));
          if (urls.length > 5) {
            console.log(`  ... and ${urls.length - 5} more`);
          }
          return;
        }

        const service = new IndexNowService({
          engine: options.engine,
          apiKey: options.key || process.env.INDEXNOW_KEY
        });

        const result = await service.submitUrls(urls);

        console.log(`✅ Submitted ${result.submitted} URLs to ${options.engine}`);
        if (result.failed > 0) {
          console.log(`⚠️  Failed: ${result.failed} URLs`);
        }

      } catch (error) {
        logger.error('IndexNow failed', error);
        console.error('❌ IndexNow failed:', error);
        process.exit(1);
      }
    });

  return sitemap;
}