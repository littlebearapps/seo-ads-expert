# Performance & Scalability Recommendations

## Memory Management Improvements

### Problem Analysis
During testing, we discovered memory exhaustion issues when processing large mutation batches (>200 items with large payloads). The system ran out of heap memory when attempting to process 1000 mutations with large descriptions.

### Root Causes
1. **Unbounded mutation history**: MutationGuard stores all mutations in memory without limits
2. **Large object retention**: Full mutation objects kept in memory including large text fields
3. **No pagination for batch operations**: All mutations processed simultaneously
4. **Audit log accumulation**: Audit entries kept in memory during processing

### Recommended Solutions

#### 1. Implement Streaming & Pagination
```typescript
// src/monitors/mutation-guard.ts
class MutationGuard {
  private readonly MAX_HISTORY_SIZE = 100;
  private readonly BATCH_SIZE = 50;
  
  async validateMutationBatch(mutations: Mutation[]): Promise<GuardrailResult[]> {
    const results: GuardrailResult[] = [];
    
    // Process in chunks
    for (let i = 0; i < mutations.length; i += this.BATCH_SIZE) {
      const batch = mutations.slice(i, i + this.BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(m => this.validateMutation(m))
      );
      results.push(...batchResults);
      
      // Allow garbage collection between batches
      if (global.gc) global.gc();
    }
    
    return results;
  }
  
  private maintainHistoryLimit(): void {
    if (this.mutationHistory.length > this.MAX_HISTORY_SIZE) {
      // Keep only recent history
      this.mutationHistory = this.mutationHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }
}
```

#### 2. Implement Object Pooling
```typescript
// src/utils/object-pool.ts
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  
  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }
  
  acquire(): T {
    return this.pool.pop() || this.factory();
  }
  
  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }
}

// Usage in mutation processing
const mutationPool = new ObjectPool(
  () => ({ type: '', resource: '', changes: {} }),
  (m) => { m.type = ''; m.resource = ''; m.changes = {}; }
);
```

#### 3. Implement Lazy Loading & Weak References
```typescript
// src/monitors/audit-logger.ts
export class AuditLogger {
  private recentLogs = new Map<string, WeakRef<AuditLogEntry>>();
  private readonly CACHE_SIZE = 50;
  
  async getAuditLogs(params: any): Promise<AuditLogEntry[]> {
    // Use streaming for large date ranges
    const stream = this.createAuditLogStream(params);
    const logs: AuditLogEntry[] = [];
    
    for await (const entry of stream) {
      logs.push(entry);
      
      // Yield control periodically
      if (logs.length % 100 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return logs;
  }
  
  private async *createAuditLogStream(params: any): AsyncGenerator<AuditLogEntry> {
    // Stream logs from files instead of loading all at once
    const files = this.getLogFilesInRange(params.start, params.end);
    
    for (const file of files) {
      const stream = createReadStream(join(this.auditPath, file));
      const rl = readline.createInterface({ input: stream });
      
      for await (const line of rl) {
        if (line.trim()) {
          yield JSON.parse(line);
        }
      }
    }
  }
}
```

#### 4. Memory Monitoring & Circuit Breaking
```typescript
// src/monitors/memory-monitor.ts
export class MemoryMonitor {
  private readonly MEMORY_THRESHOLD = 0.85; // 85% of heap
  
  checkMemoryPressure(): boolean {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed / usage.heapTotal;
    
    if (heapUsed > this.MEMORY_THRESHOLD) {
      logger.warn('High memory pressure detected', {
        heapUsed: `${(heapUsed * 100).toFixed(2)}%`,
        rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`
      });
      return true;
    }
    
    return false;
  }
  
  async waitForMemory(): Promise<void> {
    while (this.checkMemoryPressure()) {
      // Force garbage collection if available
      if (global.gc) global.gc();
      
      // Wait for memory to free up
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
```

## Rate Limiting for API Calls

### Problem Analysis
The system needs to respect API quotas and prevent overwhelming external services, especially for free tier APIs like RapidAPI.

### Recommended Implementation

#### 1. Token Bucket Rate Limiter
```typescript
// src/utils/rate-limiter.ts
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }
  
  async acquire(tokens = 1): Promise<void> {
    await this.refillTokens();
    
    while (this.tokens < tokens) {
      // Wait for tokens to be available
      const waitTime = Math.ceil((tokens - this.tokens) / this.refillRate * 1000);
      await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
      await this.refillTokens();
    }
    
    this.tokens -= tokens;
  }
  
  private async refillTokens(): Promise<void> {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }
}
```

#### 2. API-Specific Rate Limiters
```typescript
// src/connectors/rate-limited-client.ts
export class RateLimitedApiClient {
  private limiters: Map<string, TokenBucketRateLimiter>;
  
  constructor() {
    this.limiters = new Map([
      // Google APIs: 10 requests per second
      ['google', new TokenBucketRateLimiter(10, 10)],
      
      // RapidAPI SERP: 100 per month = ~0.04 per hour
      ['rapid-serp', new TokenBucketRateLimiter(3, 0.04)],
      
      // RapidAPI Keywords: 20 per month = ~0.03 per hour  
      ['rapid-keywords', new TokenBucketRateLimiter(2, 0.03)]
    ]);
  }
  
