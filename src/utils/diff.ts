import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { KeywordData } from '../connectors/types.js';
import { writeJsonFile } from './deterministic.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PlanDiff {
  timestamp: string;
  product: string;
  comparison: {
    baseline_date: string;
    current_date: string;
    baseline_version?: string;
    current_version?: string;
  };
  summary: {
    total_changes: number;
    high_impact_changes: number;
    medium_impact_changes: number;
    low_impact_changes: number;
    change_categories: {
      keywords: number;
      ad_groups: number;
      content: number;
      serp_intelligence: number;
      assets: number;
    };
  };
  changes: {
    keywords: KeywordChange[];
    ad_groups: AdGroupChange[];
    content: ContentChange[];
    serp_intelligence: SerpChange[];
    assets: AssetChange[];
  };
  insights: {
    key_improvements: string[];
    potential_issues: string[];
    recommendations: string[];
  };
}

export interface KeywordChange {
  type: 'added' | 'removed' | 'score_changed' | 'volume_updated' | 'source_changed' | 'match_type_changed';
  keyword: string;
  cluster?: string | undefined;
  impact: 'high' | 'medium' | 'low';
  details: {
    old_value?: any | undefined;
    new_value?: any | undefined;
    change_magnitude?: number | undefined;
  };
  reason: string;
}

export interface AdGroupChange {
  type: 'new' | 'removed' | 'landing_page_changed' | 'headline_modified' | 'description_modified' | 'budget_adjusted' | 'keywords_changed';
  ad_group: string;
  impact: 'high' | 'medium' | 'low';
  details: {
    old_value?: any;
    new_value?: any;
    specific_changes?: string[];
  };
  reason: string;
}

export interface ContentChange {
  type: 'page_brief_new' | 'page_brief_updated' | 'page_brief_removed' | 'landing_page_mapping_changed';
  page_url: string;
  impact: 'high' | 'medium' | 'low';
  details: {
    old_content?: string;
    new_content?: string;
    change_summary?: string;
  };
  reason: string;
}

export interface SerpChange {
  type: 'blocker_appeared' | 'blocker_disappeared' | 'competitor_change' | 'serp_features_changed';
  keyword?: string;
  cluster?: string;
  impact: 'high' | 'medium' | 'low';
  details: {
    old_serp_features?: string[];
    new_serp_features?: string[];
    blockers?: string[];
    competitors?: string[];
  };
  reason: string;
}

export interface AssetChange {
  type: 'sitelinks_added' | 'sitelinks_removed' | 'callouts_modified' | 'structured_snippets_changed';
  ad_group?: string;
  impact: 'high' | 'medium' | 'low';
  details: {
    old_assets?: string[];
    new_assets?: string[];
    added?: string[];
    removed?: string[];
  };
  reason: string;
}

// ============================================================================
// CORE DIFFING ENGINE
// ============================================================================

export class SemanticPlanDiffer {
  
