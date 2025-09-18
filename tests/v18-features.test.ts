/**
 * v1.8 Features Test Suite
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EntityExtractor } from '../src/entity/entity-auditor.js';
import { SchemaGenerator } from '../src/schema/schema-generator.js';
import { SchemaValidator } from '../src/schema/schema-validator.js';
import { ContentPlanner } from '../src/content/content-planner.js';
import { FAQExtractor } from '../src/content/faq-extractor.js';
import { LinkOptimizer } from '../src/content/link-optimizer.js';
import { SchemaType } from '../src/schema/types.js';

describe('v1.8 Phase 1: Entity Extraction', () => {
  let extractor: EntityExtractor;

  beforeAll(() => {
    extractor = new EntityExtractor();
  });

  it('should extract entities from keywords', async () => {
    const keywords = ['webp to png converter', 'image converter online', 'convert images'];
    const entities = await extractor.extractFromKeywords(keywords);

    expect(entities).toBeDefined();
    expect(Array.isArray(entities)).toBe(true);
    expect(entities.length).toBeGreaterThan(0);
    expect(entities[0]).toHaveProperty('canonical');
    expect(entities[0]).toHaveProperty('frequency');
    expect(entities[0]).toHaveProperty('importance');
  });

  it('should normalize and deduplicate entities', () => {
    const entities = [
      { canonical: 'WebP', variants: ['webp', 'WEBP'], frequency: 2, importance: 0.8, sources: [], type: 'format' },
      { canonical: 'PNG', variants: ['png', 'PNG'], frequency: 3, importance: 0.9, sources: [], type: 'format' },
      { canonical: 'WebP', variants: ['webp'], frequency: 1, importance: 0.6, sources: [], type: 'format' }
    ];

    const normalized = extractor.normalize(entities);

    expect(normalized.length).toBeLessThan(entities.length);
    const webpEntity = normalized.find(e => e.canonical === 'WebP');
    expect(webpEntity?.frequency).toBe(3); // Combined frequencies
  });

  it('should calculate entity importance', () => {
    const entity = {
      canonical: 'converter',
      variants: [],
      frequency: 5,
      importance: 0,
      sources: [{ type: 'serp', url: 'test.com', frequency: 3 }],
      type: 'tool'
    };

    const importance = extractor.calculateImportance(entity);

    expect(importance).toBeGreaterThan(0);
    expect(importance).toBeLessThanOrEqual(1);
  });
});

describe('v1.8 Phase 2: Schema Generation', () => {
  let generator: SchemaGenerator;
  let validator: SchemaValidator;

  beforeAll(() => {
    generator = new SchemaGenerator();
    validator = new SchemaValidator();
  });

  it('should generate SoftwareApplication schema', () => {
    const product = {
      name: 'testproduct',
      displayName: 'Test Product',
      description: 'A test product',
      version: '1.0.0',
      author: 'Test Author',
      website: 'https://test.com',
      chromeStoreUrl: 'https://chrome.google.com/webstore/detail/test/abc123',
      features: ['Feature 1', 'Feature 2']
    };

    const schema = generator.generate(SchemaType.SoftwareApplication, product);

    expect(schema).toBeDefined();
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.name).toBe(product.displayName);
    expect(schema.version).toBe(product.version);
  });

  it('should generate FAQPage schema', () => {
    const data = {
      questions: [
        { question: 'What is this?', answer: 'This is a test.' },
        { question: 'How does it work?', answer: 'It works well.' }
      ]
    };

    const schema = generator.generate(SchemaType.FAQPage, data);

    expect(schema).toBeDefined();
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema.mainEntity[0]['@type']).toBe('Question');
  });

  it('should validate schema correctly', () => {
    const validSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Test question?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Test answer.'
          }
        }
      ]
    };

    const result = validator.validate(validSchema, SchemaType.FAQPage);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect schema validation errors', () => {
    const invalidSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [] // No questions
    };

    const result = validator.validate(invalidSchema, SchemaType.FAQPage);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('at least');
  });
});

describe('v1.8 Phase 3: Content Planning', () => {
  let planner: ContentPlanner;
  let faqExtractor: FAQExtractor;

  beforeAll(() => {
    planner = new ContentPlanner();
    faqExtractor = new FAQExtractor();
  });

  it('should analyze content gaps', () => {
    const coverage = {
      clusters: [{
        name: 'webp-to-png',
        currentCoverage: 60,
        competitorAvg: 85,
        gaps: [
          { topic: 'batch conversion', severity: 'critical' as const, impact: 80 },
          { topic: 'quality settings', severity: 'major' as const, impact: 60 }
        ]
      }]
    };

    const gaps = planner.analyzeGaps(coverage);

    expect(gaps).toBeDefined();
    expect(Array.isArray(gaps)).toBe(true);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0]).toHaveProperty('cluster');
    expect(gaps[0]).toHaveProperty('topic');
    expect(gaps[0]).toHaveProperty('severity');
  });

  it('should prioritize content items', () => {
    const gaps = [
      { cluster: 'test', topic: 'Feature A', severity: 'critical' as const, currentCoverage: 0, competitorAvg: 90, impact: 80 },
      { cluster: 'test', topic: 'Feature B', severity: 'minor' as const, currentCoverage: 50, competitorAvg: 60, impact: 30 }
    ];

    const items = planner.prioritizeContent(gaps);

    expect(items).toBeDefined();
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].priority).toBeGreaterThan(items[1].priority);
  });

  it('should generate content calendar', () => {
    const items = [
      { cluster: 'test', topic: 'Topic 1', type: 'blog' as const, priority: 8, impact: 70, effort: 3, url: '/topic-1' },
      { cluster: 'test', topic: 'Topic 2', type: 'lp_update' as const, priority: 6, impact: 50, effort: 2, url: '/topic-2' }
    ];

    const calendar = planner.generateCalendar(items);

    expect(calendar).toBeDefined();
    expect(calendar.weeks).toBeDefined();
    expect(Array.isArray(calendar.weeks)).toBe(true);
    expect(calendar.totalEffort).toBe(5);
    expect(calendar.totalImpact).toBe(120);
  });

  it('should generate common FAQs', () => {
    const faqs = faqExtractor.generateCommonFAQs('testproduct', 'webp-to-png');

    expect(faqs).toBeDefined();
    expect(Array.isArray(faqs)).toBe(true);
    expect(faqs.length).toBeGreaterThan(0);
    expect(faqs[0]).toHaveProperty('question');
    expect(faqs[0]).toHaveProperty('answer');
    expect(faqs[0]).toHaveProperty('source');
    expect(faqs[0]).toHaveProperty('relevance');
  });

  it('should create FAQ bank with limits', () => {
    const faqs = [
      { question: 'Q1?', answer: 'A1', source: 'paa' as const, relevance: 90, searchVolume: 100 },
      { question: 'Q2?', answer: 'A2', source: 'serp' as const, relevance: 80, searchVolume: 50 },
      { question: 'Q3?', answer: 'A3', source: 'generated' as const, relevance: 70, searchVolume: 30 },
      { question: 'Q4?', answer: 'A4', source: 'generated' as const, relevance: 60, searchVolume: 20 },
      { question: 'Q5?', answer: 'A5', source: 'generated' as const, relevance: 50, searchVolume: 10 }
    ];

    const bank = faqExtractor.createFAQBank(faqs, 3);

    expect(bank).toHaveLength(3);
    expect(bank[0].relevance).toBeGreaterThanOrEqual(bank[1].relevance);
  });
});

describe('v1.8 Phase 4: Link Optimization', () => {
  let optimizer: LinkOptimizer;

  beforeAll(() => {
    optimizer = new LinkOptimizer();
  });

  it('should find link opportunities', () => {
    const sourcePage = {
      url: '/product/overview',
      title: 'Product Overview',
      content: 'This product converts webp to png and handles pdf to word conversion.',
      keywords: ['convert', 'webp', 'png', 'pdf', 'word'],
      entities: ['webp', 'png', 'pdf', 'word'],
      existingLinks: []
    };

    const targetPages = [
      {
        url: '/product/webp-to-png',
        title: 'WebP to PNG',
        content: 'Convert WebP images to PNG format.',
        keywords: ['webp', 'png', 'convert'],
        entities: ['webp', 'png'],
        existingLinks: []
      },
      {
        url: '/product/pdf-to-word',
        title: 'PDF to Word',
        content: 'Convert PDF documents to Word files.',
        keywords: ['pdf', 'word', 'convert'],
        entities: ['pdf', 'word'],
        existingLinks: []
      }
    ];

    const opportunities = optimizer.findOpportunities(sourcePage, targetPages);

    expect(opportunities).toBeDefined();
    expect(Array.isArray(opportunities)).toBe(true);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities[0]).toHaveProperty('sourceUrl');
    expect(opportunities[0]).toHaveProperty('targetUrl');
    expect(opportunities[0]).toHaveProperty('anchorText');
    expect(opportunities[0]).toHaveProperty('strength');
  });

  it('should generate anchor text variations', () => {
    const anchors = optimizer.generateAnchors('image converter', 'Convert images online');

    expect(anchors).toBeDefined();
    expect(Array.isArray(anchors)).toBe(true);
    expect(anchors.length).toBeGreaterThan(3);
    expect(anchors).toContain('image converter');
    expect(anchors.some(a => a.includes('learn'))).toBe(true);
  });

  it('should apply link constraints', () => {
    const opportunities = [
      { sourceUrl: '/page1', targetUrl: '/page2', anchorText: 'link 1', context: 'ctx', strength: 3, rationale: 'test', type: 'contextual' as const },
      { sourceUrl: '/page1', targetUrl: '/page3', anchorText: 'link 2', context: 'ctx', strength: 2, rationale: 'test', type: 'contextual' as const },
      { sourceUrl: '/page1', targetUrl: '/page4', anchorText: 'link 3', context: 'ctx', strength: 2, rationale: 'test', type: 'contextual' as const },
      { sourceUrl: '/page1', targetUrl: '/page5', anchorText: 'link 4', context: 'ctx', strength: 1, rationale: 'test', type: 'contextual' as const }
    ];

    const constrained = optimizer.applyConstraints(opportunities, {
      maxLinksPerPage: 2,
      requireRelevance: 0.5
    });

    expect(constrained.length).toBeLessThanOrEqual(2);
    expect(constrained[0].strength).toBeGreaterThanOrEqual(constrained[constrained.length - 1].strength);
  });

  it('should validate link opportunities', () => {
    const opportunities = [
      { sourceUrl: '/page1', targetUrl: '/page2', anchorText: 'good link', context: 'ctx', strength: 3, rationale: 'test', type: 'contextual' as const },
      { sourceUrl: '/page1', targetUrl: '/page1', anchorText: 'self link', context: 'ctx', strength: 2, rationale: 'test', type: 'contextual' as const },
      { sourceUrl: '/page1', targetUrl: '/page3', anchorText: 'click here', context: 'ctx', strength: 2, rationale: 'test', type: 'contextual' as const },
      { sourceUrl: '/page1', targetUrl: '/page4', anchorText: '', context: 'ctx', strength: 1, rationale: 'test', type: 'contextual' as const }
    ];

    const { valid, invalid } = optimizer.validateOpportunities(opportunities);

    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid.some(i => i.reason.includes('Self-link'))).toBe(true);
    expect(invalid.some(i => i.reason.includes('Generic'))).toBe(true);
  });
});