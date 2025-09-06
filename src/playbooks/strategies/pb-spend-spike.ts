/**
 * Spend Spike/Drop Playbook
 * Remediation strategy for spend anomalies
 */

import { DatabaseManager } from '../../database/database-manager.js';
import { Playbook, PlaybookOptions, Remediation, RemediationStep } from '../types.js';
import type { Alert } from '../../alerts/types.js';

export class SpendSpikePlaybook extends Playbook {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    super('pb_spend_spike', 'spend_spike', 'Control spend through budget and bid adjustments');
    this.db = db;
  }
  
  async execute(alert: Alert, options: PlaybookOptions): Promise<Remediation> {
    const steps: RemediationStep[] = [];
    const isSpike = alert.type === 'spend_spike';
    
    if (isSpike) {
      // For spend spike
      steps.push({
        action: 'review_search_terms',
        params: {
          sort_by: 'cost',
          limit: 20,
          period: 'last_3_days'
        },
        output: 'high-cost-terms.csv',
        status: 'pending'
      });
      
      if (options.allowBidChanges) {
        steps.push({
          action: 'adjust_bids',
          params: {
            change: -0.1,
            target: 'high_cost_keywords'
          },
          status: options.dryRun ? 'pending' : 'applied'
        });
      }
      
      steps.push({
        action: 'set_budget_cap',
        params: {
          daily_limit: alert.metrics.baseline.mean * 1.2
        },
        status: options.dryRun ? 'pending' : 'applied'
      });
    } else {
      // For spend drop
      steps.push({
        action: 'check_budget_limits',
        params: {
          verify_settings: true
        },
        status: 'pending'
      });
      
      steps.push({
        action: 'review_bid_strategy',
        params: {
          check_competitiveness: true
        },
        status: 'pending'
      });
      
      steps.push({
        action: 'check_ad_disapprovals',
        params: {},
        status: 'pending'
      });
    }
    
    return {
      alertId: alert.id,
      playbook: this.id,
      steps,
      guardrailsPassed: true,
      estimatedImpact: {
        cost: isSpike ? -alert.metrics.change_absolute! : 0
      }
    };
  }
}