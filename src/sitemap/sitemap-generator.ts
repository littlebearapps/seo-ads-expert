/**
 * Sitemap Generator
 * Creates intelligent sectioned sitemaps
 */

import Database from 'better-sqlite3';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { logger } from '../utils/logger.js';
import { URL } from 'url';
import fetch from 'node-fetch';

export interface SitemapFile {
  filename: string;
  content: string;
  urlCount: number;
}

export interface SitemapOptions {
  sessionId: string;
  sectioned: boolean;
  pretty: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  urlCount: number;
  errors: string[];
  warnings: string[];
}

interface PageRecord {
  url: string;
  last_crawled: string;
  depth: number;
  section?: string;
  noindex: number;
  status: number;
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export class SitemapGenerator {
  private static readonly MAX_URLS_PER_SITEMAP = 50000;
  private static readonly MAX_SITEMAP_SIZE = 50 * 1024 * 1024; // 50MB

  constructor(private db?: Database.Database) {}

  async generateSitemaps(options: SitemapOptions): Promise<SitemapFile[]> {
    logger.info('Generating sitemaps', options);

    if (!this.db) {
      throw new Error('Database connection required for sitemap generation');
    }

    // Get all crawled pages
    const pages = this.db.prepare(`
      SELECT url, last_crawled, depth, section, noindex, status
      FROM crawl_pages
      WHERE crawl_session_id = ?
        AND status = 200
        AND noindex = 0
      ORDER BY section, depth, url
    `).all(options.sessionId) as PageRecord[];

    if (pages.length === 0) {
      logger.warn('No pages found for sitemap generation', { sessionId: options.sessionId });
      return this.generateEmptySitemap();
    }

    const sitemaps: SitemapFile[] = [];

    if (options.sectioned) {
      // Generate sectioned sitemaps
      const sections = this.organizeBySections(pages);

      for (const [section, sectionPages] of sections) {
        const chunks = this.chunkPages(sectionPages, SitemapGenerator.MAX_URLS_PER_SITEMAP);

        for (let i = 0; i < chunks.length; i++) {
          const filename = chunks.length > 1
            ? `sitemap_${section}_${i + 1}.xml`
            : `sitemap_${section}.xml`;

          const sitemap = this.generateSectionSitemap(
            section,
            chunks[i],
            filename,
            options.pretty
          );

          sitemaps.push(sitemap);
        }
      }
    } else {
      // Generate single sitemap or chunked sitemaps
      const chunks = this.chunkPages(pages, SitemapGenerator.MAX_URLS_PER_SITEMAP);

      for (let i = 0; i < chunks.length; i++) {
        const filename = chunks.length > 1
          ? `sitemap_${i + 1}.xml`
          : `sitemap.xml`;

        const sitemap = this.generateSectionSitemap(
          'main',
          chunks[i],
          filename,
          options.pretty
        );

        sitemaps.push(sitemap);
      }
    }

    // Generate index sitemap if multiple sitemaps
    if (sitemaps.length > 1) {
      const indexSitemap = this.generateIndexSitemap(sitemaps, options.pretty);
      return [indexSitemap, ...sitemaps];
    }

    return sitemaps;
  }

  private organizeBySections(pages: PageRecord[]): Map<string, PageRecord[]> {
    const sections = new Map<string, PageRecord[]>();

    for (const page of pages) {
      const section = this.detectSection(page.url, page.section);

      if (!sections.has(section)) {
        sections.set(section, []);
      }

      sections.get(section)!.push(page);
    }

    // Sort sections by priority
    const priorityOrder = ['main', 'products', 'blog', 'documentation', 'categories', 'legal', 'about'];
    const sortedSections = new Map<string, PageRecord[]>();

    // Add sections in priority order
    for (const sectionName of priorityOrder) {
      if (sections.has(sectionName)) {
        sortedSections.set(sectionName, sections.get(sectionName)!);
        sections.delete(sectionName);
      }
    }

    // Add remaining sections
    for (const [section, pages] of sections) {
      sortedSections.set(section, pages);
    }

    return sortedSections;
  }

  private detectSection(url: string, dbSection?: string): string {
    if (dbSection) return dbSection;

    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();

      // Home page
      if (path === '/' || path === '') return 'main';

      // Common section patterns
      if (path.includes('/blog/')) return 'blog';
      if (path.includes('/products/') || path.includes('/extensions/')) return 'products';
      if (path.includes('/docs/') || path.includes('/documentation/')) return 'documentation';
      if (path.includes('/about')) return 'about';
      if (path.includes('/contact')) return 'contact';
      if (path.includes('/privacy') || path.includes('/terms') || path.includes('/legal')) return 'legal';
      if (path.includes('/use-case')) return 'use-cases';
      if (path.includes('/faq')) return 'faq';

      // Check if it's a category page (single path segment)
      const segments = path.split('/').filter(s => s.length > 0);
      if (segments.length === 1) return 'categories';

      return 'main';
    } catch {
      return 'main';
    }
  }

  private chunkPages(pages: PageRecord[], maxUrls: number): PageRecord[][] {
    const chunks: PageRecord[][] = [];

    for (let i = 0; i < pages.length; i += maxUrls) {
      chunks.push(pages.slice(i, i + maxUrls));
    }

    return chunks;
  }

