import pino from 'pino';
import { z } from 'zod';
import { PerformanceMonitor } from './performance.js';
import { BudgetEnforcer } from './budget-enforcer.js';
import axios from 'axios';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Guardrail configuration schemas
export const GuardrailConfigSchema = z.object({
  budgetLimits: z.object({
    dailyMax: z.number().default(10), // A$10 default
    campaignMax: z.number().default(50), // A$50 per campaign
    accountMax: z.number().default(100), // A$100 total account
    enforcementLevel: z.enum(['soft', 'hard']).default('hard')
  }),
  deviceTargeting: z.object({
    allowedDevices: z.array(z.enum(['DESKTOP', 'MOBILE', 'TABLET'])).default(['DESKTOP']),
    enforceRestrictions: z.boolean().default(true)
  }),
  landingPageValidation: z.object({
    checkFor404: z.boolean().default(true),
    checkSSL: z.boolean().default(true),
    checkMobileFriendly: z.boolean().default(true),
    checkLoadTime: z.boolean().default(true),
    maxLoadTimeMs: z.number().default(3000)
  }),
  bidLimits: z.object({
    maxCpcMicros: z.string().default('5000000'), // $5 max CPC
    maxCpmMicros: z.string().default('10000000'), // $10 max CPM
    enforceMaxBids: z.boolean().default(true)
  }),
  negativeKeywords: z.object({
    enforceSharedLists: z.boolean().default(true),
    blockProhibitedTerms: z.boolean().default(true),
    prohibitedTerms: z.array(z.string()).default([
      'free', 'crack', 'hack', 'illegal', 'torrent'
    ])
  })
});

export type GuardrailConfig = z.infer<typeof GuardrailConfigSchema>;

// Mutation schemas
export const MutationSchema = z.object({
  type: z.enum(['CREATE', 'UPDATE', 'PAUSE', 'REMOVE', 'ENABLE']),
  resource: z.enum(['campaign', 'ad_group', 'keyword', 'ad', 'budget']),
  entityId: z.string().optional(),
  customerId: z.string(),
  changes: z.record(z.any()),
  estimatedCost: z.number().optional(),
  affectedEntities: z.array(z.string()).optional()
});

export type Mutation = z.infer<typeof MutationSchema>;

export const GuardrailResultSchema = z.object({
  passed: z.boolean(),
  violations: z.array(z.object({
    type: z.string(),
    severity: z.enum(['warning', 'error', 'critical']),
    message: z.string(),
    field: z.string().optional(),
    suggestedValue: z.any().optional()
  })),
  warnings: z.array(z.string()),
  modifications: z.record(z.any()).optional(),
  estimatedImpact: z.object({
    costIncrease: z.number().optional(),
    impressionChange: z.number().optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional()
  }).optional()
});

export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type HealthCheck = {
  url: string;
  status: number;
  isHealthy: boolean;
  issues: string[];
  metrics: {
    loadTimeMs?: number;
    isSSL?: boolean;
    isMobileFriendly?: boolean;
    has404?: boolean;
  };
};

export type DeviceSettings = {
  targetedDevices: string[];
  bidAdjustments?: Record<string, number>;
};

