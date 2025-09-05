import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MarketConfig {
  gl: string;           // Google Location parameter
  hl: string;           // Google Host Language parameter
  currency: string;     // Currency symbol
  dateFormat: string;   // Date format preference
  numberFormat: string; // Number format (US: 1,000.00 vs EU: 1.000,00)
  timezone: string;     // Primary timezone
  spelling: 'US' | 'UK' | 'CA' | 'AU' | 'DE' | 'FR' | 'ES' | 'IT';
  culturalNotes: string; // Cultural adaptation notes
}

export interface LocalizedContent {
  market: string;
  headlines: string[];
  descriptions: string[];
  keywords: string[];
  urlSuffix?: string;   // e.g., /au/, /us/, /gb/
  seoTitle?: string;
  metaDescription?: string;
  valueProp?: string;   // Market-specific value proposition
}

export interface LocalizationResult {
  primaryMarket: string;
  localizedContent: LocalizedContent[];
  marketValidation: {
    supportedMarkets: string[];
    unsupportedMarkets: string[];
    warnings: string[];
  };
  culturalAdaptations: {
    market: string;
    adaptations: string[];
  }[];
}

// ============================================================================
// MARKET CONFIGURATION
// ============================================================================

export class LocalizationEngine {
  private marketConfigs: Record<string, MarketConfig> = {
    'AU': {
      gl: 'au',
      hl: 'en-AU',
      currency: 'AUD $',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,000.00',
      timezone: 'AEST/AEDT',
      spelling: 'UK', // Australian English follows UK conventions
      culturalNotes: 'Direct, practical messaging. Privacy-conscious market.'
    },
    'US': {
      gl: 'us',
      hl: 'en',
      currency: '$',
      dateFormat: 'MM/DD/YYYY',
      numberFormat: '1,000.00',
      timezone: 'EST/PST',
      spelling: 'US',
      culturalNotes: 'Benefit-focused, efficiency-oriented. Free tier emphasis.'
    },
    'GB': {
      gl: 'gb',
      hl: 'en-GB',
      currency: '£',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,000.00',
      timezone: 'GMT/BST',
      spelling: 'UK',
      culturalNotes: 'Understated, quality-focused. Professional messaging.'
    },
    'CA': {
      gl: 'ca',
      hl: 'en-CA',
      currency: 'CAD $',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,000.00',
      timezone: 'EST/PST',
      spelling: 'CA', // Canadian English (mix of UK/US)
      culturalNotes: 'Polite, inclusive messaging. Bilingual considerations.'
    },
    'DE': {
      gl: 'de',
      hl: 'de',
      currency: '€',
      dateFormat: 'DD.MM.YYYY',
      numberFormat: '1.000,00',
      timezone: 'CET/CEST',
      spelling: 'DE',
      culturalNotes: 'Precision, quality, data protection emphasis. Formal tone.'
    },
    'FR': {
      gl: 'fr',
      hl: 'fr',
      currency: '€',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1 000,00',
      timezone: 'CET/CEST',
      spelling: 'FR',
      culturalNotes: 'Elegant, sophisticated messaging. Cultural pride.'
    },
    'ES': {
      gl: 'es',
      hl: 'es',
      currency: '€',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.000,00',
      timezone: 'CET/CEST',
      spelling: 'ES',
      culturalNotes: 'Warm, relationship-focused. Family and social emphasis.'
    },
    'IT': {
      gl: 'it',
      hl: 'it',
      currency: '€',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.000,00',
      timezone: 'CET/CEST',
      spelling: 'IT',
      culturalNotes: 'Style, design, craftsmanship focus. Premium positioning.'
    }
  };

  /**
   * Get market configuration for geo-targeting
   */
  getMarketConfig(market: string): MarketConfig | null {
    const normalizedMarket = market.toUpperCase();
    
    // Handle market aliases
    const marketAliases: Record<string, string> = {
      'UK': 'GB'  // UK is an alias for GB
    };
    
    const actualMarket = marketAliases[normalizedMarket] || normalizedMarket;
    return this.marketConfigs[actualMarket] || null;
  }

