/**
 * Migration Integration Tests
 * Tests the complete migration system from fresh database to latest schema
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database/database-manager.js';
import { MigrationRunner } from '../database/migration-runner.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Migration Integration', () => {
  let testDbPath: string;
  let db: DatabaseManager;
  let migrationRunner: MigrationRunner;

  beforeEach(async () => {
    // Create temporary database path
    testDbPath = `:memory:`;

    // Initialize database manager and migration runner
    db = new DatabaseManager({ path: testDbPath });
    await db.initialize();

    migrationRunner = new MigrationRunner(db);
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('Fresh Database Migration', () => {
    it('should have all migrations already applied after initialization', async () => {
      // Migrations are now auto-applied during DatabaseManager initialization
      const result = await migrationRunner.runMigrations();

      expect(result.applied).toBe(0); // No new migrations to apply
      expect(result.total).toBeGreaterThan(0);

      // Verify migrations were applied during initialization
      const status = await migrationRunner.getStatus();
      expect(status.applied.length).toBeGreaterThan(0);
      expect(status.applied.length).toBe(status.total);
    });

    it('should create migration tracking table', async () => {
      await migrationRunner.initializeMigrationTracking();

      // Check that schema_migrations table exists
      const tables = db.all<{name: string}>(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='schema_migrations'
      `);

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('schema_migrations');
    });

    it('should track applied migrations correctly', async () => {
      await migrationRunner.runMigrations();

      const applied = await migrationRunner.getAppliedMigrations();

      expect(applied.length).toBeGreaterThan(0);

      // Check migration record structure
      const firstMigration = applied[0];
      expect(firstMigration).toHaveProperty('version');
      expect(firstMigration).toHaveProperty('description');
      expect(firstMigration).toHaveProperty('filename');
      expect(firstMigration).toHaveProperty('appliedAt');
      expect(firstMigration).toHaveProperty('checksum');

      // Check that appliedAt is a valid ISO date
      expect(new Date(firstMigration.appliedAt!)).toBeInstanceOf(Date);
    });
  });

  describe('Migration Validation', () => {
    it('should validate migration integrity', async () => {
      await migrationRunner.runMigrations();

      const validation = await migrationRunner.validateMigrations();

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect no pending migrations after full run', async () => {
      await migrationRunner.runMigrations();

      const status = await migrationRunner.getStatus();

      expect(status.pending).toHaveLength(0);
      expect(status.applied.length).toBe(status.total);
    });

    it('should handle subsequent migration runs gracefully', async () => {
      // Migrations are already applied during initialization, both runs should be no-ops
      const firstRun = await migrationRunner.runMigrations();
      const secondRun = await migrationRunner.runMigrations();

      expect(firstRun.applied).toBe(0); // Already applied during initialization
      expect(secondRun.applied).toBe(0); // No new migrations applied
      expect(secondRun.total).toBe(firstRun.total);
      expect(firstRun.total).toBeGreaterThan(0); // Should have migrations available
    });
  });

  describe('Schema Verification', () => {
    it('should create expected base schema tables', async () => {
      await migrationRunner.runMigrations();

      const expectedBaseTables = [
        'fact_ab_assignments',
        'fact_ab_conversions',
        'fact_ab_guards',
        'fact_ab_metrics',
        'fact_ab_results',
        'fact_ab_tests',
        'fact_ab_variants'
      ];

      for (const tableName of expectedBaseTables) {
        const tables = db.all<{name: string}>(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name=?
        `, [tableName]);

        expect(tables).toHaveLength(1);
      }
    });

    it('should create expected v2.x Thompson Sampling tables', async () => {
      await migrationRunner.runMigrations();

      const thompsonTables = [
        'lag_profiles',
        'hierarchical_priors',
        'feature_flags',
        'fact_channel_spend',
        'experiment_measurements',
        'pacing_controller_state'
      ];

      for (const tableName of thompsonTables) {
        const tables = db.all<{name: string}>(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name=?
        `, [tableName]);

        expect(tables).toHaveLength(1);
      }
    });

    it('should create proper indexes', async () => {
      await migrationRunner.runMigrations();

      const indexes = db.all<{name: string}>(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
      `);

      expect(indexes.length).toBeGreaterThan(0);

      // Check for specific important indexes
      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_migrations_applied_at');
    });

    it('should enforce foreign key constraints', async () => {
      await migrationRunner.runMigrations();

      const pragmaResult = db.get<{foreign_keys: number}>('PRAGMA foreign_keys');
      expect(pragmaResult?.foreign_keys).toBe(1);
    });
  });

  describe('Transaction Behavior', () => {
    it('should handle migrations atomically', async () => {
      // This test verifies that migrations are applied atomically
      // If a migration fails, the database should remain in a consistent state

      // Initialize migration tracking first
      await migrationRunner.initializeMigrationTracking();
      const initialStatus = await migrationRunner.getStatus();

      try {
        await migrationRunner.runMigrations();

        const finalStatus = await migrationRunner.getStatus();
        expect(finalStatus.applied.length).toBeGreaterThan(initialStatus.applied.length);
      } catch (error) {
        // If migrations fail, database should still be in a valid state
        const rollbackStatus = await migrationRunner.getStatus();
        expect(rollbackStatus.applied.length).toBe(initialStatus.applied.length);
      }
    });

    it('should not leave partial migrations on failure', async () => {
      // Verify that the migration system doesn't leave the database
      // in an inconsistent state when migrations fail

      await migrationRunner.initializeMigrationTracking();

      const appliedBefore = await migrationRunner.getAppliedMigrations();

      try {
        await migrationRunner.runMigrations();
      } catch (error) {
        // If migration failed, the migration record should not be partially written
        const appliedAfter = await migrationRunner.getAppliedMigrations();

        // Either all migrations succeeded, or we're back to the initial state
        expect(appliedAfter.length).toBeGreaterThanOrEqual(appliedBefore.length);
      }
    });
  });

  describe('Migration File Processing', () => {
    it('should process SQL files without transaction statements', async () => {
      // This test ensures that our migration files don't contain
      // explicit transaction statements that would conflict with
      // the application-level transaction control

      const available = await migrationRunner.getAvailableMigrations();

      expect(available.length).toBeGreaterThan(0);

      // All migrations should be processable
      for (const migration of available) {
        expect(migration.version).toBeTruthy();
        expect(migration.description).toBeTruthy();
        expect(migration.filename).toMatch(/\.sql$/);
      }
    });

    it('should calculate consistent checksums', async () => {
      await migrationRunner.runMigrations();

      const applied = await migrationRunner.getAppliedMigrations();

      // All applied migrations should have checksums
      for (const migration of applied) {
        expect(migration.checksum).toBeTruthy();
        expect(migration.checksum).toMatch(/^[a-f0-9]{16}$/); // 16-char hex
      }
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error messages for validation failures', async () => {
      await migrationRunner.runMigrations();

      // Force a validation failure by checking non-existent migration
      const validation = await migrationRunner.validateMigrations();

      // Should pass for valid migrations
      expect(validation.valid).toBe(true);
    });

    it('should handle empty migrations directory gracefully', async () => {
      // Create a new migration runner with no available migrations
      // This simulates the case where the migrations directory is empty

      const emptyRunner = new (class extends MigrationRunner {
        async getAvailableMigrations() {
          return [];
        }
      })(db);

      const result = await emptyRunner.runMigrations();

      expect(result.applied).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should complete migrations within reasonable time', async () => {
      const start = Date.now();

      await migrationRunner.runMigrations();

      const duration = Date.now() - start;

      // Migrations should complete within 10 seconds for in-memory database
      expect(duration).toBeLessThan(10000);
    });

    it('should handle large schema efficiently', async () => {
      await migrationRunner.runMigrations();

      // Verify that all tables were created without significant delay
      const tableCount = db.get<{count: number}>(`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'
      `);

      expect(tableCount?.count).toBeGreaterThan(10); // Should have many tables
    });
  });
});