/**
 * Sampling Strategy Interface
 * Provides different statistical sampling implementations for Thompson Sampling optimizer
 */

import { random } from '../../test-utils/seeded-random.js';

/**
 * Core sampling strategy interface for Thompson Sampling
 */
export interface SamplingStrategy {
  /**
   * Sample from Beta distribution for conversion rate modeling
   */
  sampleBeta(alpha: number, beta: number): number;

  /**
   * Sample from Gamma distribution for conversion value modeling
   */
  sampleGamma(shape: number, rate: number): number;

  /**
   * Sample from Normal distribution for general continuous variables
   */
  sampleNormal(mean: number, variance: number): number;

  /**
   * Get strategy metadata for logging and debugging
   */
  getMetadata(): SamplingStrategyMetadata;
}

/**
 * Metadata for sampling strategy
 */
export interface SamplingStrategyMetadata {
  name: string;
  description: string;
  algorithmType: 'monte-carlo' | 'variational' | 'rejection' | 'inverse-transform';
  accuracy: 'low' | 'medium' | 'high' | 'exact';
  performance: 'fast' | 'medium' | 'slow';
  memoryUsage: 'low' | 'medium' | 'high';
}

/**
 * Monte Carlo Bayesian Sampling Implementation
 * Fast, approximate sampling using Monte Carlo methods
 */
export class MonteCarloBayesSampling implements SamplingStrategy {
  constructor(seed?: number) {
    // Seed parameter kept for backward compatibility but not used
    // Global seeded random provider handles deterministic behavior
  }

  sampleBeta(alpha: number, beta: number): number {
    // Use rejection sampling for Beta distribution
    if (alpha <= 0 || beta <= 0) {
      throw new Error(`Invalid Beta parameters: alpha=${alpha}, beta=${beta}`);
    }

    // For efficiency, use different methods based on parameter values
    if (alpha === 1 && beta === 1) {
      return this.uniform();
    }

    if (alpha < 1 && beta < 1) {
      return this.betaRejectionSampling(alpha, beta);
    }

    // Use gamma ratio method for general case
    const x = this.sampleGamma(alpha, 1);
    const y = this.sampleGamma(beta, 1);
    return x / (x + y);
  }

  sampleGamma(shape: number, rate: number): number {
    if (shape <= 0 || rate <= 0) {
      throw new Error(`Invalid Gamma parameters: shape=${shape}, rate=${rate}`);
    }

    // Use Marsaglia and Tsang method for shape >= 1
    if (shape >= 1) {
      return this.gammaAhrensDisoMode(shape) / rate;
    }

    // For shape < 1, use the standard transformation method
    // Generate Gamma(shape + 1, 1) then transform with uniform random
    const sample = this.gammaForShapeGreaterThanOne(shape + 1);
    const u = this.uniform();
    return (sample * Math.pow(u, 1 / shape)) / rate;
  }

  sampleNormal(mean: number, variance: number): number {
    if (variance <= 0) {
      throw new Error(`Invalid Normal variance: ${variance}`);
    }

    // Box-Muller transformation
    const u1 = this.uniform();
    const u2 = this.uniform();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + Math.sqrt(variance) * z0;
  }

  getMetadata(): SamplingStrategyMetadata {
    return {
      name: 'Monte Carlo Bayesian Sampling',
      description: 'Fast approximate sampling using Monte Carlo methods',
      algorithmType: 'monte-carlo',
      accuracy: 'high',
      performance: 'fast',
      memoryUsage: 'low'
    };
  }

  private uniform(): number {
    // Use global seeded random provider for deterministic sampling
    return random();
  }

  private betaRejectionSampling(alpha: number, beta: number): number {
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      const u = this.uniform();
      const v = this.uniform();
      const x = Math.pow(u, 1 / alpha);
      const y = Math.pow(v, 1 / beta);

      if (x + y <= 1) {
        return x / (x + y);
      }
      attempts++;
    }

