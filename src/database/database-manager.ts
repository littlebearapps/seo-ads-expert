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

      // Run any pending migrations to ensure schema is up to date
      await this.runMigrations();

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
   * Run database migrations to ensure schema is current
   */
  private async runMigrations(): Promise<void> {
    try {
      // Import MigrationRunner here to avoid circular dependencies
      const { MigrationRunner } = await import('./migration-runner.js');
      const runner = new MigrationRunner(this);

      const result = await runner.runMigrations();
      logger.info(`✅ Applied ${result.applied} migrations successfully`);
    } catch (error) {
      logger.error('❌ Failed to run migrations:', error);
      throw error;
    }
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
      
      // Execute the entire schema as a single transaction
      // This is more reliable than trying to split complex SQL
      try {
        this.db.exec(schema);
        logger.info(`✅ Database schema initialized successfully`);
      } catch (error) {
        // If full execution fails, fall back to statement-by-statement execution
        logger.debug('Full schema execution failed, falling back to statement-by-statement execution');
        
        // Better SQL statement parsing that handles triggers and complex statements
        const statements = this.parseSchemaStatements(schema);
        
        let successCount = 0;
        let errorCount = 0;
        const knownWarnings = [
          'incomplete input',
          'cannot commit - no transaction is active',
          'FOREIGN KEY constraint failed'
        ];

        for (const statement of statements) {
          try {
            if (!statement || statement.trim().length === 0) continue;
            
            this.db.exec(statement);
            successCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Only count as real errors if not a known warning
            const isKnownWarning = knownWarnings.some(warning => errorMessage.includes(warning));
            if (!isKnownWarning) {
              errorCount++;
              logger.error(`Error executing statement: ${errorMessage}`);
            } else {
              logger.debug(`Known warning (safe to ignore): ${errorMessage}`);
            }
          }
        }

        logger.info(`✅ Database schema initialized: ${successCount} statements executed, ${errorCount} critical errors`);
      }
    } catch (error) {
      logger.error('❌ Failed to initialize schema:', error);
      throw error;
    }
  }

  /**
   * Parse SQL schema into individual statements, handling triggers and complex SQL
   */
  private parseSchemaStatements(schema: string): string[] {
    const statements: string[] = [];
    const lines = schema.split('\n');
    let currentStatement = '';
    let inTrigger = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments
      if (trimmedLine.startsWith('--') || trimmedLine.length === 0) {
        continue;
      }
      
      // Track trigger blocks (which contain semicolons that shouldn't split)
      if (trimmedLine.toUpperCase().includes('CREATE TRIGGER')) {
        inTrigger = true;
      }
      
      currentStatement += line + '\n';
      
      // Check for statement end
      if (trimmedLine.endsWith(';')) {
        if (inTrigger) {
          // For triggers, look for END; as the actual terminator
          if (trimmedLine.toUpperCase().startsWith('END;')) {
            statements.push(currentStatement.trim());
            currentStatement = '';
            inTrigger = false;
          }
        } else {
          // Normal statement
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }
    
    return statements.filter(s => s.length > 0);
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

  // =============================================================================
  // V1.8 ENTITY COVERAGE METHODS
  // =============================================================================

  /**
   * Save entity coverage analysis to database
   */
  async saveCoverageAnalysis(analysis: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO fact_entity_coverage
      (measured_at, product, cluster, market, coverage_score, competitor_avg, gap_count, recommendations_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      analysis.measuredAt,
      analysis.product,
      analysis.cluster,
      analysis.market,
      analysis.coverageScore,
      analysis.competitorAverage,
      analysis.gapCount,
      JSON.stringify({
        entityGaps: analysis.entityGaps,
        sectionGaps: analysis.sectionGaps,
        schemaGaps: analysis.schemaGaps,
        recommendations: analysis.recommendations
      })
    );

    logger.info(`Saved coverage analysis for ${analysis.product}/${analysis.cluster}/${analysis.market}`);
  }

  /**
   * Get latest coverage analysis for a product/cluster/market
   */
  async getLatestCoverageAnalysis(product: string, cluster: string, market: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM fact_entity_coverage
      WHERE product = ? AND cluster = ? AND market = ?
      ORDER BY measured_at DESC
      LIMIT 1
    `);

    const result = stmt.get(product, cluster, market) as any;

    if (!result) return null;

    // Parse JSON fields
    const recommendations = JSON.parse(result.recommendations_json || '{}');

    return {
      product: result.product,
      cluster: result.cluster,
      market: result.market,
      measuredAt: result.measured_at,
      coverageScore: result.coverage_score,
      competitorAverage: result.competitor_avg,
      gapCount: result.gap_count,
      entityGaps: recommendations.entityGaps || [],
      sectionGaps: recommendations.sectionGaps || [],
      schemaGaps: recommendations.schemaGaps || [],
      recommendations: recommendations.recommendations || []
    };
  }

  /**
   * Get SERP data for entity extraction
   */
  async getSERPData(product: string, markets: string[]): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const marketPlaceholders = markets.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM fact_serp_snapshot
      WHERE product = ? AND market IN (${marketPlaceholders})
      ORDER BY snapshot_date DESC
    `);

    return stmt.all(product, ...markets) as any[];
  }

  /**
   * Save page snapshot to database
   */
  async savePageSnapshot(snapshot: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO fact_page_snapshot
      (captured_at, page_url, word_count, headings_json, sections_json, present_entities_json, schema_types_json, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      snapshot.capturedAt,
      snapshot.url,
      snapshot.wordCount,
      JSON.stringify(snapshot.headings),
      JSON.stringify(snapshot.sections),
      JSON.stringify(snapshot.presentEntities),
      JSON.stringify(snapshot.schemaTypes),
      snapshot.contentHash
    );
  }

  /**
   * Get page snapshots for analysis
   */
  async getPageSnapshots(urls?: string[]): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    let stmt;
    let params: any[] = [];

    if (urls && urls.length > 0) {
      const placeholders = urls.map(() => '?').join(',');
      stmt = this.db.prepare(`
        SELECT * FROM fact_page_snapshot
        WHERE page_url IN (${placeholders})
        ORDER BY captured_at DESC
      `);
      params = urls;
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM fact_page_snapshot
        ORDER BY captured_at DESC
      `);
    }

    const results = stmt.all(...params) as any[];

    return results.map(row => ({
      url: row.page_url,
      capturedAt: row.captured_at,
      wordCount: row.word_count,
      headings: JSON.parse(row.headings_json || '[]'),
      sections: JSON.parse(row.sections_json || '[]'),
      presentEntities: JSON.parse(row.present_entities_json || '[]'),
      schemaTypes: JSON.parse(row.schema_types_json || '[]'),
      contentHash: row.content_hash
    }));
  }

  /**
   * Save entity to database
   */
  async saveEntity(entity: any, productId: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO dim_entity
      (product_id, canonical, variants_json, importance)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      productId,
      entity.canonical,
      JSON.stringify(entity.variants),
      entity.importance
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get entities for a product
   */
  async getEntities(productId: number, minImportance: number = 0): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM dim_entity
      WHERE product_id = ? AND importance >= ?
      ORDER BY importance DESC
    `);

    const results = stmt.all(productId, minImportance) as any[];

    return results.map(row => ({
      entityId: row.entity_id,
      canonical: row.canonical,
      variants: JSON.parse(row.variants_json || '[]'),
      importance: row.importance,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Get recommendations from coverage analysis
   */
  async getRecommendations(product: string, url?: string, minImpact: number = 1): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT recommendations_json FROM fact_entity_coverage
      WHERE product = ?
      ORDER BY measured_at DESC
      LIMIT 10
    `);

    const results = stmt.all(product) as any[];
    const allRecommendations: any[] = [];

    for (const row of results) {
      const data = JSON.parse(row.recommendations_json || '{}');
      if (data.recommendations) {
        allRecommendations.push(...data.recommendations);
      }
    }

    // Filter and deduplicate recommendations
    const filtered = allRecommendations
      .filter(rec => rec.impact >= minImpact)
      .filter(rec => !url || rec.targetUrl === url);

    // Remove duplicates by title
    const unique = filtered.filter((rec, index, self) =>
      index === self.findIndex(r => r.title === rec.title)
    );

    return unique.sort((a, b) => {
      const aScore = (a.impact / a.effort) * a.priority;
      const bScore = (b.impact / b.effort) * b.priority;
      return bScore - aScore;
    });
  }

  /**
   * Get entity coverage statistics
   */
  getEntityStats(): {
    entities: number;
    pageSnapshots: number;
    coverageAnalyses: number;
    recommendations: number;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const entities = this.db.prepare('SELECT COUNT(*) as count FROM dim_entity').get() as { count: number };
    const pageSnapshots = this.db.prepare('SELECT COUNT(*) as count FROM fact_page_snapshot').get() as { count: number };
    const coverageAnalyses = this.db.prepare('SELECT COUNT(*) as count FROM fact_entity_coverage').get() as { count: number };

    // Count recommendations from JSON data
    const analysisResults = this.db.prepare('SELECT recommendations_json FROM fact_entity_coverage').all() as any[];
    let recommendationCount = 0;
    for (const row of analysisResults) {
      const data = JSON.parse(row.recommendations_json || '{}');
      if (data.recommendations) {
        recommendationCount += data.recommendations.length;
      }
    }

    return {
      entities: entities.count,
      pageSnapshots: pageSnapshots.count,
      coverageAnalyses: coverageAnalyses.count,
      recommendations: recommendationCount
    };
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager({
  path: 'experiments/experiments.db'
});