  /**
   * Get supported markets list
   */
  getSupportedMarkets(): string[] {
    const baseMarkets = Object.keys(this.marketConfigs);
    const aliases = ['UK']; // Add market aliases
    return [...baseMarkets, ...aliases];
  }

  /**
   * Validate market support and configuration
   */
  validateMarkets(requestedMarkets: string[]): {
    supported: string[];
    unsupported: string[];
    warnings: string[];
  } {
    const supported: string[] = [];
    const unsupported: string[] = [];
    const warnings: string[] = [];

    for (const market of requestedMarkets) {
      const config = this.getMarketConfig(market);
      if (config) {
        supported.push(market.toUpperCase());
      } else {
        unsupported.push(market.toUpperCase());
        warnings.push(`Market ${market.toUpperCase()} not supported, will use US defaults`);
      }
    }

    return { supported, unsupported, warnings };
  }

  /**
   * Generate localized content for all markets
   */
  async localizeContent(
    baseContent: {
      headlines: string[];
      descriptions: string[];
      keywords: string[];
      product: string;
    },
    markets: string[]
  ): Promise<LocalizationResult> {
    logger.info(`🌍 Localizing content for ${markets.length} markets: ${markets.join(', ')}`);

    const validation = this.validateMarkets(markets);
    const localizedContent: LocalizedContent[] = [];
    const culturalAdaptations: { market: string; adaptations: string[] }[] = [];

    for (const market of validation.supported) {
      const config = this.getMarketConfig(market);
      if (!config) continue;

      logger.debug(`🌐 Processing localization for ${market}`);

      // Apply spelling and terminology adaptations
      const adaptedHeadlines = this.adaptSpelling(baseContent.headlines, config.spelling);
      const adaptedDescriptions = this.adaptSpelling(baseContent.descriptions, config.spelling);
      
      // Generate market-specific keywords
      const localizedKeywords = this.generateLocalizedKeywords(
        baseContent.keywords,
        market,
        baseContent.product
      );

      // Generate SEO content
      const seoContent = this.generateMarketSeoContent(
        baseContent.product,
        market,
        config
      );

      // Apply cultural adaptations
      const culturallyAdapted = this.applyCulturalAdaptations(
        {
          headlines: adaptedHeadlines,
          descriptions: adaptedDescriptions,
          valueProp: seoContent.valueProp
        },
        config
      );

      localizedContent.push({
        market: market,
        headlines: culturallyAdapted.headlines,
        descriptions: culturallyAdapted.descriptions,
        keywords: localizedKeywords,
        urlSuffix: this.generateUrlSuffix(market),
        seoTitle: seoContent.title,
        metaDescription: seoContent.metaDescription,
        valueProp: culturallyAdapted.valueProp
      });

      culturalAdaptations.push({
        market: market,
        adaptations: culturallyAdapted.adaptations
      });
    }

    const result: LocalizationResult = {
      primaryMarket: validation.supported[0] || 'US',
      localizedContent,
      marketValidation: {
        supportedMarkets: validation.supported,
        unsupportedMarkets: validation.unsupported,
        warnings: validation.warnings
      },
      culturalAdaptations
    };

    logger.info(`✅ Localization completed: ${localizedContent.length} market variants generated`);
    return result;
  }

