import { z } from 'zod';

// Opportunity Matrix & Impact Scoring Engine
// Combines insights from search terms, paid/organic gaps, and SERP monitoring
// to create unified ROI-driven prioritization

export const OpportunityConfigSchema = z.object({
  weights: z.object({
    search_volume: z.number().min(0).max(1).default(0.25),
    commercial_intent: z.number().min(0).max(1).default(0.20),
    serp_difficulty: z.number().min(0).max(1).default(0.15),
    data_quality: z.number().min(0).max(1).default(0.10),
    market_size: z.number().min(0).max(1).default(0.15),
    seasonality: z.number().min(0).max(1).default(0.10),
    first_party_performance: z.number().min(0).max(1).default(0.05)
  }),
  business_priorities: z.object({
    revenue_focus: z.enum(['high', 'medium', 'low']).default('high'),
    brand_building: z.enum(['high', 'medium', 'low']).default('medium'),
    competitive_defense: z.enum(['high', 'medium', 'low']).default('medium'),
    market_expansion: z.enum(['high', 'medium', 'low']).default('low')
  }),
  investment_thresholds: z.object({
    high_impact_min: z.number().default(7.5),
    medium_impact_min: z.number().default(5.0),
    quick_win_max_effort: z.number().default(20), // hours
    enterprise_min_volume: z.number().default(1000)
  })
});

export type OpportunityConfig = z.infer<typeof OpportunityConfigSchema>;

export const OpportunitySourceSchema = z.object({
  type: z.enum(['search_terms', 'paid_organic', 'serp_monitoring', 'manual']),
  query: z.string(),
  market: z.string().default('US'),
  cluster: z.string().optional(),
  
  // Source-specific data
  search_volume: z.number().default(0),
  commercial_intent_score: z.number().min(0).max(1).default(0.5),
  serp_difficulty: z.number().min(0).max(1).default(0.5),
  
  // Performance data
  current_position: z.number().optional(),
  click_through_rate: z.number().optional(),
  conversion_rate: z.number().optional(),
  cost_per_click: z.number().optional(),
  monthly_spend: z.number().optional(),
  monthly_conversions: z.number().optional(),
  
  // Competitive intelligence
  top_competitors: z.array(z.string()).default([]),
  serp_features: z.array(z.string()).default([]),
  content_gaps: z.array(z.string()).default([]),
  
  // Time factors
  seasonality_factor: z.number().min(0.1).max(2.0).default(1.0),
  urgency: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  
  // Source metadata
  data_source_confidence: z.number().min(0).max(1).default(0.8),
  last_updated: z.string().datetime().default(() => new Date().toISOString())
});

export type OpportunitySource = z.infer<typeof OpportunitySourceSchema>;

