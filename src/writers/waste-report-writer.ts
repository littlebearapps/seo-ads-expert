/**
 * Waste Report Writer - v1.4
 * Generates markdown reports for waste analysis
 */

import type { WastedTerm, NegativeKeyword } from '../analyzers/ngram-engine.js';

export class WasteReportWriter {
  /**
   * Generate comprehensive waste analysis report
   */
  generateReport(
    wastedTerms: WastedTerm[],
    totalWaste: number,
    negatives: NegativeKeyword[]
  ): string {
    const report: string[] = [];

    // Header
    report.push('# Waste Analysis Report');
    report.push(`*Generated: ${new Date().toISOString().split('T')[0]}*\n`);

    // Executive Summary
    report.push('## Executive Summary\n');
    report.push(`- **Total Waste Identified**: $${totalWaste.toFixed(2)}`);
    report.push(`- **Wasted Terms Found**: ${wastedTerms.length}`);
    report.push(`- **Negative Keywords Proposed**: ${negatives.length}`);
    report.push(`- **Potential Monthly Savings**: $${(totalWaste * 30 / wastedTerms[0]?.impressions || 1).toFixed(2)}\n`);

    // Top Offenders
    report.push('## Top Waste Offenders\n');
    report.push('| N-gram | Waste Amount | Reason | Impressions | Clicks | Action |');
    report.push('|--------|--------------|--------|-------------|--------|--------|');

    const topWasted = wastedTerms.slice(0, 20);
    for (const term of topWasted) {
      report.push(
        `| ${term.ngram} | $${term.wasteAmount.toFixed(2)} | ${this.formatReason(term.wasteReason)} | ${term.impressions.toLocaleString()} | ${term.clicks} | ${term.recommendedAction} |`
      );
    }
    report.push('');

    // N-gram Analysis by Type
    report.push('## N-gram Analysis\n');

    // Group by n-gram length
    const byLength: { [key: number]: WastedTerm[] } = {};
    for (const term of wastedTerms) {
      const length = term.ngram.split(' ').length;
      if (!byLength[length]) byLength[length] = [];
      byLength[length].push(term);
    }

    for (const [length, terms] of Object.entries(byLength)) {
      const totalWasteForLength = terms.reduce((sum, t) => sum + t.wasteAmount, 0);
      report.push(`### ${length}-gram Analysis`);
      report.push(`*${terms.length} patterns identified, $${totalWasteForLength.toFixed(2)} total waste*\n`);

      // Top 5 for each n-gram length
      const top5 = terms.slice(0, 5);
      for (const term of top5) {
        report.push(`- **"${term.ngram}"** - $${term.wasteAmount.toFixed(2)} waste`);
        report.push(`  - Examples: ${term.searchTermExamples.slice(0, 3).map(e => `"${e}"`).join(', ')}`);
      }
      report.push('');
    }

    // Proposed Negative Keywords
    report.push('## Proposed Negative Keywords\n');

    // Group by placement level
    const byLevel: { [key: string]: NegativeKeyword[] } = {};
    for (const neg of negatives) {
      if (!byLevel[neg.placementLevel]) byLevel[neg.placementLevel] = [];
      byLevel[neg.placementLevel].push(neg);
    }

    if (byLevel.shared && byLevel.shared.length > 0) {
      report.push('### Shared List (Non-Intent Terms)');
      report.push('*Add these to a shared negative list across all campaigns*\n');
      report.push('```');
      for (const neg of byLevel.shared) {
        report.push(`[${neg.keyword}]`);
      }
      report.push('```\n');
    }

    if (byLevel.campaign && byLevel.campaign.length > 0) {
      report.push('### Campaign Level (Platform/Competitor Terms)');
      report.push('*Add these at the campaign level*\n');
      report.push('```');
      for (const neg of byLevel.campaign) {
        report.push(`${neg.matchType === 'PHRASE' ? '"' : '['}${neg.keyword}${neg.matchType === 'PHRASE' ? '"' : ']'}`);
      }
      report.push('```\n');
    }

    if (byLevel.ad_group && byLevel.ad_group.length > 0) {
      report.push('### Ad Group Level (Specific Mismatches)');
      report.push('*Add these to specific ad groups*\n');
      
      // Group by confidence for ad group level
      const highConfidence = byLevel.ad_group.filter(n => n.confidence >= 0.8);
      const medConfidence = byLevel.ad_group.filter(n => n.confidence < 0.8);

      if (highConfidence.length > 0) {
        report.push('**High Confidence (Apply Immediately)**');
        report.push('```');
        for (const neg of highConfidence) {
          report.push(`${this.formatNegative(neg)}`);
        }
        report.push('```\n');
      }

      if (medConfidence.length > 0) {
        report.push('**Medium Confidence (Review Before Applying)**');
        report.push('```');
        for (const neg of medConfidence) {
          report.push(`${this.formatNegative(neg)} # ${neg.reason}`);
        }
        report.push('```\n');
      }
    }

    // Implementation Guide
    report.push('## Implementation Guide\n');
    report.push('### Google Ads Editor');
    report.push('1. Download `negatives_proposed.csv`');
    report.push('2. Open Google Ads Editor');
    report.push('3. Account → Import → From file');
    report.push('4. Select the CSV file');
    report.push('5. Review proposed changes');
    report.push('6. Post changes\n');

    report.push('### Google Ads API');
    report.push('1. Use `negatives_proposed.json`');
    report.push('2. Apply via API mutations');
    report.push('3. Monitor for 7 days');
    report.push('4. Check for impression loss\n');

    // Monitoring Recommendations
    report.push('## Post-Implementation Monitoring\n');
    report.push('**Week 1**: Check daily for significant impression drops');
    report.push('**Week 2**: Verify waste reduction metrics');
    report.push('**Week 4**: Calculate ROI improvement');
    report.push('');
    report.push('### KPIs to Track');
    report.push('- Wasted spend reduction (target: -80%)');
    report.push('- CTR improvement (target: +10-15%)');
    report.push('- Impression volume (should remain stable)');
    report.push('- Conversion rate (should improve)');

    return report.join('\n');
  }

  /**
   * Format waste reason for display
   */
  private formatReason(reason: string): string {
    switch (reason) {
      case 'zero_conversions':
        return 'No Conversions';
      case 'low_ctr':
        return 'Low CTR';
      case 'high_cost_no_value':
        return 'Poor ROI';
      default:
        return reason;
    }
  }

  /**
   * Format negative keyword for display
   */
  private formatNegative(neg: NegativeKeyword): string {
    switch (neg.matchType) {
      case 'EXACT':
        return `[${neg.keyword}]`;
      case 'PHRASE':
        return `"${neg.keyword}"`;
      case 'BROAD':
        return `+${neg.keyword.split(' ').join(' +')}`;
      default:
        return neg.keyword;
    }
  }
}