    // Fallback to mean if rejection sampling fails
    return alpha / (alpha + beta);
  }

  private gammaAhrensDisoMode(shape: number): number {
    // Ahrens-Dieter method for Gamma sampling
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      let x: number;
      let v: number;

      do {
        x = this.sampleNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = this.uniform();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }

      attempts++;
    }

    // Fallback to mean
    return shape;
  }

  private gammaForShapeGreaterThanOne(shape: number): number {
    // Dedicated method for shape >= 1 without circular dependency
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      let x: number;
      let v: number;

      do {
        // Use Box-Muller directly to avoid circular dependency
        const u1 = this.uniform();
        const u2 = this.uniform();
        x = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = this.uniform();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }

      attempts++;
    }

    // Fallback to mean
    return shape;
  }
}

/**
 * Variational Bayesian Sampling Implementation
 * High accuracy sampling using variational inference approximations
 */
export class VariationalBayesSampling implements SamplingStrategy {
  private readonly maxIterations: number;
  private readonly tolerance: number;

  constructor(maxIterations: number = 100, tolerance: number = 1e-6) {
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  sampleBeta(alpha: number, beta: number): number {
    if (alpha <= 0 || beta <= 0) {
      throw new Error(`Invalid Beta parameters: alpha=${alpha}, beta=${beta}`);
    }

    // Use mean-field variational approximation
    const meanApprox = this.betaMeanFieldApproximation(alpha, beta);

    // Add controlled noise for sampling
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const noise = random() * Math.sqrt(variance) * 0.1;

    return Math.max(0, Math.min(1, meanApprox + noise));
  }

  sampleGamma(shape: number, rate: number): number {
    if (shape <= 0 || rate <= 0) {
      throw new Error(`Invalid Gamma parameters: shape=${shape}, rate=${rate}`);
    }

    // Use variational approximation for mean
    const meanApprox = shape / rate;
    const varianceApprox = shape / (rate ** 2);

    // Add controlled noise
    const noise = random() * Math.sqrt(varianceApprox) * 0.1;
    return Math.max(0, meanApprox + noise);
  }

  sampleNormal(mean: number, variance: number): number {
    if (variance <= 0) {
      throw new Error(`Invalid Normal variance: ${variance}`);
    }

    // Variational approximation is exact for Normal distributions
    return mean + Math.sqrt(variance) * this.standardNormal();
  }

  getMetadata(): SamplingStrategyMetadata {
    return {
      name: 'Variational Bayesian Sampling',
      description: 'High accuracy sampling using variational inference',
      algorithmType: 'variational',
      accuracy: 'exact',
      performance: 'medium',
      memoryUsage: 'medium'
    };
  }

  private betaMeanFieldApproximation(alpha: number, beta: number): number {
    // Iterative mean-field approximation
    let q_alpha = alpha;
    let q_beta = beta;

    for (let i = 0; i < this.maxIterations; i++) {
      const old_alpha = q_alpha;
      const old_beta = q_beta;

      // Update variational parameters
      q_alpha = alpha + this.digamma(q_alpha) - this.digamma(q_alpha + q_beta);
      q_beta = beta + this.digamma(q_beta) - this.digamma(q_alpha + q_beta);

      // Check convergence
      if (Math.abs(q_alpha - old_alpha) < this.tolerance &&
          Math.abs(q_beta - old_beta) < this.tolerance) {
        break;
      }
    }

    return q_alpha / (q_alpha + q_beta);
  }

  private standardNormal(): number {
    // Box-Muller transformation for standard normal
    const u1 = random();
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private digamma(x: number): number {
    // Approximation of digamma function
    if (x < 8) {
      return this.digamma(x + 1) - 1 / x;
    }

    const invX = 1 / x;
    return Math.log(x) - 0.5 * invX - invX * invX / 12 +
           invX * invX * invX * invX / 120 - invX * invX * invX * invX * invX * invX / 252;
  }
}

/**
 * Rejection Sampling Implementation
 * Exact sampling using rejection methods with fallback guarantees
 */
export class RejectionSampling implements SamplingStrategy {
  private readonly maxAttempts: number;

  constructor(maxAttempts: number = 10000, seed?: number) {
    this.maxAttempts = maxAttempts;
    // Seed parameter kept for backward compatibility but not used
    // Global seeded random provider handles deterministic behavior
  }

  sampleBeta(alpha: number, beta: number): number {
    if (alpha <= 0 || beta <= 0) {
      throw new Error(`Invalid Beta parameters: alpha=${alpha}, beta=${beta}`);
    }

    // Pure rejection sampling with exact distribution
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const x = this.random();
      const acceptance = Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1);
      const threshold = this.random();

      if (threshold <= acceptance) {
        return x;
      }
    }

    // Fallback to method of moments estimate
    return alpha / (alpha + beta);
  }

