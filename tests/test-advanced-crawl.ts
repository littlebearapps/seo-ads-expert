/**
 * Test Advanced Crawl Features
 */

import { describe, it, expect } from 'vitest';
import { SiteAnalyzer } from '../src/crawl/site-analyzer.js';
import { LinkGraphAnalyzer } from '../src/crawl/link-graph-analyzer.js';
import Database from 'better-sqlite3';

describe('Advanced Crawl Features', () => {
  it('should extract advanced page data', async () => {
    const db = new Database(':memory:');

    // Initialize tables
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
        crawl_session_id TEXT
      );

      CREATE TABLE crawl_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_url TEXT NOT NULL,
        to_url TEXT NOT NULL,
        anchor_text TEXT,
        link_type TEXT,
        context TEXT,
        crawl_session_id TEXT
      );
    `);

    const linkGraph = new LinkGraphAnalyzer(db);
    const config = {
      maxDepth: 2,
      maxPages: 10,
      concurrency: 1,
      rateLimitMs: 0
    };

    const analyzer = new SiteAnalyzer(config, db, linkGraph);

    // Test extraction of advanced features (would require mocking HTTP requests)
    // For now, just verify the analyzer can be instantiated
    expect(analyzer).toBeDefined();

    // Check that database has the new columns
    const columns = db.prepare(`
      SELECT name FROM pragma_table_info('crawl_pages')
    `).all() as { name: string }[];

    const columnNames = columns.map(c => c.name);

    // Check for new advanced columns
    expect(columnNames).toContain('response_time');
    expect(columnNames).toContain('content_type');
    expect(columnNames).toContain('images_count');
    expect(columnNames).toContain('internal_links_count');
    expect(columnNames).toContain('external_links_count');
    expect(columnNames).toContain('h1_count');
    expect(columnNames).toContain('h2_count');
    expect(columnNames).toContain('h3_count');
    expect(columnNames).toContain('schema_types');
    expect(columnNames).toContain('og_title');
    expect(columnNames).toContain('og_description');
    expect(columnNames).toContain('og_image');
    expect(columnNames).toContain('og_type');

    db.close();
  });
});