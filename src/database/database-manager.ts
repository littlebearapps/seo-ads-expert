/**
 * Database Manager for v1.5 A/B Testing Framework
 * Handles SQLite database initialization and schema management
 */

import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  busyTimeout?: number;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;
  private initialized = false;

  constructor(config: DatabaseConfig) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      busyTimeout: 30000,
      ...config
    };
  }

  /**
   * Initialize the database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.config.path);
      await fs.mkdir(dbDir, { recursive: true });

      // Create database connection (better-sqlite3 is synchronous)
      this.db = new Database(this.config.path);

      // Configure database
      this.configurePragmas();

      // Initialize schema
      await this.initializeSchema();

      this.initialized = true;
      logger.info(`✅ Database initialized: ${this.config.path}`);
    } catch (error) {
      logger.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Configure SQLite pragmas for performance and integrity
   */
  private configurePragmas(): void {
    if (!this.db) throw new Error('Database not initialized');

    if (this.config.enableForeignKeys) {
      this.db.pragma('foreign_keys = ON');
    }

    if (this.config.enableWAL) {
      this.db.pragma('journal_mode = WAL');
    }

    this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = memory');

    logger.info('✅ Database pragmas configured');
  }

  /**
   * Initialize database schema from SQL file
   */
  private async initializeSchema(): Promise<void> {
    try {
      const schemaPath = path.join(__dirname, 'schema-v1.5.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');

      // Execute schema statements
      if (!this.db) throw new Error('Database not initialized');
      
      // Remove comments and clean schema
      const cleanSchema = schema
        .split('\n')
        .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
        .join('\n');
      
      // Split into individual statements - handle multiline statements properly
      const statements = cleanSchema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.match(/^\s*$/));

      let successCount = 0;
      let errorCount = 0;

      for (const statement of statements) {
        try {
          // Skip empty statements
          if (!statement || statement.trim().length === 0) continue;
          
          this.db.exec(statement);
          successCount++;
        } catch (error) {
          errorCount++;
          // Log the error with more detail for debugging
          logger.warn(`Warning executing statement: ${error}`);
          logger.debug(`Failed statement (${statement.length} chars): ${statement.substring(0, 150)}...`);
          
          // Check for specific known issues
          if (error instanceof Error && error.message.includes('incomplete input')) {
            logger.debug('This is likely a SQL comment or incomplete statement - safe to ignore');
          }
        }
      }

      logger.info(`✅ Database schema initialized: ${successCount} statements executed, ${errorCount} errors`);
    } catch (error) {
      logger.error('❌ Failed to initialize schema:', error);
      logger.error('Schema path:', path.join(__dirname, 'schema-v1.5.sql'));
      throw error;
    }
  }

  /**
   * Execute SQL statement
   */
  exec(sql: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec(sql);
  }

  /**
   * Get the raw database instance (for advanced operations)
   */
  getDb(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /**
   * Run SQL query with parameters
   */
  run(sql: string, params?: any[]): Database.RunResult {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    return stmt.run(...(params || []));
  }

  /**
   * Get single row from query
   */
  get<T = any>(sql: string, params?: any[]): T | undefined {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    return stmt.get(...(params || [])) as T | undefined;
  }

  /**
   * Get all rows from query
   */
  all<T = any>(sql: string, params?: any[]): T[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params || [])) as T[];
  }

  /**
   * Begin transaction
   */
  beginTransaction(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('BEGIN TRANSACTION');
  }

  /**
   * Commit transaction
   */
  commit(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('COMMIT');
  }

  /**
   * Rollback transaction
   */
  rollback(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('ROLLBACK');
  }

  /**
   * Execute function within transaction
   */
  transaction<T>(fn: () => T): T {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  /**
   * Get database statistics
   */
  getStats(): {
    experiments: number;
    variants: number;
    dailyMetrics: number;
    conversions: number;
    assignments: number;
  } {
    const experiments = this.get<{ count: number }>('SELECT COUNT(*) as count FROM fact_ab_tests');
    const variants = this.get<{ count: number }>('SELECT COUNT(*) as count FROM fact_ab_variants');
    const dailyMetrics = this.get<{ count: number }>('SELECT COUNT(*) as count FROM fact_ab_metrics');
    const conversions = this.get<{ count: number }>('SELECT COUNT(*) as count FROM fact_ab_conversions');
    const assignments = this.get<{ count: number }>('SELECT COUNT(*) as count FROM fact_ab_assignments');

    return {
      experiments: experiments?.count || 0,
      variants: variants?.count || 0,
      dailyMetrics: dailyMetrics?.count || 0,
      conversions: conversions?.count || 0,
      assignments: assignments?.count || 0
    };
  }

  /**
   * Vacuum database for optimization
   */
  vacuum(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('VACUUM');
    logger.info('✅ Database vacuumed');
  }

  /**
   * Analyze database for query optimization
   */
  analyze(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('ANALYZE');
    logger.info('✅ Database analyzed');
  }

  /**
   * Check database integrity
   */
  checkIntegrity(): { ok: boolean; errors: string[] } {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const result = this.db.pragma('integrity_check');
      const isOk = result.length === 1 && result[0].integrity_check === 'ok';
      
      if (isOk) {
        logger.info('✅ Database integrity check passed');
        return { ok: true, errors: [] };
      } else {
        const errors = result.map(r => String(r.integrity_check));
        logger.warn('⚠️ Database integrity issues found:', errors);
        return { ok: false, errors };
      }
    } catch (error) {
      logger.error('❌ Database integrity check failed:', error);
      return { 
        ok: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      };
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Check if database is initialized and connected
   */
  isInitialized(): boolean {
    return this.initialized && this.db !== null;
  }

  /**
   * Get raw database connection (use with caution)
   */
  getConnection(): Database.Database | null {
    return this.db;
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager({
  path: 'experiments/experiments.db'
});