import { z } from 'zod';
import { addDays, addWeeks, format, startOfWeek, endOfWeek, getWeek, getYear, differenceInDays } from 'date-fns';
import type { StrategicIntelligence, OpportunityItem } from '../analyzers/strategic-orchestrator.js';

export const ContentCalendarEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  week: z.number(),
  title: z.string(),
  cluster: z.string(),
  contentType: z.enum(['guide', 'comparison', 'tutorial', 'news', 'product-update', 'case-study']),
  targetKeywords: z.array(z.string()),
  priority: z.enum(['high', 'medium', 'low']),
  estimatedWords: z.number(),
  brief: z.string(),
  opportunityScore: z.number(),
  seasonalFactor: z.number(),
  resourceRequirement: z.enum(['light', 'medium', 'heavy']),
  dependencies: z.array(z.string()).optional(),
  internalLinkTargets: z.array(z.string()).optional()
});

export const ContentCalendarSchema = z.object({
  metadata: z.object({
    generatedAt: z.string(),
    period: z.object({
      start: z.string(),
      end: z.string(),
      weeks: z.number()
    }),
    totalPieces: z.number(),
    averageScore: z.number(),
    resourceDistribution: z.object({
      light: z.number(),
      medium: z.number(),
      heavy: z.number()
    })
  }),
  calendar: z.array(ContentCalendarEntrySchema),
  weeklyBreakdown: z.array(z.object({
    week: z.number(),
    startDate: z.string(),
    endDate: z.string(),
    pieces: z.number(),
    averageScore: z.number(),
    theme: z.string(),
    focus: z.array(z.string())
  }))
});

export type ContentCalendarEntry = z.infer<typeof ContentCalendarEntrySchema>;
export type ContentCalendar = z.infer<typeof ContentCalendarSchema>;

export interface ContentCalendarConfig {
  startDate: Date;
  weeks: number;
  piecesPerWeek: number;
  maxHeavyPieces: number;
  priorityThreshold: number;
  seasonalBoost: number;
  resourceConstraints: {
    light: number;    // pieces per week
    medium: number;   // pieces per week  
    heavy: number;    // pieces per week
  };
}

export class ContentCalendarGenerator {
  private config: ContentCalendarConfig;

  constructor(config: Partial<ContentCalendarConfig> = {}) {
    this.config = {
      startDate: config.startDate || new Date(),
      weeks: config.weeks || 12, // Q1 default
      piecesPerWeek: config.piecesPerWeek || 3,
      maxHeavyPieces: config.maxHeavyPieces || 1,
      priorityThreshold: config.priorityThreshold || 7.0,
      seasonalBoost: config.seasonalBoost || 1.2,
      resourceConstraints: config.resourceConstraints || {
        light: 2,
        medium: 2,
        heavy: 1
      }
    };
  }

  async generateCalendar(intelligence: StrategicIntelligence): Promise<ContentCalendar> {
    // Sort opportunities by strategic value
    const rankedOpportunities = this.rankOpportunitiesForContent(intelligence);

    // Generate content schedule
    const calendar = await this.createContentSchedule(rankedOpportunities);

    // Create weekly breakdown
    const weeklyBreakdown = this.generateWeeklyBreakdown(calendar);

    // Calculate metadata
    const metadata = this.calculateMetadata(calendar);

    return {
      metadata,
      calendar,
      weeklyBreakdown
    };
  }

  private rankOpportunitiesForContent(intelligence: StrategicIntelligence): any[] {
    // Defensive programming: Extract opportunities from priority matrix
    let allOpportunities: any[] = [];

    try {
      if (intelligence.priority_matrix) {
        allOpportunities = [
          ...(intelligence.priority_matrix.immediate_actions || []),
          ...(intelligence.priority_matrix.quarter_1_roadmap || []),
          ...(intelligence.priority_matrix.quarter_2_roadmap || []),
          ...(intelligence.priority_matrix.long_term_strategic || [])
        ];
      }

      // Fallback: if no opportunities found, return empty array
      if (allOpportunities.length === 0) {
        console.warn('⚠️ No opportunities found in strategic intelligence');
        return [];
      }

      return allOpportunities
        .filter(opp => {
          // Defensive check: ensure opp exists and has required properties
          return opp && opp.source_type && opp.source_type !== 'defensive_play';
        })
        .sort((a, b) => {
          // Multi-factor content ranking
          const aScore = this.calculateContentScore(a);
          const bScore = this.calculateContentScore(b);
          return bScore - aScore;
        })
        .slice(0, this.config.weeks * this.config.piecesPerWeek); // Take only what we can produce
    } catch (error) {
      console.warn('⚠️ Error ranking opportunities for content:', error);
      return [];
    }
  }

