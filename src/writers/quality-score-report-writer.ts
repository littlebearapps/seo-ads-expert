/**
 * Quality Score Report Writer - v1.4
 * Generates markdown reports for Quality Score analysis
 */

import type { QSAnalysis, QSIssue, QSRecommendation } from '../analyzers/quality-score-analyzer.js';

export class QualityScoreReportWriter {
  /**
   * Generate comprehensive QS triage report
   */
  generateTriageReport(analyses: QSAnalysis[]): string {
    const report: string[] = [];

    // Header
    report.push('# Quality Score Triage Report');
    report.push(`*Generated: ${new Date().toISOString().split('T')[0]}*\n`);

    // Executive Summary
    const avgScore = analyses.reduce((sum, a) => sum + a.avgQualityScore, 0) / analyses.length;
    const criticalCount = analyses.filter(a => a.avgQualityScore < 5).length;
    const lowCount = analyses.filter(a => a.avgQualityScore < 7).length;

    report.push('## Executive Summary\n');
    report.push(`- **Average Quality Score**: ${avgScore.toFixed(1)}/10`);
    report.push(`- **Critical Ad Groups** (QS < 5): ${criticalCount}`);
    report.push(`- **Low QS Ad Groups** (QS < 7): ${lowCount}`);
    report.push(`- **Total Ad Groups**: ${analyses.length}\n`);

    // Priority Action Items
    report.push('## Priority Action Items\n');
    const topPriority = analyses.slice(0, 5);
    report.push('### Urgent - Fix These First\n');
    
    for (const analysis of topPriority) {
      report.push(`#### ${analysis.adGroupName}`);
      report.push(`*Campaign: ${analysis.campaignName} | QS: ${analysis.avgQualityScore}/10 | Priority: ${analysis.priorityScore}*\n`);
      
      // Top recommendations for this ad group
      const urgentRecs = analysis.recommendations.filter(r => r.priority === 'urgent');
      if (urgentRecs.length > 0) {
        report.push('**Immediate Actions:**');
        for (const rec of urgentRecs) {
          report.push(`- ${rec.action} (${rec.expectedImprovement})`);
        }
        report.push('');
      }
    }

    // Component Analysis
    report.push('## Component Analysis\n');

    // Ad Relevance Issues
    const adRelevanceIssues = analyses.filter(a => 
      a.issues.some(i => i.component === 'adRelevance' && i.severity !== 'low')
    );
    report.push(`### Ad Relevance Issues (${adRelevanceIssues.length} ad groups)\n`);
    
    if (adRelevanceIssues.length > 0) {
      report.push('| Ad Group | Campaign | Avg Score | Keywords Affected | Action Required |');
      report.push('|----------|----------|-----------|-------------------|-----------------|');
      
      for (const analysis of adRelevanceIssues.slice(0, 10)) {
        const issue = analysis.issues.find(i => i.component === 'adRelevance');
        if (issue) {
          const action = analysis.recommendations.find(r => r.type === 'ad_copy')?.action || 'Update ad copy';
          report.push(
            `| ${analysis.adGroupName} | ${analysis.campaignName} | ${issue.avgScore.toFixed(1)} | ${issue.affectedKeywords.length} | ${action} |`
          );
        }
      }
      report.push('');
    }

    // Landing Page Experience Issues
    const lpIssues = analyses.filter(a => 
      a.issues.some(i => i.component === 'landingPageExperience' && i.severity !== 'low')
    );
    report.push(`### Landing Page Experience Issues (${lpIssues.length} ad groups)\n`);
    
    if (lpIssues.length > 0) {
      report.push('| Ad Group | Campaign | Avg Score | Keywords Affected | Common Issues |');
      report.push('|----------|----------|-----------|-------------------|---------------|');
      
      for (const analysis of lpIssues.slice(0, 10)) {
        const issue = analysis.issues.find(i => i.component === 'landingPageExperience');
        if (issue) {
          const lpRec = analysis.recommendations.find(r => r.type === 'landing_page');
          const issues = lpRec ? this.extractLPIssues(lpRec.implementation) : 'Check page quality';
          report.push(
            `| ${analysis.adGroupName} | ${analysis.campaignName} | ${issue.avgScore.toFixed(1)} | ${issue.affectedKeywords.length} | ${issues} |`
          );
        }
      }
      report.push('');
    }

    // Expected CTR Issues
    const ctrIssues = analyses.filter(a => 
      a.issues.some(i => i.component === 'expectedCTR' && i.severity !== 'low')
    );
    report.push(`### Expected CTR Issues (${ctrIssues.length} ad groups)\n`);
    
    if (ctrIssues.length > 0) {
      report.push('| Ad Group | Campaign | Avg Score | Keywords Affected | Improvement Strategy |');
      report.push('|----------|----------|-----------|-------------------|---------------------|');
      
      for (const analysis of ctrIssues.slice(0, 10)) {
        const issue = analysis.issues.find(i => i.component === 'expectedCTR');
        if (issue) {
          const ctrRec = analysis.recommendations.find(r => 
            r.type === 'ad_copy' || r.type === 'extensions'
          );
          const strategy = ctrRec?.action || 'Test new ad variations';
          report.push(
            `| ${analysis.adGroupName} | ${analysis.campaignName} | ${issue.avgScore.toFixed(1)} | ${issue.affectedKeywords.length} | ${strategy} |`
          );
        }
      }
      report.push('');
    }

    // Recommendations Summary
    report.push('## Recommendations Summary\n');
    
    const allRecs = analyses.flatMap(a => a.recommendations);
    const recsByType: { [key: string]: number } = {};
    const recsByPriority: { [key: string]: number } = {};
    
    for (const rec of allRecs) {
      recsByType[rec.type] = (recsByType[rec.type] || 0) + 1;
      recsByPriority[rec.priority] = (recsByPriority[rec.priority] || 0) + 1;
    }

    report.push('### By Type');
    for (const [type, count] of Object.entries(recsByType)) {
      report.push(`- **${this.formatRecType(type)}**: ${count} recommendations`);
    }
    report.push('');

    report.push('### By Priority');
    for (const priority of ['urgent', 'high', 'medium', 'low']) {
      if (recsByPriority[priority]) {
        report.push(`- **${this.capitalize(priority)}**: ${recsByPriority[priority]} recommendations`);
      }
    }
    report.push('');

    // Quick Wins Section
    report.push('## Quick Wins\n');
    report.push('*These improvements can be implemented quickly for immediate impact:*\n');
    
    const quickWins = analyses
      .flatMap(a => a.recommendations)
      .filter(r => r.type === 'ad_copy' && r.priority !== 'low')
      .slice(0, 10);
    
    for (const win of quickWins) {
      report.push(`- [ ] ${win.action}`);
      report.push(`  - Expected: ${win.expectedImprovement}`);
      report.push(`  - How: ${win.implementation}`);
    }

    return report.join('\n');
  }

