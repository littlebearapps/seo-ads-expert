import pino from 'pino';
import { z } from 'zod';
import { CacheManager } from '../utils/cache.js';
import { AuditLogger } from '../monitors/audit-logger.js';
import { PlannedChanges } from '../writers/mutation-applier.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Approval schemas
export const ApprovalRequestSchema = z.object({
  id: z.string(),
  requestedBy: z.string(),
  requestedAt: z.string(),
  changeType: z.enum(['BUDGET', 'CAMPAIGN', 'KEYWORD', 'AD', 'STRUCTURE', 'CRITICAL']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  product: z.string(),
  customerId: z.string().optional(),
  changes: z.any(),
  estimatedImpact: z.object({
    budgetChange: z.number().optional(),
    campaignsAffected: z.number().optional(),
    keywordsAffected: z.number().optional(),
    estimatedReach: z.number().optional()
  }),
  metadata: z.record(z.any()).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']),
  approvers: z.array(z.string()),
  requiredApprovals: z.number(),
  currentApprovals: z.array(z.object({
    approver: z.string(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    timestamp: z.string(),
    comment: z.string().optional()
  })),
  expiresAt: z.string()
});

export const ApprovalPolicySchema = z.object({
  budgetThresholds: z.object({
    low: z.number().default(100),
    medium: z.number().default(1000),
    high: z.number().default(5000),
    critical: z.number().default(10000)
  }),
  autoApprove: z.object({
    enabled: z.boolean().default(true),
    maxBudget: z.number().default(100),
    allowedUsers: z.array(z.string()).default([])
  }),
  approvalMatrix: z.array(z.object({
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    requiredApprovals: z.number(),
    approvers: z.array(z.string()),
    escalationAfterHours: z.number().default(24)
  })),
  expirationHours: z.number().default(48)
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

export class ApprovalWorkflow {
  private cache: CacheManager;
  private auditLogger: AuditLogger;
  private policy: ApprovalPolicy;
  private pendingApprovals: Map<string, ApprovalRequest>;

  constructor() {
    this.cache = new CacheManager();
    this.auditLogger = new AuditLogger();
    this.pendingApprovals = new Map();

    // Default approval policy
    this.policy = {
      budgetThresholds: {
        low: 100,
        medium: 1000,
        high: 5000,
        critical: 10000
      },
      autoApprove: {
        enabled: true,
        maxBudget: 100,
        allowedUsers: ['admin', 'system']
      },
      approvalMatrix: [
        {
          severity: 'LOW',
          requiredApprovals: 1,
          approvers: ['manager'],
          escalationAfterHours: 24
        },
        {
          severity: 'MEDIUM',
          requiredApprovals: 1,
          approvers: ['manager', 'senior_manager'],
          escalationAfterHours: 12
        },
        {
          severity: 'HIGH',
          requiredApprovals: 2,
          approvers: ['senior_manager', 'director'],
          escalationAfterHours: 6
        },
        {
          severity: 'CRITICAL',
          requiredApprovals: 3,
          approvers: ['director', 'vp', 'cfo'],
          escalationAfterHours: 2
        }
      ],
      expirationHours: 48
    };
  }

  /**
   * Submit changes for approval
   */
  async submitForApproval(
    changes: PlannedChanges,
    requestedBy: string
  ): Promise<ApprovalRequest> {
    logger.info('Submitting changes for approval', { 
      requestedBy, 
      product: changes.product 
    });

    // Determine severity based on changes
    const severity = this.determineSeverity(changes);
    
    // Check if auto-approval applies
    if (this.canAutoApprove(changes, requestedBy, severity)) {
      return this.autoApprove(changes, requestedBy);
    }

    // Get approval requirements
    const approvalRequirements = this.getApprovalRequirements(severity);

    // Create approval request
    const request: ApprovalRequest = {
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      requestedBy,
      requestedAt: new Date().toISOString(),
      changeType: this.determineChangeType(changes),
      severity,
      product: changes.product,
      customerId: changes.customerId,
      changes: changes.mutations,
      estimatedImpact: this.estimateImpact(changes),
      metadata: changes.metadata,
      status: 'PENDING',
      approvers: approvalRequirements.approvers,
      requiredApprovals: approvalRequirements.requiredApprovals,
      currentApprovals: [],
      expiresAt: this.calculateExpiration()
    };

    // Store approval request
    this.pendingApprovals.set(request.id, request);
    await this.cache.set(`approval-${request.id}`, request);

    // Log approval request
    await this.auditLogger.logApprovalRequest({
      requestId: request.id,
      requestedBy,
      severity,
      changeType: request.changeType,
      timestamp: request.requestedAt
    });

    // Notify approvers
    await this.notifyApprovers(request);

    return request;
  }

  /**
   * Process approval decision
   */
  async processApproval(
    requestId: string,
    approver: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string
  ): Promise<ApprovalRequest> {
    logger.info('Processing approval decision', { 
      requestId, 
      approver, 
      decision 
    });

    // Get approval request
    const request = await this.getApprovalRequest(requestId);
    
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== 'PENDING') {
      throw new Error(`Approval request ${requestId} is not pending (status: ${request.status})`);
    }

    // Verify approver is authorized
    if (!request.approvers.includes(approver)) {
      throw new Error(`${approver} is not authorized to approve this request`);
    }

    // Check if approver already voted
    if (request.currentApprovals.some(a => a.approver === approver)) {
      throw new Error(`${approver} has already voted on this request`);
    }

    // Add approval
    request.currentApprovals.push({
      approver,
      decision,
      timestamp: new Date().toISOString(),
      comment
    });

    // Check if request is now complete
    if (decision === 'REJECTED') {
      request.status = 'REJECTED';
    } else if (request.currentApprovals.filter(a => a.decision === 'APPROVED').length >= request.requiredApprovals) {
      request.status = 'APPROVED';
    }

    // Update stored request
    this.pendingApprovals.set(requestId, request);
    await this.cache.set(`approval-${requestId}`, request);

    // Log approval decision
    await this.auditLogger.logApprovalDecision({
      requestId,
      approver,
      decision,
      comment,
      timestamp: new Date().toISOString()
    });

    // If approved, mark as ready for application
    if (request.status === 'APPROVED') {
      await this.markReadyForApplication(request);
    }

    return request;
  }

  /**
   * Check if changes need approval
   */
  async requiresApproval(
    changes: PlannedChanges,
    user: string
  ): Promise<{
    required: boolean;
    reason?: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }> {
    const severity = this.determineSeverity(changes);

    // Check auto-approval
    if (this.canAutoApprove(changes, user, severity)) {
      return { required: false };
    }

    // Determine reason
    const impact = this.estimateImpact(changes);
    let reason = 'Changes require approval based on:';

    if (impact.budgetChange && impact.budgetChange > this.policy.budgetThresholds.low) {
      reason += ` Budget change of $${impact.budgetChange}.`;
    }

    if (severity === 'HIGH' || severity === 'CRITICAL') {
      reason += ` ${severity} severity changes detected.`;
    }

    return {
      required: true,
      reason,
      severity
    };
  }

  /**
   * Determine severity of changes
   */
  private determineSeverity(changes: PlannedChanges): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const impact = this.estimateImpact(changes);
    
    // Check budget thresholds
    if (impact.budgetChange) {
      if (impact.budgetChange >= this.policy.budgetThresholds.critical) {
        return 'CRITICAL';
      }
      if (impact.budgetChange >= this.policy.budgetThresholds.high) {
        return 'HIGH';
      }
      if (impact.budgetChange >= this.policy.budgetThresholds.medium) {
        return 'MEDIUM';
      }
    }

    // Check structural changes
    const hasStructuralChanges = changes.mutations.some(m => 
      m.type === 'DELETE_CAMPAIGN' || 
      m.type === 'DELETE_AD_GROUP'
    );
    if (hasStructuralChanges) {
      return 'HIGH';
    }

    // Check number of affected entities
    if (impact.campaignsAffected && impact.campaignsAffected > 5) {
      return 'HIGH';
    }
    if (impact.keywordsAffected && impact.keywordsAffected > 100) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Determine change type
   */
  private determineChangeType(changes: PlannedChanges): ApprovalRequest['changeType'] {
    const types = new Set<string>();

    for (const mutation of changes.mutations) {
      if (mutation.type?.includes('BUDGET')) types.add('BUDGET');
      if (mutation.type?.includes('CAMPAIGN')) types.add('CAMPAIGN');
      if (mutation.type?.includes('KEYWORD')) types.add('KEYWORD');
      if (mutation.type?.includes('AD')) types.add('AD');
      if (mutation.type?.includes('DELETE')) types.add('CRITICAL');
    }

    // Return most critical type
    if (types.has('CRITICAL')) return 'CRITICAL';
    if (types.has('BUDGET')) return 'BUDGET';
    if (types.has('CAMPAIGN')) return 'CAMPAIGN';
    if (types.has('STRUCTURE')) return 'STRUCTURE';
    if (types.has('KEYWORD')) return 'KEYWORD';
    if (types.has('AD')) return 'AD';

    return 'CAMPAIGN'; // Default
  }

  /**
   * Estimate impact of changes
   */
  private estimateImpact(changes: PlannedChanges): ApprovalRequest['estimatedImpact'] {
    let budgetChange = 0;
    let campaignsAffected = new Set<string>();
    let keywordsAffected = 0;

    for (const mutation of changes.mutations) {
      // Estimate budget impact
      if (mutation.budget) {
        budgetChange += mutation.budget;
      }

      // Count affected entities
      if (mutation.campaignId) {
        campaignsAffected.add(mutation.campaignId);
      }
      if (mutation.type?.includes('KEYWORD')) {
        keywordsAffected++;
      }
    }

    return {
      budgetChange,
      campaignsAffected: campaignsAffected.size,
      keywordsAffected,
      estimatedReach: changes.metadata?.estimatedReach
    };
  }

  /**
   * Check if changes can be auto-approved
   */
  private canAutoApprove(
    changes: PlannedChanges,
    user: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ): boolean {
    if (!this.policy.autoApprove.enabled) {
      return false;
    }

    // Check user authorization
    if (!this.policy.autoApprove.allowedUsers.includes(user)) {
      return false;
    }

    // Check severity
    if (severity !== 'LOW') {
      return false;
    }

    // Check budget
    const impact = this.estimateImpact(changes);
    if (impact.budgetChange && impact.budgetChange > this.policy.autoApprove.maxBudget) {
      return false;
    }

    return true;
  }

  /**
   * Auto-approve changes
   */
  private async autoApprove(
    changes: PlannedChanges,
    requestedBy: string
  ): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: `auto-approval-${Date.now()}`,
      requestedBy,
      requestedAt: new Date().toISOString(),
      changeType: this.determineChangeType(changes),
      severity: 'LOW',
      product: changes.product,
      customerId: changes.customerId,
      changes: changes.mutations,
      estimatedImpact: this.estimateImpact(changes),
      metadata: { ...changes.metadata, autoApproved: true },
      status: 'APPROVED',
      approvers: ['system'],
      requiredApprovals: 0,
      currentApprovals: [{
        approver: 'system',
        decision: 'APPROVED',
        timestamp: new Date().toISOString(),
        comment: 'Auto-approved based on policy'
      }],
      expiresAt: this.calculateExpiration()
    };

    // Log auto-approval
    await this.auditLogger.logAutoApproval({
      requestId: request.id,
      requestedBy,
      reason: 'Met auto-approval criteria',
      timestamp: request.requestedAt
    });

    return request;
  }

  /**
   * Get approval requirements based on severity
   */
  private getApprovalRequirements(severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): {
    requiredApprovals: number;
    approvers: string[];
  } {
    const matrixEntry = this.policy.approvalMatrix.find(m => m.severity === severity);
    
    if (!matrixEntry) {
      // Default fallback
      return {
        requiredApprovals: 1,
        approvers: ['manager']
      };
    }

    return {
      requiredApprovals: matrixEntry.requiredApprovals,
      approvers: matrixEntry.approvers
    };
  }

  /**
   * Calculate expiration time
   */
  private calculateExpiration(): string {
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + this.policy.expirationHours);
    return expiration.toISOString();
  }

  /**
   * Notify approvers of pending request
   */
  private async notifyApprovers(request: ApprovalRequest): Promise<void> {
    // In production, this would send emails/Slack messages
    logger.info('Notifying approvers', {
      requestId: request.id,
      approvers: request.approvers
    });

    // Store notification metadata
    await this.cache.set(
      `approval-notifications-${request.id}`,
      {
        notifiedAt: new Date().toISOString(),
        approvers: request.approvers
      }
    );
  }

  /**
   * Mark request as ready for application
   */
  private async markReadyForApplication(request: ApprovalRequest): Promise<void> {
    await this.cache.set(
      `approved-changes-${request.id}`,
      {
        approvedAt: new Date().toISOString(),
        changes: request.changes,
        metadata: request.metadata
      }
    );
  }

  /**
   * Get approval request by ID
   */
  async getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
    // Check memory first
    if (this.pendingApprovals.has(requestId)) {
      return this.pendingApprovals.get(requestId)!;
    }

    // Check cache
    const cached = await this.cache.get(`approval-${requestId}`);
    if (cached) {
      return cached as ApprovalRequest;
    }

    return null;
  }

  /**
   * Get all pending approvals
   */
  async getPendingApprovals(approver?: string): Promise<ApprovalRequest[]> {
    const pending: ApprovalRequest[] = [];
    
    for (const request of this.pendingApprovals.values()) {
      if (request.status === 'PENDING') {
        if (!approver || request.approvers.includes(approver)) {
          pending.push(request);
        }
      }
    }

    return pending;
  }

  /**
   * Cancel approval request
   */
  async cancelApprovalRequest(
    requestId: string,
    cancelledBy: string,
    reason: string
  ): Promise<void> {
    const request = await this.getApprovalRequest(requestId);
    
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== 'PENDING') {
      throw new Error(`Cannot cancel non-pending request`);
    }

    // Only requester or admin can cancel
    if (request.requestedBy !== cancelledBy && cancelledBy !== 'admin') {
      throw new Error('Not authorized to cancel this request');
    }

    request.status = 'CANCELLED';
    request.metadata = {
      ...request.metadata,
      cancelledBy,
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason
    };

    // Update storage
    this.pendingApprovals.set(requestId, request);
    await this.cache.set(`approval-${requestId}`, request);

    // Log cancellation
    await this.auditLogger.logApprovalCancellation({
      requestId,
      cancelledBy,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Process expired approvals
   */
  async processExpiredApprovals(): Promise<void> {
    const now = new Date();
    
    for (const request of this.pendingApprovals.values()) {
      if (request.status === 'PENDING' && new Date(request.expiresAt) < now) {
        request.status = 'EXPIRED';
        
        // Update storage
        this.pendingApprovals.set(request.id, request);
        await this.cache.set(`approval-${request.id}`, request);
        
        // Log expiration
        await this.auditLogger.logApprovalExpiration({
          requestId: request.id,
          expiredAt: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Escalate stale approvals
   */
  async escalateStaleApprovals(): Promise<void> {
    const now = new Date();

    for (const request of this.pendingApprovals.values()) {
      if (request.status !== 'PENDING') continue;

      const requestAge = (now.getTime() - new Date(request.requestedAt).getTime()) / (1000 * 60 * 60);
      const matrixEntry = this.policy.approvalMatrix.find(m => m.severity === request.severity);

      if (matrixEntry && requestAge > matrixEntry.escalationAfterHours) {
        // Escalate to next level
        logger.info('Escalating approval request', {
          requestId: request.id,
          age: requestAge,
          severity: request.severity
        });

        // In production, this would notify higher-level approvers
        await this.notifyEscalation(request);
      }
    }
  }

  /**
   * Notify escalation
   */
  private async notifyEscalation(request: ApprovalRequest): Promise<void> {
    await this.cache.set(
      `approval-escalation-${request.id}`,
      {
        escalatedAt: new Date().toISOString(),
        originalApprovers: request.approvers,
        severity: request.severity
      }
    );
  }

  /**
   * Get approval policy
   */
  getPolicy(): ApprovalPolicy {
    return this.policy;
  }

  /**
   * Update approval policy
   */
  updatePolicy(policy: Partial<ApprovalPolicy>): void {
    this.policy = {
      ...this.policy,
      ...policy
    };
    logger.info('Approval policy updated', this.policy);
  }
}