import pino from 'pino';
import { z } from 'zod';
import { GoogleAdsApiClient } from '../connectors/google-ads-api.js';
import { MutationGuard, Mutation, GuardrailResult } from '../monitors/mutation-guard.js';
import { AuditLogger } from '../monitors/audit-logger.js';
import { PerformanceMonitor } from '../monitors/performance.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Planned changes schema
export const PlannedChangesSchema = z.object({
  customerId: z.string(),
  product: z.string(),
  mutations: z.array(z.object({
    type: z.enum(['CREATE', 'UPDATE', 'PAUSE', 'REMOVE', 'ENABLE']),
    resource: z.enum(['campaign', 'ad_group', 'keyword', 'ad', 'budget']),
    entityId: z.string().optional(),
    entityName: z.string().optional(),
    changes: z.record(z.any()),
    dependencies: z.array(z.string()).optional(),
    priority: z.number().default(0)
  })),
  metadata: z.object({
    plannedAt: z.string(),
    plannedBy: z.string(),
    description: z.string(),
    estimatedImpact: z.object({
      impressions: z.number().optional(),
      clicks: z.number().optional(),
      cost: z.number().optional(),
      conversions: z.number().optional()
    }).optional()
  })
});

export type PlannedChanges = z.infer<typeof PlannedChangesSchema>;

// Mutation result schema
export const MutationResultSchema = z.object({
  success: z.boolean(),
  applied: z.array(z.object({
    mutation: z.any(),
    status: z.enum(['success', 'failed', 'skipped']),
    result: z.any().optional(),
    error: z.string().optional()
  })),
  skipped: z.array(z.object({
    mutation: z.any(),
    reason: z.string()
  })),
  failed: z.array(z.object({
    mutation: z.any(),
    error: z.string()
  })),
  rollbackAvailable: z.boolean(),
  rollbackId: z.string().optional(),
  summary: z.object({
    total: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    skipped: z.number()
  })
});

export type MutationResult = z.infer<typeof MutationResultSchema>;

// Dry run result schema
export const DryRunResultSchema = z.object({
  canProceed: z.boolean(),
  guardrailResults: z.array(GuardrailResult),
  preview: z.object({
    before: z.record(z.any()),
    after: z.record(z.any()),
    diff: z.string()
  }),
  estimatedChanges: z.object({
    campaigns: z.number(),
    adGroups: z.number(),
    keywords: z.number(),
    ads: z.number(),
    budgetChange: z.number()
  }),
  warnings: z.array(z.string()),
  blockers: z.array(z.string())
});

export type DryRunResult = z.infer<typeof DryRunResultSchema>;

// Mutation builder for creating type-safe mutations
export class MutationBuilder {
  private mutations: Mutation[] = [];
  private customerId: string;

  constructor(customerId: string) {
    this.customerId = customerId;
  }

  /**
   * Create a new campaign
   */
  createCampaign(params: {
    name: string;
    budgetMicros: string;
    status?: 'ENABLED' | 'PAUSED';
    biddingStrategy?: string;
    targetLocations?: string[];
    startDate?: string;
    endDate?: string;
  }): this {
    this.mutations.push({
      type: 'CREATE',
      resource: 'campaign',
      customerId: this.customerId,
      changes: {
        name: params.name,
        budgetMicros: params.budgetMicros,
        status: params.status || 'PAUSED',
        biddingStrategy: params.biddingStrategy || 'MAXIMIZE_CONVERSIONS',
        targetLocations: params.targetLocations,
        startDate: params.startDate,
        endDate: params.endDate
      },
      estimatedCost: Number(BigInt(params.budgetMicros) / 1000000n)
    });
    return this;
  }

  /**
   * Update an existing campaign
   */
  updateCampaign(campaignId: string, updates: {
    name?: string;
    status?: 'ENABLED' | 'PAUSED' | 'REMOVED';
    budgetMicros?: string;
  }): this {
    this.mutations.push({
      type: 'UPDATE',
      resource: 'campaign',
      entityId: campaignId,
      customerId: this.customerId,
      changes: updates,
      estimatedCost: updates.budgetMicros ? 
        Number(BigInt(updates.budgetMicros) / 1000000n) : 0
    });
    return this;
  }

  /**
   * Pause a campaign
   */
  pauseCampaign(campaignId: string): this {
    return this.updateCampaign(campaignId, { status: 'PAUSED' });
  }

