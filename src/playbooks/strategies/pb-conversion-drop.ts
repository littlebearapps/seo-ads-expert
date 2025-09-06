/**
 * Conversion Drop Playbook
 * Remediation strategy for conversion rate declines
 */

import { DatabaseManager } from '../../database/database-manager.js';
import { Playbook, PlaybookOptions, Remediation, RemediationStep } from '../types.js';
import type { Alert } from '../../alerts/types.js';

export class ConversionDropPlaybook extends Playbook {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    super('pb_conversion_drop', 'conversion_drop', 'Recover conversion rates through landing page and funnel optimization');
    this.db = db;
  }
  
  async execute(alert: Alert, options: PlaybookOptions): Promise<Remediation> {
    const steps: RemediationStep[] = [];
    
    // Step 1: Landing Page Analysis
    steps.push({
      action: 'analyze_landing_pages',
      params: {
        entity_type: alert.entity.type,
        entity_id: alert.entity.id,
        metrics: ['conversion_rate', 'bounce_rate', 'time_on_page'],
        period: 'last_7_days'
      },
      output: 'landing-page-analysis.csv',
      status: 'pending'
    });
    
    // Step 2: User Flow Analysis  
    steps.push({
      action: 'analyze_conversion_funnel',
      params: {
        steps: ['landing', 'form_start', 'form_complete', 'thank_you'],
        segment_by: alert.entity.type,
        drop_off_threshold: 0.5
      },
      output: 'funnel-analysis.json',
      status: 'pending'
    });
    
    // Step 3: A/B Test Landing Page Variations
    if (options.allowBidChanges) {
      steps.push({
        action: 'create_landing_page_variants',
        params: {
          original_url: alert.entity.url || '/default',
          variants: [
            { name: 'simplified_form', changes: ['reduce_form_fields', 'stronger_cta'] },
            { name: 'social_proof', changes: ['add_testimonials', 'trust_badges'] },
            { name: 'urgency', changes: ['countdown_timer', 'limited_offer'] }
          ],
          traffic_split: 25 // 25% to each variant, 25% to control
        },
        output: 'ab-test-setup.json',
        status: options.dryRun ? 'pending' : 'applied'
      });
    }
    
    // Step 4: Search Terms Analysis
    steps.push({
      action: 'analyze_low_converting_terms',
      params: {
        min_clicks: 20,
        max_conversion_rate: alert.metrics.current.value * 0.5, // Half of current rate
        sort_by: 'cost',
        limit: 20
      },
      output: 'low-converting-terms.csv',
      status: 'pending'
    });
    
    // Step 5: Negative Keywords (if pattern found)
    steps.push({
      action: 'add_negative_keywords',
      params: {
        source: 'low_converting_terms',
        min_cost_threshold: 25,
        conversion_rate_threshold: 0.01
      },
      status: options.dryRun ? 'pending' : 'applied'
    });
    
    // Apply guardrails
    const guardrailCheck = await this.applyGuardrails(steps, []);
    
    return {
      alertId: alert.id,
      playbook: this.id,
      steps,
      guardrailsPassed: guardrailCheck.passed,
      blockers: guardrailCheck.blockers,
      estimatedImpact: {
        conversions: Math.round(alert.metrics.current.count * 0.3), // 30% improvement estimate
        cost: -(alert.metrics.additional?.wasted_spend || 0) * 0.5
      }
    };
  }
}