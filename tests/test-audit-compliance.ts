import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComplianceDashboard } from '../src/compliance/compliance-dashboard.js';
import { ApprovalWorkflow } from '../src/compliance/approval-workflow.js';

// Mock dependencies
vi.mock('../src/utils/cache.js');
vi.mock('../src/monitors/audit-logger.js');

describe('Audit & Compliance System (Task 6)', () => {
  describe('ComplianceDashboard', () => {
    let dashboard: ComplianceDashboard;
    let mockAuditLogger: any;

    beforeEach(() => {
      mockAuditLogger = {
        getAuditLogs: vi.fn().mockResolvedValue([]),
        generateSummary: vi.fn().mockResolvedValue({
          totalActions: 0,
          byAction: {},
          byUser: {},
          byResult: {}
        }),
        archiveLogs: vi.fn().mockResolvedValue(undefined),
        deleteLogs: vi.fn().mockResolvedValue(undefined),
        updateLogUser: vi.fn().mockResolvedValue(undefined),
        deleteUserLogs: vi.fn().mockResolvedValue(0),
        getUserLogs: vi.fn().mockResolvedValue([])
      };

      dashboard = new ComplianceDashboard();
      (dashboard as any).auditLogger = mockAuditLogger;
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('Compliance Reporting', () => {
      it('should generate comprehensive compliance reports', async () => {
        // Mock audit logs with various scenarios
        const mockLogs = [
          {
            id: '1',
            timestamp: '2024-01-15T10:00:00Z',
            user: 'user1',
            action: 'UPDATE_BUDGET',
            result: 'SUCCESS',
            metadata: { budgetChange: 500 }
          },
          {
            id: '2',
            timestamp: '2024-01-15T14:30:00Z', // Outside business hours
            user: 'user2',
            action: 'DELETE_CAMPAIGN',
            result: 'SUCCESS',
            metadata: { requiresApproval: true, approved: false }
          },
          {
            id: '3',
            timestamp: '2024-01-15T16:00:00Z',
            user: 'user3',
            action: 'CREATE_CAMPAIGN',
            result: 'BLOCKED',
            metadata: {}
          }
        ];

        mockAuditLogger.getAuditLogs.mockResolvedValue(mockLogs);

        const report = await dashboard.generateComplianceReport(
          '2024-01-01',
          '2024-01-31'
        );

        expect(report).toHaveProperty('period');
        expect(report.period.start).toBe('2024-01-01');
        expect(report.period.end).toBe('2024-01-31');

        expect(report.summary.totalChanges).toBe(3);
        expect(report.summary.unauthorizedAttempts).toBe(1); // BLOCKED result
        expect(report.summary.policyViolations).toContain('Change made without required approval');

        expect(report.userActivity).toHaveProperty('user1');
        expect(report.userActivity).toHaveProperty('user2');
        expect(report.userActivity).toHaveProperty('user3');

        expect(report.riskAnalysis).toHaveProperty('budgetRisk');
        expect(report.riskAnalysis).toHaveProperty('dataRisk');
        expect(report.riskAnalysis).toHaveProperty('operationalRisk');

        expect(Array.isArray(report.recommendations)).toBe(true);
      });

      it('should calculate compliance scores correctly', async () => {
        const goodLogs = [
          { user: 'user1', action: 'UPDATE_BUDGET', result: 'SUCCESS', timestamp: '2024-01-15T12:00:00Z', metadata: {} }
        ];

        const badLogs = [
          { user: 'user1', action: 'DELETE_CAMPAIGN', result: 'SUCCESS', timestamp: '2024-01-15T20:00:00Z', metadata: { budgetChange: 15000 } },
          { user: 'user2', action: 'CREATE_CAMPAIGN', result: 'BLOCKED', timestamp: '2024-01-15T21:00:00Z', metadata: {} },
          { user: 'user3', action: 'UPDATE_BUDGET', result: 'UNAUTHORIZED', timestamp: '2024-01-15T22:00:00Z', metadata: {} }
        ];

        // Test high compliance score
        mockAuditLogger.getAuditLogs.mockResolvedValue(goodLogs);
        const goodReport = await dashboard.generateComplianceReport('2024-01-01', '2024-01-31');
        expect(goodReport.summary.complianceScore).toBeGreaterThan(80);

        // Test low compliance score
        mockAuditLogger.getAuditLogs.mockResolvedValue(badLogs);
        const badReport = await dashboard.generateComplianceReport('2024-01-01', '2024-01-31');
        expect(badReport.summary.complianceScore).toBeLessThan(70);
      });

      it('should analyze user activity patterns', async () => {
        const logs = [
          {
            timestamp: '2024-01-15T10:00:00Z',
            user: 'power-user',
            action: 'UPDATE_BUDGET',
            result: 'SUCCESS',
            metadata: {}
          },
          {
            timestamp: '2024-01-15T11:00:00Z',
            user: 'power-user',
            action: 'CREATE_CAMPAIGN',
            result: 'SUCCESS',
            metadata: {}
          },
          {
            timestamp: '2024-01-15T20:00:00Z', // Outside hours - violation
            user: 'power-user',
            action: 'DELETE_CAMPAIGN',
            result: 'SUCCESS',
            metadata: {}
          },
          {
            timestamp: '2024-01-16T09:00:00Z',
            user: 'casual-user',
            action: 'UPDATE_BID',
            result: 'SUCCESS',
            metadata: {}
          }
        ];

        mockAuditLogger.getAuditLogs.mockResolvedValue(logs);

        const report = await dashboard.generateComplianceReport('2024-01-01', '2024-01-31');

        expect(report.userActivity['power-user'].changes).toBe(3);
        expect(report.userActivity['power-user'].violations).toBe(1);
        expect(report.userActivity['casual-user'].changes).toBe(1);
        expect(report.userActivity['casual-user'].violations).toBe(0);
      });

      it('should analyze risk factors', async () => {
        const highRiskLogs = [
          // Many budget changes
          ...Array(60).fill(0).map((_, i) => ({
            timestamp: `2024-01-15T${(10 + i % 10).toString().padStart(2, '0')}:00:00Z`,
            user: `user${i}`,
            action: 'UPDATE_BUDGET',
            result: 'SUCCESS',
            metadata: { budgetChange: 100 }
          })),
          // Many data exports
          ...Array(120).fill(0).map((_, i) => ({
            timestamp: `2024-01-16T${(10 + i % 10).toString().padStart(2, '0')}:00:00Z`,
            user: `user${i}`,
            action: 'EXPORT_CAMPAIGNS',
            result: 'SUCCESS',
            metadata: {}
          })),
          // Critical operations
          ...Array(15).fill(0).map((_, i) => ({
            timestamp: `2024-01-17T${(10 + i % 10).toString().padStart(2, '0')}:00:00Z`,
            user: `admin${i}`,
            action: 'DELETE_CAMPAIGN',
            result: 'SUCCESS',
            metadata: {}
          }))
        ];

        mockAuditLogger.getAuditLogs.mockResolvedValue(highRiskLogs);

        const report = await dashboard.generateComplianceReport('2024-01-01', '2024-01-31');

        expect(report.riskAnalysis.budgetRisk).toBe('HIGH');
        expect(report.riskAnalysis.dataRisk).toBe('HIGH');
        expect(report.riskAnalysis.operationalRisk).toBe('HIGH');
      });
    });

    describe('Retention Policies', () => {
      it('should apply retention policies correctly', async () => {
        await dashboard.applyRetentionPolicies();

        expect(mockAuditLogger.archiveLogs).toHaveBeenCalled();
        expect(mockAuditLogger.deleteLogs).toHaveBeenCalled();
      });

      it('should allow updating retention policies', () => {
        const newPolicy = {
          auditLogs: {
            retentionDays: 120,
            archiveAfterDays: 45,
            deleteAfterDays: 400
          }
        };

        dashboard.updateRetentionPolicy(newPolicy);

        const policy = dashboard.getRetentionPolicy();
        expect(policy.auditLogs.retentionDays).toBe(120);
        expect(policy.auditLogs.archiveAfterDays).toBe(45);
        expect(policy.auditLogs.deleteAfterDays).toBe(400);
      });

      it('should anonymize user data for privacy', async () => {
        const oldLogs = [
          {
            id: '1',
            user: 'john.doe@company.com',
            timestamp: '2023-06-01T10:00:00Z',
            action: 'UPDATE_BUDGET'
          }
        ];

        mockAuditLogger.getAuditLogs.mockResolvedValue(oldLogs);

        await dashboard.applyRetentionPolicies();

        expect(mockAuditLogger.updateLogUser).toHaveBeenCalledWith(
          '1',
          expect.stringMatching(/^anon_/)
        );
      });
    });

    describe('GDPR Compliance', () => {
      it('should check GDPR compliance status', async () => {
        const compliance = await dashboard.checkGDPRCompliance();

        expect(compliance).toHaveProperty('compliant');
        expect(compliance).toHaveProperty('issues');
        expect(typeof compliance.compliant).toBe('boolean');
        expect(Array.isArray(compliance.issues)).toBe(true);
      });

      it('should process data deletion requests', async () => {
        mockAuditLogger.deleteUserLogs.mockResolvedValue(5);

        const result = await dashboard.processDataDeletionRequest('user123');

        expect(result.success).toBe(true);
        expect(result.deletedRecords).toBe(5);
        expect(mockAuditLogger.deleteUserLogs).toHaveBeenCalledWith('user123');
      });

      it('should export user data for portability', async () => {
        const userLogs = [
          {
            id: '1',
            timestamp: '2024-01-15T10:00:00Z',
            action: 'UPDATE_BUDGET',
            metadata: { budgetChange: 100 }
          }
        ];

        mockAuditLogger.getUserLogs.mockResolvedValue(userLogs);

        const exportData = await dashboard.exportUserData('user123');

        expect(exportData).toHaveProperty('userId', 'user123');
        expect(exportData).toHaveProperty('exportDate');
        expect(exportData).toHaveProperty('auditLogs');
        expect(exportData.auditLogs).toHaveLength(1);
      });

      it('should respect privacy settings', async () => {
        // Disable right to forget
        dashboard.updatePrivacySettings({ rightToForget: false });

        await expect(
          dashboard.processDataDeletionRequest('user123')
        ).rejects.toThrow('Right to forget is not enabled');

        // Disable data portability
        dashboard.updatePrivacySettings({ dataPortability: false });

        await expect(
          dashboard.exportUserData('user123')
        ).rejects.toThrow('Data portability is not enabled');
      });
    });

    describe('Export and Reporting', () => {
      it('should export compliance data in JSON format', async () => {
        mockAuditLogger.getAuditLogs.mockResolvedValue([
          {
            timestamp: '2024-01-15T10:00:00Z',
            user: 'user1',
            action: 'UPDATE_BUDGET',
            result: 'SUCCESS'
          }
        ]);

        const jsonExport = await dashboard.exportComplianceData('json');

        expect(typeof jsonExport).toBe('string');
        expect(() => JSON.parse(jsonExport)).not.toThrow();

        const parsed = JSON.parse(jsonExport);
        expect(parsed).toHaveProperty('summary');
        expect(parsed).toHaveProperty('riskAnalysis');
      });

      it('should export compliance data in CSV format', async () => {
        mockAuditLogger.getAuditLogs.mockResolvedValue([
          {
            timestamp: '2024-01-15T10:00:00Z',
            user: 'user1',
            action: 'UPDATE_BUDGET',
            result: 'SUCCESS'
          }
        ]);

        const csvExport = await dashboard.exportComplianceData('csv');

        expect(typeof csvExport).toBe('string');
        expect(csvExport).toContain('Compliance Report');
        expect(csvExport).toContain('Total Changes');
        expect(csvExport).toContain('Risk Analysis');
      });
    });
  });

  describe('ApprovalWorkflow', () => {
    let workflow: ApprovalWorkflow;
    let mockCache: any;
    let mockAuditLogger: any;

    beforeEach(() => {
      mockCache = {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null)
      };
      mockAuditLogger = {
        logApprovalRequest: vi.fn().mockResolvedValue(undefined),
        logApprovalDecision: vi.fn().mockResolvedValue(undefined),
        logAutoApproval: vi.fn().mockResolvedValue(undefined),
        logApprovalCancellation: vi.fn().mockResolvedValue(undefined),
        logApprovalExpiration: vi.fn().mockResolvedValue(undefined),
        getAuditLogs: vi.fn().mockResolvedValue([]),
        generateSummary: vi.fn().mockResolvedValue({
          totalActions: 0,
          byAction: {},
          byUser: {},
          byResult: {}
        })
      };

      workflow = new ApprovalWorkflow();
      (workflow as any).cache = mockCache;
      (workflow as any).auditLogger = mockAuditLogger;
    });

    describe('Approval Request Submission', () => {
      it('should submit changes for approval', async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            {
              type: 'UPDATE_BUDGET',
              budget: 2000, // High value requiring approval
              campaignId: 'campaign-1'
            }
          ],
          metadata: { reason: 'Performance optimization' }
        };

        const request = await workflow.submitForApproval(changes, 'user1');

        expect(request).toHaveProperty('id');
        expect(request.requestedBy).toBe('user1');
        expect(request.product).toBe('test-product');
        expect(request.status).toBe('PENDING');
        expect(request.severity).toBe('MEDIUM'); // Based on budget amount
        expect(request.requiredApprovals).toBeGreaterThan(0);
        expect(request.approvers.length).toBeGreaterThan(0);

        expect(mockAuditLogger.logApprovalRequest).toHaveBeenCalledWith({
          requestId: request.id,
          requestedBy: 'user1',
          severity: request.severity,
          changeType: request.changeType,
          timestamp: request.requestedAt
        });
      });

      it('should auto-approve low-risk changes', async () => {
        const lowRiskChanges = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            {
              type: 'UPDATE_BID',
              bid: 2.50,
              keyword: { text: 'test keyword', matchType: 'EXACT' }
            }
          ],
          metadata: {}
        };

        const request = await workflow.submitForApproval(lowRiskChanges, 'admin');

        expect(request.status).toBe('APPROVED');
        expect(request.metadata?.autoApproved).toBe(true);
        expect(mockAuditLogger.logAutoApproval).toHaveBeenCalled();
      });

      it('should determine severity based on change impact', async () => {
        const criticalChanges = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            {
              type: 'UPDATE_BUDGET',
              budget: 15000, // Critical threshold
              campaignId: 'campaign-1'
            }
          ],
          metadata: {}
        };

        const request = await workflow.submitForApproval(criticalChanges, 'user1');

        expect(request.severity).toBe('CRITICAL');
        expect(request.requiredApprovals).toBe(3); // Critical requires 3 approvals
      });

      it('should calculate estimated impact correctly', async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            {
              type: 'UPDATE_BUDGET',
              budget: 1000,
              campaignId: 'campaign-1'
            },
            {
              type: 'ADD_KEYWORD',
              keyword: { text: 'keyword1', matchType: 'EXACT' }
            },
            {
              type: 'ADD_KEYWORD',
              keyword: { text: 'keyword2', matchType: 'PHRASE' }
            }
          ],
          metadata: {}
        };

        const request = await workflow.submitForApproval(changes, 'user1');

        expect(request.estimatedImpact.budgetChange).toBe(1000);
        expect(request.estimatedImpact.campaignsAffected).toBe(1);
        expect(request.estimatedImpact.keywordsAffected).toBe(2);
      });
    });

    describe('Approval Processing', () => {
      let testRequest: any;

      beforeEach(async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 1500 }],
          metadata: {}
        };

        testRequest = await workflow.submitForApproval(changes, 'user1');
      });

      it('should process approval decisions', async () => {
        const result = await workflow.processApproval(
          testRequest.id,
          'manager',
          'APPROVED',
          'Looks good to me'
        );

        expect(result.status).toBe('APPROVED'); // Single approval sufficient for MEDIUM severity
        expect(result.currentApprovals).toHaveLength(1);
        expect(result.currentApprovals[0].approver).toBe('manager');
        expect(result.currentApprovals[0].decision).toBe('APPROVED');
        expect(result.currentApprovals[0].comment).toBe('Looks good to me');

        expect(mockAuditLogger.logApprovalDecision).toHaveBeenCalledWith({
          requestId: testRequest.id,
          approver: 'manager',
          decision: 'APPROVED',
          comment: 'Looks good to me',
          timestamp: expect.any(String)
        });
      });

      it('should reject requests with single rejection', async () => {
        const result = await workflow.processApproval(
          testRequest.id,
          'manager',
          'REJECTED',
          'Budget too high'
        );

        expect(result.status).toBe('REJECTED');
        expect(result.currentApprovals[0].decision).toBe('REJECTED');
      });

      it('should require multiple approvals for high severity', async () => {
        // Create high severity request
        const highSeverityChanges = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 8000 }], // HIGH severity
          metadata: {}
        };

        const highRequest = await workflow.submitForApproval(highSeverityChanges, 'user1');
        expect(highRequest.severity).toBe('HIGH');
        expect(highRequest.requiredApprovals).toBe(2);

        // First approval
        const firstApproval = await workflow.processApproval(
          highRequest.id,
          'senior_manager',
          'APPROVED'
        );
        expect(firstApproval.status).toBe('PENDING'); // Still needs one more

        // Second approval
        const secondApproval = await workflow.processApproval(
          highRequest.id,
          'director',
          'APPROVED'
        );
        expect(secondApproval.status).toBe('APPROVED'); // Now approved
      });

      it('should prevent duplicate approvals from same user', async () => {
        // Use HIGH severity request that requires 2 approvals
        const highSeverityChanges = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 8000 }], // HIGH severity
          metadata: {}
        };

        const highRequest = await workflow.submitForApproval(highSeverityChanges, 'user1');
        await workflow.processApproval(highRequest.id, 'senior_manager', 'APPROVED');

        await expect(
          workflow.processApproval(highRequest.id, 'senior_manager', 'APPROVED')
        ).rejects.toThrow('has already voted');
      });

      it('should validate approver authorization', async () => {
        await expect(
          workflow.processApproval(testRequest.id, 'unauthorized-user', 'APPROVED')
        ).rejects.toThrow('not authorized');
      });

      it('should prevent approval of non-pending requests', async () => {
        // Approve the request first
        await workflow.processApproval(testRequest.id, 'manager', 'APPROVED');

        // Try to approve again
        await expect(
          workflow.processApproval(testRequest.id, 'director', 'APPROVED')
        ).rejects.toThrow('not pending');
      });
    });

    describe('Approval Requirements', () => {
      it('should check if changes require approval', async () => {
        const highValueChanges = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 2000 }],
          metadata: {}
        };

        const result = await workflow.requiresApproval(highValueChanges, 'regular-user');

        expect(result.required).toBe(true);
        expect(result.reason).toContain('Budget change');
        expect(result.severity).toBe('MEDIUM');
      });

      it('should not require approval for auto-approved users', async () => {
        const smallChanges = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BID', bid: 1.50 }],
          metadata: {}
        };

        const result = await workflow.requiresApproval(smallChanges, 'admin');

        expect(result.required).toBe(false);
      });
    });

    describe('Request Management', () => {
      let testRequest: any;

      beforeEach(async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 1500 }],
          metadata: {}
        };

        testRequest = await workflow.submitForApproval(changes, 'user1');
      });

      it('should get pending approvals for specific approver', async () => {
        const pendingForManager = await workflow.getPendingApprovals('manager');

        expect(pendingForManager).toHaveLength(1);
        expect(pendingForManager[0].id).toBe(testRequest.id);
      });

      it('should get all pending approvals', async () => {
        const allPending = await workflow.getPendingApprovals();

        expect(allPending.length).toBeGreaterThanOrEqual(1);
        expect(allPending.some(r => r.id === testRequest.id)).toBe(true);
      });

      it('should cancel approval requests', async () => {
        await workflow.cancelApprovalRequest(
          testRequest.id,
          'user1',
          'Changed my mind'
        );

        const request = await workflow.getApprovalRequest(testRequest.id);
        expect(request?.status).toBe('CANCELLED');
        expect(request?.metadata?.cancelledBy).toBe('user1');
        expect(request?.metadata?.cancellationReason).toBe('Changed my mind');

        expect(mockAuditLogger.logApprovalCancellation).toHaveBeenCalledWith({
          requestId: testRequest.id,
          cancelledBy: 'user1',
          reason: 'Changed my mind',
          timestamp: expect.any(String)
        });
      });

      it('should prevent unauthorized cancellations', async () => {
        await expect(
          workflow.cancelApprovalRequest(testRequest.id, 'other-user', 'test')
        ).rejects.toThrow('Not authorized');
      });

      it('should allow admin cancellations', async () => {
        await workflow.cancelApprovalRequest(testRequest.id, 'admin', 'Administrative cancellation');

        const request = await workflow.getApprovalRequest(testRequest.id);
        expect(request?.status).toBe('CANCELLED');
      });
    });

    describe('Expiration and Escalation', () => {
      it('should process expired approvals', async () => {
        // Create request with short expiration
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 1000 }],
          metadata: {}
        };

        const request = await workflow.submitForApproval(changes, 'user1');

        // Manually set expiration to past
        request.expiresAt = new Date(Date.now() - 1000).toISOString();
        (workflow as any).pendingApprovals.set(request.id, request);

        await workflow.processExpiredApprovals();

        const expiredRequest = await workflow.getApprovalRequest(request.id);
        expect(expiredRequest?.status).toBe('EXPIRED');
        expect(mockAuditLogger.logApprovalExpiration).toHaveBeenCalled();
      });

      it('should escalate stale approvals', async () => {
        // Create request and make it stale
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 6000 }], // HIGH severity
          metadata: {}
        };

        const request = await workflow.submitForApproval(changes, 'user1');

        // Mock old request time
        request.requestedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7 hours ago
        (workflow as any).pendingApprovals.set(request.id, request);

        await workflow.escalateStaleApprovals();

        expect(mockCache.set).toHaveBeenCalledWith(
          `approval-escalation-${request.id}`,
          expect.objectContaining({
            escalatedAt: expect.any(String),
            severity: 'HIGH'
          })
        );
      });
    });

    describe('Policy Management', () => {
      it('should update approval policies', () => {
        const newPolicy = {
          budgetThresholds: {
            low: 200,
            medium: 2000,
            high: 10000,
            critical: 20000
          },
          autoApprove: {
            enabled: false, // Disable auto-approval
            maxBudget: 0,
            allowedUsers: []
          }
        };

        workflow.updatePolicy(newPolicy);

        const policy = workflow.getPolicy();
        expect(policy.budgetThresholds.low).toBe(200);
        expect(policy.autoApprove.enabled).toBe(false);
      });

      it('should use updated policy for severity determination', async () => {
        // Update thresholds
        workflow.updatePolicy({
          budgetThresholds: {
            low: 100,
            medium: 500,
            high: 2000,
            critical: 5000
          }
        });

        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 2500 }], // HIGH with new thresholds (>= 2000)
          metadata: {}
        };

        const request = await workflow.submitForApproval(changes, 'user1');

        expect(request.severity).toBe('HIGH');
      });
    });

    describe('Integration with Compliance Dashboard', () => {
      it('should work together for complete compliance workflow', async () => {
        const dashboard = new ComplianceDashboard();
        (dashboard as any).auditLogger = mockAuditLogger;

        // Submit approval request
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 5000 }],
          metadata: {}
        };

        const request = await workflow.submitForApproval(changes, 'user1');

        // Process approval
        await workflow.processApproval(request.id, 'director', 'APPROVED', 'Approved for Q1 campaign');

        // Mock logs for compliance report
        mockAuditLogger.getAuditLogs.mockResolvedValue([
          {
            timestamp: request.requestedAt,
            user: 'user1',
            action: 'APPROVAL_REQUEST',
            result: 'SUCCESS',
            metadata: { requestId: request.id, severity: 'HIGH' }
          },
          {
            timestamp: new Date().toISOString(),
            user: 'director',
            action: 'APPROVAL_DECISION',
            result: 'APPROVED',
            metadata: { requestId: request.id, decision: 'APPROVED' }
          }
        ]);

        // Generate compliance report
        const report = await dashboard.generateComplianceReport('2024-01-01', '2024-01-31');

        expect(report.summary.totalChanges).toBe(2);
        expect(report.userActivity['user1']).toBeDefined();
        expect(report.userActivity['director']).toBeDefined();
      });
    });
  });

  describe('Integration Tests', () => {
    let dashboard: ComplianceDashboard;
    let workflow: ApprovalWorkflow;

    beforeEach(() => {
      dashboard = new ComplianceDashboard();
      workflow = new ApprovalWorkflow();
    });

    it('should maintain compliance throughout approval workflow', async () => {
      // Test complete workflow from request to compliance reporting
      const changes = {
        customerId: '123-456-7890',
        product: 'test-product',
        mutations: [
          { type: 'UPDATE_BUDGET', budget: 3000 },
          { type: 'DELETE_CAMPAIGN', campaignId: 'old-campaign' }
        ],
        metadata: { reason: 'Restructuring campaigns' }
      };

      // Submit for approval
      const request = await workflow.submitForApproval(changes, 'user1');
      expect(request.severity).toBe('HIGH'); // Delete + high budget

      // Process approvals (HIGH requires 2 approvals)
      await workflow.processApproval(request.id, 'senior_manager', 'APPROVED');
      const finalRequest = await workflow.processApproval(request.id, 'director', 'APPROVED');

      expect(finalRequest.status).toBe('APPROVED');
      expect(finalRequest.currentApprovals).toHaveLength(2);

      // Verify compliance requirements are met
      expect(finalRequest.requiredApprovals).toBe(2);
      expect(finalRequest.currentApprovals.filter(a => a.decision === 'APPROVED')).toHaveLength(2);
    });

    it('should handle policy violations appropriately', async () => {
      const violatingChanges = {
        customerId: '123-456-7890',
        product: 'test-product',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 25000 // Exceeds CRITICAL threshold
          }
        ],
        metadata: {}
      };

      const request = await workflow.submitForApproval(violatingChanges, 'user1');

      expect(request.severity).toBe('CRITICAL');
      expect(request.requiredApprovals).toBe(3);
      expect(request.approvers).toContain('director');
      expect(request.approvers).toContain('vp');
      expect(request.approvers).toContain('cfo');
    });
  });
});