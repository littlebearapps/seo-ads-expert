/**
 * Transaction Policy Guard
 * Enforces transaction policy for migration files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Transaction keywords that are forbidden in SQL migration files
 */
const FORBIDDEN_TRANSACTION_KEYWORDS = [
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
  'BEGIN TRANSACTION',
  'COMMIT TRANSACTION',
  'ROLLBACK TRANSACTION'
] as const;

/**
 * Result of transaction policy validation
 */
export interface TransactionPolicyResult {
  valid: boolean;
  violations: TransactionViolation[];
  summary: string;
}

/**
 * Details of a transaction policy violation
 */
export interface TransactionViolation {
  file: string;
  line: number;
  keyword: string;
  context: string;
  severity: 'error' | 'warning';
}

/**
 * Configuration for transaction policy checking
 */
export interface TransactionPolicyConfig {
  strict: boolean;           // If true, treat all violations as errors
  allowComments: boolean;    // If true, ignore keywords in comments
  allowStrings: boolean;     // If true, ignore keywords in string literals
  migrationsDir: string;     // Directory to scan for migrations
}

/**
 * Default configuration for transaction policy
 */
const DEFAULT_CONFIG: TransactionPolicyConfig = {
  strict: true,
  allowComments: true,
  allowStrings: true,
  migrationsDir: 'src/database/migrations'
};

/**
 * Transaction Policy Guard
 * Validates that SQL migration files follow transaction policy
 */
export class TransactionPolicyGuard {
  private config: TransactionPolicyConfig;

  constructor(config: Partial<TransactionPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate all migration files in the directory
   */
  async validateMigrations(): Promise<TransactionPolicyResult> {
    const violations: TransactionViolation[] = [];

    try {
      const files = await this.getMigrationFiles();

      for (const file of files) {
        const fileViolations = await this.validateFile(file);
        violations.push(...fileViolations);
      }

      const valid = violations.length === 0;
      const summary = this.generateSummary(violations);

      return { valid, violations, summary };
    } catch (error) {
      logger.error('Failed to validate migrations:', error);
      return {
        valid: false,
        violations: [],
        summary: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate a single SQL file
   */
  async validateFile(filePath: string): Promise<TransactionViolation[]> {
    const violations: TransactionViolation[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        const lineViolations = this.validateLine(line, lineNumber, filePath);
        violations.push(...lineViolations);
      }
    } catch (error) {
      violations.push({
        file: filePath,
        line: 0,
        keyword: 'FILE_ERROR',
        context: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    }

    return violations;
  }

  /**
   * Validate a single line of SQL
   */
  private validateLine(line: string, lineNumber: number, filePath: string): TransactionViolation[] {
    const violations: TransactionViolation[] = [];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      return violations;
    }

    // Skip comment lines if configured
    if (this.config.allowComments && this.isCommentLine(trimmedLine)) {
      return violations;
    }

    // Check for forbidden keywords
    for (const keyword of FORBIDDEN_TRANSACTION_KEYWORDS) {
      if (this.containsKeyword(trimmedLine, keyword)) {
        // Skip if keyword is in a string literal and strings are allowed
        if (this.config.allowStrings && this.isInStringLiteral(trimmedLine, keyword)) {
          continue;
        }

        // Skip if keyword is part of trigger syntax
        if (this.isInTriggerContext(trimmedLine, keyword)) {
          continue;
        }

        violations.push({
          file: path.basename(filePath),
          line: lineNumber,
          keyword,
          context: trimmedLine,
          severity: this.config.strict ? 'error' : 'warning'
        });
      }
    }

    return violations;
  }

  /**
   * Check if a line is a comment
   */
  private isCommentLine(line: string): boolean {
    return line.startsWith('--') || line.startsWith('/*') || line.startsWith('*');
  }

  /**
   * Check if a line contains a forbidden keyword
   */
  private containsKeyword(line: string, keyword: string): boolean {
    const upperLine = line.toUpperCase();
    const upperKeyword = keyword.toUpperCase();

    // Check for word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${upperKeyword.replace(/\s+/g, '\\s+')}\\b`);
    return regex.test(upperLine);
  }

  /**
   * Check if a keyword appears within a string literal
   */
  private isInStringLiteral(line: string, keyword: string): boolean {
    // Simple check for single and double quoted strings
    const singleQuoteRegex = /'[^']*'/g;
    const doubleQuoteRegex = /"[^"]*"/g;

    const strings = [
      ...line.match(singleQuoteRegex) || [],
      ...line.match(doubleQuoteRegex) || []
    ];

    return strings.some(str =>
      str.toUpperCase().includes(keyword.toUpperCase())
    );
  }

  /**
   * Check if a keyword is part of valid trigger syntax
   */
  private isInTriggerContext(line: string, keyword: string): boolean {
    const upperLine = line.toUpperCase();
    const upperKeyword = keyword.toUpperCase();

    // Allow BEGIN and END in trigger definitions
    if (upperKeyword === 'BEGIN' || upperKeyword === 'END') {
      // Check if this is a standalone BEGIN/END in trigger context
      // Triggers use "BEGIN ... END;" not "BEGIN TRANSACTION"
      return upperLine === 'BEGIN' || upperLine === 'END' || upperLine === 'END;';
    }

    return false;
  }

  /**
   * Get list of migration files
   */
  private async getMigrationFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .map(file => path.join(this.config.migrationsDir, file))
        .sort();
    } catch (error) {
      throw new Error(`Cannot read migrations directory: ${this.config.migrationsDir}`);
    }
  }

