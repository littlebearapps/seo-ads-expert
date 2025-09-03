import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { 
  LocalizationEngine, 
  createLocalizationEngine, 
  localizeForMarkets,
  LocalizationResult 
} from '../../src/localization.js';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Enhanced Localization System Integration Tests
 * 
 * Tests the comprehensive multi-market localization system including:
 * - Market-specific SERP integration with gl/hl parameters
 * - Comprehensive localized content generation
 * - Spelling and terminology adaptations (US vs UK vs AU)
 * - Currency and format hints per market
 * - Cultural adaptation for different regions
 * - Market-specific keywords and SEO content
 * - Geo targeting validation
 */

describe('Enhanced Localization System', () => {
  let localizationEngine: LocalizationEngine;
  const testOutputDir = join(process.cwd(), 'tests/__temp_localization_test__');
  
  beforeEach(() => {
    // Clean setup for each test
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
    
    localizationEngine = createLocalizationEngine();
  });
  
  afterEach(() => {
    // Clean up test directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  test('Market configuration provides correct gl/hl parameters', () => {
    const auConfig = localizationEngine.getMarketConfig('AU');
    expect(auConfig).toEqual({
      gl: 'au',
      hl: 'en-AU',
      currency: 'AUD $',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,000.00',
      timezone: 'AEST/AEDT',
      spelling: 'UK',
      culturalNotes: 'Direct, practical messaging. Privacy-conscious market.'
    });

    const usConfig = localizationEngine.getMarketConfig('US');
    expect(usConfig).toEqual({
      gl: 'us',
      hl: 'en',
      currency: '$',
      dateFormat: 'MM/DD/YYYY',
      numberFormat: '1,000.00',
      timezone: 'EST/PST',
      spelling: 'US',
      culturalNotes: 'Benefit-focused, efficiency-oriented. Free tier emphasis.'
    });

    const deConfig = localizationEngine.getMarketConfig('DE');
    expect(deConfig).toEqual({
      gl: 'de',
      hl: 'de',
      currency: '€',
      dateFormat: 'DD.MM.YYYY',
      numberFormat: '1.000,00',
      timezone: 'CET/CEST',
      spelling: 'DE',
      culturalNotes: 'Precision, quality, data protection emphasis. Formal tone.'
    });
  });

  test('Market validation correctly identifies supported/unsupported markets', () => {
    const validation = localizationEngine.validateMarkets(['US', 'AU', 'XX', 'GB']);
    
    expect(validation.supported).toContain('US');
    expect(validation.supported).toContain('AU');
    expect(validation.supported).toContain('GB');
    expect(validation.unsupported).toContain('XX');
    expect(validation.warnings).toHaveLength(1);
    expect(validation.warnings[0]).toContain('Market XX not supported');
  });

  test('Spelling adaptations work correctly for different markets', async () => {
    const baseContent = {
      headlines: ['Color Picker Tool', 'Customize Your Design'],
      descriptions: ['Analyze colors and organize your palette'],
      keywords: ['color picker', 'customize'],
      product: 'PaletteKit'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['US', 'UK', 'AU']);
    
    // US should keep original spelling
    const usContent = result.localizedContent.find(c => c.market === 'US');
    expect(usContent?.headlines).toContain('Color Picker Tool');
    expect(usContent?.headlines).toContain('Customize Your Design');

    // UK should use UK spelling
    const ukContent = result.localizedContent.find(c => c.market === 'UK');
    expect(ukContent?.headlines).toContain('Colour Picker Tool');
    expect(ukContent?.headlines).toContain('Customise Your Design');

    // AU should also use UK spelling (Australian English)
    const auContent = result.localizedContent.find(c => c.market === 'AU');
    expect(auContent?.headlines).toContain('Colour Picker Tool');
    expect(auContent?.headlines).toContain('Customise Your Design');
  });

  test('Market-specific keywords are generated correctly', async () => {
    const baseContent = {
      headlines: ['Chrome Extension'],
      descriptions: ['Best extension'],
      keywords: ['chrome extension', 'browser tool'],
      product: 'TestTool'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['AU', 'GB']);
    
    const auContent = result.localizedContent.find(c => c.market === 'AU');
    expect(auContent?.keywords.some(k => k.includes('australia'))).toBe(true);
    expect(auContent?.keywords.some(k => k.includes('aussie') || k.includes('au'))).toBe(true);

    const gbContent = result.localizedContent.find(c => c.market === 'GB');
    expect(gbContent?.keywords.some(k => k.includes('uk') || k.includes('britain') || k.includes('british'))).toBe(true);
  });

  test('Market-specific SEO content is generated', async () => {
    const baseContent = {
      headlines: ['Test Tool'],
      descriptions: ['Great tool'],
      keywords: ['test tool'],
      product: 'TestTool'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['AU', 'DE']);
    
    const auContent = result.localizedContent.find(c => c.market === 'AU');
    expect(auContent?.seoTitle).toBe('TestTool - Chrome Extension for Australia');
    expect(auContent?.metaDescription).toContain('Australia');
    expect(auContent?.metaDescription).toContain('Direct, practical');
    expect(auContent?.valueProp).toContain('Australia');

    const deContent = result.localizedContent.find(c => c.market === 'DE');
    expect(deContent?.seoTitle).toBe('TestTool - Chrome Extension for Germany');
    expect(deContent?.metaDescription).toContain('Germany');
    expect(deContent?.metaDescription).toContain('Precision, quality');
  });

  test('URL suffixes are generated correctly for different markets', async () => {
    const baseContent = {
      headlines: ['Test'],
      descriptions: ['Test'],
      keywords: ['test'],
      product: 'Test'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['US', 'AU', 'GB', 'CA']);
    
    const usContent = result.localizedContent.find(c => c.market === 'US');
    expect(usContent?.urlSuffix).toBe('/');

    const auContent = result.localizedContent.find(c => c.market === 'AU');
    expect(auContent?.urlSuffix).toBe('/au/');

    const gbContent = result.localizedContent.find(c => c.market === 'GB');
    expect(gbContent?.urlSuffix).toBe('/uk/');

    const caContent = result.localizedContent.find(c => c.market === 'CA');
    expect(caContent?.urlSuffix).toBe('/ca/');
  });

  test('Cultural adaptations are applied correctly', async () => {
    const baseContent = {
      headlines: ['Fast and Easy Tool', 'Beautiful Design'],
      descriptions: ['Quickly process your files'],
      keywords: ['fast tool'],
      product: 'TestTool'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['DE', 'FR', 'GB']);
    
    // Check German adaptations
    const germanAdaptations = result.culturalAdaptations.find(c => c.market === 'DE');
    expect(germanAdaptations?.adaptations).toContain('Applied German precision and formal tone');
    
    const deContent = result.localizedContent.find(c => c.market === 'DE');
    expect(deContent?.headlines.some(h => h.includes('schnell') || h.includes('einfach'))).toBe(true);

    // Check French adaptations
    const frenchAdaptations = result.culturalAdaptations.find(c => c.market === 'FR');
    expect(frenchAdaptations?.adaptations).toContain('Applied French elegance and sophistication');
    
    const frContent = result.localizedContent.find(c => c.market === 'FR');
    expect(frContent?.headlines.some(h => h.includes('élégant'))).toBe(true);

    // Check British adaptations
    const britishAdaptations = result.culturalAdaptations.find(c => c.market === 'GB');
    expect(britishAdaptations?.adaptations).toContain('Applied British understatement and quality focus');
    
    const gbContent = result.localizedContent.find(c => c.market === 'GB');
    expect(gbContent?.headlines.some(h => h.includes('quick') || h.includes('straightforward'))).toBe(true);
  });

  test('Single market workflow skips localization processing', async () => {
    const baseContent = {
      headlines: ['Test Tool'],
      descriptions: ['Test description'],
      keywords: ['test'],
      product: 'Test'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['US']);
    
    expect(result.localizedContent).toHaveLength(1);
    expect(result.primaryMarket).toBe('US');
    expect(result.marketValidation.supportedMarkets).toEqual(['US']);
    expect(result.culturalAdaptations).toHaveLength(1);
  });

  test('Multi-market workflow generates comprehensive localization', async () => {
    const baseContent = {
      headlines: ['Color Picker Chrome Extension', 'Fast and Easy'],
      descriptions: ['Customize your colors with our privacy-first tool'],
      keywords: ['color picker', 'chrome extension'],
      product: 'PaletteKit'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['US', 'UK', 'AU', 'DE']);
    
    expect(result.localizedContent).toHaveLength(4);
    expect(result.primaryMarket).toBe('US');
    expect(result.marketValidation.supportedMarkets).toHaveLength(4);
    expect(result.culturalAdaptations).toHaveLength(4);

    // Verify each market has unique adaptations
    result.localizedContent.forEach(content => {
      expect(content.market).toBeTruthy();
      expect(content.headlines).toHaveLength(2);
      expect(content.descriptions).toHaveLength(1);
      expect(content.keywords.length).toBeGreaterThanOrEqual(2); // Should have base keywords plus localized variants
      expect(content.seoTitle).toContain(content.market === 'US' ? 'USA' : 
                                        content.market === 'UK' ? 'UK' :
                                        content.market === 'AU' ? 'Australia' : 'Germany');
    });
  });

  test('Geo targeting validation works correctly', () => {
    const validation = localizationEngine.validateGeoTargeting(['US', 'AU'], ['US', 'GB', 'CA']);
    
    expect(validation.isValid).toBe(false);
    expect(validation.mismatches).toContain('AU');
    expect(validation.recommendations).toContain('Add SERP analysis for AU market');
  });

  test('Helper function localizeForMarkets works correctly', async () => {
    const baseContent = {
      headlines: ['Test Extension'],
      descriptions: ['Great extension'],
      keywords: ['extension'],
      product: 'TestExt'
    };

    const result = await localizeForMarkets(baseContent, ['US', 'AU']);
    
    expect(result).toBeInstanceOf(Object);
    expect(result.localizedContent).toHaveLength(2);
    expect(result.primaryMarket).toBe('US');
  });

  test('Unsupported market defaults to US configuration', async () => {
    const baseContent = {
      headlines: ['Test'],
      descriptions: ['Test'],
      keywords: ['test'],
      product: 'Test'
    };

    const result = await localizationEngine.localizeContent(baseContent, ['XX', 'YY']);
    
    expect(result.localizedContent).toHaveLength(0); // Unsupported markets are filtered out
    expect(result.marketValidation.unsupportedMarkets).toContain('XX');
    expect(result.marketValidation.unsupportedMarkets).toContain('YY');
    expect(result.marketValidation.warnings.length).toBeGreaterThan(0);
  });

  test('Large market set processes efficiently', async () => {
    const baseContent = {
      headlines: ['Universal Tool'],
      descriptions: ['Works everywhere'],
      keywords: ['universal', 'tool'],
      product: 'UniversalTool'
    };

    const allMarkets = ['US', 'UK', 'AU', 'CA', 'DE', 'FR', 'ES', 'IT'];
    const startTime = Date.now();
    
    const result = await localizationEngine.localizeContent(baseContent, allMarkets);
    
    const processingTime = Date.now() - startTime;
    
    expect(processingTime).toBeLessThan(1000); // Should process quickly
    expect(result.localizedContent).toHaveLength(8);
    expect(result.primaryMarket).toBe('US');
    expect(result.marketValidation.supportedMarkets).toHaveLength(8);
    
    // Verify each market is properly processed
    allMarkets.forEach(market => {
      const marketContent = result.localizedContent.find(c => c.market === market);
      expect(marketContent).toBeTruthy();
      expect(marketContent?.seoTitle).toContain('UniversalTool');
      expect(marketContent?.urlSuffix).toBeTruthy();
    });
  });
});