import { experimentMeasurement } from './src/experiments/measurement.js';
import { experimentManager } from './src/experiments/experiment-manager.js';
import { experimentRepository } from './src/database/experiment-repository.js';
import { logger } from './src/utils/logger.js';

async function testApiMeasurementCollection() {
  try {
    logger.info('🔌 Testing integrated API measurement collection...\n');
    
    // Initialize experiment manager
    await experimentManager.initialize();
    
    // Create a test experiment
    const experiment = await experimentManager.createExperiment({
      type: 'rsa',
      product: 'test-api',
      targetId: 'ag_12345',
      targetMetric: 'ctr',
      description: 'Test API measurement collection',
      hypothesis: 'Testing real API integration',
      variantStrategies: ['benefit_led', 'proof_led']
    });
    
    // Add test variants with proper labels for Google Ads tracking
    experiment.variants = [
      {
        id: 'control',
        name: 'Control',
        isControl: true,
        weight: 0.5,
        metadata: { 
          googleAdsLabel: 'EXP_CONTROL',
          trackingLabel: `exp_${experiment.id}_control`
        },
        headlines: ['Control Headline'],
        descriptions: ['Control Description'],
        finalUrls: ['https://example.com'],
        labels: ['EXP_CONTROL', `exp_${experiment.id}_control`]
      },
      {
        id: 'variant_benefit',
        name: 'Benefit Led',
        isControl: false,
        weight: 0.5,
        metadata: { 
          googleAdsLabel: 'EXP_BENEFIT',
          trackingLabel: `exp_${experiment.id}_benefit`
        },
        headlines: ['Benefit Headline'],
        descriptions: ['Benefit Description'],
        finalUrls: ['https://example.com'],
        labels: ['EXP_BENEFIT', `exp_${experiment.id}_benefit`]
      }
    ];
    
    await experimentRepository.saveExperiment(experiment);
    experiment.status = 'active';
    await experimentRepository.saveExperiment(experiment);
    
    logger.info(`✅ Created experiment: ${experiment.id}`);
    logger.info(`   Labels configured for Google Ads tracking\n`);
    
    // Test RSA Metrics Collection
    logger.info('📊 Testing RSA metrics collection from Google Ads API...');
    
    const dateRange = {
      startDate: '2025-09-01',
      endDate: '2025-09-05'
    };
    
    try {
      const rsaMetrics = await experimentMeasurement.collectRSAMetrics(
        experiment.id, 
        dateRange
      );
      
      if (rsaMetrics.length > 0) {
        logger.info(`✅ Successfully collected ${rsaMetrics.length} RSA metric records from API`);
        
        // Display sample metrics
        const sample = rsaMetrics[0];
        logger.info('\nSample RSA Metrics:');
        logger.info(`   Date: ${sample.date}`);
        logger.info(`   Variant: ${sample.variantId}`);
        logger.info(`   Impressions: ${sample.impressions}`);
        logger.info(`   Clicks: ${sample.clicks}`);
        logger.info(`   CTR: ${sample.ctr.toFixed(2)}%`);
        logger.info(`   Cost: $${sample.cost.toFixed(2)}`);
        logger.info(`   Conversions: ${sample.conversions}`);
      } else {
        logger.info('⚠️ No RSA metrics collected (may be using mock data or no API credentials)');
      }
    } catch (error) {
      logger.warn('RSA metrics collection failed (expected without credentials):', error);
    }
    
    // Test Page Metrics Collection
    logger.info('\n📈 Testing page metrics collection from Google Analytics API...');
    
    try {
      const pageMetrics = await experimentMeasurement.collectPageMetrics(
        experiment.id,
        dateRange
      );
      
      if (pageMetrics.length > 0) {
        logger.info(`✅ Successfully collected ${pageMetrics.length} page metric records from API`);
        
        // Display sample metrics
        const sample = pageMetrics[0];
        logger.info('\nSample Page Metrics:');
        logger.info(`   Date: ${sample.date}`);
        logger.info(`   Page Path: ${sample.pagePath}`);
        logger.info(`   Sessions: ${sample.sessions}`);
        logger.info(`   Bounce Rate: ${sample.bounceRate.toFixed(2)}%`);
        logger.info(`   Page Views: ${sample.pageViews}`);
        logger.info(`   Conversions: ${sample.conversions}`);
      } else {
        logger.info('⚠️ No page metrics collected (may need GA4 property ID or custom dimensions setup)');
      }
    } catch (error) {
      logger.warn('Page metrics collection failed (expected without credentials):', error);
    }
    
    // Test Experiment Summary
    logger.info('\n📋 Testing experiment summary aggregation...');
    
    const summary = await experimentMeasurement.getExperimentSummary(
      experiment.id,
      dateRange
    );
    
    logger.info('Experiment Summary:');
    logger.info(`   Total Impressions: ${summary.totalImpressions}`);
    logger.info(`   Total Clicks: ${summary.totalClicks}`);
    logger.info(`   Total Cost: $${summary.totalCost.toFixed(2)}`);
    logger.info(`   Total Conversions: ${summary.totalConversions}`);
    logger.info(`   Average CTR: ${summary.averageCTR.toFixed(2)}%`);
    logger.info(`   Average CVR: ${summary.averageCVR.toFixed(2)}%`);
    
    // Save metrics to database
    if (summary.rsa.length > 0) {
      logger.info('\n💾 Saving metrics to database...');
      
      for (const metric of summary.rsa) {
        // Map the variant ID to match what's in the database
        let variantId = metric.variantId;
        if (variantId === 'variant_benefit_led') {
          variantId = 'variant_benefit';
        }
        
        await experimentRepository.saveMetrics({
          date: metric.date,
          test_id: experiment.id, // Use the actual experiment ID
          variant_id: variantId,
          impressions: metric.impressions,
          clicks: metric.clicks,
          cost: metric.cost,
          conversions: metric.conversions,
          conversion_value: metric.conversionValue,
          view_through_conversions: 0,
          sessions: 0,
          page_views: 0,
          bounce_rate: 0,
          avg_session_duration: 0,
          goal_completions: 0,
          goal_value: 0,
          cws_clicks: 0,
          cws_impressions: 0,
          data_source: 'google_ads_api',
          data_quality_score: 1.0,
          has_anomaly: false
        });
      }
      
      logger.info('✅ Metrics saved to database');
    }
    
    // Get database stats
    const stats = await experimentRepository.getStats();
    logger.info('\n📊 Final Database Statistics:');
    logger.info(`   Experiments: ${stats.experiments}`);
    logger.info(`   Variants: ${stats.variants}`);
    logger.info(`   Daily metrics: ${stats.dailyMetrics}`);
    logger.info(`   Conversions: ${stats.conversions}`);
    
    logger.info('\n✅ API measurement collection test complete!');
    logger.info('\nNote: To use real Google Ads API, configure these environment variables:');
    logger.info('  - GOOGLE_ADS_CLIENT_ID');
    logger.info('  - GOOGLE_ADS_CLIENT_SECRET');
    logger.info('  - GOOGLE_ADS_REFRESH_TOKEN');
    logger.info('  - GOOGLE_ADS_DEVELOPER_TOKEN');
    logger.info('  - GOOGLE_ADS_CUSTOMER_IDS');
    logger.info('  - GOOGLE_ANALYTICS_PROPERTY_ID (for GA4)');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    console.error(error);
  }
}

testApiMeasurementCollection();