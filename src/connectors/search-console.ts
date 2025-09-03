import { google } from 'googleapis';
import pino from 'pino';
import { KeywordData, KeywordDataSchema, SearchConsoleResponseSchema } from './types.js';
import { validateEnvironment } from '../utils/validation.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface SearchConsoleQuery {
  site: string;
  startDate: string;
  endDate: string;
  markets: string[];
  targetPages?: string[];
}

export interface SearchConsoleResult {
  keywords: KeywordData[];
  totalQueries: number;
  totalClicks: number;
  totalImpressions: number;
  averageCTR: number;
  averagePosition: number;
  warnings: string[];
}

export class SearchConsoleConnector {
  private searchConsole: any;
  private isAuthenticated = false;
  private sites: string[] = [];

  constructor() {
    // Async initialization - will be called in the background
    this.initializeClient().catch(error => {
      logger.error('Failed to initialize Search Console client:', error);
    });
  }

  private async initializeClient(): Promise<void> {
    try {
      const env = validateEnvironment();
      
      // Parse sites from environment
      if (env.SEARCH_CONSOLE_SITES) {
        this.sites = env.SEARCH_CONSOLE_SITES.split('|').map(s => s.trim());
      }

      let auth: google.auth.GoogleAuth;

      // Priority 1: Application Default Credentials (most secure for local dev)
      // This will use credentials from `gcloud auth application-default login`
      const hasExplicitCredentials = env.GOOGLE_APPLICATION_CREDENTIALS || 
                                    (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
      
      if (!hasExplicitCredentials) {
        try {
          logger.info('🔑 Attempting to use Application Default Credentials (ADC)');
          auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
          });
          
          // Test if ADC is available
          await auth.getClient();
          
          this.searchConsole = google.searchconsole({
            version: 'v1',
            auth: auth,
          });

          this.isAuthenticated = true;
          logger.info('✅ Search Console client initialized with Application Default Credentials');
          logger.info('   (Using gcloud auth from: ~/.config/gcloud/application_default_credentials.json)');
          logger.debug('🔗 Configured sites:', this.sites);
          return;
        } catch (adcError) {
          logger.debug('ADC not available, trying other methods...');
        }
      }

      // Priority 2: JSON key file (for production/CI)
      if (env.GOOGLE_APPLICATION_CREDENTIALS) {
        logger.info('🔑 Using Google Cloud JSON key file authentication');
        auth = new google.auth.GoogleAuth({
          keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        });
      }
      // Priority 3: Individual credentials (backward compatibility)
      else if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
        logger.info('🔑 Using individual Google Cloud credentials');
        auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
            project_id: env.GOOGLE_PROJECT_ID || '',
          },
          scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        });
      }
      // No credentials configured
      else {
        logger.warn('⚠️  Google Search Console credentials not configured - GSC data will be unavailable');
        logger.info('💡 Option 1: Run `gcloud auth application-default login` (recommended)');
        logger.info('💡 Option 2: Set GOOGLE_APPLICATION_CREDENTIALS to JSON key file path');
        logger.info('💡 Option 3: Set GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
        return;
      }

      this.searchConsole = google.searchconsole({
        version: 'v1',
        auth: auth,
      });

      this.isAuthenticated = true;
      logger.info('✅ Search Console client initialized successfully');
      logger.debug('🔗 Configured sites:', this.sites);
      
    } catch (error) {
      logger.warn('⚠️  Failed to initialize Search Console client:', error);
      this.isAuthenticated = false;
    }
  }

  async getSearchAnalytics(query: SearchConsoleQuery): Promise<SearchConsoleResult> {
    const result: SearchConsoleResult = {
      keywords: [],
      totalQueries: 0,
      totalClicks: 0,
      totalImpressions: 0,
      averageCTR: 0,
      averagePosition: 0,
      warnings: []
    };

    if (!this.isAuthenticated) {
      result.warnings.push('Search Console not authenticated - organic performance data unavailable');
      logger.warn('⚠️  Search Console not authenticated, returning empty result');
      return result;
    }

    logger.info(`🔍 Querying Search Console for: ${query.site}`);
    logger.debug('Query parameters:', {
      site: query.site,
      dateRange: `${query.startDate} to ${query.endDate}`,
      markets: query.markets,
      targetPages: query.targetPages?.length || 0
    });

    try {
      // Build the Search Console API request
      const requestBody: any = {
        startDate: query.startDate,
        endDate: query.endDate,
        dimensions: ['query', 'page', 'country', 'device'],
        rowLimit: 25000, // Max allowed by API
        startRow: 0,
      };

      // Add country filter for markets
      if (query.markets.length > 0) {
        requestBody.dimensionFilterGroups = [
          {
            filters: query.markets.map(market => ({
              dimension: 'country',
              operator: 'equals',
              expression: market.toLowerCase()
            }))
          }
        ];
      }

      // Add page filter if target pages specified
      if (query.targetPages && query.targetPages.length > 0) {
        const pageFilters = query.targetPages.map(page => ({
          dimension: 'page',
          operator: 'contains',
          expression: page
        }));

        if (requestBody.dimensionFilterGroups) {
          requestBody.dimensionFilterGroups.push({
            filters: pageFilters
          });
        } else {
          requestBody.dimensionFilterGroups = [{
            filters: pageFilters
          }];
        }
      }

      const response = await this.searchConsole.searchanalytics.query({
        siteUrl: query.site,
        requestBody: requestBody,
      });

      const validatedResponse = SearchConsoleResponseSchema.parse(response.data);
      
      if (!validatedResponse.rows || validatedResponse.rows.length === 0) {
        result.warnings.push(`No Search Console data found for ${query.site} in the specified date range`);
        logger.warn(`⚠️  No data found for ${query.site}`);
        return result;
      }

      logger.info(`📊 Retrieved ${validatedResponse.rows.length} Search Console data points`);

      // Process the results
      const processedData = this.processSearchConsoleData(validatedResponse.rows, query.markets);
      
      result.keywords = processedData.keywords;
      result.totalQueries = processedData.totalQueries;
      result.totalClicks = processedData.totalClicks;
      result.totalImpressions = processedData.totalImpressions;
      result.averageCTR = processedData.averageCTR;
      result.averagePosition = processedData.averagePosition;

      logger.info(`✅ Search Console data processed: ${result.keywords.length} unique queries`);
      logger.debug('Summary:', {
        totalClicks: result.totalClicks,
        totalImpressions: result.totalImpressions,
        avgCTR: `${(result.averageCTR * 100).toFixed(2)}%`,
        avgPosition: result.averagePosition.toFixed(1)
      });

      return result;

    } catch (error) {
      const errorMsg = `Search Console query failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.warnings.push(errorMsg);
      logger.error(`❌ ${errorMsg}`);
      
      // Don't throw - return empty result to allow fallback to other data sources
      return result;
    }
  }

  private processSearchConsoleData(rows: any[], markets: string[]): {
    keywords: KeywordData[];
    totalQueries: number;
    totalClicks: number;
    totalImpressions: number;
    averageCTR: number;
    averagePosition: number;
  } {
    const keywordMap = new Map<string, {
      clicks: number;
      impressions: number;
      positions: number[];
      markets: Set<string>;
      pages: Set<string>;
    }>();

    let totalClicks = 0;
    let totalImpressions = 0;
    let totalPositions = 0;

    for (const row of rows) {
      const [query, page, country, device] = row.keys;
      const { clicks, impressions, position } = row;

      // Aggregate by query (keyword)
      if (!keywordMap.has(query)) {
        keywordMap.set(query, {
          clicks: 0,
          impressions: 0,
          positions: [],
          markets: new Set(),
          pages: new Set()
        });
      }

      const keywordData = keywordMap.get(query)!;
      keywordData.clicks += clicks;
      keywordData.impressions += impressions;
      keywordData.positions.push(position);
      keywordData.markets.add(country.toUpperCase());
      keywordData.pages.add(page);

      totalClicks += clicks;
      totalImpressions += impressions;
      totalPositions += position;
    }

    // Convert to KeywordData array
    const keywords: KeywordData[] = [];
    
    for (const [query, data] of keywordMap.entries()) {
      try {
        // Calculate average position for this query
        const avgPosition = data.positions.reduce((sum, pos) => sum + pos, 0) / data.positions.length;
        
        // Estimate volume from impressions (rough proxy)
        // GSC impressions are typically 10-30% of actual search volume
        const estimatedVolume = Math.round(data.impressions * 2.5);

        // Calculate CTR
        const ctr = data.clicks / data.impressions;

        // Estimate competition from position (inverse relationship)
        // Higher average position suggests lower competition
        const estimatedCompetition = Math.min(0.9, Math.max(0.1, (avgPosition - 1) / 20));

        const keyword = KeywordDataSchema.parse({
          keyword: query,
          volume: estimatedVolume,
          competition: estimatedCompetition,
          intent_score: 1.0, // Will be calculated later in scoring
          final_score: 0,
          data_source: 'gsc' as const,
          markets: Array.from(data.markets),
          recommended_match_type: 'phrase' as const,
        });

        keywords.push(keyword);

      } catch (error) {
        logger.debug(`⚠️  Skipped invalid keyword: ${query}`, error);
      }
    }

    return {
      keywords,
      totalQueries: keywordMap.size,
      totalClicks,
      totalImpressions,
      averageCTR: totalClicks / totalImpressions,
      averagePosition: totalPositions / rows.length
    };
  }

  async listSites(): Promise<string[]> {
    if (!this.isAuthenticated) {
      logger.warn('⚠️  Search Console not authenticated');
      return [];
    }

    try {
      const response = await this.searchConsole.sites.list();
      const sites = response.data.siteEntry?.map((site: any) => site.siteUrl) || [];
      
      logger.info(`🔗 Available Search Console sites: ${sites.length}`);
      sites.forEach((site: string) => logger.debug(`  - ${site}`));
      
      return sites;
      
    } catch (error) {
      logger.error('❌ Failed to list Search Console sites:', error);
      return [];
    }
  }

  isAvailable(): boolean {
    return this.isAuthenticated;
  }

  getConfiguredSites(): string[] {
    return this.sites;
  }
}