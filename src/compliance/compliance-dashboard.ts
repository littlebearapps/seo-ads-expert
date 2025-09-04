import pino from 'pino';
import { z } from 'zod';
import { AuditLogger, AuditEntry } from '../monitors/audit-logger.js';
import { CacheManager } from '../utils/cache.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Compliance report schemas
export const ComplianceReportSchema = z.object({
  period: z.object({
    start: z.string(),
    end: z.string()
  }),
  summary: z.object({
    totalChanges: z.number(),
    highRiskChanges: z.number(),
    unauthorizedAttempts: z.number(),
    complianceScore: z.number(),
    policyViolations: z.array(z.string())
  }),
  userActivity: z.record(z.object({
    changes: z.number(),
    violations: z.number(),
    lastActivity: z.string()
  })),
  riskAnalysis: z.object({
    budgetRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    dataRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    operationalRisk: z.enum(['LOW', 'MEDIUM', 'HIGH'])
  }),
  recommendations: z.array(z.string())
});

export const RetentionPolicySchema = z.object({
  auditLogs: z.object({
    retentionDays: z.number().default(90),
    archiveAfterDays: z.number().default(30),
    deleteAfterDays: z.number().default(365)
  }),
  performanceData: z.object({
    retentionDays: z.number().default(60),
    aggregateAfterDays: z.number().default(7)
  }),
  userData: z.object({
    retentionDays: z.number().default(365),
    anonymizeAfterDays: z.number().default(90)
  })
});

export const PrivacyComplianceSchema = z.object({
  gdprCompliant: z.boolean(),
  ccpaCompliant: z.boolean(),
  dataMinimization: z.boolean(),
  userConsent: z.boolean(),
  rightToForget: z.boolean(),
  dataPortability: z.boolean()
});

export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
export type PrivacyCompliance = z.infer<typeof PrivacyComplianceSchema>;

export class ComplianceDashboard {
  private auditLogger: AuditLogger;
  private cache: CacheManager;
  private retentionPolicy: RetentionPolicy;
  private privacySettings: PrivacyCompliance;

