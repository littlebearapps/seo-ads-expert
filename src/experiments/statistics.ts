/**
 * Statistical Analysis Engine
 * Provides statistical tests for A/B experiment analysis
 */

import { logger } from '../utils/logger.js';

export interface MetricData {
  successes: number;    // clicks, conversions, etc.
  trials: number;       // impressions, visitors, etc.
  rate?: number;        // calculated rate (successes/trials)
}

export interface ExperimentResults {
  control: MetricData;
  variant: MetricData;
  metric: string;
  startDate: Date;
  endDate: Date;
}

export interface StatisticalTestResult {
  pValue: number;
  significant: boolean;
  uplift: number;              // percentage change
  absoluteUplift: number;      // absolute difference in rates
  confidenceInterval: [number, number];
  sampleSizeAdequate: boolean;
  recommendation: 'winner' | 'loser' | 'continue' | 'stop_futility';
  metadata: {
    testType: string;
    confidenceLevel: number;
    power: number;
    effect: 'small' | 'medium' | 'large';
  };
}

export interface BayesianResult {
  probabilityVariantBetter: number;
  expectedLift: number;
  credibleInterval: [number, number];
  recommendation: 'winner' | 'loser' | 'continue';
  metadata: {
    alpha: number;
    beta: number;
    posterior: 'uniform' | 'informative';
  };
}

export interface PowerAnalysisResult {
  currentPower: number;
  samplesNeeded: number;
  estimatedDaysRemaining: number;
  recommendation: 'continue' | 'extend' | 'stop_underpowered';
}

export interface EarlyStoppingResult {
  stop: boolean;
  reason?: 'futility' | 'success' | 'harm' | 'sample_size';
  confidence: number;
  recommendation: string;
}

export class StatisticalAnalyzer {
  private defaultConfidenceLevel = 0.95;
  private defaultPower = 0.8;
  private futilityThreshold = 0.01; // Minimum meaningful effect

