/**
 * Feature Flag Manager for Thompson Sampling v2.0 Gradual Rollout
 * Manages feature flags for lag-aware enhancements with safe rollout controls
 */

import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';

export interface FeatureFlag {
  flagName: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetCampaigns?: string[]; // JSON array of campaign IDs
  configJson?: string; // JSON configuration for the feature
  createdBy: string;
  enabledAt?: string;
  disabledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagConfig {
  [key: string]: any;
}

export interface RolloutConstraints {
  maxPercentageIncreasePerHour: number; // Max increase in rollout percentage per hour
  minStabilityPeriodHours: number; // Min time between rollout increases
  maxTargetCampaigns: number; // Max number of campaigns to target
  emergencyDisableThreshold: number; // Error rate that triggers emergency disable
}

/**
 * Manages feature flags for gradual rollout of Thompson Sampling v2.0 features
 */
export class FeatureFlagManager {
  private db: DatabaseManager;
  private defaultConstraints: RolloutConstraints = {
    maxPercentageIncreasePerHour: 10.0, // Max 10% increase per hour
    minStabilityPeriodHours: 2, // Wait 2 hours between increases
    maxTargetCampaigns: 100, // Max 100 targeted campaigns
    emergencyDisableThreshold: 0.05 // 5% error rate triggers emergency disable
  };