  constructor() {
    this.auditLogger = new AuditLogger();
    this.cache = new CacheManager();
    
    // Default retention policy
    this.retentionPolicy = {
      auditLogs: {
        retentionDays: 90,
        archiveAfterDays: 30,
        deleteAfterDays: 365
      },
      performanceData: {
        retentionDays: 60,
        aggregateAfterDays: 7
      },
      userData: {
        retentionDays: 365,
        anonymizeAfterDays: 90
      }
    };

    // Default privacy settings
    this.privacySettings = {
      gdprCompliant: true,
      ccpaCompliant: true,
      dataMinimization: true,
      userConsent: true,
      rightToForget: true,
      dataPortability: true
    };
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(
    startDate: string,
    endDate: string
  ): Promise<ComplianceReport> {
    logger.info('Generating compliance report', { startDate, endDate });

    // Get audit logs for the period
    const logs = await this.auditLogger.getAuditLogs({
      startDate,
      endDate
    });

    // Analyze logs for compliance metrics
    const summary = this.analyzeLogs(logs);
    const userActivity = this.analyzeUserActivity(logs);
    const riskAnalysis = await this.analyzeRisks(logs);
    const recommendations = this.generateRecommendations(summary, riskAnalysis);

    const report: ComplianceReport = {
      period: { start: startDate, end: endDate },
      summary,
      userActivity,
      riskAnalysis,
      recommendations
    };

    // Cache the report
    await this.cache.set(
      `compliance-report-${startDate}-${endDate}`,
      report,
      3600 // 1 hour cache
    );

    return report;
  }

  /**
   * Analyze logs for compliance metrics
   */
  private analyzeLogs(logs: AuditEntry[]): ComplianceReport['summary'] {
    let highRiskChanges = 0;
    let unauthorizedAttempts = 0;
    const violations: string[] = [];

    for (const log of logs) {
      // Check for high-risk changes
      if (this.isHighRisk(log)) {
        highRiskChanges++;
      }

      // Check for unauthorized attempts
      if (log.result === 'BLOCKED' || log.result === 'UNAUTHORIZED') {
        unauthorizedAttempts++;
      }

      // Check for policy violations
      const violation = this.checkPolicyViolation(log);
      if (violation && !violations.includes(violation)) {
        violations.push(violation);
      }
    }

    // Calculate compliance score (0-100)
    const complianceScore = this.calculateComplianceScore(
      logs.length,
      highRiskChanges,
      unauthorizedAttempts,
      violations.length
    );

    return {
      totalChanges: logs.length,
      highRiskChanges,
      unauthorizedAttempts,
      complianceScore,
      policyViolations: violations
    };
  }

  /**
   * Analyze user activity patterns
   */
  private analyzeUserActivity(logs: AuditEntry[]): Record<string, any> {
    const userActivity: Record<string, any> = {};

    for (const log of logs) {
      const user = log.user || 'unknown';
      
      if (!userActivity[user]) {
        userActivity[user] = {
          changes: 0,
          violations: 0,
          lastActivity: log.timestamp
        };
      }

      userActivity[user].changes++;
      
      if (this.checkPolicyViolation(log)) {
        userActivity[user].violations++;
      }

      // Update last activity
      if (new Date(log.timestamp) > new Date(userActivity[user].lastActivity)) {
        userActivity[user].lastActivity = log.timestamp;
      }
    }

    return userActivity;
  }

  /**
   * Analyze various risk factors
   */
  private async analyzeRisks(logs: AuditEntry[]): Promise<ComplianceReport['riskAnalysis']> {
    let budgetChanges = 0;
    let dataExports = 0;
    let criticalOperations = 0;

    for (const log of logs) {
      if (log.action?.includes('budget') || log.action?.includes('bid')) {
        budgetChanges++;
      }
      if (log.action?.includes('export') || log.action?.includes('download')) {
        dataExports++;
      }
      if (log.action?.includes('delete') || log.action?.includes('rollback')) {
        criticalOperations++;
      }
    }

    // Determine risk levels
    const budgetRisk = budgetChanges > 50 ? 'HIGH' : budgetChanges > 10 ? 'MEDIUM' : 'LOW';
    const dataRisk = dataExports > 100 ? 'HIGH' : dataExports > 20 ? 'MEDIUM' : 'LOW';
    const operationalRisk = criticalOperations > 10 ? 'HIGH' : criticalOperations > 3 ? 'MEDIUM' : 'LOW';

    return {
      budgetRisk,
      dataRisk,
      operationalRisk
    };
  }

  /**
   * Check if an action is high risk
   */
  private isHighRisk(log: AuditEntry): boolean {
    const highRiskActions = [
      'DELETE_CAMPAIGN',
      'DELETE_ACCOUNT',
      'BUDGET_INCREASE',
      'MASS_UPDATE',
      'ROLLBACK',
      'FORCE_APPLY'
    ];

    return highRiskActions.some(action => 
      log.action?.toUpperCase().includes(action)
    );
  }

  /**
   * Check for policy violations
   */
  private checkPolicyViolation(log: AuditEntry): string | null {
    // Check budget limits
    if (log.metadata?.budgetChange && log.metadata.budgetChange > 10000) {
      return 'Budget change exceeds $10,000 limit';
    }

    // Check working hours (example: 9 AM - 6 PM)
    const hour = new Date(log.timestamp).getHours();
    if (hour < 9 || hour > 18) {
      return 'Change made outside business hours';
    }

    // Check for sensitive data exposure
    if (log.metadata?.containsSensitiveData) {
      return 'Sensitive data exposure detected';
    }

    // Check for missing approval
    if (log.metadata?.requiresApproval && !log.metadata?.approved) {
      return 'Change made without required approval';
    }

    return null;
  }

  /**
   * Calculate overall compliance score
   */
  private calculateComplianceScore(
    totalChanges: number,
    highRiskChanges: number,
    unauthorizedAttempts: number,
    violations: number
  ): number {
    if (totalChanges === 0) return 100;

    // Start with perfect score
    let score = 100;

    // Deduct for high-risk changes (max -20)
    const highRiskPenalty = Math.min(20, (highRiskChanges / totalChanges) * 100);
    score -= highRiskPenalty;

    // Deduct for unauthorized attempts (max -30)
    const unauthorizedPenalty = Math.min(30, (unauthorizedAttempts / totalChanges) * 150);
    score -= unauthorizedPenalty;

    // Deduct for violations (max -40)
    const violationPenalty = Math.min(40, violations * 10);
    score -= violationPenalty;

    return Math.max(0, Math.round(score));
  }

  /**
   * Generate compliance recommendations
   */
  private generateRecommendations(
    summary: ComplianceReport['summary'],
    risks: ComplianceReport['riskAnalysis']
  ): string[] {
    const recommendations: string[] = [];

    // Score-based recommendations
    if (summary.complianceScore < 70) {
      recommendations.push('⚠️ Compliance score is below acceptable threshold. Review policies immediately.');
    }

    // High-risk changes
    if (summary.highRiskChanges > 10) {
      recommendations.push('📊 High number of risky changes detected. Consider implementing additional approval workflows.');
    }

    // Unauthorized attempts
    if (summary.unauthorizedAttempts > 0) {
      recommendations.push('🔒 Unauthorized access attempts detected. Review user permissions and access controls.');
    }

    // Policy violations
    if (summary.policyViolations.length > 0) {
      recommendations.push('📋 Policy violations detected. Provide additional training on compliance policies.');
    }

    // Risk-based recommendations
    if (risks.budgetRisk === 'HIGH') {
      recommendations.push('💰 High budget risk detected. Implement stricter budget controls and approval processes.');
    }

    if (risks.dataRisk === 'HIGH') {
      recommendations.push('🔐 High data export activity. Review data access policies and implement DLP measures.');
    }

    if (risks.operationalRisk === 'HIGH') {
      recommendations.push('⚡ High operational risk. Increase monitoring and implement change management procedures.');
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('✅ Compliance metrics are within acceptable ranges. Continue monitoring.');
    }

    return recommendations;
  }

  /**
   * Apply retention policies
   */
  async applyRetentionPolicies(): Promise<void> {
    logger.info('Applying retention policies');

    const now = new Date();

    // Archive old audit logs
    const archiveDate = new Date(now);
    archiveDate.setDate(archiveDate.getDate() - this.retentionPolicy.auditLogs.archiveAfterDays);
    
    await this.archiveOldLogs(archiveDate.toISOString());

    // Delete very old logs
    const deleteDate = new Date(now);
    deleteDate.setDate(deleteDate.getDate() - this.retentionPolicy.auditLogs.deleteAfterDays);
    
    await this.deleteOldLogs(deleteDate.toISOString());

    // Aggregate old performance data
    const aggregateDate = new Date(now);
    aggregateDate.setDate(aggregateDate.getDate() - this.retentionPolicy.performanceData.aggregateAfterDays);
    
    await this.aggregatePerformanceData(aggregateDate.toISOString());

    // Anonymize user data
    const anonymizeDate = new Date(now);
    anonymizeDate.setDate(anonymizeDate.getDate() - this.retentionPolicy.userData.anonymizeAfterDays);
    
    await this.anonymizeUserData(anonymizeDate.toISOString());

    logger.info('Retention policies applied successfully');
  }

  /**
   * Archive old logs
   */
  private async archiveOldLogs(beforeDate: string): Promise<void> {
    // Implementation would move logs to cold storage
    logger.info(`Archiving logs before ${beforeDate}`);
    await this.auditLogger.archiveLogs?.(beforeDate);
  }

  /**
   * Delete old logs
   */
  private async deleteOldLogs(beforeDate: string): Promise<void> {
    // Implementation would permanently delete old logs
    logger.info(`Deleting logs before ${beforeDate}`);
    await this.auditLogger.deleteLogs?.(beforeDate);
  }

  /**
   * Aggregate performance data
   */
  private async aggregatePerformanceData(beforeDate: string): Promise<void> {
    // Implementation would aggregate detailed data into summaries
    logger.info(`Aggregating performance data before ${beforeDate}`);
  }

  /**
   * Anonymize user data for privacy compliance
   */
  private async anonymizeUserData(beforeDate: string): Promise<void> {
    // Implementation would hash or remove PII
    logger.info(`Anonymizing user data before ${beforeDate}`);
    
    const logs = await this.auditLogger.getAuditLogs({
      endDate: beforeDate
    });

    for (const log of logs) {
      if (log.user && !log.user.startsWith('anon_')) {
        // Hash the user ID
        const hashedUser = `anon_${this.hashUser(log.user)}`;
        await this.auditLogger.updateLogUser?.(log.id, hashedUser);
      }
    }
  }

  /**
   * Hash user ID for anonymization
   */
  private hashUser(user: string): string {
    // Simple hash for demo - use crypto in production
    return Buffer.from(user).toString('base64').substring(0, 8);
  }

  /**
   * Export compliance data for auditors
   */
  async exportComplianceData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const endDate = new Date().toISOString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // Last 90 days

    const report = await this.generateComplianceReport(
      startDate.toISOString(),
      endDate
    );

    if (format === 'csv') {
      return this.convertToCSV(report);
    }

    return JSON.stringify(report, null, 2);
  }

