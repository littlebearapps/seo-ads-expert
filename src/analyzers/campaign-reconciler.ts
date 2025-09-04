import pino from 'pino';
import { z } from 'zod';
import { 
  GoogleAdsApiClient, 
  Campaign, 
  AdGroup, 
  Keyword, 
  Ad,
  ReconciliationReport,
  Discrepancy 
} from '../connectors/google-ads-api.js';
import { OpportunityAnalyzer } from './opportunity.js';
import { UnifiedOpportunitySchema } from '../types/schemas.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Drift analysis types
export interface DriftMetrics {
  totalDrift: number;
  criticalDrifts: number;
  performanceDrifts: number;
  structuralDrifts: number;
  budgetDrifts: number;
}

export interface DriftReport {
  customerId: string;
  product: string;
  timestamp: string;
  metrics: DriftMetrics;
  drifts: {
    campaigns: DriftItem[];
    adGroups: DriftItem[];
    keywords: DriftItem[];
    ads: DriftItem[];
    budgets: DriftItem[];
  };
  recommendations: string[];
  automationOpportunities: AutomationOpportunity[];
}

export interface DriftItem {
  entity: string;
  type: 'performance' | 'structural' | 'budget' | 'status';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  action: string;
  metrics?: {
    before: any;
    after: any;
    change: number;
    changePercent: number;
  };
}

export interface AutomationOpportunity {
  type: string;
  description: string;
  estimatedImpact: string;
  implementation: string;
  priority: 'low' | 'medium' | 'high';
}

// Plan vs Actual comparison types
export interface PlannedCampaignData {
  campaigns: Array<{
    name: string;
    status?: string;
    budgetMicros?: string;
    adGroups?: Array<{
      name: string;
      keywords?: string[];
      ads?: Array<{
        headlines: string[];
        descriptions: string[];
      }>;
    }>;
  }>;
  targetBudget?: number;
  targetCTR?: number;
  targetConversionRate?: number;
}

export class CampaignReconciler {
  private googleAdsClient: GoogleAdsApiClient;
  private opportunityAnalyzer: OpportunityAnalyzer;

  constructor() {
    this.googleAdsClient = new GoogleAdsApiClient();
    this.opportunityAnalyzer = new OpportunityAnalyzer();
  }

  /**
   * Analyze drift between planned and live campaigns
   */
  async analyzeDrift(
    planned: PlannedCampaignData, 
    customerId: string,
    product: string
  ): Promise<DriftReport> {
    const report: DriftReport = {
      customerId,
      product,
      timestamp: new Date().toISOString(),
      metrics: {
        totalDrift: 0,
        criticalDrifts: 0,
        performanceDrifts: 0,
        structuralDrifts: 0,
        budgetDrifts: 0
      },
      drifts: {
        campaigns: [],
        adGroups: [],
        keywords: [],
        ads: [],
        budgets: []
      },
      recommendations: [],
      automationOpportunities: []
    };

    try {
      // Get reconciliation data
      const reconciliation = await this.googleAdsClient.reconcile(planned, customerId);
      
      // Analyze campaign drift
      await this.analyzeCampaignDrift(planned, customerId, report);
      
      // Analyze performance drift
      await this.analyzePerformanceDrift(planned, customerId, report);
      
      // Analyze budget drift
      await this.analyzeBudgetDrift(planned, customerId, report);
      
      // Generate recommendations
      this.generateDriftRecommendations(report);
      
      // Identify automation opportunities
      this.identifyAutomationOpportunities(report, reconciliation);

      logger.info(`Drift analysis complete for ${product}: ${report.metrics.totalDrift} total drifts found`);
    } catch (error) {
      logger.error('Error analyzing drift:', error);
      throw error;
    }

    return report;
  }

