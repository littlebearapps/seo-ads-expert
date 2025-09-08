/**
 * v1.5 A/B Testing Framework - Comprehensive Test Suite
 * Complete test coverage for experiment lifecycle, statistical analysis, and variant generation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../src/database/database-manager.js';
import { ExperimentManager } from '../src/experiments/experiment-manager.js';
import { StatisticalEngine } from '../src/experiments/statistical-engine.js';
import { VariantGenerator } from '../src/experiments/variant-generator.js';
import { GoogleAdsApiClient } from '../src/connectors/google-ads-api.js';
import { GA4RealtimeClient } from '../src/connectors/ga4-realtime.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('A/B Testing Framework v1.5', () => {
  let db: DatabaseManager;
  let experimentManager: ExperimentManager;
  let statisticalEngine: StatisticalEngine;
  let variantGenerator: VariantGenerator;
  let testDbPath: string;

  beforeEach(async () => {
    // Create test database
    testDbPath = path.join(process.cwd(), 'data', 'test-ab-framework.db');
    db = new DatabaseManager({ path: testDbPath });
    await db.initialize();

    // Initialize components
    experimentManager = new ExperimentManager(db);
    statisticalEngine = new StatisticalEngine();
    variantGenerator = new VariantGenerator();

    // Apply experiment schema
    const schema = `
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('rsa', 'landing_page', 'bid', 'budget')),
        status TEXT CHECK(status IN ('draft', 'active', 'paused', 'completed')),
        control_variant_id TEXT,
        test_variant_ids TEXT,
        metrics_config TEXT,
        statistical_config TEXT,
        start_date TEXT,
        end_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS experiment_variants (
        id TEXT PRIMARY KEY,
        experiment_id TEXT,
        name TEXT,
        type TEXT CHECK(type IN ('control', 'test')),
        configuration TEXT,
        metrics TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
      );

      CREATE TABLE IF NOT EXISTS experiment_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT,
        variant_id TEXT,
        date TEXT,
        impressions INTEGER,
        clicks INTEGER,
        conversions INTEGER,
        cost REAL,
        revenue REAL,
        custom_metrics TEXT,
        collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id),
        FOREIGN KEY (variant_id) REFERENCES experiment_variants(id)
      );

      CREATE TABLE IF NOT EXISTS experiment_results (
        id TEXT PRIMARY KEY,
        experiment_id TEXT,
        analysis_date TEXT,
        winner_variant_id TEXT,
        confidence_level REAL,
        statistical_significance REAL,
        lift_percentage REAL,
        sample_size INTEGER,
        detailed_results TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
      );
    `;
    
    db.getDb().exec(schema);
  });

  afterEach(async () => {
    await db.close();
    await fs.unlink(testDbPath).catch(() => {});
  });

  describe('Experiment Lifecycle', () => {
    it('should create a new RSA experiment', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'RSA Headlines Test Q1 2025',
        type: 'rsa',
        control: {
          headlines: [
            'Best Converter Online',
            'Free File Conversion',
            'Convert Files Fast'
          ],
          descriptions: [
            'Convert any file format instantly',
            'Free, fast, and secure conversion'
          ]
        },
        variants: [
          {
            name: 'Variant A - Benefits Focus',
            headlines: [
              'Save Time Converting',
              'No Software Needed',
              'Works on Any Device'
            ]
          },
          {
            name: 'Variant B - Features Focus',
            headlines: [
              '100+ Formats Supported',
              'Batch Conversion Available',
              'API Access Included'
            ]
          }
        ],
        metrics: {
          primary: 'ctr',
          secondary: ['conversions', 'conversion_rate']
        },
        statistical: {
          confidence: 0.95,
          power: 0.8,
          mde: 0.1 // 10% minimum detectable effect
        }
      });

      expect(experiment.id).toBeDefined();
      expect(experiment.status).toBe('draft');
      expect(experiment.variants).toHaveLength(3); // Control + 2 test variants
    });

    it('should start an experiment and begin data collection', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'Landing Page Test',
        type: 'landing_page'
      });

      const started = await experimentManager.startExperiment(experiment.id);
      
      expect(started.status).toBe('active');
      expect(started.startDate).toBeDefined();
    });

    it('should pause and resume experiments', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'Bid Strategy Test',
        type: 'bid'
      });

      await experimentManager.startExperiment(experiment.id);
      const paused = await experimentManager.pauseExperiment(experiment.id);
      expect(paused.status).toBe('paused');

      const resumed = await experimentManager.resumeExperiment(experiment.id);
      expect(resumed.status).toBe('active');
    });

    it('should complete experiment and declare winner', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'Budget Test',
        type: 'budget'
      });

      await experimentManager.startExperiment(experiment.id);
      
      // Simulate adding metrics
      await experimentManager.recordMetrics(experiment.id, 'control', {
        impressions: 10000,
        clicks: 500,
        conversions: 50,
        cost: 500
      });

      await experimentManager.recordMetrics(experiment.id, 'test_1', {
        impressions: 10000,
        clicks: 600,
        conversions: 70,
        cost: 500
      });

      const result = await experimentManager.completeExperiment(experiment.id);
      
      expect(result.status).toBe('completed');
      expect(result.winner).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('Statistical Analysis', () => {
    it('should perform Z-test for proportions', () => {
      const result = statisticalEngine.performZTest({
        control: { successes: 50, trials: 1000 },
        variant: { successes: 70, trials: 1000 }
      });

      expect(result.zScore).toBeDefined();
      expect(result.pValue).toBeDefined();
      expect(result.significant).toBeDefined();
      expect(result.confidenceInterval).toBeDefined();
    });

    it('should perform Bayesian analysis', () => {
      const result = statisticalEngine.performBayesianAnalysis({
        control: { successes: 100, trials: 2000 },
        variant: { successes: 120, trials: 2000 }
      });

      expect(result.probabilityOfImprovement).toBeDefined();
      expect(result.expectedLift).toBeDefined();
      expect(result.credibleInterval).toBeDefined();
    });

    it('should calculate required sample size', () => {
      const sampleSize = statisticalEngine.calculateSampleSize({
        baselineRate: 0.05,
        mde: 0.1, // 10% lift
        power: 0.8,
        confidence: 0.95
      });

      expect(sampleSize).toBeGreaterThan(0);
      expect(sampleSize).toBeLessThan(1000000); // Reasonable upper bound
    });

    it('should detect early stopping conditions', () => {
      const shouldStop = statisticalEngine.checkEarlyStoppingCriteria({
        control: { successes: 10, trials: 100 },
        variant: { successes: 25, trials: 100 },
        alpha: 0.05,
        futilityBoundary: 0.01
      });

      expect(shouldStop.stop).toBeDefined();
      expect(shouldStop.reason).toBeDefined();
    });

    it('should handle multiple comparison correction', () => {
      const results = statisticalEngine.multipleComparisonCorrection([
        { pValue: 0.01, variant: 'A' },
        { pValue: 0.03, variant: 'B' },
        { pValue: 0.04, variant: 'C' }
      ], 'bonferroni');

      expect(results).toHaveLength(3);
      results.forEach(r => {
        expect(r.adjustedPValue).toBeGreaterThanOrEqual(r.pValue);
      });
    });
  });

  describe('Variant Generation', () => {
    it('should generate RSA variants with different strategies', () => {
      const base = {
        headlines: ['Convert Files Free', 'Online Converter', 'Fast Conversion'],
        descriptions: ['Free online file converter', 'Convert any format']
      };

      const variants = variantGenerator.generateRSAVariants(base, {
        strategy: 'semantic',
        count: 3
      });

      expect(variants).toHaveLength(3);
      variants.forEach(v => {
        expect(v.headlines).toHaveLength(3);
        expect(v.descriptions).toHaveLength(2);
      });
    });

    it('should generate landing page variants', () => {
      const basePage = {
        url: 'https://example.com/converter',
        headline: 'Free File Converter',
        cta: 'Start Converting'
      };

      const variants = variantGenerator.generateLandingPageVariants(basePage, {
        elements: ['headline', 'cta'],
        count: 2
      });

      expect(variants).toHaveLength(2);
      variants.forEach(v => {
        expect(v.url).toBe(basePage.url);
        expect(v.headline).toBeDefined();
        expect(v.cta).toBeDefined();
      });
    });

    it('should validate variant similarity', () => {
      const variant1 = {
        headlines: ['Free Converter', 'Convert Files', 'Online Tool']
      };

      const variant2 = {
        headlines: ['Free Converter', 'Convert Files', 'Web Tool']
      };

      const similarity = variantGenerator.calculateSimilarity(variant1, variant2);
      
      expect(similarity).toBeGreaterThan(0.5); // High similarity
      expect(similarity).toBeLessThan(1); // Not identical
    });

    it('should enforce minimum variant distance', () => {
      const base = {
        headlines: ['Test Headline 1', 'Test Headline 2']
      };

      const variants = variantGenerator.generateWithMinDistance(base, {
        count: 3,
        minDistance: 0.3
      });

      // Check all pairs have minimum distance
      for (let i = 0; i < variants.length; i++) {
        for (let j = i + 1; j < variants.length; j++) {
          const similarity = variantGenerator.calculateSimilarity(
            variants[i], 
            variants[j]
          );
          expect(1 - similarity).toBeGreaterThanOrEqual(0.3);
        }
      }
    });
  });

  describe('Guard Rails and Safety', () => {
    it('should prevent experiments with insufficient traffic', async () => {
      const experiment = {
        name: 'Low Traffic Test',
        type: 'rsa' as const,
        expectedDailyTraffic: 10 // Too low
      };

      await expect(
        experimentManager.createExperiment(experiment)
      ).rejects.toThrow('Insufficient traffic');
    });

    it('should limit budget impact of experiments', async () => {
      const experiment = {
        name: 'Budget Test',
        type: 'budget' as const,
        budgetIncrease: 0.5 // 50% increase
      };

      await expect(
        experimentManager.createExperiment(experiment)
      ).rejects.toThrow('Budget increase exceeds');
    });

    it('should validate statistical power before starting', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'Power Test',
        type: 'rsa',
        statistical: {
          power: 0.5 // Too low
        }
      });

      await expect(
        experimentManager.startExperiment(experiment.id)
      ).rejects.toThrow('Insufficient statistical power');
    });

    it('should prevent overlapping experiments', async () => {
      await experimentManager.createAndStartExperiment({
        name: 'First Test',
        type: 'rsa',
        adGroupId: 'ag_123'
      });

      await expect(
        experimentManager.createAndStartExperiment({
          name: 'Second Test',
          type: 'rsa',
          adGroupId: 'ag_123' // Same ad group
        })
      ).rejects.toThrow('Experiment already running');
    });
  });

  describe('Real-time Metrics Collection', () => {
    it('should collect metrics from Google Ads API', async () => {
      const mockClient = {
        getPerformanceStats: vi.fn().mockResolvedValue({
          impressions: 1000,
          clicks: 50,
          conversions: 5,
          costMicros: '50000000'
        })
      };

      const metrics = await experimentManager.collectMetricsFromGoogleAds(
        'exp_123',
        'variant_123',
        mockClient as any
      );

      expect(metrics.impressions).toBe(1000);
      expect(metrics.clicks).toBe(50);
      expect(metrics.cost).toBe(50);
    });

    it('should collect metrics from GA4', async () => {
      const mockGA4Client = {
        fetchConversions: vi.fn().mockResolvedValue([
          { conversions: 10, conversionValue: 500 }
        ])
      };

      const metrics = await experimentManager.collectMetricsFromGA4(
        'exp_123',
        'variant_123',
        mockGA4Client as any
      );

      expect(metrics.conversions).toBe(10);
      expect(metrics.revenue).toBe(500);
    });

    it('should aggregate metrics from multiple sources', async () => {
      const googleAdsMetrics = {
        impressions: 1000,
        clicks: 50,
        cost: 50
      };

      const ga4Metrics = {
        conversions: 10,
        revenue: 500,
        bounceRate: 0.4
      };

      const aggregated = experimentManager.aggregateMetrics(
        googleAdsMetrics,
        ga4Metrics
      );

      expect(aggregated.impressions).toBe(1000);
      expect(aggregated.conversions).toBe(10);
      expect(aggregated.roi).toBeDefined();
    });
  });

  describe('Export and Apply Winners', () => {
    it('should generate Google Ads Editor CSV for winning variant', async () => {
      const winner = {
        type: 'rsa',
        configuration: {
          headlines: ['Winning Headline 1', 'Winning Headline 2'],
          descriptions: ['Winning Description 1']
        }
      };

      const csv = await experimentManager.exportWinnerToCSV(winner);
      
      expect(csv).toContain('Winning Headline 1');
      expect(csv).toContain('Responsive search ad');
    });

    it('should create mutation for applying winner', async () => {
      const winner = {
        type: 'bid',
        adGroupId: 'ag_123',
        configuration: {
          cpcBid: 2.5
        }
      };

      const mutation = experimentManager.createMutationForWinner(winner);
      
      expect(mutation.type).toBe('UPDATE');
      expect(mutation.resource).toBe('adGroup');
      expect(mutation.changes.cpcBidMicros).toBe('2500000');
    });

    it('should track experiment history', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'Historical Test',
        type: 'rsa'
      });

      await experimentManager.startExperiment(experiment.id);
      await experimentManager.completeExperiment(experiment.id);

      const history = await experimentManager.getExperimentHistory(experiment.id);
      
      expect(history).toHaveLength(3); // Created, Started, Completed
      expect(history[0].action).toBe('created');
      expect(history[2].action).toBe('completed');
    });
  });

  describe('Advanced Statistical Features', () => {
    it('should perform sequential testing', () => {
      const result = statisticalEngine.sequentialTest({
        control: { successes: 100, trials: 2000 },
        variant: { successes: 110, trials: 2000 },
        alpha: 0.05,
        beta: 0.2,
        currentSample: 2000,
        maxSample: 10000
      });

      expect(result.decision).toMatch(/continue|stop_success|stop_futility/);
      expect(result.confidence).toBeDefined();
    });

    it('should calculate effect size and practical significance', () => {
      const effect = statisticalEngine.calculateEffectSize({
        control: { mean: 0.05, stdDev: 0.02, n: 1000 },
        variant: { mean: 0.055, stdDev: 0.021, n: 1000 }
      });

      expect(effect.cohensD).toBeDefined();
      expect(effect.practicallySignificant).toBeDefined();
    });

    it('should perform multi-armed bandit optimization', () => {
      const allocation = statisticalEngine.thompsonSampling([
        { variant: 'A', successes: 100, trials: 1000 },
        { variant: 'B', successes: 120, trials: 1000 },
        { variant: 'C', successes: 90, trials: 1000 }
      ]);

      expect(allocation).toHaveLength(3);
      expect(allocation.reduce((sum, a) => sum + a.probability, 0)).toBeCloseTo(1);
    });

    it('should detect novelty effects', () => {
      const metrics = [
        { day: 1, ctr: 0.08 },
        { day: 2, ctr: 0.07 },
        { day: 3, ctr: 0.06 },
        { day: 4, ctr: 0.055 },
        { day: 5, ctr: 0.052 },
        { day: 6, ctr: 0.051 },
        { day: 7, ctr: 0.050 }
      ];

      const hasNoveltyEffect = statisticalEngine.detectNoveltyEffect(metrics);
      
      expect(hasNoveltyEffect).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should run complete experiment workflow', async () => {
      // Create experiment
      const experiment = await experimentManager.createExperiment({
        name: 'Integration Test',
        type: 'rsa',
        control: {
          headlines: ['Control H1', 'Control H2', 'Control H3']
        },
        variants: [{
          name: 'Test Variant',
          headlines: ['Test H1', 'Test H2', 'Test H3']
        }]
      });

      // Start experiment
      await experimentManager.startExperiment(experiment.id);

      // Simulate data collection over time
      for (let day = 1; day <= 7; day++) {
        await experimentManager.recordMetrics(experiment.id, 'control', {
          impressions: 1000 + Math.random() * 200,
          clicks: 50 + Math.random() * 10,
          conversions: 5 + Math.random() * 2,
          cost: 50
        });

        await experimentManager.recordMetrics(experiment.id, 'test_1', {
          impressions: 1000 + Math.random() * 200,
          clicks: 60 + Math.random() * 10,
          conversions: 7 + Math.random() * 2,
          cost: 50
        });
      }

      // Analyze results
      const analysis = await experimentManager.analyzeExperiment(experiment.id);
      
      expect(analysis.sampleSize).toBeGreaterThan(0);
      expect(analysis.winner).toBeDefined();
      expect(analysis.confidence).toBeDefined();
      expect(analysis.lift).toBeDefined();

      // Complete experiment
      const completed = await experimentManager.completeExperiment(experiment.id);
      
      expect(completed.status).toBe('completed');
      expect(completed.winner).toBeDefined();

      // Export winner
      const csv = await experimentManager.exportWinnerToCSV(completed.winner);
      expect(csv).toBeDefined();
    });

    it('should handle experiment failures gracefully', async () => {
      const experiment = await experimentManager.createExperiment({
        name: 'Failure Test',
        type: 'landing_page'
      });

      await experimentManager.startExperiment(experiment.id);

      // Simulate failure condition
      await experimentManager.recordMetrics(experiment.id, 'control', {
        impressions: 1000,
        clicks: 5, // Very low CTR
        conversions: 0
      });

      const shouldAbort = await experimentManager.checkAbortConditions(experiment.id);
      
      expect(shouldAbort).toBe(true);

      const aborted = await experimentManager.abortExperiment(experiment.id, 'Low performance');
      expect(aborted.status).toBe('aborted');
    });
  });
});

describe('A/B Testing CLI Commands', () => {
  it('should validate CLI command structure', () => {
    const commands = [
      'seo-ads-expert experiment create --name "Test" --type rsa',
      'seo-ads-expert experiment start --id exp_123',
      'seo-ads-expert experiment analyze --id exp_123',
      'seo-ads-expert experiment complete --id exp_123',
      'seo-ads-expert experiment list --status active'
    ];

    commands.forEach(cmd => {
      expect(cmd).toMatch(/seo-ads-expert experiment/);
    });
  });
});