  /**
   * Compare two marketing plans and generate semantic diff
   */
  async generatePlanDiff(
    currentPlanDir: string,
    product: string,
    currentDate: string,
    workingDir?: string
  ): Promise<PlanDiff> {
    // Extract working directory from currentPlanDir if not provided
    const baseDir = workingDir || currentPlanDir.split('plans')[0];
    const baselinePlanDir = await this.findMostRecentBaseline(product, currentDate, baseDir);
    
    if (!baselinePlanDir) {
      // First run - create baseline message
      return this.createBaselineDiff(currentPlanDir, product, currentDate);
    }

    logger.info(`📊 Comparing current plan (${currentDate}) against baseline (${baselinePlanDir})`);
    
    // Load both plans
    const currentPlan = await this.loadPlanData(currentPlanDir);
    const baselinePlan = await this.loadPlanData(baselinePlanDir);
    
    // Generate comprehensive diff
    const diff: PlanDiff = {
      timestamp: new Date().toISOString(),
      product,
      comparison: {
        baseline_date: baselinePlanDir,
        current_date: currentDate,
        baseline_version: baselinePlan.version || 'v1.1',
        current_version: currentPlan.version || 'v1.1'
      },
      summary: {
        total_changes: 0,
        high_impact_changes: 0,
        medium_impact_changes: 0,
        low_impact_changes: 0,
        change_categories: {
          keywords: 0,
          ad_groups: 0,
          content: 0,
          serp_intelligence: 0,
          assets: 0
        }
      },
      changes: {
        keywords: [],
        ad_groups: [],
        content: [],
        serp_intelligence: [],
        assets: []
      },
      insights: {
        key_improvements: [],
        potential_issues: [],
        recommendations: []
      }
    };

    // Perform semantic comparisons
    diff.changes.keywords = this.compareKeywords(baselinePlan.keywords, currentPlan.keywords);
    diff.changes.ad_groups = this.compareAdGroups(baselinePlan.ads_data?.ad_groups || [], currentPlan.ads_data?.ad_groups || []);
    diff.changes.serp_intelligence = this.compareSerpData(baselinePlan.competitors || {}, currentPlan.competitors || {});
    diff.changes.assets = this.compareAssets(baselinePlan.ads_data, currentPlan.ads_data);
    
    // Calculate summary statistics
    this.calculateSummaryStats(diff);
    
    // Generate insights
    diff.insights = this.generateInsights(diff, baselinePlan, currentPlan);
    
    logger.info(`✅ Diff completed: ${diff.summary.total_changes} total changes (${diff.summary.high_impact_changes} high impact)`);
    
    return diff;
  }

  /**
   * Compare keywords between two plans
   */
  private compareKeywords(baseline: KeywordData[], current: KeywordData[]): KeywordChange[] {
    const changes: KeywordChange[] = [];
    
    // Handle missing arrays gracefully
    const baselineKeywords = baseline || [];
    const currentKeywords = current || [];
    
    const baselineMap = new Map(baselineKeywords.map(k => [k.keyword, k]));
    const currentMap = new Map(currentKeywords.map(k => [k.keyword, k]));

    // Find added keywords
    for (const [keyword, currentKw] of currentMap) {
      if (!baselineMap.has(keyword)) {
        changes.push({
          type: 'added',
          keyword,
          cluster: currentKw.cluster,
          impact: this.calculateKeywordImpact(currentKw),
          details: { new_value: currentKw.final_score },
          reason: `New keyword discovered with ${currentKw.final_score.toFixed(2)} score from ${currentKw.data_source} source`
        });
      }
    }

    // Find removed keywords
    for (const [keyword, baselineKw] of baselineMap) {
      if (!currentMap.has(keyword)) {
        changes.push({
          type: 'removed',
          keyword,
          cluster: baselineKw.cluster,
          impact: this.calculateKeywordImpact(baselineKw),
          details: { old_value: baselineKw.final_score },
          reason: `Keyword removed (was ${baselineKw.final_score.toFixed(2)} score)`
        });
      }
    }

    // Find changed keywords
    for (const [keyword, currentKw] of currentMap) {
      const baselineKw = baselineMap.get(keyword);
      if (baselineKw) {
        // Score changes
        const scoreDiff = Math.abs(currentKw.final_score - baselineKw.final_score);
        if (scoreDiff > 0.1) { // Significant score change threshold
          changes.push({
            type: 'score_changed',
            keyword,
            cluster: currentKw.cluster,
            impact: scoreDiff > 1.0 ? 'high' : scoreDiff > 0.5 ? 'medium' : 'low',
            details: {
              old_value: baselineKw.final_score,
              new_value: currentKw.final_score,
              change_magnitude: scoreDiff
            },
            reason: `Score ${currentKw.final_score > baselineKw.final_score ? 'increased' : 'decreased'} by ${scoreDiff.toFixed(2)} points`
          });
        }

        // Volume changes
        if (currentKw.volume && baselineKw.volume && currentKw.volume !== baselineKw.volume) {
          const volumeChange = ((currentKw.volume - baselineKw.volume) / baselineKw.volume) * 100;
          if (Math.abs(volumeChange) > 25) { // 25% change threshold (more conservative)
            changes.push({
              type: 'volume_updated',
              keyword,
              cluster: currentKw.cluster,
              impact: Math.abs(volumeChange) > 50 ? 'high' : Math.abs(volumeChange) > 25 ? 'medium' : 'low',
              details: {
                old_value: baselineKw.volume,
                new_value: currentKw.volume,
                change_magnitude: volumeChange
              },
              reason: `Search volume ${volumeChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(volumeChange).toFixed(1)}%`
            });
          }
        }

        // Data source changes
        if (currentKw.data_source !== baselineKw.data_source) {
          changes.push({
            type: 'source_changed',
            keyword,
            cluster: currentKw.cluster,
            impact: 'medium',
            details: {
              old_value: baselineKw.data_source,
              new_value: currentKw.data_source
            },
            reason: `Data source upgraded from ${baselineKw.data_source} to ${currentKw.data_source}`
          });
        }

        // Match type changes
        if (currentKw.recommended_match_type !== baselineKw.recommended_match_type) {
          changes.push({
            type: 'match_type_changed',
            keyword,
            cluster: currentKw.cluster,
            impact: 'low',
            details: {
              old_value: baselineKw.recommended_match_type,
              new_value: currentKw.recommended_match_type
            },
            reason: `Match type optimized from ${baselineKw.recommended_match_type} to ${currentKw.recommended_match_type}`
          });
        }
      }
    }

    return changes;
  }

