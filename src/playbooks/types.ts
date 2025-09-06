/**
 * v1.7 Playbook System Type Definitions
 */

import type { Alert, Entity } from '../alerts/types.js';

export interface PlaybookOptions {
  dryRun: boolean;
  allowBidChanges?: boolean;
  maxBudgetImpact?: number;
  requireApproval?: boolean;
}

export interface PlaybookStep {
  action: string;
  params: Record<string, any>;
  validator?: () => Promise<boolean>;
  output: 'csv' | 'json' | 'ads-script' | 'markdown';
}

export interface RemediationStep {
  action: string;
  artifacts?: any;
  params?: Record<string, any>;
  output?: string;
  status?: 'pending' | 'applied' | 'failed' | 'skipped';
  reason?: string;
}

export interface Remediation {
  alertId: string;
  playbook: string;
  steps: RemediationStep[];
  guardrailsPassed: boolean;
  blockers?: string[];
  artifacts?: Record<string, any>;
  estimatedImpact?: {
    cost?: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
  };
  appliedAt?: string;
}

export interface Guardrail {
  name: string;
  check: (action: RemediationAction) => Promise<GuardrailResult>;
  critical?: boolean; // If true, failure blocks all actions
}

export interface GuardrailResult {
  passed: boolean;
  reason?: string;
  blocker?: boolean;
  suggestions?: string[];
}

export interface RemediationAction {
  type: string;
  entity?: Entity;
  targetUrl?: string;
  estimatedCost?: number;
  change?: number;
  params?: Record<string, any>;
}

export abstract class Playbook {
  id: string;
  alertType: string;
  description: string;
  dryRunDefault: boolean = true;
  
  constructor(id: string, alertType: string, description: string) {
    this.id = id;
    this.alertType = alertType;
    this.description = description;
  }
  
  abstract execute(alert: Alert, options: PlaybookOptions): Promise<Remediation>;
  
  protected async applyGuardrails(
    steps: RemediationStep[], 
    guardrails: Guardrail[]
  ): Promise<{ passed: boolean; blockers: string[] }> {
    const blockers: string[] = [];
    
    for (const step of steps) {
      const action: RemediationAction = {
        type: step.action,
        params: step.params
      };
      
      for (const guardrail of guardrails) {
        const result = await guardrail.check(action);
        if (!result.passed) {
          if (guardrail.critical || result.blocker) {
            blockers.push(`${guardrail.name}: ${result.reason}`);
          }
        }
      }
    }
    
    return {
      passed: blockers.length === 0,
      blockers
    };
  }
}