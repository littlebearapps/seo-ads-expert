import pino from 'pino';
import { KeywordData, KeywordDataSchema, DataSource } from '../connectors/types.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface DataPrecedenceResult {
  keywords: KeywordData[];
  sourceCounts: {
    kwp: number;
    gsc: number;
    estimated: number;
  };
  mergeStats: {
    totalKeywords: number;
    uniqueKeywords: number;
    duplicatesResolved: number;
    precedenceApplied: number;
  };
  warnings: string[];
}

export interface KeywordSources {
  kwp?: KeywordData[];
  gsc?: KeywordData[];
  estimated?: KeywordData[];
}

export class DataPrecedenceEngine {
  private readonly precedenceOrder: DataSource[] = ['kwp', 'gsc', 'estimated'];
  
  /**
   * Merges keyword data from multiple sources using data precedence logic:
   * 1. KWP CSV data (most authoritative - actual Google data)
   * 2. GSC data (real but proxy - organic performance indicators)  
   * 3. RapidAPI estimated data (least authoritative - third-party estimates)
   */
  mergeKeywordSources(sources: KeywordSources): DataPrecedenceResult {
    const result: DataPrecedenceResult = {
      keywords: [],
      sourceCounts: { kwp: 0, gsc: 0, estimated: 0 },
      mergeStats: {
        totalKeywords: 0,
        uniqueKeywords: 0,
        duplicatesResolved: 0,
        precedenceApplied: 0
      },
      warnings: []
    };

    logger.info('🔄 Starting data precedence merge...');

    // Count source contributions
    const allKeywords = this.flattenSources(sources);
    result.mergeStats.totalKeywords = allKeywords.length;

    // Count by source
    result.sourceCounts.kwp = sources.kwp?.length || 0;
    result.sourceCounts.gsc = sources.gsc?.length || 0;
    result.sourceCounts.estimated = sources.estimated?.length || 0;

    logger.debug('Source counts:', result.sourceCounts);

    // Group keywords by normalized keyword text
    const keywordMap = new Map<string, KeywordData[]>();
    
    for (const keyword of allKeywords) {
      const normalizedKey = this.normalizeKeyword(keyword.keyword);
      
      if (!keywordMap.has(normalizedKey)) {
        keywordMap.set(normalizedKey, []);
      }
      
      keywordMap.get(normalizedKey)!.push(keyword);
    }

    result.mergeStats.uniqueKeywords = keywordMap.size;
    
    logger.info(`📊 Processing ${result.mergeStats.uniqueKeywords} unique keywords from ${result.mergeStats.totalKeywords} total entries`);

    // Apply data precedence to resolve duplicates
    for (const [normalizedKey, duplicates] of keywordMap.entries()) {
      if (duplicates.length === 1) {
        // No duplicates, use as-is
        result.keywords.push(duplicates[0]);
      } else {
        // Multiple sources for same keyword - apply precedence
        const mergedKeyword = this.applyDataPrecedence(duplicates, result.warnings);
        result.keywords.push(mergedKeyword);
        result.mergeStats.duplicatesResolved++;
        result.mergeStats.precedenceApplied++;
        
        logger.debug(`🔀 Merged ${duplicates.length} sources for: ${duplicates[0].keyword}`);
      }
    }

    // Sort by final score (descending) for consistent output
    result.keywords.sort((a, b) => b.final_score - a.final_score);

    logger.info(`✅ Data precedence merge complete: ${result.keywords.length} keywords`);
    logger.info(`📈 Merge stats: ${result.mergeStats.duplicatesResolved} duplicates resolved, ${result.mergeStats.precedenceApplied} precedence rules applied`);

    return result;
  }

  private flattenSources(sources: KeywordSources): KeywordData[] {
    const allKeywords: KeywordData[] = [];
    
    // Add in precedence order to maintain priority during processing
    if (sources.kwp) allKeywords.push(...sources.kwp);
    if (sources.gsc) allKeywords.push(...sources.gsc);
    if (sources.estimated) allKeywords.push(...sources.estimated);
    
    return allKeywords;
  }

