import pino from 'pino';
import { z } from 'zod';
import { CacheManager } from '../utils/cache.js';
import { PerformanceMonitor } from './performance.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Anomaly detection schemas
export const AnomalySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  product: z.string(),
  type: z.enum(['PERFORMANCE', 'BUDGET', 'TRAFFIC', 'CONVERSION', 'QUALITY', 'SECURITY']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  metric: z.string(),
  current: z.number(),
  expected: z.number(),
  threshold: z.number(),
  deviation: z.number(),
  confidence: z.number(),
  description: z.string(),
  possibleCauses: z.array(z.string()),
  recommendations: z.array(z.string()),
  metadata: z.record(z.any()).optional()
});

export const TimeSeriesDataSchema = z.object({
  timestamp: z.string(),
  value: z.number(),
  metadata: z.record(z.any()).optional()
});

export const DetectionRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  metric: z.string(),
  type: z.enum(['THRESHOLD', 'STATISTICAL', 'TREND', 'SEASONAL']),
  parameters: z.record(z.any()),
  enabled: z.boolean(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string()
});

export type Anomaly = z.infer<typeof AnomalySchema>;
export type TimeSeriesData = z.infer<typeof TimeSeriesDataSchema>;
export type DetectionRule = z.infer<typeof DetectionRuleSchema>;

export class AnomalyDetector {
  private cache: CacheManager;
  private performanceMonitor: PerformanceMonitor;
  private timeSeriesData: Map<string, TimeSeriesData[]> = new Map();
  private detectionRules: Map<string, DetectionRule> = new Map();
  private anomalies: Anomaly[] = [];
  private baselines: Map<string, any> = new Map();