  /**
   * Analyze structural drift in campaigns
   */
  private async analyzeCampaignDrift(
    planned: PlannedCampaignData,
    customerId: string,
    report: DriftReport
  ): Promise<void> {
    try {
      const liveCampaigns = await this.googleAdsClient.getCampaigns(customerId);
      
      for (const plannedCampaign of planned.campaigns) {
        const liveCampaign = liveCampaigns.find(c => 
          c.name.toLowerCase() === plannedCampaign.name.toLowerCase()
        );

        if (!liveCampaign) {
          report.drifts.campaigns.push({
            entity: plannedCampaign.name,
            type: 'structural',
            severity: 'high',
            description: 'Planned campaign does not exist',
            impact: 'No traffic or conversions from this campaign',
            action: 'Create campaign or verify naming'
          });
          report.metrics.structuralDrifts++;
          report.metrics.totalDrift++;
          continue;
        }

        // Check campaign status
        if (plannedCampaign.status && liveCampaign.status !== plannedCampaign.status) {
          report.drifts.campaigns.push({
            entity: liveCampaign.name,
            type: 'status',
            severity: liveCampaign.status === 'PAUSED' ? 'high' : 'medium',
            description: `Campaign status mismatch: ${liveCampaign.status} vs ${plannedCampaign.status}`,
            impact: liveCampaign.status === 'PAUSED' ? 'Campaign not serving ads' : 'Unexpected campaign state',
            action: `Update campaign status to ${plannedCampaign.status}`
          });
          report.metrics.structuralDrifts++;
          report.metrics.totalDrift++;
        }

        // Check ad groups
        if (plannedCampaign.adGroups) {
          const liveAdGroups = await this.googleAdsClient.getAdGroups(liveCampaign.id, customerId);
          
          for (const plannedAdGroup of plannedCampaign.adGroups) {
            const liveAdGroup = liveAdGroups.find(ag => 
              ag.name.toLowerCase() === plannedAdGroup.name.toLowerCase()
            );

            if (!liveAdGroup) {
              report.drifts.adGroups.push({
                entity: `${liveCampaign.name} > ${plannedAdGroup.name}`,
                type: 'structural',
                severity: 'medium',
                description: 'Planned ad group missing',
                impact: 'Reduced keyword coverage',
                action: 'Create ad group or verify structure'
              });
              report.metrics.structuralDrifts++;
              report.metrics.totalDrift++;
            } else {
              // Check keywords count
              if (plannedAdGroup.keywords) {
                const liveKeywords = await this.googleAdsClient.getKeywords(liveAdGroup.id, customerId);
                const keywordDiff = plannedAdGroup.keywords.length - liveKeywords.length;
                
                if (Math.abs(keywordDiff) > 5) {
                  report.drifts.keywords.push({
                    entity: `${liveCampaign.name} > ${liveAdGroup.name}`,
                    type: 'structural',
                    severity: keywordDiff > 0 ? 'medium' : 'low',
                    description: `Keyword count mismatch: ${liveKeywords.length} live vs ${plannedAdGroup.keywords.length} planned`,
                    impact: keywordDiff > 0 ? 'Missing keyword opportunities' : 'Potential keyword bloat',
                    action: keywordDiff > 0 ? 'Add missing keywords' : 'Review and prune keywords',
                    metrics: {
                      before: plannedAdGroup.keywords.length,
                      after: liveKeywords.length,
                      change: -keywordDiff,
                      changePercent: (-keywordDiff / plannedAdGroup.keywords.length) * 100
                    }
                  });
                  report.metrics.structuralDrifts++;
                  report.metrics.totalDrift++;
                }
              }

              // Check ads count
              if (plannedAdGroup.ads) {
                const liveAds = await this.googleAdsClient.getAds(liveAdGroup.id, customerId);
                const adDiff = plannedAdGroup.ads.length - liveAds.length;
                
                if (Math.abs(adDiff) > 0) {
                  report.drifts.ads.push({
                    entity: `${liveCampaign.name} > ${liveAdGroup.name}`,
                    type: 'structural',
                    severity: adDiff > 0 ? 'high' : 'low',
                    description: `Ad count mismatch: ${liveAds.length} live vs ${plannedAdGroup.ads.length} planned`,
                    impact: adDiff > 0 ? 'Reduced ad testing capability' : 'Potential ad fatigue',
                    action: adDiff > 0 ? 'Create additional ad variants' : 'Review ad performance',
                    metrics: {
                      before: plannedAdGroup.ads.length,
                      after: liveAds.length,
                      change: -adDiff,
                      changePercent: (-adDiff / plannedAdGroup.ads.length) * 100
                    }
                  });
                  if (adDiff > 0) {
                    report.metrics.criticalDrifts++;
                  }
                  report.metrics.structuralDrifts++;
                  report.metrics.totalDrift++;
                }
              }
            }
          }
        }
      }

      // Check for unplanned campaigns
      for (const liveCampaign of liveCampaigns) {
        const isPlanned = planned.campaigns.some(pc => 
          pc.name.toLowerCase() === liveCampaign.name.toLowerCase()
        );

        if (!isPlanned && liveCampaign.status === 'ENABLED') {
          report.drifts.campaigns.push({
            entity: liveCampaign.name,
            type: 'structural',
            severity: 'low',
            description: 'Unplanned campaign running',
            impact: 'Potential budget allocation to unoptimized campaign',
            action: 'Review campaign performance and add to plan if valuable'
          });
          report.metrics.structuralDrifts++;
          report.metrics.totalDrift++;
        }
      }
    } catch (error) {
      logger.error('Error analyzing campaign drift:', error);
    }
  }

