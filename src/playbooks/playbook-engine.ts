/**
 * v1.7 Playbook Engine
 * Orchestrates remediation strategies for alerts
 */

import { DatabaseManager } from '../database/database-manager.js';
import { logger } from '../utils/logger.js';
import { getDefaultGuardrails } from './guardrails.js';
import type { Alert } from '../alerts/types.js';
import type { Playbook, PlaybookOptions, Remediation, Guardrail } from './types.js';

// Import playbook strategies
import { CTRDropPlaybook } from './strategies/pb-ctr-drop.js';
import { CPCJumpPlaybook } from './strategies/pb-cpc-jump.js';
import { SpendSpikePlaybook } from './strategies/pb-spend-spike.js';
import { SERPDriftPlaybook } from './strategies/pb-serp-drift.js';
import { LPRegressionPlaybook } from './strategies/pb-lp-regression.js';

export class PlaybookEngine {
  private db: DatabaseManager;
  private playbooks: Map<string, Playbook>;
  private guardrails: Guardrail[];
  
  constructor(db: DatabaseManager) {
    this.db = db;
    this.guardrails = getDefaultGuardrails(db);
    
    // Initialize playbooks
    this.playbooks = new Map([
      ['pb_ctr_drop', new CTRDropPlaybook(db)],
      ['pb_cpc_jump', new CPCJumpPlaybook(db)],
      ['pb_spend_spike', new SpendSpikePlaybook(db)],
      ['pb_spend_drop', new SpendSpikePlaybook(db)], // Same playbook, different strategy
      ['pb_serp_drift', new SERPDriftPlaybook(db)],
      ['pb_lp_regression', new LPRegressionPlaybook(db)]
    ]);
  }
  
  /**
   * Execute remediation for an alert
   */
  async remediate(
    alert: Alert,
    options: PlaybookOptions = { dryRun: true }
  ): Promise<Remediation> {
    logger.info(`Executing remediation for alert ${alert.id}`, {
      type: alert.type,
      severity: alert.severity,
      dryRun: options.dryRun
    });
    
    // Get appropriate playbook
    const playbookId = alert.playbook || `pb_${alert.type}`;
    const playbook = this.playbooks.get(playbookId);
    
    if (!playbook) {
      logger.warn(`No playbook found for ${playbookId}`);
      return {
        alertId: alert.id,
        playbook: playbookId,
        steps: [],
        guardrailsPassed: false,
        blockers: [`No playbook available for ${alert.type}`]
      };
    }
    
    try {
      // Execute playbook
      const remediation = await playbook.execute(alert, options);
      
      // Apply guardrails
      const guardrailResults = await this.applyGuardrails(remediation);
      remediation.guardrailsPassed = guardrailResults.passed;
      remediation.blockers = guardrailResults.blockers;
      
      // Log to database if not dry-run
      if (!options.dryRun && remediation.guardrailsPassed) {
        await this.logRemediation(remediation);
      }
      
      return remediation;
      
    } catch (error) {
      logger.error(`Playbook execution failed for ${alert.id}`, error);
      return {
        alertId: alert.id,
        playbook: playbookId,
        steps: [],
        guardrailsPassed: false,
        blockers: [`Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
  
  /**
   * Apply guardrails to remediation
   */
  private async applyGuardrails(
    remediation: Remediation
  ): Promise<{ passed: boolean; blockers: string[] }> {
    const blockers: string[] = [];
    
    for (const step of remediation.steps) {
      for (const guardrail of this.guardrails) {
        const result = await guardrail.check({
          type: step.action,
          params: step.params,
          estimatedCost: remediation.estimatedImpact?.cost
        });
        
        if (!result.passed) {
          if (guardrail.critical || result.blocker) {
            blockers.push(`${guardrail.name}: ${result.reason}`);
            step.status = 'skipped';
            step.reason = result.reason;
          }
        }
      }
    }
    
    return {
      passed: blockers.length === 0,
      blockers
    };
  }
  
  /**
   * Log remediation to database
   */
  private async logRemediation(remediation: Remediation): Promise<void> {
    const db = this.db.getDb();
    const stmt = db.prepare(`
      INSERT INTO remediation_log (
        alert_id, playbook_id, actions_json, dry_run, applied_at, result_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      remediation.alertId,
      remediation.playbook,
      JSON.stringify(remediation.steps),
      false,
      new Date().toISOString(),
      JSON.stringify({
        guardrailsPassed: remediation.guardrailsPassed,
        blockers: remediation.blockers,
        estimatedImpact: remediation.estimatedImpact
      })
    );
  }
  
  /**
   * Get available playbooks
   */
  getPlaybooks(): Map<string, Playbook> {
    return this.playbooks;
  }
  
  /**
   * Add custom guardrail
   */
  addGuardrail(guardrail: Guardrail): void {
    this.guardrails.push(guardrail);
  }
  
  /**
   * Generate remediation report
   */
  generateReport(remediation: Remediation): string {
    const lines: string[] = [];
    
    lines.push('📋 Remediation Report');
    lines.push('=' .repeat(50));
    lines.push(`Alert ID: ${remediation.alertId}`);
    lines.push(`Playbook: ${remediation.playbook}`);
    lines.push(`Guardrails: ${remediation.guardrailsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (remediation.blockers && remediation.blockers.length > 0) {
      lines.push('\n🚫 Blockers:');
      remediation.blockers.forEach(b => lines.push(`  • ${b}`));
    }
    
    lines.push('\n📝 Steps:');
    remediation.steps.forEach((step, i) => {
      const status = step.status === 'applied' ? '✅' :
                     step.status === 'failed' ? '❌' :
                     step.status === 'skipped' ? '⏭️' : '⏸️';
      
      lines.push(`${i + 1}. ${status} ${step.action}`);
      
      if (step.params) {
        Object.entries(step.params).forEach(([key, value]) => {
          lines.push(`     ${key}: ${JSON.stringify(value)}`);
        });
      }
      
      if (step.reason) {
        lines.push(`     Reason: ${step.reason}`);
      }
    });
    
    if (remediation.estimatedImpact) {
      lines.push('\n📊 Estimated Impact:');
      const impact = remediation.estimatedImpact;
      if (impact.cost !== undefined) lines.push(`  Cost: $${impact.cost.toFixed(2)}`);
      if (impact.impressions !== undefined) lines.push(`  Impressions: ${impact.impressions.toLocaleString()}`);
      if (impact.clicks !== undefined) lines.push(`  Clicks: ${impact.clicks.toLocaleString()}`);
      if (impact.conversions !== undefined) lines.push(`  Conversions: ${impact.conversions}`);
    }
    
    return lines.join('\n');
  }
}