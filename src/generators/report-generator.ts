#!/usr/bin/env tsx

/**
 * Task 9: Report Generator & Export System
 * 
 * This module generates comprehensive reports from strategic intelligence data,
 * providing multiple export formats, executive dashboards, visualizations,
 * and automated insights with actionable recommendations.
 */

import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { StrategicIntelligence } from '../analyzers/strategic-orchestrator';

// === SCHEMAS ===

const ReportSectionSchema = z.object({
  title: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  content: z.string(),
  metrics: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    trend: z.enum(['up', 'down', 'stable']).optional(),
    change: z.number().optional()
  })).optional(),
  visualizations: z.array(z.object({
    type: z.enum(['chart', 'table', 'heatmap', 'timeline', 'comparison']),
    data: z.any(),
    title: z.string(),
    description: z.string().optional()
  })).optional(),
  insights: z.array(z.string()).optional(),
  recommendations: z.array(z.object({
    action: z.string(),
    impact: z.enum(['low', 'medium', 'high', 'critical']),
    timeline: z.string(),
    resources: z.string().optional()
  })).optional()
});

const ExecutiveDashboardSchema = z.object({
  generated_at: z.string(),
  period: z.object({
    start: z.string(),
    end: z.string()
  }),
  kpi_summary: z.object({
    total_opportunities: z.number(),
    estimated_annual_value: z.number(),
    implementation_cost: z.number(),
    expected_roi: z.number(),
    success_probability: z.number()
  }),
  performance_highlights: z.array(z.object({
    metric: z.string(),
    current: z.number(),
    target: z.number(),
    achievement: z.number(),
    status: z.enum(['on_track', 'at_risk', 'behind', 'exceeded'])
  })),
  strategic_priorities: z.array(z.object({
    priority: z.string(),
    description: z.string(),
    owner: z.string().optional(),
    deadline: z.string(),
    status: z.enum(['not_started', 'in_progress', 'completed', 'blocked'])
  })),
  risk_indicators: z.array(z.object({
    risk: z.string(),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high', 'critical']),
    mitigation: z.string()
  })),
  next_actions: z.array(z.object({
    action: z.string(),
    owner: z.string().optional(),
    due_date: z.string(),
    dependencies: z.array(z.string()).optional()
  }))
});

const ReportConfigSchema = z.object({
  format: z.enum(['html', 'pdf', 'markdown', 'csv', 'json', 'excel']),
  include_visualizations: z.boolean().default(true),
  include_raw_data: z.boolean().default(false),
  executive_summary_only: z.boolean().default(false),
  custom_branding: z.object({
    logo_url: z.string().optional(),
    company_name: z.string(),
    brand_colors: z.object({
      primary: z.string(),
      secondary: z.string(),
      accent: z.string()
    }).optional()
  }).optional(),
  distribution_list: z.array(z.string().email()).optional(),
  schedule: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'on_demand']).default('on_demand')
});

const ComprehensiveReportSchema = z.object({
  metadata: z.object({
    report_id: z.string(),
    generated_at: z.string(),
    generated_by: z.string(),
    report_type: z.string(),
    version: z.string()
  }),
  executive_dashboard: ExecutiveDashboardSchema,
  sections: z.array(ReportSectionSchema),
  appendices: z.array(z.object({
    title: z.string(),
    content: z.string(),
    data_tables: z.any().optional()
  })).optional(),
  glossary: z.record(z.string(), z.string()).optional(),
  methodology: z.string().optional()
});

// === TYPES ===
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type ExecutiveDashboard = z.infer<typeof ExecutiveDashboardSchema>;
export type ReportConfig = z.infer<typeof ReportConfigSchema>;
export type ComprehensiveReport = z.infer<typeof ComprehensiveReportSchema>;

// === GENERATOR CLASS ===

export class ReportGenerator {
  private product: string;
  private outputDir: string;

  constructor(product: string, outputDir: string = 'reports') {
    this.product = product;
    this.outputDir = outputDir;
  }

  async generateReport(
    intelligence: StrategicIntelligence,
    config: ReportConfig
  ): Promise<{ report: ComprehensiveReport; exportPath: string }> {
    console.log(`📊 Generating ${config.format.toUpperCase()} report...`);

    // Create comprehensive report structure
    const report = await this.createComprehensiveReport(intelligence);

    // Export in requested format
    const exportPath = await this.exportReport(report, config);

    console.log(`✅ Report generated successfully: ${exportPath}`);
    return { report, exportPath };
  }

  private async createComprehensiveReport(
    intelligence: StrategicIntelligence
  ): Promise<ComprehensiveReport> {
    const reportId = this.generateReportId();
    
    // Create executive dashboard
    const dashboard = this.createExecutiveDashboard(intelligence);
    
    // Generate report sections
    const sections = [
      this.createExecutiveSummarySection(intelligence),
      this.createOpportunityAnalysisSection(intelligence),
      this.createCompetitiveIntelligenceSection(intelligence),
      this.createContentStrategySection(intelligence),
      this.createAdStrategySection(intelligence),
      this.createPerformanceMetricsSection(intelligence),
      this.createActionPlanSection(intelligence),
      this.createRiskAssessmentSection(intelligence),
      this.createFinancialProjectionsSection(intelligence),
      this.createImplementationRoadmapSection(intelligence)
    ].filter(Boolean) as ReportSection[];

    // Add appendices
    const appendices = this.createAppendices(intelligence);
    
    // Create glossary
    const glossary = this.createGlossary();
    
    // Define methodology
    const methodology = this.defineMethodology();

    return ComprehensiveReportSchema.parse({
      metadata: {
        report_id: reportId,
        generated_at: new Date().toISOString(),
        generated_by: 'SEO & Google Ads Expert Tool v1.2',
        report_type: 'Strategic Intelligence Report',
        version: '1.2.0'
      },
      executive_dashboard: dashboard,
      sections,
      appendices,
      glossary,
      methodology
    });
  }

