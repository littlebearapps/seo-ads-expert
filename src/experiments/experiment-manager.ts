/**
 * Experiment Manager - Core A/B Testing Framework
 * Manages lifecycle of RSA and Landing Page experiments
 */

import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { experimentRepository } from '../database/experiment-repository.js';
import { RSAVariantGenerator, LandingPageVariantGenerator } from './variant-generator.js';

export interface Variant {
  id: string;
  name: string;
  isControl: boolean;
  weight: number; // Traffic allocation (0-1)
  metadata: Record<string, any>;
}

export interface RSAVariant extends Variant {
  headlines: string[];
  descriptions: string[];
  finalUrls: string[];
  labels: string[];
}

export interface PageVariant extends Variant {
  contentPath: string;
  routingRules: Record<string, any>;
}

export interface ExperimentGuard {
  type: 'similarity' | 'budget' | 'duration' | 'sample_size';
  threshold: number;
  message: string;
}

export interface Experiment {
  id: string;
  type: 'rsa' | 'landing_page';
  product: string;
  targetId: string; // ad_group_id or page_path
  variants: (RSAVariant | PageVariant)[];
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'active' | 'paused' | 'completed';
  targetMetric: 'ctr' | 'cvr' | 'cws_click_rate';
  minimumSampleSize: number;
  confidenceLevel: number;
  guards: ExperimentGuard[];
  metadata: {
    description: string;
    hypothesis: string;
    successCriteria: string;
    createdBy: string;
    v14InsightsUsed?: string[]; // Links to v1.4 waste/QS analysis
  };
}

export interface ExperimentConfig {
  type: 'rsa' | 'landing_page';
  product: string;
  targetId: string;
  targetMetric: 'ctr' | 'cvr' | 'cws_click_rate';
  minimumSampleSize?: number;
  confidenceLevel?: number;
  duration?: number; // days
  description: string;
  hypothesis: string;
  variantStrategies: string[]; // e.g., ['benefit_led', 'proof_led']
  useV14Insights?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GuardResult {
  guard: ExperimentGuard;
  passed: boolean;
  currentValue: number;
  message: string;
}

export class ExperimentManager {
  private experimentsDir: string;
  private registryPath: string;

  constructor(baseDir: string = 'experiments') {
    this.experimentsDir = baseDir;
    this.registryPath = path.join(baseDir, 'experiments.json');
  }

  /**
   * Initialize the experiment system
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.experimentsDir, { recursive: true });
      
      // Initialize SQLite database
      await experimentRepository.loadExperiment('_init_'); // This will trigger database initialization
      
      // Create experiments registry if it doesn't exist (for compatibility)
      try {
        await fs.access(this.registryPath);
      } catch {
        await fs.writeFile(this.registryPath, JSON.stringify({
          experiments: [],
          metadata: {
            version: '1.5.0',
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          }
        }, null, 2));
      }
      
      logger.info('✅ Experiment Manager initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Experiment Manager:', error);
      if (error instanceof Error) {
        logger.error('Init error message:', error.message);
        logger.error('Init error stack:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Create a new experiment
   */
  async createExperiment(config: ExperimentConfig): Promise<Experiment> {
    logger.info(`🧪 Creating ${config.type} experiment for ${config.product}`);

    const experimentId = this.generateExperimentId(config.type, config.product);
    
    // Generate variants based on strategies
    let variants: (RSAVariant | PageVariant)[] = [];
    if (config.variantStrategies && config.variantStrategies.length > 0) {
      if (config.type === 'rsa') {
        const rsaGenerator = new RSAVariantGenerator();
        // Create a base RSA for testing matching expected format
        const baseRSA = {
          adGroupId: config.targetId,
          adGroupName: config.product,
          name: config.product,
          product: config.product,
          useCase: 'general',
          keywords: ['keyword1', 'keyword2', 'keyword3'],
          currentHeadlines: ['Default H1', 'Default H2', 'Default H3'],
          currentDescriptions: ['Default D1', 'Default D2'],
          landingPageUrl: 'https://example.com',
          path1: 'test',
          path2: 'path',
          v14Insights: config.useV14Insights ? { wasteAnalysis: [], qsAnalysis: [] } : undefined
        };
        variants = await rsaGenerator.generateRSAVariants(baseRSA, config.variantStrategies);
      } else if (config.type === 'landing_page') {
        const lpGenerator = new LandingPageVariantGenerator();
        // Create a base page for testing matching expected format
        const basePage = {
          landingPage: config.targetId,
          path: config.targetId.startsWith('/') ? config.targetId : `/landing/${config.targetId}.html`,
          headline: 'Default Headline',
          subheadline: 'Default Subheadline',
          cta: 'Default CTA',
          features: [],
          testimonials: [],
          faqs: [],
          proofPoints: []
        };
        // Generate variants for each strategy
        for (const strategy of config.variantStrategies) {
          const strategyVariants = await lpGenerator.generatePageVariants(basePage, strategy as any);
          variants.push(...strategyVariants);
        }
      }
    }
    
    const experiment: Experiment = {
      id: experimentId,
      type: config.type,
      product: config.product,
      targetId: config.targetId,
      variants: variants,
      startDate: new Date(),
      endDate: config.duration ? new Date(Date.now() + config.duration * 24 * 60 * 60 * 1000) : undefined,
      status: 'draft',
      targetMetric: config.targetMetric,
      minimumSampleSize: config.minimumSampleSize || this.calculateMinimumSampleSize(config.targetMetric),
      confidenceLevel: config.confidenceLevel || 0.95,
      guards: this.getDefaultGuards(config.type),
      metadata: {
        description: config.description,
        hypothesis: config.hypothesis,
        successCriteria: `Improve ${config.targetMetric} by statistically significant amount`,
        createdBy: 'seo-ads-expert-v1.5',
        v14InsightsUsed: config.useV14Insights ? await this.getV14Insights(config.product) : undefined
      }
    };

    // Validate experiment
    const validation = this.validateExperiment(experiment);
    if (!validation.valid) {
      throw new Error(`Experiment validation failed: ${validation.errors.join(', ')}`);
    }

    // Save experiment to registry
    await this.saveExperiment(experiment);

    logger.info(`✅ Experiment ${experimentId} created successfully`);
    return experiment;
  }

