import { z } from 'zod';
import { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';

export const ABTestTypeSchema = z.enum([
  'CREATIVE_SPLIT',     // Test different ad creatives
  'LANDING_PAGE',       // Test different landing pages
  'BID_STRATEGY',       // Test different bidding approaches
  'AUDIENCE',           // Test different audience targets
  'ROTATION_STRATEGY'   // Test different rotation approaches
]);

export const ABTestStatusSchema = z.enum([
  'PLANNING',
  'READY',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED'
]);

export const StatisticalMethodSchema = z.enum([
  'FREQUENTIST',        // Classical hypothesis testing
  'BAYESIAN',          // Bayesian A/B testing
  'SEQUENTIAL'         // Sequential testing with early stopping
]);

export const ABTestConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  type: ABTestTypeSchema,
  statisticalMethod: StatisticalMethodSchema,

  // Traffic allocation
  trafficSplit: z.object({
    controlPercentage: z.number().min(10).max(90),
    testPercentage: z.number().min(10).max(90)
  }).refine(data => data.controlPercentage + data.testPercentage === 100),

  // Test duration and sample size
  minDurationDays: z.number().min(7).max(90),
  maxDurationDays: z.number().min(14).max(180),
  minSampleSize: z.number().min(100),
  targetPower: z.number().min(0.8).max(0.99).default(0.8),
  significanceLevel: z.number().min(0.01).max(0.1).default(0.05),

  // Primary and secondary metrics
  primaryMetric: z.enum(['CTR', 'CVR', 'CPA', 'ROAS', 'REVENUE']),
  secondaryMetrics: z.array(z.enum(['CTR', 'CVR', 'CPA', 'ROAS', 'REVENUE', 'IMPRESSIONS', 'CLICKS'])),

  // Effect size and practical significance
  minDetectableEffect: z.number().min(0.01).max(1.0), // Minimum % change to detect
  practicalSignificanceThreshold: z.number().min(0.01).max(0.5), // Minimum % change to care about

  // Early stopping rules
  earlyStoppingEnabled: z.boolean().default(true),
  earlyStoppingCheckInterval: z.number().min(1).max(7).default(1), // days
  futilityStoppingEnabled: z.boolean().default(true),

  // Guardrails
  maxNegativeImpact: z.number().min(0.05).max(0.5).default(0.2), // Max acceptable loss %
  maxSpendIncrease: z.number().min(0.1).max(2.0).default(0.5) // Max spend increase multiplier
});

export const ABTestResultSchema = z.object({
  testId: z.string(),
  status: ABTestStatusSchema,
  startDate: z.string(),
  endDate: z.string().optional(),

  // Sample statistics
  control: z.object({
    sampleSize: z.number(),
    conversions: z.number(),
    revenue: z.number(),
    spend: z.number(),
    metrics: z.record(z.number())
  }),

  test: z.object({
    sampleSize: z.number(),
    conversions: z.number(),
    revenue: z.number(),
    spend: z.number(),
    metrics: z.record(z.number())
  }),

  // Statistical analysis
  analysis: z.object({
    primaryMetricResult: z.object({
      metric: z.string(),
      controlValue: z.number(),
      testValue: z.number(),
      relativeChange: z.number(),
      absoluteChange: z.number(),
      pValue: z.number(),
      confidenceInterval: z.object({
        lower: z.number(),
        upper: z.number(),
        level: z.number()
      }),
      statisticallySignificant: z.boolean(),
      practicallySignificant: z.boolean()
    }),

    secondaryMetrics: z.array(z.object({
      metric: z.string(),
      controlValue: z.number(),
      testValue: z.number(),
      relativeChange: z.number(),
      pValue: z.number(),
      significant: z.boolean()
    })),

    // Bayesian analysis (if applicable)
    bayesian: z.object({
      probabilityTestBetter: z.number(),
      credibleInterval: z.object({
        lower: z.number(),
        upper: z.number()
      }),
      expectedLift: z.number()
    }).optional(),

    // Power and sample size analysis
    powerAnalysis: z.object({
      currentPower: z.number(),
      requiredSampleSize: z.number(),
      timeToCompletion: z.number() // days
    })
  }),

  // Recommendations
  recommendation: z.object({
    decision: z.enum(['CONTINUE', 'STOP_SUCCESS', 'STOP_FAILURE', 'STOP_INCONCLUSIVE']),
    winner: z.enum(['CONTROL', 'TEST', 'INCONCLUSIVE']),
    confidence: z.number().min(0).max(1),
    reasoning: z.array(z.string()),
    nextSteps: z.array(z.string())
  })
});