  constructor() {
    this.cache = new CacheManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default detection rules
   */
  private initializeDefaultRules(): void {
    // Performance anomalies
    this.addRule({
      id: 'ctr-drop',
      name: 'CTR Sudden Drop',
      metric: 'ctr',
      type: 'STATISTICAL',
      parameters: {
        standardDeviations: 2.5,
        minimumPoints: 7,
        windowSize: 24
      },
      enabled: true,
      severity: 'HIGH',
      description: 'Detects sudden drops in click-through rate'
    });

    this.addRule({
      id: 'cost-spike',
      name: 'Cost Spike Detection',
      metric: 'cost',
      type: 'THRESHOLD',
      parameters: {
        thresholdMultiplier: 2.0,
        baselinePeriod: 7
      },
      enabled: true,
      severity: 'CRITICAL',
      description: 'Detects sudden cost increases'
    });

    this.addRule({
      id: 'conversion-drop',
      name: 'Conversion Rate Drop',
      metric: 'conversionRate',
      type: 'STATISTICAL',
      parameters: {
        standardDeviations: 2.0,
        minimumPoints: 5,
        windowSize: 12
      },
      enabled: true,
      severity: 'HIGH',
      description: 'Detects significant conversion rate drops'
    });

    this.addRule({
      id: 'conversion-rate-decline',
      name: 'Conversion Rate Trend Decline',
      metric: 'conversionRate',
      type: 'TREND',
      parameters: {
        trendPeriod: 10,
        minimumDecline: 20  // 20% decline threshold
      },
      enabled: true,
      severity: 'HIGH',
      description: 'Detects declining conversion rate trends'
    });

    this.addRule({
      id: 'quality-score-decline',
      name: 'Quality Score Decline',
      metric: 'qualityScore',
      type: 'TREND',
      parameters: {
        trendPeriod: 7,
        minimumDecline: 10
      },
      enabled: true,
      severity: 'MEDIUM',
      description: 'Detects declining quality scores'
    });

    this.addRule({
      id: 'impression-loss',
      name: 'Impression Volume Loss',
      metric: 'impressions',
      type: 'STATISTICAL',
      parameters: {
        standardDeviations: 2.0,
        minimumPoints: 3,
        windowSize: 6
      },
      enabled: true,
      severity: 'HIGH',
      description: 'Detects significant impression volume drops'
    });

    this.addRule({
      id: 'budget-overspend',
      name: 'Budget Overspend Alert',
      metric: 'dailySpend',
      type: 'THRESHOLD',
      parameters: {
        thresholdPercentage: 120, // 20% over budget
        checkPeriod: 1
      },
      enabled: true,
      severity: 'CRITICAL',
      description: 'Detects budget overspending'
    });

    this.addRule({
      id: 'cpc-inflation',
      name: 'CPC Inflation Detection',
      metric: 'avgCpc',
      type: 'TREND',
      parameters: {
        trendPeriod: 7,
        inflationThreshold: 25 // 25% increase
      },
      enabled: true,
      severity: 'MEDIUM',
      description: 'Detects rapid CPC increases'
    });

    this.addRule({
      id: 'traffic-pattern-anomaly',
      name: 'Unusual Traffic Pattern',
      metric: 'hourlyTraffic',
      type: 'SEASONAL',
      parameters: {
        seasonalPeriod: 168, // Weekly pattern (24 * 7)
        deviationThreshold: 3.0
      },
      enabled: true,
      severity: 'MEDIUM',
      description: 'Detects unusual traffic patterns'
    });
  }

  /**
   * Add detection rule
   */
  addRule(rule: DetectionRule): void {
    this.detectionRules.set(rule.id, rule);
    logger.debug('Added detection rule', { id: rule.id, metric: rule.metric });
  }

  /**
   * Remove detection rule
   */
  removeRule(ruleId: string): void {
    this.detectionRules.delete(ruleId);
    logger.debug('Removed detection rule', { id: ruleId });
  }

  /**
   * Add time series data point
   */
  addDataPoint(metric: string, value: number, metadata?: any): void {
    const key = `${metric}`;
    const dataPoint: TimeSeriesData = {
      timestamp: new Date().toISOString(),
      value,
      metadata
    };

    if (!this.timeSeriesData.has(key)) {
      this.timeSeriesData.set(key, []);
    }

    const series = this.timeSeriesData.get(key)!;
    series.push(dataPoint);

    // Keep only last 1000 points per metric
    if (series.length > 1000) {
      series.shift();
    }

    // Trigger anomaly detection for this metric (run synchronously for immediate detection)
    this.detectAnomaliesForMetricSync(metric);
  }

  /**
   * Synchronous wrapper for anomaly detection (for immediate detection in tests/sync contexts)
   */
  private detectAnomaliesForMetricSync(metric: string): void {
    const series = this.timeSeriesData.get(metric);
    if (!series || series.length < 3) return;

    // Run all applicable rules synchronously
    for (const rule of this.detectionRules.values()) {
      if (rule.metric === metric && rule.enabled) {
        const anomaly = this.applyDetectionRuleSync(rule, series);
        if (anomaly) {
          this.addAnomaly(anomaly);
        }
      }
    }
  }

  /**
   * Synchronous version of rule application
   */
  private applyDetectionRuleSync(
    rule: DetectionRule,
    series: TimeSeriesData[]
  ): Anomaly | null {
    const current = series[series.length - 1];

    try {
      switch (rule.type) {
        case 'THRESHOLD':
          return this.applyThresholdRule(rule, series, current);
        case 'STATISTICAL':
          return this.applyStatisticalRule(rule, series, current);
        case 'TREND':
          return this.applyTrendRule(rule, series, current);
        case 'SEASONAL':
          return this.applySeasonalRule(rule, series, current);
        default:
          logger.warn('Unknown rule type', { type: rule.type });
          return null;
      }
    } catch (error: any) {
      logger.error(`Error applying rule ${rule.id}:`, error);
      return null;
    }
  }

  /**
   * Detect anomalies for a specific metric
   */
  private async detectAnomaliesForMetric(metric: string): Promise<void> {
    const series = this.timeSeriesData.get(metric);
    if (!series || series.length < 3) return;

    // Run all applicable rules
    for (const rule of this.detectionRules.values()) {
      if (rule.metric === metric && rule.enabled) {
        const anomaly = await this.applyDetectionRule(rule, series);
        if (anomaly) {
          this.addAnomaly(anomaly);
        }
      }
    }
  }

  /**
   * Apply a detection rule to time series data
   */
  private async applyDetectionRule(
    rule: DetectionRule,
    series: TimeSeriesData[]
  ): Promise<Anomaly | null> {
    const current = series[series.length - 1];
    
    try {
      switch (rule.type) {
        case 'THRESHOLD':
          return this.applyThresholdRule(rule, series, current);
        case 'STATISTICAL':
          return this.applyStatisticalRule(rule, series, current);
        case 'TREND':
          return this.applyTrendRule(rule, series, current);
        case 'SEASONAL':
          return this.applySeasonalRule(rule, series, current);
        default:
          logger.warn('Unknown rule type', { type: rule.type });
          return null;
      }
    } catch (error: any) {
      logger.error(`Error applying rule ${rule.id}:`, error);
      return null;
    }
  }

  /**
   * Apply threshold-based detection
   */
  private applyThresholdRule(
    rule: DetectionRule,
    series: TimeSeriesData[],
    current: TimeSeriesData
  ): Anomaly | null {
    const { thresholdMultiplier, thresholdPercentage, baselinePeriod } = rule.parameters;
    
    // Calculate baseline
    const baselineStart = Math.max(0, series.length - (baselinePeriod || 7) - 1);
    const baseline = series.slice(baselineStart, -1);
    
    if (baseline.length === 0) return null;
    
    const baselineAvg = baseline.reduce((sum, p) => sum + p.value, 0) / baseline.length;
    
    let threshold: number;
    let isAnomaly = false;
    
    if (thresholdMultiplier) {
      threshold = baselineAvg * thresholdMultiplier;
      isAnomaly = current.value > threshold;
    } else if (thresholdPercentage) {
      threshold = baselineAvg * (thresholdPercentage / 100);
      isAnomaly = current.value > threshold;
    } else {
      return null;
    }
    
    if (!isAnomaly) return null;
    
    return {
      id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: current.timestamp,
      product: current.metadata?.product || 'unknown',
      type: this.getAnomalyType(rule.metric),
      severity: rule.severity,
      metric: rule.metric,
      current: current.value,
      expected: baselineAvg,
      threshold,
      deviation: ((current.value - baselineAvg) / baselineAvg) * 100,
      confidence: 0.8,
      description: `${rule.metric} value ${current.value} exceeds threshold ${threshold.toFixed(2)} (baseline: ${baselineAvg.toFixed(2)})`,
      possibleCauses: this.getPossibleCauses(rule.metric, 'THRESHOLD'),
      recommendations: this.getRecommendations(rule.metric, 'THRESHOLD')
    };
  }

  /**
   * Apply statistical anomaly detection (Z-score)
   */
  private applyStatisticalRule(
    rule: DetectionRule,
    series: TimeSeriesData[],
    current: TimeSeriesData
  ): Anomaly | null {
    const { standardDeviations, minimumPoints, windowSize } = rule.parameters;
    
    const windowStart = Math.max(0, series.length - (windowSize || 24) - 1);
    const window = series.slice(windowStart, -1);
    
    if (window.length < (minimumPoints || 5)) return null;
    
    // Calculate mean and standard deviation
    const values = window.map(p => p.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return null;
    
    // Calculate Z-score
    const zScore = Math.abs(current.value - mean) / stdDev;
    const threshold = standardDeviations || 2.5;
    
    if (zScore < threshold) return null;
    
    return {
      id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: current.timestamp,
      product: current.metadata?.product || 'unknown',
      type: this.getAnomalyType(rule.metric),
      severity: rule.severity,
      metric: rule.metric,
      current: current.value,
      expected: mean,
      threshold: mean + (threshold * stdDev),
      deviation: zScore,
      confidence: Math.min(0.95, 0.5 + (zScore / 10)),
      description: `${rule.metric} value ${current.value} is ${zScore.toFixed(2)} standard deviations from mean ${mean.toFixed(2)}`,
      possibleCauses: this.getPossibleCauses(rule.metric, 'STATISTICAL'),
      recommendations: this.getRecommendations(rule.metric, 'STATISTICAL'),
      metadata: { zScore, mean, stdDev }
    };
  }

  /**
   * Apply trend-based detection
   */
  private applyTrendRule(
    rule: DetectionRule,
    series: TimeSeriesData[],
    current: TimeSeriesData
  ): Anomaly | null {
    const { trendPeriod, minimumDecline, inflationThreshold } = rule.parameters;
    
    const period = trendPeriod || 7;
    if (series.length < period) return null;
    
    const recentValues = series.slice(-period).map(p => p.value);
    const slope = this.calculateTrendSlope(recentValues);
    
    // Calculate percentage change over trend period
    const firstValue = recentValues[0];
    const lastValue = recentValues[recentValues.length - 1];
    const percentageChange = ((lastValue - firstValue) / firstValue) * 100;
    
    let isAnomaly = false;
    let description = '';
    
    if (minimumDecline && percentageChange < -minimumDecline) {
      isAnomaly = true;
      description = `${rule.metric} declined ${Math.abs(percentageChange).toFixed(1)}% over ${period} periods`;
    } else if (inflationThreshold && percentageChange > inflationThreshold) {
      isAnomaly = true;
      description = `${rule.metric} increased ${percentageChange.toFixed(1)}% over ${period} periods`;
    }
    
    if (!isAnomaly) return null;
    
    return {
      id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: current.timestamp,
      product: current.metadata?.product || 'unknown',
      type: this.getAnomalyType(rule.metric),
      severity: rule.severity,
      metric: rule.metric,
      current: lastValue,
      expected: firstValue,
      threshold: firstValue * (1 + (inflationThreshold || minimumDecline || 0) / 100),
      deviation: percentageChange,
      confidence: 0.7,
      description,
      possibleCauses: this.getPossibleCauses(rule.metric, 'TREND'),
      recommendations: this.getRecommendations(rule.metric, 'TREND'),
      metadata: { slope, trendPeriod: period }
    };
  }

  /**
   * Apply seasonal pattern detection
   */
  private applySeasonalRule(
    rule: DetectionRule,
    series: TimeSeriesData[],
    current: TimeSeriesData
  ): Anomaly | null {
    const { seasonalPeriod, deviationThreshold } = rule.parameters;
    
    const period = seasonalPeriod || 24;
    if (series.length < period * 2) return null;
    
    // Find similar time points in previous cycles
    const currentHour = new Date(current.timestamp).getHours();
    const similarPoints = series.filter((_, index) => {
      const pointHour = new Date(series[index].timestamp).getHours();
      return pointHour === currentHour && index < series.length - 1;
    });
    
    if (similarPoints.length < 3) return null;
    
    const expectedValue = similarPoints.reduce((sum, p) => sum + p.value, 0) / similarPoints.length;
    const deviation = Math.abs(current.value - expectedValue) / expectedValue;
    
    if (deviation < (deviationThreshold || 2.0)) return null;
    
    return {
      id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: current.timestamp,
      product: current.metadata?.product || 'unknown',
      type: this.getAnomalyType(rule.metric),
      severity: rule.severity,
      metric: rule.metric,
      current: current.value,
      expected: expectedValue,
      threshold: expectedValue * (1 + (deviationThreshold || 2.0)),
      deviation: deviation * 100,
      confidence: 0.6,
      description: `${rule.metric} value ${current.value} deviates ${(deviation * 100).toFixed(1)}% from seasonal pattern (expected: ${expectedValue.toFixed(2)})`,
      possibleCauses: this.getPossibleCauses(rule.metric, 'SEASONAL'),
      recommendations: this.getRecommendations(rule.metric, 'SEASONAL'),
      metadata: { seasonalPeriod: period, similarPoints: similarPoints.length }
    };
  }

  /**
   * Calculate trend slope using linear regression
   */
  private calculateTrendSlope(values: number[]): number {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  /**
   * Add anomaly to list
   */
  private addAnomaly(anomaly: Anomaly): void {
    this.anomalies.push(anomaly);
    
    // Keep only last 1000 anomalies
    if (this.anomalies.length > 1000) {
      this.anomalies.shift();
    }
    
    // Cache recent anomaly
    this.cache.set(`anomaly-${anomaly.id}`, anomaly, 86400);
    
    logger.info('Anomaly detected', {
      id: anomaly.id,
      type: anomaly.type,
      metric: anomaly.metric,
      severity: anomaly.severity,
      deviation: anomaly.deviation
    });
  }

  /**
   * Get anomaly type based on metric
   */
  private getAnomalyType(metric: string): Anomaly['type'] {
    if (['cost', 'spend', 'budget'].some(m => metric.includes(m))) {
      return 'BUDGET';
    }
    if (['conversion', 'cpa', 'roas'].some(m => metric.includes(m))) {
      return 'CONVERSION';
    }
    if (['impressions', 'clicks', 'traffic'].some(m => metric.includes(m))) {
      return 'TRAFFIC';
    }
    if (['quality', 'score'].some(m => metric.includes(m))) {
      return 'QUALITY';
    }
    return 'PERFORMANCE';
  }

  /**
   * Get possible causes for anomaly
   */
  private getPossibleCauses(metric: string, ruleType: string): string[] {
    const causes: string[] = [];
    
    switch (metric) {
      case 'ctr':
        causes.push('Ad copy fatigue', 'Increased competition', 'Audience saturation', 'Seasonal changes');
        break;
      case 'cost':
        causes.push('Bid increases', 'Budget changes', 'Increased competition', 'Campaign expansion');
        break;
      case 'conversionRate':
        causes.push('Landing page issues', 'Checkout problems', 'Pricing changes', 'User experience degradation');
        break;
      case 'qualityScore':
        causes.push('Keyword relevance decline', 'Landing page quality issues', 'Click-through rate drop');
        break;
      case 'impressions':
        causes.push('Budget constraints', 'Bid too low', 'Quality score decline', 'Audience shrinkage');
        break;
      default:
        causes.push('System changes', 'External factors', 'Configuration updates');
    }
    
    return causes;
  }

  /**
   * Get recommendations for anomaly
   */
  private getRecommendations(metric: string, ruleType: string): string[] {
    const recommendations: string[] = [];
    
    switch (metric) {
      case 'ctr':
        recommendations.push('Test new ad copy variations', 'Review keyword relevance', 'Analyze competitor activity');
        break;
      case 'cost':
        recommendations.push('Review bid strategies', 'Check budget allocation', 'Analyze cost per conversion');
        break;
      case 'conversionRate':
        recommendations.push('Test landing page variations', 'Check conversion tracking', 'Review user experience');
        break;
      case 'qualityScore':
        recommendations.push('Improve keyword-ad relevance', 'Optimize landing pages', 'Enhance CTR');
        break;
      case 'impressions':
        recommendations.push('Increase bids', 'Expand targeting', 'Review budget allocation');
        break;
      default:
        recommendations.push('Monitor closely', 'Investigate root cause', 'Consider reverting recent changes');
    }
    
    recommendations.push('Set up monitoring alerts', 'Document investigation findings');
    
    return recommendations;
  }

  /**
   * Get recent anomalies
   */
  getRecentAnomalies(hours = 24): Anomaly[] {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return this.anomalies.filter(a => 
      new Date(a.timestamp) > cutoff
    );
  }

  /**
   * Get anomalies by severity
   */
  getAnomaliesBySeverity(severity: Anomaly['severity']): Anomaly[] {
    return this.anomalies.filter(a => a.severity === severity);
  }

  /**
   * Get anomalies by product
   */
  getAnomaliesByProduct(product: string): Anomaly[] {
    return this.anomalies.filter(a => a.product === product);
  }

  /**
   * Get detection statistics
   */
  getStatistics(): {
    totalAnomalies: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    byProduct: Record<string, number>;
    recentTrends: Array<{ date: string; count: number }>;
    falsePositiveRate: number;
  } {
    const stats = {
      totalAnomalies: this.anomalies.length,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byProduct: {} as Record<string, number>,
      recentTrends: [] as Array<{ date: string; count: number }>,
      falsePositiveRate: 15.2 // Placeholder - would be calculated from feedback
    };

    // Group by severity, type, and product
    for (const anomaly of this.anomalies) {
      stats.bySeverity[anomaly.severity] = (stats.bySeverity[anomaly.severity] || 0) + 1;
      stats.byType[anomaly.type] = (stats.byType[anomaly.type] || 0) + 1;
      stats.byProduct[anomaly.product] = (stats.byProduct[anomaly.product] || 0) + 1;
    }

    // Calculate recent trends (last 7 days)
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      const count = this.anomalies.filter(a => {
        const anomalyDate = new Date(a.timestamp);
        return anomalyDate >= dayStart && anomalyDate < dayEnd;
      }).length;
      
      stats.recentTrends.push({ date: dateStr, count });
    }

    return stats;
  }

  /**
   * Mark anomaly as false positive
   */
  async markFalsePositive(anomalyId: string, reason: string): Promise<void> {
    const anomaly = this.anomalies.find(a => a.id === anomalyId);
    if (anomaly) {
      anomaly.metadata = {
        ...anomaly.metadata,
        falsePositive: true,
        falsePositiveReason: reason,
        markedAt: new Date().toISOString()
      };
      
      await this.cache.set(`false-positive-${anomalyId}`, {
        reason,
        timestamp: new Date().toISOString()
      }, 86400);
    }
  }

  /**
   * Update detection rule parameters
   */
  updateRule(ruleId: string, parameters: Partial<DetectionRule>): void {
    const rule = this.detectionRules.get(ruleId);
    if (rule) {
      Object.assign(rule, parameters);
      logger.info('Updated detection rule', { ruleId, parameters });
    }
  }

  /**
   * Export anomaly data
   */
  exportAnomalies(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'ID', 'Timestamp', 'Product', 'Type', 'Severity', 'Metric',
        'Current', 'Expected', 'Deviation', 'Description'
      ];
      
      const rows = this.anomalies.map(a => [
        a.id, a.timestamp, a.product, a.type, a.severity, a.metric,
        a.current.toString(), a.expected.toString(), a.deviation.toString(), 
        `"${a.description}"`
      ]);
      
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
    
    return JSON.stringify(this.anomalies, null, 2);
  }

  /**
   * Clear old anomalies
   */
  clearOldAnomalies(days = 30): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const initialCount = this.anomalies.length;
    this.anomalies = this.anomalies.filter(a => 
      new Date(a.timestamp) > cutoff
    );
    
    const cleared = initialCount - this.anomalies.length;
    logger.info(`Cleared ${cleared} old anomalies`);
    
    return cleared;
  }
}