/**
 * Mock implementation of PerformanceMonitor for testing
 */

import { EventEmitter } from 'events';

export class PerformanceMonitor extends EventEmitter {
  private operationCounts = new Map<string, number>();
  private circuitOpen = false;
  private rateLimitDelay = 0;

  constructor(options?: any) {
    super();
    // Accept any options for compatibility
  }

  async executeWithCircuitBreaker<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: any
  ): Promise<T> {
    if (this.circuitOpen) {
      throw new Error(`Circuit breaker open for ${operationName}`);
    }

    this.operationCounts.set(operationName, (this.operationCounts.get(operationName) || 0) + 1);

    try {
      const result = await operation();
      this.emit('operation:success', { operation: operationName });
      return result;
    } catch (error) {
      this.emit('operation:failure', { operation: operationName, error });
      throw error;
    }
  }

  async enforceRateLimit(resource?: string): Promise<void> {
    if (this.rateLimitDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
    }
  }

  recordMetric(metric: string, value: number, tags?: Record<string, string>): void {
    this.emit('metric:recorded', { metric, value, tags });
  }

  startTimer(operation: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric(`${operation}.duration`, duration);
    };
  }

  // Test helpers
  setCircuitOpen(open: boolean): void {
    this.circuitOpen = open;
  }

  setRateLimitDelay(delay: number): void {
    this.rateLimitDelay = delay;
  }

  getOperationCount(operation: string): number {
    return this.operationCounts.get(operation) || 0;
  }

  reset(): void {
    this.operationCounts.clear();
    this.circuitOpen = false;
    this.rateLimitDelay = 0;
  }
}

// Export singleton for compatibility
export const performanceMonitor = new PerformanceMonitor();