/**
 * v1.4 Memory-Aware Batch Processor
 * Implements Phase 5 from v1.4 implementation plan
 * Provides memory management utilities for processing large datasets
 */

import { logger } from './logger.js';
import { performance } from 'perf_hooks';
import v8 from 'v8';

export interface ProcessorOptions {
  maxMemoryMB?: number;
  batchSize?: number;
  gcThreshold?: number;
  concurrency?: number;
  progressInterval?: number;
}

export interface ProcessorStats {
  totalItems: number;
  processedItems: number;
  failedItems: number;
  memoryUsed: number;
  peakMemory: number;
  processingTime: number;
  averageItemTime: number;
}

/**
 * Memory-Aware Batch Processor
 * Handles large dataset processing with memory pressure detection
 */
export class MemoryAwareProcessor {
  private readonly maxMemoryMB: number;
  private readonly gcThreshold: number;
  private readonly concurrency: number;
  private readonly progressInterval: number;
  private stats: ProcessorStats;
  private startTime: number = 0;
  private lastGcTime: number = 0;
  private memoryCheckInterval?: NodeJS.Timeout;

  constructor(options: ProcessorOptions = {}) {
    this.maxMemoryMB = options.maxMemoryMB || 512;
    this.gcThreshold = options.gcThreshold || 0.8; // Trigger GC at 80% memory usage
    this.concurrency = options.concurrency || 1;
    this.progressInterval = options.progressInterval || 1000;

    this.stats = {
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      memoryUsed: 0,
      peakMemory: 0,
      processingTime: 0,
      averageItemTime: 0
    };
  }

