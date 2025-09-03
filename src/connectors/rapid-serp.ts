import axios, { AxiosResponse } from 'axios';
import pino from 'pino';
import { SerpResult, SerpResultSchema, SerpFeatures, RapidApiSerpResponse, RapidApiSerpResponseSchema } from './types.js';
import { validateEnvironment } from '../utils/validation.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface SerpQuery {
  keywords: string[];
  market: string;
  maxCalls?: number;
}

export interface SerpAnalysisResult {
  results: SerpResult[];
  callsMade: number;
  cacheHits: number;
  competitors: Map<string, number>;
  serpFeatureStats: {
    aiOverview: number;
    peopleAlsoAsk: number;
    featuredSnippet: number;
    videoResults: number;
    shoppingResults: number;
    localPack: number;
  };
  warnings: string[];
}

export class RapidApiSerpConnector {
  private apiKey: string = '';
  private host: string = '';
  private isAvailable = false;
  private baseUrl = 'https://real-time-web-search.p.rapidapi.com';
  private callCount = 0;
  private maxCallsPerRun = 30;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const env = validateEnvironment();
      
      this.apiKey = env.RAPIDAPI_KEY;
      this.host = env.RAPIDAPI_HOST_SERP;
      this.maxCallsPerRun = env.MAX_SERP_CALLS_PER_RUN;
      
      if (!this.apiKey || this.apiKey === 'your-rapidapi-key-here') {
        logger.warn('⚠️  RapidAPI key not configured - SERP analysis will be unavailable');
        return;
      }

