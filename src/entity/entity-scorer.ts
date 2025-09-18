/**
 * Entity Scorer - v1.8
 * Calculates importance scores for entities using multiple signals
 */

import pino from 'pino';
import { Entity, Cluster } from './types.js';

const logger = pino({ name: 'entity-scorer' });

export class EntityScorer {
  /**
   * Calculate comprehensive importance score for an entity
   */
  calculateImportance(entity: Entity, cluster?: Cluster): number {
    const serpFrequency = 0.5 * this.calculateSERPFrequencyScore(entity);
    const queryVolume = 0.3 * this.calculateQueryVolumeScore(entity, cluster);
    const intentBoost = 0.2 * this.calculateIntentBoost(entity, cluster);

    const baseScore = serpFrequency + queryVolume + intentBoost;
    const adjustedScore = this.applyQualityAdjustments(baseScore, entity);

    return Math.min(1, Math.max(0, adjustedScore));
  }

  /**
   * Score entities by their frequency in SERP results
   */
  private calculateSERPFrequencyScore(entity: Entity): number {
    // Normalize frequency based on source diversity and position
    const serpSources = entity.sources.filter(s => s.type === 'serp');

    if (serpSources.length === 0) {
      return 0;
    }

    // Weight by position in SERP (higher positions = more important)
    const positionWeight = serpSources.reduce((sum, source) => {
      const position = source.position || 10;
      return sum + Math.max(0, (11 - position) / 10); // Top position gets 1.0, position 10 gets 0.1
    }, 0) / serpSources.length;

    // Frequency normalization (log scale to prevent outliers)
    const frequencyScore = Math.min(1, Math.log(entity.frequency + 1) / Math.log(20));

    return positionWeight * frequencyScore;
  }

  /**
   * Score entities by their association with high-volume queries
   */
  private calculateQueryVolumeScore(entity: Entity, cluster?: Cluster): number {
    if (!cluster) {
      return 0.5; // Default score when no cluster data available
    }

    // Check if entity appears in high-volume keywords
    const relevantKeywords = cluster.keywords.filter(keyword =>
      this.entityMatchesKeyword(entity, keyword)
    );

    if (relevantKeywords.length === 0) {
      return 0.1; // Low score for entities not found in target keywords
    }

    // Calculate weighted score based on keyword volume
    const volumeScore = Math.min(1, cluster.volume / 10000); // Normalize to 10k max volume
    const matchRatio = relevantKeywords.length / cluster.keywords.length;

    return volumeScore * matchRatio;
  }

  /**
   * Apply intent-based boost for commercial entities
   */
  private calculateIntentBoost(entity: Entity, cluster?: Cluster): number {
    let boost = 0;

    // Commercial intent indicators
    const commercialTerms = [
      'free', 'online', 'tool', 'converter', 'app', 'software', 'download',
      'website', 'service', 'platform', 'solution'
    ];

    // Action/functional terms
    const actionTerms = [
      'convert', 'change', 'transform', 'edit', 'create', 'generate',
      'compress', 'optimize', 'enhance', 'modify', 'process'
    ];

    // Feature/benefit terms
    const featureTerms = [
      'fast', 'easy', 'simple', 'secure', 'private', 'offline', 'batch',
      'quality', 'lossless', 'automatic', 'instant', 'unlimited'
    ];

    // Format/file type terms
    const formatTerms = [
      'pdf', 'jpg', 'png', 'webp', 'gif', 'svg', 'mp4', 'avi',
      'mp3', 'wav', 'docx', 'xlsx', 'pptx', 'zip', 'rar'
    ];

    const entityText = entity.canonical.toLowerCase();

    if (commercialTerms.some(term => entityText.includes(term))) {
      boost += 0.4;
    }

    if (actionTerms.some(term => entityText.includes(term))) {
      boost += 0.3;
    }

    if (featureTerms.some(term => entityText.includes(term))) {
      boost += 0.2;
    }

    if (formatTerms.some(term => entityText.includes(term))) {
      boost += 0.3;
    }

    // Cluster intent alignment
    if (cluster?.intent === 'commercial' || cluster?.intent === 'transactional') {
      boost *= 1.2; // 20% boost for commercial clusters
    }

    return Math.min(1, boost);
  }

