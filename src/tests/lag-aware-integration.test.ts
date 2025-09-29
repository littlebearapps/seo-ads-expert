/**
 * Integration Tests for Lag-Aware Thompson Sampling v2.0
 * Tests the complete system working together with all enhancements
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { MigrationRunner } from '../database/migration-runner.js';
import { LagAwareThompsonSampling } from '../optimization/lag-aware-thompson-sampling.js';
import { HierarchicalPriorsEngine } from '../optimization/hierarchical-priors-engine.js';
import { PacingController } from '../optimization/pacing-controller.js';
import { FeatureFlagManager } from '../optimization/feature-flag-manager.js';
import * as fs from 'fs';
import * as path from 'path';

// Test database setup
const TEST_DB_PATH = ':memory:';
let db: DatabaseManager;
let migrationRunner: MigrationRunner;
let thompsonSampling: LagAwareThompsonSampling;
let hierarchicalPriors: HierarchicalPriorsEngine;
let pacingController: PacingController;
let featureFlags: FeatureFlagManager;

describe('Lag-Aware Thompson Sampling v2.0 Integration Tests', () => {
  beforeEach(async () => {
    // Initialize test database
    db = new DatabaseManager({ path: TEST_DB_PATH });
    await db.initialize();

    // Initialize migration runner and apply v2.0 migration
    migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();

    // Initialize all components
    thompsonSampling = new LagAwareThompsonSampling(db);
    hierarchicalPriors = new HierarchicalPriorsEngine(db);
    pacingController = new PacingController(db, thompsonSampling);
    featureFlags = new FeatureFlagManager(db);

    // Initialize feature flags
    await featureFlags.initializeDefaultFlags();
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
  });

  describe('Database Migration Integration', () => {
    test('should apply v2.0 migration successfully', async () => {
      const status = await migrationRunner.getStatus();

      expect(status.applied.length).toBeGreaterThan(0);
      expect(status.total).toBeGreaterThan(0);

      // Check that v2.0 tables exist
      const tables = db.all<{ name: string }>(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN (
          'lag_profiles',
          'experiment_measurements',
          'hierarchical_priors',
          'pacing_controller_state',
          'feature_flags'
        )
      `);

      expect(tables.length).toBe(5);
    });

    test('should validate migration integrity', async () => {
      const validation = await migrationRunner.validateMigrations();

      expect(validation.valid).toBe(true);
      expect(validation.issues.length).toBe(0);
    });

    test('should handle multiple migration runs idempotently', async () => {
      // Run migrations multiple times
      const result1 = await migrationRunner.runMigrations();
      const result2 = await migrationRunner.runMigrations();
      const result3 = await migrationRunner.runMigrations();

      // Should not apply additional migrations
      expect(result2.applied).toBe(0);
      expect(result3.applied).toBe(0);
    });
  });

  describe('Feature Flag Integration with Components', () => {
    test('should enable/disable lag-aware features via flags', async () => {
      // Test with lag-aware features disabled
      await featureFlags.disableFeatureFlag('lag_aware_posterior_updates');

      const arms = [{
        id: 'test_arm_001',
        name: 'Test Campaign 001',
        type: 'campaign' as const,
        metrics30d: {
          spend: 500.0,
          clicks: 100,
          conversions: 10,
          revenue: 1000.0,
          impressions: 1000,
          qualityScore: 7.5
        },
        currentDailyBudget: 50.0
      }];

      // Should fall back to base Thompson Sampling
      const result1 = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result1.length).toBe(1);

      // Enable lag-aware features
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);

      const result2 = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result2.length).toBe(1);
      // Results might differ due to lag adjustments
    });

    test('should integrate feature flags with pacing controller', async () => {
      // Initialize pacing controller
      await pacingController.initializeCampaignPacing('test_campaign_pacing', 100000000);

      // Disable pacing controller integration
      await featureFlags.disableFeatureFlag('pacing_controller_integration');

      const decision1 = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        50000000,
        12
      );

      expect(decision1).toBeTruthy();

      // Enable pacing controller integration
      await featureFlags.enableFeatureFlag('pacing_controller_integration', 100);

      const decision2 = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        50000000,
        12
      );

      expect(decision2).toBeTruthy();
    });

    test('should respect campaign targeting in feature flags', async () => {
      // Set up targeted campaigns
      await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100, ['target_campaign_001']);

      // Test with target campaign
      const isEnabledTarget = await featureFlags.isFeatureEnabled(
        'hierarchical_empirical_bayes',
        'target_campaign_001'
      );

      // Test with non-target campaign
      const isEnabledNonTarget = await featureFlags.isFeatureEnabled(
        'hierarchical_empirical_bayes',
        'other_campaign_999'
      );

      expect(isEnabledTarget).toBe(true);
      expect(isEnabledNonTarget).toBe(false);
    });
  });

  describe('Hierarchical Priors Integration', () => {
    beforeEach(async () => {
      // Enable hierarchical priors
      await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100);

      // Set up test data
      const measurements = [
        {
          measurement_id: 'meas_001',
          experiment_id: 'campaign_001',
          arm_id: 'arm_001',
          measurement_date: new Date().toISOString(),
          successes: 10,
          trials: 100,
          revenue_total: 1000.0,
          recency_weight: 1.0,
          effective_trials: 100.0,
          effective_successes: 10.0,
          alpha_posterior: 11.0,
          beta_posterior: 91.0,
          gamma_shape: 11.0,
          gamma_rate: 0.01
        },
        {
          measurement_id: 'meas_002',
          experiment_id: 'campaign_002',
          arm_id: 'arm_002',
          measurement_date: new Date().toISOString(),
          successes: 15,
          trials: 120,
          revenue_total: 1500.0,
          recency_weight: 1.0,
          effective_trials: 120.0,
          effective_successes: 15.0,
          alpha_posterior: 16.0,
          beta_posterior: 106.0,
          gamma_shape: 16.0,
          gamma_rate: 0.01
        }
      ];

      for (const measurement of measurements) {
        db.run(`
          INSERT INTO experiment_measurements (
            measurement_id, experiment_id, arm_id, measurement_date,
            successes, trials, revenue_total, recency_weight,
            effective_trials, effective_successes,
            alpha_posterior, beta_posterior, gamma_shape, gamma_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          measurement.measurement_id, measurement.experiment_id, measurement.arm_id,
          measurement.measurement_date, measurement.successes, measurement.trials,
          measurement.revenue_total, measurement.recency_weight,
          measurement.effective_trials, measurement.effective_successes,
          measurement.alpha_posterior, measurement.beta_posterior,
          measurement.gamma_shape, measurement.gamma_rate
        ]);
      }
    });

    test('should learn hierarchical priors from experiment data', async () => {
      const result = await hierarchicalPriors.updateAllPriors();

      expect(result.globalPriors).toBeGreaterThan(0);
      expect(result.campaignPriors).toBeGreaterThan(0);

      // Check that priors were stored
      const globalPrior = db.get<any>(`
        SELECT * FROM hierarchical_priors
        WHERE level = 'global' AND scope_id = 'global' AND metric = 'cvr'
      `);

      expect(globalPrior).toBeTruthy();
      expect(globalPrior.alpha_prior).toBeGreaterThan(1.0);
      expect(globalPrior.beta_prior).toBeGreaterThan(1.0);
    });

    test('should use hierarchical priors in Thompson Sampling', async () => {
      // First update priors
      await hierarchicalPriors.updateAllPriors();

      const arms = [{
        id: 'new_arm_001',
        name: 'New Campaign 001',
        type: 'campaign' as const,
        metrics30d: {
          spend: 25.0,
          clicks: 5,
          conversions: 1,
          revenue: 100.0,
          impressions: 50,
          qualityScore: 6.0
        },
        currentDailyBudget: 10.0
      }];

      const result = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        minTrials: 1, // Allow low trial count
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result.length).toBe(1);
      expect(result[0].proposedDailyBudget).toBeGreaterThan(0);
      // Should have some confidence even with few trials due to hierarchical priors
    });
  });

  describe('Lag Profile Integration', () => {
    beforeEach(async () => {
      // Enable lag-aware features
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);

      // Set up lag profiles
      const lagProfiles = [
        { scope_type: 'campaign', scope_id: 'test_campaign', days_since: 0, completion_cdf: 0.3, sample_size: 100, confidence_score: 0.8 },
        { scope_type: 'campaign', scope_id: 'test_campaign', days_since: 1, completion_cdf: 0.5, sample_size: 100, confidence_score: 0.8 },
        { scope_type: 'campaign', scope_id: 'test_campaign', days_since: 7, completion_cdf: 0.8, sample_size: 100, confidence_score: 0.8 },
        { scope_type: 'campaign', scope_id: 'test_campaign', days_since: 30, completion_cdf: 0.95, sample_size: 100, confidence_score: 0.8 }
      ];

      for (const profile of lagProfiles) {
        db.run(`
          INSERT INTO lag_profiles (
            scope_type, scope_id, days_since, completion_cdf,
            sample_size, confidence_score, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          profile.scope_type, profile.scope_id, profile.days_since,
          profile.completion_cdf, profile.sample_size, profile.confidence_score,
          new Date().toISOString()
        ]);
      }
    });

    test('should use lag profiles in budget allocation', async () => {
      const arms = [{
        id: 'test_arm_lag',
        name: 'Test Campaign with Lag',
        type: 'campaign' as const,
        metrics30d: {
          spend: 500.0,
          clicks: 100,
          conversions: 10,
          revenue: 1000.0,
          impressions: 1000,
          qualityScore: 7.0
        },
        currentDailyBudget: 50.0
      }];

      const result = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result.length).toBe(1);
      expect(result[0].proposedDailyBudget).toBeGreaterThan(0);
      // Budget allocation should account for lag compensation
    });

    test('should handle missing lag profiles gracefully', async () => {
      const arms = [{
        id: 'test_arm_no_lag',
        name: 'Campaign without Lag Profiles',
        type: 'campaign' as const,
        metrics30d: {
          spend: 500.0,
          clicks: 100,
          conversions: 10,
          revenue: 1000.0,
          impressions: 1000,
          qualityScore: 7.0
        },
        currentDailyBudget: 50.0
      }];

      const result = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result.length).toBe(1);
      // Should work without lag profiles (fallback behavior)
    });
  });

  describe('Complete End-to-End Integration', () => {
    test('should handle complete workflow with all features enabled', async () => {
      // Enable all v2.0 features
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);
      await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100);
      await featureFlags.enableFeatureFlag('recency_lag_adjusted_stats', 100);
      await featureFlags.enableFeatureFlag('pacing_controller_integration', 100);

      // Set up comprehensive test data
      const campaignId = 'integration_test_campaign';

      // 1. Initialize pacing controller
      await pacingController.initializeCampaignPacing(campaignId, 100000000);

      // 2. Set up experiment measurements
      db.run(`
        INSERT INTO experiment_measurements (
          measurement_id, experiment_id, arm_id, measurement_date,
          successes, trials, revenue_total, recency_weight,
          effective_trials, effective_successes,
          alpha_posterior, beta_posterior, gamma_shape, gamma_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'integration_meas_001', campaignId, 'integration_arm_001',
        new Date().toISOString(), 20, 200, 2000.0, 1.0,
        200.0, 20.0, 21.0, 181.0, 21.0, 0.01
      ]);

      // 3. Set up lag profiles
      db.run(`
        INSERT INTO lag_profiles (
          scope_type, scope_id, days_since, completion_cdf,
          sample_size, confidence_score, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['campaign', campaignId, 7, 0.8, 100, 0.8, new Date().toISOString()]);

      // 4. Update hierarchical priors
      const priorsResult = await hierarchicalPriors.updateAllPriors();
      expect(priorsResult.globalPriors).toBeGreaterThan(0);

      // 5. Make budget allocation decision
      const arms = [{
        id: 'integration_arm_001',
        name: `Integration Campaign ${campaignId}`,
        type: 'campaign' as const,
        metrics30d: {
          spend: 1000.0,
          clicks: 200,
          conversions: 20,
          revenue: 2000.0,
          impressions: 2000,
          qualityScore: 8.0
        },
        currentDailyBudget: 100.0
      }];

      const allocationResult = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(allocationResult.length).toBe(1);
      expect(allocationResult[0].proposedDailyBudget).toBeGreaterThan(0);

      // 6. Make pacing decision
      const pacingDecision = await pacingController.makePacingDecision(
        campaignId,
        50000000, // $50 spent
        12 // 12 hours into day
      );

      expect(pacingDecision.action).toBeTruthy();
      expect(pacingDecision.bidMultiplier).toBeGreaterThan(0);

      // 7. Get rollout status
      const rolloutStatus = await featureFlags.getRolloutStatus();
      expect(rolloutStatus.enabledFeatures).toBeGreaterThanOrEqual(4);
    });

    test('should handle graceful degradation when features are disabled', async () => {
      // Start with all features enabled
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);
      await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100);
      await featureFlags.enableFeatureFlag('pacing_controller_integration', 100);

      const campaignId = 'degradation_test_campaign';

      // Initialize systems
      await pacingController.initializeCampaignPacing(campaignId, 100000000);

      const arms = [{
        id: 'degradation_arm_001',
        name: `Degradation Campaign ${campaignId}`,
        type: 'campaign' as const,
        metrics30d: {
          spend: 500.0,
          clicks: 100,
          conversions: 10,
          revenue: 1000.0,
          impressions: 1000,
          qualityScore: 7.0
        },
        currentDailyBudget: 50.0
      }];

      // Test with all features enabled
      const result1 = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result1.length).toBe(1);

      // Disable features gradually
      await featureFlags.disableFeatureFlag('lag_aware_posterior_updates');

      const result2 = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result2.length).toBe(1); // Should still work

      // Emergency disable all
      await featureFlags.emergencyDisableAll('Integration test emergency');

      const result3 = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result3.length).toBe(1); // Should still work with base Thompson Sampling
    });
  });

  describe('Performance and Scalability Integration', () => {
    test('should handle multiple campaigns efficiently', async () => {
      // Enable all features
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);
      await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100);
      await featureFlags.enableFeatureFlag('pacing_controller_integration', 100);

      const campaignCount = 20;
      const campaigns = Array.from({ length: campaignCount }, (_, i) => `perf_campaign_${i}`);

      const start = Date.now();

      // Initialize all campaigns
      for (const campaignId of campaigns) {
        await pacingController.initializeCampaignPacing(campaignId, 100000000);

        // Add some test data
        db.run(`
          INSERT INTO experiment_measurements (
            measurement_id, experiment_id, arm_id, measurement_date,
            successes, trials, revenue_total, recency_weight,
            effective_trials, effective_successes,
            alpha_posterior, beta_posterior, gamma_shape, gamma_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `perf_meas_${campaignId}`, campaignId, `perf_arm_${campaignId}`,
          new Date().toISOString(), 10, 100, 1000.0, 1.0,
          100.0, 10.0, 11.0, 91.0, 11.0, 0.01
        ]);
      }

      // Update priors once for all campaigns
      await hierarchicalPriors.updateAllPriors();

      // Make decisions for all campaigns
      for (const campaignId of campaigns) {
        const arms = [{
          id: `perf_arm_${campaignId}`,
          name: `Performance Campaign ${campaignId}`,
          type: 'campaign' as const,
          metrics30d: {
            spend: 500.0,
            clicks: 100,
            conversions: 10,
            revenue: 1000.0,
            impressions: 1000,
            qualityScore: 7.0
          },
          currentDailyBudget: 50.0
        }];

        const allocationResult = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
          minDailyBudget: 10,
          maxDailyBudget: 1000,
          riskTolerance: 0.1,
          maxChangePercent: 25,
          minTrials: 10,
          maxLookbackDays: 30,
          recencyHalfLifeDays: 14
        });

        expect(allocationResult.length).toBe(1);

        const pacingDecision = await pacingController.makePacingDecision(
          campaignId,
          50000000,
          12
        );

        expect(pacingDecision.action).toBeTruthy();
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10000); // Should complete in less than 10 seconds

      // Verify all systems are working
      const rolloutStatus = await featureFlags.getRolloutStatus();
      expect(rolloutStatus.enabledFeatures).toBeGreaterThanOrEqual(3);

      const activeControllers = await pacingController.getActivePacingControllers();
      expect(activeControllers.length).toBeGreaterThanOrEqual(campaignCount);
    });

    test('should handle high-frequency operations', async () => {
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);

      const campaignId = 'high_freq_campaign';
      await pacingController.initializeCampaignPacing(campaignId, 100000000);

      const start = Date.now();
      const operationCount = 100;

      // Perform many rapid operations
      for (let i = 0; i < operationCount; i++) {
        // Check feature flags
        const isEnabled = await featureFlags.isFeatureEnabled('lag_aware_posterior_updates', campaignId);
        expect(typeof isEnabled).toBe('boolean');

        // Make pacing decisions
        if (i % 10 === 0) { // Every 10th iteration
          const decision = await pacingController.makePacingDecision(
            campaignId,
            i * 1000000,
            12
          );
          expect(decision.action).toBeTruthy();
        }
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(3000); // Should complete in less than 3 seconds
    });
  });

  describe('Data Consistency and Integrity', () => {
    test('should maintain data consistency across all components', async () => {
      const campaignId = 'consistency_test_campaign';

      // Initialize with all features
      await featureFlags.enableFeatureFlag('lag_aware_posterior_updates', 100);
      await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100);
      await featureFlags.enableFeatureFlag('pacing_controller_integration', 100);

      await pacingController.initializeCampaignPacing(campaignId, 100000000);

      // Add measurement data
      db.run(`
        INSERT INTO experiment_measurements (
          measurement_id, experiment_id, arm_id, measurement_date,
          successes, trials, revenue_total, recency_weight,
          effective_trials, effective_successes,
          alpha_posterior, beta_posterior, gamma_shape, gamma_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'consistency_meas_001', campaignId, 'consistency_arm_001',
        new Date().toISOString(), 25, 250, 2500.0, 1.0,
        250.0, 25.0, 26.0, 226.0, 26.0, 0.01
      ]);

      // Verify data was inserted correctly
      const measurement = db.get<any>(`
        SELECT * FROM experiment_measurements WHERE measurement_id = ?
      `, ['consistency_meas_001']);

      expect(measurement).toBeTruthy();
      expect(measurement.successes).toBe(25);
      expect(measurement.trials).toBe(250);

      // Update priors and verify they're stored
      await hierarchicalPriors.updateAllPriors();

      const priors = db.all<any>(`
        SELECT * FROM hierarchical_priors WHERE scope_id = ?
      `, [campaignId]);

      expect(priors.length).toBeGreaterThan(0);

      // Make budget allocation and verify it uses the data
      const arms = [{
        id: 'consistency_arm_001',
        name: `Consistency Campaign ${campaignId}`,
        type: 'campaign' as const,
        metrics30d: {
          spend: 1250.0,
          clicks: 250,
          conversions: 25,
          revenue: 2500.0,
          impressions: 2500,
          qualityScore: 8.5
        },
        currentDailyBudget: 125.0
      }];

      const result = await thompsonSampling.allocateBudgetLagAware(arms, 2500, {
        minDailyBudget: 10,
        maxDailyBudget: 1000,
        riskTolerance: 0.1,
        maxChangePercent: 25,
        maxLookbackDays: 30,
        recencyHalfLifeDays: 14
      });

      expect(result.length).toBe(1);
      expect(result[0].expectedImprovement).toBeGreaterThanOrEqual(0);

      // Verify pacing state is consistent
      const pacingState = await pacingController.getPacingState(campaignId);
      expect(pacingState).toBeTruthy();
      expect(pacingState?.campaignId).toBe(campaignId);
    });

    test('should handle transaction rollbacks correctly', async () => {
      const campaignId = 'transaction_test_campaign';

      // Use transaction to test rollback behavior
      try {
        db.transaction(() => {
          // Insert pacing controller state
          db.run(`
            INSERT INTO pacing_controller_state (
              controller_id, campaign_id, daily_budget_micros,
              current_spend_micros, pace_target, current_bid_multiplier,
              spend_rate_limit, exploration_budget_fraction,
              exploitation_confidence_threshold, max_bid_adjustment,
              decision_frequency_minutes, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'transaction_controller', campaignId, 100000000,
            0, 1.0, 1.0, 1.0, 0.1, 0.8, 0.25, 60,
            new Date().toISOString(), new Date().toISOString()
          ]);

          // Intentionally throw error to test rollback
          throw new Error('Intentional rollback test');
        })();
      } catch (error) {
        // Expected error
      }

      // Verify the data was rolled back
      const state = await pacingController.getPacingState(campaignId);
      expect(state).toBeNull();
    });
  });
});