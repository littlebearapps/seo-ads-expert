import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import pino from 'pino';
import { CreativePerformanceAnalyzer } from '../creative/creative-performance-analyzer';
import { RotationOptimizer } from '../creative/rotation-optimizer';
import { ABTestingFramework } from '../creative/ab-testing-framework';
import { FatigueDetector } from '../creative/fatigue-detector';
import { WinnerSelection } from '../creative/winner-selection';

describe('Creative Optimization System', () => {
  let db: Database.Database;
  let creativeAnalyzer: CreativePerformanceAnalyzer;
  let rotationOptimizer: RotationOptimizer;
  let abTestFramework: ABTestingFramework;
  let fatigueDetector: FatigueDetector;
  let winnerSelection: WinnerSelection;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');

    // Create a test logger that doesn't output during tests
    const logger = pino({ level: 'silent' });

    // Initialize all components
    creativeAnalyzer = new CreativePerformanceAnalyzer(db, logger);
    rotationOptimizer = new RotationOptimizer(db, logger);
    abTestFramework = new ABTestingFramework(db, logger);
    fatigueDetector = new FatigueDetector(db, logger);
    winnerSelection = new WinnerSelection(db, abTestFramework, fatigueDetector, creativeAnalyzer);

    // Set up test data
    setupTestData();
  });

  afterEach(() => {
    db.close();
  });

  function setupTestData() {
    // Create basic schema for testing
    db.exec(`
      CREATE TABLE IF NOT EXISTS ads (
        ad_id TEXT PRIMARY KEY,
        ad_group_id TEXT,
        campaign_id TEXT,
        status TEXT DEFAULT 'ENABLED',
        created_date DATE DEFAULT CURRENT_DATE
      );

      CREATE TABLE IF NOT EXISTS ad_groups (
        ad_group_id TEXT PRIMARY KEY,
        campaign_id TEXT,
        rotation_strategy TEXT DEFAULT 'EVEN'
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT DEFAULT 'ENABLED'
      );

      CREATE TABLE IF NOT EXISTS daily_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_id TEXT,
        date DATE,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost_micros INTEGER DEFAULT 0,
        frequency REAL DEFAULT 1.0,
        reach_percent REAL DEFAULT 50.0
      );

      CREATE TABLE IF NOT EXISTS ad_creatives (
        ad_id TEXT PRIMARY KEY,
        ad_group_id TEXT,
        campaign_id TEXT,
        ad_type TEXT DEFAULT 'TEXT_AD',
        status TEXT DEFAULT 'ENABLED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
        headlines TEXT,
        descriptions TEXT,
        image_url TEXT,
        video_url TEXT,
        final_url TEXT,
        display_url TEXT,
        rotation_weight REAL DEFAULT 0.5,
        last_rotation_update DATETIME,
        days_since_last_rotation INTEGER DEFAULT 0
      );
    `);

    // Insert test data
    const testData = {
      campaigns: [
        { campaign_id: 'camp_001', name: 'Test Campaign 1' },
        { campaign_id: 'camp_002', name: 'Test Campaign 2' }
      ],
      adGroups: [
        { ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_group_id: 'ag_002', campaign_id: 'camp_001' }
      ],
      ads: [
        { ad_id: 'ad_001', ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_id: 'ad_002', ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_id: 'ad_003', ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_id: 'ad_004', ad_group_id: 'ag_002', campaign_id: 'camp_001' }
      ],
      adCreatives: [
        { ad_id: 'ad_001', ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_id: 'ad_002', ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_id: 'ad_003', ad_group_id: 'ag_001', campaign_id: 'camp_001' },
        { ad_id: 'ad_004', ad_group_id: 'ag_002', campaign_id: 'camp_001' }
      ]
    };

    // Insert campaigns
    const insertCampaign = db.prepare('INSERT INTO campaigns (campaign_id, name) VALUES (?, ?)');
    testData.campaigns.forEach(c => insertCampaign.run(c.campaign_id, c.name));

    // Insert ad groups
    const insertAdGroup = db.prepare('INSERT INTO ad_groups (ad_group_id, campaign_id) VALUES (?, ?)');
    testData.adGroups.forEach(ag => insertAdGroup.run(ag.ad_group_id, ag.campaign_id));

    // Insert ads
    const insertAd = db.prepare('INSERT INTO ads (ad_id, ad_group_id, campaign_id) VALUES (?, ?, ?)');
    testData.ads.forEach(a => insertAd.run(a.ad_id, a.ad_group_id, a.campaign_id));

    // Insert ad creatives
    const insertCreative = db.prepare('INSERT INTO ad_creatives (ad_id, ad_group_id, campaign_id) VALUES (?, ?, ?)');
    testData.adCreatives.forEach(ac => insertCreative.run(ac.ad_id, ac.ad_group_id, ac.campaign_id));

    // Insert performance data
    const insertPerformance = db.prepare(`
      INSERT INTO daily_performance (ad_id, date, impressions, clicks, conversions, cost_micros)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Generate 30 days of performance data for each ad
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      testData.ads.forEach((ad, index) => {
        // Create different performance patterns for each ad
        const baseImpressions = 1000 + (index * 500);
        const baseCTR = 0.02 + (index * 0.01); // Different CTRs for each ad
        const baseCVR = 0.05 + (index * 0.01);

        // Add some variance and trends
        const dayVariance = Math.random() * 0.2 - 0.1; // ±10% daily variance
        const trendFactor = i < 15 ? 1 + (i * 0.01) : 1 - ((i - 15) * 0.02); // Declining trend for fatigue

        const impressions = Math.floor(baseImpressions * (1 + dayVariance) * trendFactor);
        const clicks = Math.floor(impressions * baseCTR * (1 + dayVariance) * trendFactor);
        const conversions = Math.floor(clicks * baseCVR * (1 + dayVariance));
        const costMicros = clicks * 250000; // $0.25 per click

        insertPerformance.run(ad.ad_id, dateStr, impressions, clicks, conversions, costMicros);
      });
    }
  }

  describe('CreativePerformanceAnalyzer', () => {
    it('should analyze ad group creative performance', async () => {
      const analysis = await creativeAnalyzer.analyzeAdGroupCreatives('ag_001', 30);

      expect(analysis).toBeDefined();
      expect(analysis.adGroupId).toBe('ag_001');
      expect(analysis.totalCreatives).toBeGreaterThanOrEqual(3);
      expect(analysis.topPerformers).toBeDefined();
      expect(analysis.poorPerformers).toBeDefined();
      expect(analysis.overallHealth).toBeDefined();
      expect(analysis.overallHealth.score).toBeGreaterThanOrEqual(0);
    });

    it('should calculate performance scores correctly', async () => {
      const analysis = await creativeAnalyzer.analyzeAdGroupCreatives('ag_001', 30);

      // Test both top and poor performers have valid performance scores
      const allPerformers = [...analysis.topPerformers, ...analysis.poorPerformers];
      allPerformers.forEach(creative => {
        expect(creative.performanceScore).toBeGreaterThanOrEqual(0);
        expect(creative.performanceScore).toBeLessThanOrEqual(100);
        expect(creative.aggregatedMetrics.ctr).toBeGreaterThanOrEqual(0);
        expect(creative.aggregatedMetrics.cvr).toBeGreaterThanOrEqual(0);
        expect(creative.trends).toBeDefined();
      });
    });

    it('should generate optimization recommendations', async () => {
      const analysis = await creativeAnalyzer.analyzeAdGroupCreatives('ag_001', 30);

      expect(analysis.recommendations).toBeDefined();
      expect(analysis.recommendations.immediate).toBeDefined();
      expect(analysis.recommendations.shortTerm).toBeDefined();
      expect(analysis.recommendations.strategic).toBeDefined();
      expect(Array.isArray(analysis.recommendations.immediate)).toBe(true);
      expect(Array.isArray(analysis.recommendations.shortTerm)).toBe(true);
      expect(Array.isArray(analysis.recommendations.strategic)).toBe(true);
    });
  });

  describe('RotationOptimizer', () => {
    it('should analyze rotation strategy', async () => {
      const config = {
        strategy: 'OPTIMIZE' as const,
        minImpressions: 100,
        maxActiveCreatives: 10,
        rotationInterval: 7,
        performanceThreshold: 50,
        learningPeriod: 14,
        confidenceLevel: 0.95
      };

      const analysis = await rotationOptimizer.analyzeRotationStrategy('ag_001', config);

      expect(analysis).toBeDefined();
      expect(analysis.adGroupId).toBe('ag_001');
      expect(analysis.currentRotation).toBeDefined();
      expect(analysis.performance).toBeDefined();
      expect(analysis.opportunities).toBeDefined();
    });

    it('should generate rotation recommendations', async () => {
      const config = {
        strategy: 'OPTIMIZE' as const,
        minImpressions: 100,
        maxActiveCreatives: 10,
        rotationInterval: 7,
        performanceThreshold: 50,
        learningPeriod: 14,
        confidenceLevel: 0.95
      };

      const recommendation = await rotationOptimizer.generateRotationRecommendation('ag_001', config);

      expect(recommendation).toBeDefined();
      expect(recommendation.adGroupId).toBe('ag_001');
      expect(recommendation.currentStrategy).toBeDefined();
      expect(recommendation.recommendedStrategy).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
      expect(recommendation.reasoning).toBeDefined();
      expect(Array.isArray(recommendation.reasoning)).toBe(true);
      expect(recommendation.expectedImpact).toBeDefined();
      expect(recommendation.actionItems).toBeDefined();
      expect(recommendation.rotationSchedule).toBeDefined();
    });

    it('should optimize ad rotation', async () => {
      const config = {
        strategy: 'OPTIMIZE' as const,
        minImpressions: 100,
        maxActiveCreatives: 10,
        rotationInterval: 7,
        performanceThreshold: 50,
        learningPeriod: 14,
        confidenceLevel: 0.95
      };

      const result = await rotationOptimizer.optimizeAdRotation('ag_001', config);

      expect(result).toBeDefined();
      expect(result.implemented).toBe(true);
      expect(result.changes).toBeDefined();
      expect(Array.isArray(result.changes)).toBe(true);
      expect(result.nextReviewDate).toBeDefined();
    });
  });

  describe('ABTestingFramework', () => {
    it('should create A/B test', async () => {
      const config = {
        name: 'Test Creative A/B',
        description: 'Testing new creative variants',
        type: 'CREATIVE_SPLIT' as const,
        statisticalMethod: 'FREQUENTIST' as const,
        trafficSplit: { controlPercentage: 50, testPercentage: 50 },
        minDurationDays: 14,
        maxDurationDays: 30,
        minSampleSize: 1000,
        primaryMetric: 'CTR' as const,
        secondaryMetrics: ['CVR' as const, 'CPA' as const],
        minDetectableEffect: 0.05,
        practicalSignificanceThreshold: 0.05,
        significanceLevel: 0.05,
        targetPower: 0.8,
        earlyStoppingEnabled: true,
        earlyStoppingCheckInterval: 1,
        futilityStoppingEnabled: true,
        maxNegativeImpact: 0.2,
        maxSpendIncrease: 0.5
      };

      const controlVariant = {
        id: 'control_001',
        name: 'Original Creative',
        adId: 'ad_001',
        type: 'CONTROL' as const,
        content: {
          headlines: ['Original Headline'],
          descriptions: ['Original Description']
        },
        active: true
      };

      const testVariant = {
        id: 'test_001',
        name: 'New Creative',
        adId: 'ad_002',
        type: 'TEST' as const,
        content: {
          headlines: ['New Headline'],
          descriptions: ['New Description']
        },
        active: true
      };

      const testId = await abTestFramework.createABTest(config, controlVariant, testVariant);

      expect(testId).toBeDefined();
      expect(typeof testId).toBe('string');
      expect(testId).toMatch(/^ab_/);
    });

    it('should start A/B test', async () => {
      // First create a test
      const config = {
        name: 'Test Creative A/B',
        description: 'Testing new creative variants',
        type: 'CREATIVE_SPLIT' as const,
        statisticalMethod: 'FREQUENTIST' as const,
        trafficSplit: { controlPercentage: 50, testPercentage: 50 },
        minDurationDays: 14,
        maxDurationDays: 30,
        minSampleSize: 1000,
        primaryMetric: 'CTR' as const,
        secondaryMetrics: ['CVR' as const, 'CPA' as const],
        minDetectableEffect: 0.05,
        practicalSignificanceThreshold: 0.05,
        significanceLevel: 0.05,
        targetPower: 0.8,
        earlyStoppingEnabled: true,
        earlyStoppingCheckInterval: 1,
        futilityStoppingEnabled: true,
        maxNegativeImpact: 0.2,
        maxSpendIncrease: 0.5
      };

      const controlVariant = {
        id: 'control_002',
        name: 'Original Creative',
        adId: 'ad_001',
        type: 'CONTROL' as const,
        content: {
          headlines: ['Original Headline'],
          descriptions: ['Original Description']
        },
        active: true
      };

      const testVariant = {
        id: 'test_002',
        name: 'New Creative',
        adId: 'ad_002',
        type: 'TEST' as const,
        content: {
          headlines: ['New Headline'],
          descriptions: ['New Description']
        },
        active: true
      };

      const testId = await abTestFramework.createABTest(config, controlVariant, testVariant);

      // Update test status to READY (would normally be done by system)
      db.prepare('UPDATE ab_tests SET status = ? WHERE test_id = ?').run('READY', testId);

      // Start the test
      await abTestFramework.startABTest(testId);

      // Verify test was started
      const testRecord = db.prepare('SELECT * FROM ab_tests WHERE test_id = ?').get(testId) as any;
      expect(testRecord.status).toBe('RUNNING');
      expect(testRecord.started_at).toBeDefined();
    });

    it('should analyze A/B test results', async () => {
      // Create and prepare a test with mock data
      const config = {
        name: 'Analysis Test',
        description: 'Test for analysis',
        type: 'CREATIVE_SPLIT' as const,
        statisticalMethod: 'FREQUENTIST' as const,
        trafficSplit: { controlPercentage: 50, testPercentage: 50 },
        minDurationDays: 14,
        maxDurationDays: 30,
        minSampleSize: 1000,
        primaryMetric: 'CTR' as const,
        secondaryMetrics: ['CVR' as const],
        minDetectableEffect: 0.05,
        practicalSignificanceThreshold: 0.05,
        significanceLevel: 0.05,
        targetPower: 0.8,
        earlyStoppingEnabled: true,
        earlyStoppingCheckInterval: 1,
        futilityStoppingEnabled: true,
        maxNegativeImpact: 0.2,
        maxSpendIncrease: 0.5
      };

      const controlVariant = {
        id: 'control_003',
        name: 'Control',
        adId: 'ad_001',
        type: 'CONTROL' as const,
        content: { headlines: ['Control'], descriptions: ['Control'] },
        active: true
      };

      const testVariant = {
        id: 'test_003',
        name: 'Test',
        adId: 'ad_002',
        type: 'TEST' as const,
        content: { headlines: ['Test'], descriptions: ['Test'] },
        active: true
      };

      const testId = await abTestFramework.createABTest(config, controlVariant, testVariant);

      // Update status and dates
      db.prepare(`
        UPDATE ab_tests
        SET status = 'RUNNING', started_at = datetime('now', '-7 days')
        WHERE test_id = ?
      `).run(testId);

      const result = await abTestFramework.analyzeABTest(testId);

      expect(result).toBeDefined();
      expect(result.testId).toBe(testId);
      expect(result.status).toBe('RUNNING');
      expect(result.control).toBeDefined();
      expect(result.test).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.analysis.primaryMetricResult).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('FatigueDetector', () => {
    it('should detect creative fatigue', async () => {
      const analysis = await fatigueDetector.detectFatigue('ad_001');

      expect(analysis).toBeDefined();
      expect(analysis.adId).toBe('ad_001');
      expect(analysis.overallFatigue).toBeDefined();
      expect(analysis.overallFatigue.level).toMatch(/^(NONE|MILD|MODERATE|SEVERE|CRITICAL)$/);
      expect(analysis.overallFatigue.score).toBeGreaterThanOrEqual(0);
      expect(analysis.overallFatigue.score).toBeLessThanOrEqual(100);
      expect(analysis.signals).toBeDefined();
      expect(Array.isArray(analysis.signals)).toBe(true);
      expect(analysis.performance).toBeDefined();
      expect(analysis.predictions).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
    });

    it('should batch detect fatigue across multiple ads', async () => {
      const adIds = ['ad_001', 'ad_002', 'ad_003'];
      const analyses = await fatigueDetector.batchFatigueDetection(adIds);

      expect(analyses).toBeDefined();
      expect(Array.isArray(analyses)).toBe(true);
      expect(analyses.length).toBe(3);

      analyses.forEach((analysis, index) => {
        expect(analysis.adId).toBe(adIds[index]);
        expect(analysis.overallFatigue).toBeDefined();
      });
    });

    it('should detect campaign-level fatigue', async () => {
      const campaignAnalysis = await fatigueDetector.detectCampaignFatigue('camp_001');

      expect(campaignAnalysis).toBeDefined();
      expect(campaignAnalysis.campaignId).toBe('camp_001');
      expect(campaignAnalysis.overallFatigueLevel).toMatch(/^(NONE|MILD|MODERATE|SEVERE|CRITICAL)$/);
      expect(campaignAnalysis.adAnalyses).toBeDefined();
      expect(Array.isArray(campaignAnalysis.adAnalyses)).toBe(true);
      expect(campaignAnalysis.campaignMetrics).toBeDefined();
      expect(campaignAnalysis.recommendations).toBeDefined();
    });

    it('should generate fatigue signals correctly', async () => {
      const analysis = await fatigueDetector.detectFatigue('ad_001');

      analysis.signals.forEach(signal => {
        expect(signal.type).toMatch(/^(CTR_DECLINE|CVR_DECLINE|FREQUENCY_INCREASE|CPC_INCREASE|IMPRESSION_SHARE_DROP|AUDIENCE_SATURATION|CREATIVE_STALENESS|SEASONAL_EFFECT)$/);
        expect(signal.severity).toMatch(/^(NONE|MILD|MODERATE|SEVERE|CRITICAL)$/);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.trend).toMatch(/^(IMPROVING|STABLE|DECLINING|VOLATILE)$/);
        expect(signal.timeframe).toBeDefined();
        expect(signal.metrics).toBeDefined();
        expect(signal.description).toBeDefined();
        expect(signal.recommendation).toBeDefined();
      });
    });
  });

  describe('WinnerSelection', () => {
    it('should evaluate winner from A/B test', async () => {
      // First create a test
      const config = {
        name: 'Winner Selection Test',
        description: 'Test for winner selection',
        type: 'CREATIVE_SPLIT' as const,
        statisticalMethod: 'FREQUENTIST' as const,
        trafficSplit: { controlPercentage: 50, testPercentage: 50 },
        minDurationDays: 14,
        maxDurationDays: 30,
        minSampleSize: 1000,
        primaryMetric: 'CTR' as const,
        secondaryMetrics: ['CVR' as const],
        minDetectableEffect: 0.05,
        practicalSignificanceThreshold: 0.05,
        significanceLevel: 0.05,
        targetPower: 0.8,
        earlyStoppingEnabled: true,
        earlyStoppingCheckInterval: 1,
        futilityStoppingEnabled: true,
        maxNegativeImpact: 0.2,
        maxSpendIncrease: 0.5
      };

      const controlVariant = {
        id: 'control_winner',
        name: 'Control Winner',
        adId: 'ad_001',
        type: 'CONTROL' as const,
        content: { headlines: ['Control'], descriptions: ['Control'] },
        active: true
      };

      const testVariant = {
        id: 'test_winner',
        name: 'Test Winner',
        adId: 'ad_002',
        type: 'TEST' as const,
        content: { headlines: ['Test'], descriptions: ['Test'] },
        active: true
      };

      const testId = await abTestFramework.createABTest(config, controlVariant, testVariant);

      // Set test as completed
      db.prepare(`
        UPDATE ab_tests
        SET status = 'COMPLETED',
            started_at = datetime('now', '-20 days'),
            ended_at = datetime('now', '-1 days')
        WHERE test_id = ?
      `).run(testId);

      const selectionCriteria = {
        primaryMetric: 'CTR' as const,
        secondaryMetrics: ['CVR' as const],
        minConfidenceLevel: 0.95,
        minSampleSize: 1000,
        minTestDuration: 14,
        minPracticalSignificance: 0.05,
        maxTolerableDecline: 0.1,
        maxBudgetIncrease: 0.5,
        minROI: 2,
        riskTolerance: 'MODERATE' as const,
        requireUnanimousSignificance: false,
        minQualityScore: 7,
        maxFatigueLevel: 'MILD' as const
      };

      const result = await winnerSelection.evaluateWinner(testId, selectionCriteria);

      expect(result).toBeDefined();
      expect(result.selectionId).toBeDefined();
      expect(result.testId).toBe(testId);
      expect(result.decision).toMatch(/^(SELECT_WINNER|CONTINUE_TEST|DECLARE_INCONCLUSIVE|ABORT_TEST)$/);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.statisticalValidation).toBeDefined();
      expect(result.analysis.businessValidation).toBeDefined();
      expect(result.analysis.riskAssessment).toBeDefined();
      expect(result.analysis.performanceProjection).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });

    it('should implement winner when decision is SELECT_WINNER', async () => {
      // Create a mock selection result
      const testId = 'test_implementation';
      const selectionId = 'sel_test_impl';

      // Insert a completed selection into the database
      db.prepare(`
        INSERT INTO winner_selections (
          selection_id, test_id, decision, selected_winner, confidence,
          criteria_json, analysis_json, recommendation_json, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        selectionId,
        testId,
        'SELECT_WINNER',
        'TEST',
        0.95,
        JSON.stringify({
          primaryMetric: 'CTR',
          secondaryMetrics: ['CVR', 'CPA'],
          minConfidenceLevel: 0.95,
          minSampleSize: 1000,
          minTestDuration: 14,
          minPracticalSignificance: 0.05,
          maxTolerableDecline: 0.1,
          maxBudgetIncrease: 0.5,
          minROI: 2
        }),
        JSON.stringify({
          statisticalValidation: { primaryMetricValid: true },
          businessValidation: { practicalSignificanceMet: true },
          riskAssessment: { overallRiskLevel: 'LOW' },
          performanceProjection: { expectedLift: 0.1 }
        }),
        JSON.stringify({
          action: 'IMPLEMENT_WITH_MONITORING',
          implementation: { rolloutStrategy: 'GRADUAL', trafficAllocation: 0.5 }
        }),
        JSON.stringify({
          selectionId,
          testId,
          decision: 'SELECT_WINNER',
          selectedWinner: 'TEST',
          confidence: 0.95
        })
      );

      const implementation = await winnerSelection.implementWinner(selectionId, 'GRADUAL');

      expect(implementation).toBeDefined();
      expect(implementation.implemented).toBe(true);
      expect(implementation.rolloutPlan).toBeDefined();
      expect(Array.isArray(implementation.rolloutPlan)).toBe(true);
      expect(implementation.monitoringSchedule).toBeDefined();
      expect(Array.isArray(implementation.monitoringSchedule)).toBe(true);
    });

    it('should monitor implementation performance', async () => {
      const selectionId = 'sel_monitor_test';
      const testId = 'test_monitor';

      // Insert a selection for monitoring
      db.prepare(`
        INSERT INTO winner_selections (
          selection_id, test_id, decision, selected_winner, confidence,
          criteria_json, analysis_json, recommendation_json, result_json,
          implementation_status, implementation_start
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 days'))
      `).run(
        selectionId,
        testId,
        'SELECT_WINNER',
        'TEST',
        0.95,
        JSON.stringify({
          primaryMetric: 'CTR',
          secondaryMetrics: ['CVR', 'CPA'],
          minConfidenceLevel: 0.95,
          minSampleSize: 1000,
          minTestDuration: 14,
          minPracticalSignificance: 0.05,
          maxTolerableDecline: 0.1,
          maxBudgetIncrease: 0.5,
          minROI: 2
        }),
        JSON.stringify({
          performanceProjection: {
            expectedLift: 0.1,
            projectedImpact: { revenue: 1000, cost: 500, conversions: 20 }
          }
        }),
        JSON.stringify({ action: 'IMPLEMENT_WITH_MONITORING' }),
        JSON.stringify({
          selectionId,
          testId,
          analysis: {
            performanceProjection: {
              expectedLift: 0.1,
              projectedImpact: { revenue: 1000, cost: 500, conversions: 20 }
            }
          }
        }),
        'IMPLEMENTING'
      );

      const monitoring = await winnerSelection.monitorImplementation(selectionId);

      expect(monitoring).toBeDefined();
      expect(monitoring.status).toMatch(/^(ON_TRACK|NEEDS_ATTENTION|ROLLBACK_REQUIRED)$/);
      expect(monitoring.metrics).toBeDefined();
      expect(monitoring.alerts).toBeDefined();
      expect(Array.isArray(monitoring.alerts)).toBe(true);
      expect(monitoring.recommendation).toMatch(/^(CONTINUE|ADJUST|ROLLBACK)$/);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full creative optimization workflow', async () => {
      // Step 1: Analyze creative performance
      const performanceAnalysis = await creativeAnalyzer.analyzeAdGroupCreatives('ag_001', 30);
      expect(performanceAnalysis.totalCreatives).toBeGreaterThan(0);

      // Step 2: Detect fatigue
      const fatigueAnalysis = await fatigueDetector.detectFatigue('ad_001');
      expect(fatigueAnalysis.overallFatigue).toBeDefined();

      // Step 3: Create A/B test if fatigue detected
      if (fatigueAnalysis.overallFatigue.level !== 'NONE') {
        const testConfig = {
          name: 'Integration Test A/B',
          description: 'Full workflow test',
          type: 'CREATIVE_SPLIT' as const,
          statisticalMethod: 'FREQUENTIST' as const,
          trafficSplit: { controlPercentage: 50, testPercentage: 50 },
          minDurationDays: 14,
          maxDurationDays: 30,
          minSampleSize: 1000,
          primaryMetric: 'CTR' as const,
          secondaryMetrics: ['CVR' as const],
          minDetectableEffect: 0.05,
          practicalSignificanceThreshold: 0.05,
          significanceLevel: 0.05,
          targetPower: 0.8,
          earlyStoppingEnabled: true,
          earlyStoppingCheckInterval: 1,
          futilityStoppingEnabled: true,
          maxNegativeImpact: 0.2,
          maxSpendIncrease: 0.5
        };

        const controlVariant = {
          id: 'integration_control',
          name: 'Current Creative',
          adId: 'ad_001',
          type: 'CONTROL' as const,
          content: { headlines: ['Current'], descriptions: ['Current'] },
          active: true
        };

        const testVariant = {
          id: 'integration_test',
          name: 'New Creative',
          adId: 'ad_002',
          type: 'TEST' as const,
          content: { headlines: ['New'], descriptions: ['New'] },
          active: true
        };

        const testId = await abTestFramework.createABTest(testConfig, controlVariant, testVariant);
        expect(testId).toBeDefined();

        // Step 4: Analyze test (simulate completion)
        db.prepare(`
          UPDATE ab_tests
          SET status = 'COMPLETED',
              started_at = datetime('now', '-20 days'),
              ended_at = datetime('now', '-1 days')
          WHERE test_id = ?
        `).run(testId);

        const testResult = await abTestFramework.analyzeABTest(testId);
        expect(testResult.testId).toBe(testId);

        // Step 5: Select winner
        const selectionCriteria = {
          primaryMetric: 'CTR' as const,
          secondaryMetrics: ['CVR' as const],
          minConfidenceLevel: 0.95,
          minSampleSize: 1000,
          minTestDuration: 14,
          minPracticalSignificance: 0.05,
          maxTolerableDecline: 0.1,
          maxBudgetIncrease: 0.5,
          minROI: 2,
          riskTolerance: 'MODERATE' as const,
          requireUnanimousSignificance: false,
          minQualityScore: 7,
          maxFatigueLevel: 'MILD' as const
        };

        const winnerResult = await winnerSelection.evaluateWinner(testId, selectionCriteria);
        expect(winnerResult.selectionId).toBeDefined();

        // Step 6: Optimize rotation based on results
        const rotationConfig = {
          strategy: 'OPTIMIZE' as const,
          minImpressions: 100,
          maxActiveCreatives: 10,
          rotationInterval: 7,
          performanceThreshold: 50,
          learningPeriod: 14,
          confidenceLevel: 0.95
        };

        const rotationResult = await rotationOptimizer.optimizeAdRotation('ag_001', rotationConfig);
        expect(rotationResult.implemented).toBe(true);
      }
    });

    it('should handle error cases gracefully', async () => {
      // Test with non-existent ad group
      await expect(
        creativeAnalyzer.analyzeAdGroupCreatives('non_existent', 30)
      ).rejects.toThrow();

      // Test with invalid test ID
      await expect(
        abTestFramework.analyzeABTest('invalid_test_id')
      ).rejects.toThrow();

      // Test fatigue detection with non-existent ad
      await expect(
        fatigueDetector.detectFatigue('non_existent_ad')
      ).rejects.toThrow();
    });
  });
});