export type ABTestType = z.infer<typeof ABTestTypeSchema>;
export type ABTestStatus = z.infer<typeof ABTestStatusSchema>;
export type StatisticalMethod = z.infer<typeof StatisticalMethodSchema>;
export type ABTestConfig = z.infer<typeof ABTestConfigSchema>;
export type ABTestResult = z.infer<typeof ABTestResultSchema>;

export interface CreativeVariant {
  id: string;
  name: string;
  adId: string;
  type: 'CONTROL' | 'TEST';
  content: {
    headlines: string[];
    descriptions: string[];
    images?: string[];
    videos?: string[];
  };
  active: boolean;
}

export class ABTestingFramework extends EventEmitter {
  private db: Database;

  constructor(db: Database) {
    super();
    this.db = db;
    this.initializeTables();
  }

  async createABTest(
    config: ABTestConfig,
    controlVariant: CreativeVariant,
    testVariant: CreativeVariant
  ): Promise<string> {
    const testId = this.generateTestId();

    // Validate test configuration
    await this.validateTestConfig(config, controlVariant, testVariant);

    // Calculate required sample size
    const sampleSizeAnalysis = this.calculateRequiredSampleSize(config);

    // Store test configuration
    const stmt = this.db.prepare(`
      INSERT INTO ab_tests (
        test_id, name, description, type, status,
        statistical_method, config_json, control_variant_id, test_variant_id,
        created_at, min_sample_size, target_power, significance_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
    `);

    stmt.run(
      testId,
      config.name,
      config.description,
      config.type,
      'PLANNING',
      config.statisticalMethod,
      JSON.stringify(config),
      controlVariant.id,
      testVariant.id,
      sampleSizeAnalysis.requiredSampleSize,
      config.targetPower,
      config.significanceLevel
    );

    // Store variants
    await this.storeTestVariants(testId, controlVariant, testVariant);

    this.emit('testCreated', { testId, config });

    return testId;
  }

  async startABTest(testId: string): Promise<void> {
    const test = await this.getTestById(testId);

    if (test.status !== 'READY') {
      throw new Error(`Test ${testId} is not ready to start. Current status: ${test.status}`);
    }

    // Update test status
    this.db.prepare(`
      UPDATE ab_tests
      SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP
      WHERE test_id = ?
    `).run(testId);

    // Activate test variants in ad platform
    await this.activateTestVariants(testId);

    this.emit('testStarted', { testId });
  }

  async analyzeABTest(testId: string): Promise<ABTestResult> {
    const test = await this.getTestById(testId);
    const data = await this.collectTestData(testId);

    // Perform statistical analysis based on method
    let analysis;
    if (test.config.statisticalMethod === 'BAYESIAN') {
      analysis = await this.performBayesianAnalysis(data, test.config);
    } else if (test.config.statisticalMethod === 'SEQUENTIAL') {
      analysis = await this.performSequentialAnalysis(data, test.config);
    } else {
      analysis = await this.performFrequentistAnalysis(data, test.config);
    }

    // Generate recommendations
    const recommendation = this.generateRecommendation(analysis, test.config);

    // Update test results in database
    await this.updateTestResults(testId, analysis, recommendation);

    const result: ABTestResult = {
      testId,
      status: test.status,
      startDate: test.startDate,
      endDate: test.endDate,
      control: data.control,
      test: data.test,
      analysis,
      recommendation
    };

    this.emit('testAnalyzed', { testId, result });

    return result;
  }

  async stopABTest(
    testId: string,
    reason: 'SUCCESS' | 'FAILURE' | 'INCONCLUSIVE' | 'MANUAL'
  ): Promise<void> {
    const analysis = await this.analyzeABTest(testId);

    // Update test status
    this.db.prepare(`
      UPDATE ab_tests
      SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP, stop_reason = ?
      WHERE test_id = ?
    `).run(reason, testId);

    // Implement winner (if applicable)
    if (reason === 'SUCCESS' && analysis.recommendation.winner !== 'INCONCLUSIVE') {
      await this.implementWinner(testId, analysis.recommendation.winner);
    }

    this.emit('testStopped', { testId, reason, analysis });
  }

