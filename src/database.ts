/**
 * Database connection manager
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database.Database | null = null;

export async function getDatabase(): Promise<Database.Database> {
  if (!db) {
    const dbPath = path.resolve(__dirname, '../data/seo-ads-expert.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Initialize tables if needed
    await initializeTables(db);
  }
  return db;
}

async function initializeTables(db: Database.Database): Promise<void> {
  // Create v1.9 tables
  db.exec(`
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
      crawl_session_id TEXT,
      FOREIGN KEY (from_url) REFERENCES crawl_pages(url),
      FOREIGN KEY (to_url) REFERENCES crawl_pages(url),
      FOREIGN KEY (crawl_session_id) REFERENCES crawl_sessions(session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_crawl_links_from ON crawl_links(from_url);
    CREATE INDEX IF NOT EXISTS idx_crawl_links_to ON crawl_links(to_url);
    CREATE INDEX IF NOT EXISTS idx_pages_status_noindex ON crawl_pages(status, noindex);
    CREATE INDEX IF NOT EXISTS idx_pages_section ON crawl_pages(section);
    CREATE INDEX IF NOT EXISTS idx_links_type ON crawl_links(link_type);
    CREATE INDEX IF NOT EXISTS idx_crawl_session ON crawl_pages(crawl_session_id);
    CREATE INDEX IF NOT EXISTS idx_links_session ON crawl_links(crawl_session_id);

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

    CREATE INDEX IF NOT EXISTS idx_gsc_coverage_state ON gsc_indexation(coverage_state);
    CREATE INDEX IF NOT EXISTS idx_gsc_indexing_state ON gsc_indexation(indexing_state);
    CREATE INDEX IF NOT EXISTS idx_gsc_last_updated ON gsc_indexation(last_updated);

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

    CREATE INDEX IF NOT EXISTS idx_indexnow_url ON indexnow_submissions(url);
    CREATE INDEX IF NOT EXISTS idx_indexnow_date ON indexnow_submissions(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_indexnow_engine ON indexnow_submissions(engine);

    -- Compatibility views for v1.8 code
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
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}