/**
 * Alert Integration for A/B Testing Framework
 * Connects experiment monitoring with alert detection system
 */

import { logger } from '../utils/logger.js';
import { DatabaseManager } from '../database/database-manager.js';
import { AlertManager } from '../alerts/alert-manager.js';
import { ExperimentManager } from './experiment-manager.js';
import { StatisticalAnalyzer } from './statistical-analyzer.js';
import type { Alert, Entity } from '../alerts/types.js';

export interface ExperimentAlert {
  experimentId: string;
  alertType: 'early_stopping' | 'anomaly' | 'guardrail_breach' | 'winner_found';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  metrics?: {
    control: number;
    variant: number;
    difference: number;
    pValue?: number;
  };
  suggestedAction?: string;
}

export class ExperimentAlertIntegration {
  private alertManager: AlertManager;
  private experimentManager: ExperimentManager;
  private statisticalAnalyzer: StatisticalAnalyzer;
  private db: DatabaseManager;

  constructor(db: DatabaseManager, experimentsDir: string = 'experiments') {
    this.db = db;
    this.alertManager = new AlertManager(db);
    this.experimentManager = new ExperimentManager(experimentsDir);
    this.statisticalAnalyzer = new StatisticalAnalyzer();
  }

  /**
   * Monitor all active experiments for alerts
   */
  async monitorExperiments(product: string): Promise<ExperimentAlert[]> {
    const alerts: ExperimentAlert[] = [];

    try {
      // Get active experiments from database
      const experiments = await this.getActiveExperiments(product);

      logger.info(`Monitoring ${experiments.length} active experiments for ${product}`);

      for (const experiment of experiments) {
        // Check for early stopping conditions
        const earlyStopAlert = await this.checkEarlyStopping(experiment);
        if (earlyStopAlert) {
          alerts.push(earlyStopAlert);
        }

        // Check for anomalies in experiment metrics
        const anomalyAlerts = await this.checkExperimentAnomalies(experiment);
        alerts.push(...anomalyAlerts);

        // Check for guardrail breaches
        const guardrailAlert = await this.checkGuardrails(experiment);
        if (guardrailAlert) {
          alerts.push(guardrailAlert);
        }

        // Check if winner can be declared
        const winnerAlert = await this.checkForWinner(experiment);
        if (winnerAlert) {
          alerts.push(winnerAlert);
        }
      }

      // Store alerts in database
      await this.persistExperimentAlerts(alerts);

    } catch (error) {
      logger.error('Failed to monitor experiments', error);
    }

    return alerts;
  }

  /**
   * Check if experiment should be stopped early
   */
  private async checkEarlyStopping(experiment: any): Promise<ExperimentAlert | null> {
    try {
      // Get current measurements
      const measurements = await this.getMeasurements(experiment.id);

      if (!measurements || measurements.length < 2) {
        return null;
      }

      const control = measurements.find(m => m.variant_id === 'control');
      const variant = measurements.find(m => m.variant_id !== 'control');

      if (!control || !variant) {
        return null;
      }

      // Calculate if variant is significantly worse (harmful test)
      const analysis = this.statisticalAnalyzer.analyze({
        control: {
          conversions: control.conversions,
          samples: control.clicks
        },
        variant: {
          conversions: variant.conversions,
          samples: variant.clicks
        },
        confidenceLevel: 0.95,
        minimumSampleSize: experiment.minimumSampleSize || 1000
      });

      // Stop if variant is significantly worse by more than 20%
      const relativeChange = (variant.conversion_rate - control.conversion_rate) / control.conversion_rate;

      if (analysis.significant && relativeChange < -0.20) {
        return {
          experimentId: experiment.id,
          alertType: 'early_stopping',
          severity: 'critical',
          message: `Experiment ${experiment.name} shows variant performing significantly worse (-${Math.abs(relativeChange * 100).toFixed(1)}%). Consider stopping early.`,
          metrics: {
            control: control.conversion_rate,
            variant: variant.conversion_rate,
            difference: relativeChange,
            pValue: analysis.pValue
          },
          suggestedAction: 'Stop experiment and revert to control'
        };
      }
    } catch (error) {
      logger.error(`Failed to check early stopping for experiment ${experiment.id}`, error);
    }

    return null;
  }

