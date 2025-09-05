import pino from 'pino';
import { KeywordData } from '../types/keyword-data.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface EdgeStoreListing {
  name: string;
  shortDescription: string;
  detailedDescription: string;
  keywords: string[];
  category: string;
  screenshots?: Screenshot[];
  video?: string;
}

export interface Screenshot {
  url: string;
  caption?: string;
}

export interface TitleVariant {
  title: string;
  reasoning: string;
  characterCount: number;
  keywords: string[];
  expectedCTR?: number;
}

export interface DescriptionVariant {
  type: 'benefit-led' | 'feature-led' | 'social-proof';
  short: string;
  detailed: string;
  keywords: string[];
}

export interface KeywordRecommendation {
  keyword: string;
  volume: number;
  relevance: number;
  action: 'add' | 'remove' | 'keep';
  reasoning: string;
}

export interface AssetChecklistItem {
  asset: string;
  present: boolean;
  recommendation: string;
}

export interface StoreOptimization {
  currentTitle: string;
  titleVariants: TitleVariant[];
  descriptionVariants: DescriptionVariant[];
  keywordRecommendations: KeywordRecommendation[];
  assetChecklist: AssetChecklistItem[];
  competitorComparison?: string;
  prioritizedActions: string[];
  expectedLift: {
    discoverability: number;
    ctr: number;
    installs: number;
  };
  keywordCount: number;
  totalVolume: number;
}

export class EdgeStoreAnalyzer {
  
  /**
   * Analyze Edge Store listing with keyword data
   */
  async analyzeWithKeywordData(
    listing: EdgeStoreListing,
    keywordData: KeywordData[]
  ): Promise<StoreOptimization> {
    logger.info(`Analyzing Edge Store listing for: ${listing.name}`);
    
    // Sort keywords by score for prioritization
    const topKeywords = keywordData
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    
    const titleVariants = this.generateTitleVariants(listing.name, topKeywords);
    const descriptionVariants = this.generateDescriptionVariants(listing, topKeywords);
    const keywordRecommendations = this.optimizeKeywords(listing.keywords, topKeywords);
    const assetChecklist = this.checkAssets(listing);
    const expectedLift = this.calculateExpectedLift(topKeywords, keywordRecommendations);
    
    const prioritizedActions = this.generatePrioritizedActions(
      titleVariants,
      descriptionVariants,
      keywordRecommendations,
      assetChecklist
    );
    
    return {
      currentTitle: listing.name,
      titleVariants,
      descriptionVariants,
      keywordRecommendations,
      assetChecklist,
      prioritizedActions,
      expectedLift,
      keywordCount: topKeywords.length,
      totalVolume: topKeywords.reduce((sum, kw) => sum + (kw.volume || 0), 0)
    };
  }
  
  /**
   * Generate title variants optimized for Edge Store (max 45 chars)
   */
  private generateTitleVariants(currentTitle: string, keywords: KeywordData[]): TitleVariant[] {
    const variants: TitleVariant[] = [];
    
    // Find the highest scoring keyword
    const topKeyword = keywords[0];
    const chromeKeyword = keywords.find(k => k.keyword.includes('chrome')) || keywords[1];
    
    // Variant 1: Include top keyword
    if (topKeyword) {
      const title1 = this.truncateTitle(`${currentTitle} - ${this.extractKeyPhrase(topKeyword.keyword)}`, 45);
      variants.push({
        title: title1,
        reasoning: 'Include highest scoring search term',
        characterCount: title1.length,
        keywords: [topKeyword.keyword],
        expectedCTR: topKeyword.score * 0.1
      });
    }
    
    // Variant 2: Lead with keyword
    if (chromeKeyword) {
      const keyPhrase = this.extractKeyPhrase(chromeKeyword.keyword);
      const title2 = this.truncateTitle(`${keyPhrase} - ${currentTitle}`, 45);
      variants.push({
        title: title2,
        reasoning: 'Lead with Chrome-specific keyword for relevance',
        characterCount: title2.length,
        keywords: [chromeKeyword.keyword],
        expectedCTR: chromeKeyword.score * 0.12
      });
    }
    
    // Variant 3: Benefit-focused
    const benefitKeyword = keywords.find(k => 
      k.keyword.includes('free') || 
      k.keyword.includes('best') || 
      k.keyword.includes('professional')
    );
    if (benefitKeyword) {
      const benefit = this.extractBenefit(benefitKeyword.keyword);
      const title3 = this.truncateTitle(`${currentTitle} - ${benefit}`, 45);
      variants.push({
        title: title3,
        reasoning: 'Emphasize key benefit for higher CTR',
        characterCount: title3.length,
        keywords: [benefitKeyword.keyword],
        expectedCTR: benefitKeyword.score * 0.11
      });
    }
    
    return variants;
  }
  
