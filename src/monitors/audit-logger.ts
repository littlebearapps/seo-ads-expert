import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { z } from 'zod';
import crypto from 'crypto';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Audit log entry schema
export const AuditLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  user: z.string(),
  action: z.string(), // Allow any action string (UPDATE_BUDGET, CONFIGURATION_CHANGE, etc.)
  resource: z.string().optional(),
  entityId: z.string().optional(),
  customerId: z.string().optional(),
  mutation: z.any().optional(),
  result: z.enum(['success', 'failed', 'skipped']),
  error: z.string().optional(),
  severity: z.string().optional(), // For security events
  hash: z.string().optional(), // Integrity hash for tamper-evident logging
  signature: z.string().optional(), // Digital signature for tamper-evident logging
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    sessionId: z.string().optional(),
    correlationId: z.string().optional()
  }).passthrough().optional(),
  changes: z.object({
    before: z.any().optional(),
    after: z.any().optional(),
    diff: z.string().optional()
  }).optional(),
  impact: z.object({
    affectedEntities: z.number().optional(),
    costChange: z.number().optional(),
    budgetUsed: z.number().optional()
  }).optional(),
  compliance: z.object({
    approved: z.boolean().optional(),
    approver: z.string().optional(),
    approvalTimestamp: z.string().optional(),
    complianceChecks: z.array(z.string()).optional()
  }).optional()
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

// Audit summary schema
export const AuditSummarySchema = z.object({
  period: z.object({
    start: z.string(),
    end: z.string()
  }),
  totalActions: z.number(),
  actionBreakdown: z.record(z.number()),
  byAction: z.record(z.number()), // Alias for actionBreakdown
  byUser: z.record(z.number()),
  byResult: z.record(z.number()),
  securityEvents: z.number(),
  successRate: z.number(),
  totalMutations: z.number(),
  totalRollbacks: z.number(),
  totalCostChange: z.number(),
  activeUsers: z.array(z.string()),
  topResources: z.array(z.object({
    resource: z.string(),
    count: z.number()
  })),
  errors: z.array(z.object({
    timestamp: z.string(),
    action: z.string(),
    error: z.string()
  }))
});

export type AuditSummary = z.infer<typeof AuditSummarySchema>;

export class AuditLogger {
  private auditPath: string;
  private currentLogFile: string;
  private sessionId: string;
  private retentionDays: number;

  constructor(retentionDays = 90) {
    this.auditPath = join(process.cwd(), 'audit');
    this.sessionId = crypto.randomBytes(16).toString('hex');
    this.retentionDays = retentionDays;
    
    // Ensure audit directory exists
    if (!existsSync(this.auditPath)) {
      mkdirSync(this.auditPath, { recursive: true });
    }

    // Set current log file (daily rotation)
    const date = new Date().toISOString().split('T')[0];
    this.currentLogFile = join(this.auditPath, `audit-${date}.jsonl`);
    
    // Clean up old logs
    this.cleanOldLogs();
  }

  /**
   * Log a mutation attempt (object signature)
   */
  async logMutation(params: {
    mutation: any;
    result: 'success' | 'failed' | 'skipped';
    error?: string;
    timestamp: string;
    user: string;
    metadata?: any;
  }): Promise<void>;

  /**
   * Log a mutation attempt (simple signature for tests)
   */
  async logMutation(mutation: any, user: string, result: string): Promise<void>;

