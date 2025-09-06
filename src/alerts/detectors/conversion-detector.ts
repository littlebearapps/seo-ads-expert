/**
 * Conversion Drop Detector
 * Detects significant drops in conversion rate or absolute conversions
 */

import { DetectorEngine } from '../detector-engine.js';
import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import alertThresholds from '../../config/alert-thresholds.json' assert { type: 'json' };
import type { Entity, TimeWindow, DetectorResult, AlertConfig } from '../types.js';

export class ConversionDetector extends DetectorEngine {
  constructor(db: DatabaseManager) {
    const config: AlertConfig = {
      type: 'conversion_drop',
      enabled: true,
      thresholds: {
        ...alertThresholds.conversion_drop,
        min_volume: alertThresholds.conversion_drop.min_sessions,
        change_factor: alertThresholds.conversion_drop.factor
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
      // Get baseline and current conversion rates
      const baseline = await this.computeBaseline(entity, window.baseline_days);
      const current = await this.computeCurrent(entity, window.current_days);
      
      // Check minimum volume requirement (sessions or clicks)
      if (current.count < this.config.thresholds.min_volume!) {
        return {
          triggered: false,
          reason: `Insufficient sessions: ${current.count} < ${this.config.thresholds.min_volume}`
        };
      }
      
      // Calculate conversion rate ratio
      const conversionRatio = baseline.mean > 0 ? current.value / baseline.mean : 1;
      
      // Check if conversion drop exceeds threshold
      if (conversionRatio <= this.config.thresholds.change_factor!) {
        const severity = this.mapSeverity(0, conversionRatio);
        
        // Apply noise control
        const shouldAlert = await this.applyNoiseControl(entity, severity);
        if (!shouldAlert) {
          return {
            triggered: false,
            reason: 'Noise control: Waiting for consecutive occurrences or in cooldown'
          };
        }
        
        // Create alert
        const changePercent = ((conversionRatio - 1) * 100).toFixed(1);
        const why = `Conversion rate fell ${Math.abs(parseFloat(changePercent))}% from ${(baseline.mean * 100).toFixed(2)}% to ${(current.value * 100).toFixed(2)}%`;
        
        const alert = this.createAlert(
          entity,
          baseline,
          current,
          severity,
          why,
          {
            conversion_rate_baseline: baseline.mean,
            conversion_rate_current: current.value,
            sessions: current.count,
            absolute_conversions: Math.round(current.value * current.count)
          }
        );
        
        // Add suggested actions based on entity type
        if (entity.type === 'landing_page') {
          alert.suggested_actions = [
            {
              action: 'check_page_health',
              params: { 
                url: entity.url,
                checks: ['loading_speed', 'mobile_friendly', 'form_errors'] 
              },
              dry_run: true,
              priority: 'critical'
            },
            {
              action: 'analyze_user_flow',
              params: { 
                landing_page: entity.url,
                funnel_steps: ['landing', 'form', 'thank_you']
              },
              dry_run: true,
              priority: 'high'
            }
          ];
        } else {
          alert.suggested_actions = [
            {
              action: 'analyze_search_terms',
              params: { 
                sort_by: 'cost',
                filter: 'zero_conversions',
                period: 'last_7_days'
              },
              dry_run: true,
              priority: 'high'
            },
            {
              action: 'review_landing_pages',
              params: { 
                entity_type: entity.type,
                entity_id: entity.id
              },
              dry_run: true,
              priority: 'high'
            },
            {
              action: 'check_conversion_tracking',
              params: {
                verify_gtag: true,
                check_goals: true
              },
              dry_run: true,
              priority: 'medium'
            }
          ];
        }
        
        await this.updateAlertState(alert);
        
        return {
          triggered: true,
          alert
        };
      }
      
      return {
        triggered: false,
        reason: `Conversion ratio ${conversionRatio.toFixed(2)} above threshold ${this.config.thresholds.change_factor}`
      };
      
    } catch (error) {
      logger.error('Conversion detection failed', { entity, error });
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
    
    if (entity.type === 'landing_page') {
      // For landing pages, get conversion rate from GA4 data
      query = `
        SELECT 
          CAST(conversions AS REAL) / NULLIF(sessions, 0) as conversion_rate
        FROM fact_page_performance
        WHERE url = ?
          AND date >= ?
          AND date <= ?
          AND sessions > 0
        ORDER BY date
      `;
      params = [entity.url, startDate, endDate];
    } else if (entity.type === 'ad_group') {
      // For ad groups, calculate from search terms
      query = `
        SELECT 
          CAST(conversions AS REAL) / NULLIF(clicks, 0) as conversion_rate
        FROM fact_search_terms
        WHERE product = ?
          AND ad_group = ?
          AND date >= ?
          AND date <= ?
          AND clicks > 0
        ORDER BY date
      `;
      params = [entity.product, entity.ad_group, startDate, endDate];
    } else if (entity.type === 'campaign') {
      query = `
        SELECT 
          CAST(SUM(conversions) AS REAL) / NULLIF(SUM(clicks), 0) as conversion_rate
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
    } else if (entity.type === 'keyword') {
      query = `
        SELECT 
          CAST(conversions AS REAL) / NULLIF(clicks, 0) as conversion_rate
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
      logger.warn('No query defined for entity type', { type: entity.type });
      return [];
    }
    
    try {
      const stmt = db.prepare(query);
      const results = stmt.all(...params) as Array<{ conversion_rate: number }>;
      
      return results
        .map(r => r.conversion_rate)
        .filter(rate => rate !== null && !isNaN(rate) && rate >= 0);
    } catch (error) {
      // If fact_page_performance table doesn't exist, try alternative approach
      if (entity.type === 'landing_page') {
        logger.warn('fact_page_performance table not found, using search terms data');
        query = `
          SELECT 
            CAST(conversions AS REAL) / NULLIF(clicks, 0) as conversion_rate
          FROM fact_search_terms
          WHERE product = ?
            AND date >= ?
            AND date <= ?
            AND clicks > 0
          ORDER BY date
        `;
        params = [entity.product, startDate, endDate];
        
        try {
          const stmt = db.prepare(query);
          const results = stmt.all(...params) as Array<{ conversion_rate: number }>;
          
          return results
            .map(r => r.conversion_rate)
            .filter(rate => rate !== null && !isNaN(rate) && rate >= 0);
        } catch (fallbackError) {
          logger.error('Fallback conversion query failed', { entity, error: fallbackError });
          return [];
        }
      }
      
      logger.error('Conversion metrics query failed', { entity, error });
      return [];
    }
  }
}