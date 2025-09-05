import { statisticalAnalyzer, powerAnalyzer } from './src/experiments/statistics.js';
import { mockMeasurement } from './src/experiments/mock-measurement.js';
import { experimentManager } from './src/experiments/experiment-manager.js';
import { experimentRepository } from './src/database/experiment-repository.js';
import { logger } from './src/utils/logger.js';

async function testStatisticalAnalysis() {
  try {
    logger.info('🧪 Testing statistical analysis suite...');
    
    // Initialize experiment manager
    await experimentManager.initialize();
    
    // Create a test experiment
    const experiment = await experimentManager.createExperiment({
      type: 'rsa',
      product: 'test-stats',
      targetId: 'ag_12345',
      targetMetric: 'ctr',
      description: 'Test statistical analysis',
      hypothesis: 'Testing stats engine',
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
        headlines: ['Control'],
        descriptions: ['Control'],
        finalUrls: ['https://example.com'],
        labels: ['control']
      },
      {
        id: 'variant_1',
        name: 'Variant 1',
        isControl: false,
        weight: 0.5,
        metadata: {},
        headlines: ['Variant'],
        descriptions: ['Variant'],
        finalUrls: ['https://example.com'],
        labels: ['variant1']
      }
    ];
    
    await experimentRepository.saveExperiment(experiment);
    experiment.status = 'active';
    await experimentRepository.saveExperiment(experiment);
    
    // Generate mock metrics
    await mockMeasurement.collectMockMetrics(experiment.id);
    
    // Get metrics summary
    const summary = await mockMeasurement.getMetricsSummary(experiment.id);
    
    logger.info('\n📊 Test Data Summary:');
    logger.info('Control:', summary.control);
    logger.info('Variant:', summary.variants['variant_1']);
    
    // Test two-proportion z-test
    logger.info('\n🧮 Testing Two-Proportion Z-Test...');
    const zTestResult = statisticalAnalyzer.twoProportionTest(
      summary.control,
      summary.variants['variant_1']
    );
    
    logger.info('Z-Test Results:');
    logger.info(`  - p-value: ${zTestResult.pValue.toFixed(4)}`);
    logger.info(`  - Significant: ${zTestResult.significant}`);
    logger.info(`  - Uplift: ${zTestResult.uplift.toFixed(2)}%`);
    logger.info(`  - Confidence Interval: [${zTestResult.confidenceInterval[0].toFixed(2)}%, ${zTestResult.confidenceInterval[1].toFixed(2)}%]`);
    logger.info(`  - Recommendation: ${zTestResult.recommendation}`);
    logger.info(`  - Power: ${zTestResult.metadata.power.toFixed(2)}`);
    
    // Test Bayesian A/B
    logger.info('\n🎲 Testing Bayesian Analysis...');
    const bayesianResult = statisticalAnalyzer.bayesianAB(
      summary.control,
      summary.variants['variant_1']
    );
    
    logger.info('Bayesian Results:');
    logger.info(`  - P(Variant > Control): ${(bayesianResult.probabilityVariantBetter * 100).toFixed(2)}%`);
    logger.info(`  - Expected Lift: ${bayesianResult.expectedLift.toFixed(2)}%`);
    logger.info(`  - Credible Interval: [${bayesianResult.credibleInterval[0].toFixed(2)}%, ${bayesianResult.credibleInterval[1].toFixed(2)}%]`);
    logger.info(`  - Recommendation: ${bayesianResult.recommendation}`);
    
    // Test Sample Size Calculation
    logger.info('\n📏 Testing Sample Size Calculation...');
    const sampleSize = statisticalAnalyzer.calculateSampleSize(0.02, 0.2, 0.8, 0.05);
    logger.info(`Sample size needed for 20% lift with 80% power: ${sampleSize} per variant`);
    
    // Test Early Stopping Decision
    logger.info('\n🛑 Testing Early Stopping Decision...');
    const shouldStop = statisticalAnalyzer.shouldStopEarly(
      summary.control,
      summary.variants['variant_1']
    );
    logger.info(`Should stop early: ${shouldStop.stop} (reason: ${shouldStop.reason || 'continue'})`);
    
    logger.info('\n✅ Statistical analysis test complete!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    console.error(error);
  }
}

testStatisticalAnalysis();