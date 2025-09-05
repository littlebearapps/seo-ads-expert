/**
 * Quality Score Analyzer - v1.4
 * Analyzes and triages Quality Score issues with specific recommendations
 */

import { logger } from '../utils/logger.js';
import type { QualityScoreData } from '../connectors/google-ads-performance.js';
import type { URLHealthData } from '../health-checker.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface QSAnalysis {
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  avgQualityScore: number;
  totalKeywords: number;
  lowQSKeywords: number;
  issues: QSIssue[];
  recommendations: QSRecommendation[];
  priorityScore: number; // Higher = more urgent
}

export interface QSIssue {
  component: 'expectedCtr' | 'adRelevance' | 'landingPageExperience';
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedKeywords: string[];
  avgScore: number;
  impact: string;
}

export interface QSRecommendation {
  type: 'ad_copy' | 'landing_page' | 'keyword_relevance' | 'extensions';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  action: string;
  expectedImprovement: string;
  implementation: string;
}

export interface CategorizedIssues {
  adRelevance: AdRelevanceIssue[];
  landingPageExperience: LPExperienceIssue[];
  expectedCtr: ExpectedCTRIssue[];
}

export interface AdRelevanceIssue {
  keyword: string;
  currentScore: number;
  missingTerms: string[];
  recommendation: string;
}

export interface LPExperienceIssue {
  url: string;
  issues: string[];
  healthScore?: number;
  recommendation: string;
}

export interface ExpectedCTRIssue {
  keyword: string;
  currentCtr: number;
  benchmark: number;
  recommendation: string;
}

export class QualityScoreAnalyzer {
  private readonly qsThreshold = 7; // Keywords below this need attention
  private readonly criticalQsThreshold = 5; // Urgent attention needed

  /**
   * Analyze Quality Score data with landing page health
   */
  async analyzeQualityScore(
    qsData: QualityScoreData[],
    urlHealthPath?: string
  ): Promise<QSAnalysis[]> {
    // Load URL health data if available
    let urlHealth: URLHealthData[] = [];
    if (urlHealthPath) {
      try {
        const healthContent = await fs.readFile(urlHealthPath, 'utf-8');
        urlHealth = JSON.parse(healthContent);
      } catch (error) {
        logger.warn('Could not load URL health data', { error });
      }
    }

    // Group by ad group
    const adGroupMap = new Map<string, QualityScoreData[]>();
    for (const qs of qsData) {
      const key = `${qs.campaignId}_${qs.adGroupId}`;
      if (!adGroupMap.has(key)) {
        adGroupMap.set(key, []);
      }
      adGroupMap.get(key)!.push(qs);
    }

    // Analyze each ad group
    const analyses: QSAnalysis[] = [];
    for (const [key, keywords] of adGroupMap.entries()) {
      const analysis = this.analyzeAdGroup(keywords, urlHealth);
      analyses.push(analysis);
    }

    // Sort by priority score
    return analyses.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Analyze a single ad group
   */
  private analyzeAdGroup(
    keywords: QualityScoreData[],
    urlHealth: URLHealthData[]
  ): QSAnalysis {
    const firstKeyword = keywords[0];
    
    // Calculate metrics
    const avgQS = keywords.reduce((sum, k) => sum + k.qualityScore, 0) / keywords.length;
    const lowQSKeywords = keywords.filter(k => k.qualityScore < this.qsThreshold);
    
    // Identify issues
    const issues = this.identifyIssues(keywords);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, keywords, urlHealth);
    
    // Calculate priority score
    const priorityScore = this.calculatePriority(avgQS, lowQSKeywords.length, keywords.length);
    
    return {
      adGroupId: firstKeyword.adGroupId,
      adGroupName: firstKeyword.adGroupName,
      campaignId: firstKeyword.campaignId,
      campaignName: firstKeyword.campaignName,
      avgQualityScore: Math.round(avgQS * 10) / 10,
      totalKeywords: keywords.length,
      lowQSKeywords: lowQSKeywords.length,
      issues,
      recommendations,
      priorityScore
    };
  }