  /**
   * Enable a campaign
   */
  enableCampaign(campaignId: string): this {
    return this.updateCampaign(campaignId, { status: 'ENABLED' });
  }

  /**
   * Create an ad group
   */
  createAdGroup(params: {
    campaignId: string;
    name: string;
    cpcBidMicros?: string;
    status?: 'ENABLED' | 'PAUSED';
    targetingSettings?: any;
  }): this {
    this.mutations.push({
      type: 'CREATE',
      resource: 'ad_group',
      customerId: this.customerId,
      changes: {
        campaignId: params.campaignId,
        name: params.name,
        cpcBidMicros: params.cpcBidMicros || '1000000', // $1 default
        status: params.status || 'PAUSED',
        targetingSettings: params.targetingSettings
      }
    });
    return this;
  }

  /**
   * Add keywords to an ad group
   */
  addKeywords(adGroupId: string, keywords: Array<{
    text: string;
    matchType: 'EXACT' | 'PHRASE' | 'BROAD';
    cpcBidMicros?: string;
  }>): this {
    for (const keyword of keywords) {
      this.mutations.push({
        type: 'CREATE',
        resource: 'keyword',
        customerId: this.customerId,
        changes: {
          adGroupId,
          text: keyword.text,
          matchType: keyword.matchType,
          cpcBidMicros: keyword.cpcBidMicros,
          status: 'ENABLED'
        }
      });
    }
    return this;
  }

  /**
   * Create a responsive search ad
   */
  createResponsiveSearchAd(params: {
    adGroupId: string;
    headlines: Array<{ text: string; pinning?: string }>;
    descriptions: Array<{ text: string; pinning?: string }>;
    finalUrls: string[];
    path1?: string;
    path2?: string;
  }): this {
    this.mutations.push({
      type: 'CREATE',
      resource: 'ad',
      customerId: this.customerId,
      changes: {
        adGroupId: params.adGroupId,
        type: 'RESPONSIVE_SEARCH_AD',
        headlines: params.headlines,
        descriptions: params.descriptions,
        finalUrls: params.finalUrls,
        path1: params.path1,
        path2: params.path2,
        status: 'ENABLED'
      }
    });
    return this;
  }

  /**
   * Build the mutations
   */
  build(): Mutation[] {
    return this.mutations;
  }

  /**
   * Clear all mutations
   */
  clear(): void {
    this.mutations = [];
  }
}

// Main mutation applier class
export class MutationApplier {
  private googleAdsClient: GoogleAdsApiClient;
  private mutationGuard: MutationGuard;
  private auditLogger: AuditLogger;
  private performanceMonitor: PerformanceMonitor;
  private rollbackStack: Array<{ id: string; mutations: Mutation[]; timestamp: string }> = [];

