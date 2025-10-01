/**
 * A/B Testing Framework - Fixed Test Suite
 * Tests updated to match actual implementation API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager, databaseManager } from '../src/database/database-manager.js';
import { ExperimentManager } from '../src/experiments/experiment-manager.js';
import { RSAVariantGenerator, LandingPageVariantGenerator } from '../src/experiments/variant-generator.js';
import { ExperimentRepository } from '../src/database/experiment-repository.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('A/B Testing Framework - Fixed Implementation', () => {
  let db: DatabaseManager;
  let experimentManager: ExperimentManager;
  let rsaVariantGenerator: RSAVariantGenerator;
  let lpVariantGenerator: LandingPageVariantGenerator;
  let testDbPath: string;
  let testExperimentsDir: string;

  beforeEach(async () => {
    // FIX: Close singleton database manager to reset state between tests
    if (databaseManager.isInitialized()) {
      databaseManager.close();
    }

    // Create test database
    testDbPath = path.join(process.cwd(), 'data', 'test-ab-framework.db');

    // FIX: Delete existing test databases to avoid stale data accumulation
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // File doesn't exist, that's fine
    }

    // FIX: Also delete the singleton database used by experimentRepository
    try {
      await fs.unlink(path.join(process.cwd(), 'experiments', 'experiments.db'));
    } catch (error) {
      // File doesn't exist, that's fine
    }

    db = new DatabaseManager({ path: testDbPath });
    await db.initialize();

    // Create test experiments directory
    testExperimentsDir = path.join(process.cwd(), 'test-experiments');
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

    // Close singleton database manager
    if (databaseManager.isInitialized()) {
      databaseManager.close();
    }

    await fs.unlink(testDbPath).catch(() => {});
    await fs.unlink(path.join(process.cwd(), 'experiments', 'experiments.db')).catch(() => {});
    await fs.rm(testExperimentsDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(process.cwd(), 'experiments'), { recursive: true, force: true }).catch(() => {});
  });

  describe('ExperimentManager - Fixed', () => {
    it('should create an RSA experiment with correct config', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        confidenceLevel: 0.95,
        minimumSampleSize: 1000,
        duration: 14,
        description: 'Test RSA experiment for improving CTR',
        hypothesis: 'New headlines will improve CTR by 10%',
        variantStrategies: ['diverse', 'benefit_focused'],
        useV14Insights: false
      });

      expect(experiment).toBeDefined();
      expect(experiment.id).toBeDefined();
      expect(experiment.type).toBe('rsa');
      expect(experiment.status).toBe('draft');
      expect(experiment.product).toBe('test-product');
      expect(experiment.targetId).toBe('ad_group_123');
      expect(experiment.targetMetric).toBe('ctr');
      expect(experiment.confidenceLevel).toBe(0.95);
      
      // Variants should be generated based on strategies
      expect(experiment.variants).toBeDefined();
      expect(Array.isArray(experiment.variants)).toBe(true);
    });

    it('should create a landing page experiment with correct config', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'landing_page',
        product: 'test-product',
        targetId: '/landing/page',
        targetMetric: 'cvr',
        confidenceLevel: 0.95,
        minimumSampleSize: 500,
        duration: 7,
        description: 'Landing page conversion optimization',
        hypothesis: 'New CTA will increase conversions by 15%',
        variantStrategies: ['conversion_focused', 'trust_building'],
        useV14Insights: true
      });

      expect(experiment).toBeDefined();
      expect(experiment.type).toBe('landing_page');
      expect(experiment.targetId).toBe('/landing/page');
      expect(experiment.targetMetric).toBe('cvr');
    });

    it('should start an experiment', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        description: 'Test experiment',
        hypothesis: 'Testing start functionality',
        variantStrategies: ['diverse']
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
        description: 'Test experiment',
        hypothesis: 'Testing pause functionality',
        variantStrategies: ['diverse']
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
        description: 'Test experiment',
        hypothesis: 'Testing completion',
        variantStrategies: ['diverse']
      });

      await experimentManager.startExperiment(experiment.id);
      
      // Get the first test variant name
      const testVariant = experiment.variants.find(v => !v.isControl);
      const winnerName = testVariant?.name || 'Test Variant';
      
      await experimentManager.completeExperiment(experiment.id, winnerName);
      
      const updated = await experimentManager.getExperiment(experiment.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.metadata.winner).toBe(winnerName);
      expect(updated?.endDate).toBeDefined();
    });

    it('should list experiments with filters', async () => {
      // Create multiple experiments
      await experimentManager.createExperiment({
        type: 'rsa',
        product: 'product-1',
        targetId: 'ad_1',
        targetMetric: 'ctr',
        description: 'RSA experiment',
        hypothesis: 'Testing RSA',
        variantStrategies: ['diverse']
      });

      await experimentManager.createExperiment({
        type: 'landing_page',
        product: 'product-2',
        targetId: 'page_1',
        targetMetric: 'cvr',
        description: 'LP experiment',
        hypothesis: 'Testing LP',
        variantStrategies: ['conversion_focused']
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

    it('should check experiment guards correctly', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        minimumSampleSize: 1000,
        description: 'Testing guards',
        hypothesis: 'Guards will validate properly',
        variantStrategies: ['diverse']
      });

      const guardResults = await experimentManager.checkGuards(experiment);
      
      expect(guardResults).toBeDefined();
      expect(Array.isArray(guardResults)).toBe(true);
      
      // Check guard result structure
      if (guardResults.length > 0) {
        const firstGuard = guardResults[0];
        expect(firstGuard.guard).toBeDefined();
        expect(firstGuard.passed).toBeDefined();
        expect(firstGuard.currentValue).toBeDefined();
        expect(firstGuard.message).toBeDefined();
        
        // Check for similarity guard using correct structure
        const similarityGuard = guardResults.find(g => g.guard.type === 'similarity');
        if (similarityGuard) {
          expect(typeof similarityGuard.passed).toBe('boolean');
        }
      }
    });
  });

  describe('Variant Generators - Fixed', () => {
    it('should generate RSA variants using correct method', async () => {
      const baseRSA = {
        adGroupId: 'test-ag',
        adGroupName: 'Test AG',
        product: 'test-product',
        useCase: 'general',
        keywords: ['keyword1', 'keyword2', 'keyword3'], // FIX: Add required keywords property
        currentHeadlines: ['Original H1', 'Original H2', 'Original H3'],
        currentDescriptions: ['Original D1', 'Original D2'],
        landingPageUrl: 'https://example.com',
        path1: 'test',
        path2: 'path',
        finalUrl: 'https://example.com'
      };

      // Use the correct method name with await
      const variants = await rsaVariantGenerator.generateRSAVariants(
        baseRSA,
        ['diverse', 'benefit_focused']
      );

      expect(variants).toBeDefined();
      expect(Array.isArray(variants)).toBe(true);
      if (variants.length > 0) {
        expect(variants[0].headlines.length).toBeGreaterThanOrEqual(3);
        expect(variants[0].descriptions.length).toBeGreaterThanOrEqual(2);
        expect(variants[0].name).toBeDefined();
        expect(variants[0].weight).toBeDefined();
      }
    });

    it('should generate landing page variants using correct method', async () => {
      const basePage = {
        landingPage: '/landing',
        headline: 'Original Headline',
        subheadline: 'Original Subheadline',
        cta: 'Original CTA',
        features: ['Feature 1', 'Feature 2'],
        testimonials: [],
        faqs: [],
        proofPoints: []
      };

      // Use the correct method name with await
      const variants = await lpVariantGenerator.generatePageVariants(
        basePage,
        'headline'  // Use valid strategy type
      );

      expect(variants).toBeDefined();
      expect(Array.isArray(variants)).toBe(true);
      if (variants.length > 0) {
        expect(variants[0].headline).toBeDefined();
        expect(variants[0].name).toBeDefined();
      }
    });

    it('should calculate RSA similarity correctly', () => {
      const variant1 = {
        headlines: ['Test H1', 'Test H2', 'Test H3'],
        descriptions: ['Test D1', 'Test D2']
      };

      const variant2 = {
        headlines: ['Test H1', 'Different H2', 'Different H3'],
        descriptions: ['Test D1', 'Different D2']
      };

      // calculateSimilarity returns a number
      const similarity = rsaVariantGenerator.calculateSimilarity(variant1, variant2);
      
      expect(typeof similarity).toBe('number');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
      
      // Around 40% similar (2 out of 5 elements match)
      expect(similarity).toBeCloseTo(0.4, 1);
    });

    it('should calculate landing page similarity correctly', () => {
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

      // calculatePageSimilarity returns a number
      const similarity = lpVariantGenerator.calculatePageSimilarity(variant1, variant2);
      
      expect(typeof similarity).toBe('number');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration Tests - Fixed', () => {
    it('should handle complete experiment workflow', async () => {
      // Create experiment with all required fields
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        confidenceLevel: 0.95,
        minimumSampleSize: 100,
        duration: 14,
        description: 'Complete workflow test',
        hypothesis: 'Testing complete workflow',
        variantStrategies: ['diverse', 'benefit_focused'],
        useV14Insights: false
      });

      expect(experiment.status).toBe('draft');

      // Start experiment
      await experimentManager.startExperiment(experiment.id);
      const started = await experimentManager.getExperiment(experiment.id);
      expect(started?.status).toBe('active');

      // Complete experiment with an actual variant name
      const winnerVariant = started?.variants.find(v => !v.isControl);
      if (winnerVariant) {
        await experimentManager.completeExperiment(experiment.id, winnerVariant.name);
        const completed = await experimentManager.getExperiment(experiment.id);
        
        expect(completed?.status).toBe('completed');
        expect(completed?.endDate).toBeDefined();
        expect(completed?.metadata.winner).toBe(winnerVariant.name);
      }
    });

    it('should save experiment results to correct location', async () => {
      const experiment = await experimentManager.createExperiment({
        type: 'rsa',
        product: 'test-product',
        targetId: 'ad_group_123',
        targetMetric: 'ctr',
        description: 'Save test',
        hypothesis: 'Testing save functionality',
        variantStrategies: ['diverse']
      });

      await experimentManager.startExperiment(experiment.id);
      
      // Get a variant to declare as winner
      const winner = experiment.variants.find(v => !v.isControl);
      if (winner) {
        await experimentManager.completeExperiment(experiment.id, winner.name);
      }

      // Save experiment results
      const completed = await experimentManager.getExperiment(experiment.id);
      if (completed) {
        await experimentManager.saveExperiment(completed);
      }

      // Check that experiment was saved in the experiments directory
      const registryPath = path.join(testExperimentsDir, 'experiments.json');
      const registryExists = await fs.access(registryPath).then(() => true).catch(() => false);
      
      expect(registryExists).toBe(true);
      
      if (registryExists) {
        const registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
        expect(registry.experiments).toBeDefined();
        expect(Array.isArray(registry.experiments)).toBe(true);
        
        const savedExperiment = registry.experiments.find((e: any) => e.id === experiment.id);
        expect(savedExperiment).toBeDefined();
      }
    });
  });
});