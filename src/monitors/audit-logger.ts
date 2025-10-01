import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
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
  action: z.enum(['mutation', 'validation', 'rollback', 'export', 'configuration']),
  resource: z.string().optional(),
  entityId: z.string().optional(),
  customerId: z.string().optional(),
  mutation: z.any().optional(),
  result: z.enum(['success', 'failed', 'skipped']),
  error: z.string().optional(),
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
   * Log a mutation attempt
   */
  async logMutation(params: {
    mutation: any;
    result: 'success' | 'failed' | 'skipped';
    error?: string;
    timestamp: string;
    user: string;
    metadata?: any;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: params.timestamp,
      user: params.user,
      action: 'mutation',
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
   * Log a configuration change
   */
  async logConfiguration(params: {
    configType: string;
    before: any;
    after: any;
    user: string;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      user: params.user,
      action: 'configuration',
      resource: params.configType,
      result: 'success',
      metadata: {
        sessionId: this.sessionId
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
    const users = new Set<string>();
    const errors: Array<{ timestamp: string; action: string; error: string }> = [];
    let totalCostChange = 0;
    let successCount = 0;
    let mutationCount = 0;
    let rollbackCount = 0;

    for (const entry of logs) {
      // Count by action
      actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + 1;
      
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
   * Write audit entry to file
   */
  private async writeEntry(entry: AuditLogEntry): Promise<void> {
    try {
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