/**
 * Prior Strategy Interface
 * Provides different prior computation implementations for Bayesian optimization
 */

/**
 * Historical performance data for prior computation
 */
export interface HistoricalData {
  arms: HistoricalArmData[];
  timeRange: {
    startDate: string;
    endDate: string;
  };
  marketConditions?: {
    seasonality: number;
    competitiveness: number;
    economicFactor: number;
  };
}

/**
 * Historical data for a single arm
 */
export interface HistoricalArmData {
  id: string;
  name: string;
  category: string;
  performance: PerformanceMetrics[];
  metadata?: {
    createdAt: string;
    lastModified: string;
    tags: string[];
  };
}

/**
 * Performance metrics over time
 */
export interface PerformanceMetrics {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversionValue: number;
  qualityScore: number;
}

/**
 * Current performance data for prior updates
 */
export interface PerformanceData {
  armId: string;
  timestamp: string;
  metrics: PerformanceMetrics;
  context?: {
    experimentId?: string;
    trafficSource?: string;
    deviceType?: string;
  };
}

/**
 * Prior distribution parameters
 */
export interface PriorDistribution {
  armId: string;
  conversionRate: {
    alpha: number;
    beta: number;
    confidence: number;
  };
  conversionValue: {
    shape: number;
    rate: number;
    confidence: number;
  };
  metadata: {
    sampleSize: number;
    lastUpdated: string;
    source: 'empirical' | 'hierarchical' | 'informative' | 'noninformative';
    reliability: number;
  };
}

/**
 * Core prior strategy interface
 */
export interface PriorStrategy {
  /**
   * Compute initial priors from historical data
   */
  computePriors(arms: PriorArm[], historicalData: HistoricalData): PriorDistribution[];

  /**
   * Update priors with new performance data
   */
  updatePriors(priors: PriorDistribution[], newData: PerformanceData[]): PriorDistribution[];

  /**
   * Get strategy metadata for logging and debugging
   */
  getMetadata(): PriorStrategyMetadata;
}

/**
 * Arm information for prior computation
 */
export interface PriorArm {
  id: string;
  name: string;
  category: string;
  characteristics: {
    ageInDays: number;
    budgetTier: 'low' | 'medium' | 'high';
    targetAudience: string;
    keywords: string[];
  };
}

/**
 * Metadata for prior strategy
 */
export interface PriorStrategyMetadata {
  name: string;
  description: string;
  approach: 'empirical' | 'hierarchical' | 'informative' | 'adaptive';
  dataRequirements: 'minimal' | 'moderate' | 'extensive';
  accuracy: 'low' | 'medium' | 'high';
  adaptability: 'static' | 'moderate' | 'dynamic';
}

/**
 * Hierarchical Bayesian Priors Implementation
 * Uses empirical Bayes to share information across arms
 */
export class HierarchicalBayesPriors implements PriorStrategy {
  private readonly minSampleSize: number;
  private readonly regularizationStrength: number;

  constructor(minSampleSize: number = 100, regularizationStrength: number = 0.1) {
    this.minSampleSize = minSampleSize;
    this.regularizationStrength = regularizationStrength;
  }

  computePriors(arms: PriorArm[], historicalData: HistoricalData): PriorDistribution[] {
    // Step 1: Compute category-level hyperpriors
    const categoryHyperpriors = this.computeCategoryHyperpriors(historicalData);

    // Step 2: Compute arm-specific priors using hierarchical structure
    return arms.map(arm => this.computeArmPrior(arm, historicalData, categoryHyperpriors));
  }

  updatePriors(priors: PriorDistribution[], newData: PerformanceData[]): PriorDistribution[] {
    // Deep copy the priors to avoid mutating the originals
    const updatedPriors = new Map(priors.map(prior => [
      prior.armId,
      {
        ...prior,
        conversionRate: { ...prior.conversionRate },
        conversionValue: { ...prior.conversionValue },
        metadata: { ...prior.metadata }
      }
    ]));

    for (const data of newData) {
      const prior = updatedPriors.get(data.armId);
      if (!prior) continue;

      // Bayesian update for conversion rate (Beta-Binomial)
      if (data.metrics.clicks > 0) {
        prior.conversionRate.alpha += data.metrics.conversions;
        prior.conversionRate.beta += data.metrics.clicks - data.metrics.conversions;
      }

      // Bayesian update for conversion value (Gamma)
      if (data.metrics.conversions > 0) {
        const avgValue = data.metrics.conversionValue / data.metrics.conversions;
        prior.conversionValue.shape += data.metrics.conversions;
        prior.conversionValue.rate += data.metrics.conversions / avgValue;
      }

      // Update metadata
      prior.metadata.sampleSize += data.metrics.clicks;
      prior.metadata.lastUpdated = data.timestamp;
      prior.metadata.reliability = this.calculateReliability(prior.metadata.sampleSize);
    }

    return Array.from(updatedPriors.values());
  }