// Landing page validator
export class LandingPageValidator {
  async checkHealth(urls: string[]): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];
    
    for (const url of urls) {
      const healthCheck: HealthCheck = {
        url,
        status: 0,
        isHealthy: true,
        issues: [],
        metrics: {}
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(url, {
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: () => true // Don't throw on any status
        });
        const loadTime = Date.now() - startTime;

        healthCheck.status = response.status;
        healthCheck.metrics.loadTimeMs = loadTime;

        // Check for 404
        if (response.status === 404) {
          healthCheck.isHealthy = false;
          healthCheck.issues.push('Page not found (404)');
          healthCheck.metrics.has404 = true;
        }

        // Check for other error codes
        if (response.status >= 500) {
          healthCheck.isHealthy = false;
          healthCheck.issues.push(`Server error (${response.status})`);
        }

        // Check SSL
        healthCheck.metrics.isSSL = url.startsWith('https://');
        if (!healthCheck.metrics.isSSL) {
          healthCheck.issues.push('Not using HTTPS');
        }

        // Check load time
        if (loadTime > 3000) {
          healthCheck.issues.push(`Slow load time: ${loadTime}ms`);
          if (loadTime > 5000) {
            healthCheck.isHealthy = false;
          }
        }

        // Simple mobile-friendly check (would need real implementation)
        const html = response.data.toString();
        healthCheck.metrics.isMobileFriendly = 
          html.includes('viewport') || 
          html.includes('mobile') ||
          html.includes('responsive');
        
        if (!healthCheck.metrics.isMobileFriendly) {
          healthCheck.issues.push('May not be mobile-friendly');
        }

      } catch (error: any) {
        healthCheck.isHealthy = false;
        healthCheck.issues.push(`Failed to reach URL: ${error.message}`);
        logger.error(`Landing page check failed for ${url}:`, error);
      }

      results.push(healthCheck);
    }

    return results;
  }
}

// Main mutation guard class
export class MutationGuard extends PerformanceMonitor {
  private config: GuardrailConfig;
  private budgetEnforcer: BudgetEnforcer;
  private landingPageValidator: LandingPageValidator;
  private mutationHistory: Mutation[] = [];

  constructor(config?: Partial<GuardrailConfig>) {
    super();
    this.config = GuardrailConfigSchema.parse(config || {});
    this.budgetEnforcer = new BudgetEnforcer(this.config.budgetLimits);
    this.landingPageValidator = new LandingPageValidator();
  }

  /**
   * Validate a mutation against all guardrails
   */
  async validateMutation(mutation: Mutation): Promise<GuardrailResult> {
    const result: GuardrailResult = {
      passed: true,
      violations: [],
      warnings: [],
      modifications: {},
      estimatedImpact: {
        riskLevel: 'low'
      }
    };

    try {
      // Use circuit breaker for validation
      return await this.executeWithCircuitBreaker(async () => {
        // 1. Budget validation
        await this.validateBudget(mutation, result);
        
        // 2. Landing page validation
        await this.validateLandingPages(mutation, result);
        
        // 3. Device targeting validation
        this.validateDeviceTargeting(mutation, result);
        
        // 4. Bid limit validation
        this.validateBidLimits(mutation, result);
        
        // 5. Negative keyword validation
        this.validateNegativeKeywords(mutation, result);
        
        // 6. Risk assessment
        this.assessRisk(mutation, result);

        // Determine if mutation should be blocked
        const criticalViolations = result.violations.filter(v => v.severity === 'critical');
        const errorViolations = result.violations.filter(v => v.severity === 'error');
        
        if (criticalViolations.length > 0) {
          result.passed = false;
          logger.error('Critical guardrail violations detected', { 
            violations: criticalViolations,
            mutation 
          });
        } else if (errorViolations.length > 0 && this.config.budgetLimits.enforcementLevel === 'hard') {
          result.passed = false;
          logger.warn('Guardrail violations detected in hard enforcement mode', {
            violations: errorViolations,
            mutation
          });
        }

        // Log mutation attempt
        this.mutationHistory.push(mutation);
        
        return result;
      });
    } catch (error) {
      logger.error('Error validating mutation:', error);
      result.passed = false;
      result.violations.push({
        type: 'system_error',
        severity: 'critical',
        message: 'Failed to validate mutation due to system error'
      });
      return result;
    }
  }

