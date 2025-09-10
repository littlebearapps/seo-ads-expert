-- SEO Ads Expert v1.5 - A/B Testing Framework Database Schema
-- Extends v1.4 database with experiment tracking and statistical analysis
-- Integration points: Links to existing performance data for baseline analysis

-- =============================================================================
-- EXPERIMENT REGISTRY
-- =============================================================================

-- Main experiment registry table extending v1.4 database
CREATE TABLE IF NOT EXISTS fact_ab_tests (
  test_id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN ('rsa', 'landing_page')),
  product TEXT NOT NULL,
  ad_group_id TEXT,
  page_id TEXT,
  start_at TIMESTAMP,
  end_at TIMESTAMP,
  status TEXT CHECK(status IN ('draft', 'active', 'paused', 'completed')),
  target_metric TEXT CHECK(target_metric IN ('ctr', 'cvr', 'cws_click_rate')),
  min_sample_size INTEGER NOT NULL,
  confidence_level REAL DEFAULT 0.95,
  baseline_data_source TEXT, -- Links to v1.4 performance data
  waste_insights_used TEXT, -- v1.4 waste analysis insights (stored as JSON string)
  qs_insights_used TEXT, -- v1.4 quality score insights (stored as JSON string)
  hypothesis TEXT,
  description TEXT,
  success_criteria TEXT,
  created_by TEXT DEFAULT 'seo-ads-expert-v1.5',
  winner_variant_id TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON fact_ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_product ON fact_ab_tests(product);
CREATE INDEX IF NOT EXISTS idx_ab_tests_type ON fact_ab_tests(type);
CREATE INDEX IF NOT EXISTS idx_ab_tests_dates ON fact_ab_tests(start_at, end_at);

-- =============================================================================
-- VARIANT DEFINITIONS
-- =============================================================================

-- Variant definitions for both RSA and Landing Page experiments
CREATE TABLE IF NOT EXISTS fact_ab_variants (
  test_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  label TEXT, -- Google Ads label for tracking
  copy_hash TEXT, -- Hash for similarity checking
  headlines TEXT, -- RSA headlines array (stored as JSON string)
  descriptions TEXT, -- RSA descriptions array (stored as JSON string)
  final_urls TEXT, -- RSA final URLs array (stored as JSON string)
  lp_path TEXT, -- Landing page path for LP experiments
  content_changes TEXT, -- LP content modifications (stored as JSON string)
  routing_rules TEXT, -- LP routing configuration (stored as JSON string)
  is_control INTEGER DEFAULT 0, -- Use 0/1 for boolean
  weight REAL DEFAULT 0.5, -- Traffic allocation weight
  metadata TEXT, -- Additional variant metadata (stored as JSON string)
  similarity_score REAL, -- Similarity to control variant
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_id, variant_id),
  FOREIGN KEY (test_id) REFERENCES fact_ab_tests(test_id) ON DELETE CASCADE
);

-- Index for variant lookups
CREATE INDEX IF NOT EXISTS idx_ab_variants_control ON fact_ab_variants(test_id, is_control);
CREATE INDEX IF NOT EXISTS idx_ab_variants_label ON fact_ab_variants(label);

-- =============================================================================
-- EXPERIMENT GUARDS & VALIDATION
-- =============================================================================

-- Safety guards and validation rules for experiments
CREATE TABLE IF NOT EXISTS fact_ab_guards (
  test_id TEXT NOT NULL,
  guard_type TEXT CHECK(guard_type IN ('similarity', 'budget', 'duration', 'sample_size')),
  threshold REAL NOT NULL,
  message TEXT NOT NULL,
  last_check_at TIMESTAMP,
  last_check_result INTEGER, -- Use 0/1 for boolean
  last_check_value REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_id, guard_type),
  FOREIGN KEY (test_id) REFERENCES fact_ab_tests(test_id) ON DELETE CASCADE
);

-- =============================================================================
-- METRICS COLLECTION
-- =============================================================================

