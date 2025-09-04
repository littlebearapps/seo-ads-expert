/**
 * Paid & Organic Gap Analysis Engine
 * Analyzes Google Ads Paid & Organic reports to identify channel optimization opportunities
 * Implements "Protect Winners", "Harvest Opportunities", and "Double Down" strategies
 */

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Schema for Paid & Organic report data
const PaidOrganicSchema = z.object({
  'Query': z.string(),
  'Clicks - organic': z.string().transform(val => parseInt(val.replace(/,/g, ''), 10)),
  'Clicks - paid': z.string().transform(val => parseInt(val.replace(/,/g, ''), 10)),
  'CTR - organic': z.string().transform(val => parseFloat(val.replace(/%/g, ''))),
  'CTR - paid': z.string().transform(val => parseFloat(val.replace(/%/g, ''))),
  'Impressions - organic': z.string().transform(val => parseInt(val.replace(/,/g, ''), 10)),
  'Impressions - paid': z.string().transform(val => parseInt(val.replace(/,/g, ''), 10)),
  'Average position - organic': z.string().transform(val => parseFloat(val) || 0),
  'Cost': z.string().transform(val => parseFloat(val.replace(/[$,]/g, ''))),
  'Conversions - paid': z.string().transform(val => parseFloat(val.replace(/,/g, '')) || 0).optional(),
  'Conv. value - paid': z.string().transform(val => parseFloat(val.replace(/[$,]/g, '')) || 0).optional(),
});

type PaidOrganicData = z.infer<typeof PaidOrganicSchema>;

// Opportunity types
export enum OpportunityType {
  PROTECT_WINNER = 'PROTECT_WINNER',      // High organic, high paid spend
  HARVEST_OPPORTUNITY = 'HARVEST_OPPORTUNITY', // Low/no organic, high paid performance
  DOUBLE_DOWN = 'DOUBLE_DOWN',            // Both channels performing well
  OPTIMIZE_PAID = 'OPTIMIZE_PAID',        // Poor paid performance
  SEO_OPPORTUNITY = 'SEO_OPPORTUNITY'      // No organic presence
}

// Gap analysis configuration
interface GapAnalysisConfig {
  organicTopPositionThreshold: number;    // Position 1-3 considered "winning"
  highPaidSpendThreshold: number;         // Daily spend threshold for consideration
  goodCtrThreshold: number;                // CTR% above this is "good"
  minImpressionsThreshold: number;        // Minimum impressions for analysis
  conversionValueMultiplier: number;      // ROI calculation multiplier
}

// Analysis results
interface GapAnalysis {
  protectWinners: ProtectWinner[];
  harvestOpportunities: HarvestOpportunity[];
  doubleDownTargets: DoubleDownTarget[];
  optimizationTargets: OptimizationTarget[];
  summary: GapSummary;
}

interface ProtectWinner {
  query: string;
  organicPosition: number;
  organicClicks: number;
  paidSpend: number;
  paidClicks: number;
  potentialSavings: number;
  recommendedBidAdjustment: number;
  reason: string;
}

interface HarvestOpportunity {
  query: string;
  paidPerformance: {
    clicks: number;
    cost: number;
    conversions?: number;
    conversionValue?: number;
    roi?: number;
  };
  organicPotential: {
    currentPosition: number;
    estimatedClicks: number;
    estimatedValue: number;
  };
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  seoRecommendation: string;
}

interface DoubleDownTarget {
  query: string;
  organicPerformance: {
    position: number;
    clicks: number;
    ctr: number;
  };
  paidPerformance: {
    clicks: number;
    cost: number;
    ctr: number;
  };
  combinedValue: number;
  recommendation: string;
}

interface OptimizationTarget {
  query: string;
  issue: string;
  currentMetrics: {
    organicPosition?: number;
    paidCtr?: number;
    paidCost?: number;
    conversions?: number;
  };
  recommendation: string;
  estimatedImpact: number;
}

interface GapSummary {
  totalQueries: number;
  protectWinnersCount: number;
  potentialMonthlySavings: number;
  harvestOpportunitiesCount: number;
  estimatedOrganicValue: number;
  doubleDownCount: number;
  optimizationNeeded: number;
}

export class PaidOrganicAnalyzer {
  private config: GapAnalysisConfig;

