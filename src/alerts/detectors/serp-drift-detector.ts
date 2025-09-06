/**
 * SERP Drift Detector
 * Detects significant changes in SERP features and competitive landscape
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig, Alert } from '../types.js';

export class SERPDriftDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'serp_drift',
      enabled: true,
      thresholds: {
        min_volume: 1000, // Minimum impressions to check SERP
        severity_mapping: alertThresholds.serp_drift.severity_mapping
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
      // Get current and historical SERP data
      const current = await this.getCurrentSERPData(entity);
      const baseline = await this.getBaselineSERPData(entity, window.baseline_days);
      
      if (!current || !baseline) {
        return {
          triggered: false,
          reason: 'Insufficient SERP data for comparison'
        };
      }
      
      // Analyze SERP changes
      const changes = this.analyzeSERPChanges(baseline, current);
      
      if (changes.length === 0) {
        return {
          triggered: false,
          reason: 'No significant SERP changes detected'
        };
      }
      
      // Determine severity based on most significant change
      const highestSeverity = this.getHighestSeverity(changes);
      
      // Apply noise control
      const shouldAlert = await this.applyNoiseControl(entity, highestSeverity);
      if (!shouldAlert) {
        return {
          triggered: false,
          reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
        };
      }
      
      // Create alert with SERP change details
      const alert = await this.createSERPDriftAlert(entity, changes, current, baseline, highestSeverity);
      
      await this.updateAlertState(alert);
      
      return {
        triggered: true,
        alert
      };
      
    } catch (error) {
      logger.error('SERP Drift detection failed', { entity, error });
      return {
        triggered: false,
        reason: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async getCurrentSERPData(entity: Entity): Promise<SERPSnapshot | null> {
    const db = this.db.getDb();
    
    // Get the most recent SERP snapshot for this entity
    const query = `
      SELECT 
        keywords_json,
        features_json,
        top_domains_json,
        ai_overview,
        shopping_results,
        video_pack,
        captured_at
      FROM fact_serp_snapshot
      WHERE product = ?
        AND cluster = ?
      ORDER BY captured_at DESC
      LIMIT 1
    `;
    
    try {
      const stmt = db.prepare(query);
      const result = stmt.get(entity.product, entity.cluster || entity.id) as any;
      
      if (!result) return null;
      
      return {
        keywords: JSON.parse(result.keywords_json || '[]'),
        features: JSON.parse(result.features_json || '[]'),
        top_domains: JSON.parse(result.top_domains_json || '[]'),
        ai_overview: result.ai_overview,
        shopping_results: result.shopping_results,
        video_pack: result.video_pack,
        captured_at: result.captured_at
      };
    } catch (error) {
      logger.error('Failed to fetch current SERP data', { entity, error });
      return null;
    }
  }

  private async getBaselineSERPData(entity: Entity, baselineDays: number): Promise<SERPSnapshot | null> {
    const db = this.db.getDb();
    const baselineDate = new Date();
    baselineDate.setDate(baselineDate.getDate() - baselineDays);
    
    const query = `
      SELECT 
        keywords_json,
        features_json,
        top_domains_json,
        ai_overview,
        shopping_results,
        video_pack,
        captured_at
      FROM fact_serp_snapshot
      WHERE product = ?
        AND cluster = ?
        AND captured_at <= ?
      ORDER BY captured_at DESC
      LIMIT 1
    `;
    
    try {
      const stmt = db.prepare(query);
      const result = stmt.get(
        entity.product, 
        entity.cluster || entity.id, 
        baselineDate.toISOString()
      ) as any;
      
      if (!result) return null;
      
      return {
        keywords: JSON.parse(result.keywords_json || '[]'),
        features: JSON.parse(result.features_json || '[]'),
        top_domains: JSON.parse(result.top_domains_json || '[]'),
        ai_overview: result.ai_overview,
        shopping_results: result.shopping_results,
        video_pack: result.video_pack,
        captured_at: result.captured_at
      };
    } catch (error) {
      logger.error('Failed to fetch baseline SERP data', { entity, error });
      return null;
    }
  }

  private analyzeSERPChanges(baseline: SERPSnapshot, current: SERPSnapshot): SERPChange[] {
    const changes: SERPChange[] = [];
    
    // Check for AI Overview appearance/disappearance
    if (baseline.ai_overview !== current.ai_overview) {
      if (current.ai_overview && !baseline.ai_overview) {
        changes.push({
          type: 'ai_overview_appeared',
          severity: current.shopping_results ? 'high' : 'medium',
          description: 'AI Overview now appears in SERP',
          impact: 'May reduce organic CTR significantly'
        });
      } else if (!current.ai_overview && baseline.ai_overview) {
        changes.push({
          type: 'ai_overview_disappeared',
          severity: 'low',
          description: 'AI Overview no longer appears in SERP',
          impact: 'May improve organic CTR'
        });
      }
    }
    
    // Check for Shopping results changes
    if (baseline.shopping_results !== current.shopping_results) {
      if (current.shopping_results && !baseline.shopping_results) {
        changes.push({
          type: 'shopping_appeared',
          severity: current.ai_overview ? 'high' : 'medium',
          description: 'Shopping results now appear in SERP',
          impact: 'May impact organic visibility'
        });
      }
    }
    
    // Check for Video pack changes
    if (baseline.video_pack !== current.video_pack) {
      if (current.video_pack && !baseline.video_pack) {
        changes.push({
          type: 'video_pack_appeared',
          severity: 'medium',
          description: 'Video pack now appears in SERP',
          impact: 'May affect organic CTR'
        });
      }
    }
    
    // Check for top domain changes (new competitors in top 3)
    const newTopDomains = this.findNewTopDomains(baseline.top_domains, current.top_domains);
    if (newTopDomains.length > 0) {
      changes.push({
        type: 'new_top_domains',
        severity: 'medium',
        description: `New domains in top 3: ${newTopDomains.join(', ')}`,
        impact: 'Increased competition in top positions',
        details: { new_domains: newTopDomains }
      });
    }
    
    // Check for significant feature changes
    const featureChanges = this.compareFeatures(baseline.features, current.features);
    if (featureChanges.length > 0) {
      changes.push({
        type: 'feature_changes',
        severity: 'low',
        description: `SERP features changed: ${featureChanges.join(', ')}`,
        impact: 'SERP layout changes may affect visibility',
        details: { feature_changes: featureChanges }
      });
    }
    
    return changes;
  }

  private findNewTopDomains(baseline: string[], current: string[]): string[] {
    const top3Current = current.slice(0, 3);
    const top3Baseline = baseline.slice(0, 3);
    
    return top3Current.filter(domain => !top3Baseline.includes(domain));
  }

  private compareFeatures(baseline: string[], current: string[]): string[] {
    const added = current.filter(feature => !baseline.includes(feature));
    const removed = baseline.filter(feature => !current.includes(feature));
    
    const changes: string[] = [];
    if (added.length > 0) changes.push(`+${added.join(', ')}`);
    if (removed.length > 0) changes.push(`-${removed.join(', ')}`);
    
    return changes;
  }

  private getHighestSeverity(changes: SERPChange[]): 'low' | 'medium' | 'high' | 'critical' {
    const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    let highest: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    for (const change of changes) {
      if (severityOrder[change.severity] > severityOrder[highest]) {
        highest = change.severity;
      }
    }
    
    return highest;
  }

  private async createSERPDriftAlert(
    entity: Entity,
    changes: SERPChange[],
    current: SERPSnapshot,
    baseline: SERPSnapshot,
    severity: string
  ): Promise<Alert> {
    const why = `SERP changed: ${changes.map(c => c.description).join('; ')}`;
    
    const alert: Alert = {
      id: `serp_${entity.type}_${entity.id}_${Date.now()}`,
      type: 'serp_drift',
      severity: severity as any,
      entity,
      window: { baseline_days: 14, current_days: 1 },
      metrics: {
        baseline: {
          mean: 0,
          stdDev: 0,
          median: 0,
          count: changes.length,
          min: 0,
          max: 1,
          period: { start: baseline.captured_at, end: baseline.captured_at }
        },
        current: {
          value: 1,
          count: changes.length,
          period: { start: current.captured_at, end: current.captured_at }
        },
        change_percentage: 100,
        additional: {
          serp_changes: changes,
          current_features: current.features,
          baseline_features: baseline.features,
          current_top_domains: current.top_domains.slice(0, 5),
          baseline_top_domains: baseline.top_domains.slice(0, 5)
        }
      },
      why,
      playbook: 'pb_serp_drift',
      detection: {
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        occurrences: 1
      },
      suggested_actions: this.generateSERPDriftActions(changes, entity)
    };
    
    return alert;
  }

  private generateSERPDriftActions(changes: SERPChange[], entity: Entity): Array<{
    action: string;
    params: Record<string, any>;
    dry_run: boolean;
    priority: string;
  }> {
    const actions = [];
    
    // Actions for AI Overview changes
    if (changes.some(c => c.type.includes('ai_overview'))) {
      actions.push({
        action: 'optimize_for_ai_overview',
        params: {
          focus_areas: ['FAQ content', 'structured data', 'concise answers'],
          entity_keywords: entity.keywords || []
        },
        dry_run: true,
        priority: 'high'
      });
    }
    
    // Actions for shopping results
    if (changes.some(c => c.type.includes('shopping'))) {
      actions.push({
        action: 'review_shopping_competition',
        params: {
          monitor_product_ads: true,
          adjust_bid_strategy: true
        },
        dry_run: true,
        priority: 'medium'
      });
    }
    
    // Actions for new competitors
    const newDomainChanges = changes.filter(c => c.type === 'new_top_domains');
    if (newDomainChanges.length > 0) {
      actions.push({
        action: 'analyze_new_competitors',
        params: {
          new_domains: newDomainChanges[0].details?.new_domains || [],
          analysis_focus: ['content_gaps', 'backlink_opportunities', 'keyword_overlap']
        },
        dry_run: true,
        priority: 'high'
      });
    }
    
    // General SERP monitoring
    actions.push({
      action: 'increase_serp_monitoring',
      params: {
        frequency: 'daily',
        duration_days: 14,
        alert_on_changes: true
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
    // SERP Drift detector doesn't use standard time-series metrics
    // It compares snapshots at different points in time
    return [];
  }
}

// Type definitions for SERP data
interface SERPSnapshot {
  keywords: string[];
  features: string[];
  top_domains: string[];
  ai_overview: boolean;
  shopping_results: boolean;
  video_pack: boolean;
  captured_at: string;
}

interface SERPChange {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  details?: Record<string, any>;
}