  /**
   * Compare ad groups between two plans
   */
  private compareAdGroups(baseline: any[], current: any[]): AdGroupChange[] {
    const changes: AdGroupChange[] = [];
    const baselineMap = new Map(baseline.map(ag => [ag.name, ag]));
    const currentMap = new Map(current.map(ag => [ag.name, ag]));

    // Find new ad groups
    for (const [name, currentAg] of currentMap) {
      if (!baselineMap.has(name)) {
        changes.push({
          type: 'new',
          ad_group: name,
          impact: 'high',
          details: { new_value: currentAg },
          reason: `New ad group created with ${currentAg.keywords_exact?.length || 0} exact keywords and ${currentAg.headlines?.length || 0} headlines`
        });
      }
    }

    // Find removed ad groups
    for (const [name, baselineAg] of baselineMap) {
      if (!currentMap.has(name)) {
        changes.push({
          type: 'removed',
          ad_group: name,
          impact: 'high',
          details: { old_value: baselineAg },
          reason: `Ad group removed (had ${baselineAg.keywords_exact?.length || 0} exact keywords)`
        });
      }
    }

    // Find changed ad groups
    for (const [name, currentAg] of currentMap) {
      const baselineAg = baselineMap.get(name);
      if (baselineAg) {
        const specificChanges = [];

        // Landing page changes
        if (currentAg.landing_page !== baselineAg.landing_page) {
          changes.push({
            type: 'landing_page_changed',
            ad_group: name,
            impact: 'high',
            details: {
              old_value: baselineAg.landing_page,
              new_value: currentAg.landing_page
            },
            reason: `Landing page updated to improve user experience`
          });
        }

        // Headline changes
        if (JSON.stringify(currentAg.headlines) !== JSON.stringify(baselineAg.headlines)) {
          const oldHeadlines = baselineAg.headlines || [];
          const newHeadlines = currentAg.headlines || [];
          const added = newHeadlines.filter((h: string) => !oldHeadlines.includes(h));
          const removed = oldHeadlines.filter((h: string) => !newHeadlines.includes(h));
          
          if (added.length > 0 || removed.length > 0) {
            specificChanges.push(`${added.length} headlines added, ${removed.length} removed`);
            changes.push({
              type: 'headline_modified',
              ad_group: name,
              impact: added.length > 2 || removed.length > 2 ? 'medium' : 'low',
              details: {
                old_value: oldHeadlines,
                new_value: newHeadlines,
                specific_changes: [...added.map((h: string) => `+ ${h}`), ...removed.map((h: string) => `- ${h}`)]
              },
              reason: `Headlines optimized: ${added.length} added, ${removed.length} removed`
            });
          }
        }

        // Keywords changes
        const oldKeywordCount = (baselineAg.keywords_exact?.length || 0) + (baselineAg.keywords_phrase?.length || 0) + (baselineAg.keywords_broad?.length || 0);
        const newKeywordCount = (currentAg.keywords_exact?.length || 0) + (currentAg.keywords_phrase?.length || 0) + (currentAg.keywords_broad?.length || 0);
        
        if (oldKeywordCount !== newKeywordCount) {
          const keywordDiff = newKeywordCount - oldKeywordCount;
          changes.push({
            type: 'keywords_changed',
            ad_group: name,
            impact: Math.abs(keywordDiff) > 5 ? 'medium' : 'low',
            details: {
              old_value: oldKeywordCount,
              new_value: newKeywordCount
            },
            reason: `Keyword count ${keywordDiff > 0 ? 'increased' : 'decreased'} by ${Math.abs(keywordDiff)} keywords`
          });
        }
      }
    }

    return changes;
  }

