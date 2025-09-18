/**
 * Link Optimizer for Internal Linking Opportunities
 * v1.8 Phase 4: Link Optimization System
 */

import { LinkOpportunity, LinkType } from './types.js';

export interface Page {
  url: string;
  title: string;
  content: string;
  keywords: string[];
  entities: string[];
  existingLinks?: string[];
}

export interface LinkConstraints {
  maxLinksPerPage?: number;
  maxSameTargetLinks?: number;
  minTextDistance?: number;
  requireRelevance?: number;
  avoidSelfLinks?: boolean;
  diversifyAnchors?: boolean;
}

export class LinkOptimizer {
  private defaultConstraints: LinkConstraints = {
    maxLinksPerPage: 3,
    maxSameTargetLinks: 1,
    minTextDistance: 150, // Minimum characters between links
    requireRelevance: 0.3,
    avoidSelfLinks: true,
    diversifyAnchors: true
  };

  /**
   * Find linking opportunities between pages
   */
  findOpportunities(
    sourcePage: Page,
    targetPages: Page[],
    constraints: LinkConstraints = {}
  ): LinkOpportunity[] {
    const opportunities: LinkOpportunity[] = [];
    const appliedConstraints = { ...this.defaultConstraints, ...constraints };

    // Filter out self-links if configured
    const validTargets = appliedConstraints.avoidSelfLinks
      ? targetPages.filter(t => t.url !== sourcePage.url)
      : targetPages;

    // Analyze each potential target
    for (const targetPage of validTargets) {
      const pageOpportunities = this.findPageOpportunities(
        sourcePage,
        targetPage,
        appliedConstraints
      );
      opportunities.push(...pageOpportunities);
    }

    // Apply constraints and sort by strength
    const constrainedOpportunities = this.applyConstraints(
      opportunities,
      appliedConstraints
    );

    return constrainedOpportunities.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Calculate strength score for a link opportunity
   */
  calculateStrength(link: LinkOpportunity): number {
    let strength = 0;

    // Relevance factor (0-1)
    const relevance = this.calculateRelevance(link);
    strength += relevance * 0.4;

    // Context quality (0-1)
    const contextQuality = this.assessContextQuality(link.context);
    strength += contextQuality * 0.3;

    // Link type value (0-1)
    const typeValue = this.getLinkTypeValue(link.type);
    strength += typeValue * 0.2;

    // Anchor text quality (0-1)
    const anchorQuality = this.assessAnchorQuality(link.anchorText);
    strength += anchorQuality * 0.1;

    // Convert to 1-3 scale
    return Math.ceil(strength * 3);
  }

  /**
   * Generate anchor text variations for an entity
   */
  generateAnchors(entity: string, context?: string): string[] {
    const anchors: string[] = [];

    // Exact match
    anchors.push(entity);

    // Variations with common prefixes
    const prefixes = ['learn about', 'explore', 'discover', 'see our'];
    for (const prefix of prefixes.slice(0, 2)) {
      anchors.push(`${prefix} ${entity}`);
    }

    // Contextual variations
    if (context) {
      const contextualAnchors = this.generateContextualAnchors(entity, context);
      anchors.push(...contextualAnchors);
    }

    // Action-based anchors
    const actionAnchors = this.generateActionAnchors(entity);
    anchors.push(...actionAnchors);

    // Synonym variations
    const synonyms = this.generateSynonyms(entity);
    anchors.push(...synonyms);

    // Remove duplicates and limit
    return Array.from(new Set(anchors)).slice(0, 10);
  }

  /**
   * Apply constraints to limit and diversify links
   */
  applyConstraints(
    opportunities: LinkOpportunity[],
    constraints: LinkConstraints
  ): LinkOpportunity[] {
    const filtered: LinkOpportunity[] = [];
    const linkCounts = new Map<string, number>();
    const targetCounts = new Map<string, number>();
    const usedAnchors = new Set<string>();

    for (const opp of opportunities) {
      const sourceCount = linkCounts.get(opp.sourceUrl) || 0;
      const targetCount = targetCounts.get(opp.targetUrl) || 0;

      // Check max links per page
      if (constraints.maxLinksPerPage && sourceCount >= constraints.maxLinksPerPage) {
        continue;
      }

      // Check max same target links
      if (constraints.maxSameTargetLinks && targetCount >= constraints.maxSameTargetLinks) {
        continue;
      }

      // Check relevance threshold
      if (constraints.requireRelevance && opp.strength < constraints.requireRelevance) {
        continue;
      }

      // Check anchor diversity
      if (constraints.diversifyAnchors) {
        const normalizedAnchor = opp.anchorText.toLowerCase();
        if (usedAnchors.has(normalizedAnchor)) {
          // Try to find alternative anchor
          const alternatives = this.generateAnchors(opp.anchorText);
          const unusedAnchor = alternatives.find(a =>
            !usedAnchors.has(a.toLowerCase())
          );
          if (unusedAnchor) {
            opp.anchorText = unusedAnchor;
          } else {
            continue; // Skip if no unique anchor available
          }
        }
        usedAnchors.add(normalizedAnchor);
      }

      // Add to filtered list
      filtered.push(opp);
      linkCounts.set(opp.sourceUrl, sourceCount + 1);
      targetCounts.set(opp.targetUrl, targetCount + 1);
    }

    return filtered;
  }

  /**
   * Validate link opportunities for quality
   */
  validateOpportunities(opportunities: LinkOpportunity[]): {
    valid: LinkOpportunity[];
    invalid: Array<{ opportunity: LinkOpportunity; reason: string }>;
  } {
    const valid: LinkOpportunity[] = [];
    const invalid: Array<{ opportunity: LinkOpportunity; reason: string }> = [];

    for (const opp of opportunities) {
      const validation = this.validateLink(opp);
      if (validation.valid) {
        valid.push(opp);
      } else {
        invalid.push({ opportunity: opp, reason: validation.reason });
      }
    }

    return { valid, invalid };
  }

  /**
   * Private helper methods
   */
  private findPageOpportunities(
    source: Page,
    target: Page,
    constraints: LinkConstraints
  ): LinkOpportunity[] {
    const opportunities: LinkOpportunity[] = [];

    // Skip if already linked
    if (source.existingLinks?.includes(target.url)) {
      return opportunities;
    }

    // Find keyword matches
    const keywordMatches = this.findKeywordMatches(source, target);
    for (const match of keywordMatches) {
      opportunities.push(this.createOpportunity(
        source,
        target,
        match.keyword,
        match.context,
        LinkType.Contextual
      ));
    }

    // Find entity matches
    const entityMatches = this.findEntityMatches(source, target);
    for (const match of entityMatches) {
      opportunities.push(this.createOpportunity(
        source,
        target,
        match.entity,
        match.context,
        LinkType.Related
      ));
    }

    // Check for deep linking opportunities
    if (this.isDeepLinkCandidate(source, target)) {
      const deepLink = this.createDeepLinkOpportunity(source, target);
      if (deepLink) opportunities.push(deepLink);
    }

    return opportunities;
  }

  private findKeywordMatches(
    source: Page,
    target: Page
  ): Array<{ keyword: string; context: string }> {
    const matches: Array<{ keyword: string; context: string }> = [];

    for (const keyword of target.keywords) {
      const pattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
      const contentMatches = source.content.matchAll(pattern);

      for (const match of contentMatches) {
        const context = this.extractContext(source.content, match.index || 0);
        matches.push({ keyword, context });
        break; // One match per keyword
      }
    }

    return matches;
  }

  private findEntityMatches(
    source: Page,
    target: Page
  ): Array<{ entity: string; context: string }> {
    const matches: Array<{ entity: string; context: string }> = [];

    for (const entity of target.entities) {
      if (source.content.toLowerCase().includes(entity.toLowerCase())) {
        const index = source.content.toLowerCase().indexOf(entity.toLowerCase());
        const context = this.extractContext(source.content, index);
        matches.push({ entity, context });
      }
    }

    return matches;
  }

  private isDeepLinkCandidate(source: Page, target: Page): boolean {
    // Check if source mentions specific features/sections of target
    const targetSections = this.extractSections(target.url);
    return targetSections.some(section =>
      source.content.toLowerCase().includes(section.toLowerCase())
    );
  }

  private createOpportunity(
    source: Page,
    target: Page,
    anchorText: string,
    context: string,
    type: LinkType
  ): LinkOpportunity {
    const opportunity: LinkOpportunity = {
      sourceUrl: source.url,
      targetUrl: target.url,
      anchorText,
      context,
      strength: 0,
      rationale: this.generateRationale(type, source.title, target.title),
      type
    };

    // Calculate initial strength
    opportunity.strength = this.calculateStrength(opportunity);

    return opportunity;
  }

  private createDeepLinkOpportunity(source: Page, target: Page): LinkOpportunity | null {
    // Find the most relevant section to link to
    const relevantSection = this.findMostRelevantSection(source.content, target);

    if (!relevantSection) return null;

    return {
      sourceUrl: source.url,
      targetUrl: `${target.url}#${relevantSection}`,
      anchorText: `learn more about ${relevantSection.replace(/-/g, ' ')}`,
      context: `Deep link to specific section: ${relevantSection}`,
      strength: 2,
      rationale: `Deep link to relevant section for better user experience`,
      type: LinkType.DeepLink
    };
  }

  private calculateRelevance(link: LinkOpportunity): number {
    // Simple relevance calculation based on context
    const contextWords = link.context.toLowerCase().split(/\s+/);
    const anchorWords = link.anchorText.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of anchorWords) {
      if (contextWords.includes(word)) matches++;
    }

    return Math.min(1, matches / anchorWords.length);
  }

