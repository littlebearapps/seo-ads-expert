#!/usr/bin/env tsx
import { CrossPlatformMonitor } from './src/monitors/cross-platform-monitor.js';

async function testCrossPlatformMonitor() {
  console.log('🖥️ Testing Cross-Platform Monitor\n');
  
  const monitor = new CrossPlatformMonitor();
  
  // Generate report for PaletteKit
  const { metrics, insights } = await monitor.generateCrossPlatformReport('palettekit');
  
  console.log('📊 Cross-Platform Performance Report');
  console.log('=' .repeat(60));
  
  // Combined metrics
  console.log('\n📈 Combined Performance');
  console.log(`Total Impressions: ${metrics.combined.totalImpressions.toLocaleString()}`);
  console.log(`Total Clicks: ${metrics.combined.totalClicks.toLocaleString()}`);
  console.log(`Total Cost: $${metrics.combined.totalCost.toFixed(2)}`);
  console.log(`Total Conversions: ${metrics.combined.totalConversions}`);
  console.log(`Average CTR: ${(metrics.combined.avgCTR * 100).toFixed(2)}%`);
  console.log(`Average CPC: $${metrics.combined.avgCPC.toFixed(2)}`);
  console.log(`Average CVR: ${(metrics.combined.avgConversionRate * 100).toFixed(2)}%`);
  
  // Platform breakdown
  console.log('\n🏆 Platform Comparison');
  if (metrics.platforms.google) {
    console.log('\nGoogle Ads:');
    console.log(`  Impressions: ${metrics.platforms.google.impressions.toLocaleString()}`);
    console.log(`  CTR: ${(metrics.platforms.google.ctr * 100).toFixed(2)}%`);
    console.log(`  CPC: $${metrics.platforms.google.cpc.toFixed(2)}`);
    console.log(`  Quality Score: ${metrics.platforms.google.qualityScore}`);
  }
  
  if (metrics.platforms.microsoft) {
    console.log('\nMicrosoft Ads (Projected):');
    console.log(`  Impressions: ${metrics.platforms.microsoft.impressions.toLocaleString()}`);
    console.log(`  CTR: ${(metrics.platforms.microsoft.ctr * 100).toFixed(2)}%`);
    console.log(`  CPC: $${metrics.platforms.microsoft.cpc.toFixed(2)}`);
    console.log(`  Quality Score: ${metrics.platforms.microsoft.qualityScore}`);
  }
  
  console.log('\n🎯 Platform Split');
  console.log(`Google: ${metrics.comparison.platformSplit.google}%`);
  console.log(`Microsoft: ${metrics.comparison.platformSplit.microsoft}%`);
  console.log(`Performance Leader: ${metrics.comparison.performanceLeader}`);
  console.log(`Cost Efficiency Leader: ${metrics.comparison.costEfficiencyLeader}`);
  
  // Opportunities
  console.log('\n💡 Opportunities Identified');
  insights.opportunities.forEach((opp, i) => {
    console.log(`\n${i + 1}. ${opp.title} (${opp.platform.toUpperCase()})`);
    console.log(`   ${opp.description}`);
    console.log(`   Impact: ${opp.potentialImpact.toUpperCase()}, Effort: ${opp.effort.toUpperCase()}`);
  });
  
  // Recommendations
  console.log('\n🎯 Prioritized Recommendations');
  insights.recommendations.forEach((rec) => {
    console.log(`\n${rec.priority}. ${rec.action}`);
    console.log(`   Reasoning: ${rec.reasoning}`);
    console.log(`   Expected Impact: ${rec.expectedImpact}`);
    console.log(`   Timeline: ${rec.timeline}`);
  });
  
  // Budget allocation
  console.log('\n💰 Budget Allocation');
  console.log('Current:');
  console.log(`  Google: ${insights.budgetAllocation.current.google}%`);
  console.log(`  Microsoft: ${insights.budgetAllocation.current.microsoft}%`);
  console.log('Recommended:');
  console.log(`  Google: ${insights.budgetAllocation.recommended.google}%`);
  console.log(`  Microsoft: ${insights.budgetAllocation.recommended.microsoft}%`);
  console.log(`Reasoning: ${insights.budgetAllocation.reasoning}`);
  
  // Risk factors
  if (insights.riskFactors.length > 0) {
    console.log('\n⚠️ Risk Factors');
    insights.riskFactors.forEach((risk) => {
      console.log(`\n• ${risk.factor} (${risk.severity.toUpperCase()} RISK)`);
      console.log(`  ${risk.description}`);
      console.log(`  Mitigation: ${risk.mitigation}`);
    });
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Cross-Platform Analysis Complete!\n');
  
  // Show summary insights
  console.log('📌 Key Insights:');
  console.log('• Microsoft Ads could provide 10-15% additional reach');
  console.log('• Typically 20-30% lower CPCs on Microsoft platform');
  console.log('• Cross-platform strategy reduces dependency risk');
  console.log('• Different search behaviors require platform-specific optimization');
}

testCrossPlatformMonitor().catch(console.error);