  /**
   * Generate description variants
   */
  private generateDescriptionVariants(
    listing: EdgeStoreListing,
    keywords: KeywordData[]
  ): DescriptionVariant[] {
    const variants: DescriptionVariant[] = [];
    
    // Extract key themes from top keywords
    const themes = this.extractThemes(keywords);
    
    // Benefit-led variant
    variants.push({
      type: 'benefit-led',
      short: this.generateBenefitShortDesc(themes.primaryBenefit, listing.name),
      detailed: this.generateBenefitDetailedDesc(themes, listing),
      keywords: themes.benefitKeywords
    });
    
    // Feature-led variant  
    variants.push({
      type: 'feature-led',
      short: this.generateFeatureShortDesc(listing),
      detailed: this.generateFeatureDetailedDesc(listing, themes),
      keywords: themes.featureKeywords
    });
    
    // Social proof variant
    variants.push({
      type: 'social-proof',
      short: this.generateSocialProofShortDesc(listing.name),
      detailed: this.generateSocialProofDetailedDesc(listing, themes),
      keywords: themes.allKeywords
    });
    
    return variants;
  }
  
  /**
   * Optimize keywords for Edge Store
   */
  private optimizeKeywords(
    currentKeywords: string[],
    topKeywords: KeywordData[]
  ): KeywordRecommendation[] {
    const recommendations: KeywordRecommendation[] = [];
    
    // Check current keywords
    for (const keyword of currentKeywords) {
      const match = topKeywords.find(k => 
        k.keyword.toLowerCase().includes(keyword.toLowerCase()) ||
        keyword.toLowerCase().includes(k.keyword.toLowerCase())
      );
      
      if (match) {
        recommendations.push({
          keyword,
          volume: match.volume || 0,
          relevance: match.score,
          action: 'keep',
          reasoning: `High relevance (${(match.score * 100).toFixed(0)}% score)`
        });
      } else {
        recommendations.push({
          keyword,
          volume: 0,
          relevance: 0.2,
          action: 'remove',
          reasoning: 'Low search volume and relevance'
        });
      }
    }
    
    // Recommend new keywords
    for (const kw of topKeywords.slice(0, 10)) {
      const keyword = this.extractKeyPhrase(kw.keyword);
      if (!currentKeywords.includes(keyword)) {
        recommendations.push({
          keyword,
          volume: kw.volume || 0,
          relevance: kw.score,
          action: 'add',
          reasoning: `High search volume (${kw.volume} searches/month)`
        });
      }
    }
    
    return recommendations;
  }
  
  /**
   * Check assets and provide recommendations
   */
  private checkAssets(listing: EdgeStoreListing): AssetChecklistItem[] {
    return [
      {
        asset: 'Title (≤45 characters)',
        present: listing.name.length <= 45,
        recommendation: listing.name.length > 45 ? 
          `Shorten by ${listing.name.length - 45} characters` : 
          'Optimal length'
      },
      {
        asset: 'Short Description (≤132 characters)',
        present: listing.shortDescription.length <= 132,
        recommendation: listing.shortDescription.length > 132 ?
          `Shorten by ${listing.shortDescription.length - 132} characters` :
          'Good length for preview'
      },
      {
        asset: 'Detailed Description',
        present: listing.detailedDescription.length >= 200,
        recommendation: listing.detailedDescription.length < 200 ?
          'Expand with features and benefits' :
          'Comprehensive description'
      },
      {
        asset: 'Screenshots (5+ recommended)',
        present: (listing.screenshots?.length || 0) >= 5,
        recommendation: (listing.screenshots?.length || 0) < 5 ?
          `Add ${5 - (listing.screenshots?.length || 0)} more screenshots` :
          'Good visual coverage'
      },
      {
        asset: 'Keywords (5-10 recommended)',
        present: listing.keywords.length >= 5 && listing.keywords.length <= 10,
        recommendation: listing.keywords.length < 5 ?
          'Add more relevant keywords' :
          listing.keywords.length > 10 ?
          'Focus on most relevant keywords' :
          'Good keyword count'
      },
      {
        asset: 'Video Demo',
        present: !!listing.video,
        recommendation: !listing.video ?
          'Add 30-60 second demo video' :
          'Video present'
      }
    ];
  }
  
  /**
   * Calculate expected lift from optimizations
   */
  private calculateExpectedLift(
    keywords: KeywordData[],
    recommendations: KeywordRecommendation[]
  ): { discoverability: number; ctr: number; installs: number } {
    // Base calculations
    const avgScore = keywords.reduce((sum, k) => sum + k.score, 0) / keywords.length;
    const addedKeywords = recommendations.filter(r => r.action === 'add').length;
    const removedKeywords = recommendations.filter(r => r.action === 'remove').length;
    
    // Estimate lift percentages
    const discoverability = Math.min(50, (addedKeywords * 5) + (avgScore * 20));
    const ctr = Math.min(30, (avgScore * 25) + (addedKeywords * 2));
    const installs = Math.min(25, (discoverability * 0.3) + (ctr * 0.4));
    
    return {
      discoverability: Math.round(discoverability),
      ctr: Math.round(ctr),
      installs: Math.round(installs)
    };
  }
  
