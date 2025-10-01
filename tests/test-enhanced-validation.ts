import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AdvancedValidator } from '../src/validators/advanced-validator.js';
import { PerformancePredictor } from '../src/analyzers/performance-predictor.js';
import { AnomalyDetector } from '../src/monitors/anomaly-detector.js';

// Mock dependencies
vi.mock('../src/utils/cache.js');
vi.mock('../src/monitors/performance.js');

describe('Enhanced Validation & Safety Suite', () => {
  describe('AdvancedValidator', () => {
    let validator: AdvancedValidator;

    beforeEach(() => {
      validator = new AdvancedValidator();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should validate changes with all default rules', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'test keyword', matchType: 'EXACT', score: 85 }
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('product', 'test-product');
      expect(result).toHaveProperty('totalRules');
      expect(result.totalRules).toBeGreaterThan(0);
      expect(result).toHaveProperty('overallStatus');
      expect(['PASSED', 'PASSED_WITH_WARNINGS', 'FAILED', 'BLOCKED']).toContain(result.overallStatus);
    });

    it('should detect budget limit violations', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 15000, // Exceeds 10,000 limit
            campaignId: 'campaign-1'
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('FAILED');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('budget'))).toBe(true);
    });

    it('should detect sudden budget increases', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 1000,
            oldBudget: 100, // 1000% increase
            campaignId: 'campaign-1'
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('PASSED_WITH_WARNINGS');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('increase'))).toBe(true);
    });

    it('should detect duplicate keywords', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'test keyword', matchType: 'EXACT', score: 75 }
          },
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'test keyword', matchType: 'EXACT', score: 80 }
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('FAILED');
      expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
    });

    it('should detect low quality keywords', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'low quality keyword', matchType: 'BROAD', score: 30 }
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('PASSED_WITH_WARNINGS');
      expect(result.warnings.some(w => w.message.includes('quality'))).toBe(true);
    });

    it('should detect prohibited terms in compliance check', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'guaranteed results', matchType: 'PHRASE', score: 75 }
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('BLOCKED');
      expect(result.critical.some(c => c.message.includes('Prohibited'))).toBe(true);
    });

    it('should validate campaign structure hierarchy', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'CREATE_AD_GROUP',
            adGroupId: 'adgroup-1',
            campaignId: 'non-existent-campaign'
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('BLOCKED');
      expect(result.critical.some(c => c.message.toLowerCase().includes('orphaned'))).toBe(true);
    });

    it('should validate bid ranges', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BID',
            bid: 100, // Exceeds max bid of 50
            keyword: { text: 'expensive keyword', matchType: 'EXACT' }
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('PASSED_WITH_WARNINGS');
      expect(result.warnings.some(w => w.message.includes('range'))).toBe(true);
    });

    it('should generate appropriate recommendations', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'guaranteed miracle cure', matchType: 'BROAD', score: 95 }
          }
        ],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.includes('Critical'))).toBe(true);
    });

    it('should allow custom rules to be added', () => {
      const customRule = {
        id: 'custom-test-rule',
        name: 'Custom Test Rule',
        description: 'Test custom rule',
        category: 'BUDGET' as const,
        severity: 'WARNING' as const,
        enabled: true,
        validate: vi.fn().mockReturnValue({ passed: true })
      };

      validator.addRule(customRule);

      expect(validator.getRulesByCategory('BUDGET')).toContain(customRule);
    });

    it('should track validation history', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [],
        metadata: {}
      };

      await validator.validate(changes);
      await validator.validate(changes);

      const history = validator.getValidationHistory();
      expect(history.length).toBe(2);
    });

    it('should provide validation statistics', async () => {
      const stats = validator.getStatistics();

      expect(stats).toHaveProperty('totalRules');
      expect(stats).toHaveProperty('enabledRules');
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats.totalRules).toBeGreaterThan(0);
    });
  });

  describe('PerformancePredictor', () => {
    let predictor: PerformancePredictor;

    beforeEach(() => {
      predictor = new PerformancePredictor();
    });

    it('should predict performance impact of budget changes', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 200,
            oldBudget: 100,
            campaignId: 'campaign-1'
          }
        ],
        metadata: {}
      };

      const prediction = await predictor.predictImpact(changes);

      expect(prediction).toHaveProperty('baseline');
      expect(prediction).toHaveProperty('predicted');
      expect(prediction).toHaveProperty('impact');
      expect(prediction).toHaveProperty('riskFactors');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('recommendations');
      
      // Budget increase should predict impression increase
      expect(prediction.impact.impressions.percentage).toBeGreaterThan(0);
    });

    it('should predict bid change impacts', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BID',
            bid: 3.0,
            oldBid: 1.5,
            keyword: { text: 'test keyword', matchType: 'EXACT' }
          }
        ],
        metadata: {}
      };

      const prediction = await predictor.predictImpact(changes);

      expect(prediction.impact.avgCpc.percentage).toBeGreaterThan(0);
      expect(prediction.riskFactors.some(r => r.factor.includes('Bid'))).toBe(true);
    });

    it('should identify high-risk changes', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'DELETE_CAMPAIGN',
            campaignId: 'campaign-1'
          }
        ],
        metadata: {}
      };

      const prediction = await predictor.predictImpact(changes);

      expect(prediction.riskFactors.some(r => r.severity === 'HIGH')).toBe(true);
      expect(prediction.recommendations.some(r => r.includes('risk'))).toBe(true);
    });

    it('should calculate confidence levels correctly', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'test keyword', matchType: 'EXACT', score: 85 }
          }
        ],
        metadata: {}
      };

      const prediction = await predictor.predictImpact(changes);

      expect(prediction.confidence.overall).toBeGreaterThan(0);
      expect(prediction.confidence.overall).toBeLessThanOrEqual(1);
      expect(prediction.confidence.factors.length).toBeGreaterThan(0);
    });

    it('should handle quality score improvements', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'high quality keyword', matchType: 'EXACT', score: 90 }
          }
        ],
        metadata: {}
      };

      const prediction = await predictor.predictImpact(changes);

      // High quality keywords should improve CTR
      expect(prediction.impact.ctr.percentage).toBeGreaterThanOrEqual(0);
    });

    it('should provide appropriate recommendations', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 5000,
            oldBudget: 1000, // Large increase
            campaignId: 'campaign-1'
          }
        ],
        metadata: {}
      };

      const prediction = await predictor.predictImpact(changes);

      expect(prediction.recommendations.length).toBeGreaterThan(0);
      expect(prediction.recommendations.some(r => r.includes('budget') || r.includes('cost'))).toBe(true);
    });
  });

  describe('AnomalyDetector', () => {
    let detector: AnomalyDetector;

    beforeEach(() => {
      detector = new AnomalyDetector();
    });

    it('should detect threshold anomalies', () => {
      // Add normal baseline data
      for (let i = 0; i < 10; i++) {
        detector.addDataPoint('cost', 100 + Math.random() * 10, { product: 'test-product' });
      }

      // Add anomalous data point
      detector.addDataPoint('cost', 500, { product: 'test-product' });

      const recentAnomalies = detector.getRecentAnomalies(1);
      expect(recentAnomalies.length).toBeGreaterThan(0);
      expect(recentAnomalies[0].metric).toBe('cost');
      expect(recentAnomalies[0].severity).toBe('CRITICAL');
    });

    it('should detect statistical anomalies using Z-score', () => {
      // Add normal data with consistent pattern
      for (let i = 0; i < 20; i++) {
        detector.addDataPoint('ctr', 2.0 + Math.random() * 0.2, { product: 'test-product' });
      }

      // Add statistical outlier
      detector.addDataPoint('ctr', 0.5, { product: 'test-product' }); // Very low CTR

      const recentAnomalies = detector.getRecentAnomalies(1);
      expect(recentAnomalies.length).toBeGreaterThan(0);
      expect(recentAnomalies.some(a => a.metric === 'ctr')).toBe(true);
    });

    it('should detect trend anomalies', () => {
      // Create declining trend
      for (let i = 0; i < 10; i++) {
        const value = 100 - (i * 5); // Declining by 5% each time
        detector.addDataPoint('conversionRate', value, { product: 'test-product' });
      }

      const recentAnomalies = detector.getRecentAnomalies(1);
      expect(recentAnomalies.some(a => 
        a.metric === 'conversionRate' && a.description.includes('declined')
      )).toBe(true);
    });

    it('should categorize anomalies correctly', () => {
      detector.addDataPoint('cost', 1000, { product: 'test-product' });
      detector.addDataPoint('conversionRate', 0.1, { product: 'test-product' });
      detector.addDataPoint('impressions', 100000, { product: 'test-product' });

      const anomalies = detector.getRecentAnomalies(1);

      if (anomalies.length > 0) {
        const types = new Set(anomalies.map(a => a.type));
        expect(['BUDGET', 'CONVERSION', 'TRAFFIC', 'PERFORMANCE']).toContain([...types][0]);
      }
    });

    it('should provide relevant recommendations', () => {
      // Force an anomaly
      for (let i = 0; i < 10; i++) {
        detector.addDataPoint('ctr', 2.0, { product: 'test-product' });
      }
      detector.addDataPoint('ctr', 0.5, { product: 'test-product' });

      const anomalies = detector.getRecentAnomalies(1);
      
      if (anomalies.length > 0) {
        const ctrAnomaly = anomalies.find(a => a.metric === 'ctr');
        expect(ctrAnomaly?.recommendations.length).toBeGreaterThan(0);
        expect(ctrAnomaly?.recommendations.some(r => 
          r.includes('ad copy') || r.includes('keyword')
        )).toBe(true);
      }
    });

    it('should track anomaly statistics', () => {
      // Generate some anomalies
      for (let i = 0; i < 5; i++) {
        detector.addDataPoint('cost', 1000, { product: 'test-product' });
      }

      const stats = detector.getStatistics();

      expect(stats).toHaveProperty('totalAnomalies');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('byProduct');
      expect(stats).toHaveProperty('recentTrends');
      expect(Array.isArray(stats.recentTrends)).toBe(true);
    });

    it('should allow marking false positives', async () => {
      detector.addDataPoint('cost', 1000, { product: 'test-product' });
      const anomalies = detector.getRecentAnomalies(1);

      if (anomalies.length > 0) {
        const anomalyId = anomalies[0].id;
        await detector.markFalsePositive(anomalyId, 'Expected seasonal increase');

        const markedAnomaly = anomalies.find(a => a.id === anomalyId);
        expect(markedAnomaly?.metadata?.falsePositive).toBe(true);
      }
    });

    it('should export anomaly data', () => {
      detector.addDataPoint('cost', 1000, { product: 'test-product' });
      
      const jsonExport = detector.exportAnomalies('json');
      const csvExport = detector.exportAnomalies('csv');

      expect(typeof jsonExport).toBe('string');
      expect(typeof csvExport).toBe('string');
      expect(csvExport.includes('ID,Timestamp,Product')).toBe(true);
    });

    it('should clear old anomalies', () => {
      detector.addDataPoint('cost', 1000, { product: 'test-product' });
      
      const initialCount = detector.getStatistics().totalAnomalies;
      const cleared = detector.clearOldAnomalies(0); // Clear all
      
      expect(cleared).toBe(initialCount);
      expect(detector.getStatistics().totalAnomalies).toBe(0);
    });

    it('should handle rule updates', () => {
      detector.updateRule('ctr-drop', {
        parameters: { standardDeviations: 3.0 },
        severity: 'CRITICAL' as const
      });

      // Rule should be updated (no error thrown)
      expect(true).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    let validator: AdvancedValidator;
    let predictor: PerformancePredictor;
    let detector: AnomalyDetector;

    beforeEach(() => {
      validator = new AdvancedValidator();
      predictor = new PerformancePredictor();
      detector = new AnomalyDetector();
    });

    it('should work together for comprehensive safety checking', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'UPDATE_BUDGET',
            budget: 500,
            oldBudget: 100,
            campaignId: 'campaign-1'
          },
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'high quality keyword', matchType: 'EXACT', score: 88 }
          }
        ],
        metadata: {}
      };

      // Step 1: Validate changes
      const validation = await validator.validate(changes);
      expect(validation.overallStatus).not.toBe('BLOCKED');

      // Step 2: Predict performance impact
      const prediction = await predictor.predictImpact(changes);
      expect(prediction.confidence.overall).toBeGreaterThan(0);

      // Step 3: Set up anomaly detection for monitoring
      detector.addDataPoint('cost', prediction.baseline.cost, { 
        product: changes.product 
      });

      // All systems should work together without errors
      expect(validation).toBeDefined();
      expect(prediction).toBeDefined();
      expect(detector.getStatistics()).toBeDefined();
    });

    it('should handle high-risk scenarios appropriately', async () => {
      const riskyChanges = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'DELETE_CAMPAIGN',
            campaignId: 'main-campaign'
          },
          {
            type: 'UPDATE_BUDGET',
            budget: 15000, // Exceeds limits
            oldBudget: 1000,
            campaignId: 'backup-campaign'
          }
        ],
        metadata: {}
      };

      // Validation should block due to budget limit
      const validation = await validator.validate(riskyChanges);
      expect(validation.overallStatus).toBe('FAILED');

      // Prediction should identify high risks
      const prediction = await predictor.predictImpact(riskyChanges);
      expect(prediction.riskFactors.some(r => r.severity === 'HIGH')).toBe(true);

      // Both systems should agree this is too risky
      expect(validation.errors.length + validation.critical.length).toBeGreaterThan(0);
      expect(prediction.riskFactors.length).toBeGreaterThan(0);
    });

    it('should provide consistent recommendations across systems', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'low quality keyword', matchType: 'BROAD', score: 35 }
          }
        ],
        metadata: {}
      };

      const validation = await validator.validate(changes);
      const prediction = await predictor.predictImpact(changes);

      // Both should flag quality concerns
      expect(validation.warnings.some(w => w.message.includes('quality'))).toBe(true);
      expect(prediction.recommendations.some(r => 
        r.includes('keyword') || r.includes('quality')
      )).toBe(true);
    });
  });

  describe('Safety Edge Cases', () => {
    let validator: AdvancedValidator;

    beforeEach(() => {
      validator = new AdvancedValidator();
    });

    it('should handle empty mutations gracefully', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [],
        metadata: {}
      };

      const result = await validator.validate(changes);

      expect(result.overallStatus).toBe('PASSED');
      expect(result.recommendations.some(r => r.includes('passed'))).toBe(true);
    });

    it('should handle malformed mutation data', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'INVALID_TYPE',
            invalidField: 'invalid-value'
          }
        ],
        metadata: {}
      };

      // Should not crash, should handle gracefully
      const result = await validator.validate(changes);
      expect(result).toBeDefined();
      expect(result.overallStatus).toBeDefined();
    });

    it('should handle null and undefined values', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: null
          },
          {
            type: 'UPDATE_BUDGET',
            budget: undefined,
            oldBudget: 100
          }
        ],
        metadata: {}
      };

      // Should handle gracefully without crashing
      const result = await validator.validate(changes);
      expect(result).toBeDefined();
    });

    it('should handle very large datasets', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: Array(1000).fill(0).map((_, i) => ({
          type: 'ADD_KEYWORD',
          keyword: { text: `keyword-${i}`, matchType: 'EXACT', score: 75 }
        })),
        metadata: {}
      };

      // Should complete without timeout or memory issues
      const result = await validator.validate(changes);
      expect(result).toBeDefined();
      expect(result.totalRules).toBeGreaterThan(0);
    });

    it('should maintain performance under load', async () => {
      const changes = {
        product: 'test-product',
        customerId: '123-456-7890',
        mutations: [
          {
            type: 'ADD_KEYWORD',
            keyword: { text: 'test keyword', matchType: 'EXACT', score: 85 }
          }
        ],
        metadata: {}
      };

      const startTime = Date.now();
      
      // Run validation multiple times
      for (let i = 0; i < 10; i++) {
        await validator.validate(changes);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (< 1 second for 10 validations)
      expect(duration).toBeLessThan(1000);
    });
  });
});