  /**
   * Generate implementation checklist
   */
  generateImplementationChecklist(analyses: QSAnalysis[]): string {
    const checklist: string[] = [];

    checklist.push('# Quality Score Implementation Checklist');
    checklist.push(`*Generated: ${new Date().toISOString().split('T')[0]}*\n`);

    // Phase 1: Critical Fixes
    checklist.push('## Phase 1: Critical Fixes (Week 1)\n');
    checklist.push('*Focus on ad groups with QS < 5*\n');

    const critical = analyses.filter(a => a.avgQualityScore < 5);
    for (const analysis of critical) {
      checklist.push(`### ${analysis.adGroupName}`);
      for (const rec of analysis.recommendations.filter(r => r.priority === 'urgent')) {
        checklist.push(`- [ ] ${rec.action}`);
      }
      checklist.push('');
    }

    // Phase 2: High Priority
    checklist.push('## Phase 2: High Priority (Week 2)\n');
    checklist.push('*Ad groups with QS 5-7*\n');

    const highPriority = analyses.filter(a => a.avgQualityScore >= 5 && a.avgQualityScore < 7);
    for (const analysis of highPriority.slice(0, 10)) {
      checklist.push(`### ${analysis.adGroupName}`);
      for (const rec of analysis.recommendations.filter(r => r.priority === 'high')) {
        checklist.push(`- [ ] ${rec.action}`);
      }
      checklist.push('');
    }

    // Phase 3: Optimization
    checklist.push('## Phase 3: Optimization (Week 3-4)\n');
    checklist.push('*Fine-tuning and testing*\n');

    checklist.push('### Ad Copy Testing');
    checklist.push('- [ ] Create RSA variants with keyword insertion');
    checklist.push('- [ ] Test urgency and proof headlines');
    checklist.push('- [ ] Add "Chrome Extension" to all headlines');
    checklist.push('');

    checklist.push('### Landing Page Improvements');
    checklist.push('- [ ] Fix all noindex/404 issues');
    checklist.push('- [ ] Improve page load speed (<3s)');
    checklist.push('- [ ] Add relevant keyword content');
    checklist.push('- [ ] Ensure mobile responsiveness');
    checklist.push('');

    checklist.push('### Extensions Optimization');
    checklist.push('- [ ] Add sitelinks to key pages');
    checklist.push('- [ ] Create callout extensions');
    checklist.push('- [ ] Add structured snippets');
    checklist.push('');

    // Tracking
    checklist.push('## Success Tracking\n');
    checklist.push('- [ ] Baseline QS recorded');
    checklist.push('- [ ] Week 1 QS improvement measured');
    checklist.push('- [ ] Week 2 QS improvement measured');
    checklist.push('- [ ] Final QS improvement calculated');
    checklist.push('- [ ] CTR improvement tracked');
    checklist.push('- [ ] Conversion rate monitored');

    return checklist.join('\n');
  }

  /**
   * Extract LP issues from implementation text
   */
  private extractLPIssues(implementation: string): string {
    const issues: string[] = [];
    
    if (implementation.includes('noindex')) issues.push('noindex');
    if (implementation.includes('404')) issues.push('404');
    if (implementation.includes('slow')) issues.push('slow');
    if (implementation.includes('content')) issues.push('thin content');
    
    return issues.length > 0 ? issues.join(', ') : 'Check page';
  }

  /**
   * Format recommendation type for display
   */
  private formatRecType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'ad_copy': 'Ad Copy Updates',
      'landing_page': 'Landing Page Fixes',
      'keyword_relevance': 'Keyword Relevance',
      'extensions': 'Ad Extensions'
    };
    return typeMap[type] || type;
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}