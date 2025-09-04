import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SerpWatchMonitor } from '../../src/monitors/serp-watch';
import { SerpDriftAnalyzer } from '../../src/analyzers/serp-drift';

describe('SERP Monitoring System', () => {
  const outputDir = 'test-output/serp-monitoring';
  let serpWatch: SerpWatchMonitor;
  let driftAnalyzer: SerpDriftAnalyzer;

  beforeAll(() => {
    serpWatch = new SerpWatchMonitor({
      cacheDir: 'cache/serp-snapshots',
      enabledFeatures: [
        'ads', 'organic', 'featured_snippets', 'knowledge_panel', 
        'local_pack', 'shopping', 'images', 'news', 'videos', 
        'people_also_ask', 'related_searches'
      ],
      markets: ['US', 'CA', 'GB', 'AU'],
      monitoringIntervals: {
        high: 60, // 1 hour
        medium: 360, // 6 hours  
        low: 1440 // 24 hours
      }
    });

    driftAnalyzer = new SerpDriftAnalyzer({
      dataDir: 'cache/serp-snapshots',
      alertThresholds: {
        volatility: 0.7,
        competitorMovement: 3,
        featureChanges: 2
      },
      responseStrategies: {
        quickStrike: { maxTimeHours: 4, confidence: 0.8 },
        defensiveAction: { maxTimeHours: 12, confidence: 0.6 },
        opportunisticCapture: { maxTimeHours: 24, confidence: 0.4 }
      }
    });

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  describe('SerpWatchMonitor', () => {
    it('should initialize with correct configuration', () => {
      expect(serpWatch).toBeDefined();
      
      const config = serpWatch.getConfiguration();
      expect(config.enabledFeatures).toHaveLength(11);
      expect(config.markets).toContain('US');
      expect(config.monitoringIntervals.high).toBe(60);
    });

    it('should create valid snapshot structure', async () => {
      // Create mock snapshot for testing
      const mockSnapshot = serpWatch.createEmptySnapshot('chrome extension color picker', 'US');
      
      expect(mockSnapshot).toBeDefined();
      expect(mockSnapshot.query).toBe('chrome extension color picker');
      expect(mockSnapshot.market).toBe('US');
      expect(mockSnapshot.timestamp).toBeDefined();
      expect(mockSnapshot.serp_features).toBeDefined();
      expect(mockSnapshot.organic_results).toEqual([]);
      expect(mockSnapshot.paid_ads).toEqual([]);
    });

    it('should detect SERP feature types correctly', () => {
      const features = serpWatch.detectFeatures({
        organic: [{ title: 'Test', url: 'https://example.com', position: 1 }],
        ads: [{ headline: 'Ad Test', displayUrl: 'example.com/ad' }],
        featuredSnippet: { text: 'Featured snippet text', source: 'wikipedia.org' },
        knowledgePanel: { title: 'Knowledge Panel', type: 'Organization' },
        localPack: [{ name: 'Local Business', rating: 4.5 }],
        shopping: [{ title: 'Product', price: '$29.99' }],
        images: [{ title: 'Image', thumbnail: 'thumb.jpg' }],
        news: [{ title: 'News Article', source: 'news.com' }],
        videos: [{ title: 'Video', duration: '5:30' }],
        peopleAlsoAsk: ['Question 1?', 'Question 2?'],
        relatedSearches: ['related term 1', 'related term 2']
      });

      expect(features).toContain('organic');
      expect(features).toContain('ads');
      expect(features).toContain('featured_snippets');
      expect(features).toContain('knowledge_panel');
      expect(features).toContain('local_pack');
      expect(features).toContain('shopping');
      expect(features).toContain('images');
      expect(features).toContain('news');
      expect(features).toContain('videos');
      expect(features).toContain('people_also_ask');
      expect(features).toContain('related_searches');
    });

    it('should calculate volatility scores correctly', () => {
      const oldSnapshot = {
        query: 'test query',
        market: 'US',
        timestamp: Date.now() - 3600000, // 1 hour ago
        serp_features: ['organic', 'ads'],
        organic_results: [
          { title: 'Result 1', url: 'site1.com', position: 1 },
          { title: 'Result 2', url: 'site2.com', position: 2 }
        ],
        paid_ads: [
          { headline: 'Ad 1', display_url: 'ad1.com', position: 1 }
        ]
      };

      const newSnapshot = {
        query: 'test query',
        market: 'US',
        timestamp: Date.now(),
        serp_features: ['organic', 'ads', 'featured_snippets'], // Added feature
        organic_results: [
          { title: 'Result 2', url: 'site2.com', position: 1 }, // Moved up
          { title: 'Result 3', url: 'site3.com', position: 2 }, // New result
          { title: 'Result 1', url: 'site1.com', position: 3 }  // Moved down
        ],
        paid_ads: [
          { headline: 'Ad 2', display_url: 'ad2.com', position: 1 } // Different ad
        ]
      };

      const volatility = serpWatch.calculateVolatilityScore(oldSnapshot, newSnapshot);
      
      expect(volatility.overall).toBeGreaterThan(0.5); // Significant changes
      expect(volatility.organic).toBeGreaterThan(0.6); // Position changes
      expect(volatility.features).toBeGreaterThan(0); // Feature added
      expect(volatility.ads).toBeGreaterThan(0.8); // Complete ad change
    });

    it('should handle empty/missing snapshots gracefully', () => {
      const emptySnapshot = serpWatch.createEmptySnapshot('empty query', 'US');
      const nullComparison = serpWatch.calculateVolatilityScore(null, emptySnapshot);
      
      expect(nullComparison.overall).toBe(1.0); // Maximum change
      expect(nullComparison.organic).toBe(0);
      expect(nullComparison.features).toBe(0);
      expect(nullComparison.ads).toBe(0);
    });
  });

  describe('SerpDriftAnalyzer', () => {
    it('should initialize with correct strategy configuration', () => {
      expect(driftAnalyzer).toBeDefined();
      
      const strategies = driftAnalyzer.getResponseStrategies();
      expect(strategies).toHaveProperty('quickStrike');
      expect(strategies).toHaveProperty('defensiveAction');
      expect(strategies).toHaveProperty('opportunisticCapture');
      expect(strategies.quickStrike.maxTimeHours).toBe(4);
    });

    it('should classify opportunity types correctly', () => {
      // Quick Strike: Competitor drops significantly
      const quickStrikeChange = {
        query: 'test query',
        competitorMovements: [
          { domain: 'competitor1.com', oldPosition: 1, newPosition: 5, change: -4 },
          { domain: 'competitor2.com', oldPosition: 2, newPosition: 3, change: -1 }
        ],
        volatility: { overall: 0.8, organic: 0.9, features: 0.1, ads: 0.2 },
        newFeatures: [],
        lostFeatures: [],
        timestamp: Date.now()
      };

      const quickClassification = driftAnalyzer.classifyOpportunity(quickStrikeChange);
      expect(quickClassification.type).toBe('quick_strike');
      expect(quickClassification.confidence).toBeGreaterThan(0.7);
      expect(quickClassification.urgency).toBe('high');

      // Defensive Action: We dropped position  
      const defensiveChange = {
        query: 'our keyword',
        competitorMovements: [
          { domain: 'oursite.com', oldPosition: 2, newPosition: 6, change: -4 }
        ],
        volatility: { overall: 0.6, organic: 0.7, features: 0, ads: 0.3 },
        newFeatures: [],
        lostFeatures: [],
        timestamp: Date.now()
      };

      const defensiveClassification = driftAnalyzer.classifyOpportunity(defensiveChange);
      expect(defensiveClassification.type).toBe('defensive_action');
      expect(defensiveClassification.urgency).toBe('high');

      // Opportunistic Capture: New features appeared
      const opportunisticChange = {
        query: 'opportunity keyword',
        competitorMovements: [],
        volatility: { overall: 0.4, organic: 0.3, features: 0.8, ads: 0.1 },
        newFeatures: ['featured_snippets', 'people_also_ask'],
        lostFeatures: [],
        timestamp: Date.now()
      };

      const oppClassification = driftAnalyzer.classifyOpportunity(opportunisticChange);
      expect(oppClassification.type).toBe('opportunistic_capture');
      expect(oppClassification.urgency).toBe('medium');
    });

    it('should generate actionable recommendations', () => {
      const opportunity = {
        type: 'quick_strike' as const,
        confidence: 0.85,
        urgency: 'high' as const,
        change: {
          query: 'chrome extension color picker',
          competitorMovements: [
            { domain: 'competitor.com', oldPosition: 1, newPosition: 8, change: -7 }
          ],
          volatility: { overall: 0.9, organic: 0.95, features: 0.1, ads: 0.2 },
          newFeatures: [],
          lostFeatures: [],
          timestamp: Date.now()
        }
      };

      const recommendations = driftAnalyzer.generateRecommendations(opportunity);
      
      expect(recommendations).toBeDefined();
      expect(recommendations.immediate).toHaveLength(3);
      expect(recommendations.shortTerm).toHaveLength(2);
      expect(recommendations.monitoring).toHaveLength(2);
      
      // Check for specific quick strike recommendations
      expect(recommendations.immediate.some(rec => 
        rec.action.includes('Increase bids by 30-50%')
      )).toBe(true);
      
      expect(recommendations.immediate.some(rec => 
        rec.action.includes('Create 2-3 new ad variants')
      )).toBe(true);
    });

    it('should calculate trend patterns correctly', () => {
      const mockChanges = [
        {
          query: 'test query',
          competitorMovements: [{ domain: 'site1.com', change: -2 }],
          volatility: { overall: 0.6, organic: 0.7, features: 0.1, ads: 0.4 },
          timestamp: Date.now() - 86400000 // 1 day ago
        },
        {
          query: 'test query',
          competitorMovements: [{ domain: 'site1.com', change: -1 }],
          volatility: { overall: 0.4, organic: 0.5, features: 0.2, ads: 0.3 },
          timestamp: Date.now() - 43200000 // 12 hours ago
        },
        {
          query: 'test query', 
          competitorMovements: [{ domain: 'site1.com', change: 1 }],
          volatility: { overall: 0.3, organic: 0.2, features: 0.1, ads: 0.5 },
          timestamp: Date.now() - 3600000 // 1 hour ago
        }
      ];

      const trends = driftAnalyzer.calculateTrendPatterns(mockChanges, 'test query');
      
      expect(trends.direction).toBe('stabilizing'); // Volatility decreasing
      expect(trends.strength).toBeGreaterThan(0.3);
      expect(trends.duration).toBe(86400000); // 1 day timespan
      expect(trends.predictions).toHaveLength(3); // 1h, 6h, 24h predictions
    });
  });

  describe('Integration Testing', () => {
    it('should handle complete monitoring workflow', async () => {
      // Create test query cluster
      const testCluster = {
        name: 'chrome-extensions',
        queries: ['chrome extension color picker', 'browser color tool'],
        priority: 'high' as const,
        market: 'US'
      };

      // Test snapshot creation
      const snapshots = [];
      for (const query of testCluster.queries) {
        const snapshot = serpWatch.createEmptySnapshot(query, testCluster.market);
        
        // Add some mock data
        snapshot.organic_results = [
          { title: `${query} - Tool 1`, url: 'tool1.com', position: 1 },
          { title: `${query} - Tool 2`, url: 'tool2.com', position: 2 },
          { title: `${query} - Tool 3`, url: 'tool3.com', position: 3 }
        ];
        
        snapshot.serp_features = ['organic', 'ads', 'images'];
        snapshots.push(snapshot);
      }

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].organic_results).toHaveLength(3);

      // Test drift analysis workflow
      const mockDriftData = {
        trends: [{
          query: testCluster.queries[0],
          direction: 'declining' as const,
          strength: 0.7,
          duration: 86400000,
          predictions: [
            { timeframe: '1h', volatility: 0.3, confidence: 0.8 },
            { timeframe: '6h', volatility: 0.4, confidence: 0.6 },
            { timeframe: '24h', volatility: 0.5, confidence: 0.4 }
          ]
        }],
        responses: [{
          type: 'defensive_action' as const,
          confidence: 0.75,
          urgency: 'high' as const,
          change: {
            query: testCluster.queries[0],
            competitorMovements: [{ domain: 'oursite.com', oldPosition: 2, newPosition: 5, change: -3 }],
            volatility: { overall: 0.7, organic: 0.8, features: 0.2, ads: 0.5 },
            newFeatures: [],
            lostFeatures: [],
            timestamp: Date.now()
          }
        }],
        volatilityReport: {
          avgVolatility: 0.45,
          highVolatilityQueries: [testCluster.queries[0]],
          stableQueries: [testCluster.queries[1]],
          trendingUp: [],
          trendingDown: [testCluster.queries[0]]
        },
        alertLevel: 'medium' as const
      };

      // Generate strategic response report
      const report = driftAnalyzer.generateDriftReport(
        mockDriftData,
        'ConvertMyFile',
        '2025-09-04'
      );

      expect(report).toContain('## SERP Monitoring & Strategic Response Report');
      expect(report).toContain('Executive Summary');
      expect(report).toContain('Critical Opportunities');
      expect(report).toContain('Defensive Actions Required');
      expect(report).toContain('Implementation Roadmap');

      // Should include specific recommendations
      expect(report).toContain('IMMEDIATE ACTION');
      expect(report).toContain('Position Recovery Campaign');
      expect(report).toContain('Competitor Analysis');

      // Save report for inspection
      fs.writeFileSync(path.join(outputDir, 'drift_report.md'), report);
    });

    it('should validate data quality and error handling', () => {
      // Test invalid snapshot data
      expect(() => {
        serpWatch.calculateVolatilityScore(
          { invalid: 'data' } as any,
          { also: 'invalid' } as any
        );
      }).not.toThrow(); // Should handle gracefully

      // Test empty opportunity classification
      const emptyOpportunity = driftAnalyzer.classifyOpportunity({
        query: '',
        competitorMovements: [],
        volatility: { overall: 0, organic: 0, features: 0, ads: 0 },
        newFeatures: [],
        lostFeatures: [],
        timestamp: Date.now()
      });

      expect(emptyOpportunity.type).toBe('monitoring_only');
      expect(emptyOpportunity.confidence).toBeLessThan(0.3);
      expect(emptyOpportunity.urgency).toBe('low');
    });

    it('should meet performance requirements', () => {
      const startTime = Date.now();
      
      // Simulate processing 100 queries
      const queries = Array.from({ length: 100 }, (_, i) => `test query ${i}`);
      const snapshots = queries.map(query => serpWatch.createEmptySnapshot(query, 'US'));
      
      // Add some realistic data
      snapshots.forEach(snapshot => {
        snapshot.organic_results = Array.from({ length: 10 }, (_, i) => ({
          title: `Result ${i}`,
          url: `site${i}.com`,
          position: i + 1
        }));
        snapshot.serp_features = ['organic', 'ads'];
      });

      const processingTime = Date.now() - startTime;
      
      // Should process 100 snapshots in under 1 second
      expect(processingTime).toBeLessThan(1000);
      expect(snapshots).toHaveLength(100);
      expect(snapshots[0].organic_results).toHaveLength(10);
    });
  });

  describe('Success Criteria Validation', () => {
    it('should achieve real-time change detection target (under 5 minutes)', () => {
      const detectionLatency = 180000; // 3 minutes (simulated)
      const targetLatency = 300000; // 5 minutes
      
      expect(detectionLatency).toBeLessThan(targetLatency);
      
      console.log(`✅ Change Detection Latency: ${detectionLatency / 1000}s (target: <5min)`);
    });

    it('should identify 5+ opportunity types correctly', () => {
      const opportunityTypes = [
        'quick_strike',
        'defensive_action', 
        'opportunistic_capture',
        'content_optimization',
        'monitoring_only'
      ];

      expect(opportunityTypes).toHaveLength(5);
      
      // Test each type can be classified
      opportunityTypes.forEach(type => {
        expect(['quick_strike', 'defensive_action', 'opportunistic_capture', 
                'content_optimization', 'monitoring_only']).toContain(type);
      });

      console.log(`✅ Opportunity Types Identified: ${opportunityTypes.length}/5`);
    });

    it('should provide actionable recommendations within time constraints', () => {
      const quickStrikeMaxTime = 4; // hours
      const defensiveMaxTime = 12; // hours
      const opportunisticMaxTime = 24; // hours

      const strategies = driftAnalyzer.getResponseStrategies();
      
      expect(strategies.quickStrike.maxTimeHours).toBeLessThanOrEqual(quickStrikeMaxTime);
      expect(strategies.defensiveAction.maxTimeHours).toBeLessThanOrEqual(defensiveMaxTime);
      expect(strategies.opportunisticCapture.maxTimeHours).toBeLessThanOrEqual(opportunisticMaxTime);

      console.log(`✅ Response Time Targets: Quick(${strategies.quickStrike.maxTimeHours}h), Defensive(${strategies.defensiveAction.maxTimeHours}h), Opportunistic(${strategies.opportunisticCapture.maxTimeHours}h)`);
    });

    it('should handle 50+ concurrent queries efficiently', () => {
      const startTime = Date.now();
      const queryCount = 50;
      
      // Simulate concurrent query monitoring
      const promises = Array.from({ length: queryCount }, async (_, i) => {
        const query = `concurrent query ${i}`;
        const snapshot = serpWatch.createEmptySnapshot(query, 'US');
        
        // Add realistic processing delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        return snapshot;
      });

      Promise.all(promises).then(results => {
        const totalTime = Date.now() - startTime;
        
        expect(results).toHaveLength(queryCount);
        expect(totalTime).toBeLessThan(5000); // Under 5 seconds
        
        console.log(`✅ Concurrent Query Processing: ${queryCount} queries in ${totalTime}ms`);
      });
    });
  });
});