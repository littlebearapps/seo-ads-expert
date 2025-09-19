/**
 * Test Output Formatting and Logging
 */

import { describe, it, expect } from 'vitest';
import { MarkdownFormatter } from '../src/utils/markdown-formatter.js';
import {
  StructuredLogger,
  LogLevel,
  LogCategory,
  initializeLogger
} from '../src/utils/structured-logger.js';
import {
  createAPIResponse,
  formatHealthReport,
  formatCrawlSession,
  HealthReportContract,
  IndexationReportContract,
  RobotsAuditContract
} from '../src/types/data-contracts.js';

describe('Output Formatting & Structured Logging', () => {

  describe('Data Contracts', () => {
    it('should create standardized API responses', () => {
      const data = { test: 'data' };
      const response = createAPIResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.error).toBeUndefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.version).toBe('1.9.0');
      expect(response.metadata?.timestamp).toBeDefined();
    });

    it('should create error API responses', () => {
      const error = {
        code: 'TEST_ERROR',
        message: 'Test error message'
      };
      const response = createAPIResponse(undefined, error);

      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error).toEqual(error);
    });

    it('should format health report data', () => {
      const rawData = {
        domain: 'example.com',
        healthScore: 85,
        indexationRate: 78.5,
        orphanPages: 5,
        brokenLinks: 2,
        duplicateContent: 3,
        missingMeta: 1,
        totalPages: 100,
        criticalIssues: [],
        recommendations: ['Improve internal linking']
      };

      const formatted = formatHealthReport(rawData);

      expect(formatted.domain).toBe('example.com');
      expect(formatted.healthScore).toBe(85);
      expect(formatted.metrics.indexationRate).toBe(78.5);
      expect(formatted.recommendations).toHaveLength(1);
    });
  });

  describe('Markdown Formatter', () => {
    const formatter = new MarkdownFormatter();

    it('should format health report as markdown', () => {
      const report: HealthReportContract = {
        domain: 'example.com',
        timestamp: new Date().toISOString(),
        healthScore: 75,
        metrics: {
          indexationRate: 80,
          orphanPages: 10,
          brokenLinks: 5,
          duplicateContent: 3,
          missingMeta: 2,
          totalPages: 100
        },
        issues: [
          {
            type: 'Broken Links',
            severity: 'HIGH',
            description: 'Found broken internal links',
            affectedUrls: ['page1.html', 'page2.html'],
            recommendation: 'Fix or remove broken links'
          }
        ],
        recommendations: ['Improve internal linking structure']
      };

      const markdown = formatter.formatHealthReport(report);

      expect(markdown).toContain('# 🏥 Site Health Report');
      expect(markdown).toContain('example.com');
      expect(markdown).toContain('75/100');
      expect(markdown).toContain('**Indexation Rate**: 80.0%');
      expect(markdown).toContain('🚨 Critical Issues');
      expect(markdown).toContain('Fix or remove broken links');
    });

    it('should format indexation report as markdown', () => {
      const report: IndexationReportContract = {
        domain: 'example.com',
        timestamp: new Date().toISOString(),
        summary: {
          totalCrawled: 100,
          totalIndexed: 80,
          discoveredNotIndexed: 15,
          crawledNotIndexed: 5,
          excludedDuplicates: 3,
          lowQualityIndexed: 2,
          indexationRate: 80
        },
        issues: [
          {
            url: 'https://example.com/page',
            state: 'Discovered - not indexed',
            severity: 'MEDIUM',
            fix: 'Improve content quality',
            evidence: {
              crawled: true,
              indexed: false,
              depth: 3
            }
          }
        ],
        recommendations: ['Submit URLs via GSC']
      };

      const markdown = formatter.formatIndexationReport(report);

      expect(markdown).toContain('# 📈 Indexation Analysis Report');
      expect(markdown).toContain('**Total Indexed**: 80');
      expect(markdown).toContain('**Indexation Rate**: 80.0%');
      expect(markdown).toContain('Discovered Not Indexed: 15');
      expect(markdown).toContain('⚠️  Medium Priority Issues');
    });

    it('should format robots audit report as markdown', () => {
      const report: RobotsAuditContract = {
        site: 'https://example.com',
        timestamp: new Date().toISOString(),
        severity: 'WARNING',
        robotsTxtFound: true,
        sitemaps: ['https://example.com/sitemap.xml'],
        findings: [
          {
            type: 'missing_crawl_delay',
            severity: 'LOW',
            message: 'No crawl-delay specified',
            fix: 'Consider adding crawl-delay directive'
          }
        ],
        userAgents: [
          {
            name: 'Googlebot',
            rules: [
              { type: 'disallow', path: '/admin' },
              { type: 'allow', path: '/' }
            ]
          }
        ]
      };

      const markdown = formatter.formatRobotsAuditReport(report);

      expect(markdown).toContain('# 🤖 Robots.txt Audit Report');
      expect(markdown).toContain('⚠️ WARNING');
      expect(markdown).toContain('✅ Yes');
      expect(markdown).toContain('https://example.com/sitemap.xml');
      expect(markdown).toContain('💡 LOW Severity');
      expect(markdown).toContain('Googlebot');
    });
  });

  describe('Structured Logger', () => {
    it('should create structured log entries', () => {
      const logger = new StructuredLogger({
        sessionId: 'test-session',
        component: 'test'
      });

      let capturedEntry: any = null;
      logger.on('log', (entry) => {
        capturedEntry = entry;
      });

      logger.info(LogCategory.CRAWL, 'Test message', { url: 'test.html' });

      expect(capturedEntry).toBeDefined();
      expect(capturedEntry.level).toBe(LogLevel.INFO);
      expect(capturedEntry.category).toBe(LogCategory.CRAWL);
      expect(capturedEntry.message).toBe('Test message');
      expect(capturedEntry.data).toEqual({ url: 'test.html' });
      expect(capturedEntry.metadata?.sessionId).toBe('test-session');
    });

    it('should log performance metrics', () => {
      const logger = new StructuredLogger();
      let capturedEntry: any = null;

      logger.on('log', (entry) => {
        if (entry.category === LogCategory.PERFORMANCE) {
          capturedEntry = entry;
        }
      });

      logger.startPerformance('test-operation');

      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Wait 10ms
      }

      logger.endPerformance('test-operation', { operation: 'test' });

      expect(capturedEntry).toBeDefined();
      expect(capturedEntry.performance).toBeDefined();
      expect(capturedEntry.performance.duration).toBeGreaterThanOrEqual(10);
    });

    it('should log specialized operations', () => {
      const logger = new StructuredLogger();
      const entries: any[] = [];

      logger.on('log', (entry) => {
        entries.push(entry);
      });

      logger.logCrawl('started', 'https://example.com', { depth: 0 });
      logger.logIndexation('analysis', { total: 100 });
      logger.logSitemap('generated', { urls: 50 });
      logger.logHealth('check', { score: 85 });
      logger.logRobots('validated', { issues: 0 });
      logger.logIndexNow('bing', { submitted: 10 });
      logger.logGSC('data_fetched', { pages: 100 });
      logger.logAPI('GET', '/api/health', { status: 200 });

      expect(entries).toHaveLength(8);
      expect(entries[0].category).toBe(LogCategory.CRAWL);
      expect(entries[1].category).toBe(LogCategory.INDEXATION);
      expect(entries[2].category).toBe(LogCategory.SITEMAP);
      expect(entries[3].category).toBe(LogCategory.HEALTH);
      expect(entries[4].category).toBe(LogCategory.ROBOTS);
      expect(entries[5].category).toBe(LogCategory.INDEXNOW);
      expect(entries[6].category).toBe(LogCategory.GSC);
      expect(entries[7].category).toBe(LogCategory.API);
    });

    it('should log batch operations', () => {
      const logger = new StructuredLogger();
      let capturedEntry: any = null;

      logger.on('log', (entry) => {
        capturedEntry = entry;
      });

      logger.logBatch('processing', {
        total: 100,
        processed: 75,
        succeeded: 70,
        failed: 5
      });

      expect(capturedEntry).toBeDefined();
      expect(capturedEntry.data.percentage).toBe(75);
      expect(capturedEntry.data.succeeded).toBe(70);
    });

    it('should format log entries for console', () => {
      const entry = {
        timestamp: '2024-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        category: LogCategory.CRAWL,
        component: 'test',
        message: 'Test message',
        data: { url: 'test.html' },
        metadata: {}
      };

      const formatted = StructuredLogger.formatForConsole(entry);

      expect(formatted).toContain('2024-01-01T12:00:00.000Z');
      expect(formatted).toContain('📘');
      expect(formatted).toContain('[crawl]');
      expect(formatted).toContain('Test message');
      expect(formatted).toContain('test.html');
    });

    it('should handle error logging', () => {
      const logger = new StructuredLogger();
      let capturedEntry: any = null;

      logger.on('log', (entry) => {
        capturedEntry = entry;
      });

      const error = new Error('Test error');
      logger.error(LogCategory.CRAWL, 'Operation failed', error, { url: 'test.html' });

      expect(capturedEntry).toBeDefined();
      expect(capturedEntry.level).toBe(LogLevel.ERROR);
      expect(capturedEntry.error).toBeDefined();
      expect(capturedEntry.error.message).toBe('Test error');
      expect(capturedEntry.error.stack).toBeDefined();
    });
  });

  describe('Global Logger', () => {
    it('should initialize and reuse global logger', () => {
      const logger1 = initializeLogger({ sessionId: 'test' });
      const logger2 = initializeLogger({ sessionId: 'different' });

      // Should return the same instance
      expect(logger1).toBe(logger2);
    });
  });
});