  // Default v2.0 feature flags
  private readonly defaultFlags: Partial<FeatureFlag>[] = [
    {
      flagName: 'lag_aware_posterior_updates',
      enabled: false,
      rolloutPercentage: 0.0,
      configJson: JSON.stringify({
        min_lag_days: 1,
        max_lag_days: 90,
        confidence_threshold: 0.6
      })
    },
    {
      flagName: 'hierarchical_empirical_bayes',
      enabled: false,
      rolloutPercentage: 0.0,
      configJson: JSON.stringify({
        global_prior_strength: 10,
        campaign_prior_strength: 5,
        update_frequency_hours: 24
      })
    },
    {
      flagName: 'recency_lag_adjusted_stats',
      enabled: false,
      rolloutPercentage: 0.0,
      configJson: JSON.stringify({
        recency_half_life_days: 14,
        min_effective_trials: 10
      })
    },
    {
      flagName: 'pacing_controller_integration',
      enabled: false,
      rolloutPercentage: 0.0,
      configJson: JSON.stringify({
        max_bid_adjustment: 0.25,
        exploration_budget: 0.1,
        decision_frequency: 60
      })
    },
    {
      flagName: 'conversion_lag_bucket_collection',
      enabled: true,
      rolloutPercentage: 100.0,
      configJson: JSON.stringify({
        api_fields: ['segments.conversion_or_adjustment_lag_bucket'],
        cache_hours: 24
      })
    }
  ];

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Initialize feature flags with default v2.0 flags
   */
  async initializeDefaultFlags(): Promise<void> {
    const now = new Date().toISOString();

    for (const flag of this.defaultFlags) {
      const existing = await this.getFeatureFlag(flag.flagName!);
      if (!existing) {
        this.db.run(`
          INSERT INTO feature_flags (
            flag_name, enabled, rollout_percentage, target_campaigns,
            config_json, created_by, enabled_at, disabled_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          flag.flagName,
          flag.enabled ? 1 : 0,
          flag.rolloutPercentage,
          null, // target_campaigns
          flag.configJson,
          'thompson_sampling_v2.0',
          flag.enabled ? now : null,
          null, // disabled_at
          now,
          now
        ]);

        logger.info(`✅ Initialized feature flag: ${flag.flagName}`, {
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage
        });
      }
    }
  }

  /**
   * Check if a feature is enabled for a given campaign
   */
  async isFeatureEnabled(
    flagName: string,
    campaignId?: string,
    userId?: string
  ): Promise<boolean> {
    const flag = await this.getFeatureFlag(flagName);
    if (!flag || !flag.enabled) {
      return false;
    }

    // If specific campaigns are targeted, check if this campaign is included
    if (flag.targetCampaigns && flag.targetCampaigns.length > 0 && campaignId) {
      if (!flag.targetCampaigns.includes(campaignId)) {
        return false;
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage >= 100) {
      return true;
    }

    if (flag.rolloutPercentage <= 0) {
      return false;
    }

    // Use deterministic hash for consistent rollout
    const hashInput = campaignId || userId || 'default';
    const hash = this.deterministicHash(hashInput + flagName);
    const percentage = (hash % 10000) / 100; // 0-99.99

    return percentage < flag.rolloutPercentage;
  }

  /**
   * Get feature flag configuration
   */
  async getFeatureFlagConfig<T = FeatureFlagConfig>(flagName: string): Promise<T | null> {
    const flag = await this.getFeatureFlag(flagName);
    if (!flag || !flag.configJson) {
      return null;
    }

    try {
      return JSON.parse(flag.configJson) as T;
    } catch (error) {
      logger.warn(`Failed to parse config for flag ${flagName}:`, error);
      return null;
    }
  }

  /**
   * Enable a feature flag
   */
  async enableFeatureFlag(
    flagName: string,
    rolloutPercentage: number = 100,
    targetCampaigns?: string[]
  ): Promise<void> {
    const now = new Date().toISOString();

    // Validate rollout percentage increase
    const currentFlag = await this.getFeatureFlag(flagName);
    if (currentFlag && currentFlag.enabled) {
      // Skip validation if we're already at the target percentage
      if (currentFlag.rolloutPercentage !== rolloutPercentage) {
        await this.validateRolloutIncrease(flagName, rolloutPercentage);
      }
    }

    this.db.run(`
      UPDATE feature_flags
      SET enabled = 1,
          rollout_percentage = ?,
          target_campaigns = ?,
          enabled_at = ?,
          updated_at = ?
      WHERE flag_name = ?
    `, [
      Math.min(100, Math.max(0, rolloutPercentage)),
      targetCampaigns ? JSON.stringify(targetCampaigns) : null,
      now,
      now,
      flagName
    ]);

    logger.info(`✅ Enabled feature flag: ${flagName}`, {
      rolloutPercentage,
      targetCampaigns: targetCampaigns?.length || 0
    });
  }

  /**
   * Disable a feature flag
   */
  async disableFeatureFlag(flagName: string, reason?: string): Promise<void> {
    const now = new Date().toISOString();

    this.db.run(`
      UPDATE feature_flags
      SET enabled = 0,
          disabled_at = ?,
          updated_at = ?
      WHERE flag_name = ?
    `, [now, now, flagName]);

    logger.warn(`⚠️ Disabled feature flag: ${flagName}`, { reason });
  }

  /**
   * Gradually increase rollout percentage
   */
  async gradualRollout(
    flagName: string,
    targetPercentage: number,
    incrementPerStep: number = 10,
    waitHours: number = 2
  ): Promise<{ success: boolean; currentPercentage: number; message: string }> {
    const flag = await this.getFeatureFlag(flagName);
    if (!flag) {
      return {
        success: false,
        currentPercentage: 0,
        message: `Feature flag ${flagName} not found`
      };
    }

    if (!flag.enabled) {
      return {
        success: false,
        currentPercentage: flag.rolloutPercentage,
        message: `Feature flag ${flagName} is not enabled`
      };
    }

    // Check if we can increase rollout
    try {
      const newPercentage = Math.min(
        targetPercentage,
        flag.rolloutPercentage + incrementPerStep
      );

      await this.validateRolloutIncrease(flagName, newPercentage);

      if (newPercentage > flag.rolloutPercentage) {
        this.db.run(`
          UPDATE feature_flags
          SET rollout_percentage = ?,
              updated_at = ?
          WHERE flag_name = ?
        `, [newPercentage, new Date().toISOString(), flagName]);

        logger.info(`📈 Increased rollout for ${flagName}: ${flag.rolloutPercentage}% → ${newPercentage}%`);

        return {
          success: true,
          currentPercentage: newPercentage,
          message: `Rollout increased to ${newPercentage}%`
        };
      } else {
        return {
          success: true,
          currentPercentage: flag.rolloutPercentage,
          message: `Already at target rollout percentage`
        };
      }
    } catch (error) {
      return {
        success: false,
        currentPercentage: flag.rolloutPercentage,
        message: `Cannot increase rollout: ${error instanceof Error ? error.message : error}`
      };
    }
  }

  /**
   * Emergency disable all v2.0 features
   */
  async emergencyDisableAll(reason: string): Promise<void> {
    const v2Features = [
      'lag_aware_posterior_updates',
      'hierarchical_empirical_bayes',
      'recency_lag_adjusted_stats',
      'pacing_controller_integration'
    ];

    const now = new Date().toISOString();

    for (const flagName of v2Features) {
      this.db.run(`
        UPDATE feature_flags
        SET enabled = 0,
            disabled_at = ?,
            updated_at = ?
        WHERE flag_name = ?
      `, [now, now, flagName]);
    }

    logger.error(`🚨 EMERGENCY DISABLE ALL v2.0 features`, { reason });
  }

  /**
   * Get feature flag details
   */
  async getFeatureFlag(flagName: string): Promise<FeatureFlag | null> {
    const row = this.db.get<any>(`
      SELECT * FROM feature_flags WHERE flag_name = ?
    `, [flagName]);

    if (!row) return null;

    return {
      flagName: row.flag_name,
      enabled: Boolean(row.enabled),
      rolloutPercentage: row.rollout_percentage,
      targetCampaigns: row.target_campaigns ? JSON.parse(row.target_campaigns) : undefined,
      configJson: row.config_json,
      createdBy: row.created_by,
      enabledAt: row.enabled_at,
      disabledAt: row.disabled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Get all feature flags
   */
  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    const rows = this.db.all<any>(`
      SELECT * FROM feature_flags ORDER BY flag_name
    `);

    return rows.map(row => ({
      flagName: row.flag_name,
      enabled: Boolean(row.enabled),
      rolloutPercentage: row.rollout_percentage,
      targetCampaigns: row.target_campaigns ? JSON.parse(row.target_campaigns) : undefined,
      configJson: row.config_json,
      createdBy: row.created_by,
      enabledAt: row.enabled_at,
      disabledAt: row.disabled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Validate rollout percentage increase
   */
  private async validateRolloutIncrease(
    flagName: string,
    newPercentage: number,
    constraints?: Partial<RolloutConstraints>
  ): Promise<void> {
    const effectiveConstraints = { ...this.defaultConstraints, ...constraints };
    const flag = await this.getFeatureFlag(flagName);

    if (!flag) {
      throw new Error(`Feature flag ${flagName} not found`);
    }

    // Check percentage increase limit
    const percentageIncrease = newPercentage - flag.rolloutPercentage;
    if (percentageIncrease > effectiveConstraints.maxPercentageIncreasePerHour) {
      throw new Error(
        `Percentage increase ${percentageIncrease}% exceeds limit of ${effectiveConstraints.maxPercentageIncreasePerHour}% per hour`
      );
    }

    // Check stability period
    const lastUpdate = new Date(flag.updatedAt);
    const hoursSinceLastUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastUpdate < effectiveConstraints.minStabilityPeriodHours && percentageIncrease > 0) {
      throw new Error(
        `Must wait ${effectiveConstraints.minStabilityPeriodHours} hours between rollout increases. Last update: ${hoursSinceLastUpdate.toFixed(1)}h ago`
      );
    }
  }

  /**
   * Deterministic hash function for consistent rollout
   */
  private deterministicHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get rollout status across all v2.0 features
   */
  async getRolloutStatus(): Promise<{
    totalFeatures: number;
    enabledFeatures: number;
    avgRolloutPercentage: number;
    features: Array<{
      name: string;
      enabled: boolean;
      rolloutPercentage: number;
      lastUpdated: string;
    }>;
  }> {
    const v2Features = [
      'lag_aware_posterior_updates',
      'hierarchical_empirical_bayes',
      'recency_lag_adjusted_stats',
      'pacing_controller_integration',
      'conversion_lag_bucket_collection'
    ];

    const features = [];
    let enabledCount = 0;
    let totalRollout = 0;

    for (const flagName of v2Features) {
      const flag = await this.getFeatureFlag(flagName);
      if (flag) {
        features.push({
          name: flagName,
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          lastUpdated: flag.updatedAt
        });

        if (flag.enabled) {
          enabledCount++;
          totalRollout += flag.rolloutPercentage;
        }
      }
    }

    return {
      totalFeatures: features.length,
      enabledFeatures: enabledCount,
      avgRolloutPercentage: enabledCount > 0 ? totalRollout / enabledCount : 0,
      features
    };
  }

  /**
   * Set feature flag configuration
   */
  async setFeatureFlagConfig(flagName: string, config: FeatureFlagConfig): Promise<void> {
    const configJson = JSON.stringify(config);

    this.db.run(`
      UPDATE feature_flags
      SET config_json = ?,
          updated_at = ?
      WHERE flag_name = ?
    `, [configJson, new Date().toISOString(), flagName]);

    logger.info(`🔧 Updated config for feature flag: ${flagName}`, { config });
  }

  /**
   * Add campaigns to feature flag targeting
   */
  async addTargetCampaigns(flagName: string, campaignIds: string[]): Promise<void> {
    const flag = await this.getFeatureFlag(flagName);
    if (!flag) {
      throw new Error(`Feature flag ${flagName} not found`);
    }

    const currentTargets = flag.targetCampaigns || [];
    const newTargets = [...new Set([...currentTargets, ...campaignIds])];

    if (newTargets.length > this.defaultConstraints.maxTargetCampaigns) {
      throw new Error(
        `Cannot add campaigns: would exceed limit of ${this.defaultConstraints.maxTargetCampaigns} targeted campaigns`
      );
    }

    this.db.run(`
      UPDATE feature_flags
      SET target_campaigns = ?,
          updated_at = ?
      WHERE flag_name = ?
    `, [JSON.stringify(newTargets), new Date().toISOString(), flagName]);

    logger.info(`🎯 Added ${campaignIds.length} target campaigns to ${flagName}`, {
      totalTargets: newTargets.length
    });
  }

  /**
   * Remove campaigns from feature flag targeting
   */
  async removeTargetCampaigns(flagName: string, campaignIds: string[]): Promise<void> {
    const flag = await this.getFeatureFlag(flagName);
    if (!flag || !flag.targetCampaigns) {
      return;
    }

    const newTargets = flag.targetCampaigns.filter(id => !campaignIds.includes(id));

    this.db.run(`
      UPDATE feature_flags
      SET target_campaigns = ?,
          updated_at = ?
      WHERE flag_name = ?
    `, [
      newTargets.length > 0 ? JSON.stringify(newTargets) : null,
      new Date().toISOString(),
      flagName
    ]);

    logger.info(`🎯 Removed ${campaignIds.length} target campaigns from ${flagName}`, {
      totalTargets: newTargets.length
    });
  }
}