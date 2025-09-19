/**
 * Link Graph Analyzer
 * Analyzes link relationships and finds issues
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export interface LinkData {
  fromUrl: string;
  toUrl: string;
  anchorText: string;
  linkType: string;
  context?: string;
}

export interface OrphanPage {
  url: string;
  title: string;
  section: string;
}

export interface BrokenLink {
  fromUrl: string;
  toUrl: string;
  status: number;
  anchorText: string;
}

export class LinkGraphAnalyzer {
  constructor(private db: Database.Database) {}

  addLink(fromUrl: string, toUrl: string, anchorText: string, linkType: string, sessionId: string): void {
    try {
      this.db.prepare(`
        INSERT INTO crawl_links (
          from_url, to_url, anchor_text, link_type, crawl_session_id
        ) VALUES (?, ?, ?, ?, ?)
      `).run(fromUrl, toUrl, anchorText, linkType, sessionId);
    } catch (error) {
      logger.debug('Failed to add link', { fromUrl, toUrl, error });
    }
  }

  async getLinkCount(sessionId: string): Promise<number> {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM crawl_links
      WHERE crawl_session_id = ?
    `).get(sessionId) as { count: number };

    return result.count;
  }

  async findOrphanPages(sessionId: string): Promise<OrphanPage[]> {
    // Find pages with no incoming internal links
    const orphans = this.db.prepare(`
      WITH internal_targets AS (
        SELECT DISTINCT to_url
        FROM crawl_links
        WHERE link_type = 'internal'
        AND crawl_session_id = ?
      )
      SELECT p.url, p.title, p.section
      FROM crawl_pages p
      LEFT JOIN internal_targets it ON p.url = it.to_url
      WHERE it.to_url IS NULL
        AND p.status = 200
        AND p.noindex = 0
        AND p.crawl_session_id = ?
        AND p.url != (
          SELECT url FROM crawl_pages
          WHERE crawl_session_id = ?
          ORDER BY depth ASC LIMIT 1
        )
    `).all(sessionId, sessionId, sessionId) as OrphanPage[];

    logger.info('Found orphan pages', { count: orphans.length });
    return orphans;
  }

  async findBrokenLinks(sessionId: string): Promise<BrokenLink[]> {
    // Find links to pages with non-200 status
    const broken = this.db.prepare(`
      SELECT
        l.from_url as fromUrl,
        l.to_url as toUrl,
        l.anchor_text as anchorText,
        p.status
      FROM crawl_links l
      LEFT JOIN crawl_pages p ON l.to_url = p.url AND p.crawl_session_id = ?
      WHERE l.crawl_session_id = ?
        AND l.link_type = 'internal'
        AND (p.status IS NULL OR p.status >= 400)
    `).all(sessionId, sessionId) as BrokenLink[];

    logger.info('Found broken links', { count: broken.length });
    return broken;
  }

  async calculatePageRank(sessionId: string, iterations: number = 10): Promise<Map<string, number>> {
    const pageRank = new Map<string, number>();

    // Initialize all pages with equal rank
    const pages = this.db.prepare(`
      SELECT DISTINCT url FROM crawl_pages WHERE crawl_session_id = ?
    `).all(sessionId) as Array<{ url: string }>;

    const initialRank = 1.0 / pages.length;
    pages.forEach(p => pageRank.set(p.url, initialRank));

    // Iterate PageRank algorithm
    for (let i = 0; i < iterations; i++) {
      const newRank = new Map<string, number>();

      for (const page of pages) {
        // Get incoming links
        const incomingLinks = this.db.prepare(`
          SELECT from_url,
            (SELECT COUNT(*) FROM crawl_links
             WHERE from_url = l.from_url
             AND crawl_session_id = ?) as outDegree
          FROM crawl_links l
          WHERE to_url = ?
          AND link_type = 'internal'
          AND crawl_session_id = ?
        `).all(sessionId, page.url, sessionId) as Array<{ from_url: string, outDegree: number }>;

        // Calculate new rank
        let rank = 0.15; // Damping factor
        for (const link of incomingLinks) {
          const fromRank = pageRank.get(link.from_url) || 0;
          rank += 0.85 * (fromRank / link.outDegree);
        }

        newRank.set(page.url, rank);
      }

      // Update ranks
      newRank.forEach((rank, url) => pageRank.set(url, rank));
    }

    return pageRank;
  }

  async findLinkOpportunities(sessionId: string): Promise<Array<{
    sourceUrl: string,
    targetUrl: string,
    reason: string,
    strength: number
  }>> {
    const opportunities = [];

    // Find pages with high PageRank but few incoming links
    const pageRank = await this.calculatePageRank(sessionId);

    // Get link counts for each page
    const linkCounts = this.db.prepare(`
      SELECT
        url,
        (SELECT COUNT(*) FROM crawl_links
         WHERE to_url = p.url
         AND link_type = 'internal'
         AND crawl_session_id = ?) as inLinks
      FROM crawl_pages p
      WHERE crawl_session_id = ?
      AND status = 200
      AND noindex = 0
    `).all(sessionId, sessionId) as Array<{ url: string, inLinks: number }>;

    // Find high-value pages with few links
    for (const page of linkCounts) {
      const rank = pageRank.get(page.url) || 0;

      // High PageRank but few incoming links
      if (rank > 0.02 && page.inLinks < 3) {
        // Find potential source pages
        const sources = this.db.prepare(`
          SELECT url, title, section
          FROM crawl_pages
          WHERE crawl_session_id = ?
          AND status = 200
          AND noindex = 0
          AND url != ?
          AND section = (SELECT section FROM crawl_pages WHERE url = ? AND crawl_session_id = ?)
          AND url NOT IN (
            SELECT from_url FROM crawl_links
            WHERE to_url = ?
            AND crawl_session_id = ?
          )
          LIMIT 5
        `).all(sessionId, page.url, page.url, sessionId, page.url, sessionId);

        for (const source of sources) {
          opportunities.push({
            sourceUrl: source.url,
            targetUrl: page.url,
            reason: 'High-value page needs more internal links',
            strength: Math.round(rank * 100)
          });
        }
      }
    }

    return opportunities;
  }

  async generateLinkGraphJson(sessionId: string): Promise<string> {
    const nodes = this.db.prepare(`
      SELECT
        url,
        status,
        title,
        canonical_url as canonical,
        noindex,
        depth,
        section,
        content_hash,
        last_crawled as lastmod
      FROM crawl_pages
      WHERE crawl_session_id = ?
    `).all(sessionId);

    const edges = this.db.prepare(`
      SELECT
        from_url as src,
        to_url as dst,
        anchor_text as anchor,
        link_type as rel
      FROM crawl_links
      WHERE crawl_session_id = ?
      AND link_type = 'internal'
    `).all(sessionId);

    // Calculate in/out counts
    const linkCounts = new Map<string, { in: number, out: number }>();

    for (const edge of edges) {
      if (!linkCounts.has(edge.src)) {
        linkCounts.set(edge.src, { in: 0, out: 0 });
      }
      if (!linkCounts.has(edge.dst)) {
        linkCounts.set(edge.dst, { in: 0, out: 0 });
      }

      linkCounts.get(edge.src)!.out++;
      linkCounts.get(edge.dst)!.in++;
    }

    // Enhance nodes with link counts
    const enhancedNodes = nodes.map(node => ({
      ...node,
      in: linkCounts.get(node.url)?.in || 0,
      out: linkCounts.get(node.url)?.out || 0,
      type: this.classifyPageType(node.url, node.section)
    }));

    // Get orphan and broken counts
    const orphans = await this.findOrphanPages(sessionId);
    const broken = await this.findBrokenLinks(sessionId);

    const linkGraph = {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      site: nodes[0]?.url ? new URL(nodes[0].url).origin : '',
      nodes: enhancedNodes,
      edges,
      summary: {
        pages: nodes.length,
        orphans: orphans.length,
        avg_out: edges.length / Math.max(nodes.length, 1),
        avg_in: edges.length / Math.max(nodes.length, 1),
        broken_links: broken.length
      }
    };

    return JSON.stringify(linkGraph, null, 2);
  }

  private classifyPageType(url: string, section?: string): string {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('/use-case') || urlLower.includes('/convert')) {
      return 'use-case';
    }
    if (urlLower.includes('/product') || urlLower.includes('/extension')) {
      return 'product';
    }
    if (urlLower.includes('/blog')) {
      return 'blog';
    }
    if (urlLower.includes('/docs') || urlLower.includes('/documentation')) {
      return 'docs';
    }
    if (section === 'categories') {
      return 'category';
    }

    return 'main';
  }
}