  constructor(config?: Partial<GapAnalysisConfig>) {
    this.config = {
      organicTopPositionThreshold: 3,
      highPaidSpendThreshold: 10, // $10/day
      goodCtrThreshold: 2.0, // 2% CTR
      minImpressionsThreshold: 100,
      conversionValueMultiplier: 3, // Assume 3x LTV
      ...config
    };
  }

  /**
   * Parse Paid & Organic report from Google Ads
   */
  async parsePaidOrganicReport(filePath: string): Promise<PaidOrganicData[]> {
    logger.info(`Parsing Paid & Organic report from ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Paid & Organic file not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // Skip header rows if they exist
    const lines = fileContent.split('\n');
    let dataStartIndex = 0;
    
    // Find the header row (contains "Query")
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (lines[i].includes('Query') && lines[i].includes('Clicks')) {
        dataStartIndex = i;
        break;
      }
    }

    const csvData = lines.slice(dataStartIndex).join('\n');
    
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });

    const paidOrganicData: PaidOrganicData[] = [];
    
    for (const record of records) {
      try {
        // Skip summary rows
        if (record['Query']?.includes('Total') || 
            record['Query']?.includes('--')) {
          continue;
        }
        
        const data = PaidOrganicSchema.parse(record);
        paidOrganicData.push(data);
      } catch (error) {
        logger.debug(`Skipping invalid row: ${JSON.stringify(record)}`);
      }
    }

    logger.info(`Parsed ${paidOrganicData.length} valid queries`);
    return paidOrganicData;
  }

  /**
   * Analyze gaps between paid and organic performance
   */
  analyzeGaps(data: PaidOrganicData[]): GapAnalysis {
    logger.info('Starting Paid & Organic gap analysis');
    
    const protectWinners: ProtectWinner[] = [];
    const harvestOpportunities: HarvestOpportunity[] = [];
    const doubleDownTargets: DoubleDownTarget[] = [];
    const optimizationTargets: OptimizationTarget[] = [];

    for (const row of data) {
      // Skip low-volume queries
      if (row['Impressions - organic'] + row['Impressions - paid'] < this.config.minImpressionsThreshold) {
        continue;
      }

      const opportunity = this.classifyOpportunity(row);

      switch (opportunity) {
        case OpportunityType.PROTECT_WINNER:
          const winner = this.analyzeProtectWinner(row);
          if (winner) protectWinners.push(winner);
          break;

        case OpportunityType.HARVEST_OPPORTUNITY:
          const harvest = this.analyzeHarvestOpportunity(row);
          if (harvest) harvestOpportunities.push(harvest);
          break;

        case OpportunityType.DOUBLE_DOWN:
          const doubleDown = this.analyzeDoubleDown(row);
          if (doubleDown) doubleDownTargets.push(doubleDown);
          break;

        case OpportunityType.OPTIMIZE_PAID:
        case OpportunityType.SEO_OPPORTUNITY:
          const optimization = this.analyzeOptimization(row, opportunity);
          if (optimization) optimizationTargets.push(optimization);
          break;
      }
    }

    // Sort by impact
    protectWinners.sort((a, b) => b.potentialSavings - a.potentialSavings);
    harvestOpportunities.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Calculate summary
    const summary: GapSummary = {
      totalQueries: data.length,
      protectWinnersCount: protectWinners.length,
      potentialMonthlySavings: protectWinners.reduce((sum, w) => sum + w.potentialSavings, 0) * 30,
      harvestOpportunitiesCount: harvestOpportunities.length,
      estimatedOrganicValue: harvestOpportunities.reduce(
        (sum, h) => sum + h.organicPotential.estimatedValue, 0
      ),
      doubleDownCount: doubleDownTargets.length,
      optimizationNeeded: optimizationTargets.length
    };

    logger.info(`Analysis complete: ${protectWinners.length} protect winners, ` +
               `${harvestOpportunities.length} harvest opportunities identified`);

    return {
      protectWinners,
      harvestOpportunities,
      doubleDownTargets,
      optimizationTargets,
      summary
    };
  }

  /**
   * Classify opportunity type for a query
   */
  private classifyOpportunity(row: PaidOrganicData): OpportunityType {
    const hasGoodOrganic = row['Average position - organic'] > 0 && 
                           row['Average position - organic'] <= this.config.organicTopPositionThreshold;
    const hasHighPaidSpend = row.Cost >= this.config.highPaidSpendThreshold;
    const hasGoodPaidPerformance = row['CTR - paid'] >= this.config.goodCtrThreshold;
    const hasOrganic = row['Impressions - organic'] > 0;

    if (hasGoodOrganic && hasHighPaidSpend) {
      return OpportunityType.PROTECT_WINNER;
    } else if (!hasOrganic && hasGoodPaidPerformance) {
      return OpportunityType.HARVEST_OPPORTUNITY;
    } else if (hasGoodOrganic && hasGoodPaidPerformance) {
      return OpportunityType.DOUBLE_DOWN;
    } else if (!hasOrganic && hasHighPaidSpend) {
      return OpportunityType.SEO_OPPORTUNITY;
    } else {
      return OpportunityType.OPTIMIZE_PAID;
    }
  }

  /**
   * Analyze "Protect Winner" opportunities
   */
  private analyzeProtectWinner(row: PaidOrganicData): ProtectWinner | null {
    // Calculate potential savings
    const organicShare = row['Clicks - organic'] / 
                        (row['Clicks - organic'] + row['Clicks - paid']);
    const potentialSavings = row.Cost * Math.min(organicShare, 0.5); // Conservative 50% max reduction
    
    // Recommend bid adjustment based on organic position
    let recommendedBidAdjustment = 0;
    if (row['Average position - organic'] === 1) {
      recommendedBidAdjustment = -30; // Reduce bids by 30%
    } else if (row['Average position - organic'] === 2) {
      recommendedBidAdjustment = -20; // Reduce bids by 20%
    } else if (row['Average position - organic'] === 3) {
      recommendedBidAdjustment = -10; // Reduce bids by 10%
    }

    return {
      query: row.Query,
      organicPosition: row['Average position - organic'],
      organicClicks: row['Clicks - organic'],
      paidSpend: row.Cost,
      paidClicks: row['Clicks - paid'],
      potentialSavings,
      recommendedBidAdjustment,
      reason: `Organic position #${row['Average position - organic']} capturing ${(organicShare * 100).toFixed(0)}% of clicks`
    };
  }