-- Daily metrics collection for all variants
CREATE TABLE IF NOT EXISTS fact_ab_metrics (
  date DATE NOT NULL,
  test_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  
  -- Google Ads metrics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost REAL DEFAULT 0.0,
  conversions INTEGER DEFAULT 0,
  conversion_value REAL DEFAULT 0.0,
  view_through_conversions INTEGER DEFAULT 0,
  
  -- Landing page metrics (from Analytics)
  sessions INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  bounce_rate REAL,
  avg_session_duration REAL,
  goal_completions INTEGER DEFAULT 0,
  goal_value REAL DEFAULT 0.0,
  
  -- CWS-specific metrics
  cws_clicks INTEGER DEFAULT 0,
  cws_impressions INTEGER DEFAULT 0,
  
  -- Data quality flags
  data_source TEXT, -- 'google_ads', 'analytics', 'estimated'
  data_quality_score REAL DEFAULT 1.0,
  has_anomaly INTEGER DEFAULT 0, -- Use 0/1 for boolean
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, test_id, variant_id),
  FOREIGN KEY (test_id, variant_id) REFERENCES fact_ab_variants(test_id, variant_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ab_metrics_date ON fact_ab_metrics(date);
CREATE INDEX IF NOT EXISTS idx_ab_metrics_test ON fact_ab_metrics(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_metrics_quality ON fact_ab_metrics(data_quality_score, has_anomaly);

-- =============================================================================
-- STATISTICAL ANALYSIS RESULTS
-- =============================================================================

-- Statistical analysis results for experiments
CREATE TABLE IF NOT EXISTS fact_ab_results (
  test_id TEXT NOT NULL,
  analysis_date TIMESTAMP NOT NULL,
  control_variant TEXT NOT NULL,
  test_variant TEXT NOT NULL,
  metric TEXT NOT NULL,
  
  -- Statistical test results
  control_value REAL NOT NULL,
  test_value REAL NOT NULL,
  uplift REAL, -- Percentage uplift
  absolute_difference REAL,
  
  -- Frequentist statistics
  p_value REAL,
  confidence_lower REAL,
  confidence_upper REAL,
  statistical_power REAL,
  
  -- Bayesian statistics
  probability_variant_better REAL,
  expected_lift REAL,
  credible_interval_lower REAL,
  credible_interval_upper REAL,
  
  -- Sample sizes
  sample_size_control INTEGER,
  sample_size_test INTEGER,
  
  -- Decision making
  decision TEXT CHECK(decision IN ('continue', 'stop_winner', 'stop_loser', 'stop_futile')),
  decision_reason TEXT,
  confidence_level REAL,
  
  -- Early stopping
  early_stop_recommended INTEGER DEFAULT 0, -- Use 0/1 for boolean
  early_stop_reason TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_id, analysis_date, control_variant, test_variant, metric)
);

-- Indexes for analysis queries
CREATE INDEX IF NOT EXISTS idx_ab_results_test_date ON fact_ab_results(test_id, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_ab_results_decision ON fact_ab_results(decision);
CREATE INDEX IF NOT EXISTS idx_ab_results_early_stop ON fact_ab_results(early_stop_recommended);

-- =============================================================================
-- USER ASSIGNMENTS (for Landing Page experiments)
-- =============================================================================

-- User assignments for consistent landing page experience
CREATE TABLE IF NOT EXISTS fact_ab_assignments (
  assignment_id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  user_identifier TEXT, -- Cookie ID, user ID, etc.
  user_agent TEXT,
  ip_address TEXT,
  assigned_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  first_exposure_at TIMESTAMP,
  last_exposure_at TIMESTAMP,
  exposure_count INTEGER DEFAULT 0,
  
  -- Attribution data
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_id, variant_id) REFERENCES fact_ab_variants(test_id, variant_id) ON DELETE CASCADE
);

-- Indexes for assignment lookups
CREATE INDEX IF NOT EXISTS idx_ab_assignments_user ON fact_ab_assignments(test_id, user_identifier);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_expires ON fact_ab_assignments(expires_at);

-- =============================================================================
-- CONVERSION TRACKING
-- =============================================================================

-- Conversion events with variant attribution
CREATE TABLE IF NOT EXISTS fact_ab_conversions (
  conversion_id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  assignment_id TEXT,
  
  -- Conversion details
  conversion_type TEXT NOT NULL, -- 'purchase', 'signup', 'download', etc.
  conversion_value REAL DEFAULT 0.0,
  conversion_at TIMESTAMP NOT NULL,
  
  -- Attribution window
  exposure_to_conversion_minutes INTEGER,
  attribution_model TEXT DEFAULT 'last_touch',
  
  -- Event data
  event_data TEXT, -- Event data (stored as JSON string)
  revenue REAL,
  quantity INTEGER DEFAULT 1,
  
  -- Source tracking
  traffic_source TEXT,
  campaign_id TEXT,
  ad_group_id TEXT,
  keyword TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_id, variant_id) REFERENCES fact_ab_variants(test_id, variant_id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES fact_ab_assignments(assignment_id) ON DELETE SET NULL
);

-- Indexes for conversion analysis
CREATE INDEX IF NOT EXISTS idx_ab_conversions_test ON fact_ab_conversions(test_id, conversion_at);
CREATE INDEX IF NOT EXISTS idx_ab_conversions_variant ON fact_ab_conversions(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_conversions_type ON fact_ab_conversions(conversion_type);

-- =============================================================================
-- INTEGRATION WITH V1.4 DATA
-- =============================================================================

-- View linking experiments to v1.4 waste analysis insights
CREATE VIEW IF NOT EXISTS view_experiment_waste_insights AS
SELECT 
  abt.test_id,
  abt.product,
  abt.waste_insights_used,
  -- Link to existing v1.4 waste data when available
  'v1.4_integration_placeholder' as waste_data_link
FROM fact_ab_tests abt
WHERE abt.waste_insights_used IS NOT NULL;

-- View linking experiments to v1.4 quality score insights  
CREATE VIEW IF NOT EXISTS view_experiment_qs_insights AS
SELECT 
  abt.test_id,
  abt.product,
  abt.qs_insights_used,
  -- Link to existing v1.4 QS data when available
  'v1.4_integration_placeholder' as qs_data_link
FROM fact_ab_tests abt
WHERE abt.qs_insights_used IS NOT NULL;

-- =============================================================================
-- EXPERIMENT SUMMARY VIEW
-- =============================================================================

-- Comprehensive experiment status view
CREATE VIEW IF NOT EXISTS view_experiment_summary AS
SELECT 
  abt.test_id,
  abt.type,
  abt.product,
  abt.status,
  abt.target_metric,
  abt.start_at,
  abt.end_at,
  abt.hypothesis,
  abt.winner_variant_id,
  
  -- Variant counts
  (SELECT COUNT(*) FROM fact_ab_variants abv WHERE abv.test_id = abt.test_id) as variant_count,
  (SELECT variant_name FROM fact_ab_variants abv WHERE abv.test_id = abt.test_id AND abv.is_control = 1) as control_variant,
  
  -- Current metrics (latest date)
  (SELECT SUM(clicks) FROM fact_ab_metrics abm WHERE abm.test_id = abt.test_id AND abm.date = (
    SELECT MAX(date) FROM fact_ab_metrics WHERE test_id = abt.test_id
  )) as latest_total_clicks,
  (SELECT SUM(impressions) FROM fact_ab_metrics abm WHERE abm.test_id = abt.test_id AND abm.date = (
    SELECT MAX(date) FROM fact_ab_metrics WHERE test_id = abt.test_id
  )) as latest_total_impressions,
  
  -- Latest analysis
  (SELECT decision FROM fact_ab_results abr WHERE abr.test_id = abt.test_id 
   ORDER BY abr.analysis_date DESC LIMIT 1) as latest_decision,
  (SELECT early_stop_recommended FROM fact_ab_results abr WHERE abr.test_id = abt.test_id 
   ORDER BY abr.analysis_date DESC LIMIT 1) as early_stop_recommended,
   
  abt.created_at,
  abt.updated_at
FROM fact_ab_tests abt;

-- =============================================================================
-- TRIGGERS FOR DATA INTEGRITY
-- =============================================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trigger_ab_tests_updated_at
  AFTER UPDATE ON fact_ab_tests
BEGIN
  UPDATE fact_ab_tests SET updated_at = CURRENT_TIMESTAMP WHERE test_id = NEW.test_id;
END;

-- Trigger to validate variant weights sum to 1.0
CREATE TRIGGER IF NOT EXISTS trigger_validate_variant_weights
  AFTER INSERT ON fact_ab_variants
  WHEN (SELECT SUM(weight) FROM fact_ab_variants WHERE test_id = NEW.test_id) > 1.01
BEGIN
  SELECT RAISE(ABORT, 'Variant weights must sum to 1.0 or less');
END;

-- =============================================================================
-- INITIAL DATA & DEFAULTS
-- =============================================================================

-- Note: Default guard configurations are now handled in application code
-- to avoid foreign key constraint violations during initialization