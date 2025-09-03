import { z } from 'zod';

// Product Configuration Schema
export const ProductConfigSchema = z.object({
  product: z.string(),
  summary: z.string(),
  value_props: z.array(z.string()),
  seed_queries: z.array(z.string()),
  target_pages: z.array(z.object({
    url: z.string(),
    purpose: z.enum(['main', 'use-case', 'feature', 'docs', 'pricing'])
  })),
  markets: z.array(z.string()),
  brand_rules: z.object({
    pinned_headline: z.string(),
    banned_words: z.array(z.string()),
    claims_validation: z.record(z.boolean())
  }),
  market_localization: z.record(z.object({
    gl: z.string(),
    hl: z.string()
  })),
  pre_seeded_negatives: z.array(z.string())
});

export type ProductConfig = z.infer<typeof ProductConfigSchema>;

// Data Source Types
export type DataSource = 'kwp' | 'gsc' | 'estimated';

// Keyword Data Schema
export const KeywordDataSchema = z.object({
  keyword: z.string(),
  volume: z.number().optional(),
  cpc: z.number().optional(),
  competition: z.number().optional(),
  intent_score: z.number().default(1.0),
  final_score: z.number().default(0),
  data_source: z.enum(['kwp', 'gsc', 'estimated']).default('estimated'),
  cluster: z.string().optional(),
  recommended_match_type: z.enum(['exact', 'phrase', 'broad']).default('phrase'),
  markets: z.array(z.string()).default([]),
  serp_features: z.array(z.string()).default([])
});

export type KeywordData = z.infer<typeof KeywordDataSchema>;

// SERP Features Schema
export const SerpFeaturesSchema = z.object({
  ai_overview: z.boolean().default(false),
  people_also_ask: z.boolean().default(false),
  featured_snippet: z.boolean().default(false),
  video_results: z.boolean().default(false),
  shopping_results: z.boolean().default(false),
  local_pack: z.boolean().default(false),
  knowledge_panel: z.boolean().default(false)
});

export type SerpFeatures = z.infer<typeof SerpFeaturesSchema>;

// SERP Result Schema
export const SerpResultSchema = z.object({
  query: z.string(),
  market: z.string(),
  organic_results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    domain: z.string(),
    snippet: z.string().optional()
  })),
  features: SerpFeaturesSchema,
  competitors: z.array(z.string()).default([])
});

export type SerpResult = z.infer<typeof SerpResultSchema>;

// KWP CSV Schema
export const KwpCsvRowSchema = z.object({
  keyword: z.string(),
  'avg_monthly_searches': z.string().optional(),
  'competition': z.string().optional(),
  'competition_index': z.string().optional(),
  'top_of_page_bid_low': z.string().optional(),
  'top_of_page_bid_high': z.string().optional(),
  'account_status': z.string().optional()
});

export type KwpCsvRow = z.infer<typeof KwpCsvRowSchema>;

// Search Console Response Schema
export const SearchConsoleResponseSchema = z.object({
  rows: z.array(z.object({
    keys: z.array(z.string()),
    clicks: z.number(),
    impressions: z.number(),
    ctr: z.number(),
    position: z.number()
  })).default([])
});

export type SearchConsoleResponse = z.infer<typeof SearchConsoleResponseSchema>;

// RapidAPI Keyword Response Schema
export const RapidApiKeywordResponseSchema = z.object({
  keywords: z.array(z.object({
    keyword: z.string(),
    search_volume: z.number().optional(),
    competition: z.string().optional(),
    suggested_bid: z.number().optional()
  })).default([])
});

export type RapidApiKeywordResponse = z.infer<typeof RapidApiKeywordResponseSchema>;

// RapidAPI SERP Response Schema
export const RapidApiSerpResponseSchema = z.object({
  web_results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional()
  })).default([]),
  related_searches: z.array(z.string()).default([]),
  people_also_ask: z.array(z.string()).default([])
});

export type RapidApiSerpResponse = z.infer<typeof RapidApiSerpResponseSchema>;

// Cache Entry Schema
export const CacheEntrySchema = z.object({
  key: z.string(),
  data: z.unknown(),
  timestamp: z.number(),
  ttl: z.number(),
  source: z.enum(['kwp', 'gsc', 'rapid-serp', 'rapid-keywords'])
});

export type CacheEntry = z.infer<typeof CacheEntrySchema>;

// Plan Output Schemas
export const AdGroupSchema = z.object({
  name: z.string(),
  keywords_exact: z.array(z.string()),
  keywords_phrase: z.array(z.string()),
  keywords_broad: z.array(z.string()).default([]),
  headlines: z.array(z.string()),
  descriptions: z.array(z.string()),
  sitelinks: z.array(z.string()).default([]),
  landing_page: z.string(),
  negatives: z.array(z.string()).default([])
});

export type AdGroup = z.infer<typeof AdGroupSchema>;

export const PlanSummarySchema = z.object({
  product: z.string(),
  date: z.string(),
  markets: z.array(z.string()),
  total_keywords: z.number(),
  total_ad_groups: z.number(),
  serp_calls_used: z.number(),
  cache_hit_rate: z.number(),
  data_sources: z.object({
    kwp_count: z.number().default(0),
    gsc_count: z.number().default(0),
    estimated_count: z.number().default(0)
  }),
  top_opportunities: z.array(z.object({
    keyword: z.string(),
    score: z.number(),
    volume: z.number().optional(),
    competition: z.number().optional()
  })).default([]),
  generation_time_ms: z.number(),
  warnings: z.array(z.string()).default([])
});

export type PlanSummary = z.infer<typeof PlanSummarySchema>;