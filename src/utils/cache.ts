import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import pino from 'pino';
import { CacheEntry, CacheEntrySchema } from '../connectors/types.js';
import { validateEnvironment } from './validation.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  totalRequests: number;
  expiredEntries: number;
  cacheSize: number;
}

export interface QuotaStats {
  serpCallsUsed: number;
  serpCallsLimit: number;
  serpCallsRemaining: number;
  keywordCallsUsed: number;
  quotaResetDate: string;
}

export class CacheManager {
  private cachePath: string;
  private ttlHours: number;
  private maxSerpCalls: number;
  private stats: CacheStats;
  private quotaStats: QuotaStats;
  // private sessionStartTime: number; // Reserved for future session tracking

  constructor() {
    const env = validateEnvironment();
    this.cachePath = join(process.cwd(), 'cache');
    this.ttlHours = env.CACHE_TTL_HOURS;
    this.maxSerpCalls = env.MAX_SERP_CALLS_PER_RUN;
    // this.sessionStartTime = Date.now(); // Reserved for future session tracking

    // Initialize stats
    this.stats = {
      totalEntries: 0,
      hitRate: 0,
      missRate: 0,
      totalHits: 0,
      totalMisses: 0,
      totalRequests: 0,
      expiredEntries: 0,
      cacheSize: 0
    };

    this.quotaStats = {
      serpCallsUsed: 0,
      serpCallsLimit: this.maxSerpCalls,
      serpCallsRemaining: this.maxSerpCalls,
      keywordCallsUsed: 0,
      quotaResetDate: new Date().toISOString().split('T')[0] // Today's date
    };

    this.initializeCache();
  }

  private initializeCache(): void {
    try {
      // Ensure cache directory exists
      if (!existsSync(this.cachePath)) {
        mkdirSync(this.cachePath, { recursive: true });
        logger.info(`📁 Created cache directory: ${this.cachePath}`);
      }

      // Clean up expired entries on startup
      this.cleanupExpiredEntries();
      
      // Load quota stats from previous session
      this.loadQuotaStats();

      // Calculate current cache stats
      this.calculateCacheStats();

      logger.info(`🗂️  Cache initialized: ${this.stats.totalEntries} entries, ${this.formatBytes(this.stats.cacheSize)}`);
      logger.info(`📊 Quota status: ${this.quotaStats.serpCallsRemaining}/${this.quotaStats.serpCallsLimit} SERP calls remaining`);

    } catch (error) {
      logger.warn('⚠️  Failed to initialize cache:', error);
    }
  }

  async get<T>(key: string, source: 'kwp' | 'gsc' | 'rapid-serp' | 'rapid-keywords'): Promise<T | null> {
    try {
      const cacheKey = this.generateCacheKey(key, source);
      const filePath = this.getCacheFilePath(cacheKey);

      if (!existsSync(filePath)) {
        this.recordMiss();
        logger.debug(`💨 Cache miss: ${key}`);
        return null;
      }

      const fileContent = readFileSync(filePath, 'utf8');
      const cacheEntry = CacheEntrySchema.parse(JSON.parse(fileContent));

      // Check if entry is expired
      const now = Date.now();
      const expiresAt = cacheEntry.timestamp + (cacheEntry.ttl * 60 * 60 * 1000);

      if (now > expiresAt) {
        // Entry expired, remove it
        unlinkSync(filePath);
        this.recordMiss();
        this.stats.expiredEntries++;
        logger.debug(`⏰ Cache expired: ${key} (${Math.round((now - expiresAt) / 1000 / 60)} minutes overdue)`);
        return null;
      }

      this.recordHit();
      logger.debug(`✅ Cache hit: ${key} (age: ${Math.round((now - cacheEntry.timestamp) / 1000 / 60)} minutes)`);
      
      return cacheEntry.data as T;

    } catch (error) {
      logger.warn(`⚠️  Cache read error for key ${key}:`, error);
      this.recordMiss();
      return null;
    }
  }