  /**
   * Validate budget limits
   */
  private async validateBudget(mutation: Mutation, result: GuardrailResult): Promise<void> {
    const budgetResult = await this.budgetEnforcer.validateBudget(
      mutation.estimatedCost || 0,
      mutation.resource
    );

    if (!budgetResult.allowed) {
      result.violations.push({
        type: 'budget_limit',
        severity: budgetResult.severity as 'warning' | 'error' | 'critical',
        message: budgetResult.reason,
        field: 'budget',
        suggestedValue: budgetResult.suggestedAmount
      });
    }

    if (budgetResult.warnings.length > 0) {
      result.warnings.push(...budgetResult.warnings);
    }

    // Add budget impact to estimated impact
    if (mutation.estimatedCost) {
      result.estimatedImpact!.costIncrease = mutation.estimatedCost;
    }
  }

  /**
   * Validate landing pages
   */
  private async validateLandingPages(mutation: Mutation, result: GuardrailResult): Promise<void> {
    if (!this.config.landingPageValidation.checkFor404) {
      return;
    }

    // Extract URLs from mutation
    const urls = this.extractUrls(mutation);
    if (urls.length === 0) {
      return;
    }

    const healthChecks = await this.landingPageValidator.checkHealth(urls);
    
    for (const check of healthChecks) {
      if (!check.isHealthy) {
        result.violations.push({
          type: 'landing_page_health',
          severity: check.metrics.has404 ? 'critical' : 'error',
          message: `Landing page issues for ${check.url}: ${check.issues.join(', ')}`,
          field: 'finalUrls'
        });
      } else if (check.issues.length > 0) {
        result.warnings.push(
          `Landing page warnings for ${check.url}: ${check.issues.join(', ')}`
        );
      }
    }
  }

  /**
   * Validate device targeting
   */
  private validateDeviceTargeting(mutation: Mutation, result: GuardrailResult): void {
    if (!this.config.deviceTargeting.enforceRestrictions) {
      return;
    }

    const deviceSettings = mutation.changes.deviceTargeting as DeviceSettings;
    if (!deviceSettings) {
      return;
    }

    const allowedDevices = this.config.deviceTargeting.allowedDevices;
    const targetedDevices = deviceSettings.targetedDevices || [];
    
    const disallowedDevices = targetedDevices.filter(
      device => !allowedDevices.includes(device as any)
    );

    if (disallowedDevices.length > 0) {
      result.violations.push({
        type: 'device_targeting',
        severity: 'error',
        message: `Targeting disallowed devices: ${disallowedDevices.join(', ')}`,
        field: 'deviceTargeting',
        suggestedValue: { targetedDevices: allowedDevices }
      });

      // Apply modification if needed
      result.modifications!.deviceTargeting = {
        targetedDevices: allowedDevices
      };
    }
  }

  /**
   * Validate bid limits
   */
  private validateBidLimits(mutation: Mutation, result: GuardrailResult): void {
    if (!this.config.bidLimits.enforceMaxBids) {
      return;
    }

    const maxCpc = BigInt(this.config.bidLimits.maxCpcMicros);
    const maxCpm = BigInt(this.config.bidLimits.maxCpmMicros);

    // Check CPC bid
    const cpcBid = mutation.changes.cpcBidMicros as string;
    if (cpcBid && BigInt(cpcBid) > maxCpc) {
      result.violations.push({
        type: 'bid_limit',
        severity: 'error',
        message: `CPC bid exceeds maximum: $${Number(BigInt(cpcBid) / 1000000n).toFixed(2)} > $${Number(maxCpc / 1000000n).toFixed(2)}`,
        field: 'cpcBidMicros',
        suggestedValue: this.config.bidLimits.maxCpcMicros
      });

      result.modifications!.cpcBidMicros = this.config.bidLimits.maxCpcMicros;
    }

    // Check CPM bid
    const cpmBid = mutation.changes.cpmBidMicros as string;
    if (cpmBid && BigInt(cpmBid) > maxCpm) {
      result.violations.push({
        type: 'bid_limit',
        severity: 'error',
        message: `CPM bid exceeds maximum: $${Number(BigInt(cpmBid) / 1000000n).toFixed(2)} > $${Number(maxCpm / 1000000n).toFixed(2)}`,
        field: 'cpmBidMicros',
        suggestedValue: this.config.bidLimits.maxCpmMicros
      });

      result.modifications!.cpmBidMicros = this.config.bidLimits.maxCpmMicros;
    }
  }

