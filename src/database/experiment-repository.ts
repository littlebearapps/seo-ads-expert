/**
 * Experiment Repository - Database operations for A/B testing framework
 * Handles CRUD operations for experiments, variants, and metrics
 */

import { databaseManager } from './database-manager.js';
import { logger } from '../utils/logger.js';
import type { 
  Experiment, 
  RSAVariant, 
  PageVariant, 
  ExperimentGuard 
} from '../experiments/experiment-manager.js';

export interface ExperimentRow {
  test_id: string;
  type: 'rsa' | 'landing_page';
  product: string;
  ad_group_id?: string;
  page_id?: string;
  start_at?: string;
  end_at?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  target_metric: 'ctr' | 'cvr' | 'cws_click_rate';
  min_sample_size: number;
  confidence_level: number;
  baseline_data_source?: string;
  waste_insights_used?: string; // JSON string
  qs_insights_used?: string; // JSON string
  hypothesis?: string;
  description?: string;
  success_criteria?: string;
  created_by?: string;
  winner_variant_id?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VariantRow {
  test_id: string;
  variant_id: string;
  variant_name: string;
  label?: string;
  copy_hash?: string;
  headlines?: string; // JSON string
  descriptions?: string; // JSON string
  final_urls?: string; // JSON string
  lp_path?: string;
  content_changes?: string; // JSON string
  routing_rules?: string; // JSON string
  is_control: boolean;
  weight: number;
  metadata?: string; // JSON string
  similarity_score?: number;
  created_at?: string;
}

export interface MetricRow {
  date: string;
  test_id: string;
  variant_id: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversion_value: number;
  view_through_conversions: number;
  sessions: number;
  page_views: number;
  bounce_rate?: number;
  avg_session_duration?: number;
  goal_completions: number;
  goal_value: number;
  cws_clicks: number;
  cws_impressions: number;
  data_source?: string;
  data_quality_score: number;
  has_anomaly: boolean;
  created_at?: string;
}

export interface ConversionRow {
  conversion_id: string;
  test_id: string;
  variant_id: string;
  assignment_id?: string;
  conversion_type: string;
  conversion_value: number;
  conversion_at: string;
  exposure_to_conversion_minutes?: number;
  attribution_model: string;
  event_data?: string; // JSON string
  revenue?: number;
  quantity: number;
  traffic_source?: string;
  campaign_id?: string;
  ad_group_id?: string;
  keyword?: string;
  created_at?: string;
}

export class ExperimentRepository {
  constructor() {}