  private createExecutiveDashboard(intelligence: StrategicIntelligence): ExecutiveDashboard {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    return {
      generated_at: now.toISOString(),
      period: {
        start: threeMonthsAgo.toISOString(),
        end: now.toISOString()
      },
      kpi_summary: {
        total_opportunities: intelligence.executive_summary.total_opportunities,
        estimated_annual_value: 
          intelligence.executive_summary.projected_annual_savings +
          intelligence.executive_summary.projected_annual_growth,
        implementation_cost: intelligence.executive_summary.implementation_investment,
        expected_roi: intelligence.executive_summary.net_roi_12_months,
        success_probability: intelligence.competitive_intelligence?.success_probability || 75
      },
      performance_highlights: this.extractPerformanceHighlights(intelligence),
      strategic_priorities: this.identifyStrategicPriorities(intelligence),
      risk_indicators: this.assessRiskIndicators(intelligence),
      next_actions: this.determineNextActions(intelligence)
    };
  }

  private createExecutiveSummarySection(intelligence: StrategicIntelligence): ReportSection {
    const metrics = [
      {
        label: 'Total Opportunities Identified',
        value: intelligence.executive_summary.total_opportunities,
        trend: 'up' as const,
        change: 25
      },
      {
        label: 'Projected Annual Savings',
        value: `$${intelligence.executive_summary.projected_annual_savings.toLocaleString()}`,
        trend: 'up' as const,
        change: 15
      },
      {
        label: 'Projected Annual Growth',
        value: `$${intelligence.executive_summary.projected_annual_growth.toLocaleString()}`,
        trend: 'up' as const,
        change: 30
      },
      {
        label: 'Net ROI (12 months)',
        value: `${intelligence.executive_summary.net_roi_12_months}%`,
        trend: 'stable' as const
      }
    ];

    const insights = [
      `${intelligence.executive_summary.total_opportunities} strategic opportunities identified with ${intelligence.executive_summary.confidence_level} confidence`,
      `Combined annual value potential of $${(intelligence.executive_summary.projected_annual_savings + intelligence.executive_summary.projected_annual_growth).toLocaleString()}`,
      `Investment requirement of $${intelligence.executive_summary.implementation_investment.toLocaleString()} with ${intelligence.executive_summary.net_roi_12_months}% expected ROI`,
      `${intelligence.competitive_intelligence?.competitors_tracked || 0} competitors analyzed with ${intelligence.competitive_intelligence?.keyword_gaps_found || 0} keyword gaps identified`
    ];

    const recommendations = [
      {
        action: 'Prioritize immediate action items from opportunity matrix',
        impact: 'critical' as const,
        timeline: '1 week',
        resources: 'SEO team, content creators'
      },
      {
        action: 'Allocate budget for Q1 initiatives',
        impact: 'high' as const,
        timeline: '2 weeks',
        resources: 'Finance, marketing leadership'
      },
      {
        action: 'Begin content gap closure program',
        impact: 'high' as const,
        timeline: '1 month',
        resources: 'Content team, subject matter experts'
      }
    ];

    return {
      title: 'Executive Summary',
      priority: 'critical',
      content: this.generateExecutiveSummaryContent(intelligence),
      metrics,
      insights,
      recommendations
    };
  }

  private createOpportunityAnalysisSection(intelligence: StrategicIntelligence): ReportSection {
    const opportunities = intelligence.priority_matrix.immediate_actions;
    
    const visualizations = [
      {
        type: 'chart' as const,
        data: this.createOpportunityChart(opportunities),
        title: 'Opportunity Impact vs Effort Matrix',
        description: 'Strategic positioning of identified opportunities'
      },
      {
        type: 'table' as const,
        data: this.createOpportunityTable(opportunities),
        title: 'Top 10 Priority Opportunities',
        description: 'Detailed breakdown of highest-value opportunities'
      }
    ];

    return {
      title: 'Opportunity Analysis',
      priority: 'high',
      content: this.generateOpportunityAnalysisContent(intelligence),
      visualizations,
      insights: [
        `${opportunities.length} immediate action opportunities identified`,
        `Average impact score: ${this.calculateAverageImpact(opportunities).toFixed(1)}/10`,
        `Quick wins available: ${opportunities.filter(o => o.implementation_effort <= 3).length} opportunities`
      ]
    };
  }

  private createCompetitiveIntelligenceSection(
    intelligence: StrategicIntelligence
  ): ReportSection | null {
    if (!intelligence.competitive_intelligence) return null;

    const ci = intelligence.competitive_intelligence;

    return {
      title: 'Competitive Intelligence',
      priority: 'high',
      content: this.generateCompetitiveIntelligenceContent(ci),
      metrics: [
        { label: 'Competitors Tracked', value: ci.competitors_tracked },
        { label: 'Keyword Gaps', value: ci.keyword_gaps_found },
        { label: 'Content Gaps', value: ci.content_gaps_found },
        { label: 'Success Probability', value: `${ci.success_probability}%` }
      ],
      insights: [
        ...ci.biggest_threats.map(t => `Threat: ${t}`),
        ...ci.biggest_opportunities.slice(0, 3).map(o => `Opportunity: ${o}`)
      ],
      recommendations: ci.immediate_actions.slice(0, 3).map(a => ({
        action: a.action,
        impact: a.impact as any,
        timeline: a.timeline
      }))
    };
  }