  /**
   * Identify Quality Score issues
   */
  private identifyIssues(keywords: QualityScoreData[]): QSIssue[] {
    const issues: QSIssue[] = [];
    
    // Check Expected CTR
    const lowCtrKeywords = keywords.filter(k => k.expectedCtr < 5);
    if (lowCtrKeywords.length > 0) {
      issues.push({
        component: 'expectedCtr',
        severity: this.getSeverity(lowCtrKeywords.length / keywords.length),
        affectedKeywords: lowCtrKeywords.map(k => k.keyword).slice(0, 10),
        avgScore: lowCtrKeywords.reduce((sum, k) => sum + k.expectedCtr, 0) / lowCtrKeywords.length,
        impact: `${lowCtrKeywords.length} keywords have below-average expected CTR`
      });
    }
    
    // Check Ad Relevance
    const lowRelevanceKeywords = keywords.filter(k => k.adRelevance < 5);
    if (lowRelevanceKeywords.length > 0) {
      issues.push({
        component: 'adRelevance',
        severity: this.getSeverity(lowRelevanceKeywords.length / keywords.length),
        affectedKeywords: lowRelevanceKeywords.map(k => k.keyword).slice(0, 10),
        avgScore: lowRelevanceKeywords.reduce((sum, k) => sum + k.adRelevance, 0) / lowRelevanceKeywords.length,
        impact: `${lowRelevanceKeywords.length} keywords have low ad relevance`
      });
    }
    
    // Check Landing Page Experience
    const lowLPKeywords = keywords.filter(k => k.landingPageExperience < 5);
    if (lowLPKeywords.length > 0) {
      issues.push({
        component: 'landingPageExperience',
        severity: this.getSeverity(lowLPKeywords.length / keywords.length),
        affectedKeywords: lowLPKeywords.map(k => k.keyword).slice(0, 10),
        avgScore: lowLPKeywords.reduce((sum, k) => sum + k.landingPageExperience, 0) / lowLPKeywords.length,
        impact: `${lowLPKeywords.length} keywords have poor landing page experience`
      });
    }
    
    return issues;
  }

  /**
   * Categorize issues by component
   */
  categorizeIssues(analysis: QSAnalysis): CategorizedIssues {
    const categorized: CategorizedIssues = {
      adRelevance: [],
      landingPageExperience: [],
      expectedCtr: []
    };
    
    for (const issue of analysis.issues) {
      switch (issue.component) {
        case 'adRelevance':
          for (const keyword of issue.affectedKeywords) {
            categorized.adRelevance.push({
              keyword,
              currentScore: issue.avgScore,
              missingTerms: this.identifyMissingTerms(keyword),
              recommendation: `Add "${keyword}" to headline and description`
            });
          }
          break;
          
        case 'landingPageExperience':
          // Group by likely landing page
          categorized.landingPageExperience.push({
            url: `/${analysis.adGroupName.toLowerCase().replace(/\s+/g, '-')}/`,
            issues: ['Check page speed', 'Verify mobile responsiveness', 'Add relevant content'],
            recommendation: 'Improve landing page quality and relevance'
          });
          break;
          
        case 'expectedCtr':
          for (const keyword of issue.affectedKeywords) {
            categorized.expectedCtr.push({
              keyword,
              currentCtr: 0, // Would need actual CTR data
              benchmark: 2.0, // Industry benchmark
              recommendation: 'Test new ad copy with stronger call-to-action'
            });
          }
          break;
      }
    }
    
    return categorized;
  }

