/**
 * Optimizer Integration Module
 *
 * Integrates Thompson Sampling optimizer with existing database and Google Ads infrastructure.
 */

import Database from 'better-sqlite3';
import { BayesianOptimizer, OptimizerConfig } from '../statistics/bayesian-optimizer.js';
import { GoogleAdsClient } from '../connectors/google-ads-api.js';
import { Logger } from 'pino';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

export interface OptimizationContext {
  database: Database.Database;
  googleAdsClient: GoogleAdsClient | null;
  logger: Logger;
  artifactPath: string;
}

export class OptimizerIntegration {
  private bayesianOptimizer: BayesianOptimizer;
  private artifactPath: string;

  constructor(private context: OptimizationContext) {
    this.bayesianOptimizer = new BayesianOptimizer(
      context.database,
      context.googleAdsClient,
      context.logger
    );

    this.artifactPath = context.artifactPath || 'plans/_optimizer';
    this.ensureArtifactDirectory();
    this.ensureDatabase();
  }

  /**
   * Ensure artifact directory exists
   */
  private ensureArtifactDirectory(): void {
    if (!existsSync(this.artifactPath)) {
      mkdirSync(this.artifactPath, { recursive: true });
    }
  }

  /**
   * Ensure database tables exist
   */
  private ensureDatabase(): void {
    try {
      // Enable WAL mode for concurrent access
      this.context.database.pragma('journal_mode = WAL');
      this.context.database.pragma('synchronous = NORMAL');
      this.context.database.pragma('cache_size = 10000');
      this.context.database.pragma('foreign_keys = ON');

      // Create v2.0 tables if they don't exist
      this.createTablesIfNotExist();
    } catch (error) {
      this.context.logger.warn('Failed to create optimizer tables', { error });
    }
  }

