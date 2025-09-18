/**
 * Article Schema Template
 * v1.8 Phase 2: JSON-LD Schema Generation
 */

import { SchemaTemplate, SchemaType, SchemaData, JsonLD, ValidationResult, VALIDATION_RULES, CLAIMS_GATES } from '../types.js';

export class ArticleTemplate implements SchemaTemplate {
  type = SchemaType.Article;

  generate(data: SchemaData): JsonLD {
    if (!data.article) {
      throw new Error('Article schema requires article data');
    }

    const schema: JsonLD = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: this.applyClaims(data.article.headline),
      description: this.applyClaims(data.description),
      url: data.url
    };

    // Add optional fields if available
    if (data.article.author) {
      schema.author = {
        '@type': 'Person',
        name: data.article.author
      };
    }

    if (data.article.datePublished) {
      schema.datePublished = data.article.datePublished;
    }

    if (data.article.dateModified) {
      schema.dateModified = data.article.dateModified;
    }

    if (data.article.image) {
      schema.image = data.article.image;
    }

    if (data.article.wordCount) {
      schema.wordCount = data.article.wordCount;
    }

    return schema;
  }

  validate(schema: JsonLD): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = VALIDATION_RULES[SchemaType.Article];

    // Check required fields
    for (const field of rules.required) {
      if (!schema[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate field lengths
    if (rules.maxLengths) {
      for (const [field, maxLength] of Object.entries(rules.maxLengths)) {
        if (schema[field] && schema[field].length > maxLength) {
          warnings.push(`${field} exceeds maximum length of ${maxLength} characters`);
        }
      }
    }

    // Validate word count
    if (schema.wordCount) {
      const wordCount = parseInt(schema.wordCount);
      if (isNaN(wordCount) || wordCount < 1) {
        errors.push('wordCount must be a positive integer');
      } else if (wordCount < rules.minWordCount) {
        warnings.push(`Article has ${wordCount} words, which is below recommended minimum of ${rules.minWordCount}`);
      }
    }

    // Validate dates
    if (schema.datePublished) {
      if (!this.isValidDate(schema.datePublished)) {
        errors.push('datePublished must be a valid ISO 8601 date');
      }
    }

    if (schema.dateModified) {
      if (!this.isValidDate(schema.dateModified)) {
        errors.push('dateModified must be a valid ISO 8601 date');
      }

      // Check that dateModified is not before datePublished
      if (schema.datePublished && this.isValidDate(schema.datePublished) && this.isValidDate(schema.dateModified)) {
        const published = new Date(schema.datePublished);
        const modified = new Date(schema.dateModified);
        if (modified < published) {
          errors.push('dateModified cannot be before datePublished');
        }
      }
    }

    // Validate URLs
    if (schema.url) {
      try {
        new URL(schema.url);
      } catch {
        errors.push(`Invalid URL: ${schema.url}`);
      }
    }

    if (schema.image) {
      try {
        new URL(schema.image);
      } catch {
        warnings.push(`Invalid image URL: ${schema.image}`);
      }
    }

    // Validate author structure
    if (schema.author) {
      if (schema.author['@type'] !== 'Person' && schema.author['@type'] !== 'Organization') {
        warnings.push('author @type should be "Person" or "Organization"');
      }
      if (!schema.author.name) {
        errors.push('author missing name field');
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

  private isValidDate(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime()) && dateString.includes('-');
    } catch {
      return false;
    }
  }
}