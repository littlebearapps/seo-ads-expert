/**
 * Robots Auditor
 * Audits robots.txt configuration
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { request } from 'undici';
import robotsParser from 'robots-parser';
import { URL } from 'url';

export interface Finding {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  fix: string;
  affectedUrls?: string[];
}

export interface RobotsAuditResult {
  sitemaps: string[];
  findings: Finding[];
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  robotsTxt: string;
  userAgents: string[];
}

export interface AuditOptions {
  crawlDb?: Database.Database;
  userAgent?: string;
  checkEssentialAssets?: boolean;
}

interface CrawledPage {
  url: string;
  status: number;
  noindex: number;
}

export class RobotsAuditor {
  private readonly essentialPatterns = [
    '/static/*.js',
    '/assets/*.js',
    '/js/*.js',
    '/static/*.css',
    '/assets/*.css',
    '/css/*.css',
    '/images/*',
    '/fonts/*'
  ];

  async audit(site: string, options?: AuditOptions): Promise<RobotsAuditResult> {
    logger.info('Auditing robots.txt', { site });

    const findings: Finding[] = [];
    const sitemaps: string[] = [];
    const userAgents: string[] = [];

    try {
      // Normalize site URL
      const siteUrl = this.normalizeSiteUrl(site);
      const robotsUrl = new URL('/robots.txt', siteUrl).toString();

      // Fetch robots.txt
      const robotsTxt = await this.fetchRobotsTxt(robotsUrl);

      if (!robotsTxt) {
        findings.push({
          severity: 'MEDIUM',
          message: 'No robots.txt file found',
          fix: 'Create a robots.txt file to control crawler access'
        });
        return {
          sitemaps: [],
          findings,
          severity: 'MEDIUM',
          robotsTxt: '',
          userAgents: []
        };
      }

      // Parse robots.txt
      const robots = robotsParser(robotsUrl, robotsTxt);

      // Extract sitemaps
      sitemaps.push(...this.extractSitemaps(robotsTxt));

      // Extract user agents
      userAgents.push(...this.extractUserAgents(robotsTxt));

      // Check for sitemap directives
      if (sitemaps.length === 0) {
        findings.push({
          severity: 'MEDIUM',
          message: 'No Sitemap directive found in robots.txt',
          fix: 'Add Sitemap: <url> directives to help search engines discover your sitemaps'
        });
      }

      // Check for overly restrictive rules
      const restrictiveFindings = this.checkRestrictiveRules(robotsTxt, robots);
      findings.push(...restrictiveFindings);

      // Check essential assets
      if (options?.checkEssentialAssets !== false) {
        const assetFindings = this.checkEssentialAssets(robots, siteUrl);
        findings.push(...assetFindings);
      }

      // Check against crawled pages if database provided
      if (options?.crawlDb) {
        const crawlFindings = await this.checkAgainstCrawledPages(
          robots,
          options.crawlDb,
          siteUrl,
          options.userAgent || '*'
        );
        findings.push(...crawlFindings);
      }

      // Check for common mistakes
      const mistakeFindings = this.checkCommonMistakes(robotsTxt);
      findings.push(...mistakeFindings);

      // Check user-agent specific rules
      const uaFindings = this.analyzeUserAgentRules(robotsTxt);
      findings.push(...uaFindings);

      // Determine overall severity
      const severity = this.calculateOverallSeverity(findings);

      return {
        sitemaps,
        findings,
        severity,
        robotsTxt,
        userAgents
      };

    } catch (error: any) {
      logger.error('Robots audit failed', error);
      findings.push({
        severity: 'HIGH',
        message: `Failed to audit robots.txt: ${error.message}`,
        fix: 'Ensure robots.txt is accessible and properly formatted'
      });

      return {
        sitemaps,
        findings,
        severity: 'HIGH',
        robotsTxt: '',
        userAgents
      };
    }
  }

  private async fetchRobotsTxt(url: string): Promise<string | null> {
    try {
      const response = await request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'SEOAdsExpert/1.9 RobotsAuditor'
        },
        throwOnError: false
      });

      if (response.statusCode === 404) {
        return null;
      }

      if (response.statusCode !== 200) {
        logger.warn('Unexpected status for robots.txt', { status: response.statusCode });
        return null;
      }

      const body = await response.body.text();
      return body;

    } catch (error: any) {
      logger.error('Failed to fetch robots.txt', error);
      return null;
    }
  }

  private extractSitemaps(robotsTxt: string): string[] {
    const sitemaps: string[] = [];
    const lines = robotsTxt.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('sitemap:')) {
        const url = trimmed.substring(8).trim();
        if (url) {
          sitemaps.push(url);
        }
      }
    }

    return sitemaps;
  }

  private extractUserAgents(robotsTxt: string): string[] {
    const userAgents = new Set<string>();
    const lines = robotsTxt.split('\n');

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith('user-agent:')) {
        const ua = line.substring(11).trim();
        if (ua && ua !== '*') {
          userAgents.add(ua);
        }
      }
    }

    return Array.from(userAgents);
  }

  private checkRestrictiveRules(robotsTxt: string, robots: any): Finding[] {
    const findings: Finding[] = [];

    // Check for blocking all crawlers
    if (robotsTxt.includes('User-agent: *') && robotsTxt.includes('Disallow: /')) {
      const hasAllow = robotsTxt.includes('Allow:');
      if (!hasAllow) {
        findings.push({
          severity: 'HIGH',
          message: 'Blocking all crawlers from entire site',
          fix: 'Remove "Disallow: /" or add specific Allow rules for important content'
        });
      }
    }

    // Check for blocking important directories
    const importantPaths = ['/products', '/services', '/shop', '/store'];
    for (const path of importantPaths) {
      if (!robots.isAllowed(`https://example.com${path}/`, '*')) {
        findings.push({
          severity: 'MEDIUM',
          message: `Important path "${path}" appears to be blocked`,
          fix: `Review if "${path}" should be accessible to search engines`
        });
      }
    }

    return findings;
  }

  private checkEssentialAssets(robots: any, siteUrl: string): Finding[] {
    const findings: Finding[] = [];
    const blockedAssets: string[] = [];

    for (const pattern of this.essentialPatterns) {
      // Convert pattern to test URL
      const testUrl = new URL(pattern.replace('*', 'test'), siteUrl).toString();

      if (!robots.isAllowed(testUrl, 'Googlebot')) {
        blockedAssets.push(pattern);
      }
    }

    if (blockedAssets.length > 0) {
      findings.push({
        severity: 'HIGH',
        message: 'Essential assets (CSS/JS) may be blocked',
        fix: 'Add Allow rules for CSS/JS files to ensure proper rendering',
        affectedUrls: blockedAssets
      });
    }

    return findings;
  }

  private async checkAgainstCrawledPages(
    robots: any,
    db: Database.Database,
    siteUrl: string,
    userAgent: string
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Get sample of crawled pages
      const pages = db.prepare(`
        SELECT url, status, noindex
        FROM crawl_pages
        WHERE status = 200
        AND noindex = 0
        LIMIT 500
      `).all() as CrawledPage[];

      const blockedPages: string[] = [];
      const importantBlockedPages: string[] = [];

      for (const page of pages) {
        if (!robots.isAllowed(page.url, userAgent)) {
          blockedPages.push(page.url);

          // Check if it's an important page
          const url = new URL(page.url);
          const depth = url.pathname.split('/').filter(s => s).length;
          if (depth <= 2) {
            importantBlockedPages.push(page.url);
          }
        }
      }

      if (importantBlockedPages.length > 0) {
        findings.push({
          severity: 'HIGH',
          message: `${importantBlockedPages.length} important crawlable pages are blocked by robots.txt`,
          fix: 'Review Disallow rules - these pages are returning 200 but blocked from crawling',
          affectedUrls: importantBlockedPages.slice(0, 5) // Show first 5
        });
      } else if (blockedPages.length > 0) {
        findings.push({
          severity: 'MEDIUM',
          message: `${blockedPages.length} crawlable pages are blocked by robots.txt`,
          fix: 'Review if these pages should be accessible to search engines',
          affectedUrls: blockedPages.slice(0, 5)
        });
      }

      // Check for pages with noindex that aren't blocked
      const noindexPages = db.prepare(`
        SELECT url FROM crawl_pages
        WHERE noindex = 1 AND status = 200
        LIMIT 100
      `).all() as Array<{url: string}>;

      const crawlableNoindex: string[] = [];
      for (const page of noindexPages) {
        if (robots.isAllowed(page.url, userAgent)) {
          crawlableNoindex.push(page.url);
        }
      }

      if (crawlableNoindex.length > 10) {
        findings.push({
          severity: 'LOW',
          message: `${crawlableNoindex.length} noindex pages are crawlable - consider blocking in robots.txt`,
          fix: 'Pages with noindex can be blocked in robots.txt to save crawl budget',
          affectedUrls: crawlableNoindex.slice(0, 3)
        });
      }

    } catch (error: any) {
      logger.error('Failed to check against crawled pages', error);
    }

    return findings;
  }

  private checkCommonMistakes(robotsTxt: string): Finding[] {
    const findings: Finding[] = [];

    // Check for missing User-agent
    if (!robotsTxt.includes('User-agent:')) {
      findings.push({
        severity: 'HIGH',
        message: 'No User-agent directive found',
        fix: 'Add "User-agent: *" to specify rules for all crawlers'
      });
    }

    // Check for duplicate Disallow patterns
    const disallowPatterns = new Map<string, number>();
    const lines = robotsTxt.split('\n');

    for (const line of lines) {
      if (line.trim().toLowerCase().startsWith('disallow:')) {
        const pattern = line.substring(9).trim();
        disallowPatterns.set(pattern, (disallowPatterns.get(pattern) || 0) + 1);
      }
    }

    for (const [pattern, count] of disallowPatterns) {
      if (count > 1) {
        findings.push({
          severity: 'LOW',
          message: `Duplicate Disallow rule for "${pattern}"`,
          fix: 'Remove duplicate rules to keep robots.txt clean'
        });
      }
    }

    // Check for wildcards (not supported by all crawlers)
    if (robotsTxt.includes('*') && !robotsTxt.includes('User-agent: *')) {
      findings.push({
        severity: 'LOW',
        message: 'Using wildcards in paths - not all crawlers support this',
        fix: 'Consider using specific paths for better compatibility'
      });
    }

    // Check crawl-delay (can slow indexing)
    const crawlDelayMatch = robotsTxt.match(/Crawl-delay:\s*(\d+)/i);
    if (crawlDelayMatch) {
      const delay = parseInt(crawlDelayMatch[1]);
      if (delay > 10) {
        findings.push({
          severity: 'MEDIUM',
          message: `High crawl-delay of ${delay} seconds may slow indexing`,
          fix: 'Consider reducing crawl-delay or removing it for major search engines'
        });
      }
    }

    return findings;
  }

  private analyzeUserAgentRules(robotsTxt: string): Finding[] {
    const findings: Finding[] = [];
    const uaRules = new Map<string, string[]>();

    let currentUA = '*';
    const lines = robotsTxt.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        currentUA = trimmed.substring(11).trim();
        if (!uaRules.has(currentUA)) {
          uaRules.set(currentUA, []);
        }
      } else if (trimmed.toLowerCase().startsWith('disallow:') ||
                 trimmed.toLowerCase().startsWith('allow:')) {
        uaRules.get(currentUA)?.push(trimmed);
      }
    }

    // Check for bot-specific rules that might be too restrictive
    const importantBots = ['Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot'];

    for (const bot of importantBots) {
      const rules = uaRules.get(bot);
      if (rules && rules.some(r => r.toLowerCase().includes('disallow: /'))) {
        findings.push({
          severity: 'HIGH',
          message: `${bot} is completely blocked`,
          fix: `Review if ${bot} should have access to your site`
        });
      }
    }

    // Check for conflicting rules
    const generalRules = uaRules.get('*') || [];
    const googlebotRules = uaRules.get('Googlebot') || [];

    if (generalRules.length > 0 && googlebotRules.length > 0) {
      const generalDisallow = generalRules.filter(r => r.toLowerCase().includes('disallow'));
      const googlebotAllow = googlebotRules.filter(r => r.toLowerCase().includes('allow'));

      if (generalDisallow.length > googlebotAllow.length) {
        findings.push({
          severity: 'LOW',
          message: 'Googlebot has fewer Allow rules than general Disallow rules',
          fix: 'Ensure Googlebot can access all important content'
        });
      }
    }

    return findings;
  }

  private calculateOverallSeverity(findings: Finding[]): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (findings.some(f => f.severity === 'HIGH')) {
      return 'HIGH';
    }
    if (findings.some(f => f.severity === 'MEDIUM')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private normalizeSiteUrl(site: string): string {
    if (!site.startsWith('http://') && !site.startsWith('https://')) {
      return `https://${site}`;
    }
    return site;
  }

  async generateReport(auditResult: RobotsAuditResult, outputPath?: string): Promise<string> {
    let report = '# Robots.txt Audit Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Summary
    report += '## Summary\n\n';
    report += `- **Overall Severity**: ${auditResult.severity}\n`;
    report += `- **Issues Found**: ${auditResult.findings.length}\n`;
    report += `- **Sitemaps Found**: ${auditResult.sitemaps.length}\n`;
    report += `- **User Agents**: ${auditResult.userAgents.length}\n\n`;

    // Sitemap Directives
    report += '## Sitemap Directives\n\n';
    if (auditResult.sitemaps.length > 0) {
      for (const sitemap of auditResult.sitemaps) {
        report += `- ✅ ${sitemap}\n`;
      }
    } else {
      report += '⚠️ No sitemap directives found\n';
    }
    report += '\n';

    // Findings by Severity
    const highFindings = auditResult.findings.filter(f => f.severity === 'HIGH');
    const mediumFindings = auditResult.findings.filter(f => f.severity === 'MEDIUM');
    const lowFindings = auditResult.findings.filter(f => f.severity === 'LOW');

    if (highFindings.length > 0) {
      report += '## 🚨 HIGH Severity Issues\n\n';
      for (const finding of highFindings) {
        report += `### ${finding.message}\n`;
        report += `**Fix**: ${finding.fix}\n`;
        if (finding.affectedUrls) {
          report += '**Affected URLs**:\n';
          finding.affectedUrls.forEach(url => {
            report += `- ${url}\n`;
          });
        }
        report += '\n';
      }
    }

    if (mediumFindings.length > 0) {
      report += '## ⚠️ MEDIUM Severity Issues\n\n';
      for (const finding of mediumFindings) {
        report += `### ${finding.message}\n`;
        report += `**Fix**: ${finding.fix}\n`;
        if (finding.affectedUrls) {
          report += '**Affected URLs**:\n';
          finding.affectedUrls.forEach(url => {
            report += `- ${url}\n`;
          });
        }
        report += '\n';
      }
    }

    if (lowFindings.length > 0) {
      report += '## 💡 LOW Severity Issues\n\n';
      for (const finding of lowFindings) {
        report += `### ${finding.message}\n`;
        report += `**Fix**: ${finding.fix}\n\n`;
      }
    }

    // Recommendations
    report += '## Recommendations\n\n';
    report += '1. **Regular Review**: Audit robots.txt quarterly\n';
    report += '2. **Test Changes**: Use GSC robots.txt tester before deploying\n';
    report += '3. **Monitor Coverage**: Check GSC Coverage report for blocked resources\n';
    report += '4. **Document Rules**: Comment complex rules in robots.txt\n\n';

    // Save report if path provided
    if (outputPath) {
      const fs = await import('fs/promises');
      await fs.writeFile(outputPath, report, 'utf-8');
      logger.info('Robots audit report saved', { path: outputPath });
    }

    return report;
  }
}