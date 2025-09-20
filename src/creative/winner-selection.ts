import { z } from 'zod';
import { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';
import { ABTestingFramework, ABTestResult, CreativeVariant } from './ab-testing-framework';
import { FatigueDetector, FatigueAnalysis } from './fatigue-detector';
import { CreativePerformanceAnalyzer, AdCreativePerformance } from './creative-performance-analyzer';

export const SelectionCriteriaSchema = z.object({
  primaryMetric: z.enum(['CTR', 'CVR', 'CPA', 'ROAS', 'REVENUE']),
  secondaryMetrics: z.array(z.enum(['CTR', 'CVR', 'CPA', 'ROAS', 'REVENUE', 'IMPRESSIONS', 'CLICKS'])),

  // Statistical requirements
  minConfidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
  minSampleSize: z.number().min(100).default(1000),
  minTestDuration: z.number().min(7).default(14), // days

  // Performance thresholds
  minPracticalSignificance: z.number().min(0.01).max(0.5).default(0.05), // 5% minimum improvement
  maxTolerableDecline: z.number().min(0.01).max(0.3).default(0.1), // 10% max decline in secondary metrics

  // Business constraints
  maxBudgetIncrease: z.number().min(0).max(2).default(0.5), // 50% max budget increase
  minROI: z.number().min(1).default(2), // 2x minimum ROI

  // Risk management
  riskTolerance: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']).default('MODERATE'),
  requireUnanimousSignificance: z.boolean().default(false), // All metrics must be significant

  // Quality gates
  minQualityScore: z.number().min(1).max(10).default(7),
  maxFatigueLevel: z.enum(['NONE', 'MILD', 'MODERATE']).default('MILD'),

  // Time constraints
  implementationDeadline: z.string().optional(),
  seasonalFactors: z.array(z.string()).default([])
});

export const WinnerSelectionResultSchema = z.object({
  selectionId: z.string(),
  timestamp: z.string(),

  // Test context
  testId: z.string(),
  abTestResult: z.any(), // ABTestResult type
  criteria: SelectionCriteriaSchema,

  // Decision outcome
  decision: z.enum(['SELECT_WINNER', 'CONTINUE_TEST', 'DECLARE_INCONCLUSIVE', 'ABORT_TEST']),
  selectedWinner: z.enum(['CONTROL', 'TEST', 'NEITHER']).optional(),
  confidence: z.number().min(0).max(1),

  // Analysis
  analysis: z.object({
    statisticalValidation: z.object({
      primaryMetricValid: z.boolean(),
      secondaryMetricsValid: z.boolean(),
      sampleSizeAdequate: z.boolean(),
      testDurationAdequate: z.boolean(),
      confidenceThresholdMet: z.boolean()
    }),

    businessValidation: z.object({
      practicalSignificanceMet: z.boolean(),
      secondaryMetricsAcceptable: z.boolean(),
      budgetConstraintsMet: z.boolean(),
      roiRequirementMet: z.boolean(),
      qualityGatesPassed: z.boolean()
    }),

    riskAssessment: z.object({
      overallRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      identifiedRisks: z.array(z.string()),
      mitigationRecommendations: z.array(z.string()),
      rollbackPlan: z.string()
    }),

    performanceProjection: z.object({
      expectedLift: z.number(),
      projectedImpact: z.object({
        revenue: z.number(),
        cost: z.number(),
        conversions: z.number()
      }),
      confidenceInterval: z.object({
        lower: z.number(),
        upper: z.number()
      }),
      timeToFullImpact: z.number() // days
    })
  }),

  // Recommendations
  recommendation: z.object({
    action: z.enum([
      'IMPLEMENT_IMMEDIATELY',
      'IMPLEMENT_WITH_MONITORING',
      'IMPLEMENT_GRADUALLY',
      'CONTINUE_TESTING',
      'MODIFY_TEST',
      'ABORT_AND_RESTART'
    ]),
    reasoning: z.array(z.string()),
    implementation: z.object({
      rolloutStrategy: z.enum(['IMMEDIATE', 'GRADUAL', 'SEGMENTED']),
      trafficAllocation: z.number().min(0).max(1),
      monitoringPlan: z.array(z.string()),
      rollbackTriggers: z.array(z.string())
    }),
    nextSteps: z.array(z.string()),
    followUpDate: z.string()
  })
});

export type SelectionCriteria = z.infer<typeof SelectionCriteriaSchema>;
export type WinnerSelectionResult = z.infer<typeof WinnerSelectionResultSchema>;

export interface DecisionContext {
  businessObjectives: string[];
  currentCampaignPerformance: {
    baseline: Record<string, number>;
    targets: Record<string, number>;
  };
  competitiveContext: {
    marketConditions: 'GROWING' | 'STABLE' | 'DECLINING';
    competitivePressure: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  resourceConstraints: {
    budget: number;
    timeframe: string;
    team: 'SMALL' | 'MEDIUM' | 'LARGE';
  };
}

export class WinnerSelection extends EventEmitter {
  private db: Database;
  private abTestFramework: ABTestingFramework;
  private fatigueDetector: FatigueDetector;
  private performanceAnalyzer: CreativePerformanceAnalyzer;

  constructor(
    db: Database,
    abTestFramework: ABTestingFramework,
    fatigueDetector: FatigueDetector,
    performanceAnalyzer: CreativePerformanceAnalyzer
  ) {
    super();
    this.db = db;
    this.abTestFramework = abTestFramework;
    this.fatigueDetector = fatigueDetector;
    this.performanceAnalyzer = performanceAnalyzer;
    this.initializeTables();
  }

  async evaluateWinner(
    testId: string,
    criteria: SelectionCriteria,
    context?: DecisionContext
  ): Promise<WinnerSelectionResult> {
    const selectionId = this.generateSelectionId();

    // Get test results
    const abTestResult = await this.abTestFramework.analyzeABTest(testId);

    // Perform comprehensive analysis
    const analysis = await this.performWinnerAnalysis(abTestResult, criteria, context);

    // Make selection decision
    const decision = this.makeSelectionDecision(analysis, criteria);

    // Generate recommendations
    const recommendation = await this.generateImplementationRecommendation(
      decision,
      analysis,
      criteria,
      context
    );

    const result: WinnerSelectionResult = {
      selectionId,
      timestamp: new Date().toISOString(),
      testId,
      abTestResult,
      criteria,
      decision: decision.decision,
      selectedWinner: decision.winner,
      confidence: decision.confidence,
      analysis,
      recommendation
    };

    // Store results
    await this.storeSelectionResult(result);

    // Emit events
    this.emit('winnerEvaluated', result);

    if (result.decision === 'SELECT_WINNER') {
      this.emit('winnerSelected', {
        testId,
        winner: result.selectedWinner,
        confidence: result.confidence
      });
    }

    return result;
  }

  async batchWinnerEvaluation(
    testIds: string[],
    criteria: SelectionCriteria,
    context?: DecisionContext
  ): Promise<WinnerSelectionResult[]> {
    const results: WinnerSelectionResult[] = [];

    for (const testId of testIds) {
      try {
        const result = await this.evaluateWinner(testId, criteria, context);
        results.push(result);
      } catch (error) {
        console.error(`Failed to evaluate winner for test ${testId}:`, error);
      }
    }

    // Generate batch insights
    const batchSummary = this.generateBatchSummary(results);
    this.emit('batchEvaluationComplete', { results, summary: batchSummary });

    return results;
  }

  async implementWinner(
    selectionId: string,
    implementationStrategy: 'IMMEDIATE' | 'GRADUAL' | 'SEGMENTED' = 'GRADUAL'
  ): Promise<{
    implemented: boolean;
    rolloutPlan: Array<{
      phase: number;
      trafficPercentage: number;
      startDate: string;
      monitoringMetrics: string[];
    }>;
    monitoringSchedule: Array<{
      checkDate: string;
      metrics: string[];
      thresholds: Record<string, number>;
    }>;
  }> {
    const selection = await this.getSelectionResult(selectionId);

    if (selection.decision !== 'SELECT_WINNER') {
      throw new Error(`Cannot implement: selection decision was ${selection.decision}`);
    }

    // Create rollout plan
    const rolloutPlan = this.createRolloutPlan(selection, implementationStrategy);

    // Set up monitoring
    const monitoringSchedule = this.createMonitoringSchedule(selection);

    // Execute implementation (in real system, would call Google Ads API)
    await this.executeImplementation(selection, rolloutPlan);

    this.emit('winnerImplemented', {
      selectionId,
      testId: selection.testId,
      winner: selection.selectedWinner,
      strategy: implementationStrategy
    });

    return {
      implemented: true,
      rolloutPlan,
      monitoringSchedule
    };
  }

  async monitorImplementation(
    selectionId: string
  ): Promise<{
    status: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'ROLLBACK_REQUIRED';
    metrics: Record<string, {
      current: number;
      expected: number;
      variance: number;
      threshold: number;
    }>;
    alerts: Array<{
      type: 'WARNING' | 'CRITICAL';
      metric: string;
      message: string;
      action: string;
    }>;
    recommendation: 'CONTINUE' | 'ADJUST' | 'ROLLBACK';
  }> {
    const selection = await this.getSelectionResult(selectionId);

    // Get current performance data
    const currentMetrics = await this.getCurrentImplementationMetrics(selection.testId);

    // Compare against projections
    const analysis = this.analyzeImplementationPerformance(
      currentMetrics,
      selection.analysis.performanceProjection
    );

    // Generate alerts and recommendations
    const alerts = this.generateImplementationAlerts(analysis);
    const recommendation = this.determineImplementationRecommendation(analysis, alerts);

    return {
      status: this.determineImplementationStatus(analysis, alerts),
      metrics: analysis.metrics,
      alerts,
      recommendation
    };
  }

  private async performWinnerAnalysis(
    abTestResult: ABTestResult,
    criteria: SelectionCriteria,
    context?: DecisionContext
  ): Promise<WinnerSelectionResult['analysis']> {
    // Statistical validation
    const statisticalValidation = this.validateStatisticalRequirements(abTestResult, criteria);

    // Business validation
    const businessValidation = await this.validateBusinessRequirements(abTestResult, criteria, context);

    // Risk assessment
    const riskAssessment = await this.assessImplementationRisks(abTestResult, criteria, context);

    // Performance projection
    const performanceProjection = this.projectPerformanceImpact(abTestResult, criteria);

    return {
      statisticalValidation,
      businessValidation,
      riskAssessment,
      performanceProjection
    };
  }

  private validateStatisticalRequirements(
    abTestResult: ABTestResult,
    criteria: SelectionCriteria
  ): WinnerSelectionResult['analysis']['statisticalValidation'] {
    const primary = abTestResult.analysis.primaryMetricResult;

    return {
      primaryMetricValid: primary.pValue < (1 - criteria.minConfidenceLevel) &&
                         primary.statisticallySignificant,
      secondaryMetricsValid: criteria.requireUnanimousSignificance ?
        abTestResult.analysis.secondaryMetrics.every(m => m.significant) :
        abTestResult.analysis.secondaryMetrics.some(m => m.significant),
      sampleSizeAdequate: (abTestResult.control.sampleSize + abTestResult.test.sampleSize) >= criteria.minSampleSize,
      testDurationAdequate: this.calculateTestDuration(abTestResult) >= criteria.minTestDuration,
      confidenceThresholdMet: (1 - primary.pValue) >= criteria.minConfidenceLevel
    };
  }

  private async validateBusinessRequirements(
    abTestResult: ABTestResult,
    criteria: SelectionCriteria,
    context?: DecisionContext
  ): Promise<WinnerSelectionResult['analysis']['businessValidation']> {
    const primary = abTestResult.analysis.primaryMetricResult;

    // Check practical significance
    const practicalSignificanceMet = Math.abs(primary.relativeChange) >= criteria.minPracticalSignificance;

    // Check secondary metrics don't decline too much
    const secondaryMetricsAcceptable = abTestResult.analysis.secondaryMetrics.every(metric =>
      metric.relativeChange >= -criteria.maxTolerableDecline
    );

    // Check budget constraints
    const budgetIncrease = (abTestResult.test.spend - abTestResult.control.spend) / abTestResult.control.spend;
    const budgetConstraintsMet = budgetIncrease <= criteria.maxBudgetIncrease;

    // Check ROI
    const roi = abTestResult.test.revenue / abTestResult.test.spend;
    const roiRequirementMet = roi >= criteria.minROI;

    // Quality gates (would integrate with quality score data)
    const qualityGatesPassed = true; // Simplified for now

    return {
      practicalSignificanceMet,
      secondaryMetricsAcceptable,
      budgetConstraintsMet,
      roiRequirementMet,
      qualityGatesPassed
    };
  }

  private async assessImplementationRisks(
    abTestResult: ABTestResult,
    criteria: SelectionCriteria,
    context?: DecisionContext
  ): Promise<WinnerSelectionResult['analysis']['riskAssessment']> {
    const identifiedRisks: string[] = [];
    const mitigationRecommendations: string[] = [];

    // Assess statistical risk
    if (abTestResult.analysis.primaryMetricResult.pValue > 0.01) {
      identifiedRisks.push('Moderate statistical significance - risk of false positive');
      mitigationRecommendations.push('Implement with enhanced monitoring');
    }

    // Assess business impact risk
    const revenueImpact = abTestResult.analysis.primaryMetricResult.relativeChange;
    if (Math.abs(revenueImpact) > 0.3) {
      identifiedRisks.push('Large performance change detected - implementation risk');
      mitigationRecommendations.push('Consider gradual rollout strategy');
    }

    // Assess market risk
    if (context?.competitiveContext.competitivePressure === 'HIGH') {
      identifiedRisks.push('High competitive pressure may affect results');
      mitigationRecommendations.push('Monitor competitor responses closely');
    }

    const overallRiskLevel = this.calculateOverallRiskLevel(identifiedRisks, criteria.riskTolerance);

    return {
      overallRiskLevel,
      identifiedRisks,
      mitigationRecommendations,
      rollbackPlan: 'Revert to control variant if primary metric declines by >10% within 48 hours'
    };
  }

  private projectPerformanceImpact(
    abTestResult: ABTestResult,
    criteria: SelectionCriteria
  ): WinnerSelectionResult['analysis']['performanceProjection'] {
    const primary = abTestResult.analysis.primaryMetricResult;
    const expectedLift = primary.relativeChange;

    // Project revenue and cost impact
    const currentRevenue = abTestResult.control.revenue + abTestResult.test.revenue;
    const currentCost = abTestResult.control.spend + abTestResult.test.spend;
    const currentConversions = abTestResult.control.conversions + abTestResult.test.conversions;

    const projectedImpact = {
      revenue: currentRevenue * expectedLift,
      cost: currentCost * (1 + expectedLift * 0.5), // Assume cost increases at half the rate
      conversions: currentConversions * expectedLift
    };

    return {
      expectedLift,
      projectedImpact,
      confidenceInterval: {
        lower: primary.confidenceInterval.lower,
        upper: primary.confidenceInterval.upper
      },
      timeToFullImpact: 14 // Assume 14 days to full impact
    };
  }

  private makeSelectionDecision(
    analysis: WinnerSelectionResult['analysis'],
    criteria: SelectionCriteria
  ): {
    decision: WinnerSelectionResult['decision'];
    winner: WinnerSelectionResult['selectedWinner'];
    confidence: number;
  } {
    const { statisticalValidation, businessValidation, riskAssessment } = analysis;

    // Check if we can make a decision
    const canSelect =
      statisticalValidation.primaryMetricValid &&
      statisticalValidation.sampleSizeAdequate &&
      statisticalValidation.testDurationAdequate &&
      businessValidation.practicalSignificanceMet &&
      businessValidation.budgetConstraintsMet &&
      businessValidation.roiRequirementMet;

    if (!canSelect) {
      if (!statisticalValidation.sampleSizeAdequate || !statisticalValidation.testDurationAdequate) {
        return { decision: 'CONTINUE_TEST', winner: 'NEITHER', confidence: 0.5 };
      } else {
        return { decision: 'DECLARE_INCONCLUSIVE', winner: 'NEITHER', confidence: 0.3 };
      }
    }

    // Risk-based decision making
    if (riskAssessment.overallRiskLevel === 'HIGH' && criteria.riskTolerance === 'CONSERVATIVE') {
      return { decision: 'CONTINUE_TEST', winner: 'NEITHER', confidence: 0.6 };
    }

    // Determine winner based on primary metric improvement
    const primaryImprovement = analysis.performanceProjection.expectedLift;
    const winner = primaryImprovement > 0 ? 'TEST' : 'CONTROL';

    // Calculate confidence based on multiple factors
    const confidence = this.calculateSelectionConfidence(analysis, criteria);

    return {
      decision: 'SELECT_WINNER',
      winner,
      confidence
    };
  }

  private async generateImplementationRecommendation(
    decision: { decision: WinnerSelectionResult['decision']; winner: WinnerSelectionResult['selectedWinner']; confidence: number },
    analysis: WinnerSelectionResult['analysis'],
    criteria: SelectionCriteria,
    context?: DecisionContext
  ): Promise<WinnerSelectionResult['recommendation']> {
    if (decision.decision !== 'SELECT_WINNER') {
      return {
        action: 'CONTINUE_TESTING',
        reasoning: ['Statistical or business requirements not met'],
        implementation: {
          rolloutStrategy: 'IMMEDIATE',
          trafficAllocation: 0,
          monitoringPlan: [],
          rollbackTriggers: []
        },
        nextSteps: ['Continue test until requirements are met'],
        followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
    }

    // Determine implementation strategy based on risk and confidence
    let action: WinnerSelectionResult['recommendation']['action'] = 'IMPLEMENT_WITH_MONITORING';
    let rolloutStrategy: 'IMMEDIATE' | 'GRADUAL' | 'SEGMENTED' = 'GRADUAL';

    if (decision.confidence > 0.95 && analysis.riskAssessment.overallRiskLevel === 'LOW') {
      action = 'IMPLEMENT_IMMEDIATELY';
      rolloutStrategy = 'IMMEDIATE';
    } else if (analysis.riskAssessment.overallRiskLevel === 'HIGH') {
      action = 'IMPLEMENT_GRADUALLY';
      rolloutStrategy = 'SEGMENTED';
    }

    const reasoning = [
      `Winner selected with ${(decision.confidence * 100).toFixed(1)}% confidence`,
      `Expected lift: ${(analysis.performanceProjection.expectedLift * 100).toFixed(1)}%`,
      `Risk level: ${analysis.riskAssessment.overallRiskLevel}`
    ];

    const monitoringPlan = [
      'Monitor primary metric daily for first week',
      'Track secondary metrics for negative impact',
      'Set up automated alerts for significant changes'
    ];

    const rollbackTriggers = [
      'Primary metric declines >10% within 48 hours',
      'Any secondary metric declines >20%',
      'Quality score drops below threshold'
    ];

    return {
      action,
      reasoning,
      implementation: {
        rolloutStrategy,
        trafficAllocation: rolloutStrategy === 'IMMEDIATE' ? 1.0 : 0.5,
        monitoringPlan,
        rollbackTriggers
      },
      nextSteps: [
        'Implement winner according to rollout strategy',
        'Monitor performance against projections',
        'Document learnings for future tests'
      ],
      followUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }

  private calculateTestDuration(abTestResult: ABTestResult): number {
    const startDate = new Date(abTestResult.startDate);
    const endDate = abTestResult.endDate ? new Date(abTestResult.endDate) : new Date();
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  }

  private calculateOverallRiskLevel(
    risks: string[],
    tolerance: SelectionCriteria['riskTolerance']
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const riskCount = risks.length;

    if (tolerance === 'AGGRESSIVE') {
      return riskCount > 3 ? 'HIGH' : riskCount > 1 ? 'MEDIUM' : 'LOW';
    } else if (tolerance === 'CONSERVATIVE') {
      return riskCount > 1 ? 'HIGH' : riskCount > 0 ? 'MEDIUM' : 'LOW';
    } else {
      return riskCount > 2 ? 'HIGH' : riskCount > 1 ? 'MEDIUM' : 'LOW';
    }
  }

  private calculateSelectionConfidence(
    analysis: WinnerSelectionResult['analysis'],
    criteria: SelectionCriteria
  ): number {
    let confidence = 0.5; // Base confidence

    // Statistical confidence
    if (analysis.statisticalValidation.primaryMetricValid) confidence += 0.3;
    if (analysis.statisticalValidation.confidenceThresholdMet) confidence += 0.2;

    // Business confidence
    if (analysis.businessValidation.practicalSignificanceMet) confidence += 0.2;
    if (analysis.businessValidation.roiRequirementMet) confidence += 0.1;

    // Risk adjustment
    if (analysis.riskAssessment.overallRiskLevel === 'LOW') confidence += 0.1;
    else if (analysis.riskAssessment.overallRiskLevel === 'HIGH') confidence -= 0.2;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generateSelectionId(): string {
    return `sel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createRolloutPlan(
    selection: WinnerSelectionResult,
    strategy: 'IMMEDIATE' | 'GRADUAL' | 'SEGMENTED'
  ): Array<{
    phase: number;
    trafficPercentage: number;
    startDate: string;
    monitoringMetrics: string[];
  }> {
    const baseDate = new Date();

    if (strategy === 'IMMEDIATE') {
      return [{
        phase: 1,
        trafficPercentage: 100,
        startDate: baseDate.toISOString().split('T')[0],
        monitoringMetrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics]
      }];
    }

    if (strategy === 'GRADUAL') {
      return [
        {
          phase: 1,
          trafficPercentage: 25,
          startDate: baseDate.toISOString().split('T')[0],
          monitoringMetrics: [selection.criteria.primaryMetric]
        },
        {
          phase: 2,
          trafficPercentage: 50,
          startDate: new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          monitoringMetrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics]
        },
        {
          phase: 3,
          trafficPercentage: 100,
          startDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          monitoringMetrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics]
        }
      ];
    }

    // SEGMENTED strategy
    return [
      {
        phase: 1,
        trafficPercentage: 20,
        startDate: baseDate.toISOString().split('T')[0],
        monitoringMetrics: [selection.criteria.primaryMetric]
      },
      {
        phase: 2,
        trafficPercentage: 40,
        startDate: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        monitoringMetrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics.slice(0, 2)]
      },
      {
        phase: 3,
        trafficPercentage: 70,
        startDate: new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        monitoringMetrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics]
      },
      {
        phase: 4,
        trafficPercentage: 100,
        startDate: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        monitoringMetrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics]
      }
    ];
  }

  private createMonitoringSchedule(selection: WinnerSelectionResult): Array<{
    checkDate: string;
    metrics: string[];
    thresholds: Record<string, number>;
  }> {
    const schedule = [];
    const baseDate = new Date();

    // Daily monitoring for first week
    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      schedule.push({
        checkDate: checkDate.toISOString().split('T')[0],
        metrics: [selection.criteria.primaryMetric],
        thresholds: {
          [selection.criteria.primaryMetric]: selection.analysis.performanceProjection.expectedLift * 0.5
        }
      });
    }

    // Weekly monitoring thereafter
    for (let i = 2; i <= 4; i++) {
      const checkDate = new Date(baseDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      schedule.push({
        checkDate: checkDate.toISOString().split('T')[0],
        metrics: [selection.criteria.primaryMetric, ...selection.criteria.secondaryMetrics],
        thresholds: {
          [selection.criteria.primaryMetric]: selection.analysis.performanceProjection.expectedLift * 0.8
        }
      });
    }

    return schedule;
  }

  private async executeImplementation(
    selection: WinnerSelectionResult,
    rolloutPlan: any[]
  ): Promise<void> {
    // In a real implementation, this would call Google Ads API
    // For now, we'll just log and update database
    console.log(`Implementing winner for test ${selection.testId}: ${selection.selectedWinner}`);

    // Update implementation status in database
    this.db.prepare(`
      UPDATE winner_selections
      SET implementation_status = 'IMPLEMENTING', implementation_start = CURRENT_TIMESTAMP
      WHERE selection_id = ?
    `).run(selection.selectionId);
  }

  private async getCurrentImplementationMetrics(testId: string): Promise<Record<string, number>> {
    // In a real implementation, would fetch from Google Ads API
    return {
      CTR: 0.045,
      CVR: 0.08,
      CPA: 25,
      ROAS: 4.2
    };
  }

  private analyzeImplementationPerformance(
    currentMetrics: Record<string, number>,
    projections: WinnerSelectionResult['analysis']['performanceProjection']
  ): any {
    const metrics: Record<string, any> = {};

    Object.entries(currentMetrics).forEach(([metric, current]) => {
      const expected = projections.expectedLift; // Simplified
      const variance = (current - expected) / expected;

      metrics[metric] = {
        current,
        expected,
        variance,
        threshold: 0.1 // 10% variance threshold
      };
    });

    return { metrics };
  }

  private generateImplementationAlerts(analysis: any): any[] {
    const alerts = [];

    Object.entries(analysis.metrics).forEach(([metric, data]: [string, any]) => {
      if (Math.abs(data.variance) > data.threshold) {
        alerts.push({
          type: Math.abs(data.variance) > 0.2 ? 'CRITICAL' : 'WARNING',
          metric,
          message: `${metric} variance of ${(data.variance * 100).toFixed(1)}% exceeds threshold`,
          action: data.variance < -0.2 ? 'Consider rollback' : 'Monitor closely'
        });
      }
    });

    return alerts;
  }

  private determineImplementationRecommendation(analysis: any, alerts: any[]): 'CONTINUE' | 'ADJUST' | 'ROLLBACK' {
    const criticalAlerts = alerts.filter(a => a.type === 'CRITICAL');
    const warningAlerts = alerts.filter(a => a.type === 'WARNING');

    if (criticalAlerts.length > 0) return 'ROLLBACK';
    if (warningAlerts.length > 2) return 'ADJUST';
    return 'CONTINUE';
  }

  private determineImplementationStatus(analysis: any, alerts: any[]): 'ON_TRACK' | 'NEEDS_ATTENTION' | 'ROLLBACK_REQUIRED' {
    const criticalAlerts = alerts.filter(a => a.type === 'CRITICAL');
    const warningAlerts = alerts.filter(a => a.type === 'WARNING');

    if (criticalAlerts.length > 0) return 'ROLLBACK_REQUIRED';
    if (warningAlerts.length > 0) return 'NEEDS_ATTENTION';
    return 'ON_TRACK';
  }

  private generateBatchSummary(results: WinnerSelectionResult[]): any {
    const totalTests = results.length;
    const decisions = {
      SELECT_WINNER: results.filter(r => r.decision === 'SELECT_WINNER').length,
      CONTINUE_TEST: results.filter(r => r.decision === 'CONTINUE_TEST').length,
      DECLARE_INCONCLUSIVE: results.filter(r => r.decision === 'DECLARE_INCONCLUSIVE').length
    };

    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / totalTests;

    return {
      totalTests,
      decisions,
      avgConfidence,
      successRate: decisions.SELECT_WINNER / totalTests
    };
  }

  private async getSelectionResult(selectionId: string): Promise<WinnerSelectionResult> {
    const result = this.db.prepare(`
      SELECT * FROM winner_selections WHERE selection_id = ?
    `).get(selectionId) as any;

    if (!result) {
      throw new Error(`Selection ${selectionId} not found`);
    }

    // Parse the base result
    const baseResult = JSON.parse(result.result_json);

    // Merge in the criteria from the separate column
    const criteria = JSON.parse(result.criteria_json);

    // Create complete WinnerSelectionResult
    const completeResult = {
      ...baseResult,
      criteria: criteria,
      analysis: JSON.parse(result.analysis_json),
      recommendation: JSON.parse(result.recommendation_json)
    };

    return completeResult;
  }

  private async storeSelectionResult(result: WinnerSelectionResult): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO winner_selections (
        selection_id, test_id, decision, selected_winner, confidence,
        criteria_json, analysis_json, recommendation_json, result_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      result.selectionId,
      result.testId,
      result.decision,
      result.selectedWinner || null,
      result.confidence,
      JSON.stringify(result.criteria),
      JSON.stringify(result.analysis),
      JSON.stringify(result.recommendation),
      JSON.stringify(result)
    );
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS winner_selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        selection_id TEXT UNIQUE NOT NULL,
        test_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        selected_winner TEXT,
        confidence REAL NOT NULL,
        criteria_json TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        recommendation_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        implementation_status TEXT DEFAULT 'PENDING',
        implementation_start DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_winner_selections_test_id ON winner_selections (test_id);
      CREATE INDEX IF NOT EXISTS idx_winner_selections_decision ON winner_selections (decision);
      CREATE INDEX IF NOT EXISTS idx_winner_selections_confidence ON winner_selections (confidence);
    `);
  }
}