#!/usr/bin/env tsx

/**
 * Content Strategy Validation Script - Task 5 Testing
 * Tests content calendar generation and internal linking engine with real opportunity data
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ContentCalendarGenerator, ContentCalendarUtils } from './src/generators/content-calendar.js';
import { InternalLinkingEngine, InternalLinkingUtils } from './src/generators/internal-links.js';
import type { StrategicIntelligence, OpportunityItem } from './src/analyzers/strategic-orchestrator.js';

async function runContentStrategyValidation() {
  console.log('🎯 Content Strategy Validation - Task 5');
  console.log('=====================================\n');

  try {
    // Test data - using convertmyfile opportunity matrix data for realistic testing
    const testIntelligence: StrategicIntelligence = {
      executive_summary: {
        total_opportunities: 6,
        projected_annual_savings: 68100,
        projected_annual_growth: 194114.032,
        implementation_investment: 68100,
        net_roi_12_months: 185.0,
        confidence_level: 'high'
      },
      priority_matrix: {
        immediate_actions: [],
        quarter_1_roadmap: [],
        quarter_2_roadmap: [],
        long_term_strategic: []
      },
      cross_channel_insights: {
        search_terms_waste_total: 25000,
        gap_opportunities_count: 12,
        serp_volatility_alerts: 3,
        channel_efficiency_score: 87
      },
      resource_allocation: {
        immediate_budget_needed: 15000,
        quarterly_budget_plan: [15000, 20000, 18000, 15000],
        headcount_requirements: {
          seo_specialist_months: 3,
          paid_search_specialist_months: 2,
          content_creator_months: 4,
          developer_months: 1
        }
      },
      risk_assessment: {
        data_quality_risks: ['Limited historical data', 'Seasonal variations'],
        competitive_threats: ['Adobe Acrobat dominance', 'New AI-powered competitors'],
        seasonal_considerations: ['Q4 business document surge', 'Back-to-school period'],
        implementation_risks: ['Content quality consistency', 'Resource availability']
      },
      success_metrics: {
        monthly_tracking_kpis: ['Organic traffic growth', 'Content engagement', 'Internal link CTR'],
        milestone_targets: {
          'organic_traffic_growth': 25,
          'content_pieces_published': 36,
          'internal_links_implemented': 50
        },
        review_schedule: {
          weekly_reviews: ['Content performance review', 'Link implementation status'],
          monthly_deep_dives: ['Content strategy effectiveness', 'SEO impact assessment'],
          quarterly_strategy_updates: ['Content calendar refresh', 'Linking strategy optimization']
        }
      },
      // Real opportunity data from convertmyfile analysis
      opportunities: [
        {
          query: 'convert pdf to excel',
          opportunity_type: 'strategic_investment',
          priority: 'MEDIUM',
          impact_score: 8.2,
          effort_score: 6.3,
          confidence_score: 0.90,
          monthly_value: 4554,
          implementation_cost: 9525,
          roi_12_month: 473.8,
          payback_months: 2.1
        },
        {
          query: 'free pdf converter',
          opportunity_type: 'strategic_investment',
          priority: 'MEDIUM',
          impact_score: 8.4,
          effort_score: 7.9,
          confidence_score: 0.95,
          monthly_value: 5130,
          implementation_cost: 11850,
          roi_12_month: 419.5,
          payback_months: 2.3
        },
        {
          query: 'pdf to word converter',
          opportunity_type: 'strategic_investment',
          priority: 'MEDIUM',
          impact_score: 7.9,
          effort_score: 7.7,
          confidence_score: 0.90,
          monthly_value: 2821,
          implementation_cost: 11550,
          roi_12_month: 193.1,
          payback_months: 4.1
        },
        {
          query: 'enterprise document management',
          opportunity_type: 'strategic_investment',
          priority: 'MEDIUM',
          impact_score: 7.5,
          effort_score: 8.9,
          confidence_score: 0.75,
          monthly_value: 1999,
          implementation_cost: 13350,
          roi_12_month: 79.7,
          payback_months: 6.7
        },
        {
          query: 'pdf merger online',
          opportunity_type: 'strategic_investment',
          priority: 'MEDIUM',
          impact_score: 7.5,
          effort_score: 6.5,
          confidence_score: 0.85,
          monthly_value: 1187,
          implementation_cost: 9825,
          roi_12_month: 45.0,
          payback_months: 8.3
        },
        {
          query: 'ai document processing',
          opportunity_type: 'strategic_investment',
          priority: 'LOW',
          impact_score: 6.6,
          effort_score: 8.0,
          confidence_score: 0.60,
          monthly_value: 484,
          implementation_cost: 12000,
          roi_12_month: -51.6,
          payback_months: 24.8
        }
      ] as OpportunityItem[]
    };

    console.log('📅 Testing Content Calendar Generation...');
    console.log('==========================================');

    // Initialize content calendar generator
    const calendarGenerator = new ContentCalendarGenerator({
      startDate: new Date('2025-01-06'), // Monday start
      weeks: 12, // Q1 planning
      piecesPerWeek: 3,
      maxHeavyPieces: 1,
      priorityThreshold: 7.0,
      seasonalBoost: 1.2,
      resourceConstraints: {
        light: 2,
        medium: 2,
        heavy: 1
      }
    });

    const contentCalendar = await calendarGenerator.generateCalendar(testIntelligence);
    
    // Calendar validation
    console.log(`✅ Generated calendar with ${contentCalendar.metadata.totalPieces} content pieces`);
    console.log(`✅ Covering ${contentCalendar.metadata.period.weeks} weeks (${contentCalendar.metadata.period.start} to ${contentCalendar.metadata.period.end})`);
    console.log(`✅ Average opportunity score: ${contentCalendar.metadata.averageScore.toFixed(1)}`);
    console.log(`✅ Resource distribution: ${contentCalendar.metadata.resourceDistribution.light} light, ${contentCalendar.metadata.resourceDistribution.medium} medium, ${contentCalendar.metadata.resourceDistribution.heavy} heavy`);

    // Sample content pieces
    console.log('\n📝 Sample Content Pieces:');
    console.log('========================');
    for (const entry of contentCalendar.calendar.slice(0, 5)) {
      console.log(`• Week ${entry.week} (${entry.dayOfWeek}): ${entry.title}`);
      console.log(`  - Type: ${entry.contentType} | Priority: ${entry.priority} | Resource: ${entry.resourceRequirement}`);
      console.log(`  - Target Keywords: ${entry.targetKeywords.slice(0, 2).join(', ')}`);
      console.log(`  - Opportunity Score: ${entry.opportunityScore.toFixed(1)} | Words: ~${entry.estimatedWords}`);
      console.log(`  - Brief: ${entry.brief.substring(0, 120)}...`);
      console.log('');
    }

    console.log('\n🔗 Testing Internal Linking Engine...');
    console.log('=====================================');

    // Initialize internal linking engine
    const linkingEngine = new InternalLinkingEngine({
      maxLinksPerPage: 5,
      minRelevanceThreshold: 0.6,
      anchorTextVariation: 0.7,
      competitorMentionPolicy: 'strict',
      authorityBoostThreshold: 0.8,
      productFocusWeight: 1.5
    });

    const linkingStrategy = await linkingEngine.generateLinkingStrategy(testIntelligence, contentCalendar);

    // Linking validation
    console.log(`✅ Generated ${linkingStrategy.metadata.totalOpportunities} linking opportunities`);
    console.log(`✅ ${linkingStrategy.metadata.highPriorityCount} high-priority links`);
    console.log(`✅ Estimated SEO value: ${linkingStrategy.metadata.estimatedTotalValue}`);
    const complianceRate = Math.round(((linkingStrategy.metadata.totalOpportunities - linkingStrategy.metadata.policyViolations) / linkingStrategy.metadata.totalOpportunities) * 100);
    console.log(`✅ Policy compliance: ${complianceRate}%`);

    // Sample linking opportunities
    console.log('\n🔗 Sample Linking Opportunities:');
    console.log('=================================');
    for (const opp of linkingStrategy.opportunities.slice(0, 5)) {
      console.log(`• ${opp.source.title} → ${opp.target.title}`);
      console.log(`  - Anchor: "${opp.anchor.text}" (${opp.anchor.placement})`);
      console.log(`  - Relevance: ${(opp.relevance * 100).toFixed(0)}% | Authority: ${(opp.authority * 100).toFixed(0)}% | Value: ${opp.estimatedValue}`);
      console.log(`  - Priority: ${opp.priority} | Type: ${opp.linkType} | Compliant: ${opp.policyCompliant ? 'Yes' : 'No'}`);
      console.log(`  - Implementation: ${opp.implementation.difficulty} (${opp.implementation.timeEstimate}min)`);
      console.log('');
    }

    // Implementation phases
    console.log('\n📋 Implementation Roadmap:');
    console.log('==========================');
    console.log(`Phase 1 (Immediate): ${linkingStrategy.implementation.phaseOne.length} opportunities`);
    console.log(`Phase 2 (Strategic): ${linkingStrategy.implementation.phaseTwo.length} opportunities`);
    console.log(`Phase 3 (Long-term): ${linkingStrategy.implementation.phaseThree.length} opportunities`);

    // Cluster analysis
    console.log('\n🏷️ Content Cluster Analysis:');
    console.log('============================');
    for (const cluster of linkingStrategy.clusters.slice(0, 5)) {
      console.log(`• ${cluster.cluster}: ${cluster.inboundLinks} inbound, ${cluster.outboundLinks} outbound, authority: ${cluster.authorityFlow}`);
      if (cluster.recommendations.length > 0) {
        console.log(`  - Recommendations: ${cluster.recommendations.join(', ')}`);
      }
    }

    console.log('\n📊 Success Criteria Validation');
    console.log('===============================');

    // Task 5 Success Criteria Check
    const criteriaResults = [];

    // 1. Content calendar with 30+ pieces over Q1 (12 weeks × 3 pieces)
    const contentCountCriteria = contentCalendar.metadata.totalPieces >= 30;
    criteriaResults.push(`Content Volume: ${contentCountCriteria ? '✅' : '❌'} (${contentCalendar.metadata.totalPieces}/30+ pieces)`);

    // 2. Content briefs include target keywords and opportunity scores  
    const briefQualityCriteria = contentCalendar.calendar.every(entry => 
      entry.brief.includes('Opportunity score') && entry.targetKeywords.length > 0
    );
    criteriaResults.push(`Content Quality: ${briefQualityCriteria ? '✅' : '❌'} (briefs include keywords & scores)`);

    // 3. Resource allocation across light/medium/heavy
    const resourceDistributionCriteria = 
      contentCalendar.metadata.resourceDistribution.light > 0 &&
      contentCalendar.metadata.resourceDistribution.medium > 0 &&
      contentCalendar.metadata.resourceDistribution.heavy > 0;
    criteriaResults.push(`Resource Distribution: ${resourceDistributionCriteria ? '✅' : '❌'} (all resource types used)`);

    // 4. Internal linking with 20+ opportunities
    const linkingOpportunitiesCriteria = linkingStrategy.metadata.totalOpportunities >= 20;
    criteriaResults.push(`Linking Opportunities: ${linkingOpportunitiesCriteria ? '✅' : '❌'} (${linkingStrategy.metadata.totalOpportunities}/20+ opportunities)`);

    // 5. Policy-compliant anchor text (>90%)
    const policyComplianceCriteria = complianceRate >= 90;
    criteriaResults.push(`Policy Compliance: ${policyComplianceCriteria ? '✅' : '❌'} (${complianceRate}%/90%+ compliance)`);

    // 6. Export functionality
    const calendarMarkdown = ContentCalendarUtils.formatCalendarAsMarkdown(contentCalendar);
    const calendarCSV = ContentCalendarUtils.exportCalendarAsCSV(contentCalendar);
    const linkingMarkdown = InternalLinkingUtils.formatStrategyAsMarkdown(linkingStrategy);
    const linkingCSV = InternalLinkingUtils.exportOpportunitiesAsCSV(linkingStrategy.opportunities);
    
    const exportCriteria = calendarMarkdown.length > 1000 && calendarCSV.length > 500 && 
                          linkingMarkdown.length > 500 && linkingCSV.length > 500;
    criteriaResults.push(`Export Functionality: ${exportCriteria ? '✅' : '❌'} (all formats working)`);

    // Print results
    for (const result of criteriaResults) {
      console.log(result);
    }

    const allPassed = criteriaResults.every(result => result.includes('✅'));
    console.log(`\n${allPassed ? '🎉 ALL CRITERIA PASSED!' : '⚠️  Some criteria need attention'}`);

    // Save outputs
    console.log('\n💾 Saving Output Files...');
    console.log('=========================');

    const outputDir = join(process.cwd(), 'plans', 'convertmyfile', '2025-01-06', 'content-strategy');
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (e) {
      // Directory might exist
    }

    // Save content calendar
    writeFileSync(join(outputDir, 'content-calendar.json'), JSON.stringify(contentCalendar, null, 2));
    writeFileSync(join(outputDir, 'content-calendar.md'), calendarMarkdown);
    writeFileSync(join(outputDir, 'content-calendar.csv'), calendarCSV);

    // Save linking strategy
    writeFileSync(join(outputDir, 'internal-linking.json'), JSON.stringify(linkingStrategy, null, 2));
    writeFileSync(join(outputDir, 'internal-linking.md'), linkingMarkdown);
    writeFileSync(join(outputDir, 'internal-linking.csv'), linkingCSV);

    // Save validation report
    const validationReport = {
      timestamp: new Date().toISOString(),
      task: 'Task 5: Content Calendar & Internal Linking',
      success_criteria: {
        content_volume: { passed: contentCountCriteria, actual: contentCalendar.metadata.totalPieces, required: 30 },
        content_quality: { passed: briefQualityCriteria, note: 'All briefs include keywords and scores' },
        resource_distribution: { passed: resourceDistributionCriteria, distribution: contentCalendar.metadata.resourceDistribution },
        linking_opportunities: { passed: linkingOpportunitiesCriteria, actual: linkingStrategy.metadata.totalOpportunities, required: 20 },
        policy_compliance: { passed: policyComplianceCriteria, actual: complianceRate, required: 90 },
        export_functionality: { passed: exportCriteria, note: 'All export formats working' }
      },
      overall_success: allPassed,
      calendar_summary: {
        total_pieces: contentCalendar.metadata.totalPieces,
        weeks_covered: contentCalendar.metadata.period.weeks,
        average_score: contentCalendar.metadata.averageScore,
        resource_distribution: contentCalendar.metadata.resourceDistribution
      },
      linking_summary: {
        total_opportunities: linkingStrategy.metadata.totalOpportunities,
        high_priority: linkingStrategy.metadata.highPriorityCount,
        estimated_value: linkingStrategy.metadata.estimatedTotalValue,
        compliance_rate: complianceRate
      }
    };

    writeFileSync(join(outputDir, 'task5-validation-report.json'), JSON.stringify(validationReport, null, 2));

    console.log(`✅ Content calendar saved (${contentCalendar.metadata.totalPieces} pieces)`);
    console.log(`✅ Internal linking strategy saved (${linkingStrategy.metadata.totalOpportunities} opportunities)`);
    console.log(`✅ Validation report saved`);
    console.log(`✅ All files saved to: ${outputDir}`);

    // Final success message
    console.log('\n🎯 Task 5 Content Strategy Validation Complete!');
    console.log('===============================================');
    console.log(`Status: ${allPassed ? '✅ SUCCESS' : '⚠️  NEEDS ATTENTION'}`);
    console.log(`Content pieces generated: ${contentCalendar.metadata.totalPieces}`);
    console.log(`Linking opportunities: ${linkingStrategy.metadata.totalOpportunities}`);
    console.log(`Average opportunity score: ${contentCalendar.metadata.averageScore.toFixed(1)}`);
    console.log(`Policy compliance: ${complianceRate}%`);
    console.log(`Estimated SEO value: $${linkingStrategy.metadata.estimatedTotalValue.toLocaleString()}`);

    if (allPassed) {
      console.log('\n🚀 Ready for production deployment!');
      console.log('Content calendar and internal linking systems are fully operational.');
    }

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run the validation
runContentStrategyValidation().catch(console.error);