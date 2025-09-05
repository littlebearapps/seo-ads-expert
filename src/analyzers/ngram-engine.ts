/**
 * N-gram Analysis Engine - v1.4
 * Identifies wasted spend through n-gram pattern analysis
 */

import { logger } from '../utils/logger.js';
import type { SearchTermData } from '../connectors/google-ads-performance.js';

export interface NgramStats {
  ngram: string;
  count: number;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
  avgCtr: number;
  avgCpc: number;
  conversionRate: number;
  searchTerms: string[];
}

export interface WastedTerm {
  ngram: string;
  wasteAmount: number;
  wasteReason: 'zero_conversions' | 'low_ctr' | 'high_cost_no_value';
  impressions: number;
  clicks: number;
  searchTermExamples: string[];
  recommendedAction: 'negative_keyword' | 'monitor' | 'optimize';
  placementLevel: 'shared' | 'campaign' | 'ad_group';
}

export interface NegativeKeyword {
  keyword: string;
  matchType: 'EXACT' | 'PHRASE' | 'BROAD';
  placementLevel: 'shared' | 'campaign' | 'ad_group';
  reason: string;
  wasteAmount: number;
  confidence: number;
}

export class NgramEngine {
  private readonly stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'that'
  ]);
  
  private readonly minNgramLength = 2;
  private readonly maxNgramLength = 4;
  private readonly minImpressionsThreshold = 100;
  private readonly minSpendThreshold = 10;
  private readonly lowCtrThreshold = 0.005; // 0.5%

  /**
   * Extract n-grams from search terms with statistics
   */
  extractNgrams(searchTerms: SearchTermData[], n: number): Map<string, NgramStats> {
    const ngramMap = new Map<string, NgramStats>();

    for (const term of searchTerms) {
      const tokens = this.tokenize(term.query);
      const ngrams = this.generateNgrams(tokens, n);

      for (const ngram of ngrams) {
        if (!ngramMap.has(ngram)) {
          ngramMap.set(ngram, {
            ngram,
            count: 0,
            impressions: 0,
            clicks: 0,
            cost: 0,
            conversions: 0,
            conversionValue: 0,
            avgCtr: 0,
            avgCpc: 0,
            conversionRate: 0,
            searchTerms: []
          });
        }

        const stats = ngramMap.get(ngram)!;
        stats.count++;
        stats.impressions += term.impressions;
        stats.clicks += term.clicks;
        stats.cost += term.cost;
        stats.conversions += term.conversions;
        stats.conversionValue += term.conversionValue;
        
        if (!stats.searchTerms.includes(term.query)) {
          stats.searchTerms.push(term.query);
        }
      }
    }

    // Calculate averages
    for (const stats of ngramMap.values()) {
      stats.avgCtr = stats.impressions > 0 ? stats.clicks / stats.impressions : 0;
      stats.avgCpc = stats.clicks > 0 ? stats.cost / stats.clicks : 0;
      stats.conversionRate = stats.clicks > 0 ? stats.conversions / stats.clicks : 0;
    }

    return ngramMap;
  }

  /**
   * Identify wasted spend from n-gram analysis
   */
  identifyWastedSpend(searchTerms: SearchTermData[]): WastedTerm[] {
    const wastedTerms: WastedTerm[] = [];
    
    // Analyze different n-gram sizes
    for (let n = this.minNgramLength; n <= this.maxNgramLength; n++) {
      const ngrams = this.extractNgrams(searchTerms, n);
      
      for (const [ngram, stats] of ngrams.entries()) {
        // Skip if below threshold
        if (stats.impressions < this.minImpressionsThreshold) continue;
        
        // Check for waste conditions
        let wasteReason: WastedTerm['wasteReason'] | null = null;
        let wasteAmount = 0;
        
        // Zero conversions with significant spend
        if (stats.conversions === 0 && stats.cost >= this.minSpendThreshold) {
          wasteReason = 'zero_conversions';
          wasteAmount = stats.cost;
        }
        // Low CTR with high impressions
        else if (stats.avgCtr < this.lowCtrThreshold && stats.impressions >= 1000) {
          wasteReason = 'low_ctr';
          wasteAmount = stats.cost;
        }
        // High cost with no value
        else if (stats.cost > 50 && stats.conversionValue < stats.cost * 0.5) {
          wasteReason = 'high_cost_no_value';
          wasteAmount = stats.cost - stats.conversionValue;
        }
        
        if (wasteReason && wasteAmount > 0) {
          wastedTerms.push({
            ngram,
            wasteAmount,
            wasteReason,
            impressions: stats.impressions,
            clicks: stats.clicks,
            searchTermExamples: stats.searchTerms.slice(0, 5),
            recommendedAction: this.determineAction(stats, wasteReason),
            placementLevel: this.determinePlacementLevel(ngram, stats)
          });
        }
      }
    }
    
    // Sort by waste amount descending
    return wastedTerms.sort((a, b) => b.wasteAmount - a.wasteAmount);
  }

  /**
   * Generate negative keyword recommendations
   */
  generateNegatives(wastedTerms: WastedTerm[]): NegativeKeyword[] {
    const negatives: NegativeKeyword[] = [];
    const processedKeywords = new Set<string>();
    
    for (const term of wastedTerms) {
      if (term.recommendedAction !== 'negative_keyword') continue;
      
      // Avoid duplicates
      const keywordKey = `${term.ngram}_${term.placementLevel}`;
      if (processedKeywords.has(keywordKey)) continue;
      processedKeywords.add(keywordKey);
      
      // Determine match type based on n-gram characteristics
      const matchType = this.determineMatchType(term);
      
      negatives.push({
        keyword: term.ngram,
        matchType,
        placementLevel: term.placementLevel,
        reason: this.generateReason(term),
        wasteAmount: term.wasteAmount,
        confidence: this.calculateConfidence(term)
      });
    }
    
    return negatives;
  }

  /**
   * Tokenize search query for n-gram generation
   */
  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => 
        token.length > 1 && 
        !this.stopWords.has(token)
      );
  }

  /**
   * Generate n-grams from tokens
   */
  private generateNgrams(tokens: string[], n: number): string[] {
    const ngrams: string[] = [];
    
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join(' ');
      ngrams.push(ngram);
    }
    
    return ngrams;
  }

  /**
   * Determine recommended action for wasted term
   */
  private determineAction(
    stats: NgramStats, 
    wasteReason: WastedTerm['wasteReason']
  ): WastedTerm['recommendedAction'] {
    // High confidence negative keyword
    if (wasteReason === 'zero_conversions' && stats.clicks >= 10) {
      return 'negative_keyword';
    }
    
    // Monitor low CTR terms before blocking
    if (wasteReason === 'low_ctr' && stats.impressions < 5000) {
      return 'monitor';
    }
    
    // Try optimization for high-cost terms
    if (wasteReason === 'high_cost_no_value' && stats.conversions > 0) {
      return 'optimize';
    }
    
    return 'negative_keyword';
  }

  /**
   * Determine placement level for negative keyword
   */
  private determinePlacementLevel(
    ngram: string, 
    stats: NgramStats
  ): WastedTerm['placementLevel'] {
    // Non-intent words go to shared list
    const nonIntentWords = ['free', 'cheap', 'tutorial', 'guide', 'how to', 'job', 'jobs', 'career'];
    if (nonIntentWords.some(word => ngram.includes(word))) {
      return 'shared';
    }
    
    // Platform/competitor terms at campaign level
    const platformWords = ['firefox', 'safari', 'edge', 'opera', 'android', 'ios'];
    if (platformWords.some(word => ngram.includes(word))) {
      return 'campaign';
    }
    
    // Specific mismatches at ad group level
    return 'ad_group';
  }

  /**
   * Determine match type for negative keyword
   */
  private determineMatchType(term: WastedTerm): NegativeKeyword['matchType'] {
    const ngramWords = term.ngram.split(' ').length;
    
    // Single words or very specific phrases use EXACT
    if (ngramWords === 1 || term.searchTermExamples.length <= 2) {
      return 'EXACT';
    }
    
    // Multi-word phrases typically use PHRASE
    if (ngramWords >= 2) {
      return 'PHRASE';
    }
    
    // Broad for general patterns (rare)
    return 'BROAD';
  }

  /**
   * Generate human-readable reason for negative keyword
   */
  private generateReason(term: WastedTerm): string {
    switch (term.wasteReason) {
      case 'zero_conversions':
        return `No conversions from ${term.clicks} clicks ($${term.wasteAmount.toFixed(2)} waste)`;
      case 'low_ctr':
        return `CTR below 0.5% with ${term.impressions} impressions`;
      case 'high_cost_no_value':
        return `High cost with low conversion value ($${term.wasteAmount.toFixed(2)} loss)`;
      default:
        return `Identified as wasted spend ($${term.wasteAmount.toFixed(2)})`;
    }
  }

  /**
   * Calculate confidence score for negative keyword recommendation
   */
  private calculateConfidence(term: WastedTerm): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence with more data
    if (term.impressions >= 1000) confidence += 0.2;
    if (term.clicks >= 50) confidence += 0.2;
    
    // Adjust by waste reason
    if (term.wasteReason === 'zero_conversions' && term.clicks >= 20) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }
}