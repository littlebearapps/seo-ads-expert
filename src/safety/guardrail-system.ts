/**
 * Guardrail System
 *
 * Implements 5 critical safety rules to prevent harmful optimizations:
 * 1. Budget Cap Rule - Prevents exceeding daily budget limits
 * 2. Max Change Percent Rule - Limits dramatic budget changes
 * 3. Quality Score Rule - Blocks increases for poor quality campaigns
 * 4. Landing Page Health Rule - Requires healthy landing pages
 * 5. Claims Validation Rule - Ensures ad claims are validated
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';
import * as crypto from 'crypto';

export interface GuardrailRule {
  validate(proposal: any, context: GuardrailContext): Promise<RuleResult>;
}

export interface GuardrailContext {
  constraints?: any;
  db?: Database.Database;
  claims?: ClaimsConfig;
}

export interface ClaimsConfig {
  required: boolean;
  lastValidatedAt?: string;
  validCampaignIds?: Set<string>;
  maxAgeDays?: number;
}

export interface RuleResult {
  passed: boolean;
  violation?: Violation;
}

export interface Violation {
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  remedy?: string;
}

export interface GuardrailResult {
  passed: boolean;
  violations: Violation[];
  canOverride: boolean;
  auditLog: string;
}

export interface BudgetProposal {
  proposals: Array<{
    engine: string;
    campaign: string;
    campaign_id: string;
    current: number;
    proposed: number;
    reason: string;
  }>;
  constraints?: any;
}

/**
 * Main guardrail system orchestrator
 */
export class GuardrailSystem {
  private readonly rules: GuardrailRule[] = [];

  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {
    // Initialize all 5 guardrail rules
    this.rules = [
      new BudgetCapRule(),
      new MaxChangePercentRule(),
      new QualityScoreRule(3), // QS <= 3 blocks increases
      new LandingPageHealthRule(0.6), // Health < 0.6 blocks increases
      new ClaimsValidationRule(),
    ];
  }

  /**
   * Validate a proposal against all guardrails
   */
  async validateProposal(
    proposal: any,
    context: GuardrailContext
  ): Promise<GuardrailResult> {
    const violations: Violation[] = [];

    // Ensure context has database
    if (!context.db) {
      context.db = this.database;
    }

    // Run all rules
    for (const rule of this.rules) {
      try {
        const result = await rule.validate(proposal, context);
        if (!result.passed && result.violation) {
          violations.push(result.violation);
        }
      } catch (error) {
        this.logger.warn('Guardrail rule failed', {
          rule: rule.constructor.name,
          error
        });
      }
    }

    // Determine if override is possible
    const canOverride = violations.every(v => v.severity !== 'critical');

    // Generate audit log
    const auditLog = this.generateAuditEntry(proposal, violations);

    // Log to database
    await this.logValidation(proposal, violations, canOverride);

    return {
      passed: violations.length === 0,
      violations,
      canOverride,
      auditLog,
    };
  }

  /**
   * Generate audit log entry
   */
  private generateAuditEntry(proposal: any, violations: Violation[]): string {
    const entry = {
      timestamp: new Date().toISOString(),
      proposalHash: this.generateHash(proposal),
      violationCount: violations.length,
      violations: violations.map(v => ({
        rule: v.rule,
        severity: v.severity,
        message: v.message,
      })),
    };

    return JSON.stringify(entry);
  }

  /**
   * Generate hash for proposal
   */
  private generateHash(data: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Log validation to database
   */
  private async logValidation(
    proposal: any,
    violations: Violation[],
    canOverride: boolean
  ): Promise<void> {
    try {
      // Ensure audit log table exists
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS guardrail_validations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          proposal_hash TEXT NOT NULL,
          passed INTEGER NOT NULL,
          violation_count INTEGER NOT NULL,
          can_override INTEGER NOT NULL,
          violations_json TEXT,
          proposal_json TEXT
        )
      `);

      // Insert validation record
      this.database.prepare(`
        INSERT INTO guardrail_validations
        (proposal_hash, passed, violation_count, can_override, violations_json, proposal_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        this.generateHash(proposal),
        violations.length === 0 ? 1 : 0,
        violations.length,
        canOverride ? 1 : 0,
        JSON.stringify(violations),
        JSON.stringify(proposal)
      );
    } catch (error) {
      this.logger.warn('Failed to log guardrail validation', { error });
    }
  }
}

