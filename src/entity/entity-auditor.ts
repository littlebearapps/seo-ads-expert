/**
 * Entity Auditor - v1.8
 * Extracts entities from multiple sources and performs coverage analysis
 */

import pino from 'pino';
import {
  Entity,
  EntitySource,
  PageSnapshot,
  Cluster,
  ExtractorConfig,
  EntityExtractionError,
  ValidationResult
} from './types.js';

const logger = pino({ name: 'entity-auditor' });

export class EntityExtractor {
  private config: ExtractorConfig;
  private stopWords: Set<string>;

  constructor(config: Partial<ExtractorConfig> = {}) {
    this.config = {
      minEntityLength: 3,
      maxEntityLength: 50,
      minFrequency: 2,
      stopWords: [
        'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
        'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their'
      ],
      synonymMappings: {
        'webp': ['webp image', 'webp format', 'webp file'],
        'png': ['png image', 'png format', 'png file'],
        'jpg': ['jpeg', 'jpg image', 'jpeg image'],
        'pdf': ['pdf document', 'pdf file'],
        'offline': ['without internet', 'no internet required', 'works offline'],
        'privacy': ['private', 'secure', 'privacy-friendly', 'privacy first'],
        'free': ['no cost', 'at no charge', 'completely free']
      },
      ...config
    };

    this.stopWords = new Set(this.config.stopWords);
  }

  /**
   * Extract entities from SERP data
   */
  async extractFromSERP(serpData: any): Promise<Entity[]> {
    try {
      logger.info('Extracting entities from SERP data');
      const entities = new Map<string, Entity>();

      // Process top domains and their content
      if (serpData.top_3_domains) {
        const domains = Array.isArray(serpData.top_3_domains)
          ? serpData.top_3_domains
          : serpData.top_3_domains.split(',');

        for (const domain of domains) {
          const domainEntities = this.extractFromText(domain.trim());
          this.mergeEntities(entities, domainEntities, {
            type: 'serp',
            url: domain,
            frequency: 1
          });
        }
      }

      // Process SERP features
      if (serpData.features_json) {
        const features = typeof serpData.features_json === 'string'
          ? JSON.parse(serpData.features_json)
          : serpData.features_json;

        // Extract from AI Overview content
        if (features.ai_overview) {
          const aiEntities = this.extractFromText(features.ai_overview);
          this.mergeEntities(entities, aiEntities, {
            type: 'serp',
            frequency: 2 // Higher weight for AI Overview
          });
        }

        // Extract from shopping results
        if (features.shopping && Array.isArray(features.shopping)) {
          for (const product of features.shopping) {
            const productEntities = this.extractFromText(product.title || '');
            this.mergeEntities(entities, productEntities, {
              type: 'serp',
              frequency: 1
            });
          }
        }
      }

      const result = Array.from(entities.values())
        .filter(entity => entity.frequency >= Math.min(1, this.config.minFrequency))
        .sort((a, b) => b.importance - a.importance);

      logger.info(`Extracted ${result.length} entities from SERP data`);
      return result;

    } catch (error) {
      throw new EntityExtractionError(`Failed to extract entities from SERP: ${error.message}`, error);
    }
  }

  /**
   * Extract entities from keyword list
   */
  async extractFromKeywords(keywords: string[]): Promise<Entity[]> {
    try {
      logger.info(`Extracting entities from ${keywords.length} keywords`);
      const entities = new Map<string, Entity>();

      for (const keyword of keywords) {
        const keywordEntities = this.extractFromText(keyword);
        this.mergeEntities(entities, keywordEntities, {
          type: 'keywords',
          frequency: 1
        });
      }

      const result = Array.from(entities.values())
        .filter(entity => entity.frequency >= Math.min(1, this.config.minFrequency))
        .sort((a, b) => b.importance - a.importance);

      logger.info(`Extracted ${result.length} entities from keywords`);
      return result;

    } catch (error) {
      throw new EntityExtractionError(`Failed to extract entities from keywords: ${error.message}`, error);
    }
  }

