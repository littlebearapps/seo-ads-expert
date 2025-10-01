/**
 * Debug test to isolate NaN issue in Thompson Sampling
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { MigrationRunner } from '../database/migration-runner.js';
import { LagAwareThompsonSampling } from '../optimization/lag-aware-thompson-sampling.js';
import { HierarchicalPriorsEngine } from '../optimization/hierarchical-priors-engine.js';
import { FeatureFlagManager } from '../optimization/feature-flag-manager.js';

const TEST_DB_PATH = ':memory:';
let db: DatabaseManager;
let migrationRunner: MigrationRunner;
let thompsonSampling: LagAwareThompsonSampling;
let hierarchicalPriors: HierarchicalPriorsEngine;
let featureFlags: FeatureFlagManager;

describe('NaN Debug Test', () => {
  beforeEach(async () => {
    db = new DatabaseManager({ path: TEST_DB_PATH });
    await db.initialize();

    migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();

    thompsonSampling = new LagAwareThompsonSampling(db);
    hierarchicalPriors = new HierarchicalPriorsEngine(db);
    featureFlags = new FeatureFlagManager(db);

    await featureFlags.initializeDefaultFlags();
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
  });

  test('should debug exactly where NaN comes from', async () => {
    // Enable hierarchical priors
    await featureFlags.enableFeatureFlag('hierarchical_empirical_bayes', 100);

    // Set up test data exactly like the failing test
    db.run(`
      INSERT INTO experiment_measurements (
        measurement_id, experiment_id, arm_id, measurement_date,
        successes, trials, revenue_total, recency_weight,
        effective_trials, effective_successes,
        alpha_posterior, beta_posterior, gamma_shape, gamma_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'debug_meas_001', 'new_arm_001', 'new_arm_001',
      new Date().toISOString(), 1, 5, 100.0, 1.0,
      5.0, 1.0, 2.0, 5.0, 2.0, 0.01
    ]);

    // Update hierarchical priors
    const priorsResult = await hierarchicalPriors.updateAllPriors();
    console.log('Priors update result:', priorsResult);

    // Check what priors were created
    const priors = db.all(`SELECT * FROM hierarchical_priors`);
    console.log('Created priors:', priors);

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

    console.log('Arm data:', JSON.stringify(arms[0], null, 2));

    const result = await thompsonSampling.allocateBudgetLagAware(arms, 1000, {
      minBudgetShare: 0.1,
      maxBudgetShare: 1.0,
      minTrials: 1,
      maxLookbackDays: 30,
      recencyHalfLifeDays: 14,
      minDailyBudget: 1.0,
      maxDailyBudget: 1000.0,
      riskTolerance: 0.1
    });

    console.log('Final result:', JSON.stringify(result, null, 2));

    expect(result.length).toBe(1);
    expect(result[0].proposedDailyBudget).toBeGreaterThan(0);
    expect(Number.isNaN(result[0].proposedDailyBudget)).toBe(false);
  });
});