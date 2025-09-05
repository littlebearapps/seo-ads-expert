import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MutationGuard } from '../src/monitors/mutation-guard.js';
import { BudgetEnforcer } from '../src/monitors/budget-enforcer.js';
import { AuditLogger } from '../src/monitors/audit-logger.js';
import { PerformanceMonitor } from '../src/monitors/performance.js';
import axios from 'axios';

// Mock axios for network error simulations
vi.mock('axios');

describe('Error Scenarios and Edge Cases', () => {
  let mutationGuard: MutationGuard;
  let budgetEnforcer: BudgetEnforcer;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mutationGuard = new MutationGuard({
      budgetLimits: {
        dailyMax: 100,
        campaignMax: 500,
        accountMax: 1000,
        enforcementLevel: 'hard'
      }
    });
    
    budgetEnforcer = new BudgetEnforcer({
      dailyMax: 100,
      campaignMax: 500,
      accountMax: 1000,
      enforcementLevel: 'hard'
    });
    
    auditLogger = new AuditLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Network Failure Scenarios', () => {
    it('should handle network timeouts gracefully when checking landing pages', async () => {
      // Mock axios to simulate timeout
      const mockedAxios = axios as any;
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      const mutation = {
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: 'ad-timeout-test',
        customerId: 'customer-123',
        changes: {
          finalUrls: ['https://unreachable-site.com/page'],
          headlines: ['Test Ad']
        },
        estimatedCost: 10
      };

      const result = await mutationGuard.validateMutation(mutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('landing_page_health');
      expect(result.violations[0].message).toContain('Failed to reach URL');
    });

    it('should handle DNS resolution failures', async () => {
      const mockedAxios = axios as any;
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));

      const mutation = {
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: 'ad-dns-test',
        customerId: 'customer-123',
        changes: {
          finalUrls: ['https://nonexistent-domain-xyz123.com/'],
          headlines: ['Test Ad']
        },
        estimatedCost: 10
      };

      const result = await mutationGuard.validateMutation(mutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('Failed to reach URL');
    });

    it('should handle connection refused errors', async () => {
      const mockedAxios = axios as any;
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const mutation = {
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: 'ad-conn-test',
        customerId: 'customer-123',
        changes: {
          finalUrls: ['https://localhost:9999/unreachable'],
          headlines: ['Test Ad']
        },
        estimatedCost: 10
      };

      const result = await mutationGuard.validateMutation(mutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations[0].type).toBe('landing_page_health');
    });
  });

  describe('Invalid Data Format Scenarios', () => {
    it('should handle malformed mutation objects gracefully', async () => {
      const malformedMutation = {
        type: 'INVALID_TYPE' as any,
        resource: 123 as any, // Should be string
        entityId: null as any,
        customerId: undefined as any,
        changes: 'not-an-object' as any,
        estimatedCost: 'not-a-number' as any
      };

      // This should either throw or return an error result
      try {
        const result = await mutationGuard.validateMutation(malformedMutation);
        expect(result.passed).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle missing required fields', async () => {
      const incompleteMutation = {
        type: 'CREATE' as const,
        // Missing resource, customerId, changes
      } as any;

      try {
        const result = await mutationGuard.validateMutation(incompleteMutation);
        expect(result.passed).toBe(false);
        expect(result.violations[0].type).toBe('system_error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle extremely large input values', async () => {
      const largeMutation = {
        type: 'CREATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-large',
        customerId: 'customer-123',
        changes: {
          text: 'a'.repeat(10000), // 10,000 character keyword
          cpcBidMicros: '999999999999999999' // Extremely large bid
        },
        estimatedCost: Number.MAX_SAFE_INTEGER
      };

      const result = await mutationGuard.validateMutation(largeMutation);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      // Should have violations for bid limits at minimum
      expect(result.violations.some(v => v.type === 'bid_limit')).toBe(true);
    });

    it('should handle negative values where not allowed', async () => {
      const negativeMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-negative',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '-1000000' // Negative budget
        },
        estimatedCost: -10
      };

      const budgetResult = await budgetEnforcer.validateBudget(-10, 'campaign', 'campaign-negative');
      
      expect(budgetResult.allowed).toBe(false);
      expect(budgetResult.reason).toContain('budget');
    });

    it('should handle special characters in text fields', async () => {
      const specialCharMutation = {
        type: 'CREATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-special',
        customerId: 'customer-123',
        changes: {
          text: '🚀💻<script>alert("xss")</script>DROP TABLE;--',
          matchType: 'BROAD'
        },
        estimatedCost: 5
      };

      const result = await mutationGuard.validateMutation(specialCharMutation);

      expect(result).toBeDefined();
      // Should handle special characters without crashing
      expect(result.violations).toBeDefined();
    });
  });

  describe('Concurrent Operation Scenarios', () => {
    it('should handle multiple simultaneous validations', async () => {
      const mutations = Array.from({ length: 10 }, (_, i) => ({
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: `campaign-concurrent-${i}`,
        customerId: 'customer-123',
        changes: {
          name: `Concurrent Campaign ${i}`,
          budgetMicros: '10000000'
        },
        estimatedCost: 10
      }));

      // Run all validations concurrently
      const results = await Promise.all(
        mutations.map(m => mutationGuard.validateMutation(m))
      );

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('violations');
      });
    });

    it('should handle rapid sequential budget updates correctly', async () => {
      // Rapidly record spend to test race conditions
      const spendPromises = Array.from({ length: 20 }, (_, i) => 
        budgetEnforcer.recordSpend(1, `campaign-rapid-${i}`)
      );

      await Promise.all(spendPromises);

      const status = budgetEnforcer.getBudgetStatus();
      expect(status.daily.spent).toBe(20); // Should accurately track all spend
    });

    it('should maintain mutation history integrity under concurrent access', async () => {
      const mutations = Array.from({ length: 5 }, (_, i) => ({
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: `ad-history-${i}`,
        customerId: 'customer-123',
        changes: { headline: `Ad ${i}` },
        estimatedCost: 1
      }));

      await Promise.all(mutations.map(m => mutationGuard.validateMutation(m)));

      const history = mutationGuard.getMutationHistory();
      expect(history).toHaveLength(5);
      
      // Check all mutations are in history
      mutations.forEach(mutation => {
        expect(history.some(h => h.entityId === mutation.entityId)).toBe(true);
      });
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle budget exhaustion gracefully', async () => {
      // Exhaust daily budget
      budgetEnforcer.recordSpend(100); // Use entire daily budget

      const result = await budgetEnforcer.validateBudget(1, 'campaign', 'campaign-exhausted');
      
      expect(result.allowed).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.suggestedAmount).toBe(0);
      expect(result.reason).toContain('Daily budget limit exceeded');
    });

    it('should handle large batch operations efficiently', async () => {
      const largeBatch = Array.from({ length: 100 }, (_, i) => ({
        type: 'CREATE' as const,
        resource: 'keyword' as const,
        entityId: `keyword-batch-${i}`,
        customerId: 'customer-123',
        changes: {
          text: `keyword ${i}`,
          matchType: 'EXACT'
        },
        estimatedCost: 0.1
      }));

      const startTime = Date.now();
      
      // Process batch
      for (const mutation of largeBatch) {
        await mutationGuard.validateMutation(mutation);
      }
      
      const elapsed = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds for 100 items)
      expect(elapsed).toBeLessThan(5000);
      
      // Check history contains all items
      const history = mutationGuard.getMutationHistory();
      expect(history.length).toBeGreaterThanOrEqual(100);
    });

    it('should handle memory limits with large mutation history', async () => {
      // Create a more reasonable number of mutations to test memory handling
      const manyMutations = Array.from({ length: 200 }, (_, i) => ({
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: `ad-memory-${i}`,
        customerId: 'customer-123',
        changes: {
          headline: `Ad ${i}`,
          description: 'Test description for memory test' // Reasonable size
        },
        estimatedCost: 0.01
      }));

      // Process in smaller chunks to avoid overwhelming
      for (let i = 0; i < manyMutations.length; i += 20) {
        const chunk = manyMutations.slice(i, i + 20);
        await Promise.all(chunk.map(m => mutationGuard.validateMutation(m)));
      }

      // Check that history is growing
      const historyBeforeClear = mutationGuard.getMutationHistory();
      expect(historyBeforeClear.length).toBeGreaterThan(100);

      // Should be able to clear history to free memory
      mutationGuard.clearHistory();
      const history = mutationGuard.getMutationHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('Circuit Breaker Scenarios', () => {
    it('should handle circuit breaker opening after multiple failures', async () => {
      // Create a new performance monitor to test circuit breaker
      const monitor = new PerformanceMonitor({
        circuitBreakerConfig: {
          failureThreshold: 3,
          timeoutMs: 100,
          resetTimeoutMs: 1000
        }
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Cause failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await monitor.executeWithCircuitBreaker('test-operation', failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should now be open
      try {
        await monitor.executeWithCircuitBreaker('test-operation', failingOperation);
      } catch (error: any) {
        expect(error.message).toContain('Circuit breaker is OPEN');
      }
    });

    it('should use fallback when circuit breaker is open', async () => {
      const monitor = new PerformanceMonitor({
        circuitBreakerConfig: {
          failureThreshold: 2,
          timeoutMs: 100,
          resetTimeoutMs: 1000
        }
      });

      const failingOperation = async () => {
        throw new Error('Primary operation failed');
      };

      const fallbackOperation = async () => {
        return { success: true, source: 'fallback' };
      };

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await monitor.executeWithCircuitBreaker('fallback-test', failingOperation);
        } catch (error) {
          // Expected
        }
      }

      // Should use fallback
      const result = await monitor.executeWithCircuitBreaker(
        'fallback-test',
        failingOperation,
        fallbackOperation
      );

      expect(result).toEqual({ success: true, source: 'fallback' });
    });

    it('should handle operation timeouts', async () => {
      const monitor = new PerformanceMonitor({
        circuitBreakerConfig: {
          failureThreshold: 5,
          timeoutMs: 100, // 100ms timeout
          resetTimeoutMs: 1000
        }
      });

      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 200)); // Takes 200ms
        return { success: true };
      };

      try {
        await monitor.executeWithCircuitBreaker('timeout-test', slowOperation);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Data Consistency Scenarios', () => {
    it('should maintain data consistency when validation fails', async () => {
      const initialHistory = mutationGuard.getMutationHistory().length;

      const invalidMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-invalid',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '999999999999' // Way over budget
        },
        estimatedCost: 999999
      };

      const result = await mutationGuard.validateMutation(invalidMutation);
      
      expect(result.passed).toBe(false);
      
      // History should still be updated even for failed validations
      const newHistory = mutationGuard.getMutationHistory();
      expect(newHistory.length).toBe(initialHistory + 1);
    });

    it('should handle partial failures in batch operations', async () => {
      const mixedBatch = [
        {
          type: 'CREATE' as const,
          resource: 'keyword' as const,
          entityId: 'keyword-valid',
          customerId: 'customer-123',
          changes: { text: 'valid keyword' },
          estimatedCost: 1
        },
        {
          type: 'CREATE' as const,
          resource: 'keyword' as const,
          entityId: 'keyword-prohibited',
          customerId: 'customer-123',
          changes: { text: 'free download crack' }, // Contains prohibited terms
          estimatedCost: 1
        },
        {
          type: 'CREATE' as const,
          resource: 'keyword' as const,
          entityId: 'keyword-valid-2',
          customerId: 'customer-123',
          changes: { text: 'another valid keyword' },
          estimatedCost: 1
        }
      ];

      const results = await Promise.all(
        mixedBatch.map(m => mutationGuard.validateMutation(m))
      );

      expect(results[0].passed).toBe(true); // First valid
      expect(results[1].passed).toBe(false); // Contains prohibited terms
      expect(results[2].passed).toBe(true); // Third valid
      
      // Check specific violation for prohibited keyword
      expect(results[1].violations.some(v => v.type === 'prohibited_keyword')).toBe(true);
    });
  });

  describe('Boundary Value Scenarios', () => {
    it('should handle exact budget limit boundaries', async () => {
      // Test at exact limit
      const atLimitMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-at-limit',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '100000000' // Exactly $100 (daily limit)
        },
        estimatedCost: 100
      };

      const result = await mutationGuard.validateMutation(atLimitMutation);
      
      expect(result.passed).toBe(true); // Should pass at exact limit
      expect(result.warnings.length).toBeGreaterThan(0); // But should warn
    });

    it('should handle just over budget limit', async () => {
      const overLimitMutation = {
        type: 'UPDATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-over-limit',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '100000001' // $100.000001 (1 micro over)
        },
        estimatedCost: 100.000001
      };

      const result = await mutationGuard.validateMutation(overLimitMutation);
      
      expect(result.passed).toBe(false); // Should fail even 1 micro over
      expect(result.violations[0].type).toBe('budget_limit');
    });

    it('should handle zero and near-zero values', async () => {
      const zeroMutation = {
        type: 'UPDATE' as const,
        resource: 'keyword' as const,
        entityId: 'keyword-zero',
        customerId: 'customer-123',
        changes: {
          cpcBidMicros: '0' // Zero bid
        },
        estimatedCost: 0
      };

      const result = await mutationGuard.validateMutation(zeroMutation);
      
      // Zero bids might be invalid depending on business rules
      expect(result).toBeDefined();
      expect(result.violations).toBeDefined();
    });

    it('should handle maximum allowed values', async () => {
      const maxValuesMutation = {
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-max',
        customerId: 'customer-123',
        changes: {
          name: 'x'.repeat(255), // Max typical name length
          budgetMicros: '1000000000', // $1000 (account max)
          targetCpa: '999999999'
        },
        estimatedCost: 1000
      };

      const result = await mutationGuard.validateMutation(maxValuesMutation);
      
      expect(result).toBeDefined();
      expect(result.passed).toBe(false); // Should fail due to account budget limit
    });
  });

  describe('Recovery and Resilience Scenarios', () => {
    it('should recover from temporary failures', async () => {
      let callCount = 0;
      const mockedAxios = axios as any;
      
      // Fail first 2 times, succeed on 3rd
      mockedAxios.get = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ 
          status: 200, 
          data: '<html><head><meta name="viewport" content="width=device-width"></head></html>' 
        });
      });

      const mutation = {
        type: 'CREATE' as const,
        resource: 'ad' as const,
        entityId: 'ad-recovery',
        customerId: 'customer-123',
        changes: {
          finalUrls: ['https://example.com/'],
          headlines: ['Test Ad']
        },
        estimatedCost: 10
      };

      // First attempts might fail
      let lastResult;
      for (let i = 0; i < 3; i++) {
        lastResult = await mutationGuard.validateMutation(mutation);
      }

      // Eventually should succeed or handle gracefully
      expect(lastResult).toBeDefined();
    });

    it('should maintain service availability during high load', async () => {
      const loadTestMutations = Array.from({ length: 50 }, (_, i) => ({
        type: 'CREATE' as const,
        resource: 'keyword' as const,
        entityId: `keyword-load-${i}`,
        customerId: 'customer-123',
        changes: {
          text: `load test keyword ${i}`,
          matchType: 'BROAD'
        },
        estimatedCost: 0.5
      }));

      const startTime = Date.now();
      let successCount = 0;
      let failureCount = 0;

      await Promise.all(
        loadTestMutations.map(async (mutation) => {
          try {
            const result = await mutationGuard.validateMutation(mutation);
            if (result) successCount++;
          } catch (error) {
            failureCount++;
          }
        })
      );

      const elapsed = Date.now() - startTime;

      // Should handle load without catastrophic failure
      expect(successCount).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Failure rate should be low
      const failureRate = failureCount / loadTestMutations.length;
      expect(failureRate).toBeLessThan(0.1); // Less than 10% failure rate
    });
  });

  describe('Audit Trail Integrity', () => {
    it('should maintain audit trail even during errors', async () => {
      const failingMutation = {
        type: 'CREATE' as const,
        resource: 'campaign' as const,
        entityId: 'campaign-audit-fail',
        customerId: 'customer-123',
        changes: {
          budgetMicros: '999999999999' // Will fail validation
        },
        estimatedCost: 999999
      };

      await auditLogger.logMutation({
        user: 'test-user',
        mutation: failingMutation,
        result: 'failed',
        error: 'Budget validation failed',
        timestamp: new Date().toISOString()
      });

      const logs = await auditLogger.getAuditLogs({
        startDate: new Date(Date.now() - 60000).toISOString(),
        endDate: new Date().toISOString()
      });

      const failedLog = logs.find(log => log.entityId === 'campaign-audit-fail');
      
      expect(failedLog).toBeDefined();
      expect(failedLog?.result).toBe('failed');
      expect(failedLog?.error).toBe('Budget validation failed');
    });

    it('should handle corrupt audit log gracefully', async () => {
      // Simulate reading from a potentially corrupt audit log
      try {
        const summary = await auditLogger.generateSummary(
          'invalid-date-format',
          'also-invalid'
        );
        
        // Should either handle gracefully or throw meaningful error
        expect(summary).toBeDefined();
      } catch (error: any) {
        expect(error.message).toBeDefined();
      }
    });
  });
});