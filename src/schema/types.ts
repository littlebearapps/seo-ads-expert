/**
 * Schema Generation Types
 * v1.8 Phase 2: JSON-LD Schema Generation System
 */

export interface JsonLD {
  '@context': string;
  '@type': string;
  [key: string]: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface LintReport {
  totalSchemas: number;
  validSchemas: number;
  issues: LintIssue[];
  summary: {
    errors: number;
    warnings: number;
    duplicates: number;
  };
}

export interface LintIssue {
  type: 'error' | 'warning';
  schemaType: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface SchemaTemplate {
  type: SchemaType;
  generate(data: SchemaData): JsonLD;
  validate(schema: JsonLD): ValidationResult;
}

export enum SchemaType {
  SoftwareApplication = 'SoftwareApplication',
  FAQPage = 'FAQPage',
  HowTo = 'HowTo',
  BreadcrumbList = 'BreadcrumbList',
  Article = 'Article'
}

export interface SchemaData {
  product: string;
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
  operatingSystem?: string;
  price?: string;
  currency?: string;
  ratingValue?: number;
  ratingCount?: number;
  questions?: FAQ[];
  steps?: HowToStep[];
  breadcrumbs?: Breadcrumb[];
  article?: ArticleData;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface HowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
}

export interface Breadcrumb {
  name: string;
  url: string;
  position: number;
}

export interface ArticleData {
  headline: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  wordCount?: number;
  image?: string;
}

// Claims validation gates
export const CLAIMS_GATES = {
  'no uploads': 'privacy_friendly',
  'offline': 'local_processing',
  'secure': 'privacy_first',
  'fast': 'optimized',
  'instant': 'quick',
  'unlimited': 'generous_limits'
} as const;

// Validation rules by schema type
export const VALIDATION_RULES = {
  [SchemaType.SoftwareApplication]: {
    required: ['@context', '@type', 'name', 'applicationCategory'],
    maxLengths: { name: 60, description: 160 },
    claims: ['privacy', 'performance', 'compatibility']
  },
  [SchemaType.FAQPage]: {
    required: ['@context', '@type', 'mainEntity'],
    minQuestions: 2,
    maxQuestionLength: 120,
    noDuplicateQuestions: true
  },
  [SchemaType.HowTo]: {
    required: ['@context', '@type', 'name', 'step'],
    minSteps: 2,
    maxStepLength: 200
  },
  [SchemaType.BreadcrumbList]: {
    required: ['@context', '@type', 'itemListElement'],
    minItems: 2,
    maxItems: 10
  },
  [SchemaType.Article]: {
    required: ['@context', '@type', 'headline'],
    maxLengths: { headline: 110, description: 160 },
    minWordCount: 250
  }
} as const;