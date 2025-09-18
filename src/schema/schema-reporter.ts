/**
 * Schema Linting and Reporting
 * v1.8 Phase 2: JSON-LD Schema Generation System
 */

import { JsonLD, LintReport, LintIssue, ValidationResult } from './types.js';
import { SchemaValidator } from './schema-validator.js';

export class SchemaReporter {
  private validator: SchemaValidator;

  constructor() {
    this.validator = new SchemaValidator();
  }

  /**
   * Generate comprehensive report for schemas
   */
  generateReport(schemas: JsonLD[]): SchemaReport {
    const lintReport = this.validator.lint(schemas);

    return {
      summary: this.generateSummary(lintReport),
      details: this.generateDetails(schemas, lintReport),
      recommendations: this.generateRecommendations(lintReport),
      markdown: this.generateMarkdownReport(schemas, lintReport),
      csv: this.generateCSVReport(lintReport)
    };
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(lintReport: LintReport): ReportSummary {
    const passRate = lintReport.totalSchemas > 0
      ? Math.round((lintReport.validSchemas / lintReport.totalSchemas) * 100)
      : 0;

    const severityBreakdown = this.categorizeBySeverity(lintReport.issues);

    return {
      totalSchemas: lintReport.totalSchemas,
      validSchemas: lintReport.validSchemas,
      passRate,
      totalIssues: lintReport.issues.length,
      criticalIssues: severityBreakdown.critical,
      majorIssues: severityBreakdown.major,
      minorIssues: severityBreakdown.minor,
      duplicates: lintReport.summary.duplicates
    };
  }

  /**
   * Generate detailed analysis
   */
  private generateDetails(schemas: JsonLD[], lintReport: LintReport): SchemaDetail[] {
    return schemas.map((schema, index) => {
      const validation = this.validator.validate(schema);
      const schemaIssues = lintReport.issues.filter(issue =>
        issue.schemaType === schema['@type']
      );

      return {
        index,
        type: schema['@type'],
        name: schema.name || schema.headline || `Schema ${index + 1}`,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        issues: schemaIssues.length,
        severity: this.calculateSeverity(validation),
        size: JSON.stringify(schema).length
      };
    });
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(lintReport: LintReport): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const issueGroups = this.groupIssuesByType(lintReport.issues);

    // Generate recommendations based on common issue patterns
    for (const [issueType, issues] of issueGroups.entries()) {
      if (issues.length > 0) {
        const recommendation = this.getRecommendationForIssueType(issueType, issues);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }

    // Add general recommendations
    recommendations.push(...this.getGeneralRecommendations(lintReport));

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(schemas: JsonLD[], lintReport: LintReport): string {
    const summary = this.generateSummary(lintReport);
    const details = this.generateDetails(schemas, lintReport);
    const recommendations = this.generateRecommendations(lintReport);

    let markdown = `# Schema Validation Report\n\n`;

    // Summary section
    markdown += `## Summary\n\n`;
    markdown += `- **Total Schemas**: ${summary.totalSchemas}\n`;
    markdown += `- **Valid Schemas**: ${summary.validSchemas}\n`;
    markdown += `- **Pass Rate**: ${summary.passRate}%\n`;
    markdown += `- **Total Issues**: ${summary.totalIssues}\n`;
    markdown += `- **Critical Issues**: ${summary.criticalIssues}\n`;
    markdown += `- **Major Issues**: ${summary.majorIssues}\n`;
    markdown += `- **Minor Issues**: ${summary.minorIssues}\n\n`;

    // Schema details
    markdown += `## Schema Details\n\n`;
    markdown += `| Schema | Type | Status | Errors | Warnings | Size |\n`;
    markdown += `|--------|------|--------|--------|----------|------|\n`;

    details.forEach(detail => {
      const status = detail.valid ? '✅ Valid' : '❌ Invalid';
      markdown += `| ${detail.name} | ${detail.type} | ${status} | ${detail.errors.length} | ${detail.warnings.length} | ${detail.size}B |\n`;
    });

    // Issues by severity
    if (lintReport.issues.length > 0) {
      markdown += `\n## Issues\n\n`;

      const severityOrder = ['critical', 'major', 'minor'];
      const issuesBySeverity = this.categorizeBySeverityDetailed(lintReport.issues);

      for (const severity of severityOrder) {
        const issues = issuesBySeverity[severity];
        if (issues.length > 0) {
          markdown += `### ${severity.charAt(0).toUpperCase() + severity.slice(1)} Issues\n\n`;
          issues.forEach(issue => {
            const icon = issue.type === 'error' ? '❌' : '⚠️';
            markdown += `${icon} **${issue.schemaType}**: ${issue.message}\n`;
            if (issue.suggestion) {
              markdown += `   💡 *${issue.suggestion}*\n`;
            }
            markdown += '\n';
          });
        }
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      recommendations.forEach((rec, index) => {
        markdown += `### ${index + 1}. ${rec.title}\n\n`;
        markdown += `**Priority**: ${rec.priority}/10\n\n`;
        markdown += `${rec.description}\n\n`;
        if (rec.action) {
          markdown += `**Action**: ${rec.action}\n\n`;
        }
      });
    }

    return markdown;
  }

  /**
   * Generate CSV report for data analysis
   */
  private generateCSVReport(lintReport: LintReport): string {
    const headers = ['Schema Type', 'Issue Type', 'Severity', 'Message', 'Suggestion'];
    let csv = headers.join(',') + '\n';

    lintReport.issues.forEach(issue => {
      const severity = this.getIssueSeverity(issue);
      const row = [
        `"${issue.schemaType}"`,
        `"${issue.type}"`,
        `"${severity}"`,
        `"${issue.message.replace(/"/g, '""')}"`,
        `"${issue.suggestion ? issue.suggestion.replace(/"/g, '""') : ''}"`
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Categorize issues by severity
   */
  private categorizeBySeverity(issues: LintIssue[]): { critical: number; major: number; minor: number } {
    const critical = issues.filter(issue => this.getIssueSeverity(issue) === 'critical').length;
    const major = issues.filter(issue => this.getIssueSeverity(issue) === 'major').length;
    const minor = issues.filter(issue => this.getIssueSeverity(issue) === 'minor').length;

    return { critical, major, minor };
  }

  /**
   * Categorize issues by severity with details
   */
  private categorizeBySeverityDetailed(issues: LintIssue[]): { critical: LintIssue[]; major: LintIssue[]; minor: LintIssue[] } {
    return {
      critical: issues.filter(issue => this.getIssueSeverity(issue) === 'critical'),
      major: issues.filter(issue => this.getIssueSeverity(issue) === 'major'),
      minor: issues.filter(issue => this.getIssueSeverity(issue) === 'minor')
    };
  }

  /**
   * Determine issue severity
   */
  private getIssueSeverity(issue: LintIssue): 'critical' | 'major' | 'minor' {
    if (issue.type === 'error') {
      if (issue.message.includes('Missing required field') ||
          issue.message.includes('Invalid URL') ||
          issue.message.includes('Duplicate')) {
        return 'critical';
      }
      return 'major';
    } else {
      if (issue.message.includes('exceeds maximum length') ||
          issue.message.includes('below recommended')) {
        return 'major';
      }
      return 'minor';
    }
  }

  /**
   * Calculate overall severity for a schema
   */
  private calculateSeverity(validation: ValidationResult): 'critical' | 'major' | 'minor' | 'clean' {
    if (validation.errors.length > 0) {
      const hasRequiredFieldError = validation.errors.some(error =>
        error.includes('Missing required field')
      );
      return hasRequiredFieldError ? 'critical' : 'major';
    } else if (validation.warnings.length > 2) {
      return 'major';
    } else if (validation.warnings.length > 0) {
      return 'minor';
    }
    return 'clean';
  }

  /**
   * Group issues by type
   */
  private groupIssuesByType(issues: LintIssue[]): Map<string, LintIssue[]> {
    const groups = new Map<string, LintIssue[]>();

    issues.forEach(issue => {
      const key = issue.message.split(':')[0].trim();
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(issue);
    });

    return groups;
  }

  /**
   * Get recommendation for common issue types
   */
  private getRecommendationForIssueType(issueType: string, issues: LintIssue[]): Recommendation | null {
    if (issueType.includes('Missing required field')) {
      return {
        title: 'Add Missing Required Fields',
        priority: 9,
        description: `${issues.length} schemas are missing required fields. These fields are essential for valid schema markup.`,
        action: 'Review schema templates and ensure all required fields are populated with appropriate data.'
      };
    }

    if (issueType.includes('exceeds maximum length')) {
      return {
        title: 'Optimize Field Lengths',
        priority: 7,
        description: `${issues.length} schemas have fields that exceed recommended lengths. Shorter content improves SEO performance.`,
        action: 'Review and shorten long text fields while maintaining meaning and clarity.'
      };
    }

    if (issueType.includes('Invalid URL')) {
      return {
        title: 'Fix Invalid URLs',
        priority: 8,
        description: `${issues.length} schemas contain invalid URLs. This can break structured data parsing.`,
        action: 'Validate all URLs and ensure they follow proper format (https://domain.com/path).'
      };
    }

    return null;
  }

  /**
   * Get general recommendations
   */
  private getGeneralRecommendations(lintReport: LintReport): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (lintReport.validSchemas / lintReport.totalSchemas < 0.8) {
      recommendations.push({
        title: 'Improve Overall Schema Quality',
        priority: 8,
        description: 'Less than 80% of schemas are valid. Focus on fixing critical and major issues first.',
        action: 'Prioritize fixing errors over warnings, and implement automated validation in your workflow.'
      });
    }

    if (lintReport.summary.duplicates > 0) {
      recommendations.push({
        title: 'Remove Duplicate Content',
        priority: 6,
        description: `${lintReport.summary.duplicates} duplicate schemas detected. Duplicates can confuse search engines.`,
        action: 'Consolidate duplicate schemas or ensure each has unique identifiers and content.'
      });
    }

    return recommendations;
  }
}

// Type definitions for reporting
export interface SchemaReport {
  summary: ReportSummary;
  details: SchemaDetail[];
  recommendations: Recommendation[];
  markdown: string;
  csv: string;
}

export interface ReportSummary {
  totalSchemas: number;
  validSchemas: number;
  passRate: number;
  totalIssues: number;
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
  duplicates: number;
}

export interface SchemaDetail {
  index: number;
  type: string;
  name: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: number;
  severity: 'critical' | 'major' | 'minor' | 'clean';
  size: number;
}

export interface Recommendation {
  title: string;
  priority: number; // 1-10
  description: string;
  action: string;
}