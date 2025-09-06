-- SEO Ads Expert v1.7 Schema
-- Alert Detection & Remediation System

-- SERP feature tracking (missing from v1.6)
CREATE TABLE IF NOT EXISTS fact_serp_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  market TEXT NOT NULL,
  keyword_cluster TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  features_json TEXT NOT NULL,  -- {ai_overview, shopping, video, top_domains}
  top_3_domains TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product, market, keyword_cluster, snapshot_date)
);

-- Landing page health monitoring (missing from v1.6)
CREATE TABLE IF NOT EXISTS fact_url_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  check_date TEXT NOT NULL,
  status_code INTEGER,
  is_noindex BOOLEAN DEFAULT 0,
  is_soft_404 BOOLEAN DEFAULT 0,
  redirect_chain INTEGER DEFAULT 0,
  canonical_ok BOOLEAN DEFAULT 1,
  response_time_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(url, check_date)
);

-- Alert state tracking
CREATE TABLE IF NOT EXISTS alerts_state (
  alert_id TEXT PRIMARY KEY,         -- hash(type+entity+window)
  status TEXT NOT NULL,              -- open|ack|snoozed|closed
  severity TEXT NOT NULL,            -- critical|high|medium|low
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  consecutive_occurrences INTEGER DEFAULT 1,  -- For 2-check noise control
  snooze_until TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Alert history for audit trail
CREATE TABLE IF NOT EXISTS alerts_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seen_at TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status_change TEXT,
  FOREIGN KEY (alert_id) REFERENCES alerts_state(alert_id)
);

-- Remediation tracking
CREATE TABLE IF NOT EXISTS remediation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL,
  playbook_id TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  dry_run BOOLEAN DEFAULT 1,
  applied_at TEXT,
  result_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_serp_snapshot_lookup ON fact_serp_snapshot(product, market, keyword_cluster);
CREATE INDEX IF NOT EXISTS idx_url_health_lookup ON fact_url_health(url, check_date);
CREATE INDEX IF NOT EXISTS idx_alerts_state_status ON alerts_state(status);
CREATE INDEX IF NOT EXISTS idx_alerts_history_alert ON alerts_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_remediation_alert ON remediation_log(alert_id);