  /**
   * Compare SERP data between two plans
   */
  private compareSerpData(baseline: any, current: any): SerpChange[] {
    const changes: SerpChange[] = [];
    
    // Compare competitor landscape changes
    const baselineCompetitors = new Set(Object.keys(baseline));
    const currentCompetitors = new Set(Object.keys(current));
    
    // New competitors appeared
    for (const competitor of currentCompetitors) {
      if (!baselineCompetitors.has(competitor)) {
        changes.push({
          type: 'competitor_change',
          impact: 'medium',
          details: {
            competitors: [competitor],
            new_serp_features: ['new_competitor']
          },
          reason: `New competitor "${competitor}" appeared in SERP results`
        });
      }
    }

    // Competitors disappeared
    for (const competitor of baselineCompetitors) {
      if (!currentCompetitors.has(competitor)) {
        changes.push({
          type: 'competitor_change',
          impact: 'low',
          details: {
            competitors: [competitor],
            old_serp_features: ['competitor_disappeared']
          },
          reason: `Competitor "${competitor}" no longer appearing in top SERP results`
        });
      }
    }

    return changes;
  }

  /**
   * Compare assets (sitelinks, callouts, etc.) between two plans
   */
  private compareAssets(baseline: any, current: any): AssetChange[] {
    const changes: AssetChange[] = [];
    
    if (!baseline || !current) return changes;

    // Compare callouts
    const baselineCallouts = baseline.callouts || [];
    const currentCallouts = current.callouts || [];
    
    if (JSON.stringify(baselineCallouts.sort()) !== JSON.stringify(currentCallouts.sort())) {
      const added = currentCallouts.filter((c: string) => !baselineCallouts.includes(c));
      const removed = baselineCallouts.filter((c: string) => !currentCallouts.includes(c));
      
      changes.push({
        type: 'callouts_modified',
        impact: 'low',
        details: {
          old_assets: baselineCallouts,
          new_assets: currentCallouts,
          added,
          removed
        },
        reason: `Callouts updated: ${added.length} added, ${removed.length} removed`
      });
    }

    // Compare structured snippets
    if (baseline.structured_snippets && current.structured_snippets) {
      const baselineSnippets = JSON.stringify(baseline.structured_snippets);
      const currentSnippets = JSON.stringify(current.structured_snippets);
      
      if (baselineSnippets !== currentSnippets) {
        changes.push({
          type: 'structured_snippets_changed',
          impact: 'low',
          details: {
            old_assets: baseline.structured_snippets,
            new_assets: current.structured_snippets
          },
          reason: 'Structured snippets updated to reflect current product features'
        });
      }
    }

    return changes;
  }