  /**
   * Analyze "Harvest Opportunity" - queries to target with SEO
   */
  private analyzeHarvestOpportunity(row: PaidOrganicData): HarvestOpportunity | null {
    // Estimate organic potential based on paid performance
    const avgCpc = row.Cost / (row['Clicks - paid'] || 1);
    const estimatedOrganicClicks = row['Clicks - paid'] * 0.3; // Conservative 30% of paid clicks
    const estimatedValue = estimatedOrganicClicks * avgCpc * 12; // Annual value
    
    // Calculate ROI if conversion data available
    let roi: number | undefined;
    if (row['Conversions - paid'] && row['Conv. value - paid']) {
      roi = (row['Conv. value - paid'] - row.Cost) / row.Cost;
    }

    // Determine priority
    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (row.Cost >= 50 && (!roi || roi > 2)) {
      priority = 'HIGH';
    } else if (row.Cost >= 20) {
      priority = 'MEDIUM';
    }

    // Generate SEO recommendation
    let seoRecommendation = 'Create dedicated landing page';
    if (row['CTR - paid'] > 5) {
      seoRecommendation = 'High intent query - create comprehensive guide + tool';
    } else if (row['Conversions - paid'] && row['Conversions - paid'] > 5) {
      seoRecommendation = 'High conversion query - optimize for featured snippet';
    }

    return {
      query: row.Query,
      paidPerformance: {
        clicks: row['Clicks - paid'],
        cost: row.Cost,
        conversions: row['Conversions - paid'],
        conversionValue: row['Conv. value - paid'],
        roi
      },
      organicPotential: {
        currentPosition: row['Average position - organic'] || 0,
        estimatedClicks: estimatedOrganicClicks,
        estimatedValue
      },
      priority,
      seoRecommendation
    };
  }

  /**
   * Analyze "Double Down" opportunities
   */
  private analyzeDoubleDown(row: PaidOrganicData): DoubleDownTarget | null {
    const totalClicks = row['Clicks - organic'] + row['Clicks - paid'];
    const avgCpc = row.Cost / (row['Clicks - paid'] || 1);
    const combinedValue = (row['Clicks - organic'] * avgCpc) + row.Cost;

    let recommendation = 'Maintain current strategy';
    if (row['CTR - organic'] > 5 && row['CTR - paid'] > 5) {
      recommendation = 'High-value query - increase investment in both channels';
    } else if (row['Average position - organic'] > 2) {
      recommendation = 'Improve organic position while maintaining paid presence';
    }

    return {
      query: row.Query,
      organicPerformance: {
        position: row['Average position - organic'],
        clicks: row['Clicks - organic'],
        ctr: row['CTR - organic']
      },
      paidPerformance: {
        clicks: row['Clicks - paid'],
        cost: row.Cost,
        ctr: row['CTR - paid']
      },
      combinedValue,
      recommendation
    };
  }

