import axios, { AxiosResponse } from 'axios';
import pino from 'pino';
import { KeywordData, KeywordDataSchema, RapidApiKeywordResponse, RapidApiKeywordResponseSchema } from './types.js';
import { validateEnvironment } from '../utils/validation.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface KeywordExpansionQuery {
  seedQueries: string[];
  market: string;
  maxKeywords?: number;
}

export interface KeywordExpansionResult {
  keywords: KeywordData[];
  seedsProcessed: number;
  totalSuggestions: number;
  apiCallsMade: number;
  warnings: string[];
}

export class RapidApiKeywordConnector {
  private apiKey: string = '';
  private host: string = '';
  private isAvailable = false;
  private baseUrl = 'https://google-keyword-insight1.p.rapidapi.com';

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const env = validateEnvironment();
      
      this.apiKey = env.RAPIDAPI_KEY;
      this.host = env.RAPIDAPI_HOST_KEYWORDS;
      
      if (!this.apiKey || this.apiKey === 'your-rapidapi-key-here') {
        logger.warn('⚠️  RapidAPI key not configured - keyword expansion will be unavailable');
        return;
      }

      this.isAvailable = true;
      logger.info('✅ RapidAPI Keyword connector initialized successfully');
      
    } catch (error) {
      logger.warn('⚠️  Failed to initialize RapidAPI Keyword connector:', error);
      this.isAvailable = false;
    }
  }

  async expandKeywords(query: KeywordExpansionQuery): Promise<KeywordExpansionResult> {
    const result: KeywordExpansionResult = {
      keywords: [],
      seedsProcessed: 0,
      totalSuggestions: 0,
      apiCallsMade: 0,
      warnings: []
    };

    if (!this.isAvailable) {
      result.warnings.push('RapidAPI keyword connector not available - no keyword expansion performed');
      logger.warn('⚠️  RapidAPI keyword connector not available');
      return result;
    }

    const maxKeywords = query.maxKeywords || 50;
    const keywordSet = new Set<string>();
    
    logger.info(`🔄 Expanding ${query.seedQueries.length} seed queries for market: ${query.market}`);

    for (const seedQuery of query.seedQueries) {
      if (keywordSet.size >= maxKeywords) {
        logger.info(`⚠️  Reached maximum keyword limit (${maxKeywords}), stopping expansion`);
        break;
      }

      try {
        const suggestions = await this.getKeywordSuggestions(seedQuery, query.market);
        result.apiCallsMade++;
        result.seedsProcessed++;

        if (suggestions.keywords.length === 0) {
          result.warnings.push(`No suggestions found for seed query: ${seedQuery}`);
          logger.debug(`⚠️  No suggestions for: ${seedQuery}`);
          continue;
        }

        // Add unique keywords
        let addedCount = 0;
        for (const keyword of suggestions.keywords) {
          if (keywordSet.size >= maxKeywords) break;
          
          if (!keywordSet.has(keyword.keyword.toLowerCase())) {
            keywordSet.add(keyword.keyword.toLowerCase());
            
            // Convert to our KeywordData format
            const keywordData = this.convertToKeywordData(keyword, query.market);
            result.keywords.push(keywordData);
            addedCount++;
          }
        }

        result.totalSuggestions += suggestions.keywords.length;
        
        logger.debug(`✅ ${seedQuery}: ${addedCount}/${suggestions.keywords.length} new keywords added`);

        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        const errorMsg = `Failed to expand "${seedQuery}": ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.warnings.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
        
        // Continue with other seeds even if one fails
        continue;
      }
    }

    logger.info(`🎯 Keyword expansion complete: ${result.keywords.length} keywords from ${result.seedsProcessed} seeds`);
    logger.info(`📊 API calls made: ${result.apiCallsMade}, Total suggestions: ${result.totalSuggestions}`);

    return result;
  }

  private async getKeywordSuggestions(seedQuery: string, market: string): Promise<RapidApiKeywordResponse> {
    // Using the 'keysuggest' endpoint from the API documentation
    const options = {
      method: 'GET',
      url: `${this.baseUrl}/keysuggest/`,
      params: {
        keyword: seedQuery,
        location: market.toUpperCase(), // API expects uppercase country codes like 'US'
        lang: this.getLanguageForMarket(market),
        mode: 'all', // Get all related keywords
        intent: 'transactional', // Focus on transactional intent for Chrome extensions
        return_intent: 'true' // Include intent information
      },
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'google-keyword-insight1.p.rapidapi.com'
      },
      timeout: 10000 // 10 second timeout
    };

    try {
      logger.debug(`🔍 Requesting keyword suggestions for: ${seedQuery} (${market})`);
      
      const response: AxiosResponse = await axios.request(options);
      
      // Google Keyword Insight API returns array directly or wrapped in data
      const keywordData = Array.isArray(response.data) ? response.data : (response.data.data || response.data.keywords || []);
      
      // Transform to our expected format
      const transformedResponse = {
        keywords: keywordData.map((item: any) => ({
          keyword: item.keyword || item.text || item.query || '',
          search_volume: item.search_volume || item.volume || item.avg_monthly_searches || 0,
          competition: item.competition || item.competition_level || 'unknown',
          suggested_bid: item.cpc || item.suggested_bid || item.cost_per_click || 0,
          intent: item.intent || undefined
        }))
      };
      
      // Validate and transform response
      const validatedResponse = RapidApiKeywordResponseSchema.parse(transformedResponse);
      
      logger.debug(`📥 Received ${validatedResponse.keywords.length} suggestions for: ${seedQuery}`);
      
      return validatedResponse;
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        
        if (status === 429) {
          throw new Error(`Rate limit exceeded for RapidAPI keyword requests`);
        } else if (status === 403) {
          throw new Error(`RapidAPI authentication failed - check your API key`);
        } else if (status === 402) {
          throw new Error(`RapidAPI quota exceeded - upgrade your subscription`);
        } else {
          throw new Error(`RapidAPI request failed: ${status} ${statusText}`);
        }
      } else {
        throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private convertToKeywordData(rapidApiKeyword: any, market: string): KeywordData {
    const keyword = KeywordDataSchema.parse({
      keyword: rapidApiKeyword.keyword,
      volume: rapidApiKeyword.search_volume || undefined,
      competition: this.convertCompetitionLevel(rapidApiKeyword.competition),
      cpc: rapidApiKeyword.suggested_bid || undefined,
      intent_score: 1.0, // Will be calculated later
      final_score: 0,    // Will be calculated later
      data_source: 'estimated' as const,
      markets: [market],
      recommended_match_type: 'phrase' as const
    });

    return keyword;
  }

  private convertCompetitionLevel(competition?: string): number | undefined {
    if (!competition) return undefined;
    
    const comp = competition.toLowerCase();
    
    switch (comp) {
      case 'low':
        return 0.3;
      case 'medium':
        return 0.6;
      case 'high':
        return 0.9;
      default:
        // Try to parse as number
        const numericComp = parseFloat(competition);
        if (!isNaN(numericComp) && numericComp >= 0 && numericComp <= 1) {
          return numericComp;
        }
        return undefined;
    }
  }

  private getLanguageForMarket(market: string): string {
    const marketLanguageMap: Record<string, string> = {
      'AU': 'en',
      'US': 'en',
      'GB': 'en',
      'CA': 'en',
      'DE': 'de',
      'FR': 'fr',
      'ES': 'es',
      'IT': 'it',
      'NL': 'nl',
      'JP': 'ja',
      'KR': 'ko',
      'CN': 'zh',
      'BR': 'pt',
      'MX': 'es',
      'IN': 'en'
    };
    
    return marketLanguageMap[market.toUpperCase()] || 'en';
  }

  async testConnection(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      logger.debug('🔬 Testing RapidAPI keyword connection...');
      
      // Simple test query
      await this.getKeywordSuggestions('test', 'US');
      
      logger.info('✅ RapidAPI keyword connection test successful');
      return true;
      
    } catch (error) {
      logger.error('❌ RapidAPI keyword connection test failed:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isAvailable;
  }

  getApiHost(): string {
    return this.host;
  }
}