      this.isAvailable = true;
      logger.info('✅ RapidAPI SERP connector initialized successfully');
      logger.info(`🎯 SERP call limit: ${this.maxCallsPerRun} per run`);
      
    } catch (error) {
      logger.warn('⚠️  Failed to initialize RapidAPI SERP connector:', error);
      this.isAvailable = false;
    }
  }

  async analyzeSerpResults(query: SerpQuery): Promise<SerpAnalysisResult> {
    const result: SerpAnalysisResult = {
      results: [],
      callsMade: 0,
      cacheHits: 0,
      competitors: new Map(),
      serpFeatureStats: {
        aiOverview: 0,
        peopleAlsoAsk: 0,
        featuredSnippet: 0,
        videoResults: 0,
        shoppingResults: 0,
        localPack: 0
      },
      warnings: []
    };

    if (!this.isAvailable) {
      result.warnings.push('RapidAPI SERP connector not available - no SERP analysis performed');
      logger.warn('⚠️  RapidAPI SERP connector not available');
      return result;
    }

    const maxCalls = Math.min(query.maxCalls || this.maxCallsPerRun, this.maxCallsPerRun);
    const keywordsToProcess = query.keywords.slice(0, maxCalls);

    if (query.keywords.length > maxCalls) {
      result.warnings.push(`Limited to ${maxCalls} SERP calls (${query.keywords.length - maxCalls} keywords skipped)`);
      logger.warn(`⚠️  Limited to ${maxCalls} SERP calls, skipping ${query.keywords.length - maxCalls} keywords`);
    }

    logger.info(`🔍 Analyzing SERP results for ${keywordsToProcess.length} keywords in ${query.market}`);

    for (const keyword of keywordsToProcess) {
      if (result.callsMade >= maxCalls) {
        logger.warn(`⚠️  Reached maximum SERP calls (${maxCalls}), stopping analysis`);
        break;
      }

      try {
        const serpResult = await this.getSerpData(keyword, query.market);
        result.callsMade++;
        this.callCount++;

        result.results.push(serpResult);

        // Update competitor tracking
        this.trackCompetitors(serpResult, result.competitors);

        // Update SERP feature statistics
        this.updateSerpFeatureStats(serpResult.features, result.serpFeatureStats);

        logger.debug(`✅ ${keyword}: ${serpResult.organic_results.length} results, ${serpResult.competitors.length} competitors`);

        // Rate limiting - delay between requests to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        const errorMsg = `SERP analysis failed for "${keyword}": ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.warnings.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
        
        // Continue with other keywords even if one fails
        continue;
      }
    }

    // Sort competitors by frequency
    const sortedCompetitors = Array.from(result.competitors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // Top 20 competitors

    logger.info(`🎯 SERP analysis complete: ${result.results.length} queries analyzed`);
    logger.info(`📊 API calls made: ${result.callsMade}/${maxCalls}`);
    logger.info(`🏆 Top competitors found: ${sortedCompetitors.slice(0, 5).map(([domain, count]) => `${domain}(${count})`).join(', ')}`);
    
    // Log SERP feature prevalence
    const totalResults = result.results.length;
    if (totalResults > 0) {
      logger.info(`📈 SERP features: AI Overview ${Math.round(result.serpFeatureStats.aiOverview/totalResults*100)}%, PAA ${Math.round(result.serpFeatureStats.peopleAlsoAsk/totalResults*100)}%, Featured Snippet ${Math.round(result.serpFeatureStats.featuredSnippet/totalResults*100)}%`);
    }

    return result;
  }

  private async getSerpData(keyword: string, market: string): Promise<SerpResult> {
    // Using the 'search' (Light) endpoint for fast results
    const options = {
      method: 'GET',
      url: `${this.baseUrl}/search`,
      params: {
        q: keyword, // API expects 'q' not 'query'
        limit: '10', // Get top 10 results
        ...this.getMarketParams(market)
      },
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'real-time-web-search.p.rapidapi.com'
      },
      timeout: 15000 // 15 second timeout
    };

    try {
      logger.debug(`🔍 Fetching SERP data for: ${keyword} (${market})`);
      
      const response: AxiosResponse = await axios.request(options);
      
      // Real-Time Web Search API response structure
      if (response.data.status !== 'OK') {
        throw new Error(`API returned error: ${response.data.error?.message || 'Unknown error'}`);
      }
      
      // Convert to our SerpResult format
      const serpResult = this.convertRealTimeSearchResult(keyword, market, response.data.data);
      
      logger.debug(`📥 SERP data for ${keyword}: ${serpResult.organic_results.length} organic results`);
      
      return serpResult;
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        
        if (status === 429) {
          throw new Error(`Rate limit exceeded for RapidAPI SERP requests`);
        } else if (status === 403) {
          throw new Error(`RapidAPI authentication failed - check your API key`);
        } else if (status === 402) {
          throw new Error(`RapidAPI quota exceeded - upgrade your subscription`);
        } else {
          throw new Error(`RapidAPI SERP request failed: ${status} ${statusText}`);
        }
      } else {
        throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private convertRealTimeSearchResult(keyword: string, market: string, apiData: any): SerpResult {
    // Extract organic results from Real-Time Web Search API response
    const organicResults = (apiData.organic_results || []).map((result: any) => {
      try {
        const url = new URL(result.url);
        return {
          title: result.title,
          url: result.url,
          domain: url.hostname.replace('www.', ''),
          snippet: result.snippet || undefined
        };
      } catch {
        return {
          title: result.title,
          url: result.url,
          domain: result.url,
          snippet: result.snippet || undefined
        };
      }
    });

    // Extract competitors (unique domains)
    const competitors = Array.from(new Set(organicResults.map((r: any) => r.domain)));

    // Detect SERP features from the response
    const features: SerpFeatures = {
      ai_overview: apiData.ai_overview ? true : false,
      people_also_ask: apiData.people_also_ask ? true : false,
      featured_snippet: apiData.featured_snippet ? true : false,
      video_results: false, // Not provided in basic response
      shopping_results: false, // Not provided in basic response
      local_pack: false, // Not provided in basic response
      knowledge_panel: apiData.knowledge_panel ? true : false
    };

    const serpResult = SerpResultSchema.parse({
      query: keyword,
      market: market,
      organic_results: organicResults,
      features: features,
      competitors: competitors
    });

    return serpResult;
  }

  // Keep old method for reference but rename it
  private convertToSerpResult_OLD(keyword: string, market: string, apiResponse: RapidApiSerpResponse): SerpResult {
    // Extract organic results
    const organicResults = apiResponse.web_results.map(result => {
      const url = new URL(result.url);
      return {
        title: result.title,
        url: result.url,
        domain: url.hostname.replace('www.', ''),
        snippet: result.snippet || undefined
      };
    });

    // Extract competitors (unique domains)
    const competitors = Array.from(new Set(organicResults.map(r => r.domain)));

    // Detect SERP features (simplified detection based on patterns)
    const features = this.detectSerpFeatures(apiResponse, organicResults);

    const serpResult = SerpResultSchema.parse({
      query: keyword,
      market: market,
      organic_results: organicResults,
      features: features,
      competitors: competitors
    });

    return serpResult;
  }

  private detectSerpFeatures(apiResponse: RapidApiSerpResponse, organicResults: any[]): SerpFeatures {
    const features: SerpFeatures = {
      ai_overview: false,
      people_also_ask: false,
      featured_snippet: false,
      video_results: false,
      shopping_results: false,
      local_pack: false,
      knowledge_panel: false
    };

    // Detect People Also Ask
    if (apiResponse.people_also_ask && apiResponse.people_also_ask.length > 0) {
      features.people_also_ask = true;
    }

    // Detect Featured Snippet (usually first result with rich snippet)
    if (organicResults.length > 0 && organicResults[0].snippet && organicResults[0].snippet.length > 200) {
      features.featured_snippet = true;
    }

    // Detect Video Results (by domain patterns)
    const videoResults = organicResults.filter(result => 
      result.domain.includes('youtube.com') || 
      result.domain.includes('vimeo.com') ||
      result.url.includes('/watch') ||
      result.title.toLowerCase().includes('video')
    );
    if (videoResults.length > 0) {
      features.video_results = true;
    }

    // Detect Shopping Results (by domain patterns)
    const shoppingResults = organicResults.filter(result =>
      result.domain.includes('amazon.') ||
      result.domain.includes('ebay.') ||
      result.domain.includes('shop') ||
      result.url.includes('/product') ||
      result.title.toLowerCase().includes('buy') ||
      result.title.toLowerCase().includes('price')
    );
    if (shoppingResults.length > 0) {
      features.shopping_results = true;
    }

    // Detect Local Pack (by business/location patterns)
    const localResults = organicResults.filter(result =>
      result.domain.includes('google.com/maps') ||
      result.domain.includes('yelp.com') ||
      result.domain.includes('foursquare.com') ||
      result.snippet && (
        result.snippet.includes('hours:') ||
        result.snippet.includes('phone:') ||
        result.snippet.includes('address:')
      )
    );
    if (localResults.length > 0) {
      features.local_pack = true;
    }

    // AI Overview detection (heuristic - look for comprehensive first results)
    if (organicResults.length > 0) {
      const firstResult = organicResults[0];
      if (firstResult.snippet && 
          firstResult.snippet.length > 300 && 
          (firstResult.domain.includes('google.com') || firstResult.snippet.includes('according to'))) {
        features.ai_overview = true;
      }
    }

    return features;
  }

  private trackCompetitors(serpResult: SerpResult, competitorMap: Map<string, number>): void {
    for (const competitor of serpResult.competitors) {
      const currentCount = competitorMap.get(competitor) || 0;
      competitorMap.set(competitor, currentCount + 1);
    }
  }

  private updateSerpFeatureStats(features: SerpFeatures, stats: SerpAnalysisResult['serpFeatureStats']): void {
    if (features.ai_overview) stats.aiOverview++;
    if (features.people_also_ask) stats.peopleAlsoAsk++;
    if (features.featured_snippet) stats.featuredSnippet++;
    if (features.video_results) stats.videoResults++;
    if (features.shopping_results) stats.shoppingResults++;
    if (features.local_pack) stats.localPack++;
  }

  private getMarketParams(market: string): Record<string, string> {
    const marketParams: Record<string, { gl: string; hl: string }> = {
      'AU': { gl: 'au', hl: 'en-AU' },
      'US': { gl: 'us', hl: 'en' },
      'GB': { gl: 'gb', hl: 'en-GB' },
      'CA': { gl: 'ca', hl: 'en-CA' },
      'DE': { gl: 'de', hl: 'de' },
      'FR': { gl: 'fr', hl: 'fr' },
      'ES': { gl: 'es', hl: 'es' },
      'IT': { gl: 'it', hl: 'it' }
    };

    const params = marketParams[market.toUpperCase()] || marketParams['US'];
    
    // Enhanced logging for market-specific SERP calls
    logger.debug(`🌍 Market targeting: ${market.toUpperCase()} (gl=${params.gl}, hl=${params.hl})`);
    
    return {
      gl: params.gl,
      hl: params.hl
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      logger.debug('🔬 Testing RapidAPI SERP connection...');
      
      // Simple test query
      await this.getSerpData('test query', 'US');
      
      logger.info('✅ RapidAPI SERP connection test successful');
      return true;
      
    } catch (error) {
      logger.error('❌ RapidAPI SERP connection test failed:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isAvailable;
  }

  getCallCount(): number {
    return this.callCount;
  }

  getMaxCalls(): number {
    return this.maxCallsPerRun;
  }

  getRemainingCalls(): number {
    return Math.max(0, this.maxCallsPerRun - this.callCount);
  }

  resetCallCount(): void {
    this.callCount = 0;
    logger.info('🔄 SERP call count reset');
  }
}