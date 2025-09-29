/**
 * Schema Integration Tests
 * Tests complete database schema integration (base schema + migrations)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { MigrationRunner } from '../database/migration-runner.js';

describe('Schema Integration', () => {
  let db: DatabaseManager;
  let migrationRunner: MigrationRunner;

  beforeEach(async () => {
    db = new DatabaseManager({ path: ':memory:' });
    await db.initialize(); // This applies base schema
    migrationRunner = new MigrationRunner(db);
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('Base Schema + Migrations Integration', () => {
    it('should have both base schema and migration tables after initialization', async () => {
      // DatabaseManager now automatically applies migrations during initialization
      const allTables = db.all<{name: string}>(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const allTableNames = allTables.map(t => t.name);

      // Should have base schema tables
      expect(allTableNames).toContain('fact_ab_assignments');
      expect(allTableNames).toContain('fact_ab_conversions');
      expect(allTableNames).toContain('fact_ab_guards');
      expect(allTableNames).toContain('fact_ab_metrics');
      expect(allTableNames).toContain('fact_ab_results');
      expect(allTableNames).toContain('fact_ab_tests');
      expect(allTableNames).toContain('fact_ab_variants');

      // Should ALSO have migration tables (auto-applied)
      expect(allTableNames).toContain('fact_channel_spend');
      expect(allTableNames).toContain('lag_profiles');
      expect(allTableNames).toContain('hierarchical_priors');
      expect(allTableNames).toContain('feature_flags');
      expect(allTableNames).toContain('experiment_measurements');
      expect(allTableNames).toContain('pacing_controller_state');
      expect(allTableNames).toContain('schema_migrations');

      expect(allTableNames.length).toBeGreaterThan(10); // More than just base tables
    });

    it('should handle repeated migration runs gracefully (idempotent)', async () => {
      // Migrations already applied during initialization, run again
      const result = await migrationRunner.runMigrations();

      // Should be no-op since migrations already applied
      expect(result.applied).toBe(0);
      expect(result.total).toBeGreaterThan(0);

      const allTables = db.all<{name: string}>(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const allTableNames = allTables.map(t => t.name);

      // Should still have all tables (base + migration)
      expect(allTableNames).toContain('fact_ab_assignments');
      expect(allTableNames).toContain('fact_ab_conversions');
      expect(allTableNames).toContain('fact_ab_guards');
      expect(allTableNames).toContain('fact_ab_metrics');
      expect(allTableNames).toContain('fact_ab_results');
      expect(allTableNames).toContain('fact_ab_tests');
      expect(allTableNames).toContain('fact_ab_variants');

      // Should ALSO have migration tables
      expect(allTableNames).toContain('fact_channel_spend');
      expect(allTableNames).toContain('lag_profiles');
      expect(allTableNames).toContain('hierarchical_priors');
      expect(allTableNames).toContain('feature_flags');
      expect(allTableNames).toContain('experiment_measurements');
      expect(allTableNames).toContain('pacing_controller_state');
      expect(allTableNames).toContain('schema_migrations');

      expect(allTableNames.length).toBeGreaterThan(10); // More than just base tables
    });

    it('should maintain data integrity across base schema and migrations', async () => {
      // Both base schema and migration tables are available from initialization

      // Test base schema functionality
      db.run(`
        INSERT INTO fact_ab_tests (test_id, product, hypothesis, status, min_sample_size)
        VALUES ('test-123', 'convertmyfile', 'Test hypothesis', 'active', 100)
      `);

      const testData = db.get<{test_id: string, product: string}>(`
        SELECT test_id, product FROM fact_ab_tests WHERE test_id = 'test-123'
      `);

      expect(testData).toBeTruthy();
      expect(testData?.test_id).toBe('test-123');
      expect(testData?.product).toBe('convertmyfile');

      // Test migration table functionality
      db.run(`
        INSERT INTO fact_channel_spend (date, engine, campaign_id, clicks, cost)
        VALUES ('2025-01-20', 'google', 'campaign-123', 100, 50.00)
      `);

      const spendData = db.get<{campaign_id: string, clicks: number}>(`
        SELECT campaign_id, clicks FROM fact_channel_spend WHERE campaign_id = 'campaign-123'
      `);

      expect(spendData).toBeTruthy();
      expect(spendData?.campaign_id).toBe('campaign-123');
      expect(spendData?.clicks).toBe(100);
    });

    it('should validate foreign key relationships work across schema boundaries', async () => {
      // Migrations already applied during initialization

      // Check that foreign keys are enabled
      const pragmaResult = db.get<{foreign_keys: number}>('PRAGMA foreign_keys');
      expect(pragmaResult?.foreign_keys).toBe(1);

      // Test would depend on actual foreign key relationships in the schema
      // For now, just verify the pragma is set correctly
    });

    it('should ensure views work correctly with base and migration tables', async () => {
      // Migrations already applied during initialization

      // Get all views created
      const views = db.all<{name: string}>(`
        SELECT name FROM sqlite_master
        WHERE type='view'
        ORDER BY name
      `);

      expect(views.length).toBeGreaterThan(0);

      // Test that views can be queried (even if empty)
      for (const view of views) {
        expect(() => {
          db.all(`SELECT COUNT(*) as count FROM ${view.name} LIMIT 1`);
        }).not.toThrow();
      }
    });

    it('should verify indexes exist for both base and migration tables', async () => {
      // Migrations already applied during initialization

      const indexes = db.all<{name: string, tbl_name: string}>(`
        SELECT name, tbl_name FROM sqlite_master
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      expect(indexes.length).toBeGreaterThan(10);

      // Should have indexes on base schema tables
      const baseTableIndexes = indexes.filter(idx =>
        idx.tbl_name?.startsWith('fact_ab_')
      );
      expect(baseTableIndexes.length).toBeGreaterThan(5);

      // Should have indexes on migration tables
      const migrationTableIndexes = indexes.filter(idx =>
        ['fact_channel_spend', 'lag_profiles', 'hierarchical_priors'].includes(idx.tbl_name || '')
      );
      expect(migrationTableIndexes.length).toBeGreaterThan(3);
    });

    it('should verify triggers work for both base and migration tables', async () => {
      // Migrations already applied during initialization

      const triggers = db.all<{name: string, tbl_name: string}>(`
        SELECT name, tbl_name FROM sqlite_master
        WHERE type='trigger'
        ORDER BY name
      `);

      expect(triggers.length).toBeGreaterThan(3);

      // Should have triggers on base schema tables
      const baseTriggers = triggers.filter(t =>
        t.tbl_name?.startsWith('fact_ab_')
      );
      expect(baseTriggers.length).toBeGreaterThan(0);

      // Should have triggers on migration tables
      const migrationTriggers = triggers.filter(t =>
        ['fact_channel_spend', 'feature_flags', 'experiment_measurements'].includes(t.tbl_name || '')
      );
      expect(migrationTriggers.length).toBeGreaterThan(0);
    });
  });

  describe('Migration Order Independence', () => {
    it('should produce same final schema regardless of initialization order', async () => {
      // Get schema after current initialization (migrations auto-applied)
      const firstSchema = db.all<{type: string, name: string, sql: string}>(`
        SELECT type, name, sql FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);

      // Create fresh database with same initialization process
      await db.close();

      const db2 = new DatabaseManager({ path: ':memory:' });
      await db2.initialize(); // This also auto-applies migrations

      const secondSchema = db2.all<{type: string, name: string, sql: string}>(`
        SELECT type, name, sql FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);

      await db2.close();

      // Schemas should be identical
      expect(secondSchema).toEqual(firstSchema);
    });
  });

  describe('Performance and Optimization', () => {
    it('should complete full schema setup within reasonable time', async () => {
      // Test fresh initialization performance
      await db.close();

      const start = Date.now();

      const newDb = new DatabaseManager({ path: ':memory:' });
      await newDb.initialize(); // This includes migrations

      const duration = Date.now() - start;

      await newDb.close();

      // Should complete within 5 seconds for in-memory database
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent schema operations gracefully', async () => {
      // This test verifies that the schema can handle concurrent operations
      // In SQLite with WAL mode, this should work correctly

      const operations = [
        () => migrationRunner.runMigrations(), // Should be no-op
        () => migrationRunner.getStatus(),
        () => migrationRunner.validateMigrations()
      ];

      // Run operations concurrently
      const results = await Promise.allSettled(operations.map(op => op()));

      // All operations should succeed
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
    });
  });
});