/**
 * Markdown Report Formatter
 * Provides consistent markdown formatting for all reports
 */

import {
  HealthReportContract,
  IndexationReportContract,
  RobotsAuditContract,
  CrawlSessionContract,
  SitemapGenerationContract
} from '../types/data-contracts.js';

export class MarkdownFormatter {
  private readonly DIVIDER = '═'.repeat(60);
  private readonly SUB_DIVIDER = '─'.repeat(40);

  /**
   * Format Health Report
   */
  formatHealthReport(report: HealthReportContract): string {
    const sections: string[] = [];

    // Header
    sections.push(this.createHeader('🏥 Site Health Report', report.domain));

    // Health Score
    sections.push(this.createHealthScoreSection(report.healthScore));

    // Key Metrics
    sections.push(this.createSection('📊 Key Metrics', [
      `**Indexation Rate**: ${report.metrics.indexationRate.toFixed(1)}%`,
      `**Total Pages**: ${report.metrics.totalPages}`,
      `**Orphan Pages**: ${report.metrics.orphanPages}`,
      `**Broken Links**: ${report.metrics.brokenLinks}`,
      `**Duplicate Content**: ${report.metrics.duplicateContent}`,
      `**Missing Meta**: ${report.metrics.missingMeta}`,
      report.metrics.avgResponseTime
        ? `**Avg Response Time**: ${report.metrics.avgResponseTime}ms`
        : null
    ].filter(Boolean)));

    // Critical Issues
    if (report.issues.length > 0) {
      const highIssues = report.issues.filter(i => i.severity === 'HIGH');
      const mediumIssues = report.issues.filter(i => i.severity === 'MEDIUM');
      const lowIssues = report.issues.filter(i => i.severity === 'LOW');

      if (highIssues.length > 0) {
        sections.push(this.createIssuesSection('🚨 Critical Issues', highIssues, 'HIGH'));
      }
      if (mediumIssues.length > 0) {
        sections.push(this.createIssuesSection('⚠️  Medium Priority Issues', mediumIssues, 'MEDIUM'));
      }
      if (lowIssues.length > 0) {
        sections.push(this.createIssuesSection('💡 Low Priority Issues', lowIssues, 'LOW'));
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      sections.push(this.createSection('✅ Recommendations',
        report.recommendations.map(r => `- ${r}`)
      ));
    }

    // Footer
    sections.push(this.createFooter(report.timestamp));

    return sections.join('\n\n');
  }

  /**
   * Format Indexation Report
   */
  formatIndexationReport(report: IndexationReportContract): string {
    const sections: string[] = [];

    // Header
    sections.push(this.createHeader('📈 Indexation Analysis Report', report.domain));

    // Summary Statistics
    const summaryItems = [
      `**Total Crawled**: ${report.summary.totalCrawled}`,
      `**Total Indexed**: ${report.summary.totalIndexed}`,
      `**Indexation Rate**: ${report.summary.indexationRate.toFixed(1)}%`,
      '',
      '**Gap Analysis:**',
      `- Discovered Not Indexed: ${report.summary.discoveredNotIndexed}`,
      `- Crawled Not Indexed: ${report.summary.crawledNotIndexed}`,
      `- Excluded Duplicates: ${report.summary.excludedDuplicates}`,
      `- Low Quality Indexed: ${report.summary.lowQualityIndexed}`
    ];
    sections.push(this.createSection('📊 Summary', summaryItems));

    // Issues by Severity
    if (report.issues.length > 0) {
      const highIssues = report.issues.filter(i => i.severity === 'HIGH');
      const mediumIssues = report.issues.filter(i => i.severity === 'MEDIUM');
      const lowIssues = report.issues.filter(i => i.severity === 'LOW');

      if (highIssues.length > 0) {
        sections.push(this.formatIndexationIssues('🚨 High Priority Issues', highIssues));
      }
      if (mediumIssues.length > 0) {
        sections.push(this.formatIndexationIssues('⚠️  Medium Priority Issues', mediumIssues));
      }
      if (lowIssues.length > 0) {
        sections.push(this.formatIndexationIssues('💡 Low Priority Issues', lowIssues));
      }
    }

    // Action Items
    if (report.recommendations.length > 0) {
      sections.push(this.createSection('🎯 Action Items',
        report.recommendations.map((r, i) => `${i + 1}. ${r}`)
      ));
    }

    // Footer
    sections.push(this.createFooter(report.timestamp));

    return sections.join('\n\n');
  }

  /**
   * Format Robots Audit Report
   */
  formatRobotsAuditReport(report: RobotsAuditContract): string {
    const sections: string[] = [];

    // Header
    sections.push(this.createHeader('🤖 Robots.txt Audit Report', report.site));

    // Status
    const statusEmoji = {
      'PASS': '✅',
      'WARNING': '⚠️',
      'CRITICAL': '🚨'
    };

    sections.push(this.createSection('Status', [
      `**Overall Severity**: ${statusEmoji[report.severity]} ${report.severity}`,
      `**Robots.txt Found**: ${report.robotsTxtFound ? '✅ Yes' : '❌ No'}`
    ]));

    // Sitemaps
    if (report.sitemaps.length > 0) {
      sections.push(this.createSection('📍 Sitemap Directives',
        report.sitemaps.map(s => `- ${s}`)
      ));
    } else {
      sections.push(this.createSection('📍 Sitemap Directives',
        ['⚠️  No sitemap directives found in robots.txt']
      ));
    }

    // Findings by Severity
    if (report.findings.length > 0) {
      const highFindings = report.findings.filter(f => f.severity === 'HIGH');
      const mediumFindings = report.findings.filter(f => f.severity === 'MEDIUM');
      const lowFindings = report.findings.filter(f => f.severity === 'LOW');

      sections.push('## 🔍 Findings\n');

      if (highFindings.length > 0) {
        sections.push(this.formatRobotsFindings('### 🚨 HIGH Severity', highFindings));
      }
      if (mediumFindings.length > 0) {
        sections.push(this.formatRobotsFindings('### ⚠️  MEDIUM Severity', mediumFindings));
      }
      if (lowFindings.length > 0) {
        sections.push(this.formatRobotsFindings('### 💡 LOW Severity', lowFindings));
      }
    }

    // User Agents Summary
    if (report.userAgents.length > 0) {
      const uaSection = ['## 🕷️ User Agent Rules\n'];
      report.userAgents.forEach(ua => {
        uaSection.push(`### ${ua.name}`);
        uaSection.push(`- **Allow rules**: ${ua.rules.filter(r => r.type === 'allow').length}`);
        uaSection.push(`- **Disallow rules**: ${ua.rules.filter(r => r.type === 'disallow').length}`);
        if (ua.crawlDelay) {
          uaSection.push(`- **Crawl-delay**: ${ua.crawlDelay} seconds`);
        }
        uaSection.push('');
      });
      sections.push(uaSection.join('\n'));
    }

    // Footer
    sections.push(this.createFooter(report.timestamp));

    return sections.join('\n\n');
  }

  /**
   * Format Crawl Session Report
   */
  formatCrawlSessionReport(session: CrawlSessionContract): string {
    const sections: string[] = [];

    // Header
    sections.push(this.createHeader('🕷️ Crawl Session Report', session.startUrl));

    // Session Info
    sections.push(this.createSection('Session Information', [
      `**Session ID**: \`${session.sessionId}\``,
      `**Start Time**: ${this.formatDate(session.startTime)}`,
      session.endTime ? `**End Time**: ${this.formatDate(session.endTime)}` : '**Status**: In Progress',
      session.statistics.duration ? `**Duration**: ${this.formatDuration(session.statistics.duration)}` : null
    ].filter(Boolean)));

    // Statistics
    sections.push(this.createSection('📊 Statistics', [
      `**Pages Discovered**: ${session.statistics.pagesDiscovered}`,
      `**Pages Crawled**: ${session.statistics.pagesCrawled}`,
      `**Links Found**: ${session.statistics.linksFound}`,
      `**Errors**: ${session.statistics.errors}`
    ]));

    // Errors
    if (session.errors && session.errors.length > 0) {
      const errorList = session.errors.map(e =>
        `- **${e.url}**\n  - Error: ${e.error}\n  - Time: ${this.formatDate(e.timestamp)}`
      );
      sections.push(this.createSection('❌ Errors', errorList));
    }

    // Footer
    sections.push(this.createFooter());

    return sections.join('\n\n');
  }

  /**
   * Format Sitemap Generation Report
   */
  formatSitemapGenerationReport(report: SitemapGenerationContract): string {
    const sections: string[] = [];

    // Header
    sections.push('# 🗺️ Sitemap Generation Report');
    sections.push(this.DIVIDER);

    // Statistics
    sections.push(this.createSection('📊 Generation Summary', [
      `**Total URLs**: ${report.statistics.totalUrls}`,
      `**Total Sitemaps**: ${report.statistics.totalSitemaps}`,
      `**Sectioned**: ${report.statistics.sectioned ? '✅ Yes' : '❌ No'}`
    ]));

    // Index Sitemap
    if (report.indexSitemap) {
      sections.push(this.createSection('📁 Index Sitemap', [
        `**Filename**: \`${report.indexSitemap.filename}\``,
        `**Child Sitemaps**: ${report.indexSitemap.childSitemaps}`
      ]));
    }

    // Individual Sitemaps
    const sitemapList = report.sitemaps.map(s => {
      const items = [
        `**\`${s.filename}\`**`,
        `  - URLs: ${s.urlCount}`
      ];
      if (s.section) items.push(`  - Section: ${s.section}`);
      if (s.sizeBytes) items.push(`  - Size: ${this.formatBytes(s.sizeBytes)}`);
      return items.join('\n');
    });

    if (sitemapList.length > 0) {
      sections.push(this.createSection('📄 Generated Sitemaps', sitemapList));
    }

    // Footer
    sections.push(this.createFooter(report.timestamp));

    return sections.join('\n\n');
  }

  // ============= Helper Methods =============

  private createHeader(title: string, subtitle?: string): string {
    const lines = [`# ${title}`];
    if (subtitle) {
      lines.push(`**${subtitle}**`);
    }
    lines.push(this.DIVIDER);
    return lines.join('\n');
  }

  private createSection(title: string, items: string[]): string {
    return `## ${title}\n\n${items.join('\n')}`;
  }

  private createHealthScoreSection(score: number): string {
    let emoji = '🟢';
    let grade = 'Excellent';

    if (score < 50) {
      emoji = '🔴';
      grade = 'Poor';
    } else if (score < 70) {
      emoji = '🟠';
      grade = 'Fair';
    } else if (score < 85) {
      emoji = '🟡';
      grade = 'Good';
    }

    return this.createSection('Health Score', [
      `# ${emoji} ${score}/100`,
      `**Grade**: ${grade}`
    ]);
  }

  private createIssuesSection(title: string, issues: any[], severity: string): string {
    const items = issues.map(issue => {
      const lines = [`**${issue.type || issue.description}**`];
      if (issue.recommendation) {
        lines.push(`  - **Fix**: ${issue.recommendation}`);
      }
      if (issue.affectedUrls && issue.affectedUrls.length > 0) {
        lines.push(`  - **Affected**: ${issue.affectedUrls.length} URLs`);
      }
      return lines.join('\n');
    });

    return this.createSection(title, items);
  }

  private formatIndexationIssues(title: string, issues: any[]): string {
    const items = issues.slice(0, 10).map(issue => {
      const lines = [`**${issue.url}**`];
      lines.push(`  - **State**: ${issue.state}`);
      lines.push(`  - **Fix**: ${issue.fix}`);

      if (issue.evidence) {
        const evidence = [];
        if (issue.evidence.depth !== undefined) evidence.push(`Depth: ${issue.evidence.depth}`);
        if (issue.evidence.impressions !== undefined) evidence.push(`Impressions: ${issue.evidence.impressions}`);
        if (issue.evidence.clicks !== undefined) evidence.push(`Clicks: ${issue.evidence.clicks}`);
        if (evidence.length > 0) {
          lines.push(`  - **Evidence**: ${evidence.join(', ')}`);
        }
      }

      return lines.join('\n');
    });

    if (issues.length > 10) {
      items.push(`\n*... and ${issues.length - 10} more*`);
    }

    return this.createSection(title, items);
  }

  private formatRobotsFindings(title: string, findings: any[]): string {
    const items = findings.map(f => {
      const lines = [`- **${f.message}**`];
      lines.push(`  - **Fix**: ${f.fix}`);

      if (f.details) {
        if (f.details.userAgent) lines.push(`  - **User-Agent**: ${f.details.userAgent}`);
        if (f.details.rule) lines.push(`  - **Rule**: \`${f.details.rule}\``);
        if (f.details.affectedUrls && f.details.affectedUrls.length > 0) {
          lines.push(`  - **Affected URLs**: ${f.details.affectedUrls.length}`);
        }
      }

      return lines.join('\n');
    });

    return `${title}\n\n${items.join('\n\n')}`;
  }

  private createFooter(timestamp?: string): string {
    const lines = [this.SUB_DIVIDER];
    if (timestamp) {
      lines.push(`*Generated: ${this.formatDate(timestamp)}*`);
    }
    lines.push('*SEO & Google Ads Expert Tool v1.9*');
    return lines.join('\n');
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}