  private calculateContentScore(opportunity: any): number {
    // Defensive programming: provide defaults for missing properties
    let score = opportunity.impact_potential || 0;

    const query = opportunity.query || '';

    // Content-specific factors with null checks
    score *= this.getContentMultiplier(query);
    score *= this.getSeasonalMultiplier(query);
    score *= this.getCompetitiveMultiplier(opportunity);

    return score;
  }

  private getContentMultiplier(query: string): number {
    // Boost content-friendly keywords
    const contentFriendly = [
      'guide', 'how to', 'tutorial', 'vs', 'comparison', 'best', 'free',
      'tips', 'examples', 'ultimate', 'complete', 'beginner'
    ];
    
    const isContentFriendly = contentFriendly.some(term => 
      query.toLowerCase().includes(term)
    );
    
    return isContentFriendly ? 1.3 : 1.0;
  }

  private getSeasonalMultiplier(query: string): number {
    const currentMonth = new Date().getMonth();
    
    // Seasonal content patterns
    const seasonalBoosts: Record<string, number[]> = {
      'back to school': [7, 8], // Aug, Sep
      'holiday': [10, 11], // Nov, Dec
      'new year': [11, 0, 1], // Dec, Jan, Feb
      'summer': [4, 5, 6], // May, Jun, Jul
      'tax': [1, 2, 3] // Feb, Mar, Apr
    };
    
    for (const [pattern, months] of Object.entries(seasonalBoosts)) {
      if (query.toLowerCase().includes(pattern) && months.includes(currentMonth)) {
        return this.config.seasonalBoost;
      }
    }
    
    return 1.0;
  }

  private getCompetitiveMultiplier(opportunity: any): number {
    const confidence = opportunity.confidence_score || 0;
    // Note: roi_12_month doesn't exist on UnifiedOpportunity, so remove that check
    if (confidence > 0.8) return 1.2;
    return 1.0;
  }

  private async createContentSchedule(opportunities: any[]): Promise<ContentCalendarEntry[]> {
    const calendar: ContentCalendarEntry[] = [];
    const startDate = startOfWeek(this.config.startDate, { weekStartsOn: 1 }); // Monday start
    
    let opportunityIndex = 0;
    const weeklyResourceUsage: Record<number, { light: number; medium: number; heavy: number }> = {};

    for (let week = 0; week < this.config.weeks; week++) {
      weeklyResourceUsage[week] = { light: 0, medium: 0, heavy: 0 };
      
      // Determine publishing days for this week
      const publishingDays = this.getPublishingSchedule(week);
      
      for (const dayOffset of publishingDays) {
        if (opportunityIndex >= opportunities.length) {
          // Cycle back through opportunities if we run out
          opportunityIndex = 0;
        }
        
        const opportunity = opportunities[opportunityIndex];
        const publishDate = addDays(addWeeks(startDate, week), dayOffset);
        const dayOfWeek = format(publishDate, 'EEEE') as ContentCalendarEntry['dayOfWeek'];
        
        // Determine resource requirement
        const resourceReq = this.determineResourceRequirement(opportunity, weeklyResourceUsage[week]);
        
        // Skip if resource constraints exceeded
        if (!this.canAllocateResource(weeklyResourceUsage[week], resourceReq)) {
          continue;
        }
        
        // Allocate resource
        weeklyResourceUsage[week][resourceReq]++;
        
        const entry: ContentCalendarEntry = {
          id: `content-${week}-${dayOffset}-${opportunityIndex}`,
          date: format(publishDate, 'yyyy-MM-dd'),
          dayOfWeek,
          week: week + 1,
          title: this.generateContentTitle(opportunity),
          cluster: opportunity.query,
          contentType: this.determineContentType(opportunity),
          targetKeywords: this.extractTargetKeywords(opportunity),
          priority: this.determinePriority(opportunity),
          estimatedWords: this.estimateWordCount(opportunity, resourceReq),
          brief: this.generateContentBrief(opportunity),
          opportunityScore: opportunity.impact_score,
          seasonalFactor: this.getSeasonalMultiplier(opportunity.query),
          resourceRequirement: resourceReq,
          dependencies: this.identifyDependencies(opportunity, calendar),
          internalLinkTargets: this.identifyLinkTargets(opportunity, calendar)
        };
        
        calendar.push(entry);
        opportunityIndex++;
      }
    }
    
    return calendar;
  }