  getMetadata(): PriorStrategyMetadata {
    return {
      name: 'Hierarchical Bayesian Priors',
      description: 'Empirical Bayes approach sharing information across similar arms',
      approach: 'hierarchical',
      dataRequirements: 'moderate',
      accuracy: 'high',
      adaptability: 'dynamic'
    };
  }

  private computeCategoryHyperpriors(historicalData: HistoricalData): Map<string, CategoryHyperprior> {
    const categoryStats = new Map<string, CategoryStatistics>();

    // Aggregate statistics by category
    for (const arm of historicalData.arms) {
      if (!categoryStats.has(arm.category)) {
        categoryStats.set(arm.category, {
          totalClicks: 0,
          totalConversions: 0,
          totalValue: 0,
          armCount: 0,
          conversionRates: [],
          avgValues: []
        });
      }

      const stats = categoryStats.get(arm.category)!;
      stats.armCount++;

      for (const perf of arm.performance) {
        stats.totalClicks += perf.clicks;
        stats.totalConversions += perf.conversions;
        stats.totalValue += perf.conversionValue;

        if (perf.clicks > 0) {
          stats.conversionRates.push(perf.conversions / perf.clicks);
        }
        if (perf.conversions > 0) {
          stats.avgValues.push(perf.conversionValue / perf.conversions);
        }
      }
    }

    // Compute hyperpriors using method of moments
    const hyperpriors = new Map<string, CategoryHyperprior>();

    for (const [category, stats] of categoryStats) {
      const overallCR = stats.totalConversions / Math.max(1, stats.totalClicks);
      const crVariance = this.calculateVariance(stats.conversionRates);

      // Beta hyperprior for conversion rate
      const crMean = overallCR;
      const crVar = Math.max(crVariance, 0.0001); // Minimum variance for stability

      const alpha0 = crMean * (crMean * (1 - crMean) / crVar - 1);
      const beta0 = (1 - crMean) * (crMean * (1 - crMean) / crVar - 1);

      // Gamma hyperprior for conversion value
      const avgValue = stats.totalValue / Math.max(1, stats.totalConversions);
      const valueVariance = this.calculateVariance(stats.avgValues);

      const shape0 = Math.max(1, avgValue * avgValue / Math.max(valueVariance, 1));
      const rate0 = Math.max(0.1, avgValue / Math.max(valueVariance, 1));

      hyperpriors.set(category, {
        conversionRate: { alpha: Math.max(1, alpha0), beta: Math.max(1, beta0) },
        conversionValue: { shape: shape0, rate: rate0 },
        sampleSize: stats.totalClicks,
        reliability: this.calculateReliability(stats.totalClicks)
      });
    }

    return hyperpriors;
  }

  private computeArmPrior(
    arm: PriorArm,
    historicalData: HistoricalData,
    categoryHyperpriors: Map<string, CategoryHyperprior>
  ): PriorDistribution {
    const armData = historicalData.arms.find(a => a.id === arm.id);
    const categoryHyperprior = categoryHyperpriors.get(arm.category);

    if (!armData || !categoryHyperprior) {
      // Use weak informative prior for new arms
      return this.createWeakInformativePrior(arm, categoryHyperprior);
    }

    // Aggregate arm performance
    let totalClicks = 0;
    let totalConversions = 0;
    let totalValue = 0;

    for (const perf of armData.performance) {
      totalClicks += perf.clicks;
      totalConversions += perf.conversions;
      totalValue += perf.conversionValue;
    }

    // Hierarchical prior combines arm data with category hyperprior
    const shrinkageFactor = this.calculateShrinkageFactor(totalClicks, categoryHyperprior.sampleSize);

    const armCR = totalConversions / Math.max(1, totalClicks);
    const categoryCR = categoryHyperprior.conversionRate.alpha /
                       (categoryHyperprior.conversionRate.alpha + categoryHyperprior.conversionRate.beta);

    const posteriorCR = shrinkageFactor * categoryCR + (1 - shrinkageFactor) * armCR;

    // Compute posterior parameters
    const effectiveSampleSize = totalClicks + categoryHyperprior.sampleSize * this.regularizationStrength;
    const alpha = posteriorCR * effectiveSampleSize + categoryHyperprior.conversionRate.alpha;
    const beta = (1 - posteriorCR) * effectiveSampleSize + categoryHyperprior.conversionRate.beta;

    // Similar computation for conversion value
    const armAvgValue = totalValue / Math.max(1, totalConversions);
    const categoryAvgValue = categoryHyperprior.conversionValue.shape / categoryHyperprior.conversionValue.rate;
    const posteriorAvgValue = shrinkageFactor * categoryAvgValue + (1 - shrinkageFactor) * armAvgValue;

    const shape = totalConversions + categoryHyperprior.conversionValue.shape;
    const rate = totalConversions / posteriorAvgValue + categoryHyperprior.conversionValue.rate;

    return {
      armId: arm.id,
      conversionRate: {
        alpha: Math.max(1, alpha),
        beta: Math.max(1, beta),
        confidence: this.calculateConfidence(totalClicks)
      },
      conversionValue: {
        shape: Math.max(1, shape),
        rate: Math.max(0.1, rate),
        confidence: this.calculateConfidence(totalConversions)
      },
      metadata: {
        sampleSize: totalClicks,
        lastUpdated: new Date().toISOString(),
        source: 'hierarchical',
        reliability: this.calculateReliability(totalClicks)
      }
    };
  }