  /**
   * Convert compliance report to CSV
   */
  private convertToCSV(report: ComplianceReport): string {
    const lines: string[] = [];
    
    // Header
    lines.push('Compliance Report');
    lines.push(`Period,${report.period.start},${report.period.end}`);
    lines.push('');
    
    // Summary
    lines.push('Summary');
    lines.push('Metric,Value');
    lines.push(`Total Changes,${report.summary.totalChanges}`);
    lines.push(`High Risk Changes,${report.summary.highRiskChanges}`);
    lines.push(`Unauthorized Attempts,${report.summary.unauthorizedAttempts}`);
    lines.push(`Compliance Score,${report.summary.complianceScore}`);
    lines.push('');
    
    // Risk Analysis
    lines.push('Risk Analysis');
    lines.push('Risk Type,Level');
    lines.push(`Budget Risk,${report.riskAnalysis.budgetRisk}`);
    lines.push(`Data Risk,${report.riskAnalysis.dataRisk}`);
    lines.push(`Operational Risk,${report.riskAnalysis.operationalRisk}`);
    lines.push('');
    
    // Recommendations
    lines.push('Recommendations');
    report.recommendations.forEach(rec => lines.push(rec));
    
    return lines.join('\n');
  }

  /**
   * Check GDPR compliance
   */
  async checkGDPRCompliance(): Promise<{
    compliant: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check data minimization
    if (!this.privacySettings.dataMinimization) {
      issues.push('Data minimization not enforced');
    }

    // Check user consent
    if (!this.privacySettings.userConsent) {
      issues.push('User consent mechanism not implemented');
    }

    // Check right to forget
    if (!this.privacySettings.rightToForget) {
      issues.push('Right to forget not supported');
    }

    // Check data portability
    if (!this.privacySettings.dataPortability) {
      issues.push('Data portability not available');
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }

  /**
   * Process data deletion request (GDPR right to forget)
   */
  async processDataDeletionRequest(userId: string): Promise<{
    success: boolean;
    deletedRecords: number;
  }> {
    logger.info('Processing data deletion request', { userId });

    if (!this.privacySettings.rightToForget) {
      throw new Error('Right to forget is not enabled');
    }

    // Delete user's audit logs
    const deletedLogs = await this.auditLogger.deleteUserLogs?.(userId) || 0;

    // Clear cache entries
    await this.cache.clear(`user-${userId}-*`);

    return {
      success: true,
      deletedRecords: deletedLogs
    };
  }

  /**
   * Export user data (GDPR data portability)
   */
  async exportUserData(userId: string): Promise<any> {
    logger.info('Exporting user data', { userId });

    if (!this.privacySettings.dataPortability) {
      throw new Error('Data portability is not enabled');
    }

    // Get user's audit logs
    const logs = await this.auditLogger.getUserLogs?.(userId) || [];

    // Format for export
    return {
      userId,
      exportDate: new Date().toISOString(),
      auditLogs: logs,
      metadata: {
        totalRecords: logs.length,
        dateRange: logs.length > 0 ? {
          start: logs[0].timestamp,
          end: logs[logs.length - 1].timestamp
        } : null
      }
    };
  }

  /**
   * Get retention policy
   */
  getRetentionPolicy(): RetentionPolicy {
    return this.retentionPolicy;
  }

  /**
   * Update retention policy
   */
  updateRetentionPolicy(policy: Partial<RetentionPolicy>): void {
    this.retentionPolicy = {
      ...this.retentionPolicy,
      ...policy
    };
    logger.info('Retention policy updated', this.retentionPolicy);
  }

  /**
   * Get privacy settings
   */
  getPrivacySettings(): PrivacyCompliance {
    return this.privacySettings;
  }

  /**
   * Update privacy settings
   */
  updatePrivacySettings(settings: Partial<PrivacyCompliance>): void {
    this.privacySettings = {
      ...this.privacySettings,
      ...settings
    };
    logger.info('Privacy settings updated', this.privacySettings);
  }
}