import { experimentManager } from './src/experiments/experiment-manager.js';
import { mockMeasurement } from './src/experiments/mock-measurement.js';
import { experimentRepository } from './src/database/experiment-repository.js';
import { logger } from './src/utils/logger.js';

async function testMeasurementCollection() {
  try {
    logger.info('🧪 Testing automated measurement collection...');
    
    // Initialize experiment manager
    await experimentManager.initialize();
    
    // Create a test experiment
    const experiment = await experimentManager.createExperiment({
      type: 'rsa',
      product: 'test-product',
      targetId: 'ag_12345',
      targetMetric: 'ctr',
      description: 'Test measurement collection',
      hypothesis: 'Testing automated metrics',
      variantStrategies: ['benefit_led', 'proof_led']
    });
    
    // Add test variants
    experiment.variants = [
      {
        id: 'control',
        name: 'Control',
        isControl: true,
        weight: 0.5,
        metadata: {},
        headlines: ['Control Headline'],
        descriptions: ['Control Description'],
        finalUrls: ['https://example.com'],
        labels: ['control']
      },
      {
        id: 'variant_1',
        name: 'Variant 1',
        isControl: false,
        weight: 0.5,
        metadata: {},
        headlines: ['Variant Headline'],
        descriptions: ['Variant Description'],
        finalUrls: ['https://example.com'],
        labels: ['variant1']
      }
    ];
    
    await experimentRepository.saveExperiment(experiment);
    logger.info(`✅ Created experiment: ${experiment.id}`);
    
    // Start the experiment
    experiment.status = 'active';
    await experimentRepository.saveExperiment(experiment);
    logger.info('✅ Experiment activated');
    
    // Collect mock metrics
    await mockMeasurement.collectMockMetrics(experiment.id);
    await mockMeasurement.generateMockConversions(experiment.id);
    
    // Get metrics summary
    const summary = await mockMeasurement.getMetricsSummary(experiment.id);
    
    logger.info('📊 Metrics Summary:');
    logger.info('Control:');
    logger.info(`  - Impressions: ${summary.control.impressions}`);
    logger.info(`  - Clicks: ${summary.control.clicks}`);
    logger.info(`  - Conversions: ${summary.control.conversions}`);
    logger.info(`  - CTR: ${((summary.control.clicks / summary.control.impressions) * 100).toFixed(2)}%`);
    logger.info(`  - CVR: ${((summary.control.conversions / summary.control.clicks) * 100).toFixed(2)}%`);
    
    for (const [variantId, data] of Object.entries(summary.variants)) {
      logger.info(`${variantId}:`);
      logger.info(`  - Impressions: ${data.impressions}`);
      logger.info(`  - Clicks: ${data.clicks}`);
      logger.info(`  - Conversions: ${data.conversions}`);
      logger.info(`  - CTR: ${((data.clicks / data.impressions) * 100).toFixed(2)}%`);
      logger.info(`  - CVR: ${((data.conversions / data.clicks) * 100).toFixed(2)}%`);
    }
    
    // Test automated collection for all active experiments
    logger.info('\n🤖 Testing automated collection for all active experiments...');
    await mockMeasurement.runAutomatedCollection();
    
    // Get database stats
    const stats = await experimentRepository.getStats();
    logger.info('\n📊 Database statistics after measurement collection:');
    logger.info(`   - Experiments: ${stats.experiments}`);
    logger.info(`   - Variants: ${stats.variants}`);
    logger.info(`   - Daily metrics: ${stats.dailyMetrics}`);
    logger.info(`   - Conversions: ${stats.conversions}`);
    
    logger.info('\n✅ Measurement collection test complete!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    console.error(error);
  }
}

testMeasurementCollection();