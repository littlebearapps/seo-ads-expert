import { z } from 'zod';

/**
 * Ground-Truth CSV Schema Definitions for Google Ads Editor
 * 
 * These schemas define the exact column structure expected by Ads Editor
 * based on ground-truth exports. DO NOT modify without updating ground-truth samples.
 */

// ============================================================================
// CSV COLUMN REGISTRIES (Order matters for deterministic output)
// ============================================================================

/**
 * Column registries define the exact order and names for each CSV type
 * These MUST match the ground-truth exports exactly
 */
export const CSV_COLUMN_REGISTRIES = {
  campaigns: [
    'Campaign',
    'Campaign Type',
    'Status', 
    'Budget',
    'Budget Type',
    'Bid Strategy Type',
    'Target CPA',
    'Target ROAS',
    'Networks',
    'Languages',
    'Location',
    'Location Bid Modifier',
    'Excluded Location',
    'Device',
    'Device Bid Modifier',
    'Ad Schedule',
    'Ad Schedule Bid Modifier',
    'Start Date',
    'End Date',
    'Campaign Labels'
  ] as const,

  ad_groups: [
    'Campaign',
    'Ad Group',
    'Status',
    'Max CPC',
    'Target CPA',
    'Target ROAS', 
    'Final URL',
    'Final Mobile URL',
    'Tracking Template',
    'Custom Parameters',
    'Ad Group Labels'
  ] as const,

  keywords_exact: [
    'Campaign',
    'Ad Group', 
    'Keyword',
    'Match Type',
    'Status',
    'Max CPC',
    'Final URL',
    'Final Mobile URL', 
    'Tracking Template',
    'Custom Parameters',
    'Keyword Labels'
  ] as const,

  keywords_phrase: [
    'Campaign',
    'Ad Group',
    'Keyword', 
    'Match Type',
    'Status',
    'Max CPC',
    'Final URL',
    'Final Mobile URL',
    'Tracking Template', 
    'Custom Parameters',
    'Keyword Labels'
  ] as const,

  ads_rsa: [
    'Campaign',
    'Ad Group',
    'Ad Type',
    'Status',
    'Headline 1',
    'Headline 1 Pinned',
    'Headline 2', 
    'Headline 2 Pinned',
    'Headline 3',
    'Headline 3 Pinned',
    'Headline 4',
    'Headline 4 Pinned',
    'Headline 5',
    'Headline 5 Pinned',
    'Headline 6',
    'Headline 6 Pinned',
    'Headline 7',
    'Headline 7 Pinned',
    'Headline 8',
    'Headline 8 Pinned',
    'Headline 9',
    'Headline 9 Pinned',
    'Headline 10',
    'Headline 10 Pinned',
    'Headline 11',
    'Headline 11 Pinned',
    'Headline 12',
    'Headline 12 Pinned',
    'Headline 13',
    'Headline 13 Pinned',
    'Headline 14',
    'Headline 14 Pinned',
    'Headline 15',
    'Headline 15 Pinned',
    'Description 1',
    'Description 2',
    'Description 3',
    'Description 4',
    'Path 1',
    'Path 2',
    'Final URL',
    'Final Mobile URL',
    'Tracking Template',
    'Custom Parameters',
    'Ad Labels'
  ] as const,

  assets_sitelinks: [
    'Asset Type',
    'Asset',
    'Asset Status',
    'Link Text',
    'Final URL',
    'Final Mobile URL',
    'Description 1',
    'Description 2'
  ] as const,

  assets_callouts: [
    'Asset Type',
    'Asset',
    'Asset Status', 
    'Callout Text'
  ] as const,

  assets_structured: [
    'Asset Type',
    'Asset',
    'Asset Status',
    'Header',
    'Values'
  ] as const,

  asset_associations: [
    'Campaign',
    'Ad Group',
    'Asset Type',
    'Asset',
    'Status'
  ] as const,

  shared_negatives: [
    'Shared Set',
    'Shared Set Type',
    'Status',
    'Shared Set Labels'
  ] as const,

  negative_associations: [
    'Campaign',
    'Shared Set',
    'Status'
  ] as const
} as const;

// ============================================================================
// CSV ROW SCHEMAS (Data validation for each CSV type)
// ============================================================================

