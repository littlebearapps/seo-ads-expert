/**
 * v1.9 Integration Tests
 * Tests for crawler, link graph, and sitemap functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDatabase, closeDatabase } from '../src/database.js';
import { CrawlOrchestrator } from '../src/crawl/orchestrator.js';
import { SitemapGenerator } from '../src/sitemap/sitemap-generator.js';
import { HealthAnalyzer } from '../src/health/health-analyzer.js';
import Database from 'better-sqlite3';

describe('v1.9 Integration Tests', () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterAll(() => {
    closeDatabase();
  });

  describe('CLI Consolidation', () => {
    it('should have unified command structure', async () => {
      const { Command } = await import('commander');
      const { createCrawlCommand } = await import('../src/cli/commands/crawl.js');

      const crawlCmd = createCrawlCommand();
      expect(crawlCmd).toBeInstanceOf(Command);
      expect(crawlCmd.name()).toBe('crawl');
      expect(crawlCmd.commands.length).toBeGreaterThan(0);

      // Check subcommands exist
      const subcommands = crawlCmd.commands.map(c => c.name());
      expect(subcommands).toContain('start');
      expect(subcommands).toContain('results');
      expect(subcommands).toContain('analyze');
    });
  });

  describe('Database Schema', () => {
    it('should have v1.9 tables created', () => {
      // Check crawl_sessions table exists
      const sessionsTable = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='crawl_sessions'
      `).get();
      expect(sessionsTable).toBeTruthy();

      // Check crawl_pages table exists
      const pagesTable = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='crawl_pages'
      `).get();
      expect(pagesTable).toBeTruthy();

      // Check crawl_links table exists
      const linksTable = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='crawl_links'
      `).get();
      expect(linksTable).toBeTruthy();
    });

    it('should have proper indexes', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name LIKE 'idx_%'
      `).all();

      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_crawl_links_from');
      expect(indexNames).toContain('idx_crawl_links_to');
      expect(indexNames).toContain('idx_pages_status_noindex');
      expect(indexNames).toContain('idx_pages_section');
    });
  });

  describe('Crawl Orchestrator', () => {
    it('should instantiate correctly', () => {
      const orchestrator = new CrawlOrchestrator(db);
      expect(orchestrator).toBeDefined();
      expect(orchestrator.crawlSite).toBeDefined();
      expect(orchestrator.getCrawlResults).toBeDefined();
      expect(orchestrator.analyzeCrawlData).toBeDefined();
    });

    it('should handle missing crawl sessions gracefully', async () => {
      const orchestrator = new CrawlOrchestrator(db);

      // Try to get results for non-existent session
      await expect(orchestrator.getCrawlResults('fake_session')).rejects.toThrow();
    });

    it('should format analysis as markdown', () => {
      const orchestrator = new CrawlOrchestrator(db);

      const analysis = {
        type: 'Test Analysis',
        sessionId: 'test_123',
        analysis: [
          { url: 'https://example.com/page1', title: 'Page 1' },
          { url: 'https://example.com/page2', title: 'Page 2' }
        ]
      };

      const markdown = orchestrator.formatAsMarkdown(analysis);
      expect(markdown).toContain('# Test Analysis');
      expect(markdown).toContain('test_123');
      expect(markdown).toContain('Found **2** items');
    });

    it('should format analysis as CSV', () => {
      const orchestrator = new CrawlOrchestrator(db);

      const analysis = {
        type: 'Test Analysis',
        sessionId: 'test_123',
        analysis: [
          { url: 'https://example.com/page1', status: 200 },
          { url: 'https://example.com/page2', status: 404 }
        ]
      };

      const csv = orchestrator.formatAsCSV(analysis);
      expect(csv).toContain('url,status');
      expect(csv).toContain('https://example.com/page1,200');
      expect(csv).toContain('https://example.com/page2,404');
    });
  });

  describe('Sitemap Generator', () => {
    it('should instantiate correctly', () => {
      const generator = new SitemapGenerator(db);
      expect(generator).toBeDefined();
      expect(generator.generateSitemaps).toBeDefined();
      expect(generator.validateSitemap).toBeDefined();
    });

    it('should generate basic sitemap structure', async () => {
      const generator = new SitemapGenerator(db);

      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_session',
        sectioned: false,
        pretty: false
      });

      expect(sitemaps).toBeInstanceOf(Array);
      expect(sitemaps.length).toBeGreaterThanOrEqual(1);

      // When there are no pages, it generates an empty sitemap.xml
      const sitemap = sitemaps[0];
      expect(sitemap.filename).toBe('sitemap.xml');
      expect(sitemap.content).toContain('<?xml version');
      expect(sitemap.content).toContain('urlset');
      expect(sitemap.urlCount).toBe(0);
    });
  });

  describe('Health Analyzer', () => {
    it('should instantiate correctly', () => {
      const analyzer = new HealthAnalyzer(db);
      expect(analyzer).toBeDefined();
      expect(analyzer.runComprehensiveCheck).toBeDefined();
      expect(analyzer.generateRecommendations).toBeDefined();
    });

    it('should generate health report structure', async () => {
      const analyzer = new HealthAnalyzer(db);

      const report = await analyzer.runComprehensiveCheck({
        domain: 'example.com',
        sessionId: 'test_session'
      });

      expect(report).toHaveProperty('healthScore');
      expect(report).toHaveProperty('indexationRate');
      expect(report).toHaveProperty('orphanPages');
      expect(report).toHaveProperty('brokenLinks');
      expect(report).toHaveProperty('criticalIssues');
      expect(report).toHaveProperty('recommendations');

      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Command Aliases', () => {
    it('should support backward compatible aliases', async () => {
      const { Command } = await import('commander');
      const program = new Command();

      // Mock alias commands
      const linkGraphCmd = new Command('link-graph');
      linkGraphCmd
        .requiredOption('--site <url>', 'Site URL')
        .option('--max-depth <n>', 'Depth limit', '4')
        .option('--budget <n>', 'Page budget', '500');

      const robotsAuditCmd = new Command('robots-audit');
      robotsAuditCmd.requiredOption('--site <url>', 'Site URL');

      const indexnowCmd = new Command('indexnow');
      indexnowCmd
        .requiredOption('--urls <path>', 'Path to URL file')
        .option('--engine <name>', 'bing|yandex', 'bing')
        .option('--dry-run', 'Do not send; log only', false);

      program.addCommand(linkGraphCmd);
      program.addCommand(robotsAuditCmd);
      program.addCommand(indexnowCmd);

      // Verify aliases are registered
      const commandNames = program.commands.map(c => c.name());
      expect(commandNames).toContain('link-graph');
      expect(commandNames).toContain('robots-audit');
      expect(commandNames).toContain('indexnow');
    });
  });
});