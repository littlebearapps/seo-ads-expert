-- SEO Ads Expert v2.2 - Add variant_id to experiment_measurements
-- Migration: Phase 1.2 - Database Schema Fix
-- Created: 2025-09-30
-- Purpose: Add variant_id column for alert integration compatibility

-- =============================================================================
-- ALTER EXPERIMENT_MEASUREMENTS TABLE
-- =============================================================================

-- Add variant_id column to experiment_measurements
-- This enables alert-integration tests to query by variant_id
ALTER TABLE experiment_measurements
ADD COLUMN variant_id TEXT;

-- Create index for efficient variant_id lookups
CREATE INDEX IF NOT EXISTS idx_experiment_measurements_variant_id
ON experiment_measurements(variant_id);

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
-- This migration adds variant_id to experiment_measurements table
-- to support alert-integration.test.ts requirements (tests #3-6)
--
-- The variant_id column is nullable to maintain compatibility with
-- existing data that uses arm_id for identification.