  /**
   * Analyze performance drift
   */
  private async analyzePerformanceDrift(
    planned: PlannedCampaignData,
    customerId: string,
    report: DriftReport
  ): Promise<void> {
    try {
      const dateRange = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      };

      const campaigns = await this.googleAdsClient.getCampaigns(customerId);
      
      for (const campaign of campaigns) {
        const stats = await this.googleAdsClient.getPerformanceStats(
          campaign.id,
          'campaign',
          customerId,
          dateRange
        );

        // Check CTR performance
        if (planned.targetCTR && stats.ctr < planned.targetCTR * 0.8) {
          report.drifts.campaigns.push({
            entity: campaign.name,
            type: 'performance',
            severity: stats.ctr < planned.targetCTR * 0.5 ? 'high' : 'medium',
            description: `CTR below target: ${(stats.ctr * 100).toFixed(2)}% vs ${(planned.targetCTR * 100).toFixed(2)}% target`,
            impact: 'Reduced traffic and higher costs',
            action: 'Review ad copy and keyword relevance',
            metrics: {
              before: planned.targetCTR,
              after: stats.ctr,
              change: stats.ctr - planned.targetCTR,
              changePercent: ((stats.ctr - planned.targetCTR) / planned.targetCTR) * 100
            }
          });
          report.metrics.performanceDrifts++;
          report.metrics.totalDrift++;
        }

        // Check conversion rate
        if (planned.targetConversionRate && stats.conversionRate < planned.targetConversionRate * 0.8) {
          report.drifts.campaigns.push({
            entity: campaign.name,
            type: 'performance',
            severity: stats.conversionRate < planned.targetConversionRate * 0.5 ? 'critical' : 'high',
            description: `Conversion rate below target: ${(stats.conversionRate * 100).toFixed(2)}% vs ${(planned.targetConversionRate * 100).toFixed(2)}% target`,
            impact: 'Poor ROI and wasted spend',
            action: 'Review landing pages and targeting',
            metrics: {
              before: planned.targetConversionRate,
              after: stats.conversionRate,
              change: stats.conversionRate - planned.targetConversionRate,
              changePercent: ((stats.conversionRate - planned.targetConversionRate) / planned.targetConversionRate) * 100
            }
          });
          if (stats.conversionRate < planned.targetConversionRate * 0.5) {
            report.metrics.criticalDrifts++;
          }
          report.metrics.performanceDrifts++;
          report.metrics.totalDrift++;
        }

        // Check for zero impressions (dead campaigns)
        if (stats.impressions === 0) {
          report.drifts.campaigns.push({
            entity: campaign.name,
            type: 'performance',
            severity: 'critical',
            description: 'Campaign has zero impressions',
            impact: 'Campaign not serving any ads',
            action: 'Check campaign status, budget, and bid strategy'
          });
          report.metrics.criticalDrifts++;
          report.metrics.performanceDrifts++;
          report.metrics.totalDrift++;
        }
      }
    } catch (error) {
      logger.error('Error analyzing performance drift:', error);
    }
  }

  /**
   * Analyze budget drift
   */
  private async analyzeBudgetDrift(
    planned: PlannedCampaignData,
    customerId: string,
    report: DriftReport
  ): Promise<void> {
    try {
      const campaigns = await this.googleAdsClient.getCampaigns(customerId);
      let totalActualBudget = 0n;
      let totalPlannedBudget = 0n;

      for (const campaign of campaigns) {
        if (campaign.budget) {
          totalActualBudget += BigInt(campaign.budget.amountMicros);
        }

        const plannedCampaign = planned.campaigns.find(pc => 
          pc.name.toLowerCase() === campaign.name.toLowerCase()
        );

        if (plannedCampaign?.budgetMicros) {
          totalPlannedBudget += BigInt(plannedCampaign.budgetMicros);

          // Check individual campaign budget drift
          if (campaign.budget) {
            const actualBudget = BigInt(campaign.budget.amountMicros);
            const plannedBudget = BigInt(plannedCampaign.budgetMicros);
            const difference = actualBudget - plannedBudget;
            const differenceAmount = Number(difference / 1000000n);
            const percentChange = Number((difference * 100n) / plannedBudget);

            if (Math.abs(differenceAmount) > 5) { // More than $5 difference
              report.drifts.budgets.push({
                entity: campaign.name,
                type: 'budget',
                severity: Math.abs(differenceAmount) > 50 ? 'high' : 'medium',
                description: `Budget drift: $${Number(actualBudget / 1000000n).toFixed(2)} actual vs $${Number(plannedBudget / 1000000n).toFixed(2)} planned`,
                impact: differenceAmount > 0 ? 'Overspending budget' : 'Underutilizing budget',
                action: differenceAmount > 0 ? 'Reduce daily budget' : 'Increase budget to capture opportunity',
                metrics: {
                  before: Number(plannedBudget / 1000000n),
                  after: Number(actualBudget / 1000000n),
                  change: differenceAmount,
                  changePercent: percentChange
                }
              });
              report.metrics.budgetDrifts++;
              report.metrics.totalDrift++;
            }
          }
        }
      }

      // Check total budget drift
      if (planned.targetBudget) {
        const targetBudgetMicros = BigInt(planned.targetBudget * 1000000);
        const totalDifference = totalActualBudget - targetBudgetMicros;
        const totalDifferenceAmount = Number(totalDifference / 1000000n);
        const percentChange = Number((totalDifference * 100n) / targetBudgetMicros);

        if (Math.abs(totalDifferenceAmount) > 10) { // More than $10 total difference
          report.drifts.budgets.push({
            entity: 'Total Account Budget',
            type: 'budget',
            severity: Math.abs(totalDifferenceAmount) > 100 ? 'critical' : 'high',
            description: `Total budget drift: $${Number(totalActualBudget / 1000000n).toFixed(2)} actual vs $${planned.targetBudget.toFixed(2)} target`,
            impact: totalDifferenceAmount > 0 ? 'Account overspending' : 'Missing growth opportunities',
            action: 'Review and reallocate budgets across campaigns',
            metrics: {
              before: planned.targetBudget,
              after: Number(totalActualBudget / 1000000n),
              change: totalDifferenceAmount,
              changePercent: percentChange
            }
          });
          if (Math.abs(totalDifferenceAmount) > 100) {
            report.metrics.criticalDrifts++;
          }
          report.metrics.budgetDrifts++;
          report.metrics.totalDrift++;
        }
      }
    } catch (error) {
      logger.error('Error analyzing budget drift:', error);
    }
  }

  /**
   * Generate drift recommendations
   */
  private generateDriftRecommendations(report: DriftReport): void {
    // Critical recommendations
    if (report.metrics.criticalDrifts > 0) {
      report.recommendations.push(
        '🚨 URGENT: Address critical issues immediately to prevent further losses'
      );
    }

    // Performance recommendations
    if (report.metrics.performanceDrifts > 5) {
      report.recommendations.push(
        '📊 Review and optimize underperforming campaigns - consider A/B testing new ad variants'
      );
    }

    // Structural recommendations
    if (report.metrics.structuralDrifts > 10) {
      report.recommendations.push(
        '🏗️ Significant structural differences detected - consider full campaign restructuring'
      );
    }

    // Budget recommendations
    if (report.metrics.budgetDrifts > 3) {
      report.recommendations.push(
        '💰 Budget allocation needs rebalancing - redistribute funds to high-performing campaigns'
      );
    }

    // General recommendations based on patterns
    const highSeverityCount = [
      ...report.drifts.campaigns,
      ...report.drifts.adGroups,
      ...report.drifts.keywords,
      ...report.drifts.ads,
      ...report.drifts.budgets
    ].filter(d => d.severity === 'high' || d.severity === 'critical').length;

    if (highSeverityCount > 5) {
      report.recommendations.push(
        '⚡ Implement automated monitoring to catch drift earlier'
      );
    }

    if (report.metrics.totalDrift === 0) {
      report.recommendations.push(
        '✅ Campaigns are well-aligned with plan - focus on optimization opportunities'
      );
    }

    // Add specific action items
    const missingCampaigns = report.drifts.campaigns.filter(d => 
      d.description.includes('does not exist')
    );
    if (missingCampaigns.length > 0) {
      report.recommendations.push(
        `📝 Create ${missingCampaigns.length} missing campaign(s) to complete planned structure`
      );
    }

    const pausedCampaigns = report.drifts.campaigns.filter(d => 
      d.description.includes('PAUSED')
    );
    if (pausedCampaigns.length > 0) {
      report.recommendations.push(
        `▶️ Reactivate ${pausedCampaigns.length} paused campaign(s) to restore traffic`
      );
    }
  }

  /**
   * Identify automation opportunities
   */
  private identifyAutomationOpportunities(
    report: DriftReport, 
    reconciliation: ReconciliationReport
  ): void {
    // Budget automation
    if (report.metrics.budgetDrifts > 2) {
      report.automationOpportunities.push({
        type: 'Budget Automation',
        description: 'Implement automated budget pacing based on performance',
        estimatedImpact: 'Reduce budget waste by 15-30%',
        implementation: 'Use Google Ads API to adjust budgets daily based on conversion data',
        priority: 'high'
      });
    }

    // Bid automation
    if (report.metrics.performanceDrifts > 3) {
      report.automationOpportunities.push({
        type: 'Bid Strategy Optimization',
        description: 'Switch to automated bidding strategies',
        estimatedImpact: 'Improve CPA by 20-40%',
        implementation: 'Implement Target CPA or Target ROAS bidding',
        priority: 'high'
      });
    }

    // Ad testing automation
    const adDrifts = report.drifts.ads.filter(d => d.type === 'structural');
    if (adDrifts.length > 2) {
      report.automationOpportunities.push({
        type: 'Automated Ad Testing',
        description: 'Implement continuous A/B testing framework',
        estimatedImpact: 'Improve CTR by 10-25%',
        implementation: 'Use responsive search ads with automated asset testing',
        priority: 'medium'
      });
    }

    // Keyword automation
    const keywordDrifts = report.drifts.keywords.filter(d => d.type === 'structural');
    if (keywordDrifts.length > 3) {
      report.automationOpportunities.push({
        type: 'Dynamic Keyword Expansion',
        description: 'Automate keyword discovery and addition',
        estimatedImpact: 'Increase qualified traffic by 20-30%',
        implementation: 'Use search terms report to automatically add high-performing queries',
        priority: 'medium'
      });
    }

    // Negative keyword automation
    if (reconciliation.summary.totalDiscrepancies > 10) {
      report.automationOpportunities.push({
        type: 'Negative Keyword Management',
        description: 'Automated negative keyword list updates',
        estimatedImpact: 'Reduce wasted spend by 10-20%',
        implementation: 'Sync waste analysis with shared negative lists weekly',
        priority: 'high'
      });
    }

    // Reporting automation
    if (report.metrics.totalDrift > 15) {
      report.automationOpportunities.push({
        type: 'Drift Monitoring Dashboard',
        description: 'Real-time drift detection and alerting',
        estimatedImpact: 'Reduce response time to issues by 80%',
        implementation: 'Create automated daily reconciliation with Slack/email alerts',
        priority: 'low'
      });
    }
  }

  /**
   * Get quick reconciliation summary
   */
  async getQuickSummary(customerId: string): Promise<{
    isConfigured: boolean;
    hasAccess: boolean;
    campaignCount: number;
    totalBudget: number;
    lastSync?: string;
  }> {
    const isConfigured = this.googleAdsClient.isConfigured();
    
    if (!isConfigured) {
      return {
        isConfigured: false,
        hasAccess: false,
        campaignCount: 0,
        totalBudget: 0
      };
    }

    try {
      const campaigns = await this.googleAdsClient.getCampaigns(customerId);
      let totalBudgetMicros = 0n;
      
      for (const campaign of campaigns) {
        if (campaign.budget && campaign.status === 'ENABLED') {
          totalBudgetMicros += BigInt(campaign.budget.amountMicros);
        }
      }

      return {
        isConfigured: true,
        hasAccess: true,
        campaignCount: campaigns.filter(c => c.status === 'ENABLED').length,
        totalBudget: Number(totalBudgetMicros / 1000000n),
        lastSync: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting quick summary:', error);
      return {
        isConfigured: true,
        hasAccess: false,
        campaignCount: 0,
        totalBudget: 0
      };
    }
  }
}