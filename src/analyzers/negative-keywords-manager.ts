import pino from 'pino';
import { z } from 'zod';
import { GoogleAdsApiClient } from '../connectors/google-ads-api.js';
import { WasteAnalyzer } from './waste.js';
import { AuditLogger } from '../monitors/audit-logger.js';
import crypto from 'crypto';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Negative keyword list schemas
export const NegativeKeywordSchema = z.object({
  text: z.string(),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  source: z.enum(['waste_analysis', 'manual', 'auto_discovery', 'competitor_analysis']),
  addedDate: z.string(),
  reason: z.string().optional(),
  performanceImpact: z.object({
    wastedSpend: z.number().optional(),
    blockedImpressions: z.number().optional(),
    preventedClicks: z.number().optional()
  }).optional()
});

export const SharedNegativeListSchema = z.object({
  id: z.string(),
  name: z.string(),
  product: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  keywords: z.array(NegativeKeywordSchema),
  attachedCampaigns: z.array(z.string()),
  metadata: z.object({
    totalKeywords: z.number(),
    lastSyncDate: z.string().optional(),
    estimatedSavings: z.number().optional(),
    autoUpdateEnabled: z.boolean().default(true)
  })
});

export const NegativeListUpdateSchema = z.object({
  listId: z.string(),
  product: z.string(),
  added: z.array(NegativeKeywordSchema),
  removed: z.array(z.string()),
  unchanged: z.number(),
  conflicts: z.array(z.object({
    keyword: z.string(),
    existingMatchType: z.string(),
    newMatchType: z.string(),
    resolution: z.enum(['keep_existing', 'use_new', 'keep_both'])
  })),
  version: z.object({
    previous: z.number(),
    current: z.number()
  }),
  timestamp: z.string()
});

export type NegativeKeyword = z.infer<typeof NegativeKeywordSchema>;
export type SharedNegativeList = z.infer<typeof SharedNegativeListSchema>;
export type NegativeListUpdate = z.infer<typeof NegativeListUpdateSchema>;

// Product-specific negative keyword presets
const PRODUCT_NEGATIVE_PRESETS: Record<string, NegativeKeyword[]> = {
  'convert-my-file': [
    { text: 'free converter', matchType: 'PHRASE', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'crack', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'torrent', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'virus', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'malware', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() }
  ],
  'palette-kit': [
    { text: 'photoshop', matchType: 'EXACT', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'illustrator', matchType: 'EXACT', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'free color picker', matchType: 'PHRASE', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'pirated', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() }
  ],
  'notebridge': [
    { text: 'evernote', matchType: 'EXACT', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'onenote', matchType: 'EXACT', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'free notes app', matchType: 'PHRASE', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'notion', matchType: 'EXACT', source: 'manual', addedDate: new Date().toISOString() }
  ],
  'default': [
    { text: 'free', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'crack', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'hack', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'illegal', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'torrent', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'warez', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() },
    { text: 'keygen', matchType: 'BROAD', source: 'manual', addedDate: new Date().toISOString() }
  ]
};

export class NegativeKeywordsManager {
  private googleAdsClient: GoogleAdsApiClient;
  private wasteAnalyzer: WasteAnalyzer;
  private auditLogger: AuditLogger;
  private sharedLists: Map<string, SharedNegativeList>;
  private syncHistory: NegativeListUpdate[] = [];

  constructor() {
    this.googleAdsClient = new GoogleAdsApiClient();
    this.wasteAnalyzer = new WasteAnalyzer();
    this.auditLogger = new AuditLogger();
    this.sharedLists = new Map();
    
    // Initialize with preset lists
    this.initializePresetLists();
  }

  /**
   * Initialize preset negative keyword lists for each product
   */
  private initializePresetLists(): void {
    for (const [product, keywords] of Object.entries(PRODUCT_NEGATIVE_PRESETS)) {
      if (product === 'default') continue;
      
      const list: SharedNegativeList = {
        id: `negative-list-${product}`,
        name: `${product} Negative Keywords`,
        product,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        keywords: [...PRODUCT_NEGATIVE_PRESETS.default, ...keywords],
        attachedCampaigns: [],
        metadata: {
          totalKeywords: PRODUCT_NEGATIVE_PRESETS.default.length + keywords.length,
          autoUpdateEnabled: true
        }
      };
      
      this.sharedLists.set(product, list);
      logger.info(`Initialized negative keyword list for ${product} with ${list.keywords.length} keywords`);
    }
  }

