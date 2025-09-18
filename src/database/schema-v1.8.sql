-- SEO Ads Expert v1.8 Schema
-- Entity Coverage, Schema Generation & Content Planning System
-- Extends v1.7 database with entity auditing and content optimization features

-- =============================================================================
-- ENTITY DIMENSION TABLES (v1.8)
-- =============================================================================

-- Entity dimension table
CREATE TABLE IF NOT EXISTS dim_entity (
  entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  canonical TEXT NOT NULL,
  variants_json TEXT NOT NULL, -- JSON array of variant forms
  importance REAL DEFAULT 0.0,  -- 0-1 importance score
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, canonical)
);

-- Page content snapshot for coverage analysis
CREATE TABLE IF NOT EXISTS fact_page_snapshot (
  captured_at TEXT NOT NULL,
  page_url TEXT NOT NULL,
  word_count INTEGER,
  headings_json TEXT,           -- JSON array of headings
  sections_json TEXT,           -- JSON array of detected sections
  present_entities_json TEXT,   -- JSON array of present entities
  schema_types_json TEXT,       -- JSON array of detected schema types
  content_hash TEXT,            -- Hash for change detection
  PRIMARY KEY (captured_at, page_url)
);

-- Entity coverage tracking
CREATE TABLE IF NOT EXISTS fact_entity_coverage (
  measured_at TEXT NOT NULL,
  product TEXT NOT NULL,
  cluster TEXT NOT NULL,
  market TEXT NOT NULL,
  coverage_score REAL,          -- 0-100 coverage score
  competitor_avg REAL,
  gap_count INTEGER,
  recommendations_json TEXT,    -- JSON array of recommendations
  PRIMARY KEY (measured_at, product, cluster, market)
);

-- Content calendar entries
CREATE TABLE IF NOT EXISTS fact_content_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  priority INTEGER,
  type TEXT,                    -- LP update, blog, pillar
  title TEXT,
  target_url TEXT,
  cluster TEXT,
  market TEXT,
  impact_score REAL,
  effort_score INTEGER,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Internal linking opportunities
CREATE TABLE IF NOT EXISTS fact_link_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,
  anchor_text TEXT NOT NULL,
  target_url TEXT NOT NULL,
  rationale TEXT,
  strength INTEGER,             -- 1-3 strength score
  applied BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Schema generation cache
CREATE TABLE IF NOT EXISTS fact_schema_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  schema_type TEXT NOT NULL,    -- SoftwareApplication, FAQPage, etc.
  page_url TEXT NOT NULL,
  schema_json TEXT NOT NULL,    -- Generated JSON-LD
  validation_status TEXT,       -- valid, invalid, warning
  validation_issues_json TEXT,  -- JSON array of validation issues
  generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product, schema_type, page_url)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE (v1.8)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_entity_product ON dim_entity(product_id);
CREATE INDEX IF NOT EXISTS idx_entity_importance ON dim_entity(importance DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_url ON fact_page_snapshot(page_url);
CREATE INDEX IF NOT EXISTS idx_snapshot_captured ON fact_page_snapshot(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_coverage_product ON fact_entity_coverage(product, cluster);
CREATE INDEX IF NOT EXISTS idx_coverage_measured ON fact_entity_coverage(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_priority ON fact_content_calendar(priority, status);
CREATE INDEX IF NOT EXISTS idx_calendar_product ON fact_content_calendar(product, status);
CREATE INDEX IF NOT EXISTS idx_links_source ON fact_link_opportunities(source_url);
CREATE INDEX IF NOT EXISTS idx_links_applied ON fact_link_opportunities(applied, strength DESC);
CREATE INDEX IF NOT EXISTS idx_schema_product ON fact_schema_cache(product, schema_type);
CREATE INDEX IF NOT EXISTS idx_schema_validation ON fact_schema_cache(validation_status);

-- =============================================================================
-- DATA INTEGRITY CONSTRAINTS (v1.8)
-- =============================================================================

-- Entity importance score validation
CREATE TRIGGER IF NOT EXISTS validate_entity_importance
  BEFORE INSERT ON dim_entity
  BEGIN
    SELECT CASE
      WHEN NEW.importance < 0.0 OR NEW.importance > 1.0 THEN
        RAISE(ABORT, 'Entity importance must be between 0.0 and 1.0')
    END;
  END;

-- Coverage score validation
CREATE TRIGGER IF NOT EXISTS validate_coverage_score
  BEFORE INSERT ON fact_entity_coverage
  BEGIN
    SELECT CASE
      WHEN NEW.coverage_score < 0.0 OR NEW.coverage_score > 100.0 THEN
        RAISE(ABORT, 'Coverage score must be between 0.0 and 100.0')
    END;
  END;

-- Link strength validation
CREATE TRIGGER IF NOT EXISTS validate_link_strength
  BEFORE INSERT ON fact_link_opportunities
  BEGIN
    SELECT CASE
      WHEN NEW.strength < 1 OR NEW.strength > 3 THEN
        RAISE(ABORT, 'Link strength must be between 1 and 3')
    END;
  END;

-- =============================================================================
-- MIGRATION FROM v1.7 to v1.8
-- =============================================================================

-- Update schema version
CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO schema_version (version) VALUES ('1.8');

-- Add v1.8 migration marker
CREATE TABLE IF NOT EXISTS v18_migration_status (
  migration_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO v18_migration_status (migration_name, status)
VALUES ('entity_tables_created', 'completed');

INSERT OR REPLACE INTO v18_migration_status (migration_name, status)
VALUES ('content_tables_created', 'completed');

INSERT OR REPLACE INTO v18_migration_status (migration_name, status)
VALUES ('schema_cache_created', 'completed');