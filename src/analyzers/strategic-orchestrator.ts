import { SearchTermsAnalyzer } from './search-terms';
import { PaidOrganicAnalyzer } from './paid-organic';
import { SerpDriftAnalyzer } from './serp-drift';
import { SerpWatchMonitor } from '../monitors/serp-watch';
import { OpportunityAnalyzer, type OpportunitySource, type OpportunityMatrix } from './opportunity';
import { ContentCalendarGenerator, type ContentCalendar } from '../generators/content-calendar';
import { InternalLinkingEngine, type InternalLinkingStrategy } from '../generators/internal-links';
import { AdVariantsGenerator, type AdVariantsStrategy } from '../generators/ad-variants';
import { CompetitiveIntelligenceScanner, type CompetitiveIntelligence } from './competitive-intelligence';
import { PerformanceMonitor, type PerformanceMetrics } from '../monitors/performance';
import { z } from 'zod';

// Strategic Orchestrator - Integrates all analyzers into unified opportunity matrix
// Combines search terms waste, paid/organic gaps, SERP monitoring, and opportunity scoring

export const StrategicConfigSchema = z.object({
  product_name: z.string().default('Unknown Product'),
  date_range: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }),
  data_sources: z.object({
    search_terms_csv: z.string().optional(),
    paid_organic_csv: z.string().optional(),
    serp_monitoring_enabled: z.boolean().default(false),
    first_party_performance: z.boolean().default(false)
  }),
  analysis_config: z.object({
    waste_threshold: z.number().default(100), // $100 monthly waste threshold
    gap_analysis_enabled: z.boolean().default(true),
    serp_volatility_threshold: z.number().default(0.3),
    opportunity_confidence_min: z.number().default(0.6)
  }),
  business_context: z.object({
    industry: z.string().default('Technology'),
    target_markets: z.array(z.string()).default(['US']),
    business_model: z.enum(['saas', 'ecommerce', 'lead_generation', 'content']).default('saas'),
    growth_stage: z.enum(['startup', 'growth', 'mature', 'enterprise']).default('growth')
  })
});

export type StrategicConfig = z.infer<typeof StrategicConfigSchema>;

export const UnifiedOpportunitySchema = z.object({
  source_type: z.enum(['waste_reduction', 'gap_capture', 'serp_volatility', 'cross_channel']),
  opportunity_id: z.string(),
  query: z.string(),
  market: z.string(),
  
  // Source-specific context
  waste_context: z.object({
    monthly_waste: z.number(),
    conversion_rate: z.number(),
    suggested_negatives: z.array(z.string())
  }).optional(),
  
  gap_context: z.object({
    gap_type: z.enum(['protect_winner', 'harvest_opportunity', 'double_down', 'optimization']),
    organic_position: z.number().optional(),
    paid_performance: z.object({
      clicks: z.number(),
      cost: z.number(),
      conversions: z.number()
    }).optional()
  }).optional(),
  
  serp_context: z.object({
    volatility_score: z.number(),
    opportunity_type: z.string(),
    competitor_movements: z.number(),
    new_features: z.array(z.string())
  }).optional(),
  
  // Unified scoring
  confidence_score: z.number().min(0).max(1),
  impact_potential: z.number().min(0).max(10),
  implementation_effort: z.number().min(1).max(10),
  
  // Meta information
  data_freshness: z.number(), // Days since last update
  cross_analyzer_correlation: z.number().min(0).max(1) // How well sources agree
});

export type UnifiedOpportunity = z.infer<typeof UnifiedOpportunitySchema>;

export const StrategicIntelligenceSchema = z.object({
  executive_summary: z.object({
    total_opportunities: z.number(),
    projected_annual_savings: z.number(),
    projected_annual_growth: z.number(),
    implementation_investment: z.number(),
    net_roi_12_months: z.number(),
    confidence_level: z.enum(['high', 'medium', 'low'])
  }),
  
  priority_matrix: z.object({
    immediate_actions: z.array(UnifiedOpportunitySchema), // Do now
    quarter_1_roadmap: z.array(UnifiedOpportunitySchema), // Next 90 days
    quarter_2_roadmap: z.array(UnifiedOpportunitySchema), // 90-180 days
    long_term_strategic: z.array(UnifiedOpportunitySchema) // 180+ days
  }),
  
  cross_channel_insights: z.object({
    search_terms_waste_total: z.number(),
    gap_opportunities_count: z.number(),
    serp_volatility_alerts: z.number(),
    channel_efficiency_score: z.number().min(0).max(100)
  }),
  
  resource_allocation: z.object({
    immediate_budget_needed: z.number(),
    quarterly_budget_plan: z.array(z.number()), // 4 quarters
    headcount_requirements: z.object({
      seo_specialist_months: z.number(),
      paid_search_specialist_months: z.number(),
      content_creator_months: z.number(),
      developer_months: z.number()
    })
  }),
  
  risk_assessment: z.object({
    data_quality_risks: z.array(z.string()),
    competitive_threats: z.array(z.string()),
    seasonal_considerations: z.array(z.string()),
    implementation_risks: z.array(z.string())
  }),
  
  success_metrics: z.object({
    monthly_tracking_kpis: z.array(z.string()),
    milestone_targets: z.record(z.string(), z.number()), // Target values by metric
    review_schedule: z.object({
      weekly_reviews: z.array(z.string()),
      monthly_deep_dives: z.array(z.string()),
      quarterly_strategy_updates: z.array(z.string())
    })
  }),
  
  content_strategy: z.object({
    calendar_summary: z.object({
      total_pieces: z.number(),
      weeks_covered: z.number(),
      average_opportunity_score: z.number(),
      resource_distribution: z.object({
        light: z.number(),
        medium: z.number(),
        heavy: z.number()
      })
    }),
    linking_strategy: z.object({
      total_opportunities: z.number(),
      high_priority_links: z.number(),
      estimated_seo_value: z.number(),
      policy_compliant_percentage: z.number()
    }),
    implementation_roadmap: z.object({
      phase_one_content: z.number(),
      phase_two_content: z.number(),
      phase_three_content: z.number(),
      total_estimated_hours: z.number()
    })
  }).optional(),
  
  ad_variants_strategy: z.object({
    total_variants: z.number(),
    total_tests: z.number(),
    testing_priorities: z.array(z.string()),
    expected_improvement: z.object({
      ctr_lift: z.number(),
      conversion_lift: z.number(),
      cost_efficiency: z.number()
    }),
    implementation: z.object({
      rollout_phases: z.array(z.object({
        phase: z.string(),
        variants: z.array(z.string()),
        budget_allocation: z.number(),
        timeline: z.string()
      })),
      success_criteria: z.array(z.string())
    })
  }).optional(),
  
  competitive_intelligence: z.object({
    competitors_tracked: z.number(),
    keyword_gaps_found: z.number(),
    content_gaps_found: z.number(),
    biggest_threats: z.array(z.string()),
    biggest_opportunities: z.array(z.string()),
    recommended_focus_areas: z.array(z.string()),
    success_probability: z.number(),
    immediate_actions: z.array(z.object({
      action: z.string(),
      impact: z.string(),
      timeline: z.string()
    }))
  }).optional(),
  
  performance_metrics: z.object({
    session_id: z.string(),
    runtime_ms: z.number(),
    memory_peak_mb: z.number(),
    cache_hit_rate: z.number(),
    performance_score: z.number(),
    alerts_count: z.number(),
    budget_violations: z.array(z.string()),
    recommendations_count: z.number(),
    cold_start: z.boolean()
  }).optional()
});

