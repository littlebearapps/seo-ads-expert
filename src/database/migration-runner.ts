/**
 * Database Migration Runner for SEO Ads Expert v2.0
 * Handles applying Thompson Sampling lag-aware enhancements
 */

import { DatabaseManager } from './database-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Migration {
  version: string;
  description: string;
  filename: string;
  appliedAt?: string;
  checksum?: string;
}

export class MigrationRunner {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Initialize migration tracking table
   */
  async initializeMigrationTracking(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        filename TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_migrations_applied_at
      ON schema_migrations(applied_at);
    `;

    this.db.exec(sql);
    logger.info('✅ Migration tracking table initialized');
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    const results = this.db.all<any>(`
      SELECT version, description, filename, applied_at, checksum
      FROM schema_migrations
      ORDER BY applied_at ASC
    `);

    return results.map(row => ({
      version: row.version,
      description: row.description,
      filename: row.filename,
      appliedAt: row.applied_at,
      checksum: row.checksum
    }));
  }

  /**
   * Get list of available migrations from filesystem
   */
  async getAvailableMigrations(): Promise<Migration[]> {
    const migrationsDir = path.join(__dirname, 'migrations');

    try {
      const files = await fs.readdir(migrationsDir);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      const migrations: Migration[] = [];

      for (const filename of migrationFiles) {
        const version = this.extractVersionFromFilename(filename);
        const description = this.extractDescriptionFromFilename(filename);

        migrations.push({
          version,
          description,
          filename
        });
      }

      return migrations;
    } catch (error) {
      logger.warn('No migrations directory found or empty');
      return [];
    }
  }

  /**
   * Extract version from migration filename
   */
  private extractVersionFromFilename(filename: string): string {
    // Extract version from pattern: v2.0-thompson-sampling-lag-profiles.sql
    const match = filename.match(/^(v\d+\.\d+)/);
    return match ? match[1] : filename.replace('.sql', '');
  }

  /**
   * Extract description from migration filename
   */
  private extractDescriptionFromFilename(filename: string): string {
    // Extract description from pattern: v2.0-thompson-sampling-lag-profiles.sql
    const withoutExtension = filename.replace('.sql', '');
    const withoutVersion = withoutExtension.replace(/^v\d+\.\d+-/, '');
    return withoutVersion.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Calculate checksum for migration file content
   */
  private async calculateChecksum(content: string): Promise<string> {
    // Simple checksum using built-in crypto
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Read migration file content
   */
  private async readMigrationFile(filename: string): Promise<string> {
    const filepath = path.join(__dirname, 'migrations', filename);
    return await fs.readFile(filepath, 'utf-8');
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration: Migration): Promise<void> {
    const content = await this.readMigrationFile(migration.filename);
    const checksum = await this.calculateChecksum(content);

    logger.info(`📦 Applying migration: ${migration.version} - ${migration.description}`);

    try {
      // Execute migration SQL (SQL files handle their own transactions)
      this.db.exec(content);

      // Record migration as applied
      this.db.run(
        `INSERT INTO schema_migrations (version, description, filename, checksum, applied_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          migration.version,
          migration.description,
          migration.filename,
          checksum,
          new Date().toISOString()
        ]
      );

