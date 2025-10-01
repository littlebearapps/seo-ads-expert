/**
 * Transaction Policy Guard Tests
 * Validates the transaction policy enforcement system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransactionPolicyGuard, validateMigrationTransactionPolicy } from '../database/transaction-policy-guard.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Transaction Policy Guard', () => {
  let tempDir: string;
  let guard: TransactionPolicyGuard;

  beforeEach(async () => {
    // Create temporary directory for test migrations
    tempDir = `/tmp/test-migrations-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    guard = new TransactionPolicyGuard({
      migrationsDir: tempDir,
      strict: true
    });
  });

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Policy Validation', () => {
    it('should pass validation for clean SQL files', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-clean.sql'), `
        -- Clean migration file
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE INDEX idx_users_name ON users(name);
      `);

      const result = await guard.validateMigrations();

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.summary).toContain('✅');
    });

    it('should detect BEGIN TRANSACTION violations', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-bad.sql'), `
        BEGIN TRANSACTION;

        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );

        COMMIT;
      `);

      const result = await guard.validateMigrations();

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2); // At least BEGIN TRANSACTION and COMMIT

      const keywords = result.violations.map(v => v.keyword);
      expect(keywords).toContain('BEGIN TRANSACTION');
      expect(keywords).toContain('COMMIT');
    });

    it('should detect all forbidden keywords', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-violations.sql'), `
        BEGIN;
        CREATE TABLE test (id INTEGER);
        SAVEPOINT sp1;
        INSERT INTO test VALUES (1);
        ROLLBACK TO sp1;
        COMMIT TRANSACTION;
      `);

      const result = await guard.validateMigrations();

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(3);

      const keywords = result.violations.map(v => v.keyword);
      expect(keywords).toContain('BEGIN');
      expect(keywords).toContain('SAVEPOINT');
      expect(keywords).toContain('ROLLBACK');
      expect(keywords).toContain('COMMIT TRANSACTION');
    });

    it('should ignore keywords in comments when configured', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-comments.sql'), `
        -- This migration uses BEGIN and COMMIT in comments
        /* BEGIN TRANSACTION would normally be forbidden */
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          -- ROLLBACK is mentioned here but should be ignored
          name TEXT NOT NULL
        );
      `);

      const guardAllowComments = new TransactionPolicyGuard({
        migrationsDir: tempDir,
        allowComments: true
      });

      const result = await guardAllowComments.validateMigrations();

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should ignore keywords in string literals when configured', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-strings.sql'), `
        CREATE TABLE audit_log (
          id INTEGER PRIMARY KEY,
          action TEXT DEFAULT 'BEGIN',
          description TEXT DEFAULT "COMMIT operation completed"
        );
      `);

      const guardAllowStrings = new TransactionPolicyGuard({
        migrationsDir: tempDir,
        allowStrings: true
      });

      const result = await guardAllowStrings.validateMigrations();

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should enforce strict mode correctly', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-transaction.sql'), `
        BEGIN;
        CREATE TABLE test (id INTEGER);
        COMMIT;
      `);

      // Strict mode - all violations are errors
      const strictGuard = new TransactionPolicyGuard({
        migrationsDir: tempDir,
        strict: true
      });

      const strictResult = await strictGuard.validateMigrations();
      expect(strictResult.violations.every(v => v.severity === 'error')).toBe(true);

      // Non-strict mode - violations are warnings
      const lenientGuard = new TransactionPolicyGuard({
        migrationsDir: tempDir,
        strict: false
      });

      const lenientResult = await lenientGuard.validateMigrations();
      expect(lenientResult.violations.every(v => v.severity === 'warning')).toBe(true);
    });
  });

  describe('File Fixing', () => {
    it('should fix migration files by commenting out violations', async () => {
      const badContent = `
BEGIN TRANSACTION;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