  /**
   * Validate negative keywords
   */
  private validateNegativeKeywords(mutation: Mutation, result: GuardrailResult): void {
    if (!this.config.negativeKeywords.blockProhibitedTerms) {
      return;
    }

    // Check if adding keywords that should be negative
    if (mutation.resource === 'keyword' && mutation.type === 'CREATE') {
      const keywordText = mutation.changes.text as string;
      if (!keywordText) return;

      const keywordLower = keywordText.toLowerCase();
      const prohibitedTerms = this.config.negativeKeywords.prohibitedTerms;

      for (const term of prohibitedTerms) {
        if (keywordLower.includes(term.toLowerCase())) {
          result.violations.push({
            type: 'prohibited_keyword',
            severity: 'error',
            message: `Keyword contains prohibited term: "${term}"`,
            field: 'keyword.text'
          });
        }
      }
    }

    // Check negative keyword list enforcement
    if (mutation.resource === 'campaign' && 
        mutation.type === 'CREATE' && 
        this.config.negativeKeywords.enforceSharedLists) {
      const hasNegativeList = mutation.changes.sharedNegativeListIds && 
                             (mutation.changes.sharedNegativeListIds as string[]).length > 0;
      
      if (!hasNegativeList) {
        result.warnings.push(
          'Campaign should have a shared negative keyword list attached'
        );
      }
    }
  }

  /**
   * Assess overall risk level
   */
  private assessRisk(mutation: Mutation, result: GuardrailResult): void {
    let riskScore = 0;

    // Factor in violation severity
    riskScore += result.violations.filter(v => v.severity === 'critical').length * 10;
    riskScore += result.violations.filter(v => v.severity === 'error').length * 5;
    riskScore += result.violations.filter(v => v.severity === 'warning').length * 2;

    // Factor in mutation type
    if (mutation.type === 'REMOVE') {
      riskScore += 3;
    } else if (mutation.type === 'CREATE') {
      riskScore += 2;
    }

    // Factor in resource type
    if (mutation.resource === 'budget' || mutation.resource === 'campaign') {
      riskScore += 3;
    }

    // Factor in cost
    if (mutation.estimatedCost) {
      if (mutation.estimatedCost > 100) {
        riskScore += 5;
      } else if (mutation.estimatedCost > 50) {
        riskScore += 3;
      } else if (mutation.estimatedCost > 10) {
        riskScore += 1;
      }
    }

    // Determine risk level
    if (riskScore >= 15) {
      result.estimatedImpact!.riskLevel = 'high';
    } else if (riskScore >= 8) {
      result.estimatedImpact!.riskLevel = 'medium';
    } else {
      result.estimatedImpact!.riskLevel = 'low';
    }
  }

  /**
   * Extract URLs from mutation changes
   */
  private extractUrls(mutation: Mutation): string[] {
    const urls: string[] = [];

    // Check various fields that might contain URLs
    const urlFields = ['finalUrls', 'finalUrl', 'landingPage', 'destinationUrl'];
    
    for (const field of urlFields) {
      const value = mutation.changes[field];
      if (value) {
        if (Array.isArray(value)) {
          urls.push(...value.filter(v => typeof v === 'string'));
        } else if (typeof value === 'string') {
          urls.push(value);
        }
      }
    }

    return urls;
  }

  /**
   * Get mutation history
   */
  getMutationHistory(): Mutation[] {
    return [...this.mutationHistory];
  }

  /**
   * Clear mutation history
   */
  clearHistory(): void {
    this.mutationHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GuardrailConfig>): void {
    this.config = GuardrailConfigSchema.parse({ ...this.config, ...config });
    this.budgetEnforcer = new BudgetEnforcer(this.config.budgetLimits);
  }
}