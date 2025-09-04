import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PaidOrganicAnalyzer, OpportunityType } from '../../src/analyzers/paid-organic';

describe('PaidOrganicAnalyzer', () => {
  const testDataPath = 'inputs/google_ads/paid_organic_convertmyfile_2025-09-04.csv';
  const outputDir = 'test-output/paid-organic';
  let analyzer: PaidOrganicAnalyzer;

  beforeAll(() => {
    analyzer = new PaidOrganicAnalyzer({
      organicTopPositionThreshold: 3,
      highPaidSpendThreshold: 10,
      goodCtrThreshold: 2.0,
      minImpressionsThreshold: 100
    });

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  describe('parsePaidOrganicReport', () => {
    it('should parse Google Ads Paid & Organic CSV correctly', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);
      expect(data.length).toBe(30); // We have 30 queries in test data
      
      // Check first row structure
      const firstRow = data[0];
      expect(firstRow).toHaveProperty('Query');
      expect(firstRow).toHaveProperty('Clicks - organic');
      expect(firstRow).toHaveProperty('Clicks - paid');
      expect(firstRow).toHaveProperty('Cost');
      expect(firstRow).toHaveProperty('Average position - organic');
      
      // Verify number parsing
      expect(typeof firstRow['Clicks - organic']).toBe('number');
      expect(typeof firstRow['CTR - organic']).toBe('number');
      expect(typeof firstRow.Cost).toBe('number');
    });

    it('should handle missing file gracefully', async () => {
      await expect(
        analyzer.parsePaidOrganicReport('non-existent-file.csv')
      ).rejects.toThrow('Paid & Organic file not found');
    });
  });

  describe('analyzeGaps', () => {
    it('should identify protect winner opportunities', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      expect(analysis.protectWinners).toBeDefined();
      expect(analysis.protectWinners.length).toBeGreaterThan(0);
      
      // Check protect winners have good organic position and high paid spend
      for (const winner of analysis.protectWinners) {
        expect(winner.organicPosition).toBeLessThanOrEqual(3);
        expect(winner.paidSpend).toBeGreaterThan(0);
        expect(winner.potentialSavings).toBeGreaterThan(0);
        expect(winner.recommendedBidAdjustment).toBeLessThan(0); // Negative adjustment
      }

      // Verify specific high-value winners are caught
      const topWinner = analysis.protectWinners[0];
      expect(topWinner.potentialSavings).toBeGreaterThan(100); // Should save >$100/day
    });

    it('should identify harvest opportunities', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      expect(analysis.harvestOpportunities).toBeDefined();
      expect(analysis.harvestOpportunities.length).toBeGreaterThan(0);
      
      // Check harvest opportunities have no/low organic but good paid performance
      for (const opp of analysis.harvestOpportunities) {
        expect(opp.organicPotential.currentPosition).toBeLessThanOrEqual(0);
        expect(opp.paidPerformance.cost).toBeGreaterThan(0);
        expect(opp.organicPotential.estimatedValue).toBeGreaterThan(0);
      }

      // Check priority assignment
      const highPriorityOpps = analysis.harvestOpportunities.filter(
        h => h.priority === 'HIGH'
      );
      expect(highPriorityOpps.length).toBeGreaterThan(0);
    });

    it('should identify double down targets', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      expect(analysis.doubleDownTargets).toBeDefined();
      
      // Check double down targets have good performance in both channels
      for (const target of analysis.doubleDownTargets) {
        expect(target.organicPerformance.position).toBeGreaterThan(0);
        expect(target.paidPerformance.clicks).toBeGreaterThan(0);
        expect(target.combinedValue).toBeGreaterThan(0);
      }
    });

    it('should calculate summary metrics correctly', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      expect(analysis.summary).toBeDefined();
      expect(analysis.summary.totalQueries).toBe(30);
      expect(analysis.summary.protectWinnersCount).toBeGreaterThan(0);
      expect(analysis.summary.potentialMonthlySavings).toBeGreaterThan(0);
      expect(analysis.summary.harvestOpportunitiesCount).toBeGreaterThan(0);
      expect(analysis.summary.estimatedOrganicValue).toBeGreaterThan(0);
    });
  });

  describe('opportunity classification', () => {
    it('should correctly classify different opportunity types', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      // Should have all types of opportunities
      expect(analysis.protectWinners.length).toBeGreaterThan(0);
      expect(analysis.harvestOpportunities.length).toBeGreaterThan(0);
      expect(analysis.doubleDownTargets.length).toBeGreaterThan(0);
      expect(analysis.optimizationTargets.length).toBeGreaterThan(0);
      
      // Total should not exceed number of queries
      const totalClassified = 
        analysis.protectWinners.length +
        analysis.harvestOpportunities.length +
        analysis.doubleDownTargets.length +
        analysis.optimizationTargets.length;
      
      expect(totalClassified).toBeLessThanOrEqual(30);
    });
  });

  describe('generateGapReport', () => {
    it('should generate comprehensive markdown report', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      const report = analyzer.generateGapReport(
        analysis,
        'ConvertMyFile',
        '2025-09-04'
      );
      
      expect(report).toContain('## Paid & Organic Gap Analysis');
      expect(report).toContain('Executive Summary');
      expect(report).toContain('Protect Winners');
      expect(report).toContain('Harvest Opportunities');
      expect(report).toContain('Implementation Roadmap');
      
      // Should include specific recommendations
      expect(report).toContain('Reduce bids by');
      expect(report).toContain('Create SEO-optimized landing page');
      
      // Save report for inspection
      fs.writeFileSync(path.join(outputDir, 'gap_report.md'), report);
    });

    it('should prioritize recommendations correctly', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      const report = analyzer.generateGapReport(
        analysis,
        'ConvertMyFile',
        '2025-09-04'
      );
      
      // High priority items should appear first
      if (analysis.harvestOpportunities.length > 0) {
        const highPriorityIndex = report.indexOf('[HIGH PRIORITY]');
        const mediumPriorityIndex = report.indexOf('[MEDIUM PRIORITY]');
        
        if (highPriorityIndex > -1 && mediumPriorityIndex > -1) {
          expect(highPriorityIndex).toBeLessThan(mediumPriorityIndex);
        }
      }
    });
  });

  describe('exportBidAdjustments', () => {
    it('should export bid adjustments in CSV format', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      const exportPath = path.join(outputDir, 'bid_adjustments.csv');
      analyzer.exportBidAdjustments(analysis.protectWinners, exportPath);
      
      expect(fs.existsSync(exportPath)).toBe(true);
      
      const csvContent = fs.readFileSync(exportPath, 'utf-8');
      expect(csvContent).toContain('Keyword,Campaign,Ad group');
      expect(csvContent).toContain('Bid adjustment');
      expect(csvContent).toContain('-30%'); // Should have negative adjustments
    });
  });

  describe('ROI validation', () => {
    it('should achieve 20-30% efficiency gain target', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      // Calculate total paid spend
      const totalDailySpend = data.reduce((sum, row) => sum + row.Cost, 0);
      const totalMonthlySpend = totalDailySpend * 30;
      
      // Calculate efficiency gain
      const efficiencyGain = (analysis.summary.potentialMonthlySavings / totalMonthlySpend) * 100;
      
      // v1.2 success criteria: 20-30% efficiency gain
      expect(efficiencyGain).toBeGreaterThanOrEqual(20);
      
      console.log(`Efficiency Gain: ${efficiencyGain.toFixed(1)}%`);
      console.log(`Monthly Savings: $${analysis.summary.potentialMonthlySavings.toFixed(2)}`);
      console.log(`Annual SEO Value: $${analysis.summary.estimatedOrganicValue.toFixed(2)}`);
    });

    it('should provide actionable recommendations', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      // Every protect winner should have a specific bid adjustment
      for (const winner of analysis.protectWinners) {
        expect(winner.recommendedBidAdjustment).toBeDefined();
        expect(winner.recommendedBidAdjustment).not.toBe(0);
        expect(winner.reason).toBeDefined();
        expect(winner.reason.length).toBeGreaterThan(0);
      }

      // Every harvest opportunity should have SEO recommendation
      for (const opp of analysis.harvestOpportunities) {
        expect(opp.seoRecommendation).toBeDefined();
        expect(opp.seoRecommendation.length).toBeGreaterThan(0);
        expect(opp.priority).toMatch(/HIGH|MEDIUM|LOW/);
      }
    });

    it('should identify significant protect winners', async () => {
      const data = await analyzer.parsePaidOrganicReport(testDataPath);
      const analysis = analyzer.analyzeGaps(data);
      
      // Should have at least 5 protect winners with >$50/day savings potential
      const significantWinners = analysis.protectWinners.filter(
        w => w.potentialSavings >= 50
      );
      
      expect(significantWinners.length).toBeGreaterThanOrEqual(5);
      
      // Top winner should save significant amount
      if (analysis.protectWinners.length > 0) {
        expect(analysis.protectWinners[0].potentialSavings).toBeGreaterThan(100);
      }
    });
  });
});