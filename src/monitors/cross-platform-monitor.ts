import pino from 'pino';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface PlatformMetrics {
  platform: 'google' | 'microsoft';
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
  conversionRate: number;
  qualityScore?: number;
  avgPosition?: number;
}

export interface CrossPlatformMetrics {
  product: string;
  dateRange: {
    start: string;
    end: string;
  };
  combined: {
    totalImpressions: number;
    totalClicks: number;
    totalCost: number;
    totalConversions: number;
    avgCTR: number;
    avgCPC: number;
    avgConversionRate: number;
  };
  platforms: {
    google?: PlatformMetrics;
    microsoft?: PlatformMetrics;
  };
  comparison: {
    platformSplit: {
      google: number;
      microsoft: number;
    };
    performanceLeader: 'google' | 'microsoft' | 'tied';
    costEfficiencyLeader: 'google' | 'microsoft' | 'tied';
  };
}

export interface PlatformInsights {
  opportunities: OpportunityInsight[];
  recommendations: RecommendationInsight[];
  budgetAllocation: BudgetAllocation;
  riskFactors: RiskFactor[];
}

export interface OpportunityInsight {
  platform: 'google' | 'microsoft';
  type: 'traffic' | 'cost' | 'conversion' | 'keyword';
  title: string;
  description: string;
  potentialImpact: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
}

export interface RecommendationInsight {
  priority: number;
  action: string;
  reasoning: string;
  expectedImpact: string;
  timeline: string;
}

export interface BudgetAllocation {
  current: {
    google: number;
    microsoft: number;
  };
  recommended: {
    google: number;
    microsoft: number;
  };
  reasoning: string;
}

export interface RiskFactor {
  factor: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  mitigation: string;
}

export class CrossPlatformMonitor {
  
  /**
   * Generate comprehensive cross-platform metrics and insights
   */
  async generateCrossPlatformReport(
    product: string,
    dateRange?: { start: string; end: string }
  ): Promise<{ metrics: CrossPlatformMetrics; insights: PlatformInsights }> {
    logger.info(`Generating cross-platform report for ${product}`);
    
    // Use default date range if not provided
    if (!dateRange) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      
      dateRange = {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      };
    }
    
    // Collect platform metrics
    const googleMetrics = await this.fetchGoogleMetrics(product, dateRange);
    const microsoftMetrics = this.projectMicrosoftMetrics(googleMetrics);
    
    // Build cross-platform metrics
    const metrics = this.combinePlatformMetrics(product, dateRange, googleMetrics, microsoftMetrics);
    
    // Generate insights
    const insights = this.generateInsights(metrics, googleMetrics, microsoftMetrics);
    
