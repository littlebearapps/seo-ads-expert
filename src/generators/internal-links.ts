import { z } from 'zod';
import type { StrategicIntelligence, OpportunityItem } from '../analyzers/strategic-orchestrator.js';
import type { ContentCalendar, ContentCalendarEntry } from './content-calendar.js';

export const InternalLinkOpportunitySchema = z.object({
  id: z.string(),
  source: z.object({
    url: z.string(),
    title: z.string(),
    cluster: z.string(),
    contentType: z.string()
  }),
  target: z.object({
    url: z.string(),
    title: z.string(),
    cluster: z.string(),
    contentType: z.string()
  }),
  anchor: z.object({
    text: z.string(),
    context: z.string(),
    placement: z.enum(['introduction', 'body', 'conclusion', 'sidebar']),
    naturalness: z.number() // 0-1 score
  }),
  relevance: z.number(), // 0-1 topical relevance score
  authority: z.number(), // 0-1 authority flow potential
  priority: z.enum(['high', 'medium', 'low']),
  linkType: z.enum(['contextual', 'navigational', 'resource', 'product']),
  policyCompliant: z.boolean(),
  estimatedValue: z.number(), // SEO value estimate
  implementation: z.object({
    difficulty: z.enum(['easy', 'medium', 'hard']),
    timeEstimate: z.number(), // minutes
    notes: z.string()
  })
});

export const InternalLinkingStrategySchema = z.object({
  metadata: z.object({
    generatedAt: z.string(),
    totalOpportunities: z.number(),
    highPriorityCount: z.number(),
    estimatedTotalValue: z.number(),
    policyViolations: z.number()
  }),
  opportunities: z.array(InternalLinkOpportunitySchema),
  clusters: z.array(z.object({
    cluster: z.string(),
    inboundLinks: z.number(),
    outboundLinks: z.number(),
    authorityFlow: z.number(),
    recommendations: z.array(z.string())
  })),
  anchors: z.object({
    distribution: z.record(z.number()),
    overUsed: z.array(z.string()),
    underUsed: z.array(z.string()),
    recommendations: z.array(z.string())
  }),
  implementation: z.object({
    phaseOne: z.array(z.string()), // IDs of immediate opportunities
    phaseTwo: z.array(z.string()), // IDs of strategic opportunities  
    phaseThree: z.array(z.string()) // IDs of long-term opportunities
  })
});

export type InternalLinkOpportunity = z.infer<typeof InternalLinkOpportunitySchema>;
export type InternalLinkingStrategy = z.infer<typeof InternalLinkingStrategySchema>;

export interface InternalLinkingConfig {
  maxLinksPerPage: number;
  minRelevanceThreshold: number;
  anchorTextVariation: number;
  competitorMentionPolicy: 'strict' | 'moderate' | 'permissive';
  authorityBoostThreshold: number;
  productFocusWeight: number;
}

export class InternalLinkingEngine {
  private config: InternalLinkingConfig;
  private productPages: Map<string, ProductPageInfo>;
  private competitorTerms: Set<string>;

  constructor(config: Partial<InternalLinkingConfig> = {}) {
    this.config = {
      maxLinksPerPage: config.maxLinksPerPage || 5,
      minRelevanceThreshold: config.minRelevanceThreshold || 0.6,
      anchorTextVariation: config.anchorTextVariation || 0.7,
      competitorMentionPolicy: config.competitorMentionPolicy || 'strict',
      authorityBoostThreshold: config.authorityBoostThreshold || 0.8,
      productFocusWeight: config.productFocusWeight || 1.5
    };

    this.initializeProductPages();
    this.initializeCompetitorTerms();
  }

  async generateLinkingStrategy(
    intelligence: StrategicIntelligence,
    contentCalendar?: ContentCalendar
  ): Promise<InternalLinkingStrategy> {
    // Generate all possible linking opportunities
    const opportunities = await this.generateLinkingOpportunities(intelligence, contentCalendar);
    
    // Analyze anchor text distribution
    const anchorAnalysis = this.analyzeAnchorTextDistribution(opportunities);
    
    // Analyze cluster authority flow
    const clusterAnalysis = this.analyzeClusterAuthority(opportunities);
    
    // Create implementation phases
    const implementation = this.createImplementationPhases(opportunities);
    
    // Calculate metadata
    const metadata = this.calculateMetadata(opportunities);

    return {
      metadata,
      opportunities,
      clusters: clusterAnalysis,
      anchors: anchorAnalysis,
      implementation
    };
  }