  /**
   * Save experiment to database
   */
  async saveExperiment(experiment: Experiment): Promise<void> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    databaseManager.transaction(() => {
      // Insert/update main experiment record
      databaseManager.run(`
        INSERT OR REPLACE INTO fact_ab_tests (
          test_id, type, product, ad_group_id, page_id, start_at, end_at,
          status, target_metric, min_sample_size, confidence_level,
          baseline_data_source, waste_insights_used, qs_insights_used,
          hypothesis, description, success_criteria, created_by,
          winner_variant_id, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        experiment.id,
        experiment.type,
        experiment.product,
        experiment.targetId.startsWith('ag_') ? experiment.targetId : null,
        experiment.targetId.startsWith('/') ? experiment.targetId : null,
        experiment.startDate.toISOString(),
        experiment.endDate?.toISOString(),
        experiment.status,
        experiment.targetMetric,
        experiment.minimumSampleSize,
        experiment.confidenceLevel,
        experiment.metadata.v14InsightsUsed ? 'v1.4_baseline' : null,
        experiment.metadata.v14InsightsUsed ? JSON.stringify(experiment.metadata.v14InsightsUsed) : null,
        null, // QS insights placeholder
        experiment.metadata.hypothesis,
        experiment.metadata.description,
        experiment.metadata.successCriteria,
        experiment.metadata.createdBy,
        (experiment.metadata as any).winner,
        (experiment.metadata as any).completedAt,
        new Date().toISOString()
      ]);

      // Save variants
      for (const variant of experiment.variants) {
        this.saveVariant(experiment.id, variant);
      }

      // Save guards
      for (const guard of experiment.guards) {
        this.saveGuard(experiment.id, guard);
      }
    });

    logger.info(`✅ Saved experiment ${experiment.id} to database`);
  }

  /**
   * Save variant to database
   */
  private saveVariant(testId: string, variant: RSAVariant | PageVariant): void {
    const isRSA = 'headlines' in variant;

    databaseManager.run(`
      INSERT OR REPLACE INTO fact_ab_variants (
        test_id, variant_id, variant_name, label, copy_hash,
        headlines, descriptions, final_urls, lp_path, content_changes, routing_rules,
        is_control, weight, metadata, similarity_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      testId,
      variant.id,
      variant.name,
      isRSA ? (variant as RSAVariant).labels?.[0] : null,
      null, // Copy hash to be calculated
      isRSA ? JSON.stringify((variant as RSAVariant).headlines) : null,
      isRSA ? JSON.stringify((variant as RSAVariant).descriptions) : null,
      isRSA ? JSON.stringify((variant as RSAVariant).finalUrls) : null,
      !isRSA ? (variant as PageVariant).contentPath : null,
      !isRSA ? JSON.stringify({ path: (variant as PageVariant).contentPath }) : null,
      !isRSA ? JSON.stringify((variant as PageVariant).routingRules) : null,
      variant.isControl ? 1 : 0,  // Convert boolean to int
      variant.weight,
      JSON.stringify(variant.metadata),
      null // Similarity score to be calculated
    ]);
  }

  /**
   * Save guard to database
   */
  private saveGuard(testId: string, guard: ExperimentGuard): void {
    databaseManager.run(`
      INSERT OR REPLACE INTO fact_ab_guards (
        test_id, guard_type, threshold, message
      ) VALUES (?, ?, ?, ?)
    `, [testId, guard.type, guard.threshold, guard.message]);
  }

  /**
   * Load experiment from database
   */
  async loadExperiment(testId: string): Promise<Experiment | null> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    // Special case for initialization check
    if (testId === '_init_') {
      // Just verify database is working
      return null;
    }

    // Load main experiment record
    const experimentRow = databaseManager.get<ExperimentRow>(`
      SELECT * FROM fact_ab_tests WHERE test_id = ?
    `, [testId]);

    if (!experimentRow) {
      return null;
    }

    // Load variants
    const variantRows = databaseManager.all<VariantRow>(`
      SELECT * FROM fact_ab_variants WHERE test_id = ? ORDER BY is_control DESC, variant_id
    `, [testId]);

    // Load guards
    const guardRows = databaseManager.all<{
      guard_type: string;
      threshold: number;
      message: string;
    }>(`
      SELECT guard_type, threshold, message FROM fact_ab_guards WHERE test_id = ?
    `, [testId]);

    // Convert to Experiment object
    const experiment: Experiment = {
      id: experimentRow.test_id,
      type: experimentRow.type,
      product: experimentRow.product,
      targetId: experimentRow.ad_group_id || experimentRow.page_id || '',
      variants: variantRows.map(row => this.rowToVariant(row)),
      startDate: new Date(experimentRow.start_at || Date.now()),
      endDate: experimentRow.end_at ? new Date(experimentRow.end_at) : undefined,
      status: experimentRow.status,
      targetMetric: experimentRow.target_metric,
      minimumSampleSize: experimentRow.min_sample_size,
      confidenceLevel: experimentRow.confidence_level,
      guards: guardRows.map(row => ({
        type: row.guard_type as any,
        threshold: row.threshold,
        message: row.message
      })),
      metadata: {
        description: experimentRow.description || '',
        hypothesis: experimentRow.hypothesis || '',
        successCriteria: experimentRow.success_criteria || '',
        createdBy: experimentRow.created_by || 'seo-ads-expert-v1.5',
        v14InsightsUsed: experimentRow.waste_insights_used ? 
          JSON.parse(experimentRow.waste_insights_used) : undefined,
        ...(experimentRow.winner_variant_id && { winner: experimentRow.winner_variant_id }),
        ...(experimentRow.completed_at && { completedAt: experimentRow.completed_at })
      }
    };

    return experiment;
  }