export const CampaignRowSchema = z.object({
  Campaign: z.string().min(1).max(255),
  'Campaign Type': z.literal('Search'),
  Status: z.enum(['Enabled', 'Paused', 'Removed']),
  Budget: z.number().positive(),
  'Budget Type': z.enum(['Daily', 'Monthly']),
  'Bid Strategy Type': z.enum(['Manual CPC', 'Enhanced CPC', 'Maximize Clicks', 'Target CPA', 'Target ROAS', 'Maximize Conversions']),
  'Target CPA': z.number().optional(),
  'Target ROAS': z.number().optional(),
  Networks: z.enum(['Google Search', 'Search Partners', 'Google Search;Search Partners']),
  Languages: z.string().min(1),
  Location: z.string().min(1),
  'Location Bid Modifier': z.number().optional(),
  'Excluded Location': z.string().optional(),
  Device: z.string().optional(),
  'Device Bid Modifier': z.number().optional(),
  'Ad Schedule': z.string().optional(),
  'Ad Schedule Bid Modifier': z.number().optional(),
  'Start Date': z.string().optional(),
  'End Date': z.string().optional(),
  'Campaign Labels': z.string().optional()
});

export const AdGroupRowSchema = z.object({
  Campaign: z.string().min(1),
  'Ad Group': z.string().min(1).max(255),
  Status: z.enum(['Enabled', 'Paused', 'Removed']),
  'Max CPC': z.number().positive().optional(),
  'Target CPA': z.number().positive().optional(),
  'Target ROAS': z.number().positive().optional(),
  'Final URL': z.string().url(),
  'Final Mobile URL': z.string().url().optional(),
  'Tracking Template': z.string().optional(),
  'Custom Parameters': z.string().optional(),
  'Ad Group Labels': z.string().optional()
});

export const KeywordRowSchema = z.object({
  Campaign: z.string().min(1),
  'Ad Group': z.string().min(1),
  Keyword: z.string().min(1),
  'Match Type': z.enum(['Exact', 'Phrase', 'Broad']),
  Status: z.enum(['Enabled', 'Paused', 'Removed']),
  'Max CPC': z.number().positive().optional(),
  'Final URL': z.string().url().optional(),
  'Final Mobile URL': z.string().url().optional(),
  'Tracking Template': z.string().optional(),
  'Custom Parameters': z.string().optional(),
  'Keyword Labels': z.string().optional()
});

export const RSARowSchema = z.object({
  Campaign: z.string().min(1),
  'Ad Group': z.string().min(1),
  'Ad Type': z.literal('Responsive search ad'),
  Status: z.enum(['Enabled', 'Paused', 'Removed']),
  'Headline 1': z.string().max(30).optional(),
  'Headline 1 Pinned': z.enum(['1', '2', '3', '']).optional(),
  'Headline 2': z.string().max(30).optional(),
  'Headline 2 Pinned': z.enum(['1', '2', '3', '']).optional(),
  'Headline 3': z.string().max(30).optional(),
  'Headline 3 Pinned': z.enum(['1', '2', '3', '']).optional(),
  // ... continuing pattern for all 15 headlines
  'Description 1': z.string().max(90).optional(),
  'Description 2': z.string().max(90).optional(),
  'Description 3': z.string().max(90).optional(),
  'Description 4': z.string().max(90).optional(),
  'Path 1': z.string().max(15).optional(),
  'Path 2': z.string().max(15).optional(),
  'Final URL': z.string().url(),
  'Final Mobile URL': z.string().url().optional(),
  'Tracking Template': z.string().optional(),
  'Custom Parameters': z.string().optional(),
  'Ad Labels': z.string().optional()
});

export const SitelinkAssetRowSchema = z.object({
  'Asset Type': z.literal('Sitelink'),
  Asset: z.string().min(1),
  'Asset Status': z.enum(['Enabled', 'Paused', 'Removed']),
  'Link Text': z.string().min(1).max(25),
  'Final URL': z.string().url(),
  'Final Mobile URL': z.string().url().optional(),
  'Description 1': z.string().max(35).optional(),
  'Description 2': z.string().max(35).optional()
});

export const CalloutAssetRowSchema = z.object({
  'Asset Type': z.literal('Callout'),
  Asset: z.string().min(1),
  'Asset Status': z.enum(['Enabled', 'Paused', 'Removed']),
  'Callout Text': z.string().min(1).max(25)
});

export const StructuredSnippetAssetRowSchema = z.object({
  'Asset Type': z.literal('Structured snippet'),
  Asset: z.string().min(1),
  'Asset Status': z.enum(['Enabled', 'Paused', 'Removed']),
  Header: z.string().min(1),
  Values: z.string().min(1)
});

export const AssetAssociationRowSchema = z.object({
  Campaign: z.string().min(1),
  'Ad Group': z.string().optional(),
  'Asset Type': z.enum(['Sitelink', 'Callout', 'Structured snippet']),
  Asset: z.string().min(1),
  Status: z.enum(['Enabled', 'Paused', 'Removed'])
});

export const SharedNegativeRowSchema = z.object({
  'Shared Set': z.string().min(1),
  'Shared Set Type': z.literal('Negative keywords'),
  Status: z.enum(['Enabled', 'Paused', 'Removed']),
  'Shared Set Labels': z.string().optional()
});