export const OpportunityScoreSchema = z.object({
  query: z.string(),
  market: z.string(),
  cluster: z.string().optional(),
  
  // Core scoring components
  impact_score: z.number(),
  effort_score: z.number(),
  confidence_score: z.number(),
  
  // Detailed breakdowns
  volume_score: z.number(),
  intent_score: z.number(),
  difficulty_score: z.number(),
  data_quality_score: z.number(),
  market_opportunity_score: z.number(),
  competitive_advantage_score: z.number(),
  
  // Strategic classification
  opportunity_type: z.enum(['quick_win', 'strategic_investment', 'defensive_play', 'exploratory', 'harvest']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  timeline: z.enum(['immediate', 'q1', 'q2', 'q3', 'q4', 'long_term']),
  investment_level: z.enum(['low', 'medium', 'high', 'enterprise']),
  
  // ROI projections
  estimated_monthly_value: z.number(),
  estimated_implementation_cost: z.number(),
  roi_12_month: z.number(),
  payback_period_months: z.number(),
  
  // Recommended actions
  primary_strategy: z.enum(['seo_only', 'paid_only', 'seo_and_paid', 'content_first', 'competitive_analysis']),
  recommended_actions: z.array(z.string()),
  success_metrics: z.array(z.string()),
  
  // Meta
  calculation_timestamp: z.string().datetime(),
  data_sources: z.array(z.string())
});

export type OpportunityScore = z.infer<typeof OpportunityScoreSchema>;

export const OpportunityMatrixSchema = z.object({
  generated_at: z.string().datetime(),
  config: OpportunityConfigSchema,
  total_opportunities: z.number(),
  
  // Segmented opportunities
  quick_wins: z.array(OpportunityScoreSchema),
  strategic_investments: z.array(OpportunityScoreSchema),
  defensive_plays: z.array(OpportunityScoreSchema),
  exploratory: z.array(OpportunityScoreSchema),
  harvest_opportunities: z.array(OpportunityScoreSchema),
  
  // Summary metrics
  total_projected_value: z.number(),
  total_investment_required: z.number(),
  weighted_average_roi: z.number(),
  
  // Quarterly roadmap
  q1_priorities: z.array(z.string()),
  q2_priorities: z.array(z.string()),
  q3_priorities: z.array(z.string()),
  q4_priorities: z.array(z.string()),
  
  // Resource allocation
  recommended_budget_split: z.object({
    seo: z.number(),
    paid_search: z.number(),
    content: z.number(),
    technical: z.number(),
    competitive_analysis: z.number()
  })
});

export type OpportunityMatrix = z.infer<typeof OpportunityMatrixSchema>;

export class OpportunityAnalyzer {
  private config: OpportunityConfig;
  
  constructor(config: Partial<OpportunityConfig> = {}) {
    this.config = OpportunityConfigSchema.parse({
      weights: { ...OpportunityConfigSchema.shape.weights._def.innerType._def.defaultValue(), ...config.weights },
      business_priorities: { ...OpportunityConfigSchema.shape.business_priorities._def.innerType._def.defaultValue(), ...config.business_priorities },
      investment_thresholds: { ...OpportunityConfigSchema.shape.investment_thresholds._def.innerType._def.defaultValue(), ...config.investment_thresholds }
    });
  }
  
  /**
   * Calculate comprehensive impact score for a single opportunity
   */
  calculateImpactScore(source: OpportunitySource): OpportunityScore {
    const weights = this.config.weights;
    
    // Core scoring components
    const volumeScore = this.normalizeSearchVolume(source.search_volume);
    const intentScore = source.commercial_intent_score;
    const difficultyScore = 1 - source.serp_difficulty; // Invert difficulty (easier = higher score)
    const dataQualityScore = source.data_source_confidence;
    const marketScore = this.calculateMarketOpportunity(source);
    const seasonalityScore = this.normalizeSeasonality(source.seasonality_factor);
    const performanceScore = this.calculateFirstPartyPerformance(source);
    
    // Weighted impact calculation
    const impactScore = 
      volumeScore * weights.search_volume +
      intentScore * weights.commercial_intent +
      difficultyScore * weights.serp_difficulty +
      dataQualityScore * weights.data_quality +
      marketScore * weights.market_size +
      seasonalityScore * weights.seasonality +
      performanceScore * weights.first_party_performance;
    
    // Calculate effort score (implementation complexity)
    const effortScore = this.calculateEffortScore(source);
    
    // Calculate confidence based on data completeness
    const confidenceScore = this.calculateConfidenceScore(source);
    
    // Strategic classification
    const opportunityType = this.classifyOpportunityType(impactScore, effortScore, source);
    const priority = this.determinePriority(impactScore, effortScore, source.urgency);
    const timeline = this.determineTimeline(opportunityType, effortScore, source.urgency);
    const investmentLevel = this.determineInvestmentLevel(effortScore, source.search_volume);
    
    // ROI calculations
    const monthlyValue = this.estimateMonthlyValue(source, impactScore);
    const implementationCost = this.estimateImplementationCost(effortScore, opportunityType);
    const roi12Month = this.calculateROI(monthlyValue, implementationCost);
    const paybackMonths = this.calculatePaybackPeriod(monthlyValue, implementationCost);
    
    // Strategic recommendations
    const primaryStrategy = this.determinePrimaryStrategy(source, opportunityType);
    const actions = this.generateRecommendedActions(source, opportunityType, primaryStrategy);
    const metrics = this.defineSuccessMetrics(source, opportunityType);
    
    return {
      query: source.query,
      market: source.market,
      cluster: source.cluster,
      
      impact_score: impactScore,
      effort_score: effortScore,
      confidence_score: confidenceScore,
      
      volume_score: volumeScore,
      intent_score: intentScore,
      difficulty_score: difficultyScore,
      data_quality_score: dataQualityScore,
      market_opportunity_score: marketScore,
      competitive_advantage_score: this.calculateCompetitiveAdvantage(source),
      
      opportunity_type: opportunityType,
      priority,
      timeline,
      investment_level: investmentLevel,
      
      estimated_monthly_value: monthlyValue,
      estimated_implementation_cost: implementationCost,
      roi_12_month: roi12Month,
      payback_period_months: paybackMonths,
      
      primary_strategy: primaryStrategy,
      recommended_actions: actions,
      success_metrics: metrics,
      
      calculation_timestamp: new Date().toISOString(),
      data_sources: [source.type]
    };
  }
  
  /**
   * Generate comprehensive opportunity matrix from multiple sources
   */
  generateOpportunityMatrix(sources: OpportunitySource[]): OpportunityMatrix {
    // Calculate scores for all opportunities
    const scoredOpportunities = sources.map(source => this.calculateImpactScore(source));
    
    // Segment by opportunity type
    const quickWins = scoredOpportunities.filter(opp => opp.opportunity_type === 'quick_win');
    const strategicInvestments = scoredOpportunities.filter(opp => opp.opportunity_type === 'strategic_investment');
    const defensivePlays = scoredOpportunities.filter(opp => opp.opportunity_type === 'defensive_play');
    const exploratory = scoredOpportunities.filter(opp => opp.opportunity_type === 'exploratory');
    const harvestOpportunities = scoredOpportunities.filter(opp => opp.opportunity_type === 'harvest');
    
    // Calculate summary metrics
    const totalProjectedValue = scoredOpportunities.reduce((sum, opp) => sum + opp.estimated_monthly_value * 12, 0);
    const totalInvestment = scoredOpportunities.reduce((sum, opp) => sum + opp.estimated_implementation_cost, 0);
    const weightedROI = totalInvestment > 0 ? ((totalProjectedValue - totalInvestment) / totalInvestment) * 100 : 0;
    
    // Generate quarterly roadmap
    const { q1, q2, q3, q4 } = this.generateQuarterlyRoadmap(scoredOpportunities);
    
    // Calculate resource allocation
    const budgetSplit = this.calculateBudgetAllocation(scoredOpportunities);
    
    return {
      generated_at: new Date().toISOString(),
      config: this.config,
      total_opportunities: scoredOpportunities.length,
      
      quick_wins: quickWins.sort((a, b) => b.impact_score - a.impact_score),
      strategic_investments: strategicInvestments.sort((a, b) => b.roi_12_month - a.roi_12_month),
      defensive_plays: defensivePlays.sort((a, b) => this.getUrgencyWeight(a.priority) - this.getUrgencyWeight(b.priority)),
      exploratory: exploratory.sort((a, b) => b.confidence_score - a.confidence_score),
      harvest_opportunities: harvestOpportunities.sort((a, b) => b.estimated_monthly_value - a.estimated_monthly_value),
      
      total_projected_value: totalProjectedValue,
      total_investment_required: totalInvestment,
      weighted_average_roi: weightedROI,
      
      q1_priorities: q1,
      q2_priorities: q2,
      q3_priorities: q3,
      q4_priorities: q4,
      
      recommended_budget_split: budgetSplit
    };
  }
  
  /**
   * Export opportunity matrix to CSV format
   */
  exportToCSV(matrix: OpportunityMatrix): string {
    const allOpportunities = [
      ...matrix.quick_wins,
      ...matrix.strategic_investments,
      ...matrix.defensive_plays,
      ...matrix.exploratory,
      ...matrix.harvest_opportunities
    ];
    
    const headers = [
      'Query',
      'Market',
      'Cluster',
      'Opportunity_Type',
      'Priority',
      'Timeline',
      'Investment_Level',
      'Impact_Score',
      'Effort_Score',
      'Confidence_Score',
      'Estimated_Monthly_Value',
      'Implementation_Cost',
      'ROI_12_Month',
      'Payback_Period_Months',
      'Primary_Strategy',
      'Recommended_Actions',
      'Success_Metrics'
    ].join(',');
    
    const rows = allOpportunities.map(opp => [
      `"${opp.query}"`,
      opp.market,
      opp.cluster || '',
      opp.opportunity_type,
      opp.priority,
      opp.timeline,
      opp.investment_level,
      opp.impact_score.toFixed(2),
      opp.effort_score.toFixed(2),
      opp.confidence_score.toFixed(2),
      opp.estimated_monthly_value.toFixed(2),
      opp.estimated_implementation_cost.toFixed(2),
      opp.roi_12_month.toFixed(1),
      opp.payback_period_months.toFixed(1),
      opp.primary_strategy,
      `"${opp.recommended_actions.join('; ')}"`,
      `"${opp.success_metrics.join('; ')}"`
    ].join(','));
    
    return [headers, ...rows].join('\n');
  }
  
  /**
   * Generate strategic roadmap report
   */
  generateRoadmapReport(matrix: OpportunityMatrix, productName: string, dateStr: string): string {
    return `## Strategic Opportunity Roadmap - ${productName}

### Executive Summary
**Generated**: ${dateStr}
**Total Opportunities**: ${matrix.total_opportunities}
**Projected Annual Value**: $${matrix.total_projected_value.toLocaleString()}
**Required Investment**: $${matrix.total_investment_required.toLocaleString()}
**Expected ROI**: ${matrix.weighted_average_roi.toFixed(1)}%

### Opportunity Portfolio

#### 🚀 Quick Wins (${matrix.quick_wins.length} opportunities)
*Low effort, high impact - Execute in next 30 days*

${matrix.quick_wins.slice(0, 5).map((opp, i) => 
`${i + 1}. **"${opp.query}"** [${opp.market}]
   - Impact Score: ${opp.impact_score.toFixed(1)}/10
   - Monthly Value: $${opp.estimated_monthly_value.toFixed(0)}
   - Strategy: ${this.formatStrategy(opp.primary_strategy)}
   - Actions: ${opp.recommended_actions.slice(0, 2).join(', ')}`
).join('\n\n')}

#### 🎯 Strategic Investments (${matrix.strategic_investments.length} opportunities)
*High effort, high return - Plan for next quarter*

${matrix.strategic_investments.slice(0, 3).map((opp, i) => 
`${i + 1}. **"${opp.query}"** [${opp.market}]
   - ROI (12mo): ${opp.roi_12_month.toFixed(0)}%
   - Annual Value: $${(opp.estimated_monthly_value * 12).toFixed(0)}
   - Investment: $${opp.estimated_implementation_cost.toFixed(0)}
   - Payback: ${opp.payback_period_months.toFixed(1)} months`
).join('\n\n')}

#### 🛡️ Defensive Plays (${matrix.defensive_plays.length} opportunities)
*Protect market position - Address immediately*

${matrix.defensive_plays.slice(0, 3).map((opp, i) => 
`${i + 1}. **"${opp.query}"** [${opp.market}]
   - Priority: ${opp.priority.toUpperCase()}
   - Timeline: ${opp.timeline}
   - Threat Level: ${this.assessThreatLevel(opp)}
   - Defense Strategy: ${opp.recommended_actions[0] || 'Competitive analysis'}`
).join('\n\n')}

### Quarterly Implementation Roadmap

#### Q1 2025 - Foundation & Quick Wins
${matrix.q1_priorities.map(priority => `- ${priority}`).join('\n')}

#### Q2 2025 - Strategic Growth
${matrix.q2_priorities.map(priority => `- ${priority}`).join('\n')}

#### Q3 2025 - Market Expansion  
${matrix.q3_priorities.map(priority => `- ${priority}`).join('\n')}

#### Q4 2025 - Optimization & Scale
${matrix.q4_priorities.map(priority => `- ${priority}`).join('\n')}

### Resource Allocation Strategy

**Recommended Budget Distribution**:
- SEO Investment: ${(matrix.recommended_budget_split.seo * 100).toFixed(0)}%
- Paid Search: ${(matrix.recommended_budget_split.paid_search * 100).toFixed(0)}%
- Content Creation: ${(matrix.recommended_budget_split.content * 100).toFixed(0)}%
- Technical SEO: ${(matrix.recommended_budget_split.technical * 100).toFixed(0)}%
- Competitive Analysis: ${(matrix.recommended_budget_split.competitive_analysis * 100).toFixed(0)}%

### Success Tracking

**Key Performance Indicators**:
- Monthly organic revenue growth: Target 25%+
- Paid search efficiency improvement: Target 30%+
- Market share expansion: Track top 3 positions
- Content performance: Monitor featured snippet captures

**Review Cycles**:
- Weekly: Quick win execution progress
- Monthly: Strategic investment milestones
- Quarterly: Full roadmap review and adjustment

*Generated by SEO & Ads Expert Tool v1.2*
`;
  }
  
  // Private helper methods
  
  private normalizeSearchVolume(volume: number): number {
    // Logarithmic scaling for search volume
    if (volume <= 0) return 0;
    if (volume >= 10000) return 1;
    return Math.log10(volume + 1) / 4; // Scale 0-1
  }
  
  private normalizeSeasonality(factor: number): number {
    // Normalize seasonality factor to 0-1 scale
    return Math.min(factor / 2, 1);
  }
  
  private calculateMarketOpportunity(source: OpportunitySource): number {
    // Factor in market size, competition, and growth potential
    let score = 0.5; // Base score
    
    // Adjust for search volume
    if (source.search_volume > 5000) score += 0.2;
    if (source.search_volume > 15000) score += 0.2;
    
    // Adjust for SERP features (opportunity for featured snippets, etc.)
    if (source.serp_features.length > 0) score += 0.1;
    
    // Adjust for competitive landscape
    if (source.top_competitors.length < 5) score += 0.1; // Less competition
    if (source.top_competitors.length > 10) score -= 0.1; // High competition
    
    return Math.min(score, 1);
  }
  
  private calculateFirstPartyPerformance(source: OpportunitySource): number {
    // Score based on existing performance data
    let score = 0.5; // Default when no data
    
    if (source.click_through_rate && source.conversion_rate) {
      // High CTR and conversion rate = good performance
      const ctrScore = Math.min(source.click_through_rate / 10, 1); // Normalize to ~10% CTR
      const conversionScore = Math.min(source.conversion_rate / 5, 1); // Normalize to ~5% conversion
      score = (ctrScore + conversionScore) / 2;
    }
    
    return score;
  }
  
  private calculateEffortScore(source: OpportunitySource): number {
    // Estimate implementation effort (0 = very easy, 10 = very hard)
    let effort = 5; // Base effort
    
    // Adjust based on SERP difficulty
    effort += source.serp_difficulty * 3;
    
    // Adjust based on competition
    if (source.top_competitors.length > 8) effort += 1;
    
    // Adjust based on content gaps (more gaps = more work)
    effort += Math.min(source.content_gaps.length * 0.5, 2);
    
    // Adjust based on current position (lower position = more effort to improve)
    if (source.current_position) {
      if (source.current_position > 10) effort += 2;
      else if (source.current_position > 5) effort += 1;
    }
    
    return Math.min(Math.max(effort, 1), 10);
  }
  
  private calculateConfidenceScore(source: OpportunitySource): number {
    // Score data completeness and quality
    let confidence = source.data_source_confidence;
    
    // Bonus for having performance data
    if (source.click_through_rate && source.conversion_rate) confidence += 0.1;
    if (source.monthly_spend && source.monthly_conversions) confidence += 0.1;
    
    // Penalty for old data
    const daysSinceUpdate = (Date.now() - new Date(source.last_updated).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) confidence -= 0.1;
    if (daysSinceUpdate > 90) confidence -= 0.2;
    
    return Math.min(Math.max(confidence, 0.1), 1);
  }
  
  private calculateCompetitiveAdvantage(source: OpportunitySource): number {
    // Score our competitive position
    let advantage = 0.5; // Neutral
    
    if (source.current_position) {
      if (source.current_position <= 3) advantage = 0.8; // Strong position
      else if (source.current_position <= 10) advantage = 0.6; // Decent position
      else advantage = 0.3; // Weak position
    }
    
    // Adjust for content gaps (gaps = opportunity)
    if (source.content_gaps.length > 2) advantage += 0.1;
    
    return advantage;
  }
  
  private classifyOpportunityType(
    impact: number, 
    effort: number, 
    source: OpportunitySource
  ): OpportunityScore['opportunity_type'] {
    // Quick wins: High impact, low effort
    if (impact >= 0.7 && effort <= 4) return 'quick_win';
    
    // Strategic investments: High impact, high effort
    if (impact >= 0.6 && effort > 6) return 'strategic_investment';
    
    // Defensive plays: Medium/high impact, urgent
    if (source.urgency === 'critical' || source.urgency === 'high') {
      return 'defensive_play';
    }
    
    // Harvest: Good existing performance
    if (source.current_position && source.current_position <= 5 && impact >= 0.5) {
      return 'harvest';
    }
    
    // Everything else is exploratory
    return 'exploratory';
  }
  
  private determinePriority(
    impact: number, 
    effort: number, 
    urgency: OpportunitySource['urgency']
  ): OpportunityScore['priority'] {
    if (urgency === 'critical') return 'critical';
    if (urgency === 'high' || (impact >= 0.8 && effort <= 5)) return 'high';
    if (impact >= 0.6 || urgency === 'medium') return 'medium';
    return 'low';
  }
  
  private determineTimeline(
    type: OpportunityScore['opportunity_type'],
    effort: number,
    urgency: OpportunitySource['urgency']
  ): OpportunityScore['timeline'] {
    if (urgency === 'critical') return 'immediate';
    if (type === 'quick_win') return 'immediate';
    if (type === 'defensive_play') return 'q1';
    if (effort <= 4) return 'q1';
    if (effort <= 7) return 'q2';
    if (effort <= 9) return 'q3';
    return 'q4';
  }
  
  private determineInvestmentLevel(effort: number, volume: number): OpportunityScore['investment_level'] {
    if (effort >= 8 && volume >= this.config.investment_thresholds.enterprise_min_volume) {
      return 'enterprise';
    }
    if (effort >= 6) return 'high';
    if (effort >= 4) return 'medium';
    return 'low';
  }
  
  private estimateMonthlyValue(source: OpportunitySource, impact: number): number {
    // Base calculation on search volume and commercial intent
    let baseValue = source.search_volume * source.commercial_intent_score;
    
    // Apply impact multiplier
    baseValue *= impact;
    
    // Convert to monetary value (rough estimate)
    const avgCpcEstimate = source.cost_per_click || 2.50; // Default $2.50 CPC
    const estimatedCtr = 0.05; // 5% CTR estimate
    const estimatedConversion = 0.02; // 2% conversion estimate
    const avgOrderValue = 50; // Default $50 AOV
    
    // Monthly value = Volume × CTR × Conversion Rate × AOV × (1 - paid costs)
    const monthlyValue = baseValue * estimatedCtr * estimatedConversion * avgOrderValue * 0.7; // 70% margin
    
    return Math.max(monthlyValue, 10); // Minimum $10/month
  }
  
  private estimateImplementationCost(effort: number, type: OpportunityScore['opportunity_type']): number {
    // Base hourly rate for implementation
    const hourlyRate = 150; // $150/hour blended rate
    
    // Effort to hours mapping
    const hoursRequired = effort * 10; // 10 hours per effort point
    
    // Type multipliers
    const typeMultipliers = {
      quick_win: 0.5,
      harvest: 0.7,
      exploratory: 0.8,
      defensive_play: 1.0,
      strategic_investment: 1.5
    };
    
    return hoursRequired * hourlyRate * typeMultipliers[type];
  }
  
  private calculateROI(monthlyValue: number, implementationCost: number): number {
    if (implementationCost <= 0) return 1000; // Very high ROI for free opportunities
    const annualValue = monthlyValue * 12;
    return ((annualValue - implementationCost) / implementationCost) * 100;
  }
  
  private calculatePaybackPeriod(monthlyValue: number, implementationCost: number): number {
    if (monthlyValue <= 0) return 999; // Never pays back
    return implementationCost / monthlyValue;
  }
  
  private determinePrimaryStrategy(
    source: OpportunitySource, 
    type: OpportunityScore['opportunity_type']
  ): OpportunityScore['primary_strategy'] {
    // Base on current position and opportunity type
    if (source.current_position && source.current_position <= 10) {
      return 'seo_and_paid'; // Already ranking, optimize both
    }
    
    if (type === 'quick_win' && source.commercial_intent_score >= 0.8) {
      return 'paid_only'; // Quick paid wins for high-intent terms
    }
    
    if (source.serp_difficulty < 0.5) {
      return 'seo_only'; // Easy to rank organically
    }
    
    if (type === 'defensive_play') {
      return 'competitive_analysis'; // Need to understand competition first
    }
    
    return 'content_first'; // Default: create great content first
  }
  
  private generateRecommendedActions(
    source: OpportunitySource,
    type: OpportunityScore['opportunity_type'],
    strategy: OpportunityScore['primary_strategy']
  ): string[] {
    const actions: string[] = [];
    
    // Base actions by strategy
    switch (strategy) {
      case 'seo_only':
        actions.push('Create SEO-optimized landing page');
        actions.push('Build high-quality backlinks');
        actions.push('Optimize for featured snippets');
        break;
        
      case 'paid_only':
        actions.push('Launch targeted ad campaigns');
        actions.push('Optimize ad copy for conversions');
        actions.push('A/B test landing pages');
        break;
        
      case 'seo_and_paid':
        actions.push('Coordinate SEO and PPC keywords');
        actions.push('Share conversion data between channels');
        actions.push('Create unified landing page experience');
        break;
        
      case 'content_first':
        actions.push('Research user intent and pain points');
        actions.push('Create comprehensive content hub');
        actions.push('Optimize content for search and conversion');
        break;
        
      case 'competitive_analysis':
        actions.push('Analyze top competitor strategies');
        actions.push('Identify content and keyword gaps');
        actions.push('Develop differentiation strategy');
        break;
    }
    
    // Add type-specific actions
    if (type === 'quick_win') {
      actions.push('Execute within 30 days');
      actions.push('Focus on high-conversion pages');
    }
    
    if (type === 'defensive_play') {
      actions.push('Monitor competitor movements');
      actions.push('Increase bid adjustments if needed');
    }
    
    // Add source-specific actions
    if (source.content_gaps.length > 0) {
      actions.push(`Address content gaps: ${source.content_gaps.slice(0, 2).join(', ')}`);
    }
    
    if (source.serp_features.includes('featured_snippets')) {
      actions.push('Optimize for featured snippet capture');
    }
    
    return actions.slice(0, 5); // Limit to top 5 actions
  }
  
  private defineSuccessMetrics(
    source: OpportunitySource,
    type: OpportunityScore['opportunity_type']
  ): string[] {
    const metrics: string[] = [];
    
    // Base metrics for all opportunities
    metrics.push('Organic traffic increase');
    metrics.push('Conversion rate improvement');
    
    // Type-specific metrics
    switch (type) {
      case 'quick_win':
        metrics.push('30-day ROI achievement');
        metrics.push('Time to first conversion');
        break;
        
      case 'strategic_investment':
        metrics.push('12-month revenue impact');
        metrics.push('Market share growth');
        break;
        
      case 'defensive_play':
        metrics.push('Position maintenance in top 5');
        metrics.push('Competitor gap analysis');
        break;
        
      case 'harvest':
        metrics.push('Revenue per visitor increase');
        metrics.push('Lifetime customer value');
        break;
        
      case 'exploratory':
        metrics.push('Learning validation milestones');
        metrics.push('User engagement metrics');
        break;
    }
    
    // Current position specific metrics
    if (source.current_position) {
      if (source.current_position > 10) {
        metrics.push('Enter top 10 search results');
      } else if (source.current_position > 3) {
        metrics.push('Achieve top 3 ranking');
      } else {
        metrics.push('Maintain top 3 position');
      }
    }
    
    return metrics.slice(0, 4); // Limit to top 4 metrics
  }
  
  private generateQuarterlyRoadmap(opportunities: OpportunityScore[]): {
    q1: string[], q2: string[], q3: string[], q4: string[]
  } {
    const roadmap = { q1: [] as string[], q2: [] as string[], q3: [] as string[], q4: [] as string[] };
    
    opportunities.forEach(opp => {
      const item = `${opp.opportunity_type}: "${opp.query}" (${opp.impact_score.toFixed(1)} impact)`;
      
      switch (opp.timeline) {
        case 'immediate':
        case 'q1':
          roadmap.q1.push(item);
          break;
        case 'q2':
          roadmap.q2.push(item);
          break;
        case 'q3':
          roadmap.q3.push(item);
          break;
        case 'q4':
        case 'long_term':
          roadmap.q4.push(item);
          break;
      }
    });
    
    // Sort by priority within each quarter
    const sortByPriority = (items: string[]) => 
      items.sort((a, b) => {
        const priorityA = a.includes('quick_win') ? 4 : a.includes('defensive_play') ? 3 : 
                        a.includes('strategic_investment') ? 2 : 1;
        const priorityB = b.includes('quick_win') ? 4 : b.includes('defensive_play') ? 3 : 
                        b.includes('strategic_investment') ? 2 : 1;
        return priorityB - priorityA;
      });
    
    roadmap.q1 = sortByPriority(roadmap.q1).slice(0, 10);
    roadmap.q2 = sortByPriority(roadmap.q2).slice(0, 10);
    roadmap.q3 = sortByPriority(roadmap.q3).slice(0, 10);
    roadmap.q4 = sortByPriority(roadmap.q4).slice(0, 10);
    
    return roadmap;
  }
  
  private calculateBudgetAllocation(opportunities: OpportunityScore[]): OpportunityMatrix['recommended_budget_split'] {
    // Calculate budget allocation based on opportunity mix
    let seo = 0, paidSearch = 0, content = 0, technical = 0, competitive = 0;
    const total = opportunities.length;
    
    if (total === 0) {
      return { seo: 0.3, paid_search: 0.3, content: 0.25, technical: 0.1, competitive_analysis: 0.05 };
    }
    
    opportunities.forEach(opp => {
      switch (opp.primary_strategy) {
        case 'seo_only':
          seo += 0.6;
          content += 0.3;
          technical += 0.1;
          break;
        case 'paid_only':
          paidSearch += 0.8;
          content += 0.2;
          break;
        case 'seo_and_paid':
          seo += 0.4;
          paidSearch += 0.4;
          content += 0.2;
          break;
        case 'content_first':
          content += 0.6;
          seo += 0.3;
          technical += 0.1;
          break;
        case 'competitive_analysis':
          competitive += 0.5;
          seo += 0.3;
          content += 0.2;
          break;
      }
    });
    
    // Normalize to percentages
    const sum = seo + paidSearch + content + technical + competitive;
    return {
      seo: seo / sum,
      paid_search: paidSearch / sum,
      content: content / sum,
      technical: technical / sum,
      competitive_analysis: competitive / sum
    };
  }
  
  private getUrgencyWeight(priority: OpportunityScore['priority']): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 1;
    }
  }
  
  private formatStrategy(strategy: OpportunityScore['primary_strategy']): string {
    const strategyMap = {
      'seo_only': 'SEO Focus',
      'paid_only': 'Paid Search',
      'seo_and_paid': 'SEO + Paid',
      'content_first': 'Content Marketing',
      'competitive_analysis': 'Competitive Intel'
    };
    return strategyMap[strategy] || strategy;
  }
  
  private assessThreatLevel(opp: OpportunityScore): string {
    if (opp.priority === 'critical') return 'Critical';
    if (opp.effort_score >= 7) return 'High';
    if (opp.effort_score >= 5) return 'Medium';
    return 'Low';
  }
}

export default OpportunityAnalyzer;