  /**
   * Two-proportion z-test for comparing rates (CTR, CVR)
   */
  twoProportionTest(
    control: MetricData,
    variant: MetricData,
    confidenceLevel: number = this.defaultConfidenceLevel
  ): StatisticalTestResult {
    logger.info('📊 Running two-proportion z-test');

    // Calculate rates
    const p1 = control.successes / control.trials;
    const p2 = variant.successes / variant.trials;
    
    // Pooled proportion
    const pooledP = (control.successes + variant.successes) / (control.trials + variant.trials);
    
    // Standard error
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/control.trials + 1/variant.trials));
    
    // Z-score
    const zScore = (p2 - p1) / se;
    
    // P-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    // Effect size
    const uplift = ((p2 - p1) / p1) * 100;
    const absoluteUplift = p2 - p1;
    
    // Confidence interval for difference
    const alpha = 1 - confidenceLevel;
    const zCritical = this.normalInverse(1 - alpha/2);
    const seEffect = Math.sqrt(p1*(1-p1)/control.trials + p2*(1-p2)/variant.trials);
    const marginOfError = zCritical * seEffect;
    const confidenceInterval: [number, number] = [
      (absoluteUplift - marginOfError) * 100,
      (absoluteUplift + marginOfError) * 100
    ];
    
    const significant = pValue < (1 - confidenceLevel);
    
    // Sample size adequacy check
    const minSampleSize = this.calculateMinimumSampleSize(p1, 0.1, this.defaultPower, 1 - confidenceLevel);
    const sampleSizeAdequate = Math.min(control.trials, variant.trials) >= minSampleSize;
    
    // Effect size classification
    const effectSize = Math.abs(uplift);
    const effect = effectSize < 5 ? 'small' : effectSize < 20 ? 'medium' : 'large';
    
    // Recommendation
    let recommendation: StatisticalTestResult['recommendation'];
    if (!sampleSizeAdequate) {
      recommendation = 'continue';
    } else if (significant && uplift > 0) {
      recommendation = 'winner';
    } else if (significant && uplift < 0) {
      recommendation = 'loser';
    } else if (Math.abs(uplift) < this.futilityThreshold * 100) {
      recommendation = 'stop_futility';
    } else {
      recommendation = 'continue';
    }
    
    // Estimate power
    const actualEffect = Math.abs(p2 - p1);
    const currentPower = this.calculatePower(p1, actualEffect, control.trials, 1 - confidenceLevel);
    
    return {
      pValue,
      significant,
      uplift,
      absoluteUplift,
      confidenceInterval,
      sampleSizeAdequate,
      recommendation,
      metadata: {
        testType: 'two_proportion_z_test',
        confidenceLevel,
        power: currentPower,
        effect
      }
    };
  }

  /**
   * Bayesian A/B testing with Beta-Binomial model
   */
  bayesianAB(
    control: MetricData,
    variant: MetricData,
    priorAlpha: number = 1, // Uniform prior
    priorBeta: number = 1
  ): BayesianResult {
    logger.info('🎲 Running Bayesian A/B analysis');

    // Posterior parameters
    const controlAlpha = priorAlpha + control.successes;
    const controlBeta = priorBeta + control.trials - control.successes;
    const variantAlpha = priorAlpha + variant.successes;
    const variantBeta = priorBeta + variant.trials - variant.successes;
    
    // Monte Carlo simulation to estimate P(variant > control)
    const samples = 10000;
    let variantBetterCount = 0;
    const liftSamples: number[] = [];
    
    for (let i = 0; i < samples; i++) {
      const controlSample = this.betaRandom(controlAlpha, controlBeta);
      const variantSample = this.betaRandom(variantAlpha, variantBeta);
      
      if (variantSample > controlSample) {
        variantBetterCount++;
      }
      
      const lift = ((variantSample - controlSample) / controlSample) * 100;
      liftSamples.push(lift);
    }
    
    const probabilityVariantBetter = variantBetterCount / samples;
    const expectedLift = liftSamples.reduce((sum, lift) => sum + lift, 0) / samples;
    
    // Credible interval (95%)
    liftSamples.sort((a, b) => a - b);
    const credibleInterval: [number, number] = [
      liftSamples[Math.floor(samples * 0.025)],
      liftSamples[Math.floor(samples * 0.975)]
    ];
    
    // Recommendation based on probability
    let recommendation: BayesianResult['recommendation'];
    if (probabilityVariantBetter > 0.95) {
      recommendation = 'winner';
    } else if (probabilityVariantBetter < 0.05) {
      recommendation = 'loser';
    } else {
      recommendation = 'continue';
    }
    
    const posteriorType = (priorAlpha === 1 && priorBeta === 1) ? 'uniform' : 'informative';
    
    return {
      probabilityVariantBetter,
      expectedLift,
      credibleInterval,
      recommendation,
      metadata: {
        alpha: variantAlpha,
        beta: variantBeta,
        posterior: posteriorType
      }
    };
  }

  /**
   * Calculate required sample size for detecting effect
   */
  calculateSampleSize(
    baselineRate: number,
    minimumDetectableEffect: number, // relative change (e.g., 0.1 for 10%)
    power: number = this.defaultPower,
    significance: number = 0.05
  ): number {
    const p1 = baselineRate;
    const p2 = baselineRate * (1 + minimumDetectableEffect);
    
    const zAlpha = this.normalInverse(1 - significance/2);
    const zBeta = this.normalInverse(power);
    
    const numerator = Math.pow(zAlpha * Math.sqrt(2 * p1 * (1 - p1)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
    const denominator = Math.pow(p2 - p1, 2);
    
    return Math.ceil(numerator / denominator);
  }

  /**
   * Early stopping analysis
   */
  shouldStopEarly(
    control: MetricData,
    variant: MetricData,
    targetConfidence: number = 0.95,
    minimumEffect: number = 0.05 // 5%
  ): EarlyStoppingResult {
    logger.info('🔍 Checking early stopping conditions');

    const testResult = this.twoProportionTest(control, variant, targetConfidence);
    
    // Check for sufficient evidence of success
    if (testResult.significant && testResult.uplift > minimumEffect * 100) {
      return {
        stop: true,
        reason: 'success',
        confidence: 1 - testResult.pValue,
        recommendation: 'Deploy winning variant'
      };
    }
    
    // Check for evidence of harm (significant negative effect)
    if (testResult.significant && testResult.uplift < -minimumEffect * 100) {
      return {
        stop: true,
        reason: 'harm',
        confidence: 1 - testResult.pValue,
        recommendation: 'Stop test immediately, revert to control'
      };
    }
    
    // Check for futility (very small effect unlikely to become significant)
    const bayesianResult = this.bayesianAB(control, variant);
    if (Math.abs(bayesianResult.expectedLift) < minimumEffect * 100 && 
        bayesianResult.probabilityVariantBetter > 0.3 && 
        bayesianResult.probabilityVariantBetter < 0.7) {
      return {
        stop: true,
        reason: 'futility',
        confidence: Math.max(bayesianResult.probabilityVariantBetter, 1 - bayesianResult.probabilityVariantBetter),
        recommendation: 'Stop test, no meaningful difference detected'
      };
    }
    
    // Check sample size
    const totalSamples = control.trials + variant.trials;
    const maxRecommendedSamples = this.calculateSampleSize(
      control.successes / control.trials, 
      minimumEffect, 
      this.defaultPower, 
      1 - targetConfidence
    ) * 4; // 4x for safety margin
    
    if (totalSamples > maxRecommendedSamples) {
      return {
        stop: true,
        reason: 'sample_size',
        confidence: 0.5,
        recommendation: 'Sample size exceeded, make decision based on current data'
      };
    }
    
    return {
      stop: false,
      confidence: Math.max(bayesianResult.probabilityVariantBetter, 1 - bayesianResult.probabilityVariantBetter),
      recommendation: 'Continue test'
    };
  }

  /**
   * Calculate statistical power for given parameters
   */
  private calculatePower(
    baselineRate: number,
    effect: number, // absolute difference
    sampleSize: number,
    alpha: number
  ): number {
    const p1 = baselineRate;
    const p2 = baselineRate + effect;
    
    const pooledP = (p1 + p2) / 2;
    const se = Math.sqrt(2 * pooledP * (1 - pooledP) / sampleSize);
    const seEffect = Math.sqrt(p1 * (1 - p1) / sampleSize + p2 * (1 - p2) / sampleSize);
    
    const zAlpha = this.normalInverse(1 - alpha/2);
    const criticalValue = zAlpha * se;
    
    const zBeta = (Math.abs(effect) - criticalValue) / seEffect;
    
    return this.normalCDF(zBeta);
  }

  /**
   * Helper method to calculate minimum sample size
   */
  private calculateMinimumSampleSize(
    baselineRate: number,
    minimumDetectableEffect: number,
    power: number,
    alpha: number
  ): number {
    return this.calculateSampleSize(baselineRate, minimumDetectableEffect, power, alpha);
  }

  /**
   * Statistical utility functions
   */
  private normalCDF(x: number): number {
    // Approximation of normal CDF using error function
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x) / Math.sqrt(2);
    
    // Abramowitz and Stegun approximation
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }

  private normalInverse(p: number): number {
    // Beasley-Springer-Moro algorithm
    const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [0, -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [0, 7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    
    if (p <= 0 || p >= 1) {
      throw new Error('Probability must be between 0 and 1');
    }
    
    if (p < 0.5) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[1] * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6]) /
             ((((d[1] * q + d[2]) * q + d[3]) * q + d[4]) * q + 1);
    } else {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[1] * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) * q + c[6]) /
              ((((d[1] * q + d[2]) * q + d[3]) * q + d[4]) * q + 1);
    }
  }

  private betaRandom(alpha: number, beta: number): number {
    // Generate Beta-distributed random number using Gamma method
    const x = this.gammaRandom(alpha);
    const y = this.gammaRandom(beta);
    return x / (x + y);
  }

  private gammaRandom(shape: number): number {
    // Marsaglia and Tsang's method for Gamma distribution
    if (shape < 1) {
      return this.gammaRandom(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x, v;
      do {
        x = this.normalRandom();
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = Math.random();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  private normalRandom(): number {
    // Box-Muller transformation
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/**
 * Power Analysis Class
 */
export class PowerAnalyzer {
  constructor(private statisticalAnalyzer: StatisticalAnalyzer) {}

  /**
   * Pre-experiment power analysis
   */
  async planExperiment(
    baselineRate: number,
    desiredLift: number,
    confidenceLevel: number = 0.95,
    power: number = 0.8
  ): Promise<{
    sampleSizePerVariant: number;
    totalSampleSize: number;
    estimatedDuration: string;
    recommendations: string[];
  }> {
    logger.info('📋 Planning experiment with power analysis');

    const sampleSizePerVariant = this.statisticalAnalyzer.calculateSampleSize(
      baselineRate,
      desiredLift,
      power,
      1 - confidenceLevel
    );
    
    const totalSampleSize = sampleSizePerVariant * 2;
    
    // Estimate duration based on typical traffic
    const dailyTraffic = this.estimateDailyTraffic(baselineRate);
    const estimatedDays = Math.ceil(totalSampleSize / dailyTraffic);
    const estimatedDuration = `${estimatedDays} days`;
    
    const recommendations = [
      `Target sample size: ${sampleSizePerVariant.toLocaleString()} per variant`,
      `Expected duration: ${estimatedDuration}`,
      `Minimum detectable effect: ${(desiredLift * 100).toFixed(1)}%`,
      power < 0.8 ? 'Consider increasing sample size for better power' : 'Power analysis looks good'
    ];
    
    return {
      sampleSizePerVariant,
      totalSampleSize,
      estimatedDuration,
      recommendations
    };
  }

  /**
   * Runtime power check
   */
  checkStatisticalPower(
    control: MetricData,
    variant: MetricData,
    targetPower: number = 0.8
  ): PowerAnalysisResult {
    const controlRate = control.successes / control.trials;
    const variantRate = variant.successes / variant.trials;
    const observedEffect = Math.abs(variantRate - controlRate);
    
    const currentPower = this.statisticalAnalyzer['calculatePower'](
      controlRate,
      observedEffect,
      Math.min(control.trials, variant.trials),
      0.05
    );
    
    const samplesNeeded = this.statisticalAnalyzer.calculateSampleSize(
      controlRate,
      observedEffect / controlRate,
      targetPower,
      0.05
    );
    
    const currentSamples = Math.min(control.trials, variant.trials);
    const additionalSamplesNeeded = Math.max(0, samplesNeeded - currentSamples);
    
    const dailyTraffic = this.estimateDailyTraffic(controlRate);
    const estimatedDaysRemaining = Math.ceil(additionalSamplesNeeded / dailyTraffic * 2);
    
    let recommendation: PowerAnalysisResult['recommendation'];
    if (currentPower >= targetPower) {
      recommendation = 'continue';
    } else if (estimatedDaysRemaining <= 14) {
      recommendation = 'extend';
    } else {
      recommendation = 'stop_underpowered';
    }
    
    return {
      currentPower,
      samplesNeeded: additionalSamplesNeeded,
      estimatedDaysRemaining,
      recommendation
    };
  }

  private estimateDailyTraffic(baselineRate: number): number {
    // Rough estimate based on typical Chrome extension traffic
    // This would ideally come from historical data
    const typicalDailyImpressions = 1000;
    return typicalDailyImpressions * baselineRate;
  }
}

// Export instances
export const statisticalAnalyzer = new StatisticalAnalyzer();
export const powerAnalyzer = new PowerAnalyzer(statisticalAnalyzer);