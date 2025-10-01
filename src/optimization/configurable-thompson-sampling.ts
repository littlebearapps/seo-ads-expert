/**
 * Configurable Thompson Sampling Optimizer
 * Uses dependency injection with strategy patterns for maximum flexibility
 */

import { ThompsonSamplingOptimizer, Arm, BudgetConstraints, AllocationResult, BayesianPosterior } from './thompson-sampling.js';
import { SamplingStrategy } from './strategies/sampling-strategy.js';
import { ConstraintStrategy, ConstraintArm } from './strategies/constraint-strategy.js';
import { PriorStrategy, PriorArm, HistoricalData, PerformanceData, PriorDistribution } from './strategies/prior-strategy.js';
import { OptimizationResult } from './types.js';

/**
 * Configuration for the configurable Thompson Sampling optimizer
 */
export interface ConfigurableThompsonSamplingConfig {
  explorationFloor: number;
  maxIterations: number;
  convergenceThreshold: number;
  enableLogging: boolean;
  randomSeed?: number;

  // Strategy-specific configurations
  samplingConfig?: Record<string, unknown>;
  constraintConfig?: Record<string, unknown>;
  priorConfig?: Record<string, unknown>;
}

/**
 * Optimization context for enhanced decision making
 */
export interface OptimizationContext {
  experimentId?: string;
  timestamp: string;
  marketConditions?: {
    seasonality: number;
    competitiveness: number;
    economicFactor: number;
  };
  objectives?: {
    primary: 'revenue' | 'conversions' | 'efficiency';
    secondary?: string[];
    constraints?: string[];
  };
}

/**
 * Enhanced optimization result with strategy metadata
 */
export interface ConfigurableOptimizationResult extends OptimizationResult {
  strategyMetadata: {
    sampling: string;
    constraint: string;
    prior: string;
  };
  context?: OptimizationContext;
  diagnostics: {
    convergenceIterations: number;
    finalObjectiveValue: number;
    constraintViolations: number;
    strategyPerformance: {
      samplingAccuracy: number;
      constraintEfficiency: number;
      priorReliability: number;
    };
  };
}

/**
 * Configurable Thompson Sampling Optimizer with Strategy Injection
 *
 * This implementation uses the Strategy pattern to allow different algorithms
 * for sampling, constraint application, and prior computation while maintaining
 * a consistent interface and preserving the core Thompson Sampling logic.
 */
export class ConfigurableThompsonSampling {
  private readonly samplingStrategy: SamplingStrategy;
  private readonly constraintStrategy: ConstraintStrategy;
  private readonly priorStrategy: PriorStrategy;
  private readonly config: ConfigurableThompsonSamplingConfig;

  private cachedPriors: Map<string, PriorDistribution> = new Map();
  private performanceHistory: PerformanceData[] = [];
  protected arms: Arm[] | undefined;

  private optimizer: ThompsonSamplingOptimizer;

  constructor(
    samplingStrategy: SamplingStrategy,
    constraintStrategy: ConstraintStrategy,
    priorStrategy: PriorStrategy,
    config: ConfigurableThompsonSamplingConfig
  ) {
    this.optimizer = new ThompsonSamplingOptimizer();

    this.samplingStrategy = samplingStrategy;
    this.constraintStrategy = constraintStrategy;
    this.priorStrategy = priorStrategy;
    this.config = config;
  }

