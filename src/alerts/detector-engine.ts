/**
 * v1.7 Unified Anomaly Detection Engine
 */

import { createHash } from 'crypto';
import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';
import type {
  Alert,
  AlertConfig,
  AlertSeverity,
  AlertState,
  BaselineData,
  CurrentData,
  DetectorResult,
  Entity,
  TimeWindow
} from './types.js';

export abstract class DetectorEngine {
  protected db: DatabaseManager;
  protected config: AlertConfig;
  
  constructor(db: DatabaseManager, config: AlertConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Main detection method - must be implemented by each detector
   */
  abstract detect(entity: Entity, window: TimeWindow): Promise<DetectorResult>;

  /**
   * Compute baseline metrics from historical data
   */
  protected async computeBaseline(
    entity: Entity,
    days: number
  ): Promise<BaselineData> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - this.config.thresholds.current_days);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const metrics = await this.fetchMetrics(
      entity,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    if (metrics.length === 0) {
      return {
        mean: 0,
        stdDev: 0,
        median: 0,
        count: 0,
        min: 0,
        max: 0,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      };
    }

    // Calculate statistics with winsorized mean (exclude top/bottom 5%)
    const sorted = metrics.sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * 0.05);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);

    const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    const variance = trimmed.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / trimmed.length;
    const stdDev = Math.sqrt(variance);
    const median = sorted[Math.floor(sorted.length / 2)];

    return {
      mean,
      stdDev,
      median,
      count: metrics.length,
      min: Math.min(...metrics),
      max: Math.max(...metrics),
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };
  }

  /**
   * Compute current period metrics
   */
  protected async computeCurrent(
    entity: Entity,
    days: number
  ): Promise<CurrentData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const metrics = await this.fetchMetrics(
      entity,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    const value = metrics.length > 0 
      ? metrics.reduce((a, b) => a + b, 0) / metrics.length
      : 0;

    return {
      value,
      count: metrics.length,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };
  }

  /**
   * Fetch metrics from database - override in specific detectors
   */
  protected abstract fetchMetrics(
    entity: Entity,
    startDate: string,
    endDate: string
  ): Promise<number[]>;

  /**
   * Map z-score to severity based on thresholds
   */
  protected mapSeverity(zScore: number, changeRatio?: number): AlertSeverity {
    const bands = this.config.thresholds.severity_bands;
    
    if (changeRatio !== undefined && bands) {
      // Use specific thresholds if available
      if (bands.critical && Math.abs(1 - changeRatio) >= bands.critical) {
        return 'critical';
      }
      if (bands.high && Math.abs(1 - changeRatio) >= bands.high) {
        return 'high';
      }
      if (bands.medium && Math.abs(1 - changeRatio) >= bands.medium) {
        return 'medium';
      }
    }
    
    // Fallback to z-score mapping
    const absZ = Math.abs(zScore);
    if (absZ >= 3) return 'critical';
    if (absZ >= 2.5) return 'high';
    if (absZ >= 1.5) return 'medium';
    return 'low';
  }

  /**
   * Generate deterministic alert ID
   */
  protected generateAlertId(entity: Entity, type: string): string {
    const parts = [
      type,
      entity.type,
      entity.product,
      entity.market || '',
      entity.campaign || '',
      entity.ad_group || '',
      entity.keyword || entity.url || ''
    ].filter(Boolean);
    
    return createHash('md5').update(parts.join(':')).digest('hex').substring(0, 16);
  }

  /**
   * Apply noise control strategies
   */
  protected async applyNoiseControl(
    entity: Entity,
    severity: AlertSeverity
  ): Promise<boolean> {
    const alertId = this.generateAlertId(entity, this.config.type);
    const state = await this.getAlertState(alertId);
    
    // Check consecutive occurrences
    if (this.config.noise_control.strategy === 'consecutive' || 
        this.config.noise_control.strategy === 'both') {
      if (!state || state.consecutive_occurrences < this.config.noise_control.consecutive_checks) {
        await this.incrementConsecutive(alertId, severity);
        logger.debug(`Alert ${alertId} needs ${this.config.noise_control.consecutive_checks} consecutive checks, current: ${state?.consecutive_occurrences || 1}`);
        return false;
      }
    }
    
    // Check cooldown period
    if (this.config.noise_control.strategy === 'cooldown' || 
        this.config.noise_control.strategy === 'both') {
      if (state?.last_seen && this.isWithinCooldown(state.last_seen)) {
        logger.debug(`Alert ${alertId} still in cooldown until ${this.getCooldownEnd(state.last_seen)}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get alert state from database
   */
  protected async getAlertState(alertId: string): Promise<AlertState | null> {
    const db = this.db.getDb();
    const stmt = db.prepare(`
      SELECT * FROM alerts_state 
      WHERE alert_id = ?
    `);
    
    return stmt.get(alertId) as AlertState | null;
  }

  /**
   * Increment consecutive occurrence count
   */
  protected async incrementConsecutive(alertId: string, severity: AlertSeverity): Promise<void> {
    const db = this.db.getDb();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO alerts_state (
        alert_id, status, severity, first_seen, last_seen, consecutive_occurrences
      ) VALUES (?, 'open', ?, ?, ?, 1)
      ON CONFLICT(alert_id) DO UPDATE SET
        consecutive_occurrences = consecutive_occurrences + 1,
        last_seen = ?,
        updated_at = ?
    `);
    
    stmt.run(alertId, severity, now, now, now, now);
  }

  /**
   * Check if alert is within cooldown period
   */
  protected isWithinCooldown(lastSeen: string): boolean {
    const lastSeenTime = new Date(lastSeen).getTime();
    const cooldownMs = this.config.noise_control.cooldown_hours * 60 * 60 * 1000;
    const now = Date.now();
    
    return (now - lastSeenTime) < cooldownMs;
  }

  /**
   * Get cooldown end time
   */
  protected getCooldownEnd(lastSeen: string): string {
    const lastSeenTime = new Date(lastSeen).getTime();
    const cooldownMs = this.config.noise_control.cooldown_hours * 60 * 60 * 1000;
    return new Date(lastSeenTime + cooldownMs).toISOString();
  }

  /**
   * Create alert object
   */
  protected createAlert(
    entity: Entity,
    baseline: BaselineData,
    current: CurrentData,
    severity: AlertSeverity,
    why: string,
    additionalMetrics?: Record<string, any>
  ): Alert {
    const alertId = this.generateAlertId(entity, this.config.type);
    const now = new Date().toISOString();
    
    const changePercentage = baseline.mean > 0 
      ? ((current.value - baseline.mean) / baseline.mean) * 100
      : 0;
    
    const zScore = baseline.stdDev > 0
      ? (current.value - baseline.mean) / baseline.stdDev
      : 0;

    return {
      id: alertId,
      type: this.config.type,
      severity,
      entity,
      window: {
        baseline_days: this.config.thresholds.baseline_days,
        current_days: this.config.thresholds.current_days
      },
      metrics: {
        baseline,
        current,
        change_percentage: changePercentage,
        change_absolute: current.value - baseline.mean,
        z_score: zScore,
        additional: additionalMetrics
      },
      why,
      playbook: `pb_${this.config.type}`,
      detection: {
        first_seen: now,
        last_seen: now,
        occurrences: 1
      }
    };
  }

  /**
   * Update alert state in database
   */
  protected async updateAlertState(alert: Alert): Promise<void> {
    const db = this.db.getDb();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO alerts_state (
        alert_id, status, severity, first_seen, last_seen, 
        consecutive_occurrences, created_at, updated_at
      ) VALUES (?, 'open', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alert_id) DO UPDATE SET
        status = CASE 
          WHEN status = 'closed' THEN 'open'
          ELSE status 
        END,
        severity = ?,
        last_seen = ?,
        consecutive_occurrences = consecutive_occurrences + 1,
        updated_at = ?
    `);
    
    stmt.run(
      alert.id,
      alert.severity,
      alert.detection.first_seen,
      alert.detection.last_seen,
      1,
      now,
      now,
      alert.severity,
      alert.detection.last_seen,
      now
    );
    
    // Log to history
    const historyStmt = db.prepare(`
      INSERT INTO alerts_history (seen_at, alert_id, payload_json)
      VALUES (?, ?, ?)
    `);
    
    historyStmt.run(now, alert.id, JSON.stringify(alert));
  }
}