  private getPublishingSchedule(week: number): number[] {
    // Default: Mon, Wed, Fri (0, 2, 4)
    const baseSchedule = [0, 2, 4];
    
    // Vary schedule slightly for content freshness
    const scheduleVariations = [
      [0, 2, 4], // Mon, Wed, Fri
      [1, 3, 4], // Tue, Thu, Fri  
      [0, 2, 3], // Mon, Wed, Thu
      [1, 2, 4]  // Tue, Wed, Fri
    ];
    
    return scheduleVariations[week % scheduleVariations.length] || baseSchedule;
  }

  private determineResourceRequirement(
    opportunity: OpportunityItem, 
    weeklyUsage: { light: number; medium: number; heavy: number }
  ): 'light' | 'medium' | 'heavy' {
    // Heavy content criteria
    if (opportunity.impact_score > 8.5 && opportunity.monthly_value > 3000) {
      return weeklyUsage.heavy < this.config.resourceConstraints.heavy ? 'heavy' : 'medium';
    }
    
    // Medium content criteria  
    if (opportunity.impact_score > 7.0 && opportunity.monthly_value > 1000) {
      return weeklyUsage.medium < this.config.resourceConstraints.medium ? 'medium' : 'light';
    }
    
    // Default to light
    return 'light';
  }

  private canAllocateResource(
    weeklyUsage: { light: number; medium: number; heavy: number },
    resourceReq: 'light' | 'medium' | 'heavy'
  ): boolean {
    return weeklyUsage[resourceReq] < this.config.resourceConstraints[resourceReq];
  }

  private generateContentTitle(opportunity: OpportunityItem): string {
    const query = opportunity.query;
    
    // Title templates by content type
    const templates = [
      `The Complete ${this.capitalize(query)} Guide`,
      `How to ${this.capitalize(query)}: Step-by-Step Tutorial`,
      `${this.capitalize(query)} vs Alternatives: Complete Comparison`,
      `Free ${this.capitalize(query)} Tools: Best Options for 2025`,
      `${this.capitalize(query)}: Ultimate Beginner's Guide`,
      `Advanced ${this.capitalize(query)} Techniques That Work`,
      `${this.capitalize(query)} Best Practices for Chrome Extensions`
    ];
    
    // Select template based on query characteristics
    if (query.includes('vs') || query.includes('versus')) {
      return templates[2];
    } else if (query.includes('free')) {
      return templates[3];
    } else if (query.includes('how to')) {
      return templates[1];
    } else {
      return templates[0];
    }
  }

