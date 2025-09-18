/**
 * Technical SEO Validation
 *
 * Implements v1.2 Task 8: Content Quality & Technical SEO Validation
 * - Sitemap.xml validation
 * - Robots.txt compliance checking
 * - Lighthouse Core Web Vitals integration
 */

import { logger } from '../utils/logger.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export interface SitemapValidationResult {
  url: string;
  existsInSitemap: boolean;
  sitemapUrl?: string;
  lastModified?: string;
  changeFrequency?: string;
  priority?: number;
  errors?: string[];
}

export interface RobotsValidationResult {
  url: string;
  isAllowed: boolean;
  robotsTxtUrl: string;
  matchedRule?: string;
  userAgent: string;
  errors?: string[];
}

export interface LighthouseResult {
  url: string;
  metrics: {
    lcp: number;  // Largest Contentful Paint (milliseconds)
    cls: number;  // Cumulative Layout Shift
    fid: number;  // First Input Delay (milliseconds)
    fcp: number;  // First Contentful Paint (milliseconds)
    ttfb: number; // Time to First Byte (milliseconds)
    si: number;   // Speed Index (milliseconds)
  };
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  passed: boolean;
  issues: string[];
}

export interface TechnicalSEOValidationResult {
  url: string;
  sitemap: SitemapValidationResult;
  robots: RobotsValidationResult;
  lighthouse?: LighthouseResult;
  overallPassed: boolean;
  recommendations: string[];
}

export class TechnicalSEOValidator {
  private sitemapCache = new Map<string, string>();
  private robotsCache = new Map<string, string>();
  private lighthouseEnabled: boolean;

  constructor(lighthouseEnabled = false) {
    this.lighthouseEnabled = lighthouseEnabled;
  }

  /**
   * Validate if URL exists in sitemap.xml
   */
  async validateSitemap(url: string): Promise<SitemapValidationResult> {
    const result: SitemapValidationResult = {
      url,
      existsInSitemap: false,
      errors: []
    };

    try {
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      const sitemapUrls = [
        `${baseUrl}/sitemap.xml`,
        `${baseUrl}/sitemap_index.xml`,
        `${baseUrl}/sitemap-index.xml`
      ];

      let sitemapContent: string | null = null;
      let foundSitemapUrl: string | null = null;

      // Try to find and fetch sitemap
      for (const sitemapUrl of sitemapUrls) {
        if (this.sitemapCache.has(sitemapUrl)) {
          sitemapContent = this.sitemapCache.get(sitemapUrl)!;
          foundSitemapUrl = sitemapUrl;
          break;
        }

        try {
          const response = await axios.get(sitemapUrl, {
            timeout: 5000,
            headers: {
              'User-Agent': 'SEO-Ads-Expert-Bot/1.0'
            }
          });

          if (response.status === 200 && response.data) {
            sitemapContent = response.data;
            foundSitemapUrl = sitemapUrl;
            this.sitemapCache.set(sitemapUrl, sitemapContent);
            break;
          }
        } catch (error) {
          // Continue to next sitemap URL
          continue;
        }
      }

      if (!sitemapContent || !foundSitemapUrl) {
        result.errors?.push('Sitemap.xml not found at standard locations');
        return result;
      }

      result.sitemapUrl = foundSitemapUrl;

      // Parse sitemap XML
      const $ = cheerio.load(sitemapContent, { xmlMode: true });

      // Check if it's a sitemap index
      const sitemapIndexUrls = $('sitemap loc').map((_, el) => $(el).text()).get();

      if (sitemapIndexUrls.length > 0) {
        // It's a sitemap index, need to fetch individual sitemaps
        for (const indexUrl of sitemapIndexUrls) {
          try {
            const indexResponse = await axios.get(indexUrl, {
              timeout: 5000,
              headers: {
                'User-Agent': 'SEO-Ads-Expert-Bot/1.0'
              }
            });

            if (indexResponse.status === 200 && indexResponse.data) {
              const $index = cheerio.load(indexResponse.data, { xmlMode: true });
              const urlEntry = $index('url').filter((_, el) => {
                const loc = $index(el).find('loc').text();
                return loc === url || loc === url.replace(/\/$/, '') || loc === `${url}/`;
              });

              if (urlEntry.length > 0) {
                result.existsInSitemap = true;
                result.lastModified = $index(urlEntry).find('lastmod').text() || undefined;
                result.changeFrequency = $index(urlEntry).find('changefreq').text() || undefined;
                const priority = $index(urlEntry).find('priority').text();
                if (priority) {
                  result.priority = parseFloat(priority);
                }
                break;
              }
            }
          } catch (error) {
            logger.debug(`Failed to fetch sitemap index ${indexUrl}: ${error}`);
          }
        }
      } else {
        // Regular sitemap
        const urlEntry = $('url').filter((_, el) => {
          const loc = $(el).find('loc').text();
          return loc === url || loc === url.replace(/\/$/, '') || loc === `${url}/`;
        });

        if (urlEntry.length > 0) {
          result.existsInSitemap = true;
          result.lastModified = $(urlEntry).find('lastmod').text() || undefined;
          result.changeFrequency = $(urlEntry).find('changefreq').text() || undefined;
          const priority = $(urlEntry).find('priority').text();
          if (priority) {
            result.priority = parseFloat(priority);
          }
        }
      }

      if (!result.existsInSitemap) {
        result.errors?.push(`URL not found in sitemap: ${url}`);
      }

    } catch (error) {
      result.errors?.push(`Failed to validate sitemap: ${error}`);
      logger.error('Sitemap validation error:', error);
    }

    return result;
  }