export type StrategicIntelligence = z.infer<typeof StrategicIntelligenceSchema>;

export class StrategicOrchestrator {
  private searchTermsAnalyzer: SearchTermsAnalyzer;
  private paidOrganicAnalyzer: PaidOrganicAnalyzer;
  private serpDriftAnalyzer: SerpDriftAnalyzer;
  private serpMonitor: SerpWatchMonitor;
  private opportunityAnalyzer: OpportunityAnalyzer;
  private contentCalendarGenerator: ContentCalendarGenerator;
  private internalLinkingEngine: InternalLinkingEngine;
  private adVariantsGenerator: AdVariantsGenerator;
  private competitiveScanner: CompetitiveIntelligenceScanner;
  private performanceMonitor: PerformanceMonitor;
  
  constructor(private config: StrategicConfig) {
    // Initialize all analyzers with configuration
    this.searchTermsAnalyzer = new SearchTermsAnalyzer({
      minCostThreshold: config.analysis_config.waste_threshold,
      minImpressionsThreshold: 1000,
      lowCtrThreshold: 0.005,
      confidenceThreshold: 0.8
    });
    
    this.paidOrganicAnalyzer = new PaidOrganicAnalyzer({
      organicTopPositionThreshold: 3,
      highPaidSpendThreshold: 50,
      goodCtrThreshold: 2.0,
      minImpressionsThreshold: 100
    });
    
    this.serpDriftAnalyzer = new SerpDriftAnalyzer({
      alertThresholds: {
        volatility: config.analysis_config.serp_volatility_threshold,
        competitorMovement: 3,
        featureChanges: 2
      }
    });
    
    this.serpMonitor = new SerpWatchMonitor({
      enabledFeatures: ['ads', 'organic', 'featured_snippets', 'knowledge_panel', 'shopping'],
      markets: config.business_context.target_markets
    });
    
    this.opportunityAnalyzer = new OpportunityAnalyzer({
      weights: {
        search_volume: 0.25,
        commercial_intent: 0.20,
        serp_difficulty: 0.15,
        data_quality: 0.15,
        market_size: 0.15,
        seasonality: 0.05,
        first_party_performance: 0.05
      },
      business_priorities: this.mapGrowthStageToBusinessPriorities(config.business_context.growth_stage)
    });
    
    // Initialize content strategy generators
    this.contentCalendarGenerator = new ContentCalendarGenerator({
      startDate: new Date(),
      weeks: 12, // Q1 planning horizon
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
    
    this.internalLinkingEngine = new InternalLinkingEngine({
      maxLinksPerPage: 5,
      minRelevanceThreshold: 0.6,
      anchorTextVariation: 0.7,
      competitorMentionPolicy: 'strict',
      authorityBoostThreshold: 0.8,
      productFocusWeight: 1.5
    });
    
    // Initialize ad variants generator  
    this.adVariantsGenerator = new AdVariantsGenerator(config.product_name || 'convert-my-file');
    
    // Initialize competitive intelligence scanner
    this.competitiveScanner = new CompetitiveIntelligenceScanner(
      config.product_name || 'convert-my-file',
      'littlebearapps.com'
    );
    
    // Initialize performance monitor
    this.performanceMonitor = new PerformanceMonitor({
      budget: {
        cold_run_max_ms: 120000, // 2 minutes
        warm_run_max_ms: 60000,  // 1 minute
        url_health_check_max_ms: 30000, // 30 seconds
        api_call_timeout_ms: 10000,
        memory_usage_max_mb: 512,
        cache_hit_rate_min: 0.5,
        error_rate_max: 0.05
      },
      metricsOutputPath: 'cache/strategic-intelligence-performance.json',
      enableAlerts: true,
      enableRecommendations: true,
      circuitBreakerConfig: {
        failureThreshold: 3,
        timeoutMs: 30000,
        resetTimeoutMs: 60000
      }
    });
  }
  
  /**
   * Generate comprehensive strategic intelligence by orchestrating all analyzers
   */
  async generateStrategicIntelligence(): Promise<StrategicIntelligence> {
    console.log('🧠 Generating strategic intelligence...');
    console.log(`📊 Product: ${this.config.product_name}`);
    
    // Start performance monitoring
    this.performanceMonitor.startPhase('data_collection');
    
    // Collect data from all analyzers with circuit breaker protection
    const unifiedOpportunities = await this.performanceMonitor.executeWithCircuitBreaker(
      'data_collection',
      () => this.collectUnifiedOpportunities(),
      async () => {
        console.warn('⚠️ Data collection circuit breaker triggered, using fallback');
        return []; // Fallback to empty opportunities
      }
    );
    
    this.performanceMonitor.endPhase('data_collection');
    this.performanceMonitor.startPhase('analysis');
    
    // Generate opportunity matrix
    const opportunitySources = this.convertToOpportunitySources(unifiedOpportunities);
    const opportunityMatrix = this.opportunityAnalyzer.generateOpportunityMatrix(opportunitySources);
    
    this.performanceMonitor.endPhase('analysis');
    this.performanceMonitor.startPhase('generation');
    
    // Create strategic intelligence
    const intelligence = await this.synthesizeIntelligenceWithPerformanceTracking(unifiedOpportunities, opportunityMatrix);
    
    this.performanceMonitor.endPhase('generation');
    this.performanceMonitor.startPhase('export');
    
    // Save performance metrics
    await this.performanceMonitor.saveMetrics();
    
    this.performanceMonitor.endPhase('export');
    
    // Check performance budgets
    const budgetCheck = this.performanceMonitor.checkBudgets();
    if (!budgetCheck.passed) {
      console.warn('⚠️ Performance budget violations:', budgetCheck.violations);
    }
    
    console.log(`✅ Strategic analysis complete: ${intelligence.executive_summary.total_opportunities} opportunities identified`);
    
    return intelligence;
  }
  
  /**
   * Export strategic plan to multiple formats
   */
  async exportStrategicPlan(intelligence: StrategicIntelligence, outputDir: string): Promise<{
    csvPath: string,
    jsonPath: string,
    reportPath: string
  }> {
    const fs = await import('fs');
    const path = await import('path');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    const baseFilename = `strategic_intelligence_${this.config.product_name.toLowerCase().replace(/\s+/g, '_')}_${dateStr}`;
    
    // Export CSV matrix
    const csvContent = this.generateOpportunityCSV(intelligence);
    const csvPath = path.join(outputDir, `${baseFilename}.csv`);
    fs.writeFileSync(csvPath, csvContent);
    
    // Export JSON data
    const jsonPath = path.join(outputDir, `${baseFilename}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(intelligence, null, 2));
    
    // Export strategic report
    const reportContent = this.generateStrategicReport(intelligence, dateStr);
    const reportPath = path.join(outputDir, `${baseFilename}_report.md`);
    fs.writeFileSync(reportPath, reportContent);
    
    return { csvPath, jsonPath, reportPath };
  }
  
  // Private implementation methods
  
  private async collectUnifiedOpportunities(): Promise<UnifiedOpportunity[]> {
    const opportunities: UnifiedOpportunity[] = [];
    
    // Collect search terms waste opportunities
    if (this.config.data_sources.search_terms_csv) {
      const wasteOpportunities = await this.collectSearchTermsOpportunities();
      opportunities.push(...wasteOpportunities);
    }
    
    // Collect paid/organic gap opportunities
    if (this.config.data_sources.paid_organic_csv) {
      const gapOpportunities = await this.collectPaidOrganicOpportunities();
      opportunities.push(...gapOpportunities);
    }
    
    // Collect SERP volatility opportunities
    if (this.config.data_sources.serp_monitoring_enabled) {
      const serpOpportunities = await this.collectSerpOpportunities();
      opportunities.push(...serpOpportunities);
    }
    
    // Identify cross-channel opportunities
    const crossChannelOpportunities = this.identifyCrossChannelOpportunities(opportunities);
    opportunities.push(...crossChannelOpportunities);
    
    console.log(`📈 Collected ${opportunities.length} unified opportunities`);
    
    return opportunities;
  }
  
  private async collectSearchTermsOpportunities(): Promise<UnifiedOpportunity[]> {
    if (!this.config.data_sources.search_terms_csv) return [];
    
    try {
      const searchTerms = await this.searchTermsAnalyzer.parseSearchTermsReport(this.config.data_sources.search_terms_csv);
      const wasteAnalysis = this.searchTermsAnalyzer.analyzeWaste(searchTerms);
      
      return wasteAnalysis.wasteTerms.map((term, index) => ({
        source_type: 'waste_reduction' as const,
        opportunity_id: `waste_${index}`,
        query: term.searchTerm,
        market: 'US', // Default for search terms data
        
        waste_context: {
          monthly_waste: term.wastePotential,
          conversion_rate: term.conversionRate,
          suggested_negatives: wasteAnalysis.suggestedNegatives.filter(neg => 
            neg.pattern && term.searchTerm.toLowerCase().includes(neg.pattern.toLowerCase())
          ).map(neg => neg.pattern).slice(0, 3)
        },
        
        confidence_score: Math.min(term.confidence / 100, 1),
        impact_potential: Math.min((term.wastePotential / 50) * 10, 10), // Scale waste to 0-10
        implementation_effort: term.suggestedNegatives?.length > 0 ? 2 : 3, // Low effort for negatives
        
        data_freshness: 1, // Search terms are usually daily
        cross_analyzer_correlation: 0.8 // Search terms data is generally reliable
      }));
    } catch (error) {
      console.warn('⚠️ Failed to collect search terms opportunities:', error);
      return [];
    }
  }
  
  private async collectPaidOrganicOpportunities(): Promise<UnifiedOpportunity[]> {
    if (!this.config.data_sources.paid_organic_csv) return [];
    
    try {
      const paidOrganicData = await this.paidOrganicAnalyzer.parsePaidOrganicReport(this.config.data_sources.paid_organic_csv);
      const gapAnalysis = this.paidOrganicAnalyzer.analyzeGaps(paidOrganicData);
      
      const opportunities: UnifiedOpportunity[] = [];
      
      // Protect winners
      gapAnalysis.protectWinners.forEach((winner, index) => {
        opportunities.push({
          source_type: 'gap_capture',
          opportunity_id: `protect_${index}`,
          query: winner.query,
          market: 'US',
          
          gap_context: {
            gap_type: 'protect_winner',
            organic_position: winner.organicPosition,
            paid_performance: {
              clicks: winner.paidClicks || 0,
              cost: winner.paidSpend,
              conversions: winner.paidConversions || 0
            }
          },
          
          confidence_score: winner.confidence,
          impact_potential: Math.min((winner.potentialSavings / 100) * 10, 10),
          implementation_effort: 3, // Medium effort - bid adjustments
          
          data_freshness: 7, // Paid & organic reports usually weekly
          cross_analyzer_correlation: 0.9 // High correlation when we have both channels
        });
      });
      
      // Harvest opportunities
      gapAnalysis.harvestOpportunities.forEach((harvest, index) => {
        opportunities.push({
          source_type: 'gap_capture',
          opportunity_id: `harvest_${index}`,
          query: harvest.query,
          market: 'US',
          
          gap_context: {
            gap_type: 'harvest_opportunity',
            organic_position: harvest.organicPotential?.currentPosition,
            paid_performance: {
              clicks: harvest.paidPerformance?.clicks || 0,
              cost: harvest.paidPerformance?.cost || 0,
              conversions: harvest.paidPerformance?.conversions || 0
            }
          },
          
          confidence_score: harvest.confidence,
          impact_potential: Math.min((harvest.organicPotential?.estimatedValue || 0) / 1000 * 10, 10),
          implementation_effort: harvest.priority === 'HIGH' ? 6 : 4, // SEO content creation
          
          data_freshness: 7,
          cross_analyzer_correlation: 0.85
        });
      });
      
      return opportunities;
    } catch (error) {
      console.warn('⚠️ Failed to collect paid/organic opportunities:', error);
      return [];
    }
  }
  
  private async collectSerpOpportunities(): Promise<UnifiedOpportunity[]> {
    if (!this.config.data_sources.serp_monitoring_enabled) return [];
    
    try {
      // Get recent SERP volatility analysis (last 7 days)
      const serpAnalysis = await this.serpDriftAnalyzer.analyzeDriftPatterns(7);
      const opportunities: UnifiedOpportunity[] = [];
      
      serpAnalysis.responses?.forEach((response, index) => {
        opportunities.push({
          source_type: 'serp_volatility',
          opportunity_id: `serp_${index}`,
          query: response.change.query,
          market: response.change.market || 'US',
          
          serp_context: {
            volatility_score: response.change.volatility.overall,
            opportunity_type: response.type,
            competitor_movements: response.change.competitorMovements?.length || 0,
            new_features: response.change.newFeatures || []
          },
          
          confidence_score: response.confidence,
          impact_potential: response.confidence * 8, // Scale confidence to impact
          implementation_effort: this.mapSerpUrgencyToEffort(response.urgency),
          
          data_freshness: 1, // SERP data is real-time
          cross_analyzer_correlation: 0.7 // SERP data can be noisy
        });
      });
      
      return opportunities;
    } catch (error) {
      console.warn('⚠️ Failed to collect SERP opportunities:', error);
      return [];
    }
  }
  
  private identifyCrossChannelOpportunities(opportunities: UnifiedOpportunity[]): UnifiedOpportunity[] {
    const crossChannelOpps: UnifiedOpportunity[] = [];
    
    // Group opportunities by query
    const queryGroups = opportunities.reduce((groups, opp) => {
      const key = `${opp.query}_${opp.market}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(opp);
      return groups;
    }, {} as Record<string, UnifiedOpportunity[]>);
    
    // Find queries with multiple source types (cross-channel opportunities)
    Object.entries(queryGroups).forEach(([queryKey, opps]) => {
      if (opps.length > 1) {
        const sourceTypes = new Set(opps.map(o => o.source_type));
        
        // High-value cross-channel opportunity
        if (sourceTypes.size >= 2) {
          const [query, market] = queryKey.split('_');
          const avgImpact = opps.reduce((sum, o) => sum + o.impact_potential, 0) / opps.length;
          const avgConfidence = opps.reduce((sum, o) => sum + o.confidence_score, 0) / opps.length;
          
          crossChannelOpps.push({
            source_type: 'cross_channel',
            opportunity_id: `cross_${query.substring(0, 10)}_${Date.now()}`,
            query,
            market,
            
            confidence_score: avgConfidence * 1.2, // Boost confidence for cross-channel validation
            impact_potential: Math.min(avgImpact * 1.5, 10), // Boost impact for synergy
            implementation_effort: Math.max(...opps.map(o => o.implementation_effort)),
            
            data_freshness: Math.min(...opps.map(o => o.data_freshness)),
            cross_analyzer_correlation: 0.95 // Very high correlation when multiple sources agree
          });
        }
      }
    });
    
    return crossChannelOpps;
  }
  
  private convertToOpportunitySources(unifiedOpps: UnifiedOpportunity[]): OpportunitySource[] {
    return unifiedOpps.map(opp => ({
      type: 'manual' as const,
      query: opp.query,
      market: opp.market,
      serp_features: [],
      top_competitors: [],
      content_gaps: [],
      
      search_volume: this.estimateSearchVolume(opp),
      commercial_intent_score: this.estimateCommercialIntent(opp),
      serp_difficulty: this.estimateSerpDifficulty(opp),
      
      current_position: this.extractCurrentPosition(opp),
      cost_per_click: this.extractCPC(opp),
      monthly_spend: this.extractMonthlySpend(opp),
      
      seasonality_factor: 1.0, // Default
      urgency: this.mapImpactToUrgency(opp.impact_potential),
      data_source_confidence: opp.confidence_score,
      last_updated: new Date().toISOString()
    }));
  }
  
  private async synthesizeIntelligence(
    opportunities: UnifiedOpportunity[], 
    matrix: OpportunityMatrix
  ): Promise<StrategicIntelligence> {
    // Calculate executive summary
    const totalOpportunities = opportunities.length;
    const wasteOpps = opportunities.filter(o => o.source_type === 'waste_reduction');
    const annualSavings = wasteOpps.reduce((sum, o) => 
      sum + (o.waste_context?.monthly_waste || 0) * 12, 0);
    
    const gapOpps = opportunities.filter(o => o.source_type === 'gap_capture');
    const annualGrowth = gapOpps.reduce((sum, o) => 
      sum + (o.gap_context?.paid_performance?.cost || 0) * 12 * 0.3, 0); // 30% growth estimate
    
    const implementationInvestment = matrix.total_investment_required;
    const netROI = matrix.weighted_average_roi;
    
    // Determine confidence level
    const avgConfidence = opportunities.length > 0 
      ? opportunities.reduce((sum, o) => sum + o.confidence_score, 0) / opportunities.length 
      : 0;
    const confidenceLevel = avgConfidence >= 0.8 ? 'high' : avgConfidence >= 0.6 ? 'medium' : 'low';
    
    // Create priority matrix
    const highImpactOpps = opportunities.filter(o => o.impact_potential >= 7);
    const mediumImpactOpps = opportunities.filter(o => o.impact_potential >= 4 && o.impact_potential < 7);
    const quickWins = opportunities.filter(o => o.impact_potential >= 6 && o.implementation_effort <= 4);
    
    const priorityMatrix = {
      immediate_actions: quickWins.slice(0, 5),
      quarter_1_roadmap: highImpactOpps.slice(0, 10),
      quarter_2_roadmap: mediumImpactOpps.slice(0, 8),
      long_term_strategic: opportunities.filter(o => o.implementation_effort >= 7).slice(0, 5)
    };
    
    // Cross-channel insights
    const crossChannelInsights = {
      search_terms_waste_total: annualSavings,
      gap_opportunities_count: gapOpps.length,
      serp_volatility_alerts: opportunities.filter(o => o.source_type === 'serp_volatility').length,
      channel_efficiency_score: Math.min((netROI / 100) * 100, 100)
    };
    
    // Resource allocation
    const immediateActionsInvestment = priorityMatrix.immediate_actions
      .reduce((sum, o) => sum + (o.implementation_effort * 150), 0); // $150/effort point
    
    const resourceAllocation = {
      immediate_budget_needed: immediateActionsInvestment,
      quarterly_budget_plan: [
        immediateActionsInvestment,
        implementationInvestment * 0.4,
        implementationInvestment * 0.3,
        implementationInvestment * 0.3
      ],
      headcount_requirements: this.calculateHeadcountRequirements(opportunities)
    };
    
    // Risk assessment
    const riskAssessment = this.generateRiskAssessment(opportunities, avgConfidence);
    
    // Success metrics
    const successMetrics = this.defineSuccessMetrics(opportunities);
    
    // Create intelligence object first (without content strategy)
    const baseIntelligence: StrategicIntelligence = {
      executive_summary: {
        total_opportunities: totalOpportunities,
        projected_annual_savings: annualSavings,
        projected_annual_growth: annualGrowth,
        implementation_investment: implementationInvestment,
        net_roi_12_months: netROI,
        confidence_level: confidenceLevel
      },
      priority_matrix: priorityMatrix,
      cross_channel_insights: crossChannelInsights,
      resource_allocation: resourceAllocation,
      risk_assessment: riskAssessment,
      success_metrics: successMetrics
    };
    
    // Generate content strategy using base intelligence
    const contentStrategy = await this.generateContentStrategy(baseIntelligence);
    
    // Generate ad variants strategy using base intelligence
    const adVariantsStrategy = await this.generateAdVariantsStrategy(baseIntelligence);
    
    // Generate competitive intelligence using base intelligence
    const competitiveIntelligence = await this.generateCompetitiveIntelligence(baseIntelligence);
    
    return {
      ...baseIntelligence,
      content_strategy: contentStrategy,
      ad_variants_strategy: adVariantsStrategy,
      competitive_intelligence: competitiveIntelligence
    };
  }
  
  private async synthesizeIntelligenceWithPerformanceTracking(
    opportunities: UnifiedOpportunity[], 
    matrix: OpportunityMatrix
  ): Promise<StrategicIntelligence> {
    // Call original synthesis method
    const intelligence = await this.synthesizeIntelligence(opportunities, matrix);
    
    // Generate performance metrics
    const performanceMetrics = this.performanceMonitor.generateMetrics();
    
    // Add performance metrics to intelligence
    return {
      ...intelligence,
      performance_metrics: {
        session_id: performanceMetrics.session_id,
        runtime_ms: performanceMetrics.runtime.total_ms,
        memory_peak_mb: performanceMetrics.runtime.memory_peak_mb,
        cache_hit_rate: performanceMetrics.cache.hit_rate,
        performance_score: performanceMetrics.performance_score,
        alerts_count: performanceMetrics.alerts.length,
        budget_violations: this.performanceMonitor.checkBudgets().violations,
        recommendations_count: performanceMetrics.recommendations.length,
        cold_start: performanceMetrics.runtime.cold_start
      }
    };
  }
  
  // Helper methods
  
  private async generateContentStrategy(intelligence: StrategicIntelligence) {
    try {
      // Generate content calendar based on opportunities
      const contentCalendar = await this.contentCalendarGenerator.generateCalendar(intelligence);
      
      // Generate internal linking strategy
      const linkingStrategy = await this.internalLinkingEngine.generateLinkingStrategy(intelligence, contentCalendar);
      
      // Calculate implementation roadmap
      const implementationRoadmap = this.calculateContentImplementationRoadmap(contentCalendar, linkingStrategy);
      
      return {
        calendar_summary: {
          total_pieces: contentCalendar.metadata.totalPieces,
          weeks_covered: contentCalendar.metadata.period.weeks,
          average_opportunity_score: contentCalendar.metadata.averageScore,
          resource_distribution: contentCalendar.metadata.resourceDistribution
        },
        linking_strategy: {
          total_opportunities: linkingStrategy.metadata.totalOpportunities,
          high_priority_links: linkingStrategy.metadata.highPriorityCount,
          estimated_seo_value: linkingStrategy.metadata.estimatedTotalValue,
          policy_compliant_percentage: Math.round(
            ((linkingStrategy.metadata.totalOpportunities - linkingStrategy.metadata.policyViolations) / 
             linkingStrategy.metadata.totalOpportunities) * 100
          )
        },
        implementation_roadmap: implementationRoadmap
      };
    } catch (error) {
      console.warn('Content strategy generation failed, skipping:', error);
      return undefined;
    }
  }
  
  private async generateAdVariantsStrategy(intelligence: StrategicIntelligence) {
    try {
      // Generate ad variants strategy based on opportunities
      const adVariantsStrategy = await this.adVariantsGenerator.generateAdVariantsStrategy(intelligence);
      
      return {
        total_variants: adVariantsStrategy.metadata.total_variants,
        total_tests: adVariantsStrategy.metadata.total_tests,
        testing_priorities: adVariantsStrategy.optimization_insights.testing_priorities,
        expected_improvement: adVariantsStrategy.optimization_insights.expected_improvement,
        implementation: {
          rollout_phases: adVariantsStrategy.implementation.rollout_phases,
          success_criteria: adVariantsStrategy.implementation.success_criteria
        }
      };
    } catch (error) {
      console.warn('Ad variants strategy generation failed, skipping:', error);
      return undefined;
    }
  }
  
  private async generateCompetitiveIntelligence(intelligence: StrategicIntelligence) {
    try {
      // Mock SERP data for competitive analysis
      const mockSerpData = intelligence.opportunities.slice(0, 20).map(opp => ({
        keyword: opp.keyword,
        search_volume: opp.monthly_search_volume,
        results: [
          { position: 1, url: 'https://competitor1.com/page', domain: 'competitor1.com', 
            title: 'Competitor 1 Content', description: 'Leading solution for...' },
          { position: 2, url: 'https://competitor2.com/page', domain: 'competitor2.com',
            title: 'Competitor 2 Content', description: 'Premium tool for...' },
          { position: 3, url: 'https://littlebearapps.com/page', domain: 'littlebearapps.com',
            title: 'Our Content', description: 'Free Chrome extension for...' },
          { position: 4, url: 'https://competitor3.com/page', domain: 'competitor3.com',
            title: 'Competitor 3 Content', description: 'Alternative solution...' },
          { position: 5, url: 'https://competitor4.com/page', domain: 'competitor4.com',
            title: 'Competitor 4 Content', description: 'Professional tool...' }
        ],
        ads: Math.random() > 0.5 ? [
          { position: 1, domain: 'competitor1.com', headline: 'Best Converter Tool',
            description: 'Try our premium converter...' },
          { position: 2, domain: 'competitor2.com', headline: 'Fast Conversion',
            description: 'Convert files instantly...' }
        ] : undefined
      }));
      
      // Scan competitive landscape
      const competitiveData = await this.competitiveScanner.scanCompetitiveLandscape(
        mockSerpData,
        intelligence
      );
      
      return {
        competitors_tracked: competitiveData.metadata.competitors_tracked,
        keyword_gaps_found: competitiveData.keyword_gaps.length,
        content_gaps_found: competitiveData.content_gaps.length,
        biggest_threats: competitiveData.insights_summary.biggest_threats,
        biggest_opportunities: competitiveData.insights_summary.biggest_opportunities,
        recommended_focus_areas: competitiveData.insights_summary.recommended_focus_areas,
        success_probability: competitiveData.insights_summary.success_probability,
        immediate_actions: competitiveData.action_plan.immediate_actions.slice(0, 5).map(a => ({
          action: a.action,
          impact: a.impact,
          timeline: a.timeline
        }))
      };
    } catch (error) {
      console.warn('Competitive intelligence generation failed, skipping:', error);
      return undefined;
    }
  }
  
  private calculateContentImplementationRoadmap(calendar: ContentCalendar, linking: InternalLinkingStrategy) {
    // Calculate content creation hours
    const contentHours = calendar.calendar.reduce((total, entry) => {
      const hoursByResource = { light: 2, medium: 4, heavy: 8 };
      return total + hoursByResource[entry.resourceRequirement];
    }, 0);
    
    // Calculate linking implementation hours
    const linkingHours = linking.opportunities.reduce((total, opp) => {
      return total + (opp.implementation.timeEstimate / 60); // Convert minutes to hours
    }, 0);
    
    return {
      phase_one_content: calendar.weeklyBreakdown.slice(0, 4).reduce((sum, week) => sum + week.pieces, 0),
      phase_two_content: calendar.weeklyBreakdown.slice(4, 8).reduce((sum, week) => sum + week.pieces, 0),
      phase_three_content: calendar.weeklyBreakdown.slice(8).reduce((sum, week) => sum + week.pieces, 0),
      total_estimated_hours: Math.round(contentHours + linkingHours)
    };
  }
  
  private mapGrowthStageToBusinessPriorities(stage: StrategicConfig['business_context']['growth_stage']) {
    const priorityMap = {
      startup: { revenue_focus: 'high', brand_building: 'low', competitive_defense: 'low', market_expansion: 'medium' },
      growth: { revenue_focus: 'high', brand_building: 'medium', competitive_defense: 'medium', market_expansion: 'high' },
      mature: { revenue_focus: 'medium', brand_building: 'high', competitive_defense: 'high', market_expansion: 'medium' },
      enterprise: { revenue_focus: 'medium', brand_building: 'high', competitive_defense: 'high', market_expansion: 'low' }
    };
    return priorityMap[stage] as any;
  }
  
  private mapSerpUrgencyToEffort(urgency: string): number {
    const urgencyMap: Record<string, number> = {
      'high': 2, // Quick response needed
      'medium': 4,
      'low': 6
    };
    return urgencyMap[urgency] || 4;
  }
  
  private estimateSearchVolume(opp: UnifiedOpportunity): number {
    // Estimate based on opportunity type and impact
    if (opp.source_type === 'waste_reduction') {
      // Higher waste usually means higher volume
      return (opp.waste_context?.monthly_waste || 0) * 10;
    }
    if (opp.source_type === 'gap_capture') {
      // Paid performance indicates volume
      return (opp.gap_context?.paid_performance?.clicks || 0) * 20;
    }
    // Default estimate based on impact
    return opp.impact_potential * 1000;
  }
  
  private estimateCommercialIntent(opp: UnifiedOpportunity): number {
    if (opp.source_type === 'waste_reduction') {
      return 0.7; // Search terms are usually commercial
    }
    if (opp.source_type === 'gap_capture') {
      return 0.8; // Paid & organic data is highly commercial
    }
    return 0.6; // Default moderate intent
  }
  
  private estimateSerpDifficulty(opp: UnifiedOpportunity): number {
    if (opp.implementation_effort >= 7) return 0.8; // High effort = high difficulty
    if (opp.implementation_effort >= 5) return 0.6; // Medium difficulty
    return 0.4; // Low difficulty
  }
  
  private extractCurrentPosition(opp: UnifiedOpportunity): number | undefined {
    return opp.gap_context?.organic_position;
  }
  
  private extractCPC(opp: UnifiedOpportunity): number | undefined {
    if (opp.gap_context?.paid_performance) {
      const perf = opp.gap_context.paid_performance;
      return perf.clicks > 0 ? perf.cost / perf.clicks : undefined;
    }
    return undefined;
  }
  
  private extractMonthlySpend(opp: UnifiedOpportunity): number | undefined {
    if (opp.gap_context?.paid_performance) {
      return opp.gap_context.paid_performance.cost * 30; // Daily to monthly
    }
    if (opp.waste_context) {
      return opp.waste_context.monthly_waste; // This is waste, not spend
    }
    return undefined;
  }
  
  private mapImpactToUrgency(impact: number): OpportunitySource['urgency'] {
    if (impact >= 8) return 'critical';
    if (impact >= 6) return 'high';
    if (impact >= 4) return 'medium';
    return 'low';
  }
  
  private calculateHeadcountRequirements(opportunities: UnifiedOpportunity[]) {
    const totalEffort = opportunities.reduce((sum, o) => sum + o.implementation_effort, 0);
    
    // Map effort to specialist months (assuming 160 hours per month per person)
    const effortHours = totalEffort * 10; // 10 hours per effort point
    const monthlyCapacity = 160; // hours per person per month
    
    return {
      seo_specialist_months: Math.ceil(effortHours * 0.4 / monthlyCapacity), // 40% SEO
      paid_search_specialist_months: Math.ceil(effortHours * 0.3 / monthlyCapacity), // 30% Paid
      content_creator_months: Math.ceil(effortHours * 0.2 / monthlyCapacity), // 20% Content
      developer_months: Math.ceil(effortHours * 0.1 / monthlyCapacity) // 10% Technical
    };
  }
  
  private generateRiskAssessment(opportunities: UnifiedOpportunity[], avgConfidence: number) {
    const risks = {
      data_quality_risks: [] as string[],
      competitive_threats: [] as string[],
      seasonal_considerations: [] as string[],
      implementation_risks: [] as string[]
    };
    
    // Data quality risks
    if (avgConfidence < 0.7) {
      risks.data_quality_risks.push('Below-average data confidence across opportunities');
    }
    
    const staleDays = Math.max(...opportunities.map(o => o.data_freshness));
    if (staleDays > 14) {
      risks.data_quality_risks.push('Some data sources are more than 2 weeks old');
    }
    
    // Competitive threats
    const highImpactCount = opportunities.filter(o => o.impact_potential >= 7).length;
    if (highImpactCount > 5) {
      risks.competitive_threats.push('Multiple high-impact opportunities may attract competitor attention');
    }
    
    // Implementation risks
    const highEffortCount = opportunities.filter(o => o.implementation_effort >= 7).length;
    if (highEffortCount > 3) {
      risks.implementation_risks.push('Resource constraints may delay high-effort initiatives');
    }
    
    return risks;
  }
  
  private defineSuccessMetrics(opportunities: UnifiedOpportunity[]) {
    const monthlyKPIs = [
      'Organic traffic growth rate',
      'Paid search efficiency (CPA reduction)',
      'Cross-channel conversion rate',
      'Opportunity completion rate'
    ];
    
    const milestoneTargets = {
      'Monthly waste reduction ($)': opportunities
        .filter(o => o.source_type === 'waste_reduction')
        .reduce((sum, o) => sum + (o.waste_context?.monthly_waste || 0), 0),
      'New organic rankings (top 10)': opportunities
        .filter(o => o.source_type === 'gap_capture' && o.gap_context?.gap_type === 'harvest_opportunity')
        .length,
      'SERP volatility responses': opportunities
        .filter(o => o.source_type === 'serp_volatility')
        .length
    };
    
    const reviewSchedule = {
      weekly_reviews: ['Immediate action progress', 'Waste reduction tracking'],
      monthly_deep_dives: ['ROI analysis', 'Competitive positioning', 'Channel performance'],
      quarterly_strategy_updates: ['Market opportunity assessment', 'Resource allocation review', 'Long-term roadmap adjustment']
    };
    
    return {
      monthly_tracking_kpis: monthlyKPIs,
      milestone_targets: milestoneTargets,
      review_schedule: reviewSchedule
    };
  }
  
  private generateOpportunityCSV(intelligence: StrategicIntelligence): string {
    const allOpps = [
      ...intelligence.priority_matrix.immediate_actions,
      ...intelligence.priority_matrix.quarter_1_roadmap,
      ...intelligence.priority_matrix.quarter_2_roadmap,
      ...intelligence.priority_matrix.long_term_strategic
    ];
    
    const headers = [
      'Query',
      'Market',
      'Source_Type',
      'Impact_Potential',
      'Implementation_Effort',
      'Confidence_Score',
      'Priority_Tier',
      'Estimated_Value',
      'Cross_Channel_Correlation'
    ].join(',');
    
    const rows = allOpps.map(opp => [
      `"${opp.query}"`,
      opp.market,
      opp.source_type,
      opp.impact_potential.toFixed(1),
      opp.implementation_effort.toFixed(1),
      opp.confidence_score.toFixed(2),
      this.determinePriorityTier(opp, intelligence),
      this.estimateOpportunityValue(opp).toFixed(0),
      opp.cross_analyzer_correlation.toFixed(2)
    ].join(','));
    
    return [headers, ...rows].join('\n');
  }
  
  private generateStrategicReport(intelligence: StrategicIntelligence, dateStr: string): string {
    const { executive_summary: summary } = intelligence;
    
    return `# Strategic Intelligence Report - ${this.config.product_name}

## Executive Summary
**Analysis Date**: ${dateStr}
**Confidence Level**: ${summary.confidence_level.toUpperCase()}

### Key Metrics
- **Total Opportunities Identified**: ${summary.total_opportunities}
- **Projected Annual Savings**: $${summary.projected_annual_savings.toLocaleString()}
- **Projected Annual Growth**: $${summary.projected_annual_growth.toLocaleString()}
- **Implementation Investment**: $${summary.implementation_investment.toLocaleString()}
- **Net ROI (12 months)**: ${summary.net_roi_12_months.toFixed(1)}%

### Strategic Priorities

#### 🚀 Immediate Actions (Next 30 Days)
${intelligence.priority_matrix.immediate_actions.map((opp, i) => 
`${i + 1}. **${opp.query}** [${opp.source_type}]
   - Impact: ${opp.impact_potential.toFixed(1)}/10
   - Effort: ${opp.implementation_effort.toFixed(1)}/10
   - Confidence: ${(opp.confidence_score * 100).toFixed(0)}%`
).join('\n\n')}

#### 🎯 Quarter 1 Roadmap (Next 90 Days)
${intelligence.priority_matrix.quarter_1_roadmap.slice(0, 5).map((opp, i) => 
`${i + 1}. **${opp.query}** [${opp.source_type}]
   - Impact: ${opp.impact_potential.toFixed(1)}/10
   - Cross-channel correlation: ${(opp.cross_analyzer_correlation * 100).toFixed(0)}%`
).join('\n\n')}

### Channel Performance Insights

#### Search Terms Waste Analysis
- **Total Annual Waste**: $${intelligence.cross_channel_insights.search_terms_waste_total.toLocaleString()}
- **Waste Reduction Opportunities**: ${intelligence.priority_matrix.immediate_actions.filter(o => o.source_type === 'waste_reduction').length}

#### Paid & Organic Gap Analysis  
- **Gap Opportunities**: ${intelligence.cross_channel_insights.gap_opportunities_count}
- **Cross-Channel Synergies**: ${intelligence.priority_matrix.quarter_1_roadmap.filter(o => o.source_type === 'cross_channel').length}

#### SERP Monitoring Alerts
- **Volatility Alerts**: ${intelligence.cross_channel_insights.serp_volatility_alerts}
- **Channel Efficiency Score**: ${intelligence.cross_channel_insights.channel_efficiency_score.toFixed(0)}%

### Resource Requirements

#### Budget Allocation
- **Immediate Budget Needed**: $${intelligence.resource_allocation.immediate_budget_needed.toLocaleString()}
- **Q1 Budget**: $${intelligence.resource_allocation.quarterly_budget_plan[0].toLocaleString()}
- **Q2 Budget**: $${intelligence.resource_allocation.quarterly_budget_plan[1].toLocaleString()}

#### Team Requirements
- **SEO Specialist**: ${intelligence.resource_allocation.headcount_requirements.seo_specialist_months} months
- **Paid Search Specialist**: ${intelligence.resource_allocation.headcount_requirements.paid_search_specialist_months} months
- **Content Creator**: ${intelligence.resource_allocation.headcount_requirements.content_creator_months} months
- **Developer**: ${intelligence.resource_allocation.headcount_requirements.developer_months} months

### Risk Management

#### Data Quality Risks
${intelligence.risk_assessment.data_quality_risks.map(risk => `- ${risk}`).join('\n')}

#### Implementation Risks
${intelligence.risk_assessment.implementation_risks.map(risk => `- ${risk}`).join('\n')}

### Success Tracking

#### Monthly KPIs
${intelligence.success_metrics.monthly_tracking_kpis.map(kpi => `- ${kpi}`).join('\n')}

#### Milestone Targets
${Object.entries(intelligence.success_metrics.milestone_targets).map(([metric, target]) => 
`- **${metric}**: ${typeof target === 'number' ? target.toLocaleString() : target}`
).join('\n')}

### Review Schedule
- **Weekly**: ${intelligence.success_metrics.review_schedule.weekly_reviews.join(', ')}
- **Monthly**: ${intelligence.success_metrics.review_schedule.monthly_deep_dives.join(', ')}
- **Quarterly**: ${intelligence.success_metrics.review_schedule.quarterly_strategy_updates.join(', ')}

---

*Generated by SEO & Ads Expert Tool v1.2 Strategic Orchestrator*
*Analysis confidence: ${summary.confidence_level.toUpperCase()} | Data sources: ${this.getActiveSources().join(', ')}*
`;
  }
  
  private determinePriorityTier(opp: UnifiedOpportunity, intelligence: StrategicIntelligence): string {
    if (intelligence.priority_matrix.immediate_actions.includes(opp)) return 'Immediate';
    if (intelligence.priority_matrix.quarter_1_roadmap.includes(opp)) return 'Q1';
    if (intelligence.priority_matrix.quarter_2_roadmap.includes(opp)) return 'Q2';
    return 'Long-term';
  }
  
  private estimateOpportunityValue(opp: UnifiedOpportunity): number {
    if (opp.waste_context) {
      return opp.waste_context.monthly_waste * 12; // Annual savings
    }
    if (opp.gap_context?.paid_performance) {
      return opp.gap_context.paid_performance.cost * 365 * 0.3; // 30% growth estimate
    }
    // Default estimate based on impact
    return opp.impact_potential * 1000;
  }
  
  private getActiveSources(): string[] {
    const sources = [];
    if (this.config.data_sources.search_terms_csv) sources.push('Search Terms');
    if (this.config.data_sources.paid_organic_csv) sources.push('Paid & Organic');
    if (this.config.data_sources.serp_monitoring_enabled) sources.push('SERP Monitoring');
    return sources;
  }
}

export default StrategicOrchestrator;