  /**
   * Start an experiment (activate it)
   */
  async startExperiment(experimentId: string): Promise<void> {
    logger.info(`🚀 Starting experiment ${experimentId}`);

    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'draft') {
      throw new Error(`Cannot start experiment in ${experiment.status} status`);
    }

    // Check guards
    const guardResults = await this.checkGuards(experiment);
    const failedGuards = guardResults.filter(g => !g.passed);
    
    if (failedGuards.length > 0) {
      throw new Error(`Guard checks failed: ${failedGuards.map(g => g.message).join(', ')}`);
    }

    // Update experiment status
    experiment.status = 'active';
    experiment.startDate = new Date();
    
    await this.saveExperiment(experiment);
    
    logger.info(`✅ Experiment ${experimentId} started successfully`);
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(experimentId: string): Promise<void> {
    logger.info(`⏸️ Pausing experiment ${experimentId}`);

    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'active') {
      throw new Error(`Cannot pause experiment in ${experiment.status} status`);
    }

    experiment.status = 'paused';
    await this.saveExperiment(experiment);
    
    logger.info(`✅ Experiment ${experimentId} paused successfully`);
  }

  /**
   * Complete an experiment and declare a winner
   */
  async completeExperiment(experimentId: string, winner: string): Promise<void> {
    logger.info(`🏁 Completing experiment ${experimentId} with winner: ${winner}`);

    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (!['active', 'paused'].includes(experiment.status)) {
      throw new Error(`Cannot complete experiment in ${experiment.status} status`);
    }

    // Validate winner exists (check by ID or name)
    if (winner !== 'control' && !experiment.variants.find(v => v.id === winner || v.name === winner)) {
      throw new Error(`Winner variant ${winner} not found in experiment`);
    }

    experiment.status = 'completed';
    experiment.endDate = new Date();
    experiment.metadata = {
      ...experiment.metadata,
      winner,
      completedAt: new Date().toISOString()
    };

    // Save to both database and JSON registry
    await experimentRepository.saveExperiment(experiment);
    await this.saveExperiment(experiment);
    
    logger.info(`✅ Experiment ${experimentId} completed successfully`);
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<Experiment | null> {
    try {
      // Try to load from database first
      const dbExperiment = await experimentRepository.loadExperiment(experimentId);
      if (dbExperiment) {
        return dbExperiment;
      }
      
      // Fall back to JSON registry for backward compatibility
      const registry = await this.loadRegistry();
      return registry.experiments.find(e => e.id === experimentId) || null;
    } catch (error) {
      logger.error('❌ Failed to get experiment:', error);
      return null;
    }
  }

  /**
   * List experiments with optional filters
   */
  async listExperiments(filters?: {
    status?: string;
    product?: string;
    type?: string;
  }): Promise<Experiment[]> {
    try {
      // Use database as primary source
      return await experimentRepository.listExperiments(filters);
    } catch (error) {
      logger.error('❌ Failed to list experiments:', error);
      return [];
    }
  }

  /**
   * Validate experiment configuration
   */
  validateExperiment(experiment: Experiment): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!experiment.id) errors.push('Experiment ID is required');
    if (!experiment.product) errors.push('Product is required');
    if (!experiment.targetId) errors.push('Target ID is required');
    if (experiment.minimumSampleSize < 100) warnings.push('Sample size is very small, may not detect meaningful effects');
    
