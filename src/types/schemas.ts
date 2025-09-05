/**
 * Central type schemas for SEO Ads Expert
 * Consolidates action types, opportunities, and other shared schemas
 */

import { z } from 'zod';

// Extended action types for mutations
export const ExtendedActionTypeSchema = z.enum([
  // Basic actions
  'CREATE',
  'UPDATE',
  'REMOVE',
  'PAUSE',
  'ENABLE',
  // Campaign actions
  'CREATE_CAMPAIGN',
  'UPDATE_CAMPAIGN',
  'DELETE_CAMPAIGN',
  // Ad group actions
  'CREATE_AD_GROUP',
  'UPDATE_AD_GROUP',
  'DELETE_AD_GROUP',
  // Keyword actions
  'ADD_KEYWORD',
  'UPDATE_KEYWORD',
  'REMOVE_KEYWORD',
  // Budget and bid actions
  'UPDATE_BUDGET',
  'UPDATE_BID',
  // Ad actions
  'UPDATE_AD',
  'CREATE_AD',
  'DELETE_AD',
  // Targeting actions
  'UPDATE_TARGETING',
  // Mass operations
  'MASS_UPDATE'
]);

export type ExtendedActionType = z.infer<typeof ExtendedActionTypeSchema>;

// Resource types
export const ResourceTypeSchema = z.enum([
  'campaign',
  'ad_group',
  'keyword',
  'ad',
  'budget',
  'targeting'
]);

export type ResourceType = z.infer<typeof ResourceTypeSchema>;

// Extended mutation schema with all properties
export const ExtendedMutationSchema = z.object({
  type: ExtendedActionTypeSchema,
  resource: ResourceTypeSchema,
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  changes: z.record(z.any()),
  priority: z.number(),
  dependencies: z.array(z.string()).optional(),
  // Additional properties for specific action types
  budget: z.number().optional(),
  oldBudget: z.number().optional(),
  bid: z.number().optional(),
  oldBid: z.number().optional(),
  keyword: z.string().optional(),
  ad: z.object({
    headline: z.string(),
    description: z.string()
  }).optional(),
  targeting: z.record(z.any()).optional(),
  campaignId: z.string().optional()
});

export type ExtendedMutation = z.infer<typeof ExtendedMutationSchema>;

// Unified opportunity schema
export const UnifiedOpportunitySchema = z.object({
  id: z.string(),
  type: z.enum(['search_terms', 'paid_organic', 'serp_monitoring', 'manual']),
  query: z.string(),
  market: z.string(),
  search_volume: z.number(),
  commercial_intent_score: z.number(),
  serp_difficulty: z.number(),
  serp_features: z.array(z.string()),
  top_competitors: z.array(z.string()),
  content_gaps: z.array(z.string()),
  current_position: z.number().optional(),
  cost_per_click: z.number().optional(),
  estimated_clicks: z.number().optional(),
  estimated_impressions: z.number().optional(),
  estimated_conversions: z.number().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  action_required: z.string(),
  implementation_effort: z.enum(['low', 'medium', 'high']),
  last_updated: z.string(),
  monthly_cost: z.number().optional(),
  monthly_impressions: z.number().optional(),
  monthly_clicks: z.number().optional(),
  monthly_conversions: z.number().optional()
});

export type UnifiedOpportunity = z.infer<typeof UnifiedOpportunitySchema>;

// Waste analysis schema
export const WasteAnalysisSchema = z.object({
  totalWaste: z.number(),
  wastePercentage: z.number(),
  topWasteTerms: z.array(z.object({
    term: z.string(),
    cost: z.number(),
    clicks: z.number(),
    conversions: z.number(),
    wasteReason: z.string()
  })),
  wasteTerms: z.array(z.object({
    term: z.string(),
    cost: z.number(),
    clicks: z.number(),
    conversions: z.number()
  })).optional(),
  suggestedNegatives: z.array(z.string()).optional(),
  recommendations: z.array(z.object({
    type: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    description: z.string(),
    estimatedSavings: z.number().optional()
  }))
});

export type WasteAnalysis = z.infer<typeof WasteAnalysisSchema>;

// Strategic response schema
export const StrategicResponseSchema = z.object({
  type: z.string(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  change: z.object({
    metric: z.string(),
    value: z.number(),
    trend: z.enum(['up', 'down', 'stable'])
  }).optional(),
  action: z.string(),
  description: z.string(),
  estimatedImpact: z.record(z.any()).optional()
});

export type StrategicResponse = z.infer<typeof StrategicResponseSchema>;

// Export all schemas for convenience
export const schemas = {
  ExtendedActionTypeSchema,
  ResourceTypeSchema,
  ExtendedMutationSchema,
  UnifiedOpportunitySchema,
  WasteAnalysisSchema,
  StrategicResponseSchema
};