  async checkEarlyStoppingConditions(testId: string): Promise<{
    shouldStop: boolean;
    reason?: 'EARLY_SUCCESS' | 'FUTILITY' | 'GUARDRAIL_VIOLATION';
    analysis?: any;
  }> {
    const test = await this.getTestById(testId);

    if (!test.config.earlyStoppingEnabled) {
      return { shouldStop: false };
    }

    const analysis = await this.analyzeABTest(testId);

    // Check for early success
    if (analysis.analysis.primaryMetricResult.statisticallySignificant &&
        analysis.analysis.primaryMetricResult.practicallySignificant) {
      return {
        shouldStop: true,
        reason: 'EARLY_SUCCESS',
        analysis
      };
    }

    // Check for futility (low probability of success)
    if (test.config.futilityStoppingEnabled) {
      const futilityCheck = this.checkFutility(analysis, test.config);
      if (futilityCheck.isFutile) {
        return {
          shouldStop: true,
          reason: 'FUTILITY',
          analysis
        };
      }
    }

    // Check guardrails
    const guardrailViolation = this.checkGuardrails(analysis, test.config);
    if (guardrailViolation.violated) {
      return {
        shouldStop: true,
        reason: 'GUARDRAIL_VIOLATION',
        analysis
      };
    }

    return { shouldStop: false };
  }