  private assessContextQuality(context: string): number {
    // Quality based on context length and structure
    const wordCount = context.split(/\s+/).length;

    if (wordCount < 10) return 0.3;
    if (wordCount < 20) return 0.6;
    if (wordCount < 30) return 0.8;
    return 1;
  }

  private getLinkTypeValue(type: LinkType): number {
    const values = {
      [LinkType.Contextual]: 1,
      [LinkType.Related]: 0.8,
      [LinkType.DeepLink]: 0.9,
      [LinkType.Navigation]: 0.6
    };
    return values[type] || 0.5;
  }

  private assessAnchorQuality(anchor: string): number {
    // Quality based on anchor text descriptiveness
    const wordCount = anchor.split(/\s+/).length;

    if (wordCount === 1) return 0.5;
    if (wordCount === 2) return 0.7;
    if (wordCount <= 4) return 0.9;
    if (wordCount <= 6) return 0.8;
    return 0.6; // Too long
  }

  private generateContextualAnchors(entity: string, context: string): string[] {
    const anchors: string[] = [];

    // Extract action verbs from context
    const actionVerbs = ['convert', 'transform', 'process', 'optimize', 'improve'];
    for (const verb of actionVerbs) {
      if (context.toLowerCase().includes(verb)) {
        anchors.push(`${verb} ${entity}`);
      }
    }

    return anchors.slice(0, 3);
  }