  /**
   * Generate a summary of violations
   */
  private generateSummary(violations: TransactionViolation[]): string {
    if (violations.length === 0) {
      return '✅ All migration files follow transaction policy';
    }

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const fileCount = new Set(violations.map(v => v.file)).size;

    let summary = `❌ Transaction policy violations found:\n`;
    summary += `  Files affected: ${fileCount}\n`;
    summary += `  Errors: ${errorCount}\n`;
    summary += `  Warnings: ${warningCount}\n\n`;

    summary += 'Details:\n';
    for (const violation of violations) {
      const icon = violation.severity === 'error' ? '❌' : '⚠️';
      summary += `  ${icon} ${violation.file}:${violation.line} - ${violation.keyword}\n`;
      summary += `     Context: ${violation.context}\n`;
    }

    summary += '\nTransaction Policy:\n';
    summary += '  - SQL migration files must NOT contain transaction statements\n';
    summary += '  - The application layer controls all transactions\n';
    summary += '  - Remove BEGIN, COMMIT, ROLLBACK statements from migration files\n';

    return summary;
  }

  /**
   * Fix a migration file by removing transaction statements
   */
  async fixMigrationFile(filePath: string, dryRun: boolean = true): Promise<{
    fixed: boolean;
    changes: string[];
    content?: string;
  }> {
    const changes: string[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const fixedLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        let processedLine = line;

        // Check if line contains forbidden keywords
        let lineModified = false;
        for (const keyword of FORBIDDEN_TRANSACTION_KEYWORDS) {
          if (this.containsKeyword(line.trim(), keyword) && !this.isCommentLine(line.trim())) {
            // Comment out the line instead of removing it
            processedLine = `-- REMOVED BY TRANSACTION POLICY: ${line}`;
            changes.push(`Line ${lineNumber}: Commented out "${keyword}" statement`);
            lineModified = true;
            break;
          }
        }

        fixedLines.push(processedLine);
      }

      const fixedContent = fixedLines.join('\n');

      if (!dryRun && changes.length > 0) {
        await fs.writeFile(filePath, fixedContent, 'utf-8');
      }

      return {
        fixed: changes.length > 0,
        changes,
        content: dryRun ? fixedContent : undefined
      };
    } catch (error) {
      throw new Error(`Failed to fix migration file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * CLI-friendly function to validate migrations
 */
export async function validateMigrationTransactionPolicy(
  migrationsDir: string = 'src/database/migrations'
): Promise<TransactionPolicyResult> {
  const guard = new TransactionPolicyGuard({ migrationsDir });
  return await guard.validateMigrations();
}

/**
 * CLI-friendly function to fix migration files
 */
export async function fixMigrationTransactionViolations(
  migrationsDir: string = 'src/database/migrations',
  dryRun: boolean = true
): Promise<{ [filePath: string]: { fixed: boolean; changes: string[] } }> {
  const guard = new TransactionPolicyGuard({ migrationsDir });
  const result = await guard.validateMigrations();

  const fixes: { [filePath: string]: { fixed: boolean; changes: string[] } } = {};

  if (!result.valid) {
    const affectedFiles = Array.from(new Set(result.violations.map(v =>
      path.join(migrationsDir, v.file)
    )));

    for (const filePath of affectedFiles) {
      try {
        const fix = await guard.fixMigrationFile(filePath, dryRun);
        fixes[filePath] = {
          fixed: fix.fixed,
          changes: fix.changes
        };
      } catch (error) {
        fixes[filePath] = {
          fixed: false,
          changes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`]
        };
      }
    }
  }

  return fixes;
}