export const NegativeAssociationRowSchema = z.object({
  Campaign: z.string().min(1),
  'Shared Set': z.string().min(1),
  Status: z.enum(['Enabled', 'Paused', 'Removed'])
});

// ============================================================================
// CSV TYPE DEFINITIONS
// ============================================================================

export type CsvType = keyof typeof CSV_COLUMN_REGISTRIES;

export type CampaignRow = z.infer<typeof CampaignRowSchema>;
export type AdGroupRow = z.infer<typeof AdGroupRowSchema>;
export type KeywordRow = z.infer<typeof KeywordRowSchema>;
export type RSARow = z.infer<typeof RSARowSchema>;
export type SitelinkAssetRow = z.infer<typeof SitelinkAssetRowSchema>;
export type CalloutAssetRow = z.infer<typeof CalloutAssetRowSchema>;
export type StructuredSnippetAssetRow = z.infer<typeof StructuredSnippetAssetRowSchema>;
export type AssetAssociationRow = z.infer<typeof AssetAssociationRowSchema>;
export type SharedNegativeRow = z.infer<typeof SharedNegativeRowSchema>;
export type NegativeAssociationRow = z.infer<typeof NegativeAssociationRowSchema>;

// ============================================================================
// SCHEMA REGISTRY MAP
// ============================================================================

export const CSV_SCHEMAS = {
  campaigns: CampaignRowSchema,
  ad_groups: AdGroupRowSchema, 
  keywords_exact: KeywordRowSchema,
  keywords_phrase: KeywordRowSchema,
  ads_rsa: RSARowSchema,
  assets_sitelinks: SitelinkAssetRowSchema,
  assets_callouts: CalloutAssetRowSchema,
  assets_structured: StructuredSnippetAssetRowSchema,
  asset_associations: AssetAssociationRowSchema,
  shared_negatives: SharedNegativeRowSchema,
  negative_associations: NegativeAssociationRowSchema
} as const;

// ============================================================================
// VERSION TRACKING
// ============================================================================

export const CSV_SCHEMA_VERSION = '1.1.0';
export const LAST_UPDATED = '2025-09-03';

/**
 * Schema metadata for tracking changes and validation
 */
export interface SchemaMetadata {
  version: string;
  lastUpdated: string;
  groundTruthSource: string;
  columnCount: Record<CsvType, number>;
  requiredFields: Record<CsvType, string[]>;
}

export const SCHEMA_METADATA: SchemaMetadata = {
  version: CSV_SCHEMA_VERSION,
  lastUpdated: LAST_UPDATED,
  groundTruthSource: 'Google Ads Editor Export - LBA SEO Test Campaign',
  columnCount: {
    campaigns: CSV_COLUMN_REGISTRIES.campaigns.length,
    ad_groups: CSV_COLUMN_REGISTRIES.ad_groups.length,
    keywords_exact: CSV_COLUMN_REGISTRIES.keywords_exact.length,
    keywords_phrase: CSV_COLUMN_REGISTRIES.keywords_phrase.length,
    ads_rsa: CSV_COLUMN_REGISTRIES.ads_rsa.length,
    assets_sitelinks: CSV_COLUMN_REGISTRIES.assets_sitelinks.length,
    assets_callouts: CSV_COLUMN_REGISTRIES.assets_callouts.length,
    assets_structured: CSV_COLUMN_REGISTRIES.assets_structured.length,
    asset_associations: CSV_COLUMN_REGISTRIES.asset_associations.length,
    shared_negatives: CSV_COLUMN_REGISTRIES.shared_negatives.length,
    negative_associations: CSV_COLUMN_REGISTRIES.negative_associations.length
  },
  requiredFields: {
    campaigns: ['Campaign', 'Campaign Type', 'Status', 'Budget'],
    ad_groups: ['Campaign', 'Ad Group', 'Status', 'Final URL'],
    keywords_exact: ['Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Status'],
    keywords_phrase: ['Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Status'],
    ads_rsa: ['Campaign', 'Ad Group', 'Ad Type', 'Status', 'Final URL'],
    assets_sitelinks: ['Asset Type', 'Asset', 'Asset Status', 'Link Text', 'Final URL'],
    assets_callouts: ['Asset Type', 'Asset', 'Asset Status', 'Callout Text'],
    assets_structured: ['Asset Type', 'Asset', 'Asset Status', 'Header', 'Values'],
    asset_associations: ['Campaign', 'Asset Type', 'Asset', 'Status'],
    shared_negatives: ['Shared Set', 'Shared Set Type', 'Status'],
    negative_associations: ['Campaign', 'Shared Set', 'Status']
  }
};