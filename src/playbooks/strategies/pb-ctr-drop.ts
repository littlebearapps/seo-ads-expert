/**
 * CTR Drop Playbook
 * Remediation strategy for click-through rate drops
 */

import { DatabaseManager } from '../../database/database-manager.js';
import { logger } from '../../utils/logger.js';
import { Playbook, PlaybookOptions, Remediation, RemediationStep } from '../types.js';
import type { Alert } from '../../alerts/types.js';

export class CTRDropPlaybook extends Playbook {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    super('pb_ctr_drop', 'ctr_drop', 'Improve CTR through ad optimization and assets');
    this.db = db;
  }
  
  async execute(alert: Alert, options: PlaybookOptions): Promise<Remediation> {
    const steps: RemediationStep[] = [];
    
    try {
      // Step 1: Analyze Quality Score components
      const qsAnalysis = await this.analyzeQualityScore(alert.entity);
      
      // Step 2: Generate RSA variants if Ad Relevance is low
      if (qsAnalysis.adRelevance === 'Below average' || qsAnalysis.expectedCTR === 'Below average') {
        const rsaVariants = await this.generateRSAVariants(alert.entity);
        steps.push({
          action: 'create_rsa_variants',
          artifacts: rsaVariants,
          params: {
            strategy: 'keyword_insertion',
            count: 3,
            testing_budget: 50
          },
          output: 'ads-editor.csv',
          status: options.dryRun ? 'pending' : 'applied'
        });
      }
      
      // Step 3: Add missing assets
      const assetGaps = await this.identifyAssetGaps(alert.entity);
      if (assetGaps.length > 0) {
        const assets = await this.generateAssets(assetGaps);
        steps.push({
          action: 'add_assets',
          artifacts: assets,
          params: {
            types: assetGaps,
            source: 'product_features'
          },
          output: 'assets.csv',
          status: options.dryRun ? 'pending' : 'applied'
        });
      }
      
      // Step 4: Optional bid adjustment
      if (options.allowBidChanges && qsAnalysis.cpcTrend === 'rising') {
        steps.push({
          action: 'adjust_bid',
          params: {
            change: -0.1,
            cap: alert.entity.ad_group ? await this.getMaxCpc(alert.entity.ad_group) * 0.9 : 2.0
          },
          status: options.dryRun ? 'pending' : 'applied',
          reason: 'Reduce bid to improve efficiency'
        });
      }
      
      // Step 5: Add negative keywords for irrelevant traffic
      const negatives = await this.identifyNegatives(alert.entity);
      if (negatives.length > 0) {
        steps.push({
          action: 'add_negatives',
          artifacts: negatives,
          params: {
            level: 'ad_group',
            match_type: 'phrase'
          },
          output: 'negatives.csv',
          status: options.dryRun ? 'pending' : 'applied'
        });
      }
      
      return {
        alertId: alert.id,
        playbook: this.id,
        steps,
        guardrailsPassed: true,
        estimatedImpact: {
          clicks: Math.floor(alert.metrics.current.value * 1.3 * alert.metrics.current.count),
          cost: 0 // No additional cost
        }
      };
      
    } catch (error) {
      logger.error('CTR Drop playbook failed', error);
      return {
        alertId: alert.id,
        playbook: this.id,
        steps,
        guardrailsPassed: false,
        blockers: [`Playbook error: ${error instanceof Error ? error.message : 'Unknown'}`]
      };
    }
  }
  
  private async analyzeQualityScore(entity: any): Promise<any> {
    // Mock QS analysis - would query fact_qs table in production
    return {
      qualityScore: 6,
      expectedCTR: 'Average',
      adRelevance: 'Below average',
      landingPageExperience: 'Average',
      cpcTrend: 'rising'
    };
  }
  
  private async generateRSAVariants(entity: any): Promise<any> {
    // Generate RSA variants based on top keywords
    const keywords = await this.getTopKeywords(entity);
    
    return {
      campaign: entity.campaign,
      ad_group: entity.ad_group,
      variants: [
        {
          headlines: [
            `Best ${keywords[0]} Tool`,
            `Professional ${keywords[0]} Solution`,
            `Try ${keywords[0]} Free`,
            `${keywords[0]} Made Easy`,
            `Trusted ${keywords[0]} Extension`
          ],
          descriptions: [
            `Get the most powerful ${keywords[0]} tool for Chrome. Free trial available.`,
            `Join thousands using our ${keywords[0]} solution. Easy setup, instant results.`
          ],
          status: 'PAUSED' // Start paused for testing
        }
      ]
    };
  }
  
  private async identifyAssetGaps(entity: any): Promise<string[]> {
    // Check which asset types are missing
    const gaps: string[] = [];
    
    // Mock check - would query actual ad assets in production
    const hasAssets = {
      sitelinks: false,
      callouts: true,
      structured_snippets: false
    };
    
    if (!hasAssets.sitelinks) gaps.push('sitelinks');
    if (!hasAssets.structured_snippets) gaps.push('structured_snippets');
    
    return gaps;
  }
  
  private async generateAssets(types: string[]): Promise<any> {
    const assets: any = {};
    
    if (types.includes('sitelinks')) {
      assets.sitelinks = [
        { text: 'Features', url: '/features', description1: 'Explore all features', description2: 'Free & Pro options' },
        { text: 'Pricing', url: '/pricing', description1: 'Simple pricing', description2: 'Start free today' },
        { text: 'Support', url: '/support', description1: '24/7 support', description2: 'Help when you need it' },
        { text: 'Gallery', url: '/gallery', description1: 'See examples', description2: 'Real use cases' }
      ];
    }
    
    if (types.includes('structured_snippets')) {
      assets.structured_snippets = {
        header: 'Features',
        values: ['Color Picker', 'Palette Generator', 'Export Options', 'Favorites', 'History']
      };
    }
    
    return assets;
  }
  
  private async getMaxCpc(adGroup: string): Promise<number> {
    try {
      const db = this.db.getDb();
      const stmt = db.prepare(`
        SELECT MAX(cost / clicks) as max_cpc
        FROM fact_search_terms
        WHERE ad_group = ? AND clicks > 0
      `);
      
      const result = stmt.get(adGroup) as { max_cpc: number } | undefined;
      return result?.max_cpc || 2.0;
    } catch {
      return 2.0;
    }
  }
  
  private async getTopKeywords(entity: any): Promise<string[]> {
    try {
      const db = this.db.getDb();
      const stmt = db.prepare(`
        SELECT search_term, SUM(clicks) as total_clicks
        FROM fact_search_terms
        WHERE ad_group = ?
        GROUP BY search_term
        ORDER BY total_clicks DESC
        LIMIT 5
      `);
      
      const results = stmt.all(entity.ad_group || '') as Array<{ search_term: string }>;
      return results.map(r => r.search_term).filter(Boolean);
    } catch {
      return ['color picker', 'chrome extension'];
    }
  }
  
  private async identifyNegatives(entity: any): Promise<string[]> {
    // Identify low-performing search terms to exclude
    try {
      const db = this.db.getDb();
      const stmt = db.prepare(`
        SELECT search_term
        FROM fact_search_terms
        WHERE ad_group = ?
          AND clicks > 5
          AND conversions = 0
          AND cost > 10
        ORDER BY cost DESC
        LIMIT 10
      `);
      
      const results = stmt.all(entity.ad_group || '') as Array<{ search_term: string }>;
      return results.map(r => r.search_term);
    } catch {
      return [];
    }
  }
}