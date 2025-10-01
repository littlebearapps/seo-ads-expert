-- SEO Ads Expert v2.0 - Thompson Sampling Lag-Aware Enhancement
-- Migration: Add lag_profiles table for conversion lag modeling
-- Created: 2025-01-20
-- Purpose: Enable lag-aware Thompson Sampling budget optimization

-- =============================================================================
-- CONVERSION LAG PROFILES
-- =============================================================================

-- Conversion lag completion curves for predictive optimization
-- Tracks how conversions arrive over time for different scopes
CREATE TABLE IF NOT EXISTS lag_profiles (
  scope_type TEXT CHECK(scope_type IN ('action','campaign','global')) NOT NULL,
  scope_id   TEXT NOT NULL,
  days_since INTEGER NOT NULL CHECK(days_since >= 0 AND days_since <= 90),
  completion_cdf REAL NOT NULL CHECK (completion_cdf BETWEEN 0.0 AND 1.0),
  sample_size INTEGER DEFAULT 0,
  confidence_score REAL DEFAULT 0.0 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  updated_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (scope_type, scope_id, days_since)
);

-- Indexes for efficient lag profile lookups
CREATE INDEX IF NOT EXISTS idx_lag_profiles_scope ON lag_profiles(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_lag_profiles_updated ON lag_profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_lag_profiles_confidence ON lag_profiles(confidence_score);

-- =============================================================================
-- EXPERIMENT MEASUREMENTS WITH LAG TRACKING
-- =============================================================================

-- Enhanced experiment measurements with conversion lag information
-- Extends existing experiment tracking with lag-aware statistics
CREATE TABLE IF NOT EXISTS experiment_measurements (
  measurement_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  measurement_date TEXT NOT NULL,

  -- Core Thompson Sampling statistics
  successes INTEGER DEFAULT 0,
  trials INTEGER DEFAULT 0,
  revenue_total REAL DEFAULT 0.0,

  -- Lag-aware enhancements
  lag_bucket TEXT, -- From Google Ads API: conversion_or_adjustment_lag_bucket
  days_since_impression INTEGER,
  is_lag_adjusted INTEGER DEFAULT 0, -- Boolean: has lag adjustment been applied

  -- Recency weighting
  recency_weight REAL DEFAULT 1.0 CHECK (recency_weight BETWEEN 0.0 AND 1.0),
  effective_trials REAL DEFAULT 0.0, -- Lag + recency adjusted trials
  effective_successes REAL DEFAULT 0.0, -- Lag + recency adjusted successes

  -- Posterior distribution parameters (after lag adjustment)
  alpha_posterior REAL DEFAULT 1.0,
  beta_posterior REAL DEFAULT 1.0,
  gamma_shape REAL DEFAULT 1.0,
  gamma_rate REAL DEFAULT 1.0,

  -- Thompson Sampling decision context
  exploration_bonus REAL DEFAULT 0.0,
  uncertainty_penalty REAL DEFAULT 0.0,
  confidence_interval_lower REAL,
  confidence_interval_upper REAL,

  -- Source tracking
  data_source TEXT DEFAULT 'google_ads', -- 'google_ads', 'analytics', 'estimated'
  api_call_id TEXT, -- For debugging API data sources

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for Thompson Sampling performance
CREATE INDEX IF NOT EXISTS idx_measurements_experiment ON experiment_measurements(experiment_id, measurement_date);
CREATE INDEX IF NOT EXISTS idx_measurements_arm ON experiment_measurements(arm_id, measurement_date);
CREATE INDEX IF NOT EXISTS idx_measurements_lag_bucket ON experiment_measurements(lag_bucket);
CREATE INDEX IF NOT EXISTS idx_measurements_lag_adjusted ON experiment_measurements(is_lag_adjusted);
CREATE INDEX IF NOT EXISTS idx_measurements_source ON experiment_measurements(data_source);

-- =============================================================================
-- HIERARCHICAL PRIORS CACHE
-- =============================================================================

-- Cache for hierarchical empirical Bayes priors
-- Stores learned priors at global, campaign, and conversion action levels
CREATE TABLE IF NOT EXISTS hierarchical_priors (
  prior_id TEXT PRIMARY KEY,
  level TEXT CHECK(level IN ('global', 'campaign', 'action')) NOT NULL,
  scope_id TEXT NOT NULL, -- 'global', campaign_id, or conversion_action_id
  metric TEXT CHECK(metric IN ('cvr', 'revenue_per_conversion')) NOT NULL,

  -- Beta distribution parameters for CVR
  alpha_prior REAL DEFAULT 1.0,
  beta_prior REAL DEFAULT 1.0,

  -- Gamma distribution parameters for revenue
  gamma_shape_prior REAL DEFAULT 1.0,
  gamma_rate_prior REAL DEFAULT 1.0,

  -- Prior strength and confidence
  effective_sample_size REAL DEFAULT 0.0,
  confidence_level REAL DEFAULT 0.0 CHECK (confidence_level BETWEEN 0.0 AND 1.0),

  -- Learning metadata
  last_update_size INTEGER DEFAULT 0, -- Number of observations used
  update_frequency_hours INTEGER DEFAULT 24,

  updated_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  UNIQUE(level, scope_id, metric)
);

-- Indexes for hierarchical prior lookups
CREATE INDEX IF NOT EXISTS idx_priors_level_scope ON hierarchical_priors(level, scope_id);
CREATE INDEX IF NOT EXISTS idx_priors_metric ON hierarchical_priors(metric);
CREATE INDEX IF NOT EXISTS idx_priors_updated ON hierarchical_priors(updated_at);

-- =============================================================================
-- PACING CONTROLLER STATE
-- =============================================================================

-- State tracking for budget pacing controller integration
CREATE TABLE IF NOT EXISTS pacing_controller_state (
  controller_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,

  -- Budget control parameters
  daily_budget_micros INTEGER NOT NULL,
  current_spend_micros INTEGER DEFAULT 0,
  pace_target REAL DEFAULT 1.0, -- Target pace (1.0 = on track)

  -- Thompson Sampling integration
  last_sample_timestamp TEXT,
  last_sampled_arm TEXT,
  expected_value_per_click REAL DEFAULT 0.0,
  confidence_in_estimate REAL DEFAULT 0.0,

  -- Pacing decisions
  current_bid_multiplier REAL DEFAULT 1.0,
  spend_rate_limit REAL DEFAULT 1.0, -- Max spend rate as fraction of budget

  -- Learning state
  exploration_budget_fraction REAL DEFAULT 0.1, -- Reserve for exploration
  exploitation_confidence_threshold REAL DEFAULT 0.8,

  -- Control parameters
  max_bid_adjustment REAL DEFAULT 0.25, -- ±25% max change
  decision_frequency_minutes INTEGER DEFAULT 60,

  updated_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for pacing controller
CREATE INDEX IF NOT EXISTS idx_pacing_campaign ON pacing_controller_state(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pacing_updated ON pacing_controller_state(updated_at);

-- =============================================================================
-- FEATURE FLAGS FOR GRADUAL ROLLOUT
-- =============================================================================

-- Feature flags for gradual rollout of lag-aware Thompson Sampling
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0 CHECK (enabled IN (0, 1)),
  rollout_percentage REAL DEFAULT 0.0 CHECK (rollout_percentage BETWEEN 0.0 AND 100.0),
  target_campaigns TEXT, -- JSON array of campaign IDs

  -- Feature-specific configuration
  config_json TEXT, -- JSON configuration for the feature

  -- Rollout control
  created_by TEXT DEFAULT 'thompson_sampling_v2.0',
  enabled_at TEXT,
  disabled_at TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default feature flags for Thompson Sampling v2.0
INSERT OR IGNORE INTO feature_flags (flag_name, enabled, rollout_percentage, config_json) VALUES
('lag_aware_posterior_updates', 0, 0.0, '{"min_lag_days": 1, "max_lag_days": 90, "confidence_threshold": 0.6}'),
('hierarchical_empirical_bayes', 0, 0.0, '{"global_prior_strength": 10, "campaign_prior_strength": 5, "update_frequency_hours": 24}'),
('recency_lag_adjusted_stats', 0, 0.0, '{"recency_half_life_days": 14, "min_effective_trials": 10}'),
('pacing_controller_integration', 0, 0.0, '{"max_bid_adjustment": 0.25, "exploration_budget": 0.1, "decision_frequency": 60}'),
('conversion_lag_bucket_collection', 1, 100.0, '{"api_fields": ["segments.conversion_or_adjustment_lag_bucket"], "cache_hours": 24}');

-- =============================================================================
-- VIEWS FOR THOMPSON SAMPLING ANALYTICS
-- =============================================================================

-- View combining lag profiles with recent measurements
CREATE VIEW IF NOT EXISTS view_lag_aware_measurements AS
SELECT
  em.*,
  lp.completion_cdf,
  lp.confidence_score as lag_confidence,
  lp.sample_size as lag_sample_size,

  -- Lag-adjusted probability
  CASE
    WHEN lp.completion_cdf > 0 THEN em.effective_successes / lp.completion_cdf
    ELSE em.effective_successes
  END as lag_adjusted_successes,

  -- Uncertainty from lag model
  (1.0 - lp.confidence_score) * 0.1 as lag_uncertainty_penalty

FROM experiment_measurements em
LEFT JOIN lag_profiles lp ON (
  lp.scope_type = 'campaign'
  AND lp.scope_id = em.experiment_id
  AND lp.days_since = em.days_since_impression
)
WHERE em.is_lag_adjusted = 1;

-- View for hierarchical prior lookups
CREATE VIEW IF NOT EXISTS view_effective_priors AS
SELECT
  campaign_id,

  -- CVR priors (action > campaign > global precedence)
  COALESCE(
    (SELECT alpha_prior FROM hierarchical_priors WHERE level = 'action' AND scope_id = campaign_id AND metric = 'cvr'),
    (SELECT alpha_prior FROM hierarchical_priors WHERE level = 'campaign' AND scope_id = campaign_id AND metric = 'cvr'),
    (SELECT alpha_prior FROM hierarchical_priors WHERE level = 'global' AND scope_id = 'global' AND metric = 'cvr'),
    1.0
  ) as alpha_prior,

  COALESCE(
    (SELECT beta_prior FROM hierarchical_priors WHERE level = 'action' AND scope_id = campaign_id AND metric = 'cvr'),
    (SELECT beta_prior FROM hierarchical_priors WHERE level = 'campaign' AND scope_id = campaign_id AND metric = 'cvr'),
    (SELECT beta_prior FROM hierarchical_priors WHERE level = 'global' AND scope_id = 'global' AND metric = 'cvr'),
    1.0
  ) as beta_prior,

  -- Revenue priors
  COALESCE(
    (SELECT gamma_shape_prior FROM hierarchical_priors WHERE level = 'action' AND scope_id = campaign_id AND metric = 'revenue_per_conversion'),
    (SELECT gamma_shape_prior FROM hierarchical_priors WHERE level = 'campaign' AND scope_id = campaign_id AND metric = 'revenue_per_conversion'),
    (SELECT gamma_shape_prior FROM hierarchical_priors WHERE level = 'global' AND scope_id = 'global' AND metric = 'revenue_per_conversion'),
    1.0
  ) as gamma_shape_prior,

  COALESCE(
    (SELECT gamma_rate_prior FROM hierarchical_priors WHERE level = 'action' AND scope_id = campaign_id AND metric = 'revenue_per_conversion'),
    (SELECT gamma_rate_prior FROM hierarchical_priors WHERE level = 'campaign' AND scope_id = campaign_id AND metric = 'revenue_per_conversion'),
    (SELECT gamma_rate_prior FROM hierarchical_priors WHERE level = 'global' AND scope_id = 'global' AND metric = 'revenue_per_conversion'),
    1.0
  ) as gamma_rate_prior

FROM (SELECT DISTINCT experiment_id as campaign_id FROM experiment_measurements) campaigns;

-- =============================================================================
-- TRIGGERS FOR DATA CONSISTENCY
-- =============================================================================

-- Trigger to update timestamps on measurement updates
CREATE TRIGGER IF NOT EXISTS trigger_measurements_updated_at
  AFTER UPDATE ON experiment_measurements
BEGIN
  UPDATE experiment_measurements
  SET updated_at = datetime('now')
  WHERE measurement_id = NEW.measurement_id;
END;

-- Trigger to update timestamps on feature flag changes
CREATE TRIGGER IF NOT EXISTS trigger_feature_flags_updated_at
  AFTER UPDATE ON feature_flags
BEGIN
  UPDATE feature_flags
  SET updated_at = datetime('now')
  WHERE flag_name = NEW.flag_name;
END;

-- Trigger to track when features are enabled/disabled
CREATE TRIGGER IF NOT EXISTS trigger_feature_flags_state_tracking
  AFTER UPDATE OF enabled ON feature_flags
BEGIN
  UPDATE feature_flags
  SET
    enabled_at = CASE WHEN NEW.enabled = 1 THEN datetime('now') ELSE OLD.enabled_at END,
    disabled_at = CASE WHEN NEW.enabled = 0 THEN datetime('now') ELSE OLD.disabled_at END
  WHERE flag_name = NEW.flag_name;
END;

-- =============================================================================
-- VALIDATION FUNCTIONS (As Comments - Implemented in Application Code)
-- =============================================================================

-- Validation rules implemented in TypeScript:
-- 1. lag_profiles.completion_cdf must be monotonically increasing within scope
-- 2. experiment_measurements.effective_* must be <= raw values
-- 3. hierarchical_priors.effective_sample_size must be reasonable (< 10000)
-- 4. pacing_controller_state.current_spend_micros <= daily_budget_micros
-- 5. feature_flags.rollout_percentage changes should be gradual (max ±10% per hour)