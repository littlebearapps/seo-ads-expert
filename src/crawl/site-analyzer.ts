/**
 * Site Analyzer
 * Internal HTML crawler using undici for performance
 */

import { request } from 'undici';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import Database from 'better-sqlite3';
import { URL } from 'url';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { LinkGraphAnalyzer } from './link-graph-analyzer.js';
import { CrawlConfig } from './orchestrator.js';

export interface CrawlStats {
  discovered: number;
  crawled: number;
  links: number;
  errors: any[];
}

export interface PageData {
  url: string;
  canonicalUrl?: string;
  status: number;
  title?: string;
  metaDescription?: string;
  h1?: string;
  wordCount: number;
  noindex: boolean;
  nofollow: boolean;
  robotsAllowed: boolean;
  depth: number;
  section?: string;
  contentHash?: string;
  sessionId: string;
  // Advanced features
  responseTime?: number;
  contentType?: string;
  imagesCount?: number;
  externalLinksCount?: number;
  internalLinksCount?: number;
  headings?: {
    h1: number;
    h2: number;
    h3: number;
  };
  schemaTypes?: string[];
  openGraphData?: {
    title?: string;
    description?: string;
    image?: string;
    type?: string;
  };
}

export class SiteAnalyzer {
  private discovered: Set<string>;
  private crawled: Set<string>;
  private queue: PQueue;
  private baseUrl: URL;
  private errors: any[] = [];

  constructor(
    private config: CrawlConfig,
    private db: Database.Database,
    private linkGraph: LinkGraphAnalyzer
  ) {
    this.discovered = new Set();
    this.crawled = new Set();
    this.queue = new PQueue({ concurrency: config.concurrency });
  }