  private generateTestId(): string {
    return `ab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async validateTestConfig(
    config: ABTestConfig,
    control: CreativeVariant,
    test: CreativeVariant
  ): Promise<void> {
    // Validate traffic split adds to 100%
    if (config.trafficSplit.controlPercentage + config.trafficSplit.testPercentage !== 100) {
      throw new Error('Traffic split must add up to 100%');
    }

    // Validate variants are different enough
    const similarity = this.calculateVariantSimilarity(control, test);
    if (similarity > 0.9) {
      throw new Error('Test variants are too similar for meaningful testing');
    }

    // Validate duration constraints
    if (config.maxDurationDays <= config.minDurationDays) {
      throw new Error('Maximum duration must be greater than minimum duration');
    }
  }

  private calculateRequiredSampleSize(config: ABTestConfig): {
    requiredSampleSize: number;
    estimatedDuration: number;
  } {
    // Simplified sample size calculation for proportion tests
    const alpha = config.significanceLevel;
    const beta = 1 - config.targetPower;
    const delta = config.minDetectableEffect;

    // Baseline conversion rate assumption (should be data-driven in practice)
    const baselineRate = 0.05; // 5% baseline conversion rate

    // Sample size formula for two-proportion test
    const z_alpha = this.getZScore(1 - alpha / 2);
    const z_beta = this.getZScore(1 - beta);

    const p1 = baselineRate;
    const p2 = baselineRate * (1 + delta);
    const p_pooled = (p1 + p2) / 2;

    const numerator = Math.pow(z_alpha * Math.sqrt(2 * p_pooled * (1 - p_pooled)) +
                              z_beta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
    const denominator = Math.pow(p2 - p1, 2);

    const sampleSizePerGroup = Math.ceil(numerator / denominator);
    const totalSampleSize = sampleSizePerGroup * 2;

    // Estimate duration based on typical traffic
    const estimatedDailyTraffic = 1000; // Should be calculated from historical data
    const estimatedDuration = Math.ceil(totalSampleSize / estimatedDailyTraffic);

    return {
      requiredSampleSize: totalSampleSize,
      estimatedDuration: Math.max(estimatedDuration, config.minDurationDays)
    };
  }

  private getZScore(probability: number): number {
    // Simplified Z-score calculation for common values
    const zScores: { [key: string]: number } = {
      '0.975': 1.96,  // 95% confidence
      '0.995': 2.576, // 99% confidence
      '0.90': 1.282,  // 80% power
      '0.95': 1.645   // 90% power
    };

    const key = probability.toString();
    return zScores[key] || 1.96; // Default to 95% confidence
  }

  private calculateVariantSimilarity(variant1: CreativeVariant, variant2: CreativeVariant): number {
    // Simple text similarity calculation
    const text1 = [...variant1.content.headlines, ...variant1.content.descriptions].join(' ');
    const text2 = [...variant2.content.headlines, ...variant2.content.descriptions].join(' ');

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size; // Jaccard similarity
  }

  private async storeTestVariants(
    testId: string,
    control: CreativeVariant,
    test: CreativeVariant
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO ab_test_variants (
        test_id, variant_id, variant_type, ad_id, content_json, active
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(testId, control.id, 'CONTROL', control.adId, JSON.stringify(control.content), control.active ? 1 : 0);
    stmt.run(testId, test.id, 'TEST', test.adId, JSON.stringify(test.content), test.active ? 1 : 0);
  }

  private async activateTestVariants(testId: string): Promise<void> {
    // In a real implementation, this would call Google Ads API to activate variants
    // For now, we'll just update the database
    this.db.prepare(`
      UPDATE ab_test_variants
      SET active = 1, activated_at = CURRENT_TIMESTAMP
      WHERE test_id = ?
    `).run(testId);
  }

  private async collectTestData(testId: string): Promise<{
    control: ABTestResult['control'];
    test: ABTestResult['test'];
  }> {
    // In a real implementation, this would query Google Ads API for performance data
    // For now, we'll return mock data structure
    return {
      control: {
        sampleSize: 5000,
        conversions: 250,
        revenue: 25000,
        spend: 5000,
        metrics: {
          CTR: 0.05,
          CVR: 0.05,
          CPA: 20,
          ROAS: 5.0
        }
      },
      test: {
        sampleSize: 5000,
        conversions: 275,
        revenue: 27500,
        spend: 5200,
        metrics: {
          CTR: 0.055,
          CVR: 0.055,
          CPA: 18.9,
          ROAS: 5.29
        }
      }
    };
  }

  private async performFrequentistAnalysis(
    data: { control: any; test: any },
    config: ABTestConfig
  ): Promise<ABTestResult['analysis']> {
    // Simplified frequentist analysis
    const primaryMetric = config.primaryMetric;
    const controlValue = data.control.metrics[primaryMetric];
    const testValue = data.test.metrics[primaryMetric];

    const relativeChange = (testValue - controlValue) / controlValue;
    const absoluteChange = testValue - controlValue;

    // Simplified z-test for proportions
    const pValue = this.calculatePValue(data.control, data.test, primaryMetric);
    const isStatSig = pValue < config.significanceLevel;
    const isPracticalSig = Math.abs(relativeChange) > config.practicalSignificanceThreshold;

    return {
      primaryMetricResult: {
        metric: primaryMetric,
        controlValue,
        testValue,
        relativeChange,
        absoluteChange,
        pValue,
        confidenceInterval: {
          lower: relativeChange - 0.1,
          upper: relativeChange + 0.1,
          level: 0.95
        },
        statisticallySignificant: isStatSig,
        practicallySignificant: isPracticalSig
      },
      secondaryMetrics: config.secondaryMetrics.map(metric => ({
        metric,
        controlValue: data.control.metrics[metric],
        testValue: data.test.metrics[metric],
        relativeChange: (data.test.metrics[metric] - data.control.metrics[metric]) / data.control.metrics[metric],
        pValue: this.calculatePValue(data.control, data.test, metric),
        significant: this.calculatePValue(data.control, data.test, metric) < config.significanceLevel
      })),
      powerAnalysis: {
        currentPower: 0.8,
        requiredSampleSize: config.minSampleSize,
        timeToCompletion: 7
      }
    };
  }

  private async performBayesianAnalysis(
    data: { control: any; test: any },
    config: ABTestConfig
  ): Promise<ABTestResult['analysis']> {
    const frequentistResult = await this.performFrequentistAnalysis(data, config);

    // Add Bayesian components
    frequentistResult.bayesian = {
      probabilityTestBetter: 0.85,
      credibleInterval: {
        lower: -0.05,
        upper: 0.15
      },
      expectedLift: 0.05
    };

    return frequentistResult;
  }

  private async performSequentialAnalysis(
    data: { control: any; test: any },
    config: ABTestConfig
  ): Promise<ABTestResult['analysis']> {
    // Sequential analysis would implement SPRT or group sequential methods
    return this.performFrequentistAnalysis(data, config);
  }

  private calculatePValue(control: any, test: any, metric: string): number {
    // Simplified p-value calculation
    // In practice, this would use proper statistical tests
    return Math.random() * 0.1; // Mock p-value
  }

  private generateRecommendation(
    analysis: ABTestResult['analysis'],
    config: ABTestConfig
  ): ABTestResult['recommendation'] {
    const primaryResult = analysis.primaryMetricResult;

    let decision: ABTestResult['recommendation']['decision'] = 'CONTINUE';
    let winner: ABTestResult['recommendation']['winner'] = 'INCONCLUSIVE';
    let confidence = 0.5;
    const reasoning: string[] = [];
    const nextSteps: string[] = [];

    if (primaryResult.statisticallySignificant && primaryResult.practicallySignificant) {
      decision = 'STOP_SUCCESS';
      winner = primaryResult.testValue > primaryResult.controlValue ? 'TEST' : 'CONTROL';
      confidence = 1 - primaryResult.pValue;
      reasoning.push(`Statistically significant result (p=${primaryResult.pValue.toFixed(4)})`);
      reasoning.push(`Practically significant change (${(primaryResult.relativeChange * 100).toFixed(1)}%)`);
      nextSteps.push('Implement winning variant across all traffic');
    } else if (!primaryResult.statisticallySignificant) {
      reasoning.push('No statistically significant difference detected');
      nextSteps.push('Continue test or increase sample size');
    } else {
      reasoning.push('Statistically significant but not practically significant');
      nextSteps.push('Consider cost-benefit analysis before implementation');
    }

    return {
      decision,
      winner,
      confidence,
      reasoning,
      nextSteps
    };
  }

  private checkFutility(analysis: ABTestResult['analysis'], config: ABTestConfig): {
    isFutile: boolean;
    probability: number;
  } {
    // Simplified futility check
    // In practice, would calculate probability of achieving significance
    const currentEffect = Math.abs(analysis.primaryMetricResult.relativeChange);
    const requiredEffect = config.minDetectableEffect;

    const probability = currentEffect / requiredEffect;
    return {
      isFutile: probability < 0.1,
      probability
    };
  }

  private checkGuardrails(analysis: ABTestResult['analysis'], config: ABTestConfig): {
    violated: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // Check for negative impact beyond threshold
    if (analysis.primaryMetricResult.relativeChange < -config.maxNegativeImpact) {
      violations.push(`Primary metric declined by ${(analysis.primaryMetricResult.relativeChange * 100).toFixed(1)}%`);
    }

    return {
      violated: violations.length > 0,
      violations
    };
  }

  private async getTestById(testId: string): Promise<any> {
    const result = this.db.prepare(`
      SELECT * FROM ab_tests WHERE test_id = ?
    `).get(testId);

    if (!result) {
      throw new Error(`Test ${testId} not found`);
    }

    return {
      ...result,
      config: JSON.parse(result.config_json)
    };
  }

  private async updateTestResults(
    testId: string,
    analysis: ABTestResult['analysis'],
    recommendation: ABTestResult['recommendation']
  ): Promise<void> {
    this.db.prepare(`
      UPDATE ab_tests
      SET
        analysis_json = ?,
        recommendation_json = ?,
        last_analyzed = CURRENT_TIMESTAMP
      WHERE test_id = ?
    `).run(
      JSON.stringify(analysis),
      JSON.stringify(recommendation),
      testId
    );
  }

  private async implementWinner(testId: string, winner: 'CONTROL' | 'TEST'): Promise<void> {
    // In a real implementation, this would:
    // 1. Pause the losing variant
    // 2. Scale up the winning variant to 100% traffic
    // 3. Update campaign settings in Google Ads

    console.log(`Implementing winner: ${winner} for test ${testId}`);
  }

  private initializeTables(): void {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        test_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        statistical_method TEXT NOT NULL,
        config_json TEXT NOT NULL,
        control_variant_id TEXT,
        test_variant_id TEXT,
        created_at DATETIME,
        started_at DATETIME,
        ended_at DATETIME,
        stop_reason TEXT,
        min_sample_size INTEGER,
        target_power REAL,
        significance_level REAL,
        analysis_json TEXT,
        recommendation_json TEXT,
        last_analyzed DATETIME
      );

      CREATE TABLE IF NOT EXISTS ab_test_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        variant_type TEXT NOT NULL,
        ad_id TEXT,
        content_json TEXT,
        active BOOLEAN DEFAULT 0,
        activated_at DATETIME,
        FOREIGN KEY (test_id) REFERENCES ab_tests (test_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests (status);
      CREATE INDEX IF NOT EXISTS idx_ab_test_variants_test_id ON ab_test_variants (test_id);
    `);
  }
}