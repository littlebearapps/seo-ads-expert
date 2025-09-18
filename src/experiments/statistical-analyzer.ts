/**
 * Statistical Analyzer for A/B Testing
 * Provides statistical significance testing and power analysis
 */

import { logger } from '../utils/logger.js';

export interface AnalysisInput {
  control: {
    conversions: number;
    samples: number;
  };
  variant: {
    conversions: number;
    samples: number;
  };
  confidenceLevel: number;
  minimumSampleSize?: number;
}

export interface AnalysisResult {
  significant: boolean;
  pValue: number;
  confidenceLevel: number;
  winner?: 'control' | 'variant';
  controlConversionRate: number;
  variantConversionRate: number;
  relativeImprovement: number;
  absoluteImprovement: number;
  powerAnalysis?: {
    currentPower: number;
    requiredPower: number;
    additionalSamplesNeeded: number;
  };
}

export interface BayesianResult {
  probabilityVariantBetter: number;
  expectedLoss: {
    control: number;
    variant: number;
  };
  credibleInterval: {
    lower: number;
    upper: number;
  };
}

export class StatisticalAnalyzer {
  /**
   * Perform Z-test for two proportions (Frequentist approach)
   */
  analyze(input: AnalysisInput): AnalysisResult {
    const { control, variant, confidenceLevel, minimumSampleSize = 0 } = input;

    // Calculate conversion rates
    const pControl = control.conversions / control.samples;
    const pVariant = variant.conversions / variant.samples;

    // Calculate pooled proportion
    const pPooled = (control.conversions + variant.conversions) /
                    (control.samples + variant.samples);

    // Calculate standard error
    const se = Math.sqrt(
      pPooled * (1 - pPooled) * (1 / control.samples + 1 / variant.samples)
    );

    // Calculate z-score
    const z = se === 0 ? 0 : (pVariant - pControl) / se;

    // Calculate p-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Check if enough samples
    const hasEnoughSamples = control.samples >= minimumSampleSize &&
                             variant.samples >= minimumSampleSize;

    // Determine significance
    const alpha = 1 - confidenceLevel;
    const significant = pValue < alpha && hasEnoughSamples;

    // Determine winner
    let winner: 'control' | 'variant' | undefined;
    if (significant) {
      winner = pVariant > pControl ? 'variant' : 'control';
    }

    // Calculate improvements
    const relativeImprovement = pControl === 0 ? 0 :
                                (pVariant - pControl) / pControl;
    const absoluteImprovement = pVariant - pControl;

    // Power analysis
    const powerAnalysis = this.calculatePower(input);

    return {
      significant,
      pValue,
      confidenceLevel,
      winner,
      controlConversionRate: pControl,
      variantConversionRate: pVariant,
      relativeImprovement,
      absoluteImprovement,
      powerAnalysis
    };
  }

  /**
   * Bayesian analysis for conversion rates
   */
  analyzeBayesian(input: AnalysisInput): BayesianResult {
    const { control, variant } = input;

    // Use Beta distributions as conjugate priors
    // Beta(conversions + 1, samples - conversions + 1)
    const alphaControl = control.conversions + 1;
    const betaControl = control.samples - control.conversions + 1;
    const alphaVariant = variant.conversions + 1;
    const betaVariant = variant.samples - variant.conversions + 1;

    // Monte Carlo simulation for probability variant is better
    const simulations = 10000;
    let variantBetter = 0;
    let controlLoss = 0;
    let variantLoss = 0;

    for (let i = 0; i < simulations; i++) {
      const sampleControl = this.sampleBeta(alphaControl, betaControl);
      const sampleVariant = this.sampleBeta(alphaVariant, betaVariant);

      if (sampleVariant > sampleControl) {
        variantBetter++;
        controlLoss += sampleVariant - sampleControl;
      } else {
        variantLoss += sampleControl - sampleVariant;
      }
    }

    const probabilityVariantBetter = variantBetter / simulations;

    // Calculate credible interval for difference
    const differences: number[] = [];
    for (let i = 0; i < simulations; i++) {
      const sampleControl = this.sampleBeta(alphaControl, betaControl);
      const sampleVariant = this.sampleBeta(alphaVariant, betaVariant);
      differences.push(sampleVariant - sampleControl);
    }

    differences.sort((a, b) => a - b);
    const lowerIndex = Math.floor(simulations * 0.025);
    const upperIndex = Math.floor(simulations * 0.975);

    return {
      probabilityVariantBetter,
      expectedLoss: {
        control: controlLoss / simulations,
        variant: variantLoss / simulations
      },
      credibleInterval: {
        lower: differences[lowerIndex],
        upper: differences[upperIndex]
      }
    };
  }

