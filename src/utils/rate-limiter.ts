import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Token Bucket Rate Limiter
 * Allows burst traffic while maintaining average rate limits
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private readonly name: string;

  constructor(name: string, maxTokens: number, refillRate: number) {
    this.name = name;
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire tokens from the bucket
   * Waits if insufficient tokens are available
   */
  async acquire(tokens = 1): Promise<void> {
    if (tokens > this.maxTokens) {
      throw new Error(`Cannot acquire ${tokens} tokens, max bucket size is ${this.maxTokens}`);
    }

    await this.refillTokens();

    while (this.tokens < tokens) {
      // Calculate wait time for tokens to be available
      const tokensNeeded = tokens - this.tokens;
      const waitTime = Math.ceil((tokensNeeded / this.refillRate) * 1000);
      
      logger.debug(`Rate limiter ${this.name}: Waiting ${waitTime}ms for ${tokensNeeded} tokens`);
      
      // Wait for tokens, checking every second
      await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
      await this.refillTokens();
    }

    this.tokens -= tokens;
    logger.debug(`Rate limiter ${this.name}: Acquired ${tokens} tokens, ${Math.floor(this.tokens)} remaining`);
  }

  /**
   * Try to acquire tokens without waiting
   * Returns true if successful, false if not enough tokens
   */
  tryAcquire(tokens = 1): boolean {
    this.refillTokens();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = timePassed * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Get current number of available tokens
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get rate limiter status
   */
  getStatus(): {
    name: string;
    available: number;
    max: number;
    refillRate: number;
    percentAvailable: number;
  } {
    this.refillTokens();
    
    return {
      name: this.name,
      available: Math.floor(this.tokens),
      max: this.maxTokens,
      refillRate: this.refillRate,
      percentAvailable: (this.tokens / this.maxTokens) * 100
    };
  }

  /**
   * Reset the rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    logger.info(`Rate limiter ${this.name} reset to full capacity`);
  }
}

/**
 * Sliding Window Rate Limiter
 * Provides more accurate rate limiting over time windows
 */
export class SlidingWindowRateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly name: string;

  constructor(name: string, maxRequests: number, windowMs: number) {
    this.name = name;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Acquire a slot in the rate limit window
   * Waits if limit is reached
   */
  async acquire(): Promise<void> {
    this.cleanup();

    while (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (Date.now() - oldestRequest);

      if (waitTime > 0) {
        logger.debug(`Rate limiter ${this.name}: Waiting ${waitTime}ms for window to slide`);
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
        this.cleanup();
      } else {
        break;
      }
    }

    this.requests.push(Date.now());
    logger.debug(`Rate limiter ${this.name}: Request acquired, ${this.requests.length}/${this.maxRequests} used`);
  }

  /**
   * Try to acquire without waiting
   */
  tryAcquire(): boolean {
    this.cleanup();

    if (this.requests.length < this.maxRequests) {
      this.requests.push(Date.now());
      return true;
    }

    return false;
  }

  /**
   * Remove expired requests from the window
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(time => time > cutoff);
  }

  /**
   * Get current usage information
   */
  getUsage(): {
    name: string;
    current: number;
    max: number;
    resetIn: number;
    percentUsed: number;
  } {
    this.cleanup();

    const resetIn = this.requests.length > 0
      ? this.windowMs - (Date.now() - this.requests[0])
      : 0;

    return {
      name: this.name,
      current: this.requests.length,
      max: this.maxRequests,
      resetIn: Math.max(0, resetIn),
      percentUsed: (this.requests.length / this.maxRequests) * 100
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
    logger.info(`Rate limiter ${this.name} reset`);
  }
}

/**
 * Composite Rate Limiter Manager
 * Manages multiple rate limiters for different APIs
 */
export class RateLimiterManager {
  private limiters: Map<string, TokenBucketRateLimiter | SlidingWindowRateLimiter>;

  constructor() {
    this.limiters = new Map();
    this.initializeDefaultLimiters();
  }

  /**
   * Initialize default rate limiters for known APIs
   */
  private initializeDefaultLimiters(): void {
    // Google APIs: 10 requests per second
    this.addTokenBucketLimiter('google-ads', 10, 10);
    this.addTokenBucketLimiter('google-search-console', 10, 10);

    // RapidAPI limits (free tier)
    // SERP: 100 per month ≈ 0.04 per hour
    this.addTokenBucketLimiter('rapid-serp', 3, 0.000039); // ~100/month
    
    // Keywords: 20 per month ≈ 0.008 per hour  
    this.addTokenBucketLimiter('rapid-keywords', 2, 0.0000077); // ~20/month

    // Local operations: Higher limits
    this.addSlidingWindowLimiter('file-operations', 100, 1000); // 100 per second
    this.addSlidingWindowLimiter('cache-operations', 1000, 1000); // 1000 per second
  }

  /**
   * Add a token bucket rate limiter
   */
  addTokenBucketLimiter(name: string, maxTokens: number, refillRate: number): void {
    this.limiters.set(name, new TokenBucketRateLimiter(name, maxTokens, refillRate));
    logger.info(`Added token bucket limiter: ${name} (${maxTokens} tokens, ${refillRate}/s refill)`);
  }

  /**
   * Add a sliding window rate limiter
   */
  addSlidingWindowLimiter(name: string, maxRequests: number, windowMs: number): void {
    this.limiters.set(name, new SlidingWindowRateLimiter(name, maxRequests, windowMs));
    logger.info(`Added sliding window limiter: ${name} (${maxRequests} requests per ${windowMs}ms)`);
  }

  /**
   * Acquire from a specific rate limiter
   */
  async acquire(name: string, tokens = 1): Promise<void> {
    const limiter = this.limiters.get(name);
    
    if (!limiter) {
      logger.warn(`No rate limiter found for: ${name}, allowing request`);
      return;
    }

    if (limiter instanceof TokenBucketRateLimiter) {
      await limiter.acquire(tokens);
    } else {
      await limiter.acquire();
    }
  }

  /**
   * Try to acquire without waiting
   */
  tryAcquire(name: string, tokens = 1): boolean {
    const limiter = this.limiters.get(name);
    
    if (!limiter) {
      logger.warn(`No rate limiter found for: ${name}, allowing request`);
      return true;
    }

    if (limiter instanceof TokenBucketRateLimiter) {
      return limiter.tryAcquire(tokens);
    } else {
      return limiter.tryAcquire();
    }
  }

  /**
   * Get status of all rate limiters
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [name, limiter] of this.limiters) {
      if (limiter instanceof TokenBucketRateLimiter) {
        status[name] = limiter.getStatus();
      } else {
        status[name] = limiter.getUsage();
      }
    }

    return status;
  }

  /**
   * Reset a specific rate limiter
   */
  reset(name: string): void {
    const limiter = this.limiters.get(name);
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * Reset all rate limiters
   */
  resetAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
    logger.info('All rate limiters reset');
  }
}

// Export singleton instance
export const rateLimiterManager = new RateLimiterManager();