  /**
   * Apply spelling variations based on market
   */
  private adaptSpelling(content: string[], spelling: MarketConfig['spelling']): string[] {
    const spellingRules: Record<string, Record<string, string>> = {
      // US to UK/AU spelling
      'UK': {
        'color': 'colour',
        'Color': 'Colour',
        'customize': 'customise',
        'Customize': 'Customise',
        'realize': 'realise',
        'organize': 'organise',
        'center': 'centre',
        'license': 'licence',
        'defense': 'defence',
        'analyze': 'analyse'
      },
      'AU': {
        'color': 'colour',
        'Color': 'Colour',
        'customize': 'customise',
        'Customize': 'Customise',
        'realize': 'realise',
        'organize': 'organise',
        'center': 'centre',
        'license': 'licence',
        'defense': 'defence',
        'analyze': 'analyse'
      },
      'CA': {
        'color': 'colour',
        'Color': 'Colour',
        'center': 'centre',
        'license': 'licence',
        'defense': 'defence'
      }
    };

    const rules = spellingRules[spelling];
    if (!rules) return content;

    return content.map(text => {
      let adapted = text;
      for (const [us, local] of Object.entries(rules)) {
        adapted = adapted.replace(new RegExp(`\\b${us}\\b`, 'g'), local);
      }
      return adapted;
    });
  }

  /**
   * Generate market-specific keywords
   */
  private generateLocalizedKeywords(
    baseKeywords: string[],
    market: string,
    product: string
  ): string[] {
    const localizedKeywords = [...baseKeywords];

    // Add market-specific variations
    const marketVariations: Record<string, string[]> = {
      'AU': ['australia', 'aussie', 'au'],
      'GB': ['uk', 'britain', 'british'],
      'CA': ['canada', 'canadian'],
      'DE': ['deutschland', 'german'],
      'FR': ['france', 'french', 'français'],
      'ES': ['españa', 'spanish', 'español'],
      'IT': ['italia', 'italian', 'italiano']
    };

    const variations = marketVariations[market];
    if (variations) {
      // Add market-specific variants for all keywords
      for (const keyword of baseKeywords) {
        for (const variation of variations) {
          localizedKeywords.push(`${keyword} ${variation}`);
        }
      }
      
      // Add generic market terms (with null safety)
      if (product && typeof product === 'string') {
        localizedKeywords.push(`${product.toLowerCase()} ${market.toLowerCase()}`);
      }
      localizedKeywords.push(`chrome extension ${market.toLowerCase()}`);
    }

    return localizedKeywords;
  }

  /**
   * Generate market-specific SEO content
   */
  private generateMarketSeoContent(
    product: string,
    market: string,
    config: MarketConfig
  ): {
    title: string;
    metaDescription: string;
    valueProp: string;
  } {
    const marketNames: Record<string, string> = {
      'AU': 'Australia',
      'US': 'USA',
      'GB': 'UK',
      'CA': 'Canada',
      'DE': 'Germany',
      'FR': 'France',
      'ES': 'Spain',
      'IT': 'Italy'
    };

    const currencyEmphasis = config.currency.includes('$') ? 'free' : 'kostenlos';
    const marketName = marketNames[market] || market;

    return {
      title: `${product || 'Extension'} - Chrome Extension for ${marketName}`,
      metaDescription: `Professional ${product || 'Chrome extension'} Chrome extension for ${marketName}. Fast, secure, and easy to use. ${config.culturalNotes.split('.')[0]}.`,
      valueProp: `The #1 ${product || 'Chrome extension'} solution for ${marketName} - ${config.culturalNotes.split('.')[0].toLowerCase()}`
    };
  }

  /**
   * Apply cultural adaptations to content
   */
  private applyCulturalAdaptations(
    content: {
      headlines: string[];
      descriptions: string[];
      valueProp?: string;
    },
    config: MarketConfig
  ): {
    headlines: string[];
    descriptions: string[];
    valueProp?: string;
    adaptations: string[];
  } {
    const adaptations: string[] = [];
    let adaptedContent = { ...content };

    // Apply cultural tone adjustments
    switch (config.spelling) {
      case 'DE':
        adaptedContent = this.applyGermanCultural(adaptedContent);
        adaptations.push('Applied German precision and formal tone');
        break;
      case 'FR':
        adaptedContent = this.applyFrenchCultural(adaptedContent);
        adaptations.push('Applied French elegance and sophistication');
        break;
      case 'UK':
        adaptedContent = this.applyBritishCultural(adaptedContent);
        adaptations.push('Applied British understatement and quality focus');
        break;
      case 'AU':
        adaptedContent = this.applyAustralianCultural(adaptedContent);
        adaptations.push('Applied Australian directness and practicality');
        break;
    }

    // Add currency and format adaptations
    if (config.currency !== '$') {
      adaptations.push(`Currency adapted to ${config.currency}`);
    }

    return {
      ...adaptedContent,
      adaptations
    };
  }