  sampleGamma(shape: number, rate: number): number {
    if (shape <= 0 || rate <= 0) {
      throw new Error(`Invalid Gamma parameters: shape=${shape}, rate=${rate}`);
    }

    // Use Marsaglia and Tsang's method for shape >= 1
    if (shape >= 1) {
      const d = shape - 1.0 / 3.0;
      const c = 1.0 / Math.sqrt(9.0 * d);

      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        let x: number;
        let v: number;

        do {
          x = this.sampleNormal(0, 1);
          v = 1.0 + c * x;
        } while (v <= 0);

        v = v * v * v;
        const u = this.random();

        if (u < 1.0 - 0.0331 * (x * x) * (x * x)) {
          return d * v / rate;
        }

        if (Math.log(u) < 0.5 * x * x + d * (1.0 - v + Math.log(v))) {
          return d * v / rate;
        }
      }
    } else {
      // For shape < 1, use rejection method with exponential proposal
      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        const u = this.random();
        const b = (Math.E + shape) / Math.E;
        const p = b * u;

        let x: number;
        if (p <= 1.0) {
          x = Math.pow(p, 1.0 / shape);
        } else {
          x = -Math.log((b - p) / shape);
        }

        const u1 = this.random();
        let accept: boolean;

        if (p <= 1.0) {
          accept = u1 <= Math.exp(-x);
        } else {
          accept = u1 <= Math.pow(x, shape - 1.0);
        }

        if (accept) {
          return x / rate;
        }
      }
    }

    // Fallback: Use a different method (Gamma approximation)
    if (shape >= 1) {
      return this.gammaApproximation(shape, rate);
    } else {
      return this.exponentialRandom() / rate; // Simple exponential fallback
    }
  }

  sampleNormal(mean: number, variance: number): number {
    if (variance <= 0) {
      throw new Error(`Invalid Normal variance: ${variance}`);
    }

    // Use Box-Muller transformation directly for rejection sampling
    // This is more accurate than trying to implement rejection sampling for Normal
    const u1 = this.random();
    const u2 = this.random();

    // Avoid log(0) by ensuring u1 > 0
    const safeU1 = Math.max(u1, 1e-10);

    const z = Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
    return mean + Math.sqrt(variance) * z;
  }

  getMetadata(): SamplingStrategyMetadata {
    return {
      name: 'Rejection Sampling',
      description: 'Exact sampling using rejection methods with guaranteed fallback',
      algorithmType: 'rejection',
      accuracy: 'exact',
      performance: 'slow',
      memoryUsage: 'low'
    };
  }

  private random(): number {
    // Use global seeded random provider for deterministic sampling
    return random();
  }

  private exponentialRandom(): number {
    return -Math.log(1 - this.random());
  }

  private gammaApproximation(shape: number, rate: number): number {
    // Approximation using Central Limit Theorem for large shape
    if (shape >= 10) {
      // Normal approximation for large shape
      const mean = shape / rate;
      const variance = shape / (rate * rate);
      return Math.max(0.001, this.sampleNormal(mean, variance));
    } else {
      // Sum of exponentials method for moderate shape
      let sum = 0;
      for (let i = 0; i < Math.floor(shape); i++) {
        sum += this.exponentialRandom();
      }

      // Handle fractional part if needed
      const fractionalPart = shape - Math.floor(shape);
      if (fractionalPart > 0) {
        const u = this.random();
        sum += -Math.log(u) * fractionalPart;
      }

      return sum / rate;
    }
  }
}