  private generateSectionSitemap(
    section: string,
    pages: PageRecord[],
    filename: string,
    pretty: boolean
  ): SitemapFile {
    const urls: SitemapUrl[] = pages.map(page => ({
      loc: page.url, // XMLBuilder handles escaping
      lastmod: this.formatDate(page.last_crawled),
      changefreq: this.calculateChangeFreq(page.depth, section),
      priority: this.calculatePriority(page.depth, section)
    }));

    const sitemapObj = {
      '?xml': {
        '@_version': '1.0',
        '@_encoding': 'UTF-8'
      },
      urlset: {
        '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
        '@_xmlns:image': 'http://www.google.com/schemas/sitemap-image/1.1',
        url: urls
      }
    };

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: pretty,
      indentBy: '  ',
      suppressEmptyNode: true
    });

    const content = builder.build(sitemapObj);

    return {
      filename,
      content,
      urlCount: pages.length
    };
  }

  private generateIndexSitemap(sitemaps: SitemapFile[], pretty: boolean): SitemapFile {
    const baseUrl = process.env.SITE_URL || 'https://littlebearapps.com';

    const sitemapEntries = sitemaps.map(sitemap => ({
      loc: `${baseUrl}/${sitemap.filename}`,
      lastmod: this.formatDate(new Date().toISOString())
    }));

    const indexObj = {
      '?xml': {
        '@_version': '1.0',
        '@_encoding': 'UTF-8'
      },
      sitemapindex: {
        '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
        sitemap: sitemapEntries
      }
    };

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: pretty,
      indentBy: '  '
    });

    const content = builder.build(indexObj);

    return {
      filename: 'sitemap_index.xml',
      content,
      urlCount: sitemaps.reduce((sum, s) => sum + s.urlCount, 0)
    };
  }

  private generateEmptySitemap(): SitemapFile[] {
    const emptyObj = {
      '?xml': {
        '@_version': '1.0',
        '@_encoding': 'UTF-8'
      },
      urlset: {
        '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9'
      }
    };

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true
    });

    return [{
      filename: 'sitemap.xml',
      content: builder.build(emptyObj),
      urlCount: 0
    }];
  }

  private calculateChangeFreq(depth: number, section: string): string {
    // More important pages change more frequently
    if (depth === 0) return 'daily';
    if (section === 'blog') return 'weekly';
    if (section === 'products' || section === 'main') return 'weekly';
    if (depth === 1) return 'weekly';
    if (depth === 2) return 'monthly';
    return 'yearly';
  }

  private calculatePriority(depth: number, section: string): number {
    // Home page has highest priority
    if (depth === 0) return 1.0;

    // Section-based priority adjustments
    let basePriority = 0.5;
    if (section === 'products') basePriority = 0.8;
    if (section === 'main') basePriority = 0.7;
    if (section === 'blog') basePriority = 0.6;

    // Decrease priority with depth
    const depthPenalty = depth * 0.1;
    const priority = Math.max(0.1, basePriority - depthPenalty);

    return Math.round(priority * 10) / 10; // Round to 1 decimal place
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async validateSitemap(url: string): Promise<ValidationResult> {
    logger.info('Validating sitemap', { url });

    const errors: string[] = [];
    const warnings: string[] = [];
    let urlCount = 0;

    try {
      // Fetch sitemap content
      let content: string;

      if (url.startsWith('http')) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch sitemap: ${response.status}`);
        }
        content = await response.text();
      } else {
        // Local file
        const fs = await import('fs/promises');
        content = await fs.readFile(url, 'utf-8');
      }

      // Parse XML
      const parser = new XMLParser({
        ignoreAttributes: false,
        allowBooleanAttributes: true
      });

      const result = parser.parse(content);

      // Check if it's a sitemap index or urlset
      if (result.sitemapindex) {
        // Sitemap index
        const sitemaps = Array.isArray(result.sitemapindex.sitemap)
          ? result.sitemapindex.sitemap
          : [result.sitemapindex.sitemap];

        urlCount = sitemaps.length;

        for (const sitemap of sitemaps) {
          if (!sitemap.loc) {
            errors.push('Sitemap entry missing loc element');
          }
        }
      } else if (result.urlset) {
        // URL sitemap
        const urls = Array.isArray(result.urlset.url)
          ? result.urlset.url
          : result.urlset.url ? [result.urlset.url] : [];

        urlCount = urls.length;

        if (urlCount === 0) {
          warnings.push('Sitemap contains no URLs');
        }

        if (urlCount > SitemapGenerator.MAX_URLS_PER_SITEMAP) {
          errors.push(`Sitemap exceeds maximum URL limit of ${SitemapGenerator.MAX_URLS_PER_SITEMAP}`);
        }

        for (const url of urls) {
          if (!url.loc) {
            errors.push('URL entry missing loc element');
          }

          if (url.priority && (url.priority < 0 || url.priority > 1)) {
            warnings.push(`Invalid priority value: ${url.priority}`);
          }

          if (url.changefreq) {
            const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
            if (!validFreqs.includes(url.changefreq)) {
              warnings.push(`Invalid changefreq value: ${url.changefreq}`);
            }
          }
        }
      } else {
        errors.push('Invalid sitemap format: missing urlset or sitemapindex');
      }

      // Check file size
      const sizeInBytes = Buffer.byteLength(content, 'utf-8');
      if (sizeInBytes > SitemapGenerator.MAX_SITEMAP_SIZE) {
        errors.push(`Sitemap exceeds maximum size of 50MB (current: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB)`);
      }

    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      urlCount,
      errors,
      warnings
    };
  }
}