  /**
   * Generate specific recommendations
   */
  generateRecommendations(
    issues: QSIssue[],
    keywords: QualityScoreData[],
    urlHealth: URLHealthData[]
  ): QSRecommendation[] {
    const recommendations: QSRecommendation[] = [];
    
    for (const issue of issues) {
      switch (issue.component) {
        case 'adRelevance':
          if (issue.avgScore < 5) {
            recommendations.push({
              type: 'ad_copy',
              priority: issue.severity === 'critical' ? 'urgent' : 'high',
              action: 'Update ad copy to include target keywords',
              expectedImprovement: '2-3 point QS increase',
              implementation: `Add primary keywords to headlines: ${issue.affectedKeywords.slice(0, 3).join(', ')}`
            });
          }
          break;
          
        case 'landingPageExperience':
          if (issue.avgScore < 5) {
            recommendations.push({
              type: 'landing_page',
              priority: 'urgent',
              action: 'Fix landing page issues',
              expectedImprovement: '2-4 point QS increase',
              implementation: 'Check for: noindex tags, 404 errors, slow load times, missing content'
            });
            
            // Add specific URL health issues if available
            const relevantHealth = this.findRelevantURLHealth(keywords[0].adGroupName, urlHealth);
            if (relevantHealth && relevantHealth.issues.length > 0) {
              recommendations.push({
                type: 'landing_page',
                priority: 'urgent',
                action: `Fix specific issues: ${relevantHealth.issues.join(', ')}`,
                expectedImprovement: 'Immediate QS improvement',
                implementation: `URL: ${relevantHealth.url}`
              });
            }
          }
          break;
          
        case 'expectedCtr':
          if (issue.avgScore < 5) {
            recommendations.push({
              type: 'ad_copy',
              priority: 'high',
              action: 'Test new ad variations with urgency and proof',
              expectedImprovement: '10-20% CTR increase',
              implementation: 'Add: numbers, benefits, "Chrome Extension" prominently'
            });
            
            recommendations.push({
              type: 'extensions',
              priority: 'medium',
              action: 'Add or optimize ad extensions',
              expectedImprovement: '5-10% CTR increase',
              implementation: 'Add sitelinks, callouts, structured snippets'
            });
          }
          break;
      }
    }
    
    return recommendations;
  }

  /**
   * Get severity level based on percentage affected
   */
  private getSeverity(percentageAffected: number): QSIssue['severity'] {
    if (percentageAffected >= 0.75) return 'critical';
    if (percentageAffected >= 0.5) return 'high';
    if (percentageAffected >= 0.25) return 'medium';
    return 'low';
  }

  /**
   * Calculate priority score for ad group
   */
  private calculatePriority(
    avgQS: number,
    lowQSCount: number,
    totalKeywords: number
  ): number {
    let score = 0;
    
    // Base score from average QS (inverse)
    score += (10 - avgQS) * 10;
    
    // Add points for percentage of low QS keywords
    score += (lowQSCount / totalKeywords) * 50;
    
    // Extra points if average is critical
    if (avgQS < this.criticalQsThreshold) {
      score += 30;
    }
    
    return Math.round(score);
  }

  /**
   * Identify missing terms in ad copy
   */
  private identifyMissingTerms(keyword: string): string[] {
    // This would connect to actual ad copy data
    // For now, return the keyword tokens as potentially missing
    return keyword.split(' ').filter(term => term.length > 3);
  }

  /**
   * Find relevant URL health data for ad group
   */
  private findRelevantURLHealth(
    adGroupName: string,
    urlHealth: URLHealthData[]
  ): URLHealthData | undefined {
    // Try to match based on ad group name patterns
    const normalized = adGroupName.toLowerCase().replace(/\s+/g, '-');
    return urlHealth.find(health => 
      health.url.toLowerCase().includes(normalized) ||
      normalized.includes(path.basename(health.url).replace(/\.[^.]+$/, ''))
    );
  }
}

// Type definition for URL health data
interface URLHealthData {
  url: string;
  status: number;
  issues: string[];
  recommendations: string[];
}