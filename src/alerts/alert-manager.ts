/**
 * Alert Manager
 * Manages alert state, deduplication, and batch operations
 */

import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { 
  Alert, 
  AlertBatch, 
  AlertStatus, 
  Entity, 
  TimeWindow 
} from './types.js';
import {
  CTRDetector,
  SpendDetector,
  CPCDetector,
  ConversionDetector,
  QualityScoreDetector,
  SERPDriftDetector,
  LPRegressionDetector
} from './detectors/index.js';

export class AlertManager {
  private db: DatabaseManager;
  private detectors: Map<string, any>;
  
  constructor(db: DatabaseManager) {
    this.db = db;
    
    // Initialize all detectors with database connections
    this.detectors = new Map<string, any>([
      ['ctr_drop', new CTRDetector(db)],
      ['spend_spike', new SpendDetector(db, 'spike')],
      ['spend_drop', new SpendDetector(db, 'drop')],
      ['cpc_jump', new CPCDetector(db)],
      ['conversion_drop', new ConversionDetector(db)],
      ['quality_score', new QualityScoreDetector(db)],
      ['serp_drift', new SERPDriftDetector(db)],
      ['lp_regression', new LPRegressionDetector(db)]
    ]);
  }

  /**
   * Run all detectors for a product
   */
  async checkProduct(
    product: string,
    window?: TimeWindow
  ): Promise<AlertBatch> {
    const defaultWindow: TimeWindow = {
      baseline_days: 14,
      current_days: 3
    };
    
    const timeWindow = window || defaultWindow;
    const alerts: Alert[] = [];
    
    // Get all entities for this product
    const entities = await this.getProductEntities(product);
    
    logger.info(`Checking ${entities.length} entities for product ${product}`);
    
    // Run detectors for each entity
    for (const entity of entities) {
      for (const [detectorName, detector] of this.detectors) {
        try {
          const result = await detector.detect(entity, timeWindow);
          
          if (result.triggered && result.alert) {
            alerts.push(result.alert);
            logger.info(`Alert triggered: ${detectorName} for ${entity.id}`);
          }
        } catch (error) {
          logger.error(`Detector ${detectorName} failed for entity ${entity.id}`, error);
        }
      }
    }
    
    // Deduplicate and enrich alerts
    const deduplicated = await this.deduplicateAlerts(alerts);
    
    // Create batch summary
    const batch: AlertBatch = {
      generated_at: new Date().toISOString(),
      product,
      summary: {
        total: deduplicated.length,
        critical: deduplicated.filter(a => a.severity === 'critical').length,
        high: deduplicated.filter(a => a.severity === 'high').length,
        medium: deduplicated.filter(a => a.severity === 'medium').length,
        low: deduplicated.filter(a => a.severity === 'low').length,
        new: await this.countNewAlerts(deduplicated),
        persistent: deduplicated.length - await this.countNewAlerts(deduplicated)
      },
      alerts: deduplicated
    };
    
    return batch;
  }

  /**
   * Get all entities for a product from database
   */
  private async getProductEntities(product: string): Promise<Entity[]> {
    const db = this.db.getDb();
    const entities: Entity[] = [];
    
    // Get campaigns and ad groups
    const campaignQuery = `
      SELECT DISTINCT campaign, ad_group
      FROM fact_search_terms
      WHERE product = ?
        AND date >= date('now', '-30 days')
    `;
    
    const campaigns = db.prepare(campaignQuery).all(product) as Array<{
      campaign: string;
      ad_group: string;
    }>;
    
    // Create entities for campaigns and ad groups
    const uniqueCampaigns = new Set<string>();
    const uniqueAdGroups = new Set<string>();
    
    for (const row of campaigns) {
      uniqueCampaigns.add(row.campaign);
      
      if (row.ad_group) {
        const adGroupId = `${row.campaign}:${row.ad_group}`;
        if (!uniqueAdGroups.has(adGroupId)) {
          uniqueAdGroups.add(adGroupId);
          entities.push({
            id: adGroupId,
            type: 'ad_group',
            product,
            campaign: row.campaign,
            ad_group: row.ad_group
          });
        }
      }
    }
    
    // Add campaign entities
    for (const campaign of uniqueCampaigns) {
      entities.push({
        id: campaign,
        type: 'campaign',
        product,
        campaign
      });
    }
    
    return entities;
  }

