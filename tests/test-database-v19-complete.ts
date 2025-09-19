/**
 * Test v1.9 Database Schema Completeness
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getDatabase, closeDatabase } from '../src/database.js';

describe('v1.9 Database Schema Completeness', () => {
  let db: Database.Database;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = new Database(':memory:');

    // Execute the schema creation
    const initSQL = `
      CREATE TABLE IF NOT EXISTS crawl_sessions (
        session_id TEXT PRIMARY KEY,
        start_url TEXT NOT NULL,
        start_time DATETIME,
        end_time DATETIME,
        pages_discovered INTEGER DEFAULT 0,
        pages_crawled INTEGER DEFAULT 0,
        errors TEXT
      );

      CREATE TABLE IF NOT EXISTS crawl_pages (
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

      CREATE TABLE IF NOT EXISTS crawl_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_url TEXT NOT NULL,
        to_url TEXT NOT NULL,
        anchor_text TEXT,
        link_type TEXT,
        context TEXT,
        crawl_session_id TEXT
      );

      -- GSC Indexation tracking table
      CREATE TABLE IF NOT EXISTS gsc_indexation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        coverage_state TEXT,
        indexing_state TEXT,
        crawled_as TEXT,
        google_canonical TEXT,
        user_canonical TEXT,
        sitemap_url TEXT,
        referring_urls TEXT,
        crawl_timestamp DATETIME,
        page_fetch_state TEXT,
        robots_txt_state TEXT,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        average_position REAL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(url)
      );

      -- IndexNow centralized quota tracking
      CREATE TABLE IF NOT EXISTS indexnow_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        engine TEXT NOT NULL,
        status TEXT NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        response_code INTEGER,
        response_body TEXT
      );

      CREATE TABLE IF NOT EXISTS indexnow_quota (
        date TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        submitted INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0
      );

      -- Compatibility views
      CREATE VIEW IF NOT EXISTS fact_crawl AS
      SELECT
        cp.id,
        cp.url,
        cp.status,
        cp.title,
        cp.meta_description,
        cp.h1,
        cp.word_count,
        cp.noindex,
        cp.nofollow,
        cp.robots_allowed,
        cp.depth,
        cp.section,
        cp.content_hash,
        cp.response_time,
        cp.images_count,
        cp.internal_links_count,
        cp.external_links_count,
        cp.last_crawled,
        cs.session_id,
        cs.start_url,
        cs.start_time,
        cs.pages_discovered,
        cs.pages_crawled
      FROM crawl_pages cp
      LEFT JOIN crawl_sessions cs ON cp.crawl_session_id = cs.session_id;

      CREATE VIEW IF NOT EXISTS fact_indexation AS
      SELECT
        cp.url as url,
        cp.status as crawl_status,
        cp.title,
        cp.meta_description,
        cp.noindex,
        cp.depth,
        cp.section,
        cp.last_crawled,
        gi.coverage_state,
        gi.indexing_state,
        gi.google_canonical,
        gi.impressions,
        gi.clicks,
        gi.average_position,
        gi.last_updated as gsc_last_updated,
        CASE
          WHEN gi.url IS NULL THEN 'discovered_not_indexed'
          WHEN gi.indexing_state = 'indexed' THEN 'indexed'
          WHEN gi.coverage_state = 'excluded' THEN 'excluded'
          ELSE 'unknown'
        END as indexation_status
      FROM crawl_pages cp
      LEFT JOIN gsc_indexation gi ON cp.url = gi.url
      UNION ALL
      SELECT
        gi.url as url,
        NULL as crawl_status,
        NULL as title,
        NULL as meta_description,
        NULL as noindex,
        NULL as depth,
        NULL as section,
        NULL as last_crawled,
        gi.coverage_state,
        gi.indexing_state,
        gi.google_canonical,
        gi.impressions,
        gi.clicks,
        gi.average_position,
        gi.last_updated as gsc_last_updated,
        'indexed_not_crawled' as indexation_status
      FROM gsc_indexation gi
      LEFT JOIN crawl_pages cp ON gi.url = cp.url
      WHERE cp.url IS NULL;
    `;

    db.exec(initSQL);
  });

  afterEach(() => {
    db.close();
  });

  describe('GSC Indexation Table', () => {
    it('should have gsc_indexation table with all columns', () => {
      const columns = db.prepare(`
        SELECT name FROM pragma_table_info('gsc_indexation')
      `).all() as { name: string }[];

      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('url');
      expect(columnNames).toContain('coverage_state');
      expect(columnNames).toContain('indexing_state');
      expect(columnNames).toContain('crawled_as');
      expect(columnNames).toContain('google_canonical');
      expect(columnNames).toContain('user_canonical');
      expect(columnNames).toContain('sitemap_url');
      expect(columnNames).toContain('referring_urls');
      expect(columnNames).toContain('crawl_timestamp');
      expect(columnNames).toContain('page_fetch_state');
      expect(columnNames).toContain('robots_txt_state');
      expect(columnNames).toContain('impressions');
      expect(columnNames).toContain('clicks');
      expect(columnNames).toContain('average_position');
      expect(columnNames).toContain('last_updated');
    });

    it('should allow inserting and querying GSC data', () => {
      db.prepare(`
        INSERT INTO gsc_indexation (url, coverage_state, indexing_state, impressions, clicks)
        VALUES (?, ?, ?, ?, ?)
      `).run('https://example.com/', 'submitted', 'indexed', 100, 10);

      const result = db.prepare(`
        SELECT * FROM gsc_indexation WHERE url = ?
      `).get('https://example.com/') as any;

      expect(result.url).toBe('https://example.com/');
      expect(result.coverage_state).toBe('submitted');
      expect(result.indexing_state).toBe('indexed');
      expect(result.impressions).toBe(100);
      expect(result.clicks).toBe(10);
    });
  });

  describe('IndexNow Tables', () => {
    it('should have centralized indexnow_submissions table', () => {
      const columns = db.prepare(`
        SELECT name FROM pragma_table_info('indexnow_submissions')
      `).all() as { name: string }[];

      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('url');
      expect(columnNames).toContain('engine');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('submitted_at');
      expect(columnNames).toContain('response_code');
      expect(columnNames).toContain('response_body');
    });

    it('should have indexnow_quota table', () => {
      const columns = db.prepare(`
        SELECT name FROM pragma_table_info('indexnow_quota')
      `).all() as { name: string }[];

      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('date');
      expect(columnNames).toContain('engine');
      expect(columnNames).toContain('submitted');
      expect(columnNames).toContain('failed');
    });

    it('should track IndexNow submissions', () => {
      db.prepare(`
        INSERT INTO indexnow_submissions (url, engine, status, response_code)
        VALUES (?, ?, ?, ?)
      `).run('https://example.com/', 'bing', 'success', 200);

      const result = db.prepare(`
        SELECT * FROM indexnow_submissions WHERE url = ?
      `).get('https://example.com/') as any;

      expect(result.url).toBe('https://example.com/');
      expect(result.engine).toBe('bing');
      expect(result.status).toBe('success');
      expect(result.response_code).toBe(200);
    });
  });

  describe('Compatibility Views', () => {
    it('should have fact_crawl view', () => {
      // Insert test data
      db.prepare(`
        INSERT INTO crawl_sessions (session_id, start_url)
        VALUES ('test_session', 'https://example.com')
      `).run();

      db.prepare(`
        INSERT INTO crawl_pages (url, status, title, crawl_session_id)
        VALUES ('https://example.com/', 200, 'Test Page', 'test_session')
      `).run();

      // Query via view
      const result = db.prepare(`
        SELECT * FROM fact_crawl WHERE url = ?
      `).get('https://example.com/') as any;

      expect(result.url).toBe('https://example.com/');
      expect(result.status).toBe(200);
      expect(result.title).toBe('Test Page');
      expect(result.session_id).toBe('test_session');
      expect(result.start_url).toBe('https://example.com');
    });

    it('should have fact_indexation view with proper joins', () => {
      // Insert crawl data
      db.prepare(`
        INSERT INTO crawl_pages (url, status, title, noindex)
        VALUES ('https://example.com/', 200, 'Test Page', 0)
      `).run();

      // Insert GSC data
      db.prepare(`
        INSERT INTO gsc_indexation (url, coverage_state, indexing_state)
        VALUES ('https://example.com/', 'submitted', 'indexed')
      `).run();

      // Query via view
      const result = db.prepare(`
        SELECT * FROM fact_indexation WHERE url = ?
      `).get('https://example.com/') as any;

      expect(result.url).toBe('https://example.com/');
      expect(result.crawl_status).toBe(200);
      expect(result.title).toBe('Test Page');
      expect(result.coverage_state).toBe('submitted');
      expect(result.indexing_state).toBe('indexed');
      expect(result.indexation_status).toBe('indexed');
    });

    it('should handle discovered but not indexed pages', () => {
      // Insert only crawl data (no GSC data)
      db.prepare(`
        INSERT INTO crawl_pages (url, status, title, noindex)
        VALUES ('https://example.com/page2', 200, 'Page 2', 0)
      `).run();

      // Query via view
      const result = db.prepare(`
        SELECT * FROM fact_indexation WHERE url = ?
      `).get('https://example.com/page2') as any;

      expect(result.url).toBe('https://example.com/page2');
      expect(result.indexation_status).toBe('discovered_not_indexed');
    });

    it('should handle indexed but not crawled pages', () => {
      // Insert only GSC data (no crawl data)
      db.prepare(`
        INSERT INTO gsc_indexation (url, indexing_state)
        VALUES ('https://example.com/external', 'indexed')
      `).run();

      // Query via view
      const result = db.prepare(`
        SELECT * FROM fact_indexation WHERE url = ?
      `).get('https://example.com/external') as any;

      expect(result.url).toBe('https://example.com/external');
      expect(result.indexation_status).toBe('indexed_not_crawled');
    });
  });
});