/**
 * SERP Drift Playbook
 * Remediation strategy for search results page changes
 */

import { DatabaseManager } from '../../database/database-manager.js';
import { Playbook, PlaybookOptions, Remediation, RemediationStep } from '../types.js';
import type { Alert } from '../../alerts/types.js';

export class SERPDriftPlaybook extends Playbook {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    super('pb_serp_drift', 'serp_drift', 'Adapt to SERP feature changes');
    this.db = db;
  }
  
  async execute(alert: Alert, options: PlaybookOptions): Promise<Remediation> {
    const steps: RemediationStep[] = [];
    const features = alert.metrics.additional?.features || {};
    
    // AI Overview appeared
    if (features.ai_overview) {
      steps.push({
        action: 'add_faq_schema',
        params: {
          source: 'top_questions'
        },
        output: 'faq-schema.json',
        status: 'pending'
      });
      
      steps.push({
        action: 'adjust_bids_for_ai',
        params: {
          generic_terms_reduction: 0.2,
          specific_terms_increase: 0.1
        },
        status: options.dryRun ? 'pending' : 'applied'
      });
    }
    
    // Shopping pack appeared
    if (features.shopping) {
      steps.push({
        action: 'pivot_to_commercial_intent',
        params: {
          add_commercial_keywords: true,
          adjust_ad_copy: true
        },
        status: 'pending'
      });
      
      steps.push({
        action: 'consider_shopping_ads',
        params: {
          product_feed: 'recommended'
        },
        status: 'pending'
      });
    }
    
    // New competitor
    if (features.new_top3_domain) {
      steps.push({
        action: 'analyze_competitor',
        params: {
          domain: features.new_top3_domain,
          extract_angles: true
        },
        output: 'competitor-analysis.md',
        status: 'pending'
      });
      
      steps.push({
        action: 'differentiate_positioning',
        params: {
          update_ad_copy: true,
          highlight_unique_value: true
        },
        status: 'pending'
      });
    }
    
    return {
      alertId: alert.id,
      playbook: this.id,
      steps,
      guardrailsPassed: true,
      estimatedImpact: {
        impressions: alert.metrics.current.count * 0.9 // Expect 10% impression loss
      }
    };
  }
}