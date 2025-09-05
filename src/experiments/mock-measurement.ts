/**
 * Mock Measurement Data Collector
 * Simulates measurement collection for testing without API credentials
 */

import { logger } from '../utils/logger.js';
import { experimentRepository } from '../database/experiment-repository.js';
import type { MetricRow } from '../database/experiment-repository.js';

export class MockMeasurementCollector {
  /**
   * Generate mock metrics for an experiment
   */
  async collectMockMetrics(experimentId: string): Promise<void> {
    logger.info(`🔬 Generating mock metrics for experiment ${experimentId}`);
    
    // Load experiment to get variants
    const experiment = await experimentRepository.loadExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    // Generate 7 days of mock data
    const today = new Date();
    const metrics: Omit<MetricRow, 'created_at'>[] = [];
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];
      
      for (const variant of experiment.variants) {
        const isControl = variant.isControl;
        
        // Generate realistic-looking metrics with some variance
        const baseImpressions = 1000 + Math.floor(Math.random() * 500);
        const baseCTR = isControl ? 0.02 : 0.025; // 20% lift for variant
        const baseCVR = isControl ? 0.01 : 0.012; // 20% lift for variant
        
        const impressions = baseImpressions + Math.floor(Math.random() * 100);
        const clicks = Math.floor(impressions * (baseCTR + (Math.random() - 0.5) * 0.005));
        const conversions = Math.floor(clicks * (baseCVR + (Math.random() - 0.5) * 0.002));
        const cost = clicks * (1.5 + Math.random() * 0.5); // $1.50-$2.00 CPC
        
        metrics.push({
          date: dateStr,
          test_id: experimentId,
          variant_id: variant.id,
          impressions,
          clicks,
          cost,
          conversions,
          conversion_value: conversions * 50, // $50 per conversion
          view_through_conversions: Math.floor(conversions * 0.2),
          sessions: Math.floor(clicks * 0.9), // 90% of clicks become sessions
          page_views: Math.floor(clicks * 2.5), // 2.5 pages per session
          bounce_rate: 0.35 + Math.random() * 0.1,
          avg_session_duration: 120 + Math.random() * 60,
          goal_completions: conversions,
          goal_value: conversions * 50,
          cws_clicks: 0,
          cws_impressions: 0,
          data_source: 'mock',
          data_quality_score: 1.0,
          has_anomaly: false
        });
      }
    }
    
    // Save metrics to database
    for (const metric of metrics) {
      await experimentRepository.saveMetrics(metric);
    }
    
    logger.info(`✅ Generated ${metrics.length} mock metric records`);
  }
  
  /**
   * Generate mock conversion events
   */
  async generateMockConversions(experimentId: string): Promise<void> {
    logger.info(`💰 Generating mock conversions for experiment ${experimentId}`);
    
    // Load experiment to get variants
    const experiment = await experimentRepository.loadExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    // Generate conversion events
    const now = new Date();
    let conversionCount = 0;
    
    for (const variant of experiment.variants) {
      const numConversions = Math.floor(Math.random() * 10) + 5; // 5-15 conversions per variant
      
      for (let i = 0; i < numConversions; i++) {
        const conversionTime = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Random time in last 7 days
        
        await experimentRepository.recordConversion({
          conversion_id: `conv_${experimentId}_${variant.id}_${i}`,
          test_id: experimentId,
          variant_id: variant.id,
          assignment_id: null,  // No assignment tracking in mock data
          conversion_type: Math.random() > 0.5 ? 'purchase' : 'signup',
          conversion_value: 50 + Math.floor(Math.random() * 100), // $50-$150
          conversion_at: conversionTime.toISOString(),
          exposure_to_conversion_minutes: Math.floor(Math.random() * 1440), // 0-24 hours
          attribution_model: 'last_click',
          event_data: JSON.stringify({ source: 'mock' }),
          revenue: 50 + Math.floor(Math.random() * 100),
          quantity: 1,
          traffic_source: 'google',
          campaign_id: 'camp_123',
          ad_group_id: 'ag_456',
          keyword: 'chrome extension'
        });
        
        conversionCount++;
      }
    }
    
    logger.info(`✅ Generated ${conversionCount} mock conversion events`);
  }
  
  /**
   * Run automated collection for all active experiments
   */
  async runAutomatedCollection(): Promise<void> {
    logger.info('🤖 Running automated measurement collection...');
    
    // Get all active experiments
    const activeExperiments = await experimentRepository.listExperiments({
      status: 'active'
    });
    
    logger.info(`Found ${activeExperiments.length} active experiments`);
    
    for (const experiment of activeExperiments) {
      try {
        await this.collectMockMetrics(experiment.id);
        await this.generateMockConversions(experiment.id);
        logger.info(`✅ Collected metrics for experiment ${experiment.id}`);
      } catch (error) {
        logger.error(`❌ Failed to collect metrics for ${experiment.id}:`, error);
      }
    }
    
    logger.info('✅ Automated collection complete');
  }
  
  /**
   * Get metrics summary for an experiment
   */
  async getMetricsSummary(experimentId: string): Promise<{
    control: { successes: number; trials: number; clicks: number; conversions: number; impressions: number };
    variants: { [key: string]: { successes: number; trials: number; clicks: number; conversions: number; impressions: number } };
  }> {
    const metrics = await experimentRepository.getMetrics(experimentId);
    
    const summary: any = {
      control: { successes: 0, trials: 0, clicks: 0, conversions: 0, impressions: 0 },
      variants: {}
    };
    
    for (const metric of metrics) {
      const target = metric.variant_id === 'control' ? summary.control : 
                    (summary.variants[metric.variant_id] = summary.variants[metric.variant_id] || 
                     { successes: 0, trials: 0, clicks: 0, conversions: 0, impressions: 0 });
      
      target.clicks += metric.clicks;
      target.conversions += metric.conversions;
      target.impressions += metric.impressions;
      // For statistical tests: successes = clicks, trials = impressions (for CTR)
      target.successes += metric.clicks;
      target.trials += metric.impressions;
    }
    
    return summary;
  }
}

// Export singleton instance
export const mockMeasurement = new MockMeasurementCollector();