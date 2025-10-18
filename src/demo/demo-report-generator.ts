/**
 * Demo Report Generator
 *
 * Generates formatted terminal output and CSV files for Google Ads API demo/screencast
 * Displays human-in-the-loop workflow, ML transparency, and safety controls
 */

import { DemoDataGenerator, type DemoRecommendation, type DemoCampaign } from './demo-data-generator.js';
import { promises as fs } from 'fs';
import path from 'path';

export class DemoReportGenerator {
  private generator: DemoDataGenerator;

  constructor() {
    this.generator = new DemoDataGenerator();
  }

  /**
   * Generate complete demo walkthrough for screencast
   */
  async generateFullDemo(outputDir: string): Promise<void> {
    // Create demo output directory
    await fs.mkdir(outputDir, { recursive: true });

    console.log('🎬 SEO Ads Expert - Demo Mode');
    console.log('');
    console.log('This demo showcases:');
    console.log('  ✅ Human-in-the-loop workflow');
    console.log('  ✅ ML transparency (confidence scores, impact estimates)');
    console.log('  ✅ Safety controls (caps, scoping, kill switch)');
    console.log('  ✅ Audit trail and rollback capability');
    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 1: Campaign Performance Overview
    await this.displayCampaignPerformance(outputDir);

    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 2: ML Recommendations with Thompson Sampling
    await this.displayRecommendations(outputDir);

    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 3: Diff Preview (Before/After)
    await this.displayDiffPreview(outputDir);

    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 4: Approval Workflow
    await this.displayApprovalWorkflow();

    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 5: Audit Log
    await this.displayAuditLog(outputDir);

    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 6: Automation Settings & Kill Switch
    await this.displayAutomationSettings();

    console.log('');
    console.log('─'.repeat(80));
    console.log('');

    // Scene 7: Security & Privacy Stats
    await this.displaySecurityStats();

    console.log('');
    console.log('─'.repeat(80));
    console.log('');
    console.log('🎉 Demo complete! All files saved to:', outputDir);
    console.log('');
    console.log('📄 Generated files:');
    console.log('   • campaign-performance.csv - Current campaign data');
    console.log('   • recommendations.csv - ML-ranked suggestions');
    console.log('   • diff-preview.csv - Before/after comparison');
    console.log('   • audit-log.csv - Change history with rollback info');
    console.log('');
  }

  /**
   * Scene 1: Display campaign performance overview
   */
  private async displayCampaignPerformance(outputDir: string): Promise<void> {
    console.log('📊 Scene 1: Campaign Performance Overview');
    console.log('');

    const campaigns = this.generator.generateDemoCampaigns();

    // Terminal output
    console.log('Current Campaigns (Account: 9495806872 - Test Account):');
    console.log('');
    console.log('┌────────────┬─────────────────────────────┬──────────┬────────┬───────────┬──────────┬─────────┐');
    console.log('│ ID         │ Campaign Name               │ Budget   │ Clicks │ Conv.     │ Cost     │ CVR     │');
    console.log('├────────────┼─────────────────────────────┼──────────┼────────┼───────────┼──────────┼─────────┤');

    campaigns.forEach(c => {
      const cvr = ((c.conversions / c.clicks) * 100).toFixed(2);
      console.log(`│ ${c.id} │ ${c.name.padEnd(27)} │ $${c.budget.toString().padEnd(7)} │ ${c.clicks.toString().padEnd(6)} │ ${c.conversions.toString().padEnd(9)} │ $${c.cost.toFixed(2).padEnd(7)} │ ${cvr}% │`);
    });

    console.log('└────────────┴─────────────────────────────┴──────────┴────────┴───────────┴──────────┴─────────┘');
    console.log('');

    // CSV export
    const csvContent = [
      'Campaign ID,Campaign Name,Budget,Clicks,Conversions,Cost,Impressions,CVR',
      ...campaigns.map(c => `${c.id},${c.name},${c.budget},${c.clicks},${c.conversions},${c.cost},${c.impressions},${((c.conversions / c.clicks) * 100).toFixed(2)}%`)
    ].join('\n');

    await fs.writeFile(path.join(outputDir, 'campaign-performance.csv'), csvContent);
    console.log('✅ Exported to: campaign-performance.csv');
  }

  /**
   * Scene 2: Display ML recommendations with Thompson Sampling
   */
  private async displayRecommendations(outputDir: string): Promise<void> {
    console.log('🤖 Scene 2: ML-Ranked Recommendations (Thompson Sampling)');
    console.log('');

    const recommendations = this.generator.generateDemoRecommendations();

    console.log('Optimization opportunities ranked by predicted impact:');
    console.log('');

    recommendations.forEach((rec, index) => {
      const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`${index + 1}. ${priorityEmoji} [${rec.type.toUpperCase()}] ${rec.description}`);
      console.log(`   🎯 Confidence: ${rec.confidence}%`);
      console.log(`   📈 Expected Lift: +${rec.expectedLift}% CVR`);
      console.log(`   🔢 Affects: ${rec.affectedEntities.campaigns} campaign(s), ${rec.affectedEntities.keywords} keyword(s)`);
      console.log(`   🤖 ML-Suggested: Thompson Sampling (Bayesian optimization)`);
      console.log('');
    });

