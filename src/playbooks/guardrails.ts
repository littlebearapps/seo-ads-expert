/**
 * v1.7 Guardrails System
 * Safety checks and budget caps for remediation actions
 */

import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';
import type { Guardrail, GuardrailResult, RemediationAction } from './types.js';

export class BudgetGuardrail implements Guardrail {
  name = 'Budget Protection';
  critical = true;
  private db: DatabaseManager;
  private maxDailyChange: number;
  
  constructor(db: DatabaseManager, maxDailyChange: number = 0.1) {
    this.db = db;
    this.maxDailyChange = maxDailyChange; // 10% default
  }
  
  async check(action: RemediationAction): Promise<GuardrailResult> {
    // Never exceed 10% of daily budget
    if (action.estimatedCost && action.type === 'increase_budget') {
      const campaign = action.entity?.campaign;
      if (!campaign) {
        return { passed: true };
      }
      
      // Get current campaign budget
      const currentBudget = await this.getCurrentBudget(campaign);
      const maxAllowed = currentBudget * this.maxDailyChange;
      
      if (action.estimatedCost > maxAllowed) {
        return {
          passed: false,
          reason: `Budget increase exceeds ${this.maxDailyChange * 100}% limit ($${maxAllowed.toFixed(2)})`,
          blocker: true,
          suggestions: [`Reduce increase to $${maxAllowed.toFixed(2)} or less`]
        };
      }
    }
    
    // Enforce gradual bid changes
    if (action.type === 'bid_change' && action.change) {
      if (Math.abs(action.change) > 0.2) {
        return {
          passed: false,
          reason: `Bid change ${(action.change * 100).toFixed(0)}% exceeds 20% limit`,
          blocker: false,
          suggestions: [`Apply change in smaller increments`]
        };
      }
    }
    
    return { passed: true };
  }
  
  private async getCurrentBudget(campaign: string): Promise<number> {
    try {
      const db = this.db.getDb();
      const stmt = db.prepare(`
        SELECT MAX(cost) as daily_budget
        FROM fact_search_terms
        WHERE campaign = ?
        GROUP BY date
        ORDER BY date DESC
        LIMIT 7
      `);
      
      const results = stmt.all(campaign) as Array<{ daily_budget: number }>;
      if (results.length > 0) {
        const avgBudget = results.reduce((sum, r) => sum + r.daily_budget, 0) / results.length;
        return avgBudget;
      }
    } catch (error) {
      logger.error('Failed to get campaign budget', error);
    }
    
    return 100; // Default budget if unknown
  }
}

export class LandingPageHealthGuardrail implements Guardrail {
  name = 'Landing Page Health';
  critical = true;
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    this.db = db;
  }
  
  async check(action: RemediationAction): Promise<GuardrailResult> {
    if (!action.targetUrl) {
      return { passed: true };
    }
    
    // Check URL health from database
    const health = await this.checkUrlHealth(action.targetUrl);
    
    if (!health) {
      // No health data available - allow with warning
      return {
        passed: true,
        reason: 'No health data available for URL'
      };
    }
    
    if (health.status_code !== 200) {
      return {
        passed: false,
        reason: `Landing page returns status ${health.status_code}`,
        blocker: true,
        suggestions: ['Fix landing page before applying changes']
      };
    }
    
    if (health.is_noindex) {
      return {
        passed: false,
        reason: 'Landing page has noindex directive',
        blocker: true,
        suggestions: ['Remove noindex from landing page']
      };
    }
    
    if (health.is_soft_404) {
      return {
        passed: false,
        reason: 'Landing page is a soft 404',
        blocker: true,
        suggestions: ['Fix landing page content']
      };
    }
    
    if (health.redirect_chain > 1) {
      return {
        passed: false,
        reason: `Landing page has ${health.redirect_chain} redirects`,
        blocker: false,
        suggestions: ['Reduce redirect chain']
      };
    }
    
    return { passed: true };
  }
  
  private async checkUrlHealth(url: string): Promise<any> {
    try {
      const db = this.db.getDb();
      const stmt = db.prepare(`
        SELECT * FROM fact_url_health
        WHERE url = ?
        ORDER BY check_date DESC
        LIMIT 1
      `);
      
      return stmt.get(url);
    } catch (error) {
      // Table might not exist yet
      logger.debug('URL health check failed', error);
      return null;
    }
  }
}

export class SafetyGuardrail implements Guardrail {
  name = 'Safety Checks';
  critical = false;
  
  async check(action: RemediationAction): Promise<GuardrailResult> {
    // Prevent drastic changes
    if (action.type === 'pause_campaign' || action.type === 'pause_ad_group') {
      return {
        passed: false,
        reason: 'Pausing entities requires manual approval',
        blocker: true,
        suggestions: ['Review performance data before pausing']
      };
    }
    
    // Prevent keyword removal
    if (action.type === 'remove_keyword') {
      return {
        passed: false,
        reason: 'Keyword removal requires manual approval',
        blocker: true,
        suggestions: ['Add as negative keyword instead']
      };
    }
    
    // Allow bid decreases but warn on increases
    if (action.type === 'bid_change' && action.change && action.change > 0) {
      if (action.change > 0.1) {
        return {
          passed: true,
          reason: `Bid increase of ${(action.change * 100).toFixed(0)}% should be monitored`,
          blocker: false,
          suggestions: ['Monitor performance after change']
        };
      }
    }
    
    return { passed: true };
  }
}

export class ComplianceGuardrail implements Guardrail {
  name = 'Compliance';
  critical = false;
  
  async check(action: RemediationAction): Promise<GuardrailResult> {
    // Check for trademark issues in ad copy
    if (action.type === 'create_rsa_variants' && action.params?.headlines) {
      const headlines = action.params.headlines as string[];
      const trademarks = ['Google', 'Microsoft', 'Amazon', 'Apple', 'Facebook'];
      
      for (const headline of headlines) {
        for (const tm of trademarks) {
          if (headline.toLowerCase().includes(tm.toLowerCase())) {
            return {
              passed: false,
              reason: `Potential trademark issue with "${tm}" in ad copy`,
              blocker: false,
              suggestions: ['Review trademark policies', 'Use generic terms']
            };
          }
        }
      }
    }
    
    // Check for prohibited content
    if (action.params?.text) {
      const prohibited = ['guaranteed', '100%', 'risk-free', 'no risk'];
      const text = action.params.text.toLowerCase();
      
      for (const term of prohibited) {
        if (text.includes(term)) {
          return {
            passed: false,
            reason: `Prohibited term "${term}" in content`,
            blocker: true,
            suggestions: ['Remove absolute claims', 'Use compliant language']
          };
        }
      }
    }
    
    return { passed: true };
  }
}

/**
 * Get all default guardrails
 */
export function getDefaultGuardrails(db: DatabaseManager): Guardrail[] {
  return [
    new BudgetGuardrail(db),
    new LandingPageHealthGuardrail(db),
    new SafetyGuardrail(),
    new ComplianceGuardrail()
  ];
}