  /**
   * Create v2.0 database tables
   */
  private createTablesIfNotExist(): void {
    const queries = [
      // Thompson Sampling state tracking
      `CREATE TABLE IF NOT EXISTS ts_arms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        arm_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        alpha REAL DEFAULT 1.0,
        beta REAL DEFAULT 1.0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Performance metrics time series
      `CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL
      )`,

      // Optimization recommendations
      `CREATE TABLE IF NOT EXISTS optimization_recommendations (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        recommendation_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        current_value REAL,
        recommended_value REAL,
        expected_improvement REAL,
        confidence_score REAL,
        status TEXT DEFAULT 'pending',
        applied_at DATETIME
      )`,

      // Channel spend fact table
      `CREATE TABLE IF NOT EXISTS fact_channel_spend (
        date TEXT NOT NULL,
        engine TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        ad_group_id TEXT,
        clicks INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        cost NUMERIC DEFAULT 0,
        cws_clicks INTEGER DEFAULT 0,
        first_runs INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        conversion_value NUMERIC DEFAULT 0,
        PRIMARY KEY (date, engine, campaign_id, COALESCE(ad_group_id, ''))
      )`,

      // Optimizer proposals tracking
      `CREATE TABLE IF NOT EXISTS optimizer_proposals (
        run_id TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        applied INTEGER DEFAULT 0,
        applied_at DATETIME,
        applied_by TEXT,
        rollback_at DATETIME,
        rollback_reason TEXT,
        PRIMARY KEY (run_id, type)
      )`,

      // Optimizer audit log
      `CREATE TABLE IF NOT EXISTS optimizer_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event TEXT NOT NULL,
        user TEXT NOT NULL,
        artifact TEXT,
        details_json TEXT,
        hash TEXT NOT NULL
      )`,

      // Landing page mapping
      `CREATE TABLE IF NOT EXISTS ads_landing_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        ad_group_id TEXT,
        landing_page_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, landing_page_url)
      )`,
    ];

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_performance_entity ON performance_metrics(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_performance_time ON performance_metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_channel_spend_date ON fact_channel_spend(date)',
      'CREATE INDEX IF NOT EXISTS idx_channel_spend_campaign ON fact_channel_spend(campaign_id)',
      'CREATE INDEX IF NOT EXISTS idx_proposals_run ON optimizer_proposals(run_id)',
      'CREATE INDEX IF NOT EXISTS idx_proposals_applied ON optimizer_proposals(applied)',
      'CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON optimizer_audit_log(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_ads_landing_campaign ON ads_landing_pages(campaign_id)',
      'CREATE INDEX IF NOT EXISTS idx_ads_landing_url ON ads_landing_pages(landing_page_url)',
    ];

    // Execute table creation
    for (const query of queries) {
      try {
        this.context.database.exec(query);
      } catch (error) {
        this.context.logger.debug(`Table might already exist: ${error}`);
      }
    }

    // Execute index creation
    for (const query of indexes) {
      try {
        this.context.database.exec(query);
      } catch (error) {
        this.context.logger.debug(`Index might already exist: ${error}`);
      }
    }

    // Create landing page health view (integrating with v1.9)
    this.createLandingPageHealthView();
  }

  /**
   * Create landing page health view using v1.9 tables
   */
  private createLandingPageHealthView(): void {
    const viewQuery = `
      DROP VIEW IF EXISTS landing_page_health;

      CREATE VIEW IF NOT EXISTS landing_page_health AS
      SELECT
        alp.campaign_id,
        alp.ad_group_id,
        alp.landing_page_url,
        NULL AS page_speed_score, -- Reserved for future PageSpeed API integration
        -- Content quality score (0-1): word count, title, meta description
        ROUND(
          0.5 * MIN(1.0, COALESCE(cp.word_count, 0) / 800.0) +
          0.25 * CASE WHEN cp.title IS NOT NULL AND LENGTH(TRIM(cp.title)) > 0 THEN 1.0 ELSE 0.0 END +
          0.25 * CASE WHEN cp.meta_description IS NOT NULL AND LENGTH(TRIM(cp.meta_description)) > 0 THEN 1.0 ELSE 0.0 END
        , 2) AS content_quality_score,
        -- Technical SEO score (0-1): status, noindex, robots, canonical, inlinks
        ROUND(
          MAX(0.0, MIN(1.0,
            1.0
            - 0.50 * CASE WHEN cp.status != 200 THEN 1.0 ELSE 0.0 END
            - 0.20 * CASE WHEN cp.noindex = 1 THEN 1.0 ELSE 0.0 END
            - 0.10 * CASE WHEN cp.robots_allowed = 0 THEN 1.0 ELSE 0.0 END
            - 0.10 * CASE WHEN cp.canonical_url IS NULL OR TRIM(cp.canonical_url) = '' THEN 1.0 ELSE 0.0 END
            - 0.10 * CASE WHEN COALESCE(fc.in_links, 0) = 0 THEN 1.0 ELSE 0.0 END
          ))
        , 2) AS technical_seo_score,
        -- Overall health score with fallback when page_speed is NULL
        ROUND(
          0.5 * (
            0.5 * MIN(1.0, COALESCE(cp.word_count, 0) / 800.0) +
            0.25 * CASE WHEN cp.title IS NOT NULL AND LENGTH(TRIM(cp.title)) > 0 THEN 1.0 ELSE 0.0 END +
            0.25 * CASE WHEN cp.meta_description IS NOT NULL AND LENGTH(TRIM(cp.meta_description)) > 0 THEN 1.0 ELSE 0.0 END
          ) +
          0.5 * (
            MAX(0.0, MIN(1.0,
              1.0
              - 0.50 * CASE WHEN cp.status != 200 THEN 1.0 ELSE 0.0 END
              - 0.20 * CASE WHEN cp.noindex = 1 THEN 1.0 ELSE 0.0 END
              - 0.10 * CASE WHEN cp.robots_allowed = 0 THEN 1.0 ELSE 0.0 END
              - 0.10 * CASE WHEN cp.canonical_url IS NULL OR TRIM(cp.canonical_url) = '' THEN 1.0 ELSE 0.0 END
              - 0.10 * CASE WHEN COALESCE(fc.in_links, 0) = 0 THEN 1.0 ELSE 0.0 END
            ))
          )
        , 2) AS overall_health_score
      FROM ads_landing_pages alp
      LEFT JOIN crawl_pages cp ON cp.url = alp.landing_page_url
      LEFT JOIN fact_crawl fc ON fc.url = alp.landing_page_url
    `;

    try {
      this.context.database.exec(viewQuery);
    } catch (error) {
      this.context.logger.debug('Landing page health view might not be creatable (v1.9 tables missing)', { error });
    }
  }

  /**
   * Run budget optimization
   */
  async runOptimization(params: {
    accountId: string;
    objective?: 'maximize_CWS_Clicks' | 'maximize_conversions' | 'maximize_revenue';
    totalBudget?: number;
    constraints?: any;
    timeframe?: number;
  }): Promise<any> {
    const config: OptimizerConfig = {
      accountId: params.accountId,
      objective: params.objective || 'maximize_CWS_Clicks',
      totalBudget: params.totalBudget || this.getDefaultBudget(params.constraints),
      constraints: this.parseConstraints(params.constraints),
      timeframe: params.timeframe || 30,
    };

    try {
      // Generate proposals
      const proposals = await this.bayesianOptimizer.generateProposals({
        accountId: config.accountId,
        objective: config.objective,
        constraints: config.constraints,
      });

      // Save artifact
      const artifactPath = await this.saveArtifact(proposals);

      // Log to audit
      await this.logAudit({
        event: 'OPTIMIZATION_RUN',
        user: 'system',
        artifact: artifactPath,
        details: {
          accountId: config.accountId,
          objective: config.objective,
          totalBudget: config.totalBudget,
          proposalCount: proposals.proposals.length,
        },
      });

      return {
        success: true,
        artifactPath,
        proposals,
      };
    } catch (error) {
      this.context.logger.error('Optimization failed', { error, config });
      throw error;
    }
  }

  /**
   * Get default budget from constraints
   */
  private getDefaultBudget(constraints?: any): number {
    if (!constraints) return 50;

    return constraints.daily_cap_AUD ||
           constraints.daily_cap_USD ||
           constraints.daily_cap_GBP ||
           50;
  }

  /**
   * Parse constraints from CLI/MCP parameters
   */
  private parseConstraints(rawConstraints?: any): any {
    const defaults = {
      minDailyBudget: 2,
      maxDailyBudget: 100,
      riskTolerance: 0.3,
      maxChangePercent: 25,
      explorationFloor: 0.1,
    };

    if (!rawConstraints) return defaults;

    return {
      ...defaults,
      ...rawConstraints,
      min_per_campaign: rawConstraints.min_per_campaign || rawConstraints.minDailyBudget || 2,
    };
  }

  /**
   * Save optimization artifact
   */
  private async saveArtifact(proposals: any): Promise<string> {
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const timestamp = format(new Date(), 'HHmmss');
    const filename = `budget_proposals_${timestamp}.json`;
    const dirPath = join(this.artifactPath, dateStr);
    const filePath = join(dirPath, filename);

    // Ensure directory exists
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    // Save artifact
    writeFileSync(filePath, JSON.stringify(proposals, null, 2));

    // Save to database
    await this.saveProposalToDatabase(proposals, filePath);

    return filePath;
  }

  /**
   * Save proposal to database
   */
  private async saveProposalToDatabase(proposals: any, artifactPath: string): Promise<void> {
    const runId = `run_${Date.now()}`;

    try {
      const stmt = this.context.database.prepare(`
        INSERT INTO optimizer_proposals (run_id, generated_at, type, payload_json)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        runId,
        proposals.generated_at,
        'budget_optimization',
        JSON.stringify(proposals)
      );
    } catch (error) {
      this.context.logger.warn('Failed to save proposal to database', { error });
    }
  }

  /**
   * Log audit entry
   */
  private async logAudit(entry: {
    event: string;
    user: string;
    artifact?: string;
    details?: any;
  }): Promise<void> {
    const hash = this.generateHash(entry);

    try {
      const stmt = this.context.database.prepare(`
        INSERT INTO optimizer_audit_log (event, user, artifact, details_json, hash)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.event,
        entry.user,
        entry.artifact || null,
        JSON.stringify(entry.details || {}),
        hash
      );
    } catch (error) {
      this.context.logger.warn('Failed to log audit entry', { error });
    }
  }

  /**
   * Generate hash for audit entry
   */
  private generateHash(data: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Populate fact_channel_spend from Google Ads API
   */
  async populateChannelSpend(params: {
    accountId: string;
    startDate: string;
    endDate: string;
  }): Promise<void> {
    if (!this.context.googleAdsClient) {
      this.context.logger.warn('Google Ads client not available for channel spend population');
      return;
    }

    try {
      // Campaign-level metrics
      const campaignQuery = `
        SELECT
          segments.date,
          campaign.id,
          metrics.clicks,
          metrics.impressions,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
      `;

      const campaignData = await this.context.googleAdsClient.query(params.accountId, campaignQuery);

      // Insert into fact_channel_spend
      const stmt = this.context.database.prepare(`
        INSERT INTO fact_channel_spend
        (date, engine, campaign_id, clicks, impressions, cost, conversions, conversion_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, engine, campaign_id, '') DO UPDATE SET
          clicks = excluded.clicks,
          impressions = excluded.impressions,
          cost = excluded.cost,
          conversions = excluded.conversions,
          conversion_value = excluded.conversion_value
      `);

      for (const row of campaignData) {
        stmt.run(
          row.segments.date,
          'google',
          row.campaign.id,
          row.metrics.clicks,
          row.metrics.impressions,
          row.metrics.costMicros / 1000000,
          row.metrics.conversions,
          row.metrics.conversionsValue
        );
      }

      this.context.logger.info('Channel spend data populated', {
        accountId: params.accountId,
        rowCount: campaignData.length,
      });
    } catch (error) {
      this.context.logger.error('Failed to populate channel spend', { error, params });
    }
  }

  /**
   * Get optimization history
   */
  async getOptimizationHistory(limit: number = 10): Promise<any[]> {
    try {
      const rows = this.context.database.prepare(`
        SELECT
          run_id,
          generated_at,
          type,
          payload_json,
          applied,
          applied_at
        FROM optimizer_proposals
        ORDER BY generated_at DESC
        LIMIT ?
      `).all(limit);

      return rows.map((row: any) => ({
        runId: row.run_id,
        generatedAt: row.generated_at,
        type: row.type,
        payload: JSON.parse(row.payload_json),
        applied: row.applied === 1,
        appliedAt: row.applied_at,
      }));
    } catch (error) {
      this.context.logger.warn('Failed to get optimization history', { error });
      return [];
    }
  }

  /**
   * Apply optimization proposal
   */
  async applyProposal(runId: string, user: string = 'system'): Promise<any> {
    try {
      // Get proposal from database
      const row = this.context.database.prepare(`
        SELECT payload_json FROM optimizer_proposals
        WHERE run_id = ? AND applied = 0
      `).get(runId) as any;

      if (!row) {
        throw new Error(`Proposal ${runId} not found or already applied`);
      }

      const proposal = JSON.parse(row.payload_json);

      // Apply via Google Ads API (would implement actual mutations here)
      // For now, just mark as applied
      this.context.database.prepare(`
        UPDATE optimizer_proposals
        SET applied = 1, applied_at = CURRENT_TIMESTAMP, applied_by = ?
        WHERE run_id = ?
      `).run(user, runId);

      // Log to audit
      await this.logAudit({
        event: 'PROPOSAL_APPLIED',
        user,
        artifact: runId,
        details: {
          proposalCount: proposal.proposals.length,
          totalBudget: proposal.constraints.daily_cap_AUD || proposal.constraints.daily_cap_USD,
        },
      });

      return {
        success: true,
        message: `Applied ${proposal.proposals.length} budget changes`,
        runId,
      };
    } catch (error) {
      this.context.logger.error('Failed to apply proposal', { error, runId });
      throw error;
    }
  }
}