/**
 * FAQPage Schema Template
 * v1.8 Phase 2: JSON-LD Schema Generation
 */

import { SchemaTemplate, SchemaType, SchemaData, JsonLD, ValidationResult, VALIDATION_RULES, CLAIMS_GATES } from '../types.js';

export class FAQPageTemplate implements SchemaTemplate {
  type = SchemaType.FAQPage;

  generate(data: SchemaData): JsonLD {
    if (!data.questions || data.questions.length === 0) {
      throw new Error('FAQPage requires at least one question');
    }

    const mainEntity = data.questions.map(faq => ({
      '@type': 'Question',
      name: this.applyClaims(faq.question),
      acceptedAnswer: {
        '@type': 'Answer',
        text: this.applyClaims(faq.answer)
      }
    }));

    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity
    };
  }

  validate(schema: JsonLD): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = VALIDATION_RULES[SchemaType.FAQPage];

    // Check required fields
    for (const field of rules.required) {
      if (!schema[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate mainEntity structure
    if (schema.mainEntity) {
      if (!Array.isArray(schema.mainEntity)) {
        errors.push('mainEntity must be an array');
      } else {
        const questions = schema.mainEntity;

        // Check minimum questions
        if (questions.length < rules.minQuestions) {
          errors.push(`FAQPage requires at least ${rules.minQuestions} questions`);
        }

        // Validate each question
        const questionTexts = new Set<string>();
        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];

          if (question['@type'] !== 'Question') {
            errors.push(`Question ${i + 1} must have @type: "Question"`);
          }

          if (!question.name) {
            errors.push(`Question ${i + 1} missing name field`);
          } else {
            // Check for duplicates
            const normalizedName = question.name.toLowerCase().trim();
            if (questionTexts.has(normalizedName)) {
              errors.push(`Duplicate question detected: "${question.name}"`);
            }
            questionTexts.add(normalizedName);

            // Check length
            if (question.name.length > rules.maxQuestionLength) {
              warnings.push(`Question ${i + 1} exceeds maximum length of ${rules.maxQuestionLength} characters`);
            }
          }

          if (!question.acceptedAnswer) {
            errors.push(`Question ${i + 1} missing acceptedAnswer`);
          } else if (question.acceptedAnswer['@type'] !== 'Answer') {
            errors.push(`Question ${i + 1} acceptedAnswer must have @type: "Answer"`);
          } else if (!question.acceptedAnswer.text) {
            errors.push(`Question ${i + 1} acceptedAnswer missing text`);
          }
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