  private async generateLinkingOpportunities(
    intelligence: StrategicIntelligence,
    contentCalendar?: ContentCalendar
  ): Promise<InternalLinkOpportunity[]> {
    const opportunities: InternalLinkOpportunity[] = [];
    const allContent = this.getAllContent(intelligence, contentCalendar);
    
    // Generate opportunities for each content pair
    for (let i = 0; i < allContent.length; i++) {
      for (let j = 0; j < allContent.length; j++) {
        if (i === j) continue; // Skip self-linking
        
        const source = allContent[i];
        const target = allContent[j];
        
        const opportunity = await this.evaluateLinkingOpportunity(source, target);
        if (opportunity && this.meetsQualityThreshold(opportunity)) {
          opportunities.push(opportunity);
        }
      }
    }
    
    // Deduplicate and prioritize
    return this.deduplicateAndPrioritize(opportunities);
  }

  private getAllContent(intelligence: StrategicIntelligence, contentCalendar?: ContentCalendar): ContentInfo[] {
    const content: ContentInfo[] = [];
    
    // Add existing product opportunities as content
    for (const opportunity of intelligence.opportunities) {
      content.push({
        id: `opp-${opportunity.query.replace(/\s+/g, '-')}`,
        url: this.generateUrl(opportunity.query),
        title: this.generateTitle(opportunity.query),
        cluster: opportunity.query,
        contentType: 'product',
        opportunity
      });
    }
    
    // Add planned content from calendar
    if (contentCalendar) {
      for (const entry of contentCalendar.calendar) {
        content.push({
          id: entry.id,
          url: this.generateUrl(entry.cluster),
          title: entry.title,
          cluster: entry.cluster,
          contentType: entry.contentType,
          calendarEntry: entry
        });
      }
    }
    
    // Add existing product pages
    for (const [slug, pageInfo] of this.productPages) {
      content.push({
        id: `product-${slug}`,
        url: pageInfo.url,
        title: pageInfo.title,
        cluster: pageInfo.primaryKeyword,
        contentType: 'product',
        productInfo: pageInfo
      });
    }
    
    return content;
  }

  private async evaluateLinkingOpportunity(source: ContentInfo, target: ContentInfo): Promise<InternalLinkOpportunity | null> {
    // Calculate relevance score
    const relevance = this.calculateTopicalRelevance(source, target);
    if (relevance < this.config.minRelevanceThreshold) {
      return null;
    }
    
    // Calculate authority potential
    const authority = this.calculateAuthorityPotential(source, target);
    
    // Generate contextual anchor text
    const anchor = this.generateAnchorText(source, target);
    if (!anchor) return null;
    
    // Check policy compliance
    const policyCompliant = this.checkPolicyCompliance(anchor.text, target);
    
    // Calculate estimated value
    const estimatedValue = this.calculateLinkValue(relevance, authority, source, target);
    
    return {
      id: `link-${source.id}-${target.id}`,
      source: {
        url: source.url,
        title: source.title,
        cluster: source.cluster,
        contentType: source.contentType
      },
      target: {
        url: target.url,
        title: target.title,
        cluster: target.cluster,
        contentType: target.contentType
      },
      anchor,
      relevance,
      authority,
      priority: this.determinePriority(relevance, authority, estimatedValue),
      linkType: this.determineLinkType(source, target),
      policyCompliant,
      estimatedValue,
      implementation: {
        difficulty: this.estimateImplementationDifficulty(source, target),
        timeEstimate: this.estimateImplementationTime(source, target),
        notes: this.generateImplementationNotes(source, target)
      }
    };
  }

  private calculateTopicalRelevance(source: ContentInfo, target: ContentInfo): number {
    let relevance = 0;
    
    // Keyword overlap
    const sourceKeywords = this.extractKeywords(source);
    const targetKeywords = this.extractKeywords(target);
    const overlap = this.calculateKeywordOverlap(sourceKeywords, targetKeywords);
    relevance += overlap * 0.4;
    
    // Cluster relationship
    if (source.cluster === target.cluster) {
      relevance += 0.3;
    } else if (this.areClustersRelated(source.cluster, target.cluster)) {
      relevance += 0.2;
    }
    
    // Content type synergy
    const contentTypeSynergy = this.calculateContentTypeSynergy(source.contentType, target.contentType);
    relevance += contentTypeSynergy * 0.2;
    
    // Product relationship boost
    if (this.areProductRelated(source, target)) {
      relevance += 0.1;
    }
    
    return Math.min(relevance, 1.0);
  }