  constructor() {
    this.googleAdsClient = new GoogleAdsApiClient();
    this.mutationGuard = new MutationGuard();
    this.auditLogger = new AuditLogger();
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * Apply planned changes with optional dry run
   */
  async applyChanges(
    changes: PlannedChanges,
    options: { 
      dryRun: boolean; 
      confirm: boolean;
      skipGuardrails?: boolean;
      autoRollback?: boolean;
    }
  ): Promise<MutationResult | DryRunResult> {
    logger.info('Starting mutation application', {
      customerId: changes.customerId,
      product: changes.product,
      mutationCount: changes.mutations.length,
      dryRun: options.dryRun
    });

    // Sort mutations by priority
    const sortedMutations = [...changes.mutations].sort((a, b) => b.priority - a.priority);

    if (options.dryRun) {
      return await this.performDryRun(changes, sortedMutations);
    }

    if (!options.confirm) {
      throw new Error('Confirmation required for applying mutations');
    }

    return await this.performMutations(changes, sortedMutations, options);
  }

  /**
   * Perform dry run
   */
  private async performDryRun(
    changes: PlannedChanges,
    mutations: typeof changes.mutations
  ): Promise<DryRunResult> {
    const result: DryRunResult = {
      canProceed: true,
      guardrailResults: [],
      preview: {
        before: {},
        after: {},
        diff: ''
      },
      estimatedChanges: {
        campaigns: 0,
        adGroups: 0,
        keywords: 0,
        ads: 0,
        budgetChange: 0
      },
      warnings: [],
      blockers: []
    };

    // Get current state
    try {
      const campaigns = await this.googleAdsClient.getCampaigns(changes.customerId);
      result.preview.before = { campaigns };
    } catch (error) {
      logger.warn('Could not fetch current state for preview', error);
    }

    // Validate each mutation
    for (const mutationData of mutations) {
      const mutation: Mutation = {
        type: mutationData.type,
        resource: mutationData.resource,
        entityId: mutationData.entityId,
        customerId: changes.customerId,
        changes: mutationData.changes,
        estimatedCost: this.estimateCost(mutationData)
      };

      const guardrailResult = await this.mutationGuard.validateMutation(mutation);
      result.guardrailResults.push(guardrailResult);

      if (!guardrailResult.passed) {
        result.canProceed = false;
        const violations = guardrailResult.violations
          .filter(v => v.severity === 'critical' || v.severity === 'error')
          .map(v => v.message);
        result.blockers.push(...violations);
      }

      result.warnings.push(...guardrailResult.warnings);

      // Count estimated changes
      switch (mutation.resource) {
        case 'campaign':
          result.estimatedChanges.campaigns++;
          break;
        case 'ad_group':
          result.estimatedChanges.adGroups++;
          break;
        case 'keyword':
          result.estimatedChanges.keywords++;
          break;
        case 'ad':
          result.estimatedChanges.ads++;
          break;
      }

      if (mutation.estimatedCost) {
        result.estimatedChanges.budgetChange += mutation.estimatedCost;
      }
    }

    // Generate preview of changes
    result.preview.after = this.generatePreviewState(result.preview.before, mutations);
    result.preview.diff = this.generateDiff(result.preview.before, result.preview.after);

    logger.info('Dry run complete', {
      canProceed: result.canProceed,
      blockers: result.blockers.length,
      warnings: result.warnings.length
    });

    return result;
  }

  /**
   * Perform actual mutations
   */
  private async performMutations(
    changes: PlannedChanges,
    mutations: typeof changes.mutations,
    options: { skipGuardrails?: boolean; autoRollback?: boolean }
  ): Promise<MutationResult> {
    const result: MutationResult = {
      success: true,
      applied: [],
      skipped: [],
      failed: [],
      rollbackAvailable: false,
      summary: {
        total: mutations.length,
        succeeded: 0,
        failed: 0,
        skipped: 0
      }
    };

    const rollbackMutations: Mutation[] = [];

    for (const mutationData of mutations) {
      const mutation: Mutation = {
        type: mutationData.type,
        resource: mutationData.resource,
        entityId: mutationData.entityId,
        customerId: changes.customerId,
        changes: mutationData.changes,
        estimatedCost: this.estimateCost(mutationData)
      };

      // Validate with guardrails unless skipped
      if (!options.skipGuardrails) {
        const guardrailResult = await this.mutationGuard.validateMutation(mutation);
        
        if (!guardrailResult.passed) {
          result.skipped.push({
            mutation: mutationData,
            reason: guardrailResult.violations.map(v => v.message).join('; ')
          });
          result.summary.skipped++;
          continue;
        }
      }

      // Apply the mutation
      try {
        const applyResult = await this.applyMutation(mutation);
        
        result.applied.push({
          mutation: mutationData,
          status: 'success',
          result: applyResult
        });
        result.summary.succeeded++;

        // Record for potential rollback
        rollbackMutations.push(this.createRollbackMutation(mutation, applyResult));

        // Log to audit trail
        await this.auditLogger.logMutation({
          mutation,
          result: 'success',
          timestamp: new Date().toISOString(),
          user: changes.metadata.plannedBy
        });

      } catch (error: any) {
        logger.error('Failed to apply mutation', { mutation, error });
        
        result.failed.push({
          mutation: mutationData,
          error: error.message
        });
        result.summary.failed++;

        // Log failure to audit trail
        await this.auditLogger.logMutation({
          mutation,
          result: 'failed',
          error: error.message,
          timestamp: new Date().toISOString(),
          user: changes.metadata.plannedBy
        });

        // Auto-rollback if enabled and we had successful mutations
        if (options.autoRollback && rollbackMutations.length > 0) {
          logger.info('Initiating auto-rollback due to failure');
          await this.rollback(rollbackMutations);
          result.success = false;
          return result;
        }
      }
    }

    // Store rollback information if we have successful mutations
    if (rollbackMutations.length > 0) {
      const rollbackId = `rollback-${Date.now()}`;
      this.rollbackStack.push({
        id: rollbackId,
        mutations: rollbackMutations,
        timestamp: new Date().toISOString()
      });
      result.rollbackAvailable = true;
      result.rollbackId = rollbackId;
    }

    result.success = result.summary.failed === 0;

    logger.info('Mutation application complete', result.summary);
    return result;
  }

  /**
   * Apply a single mutation (simulated for now)
   */
  private async applyMutation(mutation: Mutation): Promise<any> {
    // Use performance monitor for the operation
    return await this.performanceMonitor.executeWithCircuitBreaker(async () => {
      // In real implementation, this would call Google Ads API
      logger.info('Applying mutation', { mutation });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Return simulated result
      return {
        resourceName: `customers/${mutation.customerId}/${mutation.resource}s/${Date.now()}`,
        ...mutation.changes
      };
    });
  }

  /**
   * Create rollback mutation for a successful mutation
   */
  private createRollbackMutation(original: Mutation, result: any): Mutation {
    // Create inverse mutation
    switch (original.type) {
      case 'CREATE':
        return {
          ...original,
          type: 'REMOVE',
          entityId: result.resourceName
        };
      case 'REMOVE':
        return {
          ...original,
          type: 'CREATE'
        };
      case 'UPDATE':
        // Would need to store previous state for proper rollback
        return {
          ...original,
          changes: {} // Would contain previous values
        };
      case 'PAUSE':
        return {
          ...original,
          type: 'ENABLE'
        };
      case 'ENABLE':
        return {
          ...original,
          type: 'PAUSE'
        };
      default:
        return original;
    }
  }

  /**
   * Rollback mutations
   */
  async rollback(mutations: Mutation[] | string): Promise<MutationResult> {
    let rollbackMutations: Mutation[];
    
    if (typeof mutations === 'string') {
      // Rollback by ID
      const rollbackEntry = this.rollbackStack.find(r => r.id === mutations);
      if (!rollbackEntry) {
        throw new Error(`Rollback ID ${mutations} not found`);
      }
      rollbackMutations = rollbackEntry.mutations;
    } else {
      rollbackMutations = mutations;
    }

    logger.info('Starting rollback', { mutationCount: rollbackMutations.length });

    const result: MutationResult = {
      success: true,
      applied: [],
      skipped: [],
      failed: [],
      rollbackAvailable: false,
      summary: {
        total: rollbackMutations.length,
        succeeded: 0,
        failed: 0,
        skipped: 0
      }
    };

    for (const mutation of rollbackMutations) {
      try {
        const applyResult = await this.applyMutation(mutation);
        result.applied.push({
          mutation,
          status: 'success',
          result: applyResult
        });
        result.summary.succeeded++;
      } catch (error: any) {
        result.failed.push({
          mutation,
          error: error.message
        });
        result.summary.failed++;
      }
    }

    result.success = result.summary.failed === 0;
    return result;
  }

  /**
   * Estimate cost of a mutation
   */
  private estimateCost(mutation: any): number {
    if (mutation.changes.budgetMicros) {
      return Number(BigInt(mutation.changes.budgetMicros) / 1000000n);
    }
    if (mutation.changes.cpcBidMicros) {
      // Estimate based on expected clicks
      const estimatedClicks = 100; // Would use historical data
      return Number(BigInt(mutation.changes.cpcBidMicros) / 1000000n) * estimatedClicks;
    }
    return 0;
  }

  /**
   * Generate preview state after mutations
   */
  private generatePreviewState(currentState: any, mutations: any[]): any {
    const previewState = JSON.parse(JSON.stringify(currentState));
    
    // Apply mutations to preview state
    for (const mutation of mutations) {
      switch (mutation.type) {
        case 'CREATE':
          if (!previewState[mutation.resource + 's']) {
            previewState[mutation.resource + 's'] = [];
          }
          previewState[mutation.resource + 's'].push({
            id: `preview-${Date.now()}`,
            ...mutation.changes
          });
          break;
        case 'UPDATE':
          // Would update existing entity in preview
          break;
        case 'REMOVE':
          // Would remove entity from preview
          break;
      }
    }
    
    return previewState;
  }

  /**
   * Generate diff between states
   */
  private generateDiff(before: any, after: any): string {
    const beforeStr = JSON.stringify(before, null, 2);
    const afterStr = JSON.stringify(after, null, 2);
    
    // This would use a diff library in production
    return `BEFORE:\n${beforeStr}\n\nAFTER:\n${afterStr}`;
  }
}