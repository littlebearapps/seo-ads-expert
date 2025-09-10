import pino from 'pino';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as csv from 'csv-stringify/sync';
import { format } from 'date-fns';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Sophisticated Export System for A/B Testing
 * 
 * Generates advanced exports for A/B testing experiments with
 * multiple formats, statistical analysis, and automation support.
 */

// ============================================================================
// SCHEMAS
// ============================================================================

export const ExperimentExportSchema = z.object({
  experimentId: z.string(),
  name: z.string(),
  type: z.enum(['RSA', 'LANDING_PAGE', 'BIDDING', 'AUDIENCE']),
  status: z.enum(['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETE']),
  startDate: z.date(),
  endDate: z.date().optional(),
  control: z.object({
    id: z.string(),
    name: z.string(),
    configuration: z.record(z.any()),
    metrics: z.record(z.number())
  }),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    configuration: z.record(z.any()),
    metrics: z.record(z.number()),
    significance: z.number().optional(),
    confidence: z.number().optional()
  })),
  winner: z.string().optional(),
  statisticalAnalysis: z.object({
    sampleSize: z.number(),
    powerAnalysis: z.number(),
    confidenceLevel: z.number(),
    minimumDetectableEffect: z.number()
  }).optional()
});

export type ExperimentExport = z.infer<typeof ExperimentExportSchema>;

// ============================================================================
// A/B TEST EXPORTER CLASS
// ============================================================================

export class ABTestExporter {
  private exportFormats = ['csv', 'json', 'google_ads_editor', 'google_optimize', 'analytics'];
  
  /**
   * Export experiment data in multiple formats
   */
  async exportExperiment(
    experiment: ExperimentExport,
    outputPath: string,
    formats: string[] = ['csv', 'json']
  ): Promise<{
    success: boolean;
    files: string[];
    errors: string[];
  }> {
    const result = {
      success: true,
      files: [] as string[],
      errors: [] as string[]
    };
    
    try {
      // Create output directory
      mkdirSync(outputPath, { recursive: true });
      
      // Export in each requested format
      for (const format of formats) {
        try {
          const filePath = await this.exportFormat(experiment, outputPath, format);
          if (filePath) {
            result.files.push(filePath);
          }
        } catch (error) {
          result.errors.push(`Failed to export ${format}: ${error.message}`);
          logger.error({ error, format }, 'Export format failed');
        }
      }
      
      // Generate comparison report
      const reportPath = await this.generateComparisonReport(experiment, outputPath);
      result.files.push(reportPath);
      
      // Generate implementation guide
      const guidePath = await this.generateImplementationGuide(experiment, outputPath);
      result.files.push(guidePath);
      
      logger.info(`✅ Exported ${result.files.length} files for experiment ${experiment.name}`);
      
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      logger.error({ error }, 'Export failed');
    }
    
    return result;
  }
  
  /**
   * Export in specific format
   */
  private async exportFormat(
    experiment: ExperimentExport,
    outputPath: string,
    format: string
  ): Promise<string | null> {
    switch (format) {
      case 'csv':
        return this.exportCSV(experiment, outputPath);
      case 'json':
        return this.exportJSON(experiment, outputPath);
      case 'google_ads_editor':
        return this.exportGoogleAdsEditor(experiment, outputPath);
      case 'google_optimize':
        return this.exportGoogleOptimize(experiment, outputPath);
      case 'analytics':
        return this.exportAnalytics(experiment, outputPath);
      default:
        logger.warn(`Unsupported format: ${format}`);
        return null;
    }
  }
  
  /**
   * Export as CSV for spreadsheet analysis
   */
  private exportCSV(experiment: ExperimentExport, outputPath: string): string {
    const data: any[] = [];
    
    // Add control
    data.push({
      variant_id: experiment.control.id,
      variant_name: experiment.control.name,
      is_control: true,
      ...this.flattenConfiguration(experiment.control.configuration),
      ...this.prefixMetrics(experiment.control.metrics),
      significance: 'N/A',
      confidence: 'N/A'
    });
    
    // Add variants
    for (const variant of experiment.variants) {
      data.push({
        variant_id: variant.id,
        variant_name: variant.name,
        is_control: false,
        ...this.flattenConfiguration(variant.configuration),
        ...this.prefixMetrics(variant.metrics),
        significance: variant.significance || 0,
        confidence: variant.confidence || 0
      });
    }
    
    const csvContent = csv.stringify(data, {
      header: true,
      quoted: true
    });
    
    const filePath = join(outputPath, `${experiment.experimentId}_results.csv`);
    writeFileSync(filePath, csvContent);
    
    return filePath;
  }
  