  private calculateAuthorityPotential(source: ContentInfo, target: ContentInfo): number {
    let authority = 0.5; // Base authority
    
    // Source authority factors
    if (source.productInfo?.isMainProduct) authority += 0.2;
    if (source.opportunity?.impact_score > 8) authority += 0.1;
    if (source.contentType === 'guide') authority += 0.1;
    
    // Target authority factors
    if (target.productInfo?.isMainProduct) authority += 0.1;
    if (target.contentType === 'product') authority += 0.1;
    
    return Math.min(authority, 1.0);
  }

  private generateAnchorText(source: ContentInfo, target: ContentInfo): InternalLinkOpportunity['anchor'] | null {
    const anchorOptions = this.generateAnchorOptions(source, target);
    if (anchorOptions.length === 0) return null;
    
    // Select best anchor based on naturalness and diversity
    const selectedAnchor = this.selectBestAnchor(anchorOptions, source, target);
    
    return {
      text: selectedAnchor.text,
      context: selectedAnchor.context,
      placement: selectedAnchor.placement,
      naturalness: selectedAnchor.naturalness
    };
  }

  private generateAnchorOptions(source: ContentInfo, target: ContentInfo): AnchorOption[] {
    const options: AnchorOption[] = [];
    
    // Product-focused anchors
    if (target.contentType === 'product') {
      options.push({
        text: target.title,
        context: `Learn more about ${target.title}`,
        placement: 'body',
        naturalness: 0.8
      });
      
      options.push({
        text: `${target.cluster} tool`,
        context: `Check out our ${target.cluster} tool`,
        placement: 'body',
        naturalness: 0.9
      });
    }
    
    // Topical anchors
    const topicAnchors = this.generateTopicAnchor(target);
    options.push(...topicAnchors);
    
    // Action-oriented anchors
    if (target.contentType === 'tutorial' || target.contentType === 'guide') {
      options.push({
        text: `how to ${target.cluster}`,
        context: `For detailed instructions, see our guide on how to ${target.cluster}`,
        placement: 'body',
        naturalness: 0.85
      });
    }
    
    return options.filter(option => option.naturalness >= 0.7);
  }

  private generateTopicAnchor(target: ContentInfo): AnchorOption[] {
    const cluster = target.cluster.toLowerCase();
    const options: AnchorOption[] = [];
    
    // Generate natural variations
    const variations = [
      cluster,
      `${cluster} guide`,
      `${cluster} tutorial`,
      `${cluster} tool`,
      `${cluster} solution`,
      `free ${cluster}`
    ];
    
    for (const variation of variations) {
      options.push({
        text: variation,
        context: `Learn more about ${variation}`,
        placement: 'body',
        naturalness: this.calculateAnchorNaturalness(variation, target)
      });
    }
    
    return options.filter(option => option.naturalness >= 0.7);
  }

  private calculateAnchorNaturalness(anchorText: string, target: ContentInfo): number {
    let naturalness = 0.7; // Base score
    
    // Boost for exact keyword matches
    if (target.cluster.toLowerCase().includes(anchorText.toLowerCase())) {
      naturalness += 0.2;
    }
    
    // Penalize over-optimization signals
    if (anchorText.includes('best') || anchorText.includes('top')) {
      naturalness -= 0.1;
    }
    
    // Boost for natural language patterns
    if (anchorText.includes('how to') || anchorText.includes('guide to')) {
      naturalness += 0.1;
    }
    
    return Math.max(0.3, Math.min(1.0, naturalness));
  }

  private selectBestAnchor(options: AnchorOption[], source: ContentInfo, target: ContentInfo): AnchorOption {
    // Score each option
    const scoredOptions = options.map(option => ({
      ...option,
      score: this.scoreAnchorOption(option, source, target)
    }));
    
    // Sort by score and return best
    scoredOptions.sort((a, b) => b.score - a.score);
    return scoredOptions[0];
  }

