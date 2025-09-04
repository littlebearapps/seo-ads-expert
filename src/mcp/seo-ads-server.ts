import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
  ImageContent,
  EmbeddedResource,
  ProgressNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';
import pino from 'pino';
import { z } from 'zod';
import { StrategicOrchestrator } from '../analyzers/strategic-orchestrator.js';
import { GoogleAdsApiClient } from '../connectors/google-ads-api.js';
import { MutationApplier, MutationBuilder, PlannedChanges } from '../writers/mutation-applier.js';
import { NegativeKeywordsManager } from '../analyzers/negative-keywords-manager.js';
import { MicrosoftAdsCSVWriter } from '../writers/microsoft-ads-csv.js';
import { BingKeywordsConnector } from '../connectors/bing-keywords.js';
import { AuditLogger } from '../monitors/audit-logger.js';
import { CSVWriter } from '../writers.js';
import { JSONWriter } from '../writers.js';
import { MarkdownWriter } from '../writers.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Tool parameter schemas
const PlanGenerationParamsSchema = z.object({
  product: z.string().describe('Product name (e.g., convert-my-file, palette-kit)'),
  market: z.string().default('AU').describe('Target market code'),
  includeCompetitors: z.boolean().default(true).describe('Include competitor analysis'),
  includeNegatives: z.boolean().default(true).describe('Include negative keywords'),
  outputFormat: z.enum(['json', 'csv', 'markdown', 'all']).default('json').describe('Output format')
});

const PreviewChangesParamsSchema = z.object({
  customerId: z.string().describe('Google Ads customer ID'),
  product: z.string().describe('Product name'),
  changes: z.any().describe('Planned changes object')
});

const ApplyChangesParamsSchema = z.object({
  customerId: z.string().describe('Google Ads customer ID'),
  product: z.string().describe('Product name'),
  changes: z.any().describe('Planned changes object'),
  skipGuardrails: z.boolean().default(false).describe('Skip safety guardrails (not recommended)'),
  autoRollback: z.boolean().default(true).describe('Auto-rollback on failure')
});

const ExportCampaignsParamsSchema = z.object({
  campaigns: z.any().describe('Campaign data to export'),
  format: z.enum(['google-csv', 'microsoft-csv', 'json']).describe('Export format'),
  outputPath: z.string().optional().describe('Output file path')
});

const AuditHistoryParamsSchema = z.object({
  startDate: z.string().describe('Start date (ISO format)'),
  endDate: z.string().describe('End date (ISO format)'),
  user: z.string().optional().describe('Filter by user'),
  action: z.string().optional().describe('Filter by action type')
});

const ReconcileCampaignsParamsSchema = z.object({
  customerId: z.string().describe('Google Ads customer ID'),
  product: z.string().describe('Product name'),
  plannedData: z.any().describe('Planned campaign structure')
});

const NegativeKeywordsSyncParamsSchema = z.object({
  product: z.string().describe('Product name'),
  customerId: z.string().optional().describe('Google Ads customer ID'),
  action: z.enum(['sync', 'add', 'remove', 'export']).default('sync').describe('Action to perform'),
  keywords: z.array(z.object({
    text: z.string(),
    matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
  })).optional().describe('Keywords for add/remove actions')
});

const BingOpportunityParamsSchema = z.object({
  product: z.string().describe('Product name'),
  keywords: z.array(z.string()).describe('Keywords to analyze'),
  market: z.string().default('en-AU').describe('Target market')
});

export class SeoAdsServer {
  private server: Server;
  private orchestrator: StrategicOrchestrator;
  private googleAdsClient: GoogleAdsApiClient;
  private mutationApplier: MutationApplier;
  private negativeManager: NegativeKeywordsManager;
  private microsoftWriter: MicrosoftAdsCSVWriter;
  private bingConnector: BingKeywordsConnector;
  private auditLogger: AuditLogger;
  private currentProgressToken?: string;

