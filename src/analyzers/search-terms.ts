/**
 * Search Terms Waste Analysis Engine
 * Analyzes Google Ads search terms reports to identify wasted spend
 * and generate negative keyword recommendations
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

// Schema for search terms report data
const SearchTermSchema = z.object({
  'Search term': z.string(),
  'Match type': z.enum(['Exact', 'Phrase', 'Broad', 'Broad match (session-based)']).optional(),
  'Campaign': z.string().optional(),
  'Ad group': z.string(),
  'Impressions': z.string().transform(val => parseInt(val.replace(/,/g, ''), 10)),
  'Clicks': z.string().transform(val => parseInt(val.replace(/,/g, ''), 10)),
  'Cost': z.string().transform(val => parseFloat(val.replace(/[$,]/g, ''))),
  'Conversions': z.string().transform(val => parseFloat(val.replace(/,/g, ''))),
  'Conv. value': z.string().transform(val => parseFloat(val.replace(/[$,]/g, ''))).optional(),
});

type SearchTerm = z.infer<typeof SearchTermSchema>;

// Waste detection configuration
interface WasteConfig {
  minCostThreshold: number;      // Minimum cost to consider for waste analysis
  minImpressionsThreshold: number; // Minimum impressions for CTR analysis
  lowCtrThreshold: number;       // CTR below this is considered poor
  confidenceThreshold: number;   // Statistical significance threshold
}

// Waste analysis result
interface WasteAnalysis {
  highCostNoConvert: WasteTerm[];
  lowCtrHighImpressions: WasteTerm[];
  poorQualityIndicators: WasteTerm[];
  negativeRecommendations: NegativeRecommendation[];
  totalWastedSpend: number;
  potentialSavings: number;
}

interface WasteTerm {
  term: string;
  adGroup: string;
  campaign?: string;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  wasteReason: string;
  confidence: number;
}

interface NegativeRecommendation {
  keyword: string;
  matchType: 'exact' | 'phrase' | 'broad';
  level: 'campaign' | 'adGroup';
  adGroup?: string;
  estimatedSavings: number;
  confidence: number;
  reason: string;
}

export class SearchTermsAnalyzer {
  private config: WasteConfig;
  
  constructor(config?: Partial<WasteConfig>) {
    this.config = {
      minCostThreshold: 10,
      minImpressionsThreshold: 1000,
      lowCtrThreshold: 0.005, // 0.5%
      confidenceThreshold: 0.8,
      ...config
    };
  }

  /**
   * Parse search terms CSV export from Google Ads
   */
  async parseSearchTermsReport(filePath: string): Promise<SearchTerm[]> {
    logger.info(`Parsing search terms report from ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Search terms file not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // Skip header rows if they exist (Google Ads exports often have metadata)
    const lines = fileContent.split('\n');
    let dataStartIndex = 0;
    
    // Find the header row (contains "Search term")
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (lines[i].includes('Search term') && lines[i].includes('Impressions')) {
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

    const searchTerms: SearchTerm[] = [];
    
    for (const record of records) {
      try {
        // Skip summary rows
        if (record['Search term']?.includes('Total') || 
            record['Search term']?.includes('--')) {
          continue;
        }
        
        const term = SearchTermSchema.parse(record);
        searchTerms.push(term);
      } catch (error) {
        logger.debug(`Skipping invalid row: ${JSON.stringify(record)}`);
      }
    }

    logger.info(`Parsed ${searchTerms.length} valid search terms`);
    return searchTerms;
  }

  /**
   * Analyze search terms for waste
   */
  analyzeWaste(searchTerms: SearchTerm[]): WasteAnalysis {
    logger.info('Starting waste analysis');
    
    const highCostNoConvert: WasteTerm[] = [];
    const lowCtrHighImpressions: WasteTerm[] = [];
    const poorQualityIndicators: WasteTerm[] = [];

    for (const term of searchTerms) {
      const ctr = term.Clicks / term.Impressions;
      
      // High cost, no conversions
      if (term.Cost >= this.config.minCostThreshold && term.Conversions === 0) {
        highCostNoConvert.push({
          term: term['Search term'],
          adGroup: term['Ad group'],
          campaign: term.Campaign,
          cost: term.Cost,
          clicks: term.Clicks,
          impressions: term.Impressions,
          conversions: term.Conversions,
          ctr,
          wasteReason: 'High cost with zero conversions',
          confidence: this.calculateConfidence(term)
        });
      }

      // Low CTR with high impressions
      if (term.Impressions >= this.config.minImpressionsThreshold && 
          ctr < this.config.lowCtrThreshold) {
        lowCtrHighImpressions.push({
          term: term['Search term'],
          adGroup: term['Ad group'],
          campaign: term.Campaign,
          cost: term.Cost,
          clicks: term.Clicks,
          impressions: term.Impressions,
          conversions: term.Conversions,
          ctr,
          wasteReason: `Low CTR (${(ctr * 100).toFixed(2)}%) with high impressions`,
          confidence: this.calculateConfidence(term)
        });
      }

      // Poor quality indicators (high clicks, no conversions)
      if (term.Clicks >= 10 && term.Conversions === 0 && term.Cost >= 5) {
        poorQualityIndicators.push({
          term: term['Search term'],
          adGroup: term['Ad group'],
          campaign: term.Campaign,
          cost: term.Cost,
          clicks: term.Clicks,
          impressions: term.Impressions,
          conversions: term.Conversions,
          ctr,
          wasteReason: 'Multiple clicks without conversions',
          confidence: this.calculateConfidence(term)
        });
      }
    }

    // Generate negative recommendations
    const negativeRecommendations = this.generateNegativeRecommendations(
      highCostNoConvert,
      lowCtrHighImpressions,
      poorQualityIndicators
    );

    // Calculate total waste
    const totalWastedSpend = 
      highCostNoConvert.reduce((sum, t) => sum + t.cost, 0) +
      lowCtrHighImpressions.reduce((sum, t) => sum + t.cost, 0);
    
    const potentialSavings = totalWastedSpend * 0.8; // Conservative 80% savings estimate

    logger.info(`Analysis complete: $${totalWastedSpend.toFixed(2)} in waste identified`);

    return {
      highCostNoConvert,
      lowCtrHighImpressions,
      poorQualityIndicators,
      negativeRecommendations,
      totalWastedSpend,
      potentialSavings
    };
  }

  /**
   * Perform n-gram analysis on search terms
   */
  private analyzeNGrams(terms: string[], n: number): Map<string, number> {
    const ngramCounts = new Map<string, number>();
    
    for (const term of terms) {
      const words = term.toLowerCase().split(/\s+/);
      
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ');
        ngramCounts.set(ngram, (ngramCounts.get(ngram) || 0) + 1);
      }
    }

    return ngramCounts;
  }

  /**
   * Generate negative keyword recommendations
   */
  private generateNegativeRecommendations(
    highCostNoConvert: WasteTerm[],
    lowCtrHighImpressions: WasteTerm[],
    poorQualityIndicators: WasteTerm[]
  ): NegativeRecommendation[] {
    const recommendations: NegativeRecommendation[] = [];
    const processedTerms = new Set<string>();

    // Analyze n-grams for patterns
    const allWasteTerms = [
      ...highCostNoConvert,
      ...lowCtrHighImpressions,
      ...poorQualityIndicators
    ].map(t => t.term);

    // 1-gram (single word) analysis
    const unigrams = this.analyzeNGrams(allWasteTerms, 1);
    // 2-gram analysis
    const bigrams = this.analyzeNGrams(allWasteTerms, 2);
    // 3-gram analysis
    const trigrams = this.analyzeNGrams(allWasteTerms, 3);

    // High-priority exact negatives (high cost, no conversions)
    for (const wasteTerm of highCostNoConvert) {
      if (wasteTerm.confidence >= this.config.confidenceThreshold) {
        recommendations.push({
          keyword: wasteTerm.term,
          matchType: 'exact',
          level: 'adGroup',
          adGroup: wasteTerm.adGroup,
          estimatedSavings: wasteTerm.cost,
          confidence: wasteTerm.confidence,
          reason: wasteTerm.wasteReason
        });
        processedTerms.add(wasteTerm.term);
      }
    }

    // Pattern-based phrase negatives
    for (const [bigram, count] of bigrams.entries()) {
      if (count >= 3 && !processedTerms.has(bigram)) {
        // Check if this bigram appears in waste terms
        const wasteWithBigram = allWasteTerms.filter(t => 
          t.toLowerCase().includes(bigram)
        );
        
        if (wasteWithBigram.length >= 3) {
          const totalWaste = highCostNoConvert
            .filter(t => t.term.toLowerCase().includes(bigram))
            .reduce((sum, t) => sum + t.cost, 0);
          
          if (totalWaste >= 20) {
            recommendations.push({
              keyword: bigram,
              matchType: 'phrase',
              level: 'campaign',
              estimatedSavings: totalWaste * 0.7,
              confidence: Math.min(count / 10, 1),
              reason: `Pattern "${bigram}" appears in ${count} waste terms`
            });
            processedTerms.add(bigram);
          }
        }
      }
    }

    // Common waste indicators (broad negatives)
    const wasteIndicators = [
      'free', 'crack', 'torrent', 'pirate', 'hack',
      'virus', 'malware', 'scam', 'illegal', 'download full'
    ];

    for (const indicator of wasteIndicators) {
      const termsWithIndicator = allWasteTerms.filter(t => 
        t.toLowerCase().includes(indicator)
      );
      
      if (termsWithIndicator.length >= 2) {
        const totalWaste = highCostNoConvert
          .filter(t => t.term.toLowerCase().includes(indicator))
          .reduce((sum, t) => sum + t.cost, 0);
        
        if (totalWaste >= 10) {
          recommendations.push({
            keyword: indicator,
            matchType: 'broad',
            level: 'campaign',
            estimatedSavings: totalWaste * 0.5,
            confidence: 0.9,
            reason: `Known waste indicator: "${indicator}"`
          });
        }
      }
    }

    // Sort by estimated savings
    recommendations.sort((a, b) => b.estimatedSavings - a.estimatedSavings);

    return recommendations;
  }

  /**
   * Calculate confidence score for waste detection
   */
  private calculateConfidence(term: SearchTerm): number {
    let confidence = 0.5; // Base confidence
    
    // Higher cost increases confidence
    if (term.Cost >= 50) confidence += 0.2;
    else if (term.Cost >= 20) confidence += 0.1;
    
    // More clicks without conversions increases confidence
    if (term.Clicks >= 20 && term.Conversions === 0) confidence += 0.2;
    else if (term.Clicks >= 10 && term.Conversions === 0) confidence += 0.1;
    
    // High impressions with low CTR increases confidence
    const ctr = term.Clicks / term.Impressions;
    if (term.Impressions >= 5000 && ctr < 0.005) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Generate waste report in Markdown format
   */
  generateWasteReport(
    analysis: WasteAnalysis,
    product: string,
    date: string
  ): string {
    const report: string[] = [
      `## Waste Analysis - ${product} - ${date}`,
      '',
      `### Summary`,
      `- **Total Wasted Spend**: $${analysis.totalWastedSpend.toFixed(2)}`,
      `- **Potential Monthly Savings**: $${analysis.potentialSavings.toFixed(2)}`,
      `- **High-Cost Zero-Convert Terms**: ${analysis.highCostNoConvert.length}`,
      `- **Low CTR Terms**: ${analysis.lowCtrHighImpressions.length}`,
      `- **Negative Recommendations**: ${analysis.negativeRecommendations.length}`,
      '',
    ];

    // High priority negatives
    if (analysis.highCostNoConvert.length > 0) {
      report.push('### High Priority Negatives (>$50 wasted)');
      report.push('');
      
      const highPriority = analysis.highCostNoConvert
        .filter(t => t.cost >= 50)
        .slice(0, 10);
      
      for (const term of highPriority) {
        report.push(`- **"${term.term}"** - $${term.cost.toFixed(2)} spent, 0 conversions`);
        report.push(`  - Ad Group: ${term.adGroup}`);
        report.push(`  - Clicks: ${term.clicks}, CTR: ${(term.ctr * 100).toFixed(2)}%`);
        report.push('');
      }
    }

    // Ad group specific recommendations
    report.push('### Ad Group Specific Recommendations');
    report.push('');
    
    // Group recommendations by ad group
    const byAdGroup = new Map<string, NegativeRecommendation[]>();
    for (const rec of analysis.negativeRecommendations.filter(r => r.level === 'adGroup')) {
      const group = rec.adGroup || 'Unknown';
      if (!byAdGroup.has(group)) {
        byAdGroup.set(group, []);
      }
      byAdGroup.get(group)!.push(rec);
    }

    for (const [adGroup, recs] of byAdGroup.entries()) {
      report.push(`#### ${adGroup}`);
      for (const rec of recs.slice(0, 5)) {
        report.push(`- Add ${rec.matchType} negative: **[${rec.keyword}]**`);
        report.push(`  - Est. savings: $${rec.estimatedSavings.toFixed(2)}/month`);
        report.push(`  - Reason: ${rec.reason}`);
      }
      report.push('');
    }

    // Campaign-level negatives
    const campaignNegatives = analysis.negativeRecommendations
      .filter(r => r.level === 'campaign')
      .slice(0, 10);
    
    if (campaignNegatives.length > 0) {
      report.push('### Campaign-Level Negative Recommendations');
      report.push('');
      
      for (const rec of campaignNegatives) {
        const matchSymbol = rec.matchType === 'exact' ? '[]' : 
                           rec.matchType === 'phrase' ? '""' : '';
        report.push(`- Add ${rec.matchType} negative: **${matchSymbol}${rec.keyword}${matchSymbol}**`);
        report.push(`  - Est. savings: $${rec.estimatedSavings.toFixed(2)}/month`);
        report.push(`  - Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
        report.push(`  - ${rec.reason}`);
      }
      report.push('');
    }

    // Implementation script
    report.push('### Implementation Script for Google Ads Editor');
    report.push('');
    report.push('```csv');
    report.push('Action,Status,Campaign,Ad group,Keyword,Match type');
    
    // Add exact negatives
    for (const rec of analysis.negativeRecommendations.slice(0, 20)) {
      const campaign = rec.level === 'campaign' ? 'All campaigns' : '';
      const adGroup = rec.adGroup || '';
      report.push(`Add,Active,"${campaign}","${adGroup}","${rec.keyword}",Negative ${rec.matchType}`);
    }
    report.push('```');
    report.push('');

    // Low CTR analysis
    if (analysis.lowCtrHighImpressions.length > 0) {
      report.push('### Low CTR Terms (Consider Pausing)');
      report.push('');
      
      for (const term of analysis.lowCtrHighImpressions.slice(0, 10)) {
        report.push(`- **"${term.term}"** - CTR: ${(term.ctr * 100).toFixed(3)}%`);
        report.push(`  - ${term.impressions.toLocaleString()} impressions, only ${term.clicks} clicks`);
        report.push(`  - Cost: $${term.cost.toFixed(2)}`);
      }
      report.push('');
    }

    return report.join('\n');
  }

  /**
   * Export negative keywords in Google Ads Editor format
   */
  exportNegativesForAdsEditor(
    recommendations: NegativeRecommendation[],
    outputPath: string
  ): void {
    const csvData = recommendations.map(rec => ({
      'Action': 'Add',
      'Status': 'Active', 
      'Campaign': rec.level === 'campaign' ? 'All enabled campaigns' : '',
      'Ad group': rec.adGroup || '',
      'Keyword': rec.keyword,
      'Match type': `Negative ${rec.matchType}`,
      'Max CPC': '',
      'Comment': `Est. savings: $${rec.estimatedSavings.toFixed(2)} - ${rec.reason}`
    }));

    const csv = stringify(csvData, { header: true });
    fs.writeFileSync(outputPath, csv);
    logger.info(`Exported ${recommendations.length} negative keywords to ${outputPath}`);
  }
}

// Export helper function for CLI integration
export async function analyzeSearchTermsWaste(
  inputPath: string,
  product: string,
  outputDir: string
): Promise<WasteAnalysis> {
  const analyzer = new SearchTermsAnalyzer({
    minCostThreshold: 10,
    minImpressionsThreshold: 1000,
    lowCtrThreshold: 0.005
  });

  // Parse search terms
  const searchTerms = await analyzer.parseSearchTermsReport(inputPath);
  
  // Analyze waste
  const analysis = analyzer.analyzeWaste(searchTerms);
  
  // Generate report
  const date = new Date().toISOString().split('T')[0];
  const report = analyzer.generateWasteReport(analysis, product, date);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save report
  const reportPath = path.join(outputDir, 'waste_report.md');
  fs.writeFileSync(reportPath, report);
  logger.info(`Waste report saved to ${reportPath}`);
  
  // Export negatives CSV
  const negativesPath = path.join(outputDir, 'negative_keywords.csv');
  analyzer.exportNegativesForAdsEditor(analysis.negativeRecommendations, negativesPath);
  
  return analysis;
}