  private scoreAnchorOption(option: AnchorOption, source: ContentInfo, target: ContentInfo): number {
    let score = option.naturalness * 0.6;
    
    // Diversity bonus (avoid over-using same anchor text)
    if (!this.isAnchorOverUsed(option.text)) {
      score += 0.2;
    }
    
    // Relevance bonus
    if (this.isAnchorRelevant(option.text, source, target)) {
      score += 0.2;
    }
    
    return score;
  }

  private checkPolicyCompliance(anchorText: string, target: ContentInfo): boolean {
    // Check against competitor terms
    if (this.config.competitorMentionPolicy === 'strict') {
      for (const term of this.competitorTerms) {
        if (anchorText.toLowerCase().includes(term.toLowerCase())) {
          return false;
        }
      }
    }
    
    // Check for trademark violations
    const trademarkTerms = ['adobe', 'microsoft', 'google', 'apple'];
    for (const term of trademarkTerms) {
      if (anchorText.toLowerCase().includes(term.toLowerCase())) {
        return false;
      }
    }
    
    // Ensure product-focused anchors for our products
    if (target.contentType === 'product' && target.productInfo?.isMainProduct) {
      return anchorText.toLowerCase().includes('chrome extension') || 
             anchorText.toLowerCase().includes('tool') ||
             anchorText.toLowerCase().includes(target.cluster.toLowerCase());
    }
    
    return true;
  }

  private calculateLinkValue(relevance: number, authority: number, source: ContentInfo, target: ContentInfo): number {
    let value = relevance * authority * 100; // Base value
    
    // Product link value boost
    if (target.contentType === 'product') {
      value *= this.config.productFocusWeight;
    }
    
    // High-opportunity source boost
    if (source.opportunity?.impact_score > 8) {
      value *= 1.3;
    }
    
    // Strategic cluster boost
    if (target.opportunity?.opportunity_type === 'strategic_investment') {
      value *= 1.2;
    }
    
    return Math.round(value);
  }

  private determinePriority(relevance: number, authority: number, estimatedValue: number): 'high' | 'medium' | 'low' {
    const score = (relevance * 0.4) + (authority * 0.3) + (estimatedValue / 100 * 0.3);
    
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    return 'low';
  }

  private determineLinkType(source: ContentInfo, target: ContentInfo): InternalLinkOpportunity['linkType'] {
    // Product links
    if (target.contentType === 'product') return 'product';
    
    // Resource links (guides, tutorials)
    if (target.contentType === 'guide' || target.contentType === 'tutorial') return 'resource';
    
    // Navigational links (between related topics)
    if (this.areClustersRelated(source.cluster, target.cluster)) return 'navigational';
    
    // Default to contextual
    return 'contextual';
  }

  private meetsQualityThreshold(opportunity: InternalLinkOpportunity): boolean {
    return opportunity.relevance >= this.config.minRelevanceThreshold &&
           opportunity.policyCompliant &&
           opportunity.anchor.naturalness >= 0.7;
  }

