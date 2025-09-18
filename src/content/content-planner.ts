/**
 * Content Planner with Gap Analysis
 * v1.8 Phase 3: Content Roadmap Generation
 */

import {
  ContentGap,
  ContentItem,
  ContentType,
  ContentStatus,
  ContentCalendar,
  CalendarWeek,
  CoverageReport,
  ClusterCoverage,
  ContentRecommendation,
  GapType,
  ImpactFactors,
  EffortFactors
} from './types.js';

export class ContentPlanner {
  /**
   * Analyze gaps and generate content plan
   */
  analyzeGaps(coverage: CoverageReport): ContentGap[] {
    const gaps: ContentGap[] = [];

    for (const cluster of coverage.clusters) {
      // Check for entity gaps
      if (cluster.score < 80) {
        gaps.push({
          cluster: cluster.cluster,
          type: GapType.MissingEntities,
          severity: this.calculateSeverity(cluster.score),
          entities: cluster.gaps
            .filter(g => g.type === GapType.MissingEntities)
            .flatMap(g => g.entities),
          description: `Entity coverage at ${cluster.score}%, competitor at ${cluster.competitorComparison.theirScore}%`,
          currentCoverage: cluster.score,
          targetCoverage: Math.max(85, cluster.competitorComparison.theirScore),
          competitorAvg: cluster.competitorComparison.theirScore
        });
      }

      // Check for missing sections
      const missingSections = cluster.gaps.filter(g => g.type === GapType.MissingSections);
      if (missingSections.length > 0) {
        gaps.push({
          cluster: cluster.cluster,
          type: GapType.MissingSections,
          severity: 'major',
          entities: [],
          description: `Missing critical sections: ${missingSections.map(s => s.description).join(', ')}`,
          currentCoverage: cluster.score,
          targetCoverage: 90,
          competitorAvg: cluster.competitorComparison.theirScore
        });
      }

      // Check for FAQ gaps
      const faqGap = cluster.gaps.find(g => g.type === GapType.FAQ);
      if (faqGap) {
        gaps.push({
          cluster: cluster.cluster,
          type: GapType.FAQ,
          severity: 'minor',
          entities: [],
          description: 'Missing FAQ section for common questions',
          currentCoverage: 0,
          targetCoverage: 100,
          competitorAvg: 80
        });
      }

      // Check for content freshness
      if (this.needsFreshContent(cluster)) {
        gaps.push({
          cluster: cluster.cluster,
          type: GapType.Freshness,
          severity: 'minor',
          entities: [],
          description: 'Content needs updating (>6 months old)',
          currentCoverage: 50,
          targetCoverage: 100,
          competitorAvg: 75
        });
      }
    }

    return gaps;
  }

