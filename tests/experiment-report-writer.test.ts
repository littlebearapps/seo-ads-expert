import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExperimentReportWriter } from '../src/writers/experiment-report-writer.js';
import { readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('ExperimentReportWriter', () => {
  const testOutputDir = 'test-output/experiment-reports';
  let writer: ExperimentReportWriter;

  beforeEach(() => {
    writer = new ExperimentReportWriter(testOutputDir);
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('generateReport', () => {
    it('should generate a comprehensive experiment report', async () => {
      const mockReport = {
        experimentId: 'exp_123',
        name: 'Homepage CTA Test',
        type: 'landing_page' as const,
        status: 'completed',
        startDate: '2025-01-01',
        endDate: '2025-01-15',
        control: {
          id: 'control',
          name: 'Original CTA',
          metrics: {
            impressions: 10000,
            clicks: 500,
            ctr: 0.05,
            conversions: 50,
            conversionRate: 0.10,
            cost: 250,
            cpc: 0.50,
            cpa: 5.00
          }
        },
        variants: [
          {
            id: 'variant_a',
            name: 'Green Button CTA',
            metrics: {
              impressions: 10000,
              clicks: 600,
              ctr: 0.06,
              conversions: 72,
              conversionRate: 0.12,
              cost: 270,
              cpc: 0.45,
              cpa: 3.75
            }
          }
        ],
        winner: 'variant_a',
        statisticalAnalysis: {
          confidenceLevel: 0.95,
          pValue: 0.03,
          significantDifference: true,
          currentSampleSize: 20000,
          recommendedSampleSize: 15000,
          powerAnalysis: {
            currentPower: 0.85,
            requiredPower: 0.80,
            additionalSamplesNeeded: 0
          }
        },
        recommendations: [
          'Implement the Green Button CTA variant',
          'Monitor performance for 2 more weeks',
          'Consider testing button placement next'
        ]
      };

      const filepath = await writer.generateReport(mockReport);

      expect(existsSync(filepath)).toBe(true);

      const content = readFileSync(filepath, 'utf8');

      // Check key content
      expect(content).toContain('# A/B Test Experiment Report: Homepage CTA Test');
      expect(content).toContain('🏆 Winner Declared');
      expect(content).toContain('Green Button CTA');
      expect(content).toContain('**Statistical Significance**: ✅ Yes');
      expect(content).toContain('**P-Value**: 0.0300');
      expect(content).toContain('| Green Button CTA |');
      expect(content).toContain('+20.0%'); // Conversion rate improvement
      expect(content).toContain('Implement the Green Button CTA variant');
    });

    it('should handle experiments without winners', async () => {
      const mockReport = {
        experimentId: 'exp_456',
        name: 'Ad Copy Test',
        type: 'rsa' as const,
        status: 'running',
        startDate: '2025-01-10',
        control: {
          id: 'control',
          name: 'Original Ad',
          metrics: {
            impressions: 5000,
            clicks: 250,
            ctr: 0.05,
            conversions: 25,
            conversionRate: 0.10,
            cost: 125,
            cpc: 0.50,
            cpa: 5.00
          }
        },
        variants: [
          {
            id: 'variant_b',
            name: 'Benefit-Focused Ad',
            metrics: {
              impressions: 5000,
              clicks: 260,
              ctr: 0.052,
              conversions: 27,
              conversionRate: 0.104,
              cost: 130,
              cpc: 0.50,
              cpa: 4.81
            }
          }
        ],
        statisticalAnalysis: {
          confidenceLevel: 0.72,
          significantDifference: false,
          currentSampleSize: 10000,
          recommendedSampleSize: 25000
        },
        recommendations: [
          'Continue running the experiment',
          'Need 15,000 more impressions for statistical significance'
        ]
      };

      const filepath = await writer.generateReport(mockReport);
      const content = readFileSync(filepath, 'utf8');

      expect(content).not.toContain('🏆 Winner Declared');
      expect(content).toContain('**Statistical Significance**: ❌ Not yet');
      expect(content).toContain('**Status**: running');
    });
  });

  describe('generateExecutiveSummary', () => {
    it('should generate executive summary across multiple experiments', async () => {
      const mockExperiments = [
        {
          experimentId: 'exp_001',
          name: 'Test 1',
          type: 'landing_page' as const,
          status: 'completed',
          startDate: '2025-01-01',
          endDate: '2025-01-10',
          control: {
            id: 'control',
            name: 'Control',
            metrics: {
              impressions: 10000,
              clicks: 500,
              ctr: 0.05,
              conversions: 50,
              conversionRate: 0.10,
              cost: 250,
              cpc: 0.50,
              cpa: 5.00
            }
          },
          variants: [
            {
              id: 'variant_1',
              name: 'Variant 1',
              metrics: {
                impressions: 10000,
                clicks: 600,
                ctr: 0.06,
                conversions: 65,
                conversionRate: 0.108,
                cost: 270,
                cpc: 0.45,
                cpa: 4.15
              }
            }
          ],
          winner: 'variant_1',
          statisticalAnalysis: {
            confidenceLevel: 0.95,
            significantDifference: true,
            currentSampleSize: 20000
          },
          recommendations: []
        },
        {
          experimentId: 'exp_002',
          name: 'Test 2',
          type: 'rsa' as const,
          status: 'running',
          startDate: '2025-01-15',
          control: {
            id: 'control',
            name: 'Control',
            metrics: {
              impressions: 5000,
              clicks: 250,
              ctr: 0.05,
              conversions: 25,
              conversionRate: 0.10,
              cost: 125,
              cpc: 0.50,
              cpa: 5.00
            }
          },
          variants: [],
          statisticalAnalysis: {
            confidenceLevel: 0.60,
            significantDifference: false,
            currentSampleSize: 5000
          },
          recommendations: []
        }
      ];

      const filepath = await writer.generateExecutiveSummary(mockExperiments);
      const content = readFileSync(filepath, 'utf8');

      expect(content).toContain('# A/B Testing Executive Summary');
      expect(content).toContain('Total Experiments**: 2');
      expect(content).toContain('Completed Experiments**: 1');
      expect(content).toContain('Running Experiments**: 1');
      expect(content).toContain('Experiments with Winners**: 1');
      expect(content).toContain('## 🚀 Active Experiments');
      expect(content).toContain('## 🏆 Recent Winners');
      expect(content).toContain('Test 1');
      expect(content).toContain('Improvement**: +8.0% conversion rate');
    });

    it('should calculate key insights correctly', async () => {
      const mockExperiments = [
        {
          experimentId: 'exp_001',
          name: 'Test 1',
          type: 'landing_page' as const,
          status: 'completed',
          startDate: '2025-01-01',
          endDate: '2025-01-10',
          control: {
            id: 'control',
            name: 'Control',
            metrics: {
              impressions: 10000,
              clicks: 500,
              ctr: 0.05,
              conversions: 50,
              conversionRate: 0.10,
              cost: 250,
              cpc: 0.50,
              cpa: 5.00
            }
          },
          variants: [
            {
              id: 'variant_1',
              name: 'Variant 1',
              metrics: {
                impressions: 10000,
                clicks: 600,
                ctr: 0.06,
                conversions: 60,
                conversionRate: 0.12, // 20% improvement
                cost: 270,
                cpc: 0.45,
                cpa: 4.50
              }
            }
          ],
          winner: 'variant_1',
          statisticalAnalysis: {
            confidenceLevel: 0.95,
            significantDifference: true,
            currentSampleSize: 20000
          },
          recommendations: []
        },
        {
          experimentId: 'exp_002',
          name: 'Test 2',
          type: 'rsa' as const,
          status: 'completed',
          startDate: '2025-01-05',
          endDate: '2025-01-15',
          control: {
            id: 'control',
            name: 'Control',
            metrics: {
              impressions: 8000,
              clicks: 400,
              ctr: 0.05,
              conversions: 40,
              conversionRate: 0.10,
              cost: 200,
              cpc: 0.50,
              cpa: 5.00
            }
          },
          variants: [
            {
              id: 'variant_2',
              name: 'Variant 2',
              metrics: {
                impressions: 8000,
                clicks: 440,
                ctr: 0.055,
                conversions: 48,
                conversionRate: 0.11, // 10% improvement
                cost: 210,
                cpc: 0.48,
                cpa: 4.38
              }
            }
          ],
          winner: 'variant_2',
          statisticalAnalysis: {
            confidenceLevel: 0.90,
            significantDifference: true,
            currentSampleSize: 16000
          },
          recommendations: []
        }
      ];

      const filepath = await writer.generateExecutiveSummary(mockExperiments);
      const content = readFileSync(filepath, 'utf8');

      // Average improvement should be (20% + 10%) / 2 = 15%
      expect(content).toContain('Average conversion rate improvement from winning variants: 15.0%');
      // Success rate should be 2/2 = 100%
      expect(content).toContain('Success rate (experiments with clear winners): 100.0%');
    });
  });
});