  /**
   * Validate if URL is allowed by robots.txt
   */
  async validateRobots(url: string, userAgent = 'Googlebot'): Promise<RobotsValidationResult> {
    const result: RobotsValidationResult = {
      url,
      isAllowed: true,
      robotsTxtUrl: '',
      userAgent,
      errors: []
    };

    try {
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      const robotsUrl = `${baseUrl}/robots.txt`;
      result.robotsTxtUrl = robotsUrl;

      let robotsContent: string;

      if (this.robotsCache.has(robotsUrl)) {
        robotsContent = this.robotsCache.get(robotsUrl)!;
      } else {
        const response = await axios.get(robotsUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'SEO-Ads-Expert-Bot/1.0'
          }
        });

        if (response.status !== 200) {
          result.errors?.push(`Robots.txt not found (status: ${response.status})`);
          return result;
        }

        robotsContent = response.data;
        this.robotsCache.set(robotsUrl, robotsContent);
      }

      // Parse robots.txt
      const lines = robotsContent.split('\n');
      const path = urlObj.pathname + urlObj.search;

      let currentUserAgent = '*';
      let rules: Array<{ type: 'allow' | 'disallow'; path: string }> = [];
      const userAgentRules = new Map<string, typeof rules>();

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('#') || trimmedLine === '') {
          continue;
        }

        const lowerLine = trimmedLine.toLowerCase();

        if (lowerLine.startsWith('user-agent:')) {
          // Save previous rules
          if (rules.length > 0) {
            userAgentRules.set(currentUserAgent.toLowerCase(), [...rules]);
          }

          currentUserAgent = trimmedLine.substring(11).trim();
          rules = [];
        } else if (lowerLine.startsWith('disallow:')) {
          const disallowPath = trimmedLine.substring(9).trim();
          if (disallowPath) {
            rules.push({ type: 'disallow', path: disallowPath });
          }
        } else if (lowerLine.startsWith('allow:')) {
          const allowPath = trimmedLine.substring(6).trim();
          if (allowPath) {
            rules.push({ type: 'allow', path: allowPath });
          }
        }
      }

      // Save last set of rules
      if (rules.length > 0) {
        userAgentRules.set(currentUserAgent.toLowerCase(), rules);
      }

      // Find applicable rules for our user agent
      let applicableRules = userAgentRules.get(userAgent.toLowerCase()) ||
                           userAgentRules.get('*') ||
                           [];

      // Check if path matches any rule
      let isAllowed = true;
      let matchedRule: string | undefined;

      for (const rule of applicableRules) {
        if (this.matchesRobotsRule(path, rule.path)) {
          isAllowed = rule.type === 'allow';
          matchedRule = `${rule.type}: ${rule.path}`;
          // More specific rules take precedence
          if (rule.path.length > (matchedRule?.length || 0)) {
            break;
          }
        }
      }

      result.isAllowed = isAllowed;
      result.matchedRule = matchedRule;

      if (!isAllowed) {
        result.errors?.push(`URL is disallowed by robots.txt: ${matchedRule}`);
      }

    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // No robots.txt means everything is allowed
        result.isAllowed = true;
        logger.debug('No robots.txt found, allowing all');
      } else {
        result.errors?.push(`Failed to validate robots.txt: ${error}`);
        logger.error('Robots.txt validation error:', error);
      }
    }

    return result;
  }

  /**
   * Check if a path matches a robots.txt rule
   */
  private matchesRobotsRule(path: string, rulePath: string): boolean {
    // Exact match
    if (path === rulePath) {
      return true;
    }

    // Wildcard matching
    if (rulePath.includes('*')) {
      const regex = new RegExp(
        '^' + rulePath.replace(/\*/g, '.*').replace(/\$/g, '\\$') + '$'
      );
      return regex.test(path);
    }

    // Prefix matching
    if (rulePath.endsWith('$')) {
      return path === rulePath.slice(0, -1);
    }

    return path.startsWith(rulePath);
  }

  /**
   * Run Lighthouse audit for Core Web Vitals
   */
  async runLighthouse(url: string): Promise<LighthouseResult> {
    const result: LighthouseResult = {
      url,
      metrics: {
        lcp: 0,
        cls: 0,
        fid: 0,
        fcp: 0,
        ttfb: 0,
        si: 0
      },
      scores: {
        performance: 0,
        accessibility: 0,
        bestPractices: 0,
        seo: 0
      },
      passed: false,
      issues: []
    };

    if (!this.lighthouseEnabled) {
      result.issues.push('Lighthouse is disabled');
      return result;
    }

    let browser;
    try {
      // Dynamic imports for optional dependencies
      const [puppeteerModule, lighthouseModule] = await Promise.all([
        import('puppeteer').catch(() => null),
        import('lighthouse').catch(() => null)
      ]);

      if (!puppeteerModule || !lighthouseModule) {
        result.issues.push('Lighthouse dependencies not installed. Run: npm install puppeteer lighthouse');
        return result;
      }

      const puppeteer = puppeteerModule.default;
      const lighthouse = lighthouseModule.default;

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const { lhr } = await lighthouse(url, {
        port: (new URL(browser.wsEndpoint())).port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
      });

      // Extract metrics
      const metrics = lhr.audits.metrics?.details?.items?.[0] || {};
      result.metrics = {
        lcp: metrics.largestContentfulPaint || 0,
        cls: metrics.cumulativeLayoutShift || 0,
        fid: metrics.maxPotentialFID || 0,
        fcp: metrics.firstContentfulPaint || 0,
        ttfb: metrics.serverResponseTime || 0,
        si: metrics.speedIndex || 0
      };

      // Extract scores
      result.scores = {
        performance: (lhr.categories.performance?.score || 0) * 100,
        accessibility: (lhr.categories.accessibility?.score || 0) * 100,
        bestPractices: (lhr.categories['best-practices']?.score || 0) * 100,
        seo: (lhr.categories.seo?.score || 0) * 100
      };

      // Check if Core Web Vitals pass
      const lcpPassed = result.metrics.lcp <= 2500; // 2.5s
      const clsPassed = result.metrics.cls <= 0.1;
      const fidPassed = result.metrics.fid <= 100; // 100ms

      result.passed = lcpPassed && clsPassed && fidPassed;

      // Add issues for failing metrics
      if (!lcpPassed) {
        result.issues.push(`LCP (${result.metrics.lcp}ms) exceeds 2500ms threshold`);
      }
      if (!clsPassed) {
        result.issues.push(`CLS (${result.metrics.cls}) exceeds 0.1 threshold`);
      }
      if (!fidPassed) {
        result.issues.push(`FID (${result.metrics.fid}ms) exceeds 100ms threshold`);
      }

      // Add warnings for other poor scores
      if (result.scores.performance < 50) {
        result.issues.push(`Poor performance score: ${result.scores.performance}`);
      }
      if (result.scores.seo < 70) {
        result.issues.push(`SEO score needs improvement: ${result.scores.seo}`);
      }

    } catch (error) {
      result.issues.push(`Lighthouse audit failed: ${error}`);
      logger.error('Lighthouse error:', error);
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return result;
  }

  /**
   * Perform complete technical SEO validation
   */
  async validate(url: string, options?: {
    checkSitemap?: boolean;
    checkRobots?: boolean;
    runLighthouse?: boolean;
    userAgent?: string;
  }): Promise<TechnicalSEOValidationResult> {
    const opts = {
      checkSitemap: true,
      checkRobots: true,
      runLighthouse: this.lighthouseEnabled,
      userAgent: 'Googlebot',
      ...options
    };

    const result: TechnicalSEOValidationResult = {
      url,
      sitemap: {
        url,
        existsInSitemap: false
      },
      robots: {
        url,
        isAllowed: true,
        robotsTxtUrl: '',
        userAgent: opts.userAgent
      },
      overallPassed: true,
      recommendations: []
    };

    // Run validations in parallel where possible
    const validations = [];

    if (opts.checkSitemap) {
      validations.push(
        this.validateSitemap(url).then(r => { result.sitemap = r; })
      );
    }

    if (opts.checkRobots) {
      validations.push(
        this.validateRobots(url, opts.userAgent).then(r => { result.robots = r; })
      );
    }

    if (opts.runLighthouse) {
      validations.push(
        this.runLighthouse(url).then(r => { result.lighthouse = r; })
      );
    }

    await Promise.all(validations);

    // Determine overall pass/fail and generate recommendations
    if (opts.checkSitemap && !result.sitemap.existsInSitemap) {
      result.overallPassed = false;
      result.recommendations.push('Add URL to sitemap.xml for better crawlability');
    }

    if (opts.checkRobots && !result.robots.isAllowed) {
      result.overallPassed = false;
      result.recommendations.push(`URL is blocked by robots.txt - review ${result.robots.matchedRule}`);
    }

    if (opts.runLighthouse && result.lighthouse && !result.lighthouse.passed) {
      result.overallPassed = false;

      if (result.lighthouse.metrics.lcp > 2500) {
        result.recommendations.push('Optimize Largest Contentful Paint (LCP) - consider lazy loading, CDN, or image optimization');
      }
      if (result.lighthouse.metrics.cls > 0.1) {
        result.recommendations.push('Fix Cumulative Layout Shift (CLS) - set explicit dimensions for images and embeds');
      }
      if (result.lighthouse.metrics.fid > 100) {
        result.recommendations.push('Improve First Input Delay (FID) - reduce JavaScript execution time');
      }
    }

    // Add general recommendations based on sitemap data
    if (result.sitemap.existsInSitemap) {
      if (!result.sitemap.lastModified) {
        result.recommendations.push('Add <lastmod> to sitemap entry for better crawl prioritization');
      }
      if (!result.sitemap.priority || result.sitemap.priority < 0.5) {
        result.recommendations.push('Consider increasing sitemap priority for important pages');
      }
    }

    return result;
  }

  /**
   * Validate multiple URLs in batch
   */
  async validateBatch(urls: string[], options?: {
    checkSitemap?: boolean;
    checkRobots?: boolean;
    runLighthouse?: boolean;
    userAgent?: string;
    concurrency?: number;
  }): Promise<TechnicalSEOValidationResult[]> {
    const opts = {
      concurrency: 5,
      ...options
    };

    const results: TechnicalSEOValidationResult[] = [];

    // Process URLs in batches to respect concurrency limit
    for (let i = 0; i < urls.length; i += opts.concurrency) {
      const batch = urls.slice(i, i + opts.concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.validate(url, options))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate a technical SEO report
   */
  generateReport(results: TechnicalSEOValidationResult[]): string {
    const report: string[] = [];

    report.push('# Technical SEO Validation Report');
    report.push('');
    report.push(`## Summary`);
    report.push(`- Total URLs checked: ${results.length}`);

    const passed = results.filter(r => r.overallPassed).length;
    const failed = results.length - passed;

    report.push(`- Passed: ${passed}`);
    report.push(`- Failed: ${failed}`);
    report.push('');

    // Sitemap summary
    const inSitemap = results.filter(r => r.sitemap.existsInSitemap).length;
    report.push(`## Sitemap Analysis`);
    report.push(`- URLs in sitemap: ${inSitemap}/${results.length}`);

    const notInSitemap = results.filter(r => !r.sitemap.existsInSitemap);
    if (notInSitemap.length > 0) {
      report.push('');
      report.push('### URLs Missing from Sitemap:');
      notInSitemap.forEach(r => {
        report.push(`- ${r.url}`);
      });
    }
    report.push('');

    // Robots.txt summary
    const blocked = results.filter(r => !r.robots.isAllowed);
    if (blocked.length > 0) {
      report.push(`## Robots.txt Issues`);
      report.push(`- Blocked URLs: ${blocked.length}`);
      report.push('');
      blocked.forEach(r => {
        report.push(`- ${r.url} (${r.robots.matchedRule})`);
      });
      report.push('');
    }

    // Lighthouse summary (if available)
    const lighthouseResults = results.filter(r => r.lighthouse);
    if (lighthouseResults.length > 0) {
      report.push(`## Core Web Vitals`);

      const avgLCP = lighthouseResults.reduce((sum, r) => sum + r.lighthouse!.metrics.lcp, 0) / lighthouseResults.length;
      const avgCLS = lighthouseResults.reduce((sum, r) => sum + r.lighthouse!.metrics.cls, 0) / lighthouseResults.length;
      const avgFID = lighthouseResults.reduce((sum, r) => sum + r.lighthouse!.metrics.fid, 0) / lighthouseResults.length;

      report.push(`- Average LCP: ${avgLCP.toFixed(0)}ms (target: <2500ms)`);
      report.push(`- Average CLS: ${avgCLS.toFixed(3)} (target: <0.1)`);
      report.push(`- Average FID: ${avgFID.toFixed(0)}ms (target: <100ms)`);
      report.push('');

      const failingCWV = lighthouseResults.filter(r => !r.lighthouse!.passed);
      if (failingCWV.length > 0) {
        report.push('### Pages Failing Core Web Vitals:');
        failingCWV.forEach(r => {
          report.push(`- ${r.url}`);
          r.lighthouse!.issues.forEach(issue => {
            report.push(`  - ${issue}`);
          });
        });
      }
      report.push('');
    }

    // Recommendations
    const allRecommendations = new Map<string, number>();
    results.forEach(r => {
      r.recommendations.forEach(rec => {
        allRecommendations.set(rec, (allRecommendations.get(rec) || 0) + 1);
      });
    });

    if (allRecommendations.size > 0) {
      report.push(`## Top Recommendations`);
      const sortedRecs = Array.from(allRecommendations.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      sortedRecs.forEach(([rec, count]) => {
        report.push(`- ${rec} (affects ${count} URLs)`);
      });
    }

    return report.join('\n');
  }
}

export default TechnicalSEOValidator;