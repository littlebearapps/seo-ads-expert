/**
 * SERP Monitoring & Drift Detection System
 * Monitors SERP features and detects changes that impact campaign performance
 * Provides strategic recommendations based on SERP evolution
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// SERP feature types
export enum SerpFeature {
  AI_OVERVIEW = 'ai_overview',
  FEATURED_SNIPPET = 'featured_snippet',
  PEOPLE_ALSO_ASK = 'people_also_ask',
  LOCAL_PACK = 'local_pack',
  SHOPPING_PACK = 'shopping_pack',
  IMAGE_PACK = 'image_pack',
  VIDEO_CAROUSEL = 'video_carousel',
  NEWS_CAROUSEL = 'news_carousel',
  KNOWLEDGE_PANEL = 'knowledge_panel',
  TOP_ADS = 'top_ads',
  BOTTOM_ADS = 'bottom_ads'
}

// Change types for drift analysis
export enum ChangeType {
  FEATURE_ADDED = 'FEATURE_ADDED',
  FEATURE_REMOVED = 'FEATURE_REMOVED',
  POSITION_CHANGE = 'POSITION_CHANGE',
  DOMAIN_CHANGE = 'DOMAIN_CHANGE',
  SNIPPET_CHANGE = 'SNIPPET_CHANGE',
  VOLUME_CHANGE = 'VOLUME_CHANGE'
}

// SERP snapshot schema
const SerpSnapshotSchema = z.object({
  cluster: z.string(),
  market: z.string(),
  query: z.string(),
  timestamp: z.string(),
  features: z.record(z.boolean()),
  topResults: z.array(z.object({
    position: z.number(),
    domain: z.string(),
    url: z.string(),
    title: z.string(),
    snippet: z.string().optional(),
    type: z.enum(['organic', 'ad', 'shopping', 'local'])
  })),
  metadata: z.object({
    totalResults: z.number().optional(),
    searchTime: z.number().optional(),
    relatedSearches: z.array(z.string()).optional()
  }).optional(),
  volatilityScore: z.number().min(0).max(1).optional()
});

type SerpSnapshot = z.infer<typeof SerpSnapshotSchema>;

// Change detection result
interface ChangeDetection {
  cluster: string;
  market: string;
  query: string;
  timestamp: string;
  changes: Change[];
  volatilityIncrease: number;
  impactScore: number;
  recommendedActions: RecommendedAction[];
}

interface Change {
  type: ChangeType;
  feature?: SerpFeature;
  details: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  before?: any;
  after?: any;
}

interface RecommendedAction {
  action: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  timeline: string;
  estimatedImpact: string;
  implementation: string[];
}

// Configuration for monitoring
interface SerpMonitorConfig {
  clusters: string[];          // Which keyword clusters to monitor
  markets: string[];           // Which markets to track
  monitoringFrequency: string; // daily, weekly, etc.
  volatilityThreshold: number; // 0-1 score for alerting
  changeImpactWeights: Record<ChangeType, number>;
}

export class SerpWatchMonitor {
  private config: SerpMonitorConfig;
  private snapshotDir: string;

  constructor(config?: Partial<SerpMonitorConfig>, snapshotDir?: string) {
    this.config = {
      clusters: ['pdf-tools', 'image-tools', 'document-tools'],
      markets: ['US', 'GB', 'AU'],
      monitoringFrequency: 'daily',
      volatilityThreshold: 0.3,
      changeImpactWeights: {
        [ChangeType.FEATURE_ADDED]: 0.8,
        [ChangeType.FEATURE_REMOVED]: 0.6,
        [ChangeType.POSITION_CHANGE]: 0.4,
        [ChangeType.DOMAIN_CHANGE]: 0.5,
        [ChangeType.SNIPPET_CHANGE]: 0.2,
        [ChangeType.VOLUME_CHANGE]: 0.7
      },
      ...config
    };
    
    this.snapshotDir = snapshotDir || 'serp-snapshots';
    this.ensureSnapshotDirectory();
  }

  /**
   * Create a SERP snapshot for monitoring
   */
  async createSnapshot(
    cluster: string,
    market: string,
    query: string,
    serpData: any
  ): Promise<SerpSnapshot> {
    const timestamp = new Date().toISOString();
    
    // Parse SERP features from raw data
    const features = this.extractSerpFeatures(serpData);
    
    // Extract top 10 results
    const topResults = this.extractTopResults(serpData);
    
    // Calculate volatility score based on recent changes
    const volatilityScore = await this.calculateVolatility(cluster, market, query, features);
    
    const snapshot: SerpSnapshot = {
      cluster,
      market,
      query,
      timestamp,
      features,
      topResults,
      metadata: {
        totalResults: serpData.totalResults || 0,
        searchTime: serpData.searchTime || 0,
        relatedSearches: serpData.relatedSearches || []
      },
      volatilityScore
    };

    // Validate and save snapshot
    const validSnapshot = SerpSnapshotSchema.parse(snapshot);
    await this.saveSnapshot(validSnapshot);
    
    logger.info(`SERP snapshot created: ${cluster}/${market}/${query}`);
    return validSnapshot;
  }

  /**
   * Detect changes between current and previous snapshots
   */
  async detectChanges(
    cluster: string,
    market: string,
    query: string
  ): Promise<ChangeDetection | null> {
    const snapshots = await this.getRecentSnapshots(cluster, market, query, 2);
    
    if (snapshots.length < 2) {
      logger.warn(`Not enough snapshots for change detection: ${cluster}/${market}/${query}`);
      return null;
    }

    const [current, previous] = snapshots;
    const changes: Change[] = [];

    // Feature changes
    const featureChanges = this.detectFeatureChanges(previous.features, current.features);
    changes.push(...featureChanges);

    // Position changes
    const positionChanges = this.detectPositionChanges(previous.topResults, current.topResults);
    changes.push(...positionChanges);

    // Domain changes
    const domainChanges = this.detectDomainChanges(previous.topResults, current.topResults);
    changes.push(...domainChanges);

    // Calculate impact score
    const impactScore = this.calculateImpactScore(changes);

    // Generate volatility increase
    const volatilityIncrease = (current.volatilityScore || 0) - (previous.volatilityScore || 0);

    // Generate recommended actions
    const recommendedActions = this.generateRecommendedActions(changes, impactScore);

    const changeDetection: ChangeDetection = {
      cluster,
      market,
      query,
      timestamp: current.timestamp,
      changes,
      volatilityIncrease,
      impactScore,
      recommendedActions
    };

    logger.info(`Change detection complete: ${changes.length} changes found, impact: ${impactScore.toFixed(2)}`);
    return changeDetection;
  }

  /**
   * Monitor all configured clusters and markets
   */
  async monitorAll(): Promise<ChangeDetection[]> {
    const allChanges: ChangeDetection[] = [];
    
    for (const cluster of this.config.clusters) {
      for (const market of this.config.markets) {
        // In real implementation, you'd get actual queries from cluster data
        const queries = await this.getQueriesForCluster(cluster);
        
        for (const query of queries.slice(0, 3)) { // Monitor top 3 queries per cluster
          try {
            const changes = await this.detectChanges(cluster, market, query);
            if (changes && changes.changes.length > 0) {
              allChanges.push(changes);
            }
          } catch (error) {
            logger.error(`Error monitoring ${cluster}/${market}/${query}: ${error}`);
          }
        }
      }
    }

    return allChanges;
  }

  /**
   * Generate alerts for significant changes
   */
  generateAlerts(changes: ChangeDetection[]): Array<{
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
    cluster: string;
    market: string;
    actions: string[];
  }> {
    const alerts = [];
    
    for (const change of changes) {
      // Critical alerts
      if (change.impactScore >= 0.8) {
        alerts.push({
          severity: 'CRITICAL' as const,
          message: `Major SERP changes detected for ${change.query} in ${change.market}`,
          cluster: change.cluster,
          market: change.market,
          actions: change.recommendedActions
            .filter(a => a.priority === 'URGENT')
            .map(a => a.action)
        });
      }
      
      // High priority alerts for AI Overview appearances
      const aiOverviewAdded = change.changes.find(
        c => c.type === ChangeType.FEATURE_ADDED && c.feature === SerpFeature.AI_OVERVIEW
      );
      
      if (aiOverviewAdded) {
        alerts.push({
          severity: 'HIGH' as const,
          message: `AI Overview appeared for "${change.query}" - content strategy update needed`,
          cluster: change.cluster,
          market: change.market,
          actions: [
            'Review content for AI Overview extraction',
            'Update FAQ sections',
            'Monitor organic CTR changes'
          ]
        });
      }

      // Shopping pack changes
      const shoppingChanges = change.changes.find(
        c => c.feature === SerpFeature.SHOPPING_PACK
      );
      
      if (shoppingChanges) {
        alerts.push({
          severity: 'MEDIUM' as const,
          message: `Shopping pack changes for "${change.query}" - consider Shopping campaigns`,
          cluster: change.cluster,
          market: change.market,
          actions: [
            'Evaluate Shopping campaign opportunity',
            'Review product listings',
            'Check competitor presence'
          ]
        });
      }
    }

    return alerts;
  }

  /**
   * Generate comprehensive drift report
   */
  generateDriftReport(
    changes: ChangeDetection[],
    period: string = '24 hours'
  ): string {
    const report = [
      `## SERP Drift Analysis Report - ${period}`,
      `Generated: ${new Date().toISOString().split('T')[0]}`,
      '',
      `### Executive Summary`,
      `- **Clusters Monitored**: ${this.config.clusters.length}`,
      `- **Markets**: ${this.config.markets.join(', ')}`,
      `- **Changes Detected**: ${changes.length}`,
      `- **High Impact Changes**: ${changes.filter(c => c.impactScore >= 0.6).length}`,
      `- **Volatility Alerts**: ${changes.filter(c => c.volatilityIncrease >= this.config.volatilityThreshold).length}`,
      '',
    ];

    // Group changes by impact level
    const highImpact = changes.filter(c => c.impactScore >= 0.6);
    const mediumImpact = changes.filter(c => c.impactScore >= 0.3 && c.impactScore < 0.6);
    
    if (highImpact.length > 0) {
      report.push('### 🚨 High Impact Changes (Action Required)');
      report.push('');
      
      for (const change of highImpact) {
        report.push(`#### "${change.query}" - ${change.market} Market`);
        report.push(`**Impact Score**: ${(change.impactScore * 100).toFixed(0)}%`);
        report.push(`**Volatility Change**: ${change.volatilityIncrease >= 0 ? '+' : ''}${(change.volatilityIncrease * 100).toFixed(1)}%`);
        report.push('');
        
        report.push('**Changes Detected**:');
        for (const c of change.changes) {
          const impact = c.impact === 'HIGH' ? '🔴' : c.impact === 'MEDIUM' ? '🟡' : '🟢';
          report.push(`- ${impact} ${c.details}`);
        }
        report.push('');
        
        const urgentActions = change.recommendedActions.filter(a => a.priority === 'URGENT' || a.priority === 'HIGH');
        if (urgentActions.length > 0) {
          report.push('**Immediate Actions**:');
          for (const action of urgentActions) {
            report.push(`1. **${action.action}** (${action.timeline})`);
            report.push(`   - Expected Impact: ${action.estimatedImpact}`);
            if (action.implementation.length > 0) {
              report.push(`   - Steps: ${action.implementation.join(', ')}`);
            }
          }
          report.push('');
        }
      }
    }

    if (mediumImpact.length > 0) {
      report.push('### ⚠️ Medium Impact Changes (Monitor Closely)');
      report.push('');
      
      for (const change of mediumImpact.slice(0, 5)) {
        report.push(`- **"${change.query}"** (${change.market}): ${change.changes.length} changes detected`);
        const mainChange = change.changes[0];
        report.push(`  - Primary: ${mainChange.details}`);
        const topAction = change.recommendedActions[0];
        if (topAction) {
          report.push(`  - Action: ${topAction.action}`);
        }
      }
      report.push('');
    }

    // Feature trend analysis
    report.push('### 📊 SERP Feature Trends');
    report.push('');
    
    const featureChanges = new Map<SerpFeature, number>();
    for (const change of changes) {
      for (const c of change.changes) {
        if (c.feature && c.type === ChangeType.FEATURE_ADDED) {
          featureChanges.set(c.feature, (featureChanges.get(c.feature) || 0) + 1);
        }
      }
    }

    if (featureChanges.size > 0) {
      report.push('**Features Gaining Presence**:');
      const sortedFeatures = Array.from(featureChanges.entries())
        .sort(([,a], [,b]) => b - a);
      
      for (const [feature, count] of sortedFeatures) {
        report.push(`- ${feature.replace(/_/g, ' ').toUpperCase()}: appeared in ${count} queries`);
      }
      report.push('');
    }

    // Recommendations summary
    report.push('### 🎯 Strategic Recommendations');
    report.push('');
    
    const allActions = changes.flatMap(c => c.recommendedActions);
    const actionTypes = new Map<string, number>();
    
    for (const action of allActions) {
      const type = action.action.split(' ')[0]; // First word
      actionTypes.set(type, (actionTypes.get(type) || 0) + 1);
    }

    report.push('**Priority Actions This Week**:');
    let priority = 1;
    for (const [actionType, count] of Array.from(actionTypes.entries()).sort(([,a], [,b]) => b - a).slice(0, 5)) {
      report.push(`${priority}. ${actionType} strategies (${count} opportunities)`);
      priority++;
    }
    report.push('');

    report.push('### 📅 Monitoring Schedule');
    report.push('- **Next Check**: 24 hours');
    report.push('- **Deep Analysis**: Weekly');
    report.push('- **Volatility Threshold**: ' + (this.config.volatilityThreshold * 100).toFixed(0) + '%');
    report.push('');

    return report.join('\n');
  }

  /**
   * Extract SERP features from raw SERP data
   */
  private extractSerpFeatures(serpData: any): Record<string, boolean> {
    const features: Record<string, boolean> = {};
    
    // This would be implemented based on your SERP data source
    // For now, simulate feature detection
    features[SerpFeature.AI_OVERVIEW] = serpData.aiOverview || false;
    features[SerpFeature.FEATURED_SNIPPET] = serpData.featuredSnippet || false;
    features[SerpFeature.PEOPLE_ALSO_ASK] = serpData.peopleAlsoAsk || false;
    features[SerpFeature.LOCAL_PACK] = serpData.localPack || false;
    features[SerpFeature.SHOPPING_PACK] = serpData.shoppingPack || false;
    features[SerpFeature.IMAGE_PACK] = serpData.imagePack || false;
    features[SerpFeature.VIDEO_CAROUSEL] = serpData.videoCarousel || false;
    features[SerpFeature.KNOWLEDGE_PANEL] = serpData.knowledgePanel || false;
    features[SerpFeature.TOP_ADS] = (serpData.topAds || 0) > 0;
    features[SerpFeature.BOTTOM_ADS] = (serpData.bottomAds || 0) > 0;
    
    return features;
  }

  /**
   * Extract top results from SERP data
   */
  private extractTopResults(serpData: any): Array<{
    position: number;
    domain: string;
    url: string;
    title: string;
    snippet?: string;
    type: 'organic' | 'ad' | 'shopping' | 'local';
  }> {
    const results = [];
    
    // Extract from organic results (simulated structure)
    if (serpData.organic) {
      for (let i = 0; i < Math.min(10, serpData.organic.length); i++) {
        const result = serpData.organic[i];
        results.push({
          position: i + 1,
          domain: this.extractDomain(result.url || ''),
          url: result.url || '',
          title: result.title || '',
          snippet: result.snippet,
          type: 'organic' as const
        });
      }
    }
    
    return results;
  }

  /**
   * Calculate volatility score based on recent changes
   */
  private async calculateVolatility(
    cluster: string,
    market: string,
    query: string,
    currentFeatures: Record<string, boolean>
  ): Promise<number> {
    const recentSnapshots = await this.getRecentSnapshots(cluster, market, query, 5);
    
    if (recentSnapshots.length < 2) {
      return 0; // No history to compare
    }

    let totalChanges = 0;
    let comparisons = 0;

    for (let i = 0; i < recentSnapshots.length - 1; i++) {
      const current = recentSnapshots[i];
      const previous = recentSnapshots[i + 1];
      
      // Count feature differences
      const features1 = Object.entries(current.features);
      const features2 = Object.entries(previous.features);
      
      for (const [feature, present] of features1) {
        if (previous.features[feature] !== present) {
          totalChanges++;
        }
      }
      
      // Count position changes
      for (let pos = 0; pos < Math.min(5, current.topResults.length); pos++) {
        const domain1 = current.topResults[pos]?.domain;
        const domain2 = previous.topResults[pos]?.domain;
        if (domain1 && domain2 && domain1 !== domain2) {
          totalChanges++;
        }
      }
      
      comparisons++;
    }

    // Normalize to 0-1 scale
    const maxPossibleChanges = comparisons * (Object.keys(SerpFeature).length + 5);
    return Math.min(1, totalChanges / maxPossibleChanges);
  }

  /**
   * Detect feature changes between snapshots
   */
  private detectFeatureChanges(
    previousFeatures: Record<string, boolean>,
    currentFeatures: Record<string, boolean>
  ): Change[] {
    const changes: Change[] = [];
    
    for (const [feature, isPresent] of Object.entries(currentFeatures)) {
      const wasPresent = previousFeatures[feature] || false;
      
      if (!wasPresent && isPresent) {
        changes.push({
          type: ChangeType.FEATURE_ADDED,
          feature: feature as SerpFeature,
          details: `${feature.replace(/_/g, ' ')} appeared in SERP`,
          impact: this.getFeatureImpact(feature as SerpFeature, 'added'),
          before: false,
          after: true
        });
      } else if (wasPresent && !isPresent) {
        changes.push({
          type: ChangeType.FEATURE_REMOVED,
          feature: feature as SerpFeature,
          details: `${feature.replace(/_/g, ' ')} disappeared from SERP`,
          impact: this.getFeatureImpact(feature as SerpFeature, 'removed'),
          before: true,
          after: false
        });
      }
    }
    
    return changes;
  }

  /**
   * Detect position changes in top results
   */
  private detectPositionChanges(
    previousResults: any[],
    currentResults: any[]
  ): Change[] {
    const changes: Change[] = [];
    
    for (let pos = 0; pos < Math.min(5, currentResults.length); pos++) {
      const currentDomain = currentResults[pos]?.domain;
      const previousDomain = previousResults[pos]?.domain;
      
      if (currentDomain && previousDomain && currentDomain !== previousDomain) {
        changes.push({
          type: ChangeType.POSITION_CHANGE,
          details: `Position ${pos + 1}: ${previousDomain} → ${currentDomain}`,
          impact: pos < 3 ? 'HIGH' : 'MEDIUM',
          before: previousDomain,
          after: currentDomain
        });
      }
    }
    
    return changes;
  }

  /**
   * Detect domain changes (new entrants, dropouts)
   */
  private detectDomainChanges(
    previousResults: any[],
    currentResults: any[]
  ): Change[] {
    const changes: Change[] = [];
    
    const previousDomains = new Set(previousResults.slice(0, 10).map(r => r.domain));
    const currentDomains = new Set(currentResults.slice(0, 10).map(r => r.domain));
    
    // New domains in top 10
    for (const domain of currentDomains) {
      if (!previousDomains.has(domain)) {
        changes.push({
          type: ChangeType.DOMAIN_CHANGE,
          details: `New competitor entered top 10: ${domain}`,
          impact: 'MEDIUM',
          after: domain
        });
      }
    }
    
    // Domains dropped from top 10
    for (const domain of previousDomains) {
      if (!currentDomains.has(domain)) {
        changes.push({
          type: ChangeType.DOMAIN_CHANGE,
          details: `Competitor dropped from top 10: ${domain}`,
          impact: 'LOW',
          before: domain
        });
      }
    }
    
    return changes;
  }

  /**
   * Calculate overall impact score
   */
  private calculateImpactScore(changes: Change[]): number {
    let totalImpact = 0;
    
    for (const change of changes) {
      const weight = this.config.changeImpactWeights[change.type] || 0.3;
      let impact = 0;
      
      switch (change.impact) {
        case 'HIGH':
          impact = 1.0;
          break;
        case 'MEDIUM':
          impact = 0.6;
          break;
        case 'LOW':
          impact = 0.3;
          break;
      }
      
      totalImpact += weight * impact;
    }
    
    return Math.min(1, totalImpact / changes.length);
  }

  /**
   * Generate recommended actions based on changes
   */
  private generateRecommendedActions(
    changes: Change[],
    impactScore: number
  ): RecommendedAction[] {
    const actions: RecommendedAction[] = [];
    
    for (const change of changes) {
      if (change.feature === SerpFeature.AI_OVERVIEW && change.type === ChangeType.FEATURE_ADDED) {
        actions.push({
          action: 'Optimize content for AI Overview extraction',
          priority: 'HIGH',
          timeline: 'Within 1 week',
          estimatedImpact: '15-25% organic CTR change',
          implementation: [
            'Add structured FAQ section',
            'Use clear headings and bullet points',
            'Include concise, direct answers',
            'Monitor featured snippet opportunities'
          ]
        });
      }
      
      if (change.feature === SerpFeature.SHOPPING_PACK && change.type === ChangeType.FEATURE_ADDED) {
        actions.push({
          action: 'Evaluate Shopping campaign opportunity',
          priority: 'MEDIUM',
          timeline: 'Within 2 weeks',
          estimatedImpact: '10-20% additional traffic',
          implementation: [
            'Review product catalog setup',
            'Check Google Merchant Center compliance',
            'Create Shopping campaign',
            'Monitor competitor presence'
          ]
        });
      }
      
      if (change.type === ChangeType.POSITION_CHANGE && change.impact === 'HIGH') {
        actions.push({
          action: 'Investigate ranking volatility',
          priority: 'HIGH',
          timeline: 'Immediate',
          estimatedImpact: 'Prevent further ranking loss',
          implementation: [
            'Check for technical issues',
            'Review content freshness',
            'Analyze competitor content',
            'Consider bid adjustments'
          ]
        });
      }
    }
    
    // Generic high-impact action
    if (impactScore >= 0.7) {
      actions.push({
        action: 'Conduct comprehensive SERP analysis',
        priority: 'URGENT',
        timeline: 'Within 24 hours',
        estimatedImpact: 'Prevent significant traffic loss',
        implementation: [
          'Document all changes',
          'Contact stakeholders',
          'Adjust campaign strategies',
          'Monitor closely for 48 hours'
        ]
      });
    }
    
    return actions;
  }

  /**
   * Get impact level for specific features
   */
  private getFeatureImpact(feature: SerpFeature, action: 'added' | 'removed'): 'HIGH' | 'MEDIUM' | 'LOW' {
    const highImpactFeatures = [SerpFeature.AI_OVERVIEW, SerpFeature.FEATURED_SNIPPET];
    const mediumImpactFeatures = [SerpFeature.SHOPPING_PACK, SerpFeature.LOCAL_PACK, SerpFeature.TOP_ADS];
    
    if (highImpactFeatures.includes(feature)) {
      return 'HIGH';
    } else if (mediumImpactFeatures.includes(feature)) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url.split('/')[0] || '';
    }
  }

  /**
   * Save snapshot to storage
   */
  private async saveSnapshot(snapshot: SerpSnapshot): Promise<void> {
    const filename = `${snapshot.cluster}-${snapshot.market}-${snapshot.query.replace(/\s+/g, '_')}-${snapshot.timestamp.split('T')[0]}.json`;
    const filePath = path.join(this.snapshotDir, filename);
    
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  }

  /**
   * Get recent snapshots for a query
   */
  private async getRecentSnapshots(
    cluster: string,
    market: string,
    query: string,
    limit: number = 5
  ): Promise<SerpSnapshot[]> {
    const pattern = `${cluster}-${market}-${query.replace(/\s+/g, '_')}`;
    const files = fs.readdirSync(this.snapshotDir)
      .filter(f => f.startsWith(pattern))
      .sort()
      .reverse()
      .slice(0, limit);
    
    const snapshots: SerpSnapshot[] = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.snapshotDir, file), 'utf-8');
        const snapshot = JSON.parse(content);
        snapshots.push(SerpSnapshotSchema.parse(snapshot));
      } catch (error) {
        logger.warn(`Failed to parse snapshot ${file}: ${error}`);
      }
    }
    
    return snapshots;
  }

  /**
   * Get queries for a cluster (would integrate with existing clustering system)
   */
  private async getQueriesForCluster(cluster: string): Promise<string[]> {
    // This would integrate with your existing clustering system
    // For now, return mock queries based on cluster
    const clusterQueries: Record<string, string[]> = {
      'pdf-tools': ['pdf converter', 'convert pdf to word', 'compress pdf'],
      'image-tools': ['jpg to png converter', 'image converter', 'heic to jpg'],
      'document-tools': ['word to pdf', 'excel to pdf', 'ppt to pdf']
    };
    
    return clusterQueries[cluster] || [];
  }

  /**
   * Ensure snapshot directory exists
   */
  private ensureSnapshotDirectory(): void {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }
}

// Export helper function for CLI integration
export async function monitorSerpChanges(
  clusters: string[],
  markets: string[],
  outputDir: string
): Promise<ChangeDetection[]> {
  const monitor = new SerpWatchMonitor({
    clusters,
    markets,
    volatilityThreshold: 0.3
  });

  // Monitor all configured items
  const changes = await monitor.monitorAll();
  
  // Generate alerts
  const alerts = monitor.generateAlerts(changes);
  
  // Generate report
  const report = monitor.generateDriftReport(changes);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save report
  const reportPath = path.join(outputDir, 'serp_drift_analysis.md');
  fs.writeFileSync(reportPath, report);
  
  // Save alerts as JSON
  const alertsPath = path.join(outputDir, 'serp_alerts.json');
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2));
  
  logger.info(`SERP monitoring complete: ${changes.length} changes detected`);
  logger.info(`Report saved to ${reportPath}`);
  
  return changes;
}