  /**
   * Sync negative keywords from waste analysis
   */
  async syncNegativeKeywords(product: string, customerId?: string): Promise<NegativeListUpdate> {
    logger.info(`Starting negative keyword sync for ${product}`);
    
    // Get or create the shared list for this product
    let sharedList = this.sharedLists.get(product);
    if (!sharedList) {
      sharedList = await this.createSharedList(product);
    }

    // Get wasted keywords from waste analyzer
    const wasteAnalysis = await this.wasteAnalyzer.identifyWastedSpend();
    const wastedKeywords = wasteAnalysis.wastedKeywords || [];

    // Get existing negative list from Google Ads API if configured
    let apiNegativeKeywords: NegativeKeyword[] = [];
    if (customerId && this.googleAdsClient.isConfigured()) {
      try {
        apiNegativeKeywords = await this.fetchApiNegativeList(customerId, sharedList.id);
      } catch (error) {
        logger.warn('Could not fetch negative keywords from API', error);
      }
    }

    // Merge and version the lists
    const update = await this.mergeAndVersion(
      wastedKeywords,
      sharedList.keywords,
      apiNegativeKeywords
    );

    // Update the shared list
    sharedList.keywords = [
      ...sharedList.keywords.filter(k => !update.removed.includes(k.text)),
      ...update.added
    ];
    sharedList.version = update.version.current;
    sharedList.updatedAt = update.timestamp;
    sharedList.metadata.totalKeywords = sharedList.keywords.length;
    sharedList.metadata.lastSyncDate = update.timestamp;

    // Calculate estimated savings
    const estimatedSavings = update.added.reduce((total, keyword) => 
      total + (keyword.performanceImpact?.wastedSpend || 0), 0
    );
    sharedList.metadata.estimatedSavings = (sharedList.metadata.estimatedSavings || 0) + estimatedSavings;

    // Store updated list
    this.sharedLists.set(product, sharedList);
    
    // Save sync history
    this.syncHistory.push(update);
    
    // Log to audit trail
    await this.auditLogger.logConfiguration({
      configType: 'negative_keywords',
      before: { version: update.version.previous, count: sharedList.keywords.length - update.added.length },
      after: { version: update.version.current, count: sharedList.keywords.length },
      user: 'system'
    });

    logger.info(`Negative keyword sync complete: ${update.added.length} added, ${update.removed.length} removed`);
    
    return update;
  }

  /**
   * Create a new shared negative keyword list
   */
  async createSharedList(product: string): Promise<SharedNegativeList> {
    const presetKeywords = PRODUCT_NEGATIVE_PRESETS[product] || PRODUCT_NEGATIVE_PRESETS.default;
    
    const list: SharedNegativeList = {
      id: `negative-list-${product}-${Date.now()}`,
      name: `${product} Negative Keywords`,
      product,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      keywords: [...PRODUCT_NEGATIVE_PRESETS.default, ...presetKeywords],
      attachedCampaigns: [],
      metadata: {
        totalKeywords: PRODUCT_NEGATIVE_PRESETS.default.length + presetKeywords.length,
        autoUpdateEnabled: true
      }
    };

    this.sharedLists.set(product, list);
    
    logger.info(`Created new shared negative keyword list for ${product}`);
    return list;
  }