  async set<T>(key: string, data: T, source: 'kwp' | 'gsc' | 'rapid-serp' | 'rapid-keywords'): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key, source);
      const filePath = this.getCacheFilePath(cacheKey);

      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const cacheEntry: CacheEntry = {
        key: cacheKey,
        data: data,
        timestamp: Date.now(),
        ttl: this.ttlHours,
        source: source
      };

      const validated = CacheEntrySchema.parse(cacheEntry);
      writeFileSync(filePath, JSON.stringify(validated, null, 2), 'utf8');

      logger.debug(`💾 Cached: ${key} (source: ${source}, ttl: ${this.ttlHours}h)`);

    } catch (error) {
      logger.warn(`⚠️  Cache write error for key ${key}:`, error);
    }
  }

  recordSerpCall(): boolean {
    if (this.quotaStats.serpCallsUsed >= this.quotaStats.serpCallsLimit) {
      logger.warn(`🚫 SERP call quota exceeded: ${this.quotaStats.serpCallsUsed}/${this.quotaStats.serpCallsLimit}`);
      return false;
    }

    this.quotaStats.serpCallsUsed++;
    this.quotaStats.serpCallsRemaining = this.quotaStats.serpCallsLimit - this.quotaStats.serpCallsUsed;

    logger.debug(`📞 SERP call recorded: ${this.quotaStats.serpCallsUsed}/${this.quotaStats.serpCallsLimit} (${this.quotaStats.serpCallsRemaining} remaining)`);
    
    return true;
  }

  recordKeywordCall(): void {
    this.quotaStats.keywordCallsUsed++;
    logger.debug(`🔤 Keyword call recorded: ${this.quotaStats.keywordCallsUsed}`);
  }

  canMakeSerpCall(): boolean {
    return this.quotaStats.serpCallsUsed < this.quotaStats.serpCallsLimit;
  }

  private recordHit(): void {
    this.stats.totalHits++;
    this.stats.totalRequests++;
    this.updateHitRate();
  }

  private recordMiss(): void {
    this.stats.totalMisses++;
    this.stats.totalRequests++;
    this.updateHitRate();
  }

  private updateHitRate(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.hitRate = this.stats.totalHits / this.stats.totalRequests;
      this.stats.missRate = this.stats.totalMisses / this.stats.totalRequests;
    }
  }

  private generateCacheKey(key: string, source: string): string {
    // Create a hash of the key to ensure consistent filename
    const hash = createHash('md5').update(`${source}:${key}`).digest('hex');
    return `${source}_${hash}`;
  }

  private getCacheFilePath(cacheKey: string): string {
    // Organize cache files into subdirectories by source
    const firstChar = cacheKey.charAt(0);
    return join(this.cachePath, firstChar, `${cacheKey}.json`);
  }

  private cleanupExpiredEntries(): void {
    try {
      let cleanedCount = 0;
      const now = Date.now();

      this.traverseCacheFiles((filePath) => {
        try {
          const fileContent = readFileSync(filePath, 'utf8');
          const cacheEntry = JSON.parse(fileContent);
          
          const expiresAt = cacheEntry.timestamp + (cacheEntry.ttl * 60 * 60 * 1000);
          
          if (now > expiresAt) {
            unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // If file is corrupted, remove it
          unlinkSync(filePath);
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        logger.info(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
      }

    } catch (error) {
      logger.warn('⚠️  Cache cleanup error:', error);
    }
  }

  private calculateCacheStats(): void {
    try {
      let totalSize = 0;
      let totalEntries = 0;

      this.traverseCacheFiles((filePath) => {
        const stats = statSync(filePath);
        totalSize += stats.size;
        totalEntries++;
      });

      this.stats.totalEntries = totalEntries;
      this.stats.cacheSize = totalSize;

    } catch (error) {
      logger.warn('⚠️  Error calculating cache stats:', error);
    }
  }

  private traverseCacheFiles(callback: (filePath: string) => void): void {
    if (!existsSync(this.cachePath)) return;

    const traverseDirectory = (dir: string) => {
      const entries = readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = statSync(fullPath);
        
        if (stats.isDirectory()) {
          traverseDirectory(fullPath);
        } else if (entry.endsWith('.json')) {
          callback(fullPath);
        }
      }
    };

    traverseDirectory(this.cachePath);
  }

  private loadQuotaStats(): void {
    try {
      const quotaFilePath = join(this.cachePath, 'quota-stats.json');
      
      if (existsSync(quotaFilePath)) {
        const quotaData = JSON.parse(readFileSync(quotaFilePath, 'utf8'));
        const today = new Date().toISOString().split('T')[0];
        
        // Reset quota if it's a new day
        if (quotaData.quotaResetDate !== today) {
          logger.info('📅 New day detected, resetting quota counters');
          this.quotaStats.serpCallsUsed = 0;
          this.quotaStats.keywordCallsUsed = 0;
          this.quotaStats.quotaResetDate = today;
        } else {
          // Load previous session's quota usage
          this.quotaStats.serpCallsUsed = quotaData.serpCallsUsed || 0;
          this.quotaStats.keywordCallsUsed = quotaData.keywordCallsUsed || 0;
        }

        this.quotaStats.serpCallsRemaining = this.quotaStats.serpCallsLimit - this.quotaStats.serpCallsUsed;
      }
    } catch (error) {
      logger.debug('No previous quota stats found, starting fresh');
    }
  }

  saveQuotaStats(): void {
    try {
      const quotaFilePath = join(this.cachePath, 'quota-stats.json');
      writeFileSync(quotaFilePath, JSON.stringify(this.quotaStats, null, 2));
    } catch (error) {
      logger.warn('⚠️  Failed to save quota stats:', error);
    }
  }

  getCacheStats(): CacheStats {
    return { ...this.stats };
  }

  getQuotaStats(): QuotaStats {
    return { ...this.quotaStats };
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // Manual cache management methods
  async clearCache(): Promise<void> {
    try {
      this.traverseCacheFiles((filePath) => {
        unlinkSync(filePath);
      });
      
      this.stats = {
        totalEntries: 0,
        hitRate: 0,
        missRate: 0,
        totalHits: 0,
        totalMisses: 0,
        totalRequests: 0,
        expiredEntries: 0,
        cacheSize: 0
      };
      
      logger.info('🧹 Cache cleared successfully');
    } catch (error) {
      logger.error('❌ Failed to clear cache:', error);
    }
  }

  generateCacheReport(): string {
    const stats = this.getCacheStats();
    const quota = this.getQuotaStats();
    
    return `
📊 Cache Performance Report
==========================
Entries: ${stats.totalEntries}
Size: ${this.formatBytes(stats.cacheSize)}
Hit Rate: ${(stats.hitRate * 100).toFixed(1)}% (${stats.totalHits} hits)
Miss Rate: ${(stats.missRate * 100).toFixed(1)}% (${stats.totalMisses} misses)
Expired: ${stats.expiredEntries} entries cleaned up

🎯 Quota Status
===============
SERP Calls: ${quota.serpCallsUsed}/${quota.serpCallsLimit} (${quota.serpCallsRemaining} remaining)
Keyword Calls: ${quota.keywordCallsUsed}
Reset Date: ${quota.quotaResetDate}
`.trim();
  }
}