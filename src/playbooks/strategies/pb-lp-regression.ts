/**
 * Landing Page Regression Playbook
 * Remediation strategy for landing page issues
 */

import { DatabaseManager } from '../../database/database-manager.js';
import { Playbook, PlaybookOptions, Remediation, RemediationStep } from '../types.js';
import type { Alert } from '../../alerts/types.js';

export class LPRegressionPlaybook extends Playbook {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    super('pb_lp_regression', 'lp_regression', 'Fix landing page issues and block traffic');
    this.db = db;
  }
  
  async execute(alert: Alert, options: PlaybookOptions): Promise<Remediation> {
    const steps: RemediationStep[] = [];
    const issue = alert.metrics.additional?.issue || 'unknown';
    
    // CRITICAL: Always block applies first
    steps.push({
      action: 'block_applies',
      params: {
        url: alert.entity.url,
        reason: issue
      },
      status: 'applied', // Always apply immediately
      reason: 'Landing page health check failed'
    });
    
    // Generate fix list based on issue
    const fixes: string[] = [];
    
    if (issue === 'noindex') {
      fixes.push('Remove noindex meta tag');
      fixes.push('Check robots.txt');
    }
    
    if (issue === '404' || issue === '500') {
      fixes.push(`Fix ${issue} error`);
      fixes.push('Restore page or redirect to working page');
    }
    
    if (issue === 'soft_404') {
      fixes.push('Add substantial content');
      fixes.push('Fix thin content issues');
    }
    
    if (issue === 'redirect_chain') {
      fixes.push('Reduce redirect chain to single hop');
      fixes.push('Update ads to final URL');
    }
    
    steps.push({
      action: 'generate_fix_list',
      artifacts: { fixes },
      output: 'lp-fixes.md',
      status: 'applied'
    });
    
    // Pause affected ads
    steps.push({
      action: 'pause_affected_ads',
      params: {
        url: alert.entity.url,
        reason: `LP issue: ${issue}`
      },
      status: options.dryRun ? 'pending' : 'applied'
    });
    
    // Schedule re-validation
    steps.push({
      action: 'schedule_revalidation',
      params: {
        url: alert.entity.url,
        check_after: '24_hours'
      },
      status: 'pending'
    });
    
    return {
      alertId: alert.id,
      playbook: this.id,
      steps,
      guardrailsPassed: true, // LP issues always pass guardrails (they ARE the guardrail)
      blockers: [`Landing page ${issue} - all changes blocked until fixed`],
      estimatedImpact: {
        clicks: 0, // All traffic blocked
        cost: 0 // No spend on broken pages
      }
    };
  }
}