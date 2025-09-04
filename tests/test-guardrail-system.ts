import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  MutationGuard,
  Mutation,
  GuardrailConfig,
  GuardrailResult
} from '../src/monitors/mutation-guard.js';
import { BudgetEnforcer } from '../src/monitors/budget-enforcer.js';
import { MutationBuilder, MutationApplier } from '../src/writers/mutation-applier.js';
import { AuditLogger } from '../src/monitors/audit-logger.js';

describe('Guardrail System', () => {
  describe('MutationGuard', () => {
    let guard: MutationGuard;
    
    beforeEach(() => {
      guard = new MutationGuard({
        budgetLimits: {
          dailyMax: 100,
          campaignMax: 50,
          accountMax: 500,
          enforcementLevel: 'hard'
        },
        deviceTargeting: {
          allowedDevices: ['DESKTOP'],
          enforceRestrictions: true
        },
        bidLimits: {
          maxCpcMicros: '5000000', // $5
          maxCpmMicros: '10000000', // $10
          enforceMaxBids: true
        }
      });
    });

    it('should pass valid mutation', async () => {
      const mutation: Mutation = {
        type: 'CREATE',
        resource: 'campaign',
        customerId: '123',
        changes: {
          name: 'Test Campaign',
          budgetMicros: '10000000', // $10
          deviceTargeting: {
            targetedDevices: ['DESKTOP']
          }
        },
        estimatedCost: 10
      };

      const result = await guard.validateMutation(mutation);
      
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block mutation exceeding budget limit', async () => {
      const mutation: Mutation = {
        type: 'CREATE',
        resource: 'campaign',
        customerId: '123',
        changes: {
          name: 'Expensive Campaign',
          budgetMicros: '200000000' // $200, exceeds daily max
        },
        estimatedCost: 200
      };

      const result = await guard.validateMutation(mutation);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'budget_limit')).toBe(true);
    });

    it('should block disallowed device targeting', async () => {
      const mutation: Mutation = {
        type: 'UPDATE',
        resource: 'campaign',
        entityId: 'campaign123',
        customerId: '123',
        changes: {
          deviceTargeting: {
            targetedDevices: ['MOBILE', 'TABLET'] // Not allowed
          }
        }
      };

      const result = await guard.validateMutation(mutation);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'device_targeting')).toBe(true);
      expect(result.modifications?.deviceTargeting?.targetedDevices).toEqual(['DESKTOP']);
    });

    it('should block excessive CPC bids', async () => {
      const mutation: Mutation = {
        type: 'CREATE',
        resource: 'keyword',
        customerId: '123',
        changes: {
          text: 'expensive keyword',
          matchType: 'EXACT',
          cpcBidMicros: '10000000' // $10, exceeds max of $5
        }
      };

      const result = await guard.validateMutation(mutation);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'bid_limit')).toBe(true);
      expect(result.modifications?.cpcBidMicros).toBe('5000000');
    });

    it('should block prohibited keywords', async () => {
      const mutation: Mutation = {
        type: 'CREATE',
        resource: 'keyword',
        customerId: '123',
        changes: {
          text: 'free chrome extension crack',
          matchType: 'BROAD'
        }
      };

      const result = await guard.validateMutation(mutation);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'prohibited_keyword')).toBe(true);
    });

    it('should check landing page health', async () => {
      const mutation: Mutation = {
        type: 'CREATE',
        resource: 'ad',
        customerId: '123',
        changes: {
          finalUrls: ['http://example.com/404-page']
        }
      };

      // Mock the landing page validator
      const mockValidator = vi.fn().mockResolvedValue([{
        url: 'http://example.com/404-page',
        status: 404,
        isHealthy: false,
        issues: ['Page not found (404)'],
        metrics: { has404: true }
      }]);

      (guard as any).landingPageValidator.checkHealth = mockValidator;

      const result = await guard.validateMutation(mutation);
      
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => 
        v.type === 'landing_page_health' && v.severity === 'critical'
      )).toBe(true);
    });

    it('should assess risk level correctly', async () => {
      const highRiskMutation: Mutation = {
        type: 'REMOVE',
        resource: 'campaign',
        entityId: 'important-campaign',
        customerId: '123',
        changes: {},
        estimatedCost: 150
      };

      const result = await guard.validateMutation(highRiskMutation);
      
      expect(result.estimatedImpact?.riskLevel).toBe('high');
    });

    it('should track mutation history', async () => {
      const mutation: Mutation = {
        type: 'CREATE',
        resource: 'ad_group',
        customerId: '123',
        changes: { name: 'Test Ad Group' }
      };

      await guard.validateMutation(mutation);
      const history = guard.getMutationHistory();
      
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject(mutation);
    });
  });

  describe('BudgetEnforcer', () => {
    let enforcer: BudgetEnforcer;
    
    beforeEach(() => {
      enforcer = new BudgetEnforcer({
        dailyMax: 100,
        campaignMax: 50,
        accountMax: 500,
        enforcementLevel: 'hard'
      });
    });

    it('should allow budget within limits', async () => {
      const result = await enforcer.validateBudget(10, 'campaign');
      
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should block budget exceeding daily limit', async () => {
      const result = await enforcer.validateBudget(150, 'campaign');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily budget limit exceeded');
      expect(result.severity).toBe('error');
      expect(result.suggestedAmount).toBe(100);
    });

    it('should warn when approaching limits', async () => {
      // Use 85% of daily budget
      enforcer.recordSpend(85);
      
      const result = await enforcer.validateBudget(5, 'campaign');
      
      expect(result.allowed).toBe(true);
      expect(result.warnings.some(w => w.includes('Approaching daily budget'))).toBe(true);
    });

    it('should track campaign-specific spend', async () => {
      enforcer.recordSpend(30, 'campaign-1');
      enforcer.recordSpend(20, 'campaign-1');
      
      const result = await enforcer.validateBudget(10, 'campaign', 'campaign-1');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Campaign budget limit exceeded');
      expect(result.severity).toBe('critical');
    });

    it('should reset daily tracking on new day', () => {
      enforcer.recordSpend(50);
      
      // Simulate new day by manipulating the internal tracking
      (enforcer as any).tracking.lastResetDate = '2023-01-01';
      (enforcer as any).resetDailyIfNeeded();
      
      const status = enforcer.getBudgetStatus();
      expect(status.daily.spent).toBe(0);
      expect(status.account.spent).toBe(50); // Account total persists
    });

    it('should provide accurate budget status', () => {
      enforcer.recordSpend(25, 'campaign-1');
      enforcer.recordSpend(15, 'campaign-2');
      
      const status = enforcer.getBudgetStatus();
      
      expect(status.daily.spent).toBe(40);
      expect(status.daily.remaining).toBe(60);
      expect(status.daily.percentUsed).toBe(40);
      expect(status.campaigns).toHaveLength(2);
      expect(status.campaigns[0].spent).toBe(25);
      expect(status.campaigns[1].spent).toBe(15);
    });
  });

  describe('MutationBuilder', () => {
    let builder: MutationBuilder;
    
    beforeEach(() => {
      builder = new MutationBuilder('customer-123');
    });

    it('should build campaign creation mutation', () => {
      builder.createCampaign({
        name: 'Test Campaign',
        budgetMicros: '50000000',
        status: 'ENABLED',
        targetLocations: ['US', 'CA']
      });

      const mutations = builder.build();
      
      expect(mutations).toHaveLength(1);
      expect(mutations[0].type).toBe('CREATE');
      expect(mutations[0].resource).toBe('campaign');
      expect(mutations[0].changes.name).toBe('Test Campaign');
      expect(mutations[0].estimatedCost).toBe(50);
    });

    it('should chain multiple mutations', () => {
      builder
        .createCampaign({ name: 'Campaign 1', budgetMicros: '10000000' })
        .createAdGroup({ campaignId: '123', name: 'Ad Group 1' })
        .addKeywords('456', [
          { text: 'keyword 1', matchType: 'EXACT' },
          { text: 'keyword 2', matchType: 'PHRASE' }
        ]);

      const mutations = builder.build();
      
      expect(mutations).toHaveLength(4); // 1 campaign + 1 ad group + 2 keywords
      expect(mutations.filter(m => m.resource === 'keyword')).toHaveLength(2);
    });

    it('should create responsive search ad mutation', () => {
      builder.createResponsiveSearchAd({
        adGroupId: 'ad-group-123',
        headlines: [
          { text: 'Best Chrome Extension' },
          { text: 'Download Now', pinning: 'FIRST' }
        ],
        descriptions: [
          { text: 'Enhance your browsing' },
          { text: 'Free and easy' }
        ],
        finalUrls: ['https://example.com'],
        path1: 'chrome',
        path2: 'extension'
      });

      const mutations = builder.build();
      
      expect(mutations).toHaveLength(1);
      expect(mutations[0].resource).toBe('ad');
      expect(mutations[0].changes.type).toBe('RESPONSIVE_SEARCH_AD');
      expect(mutations[0].changes.headlines).toHaveLength(2);
    });

    it('should handle campaign state changes', () => {
      builder
        .pauseCampaign('campaign-1')
        .enableCampaign('campaign-2');

      const mutations = builder.build();
      
      expect(mutations).toHaveLength(2);
      expect(mutations[0].changes.status).toBe('PAUSED');
      expect(mutations[1].changes.status).toBe('ENABLED');
    });
  });

  describe('MutationApplier', () => {
    let applier: MutationApplier;
    
    beforeEach(() => {
      applier = new MutationApplier();
    });

    it('should perform dry run successfully', async () => {
      const changes = {
        customerId: '123',
        product: 'test-product',
        mutations: [
          {
            type: 'CREATE' as const,
            resource: 'campaign' as const,
            changes: {
              name: 'Test Campaign',
              budgetMicros: '10000000'
            },
            priority: 1
          }
        ],
        metadata: {
          plannedAt: new Date().toISOString(),
          plannedBy: 'test-user',
          description: 'Test mutations'
        }
      };

      // Mock the guardrail validation
      const mockValidate = vi.fn().mockResolvedValue({
        passed: true,
        violations: [],
        warnings: ['Test warning'],
        estimatedImpact: { riskLevel: 'low' }
      });
      (applier as any).mutationGuard.validateMutation = mockValidate;

      // Mock the Google Ads client
      const mockGetCampaigns = vi.fn().mockResolvedValue([]);
      (applier as any).googleAdsClient.getCampaigns = mockGetCampaigns;

      const result = await applier.applyChanges(changes, { 
        dryRun: true, 
        confirm: false 
      }) as any;

      expect(result.canProceed).toBe(true);
      expect(result.guardrailResults).toHaveLength(1);
      expect(result.warnings).toContain('Test warning');
      expect(result.estimatedChanges.campaigns).toBe(1);
      expect(result.estimatedChanges.budgetChange).toBe(10);
    });

    it('should block dry run with guardrail violations', async () => {
      const changes = {
        customerId: '123',
        product: 'test-product',
        mutations: [
          {
            type: 'CREATE' as const,
            resource: 'campaign' as const,
            changes: {
              name: 'Bad Campaign',
              budgetMicros: '1000000000' // $1000, too high
            },
            priority: 1
          }
        ],
        metadata: {
          plannedAt: new Date().toISOString(),
          plannedBy: 'test-user',
          description: 'Test mutations'
        }
      };

      // Mock guardrail rejection
      const mockValidate = vi.fn().mockResolvedValue({
        passed: false,
        violations: [{
          type: 'budget_limit',
          severity: 'critical',
          message: 'Budget exceeds limit'
        }],
        warnings: [],
        estimatedImpact: { riskLevel: 'high' }
      });
      (applier as any).mutationGuard.validateMutation = mockValidate;

      const result = await applier.applyChanges(changes, { 
        dryRun: true, 
        confirm: false 
      }) as any;

      expect(result.canProceed).toBe(false);
      expect(result.blockers).toContain('Budget exceeds limit');
    });

    it('should require confirmation for actual mutations', async () => {
      const changes = {
        customerId: '123',
        product: 'test-product',
        mutations: [],
        metadata: {
          plannedAt: new Date().toISOString(),
          plannedBy: 'test-user',
          description: 'Test mutations'
        }
      };

      await expect(
        applier.applyChanges(changes, { 
          dryRun: false, 
          confirm: false 
        })
      ).rejects.toThrow('Confirmation required');
    });

    it('should track rollback capability', async () => {
      const changes = {
        customerId: '123',
        product: 'test-product',
        mutations: [
          {
            type: 'CREATE' as const,
            resource: 'campaign' as const,
            changes: { name: 'Test Campaign' },
            priority: 1
          }
        ],
        metadata: {
          plannedAt: new Date().toISOString(),
          plannedBy: 'test-user',
          description: 'Test mutations'
        }
      };

      // Mock successful mutation
      const mockValidate = vi.fn().mockResolvedValue({
        passed: true,
        violations: [],
        warnings: []
      });
      (applier as any).mutationGuard.validateMutation = mockValidate;

      const mockApply = vi.fn().mockResolvedValue({
        resourceName: 'customers/123/campaigns/456'
      });
      (applier as any).applyMutation = mockApply;

      const mockAuditLog = vi.fn().mockResolvedValue(undefined);
      (applier as any).auditLogger.logMutation = mockAuditLog;

      const result = await applier.applyChanges(changes, { 
        dryRun: false, 
        confirm: true,
        skipGuardrails: false
      }) as any;

      expect(result.success).toBe(true);
      expect(result.rollbackAvailable).toBe(true);
      expect(result.rollbackId).toBeDefined();
      expect(result.summary.succeeded).toBe(1);
    });
  });

  describe('AuditLogger', () => {
    let auditLogger: AuditLogger;
    
    beforeEach(() => {
      auditLogger = new AuditLogger(30); // 30 day retention
    });

    it('should log mutation events', async () => {
      await auditLogger.logMutation({
        mutation: {
          type: 'CREATE',
          resource: 'campaign',
          customerId: '123'
        },
        result: 'success',
        timestamp: new Date().toISOString(),
        user: 'test-user'
      });

      const logs = await auditLogger.getAuditLogs({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString()
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('mutation');
      expect(logs[0].user).toBe('test-user');
    });

    it('should generate audit summary', async () => {
      // Log some events
      await auditLogger.logMutation({
        mutation: { type: 'CREATE', resource: 'campaign', customerId: '123' },
        result: 'success',
        timestamp: new Date().toISOString(),
        user: 'user1'
      });

      await auditLogger.logMutation({
        mutation: { type: 'UPDATE', resource: 'ad_group', customerId: '123' },
        result: 'failed',
        error: 'Permission denied',
        timestamp: new Date().toISOString(),
        user: 'user2'
      });

      const summary = await auditLogger.generateSummary(
        new Date(Date.now() - 86400000).toISOString(),
        new Date().toISOString()
      );

      expect(summary.totalActions).toBe(2);
      expect(summary.totalMutations).toBe(2);
      expect(summary.successRate).toBe(50);
      expect(summary.activeUsers).toContain('user1');
      expect(summary.activeUsers).toContain('user2');
      expect(summary.errors).toHaveLength(1);
    });

    it('should filter audit logs by criteria', async () => {
      // Log various events
      await auditLogger.logMutation({
        mutation: { resource: 'campaign', type: 'CREATE', customerId: '123' },
        result: 'success',
        timestamp: new Date().toISOString(),
        user: 'user1'
      });

      await auditLogger.logValidation({
        resource: 'ad_group',
        validationResult: { passed: true },
        user: 'user2'
      });

      const filteredLogs = await auditLogger.getAuditLogs({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        user: 'user1',
        action: 'mutation'
      });

      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].user).toBe('user1');
      expect(filteredLogs[0].action).toBe('mutation');
    });
  });
});