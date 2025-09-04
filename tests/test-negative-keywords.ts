import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  NegativeKeywordsManager,
  NegativeKeyword,
  SharedNegativeList,
  NegativeListUpdate
} from '../src/analyzers/negative-keywords-manager.js';

describe('Negative Keywords Management', () => {
  describe('NegativeKeywordsManager', () => {
    let manager: NegativeKeywordsManager;
    
    beforeEach(() => {
      manager = new NegativeKeywordsManager();
    });

    it('should initialize with preset lists for known products', () => {
      const convertList = manager.getProductNegatives('convert-my-file');
      const paletteList = manager.getProductNegatives('palette-kit');
      const notebridgeList = manager.getProductNegatives('notebridge');
      
      expect(convertList).toBeDefined();
      expect(paletteList).toBeDefined();
      expect(notebridgeList).toBeDefined();
      
      // Check that default negatives are included
      expect(convertList?.keywords.some(k => k.text === 'crack')).toBe(true);
      expect(convertList?.keywords.some(k => k.text === 'free converter')).toBe(true);
      
      // Check product-specific negatives
      expect(paletteList?.keywords.some(k => k.text === 'photoshop')).toBe(true);
      expect(notebridgeList?.keywords.some(k => k.text === 'evernote')).toBe(true);
    });

    it('should create new shared list for unknown product', async () => {
      const newList = await manager.createSharedList('new-product');
      
      expect(newList.product).toBe('new-product');
      expect(newList.version).toBe(1);
      expect(newList.keywords.length).toBeGreaterThan(0); // Should have default negatives
      expect(newList.metadata.autoUpdateEnabled).toBe(true);
    });

    it('should sync negative keywords from waste analysis', async () => {
      // Mock waste analyzer response
      const mockWasteAnalysis = {
        wastedKeywords: [
          { keyword: 'cheap alternative', wastedSpend: 50, clicks: 100, impressions: 1000 },
          { keyword: 'competitor brand', wastedSpend: 75, clicks: 150, impressions: 2000 }
        ]
      };

      const mockWasteAnalyzer = {
        identifyWastedSpend: vi.fn().mockResolvedValue(mockWasteAnalysis)
      };
      (manager as any).wasteAnalyzer = mockWasteAnalyzer;

      // Mock audit logger
      const mockAuditLogger = {
        logConfiguration: vi.fn().mockResolvedValue(undefined)
      };
      (manager as any).auditLogger = mockAuditLogger;

      const update = await manager.syncNegativeKeywords('palette-kit');
      
      expect(update.added.length).toBe(2);
      expect(update.added[0].text).toBe('cheap alternative');
      expect(update.added[0].source).toBe('waste_analysis');
      expect(update.added[0].performanceImpact?.wastedSpend).toBe(50);
      
      const list = manager.getProductNegatives('palette-kit');
      expect(list?.keywords.some(k => k.text === 'cheap alternative')).toBe(true);
      expect(list?.metadata.estimatedSavings).toBe(125); // 50 + 75
    });

    it('should handle match type determination correctly', async () => {
      // Mock waste analyzer with different keyword types
      const mockWasteAnalysis = {
        wastedKeywords: [
          { keyword: 'single', wastedSpend: 20 },
          { keyword: 'two words', wastedSpend: 30 },
          { keyword: 'this is a long phrase keyword', wastedSpend: 10 }
        ]
      };

      const mockWasteAnalyzer = {
        identifyWastedSpend: vi.fn().mockResolvedValue(mockWasteAnalysis)
      };
      (manager as any).wasteAnalyzer = mockWasteAnalyzer;

      const mockAuditLogger = {
        logConfiguration: vi.fn().mockResolvedValue(undefined)
      };
      (manager as any).auditLogger = mockAuditLogger;

      const update = await manager.syncNegativeKeywords('test-product');
      
      // Single word with high spend should be EXACT
      const single = update.added.find(k => k.text === 'single');
      expect(single?.matchType).toBe('EXACT');
      
      // Two words should be PHRASE
      const twoWords = update.added.find(k => k.text === 'two words');
      expect(twoWords?.matchType).toBe('PHRASE');
      
      // Long phrase should be BROAD
      const longPhrase = update.added.find(k => k.text === 'this is a long phrase keyword');
      expect(longPhrase?.matchType).toBe('BROAD');
    });

    it('should merge and version lists correctly', async () => {
      const existingList: NegativeKeyword[] = [
        { text: 'existing1', matchType: 'EXACT', source: 'manual', addedDate: '2024-01-01' },
        { text: 'existing2', matchType: 'PHRASE', source: 'waste_analysis', addedDate: '2024-01-01' }
      ];

      const wasteTerms = [
        { keyword: 'existing1', wastedSpend: 10 }, // Already exists
        { keyword: 'new1', wastedSpend: 20 } // New term
      ];

      const update = await (manager as any).mergeAndVersion(wasteTerms, existingList, []);
      
      expect(update.added.length).toBe(1);
      expect(update.added[0].text).toBe('new1');
      expect(update.unchanged).toBe(1); // existing1 unchanged
      expect(update.conflicts.length).toBe(0);
    });

    it('should detect and handle conflicts in match types', async () => {
      const existingList: NegativeKeyword[] = [
        { text: 'conflict', matchType: 'EXACT', source: 'manual', addedDate: '2024-01-01' }
      ];

      const apiList: NegativeKeyword[] = [
        { text: 'conflict', matchType: 'PHRASE', source: 'manual', addedDate: '2024-01-01' }
      ];

      const wasteTerms = [
        { keyword: 'conflict', wastedSpend: 10 }
      ];

      const update = await (manager as any).mergeAndVersion(wasteTerms, existingList, apiList);
      
      expect(update.conflicts.length).toBe(1);
      expect(update.conflicts[0].keyword).toBe('conflict');
      expect(update.conflicts[0].existingMatchType).toBe('EXACT');
      expect(update.conflicts[0].newMatchType).toBe('PHRASE');
      expect(update.conflicts[0].resolution).toBe('keep_existing');
    });

    it('should attach lists to campaigns', async () => {
      const mockAuditLogger = {
        logConfiguration: vi.fn().mockResolvedValue(undefined)
      };
      (manager as any).auditLogger = mockAuditLogger;

      const campaignIds = ['campaign-1', 'campaign-2', 'campaign-3'];
      await manager.attachToCampaigns('palette-kit', campaignIds, 'customer-123');
      
      const list = manager.getProductNegatives('palette-kit');
      expect(list?.attachedCampaigns).toContain('campaign-1');
      expect(list?.attachedCampaigns).toContain('campaign-2');
      expect(list?.attachedCampaigns).toContain('campaign-3');
    });

    it('should handle duplicate campaign attachments', async () => {
      const mockAuditLogger = {
        logConfiguration: vi.fn().mockResolvedValue(undefined)
      };
      (manager as any).auditLogger = mockAuditLogger;

      await manager.attachToCampaigns('palette-kit', ['campaign-1'], 'customer-123');
      await manager.attachToCampaigns('palette-kit', ['campaign-1', 'campaign-2'], 'customer-123');
      
      const list = manager.getProductNegatives('palette-kit');
      const uniqueCampaigns = list?.attachedCampaigns.filter((c, i, arr) => arr.indexOf(c) === i);
      expect(uniqueCampaigns?.length).toBe(2); // Should not have duplicates
    });

    it('should add manual negative keywords', async () => {
      const manualKeywords = [
        { text: 'manual1', matchType: 'EXACT' as const, reason: 'Poor performance' },
        { text: 'manual2', matchType: 'PHRASE' as const }
      ];

      const update = await manager.addManualNegatives('palette-kit', manualKeywords);
      
      expect(update.added.length).toBe(2);
      expect(update.added[0].source).toBe('manual');
      expect(update.added[0].reason).toBe('Poor performance');
      
      const list = manager.getProductNegatives('palette-kit');
      expect(list?.keywords.some(k => k.text === 'manual1')).toBe(true);
      expect(list?.keywords.some(k => k.text === 'manual2')).toBe(true);
    });

    it('should handle duplicate manual additions', async () => {
      const keywords = [
        { text: 'duplicate', matchType: 'EXACT' as const }
      ];

      await manager.addManualNegatives('palette-kit', keywords);
      const update = await manager.addManualNegatives('palette-kit', keywords);
      
      expect(update.added.length).toBe(0);
      expect(update.unchanged).toBe(1);
    });

    it('should remove negative keywords', async () => {
      // First add some keywords
      await manager.addManualNegatives('palette-kit', [
        { text: 'to-remove', matchType: 'EXACT' as const },
        { text: 'keep-this', matchType: 'PHRASE' as const }
      ]);

      const update = await manager.removeNegatives('palette-kit', ['to-remove']);
      
      expect(update.removed.length).toBe(1);
      expect(update.removed[0]).toBe('to-remove');
      
      const list = manager.getProductNegatives('palette-kit');
      expect(list?.keywords.some(k => k.text === 'to-remove')).toBe(false);
      expect(list?.keywords.some(k => k.text === 'keep-this')).toBe(true);
    });

    it('should export to CSV format', () => {
      const csv = manager.exportToCSV('palette-kit');
      
      expect(csv).toContain('Keyword,Match Type,Source,Added Date,Reason,Wasted Spend');
      expect(csv).toContain('photoshop,EXACT,manual');
      expect(csv).toContain('free,BROAD,manual');
    });

    it('should get sync history', async () => {
      const mockWasteAnalyzer = {
        identifyWastedSpend: vi.fn().mockResolvedValue({ wastedKeywords: [] })
      };
      (manager as any).wasteAnalyzer = mockWasteAnalyzer;

      const mockAuditLogger = {
        logConfiguration: vi.fn().mockResolvedValue(undefined)
      };
      (manager as any).auditLogger = mockAuditLogger;

      await manager.syncNegativeKeywords('palette-kit');
      await manager.syncNegativeKeywords('notebridge');
      
      const history = manager.getSyncHistory(10);
      expect(history.length).toBe(2);
    });

    it('should calculate statistics correctly', async () => {
      // Add various keywords to test statistics
      await manager.addManualNegatives('palette-kit', [
        { text: 'stat1', matchType: 'EXACT' as const },
        { text: 'stat2', matchType: 'PHRASE' as const }
      ]);

      const stats = manager.getStatistics();
      
      expect(stats.totalKeywords).toBeGreaterThan(0);
      expect(stats.byMatchType).toHaveProperty('EXACT');
      expect(stats.byMatchType).toHaveProperty('PHRASE');
      expect(stats.byMatchType).toHaveProperty('BROAD');
      expect(stats.bySource).toHaveProperty('manual');
    });

    it('should get product-specific statistics', () => {
      const stats = manager.getStatistics('palette-kit');
      
      expect(stats.totalKeywords).toBeGreaterThan(0);
      expect(stats.bySource.manual).toBeGreaterThan(0);
    });

    it('should track top waste preventers', async () => {
      const mockWasteAnalysis = {
        wastedKeywords: [
          { keyword: 'big-waste', wastedSpend: 100 },
          { keyword: 'small-waste', wastedSpend: 10 },
          { keyword: 'medium-waste', wastedSpend: 50 }
        ]
      };

      const mockWasteAnalyzer = {
        identifyWastedSpend: vi.fn().mockResolvedValue(mockWasteAnalysis)
      };
      (manager as any).wasteAnalyzer = mockWasteAnalyzer;

      const mockAuditLogger = {
        logConfiguration: vi.fn().mockResolvedValue(undefined)
      };
      (manager as any).auditLogger = mockAuditLogger;

      await manager.syncNegativeKeywords('test-product');
      
      const stats = manager.getStatistics('test-product');
      expect(stats.topWastePreventers.length).toBeGreaterThan(0);
      expect(stats.topWastePreventers[0].keyword).toBe('big-waste');
      expect(stats.topWastePreventers[0].savedAmount).toBe(100);
    });

    it('should remove old waste-derived keywords that are no longer wasted', async () => {
      // Create a list with old waste-derived keyword
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40 days old
      
      const existingList: NegativeKeyword[] = [
        { 
          text: 'old-waste', 
          matchType: 'EXACT', 
          source: 'waste_analysis', 
          addedDate: oldDate.toISOString() 
        },
        {
          text: 'keep-this',
          matchType: 'EXACT',
          source: 'manual',
          addedDate: oldDate.toISOString()
        }
      ];

      const wasteTerms: any[] = []; // No longer in waste analysis

      const update = await (manager as any).mergeAndVersion(wasteTerms, existingList, []);
      
      expect(update.removed).toContain('old-waste'); // Should be removed
      expect(update.removed).not.toContain('keep-this'); // Manual keyword should stay
    });

    it('should handle error when attaching to non-existent product', async () => {
      await expect(
        manager.attachToCampaigns('non-existent', ['campaign-1'], 'customer-123')
      ).rejects.toThrow('No shared negative list found for product: non-existent');
    });

    it('should handle error when exporting non-existent product', () => {
      expect(() => manager.exportToCSV('non-existent')).toThrow(
        'No shared negative list found for product: non-existent'
      );
    });
  });
});