  /**
   * Enhanced budget allocation with strategy injection and context awareness
   */
  async allocateBudget(
    totalBudget: number,
    arms: Arm[],
    constraints: BudgetConstraints,
    context?: OptimizationContext
  ): Promise<ConfigurableOptimizationResult> {
    const startTime = performance.now();
    let convergenceIterations = 0;
    let constraintViolations = 0;

    // Check for empty arms array
    if (!arms || arms.length === 0) {
      return {
        success: false,
        allocations: [],
        totalAllocated: 0,
        reasoning: 'No arms provided for allocation',
        metadata: {
          optimizationTime: performance.now() - startTime,
          error: 'Empty arms array'
        },
        strategyMetadata: {
          sampling: this.samplingStrategy.getMetadata().name,
          constraint: this.constraintStrategy.getMetadata().name,
          prior: this.priorStrategy.getMetadata().name
        },
        context,
        diagnostics: {
          convergenceIterations: 0,
          finalObjectiveValue: 0,
          constraintViolations: 0,
          strategyPerformance: {
            samplingAccuracy: 0,
            constraintEfficiency: 0,
            priorReliability: 0
          }
        }
      };
    }

    // Store arms for use in normalizeAllocations
    this.arms = arms;

    try {
      // Step 1: Validate constraints using injected strategy
      const constraintArms = this.convertToConstraintArms(arms);
      const validation = this.constraintStrategy.validateConstraints(constraints, constraintArms);

      // Debug logging
      if (constraints.minDailyBudget === 100) {
        console.log('Validation result:', validation);
      }

      if (!validation || !validation.valid) {
        const message = validation?.violations?.map(v => v.message).join(', ') || 'Invalid constraints';
        throw new Error(`Constraint validation failed: ${message}`);
      }

      constraintViolations = validation.violations?.length || 0;

      // Step 2: Update priors with recent performance data
      await this.updatePriorsFromHistory(arms);

      // Step 3: Perform Thompson Sampling optimization
      const baseResult = this.allocateBudgetInternal(totalBudget, arms, constraints);
      convergenceIterations = baseResult.metadata.iterations || 0;

      // Step 4: Apply advanced constraint handling
      const enhancedAllocations = this.constraintStrategy.applyConstraints(
        baseResult.allocations.map(a => a.proposedDailyBudget),
        constraints,
        constraintArms
      );

      // Step 5: Generate enhanced results with strategy metadata
      const finalAllocations: AllocationResult[] = enhancedAllocations.map((amount, index) => ({
        armId: arms[index].id,
        armName: arms[index].name,
        currentDailyBudget: arms[index].currentDailyBudget || 0,
        proposedDailyBudget: amount,
        expectedImprovement: this.calculateExpectedImprovement(arms[index], amount),
        confidenceInterval: this.calculateConfidenceInterval(arms[index], amount),
        reasoning: this.generateAllocationReasoning(arms[index], amount, baseResult.allocations[index]),
        thompsonScore: baseResult.allocations[index]?.thompsonScore || 0,
        explorationBonus: baseResult.allocations[index]?.explorationBonus || 0,
        percentage: baseResult.totalAllocated > 0 ? amount / baseResult.totalAllocated : 0,
        confidenceScore: this.calculateConfidenceScore(arms[index], amount)
      }));

      const endTime = performance.now();

      return {
        success: true,
        allocations: finalAllocations,
        totalAllocated: enhancedAllocations.reduce((sum, a) => sum + a, 0),
        reasoning: this.generateEnhancedReasoning(arms, finalAllocations, context),
        metadata: {
          ...baseResult.metadata,
          optimizationTime: endTime - startTime,
          iterations: convergenceIterations,
          strategyInfo: {
            sampling: this.samplingStrategy.getMetadata().name,
            constraint: this.constraintStrategy.getMetadata().name,
            prior: this.priorStrategy.getMetadata().name
          }
        },
        strategyMetadata: {
          sampling: this.samplingStrategy.getMetadata().name,
          constraint: this.constraintStrategy.getMetadata().name,
          prior: this.priorStrategy.getMetadata().name
        },
        context,
        diagnostics: {
          convergenceIterations,
          finalObjectiveValue: this.calculateTotalExpectedValue(arms, finalAllocations),
          constraintViolations,
          strategyPerformance: {
            samplingAccuracy: this.evaluateSamplingAccuracy(),
            constraintEfficiency: this.evaluateConstraintEfficiency(validation?.warnings?.length || 0),
            priorReliability: this.evaluatePriorReliability(arms)
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        allocations: [],
        totalAllocated: 0,
        reasoning: `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          optimizationTime: performance.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        strategyMetadata: {
          sampling: this.samplingStrategy.getMetadata().name,
          constraint: this.constraintStrategy.getMetadata().name,
          prior: this.priorStrategy.getMetadata().name
        },
        context,
        diagnostics: {
          convergenceIterations,
          finalObjectiveValue: 0,
          constraintViolations,
          strategyPerformance: {
            samplingAccuracy: 0,
            constraintEfficiency: 0,
            priorReliability: 0
          }
        }
      };
    }
  }

  /**
   * Internal method to perform base Thompson Sampling allocation
   */
  private allocateBudgetInternal(
    totalBudget: number,
    arms: Arm[],
    constraints: BudgetConstraints
  ): OptimizationResult {
    try {
      const result = this.optimizer.allocateBudget(arms, totalBudget, constraints);

      // Apply constraint strategy to adjust allocations while preserving total budget
      const rawAllocations = result.map(a => a.proposedDailyBudget);
      const constraintArms = this.convertToConstraintArms(arms);

      // Create constraints that preserve the requested total budget
      const adjustedConstraints = {
        ...constraints,
        totalBudget: totalBudget
      };

      const enhancedAllocations = this.constraintStrategy.applyConstraints(
        rawAllocations,
        adjustedConstraints,
        constraintArms
      );

      // Update result with enhanced allocations
      const totalAllocated = enhancedAllocations.reduce((sum, a) => sum + a, 0);
      const enhancedResult = result.map((allocation, index) => ({
        ...allocation,
        proposedDailyBudget: enhancedAllocations[index],
        percentage: totalAllocated > 0 ? enhancedAllocations[index] / totalAllocated : 0,
        confidenceScore: this.calculateConfidenceScore(arms[index], enhancedAllocations[index])
      }));

      return {
        success: true,
        allocations: enhancedResult,
        totalAllocated: totalAllocated,
        reasoning: this.generateReasoning(arms, enhancedResult, this.config.explorationFloor),
        metadata: {
          optimizationTime: 0,
          iterations: 0
        }
      };
    } catch (error) {
      return {
        success: false,
        allocations: [],
        totalAllocated: 0,
        reasoning: `Base optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Sampling method using injected strategy
   */
  protected sampleBeta(alpha: number, beta: number): number {
    return this.samplingStrategy.sampleBeta(alpha, beta);
  }

  protected sampleGamma(shape: number, rate: number): number {
    return this.samplingStrategy.sampleGamma(shape, rate);
  }

  /**
   * Constraint application using injected strategy
   */
  protected applyConstraints(
    rawAllocations: number[],
    constraints: BudgetConstraints,
    arms: Arm[]
  ): number[] {
    const constraintArms = this.convertToConstraintArms(arms);
    return this.constraintStrategy.applyConstraints(rawAllocations, constraints, constraintArms);
  }


  /**
   * Enhanced Bayesian update using prior strategy
   */
  protected async bayesianUpdate(arm: Arm): Promise<BayesianPosterior> {
    const cachedPrior = this.cachedPriors.get(arm.id);

    if (cachedPrior) {
      // Use cached prior as starting point
      const basePosterior = await this.computeBasePosterior(arm);

      // Blend with prior strategy
      return {
        alpha: basePosterior.alpha + cachedPrior.conversionRate.alpha - 1,
        beta: basePosterior.beta + cachedPrior.conversionRate.beta - 1,
        shape: basePosterior.shape + cachedPrior.conversionValue.shape - 1,
        rate: basePosterior.rate + cachedPrior.conversionValue.rate
      };
    }

    return this.computeBasePosterior(arm);
  }

  /**
   * Initialize priors for a set of arms
   */
  async initializePriors(arms: Arm[], historicalData?: HistoricalData): Promise<void> {
    const priorArms = this.convertToPriorArms(arms);
    const priors = this.priorStrategy.computePriors(
      priorArms,
      historicalData || this.createDefaultHistoricalData(arms)
    );

    this.cachedPriors.clear();
    for (const prior of priors) {
      this.cachedPriors.set(prior.armId, prior);
    }
  }

  /**
   * Update performance history and priors
   */
  async recordPerformance(performanceData: PerformanceData[]): Promise<void> {
    this.performanceHistory.push(...performanceData);

    // Keep only recent history (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    this.performanceHistory = this.performanceHistory.filter(
      data => data.timestamp >= thirtyDaysAgo
    );

    // Update priors with new data
    if (this.cachedPriors.size > 0) {
      const currentPriors = Array.from(this.cachedPriors.values());
      const updatedPriors = this.priorStrategy.updatePriors(currentPriors, performanceData);

      this.cachedPriors.clear();
      for (const prior of updatedPriors) {
        this.cachedPriors.set(prior.armId, prior);
      }
    }
  }

  /**
   * Get comprehensive strategy information
   */
  getStrategyInformation(): {
    sampling: object;
    constraint: object;
    prior: object;
    configuration: ConfigurableThompsonSamplingConfig;
  } {
    return {
      sampling: this.samplingStrategy.getMetadata(),
      constraint: this.constraintStrategy.getMetadata(),
      prior: this.priorStrategy.getMetadata(),
      configuration: this.config
    };
  }

  // Private helper methods

  private convertToConstraintArms(arms: Arm[]): ConstraintArm[] {
    return arms.map(arm => ({
      id: arm.id,
      name: arm.name,
      minBudget: arm.minBudget || 0,
      maxBudget: arm.maxBudget || Infinity,
      currentBudget: arm.currentBudget || 0,
      performance: {
        conversionRate: arm.conversionRate || 0,
        averageValue: arm.averageValue || 0,
        costPerClick: arm.costPerClick || 1,
        qualityScore: arm.qualityScore || 5
      },
      metadata: {
        category: arm.category,
        priority: arm.priority,
        seasonality: arm.seasonality,
        riskLevel: this.determineRiskLevel(arm)
      }
    }));
  }

  private convertToPriorArms(arms: Arm[]): PriorArm[] {
    return arms.map(arm => ({
      id: arm.id,
      name: arm.name,
      category: arm.category || 'default',
      characteristics: {
        ageInDays: this.calculateArmAge(arm),
        budgetTier: this.determineBudgetTier(arm),
        targetAudience: arm.targetAudience || 'general',
        keywords: arm.keywords || []
      }
    }));
  }

  private async updatePriorsFromHistory(arms: Arm[]): Promise<void> {
    if (this.performanceHistory.length === 0) return;

    const relevantHistory = this.performanceHistory.filter(data =>
      arms.some(arm => arm.id === data.armId)
    );

    if (relevantHistory.length > 0 && this.cachedPriors.size > 0) {
      const currentPriors = Array.from(this.cachedPriors.values());
      const updatedPriors = this.priorStrategy.updatePriors(currentPriors, relevantHistory);

      this.cachedPriors.clear();
      for (const prior of updatedPriors) {
        this.cachedPriors.set(prior.armId, prior);
      }
    }
  }

  private computeBasePosterior(arm: Arm): Promise<BayesianPosterior> {
    // Basic posterior computation without priors
    const clicks = arm.metrics30d?.clicks || 0;
    const conversions = arm.metrics30d?.conversions || 0;
    const revenue = arm.metrics30d?.revenue || 0;

    const alpha = 1 + conversions;
    const beta = 1 + clicks - conversions;
    const shape = 1 + conversions;
    const rate = conversions > 0 ? conversions / revenue : 0.01;

    return Promise.resolve({ cvr_alpha: alpha, cvr_beta: beta, value_alpha: shape, value_beta: rate });
  }

  private generateReasoning(
    arms: Arm[],
    allocations: AllocationResult[],
    explorationFloor: number
  ): string {
    let reasoning = '## Thompson Sampling Budget Optimization\n\n';
    reasoning += `Total Budget: ${allocations.reduce((sum, a) => sum + a.proposedDailyBudget, 0)}\n`;
    reasoning += `Exploration Floor: ${(explorationFloor * 100).toFixed(1)}%\n\n`;

    allocations.forEach(alloc => {
      reasoning += `- **${alloc.armName}**: $${alloc.proposedDailyBudget.toFixed(2)} `;
      reasoning += `(Expected Improvement: ${(alloc.expectedImprovement * 100).toFixed(1)}%)\n`;
    });

    return reasoning;
  }

  private generateEnhancedReasoning(
    arms: Arm[],
    allocations: AllocationResult[],
    context?: OptimizationContext
  ): string {
    const baseReasoning = this.generateReasoning(arms, allocations, this.config.explorationFloor);

    let enhancedReasoning = baseReasoning;

    enhancedReasoning += '\n\n## Strategy Configuration\n';
    enhancedReasoning += `- **Sampling Strategy**: ${this.samplingStrategy.getMetadata().name}\n`;
    enhancedReasoning += `- **Constraint Strategy**: ${this.constraintStrategy.getMetadata().name}\n`;
    enhancedReasoning += `- **Prior Strategy**: ${this.priorStrategy.getMetadata().name}\n`;

    if (context?.objectives) {
      enhancedReasoning += '\n## Optimization Objectives\n';
      enhancedReasoning += `- **Primary**: ${context.objectives.primary}\n`;
      if (context.objectives.secondary?.length) {
        enhancedReasoning += `- **Secondary**: ${context.objectives.secondary.join(', ')}\n`;
      }
    }

    if (context?.marketConditions) {
      enhancedReasoning += '\n## Market Context\n';
      enhancedReasoning += `- **Seasonality Factor**: ${context.marketConditions.seasonality.toFixed(2)}\n`;
      enhancedReasoning += `- **Competition Level**: ${context.marketConditions.competitiveness.toFixed(2)}\n`;
      enhancedReasoning += `- **Economic Factor**: ${context.marketConditions.economicFactor.toFixed(2)}\n`;
    }

    return enhancedReasoning;
  }

  private generateAllocationReasoning(
    arm: Arm,
    allocation: number,
    baseAllocation: AllocationResult
  ): string {
    const difference = allocation - baseAllocation.proposedDailyBudget;
    const percentChange = (difference / baseAllocation.amount) * 100;

    if (Math.abs(percentChange) < 1) {
      return baseAllocation.reasoning || 'Allocation maintained based on Thompson Sampling recommendation';
    }

    const direction = difference > 0 ? 'increased' : 'decreased';
    const reason = difference > 0 ?
      'constraint optimization identified additional opportunity' :
      'constraint enforcement required budget reallocation';

    return `${baseAllocation.reasoning} Allocation ${direction} by ${Math.abs(percentChange).toFixed(1)}% due to ${reason}.`;
  }

  private calculateExpectedReturn(arm: Arm, allocation: number): number {
    const cpc = arm.metrics30d.spend / Math.max(arm.metrics30d.clicks, 1);
    const clicks = allocation / cpc;
    const cvr = arm.metrics30d.conversions / Math.max(arm.metrics30d.clicks, 1);
    const conversions = clicks * cvr;
    const avgValue = arm.metrics30d.revenue / Math.max(arm.metrics30d.conversions, 1);
    return conversions * avgValue;
  }

  private calculateConfidenceScore(arm: Arm, allocation: number): number {
    // Calculate confidence score based on sample size and performance
    const sampleSize = arm.metrics30d.clicks || 1;
    const conversionRate = arm.metrics30d.conversions / sampleSize;

    // Wilson score interval for confidence
    const z = 1.96; // 95% confidence
    const n = sampleSize;
    const p = conversionRate;

    const denominator = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denominator;
    const width = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;

    // Confidence is higher with more samples and tighter intervals
    const sampleConfidence = Math.min(1, Math.log(n + 1) / Math.log(1000));
    const intervalConfidence = Math.max(0, 1 - width);

    return (sampleConfidence + intervalConfidence) / 2;
  }

  private calculateExpectedImprovement(arm: Arm, allocation: number): number {
    // Calculate improvement as percentage increase in expected return
    const currentReturn = this.calculateExpectedReturn(arm, arm.currentDailyBudget || 0);
    const newReturn = this.calculateExpectedReturn(arm, allocation);

    if (currentReturn === 0) return newReturn > 0 ? 1 : 0;
    return (newReturn - currentReturn) / currentReturn;
  }

  private calculateConfidenceInterval(arm: Arm, allocation: number): [number, number] {
    // Calculate confidence interval for the allocation
    const confidence = this.calculateAllocationConfidence(arm, allocation);
    const margin = allocation * 0.2 * (1 - confidence); // Narrower interval with higher confidence

    return [
      Math.max(0, allocation - margin),
      allocation + margin
    ];
  }

  private calculateAllocationConfidence(arm: Arm, allocation: number): number {
    const prior = this.cachedPriors.get(arm.id);
    if (prior) {
      return (prior.conversionRate.confidence + prior.conversionValue.confidence) / 2;
    }
    return this.calculateConfidence(arm.metrics30d?.clicks || 0);
  }

  private calculateConfidence(clicks: number): number {
    return Math.min(0.95, clicks / (clicks + 100));
  }

  private calculateTotalExpectedValue(arms: Arm[], allocations: AllocationResult[]): number {
    return allocations.reduce((total, allocation, index) => {
      return total + this.calculateExpectedReturn(arms[index], allocation.proposedDailyBudget);
    }, 0);
  }

  private evaluateSamplingAccuracy(): number {
    const metadata = this.samplingStrategy.getMetadata();
    const accuracyScore = metadata.accuracy === 'exact' ? 1.0 :
                         metadata.accuracy === 'high' ? 0.9 :
                         metadata.accuracy === 'medium' ? 0.7 : 0.5;
    return accuracyScore;
  }

  private evaluateConstraintEfficiency(warningCount: number): number {
    if (warningCount === 0) return 1.0;
    return Math.max(0, 1 - warningCount * 0.1);
  }

  private evaluatePriorReliability(arms: Arm[]): number {
    if (!arms || arms.length === 0 || this.cachedPriors.size === 0) return 0.5;

    const reliabilities = arms.map(arm => {
      const prior = this.cachedPriors.get(arm.id);
      return prior?.metadata?.reliability || 0.5;
    });

    if (reliabilities.length === 0) return 0.5;
    return reliabilities.reduce((sum, r) => sum + r, 0) / reliabilities.length;
  }

  private determineRiskLevel(arm: Arm): 'low' | 'medium' | 'high' {
    const cr = arm.conversionRate || 0;
    const qs = arm.qualityScore || 5;

    if (cr < 0.01 || qs < 3) return 'high';
    if (cr < 0.03 || qs < 6) return 'medium';
    return 'low';
  }

  private calculateArmAge(arm: Arm): number {
    if (arm.createdAt) {
      const created = new Date(arm.createdAt);
      return Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
    }
    return 30; // Default to 30 days
  }

  private determineBudgetTier(arm: Arm): 'low' | 'medium' | 'high' {
    const budget = arm.currentBudget || 0;
    if (budget < 100) return 'low';
    if (budget < 1000) return 'medium';
    return 'high';
  }

  private createDefaultHistoricalData(arms: Arm[]): HistoricalData {
    return {
      arms: arms.map(arm => ({
        id: arm.id,
        name: arm.name,
        category: arm.category || 'default',
        performance: [{
          date: new Date().toISOString(),
          impressions: arm.impressions || 1000,
          clicks: arm.clicks || 50,
          conversions: arm.conversions || 2,
          cost: arm.currentBudget || 100,
          conversionValue: (arm.conversions || 2) * (arm.averageValue || 100),
          qualityScore: arm.qualityScore || 5
        }]
      })),
      timeRange: {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      }
    };
  }
}