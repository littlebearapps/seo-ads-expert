/**
 * v1.5 A/B Testing Framework - Test Suite
 * Tests for existing experiment management and variant generation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager, databaseManager } from '../src/database/database-manager.js';
import { ExperimentManager } from '../src/experiments/experiment-manager.js';
import { RSAVariantGenerator, LandingPageVariantGenerator } from '../src/experiments/variant-generator.js';
import { ExperimentRepository } from '../src/database/experiment-repository.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('A/B Testing Framework - Existing Implementation', () => {
  let db: DatabaseManager;
  let experimentManager: ExperimentManager;
  let rsaVariantGenerator: RSAVariantGenerator;
  let lpVariantGenerator: LandingPageVariantGenerator;
  let testDbPath: string;

  beforeEach(async () => {
    // Clean up any previous test artifacts
    testDbPath = path.join(process.cwd(), 'data', 'test-ab-framework.db');
    await fs.unlink(testDbPath).catch(() => {}); // Delete if exists

    // Create fresh test database
    db = new DatabaseManager({ path: testDbPath });
    await db.initialize();

    // IMPORTANT: Clean up the experiments database used by experimentRepository
    // The repository uses a singleton database manager pointing to experiments/experiments.db
    databaseManager.close(); // Close singleton before deleting its database
    const experimentsDbPath = path.join(process.cwd(), 'experiments', 'experiments.db');
    await fs.unlink(experimentsDbPath).catch(() => {});
    // Database manager will reinitialize on next use

    // Create test experiments directory (clean slate)
    const testExperimentsDir = path.join(process.cwd(), 'test-experiments');
    await fs.rm(testExperimentsDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(testExperimentsDir, { recursive: true });

    // Initialize components with correct constructor parameters
    experimentManager = new ExperimentManager(testExperimentsDir);
    rsaVariantGenerator = new RSAVariantGenerator();
    lpVariantGenerator = new LandingPageVariantGenerator();

    // Initialize the experiment manager
    await experimentManager.initialize();
  });

  afterEach(async () => {
    await db.close();
    await fs.unlink(testDbPath).catch(() => {});
    await fs.rm(path.join(process.cwd(), 'test-experiments'), { recursive: true, force: true }).catch(() => {});
  });

  describe('Experiment Manager', () => {
    it('should create an RSA experiment', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        confidenceLevel: 0.95,
        variants: [
          {
            name: 'Control',
            headlines: ['Headline 1', 'Headline 2', 'Headline 3'],
            descriptions: ['Description 1', 'Description 2'],
            isControl: true
          },
          {
            name: 'Test A',
            headlines: ['Test H1', 'Test H2', 'Test H3'],
            descriptions: ['Test D1', 'Test D2'],
            isControl: false
          }
        ]
      });

      expect(experiment).toBeDefined();
      expect(experiment.id).toBeDefined();
      expect(experiment.type).toBe('rsa');
      expect(experiment.status).toBe('draft');
      expect(experiment.variants).toHaveLength(2);
    });

    it('should create a landing page experiment', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'landing_page',
        product: 'test-product',
        targetId: '/landing/page',
        targetMetric: 'cvr',
        confidenceLevel: 0.95,
        variants: [
          {
            name: 'Control',
            contentPath: '/content/control.html',
            isControl: true
          },
          {
            name: 'Variant A',
            contentPath: '/content/variant-a.html',
            isControl: false
          }
        ]
      });

      expect(experiment).toBeDefined();
      expect(experiment.type).toBe('landing_page');
      expect(experiment.targetId).toBe('/landing/page');
    });

    it('should start an experiment', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        variants: []
      });

      await experimentManager.startExperiment(experiment.id);
      const updated = await experimentManager.getExperiment(experiment.id);
      
      expect(updated?.status).toBe('active');
      expect(updated?.startDate).toBeDefined();
    });

    it('should pause an experiment', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        variants: []
      });

      await experimentManager.startExperiment(experiment.id);
      await experimentManager.pauseExperiment(experiment.id);
      
      const updated = await experimentManager.getExperiment(experiment.id);
      expect(updated?.status).toBe('paused');
    });

    it('should complete an experiment with a winner', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        variants: [
          {
            name: 'Control',
            headlines: ['H1'],
            descriptions: ['D1'],
            isControl: true
          },
          {
            name: 'Test',
            headlines: ['H2'],
            descriptions: ['D2'],
            isControl: false
          }
        ]
      });

      await experimentManager.startExperiment(experiment.id);
      await experimentManager.completeExperiment(experiment.id, 'Test');
      
      const updated = await experimentManager.getExperiment(experiment.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.metadata.winner).toBe('Test');
    });

    it('should list experiments with filters', async () => {
      // Create multiple experiments
      await experimentManager.createExperiment({
        type: 'rsa',
        product: 'product-1',
        targetId: 'ad_1',
        targetMetric: 'ctr',
        variants: []
      });

      await experimentManager.createExperiment({
        type: 'landing_page',
        product: 'product-2',
        targetId: 'page_1',
        targetMetric: 'cvr',
        variants: []
      });

      const rsaExperiments = await experimentManager.listExperiments({
        type: 'rsa'
      });

      const landingPageExperiments = await experimentManager.listExperiments({
        type: 'landing_page'
      });

      expect(rsaExperiments).toHaveLength(1);
      expect(landingPageExperiments).toHaveLength(1);
    });

    it('should check experiment guards', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        minimumSampleSize: 1000,
        variants: [
          {
            name: 'Control',
            headlines: ['Similar Headline'],
            descriptions: ['Similar Description'],
            isControl: true
          },
          {
            name: 'Test',
            headlines: ['Similar Headline'],
            descriptions: ['Similar Description'],
            isControl: false
          }
        ]
      });

      const guardResults = await experimentManager.checkGuards(experiment);
      
      expect(guardResults).toBeDefined();
      expect(Array.isArray(guardResults)).toBe(true);
      
      // Check for similarity guard
      const similarityGuard = guardResults.find(g => g.type === 'similarity');
      if (similarityGuard) {
        expect(similarityGuard.passed).toBe(false);
      }
    });
  });

  describe('Variant Generators', () => {
    it('should generate RSA variants', async () => {
      const baseRSA = {
        id: 'test-ag',
        name: 'Test AG',
        product: 'test-product',
        keywords: ['keyword1', 'keyword2'],
        currentHeadlines: ['Original H1', 'Original H2', 'Original H3'],
        currentDescriptions: ['Original D1', 'Original D2'],
        landingPageUrl: 'https://example.com',
        useCase: 'general'
      };

      const variants = await rsaVariantGenerator.generateVariants(baseRSA, 'benefit_led');

      expect(variants).toBeDefined();
      expect(Array.isArray(variants)).toBe(true);
      expect(variants.length).toBeGreaterThan(0);
      if (variants.length > 0) {
        expect(variants[0].headlines.length).toBeGreaterThanOrEqual(3);
        expect(variants[0].descriptions.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should generate landing page variants', async () => {
      const basePage = {
        path: '/landing',
        headlines: ['Original Headline'],
        proofBlocks: [],
        faqs: [],
        socialProof: []
      };

      const variants = await lpVariantGenerator.generateVariants(basePage, 'benefit_led');

      expect(variants).toBeDefined();
      expect(Array.isArray(variants)).toBe(true);
      expect(variants.length).toBeGreaterThan(0);
      if (variants.length > 0) {
        expect(variants[0].headline).toBeDefined();
        expect(variants[0].cta).toBeDefined();
      }
    });

    it('should check RSA variant similarity', () => {
      const variant1 = {
        headlines: ['Test H1', 'Test H2', 'Test H3'],
        descriptions: ['Test D1', 'Test D2']
      };

      const variant2 = {
        headlines: ['Test H1', 'Different H2', 'Different H3'],
        descriptions: ['Test D1', 'Different D2']
      };

      const similarity = rsaVariantGenerator.checkSimilarity(variant1, variant2);
      
      expect(similarity).toBeDefined();
      expect(similarity.score).toBeGreaterThan(0);
      expect(similarity.score).toBeLessThan(1);
      expect(similarity.isTooSimilar).toBeDefined();
    });

    it('should check landing page variant similarity', () => {
      const variant1 = {
        headline: 'Test Headline',
        subheadline: 'Test Sub',
        cta: 'Test CTA'
      };

      const variant2 = {
        headline: 'Different Headline',
        subheadline: 'Different Sub',
        cta: 'Test CTA'
      };

      const similarity = lpVariantGenerator.checkSimilarity(variant1, variant2);
      
      expect(similarity).toBeDefined();
      expect(similarity.score).toBeGreaterThan(0);
      expect(similarity.score).toBeLessThan(1);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete experiment workflow', async () => {
      // Create experiment
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        confidenceLevel: 0.95,
        minimumSampleSize: 100,
        variants: [
          {
            name: 'Control',
            headlines: ['Base H1', 'Base H2', 'Base H3'],
            descriptions: ['Base D1', 'Base D2'],
            isControl: true
          },
          {
            name: 'Test 1',
            headlines: ['Test H1', 'Test H2', 'Test H3'],
            descriptions: ['Test D1', 'Test D2'],
            isControl: false
          }
        ]
      });

      expect(experiment.status).toBe('draft');

      // Start experiment
      await experimentManager.startExperiment(experiment.id);
      const started = await experimentManager.getExperiment(experiment.id);
      expect(started?.status).toBe('active');

      // Simulate running for a while...
      // In real usage, metrics would be collected here

      // Complete experiment
      await experimentManager.completeExperiment(experiment.id, 'Test 1');
      const completed = await experimentManager.getExperiment(experiment.id);
      
      expect(completed?.status).toBe('completed');
      expect(completed?.endDate).toBeDefined();
      expect(completed?.metadata.winner).toBe('Test 1');
    });

    it('should export experiment results', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        variants: [
          {
            name: 'Winner',
            headlines: ['Winning H1', 'Winning H2', 'Winning H3'],
            descriptions: ['Winning D1', 'Winning D2'],
            isControl: false
          }
        ]
      });

      await experimentManager.startExperiment(experiment.id);
      await experimentManager.completeExperiment(experiment.id, 'Winner');

      // Save experiment results
      const completed = await experimentManager.getExperiment(experiment.id);
      if (completed) {
        await experimentManager.saveExperiment(completed);
      }

      // Check that experiment was saved
      const experimentsDir = path.join('plans', 'test-product', 'experiments');
      const files = await fs.readdir(experimentsDir).catch(() => []);
      
      expect(files.length).toBeGreaterThan(0);
    });
  });
});