  /**
   * Cultural adaptation methods
   */
  private applyGermanCultural(content: {
    headlines: string[];
    descriptions: string[];
    valueProp?: string;
  }) {
    return {
      headlines: content.headlines.map(h => 
        h.replace(/\bfast\b/gi, 'schnell')
         .replace(/\beasy\b/gi, 'einfach')
         .replace(/\bsimple\b/gi, 'einfach')
         .replace(/\bquick\b/gi, 'schnell')
      ),
      descriptions: content.descriptions.map(d =>
        d.replace(/\bquickly\b/gi, 'schnell')
         .replace(/\beasily\b/gi, 'einfach')
         .replace(/\bfast\b/gi, 'schnell')
      ),
      valueProp: content.valueProp?.replace(/\bfast\b/gi, 'schnell')
    };
  }

  private applyFrenchCultural(content: any) {
    return {
      headlines: content.headlines.map((h: string) => 
        h.replace(/beautiful/gi, 'élégant')
         .replace(/elegant/gi, 'élégant')
      ),
      descriptions: content.descriptions,
      valueProp: content.valueProp
    };
  }

  private applyBritishCultural(content: any) {
    return {
      headlines: content.headlines.map((h: string) =>
        h.replace(/\bawesome\b/gi, 'brilliant')
         .replace(/\bamazing\b/gi, 'excellent')
         .replace(/\bgreat\b/gi, 'brilliant')
         .replace(/\bfast\b/gi, 'quick')
         .replace(/\beasy\b/gi, 'straightforward')
      ),
      descriptions: content.descriptions.map((d: string) =>
        d.replace(/\bawesome\b/gi, 'brilliant')
         .replace(/\bamazing\b/gi, 'excellent')
         .replace(/\bgreat\b/gi, 'brilliant')
      ),
      valueProp: content.valueProp
    };
  }

  private applyAustralianCultural(content: any) {
    return {
      headlines: content.headlines.map((h: string) =>
        h.replace(/great/gi, 'ripper')
      ),
      descriptions: content.descriptions,
      valueProp: content.valueProp
    };
  }

  /**
   * Generate URL suffix for market-specific landing pages
   */
  private generateUrlSuffix(market: string): string {
    const suffixes: Record<string, string> = {
      'AU': '/au/',
      'US': '/',
      'GB': '/uk/',
      'CA': '/ca/',
      'DE': '/de/',
      'FR': '/fr/',
      'ES': '/es/',
      'IT': '/it/'
    };

    return suffixes[market] || '/';
  }

  /**
   * Validate geo targeting matches SERP market selection
   */
  validateGeoTargeting(geoTargets: string[], serpMarkets: string[]): {
    isValid: boolean;
    mismatches: string[];
    recommendations: string[];
  } {
    const mismatches: string[] = [];
    const recommendations: string[] = [];

    for (const target of geoTargets) {
      if (!serpMarkets.includes(target)) {
        mismatches.push(target);
        recommendations.push(`Add SERP analysis for ${target} market`);
      }
    }

    return {
      isValid: mismatches.length === 0,
      mismatches,
      recommendations
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create and configure localization engine
 */
export function createLocalizationEngine(): LocalizationEngine {
  return new LocalizationEngine();
}

/**
 * Generate localized content for multiple markets
 */
export async function localizeForMarkets(
  content: {
    headlines: string[];
    descriptions: string[];
    keywords: string[];
    product: string;
  },
  markets: string[]
): Promise<LocalizationResult> {
  const engine = createLocalizationEngine();
  return await engine.localizeContent(content, markets);
}