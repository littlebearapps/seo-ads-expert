/**
 * Landing Page Regression Detector
 * Detects critical landing page health issues that require immediate attention
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig, Alert } from '../types.js';

export class LPRegressionDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'lp_regression',
      enabled: true,
      thresholds: {
        ...alertThresholds.lp_regression,
        min_volume: 100 // Minimum impressions to check LP
      },
      noise_control: {
        strategy: 'consecutive', // LP issues should trigger immediately
        consecutive_checks: 1,
        cooldown_hours: 1 // Short cooldown for critical issues
      }
    };
    super(db, config);
  }

  async detect(entity: Entity, window: TimeWindow): Promise<DetectorResult> {
    try {
      // Get current landing page health data
      const healthIssues = await this.checkLandingPageHealth(entity);
      
      if (healthIssues.length === 0) {
        return {
          triggered: false,
          reason: 'All landing pages healthy'
        };
      }
      
      // LP regression issues are always critical if they exist
      const severity = 'critical';
      
      // LP health issues bypass noise control for immediate attention
      const shouldAlert = true; // Critical issues always alert
      
      if (!shouldAlert) {
        return {
          triggered: false,
          reason: 'Noise control active'
        };
      }
      
      // Create critical alert for landing page issues
      const alert = await this.createLPRegressionAlert(entity, healthIssues, severity);
      
      await this.updateAlertState(alert);
      
      return {
        triggered: true,
        alert
      };
      
    } catch (error) {
      logger.error('LP Regression detection failed', { entity, error });
      return {
        triggered: false,
        reason: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async checkLandingPageHealth(entity: Entity): Promise<LPHealthIssue[]> {
    const issues: LPHealthIssue[] = [];
    
    // Get landing pages associated with this entity
    const landingPages = await this.getLandingPagesForEntity(entity);
    
    for (const page of landingPages) {
      const pageIssues = await this.checkSinglePageHealth(page);
      issues.push(...pageIssues);
    }
    
    return issues;
  }

  private async getLandingPagesForEntity(entity: Entity): Promise<LandingPageInfo[]> {
    const db = this.db.getDb();
    
    let query = '';
    let params: any[] = [];
    
    if (entity.type === 'landing_page') {
      // Direct landing page entity
      return [{ url: entity.url!, product: entity.product, impressions: 0 }];
    } else if (entity.type === 'ad_group') {
      // Find landing pages used by this ad group
      query = `
        SELECT DISTINCT 
          final_url as url,
          product,
          SUM(impressions) as impressions
        FROM fact_search_terms
        WHERE product = ?
          AND ad_group = ?
          AND final_url IS NOT NULL
          AND date >= date('now', '-7 days')
        GROUP BY final_url, product
        HAVING SUM(impressions) > 100
      `;
      params = [entity.product, entity.ad_group];
    } else if (entity.type === 'campaign') {
      query = `
        SELECT DISTINCT 
          final_url as url,
          product,
          SUM(impressions) as impressions
        FROM fact_search_terms
        WHERE product = ?
          AND campaign = ?
          AND final_url IS NOT NULL
          AND date >= date('now', '-7 days')
        GROUP BY final_url, product
        HAVING SUM(impressions) > 100
      `;
      params = [entity.product, entity.campaign];
    }
    
    if (!query) {
      return [];
    }
    
    try {
      const stmt = db.prepare(query);
      const results = stmt.all(...params) as LandingPageInfo[];
      return results;
    } catch (error) {
      logger.error('Failed to fetch landing pages for entity', { entity, error });
      return [];
    }
  }

  private async checkSinglePageHealth(page: LandingPageInfo): Promise<LPHealthIssue[]> {
    const issues: LPHealthIssue[] = [];
    const db = this.db.getDb();
    
    // Check URL health from fact_url_health table
    try {
      const healthQuery = `
        SELECT 
          status_code,
          is_noindex,
          canonical_ok,
          redirect_chain,
          is_soft_404,
          check_date
        FROM fact_url_health
        WHERE url = ?
        ORDER BY check_date DESC
        LIMIT 1
      `;
      
      const stmt = db.prepare(healthQuery);
      const health = stmt.get(page.url) as any;
      
      if (health) {
        // Check for critical issues based on thresholds
        const triggers = this.config.thresholds.triggers!;
        
        // 404 errors
        if (triggers.status_404 && health.status_code === 404) {
          issues.push({
            url: page.url,
            type: 'status_404',
            severity: 'critical',
            description: 'Page returns 404 Not Found',
            impact: 'Complete loss of traffic and conversions',
            impressions_at_risk: page.impressions
          });
        }
        
        // 500 errors
        if (triggers.status_500 && health.status_code >= 500) {
          issues.push({
            url: page.url,
            type: 'status_500',
            severity: 'critical',
            description: `Server error: ${health.status_code}`,
            impact: 'Page inaccessible to users and crawlers',
            impressions_at_risk: page.impressions
          });
        }
        
        // Noindex issues
        if (triggers.noindex && health.is_noindex) {
          issues.push({
            url: page.url,
            type: 'noindex',
            severity: 'critical',
            description: 'Page has noindex directive',
            impact: 'Page excluded from search results',
            impressions_at_risk: page.impressions
          });
        }
        
        // Canonical issues
        if (triggers.canonical_issue && !health.canonical_ok) {
          issues.push({
            url: page.url,
            type: 'canonical_issue',
            severity: 'critical',
            description: 'Canonical URL issue detected',
            impact: 'Search engines may not index the correct version',
            impressions_at_risk: page.impressions
          });
        }
        
        // Redirect chain issues
        if (triggers.redirect_chain && health.redirect_chain > triggers.redirect_chain) {
          issues.push({
            url: page.url,
            type: 'redirect_chain',
            severity: 'critical',
            description: `Long redirect chain: ${health.redirect_chain} redirects`,
            impact: 'Page load delays and potential crawl issues',
            impressions_at_risk: page.impressions
          });
        }
        
        // Soft 404 issues
        if (triggers.soft_404 && health.is_soft_404) {
          issues.push({
            url: page.url,
            type: 'soft_404',
            severity: 'critical',
            description: 'Page appears to be a soft 404',
            impact: 'Users reach error page despite 200 status',
            impressions_at_risk: page.impressions
          });
        }
      } else {
        // No health data available - this itself is an issue
        issues.push({
          url: page.url,
          type: 'no_health_data',
          severity: 'high',
          description: 'No health monitoring data available',
          impact: 'Unable to verify page accessibility',
          impressions_at_risk: page.impressions
        });
      }
    } catch (error) {
      logger.error('Failed to check page health', { url: page.url, error });
      issues.push({
        url: page.url,
        type: 'health_check_failed',
        severity: 'medium',
        description: 'Health check failed',
        impact: 'Unable to verify page status',
        impressions_at_risk: page.impressions
      });
    }
    
    return issues;
  }

  private async createLPRegressionAlert(
    entity: Entity,
    issues: LPHealthIssue[],
    severity: string
  ): Promise<Alert> {
    const totalImpressionsAtRisk = issues.reduce((sum, issue) => sum + issue.impressions_at_risk, 0);
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    
    const why = `${criticalIssues.length} critical landing page issues affecting ${totalImpressionsAtRisk.toLocaleString()} impressions`;
    
    const alert: Alert = {
      id: `lpr_${entity.type}_${entity.id}_${Date.now()}`,
      type: 'lp_regression',
      severity: severity as any,
      entity,
      window: { baseline_days: 1, current_days: 1 }, // LP issues are immediate
      metrics: {
        baseline: {
          mean: 0, // Healthy state
          stdDev: 0,
          median: 0,
          count: issues.length,
          min: 0,
          max: 0,
          period: { start: '', end: '' }
        },
        current: {
          value: criticalIssues.length,
          count: issues.length,
          period: { start: '', end: '' }
        },
        change_percentage: 100,
        additional: {
          total_pages_affected: new Set(issues.map(i => i.url)).size,
          critical_issues_count: criticalIssues.length,
          total_impressions_at_risk: totalImpressionsAtRisk,
          issue_breakdown: this.getIssueBreakdown(issues),
          affected_urls: issues.map(i => ({ url: i.url, type: i.type, severity: i.severity }))
        }
      },
      why,
      playbook: 'pb_lp_regression',
      detection: {
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        occurrences: 1
      },
      suggested_actions: this.generateLPRegressionActions(issues, entity)
    };
    
    return alert;
  }

  private getIssueBreakdown(issues: LPHealthIssue[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    for (const issue of issues) {
      breakdown[issue.type] = (breakdown[issue.type] || 0) + 1;
    }
    
    return breakdown;
  }

  private generateLPRegressionActions(issues: LPHealthIssue[], entity: Entity): Array<{
    action: string;
    params: Record<string, any>;
    dry_run: boolean;
    priority: string;
  }> {
    const actions = [];
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    
    // Immediate blocking action for critical issues
    if (criticalIssues.length > 0) {
      actions.push({
        action: 'block_applies',
        params: {
          reason: 'Critical landing page issues detected',
          affected_urls: criticalIssues.map(i => i.url),
          issue_types: criticalIssues.map(i => i.type),
          requires_immediate_attention: true
        },
        dry_run: false, // This should actually block
        priority: 'critical'
      });
    }
    
    // Specific actions for different issue types
    const issueTypes = new Set(issues.map(i => i.type));
    
    if (issueTypes.has('status_404') || issueTypes.has('status_500')) {
      actions.push({
        action: 'fix_server_errors',
        params: {
          urls: issues.filter(i => i.type.startsWith('status_')).map(i => i.url),
          priority: 'immediate'
        },
        dry_run: true,
        priority: 'critical'
      });
    }
    
    if (issueTypes.has('noindex')) {
      actions.push({
        action: 'remove_noindex',
        params: {
          urls: issues.filter(i => i.type === 'noindex').map(i => i.url),
          verify_intentional: true
        },
        dry_run: true,
        priority: 'critical'
      });
    }
    
    if (issueTypes.has('canonical_issue')) {
      actions.push({
        action: 'fix_canonical_issues',
        params: {
          urls: issues.filter(i => i.type === 'canonical_issue').map(i => i.url),
          audit_canonical_tags: true
        },
        dry_run: true,
        priority: 'critical'
      });
    }
    
    if (issueTypes.has('redirect_chain')) {
      actions.push({
        action: 'optimize_redirects',
        params: {
          urls: issues.filter(i => i.type === 'redirect_chain').map(i => i.url),
          max_redirect_length: 1
        },
        dry_run: true,
        priority: 'high'
      });
    }
    
    // Health monitoring enhancement
    actions.push({
      action: 'enhance_health_monitoring',
      params: {
        frequency: 'hourly',
        duration_hours: 48,
        alert_immediately: true,
        affected_urls: issues.map(i => i.url)
      },
      dry_run: true,
      priority: 'high'
    });
    
    return actions;
  }

  protected async fetchMetrics(
    entity: Entity,
    startDate: string,
    endDate: string
  ): Promise<number[]> {
    // LP Regression detector checks current state rather than historical metrics
    return [];
  }
}

// Type definitions for landing page health
interface LandingPageInfo {
  url: string;
  product: string;
  impressions: number;
}

interface LPHealthIssue {
  url: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  impressions_at_risk: number;
}