/**
 * Spend Spike/Drop Detector
 * Detects significant changes in advertising spend
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig, Alert } from '../types.js';

export class SpendDetector extends DetectorEngine {
  private detectType: 'spike' | 'drop';
  
  constructor(db: DatabaseManager, detectType: 'spike' | 'drop' = 'spike') {
    const thresholds = detectType === 'spike' 
      ? alertThresholds.spend_spike 
      : alertThresholds.spend_drop;
      
    const config: AlertConfig = {
      type: detectType === 'spike' ? 'spend_spike' : 'spend_drop',
      enabled: true,
      thresholds,
      noise_control: alertThresholds.noise_control
    };
    super(db, config);
    this.detectType = detectType;
  }

  async detect(entity: Entity, window: TimeWindow): Promise<DetectorResult> {
    try {
      // Get baseline and current spend
      const baseline = await this.computeBaseline(entity, window.baseline_days);
      const current = await this.computeCurrent(entity, window.current_days);
      
      if (this.detectType === 'spike') {
        return this.detectSpike(entity, baseline, current);
      } else {
        return this.detectDrop(entity, baseline, current);
      }
      
    } catch (error) {
      logger.error('Spend detection failed', { entity, error });
      return {
        triggered: false,
        reason: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async detectSpike(
    entity: Entity,
    baseline: any,
    current: any
  ): Promise<DetectorResult> {
    const thresholds = alertThresholds.spend_spike;
    
    // Get additional metrics for validation
    const clicks = await this.getCurrentClicks(entity, current.period.start, current.period.end);
    
    // Check minimum clicks requirement
    if (clicks < thresholds.min_clicks) {
      return {
        triggered: false,
        reason: `Insufficient clicks: ${clicks} < ${thresholds.min_clicks}`
      };
    }
    
    // Check both factor and absolute increase
    const factorExceeded = current.value >= baseline.mean * thresholds.factor_increase;
    const absoluteExceeded = current.value >= baseline.mean + thresholds.min_absolute_increase;
    
    if (factorExceeded || absoluteExceeded) {
      const spendRatio = baseline.mean > 0 ? current.value / baseline.mean : 999;
      const severity = this.mapSeverity(0, spendRatio);
      
      // Apply noise control
      const shouldAlert = await this.applyNoiseControl(entity, severity);
      if (!shouldAlert) {
        return {
          triggered: false,
          reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
        };
      }
      
      // Create alert
      const changePercent = ((spendRatio - 1) * 100).toFixed(1);
      const changeDollar = (current.value - baseline.mean).toFixed(2);
      const why = `Spend increased ${changePercent}% (+$${changeDollar}) with ${clicks} clicks`;
      
      const alert = this.createAlert(
        entity,
        baseline,
        current,
        severity,
        why,
        {
          spend_baseline: baseline.mean,
          spend_current: current.value,
          clicks: clicks,
          change_dollar: parseFloat(changeDollar)
        }
      );
      
      // Add suggested actions
      alert.suggested_actions = [
        {
          action: 'review_search_terms',
          params: { 
            sort_by: 'cost',
            limit: 20 
          },
          dry_run: true,
          priority: 'immediate'
        },
        {
          action: 'adjust_bids',
          params: { 
            change: -0.1,
            target: 'high_cost_keywords' 
          },
          dry_run: true,
          priority: 'high'
        }
      ];
      
      await this.updateAlertState(alert);
      
      return {
        triggered: true,
        alert
      };
    }
    
    return {
      triggered: false,
      reason: `Spend ratio ${(current.value / baseline.mean).toFixed(2)} below thresholds`
    };
  }

  private async detectDrop(
    entity: Entity,
    baseline: any,
    current: any
  ): Promise<DetectorResult> {
    const thresholds = alertThresholds.spend_drop;
    
    // Get impressions for validation
    const impressions = await this.getCurrentImpressions(entity, current.period.start, current.period.end);
    
    // Check minimum impressions
    if (impressions < thresholds.min_impressions) {
      return {
        triggered: false,
        reason: `Insufficient impressions: ${impressions} < ${thresholds.min_impressions}`
      };
    }
    
    const spendRatio = baseline.mean > 0 ? current.value / baseline.mean : 1;
    
    if (spendRatio <= thresholds.factor_decrease) {
      const severity = this.mapSeverity(0, spendRatio);
      
      // Apply noise control
      const shouldAlert = await this.applyNoiseControl(entity, severity);
      if (!shouldAlert) {
        return {
          triggered: false,
          reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
        };
      }
      
      // Create alert
      const changePercent = ((spendRatio - 1) * 100).toFixed(1);
      const why = `Spend dropped ${Math.abs(parseFloat(changePercent))}% despite ${impressions.toLocaleString()} impressions`;
      
      const alert = this.createAlert(
        entity,
        baseline,
        current,
        severity,
        why,
        {
          spend_baseline: baseline.mean,
          spend_current: current.value,
          impressions: impressions
        }
      );
      
      // Add suggested actions
      alert.suggested_actions = [
        {
          action: 'check_budget_limits',
          dry_run: false,
          priority: 'immediate'
        },
        {
          action: 'review_bid_strategy',
          dry_run: true,
          priority: 'high'
        }
      ];
      
      await this.updateAlertState(alert);
      
      return {
        triggered: true,
        alert
      };
    }
    
    return {
      triggered: false,
      reason: `Spend ratio ${spendRatio.toFixed(2)} above threshold ${thresholds.factor_decrease}`
    };
  }

  protected async fetchMetrics(
    entity: Entity,
    startDate: string,
    endDate: string
  ): Promise<number[]> {
    const db = this.db.getDb();
    
    let query = '';
    let params: any[] = [];
    
    if (entity.type === 'campaign') {
      query = `
        SELECT SUM(cost) as daily_spend
        FROM fact_search_terms
        WHERE product = ?
          AND campaign = ?
          AND date >= ?
          AND date <= ?
        GROUP BY date
        ORDER BY date
      `;
      params = [entity.product, entity.campaign, startDate, endDate];
    } else if (entity.type === 'ad_group') {
      query = `
        SELECT SUM(cost) as daily_spend
        FROM fact_search_terms
        WHERE product = ?
          AND ad_group = ?
          AND date >= ?
          AND date <= ?
        GROUP BY date
        ORDER BY date
      `;
      params = [entity.product, entity.ad_group, startDate, endDate];
    }
    
    if (!query) {
      return [];
    }
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params) as Array<{ daily_spend: number }>;
    
    return results.map(r => r.daily_spend || 0);
  }

  private async getCurrentClicks(entity: Entity, startDate: string, endDate: string): Promise<number> {
    const db = this.db.getDb();
    
    let query = '';
    let params: any[] = [];
    
    if (entity.type === 'campaign') {
      query = `
        SELECT SUM(clicks) as total_clicks
        FROM fact_search_terms
        WHERE product = ? AND campaign = ? AND date >= ? AND date <= ?
      `;
      params = [entity.product, entity.campaign, startDate, endDate];
    } else if (entity.type === 'ad_group') {
      query = `
        SELECT SUM(clicks) as total_clicks
        FROM fact_search_terms
        WHERE product = ? AND ad_group = ? AND date >= ? AND date <= ?
      `;
      params = [entity.product, entity.ad_group, startDate, endDate];
    }
    
    if (!query) return 0;
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params) as { total_clicks: number } | undefined;
    
    return result?.total_clicks || 0;
  }

  private async getCurrentImpressions(entity: Entity, startDate: string, endDate: string): Promise<number> {
    const db = this.db.getDb();
    
    let query = '';
    let params: any[] = [];
    
    if (entity.type === 'campaign') {
      query = `
        SELECT SUM(impressions) as total_impressions
        FROM fact_search_terms
        WHERE product = ? AND campaign = ? AND date >= ? AND date <= ?
      `;
      params = [entity.product, entity.campaign, startDate, endDate];
    } else if (entity.type === 'ad_group') {
      query = `
        SELECT SUM(impressions) as total_impressions
        FROM fact_search_terms
        WHERE product = ? AND ad_group = ? AND date >= ? AND date <= ?
      `;
      params = [entity.product, entity.ad_group, startDate, endDate];
    }
    
    if (!query) return 0;
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params) as { total_impressions: number } | undefined;
    
    return result?.total_impressions || 0;
  }
}