/**
 * Rule 1: Budget Cap Rule
 * Prevents total budget from exceeding daily caps
 */
export class BudgetCapRule implements GuardrailRule {
  async validate(proposal: BudgetProposal, context: GuardrailContext): Promise<RuleResult> {
    if (!proposal.proposals || proposal.proposals.length === 0) {
      return { passed: true };
    }

    // Calculate total proposed budget
    const totalProposed = proposal.proposals.reduce((sum, p) => sum + (p.proposed || 0), 0);

    // Check against caps
    const constraints = context.constraints || proposal.constraints || {};
    const dailyCap = constraints.daily_cap_AUD ||
                    constraints.daily_cap_USD ||
                    constraints.daily_cap_GBP ||
                    Infinity;

    if (totalProposed > dailyCap) {
      return {
        passed: false,
        violation: {
          rule: 'budget_cap',
          severity: 'critical',
          message: `Total budget $${totalProposed.toFixed(2)} exceeds daily cap $${dailyCap.toFixed(2)}`,
          remedy: 'Reduce allocations proportionally or increase daily cap',
        },
      };
    }

    // Check individual currency caps
    if (constraints.daily_cap_AUD && totalProposed > constraints.daily_cap_AUD) {
      return {
        passed: false,
        violation: {
          rule: 'budget_cap_aud',
          severity: 'critical',
          message: `Total budget exceeds AUD daily cap of $${constraints.daily_cap_AUD}`,
          remedy: 'Adjust for AUD market budget limits',
        },
      };
    }

    if (constraints.daily_cap_USD && totalProposed > constraints.daily_cap_USD) {
      return {
        passed: false,
        violation: {
          rule: 'budget_cap_usd',
          severity: 'critical',
          message: `Total budget exceeds USD daily cap of $${constraints.daily_cap_USD}`,
          remedy: 'Adjust for USD market budget limits',
        },
      };
    }

    if (constraints.daily_cap_GBP && totalProposed > constraints.daily_cap_GBP) {
      return {
        passed: false,
        violation: {
          rule: 'budget_cap_gbp',
          severity: 'critical',
          message: `Total budget exceeds GBP daily cap of $${constraints.daily_cap_GBP}`,
          remedy: 'Adjust for GBP market budget limits',
        },
      };
    }

    return { passed: true };
  }
}

/**
 * Rule 2: Max Change Percent Rule
 * Limits budget changes to prevent dramatic swings
 */
export class MaxChangePercentRule implements GuardrailRule {
  async validate(proposal: BudgetProposal, context: GuardrailContext): Promise<RuleResult> {
    const constraints = context.constraints || proposal.constraints || {};
    const maxChangePct = constraints.max_change_pct || constraints.maxChangePercent || 25;

    for (const p of proposal.proposals) {
      if (!p.current || p.current === 0) {
        // Skip new campaigns
        continue;
      }

      const changePct = Math.abs((p.proposed - p.current) / p.current * 100);

      if (changePct > maxChangePct) {
        return {
          passed: false,
          violation: {
            rule: 'max_change_percent',
            severity: 'high',
            message: `Campaign ${p.campaign} change ${changePct.toFixed(1)}% exceeds ${maxChangePct}% limit`,
            remedy: `Cap change at ${maxChangePct}% or apply changes gradually`,
          },
        };
      }
    }

    return { passed: true };
  }
}

/**
 * Rule 3: Quality Score Rule
 * Blocks budget increases for low quality score campaigns
 */
