/**
 * Entity Auditor Types - v1.8
 * Type definitions for entity extraction, coverage analysis, and gap detection
 */

export interface Entity {
  canonical: string;           // Normalized entity name
  variants: string[];          // Alternative forms and synonyms
  importance: number;          // 0-1 importance score
  frequency: number;           // Frequency in SERP data
  sources: EntitySource[];     // Where this entity was found
  confidence: number;          // 0-1 confidence in extraction
}

export interface EntitySource {
  type: 'serp' | 'keywords' | 'reviews' | 'paa' | 'competitors';
  url?: string;
  position?: number;
  frequency: number;
}

export interface PageSnapshot {
  url: string;
  capturedAt: string;
  wordCount: number;
  headings: Heading[];
  sections: Section[];
  presentEntities: string[];    // Canonical entity names found on page
  schemaTypes: string[];        // Schema.org types detected
  contentHash: string;          // For change detection
}

export interface Heading {
  level: number;               // 1-6 for H1-H6
  text: string;
  position: number;            // Character position in content
}

export interface Section {
  title: string;
  content: string;
  wordCount: number;
  entities: string[];          // Entities found in this section
  type: 'intro' | 'features' | 'faq' | 'how-to' | 'comparison' | 'other';
}

export interface Cluster {
  name: string;                // e.g., 'webp-to-png'
  keywords: string[];
  intent: 'commercial' | 'informational' | 'navigational' | 'transactional';
  volume: number;              // Total search volume
  difficulty: number;          // SEO difficulty score
}

export interface CoverageAnalysis {
  product: string;
  cluster: string;
  market: string;
  measuredAt: string;
  coverageScore: number;       // 0-100 overall coverage score
  competitorAverage: number;   // Average score of top 3 competitors
  gapCount: number;
  entityGaps: EntityGap[];
  sectionGaps: SectionGap[];
  schemaGaps: SchemaGap[];
  recommendations: Recommendation[];
}

export interface EntityGap {
  entity: string;
  importance: number;
  competitorPresence: number;  // % of top competitors that mention this
  suggestedPlacement: string;  // Where to add this entity
  rationale: string;
}

export interface SectionGap {
  sectionType: string;         // 'faq', 'how-to', 'comparison', etc.
  competitorPresence: number;  // % of competitors with this section
  suggestedContent: string;    // Brief description of what to add
  estimatedWordCount: number;
}

export interface SchemaGap {
  schemaType: string;          // 'FAQPage', 'HowTo', etc.
  competitorPresence: number;  // % of competitors using this schema
  priority: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface Recommendation {
  type: 'entity' | 'section' | 'schema' | 'internal-link';
  priority: number;            // 1-5 priority score
  title: string;
  description: string;
  effort: number;              // 1-5 effort estimate
  impact: number;              // 1-5 impact estimate
  targetUrl: string;
}

export interface ExtractorConfig {
  minEntityLength: number;     // Minimum character length for entities
  maxEntityLength: number;     // Maximum character length for entities
  minFrequency: number;        // Minimum frequency to consider as entity
  stopWords: string[];         // Words to ignore during extraction
  synonymMappings: Record<string, string[]>; // Manual synonym mappings
}

export interface CoverageConfig {
  entityWeight: number;        // Weight for entity presence (default: 0.6)
  sectionWeight: number;       // Weight for section coverage (default: 0.2)
  schemaWeight: number;        // Weight for schema presence (default: 0.2)
  competitorCount: number;     // Number of top competitors to analyze (default: 3)
  minCompetitorPresence: number; // Minimum % to flag as gap (default: 0.5)
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  suggestions: string[];
}

// Database interfaces matching schema
export interface EntityRecord {
  entity_id: number;
  product_id: number;
  canonical: string;
  variants_json: string;       // JSON array
  importance: number;
  created_at: string;
  updated_at: string;
}

export interface PageSnapshotRecord {
  captured_at: string;
  page_url: string;
  word_count: number;
  headings_json: string;       // JSON array
  sections_json: string;       // JSON array
  present_entities_json: string; // JSON array
  schema_types_json: string;   // JSON array
  content_hash: string;
}

export interface EntityCoverageRecord {
  measured_at: string;
  product: string;
  cluster: string;
  market: string;
  coverage_score: number;
  competitor_avg: number;
  gap_count: number;
  recommendations_json: string; // JSON array
}

// Error types
export class EntityExtractionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'EntityExtractionError';
  }
}

export class CoverageAnalysisError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'CoverageAnalysisError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}