    // CSV export
    const csvContent = [
      'ID,Type,Priority,Confidence,Expected Lift,Description,Campaigns Affected,Keywords Affected',
      ...recommendations.map(r => `${r.id},${r.type},${r.priority},${r.confidence}%,+${r.expectedLift}%,${r.description},${r.affectedEntities.campaigns},${r.affectedEntities.keywords}`)
    ].join('\n');

    await fs.writeFile(path.join(outputDir, 'recommendations.csv'), csvContent);
    console.log('✅ Exported to: recommendations.csv');
  }

  /**
   * Scene 3: Display diff preview (before/after)
   */
  private async displayDiffPreview(outputDir: string): Promise<void> {
    console.log('📋 Scene 3: Diff Preview (Before/After Comparison)');
    console.log('');
    console.log('Reviewing recommendation: rec-001 (Budget Reallocation)');
    console.log('');

    console.log('┌──────────────────────────────┬──────────┬──────────┬─────────┐');
    console.log('│ Campaign                     │ Before   │ After    │ Change  │');
    console.log('├──────────────────────────────┼──────────┼──────────┼─────────┤');
    console.log('│ Campaign A - Brand Keywords  │ $100/day │ $100/day │ ±$0     │');
    console.log('│ Campaign B - Product Keywds  │ $50/day  │ $75/day  │ +$25 ✅ │');
    console.log('│ Campaign C - Competitor Kw   │ $75/day  │ $50/day  │ -$25 ⚠️  │');
    console.log('└──────────────────────────────┴──────────┴──────────┴─────────┘');
    console.log('');
    console.log('Summary:');
    console.log('  • Total budget: $225/day (unchanged)');
    console.log('  • Campaigns affected: 2');
    console.log('  • Keywords affected: 0');
    console.log('  • Ads affected: 0');
    console.log('');
    console.log('💡 Reasoning: Campaign B has 11.05% CVR vs Campaign C\'s 3.64% CVR');
    console.log('   Reallocating budget should increase overall conversions by ~12.5%');
    console.log('');

    // CSV export
    const csvContent = [
      'Campaign ID,Campaign Name,Before ($/day),After ($/day),Change ($/day)',
      '1234567890,Campaign A - Brand Keywords,100,100,0',
      '1234567891,Campaign B - Product Keywords,50,75,+25',
      '1234567892,Campaign C - Competitor Keywords,75,50,-25'
    ].join('\n');

    await fs.writeFile(path.join(outputDir, 'diff-preview.csv'), csvContent);
    console.log('✅ Exported to: diff-preview.csv (for offline review)');
  }

  /**
   * Scene 4: Display approval workflow
   */
  private async displayApprovalWorkflow(): Promise<void> {
    console.log('✅ Scene 4: Approval Workflow');
    console.log('');
    console.log('┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│                         CONFIRMATION REQUIRED                          │');
    console.log('├────────────────────────────────────────────────────────────────────────┤');
    console.log('│ Apply 2 budget changes to Account 9495806872?                          │');
    console.log('│                                                                        │');
    console.log('│ Changes:                                                               │');
    console.log('│   • Campaign B: $50/day → $75/day (+$25)                              │');
    console.log('│   • Campaign C: $75/day → $50/day (-$25)                              │');
    console.log('│                                                                        │');
    console.log('│ Expected impact: +12.5% CVR lift                                       │');
    console.log('│ Confidence: 82%                                                        │');
    console.log('│                                                                        │');
    console.log('│ [Cancel]                                    [Confirm and Apply] ✅     │');
    console.log('└────────────────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('User selected: [Confirm and Apply]');
    console.log('');
    console.log('⏳ Applying changes via Google Ads API...');
    console.log('  ✅ Campaign 1234567891: Budget updated to $75.00/day');
    console.log('  ✅ Campaign 1234567892: Budget updated to $50.00/day');
    console.log('  ✅ Changes logged to audit trail');
    console.log('');
    console.log('🎉 Success! Changes applied successfully.');
    console.log('   View in audit log or rollback if needed.');
  }

  /**
   * Scene 5: Display audit log
   */
  private async displayAuditLog(outputDir: string): Promise<void> {
    console.log('📝 Scene 5: Audit Log (Change History)');
    console.log('');

    const auditLog = this.generator.generateDemoAuditLog();

    console.log('Recent changes (last 7 days):');
    console.log('');
    console.log('┌──────────┬─────────────────────┬────────────────┬──────────────────────────────┬────────────┬──────────┐');
    console.log('│ ID       │ Timestamp           │ User           │ Entity                       │ Change     │ Status   │');
    console.log('├──────────┼─────────────────────┼────────────────┼──────────────────────────────┼────────────┼──────────┤');

    auditLog.forEach(log => {
      const timestamp = new Date(log.timestamp).toLocaleString('en-US', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const user = log.user.split('@')[0].substring(0, 14);
      const entityName = log.entity.name.substring(0, 28).padEnd(28);
      const change = log.action === 'budget_change'
        ? `$${log.before.budget}→$${log.after.budget}`
        : `$${log.before.bid}→$${log.after.bid}`;
      const status = log.status === 'applied' ? '✅ Applied' : '⏳ Pending';

      console.log(`│ ${log.id.padEnd(8)} │ ${timestamp.padEnd(19)} │ ${user.padEnd(14)} │ ${entityName} │ ${change.padEnd(10)} │ ${status.padEnd(8)} │`);
    });

    console.log('└──────────┴─────────────────────┴────────────────┴──────────────────────────────┴────────────┴──────────┘');
    console.log('');
    console.log('💡 All changes can be rolled back with a single click');
    console.log('   Example: [Rollback] button reverts Campaign B budget to $50/day');
    console.log('');

    // CSV export
    const csvContent = [
      'Log ID,Timestamp,User,Action,Entity Type,Entity ID,Entity Name,Before,After,Status,Can Rollback',
      ...auditLog.map(log => {
        const before = log.action === 'budget_change' ? `$${log.before.budget}` : `$${log.before.bid}`;
        const after = log.action === 'budget_change' ? `$${log.after.budget}` : `$${log.after.bid}`;
        return `${log.id},${log.timestamp},${log.user},${log.action},${log.entity.type},${log.entity.id},${log.entity.name},${before},${after},${log.status},${log.canRollback}`;
      })
    ].join('\n');

    await fs.writeFile(path.join(outputDir, 'audit-log.csv'), csvContent);
    console.log('✅ Exported to: audit-log.csv');
  }

  /**
   * Scene 6: Display automation settings & kill switch
   */
  private async displayAutomationSettings(): Promise<void> {
    console.log('⚙️  Scene 6: Automation Settings & Kill Switch');
    console.log('');

    const settings = this.generator.generateDemoAutomationSettings();

    console.log('┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│                       AUTOMATION SETTINGS                              │');
    console.log('├────────────────────────────────────────────────────────────────────────┤');
    console.log('│                                                                        │');
    console.log('│ Auto-Apply Features: (All OFF by default)                             │');
    console.log('│                                                                        │');
    console.log('│   ☐ Auto-apply budget optimizations                                   │');
    console.log('│      Daily cap: 50 changes | Scope: Selected campaigns               │');
    console.log('│      Email: nathan@littlebearapps.com                                 │');
    console.log('│                                                                        │');
    console.log('│   ☐ Auto-apply bid adjustments                                        │');
    console.log('│      Daily cap: 100 changes | Scope: All campaigns                   │');
    console.log('│                                                                        │');
    console.log('│   ☐ Auto-apply keyword additions                                      │');
    console.log('│      Daily cap: 25 changes | Scope: Selected campaigns               │');
    console.log('│                                                                        │');
    console.log('├────────────────────────────────────────────────────────────────────────┤');
    console.log('│                                                                        │');
    console.log('│                    🔴 [DISABLE ALL AUTOMATION] 🔴                      │');
    console.log('│                                                                        │');
    console.log('│    Kill switch: Immediately disables all automated changes            │');
    console.log('│    Status: Active (no automation currently enabled)                   │');
    console.log('│                                                                        │');
    console.log('└────────────────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('💡 Safety features:');
    console.log('   • Auto-apply OFF by default (opt-in required)');
    console.log('   • Daily operation caps prevent runaway automation');
    console.log('   • Entity scoping limits changes to selected campaigns');
    console.log('   • Email summaries keep users informed');
    console.log('   • Kill switch disables everything immediately');
  }

  /**
   * Scene 7: Display security & privacy stats
   */
  private async displaySecurityStats(): Promise<void> {
    console.log('🔒 Scene 7: Security & Data Handling');
    console.log('');

    const stats = this.generator.generateDemoSecurityStats();

    console.log('Security Measures:');
    console.log('  🔒 OAuth tokens encrypted at rest (AES-256)');
    console.log('  🔐 Data in transit: TLS 1.3');
    console.log('  📅 Performance cache: 7-day retention, then auto-deleted');
    console.log('  📋 Audit logs: 90-day retention');
    console.log('  🗑️  Data deletion: Honored within 30 days of request');
    console.log('  ✅ GDPR & CCPA compliant');
    console.log('');
    console.log('API Usage (Today):');
    console.log(`  📊 Operations: ${stats.apiUsage.today}/${stats.apiUsage.dailyLimit} (${stats.apiUsage.percentage}% of daily limit)`);
    console.log('  ✅ Well below quota limits');
    console.log('');
    console.log('Security Incidents:');
    console.log(`  🎉 Total: ${stats.incidents.total} (zero incidents)`);
    console.log(`  🔍 Last checked: ${new Date(stats.incidents.lastChecked).toLocaleString()}`);
    console.log('');
    console.log('Data Export:');
    console.log('  📄 Users can export all their data in JSON/CSV format');
    console.log('  🗑️  Users can request complete data deletion anytime');
    console.log('');
  }
}
