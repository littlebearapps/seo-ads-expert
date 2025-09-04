import pino from 'pino';
import { z } from 'zod';
import { PlannedChanges } from '../writers/mutation-applier.js';
import { CacheManager } from '../utils/cache.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Validation schemas
export const ValidationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['BUDGET', 'KEYWORD', 'TARGETING', 'STRUCTURE', 'COMPLIANCE', 'PERFORMANCE']),
  severity: z.enum(['WARNING', 'ERROR', 'CRITICAL']),
  enabled: z.boolean().default(true),
  validate: z.function().args(z.any()).returns(z.object({
    passed: z.boolean(),
    message: z.string().optional(),
    data: z.any().optional()
  }))
});

export const ValidationResultSchema = z.object({
  timestamp: z.string(),
  product: z.string(),
  totalRules: z.number(),
  passed: z.number(),
  failed: z.number(),
  warnings: z.array(z.object({
    rule: z.string(),
    message: z.string(),
    category: z.string()
  })),
  errors: z.array(z.object({
    rule: z.string(),
    message: z.string(),
    category: z.string()
  })),
  critical: z.array(z.object({
    rule: z.string(),
    message: z.string(),
    category: z.string()
  })),
  overallStatus: z.enum(['PASSED', 'PASSED_WITH_WARNINGS', 'FAILED', 'BLOCKED']),
  recommendations: z.array(z.string())
});

