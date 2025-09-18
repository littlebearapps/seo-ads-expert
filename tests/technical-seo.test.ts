import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TechnicalSEOValidator } from '../src/validators/technical-seo.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('TechnicalSEOValidator', () => {
  let validator: TechnicalSEOValidator;

  beforeEach(() => {
    validator = new TechnicalSEOValidator(false); // Lighthouse disabled for tests
    vi.clearAllMocks();
  });

  describe('sitemap validation', () => {
    it('should detect URL in sitemap', async () => {
      const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page1</loc>
            <lastmod>2025-01-01</lastmod>
            <changefreq>weekly</changefreq>
            <priority>0.8</priority>
          </url>
        </urlset>`;

      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: sitemapXML,
        headers: {},
        statusText: 'OK',
        config: {} as any
      });

      const result = await validator.validateSitemap('https://example.com/page1');

      expect(result.existsInSitemap).toBe(true);
      expect(result.lastModified).toBe('2025-01-01');
      expect(result.changeFrequency).toBe('weekly');
      expect(result.priority).toBe(0.8);
    });

    it('should handle sitemap index', async () => {
      const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap>
            <loc>https://example.com/sitemap-pages.xml</loc>
          </sitemap>
        </sitemapindex>`;

      const pagesSitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/test-page</loc>
          </url>
        </urlset>`;

      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          status: 200,
          data: sitemapIndex,
          headers: {},
          statusText: 'OK',
          config: {} as any
        })
        .mockResolvedValueOnce({
          status: 200,
          data: pagesSitemap,
          headers: {},
          statusText: 'OK',
          config: {} as any
        });

      const result = await validator.validateSitemap('https://example.com/test-page');

      expect(result.existsInSitemap).toBe(true);
    });

    it('should report URL not in sitemap', async () => {
      const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/other-page</loc>
          </url>
        </urlset>`;

      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: sitemapXML,
        headers: {},
        statusText: 'OK',
        config: {} as any
      });

      const result = await validator.validateSitemap('https://example.com/missing-page');

      expect(result.existsInSitemap).toBe(false);
      expect(result.errors).toContain('URL not found in sitemap: https://example.com/missing-page');
    });
  });

  describe('robots.txt validation', () => {
    it('should allow URL not blocked by robots.txt', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /public/
      `;

      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: robotsTxt,
        headers: {},
        statusText: 'OK',
        config: {} as any
      });

      const result = await validator.validateRobots('https://example.com/public/page');

      expect(result.isAllowed).toBe(true);
      expect(result.matchedRule).toBe('allow: /public/');
    });

    it('should block URL disallowed by robots.txt', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin/
      `;

      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: robotsTxt,
        headers: {},
        statusText: 'OK',
        config: {} as any
      });

      const result = await validator.validateRobots('https://example.com/admin/settings');

      expect(result.isAllowed).toBe(false);
      expect(result.matchedRule).toBe('disallow: /admin/');
      expect(result.errors).toContain('URL is disallowed by robots.txt: disallow: /admin/');
    });

    it('should handle user-agent specific rules', async () => {
      const robotsTxt = `
User-agent: Googlebot
Disallow: /no-google/

User-agent: *
Allow: /
      `;

      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: robotsTxt,
        headers: {},
        statusText: 'OK',
        config: {} as any
      });

      const result = await validator.validateRobots('https://example.com/no-google/page', 'Googlebot');

      expect(result.isAllowed).toBe(false);
      expect(result.userAgent).toBe('Googlebot');
    });

    it('should allow all if no robots.txt exists', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce({
        response: { status: 404 },
        isAxiosError: true
      });

      const result = await validator.validateRobots('https://example.com/any-page');

      expect(result.isAllowed).toBe(true);
    });
  });

  describe('complete validation', () => {
    it('should perform all validations and generate recommendations', async () => {
      const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page</loc>
          </url>
        </urlset>`;

      const robotsTxt = `
User-agent: *
Allow: /
      `;

      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          status: 200,
          data: sitemapXML,
          headers: {},
          statusText: 'OK',
          config: {} as any
        })
        .mockResolvedValueOnce({
          status: 200,
          data: robotsTxt,
          headers: {},
          statusText: 'OK',
          config: {} as any
        });

      const result = await validator.validate('https://example.com/page');

      expect(result.overallPassed).toBe(true);
      expect(result.sitemap.existsInSitemap).toBe(true);
      expect(result.robots.isAllowed).toBe(true);
      expect(result.recommendations).toContain('Add <lastmod> to sitemap entry for better crawl prioritization');
    });

    it('should fail validation for blocked URL', async () => {
      const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        </urlset>`;

      const robotsTxt = `
User-agent: *
Disallow: /blocked/
      `;

      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          status: 200,
          data: sitemapXML,
          headers: {},
          statusText: 'OK',
          config: {} as any
        })
        .mockResolvedValueOnce({
          status: 200,
          data: robotsTxt,
          headers: {},
          statusText: 'OK',
          config: {} as any
        });

      const result = await validator.validate('https://example.com/blocked/page');

      expect(result.overallPassed).toBe(false);
      expect(result.sitemap.existsInSitemap).toBe(false);
      expect(result.robots.isAllowed).toBe(false);
      expect(result.recommendations).toContain('Add URL to sitemap.xml for better crawlability');
      expect(result.recommendations).toContain('URL is blocked by robots.txt - review disallow: /blocked/');
    });
  });

  describe('batch validation', () => {
    it('should validate multiple URLs respecting concurrency', async () => {
      const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>`;

      const robotsTxt = `User-agent: *\nAllow: /`;

      // Mock for all requests
      vi.mocked(axios.get).mockImplementation((url) => {
        if (url.includes('sitemap')) {
          return Promise.resolve({
            status: 200,
            data: sitemapXML,
            headers: {},
            statusText: 'OK',
            config: {} as any
          });
        } else if (url.includes('robots.txt')) {
          return Promise.resolve({
            status: 200,
            data: robotsTxt,
            headers: {},
            statusText: 'OK',
            config: {} as any
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3'
      ];

      const results = await validator.validateBatch(urls, { concurrency: 2 });

      expect(results).toHaveLength(3);
      expect(results[0].sitemap.existsInSitemap).toBe(true);
      expect(results[1].sitemap.existsInSitemap).toBe(true);
      expect(results[2].sitemap.existsInSitemap).toBe(false);
    });
  });

  describe('report generation', () => {
    it('should generate comprehensive report', () => {
      const results = [
        {
          url: 'https://example.com/page1',
          sitemap: { url: 'https://example.com/page1', existsInSitemap: true },
          robots: { url: 'https://example.com/page1', isAllowed: true, robotsTxtUrl: '', userAgent: 'Googlebot' },
          overallPassed: true,
          recommendations: []
        },
        {
          url: 'https://example.com/page2',
          sitemap: { url: 'https://example.com/page2', existsInSitemap: false, errors: ['Not found'] },
          robots: { url: 'https://example.com/page2', isAllowed: false, robotsTxtUrl: '', userAgent: 'Googlebot', matchedRule: 'disallow: /page2' },
          overallPassed: false,
          recommendations: ['Add URL to sitemap.xml for better crawlability', 'URL is blocked by robots.txt - review disallow: /page2']
        }
      ];

      const report = validator.generateReport(results);

      expect(report).toContain('Technical SEO Validation Report');
      expect(report).toContain('Total URLs checked: 2');
      expect(report).toContain('Passed: 1');
      expect(report).toContain('Failed: 1');
      expect(report).toContain('URLs Missing from Sitemap:');
      expect(report).toContain('https://example.com/page2');
      expect(report).toContain('Robots.txt Issues');
      expect(report).toContain('Top Recommendations');
    });
  });
});