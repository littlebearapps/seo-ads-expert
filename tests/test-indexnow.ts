/**
 * Test IndexNow Service
 */

import { describe, it, expect, vi } from 'vitest';
import { IndexNowService } from '../src/bing/indexnow.js';
import Database from 'better-sqlite3';

describe('IndexNowService', () => {
  describe('constructor', () => {
    it('should initialize with default options', () => {
      const service = new IndexNowService();
      expect(service).toBeDefined();
    });

    it('should accept custom options', () => {
      const service = new IndexNowService({
        apiKey: 'test-key',
        engine: 'yandex'
      });
      expect(service).toBeDefined();
    });

    it('should support legacy config format', () => {
      const service = new IndexNowService({
        engine: 'bing',
        apiKey: 'test-key'
      });
      expect(service).toBeDefined();
    });
  });

  describe('database operations', () => {
    it('should initialize database tables', () => {
      const db = new Database(':memory:');
      const service = new IndexNowService();

      service.initDb(db);

      // Check tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        AND name IN ('indexnow_submissions', 'indexnow_quota')
      `).all();

      expect(tables).toHaveLength(2);

      db.close();
    });
  });

  describe('URL extraction', () => {
    it('should extract URLs from crawl', async () => {
      const db = new Database(':memory:');
      const service = new IndexNowService();

      // Create test data
      db.exec(`
        CREATE TABLE crawl_pages (
          url TEXT,
          crawl_session_id TEXT,
          status INTEGER,
          noindex INTEGER,
          depth INTEGER
        );

        INSERT INTO crawl_pages VALUES
          ('https://example.com/', 'test', 200, 0, 0),
          ('https://example.com/page1', 'test', 200, 0, 1),
          ('https://example.com/page2', 'test', 404, 0, 1),
          ('https://example.com/page3', 'test', 200, 1, 1);
      `);

      const urls = await service.extractUrlsFromCrawl(db, 'test');

      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://example.com/');
      expect(urls).toContain('https://example.com/page1');

      db.close();
    });

    it('should extract changed URLs', async () => {
      const db = new Database(':memory:');
      const service = new IndexNowService();

      const now = new Date().toISOString();
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      db.exec(`
        CREATE TABLE crawl_pages (
          url TEXT,
          last_crawled TEXT,
          status INTEGER,
          noindex INTEGER,
          content_hash_changed INTEGER,
          first_seen TEXT
        );

        INSERT INTO crawl_pages VALUES
          ('https://example.com/new', '${now}', 200, 0, 0, '${now}'),
          ('https://example.com/changed', '${now}', 200, 0, 1, '${old}'),
          ('https://example.com/old', '${old}', 200, 0, 0, '${old}');
      `);

      const urls = await service.extractChangedUrls(db, 24);

      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://example.com/new');
      expect(urls).toContain('https://example.com/changed');

      db.close();
    });
  });

  describe('quota management', () => {
    it('should track submissions and enforce quota', async () => {
      const db = new Database(':memory:');
      const service = new IndexNowService();

      service.initDb(db);

      // Mock submitBatch to avoid real API calls
      const mockSubmitBatch = vi.fn().mockResolvedValue(true);
      (service as any).submitBatch = mockSubmitBatch;

      const urls = Array(100).fill('https://example.com/page');
      const result = await service.submitUrls(urls);

      expect(result.submitted).toBe(100);
      expect(result.failed).toBe(0);
      expect(mockSubmitBatch).toHaveBeenCalledTimes(1); // One batch

      db.close();
    });

    it('should filter recently submitted URLs', async () => {
      const db = new Database(':memory:');
      const service = new IndexNowService();

      service.initDb(db);

      // Add recent submission
      const recent = new Date().toISOString();
      db.prepare(`
        INSERT INTO indexnow_submissions (url, engine, status, submitted_at)
        VALUES ('https://example.com/recent', 'bing', 'success', ?)
      `).run(recent);

      const urls = [
        'https://example.com/recent',
        'https://example.com/new'
      ];

      const filtered = await service.filterNewUrls(urls);

      expect(filtered).toHaveLength(1);
      expect(filtered).toContain('https://example.com/new');

      db.close();
    });
  });

  describe('statistics', () => {
    it('should calculate submission stats', async () => {
      const db = new Database(':memory:');
      const service = new IndexNowService();

      service.initDb(db);

      // Add test submissions
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO indexnow_submissions (url, engine, status, submitted_at)
        VALUES
          ('https://example.com/1', 'bing', 'success', ?),
          ('https://example.com/2', 'bing', 'success', ?),
          ('https://example.com/3', 'bing', 'failed', ?)
      `).run(now, now, now);

      const stats = await service.getStats(30);

      expect(stats.totalSubmitted).toBe(2);
      expect(stats.totalFailed).toBe(1);
      expect(stats.successRate).toBe('66.67%');

      db.close();
    });
  });
});