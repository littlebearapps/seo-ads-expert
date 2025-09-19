/**
 * Standardized JSON Data Contracts for v1.9
 * Defines all output formats for consistent API responses
 */

// ============= Crawl Data Contracts =============

export interface CrawlSessionContract {
  sessionId: string;
  startUrl: string;
  startTime: string;
  endTime?: string;
  statistics: {
    pagesDiscovered: number;
    pagesCrawled: number;
    linksFound: number;
    errors: number;
    duration?: number;
  };
  errors?: Array<{
    url: string;
    error: string;
    timestamp: string;
  }>;
}

export interface CrawlPageContract {
  url: string;
  canonicalUrl?: string;
  status: number;
  meta: {
    title?: string;
    description?: string;
    robots?: {
      noindex: boolean;
      nofollow: boolean;
      allowed: boolean;
    };
  };
  content: {
    h1?: string;
    wordCount: number;
    headings: {
      h1: number;
      h2: number;
      h3: number;
    };
  };
  technical: {
    responseTime?: number;
    contentType?: string;
    contentHash?: string;
    depth: number;
    section?: string;
  };
  seo: {
    imagesCount?: number;
    internalLinksCount?: number;
    externalLinksCount?: number;
    schemaTypes?: string[];
    openGraph?: {
      title?: string;
      description?: string;
      image?: string;
      type?: string;
    };
  };
  lastCrawled: string;
}

export interface LinkGraphContract {
  nodes: Array<{
    url: string;
    title?: string;
    pageRank?: number;
    inboundLinks: number;
    outboundLinks: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    anchorText?: string;
    type: 'internal' | 'external' | 'tel' | 'mailto';
  }>;
  statistics: {
    totalNodes: number;
    totalEdges: number;
    orphanPages: number;
    brokenLinks: number;
  };
}

// ============= Health & Indexation Contracts =============

export interface HealthReportContract {
  domain: string;
  timestamp: string;
  healthScore: number;
  metrics: {
    indexationRate: number;
    orphanPages: number;
    brokenLinks: number;
    duplicateContent: number;
    missingMeta: number;
    avgResponseTime?: number;
    totalPages: number;
  };
  issues: Array<{
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    affectedUrls: string[];
    recommendation: string;
  }>;
  recommendations: string[];
}

export interface IndexationReportContract {
  domain: string;
  timestamp: string;
  summary: {
    totalCrawled: number;
    totalIndexed: number;
    discoveredNotIndexed: number;
    crawledNotIndexed: number;
    excludedDuplicates: number;
    lowQualityIndexed: number;
    indexationRate: number;
  };
  issues: Array<{
    url: string;
    state: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    fix: string;
    evidence?: {
      crawled: boolean;
      indexed: boolean;
      noindex?: boolean;
      depth?: number;
      impressions?: number;
      clicks?: number;
    };
  }>;
  recommendations: string[];
}

// ============= Robots.txt Contracts =============

export interface RobotsAuditContract {
  site: string;
  timestamp: string;
  severity: 'PASS' | 'WARNING' | 'CRITICAL';
  robotsTxtFound: boolean;
  sitemaps: string[];
  findings: Array<{
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
    fix: string;
    details?: {
      userAgent?: string;
      rule?: string;
      affectedUrls?: string[];
    };
  }>;
  userAgents: Array<{
    name: string;
    rules: Array<{
      type: 'allow' | 'disallow';
      path: string;
    }>;
    crawlDelay?: number;
  }>;
}

// ============= Sitemap Contracts =============

export interface SitemapGenerationContract {
  timestamp: string;
  sitemaps: Array<{
    filename: string;
    urlCount: number;
    section?: string;
    sizeBytes?: number;
  }>;
  indexSitemap?: {
    filename: string;
    childSitemaps: number;
  };
  statistics: {
    totalUrls: number;
    totalSitemaps: number;
    sectioned: boolean;
  };
}

export interface SitemapValidationContract {
  url: string;
  timestamp: string;
  isValid: boolean;
  urlCount: number;
  errors: string[];
  warnings: string[];
  details?: {
    fileSize?: number;
    lastModified?: string;
    format?: 'urlset' | 'sitemapindex';
  };
}

// ============= IndexNow Contracts =============

export interface IndexNowSubmissionContract {
  timestamp: string;
  engine: 'bing' | 'yandex';
  result: {
    submitted: number;
    failed: number;
    quotaRemaining?: number;
  };
  errors?: string[];
  submissions: Array<{
    url: string;
    status: 'success' | 'failed';
    responseCode?: number;
    timestamp: string;
  }>;
}

export interface IndexNowStatsContract {
  engine: 'bing' | 'yandex';
  period: {
    start: string;
    end: string;
    days: number;
  };
  statistics: {
    totalSubmitted: number;
    totalFailed: number;
    successRate: string;
    dailyAverage: number;
  };
  dailyBreakdown?: Array<{
    date: string;
    submitted: number;
    failed: number;
  }>;
}

// ============= GSC Integration Contracts =============

export interface GSCIndexationDataContract {
  url: string;
  coverage: {
    state?: string;
    indexingState?: string;
    crawledAs?: string;
    googleCanonical?: string;
    userCanonical?: string;
  };
  performance?: {
    impressions: number;
    clicks: number;
    ctr?: number;
    averagePosition?: number;
  };
  validation?: {
    robotsTxtState?: string;
    pageFetchState?: string;
    crawlTimestamp?: string;
  };
  lastUpdated: string;
}

// ============= Unified Response Contract =============

export interface APIResponseContract<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    version: string;
    timestamp: string;
    processingTime?: number;
  };
}

// ============= Batch Operation Contract =============

export interface BatchOperationContract {
  operationId: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    percentage: number;
  };
  startTime: string;
  endTime?: string;
  results?: any[];
  errors?: Array<{
    item: any;
    error: string;
    timestamp: string;
  }>;
}

// ============= Export Helper Functions =============

export function createAPIResponse<T>(
  data?: T,
  error?: { code: string; message: string; details?: any }
): APIResponseContract<T> {
  return {
    success: !error,
    data,
    error,
    metadata: {
      version: '1.9.0',
      timestamp: new Date().toISOString(),
    }
  };
}

export function formatHealthReport(data: any): HealthReportContract {
  return {
    domain: data.domain,
    timestamp: new Date().toISOString(),
    healthScore: data.healthScore || 0,
    metrics: {
      indexationRate: data.indexationRate || 0,
      orphanPages: data.orphanPages || 0,
      brokenLinks: data.brokenLinks || 0,
      duplicateContent: data.duplicateContent || 0,
      missingMeta: data.missingMeta || 0,
      avgResponseTime: data.avgResponseTime,
      totalPages: data.totalPages || 0
    },
    issues: data.criticalIssues || [],
    recommendations: data.recommendations || []
  };
}

export function formatCrawlSession(session: any): CrawlSessionContract {
  return {
    sessionId: session.session_id || session.sessionId,
    startUrl: session.start_url || session.startUrl,
    startTime: session.start_time || session.startTime,
    endTime: session.end_time || session.endTime,
    statistics: {
      pagesDiscovered: session.pages_discovered || 0,
      pagesCrawled: session.pages_crawled || 0,
      linksFound: session.links_found || 0,
      errors: session.error_count || 0,
      duration: session.duration
    },
    errors: session.errors
  };
}