  /**
   * Prioritize content creation based on gaps
   */
  prioritizeContent(gaps: ContentGap[]): ContentItem[] {
    const contentItems: ContentItem[] = [];

    // Group gaps by cluster
    const gapsByCluster = this.groupGapsByCluster(gaps);

    for (const [cluster, clusterGaps] of Object.entries(gapsByCluster)) {
      const item = this.createContentItem(cluster, clusterGaps);
      contentItems.push(item);
    }

    // Sort by priority (impact/effort ratio)
    return contentItems.sort((a, b) => {
      const scoreA = (a.impact / a.effort) * a.priority;
      const scoreB = (b.impact / b.effort) * b.priority;
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate impact score for content item
   */
  calculateImpact(item: ContentItem): number {
    const factors: ImpactFactors = {
      searchVolume: this.getSearchVolumeScore(item.keywords),
      intentMatch: this.getIntentMatchScore(item.cluster),
      competitiveGap: this.getCompetitiveGapScore(item.gaps),
      serpFeatures: this.getSERPFeatureScore(item.cluster),
      conversionPotential: this.getConversionPotentialScore(item.type)
    };

    // Weighted average
    const weights = {
      searchVolume: 0.25,
      intentMatch: 0.20,
      competitiveGap: 0.25,
      serpFeatures: 0.15,
      conversionPotential: 0.15
    };

    let impact = 0;
    for (const [factor, score] of Object.entries(factors)) {
      impact += score * weights[factor as keyof ImpactFactors];
    }

    return Math.round(impact * 100);
  }

  /**
   * Estimate effort required for content item
   */
  estimateEffort(item: ContentItem): number {
    const factors: EffortFactors = {
      contentLength: this.estimateContentLength(item.type),
      technicalComplexity: this.estimateTechnicalComplexity(item),
      researchRequired: this.estimateResearchEffort(item),
      designRequired: this.estimateDesignEffort(item.type),
      dependencies: item.gaps.length
    };

    // Calculate effort score (1-5)
    let effortScore = 1;

    if (factors.contentLength > 2000) effortScore++;
    if (factors.contentLength > 3000) effortScore++;
    if (factors.technicalComplexity > 3) effortScore++;
    if (factors.researchRequired > 3) effortScore++;
    if (factors.designRequired > 3) effortScore++;
    if (factors.dependencies > 3) effortScore++;

    return Math.min(5, effortScore);
  }

  /**
   * Generate content calendar
   */
  generateCalendar(items: ContentItem[]): ContentCalendar {
    const calendar: ContentCalendar = {
      product: items[0]?.product || 'unknown',
      generatedAt: new Date().toISOString(),
      items,
      summary: this.generateSummary(items),
      timeline: this.generateTimeline(items)
    };

    return calendar;
  }

  /**
   * Generate recommendations based on gaps
   */
  generateRecommendations(gaps: ContentGap[]): ContentRecommendation[] {
    const recommendations: ContentRecommendation[] = [];

    // Group gaps by severity
    const criticalGaps = gaps.filter(g => g.severity === 'critical');
    const majorGaps = gaps.filter(g => g.severity === 'major');
    const minorGaps = gaps.filter(g => g.severity === 'minor');

    // Generate recommendations for critical gaps first
    for (const gap of criticalGaps) {
      const rec = this.createRecommendation(gap, 'urgent');
      if (rec) recommendations.push(rec);
    }

    // Then major gaps
    for (const gap of majorGaps) {
      const rec = this.createRecommendation(gap, 'important');
      if (rec) recommendations.push(rec);
    }

    // Finally minor gaps (limit to top 3)
    for (const gap of minorGaps.slice(0, 3)) {
      const rec = this.createRecommendation(gap, 'nice-to-have');
      if (rec) recommendations.push(rec);
    }

    return recommendations;
  }

  /**
   * Private helper methods
   */
  private calculateSeverity(score: number): 'critical' | 'major' | 'minor' {
    if (score < 40) return 'critical';
    if (score < 70) return 'major';
    return 'minor';
  }

  private needsFreshContent(cluster: ClusterCoverage): boolean {
    // In a real implementation, check actual content age
    // For now, assume content older than 6 months needs refresh
    return Math.random() > 0.7; // 30% chance for demo
  }

  private groupGapsByCluster(gaps: ContentGap[]): Record<string, ContentGap[]> {
    const grouped: Record<string, ContentGap[]> = {};

    for (const gap of gaps) {
      if (!grouped[gap.cluster]) {
        grouped[gap.cluster] = [];
      }
      grouped[gap.cluster].push(gap);
    }

    return grouped;
  }

  private createContentItem(cluster: string, gaps: ContentGap[]): ContentItem {
    const hasEntityGaps = gaps.some(g => g.type === GapType.MissingEntities);
    const hasFAQGap = gaps.some(g => g.type === GapType.FAQ);
    const hasSectionGaps = gaps.some(g => g.type === GapType.MissingSections);

    let type: ContentType;
    let title: string;

    if (hasEntityGaps && gaps.find(g => g.severity === 'critical')) {
      type = ContentType.PillarPage;
      title = `Comprehensive ${cluster.replace(/-/g, ' ')} Guide`;
    } else if (hasFAQGap) {
      type = ContentType.FAQ;
      title = `${cluster.replace(/-/g, ' ')} FAQ`;
    } else if (hasSectionGaps) {
      type = ContentType.LandingPageUpdate;
      title = `Update ${cluster.replace(/-/g, ' ')} landing page`;
    } else {
      type = ContentType.BlogPost;
      title = `${cluster.replace(/-/g, ' ')}: Complete Guide`;
    }

    const item: ContentItem = {
      id: `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      product: cluster.split('-')[0] || 'product',
      title,
      type,
      cluster,
      targetUrl: `/content/${cluster}`,
      priority: this.calculatePriority(gaps),
      impact: 0, // Will be calculated
      effort: 0, // Will be estimated
      status: ContentStatus.Pending,
      description: this.generateDescription(type, gaps),
      keywords: this.extractKeywords(cluster, gaps),
      entities: gaps.flatMap(g => g.entities),
      gaps,
      recommendations: this.generateItemRecommendations(gaps)
    };

    // Calculate impact and effort
    item.impact = this.calculateImpact(item);
    item.effort = this.estimateEffort(item);

    return item;
  }

  private calculatePriority(gaps: ContentGap[]): number {
    const severityScores = {
      critical: 3,
      major: 2,
      minor: 1
    };

    let totalScore = 0;
    for (const gap of gaps) {
      totalScore += severityScores[gap.severity];
    }

    // Normalize to 1-10 scale
    return Math.min(10, Math.max(1, Math.round(totalScore * 2)));
  }

  private generateDescription(type: ContentType, gaps: ContentGap[]): string {
    const gapDescriptions = gaps.map(g => g.description).join('. ');

    const typeDescriptions = {
      [ContentType.PillarPage]: `Create comprehensive pillar page to address: ${gapDescriptions}`,
      [ContentType.BlogPost]: `Develop in-depth blog post covering: ${gapDescriptions}`,
      [ContentType.LandingPageUpdate]: `Update existing landing page to fix: ${gapDescriptions}`,
      [ContentType.FAQ]: `Add FAQ section to answer common questions`,
      [ContentType.HowToGuide]: `Create step-by-step guide`,
      [ContentType.ComparisonPage]: `Develop comparison content`,
      [ContentType.CaseStudy]: `Write case study demonstrating value`
    };

    return typeDescriptions[type] || gapDescriptions;
  }

  private extractKeywords(cluster: string, gaps: ContentGap[]): string[] {
    const keywords: Set<string> = new Set();

    // Add cluster as keyword
    keywords.add(cluster.replace(/-/g, ' '));

    // Extract entities as keywords
    for (const gap of gaps) {
      gap.entities.forEach(entity => keywords.add(entity));
    }

    return Array.from(keywords);
  }

  private generateItemRecommendations(gaps: ContentGap[]): string[] {
    const recommendations: string[] = [];

    for (const gap of gaps) {
      switch (gap.type) {
        case GapType.MissingEntities:
          recommendations.push(`Include entities: ${gap.entities.slice(0, 3).join(', ')}`);
          break;
        case GapType.MissingSections:
          recommendations.push('Add missing sections identified in competitor analysis');
          break;
        case GapType.FAQ:
          recommendations.push('Include FAQ section with 5+ common questions');
          break;
        case GapType.ContentLength:
          recommendations.push('Expand content to match competitor depth (2000+ words)');
          break;
        case GapType.SchemaMarkup:
          recommendations.push('Implement proper schema markup');
          break;
        case GapType.Freshness:
          recommendations.push('Update statistics and references to current year');
          break;
      }
    }

    return recommendations;
  }

  private getSearchVolumeScore(keywords: string[]): number {
    // In real implementation, would use actual search volume data
    // For demo, return random score
    return 0.5 + Math.random() * 0.5;
  }

  private getIntentMatchScore(cluster: string): number {
    // Score based on commercial intent indicators
    const commercialTerms = ['buy', 'purchase', 'price', 'cost', 'cheap', 'best', 'review'];
    const hasCommercialIntent = commercialTerms.some(term => cluster.includes(term));
    return hasCommercialIntent ? 0.9 : 0.6;
  }

  private getCompetitiveGapScore(gaps: ContentGap[]): number {
    const avgGap = gaps.reduce((sum, gap) => {
      return sum + (gap.competitorAvg - gap.currentCoverage) / 100;
    }, 0) / gaps.length;

    return Math.min(1, Math.max(0, avgGap));
  }

  private getSERPFeatureScore(cluster: string): number {
    // In real implementation, check actual SERP features
    // For demo, return moderate score
    return 0.6;
  }

  private getConversionPotentialScore(type: ContentType): number {
    const scores = {
      [ContentType.LandingPageUpdate]: 0.9,
      [ContentType.PillarPage]: 0.8,
      [ContentType.ComparisonPage]: 0.85,
      [ContentType.FAQ]: 0.7,
      [ContentType.HowToGuide]: 0.75,
      [ContentType.BlogPost]: 0.6,
      [ContentType.CaseStudy]: 0.65
    };

    return scores[type] || 0.5;
  }

  private estimateContentLength(type: ContentType): number {
    const lengths = {
      [ContentType.PillarPage]: 3500,
      [ContentType.BlogPost]: 2000,
      [ContentType.LandingPageUpdate]: 1500,
      [ContentType.FAQ]: 1000,
      [ContentType.HowToGuide]: 2500,
      [ContentType.ComparisonPage]: 2000,
      [ContentType.CaseStudy]: 1800
    };

    return lengths[type] || 1500;
  }

  private estimateTechnicalComplexity(item: ContentItem): number {
    // Higher complexity for pillar pages and technical content
    if (item.type === ContentType.PillarPage) return 4;
    if (item.type === ContentType.HowToGuide) return 3;
    return 2;
  }

  private estimateResearchEffort(item: ContentItem): number {
    // More research needed for comprehensive content
    if (item.type === ContentType.PillarPage) return 4;
    if (item.type === ContentType.ComparisonPage) return 4;
    if (item.type === ContentType.CaseStudy) return 3;
    return 2;
  }

  private estimateDesignEffort(type: ContentType): number {
    // Design effort for visual content
    if (type === ContentType.PillarPage) return 4;
    if (type === ContentType.HowToGuide) return 3;
    if (type === ContentType.ComparisonPage) return 3;
    return 2;
  }

  private generateSummary(items: ContentItem[]): ContentCalendar['summary'] {
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const item of items) {
      // Count by type
      byType[item.type] = (byType[item.type] || 0) + 1;

      // Count by priority bucket
      const priorityBucket = item.priority >= 8 ? 'high' :
                            item.priority >= 5 ? 'medium' : 'low';
      byPriority[priorityBucket] = (byPriority[priorityBucket] || 0) + 1;
    }

    const totalEffort = items.reduce((sum, item) => sum + item.effort, 0);
    const weightedImpact = items.length > 0
      ? items.reduce((sum, item) => sum + item.impact, 0) / items.length
      : 0;

    return {
      totalItems: items.length,
      byType: byType as Record<ContentType, number>,
      byPriority,
      estimatedEffort: totalEffort,
      expectedImpact: Math.round(weightedImpact)
    };
  }

  private generateTimeline(items: ContentItem[]): CalendarWeek[] {
    const weeks: CalendarWeek[] = [];
    const maxEffortPerWeek = 10; // Max effort points per week

    let currentWeek: CalendarWeek = {
      weekOf: this.getNextMonday(),
      items: [],
      totalEffort: 0,
      focus: ''
    };

    for (const item of items) {
      if (currentWeek.totalEffort + item.effort > maxEffortPerWeek) {
        // Start new week
        weeks.push(currentWeek);
        currentWeek = {
          weekOf: this.addWeek(currentWeek.weekOf),
          items: [],
          totalEffort: 0,
          focus: ''
        };
      }

      currentWeek.items.push(item);
      currentWeek.totalEffort += item.effort;

      // Set week focus based on highest priority item
      if (!currentWeek.focus || item.priority > currentWeek.items[0].priority) {
        currentWeek.focus = item.title;
      }

      // Set due date for item
      item.dueDate = this.addDays(currentWeek.weekOf, 5); // Friday of the week
    }

    if (currentWeek.items.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }

  private createRecommendation(gap: ContentGap, urgency: string): ContentRecommendation | null {
    const typeMap: Record<GapType, ContentType> = {
      [GapType.MissingEntities]: ContentType.PillarPage,
      [GapType.MissingSections]: ContentType.LandingPageUpdate,
      [GapType.ContentLength]: ContentType.BlogPost,
      [GapType.SchemaMarkup]: ContentType.LandingPageUpdate,
      [GapType.FAQ]: ContentType.FAQ,
      [GapType.HowTo]: ContentType.HowToGuide,
      [GapType.Freshness]: ContentType.LandingPageUpdate
    };

    const type = typeMap[gap.type];
    if (!type) return null;

    return {
      type,
      title: `${gap.cluster}: ${gap.description}`,
      rationale: `Current coverage at ${gap.currentCoverage}%, target ${gap.targetCoverage}%`,
      targetKeywords: [gap.cluster.replace(/-/g, ' '), ...gap.entities.slice(0, 3)],
      estimatedImpact: Math.round((gap.targetCoverage - gap.currentCoverage) * 0.8),
      estimatedEffort: gap.severity === 'critical' ? 4 : gap.severity === 'major' ? 3 : 2,
      prerequisites: urgency === 'urgent' ? [] : ['Complete higher priority items first']
    };
  }

  private getNextMonday(): string {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday.toISOString().split('T')[0];
  }

  private addWeek(dateStr: string): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  }

  private addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }
}