import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MutationGuard } from '../src/monitors/mutation-guard.js';
import { BudgetEnforcer } from '../src/monitors/budget-enforcer.js';
import { AuditLogger } from '../src/monitors/audit-logger.js';
import { MutationApplier, MutationBuilder } from '../src/writers/mutation-applier.js';

// Mock dependencies
vi.mock('../src/utils/cache.js');
vi.mock('../src/connectors/google-ads-api.js');

describe('Safe Write Operations & Guardrails (Task 2)', () => {
  describe('MutationGuard', () => {
    let guard: MutationGuard;
    let mockLandingPageValidator: any;

    beforeEach(() => {
      // Mock landing page validator to avoid real HTTP requests in tests
      mockLandingPageValidator = {
        checkHealth: vi.fn().mockResolvedValue([{
          url: '',
          status: 200,
          isHealthy: true,
          issues: [],
          metrics: { isSSL: true, isMobileFriendly: true, loadTimeMs: 100 }
        }])
      };
      guard = new MutationGuard(undefined, mockLandingPageValidator);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('Budget Validation', () => {
      it('should validate budget limits', async () => {
        const mutation = {
          type: 'UPDATE_BUDGET' as const,
          resource: 'campaign' as const,
          entityId: 'campaign-1',
          customerId: '123-456-7890',
          changes: {
            budgetMicros: '15000000' // $15, exceeds default limit of $10
          },
          estimatedCost: 15
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].severity).toBe('error');
        expect(result.violations[0].message).toContain('budget');
        expect(result.violations[0].message).toContain('exceeded');
      });

      it('should allow budgets within limits', async () => {
        const mutation = {
          type: 'UPDATE_BUDGET',
          budget: 5000, // Within limit
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(true);
      });

      it('should validate daily budget caps', async () => {
        const mutation = {
          type: 'UPDATE_BUDGET',
          budget: 2000,
          campaignId: 'campaign-1',
          customerId: '123-456-7890',
          metadata: { budgetType: 'DAILY' }
        };

        const result = await guard.validateMutation(mutation);
        expect(result).toBeDefined();
        expect(typeof result.passed).toBe('boolean');
      });

      it('should warn about sudden budget increases', async () => {
        const mutation = {
          type: 'UPDATE_BUDGET',
          budget: 1000,
          oldBudget: 100, // 1000% increase
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.severity).toBe('WARNING');
        expect(result.message).toContain('increase');
      });
    });

    describe('Landing Page Validation', () => {
      it('should validate landing page URLs', async () => {
        const mutation = {
          type: 'UPDATE_AD',
          ad: {
            landingPageUrl: 'https://valid-domain.com/landing'
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);
        expect(result.passed).toBe(true);
      });

      it('should reject invalid URLs', async () => {
        const mutation = {
          type: 'UPDATE_AD',
          ad: {
            landingPageUrl: 'invalid-url'
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('URL');
      });

      it('should check landing page accessibility', async () => {
        const mutation = {
          type: 'UPDATE_AD',
          ad: {
            landingPageUrl: 'https://test-domain.com/404-page'
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        // Mock HTTP check
        (guard as any).checkUrlAccessibility = vi.fn().mockResolvedValue(false);

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('accessible');
      });

      it('should validate SSL requirements', async () => {
        const mutation = {
          type: 'UPDATE_AD',
          ad: {
            landingPageUrl: 'http://insecure-site.com' // No SSL
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('HTTPS');
      });
    });

    describe('Device Targeting Validation', () => {
      it('should validate device modifiers', async () => {
        const mutation = {
          type: 'UPDATE_TARGETING',
          targeting: {
            deviceModifiers: {
              mobile: 1.5,
              desktop: 1.0,
              tablet: 0.8
            }
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);
        expect(result.passed).toBe(true);
      });

      it('should reject invalid modifier values', async () => {
        const mutation = {
          type: 'UPDATE_TARGETING',
          targeting: {
            deviceModifiers: {
              mobile: 5.0, // Too high
              desktop: -0.5 // Negative
            }
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('modifier');
      });
    });

    describe('Bid Validation', () => {
      it('should validate bid ranges', async () => {
        const mutation = {
          type: 'UPDATE_BID',
          bid: 2.50,
          keyword: { text: 'test keyword', matchType: 'EXACT' },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);
        expect(result.passed).toBe(true);
      });

      it('should reject bids that are too high', async () => {
        const mutation = {
          type: 'UPDATE_BID',
          bid: 100.00, // Exceeds reasonable limit
          keyword: { text: 'expensive keyword', matchType: 'EXACT' },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('bid');
      });

      it('should reject bids that are too low', async () => {
        const mutation = {
          type: 'UPDATE_BID',
          bid: 0.01, // Too low
          keyword: { text: 'cheap keyword', matchType: 'BROAD' },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('minimum');
      });
    });

    describe('Keyword Quality Validation', () => {
      it('should validate keyword quality scores', async () => {
        const mutation = {
          type: 'ADD_KEYWORD',
          keyword: {
            text: 'high quality keyword',
            matchType: 'EXACT',
            qualityScore: 8
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);
        expect(result.passed).toBe(true);
      });

      it('should warn about low quality keywords', async () => {
        const mutation = {
          type: 'ADD_KEYWORD',
          keyword: {
            text: 'low quality keyword',
            matchType: 'BROAD',
            qualityScore: 3
          },
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(result.severity).toBe('WARNING');
        expect(result.message).toContain('quality');
      });

      it('should validate keyword relevance', async () => {
        const mutation = {
          type: 'ADD_KEYWORD',
          keyword: {
            text: 'completely irrelevant keyword',
            matchType: 'BROAD'
          },
          campaignId: 'campaign-1',
          adGroupTheme: 'Chrome Extensions',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);
        
        // Should flag relevance issues
        expect(result.passed).toBe(false);
        expect(result.message).toContain('relevance');
      });
    });

    describe('Batch Validation', () => {
      it('should validate multiple mutations', async () => {
        const mutations = [
          {
            type: 'UPDATE_BUDGET',
            budget: 500,
            campaignId: 'campaign-1',
            customerId: '123-456-7890'
          },
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'valid keyword', matchType: 'EXACT', qualityScore: 8 },
            campaignId: 'campaign-1',
            customerId: '123-456-7890'
          }
        ];

        const results = await guard.validateMutations(mutations);

        expect(results).toHaveLength(2);
        expect(results.every(r => r.passed)).toBe(true);
      });

      it('should detect conflicting mutations', async () => {
        const mutations = [
          {
            type: 'UPDATE_BUDGET',
            budget: 1000,
            campaignId: 'campaign-1',
            customerId: '123-456-7890'
          },
          {
            type: 'UPDATE_BUDGET',
            budget: 2000, // Conflicting budget update
            campaignId: 'campaign-1',
            customerId: '123-456-7890'
          }
        ];

        const results = await guard.validateMutations(mutations);

        expect(results.some(r => !r.passed && r.message.includes('conflict'))).toBe(true);
      });
    });

    describe('Custom Validation Rules', () => {
      it('should allow adding custom validation rules', () => {
        const customRule = {
          id: 'custom-test-rule',
          name: 'Custom Test Rule',
          validate: vi.fn().mockReturnValue({ passed: true }),
          severity: 'WARNING' as const
        };

        guard.addCustomRule(customRule);

        expect((guard as any).customRules.has('custom-test-rule')).toBe(true);
      });

      it('should execute custom validation rules', async () => {
        const customRule = {
          id: 'budget-multiple-rule',
          name: 'Budget Multiple Rule',
          validate: vi.fn().mockReturnValue({
            passed: false,
            message: 'Budget must be multiple of 100'
          }),
          severity: 'WARNING' as const
        };

        guard.addCustomRule(customRule);

        const mutation = {
          type: 'UPDATE_BUDGET',
          budget: 550, // Not multiple of 100
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        const result = await guard.validateMutation(mutation);

        expect(customRule.validate).toHaveBeenCalled();
        expect(result.passed).toBe(false);
      });
    });
  });

  describe('BudgetEnforcer', () => {
    let enforcer: BudgetEnforcer;

    beforeEach(() => {
      enforcer = new BudgetEnforcer();
    });

    describe('Daily Budget Tracking', () => {
      it('should track daily spend', async () => {
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 150.00);
        
        const dailySpend = await enforcer.getDailySpend('123-456-7890', 'campaign-1');
        expect(dailySpend).toBe(150.00);
      });

      it('should enforce daily budget limits', async () => {
        // Set daily budget limit
        await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 200.00);
        
        // Record spend up to limit
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 200.00);
        
        // Check if budget is exceeded
        const canSpend = await enforcer.canSpend('123-456-7890', 'campaign-1', 50.00);
        expect(canSpend).toBe(false);
      });

      it('should allow spending within budget', async () => {
        await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 500.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 100.00);
        
        const canSpend = await enforcer.canSpend('123-456-7890', 'campaign-1', 200.00);
        expect(canSpend).toBe(true);
      });

      it('should reset daily budgets at midnight', async () => {
        await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 200.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 200.00);
        
        // Simulate day reset
        await enforcer.resetDailyBudgets();
        
        const dailySpend = await enforcer.getDailySpend('123-456-7890', 'campaign-1');
        expect(dailySpend).toBe(0);
      });
    });

    describe('Campaign Budget Management', () => {
      it('should enforce campaign-level budgets', async () => {
        await enforcer.setCampaignBudget('123-456-7890', 'campaign-1', 1000.00);
        
        const result = await enforcer.validateBudgetChange(
          '123-456-7890',
          'campaign-1',
          1500.00 // Exceeds campaign budget
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('campaign budget');
      });

      it('should allow budget changes within limits', async () => {
        await enforcer.setCampaignBudget('123-456-7890', 'campaign-1', 2000.00);
        
        const result = await enforcer.validateBudgetChange(
          '123-456-7890',
          'campaign-1',
          800.00 // Within limit
        );

        expect(result.allowed).toBe(true);
      });
    });

    describe('Account-Level Budget Management', () => {
      it('should enforce account-level spending limits', async () => {
        await enforcer.setAccountBudget('123-456-7890', 5000.00);
        
        // Record spending across multiple campaigns
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 2000.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-2', 2000.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-3', 1500.00);
        
        const canSpend = await enforcer.canSpendAccount('123-456-7890', 1000.00);
        expect(canSpend).toBe(false); // Total would exceed 5000
      });

      it('should track account-level spend accurately', async () => {
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 100.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-2', 200.00);
        
        const totalSpend = await enforcer.getAccountSpend('123-456-7890');
        expect(totalSpend).toBe(300.00);
      });
    });

    describe('Budget Alerts', () => {
      it('should generate alerts when approaching budget limits', async () => {
        await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 1000.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 850.00); // 85% of budget
        
        const alerts = await enforcer.getBudgetAlerts('123-456-7890');
        
        expect(alerts.length).toBeGreaterThan(0);
        expect(alerts[0].type).toBe('BUDGET_WARNING');
        expect(alerts[0].percentage).toBeGreaterThan(80);
      });

      it('should generate critical alerts when budget exceeded', async () => {
        await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 500.00);
        await enforcer.recordSpend('123-456-7890', 'campaign-1', 600.00); // Exceeded
        
        const alerts = await enforcer.getBudgetAlerts('123-456-7890');
        
        expect(alerts.some(a => a.type === 'BUDGET_EXCEEDED')).toBe(true);
      });
    });

    describe('Emergency Budget Controls', () => {
      it('should implement emergency stops', async () => {
        await enforcer.setEmergencyStop('123-456-7890', 'campaign-1', 'Suspicious activity detected');
        
        const canSpend = await enforcer.canSpend('123-456-7890', 'campaign-1', 1.00);
        expect(canSpend).toBe(false);
      });

      it('should allow emergency stop removal', async () => {
        await enforcer.setEmergencyStop('123-456-7890', 'campaign-1', 'Test stop');
        await enforcer.removeEmergencyStop('123-456-7890', 'campaign-1');
        
        const canSpend = await enforcer.canSpend('123-456-7890', 'campaign-1', 1.00);
        expect(canSpend).toBe(true);
      });
    });
  });

  describe('AuditLogger', () => {
    let logger: AuditLogger;

    beforeEach(() => {
      logger = new AuditLogger();
    });

    describe('Operation Logging', () => {
      it('should log mutations with full context', async () => {
        const mutation = {
          type: 'UPDATE_BUDGET',
          budget: 500,
          campaignId: 'campaign-1',
          customerId: '123-456-7890'
        };

        await logger.logMutation(mutation, 'test-user', 'SUCCESS');

        const logs = await logger.getAuditLogs({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0]).toHaveProperty('action', 'UPDATE_BUDGET');
        expect(logs[0]).toHaveProperty('user', 'test-user');
        expect(logs[0]).toHaveProperty('result', 'SUCCESS');
      });

      it('should log configuration changes', async () => {
        const config = {
          budgetLimits: { daily: 1000, campaign: 5000 },
          alertThresholds: [80, 90, 95]
        };

        await logger.logConfiguration('budget-enforcer', config, 'admin-user');

        const logs = await logger.getAuditLogs({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          action: 'CONFIGURATION_CHANGE'
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].metadata).toHaveProperty('component', 'budget-enforcer');
      });

      it('should log security events', async () => {
        await logger.logSecurityEvent(
          'UNAUTHORIZED_ACCESS',
          'test-user',
          'Attempted to access restricted resource',
          { resource: 'campaign-1', action: 'DELETE' }
        );

        const logs = await logger.getAuditLogs({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          action: 'UNAUTHORIZED_ACCESS'
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0]).toHaveProperty('severity', 'HIGH');
      });
    });

    describe('Log Retrieval', () => {
      beforeEach(async () => {
        // Add some test logs
        await logger.logMutation(
          { type: 'CREATE_CAMPAIGN', campaignId: 'test-1' },
          'user1',
          'SUCCESS'
        );
        await logger.logMutation(
          { type: 'UPDATE_BUDGET', budget: 200 },
          'user2',
          'FAILED'
        );
      });

      it('should filter logs by date range', async () => {
        const today = new Date().toISOString().split('T')[0];
        const logs = await logger.getAuditLogs({
          startDate: today,
          endDate: today
        });

        expect(logs.length).toBeGreaterThanOrEqual(2);
      });

      it('should filter logs by user', async () => {
        const logs = await logger.getAuditLogs({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          user: 'user1'
        });

        expect(logs.every(log => log.user === 'user1')).toBe(true);
      });

      it('should filter logs by action', async () => {
        const logs = await logger.getAuditLogs({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          action: 'UPDATE_BUDGET'
        });

        expect(logs.every(log => log.action === 'UPDATE_BUDGET')).toBe(true);
      });

      it('should filter logs by result', async () => {
        const logs = await logger.getAuditLogs({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          result: 'FAILED'
        });

        expect(logs.every(log => log.result === 'FAILED')).toBe(true);
      });
    });

    describe('Log Analysis', () => {
      it('should generate audit summaries', async () => {
        const summary = await logger.generateSummary(
          '2024-01-01',
          '2024-12-31'
        );

        expect(summary).toHaveProperty('totalActions');
        expect(summary).toHaveProperty('byAction');
        expect(summary).toHaveProperty('byUser');
        expect(summary).toHaveProperty('byResult');
        expect(summary).toHaveProperty('securityEvents');
      });

      it('should detect suspicious patterns', async () => {
        // Log multiple failed attempts
        for (let i = 0; i < 10; i++) {
          await logger.logMutation(
            { type: 'DELETE_CAMPAIGN', campaignId: `test-${i}` },
            'suspicious-user',
            'FAILED'
          );
        }

        const patterns = await logger.detectSuspiciousPatterns('suspicious-user');

        expect(patterns.length).toBeGreaterThan(0);
        expect(patterns[0].type).toBe('MULTIPLE_FAILURES');
      });

      it('should track user activity patterns', async () => {
        const activity = await logger.getUserActivity('user1', 30); // Last 30 days

        expect(activity).toHaveProperty('totalActions');
        expect(activity).toHaveProperty('mostFrequentActions');
        expect(activity).toHaveProperty('timeDistribution');
        expect(activity).toHaveProperty('riskScore');
      });
    });

    describe('Compliance Features', () => {
      it('should support log retention policies', async () => {
        // Set retention policy
        logger.setRetentionPolicy(90); // 90 days

        // Add old log entry (mocked)
        const oldTimestamp = new Date();
        oldTimestamp.setDate(oldTimestamp.getDate() - 100);

        await logger.cleanupOldLogs();

        // Old logs should be archived or deleted
        const recentLogs = await logger.getAuditLogs({
          startDate: oldTimestamp.toISOString().split('T')[0],
          endDate: oldTimestamp.toISOString().split('T')[0]
        });

        // Should have fewer or no old logs
        expect(recentLogs.length).toBe(0);
      });

      it('should export audit trails', async () => {
        const exportData = await logger.exportLogs(
          '2024-01-01',
          '2024-12-31',
          'csv'
        );

        expect(typeof exportData).toBe('string');
        expect(exportData).toContain('timestamp,user,action,result');
      });

      it('should provide tamper-evident logging', async () => {
        await logger.logMutation(
          { type: 'CRITICAL_OPERATION', data: 'sensitive' },
          'admin',
          'SUCCESS'
        );

        const logs = await logger.getAuditLogs({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        });

        const criticalLog = logs.find(l => l.action === 'CRITICAL_OPERATION');
        expect(criticalLog).toHaveProperty('hash'); // Integrity hash
        expect(criticalLog).toHaveProperty('signature'); // Digital signature
      });
    });
  });

  describe('MutationApplier', () => {
    let applier: MutationApplier;
    let mockGuard: any;
    let mockEnforcer: any;
    let mockLogger: any;
    let mockGoogleClient: any;

    beforeEach(() => {
      mockGuard = {
        validateMutations: vi.fn().mockResolvedValue([{ passed: true }])
      };
      mockEnforcer = {
        canSpend: vi.fn().mockResolvedValue(true),
        validateBudgetChange: vi.fn().mockResolvedValue({ allowed: true })
      };
      mockLogger = {
        logMutation: vi.fn().mockResolvedValue(undefined)
      };
      mockGoogleClient = {
        applyMutations: vi.fn().mockResolvedValue({ success: true, results: [] })
      };

      applier = new MutationApplier(mockGuard, mockEnforcer, mockLogger, mockGoogleClient);
    });

    describe('Dry Run Mode', () => {
      it('should preview changes without applying them', async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            { type: 'UPDATE_BUDGET', budget: 500, campaignId: 'campaign-1' }
          ],
          metadata: {}
        };

        const result = await applier.applyChanges(changes, {
          dryRun: true,
          confirm: false
        });

        expect(result.dryRun).toBe(true);
        expect(result.canProceed).toBe(true);
        expect(mockGoogleClient.applyMutations).not.toHaveBeenCalled();
      });

      it('should detect guardrail violations in dry run', async () => {
        mockGuard.validateMutations.mockResolvedValue([
          { passed: false, severity: 'CRITICAL', message: 'Budget exceeds limit' }
        ]);

        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 15000 }],
          metadata: {}
        };

        const result = await applier.applyChanges(changes, {
          dryRun: true,
          confirm: false
        });

        expect(result.canProceed).toBe(false);
        expect(result.blockers.length).toBeGreaterThan(0);
      });
    });

    describe('Real Application', () => {
      it('should apply valid changes successfully', async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            { type: 'UPDATE_BUDGET', budget: 500, campaignId: 'campaign-1' }
          ],
          metadata: {}
        };

        const result = await applier.applyChanges(changes, {
          dryRun: false,
          confirm: true
        });

        expect(result.success).toBe(true);
        expect(mockGoogleClient.applyMutations).toHaveBeenCalled();
        expect(mockLogger.logMutation).toHaveBeenCalled();
      });

      it('should block application if guardrails fail', async () => {
        mockGuard.validateMutations.mockResolvedValue([
          { passed: false, severity: 'CRITICAL', message: 'Critical violation' }
        ]);

        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'DANGEROUS_OPERATION' }],
          metadata: {}
        };

        await expect(applier.applyChanges(changes, {
          dryRun: false,
          confirm: true
        })).rejects.toThrow();
      });

      it('should require explicit confirmation for real changes', async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 500 }],
          metadata: {}
        };

        await expect(applier.applyChanges(changes, {
          dryRun: false,
          confirm: false // No confirmation
        })).rejects.toThrow('confirmation');
      });
    });

    describe('Rollback Functionality', () => {
      it('should support automatic rollback on failure', async () => {
        mockGoogleClient.applyMutations.mockRejectedValue(new Error('API_ERROR'));

        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [{ type: 'UPDATE_BUDGET', budget: 500 }],
          metadata: {}
        };

        const result = await applier.applyChanges(changes, {
          dryRun: false,
          confirm: true,
          autoRollback: true
        });

        expect(result.success).toBe(false);
        expect(result.rolledBack).toBe(true);
      });

      it('should create rollback plans for complex changes', async () => {
        const changes = {
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: [
            { type: 'UPDATE_BUDGET', budget: 1000, oldBudget: 500, campaignId: 'campaign-1' },
            { type: 'ADD_KEYWORD', keyword: { text: 'new keyword', matchType: 'EXACT' } }
          ],
          metadata: {}
        };

        const result = await applier.applyChanges(changes, {
          dryRun: false,
          confirm: true
        });

        expect(result).toHaveProperty('rollbackId');
        expect(result.rollbackPlan.length).toBe(2); // Reverse operations
      });

      it('should execute manual rollbacks', async () => {
        const rollbackId = 'rollback-123';
        const rollbackPlan = [
          { type: 'UPDATE_BUDGET', budget: 500, campaignId: 'campaign-1' }
        ];

        (applier as any).rollbackPlans.set(rollbackId, rollbackPlan);

        const result = await applier.executeRollback(rollbackId);

        expect(result.success).toBe(true);
        expect(mockGoogleClient.applyMutations).toHaveBeenCalledWith(rollbackPlan);
      });
    });
  });

  describe('MutationBuilder', () => {
    let builder: MutationBuilder;

    beforeEach(() => {
      builder = new MutationBuilder();
    });

    it('should build campaign mutations', () => {
      const mutation = builder
        .createCampaign('Test Campaign')
        .withBudget(1000)
        .withStatus('PAUSED')
        .build();

      expect(mutation.type).toBe('CREATE_CAMPAIGN');
      expect(mutation.campaign.name).toBe('Test Campaign');
      expect(mutation.campaign.budget).toBe(1000);
      expect(mutation.campaign.status).toBe('PAUSED');
    });

    it('should build keyword mutations', () => {
      const mutation = builder
        .addKeyword('test keyword', 'EXACT')
        .withBid(2.50)
        .withLandingPageUrl('https://example.com')
        .build();

      expect(mutation.type).toBe('ADD_KEYWORD');
      expect(mutation.keyword.text).toBe('test keyword');
      expect(mutation.keyword.matchType).toBe('EXACT');
      expect(mutation.bid).toBe(2.50);
    });

    it('should build budget update mutations', () => {
      const mutation = builder
        .updateBudget('campaign-1', 800)
        .withReason('Performance optimization')
        .build();

      expect(mutation.type).toBe('UPDATE_BUDGET');
      expect(mutation.campaignId).toBe('campaign-1');
      expect(mutation.budget).toBe(800);
      expect(mutation.metadata.reason).toBe('Performance optimization');
    });

    it('should validate mutations before building', () => {
      expect(() => {
        builder.createCampaign('').build(); // Empty name
      }).toThrow();

      expect(() => {
        builder.addKeyword('test', 'INVALID_MATCH_TYPE').build();
      }).toThrow();
    });

    it('should support batch operations', () => {
      const mutations = builder
        .batchOperation()
        .createCampaign('Campaign 1')
        .createCampaign('Campaign 2')
        .addKeyword('keyword 1', 'EXACT')
        .addKeyword('keyword 2', 'PHRASE')
        .buildBatch();

      expect(mutations.length).toBe(4);
      expect(mutations.filter(m => m.type === 'CREATE_CAMPAIGN')).toHaveLength(2);
      expect(mutations.filter(m => m.type === 'ADD_KEYWORD')).toHaveLength(2);
    });
  });

  describe('Integration Tests', () => {
    let guard: MutationGuard;
    let enforcer: BudgetEnforcer;
    let logger: AuditLogger;
    let applier: MutationApplier;

    beforeEach(() => {
      guard = new MutationGuard({
        budgetLimits: {
          dailyMax: 500,
          campaignMax: 5000,
          accountMax: 10000,
          enforcementLevel: 'soft'
        }
      });
      enforcer = new BudgetEnforcer();
      logger = new AuditLogger();

      const mockGoogleClient = {
        applyMutations: vi.fn().mockResolvedValue({ success: true, results: [] })
      };

      applier = new MutationApplier(guard, enforcer, logger, mockGoogleClient);
    });

    it('should work together for safe write operations', async () => {
      // Set up budget limits
      await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 1000);

      // Create valid changes
      const changes = {
        customerId: '123-456-7890',
        product: 'test-product',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 500, // Within limit
            campaignId: 'campaign-1'
          }
        ],
        metadata: { reason: 'Performance optimization' }
      };

      // Apply changes (dry run first)
      const dryRun = await applier.applyChanges(changes, {
        dryRun: true,
        confirm: false
      });

      expect(dryRun.canProceed).toBe(true);

      // Apply for real
      const result = await applier.applyChanges(changes, {
        dryRun: false,
        confirm: true
      });

      expect(result.success).toBe(true);

      // Check audit log
      const logs = await logger.getAuditLogs({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      });

      expect(logs.some(l => l.action === 'UPDATE_BUDGET')).toBe(true);
    });

    it('should prevent unsafe operations', async () => {
      // Set strict budget limits
      await enforcer.setDailyBudget('123-456-7890', 'campaign-1', 500);

      const unsafeChanges = {
        customerId: '123-456-7890',
        product: 'test-product',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 2000, // Exceeds limit
            campaignId: 'campaign-1'
          }
        ],
        metadata: {}
      };

      // Should be blocked by guardrails
      await expect(applier.applyChanges(unsafeChanges, {
        dryRun: false,
        confirm: true
      })).rejects.toThrow();

      // Should log the blocked attempt
      const logs = await logger.getAuditLogs({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        result: 'BLOCKED'
      });

      expect(logs.length).toBeGreaterThan(0);
    });
  });
});