/**
 * Entity Auditor Tests - v1.8
 * Test suite for entity extraction, scoring, and coverage analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityExtractor } from '../src/entity/entity-auditor.js';
import { EntityScorer } from '../src/entity/entity-scorer.js';
import { CoverageAnalyzer } from '../src/entity/coverage-analyzer.js';
import { Entity, PageSnapshot, Cluster } from '../src/entity/types.js';

describe('Entity Auditor - v1.8', () => {
  let extractor: EntityExtractor;
  let scorer: EntityScorer;
  let analyzer: CoverageAnalyzer;

  beforeEach(() => {
    extractor = new EntityExtractor();
    scorer = new EntityScorer();
    analyzer = new CoverageAnalyzer();
  });

  describe('EntityExtractor', () => {
    it('should extract entities from SERP data', async () => {
      const serpData = {
        top_3_domains: ['converter.com', 'filetools.net', 'onlineconvert.org'],
        features_json: {
          ai_overview: 'Convert files online with our free converter tool',
          shopping: [
            { title: 'Best File Converter Software' },
            { title: 'Premium Conversion Tools' }
          ]
        }
      };

      const entities = await extractor.extractFromSERP(serpData);

      expect(entities).toBeDefined();
      expect(entities.length).toBeGreaterThan(0);

      // Should find common entities
      const entityNames = entities.map(e => e.canonical);
      expect(entityNames).toContain('convert');
      expect(entityNames).toContain('online');
      expect(entityNames).toContain('tool');
    });

    it('should extract entities from keywords', async () => {
      const keywords = [
        'webp to png converter',
        'online file conversion',
        'free image converter',
        'batch convert images',
        'convert files offline'
      ];

      const entities = await extractor.extractFromKeywords(keywords);

      expect(entities).toBeDefined();
      expect(entities.length).toBeGreaterThan(0);

      const entityNames = entities.map(e => e.canonical);
      expect(entityNames).toContain('convert');
      expect(entityNames).toContain('webp');
      expect(entityNames).toContain('png');
      expect(entityNames).toContain('online');
    });

    it('should normalize and deduplicate entities', () => {
      const entities: Entity[] = [
        {
          canonical: 'Convert',
          variants: ['convert', 'converting'],
          importance: 0.8,
          frequency: 5,
          sources: [],
          confidence: 0.9
        },
        {
          canonical: 'convert',
          variants: ['conversion', 'converter'],
          importance: 0.7,
          frequency: 3,
          sources: [],
          confidence: 0.8
        }
      ];

      const normalized = extractor.normalize(entities);

      expect(normalized).toHaveLength(1);
      expect(normalized[0].canonical).toBe('convert');
      expect(normalized[0].frequency).toBe(8); // 5 + 3
      expect(normalized[0].variants).toContain('converting');
      expect(normalized[0].variants).toContain('conversion');
    });

    it('should map synonyms correctly', () => {
      const synonyms = extractor.mapSynonyms('webp');

      expect(synonyms).toContain('webp');
      expect(synonyms).toContain('webp image');
      expect(synonyms).toContain('webp format');
      expect(synonyms).toContain('webp file');
    });

    it('should validate extraction results', () => {
      const entities: Entity[] = [
        {
          canonical: 'convert',
          variants: ['conversion', 'converter'],
          importance: 0.8,
          frequency: 5,
          sources: [{ type: 'serp', frequency: 1 }, { type: 'keywords', frequency: 1 }],
          confidence: 0.9
        }
      ];

      const validation = extractor.validate(entities);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      // May have warnings for low entity count in test
    });
  });

  describe('EntityScorer', () => {
    it('should calculate entity importance score', () => {
      const entity: Entity = {
        canonical: 'convert',
        variants: ['conversion', 'converter'],
        importance: 0,
        frequency: 10,
        sources: [
          { type: 'serp', frequency: 5, position: 1 },
          { type: 'keywords', frequency: 3 }
        ],
        confidence: 0.9
      };

      const cluster: Cluster = {
        name: 'file-conversion',
        keywords: ['convert files', 'file converter', 'online conversion'],
        intent: 'commercial',
        volume: 15000,
        difficulty: 45
      };

      const importance = scorer.calculateImportance(entity, cluster);

      expect(importance).toBeGreaterThan(0);
      expect(importance).toBeLessThanOrEqual(1);
      expect(importance).toBeGreaterThan(0.5); // Should be high for commercial conversion entity
    });

    it('should calculate page coverage score', () => {
      const pageEntities = ['convert', 'online', 'tool', 'free'];
      const requiredEntities: Entity[] = [
        {
          canonical: 'convert',
          variants: ['conversion'],
          importance: 0.9,
          frequency: 5,
          sources: [],
          confidence: 0.8
        },
        {
          canonical: 'online',
          variants: ['web-based'],
          importance: 0.7,
          frequency: 3,
          sources: [],
          confidence: 0.7
        },
        {
          canonical: 'secure',
          variants: ['safe', 'privacy'],
          importance: 0.6,
          frequency: 2,
          sources: [],
          confidence: 0.6
        }
      ];

      const coverage = scorer.calculatePageCoverage(pageEntities, requiredEntities);

      expect(coverage).toBeGreaterThan(0.5); // Should cover 'convert' and 'online'
      expect(coverage).toBeLessThan(1); // Missing 'secure'
    });

    it('should generate scoring report', () => {
      const entity: Entity = {
        canonical: 'webp',
        variants: ['webp image', 'webp format'],
        importance: 0,
        frequency: 8,
        sources: [{ type: 'serp', frequency: 5 }],
        confidence: 0.8
      };

      const report = scorer.generateScoringReport(entity);

      expect(report).toHaveProperty('entity', 'webp');
      expect(report).toHaveProperty('scores');
      expect(report).toHaveProperty('factors');
      expect(report.scores).toHaveProperty('final_score');
    });
  });

  describe('CoverageAnalyzer', () => {
    let targetPage: PageSnapshot;
    let competitorPages: PageSnapshot[];
    let entities: Entity[];
    let cluster: Cluster;

    beforeEach(() => {
      targetPage = {
        url: 'https://example.com/converter',
        capturedAt: '2025-09-18T12:00:00Z',
        wordCount: 800,
        headings: [
          { level: 1, text: 'File Converter', position: 0 },
          { level: 2, text: 'Features', position: 200 }
        ],
        sections: [
          {
            title: 'Features',
            content: 'Convert files online',
            wordCount: 150,
            entities: ['convert', 'online'],
            type: 'features'
          }
        ],
        presentEntities: ['convert', 'online', 'tool'],
        schemaTypes: ['SoftwareApplication'],
        contentHash: 'abc123'
      };

      competitorPages = [
        {
          url: 'https://competitor1.com/tool',
          capturedAt: '2025-09-18T12:00:00Z',
          wordCount: 1200,
          headings: [
            { level: 1, text: 'Best Converter', position: 0 },
            { level: 2, text: 'FAQ', position: 400 }
          ],
          sections: [
            {
              title: 'Features',
              content: 'Convert files securely',
              wordCount: 200,
              entities: ['convert', 'secure'],
              type: 'features'
            },
            {
              title: 'FAQ',
              content: 'Common questions',
              wordCount: 300,
              entities: ['free', 'privacy'],
              type: 'faq'
            }
          ],
          presentEntities: ['convert', 'secure', 'free', 'privacy', 'fast'],
          schemaTypes: ['SoftwareApplication', 'FAQPage'],
          contentHash: 'def456'
        }
      ];

      entities = [
        {
          canonical: 'convert',
          variants: ['conversion'],
          importance: 0.9,
          frequency: 10,
          sources: [],
          confidence: 0.9
        },
        {
          canonical: 'secure',
          variants: ['privacy', 'safe'],
          importance: 0.7,
          frequency: 5,
          sources: [],
          confidence: 0.8
        },
        {
          canonical: 'free',
          variants: ['no cost'],
          importance: 0.6,
          frequency: 3,
          sources: [],
          confidence: 0.7
        }
      ];

      cluster = {
        name: 'file-conversion',
        keywords: ['convert files', 'online converter'],
        intent: 'commercial',
        volume: 10000,
        difficulty: 40
      };
    });

    it('should calculate coverage score', () => {
      const score = analyzer.calculateCoverageScore(targetPage, cluster, entities);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      // Target page has some entities but missing others, so partial score
      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(80);
    });

    it('should perform comprehensive coverage analysis', async () => {
      const analysis = await analyzer.analyzeCoverage(
        targetPage,
        competitorPages,
        entities,
        cluster,
        'testproduct',
        'US'
      );

      expect(analysis).toBeDefined();
      expect(analysis.product).toBe('testproduct');
      expect(analysis.cluster).toBe('file-conversion');
      expect(analysis.market).toBe('US');
      expect(analysis.coverageScore).toBeGreaterThan(0);
      expect(analysis.competitorAverage).toBeGreaterThan(0);
      expect(analysis.entityGaps).toBeDefined();
      expect(analysis.sectionGaps).toBeDefined();
      expect(analysis.schemaGaps).toBeDefined();
      expect(analysis.recommendations).toBeDefined();

      // Should detect missing entities
      const entityGapNames = analysis.entityGaps.map(g => g.entity);
      expect(entityGapNames).toContain('secure'); // Missing from target page
      expect(entityGapNames).toContain('free'); // Missing from target page

      // Should detect missing sections
      const sectionGapTypes = analysis.sectionGaps.map(g => g.sectionType);
      expect(sectionGapTypes).toContain('faq'); // Missing from target page

      // Should detect missing schema
      const schemaGapTypes = analysis.schemaGaps.map(g => g.schemaType);
      expect(schemaGapTypes).toContain('FAQPage'); // Missing from target page

      // Should have recommendations
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should create page snapshot from content', () => {
      const content = 'This is a test page about file conversion tools and online converters.';
      const headings = [
        { level: 1, text: 'File Converter', position: 0 },
        { level: 2, text: 'How to Use', position: 100 }
      ];
      const entities = ['convert', 'file', 'online', 'tool'];
      const schemaTypes = ['SoftwareApplication'];

      const snapshot = analyzer.createPageSnapshot(
        'https://test.com/converter',
        content,
        headings,
        entities,
        schemaTypes
      );

      expect(snapshot.url).toBe('https://test.com/converter');
      expect(snapshot.wordCount).toBeGreaterThan(0);
      expect(snapshot.headings).toEqual(headings);
      expect(snapshot.presentEntities).toEqual(entities);
      expect(snapshot.schemaTypes).toEqual(schemaTypes);
      expect(snapshot.contentHash).toBeDefined();
      expect(snapshot.contentHash).toHaveLength(16);
    });

    it('should generate content hash consistently', () => {
      const content = 'Test content for hashing';
      const hash1 = analyzer.generateContentHash(content);
      const hash2 = analyzer.generateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);

      // Different content should produce different hash
      const hash3 = analyzer.generateContentHash('Different content');
      expect(hash3).not.toBe(hash1);
    });
  });

  describe('Integration Tests', () => {
    it('should complete entity audit workflow', async () => {
      // Simulate complete workflow
      const serpData = {
        top_3_domains: ['converter.com', 'tools.net'],
        features_json: {
          ai_overview: 'Convert webp to png files online with our free converter tool'
        }
      };

      // Extract entities
      const entities = await extractor.extractFromSERP(serpData);
      expect(entities.length).toBeGreaterThan(0);

      // Score entities
      for (const entity of entities) {
        entity.importance = scorer.calculateImportance(entity);
      }

      // Filter important entities
      const importantEntities = entities.filter(e => e.importance > 0.3);
      expect(importantEntities.length).toBeGreaterThan(0);

      // Create mock pages
      const targetPage = analyzer.createPageSnapshot(
        'https://test.com/webp-to-png',
        'Convert webp images to png format online',
        [{ level: 1, text: 'WebP to PNG Converter', position: 0 }],
        ['convert', 'webp', 'png'],
        ['SoftwareApplication']
      );

      const competitorPage = analyzer.createPageSnapshot(
        'https://competitor.com/converter',
        'Free online webp to png converter with privacy protection and batch processing',
        [
          { level: 1, text: 'Converter Tool', position: 0 },
          { level: 2, text: 'FAQ', position: 200 }
        ],
        ['convert', 'webp', 'png', 'free', 'privacy', 'batch'],
        ['SoftwareApplication', 'FAQPage']
      );

      const cluster = {
        name: 'webp-to-png',
        keywords: ['webp to png', 'convert webp', 'png converter'],
        intent: 'commercial' as const,
        volume: 5000,
        difficulty: 35
      };

      // Perform coverage analysis
      const analysis = await analyzer.analyzeCoverage(
        targetPage,
        [competitorPage],
        importantEntities,
        cluster,
        'testproduct',
        'US'
      );

      expect(analysis).toBeDefined();
      expect(analysis.coverageScore).toBeGreaterThan(0);
      expect(analysis.gapCount).toBeGreaterThan(0);
      expect(analysis.recommendations.length).toBeGreaterThan(0);

      // Should identify gaps and recommendations
      const hasEntityGaps = analysis.entityGaps.length > 0;
      const hasSectionGaps = analysis.sectionGaps.length > 0;
      const hasSchemaGaps = analysis.schemaGaps.length > 0;

      expect(hasEntityGaps || hasSectionGaps || hasSchemaGaps).toBe(true);
    });
  });
});