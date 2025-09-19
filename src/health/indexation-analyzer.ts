/**
 * Indexation Analyzer
 * Analyzes GSC indexation data
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { parse } from 'csv-parse';
import fs from 'fs/promises';

export interface IndexationReport {
  summary: {
    discoveredNotIndexed: number;
    crawledNotIndexed: number;
    excludedDuplicates: number;
    lowQualityIndexed: number;
    totalIndexed: number;
    totalCrawled: number;
  };
  issues: Array<{
    url: string;
    state: string;
    fix: string;
    severity: string;
    evidence?: any;
  }>;
  recommendations: string[];
}

interface GSCPage {
  url: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface CrawledPage {
  url: string;
  status: number;
  noindex: number;
  title?: string;
  section?: string;
  depth: number;
}

export class IndexationAnalyzer {
  private searchconsole: any;
  private auth: OAuth2Client;

  constructor(private db: Database.Database) {
    // Initialize OAuth2 client
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    // Set credentials from refresh token
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }

    // Initialize Search Console API
    this.searchconsole = google.searchconsole({
      version: 'v1',
      auth: this.auth
    });
  }

  async analyzeIndexationHealth(domain: string, gscPath?: string): Promise<IndexationReport> {
    logger.info('Analyzing indexation', { domain, gscPath });

    try {
      // Get crawled pages from database
      const crawledPages = await this.getCrawledPages();

      // Get indexed pages from GSC
      let gscPages: GSCPage[] = [];

      if (gscPath) {
        // Load from CSV export
        gscPages = await this.loadGSCFromCSV(gscPath);
      } else {
        // Fetch from API
        gscPages = await this.fetchGSCPages(domain);
      }

      // Analyze indexation gaps
      const analysis = this.compareIndexation(crawledPages, gscPages);

      // Generate recommendations
      const recommendations = this.generateRecommendations(analysis);

      return {
        summary: analysis.summary,
        issues: analysis.issues,
        recommendations
      };

    } catch (error: any) {
      logger.error('Indexation analysis failed', error);

      return {
        summary: {
          discoveredNotIndexed: 0,
          crawledNotIndexed: 0,
          excludedDuplicates: 0,
          lowQualityIndexed: 0,
          totalIndexed: 0,
          totalCrawled: 0
        },
        issues: [],
        recommendations: [
          'Unable to complete analysis. Check GSC authentication and try again.'
        ]
      };
    }
  }

  private async getCrawledPages(): Promise<CrawledPage[]> {
    // Get latest crawl session
    const latestSession = this.db.prepare(`
      SELECT session_id FROM crawl_sessions
      ORDER BY start_time DESC
      LIMIT 1
    `).get() as { session_id: string } | undefined;

    if (!latestSession) {
      return [];
    }

    // Get crawled pages
    const pages = this.db.prepare(`
      SELECT url, status, noindex, title, section, depth
      FROM crawl_pages
      WHERE crawl_session_id = ?
      AND status = 200
    `).all(latestSession.session_id) as CrawledPage[];

    return pages;
  }

  private async fetchGSCPages(domain: string): Promise<GSCPage[]> {
    try {
      const siteUrl = this.formatSiteUrl(domain);

      // Query Search Console for indexed pages
      const response = await this.searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: this.getDateDaysAgo(30),
          endDate: this.getDateDaysAgo(1),
          dimensions: ['page'],
          rowLimit: 25000
        }
      });

      const rows = response.data.rows || [];

      return rows.map((row: any) => ({
        url: row.keys[0],
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }));

    } catch (error: any) {
      logger.error('Failed to fetch GSC pages', error);
      return [];
    }
  }

  private async loadGSCFromCSV(csvPath: string): Promise<GSCPage[]> {
    try {
      const content = await fs.readFile(csvPath, 'utf-8');
      const records: GSCPage[] = [];

      const parser = parse(content, {
        columns: true,
        skip_empty_lines: true
      });

      for await (const record of parser) {
        records.push({
          url: record.Page || record.URL || record.url,
          clicks: parseInt(record.Clicks || record.clicks || '0'),
          impressions: parseInt(record.Impressions || record.impressions || '0'),
          ctr: parseFloat(record.CTR || record.ctr || '0'),
          position: parseFloat(record.Position || record.position || '0')
        });
      }

      return records;

    } catch (error: any) {
      logger.error('Failed to load GSC CSV', error);
      return [];
    }
  }

  private compareIndexation(crawledPages: CrawledPage[], gscPages: GSCPage[]): any {
    const crawledUrls = new Set(crawledPages.map(p => p.url));
    const indexedUrls = new Set(gscPages.map(p => p.url));

    const issues: any[] = [];

    // Find discovered but not indexed
    const discoveredNotIndexed = crawledPages.filter(p =>
      !indexedUrls.has(p.url) && p.noindex === 0
    );

    for (const page of discoveredNotIndexed) {
      issues.push({
        url: page.url,
        state: 'Discovered - currently not indexed',
        fix: this.suggestFix(page, 'not_indexed'),
        severity: page.depth <= 2 ? 'HIGH' : 'MEDIUM',
        evidence: {
          crawled: true,
          indexed: false,
          noindex: page.noindex,
          depth: page.depth
        }
      });
    }

    // Find indexed but not in crawl (potential orphans)
    const indexedNotCrawled = gscPages.filter(p =>
      !crawledUrls.has(p.url)
    );

    for (const page of indexedNotCrawled) {
      issues.push({
        url: page.url,
        state: 'Indexed but not found in crawl',
        fix: 'Check internal linking - page may be orphaned',
        severity: page.impressions > 100 ? 'HIGH' : 'LOW',
        evidence: {
          crawled: false,
          indexed: true,
          impressions: page.impressions
        }
      });
    }

    // Find low-quality indexed pages
    const lowQualityIndexed = gscPages.filter(p =>
      p.impressions > 0 && p.clicks === 0 && p.position > 50
    );

    for (const page of lowQualityIndexed) {
      issues.push({
        url: page.url,
        state: 'Low quality indexed page',
        fix: 'Improve content quality or consider noindex',
        severity: 'LOW',
        evidence: {
          impressions: page.impressions,
          clicks: page.clicks,
          position: page.position
        }
      });
    }

    // Check for potential duplicates
    const duplicates = this.findPotentialDuplicates(crawledPages);

    for (const dup of duplicates) {
      issues.push({
        url: dup.url,
        state: 'Potential duplicate content',
        fix: 'Set canonical URL or consolidate content',
        severity: 'MEDIUM',
        evidence: {
          similarPages: dup.similar
        }
      });
    }

    return {
      summary: {
        discoveredNotIndexed: discoveredNotIndexed.length,
        crawledNotIndexed: 0, // Would need Coverage API
        excludedDuplicates: duplicates.length,
        lowQualityIndexed: lowQualityIndexed.length,
        totalIndexed: gscPages.length,
        totalCrawled: crawledPages.length
      },
      issues
    };
  }

  private findPotentialDuplicates(pages: CrawledPage[]): any[] {
    const duplicates: any[] = [];
    const titleMap = new Map<string, CrawledPage[]>();

    // Group by similar titles
    for (const page of pages) {
      if (page.title) {
        const normalizedTitle = page.title.toLowerCase().trim();
        if (!titleMap.has(normalizedTitle)) {
          titleMap.set(normalizedTitle, []);
        }
        titleMap.get(normalizedTitle)!.push(page);
      }
    }

    // Find groups with multiple pages
    for (const [title, pageGroup] of titleMap) {
      if (pageGroup.length > 1) {
        duplicates.push({
          url: pageGroup[0].url,
          similar: pageGroup.slice(1).map(p => p.url)
        });
      }
    }

    return duplicates;
  }

  private suggestFix(page: CrawledPage, issue: string): string {
    const fixes: string[] = [];

    if (issue === 'not_indexed') {
      // Depth-based suggestions
      if (page.depth > 3) {
        fixes.push('Reduce page depth through better internal linking');
      }

      // Section-based suggestions
      if (page.section === 'blog' || page.section === 'documentation') {
        fixes.push('Add to main navigation or feature on homepage');
      }

      // General suggestions
      fixes.push('Submit page directly via GSC URL Inspection');
      fixes.push('Improve internal linking from high-value pages');
      fixes.push('Ensure unique, valuable content');
    }

    return fixes.join('; ');
  }

  private generateRecommendations(analysis: any): string[] {
    const recommendations: string[] = [];

    if (analysis.summary.discoveredNotIndexed > 0) {
      recommendations.push(
        `${analysis.summary.discoveredNotIndexed} pages discovered but not indexed - review and improve internal linking`
      );
    }

    if (analysis.summary.excludedDuplicates > 0) {
      recommendations.push(
        `${analysis.summary.excludedDuplicates} potential duplicate pages - implement canonical URLs`
      );
    }

    if (analysis.summary.lowQualityIndexed > 0) {
      recommendations.push(
        `${analysis.summary.lowQualityIndexed} low-quality pages indexed - improve content or noindex`
      );
    }

    const indexRate = (analysis.summary.totalIndexed / analysis.summary.totalCrawled) * 100;
    if (indexRate < 80) {
      recommendations.push(
        `Indexation rate is ${indexRate.toFixed(1)}% - aim for 80%+ through content improvement`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Indexation health is good - continue monitoring');
    }

    return recommendations;
  }

  private formatSiteUrl(domain: string): string {
    if (domain.startsWith('sc-domain:') || domain.startsWith('http')) {
      return domain;
    }

    if (!domain.includes('/')) {
      return `sc-domain:${domain}`;
    }

    if (!domain.startsWith('http')) {
      return `https://${domain}`;
    }

    return domain;
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}