  async makeRequest(api: string, request: () => Promise<any>): Promise<any> {
    const limiter = this.limiters.get(api);
    if (!limiter) {
      throw new Error(`No rate limiter configured for API: ${api}`);
    }
    
    await limiter.acquire();
    
    try {
      return await request();
    } catch (error) {
      // Handle 429 Too Many Requests
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 60;
        logger.warn(`Rate limited by ${api}, waiting ${retryAfter}s`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return this.makeRequest(api, request);
      }
      throw error;
    }
  }
}
```

#### 3. Sliding Window Rate Limiter
```typescript
// src/utils/sliding-window-limiter.ts
export class SlidingWindowRateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  
  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  async acquire(): Promise<void> {
    this.cleanup();
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (Date.now() - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.acquire();
      }
    }
    
    this.requests.push(Date.now());
  }
  
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(time => time > cutoff);
  }
  
  getUsage(): { current: number; max: number; resetIn: number } {
    this.cleanup();
    
    const resetIn = this.requests.length > 0
      ? this.windowMs - (Date.now() - this.requests[0])
      : 0;
    
    return {
      current: this.requests.length,
      max: this.maxRequests,
      resetIn: Math.max(0, resetIn)
    };
  }
}
```

#### 4. Distributed Rate Limiting with Redis
```typescript
// src/utils/redis-rate-limiter.ts
import Redis from 'ioredis';

export class RedisRateLimiter {
  private redis: Redis;
  
  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || 'redis://localhost:6379');
  }
  
  async acquire(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const redisKey = `rate_limit:${key}:${window}`;
    
    const pipeline = this.redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, Math.ceil(windowMs / 1000));
    
    const results = await pipeline.exec();
    const count = results[0][1] as number;
    
    return count <= limit;
  }
  
  async reset(key: string): Promise<void> {
    const pattern = `rate_limit:${key}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## Implementation Priority

### Phase 1: Critical (Immediate)
1. Implement batch processing with pagination
2. Add memory monitoring and circuit breaking
3. Limit mutation history size

### Phase 2: Important (Next Sprint)
1. Implement token bucket rate limiter
2. Add API-specific rate limits
3. Implement object pooling for frequently created objects

### Phase 3: Nice to Have (Future)
1. Add Redis-based distributed rate limiting
2. Implement weak references for cache
3. Add comprehensive memory profiling

## Configuration Example

```typescript
// src/config/performance.ts
export const PERFORMANCE_CONFIG = {
  memory: {
    maxHeapUsage: 0.85,        // 85% of available heap
    historyLimit: 100,          // Max mutations to keep in history
    batchSize: 50,              // Process mutations in batches
    gcInterval: 1000            // Force GC every N operations
  },
  rateLimits: {
    google: {
      requests: 10,
      window: 1000              // 10 requests per second
    },
    rapidSerp: {
      requests: 100,
      window: 30 * 24 * 60 * 60 * 1000  // 100 per month
    },
    rapidKeywords: {
      requests: 20,
      window: 30 * 24 * 60 * 60 * 1000  // 20 per month
    }
  },
  cache: {
    maxSize: 100,               // Max cache entries
    ttl: 7 * 24 * 60 * 60 * 1000,  // 7 days
    checkPeriod: 60 * 60 * 1000    // Clean every hour
  }
};
```

## Monitoring & Alerts

```typescript
// src/monitors/system-health.ts
export class SystemHealthMonitor {
  async checkHealth(): Promise<HealthStatus> {
    const memory = process.memoryUsage();
    const rateLimits = await this.checkRateLimits();
    
    return {
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        rss: memory.rss,
        external: memory.external,
        usage: (memory.heapUsed / memory.heapTotal) * 100
      },
      rateLimits: rateLimits,
      timestamp: new Date().toISOString(),
      status: this.determineStatus(memory, rateLimits)
    };
  }
  
  private determineStatus(memory: any, rateLimits: any): 'healthy' | 'warning' | 'critical' {
    const memoryUsage = memory.heapUsed / memory.heapTotal;
    
    if (memoryUsage > 0.9) return 'critical';
    if (memoryUsage > 0.75) return 'warning';
    
    for (const limit of Object.values(rateLimits)) {
      if (limit.remaining < limit.max * 0.1) return 'warning';
    }
    
    return 'healthy';
  }
}
```

## Testing Recommendations

1. **Load Testing**: Use artillery or k6 to simulate high load
2. **Memory Profiling**: Use Chrome DevTools or clinic.js
3. **Rate Limit Testing**: Mock time to test rate limiting logic
4. **Chaos Engineering**: Randomly inject failures and memory pressure

## Estimated Performance Improvements

- **Memory Usage**: 60-70% reduction for large batches
- **Response Time**: 30-40% improvement for batch operations
- **API Quota Usage**: 90% reduction through better caching
- **System Stability**: 99.9% uptime with circuit breakers

## Next Steps

1. Implement Phase 1 improvements
2. Set up monitoring dashboards
3. Run load tests to validate improvements
4. Document performance baselines
5. Set up alerting for performance degradation