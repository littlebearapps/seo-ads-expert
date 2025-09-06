/**
 * CPC Jump Playbook
 * Remediation strategy for cost-per-click increases
 */

import { DatabaseManager } from '../../database/database-manager.js';
import { Playbook, PlaybookOptions, Remediation, RemediationStep } from '../types.js';
import type { Alert } from '../../alerts/types.js';

export class CPCJumpPlaybook extends Playbook {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    super('pb_cpc_jump', 'cpc_jump', 'Reduce CPC through bid optimization and negatives');
    this.db = db;
  }
  
  async execute(alert: Alert, options: PlaybookOptions): Promise<Remediation> {
    const steps: RemediationStep[] = [];
    
    // Step 1: Identify waste n-grams
    steps.push({
      action: 'identify_waste_ngrams',
      params: {
        min_cost: 10,
        min_clicks: 5,
        zero_conversion: true
      },
      output: 'waste-analysis.csv',
      status: options.dryRun ? 'pending' : 'applied'
    });
    
    // Step 2: Reduce bids
    if (options.allowBidChanges) {
      steps.push({
        action: 'reduce_bids',
        params: {
          reduction: 0.1,
          apply_cap: true,
          target_cpc: alert.metrics.baseline.mean
        },
        status: options.dryRun ? 'pending' : 'applied'
      });
    }
    
    // Step 3: Add negative keywords
    steps.push({
      action: 'add_negatives_from_waste',
      params: {
        source: 'high_cost_zero_conversion',
        match_type: 'phrase'
      },
      output: 'negatives.csv',
      status: options.dryRun ? 'pending' : 'applied'
    });
    
    // Step 4: Review competitor density
    steps.push({
      action: 'analyze_auction_insights',
      params: {
        check_overlap: true,
        check_position: true
      },
      status: 'pending'
    });
    
    return {
      alertId: alert.id,
      playbook: this.id,
      steps,
      guardrailsPassed: true,
      estimatedImpact: {
        cost: -(alert.metrics.change_absolute || 0) * alert.metrics.current.count
      }
    };
  }
}