  /**
   * Deduplicate alerts based on alert ID
   */
  private async deduplicateAlerts(alerts: Alert[]): Promise<Alert[]> {
    const seen = new Map<string, Alert>();
    
    for (const alert of alerts) {
      if (!seen.has(alert.id) || alert.severity === 'critical') {
        // Critical alerts always take precedence
        seen.set(alert.id, alert);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Count how many alerts are new (not previously seen)
   */
  private async countNewAlerts(alerts: Alert[]): Promise<number> {
    const db = this.db.getDb();
    let newCount = 0;
    
    for (const alert of alerts) {
      const stmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM alerts_history
        WHERE alert_id = ?
          AND seen_at < datetime('now', '-24 hours')
      `);
      
      const result = stmt.get(alert.id) as { count: number };
      
      if (result.count === 0) {
        newCount++;
      }
    }
    
    return newCount;
  }

  /**
   * List alerts with optional filtering
   */
  async listAlerts(
    product?: string,
    status?: AlertStatus
  ): Promise<Alert[]> {
    const db = this.db.getDb();
    
    let query = `
      SELECT 
        ah.payload_json,
        als.status,
        als.snooze_until
      FROM alerts_history ah
      JOIN alerts_state als ON ah.alert_id = als.alert_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (status) {
      query += ` AND als.status = ?`;
      params.push(status);
    }
    
    query += ` ORDER BY ah.seen_at DESC LIMIT 100`;
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params) as Array<{
      payload_json: string;
      status: string;
      snooze_until?: string;
    }>;
    
    const alerts: Alert[] = [];
    
    for (const row of results) {
      try {
        const alert = JSON.parse(row.payload_json) as Alert;
        
        // Filter by product if specified
        if (product && alert.entity.product !== product) {
          continue;
        }
        
        // Skip snoozed alerts that are still in snooze period
        if (row.status === 'snoozed' && row.snooze_until) {
          const snoozeEnd = new Date(row.snooze_until);
          if (snoozeEnd > new Date()) {
            continue;
          }
        }
        
        alerts.push(alert);
      } catch (error) {
        logger.error('Failed to parse alert payload', error);
      }
    }
    
    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, notes?: string): Promise<void> {
    const db = this.db.getDb();
    
    const stmt = db.prepare(`
      UPDATE alerts_state
      SET status = 'ack',
          notes = ?,
          updated_at = datetime('now')
      WHERE alert_id = ?
    `);
    
    stmt.run(notes || null, alertId);
    
    logger.info(`Alert ${alertId} acknowledged`);
  }

  /**
   * Snooze an alert
   */
  async snoozeAlert(alertId: string, until: string): Promise<void> {
    const db = this.db.getDb();
    
    const stmt = db.prepare(`
      UPDATE alerts_state
      SET status = 'snoozed',
          snooze_until = ?,
          updated_at = datetime('now')
      WHERE alert_id = ?
    `);
    
    stmt.run(until, alertId);
    
    logger.info(`Alert ${alertId} snoozed until ${until}`);
  }

  /**
   * Close an alert
   */
  async closeAlert(alertId: string, notes?: string): Promise<void> {
    const db = this.db.getDb();
    
    const stmt = db.prepare(`
      UPDATE alerts_state
      SET status = 'closed',
          notes = ?,
          updated_at = datetime('now')
      WHERE alert_id = ?
    `);
    
    stmt.run(notes || null, alertId);
    
    logger.info(`Alert ${alertId} closed`);
  }

  /**
   * Write alerts to JSON file
   */
  async writeAlertsJson(
    batch: AlertBatch,
    outputPath: string
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(
      outputPath,
      JSON.stringify(batch, null, 2),
      'utf-8'
    );
    
    logger.info(`Alerts written to ${outputPath}`);
  }

  /**
   * Format alerts for console output
   */
  formatConsoleOutput(batch: AlertBatch): string {
    const lines: string[] = [];
    
    // Header
    lines.push('╔════════════════════════════════════════════════════════════════╗');
    lines.push(`║ ALERTS SUMMARY - ${batch.product.toUpperCase()}${' '.repeat(Math.max(0, 47 - batch.product.length))} ║`);
    lines.push('╟────────────────────────────────────────────────────────────────╢');
    lines.push(`║ ${batch.summary.total} alerts (${batch.summary.critical} critical, ${batch.summary.high} high, ${batch.summary.medium} medium) | ${batch.summary.new} new${' '.repeat(20)} ║`);
    lines.push('╚════════════════════════════════════════════════════════════════╝');
    lines.push('');
    
    // Sort alerts by severity
    const sortedAlerts = [...batch.alerts].sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    // Display each alert
    for (const alert of sortedAlerts.slice(0, 10)) {
      const icon = alert.severity === 'critical' ? '🚨' : 
                   alert.severity === 'high' ? '⚠️' : 
                   '📊';
      
      const type = alert.type.toUpperCase().replace('_', ' ');
      const entity = this.formatEntity(alert.entity);
      
      lines.push(`${icon} ${alert.severity.toUpperCase().padEnd(8)} ${type.padEnd(15)} ${entity}`);
      lines.push(`   ${alert.why}`);
      
      if (alert.suggested_actions && alert.suggested_actions.length > 0) {
        lines.push(`   Action: ${alert.suggested_actions[0].action}`);
      }
      
      lines.push('');
    }
    
    if (batch.alerts.length > 10) {
      lines.push(`... and ${batch.alerts.length - 10} more alerts`);
      lines.push('');
    }
    
    lines.push(`Run 'seo-ads remedy --alert-id <id> --dry-run' to see remediation plans`);
    
    return lines.join('\n');
  }

  private formatEntity(entity: Entity): string {
    if (entity.type === 'campaign') {
      return `Campaign "${entity.campaign}"`;
    } else if (entity.type === 'ad_group') {
      return `AdGroup "${entity.ad_group}"`;
    } else if (entity.type === 'keyword') {
      return `Keyword "${entity.keyword}"`;
    } else if (entity.type === 'url') {
      return `URL "${entity.url}"`;
    }
    return entity.id;
  }

  /**
   * Get detectors map (for testing)
   */
  getDetectors(): Map<string, any> {
    return this.detectors;
  }
}