export class QualityScoreRule implements GuardrailRule {
  constructor(private threshold: number = 3) {}

  async validate(proposal: BudgetProposal, context: GuardrailContext): Promise<RuleResult> {
    if (!context.db) {
      // Can't validate without database
      return { passed: true };
    }

    for (const p of proposal.proposals) {
      // Only check campaigns getting budget increases
      const increasing = (p.proposed ?? 0) > (p.current ?? 0);
      if (!increasing) continue;

      // Skip non-Google campaigns
      if (p.engine !== 'google') continue;

      try {
        // Get quality score from database
        const row = context.db.prepare(`
          SELECT
            campaign_id,
            SUM(quality_score * impressions) * 1.0 / NULLIF(SUM(impressions), 0) AS iq_score
          FROM keyword_quality_daily
          WHERE campaign_id = ? AND date >= date('now', '-30 days')
          GROUP BY campaign_id
        `).get(p.campaign_id) as any;

        const qs = row?.iq_score ?? null;

        if (qs !== null && qs <= this.threshold) {
          return {
            passed: false,
            violation: {
              rule: 'quality_score_min',
              severity: 'critical',
              message: `Campaign ${p.campaign} has Quality Score ${qs.toFixed(1)} ≤ ${this.threshold}`,
              remedy: 'Improve ad relevance and landing page experience before increasing budget',
            },
          };
        }
      } catch (error) {
        // Table might not exist, skip validation
        continue;
      }
    }

    return { passed: true };
  }
}

/**
 * Rule 4: Landing Page Health Rule
 * Requires minimum landing page health score
 */
export class LandingPageHealthRule implements GuardrailRule {
  constructor(private minHealth: number = 0.6) {}

  async validate(proposal: BudgetProposal, context: GuardrailContext): Promise<RuleResult> {
    if (!context.db) {
      // Can't validate without database
      return { passed: true };
    }

    for (const p of proposal.proposals) {
      // Only check campaigns getting budget increases
      const increasing = (p.proposed ?? 0) > (p.current ?? 0);
      if (!increasing) continue;

      try {
        // Check landing page health
        const badPages = context.db.prepare(`
          SELECT landing_page_url, overall_health_score
          FROM landing_page_health
          WHERE campaign_id = ?
            AND overall_health_score < ?
          LIMIT 1
        `).get(p.campaign_id, this.minHealth) as any;

        if (badPages) {
          return {
            passed: false,
            violation: {
              rule: 'landing_page_health_min',
              severity: 'critical',
              message: `Landing page health ${badPages.overall_health_score.toFixed(2)} < ${this.minHealth} for ${badPages.landing_page_url}`,
              remedy: 'Fix landing page technical SEO and content issues before increasing budget',
            },
          };
        }
      } catch (error) {
        // View might not exist, skip validation
        continue;
      }
    }

    return { passed: true };
  }
}

/**
 * Rule 5: Claims Validation Rule
 * Ensures ad claims are validated and not expired
 */
export class ClaimsValidationRule implements GuardrailRule {
  async validate(proposal: BudgetProposal, context: GuardrailContext): Promise<RuleResult> {
    const cfg = context.claims;

    // Skip if claims validation not required
    if (!cfg || !cfg.required) {
      return { passed: true };
    }

    const maxAgeDays = cfg.maxAgeDays ?? 30;

    // Check if validation is expired
    const tooOld = cfg.lastValidatedAt
      ? (Date.now() - new Date(cfg.lastValidatedAt).getTime()) / (1000 * 60 * 60 * 24) > maxAgeDays
      : true;

    for (const p of proposal.proposals) {
      // Only check campaigns getting budget increases
      const increasing = (p.proposed ?? 0) > (p.current ?? 0);
      if (!increasing) continue;

      const validSet = cfg.validCampaignIds ?? new Set<string>();
      const isValid = validSet.has(p.campaign_id);

      if (!isValid || tooOld) {
        return {
          passed: false,
          violation: {
            rule: 'claims_validation',
            severity: 'critical',
            message: `Claims validation ${!isValid ? 'missing' : 'expired'} for campaign ${p.campaign} (${p.campaign_id})`,
            remedy: `Run claims validation (max age: ${maxAgeDays} days) before increasing budget`,
          },
        };
      }
    }

    return { passed: true };
  }
}