  /**
   * Calculate summary statistics for the diff
   */
  private calculateSummaryStats(diff: PlanDiff): void {
    const allChanges = [
      ...diff.changes.keywords,
      ...diff.changes.ad_groups,
      ...diff.changes.content,
      ...diff.changes.serp_intelligence,
      ...diff.changes.assets
    ];

    diff.summary.total_changes = allChanges.length;
    diff.summary.high_impact_changes = allChanges.filter(c => c.impact === 'high').length;
    diff.summary.medium_impact_changes = allChanges.filter(c => c.impact === 'medium').length;
    diff.summary.low_impact_changes = allChanges.filter(c => c.impact === 'low').length;

    diff.summary.change_categories.keywords = diff.changes.keywords.length;
    diff.summary.change_categories.ad_groups = diff.changes.ad_groups.length;
    diff.summary.change_categories.content = diff.changes.content.length;
    diff.summary.change_categories.serp_intelligence = diff.changes.serp_intelligence.length;
    diff.summary.change_categories.assets = diff.changes.assets.length;
  }

  /**
   * Generate actionable insights from the diff
   */
  private generateInsights(diff: PlanDiff, baseline: any, current: any): { key_improvements: string[], potential_issues: string[], recommendations: string[] } {
    const insights = {
      key_improvements: [],
      potential_issues: [],
      recommendations: []
    };

    // Key improvements
    const newKeywords = diff.changes.keywords.filter(c => c.type === 'added');
    if (newKeywords.length > 0) {
      insights.key_improvements.push(`Discovered ${newKeywords.length} new keyword opportunities`);
    }

    const scoreImprovements = diff.changes.keywords.filter(c => c.type === 'score_changed' && c.details.new_value > c.details.old_value);
    if (scoreImprovements.length > 0) {
      insights.key_improvements.push(`${scoreImprovements.length} keywords improved in quality score`);
    }

    const newAdGroups = diff.changes.ad_groups.filter(c => c.type === 'new');
    if (newAdGroups.length > 0) {
      insights.key_improvements.push(`Created ${newAdGroups.length} new targeted ad groups`);
    }

    // Potential issues
    const removedKeywords = diff.changes.keywords.filter(c => c.type === 'removed');
    if (removedKeywords.length > 2) {
      insights.potential_issues.push(`${removedKeywords.length} keywords were removed - verify this is intentional`);
    }

    const scoreDeclines = diff.changes.keywords.filter(c => c.type === 'score_changed' && c.details.new_value < c.details.old_value);
    if (scoreDeclines.length > 0) {
      insights.potential_issues.push(`${scoreDeclines.length} keywords declined in quality score`);
    }

    const removedAdGroups = diff.changes.ad_groups.filter(c => c.type === 'removed');
    if (removedAdGroups.length > 0) {
      insights.potential_issues.push(`${removedAdGroups.length} ad groups removed - ensure coverage is maintained`);
    }

    // Recommendations
    if (diff.summary.high_impact_changes > 0) {
      insights.recommendations.push('Review high-impact changes carefully before deployment');
    }

    if (newKeywords.length > 1) {
      insights.recommendations.push('Consider phased rollout for new keywords to manage budget impact');
    }

    if (diff.changes.serp_intelligence.length > 0) {
      insights.recommendations.push('SERP landscape changed - verify targeting strategy remains optimal');
    }

    if (insights.key_improvements.length === 0 && insights.potential_issues.length === 0) {
      insights.key_improvements.push('Plan remains stable with minor optimizations');
    }

    return insights;
  }

