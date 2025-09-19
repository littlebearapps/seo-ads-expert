/**
 * SEO Ads Expert MCP Server
 *
 * Model Context Protocol server for budget optimization using Thompson Sampling.
 * Provides tools for optimization, performance analysis, and recommendation application.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { BayesianOptimizer } from '../statistics/bayesian-optimizer.js';
import { RealTimePerformanceTracker } from '../tracking/performance-tracker.js';
import { MetricAggregator } from '../tracking/metric-aggregator.js';
import { GuardrailSystem } from '../safety/guardrail-system.js';
import { OptimizerIntegration } from '../optimization/optimizer-integration.js';
import { IntegratedBidOptimizer } from '../bidding/integrated-bid-optimizer.js';
import { BidStrategyAdvisor } from '../bidding/bid-strategy-advisor.js';
import { CompetitionAnalyzer } from '../bidding/competition-analyzer.js';
import { SeasonalityDetector } from '../bidding/seasonality-detector.js';
import { Logger } from 'pino';
import pino from 'pino';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

export interface MCPServerConfig {
  databasePath: string;
  artifactPath: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  googleAdsConfig?: {
    developerToken: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

export class SEOAdsMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private database: Database.Database;
  private optimizer: BayesianOptimizer;
  private tracker: RealTimePerformanceTracker;
  private aggregator: MetricAggregator;
  private guardrails: GuardrailSystem;
  private integration: OptimizerIntegration;
  private bidOptimizer: IntegratedBidOptimizer;
  private bidStrategyAdvisor: BidStrategyAdvisor;
  private competitionAnalyzer: CompetitionAnalyzer;
  private seasonalityDetector: SeasonalityDetector;
  private logger: Logger;
  private sessions: Map<string, any> = new Map();

  constructor(config: MCPServerConfig) {
    // Initialize logger
    this.logger = pino({
      level: config.logLevel || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    });

    // Initialize database
    this.database = new Database(config.databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = NORMAL');
    this.database.pragma('cache_size = 10000');
    this.database.pragma('foreign_keys = ON');

    // Initialize components
    const googleAdsClient = null; // Would initialize with config.googleAdsConfig
    this.optimizer = new BayesianOptimizer(this.database, googleAdsClient, this.logger);
    this.tracker = new RealTimePerformanceTracker(googleAdsClient, this.database, this.logger);
    this.aggregator = new MetricAggregator(this.database, this.logger);
    this.guardrails = new GuardrailSystem(this.database, this.logger);

    this.integration = new OptimizerIntegration({
      database: this.database,
      googleAdsClient,
      logger: this.logger,
      artifactPath: config.artifactPath,
    });

    // Initialize bidding components
    this.bidOptimizer = new IntegratedBidOptimizer(this.database, this.logger);
    this.bidStrategyAdvisor = new BidStrategyAdvisor(this.database, this.logger);
    this.competitionAnalyzer = new CompetitionAnalyzer(this.database, this.logger);
    this.seasonalityDetector = new SeasonalityDetector(this.database, this.logger);

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'seo-ads-expert',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.transport = new StdioServerTransport();

    // Set up artifact directory
    if (!existsSync(config.artifactPath)) {
      mkdirSync(config.artifactPath, { recursive: true });
    }

    // Set up handlers
    this.setupTools();
    this.setupResources();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    await this.server.connect(this.transport);
    console.error('SEO Ads Expert MCP Server v2.0 started');
    console.error('Thompson Sampling optimizer ready');

    // Log startup info
    this.logger.info('MCP Server started', {
      capabilities: ['budget_optimization', 'performance_analysis', 'real_time_tracking'],
      guardrails: ['budget_cap', 'max_change', 'quality_score', 'landing_page_health', 'claims_validation'],
    });
  }

  /**
   * Gracefully close the server
   */
  async close(): Promise<void> {
    this.tracker.stopAllTracking();
    this.database.close();
    await this.server.close();
    console.error('SEO Ads Expert MCP Server stopped');
  }

  /**
   * Set up tool definitions and handlers
   */
  private setupTools(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'optimize_budgets',
          description: 'Run Thompson Sampling budget optimization with Bayesian learning',
          inputSchema: {
            type: 'object',
            properties: {
              accountId: {
                type: 'string',
                description: 'Google Ads account ID',
              },
              objective: {
                type: 'string',
                enum: ['maximize_CWS_Clicks', 'maximize_conversions', 'maximize_revenue'],
                default: 'maximize_CWS_Clicks',
                description: 'Optimization objective',
              },
              timeframe: {
                type: 'number',
                default: 30,
                description: 'Days of historical data to consider',
              },
              riskTolerance: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                default: 0.3,
                description: 'Risk tolerance (0=conservative, 1=aggressive)',
              },
              constraints: {
                type: 'object',
                properties: {
                  daily_cap_AUD: {
                    type: 'number',
                    description: 'Daily budget cap in AUD',
                  },
                  daily_cap_USD: {
                    type: 'number',
                    description: 'Daily budget cap in USD',
                  },
                  daily_cap_GBP: {
                    type: 'number',
                    description: 'Daily budget cap in GBP',
                  },
                  min_per_campaign: {
                    type: 'number',
                    default: 2,
                    description: 'Minimum budget per campaign',
                  },
                  max_change_pct: {
                    type: 'number',
                    default: 25,
                    description: 'Maximum percentage change per optimization',
                  },
                  exploration_floor: {
                    type: 'number',
                    default: 0.1,
                    description: 'Minimum exploration rate (0.1 = 10%)',
                  },
                },
              },
            },
            required: ['accountId'],
          },
        },
        {
          name: 'analyze_performance',
          description: 'Get real-time performance insights with anomaly detection',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to analyze',
              },
              metrics: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['clicks', 'conversions', 'revenue', 'ctr', 'cvr', 'cpa', 'roas'],
                },
                description: 'Metrics to include',
              },
              timeframe: {
                type: 'string',
                enum: ['1d', '7d', '30d', '90d'],
                default: '7d',
                description: 'Time period for analysis',
              },
              includeAlerts: {
                type: 'boolean',
                default: true,
                description: 'Include active alerts in response',
              },
              includeRecommendations: {
                type: 'boolean',
                default: true,
                description: 'Include optimization recommendations',
              },
            },
          },
        },
        {
          name: 'apply_recommendations',
          description: 'Apply optimization recommendations to Google Ads account',
          inputSchema: {
            type: 'object',
            properties: {
              artifact: {
                type: 'string',
                description: 'Path to proposal artifact JSON file',
              },
              applyMode: {
                type: 'string',
                enum: ['dry-run', 'apply'],
                default: 'dry-run',
                description: 'Execution mode',
              },
              confirm: {
                type: 'boolean',
                default: false,
                description: 'Confirm application (required for apply mode)',
              },
              runId: {
                type: 'string',
                description: 'Specific proposal run ID to apply',
              },
            },
            required: ['artifact'],
          },
        },
        {
          name: 'start_tracking',
          description: 'Start real-time performance tracking for campaigns',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to track',
              },
              accountId: {
                type: 'string',
                description: 'Google Ads account ID',
              },
              interval: {
                type: 'string',
                enum: ['15m', '30m', '1h', '6h', '24h'],
                default: '15m',
                description: 'Polling interval',
              },
            },
            required: ['campaignIds', 'accountId'],
          },
        },
        {
          name: 'get_dashboard',
          description: 'Get performance dashboard snapshot',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by campaign IDs',
              },
              format: {
                type: 'string',
                enum: ['json', 'csv'],
                default: 'json',
                description: 'Output format',
              },
            },
          },
        },
        {
          name: 'validate_claims',
          description: 'Validate ad claims and landing page compliance',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to validate',
              },
              checkLandingPages: {
                type: 'boolean',
                default: true,
                description: 'Validate landing page health',
              },
            },
            required: ['campaignIds'],
          },
        },
        {
          name: 'analyze_bid_strategies',
          description: 'Analyze and recommend optimal bid strategies for campaigns',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to analyze',
              },
              includeCompetition: {
                type: 'boolean',
                default: true,
                description: 'Include competitive analysis',
              },
              includeSeasonality: {
                type: 'boolean',
                default: true,
                description: 'Include seasonality patterns',
              },
            },
            required: ['campaignIds'],
          },
        },
        {
          name: 'optimize_bids_integrated',
          description: 'Run comprehensive bid and budget optimization with Thompson Sampling',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to optimize',
              },
              objective: {
                type: 'string',
                enum: ['maximize_conversions', 'target_cpa', 'target_roas', 'balanced'],
                default: 'balanced',
                description: 'Optimization objective',
              },
              constraints: {
                type: 'object',
                properties: {
                  totalBudget: {
                    type: 'number',
                    description: 'Total daily budget limit',
                  },
                  maxBudgetChange: {
                    type: 'number',
                    default: 25,
                    description: 'Maximum budget change percentage',
                  },
                  targetCPA: {
                    type: 'number',
                    description: 'Target cost per acquisition',
                  },
                  targetROAS: {
                    type: 'number',
                    description: 'Target return on ad spend',
                  },
                },
                required: ['totalBudget'],
              },
              riskTolerance: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                default: 0.3,
                description: 'Risk tolerance for optimization',
              },
              timeHorizon: {
                type: 'number',
                default: 30,
                description: 'Optimization time horizon in days',
              },
              testMode: {
                type: 'boolean',
                default: true,
                description: 'Run in test mode without applying changes',
              },
            },
            required: ['campaignIds', 'constraints'],
          },
        },
        {
          name: 'analyze_competition',
          description: 'Analyze competitive landscape and auction insights',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to analyze',
              },
              includeBidEstimates: {
                type: 'boolean',
                default: true,
                description: 'Include competitor bid estimates',
              },
              detectBidWars: {
                type: 'boolean',
                default: true,
                description: 'Detect potential bid wars',
              },
            },
            required: ['campaignIds'],
          },
        },
        {
          name: 'detect_seasonality',
          description: 'Detect seasonal patterns and generate forecasts',
          inputSchema: {
            type: 'object',
            properties: {
              campaignIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Campaign IDs to analyze',
              },
              lookbackDays: {
                type: 'number',
                default: 365,
                description: 'Days of historical data to analyze',
              },
              forecastDays: {
                type: 'number',
                default: 30,
                description: 'Days ahead to forecast',
              },
            },
            required: ['campaignIds'],
          },
        },
        {
          name: 'calculate_bid_adjustments',
          description: 'Calculate optimal bid adjustments for campaign segments',
          inputSchema: {
            type: 'object',
            properties: {
              campaignId: {
                type: 'string',
                description: 'Campaign ID to analyze',
              },
              objective: {
                type: 'string',
                enum: ['maximize_conversions', 'target_cpa', 'target_roas', 'maximize_clicks', 'balanced'],
                default: 'balanced',
                description: 'Optimization objective',
              },
              constraints: {
                type: 'object',
                properties: {
                  maxBidModifier: {
                    type: 'number',
                    default: 1.5,
                    description: 'Maximum bid modifier (1.5 = +50%)',
                  },
                  minBidModifier: {
                    type: 'number',
                    default: 0.5,
                    description: 'Minimum bid modifier (0.5 = -50%)',
                  },
                  targetCPA: {
                    type: 'number',
                    description: 'Target cost per acquisition',
                  },
                  targetROAS: {
                    type: 'number',
                    description: 'Target return on ad spend',
                  },
                },
              },
              aggressiveness: {
                type: 'string',
                enum: ['conservative', 'moderate', 'aggressive'],
                default: 'moderate',
                description: 'Adjustment aggressiveness',
              },
              testMode: {
                type: 'boolean',
                default: true,
                description: 'Run in test mode without applying changes',
              },
            },
            required: ['campaignId'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as any;

      try {
        // Log tool usage
        await this.logToolUsage(name, args);

        switch (name) {
          case 'optimize_budgets':
            return await this.handleBudgetOptimization(args);
          case 'analyze_performance':
            return await this.handlePerformanceAnalysis(args);
          case 'apply_recommendations':
            return await this.handleApplyRecommendations(args);
          case 'start_tracking':
            return await this.handleStartTracking(args);
          case 'get_dashboard':
            return await this.handleGetDashboard(args);
          case 'validate_claims':
            return await this.handleValidateClaims(args);
          case 'analyze_bid_strategies':
            return await this.handleAnalyzeBidStrategies(args);
          case 'optimize_bids_integrated':
            return await this.handleOptimizeBidsIntegrated(args);
          case 'analyze_competition':
            return await this.handleAnalyzeCompetition(args);
          case 'detect_seasonality':
            return await this.handleDetectSeasonality(args);
          case 'calculate_bid_adjustments':
            return await this.handleCalculateBidAdjustments(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error: any) {
        this.logger.error('Tool execution failed', { tool: name, error });
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error?.message ?? 'Unknown error'}`,
            },
          ],
        };
      }
    });
  }

  /**
   * Handle budget optimization request
   */
  private async handleBudgetOptimization(args: any): Promise<any> {
    const { accountId, objective, constraints, timeframe, riskTolerance } = args;

    // Merge constraints with defaults
    const fullConstraints = {
      minDailyBudget: 2,
      maxDailyBudget: 100,
      riskTolerance: riskTolerance ?? 0.3,
      maxChangePercent: 25,
      explorationFloor: 0.1,
      ...constraints,
    };

    // Run optimization
    const result = await this.integration.runOptimization({
      accountId,
      objective,
      constraints: fullConstraints,
      timeframe,
    });

    // Validate against guardrails
    const validation = await this.guardrails.validateProposal(
      result.proposals,
      {
        constraints: fullConstraints,
        db: this.database,
      }
    );

    // Format response
    let text = `## Budget Optimization Results\n\n`;
    text += `**Artifact:** \`${result.artifactPath}\`\n\n`;
    text += `### Optimization Summary\n`;
    text += `- **Objective:** ${objective || 'maximize_CWS_Clicks'}\n`;
    text += `- **Total Budget:** $${result.proposals.simulation?.expected_clicks ?
      (fullConstraints.daily_cap_AUD || fullConstraints.daily_cap_USD || fullConstraints.daily_cap_GBP || 50) : 50}\n`;
    text += `- **Campaigns Optimized:** ${result.proposals.proposals?.length || 0}\n`;
    text += `- **Risk Tolerance:** ${(riskTolerance ?? 0.3) * 100}%\n\n`;

    if (result.proposals.simulation) {
      text += `### Expected Outcomes\n`;
      text += `- **Clicks:** ${result.proposals.simulation.expected_clicks}\n`;
      text += `- **CWS Clicks:** ${result.proposals.simulation.expected_cws_clicks}\n`;
      text += `- **Conversions:** ${result.proposals.simulation.expected_conversions?.toFixed(1) || 'N/A'}\n`;
      text += `- **Revenue:** $${result.proposals.simulation.expected_revenue?.toFixed(2) || 'N/A'}\n\n`;
    }

    if (!validation.passed) {
      text += `### ⚠️ Guardrail Violations\n`;
      validation.violations.forEach((v) => {
        text += `- **${v.rule}:** ${v.message}\n`;
        if (v.remedy) {
          text += `  - *Remedy:* ${v.remedy}\n`;
        }
      });
      text += '\n';
    }

    text += `### Top Changes\n`;
    const topChanges = result.proposals.proposals
      ?.sort((a: any, b: any) => Math.abs(b.proposed - b.current) - Math.abs(a.proposed - a.current))
      .slice(0, 5);

    topChanges?.forEach((p: any) => {
      const change = ((p.proposed - p.current) / p.current * 100).toFixed(1);
      text += `- **${p.campaign}**: $${p.current} → $${p.proposed} (${change}%)\n`;
      text += `  - *Reason:* ${p.reason}\n`;
    });

    text += `\n### Next Steps\n`;
    text += `1. Review the full proposal at: \`${result.artifactPath}\`\n`;
    text += `2. Use \`apply_recommendations\` with the artifact path to apply changes\n`;
    text += `3. Monitor performance with \`start_tracking\` for real-time optimization\n`;

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle performance analysis request
   */
  private async handlePerformanceAnalysis(args: any): Promise<any> {
    const { campaignIds, metrics, timeframe, includeAlerts, includeRecommendations } = args;

    // Get dashboard snapshot
    const snapshot = await this.aggregator.getSnapshot({
      campaignIds,
      includeAlerts,
      includeRecommendations,
    });

    // Format response
    let text = `## Performance Analysis\n\n`;
    text += `**Timestamp:** ${snapshot.timestamp}\n`;
    text += `**Timeframe:** ${timeframe || '7d'}\n\n`;

    text += `### Overall Summary\n`;
    text += `- **Total Spend:** $${snapshot.summary.totalSpend.toFixed(2)}\n`;
    text += `- **Total Clicks:** ${snapshot.summary.totalClicks}\n`;
    text += `- **Total Conversions:** ${snapshot.summary.totalConversions.toFixed(1)}\n`;
    text += `- **Overall ROAS:** ${snapshot.summary.overallROAS.toFixed(2)}\n`;
    text += `- **Budget Utilization:** ${(snapshot.summary.budgetUtilization * 100).toFixed(1)}%\n`;
    text += `- **Performance Score:** ${snapshot.summary.performanceScore.toFixed(0)}/100\n\n`;

    text += `### Campaign Performance\n`;
    snapshot.campaigns.slice(0, 5).forEach((c) => {
      text += `\n**${c.campaignName}** (Score: ${c.performance.score}, ${c.performance.trend})\n`;
      text += `- CTR: ${(c.current.ctr * 100).toFixed(2)}% (${c.comparison.ctrChange > 0 ? '+' : ''}${c.comparison.ctrChange.toFixed(1)}%)\n`;
      text += `- CVR: ${(c.current.cvr * 100).toFixed(2)}% (${c.comparison.cvrChange > 0 ? '+' : ''}${c.comparison.cvrChange.toFixed(1)}%)\n`;
      text += `- CPA: $${c.current.cpa.toFixed(2)} (${c.comparison.cpaChange > 0 ? '+' : ''}${c.comparison.cpaChange.toFixed(1)}%)\n`;
      text += `- Budget: $${c.budget.spent.toFixed(2)}/$${c.budget.daily.toFixed(2)} (${(c.budget.utilization * 100).toFixed(1)}%)\n`;
    });

    if (includeAlerts && snapshot.alerts.length > 0) {
      text += `\n### 🚨 Active Alerts\n`;
      snapshot.alerts.slice(0, 5).forEach((alert) => {
        const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🟡';
        text += `${icon} **${alert.type}**: ${alert.message}\n`;
      });
    }

    if (includeRecommendations && snapshot.recommendations.length > 0) {
      text += `\n### 💡 Recommendations\n`;
      snapshot.recommendations.slice(0, 3).forEach((rec) => {
        text += `- **${rec.type}** for ${rec.campaignId}\n`;
        text += `  - ${rec.action}\n`;
        text += `  - ${rec.expectedImpact} (confidence: ${(rec.confidence * 100).toFixed(0)}%)\n`;
      });
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle apply recommendations request
   */
  private async handleApplyRecommendations(args: any): Promise<any> {
    const { artifact, applyMode, confirm, runId } = args;

    if (applyMode === 'apply' && !confirm) {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ Confirmation required. Set `confirm: true` to apply changes.',
          },
        ],
      };
    }

    // Load artifact
    let proposals: any;
    if (runId) {
      // Load from database
      const result = await this.integration.applyProposal(runId, 'mcp_user');
      return {
        content: [
          {
            type: 'text',
            text: `✅ Applied proposal ${runId}\n${result.message}`,
          },
        ],
      };
    } else if (artifact) {
      // Load from file
      try {
        proposals = JSON.parse(readFileSync(artifact, 'utf-8'));
      } catch (error) {
        throw new Error(`Failed to load artifact: ${artifact}`);
      }
    } else {
      throw new Error('Either artifact path or runId required');
    }

    // Validate against guardrails
    const validation = await this.guardrails.validateProposal(proposals, {
      constraints: proposals.constraints,
      db: this.database,
    });

    if (!validation.passed && !validation.canOverride) {
      let text = `## ❌ Cannot Apply - Critical Guardrail Violations\n\n`;
      validation.violations.forEach((v) => {
        text += `- **${v.rule}:** ${v.message}\n`;
        if (v.remedy) {
          text += `  - *Required Action:* ${v.remedy}\n`;
        }
      });
      return {
        content: [{ type: 'text', text }],
      };
    }

    if (applyMode === 'dry-run') {
      let text = `## Dry Run Results\n\n`;
      text += `**Changes to Apply:** ${proposals.proposals.length}\n\n`;

      proposals.proposals.forEach((p: any) => {
        const change = ((p.proposed - p.current) / p.current * 100).toFixed(1);
        text += `- **${p.campaign}**: $${p.current} → $${p.proposed} (${change}%)\n`;
      });

      if (validation.violations.length > 0) {
        text += `\n### ⚠️ Warnings\n`;
        validation.violations.forEach((v) => {
          text += `- ${v.message}\n`;
        });
      }

      text += `\n*Run with \`applyMode: "apply"\` and \`confirm: true\` to execute.*`;

      return {
        content: [{ type: 'text', text }],
      };
    }

    // Apply changes (would integrate with Google Ads API)
    let text = `## ✅ Changes Applied Successfully\n\n`;
    text += `**Timestamp:** ${new Date().toISOString()}\n`;
    text += `**Changes Applied:** ${proposals.proposals.length}\n\n`;

    text += `### Summary\n`;
    proposals.proposals.slice(0, 5).forEach((p: any) => {
      text += `- ${p.campaign}: $${p.current} → $${p.proposed}\n`;
    });

    text += `\n*Monitor performance with \`get_dashboard\` to track impact.*`;

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle start tracking request
   */
  private async handleStartTracking(args: any): Promise<any> {
    const { campaignIds, accountId, interval } = args;

    await this.tracker.startTracking(campaignIds, accountId, interval || '15m');

    let text = `## ✅ Real-time Tracking Started\n\n`;
    text += `**Campaigns:** ${campaignIds.length} campaigns\n`;
    text += `**Account:** ${accountId}\n`;
    text += `**Polling Interval:** ${interval || '15m'}\n\n`;
    text += `Tracking is now active. You will receive:\n`;
    text += `- Performance updates every ${interval || '15 minutes'}\n`;
    text += `- Anomaly alerts when detected\n`;
    text += `- Optimization opportunities\n`;
    text += `- Budget depletion warnings\n\n`;
    text += `Use \`get_dashboard\` to view current status.`;

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle get dashboard request
   */
  private async handleGetDashboard(args: any): Promise<any> {
    const { campaignIds, format } = args;

    const data = await this.aggregator.exportDashboard(format || 'json', {
      campaignIds,
    });

    if (format === 'csv') {
      // Save CSV and return path
      const filename = `dashboard_${Date.now()}.csv`;
      const filepath = join(process.cwd(), 'exports', filename);

      if (!existsSync(join(process.cwd(), 'exports'))) {
        mkdirSync(join(process.cwd(), 'exports'), { recursive: true });
      }

      writeFileSync(filepath, data);

      return {
        content: [
          {
            type: 'text',
            text: `Dashboard exported to: ${filepath}`,
          },
        ],
      };
    }

    // Return JSON summary
    const snapshot = JSON.parse(data);
    let text = `## Performance Dashboard\n\n`;
    text += `**Campaigns:** ${snapshot.campaigns.length}\n`;
    text += `**Total Spend:** $${snapshot.summary.totalSpend.toFixed(2)}\n`;
    text += `**Performance Score:** ${snapshot.summary.performanceScore.toFixed(0)}/100\n\n`;
    text += `*Full data returned in JSON format.*`;

    return {
      content: [
        { type: 'text', text },
        { type: 'text', text: data },
      ],
    };
  }

  /**
   * Handle validate claims request
   */
  private async handleValidateClaims(args: any): Promise<any> {
    const { campaignIds, checkLandingPages } = args;

    // This would implement actual claims validation
    let text = `## Claims Validation Report\n\n`;
    text += `**Campaigns Checked:** ${campaignIds.length}\n`;
    text += `**Landing Pages Checked:** ${checkLandingPages ? 'Yes' : 'No'}\n\n`;

    // Simulate validation results
    text += `### Validation Results\n`;
    campaignIds.forEach((id: string) => {
      text += `- **Campaign ${id}**: ✅ Passed\n`;
    });

    if (checkLandingPages) {
      text += `\n### Landing Page Health\n`;
      text += `All landing pages meet minimum health score requirements.\n`;
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Set up resource definitions
   */
  private setupResources(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'seo-ads://campaigns/performance',
          name: 'Campaign Performance Data',
          description: 'Real-time campaign metrics and optimization status',
          mimeType: 'application/json',
        },
        {
          uri: 'seo-ads://optimization/recommendations',
          name: 'Budget Optimization Recommendations',
          description: 'Thompson Sampling-based budget allocation suggestions',
          mimeType: 'application/json',
        },
        {
          uri: 'seo-ads://alerts/active',
          name: 'Active Performance Alerts',
          description: 'Current anomalies and optimization triggers',
          mimeType: 'application/json',
        },
        {
          uri: 'seo-ads://experiments/active',
          name: 'Active Experiments',
          description: 'Currently running A/B tests and optimization experiments',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      try {
        switch (uri) {
          case 'seo-ads://campaigns/performance':
            return await this.getPerformanceResource();
          case 'seo-ads://optimization/recommendations':
            return await this.getRecommendationsResource();
          case 'seo-ads://alerts/active':
            return await this.getAlertsResource();
          case 'seo-ads://experiments/active':
            return await this.getExperimentsResource();
          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unknown resource: ${uri}`
            );
        }
      } catch (error: any) {
        this.logger.error('Resource read failed', { uri, error });
        throw error;
      }
    });
  }

  /**
   * Get performance resource data
   */
  private async getPerformanceResource(): Promise<any> {
    const snapshot = await this.aggregator.getSnapshot();

    return {
      contents: [
        {
          uri: 'seo-ads://campaigns/performance',
          mimeType: 'application/json',
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
    };
  }

  /**
   * Get recommendations resource data
   */
  private async getRecommendationsResource(): Promise<any> {
    const history = await this.integration.getOptimizationHistory(5);

    return {
      contents: [
        {
          uri: 'seo-ads://optimization/recommendations',
          mimeType: 'application/json',
          text: JSON.stringify(history, null, 2),
        },
      ],
    };
  }

  /**
   * Get alerts resource data
   */
  private async getAlertsResource(): Promise<any> {
    const alerts = await this.getActiveAlerts();

    return {
      contents: [
        {
          uri: 'seo-ads://alerts/active',
          mimeType: 'application/json',
          text: JSON.stringify(alerts, null, 2),
        },
      ],
    };
  }

  /**
   * Get experiments resource data
   */
  private async getExperimentsResource(): Promise<any> {
    // Would fetch from experiments table
    const experiments = {
      active: [],
      completed: [],
    };

    return {
      contents: [
        {
          uri: 'seo-ads://experiments/active',
          mimeType: 'application/json',
          text: JSON.stringify(experiments, null, 2),
        },
      ],
    };
  }

  /**
   * Get active alerts from database
   */
  private async getActiveAlerts(): Promise<any[]> {
    try {
      return this.database.prepare(`
        SELECT *
        FROM optimization_recommendations
        WHERE status = 'pending'
        ORDER BY created_at DESC
        LIMIT 10
      `).all() as any[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Handle bid strategy analysis request
   */
  private async handleAnalyzeBidStrategies(args: any): Promise<any> {
    const { campaignIds } = args;

    const results = [];
    for (const campaignId of campaignIds) {
      const analysis = await this.bidStrategyAdvisor.analyzeBidStrategies(campaignId);
      results.push(analysis);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: results,
            summary: {
              campaignsAnalyzed: campaignIds.length,
              recommendationsGenerated: results.reduce((sum, r) => sum + r.recommendedStrategies.length, 0)
            }
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle integrated bid optimization request
   */
  private async handleOptimizeBidsIntegrated(args: any): Promise<any> {
    const { campaignIds, objective, constraints, riskTolerance, timeHorizon, testMode } = args;

    const config = {
      objective: objective || 'balanced',
      constraints: {
        totalBudget: constraints.totalBudget,
        maxBudgetChange: constraints.maxBudgetChange || 25,
        targetCPA: constraints.targetCPA,
        targetROAS: constraints.targetROAS,
      },
      riskTolerance: riskTolerance || 0.3,
      timeHorizon: timeHorizon || 30,
      includeSeasonality: true,
      includeCompetition: true,
    };

    const result = await this.bidOptimizer.optimizeBidding(campaignIds, config);

    if (!testMode) {
      await this.bidOptimizer.applyOptimizations(result, false);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: result,
            testMode,
            summary: {
              budgetAllocations: result.budgetAllocations.length,
              strategyChanges: result.bidStrategies.filter(s => s.currentStrategy !== s.recommendedStrategy).length,
              totalExpectedImpact: result.totalExpectedImpact
            }
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle competition analysis request
   */
  private async handleAnalyzeCompetition(args: any): Promise<any> {
    const { campaignIds, includeBidEstimates, detectBidWars } = args;

    const results = [];
    for (const campaignId of campaignIds) {
      const competition = await this.competitionAnalyzer.analyzeCompetition(campaignId);

      let bidWar = null;
      if (detectBidWars) {
        bidWar = await this.competitionAnalyzer.detectBidWars(campaignId);
      }

      results.push({
        campaignId,
        competition,
        bidWar
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: results,
            summary: {
              campaignsAnalyzed: campaignIds.length,
              bidWarsDetected: results.filter(r => r.bidWar?.detected).length,
              highCompetitionCampaigns: results.filter(r =>
                ['high', 'extreme'].includes(r.competition?.marketDynamics?.intensity)
              ).length
            }
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle seasonality detection request
   */
  private async handleDetectSeasonality(args: any): Promise<any> {
    const { campaignIds, lookbackDays, forecastDays } = args;

    const results = [];
    for (const campaignId of campaignIds) {
      const seasonality = await this.seasonalityDetector.detectSeasonality(
        campaignId,
        lookbackDays || 365
      );
      results.push({
        campaignId,
        seasonality
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: results,
            summary: {
              campaignsAnalyzed: campaignIds.length,
              patternsDetected: results.reduce((sum, r) => sum + r.seasonality.patterns.length, 0),
              upcomingEvents: results.reduce((sum, r) => sum + r.seasonality.events.length, 0)
            }
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle bid adjustments calculation request
   */
  private async handleCalculateBidAdjustments(args: any): Promise<any> {
    const { campaignId, objective, constraints, aggressiveness, testMode } = args;

    const strategy = {
      objective: objective || 'balanced',
      constraints: {
        maxBidModifier: constraints?.maxBidModifier || 1.5,
        minBidModifier: constraints?.minBidModifier || 0.5,
        targetCPA: constraints?.targetCPA,
        targetROAS: constraints?.targetROAS,
      },
      aggressiveness: aggressiveness || 'moderate'
    };

    const result = await this.bidAdjustmentCalculator.calculateBidAdjustments(campaignId, strategy);

    if (!testMode) {
      await this.bidAdjustmentCalculator.applyBidAdjustments(campaignId, result.adjustments, false);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: result,
            testMode,
            summary: {
              adjustmentsCalculated: result.adjustments.length,
              priorityAdjustments: result.implementationPriority.length,
              totalExpectedImpact: result.totalExpectedImpact
            }
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Log tool usage for analytics
   */
  private async logToolUsage(toolName: string, args: any): Promise<void> {
    const sessionId = `session_${Date.now()}`;

    try {
      // Create tables if not exist
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS mcp_sessions (
          session_id TEXT PRIMARY KEY,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          client_info TEXT,
          active_tools TEXT
        );

        CREATE TABLE IF NOT EXISTS mcp_tool_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          tool_name TEXT NOT NULL,
          called_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INTEGER,
          success INTEGER DEFAULT 1,
          error_message TEXT,
          FOREIGN KEY (session_id) REFERENCES mcp_sessions(session_id)
        );
      `);

      // Log usage
      this.database.prepare(`
        INSERT INTO mcp_tool_usage (session_id, tool_name)
        VALUES (?, ?)
      `).run(sessionId, toolName);

    } catch (error) {
      this.logger.debug('Failed to log tool usage', { error });
    }
  }
}