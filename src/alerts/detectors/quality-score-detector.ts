/**
 * Quality Score Detector
 * Detects low quality scores and component degradation in Google Ads
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig, Alert } from '../types.js';

export class QualityScoreDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'quality_score',
      enabled: true,
      thresholds: {
        ...alertThresholds.quality_score,
        min_volume: 100 // Minimum impressions to check QS
      },
      noise_control: {
        strategy: alertThresholds.noise_control.strategy as 'consecutive' | 'cooldown' | 'both',
        consecutive_checks: alertThresholds.noise_control.consecutive_checks,
        cooldown_hours: alertThresholds.noise_control.cooldown_hours
      }
    };
    super(db, config);
  }

  async detect(entity: Entity, window: TimeWindow): Promise<DetectorResult> {
    try {
      // Quality Score is more about current state than historical trend
      const qualityData = await this.fetchQualityScoreData(entity);
      
      if (!qualityData) {
        return {
          triggered: false,
          reason: 'No quality score data available'
        };
      }
      
      // Check if any keywords have quality score issues
      const issues = this.analyzeQualityIssues(qualityData);
      
      if (issues.length === 0) {
        return {
          triggered: false,
          reason: 'All quality scores above threshold'
        };
      }
      
      // Determine severity based on worst quality score
      const worstScore = Math.min(...issues.map(i => i.quality_score));
      const severity = this.mapQualityScoreSeverity(worstScore);
      
      // Apply noise control
      const shouldAlert = await this.applyNoiseControl(entity, severity);
      if (!shouldAlert) {
        return {
          triggered: false,
          reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
        };
      }
      
      // Create alert with detailed quality score information
      const alert = await this.createQualityScoreAlert(entity, issues, severity);
      
      await this.updateAlertState(alert);
      
      return {
        triggered: true,
        alert
      };
      
    } catch (error) {
      logger.error('Quality Score detection failed', { entity, error });
      return {
        triggered: false,
        reason: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async fetchQualityScoreData(entity: Entity): Promise<QualityScoreData[] | null> {
    const db = this.db.getDb();
    
    let query = '';
    let params: any[] = [];
    
    if (entity.type === 'ad_group') {
      query = `
        SELECT 
          search_term as keyword,
          quality_score,
          ad_relevance,
          expected_ctr,
          landing_page_experience,
          impressions,
          clicks,
          cost
        FROM fact_search_terms
        WHERE product = ?
          AND ad_group = ?
          AND quality_score IS NOT NULL
          AND impressions > 100
        ORDER BY impressions DESC
      `;
      params = [entity.product, entity.ad_group];
    } else if (entity.type === 'campaign') {
      query = `
        SELECT 
          search_term as keyword,
          quality_score,
          ad_relevance,
          expected_ctr,
          landing_page_experience,
          impressions,
          clicks,
          cost
        FROM fact_search_terms
        WHERE product = ?
          AND campaign = ?
          AND quality_score IS NOT NULL
          AND impressions > 100
        ORDER BY impressions DESC
      `;
      params = [entity.product, entity.campaign];
    } else if (entity.type === 'keyword') {
      query = `
        SELECT 
          search_term as keyword,
          quality_score,
          ad_relevance,
          expected_ctr,
          landing_page_experience,
          impressions,
          clicks,
          cost
        FROM fact_search_terms
        WHERE product = ?
          AND search_term = ?
          AND quality_score IS NOT NULL
        ORDER BY date DESC
        LIMIT 1
      `;
      params = [entity.product, entity.keyword];
    }
    
    if (!query) {
      return null;
    }
    
    try {
      const stmt = db.prepare(query);
      const results = stmt.all(...params) as QualityScoreData[];
      
      return results.length > 0 ? results : null;
    } catch (error) {
      logger.error('Quality score data fetch failed', { entity, error });
      return null;
    }
  }

  private analyzeQualityIssues(qualityData: QualityScoreData[]): QualityScoreIssue[] {
    const issues: QualityScoreIssue[] = [];
    const threshold = this.config.thresholds.threshold!;
    
    for (const data of qualityData) {
      if (data.quality_score < threshold) {
        const componentIssues: string[] = [];
        
        // Check component scores (Google uses "Average", "Above average", "Below average")
        if (data.ad_relevance === 'Below average') {
          componentIssues.push('ad_relevance');
        }
        if (data.expected_ctr === 'Below average') {
          componentIssues.push('expected_ctr');
        }
        if (data.landing_page_experience === 'Below average') {
          componentIssues.push('landing_page_experience');
        }
        
        issues.push({
          keyword: data.keyword,
          quality_score: data.quality_score,
          component_issues: componentIssues,
          impressions: data.impressions,
          cost: data.cost
        });
      }
    }
    
    return issues;
  }

  private mapQualityScoreSeverity(qualityScore: number): 'low' | 'medium' | 'high' | 'critical' {
    const bands = this.config.thresholds.severity_bands!;
    
    if (qualityScore <= bands.critical) return 'critical';
    if (qualityScore <= bands.high) return 'high';
    if (qualityScore <= bands.medium) return 'medium';
    return 'low';
  }

  private async createQualityScoreAlert(
    entity: Entity, 
    issues: QualityScoreIssue[], 
    severity: string
  ): Promise<Alert> {
    const totalCost = issues.reduce((sum, issue) => sum + issue.cost, 0);
    const avgQualityScore = issues.reduce((sum, issue) => sum + issue.quality_score, 0) / issues.length;
    
    const why = `${issues.length} keywords with quality score below threshold (avg: ${avgQualityScore.toFixed(1)}, spending $${totalCost.toFixed(2)})`;
    
    const alert: Alert = {
      id: `qs_${entity.type}_${entity.id}_${Date.now()}`,
      type: 'quality_score',
      severity: severity as any,
      entity,
      window: { baseline_days: 7, current_days: 1 }, // QS is current state
      metrics: {
        baseline: { 
          mean: 7, // Typical good QS
          stdDev: 1,
          median: 7,
          count: issues.length,
          min: 6,
          max: 8,
          period: { start: '', end: '' }
        },
        current: { 
          value: avgQualityScore,
          count: issues.length,
          period: { start: '', end: '' }
        },
        change_percentage: ((avgQualityScore / 7) - 1) * 100,
        additional: {
          total_affected_keywords: issues.length,
          total_cost_at_risk: totalCost,
          component_breakdown: this.getComponentBreakdown(issues)
        }
      },
      why,
      playbook: 'pb_quality_score',
      detection: {
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        occurrences: 1
      },
      suggested_actions: this.generateQualityScoreActions(issues, entity)
    };
    
    return alert;
  }

  private getComponentBreakdown(issues: QualityScoreIssue[]): Record<string, number> {
    const breakdown = {
      ad_relevance: 0,
      expected_ctr: 0,
      landing_page_experience: 0
    };
    
    for (const issue of issues) {
      for (const component of issue.component_issues) {
        breakdown[component as keyof typeof breakdown]++;
      }
    }
    
    return breakdown;
  }

  private generateQualityScoreActions(issues: QualityScoreIssue[], entity: Entity): Array<{
    action: string;
    params: Record<string, any>;
    dry_run: boolean;
    priority: string;
  }> {
    const actions = [];
    const componentIssues = this.getComponentBreakdown(issues);
    
    // Ad relevance issues
    if (componentIssues.ad_relevance > 0) {
      actions.push({
        action: 'improve_ad_relevance',
        params: {
          keywords_affected: issues.filter(i => i.component_issues.includes('ad_relevance')).map(i => i.keyword),
          suggestions: ['Add keywords to ad copy', 'Create more targeted ad groups', 'Use Dynamic Keyword Insertion']
        },
        dry_run: true,
        priority: 'high'
      });
    }
    
    // Expected CTR issues
    if (componentIssues.expected_ctr > 0) {
      actions.push({
        action: 'improve_expected_ctr',
        params: {
          keywords_affected: issues.filter(i => i.component_issues.includes('expected_ctr')).map(i => i.keyword),
          suggestions: ['Test new ad copy variants', 'Add compelling CTAs', 'Use ad extensions', 'Improve headline relevance']
        },
        dry_run: true,
        priority: 'high'
      });
    }
    
    // Landing page experience issues
    if (componentIssues.landing_page_experience > 0) {
      actions.push({
        action: 'improve_landing_page_experience',
        params: {
          keywords_affected: issues.filter(i => i.component_issues.includes('landing_page_experience')).map(i => i.keyword),
          suggestions: ['Improve page loading speed', 'Ensure mobile-friendly design', 'Match ad message to page content', 'Simplify navigation']
        },
        dry_run: true,
        priority: 'critical'
      });
    }
    
    // General quality score improvement
    actions.push({
      action: 'pause_low_quality_keywords',
      params: {
        quality_threshold: 3,
        cost_threshold: 50,
        affected_keywords: issues.filter(i => i.quality_score <= 3 && i.cost > 50).map(i => i.keyword)
      },
      dry_run: true,
      priority: 'medium'
    });
    
    return actions;
  }

  protected async fetchMetrics(
    entity: Entity,
    startDate: string,
    endDate: string
  ): Promise<number[]> {
    // Quality Score detector doesn't use the standard fetchMetrics approach
    // as it's more about current state analysis than historical trends
    return [];
  }
}

// Type definitions for Quality Score data
interface QualityScoreData {
  keyword: string;
  quality_score: number;
  ad_relevance: string;
  expected_ctr: string;
  landing_page_experience: string;
  impressions: number;
  clicks: number;
  cost: number;
}

interface QualityScoreIssue {
  keyword: string;
  quality_score: number;
  component_issues: string[];
  impressions: number;
  cost: number;
}