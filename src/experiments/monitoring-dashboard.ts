/**
 * v1.5 Real-Time Monitoring Dashboard for A/B Testing Experiments
 * Provides live monitoring, alerts, and visualization data for experiments
 */

import { DatabaseManager } from '../database/database-manager.js';
import { GoogleAdsRealtimeClient } from '../connectors/google-ads-realtime.js';
import { GA4RealtimeClient } from '../connectors/ga4-realtime.js';
import { StatisticalEngine } from './statistical-engine.js';
import EventEmitter from 'events';
import pino from 'pino';
import { z } from 'zod';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Dashboard schemas
export const DashboardMetricsSchema = z.object({
  experimentId: z.string(),
  variantId: z.string(),
  timestamp: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  cost: z.number(),
  revenue: z.number(),
  ctr: z.number(),
  conversionRate: z.number(),
  cpc: z.number(),
  roas: z.number()
});

export const ExperimentStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'aborted']),
  progress: z.number(), // 0-100%
  daysRunning: z.number(),
  daysRemaining: z.number().optional(),
  currentSampleSize: z.number(),
  requiredSampleSize: z.number(),
  confidence: z.number(),
  winner: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high'])
});

export const AlertSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  type: z.string(),
  message: z.string(),
  timestamp: z.string(),
  acknowledged: z.boolean()
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;
export type Alert = z.infer<typeof AlertSchema>;

// Dashboard configuration
interface DashboardConfig {
  refreshInterval: number; // milliseconds
  alertThresholds: {
    minSampleSize: number;
    maxPValue: number;
    minConfidence: number;
    maxCostIncrease: number;
    minConversionRate: number;
  };
  enableRealTimeAlerts: boolean;
  enableAutoStop: boolean;
}

/**
 * Real-Time Monitoring Dashboard
 * Provides live monitoring and alerting for A/B testing experiments
 */
export class MonitoringDashboard extends EventEmitter {
  private db: DatabaseManager;
  private googleAdsClient: GoogleAdsRealtimeClient;
  private ga4Client: GA4RealtimeClient;
  private statisticalEngine: StatisticalEngine;
  private config: DashboardConfig;
  private refreshTimer?: NodeJS.Timeout;
  private activeExperiments: Map<string, ExperimentStatus> = new Map();
  private alerts: Map<string, Alert[]> = new Map();
  private metricsCache: Map<string, DashboardMetrics[]> = new Map();

