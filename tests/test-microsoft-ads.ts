import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  MicrosoftAdsCSVWriter,
  GoogleToMicrosoftTranslator,
  MicrosoftCampaign,
  MicrosoftAdGroup,
  MicrosoftKeyword
} from '../src/writers/microsoft-ads-csv.js';
import { 
  BingKeywordsConnector,
  BingKeywordSuggestion,
  BingKeywordMetrics,
  BingMarketOpportunity
} from '../src/connectors/bing-keywords.js';

describe('Microsoft Ads Integration', () => {
  describe('GoogleToMicrosoftTranslator', () => {
    let translator: GoogleToMicrosoftTranslator;
    
    beforeEach(() => {
      translator = new GoogleToMicrosoftTranslator();
    });

    it('should translate Google campaign to Microsoft format', () => {
      const googleCampaign = {
        name: 'Test Campaign',
        status: 'ENABLED',
        budget: {
          amountMicros: '50000000'
        },
        biddingStrategy: 'MAXIMIZE_CONVERSIONS',
        targetLocations: ['US', 'CA'],
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const microsoftCampaign = translator.translateCampaign(googleCampaign);
      
      expect(microsoftCampaign.Type).toBe('Campaign');
      expect(microsoftCampaign.Status).toBe('Active');
      expect(microsoftCampaign.Campaign).toBe('Test Campaign');
      expect(microsoftCampaign.Budget).toBe(50);
      expect(microsoftCampaign['Budget Type']).toBe('DailyBudgetStandard');
      expect(microsoftCampaign['Bid Strategy Type']).toBe('MaxConversions');
      expect(microsoftCampaign.Location).toBe('US;CA');
    });

    it('should translate status correctly', () => {
      expect(translator.translateCampaign({ status: 'ENABLED' }).Status).toBe('Active');
      expect(translator.translateCampaign({ status: 'PAUSED' }).Status).toBe('Paused');
      expect(translator.translateCampaign({ status: 'REMOVED' }).Status).toBe('Deleted');
      expect(translator.translateCampaign({}).Status).toBe('Paused'); // Default
    });

    it('should translate ad group to Microsoft format', () => {
      const googleAdGroup = {
        name: 'Test Ad Group',
        status: 'ENABLED',
        cpcBidMicros: '1500000'
      };

      const microsoftAdGroup = translator.translateAdGroup(googleAdGroup, 'Campaign Name');
      
      expect(microsoftAdGroup.Type).toBe('Ad Group');
      expect(microsoftAdGroup.Status).toBe('Active');
      expect(microsoftAdGroup['Ad Group']).toBe('Test Ad Group');
      expect(microsoftAdGroup.Campaign).toBe('Campaign Name');
      expect(microsoftAdGroup['Search Bid']).toBe(1.5);
      expect(microsoftAdGroup['Cpc Bid']).toBe(1.5);
    });

    it('should translate keyword to Microsoft format', () => {
      const googleKeyword = {
        text: 'test keyword',
        matchType: 'EXACT',
        status: 'ENABLED',
        cpcBidMicros: '2000000',
        finalUrls: ['https://example.com']
      };

      const microsoftKeyword = translator.translateKeyword(
        googleKeyword,
        'Campaign Name',
        'Ad Group Name'
      );
      
      expect(microsoftKeyword.Type).toBe('Keyword');
      expect(microsoftKeyword.Status).toBe('Active');
      expect(microsoftKeyword.Keyword).toBe('test keyword');
      expect(microsoftKeyword['Match Type']).toBe('Exact');
      expect(microsoftKeyword.Bid).toBe(2);
      expect(microsoftKeyword['Final Url']).toBe('https://example.com');
    });

    it('should translate match types correctly', () => {
      const exact = translator.translateKeyword({ matchType: 'EXACT' }, '', '');
      const phrase = translator.translateKeyword({ matchType: 'PHRASE' }, '', '');
      const broad = translator.translateKeyword({ matchType: 'BROAD' }, '', '');
      const defaultMatch = translator.translateKeyword({}, '', '');
      
      expect(exact['Match Type']).toBe('Exact');
      expect(phrase['Match Type']).toBe('Phrase');
      expect(broad['Match Type']).toBe('Broad');
      expect(defaultMatch['Match Type']).toBe('Broad');
    });

    it('should translate responsive search ad', () => {
      const googleAd = {
        status: 'ENABLED',
        headlines: [
          { text: 'Headline 1' },
          { text: 'Headline 2' },
          { text: 'Headline 3' }
        ],
        descriptions: [
          { text: 'Description 1' },
          { text: 'Description 2' }
        ],
        path1: 'path1',
        path2: 'path2',
        finalUrls: ['https://example.com']
      };

      const microsoftAd = translator.translateResponsiveSearchAd(
        googleAd,
        'Campaign Name',
        'Ad Group Name'
      );
      
      expect(microsoftAd.Type).toBe('Responsive Search Ad');
      expect(microsoftAd.Status).toBe('Active');
      expect(microsoftAd['Headline 1']).toBe('Headline 1');
      expect(microsoftAd['Headline 2']).toBe('Headline 2');
      expect(microsoftAd['Headline 3']).toBe('Headline 3');
      expect(microsoftAd['Description 1']).toBe('Description 1');
      expect(microsoftAd['Description 2']).toBe('Description 2');
      expect(microsoftAd['Path 1']).toBe('path1');
      expect(microsoftAd['Path 2']).toBe('path2');
      expect(microsoftAd['Final Url']).toBe('https://example.com');
    });

    it('should handle missing ad components with defaults', () => {
      const googleAd = {
        status: 'ENABLED'
      };

      const microsoftAd = translator.translateResponsiveSearchAd(
        googleAd,
        'Campaign Name',
        'Ad Group Name'
      );
      
      expect(microsoftAd['Headline 1']).toBe('Best Chrome Extension');
      expect(microsoftAd['Description 1']).toBe('Enhance your browsing experience');
      expect(microsoftAd['Final Url']).toBe('https://example.com');
    });
  });

  describe('MicrosoftAdsCSVWriter', () => {
    let writer: MicrosoftAdsCSVWriter;
    
    beforeEach(() => {
      writer = new MicrosoftAdsCSVWriter();
    });

    it('should generate bulk CSV from campaigns', async () => {
      const campaigns = [
        {
          name: 'Test Campaign',
          status: 'PAUSED',
          budget: { amountMicros: '10000000' },
          adGroups: [
            {
              name: 'Test Ad Group',
              status: 'PAUSED',
              keywords: [
                { text: 'keyword1', matchType: 'EXACT' },
                { text: 'keyword2', matchType: 'PHRASE' }
              ],
              ads: [
                {
                  headlines: [{ text: 'Ad Headline' }],
                  descriptions: [{ text: 'Ad Description' }],
                  finalUrls: ['https://example.com']
                }
              ]
            }
          ]
        }
      ];

      const csv = await writer.exportBulkCsv(campaigns);
      
      expect(csv).toContain('Type,');
      expect(csv).toContain('Campaign,Test Campaign');
      expect(csv).toContain('Ad Group,Test Ad Group');
      expect(csv).toContain('Keyword,keyword1');
      expect(csv).toContain('Keyword,keyword2');
      expect(csv).toContain('Responsive Search Ad');
    });

    it('should validate bulk CSV format', () => {
      const validCsv = `Type,Campaign,Status,Budget
Campaign,Test Campaign,Active,10
Type,Ad Group,Campaign,Ad Group,Status
Ad Group,Test Campaign,Test Ad Group,Active
Type,Keyword,Campaign,Ad Group,Keyword,Match Type
Keyword,Test Campaign,Test Ad Group,test keyword,Exact`;

      const result = writer.validateBulkFormat(validCsv);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.campaigns).toBe(1);
      expect(result.stats.adGroups).toBe(1);
      expect(result.stats.keywords).toBe(1);
    });

    it('should detect CSV format errors', () => {
      const invalidCsv = `Campaign,Status,Budget
Test Campaign,Active,10`;

      const result = writer.validateBulkFormat(invalidCsv);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Type'))).toBe(true);
    });

    it('should generate warnings for missing components', () => {
      const csvWithoutKeywords = `Type,Campaign,Status,Budget
Campaign,Test Campaign,Active,10
Type,Ad Group,Campaign,Ad Group,Status
Ad Group,Test Campaign,Test Ad Group,Active`;

      const result = writer.validateBulkFormat(csvWithoutKeywords);
      
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('No keywords'))).toBe(true);
    });

    it('should handle negative keywords in CSV', async () => {
      const campaigns = [
        {
          name: 'Test Campaign',
          status: 'PAUSED',
          budget: { amountMicros: '10000000' },
          negativeKeywords: [
            { text: 'negative1', matchType: 'EXACT' },
            { text: 'negative2', matchType: 'PHRASE' }
          ],
          adGroups: []
        }
      ];

      const csv = await writer.exportBulkCsv(campaigns);
      
      expect(csv).toContain('Campaign Negative Keyword');
      expect(csv).toContain('negative1');
      expect(csv).toContain('negative2');
    });

    it('should generate campaigns from opportunities', async () => {
      // Mock the orchestrator response
      const mockOrchestrator = {
        generateStrategicIntelligence: vi.fn().mockResolvedValue({
          opportunities: [
            {
              title: 'High Intent Users',
              estimatedBudget: 50,
              keywords: [
                { keyword: 'test keyword', theme: 'Features', suggestedBid: 1.5 }
              ]
            }
          ]
        })
      };
      (writer as any).orchestrator = mockOrchestrator;

      const campaigns = await writer.generateFromOpportunities(
        'test-product',
        'AU',
        { includeNegatives: true }
      );
      
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].name).toBe('test-product - High Intent Users');
      expect(campaigns[0].adGroups).toHaveLength(1);
      expect(campaigns[0].adGroups[0].keywords).toHaveLength(1);
      expect(campaigns[0].negativeKeywords).toBeDefined();
    });

    it('should parse CSV lines with quotes correctly', () => {
      const line = 'Campaign,"Test, Campaign",Active,"10,000"';
      const parsed = (writer as any).parseCSVLine(line);
      
      expect(parsed).toHaveLength(4);
      expect(parsed[0]).toBe('Campaign');
      expect(parsed[1]).toBe('Test, Campaign');
      expect(parsed[2]).toBe('Active');
      expect(parsed[3]).toBe('10,000');
    });
  });

  describe('BingKeywordsConnector', () => {
    let connector: BingKeywordsConnector;
    
    beforeEach(() => {
      connector = new BingKeywordsConnector();
    });

    it('should get keyword suggestions', async () => {
      const suggestions = await connector.getKeywordSuggestions(
        ['chrome extension'],
        'en-AU'
      );
      
      expect(suggestions.suggestions.length).toBeGreaterThan(0);
      expect(suggestions.market).toBe('en-AU');
      expect(suggestions.suggestions[0]).toHaveProperty('keyword');
      expect(suggestions.suggestions[0]).toHaveProperty('source', 'bing');
    });

    it('should deduplicate suggestions', async () => {
      const suggestions = await connector.getKeywordSuggestions(
        ['test', 'test'], // Duplicate seeds
        'en-AU'
      );
      
      const keywords = suggestions.suggestions.map(s => s.keyword);
      const uniqueKeywords = [...new Set(keywords)];
      expect(keywords.length).toBe(uniqueKeywords.length);
    });

    it('should get keyword metrics', async () => {
      const metrics = await connector.getKeywordMetrics(
        ['keyword1', 'keyword2'],
        'en-AU'
      );
      
      expect(metrics).toHaveLength(2);
      expect(metrics[0]).toHaveProperty('keyword');
      expect(metrics[0]).toHaveProperty('monthlySearches');
      expect(metrics[0]).toHaveProperty('avgCpc');
      expect(metrics[0]).toHaveProperty('competition');
      expect(metrics[0]).toHaveProperty('competitionLevel');
    });

    it('should calculate market opportunity', async () => {
      const opportunity = await connector.calculateMarketOpportunity(
        'test-product',
        ['keyword1', 'keyword2', 'keyword3'],
        'en-AU'
      );
      
      expect(opportunity).toHaveProperty('market', 'en-AU');
      expect(opportunity).toHaveProperty('totalSearchVolume');
      expect(opportunity).toHaveProperty('avgCompetition');
      expect(opportunity).toHaveProperty('avgCpc');
      expect(opportunity).toHaveProperty('opportunityScore');
      expect(opportunity).toHaveProperty('topKeywords');
      expect(opportunity).toHaveProperty('deviceDistribution');
      
      const { deviceDistribution } = opportunity;
      const totalPercent = deviceDistribution.desktop + deviceDistribution.mobile + deviceDistribution.tablet;
      expect(Math.round(totalPercent)).toBe(100);
    });

    it('should merge Bing data with existing keyword data', () => {
      const existingData = [
        { keyword: 'test1', score: 50, cpc: 1 },
        { keyword: 'test2', score: 60, cpc: 2 }
      ];

      const bingMetrics: BingKeywordMetrics[] = [
        {
          keyword: 'test1',
          monthlySearches: 1000,
          avgCpc: 1.5,
          competition: 0.5,
          competitionLevel: 'Medium'
        }
      ];

      const merged = connector.mergeWithKeywordData(existingData as any, bingMetrics);
      
      expect(merged[0]).toHaveProperty('bingSearchVolume', 1000);
      expect(merged[0]).toHaveProperty('bingCpc', 1.5);
      expect(merged[0]).toHaveProperty('bingCompetition', 0.5);
      expect(merged[0]).toHaveProperty('adjustedScore');
      expect(merged[1]).not.toHaveProperty('bingSearchVolume'); // No Bing data for test2
    });

    it('should get competitive insights', async () => {
      const insights = await connector.getCompetitiveInsights(
        ['keyword1', 'keyword2'],
        'en-AU'
      );
      
      expect(insights).toHaveProperty('avgCompetitorBid');
      expect(insights).toHaveProperty('topCompetitors');
      expect(insights).toHaveProperty('competitionTrend');
      expect(insights).toHaveProperty('recommendedBidAdjustment');
      expect(insights.topCompetitors).toHaveLength(3);
      expect(['increasing', 'stable', 'decreasing']).toContain(insights.competitionTrend);
    });

    it('should return simulated data when not configured', async () => {
      // Connector should work even without API key
      const isConfigured = connector.getIsConfigured();
      
      const suggestions = await connector.getKeywordSuggestions(['test'], 'en-AU');
      expect(suggestions.suggestions.length).toBeGreaterThan(0);
      
      const metrics = await connector.getKeywordMetrics(['test'], 'en-AU');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should handle search query report request', async () => {
      const report = await connector.getSearchQueryReport('campaign-123');
      
      // Should return empty array as this requires active campaigns
      expect(Array.isArray(report)).toBe(true);
      expect(report).toHaveLength(0);
    });
  });
});