  /**
   * Analyze optimization targets
   */
  private analyzeOptimization(
    row: PaidOrganicData, 
    type: OpportunityType
  ): OptimizationTarget | null {
    let issue = '';
    let recommendation = '';
    let estimatedImpact = 0;

    if (type === OpportunityType.SEO_OPPORTUNITY) {
      issue = `No organic presence, spending $${row.Cost.toFixed(2)}/day on paid`;
      recommendation = 'Create SEO-optimized landing page to capture organic traffic';
      estimatedImpact = row.Cost * 30 * 0.3; // 30% potential reduction in monthly spend
    } else if (row['CTR - paid'] < 1) {
      issue = `Poor paid CTR (${row['CTR - paid'].toFixed(2)}%)`;
      recommendation = 'Review ad copy and keyword relevance';
      estimatedImpact = row.Cost * 0.2; // 20% potential improvement
    } else {
      issue = 'Suboptimal performance in both channels';
      recommendation = 'Review overall keyword strategy';
      estimatedImpact = row.Cost * 0.1;
    }

    return {
      query: row.Query,
      issue,
      currentMetrics: {
        organicPosition: row['Average position - organic'] || undefined,
        paidCtr: row['CTR - paid'],
        paidCost: row.Cost,
        conversions: row['Conversions - paid']
      },
      recommendation,
      estimatedImpact
    };
  }

  /**
   * Generate strategic recommendations report
   */
  generateGapReport(
    analysis: GapAnalysis,
    product: string,
    date: string
  ): string {
    const report: string[] = [
      `## Paid & Organic Gap Analysis - ${product} - ${date}`,
      '',
      `### Executive Summary`,
      `- **Total Queries Analyzed**: ${analysis.summary.totalQueries}`,
      `- **Potential Monthly Savings**: $${analysis.summary.potentialMonthlySavings.toFixed(2)}`,
      `- **SEO Opportunities Value**: $${analysis.summary.estimatedOrganicValue.toFixed(2)}/year`,
      `- **Protect Winners**: ${analysis.summary.protectWinnersCount} queries`,
      `- **Harvest Opportunities**: ${analysis.summary.harvestOpportunitiesCount} queries`,
      `- **Double Down Targets**: ${analysis.summary.doubleDownCount} queries`,
      '',
    ];

    // Protect Winners section
    if (analysis.protectWinners.length > 0) {
      report.push('### 🛡️ Protect Winners (Reduce Paid Spend)');
      report.push('High organic rankings where paid spend can be reduced:');
      report.push('');
      
      for (const winner of analysis.protectWinners.slice(0, 10)) {
        report.push(`#### "${winner.query}"`);
        report.push(`- **Organic Position**: #${winner.organicPosition}`);
        report.push(`- **Current Spend**: $${winner.paidSpend.toFixed(2)}/day`);
        report.push(`- **Potential Savings**: $${winner.potentialSavings.toFixed(2)}/day`);
        report.push(`- **Action**: Reduce bids by ${Math.abs(winner.recommendedBidAdjustment)}%`);
        report.push(`- **Rationale**: ${winner.reason}`);
        report.push('');
      }
    }

    // Harvest Opportunities section
    if (analysis.harvestOpportunities.length > 0) {
      report.push('### 🌱 Harvest Opportunities (Create SEO Content)');
      report.push('High-performing paid queries with no/low organic presence:');
      report.push('');
      
      const highPriority = analysis.harvestOpportunities.filter(h => h.priority === 'HIGH');
      for (const opp of highPriority.slice(0, 10)) {
        report.push(`#### "${opp.query}" [HIGH PRIORITY]`);
        report.push(`- **Paid Spend**: $${opp.paidPerformance.cost.toFixed(2)}/day`);
        report.push(`- **Paid Clicks**: ${opp.paidPerformance.clicks}`);
        if (opp.paidPerformance.roi !== undefined) {
          report.push(`- **ROI**: ${(opp.paidPerformance.roi * 100).toFixed(0)}%`);
        }
        report.push(`- **Organic Opportunity**: ${opp.organicPotential.estimatedClicks.toFixed(0)} clicks/month`);
        report.push(`- **Annual Value**: $${opp.organicPotential.estimatedValue.toFixed(2)}`);
        report.push(`- **SEO Action**: ${opp.seoRecommendation}`);
        report.push('');
      }
    }

    // Double Down section
    if (analysis.doubleDownTargets.length > 0) {
      report.push('### 🚀 Double Down Opportunities');
      report.push('Both channels performing well - increase investment:');
      report.push('');
      
      for (const target of analysis.doubleDownTargets.slice(0, 5)) {
        report.push(`- **"${target.query}"**`);
        report.push(`  - Organic: Position #${target.organicPerformance.position}, ${target.organicPerformance.clicks} clicks`);
        report.push(`  - Paid: ${target.paidPerformance.clicks} clicks, $${target.paidPerformance.cost.toFixed(2)}/day`);
        report.push(`  - Combined Value: $${target.combinedValue.toFixed(2)}/day`);
        report.push(`  - Action: ${target.recommendation}`);
        report.push('');
      }
    }

    // Optimization Targets section
    if (analysis.optimizationTargets.length > 0) {
      report.push('### ⚠️ Optimization Needed');
      report.push('Queries requiring immediate attention:');
      report.push('');
      
      for (const target of analysis.optimizationTargets.slice(0, 10)) {
        report.push(`- **"${target.query}"**`);
        report.push(`  - Issue: ${target.issue}`);
        report.push(`  - Action: ${target.recommendation}`);
        report.push(`  - Potential Impact: $${target.estimatedImpact.toFixed(2)}/month`);
        report.push('');
      }
    }

    // Implementation Roadmap
    report.push('### 📋 Implementation Roadmap');
    report.push('');
    report.push('**Week 1: Quick Wins**');
    report.push('1. Reduce bids on top "Protect Winner" queries');
    report.push(`   - Estimated savings: $${(analysis.summary.potentialMonthlySavings * 0.3).toFixed(2)}/month`);
    report.push('');
    report.push('**Week 2-3: SEO Content Creation**');
    report.push('2. Create landing pages for top "Harvest Opportunities"');
    report.push(`   - Target queries: ${Math.min(5, analysis.harvestOpportunities.length)} high-priority`);
    report.push('');
    report.push('**Week 4: Optimization & Monitoring**');
    report.push('3. Implement bid adjustments and monitor performance');
    report.push('4. Track organic ranking improvements');
    report.push('');

    return report.join('\n');
  }

