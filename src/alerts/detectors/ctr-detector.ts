/**
 * CTR Drop Detector
 * Detects significant drops in click-through rate
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig } from '../types.js';

export class CTRDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'ctr_drop',
      enabled: true,
      thresholds: {
        ...alertThresholds.ctr_drop,
        min_volume: alertThresholds.ctr_drop.min_impressions
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
      // Get baseline and current CTR
      const baseline = await this.computeBaseline(entity, window.baseline_days);
      const current = await this.computeCurrent(entity, window.current_days);
      
      // Check minimum volume requirement
      if (current.count < this.config.thresholds.min_volume!) {
        return {
          triggered: false,
          reason: `Insufficient impressions: ${current.count} < ${this.config.thresholds.min_volume}`
        };
      }
      
      // Calculate CTR ratio
      const ctrRatio = baseline.mean > 0 ? current.value / baseline.mean : 1;
      
      // Check if CTR drop exceeds threshold
      if (ctrRatio <= this.config.thresholds.change_factor!) {
        const severity = this.mapSeverity(0, ctrRatio);
        
        // Apply noise control
        const shouldAlert = await this.applyNoiseControl(entity, severity);
        if (!shouldAlert) {
          return {
            triggered: false,
            reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
          };
        }
        
        // Create alert
        const changePercent = ((ctrRatio - 1) * 100).toFixed(1);
        const why = `CTR fell ${Math.abs(parseFloat(changePercent))}% on ${current.count.toLocaleString()} impressions`;
        
        const alert = this.createAlert(
          entity,
          baseline,
          current,
          severity,
          why,
          {
            ctr_baseline: baseline.mean,
            ctr_current: current.value,
            impressions: current.count
          }
        );
        
        // Add suggested actions
        alert.suggested_actions = [
          {
            action: 'generate_rsa_variants',
            params: { 
              variants: ['benefit', 'proof'],
              count: 3 
            },
            dry_run: true,
            priority: 'high'
          },
          {
            action: 'add_sitelinks',
            params: { 
              items: ['top_features', 'pricing'] 
            },
            dry_run: true,
            priority: 'medium'
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
        reason: `CTR ratio ${ctrRatio.toFixed(2)} above threshold ${this.config.thresholds.change_factor}`
      };
      
    } catch (error) {
      logger.error('CTR detection failed', { entity, error });
      return {
        triggered: false,
        reason: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  protected async fetchMetrics(
    entity: Entity,
    startDate: string,
    endDate: string
  ): Promise<number[]> {
    const db = this.db.getDb();
    
    let query = '';
    let params: any[] = [];
    
    if (entity.type === 'ad_group') {
      query = `
        SELECT 
          CAST(clicks AS REAL) / NULLIF(impressions, 0) as ctr
        FROM fact_search_terms
        WHERE product = ?
          AND ad_group = ?
          AND date >= ?
          AND date <= ?
          AND impressions > 0
        ORDER BY date
      `;
      params = [entity.product, entity.ad_group, startDate, endDate];
    } else if (entity.type === 'campaign') {
      query = `
        SELECT 
          CAST(SUM(clicks) AS REAL) / NULLIF(SUM(impressions), 0) as ctr
        FROM fact_search_terms
        WHERE product = ?
          AND campaign = ?
          AND date >= ?
          AND date <= ?
        GROUP BY date
        HAVING SUM(impressions) > 0
        ORDER BY date
      `;
      params = [entity.product, entity.campaign, startDate, endDate];
    } else if (entity.type === 'keyword') {
      query = `
        SELECT 
          CAST(clicks AS REAL) / NULLIF(impressions, 0) as ctr
        FROM fact_search_terms
        WHERE product = ?
          AND search_term = ?
          AND date >= ?
          AND date <= ?
          AND impressions > 0
        ORDER BY date
      `;
      params = [entity.product, entity.keyword, startDate, endDate];
    }
    
    if (!query) {
      return [];
    }
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params) as Array<{ ctr: number }>;
    
    return results.map(r => r.ctr).filter(ctr => ctr !== null && !isNaN(ctr));
  }
}