  /**
   * Log a mutation attempt (implementation)
   */
  async logMutation(
    paramsOrMutation: any,
    userOrUndefined?: string,
    resultOrUndefined?: string
  ): Promise<void> {
    // Adapt simple signature to object signature
    let params: any;
    if (typeof paramsOrMutation === 'object' && paramsOrMutation.mutation) {
      // Object signature
      params = paramsOrMutation;
    } else {
      // Simple signature: (mutation, user, result)
      params = {
        mutation: paramsOrMutation,
        user: userOrUndefined!,
        result: resultOrUndefined!.toLowerCase() as 'success' | 'failed' | 'skipped',
        timestamp: new Date().toISOString()
      };
    }
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.timestamp,
      user: params.user,
      action: params.mutation.type || 'mutation', // Use mutation type as action
      resource: params.mutation.resource,
      entityId: params.mutation.entityId,
      customerId: params.mutation.customerId,
      mutation: params.mutation,
      result: params.result,
      error: params.error,
      metadata: {
        ...params.metadata,
        sessionId: this.sessionId
      },
      impact: {
        costChange: params.mutation.estimatedCost
      }
    };

    await this.writeEntry(entry);
  }

  /**
   * Log a validation event
   */
  async logValidation(params: {
    resource: string;
    entityId?: string;
    customerId?: string;
    validationResult: any;
    user: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      user: params.user,
      action: 'validation',
      resource: params.resource,
      entityId: params.entityId,
      customerId: params.customerId,
      result: params.validationResult.passed ? 'success' : 'failed',
      metadata: {
        sessionId: this.sessionId,
        correlationId: this.generateCorrelationId()
      },
      changes: {
        after: params.validationResult
      }
    };

    await this.writeEntry(entry);
  }

  /**
   * Log a rollback operation
   */
  async logRollback(params: {
    rollbackId: string;
    mutations: any[];
    result: 'success' | 'failed';
    error?: string;
    user: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      user: params.user,
      action: 'rollback',
      result: params.result,
      error: params.error,
      metadata: {
        sessionId: this.sessionId,
        correlationId: params.rollbackId
      },
      changes: {
        after: {
          rollbackId: params.rollbackId,
          mutationCount: params.mutations.length
        }
      },
      impact: {
        affectedEntities: params.mutations.length
      }
    };

    await this.writeEntry(entry);
  }

  /**
   * Log an export operation
   */
  async logExport(params: {
    format: string;
    resource: string;
    entityCount: number;
    user: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      user: params.user,
      action: 'export',
      resource: params.resource,
      result: 'success',
      metadata: {
        sessionId: this.sessionId,
        correlationId: this.generateCorrelationId()
      },
      changes: {
        after: {
          format: params.format,
          entityCount: params.entityCount
        }
      }
    };

    await this.writeEntry(entry);
  }

  /**
   * Log a configuration change (object signature)
   */
  async logConfiguration(params: {
    configType: string;
    before: any;
    after: any;
    user: string;
  }): Promise<void>;

  /**
   * Log a configuration change (simple signature for tests)
   */
  async logConfiguration(component: string, config: any, user: string): Promise<void>;

  /**
   * Log a configuration change (implementation)
   */
  async logConfiguration(
    paramsOrComponent: any,
    configOrUndefined?: any,
    userOrUndefined?: string
  ): Promise<void> {
    // Adapt simple signature to object signature
    let params: any;
    if (typeof paramsOrComponent === 'object' && paramsOrComponent.configType) {
      // Object signature
      params = paramsOrComponent;
    } else {
      // Simple signature: (component, config, user)
      params = {
        configType: paramsOrComponent,
        after: configOrUndefined,
        before: {},
        user: userOrUndefined!
      };
    }
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      user: params.user,
      action: 'CONFIGURATION_CHANGE',
      resource: params.configType,
      result: 'success',
      metadata: {
        sessionId: this.sessionId,
        component: params.configType // Add component to metadata for test compatibility
      },
      changes: {
        before: params.before,
        after: params.after,
        diff: this.generateDiff(params.before, params.after)
      }
    };

    await this.writeEntry(entry);
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(
    type: string,
    user: string,
    description: string,
    metadata?: any
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      user,
      action: type as any, // Use the type as the action
      resource: 'security',
      result: 'failed', // Security events are typically failures/violations
      severity: 'HIGH', // Top-level severity for security events
      metadata: {
        ...metadata,
        description,
        sessionId: this.sessionId
      },
      changes: {}
    };

    await this.writeEntry(entry);
  }

  /**
   * Log an approval request
   */
  async logApprovalRequest(params: {
    requestId: string;
    requestedBy: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    changeType: string;
    timestamp: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.timestamp,
      user: params.requestedBy,
      action: 'configuration',
      resource: `approval-request-${params.changeType}`,
      entityId: params.requestId,
      result: 'success',
      metadata: {
        sessionId: this.sessionId,
        severity: params.severity,
        changeType: params.changeType
      }
    };
    await this.writeEntry(entry);
  }

  /**
   * Log an approval decision
   */
  async logApprovalDecision(params: {
    requestId: string;
    approver: string;
    decision: 'APPROVED' | 'REJECTED';
    comment?: string;
    timestamp: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.timestamp,
      user: params.approver,
      action: 'configuration',
      resource: 'approval-decision',
      entityId: params.requestId,
      result: params.decision === 'APPROVED' ? 'success' : 'failed',
      metadata: {
        sessionId: this.sessionId,
        decision: params.decision,
        comment: params.comment
      }
    };
    await this.writeEntry(entry);
  }

  /**
   * Log an auto-approval
   */
  async logAutoApproval(params: {
    requestId: string;
    requestedBy: string;
    reason: string;
    timestamp: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.timestamp,
      user: params.requestedBy,
      action: 'configuration',
      resource: 'approval-auto',
      entityId: params.requestId,
      result: 'success',
      metadata: {
        sessionId: this.sessionId,
        reason: params.reason
      }
    };
    await this.writeEntry(entry);
  }

  /**
   * Log an approval cancellation
   */
  async logApprovalCancellation(params: {
    requestId: string;
    cancelledBy: string;
    reason?: string;
    timestamp: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.timestamp,
      user: params.cancelledBy,
      action: 'configuration',
      resource: 'approval-cancellation',
      entityId: params.requestId,
      result: 'success',
      metadata: {
        sessionId: this.sessionId,
        reason: params.reason
      }
    };
    await this.writeEntry(entry);
  }

  /**
   * Log an approval expiration
   */
  async logApprovalExpiration(params: {
    requestId: string;
    expiredAt: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.expiredAt,
      user: 'system',
      action: 'configuration',
      resource: 'approval-expiration',
      entityId: params.requestId,
      result: 'success',
      metadata: {
        sessionId: this.sessionId
      }
    };
    await this.writeEntry(entry);
  }

  /**
   * Get audit logs for a time period
   */
  async getAuditLogs(params: {
    startDate: string;
    endDate: string;
    user?: string;
    resource?: string;
    action?: string;
    result?: string;
  }): Promise<AuditLogEntry[]> {
    const logs: AuditLogEntry[] = [];
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);

    // Read logs from files in date range
    const files = this.getLogFilesInRange(start, end);
    
    for (const file of files) {
      const filePath = join(this.auditPath, file);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AuditLogEntry;
            
            // Apply filters
            if (params.user && entry.user !== params.user) continue;
            if (params.resource && entry.resource !== params.resource) continue;
            if (params.action && entry.action !== params.action) continue;
            if (params.result && entry.result !== params.result) continue;

            logs.push(entry);
          } catch (error) {
            logger.warn(`Failed to parse audit log entry: ${line}`);
          }
        }
      }
    }

    return logs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Generate audit summary for a period
   */
  async generateSummary(startDate: string, endDate: string): Promise<AuditSummary> {
    const logs = await this.getAuditLogs({ startDate, endDate });

    const actionBreakdown: Record<string, number> = {};
    const resourceCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const resultCounts: Record<string, number> = {};
    const users = new Set<string>();
    const errors: Array<{ timestamp: string; action: string; error: string }> = [];
    let totalCostChange = 0;
    let successCount = 0;
    let mutationCount = 0;
    let rollbackCount = 0;
    let securityEventCount = 0;

    for (const entry of logs) {
      // Count by action
      actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + 1;

      // Count by user
      userCounts[entry.user] = (userCounts[entry.user] || 0) + 1;

      // Count by result
      resultCounts[entry.result] = (resultCounts[entry.result] || 0) + 1;

      // Count security events
      if (entry.resource === 'security' || entry.action === 'security_event') {
        securityEventCount++;
      }

      // Count by resource
      if (entry.resource) {
        resourceCounts[entry.resource] = (resourceCounts[entry.resource] || 0) + 1;
      }

      // Track users
      users.add(entry.user);

      // Track errors
      if (entry.result === 'failed' && entry.error) {
        errors.push({
          timestamp: entry.timestamp,
          action: entry.action,
          error: entry.error
        });
      }

      // Track success rate
      if (entry.result === 'success') {
        successCount++;
      }

      // Track mutations and rollbacks
      if (entry.action === 'mutation') {
        mutationCount++;
        if (entry.impact?.costChange) {
          totalCostChange += entry.impact.costChange;
        }
      }
      if (entry.action === 'rollback') {
        rollbackCount++;
      }
    }

    // Get top resources
    const topResources = Object.entries(resourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([resource, count]) => ({ resource, count }));

    return {
      period: {
        start: startDate,
        end: endDate
      },
      totalActions: logs.length,
      actionBreakdown,
      byAction: actionBreakdown, // Alias
      byUser: userCounts,
      byResult: resultCounts,
      securityEvents: securityEventCount,
      successRate: logs.length > 0 ? (successCount / logs.length) * 100 : 0,
      totalMutations: mutationCount,
      totalRollbacks: rollbackCount,
      totalCostChange,
      activeUsers: Array.from(users),
      topResources,
      errors: errors.slice(0, 50) // Limit to 50 most recent errors
    };
  }

  /**
   * Detect suspicious patterns for a user
   */
  async detectSuspiciousPatterns(userId: string): Promise<Array<{ type: string; count: number; timeframe: string }>> {
    const patterns: Array<{ type: string; count: number; timeframe: string }> = [];

    // Get logs for the last 24 hours
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const logs = await this.getAuditLogs({
      startDate,
      endDate,
      user: userId
    });

    // Detect multiple failures
    const failedActions = logs.filter(l => l.result === 'failed');
    if (failedActions.length >= 5) {
      patterns.push({
        type: 'MULTIPLE_FAILURES',
        count: failedActions.length,
        timeframe: '24h'
      });
    }

    // Detect rapid-fire actions
    if (logs.length >= 20) {
      patterns.push({
        type: 'HIGH_FREQUENCY',
        count: logs.length,
        timeframe: '24h'
      });
    }

    // Detect unusual delete operations
    const deleteActions = logs.filter(l => l.action.includes('DELETE') || l.action.includes('REMOVE'));
    if (deleteActions.length >= 3) {
      patterns.push({
        type: 'MULTIPLE_DELETES',
        count: deleteActions.length,
        timeframe: '24h'
      });
    }

    return patterns;
  }

  /**
   * Get user activity summary
   */
  async getUserActivity(userId: string, days: number): Promise<{
    totalActions: number;
    mostFrequentActions: Array<{ action: string; count: number }>;
    timeDistribution: Record<string, number>;
    riskScore: number;
  }> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const logs = await this.getAuditLogs({
      startDate,
      endDate,
      user: userId
    });

    // Count actions
    const actionCounts: Record<string, number> = {};
    const hourDistribution: Record<string, number> = {};

    for (const log of logs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

      // Track hour distribution
      const hour = new Date(log.timestamp).getHours();
      hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
    }

    // Get most frequent actions
    const mostFrequentActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));

    // Calculate risk score (0-100)
    const failureRate = logs.filter(l => l.result === 'failed').length / Math.max(logs.length, 1);
    const actionFrequency = logs.length / days;
    const riskScore = Math.min(100, (failureRate * 50) + (actionFrequency > 10 ? 25 : 0) + (logs.length > 100 ? 25 : 0));

    return {
      totalActions: logs.length,
      mostFrequentActions,
      timeDistribution: hourDistribution,
      riskScore
    };
  }

  /**
   * Write audit entry to file
   */
  private async writeEntry(entry: AuditLogEntry): Promise<void> {
    try {
      // Add tamper-evident hash and signature
      const entryData = JSON.stringify({
        id: entry.id,
        timestamp: entry.timestamp,
        user: entry.user,
        action: entry.action,
        result: entry.result
      });

      entry.hash = crypto.createHash('sha256').update(entryData).digest('hex');
      entry.signature = crypto.createHmac('sha256', this.sessionId).update(entryData).digest('hex');

      const line = JSON.stringify(entry) + '\n';

      // Append to daily log file
      if (existsSync(this.currentLogFile)) {
        const content = readFileSync(this.currentLogFile, 'utf-8');
        writeFileSync(this.currentLogFile, content + line);
      } else {
        writeFileSync(this.currentLogFile, line);
      }

      logger.debug('Audit log entry written', { id: entry.id, action: entry.action });
    } catch (error) {
      logger.error('Failed to write audit log entry', error);
    }
  }

  /**
   * Get log files in date range
   */
  private getLogFilesInRange(start: Date, end: Date): string[] {
    const files: string[] = [];
    const current = new Date(start);
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      files.push(`audit-${dateStr}.jsonl`);
      current.setDate(current.getDate() + 1);
    }
    
    return files;
  }

  /**
   * Clean up old audit logs
   */
  private cleanOldLogs(): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const files = readdirSync(this.auditPath);
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('audit-') && file.endsWith('.jsonl')) {
          const dateStr = file.replace('audit-', '').replace('.jsonl', '');
          const fileDate = new Date(dateStr);

          if (fileDate < cutoffDate) {
            const filePath = join(this.auditPath, file);
            existsSync(filePath) && unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old audit log files`);
      }
    } catch (error) {
      logger.warn('Failed to clean old audit logs', error);
    }
  }

  /**
   * Set retention policy (number of days to keep logs)
   */
  setRetentionPolicy(days: number): void {
    this.retentionDays = days;
    logger.info(`Retention policy set to ${days} days`);
  }

  /**
   * Manually trigger cleanup of old logs
   */
  async cleanupOldLogs(): Promise<void> {
    this.cleanOldLogs();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate diff between two objects
   */
  private generateDiff(before: any, after: any): string {
    // Simple diff for now - in production would use a proper diff library
    const changes: string[] = [];
    
    const beforeStr = JSON.stringify(before, null, 2);
    const afterStr = JSON.stringify(after, null, 2);
    
    if (beforeStr !== afterStr) {
      changes.push(`Changed from: ${beforeStr}`);
      changes.push(`Changed to: ${afterStr}`);
    }
    
    return changes.join('\n');
  }

  /**
   * Export audit logs to CSV
   */
  /**
   * Export logs to a string format
   */
  async exportLogs(startDate: string, endDate: string, format: string): Promise<string> {
    const logs = await this.getAuditLogs({ startDate, endDate });

    if (format === 'csv') {
      const headers = ['timestamp', 'user', 'action', 'result', 'resource', 'error'];
      const rows = logs.map(log => [
        log.timestamp,
        log.user,
        log.action,
        log.result,
        log.resource || '',
        log.error || ''
      ]);

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    } else if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async exportToCSV(startDate: string, endDate: string, outputPath: string): Promise<void> {
    const logs = await this.getAuditLogs({ startDate, endDate });

    const headers = ['ID', 'Timestamp', 'User', 'Action', 'Resource', 'Result', 'Error'];
    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.user,
      log.action,
      log.resource || '',
      log.result,
      log.error || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    writeFileSync(outputPath, csv);

    logger.info(`Exported ${logs.length} audit log entries to ${outputPath}`);
  }
}