  /**
   * Export bid adjustments for Google Ads
   */
  exportBidAdjustments(
    protectWinners: ProtectWinner[],
    outputPath: string
  ): void {
    const csvData = protectWinners.map(winner => ({
      'Keyword': winner.query,
      'Campaign': 'All campaigns',
      'Ad group': 'All ad groups',
      'New max CPC': '', // Will be calculated by percentage
      'Bid adjustment': `${winner.recommendedBidAdjustment}%`,
      'Reason': winner.reason,
      'Est. monthly savings': `$${(winner.potentialSavings * 30).toFixed(2)}`
    }));

    const csv = stringify(csvData, { header: true });
    fs.writeFileSync(outputPath, csv);
    logger.info(`Exported ${protectWinners.length} bid adjustments to ${outputPath}`);
  }
}

// Export helper function for CLI integration
export async function analyzePaidOrganicGaps(
  inputPath: string,
  product: string,
  outputDir: string
): Promise<GapAnalysis> {
  const analyzer = new PaidOrganicAnalyzer({
    organicTopPositionThreshold: 3,
    highPaidSpendThreshold: 10,
    goodCtrThreshold: 2.0
  });

  // Parse report
  const data = await analyzer.parsePaidOrganicReport(inputPath);
  
  // Analyze gaps
  const analysis = analyzer.analyzeGaps(data);
  
  // Generate report
  const date = new Date().toISOString().split('T')[0];
  const report = analyzer.generateGapReport(analysis, product, date);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save report
  const reportPath = path.join(outputDir, 'paid_organic_gaps.md');
  fs.writeFileSync(reportPath, report);
  logger.info(`Gap analysis report saved to ${reportPath}`);
  
  // Export bid adjustments
  if (analysis.protectWinners.length > 0) {
    const adjustmentsPath = path.join(outputDir, 'bid_adjustments.csv');
    analyzer.exportBidAdjustments(analysis.protectWinners, adjustmentsPath);
  }
  
  return analysis;
}