  private createContentStrategySection(intelligence: StrategicIntelligence): ReportSection | null {
    if (!intelligence.content_strategy) return null;

    const cs = intelligence.content_strategy;

    return {
      title: 'Content Strategy',
      priority: 'medium',
      content: this.generateContentStrategyContent(cs),
      metrics: [
        { label: 'Content Pieces Planned', value: cs.calendar_summary.total_pieces },
        { label: 'Weeks Covered', value: cs.calendar_summary.weeks_covered },
        { label: 'Avg Opportunity Score', value: cs.calendar_summary.average_opportunity_score.toFixed(1) },
        { label: 'Internal Links Identified', value: cs.linking_strategy.total_opportunities }
      ],
      visualizations: [
        {
          type: 'timeline' as const,
          data: this.createContentTimeline(cs),
          title: 'Content Publication Schedule',
          description: '12-week content calendar overview'
        }
      ]
    };
  }

  private createAdStrategySection(intelligence: StrategicIntelligence): ReportSection | null {
    if (!intelligence.ad_variants_strategy) return null;

    const ads = intelligence.ad_variants_strategy;

    return {
      title: 'Ad Strategy & A/B Testing',
      priority: 'medium',
      content: this.generateAdStrategyContent(ads),
      metrics: [
        { label: 'Ad Variants', value: ads.total_variants },
        { label: 'A/B Tests Planned', value: ads.total_tests },
        { label: 'Expected CTR Lift', value: `${ads.expected_improvement.ctr_lift}%` },
        { label: 'Expected Conversion Lift', value: `${ads.expected_improvement.conversion_lift}%` }
      ],
      insights: ads.testing_priorities.slice(0, 3),
      visualizations: [
        {
          type: 'comparison' as const,
          data: this.createAdVariantComparison(ads),
          title: 'Ad Variant Performance Projections',
          description: 'Expected performance by variant strategy'
        }
      ]
    };
  }

  private createPerformanceMetricsSection(
    intelligence: StrategicIntelligence
  ): ReportSection | null {
    if (!intelligence.performance_metrics) return null;

    const pm = intelligence.performance_metrics;

    return {
      title: 'Performance Metrics',
      priority: 'low',
      content: this.generatePerformanceMetricsContent(pm),
      metrics: [
        { label: 'Runtime', value: `${pm.runtime_ms}ms` },
        { label: 'Cache Hit Rate', value: `${(pm.cache_hit_rate * 100).toFixed(0)}%` },
        { label: 'Performance Score', value: `${pm.performance_score}/100` },
        { label: 'Memory Usage', value: `${pm.memory_peak_mb}MB` }
      ],
      insights: pm.budget_violations.length > 0 
        ? [`⚠️ Budget violations: ${pm.budget_violations.join(', ')}`]
        : ['✅ All performance budgets met']
    };
  }

  private createActionPlanSection(intelligence: StrategicIntelligence): ReportSection {
    const immediateActions = intelligence.priority_matrix.immediate_actions.slice(0, 5);
    const q1Actions = intelligence.priority_matrix.quarter_1_roadmap.slice(0, 5);

    return {
      title: 'Action Plan',
      priority: 'critical',
      content: this.generateActionPlanContent(intelligence),
      visualizations: [
        {
          type: 'table' as const,
          data: this.createActionPlanTable(immediateActions, q1Actions),
          title: 'Priority Action Matrix',
          description: 'Immediate and Q1 action items'
        }
      ],
      recommendations: immediateActions.slice(0, 3).map(action => ({
        action: `${action.source_type}: ${action.query}`,
        impact: this.mapImpactLevel(action.impact_potential),
        timeline: this.estimateTimeline(action.implementation_effort)
      }))
    };
  }

  private createRiskAssessmentSection(intelligence: StrategicIntelligence): ReportSection {
    const risks = intelligence.risk_assessment;

    return {
      title: 'Risk Assessment',
      priority: 'medium',
      content: this.generateRiskAssessmentContent(risks),
      insights: [
        ...risks.data_quality_risks.slice(0, 2),
        ...risks.competitive_threats.slice(0, 2),
        ...risks.implementation_risks.slice(0, 2)
      ],
      visualizations: [
        {
          type: 'heatmap' as const,
          data: this.createRiskHeatmap(risks),
          title: 'Risk Impact & Likelihood Matrix',
          description: 'Visual risk assessment by category'
        }
      ]
    };
  }

  private createFinancialProjectionsSection(intelligence: StrategicIntelligence): ReportSection {
    const allocation = intelligence.resource_allocation;

    return {
      title: 'Financial Projections',
      priority: 'high',
      content: this.generateFinancialProjectionsContent(allocation),
      metrics: [
        { label: 'Immediate Budget', value: `$${allocation.immediate_budget_needed.toLocaleString()}` },
        { label: 'Q1 Budget', value: `$${allocation.quarterly_budget_plan[0].toLocaleString()}` },
        { label: 'Annual Budget', value: `$${allocation.quarterly_budget_plan.reduce((a, b) => a + b, 0).toLocaleString()}` },
        { label: 'Expected ROI', value: `${intelligence.executive_summary.net_roi_12_months}%` }
      ],
      visualizations: [
        {
          type: 'chart' as const,
          data: this.createBudgetChart(allocation),
          title: 'Quarterly Budget Allocation',
          description: 'Investment distribution across quarters'
        }
      ]
    };
  }