  constructor() {
    this.server = new Server(
      {
        name: 'seo-ads-expert',
        version: '1.3.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Initialize components
    this.orchestrator = new StrategicOrchestrator();
    this.googleAdsClient = new GoogleAdsApiClient();
    this.mutationApplier = new MutationApplier();
    this.negativeManager = new NegativeKeywordsManager();
    this.microsoftWriter = new MicrosoftAdsCSVWriter();
    this.bingConnector = new BingKeywordsConnector();
    this.auditLogger = new AuditLogger();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools()
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        logger.info(`Executing MCP tool: ${name}`, { args });
        
        const result = await this.executeTool(name, args);
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: any) {
        logger.error(`Error executing tool ${name}:`, error);
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'seo_ads_plan',
        description: 'Generate strategic SEO & Ads plan with keyword research and campaign structure',
        inputSchema: {
          type: 'object',
          properties: PlanGenerationParamsSchema.shape,
          required: ['product']
        }
      },
      {
        name: 'preview_changes',
        description: 'Preview campaign changes before applying (dry run mode)',
        inputSchema: {
          type: 'object',
          properties: PreviewChangesParamsSchema.shape,
          required: ['customerId', 'product', 'changes']
        }
      },
      {
        name: 'apply_changes',
        description: 'Apply campaign changes to Google Ads (requires confirmation)',
        inputSchema: {
          type: 'object',
          properties: ApplyChangesParamsSchema.shape,
          required: ['customerId', 'product', 'changes']
        }
      },
      {
        name: 'export_campaigns',
        description: 'Export campaigns to various formats (Google CSV, Microsoft CSV, JSON)',
        inputSchema: {
          type: 'object',
          properties: ExportCampaignsParamsSchema.shape,
          required: ['campaigns', 'format']
        }
      },
      {
        name: 'audit_history',
        description: 'Review audit history of all changes and operations',
        inputSchema: {
          type: 'object',
          properties: AuditHistoryParamsSchema.shape,
          required: ['startDate', 'endDate']
        }
      },
      {
        name: 'reconcile_campaigns',
        description: 'Compare planned vs live campaigns and identify discrepancies',
        inputSchema: {
          type: 'object',
          properties: ReconcileCampaignsParamsSchema.shape,
          required: ['customerId', 'product', 'plannedData']
        }
      },
      {
        name: 'negative_keywords',
        description: 'Manage negative keywords (sync, add, remove, export)',
        inputSchema: {
          type: 'object',
          properties: NegativeKeywordsSyncParamsSchema.shape,
          required: ['product']
        }
      },
      {
        name: 'bing_opportunity',
        description: 'Analyze Bing/Edge market opportunity for keywords',
        inputSchema: {
          type: 'object',
          properties: BingOpportunityParamsSchema.shape,
          required: ['product', 'keywords']
        }
      },
      {
        name: 'get_status',
        description: 'Get current system status and configuration',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  private async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'seo_ads_plan':
        return await this.generatePlan(args);
      
      case 'preview_changes':
        return await this.previewChanges(args);
      
      case 'apply_changes':
        return await this.applyChanges(args);
      
      case 'export_campaigns':
        return await this.exportCampaigns(args);
      
      case 'audit_history':
        return await this.getAuditHistory(args);
      
      case 'reconcile_campaigns':
        return await this.reconcileCampaigns(args);
      
      case 'negative_keywords':
        return await this.manageNegativeKeywords(args);
      
      case 'bing_opportunity':
        return await this.analyzeBingOpportunity(args);
      
      case 'get_status':
        return await this.getSystemStatus();
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async generatePlan(params: z.infer<typeof PlanGenerationParamsSchema>): Promise<any> {
    logger.info('Generating SEO & Ads plan', params);
    
    // Send progress updates
    await this.sendProgress('Starting plan generation...', 0);
    
    // Generate strategic intelligence
    await this.sendProgress('Analyzing keywords and competition...', 20);
    const analysis = await this.orchestrator.generateStrategicIntelligence({
      product: params.product,
      market: params.market
    });

    // Add negative keywords if requested
    if (params.includeNegatives) {
      await this.sendProgress('Adding negative keywords...', 60);
      const negatives = this.negativeManager.getProductNegatives(params.product);
      analysis.negativeKeywords = negatives?.keywords || [];
    }
    
    await this.sendProgress('Formatting output...', 80);

    // Format output based on preference
    let result: any;
    switch (params.outputFormat) {
      case 'csv':
        const csvWriter = new CSVWriter();
        result = {
          format: 'csv',
          campaigns: await csvWriter.writeGoogleAdsCSV(analysis, ''),
          keywords: await csvWriter.writeKeywordsCSV(analysis.keywords || [], '')
        };
        break;
      
      case 'markdown':
        const mdWriter = new MarkdownWriter();
        result = {
          format: 'markdown',
          content: await mdWriter.writeMarkdownReport(analysis, '')
        };
        break;
      
      case 'all':
        result = {
          json: analysis,
          csv: {
            campaigns: await new CSVWriter().writeGoogleAdsCSV(analysis, ''),
            keywords: await new CSVWriter().writeKeywordsCSV(analysis.keywords || [], '')
          },
          markdown: await new MarkdownWriter().writeMarkdownReport(analysis, '')
        };
        break;
      
      default:
        result = analysis;
        break;
    }
    
    await this.completeProgress();
    return result;
  }

  private async previewChanges(params: z.infer<typeof PreviewChangesParamsSchema>): Promise<any> {
    logger.info('Previewing changes', params);
    
    const plannedChanges: PlannedChanges = {
      customerId: params.customerId,
      product: params.product,
      mutations: params.changes.mutations || [],
      metadata: {
        plannedAt: new Date().toISOString(),
        plannedBy: 'mcp-user',
        description: 'MCP-generated changes'
      }
    };

    const result = await this.mutationApplier.applyChanges(
      plannedChanges,
      { dryRun: true, confirm: false }
    );

    return {
      preview: result,
      recommendation: this.generateRecommendation(result)
    };
  }

  private async applyChanges(params: z.infer<typeof ApplyChangesParamsSchema>): Promise<any> {
    logger.info('Applying changes', params);
    
    // Require explicit confirmation
    const confirmationMessage = `
⚠️ CONFIRMATION REQUIRED ⚠️

You are about to apply ${params.changes.mutations?.length || 0} mutations to Google Ads account ${params.customerId}.

This action will:
- Modify live campaigns
- Potentially affect budget spend
- Be logged in the audit trail

Please review the changes carefully before proceeding.
    `;

    const plannedChanges: PlannedChanges = {
      customerId: params.customerId,
      product: params.product,
      mutations: params.changes.mutations || [],
      metadata: {
        plannedAt: new Date().toISOString(),
        plannedBy: 'mcp-user',
        description: 'MCP-applied changes',
        estimatedImpact: params.changes.estimatedImpact
      }
    };

    const result = await this.mutationApplier.applyChanges(
      plannedChanges,
      {
        dryRun: false,
        confirm: true, // MCP user has confirmed
        skipGuardrails: params.skipGuardrails,
        autoRollback: params.autoRollback
      }
    );

    return {
      confirmationRequired: confirmationMessage,
      result,
      rollbackId: result.rollbackId,
      summary: result.summary
    };
  }

  private async exportCampaigns(params: z.infer<typeof ExportCampaignsParamsSchema>): Promise<any> {
    logger.info('Exporting campaigns', params);
    
    switch (params.format) {
      case 'google-csv':
        const csvWriter = new CSVWriter();
        return {
          format: 'google-csv',
          content: await csvWriter.writeGoogleAdsCSV(params.campaigns, params.outputPath || '')
        };
      
      case 'microsoft-csv':
        return {
          format: 'microsoft-csv',
          content: await this.microsoftWriter.exportBulkCsv(
            params.campaigns,
            params.outputPath
          )
        };
      
      case 'json':
        const jsonWriter = new JSONWriter();
        return {
          format: 'json',
          content: await jsonWriter.writeJSONReport(params.campaigns, params.outputPath || '')
        };
      
      default:
        throw new Error(`Unsupported export format: ${params.format}`);
    }
  }

  private async getAuditHistory(params: z.infer<typeof AuditHistoryParamsSchema>): Promise<any> {
    logger.info('Fetching audit history', params);
    
    const logs = await this.auditLogger.getAuditLogs({
      startDate: params.startDate,
      endDate: params.endDate,
      user: params.user,
      action: params.action
    });

    const summary = await this.auditLogger.generateSummary(
      params.startDate,
      params.endDate
    );

    return {
      logs,
      summary,
      totalEntries: logs.length
    };
  }

  private async reconcileCampaigns(params: z.infer<typeof ReconcileCampaignsParamsSchema>): Promise<any> {
    logger.info('Reconciling campaigns', params);
    
    const reconciliationReport = await this.googleAdsClient.reconcile(
      params.plannedData,
      params.customerId
    );

    return {
      report: reconciliationReport,
      recommendations: this.generateReconciliationRecommendations(reconciliationReport)
    };
  }

  private async manageNegativeKeywords(params: z.infer<typeof NegativeKeywordsSyncParamsSchema>): Promise<any> {
    logger.info('Managing negative keywords', params);
    
    switch (params.action) {
      case 'sync':
        const syncResult = await this.negativeManager.syncNegativeKeywords(
          params.product,
          params.customerId
        );
        return {
          action: 'sync',
          result: syncResult,
          statistics: this.negativeManager.getStatistics(params.product)
        };
      
      case 'add':
        if (!params.keywords) {
          throw new Error('Keywords required for add action');
        }
        const addResult = await this.negativeManager.addManualNegatives(
          params.product,
          params.keywords
        );
        return {
          action: 'add',
          result: addResult
        };
      
      case 'remove':
        if (!params.keywords) {
          throw new Error('Keywords required for remove action');
        }
        const removeResult = await this.negativeManager.removeNegatives(
          params.product,
          params.keywords.map(k => k.text)
        );
        return {
          action: 'remove',
          result: removeResult
        };
      
      case 'export':
        const csv = this.negativeManager.exportToCSV(params.product);
        return {
          action: 'export',
          format: 'csv',
          content: csv
        };
      
      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }

  private async analyzeBingOpportunity(params: z.infer<typeof BingOpportunityParamsSchema>): Promise<any> {
    logger.info('Analyzing Bing opportunity', params);
    
    const opportunity = await this.bingConnector.calculateMarketOpportunity(
      params.product,
      params.keywords,
      params.market
    );

    const suggestions = await this.bingConnector.getKeywordSuggestions(
      params.keywords.slice(0, 5), // Limit seed keywords
      params.market
    );

    const insights = await this.bingConnector.getCompetitiveInsights(
      params.keywords,
      params.market
    );

    return {
      opportunity,
      suggestions: suggestions.suggestions.slice(0, 20), // Top 20 suggestions
      insights,
      recommendation: this.generateBingRecommendation(opportunity, insights)
    };
  }

  private async getSystemStatus(): Promise<any> {
    const status = {
      version: '1.3.0',
      timestamp: new Date().toISOString(),
      components: {
        googleAdsApi: {
          configured: this.googleAdsClient.isConfigured(),
          customerIds: this.googleAdsClient.getCustomerIds()
        },
        bingApi: {
          configured: this.bingConnector.getIsConfigured()
        },
        negativeKeywords: {
          lists: this.negativeManager.getAllLists().length,
          products: this.negativeManager.getAllLists().map(l => l.product)
        },
        audit: {
          retentionDays: 90
        }
      },
      capabilities: {
        planning: true,
        googleAdsWrite: this.googleAdsClient.isConfigured(),
        microsoftAdsExport: true,
        bingKeywords: true,
        negativeManagement: true,
        auditLogging: true
      }
    };

    return status;
  }

  private generateRecommendation(previewResult: any): string {
    const recommendations: string[] = [];
    
    if (previewResult.canProceed === false) {
      recommendations.push('❌ Changes cannot proceed due to guardrail violations');
      recommendations.push('Please address the following issues:');
      previewResult.blockers?.forEach((blocker: string) => {
        recommendations.push(`  • ${blocker}`);
      });
    } else {
      recommendations.push('✅ Changes can proceed safely');
      if (previewResult.warnings?.length > 0) {
        recommendations.push('⚠️ Warnings to consider:');
        previewResult.warnings.forEach((warning: string) => {
          recommendations.push(`  • ${warning}`);
        });
      }
    }

    if (previewResult.estimatedChanges) {
      recommendations.push('\n📊 Estimated Impact:');
      recommendations.push(`  • Campaigns: ${previewResult.estimatedChanges.campaigns}`);
      recommendations.push(`  • Ad Groups: ${previewResult.estimatedChanges.adGroups}`);
      recommendations.push(`  • Keywords: ${previewResult.estimatedChanges.keywords}`);
      recommendations.push(`  • Budget Change: $${previewResult.estimatedChanges.budgetChange}`);
    }

    return recommendations.join('\n');
  }

  private generateReconciliationRecommendations(report: any): string[] {
    const recommendations: string[] = [];
    
    if (report.summary.criticalIssues > 0) {
      recommendations.push('🚨 Critical issues require immediate attention');
    }
    
    if (report.summary.totalDiscrepancies === 0) {
      recommendations.push('✅ Campaigns are fully synchronized');
    } else {
      recommendations.push(`📋 ${report.summary.totalDiscrepancies} discrepancies found`);
      
      if (report.discrepancies.campaigns.length > 0) {
        recommendations.push(`  • ${report.discrepancies.campaigns.length} campaign issues`);
      }
      if (report.discrepancies.adGroups.length > 0) {
        recommendations.push(`  • ${report.discrepancies.adGroups.length} ad group issues`);
      }
      if (report.discrepancies.keywords.length > 0) {
        recommendations.push(`  • ${report.discrepancies.keywords.length} keyword issues`);
      }
    }

    report.summary.suggestions?.forEach((suggestion: string) => {
      recommendations.push(`💡 ${suggestion}`);
    });

    return recommendations;
  }

  private generateBingRecommendation(opportunity: any, insights: any): string {
    const recommendations: string[] = [];
    
    if (opportunity.opportunityScore > 70) {
      recommendations.push('🎯 High opportunity for Bing/Edge advertising');
    } else if (opportunity.opportunityScore > 40) {
      recommendations.push('📊 Moderate opportunity for Bing/Edge advertising');
    } else {
      recommendations.push('📉 Limited opportunity for Bing/Edge advertising');
    }

    recommendations.push(`\n📈 Market Metrics:`);
    recommendations.push(`  • Total Search Volume: ${opportunity.totalSearchVolume.toLocaleString()}`);
    recommendations.push(`  • Average Competition: ${(opportunity.avgCompetition * 100).toFixed(1)}%`);
    recommendations.push(`  • Average CPC: $${opportunity.avgCpc.toFixed(2)}`);

    recommendations.push(`\n📱 Device Distribution:`);
    recommendations.push(`  • Desktop: ${opportunity.deviceDistribution.desktop.toFixed(1)}%`);
    recommendations.push(`  • Mobile: ${opportunity.deviceDistribution.mobile.toFixed(1)}%`);
    recommendations.push(`  • Tablet: ${opportunity.deviceDistribution.tablet.toFixed(1)}%`);

    if (insights.competitionTrend === 'increasing') {
      recommendations.push('\n⚠️ Competition is increasing - consider higher bids');
    }

    if (insights.recommendedBidAdjustment > 1.1) {
      recommendations.push(`💰 Recommended bid adjustment: +${((insights.recommendedBidAdjustment - 1) * 100).toFixed(0)}%`);
    }

    return recommendations.join('\n');
  }

  private async sendProgress(message: string, progress: number): Promise<void> {
    if (!this.currentProgressToken) {
      this.currentProgressToken = `progress-${Date.now()}`;
    }

    try {
      await this.server.sendNotification(ProgressNotificationSchema, {
        method: 'notifications/progress',
        params: {
          progressToken: this.currentProgressToken,
          progress: progress,
          total: 100,
          message: message
        }
      });
    } catch (error) {
      logger.debug('Failed to send progress notification:', error);
    }
  }

  private async completeProgress(): Promise<void> {
    if (this.currentProgressToken) {
      await this.sendProgress('Complete', 100);
      this.currentProgressToken = undefined;
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('SEO & Ads Expert MCP Server started');
  }
}

// Start the server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SeoAdsServer();
  server.start().catch((error) => {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}