  private deduplicateAndPrioritize(opportunities: InternalLinkOpportunity[]): InternalLinkOpportunity[] {
    // Remove duplicates (same source-target pairs)
    const uniqueOpportunities = new Map<string, InternalLinkOpportunity>();
    
    for (const opp of opportunities) {
      const key = `${opp.source.url}-${opp.target.url}`;
      const existing = uniqueOpportunities.get(key);
      
      if (!existing || opp.estimatedValue > existing.estimatedValue) {
        uniqueOpportunities.set(key, opp);
      }
    }
    
    // Sort by priority and estimated value
    return Array.from(uniqueOpportunities.values())
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.estimatedValue - a.estimatedValue;
      });
  }

  private analyzeAnchorTextDistribution(opportunities: InternalLinkOpportunity[]) {
    const distribution: Record<string, number> = {};
    const anchors = opportunities.map(opp => opp.anchor.text.toLowerCase());
    
    for (const anchor of anchors) {
      distribution[anchor] = (distribution[anchor] || 0) + 1;
    }
    
    // Identify over/under used anchors
    const totalAnchors = anchors.length;
    const averageUsage = totalAnchors / Object.keys(distribution).length;
    
    const overUsed = Object.entries(distribution)
      .filter(([_, count]) => count > averageUsage * 1.5)
      .map(([anchor]) => anchor);
    
    const underUsed = Object.entries(distribution)
      .filter(([_, count]) => count < averageUsage * 0.5)
      .map(([anchor]) => anchor);
    
    const recommendations: string[] = [];
    if (overUsed.length > 0) {
      recommendations.push(`Diversify anchor text for: ${overUsed.join(', ')}`);
    }
    if (underUsed.length > 0) {
      recommendations.push(`Increase usage of: ${underUsed.join(', ')}`);
    }
    
    return {
      distribution,
      overUsed,
      underUsed,
      recommendations
    };
  }

  private analyzeClusterAuthority(opportunities: InternalLinkOpportunity[]) {
    const clusterStats: Record<string, { inbound: number; outbound: number; authority: number }> = {};
    
    for (const opp of opportunities) {
      const sourceCluster = opp.source.cluster;
      const targetCluster = opp.target.cluster;
      
      if (!clusterStats[sourceCluster]) {
        clusterStats[sourceCluster] = { inbound: 0, outbound: 0, authority: 0 };
      }
      if (!clusterStats[targetCluster]) {
        clusterStats[targetCluster] = { inbound: 0, outbound: 0, authority: 0 };
      }
      
      clusterStats[sourceCluster].outbound++;
      clusterStats[targetCluster].inbound++;
      clusterStats[targetCluster].authority += opp.authority;
    }
    
    return Object.entries(clusterStats).map(([cluster, stats]) => ({
      cluster,
      inboundLinks: stats.inbound,
      outboundLinks: stats.outbound,
      authorityFlow: Math.round(stats.authority * 10) / 10,
      recommendations: this.generateClusterRecommendations(cluster, stats)
    }));
  }

  private generateClusterRecommendations(cluster: string, stats: { inbound: number; outbound: number; authority: number }): string[] {
    const recommendations: string[] = [];
    
    if (stats.inbound === 0) {
      recommendations.push('Consider creating linking opportunities to this cluster');
    }
    
    if (stats.outbound === 0) {
      recommendations.push('Add outbound links to related clusters');
    }
    
    if (stats.authority < 1) {
      recommendations.push('Increase authority flow by linking from high-value pages');
    }
    
    return recommendations;
  }

  private createImplementationPhases(opportunities: InternalLinkOpportunity[]) {
    const phaseOne: string[] = []; // High priority, easy implementation
    const phaseTwo: string[] = []; // Medium priority or strategic value
    const phaseThree: string[] = []; // Long-term opportunities
    
    for (const opp of opportunities) {
      if (opp.priority === 'high' && opp.implementation.difficulty === 'easy') {
        phaseOne.push(opp.id);
      } else if (opp.priority === 'high' || opp.estimatedValue > 150) {
        phaseTwo.push(opp.id);
      } else {
        phaseThree.push(opp.id);
      }
    }
    
    return { phaseOne, phaseTwo, phaseThree };
  }

  private calculateMetadata(opportunities: InternalLinkOpportunity[]) {
    const totalOpportunities = opportunities.length;
    const highPriorityCount = opportunities.filter(opp => opp.priority === 'high').length;
    const estimatedTotalValue = opportunities.reduce((sum, opp) => sum + opp.estimatedValue, 0);
    const policyViolations = opportunities.filter(opp => !opp.policyCompliant).length;
    
    return {
      generatedAt: new Date().toISOString(),
      totalOpportunities,
      highPriorityCount,
      estimatedTotalValue,
      policyViolations
    };
  }

  // Helper methods
  private initializeProductPages() {
    this.productPages = new Map([
      ['convert-my-file', {
        url: '/convert-my-file/',
        title: 'Convert My File - Chrome Extension',
        primaryKeyword: 'file converter',
        isMainProduct: true,
        features: ['pdf converter', 'image converter', 'document converter']
      }],
      ['palette-kit', {
        url: '/palette-kit/',
        title: 'Palette Kit - Chrome Extension',
        primaryKeyword: 'color picker',
        isMainProduct: true,
        features: ['color picker', 'palette generator', 'color extractor']
      }],
      ['notebridge', {
        url: '/notebridge/',
        title: 'NoteBridge - Chrome Extension',
        primaryKeyword: 'note taking',
        isMainProduct: true,
        features: ['note taking', 'bookmark manager', 'web clipper']
      }]
    ]);
  }

  private initializeCompetitorTerms() {
    this.competitorTerms = new Set([
      'smallpdf', 'ilovepdf', 'pdf24', 'sejda', 'soda pdf',
      'convertio', 'cloudconvert', 'zamzar', 'online-convert',
      'coolutils', 'adobe acrobat', 'foxit', 'nitro pdf'
    ]);
  }

  private extractKeywords(content: ContentInfo): string[] {
    const keywords: string[] = [];
    
    // Add cluster keywords
    keywords.push(...content.cluster.toLowerCase().split(' '));
    
    // Add title keywords
    keywords.push(...content.title.toLowerCase().split(' '));
    
    // Add content-specific keywords
    if (content.opportunity) {
      keywords.push(...content.opportunity.query.toLowerCase().split(' '));
    }
    
    if (content.calendarEntry) {
      keywords.push(...content.calendarEntry.targetKeywords.map(k => k.toLowerCase()));
    }
    
    // Filter and deduplicate
    return [...new Set(keywords.filter(k => k.length > 2))];
  }

  private calculateKeywordOverlap(keywords1: string[], keywords2: string[]): number {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter(k => set2.has(k)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private areClustersRelated(cluster1: string, cluster2: string): boolean {
    const relatedTerms = [
      ['pdf', 'document', 'file'],
      ['image', 'photo', 'picture'],
      ['converter', 'conversion', 'transform'],
      ['color', 'palette', 'design'],
      ['note', 'bookmark', 'save']
    ];
    
    for (const group of relatedTerms) {
      const cluster1HasTerm = group.some(term => cluster1.toLowerCase().includes(term));
      const cluster2HasTerm = group.some(term => cluster2.toLowerCase().includes(term));
      
      if (cluster1HasTerm && cluster2HasTerm) {
        return true;
      }
    }
    
    return false;
  }

  private calculateContentTypeSynergy(type1: string, type2: string): number {
    const synergyMatrix: Record<string, Record<string, number>> = {
      'guide': { 'tutorial': 0.8, 'comparison': 0.6, 'product': 0.7 },
      'tutorial': { 'guide': 0.8, 'product': 0.9, 'case-study': 0.6 },
      'comparison': { 'guide': 0.6, 'product': 0.8, 'case-study': 0.5 },
      'product': { 'guide': 0.7, 'tutorial': 0.9, 'comparison': 0.8 },
      'case-study': { 'tutorial': 0.6, 'comparison': 0.5, 'guide': 0.4 }
    };
    
    return synergyMatrix[type1]?.[type2] || 0.3;
  }

  private areProductRelated(source: ContentInfo, target: ContentInfo): boolean {
    if (!source.productInfo && !target.productInfo) return false;
    
    const sourceProduct = source.productInfo?.primaryKeyword || source.cluster;
    const targetProduct = target.productInfo?.primaryKeyword || target.cluster;
    
    return this.areClustersRelated(sourceProduct, targetProduct);
  }

  private generateUrl(cluster: string): string {
    const slug = cluster.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `/${slug}/`;
  }

  private generateTitle(cluster: string): string {
    return cluster.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private estimateImplementationDifficulty(source: ContentInfo, target: ContentInfo): 'easy' | 'medium' | 'hard' {
    // Easy: both are planned content or product pages
    if ((source.calendarEntry || source.productInfo) && (target.calendarEntry || target.productInfo)) {
      return 'easy';
    }
    
    // Medium: one existing, one planned
    if (source.calendarEntry || target.calendarEntry) {
      return 'medium';
    }
    
    // Hard: existing content that needs modification
    return 'hard';
  }

  private estimateImplementationTime(source: ContentInfo, target: ContentInfo): number {
    const difficulty = this.estimateImplementationDifficulty(source, target);
    
    const timeEstimates = {
      easy: 5,    // 5 minutes
      medium: 15, // 15 minutes
      hard: 30    // 30 minutes
    };
    
    return timeEstimates[difficulty];
  }

  private generateImplementationNotes(source: ContentInfo, target: ContentInfo): string {
    const notes: string[] = [];
    
    if (source.calendarEntry) {
      notes.push('Add during content creation');
    } else {
      notes.push('Update existing content');
    }
    
    if (target.productInfo?.isMainProduct) {
      notes.push('High-priority product link');
    }
    
    if (this.estimateImplementationDifficulty(source, target) === 'hard') {
      notes.push('Requires careful content integration');
    }
    
    return notes.join('. ');
  }

  private isAnchorOverUsed(anchorText: string): boolean {
    // Simple check - in real implementation, this would track usage across all content
    return anchorText.length < 3 || anchorText === 'click here' || anchorText === 'read more';
  }

  private isAnchorRelevant(anchorText: string, source: ContentInfo, target: ContentInfo): boolean {
    const targetKeywords = this.extractKeywords(target);
    return targetKeywords.some(keyword => 
      anchorText.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}

// Supporting interfaces
interface ProductPageInfo {
  url: string;
  title: string;
  primaryKeyword: string;
  isMainProduct: boolean;
  features: string[];
}

interface ContentInfo {
  id: string;
  url: string;
  title: string;
  cluster: string;
  contentType: string;
  opportunity?: OpportunityItem;
  calendarEntry?: ContentCalendarEntry;
  productInfo?: ProductPageInfo;
}

interface AnchorOption {
  text: string;
  context: string;
  placement: 'introduction' | 'body' | 'conclusion' | 'sidebar';
  naturalness: number;
}

// Export utility functions
export const InternalLinkingUtils = {
  formatStrategyAsMarkdown(strategy: InternalLinkingStrategy): string {
    let markdown = `# Internal Linking Strategy\n\n`;
    
    // Metadata
    markdown += `## Overview\n`;
    markdown += `- **Generated**: ${new Date(strategy.metadata.generatedAt).toLocaleDateString()}\n`;
    markdown += `- **Total Opportunities**: ${strategy.metadata.totalOpportunities}\n`;
    markdown += `- **High Priority**: ${strategy.metadata.highPriorityCount}\n`;
    markdown += `- **Estimated Value**: ${strategy.metadata.estimatedTotalValue}\n`;
    markdown += `- **Policy Violations**: ${strategy.metadata.policyViolations}\n\n`;
    
    // Implementation phases
    markdown += `## Implementation Roadmap\n\n`;
    markdown += `### Phase 1: Quick Wins (${strategy.implementation.phaseOne.length} opportunities)\n`;
    markdown += `Immediate implementation for high-priority, easy-to-implement links.\n\n`;
    
    markdown += `### Phase 2: Strategic Links (${strategy.implementation.phaseTwo.length} opportunities)\n`;
    markdown += `Medium-term implementation for high-value opportunities.\n\n`;
    
    markdown += `### Phase 3: Long-term Growth (${strategy.implementation.phaseThree.length} opportunities)\n`;
    markdown += `Future opportunities for sustained growth.\n\n`;
    
    // High priority opportunities
    const highPriorityOpps = strategy.opportunities.filter(opp => opp.priority === 'high').slice(0, 10);
    if (highPriorityOpps.length > 0) {
      markdown += `## Top Priority Opportunities\n\n`;
      for (const opp of highPriorityOpps) {
        markdown += `### ${opp.source.title} → ${opp.target.title}\n`;
        markdown += `- **Anchor Text**: "${opp.anchor.text}"\n`;
        markdown += `- **Relevance**: ${(opp.relevance * 100).toFixed(0)}%\n`;
        markdown += `- **Estimated Value**: ${opp.estimatedValue}\n`;
        markdown += `- **Implementation**: ${opp.implementation.difficulty} (${opp.implementation.timeEstimate}min)\n`;
        markdown += `- **Notes**: ${opp.implementation.notes}\n\n`;
      }
    }
    
    return markdown;
  },

  exportOpportunitiesAsCSV(opportunities: InternalLinkOpportunity[]): string {
    const headers = [
      'Source URL', 'Source Title', 'Target URL', 'Target Title',
      'Anchor Text', 'Relevance', 'Authority', 'Priority', 'Link Type',
      'Estimated Value', 'Policy Compliant', 'Implementation Difficulty',
      'Time Estimate', 'Implementation Notes'
    ];
    
    const rows = opportunities.map(opp => [
      opp.source.url,
      opp.source.title,
      opp.target.url,
      opp.target.title,
      opp.anchor.text,
      (opp.relevance * 100).toFixed(0) + '%',
      (opp.authority * 100).toFixed(0) + '%',
      opp.priority,
      opp.linkType,
      opp.estimatedValue.toString(),
      opp.policyCompliant ? 'Yes' : 'No',
      opp.implementation.difficulty,
      opp.implementation.timeEstimate.toString() + ' min',
      opp.implementation.notes
    ]);
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }
};