import { PerformanceMonitor } from './performance.js';

/**
 * Performance Wrapper Utility
 * Provides helper functions to easily integrate performance monitoring
 * into existing operations without major refactoring
 */

export class PerformanceWrapper {
  private monitor: PerformanceMonitor;

  constructor(monitor: PerformanceMonitor) {
    this.monitor = monitor;
  }

  /**
   * Wrap a function with performance tracking and circuit breaker protection
   */
  async wrapOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    return this.monitor.executeWithCircuitBreaker(
      operationName,
      operation,
      fallback
    );
  }

  /**
   * Wrap cache operations to automatically track hits/misses
   */
  wrapCacheOperation<T>(
    operation: () => T | null,
    onHit: () => void = () => this.monitor.recordCacheHit(),
    onMiss: () => void = () => this.monitor.recordCacheMiss()
  ): T | null {
    const result = operation();
    
    if (result !== null && result !== undefined) {
      onHit();
    } else {
      onMiss();
    }
    
    return result;
  }

  /**
   * Wrap API calls to automatically track quota usage and errors
   */
  async wrapApiCall<T>(
    apiType: 'serp' | 'keyword',
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await operation();
      
      // Record successful API call
      if (apiType === 'serp') {
        this.monitor.recordSerpCall();
      } else {
        this.monitor.recordKeywordCall();
      }
      
      return result;
    } catch (error) {
      // Record API error
      this.monitor.recordApiError();
      
      if (apiType === 'serp') {
        this.monitor.recordSerpCall();
      } else {
        this.monitor.recordKeywordCall();
      }
      
      throw error;
    }
  }

  /**
   * Track file I/O operations
   */
  async wrapFileOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      if (duration > 5000) { // 5 second threshold
        console.warn(`⚠️ Slow file operation: ${operationName} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ File operation failed: ${operationName}`, error);
      throw error;
    }
  }

  /**
   * Progressive degradation wrapper
   * Attempts operations with increasing fallback strategies
   */
  async progressiveDegradation<T>(
    operationName: string,
    strategies: Array<{
      name: string;
      operation: () => Promise<T>;
      timeoutMs?: number;
    }>
  ): Promise<T> {
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const isLastStrategy = i === strategies.length - 1;
      
      try {
        console.log(`🎯 Attempting ${operationName} with strategy: ${strategy.name}`);
        
        if (strategy.timeoutMs) {
          // Add timeout wrapper
          const result = await Promise.race([
            strategy.operation(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Strategy timeout after ${strategy.timeoutMs}ms`)), strategy.timeoutMs);
            })
          ]);
          return result;
        } else {
          const result = await strategy.operation();
          return result;
        }
        
      } catch (error) {
        console.warn(`⚠️ Strategy '${strategy.name}' failed for ${operationName}:`, error);
        
        if (isLastStrategy) {
          console.error(`❌ All strategies failed for ${operationName}`);
          throw error;
        }
        
        // Continue to next strategy
        continue;
      }
    }
    
    throw new Error(`No strategies available for ${operationName}`);
  }

  /**
   * Batch operation wrapper with performance monitoring
   */
  async wrapBatchOperation<T, R>(
    operationName: string,
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<R[]>,
    maxConcurrency: number = 3
  ): Promise<R[]> {
    const startTime = Date.now();
    const results: R[] = [];
    const batches: T[][] = [];
    
    // Create batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Processing ${operationName}: ${items.length} items in ${batches.length} batches (concurrency: ${maxConcurrency})`);
    
    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += maxConcurrency) {
      const currentBatches = batches.slice(i, i + maxConcurrency);
      
      const batchPromises = currentBatches.map(async (batch, batchIndex) => {
        const actualBatchIndex = i + batchIndex;
        console.log(`  Processing batch ${actualBatchIndex + 1}/${batches.length} (${batch.length} items)`);
        
        try {
          return await processor(batch);
        } catch (error) {
          console.error(`❌ Batch ${actualBatchIndex + 1} failed:`, error);
          return []; // Return empty array for failed batches
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
    }
    
    const duration = Date.now() - startTime;
    const itemsPerSecond = items.length / (duration / 1000);
    
    console.log(`✅ Completed ${operationName}: ${results.length} results in ${duration}ms (${itemsPerSecond.toFixed(1)} items/sec)`);
    
    // Log performance warning if too slow
    if (itemsPerSecond < 1 && items.length > 10) {
      console.warn(`⚠️ Slow batch operation: ${operationName} processed only ${itemsPerSecond.toFixed(2)} items/second`);
    }
    
    return results;
  }

  /**
   * Memory usage tracker wrapper
   */
  async wrapMemoryIntensiveOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    memoryThresholdMB: number = 256
  ): Promise<T> {
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    
    try {
      const result = await operation();
      
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = finalMemory - initialMemory;
      
      if (memoryUsed > memoryThresholdMB) {
        console.warn(`⚠️ High memory usage in ${operationName}: ${memoryUsed.toFixed(1)}MB (threshold: ${memoryThresholdMB}MB)`);
      }
      
      // Force garbage collection if available (--expose-gc flag)
      if (typeof global.gc === 'function' && memoryUsed > memoryThresholdMB * 0.8) {
        console.log(`🗑️  Forcing garbage collection after ${operationName}`);
        global.gc();
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Memory-intensive operation failed: ${operationName}`, error);
      throw error;
    }
  }

  /**
   * URL health check wrapper with performance monitoring
   */
  async performUrlHealthChecks(
    urls: string[],
    timeoutMs: number = 5000,
    maxConcurrency: number = 5
  ): Promise<{
    healthy: string[];
    unhealthy: Array<{ url: string; error: string }>;
    duration: number;
  }> {
    const startTime = Date.now();
    const healthy: string[] = [];
    const unhealthy: Array<{ url: string; error: string }> = [];
    
    console.log(`🔍 Performing health checks on ${urls.length} URLs (timeout: ${timeoutMs}ms, concurrency: ${maxConcurrency})`);
    
    const checkUrl = async (url: string): Promise<void> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'SEO-Ads-Expert-Health-Check/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          healthy.push(url);
        } else {
          unhealthy.push({
            url,
            error: `HTTP ${response.status}: ${response.statusText}`
          });
        }
        
      } catch (error: any) {
        unhealthy.push({
          url,
          error: error.message || 'Unknown error'
        });
      }
    };
    
    // Process URLs with controlled concurrency
    for (let i = 0; i < urls.length; i += maxConcurrency) {
      const batch = urls.slice(i, i + maxConcurrency);
      await Promise.all(batch.map(checkUrl));
      
      // Progress logging
      const completed = Math.min(i + maxConcurrency, urls.length);
      const percentage = Math.round((completed / urls.length) * 100);
      console.log(`  Health check progress: ${completed}/${urls.length} (${percentage}%)`);
    }
    
    const duration = Date.now() - startTime;
    const checksPerSecond = urls.length / (duration / 1000);
    
    console.log(`✅ URL health checks completed: ${healthy.length} healthy, ${unhealthy.length} unhealthy in ${duration}ms (${checksPerSecond.toFixed(1)} checks/sec)`);
    
    // Check performance budget
    if (duration > 30000) { // 30 second budget from task requirements
      console.warn(`⚠️ URL health checks exceeded budget: ${duration}ms > 30000ms`);
    }
    
    return { healthy, unhealthy, duration };
  }
}

// Export utility function to create performance wrapper
export function createPerformanceWrapper(monitor: PerformanceMonitor): PerformanceWrapper {
  return new PerformanceWrapper(monitor);
}