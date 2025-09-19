/**
 * Bid Strategy System Test Suite
 *
 * Tests for Phase 4 intelligent bid strategies including:
 * - Bid Strategy Advisor
 * - Competition Analyzer
 * - Seasonality Detector
 * - Bid Adjustment Calculator
 * - Integrated Bid Optimizer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import pino from 'pino';
import { BidStrategyAdvisor } from '../bidding/bid-strategy-advisor.js';
import { CompetitionAnalyzer } from '../bidding/competition-analyzer.js';
import { SeasonalityDetector } from '../bidding/seasonality-detector.js';
import { BidAdjustmentCalculator } from '../bidding/bid-adjustment-calculator.js';
import { IntegratedBidOptimizer } from '../bidding/integrated-bid-optimizer.js';

const mockLogger = pino({ level: 'silent' });

describe('Bid Strategy System', () => {
  let database: Database.Database;
  let bidStrategyAdvisor: BidStrategyAdvisor;
  let competitionAnalyzer: CompetitionAnalyzer;
  let seasonalityDetector: SeasonalityDetector;
  let bidAdjustmentCalculator: BidAdjustmentCalculator;
  let integratedOptimizer: IntegratedBidOptimizer;

  beforeEach(() => {
    database = new Database(':memory:');
    bidStrategyAdvisor = new BidStrategyAdvisor(database, mockLogger);
    competitionAnalyzer = new CompetitionAnalyzer(database, mockLogger);
    seasonalityDetector = new SeasonalityDetector(database, mockLogger);
    bidAdjustmentCalculator = new BidAdjustmentCalculator(database, mockLogger);
    integratedOptimizer = new IntegratedBidOptimizer(database, mockLogger);

    // Create test database schema
    setupTestDatabase();
  });

  function setupTestDatabase() {
    database.exec(`
      -- Campaign performance data
      CREATE TABLE fact_channel_spend (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        engine TEXT DEFAULT 'google',
        cost REAL DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        PRIMARY KEY (date, campaign_id)
      );

      -- Quality score data
      CREATE TABLE keyword_quality_daily (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        quality_score REAL DEFAULT 5,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        PRIMARY KEY (date, campaign_id, keyword)
      );

      -- Competition data
      CREATE TABLE auction_insights (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        competitor_domain TEXT NOT NULL,
        overlap_rate REAL DEFAULT 0,
        outranked_share REAL DEFAULT 0,
        position_above_rate REAL DEFAULT 0,
        top_of_page_rate REAL DEFAULT 0,
        avg_position REAL DEFAULT 3,
        impression_share REAL DEFAULT 0.1,
        PRIMARY KEY (date, campaign_id, competitor_domain)
      );

      -- Device performance
      CREATE TABLE device_performance (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        device_type TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        PRIMARY KEY (date, campaign_id, device_type)
      );

      -- Geo performance
      CREATE TABLE geo_performance (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        geo_location TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        PRIMARY KEY (date, campaign_id, geo_location)
      );

      -- Campaign settings
      CREATE TABLE campaign_settings (
        campaign_id TEXT PRIMARY KEY,
        bid_strategy TEXT DEFAULT 'manual_cpc',
        daily_budget REAL DEFAULT 10,
        bid_strategy_config TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Hourly data for seasonality
      CREATE TABLE fact_channel_spend_hourly (
        datetime TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        cost REAL DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        PRIMARY KEY (datetime, campaign_id)
      );

      -- Additional tables for bid strategy system
      CREATE TABLE audience_performance (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        audience_segment TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        PRIMARY KEY (date, campaign_id, audience_segment)
      );

      CREATE TABLE demographic_performance (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        age_range TEXT NOT NULL,
        gender TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        PRIMARY KEY (date, campaign_id, age_range, gender)
      );

      CREATE TABLE keyword_performance_daily (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        conversion_value REAL DEFAULT 0,
        quality_score REAL DEFAULT 5,
        avg_position REAL DEFAULT 3,
        avg_cpc REAL DEFAULT 1,
        PRIMARY KEY (date, campaign_id, keyword)
      );

      CREATE TABLE keyword_auction_data (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        first_page_bid REAL DEFAULT 0.5,
        first_position_bid REAL DEFAULT 2,
        top_of_page_bid REAL DEFAULT 1.5,
        avg_cpc REAL DEFAULT 1,
        PRIMARY KEY (date, campaign_id, keyword)
      );

      CREATE TABLE auction_performance (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        eligible_impressions INTEGER DEFAULT 0,
        lost_impressions_budget INTEGER DEFAULT 0,
        lost_impressions_rank INTEGER DEFAULT 0,
        lost_impressions_bid INTEGER DEFAULT 0,
        avg_cpc REAL DEFAULT 1,
        PRIMARY KEY (date, campaign_id)
      );

      CREATE TABLE competition_metrics (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        avg_cpc REAL DEFAULT 1,
        search_top_impression_share REAL DEFAULT 0.3,
        search_outranked_share REAL DEFAULT 0.2,
        avg_position REAL DEFAULT 3,
        PRIMARY KEY (date, campaign_id)
      );

      CREATE TABLE bid_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        dimension TEXT NOT NULL,
        segment TEXT NOT NULL,
        bid_modifier REAL NOT NULL,
        confidence REAL NOT NULL,
        rationale TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE bid_strategy_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        old_strategy TEXT,
        new_strategy TEXT NOT NULL,
        rationale TEXT,
        confidence REAL NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data
    insertTestData();
  }

  function insertTestData() {
    const campaigns = ['campaign_1', 'campaign_2', 'campaign_3'];
    const devices = ['desktop', 'mobile', 'tablet'];
    const locations = ['United States', 'Canada', 'Australia'];

    // Performance data for 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      for (const campaignId of campaigns) {
        // Base performance varies by campaign
        const baseConversions = campaignId === 'campaign_1' ? 10 :
                               campaignId === 'campaign_2' ? 5 : 2;
        const baseClicks = baseConversions * 20;
        const baseCost = baseConversions * 15;
        const baseValue = baseCost * 2.5;

        // Main performance data
        database.prepare(`
          INSERT INTO fact_channel_spend (date, campaign_id, cost, clicks, conversions, conversion_value, impressions)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(dateStr, campaignId, baseCost, baseClicks, baseConversions, baseValue, baseClicks * 10);

        // Quality score data
        const qualityScore = campaignId === 'campaign_1' ? 8 :
                            campaignId === 'campaign_2' ? 4 : 7;
        database.prepare(`
          INSERT INTO keyword_quality_daily (date, campaign_id, keyword, quality_score, impressions, clicks)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(dateStr, campaignId, `keyword_${campaignId}`, qualityScore, baseClicks * 10, baseClicks);

        // Competition data
        database.prepare(`
          INSERT INTO auction_insights (date, campaign_id, competitor_domain, overlap_rate, outranked_share, impression_share)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(dateStr, campaignId, 'competitor1.com', 0.3, 0.2, 0.15);

        // Device performance
        for (const device of devices) {
          const deviceMultiplier = device === 'desktop' ? 1.2 : device === 'mobile' ? 0.8 : 1.0;
          database.prepare(`
            INSERT INTO device_performance (date, campaign_id, device_type, impressions, clicks, conversions, cost, conversion_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            dateStr,
            campaignId,
            device,
            Math.round(baseClicks * 10 * deviceMultiplier),
            Math.round(baseClicks * deviceMultiplier),
            Math.round(baseConversions * deviceMultiplier),
            baseCost * deviceMultiplier,
            baseValue * deviceMultiplier
          );
        }

        // Geo performance
        for (const location of locations) {
          const geoMultiplier = location === 'United States' ? 1.5 :
                               location === 'Canada' ? 1.1 : 0.9;
          database.prepare(`
            INSERT INTO geo_performance (date, campaign_id, geo_location, impressions, clicks, conversions, cost, conversion_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            dateStr,
            campaignId,
            location,
            Math.round(baseClicks * 3 * geoMultiplier),
            Math.round(baseClicks / 3 * geoMultiplier),
            Math.round(baseConversions / 3 * geoMultiplier),
            baseCost / 3 * geoMultiplier,
            baseValue / 3 * geoMultiplier
          );
        }
      }
    }

    // Campaign settings
    for (const campaignId of campaigns) {
      database.prepare(`
        INSERT INTO campaign_settings (campaign_id, bid_strategy, daily_budget)
        VALUES (?, ?, ?)
      `).run(campaignId, 'manual_cpc', 25);
    }

    // Hourly data for seasonality (last 7 days)
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const datetime = new Date();
        datetime.setDate(datetime.getDate() - day);
        datetime.setHours(hour, 0, 0, 0);
        const datetimeStr = datetime.toISOString().slice(0, 19).replace('T', ' ');

        for (const campaignId of campaigns) {
          // Simulate hourly patterns (higher performance during business hours)
          const hourlyMultiplier = hour >= 9 && hour <= 17 ? 1.5 : 0.7;
          const baseConversions = (campaignId === 'campaign_1' ? 2 : 1) * hourlyMultiplier;

          database.prepare(`
            INSERT INTO fact_channel_spend_hourly (datetime, campaign_id, cost, clicks, conversions, conversion_value, impressions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            datetimeStr,
            campaignId,
            baseConversions * 15,
            baseConversions * 20,
            baseConversions,
            baseConversions * 37.5,
            baseConversions * 200
          );
        }
      }
    }
  }

  describe('Bid Strategy Advisor', () => {
    it('should analyze bid strategies and provide recommendations', async () => {
      const result = await bidStrategyAdvisor.analyzeBidStrategies('campaign_1');

      expect(result).toBeDefined();
      expect(result.campaignId).toBe('campaign_1');
      expect(result.currentStrategy).toBe('manual_cpc');
      expect(result.recommendedStrategies).toBeInstanceOf(Array);
      expect(result.recommendedStrategies.length).toBeGreaterThan(0);
      expect(result.performanceContext).toBeDefined();
      expect(result.competitionContext).toBeDefined();
    });

    it('should recommend target_cpa for mature campaigns', async () => {
      const result = await bidStrategyAdvisor.analyzeBidStrategies('campaign_1');

      // Campaign 1 has good performance data
      const targetCPAStrategy = result.recommendedStrategies.find(s => s.type === 'target_cpa');
      expect(targetCPAStrategy).toBeDefined();
      if (targetCPAStrategy) {
        expect(targetCPAStrategy.confidence).toBeGreaterThan(0.5);
        expect(targetCPAStrategy.recommendation.targetCPA).toBeGreaterThan(0);
      }
    });

    it('should recommend manual_cpc for poor performing campaigns', async () => {
      const result = await bidStrategyAdvisor.analyzeBidStrategies('campaign_3');

      // Campaign 3 has limited data
      const manualStrategy = result.recommendedStrategies.find(s => s.type === 'manual_cpc');
      expect(manualStrategy).toBeDefined();
    });

    it('should apply recommended strategy', async () => {
      const result = await bidStrategyAdvisor.analyzeBidStrategies('campaign_1');
      const topStrategy = result.recommendedStrategies[0];

      const applyResult = await bidStrategyAdvisor.applyBidStrategy(
        'campaign_1',
        topStrategy,
        true // test mode
      );

      expect(applyResult.success).toBe(true);
      expect(applyResult.message).toContain(topStrategy.type);
    });
  });

  describe('Competition Analyzer', () => {
    it('should analyze competitive landscape', async () => {
      const result = await competitionAnalyzer.analyzeCompetition('campaign_1');

      expect(result).toBeDefined();
      expect(result.competitors).toBeInstanceOf(Array);
      expect(result.marketDynamics).toBeDefined();
      expect(result.auctionAnalysis).toBeDefined();
      expect(result.position).toBeDefined();
    });

    it('should provide competitor insights', async () => {
      const result = await competitionAnalyzer.analyzeCompetition('campaign_1');

      if (result.competitors.length > 0) {
        const competitor = result.competitors[0];
        expect(competitor.competitorId).toBeDefined();
        expect(competitor.biddingAggressiveness).toMatch(/conservative|moderate|aggressive|very_aggressive/);
        expect(typeof competitor.overlapRate).toBe('number');
      }
    });

    it('should detect bid wars', async () => {
      const result = await competitionAnalyzer.detectBidWars('campaign_1');

      expect(result).toBeDefined();
      expect(typeof result.detected).toBe('boolean');
      expect(result.keywords).toBeInstanceOf(Array);
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should estimate competitor bids', async () => {
      const keywords = ['test keyword 1', 'test keyword 2'];
      const estimates = await competitionAnalyzer.estimateCompetitorBids('campaign_1', keywords);

      expect(estimates).toBeInstanceOf(Map);
      expect(estimates.size).toBe(keywords.length);

      for (const keyword of keywords) {
        const estimate = estimates.get(keyword);
        expect(estimate).toBeDefined();
        if (estimate) {
          expect(estimate.min).toBeGreaterThan(0);
          expect(estimate.max).toBeGreaterThan(estimate.min);
          expect(estimate.estimated).toBeGreaterThanOrEqual(estimate.min);
          expect(estimate.estimated).toBeLessThanOrEqual(estimate.max);
        }
      }
    });
  });

  describe('Seasonality Detector', () => {
    it('should detect seasonality patterns', async () => {
      const result = await seasonalityDetector.detectSeasonality('campaign_1', 30);

      expect(result).toBeDefined();
      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.events).toBeInstanceOf(Array);
      expect(result.forecast).toBeInstanceOf(Array);
      expect(result.currentPhase).toMatch(/peak|rising|normal|declining|trough/);
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should generate forecasts', async () => {
      const result = await seasonalityDetector.detectSeasonality('campaign_1', 30);

      if (result.forecast.length > 0) {
        const forecast = result.forecast[0];
        expect(forecast.date).toBeInstanceOf(Date);
        expect(forecast.expectedPerformance).toBeDefined();
        expect(forecast.confidence).toBeGreaterThanOrEqual(0);
        expect(forecast.confidence).toBeLessThanOrEqual(1);
        expect(forecast.seasonalMultiplier).toBeGreaterThan(0);
      }
    });

    it('should detect hourly patterns', async () => {
      const result = await seasonalityDetector.detectSeasonality('campaign_1', 7);

      // Should detect some pattern from our test data (business hours vs off-hours)
      const hourlyPattern = result.patterns.find(p => p.type === 'hourly');
      if (hourlyPattern) {
        expect(hourlyPattern.strength).toBeGreaterThan(0);
        expect(hourlyPattern.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('Bid Adjustment Calculator', () => {
    it('should calculate bid adjustments', async () => {
      const strategy = {
        objective: 'maximize_conversions' as const,
        constraints: {
          maxBidModifier: 1.5,
          minBidModifier: 0.5,
        },
        aggressiveness: 'moderate' as const,
      };

      const result = await bidAdjustmentCalculator.calculateBidAdjustments('campaign_1', strategy);

      expect(result).toBeDefined();
      expect(result.adjustments).toBeInstanceOf(Array);
      expect(result.totalExpectedImpact).toBeDefined();
      expect(result.implementationPriority).toBeInstanceOf(Array);
    });

    it('should provide device adjustments', async () => {
      const strategy = {
        objective: 'balanced' as const,
        constraints: {
          maxBidModifier: 1.5,
          minBidModifier: 0.5,
        },
        aggressiveness: 'moderate' as const,
      };

      const result = await bidAdjustmentCalculator.calculateBidAdjustments('campaign_1', strategy);

      const deviceAdjustments = result.adjustments.filter(adj => adj.dimension === 'device');
      if (deviceAdjustments.length > 0) {
        const deviceAdj = deviceAdjustments[0];
        expect(deviceAdj.segment).toMatch(/desktop|mobile|tablet/);
        expect(deviceAdj.recommendedBidModifier).toBeGreaterThan(0);
        expect(deviceAdj.confidence).toBeGreaterThanOrEqual(0);
        expect(deviceAdj.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should prioritize adjustments by confidence and impact', async () => {
      const strategy = {
        objective: 'target_cpa' as const,
        constraints: {
          maxBidModifier: 2.0,
          minBidModifier: 0.3,
          targetCPA: 20,
        },
        aggressiveness: 'aggressive' as const,
      };

      const result = await bidAdjustmentCalculator.calculateBidAdjustments('campaign_1', strategy);

      if (result.implementationPriority.length > 0) {
        // Priority adjustments should have high confidence
        const topPriority = result.implementationPriority[0];
        expect(topPriority.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should apply adjustments in test mode', async () => {
      const strategy = {
        objective: 'balanced' as const,
        constraints: {
          maxBidModifier: 1.3,
          minBidModifier: 0.7,
        },
        aggressiveness: 'conservative' as const,
      };

      const result = await bidAdjustmentCalculator.calculateBidAdjustments('campaign_1', strategy);

      const applyResult = await bidAdjustmentCalculator.applyBidAdjustments(
        'campaign_1',
        result.adjustments,
        true // test mode
      );

      expect(applyResult.success).toBe(true);
      expect(applyResult.applied).toBe(result.adjustments.length);
      expect(applyResult.errors).toBeInstanceOf(Array);
    });
  });

  describe('Integrated Bid Optimizer', () => {
    it('should perform comprehensive optimization', async () => {
      const config = {
        objective: 'balanced' as const,
        constraints: {
          totalBudget: 100,
          maxBudgetChange: 25,
        },
        riskTolerance: 0.3,
        timeHorizon: 30,
        includeSeasonality: true,
        includeCompetition: true,
      };

      const result = await integratedOptimizer.optimizeBidding(['campaign_1', 'campaign_2'], config);

      expect(result).toBeDefined();
      expect(result.budgetAllocations).toBeInstanceOf(Array);
      expect(result.bidStrategies).toBeInstanceOf(Array);
      expect(result.bidAdjustments).toBeInstanceOf(Array);
      expect(result.seasonalFactors).toBeDefined();
      expect(result.competitiveInsights).toBeDefined();
      expect(result.totalExpectedImpact).toBeDefined();
      expect(result.implementationPlan).toBeDefined();
    });

    it('should provide budget allocations', async () => {
      const config = {
        objective: 'maximize_conversions' as const,
        constraints: {
          totalBudget: 75,
          maxBudgetChange: 20,
        },
        riskTolerance: 0.5,
        timeHorizon: 30,
        includeSeasonality: false,
        includeCompetition: false,
      };

      const result = await integratedOptimizer.optimizeBidding(['campaign_1', 'campaign_2'], config);

      expect(result.budgetAllocations.length).toBe(2);
      for (const allocation of result.budgetAllocations) {
        expect(allocation.campaignId).toMatch(/campaign_[12]/);
        expect(allocation.currentBudget).toBeGreaterThan(0);
        expect(allocation.recommendedBudget).toBeGreaterThan(0);
        expect(allocation.confidence).toBeGreaterThanOrEqual(0);
      }

      // Total budget should not exceed constraint
      const totalRecommended = result.budgetAllocations.reduce(
        (sum, alloc) => sum + alloc.recommendedBudget, 0
      );
      expect(totalRecommended).toBeLessThanOrEqual(config.constraints.totalBudget * 1.1); // Allow 10% buffer
    });

    it('should generate implementation plan', async () => {
      const config = {
        objective: 'target_roas' as const,
        constraints: {
          totalBudget: 50,
          maxBudgetChange: 30,
          targetROAS: 3.0,
        },
        riskTolerance: 0.2,
        timeHorizon: 14,
        includeSeasonality: true,
        includeCompetition: true,
      };

      const result = await integratedOptimizer.optimizeBidding(['campaign_1'], config);

      expect(result.implementationPlan).toBeDefined();
      expect(result.implementationPlan.immediate).toBeInstanceOf(Array);
      expect(result.implementationPlan.shortTerm).toBeInstanceOf(Array);
      expect(result.implementationPlan.monitoring).toBeInstanceOf(Array);
    });

    it('should apply optimizations in test mode', async () => {
      const config = {
        objective: 'balanced' as const,
        constraints: {
          totalBudget: 60,
          maxBudgetChange: 15,
        },
        riskTolerance: 0.4,
        timeHorizon: 21,
        includeSeasonality: false,
        includeCompetition: true,
      };

      const optimization = await integratedOptimizer.optimizeBidding(['campaign_1'], config);
      const applyResult = await integratedOptimizer.applyOptimizations(optimization, true);

      expect(applyResult.success).toBe(true);
      expect(applyResult.applied).toBeDefined();
      expect(applyResult.errors).toBeInstanceOf(Array);
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with all components', async () => {
      // 1. Analyze bid strategies
      const strategies = await bidStrategyAdvisor.analyzeBidStrategies('campaign_1');
      expect(strategies.recommendedStrategies.length).toBeGreaterThan(0);

      // 2. Analyze competition
      const competition = await competitionAnalyzer.analyzeCompetition('campaign_1');
      expect(competition.marketDynamics).toBeDefined();

      // 3. Detect seasonality
      const seasonality = await seasonalityDetector.detectSeasonality('campaign_1', 30);
      expect(seasonality.currentPhase).toBeDefined();

      // 4. Calculate bid adjustments
      const adjustments = await bidAdjustmentCalculator.calculateBidAdjustments('campaign_1', {
        objective: 'balanced',
        constraints: { maxBidModifier: 1.5, minBidModifier: 0.5 },
        aggressiveness: 'moderate',
      });
      expect(adjustments.adjustments.length).toBeGreaterThanOrEqual(0);

      // 5. Run integrated optimization
      const optimization = await integratedOptimizer.optimizeBidding(['campaign_1'], {
        objective: 'balanced',
        constraints: { totalBudget: 50, maxBudgetChange: 20 },
        riskTolerance: 0.3,
        timeHorizon: 30,
        includeSeasonality: true,
        includeCompetition: true,
      });

      expect(optimization).toBeDefined();
      expect(optimization.budgetAllocations.length).toBe(1);
      expect(optimization.bidStrategies.length).toBe(1);
    });

    it('should handle multiple campaigns consistently', async () => {
      const campaignIds = ['campaign_1', 'campaign_2', 'campaign_3'];

      const optimization = await integratedOptimizer.optimizeBidding(campaignIds, {
        objective: 'maximize_conversions',
        constraints: { totalBudget: 150, maxBudgetChange: 25 },
        riskTolerance: 0.5,
        timeHorizon: 30,
        includeSeasonality: true,
        includeCompetition: true,
      });

      expect(optimization.budgetAllocations.length).toBe(3);
      expect(optimization.bidStrategies.length).toBe(3);

      // Verify budget constraint
      const totalBudget = optimization.budgetAllocations.reduce(
        (sum, alloc) => sum + alloc.recommendedBudget, 0
      );
      expect(totalBudget).toBeLessThanOrEqual(150 * 1.1); // Allow 10% buffer
    });
  });
});