  /**
   * Merge negative keyword lists and handle versioning
   */
  async mergeAndVersion(
    wasteTerms: any[],
    existingList: NegativeKeyword[],
    apiList: NegativeKeyword[] = []
  ): Promise<NegativeListUpdate> {
    const update: NegativeListUpdate = {
      listId: crypto.randomBytes(16).toString('hex'),
      product: 'merged',
      added: [],
      removed: [],
      unchanged: 0,
      conflicts: [],
      version: {
        previous: 1,
        current: 2
      },
      timestamp: new Date().toISOString()
    };

    // Create maps for efficient lookup
    const existingMap = new Map(existingList.map(k => [k.text.toLowerCase(), k]));
    const apiMap = new Map(apiList.map(k => [k.text.toLowerCase(), k]));
    
    // Process waste terms
    for (const wasteTerm of wasteTerms) {
      const keywordText = wasteTerm.keyword?.toLowerCase() || wasteTerm.text?.toLowerCase();
      if (!keywordText) continue;

      const existing = existingMap.get(keywordText);
      const inApi = apiMap.get(keywordText);

      if (!existing && !inApi) {
        // New negative keyword to add
        const newKeyword: NegativeKeyword = {
          text: wasteTerm.keyword || wasteTerm.text,
          matchType: this.determineMatchType(wasteTerm),
          source: 'waste_analysis',
          addedDate: new Date().toISOString(),
          reason: `Wasted spend: $${wasteTerm.wastedSpend?.toFixed(2) || '0'}`,
          performanceImpact: {
            wastedSpend: wasteTerm.wastedSpend || 0,
            blockedImpressions: wasteTerm.impressions || 0,
            preventedClicks: wasteTerm.clicks || 0
          }
        };
        update.added.push(newKeyword);
      } else if (existing && !inApi) {
        // Exists locally but not in API - might need to push to API
        update.unchanged++;
      } else if (existing && inApi && existing.matchType !== inApi.matchType) {
        // Conflict in match types
        update.conflicts.push({
          keyword: keywordText,
          existingMatchType: existing.matchType,
          newMatchType: inApi.matchType,
          resolution: 'keep_existing' // Default resolution strategy
        });
      } else {
        update.unchanged++;
      }
    }

    // Check for keywords to remove (in existing but not in waste analysis and not in API)
    for (const [text, keyword] of existingMap) {
      const stillWasted = wasteTerms.some(w => 
        (w.keyword?.toLowerCase() || w.text?.toLowerCase()) === text
      );
      const inApi = apiMap.has(text);
      
      if (!stillWasted && !inApi && keyword.source === 'waste_analysis') {
        // Was from waste analysis but no longer wasted - consider removal
        const daysSinceAdded = (Date.now() - new Date(keyword.addedDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceAdded > 30) {
          // Remove if older than 30 days and no longer appearing in waste
          update.removed.push(text);
        }
      }
    }

    // Update version numbers
    if (existingList.length > 0) {
      update.version.previous = Math.max(...existingList.map(() => 1)) || 1;
      update.version.current = update.version.previous + 1;
    }

    return update;
  }

  /**
   * Determine the best match type for a negative keyword
   */
  private determineMatchType(wasteTerm: any): 'EXACT' | 'PHRASE' | 'BROAD' {
    const keyword = wasteTerm.keyword || wasteTerm.text || '';
    const wordCount = keyword.trim().split(/\s+/).length;
    
    // Use exact match for single words with high waste
    if (wordCount === 1 && wasteTerm.wastedSpend > 10) {
      return 'EXACT';
    }
    
    // Use phrase match for multi-word terms
    if (wordCount > 1 && wordCount <= 3) {
      return 'PHRASE';
    }
    
    // Use broad match for generic terms or long phrases
    return 'BROAD';
  }

  /**
   * Fetch negative keywords from Google Ads API
   */
  private async fetchApiNegativeList(customerId: string, listId: string): Promise<NegativeKeyword[]> {
    // This would call the actual Google Ads API
    // For now, return empty array as API integration is simulated
    logger.debug(`Fetching negative keywords from API for list ${listId}`);
    return [];
  }

  /**
   * Attach a shared negative list to campaigns
   */
  async attachToCampaigns(product: string, campaignIds: string[], customerId: string): Promise<void> {
    const sharedList = this.sharedLists.get(product);
    if (!sharedList) {
      throw new Error(`No shared negative list found for product: ${product}`);
    }

    // Update attached campaigns
    sharedList.attachedCampaigns = [...new Set([...sharedList.attachedCampaigns, ...campaignIds])];
    sharedList.updatedAt = new Date().toISOString();

    logger.info(`Attached negative keyword list to ${campaignIds.length} campaigns for ${product}`);

    // In real implementation, this would call Google Ads API to attach the list
    if (this.googleAdsClient.isConfigured()) {
      // await this.googleAdsClient.attachSharedList(customerId, sharedList.id, campaignIds);
    }

    // Log to audit trail
    await this.auditLogger.logConfiguration({
      configType: 'negative_list_attachment',
      before: { attachedCampaigns: sharedList.attachedCampaigns.length - campaignIds.length },
      after: { attachedCampaigns: sharedList.attachedCampaigns.length },
      user: 'system'
    });
  }

  /**
   * Get negative keyword list for a product
   */
  getProductNegatives(product: string): SharedNegativeList | undefined {
    return this.sharedLists.get(product);
  }

  /**
   * Get all shared negative lists
   */
  getAllLists(): SharedNegativeList[] {
    return Array.from(this.sharedLists.values());
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit = 10): NegativeListUpdate[] {
    return this.syncHistory.slice(-limit);
  }

  /**
   * Add manual negative keywords
   */
  async addManualNegatives(product: string, keywords: Array<{
    text: string;
    matchType: 'EXACT' | 'PHRASE' | 'BROAD';
    reason?: string;
  }>): Promise<NegativeListUpdate> {
    const sharedList = this.sharedLists.get(product);
    if (!sharedList) {
      throw new Error(`No shared negative list found for product: ${product}`);
    }

    const update: NegativeListUpdate = {
      listId: sharedList.id,
      product,
      added: [],
      removed: [],
      unchanged: 0,
      conflicts: [],
      version: {
        previous: sharedList.version,
        current: sharedList.version + 1
      },
      timestamp: new Date().toISOString()
    };

    const existingMap = new Map(sharedList.keywords.map(k => [k.text.toLowerCase(), k]));

    for (const keyword of keywords) {
      const existing = existingMap.get(keyword.text.toLowerCase());
      
      if (!existing) {
        const newKeyword: NegativeKeyword = {
          text: keyword.text,
          matchType: keyword.matchType,
          source: 'manual',
          addedDate: new Date().toISOString(),
          reason: keyword.reason || 'Manually added'
        };
        update.added.push(newKeyword);
        sharedList.keywords.push(newKeyword);
      } else if (existing.matchType !== keyword.matchType) {
        update.conflicts.push({
          keyword: keyword.text,
          existingMatchType: existing.matchType,
          newMatchType: keyword.matchType,
          resolution: 'keep_existing'
        });
      } else {
        update.unchanged++;
      }
    }

    // Update list metadata
    sharedList.version = update.version.current;
    sharedList.updatedAt = update.timestamp;
    sharedList.metadata.totalKeywords = sharedList.keywords.length;

    this.syncHistory.push(update);

    logger.info(`Added ${update.added.length} manual negative keywords to ${product}`);
    return update;
  }

  /**
   * Remove negative keywords
   */
  async removeNegatives(product: string, keywordTexts: string[]): Promise<NegativeListUpdate> {
    const sharedList = this.sharedLists.get(product);
    if (!sharedList) {
      throw new Error(`No shared negative list found for product: ${product}`);
    }

    const update: NegativeListUpdate = {
      listId: sharedList.id,
      product,
      added: [],
      removed: [],
      unchanged: 0,
      conflicts: [],
      version: {
        previous: sharedList.version,
        current: sharedList.version + 1
      },
      timestamp: new Date().toISOString()
    };

    const textsToRemove = new Set(keywordTexts.map(t => t.toLowerCase()));
    
    sharedList.keywords = sharedList.keywords.filter(keyword => {
      if (textsToRemove.has(keyword.text.toLowerCase())) {
        update.removed.push(keyword.text);
        return false;
      }
      return true;
    });

    // Update list metadata
    sharedList.version = update.version.current;
    sharedList.updatedAt = update.timestamp;
    sharedList.metadata.totalKeywords = sharedList.keywords.length;

    this.syncHistory.push(update);

    logger.info(`Removed ${update.removed.length} negative keywords from ${product}`);
    return update;
  }

  /**
   * Export negative keywords to CSV format
   */
  exportToCSV(product: string): string {
    const sharedList = this.sharedLists.get(product);
    if (!sharedList) {
      throw new Error(`No shared negative list found for product: ${product}`);
    }

    const headers = ['Keyword', 'Match Type', 'Source', 'Added Date', 'Reason', 'Wasted Spend'];
    const rows = sharedList.keywords.map(k => [
      k.text,
      k.matchType,
      k.source,
      k.addedDate,
      k.reason || '',
      k.performanceImpact?.wastedSpend?.toFixed(2) || '0'
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Get negative keyword statistics
   */
  getStatistics(product?: string): {
    totalKeywords: number;
    byMatchType: Record<string, number>;
    bySource: Record<string, number>;
    estimatedSavings: number;
    lastSync?: string;
    topWastePreventers: Array<{ keyword: string; savedAmount: number }>;
  } {
    const lists = product ? [this.sharedLists.get(product)].filter(Boolean) : Array.from(this.sharedLists.values());
    
    let totalKeywords = 0;
    const byMatchType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let estimatedSavings = 0;
    let lastSync: string | undefined;
    const wastePreventers: Array<{ keyword: string; savedAmount: number }> = [];

    for (const list of lists) {
      if (!list) continue;
      
      totalKeywords += list.keywords.length;
      estimatedSavings += list.metadata.estimatedSavings || 0;
      
      if (!lastSync || (list.metadata.lastSyncDate && list.metadata.lastSyncDate > lastSync)) {
        lastSync = list.metadata.lastSyncDate;
      }

      for (const keyword of list.keywords) {
        byMatchType[keyword.matchType] = (byMatchType[keyword.matchType] || 0) + 1;
        bySource[keyword.source] = (bySource[keyword.source] || 0) + 1;
        
        if (keyword.performanceImpact?.wastedSpend) {
          wastePreventers.push({
            keyword: keyword.text,
            savedAmount: keyword.performanceImpact.wastedSpend
          });
        }
      }
    }

    // Get top 10 waste preventers
    wastePreventers.sort((a, b) => b.savedAmount - a.savedAmount);
    const topWastePreventers = wastePreventers.slice(0, 10);

    return {
      totalKeywords,
      byMatchType,
      bySource,
      estimatedSavings,
      lastSync,
      topWastePreventers
    };
  }
}