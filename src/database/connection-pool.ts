/**
 * Database Connection Pool - v1.4
 * Manages SQLite connections with proper transaction isolation
 * Note: Using sqlite3 package for better Node.js compatibility
 */

import sqlite3 from 'sqlite3';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

export class DatabaseConnectionPool {
  private pool: Database.Database[] = [];
  private inUse: Set<Database.Database> = new Set();
  private readonly maxConnections: number;
  private readonly connectionTimeout: number;
  private readonly maxRetries: number;
  private readonly dbPath: string;

  constructor(options: {
    dbPath?: string;
    maxConnections?: number;
    connectionTimeout?: number;
    maxRetries?: number;
  } = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), 'data', 'seo-ads-v14.db');
    this.maxConnections = options.maxConnections || 10;
    this.connectionTimeout = options.connectionTimeout || 30000;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    // Ensure database directory exists
    const dbDir = path.dirname(this.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // Create initial connection to set up tables
    const db = await this.createConnection();
    await this.setupTables(db);
    this.pool.push(db);

    logger.info('Database connection pool initialized', {
      dbPath: this.dbPath,
      maxConnections: this.maxConnections
    });
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<Database.Database> {
    // Try to find an available connection
    for (const conn of this.pool) {
      if (!this.inUse.has(conn)) {
        this.inUse.add(conn);
        return conn;
      }
    }

    // Create new connection if under limit
    if (this.pool.length < this.maxConnections) {
      const conn = await this.createConnection();
      this.pool.push(conn);
      this.inUse.add(conn);
      return conn;
    }

    // Wait for a connection to become available
    return this.waitForConnection();
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(connection: Database.Database): void {
    this.inUse.delete(connection);
  }

  /**
   * Execute a transaction with proper isolation
   */
  async withTransaction<T>(
    operation: (db: Database.Database) => Promise<T>,
    options: {
      isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const { 
      isolationLevel = 'READ_COMMITTED', 
      timeout = this.connectionTimeout,
      maxRetries = this.maxRetries 
    } = options;

    const connection = await this.getConnection();

    try {
      // Set isolation level
      if (isolationLevel === 'READ_UNCOMMITTED') {
        connection.pragma('read_uncommitted = 1');
      } else {
        connection.pragma('read_uncommitted = 0');
      }

      // Begin transaction with immediate lock for write operations
      connection.prepare('BEGIN IMMEDIATE').run();

      // Execute operation with timeout
      const result = await Promise.race([
        operation(connection),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Transaction timeout')), timeout)
        )
      ]);

      // Commit transaction
      connection.prepare('COMMIT').run();
      return result;

    } catch (error: any) {
      // Rollback on error
      try {
        connection.prepare('ROLLBACK').run();
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction', rollbackError);
      }

      // Retry logic for deadlock/busy errors
      if (this.isRetryableError(error) && maxRetries > 0) {
        logger.warn(`Retryable database error, retrying: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief backoff
        return this.withTransaction(operation, { 
          ...options, 
          maxRetries: maxRetries - 1 
        });
      }

      throw error;

    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a read-only query
   */
  async query<T>(
    sql: string, 
    params: any[] = []
  ): Promise<T[]> {
    const connection = await this.getConnection();
    try {
      const stmt = connection.prepare(sql);
      return stmt.all(...params) as T[];
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a write operation
   */
  async execute(
    sql: string, 
    params: any[] = []
  ): Promise<Database.RunResult> {
    return this.withTransaction(async (db) => {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    });
  }

  /**
   * Batch insert with transaction
   */
  async batchInsert(
    table: string,
    records: any[],
    batchSize = 1000
  ): Promise<number> {
    if (records.length === 0) return 0;

    return this.withTransaction(async (db) => {
      let totalInserted = 0;
      const columns = Object.keys(records[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const insertMany = db.transaction((records: any[]) => {
          for (const record of records) {
            stmt.run(...columns.map(col => record[col]));
          }
        });
        insertMany(batch);
        totalInserted += batch.length;

        // Log progress for large batches
        if (records.length > 10000 && i % 10000 === 0) {
          logger.debug(`Batch insert progress: ${i}/${records.length}`);
        }
      }

      return totalInserted;
    });
  }

  /**
   * Create a new database connection
   */
  private async createConnection(): Promise<Database.Database> {
    const db = new Database(this.dbPath, { verbose: logger.debug });
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');
    
    return db;
  }

  /**
   * Wait for a connection to become available
   */
  private async waitForConnection(): Promise<Database.Database> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.connectionTimeout) {
      for (const conn of this.pool) {
        if (!this.inUse.has(conn)) {
          this.inUse.add(conn);
          return conn;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error('Connection pool timeout');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('database is locked') ||
      message.includes('busy') ||
      message.includes('deadlock')
    );
  }

  /**
   * Set up database tables
   */
  private async setupTables(db: Database.Database): Promise<void> {
    // Search terms performance (partitioned by date for performance)
    db.exec(`
      CREATE TABLE IF NOT EXISTS fact_search_terms (
        date DATE,
        engine TEXT DEFAULT 'google',
        campaign_id TEXT,
        ad_group_id TEXT,
        query TEXT,
        match_type TEXT,
        clicks INTEGER,
        impressions INTEGER,
        cost REAL,
        conversions REAL,
        conv_value REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (date, campaign_id, ad_group_id, query)
      )
    `);

    // Add indexes for concurrent access patterns
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_search_terms_date 
      ON fact_search_terms(date);
      
      CREATE INDEX IF NOT EXISTS idx_search_terms_performance 
      ON fact_search_terms(date, cost DESC);
    `);

    // Quality Score tracking with version control
    db.exec(`
      CREATE TABLE IF NOT EXISTS fact_qs (
        date DATE,
        campaign_id TEXT,
        ad_group_id TEXT,
        keyword TEXT,
        expected_ctr INTEGER,
        ad_relevance INTEGER,
        lp_experience INTEGER,
        quality_score INTEGER,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (date, campaign_id, ad_group_id, keyword, version)
      )
    `);

    // Event tracking with deduplication
    db.exec(`
      CREATE TABLE IF NOT EXISTS fact_events (
        id TEXT PRIMARY KEY,
        date DATE,
        source TEXT,
        event_name TEXT,
        sessions INTEGER,
        count INTEGER,
        hash TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Negative keyword tracking with conflict resolution
    db.exec(`
      CREATE TABLE IF NOT EXISTS proposed_negatives (
        id TEXT PRIMARY KEY,
        proposed_date DATE,
        keyword TEXT,
        match_type TEXT,
        placement_level TEXT,
        reason TEXT,
        waste_amount REAL,
        status TEXT DEFAULT 'proposed',
        applied_date DATE,
        conflict_resolution TEXT,
        created_by TEXT DEFAULT 'v1.4',
        version INTEGER DEFAULT 1,
        UNIQUE(keyword, match_type, placement_level)
      )
    `);

    logger.info('Database tables initialized');
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    for (const conn of this.pool) {
      conn.close();
    }
    this.pool = [];
    this.inUse.clear();
  }
}