    return { metrics, insights };
  }
  
  /**
   * Fetch Google Ads performance data (mock for now)
   */
  private async fetchGoogleMetrics(
    product: string,
    dateRange: { start: string; end: string }
  ): Promise<PlatformMetrics | null> {
    try {
      // Try to load from existing plan data
      const planDate = new Date().toISOString().split('T')[0];
      const summaryPath = join('plans', product, planDate, 'summary.json');
      
      if (existsSync(summaryPath)) {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        
        // Generate realistic metrics based on plan data
        const baseImpressions = summary.total_keywords * 100; // 100 impressions per keyword
        const baseCTR = 0.02; // 2% baseline CTR
        
        return {
          platform: 'google',
          impressions: baseImpressions,
          clicks: Math.round(baseImpressions * baseCTR),
          cost: Math.round(baseImpressions * baseCTR * 1.5), // $1.50 average CPC
          conversions: Math.round(baseImpressions * baseCTR * 0.1), // 10% conversion rate
          ctr: baseCTR,
          cpc: 1.5,
          conversionRate: 0.1,
          qualityScore: 7.5,
          avgPosition: 2.8
        };
      }
      
      // Fallback mock data
      return {
        platform: 'google',
        impressions: 10000,
        clicks: 200,
        cost: 300,
        conversions: 20,
        ctr: 0.02,
        cpc: 1.5,
        conversionRate: 0.1,
        qualityScore: 7.5,
        avgPosition: 2.8
      };
      
    } catch (error) {
      logger.warn(`Could not fetch Google metrics for ${product}: ${error}`);
      return null;
    }
  }
  
  /**
   * Project Microsoft Ads performance based on Google data
   */
  private projectMicrosoftMetrics(googleMetrics: PlatformMetrics | null): PlatformMetrics | null {
    if (!googleMetrics) return null;
    
    // Microsoft typically has:
    // - 10-15% of Google's volume
    // - 15-25% higher CTR (less competition)
    // - 20-30% lower CPCs
    // - Similar conversion rates
    
    const volumeFactor = 0.12; // 12% of Google volume
    const ctrBoost = 1.2; // 20% higher CTR
    const cpcReduction = 0.75; // 25% lower CPC
    
    const microsoftImpressions = Math.round(googleMetrics.impressions * volumeFactor);
    const microsoftCTR = Math.min(0.05, googleMetrics.ctr * ctrBoost); // Cap at 5%
    const microsoftClicks = Math.round(microsoftImpressions * microsoftCTR);
    const microsoftCPC = googleMetrics.cpc * cpcReduction;
    
    return {
      platform: 'microsoft',
      impressions: microsoftImpressions,
      clicks: microsoftClicks,
      cost: Math.round(microsoftClicks * microsoftCPC),
      conversions: Math.round(microsoftClicks * googleMetrics.conversionRate),
      ctr: microsoftCTR,
      cpc: microsoftCPC,
      conversionRate: googleMetrics.conversionRate,
      qualityScore: (googleMetrics.qualityScore || 7) + 0.5, // Slightly better quality scores
      avgPosition: Math.max(1.5, (googleMetrics.avgPosition || 3) - 0.5) // Better positions
    };
  }
  
  /**
   * Combine platform metrics into unified report
   */
  private combinePlatformMetrics(
    product: string,
    dateRange: { start: string; end: string },
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): CrossPlatformMetrics {
    const totalImpressions = (google?.impressions || 0) + (microsoft?.impressions || 0);
    const totalClicks = (google?.clicks || 0) + (microsoft?.clicks || 0);
    const totalCost = (google?.cost || 0) + (microsoft?.cost || 0);
    const totalConversions = (google?.conversions || 0) + (microsoft?.conversions || 0);
    
    return {
      product,
      dateRange,
      combined: {
        totalImpressions,
        totalClicks,
        totalCost,
        totalConversions,
        avgCTR: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
        avgCPC: totalClicks > 0 ? totalCost / totalClicks : 0,
        avgConversionRate: totalClicks > 0 ? totalConversions / totalClicks : 0
      },
      platforms: {
        ...(google && { google }),
        ...(microsoft && { microsoft })
      },
      comparison: {
        platformSplit: {
          google: totalImpressions > 0 ? Math.round(((google?.impressions || 0) / totalImpressions) * 100) : 0,
          microsoft: totalImpressions > 0 ? Math.round(((microsoft?.impressions || 0) / totalImpressions) * 100) : 0
        },
        performanceLeader: this.determinePerformanceLeader(google, microsoft),
        costEfficiencyLeader: this.determineCostEfficiencyLeader(google, microsoft)
      }
    };
  }
  
  /**
   * Generate actionable insights from cross-platform data
   */
  private generateInsights(
    metrics: CrossPlatformMetrics,
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): PlatformInsights {
    const opportunities = this.findOpportunities(google, microsoft);
    const recommendations = this.generateRecommendations(metrics, google, microsoft);
    const budgetAllocation = this.optimizeBudgetAllocation(google, microsoft);
    const riskFactors = this.identifyRiskFactors(metrics);
    
    return {
      opportunities,
      recommendations,
      budgetAllocation,
      riskFactors
    };
  }
  
  /**
   * Identify opportunities across platforms
   */
  private findOpportunities(
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): OpportunityInsight[] {
    const opportunities: OpportunityInsight[] = [];
    
    // Microsoft volume opportunity
    if (google && !microsoft) {
      opportunities.push({
        platform: 'microsoft',
        type: 'traffic',
        title: 'Untapped Microsoft Ads Traffic',
        description: 'Microsoft Ads could provide 10-15% additional reach with typically lower CPCs',
        potentialImpact: 'high',
        effort: 'medium'
      });
    }
    
    // CTR optimization opportunities
    if (microsoft && microsoft.ctr > (google?.ctr || 0) * 1.5) {
      opportunities.push({
        platform: 'google',
        type: 'conversion',
        title: 'Google Ads CTR Optimization',
        description: 'Microsoft Ads achieving significantly higher CTR - apply learnings to Google',
        potentialImpact: 'high',
        effort: 'low'
      });
    }
    
    // Cost efficiency opportunities
    if (microsoft && google && microsoft.cpc < google.cpc * 0.8) {
      opportunities.push({
        platform: 'microsoft',
        type: 'cost',
        title: 'Microsoft Ads Cost Advantage',
        description: 'Microsoft showing 20%+ lower CPCs - opportunity to increase budget allocation',
        potentialImpact: 'medium',
        effort: 'low'
      });
    }
    
    // Keyword opportunities
    opportunities.push({
      platform: 'microsoft',
      type: 'keyword',
      title: 'Microsoft-Specific Keywords',
      description: 'Target Edge browser and Microsoft ecosystem keywords for unique traffic',
      potentialImpact: 'medium',
      effort: 'medium'
    });
    
    return opportunities;
  }
  
  /**
   * Generate prioritized recommendations
   */
  private generateRecommendations(
    metrics: CrossPlatformMetrics,
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): RecommendationInsight[] {
    const recommendations: RecommendationInsight[] = [];
    
    if (google && !microsoft) {
      recommendations.push({
        priority: 1,
        action: 'Launch Microsoft Ads campaigns using Google Ads data',
        reasoning: 'Expand reach by 10-15% with typically 20-30% lower CPCs',
        expectedImpact: '10-15% additional traffic at lower cost per click',
        timeline: '1-2 weeks'
      });
    }
    
    if (google && microsoft) {
      recommendations.push({
        priority: 2,
        action: 'Optimize budget allocation based on performance data',
        reasoning: `${metrics.comparison.costEfficiencyLeader === 'microsoft' ? 'Microsoft' : 'Google'} showing better cost efficiency`,
        expectedImpact: '5-10% improvement in overall ROAS',
        timeline: 'Ongoing'
      });
    }
    
    recommendations.push({
      priority: 3,
      action: 'Implement cross-platform keyword strategy',
      reasoning: 'Different search behaviors between Google and Bing users',
      expectedImpact: 'Improved relevance and CTR across platforms',
      timeline: '2-3 weeks'
    });
    
    recommendations.push({
      priority: 4,
      action: 'Set up unified tracking and reporting dashboard',
      reasoning: 'Monitor performance holistically across both platforms',
      expectedImpact: 'Better optimization decisions and faster iteration',
      timeline: '1 week'
    });
    
    return recommendations;
  }
  
  /**
   * Optimize budget allocation between platforms
   */
  private optimizeBudgetAllocation(
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): BudgetAllocation {
    let reasoning = 'Budget allocation based on performance and opportunity analysis';
    
    if (!microsoft) {
      return {
        current: { google: 100, microsoft: 0 },
        recommended: { google: 85, microsoft: 15 },
        reasoning: 'Test Microsoft Ads with 15% of budget to capture additional reach'
      };
    }
    
    if (google && microsoft) {
      // Calculate efficiency scores
      const googleEfficiency = google.conversions / google.cost;
      const microsoftEfficiency = microsoft.conversions / microsoft.cost;
      
      if (microsoftEfficiency > googleEfficiency * 1.2) {
        return {
          current: { google: 85, microsoft: 15 },
          recommended: { google: 70, microsoft: 30 },
          reasoning: 'Microsoft Ads showing 20%+ better conversion efficiency - increase allocation'
        };
      }
    }
    
    return {
      current: { google: 85, microsoft: 15 },
      recommended: { google: 80, microsoft: 20 },
      reasoning: 'Balanced approach with slight preference for proven Google performance'
    };
  }
  
  /**
   * Identify risk factors
   */
  private identifyRiskFactors(metrics: CrossPlatformMetrics): RiskFactor[] {
    const risks: RiskFactor[] = [];
    
    // Platform concentration risk
    if (metrics.comparison.platformSplit.google > 90) {
      risks.push({
        factor: 'Platform Concentration Risk',
        severity: 'medium',
        description: 'Over-reliance on Google Ads creates vulnerability to policy changes or competition',
        mitigation: 'Diversify traffic sources by expanding to Microsoft Ads and organic channels'
      });
    }
    
    // Cost inflation risk
    if (metrics.combined.avgCPC > 2.0) {
      risks.push({
        factor: 'Cost Inflation Risk',
        severity: 'high',
        description: 'High average CPC indicates increasing competition and potential budget pressure',
        mitigation: 'Focus on quality score improvements and long-tail keyword optimization'
      });
    }
    
    // Conversion rate risk
    if (metrics.combined.avgConversionRate < 0.05) {
      risks.push({
        factor: 'Low Conversion Rate',
        severity: 'medium',
        description: 'Below-average conversion rate may indicate landing page or targeting issues',
        mitigation: 'Implement landing page A/B testing and audience refinement'
      });
    }
    
    return risks;
  }
  
  // Helper methods
  
  private determinePerformanceLeader(
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): 'google' | 'microsoft' | 'tied' {
    if (!google) return 'microsoft';
    if (!microsoft) return 'google';
    
    // Compare conversion rates as primary performance metric
    if (Math.abs(google.conversionRate - microsoft.conversionRate) < 0.01) {
      return 'tied';
    }
    
    return google.conversionRate > microsoft.conversionRate ? 'google' : 'microsoft';
  }
  
  private determineCostEfficiencyLeader(
    google: PlatformMetrics | null,
    microsoft: PlatformMetrics | null
  ): 'google' | 'microsoft' | 'tied' {
    if (!google) return 'microsoft';
    if (!microsoft) return 'google';
    
    // Calculate cost per conversion
    const googleCPConv = google.conversions > 0 ? google.cost / google.conversions : Infinity;
    const microsoftCPConv = microsoft.conversions > 0 ? microsoft.cost / microsoft.conversions : Infinity;
    
    if (Math.abs(googleCPConv - microsoftCPConv) < 5) {
      return 'tied';
    }
    
    return googleCPConv < microsoftCPConv ? 'google' : 'microsoft';
  }
}