  /**
   * Extract entities from review data
   */
  async extractFromReviews(reviews: any[]): Promise<Entity[]> {
    try {
      logger.info(`Extracting entities from ${reviews.length} reviews`);
      const entities = new Map<string, Entity>();

      for (const review of reviews) {
        const reviewText = (review.text || review.comment || review.content || '').toString();
        const reviewEntities = this.extractFromText(reviewText);
        this.mergeEntities(entities, reviewEntities, {
          type: 'reviews',
          frequency: review.rating ? Math.min(5, Math.max(1, review.rating)) : 1
        });
      }

      const result = Array.from(entities.values())
        .filter(entity => entity.frequency >= Math.min(1, this.config.minFrequency))
        .sort((a, b) => b.importance - a.importance);

      logger.info(`Extracted ${result.length} entities from reviews`);
      return result;

    } catch (error) {
      throw new EntityExtractionError(`Failed to extract entities from reviews: ${error.message}`, error);
    }
  }

  /**
   * Extract entities from People Also Ask questions
   */
  async extractFromPAA(questions: string[]): Promise<Entity[]> {
    try {
      logger.info(`Extracting entities from ${questions.length} PAA questions`);
      const entities = new Map<string, Entity>();

      for (const question of questions) {
        const questionEntities = this.extractFromText(question);
        this.mergeEntities(entities, questionEntities, {
          type: 'paa',
          frequency: 2 // Higher weight for PAA content
        });
      }

      const result = Array.from(entities.values())
        .filter(entity => entity.frequency >= Math.min(1, this.config.minFrequency))
        .sort((a, b) => b.importance - a.importance);

      logger.info(`Extracted ${result.length} entities from PAA questions`);
      return result;

    } catch (error) {
      throw new EntityExtractionError(`Failed to extract entities from PAA: ${error.message}`, error);
    }
  }

  /**
   * Normalize and deduplicate entities
   */
  normalize(entities: Entity[]): Entity[] {
    const normalized = new Map<string, Entity>();

    for (const entity of entities) {
      const canonical = this.normalizeText(entity.canonical);

      if (normalized.has(canonical)) {
        // Merge with existing entity
        const existing = normalized.get(canonical)!;
        existing.variants = [...new Set([...existing.variants, ...entity.variants])];
        existing.frequency += entity.frequency;
        existing.sources = [...existing.sources, ...entity.sources];
        existing.importance = Math.max(existing.importance, entity.importance);
      } else {
        normalized.set(canonical, {
          ...entity,
          canonical,
          variants: entity.variants.map(v => this.normalizeText(v))
        });
      }
    }

    return Array.from(normalized.values());
  }

  /**
   * Map synonyms for better entity matching
   */
  mapSynonyms(entity: string): string[] {
    const normalized = this.normalizeText(entity);
    const synonyms = [normalized];

    // Check manual mappings
    for (const [key, values] of Object.entries(this.config.synonymMappings)) {
      if (key === normalized || values.includes(normalized)) {
        synonyms.push(key, ...values);
      }
    }

    // Add common variations
    synonyms.push(
      normalized + 's',        // Plural
      normalized.slice(0, -1), // Singular (if ends with 's')
      normalized.toLowerCase(),
      normalized.charAt(0).toUpperCase() + normalized.slice(1) // Title case
    );

    return [...new Set(synonyms)];
  }

  /**
   * Calculate entity importance score
   */
  calculateImportance(entity: Entity): number {
    const serpFrequency = 0.5 * Math.min(1, entity.frequency / 10);
    const sourceWeight = 0.3 * this.calculateSourceWeight(entity.sources);
    const intentBoost = 0.2 * this.getIntentBoost(entity.canonical);

    return Math.min(1, serpFrequency + sourceWeight + intentBoost);
  }

