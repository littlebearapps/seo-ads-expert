/**
 * Sitemap Generator Tests
 * Tests for intelligent sitemap generation with sectioning and chunking
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SitemapGenerator } from '../src/sitemap/sitemap-generator.js';
import { XMLParser } from 'fast-xml-parser';
import Database from 'better-sqlite3';

describe('Sitemap Generator', () => {
  let db: Database.Database;
  let generator: SitemapGenerator;

  beforeAll(async () => {
    // Use isolated in-memory database to avoid singleton race conditions
    db = new Database(':memory:');

    // Initialize required tables
    db.exec(`
      CREATE TABLE crawl_sessions (
        session_id TEXT PRIMARY KEY,
        start_url TEXT NOT NULL,
        start_time DATETIME,
        end_time DATETIME,
        pages_discovered INTEGER DEFAULT 0,
        pages_crawled INTEGER DEFAULT 0,
        errors TEXT
      );

      CREATE TABLE crawl_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        canonical_url TEXT,
        status INTEGER,
        title TEXT,
        meta_description TEXT,
        h1 TEXT,
        word_count INTEGER,
        noindex INTEGER NOT NULL DEFAULT 0,
        nofollow INTEGER NOT NULL DEFAULT 0,
        robots_allowed INTEGER NOT NULL DEFAULT 1,
        depth INTEGER,
        section TEXT,
        content_hash TEXT,
        response_time INTEGER,
        content_type TEXT,
        images_count INTEGER,
        internal_links_count INTEGER,
        external_links_count INTEGER,
        h1_count INTEGER,
        h2_count INTEGER,
        h3_count INTEGER,
        schema_types TEXT,
        og_title TEXT,
        og_description TEXT,
        og_image TEXT,
        og_type TEXT,
        last_crawled DATETIME DEFAULT CURRENT_TIMESTAMP,
        crawl_session_id TEXT,
        FOREIGN KEY (crawl_session_id) REFERENCES crawl_sessions(session_id)
      );
    `);

    generator = new SitemapGenerator(db);

    // Insert test crawl session and pages
    const sessionId = 'test_sitemap_session';

    db.prepare(`
      INSERT OR REPLACE INTO crawl_sessions (
        session_id, start_url, start_time, pages_crawled
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?)
    `).run(sessionId, 'https://example.com', 10);

    // Insert test pages with different sections and depths
    const testPages = [
      { url: 'https://example.com/', depth: 0, section: 'main' },
      { url: 'https://example.com/products/', depth: 1, section: 'products' },
      { url: 'https://example.com/products/app1', depth: 2, section: 'products' },
      { url: 'https://example.com/products/app2', depth: 2, section: 'products' },
      { url: 'https://example.com/blog/', depth: 1, section: 'blog' },
      { url: 'https://example.com/blog/post1', depth: 2, section: 'blog' },
      { url: 'https://example.com/blog/post2', depth: 2, section: 'blog' },
      { url: 'https://example.com/docs/', depth: 1, section: 'documentation' },
      { url: 'https://example.com/docs/guide', depth: 2, section: 'documentation' },
      { url: 'https://example.com/about', depth: 1, section: 'about' }
    ];

    for (const page of testPages) {
      db.prepare(`
        INSERT OR REPLACE INTO crawl_pages (
          url, status, depth, section, noindex, crawl_session_id, last_crawled
        ) VALUES (?, 200, ?, ?, 0, ?, CURRENT_TIMESTAMP)
      `).run(page.url, page.depth, page.section, sessionId);
    }
  });

  afterAll(() => {
    // Close isolated database connection
    db.close();
  });

  describe('Basic Generation', () => {
    it('should generate a single sitemap for small sites', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: false,
        pretty: false
      });

      expect(sitemaps).toHaveLength(1);
      expect(sitemaps[0].filename).toBe('sitemap.xml');
      expect(sitemaps[0].urlCount).toBe(10);
      expect(sitemaps[0].content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(sitemaps[0].content).toContain('<urlset');
      expect(sitemaps[0].content).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    });

    it('should generate sectioned sitemaps when requested', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: true,
        pretty: false
      });

      // Should have multiple section sitemaps plus index
      expect(sitemaps.length).toBeGreaterThan(1);

      // Check for index sitemap
      const indexSitemap = sitemaps.find(s => s.filename === 'sitemap_index.xml');
      expect(indexSitemap).toBeDefined();
      expect(indexSitemap!.content).toContain('<sitemapindex');

      // Check for section sitemaps
      const productSitemap = sitemaps.find(s => s.filename.includes('products'));
      expect(productSitemap).toBeDefined();

      const blogSitemap = sitemaps.find(s => s.filename.includes('blog'));
      expect(blogSitemap).toBeDefined();
    });

    it('should handle empty crawl sessions gracefully', async () => {
      const emptySitemaps = await generator.generateSitemaps({
        sessionId: 'non_existent_session',
        sectioned: false,
        pretty: false
      });

      expect(emptySitemaps).toHaveLength(1);
      expect(emptySitemaps[0].urlCount).toBe(0);
      expect(emptySitemaps[0].content).toContain('<urlset');
    });
  });

  describe('XML Structure', () => {
    it('should generate valid XML with proper structure', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: false,
        pretty: true
      });

      const parser = new XMLParser({
        ignoreAttributes: false,
        allowBooleanAttributes: true
      });

      const parsed = parser.parse(sitemaps[0].content);
      expect(parsed).toHaveProperty('urlset');
      expect(parsed.urlset).toHaveProperty('@_xmlns');
      expect(parsed.urlset).toHaveProperty('url');
      expect(Array.isArray(parsed.urlset.url)).toBe(true);

      // Check URL entries
      const urls = parsed.urlset.url;
      expect(urls.length).toBe(10);

      for (const url of urls) {
        expect(url).toHaveProperty('loc');
        expect(url).toHaveProperty('lastmod');
        expect(url).toHaveProperty('changefreq');
        expect(url).toHaveProperty('priority');
      }
    });

    it('should calculate proper priorities based on depth', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: false,
        pretty: false
      });

      const parser = new XMLParser({
        ignoreAttributes: false,
        allowBooleanAttributes: true
      });

      const parsed = parser.parse(sitemaps[0].content);
      const urls = parsed.urlset.url;

      // Find home page (depth 0)
      const homePage = urls.find((u: any) => u.loc === 'https://example.com/');
      expect(homePage.priority).toBe(1.0);

      // Find depth 1 pages
      const depth1Pages = urls.filter((u: any) =>
        u.loc.includes('example.com/products/') ||
        u.loc.includes('example.com/blog/') ||
        u.loc.includes('example.com/docs/')
      );
      expect(depth1Pages.length).toBeGreaterThan(0);
      depth1Pages.forEach((page: any) => {
        expect(page.priority).toBeGreaterThanOrEqual(0.4);
        expect(page.priority).toBeLessThan(1.0);
      });
    });

    it('should set appropriate changefreq values', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: false,
        pretty: false
      });

      const parser = new XMLParser({
        ignoreAttributes: false,
        allowBooleanAttributes: true
      });

      const parsed = parser.parse(sitemaps[0].content);
      const urls = parsed.urlset.url;

      // Home page should have daily changefreq
      const homePage = urls.find((u: any) => u.loc === 'https://example.com/');
      expect(homePage.changefreq).toBe('daily');

      // Blog pages should have weekly changefreq
      const blogPages = urls.filter((u: any) => u.loc.includes('/blog/'));
      blogPages.forEach((page: any) => {
        expect(['weekly', 'monthly']).toContain(page.changefreq);
      });
    });
  });

  describe('Sectioning', () => {
    it('should organize pages by sections in correct priority order', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: true,
        pretty: false
      });

      // Remove index sitemap to check section order
      const sectionSitemaps = sitemaps.filter(s => !s.filename.includes('index'));

      // Main should come first (after index is removed)
      expect(sectionSitemaps[0].filename).toContain('main');

      // Products should come before blog based on priority
      const productIndex = sectionSitemaps.findIndex(s => s.filename.includes('products'));
      const blogIndex = sectionSitemaps.findIndex(s => s.filename.includes('blog'));

      if (productIndex !== -1 && blogIndex !== -1) {
        expect(productIndex).toBeLessThan(blogIndex);
      }
    });

    it('should generate index sitemap when multiple sitemaps exist', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: true,
        pretty: true
      });

      const indexSitemap = sitemaps.find(s => s.filename === 'sitemap_index.xml');
      expect(indexSitemap).toBeDefined();

      const parser = new XMLParser({
        ignoreAttributes: false,
        allowBooleanAttributes: true
      });

      const parsed = parser.parse(indexSitemap!.content);
      expect(parsed).toHaveProperty('sitemapindex');
      expect(parsed.sitemapindex).toHaveProperty('sitemap');

      const sitemapEntries = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      // Each sitemap entry should have loc and lastmod
      for (const entry of sitemapEntries) {
        expect(entry).toHaveProperty('loc');
        expect(entry).toHaveProperty('lastmod');
        expect(entry.loc).toContain('https://littlebearapps.com/');
      }
    });
  });

  describe('Validation', () => {
    it('should validate well-formed sitemaps', async () => {
      const sitemaps = await generator.generateSitemaps({
        sessionId: 'test_sitemap_session',
        sectioned: false,
        pretty: false
      });

      // Create a temp file path for testing
      const tempPath = `/tmp/test_sitemap_${Date.now()}.xml`;
      const fs = await import('fs/promises');
      await fs.writeFile(tempPath, sitemaps[0].content);

      const validation = await generator.validateSitemap(tempPath);

      expect(validation.isValid).toBe(true);
      expect(validation.urlCount).toBe(10);
      expect(validation.errors).toHaveLength(0);

      // Clean up
      await fs.unlink(tempPath);
    });

    it('should detect invalid sitemap XML', async () => {
      const invalidXml = '<?xml version="1.0"?><invalid>Not a sitemap</invalid>';
      const tempPath = `/tmp/invalid_sitemap_${Date.now()}.xml`;
      const fs = await import('fs/promises');
      await fs.writeFile(tempPath, invalidXml);

      const validation = await generator.validateSitemap(tempPath);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Invalid sitemap format');

      // Clean up
      await fs.unlink(tempPath);
    });

    it('should warn about empty sitemaps', async () => {
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        </urlset>`;

      const tempPath = `/tmp/empty_sitemap_${Date.now()}.xml`;
      const fs = await import('fs/promises');
      await fs.writeFile(tempPath, emptyXml);

      const validation = await generator.validateSitemap(tempPath);

      expect(validation.isValid).toBe(true); // Empty is valid but warned
      expect(validation.urlCount).toBe(0);
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain('no URLs');

      // Clean up
      await fs.unlink(tempPath);
    });
  });

  describe('XML Escaping', () => {
    it('should properly escape special characters in URLs', async () => {
      const sessionId = 'test_escape_session';

      db.prepare(`
        INSERT OR REPLACE INTO crawl_sessions (
          session_id, start_url, start_time, pages_crawled
        ) VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      `).run(sessionId, 'https://example.com', 1);

      db.prepare(`
        INSERT OR REPLACE INTO crawl_pages (
          url, status, depth, section, noindex, crawl_session_id, last_crawled
        ) VALUES (?, 200, 1, 'main', 0, ?, CURRENT_TIMESTAMP)
      `).run('https://example.com/page?foo=bar&baz=<test>', sessionId);

      const sitemaps = await generator.generateSitemaps({
        sessionId,
        sectioned: false,
        pretty: false
      });

      expect(sitemaps[0].content).toContain('&amp;');
      expect(sitemaps[0].content).toContain('&lt;');
      expect(sitemaps[0].content).not.toContain('<test>');

      // Clean up
      db.prepare("DELETE FROM crawl_pages WHERE crawl_session_id = ?").run(sessionId);
      db.prepare("DELETE FROM crawl_sessions WHERE session_id = ?").run(sessionId);
    });
  });
});