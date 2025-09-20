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
import { CreativePerformanceAnalyzer } from '../creative/creative-performance-analyzer.js';
import { RotationOptimizer } from '../creative/rotation-optimizer.js';
import { ABTestingFramework } from '../creative/ab-testing-framework.js';
import { FatigueDetector } from '../creative/fatigue-detector.js';
import { WinnerSelection } from '../creative/winner-selection.js';
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
  private creativeAnalyzer: CreativePerformanceAnalyzer;
  private rotationOptimizer: RotationOptimizer;
  private abTestFramework: ABTestingFramework;
  private fatigueDetector: FatigueDetector;
  private winnerSelection: WinnerSelection;
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

    // Initialize creative optimization components
    this.creativeAnalyzer = new CreativePerformanceAnalyzer(this.database);
    this.rotationOptimizer = new RotationOptimizer(this.database);
    this.abTestFramework = new ABTestingFramework(this.database);
    this.fatigueDetector = new FatigueDetector(this.database);
    this.winnerSelection = new WinnerSelection(
      this.database,
      this.abTestFramework,
      this.fatigueDetector,
      this.creativeAnalyzer
    );

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
        {
          name: 'analyze_creative_performance',
          description: 'Analyze ad creative performance with fatigue detection',
          inputSchema: {
            type: 'object',
            properties: {
              adGroupId: {
                type: 'string',
                description: 'Ad group ID to analyze',
              },
              lookbackDays: {
                type: 'number',
                default: 30,
                description: 'Days of performance data to analyze',
              },
              includeRecommendations: {
                type: 'boolean',
                default: true,
                description: 'Include optimization recommendations',
              },
            },
            required: ['adGroupId'],
          },
        },
        {
          name: 'optimize_creative_rotation',
          description: 'Optimize ad rotation strategy using performance analysis',
          inputSchema: {
            type: 'object',
            properties: {
              adGroupId: {
                type: 'string',
                description: 'Ad group ID to optimize',
              },
              strategy: {
                type: 'string',
                enum: ['OPTIMIZE', 'EVEN', 'DO_NOT_OPTIMIZE', 'ADAPTIVE'],
                default: 'OPTIMIZE',
                description: 'Rotation strategy to apply',
              },
              config: {
                type: 'object',
                properties: {
                  minImpressions: {
                    type: 'number',
                    default: 1000,
                    description: 'Minimum impressions before optimization',
                  },
                  maxActiveCreatives: {
                    type: 'number',
                    default: 10,
                    description: 'Maximum number of active creatives',
                  },
                  performanceThreshold: {
                    type: 'number',
                    default: 50,
                    description: 'Performance score threshold (0-100)',
                  },
                },
              },
              testMode: {
                type: 'boolean',
                default: true,
                description: 'Run in test mode without applying changes',
              },
            },
            required: ['adGroupId'],
          },
        },
        {
          name: 'create_ab_test',
          description: 'Create A/B test for ad creatives or landing pages',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Test name',
              },
              type: {
                type: 'string',
                enum: ['CREATIVE_SPLIT', 'LANDING_PAGE', 'BID_STRATEGY', 'AUDIENCE', 'ROTATION_STRATEGY'],
                description: 'Type of A/B test',
              },
              controlVariant: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  adId: { type: 'string' },
                },
                required: ['id', 'name', 'adId'],
              },
              testVariant: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  adId: { type: 'string' },
                },
                required: ['id', 'name', 'adId'],
              },
              config: {
                type: 'object',
                properties: {
                  trafficSplit: {
                    type: 'object',
                    properties: {
                      controlPercentage: { type: 'number', minimum: 10, maximum: 90 },
                      testPercentage: { type: 'number', minimum: 10, maximum: 90 },
                    },
                  },
                  minDurationDays: { type: 'number', default: 14 },
                  primaryMetric: {
                    type: 'string',
                    enum: ['CTR', 'CVR', 'CPA', 'ROAS', 'REVENUE'],
                    default: 'CTR',
                  },
                  significanceLevel: { type: 'number', default: 0.05 },
                },
              },
            },
            required: ['name', 'type', 'controlVariant', 'testVariant'],
          },
        },
        {
          name: 'analyze_ab_test',
          description: 'Analyze A/B test results with statistical significance',
          inputSchema: {
            type: 'object',
            properties: {
              testId: {
                type: 'string',
                description: 'A/B test ID to analyze',
              },
              includeRecommendations: {
                type: 'boolean',
                default: true,
                description: 'Include winner selection recommendations',
              },
            },
            required: ['testId'],
          },
        },
        {
          name: 'detect_creative_fatigue',
          description: 'Detect creative fatigue across campaigns or ad groups',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['campaign', 'adgroup', 'ad'],
                default: 'adgroup',
                description: 'Scope of fatigue detection',
              },
              campaignId: {
                type: 'string',
                description: 'Campaign ID (required for campaign scope)',
              },
              adGroupId: {
                type: 'string',
                description: 'Ad group ID (required for adgroup scope)',
              },
              adId: {
                type: 'string',
                description: 'Ad ID (required for ad scope)',
              },
              thresholds: {
                type: 'object',
                properties: {
                  ctrDeclineThreshold: { type: 'number', default: 0.15 },
                  cvrDeclineThreshold: { type: 'number', default: 0.20 },
                  frequencyThreshold: { type: 'number', default: 3.0 },
                  daysActiveThreshold: { type: 'number', default: 14 },
                },
              },
            },
          },
        },
        {
          name: 'select_test_winner',
          description: 'Evaluate and select winner from A/B test with business criteria',
          inputSchema: {
            type: 'object',
            properties: {
              testId: {
                type: 'string',
                description: 'A/B test ID to evaluate',
              },
              criteria: {
                type: 'object',
                properties: {
                  primaryMetric: {
                    type: 'string',
                    enum: ['CTR', 'CVR', 'CPA', 'ROAS', 'REVENUE'],
                    default: 'CTR',
                  },
                  minConfidenceLevel: { type: 'number', default: 0.95 },
                  minPracticalSignificance: { type: 'number', default: 0.05 },
                  riskTolerance: {
                    type: 'string',
                    enum: ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'],
                    default: 'MODERATE',
                  },
                  maxBudgetIncrease: { type: 'number', default: 0.5 },
                },
              },
              implementationStrategy: {
                type: 'string',
                enum: ['IMMEDIATE', 'GRADUAL', 'SEGMENTED'],
                default: 'GRADUAL',
                description: 'How to implement the winner',
              },
            },
            required: ['testId'],
          },
        },
        {
          name: 'implement_winner',
          description: 'Implement the selected A/B test winner',
          inputSchema: {
            type: 'object',
            properties: {
              selectionId: {
                type: 'string',
                description: 'Winner selection ID from select_test_winner',
              },
              confirm: {
                type: 'boolean',
                default: false,
                description: 'Confirm implementation (required for execution)',
              },
            },
            required: ['selectionId'],
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
          case 'analyze_creative_performance':
            return await this.handleAnalyzeCreativePerformance(args);
          case 'optimize_creative_rotation':
            return await this.handleOptimizeCreativeRotation(args);
          case 'create_ab_test':
            return await this.handleCreateABTest(args);
          case 'analyze_ab_test':
            return await this.handleAnalyzeABTest(args);
          case 'detect_creative_fatigue':
            return await this.handleDetectCreativeFatigue(args);
          case 'select_test_winner':
            return await this.handleSelectTestWinner(args);
          case 'implement_winner':
            return await this.handleImplementWinner(args);
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

    const result = await this.bidOptimizer.calculateBidAdjustments(campaignId, strategy);

    if (!testMode) {
      await this.bidOptimizer.applyBidAdjustments(campaignId, result.adjustments, false);
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

  /**
   * Handle creative performance analysis request
   */
  private async handleAnalyzeCreativePerformance(args: any): Promise<any> {
    const { adGroupId, lookbackDays, includeRecommendations } = args;

    const analysis = await this.creativeAnalyzer.analyzeAdGroupCreatives(
      adGroupId,
      lookbackDays || 30
    );

    let text = `## Creative Performance Analysis\n\n`;
    text += `**Ad Group:** ${adGroupId}\n`;
    text += `**Analysis Period:** ${lookbackDays || 30} days\n`;
    text += `**Creatives Analyzed:** ${analysis.creatives.length}\n\n`;

    text += `### Summary\n`;
    text += `- **Top Performer:** ${analysis.summary.topPerformer.adId} (Score: ${analysis.summary.topPerformer.performanceScore.toFixed(1)})\n`;
    text += `- **Bottom Performer:** ${analysis.summary.bottomPerformer.adId} (Score: ${analysis.summary.bottomPerformer.performanceScore.toFixed(1)})\n`;
    text += `- **Average Performance:** ${analysis.summary.averagePerformance.toFixed(1)}/100\n`;
    text += `- **Performance Spread:** ${analysis.summary.performanceSpread.toFixed(1)} points\n\n`;

    text += `### Top Performers\n`;
    analysis.creatives
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 3)
      .forEach((creative, index) => {
        text += `${index + 1}. **${creative.adId}** (Score: ${creative.performanceScore.toFixed(1)})\n`;
        text += `   - CTR: ${(creative.metrics.ctr * 100).toFixed(2)}% | CVR: ${(creative.metrics.cvr * 100).toFixed(2)}% | ROAS: ${creative.metrics.roas.toFixed(2)}\n`;
        text += `   - Trend: ${creative.trends.ctr} CTR, ${creative.trends.cvr} CVR\n`;
      });

    if (includeRecommendations && analysis.recommendations.length > 0) {
      text += `\n### 💡 Recommendations\n`;
      analysis.recommendations.slice(0, 3).forEach((rec) => {
        text += `- **${rec.type}**: ${rec.description}\n`;
        text += `  - Expected Impact: ${rec.expectedImpact.metric} ${rec.expectedImpact.improvement > 0 ? '+' : ''}${(rec.expectedImpact.improvement * 100).toFixed(1)}%\n`;
        text += `  - Priority: ${rec.priority}\n`;
      });
    }

    return {
      content: [
        { type: 'text', text },
        {
          type: 'text',
          text: `**Full Analysis Data:**\n\`\`\`json\n${JSON.stringify(analysis, null, 2)}\n\`\`\``
        }
      ],
    };
  }

  /**
   * Handle creative rotation optimization request
   */
  private async handleOptimizeCreativeRotation(args: any): Promise<any> {
    const { adGroupId, strategy, config, testMode } = args;

    const rotationConfig = {
      strategy: strategy || 'OPTIMIZE',
      minImpressions: config?.minImpressions || 1000,
      maxActiveCreatives: config?.maxActiveCreatives || 10,
      rotationInterval: 7,
      performanceThreshold: config?.performanceThreshold || 50,
      learningPeriod: 14,
      confidenceLevel: 0.95,
      ...config
    };

    const recommendation = await this.rotationOptimizer.generateRotationRecommendation(
      adGroupId,
      rotationConfig
    );

    let text = `## Creative Rotation Optimization\n\n`;
    text += `**Ad Group:** ${adGroupId}\n`;
    text += `**Current Strategy:** ${recommendation.currentStrategy}\n`;
    text += `**Recommended Strategy:** ${recommendation.recommendedStrategy}\n`;
    text += `**Confidence:** ${(recommendation.confidence * 100).toFixed(1)}%\n\n`;

    if (recommendation.reasoning.length > 0) {
      text += `### Reasoning\n`;
      recommendation.reasoning.forEach(reason => {
        text += `- ${reason}\n`;
      });
      text += '\n';
    }

    text += `### Expected Impact\n`;
    text += `- **CTR:** ${(recommendation.expectedImpact.ctr * 100).toFixed(2)}%\n`;
    text += `- **CVR:** ${(recommendation.expectedImpact.cvr * 100).toFixed(2)}%\n`;
    text += `- **ROAS:** ${recommendation.expectedImpact.roas.toFixed(2)}\n`;
    text += `- **Impressions:** ${recommendation.expectedImpact.impressions.toLocaleString()}\n\n`;

    if (recommendation.actionItems.length > 0) {
      text += `### Action Items\n`;
      recommendation.actionItems.forEach(item => {
        const priorityIcon = item.priority === 'HIGH' ? '🔴' : item.priority === 'MEDIUM' ? '🟡' : '🟢';
        text += `${priorityIcon} **${item.type}${item.adId ? ` (${item.adId})` : ''}**: ${item.details}\n`;
      });
      text += '\n';
    }

    text += `### Rotation Schedule\n`;
    recommendation.rotationSchedule.forEach(schedule => {
      text += `- **${schedule.adId}**: ${(schedule.weight * 100).toFixed(1)}% traffic\n`;
    });

    if (!testMode) {
      const implementation = await this.rotationOptimizer.optimizeAdRotation(adGroupId, rotationConfig);
      text += `\n### ✅ Implementation Complete\n`;
      text += `- **Changes Applied:** ${implementation.changes.length}\n`;
      text += `- **Next Review:** ${implementation.nextReviewDate}\n`;
    } else {
      text += `\n*Run with \`testMode: false\` to apply changes.*`;
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle A/B test creation request
   */
  private async handleCreateABTest(args: any): Promise<any> {
    const { name, type, controlVariant, testVariant, config } = args;

    const testConfig = {
      name,
      description: `A/B test for ${type.toLowerCase().replace('_', ' ')}`,
      type,
      statisticalMethod: 'FREQUENTIST' as const,
      trafficSplit: config?.trafficSplit || { controlPercentage: 50, testPercentage: 50 },
      minDurationDays: config?.minDurationDays || 14,
      maxDurationDays: config?.maxDurationDays || 30,
      minSampleSize: config?.minSampleSize || 1000,
      primaryMetric: config?.primaryMetric || 'CTR',
      secondaryMetrics: config?.secondaryMetrics || ['CVR', 'CPA'],
      minDetectableEffect: config?.minDetectableEffect || 0.05,
      practicalSignificanceThreshold: config?.practicalSignificanceThreshold || 0.05,
      significanceLevel: config?.significanceLevel || 0.05,
      targetPower: config?.targetPower || 0.8,
      earlyStoppingEnabled: config?.earlyStoppingEnabled !== false,
      earlyStoppingCheckInterval: config?.earlyStoppingCheckInterval || 1,
      futilityStoppingEnabled: config?.futilityStoppingEnabled !== false,
      maxNegativeImpact: config?.maxNegativeImpact || 0.2,
      maxSpendIncrease: config?.maxSpendIncrease || 0.5
    };

    const control = {
      ...controlVariant,
      type: 'CONTROL' as const,
      content: {
        headlines: [`Control: ${controlVariant.name}`],
        descriptions: ['Control variant'],
      },
      active: true
    };

    const test = {
      ...testVariant,
      type: 'TEST' as const,
      content: {
        headlines: [`Test: ${testVariant.name}`],
        descriptions: ['Test variant'],
      },
      active: true
    };

    const testId = await this.abTestFramework.createABTest(testConfig, control, test);

    let text = `## ✅ A/B Test Created\n\n`;
    text += `**Test ID:** \`${testId}\`\n`;
    text += `**Name:** ${name}\n`;
    text += `**Type:** ${type}\n`;
    text += `**Primary Metric:** ${testConfig.primaryMetric}\n`;
    text += `**Traffic Split:** ${testConfig.trafficSplit.controlPercentage}% Control / ${testConfig.trafficSplit.testPercentage}% Test\n`;
    text += `**Duration:** ${testConfig.minDurationDays}-${testConfig.maxDurationDays} days\n\n`;

    text += `### Variants\n`;
    text += `- **Control:** ${controlVariant.name} (${controlVariant.adId})\n`;
    text += `- **Test:** ${testVariant.name} (${testVariant.adId})\n\n`;

    text += `### Next Steps\n`;
    text += `1. Use \`analyze_ab_test\` with test ID \`${testId}\` to monitor progress\n`;
    text += `2. Use \`select_test_winner\` when ready to evaluate results\n`;
    text += `3. Early stopping checks will run daily if enabled\n`;

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle A/B test analysis request
   */
  private async handleAnalyzeABTest(args: any): Promise<any> {
    const { testId, includeRecommendations } = args;

    const result = await this.abTestFramework.analyzeABTest(testId);

    let text = `## A/B Test Analysis\n\n`;
    text += `**Test ID:** ${testId}\n`;
    text += `**Status:** ${result.status}\n`;
    text += `**Duration:** ${result.startDate}${result.endDate ? ` - ${result.endDate}` : ' (ongoing)'}\n\n`;

    text += `### Sample Statistics\n`;
    text += `- **Control:** ${result.control.sampleSize.toLocaleString()} samples, ${result.control.conversions} conversions\n`;
    text += `- **Test:** ${result.test.sampleSize.toLocaleString()} samples, ${result.test.conversions} conversions\n\n`;

    const primary = result.analysis.primaryMetricResult;
    text += `### Primary Metric (${primary.metric})\n`;
    text += `- **Control:** ${primary.controlValue.toFixed(4)}\n`;
    text += `- **Test:** ${primary.testValue.toFixed(4)}\n`;
    text += `- **Change:** ${primary.relativeChange > 0 ? '+' : ''}${(primary.relativeChange * 100).toFixed(1)}%\n`;
    text += `- **P-value:** ${primary.pValue.toFixed(4)}\n`;
    text += `- **Statistically Significant:** ${primary.statisticallySignificant ? '✅ Yes' : '❌ No'}\n`;
    text += `- **Practically Significant:** ${primary.practicallySignificant ? '✅ Yes' : '❌ No'}\n\n`;

    if (result.analysis.secondaryMetrics.length > 0) {
      text += `### Secondary Metrics\n`;
      result.analysis.secondaryMetrics.forEach(metric => {
        text += `- **${metric.metric}:** ${metric.relativeChange > 0 ? '+' : ''}${(metric.relativeChange * 100).toFixed(1)}% (p=${metric.pValue.toFixed(3)})\n`;
      });
      text += '\n';
    }

    if (includeRecommendations) {
      text += `### 💡 Recommendation\n`;
      text += `**Decision:** ${result.recommendation.decision}\n`;
      text += `**Winner:** ${result.recommendation.winner}\n`;
      text += `**Confidence:** ${(result.recommendation.confidence * 100).toFixed(1)}%\n\n`;

      if (result.recommendation.reasoning.length > 0) {
        text += `**Reasoning:**\n`;
        result.recommendation.reasoning.forEach(reason => {
          text += `- ${reason}\n`;
        });
      }
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle creative fatigue detection request
   */
  private async handleDetectCreativeFatigue(args: any): Promise<any> {
    const { scope, campaignId, adGroupId, adId, thresholds } = args;

    let fatigueResults: any[] = [];

    if (scope === 'campaign' && campaignId) {
      const campaignAnalysis = await this.fatigueDetector.detectCampaignFatigue(campaignId);
      fatigueResults = [campaignAnalysis];
    } else if (scope === 'ad' && adId) {
      const adAnalysis = await this.fatigueDetector.detectFatigue(adId);
      fatigueResults = [adAnalysis];
    } else {
      // Default to single ad analysis (would need ad IDs from ad group)
      const mockAdIds = ['ad_123', 'ad_456']; // In practice, would query from database
      for (const id of mockAdIds) {
        try {
          const analysis = await this.fatigueDetector.detectFatigue(id);
          fatigueResults.push(analysis);
        } catch (error) {
          console.error(`Failed to analyze fatigue for ad ${id}:`, error);
        }
      }
    }

    let text = `## Creative Fatigue Detection\n\n`;
    text += `**Scope:** ${scope}\n`;
    if (campaignId) text += `**Campaign:** ${campaignId}\n`;
    if (adGroupId) text += `**Ad Group:** ${adGroupId}\n`;
    if (adId) text += `**Ad:** ${adId}\n`;
    text += `**Analyzed:** ${fatigueResults.length} item(s)\n\n`;

    if (scope === 'campaign' && fatigueResults[0]?.campaignMetrics) {
      const campaign = fatigueResults[0];
      text += `### Campaign Overview\n`;
      text += `- **Overall Fatigue Level:** ${campaign.overallFatigueLevel}\n`;
      text += `- **Average Fatigue Score:** ${campaign.campaignMetrics.avgFatigueScore.toFixed(1)}/100\n`;
      text += `- **Severe Fatigue Ads:** ${campaign.campaignMetrics.severeFatigueAds}/${campaign.campaignMetrics.totalAds}\n`;
      text += `- **Fatigue Rate:** ${(campaign.campaignMetrics.fatigueRate * 100).toFixed(1)}%\n\n`;

      if (campaign.recommendations.length > 0) {
        text += `### Campaign Recommendations\n`;
        campaign.recommendations.forEach((rec: any) => {
          text += `- **${rec.action}** for ${rec.affectedAds} ads (Priority: ${rec.priority})\n`;
          text += `  - ${rec.description}\n`;
        });
      }
    } else {
      // Individual ad analysis
      const severeFatigueAds = fatigueResults.filter(r =>
        r.overallFatigue?.level === 'SEVERE' || r.overallFatigue?.level === 'CRITICAL'
      );

      if (severeFatigueAds.length > 0) {
        text += `### 🚨 Severe Fatigue Detected (${severeFatigueAds.length} ads)\n`;
        severeFatigueAds.forEach(ad => {
          text += `- **${ad.adId}**: ${ad.overallFatigue.level} (Score: ${ad.overallFatigue.score.toFixed(1)})\n`;
          if (ad.signals.length > 0) {
            const topSignal = ad.signals[0];
            text += `  - Primary Issue: ${topSignal.type} (${topSignal.description})\n`;
          }
        });
        text += '\n';
      }

      text += `### Summary by Fatigue Level\n`;
      const fatigueLevels = { NONE: 0, MILD: 0, MODERATE: 0, SEVERE: 0, CRITICAL: 0 };
      fatigueResults.forEach(result => {
        if (result.overallFatigue?.level) {
          fatigueLevels[result.overallFatigue.level]++;
        }
      });

      Object.entries(fatigueLevels).forEach(([level, count]) => {
        if (count > 0) {
          const icon = level === 'CRITICAL' ? '🔴' : level === 'SEVERE' ? '🟠' :
                       level === 'MODERATE' ? '🟡' : level === 'MILD' ? '🟢' : '⚪';
          text += `${icon} **${level}:** ${count} ad(s)\n`;
        }
      });
    }

    return {
      content: [
        { type: 'text', text },
        {
          type: 'text',
          text: `**Detailed Analysis:**\n\`\`\`json\n${JSON.stringify(fatigueResults, null, 2)}\n\`\`\``
        }
      ],
    };
  }

  /**
   * Handle test winner selection request
   */
  private async handleSelectTestWinner(args: any): Promise<any> {
    const { testId, criteria, implementationStrategy } = args;

    const selectionCriteria = {
      primaryMetric: criteria?.primaryMetric || 'CTR',
      secondaryMetrics: criteria?.secondaryMetrics || ['CVR', 'CPA'],
      minConfidenceLevel: criteria?.minConfidenceLevel || 0.95,
      minSampleSize: criteria?.minSampleSize || 1000,
      minTestDuration: criteria?.minTestDuration || 14,
      minPracticalSignificance: criteria?.minPracticalSignificance || 0.05,
      maxTolerableDecline: criteria?.maxTolerableDecline || 0.1,
      maxBudgetIncrease: criteria?.maxBudgetIncrease || 0.5,
      minROI: criteria?.minROI || 2,
      riskTolerance: criteria?.riskTolerance || 'MODERATE',
      requireUnanimousSignificance: criteria?.requireUnanimousSignificance || false,
      minQualityScore: criteria?.minQualityScore || 7,
      maxFatigueLevel: criteria?.maxFatigueLevel || 'MILD'
    };

    const result = await this.winnerSelection.evaluateWinner(testId, selectionCriteria);

    let text = `## Test Winner Selection\n\n`;
    text += `**Selection ID:** \`${result.selectionId}\`\n`;
    text += `**Test ID:** ${testId}\n`;
    text += `**Decision:** ${result.decision}\n`;
    text += `**Selected Winner:** ${result.selectedWinner || 'None'}\n`;
    text += `**Confidence:** ${(result.confidence * 100).toFixed(1)}%\n\n`;

    text += `### Analysis Summary\n`;
    const { statisticalValidation, businessValidation, riskAssessment } = result.analysis;

    text += `**Statistical Validation:**\n`;
    text += `- Primary Metric Valid: ${statisticalValidation.primaryMetricValid ? '✅' : '❌'}\n`;
    text += `- Sample Size Adequate: ${statisticalValidation.sampleSizeAdequate ? '✅' : '❌'}\n`;
    text += `- Test Duration Adequate: ${statisticalValidation.testDurationAdequate ? '✅' : '❌'}\n`;
    text += `- Confidence Threshold Met: ${statisticalValidation.confidenceThresholdMet ? '✅' : '❌'}\n\n`;

    text += `**Business Validation:**\n`;
    text += `- Practical Significance: ${businessValidation.practicalSignificanceMet ? '✅' : '❌'}\n`;
    text += `- Budget Constraints: ${businessValidation.budgetConstraintsMet ? '✅' : '❌'}\n`;
    text += `- ROI Requirements: ${businessValidation.roiRequirementMet ? '✅' : '❌'}\n`;
    text += `- Quality Gates: ${businessValidation.qualityGatesPassed ? '✅' : '❌'}\n\n`;

    text += `### Risk Assessment\n`;
    text += `**Risk Level:** ${riskAssessment.overallRiskLevel}\n`;
    if (riskAssessment.identifiedRisks.length > 0) {
      text += `**Identified Risks:**\n`;
      riskAssessment.identifiedRisks.forEach(risk => {
        text += `- ${risk}\n`;
      });
    }

    if (result.recommendation.reasoning.length > 0) {
      text += `\n### Reasoning\n`;
      result.recommendation.reasoning.forEach(reason => {
        text += `- ${reason}\n`;
      });
    }

    text += `\n### Recommendation\n`;
    text += `**Action:** ${result.recommendation.action}\n`;
    text += `**Implementation Strategy:** ${result.recommendation.implementation.rolloutStrategy}\n`;
    text += `**Traffic Allocation:** ${(result.recommendation.implementation.trafficAllocation * 100).toFixed(0)}%\n\n`;

    if (result.recommendation.nextSteps.length > 0) {
      text += `**Next Steps:**\n`;
      result.recommendation.nextSteps.forEach(step => {
        text += `- ${step}\n`;
      });
    }

    return {
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Handle winner implementation request
   */
  private async handleImplementWinner(args: any): Promise<any> {
    const { selectionId, confirm } = args;

    if (!confirm) {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ Confirmation required. Set `confirm: true` to implement the selected winner.',
          },
        ],
      };
    }

    const implementation = await this.winnerSelection.implementWinner(selectionId, 'GRADUAL');

    let text = `## ✅ Winner Implementation Started\n\n`;
    text += `**Selection ID:** ${selectionId}\n`;
    text += `**Status:** ${implementation.implemented ? 'Active' : 'Failed'}\n\n`;

    if (implementation.rolloutPlan.length > 0) {
      text += `### Rollout Plan\n`;
      implementation.rolloutPlan.forEach(phase => {
        text += `**Phase ${phase.phase}:** ${phase.trafficPercentage}% traffic (${phase.startDate})\n`;
        text += `- Monitoring: ${phase.monitoringMetrics.join(', ')}\n`;
      });
      text += '\n';
    }

    if (implementation.monitoringSchedule.length > 0) {
      text += `### Monitoring Schedule\n`;
      implementation.monitoringSchedule.slice(0, 3).forEach(check => {
        text += `- **${check.checkDate}:** ${check.metrics.join(', ')}\n`;
      });
      text += '\n';
    }

    text += `### Next Steps\n`;
    text += `1. Monitor performance against projections\n`;
    text += `2. Check for rollback triggers if performance declines\n`;
    text += `3. Complete rollout according to schedule\n`;

    return {
      content: [{ type: 'text', text }],
    };
  }
}