  /**
   * Validate extraction results
   */
  validate(entities: Entity[]): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      warnings: [],
      errors: [],
      suggestions: []
    };

    // Check for minimum entities
    if (entities.length < 5) {
      result.warnings.push(`Low entity count: ${entities.length} entities extracted (recommended: 10+)`);
    }

    // Check for importance distribution
    const highImportance = entities.filter(e => e.importance > 0.7).length;
    if (highImportance === 0) {
      result.warnings.push('No high-importance entities found (score > 0.7)');
    }

    // Check for entity length distribution
    const shortEntities = entities.filter(e => e.canonical.length < 4).length;
    if (shortEntities > entities.length * 0.5) {
      result.warnings.push('High proportion of very short entities (may be noise)');
    }

    // Check for source diversity
    const sourceTypes = new Set(entities.flatMap(e => e.sources.map(s => s.type)));
    if (sourceTypes.size < 2) {
      result.warnings.push('Low source diversity (consider using multiple data sources)');
    }

    // Suggestions for improvement
    if (entities.length > 50) {
      result.suggestions.push('Consider increasing minFrequency to reduce noise');
    }

    if (highImportance > entities.length * 0.3) {
      result.suggestions.push('Consider adjusting importance calculation weights');
    }

    return result;
  }

  // Private helper methods

  private extractFromText(text: string): Entity[] {
    if (!text || typeof text !== 'string') return [];

    const words = text.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word =>
        word.length >= this.config.minEntityLength &&
        word.length <= this.config.maxEntityLength &&
        !this.stopWords.has(word) &&
        !/^\d+$/.test(word) // Exclude pure numbers
      );

    const entityCounts = new Map<string, number>();

    // Count single words
    for (const word of words) {
      const normalized = this.normalizeText(word);
      entityCounts.set(normalized, (entityCounts.get(normalized) || 0) + 1);
    }

    // Count two-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      const normalized = this.normalizeText(phrase);
      if (normalized.length <= this.config.maxEntityLength) {
        entityCounts.set(normalized, (entityCounts.get(normalized) || 0) + 1);
      }
    }

    return Array.from(entityCounts.entries())
      .filter(([_, count]) => count >= Math.min(1, this.config.minFrequency))
      .map(([entity, frequency]) => ({
        canonical: entity,
        variants: this.mapSynonyms(entity),
        importance: 0, // Will be calculated later
        frequency,
        sources: [],
        confidence: Math.min(1, frequency / 5)
      }));
  }

  private mergeEntities(
    entityMap: Map<string, Entity>,
    newEntities: Entity[],
    source: EntitySource
  ): void {
    for (const entity of newEntities) {
      const canonical = entity.canonical;

      if (entityMap.has(canonical)) {
        const existing = entityMap.get(canonical)!;
        existing.frequency += entity.frequency * source.frequency;
        existing.sources.push(source);
        existing.confidence = Math.max(existing.confidence, entity.confidence);
      } else {
        entityMap.set(canonical, {
          ...entity,
          sources: [source],
          frequency: entity.frequency * source.frequency
        });
      }
    }
  }

  private normalizeText(text: string): string {
    return text.toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ');
  }

  private calculateSourceWeight(sources: EntitySource[]): number {
    const weights = {
      'serp': 1.0,
      'paa': 0.9,
      'keywords': 0.8,
      'reviews': 0.7,
      'competitors': 0.6
    };

    const totalWeight = sources.reduce((sum, source) => {
      return sum + (weights[source.type] || 0.5) * source.frequency;
    }, 0);

    return Math.min(1, totalWeight / sources.length);
  }

  private getIntentBoost(entity: string): number {
    // Boost entities that indicate commercial intent
    const commercialTerms = ['free', 'online', 'tool', 'converter', 'app', 'software', 'download'];
    const functionalTerms = ['convert', 'change', 'transform', 'edit', 'create', 'generate'];

    if (commercialTerms.some(term => entity.includes(term))) {
      return 0.3;
    }

    if (functionalTerms.some(term => entity.includes(term))) {
      return 0.2;
    }

    return 0;
  }
}