/**
 * Seeded Pseudo-Random Number Generator for deterministic testing
 *
 * Provides high-quality statistical distributions with reproducible seeds.
 * Uses Mulberry32 algorithm for fast, high-quality randomness.
 */

export interface RandomProvider {
  random(): number;
}

/**
 * Default random provider using Math.random()
 */
export class DefaultRandomProvider implements RandomProvider {
  random(): number {
    return Math.random();
  }
}

/**
 * Seeded random provider for deterministic testing
 * Uses Mulberry32 algorithm which has excellent statistical properties
 */
export class SeededRandomProvider implements RandomProvider {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
  }

  random(): number {
    // Mulberry32 algorithm - fast and excellent statistical properties
    this.seed |= 0;
    this.seed = (this.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Reset to specific seed for repeatable sequences
   */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /**
   * Get current seed state (useful for debugging)
   */
  getSeed(): number {
    return this.seed;
  }
}

/**
 * Global random provider - defaults to Math.random() in production
 */
let globalRandomProvider: RandomProvider = new DefaultRandomProvider();

/**
 * Set global random provider (used by tests)
 */
export function setRandomProvider(provider: RandomProvider): void {
  globalRandomProvider = provider;
}

/**
 * Get current random provider
 */
export function getRandomProvider(): RandomProvider {
  return globalRandomProvider;
}

/**
 * Reset to default Math.random() provider
 */
export function resetRandomProvider(): void {
  globalRandomProvider = new DefaultRandomProvider();
}

/**
 * Convenience function for production code to get random numbers
 */
export function random(): number {
  return globalRandomProvider.random();
}

/**
 * Setup deterministic random for tests with specific seed
 */
export function setupSeededRandom(seed: number = 12345): SeededRandomProvider {
  const provider = new SeededRandomProvider(seed);
  setRandomProvider(provider);
  return provider;
}

/**
 * Teardown seeded random and restore default
 */
export function teardownSeededRandom(): void {
  resetRandomProvider();
}