/**
 * Schema Validator with Comprehensive Rules
 * v1.8 Phase 2: JSON-LD Schema Generation System
 */

import {
  JsonLD,
  ValidationResult,
  LintReport,
  LintIssue,
  SchemaType,
  VALIDATION_RULES,
  CLAIMS_GATES
} from './types.js';

export class SchemaValidator {
  /**
   * Validate a single schema
   */
  validate(schema: JsonLD): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    this.validateBasicStructure(schema, errors);

    // Type-specific validation
    const schemaType = schema['@type'] as SchemaType;
    if (schemaType && Object.values(SchemaType).includes(schemaType)) {
      this.validateTypeSpecific(schema, schemaType, errors, warnings);
    } else {
      warnings.push(`Unknown or missing schema type: ${schemaType}`);
    }

    // Content validation
    this.validateContent(schema, errors, warnings);

    // Claims validation
    this.validateClaims(schema, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate multiple schemas and generate lint report
   */
  lint(schemas: JsonLD[]): LintReport {
    const issues: LintIssue[] = [];
    let validSchemas = 0;

    // Validate each schema
    for (let i = 0; i < schemas.length; i++) {
      const schema = schemas[i];
      const validation = this.validate(schema);
      const schemaType = schema['@type'] || 'Unknown';

      if (validation.valid) {
        validSchemas++;
      }

      // Add errors as issues
      validation.errors.forEach(error => {
        issues.push({
          type: 'error',
          schemaType,
          message: error,
          suggestion: this.getSuggestion(error)
        });
      });

      // Add warnings as issues
      validation.warnings.forEach(warning => {
        issues.push({
          type: 'warning',
          schemaType,
          message: warning,
          suggestion: this.getSuggestion(warning)
        });
      });
    }

    // Check for duplicates across schemas
    this.detectDuplicates(schemas, issues);

    // Generate summary
    const errors = issues.filter(issue => issue.type === 'error').length;
    const warnings = issues.filter(issue => issue.type === 'warning').length;
    const duplicates = issues.filter(issue => issue.message.includes('Duplicate')).length;

    return {
      totalSchemas: schemas.length,
      validSchemas,
      issues,
      summary: {
        errors,
        warnings,
        duplicates
      }
    };
  }

  /**
   * Apply claims validation gates to clean up forbidden claims
   */
  applyClaims(schema: JsonLD): JsonLD {
    const cleanedSchema = JSON.parse(JSON.stringify(schema)); // Deep clone

    // Apply claims gates to all text fields
    this.applyClaimsToObject(cleanedSchema);

    return cleanedSchema;
  }

  /**
   * Check if schema has the minimum required content length
   */
  checkMinimumContent(schema: JsonLD): boolean {
    const rules = VALIDATION_RULES[schema['@type'] as SchemaType];
    if (!rules || !rules.minWordCount) {
      return true;
    }

    // Count words in description and other text fields
    let totalWords = 0;
    if (schema.description) {
      totalWords += this.countWords(schema.description);
    }

    return totalWords >= rules.minWordCount;
  }

  /**
   * Validate URLs in schema
   */
  validateURLs(schema: JsonLD): string[] {
    const errors: string[] = [];

    this.validateURLsInObject(schema, errors, '');

    return errors;
  }

  /**
   * Basic structure validation
   */
  private validateBasicStructure(schema: JsonLD, errors: string[]): void {
    if (!schema['@context']) {
      errors.push('Missing @context field');
    } else if (schema['@context'] !== 'https://schema.org') {
      errors.push('@context must be "https://schema.org"');
    }

    if (!schema['@type']) {
      errors.push('Missing @type field');
    }
  }

  /**
   * Type-specific validation
   */
  private validateTypeSpecific(schema: JsonLD, schemaType: SchemaType, errors: string[], warnings: string[]): void {
    const rules = VALIDATION_RULES[schemaType];
    if (!rules) return;

    // Check required fields
    rules.required.forEach(field => {
      if (!schema[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Check field lengths
    if (rules.maxLengths) {
      Object.entries(rules.maxLengths).forEach(([field, maxLength]) => {
        if (schema[field] && typeof schema[field] === 'string' && schema[field].length > maxLength) {
          warnings.push(`${field} exceeds maximum length of ${maxLength} characters`);
        }
      });
    }

    // Type-specific validations
    switch (schemaType) {
      case SchemaType.FAQPage:
        this.validateFAQPage(schema, errors, warnings);
        break;
      case SchemaType.HowTo:
        this.validateHowTo(schema, errors, warnings);
        break;
      case SchemaType.BreadcrumbList:
        this.validateBreadcrumbList(schema, errors, warnings);
        break;
      case SchemaType.SoftwareApplication:
        this.validateSoftwareApplication(schema, errors, warnings);
        break;
      case SchemaType.Article:
        this.validateArticle(schema, errors, warnings);
        break;
    }
  }

  /**
   * Content validation
   */
  private validateContent(schema: JsonLD, errors: string[], warnings: string[]): void {
    // Check for empty required fields
    if (schema.name === '') {
      errors.push('name field cannot be empty');
    }
    if (schema.description === '') {
      errors.push('description field cannot be empty');
    }

    // Validate URLs
    const urlErrors = this.validateURLs(schema);
    errors.push(...urlErrors);

    // Check minimum content
    if (!this.checkMinimumContent(schema)) {
      warnings.push('Schema may not have sufficient content for SEO value');
    }
  }

  /**
   * Claims validation
   */
  private validateClaims(schema: JsonLD, warnings: string[]): void {
    const forbiddenClaims = Object.keys(CLAIMS_GATES);

    this.checkClaimsInObject(schema, forbiddenClaims, warnings, '');
  }

  /**
   * FAQ-specific validation
   */
  private validateFAQPage(schema: JsonLD, errors: string[], warnings: string[]): void {
    if (schema.mainEntity && Array.isArray(schema.mainEntity)) {
      const rules = VALIDATION_RULES[SchemaType.FAQPage];

      if (schema.mainEntity.length < rules.minQuestions) {
        errors.push(`FAQPage requires at least ${rules.minQuestions} questions`);
      }

      // Check for duplicate questions
      const questions = new Set<string>();
      schema.mainEntity.forEach((item: any, index: number) => {
        if (item.name) {
          const normalized = item.name.toLowerCase().trim();
          if (questions.has(normalized)) {
            errors.push(`Duplicate question found: "${item.name}"`);
          }
          questions.add(normalized);

          if (item.name.length > rules.maxQuestionLength) {
            warnings.push(`Question ${index + 1} exceeds maximum length`);
          }
        }
      });
    }
  }

  /**
   * HowTo-specific validation
   */
  private validateHowTo(schema: JsonLD, errors: string[], warnings: string[]): void {
    if (schema.step && Array.isArray(schema.step)) {
      const rules = VALIDATION_RULES[SchemaType.HowTo];

      if (schema.step.length < rules.minSteps) {
        errors.push(`HowTo requires at least ${rules.minSteps} steps`);
      }

      schema.step.forEach((step: any, index: number) => {
        if (!step.name) {
          errors.push(`Step ${index + 1} missing name`);
        }
        if (!step.text) {
          errors.push(`Step ${index + 1} missing text`);
        }
        if (step.text && step.text.length > rules.maxStepLength) {
          warnings.push(`Step ${index + 1} text too long`);
        }
      });
    }
  }

  /**
   * BreadcrumbList-specific validation
   */
  private validateBreadcrumbList(schema: JsonLD, errors: string[], warnings: string[]): void {
    if (schema.itemListElement && Array.isArray(schema.itemListElement)) {
      const rules = VALIDATION_RULES[SchemaType.BreadcrumbList];
      const items = schema.itemListElement;

      if (items.length < rules.minItems) {
        errors.push(`BreadcrumbList requires at least ${rules.minItems} items`);
      }

      if (items.length > rules.maxItems) {
        warnings.push(`BreadcrumbList exceeds recommended maximum of ${rules.maxItems} items`);
      }

      // Check position sequence
      const positions = items.map((item: any) => item.position).filter((pos: any) => pos !== undefined);
      const sortedPositions = [...positions].sort((a, b) => a - b);
      for (let i = 0; i < sortedPositions.length; i++) {
        if (sortedPositions[i] !== i + 1) {
          warnings.push('Breadcrumb positions should be sequential starting from 1');
          break;
        }
      }
    }
  }

  /**
   * SoftwareApplication-specific validation
   */
  private validateSoftwareApplication(schema: JsonLD, errors: string[], warnings: string[]): void {
    // Validate offers
    if (schema.offers) {
      if (!schema.offers.price) {
        warnings.push('SoftwareApplication missing price in offers');
      }
      if (!schema.offers.priceCurrency) {
        warnings.push('SoftwareApplication missing priceCurrency in offers');
      }
    }

    // Validate rating
    if (schema.aggregateRating) {
      const rating = parseFloat(schema.aggregateRating.ratingValue);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        errors.push('Rating value must be between 1 and 5');
      }
    }
  }

  /**
   * Article-specific validation
   */
  private validateArticle(schema: JsonLD, errors: string[], warnings: string[]): void {
    // Validate dates
    if (schema.datePublished && !this.isValidISODate(schema.datePublished)) {
      errors.push('datePublished must be a valid ISO date');
    }
    if (schema.dateModified && !this.isValidISODate(schema.dateModified)) {
      errors.push('dateModified must be a valid ISO date');
    }

    // Check word count
    const rules = VALIDATION_RULES[SchemaType.Article];
    if (schema.wordCount && schema.wordCount < rules.minWordCount) {
      warnings.push(`Article word count ${schema.wordCount} below recommended minimum ${rules.minWordCount}`);
    }
  }

  /**
   * Detect duplicate schemas
   */
  private detectDuplicates(schemas: JsonLD[], issues: LintIssue[]): void {
    const seen = new Map<string, number>();

    schemas.forEach((schema, index) => {
      const key = `${schema['@type']}-${schema.name || schema.headline || 'unnamed'}`;
      if (seen.has(key)) {
        issues.push({
          type: 'warning',
          schemaType: schema['@type'],
          message: `Duplicate schema detected: ${key}`,
          suggestion: 'Consider merging duplicate schemas or using different names'
        });
      }
      seen.set(key, index);
    });
  }

  /**
   * Get suggestion for common issues
   */
  private getSuggestion(message: string): string | undefined {
    if (message.includes('Missing required field')) {
      return 'Add the required field to make the schema valid';
    }
    if (message.includes('exceeds maximum length')) {
      return 'Shorten the text to improve SEO and readability';
    }
    if (message.includes('invalid URL')) {
      return 'Check URL format and ensure it starts with http:// or https://';
    }
    if (message.includes('Duplicate')) {
      return 'Remove duplicates or use different identifiers';
    }
    return undefined;
  }

  /**
   * Apply claims gates recursively to object
   */
  private applyClaimsToObject(obj: any): void {
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          obj[key] = this.applyClaimsToString(value);
        } else if (typeof value === 'object') {
          this.applyClaimsToObject(value);
        }
      }
    }
  }

  /**
   * Apply claims gates to a string
   */
  private applyClaimsToString(text: string): string {
    let result = text;
    for (const [forbidden, replacement] of Object.entries(CLAIMS_GATES)) {
      const regex = new RegExp(`\\b${forbidden}\\b`, 'gi');
      result = result.replace(regex, replacement);
    }
    return result;
  }

  /**
   * Check for forbidden claims in object
   */
  private checkClaimsInObject(obj: any, forbiddenClaims: string[], warnings: string[], path: string): void {
    if (typeof obj === 'string') {
      forbiddenClaims.forEach(claim => {
        if (obj.toLowerCase().includes(claim.toLowerCase())) {
          warnings.push(`Potentially forbidden claim "${claim}" found in ${path || 'schema'}`);
        }
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        this.checkClaimsInObject(value, forbiddenClaims, warnings, newPath);
      });
    }
  }

  /**
   * Validate URLs in object recursively
   */
  private validateURLsInObject(obj: any, errors: string[], path: string): void {
    if (typeof obj === 'string' && (path.includes('url') || path.includes('URL') || path.includes('image'))) {
      try {
        new URL(obj);
      } catch {
        errors.push(`Invalid URL in ${path}: ${obj}`);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        this.validateURLsInObject(value, errors, newPath);
      });
    }
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Validate ISO date format
   */
  private isValidISODate(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime()) && dateString.includes('-');
    } catch {
      return false;
    }
  }
}