  /**
   * Convert database row to variant object
   */
  private rowToVariant(row: VariantRow): RSAVariant | PageVariant {
    const baseVariant = {
      id: row.variant_id,
      name: row.variant_name,
      isControl: Boolean(row.is_control),  // Convert int to boolean
      weight: row.weight,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };

    if (row.headlines) {
      // RSA variant
      return {
        ...baseVariant,
        headlines: JSON.parse(row.headlines),
        descriptions: JSON.parse(row.descriptions || '[]'),
        finalUrls: JSON.parse(row.final_urls || '[]'),
        labels: row.label ? [row.label] : []
      } as RSAVariant;
    } else {
      // Page variant
      return {
        ...baseVariant,
        contentPath: row.lp_path || '',
        routingRules: row.routing_rules ? JSON.parse(row.routing_rules) : {}
      } as PageVariant;
    }
  }

  /**
   * List experiments with filters
   */
  async listExperiments(filters?: {
    status?: string;
    product?: string;
    type?: string;
  }): Promise<Experiment[]> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    let sql = 'SELECT test_id FROM fact_ab_tests WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.product) {
      sql += ' AND product = ?';
      params.push(filters.product);
    }

    if (filters?.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await databaseManager.all<{ test_id: string }>(sql, params);
    
    const experiments: Experiment[] = [];
    for (const row of rows) {
      const experiment = await this.loadExperiment(row.test_id);
      if (experiment) {
        experiments.push(experiment);
      }
    }

    return experiments;
  }

  /**
   * Save daily metrics for a variant
   */
  async saveMetrics(metrics: Omit<MetricRow, 'created_at'>): Promise<void> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    databaseManager.run(`
      INSERT OR REPLACE INTO fact_ab_metrics (
        date, test_id, variant_id, impressions, clicks, cost, conversions,
        conversion_value, view_through_conversions, sessions, page_views,
        bounce_rate, avg_session_duration, goal_completions, goal_value,
        cws_clicks, cws_impressions, data_source, data_quality_score, has_anomaly
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      metrics.date,
      metrics.test_id,
      metrics.variant_id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost,
      metrics.conversions,
      metrics.conversion_value,
      metrics.view_through_conversions,
      metrics.sessions,
      metrics.page_views,
      metrics.bounce_rate,
      metrics.avg_session_duration,
      metrics.goal_completions,
      metrics.goal_value,
      metrics.cws_clicks,
      metrics.cws_impressions,
      metrics.data_source,
      metrics.data_quality_score,
      metrics.has_anomaly ? 1 : 0  // Convert boolean to int
    ]);

    logger.debug(`✅ Saved metrics for ${metrics.test_id}/${metrics.variant_id} on ${metrics.date}`);
  }

  /**
   * Get metrics for experiment analysis
   */
  async getMetrics(testId: string, dateRange?: { start: Date; end: Date }): Promise<MetricRow[]> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    let sql = 'SELECT * FROM fact_ab_metrics WHERE test_id = ?';
    const params = [testId];

    if (dateRange) {
      sql += ' AND date >= ? AND date <= ?';
      params.push(dateRange.start.toISOString().split('T')[0]);
      params.push(dateRange.end.toISOString().split('T')[0]);
    }

    sql += ' ORDER BY date, variant_id';

    return databaseManager.all<MetricRow>(sql, params);
  }

  /**
   * Record conversion event
   */
  async recordConversion(conversion: Omit<ConversionRow, 'created_at'>): Promise<void> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    databaseManager.run(`
      INSERT INTO fact_ab_conversions (
        conversion_id, test_id, variant_id, assignment_id, conversion_type,
        conversion_value, conversion_at, exposure_to_conversion_minutes,
        attribution_model, event_data, revenue, quantity, traffic_source,
        campaign_id, ad_group_id, keyword
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      conversion.conversion_id,
      conversion.test_id,
      conversion.variant_id,
      conversion.assignment_id,
      conversion.conversion_type,
      conversion.conversion_value,
      conversion.conversion_at,
      conversion.exposure_to_conversion_minutes,
      conversion.attribution_model,
      conversion.event_data,
      conversion.revenue,
      conversion.quantity,
      conversion.traffic_source,
      conversion.campaign_id,
      conversion.ad_group_id,
      conversion.keyword
    ]);

    logger.debug(`✅ Recorded conversion ${conversion.conversion_id} for ${conversion.test_id}`);
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    experiments: number;
    variants: number;
    dailyMetrics: number;
    conversions: number;
    assignments: number;
  }> {
    if (!databaseManager.isInitialized()) {
      await databaseManager.initialize();
    }

    return databaseManager.getStats();
  }
}

// Export singleton instance
export const experimentRepository = new ExperimentRepository();