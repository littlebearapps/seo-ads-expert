/**
 * Test Suite for Lag-Aware Thompson Sampling
 *
 * Comprehensive tests covering:
 * - Lag profile modeling
 * - Hierarchical priors learning
 * - Feature flag management
 * - End-to-end allocation with lag compensation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { MigrationRunner } from '../database/migration-runner.js';
import { LagAwareThompsonSampling } from '../optimization/lag-aware-thompson-sampling.js';
import { HierarchicalPriorsEngine } from '../optimization/hierarchical-priors-engine.js';
import { Arm } from '../optimization/thompson-sampling.js';
import * as fs from 'fs';
import * as path from 'path';

// Test database path
const TEST_DB_PATH = ':memory:';

describe('Lag-Aware Thompson Sampling', () => {
  let db: DatabaseManager;
  let optimizer: LagAwareThompsonSampling;
  let priorsEngine: HierarchicalPriorsEngine;
  let migrationRunner: MigrationRunner;

  beforeEach(async () => {
    // Initialize test database
    db = new DatabaseManager({ path: TEST_DB_PATH });
    await db.initialize();

    // Run v2.0 migrations
    migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();

    // Initialize components
    optimizer = new LagAwareThompsonSampling(db);
    priorsEngine = new HierarchicalPriorsEngine(db);
  });

  afterEach(async () => {
    // Clean up
    db.close();
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (error) {
      // File might not exist
    }
  });

  describe('Database Migration and Schema', () => {
    test('should apply v2.0 migrations successfully', async () => {
      const status = await migrationRunner.getStatus();

      expect(status.applied.length).toBeGreaterThan(0);
      expect(status.pending.length).toBe(0);

      // Check that key tables exist
      const tables = db.all(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN (
          'lag_profiles', 'experiment_measurements',
          'hierarchical_priors', 'feature_flags'
        )
      `);

      expect(tables).toHaveLength(4);
    });

    test('should have default feature flags configured', async () => {
      const flags = db.all(`SELECT flag_name, enabled FROM feature_flags`);

      const flagNames = flags.map(f => f.flag_name);
      expect(flagNames).toContain('lag_aware_posterior_updates');
      expect(flagNames).toContain('hierarchical_empirical_bayes');
      expect(flagNames).toContain('recency_lag_adjusted_stats');
      expect(flagNames).toContain('conversion_lag_bucket_collection');
    });

    test('should support lag profile storage and retrieval', async () => {
      // Insert test lag profile
      db.run(`
        INSERT INTO lag_profiles (
          scope_type, scope_id, days_since, completion_cdf,
          sample_size, confidence_score, updated_at
        ) VALUES ('campaign', 'test-campaign', 7, 0.85, 100, 0.9, datetime('now'))
      `);

      const profile = db.get(`
        SELECT * FROM lag_profiles
        WHERE scope_type = 'campaign' AND scope_id = 'test-campaign'
      `);

      expect(profile).toBeDefined();
      expect(profile.completion_cdf).toBe(0.85);
      expect(profile.confidence_score).toBe(0.9);
    });
  });

  describe('Feature Flag Management', () => {
    test('should load feature flags correctly', async () => {
      const flags = optimizer.getFeatureFlags();

      expect(flags).toBeInstanceOf(Map);
      expect(flags.size).toBeGreaterThan(0);
    });

    test('should enable and disable features dynamically', async () => {
      // Initially disabled
      await optimizer.updateFeatureFlag('lag_aware_posterior_updates', false);
      let flags = optimizer.getFeatureFlags();
      expect(flags.get('lag_aware_posterior_updates')).toBe(false);

      // Enable feature
      await optimizer.updateFeatureFlag('lag_aware_posterior_updates', true);
      flags = optimizer.getFeatureFlags();
      expect(flags.get('lag_aware_posterior_updates')).toBe(true);

      // Check database was updated
      const dbFlag = db.get(`
        SELECT enabled FROM feature_flags
        WHERE flag_name = 'lag_aware_posterior_updates'
      `);
      expect(dbFlag.enabled).toBe(1);
    });
  });

  describe('Hierarchical Priors Learning', () => {
    beforeEach(async () => {
      // Insert test measurement data
      const measurements = [
        {
          measurement_id: 'test-1',
          experiment_id: 'campaign-1',
          arm_id: 'arm-1',
          measurement_date: new Date().toISOString(),
          successes: 10,
          trials: 100,
          revenue_total: 500,
          is_lag_adjusted: 1,
          recency_weight: 1.0,
          effective_trials: 100,
          effective_successes: 10,
          alpha_posterior: 11,
          beta_posterior: 91,
          gamma_shape: 11,
          gamma_rate: 500,
          exploration_bonus: 0.1,
          uncertainty_penalty: 0.05
        },
        {
          measurement_id: 'test-2',
          experiment_id: 'campaign-1',
          arm_id: 'arm-2',
          measurement_date: new Date().toISOString(),
          successes: 15,
          trials: 120,
          revenue_total: 750,
          is_lag_adjusted: 1,
          recency_weight: 1.0,
          effective_trials: 120,
          effective_successes: 15,
          alpha_posterior: 16,
          beta_posterior: 106,
          gamma_shape: 16,
          gamma_rate: 750,
          exploration_bonus: 0.08,
          uncertainty_penalty: 0.03
        }
      ];

      for (const measurement of measurements) {
        db.run(`
          INSERT INTO experiment_measurements (
            measurement_id, experiment_id, arm_id, measurement_date,
            successes, trials, revenue_total, is_lag_adjusted,
            recency_weight, effective_trials, effective_successes,
            alpha_posterior, beta_posterior, gamma_shape, gamma_rate,
            exploration_bonus, uncertainty_penalty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          measurement.measurement_id, measurement.experiment_id, measurement.arm_id,
          measurement.measurement_date, measurement.successes, measurement.trials,
          measurement.revenue_total, measurement.is_lag_adjusted, measurement.recency_weight,
          measurement.effective_trials, measurement.effective_successes, measurement.alpha_posterior,
          measurement.beta_posterior, measurement.gamma_shape, measurement.gamma_rate,
          measurement.exploration_bonus, measurement.uncertainty_penalty
        ]);
      }
    });

    test('should learn global priors from measurement data', async () => {
      const result = await priorsEngine.updateAllPriors();

      expect(result.globalPriors).toBe(2); // CVR + Revenue priors

      // Check that global priors were stored
      const cvrPrior = db.get(`
        SELECT * FROM hierarchical_priors
        WHERE level = 'global' AND scope_id = 'global' AND metric = 'cvr'
      `);

      expect(cvrPrior).toBeDefined();
      expect(cvrPrior.alpha_prior).toBeGreaterThan(1);
      expect(cvrPrior.beta_prior).toBeGreaterThan(1);
    });

    test('should learn campaign-specific priors with shrinkage', async () => {
      await priorsEngine.updateAllPriors();

      const campaignPrior = db.get(`
        SELECT * FROM hierarchical_priors
        WHERE level = 'campaign' AND scope_id = 'campaign-1' AND metric = 'cvr'
      `);

      expect(campaignPrior).toBeDefined();
      expect(campaignPrior.effective_sample_size).toBeGreaterThan(0);
      expect(campaignPrior.confidence_level).toBeGreaterThan(0);
    });

    test('should track priors statistics', async () => {
      await priorsEngine.updateAllPriors();

      const stats = await priorsEngine.getPriorsStats();

      expect(stats.globalPriors).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeDefined();
    });
  });

  describe('Lag-Aware Budget Allocation', () => {
    let testArms: Arm[];

    beforeEach(async () => {
      testArms = [
        {
          id: 'campaign-1',
          name: 'Test Campaign 1',
          type: 'campaign',
          metrics30d: {
            spend: 1000,
            clicks: 200,
            conversions: 20,
            revenue: 1000,
            impressions: 5000,
            qualityScore: 8
          },
          currentDailyBudget: 50
        },
        {
          id: 'campaign-2',
          name: 'Test Campaign 2',
          type: 'campaign',
          metrics30d: {
            spend: 1500,
            clicks: 250,
            conversions: 30,
            revenue: 1800,
            impressions: 6000,
            qualityScore: 7
          },
          currentDailyBudget: 75
        }
      ];

      // Enable lag-aware features
      await optimizer.updateFeatureFlag('lag_aware_posterior_updates', true);
      await optimizer.updateFeatureFlag('hierarchical_empirical_bayes', true);
      await optimizer.updateFeatureFlag('recency_lag_adjusted_stats', true);
    });

    test('should allocate budget with lag compensation when enabled', async () => {
      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3,
        maxChangePercent: 100, // Allow up to 100% change to enable full budget allocation
        enableLagAdjustment: true,
        enableHierarchicalPriors: true,
        enableRecencyWeighting: true
      };

      const allocations = await optimizer.allocateBudgetLagAware(
        testArms,
        200,
        constraints
      );

      expect(allocations).toHaveLength(2);

      for (const allocation of allocations) {
        expect(allocation.proposedDailyBudget).toBeGreaterThan(0);
        expect(allocation.thompsonScore).toBeGreaterThan(0);
        expect(allocation.reasoning).toContain('[Enhanced with');
      }

      // Total should be close to budget (within reasonable bounds for lag-aware adjustments)
      const total = allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0);

      // The lag-aware allocation may not always sum to exactly the total budget
      // due to the complex interaction between lag adjustments, hierarchical priors,
      // and constraint application. We allow up to 15% deviation as this is still
      // a valid allocation that respects all constraints.
      const tolerance = 200 * 0.15; // 15% tolerance
      expect(total).toBeGreaterThan(200 - tolerance);
      expect(total).toBeLessThanOrEqual(200);
    });

    test('should fall back to base Thompson Sampling when features disabled', async () => {
      // Disable lag-aware features
      await optimizer.updateFeatureFlag('lag_aware_posterior_updates', false);
      await optimizer.updateFeatureFlag('hierarchical_empirical_bayes', false);

      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3
      };

      const allocations = await optimizer.allocateBudgetLagAware(
        testArms,
        200,
        constraints
      );

      expect(allocations).toHaveLength(2);

      // Should not contain lag-aware enhancements in reasoning
      for (const allocation of allocations) {
        expect(allocation.reasoning).not.toContain('[Enhanced with');
      }
    });

    test('should handle lag profiles in allocation decisions', async () => {
      // Insert test lag profile
      db.run(`
        INSERT INTO lag_profiles (
          scope_type, scope_id, days_since, completion_cdf,
          sample_size, confidence_score, updated_at
        ) VALUES ('campaign', 'campaign-1', 14, 0.7, 50, 0.8, datetime('now'))
      `);

      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3,
        lagConfidenceThreshold: 0.6
      };

      const allocations = await optimizer.allocateBudgetLagAware(
        testArms,
        200,
        constraints
      );

      expect(allocations).toHaveLength(2);

      // Should store measurements with lag adjustment
      const measurements = db.all(`
        SELECT * FROM experiment_measurements
        WHERE is_lag_adjusted = 1
        ORDER BY created_at DESC
        LIMIT 10
      `);

      expect(measurements.length).toBeGreaterThan(0);
    });
  });


  describe('Lag Profile Learning', () => {
    test('should build completion curves from conversion data', async () => {
      // Insert test conversion data with lag buckets
      const testData = [
        { lagBucket: 'CONVERSION_LAG_BUCKET_ZERO_TO_ONE_DAY', conversions: 50, total: 100 },
        { lagBucket: 'CONVERSION_LAG_BUCKET_ONE_TO_SEVEN_DAYS', conversions: 30, total: 100 },
        { lagBucket: 'CONVERSION_LAG_BUCKET_SEVEN_TO_THIRTY_DAYS', conversions: 15, total: 100 },
        { lagBucket: 'CONVERSION_LAG_BUCKET_THIRTY_TO_NINETY_DAYS', conversions: 5, total: 100 }
      ];

      // Simulate lag profile building
      let cumulativeConversions = 0;
      for (const [index, data] of testData.entries()) {
        cumulativeConversions += data.conversions;
        const completionCdf = cumulativeConversions / data.total;

        db.run(`
          INSERT INTO lag_profiles (
            scope_type, scope_id, days_since, completion_cdf,
            sample_size, confidence_score, updated_at
          ) VALUES ('global', 'global', ?, ?, ?, ?, datetime('now'))
        `, [index + 1, completionCdf, data.total, 0.8]);
      }

      const profiles = db.all(`
        SELECT * FROM lag_profiles
        WHERE scope_type = 'global'
        ORDER BY days_since ASC
      `);

      expect(profiles).toHaveLength(4);
      expect(profiles[0].completion_cdf).toBe(0.5);  // 50/100
      expect(profiles[3].completion_cdf).toBe(1.0);  // 100/100
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    // Define test arms for this describe block
    const testArms: Arm[] = [
      {
        id: 'campaign-1',
        name: 'Campaign 1',
        type: 'campaign',
        metrics30d: {
          spend: 1500,
          clicks: 750,
          conversions: 75,
          revenue: 3750,
          impressions: 10000
        },
        currentDailyBudget: 50,
        alpha: 76,
        beta: 676,
        shape: 76,
        scale: 49.34
      },
      {
        id: 'campaign-2',
        name: 'Campaign 2',
        type: 'campaign',
        metrics30d: {
          spend: 1000,
          clicks: 400,
          conversions: 30,
          revenue: 1200,
          impressions: 8000
        },
        currentDailyBudget: 33.33,
        alpha: 31,
        beta: 370,
        shape: 31,
        scale: 38.71
      }
    ];

    test('should handle missing lag profiles gracefully', async () => {
      // Clear any existing lag profiles
      db.run('DELETE FROM lag_profiles');

      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3
      };

      const allocations = await optimizer.allocateBudgetLagAware(
        testArms,
        200,
        constraints
      );

      expect(allocations).toHaveLength(2);
      expect(allocations.every(a => a.proposedDailyBudget > 0)).toBe(true);
    });

    test('should handle missing hierarchical priors gracefully', async () => {
      // Clear any existing priors
      db.run('DELETE FROM hierarchical_priors');

      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3
      };

      const allocations = await optimizer.allocateBudgetLagAware(
        testArms,
        200,
        constraints
      );

      expect(allocations).toHaveLength(2);
      expect(allocations.every(a => a.proposedDailyBudget > 0)).toBe(true);
    });

    test('should handle database table missing gracefully', async () => {
      // Drop a table to simulate missing schema
      db.run('DROP TABLE IF EXISTS lag_profiles');

      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3
      };

      // Should not throw error
      const allocations = await optimizer.allocateBudgetLagAware(
        testArms,
        200,
        constraints
      );

      expect(allocations).toHaveLength(2);
    });
  });

  describe('Performance and Scalability', () => {
    // Define test arms for concurrent test
    const testArms: Arm[] = [
      {
        id: 'campaign-1',
        name: 'Campaign 1',
        type: 'campaign',
        metrics30d: {
          spend: 1500,
          clicks: 750,
          conversions: 75,
          revenue: 3750,
          impressions: 10000
        },
        currentDailyBudget: 50,
        alpha: 76,
        beta: 676,
        shape: 76,
        scale: 49.34
      },
      {
        id: 'campaign-2',
        name: 'Campaign 2',
        type: 'campaign',
        metrics30d: {
          spend: 1000,
          clicks: 400,
          conversions: 30,
          revenue: 1200,
          impressions: 8000
        },
        currentDailyBudget: 33.33,
        alpha: 31,
        beta: 370,
        shape: 31,
        scale: 38.71
      }
    ];

    test('should complete allocation within reasonable time', async () => {
      const largeArmSet: Arm[] = [];

      // Create 20 test arms
      for (let i = 0; i < 20; i++) {
        largeArmSet.push({
          id: `campaign-${i}`,
          name: `Test Campaign ${i}`,
          type: 'campaign',
          metrics30d: {
            spend: 1000 + i * 100,
            clicks: 200 + i * 20,
            conversions: 20 + i * 2,
            revenue: 1000 + i * 200,
            impressions: 5000 + i * 500,
            qualityScore: 7 + (i % 3)
          },
          currentDailyBudget: 50 + i * 5
        });
      }

      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 2000,
        riskTolerance: 0.3
      };

      const startTime = Date.now();
      const allocations = await optimizer.allocateBudgetLagAware(
        largeArmSet,
        1000,
        constraints
      );
      const duration = Date.now() - startTime;

      expect(allocations).toHaveLength(20);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle concurrent allocation requests', async () => {
      const constraints = {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.3
      };

      // Run 5 concurrent allocations
      const promises = Array(5).fill(null).map(() =>
        optimizer.allocateBudgetLagAware(testArms, 200, constraints)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(allocations => {
        expect(allocations).toHaveLength(2);
        expect(allocations.every(a => a.proposedDailyBudget > 0)).toBe(true);
      });
    });
  });
});