  /**
   * Calculate keyword impact level
   */
  private calculateKeywordImpact(keyword: KeywordData): 'high' | 'medium' | 'low' {
    if (keyword.final_score >= 8.5 || (keyword.volume && keyword.volume > 2000)) {
      return 'high';
    } else if (keyword.final_score >= 7.0 || (keyword.volume && keyword.volume > 800)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Find the most recent baseline plan for comparison
   */
  private async findMostRecentBaseline(product: string, currentDate: string, workingDir?: string): Promise<string | null> {
    const baseDir = workingDir || process.cwd();
    const plansDir = join(baseDir, 'plans', product);
    
    if (!existsSync(plansDir)) {
      return null;
    }

    try {
      const fs = await import('fs');
      const planDates = fs.readdirSync(plansDir)
        .filter(dir => /^\d{4}-\d{2}-\d{2}$/.test(dir))
        .filter(dir => dir !== currentDate)
        .sort()
        .reverse(); // Most recent first

      return planDates.length > 0 ? join(plansDir, planDates[0]) : null;
    } catch (error) {
      logger.debug('Error finding baseline:', error);
      return null;
    }
  }

  /**
   * Load plan data from a directory
   */
  private async loadPlanData(planDir: string): Promise<any> {
    const planData: any = { version: 'v1.1' };

    // Load summary.json
    const summaryPath = join(planDir, 'summary.json');
    if (existsSync(summaryPath)) {
      try {
        const summaryContent = readFileSync(summaryPath, 'utf8');
        const summary = JSON.parse(summaryContent);
        planData.summary = summary;
        planData.version = summary.version || 'v1.1';
      } catch (error) {
        logger.debug('Error loading summary:', error);
      }
    }

    // Load keywords.csv data (parse first few lines for data shape)
    const keywordsPath = join(planDir, 'keywords.csv');
    if (existsSync(keywordsPath)) {
      planData.keywords = this.parseKeywordsCsvSample(keywordsPath);
    }

    // Load ads.json
    const adsPath = join(planDir, 'ads.json');
    if (existsSync(adsPath)) {
      try {
        const adsContent = readFileSync(adsPath, 'utf8');
        planData.ads_data = JSON.parse(adsContent);
      } catch (error) {
        logger.debug('Error loading ads.json:', error);
      }
    }

    // Load competitors.md (extract competitor count)
    const competitorsPath = join(planDir, 'competitors.md');
    if (existsSync(competitorsPath)) {
      try {
        const competitorsContent = readFileSync(competitorsPath, 'utf8');
        planData.competitors = this.extractCompetitorsFromMarkdown(competitorsContent);
      } catch (error) {
        logger.debug('Error loading competitors:', error);
      }
    }

    return planData;
  }

  /**
   * Parse a sample of keywords.csv to understand data structure
   */
  private parseKeywordsCsvSample(csvPath: string): KeywordData[] {
    try {
      const content = readFileSync(csvPath, 'utf8');
      const lines = content.split('\n').slice(0, 20); // Sample first 20 lines
      
      if (lines.length < 2) return [];
      
      const headers = lines[0].split(',').map(h => h.trim());
      const keywords: KeywordData[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length >= headers.length) {
          const keyword: any = {};
          headers.forEach((header, index) => {
            const value = values[index]?.trim().replace(/"/g, '');
            if (header === 'keyword') keyword.keyword = value;
            else if (header === 'final_score') keyword.final_score = parseFloat(value) || 0;
            else if (header === 'volume') keyword.volume = parseInt(value) || 0;
            else if (header === 'data_source') keyword.data_source = value;
            else if (header === 'cluster') keyword.cluster = value;
            else if (header === 'recommended_match_type') keyword.recommended_match_type = value;
          });
          if (keyword.keyword) {
            keywords.push(keyword as KeywordData);
          }
        }
      }
      
      return keywords;
    } catch (error) {
      logger.debug('Error parsing keywords CSV:', error);
      return [];
    }
  }

  /**
   * Extract competitor information from markdown
   */
  private extractCompetitorsFromMarkdown(content: string): { [key: string]: number } {
    const competitors: { [key: string]: number } = {};
    
    // Look for competitor mentions in markdown format
    const competitorMatches = content.match(/\*\*([^*]+)\*\*.*?(\d+)/g);
    if (competitorMatches) {
      for (const match of competitorMatches) {
        const nameMatch = match.match(/\*\*([^*]+)\*\*/);
        const countMatch = match.match(/(\d+)/);
        if (nameMatch && countMatch) {
          competitors[nameMatch[1].trim()] = parseInt(countMatch[1]);
        }
      }
    }
    
    return competitors;
  }

  /**
   * Create a "first run" baseline diff
   */
  private createBaselineDiff(currentPlanDir: string, product: string, currentDate: string): PlanDiff {
    return {
      timestamp: new Date().toISOString(),
      product,
      comparison: {
        baseline_date: 'none',
        current_date: currentDate,
        current_version: 'v1.1'
      },
      summary: {
        total_changes: 0,
        high_impact_changes: 0,
        medium_impact_changes: 0,
        low_impact_changes: 0,
        change_categories: {
          keywords: 0,
          ad_groups: 0,
          content: 0,
          serp_intelligence: 0,
          assets: 0
        }
      },
      changes: {
        keywords: [],
        ad_groups: [],
        content: [],
        serp_intelligence: [],
        assets: []
      },
      insights: {
        key_improvements: ['Baseline marketing plan created'],
        potential_issues: [],
        recommendations: ['Run plan generation again after data changes to see evolution tracking']
      }
    };
  }

  /**
   * Generate console-friendly diff summary
   */
  generateConsoleDiff(diff: PlanDiff): string {
    const output = [];
    
    output.push(`\n📊 Plan Evolution Summary (${diff.comparison.baseline_date} → ${diff.comparison.current_date})`);
    output.push('='.repeat(60));
    
    if (diff.comparison.baseline_date === 'none') {
      output.push('🆕 First run - baseline created');
      output.push('💡 Run again after data changes to see evolution tracking');
      return output.join('\n');
    }
    
    output.push(`📈 Total Changes: ${diff.summary.total_changes}`);
    output.push(`   🔴 High Impact: ${diff.summary.high_impact_changes}`);
    output.push(`   🟡 Medium Impact: ${diff.summary.medium_impact_changes}`);
    output.push(`   🟢 Low Impact: ${diff.summary.low_impact_changes}`);
    
    if (diff.summary.change_categories.keywords > 0) {
      output.push(`\n🔤 Keywords: ${diff.summary.change_categories.keywords} changes`);
      const topKeywordChanges = diff.changes.keywords.slice(0, 3);
      for (const change of topKeywordChanges) {
        const icon = change.impact === 'high' ? '🔴' : change.impact === 'medium' ? '🟡' : '🟢';
        output.push(`   ${icon} ${change.type}: ${change.keyword} - ${change.reason}`);
      }
    }
    
    if (diff.summary.change_categories.ad_groups > 0) {
      output.push(`\n📂 Ad Groups: ${diff.summary.change_categories.ad_groups} changes`);
      const topAdGroupChanges = diff.changes.ad_groups.slice(0, 3);
      for (const change of topAdGroupChanges) {
        const icon = change.impact === 'high' ? '🔴' : change.impact === 'medium' ? '🟡' : '🟢';
        output.push(`   ${icon} ${change.type}: ${change.ad_group} - ${change.reason}`);
      }
    }
    
    if (diff.insights.key_improvements.length > 0) {
      output.push(`\n✅ Key Improvements:`);
      for (const improvement of diff.insights.key_improvements.slice(0, 3)) {
        output.push(`   • ${improvement}`);
      }
    }
    
    if (diff.insights.potential_issues.length > 0) {
      output.push(`\n⚠️  Potential Issues:`);
      for (const issue of diff.insights.potential_issues.slice(0, 3)) {
        output.push(`   • ${issue}`);
      }
    }
    
    if (diff.insights.recommendations.length > 0) {
      output.push(`\n💡 Recommendations:`);
      for (const rec of diff.insights.recommendations.slice(0, 3)) {
        output.push(`   • ${rec}`);
      }
    }
    
    return output.join('\n');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate and save plan diff
 */
export async function generatePlanDiff(
  planPath: string,
  product: string,
  date: string,
  workingDir?: string
): Promise<string> {
  const differ = new SemanticPlanDiffer();
  const diff = await differ.generatePlanDiff(planPath, product, date, workingDir);
  
  // Save diff.json
  const diffPath = join(planPath, 'diff.json');
  writeJsonFile(diffPath, diff);
  
  logger.info(`✅ Plan diff saved to ${diffPath}`);
  
  // Return console diff for immediate display
  return differ.generateConsoleDiff(diff);
}

/**
 * Show diff summary in console
 */
export function showDiffSummary(diff: PlanDiff): void {
  const differ = new SemanticPlanDiffer();
  console.log(differ.generateConsoleDiff(diff));
}