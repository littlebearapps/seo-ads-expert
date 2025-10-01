import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SeoAdsServer } from '../src/mcp/seo-ads-server.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock all dependencies
vi.mock('../src/analyzers/strategic-orchestrator.js');
vi.mock('../src/connectors/google-ads-api.js');
vi.mock('../src/writers/mutation-applier.js');
vi.mock('../src/analyzers/negative-keywords-manager.js');
vi.mock('../src/writers/microsoft-ads-csv.js');
vi.mock('../src/connectors/bing-keywords.js');
vi.mock('../src/monitors/audit-logger.js');
vi.mock('../src/writers.js');

describe('MCP Server', () => {
  let server: SeoAdsServer;
  
  beforeEach(() => {
    server = new SeoAdsServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Definitions', () => {
    it('should define all required tools', () => {
      const tools = (server as any).getTools();
      
      expect(tools).toHaveLength(9);
      
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('seo_ads_plan');
      expect(toolNames).toContain('preview_changes');
      expect(toolNames).toContain('apply_changes');
      expect(toolNames).toContain('export_campaigns');
      expect(toolNames).toContain('audit_history');
      expect(toolNames).toContain('reconcile_campaigns');
      expect(toolNames).toContain('negative_keywords');
      expect(toolNames).toContain('bing_opportunity');
      expect(toolNames).toContain('get_status');
    });

    it('should have proper input schemas for each tool', () => {
      const tools = (server as any).getTools();
      
      tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
        
        if (tool.inputSchema.required) {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);
        }
      });
    });
  });

  describe('Plan Generation', () => {
    it('should generate SEO plan with default parameters', async () => {
      const mockOrchestrator = {
        generateStrategicIntelligence: vi.fn().mockResolvedValue({
          product: 'test-product',
          keywords: [
            { keyword: 'test keyword', score: 85 }
          ],
          adGroups: [
            { name: 'Test Group', keywords: [] }
          ]
        })
      };
      (server as any).orchestrator = mockOrchestrator;

      const result = await (server as any).generatePlan({
        product: 'test-product',
        market: 'AU',
        includeCompetitors: true,
        includeNegatives: false,
        outputFormat: 'json'
      });

      expect(mockOrchestrator.generateStrategicIntelligence).toHaveBeenCalledWith({
        product: 'test-product',
        market: 'AU'
      });
      expect(result).toHaveProperty('product', 'test-product');
      expect(result).toHaveProperty('keywords');
    });

    it('should include negative keywords when requested', async () => {
      const mockOrchestrator = {
        generateStrategicIntelligence: vi.fn().mockResolvedValue({
          product: 'test-product',
          keywords: []
        })
      };
      const mockNegativeManager = {
        getProductNegatives: vi.fn().mockReturnValue({
          keywords: [
            { text: 'negative1', matchType: 'EXACT' }
          ]
        })
      };
      
      (server as any).orchestrator = mockOrchestrator;
      (server as any).negativeManager = mockNegativeManager;

      const result = await (server as any).generatePlan({
        product: 'test-product',
        market: 'AU',
        includeNegatives: true,
        outputFormat: 'json'
      });

      expect(mockNegativeManager.getProductNegatives).toHaveBeenCalledWith('test-product');
      expect(result).toHaveProperty('negativeKeywords');
      expect(result.negativeKeywords).toHaveLength(1);
    });
  });

  describe('Preview Changes', () => {
    it('should preview changes in dry run mode', async () => {
      const mockApplier = {
        applyChanges: vi.fn().mockResolvedValue({
          canProceed: true,
          warnings: [],
          blockers: [],
          estimatedChanges: {
            campaigns: 1,
            adGroups: 3,
            keywords: 50,
            budgetChange: 100
          }
        })
      };
      (server as any).mutationApplier = mockApplier;

      const result = await (server as any).previewChanges({
        customerId: '123-456-7890',
        product: 'test-product',
        changes: {
          mutations: [
            { type: 'CREATE_CAMPAIGN' }
          ]
        }
      });

      expect(mockApplier.applyChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: '123-456-7890',
          product: 'test-product',
          mutations: expect.any(Array)
        }),
        { dryRun: true, confirm: false }
      );
      expect(result).toHaveProperty('preview');
      expect(result).toHaveProperty('recommendation');
    });

    it('should generate recommendations based on preview', async () => {
      const mockApplier = {
        applyChanges: vi.fn().mockResolvedValue({
          canProceed: false,
          blockers: ['Budget exceeds limit'],
          warnings: [],
          estimatedChanges: {}
        })
      };
      (server as any).mutationApplier = mockApplier;

      const result = await (server as any).previewChanges({
        customerId: '123-456-7890',
        product: 'test-product',
        changes: { mutations: [] }
      });

      expect(result.recommendation).toContain('cannot proceed');
      expect(result.recommendation).toContain('Budget exceeds limit');
    });
  });

  describe('Apply Changes', () => {
    it('should apply changes with confirmation', async () => {
      const mockApplier = {
        applyChanges: vi.fn().mockResolvedValue({
          success: true,
          rollbackId: 'rollback-123',
          summary: {
            created: 1,
            updated: 2,
            deleted: 0
          }
        })
      };
      (server as any).mutationApplier = mockApplier;

      const result = await (server as any).applyChanges({
        customerId: '123-456-7890',
        product: 'test-product',
        changes: { mutations: [] },
        skipGuardrails: false,
        autoRollback: true
      });

      expect(mockApplier.applyChanges).toHaveBeenCalledWith(
        expect.any(Object),
        {
          dryRun: false,
          confirm: true,
          skipGuardrails: false,
          autoRollback: true
        }
      );
      expect(result).toHaveProperty('confirmationRequired');
      expect(result).toHaveProperty('rollbackId', 'rollback-123');
    });
  });

  describe('Export Campaigns', () => {
    it('should export to Google CSV format', async () => {
      const mockCSVWriter = {
        writeGoogleAdsCSV: vi.fn().mockResolvedValue('csv,content')
      };
      vi.mocked(await import('../src/writers.js')).CSVWriter = vi.fn(() => mockCSVWriter as any);

      const result = await (server as any).exportCampaigns({
        campaigns: { name: 'Test Campaign' },
        format: 'google-csv'
      });

      expect(result).toHaveProperty('format', 'google-csv');
      expect(result).toHaveProperty('content');
    });

    it('should export to Microsoft CSV format', async () => {
      const mockMicrosoftWriter = {
        exportBulkCsv: vi.fn().mockResolvedValue('Type,Campaign\nCampaign,Test')
      };
      (server as any).microsoftWriter = mockMicrosoftWriter;

      const result = await (server as any).exportCampaigns({
        campaigns: [{ name: 'Test Campaign' }],
        format: 'microsoft-csv'
      });

      expect(mockMicrosoftWriter.exportBulkCsv).toHaveBeenCalled();
      expect(result).toHaveProperty('format', 'microsoft-csv');
    });
  });

  describe('Negative Keywords Management', () => {
    it('should sync negative keywords', async () => {
      const mockManager = {
        syncNegativeKeywords: vi.fn().mockResolvedValue({
          added: [{ text: 'new negative' }],
          removed: [],
          unchanged: 5
        }),
        getStatistics: vi.fn().mockReturnValue({
          totalKeywords: 10,
          byMatchType: { EXACT: 5, PHRASE: 3, BROAD: 2 }
        })
      };
      (server as any).negativeManager = mockManager;

      const result = await (server as any).manageNegativeKeywords({
        product: 'test-product',
        action: 'sync'
      });

      expect(mockManager.syncNegativeKeywords).toHaveBeenCalledWith('test-product', undefined);
      expect(result).toHaveProperty('action', 'sync');
      expect(result).toHaveProperty('statistics');
    });

    it('should add manual negative keywords', async () => {
      const mockManager = {
        addManualNegatives: vi.fn().mockResolvedValue({
          added: [{ text: 'manual negative' }]
        })
      };
      (server as any).negativeManager = mockManager;

      const result = await (server as any).manageNegativeKeywords({
        product: 'test-product',
        action: 'add',
        keywords: [
          { text: 'manual negative', matchType: 'EXACT' }
        ]
      });

      expect(mockManager.addManualNegatives).toHaveBeenCalled();
      expect(result).toHaveProperty('action', 'add');
    });

    it('should export negative keywords as CSV', async () => {
      const mockManager = {
        exportToCSV: vi.fn().mockReturnValue('Keyword,Match Type\nnegative1,EXACT')
      };
      (server as any).negativeManager = mockManager;

      const result = await (server as any).manageNegativeKeywords({
        product: 'test-product',
        action: 'export'
      });

      expect(mockManager.exportToCSV).toHaveBeenCalledWith('test-product');
      expect(result).toHaveProperty('format', 'csv');
      expect(result).toHaveProperty('content');
    });
  });

  describe('Bing Opportunity Analysis', () => {
    it('should analyze Bing market opportunity', async () => {
      const mockConnector = {
        calculateMarketOpportunity: vi.fn().mockResolvedValue({
          market: 'en-AU',
          totalSearchVolume: 10000,
          avgCompetition: 0.5,
          avgCpc: 1.5,
          opportunityScore: 75,
          topKeywords: [],
          deviceDistribution: { desktop: 60, mobile: 30, tablet: 10 }
        }),
        getKeywordSuggestions: vi.fn().mockResolvedValue({
          suggestions: Array(25).fill({ keyword: 'suggestion' })
        }),
        getCompetitiveInsights: vi.fn().mockResolvedValue({
          avgCompetitorBid: 2.0,
          topCompetitors: [],
          competitionTrend: 'stable',
          recommendedBidAdjustment: 1.1
        })
      };
      (server as any).bingConnector = mockConnector;

      const result = await (server as any).analyzeBingOpportunity({
        product: 'test-product',
        keywords: ['keyword1', 'keyword2'],
        market: 'en-AU'
      });

      expect(mockConnector.calculateMarketOpportunity).toHaveBeenCalled();
      expect(result).toHaveProperty('opportunity');
      expect(result).toHaveProperty('suggestions');
      expect(result.suggestions).toHaveLength(20); // Limited to 20
      expect(result).toHaveProperty('recommendation');
      expect(result.recommendation).toContain('High opportunity');
    });
  });

  describe('System Status', () => {
    it('should return system configuration and capabilities', async () => {
      const mockGoogleClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        getCustomerIds: vi.fn().mockReturnValue(['123-456-7890'])
      };
      const mockBingConnector = {
        getIsConfigured: vi.fn().mockReturnValue(false)
      };
      const mockNegativeManager = {
        getAllLists: vi.fn().mockReturnValue([
          { product: 'product1' },
          { product: 'product2' }
        ])
      };

      (server as any).googleAdsClient = mockGoogleClient;
      (server as any).bingConnector = mockBingConnector;
      (server as any).negativeManager = mockNegativeManager;

      const result = await (server as any).getSystemStatus();

      expect(result).toHaveProperty('version', '1.3.0');
      expect(result).toHaveProperty('timestamp');
      expect(result.components.googleAdsApi.configured).toBe(true);
      expect(result.components.bingApi.configured).toBe(false);
      expect(result.components.negativeKeywords.lists).toBe(2);
      expect(result.capabilities.googleAdsWrite).toBe(true);
    });
  });

  describe('Progress Reporting', () => {
    it('should send progress notifications', async () => {
      const mockServer = {
        sendNotification: vi.fn().mockResolvedValue(undefined)
      };
      (server as any).server = mockServer;

      await (server as any).sendProgress('Testing progress', 50);

      expect(mockServer.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          method: 'notifications/progress',
          params: expect.objectContaining({
            progress: 50,
            total: 100,
            message: 'Testing progress'
          })
        })
      );
    });

    it('should complete progress at 100%', async () => {
      const mockServer = {
        sendNotification: vi.fn().mockResolvedValue(undefined)
      };
      (server as any).server = mockServer;
      (server as any).currentProgressToken = 'test-token';

      await (server as any).completeProgress();

      expect(mockServer.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          params: expect.objectContaining({
            progress: 100,
            message: 'Complete'
          })
        })
      );
      expect((server as any).currentProgressToken).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors gracefully', async () => {
      const mockOrchestrator = {
        generateStrategicIntelligence: vi.fn().mockRejectedValue(
          new Error('API quota exceeded')
        )
      };
      (server as any).orchestrator = mockOrchestrator;

      await expect(
        (server as any).executeTool('seo_ads_plan', { product: 'test' })
      ).rejects.toThrow('API quota exceeded');
    });

    it('should throw error for unknown tool', async () => {
      await expect(
        (server as any).executeTool('unknown_tool', {})
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });
  });

  describe('Reconciliation', () => {
    it('should reconcile campaigns and generate recommendations', async () => {
      const mockGoogleClient = {
        reconcile: vi.fn().mockResolvedValue({
          summary: {
            criticalIssues: 0,
            totalDiscrepancies: 3,
            suggestions: ['Update keyword bids', 'Review ad scheduling']
          },
          discrepancies: {
            campaigns: [],
            adGroups: [{ type: 'missing' }],
            keywords: [{ type: 'bid_mismatch' }, { type: 'status_mismatch' }]
          }
        })
      };
      (server as any).googleAdsClient = mockGoogleClient;

      const result = await (server as any).reconcileCampaigns({
        customerId: '123-456-7890',
        product: 'test-product',
        plannedData: { campaigns: [] }
      });

      expect(result).toHaveProperty('report');
      expect(result).toHaveProperty('recommendations');
      expect(result.recommendations).toContain('📋 3 discrepancies found');
      expect(result.recommendations).toContain('💡 Update keyword bids');
    });
  });

  describe('Audit History', () => {
    it('should fetch and summarize audit logs', async () => {
      const mockAuditLogger = {
        getAuditLogs: vi.fn().mockResolvedValue([
          { timestamp: '2024-01-01', action: 'CREATE', user: 'test' }
        ]),
        generateSummary: vi.fn().mockResolvedValue({
          totalActions: 1,
          byAction: { CREATE: 1 },
          byUser: { test: 1 }
        })
      };
      (server as any).auditLogger = mockAuditLogger;

      const result = await (server as any).getAuditHistory({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      expect(mockAuditLogger.getAuditLogs).toHaveBeenCalled();
      expect(result).toHaveProperty('logs');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('totalEntries', 1);
    });
  });
});