/**
 * Additional safety utilities
 */
export class SafetyMonitor {
  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Check if a campaign is safe to optimize
   */
  async isSafeToOptimize(campaignId: string): Promise<{ safe: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    try {
      // Check quality score
      const qsRow = this.database.prepare(`
        SELECT
          SUM(quality_score * impressions) * 1.0 / NULLIF(SUM(impressions), 0) AS iq_score
        FROM keyword_quality_daily
        WHERE campaign_id = ? AND date >= date('now', '-30 days')
      `).get(campaignId) as any;

      if (qsRow?.iq_score && qsRow.iq_score <= 3) {
        reasons.push(`Low quality score: ${qsRow.iq_score.toFixed(1)}`);
      }

      // Check landing page health
      const healthRow = this.database.prepare(`
        SELECT MIN(overall_health_score) as min_health
        FROM landing_page_health
        WHERE campaign_id = ?
      `).get(campaignId) as any;

      if (healthRow?.min_health && healthRow.min_health < 0.6) {
        reasons.push(`Poor landing page health: ${healthRow.min_health.toFixed(2)}`);
      }

      // Check recent performance
      const perfRow = this.database.prepare(`
        SELECT
          AVG(conversions * 1.0 / NULLIF(clicks, 0)) as avg_cvr,
          AVG(cost * 1.0 / NULLIF(conversions, 0)) as avg_cpa,
          SUM(conversions) as total_conversions,
          SUM(clicks) as total_clicks
        FROM fact_channel_spend
        WHERE campaign_id = ? AND date >= date('now', '-7 days')
      `).get(campaignId) as any;

      if (perfRow) {
        // Check for zero or very low conversions
        if (perfRow.total_conversions === 0 && perfRow.total_clicks > 0) {
          reasons.push(`Zero conversion rate: 0 conversions from ${perfRow.total_clicks} clicks`);
        } else if (perfRow.avg_cvr !== null && perfRow.avg_cvr < 0.01) {
          reasons.push(`Very low conversion rate: ${(perfRow.avg_cvr * 100).toFixed(2)}%`);
        }

        // Check CPA (will be NULL if no conversions, which is handled above)
        if (perfRow.avg_cpa !== null && perfRow.avg_cpa > 100) {
          reasons.push(`High CPA: $${perfRow.avg_cpa.toFixed(2)}`);
        }
      }
    } catch (error) {
      this.logger.debug('Safety check failed', { error, campaignId });
    }

    return {
      safe: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Get guardrail status summary
   */
  async getGuardrailStatus(): Promise<any> {
    try {
      const last24h = this.database.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(passed) as passed,
          SUM(1 - passed) as failed,
          AVG(violation_count) as avg_violations
        FROM guardrail_validations
        WHERE timestamp >= datetime('now', '-24 hours')
      `).get() as any;

      const topViolations = this.database.prepare(`
        SELECT violations_json
        FROM guardrail_validations
        WHERE passed = 0
          AND timestamp >= datetime('now', '-24 hours')
        ORDER BY timestamp DESC
        LIMIT 10
      `).all() as any[];

      const violationTypes: Record<string, number> = {};
      topViolations.forEach((row) => {
        const violations = JSON.parse(row.violations_json);
        violations.forEach((v: any) => {
          violationTypes[v.rule] = (violationTypes[v.rule] || 0) + 1;
        });
      });

      return {
        last24h,
        topViolationTypes: violationTypes,
        status: last24h?.failed > 0 ? 'active' : 'clear',
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: 'Failed to get guardrail status',
      };
    }
  }
}