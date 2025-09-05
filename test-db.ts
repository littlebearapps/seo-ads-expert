import { experimentManager } from './src/experiments/experiment-manager.js';
import { logger } from './src/utils/logger.js';
import { experimentRepository } from './src/database/experiment-repository.js';

async function testDatabase() {
  try {
    logger.info('🧪 Testing database persistence...');
    
    // Initialize experiment manager
    await experimentManager.initialize();
    logger.info('✅ Experiment manager initialized');
    
    // Create an experiment
    const experiment = await experimentManager.createExperiment({
      type: 'rsa',
      product: 'test-product',
      targetId: 'ag_12345',
      targetMetric: 'ctr',
      description: 'Test RSA experiment',
      hypothesis: 'Testing database persistence',
      variantStrategies: ['benefit_led', 'proof_led']
    });
    
    logger.info(`✅ Experiment created: ${experiment.id}`);
    
    // Add some test variants manually
    experiment.variants = [
      {
        id: 'control',
        name: 'Control',
        isControl: true,
        weight: 0.5,
        metadata: {},
        headlines: ['Test Headline 1', 'Test Headline 2'],
        descriptions: ['Test Description 1', 'Test Description 2'],
        finalUrls: ['https://example.com'],
        labels: ['control']
      },
      {
        id: 'variant_1',
        name: 'Variant 1',
        isControl: false,
        weight: 0.5,
        metadata: {},
        headlines: ['Variant Headline 1', 'Variant Headline 2'],
        descriptions: ['Variant Description 1', 'Variant Description 2'],
        finalUrls: ['https://example.com'],
        labels: ['variant1']
      }
    ];
    
    // Save to database
    await experimentRepository.saveExperiment(experiment);
    logger.info(`✅ Experiment saved to database with ${experiment.variants.length} variants`);
    
    // Load experiment back from database
    const loaded = await experimentRepository.loadExperiment(experiment.id);
    
    if (loaded) {
      logger.info(`✅ Experiment loaded from database: ${loaded.id}`);
      logger.info(`   - Variants: ${loaded.variants.length}`);
      logger.info(`   - Status: ${loaded.status}`);
      logger.info(`   - Type: ${loaded.type}`);
      logger.info(`   - Product: ${loaded.product}`);
      logger.info(`   - Target ID: ${loaded.targetId}`);
      
      // Verify variant data
      if (loaded.variants.length > 0) {
        const variant = loaded.variants[0];
        logger.info(`   - First variant: ${variant.name} (control: ${variant.isControl})`);
      }
    } else {
      logger.error('❌ Failed to load experiment from database');
    }
    
    // List all experiments
    const allExperiments = await experimentRepository.listExperiments();
    logger.info(`✅ Total experiments in database: ${allExperiments.length}`);
    
    // Get database stats
    const stats = await experimentRepository.getStats();
    logger.info('📊 Database statistics:');
    logger.info(`   - Experiments: ${stats.experiments}`);
    logger.info(`   - Variants: ${stats.variants}`);
    logger.info(`   - Daily metrics: ${stats.dailyMetrics}`);
    logger.info(`   - Conversions: ${stats.conversions}`);
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    console.error(error);
  }
}

testDatabase();