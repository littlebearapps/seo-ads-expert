/**
 * Coverage Analyzer - v1.8
 * Analyzes entity coverage gaps and generates recommendations
 */

import pino from 'pino';
import crypto from 'crypto';
import {
  Entity,
  PageSnapshot,
  Cluster,
  CoverageAnalysis,
  EntityGap,
  SectionGap,
  SchemaGap,
  Recommendation,
  CoverageConfig,
  CoverageAnalysisError
} from './types.js';
import { EntityScorer } from './entity-scorer.js';

const logger = pino({ name: 'coverage-analyzer' });

export class CoverageAnalyzer {
  private scorer: EntityScorer;
  private config: CoverageConfig;

  constructor(config: Partial<CoverageConfig> = {}) {
    this.scorer = new EntityScorer();
    this.config = {
      entityWeight: 0.6,
      sectionWeight: 0.2,
      schemaWeight: 0.2,
      competitorCount: 3,
      minCompetitorPresence: 0.5,
      ...config
    };
  }

  /**
   * Perform comprehensive coverage analysis
   */
  async analyzeCoverage(
    targetPage: PageSnapshot,
    competitorPages: PageSnapshot[],
    entities: Entity[],
    cluster: Cluster,
    product: string,
    market: string
  ): Promise<CoverageAnalysis> {
    try {
      logger.info(`Analyzing coverage for ${targetPage.url} vs ${competitorPages.length} competitors`);

      // Calculate coverage scores
      const coverageScore = this.calculateCoverageScore(targetPage, cluster, entities);
      const competitorScores = competitorPages.map(page =>
        this.calculateCoverageScore(page, cluster, entities)
      );
      const competitorAverage = competitorScores.reduce((sum, score) => sum + score, 0) / competitorScores.length;

      // Detect gaps
      const entityGaps = this.detectEntityGaps(targetPage, competitorPages, entities);
      const sectionGaps = this.detectSectionGaps(targetPage, competitorPages);
      const schemaGaps = this.detectSchemaGaps(targetPage, competitorPages);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        entityGaps,
        sectionGaps,
        schemaGaps,
        targetPage,
        cluster
      );

      const analysis: CoverageAnalysis = {
        product,
        cluster: cluster.name,
        market,
        measuredAt: new Date().toISOString(),
        coverageScore,
        competitorAverage,
        gapCount: entityGaps.length + sectionGaps.length + schemaGaps.length,
        entityGaps,
        sectionGaps,
        schemaGaps,
        recommendations: recommendations.slice(0, 10) // Top 10 recommendations
      };

      logger.info(`Coverage analysis complete: ${coverageScore.toFixed(1)}/100 (competitor avg: ${competitorAverage.toFixed(1)})`);
      return analysis;

    } catch (error) {
      throw new CoverageAnalysisError(`Failed to analyze coverage: ${error.message}`, error);
    }
  }

  /**
   * Calculate overall coverage score (0-100)
   */
  calculateCoverageScore(page: PageSnapshot, cluster: Cluster, entities: Entity[]): number {
    const entityScore = this.config.entityWeight * this.calculateEntityScore(page, entities);
    const sectionScore = this.config.sectionWeight * this.calculateSectionScore(page);
    const schemaScore = this.config.schemaWeight * this.calculateSchemaScore(page);

    return Math.min(100, Math.max(0, (entityScore + sectionScore + schemaScore) * 100));
  }

  /**
   * Calculate entity presence score (0-1)
   */
  private calculateEntityScore(page: PageSnapshot, entities: Entity[]): number {
    if (entities.length === 0) return 1.0;

    return this.scorer.calculatePageCoverage(page.presentEntities, entities);
  }

  /**
   * Calculate section completeness score (0-1)
   */
  private calculateSectionScore(page: PageSnapshot): number {
    const requiredSections = ['intro', 'features', 'faq', 'how-to'];
    const presentSections = page.sections.map(s => s.type);
    const coverage = requiredSections.filter(section =>
      presentSections.includes(section)
    ).length;

    return coverage / requiredSections.length;
  }

  /**
   * Calculate schema markup score (0-1)
   */
  private calculateSchemaScore(page: PageSnapshot): number {
    const recommendedSchemas = ['SoftwareApplication', 'FAQPage', 'HowTo', 'BreadcrumbList'];
    const presentSchemas = page.schemaTypes;
    const coverage = recommendedSchemas.filter(schema =>
      presentSchemas.includes(schema)
    ).length;

    return coverage / recommendedSchemas.length;
  }

  /**
   * Detect entity gaps compared to competitors
   */
  private detectEntityGaps(
    targetPage: PageSnapshot,
    competitorPages: PageSnapshot[],
    entities: Entity[]
  ): EntityGap[] {
    const gaps: EntityGap[] = [];
    const targetEntities = new Set(targetPage.presentEntities.map(e => e.toLowerCase()));

    for (const entity of entities) {
      const entityLower = entity.canonical.toLowerCase();
      const isPresent = targetEntities.has(entityLower) ||
        entity.variants.some(variant =>
          targetEntities.has(variant.toLowerCase()) ||
          targetPage.presentEntities.some(pe =>
            pe.toLowerCase().includes(variant.toLowerCase()) ||
            variant.toLowerCase().includes(pe.toLowerCase())
          )
        );

      if (!isPresent) {
        // Check competitor presence
        const competitorPresence = this.calculateCompetitorPresence(entity, competitorPages);

        if (competitorPresence >= this.config.minCompetitorPresence) {
          gaps.push({
            entity: entity.canonical,
            importance: entity.importance,
            competitorPresence,
            suggestedPlacement: this.suggestEntityPlacement(entity, targetPage),
            rationale: this.generateEntityRationale(entity, competitorPresence)
          });
        }
      }
    }

    return gaps.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Detect missing sections compared to competitors
   */
  private detectSectionGaps(
    targetPage: PageSnapshot,
    competitorPages: PageSnapshot[]
  ): SectionGap[] {
    const gaps: SectionGap[] = [];
    const targetSections = new Set(targetPage.sections.map(s => s.type));

    // Analyze all section types present in competitor pages
    const competitorSections = new Map<string, number>();
    for (const page of competitorPages) {
      for (const section of page.sections) {
        competitorSections.set(
          section.type,
          (competitorSections.get(section.type) || 0) + 1
        );
      }
    }

    for (const [sectionType, count] of competitorSections) {
      if (!targetSections.has(sectionType)) {
        const competitorPresence = count / competitorPages.length;

        if (competitorPresence >= this.config.minCompetitorPresence) {
          gaps.push({
            sectionType,
            competitorPresence,
            suggestedContent: this.generateSectionSuggestion(sectionType),
            estimatedWordCount: this.estimateSectionWordCount(sectionType)
          });
        }
      }
    }

    return gaps.sort((a, b) => b.competitorPresence - a.competitorPresence);
  }

  /**
   * Detect schema markup gaps
   */
  private detectSchemaGaps(
    targetPage: PageSnapshot,
    competitorPages: PageSnapshot[]
  ): SchemaGap[] {
    const gaps: SchemaGap[] = [];
    const targetSchemas = new Set(targetPage.schemaTypes);

    // Analyze schema types in competitor pages
    const competitorSchemas = new Map<string, number>();
    for (const page of competitorPages) {
      for (const schemaType of page.schemaTypes) {
        competitorSchemas.set(
          schemaType,
          (competitorSchemas.get(schemaType) || 0) + 1
        );
      }
    }

    for (const [schemaType, count] of competitorSchemas) {
      if (!targetSchemas.has(schemaType)) {
        const competitorPresence = count / competitorPages.length;

        if (competitorPresence >= this.config.minCompetitorPresence) {
          gaps.push({
            schemaType,
            competitorPresence,
            priority: this.calculateSchemaPriority(schemaType, competitorPresence),
            rationale: this.generateSchemaRationale(schemaType, competitorPresence)
          });
        }
      }
    }

    return gaps.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    entityGaps: EntityGap[],
    sectionGaps: SectionGap[],
    schemaGaps: SchemaGap[],
    targetPage: PageSnapshot,
    cluster: Cluster
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Entity recommendations
    for (const gap of entityGaps.slice(0, 5)) { // Top 5 entity gaps
      recommendations.push({
        type: 'entity',
        priority: Math.ceil(gap.importance * 5),
        title: `Add "${gap.entity}" entity`,
        description: `${gap.rationale} Suggested placement: ${gap.suggestedPlacement}`,
        effort: 2,
        impact: Math.ceil(gap.importance * 5),
        targetUrl: targetPage.url
      });
    }

    // Section recommendations
    for (const gap of sectionGaps.slice(0, 3)) { // Top 3 section gaps
      recommendations.push({
        type: 'section',
        priority: Math.ceil(gap.competitorPresence * 5),
        title: `Add ${gap.sectionType} section`,
        description: gap.suggestedContent,
        effort: this.estimateSectionEffort(gap.sectionType),
        impact: Math.ceil(gap.competitorPresence * 5),
        targetUrl: targetPage.url
      });
    }

    // Schema recommendations
    for (const gap of schemaGaps.slice(0, 2)) { // Top 2 schema gaps
      const priorityScore = gap.priority === 'high' ? 5 : gap.priority === 'medium' ? 3 : 1;
      recommendations.push({
        type: 'schema',
        priority: priorityScore,
        title: `Add ${gap.schemaType} schema markup`,
        description: gap.rationale,
        effort: 1, // Schema is typically low effort
        impact: priorityScore,
        targetUrl: targetPage.url
      });
    }

    return recommendations.sort((a, b) => {
      const aScore = (a.impact / a.effort) * a.priority;
      const bScore = (b.impact / b.effort) * b.priority;
      return bScore - aScore;
    });
  }

  // Private helper methods

  private calculateCompetitorPresence(entity: Entity, competitorPages: PageSnapshot[]): number {
    const entityLower = entity.canonical.toLowerCase();
    let presenceCount = 0;

    for (const page of competitorPages) {
      const pageEntities = page.presentEntities.map(e => e.toLowerCase());
      const isPresent = pageEntities.includes(entityLower) ||
        entity.variants.some(variant =>
          pageEntities.some(pe =>
            pe.includes(variant.toLowerCase()) ||
            variant.toLowerCase().includes(pe)
          )
        );

      if (isPresent) {
        presenceCount++;
      }
    }

    return presenceCount / competitorPages.length;
  }

  private suggestEntityPlacement(entity: Entity, page: PageSnapshot): string {
    const entityLower = entity.canonical.toLowerCase();

    // Suggest placement based on entity type
    if (entityLower.includes('feature') || entityLower.includes('benefit')) {
      return 'Features section';
    }

    if (entityLower.includes('how') || entityLower.includes('step')) {
      return 'How-to section';
    }

    if (entityLower.includes('question') || entityLower.includes('answer')) {
      return 'FAQ section';
    }

    if (entity.importance > 0.7) {
      return 'Introduction/hero section';
    }

    return 'Body content or features section';
  }

  private generateEntityRationale(entity: Entity, competitorPresence: number): string {
    const percentage = Math.round(competitorPresence * 100);
    return `${percentage}% of top competitors mention this entity. Importance score: ${entity.importance.toFixed(2)}`;
  }

  private generateSectionSuggestion(sectionType: string): string {
    const suggestions = {
      'faq': 'Add a FAQ section with 3-5 common questions about the tool',
      'how-to': 'Include step-by-step instructions for using the tool',
      'features': 'List key features and benefits of the tool',
      'comparison': 'Add comparison table with alternatives or file formats',
      'testimonials': 'Include user testimonials or reviews',
      'troubleshooting': 'Add common issues and solutions section'
    };

    return suggestions[sectionType] || `Add ${sectionType} section to improve content completeness`;
  }

  private estimateSectionWordCount(sectionType: string): number {
    const estimates = {
      'faq': 300,
      'how-to': 500,
      'features': 200,
      'comparison': 400,
      'testimonials': 150,
      'troubleshooting': 350
    };

    return estimates[sectionType] || 250;
  }

  private estimateSectionEffort(sectionType: string): number {
    const efforts = {
      'faq': 2,      // Medium effort
      'how-to': 3,   // High effort
      'features': 2, // Medium effort
      'comparison': 4, // Very high effort
      'testimonials': 1, // Low effort
      'troubleshooting': 3 // High effort
    };

    return efforts[sectionType] || 2;
  }

  private calculateSchemaPriority(schemaType: string, competitorPresence: number): 'high' | 'medium' | 'low' {
    if (competitorPresence >= 0.8) return 'high';
    if (competitorPresence >= 0.6) return 'medium';
    return 'low';
  }

  private generateSchemaRationale(schemaType: string, competitorPresence: number): string {
    const percentage = Math.round(competitorPresence * 100);
    return `${percentage}% of competitors use ${schemaType} schema markup for enhanced search visibility`;
  }

  /**
   * Generate content hash for change detection
   */
  generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Create page snapshot from content
   */
  createPageSnapshot(
    url: string,
    content: string,
    headings: { level: number; text: string; position: number }[],
    entities: string[],
    schemaTypes: string[] = []
  ): PageSnapshot {
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const contentHash = this.generateContentHash(content);

    // Extract sections (simplified implementation)
    const sections = this.extractSections(content, headings);

    return {
      url,
      capturedAt: new Date().toISOString(),
      wordCount,
      headings,
      sections,
      presentEntities: entities,
      schemaTypes,
      contentHash
    };
  }

  private extractSections(content: string, headings: any[]): any[] {
    // Simplified section extraction
    const sections = [];

    if (content.toLowerCase().includes('faq') || content.toLowerCase().includes('question')) {
      sections.push({
        title: 'FAQ',
        content: 'FAQ content detected',
        wordCount: 100,
        entities: [],
        type: 'faq'
      });
    }

    if (content.toLowerCase().includes('how to') || content.toLowerCase().includes('step')) {
      sections.push({
        title: 'How To',
        content: 'How-to content detected',
        wordCount: 200,
        entities: [],
        type: 'how-to'
      });
    }

    return sections;
  }
}