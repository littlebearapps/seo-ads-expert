import { z } from 'zod';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Performance Budget Schema
export const PerformanceBudgetSchema = z.object({
  cold_run_max_ms: z.number().default(120000), // 2 minutes
  warm_run_max_ms: z.number().default(60000),  // 1 minute
  url_health_check_max_ms: z.number().default(30000), // 30 seconds for 50 URLs
  api_call_timeout_ms: z.number().default(10000), // 10 seconds per API call
  memory_usage_max_mb: z.number().default(512), // 512MB memory limit
  cache_hit_rate_min: z.number().default(0.5), // 50% cache hit rate minimum
  error_rate_max: z.number().default(0.05) // 5% error rate maximum
});

export const PerformanceMetricsSchema = z.object({
  timestamp: z.string(),
  session_id: z.string(),
  runtime: z.object({
    total_ms: z.number(),
    cold_start: z.boolean(),
    by_phase: z.object({
      data_collection: z.number(),
      analysis: z.number(),
      generation: z.number(),
      export: z.number()
    }),
    memory_peak_mb: z.number(),
    cpu_usage_percent: z.number().optional()
  }),
  cache: z.object({
    hit_rate: z.number(),
    saves: z.number(),
    api_calls_saved: z.number(),
    total_requests: z.number(),
    cache_size_mb: z.number()
  }),
  quotas: z.object({
    serp_calls: z.object({
      used: z.number(),
      limit: z.number(),
      remaining: z.number()
    }),
    keyword_calls: z.object({
      used: z.number(),
      limit: z.number(),
      remaining: z.number()
    }),
    api_errors: z.number()
  }),
  performance_score: z.number().min(0).max(100),
  alerts: z.array(z.object({
    level: z.enum(['warning', 'error', 'critical']),
    message: z.string(),
    metric: z.string(),
    actual_value: z.number(),
    budget_value: z.number()
  })),
  recommendations: z.array(z.string())
});

export const CircuitBreakerSchema = z.object({
  name: z.string(),
  state: z.enum(['closed', 'open', 'half_open']),
  failure_count: z.number(),
  failure_threshold: z.number(),
  timeout_ms: z.number(),
  last_failure_time: z.string().optional(),
  last_success_time: z.string().optional(),
  total_calls: z.number(),
  successful_calls: z.number()
});

export type PerformanceBudget = z.infer<typeof PerformanceBudgetSchema>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;
export type CircuitBreakerState = z.infer<typeof CircuitBreakerSchema>;

export interface PerformanceMonitorConfig {
  budget: PerformanceBudget;
  metricsOutputPath: string;
  enableAlerts: boolean;
  alertWebhookUrl?: string;
  enableRecommendations: boolean;
  circuitBreakerConfig: {
    failureThreshold: number;
    timeoutMs: number;
    resetTimeoutMs: number;
  };
}

export class PerformanceMonitor {
  private config: PerformanceMonitorConfig;
  private sessionId: string;
  private startTime: number;
  private phaseTimings: Map<string, { start: number; end?: number }>;
  private cacheStats: { hits: number; misses: number; saves: number };
  private quotaUsage: { serpCalls: number; keywordCalls: number; apiErrors: number };
  private circuitBreakers: Map<string, CircuitBreakerState>;
  private memoryUsage: { initial: number; peak: number };
  private alerts: Array<{ level: 'warning' | 'error' | 'critical'; message: string; metric: string; actual_value: number; budget_value: number }>;
  private isColdStart: boolean;

