/**
 * Comprehensive Tests for Feature Flag Manager
 * Tests gradual rollout, targeting, and safety controls for Thompson Sampling v2.0
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { FeatureFlagManager, FeatureFlag } from '../optimization/feature-flag-manager.js';
import * as fs from 'fs';
import * as path from 'path';

// Test database setup
const TEST_DB_PATH = ':memory:';
let db: DatabaseManager;
let flagManager: FeatureFlagManager;

describe('Feature Flag Manager Tests', () => {
  beforeEach(async () => {
    // Initialize test database
    db = new DatabaseManager({ path: TEST_DB_PATH });
    await db.initialize();

    // Apply v2.1 migration which contains the feature_flags table
    const migrationPath = path.join(__dirname, '../database/migrations/v2.1-thompson-sampling-lag-profiles.sql');
    if (fs.existsSync(migrationPath)) {
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      db.exec(migrationSQL);
    }

    flagManager = new FeatureFlagManager(db);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
  });

  describe('Default Flag Initialization', () => {
    test('should initialize all v2.0 default flags', async () => {
      await flagManager.initializeDefaultFlags();

      const allFlags = await flagManager.getAllFeatureFlags();
      expect(allFlags.length).toBeGreaterThanOrEqual(5);

      // Check specific v2.0 flags
      const expectedFlags = [
        'lag_aware_posterior_updates',
        'hierarchical_empirical_bayes',
        'recency_lag_adjusted_stats',
        'pacing_controller_integration',
        'conversion_lag_bucket_collection'
      ];

      for (const flagName of expectedFlags) {
        const flag = allFlags.find(f => f.flagName === flagName);
        expect(flag).toBeTruthy();
        expect(flag?.configJson).toBeTruthy();
      }

      // Check that conversion_lag_bucket_collection is enabled by default
      const lagBucketFlag = await flagManager.getFeatureFlag('conversion_lag_bucket_collection');
      expect(lagBucketFlag?.enabled).toBe(true);
      expect(lagBucketFlag?.rolloutPercentage).toBe(100);
    });

    test('should not overwrite existing flags', async () => {
      // Initialize flags first time
      await flagManager.initializeDefaultFlags();

      // Modify a flag
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);

      // Initialize again
      await flagManager.initializeDefaultFlags();

      // Should preserve the modification
      const flag = await flagManager.getFeatureFlag('lag_aware_posterior_updates');
      expect(flag?.rolloutPercentage).toBe(50);
    });
  });

  describe('Feature Flag Basic Operations', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should enable feature flag with rollout percentage', async () => {
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 25);

      const flag = await flagManager.getFeatureFlag('lag_aware_posterior_updates');
      expect(flag?.enabled).toBe(true);
      expect(flag?.rolloutPercentage).toBe(25);
      expect(flag?.enabledAt).toBeTruthy();
    });

    test('should enable feature flag with target campaigns', async () => {
      const targetCampaigns = ['campaign_001', 'campaign_002'];

      await flagManager.enableFeatureFlag(
        'hierarchical_empirical_bayes',
        100,
        targetCampaigns
      );

      const flag = await flagManager.getFeatureFlag('hierarchical_empirical_bayes');
      expect(flag?.enabled).toBe(true);
      expect(flag?.targetCampaigns).toEqual(targetCampaigns);
    });

    test('should disable feature flag', async () => {
      // First enable it
      await flagManager.enableFeatureFlag('recency_lag_adjusted_stats', 50);

      // Then disable it
      await flagManager.disableFeatureFlag('recency_lag_adjusted_stats', 'test disable');

      const flag = await flagManager.getFeatureFlag('recency_lag_adjusted_stats');
      expect(flag?.enabled).toBe(false);
      expect(flag?.disabledAt).toBeTruthy();
    });

    test('should validate rollout percentage bounds', async () => {
      // Test upper bound
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 150);
      const upperFlag = await flagManager.getFeatureFlag('lag_aware_posterior_updates');
      expect(upperFlag?.rolloutPercentage).toBe(100);

      // Test lower bound
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', -10);
      const lowerFlag = await flagManager.getFeatureFlag('lag_aware_posterior_updates');
      expect(lowerFlag?.rolloutPercentage).toBe(0);
    });
  });

  describe('Feature Enablement Logic', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should check feature enablement with rollout percentage', async () => {
      // Enable at 50% rollout
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);

      // Test deterministic behavior
      const campaignId = 'test_campaign_001';
      const result1 = await flagManager.isFeatureEnabled('lag_aware_posterior_updates', campaignId);
      const result2 = await flagManager.isFeatureEnabled('lag_aware_posterior_updates', campaignId);

      // Should be consistent
      expect(result1).toBe(result2);
    });

    test('should respect target campaign restrictions', async () => {
      const targetCampaigns = ['campaign_001', 'campaign_002'];

      await flagManager.enableFeatureFlag(
        'hierarchical_empirical_bayes',
        100,
        targetCampaigns
      );

      // Should be enabled for target campaigns
      expect(
        await flagManager.isFeatureEnabled('hierarchical_empirical_bayes', 'campaign_001')
      ).toBe(true);

      // Should be disabled for non-target campaigns
      expect(
        await flagManager.isFeatureEnabled('hierarchical_empirical_bayes', 'campaign_999')
      ).toBe(false);
    });

    test('should return false for disabled flags', async () => {
      await flagManager.disableFeatureFlag('lag_aware_posterior_updates');

      expect(
        await flagManager.isFeatureEnabled('lag_aware_posterior_updates', 'any_campaign')
      ).toBe(false);
    });

    test('should return false for non-existent flags', async () => {
      expect(
        await flagManager.isFeatureEnabled('non_existent_flag', 'any_campaign')
      ).toBe(false);
    });

    test('should handle 100% rollout correctly', async () => {
      await flagManager.enableFeatureFlag('pacing_controller_integration', 100);

      // Should be enabled for all campaigns
      const campaigns = ['campaign_001', 'campaign_002', 'campaign_999'];
      for (const campaignId of campaigns) {
        expect(
          await flagManager.isFeatureEnabled('pacing_controller_integration', campaignId)
        ).toBe(true);
      }
    });

    test('should handle 0% rollout correctly', async () => {
      await flagManager.enableFeatureFlag('recency_lag_adjusted_stats', 0);

      // Should be disabled for all campaigns
      const campaigns = ['campaign_001', 'campaign_002', 'campaign_999'];
      for (const campaignId of campaigns) {
        expect(
          await flagManager.isFeatureEnabled('recency_lag_adjusted_stats', campaignId)
        ).toBe(false);
      }
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should get and set feature flag configuration', async () => {
      const config = {
        custom_parameter: 'test_value',
        numeric_parameter: 42,
        boolean_parameter: true
      };

      await flagManager.setFeatureFlagConfig('lag_aware_posterior_updates', config);

      const retrievedConfig = await flagManager.getFeatureFlagConfig('lag_aware_posterior_updates');
      expect(retrievedConfig).toEqual(config);
    });

    test('should handle invalid JSON configuration gracefully', async () => {
      // Manually insert invalid JSON
      db.run(`
        UPDATE feature_flags
        SET config_json = ?
        WHERE flag_name = ?
      `, ['invalid json{', 'lag_aware_posterior_updates']);

      const config = await flagManager.getFeatureFlagConfig('lag_aware_posterior_updates');
      expect(config).toBeNull();
    });

    test('should return null for missing configuration', async () => {
      const config = await flagManager.getFeatureFlagConfig('non_existent_flag');
      expect(config).toBeNull();
    });
  });

  describe('Gradual Rollout', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 10);
    });

    test('should increase rollout gradually', async () => {
      const result = await flagManager.gradualRollout(
        'lag_aware_posterior_updates',
        30, // target
        10, // increment
        0 // wait hours (0 for testing)
      );

      expect(result.success).toBe(true);
      expect(result.currentPercentage).toBe(20); // 10 + 10
      expect(result.message).toContain('increased');
    });

    test('should respect maximum percentage increase limits', async () => {
      // Try to increase by more than the default limit (10% per hour)
      const result = await flagManager.gradualRollout(
        'lag_aware_posterior_updates',
        50, // target
        25, // increment (exceeds limit)
        0
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('increase');
    });

    test('should not exceed target percentage', async () => {
      const result = await flagManager.gradualRollout(
        'lag_aware_posterior_updates',
        15, // target
        20, // increment (larger than needed)
        0
      );

      expect(result.success).toBe(true);
      expect(result.currentPercentage).toBe(15); // Should cap at target
    });

    test('should handle already at target scenario', async () => {
      // First set to 15% which is within the 10% increase limit from current 10%
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 15);

      const result = await flagManager.gradualRollout(
        'lag_aware_posterior_updates',
        15, // same as current
        10,
        0
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Already at target');
    });

    test('should fail for disabled flags', async () => {
      await flagManager.disableFeatureFlag('lag_aware_posterior_updates');

      const result = await flagManager.gradualRollout(
        'lag_aware_posterior_updates',
        50,
        10,
        0
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not enabled');
    });
  });

  describe('Campaign Targeting', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should add target campaigns', async () => {
      const campaignIds = ['campaign_001', 'campaign_002', 'campaign_003'];

      await flagManager.addTargetCampaigns('hierarchical_empirical_bayes', campaignIds);

      const flag = await flagManager.getFeatureFlag('hierarchical_empirical_bayes');
      expect(flag?.targetCampaigns).toEqual(campaignIds);
    });

    test('should remove target campaigns', async () => {
      const initialCampaigns = ['campaign_001', 'campaign_002', 'campaign_003'];
      const toRemove = ['campaign_002'];

      await flagManager.addTargetCampaigns('hierarchical_empirical_bayes', initialCampaigns);
      await flagManager.removeTargetCampaigns('hierarchical_empirical_bayes', toRemove);

      const flag = await flagManager.getFeatureFlag('hierarchical_empirical_bayes');
      expect(flag?.targetCampaigns).toEqual(['campaign_001', 'campaign_003']);
    });

    test('should prevent duplicate campaign targets', async () => {
      const campaignIds = ['campaign_001', 'campaign_002'];

      await flagManager.addTargetCampaigns('hierarchical_empirical_bayes', campaignIds);
      await flagManager.addTargetCampaigns('hierarchical_empirical_bayes', ['campaign_002', 'campaign_003']);

      const flag = await flagManager.getFeatureFlag('hierarchical_empirical_bayes');
      expect(flag?.targetCampaigns?.length).toBe(3); // No duplicates
      expect(flag?.targetCampaigns).toContain('campaign_001');
      expect(flag?.targetCampaigns).toContain('campaign_002');
      expect(flag?.targetCampaigns).toContain('campaign_003');
    });

    test('should enforce maximum target campaigns limit', async () => {
      // Create more campaigns than the limit (100)
      const manyCampaigns = Array.from({ length: 105 }, (_, i) => `campaign_${i.toString().padStart(3, '0')}`);

      await expect(
        flagManager.addTargetCampaigns('hierarchical_empirical_bayes', manyCampaigns)
      ).rejects.toThrow('exceed limit');
    });

    test('should handle removing from non-existent flag gracefully', async () => {
      await expect(
        flagManager.removeTargetCampaigns('non_existent_flag', ['campaign_001'])
      ).resolves.not.toThrow();
    });
  });

  describe('Emergency Controls', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
      // Enable some flags first
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);
      await flagManager.enableFeatureFlag('hierarchical_empirical_bayes', 75);
      await flagManager.enableFeatureFlag('recency_lag_adjusted_stats', 25);
      await flagManager.enableFeatureFlag('pacing_controller_integration', 10);
    });

    test('should emergency disable all v2.0 features', async () => {
      await flagManager.emergencyDisableAll('Test emergency scenario');

      // Check that all v2.0 flags are disabled (except conversion_lag_bucket_collection)
      const v2Flags = [
        'lag_aware_posterior_updates',
        'hierarchical_empirical_bayes',
        'recency_lag_adjusted_stats',
        'pacing_controller_integration'
      ];

      for (const flagName of v2Flags) {
        const flag = await flagManager.getFeatureFlag(flagName);
        expect(flag?.enabled).toBe(false);
        expect(flag?.disabledAt).toBeTruthy();
      }

      // conversion_lag_bucket_collection should remain enabled (not part of emergency disable)
      const lagBucketFlag = await flagManager.getFeatureFlag('conversion_lag_bucket_collection');
      expect(lagBucketFlag?.enabled).toBe(true);
    });
  });

  describe('Rollout Status and Analytics', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should get comprehensive rollout status', async () => {
      // Enable some flags with different percentages
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);
      await flagManager.enableFeatureFlag('hierarchical_empirical_bayes', 75);

      const status = await flagManager.getRolloutStatus();

      expect(status.totalFeatures).toBe(5);
      expect(status.enabledFeatures).toBeGreaterThanOrEqual(1); // conversion_lag_bucket_collection is enabled by default
      expect(status.avgRolloutPercentage).toBeGreaterThan(0);
      expect(status.features).toHaveLength(5);

      // Check specific features
      const lagAwareFeature = status.features.find(f => f.name === 'lag_aware_posterior_updates');
      expect(lagAwareFeature?.enabled).toBe(true);
      expect(lagAwareFeature?.rolloutPercentage).toBe(50);
    });

    test('should handle all disabled features', async () => {
      // Disable all features
      await flagManager.emergencyDisableAll('Test scenario');
      await flagManager.disableFeatureFlag('conversion_lag_bucket_collection');

      const status = await flagManager.getRolloutStatus();

      expect(status.enabledFeatures).toBe(0);
      expect(status.avgRolloutPercentage).toBe(0);
    });
  });

  describe('Deterministic Hash Testing', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);
    });

    test('should provide consistent results for same input', async () => {
      const campaignId = 'test_campaign_consistency';

      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await flagManager.isFeatureEnabled('lag_aware_posterior_updates', campaignId);
        results.push(result);
      }

      // All results should be the same
      expect(results.every(r => r === results[0])).toBe(true);
    });

    test('should provide good distribution across different campaigns', async () => {
      // Test with 50% rollout
      const campaigns = Array.from({ length: 1000 }, (_, i) => `campaign_${i}`);
      const enabledCount = await Promise.all(
        campaigns.map(async (campaignId) =>
          await flagManager.isFeatureEnabled('lag_aware_posterior_updates', campaignId)
        )
      ).then(results => results.filter(Boolean).length);

      // Should be roughly 50% (allow 10% variance)
      const percentage = (enabledCount / campaigns.length) * 100;
      expect(percentage).toBeGreaterThan(40);
      expect(percentage).toBeLessThan(60);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should handle very large rollout percentages', async () => {
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 999999);

      const flag = await flagManager.getFeatureFlag('lag_aware_posterior_updates');
      expect(flag?.rolloutPercentage).toBe(100); // Should be capped
    });

    test('should handle negative rollout percentages', async () => {
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', -50);

      const flag = await flagManager.getFeatureFlag('lag_aware_posterior_updates');
      expect(flag?.rolloutPercentage).toBe(0); // Should be floored
    });

    test('should handle special characters in campaign IDs', async () => {
      const specialCampaignId = 'campaign_with_special_chars_!@#$%^&*()';

      const result = await flagManager.isFeatureEnabled('lag_aware_posterior_updates', specialCampaignId);
      expect(typeof result).toBe('boolean');
    });

    test('should handle empty and null campaign IDs', async () => {
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);

      const resultEmpty = await flagManager.isFeatureEnabled('lag_aware_posterior_updates', '');
      const resultUndefined = await flagManager.isFeatureEnabled('lag_aware_posterior_updates', undefined);

      expect(typeof resultEmpty).toBe('boolean');
      expect(typeof resultUndefined).toBe('boolean');
    });

    test('should handle concurrent flag modifications', async () => {
      // Simulate concurrent operations
      const operations = [
        flagManager.enableFeatureFlag('lag_aware_posterior_updates', 25),
        flagManager.enableFeatureFlag('hierarchical_empirical_bayes', 50),
        flagManager.addTargetCampaigns('recency_lag_adjusted_stats', ['campaign_001']),
        flagManager.setFeatureFlagConfig('pacing_controller_integration', { test: true })
      ];

      await Promise.all(operations);

      // All operations should complete successfully
      const flags = await flagManager.getAllFeatureFlags();
      expect(flags.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Performance Tests', () => {
    beforeEach(async () => {
      await flagManager.initializeDefaultFlags();
    });

    test('should handle many feature enablement checks efficiently', async () => {
      await flagManager.enableFeatureFlag('lag_aware_posterior_updates', 50);

      const start = Date.now();
      const checks = [];

      for (let i = 0; i < 1000; i++) {
        checks.push(
          flagManager.isFeatureEnabled('lag_aware_posterior_updates', `campaign_${i}`)
        );
      }

      await Promise.all(checks);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    test('should handle many flag modifications efficiently', async () => {
      const start = Date.now();
      const modifications = [];

      for (let i = 0; i < 100; i++) {
        modifications.push(
          flagManager.setFeatureFlagConfig(`test_flag_${i}`, { iteration: i })
        );
      }

      // Most will fail since flags don't exist, but should not crash
      await Promise.allSettled(modifications);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000); // Should complete in less than 2 seconds
    });
  });
});