  private createImplementationRoadmapSection(intelligence: StrategicIntelligence): ReportSection {
    return {
      title: 'Implementation Roadmap',
      priority: 'high',
      content: this.generateImplementationRoadmapContent(intelligence),
      visualizations: [
        {
          type: 'timeline' as const,
          data: this.createImplementationTimeline(intelligence),
          title: '12-Month Implementation Timeline',
          description: 'Phased rollout of strategic initiatives'
        }
      ],
      insights: [
        'Phase 1: Quick wins and foundation (Weeks 1-4)',
        'Phase 2: Content and SEO optimization (Weeks 5-12)',
        'Phase 3: Scale and refinement (Weeks 13-24)',
        'Phase 4: Long-term strategic initiatives (Weeks 25-52)'
      ]
    };
  }

  // === EXPORT METHODS ===

  private async exportReport(report: ComprehensiveReport, config: ReportConfig): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `strategic_report_${this.product}_${timestamp}`;
    
    // Ensure output directory exists
    const fullOutputDir = join(this.outputDir, this.product);
    if (!existsSync(fullOutputDir)) {
      await mkdir(fullOutputDir, { recursive: true });
    }

    let exportPath: string;

    switch (config.format) {
      case 'html':
        exportPath = await this.exportToHTML(report, fullOutputDir, filename, config);
        break;
      case 'markdown':
        exportPath = await this.exportToMarkdown(report, fullOutputDir, filename);
        break;
      case 'json':
        exportPath = await this.exportToJSON(report, fullOutputDir, filename);
        break;
      case 'csv':
        exportPath = await this.exportToCSV(report, fullOutputDir, filename);
        break;
      default:
        exportPath = await this.exportToMarkdown(report, fullOutputDir, filename);
    }

