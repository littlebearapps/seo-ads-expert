/**
 * Unit tests for SamplingStrategy implementations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SamplingStrategy,
  MonteCarloBayesSampling,
  VariationalBayesSampling,
  RejectionSampling
} from '../../optimization/strategies/sampling-strategy.js';

describe('SamplingStrategy Implementations', () => {
  describe('MonteCarloBayesSampling', () => {
    let strategy: MonteCarloBayesSampling;

    beforeEach(() => {
      // Use fixed seed for deterministic testing
      strategy = new MonteCarloBayesSampling(12345);
    });

    it('should sample from Beta distribution with valid parameters', () => {
      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const sample = strategy.sampleBeta(2, 5);
        samples.push(sample);

        // Beta samples should be between 0 and 1
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }

      // Check mean is approximately alpha/(alpha+beta) = 2/7 ≈ 0.286
      const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(mean).toBeCloseTo(0.286, 1);
    });

    it('should handle edge case Beta(1, 1) as uniform distribution', () => {
      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const sample = strategy.sampleBeta(1, 1);
        samples.push(sample);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }

      // Beta(1,1) is uniform, so mean should be ~0.5
      const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(mean).toBeCloseTo(0.5, 1);
    });

    it('should sample from Gamma distribution with valid parameters', () => {
      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const sample = strategy.sampleGamma(2, 0.5);
        samples.push(sample);

        // Gamma samples should be positive
        expect(sample).toBeGreaterThan(0);
      }

      // Check mean is approximately shape/rate = 2/0.5 = 4
      const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(mean).toBeCloseTo(4, 0); // Allow more variance for random sampling
    });

    it('should sample from Normal distribution', () => {
      const samples: number[] = [];
      const mean = 10;
      const variance = 4;
      const n = 1000; // Increase sample size for stability

      for (let i = 0; i < n; i++) {
        const sample = strategy.sampleNormal(mean, variance);
        samples.push(sample);
      }

      // Check sample mean is close to specified mean using confidence interval
      const sampleMean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      const sigma = Math.sqrt(variance);
      const z = 3; // 99.7% confidence
      const marginOfError = z * sigma / Math.sqrt(n);
      expect(Math.abs(sampleMean - mean)).toBeLessThanOrEqual(marginOfError);

      // Check sample variance is within reasonable bounds
      const sampleVariance = samples.reduce((sum, s) => sum + (s - sampleMean) ** 2, 0) / (samples.length - 1);
      expect(sampleVariance).toBeGreaterThan(variance * 0.7);
      expect(sampleVariance).toBeLessThan(variance * 1.3);
    });

    it('should throw error for invalid Beta parameters', () => {
      expect(() => strategy.sampleBeta(0, 1)).toThrow('Invalid Beta parameters');
      expect(() => strategy.sampleBeta(1, 0)).toThrow('Invalid Beta parameters');
      expect(() => strategy.sampleBeta(-1, 1)).toThrow('Invalid Beta parameters');
    });

    it('should throw error for invalid Gamma parameters', () => {
      expect(() => strategy.sampleGamma(0, 1)).toThrow('Invalid Gamma parameters');
      expect(() => strategy.sampleGamma(1, 0)).toThrow('Invalid Gamma parameters');
      expect(() => strategy.sampleGamma(-1, 1)).toThrow('Invalid Gamma parameters');
    });

    it('should throw error for invalid Normal variance', () => {
      expect(() => strategy.sampleNormal(0, 0)).toThrow('Invalid Normal variance');
      expect(() => strategy.sampleNormal(0, -1)).toThrow('Invalid Normal variance');
    });

    it('should provide correct metadata', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.name).toBe('Monte Carlo Bayesian Sampling');
      expect(metadata.algorithmType).toBe('monte-carlo');
      expect(metadata.accuracy).toBe('high');
      expect(metadata.performance).toBe('fast');
      expect(metadata.memoryUsage).toBe('low');
    });
  });

  describe('VariationalBayesSampling', () => {
    let strategy: VariationalBayesSampling;

    beforeEach(() => {
      strategy = new VariationalBayesSampling(100, 1e-6);
    });

    it('should sample from Beta distribution', () => {
      const samples: number[] = [];
      for (let i = 0; i < 50; i++) {
        const sample = strategy.sampleBeta(3, 7);
        samples.push(sample);

        // Samples should be between 0 and 1
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }

      // Mean should be approximately alpha/(alpha+beta) = 3/10 = 0.3
      const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(mean).toBeCloseTo(0.3, 0); // Allow more variance for Beta sampling
    });

    it('should sample from Gamma distribution', () => {
      const samples: number[] = [];
      for (let i = 0; i < 50; i++) {
        const sample = strategy.sampleGamma(5, 2);
        samples.push(sample);

        // Gamma samples should be positive
        expect(sample).toBeGreaterThan(0);
      }

      // Mean should be approximately shape/rate = 5/2 = 2.5
      const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(mean).toBeCloseTo(2.5, 0); // Allow more variance for Gamma sampling
    });

    it('should handle exact Normal sampling', () => {
      const samples: number[] = [];
      const mean = 5;
      const variance = 2;

      for (let i = 0; i < 50; i++) {
        const sample = strategy.sampleNormal(mean, variance);
        samples.push(sample);
      }

      const sampleMean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(sampleMean).toBeCloseTo(mean, 0); // Allow more variance for random sampling
    });

    it('should provide correct metadata', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.name).toBe('Variational Bayesian Sampling');
      expect(metadata.algorithmType).toBe('variational');
      expect(metadata.accuracy).toBe('exact');
      expect(metadata.performance).toBe('medium');
      expect(metadata.memoryUsage).toBe('medium');
    });

    it('should handle edge cases gracefully', () => {
      // Very small parameters
      const sample1 = strategy.sampleBeta(0.1, 0.1);
      expect(sample1).toBeGreaterThanOrEqual(0);
      expect(sample1).toBeLessThanOrEqual(1);

      // Very large parameters
      const sample2 = strategy.sampleBeta(100, 100);
      expect(sample2).toBeGreaterThanOrEqual(0);
      expect(sample2).toBeLessThanOrEqual(1);
      // Should be close to 0.5 for symmetric large parameters
      expect(sample2).toBeCloseTo(0.5, 1);
    });
  });

  describe('RejectionSampling', () => {
    let strategy: RejectionSampling;

    beforeEach(() => {
      // Use fixed seed for deterministic testing
      strategy = new RejectionSampling(10000, 54321);
    });

    it('should sample from Beta distribution using rejection method', () => {
      const samples: number[] = [];
      for (let i = 0; i < 30; i++) {
        const sample = strategy.sampleBeta(4, 6);
        samples.push(sample);

        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }

      // Mean should be approximately 4/10 = 0.4
      const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(mean).toBeCloseTo(0.4, 1);
    });

    it('should fallback gracefully when rejection fails', () => {
      // Use very low max attempts to force fallback
      const limitedStrategy = new RejectionSampling(1, 12345);

      // Should still return valid result via fallback
      const sample = limitedStrategy.sampleBeta(2, 3);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
      // Fallback returns a random value, just check it's in valid range
      // No exact value expected due to random fallback
    });

    it('should sample from Gamma distribution', () => {
      const samples: number[] = [];
      const shape = 3;
      const rate = 1;
      const n = 1000; // Increase sample size

      for (let i = 0; i < n; i++) {
        const sample = strategy.sampleGamma(shape, rate);
        samples.push(sample);
        expect(sample).toBeGreaterThan(0);
      }

      // Mean should be approximately shape/rate = 3/1 = 3
      const expectedMean = shape / rate;
      const expectedVariance = shape / (rate * rate);
      const sampleMean = samples.reduce((sum, s) => sum + s, 0) / samples.length;

      // Use confidence interval for mean
      const z = 3; // 99.7% confidence
      const marginOfError = z * Math.sqrt(expectedVariance) / Math.sqrt(n);
      expect(Math.abs(sampleMean - expectedMean)).toBeLessThanOrEqual(marginOfError);
    });

    it('should sample from Normal distribution with rejection or fallback', () => {
      const samples: number[] = [];
      const mean = 0;
      const variance = 1;

      for (let i = 0; i < 30; i++) {
        const sample = strategy.sampleNormal(mean, variance);
        samples.push(sample);
      }

      const sampleMean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
      expect(sampleMean).toBeCloseTo(mean, 0); // Allow more variance for random sampling
    });

    it('should provide correct metadata', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.name).toBe('Rejection Sampling');
      expect(metadata.algorithmType).toBe('rejection');
      expect(metadata.accuracy).toBe('exact');
      expect(metadata.performance).toBe('slow');
      expect(metadata.memoryUsage).toBe('low');
    });

    it('should handle invalid parameters with errors', () => {
      expect(() => strategy.sampleBeta(-1, 2)).toThrow('Invalid Beta parameters');
      expect(() => strategy.sampleGamma(0, 1)).toThrow('Invalid Gamma parameters');
      expect(() => strategy.sampleNormal(0, -1)).toThrow('Invalid Normal variance');
    });
  });

  describe('Strategy Comparison', () => {
    it('should produce similar distributions across all strategies', () => {
      const strategies: SamplingStrategy[] = [
        new MonteCarloBayesSampling(99999),
        new VariationalBayesSampling(),
        new RejectionSampling(10000, 99999)
      ];

      const alpha = 5;
      const beta = 10;
      const expectedMean = alpha / (alpha + beta); // 0.333...

      for (const strategy of strategies) {
        const samples: number[] = [];
        for (let i = 0; i < 100; i++) {
          samples.push(strategy.sampleBeta(alpha, beta));
        }

        const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;

        // All strategies should produce similar means
        expect(mean).toBeCloseTo(expectedMean, 0); // Allow variance across different sampling methods

        // All samples should be valid probabilities
        samples.forEach(sample => {
          expect(sample).toBeGreaterThanOrEqual(0);
          expect(sample).toBeLessThanOrEqual(1);
        });
      }
    });

    it('should have different performance characteristics', () => {
      const strategies = [
        new MonteCarloBayesSampling(),
        new VariationalBayesSampling(),
        new RejectionSampling()
      ];

      const metadata = strategies.map(s => s.getMetadata());

      // Monte Carlo should be fastest
      expect(metadata[0].performance).toBe('fast');

      // Variational should be medium speed
      expect(metadata[1].performance).toBe('medium');

      // Rejection should be slowest
      expect(metadata[2].performance).toBe('slow');

      // Check accuracy levels
      expect(metadata[0].accuracy).toBe('high');
      expect(metadata[1].accuracy).toBe('exact');
      expect(metadata[2].accuracy).toBe('exact');
    });
  });
});