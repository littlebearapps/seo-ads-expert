/**
 * IndexNow Service
 * Submit URLs to Bing/Yandex for immediate indexing
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';
import Database from 'better-sqlite3';
import crypto from 'crypto';

export interface IndexNowOptions {
  apiKey?: string;
  engine?: 'bing' | 'yandex';
  keyLocation?: string;
}

export interface IndexNowConfig {
  engine: string;
  apiKey?: string;
}

export interface IndexNowResult {
  submitted: number;
  failed: number;
  errors?: string[];
}

export interface SubmissionResult {
  submitted: number;
  failed: number;
  errors: string[];
  quotaRemaining?: number;
}

interface QuotaRecord {
  date: string;
  submitted: number;
  failed: number;
}

export class IndexNowService {
  private apiKey: string;
  private engine: 'bing' | 'yandex';
  private keyLocation: string;
  private db?: Database.Database;
  private readonly DAILY_QUOTA = 10000;
  private readonly BATCH_SIZE = 100;

  // API endpoints
  private readonly ENDPOINTS = {
    bing: 'https://www.bing.com/indexnow',
    yandex: 'https://yandex.com/indexnow'
  };

  constructor(options: IndexNowOptions | IndexNowConfig = {}) {
    // Support both old and new interface
    if ('engine' in options && typeof options.engine === 'string') {
      this.engine = (options.engine === 'yandex' ? 'yandex' : 'bing') as 'bing' | 'yandex';
      this.apiKey = options.apiKey || process.env.INDEXNOW_KEY || this.generateKey();
    } else {
      const opts = options as IndexNowOptions;
      this.apiKey = opts.apiKey || process.env.INDEXNOW_KEY || this.generateKey();
      this.engine = opts.engine || 'bing';
    }
    this.keyLocation = (options as IndexNowOptions).keyLocation || this.apiKey;
  }

  /**
   * Initialize database for quota tracking
   */
  initDb(db: Database.Database): void {
    this.db = db;

    // Create tables if not exist
    this.db.exec(`
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
    `);
  }

  /**
   * Submit a single URL to IndexNow
   */
  async submitUrl(url: string, host?: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const submitHost = host || urlObj.hostname;

      const params = {
        url,
        key: this.apiKey,
        keyLocation: `https://${submitHost}/${this.keyLocation}.txt`
      };

      const response = await axios.get(this.ENDPOINTS[this.engine], {
        params,
        timeout: 10000
      });

      // Log submission
      if (this.db) {
        this.logSubmission(url, 'success', response.status, response.data);
        this.updateQuota(1, 0);
      }

      logger.info('IndexNow submission successful', {
        url,
        engine: this.engine,
        status: response.status
      });

      return response.status === 200 || response.status === 202;

    } catch (error: any) {
      logger.error('IndexNow submission failed', {
        url,
        error: error.message
      });

      if (this.db) {
        this.logSubmission(url, 'failed', error.response?.status, error.message);
        this.updateQuota(0, 1);
      }

      return false;
    }
  }

  /**
   * Submit multiple URLs in batches
   */
  async submitUrls(urls: string[], host?: string): Promise<SubmissionResult> {
    logger.info(`Submitting ${urls.length} URLs to IndexNow`, {
      engine: this.engine
    });

    // Check daily quota
    const quotaRemaining = await this.getQuotaRemaining();
    if (quotaRemaining <= 0) {
      return {
        submitted: 0,
        failed: urls.length,
        errors: ['Daily quota exceeded (10,000 URLs)'],
        quotaRemaining: 0
      };
    }

    const result: SubmissionResult = {
      submitted: 0,
      failed: 0,
      errors: [],
      quotaRemaining
    };

    // Process URLs up to quota limit
    const urlsToSubmit = urls.slice(0, Math.min(urls.length, quotaRemaining));

    // Submit in batches
    for (let i = 0; i < urlsToSubmit.length; i += this.BATCH_SIZE) {
      const batch = urlsToSubmit.slice(i, i + this.BATCH_SIZE);

      try {
        // IndexNow supports batch submission via POST
        const response = await this.submitBatch(batch, host);

        if (response) {
          result.submitted += batch.length;
        } else {
          result.failed += batch.length;
        }

        // Rate limiting - wait between batches
        if (i + this.BATCH_SIZE < urlsToSubmit.length) {
          await this.delay(1000);
        }

      } catch (error: any) {
        result.failed += batch.length;
        result.errors.push(`Batch ${i / this.BATCH_SIZE + 1}: ${error.message}`);
      }
    }

    result.quotaRemaining = await this.getQuotaRemaining();

    return result;
  }

  /**
   * Submit a batch of URLs
   */
  private async submitBatch(urls: string[], host?: string): Promise<boolean> {
    try {
      const urlHost = host || new URL(urls[0]).hostname;

      const payload = {
        host: urlHost,
        key: this.apiKey,
        keyLocation: `https://${urlHost}/${this.keyLocation}.txt`,
        urlList: urls
      };

      const response = await axios.post(
        this.ENDPOINTS[this.engine],
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      // Log submissions
      if (this.db) {
        urls.forEach(url => {
          this.logSubmission(url, 'success', response.status, 'batch');
        });
        this.updateQuota(urls.length, 0);
      }

      logger.info(`Batch submission successful`, {
        count: urls.length,
        status: response.status
      });

      return response.status === 200 || response.status === 202;

    } catch (error: any) {
      logger.error('Batch submission failed', error);

      if (this.db) {
        urls.forEach(url => {
          this.logSubmission(url, 'failed', error.response?.status, error.message);
        });
        this.updateQuota(0, urls.length);
      }

      // Check for specific error codes
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded - wait before retrying');
      } else if (error.response?.status === 400) {
        throw new Error('Invalid request - check URL format');
      } else if (error.response?.status === 403) {
        throw new Error('Forbidden - verify API key and key file location');
      }

      return false;
    }
  }

  /**
   * Get URLs recently submitted (for deduplication)
   */
  async getRecentSubmissions(days: number = 7): Promise<Set<string>> {
    if (!this.db) return new Set();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const rows = this.db.prepare(`
      SELECT DISTINCT url
      FROM indexnow_submissions
      WHERE engine = ?
        AND status = 'success'
        AND submitted_at >= ?
    `).all(this.engine, cutoff.toISOString()) as { url: string }[];

    return new Set(rows.map(r => r.url));
  }

  /**
   * Filter URLs to only those not recently submitted
   */
  async filterNewUrls(urls: string[], days: number = 7): Promise<string[]> {
    const recent = await this.getRecentSubmissions(days);
    return urls.filter(url => !recent.has(url));
  }

  /**
   * Get remaining daily quota
   */
  private async getQuotaRemaining(): Promise<number> {
    if (!this.db) return this.DAILY_QUOTA;

    const today = new Date().toISOString().split('T')[0];

    const quota = this.db.prepare(`
      SELECT submitted
      FROM indexnow_quota
      WHERE date = ? AND engine = ?
    `).get(today, this.engine) as QuotaRecord | undefined;

    const used = quota?.submitted || 0;
    return Math.max(0, this.DAILY_QUOTA - used);
  }

  /**
   * Log submission to database
   */
  private logSubmission(
    url: string,
    status: string,
    responseCode?: number,
    responseBody?: any
  ): void {
    if (!this.db) return;

    this.db.prepare(`
      INSERT INTO indexnow_submissions (url, engine, status, response_code, response_body)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      url,
      this.engine,
      status,
      responseCode,
      typeof responseBody === 'object' ? JSON.stringify(responseBody) : responseBody
    );
  }

  /**
   * Update daily quota
   */
  private updateQuota(submitted: number, failed: number): void {
    if (!this.db) return;

    const today = new Date().toISOString().split('T')[0];

    this.db.prepare(`
      INSERT INTO indexnow_quota (date, engine, submitted, failed)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        submitted = submitted + ?,
        failed = failed + ?
    `).run(today, this.engine, submitted, failed, submitted, failed);
  }

  /**
   * Generate a random API key if not provided
   */
  private generateKey(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get submission statistics
   */
  async getStats(days: number = 30): Promise<any> {
    if (!this.db) {
      return {
        totalSubmitted: 0,
        totalFailed: 0,
        successRate: 0,
        dailyAverage: 0
      };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const stats = this.db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'success' THEN 1 END) as submitted,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM indexnow_submissions
      WHERE engine = ? AND submitted_at >= ?
    `).get(this.engine, cutoff.toISOString()) as any;

    const total = stats.submitted + stats.failed;

    return {
      totalSubmitted: stats.submitted,
      totalFailed: stats.failed,
      successRate: total > 0 ? (stats.submitted / total * 100).toFixed(2) + '%' : '0%',
      dailyAverage: Math.round(stats.submitted / days)
    };
  }

  /**
   * Validate IndexNow setup
   */
  async validateSetup(host: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check API key
    if (!this.apiKey) {
      errors.push('No API key configured');
    }

    // Check key file accessibility (would be at https://host/key.txt)
    try {
      const keyUrl = `https://${host}/${this.apiKey}.txt`;
      const response = await axios.get(keyUrl, { timeout: 5000 });

      if (response.data.trim() !== this.apiKey) {
        errors.push(`Key file content doesn't match API key`);
      }
    } catch (error) {
      errors.push(`Key file not accessible at https://${host}/${this.apiKey}.txt`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Helper to delay between requests
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract new URLs from crawl or sitemap
   */
  async extractUrlsFromCrawl(db: Database.Database, sessionId: string): Promise<string[]> {
    const urls = db.prepare(`
      SELECT url
      FROM crawl_pages
      WHERE crawl_session_id = ?
        AND status = 200
        AND noindex = 0
      ORDER BY depth, url
    `).all(sessionId) as { url: string }[];

    return urls.map(u => u.url);
  }

  /**
   * Extract URLs that have changed recently
   */
  async extractChangedUrls(db: Database.Database, hours: number = 24): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    const urls = db.prepare(`
      SELECT DISTINCT url
      FROM crawl_pages
      WHERE last_crawled >= ?
        AND status = 200
        AND noindex = 0
        AND (content_hash_changed = 1 OR first_seen >= ?)
      ORDER BY url
    `).all(cutoff.toISOString(), cutoff.toISOString()) as { url: string }[];

    return urls.map(u => u.url);
  }
}