      logger.info(`✅ Migration applied successfully: ${migration.version}`);
    } catch (error) {
      logger.error(`❌ Failed to apply migration ${migration.version}:`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<{ applied: number; total: number }> {
    await this.initializeMigrationTracking();

    const applied = await this.getAppliedMigrations();
    const available = await this.getAvailableMigrations();

    const appliedVersions = new Set(applied.map(m => m.version));
    const pending = available.filter(m => !appliedVersions.has(m.version));

    if (pending.length === 0) {
      logger.info('✅ No pending migrations - database is up to date');
      return { applied: 0, total: available.length };
    }

    logger.info(`📦 Found ${pending.length} pending migrations`);

    for (const migration of pending) {
      await this.applyMigration(migration);
    }

    logger.info(`✅ Applied ${pending.length} migrations successfully`);
    return { applied: pending.length, total: available.length };
  }

  /**
   * Validate migration integrity
   */
  async validateMigrations(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      const applied = await this.getAppliedMigrations();
      const available = await this.getAvailableMigrations();

      // Check for missing files
      for (const migration of applied) {
        const available_migration = available.find(m => m.version === migration.version);
        if (!available_migration) {
          issues.push(`Applied migration ${migration.version} file not found: ${migration.filename}`);
          continue;
        }

        // Check checksum integrity
        try {
          const content = await this.readMigrationFile(migration.filename);
          const currentChecksum = await this.calculateChecksum(content);

          if (currentChecksum !== migration.checksum) {
            issues.push(`Migration ${migration.version} checksum mismatch - file may have been modified`);
          }
        } catch (error) {
          issues.push(`Cannot read migration file ${migration.filename}: ${error}`);
        }
      }

      return { valid: issues.length === 0, issues };
    } catch (error) {
      issues.push(`Validation failed: ${error}`);
      return { valid: false, issues };
    }
  }

  /**
   * Get migration status summary
   */
  async getStatus(): Promise<{
    applied: Migration[];
    pending: Migration[];
    total: number;
    lastApplied?: Migration;
  }> {
    const applied = await this.getAppliedMigrations();
    const available = await this.getAvailableMigrations();

    const appliedVersions = new Set(applied.map(m => m.version));
    const pending = available.filter(m => !appliedVersions.has(m.version));

    return {
      applied,
      pending,
      total: available.length,
      lastApplied: applied.length > 0 ? applied[applied.length - 1] : undefined
    };
  }

  /**
   * Rollback last migration (DANGEROUS - Use with caution)
   */
  async rollbackLastMigration(): Promise<void> {
    const applied = await this.getAppliedMigrations();

    if (applied.length === 0) {
      throw new Error('No migrations to rollback');
    }

    const lastMigration = applied[applied.length - 1];

    logger.warn(`⚠️  ROLLING BACK migration: ${lastMigration.version} - ${lastMigration.description}`);
    logger.warn('⚠️  This operation cannot be undone and may cause data loss!');

    // Note: SQLite doesn't support automatic rollback of DDL changes
    // This removes the migration record but doesn't undo schema changes
    this.db.run(
      'DELETE FROM schema_migrations WHERE version = ?',
      [lastMigration.version]
    );

    logger.warn(`⚠️  Migration record removed for ${lastMigration.version}`);
    logger.warn('⚠️  Manual schema cleanup may be required');
  }
}

// =============================================================================
// CLI INTERFACE FOR DIRECT MIGRATION USAGE
// =============================================================================

/**
 * Run migrations if this script is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { databaseManager } = await import('./database-manager.js');

  async function runMigrationsCLI() {
    try {
      await databaseManager.initialize();

      const runner = new MigrationRunner(databaseManager);
      const command = process.argv[2] || 'migrate';

      switch (command) {
        case 'migrate':
          const result = await runner.runMigrations();
          console.log(`✅ Migrations complete: ${result.applied}/${result.total} applied`);
          break;

        case 'status':
          const status = await runner.getStatus();
          console.log('📊 Migration Status:');
          console.log(`  Applied: ${status.applied.length}`);
          console.log(`  Pending: ${status.pending.length}`);
          console.log(`  Total: ${status.total}`);
          if (status.lastApplied) {
            console.log(`  Last Applied: ${status.lastApplied.version} (${status.lastApplied.appliedAt})`);
          }
          break;

        case 'validate':
          const validation = await runner.validateMigrations();
          if (validation.valid) {
            console.log('✅ All migrations are valid');
          } else {
            console.log('❌ Migration validation failed:');
            validation.issues.forEach(issue => console.log(`  - ${issue}`));
            process.exit(1);
          }
          break;

        case 'rollback':
          await runner.rollbackLastMigration();
          console.log('⚠️  Last migration rolled back');
          break;

        default:
          console.log('Usage: node migration-runner.js [migrate|status|validate|rollback]');
          process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    }
  }

  runMigrationsCLI();
}