  constructor(config: Partial<PerformanceMonitorConfig> = {}) {
    this.config = {
      budget: PerformanceBudgetSchema.parse(config.budget || {}),
      metricsOutputPath: config.metricsOutputPath || 'cache/performance-metrics.json',
      enableAlerts: config.enableAlerts ?? true,
      alertWebhookUrl: config.alertWebhookUrl,
      enableRecommendations: config.enableRecommendations ?? true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        timeoutMs: 30000,
        resetTimeoutMs: 60000,
        ...config.circuitBreakerConfig
      }
    };

    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.phaseTimings = new Map();
    this.cacheStats = { hits: 0, misses: 0, saves: 0 };
    this.quotaUsage = { serpCalls: 0, keywordCalls: 0, apiErrors: 0 };
    this.circuitBreakers = new Map();
    this.memoryUsage = { 
      initial: this.getMemoryUsageMB(),
      peak: this.getMemoryUsageMB()
    };
    this.alerts = [];
    this.isColdStart = this.determineColdStart();

    console.log(`🏁 Performance Monitor initialized (Session: ${this.sessionId.substring(0, 8)}, Cold Start: ${this.isColdStart})`);
  }

  /**
   * Start timing a specific phase of execution
   */
  startPhase(phaseName: string): void {
    const now = Date.now();
    this.phaseTimings.set(phaseName, { start: now });
    
    // Check memory usage
    const currentMemory = this.getMemoryUsageMB();
    if (currentMemory > this.memoryUsage.peak) {
      this.memoryUsage.peak = currentMemory;
    }
    
    console.log(`⏱️  Phase started: ${phaseName}`);
  }

  /**
   * End timing a specific phase and check budgets
   */
  endPhase(phaseName: string): number {
    const now = Date.now();
    const phaseData = this.phaseTimings.get(phaseName);
    
    if (!phaseData) {
      console.warn(`⚠️ Phase '${phaseName}' was not started`);
      return 0;
    }

    phaseData.end = now;
    const duration = now - phaseData.start;
    
    // Check phase-specific budgets
    this.checkPhaseBudget(phaseName, duration);
    
    console.log(`✅ Phase completed: ${phaseName} (${duration}ms)`);
    return duration;
  }

  /**
   * Record cache hit/miss statistics
   */
  recordCacheHit(): void {
    this.cacheStats.hits++;
  }

  recordCacheMiss(): void {
    this.cacheStats.misses++;
  }

  recordCacheSave(): void {
    this.cacheStats.saves++;
  }

  /**
   * Record API quota usage
   */
  recordSerpCall(): void {
    this.quotaUsage.serpCalls++;
  }

  recordKeywordCall(): void {
    this.quotaUsage.keywordCalls++;
  }

  recordApiError(): void {
    this.quotaUsage.apiErrors++;
  }

  /**
   * Circuit breaker pattern implementation
   */
  async executeWithCircuitBreaker<T>(
    operationName: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const breaker = this.getOrCreateCircuitBreaker(operationName);
    
    // Check if circuit is open
    if (breaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - (breaker.last_failure_time ? new Date(breaker.last_failure_time).getTime() : 0);
      
      if (timeSinceLastFailure < this.config.circuitBreakerConfig.resetTimeoutMs) {
        // Circuit still open, use fallback or throw error
        if (fallback) {
          console.log(`🔴 Circuit breaker OPEN for ${operationName}, using fallback`);
          return await fallback();
        } else {
          throw new Error(`Circuit breaker is OPEN for ${operationName}`);
        }
      } else {
        // Try to reset circuit breaker to half-open
        breaker.state = 'half_open';
        console.log(`🟡 Circuit breaker half-open for ${operationName}`);
      }
    }

    breaker.total_calls++;

    try {
      const startTime = Date.now();
      
      // Add timeout wrapper
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Operation timeout after ${breaker.timeout_ms}ms`)), breaker.timeout_ms);
        })
      ]);

      const duration = Date.now() - startTime;
      
      // Success - reset failure count and update state
      breaker.successful_calls++;
      breaker.failure_count = 0;
      breaker.state = 'closed';
      breaker.last_success_time = new Date().toISOString();
      
      console.log(`🟢 Circuit breaker success for ${operationName} (${duration}ms)`);
      return result;

    } catch (error) {
      // Failure - increment failure count
      breaker.failure_count++;
      breaker.last_failure_time = new Date().toISOString();
      
      // Open circuit if threshold reached
      if (breaker.failure_count >= breaker.failure_threshold) {
        breaker.state = 'open';
        console.log(`🔴 Circuit breaker OPENED for ${operationName} (${breaker.failure_count} failures)`);
      }

      // Try fallback or re-throw error
      if (fallback && breaker.state === 'open') {
        console.log(`🔴 Using fallback for ${operationName}`);
        return await fallback();
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate comprehensive performance metrics
   */
  generateMetrics(): PerformanceMetrics {
    const now = Date.now();
    const totalRuntime = now - this.startTime;
    
    // Calculate phase timings
    const phaseTimings = this.calculatePhaseTimings();
    
    // Calculate cache statistics
    const totalCacheRequests = this.cacheStats.hits + this.cacheStats.misses;
    const cacheHitRate = totalCacheRequests > 0 ? this.cacheStats.hits / totalCacheRequests : 0;
    
    // Calculate performance score (0-100)
    const performanceScore = this.calculatePerformanceScore(totalRuntime, cacheHitRate);
    
    // Generate alerts
    this.generatePerformanceAlerts(totalRuntime, cacheHitRate);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(totalRuntime, cacheHitRate);
    
    const metrics: PerformanceMetrics = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      runtime: {
        total_ms: totalRuntime,
        cold_start: this.isColdStart,
        by_phase: phaseTimings,
        memory_peak_mb: this.memoryUsage.peak
      },
      cache: {
        hit_rate: cacheHitRate,
        saves: this.cacheStats.saves,
        api_calls_saved: this.cacheStats.hits,
        total_requests: totalCacheRequests,
        cache_size_mb: this.estimateCacheSize()
      },
      quotas: {
        serp_calls: {
          used: this.quotaUsage.serpCalls,
          limit: 30, // From free tier
          remaining: Math.max(0, 30 - this.quotaUsage.serpCalls)
        },
        keyword_calls: {
          used: this.quotaUsage.keywordCalls,
          limit: 20, // From free tier
          remaining: Math.max(0, 20 - this.quotaUsage.keywordCalls)
        },
        api_errors: this.quotaUsage.apiErrors
      },
      performance_score: performanceScore,
      alerts: this.alerts,
      recommendations
    };

    return PerformanceMetricsSchema.parse(metrics);
  }

  /**
   * Save metrics to file and optionally send alerts
   */
  async saveMetrics(): Promise<void> {
    const metrics = this.generateMetrics();
    
    // Save to file
    try {
      writeFileSync(this.config.metricsOutputPath, JSON.stringify(metrics, null, 2));
      console.log(`📊 Performance metrics saved to: ${this.config.metricsOutputPath}`);
    } catch (error) {
      console.error('❌ Failed to save performance metrics:', error);
    }

    // Send alerts if enabled
    if (this.config.enableAlerts && this.alerts.length > 0) {
      await this.sendAlerts(metrics);
    }

    // Log summary
    this.logPerformanceSummary(metrics);
  }

  /**
   * Check if current run exceeds performance budgets
   */
  checkBudgets(): { passed: boolean; violations: string[] } {
    const metrics = this.generateMetrics();
    const violations: string[] = [];

    // Check runtime budgets
    const runtimeLimit = this.isColdStart ? 
      this.config.budget.cold_run_max_ms : 
      this.config.budget.warm_run_max_ms;

    if (metrics.runtime.total_ms > runtimeLimit) {
      violations.push(`Runtime exceeded: ${metrics.runtime.total_ms}ms > ${runtimeLimit}ms`);
    }

    // Check memory budget
    if (metrics.runtime.memory_peak_mb > this.config.budget.memory_usage_max_mb) {
      violations.push(`Memory exceeded: ${metrics.runtime.memory_peak_mb}MB > ${this.config.budget.memory_usage_max_mb}MB`);
    }

    // Check cache hit rate
    if (metrics.cache.hit_rate < this.config.budget.cache_hit_rate_min) {
      violations.push(`Cache hit rate too low: ${(metrics.cache.hit_rate * 100).toFixed(1)}% < ${(this.config.budget.cache_hit_rate_min * 100).toFixed(1)}%`);
    }

    // Check error rate
    const errorRate = metrics.quotas.api_errors / (metrics.quotas.serp_calls.used + metrics.quotas.keyword_calls.used || 1);
    if (errorRate > this.config.budget.error_rate_max) {
      violations.push(`Error rate too high: ${(errorRate * 100).toFixed(1)}% > ${(this.config.budget.error_rate_max * 100).toFixed(1)}%`);
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }

  // Private helper methods

  private generateSessionId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private getMemoryUsageMB(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
  }

  private determineColdStart(): boolean {
    // Check if metrics file exists to determine if this is a cold start
    return !existsSync(this.config.metricsOutputPath);
  }

  private checkPhaseBudget(phaseName: string, duration: number): void {
    // Phase-specific budget checks
    const phaseBudgets: Record<string, number> = {
      'data_collection': 30000, // 30 seconds
      'analysis': 60000,       // 60 seconds  
      'generation': 45000,     // 45 seconds
      'export': 10000          // 10 seconds
    };

    const budget = phaseBudgets[phaseName];
    if (budget && duration > budget) {
      this.alerts.push({
        level: 'warning',
        message: `Phase '${phaseName}' exceeded budget`,
        metric: `phase_${phaseName}_ms`,
        actual_value: duration,
        budget_value: budget
      });
    }
  }

  private calculatePhaseTimings(): { data_collection: number; analysis: number; generation: number; export: number } {
    const defaultTimings = { data_collection: 0, analysis: 0, generation: 0, export: 0 };
    
    for (const [phaseName, timing] of this.phaseTimings.entries()) {
      if (timing.end && phaseName in defaultTimings) {
        (defaultTimings as any)[phaseName] = timing.end - timing.start;
      }
    }
    
    return defaultTimings;
  }

  private calculatePerformanceScore(totalRuntime: number, cacheHitRate: number): number {
    let score = 100;
    
    // Runtime penalty (0-40 points)
    const runtimeBudget = this.isColdStart ? this.config.budget.cold_run_max_ms : this.config.budget.warm_run_max_ms;
    const runtimeRatio = totalRuntime / runtimeBudget;
    if (runtimeRatio > 1) {
      score -= Math.min(40, (runtimeRatio - 1) * 100);
    }
    
    // Memory penalty (0-20 points)
    const memoryRatio = this.memoryUsage.peak / this.config.budget.memory_usage_max_mb;
    if (memoryRatio > 1) {
      score -= Math.min(20, (memoryRatio - 1) * 50);
    }
    
    // Cache hit rate bonus/penalty (0-20 points)
    const cacheBonus = Math.max(-20, Math.min(20, (cacheHitRate - 0.5) * 40));
    score += cacheBonus;
    
    // Error rate penalty (0-20 points)
    const totalAPICalls = this.quotaUsage.serpCalls + this.quotaUsage.keywordCalls;
    if (totalAPICalls > 0) {
      const errorRate = this.quotaUsage.apiErrors / totalAPICalls;
      score -= Math.min(20, errorRate * 100);
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generatePerformanceAlerts(totalRuntime: number, cacheHitRate: number): void {
    const runtimeBudget = this.isColdStart ? this.config.budget.cold_run_max_ms : this.config.budget.warm_run_max_ms;
    
    // Critical alerts
    if (totalRuntime > runtimeBudget * 1.5) {
      this.alerts.push({
        level: 'critical',
        message: 'Runtime severely exceeded budget',
        metric: 'total_runtime_ms',
        actual_value: totalRuntime,
        budget_value: runtimeBudget
      });
    }
    
    // Warning alerts  
    if (totalRuntime > runtimeBudget) {
      this.alerts.push({
        level: 'warning',
        message: 'Runtime exceeded budget',
        metric: 'total_runtime_ms',
        actual_value: totalRuntime,
        budget_value: runtimeBudget
      });
    }
    
    if (cacheHitRate < this.config.budget.cache_hit_rate_min) {
      this.alerts.push({
        level: 'warning',
        message: 'Cache hit rate below minimum',
        metric: 'cache_hit_rate',
        actual_value: cacheHitRate,
        budget_value: this.config.budget.cache_hit_rate_min
      });
    }
  }

  private generateRecommendations(totalRuntime: number, cacheHitRate: number): string[] {
    const recommendations: string[] = [];
    
    if (totalRuntime > this.config.budget.warm_run_max_ms) {
      recommendations.push('Consider optimizing slow operations or adding more caching');
    }
    
    if (cacheHitRate < 0.6) {
      recommendations.push('Improve cache hit rate by adjusting cache TTL or cache keys');
    }
    
    if (this.memoryUsage.peak > this.config.budget.memory_usage_max_mb * 0.8) {
      recommendations.push('Monitor memory usage - consider streaming large datasets');
    }
    
    if (this.quotaUsage.apiErrors > 0) {
      recommendations.push('Investigate API errors and implement better error handling');
    }
    
    if (this.quotaUsage.serpCalls > 20) {
      recommendations.push('SERP call usage is high - consider increasing cache TTL');
    }
    
    return recommendations;
  }

  private getOrCreateCircuitBreaker(operationName: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(operationName)) {
      this.circuitBreakers.set(operationName, {
        name: operationName,
        state: 'closed',
        failure_count: 0,
        failure_threshold: this.config.circuitBreakerConfig.failureThreshold,
        timeout_ms: this.config.circuitBreakerConfig.timeoutMs,
        total_calls: 0,
        successful_calls: 0
      });
    }
    return this.circuitBreakers.get(operationName)!;
  }

  private estimateCacheSize(): number {
    // Estimate cache size based on file system (simplified)
    try {
      if (existsSync('cache/')) {
        // This is a simplified estimate
        return 50; // MB estimate
      }
    } catch (error) {
      // Ignore errors
    }
    return 0;
  }

  private async sendAlerts(metrics: PerformanceMetrics): Promise<void> {
    if (!this.config.alertWebhookUrl) {
      console.log('⚠️ Alerts generated but no webhook URL configured');
      return;
    }

    try {
      // This would send to a webhook in a real implementation
      console.log(`🚨 Would send ${metrics.alerts.length} alerts to webhook`);
    } catch (error) {
      console.error('❌ Failed to send alerts:', error);
    }
  }

  private logPerformanceSummary(metrics: PerformanceMetrics): void {
    console.log('\n📊 Performance Summary');
    console.log('=====================');
    console.log(`Session: ${metrics.session_id.substring(0, 8)}`);
    console.log(`Total Runtime: ${metrics.runtime.total_ms}ms (${this.isColdStart ? 'Cold' : 'Warm'} start)`);
    console.log(`Performance Score: ${metrics.performance_score}/100`);
    console.log(`Memory Peak: ${metrics.runtime.memory_peak_mb}MB`);
    console.log(`Cache Hit Rate: ${(metrics.cache.hit_rate * 100).toFixed(1)}%`);
    console.log(`API Calls: ${metrics.quotas.serp_calls.used + metrics.quotas.keyword_calls.used} (${metrics.quotas.api_errors} errors)`);
    
    if (metrics.alerts.length > 0) {
      console.log(`\n⚠️ Alerts: ${metrics.alerts.length}`);
      for (const alert of metrics.alerts) {
        console.log(`  ${alert.level.toUpperCase()}: ${alert.message}`);
      }
    }
    
    if (metrics.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      for (const rec of metrics.recommendations) {
        console.log(`  • ${rec}`);
      }
    }
    
    console.log(''); // Empty line for spacing
  }
}

// Export utility functions for external monitoring
export const PerformanceUtils = {
  /**
   * Parse performance metrics from file
   */
  loadMetricsFromFile(filePath: string): PerformanceMetrics | null {
    try {
      const data = readFileSync(filePath, 'utf8');
      return PerformanceMetricsSchema.parse(JSON.parse(data));
    } catch (error) {
      return null;
    }
  },

  /**
   * Compare metrics against budgets
   */
  validateAgainstBudgets(metrics: PerformanceMetrics, budget: PerformanceBudget): {
    passed: boolean;
    violations: Array<{ metric: string; actual: number; budget: number; severity: 'warning' | 'error' }>;
  } {
    const violations: Array<{ metric: string; actual: number; budget: number; severity: 'warning' | 'error' }> = [];

    // Runtime check
    const runtimeBudget = metrics.runtime.cold_start ? budget.cold_run_max_ms : budget.warm_run_max_ms;
    if (metrics.runtime.total_ms > runtimeBudget) {
      violations.push({
        metric: 'runtime',
        actual: metrics.runtime.total_ms,
        budget: runtimeBudget,
        severity: metrics.runtime.total_ms > runtimeBudget * 1.5 ? 'error' : 'warning'
      });
    }

    // Memory check
    if (metrics.runtime.memory_peak_mb > budget.memory_usage_max_mb) {
      violations.push({
        metric: 'memory',
        actual: metrics.runtime.memory_peak_mb,
        budget: budget.memory_usage_max_mb,
        severity: metrics.runtime.memory_peak_mb > budget.memory_usage_max_mb * 1.5 ? 'error' : 'warning'
      });
    }

    // Cache hit rate check
    if (metrics.cache.hit_rate < budget.cache_hit_rate_min) {
      violations.push({
        metric: 'cache_hit_rate',
        actual: metrics.cache.hit_rate,
        budget: budget.cache_hit_rate_min,
        severity: 'warning'
      });
    }

    return {
      passed: violations.length === 0,
      violations
    };
  },

  /**
   * Generate performance report
   */
  generateReport(metrics: PerformanceMetrics): string {
    return `# Performance Report

## Session: ${metrics.session_id}
**Generated**: ${metrics.timestamp}
**Performance Score**: ${metrics.performance_score}/100

## Runtime Performance
- **Total Runtime**: ${metrics.runtime.total_ms}ms (${metrics.runtime.cold_start ? 'Cold' : 'Warm'} start)
- **Memory Peak**: ${metrics.runtime.memory_peak_mb}MB
- **Data Collection**: ${metrics.runtime.by_phase.data_collection}ms
- **Analysis**: ${metrics.runtime.by_phase.analysis}ms  
- **Generation**: ${metrics.runtime.by_phase.generation}ms
- **Export**: ${metrics.runtime.by_phase.export}ms

## Cache Performance
- **Hit Rate**: ${(metrics.cache.hit_rate * 100).toFixed(1)}%
- **API Calls Saved**: ${metrics.cache.api_calls_saved}
- **Cache Size**: ${metrics.cache.cache_size_mb}MB

## API Quota Usage
- **SERP Calls**: ${metrics.quotas.serp_calls.used}/${metrics.quotas.serp_calls.limit} (${metrics.quotas.serp_calls.remaining} remaining)
- **Keyword Calls**: ${metrics.quotas.keyword_calls.used}/${metrics.quotas.keyword_calls.limit} (${metrics.quotas.keyword_calls.remaining} remaining)
- **API Errors**: ${metrics.quotas.api_errors}

${metrics.alerts.length > 0 ? `## Alerts
${metrics.alerts.map(alert => `- **${alert.level.toUpperCase()}**: ${alert.message} (${alert.actual_value} vs ${alert.budget_value})`).join('\n')}` : ''}

${metrics.recommendations.length > 0 ? `## Recommendations
${metrics.recommendations.map(rec => `- ${rec}`).join('\n')}` : ''}
`;
  }
};