  private generateActionAnchors(entity: string): string[] {
    const actions = ['try', 'use', 'get started with'];
    return actions.map(action => `${action} ${entity}`).slice(0, 2);
  }

  private generateSynonyms(entity: string): string[] {
    // Simple synonym generation
    const synonymMap: Record<string, string[]> = {
      'converter': ['conversion tool', 'transformer'],
      'optimizer': ['optimization tool', 'enhancer'],
      'generator': ['creator', 'builder'],
      'picker': ['selector', 'chooser']
    };

    const synonyms: string[] = [];
    for (const [key, values] of Object.entries(synonymMap)) {
      if (entity.toLowerCase().includes(key)) {
        synonyms.push(...values);
      }
    }

    return synonyms.slice(0, 2);
  }

  private validateLink(opportunity: LinkOpportunity): {
    valid: boolean;
    reason: string;
  } {
    // Check for circular references
    if (opportunity.sourceUrl === opportunity.targetUrl) {
      return { valid: false, reason: 'Self-link detected' };
    }

    // Check anchor text quality
    if (!opportunity.anchorText || opportunity.anchorText.length < 2) {
      return { valid: false, reason: 'Anchor text too short' };
    }

    if (opportunity.anchorText.length > 60) {
      return { valid: false, reason: 'Anchor text too long' };
    }

    // Check for spam patterns
    const spamPatterns = ['click here', 'read more', 'link', 'url'];
    if (spamPatterns.some(pattern =>
      opportunity.anchorText.toLowerCase() === pattern
    )) {
      return { valid: false, reason: 'Generic anchor text' };
    }

    return { valid: true, reason: '' };
  }

  private extractContext(content: string, index: number, windowSize: number = 100): string {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(content.length, index + windowSize);
    return content.substring(start, end).trim();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractSections(url: string): string[] {
    // Extract potential section anchors from URL structure
    const parts = url.split('/').filter(p => p);
    return parts.slice(-2); // Last two segments
  }

  private findMostRelevantSection(content: string, target: Page): string | null {
    const sections = this.extractSections(target.url);

    // Find which section is mentioned most in source content
    let bestSection = null;
    let maxMentions = 0;

    for (const section of sections) {
      const mentions = (content.match(new RegExp(section, 'gi')) || []).length;
      if (mentions > maxMentions) {
        maxMentions = mentions;
        bestSection = section;
      }
    }

    return maxMentions > 0 ? bestSection : null;
  }

  private generateRationale(type: LinkType, sourceTitle: string, targetTitle: string): string {
    const rationales = {
      [LinkType.Contextual]: `Contextual link from "${sourceTitle}" to related content in "${targetTitle}"`,
      [LinkType.Related]: `Related content link connecting "${sourceTitle}" with "${targetTitle}"`,
      [LinkType.DeepLink]: `Deep link to specific section for enhanced user navigation`,
      [LinkType.Navigation]: `Navigation link for improved site structure`
    };

    return rationales[type] || `Link from ${sourceTitle} to ${targetTitle}`;
  }
}