  /**
   * Check for anomalies in experiment metrics
   */
  private async checkExperimentAnomalies(experiment: any): Promise<ExperimentAlert[]> {
    const alerts: ExperimentAlert[] = [];

    try {
      // Check for sudden traffic drops
      const trafficAlert = await this.checkTrafficAnomaly(experiment);
      if (trafficAlert) {
        alerts.push(trafficAlert);
      }

      // Check for conversion rate anomalies
      const conversionAlert = await this.checkConversionAnomaly(experiment);
      if (conversionAlert) {
        alerts.push(conversionAlert);
      }

      // Check for cost anomalies
      const costAlert = await this.checkCostAnomaly(experiment);
      if (costAlert) {
        alerts.push(costAlert);
      }
    } catch (error) {
      logger.error(`Failed to check anomalies for experiment ${experiment.id}`, error);
    }

    return alerts;
  }

  /**
   * Check for traffic anomalies
   */
  private async checkTrafficAnomaly(experiment: any): Promise<ExperimentAlert | null> {
    const db = this.db.getDb();

    const query = `
      SELECT
        date,
        SUM(impressions) as daily_impressions
      FROM experiment_measurements
      WHERE experiment_id = ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 7
    `;

    const results = db.prepare(query).all(experiment.id) as Array<{
      date: string;
      daily_impressions: number;
    }>;

    if (results.length < 3) {
      return null;
    }

    // Calculate average and check for significant drops
    const recentAvg = results.slice(0, 3).reduce((sum, r) => sum + r.daily_impressions, 0) / 3;
    const overallAvg = results.reduce((sum, r) => sum + r.daily_impressions, 0) / results.length;

    if (recentAvg < overallAvg * 0.5) {
      return {
        experimentId: experiment.id,
        alertType: 'anomaly',
        severity: 'high',
        message: `Traffic dropped by ${Math.round((1 - recentAvg/overallAvg) * 100)}% in experiment ${experiment.name}`,
        suggestedAction: 'Check ad serving and budget allocation'
      };
    }

    return null;
  }

  /**
   * Check for conversion rate anomalies
   */
  private async checkConversionAnomaly(experiment: any): Promise<ExperimentAlert | null> {
    const measurements = await this.getMeasurements(experiment.id);

    if (!measurements || measurements.length === 0) {
      return null;
    }

    // Check if any variant has 0 conversions after significant traffic
    for (const measurement of measurements) {
      if (measurement.clicks > 100 && measurement.conversions === 0) {
        return {
          experimentId: experiment.id,
          alertType: 'anomaly',
          severity: 'high',
          message: `Zero conversions detected for variant ${measurement.variant_id} despite ${measurement.clicks} clicks`,
          suggestedAction: 'Check tracking implementation and landing page functionality'
        };
      }
    }

    return null;
  }

  /**
   * Check for cost anomalies
   */
  private async checkCostAnomaly(experiment: any): Promise<ExperimentAlert | null> {
    const measurements = await this.getMeasurements(experiment.id);

    if (!measurements || measurements.length === 0) {
      return null;
    }

    const totalCost = measurements.reduce((sum, m) => sum + m.cost, 0);
    const dailyBudget = experiment.guards?.find(g => g.type === 'budget')?.threshold || 100;
    const daysSinceStart = Math.ceil((Date.now() - new Date(experiment.startDate).getTime()) / (1000 * 60 * 60 * 24));
    const expectedMaxCost = dailyBudget * daysSinceStart;

    if (totalCost > expectedMaxCost * 1.2) {
      return {
        experimentId: experiment.id,
        alertType: 'anomaly',
        severity: 'medium',
        message: `Experiment cost ($${totalCost.toFixed(2)}) exceeds budget by 20%`,
        suggestedAction: 'Review bid strategies and budget allocation'
      };
    }

    return null;
  }