  /**
   * Export as JSON for programmatic access
   */
  private exportJSON(experiment: ExperimentExport, outputPath: string): string {
    const enrichedData = {
      ...experiment,
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        format: 'ab_test_export'
      },
      analysis: this.generateAnalysis(experiment),
      recommendations: this.generateRecommendations(experiment)
    };
    
    const filePath = join(outputPath, `${experiment.experimentId}_data.json`);
    writeFileSync(filePath, JSON.stringify(enrichedData, null, 2));
    
    return filePath;
  }
  
  /**
   * Export for Google Ads Editor bulk upload
   */
  private exportGoogleAdsEditor(experiment: ExperimentExport, outputPath: string): string {
    if (experiment.type !== 'RSA') {
      logger.warn('Google Ads Editor export only supports RSA experiments');
      return '';
    }
    
    const rsaData: any[] = [];
    
    // Export winner or best performing variant
    const winner = experiment.winner ? 
      experiment.variants.find(v => v.id === experiment.winner) || experiment.control :
      this.getBestPerformer(experiment);
    
    if (winner && winner.configuration.headlines) {
      rsaData.push({
        'Campaign': winner.configuration.campaign || 'Test Campaign',
        'Ad Group': winner.configuration.adGroup || 'Test Ad Group',
        'Ad Type': 'Responsive search ad',
        'Status': 'Paused',
        ...this.formatRSAForEditor(winner.configuration)
      });
    }
    
    const csvContent = csv.stringify(rsaData, {
      header: true,
      quoted: true
    });
    
    const filePath = join(outputPath, `${experiment.experimentId}_ads_editor.csv`);
    writeFileSync(filePath, csvContent);
    
    return filePath;
  }
  
  /**
   * Export for Google Optimize
   */
  private exportGoogleOptimize(experiment: ExperimentExport, outputPath: string): string {
    if (experiment.type !== 'LANDING_PAGE') {
      logger.warn('Google Optimize export only supports landing page experiments');
      return '';
    }
    
    const optimizeConfig = {
      experiment: {
        name: experiment.name,
        objective: 'CONVERSIONS',
        status: experiment.status === 'RUNNING' ? 'RUNNING' : 'DRAFT',
        variants: [
          {
            name: 'Original',
            weight: 50,
            url: experiment.control.configuration.url
          },
          ...experiment.variants.map(v => ({
            name: v.name,
            weight: Math.floor(50 / experiment.variants.length),
            url: v.configuration.url,
            changes: v.configuration.changes || []
          }))
        ],
        targetingRules: experiment.control.configuration.targeting || [],
        activationEvent: experiment.control.configuration.activationEvent
      }
    };
    
    const filePath = join(outputPath, `${experiment.experimentId}_optimize.json`);
    writeFileSync(filePath, JSON.stringify(optimizeConfig, null, 2));
    
    return filePath;
  }
  
  /**
   * Export for Analytics integration
   */
  private exportAnalytics(experiment: ExperimentExport, outputPath: string): string {
    const analyticsData = {
      experimentId: experiment.experimentId,
      experimentName: experiment.name,
      dimensions: [
        {
          name: 'experiment_variant',
          values: [
            experiment.control.name,
            ...experiment.variants.map(v => v.name)
          ]
        }
      ],
      metrics: this.getUniqueMetrics(experiment),
      segments: this.generateSegments(experiment),
      customDimensions: {
        cd1: 'experiment_id',
        cd2: 'variant_id',
        cd3: 'experiment_type'
      },
      goals: this.extractGoals(experiment),
      dateRange: {
        startDate: format(experiment.startDate, 'yyyy-MM-dd'),
        endDate: experiment.endDate ? format(experiment.endDate, 'yyyy-MM-dd') : 'today'
      }
    };
    
    const filePath = join(outputPath, `${experiment.experimentId}_analytics.json`);
    writeFileSync(filePath, JSON.stringify(analyticsData, null, 2));
    
    return filePath;
  }
  
  /**
   * Generate comparison report
   */
  private async generateComparisonReport(
    experiment: ExperimentExport,
    outputPath: string
  ): Promise<string> {
    let report = `# A/B Test Results: ${experiment.name}\n\n`;
    
    // Summary
    report += '## Summary\n\n';
    report += `- **Experiment ID**: ${experiment.experimentId}\n`;
    report += `- **Type**: ${experiment.type}\n`;
    report += `- **Status**: ${experiment.status}\n`;
    report += `- **Duration**: ${this.calculateDuration(experiment)} days\n`;
    
    if (experiment.winner) {
      const winner = experiment.variants.find(v => v.id === experiment.winner) || experiment.control;
      report += `- **Winner**: ${winner.name}\n`;
    }
    
    report += '\n## Variant Performance\n\n';
    
    // Control performance
    report += `### Control: ${experiment.control.name}\n\n`;
    report += this.formatMetricsTable(experiment.control.metrics);
    
    // Variant performance
    for (const variant of experiment.variants) {
      report += `\n### Variant: ${variant.name}\n\n`;
      report += this.formatMetricsTable(variant.metrics);
      
      if (variant.significance) {
        report += `\n**Statistical Significance**: ${(variant.significance * 100).toFixed(2)}%\n`;
      }
      
      if (variant.confidence) {
        report += `**Confidence Level**: ${(variant.confidence * 100).toFixed(2)}%\n`;
      }
      
      // Lift calculation
      const lift = this.calculateLift(experiment.control.metrics, variant.metrics);
      report += `\n**Lift vs Control**:\n`;
      for (const [metric, value] of Object.entries(lift)) {
        report += `- ${metric}: ${value > 0 ? '+' : ''}${value.toFixed(2)}%\n`;
      }
    }
    
    // Statistical analysis
    if (experiment.statisticalAnalysis) {
      report += '\n## Statistical Analysis\n\n';
      report += `- **Sample Size**: ${experiment.statisticalAnalysis.sampleSize}\n`;
      report += `- **Power Analysis**: ${(experiment.statisticalAnalysis.powerAnalysis * 100).toFixed(2)}%\n`;
      report += `- **Confidence Level**: ${(experiment.statisticalAnalysis.confidenceLevel * 100).toFixed(2)}%\n`;
      report += `- **MDE**: ${(experiment.statisticalAnalysis.minimumDetectableEffect * 100).toFixed(2)}%\n`;
    }
    
    // Recommendations
    report += '\n## Recommendations\n\n';
    const recommendations = this.generateRecommendations(experiment);
    for (const rec of recommendations) {
      report += `- ${rec}\n`;
    }
    
    const filePath = join(outputPath, `${experiment.experimentId}_report.md`);
    writeFileSync(filePath, report);
    
    return filePath;
  }
  
  /**
   * Generate implementation guide
   */
  private async generateImplementationGuide(
    experiment: ExperimentExport,
    outputPath: string
  ): Promise<string> {
    let guide = `# Implementation Guide: ${experiment.name}\n\n`;
    
    guide += '## Quick Start\n\n';
    
    if (experiment.winner) {
      const winner = experiment.variants.find(v => v.id === experiment.winner) || experiment.control;
      
      guide += `### Recommended Implementation: ${winner.name}\n\n`;
      guide += '```json\n';
      guide += JSON.stringify(winner.configuration, null, 2);
      guide += '\n```\n\n';
      
      guide += '### Step-by-Step Instructions\n\n';
      
      switch (experiment.type) {
        case 'RSA':
          guide += this.generateRSAImplementationSteps(winner);
          break;
        case 'LANDING_PAGE':
          guide += this.generateLandingPageImplementationSteps(winner);
          break;
        case 'BIDDING':
          guide += this.generateBiddingImplementationSteps(winner);
          break;
        case 'AUDIENCE':
          guide += this.generateAudienceImplementationSteps(winner);
          break;
      }
    }
    
    guide += '\n## Testing Checklist\n\n';
    guide += '- [ ] Review all changes before implementation\n';
    guide += '- [ ] Create backup of current configuration\n';
    guide += '- [ ] Implement in test environment first\n';
    guide += '- [ ] Verify tracking is working\n';
    guide += '- [ ] Monitor performance for 24 hours\n';
    guide += '- [ ] Document any issues or variations\n';
    
    guide += '\n## Rollback Plan\n\n';
    guide += '1. If performance decreases by >20%, pause immediately\n';
    guide += '2. Revert to control configuration\n';
    guide += '3. Analyze what went wrong\n';
    guide += '4. Adjust and retest\n';
    
    const filePath = join(outputPath, `${experiment.experimentId}_implementation.md`);
    writeFileSync(filePath, guide);
    
    return filePath;
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  private flattenConfiguration(config: Record<string, any>): Record<string, any> {
    const flat: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nested = this.flattenConfiguration(value);
        for (const [nKey, nValue] of Object.entries(nested)) {
          flat[`${key}_${nKey}`] = nValue;
        }
      } else {
        flat[key] = value;
      }
    }
    
    return flat;
  }
  
  private prefixMetrics(metrics: Record<string, number>): Record<string, number> {
    const prefixed: Record<string, number> = {};
    
    for (const [key, value] of Object.entries(metrics)) {
      prefixed[`metric_${key}`] = value;
    }
    
    return prefixed;
  }
  
  private generateAnalysis(experiment: ExperimentExport): any {
    return {
      bestPerformer: this.getBestPerformer(experiment),
      worstPerformer: this.getWorstPerformer(experiment),
      averageLift: this.calculateAverageLift(experiment),
      significantResults: experiment.variants.filter(v => (v.significance || 0) > 0.95).length > 0
    };
  }
  
  private generateRecommendations(experiment: ExperimentExport): string[] {
    const recommendations: string[] = [];
    
    if (experiment.winner) {
      recommendations.push(`Implement ${experiment.winner} as the new default`);
    }
    
    if (experiment.statisticalAnalysis?.sampleSize < 1000) {
      recommendations.push('Consider running experiment longer for more reliable results');
    }
    
    const highPerformers = experiment.variants.filter(v => 
      (v.metrics.ctr || 0) > (experiment.control.metrics.ctr || 0) * 1.1
    );
    
    if (highPerformers.length > 0) {
      recommendations.push(`Test combining elements from ${highPerformers.map(v => v.name).join(', ')}`);
    }
    
    return recommendations;
  }
  
  private getBestPerformer(experiment: ExperimentExport): any {
    const all = [experiment.control, ...experiment.variants];
    return all.reduce((best, current) => 
      (current.metrics.conversions || 0) > (best.metrics.conversions || 0) ? current : best
    );
  }
  
  private getWorstPerformer(experiment: ExperimentExport): any {
    const all = [experiment.control, ...experiment.variants];
    return all.reduce((worst, current) => 
      (current.metrics.conversions || 0) < (worst.metrics.conversions || 0) ? current : worst
    );
  }
  
  private calculateDuration(experiment: ExperimentExport): number {
    const end = experiment.endDate || new Date();
    return Math.floor((end.getTime() - experiment.startDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  private calculateLift(control: Record<string, number>, variant: Record<string, number>): Record<string, number> {
    const lift: Record<string, number> = {};
    
    for (const [metric, controlValue] of Object.entries(control)) {
      const variantValue = variant[metric] || 0;
      if (controlValue > 0) {
        lift[metric] = ((variantValue - controlValue) / controlValue) * 100;
      }
    }
    
    return lift;
  }
  
  private calculateAverageLift(experiment: ExperimentExport): number {
    let totalLift = 0;
    let count = 0;
    
    for (const variant of experiment.variants) {
      const lift = this.calculateLift(experiment.control.metrics, variant.metrics);
      totalLift += Object.values(lift).reduce((sum, val) => sum + val, 0);
      count += Object.keys(lift).length;
    }
    
    return count > 0 ? totalLift / count : 0;
  }
  
  private formatMetricsTable(metrics: Record<string, number>): string {
    let table = '| Metric | Value |\n';
    table += '|--------|-------|\n';
    
    for (const [key, value] of Object.entries(metrics)) {
      table += `| ${key} | ${typeof value === 'number' ? value.toFixed(2) : value} |\n`;
    }
    
    return table;
  }
  
  private formatRSAForEditor(config: any): any {
    const formatted: any = {};
    
    // Add headlines
    if (config.headlines) {
      config.headlines.forEach((h: any, i: number) => {
        if (i < 15) {
          formatted[`Headline ${i + 1}`] = h.text || h;
          if (h.pinned) {
            formatted[`Headline ${i + 1} Pinned`] = h.pinned;
          }
        }
      });
    }
    
    // Add descriptions
    if (config.descriptions) {
      config.descriptions.forEach((d: any, i: number) => {
        if (i < 4) {
          formatted[`Description ${i + 1}`] = d.text || d;
        }
      });
    }
    
    // Add URLs and paths
    formatted['Final URL'] = config.finalUrl || config.url || '';
    formatted['Path 1'] = config.path1 || '';
    formatted['Path 2'] = config.path2 || '';
    
    return formatted;
  }
  
  private getUniqueMetrics(experiment: ExperimentExport): string[] {
    const metrics = new Set<string>();
    
    Object.keys(experiment.control.metrics).forEach(m => metrics.add(m));
    experiment.variants.forEach(v => 
      Object.keys(v.metrics).forEach(m => metrics.add(m))
    );
    
    return Array.from(metrics);
  }
  
  private generateSegments(experiment: ExperimentExport): any[] {
    return [
      {
        name: 'Control Group',
        definition: `experiment_variant == "${experiment.control.name}"`
      },
      ...experiment.variants.map(v => ({
        name: `Variant: ${v.name}`,
        definition: `experiment_variant == "${v.name}"`
      }))
    ];
  }
  
  private extractGoals(experiment: ExperimentExport): any[] {
    const goals: any[] = [];
    
    if (experiment.control.configuration.goals) {
      goals.push(...experiment.control.configuration.goals);
    }
    
    return goals;
  }
  
  private generateRSAImplementationSteps(winner: any): string {
    return `
1. **Google Ads Editor**:
   - Open Google Ads Editor
   - Navigate to Ads & Extensions > Ads
   - Click "Make multiple changes"
   - Select "Add/update multiple ads"
   - Copy the CSV from ${winner.id}_ads_editor.csv
   - Review and post changes

2. **Google Ads UI**:
   - Navigate to Ads & Extensions
   - Click the blue plus button
   - Select "Responsive search ad"
   - Enter the headlines and descriptions from the configuration
   - Set the final URL
   - Save the ad

3. **Google Ads API**:
   \`\`\`javascript
   const ad = ${JSON.stringify(winner.configuration, null, 2)};
   await customer.ads.create(ad);
   \`\`\`
`;
  }
  
  private generateLandingPageImplementationSteps(winner: any): string {
    return `
1. **Update Landing Page**:
   - Backup current page at ${winner.configuration.url}
   - Apply changes: ${JSON.stringify(winner.configuration.changes)}
   - Test all functionality
   - Verify tracking codes

2. **Update Campaign URLs**:
   - Update all ad final URLs
   - Update keyword final URLs
   - Update sitelink URLs

3. **Verify Implementation**:
   - Check page load speed
   - Test mobile responsiveness
   - Verify conversion tracking
   - Monitor for 404 errors
`;
  }
  
  private generateBiddingImplementationSteps(winner: any): string {
    return `
1. **Update Bidding Strategy**:
   - Strategy: ${winner.configuration.strategy}
   - Target: ${winner.configuration.target}
   - Budget: ${winner.configuration.budget}

2. **Apply to Campaign**:
   - Navigate to campaign settings
   - Select bidding strategy
   - Enter target values
   - Save changes

3. **Monitor Performance**:
   - Watch for significant CPC changes
   - Monitor impression share
   - Check conversion rate
`;
  }
  
  private generateAudienceImplementationSteps(winner: any): string {
    return `
1. **Create Audience**:
   - Type: ${winner.configuration.audienceType}
   - Definition: ${JSON.stringify(winner.configuration.definition)}

2. **Apply to Campaign**:
   - Navigate to Audiences
   - Add audience to campaign
   - Set bid adjustment: ${winner.configuration.bidAdjustment}%

3. **Verification**:
   - Check audience size
   - Monitor reach
   - Verify bid adjustments
`;
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const abTestExporter = new ABTestExporter();