  private createWeakInformativePrior(arm: PriorArm, categoryHyperprior?: CategoryHyperprior): PriorDistribution {
    if (categoryHyperprior) {
      return {
        armId: arm.id,
        conversionRate: {
          alpha: categoryHyperprior.conversionRate.alpha,
          beta: categoryHyperprior.conversionRate.beta,
          confidence: 0.1
        },
        conversionValue: {
          shape: categoryHyperprior.conversionValue.shape,
          rate: categoryHyperprior.conversionValue.rate,
          confidence: 0.1
        },
        metadata: {
          sampleSize: 0,
          lastUpdated: new Date().toISOString(),
          source: 'hierarchical',
          reliability: 0.1
        }
      };
    }

    // Default weak prior
    return {
      armId: arm.id,
      conversionRate: { alpha: 1, beta: 19, confidence: 0.05 }, // ~5% conversion rate
      conversionValue: { shape: 2, rate: 0.02, confidence: 0.05 }, // ~$100 average value
      metadata: {
        sampleSize: 0,
        lastUpdated: new Date().toISOString(),
        source: 'informative',
        reliability: 0.05
      }
    };
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0.01; // Default variance

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
    return variance;
  }

  private calculateShrinkageFactor(armSampleSize: number, categorySampleSize: number): number {
    const totalSample = armSampleSize + categorySampleSize;
    return categorySampleSize / totalSample;
  }

  private calculateConfidence(sampleSize: number): number {
    return Math.min(0.95, sampleSize / (sampleSize + 100));
  }

  private calculateReliability(sampleSize: number): number {
    return Math.min(1.0, Math.log(sampleSize + 1) / Math.log(1000));
  }
}

/**
 * Category-level hyperprior parameters
 */
interface CategoryHyperprior {
  conversionRate: { alpha: number; beta: number };
  conversionValue: { shape: number; rate: number };
  sampleSize: number;
  reliability: number;
}

/**
 * Category statistics for hyperprior computation
 */
interface CategoryStatistics {
  totalClicks: number;
  totalConversions: number;
  totalValue: number;
  armCount: number;
  conversionRates: number[];
  avgValues: number[];
}

/**
 * Informative Priors Implementation
 * Uses domain-specific knowledge and expert judgment
 */
export class InformativePriors implements PriorStrategy {
  private readonly domainKnowledge: Map<string, DomainPrior>;

  constructor(domainKnowledge?: Map<string, DomainPrior>) {
    this.domainKnowledge = domainKnowledge || this.getDefaultDomainKnowledge();
  }

  computePriors(arms: PriorArm[], historicalData: HistoricalData): PriorDistribution[] {
    return arms.map(arm => this.computeInformativePrior(arm, historicalData));
  }

