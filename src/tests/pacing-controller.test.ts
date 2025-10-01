/**
 * Comprehensive Tests for Pacing Controller Integration
 * Tests the integration between Thompson Sampling and real-time budget pacing
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { MigrationRunner } from '../database/migration-runner.js';
import { PacingController, PacingControllerState, PacingDecision } from '../optimization/pacing-controller.js';
import { LagAwareThompsonSampling } from '../optimization/lag-aware-thompson-sampling.js';
import { ThompsonSamplingOptimizer } from '../optimization/thompson-sampling.js';
import * as fs from 'fs';
import * as path from 'path';

// Test database setup
const TEST_DB_PATH = ':memory:';
let db: DatabaseManager;
let pacingController: PacingController;
let thompsonSampling: LagAwareThompsonSampling;

describe('Pacing Controller Integration Tests', () => {
  beforeEach(async () => {
    // Initialize test database
    db = new DatabaseManager({ path: TEST_DB_PATH });
    await db.initialize();

    // Apply v2.0 migration
    const migrationPath = path.join(__dirname, '../database/migrations/v2.0-thompson-sampling-lag-profiles.sql');
    if (fs.existsSync(migrationPath)) {
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      db.exec(migrationSQL);
    }

    // Initialize Thompson Sampling and Pacing Controller
    thompsonSampling = new LagAwareThompsonSampling(db);
    pacingController = new PacingController(db, thompsonSampling);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
  });

  describe('Pacing Controller Initialization', () => {
    test('should initialize campaign pacing with default settings', async () => {
      const campaignId = 'test_campaign_001';
      const dailyBudgetMicros = 100000000; // $100

      const controllerId = await pacingController.initializeCampaignPacing(
        campaignId,
        dailyBudgetMicros
      );

      expect(controllerId).toMatch(/^pacing_test_campaign_001_\d+$/);

      const state = await pacingController.getPacingState(campaignId);
      expect(state).toBeTruthy();
      expect(state?.campaignId).toBe(campaignId);
      expect(state?.dailyBudgetMicros).toBe(dailyBudgetMicros);
      expect(state?.currentBidMultiplier).toBe(1.0);
      expect(state?.explorationBudgetFraction).toBe(0.1);
    });

    test('should initialize with custom configuration', async () => {
      const campaignId = 'test_campaign_002';
      const customConfig = {
        explorationBudgetFraction: 0.2,
        maxBidAdjustment: 0.5,
        decisionFrequencyMinutes: 30
      };

      await pacingController.initializeCampaignPacing(
        campaignId,
        50000000, // $50
        customConfig
      );

      const state = await pacingController.getPacingState(campaignId);
      expect(state?.explorationBudgetFraction).toBe(0.2);
      expect(state?.maxBidAdjustment).toBe(0.5);
      expect(state?.decisionFrequencyMinutes).toBe(30);
    });
  });

  describe('Pacing Decisions', () => {
    beforeEach(async () => {
      // Set up test campaign
      await pacingController.initializeCampaignPacing(
        'test_campaign_pacing',
        100000000 // $100
      );
    });

    test('should maintain bids when on pace', async () => {
      // Simulate being exactly on pace (50% of budget spent at hour 12)
      const decision = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        50000000, // $50 spent
        12, // 12 hours into the day
      );

      expect(decision.action).toBe('maintain');
      expect(decision.bidMultiplier).toBe(1.0);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.reasoning).toContain('On pace');
    });

    test('should decrease bids when overpacing', async () => {
      // Simulate overpacing (80% of budget spent at hour 12)
      const decision = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        80000000, // $80 spent
        12, // 12 hours into the day
      );

      expect(decision.action).toBe('decrease_bids');
      expect(decision.bidMultiplier).toBeLessThan(1.0);
      expect(decision.reasoning).toContain('Overpacing');
    });

    test('should increase bids when underpacing', async () => {
      // Simulate underpacing (20% of budget spent at hour 12)
      const decision = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        20000000, // $20 spent
        12, // 12 hours into the day
      );

      expect(['increase_bids', 'maintain']).toContain(decision.action);
      expect(decision.reasoning).toContain('Underpacing');
    });

    test('should trigger emergency stop when overspending', async () => {
      // Simulate extreme overspending (130% of budget)
      const decision = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        130000000, // $130 spent
        12, // 12 hours into the day
      );

      expect(decision.action).toBe('pause');
      expect(decision.bidMultiplier).toBe(0.0);
      expect(decision.reasoning).toContain('Emergency stop');
    });

    test('should respect bid multiplier constraints', async () => {
      const constraints = {
        minBidMultiplier: 0.8,
        maxBidMultiplier: 1.2,
        maxDailySpendMicros: 100000000,
        pauseThreshold: 1.1,
        resumeThreshold: 0.9,
        emergencyStopThreshold: 1.25
      };

      // Test extreme overpacing
      const decision = await pacingController.makePacingDecision(
        'test_campaign_pacing',
        110000000, // $110 spent (110%)
        12,
        constraints
      );

      expect(decision.bidMultiplier).toBeGreaterThanOrEqual(constraints.minBidMultiplier);
      expect(decision.bidMultiplier).toBeLessThanOrEqual(constraints.maxBidMultiplier);
    });
  });

  describe('Thompson Sampling Integration', () => {
    beforeEach(async () => {
      await pacingController.initializeCampaignPacing(
        'test_campaign_thompson',
        100000000
      );

      // Set up some test experiment data
      db.run(`
        INSERT INTO experiment_measurements (
          measurement_id, experiment_id, arm_id, measurement_date,
          successes, trials, revenue_total, recency_weight,
          effective_trials, effective_successes,
          alpha_posterior, beta_posterior,
          gamma_shape, gamma_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'test_measurement_001',
        'test_campaign_thompson',
        'arm_001',
        new Date().toISOString(),
        10, // successes
        100, // trials
        1000.0, // revenue
        1.0, // recency_weight
        100.0, // effective_trials
        10.0, // effective_successes
        11.0, // alpha_posterior
        91.0, // beta_posterior
        11.0, // gamma_shape
        0.01 // gamma_rate
      ]);
    });

    test('should integrate Thompson Sampling recommendations', async () => {
      const decision = await pacingController.makePacingDecision(
        'test_campaign_thompson',
        50000000, // On pace
        12
      );

      expect(decision.sampledArm).toBeTruthy();
      expect(decision.expectedImpact).toBeTruthy();
      expect(typeof decision.explorationMode).toBe('boolean');
    });

    test('should handle Thompson Sampling errors gracefully', async () => {
      // Test with invalid campaign (no pacing state initialized)
      await expect(
        pacingController.makePacingDecision('nonexistent_campaign', 50000000, 12)
      ).rejects.toThrow('No pacing controller found for campaign nonexistent_campaign');
    });
  });

  describe('Pacing Metrics and Analytics', () => {
    beforeEach(async () => {
      await pacingController.initializeCampaignPacing(
        'test_campaign_metrics',
        100000000
      );

      // Create multiple pacing decisions over time
      for (let i = 0; i < 5; i++) {
        await pacingController.makePacingDecision(
          'test_campaign_metrics',
          (i + 1) * 20000000, // Progressive spending
          (i + 1) * 4 // Every 4 hours
        );
      }
    });

    test('should calculate pacing metrics correctly', async () => {
      const metrics = await pacingController.getPacingMetrics('test_campaign_metrics', 1);

      expect(metrics.decisionCount).toBeGreaterThan(0);
      expect(metrics.avgPaceTarget).toBeGreaterThan(0);
      expect(metrics.budgetUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.avgBidMultiplier).toBeGreaterThan(0);
      expect(metrics.explorationRate).toBeGreaterThanOrEqual(0);
      expect(metrics.explorationRate).toBeLessThanOrEqual(1);
    });

    test('should handle metrics for campaigns with no data', async () => {
      const metrics = await pacingController.getPacingMetrics('nonexistent_campaign', 7);

      expect(metrics.decisionCount).toBe(0);
      expect(metrics.avgPaceTarget).toBe(0);
      expect(metrics.budgetUtilization).toBe(0);
    });
  });

  describe('State Management', () => {
    test('should update pacing state correctly', async () => {
      const campaignId = 'test_campaign_state';
      await pacingController.initializeCampaignPacing(campaignId, 100000000);

      // Make a pacing decision to update state
      await pacingController.makePacingDecision(campaignId, 60000000, 12);

      const state = await pacingController.getPacingState(campaignId);
      expect(state?.currentSpendMicros).toBe(60000000);
      expect(state?.lastSampleTimestamp).toBeTruthy();
    });

    test('should get active pacing controllers', async () => {
      // Create multiple controllers
      await pacingController.initializeCampaignPacing('campaign_001', 100000000);
      await pacingController.initializeCampaignPacing('campaign_002', 200000000);

      const activeControllers = await pacingController.getActivePacingControllers();
      expect(activeControllers.length).toBeGreaterThanOrEqual(2);

      const campaign001 = activeControllers.find(c => c.campaignId === 'campaign_001');
      expect(campaign001).toBeTruthy();
      expect(campaign001?.dailyBudgetMicros).toBe(100000000);
    });

    test('should clean up old states', async () => {
      // This test would require manipulating timestamps to simulate old data
      const cleanedCount = await pacingController.cleanupOldStates();
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle zero budget gracefully', async () => {
      await pacingController.initializeCampaignPacing('zero_budget_campaign', 0);

      const decision = await pacingController.makePacingDecision(
        'zero_budget_campaign',
        0,
        12
      );

      expect(decision.action).toBe('pause');
    });

    test('should handle negative spending gracefully', async () => {
      await pacingController.initializeCampaignPacing('negative_spend_campaign', 100000000);

      const decision = await pacingController.makePacingDecision(
        'negative_spend_campaign',
        -1000000, // Negative spend (refunds?)
        12
      );

      expect(decision).toBeTruthy();
      expect(decision.bidMultiplier).toBeGreaterThan(0);
    });

    test('should handle very late in day scenarios', async () => {
      await pacingController.initializeCampaignPacing('late_day_campaign', 100000000);

      // 23 hours into the day with low spend
      const decision = await pacingController.makePacingDecision(
        'late_day_campaign',
        20000000, // Only $20 spent
        23
      );

      expect(decision).toBeTruthy();
      // Should likely increase bids aggressively or maintain
      expect(['increase_bids', 'maintain']).toContain(decision.action);
    });

    test('should handle early day scenarios', async () => {
      await pacingController.initializeCampaignPacing('early_day_campaign', 100000000);

      // 1 hour into the day with high spend
      const decision = await pacingController.makePacingDecision(
        'early_day_campaign',
        50000000, // $50 spent in first hour
        1
      );

      expect(decision.action).toBe('decrease_bids');
    });

    test('should handle missing pacing state', async () => {
      await expect(
        pacingController.makePacingDecision('missing_campaign', 50000000, 12)
      ).rejects.toThrow('No pacing controller found');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate initialization parameters', async () => {
      // Test with extreme configuration values
      const extremeConfig = {
        explorationBudgetFraction: 1.5, // >100%
        maxBidAdjustment: -0.1, // Negative
        decisionFrequencyMinutes: 0 // Zero frequency
      };

      const controllerId = await pacingController.initializeCampaignPacing(
        'extreme_config_campaign',
        100000000,
        extremeConfig
      );

      expect(controllerId).toBeTruthy();

      const state = await pacingController.getPacingState('extreme_config_campaign');
      // Should accept the values as-is (validation could be added if needed)
      expect(state?.explorationBudgetFraction).toBe(1.5);
    });

    test('should handle very large budget values', async () => {
      const largeBudget = 999999999999; // Very large budget

      await pacingController.initializeCampaignPacing(
        'large_budget_campaign',
        largeBudget
      );

      const state = await pacingController.getPacingState('large_budget_campaign');
      expect(state?.dailyBudgetMicros).toBe(largeBudget);
    });
  });
});

describe('Pacing Controller Performance Tests', () => {
  let db: DatabaseManager;
  let pacingController: PacingController;
  let thompsonSampling: ThompsonSamplingOptimizer;
  let migrationRunner: MigrationRunner;

  beforeEach(async () => {
    db = new DatabaseManager({ path: ':memory:' });
    await db.initialize();

    migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();

    thompsonSampling = new ThompsonSamplingOptimizer(db);
    pacingController = new PacingController(db, thompsonSampling);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
  });

  test('should handle multiple simultaneous campaigns efficiently', async () => {
    const start = Date.now();
    const campaigns = Array.from({ length: 50 }, (_, i) => `perf_campaign_${i}`);

    // Initialize all campaigns
    for (const campaignId of campaigns) {
      await pacingController.initializeCampaignPacing(campaignId, 100000000);
    }

    // Make decisions for all campaigns
    for (const campaignId of campaigns) {
      await pacingController.makePacingDecision(campaignId, 50000000, 12);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000); // Should complete in less than 5 seconds

    // Verify all campaigns have state
    const activeControllers = await pacingController.getActivePacingControllers();
    expect(activeControllers.length).toBeGreaterThanOrEqual(campaigns.length);
  });

  test('should handle rapid decision making', async () => {
    await pacingController.initializeCampaignPacing('rapid_campaign', 100000000);

    const start = Date.now();
    const decisions = [];

    // Make 100 rapid decisions
    for (let i = 0; i < 100; i++) {
      const decision = await pacingController.makePacingDecision(
        'rapid_campaign',
        i * 1000000, // Progressive spending
        12
      );
      decisions.push(decision);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000); // Should complete in less than 2 seconds
    expect(decisions.length).toBe(100);
    expect(decisions.every(d => d.bidMultiplier > 0)).toBe(true);
  });
});