/**
 * v1.5 Experiment Report Writer
 * Generates human-readable reports for A/B test experiments
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { formatCurrency, formatPercentage } from '../utils/formatters.js';

export interface ExperimentReport {
  experimentId: string;
  name: string;
  type: 'rsa' | 'landing_page';
  status: string;
  startDate: string;
  endDate?: string;
  control: VariantReport;
  variants: VariantReport[];
  winner?: string;
  statisticalAnalysis: StatisticalSummary;
  recommendations: string[];
}

export interface VariantReport {
  id: string;
  name: string;
  description?: string;
  metrics: {
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
    conversionRate: number;
    cost: number;
    cpc: number;
    cpa?: number;
  };
}

export interface StatisticalSummary {
  confidenceLevel: number;
  pValue?: number;
  significantDifference: boolean;
  recommendedSampleSize?: number;
  currentSampleSize: number;
  powerAnalysis?: {
    currentPower: number;
    requiredPower: number;
    additionalSamplesNeeded: number;
  };
}

export class ExperimentReportWriter {
  private readonly outputDir: string;

  constructor(outputDir = 'reports/experiments') {
    this.outputDir = outputDir;
  }

  /**
   * Generate comprehensive experiment report
   */
  async generateReport(report: ExperimentReport): Promise<string> {
    this.ensureDirectory(this.outputDir);

    const markdown = this.generateMarkdownReport(report);
    const filename = `experiment_${report.experimentId}_${new Date().toISOString().split('T')[0]}.md`;
    const filepath = join(this.outputDir, filename);

    writeFileSync(filepath, markdown, 'utf8');
    logger.info(`✅ Experiment report generated: ${filepath}`);

    return filepath;
  }

  /**
   * Generate executive summary across multiple experiments
   */
  async generateExecutiveSummary(experiments: ExperimentReport[]): Promise<string> {
    this.ensureDirectory(this.outputDir);

    const markdown = this.generateExecutiveMarkdown(experiments);
    const filename = `executive_summary_${new Date().toISOString().split('T')[0]}.md`;
    const filepath = join(this.outputDir, filename);

    writeFileSync(filepath, markdown, 'utf8');
    logger.info(`✅ Executive summary generated: ${filepath}`);

    return filepath;
  }

  /**
   * Generate detailed markdown report
   */
  private generateMarkdownReport(report: ExperimentReport): string {
    const lines: string[] = [];

    // Header
    lines.push(`# A/B Test Experiment Report: ${report.name}`);
    lines.push('');
    lines.push(`**Experiment ID**: ${report.experimentId}`);
    lines.push(`**Type**: ${report.type === 'rsa' ? 'Responsive Search Ad' : 'Landing Page'}`);
    lines.push(`**Status**: ${report.status}`);
    lines.push(`**Start Date**: ${report.startDate}`);
    if (report.endDate) {
      lines.push(`**End Date**: ${report.endDate}`);
    }
    lines.push('');

    // Winner announcement
    if (report.winner) {
      lines.push('## 🏆 Winner Declared');
      lines.push('');
      const winner = report.winner === report.control.id ? report.control :
                      report.variants.find(v => v.id === report.winner);
      if (winner) {
        lines.push(`**Winning Variant**: ${winner.name}`);
        lines.push(`**Confidence Level**: ${formatPercentage(report.statisticalAnalysis.confidenceLevel)}`);
        lines.push('');
      }
    }

    // Statistical Analysis
    lines.push('## 📊 Statistical Analysis');
    lines.push('');
    lines.push(`**Statistical Significance**: ${report.statisticalAnalysis.significantDifference ? '✅ Yes' : '❌ Not yet'}`);
    lines.push(`**Confidence Level**: ${formatPercentage(report.statisticalAnalysis.confidenceLevel)}`);
    if (report.statisticalAnalysis.pValue !== undefined) {
      lines.push(`**P-Value**: ${report.statisticalAnalysis.pValue.toFixed(4)}`);
    }
    lines.push(`**Current Sample Size**: ${report.statisticalAnalysis.currentSampleSize.toLocaleString()}`);
    if (report.statisticalAnalysis.recommendedSampleSize) {
      lines.push(`**Recommended Sample Size**: ${report.statisticalAnalysis.recommendedSampleSize.toLocaleString()}`);
    }
    lines.push('');

    // Power Analysis
    if (report.statisticalAnalysis.powerAnalysis) {
      lines.push('### Power Analysis');
      lines.push('');
      const power = report.statisticalAnalysis.powerAnalysis;
      lines.push(`**Current Power**: ${formatPercentage(power.currentPower)}`);
      lines.push(`**Required Power**: ${formatPercentage(power.requiredPower)}`);
      lines.push(`**Additional Samples Needed**: ${power.additionalSamplesNeeded.toLocaleString()}`);
      lines.push('');
    }

    // Performance Comparison
    lines.push('## 📈 Performance Comparison');
    lines.push('');

    // Table header
    lines.push('| Variant | CTR | Conv. Rate | CPC | CPA | Impressions | Clicks | Conversions | Cost |');
    lines.push('|---------|-----|------------|-----|-----|-------------|--------|-------------|------|');

    // Control
    const control = report.control;
    lines.push(`| **${control.name}** (Control) | ${formatPercentage(control.metrics.ctr)} | ${formatPercentage(control.metrics.conversionRate)} | ${formatCurrency(control.metrics.cpc)} | ${control.metrics.cpa ? formatCurrency(control.metrics.cpa) : 'N/A'} | ${control.metrics.impressions.toLocaleString()} | ${control.metrics.clicks.toLocaleString()} | ${control.metrics.conversions.toLocaleString()} | ${formatCurrency(control.metrics.cost)} |`);

    // Variants
    for (const variant of report.variants) {
      const ctrDiff = ((variant.metrics.ctr - control.metrics.ctr) / control.metrics.ctr * 100).toFixed(1);
      const convDiff = ((variant.metrics.conversionRate - control.metrics.conversionRate) / control.metrics.conversionRate * 100).toFixed(1);

      lines.push(`| ${variant.name} | ${formatPercentage(variant.metrics.ctr)} (${ctrDiff > '0' ? '+' : ''}${ctrDiff}%) | ${formatPercentage(variant.metrics.conversionRate)} (${convDiff > '0' ? '+' : ''}${convDiff}%) | ${formatCurrency(variant.metrics.cpc)} | ${variant.metrics.cpa ? formatCurrency(variant.metrics.cpa) : 'N/A'} | ${variant.metrics.impressions.toLocaleString()} | ${variant.metrics.clicks.toLocaleString()} | ${variant.metrics.conversions.toLocaleString()} | ${formatCurrency(variant.metrics.cost)} |`);
    }
    lines.push('');

    // Recommendations
    if (report.recommendations && report.recommendations.length > 0) {
      lines.push('## 💡 Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push(`*Report generated on ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  /**
   * Generate executive summary markdown
   */
  /**
   * Ensure directory exists
   */
  private ensureDirectory(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private generateExecutiveMarkdown(experiments: ExperimentReport[]): string {
    const lines: string[] = [];

    // Header
    lines.push('# A/B Testing Executive Summary');
    lines.push('');
    lines.push(`**Report Date**: ${new Date().toLocaleDateString()}`);
    lines.push(`**Total Experiments**: ${experiments.length}`);
    lines.push('');

    // Summary Statistics
    const completed = experiments.filter(e => e.status === 'completed').length;
    const running = experiments.filter(e => e.status === 'running').length;
    const winners = experiments.filter(e => e.winner).length;

    lines.push('## 📊 Summary Statistics');
    lines.push('');
    lines.push(`- **Completed Experiments**: ${completed}`);
    lines.push(`- **Running Experiments**: ${running}`);
    lines.push(`- **Experiments with Winners**: ${winners}`);
    lines.push('');

    // Active Experiments
    const activeExperiments = experiments.filter(e => e.status === 'running');
    if (activeExperiments.length > 0) {
      lines.push('## 🚀 Active Experiments');
      lines.push('');

      for (const exp of activeExperiments) {
        lines.push(`### ${exp.name}`);
        lines.push(`- **Type**: ${exp.type === 'rsa' ? 'Responsive Search Ad' : 'Landing Page'}`);
        lines.push(`- **Started**: ${exp.startDate}`);
        lines.push(`- **Sample Size**: ${exp.statisticalAnalysis.currentSampleSize.toLocaleString()}`);
        lines.push(`- **Statistical Significance**: ${exp.statisticalAnalysis.significantDifference ? 'Yes' : 'Not yet'}`);
        lines.push('');
      }
    }

    // Recent Winners
    const recentWinners = experiments
      .filter(e => e.winner && e.endDate)
      .sort((a, b) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime())
      .slice(0, 5);

    if (recentWinners.length > 0) {
      lines.push('## 🏆 Recent Winners');
      lines.push('');

      for (const exp of recentWinners) {
        const winner = exp.winner === exp.control.id ? exp.control :
                       exp.variants.find(v => v.id === exp.winner);
        if (winner) {
          const improvement = exp.winner === exp.control.id ? 0 :
            ((winner.metrics.conversionRate - exp.control.metrics.conversionRate) / exp.control.metrics.conversionRate * 100);

          lines.push(`### ${exp.name}`);
          lines.push(`- **Winner**: ${winner.name}`);
          lines.push(`- **Improvement**: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}% conversion rate`);
          lines.push(`- **Confidence**: ${formatPercentage(exp.statisticalAnalysis.confidenceLevel)}`);
          lines.push(`- **Completed**: ${exp.endDate}`);
          lines.push('');
        }
      }
    }

    // Key Insights
    lines.push('## 🔍 Key Insights');
    lines.push('');

    // Calculate average improvements
    const improvements = experiments
      .filter(e => e.winner && e.winner !== e.control.id)
      .map(e => {
        const winner = e.variants.find(v => v.id === e.winner)!;
        return (winner.metrics.conversionRate - e.control.metrics.conversionRate) / e.control.metrics.conversionRate;
      });

    if (improvements.length > 0) {
      const avgImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;
      lines.push(`- Average conversion rate improvement from winning variants: ${formatPercentage(avgImprovement)}`);
    }

    // Success rate
    const successRate = winners / completed;
    if (completed > 0) {
      lines.push(`- Success rate (experiments with clear winners): ${formatPercentage(successRate)}`);
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Executive summary generated on ${new Date().toISOString()}*`);

    return lines.join('\n');
  }
}

// Export singleton instance
export const experimentReportWriter = new ExperimentReportWriter();