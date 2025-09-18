/**
 * Content Planning Types
 * v1.8 Phase 3: Content Roadmap Generation System
 */

export interface ContentGap {
  cluster: string;
  type: GapType;
  severity: 'critical' | 'major' | 'minor';
  entities: string[];
  description: string;
  currentCoverage: number; // 0-100
  targetCoverage: number; // 0-100
  competitorAvg: number; // 0-100
}

export enum GapType {
  MissingEntities = 'missing_entities',
  MissingSections = 'missing_sections',
  ContentLength = 'content_length',
  SchemaMarkup = 'schema_markup',
  FAQ = 'faq_missing',
  HowTo = 'howto_missing',
  Freshness = 'content_freshness'
}

export interface ContentItem {
  id: string;
  product: string;
  title: string;
  type: ContentType;
  cluster: string;
  targetUrl: string;
  priority: number; // 1-10
  impact: number; // 0-100
  effort: number; // 1-5
  status: ContentStatus;
  dueDate?: string;
  description: string;
  keywords: string[];
  entities: string[];
  gaps: ContentGap[];
  recommendations: string[];
}

export enum ContentType {
  LandingPageUpdate = 'lp_update',
  BlogPost = 'blog',
  PillarPage = 'pillar',
  FAQ = 'faq',
  HowToGuide = 'howto',
  ComparisonPage = 'comparison',
  CaseStudy = 'case_study'
}

export enum ContentStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Review = 'review',
  Published = 'published',
  Deferred = 'deferred'
}

export interface ContentCalendar {
  product: string;
  generatedAt: string;
  items: ContentItem[];
  summary: {
    totalItems: number;
    byType: Record<ContentType, number>;
    byPriority: Record<string, number>;
    estimatedEffort: number; // total effort points
    expectedImpact: number; // weighted average impact
  };
  timeline: CalendarWeek[];
}

export interface CalendarWeek {
  weekOf: string; // ISO date
  items: ContentItem[];
  totalEffort: number;
  focus: string; // main focus for the week
}

export interface FAQ {
  question: string;
  answer: string;
  source: FAQSource;
  relevance: number; // 0-100
  searchVolume?: number;
}

export enum FAQSource {
  SERP = 'serp',
  PAA = 'paa', // People Also Ask
  Reviews = 'reviews',
  Support = 'support',
  Generated = 'generated'
}

export interface LinkOpportunity {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  context: string;
  strength: number; // 1-3
  rationale: string;
  type: LinkType;
}

export enum LinkType {
  Contextual = 'contextual',
  Navigation = 'navigation',
  Related = 'related',
  DeepLink = 'deep_link'
}

export interface ImpactFactors {
  searchVolume: number; // 0-1 normalized
  intentMatch: number; // 0-1
  competitiveGap: number; // 0-1
  serpFeatures: number; // 0-1
  conversionPotential: number; // 0-1
}

export interface EffortFactors {
  contentLength: number; // word count
  technicalComplexity: number; // 1-5
  researchRequired: number; // 1-5
  designRequired: number; // 1-5
  dependencies: number; // count of dependencies
}

export interface ContentRecommendation {
  type: ContentType;
  title: string;
  rationale: string;
  targetKeywords: string[];
  estimatedImpact: number;
  estimatedEffort: number;
  prerequisites: string[];
}

export interface CoverageReport {
  product: string;
  clusters: ClusterCoverage[];
  overallScore: number;
  recommendations: ContentRecommendation[];
}

export interface ClusterCoverage {
  cluster: string;
  url: string;
  score: number; // 0-100
  gaps: ContentGap[];
  opportunities: string[];
  competitorComparison: {
    topCompetitor: string;
    theirScore: number;
    advantages: string[];
    disadvantages: string[];
  };
}