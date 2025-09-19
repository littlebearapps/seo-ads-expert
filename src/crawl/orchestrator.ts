/**
 * Crawl Orchestrator
 * Manages site crawling and link graph analysis
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { SiteAnalyzer } from './site-analyzer.js';
import { LinkGraphAnalyzer } from './link-graph-analyzer.js';
import path from 'path';
import fs from 'fs/promises';

export interface CrawlConfig {
  maxDepth: number;
  maxPages: number;
  concurrency: number;
}

export interface CrawlResults {
  sessionId: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  linksDiscovered: number;
  orphanPages: number;
  brokenLinks: number;
  errors: any[];
  startTime: string;
  endTime: string;
}

export class CrawlOrchestrator {
  private analyzer: SiteAnalyzer;
  private linkGraph: LinkGraphAnalyzer;

  constructor(
    private db: Database.Database,
    private config: CrawlConfig = {
      maxDepth: 4,
      maxPages: 500,
      concurrency: 3
    }
  ) {
    this.linkGraph = new LinkGraphAnalyzer(db);
    this.analyzer = new SiteAnalyzer(config, db, this.linkGraph);
  }

  async crawlSite(startUrl: string): Promise<CrawlResults> {
    logger.info('Starting crawl', { url: startUrl, config: this.config });

    const sessionId = `crawl_${Date.now()}`;
    const startTime = new Date().toISOString();

    try {
      // Run the crawl
      const results = await this.analyzer.crawlSite(startUrl, sessionId);

      // Analyze the results
      const orphans = await this.linkGraph.findOrphanPages(sessionId);
      const broken = await this.linkGraph.findBrokenLinks(sessionId);

      const endTime = new Date().toISOString();

      const crawlResults: CrawlResults = {
        sessionId,
        pagesDiscovered: results.discovered,
        pagesCrawled: results.crawled,
        linksDiscovered: results.links,
        orphanPages: orphans.length,
        brokenLinks: broken.length,
        errors: results.errors,
        startTime,
        endTime
      };

      // Store crawl metadata
      this.db.prepare(`
        INSERT OR REPLACE INTO crawl_sessions (
          session_id, start_url, start_time, end_time,
          pages_discovered, pages_crawled, errors
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        startUrl,
        startTime,
        endTime,
        crawlResults.pagesDiscovered,
        crawlResults.pagesCrawled,
        JSON.stringify(crawlResults.errors)
      );

      return crawlResults;
    } catch (error) {
      logger.error('Crawl failed', error);
      throw error;
    }
  }

  async getCrawlResults(sessionId: string): Promise<CrawlResults> {
    if (sessionId === 'latest') {
      const latest = this.db.prepare(`
        SELECT session_id FROM crawl_sessions
        ORDER BY start_time DESC LIMIT 1
      `).get() as { session_id: string } | undefined;

      if (!latest) {
        throw new Error('No crawl sessions found');
      }
      sessionId = latest.session_id;
    }

    const session = this.db.prepare(`
      SELECT * FROM crawl_sessions WHERE session_id = ?
    `).get(sessionId) as any;

    if (!session) {
      throw new Error(`Crawl session not found: ${sessionId}`);
    }

    const orphans = await this.linkGraph.findOrphanPages(sessionId);
    const broken = await this.linkGraph.findBrokenLinks(sessionId);
    const linkCount = await this.linkGraph.getLinkCount(sessionId);

    return {
      sessionId: session.session_id,
      pagesDiscovered: session.pages_discovered || 0,
      pagesCrawled: session.pages_crawled || 0,
      linksDiscovered: linkCount,
      orphanPages: orphans.length,
      brokenLinks: broken.length,
      errors: JSON.parse(session.errors || '[]'),
      startTime: session.start_time,
      endTime: session.end_time
    };
  }

  async analyzeCrawlData(type: string, sessionId: string): Promise<any> {
    logger.info('Analyzing crawl data', { type, sessionId });

    if (sessionId === 'latest') {
      const latest = this.db.prepare(`
        SELECT session_id FROM crawl_sessions
        ORDER BY start_time DESC LIMIT 1
      `).get() as { session_id: string } | undefined;

      if (!latest) {
        throw new Error('No crawl sessions found');
      }
      sessionId = latest.session_id;
    }

    switch (type) {
      case 'orphans':
        return {
          type: 'Orphan Pages',
          sessionId,
          analysis: await this.linkGraph.findOrphanPages(sessionId)
        };

      case 'broken-links':
        return {
          type: 'Broken Links',
          sessionId,
          analysis: await this.linkGraph.findBrokenLinks(sessionId)
        };

      case 'link-opportunities':
        return {
          type: 'Link Opportunities',
          sessionId,
          analysis: await this.linkGraph.findLinkOpportunities(sessionId)
        };

      case 'duplicates':
        return {
          type: 'Duplicate Content',
          sessionId,
          analysis: await this.findDuplicateContent(sessionId)
        };

      default:
        throw new Error(`Unknown analysis type: ${type}`);
    }
  }

  async emitLinkGraph(sessionId: string): Promise<void> {
    logger.info('Emitting link graph', { sessionId });

    const linkGraphJson = await this.linkGraph.generateLinkGraphJson(sessionId);

    // Get site domain from first page
    const firstPage = this.db.prepare(`
      SELECT url FROM crawl_pages WHERE crawl_session_id = ? LIMIT 1
    `).get(sessionId) as { url: string } | undefined;

    if (!firstPage) {
      throw new Error('No pages found in crawl session');
    }

    const domain = new URL(firstPage.url).hostname.replace('www.', '');
    const date = new Date().toISOString().split('T')[0];

    // Create output directory
    const outputDir = path.join(process.cwd(), 'plans', domain, date);
    await fs.mkdir(outputDir, { recursive: true });

    // Write link graph JSON
    const outputPath = path.join(outputDir, 'link_graph.json');
    await fs.writeFile(outputPath, linkGraphJson, 'utf-8');

    logger.info('Link graph emitted', { path: outputPath });
  }

  formatAsCSV(analysis: any): string {
    if (!analysis.analysis || !Array.isArray(analysis.analysis)) {
      return 'No data available\n';
    }

    const rows = [];
    const headers = Object.keys(analysis.analysis[0] || {});

    rows.push(headers.join(','));

    for (const item of analysis.analysis) {
      const values = headers.map(h => {
        const value = item[h];
        // Escape CSV values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      rows.push(values.join(','));
    }

    return rows.join('\n');
  }

  formatAsMarkdown(analysis: any): string {
    let markdown = `# ${analysis.type} Analysis Report\n\n`;
    markdown += `**Session ID**: ${analysis.sessionId}\n`;
    markdown += `**Generated**: ${new Date().toISOString()}\n\n`;

    if (!analysis.analysis || analysis.analysis.length === 0) {
      markdown += '✅ No issues found!\n';
      return markdown;
    }

    markdown += `## Summary\n\n`;
    markdown += `Found **${analysis.analysis.length}** items\n\n`;

    if (analysis.type === 'Orphan Pages') {
      markdown += '## Orphan Pages\n\n';
      markdown += 'These pages have no incoming internal links:\n\n';

      for (const page of analysis.analysis) {
        markdown += `- **${page.url}**\n`;
        if (page.title) markdown += `  - Title: ${page.title}\n`;
        if (page.section) markdown += `  - Section: ${page.section}\n`;
      }
    } else if (analysis.type === 'Broken Links') {
      markdown += '## Broken Links\n\n';
      markdown += '| From URL | To URL | Status | Anchor Text |\n';
      markdown += '|----------|--------|--------|-------------|\n';

      for (const link of analysis.analysis) {
        markdown += `| ${link.fromUrl} | ${link.toUrl} | ${link.status || 'Not Found'} | ${link.anchorText} |\n`;
      }
    } else if (analysis.type === 'Link Opportunities') {
      markdown += '## Link Opportunities\n\n';

      for (const opp of analysis.analysis) {
        markdown += `### ${opp.targetUrl}\n`;
        markdown += `- **Source**: ${opp.sourceUrl}\n`;
        markdown += `- **Reason**: ${opp.reason}\n`;
        markdown += `- **Strength**: ${opp.strength}/100\n\n`;
      }
    }

    return markdown;
  }

  private async findDuplicateContent(sessionId: string): Promise<any[]> {
    // Find pages with identical content hashes
    const duplicates = this.db.prepare(`
      SELECT
        content_hash,
        GROUP_CONCAT(url, '|') as urls,
        COUNT(*) as count
      FROM crawl_pages
      WHERE crawl_session_id = ?
      AND content_hash IS NOT NULL
      GROUP BY content_hash
      HAVING COUNT(*) > 1
    `).all(sessionId);

    return duplicates.map((dup: any) => ({
      contentHash: dup.content_hash,
      urls: dup.urls.split('|'),
      count: dup.count
    }));
  }
}