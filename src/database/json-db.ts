/**
 * JSON Database - v1.4
 * Simple JSON-based storage for v1.4 data
 * Can be replaced with SQLite in production
 */

import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

interface Database {
  searchTerms: any[];
  qualityScores: any[];
  proposedNegatives: any[];
  events: any[];
}

export class JsonDatabase {
  private dbPath: string;
  private data: Database = {
    searchTerms: [],
    qualityScores: [],
    proposedNegatives: [],
    events: []
  };

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'v14-data.json');
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    // Load existing data if available
    try {
      const content = await fs.readFile(this.dbPath, 'utf-8');
      this.data = JSON.parse(content);
      logger.info('Loaded existing database', { 
        searchTerms: this.data.searchTerms.length,
        qualityScores: this.data.qualityScores.length 
      });
    } catch (error) {
      // Create new database
      await this.save();
      logger.info('Created new database');
    }
  }

  async query<T>(table: string, filter?: (item: any) => boolean): Promise<T[]> {
    const tableData = this.data[table as keyof Database] || [];
    if (filter) {
      return tableData.filter(filter) as T[];
    }
    return tableData as T[];
  }

  async insert(table: string, records: any[]): Promise<number> {
    const tableData = this.data[table as keyof Database] || [];
    tableData.push(...records);
    this.data[table as keyof Database] = tableData;
    await this.save();
    return records.length;
  }

  async batchInsert(table: string, records: any[], batchSize = 1000): Promise<number> {
    // For JSON database, just insert all at once
    return this.insert(table, records);
  }

  async execute(sql: string, params: any[] = []): Promise<any> {
    // For JSON database, this is a no-op
    logger.debug('Execute called on JSON database (no-op)', { sql });
    return { changes: 0 };
  }

  async withTransaction<T>(
    operation: (db: any) => Promise<T>
  ): Promise<T> {
    // For JSON database, transactions are not needed
    return operation(this);
  }

  async close(): Promise<void> {
    await this.save();
    logger.info('Database closed');
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
  }
}

// Export as DatabaseConnectionPool for compatibility
export class DatabaseConnectionPool extends JsonDatabase {
  async getConnection(): Promise<any> {
    return this;
  }

  releaseConnection(connection: any): void {
    // No-op for JSON database
  }
}