/**
 * BreadcrumbList Schema Template
 * v1.8 Phase 2: JSON-LD Schema Generation
 */

import { SchemaTemplate, SchemaType, SchemaData, JsonLD, ValidationResult, VALIDATION_RULES, CLAIMS_GATES } from '../types.js';

export class BreadcrumbListTemplate implements SchemaTemplate {
  type = SchemaType.BreadcrumbList;

  generate(data: SchemaData): JsonLD {
    if (!data.breadcrumbs || data.breadcrumbs.length === 0) {
      throw new Error('BreadcrumbList requires at least one breadcrumb');
    }

    const itemListElement = data.breadcrumbs.map(breadcrumb => ({
      '@type': 'ListItem',
      position: breadcrumb.position,
      name: this.applyClaims(breadcrumb.name),
      item: breadcrumb.url
    }));

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement
    };
  }

  validate(schema: JsonLD): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = VALIDATION_RULES[SchemaType.BreadcrumbList];

    // Check required fields
    for (const field of rules.required) {
      if (!schema[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate itemListElement
    if (schema.itemListElement) {
      if (!Array.isArray(schema.itemListElement)) {
        errors.push('itemListElement must be an array');
      } else {
        const items = schema.itemListElement;

        // Check minimum items
        if (items.length < rules.minItems) {
          errors.push(`BreadcrumbList requires at least ${rules.minItems} items`);
        }

        // Check maximum items
        if (items.length > rules.maxItems) {
          warnings.push(`BreadcrumbList has ${items.length} items, which exceeds recommended maximum of ${rules.maxItems}`);
        }

        // Validate each breadcrumb
        const positions = new Set<number>();
        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          if (item['@type'] !== 'ListItem') {
            errors.push(`Breadcrumb ${i + 1} must have @type: "ListItem"`);
          }

          if (!item.name) {
            errors.push(`Breadcrumb ${i + 1} missing name field`);
          }

          if (!item.item) {
            errors.push(`Breadcrumb ${i + 1} missing item field (URL)`);
          } else {
            // Validate URL
            try {
              new URL(item.item);
            } catch {
              errors.push(`Breadcrumb ${i + 1} has invalid URL: ${item.item}`);
            }
          }

          if (item.position === undefined) {
            errors.push(`Breadcrumb ${i + 1} missing position field`);
          } else {
            // Check for duplicate positions
            if (positions.has(item.position)) {
              errors.push(`Duplicate position ${item.position} found in breadcrumbs`);
            }
            positions.add(item.position);

            // Check position sequence
            if (item.position !== i + 1) {
              warnings.push(`Breadcrumb ${i + 1} has position ${item.position}, expected sequential numbering`);
            }

            // Check position is positive
            if (item.position < 1) {
              errors.push(`Breadcrumb ${i + 1} has invalid position ${item.position} (must be positive)`);
            }
          }
        }

        // Check if positions form a complete sequence starting from 1
        const sortedPositions = Array.from(positions).sort((a, b) => a - b);
        const expectedPositions = Array.from({ length: items.length }, (_, i) => i + 1);
        if (JSON.stringify(sortedPositions) !== JSON.stringify(expectedPositions)) {
          warnings.push('Breadcrumb positions should form a complete sequence starting from 1');
        }
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