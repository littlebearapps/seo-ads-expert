import { describe, it, expect, beforeEach } from 'vitest';
import { MutationGuard } from '../src/monitors/mutation-guard.js';
import { BudgetEnforcer } from '../src/monitors/budget-enforcer.js';
import { AuditLogger } from '../src/monitors/audit-logger.js';

describe('Integration Tests - Cross-Component Workflows', () => {
  let mutationGuard: MutationGuard;
  let budgetEnforcer: BudgetEnforcer;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    // Initialize components with conservative limits for testing
    mutationGuard = new MutationGuard({
      budgetLimits: {
        dailyMax: 20, // $20 daily
        campaignMax: 100, // $100 per campaign
        accountMax: 500, // $500 total
        enforcementLevel: 'hard'
      },
      bidLimits: {
        maxCpcMicros: '2000000', // $2 max CPC
        maxCpmMicros: '5000000', // $5 max CPM
        enforceMaxBids: true
      }
    });

    budgetEnforcer = new BudgetEnforcer({
      dailyMax: 20,
      campaignMax: 100,
      accountMax: 500,
      enforcementLevel: 'hard'
    });

    auditLogger = new AuditLogger();
  });

  describe('Budget Validation Workflow', () => {
    it('should validate complete budget mutation workflow', async () => {
      // Test Case 1: Valid budget update within limits
      const validMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-test-1',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '15000000' // $15, within daily limit
        },
        estimatedCost: 15
      };

      const result = await mutationGuard.validateMutation(validMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.estimatedImpact?.costIncrease).toBe(15);
      expect(result.estimatedImpact?.riskLevel).toBe('low');
    });

    it('should reject budget mutations exceeding daily limits', async () => {
      // Test Case 2: Budget update exceeding daily limit
      const exceededMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-test-2',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '25000000' // $25, exceeds $20 daily limit
        },
        estimatedCost: 25
      };

      const result = await mutationGuard.validateMutation(exceededMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('budget_limit');
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[0].message).toContain('Daily budget limit exceeded');
      expect(result.violations[0].suggestedValue).toBe(20);
      expect(result.estimatedImpact?.riskLevel).toBe('medium');
    });

    it('should provide warnings when approaching budget limits', async () => {
      // Test Case 3: Budget update approaching limits (should warn but allow)
      const approachingMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-test-3',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '18000000' // $18, 90% of $20 limit
        },
        estimatedCost: 18
      };

      const result = await mutationGuard.validateMutation(approachingMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Approaching daily budget limit');
      expect(result.estimatedImpact?.costIncrease).toBe(18);
    });
  });

  describe('Landing Page Validation Workflow', () => {
    it('should validate landing page URL mutations', async () => {
      const landingPageMutation = {
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: 'ad-test-1',
        customerId: 'customer-123',
        changes: {
          finalUrls: ['https://example.com/'], // Use root example.com which should be accessible
          headlines: ['Test Ad Headline']
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(landingPageMutation);

      expect(result).toBeDefined();
      // Landing page validation will check actual URL accessibility
      // If example.com is accessible, it should pass; if not, it should fail with landing_page_health violation
      if (result.passed) {
        expect(result.violations).toHaveLength(0);
        expect(result.estimatedImpact?.riskLevel).toBe('low');
      } else {
        // If it fails, it should be due to landing page health issues
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].type).toBe('landing_page_health');
      }
    });

    it('should warn about non-HTTPS landing pages', async () => {
      const httpMutation = {
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: 'ad-test-2',
        customerId: 'customer-123',
        changes: {
          finalUrls: ['http://example.com/'], // HTTP, not HTTPS - use root URL
          headlines: ['Test Ad Headline']
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(httpMutation);

      expect(result).toBeDefined();
      // Should still pass but with warnings about SSL
      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Not using HTTPS'))).toBe(true);
    });
  });

  describe('Bid Validation Workflow', () => {
    it('should validate CPC bid limits', async () => {
      const highBidMutation = {
        type: 'UPDATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-test-1',
        customerId: 'customer-123',
        changes: {
          cpcBidMicros: '3000000' // $3, exceeds $2 max CPC limit
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(highBidMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('bid_limit');
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[0].message).toContain('CPC bid exceeds maximum');
      expect(result.violations[0].suggestedValue).toBe('2000000');
      expect(result.modifications).toHaveProperty('cpcBidMicros', '2000000');
    });

    it('should allow valid CPC bids within limits', async () => {
      const validBidMutation = {
        type: 'UPDATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-test-2',
        customerId: 'customer-123',
        changes: {
          cpcBidMicros: '1500000' // $1.50, within $2 max CPC limit
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(validBidMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.estimatedImpact?.riskLevel).toBe('low');
    });
  });

  describe('Device Targeting Validation Workflow', () => {
    it('should enforce device targeting restrictions', async () => {
      const disallowedDeviceMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-test-4',
        customerId: 'customer-123',
        changes: {
          deviceTargeting: {
            targetedDevices: ['DESKTOP', 'MOBILE', 'TABLET'] // MOBILE and TABLET not allowed by default config
          }
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(disallowedDeviceMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('device_targeting');
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[0].message).toContain('Targeting disallowed devices');
      expect(result.modifications).toHaveProperty('deviceTargeting');
      expect(result.modifications!.deviceTargeting).toEqual({
        targetedDevices: ['DESKTOP']
      });
    });

    it('should allow valid device targeting', async () => {
      const validDeviceMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-test-5',
        customerId: 'customer-123',
        changes: {
          deviceTargeting: {
            targetedDevices: ['DESKTOP'] // Only allowed device
          }
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(validDeviceMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Negative Keywords Validation Workflow', () => {
    it('should block prohibited keyword terms', async () => {
      const prohibitedKeywordMutation = {
        type: 'CREATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-test-3',
        customerId: 'customer-123',
        changes: {
          text: 'free chrome extension download', // Contains prohibited term "free"
          matchType: 'BROAD'
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(prohibitedKeywordMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('prohibited_keyword');
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[0].message).toContain('Keyword contains prohibited term');
      expect(result.violations[0].message).toContain('free');
    });

    it('should allow clean keywords', async () => {
      const cleanKeywordMutation = {
        type: 'CREATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-test-4',
        customerId: 'customer-123',
        changes: {
          text: 'chrome extension development', // Clean keyword
          matchType: 'EXACT'
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(cleanKeywordMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should warn about missing negative keyword lists for campaigns', async () => {
      const campaignWithoutNegativesMutation = {
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-test-6',
        customerId: 'customer-123',
        changes: {
          name: 'Test Campaign',
          status: 'ENABLED'
          // Missing sharedNegativeListIds
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(campaignWithoutNegativesMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('shared negative keyword list'))).toBe(true);
    });
  });

  describe('Multi-Component Risk Assessment', () => {
    it('should assess cumulative risk across multiple violations', async () => {
      // Complex mutation with multiple risk factors
      const complexMutation = {
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-high-risk',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '25000000', // $25, exceeds daily limit
          deviceTargeting: {
            targetedDevices: ['DESKTOP', 'MOBILE'] // MOBILE not allowed
          },
          finalUrls: ['http://example.com/'] // Non-HTTPS
        },
        estimatedCost: 25
      };

      const result = await mutationGuard.validateMutation(complexMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1); // Multiple violations
      expect(result.estimatedImpact?.riskLevel).toBe('high'); // High risk due to multiple issues
      
      // Check for budget violation
      expect(result.violations.some(v => v.type === 'budget_limit')).toBe(true);
      // Check for device targeting violation
      expect(result.violations.some(v => v.type === 'device_targeting')).toBe(true);
      
      // Should have warnings about HTTPS
      expect(result.warnings.some(w => w.includes('Not using HTTPS'))).toBe(true);
    });

    it('should maintain mutation history for audit purposes', async () => {
      const mutation1 = {
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-history-1',
        customerId: 'customer-123',
        changes: { name: 'Campaign 1' },
        estimatedCost: 5
      };

      const mutation2 = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-history-2',
        customerId: 'customer-123',
        changes: { name: 'Campaign 2' },
        estimatedCost: 8
      };

      // Apply mutations
      await mutationGuard.validateMutation(mutation1);
      await mutationGuard.validateMutation(mutation2);

      // Check history
      const history = mutationGuard.getMutationHistory();
      expect(history).toHaveLength(2);
      expect(history[0].entityId).toBe('campaign-history-1');
      expect(history[1].entityId).toBe('campaign-history-2');
    });

    it('should allow clearing mutation history', async () => {
      const mutation = {
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-clear-test',
        customerId: 'customer-123',
        changes: { name: 'Test Campaign' },
        estimatedCost: 1
      };

      await mutationGuard.validateMutation(mutation);
      expect(mutationGuard.getMutationHistory()).toHaveLength(1);

      mutationGuard.clearHistory();
      expect(mutationGuard.getMutationHistory()).toHaveLength(0);
    });
  });

  describe('Budget Enforcer Integration', () => {
    it('should track spend and validate budget constraints', async () => {
      const validationResult = await budgetEnforcer.validateBudget(15, 'campaign', 'campaign-test-1');

      expect(validationResult).toBeDefined();
      expect(validationResult.allowed).toBe(true);
      expect(validationResult.currentSpend).toBe(0); // No previous spend
      expect(validationResult.proposedSpend).toBe(15);
      expect(validationResult.limit).toBe(20);
      expect(validationResult.warnings).toHaveLength(0); // Within limits

      // Record the spend
      budgetEnforcer.recordSpend(15, 'campaign-test-1');

      // Check status after recording
      const status = budgetEnforcer.getBudgetStatus();
      expect(status.daily.spent).toBe(15);
      expect(status.account.spent).toBe(15);
    });

    it('should reject spend when daily limit is exceeded', async () => {
      // First, use up most of the budget
      budgetEnforcer.recordSpend(18); // $18 of $20 daily limit used

      // Try to spend more than remaining budget
      const validationResult = await budgetEnforcer.validateBudget(5, 'campaign', 'campaign-test-2');

      expect(validationResult).toBeDefined();
      expect(validationResult.allowed).toBe(false);
      expect(validationResult.severity).toBe('error');
      expect(validationResult.reason).toContain('Daily budget limit exceeded');
      expect(validationResult.currentSpend).toBe(18);
      expect(validationResult.proposedSpend).toBe(23); // 18 + 5
      expect(validationResult.suggestedAmount).toBe(2); // Only $2 remaining
    });
  });

  describe('Audit Logger Integration', () => {
    it('should log mutation operations with full context', async () => {
      const mutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-audit-test',
        customerId: 'customer-123',
        changes: { name: 'Audited Campaign' },
        estimatedCost: 10
      };

      // Log the mutation
      await auditLogger.logMutation({
        user: 'test-user@example.com',
        mutation,
        result: 'success',
        timestamp: new Date().toISOString(),
        metadata: {
          component: 'mutation-guard',
          guardResult: 'allowed'
        }
      });

      // Retrieve logs (may include logs from other tests)
      const logs = await auditLogger.getAuditLogs({
        startDate: new Date(Date.now() - 60000).toISOString(), // Last minute
        endDate: new Date().toISOString()
      });

      // Find our specific log entry
      const ourLog = logs.find(log => 
        log.user === 'test-user@example.com' && 
        log.entityId === 'campaign-audit-test'
      );

      expect(logs.length).toBeGreaterThan(0);
      expect(ourLog).toBeDefined();
      expect(ourLog).toHaveProperty('user', 'test-user@example.com');
      expect(ourLog).toHaveProperty('action', 'mutation');
      expect(ourLog).toHaveProperty('resource', 'campaign');
      expect(ourLog).toHaveProperty('entityId', 'campaign-audit-test');
      expect(ourLog).toHaveProperty('result', 'success');
    });

    it('should generate audit summaries', async () => {
      // Log multiple mutation operations
      const mutations = [
        { user: 'user1', result: 'success', resource: 'campaign', entityId: 'camp-1' },
        { user: 'user1', result: 'failed', resource: 'keyword', entityId: 'kw-1' },
        { user: 'user2', result: 'success', resource: 'ad', entityId: 'ad-1' }
      ];

      for (const mut of mutations) {
        await auditLogger.logMutation({
          user: mut.user,
          mutation: {
            type: 'CREATE',
            resource: mut.resource,
            entityId: mut.entityId,
            customerId: 'customer-123',
            changes: { test: true }
          },
          result: mut.result as any,
          timestamp: new Date().toISOString(),
          metadata: { test: true }
        });
      }

      // Generate summary
      const summary = await auditLogger.generateSummary(
        new Date(Date.now() - 60000).toISOString(),
        new Date().toISOString()
      );

      expect(summary).toHaveProperty('totalActions');
      expect(summary).toHaveProperty('period');
      expect(summary.totalActions).toBeGreaterThan(0);
    });
  });
});