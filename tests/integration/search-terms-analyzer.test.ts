import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SearchTermsAnalyzer } from '../../src/analyzers/search-terms';

describe('SearchTermsAnalyzer', () => {
  const testDataPath = 'inputs/google_ads/search_terms_convertmyfile_2025-09-04.csv';
  const outputDir = 'test-output/search-terms';
  let analyzer: SearchTermsAnalyzer;

  beforeAll(() => {
    analyzer = new SearchTermsAnalyzer({
      minCostThreshold: 10,
      minImpressionsThreshold: 1000,
      lowCtrThreshold: 0.005
    });

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  describe('parseSearchTermsReport', () => {
    it('should parse Google Ads search terms CSV correctly', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      
      expect(searchTerms).toBeDefined();
      expect(searchTerms.length).toBeGreaterThan(0);
      
      // Check first term structure
      const firstTerm = searchTerms[0];
      expect(firstTerm).toHaveProperty('Search term');
      expect(firstTerm).toHaveProperty('Ad group');
      expect(firstTerm).toHaveProperty('Impressions');
      expect(firstTerm).toHaveProperty('Clicks');
      expect(firstTerm).toHaveProperty('Cost');
      expect(firstTerm).toHaveProperty('Conversions');
      
      // Verify number parsing
      expect(typeof firstTerm.Impressions).toBe('number');
      expect(typeof firstTerm.Cost).toBe('number');
      expect(typeof firstTerm.Conversions).toBe('number');
    });

    it('should handle missing file gracefully', async () => {
      await expect(
        analyzer.parseSearchTermsReport('non-existent-file.csv')
      ).rejects.toThrow('Search terms file not found');
    });
  });

  describe('analyzeWaste', () => {
    it('should identify high-cost zero-conversion terms', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      expect(analysis.highCostNoConvert).toBeDefined();
      expect(analysis.highCostNoConvert.length).toBeGreaterThan(0);
      
      // Check that all high-cost terms have zero conversions
      for (const term of analysis.highCostNoConvert) {
        expect(term.conversions).toBe(0);
        expect(term.cost).toBeGreaterThanOrEqual(10);
      }
      
      // Verify specific waste terms are caught
      const wasteTerms = analysis.highCostNoConvert.map(t => t.term);
      expect(wasteTerms).toContain('pdf converter free');
      expect(wasteTerms).toContain('free pdf converter crack');
      expect(wasteTerms).toContain('online pdf converter virus');
    });

    it('should identify low CTR high impression terms', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      expect(analysis.lowCtrHighImpressions).toBeDefined();
      
      // Check CTR calculation
      for (const term of analysis.lowCtrHighImpressions) {
        expect(term.ctr).toBeLessThan(0.005);
        expect(term.impressions).toBeGreaterThanOrEqual(1000);
      }
    });

    it('should calculate total wasted spend correctly', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      expect(analysis.totalWastedSpend).toBeGreaterThan(0);
      expect(analysis.potentialSavings).toBeGreaterThan(0);
      expect(analysis.potentialSavings).toBeLessThanOrEqual(analysis.totalWastedSpend);
      
      // Verify waste calculation includes known waste terms
      expect(analysis.totalWastedSpend).toBeGreaterThanOrEqual(500); // Based on test data
    });
  });

  describe('generateNegativeRecommendations', () => {
    it('should generate exact negative recommendations for waste terms', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      expect(analysis.negativeRecommendations).toBeDefined();
      expect(analysis.negativeRecommendations.length).toBeGreaterThan(0);
      
      // Check for exact negatives
      const exactNegatives = analysis.negativeRecommendations.filter(
        r => r.matchType === 'exact'
      );
      expect(exactNegatives.length).toBeGreaterThan(0);
      
      // Verify high-cost waste terms get exact negatives
      const exactKeywords = exactNegatives.map(n => n.keyword);
      expect(exactKeywords).toContain('pdf converter free');
    });

    it('should identify pattern-based phrase negatives', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      // Check for phrase negatives based on patterns
      const phraseNegatives = analysis.negativeRecommendations.filter(
        r => r.matchType === 'phrase'
      );
      
      // Should identify common waste patterns
      const phraseKeywords = phraseNegatives.map(n => n.keyword);
      const hasWastePatterns = phraseKeywords.some(k => 
        k.includes('free') || k.includes('crack') || k.includes('virus')
      );
      expect(hasWastePatterns).toBe(true);
    });

    it('should assign confidence scores to recommendations', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      for (const rec of analysis.negativeRecommendations) {
        expect(rec.confidence).toBeGreaterThan(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
        expect(rec.estimatedSavings).toBeGreaterThan(0);
      }
    });

    it('should include broad negatives for known waste indicators', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      const broadNegatives = analysis.negativeRecommendations.filter(
        r => r.matchType === 'broad'
      );
      
      // Should include common waste indicators
      const broadKeywords = broadNegatives.map(n => n.keyword);
      const hasWasteIndicators = ['crack', 'virus', 'torrent', 'pirate'].some(
        indicator => broadKeywords.includes(indicator)
      );
      expect(hasWasteIndicators).toBe(true);
    });
  });

  describe('generateWasteReport', () => {
    it('should generate comprehensive markdown report', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      const report = analyzer.generateWasteReport(
        analysis,
        'ConvertMyFile',
        '2025-09-04'
      );
      
      expect(report).toContain('## Waste Analysis - ConvertMyFile');
      expect(report).toContain('Total Wasted Spend');
      expect(report).toContain('High Priority Negatives');
      expect(report).toContain('Ad Group Specific Recommendations');
      expect(report).toContain('Implementation Script for Google Ads Editor');
      
      // Save report to file for manual inspection
      fs.writeFileSync(path.join(outputDir, 'waste_report.md'), report);
    });

    it('should include implementation script in CSV format', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      const report = analyzer.generateWasteReport(
        analysis,
        'ConvertMyFile',
        '2025-09-04'
      );
      
      expect(report).toContain('```csv');
      expect(report).toContain('Action,Status,Campaign,Ad group,Keyword,Match type');
      expect(report).toContain('Add,Active');
      expect(report).toContain('Negative exact');
    });
  });

  describe('exportNegativesForAdsEditor', () => {
    it('should export negatives in Google Ads Editor format', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      const exportPath = path.join(outputDir, 'negative_keywords.csv');
      analyzer.exportNegativesForAdsEditor(
        analysis.negativeRecommendations,
        exportPath
      );
      
      expect(fs.existsSync(exportPath)).toBe(true);
      
      const csvContent = fs.readFileSync(exportPath, 'utf-8');
      expect(csvContent).toContain('Action,Status,Campaign,Ad group,Keyword,Match type');
      expect(csvContent).toContain('Add,Active');
      expect(csvContent).toContain('Negative');
    });
  });

  describe('ROI validation', () => {
    it('should identify at least $100 in monthly waste', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      // v1.2 success criteria: identify ≥$100/month waste
      expect(analysis.totalWastedSpend).toBeGreaterThanOrEqual(100);
      
      console.log(`Total waste identified: $${analysis.totalWastedSpend.toFixed(2)}`);
      console.log(`Potential monthly savings: $${analysis.potentialSavings.toFixed(2)}`);
      console.log(`Negative recommendations: ${analysis.negativeRecommendations.length}`);
    });

    it('should provide actionable recommendations with high confidence', async () => {
      const searchTerms = await analyzer.parseSearchTermsReport(testDataPath);
      const analysis = analyzer.analyzeWaste(searchTerms);
      
      // At least 50% of recommendations should have high confidence
      const highConfidenceRecs = analysis.negativeRecommendations.filter(
        r => r.confidence >= 0.8
      );
      
      const confidenceRatio = highConfidenceRecs.length / analysis.negativeRecommendations.length;
      expect(confidenceRatio).toBeGreaterThanOrEqual(0.5);
    });
  });
});