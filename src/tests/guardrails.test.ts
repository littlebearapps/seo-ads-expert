/**
 * Guardrail System Test Suite
 *
 * Tests for all 5 guardrail rules and safety monitoring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import pino from 'pino';
import {
  GuardrailSystem,
  BudgetCapRule,
  MaxChangePercentRule,
  QualityScoreRule,
  LandingPageHealthRule,
  ClaimsValidationRule,
  SafetyMonitor,
} from '../safety/guardrail-system.js';

const mockLogger = pino({ level: 'silent' });

describe('Guardrail System', () => {
  let database: Database.Database;
  let guardrailSystem: GuardrailSystem;

  beforeEach(() => {
    database = new Database(':memory:');
    guardrailSystem = new GuardrailSystem(database, mockLogger);

    // Create test tables
    database.exec(`
      CREATE TABLE IF NOT EXISTS keyword_quality_daily (
        date TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        quality_score REAL,
        impressions INTEGER,
        PRIMARY KEY (date, campaign_id)
      );

      CREATE TABLE IF NOT EXISTS crawl_pages (
        url TEXT PRIMARY KEY,
        status INTEGER,
        title TEXT,
        meta_description TEXT,
        word_count INTEGER,
        noindex INTEGER DEFAULT 0,
        robots_allowed INTEGER DEFAULT 1,
        canonical_url TEXT
      );

      CREATE TABLE IF NOT EXISTS fact_crawl (
        url TEXT PRIMARY KEY,
        in_links INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ads_landing_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        ad_group_id TEXT,
        landing_page_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, landing_page_url)
      );

      CREATE VIEW IF NOT EXISTS landing_page_health AS
      SELECT
        alp.campaign_id,
        alp.landing_page_url,
        ROUND(
          0.5 * MIN(1.0, COALESCE(cp.word_count, 0) / 800.0) +
          0.25 * CASE WHEN cp.title IS NOT NULL THEN 1.0 ELSE 0.0 END +
          0.25 * CASE WHEN cp.meta_description IS NOT NULL THEN 1.0 ELSE 0.0 END
        , 2) AS content_quality_score,
        ROUND(
          MAX(0.0, MIN(1.0,
            1.0
            - 0.50 * CASE WHEN cp.status != 200 THEN 1.0 ELSE 0.0 END
            - 0.20 * CASE WHEN cp.noindex = 1 THEN 1.0 ELSE 0.0 END
            - 0.10 * CASE WHEN cp.robots_allowed = 0 THEN 1.0 ELSE 0.0 END
            - 0.10 * CASE WHEN cp.canonical_url IS NULL THEN 1.0 ELSE 0.0 END
            - 0.10 * CASE WHEN COALESCE(fc.in_links, 0) = 0 THEN 1.0 ELSE 0.0 END
          ))
        , 2) AS technical_seo_score,
        ROUND(
          (0.5 * MIN(1.0, COALESCE(cp.word_count, 0) / 800.0) +
           0.25 * CASE WHEN cp.title IS NOT NULL THEN 1.0 ELSE 0.0 END +
           0.25 * CASE WHEN cp.meta_description IS NOT NULL THEN 1.0 ELSE 0.0 END +
           MAX(0.0, MIN(1.0,
             1.0
             - 0.50 * CASE WHEN cp.status != 200 THEN 1.0 ELSE 0.0 END
             - 0.20 * CASE WHEN cp.noindex = 1 THEN 1.0 ELSE 0.0 END
             - 0.10 * CASE WHEN cp.robots_allowed = 0 THEN 1.0 ELSE 0.0 END
             - 0.10 * CASE WHEN cp.canonical_url IS NULL THEN 1.0 ELSE 0.0 END
             - 0.10 * CASE WHEN COALESCE(fc.in_links, 0) = 0 THEN 1.0 ELSE 0.0 END
           ))) / 2
        , 2) AS overall_health_score
      FROM ads_landing_pages alp
      LEFT JOIN crawl_pages cp ON cp.url = alp.landing_page_url
      LEFT JOIN fact_crawl fc ON fc.url = alp.landing_page_url;
    `);
  });

  describe('Complete Proposal Validation', () => {
    it('should pass valid proposal', async () => {
      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Test Campaign',
            campaign_id: 'camp_001',
            current: 20,
            proposed: 22,
            reason: 'Good performance',
          },
        ],
        constraints: {
          daily_cap_AUD: 50,
          max_change_pct: 25,
        },
      };

      const result = await guardrailSystem.validateProposal(proposal, {
        constraints: proposal.constraints,
      });

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect multiple violations', async () => {
      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Test Campaign',
            campaign_id: 'camp_001',
            current: 20,
            proposed: 60, // 200% increase
            reason: 'Aggressive scaling',
          },
        ],
        constraints: {
          daily_cap_AUD: 50,
          max_change_pct: 25,
        },
      };

      const result = await guardrailSystem.validateProposal(proposal, {
        constraints: proposal.constraints,
      });

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);

      // Should have budget cap and max change violations
      const ruleViolations = result.violations.map(v => v.rule);
      expect(ruleViolations).toContain('budget_cap');
      expect(ruleViolations).toContain('max_change_percent');
    });
  });

  describe('Budget Cap Rule', () => {
    it('should block proposals exceeding daily cap', async () => {
      const rule = new BudgetCapRule();

      const proposal = {
        proposals: [
          { engine: 'google', campaign: 'C1', campaign_id: 'c1', current: 20, proposed: 30, reason: '' },
          { engine: 'google', campaign: 'C2', campaign_id: 'c2', current: 15, proposed: 25, reason: '' },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, {
        constraints: { daily_cap_AUD: 40 }, // Total proposed is 55, exceeds cap
      });

      expect(result.passed).toBe(false);
      expect(result.violation?.rule).toBe('budget_cap');
      expect(result.violation?.severity).toBe('critical');
    });

    it('should respect multi-currency caps', async () => {
      const rule = new BudgetCapRule();

      const proposal = {
        proposals: [
          { engine: 'google', campaign: 'C1', campaign_id: 'c1', current: 20, proposed: 35, reason: '' },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, {
        constraints: {
          daily_cap_AUD: 50,
          daily_cap_USD: 30, // USD cap is lower
          daily_cap_GBP: 40,
        },
      });

      expect(result.passed).toBe(false);
      expect(result.violation?.rule).toBe('budget_cap_usd');
    });
  });

  describe('Max Change Percent Rule', () => {
    it('should block excessive budget changes', async () => {
      const rule = new MaxChangePercentRule();

      const proposal = {
        proposals: [
          { engine: 'google', campaign: 'C1', campaign_id: 'c1', current: 20, proposed: 30, reason: '' }, // 50% increase
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, {
        constraints: { max_change_pct: 25 },
      });

      expect(result.passed).toBe(false);
      expect(result.violation?.rule).toBe('max_change_percent');
      expect(result.violation?.severity).toBe('high');
    });

    it('should allow changes within limit', async () => {
      const rule = new MaxChangePercentRule();

      const proposal = {
        proposals: [
          { engine: 'google', campaign: 'C1', campaign_id: 'c1', current: 20, proposed: 24, reason: '' }, // 20% increase
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, {
        constraints: { max_change_pct: 25 },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('Quality Score Rule', () => {
    beforeEach(() => {
      // Add test quality score data
      database.prepare(`
        INSERT INTO keyword_quality_daily (date, campaign_id, quality_score, impressions)
        VALUES (date('now'), 'low_qs_campaign', 2.5, 1000)
      `).run();

      database.prepare(`
        INSERT INTO keyword_quality_daily (date, campaign_id, quality_score, impressions)
        VALUES (date('now'), 'high_qs_campaign', 8.0, 1000)
      `).run();
    });

    it('should block budget increases for low QS campaigns', async () => {
      const rule = new QualityScoreRule(3);

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Low QS Campaign',
            campaign_id: 'low_qs_campaign',
            current: 20,
            proposed: 30, // Increase
            reason: '',
          },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, { db: database });

      expect(result.passed).toBe(false);
      expect(result.violation?.rule).toBe('quality_score_min');
      expect(result.violation?.severity).toBe('critical');
    });

    it('should allow increases for high QS campaigns', async () => {
      const rule = new QualityScoreRule(3);

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'High QS Campaign',
            campaign_id: 'high_qs_campaign',
            current: 20,
            proposed: 30,
            reason: '',
          },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, { db: database });

      expect(result.passed).toBe(true);
    });
  });

  describe('Landing Page Health Rule', () => {
    beforeEach(() => {
      // Add landing page data
      database.prepare(`
        INSERT INTO ads_landing_pages (campaign_id, landing_page_url)
        VALUES ('unhealthy_campaign', 'https://example.com/bad')
      `).run();

      database.prepare(`
        INSERT INTO crawl_pages (url, status, title, meta_description, word_count, noindex, robots_allowed, canonical_url)
        VALUES ('https://example.com/bad', 404, NULL, NULL, 100, 1, 0, NULL)
      `).run();

      database.prepare(`
        INSERT INTO ads_landing_pages (campaign_id, landing_page_url)
        VALUES ('healthy_campaign', 'https://example.com/good')
      `).run();

      database.prepare(`
        INSERT INTO crawl_pages (url, status, title, meta_description, word_count, noindex, robots_allowed, canonical_url)
        VALUES ('https://example.com/good', 200, 'Good Page', 'Great description', 1000, 0, 1, 'https://example.com/good')
      `).run();

      database.prepare(`
        INSERT INTO fact_crawl (url, in_links)
        VALUES ('https://example.com/good', 10)
      `).run();
    });

    it('should block increases for unhealthy landing pages', async () => {
      const rule = new LandingPageHealthRule(0.6);

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Unhealthy Campaign',
            campaign_id: 'unhealthy_campaign',
            current: 20,
            proposed: 30,
            reason: '',
          },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, { db: database });

      expect(result.passed).toBe(false);
      expect(result.violation?.rule).toBe('landing_page_health_min');
      expect(result.violation?.severity).toBe('critical');
    });

    it('should allow increases for healthy landing pages', async () => {
      const rule = new LandingPageHealthRule(0.6);

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Healthy Campaign',
            campaign_id: 'healthy_campaign',
            current: 20,
            proposed: 30,
            reason: '',
          },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, { db: database });

      expect(result.passed).toBe(true);
    });
  });

  describe('Claims Validation Rule', () => {
    it('should block increases when claims validation is missing', async () => {
      const rule = new ClaimsValidationRule();

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Unvalidated Campaign',
            campaign_id: 'unvalidated_campaign',
            current: 20,
            proposed: 30,
            reason: '',
          },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, {
        claims: {
          required: true,
          validCampaignIds: new Set(['other_campaign']),
        },
      });

      expect(result.passed).toBe(false);
      expect(result.violation?.rule).toBe('claims_validation');
      expect(result.violation?.severity).toBe('critical');
    });

    it('should block when claims validation is expired', async () => {
      const rule = new ClaimsValidationRule();

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Validated Campaign',
            campaign_id: 'validated_campaign',
            current: 20,
            proposed: 30,
            reason: '',
          },
        ],
        constraints: {},
      };

      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      const result = await rule.validate(proposal, {
        claims: {
          required: true,
          lastValidatedAt: thirtyOneDaysAgo.toISOString(),
          validCampaignIds: new Set(['validated_campaign']),
          maxAgeDays: 30,
        },
      });

      expect(result.passed).toBe(false);
      expect(result.violation?.message).toContain('expired');
    });

    it('should allow when claims are valid and current', async () => {
      const rule = new ClaimsValidationRule();

      const proposal = {
        proposals: [
          {
            engine: 'google',
            campaign: 'Validated Campaign',
            campaign_id: 'validated_campaign',
            current: 20,
            proposed: 30,
            reason: '',
          },
        ],
        constraints: {},
      };

      const result = await rule.validate(proposal, {
        claims: {
          required: true,
          lastValidatedAt: new Date().toISOString(),
          validCampaignIds: new Set(['validated_campaign']),
          maxAgeDays: 30,
        },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('Safety Monitor', () => {
    let safetyMonitor: SafetyMonitor;

    beforeEach(() => {
      safetyMonitor = new SafetyMonitor(database, mockLogger);

      // Add test data
      database.exec(`
        CREATE TABLE IF NOT EXISTS fact_channel_spend (
          date TEXT NOT NULL,
          engine TEXT NOT NULL,
          campaign_id TEXT NOT NULL,
          clicks INTEGER DEFAULT 0,
          cost NUMERIC DEFAULT 0,
          conversions INTEGER DEFAULT 0,
          PRIMARY KEY (date, engine, campaign_id)
        );
      `);

      database.prepare(`
        INSERT INTO fact_channel_spend (date, engine, campaign_id, clicks, cost, conversions)
        VALUES (date('now'), 'google', 'test_campaign', 100, 50, 0)
      `).run();
    });

    it('should identify unsafe campaigns', async () => {
      const result = await safetyMonitor.isSafeToOptimize('test_campaign');

      // Campaign with 0 conversions and 100 clicks should be unsafe
      expect(result.safe).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
      // Check for zero conversion rate message
      expect(result.reasons[0]).toContain('Zero conversion rate');
    });

    it('should get guardrail status', async () => {
      // Create validation log table
      database.exec(`
        CREATE TABLE IF NOT EXISTS guardrail_validations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          proposal_hash TEXT NOT NULL,
          passed INTEGER NOT NULL,
          violation_count INTEGER NOT NULL,
          can_override INTEGER NOT NULL,
          violations_json TEXT,
          proposal_json TEXT
        );
      `);

      // Add test validation
      database.prepare(`
        INSERT INTO guardrail_validations
        (proposal_hash, passed, violation_count, can_override, violations_json, proposal_json)
        VALUES ('test_hash', 0, 2, 1, '[]', '{}')
      `).run();

      const status = await safetyMonitor.getGuardrailStatus();

      expect(status.status).toBe('active');
      expect(status.last24h).toBeDefined();
    });
  });
});