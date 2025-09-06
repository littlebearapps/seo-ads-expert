/**
 * CPC Jump Detector
 * Detects significant increases in cost-per-click
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig } from '../types.js';

export class CPCDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'cpc_jump',
      enabled: true,
      thresholds: {
        ...alertThresholds.cpc_jump,
        min_volume: alertThresholds.cpc_jump.min_clicks
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
      // Get baseline and current CPC
      const baseline = await this.computeBaseline(entity, window.baseline_days);
      const current = await this.computeCurrent(entity, window.current_days);
      
      // Get current period clicks for validation
      const clicks = await this.getCurrentClicks(entity, current.period.start, current.period.end);
      
      // Check minimum clicks requirement
      if (clicks < this.config.thresholds.min_volume!) {
        return {
          triggered: false,
          reason: `Insufficient clicks: ${clicks} < ${this.config.thresholds.min_volume}`
        };
      }
      
      // Calculate CPC ratio
      const cpcRatio = baseline.mean > 0 ? current.value / baseline.mean : 1;
      
      // Check if CPC increase exceeds threshold
      if (cpcRatio >= this.config.thresholds.change_factor!) {
        const severity = this.mapSeverity(0, cpcRatio);
        
        // Apply noise control
        const shouldAlert = await this.applyNoiseControl(entity, severity);
        if (!shouldAlert) {
          return {
            triggered: false,
            reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
          };
        }
        
        // Create alert
        const changePercent = ((cpcRatio - 1) * 100).toFixed(1);
        const why = `CPC increased ${changePercent}% on ${clicks} clicks`;
        
        const alert = this.createAlert(
          entity,
          baseline,
          current,
          severity,
          why,
          {
            cpc_baseline: baseline.mean,
            cpc_current: current.value,
            clicks: clicks,
            cost_impact: (current.value - baseline.mean) * clicks
          }
        );
        
        // Add suggested actions
        alert.suggested_actions = [
          {
            action: 'identify_waste_ngrams',
            params: { 
              min_cost: 10,
              min_clicks: 5,
              zero_conversion: true 
            },
            dry_run: true,
            priority: 'high'
          },
          {
            action: 'reduce_bids',
            params: { 
              reduction: 0.1,
              apply_cap: true 
            },
            dry_run: true,
            priority: 'medium'
          },
          {
            action: 'review_competitor_density',
            dry_run: false,
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
        reason: `CPC ratio ${cpcRatio.toFixed(2)} below threshold ${this.config.thresholds.change_factor}`
      };
      
    } catch (error) {
      logger.error('CPC detection failed', { entity, error });
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
    
    if (entity.type === 'campaign') {
      query = `
        SELECT 
          CAST(SUM(cost) AS REAL) / NULLIF(SUM(clicks), 0) as cpc
        FROM fact_search_terms
        WHERE product = ?
          AND campaign = ?
          AND date >= ?
          AND date <= ?
        GROUP BY date
        HAVING SUM(clicks) > 0
        ORDER BY date
      `;
      params = [entity.product, entity.campaign, startDate, endDate];
    } else if (entity.type === 'ad_group') {
      query = `
        SELECT 
          CAST(SUM(cost) AS REAL) / NULLIF(SUM(clicks), 0) as cpc
        FROM fact_search_terms
        WHERE product = ?
          AND ad_group = ?
          AND date >= ?
          AND date <= ?
        GROUP BY date
        HAVING SUM(clicks) > 0
        ORDER BY date
      `;
      params = [entity.product, entity.ad_group, startDate, endDate];
    } else if (entity.type === 'keyword') {
      query = `
        SELECT 
          CAST(cost AS REAL) / NULLIF(clicks, 0) as cpc
        FROM fact_search_terms
        WHERE product = ?
          AND search_term = ?
          AND date >= ?
          AND date <= ?
          AND clicks > 0
        ORDER BY date
      `;
      params = [entity.product, entity.keyword, startDate, endDate];
    }
    
    if (!query) {
      return [];
    }
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params) as Array<{ cpc: number }>;
    
    return results.map(r => r.cpc).filter(cpc => cpc !== null && !isNaN(cpc));
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
    } else if (entity.type === 'keyword') {
      query = `
        SELECT SUM(clicks) as total_clicks
        FROM fact_search_terms
        WHERE product = ? AND search_term = ? AND date >= ? AND date <= ?
      `;
      params = [entity.product, entity.keyword, startDate, endDate];
    }
    
    if (!query) return 0;
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params) as { total_clicks: number } | undefined;
    
    return result?.total_clicks || 0;
  }
}