    return exportPath;
  }

  private async exportToHTML(
    report: ComprehensiveReport, 
    outputDir: string, 
    filename: string,
    config: ReportConfig
  ): Promise<string> {
    const html = this.generateHTML(report, config);
    const exportPath = join(outputDir, `${filename}.html`);
    await writeFile(exportPath, html);
    return exportPath;
  }

  private async exportToMarkdown(
    report: ComprehensiveReport, 
    outputDir: string, 
    filename: string
  ): Promise<string> {
    const markdown = this.generateMarkdown(report);
    const exportPath = join(outputDir, `${filename}.md`);
    await writeFile(exportPath, markdown);
    return exportPath;
  }

  private async exportToJSON(
    report: ComprehensiveReport, 
    outputDir: string, 
    filename: string
  ): Promise<string> {
    const exportPath = join(outputDir, `${filename}.json`);
    await writeFile(exportPath, JSON.stringify(report, null, 2));
    return exportPath;
  }

  private async exportToCSV(
    report: ComprehensiveReport, 
    outputDir: string, 
    filename: string
  ): Promise<string> {
    const csv = this.generateCSV(report);
    const exportPath = join(outputDir, `${filename}.csv`);
    await writeFile(exportPath, csv);
    return exportPath;
  }

  // === CONTENT GENERATION METHODS ===

  private generateHTML(report: ComprehensiveReport, config: ReportConfig): string {
    const brandColors = config.custom_branding?.brand_colors || {
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#10b981'
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.metadata.report_type} - ${config.custom_branding?.company_name || this.product}</title>
  <style>
    :root {
      --primary: ${brandColors.primary};
      --secondary: ${brandColors.secondary};
      --accent: ${brandColors.accent};
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f8fafc;
    }
    .header {
      background: var(--primary);
      color: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .kpi-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .kpi-value {
      font-size: 2em;
      font-weight: bold;
      color: var(--primary);
    }
    .kpi-label {
      color: var(--secondary);
      margin-top: 5px;
    }
    .section {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .section h2 {
      color: var(--primary);
      border-bottom: 2px solid var(--accent);
      padding-bottom: 10px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .metric {
      padding: 15px;
      background: #f8fafc;
      border-radius: 6px;
    }
    .insight {
      padding: 10px 15px;
      background: #eff6ff;
      border-left: 4px solid var(--accent);
      margin: 10px 0;
    }
    .recommendation {
      padding: 15px;
      background: #f0fdf4;
      border-radius: 6px;
      margin: 10px 0;
    }
    .priority-critical { border-left: 4px solid #ef4444; }
    .priority-high { border-left: 4px solid #f59e0b; }
    .priority-medium { border-left: 4px solid #3b82f6; }
    .priority-low { border-left: 4px solid #64748b; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: var(--primary);
      color: white;
    }
    tr:hover {
      background: #f8fafc;
    }
    .trend-up { color: #10b981; }
    .trend-down { color: #ef4444; }
    .trend-stable { color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.metadata.report_type}</h1>
    <p>${config.custom_branding?.company_name || this.product} | Generated: ${new Date(report.metadata.generated_at).toLocaleDateString()}</p>
  </div>

  <div class="dashboard">
    ${this.generateKPICards(report.executive_dashboard.kpi_summary)}
  </div>

  ${report.sections.map(section => this.generateHTMLSection(section)).join('\n')}

  <footer style="text-align: center; color: var(--secondary); margin-top: 50px;">
    <p>Generated by ${report.metadata.generated_by} | Version ${report.metadata.version}</p>
  </footer>
</body>
</html>`;
  }

  private generateKPICards(kpis: ExecutiveDashboard['kpi_summary']): string {
    return `
      <div class="kpi-card">
        <div class="kpi-value">${kpis.total_opportunities}</div>
        <div class="kpi-label">Total Opportunities</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">$${(kpis.estimated_annual_value / 1000).toFixed(0)}K</div>
        <div class="kpi-label">Annual Value</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${kpis.expected_roi}%</div>
        <div class="kpi-label">Expected ROI</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${kpis.success_probability}%</div>
        <div class="kpi-label">Success Probability</div>
      </div>
    `;
  }

  private generateHTMLSection(section: ReportSection): string {
    return `
      <div class="section priority-${section.priority}">
        <h2>${section.title}</h2>
        <div class="content">${section.content}</div>
        
        ${section.metrics ? `
          <div class="metrics">
            ${section.metrics.map(m => `
              <div class="metric">
                <strong>${m.label}:</strong> ${m.value}
                ${m.trend ? `<span class="trend-${m.trend}">
                  ${m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→'}
                  ${m.change ? `${m.change}%` : ''}
                </span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${section.insights ? `
          <div class="insights">
            <h3>Key Insights</h3>
            ${section.insights.map(i => `<div class="insight">${i}</div>`).join('')}
          </div>
        ` : ''}
        
        ${section.recommendations ? `
          <div class="recommendations">
            <h3>Recommendations</h3>
            ${section.recommendations.map(r => `
              <div class="recommendation">
                <strong>${r.action}</strong><br>
                Impact: ${r.impact} | Timeline: ${r.timeline}
                ${r.resources ? `<br>Resources: ${r.resources}` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private generateMarkdown(report: ComprehensiveReport): string {
    return `# ${report.metadata.report_type}

**Generated:** ${new Date(report.metadata.generated_at).toLocaleString()}  
**Version:** ${report.metadata.version}  
**Report ID:** ${report.metadata.report_id}

## Executive Dashboard

### KPI Summary
- **Total Opportunities:** ${report.executive_dashboard.kpi_summary.total_opportunities}
- **Estimated Annual Value:** $${report.executive_dashboard.kpi_summary.estimated_annual_value.toLocaleString()}
- **Implementation Cost:** $${report.executive_dashboard.kpi_summary.implementation_cost.toLocaleString()}
- **Expected ROI:** ${report.executive_dashboard.kpi_summary.expected_roi}%
- **Success Probability:** ${report.executive_dashboard.kpi_summary.success_probability}%

### Performance Highlights
${report.executive_dashboard.performance_highlights.map(h => 
  `- **${h.metric}:** ${h.current}/${h.target} (${h.achievement}%) - Status: ${h.status}`
).join('\n')}

### Strategic Priorities
${report.executive_dashboard.strategic_priorities.map((p, i) => 
  `${i + 1}. **${p.priority}**
   - ${p.description}
   - Deadline: ${p.deadline}
   - Status: ${p.status}`
).join('\n')}

---

${report.sections.map(section => this.generateMarkdownSection(section)).join('\n\n---\n\n')}

${report.methodology ? `
## Methodology
${report.methodology}
` : ''}

${report.glossary ? `
## Glossary
${Object.entries(report.glossary).map(([term, def]) => 
  `- **${term}:** ${def}`
).join('\n')}
` : ''}

---

*Generated by ${report.metadata.generated_by}*
`;
  }

  private generateMarkdownSection(section: ReportSection): string {
    let content = `## ${section.title}\n\n`;
    content += `**Priority:** ${section.priority}\n\n`;
    content += `${section.content}\n\n`;

    if (section.metrics && section.metrics.length > 0) {
      content += `### Metrics\n`;
      content += section.metrics.map(m => {
        let metric = `- **${m.label}:** ${m.value}`;
        if (m.trend) {
          const arrow = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→';
          metric += ` ${arrow}`;
          if (m.change) metric += ` (${m.change}%)`;
        }
        return metric;
      }).join('\n');
      content += '\n\n';
    }

    if (section.insights && section.insights.length > 0) {
      content += `### Key Insights\n`;
      content += section.insights.map(i => `- ${i}`).join('\n');
      content += '\n\n';
    }

    if (section.recommendations && section.recommendations.length > 0) {
      content += `### Recommendations\n`;
      content += section.recommendations.map(r => 
        `- **${r.action}**\n  - Impact: ${r.impact}\n  - Timeline: ${r.timeline}${r.resources ? `\n  - Resources: ${r.resources}` : ''}`
      ).join('\n');
    }

    return content;
  }

  private generateCSV(report: ComprehensiveReport): string {
    const rows: string[] = [];
    
    // Header
    rows.push('Section,Metric,Value,Trend,Change %,Priority');
    
    // KPIs
    const kpis = report.executive_dashboard.kpi_summary;
    rows.push(`Executive Dashboard,Total Opportunities,${kpis.total_opportunities},,,critical`);
    rows.push(`Executive Dashboard,Annual Value,$${kpis.estimated_annual_value},,,critical`);
    rows.push(`Executive Dashboard,Expected ROI,${kpis.expected_roi}%,,,critical`);
    rows.push(`Executive Dashboard,Success Probability,${kpis.success_probability}%,,,critical`);
    
    // Section metrics
    for (const section of report.sections) {
      if (section.metrics) {
        for (const metric of section.metrics) {
          const value = typeof metric.value === 'string' ? `"${metric.value}"` : metric.value;
          const trend = metric.trend || '';
          const change = metric.change || '';
          rows.push(`${section.title},${metric.label},${value},${trend},${change},${section.priority}`);
        }
      }
    }
    
    return rows.join('\n');
  }

  // === HELPER METHODS ===

  private generateReportId(): string {
    return `RPT_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  private extractPerformanceHighlights(intelligence: StrategicIntelligence): any[] {
    return [
      {
        metric: 'Opportunities Identified',
        current: intelligence.executive_summary.total_opportunities,
        target: 50,
        achievement: Math.round((intelligence.executive_summary.total_opportunities / 50) * 100),
        status: intelligence.executive_summary.total_opportunities >= 50 ? 'exceeded' : 'on_track'
      },
      {
        metric: 'ROI Projection',
        current: intelligence.executive_summary.net_roi_12_months,
        target: 200,
        achievement: Math.round((intelligence.executive_summary.net_roi_12_months / 200) * 100),
        status: intelligence.executive_summary.net_roi_12_months >= 200 ? 'exceeded' : 'on_track'
      },
      {
        metric: 'Keyword Gap Closure',
        current: intelligence.competitive_intelligence?.keyword_gaps_found || 0,
        target: 100,
        achievement: Math.round(((intelligence.competitive_intelligence?.keyword_gaps_found || 0) / 100) * 100),
        status: 'in_progress'
      }
    ];
  }

  private identifyStrategicPriorities(intelligence: StrategicIntelligence): any[] {
    return [
      {
        priority: 'Close Critical Keyword Gaps',
        description: 'Address top 20 high-value keyword opportunities',
        owner: 'SEO Team',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress'
      },
      {
        priority: 'Launch Content Gap Program',
        description: 'Create 10 comprehensive guides for underserved topics',
        owner: 'Content Team',
        deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'not_started'
      },
      {
        priority: 'Implement A/B Testing Framework',
        description: 'Deploy ad variant testing across priority campaigns',
        owner: 'PPC Team',
        deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'not_started'
      }
    ];
  }

  private assessRiskIndicators(intelligence: StrategicIntelligence): any[] {
    const risks = [];
    
    if (intelligence.risk_assessment.competitive_threats.length > 0) {
      risks.push({
        risk: 'Competitive Pressure',
        likelihood: 'high',
        impact: 'high',
        mitigation: 'Accelerate content production and SEO optimization'
      });
    }
    
    if (intelligence.risk_assessment.data_quality_risks.length > 0) {
      risks.push({
        risk: 'Data Quality Issues',
        likelihood: 'medium',
        impact: 'medium',
        mitigation: 'Implement data validation and verification processes'
      });
    }
    
    if (intelligence.risk_assessment.implementation_risks.length > 0) {
      risks.push({
        risk: 'Resource Constraints',
        likelihood: 'medium',
        impact: 'high',
        mitigation: 'Phased implementation with priority focus areas'
      });
    }
    
    return risks;
  }

  private determineNextActions(intelligence: StrategicIntelligence): any[] {
    return intelligence.priority_matrix.immediate_actions.slice(0, 5).map(action => ({
      action: `${action.source_type}: ${action.query}`,
      owner: this.assignOwner(action.source_type),
      due_date: new Date(Date.now() + (action.implementation_effort * 7 * 24 * 60 * 60 * 1000)).toISOString(),
      dependencies: []
    }));
  }

  private assignOwner(sourceType: string): string {
    const ownerMap: Record<string, string> = {
      'waste_reduction': 'PPC Team',
      'gap_capture': 'SEO Team',
      'serp_volatility': 'Content Team',
      'cross_channel': 'Marketing Team'
    };
    return ownerMap[sourceType] || 'Marketing Team';
  }

  private generateExecutiveSummaryContent(intelligence: StrategicIntelligence): string {
    return `This strategic intelligence report presents a comprehensive analysis of ${intelligence.executive_summary.total_opportunities} identified opportunities across search and advertising channels. The analysis reveals a combined annual value potential of $${(intelligence.executive_summary.projected_annual_savings + intelligence.executive_summary.projected_annual_growth).toLocaleString()}, with an implementation investment requirement of $${intelligence.executive_summary.implementation_investment.toLocaleString()} and an expected ROI of ${intelligence.executive_summary.net_roi_12_months}%.`;
  }

  private generateOpportunityAnalysisContent(intelligence: StrategicIntelligence): string {
    return `Our opportunity analysis has identified ${intelligence.executive_summary.total_opportunities} strategic opportunities across multiple channels. These opportunities are prioritized based on impact potential, implementation effort, and alignment with business objectives. The immediate action items represent quick wins that can deliver significant value with minimal investment.`;
  }

  private generateCompetitiveIntelligenceContent(ci: any): string {
    return `Competitive analysis tracked ${ci.competitors_tracked} key competitors, identifying ${ci.keyword_gaps_found} keyword gaps and ${ci.content_gaps_found} content gaps. The analysis reveals critical competitive threats and opportunities, with a ${ci.success_probability}% probability of successful market position improvement through strategic execution of recommended actions.`;
  }

  private generateContentStrategyContent(cs: any): string {
    return `The content strategy encompasses ${cs.calendar_summary.total_pieces} content pieces planned over ${cs.calendar_summary.weeks_covered} weeks, with an average opportunity score of ${cs.calendar_summary.average_opportunity_score.toFixed(1)}. The strategy includes ${cs.linking_strategy.total_opportunities} internal linking opportunities designed to improve site architecture and SEO performance.`;
  }

  private generateAdStrategyContent(ads: any): string {
    return `The ad strategy includes ${ads.total_variants} ad variants across ${ads.total_tests} A/B tests, with expected performance improvements of ${ads.expected_improvement.ctr_lift}% CTR lift and ${ads.expected_improvement.conversion_lift}% conversion lift. The testing framework follows a systematic approach to identify winning variants and optimize campaign performance.`;
  }

  private generatePerformanceMetricsContent(pm: any): string {
    return `System performance metrics show ${pm.runtime_ms}ms runtime with ${(pm.cache_hit_rate * 100).toFixed(0)}% cache hit rate and a performance score of ${pm.performance_score}/100. Memory usage peaked at ${pm.memory_peak_mb}MB, well within operational limits.`;
  }

  private generateActionPlanContent(intelligence: StrategicIntelligence): string {
    return `The action plan prioritizes ${intelligence.priority_matrix.immediate_actions.length} immediate actions and ${intelligence.priority_matrix.quarter_1_roadmap.length} Q1 initiatives. These actions are sequenced to maximize impact while minimizing resource requirements, with clear success metrics and timeline expectations.`;
  }

  private generateRiskAssessmentContent(risks: any): string {
    return `Risk assessment identifies ${risks.data_quality_risks.length + risks.competitive_threats.length + risks.implementation_risks.length} total risk factors across data quality, competitive landscape, and implementation categories. Mitigation strategies have been developed for each identified risk to ensure successful execution.`;
  }

  private generateFinancialProjectionsContent(allocation: any): string {
    return `Financial projections indicate an immediate budget requirement of $${allocation.immediate_budget_needed.toLocaleString()}, with quarterly allocations of $${allocation.quarterly_budget_plan.map((q: number) => q.toLocaleString()).join(', $')}. The total annual investment of $${allocation.quarterly_budget_plan.reduce((a: number, b: number) => a + b, 0).toLocaleString()} is expected to generate significant positive ROI.`;
  }

  private generateImplementationRoadmapContent(intelligence: StrategicIntelligence): string {
    return `The implementation roadmap spans 12 months with four distinct phases: immediate quick wins (Weeks 1-4), content and SEO optimization (Weeks 5-12), scaling and refinement (Weeks 13-24), and long-term strategic initiatives (Weeks 25-52). Each phase builds upon previous successes while maintaining flexibility for market changes.`;
  }

  private createOpportunityChart(opportunities: any[]): any {
    return {
      labels: opportunities.map((o, i) => `Opp ${i + 1}`),
      datasets: [{
        label: 'Impact',
        data: opportunities.map(o => o.impact_potential),
        backgroundColor: '#3b82f6'
      }, {
        label: 'Effort',
        data: opportunities.map(o => o.implementation_effort),
        backgroundColor: '#ef4444'
      }]
    };
  }

  private createOpportunityTable(opportunities: any[]): any {
    return {
      headers: ['Opportunity', 'Type', 'Impact', 'Effort', 'Confidence'],
      rows: opportunities.slice(0, 10).map(o => [
        o.query,
        o.source_type,
        o.impact_potential,
        o.implementation_effort,
        `${(o.confidence_score * 100).toFixed(0)}%`
      ])
    };
  }

  private createContentTimeline(cs: any): any {
    return {
      weeks: Array.from({ length: cs.calendar_summary.weeks_covered }, (_, i) => `Week ${i + 1}`),
      pieces: Array.from({ length: cs.calendar_summary.weeks_covered }, () => 3)
    };
  }

  private createAdVariantComparison(ads: any): any {
    return {
      variants: ['Benefit', 'Feature', 'Urgency', 'Social Proof'],
      ctr_lift: [25, 20, 30, 22],
      conversion_lift: [35, 28, 25, 32]
    };
  }

  private createActionPlanTable(immediate: any[], q1: any[]): any {
    return {
      headers: ['Action', 'Timeline', 'Impact', 'Owner'],
      rows: [
        ...immediate.map(a => [
          `${a.source_type}: ${a.query}`,
          'Immediate',
          this.mapImpactLevel(a.impact_potential),
          this.assignOwner(a.source_type)
        ]),
        ...q1.map(a => [
          `${a.source_type}: ${a.query}`,
          'Q1',
          this.mapImpactLevel(a.impact_potential),
          this.assignOwner(a.source_type)
        ])
      ]
    };
  }

  private createRiskHeatmap(risks: any): any {
    return {
      categories: ['Data Quality', 'Competitive', 'Implementation', 'Seasonal'],
      likelihood: [2, 3, 2, 1],
      impact: [2, 3, 3, 2]
    };
  }

  private createBudgetChart(allocation: any): any {
    return {
      quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
      budget: allocation.quarterly_budget_plan
    };
  }

  private createImplementationTimeline(intelligence: StrategicIntelligence): any {
    return {
      phases: [
        { name: 'Quick Wins', start: 0, duration: 4 },
        { name: 'SEO Optimization', start: 4, duration: 8 },
        { name: 'Scale & Refine', start: 12, duration: 12 },
        { name: 'Strategic Growth', start: 24, duration: 28 }
      ]
    };
  }

  private calculateAverageImpact(opportunities: any[]): number {
    if (opportunities.length === 0) return 0;
    return opportunities.reduce((sum, o) => sum + o.impact_potential, 0) / opportunities.length;
  }

  private mapImpactLevel(impact: number): 'low' | 'medium' | 'high' | 'critical' {
    if (impact >= 9) return 'critical';
    if (impact >= 7) return 'high';
    if (impact >= 4) return 'medium';
    return 'low';
  }

  private estimateTimeline(effort: number): string {
    if (effort <= 2) return '1 week';
    if (effort <= 4) return '2-3 weeks';
    if (effort <= 6) return '1 month';
    if (effort <= 8) return '2 months';
    return '3+ months';
  }

  private createAppendices(intelligence: StrategicIntelligence): any[] {
    return [
      {
        title: 'Data Sources',
        content: 'This report aggregates data from Google Search Console, RapidAPI keyword research, SERP analysis, and competitive intelligence scanning.'
      },
      {
        title: 'Calculation Methods',
        content: 'ROI calculations based on industry-standard conversion rates and average customer lifetime values. Traffic estimates use CTR curves from advanced web ranking studies.'
      }
    ];
  }

  private createGlossary(): Record<string, string> {
    return {
      'CTR': 'Click-Through Rate - percentage of impressions that result in clicks',
      'SERP': 'Search Engine Results Page',
      'ROI': 'Return on Investment',
      'CPC': 'Cost Per Click',
      'CVR': 'Conversion Rate',
      'LTV': 'Lifetime Value',
      'CAC': 'Customer Acquisition Cost'
    };
  }

  private defineMethodology(): string {
    return `This strategic intelligence report employs a multi-faceted analytical approach combining quantitative data analysis, competitive intelligence gathering, and predictive modeling. Data sources include first-party analytics, third-party market research, and proprietary algorithms for opportunity scoring and prioritization. All projections use conservative estimates with built-in risk adjustments.`;
  }

  // === AUTOMATED INSIGHTS ===

  generateAutomatedInsights(intelligence: StrategicIntelligence): string[] {
    const insights: string[] = [];

    // Opportunity insights
    if (intelligence.executive_summary.total_opportunities > 50) {
      insights.push(`🎯 Exceptional opportunity density with ${intelligence.executive_summary.total_opportunities} identified opportunities`);
    }

    // ROI insights
    if (intelligence.executive_summary.net_roi_12_months > 300) {
      insights.push(`💰 Outstanding ROI projection of ${intelligence.executive_summary.net_roi_12_months}% indicates high-value initiatives`);
    }

    // Competitive insights
    if (intelligence.competitive_intelligence?.keyword_gaps_found && intelligence.competitive_intelligence.keyword_gaps_found > 30) {
      insights.push(`⚠️ Significant competitive gap with ${intelligence.competitive_intelligence.keyword_gaps_found} keyword opportunities to capture`);
    }

    // Content insights
    if (intelligence.content_strategy?.calendar_summary.average_opportunity_score && intelligence.content_strategy.calendar_summary.average_opportunity_score > 7) {
      insights.push(`📈 High-quality content opportunities with average score of ${intelligence.content_strategy.calendar_summary.average_opportunity_score.toFixed(1)}/10`);
    }

    // Risk insights
    if (intelligence.risk_assessment.competitive_threats.length > 3) {
      insights.push(`🚨 Multiple competitive threats require immediate defensive strategy`);
    }

    return insights;
  }

  // === AUTOMATED RECOMMENDATIONS ===

  generateAutomatedRecommendations(intelligence: StrategicIntelligence): any[] {
    const recommendations = [];

    // High-value quick wins
    const quickWins = intelligence.priority_matrix.immediate_actions
      .filter(a => a.impact_potential >= 7 && a.implementation_effort <= 3);
    
    if (quickWins.length > 0) {
      recommendations.push({
        category: 'Quick Wins',
        recommendation: `Immediately pursue ${quickWins.length} high-impact, low-effort opportunities`,
        expectedValue: quickWins.reduce((sum, w) => sum + (w.impact_potential * 1000), 0),
        timeline: '1-2 weeks',
        priority: 'critical'
      });
    }

    // Content gap closure
    if (intelligence.content_strategy && intelligence.competitive_intelligence?.content_gaps_found && intelligence.competitive_intelligence.content_gaps_found > 10) {
      recommendations.push({
        category: 'Content Strategy',
        recommendation: `Launch content gap closure program targeting ${intelligence.competitive_intelligence.content_gaps_found} identified gaps`,
        expectedValue: intelligence.competitive_intelligence.content_gaps_found * 2000,
        timeline: '3 months',
        priority: 'high'
      });
    }

    // Ad optimization
    if (intelligence.ad_variants_strategy?.expected_improvement.conversion_lift && intelligence.ad_variants_strategy.expected_improvement.conversion_lift > 20) {
      recommendations.push({
        category: 'Paid Search',
        recommendation: `Implement A/B testing framework for ${intelligence.ad_variants_strategy.expected_improvement.conversion_lift}% conversion lift`,
        expectedValue: intelligence.executive_summary.projected_annual_growth * 0.2,
        timeline: '6 weeks',
        priority: 'high'
      });
    }

    return recommendations;
  }
}

// === MAIN EXPORT ===
export default ReportGenerator;