    // Only require variants for non-draft experiments
    if (experiment.status !== 'draft' && experiment.variants.length < 2) {
      errors.push('At least 2 variants required');
    }

    // Type-specific validation
    if (experiment.type === 'rsa') {
      const rsaVariants = experiment.variants as RSAVariant[];
      if (rsaVariants.some(v => v.headlines.length === 0)) {
        errors.push('RSA variants must have at least 1 headline');
      }
      if (rsaVariants.some(v => v.descriptions.length === 0)) {
        errors.push('RSA variants must have at least 1 description');
      }
    }

    // Traffic allocation validation (only for non-draft experiments with variants)
    if (experiment.status !== 'draft' && experiment.variants.length > 0) {
      const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        errors.push('Variant weights must sum to 1.0');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check experiment guards (safety rules)
   */
  async checkGuards(experiment: Experiment): Promise<GuardResult[]> {
    const results: GuardResult[] = [];

    for (const guard of experiment.guards) {
      let passed = true;
      let currentValue = 0;
      let message = '';

      switch (guard.type) {
        case 'similarity':
          // Check variant similarity (implement in variant generator)
          currentValue = 0.7; // Placeholder
          passed = currentValue < guard.threshold;
          message = `Variant similarity: ${currentValue}`;
          break;
          
        case 'budget':
          // Check daily spend limits
          currentValue = 50; // Placeholder - get from cost monitor
          passed = currentValue < guard.threshold;
          message = `Daily spend: $${currentValue}`;
          break;
          
        case 'duration':
          // Check experiment duration
          const days = experiment.endDate ? 
            (experiment.endDate.getTime() - experiment.startDate.getTime()) / (24 * 60 * 60 * 1000) : 0;
          currentValue = days;
          passed = currentValue >= guard.threshold;
          message = `Experiment duration: ${currentValue} days`;
          break;
          
        case 'sample_size':
          // Check if we have enough data
          currentValue = experiment.minimumSampleSize;
          passed = currentValue >= guard.threshold;
          message = `Minimum sample size: ${currentValue}`;
          break;
      }

      results.push({
        guard,
        passed,
        currentValue,
        message
      });
    }

    return results;
  }

  /**
   * Save experiment (public method for CLI)
   */
  async saveExperiment(experiment: Experiment): Promise<void> {
    const registry = await this.loadRegistry();
    
    // Update or add experiment
    const index = registry.experiments.findIndex(e => e.id === experiment.id);
    if (index >= 0) {
      registry.experiments[index] = experiment;
    } else {
      registry.experiments.push(experiment);
    }
    
    registry.metadata.lastUpdated = new Date().toISOString();
    
    await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Private helper methods
   */
  private generateExperimentId(type: string, product: string): string {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6);
    return `exp_${type}_${product}_${timestamp}_${random}`;
  }

  private calculateMinimumSampleSize(metric: string): number {
    // Simple power analysis - in practice would use more sophisticated calculation
    const baseSizes = {
      'ctr': 1000,      // CTR experiments need more data
      'cvr': 500,       // CVR typically has larger effect sizes
      'cws_click_rate': 750
    };
    return baseSizes[metric] || 1000;
  }

  private getDefaultGuards(type: string): ExperimentGuard[] {
    const common = [
      {
        type: 'sample_size' as const,
        threshold: 100,
        message: 'Minimum 100 samples per variant required'
      },
      {
        type: 'duration' as const,
        threshold: 7,
        message: 'Minimum 7 days experiment duration required'
      }
    ];

    if (type === 'rsa') {
      common.push({
        type: 'similarity' as const,
        threshold: 0.9,
        message: 'RSA variants must be sufficiently different (similarity < 0.9)'
      });
      common.push({
        type: 'budget' as const,
        threshold: 100,
        message: 'Daily spend limit $100 to prevent runaway costs'
      });
    }

    return common;
  }

  private async getV14Insights(product: string): Promise<string[]> {
    // Placeholder - would integrate with v1.4 waste/QS analysis
    const insights = [
      `waste_analysis_${product}`,
      `quality_score_${product}`,
      `paid_organic_gaps_${product}`
    ];
    
    logger.info(`📊 Using v1.4 insights for ${product}: ${insights.join(', ')}`);
    return insights;
  }


  private async loadRegistry(): Promise<{
    experiments: Experiment[];
    metadata: Record<string, any>;
  }> {
    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('❌ Failed to load experiment registry:', error);
      return {
        experiments: [],
        metadata: {
          version: '1.5.0',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }
      };
    }
  }
}

// Export singleton instance
export const experimentManager = new ExperimentManager();