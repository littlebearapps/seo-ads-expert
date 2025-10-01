/**
 * Mock implementation of CacheManager for testing
 */

export class CacheManager {
  private mockCache = new Map<string, any>();

  constructor(options?: any) {
    // Accept any options for compatibility
  }

  async get<T>(key: string): Promise<T | null> {
    return this.mockCache.get(key) || null;
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    this.mockCache.set(key, data);
  }

  async delete(key: string): Promise<void> {
    this.mockCache.delete(key);
  }

  async clear(): Promise<void> {
    this.mockCache.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.mockCache.has(key);
  }

  // Additional methods for testing
  size(): number {
    return this.mockCache.size;
  }

  getAllKeys(): string[] {
    return Array.from(this.mockCache.keys());
  }
}

// Export singleton for compatibility
export const cacheManager = new CacheManager();