  /**
   * Check for guardrail breaches
   */
  private async checkGuardrails(experiment: any): Promise<ExperimentAlert | null> {
    if (!experiment.guards || experiment.guards.length === 0) {
      return null;
    }

    const measurements = await this.getMeasurements(experiment.id);

    for (const guard of experiment.guards) {
      if (guard.type === 'sample_size') {
        const totalSamples = measurements.reduce((sum, m) => sum + m.clicks, 0);
        if (totalSamples < guard.threshold * 0.1 &&
            Date.now() - new Date(experiment.startDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
          return {
            experimentId: experiment.id,
            alertType: 'guardrail_breach',
            severity: 'medium',
            message: `Sample size (${totalSamples}) is significantly below target (${guard.threshold}) after 7 days`,
            suggestedAction: 'Increase traffic allocation or extend experiment duration'
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if a winner can be declared
   */
  private async checkForWinner(experiment: any): Promise<ExperimentAlert | null> {
    const measurements = await this.getMeasurements(experiment.id);

    if (!measurements || measurements.length < 2) {
      return null;
    }

    const control = measurements.find(m => m.variant_id === 'control');
    const variants = measurements.filter(m => m.variant_id !== 'control');

    if (!control || variants.length === 0) {
      return null;
    }

    for (const variant of variants) {
      const analysis = this.statisticalAnalyzer.analyze({
        control: {
          conversions: control.conversions,
          samples: control.clicks
        },
        variant: {
          conversions: variant.conversions,
          samples: variant.clicks
        },
        confidenceLevel: experiment.confidenceLevel || 0.95,
        minimumSampleSize: experiment.minimumSampleSize || 1000
      });

      if (analysis.significant && analysis.winner) {
        const improvement = ((variant.conversion_rate - control.conversion_rate) / control.conversion_rate * 100).toFixed(1);

        return {
          experimentId: experiment.id,
          alertType: 'winner_found',
          severity: 'low',
          message: `Experiment ${experiment.name} has reached statistical significance. ${analysis.winner === 'variant' ? `Variant shows ${improvement}% improvement` : 'Control performs better'}`,
          metrics: {
            control: control.conversion_rate,
            variant: variant.conversion_rate,
            difference: parseFloat(improvement) / 100,
            pValue: analysis.pValue
          },
          suggestedAction: `Declare ${analysis.winner} as winner and conclude experiment`
        };
      }
    }

    return null;
  }

  /**
   * Persist experiment alerts to database
   */
  private async persistExperimentAlerts(alerts: ExperimentAlert[]): Promise<void> {
    const db = this.db.getDb();

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO experiment_alerts (
        experiment_id,
        alert_type,
        severity,
        message,
        metrics_json,
        suggested_action,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const transaction = db.transaction((alerts: ExperimentAlert[]) => {
      for (const alert of alerts) {
        insertStmt.run(
          alert.experimentId,
          alert.alertType,
          alert.severity,
          alert.message,
          alert.metrics ? JSON.stringify(alert.metrics) : null,
          alert.suggestedAction || null
        );
      }
    });

    transaction(alerts);

    logger.info(`Persisted ${alerts.length} experiment alerts`);
  }

  /**
   * Get recent experiment alerts
   */
  async getExperimentAlerts(
    experimentId?: string,
    limit: number = 50
  ): Promise<ExperimentAlert[]> {
    const db = this.db.getDb();

    let query = `
      SELECT
        experiment_id,
        alert_type,
        severity,
        message,
        metrics_json,
        suggested_action,
        created_at
      FROM experiment_alerts
    `;

    const params: any[] = [];

    if (experimentId) {
      query += ` WHERE experiment_id = ?`;
      params.push(experimentId);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const stmt = db.prepare(query);
    const results = stmt.all(...params) as Array<{
      experiment_id: string;
      alert_type: string;
      severity: string;
      message: string;
      metrics_json?: string;
      suggested_action?: string;
      created_at: string;
    }>;

    return results.map(row => ({
      experimentId: row.experiment_id,
      alertType: row.alert_type as ExperimentAlert['alertType'],
      severity: row.severity as ExperimentAlert['severity'],
      message: row.message,
      metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
      suggestedAction: row.suggested_action
    }));
  }

  /**
   * Create alert entity from experiment
   */
  createExperimentEntity(experiment: any): Entity {
    return {
      id: `experiment:${experiment.id}`,
      type: 'experiment' as any,
      product: experiment.product,
      experiment_id: experiment.id,
      experiment_name: experiment.name
    };
  }

  /**
   * Get active experiments from database
   */
  private async getActiveExperiments(product: string): Promise<any[]> {
    const db = this.db.getDb();

    const stmt = db.prepare(`
      SELECT
        id,
        name,
        type,
        status,
        config_json
      FROM experiments
      WHERE product = ? AND status = 'active'
    `);

    const results = stmt.all(product) as Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      config_json: string;
    }>;

    return results.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      ...JSON.parse(row.config_json || '{}')
    }));
  }

  /**
   * Get measurements for an experiment
   */
  private async getMeasurements(experimentId: string): Promise<any[]> {
    const db = this.db.getDb();

    const stmt = db.prepare(`
      SELECT
        variant_id,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(cost) as cost,
        AVG(conversion_rate) as conversion_rate
      FROM experiment_measurements
      WHERE experiment_id = ?
      GROUP BY variant_id
    `);

    return stmt.all(experimentId) as any[];
  }
}

export const createExperimentAlertIntegration = (db: DatabaseManager, experimentsDir?: string) => {
  return new ExperimentAlertIntegration(db, experimentsDir);
};