  constructor(db: DatabaseManager, config?: Partial<DashboardConfig>) {
    super();
    this.db = db;
    this.googleAdsClient = new GoogleAdsRealtimeClient();
    this.ga4Client = new GA4RealtimeClient();
    this.statisticalEngine = new StatisticalEngine();
    this.config = {
      refreshInterval: 60000, // 1 minute default
      alertThresholds: {
        minSampleSize: 100,
        maxPValue: 0.05,
        minConfidence: 0.95,
        maxCostIncrease: 0.2, // 20%
        minConversionRate: 0.001
      },
      enableRealTimeAlerts: true,
      enableAutoStop: false,
      ...config
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Load active experiments
    await this.loadActiveExperiments();
    
    // Start monitoring
    if (this.config.refreshInterval > 0) {
      this.startMonitoring();
    }

    logger.info('Monitoring dashboard initialized');
  }

  /**
   * Start real-time monitoring
   */
  private startMonitoring(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshAllExperiments();
      } catch (error) {
        logger.error('Dashboard refresh failed:', error);
      }
    }, this.config.refreshInterval);
    this.refreshTimer?.unref?.();  // Prevent blocking test exit

    logger.info(`Dashboard monitoring started with ${this.config.refreshInterval}ms interval`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      logger.info('Dashboard monitoring stopped');
    }
  }

  /**
   * Load active experiments from database
   */
  private async loadActiveExperiments(): Promise<void> {
    const query = `
      SELECT 
        e.id, e.name, e.status, e.type,
        e.control_variant_id, e.test_variant_ids,
        e.metrics_config, e.statistical_config,
        e.start_date, e.end_date
      FROM experiments e
      WHERE e.status IN ('active', 'paused')
      ORDER BY e.created_at DESC
    `;

    const experiments = this.db.getDb().prepare(query).all() as any[];
    
    for (const exp of experiments) {
      const status = await this.calculateExperimentStatus(exp);
      this.activeExperiments.set(exp.id, status);
    }

    logger.info(`Loaded ${experiments.length} active experiments`);
  }

  /**
   * Calculate experiment status and progress
   */
  private async calculateExperimentStatus(experiment: any): Promise<ExperimentStatus> {
    const now = new Date();
    const startDate = new Date(experiment.start_date);
    const endDate = experiment.end_date ? new Date(experiment.end_date) : null;
    
    const daysRunning = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = endDate 
      ? Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : undefined;

    // Get current metrics
    const metrics = await this.fetchExperimentMetrics(experiment.id);
    const currentSampleSize = metrics.reduce((sum, m) => sum + m.impressions, 0);
    
    // Calculate required sample size
    const config = JSON.parse(experiment.statistical_config || '{}');
    const requiredSampleSize = this.statisticalEngine.calculateSampleSize({
      baselineRate: config.baselineRate || 0.05,
      mde: config.mde || 0.1,
      power: config.power || 0.8,
      confidence: config.confidence || 0.95
    });

    // Calculate progress
    const progress = Math.min(100, Math.round((currentSampleSize / requiredSampleSize) * 100));

    // Perform statistical analysis if enough data
    let confidence = 0;
    let winner: string | undefined;
    if (currentSampleSize >= this.config.alertThresholds.minSampleSize) {
      const analysis = await this.analyzeExperimentPerformance(experiment.id);
      confidence = analysis.confidence || 0;
      winner = analysis.winner;
    }

    // Assess risk level
    const riskLevel = this.assessRiskLevel(experiment, metrics);

    return {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      progress,
      daysRunning,
      daysRemaining,
      currentSampleSize,
      requiredSampleSize,
      confidence,
      winner,
      riskLevel
    };
  }

  /**
   * Fetch experiment metrics from data sources
   */
  private async fetchExperimentMetrics(experimentId: string): Promise<DashboardMetrics[]> {
    // Check cache first
    const cached = this.metricsCache.get(experimentId);
    if (cached && cached.length > 0) {
      const latestTimestamp = new Date(cached[0].timestamp);
      if (Date.now() - latestTimestamp.getTime() < 60000) { // 1 minute cache
        return cached;
      }
    }

    // Get variant IDs
    const variants = this.db.getDb().prepare(`
      SELECT id, type FROM experiment_variants
      WHERE experiment_id = ?
    `).all(experimentId) as Array<{ id: string; type: string }>;

    const metrics: DashboardMetrics[] = [];

    for (const variant of variants) {
      // Fetch from Google Ads
      const googleAdsData = await this.fetchGoogleAdsMetrics(variant.id);
      
      // Fetch from GA4
      const ga4Data = await this.fetchGA4Metrics(variant.id);
      
      // Combine metrics
      const combined: DashboardMetrics = {
        experimentId,
        variantId: variant.id,
        timestamp: new Date().toISOString(),
        impressions: googleAdsData.impressions || 0,
        clicks: googleAdsData.clicks || 0,
        conversions: ga4Data.conversions || googleAdsData.conversions || 0,
        cost: googleAdsData.cost || 0,
        revenue: ga4Data.revenue || 0,
        ctr: googleAdsData.clicks > 0 ? googleAdsData.clicks / googleAdsData.impressions : 0,
        conversionRate: googleAdsData.clicks > 0 
          ? (ga4Data.conversions || googleAdsData.conversions || 0) / googleAdsData.clicks 
          : 0,
        cpc: googleAdsData.clicks > 0 ? googleAdsData.cost / googleAdsData.clicks : 0,
        roas: googleAdsData.cost > 0 ? ga4Data.revenue / googleAdsData.cost : 0
      };

      metrics.push(combined);

      // Store in database
      await this.storeMetrics(combined);
    }

    // Update cache
    this.metricsCache.set(experimentId, metrics);

    return metrics;
  }

  /**
   * Fetch Google Ads metrics for a variant
   */
  private async fetchGoogleAdsMetrics(variantId: string): Promise<Partial<DashboardMetrics>> {
    try {
      // This would connect to real Google Ads API
      // For now, return mock data
      return {
        impressions: 1000 + Math.random() * 500,
        clicks: 50 + Math.random() * 25,
        conversions: 5 + Math.random() * 3,
        cost: 50 + Math.random() * 25
      };
    } catch (error) {
      logger.error(`Failed to fetch Google Ads metrics for ${variantId}:`, error);
      return {};
    }
  }

  /**
   * Fetch GA4 metrics for a variant
   */
  private async fetchGA4Metrics(variantId: string): Promise<Partial<DashboardMetrics>> {
    try {
      // This would connect to real GA4 API
      // For now, return mock data
      return {
        conversions: 5 + Math.random() * 3,
        revenue: 100 + Math.random() * 50
      };
    } catch (error) {
      logger.error(`Failed to fetch GA4 metrics for ${variantId}:`, error);
      return {};
    }
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(metrics: DashboardMetrics): Promise<void> {
    const stmt = this.db.getDb().prepare(`
      INSERT INTO experiment_metrics 
      (experiment_id, variant_id, date, impressions, clicks, conversions, cost, revenue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metrics.experimentId,
      metrics.variantId,
      new Date().toISOString().split('T')[0],
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost,
      metrics.revenue
    );
  }

  /**
   * Analyze experiment performance
   */
  private async analyzeExperimentPerformance(experimentId: string): Promise<{
    confidence: number;
    winner?: string;
    lift?: number;
    pValue?: number;
  }> {
    const metrics = await this.fetchExperimentMetrics(experimentId);
    
    if (metrics.length < 2) {
      return { confidence: 0 };
    }

    const control = metrics.find(m => m.variantId.includes('control'));
    const test = metrics.find(m => !m.variantId.includes('control'));

    if (!control || !test) {
      return { confidence: 0 };
    }

    // Perform statistical analysis
    const result = this.statisticalEngine.performZTest({
      control: {
        successes: control.conversions,
        trials: control.clicks
      },
      variant: {
        successes: test.conversions,
        trials: test.clicks
      }
    });

    const confidence = 1 - result.pValue;
    const lift = control.conversions > 0 
      ? ((test.conversions - control.conversions) / control.conversions) * 100
      : 0;

    return {
      confidence,
      winner: result.significant ? test.variantId : undefined,
      lift,
      pValue: result.pValue
    };
  }

  /**
   * Assess risk level for an experiment
   */
  private assessRiskLevel(experiment: any, metrics: DashboardMetrics[]): 'low' | 'medium' | 'high' {
    let riskScore = 0;

    // Check cost increase
    const controlMetrics = metrics.find(m => m.variantId.includes('control'));
    const testMetrics = metrics.filter(m => !m.variantId.includes('control'));
    
    if (controlMetrics && testMetrics.length > 0) {
      for (const test of testMetrics) {
        const costIncrease = (test.cost - controlMetrics.cost) / controlMetrics.cost;
        if (costIncrease > this.config.alertThresholds.maxCostIncrease) {
          riskScore += 2;
        }
      }
    }

    // Check conversion rate
    const avgConversionRate = metrics.reduce((sum, m) => sum + m.conversionRate, 0) / metrics.length;
    if (avgConversionRate < this.config.alertThresholds.minConversionRate) {
      riskScore += 1;
    }

    // Check sample size
    const totalSampleSize = metrics.reduce((sum, m) => sum + m.impressions, 0);
    if (totalSampleSize < this.config.alertThresholds.minSampleSize) {
      riskScore += 1;
    }

    if (riskScore >= 3) return 'high';
    if (riskScore >= 1) return 'medium';
    return 'low';
  }

  /**
   * Refresh all active experiments
   */
  async refreshAllExperiments(): Promise<void> {
    logger.info('Refreshing all experiments...');
    
    for (const [experimentId, status] of this.activeExperiments.entries()) {
      try {
        // Update metrics
        const metrics = await this.fetchExperimentMetrics(experimentId);
        
        // Update status
        const experiment = this.db.getDb().prepare(`
          SELECT * FROM experiments WHERE id = ?
        `).get(experimentId);
        
        if (experiment) {
          const newStatus = await this.calculateExperimentStatus(experiment);
          this.activeExperiments.set(experimentId, newStatus);
          
          // Check for alerts
          await this.checkAlerts(experimentId, newStatus, metrics);
          
          // Emit update event
          this.emit('experimentUpdate', {
            experimentId,
            status: newStatus,
            metrics
          });
        }
      } catch (error) {
        logger.error(`Failed to refresh experiment ${experimentId}:`, error);
      }
    }
  }

  /**
   * Check for alert conditions
   */
  private async checkAlerts(
    experimentId: string, 
    status: ExperimentStatus,
    metrics: DashboardMetrics[]
  ): Promise<void> {
    const alerts: Alert[] = [];

    // Check sample size
    if (status.currentSampleSize < this.config.alertThresholds.minSampleSize) {
      alerts.push({
        id: `alert_${Date.now()}_sample`,
        experimentId,
        severity: 'warning',
        type: 'sample_size',
        message: `Sample size (${status.currentSampleSize}) below minimum threshold`,
        timestamp: new Date().toISOString(),
        acknowledged: false
      });
    }

    // Check confidence
    if (status.confidence > 0 && status.confidence < this.config.alertThresholds.minConfidence) {
      alerts.push({
        id: `alert_${Date.now()}_confidence`,
        experimentId,
        severity: 'info',
        type: 'confidence',
        message: `Confidence level (${(status.confidence * 100).toFixed(1)}%) below threshold`,
        timestamp: new Date().toISOString(),
        acknowledged: false
      });
    }

    // Check cost increase
    const controlMetrics = metrics.find(m => m.variantId.includes('control'));
    const testMetrics = metrics.filter(m => !m.variantId.includes('control'));
    
    if (controlMetrics && testMetrics.length > 0) {
      for (const test of testMetrics) {
        const costIncrease = (test.cost - controlMetrics.cost) / controlMetrics.cost;
        if (costIncrease > this.config.alertThresholds.maxCostIncrease) {
          alerts.push({
            id: `alert_${Date.now()}_cost`,
            experimentId,
            severity: 'critical',
            type: 'cost_overrun',
            message: `Cost increase (${(costIncrease * 100).toFixed(1)}%) exceeds threshold`,
            timestamp: new Date().toISOString(),
            acknowledged: false
          });
        }
      }
    }

    // Check risk level
    if (status.riskLevel === 'high') {
      alerts.push({
        id: `alert_${Date.now()}_risk`,
        experimentId,
        severity: 'critical',
        type: 'high_risk',
        message: 'Experiment has high risk level',
        timestamp: new Date().toISOString(),
        acknowledged: false
      });

      // Auto-stop if enabled
      if (this.config.enableAutoStop) {
        await this.pauseExperiment(experimentId, 'Auto-paused due to high risk');
      }
    }

    // Store and emit alerts
    if (alerts.length > 0) {
      this.alerts.set(experimentId, alerts);
      
      if (this.config.enableRealTimeAlerts) {
        for (const alert of alerts) {
          this.emit('alert', alert);
        }
      }
    }
  }

  /**
   * Pause an experiment
   */
  private async pauseExperiment(experimentId: string, reason: string): Promise<void> {
    const stmt = this.db.getDb().prepare(`
      UPDATE experiments 
      SET status = 'paused', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(experimentId);
    
    logger.warn(`Experiment ${experimentId} paused: ${reason}`);
    
    this.emit('experimentPaused', {
      experimentId,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get dashboard data for display
   */
  async getDashboardData(experimentId?: string): Promise<{
    experiments: ExperimentStatus[];
    metrics: Map<string, DashboardMetrics[]>;
    alerts: Alert[];
    summary: {
      totalExperiments: number;
      activeExperiments: number;
      completedToday: number;
      averageConfidence: number;
      totalAlerts: number;
    };
  }> {
    const experiments = experimentId 
      ? [this.activeExperiments.get(experimentId)].filter(Boolean) as ExperimentStatus[]
      : Array.from(this.activeExperiments.values());

    const allAlerts: Alert[] = [];
    for (const alerts of this.alerts.values()) {
      allAlerts.push(...alerts);
    }

    const filteredAlerts = experimentId
      ? allAlerts.filter(a => a.experimentId === experimentId)
      : allAlerts;

    // Calculate summary
    const summary = {
      totalExperiments: experiments.length,
      activeExperiments: experiments.filter(e => e.status === 'active').length,
      completedToday: 0, // Would query database for today's completions
      averageConfidence: experiments.reduce((sum, e) => sum + e.confidence, 0) / experiments.length || 0,
      totalAlerts: filteredAlerts.filter(a => !a.acknowledged).length
    };

    return {
      experiments,
      metrics: this.metricsCache,
      alerts: filteredAlerts,
      summary
    };
  }

  /**
   * Get chart data for visualization
   */
  async getChartData(experimentId: string, variantId?: string): Promise<{
    timeline: Array<{
      date: string;
      impressions: number;
      clicks: number;
      conversions: number;
      ctr: number;
      conversionRate: number;
    }>;
    comparison: Array<{
      variant: string;
      metric: string;
      value: number;
    }>;
    confidence: Array<{
      date: string;
      confidence: number;
      pValue: number;
    }>;
  }> {
    const query = variantId
      ? `SELECT * FROM experiment_metrics WHERE experiment_id = ? AND variant_id = ? ORDER BY date`
      : `SELECT * FROM experiment_metrics WHERE experiment_id = ? ORDER BY date`;

    const params = variantId ? [experimentId, variantId] : [experimentId];
    const rows = this.db.getDb().prepare(query).all(...params) as any[];

    // Process timeline data
    const timeline = rows.map(row => ({
      date: row.date,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      ctr: row.clicks / row.impressions,
      conversionRate: row.conversions / row.clicks
    }));

    // Process comparison data
    const variantMetrics = new Map<string, any>();
    for (const row of rows) {
      if (!variantMetrics.has(row.variant_id)) {
        variantMetrics.set(row.variant_id, {
          impressions: 0,
          clicks: 0,
          conversions: 0,
          cost: 0
        });
      }
      const metrics = variantMetrics.get(row.variant_id);
      metrics.impressions += row.impressions;
      metrics.clicks += row.clicks;
      metrics.conversions += row.conversions;
      metrics.cost += row.cost;
    }

    const comparison: any[] = [];
    for (const [variant, metrics] of variantMetrics.entries()) {
      comparison.push(
        { variant, metric: 'CTR', value: metrics.clicks / metrics.impressions },
        { variant, metric: 'Conversion Rate', value: metrics.conversions / metrics.clicks },
        { variant, metric: 'CPC', value: metrics.cost / metrics.clicks }
      );
    }

    // Process confidence timeline
    const confidence: any[] = [];
    // This would calculate confidence over time
    // For now, return mock data
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      confidence.push({
        date: date.toISOString().split('T')[0],
        confidence: 0.5 + (i * 0.07),
        pValue: 0.5 - (i * 0.07)
      });
    }

    return {
      timeline,
      comparison,
      confidence
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    for (const alerts of this.alerts.values()) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        logger.info(`Alert ${alertId} acknowledged`);
        return;
      }
    }
  }

  /**
   * Export dashboard data
   */
  async exportDashboard(format: 'json' | 'csv'): Promise<string> {
    const data = await this.getDashboardData();
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Convert to CSV format
      const csv: string[] = ['Experiment,Status,Progress,Confidence,Winner,Risk Level'];
      
      for (const exp of data.experiments) {
        csv.push([
          exp.name,
          exp.status,
          `${exp.progress}%`,
          `${(exp.confidence * 100).toFixed(1)}%`,
          exp.winner || 'None',
          exp.riskLevel
        ].join(','));
      }
      
      return csv.join('\n');
    }
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    await this.googleAdsClient.disconnect();
    await this.ga4Client.disconnect();
    this.removeAllListeners();
    logger.info('Monitoring dashboard shut down');
  }
}

// Export singleton instance
let dashboardInstance: MonitoringDashboard | null = null;

export function getMonitoringDashboard(db: DatabaseManager): MonitoringDashboard {
  if (!dashboardInstance) {
    dashboardInstance = new MonitoringDashboard(db);
  }
  return dashboardInstance;
}