  /**
   * Process items in memory-aware batches
   */
  async processInBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize = 1000
  ): Promise<R[]> {
    this.startTime = performance.now();
    this.stats.totalItems = items.length;
    this.stats.processedItems = 0;
    this.stats.failedItems = 0;

    const results: R[] = [];

    // Start memory monitoring
    this.startMemoryMonitoring();

    try {
      // Process items in batches
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        // Check memory before processing batch
        await this.checkMemoryPressure();

        try {
          const batchResults = await processor(batch);
          results.push(...batchResults);
          this.stats.processedItems += batch.length;

          // Log progress
          this.logProgress(i + batch.length, items.length);

        } catch (error) {
          logger.error(`Batch processing error at index ${i}:`, error);
          this.stats.failedItems += batch.length;

          // Decide whether to continue or abort
          if (this.shouldAbortOnError(error)) {
            throw error;
          }
        }

        // Check memory after processing batch
        await this.checkMemoryPressure();
      }

      return results;

    } finally {
      this.stopMemoryMonitoring();
      this.stats.processingTime = performance.now() - this.startTime;
      this.stats.averageItemTime = this.stats.processingTime / this.stats.processedItems;
      this.logFinalStats();
    }
  }

  /**
   * Process items concurrently with memory awareness
   */
  async processConcurrently<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options?: { batchSize?: number }
  ): Promise<R[]> {
    const batchSize = options?.batchSize || 1000;
    const concurrency = this.concurrency;

    this.startTime = performance.now();
    this.stats.totalItems = items.length;
    this.stats.processedItems = 0;
    this.stats.failedItems = 0;

    const results: R[] = [];

    // Start memory monitoring
    this.startMemoryMonitoring();

    try {
      // Process in concurrent batches
      for (let i = 0; i < items.length; i += batchSize * concurrency) {
        // Check memory before batch
        await this.checkMemoryPressure();

        // Create concurrent processing promises
        const promises: Promise<R[]>[] = [];

        for (let j = 0; j < concurrency && i + j * batchSize < items.length; j++) {
          const start = i + j * batchSize;
          const end = Math.min(start + batchSize, items.length);
          const batch = items.slice(start, end);

          promises.push(this.processBatchAsync(batch, processor));
        }

        // Wait for all concurrent batches
        const batchResults = await Promise.all(promises);
        for (const batchResult of batchResults) {
          results.push(...batchResult);
        }

        // Log progress
        this.logProgress(Math.min(i + batchSize * concurrency, items.length), items.length);
      }

      return results;

    } finally {
      this.stopMemoryMonitoring();
      this.stats.processingTime = performance.now() - this.startTime;
      this.stats.averageItemTime = this.stats.processingTime / this.stats.processedItems;
      this.logFinalStats();
    }
  }

  /**
   * Stream process large datasets
   */
  async *streamProcess<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize = 100
  ): AsyncGenerator<R[], void, unknown> {
    this.startTime = performance.now();
    this.stats.totalItems = items.length;
    this.stats.processedItems = 0;

    // Start memory monitoring
    this.startMemoryMonitoring();

    try {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        // Check memory pressure
        await this.checkMemoryPressure();

        // Process batch
        const results: R[] = [];
        for (const item of batch) {
          try {
            const result = await processor(item);
            results.push(result);
            this.stats.processedItems++;
          } catch (error) {
            logger.error('Item processing error:', error);
            this.stats.failedItems++;
          }
        }

        // Yield batch results
        yield results;

        // Log progress
        this.logProgress(i + batch.length, items.length);
      }
    } finally {
      this.stopMemoryMonitoring();
      this.stats.processingTime = performance.now() - this.startTime;
      this.logFinalStats();
    }
  }

  /**
   * Process a batch asynchronously
   */
  private async processBatchAsync<T, R>(
    batch: T[],
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];

    for (const item of batch) {
      try {
        const result = await processor(item);
        results.push(result);
        this.stats.processedItems++;
      } catch (error) {
        logger.error('Item processing error:', error);
        this.stats.failedItems++;
      }
    }

    return results;
  }

  /**
   * Check memory pressure and trigger GC if needed
   */
  private async checkMemoryPressure(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

    this.stats.memoryUsed = heapUsedMB;
    this.stats.peakMemory = Math.max(this.stats.peakMemory, heapUsedMB);

    // Check if we're approaching memory limit
    if (heapUsedMB > this.maxMemoryMB * this.gcThreshold) {
      logger.warn(`Memory pressure detected: ${heapUsedMB.toFixed(2)}MB / ${this.maxMemoryMB}MB`);

      // Force garbage collection if available
      if (global.gc && Date.now() - this.lastGcTime > 1000) {
        logger.debug('Forcing garbage collection');
        global.gc();
        this.lastGcTime = Date.now();

        // Wait for GC to complete
        await new Promise(resolve => setImmediate(resolve));

        // Check memory again
        const newHeapUsed = process.memoryUsage().heapUsed / 1024 / 1024;
        logger.debug(`Memory after GC: ${newHeapUsed.toFixed(2)}MB`);
      }

      // If still high, pause processing
      if (heapUsedMB > this.maxMemoryMB) {
        logger.error(`Memory limit exceeded: ${heapUsedMB.toFixed(2)}MB > ${this.maxMemoryMB}MB`);
        throw new Error('Memory limit exceeded');
      }
    }
  }

  /**
   * Start monitoring memory usage
   */
  private startMemoryMonitoring(): void {
    // Monitor memory every second
    this.memoryCheckInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

      if (heapUsedMB > this.maxMemoryMB * 0.9) {
        logger.warn(`Critical memory usage: ${heapUsedMB.toFixed(2)}MB / ${this.maxMemoryMB}MB`);
      }
    }, 1000);
  }

  /**
   * Stop monitoring memory usage
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = undefined;
    }
  }

  /**
   * Log processing progress
   */
  private logProgress(current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    const elapsed = performance.now() - this.startTime;
    const rate = current / (elapsed / 1000);
    const eta = (total - current) / rate;

    if (current % this.progressInterval === 0 || current === total) {
      logger.info(`Processing progress: ${current}/${total} (${percentage}%)`, {
        rate: `${rate.toFixed(0)} items/sec`,
        eta: `${eta.toFixed(0)}s`,
        memory: `${this.stats.memoryUsed.toFixed(0)}MB`
      });
    }
  }

  /**
   * Log final processing statistics
   */
  private logFinalStats(): void {
    logger.info('Processing completed', {
      totalItems: this.stats.totalItems,
      processedItems: this.stats.processedItems,
      failedItems: this.stats.failedItems,
      processingTime: `${(this.stats.processingTime / 1000).toFixed(2)}s`,
      averageItemTime: `${this.stats.averageItemTime.toFixed(2)}ms`,
      peakMemory: `${this.stats.peakMemory.toFixed(2)}MB`
    });
  }

  /**
   * Determine if processing should abort on error
   */
  private shouldAbortOnError(error: any): boolean {
    // Abort on critical errors
    const criticalErrors = [
      'ENOMEM',
      'ENOSPC',
      'Memory limit exceeded',
      'Database connection lost'
    ];

    const errorMessage = error.message || error.toString();
    return criticalErrors.some(critical => errorMessage.includes(critical));
  }

  /**
   * Get current processing statistics
   */
  getStats(): ProcessorStats {
    return { ...this.stats };
  }

  /**
   * Get memory heap snapshot (for debugging)
   */
  getHeapSnapshot(): string {
    const snapshot = v8.writeHeapSnapshot();
    return snapshot || '';
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  } {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss / 1024 / 1024,
      heapTotal: usage.heapTotal / 1024 / 1024,
      heapUsed: usage.heapUsed / 1024 / 1024,
      external: usage.external / 1024 / 1024,
      arrayBuffers: usage.arrayBuffers / 1024 / 1024
    };
  }

  /**
   * Clean up large objects from memory
   */
  static cleanupMemory<T extends { [key: string]: any }>(obj: T): void {
    // Clear large arrays and objects
    for (const key in obj) {
      if (Array.isArray(obj[key]) && obj[key].length > 1000) {
        obj[key] = [];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        const size = JSON.stringify(obj[key]).length;
        if (size > 1000000) {
          // Clear large objects (>1MB when serialized)
          obj[key] = null;
        }
      }
    }

    // Suggest garbage collection
    if (global.gc) {
      global.gc();
    }
  }
}

// Export singleton instance with default configuration
export const defaultProcessor = new MemoryAwareProcessor({
  maxMemoryMB: 512,
  batchSize: 1000,
  gcThreshold: 0.8,
  concurrency: 4,
  progressInterval: 1000
});

// Export utility function for simple batch processing
export async function processBatchWithMemoryCheck<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  options?: ProcessorOptions
): Promise<R[]> {
  const memProcessor = new MemoryAwareProcessor(options);
  return memProcessor.processInBatches(items, processor, options?.batchSize);
}