  private normalizeKeyword(keyword: string): string {
    return keyword
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '') // Remove quotes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s-]/g, ''); // Keep only alphanumeric, spaces, and hyphens
  }

  /**
   * Applies data precedence rules to merge multiple keyword entries:
   * - Use highest precedence source as base
   * - Fill missing metrics from lower precedence sources
   * - Track data source for each metric
   * - Apply source penalties in scoring
   */
  private applyDataPrecedence(duplicates: KeywordData[], warnings: string[]): KeywordData {
    // Sort by precedence (KWP > GSC > Estimated)
    const sortedByPrecedence = duplicates.sort((a, b) => {
      const aPrecedence = this.precedenceOrder.indexOf(a.data_source);
      const bPrecedence = this.precedenceOrder.indexOf(b.data_source);
      return aPrecedence - bPrecedence;
    });

    // Use highest precedence entry as base
    const baseKeyword = { ...sortedByPrecedence[0] };
    const sourcesUsed = new Set<DataSource>([baseKeyword.data_source]);

    logger.debug(`🏆 Base keyword from ${baseKeyword.data_source}: ${baseKeyword.keyword}`);

    // Fill missing metrics from lower precedence sources
    for (let i = 1; i < sortedByPrecedence.length; i++) {
      const candidate = sortedByPrecedence[i];
      let metricsFilled = 0;

      // Fill volume if missing
      if (!baseKeyword.volume && candidate.volume) {
        baseKeyword.volume = candidate.volume;
        sourcesUsed.add(candidate.data_source);
        metricsFilled++;
        logger.debug(`📊 Filled volume from ${candidate.data_source}: ${candidate.volume}`);
      }

      // Fill CPC if missing
      if (!baseKeyword.cpc && candidate.cpc) {
        baseKeyword.cpc = candidate.cpc;
        sourcesUsed.add(candidate.data_source);
        metricsFilled++;
        logger.debug(`💰 Filled CPC from ${candidate.data_source}: $${candidate.cpc}`);
      }

      // Fill competition if missing
      if (!baseKeyword.competition && candidate.competition) {
        baseKeyword.competition = candidate.competition;
        sourcesUsed.add(candidate.data_source);
        metricsFilled++;
        logger.debug(`⚔️ Filled competition from ${candidate.data_source}: ${candidate.competition}`);
      }

      // Merge markets
      if (candidate.markets && candidate.markets.length > 0) {
        const uniqueMarkets = new Set([...baseKeyword.markets, ...candidate.markets]);
        baseKeyword.markets = Array.from(uniqueMarkets);
      }

      // Merge SERP features
      if (candidate.serp_features && candidate.serp_features.length > 0) {
        const uniqueFeatures = new Set([...baseKeyword.serp_features, ...candidate.serp_features]);
        baseKeyword.serp_features = Array.from(uniqueFeatures);
      }

      if (metricsFilled > 0) {
        logger.debug(`✅ Filled ${metricsFilled} metrics from ${candidate.data_source}`);
      }
    }

    // Update data source to reflect mixed sources if applicable
    if (sourcesUsed.size > 1) {
      // If we used multiple sources, mark as mixed but prioritize the base source
      const sourceArray = Array.from(sourcesUsed);
      logger.debug(`🔀 Mixed sources used: ${sourceArray.join(', ')}`);
      
      // Keep the primary source but note mixed origins
      // The scoring system will apply appropriate penalties based on primary source
    }

    // Validate the merged result
    try {
      return KeywordDataSchema.parse(baseKeyword);
    } catch (error) {
      warnings.push(`Data precedence merge failed for keyword: ${baseKeyword.keyword}`);
      logger.warn(`⚠️ Invalid merged keyword data: ${baseKeyword.keyword}`, error);
      return sortedByPrecedence[0]; // Fallback to original highest precedence entry
    }
  }

  /**
   * Calculates source quality penalty for scoring
   * KWP = 0 (no penalty, most reliable)
   * GSC = 0.05 (small penalty, real but proxy data)  
   * Estimated = 0.10 (penalty for third-party estimates)
   */
  calculateSourcePenalty(dataSource: DataSource): number {
    const penalties: Record<DataSource, number> = {
      'kwp': 0.00,      // No penalty - authoritative Google data
      'gsc': 0.05,      // Small penalty - real but proxy data
      'estimated': 0.10  // Penalty - third-party estimates
    };

    return penalties[dataSource] || 0.10;
  }

  /**
   * Determines data quality score based on source and completeness
   */
  calculateDataQuality(keyword: KeywordData): number {
    let qualityScore = 1.0;

    // Source quality (inverse of penalty)
    const sourcePenalty = this.calculateSourcePenalty(keyword.data_source);
    qualityScore -= sourcePenalty;

    // Completeness bonus
    let completenessScore = 0;
    if (keyword.volume !== undefined) completenessScore += 0.25;
    if (keyword.cpc !== undefined) completenessScore += 0.25;
    if (keyword.competition !== undefined) completenessScore += 0.25;
    if (keyword.markets.length > 0) completenessScore += 0.25;

    qualityScore *= completenessScore;

    return Math.max(0, Math.min(1, qualityScore));
  }

  /**
   * Generates a data precedence report for debugging
   */
  generatePrecedenceReport(result: DataPrecedenceResult): string {
    const total = result.mergeStats.totalKeywords;
    const unique = result.mergeStats.uniqueKeywords;
    const duplicates = result.mergeStats.duplicatesResolved;
    
    return `
📊 Data Precedence Report
========================
Total Keywords Processed: ${total}
Unique Keywords: ${unique}
Duplicates Resolved: ${duplicates}

📈 Source Distribution:
- KWP (Authoritative): ${result.sourceCounts.kwp} (${((result.sourceCounts.kwp/total)*100).toFixed(1)}%)
- GSC (Real Proxy): ${result.sourceCounts.gsc} (${((result.sourceCounts.gsc/total)*100).toFixed(1)}%)
- Estimated (3rd Party): ${result.sourceCounts.estimated} (${((result.sourceCounts.estimated/total)*100).toFixed(1)}%)

🔄 Merge Efficiency: ${((unique/total)*100).toFixed(1)}% (${total - unique} duplicates eliminated)

${result.warnings.length > 0 ? `\n⚠️ Warnings:\n${result.warnings.map(w => `- ${w}`).join('\n')}` : ''}
`.trim();
  }
}