  /**
   * Calculate statistical power and sample size requirements
   */
  private calculatePower(input: AnalysisInput): AnalysisResult['powerAnalysis'] {
    const { control, variant, confidenceLevel } = input;

    const pControl = control.conversions / control.samples;
    const pVariant = variant.conversions / variant.samples;

    if (pControl === 0 || pVariant === 0) {
      return undefined;
    }

    // Minimum detectable effect
    const mde = Math.abs(pVariant - pControl);

    // Required sample size for 80% power
    const alpha = 1 - confidenceLevel;
    const beta = 0.2; // For 80% power
    const zAlpha = this.normalQuantile(1 - alpha / 2);
    const zBeta = this.normalQuantile(1 - beta);

    const pBar = (pControl + pVariant) / 2;
    const requiredSampleSize = Math.ceil(
      2 * Math.pow(zAlpha + zBeta, 2) * pBar * (1 - pBar) / Math.pow(mde, 2)
    );

    // Current power
    const currentSampleSize = Math.min(control.samples, variant.samples);
    const se = Math.sqrt(
      pControl * (1 - pControl) / currentSampleSize +
      pVariant * (1 - pVariant) / currentSampleSize
    );

    const z = mde / se;
    const currentPower = this.normalCDF(z - zAlpha) + this.normalCDF(-z - zAlpha);

    const additionalSamplesNeeded = Math.max(0, requiredSampleSize - currentSampleSize);

    return {
      currentPower: Math.min(currentPower, 1),
      requiredPower: 0.8,
      additionalSamplesNeeded: additionalSamplesNeeded * 2 // For both variants
    };
  }

  /**
   * Normal cumulative distribution function
   */
  private normalCDF(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1 / (1 + p * z);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;

    const erf = 1 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-z * z));

    return 0.5 * (1 + sign * erf);
  }

  /**
   * Normal quantile function (inverse CDF)
   */
  private normalQuantile(p: number): number {
    // Approximation using inverse error function
    if (p === 0.5) return 0;
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;

    const a = 8 * (Math.PI - 3) / (3 * Math.PI * (4 - Math.PI));
    const x = 2 * p - 1;
    const x2 = x * x;

    const num = 2 / (Math.PI * a) + Math.log(1 - x2) / 2;
    const denom = Math.log(1 - x2) / a;

    const erfInv = Math.sign(x) * Math.sqrt(Math.sqrt(num * num - denom) - num);

    return erfInv * Math.sqrt(2);
  }

  /**
   * Sample from Beta distribution
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Using approximation for simplicity
    // For production, use a proper Beta sampling algorithm
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }

  /**
   * Sample from Gamma distribution (simplified)
   */
  private sampleGamma(shape: number): number {
    // Simplified Marsaglia and Tsang method
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      const x = this.randomNormal();
      const v = Math.pow(1 + c * x, 3);

      if (v > 0) {
        const u = Math.random();
        const x2 = x * x;

        if (u < 1 - 0.331 * x2 * x2) {
          return d * v;
        }

        if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
          return d * v;
        }
      }
    }
  }

  /**
   * Generate random normal variable (Box-Muller transform)
   */
  private randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Calculate minimum sample size needed
   */
  calculateSampleSize(
    baselineRate: number,
    minimumEffect: number,
    confidenceLevel: number = 0.95,
    power: number = 0.8
  ): number {
    const alpha = 1 - confidenceLevel;
    const beta = 1 - power;

    const zAlpha = this.normalQuantile(1 - alpha / 2);
    const zBeta = this.normalQuantile(1 - beta);

    const p1 = baselineRate;
    const p2 = baselineRate * (1 + minimumEffect);
    const pBar = (p1 + p2) / 2;

    const n = Math.ceil(
      2 * Math.pow(zAlpha + zBeta, 2) * pBar * (1 - pBar) /
      Math.pow(p2 - p1, 2)
    );

    return n;
  }

  /**
   * Check if experiment has reached early stopping criteria
   */
  shouldStopEarly(
    analysis: AnalysisResult,
    maxRelativeLoss: number = 0.2
  ): boolean {
    // Stop if variant is significantly worse
    if (analysis.significant &&
        analysis.winner === 'control' &&
        analysis.relativeImprovement < -maxRelativeLoss) {
      logger.warn('Early stopping triggered: variant significantly worse');
      return true;
    }

    // Stop if we have very high confidence in winner
    if (analysis.significant &&
        analysis.pValue < 0.001 &&
        analysis.powerAnalysis &&
        analysis.powerAnalysis.currentPower > 0.95) {
      logger.info('Early stopping triggered: very high confidence');
      return true;
    }

    return false;
  }
}

// Export singleton instance
export const statisticalAnalyzer = new StatisticalAnalyzer();