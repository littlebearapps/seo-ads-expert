import pino from 'pino';
import { KeywordData } from './connectors/types.js';
import { DataPrecedenceEngine } from './utils/precedence.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface ScoringWeights {
  volume: number;
  intent: number;
  longtailBonus: number;
  competition: number;
  serpBlockers: number;
  sourcePenalty: number;
}

export interface IntentKeywords {
  highest: string[];      // 2.3x multiplier - "chrome extension", "install", "download"
  high: string[];         // 2.0x multiplier - "convert", "free chrome", "browser extension" 
  medium: string[];       // 1.5x multiplier - "free", "online", "browser"
  baseline: string[];     // 1.0x multiplier - all others
}

export interface ScoringResult {
  keywords: KeywordData[];
  scoringStats: {
    totalKeywords: number;
    averageScore: number;
    topKeywords: KeywordData[];
    intentDistribution: {
      highest: number;
      high: number;
      medium: number;
      baseline: number;
    };
    sourceDistribution: {
      kwp: number;
      gsc: number;
      estimated: number;
    };
  };
  warnings: string[];
}

export class KeywordScoringEngine {
  private readonly precedenceEngine: DataPrecedenceEngine;
  private readonly defaultWeights: ScoringWeights = {
    volume: 0.35,
    intent: 0.25,
    longtailBonus: 0.15,
    competition: -0.15,      // Negative because higher competition is bad
    serpBlockers: -0.10,     // Negative because SERP features reduce opportunity
    sourcePenalty: -0.10     // Negative because estimated data is less reliable
  };

  // GPT-5 Enhanced Intent Keywords for Chrome Extensions
  private readonly intentKeywords: IntentKeywords = {
    highest: [
      // Direct Chrome extension intent (2.3x)
      'chrome extension', 'browser extension', 'chrome addon', 'chrome plugin',
      'install chrome', 'download chrome', 'chrome store', 'web store',
      'chrome web store', 'browser addon', 'extension download', 'chrome app'
    ],
    high: [
      // Strong conversion intent (2.0x)
      'convert', 'converter', 'free chrome', 'chrome tool', 'browser tool',
      'online converter', 'web converter', 'file converter', 'image converter',
      'pdf converter', 'color picker', 'note taking', 'productivity chrome'
    ],
    medium: [
      // Moderate intent (1.5x)
      'free', 'online', 'browser', 'web', 'tool', 'utility',
      'fast', 'easy', 'simple', 'quick', 'instant',
      'local', 'offline', 'privacy', 'secure'
    ],
    baseline: [
      // Standard/baseline intent (1.0x) - catch all
    ]
  };

  constructor() {
    this.precedenceEngine = new DataPrecedenceEngine();
  }

