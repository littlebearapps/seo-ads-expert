/**
 * HowTo Schema Template
 * v1.8 Phase 2: JSON-LD Schema Generation
 */

import { SchemaTemplate, SchemaType, SchemaData, JsonLD, ValidationResult, VALIDATION_RULES, CLAIMS_GATES } from '../types.js';

export class HowToTemplate implements SchemaTemplate {
  type = SchemaType.HowTo;

  generate(data: SchemaData): JsonLD {
    if (!data.steps || data.steps.length === 0) {
      throw new Error('HowTo requires at least one step');
    }

    const steps = data.steps.map((step, index) => ({
      '@type': 'HowToStep',
      name: this.applyClaims(step.name),
      text: this.applyClaims(step.text),
      position: index + 1,
      ...(step.image && { image: step.image }),
      ...(step.url && { url: step.url })
    }));

    return {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: this.applyClaims(data.name),
      description: this.applyClaims(data.description),
      step: steps
    };
  }

  validate(schema: JsonLD): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = VALIDATION_RULES[SchemaType.HowTo];

    // Check required fields
    for (const field of rules.required) {
      if (!schema[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate steps
    if (schema.step) {
      if (!Array.isArray(schema.step)) {
        errors.push('step must be an array');
      } else {
        const steps = schema.step;

        // Check minimum steps
        if (steps.length < rules.minSteps) {
          errors.push(`HowTo requires at least ${rules.minSteps} steps`);
        }

        // Validate each step
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];

          if (step['@type'] !== 'HowToStep') {
            errors.push(`Step ${i + 1} must have @type: "HowToStep"`);
          }

          if (!step.name) {
            errors.push(`Step ${i + 1} missing name field`);
          }

          if (!step.text) {
            errors.push(`Step ${i + 1} missing text field`);
          } else if (step.text.length > rules.maxStepLength) {
            warnings.push(`Step ${i + 1} text exceeds maximum length of ${rules.maxStepLength} characters`);
          }

          // Validate position
          if (step.position !== undefined) {
            if (step.position !== i + 1) {
              warnings.push(`Step ${i + 1} has incorrect position value (expected ${i + 1}, got ${step.position})`);
            }
          }

          // Validate URLs if present
          if (step.url) {
            try {
              new URL(step.url);
            } catch {
              warnings.push(`Step ${i + 1} has invalid URL: ${step.url}`);
            }
          }

          if (step.image) {
            try {
              new URL(step.image);
            } catch {
              warnings.push(`Step ${i + 1} has invalid image URL: ${step.image}`);
            }
          }
        }
      }
    }

    // Validate main fields
    if (schema.name && schema.name.length > 110) {
      warnings.push('name exceeds recommended length of 110 characters');
    }

    if (schema.description && schema.description.length > 160) {
      warnings.push('description exceeds recommended length of 160 characters');
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