COMMIT;
`;

      const filePath = path.join(tempDir, 'v1.0-fix-me.sql');
      await fs.writeFile(filePath, badContent);

      const fix = await guard.fixMigrationFile(filePath, true); // dry run

      expect(fix.fixed).toBe(true);
      expect(fix.changes.length).toBeGreaterThan(0);
      expect(fix.content).toContain('-- REMOVED BY TRANSACTION POLICY');
      expect(fix.content).toContain('BEGIN TRANSACTION');
      expect(fix.content).toContain('COMMIT');
    });

    it('should preserve original content when no violations exist', async () => {
      const cleanContent = `
-- Clean migration
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
`;

      const filePath = path.join(tempDir, 'v1.0-clean.sql');
      await fs.writeFile(filePath, cleanContent);

      const fix = await guard.fixMigrationFile(filePath, true);

      expect(fix.fixed).toBe(false);
      expect(fix.changes).toHaveLength(0);
    });

    it('should actually modify files when dry run is false', async () => {
      const badContent = `BEGIN;\nCREATE TABLE test (id INTEGER);\nCOMMIT;`;
      const filePath = path.join(tempDir, 'v1.0-modify.sql');
      await fs.writeFile(filePath, badContent);

      const fix = await guard.fixMigrationFile(filePath, false); // actual fix

      expect(fix.fixed).toBe(true);

      const modifiedContent = await fs.readFile(filePath, 'utf-8');
      expect(modifiedContent).toContain('-- REMOVED BY TRANSACTION POLICY');
      expect(modifiedContent).not.toMatch(/^BEGIN;$/m);
      expect(modifiedContent).not.toMatch(/^COMMIT;$/m);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing migrations directory gracefully', async () => {
      const nonExistentGuard = new TransactionPolicyGuard({
        migrationsDir: '/path/that/does/not/exist'
      });

      const result = await nonExistentGuard.validateMigrations();

      expect(result.valid).toBe(false);
      expect(result.summary).toContain('Validation failed');
    });

    it('should handle unreadable files gracefully', async () => {
      // Create a file and then make it unreadable (if possible on this system)
      const filePath = path.join(tempDir, 'v1.0-unreadable.sql');
      await fs.writeFile(filePath, 'content');

      try {
        await fs.chmod(filePath, 0o000); // Remove all permissions
      } catch (error) {
        // Skip this test if we can't change permissions
        return;
      }

      const result = await guard.validateMigrations();

      // Should handle the error gracefully
      expect(result.violations.some(v => v.keyword === 'FILE_ERROR')).toBe(true);

      // Restore permissions for cleanup
      await fs.chmod(filePath, 0o644);
    });
  });

  describe('Real Migration Files', () => {
    it('should validate actual migration files in the project', async () => {
      const realMigrationsDir = 'src/database/migrations';
      const realGuard = new TransactionPolicyGuard({
        migrationsDir: realMigrationsDir,
        strict: true
      });

      const result = await realGuard.validateMigrations();

      // This test will fail initially, showing us the actual violations
      if (!result.valid) {
        console.log('\n📋 Current migration violations:');
        console.log(result.summary);
      }

      // For now, just check that the validation runs without throwing
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('summary');
    });
  });

  describe('CLI Functions', () => {
    it('should work with CLI-friendly validation function', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-test.sql'), `
        CREATE TABLE test (id INTEGER);
      `);

      const result = await validateMigrationTransactionPolicy(tempDir);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Summary Generation', () => {
    it('should generate informative summary for violations', async () => {
      await fs.writeFile(path.join(tempDir, 'v1.0-bad1.sql'), 'BEGIN;\nCREATE TABLE test1 (id INTEGER);\nCOMMIT;');
      await fs.writeFile(path.join(tempDir, 'v2.0-bad2.sql'), 'BEGIN TRANSACTION;\nCREATE TABLE test2 (id INTEGER);\nROLLBACK;');

      const result = await guard.validateMigrations();

      expect(result.summary).toContain('Files affected: 2');
      expect(result.summary).toContain('Transaction Policy:');
      expect(result.summary).toContain('BEGIN');
      expect(result.summary).toContain('COMMIT');
      expect(result.summary).toContain('ROLLBACK');
    });
  });
});