  async crawlSite(startUrl: string, sessionId: string): Promise<CrawlStats> {
    this.baseUrl = new URL(startUrl);
    this.discovered.add(this.normalizeUrl(startUrl));

    // Add initial URL to queue
    await this.queue.add(() => this.crawlPage(startUrl, 0, sessionId));

    // Process queue until complete or limits reached
    while (this.queue.size > 0 || this.queue.pending > 0) {
      if (this.crawled.size >= this.config.maxPages) {
        logger.info('Reached max pages limit', { limit: this.config.maxPages });
        await this.queue.clear();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.queue.onIdle();

    return {
      discovered: this.discovered.size,
      crawled: this.crawled.size,
      links: await this.linkGraph.getLinkCount(sessionId),
      errors: this.errors
    };
  }

  private async crawlPage(url: string, depth: number, sessionId: string): Promise<void> {
    const normalizedUrl = this.normalizeUrl(url);

    // Check if already crawled or depth exceeded
    if (this.crawled.has(normalizedUrl)) return;
    if (depth > this.config.maxDepth) return;
    if (this.crawled.size >= this.config.maxPages) return;

    this.crawled.add(normalizedUrl);

    try {
      logger.debug('Crawling page', { url, depth });

      // Track response time
      const startTime = Date.now();

      // Fetch the page
      const response = await request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'SEOAdsExpert/1.9 (Internal Crawler)',
          'Accept': 'text/html,application/xhtml+xml'
        },
        throwOnError: false,
        bodyTimeout: 10000,
        headersTimeout: 5000
      });

      const responseTime = Date.now() - startTime;
      const status = response.statusCode;
      const contentType = response.headers['content-type'] as string || '';

      // Only process HTML pages
      if (!contentType.includes('text/html')) {
        this.storeNonHtmlPage(url, status, sessionId, contentType);
        return;
      }

      const body = await response.body.text();

      // Parse HTML
      const $ = cheerio.load(body);

      // Extract page data with advanced features
      const pageData = this.extractPageData($, url, status, depth, sessionId, responseTime, contentType);

      // Store page in database
      this.storePage(pageData);

      // Extract and process links
      if (status === 200 && depth < this.config.maxDepth) {
        const links = this.extractLinks($, url);

        for (const link of links) {
          // Store link relationship
          this.linkGraph.addLink(url, link.href, link.anchor, link.type, sessionId);

          // Queue internal links for crawling
          if (link.type === 'internal' && !this.discovered.has(this.normalizeUrl(link.href))) {
            this.discovered.add(this.normalizeUrl(link.href));

            if (this.crawled.size < this.config.maxPages) {
              await this.queue.add(() => this.crawlPage(link.href, depth + 1, sessionId));
            }
          }
        }
      }

    } catch (error: any) {
      logger.error('Error crawling page', { url, error: error.message });
      this.errors.push({ url, error: error.message, depth });

      // Store error in database
      this.storePageError(url, error, sessionId);
    }
  }

  private extractPageData(
    $: cheerio.CheerioAPI,
    url: string,
    status: number,
    depth: number,
    sessionId: string,
    responseTime?: number,
    contentType?: string
  ): PageData {
    const title = $('title').text().trim();
    const metaDescription = $('meta[name="description"]').attr('content')?.trim();
    const h1 = $('h1').first().text().trim();
    const canonical = $('link[rel="canonical"]').attr('href');

    // Check meta robots
    const metaRobots = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
    const noindex = metaRobots.includes('noindex');
    const nofollow = metaRobots.includes('nofollow');

    // Count words (rough estimate)
    const textContent = $('body').text();
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

    // Generate content hash
    const contentHash = crypto.createHash('md5').update(textContent).digest('hex');

    // Detect section
    const section = this.detectSection(url);

    // Count headings
    const headings = {
      h1: $('h1').length,
      h2: $('h2').length,
      h3: $('h3').length
    };

    // Count images
    const imagesCount = $('img').length;

    // Count internal vs external links
    let internalLinksCount = 0;
    let externalLinksCount = 0;
    const pageUrlObj = new URL(url);

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        const linkUrl = new URL(href, url);
        if (linkUrl.hostname === pageUrlObj.hostname) {
          internalLinksCount++;
        } else if (linkUrl.protocol.startsWith('http')) {
          externalLinksCount++;
        }
      } catch {
        // Invalid URL, skip
      }
    });

    // Extract Schema.org types
    const schemaTypes: string[] = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonLd = JSON.parse($(element).text());
        if (jsonLd['@type']) {
          if (Array.isArray(jsonLd['@type'])) {
            schemaTypes.push(...jsonLd['@type']);
          } else {
            schemaTypes.push(jsonLd['@type']);
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    });

    // Extract Open Graph data
    const openGraphData = {
      title: $('meta[property="og:title"]').attr('content')?.trim(),
      description: $('meta[property="og:description"]').attr('content')?.trim(),
      image: $('meta[property="og:image"]').attr('content')?.trim(),
      type: $('meta[property="og:type"]').attr('content')?.trim()
    };

    return {
      url,
      canonicalUrl: canonical,
      status,
      title,
      metaDescription,
      h1,
      wordCount,
      noindex,
      nofollow,
      robotsAllowed: true, // Will be enhanced with robots.txt checking
      depth,
      section,
      contentHash,
      sessionId,
      // Advanced features
      responseTime,
      contentType,
      imagesCount,
      externalLinksCount,
      internalLinksCount,
      headings,
      schemaTypes: schemaTypes.length > 0 ? schemaTypes : undefined,
      openGraphData: openGraphData.title ? openGraphData : undefined
    };
  }

  private extractLinks($: cheerio.CheerioAPI, pageUrl: string): Array<{href: string, anchor: string, type: string}> {
    const links: Array<{href: string, anchor: string, type: string}> = [];
    const pageUrlObj = new URL(pageUrl);

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const anchor = $(element).text().trim();

      if (!href) return;

      try {
        const linkUrl = new URL(href, pageUrl);

        // Classify link type
        let type = 'external';
        if (linkUrl.hostname === pageUrlObj.hostname) {
          type = 'internal';
        } else if (linkUrl.protocol === 'mailto:') {
          type = 'mailto';
        } else if (linkUrl.protocol === 'tel:') {
          type = 'tel';
        }

        // Skip non-HTTP(S) links except mailto/tel
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(linkUrl.protocol)) {
          return;
        }

        links.push({
          href: linkUrl.href,
          anchor: anchor || '',
          type
        });

      } catch (error) {
        // Invalid URL, skip
        logger.debug('Invalid URL found', { href, pageUrl });
      }
    });

    return links;
  }

  private storePage(pageData: PageData): void {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO crawl_pages (
          url, canonical_url, status, title, meta_description, h1,
          word_count, noindex, nofollow, robots_allowed, depth,
          section, content_hash, response_time, content_type,
          images_count, internal_links_count, external_links_count,
          h1_count, h2_count, h3_count, schema_types,
          og_title, og_description, og_image, og_type,
          crawl_session_id, last_crawled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        pageData.url,
        pageData.canonicalUrl,
        pageData.status,
        pageData.title,
        pageData.metaDescription,
        pageData.h1,
        pageData.wordCount,
        pageData.noindex ? 1 : 0,
        pageData.nofollow ? 1 : 0,
        pageData.robotsAllowed ? 1 : 0,
        pageData.depth,
        pageData.section,
        pageData.contentHash,
        pageData.responseTime,
        pageData.contentType,
        pageData.imagesCount,
        pageData.internalLinksCount,
        pageData.externalLinksCount,
        pageData.headings?.h1,
        pageData.headings?.h2,
        pageData.headings?.h3,
        pageData.schemaTypes ? JSON.stringify(pageData.schemaTypes) : null,
        pageData.openGraphData?.title,
        pageData.openGraphData?.description,
        pageData.openGraphData?.image,
        pageData.openGraphData?.type,
        pageData.sessionId
      );
    } catch (error) {
      logger.error('Failed to store page', { url: pageData.url, error });
    }
  }

  private storeNonHtmlPage(url: string, status: number, sessionId: string, contentType?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO crawl_pages (
        url, status, crawl_session_id, content_type, last_crawled
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(url, status, sessionId, contentType);
  }

  private storePageError(url: string, error: any, sessionId: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO crawl_pages (
        url, status, crawl_session_id, last_crawled
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(url, error.statusCode || 0, sessionId);
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove fragment
      urlObj.hash = '';
      // Sort query parameters for consistency
      urlObj.searchParams.sort();
      // Remove trailing slash from path (except for root)
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.href;
    } catch {
      return url;
    }
  }

  private detectSection(url: string): string {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Common section patterns
    if (path.includes('/blog/')) return 'blog';
    if (path.includes('/products/') || path.includes('/extensions/')) return 'products';
    if (path.includes('/docs/') || path.includes('/documentation/')) return 'documentation';
    if (path.includes('/about')) return 'about';
    if (path.includes('/contact')) return 'contact';
    if (path.includes('/privacy') || path.includes('/terms')) return 'legal';
    if (path === '/' || path === '') return 'home';

    // Check if it's a category page (single path segment)
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.length === 1) return 'categories';

    return 'main';
  }
}