  scoreKeywords(keywords: KeywordData[], customWeights?: Partial<ScoringWeights>): ScoringResult {
    const weights = { ...this.defaultWeights, ...customWeights };
    
    logger.info(`🎯 Starting keyword scoring for ${keywords.length} keywords`);
    
    const result: ScoringResult = {
      keywords: [],
      scoringStats: {
        totalKeywords: keywords.length,
        averageScore: 0,
        topKeywords: [],
        intentDistribution: { highest: 0, high: 0, medium: 0, baseline: 0 },
        sourceDistribution: { kwp: 0, gsc: 0, estimated: 0 }
      },
      warnings: []
    };

    if (keywords.length === 0) {
      result.warnings.push('No keywords provided for scoring');
      return result;
    }

    // Score each keyword
    const scoredKeywords: KeywordData[] = [];
    let totalScore = 0;

    for (const keyword of keywords) {
      try {
        const scoredKeyword = this.scoreIndividualKeyword({ ...keyword }, weights);
        scoredKeywords.push(scoredKeyword);
        totalScore += scoredKeyword.final_score;

        // Update statistics
        this.updateIntentDistribution(scoredKeyword, result.scoringStats.intentDistribution);
        this.updateSourceDistribution(scoredKeyword, result.scoringStats.sourceDistribution);

      } catch (error) {
        const errorMsg = `Failed to score keyword "${keyword.keyword}": ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.warnings.push(errorMsg);
        logger.warn(`⚠️  ${errorMsg}`);
      }
    }

    // Sort by final score (descending)
    scoredKeywords.sort((a, b) => b.final_score - a.final_score);

    // Calculate statistics
    result.keywords = scoredKeywords;
    result.scoringStats.averageScore = totalScore / scoredKeywords.length;
    result.scoringStats.topKeywords = scoredKeywords.slice(0, 10); // Top 10

    logger.info(`✅ Keyword scoring complete: ${scoredKeywords.length} keywords scored`);
    logger.info(`📊 Average score: ${result.scoringStats.averageScore.toFixed(3)}`);
    logger.info(`🏆 Top keyword: "${result.scoringStats.topKeywords[0]?.keyword}" (${result.scoringStats.topKeywords[0]?.final_score.toFixed(3)})`);

    return result;
  }

  private scoreIndividualKeyword(keyword: KeywordData, weights: ScoringWeights): KeywordData {
    let score = 0;
    
    // 1. Volume Score (35% weight)
    const volumeScore = this.calculateVolumeScore(keyword.volume);
    const volumeContribution = weights.volume * volumeScore;
    score += volumeContribution;

    // 2. Intent Score (25% weight)
    const intentScore = this.calculateIntentScore(keyword.keyword);
    keyword.intent_score = intentScore;
    const intentContribution = weights.intent * intentScore;
    score += intentContribution;

    // 3. Long-tail Bonus (15% weight)
    const longtailBonus = this.calculateLongtailBonus(keyword.keyword);
    const longtailContribution = weights.longtailBonus * longtailBonus;
    score += longtailContribution;

    // 4. Competition Penalty (-15% weight)
    const competitionPenalty = this.calculateCompetitionPenalty(keyword.competition);
    const competitionContribution = weights.competition * competitionPenalty;
    score += competitionContribution;

    // 5. SERP Blockers Penalty (-10% weight)
    const serpBlockersPenalty = this.calculateSerpBlockersPenalty(keyword.serp_features);
    const serpBlockersContribution = weights.serpBlockers * serpBlockersPenalty;
    score += serpBlockersContribution;

    // 6. Source Penalty (-10% weight)
    const sourcePenalty = this.precedenceEngine.calculateSourcePenalty(keyword.data_source);
    const sourcePenaltyContribution = weights.sourcePenalty * sourcePenalty;
    score += sourcePenaltyContribution;

    // Normalize final score to 0-1 range
    keyword.final_score = Math.max(0, Math.min(1, score));

    logger.debug(`🔢 Scored "${keyword.keyword}": ${keyword.final_score.toFixed(3)} (vol:${volumeScore.toFixed(2)}, intent:${intentScore.toFixed(2)}, comp:${competitionPenalty.toFixed(2)})`);

    return keyword;
  }

  private calculateVolumeScore(volume?: number): number {
    if (!volume || volume <= 0) return 0;

    // Logarithmic scaling for volume (handles wide range of search volumes)
    // 10 searches = 0.1, 100 = 0.2, 1000 = 0.3, 10000 = 0.4, 100000+ = 0.5+
    const logVolume = Math.log10(Math.max(1, volume));
    return Math.min(1, logVolume / 10); // Cap at 1.0
  }

  private calculateIntentScore(keyword: string): number {
    const keywordLower = keyword.toLowerCase();

    // Check highest intent keywords first (2.3x multiplier)
    for (const intentKeyword of this.intentKeywords.highest) {
      if (keywordLower.includes(intentKeyword.toLowerCase())) {
        return 2.3;
      }
    }

    // Check high intent keywords (2.0x multiplier)
    for (const intentKeyword of this.intentKeywords.high) {
      if (keywordLower.includes(intentKeyword.toLowerCase())) {
        return 2.0;
      }
    }

    // Check medium intent keywords (1.5x multiplier)
    for (const intentKeyword of this.intentKeywords.medium) {
      if (keywordLower.includes(intentKeyword.toLowerCase())) {
        return 1.5;
      }
    }

    // Baseline intent (1.0x multiplier)
    return 1.0;
  }

  private calculateLongtailBonus(keyword: string): number {
    const wordCount = keyword.trim().split(/\s+/).length;
    
    // Long-tail bonus for 3+ word keywords
    if (wordCount >= 5) return 0.4;  // 4+ words = higher bonus
    if (wordCount >= 4) return 0.3;  // 4 words = good bonus
    if (wordCount >= 3) return 0.2;  // 3 words = small bonus
    
    return 0; // 1-2 words = no bonus
  }

  private calculateCompetitionPenalty(competition?: number): number {
    if (!competition) return 0; // No data = no penalty

    // Convert competition (0-1) to penalty
    // High competition (0.8-1.0) = high penalty
    // Medium competition (0.4-0.8) = medium penalty  
    // Low competition (0-0.4) = low penalty
    return competition; // Direct mapping: 0 = no penalty, 1 = max penalty
  }

  private calculateSerpBlockersPenalty(serpFeatures: string[] = []): number {
    if (serpFeatures.length === 0) return 0;

    let penalty = 0;
    
    // Individual SERP feature penalties
    const featurePenalties: Record<string, number> = {
      'ai_overview': 0.4,        // AI Overview blocks significant real estate
      'featured_snippet': 0.3,   // Featured snippet takes top position
      'people_also_ask': 0.2,    // PAA boxes push down results
      'shopping_results': 0.25,  // Shopping results compete for clicks
      'video_results': 0.2,      // Video carousel competes for attention
      'local_pack': 0.3,         // Local pack dominates for location queries
      'knowledge_panel': 0.15    // Knowledge panel on right side (less blocking)
    };

    // Calculate cumulative penalty (with diminishing returns)
    for (const feature of serpFeatures) {
      const featurePenalty = featurePenalties[feature] || 0;
      penalty += featurePenalty * (1 - penalty * 0.5); // Diminishing returns
    }

    return Math.min(1, penalty); // Cap at 1.0
  }

  private updateIntentDistribution(keyword: KeywordData, distribution: ScoringResult['scoringStats']['intentDistribution']): void {
    const intentScore = keyword.intent_score;
    
    if (intentScore >= 2.3) distribution.highest++;
    else if (intentScore >= 2.0) distribution.high++;
    else if (intentScore >= 1.5) distribution.medium++;
    else distribution.baseline++;
  }

  private updateSourceDistribution(keyword: KeywordData, distribution: ScoringResult['scoringStats']['sourceDistribution']): void {
    distribution[keyword.data_source]++;
  }

  /**
   * Generates a detailed scoring report for analysis
   */
  generateScoringReport(result: ScoringResult): string {
    const stats = result.scoringStats;
    const total = stats.totalKeywords;
    
    return `
🎯 Keyword Scoring Report
========================
Total Keywords: ${total}
Average Score: ${stats.averageScore.toFixed(3)}

📊 Intent Distribution:
- Highest (2.3x): ${stats.intentDistribution.highest} (${((stats.intentDistribution.highest/total)*100).toFixed(1)}%)
- High (2.0x): ${stats.intentDistribution.high} (${((stats.intentDistribution.high/total)*100).toFixed(1)}%)
- Medium (1.5x): ${stats.intentDistribution.medium} (${((stats.intentDistribution.medium/total)*100).toFixed(1)}%)
- Baseline (1.0x): ${stats.intentDistribution.baseline} (${((stats.intentDistribution.baseline/total)*100).toFixed(1)}%)

📈 Data Sources:
- KWP: ${stats.sourceDistribution.kwp} (${((stats.sourceDistribution.kwp/total)*100).toFixed(1)}%)
- GSC: ${stats.sourceDistribution.gsc} (${((stats.sourceDistribution.gsc/total)*100).toFixed(1)}%)
- Estimated: ${stats.sourceDistribution.estimated} (${((stats.sourceDistribution.estimated/total)*100).toFixed(1)}%)

🏆 Top 5 Keywords:
${stats.topKeywords.slice(0, 5).map((k, i) => 
  `${i + 1}. ${k.keyword} (${k.final_score.toFixed(3)}) - ${k.data_source.toUpperCase()}`
).join('\n')}

${result.warnings.length > 0 ? `\n⚠️ Warnings:\n${result.warnings.map(w => `- ${w}`).join('\n')}` : ''}
`.trim();
  }

  /**
   * Recommends match types based on keyword characteristics
   */
  recommendMatchType(keyword: KeywordData): 'exact' | 'phrase' | 'broad' {
    const wordCount = keyword.keyword.split(/\s+/).length;
    const intentScore = keyword.intent_score;
    const competition = keyword.competition || 0.5;

    // High intent + specific keywords = exact match
    if (intentScore >= 2.0 && wordCount >= 3) {
      return 'exact';
    }

    // Medium intent + some specificity = phrase match  
    if (intentScore >= 1.5 || wordCount >= 2) {
      return 'phrase';
    }

    // Low intent or very broad = broad match (with caution)
    if (competition <= 0.4) {
      return 'broad';
    }

    // Default to phrase match (safest option)
    return 'phrase';
  }
}