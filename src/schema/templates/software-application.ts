/**
 * SoftwareApplication Schema Template
 * v1.8 Phase 2: JSON-LD Schema Generation
 */

import { SchemaTemplate, SchemaType, SchemaData, JsonLD, ValidationResult, VALIDATION_RULES, CLAIMS_GATES } from '../types.js';

export class SoftwareApplicationTemplate implements SchemaTemplate {
  type = SchemaType.SoftwareApplication;

  generate(data: SchemaData): JsonLD {
    const schema: JsonLD = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: this.applyClaims(data.displayName || data.name),
      description: this.applyClaims(data.description),
      applicationCategory: data.applicationCategory || 'BrowserApplication',
      operatingSystem: data.operatingSystem || 'Any',
      url: data.url || data.website,
      offers: {
        '@type': 'Offer',
        price: data.price || '0',
        priceCurrency: data.currency || 'USD'
      }
    };

    // Add version if provided (both version and softwareVersion for compatibility)
    if (data.version) {
      schema.softwareVersion = data.version;
      schema.version = data.version; // Some tests/validators expect this
    }

    // Add author if provided
    if (data.author) {
      schema.author = {
        '@type': 'Organization',
        name: data.author
      };
    }

    // Add rating if available
    if (data.ratingValue && data.ratingCount) {
      schema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: data.ratingValue.toString(),
        ratingCount: data.ratingCount.toString()
      };
    }

    return schema;
  }

  validate(schema: JsonLD): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = VALIDATION_RULES[SchemaType.SoftwareApplication];

    // Check required fields
    for (const field of rules.required) {
      if (!schema[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check field lengths
    if (rules.maxLengths) {
      for (const [field, maxLength] of Object.entries(rules.maxLengths)) {
        if (schema[field] && schema[field].length > maxLength) {
          warnings.push(`${field} exceeds maximum length of ${maxLength} characters`);
        }
      }
    }

    // Validate application category
    const validCategories = [
      'BrowserApplication', 'WebApplication', 'MobileApplication',
      'DesktopApplication', 'GameApplication'
    ];
    if (schema.applicationCategory && !validCategories.includes(schema.applicationCategory)) {
      warnings.push(`Uncommon applicationCategory: ${schema.applicationCategory}`);
    }

    // Validate offers structure
    if (schema.offers) {
      if (!schema.offers['@type'] || schema.offers['@type'] !== 'Offer') {
        errors.push('offers must have @type: "Offer"');
      }
      if (!schema.offers.price) {
        warnings.push('offers.price not specified');
      }
    }

    // Validate rating if present
    if (schema.aggregateRating) {
      const rating = parseFloat(schema.aggregateRating.ratingValue);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        errors.push('aggregateRating.ratingValue must be between 1 and 5');
      }

      const count = parseInt(schema.aggregateRating.ratingCount);
      if (isNaN(count) || count < 1) {
        errors.push('aggregateRating.ratingCount must be a positive integer');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private applyClaims(text: string): string {
    let result = text;

    for (const [forbidden, replacement] of Object.entries(CLAIMS_GATES)) {
      const regex = new RegExp(`\\b${forbidden}\\b`, 'gi');
      result = result.replace(regex, replacement);
    }

    return result;
  }
}