  /**
   * Generate prioritized action items
   */
  private generatePrioritizedActions(
    titleVariants: TitleVariant[],
    descriptionVariants: DescriptionVariant[],
    keywordRecommendations: KeywordRecommendation[],
    assetChecklist: AssetChecklistItem[]
  ): string[] {
    const actions: string[] = [];
    
    // Priority 1: Title optimization
    if (titleVariants.length > 0) {
      actions.push(`Update title to: "${titleVariants[0].title}" for ${Math.round((titleVariants[0].expectedCTR || 0) * 100)}% CTR improvement`);
    }
    
    // Priority 2: Add high-value keywords
    const topAdditions = keywordRecommendations
      .filter(r => r.action === 'add')
      .slice(0, 3);
    if (topAdditions.length > 0) {
      actions.push(`Add keywords: ${topAdditions.map(k => k.keyword).join(', ')}`);
    }
    
    // Priority 3: Fix missing assets
    const missingAssets = assetChecklist.filter(a => !a.present);
    if (missingAssets.length > 0) {
      actions.push(`Fix assets: ${missingAssets.map(a => a.asset).join(', ')}`);
    }
    
    // Priority 4: Update description
    if (descriptionVariants.length > 0) {
      actions.push(`Test ${descriptionVariants[0].type} description variant`);
    }
    
    // Priority 5: Remove low-value keywords
    const removals = keywordRecommendations.filter(r => r.action === 'remove');
    if (removals.length > 0) {
      actions.push(`Remove low-relevance keywords: ${removals.map(k => k.keyword).join(', ')}`);
    }
    
    return actions.slice(0, 5); // Top 5 actions
  }
  
  // Helper methods
  
  private truncateTitle(title: string, maxLength: number): string {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + '...';
  }
  
  private extractKeyPhrase(keyword: string): string {
    // Extract the most meaningful 2-3 words
    const words = keyword.split(' ').filter(w => 
      !['for', 'the', 'a', 'an', 'and', 'or', 'with'].includes(w.toLowerCase())
    );
    return words.slice(0, 3).join(' ');
  }
  
  private extractBenefit(keyword: string): string {
    if (keyword.includes('free')) return 'Free';
    if (keyword.includes('best')) return 'Best Rated';
    if (keyword.includes('professional')) return 'Professional';
    if (keyword.includes('easy')) return 'Easy to Use';
    if (keyword.includes('fast')) return 'Fast';
    return 'Top Rated';
  }
  
  private extractThemes(keywords: KeywordData[]): any {
    const benefitKeywords = keywords.filter(k => 
      k.keyword.match(/free|best|easy|fast|professional|simple/i)
    ).map(k => k.keyword);
    
    const featureKeywords = keywords.filter(k =>
      k.keyword.match(/tool|extension|picker|scanner|export|download/i)
    ).map(k => k.keyword);
    
    const primaryBenefit = benefitKeywords[0]?.includes('free') ? 'Free & Powerful' :
                          benefitKeywords[0]?.includes('best') ? 'Best in Class' :
                          benefitKeywords[0]?.includes('professional') ? 'Professional Grade' :
                          'Easy to Use';
    
    return {
      primaryBenefit,
      benefitKeywords: benefitKeywords.slice(0, 5),
      featureKeywords: featureKeywords.slice(0, 5),
      allKeywords: [...benefitKeywords, ...featureKeywords].slice(0, 10)
    };
  }
  
  private generateBenefitShortDesc(benefit: string, name: string): string {
    return `${benefit} ${name}. Save time and boost productivity with our Chrome extension.`;
  }
  
  private generateBenefitDetailedDesc(themes: any, listing: EdgeStoreListing): string {
    return `${themes.primaryBenefit} Chrome extension that ${listing.shortDescription.toLowerCase()}. 

Key Benefits:
• Save hours of manual work
• Professional-grade features
• No registration required
• Works on any website
• Free forever

Perfect for designers, developers, and digital professionals who need reliable tools that just work.`;
  }
  
  private generateFeatureShortDesc(listing: EdgeStoreListing): string {
    return listing.shortDescription;
  }
  
  private generateFeatureDetailedDesc(listing: EdgeStoreListing, themes: any): string {
    return `${listing.detailedDescription}

Features:
• ${themes.featureKeywords.join('\n• ')}

Compatible with all modern websites and web applications.`;
  }
  
  private generateSocialProofShortDesc(name: string): string {
    return `Join thousands using ${name}. Trusted by professionals worldwide.`;
  }
  
  private generateSocialProofDetailedDesc(listing: EdgeStoreListing, themes: any): string {
    return `Trusted by over 10,000 users worldwide. ${listing.shortDescription}

Why users love us:
• "Best Chrome extension for professionals" - Web Designer
• "Saves me hours every week" - Developer
• "Simple yet powerful" - Digital Marketer

${listing.detailedDescription}`;
  }
}