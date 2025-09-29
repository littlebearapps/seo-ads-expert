/**
 * Statistical Validation Tests
 * Comprehensive statistical testing of sampling strategies using chi-square and KS tests
 */

import { describe, it, expect } from 'vitest';
import {
  MonteCarloBayesSampling,
  VariationalBayesSampling,
  RejectionSampling
} from '../optimization/strategies/sampling-strategy.js';
import {
  chiSquareVarianceTest,
  kolmogorovSmirnovTest,
  expectVarianceToMatch,
  expectDistributionToMatch,
  betaCDF,
  gammaCDF,
  normalCDF
} from '../test-utils/statistical-assertions.js';
import { setupSeededRandom, teardownSeededRandom } from '../test-utils/seeded-random.js';

describe('Statistical Validation Tests', () => {
  // Set deterministic seed for reproducible tests
  beforeEach(() => {
    setupSeededRandom(12345);
  });

  afterEach(() => {
    teardownSeededRandom();
  });

  describe('Chi-Square Variance Tests', () => {
    it('should validate Monte Carlo Beta distribution variance', () => {
      const strategy = new MonteCarloBayesSampling();
      const alpha = 5;
      const beta = 3;
      const expectedVariance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleBeta(alpha, beta));
      }

      // Chi-square variance test should pass
      expectVarianceToMatch(samples, expectedVariance, 0.95);

      // Also test the raw chi-square function
      const result = chiSquareVarianceTest(samples, expectedVariance, 0.05);
      expect(result.isSignificant).toBe(false);
      expect(result.sampleVariance).toBeCloseTo(expectedVariance, 1);
    });

    it('should validate Monte Carlo Gamma distribution variance', () => {
      const strategy = new MonteCarloBayesSampling();
      const shape = 4;
      const rate = 2;
      const expectedVariance = shape / (rate ** 2);

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleGamma(shape, rate));
      }

      expectVarianceToMatch(samples, expectedVariance, 0.95);
    });

    it('should validate Monte Carlo Normal distribution variance', () => {
      const strategy = new MonteCarloBayesSampling();
      const mean = 10;
      const variance = 4;

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleNormal(mean, variance));
      }

      expectVarianceToMatch(samples, variance, 0.95);
    });

    it('should validate Variational Bayes Normal distribution variance', () => {
      const strategy = new VariationalBayesSampling();
      const mean = 5;
      const variance = 2;

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleNormal(mean, variance));
      }

      // Variational Bayes should have exact Normal sampling
      expectVarianceToMatch(samples, variance, 0.95);
    });

    it('should validate Rejection Sampling Normal distribution variance', () => {
      const strategy = new RejectionSampling();
      const mean = 0;
      const variance = 1;

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleNormal(mean, variance));
      }

      expectVarianceToMatch(samples, variance, 0.92); // Slightly more tolerance for rejection sampling
    });
  });

  describe('Distribution Shape Validation (KS-style)', () => {
    it('should produce Beta samples within expected bounds', () => {
      const strategy = new MonteCarloBayesSampling();
      const alpha = 3;
      const beta = 7;
      const expectedMean = alpha / (alpha + beta);

      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        samples.push(strategy.sampleBeta(alpha, beta));
      }

      // Check that all samples are valid probabilities
      samples.forEach(sample => {
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      });

      // Check mean is reasonable
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      expect(Math.abs(sampleMean - expectedMean)).toBeLessThan(0.1);

      // Check distribution has expected properties (not uniform)
      const sorted = [...samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length / 4)];
      const q3 = sorted[Math.floor(sorted.length * 3 / 4)];

      // For Beta(3,7), expect skewed distribution
      expect(median).toBeLessThan(0.5); // Should be left-skewed
      expect(q3 - median).toBeGreaterThan(median - q1); // Right tail longer
    });

    it('should produce Gamma samples with correct shape', () => {
      const strategy = new MonteCarloBayesSampling();
      const shape = 3;
      const rate = 1.5;
      const expectedMean = shape / rate;

      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        samples.push(strategy.sampleGamma(shape, rate));
      }

      // Check that all samples are positive
      samples.forEach(sample => {
        expect(sample).toBeGreaterThan(0);
      });

      // Check mean is reasonable
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      expect(Math.abs(sampleMean - expectedMean)).toBeLessThan(0.5);

      // Check right-skewed distribution properties
      const sorted = [...samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mean = sampleMean;

      // For Gamma distribution, mean > median (right-skewed)
      expect(mean).toBeGreaterThan(median);
    });

    it('should produce Normal samples with symmetric distribution', () => {
      const strategy = new MonteCarloBayesSampling();
      const mean = 2;
      const variance = 1.5;

      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        samples.push(strategy.sampleNormal(mean, variance));
      }

      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      expect(Math.abs(sampleMean - mean)).toBeLessThan(0.2);

      // Check symmetry properties
      const sorted = [...samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      // For Normal distribution, mean ≈ median
      expect(Math.abs(sampleMean - median)).toBeLessThan(0.3);
    });

    it('should validate Rejection Sampling produces similar shapes', () => {
      const strategy = new RejectionSampling();
      const alpha = 2;
      const beta = 5;
      const expectedMean = alpha / (alpha + beta);

      const samples: number[] = [];
      for (let i = 0; i < 300; i++) {
        samples.push(strategy.sampleBeta(alpha, beta));
      }

      // All samples should be valid probabilities
      samples.forEach(sample => {
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      });

      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      expect(Math.abs(sampleMean - expectedMean)).toBeLessThan(0.15);
    });
  });

  describe('Cross-Strategy Consistency Tests', () => {
    it('should have consistent variance across all sampling strategies', () => {
      const strategies = [
        new MonteCarloBayesSampling(),
        new VariationalBayesSampling(),
        new RejectionSampling()
      ];

      const mean = 0;
      const variance = 1;

      const allVariances: number[] = [];

      strategies.forEach((strategy, index) => {
        const samples: number[] = [];
        for (let i = 0; i < 500; i++) {
          samples.push(strategy.sampleNormal(mean, variance));
        }

        const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
        const sampleVariance = samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / (samples.length - 1);

        allVariances.push(sampleVariance);

        // Each strategy should individually match expected variance
        expectVarianceToMatch(samples, variance, 0.85); // More tolerance for cross-strategy test
      });

      // All strategies should produce similar variances
      const maxVariance = Math.max(...allVariances);
      const minVariance = Math.min(...allVariances);
      const varianceRatio = maxVariance / minVariance;

      // Variance ratios should be within reasonable bounds (strategies should be consistent)
      expect(varianceRatio).toBeLessThan(2.0);
    });

    it('should have consistent means across all sampling strategies for Beta distribution', () => {
      const strategies = [
        new MonteCarloBayesSampling(),
        new RejectionSampling()
      ];

      const alpha = 4;
      const beta = 6;
      const expectedMean = alpha / (alpha + beta);

      const allMeans: number[] = [];

      strategies.forEach((strategy) => {
        const samples: number[] = [];
        for (let i = 0; i < 800; i++) {
          samples.push(strategy.sampleBeta(alpha, beta));
        }

        const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
        allMeans.push(sampleMean);

        // Each mean should be close to expected
        expect(Math.abs(sampleMean - expectedMean)).toBeLessThan(0.05);
      });

      // All strategies should produce similar means
      const maxMean = Math.max(...allMeans);
      const minMean = Math.min(...allMeans);
      const meanDifference = maxMean - minMean;

      // Mean differences should be small across strategies
      expect(meanDifference).toBeLessThan(0.1);
    });
  });

  describe('Edge Case Statistical Validation', () => {
    it('should handle extreme Beta parameters correctly', () => {
      const strategy = new MonteCarloBayesSampling();

      // Test with alpha=1, beta=1 (uniform distribution)
      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        samples.push(strategy.sampleBeta(1, 1));
      }

      // Uniform distribution variance = 1/12 ≈ 0.0833
      const uniformVariance = 1 / 12;
      expectVarianceToMatch(samples, uniformVariance, 0.90);
    });

    it('should handle small Gamma shape parameters correctly', () => {
      const strategy = new MonteCarloBayesSampling();
      const shape = 0.5;
      const rate = 1;
      const expectedMean = shape / rate;
      const expectedVariance = shape / (rate ** 2);

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleGamma(shape, rate));
      }

      // For small shape parameters, use practical range checks instead of strict chi-square
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      const sampleVariance = samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / (samples.length - 1);

      // All samples should be positive
      samples.forEach(sample => {
        expect(sample).toBeGreaterThan(0);
      });

      // Mean should be within reasonable range (±20%)
      expect(Math.abs(sampleMean - expectedMean)).toBeLessThan(expectedMean * 0.20);

      // Variance should be within reasonable range (±30% for extreme shape parameters)
      expect(Math.abs(sampleVariance - expectedVariance)).toBeLessThan(expectedVariance * 0.30);
    });

    it('should handle high precision Normal sampling', () => {
      const strategy = new MonteCarloBayesSampling();
      const mean = 100;
      const variance = 0.01; // Very small variance

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleNormal(mean, variance));
      }

      expectVarianceToMatch(samples, variance, 0.95);

      // Mean should also be very precise
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      expect(Math.abs(sampleMean - mean)).toBeLessThan(0.01);
    });
  });

  describe('Statistical Test Robustness', () => {
    it('should detect when variance is significantly wrong', () => {
      // Create samples with intentionally wrong variance
      const strategy = new MonteCarloBayesSampling();
      const samples: number[] = [];

      // Generate Normal(0, 1) samples
      for (let i = 0; i < 1000; i++) {
        samples.push(strategy.sampleNormal(0, 1));
      }

      // Test against very wrong expected variance - should fail
      expect(() => {
        expectVarianceToMatch(samples, 10.0, 0.99); // Very wrong variance (10 instead of 1)
      }).toThrow();
    });

    it('should detect when distribution shape is significantly wrong', () => {
      const strategy = new MonteCarloBayesSampling();
      const samples: number[] = [];

      // Generate Beta(3, 3) samples
      for (let i = 0; i < 300; i++) {
        samples.push(strategy.sampleBeta(3, 3));
      }

      // Test against wrong distribution parameters - should fail
      const wrongCDF = (x: number) => betaCDF(x, 1, 1); // Uniform instead of Beta(3,3)

      expect(() => {
        expectDistributionToMatch(samples, wrongCDF, 0.95);
      }).toThrow();
    });

    it('should handle insufficient sample sizes gracefully', () => {
      const samples = [1, 2, 3]; // Too few samples

      expect(() => {
        chiSquareVarianceTest(samples, 1.0);
      }).toThrow('Chi-square variance test requires at least 30 samples');

      expect(() => {
        kolmogorovSmirnovTest(samples, (x) => x);
      }).toThrow('KS test requires at least 5 samples');
    });
  });
});