  /**
   * Apply quality adjustments to base score
   */
  private applyQualityAdjustments(baseScore: number, entity: Entity): number {
    let adjustedScore = baseScore;

    // Penalize very short entities (likely noise)
    if (entity.canonical.length < 4) {
      adjustedScore *= 0.7;
    }

    // Penalize entities with very few variants (may be too specific)
    if (entity.variants.length < 2) {
      adjustedScore *= 0.8;
    }

    // Boost entities with high source diversity
    const sourceTypes = new Set(entity.sources.map(s => s.type));
    if (sourceTypes.size >= 3) {
      adjustedScore *= 1.1;
    }

    // Boost entities with high confidence
    if (entity.confidence > 0.8) {
      adjustedScore *= 1.05;
    }

    // Penalize entities with low confidence
    if (entity.confidence < 0.3) {
      adjustedScore *= 0.9;
    }

    // Boost compound entities (likely more specific and valuable)
    if (entity.canonical.includes(' ') || entity.canonical.includes('-')) {
      adjustedScore *= 1.1;
    }

    return adjustedScore;
  }

  /**
   * Check if entity matches a keyword
   */
  private entityMatchesKeyword(entity: Entity, keyword: string): boolean {
    const keywordLower = keyword.toLowerCase();
    const entityLower = entity.canonical.toLowerCase();

    // Direct match
    if (keywordLower.includes(entityLower) || entityLower.includes(keywordLower)) {
      return true;
    }

    // Variant matches
    return entity.variants.some(variant =>
      keywordLower.includes(variant.toLowerCase()) ||
      variant.toLowerCase().includes(keywordLower)
    );
  }

  /**
   * Score entity coverage on a page
   */
  calculatePageCoverage(pageEntities: string[], requiredEntities: Entity[]): number {
    if (requiredEntities.length === 0) {
      return 1.0; // Perfect score if no entities required
    }

    const pageEntitiesLower = pageEntities.map(e => e.toLowerCase());
    let totalWeight = 0;
    let coveredWeight = 0;

    for (const entity of requiredEntities) {
      const weight = entity.importance;
      totalWeight += weight;

      // Check if entity or its variants are present on page
      const isPresent = pageEntitiesLower.some(pageEntity =>
        pageEntity === entity.canonical.toLowerCase() ||
        entity.variants.some(variant =>
          variant.toLowerCase() === pageEntity ||
          pageEntity.includes(variant.toLowerCase()) ||
          variant.toLowerCase().includes(pageEntity)
        )
      );

      if (isPresent) {
        coveredWeight += weight;
      }
    }

    return totalWeight > 0 ? coveredWeight / totalWeight : 0;
  }

  /**
   * Calculate entity density score for a page
   */
  calculateEntityDensity(
    pageContent: string,
    entities: Entity[],
    optimalDensity: number = 0.02 // 2% optimal density
  ): number {
    const words = pageContent.toLowerCase().split(/\s+/).length;
    let entityMentions = 0;

    for (const entity of entities) {
      const mentions = this.countEntityMentions(pageContent, entity);
      entityMentions += mentions * entity.importance; // Weight by importance
    }

    const actualDensity = entityMentions / words;

    // Score based on how close to optimal density
    if (actualDensity <= optimalDensity) {
      return actualDensity / optimalDensity; // 0-1 scale below optimal
    } else {
      // Penalize over-optimization
      return Math.max(0, 1 - (actualDensity - optimalDensity) / optimalDensity);
    }
  }

  /**
   * Count entity mentions in text
   */
  private countEntityMentions(text: string, entity: Entity): number {
    const textLower = text.toLowerCase();
    let count = 0;

    // Count canonical form
    const canonicalRegex = new RegExp(`\\b${this.escapeRegex(entity.canonical)}\\b`, 'gi');
    count += (textLower.match(canonicalRegex) || []).length;

    // Count variants
    for (const variant of entity.variants) {
      if (variant !== entity.canonical) {
        const variantRegex = new RegExp(`\\b${this.escapeRegex(variant)}\\b`, 'gi');
        count += (textLower.match(variantRegex) || []).length;
      }
    }

    return count;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate scoring report for debugging
   */
  generateScoringReport(entity: Entity, cluster?: Cluster): object {
    const serpScore = this.calculateSERPFrequencyScore(entity);
    const volumeScore = this.calculateQueryVolumeScore(entity, cluster);
    const intentScore = this.calculateIntentBoost(entity, cluster);
    const baseScore = 0.5 * serpScore + 0.3 * volumeScore + 0.2 * intentScore;
    const finalScore = this.applyQualityAdjustments(baseScore, entity);

    return {
      entity: entity.canonical,
      scores: {
        serp_frequency: serpScore,
        query_volume: volumeScore,
        intent_boost: intentScore,
        base_score: baseScore,
        final_score: finalScore
      },
      factors: {
        frequency: entity.frequency,
        confidence: entity.confidence,
        source_count: entity.sources.length,
        variant_count: entity.variants.length,
        character_length: entity.canonical.length
      },
      cluster_info: cluster ? {
        name: cluster.name,
        volume: cluster.volume,
        intent: cluster.intent,
        keyword_count: cluster.keywords.length
      } : null
    };
  }
}