  updatePriors(priors: PriorDistribution[], newData: PerformanceData[]): PriorDistribution[] {
    // Similar to hierarchical but with stronger reliance on domain knowledge
    return priors.map(prior => {
      const relevantData = newData.filter(d => d.armId === prior.armId);
      if (relevantData.length === 0) return prior;

      const updated = { ...prior };
      const domainPrior = this.domainKnowledge.get(prior.armId);
      const trustFactor = domainPrior?.trust || 0.5;

      for (const data of relevantData) {
        // Weighted update based on domain knowledge trust
        const dataWeight = (1 - trustFactor) * this.getDataWeight(data.metrics.clicks);
        const priorWeight = trustFactor;

        if (data.metrics.clicks > 0) {
          updated.conversionRate.alpha += dataWeight * data.metrics.conversions;
          updated.conversionRate.beta += dataWeight * (data.metrics.clicks - data.metrics.conversions);
        }

        if (data.metrics.conversions > 0) {
          const avgValue = data.metrics.conversionValue / data.metrics.conversions;
          updated.conversionValue.shape += dataWeight * data.metrics.conversions;
          updated.conversionValue.rate += dataWeight * data.metrics.conversions / avgValue;
        }

        updated.metadata.sampleSize += data.metrics.clicks;
        updated.metadata.lastUpdated = data.timestamp;
      }

      return updated;
    });
  }

  getMetadata(): PriorStrategyMetadata {
    return {
      name: 'Informative Domain Priors',
      description: 'Domain-specific knowledge and expert judgment based priors',
      approach: 'informative',
      dataRequirements: 'minimal',
      accuracy: 'medium',
      adaptability: 'moderate'
    };
  }

  private computeInformativePrior(arm: PriorArm, historicalData: HistoricalData): PriorDistribution {
    const domainPrior = this.domainKnowledge.get(arm.category) || this.getDefaultPrior(arm);

    // Adjust based on arm characteristics
    const budgetMultiplier = arm.characteristics.budgetTier === 'high' ? 1.2 :
                            arm.characteristics.budgetTier === 'low' ? 0.8 : 1.0;

    const ageMultiplier = Math.min(1.5, 1 + arm.characteristics.ageInDays / 365);

    const adjustedCR = domainPrior.conversionRate * budgetMultiplier * ageMultiplier;
    const adjustedValue = domainPrior.avgValue * budgetMultiplier;

    // Convert to Beta/Gamma parameters
    const crVariance = domainPrior.conversionRateVariance;
    const alpha = adjustedCR * (adjustedCR * (1 - adjustedCR) / crVariance - 1);
    const beta = (1 - adjustedCR) * (adjustedCR * (1 - adjustedCR) / crVariance - 1);

    const valueVariance = domainPrior.avgValueVariance;
    const shape = adjustedValue * adjustedValue / valueVariance;
    const rate = adjustedValue / valueVariance;

    return {
      armId: arm.id,
      conversionRate: {
        alpha: Math.max(1, alpha),
        beta: Math.max(1, beta),
        confidence: domainPrior.confidence
      },
      conversionValue: {
        shape: Math.max(1, shape),
        rate: Math.max(0.1, rate),
        confidence: domainPrior.confidence
      },
      metadata: {
        sampleSize: Math.round(domainPrior.effectiveSampleSize),
        lastUpdated: new Date().toISOString(),
        source: 'informative',
        reliability: domainPrior.trust
      }
    };
  }

  private getDefaultDomainKnowledge(): Map<string, DomainPrior> {
    return new Map([
      ['search_ads', {
        conversionRate: 0.05,
        conversionRateVariance: 0.001,
        avgValue: 150,
        avgValueVariance: 2500,
        confidence: 0.7,
        trust: 0.8,
        effectiveSampleSize: 200
      }],
      ['display_ads', {
        conversionRate: 0.02,
        conversionRateVariance: 0.0005,
        avgValue: 100,
        avgValueVariance: 1600,
        confidence: 0.6,
        trust: 0.7,
        effectiveSampleSize: 150
      }],
      ['shopping_ads', {
        conversionRate: 0.08,
        conversionRateVariance: 0.002,
        avgValue: 200,
        avgValueVariance: 4900,
        confidence: 0.8,
        trust: 0.9,
        effectiveSampleSize: 300
      }]
    ]);
  }

  private getDefaultPrior(arm: PriorArm): DomainPrior {
    return {
      conversionRate: 0.03,
      conversionRateVariance: 0.001,
      avgValue: 120,
      avgValueVariance: 2000,
      confidence: 0.5,
      trust: 0.5,
      effectiveSampleSize: 100
    };
  }

  private getDataWeight(sampleSize: number): number {
    return Math.min(1.0, sampleSize / 1000);
  }
}

/**
 * Domain knowledge for informative priors
 */
interface DomainPrior {
  conversionRate: number;
  conversionRateVariance: number;
  avgValue: number;
  avgValueVariance: number;
  confidence: number;
  trust: number;
  effectiveSampleSize: number;
}