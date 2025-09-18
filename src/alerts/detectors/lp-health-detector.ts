/**
 * Landing Page Health Detector
 * Monitors landing page performance and availability
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import type { Entity, TimeWindow, DetectorResult, AlertConfig, Alert } from '../types.js';

export interface LandingPageHealthMetrics {
  responseTime: number;
  statusCode: number;
  contentLength: number;
  errorRate: number;
  bounceRate?: number;
  avgTimeOnPage?: number;
}

export class LPHealthDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'lp_health',
      enabled: true,
      thresholds: {
        responseTime: { critical: 5000, high: 3000, medium: 2000 }, // milliseconds
        errorRate: { critical: 0.10, high: 0.05, medium: 0.02 }, // percentage
        bounceRate: { critical: 0.80, high: 0.70, medium: 0.60 }, // percentage
        statusCode: { critical: [500, 503], high: [404], medium: [301, 302] }
      },
      noise_control: {
        min_impressions: 100,
        min_sample_size: 50,
        confidence_level: 0.95
      }
    };
    super(db, config);
  }

  async detect(entity: Entity, window: TimeWindow): Promise<DetectorResult> {
    try {
      if (!entity.url && entity.type !== 'url') {
        return this.noAlert('Entity has no URL to monitor');
      }

      const url = entity.url || entity.id;

      // Get current health metrics
      const currentMetrics = await this.getCurrentHealthMetrics(url, window.current_days);

      if (!currentMetrics) {
        return this.noAlert('No health metrics available');
      }

      // Get baseline metrics for comparison
      const baselineMetrics = await this.getBaselineHealthMetrics(url, window.baseline_days);

      // Check for critical issues
      const criticalIssues = this.checkCriticalIssues(currentMetrics);
      if (criticalIssues.length > 0) {
        return this.createAlert(entity, 'critical', criticalIssues, currentMetrics, baselineMetrics);
      }

      // Check for performance degradation
      const performanceIssues = this.checkPerformanceDegradation(currentMetrics, baselineMetrics);
      if (performanceIssues.length > 0) {
        const severity = this.determineSeverity(performanceIssues);
        return this.createAlert(entity, severity, performanceIssues, currentMetrics, baselineMetrics);
      }

      return this.noAlert('Landing page health is normal');

    } catch (error) {
      logger.error('LP Health detection failed', error);
      return this.noAlert('Detection failed');
    }
  }

  /**
   * Get current health metrics for a landing page
   */
  private async getCurrentHealthMetrics(
    url: string,
    days: number
  ): Promise<LandingPageHealthMetrics | null> {
    const db = this.db.getDb();

    // Query for health check data (if available)
    const healthQuery = `
      SELECT
        AVG(response_time) as avg_response_time,
        MAX(status_code) as last_status_code,
        AVG(content_length) as avg_content_length,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as error_rate
      FROM url_health_checks
      WHERE url = ?
        AND checked_at >= datetime('now', '-${days} days')
    `;

    const healthResult = db.prepare(healthQuery).get(url) as any;

    // Query for user behavior metrics (if available from GA4)
    const behaviorQuery = `
      SELECT
        AVG(bounce_rate) as avg_bounce_rate,
        AVG(avg_time_on_page) as avg_time_on_page
      FROM landing_page_metrics
      WHERE url = ?
        AND date >= date('now', '-${days} days')
    `;

    const behaviorResult = db.prepare(behaviorQuery).get(url) as any;

    if (!healthResult && !behaviorResult) {
      // Fallback to conversion metrics as a proxy for health
      const conversionQuery = `
        SELECT
          AVG(conversion_rate) as avg_conversion_rate,
          COUNT(*) as sample_size
        FROM fact_search_terms
        WHERE landing_page = ?
          AND date >= date('now', '-${days} days')
      `;

      const conversionResult = db.prepare(conversionQuery).get(url) as any;

      if (conversionResult && conversionResult.sample_size > 0) {
        // Use conversion rate drop as a proxy for health issues
        return {
          responseTime: 0,
          statusCode: 200,
          contentLength: 0,
          errorRate: 0,
          bounceRate: conversionResult.avg_conversion_rate < 0.01 ? 0.9 : 0.5,
          avgTimeOnPage: undefined
        };
      }

      return null;
    }

    return {
      responseTime: healthResult?.avg_response_time || 0,
      statusCode: healthResult?.last_status_code || 200,
      contentLength: healthResult?.avg_content_length || 0,
      errorRate: healthResult?.error_rate || 0,
      bounceRate: behaviorResult?.avg_bounce_rate,
      avgTimeOnPage: behaviorResult?.avg_time_on_page
    };
  }

  /**
   * Get baseline health metrics for comparison
   */
  private async getBaselineHealthMetrics(
    url: string,
    days: number
  ): Promise<LandingPageHealthMetrics | null> {
    // Similar to getCurrentHealthMetrics but for baseline period
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days - 14); // Start 14 days before current window
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - days);

    // Reuse the same logic with different date range
    return this.getCurrentHealthMetrics(url, days + 14);
  }

  /**
   * Check for critical issues that require immediate attention
   */
  private checkCriticalIssues(metrics: LandingPageHealthMetrics): string[] {
    const issues: string[] = [];
    const thresholds = this.config.thresholds;

    // Check response time
    if (metrics.responseTime > thresholds.responseTime.critical) {
      issues.push(`Response time critically high: ${metrics.responseTime}ms`);
    }

    // Check error rate
    if (metrics.errorRate > thresholds.errorRate.critical) {
      issues.push(`Error rate critically high: ${(metrics.errorRate * 100).toFixed(1)}%`);
    }

    // Check status code
    if (thresholds.statusCode.critical.includes(metrics.statusCode)) {
      issues.push(`Critical HTTP status: ${metrics.statusCode}`);
    }

    // Check bounce rate
    if (metrics.bounceRate && metrics.bounceRate > thresholds.bounceRate.critical) {
      issues.push(`Bounce rate critically high: ${(metrics.bounceRate * 100).toFixed(1)}%`);
    }

    return issues;
  }

  /**
   * Check for performance degradation compared to baseline
   */
  private checkPerformanceDegradation(
    current: LandingPageHealthMetrics,
    baseline: LandingPageHealthMetrics | null
  ): string[] {
    const issues: string[] = [];

    if (!baseline) {
      return issues;
    }

    // Check response time increase
    if (baseline.responseTime > 0) {
      const increase = (current.responseTime - baseline.responseTime) / baseline.responseTime;
      if (increase > 0.5) {
        issues.push(`Response time increased ${(increase * 100).toFixed(0)}%`);
      }
    }

    // Check error rate increase
    if (current.errorRate > baseline.errorRate * 2 && current.errorRate > 0.01) {
      issues.push(`Error rate doubled from baseline`);
    }

    // Check bounce rate increase
    if (current.bounceRate && baseline.bounceRate) {
      const bounceIncrease = (current.bounceRate - baseline.bounceRate) / baseline.bounceRate;
      if (bounceIncrease > 0.2) {
        issues.push(`Bounce rate increased ${(bounceIncrease * 100).toFixed(0)}%`);
      }
    }

    return issues;
  }

  /**
   * Determine severity based on issues found
   */
  private determineSeverity(issues: string[]): 'high' | 'medium' | 'low' {
    if (issues.length >= 3) return 'high';
    if (issues.length >= 2) return 'medium';
    return 'low';
  }

  /**
   * Create alert with health details
   */
  private createAlert(
    entity: Entity,
    severity: 'critical' | 'high' | 'medium' | 'low',
    issues: string[],
    current: LandingPageHealthMetrics,
    baseline: LandingPageHealthMetrics | null
  ): DetectorResult {
    const alert: Alert = {
      id: `lp_health_${entity.id}_${Date.now()}`,
      type: 'lp_health',
      severity,
      entity,
      detected_at: new Date().toISOString(),
      why: `Landing page health issues detected: ${issues.join(', ')}`,
      details: {
        current_metrics: current,
        baseline_metrics: baseline,
        issues
      },
      suggested_actions: this.getSuggestedActions(issues, current)
    };

    return {
      triggered: true,
      alert,
      confidence: 0.95,
      evidence: {
        issues,
        metrics: current
      }
    };
  }

  /**
   * Get suggested actions based on issues
   */
  private getSuggestedActions(issues: string[], metrics: LandingPageHealthMetrics): Array<{ action: string; priority: number }> {
    const actions: Array<{ action: string; priority: number }> = [];

    if (issues.some(i => i.includes('Response time'))) {
      actions.push({
        action: 'Optimize page load performance (images, scripts, CDN)',
        priority: 1
      });
    }

    if (issues.some(i => i.includes('Error rate')) || issues.some(i => i.includes('HTTP status'))) {
      actions.push({
        action: 'Check server logs and fix errors immediately',
        priority: 1
      });
    }

    if (issues.some(i => i.includes('Bounce rate'))) {
      actions.push({
        action: 'Review page content and user experience',
        priority: 2
      });
      actions.push({
        action: 'Check page relevance to ad copy and keywords',
        priority: 2
      });
    }

    if (metrics.statusCode >= 500) {
      actions.push({
        action: 'URGENT: Server error detected - contact development team',
        priority: 1
      });
    }

    if (metrics.statusCode === 404) {
      actions.push({
        action: 'Page not found - update ad destination URLs',
        priority: 1
      });
    }

    return actions;
  }

  /**
   * Get detector type
   */
  getType(): string {
    return 'lp_health';
  }
}