export type ValidationRule = z.infer<typeof ValidationRuleSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export class AdvancedValidator {
  private rules: Map<string, ValidationRule>;
  private cache: CacheManager;
  private validationHistory: ValidationResult[] = [];

  constructor() {
    this.rules = new Map();
    this.cache = new CacheManager();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default validation rules
   */
  private initializeDefaultRules(): void {
    // Budget validation rules
    this.addRule({
      id: 'budget-daily-limit',
      name: 'Daily Budget Limit',
      description: 'Ensures daily budget does not exceed account limits',
      category: 'BUDGET',
      severity: 'ERROR',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const MAX_DAILY_BUDGET = 10000;
        let totalBudget = 0;
        
        for (const mutation of changes.mutations) {
          if (mutation.budget) {
            totalBudget += mutation.budget;
          }
        }
        
        return {
          passed: totalBudget <= MAX_DAILY_BUDGET,
          message: totalBudget > MAX_DAILY_BUDGET 
            ? `Total daily budget $${totalBudget} exceeds limit of $${MAX_DAILY_BUDGET}`
            : undefined,
          data: { totalBudget, limit: MAX_DAILY_BUDGET }
        };
      }
    });

    this.addRule({
      id: 'budget-sudden-increase',
      name: 'Sudden Budget Increase Detection',
      description: 'Warns about sudden large budget increases',
      category: 'BUDGET',
      severity: 'WARNING',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const INCREASE_THRESHOLD = 5; // 500% increase
        
        for (const mutation of changes.mutations) {
          if (mutation.type === 'UPDATE_BUDGET' && mutation.oldBudget && mutation.budget) {
            const increase = mutation.budget / mutation.oldBudget;
            if (increase > INCREASE_THRESHOLD) {
              return {
                passed: false,
                message: `Budget increase of ${(increase * 100).toFixed(0)}% detected (from $${mutation.oldBudget} to $${mutation.budget})`,
                data: { oldBudget: mutation.oldBudget, newBudget: mutation.budget, increase }
              };
            }
          }
        }
        
        return { passed: true };
      }
    });

    // Keyword validation rules
    this.addRule({
      id: 'keyword-quality-score',
      name: 'Keyword Quality Score',
      description: 'Ensures keywords meet minimum quality standards',
      category: 'KEYWORD',
      severity: 'WARNING',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const MIN_QUALITY_SCORE = 60;
        const lowQualityKeywords: string[] = [];
        
        for (const mutation of changes.mutations) {
          if (mutation.type === 'ADD_KEYWORD' && mutation.keyword) {
            const score = mutation.keyword.score || 0;
            if (score < MIN_QUALITY_SCORE) {
              lowQualityKeywords.push(mutation.keyword.text);
            }
          }
        }
        
        return {
          passed: lowQualityKeywords.length === 0,
          message: lowQualityKeywords.length > 0
            ? `${lowQualityKeywords.length} keywords below quality threshold: ${lowQualityKeywords.slice(0, 5).join(', ')}`
            : undefined,
          data: { lowQualityKeywords, threshold: MIN_QUALITY_SCORE }
        };
      }
    });

    this.addRule({
      id: 'keyword-duplicate-check',
      name: 'Duplicate Keyword Detection',
      description: 'Prevents adding duplicate keywords',
      category: 'KEYWORD',
      severity: 'ERROR',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const keywords = new Set<string>();
        const duplicates: string[] = [];
        
        for (const mutation of changes.mutations) {
          if (mutation.type === 'ADD_KEYWORD' && mutation.keyword) {
            const key = `${mutation.keyword.text}-${mutation.keyword.matchType}`;
            if (keywords.has(key)) {
              duplicates.push(key);
            } else {
              keywords.add(key);
            }
          }
        }
        
        return {
          passed: duplicates.length === 0,
          message: duplicates.length > 0
            ? `Duplicate keywords detected: ${duplicates.join(', ')}`
            : undefined,
          data: { duplicates }
        };
      }
    });

    // Targeting validation rules
    this.addRule({
      id: 'targeting-location-valid',
      name: 'Location Targeting Validation',
      description: 'Ensures location targeting is valid',
      category: 'TARGETING',
      severity: 'ERROR',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const VALID_LOCATIONS = ['AU', 'US', 'GB', 'CA', 'NZ'];
        const invalidLocations: string[] = [];
        
        for (const mutation of changes.mutations) {
          if (mutation.targeting?.locations) {
            for (const location of mutation.targeting.locations) {
              if (!VALID_LOCATIONS.includes(location)) {
                invalidLocations.push(location);
              }
            }
          }
        }
        
        return {
          passed: invalidLocations.length === 0,
          message: invalidLocations.length > 0
            ? `Invalid location codes: ${invalidLocations.join(', ')}`
            : undefined,
          data: { invalidLocations, validLocations: VALID_LOCATIONS }
        };
      }
    });

    this.addRule({
      id: 'targeting-device-consistency',
      name: 'Device Targeting Consistency',
      description: 'Ensures device targeting is consistent',
      category: 'TARGETING',
      severity: 'WARNING',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const deviceModifiers = new Map<string, number[]>();
        
        for (const mutation of changes.mutations) {
          if (mutation.targeting?.deviceModifiers) {
            const campaignId = mutation.campaignId || 'unknown';
            const modifiers = deviceModifiers.get(campaignId) || [];
            modifiers.push(...Object.values(mutation.targeting.deviceModifiers));
            deviceModifiers.set(campaignId, modifiers);
          }
        }
        
        // Check for inconsistent modifiers within same campaign
        const inconsistencies: string[] = [];
        for (const [campaignId, modifiers] of deviceModifiers.entries()) {
          const uniqueModifiers = new Set(modifiers);
          if (uniqueModifiers.size > 1) {
            inconsistencies.push(`Campaign ${campaignId} has inconsistent device modifiers`);
          }
        }
        
        return {
          passed: inconsistencies.length === 0,
          message: inconsistencies.length > 0
            ? inconsistencies.join('; ')
            : undefined,
          data: { deviceModifiers: Array.from(deviceModifiers.entries()) }
        };
      }
    });

    // Structure validation rules
    this.addRule({
      id: 'structure-hierarchy',
      name: 'Campaign Structure Hierarchy',
      description: 'Validates campaign/ad group hierarchy',
      category: 'STRUCTURE',
      severity: 'CRITICAL',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const campaigns = new Set<string>();
        const orphanedAdGroups: string[] = [];
        
        // First pass: collect campaigns
        for (const mutation of changes.mutations) {
          if (mutation.type === 'CREATE_CAMPAIGN') {
            campaigns.add(mutation.campaignId!);
          }
        }
        
        // Second pass: check ad groups have campaigns
        for (const mutation of changes.mutations) {
          if (mutation.type === 'CREATE_AD_GROUP' && mutation.campaignId) {
            if (!campaigns.has(mutation.campaignId)) {
              orphanedAdGroups.push(mutation.adGroupId || 'unknown');
            }
          }
        }
        
        return {
          passed: orphanedAdGroups.length === 0,
          message: orphanedAdGroups.length > 0
            ? `Ad groups without parent campaigns: ${orphanedAdGroups.join(', ')}`
            : undefined,
          data: { orphanedAdGroups }
        };
      }
    });

    // Compliance validation rules
    this.addRule({
      id: 'compliance-prohibited-terms',
      name: 'Prohibited Terms Check',
      description: 'Checks for prohibited advertising terms',
      category: 'COMPLIANCE',
      severity: 'CRITICAL',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const PROHIBITED_TERMS = [
          'guaranteed', 'risk-free', 'no risk', '100%', 'free money',
          'cure', 'miracle', 'instant results'
        ];
        const violations: Array<{ type: string; text: string; term: string }> = [];
        
        for (const mutation of changes.mutations) {
          // Check keywords
          if (mutation.keyword?.text) {
            const lowerText = mutation.keyword.text.toLowerCase();
            for (const term of PROHIBITED_TERMS) {
              if (lowerText.includes(term)) {
                violations.push({ 
                  type: 'keyword', 
                  text: mutation.keyword.text, 
                  term 
                });
              }
            }
          }
          
          // Check ad text
          if (mutation.ad?.headlines) {
            for (const headline of mutation.ad.headlines) {
              const lowerText = headline.toLowerCase();
              for (const term of PROHIBITED_TERMS) {
                if (lowerText.includes(term)) {
                  violations.push({ 
                    type: 'headline', 
                    text: headline, 
                    term 
                  });
                }
              }
            }
          }
        }
        
        return {
          passed: violations.length === 0,
          message: violations.length > 0
            ? `Prohibited terms found: ${violations.map(v => `"${v.term}" in ${v.type}`).join(', ')}`
            : undefined,
          data: { violations }
        };
      }
    });

    // Performance validation rules
    this.addRule({
      id: 'performance-bid-range',
      name: 'Bid Range Validation',
      description: 'Ensures bids are within reasonable ranges',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      enabled: true,
      validate: (changes: PlannedChanges) => {
        const MIN_BID = 0.1;
        const MAX_BID = 50;
        const invalidBids: Array<{ entity: string; bid: number }> = [];
        
        for (const mutation of changes.mutations) {
          if (mutation.bid) {
            if (mutation.bid < MIN_BID || mutation.bid > MAX_BID) {
              invalidBids.push({
                entity: mutation.keyword?.text || mutation.adGroupId || 'unknown',
                bid: mutation.bid
              });
            }
          }
        }
        
        return {
          passed: invalidBids.length === 0,
          message: invalidBids.length > 0
            ? `Bids outside range ($${MIN_BID}-$${MAX_BID}): ${invalidBids.map(b => `${b.entity}: $${b.bid}`).join(', ')}`
            : undefined,
          data: { invalidBids, range: { min: MIN_BID, max: MAX_BID } }
        };
      }
    });
  }

  /**
   * Add a validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
    logger.debug('Added validation rule', { id: rule.id, name: rule.name });
  }

  /**
   * Remove a validation rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    logger.debug('Removed validation rule', { id: ruleId });
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      logger.debug(`Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Validate changes against all rules
   */
  async validate(changes: PlannedChanges): Promise<ValidationResult> {
    logger.info('Running advanced validation', { 
      product: changes.product,
      mutations: changes.mutations.length 
    });

    const result: ValidationResult = {
      timestamp: new Date().toISOString(),
      product: changes.product,
      totalRules: 0,
      passed: 0,
      failed: 0,
      warnings: [],
      errors: [],
      critical: [],
      overallStatus: 'PASSED',
      recommendations: []
    };

    // Run each enabled rule
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      result.totalRules++;
      
      try {
        const ruleResult = await rule.validate(changes);
        
        if (ruleResult.passed) {
          result.passed++;
        } else {
          result.failed++;
          
          const issue = {
            rule: rule.name,
            message: ruleResult.message || `Rule ${rule.name} failed`,
            category: rule.category
          };
          
          switch (rule.severity) {
            case 'WARNING':
              result.warnings.push(issue);
              break;
            case 'ERROR':
              result.errors.push(issue);
              break;
            case 'CRITICAL':
              result.critical.push(issue);
              break;
          }
        }
      } catch (error: any) {
        logger.error(`Error running rule ${rule.id}:`, error);
        result.errors.push({
          rule: rule.name,
          message: `Rule execution failed: ${error.message}`,
          category: rule.category
        });
        result.failed++;
      }
    }

    // Determine overall status
    if (result.critical.length > 0) {
      result.overallStatus = 'BLOCKED';
    } else if (result.errors.length > 0) {
      result.overallStatus = 'FAILED';
    } else if (result.warnings.length > 0) {
      result.overallStatus = 'PASSED_WITH_WARNINGS';
    } else {
      result.overallStatus = 'PASSED';
    }

    // Generate recommendations
    result.recommendations = this.generateRecommendations(result);

    // Store in history
    this.validationHistory.push(result);
    if (this.validationHistory.length > 100) {
      this.validationHistory.shift(); // Keep last 100 validations
    }

    // Cache result
    await this.cache.set(
      `validation-${changes.product}-${Date.now()}`,
      result,
      3600 // 1 hour
    );

    return result;
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(result: ValidationResult): string[] {
    const recommendations: string[] = [];

    // Critical issues
    if (result.critical.length > 0) {
      recommendations.push('🚨 Critical issues must be resolved before proceeding');
      
      // Group by category
      const byCategory = this.groupByCategory(result.critical);
      for (const [category, issues] of Object.entries(byCategory)) {
        recommendations.push(`  • ${category}: ${issues.length} critical issue(s)`);
      }
    }

    // Errors
    if (result.errors.length > 0) {
      recommendations.push('❌ Errors should be fixed to ensure campaign success');
      
      const byCategory = this.groupByCategory(result.errors);
      for (const [category, issues] of Object.entries(byCategory)) {
        if (category === 'BUDGET') {
          recommendations.push('  • Review and adjust budget settings');
        } else if (category === 'KEYWORD') {
          recommendations.push('  • Review keyword selection and quality');
        } else if (category === 'STRUCTURE') {
          recommendations.push('  • Fix campaign structure issues');
        }
      }
    }

    // Warnings
    if (result.warnings.length > 0) {
      recommendations.push('⚠️ Consider addressing warnings for optimal performance');
      
      if (result.warnings.some(w => w.category === 'PERFORMANCE')) {
        recommendations.push('  • Review bid strategies and performance settings');
      }
      if (result.warnings.some(w => w.category === 'TARGETING')) {
        recommendations.push('  • Verify targeting settings are optimal');
      }
    }

    // Success
    if (result.overallStatus === 'PASSED') {
      recommendations.push('✅ All validation checks passed successfully');
    }

    return recommendations;
  }

  /**
   * Group issues by category
   */
  private groupByCategory(issues: Array<{ category: string }>): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const issue of issues) {
      if (!grouped[issue.category]) {
        grouped[issue.category] = [];
      }
      grouped[issue.category].push(issue);
    }
    
    return grouped;
  }

  /**
   * Get validation history
   */
  getValidationHistory(limit = 10): ValidationResult[] {
    return this.validationHistory.slice(-limit);
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: ValidationRule['category']): ValidationRule[] {
    const rules: ValidationRule[] = [];
    
    for (const rule of this.rules.values()) {
      if (rule.category === category) {
        rules.push(rule);
      }
    }
    
    return rules;
  }

  /**
   * Get validation statistics
   */
  getStatistics(): {
    totalRules: number;
    enabledRules: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    recentValidations: number;
    successRate: number;
  } {
    const stats = {
      totalRules: this.rules.size,
      enabledRules: 0,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      recentValidations: this.validationHistory.length,
      successRate: 0
    };

    // Count rules
    for (const rule of this.rules.values()) {
      if (rule.enabled) stats.enabledRules++;
      
      stats.byCategory[rule.category] = (stats.byCategory[rule.category] || 0) + 1;
      stats.bySeverity[rule.severity] = (stats.bySeverity[rule.severity] || 0) + 1;
    }

    // Calculate success rate
    if (this.validationHistory.length > 0) {
      const passed = this.validationHistory.filter(v => 
        v.overallStatus === 'PASSED' || v.overallStatus === 'PASSED_WITH_WARNINGS'
      ).length;
      stats.successRate = (passed / this.validationHistory.length) * 100;
    }

    return stats;
  }

  /**
   * Export validation rules
   */
  exportRules(): Array<Omit<ValidationRule, 'validate'> & { validate: string }> {
    const rules: any[] = [];
    
    for (const rule of this.rules.values()) {
      rules.push({
        ...rule,
        validate: rule.validate.toString() // Convert function to string
      });
    }
    
    return rules;
  }

  /**
   * Import validation rules
   */
  importRules(rules: Array<Omit<ValidationRule, 'validate'> & { validate: string }>): void {
    for (const rule of rules) {
      try {
        // Convert string back to function (be careful with this in production!)
        const validateFunc = eval(`(${rule.validate})`);
        
        this.addRule({
          ...rule,
          validate: validateFunc
        });
      } catch (error) {
        logger.error(`Failed to import rule ${rule.id}:`, error);
      }
    }
  }
}