  private capitalize(text: string): string {
    return text.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private determineContentType(opportunity: OpportunityItem): ContentCalendarEntry['contentType'] {
    const query = opportunity.query.toLowerCase();
    
    if (query.includes('vs') || query.includes('versus') || query.includes('comparison')) {
      return 'comparison';
    } else if (query.includes('how to') || query.includes('tutorial')) {
      return 'tutorial';
    } else if (query.includes('guide') || query.includes('complete')) {
      return 'guide';
    } else if (query.includes('news') || query.includes('update')) {
      return 'news';
    } else if (query.includes('case study') || query.includes('example')) {
      return 'case-study';
    } else {
      return 'guide'; // Default
    }
  }

  private extractTargetKeywords(opportunity: OpportunityItem): string[] {
    const baseKeywords = [opportunity.query];
    
    // Generate keyword variations
    const variations = [
      `${opportunity.query} chrome extension`,
      `free ${opportunity.query}`,
      `online ${opportunity.query}`,
      `${opportunity.query} tool`,
      `best ${opportunity.query}`,
      `${opportunity.query} 2025`
    ];
    
    return [...baseKeywords, ...variations.slice(0, 3)]; // Limit to 4 total keywords
  }

  private determinePriority(opportunity: OpportunityItem): 'high' | 'medium' | 'low' {
    if (opportunity.impact_score >= 8.0) return 'high';
    if (opportunity.impact_score >= 6.0) return 'medium';
    return 'low';
  }

  private estimateWordCount(opportunity: OpportunityItem, resourceReq: 'light' | 'medium' | 'heavy'): number {
    const baseWordCounts = {
      light: 800,
      medium: 1500,
      heavy: 2500
    };
    
    let wordCount = baseWordCounts[resourceReq];
    
    // Adjust based on content complexity
    if (opportunity.query.includes('comparison') || opportunity.query.includes('vs')) {
      wordCount *= 1.3; // Comparisons need more content
    }
    
    if (opportunity.query.includes('complete') || opportunity.query.includes('ultimate')) {
      wordCount *= 1.5; // Comprehensive guides
    }
    
    return Math.round(wordCount);
  }

  private generateContentBrief(opportunity: OpportunityItem): string {
    const query = opportunity.query;
    const contentType = this.determineContentType(opportunity);
    
    const briefTemplates = {
      guide: `Comprehensive guide covering all aspects of ${query}. Target audience: users looking for ${query} solutions. Include practical examples, screenshots, and step-by-step instructions.`,
      comparison: `Detailed comparison of ${query} options. Compare features, pricing, pros/cons. Include comparison table and recommendations for different use cases.`,
      tutorial: `Step-by-step tutorial for ${query}. Include prerequisites, detailed steps with screenshots, troubleshooting tips, and next steps.`,
      'case-study': `Real-world case study demonstrating ${query} implementation. Include problem, solution, results, and lessons learned.`,
      news: `Latest news and updates about ${query}. Cover recent developments, industry impact, and implications for users.`,
      'product-update': `Product update announcement for ${query} features. Include new functionality, benefits, and how to access.`
    };
    
    let brief = briefTemplates[contentType] || briefTemplates.guide;
    
    // Add SEO context
    brief += ` Target monthly search volume: ${opportunity.monthly_value}. Opportunity score: ${opportunity.impact_score.toFixed(1)}.`;
    
    // Add competitive context
    if (opportunity.roi_12_month > 200) {
      brief += ` High ROI opportunity - prioritize comprehensive coverage.`;
    }
    
    return brief;
  }

  private identifyDependencies(opportunity: OpportunityItem, existingCalendar: ContentCalendarEntry[]): string[] {
    const dependencies: string[] = [];
    const query = opportunity.query.toLowerCase();
    
    // Look for related content in existing calendar
    for (const entry of existingCalendar) {
      const entryQuery = entry.cluster.toLowerCase();
      
      // Check for topical relationships
      if (this.areTopicallyRelated(query, entryQuery)) {
        dependencies.push(entry.id);
      }
    }
    
    return dependencies.slice(0, 2); // Limit to 2 dependencies
  }

  private identifyLinkTargets(opportunity: OpportunityItem, existingCalendar: ContentCalendarEntry[]): string[] {
    const linkTargets: string[] = [];
    const query = opportunity.query.toLowerCase();
    
    // Find content that this piece should link to
    for (const entry of existingCalendar) {
      const entryQuery = entry.cluster.toLowerCase();
      
      if (this.shouldLinkTo(query, entryQuery)) {
        linkTargets.push(entry.cluster);
      }
    }
    
    return linkTargets.slice(0, 3); // Limit to 3 internal link targets
  }

  private areTopicallyRelated(query1: string, query2: string): boolean {
    // Simple topical relationship detection
    const commonTerms = ['pdf', 'converter', 'image', 'document', 'file', 'tool', 'extension', 'free'];
    
    for (const term of commonTerms) {
      if (query1.includes(term) && query2.includes(term)) {
        return true;
      }
    }
    
    return false;
  }

  private shouldLinkTo(fromQuery: string, toQuery: string): boolean {
    // Linking strategy: link from specific to general, from new to established
    const generalTopics = ['document', 'file', 'converter', 'tool', 'chrome extension'];
    
    for (const topic of generalTopics) {
      if (fromQuery.includes(topic) && toQuery.includes(topic)) {
        return true;
      }
    }
    
    return false;
  }

  private generateWeeklyBreakdown(calendar: ContentCalendarEntry[]) {
    const weeklyMap: Record<number, ContentCalendarEntry[]> = {};
    
    // Group calendar entries by week
    for (const entry of calendar) {
      const week = entry.week;
      if (!weeklyMap[week]) {
        weeklyMap[week] = [];
      }
      weeklyMap[week].push(entry);
    }
    
    // Generate breakdown for each week
    return Object.entries(weeklyMap).map(([weekStr, entries]) => {
      const week = parseInt(weekStr);
      const weekStart = addWeeks(startOfWeek(this.config.startDate, { weekStartsOn: 1 }), week - 1);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      
      // Calculate metrics
      const averageScore = entries.reduce((sum, e) => sum + e.opportunityScore, 0) / entries.length;
      const clusters = [...new Set(entries.map(e => e.cluster))];
      const theme = this.determineWeeklyTheme(entries);
      
      return {
        week,
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
        pieces: entries.length,
        averageScore: Math.round(averageScore * 10) / 10,
        theme,
        focus: clusters.slice(0, 3) // Top 3 focus areas
      };
    });
  }

  private determineWeeklyTheme(entries: ContentCalendarEntry[]): string {
    const themes = entries.map(e => e.contentType);
    const themeCounts = themes.reduce((acc, theme) => {
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const primaryTheme = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    const themeLabels = {
      guide: 'Educational Content',
      comparison: 'Product Comparisons',
      tutorial: 'How-To Content',
      news: 'Industry Updates',
      'product-update': 'Product Announcements',
      'case-study': 'Success Stories'
    };
    
    return themeLabels[primaryTheme as keyof typeof themeLabels] || 'Mixed Content';
  }

  private calculateMetadata(calendar: ContentCalendarEntry[]) {
    const totalPieces = calendar.length;
    const averageScore = calendar.reduce((sum, entry) => sum + entry.opportunityScore, 0) / totalPieces;
    
    const resourceDistribution = calendar.reduce((acc, entry) => {
      acc[entry.resourceRequirement]++;
      return acc;
    }, { light: 0, medium: 0, heavy: 0 });
    
    const startDate = calendar[0]?.date || format(this.config.startDate, 'yyyy-MM-dd');
    const endDate = calendar[calendar.length - 1]?.date || 
      format(addWeeks(this.config.startDate, this.config.weeks), 'yyyy-MM-dd');
    
    return {
      generatedAt: new Date().toISOString(),
      period: {
        start: startDate,
        end: endDate,
        weeks: this.config.weeks
      },
      totalPieces,
      averageScore: Math.round(averageScore * 10) / 10,
      resourceDistribution
    };
  }
}

// Export utility functions for external use
export const ContentCalendarUtils = {
  formatCalendarAsMarkdown(calendar: ContentCalendar): string {
    let markdown = `# Content Calendar\n\n`;
    
    // Metadata
    markdown += `## Overview\n`;
    markdown += `- **Period**: ${calendar.metadata.period.start} to ${calendar.metadata.period.end}\n`;
    markdown += `- **Total Pieces**: ${calendar.metadata.totalPieces}\n`;
    markdown += `- **Average Opportunity Score**: ${calendar.metadata.averageScore}\n`;
    markdown += `- **Resource Distribution**: ${calendar.metadata.resourceDistribution.light} light, ${calendar.metadata.resourceDistribution.medium} medium, ${calendar.metadata.resourceDistribution.heavy} heavy\n\n`;
    
    // Weekly breakdown
    markdown += `## Weekly Breakdown\n\n`;
    for (const week of calendar.weeklyBreakdown) {
      markdown += `### Week ${week.week} (${week.startDate} to ${week.endDate})\n`;
      markdown += `**Theme**: ${week.theme}  \n`;
      markdown += `**Pieces**: ${week.pieces}  \n`;
      markdown += `**Average Score**: ${week.averageScore}  \n`;
      markdown += `**Focus Areas**: ${week.focus.join(', ')}\n\n`;
      
      // Content for this week
      const weekContent = calendar.calendar.filter(entry => entry.week === week.week);
      for (const content of weekContent) {
        markdown += `- **${content.dayOfWeek}** (${content.date}): ${content.title}\n`;
        markdown += `  - Type: ${content.contentType} | Priority: ${content.priority} | Words: ~${content.estimatedWords}\n`;
        markdown += `  - Target Keywords: ${content.targetKeywords.join(', ')}\n`;
        markdown += `  - Brief: ${content.brief}\n\n`;
      }
    }
    
    return markdown;
  },

  exportCalendarAsCSV(calendar: ContentCalendar): string {
    const headers = [
      'Date', 'Day', 'Week', 'Title', 'Cluster', 'Content Type', 'Priority',
      'Target Keywords', 'Estimated Words', 'Opportunity Score', 'Resource Requirement', 'Brief'
    ];
    
    const rows = calendar.calendar.map(entry => [
      entry.date,
      entry.dayOfWeek,
      entry.week.toString(),
      entry.title,
      entry.cluster,
      entry.contentType,
      entry.priority,
      entry.targetKeywords.join('; '),
      entry.estimatedWords.toString(),
      entry.opportunityScore.toFixed(1),
      entry.resourceRequirement,
      entry.brief
    ]);
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }
};