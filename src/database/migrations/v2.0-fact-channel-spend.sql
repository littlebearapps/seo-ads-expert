-- Migration: Add fact_channel_spend table for v2.0 Performance Tracking
-- Author: SEO Ads Expert v2.0
-- Date: 2025-01-21
-- Description: Creates fact table for channel spend metrics with proper NULL handling
-- Note: Transactions are controlled by the application layer

-- Create the fact_channel_spend table with surrogate key
CREATE TABLE IF NOT EXISTS fact_channel_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  engine TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  ad_group_id TEXT,  -- NULL for campaign-level data
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  cws_clicks INTEGER DEFAULT 0,
  first_runs INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index for campaign-level data (where ad_group_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fcs_campaign_level
  ON fact_channel_spend(date, engine, campaign_id)
  WHERE ad_group_id IS NULL;

-- Create unique index for ad-group-level data (where ad_group_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fcs_ad_group_level
  ON fact_channel_spend(date, engine, campaign_id, ad_group_id)
  WHERE ad_group_id IS NOT NULL;

-- Create supporting indexes for common queries
CREATE INDEX IF NOT EXISTS ix_fcs_date_engine
  ON fact_channel_spend(date, engine);

CREATE INDEX IF NOT EXISTS ix_fcs_campaign_date
  ON fact_channel_spend(campaign_id, date);

CREATE INDEX IF NOT EXISTS ix_fcs_engine_campaign
  ON fact_channel_spend(engine, campaign_id);

-- Add trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_fact_channel_spend_timestamp
  AFTER UPDATE ON fact_channel_spend
  FOR EACH ROW
  BEGIN
    UPDATE fact_channel_spend
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
  END;

-- Migration Rollback Script
-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS update_fact_channel_spend_timestamp;
-- DROP INDEX IF EXISTS ix_fcs_engine_campaign;
-- DROP INDEX IF EXISTS ix_fcs_campaign_date;
-- DROP INDEX IF EXISTS ix_fcs_date_engine;
-- DROP INDEX IF EXISTS ux_fcs_ad_group_level;
-- DROP INDEX IF EXISTS ux_fcs_campaign_level;
-- DROP TABLE IF EXISTS fact_channel_spend;