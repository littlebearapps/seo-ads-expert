import axios, { AxiosResponse, AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Enhanced URL Health Checker & Quality Gates
 * 
 * Based on GPT-5 feedback, this provides comprehensive health checks:
 * - HTTP status validation with redirect chain analysis
 * - HTML parsing for title, H1, meta tags, canonical
 * - robots.txt parsing and URL path validation
 * - Soft-404 detection heuristics
 * - Performance warnings (TTFB, meta refresh)
 * - Multi-market hreflang validation
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface UrlHealthResult {
  url: string;
  status: 'pass' | 'warning' | 'fail';
  checks: {
    httpStatus: HealthCheck;
    htmlStructure: HealthCheck;
    contentQuality: HealthCheck;
    robotsTxt: HealthCheck;
    redirectChain: HealthCheck;
    canonical: HealthCheck;
    performance: HealthCheck;
    hreflang: HealthCheck;
  };
  metadata: {
    httpCode: number;
    title: string;
    h1: string;
    canonical: string;
    robotsMeta: string;
    wordCount: number;
    ttfbMs: number;
    redirectChain: string[];
    hreflangLinks: string[];
  };
  errors: string[];
  warnings: string[];
}

export interface HealthCheck {
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: any;
}

export interface UrlHealthOptions {
  timeout?: number;
  userAgent?: string;
  followRedirects?: boolean;
  maxRedirects?: number;
  checkRobotsTxt?: boolean;
  checkPerformance?: boolean;
  requiredMarkets?: string[];
}

export interface UrlHealthSummary {
  totalUrls: number;
  passedUrls: number;
  warningUrls: number;
  failedUrls: number;
  hardFailures: UrlHealthResult[];
  commonIssues: string[];
}

// ============================================================================
// URL HEALTH CHECKER CLASS
// ============================================================================

export class UrlHealthChecker {
  private defaultOptions: UrlHealthOptions = {
    timeout: 10000, // 10 seconds
    userAgent: 'LBA-SEO-Ads-Expert-Health-Checker/1.1',
    followRedirects: true,
    maxRedirects: 5,
    checkRobotsTxt: true,
    checkPerformance: true,
    requiredMarkets: ['AU', 'US', 'GB']
  };

  constructor(private options: UrlHealthOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Check health of a single URL with comprehensive validation
   */
  async checkUrlHealth(url: string): Promise<UrlHealthResult> {
    const startTime = Date.now();
    
    logger.debug(`🔍 Health checking URL: ${url}`);

    const result: UrlHealthResult = {
      url,
      status: 'pass',
      checks: {
        httpStatus: { status: 'pass', message: '' },
        htmlStructure: { status: 'pass', message: '' },
        contentQuality: { status: 'pass', message: '' },
        robotsTxt: { status: 'pass', message: '' },
        redirectChain: { status: 'pass', message: '' },
        canonical: { status: 'pass', message: '' },
        performance: { status: 'pass', message: '' },
        hreflang: { status: 'pass', message: '' }
      },
      metadata: {
        httpCode: 0,
        title: '',
        h1: '',
        canonical: '',
        robotsMeta: '',
        wordCount: 0,
        ttfbMs: 0,
        redirectChain: [],
        hreflangLinks: []
      },
      errors: [],
      warnings: []
    };

    try {
      // Step 1: HTTP Request with redirect tracking
      const response = await this.performHttpRequest(url, result);
      
      if (!response) {
        result.status = 'fail';
        return result;
      }

      // Step 2: HTML Structure Analysis
      await this.analyzeHtmlStructure(response, result);
      
      // Step 3: Content Quality Validation
      await this.validateContentQuality(result);
      
      // Step 4: robots.txt Validation (if enabled)
      if (this.options.checkRobotsTxt) {
        await this.checkRobotsTxtPermissions(url, result);
      }
      
      // Step 5: Performance Analysis (if enabled)
      if (this.options.checkPerformance) {
        result.metadata.ttfbMs = Date.now() - startTime;
        this.analyzePerformance(result);
      }
      
      // Step 6: Multi-market hreflang validation
      this.validateHreflang(result);
      
      // Step 7: Determine overall status
      this.determineOverallStatus(result);

      logger.debug(`✅ Health check completed for ${url}: ${result.status}`);
      
    } catch (error: any) {
      logger.error(`❌ Health check failed for ${url}:`, error.message);
      result.status = 'fail';
      result.errors.push(`Health check error: ${error.message}`);
      result.checks.httpStatus = {
        status: 'fail',
        message: `Request failed: ${error.message}`
      };
    }

    return result;
  }

  /**
   * Check health of multiple URLs in parallel
   */
  async checkMultipleUrls(urls: string[]): Promise<UrlHealthResult[]> {
    logger.info(`🔍 Health checking ${urls.length} URLs...`);
    
    const results = await Promise.all(
      urls.map(url => this.checkUrlHealth(url))
    );

    logger.info(`✅ Health check completed: ${results.filter(r => r.status === 'pass').length}/${urls.length} passed`);
    
    return results;
  }

  /**
   * Generate health summary with statistics
   */
  generateHealthSummary(results: UrlHealthResult[]): UrlHealthSummary {
    const passedUrls = results.filter(r => r.status === 'pass').length;
    const warningUrls = results.filter(r => r.status === 'warning').length;
    const failedUrls = results.filter(r => r.status === 'fail').length;
    const hardFailures = results.filter(r => r.status === 'fail');

    // Extract common issues
    const allErrors = results.flatMap(r => r.errors);
    const allWarnings = results.flatMap(r => r.warnings);
    const commonIssues = this.extractCommonIssues([...allErrors, ...allWarnings]);

    return {
      totalUrls: results.length,
      passedUrls,
      warningUrls,
      failedUrls,
      hardFailures,
      commonIssues
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async performHttpRequest(url: string, result: UrlHealthResult): Promise<AxiosResponse | null> {
    try {
      const response = await axios.get(url, {
        timeout: this.options.timeout,
        headers: {
          'User-Agent': this.options.userAgent
        },
        maxRedirects: this.options.maxRedirects,
        validateStatus: (status) => status < 500 // Allow 4xx but not 5xx
      });

      result.metadata.httpCode = response.status;
      
      // Track redirect chain
      if (response.request.res.responseUrl !== url) {
        result.metadata.redirectChain = this.extractRedirectChain(response);
        this.analyzeRedirectChain(result);
      }

      // Validate HTTP status
      if (response.status >= 400) {
        result.checks.httpStatus = {
          status: 'fail',
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { code: response.status, statusText: response.statusText }
        };
        result.errors.push(`HTTP error: ${response.status} ${response.statusText}`);
        return null;
      } else if (response.status >= 300) {
        result.checks.httpStatus = {
          status: 'warning',
          message: `HTTP ${response.status}: Redirect detected`,
          details: { code: response.status, redirectUrl: response.headers.location }
        };
        result.warnings.push(`Redirect detected: ${response.status}`);
      } else {
        result.checks.httpStatus = {
          status: 'pass',
          message: `HTTP ${response.status}: OK`
        };
      }

      return response;

    } catch (error: any) {
      if (error.response) {
        // Server responded with error status
        result.metadata.httpCode = error.response.status;
        result.checks.httpStatus = {
          status: 'fail',
          message: `HTTP ${error.response.status}: ${error.response.statusText}`,
          details: { code: error.response.status }
        };
        result.errors.push(`HTTP error: ${error.response.status}`);
      } else if (error.code === 'ECONNABORTED') {
        result.checks.httpStatus = {
          status: 'fail',
          message: `Request timeout after ${this.options.timeout}ms`
        };
        result.errors.push('Request timeout');
      } else {
        result.checks.httpStatus = {
          status: 'fail',
          message: `Network error: ${error.message}`
        };
        result.errors.push(`Network error: ${error.message}`);
      }
      return null;
    }
  }

  private async analyzeHtmlStructure(response: AxiosResponse, result: UrlHealthResult): Promise<void> {
    try {
      const $ = cheerio.load(response.data);
      
      // Extract title
      result.metadata.title = $('title').first().text().trim();
      
      // Extract H1
      const h1Elements = $('h1');
      result.metadata.h1 = h1Elements.first().text().trim();
      
      // Extract canonical
      const canonicalLink = $('link[rel="canonical"]').first();
      result.metadata.canonical = canonicalLink.attr('href') || '';
      
      // Extract robots meta
      const robotsMeta = $('meta[name="robots"]').first();
      result.metadata.robotsMeta = robotsMeta.attr('content') || '';
      
      // Extract hreflang links
      $('link[rel="alternate"][hreflang]').each((_, element) => {
        const hreflang = $(element).attr('hreflang');
        const href = $(element).attr('href');
        if (hreflang && href) {
          result.metadata.hreflangLinks.push(`${hreflang}: ${href}`);
        }
      });
      
      // Count words (approximate)
      const textContent = $('body').text().replace(/\s+/g, ' ').trim();
      result.metadata.wordCount = textContent.split(' ').length;
      
      // Validate HTML structure
      this.validateHtmlStructure(result);
      
    } catch (error: any) {
      result.checks.htmlStructure = {
        status: 'fail',
        message: `HTML parsing error: ${error.message}`
      };
      result.errors.push(`HTML parsing failed: ${error.message}`);
    }
  }

  private validateHtmlStructure(result: UrlHealthResult): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for missing title
    if (!result.metadata.title) {
      errors.push('Missing page title');
    } else if (result.metadata.title.length > 60) {
      warnings.push(`Title too long: ${result.metadata.title.length} characters`);
    }

    // Check for missing H1
    if (!result.metadata.h1) {
      errors.push('Missing H1 tag');
    }

    // Check for noindex
    if (result.metadata.robotsMeta.includes('noindex')) {
      errors.push('Page has noindex meta tag');
    }

    // Check for meta refresh (treat as hard fail)
    if (result.metadata.robotsMeta.includes('refresh')) {
      errors.push('Meta refresh detected (treated as hard fail)');
    }

    // Set check status
    if (errors.length > 0) {
      result.checks.htmlStructure = {
        status: 'fail',
        message: `HTML structure issues: ${errors.join(', ')}`,
        details: { errors, warnings }
      };
      result.errors.push(...errors);
    } else if (warnings.length > 0) {
      result.checks.htmlStructure = {
        status: 'warning',
        message: `HTML structure warnings: ${warnings.join(', ')}`,
        details: { warnings }
      };
      result.warnings.push(...warnings);
    } else {
      result.checks.htmlStructure = {
        status: 'pass',
        message: 'HTML structure valid'
      };
    }
  }

  private async validateContentQuality(result: UrlHealthResult): Promise<void> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Soft-404 detection heuristics
    const title = result.metadata.title.toLowerCase();
    const h1 = result.metadata.h1.toLowerCase();
    
    if (title.includes('404') || title.includes('not found') || title.includes('error')) {
      errors.push('Soft-404 detected: Title contains error indicators');
    }
    
    if (h1.includes('404') || h1.includes('not found')) {
      errors.push('Soft-404 detected: H1 contains error indicators');
    }

    // Minimum content validation
    if (result.metadata.wordCount < 50) {
      errors.push(`Insufficient content: Only ${result.metadata.wordCount} words`);
    } else if (result.metadata.wordCount < 100) {
      warnings.push(`Thin content: Only ${result.metadata.wordCount} words`);
    }

    // Set check status
    if (errors.length > 0) {
      result.checks.contentQuality = {
        status: 'fail',
        message: `Content quality issues: ${errors.join(', ')}`,
        details: { errors, warnings, wordCount: result.metadata.wordCount }
      };
      result.errors.push(...errors);
    } else if (warnings.length > 0) {
      result.checks.contentQuality = {
        status: 'warning',
        message: `Content quality warnings: ${warnings.join(', ')}`,
        details: { warnings, wordCount: result.metadata.wordCount }
      };
      result.warnings.push(...warnings);
    } else {
      result.checks.contentQuality = {
        status: 'pass',
        message: `Content quality good: ${result.metadata.wordCount} words`
      };
    }
  }

  private async checkRobotsTxtPermissions(url: string, result: UrlHealthResult): Promise<void> {
    try {
      const robotsTxtUrl = new URL('/robots.txt', url).toString();
      const response = await axios.get(robotsTxtUrl, {
        timeout: this.options.timeout,
        headers: { 'User-Agent': this.options.userAgent }
      });

      // Simple robots.txt parsing
      const robotsTxt = response.data.toString();
      const urlPath = new URL(url).pathname;
      
      if (this.isPathDisallowed(robotsTxt, urlPath, this.options.userAgent || '*')) {
        result.checks.robotsTxt = {
          status: 'fail',
          message: `Path disallowed in robots.txt: ${urlPath}`,
          details: { robotsTxtUrl, disallowedPath: urlPath }
        };
        result.errors.push(`Blocked by robots.txt: ${urlPath}`);
      } else {
        result.checks.robotsTxt = {
          status: 'pass',
          message: 'Path allowed in robots.txt'
        };
      }

    } catch (error: any) {
      // robots.txt not found is not necessarily an error
      if (error.response && error.response.status === 404) {
        result.checks.robotsTxt = {
          status: 'pass',
          message: 'No robots.txt file found (path allowed by default)'
        };
      } else {
        result.checks.robotsTxt = {
          status: 'warning',
          message: `Could not check robots.txt: ${error.message}`
        };
        result.warnings.push(`robots.txt check failed: ${error.message}`);
      }
    }
  }

  private analyzeRedirectChain(result: UrlHealthResult): void {
    const redirectCount = result.metadata.redirectChain.length;
    
    if (redirectCount > 1) {
      result.checks.redirectChain = {
        status: 'warning',
        message: `Multiple redirects detected: ${redirectCount} hops`,
        details: { chain: result.metadata.redirectChain, count: redirectCount }
      };
      result.warnings.push(`${redirectCount} redirect hops detected`);
    } else if (redirectCount === 1) {
      result.checks.redirectChain = {
        status: 'warning',
        message: 'Single redirect detected',
        details: { chain: result.metadata.redirectChain }
      };
      result.warnings.push('Single redirect detected');
    } else {
      result.checks.redirectChain = {
        status: 'pass',
        message: 'Direct access (no redirects)'
      };
    }
  }

  private analyzePerformance(result: UrlHealthResult): void {
    const ttfb = result.metadata.ttfbMs;
    
    if (ttfb > 3000) { // 3 seconds
      result.checks.performance = {
        status: 'warning',
        message: `Slow TTFB: ${ttfb}ms (>3s)`,
        details: { ttfbMs: ttfb, threshold: 3000 }
      };
      result.warnings.push(`Slow page load: ${ttfb}ms TTFB`);
    } else if (ttfb > 1500) { // 1.5 seconds  
      result.checks.performance = {
        status: 'warning',
        message: `Moderate TTFB: ${ttfb}ms (>1.5s)`,
        details: { ttfbMs: ttfb, threshold: 1500 }
      };
      result.warnings.push(`Moderate page load: ${ttfb}ms TTFB`);
    } else {
      result.checks.performance = {
        status: 'pass',
        message: `Good TTFB: ${ttfb}ms`
      };
    }
  }

  private validateHreflang(result: UrlHealthResult): void {
    if (!this.options.requiredMarkets || this.options.requiredMarkets.length === 0) {
      result.checks.hreflang = {
        status: 'pass',
        message: 'hreflang validation skipped (no required markets)'
      };
      return;
    }

    const hreflangCount = result.metadata.hreflangLinks.length;
    
    if (hreflangCount === 0) {
      result.checks.hreflang = {
        status: 'warning',
        message: 'No hreflang tags found for multi-market setup',
        details: { requiredMarkets: this.options.requiredMarkets }
      };
      result.warnings.push('Missing hreflang tags for international markets');
    } else {
      result.checks.hreflang = {
        status: 'pass',
        message: `hreflang tags present: ${hreflangCount} found`,
        details: { hreflangLinks: result.metadata.hreflangLinks }
      };
    }
  }

  private determineOverallStatus(result: UrlHealthResult): void {
    const hasErrors = Object.values(result.checks).some(check => check.status === 'fail');
    const hasWarnings = Object.values(result.checks).some(check => check.status === 'warning');

    if (hasErrors) {
      result.status = 'fail';
    } else if (hasWarnings) {
      result.status = 'warning';
    } else {
      result.status = 'pass';
    }
  }

  private extractRedirectChain(response: AxiosResponse): string[] {
    // This is a simplified implementation
    // In reality, you'd need to track the actual redirect chain during the request
    const finalUrl = response.request.res.responseUrl;
    return finalUrl ? [finalUrl] : [];
  }

  private isPathDisallowed(robotsTxt: string, path: string, userAgent: string): boolean {
    // Simplified robots.txt parser
    // In production, you'd want a more robust parser
    const lines = robotsTxt.split('\n');
    let relevantUserAgent = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();
      
      if (trimmedLine.startsWith('user-agent:')) {
        const agent = trimmedLine.replace('user-agent:', '').trim();
        relevantUserAgent = agent === '*' || userAgent.toLowerCase().includes(agent);
        continue;
      }
      
      if (relevantUserAgent && trimmedLine.startsWith('disallow:')) {
        const disallowedPath = trimmedLine.replace('disallow:', '').trim();
        if (disallowedPath && path.startsWith(disallowedPath)) {
          return true;
        }
      }
    }
    
    return false;
  }

  private extractCommonIssues(issues: string[]): string[] {
    // Count frequency of each issue type
    const issueCount = new Map<string, number>();
    
    for (const issue of issues) {
      // Extract issue type (first few words)
      const issueType = issue.split(':')[0] || issue.substring(0, 50);
      issueCount.set(issueType, (issueCount.get(issueType) || 0) + 1);
    }
    
    // Return top 5 most common issues
    return Array.from(issueCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue, count]) => `${issue} (${count} occurrences)`);
  }
}

// ============================================================================
// QUALITY GATES INTEGRATION
// ============================================================================

/**
 * Quality gate functions for ad group mapping validation
 */
export function shouldBlockAdGroup(healthResult: UrlHealthResult): boolean {
  return healthResult.status === 'fail';
}

export function getBlockingReasons(healthResult: UrlHealthResult): string[] {
  return healthResult.errors;
}

export function getQualityWarnings(healthResult: UrlHealthResult): string[] {
  return healthResult.warnings;
}