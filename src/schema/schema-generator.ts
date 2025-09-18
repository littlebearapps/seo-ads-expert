/**
 * Schema Generator with Template Engine
 * v1.8 Phase 2: JSON-LD Schema Generation System
 */

import {
  SchemaType,
  SchemaData,
  JsonLD,
  SchemaTemplate,
  ValidationResult
} from './types.js';

import {
  SoftwareApplicationTemplate,
  FAQPageTemplate,
  HowToTemplate,
  BreadcrumbListTemplate,
  ArticleTemplate
} from './templates/index.js';

export class SchemaGenerator {
  private templates: Map<SchemaType, SchemaTemplate>;

  constructor() {
    this.templates = new Map<SchemaType, SchemaTemplate>();
    this.templates.set(SchemaType.SoftwareApplication, new SoftwareApplicationTemplate());
    this.templates.set(SchemaType.FAQPage, new FAQPageTemplate());
    this.templates.set(SchemaType.HowTo, new HowToTemplate());
    this.templates.set(SchemaType.BreadcrumbList, new BreadcrumbListTemplate());
    this.templates.set(SchemaType.Article, new ArticleTemplate());
  }

  /**
   * Generate a single schema of the specified type
   */
  generate(type: SchemaType, data: SchemaData): JsonLD {
    const template = this.templates.get(type);
    if (!template) {
      throw new Error(`Unsupported schema type: ${type}`);
    }

    try {
      return template.generate(data);
    } catch (error) {
      throw new Error(`Failed to generate ${type} schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate multiple schemas for a product
   */
  generateMultiple(types: SchemaType[], data: SchemaData): JsonLD[] {
    const schemas: JsonLD[] = [];
    const errors: string[] = [];

    for (const type of types) {
      try {
        const schema = this.generate(type, data);
        schemas.push(schema);
      } catch (error) {
        errors.push(`${type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (errors.length > 0 && schemas.length === 0) {
      throw new Error(`Failed to generate any schemas:\n${errors.join('\n')}`);
    }

    return schemas;
  }

  /**
   * Generate all applicable schemas for a product
   */
  generateAll(data: SchemaData): JsonLD[] {
    const applicableTypes = this.determineApplicableTypes(data);
    return this.generateMultiple(applicableTypes, data);
  }

  /**
   * Validate a schema using its template
   */
  validate(schema: JsonLD): ValidationResult {
    const schemaType = schema['@type'] as SchemaType;
    const template = this.templates.get(schemaType);

    if (!template) {
      return {
        valid: false,
        errors: [`Unknown schema type: ${schemaType}`],
        warnings: []
      };
    }

    return template.validate(schema);
  }

  /**
   * Get available schema types
   */
  getAvailableTypes(): SchemaType[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get template for a specific type
   */
  getTemplate(type: SchemaType): SchemaTemplate | undefined {
    return this.templates.get(type);
  }

  /**
   * Determine which schema types are applicable for the given data
   */
  private determineApplicableTypes(data: SchemaData): SchemaType[] {
    const types: SchemaType[] = [];

    // Always include SoftwareApplication for browser extensions
    types.push(SchemaType.SoftwareApplication);

    // Include FAQPage if questions are available
    if (data.questions && data.questions.length >= 2) {
      types.push(SchemaType.FAQPage);
    }

    // Include HowTo if steps are available
    if (data.steps && data.steps.length >= 2) {
      types.push(SchemaType.HowTo);
    }

    // Include BreadcrumbList if breadcrumbs are available
    if (data.breadcrumbs && data.breadcrumbs.length >= 2) {
      types.push(SchemaType.BreadcrumbList);
    }

    // Include Article if article data is available
    if (data.article && data.article.headline) {
      types.push(SchemaType.Article);
    }

    return types;
  }

  /**
   * Generate schema with auto-enhancement based on existing data
   */
  generateEnhanced(type: SchemaType, baseData: SchemaData, enhancements?: Partial<SchemaData>): JsonLD {
    const enhancedData = { ...baseData, ...enhancements };

    // Apply smart defaults based on product
    if (type === SchemaType.SoftwareApplication && !enhancedData.applicationCategory) {
      enhancedData.applicationCategory = 'BrowserApplication';
    }

    if (!enhancedData.currency) {
      enhancedData.currency = 'USD';
    }

    if (!enhancedData.price) {
      enhancedData.price = '0'; // Free extension
    }

    return this.generate(type, enhancedData);
  }

  /**
   * Bulk generate schemas for multiple products
   */
  generateBulk(products: Array<{ type: SchemaType; data: SchemaData }>): Array<{ success: boolean; schema?: JsonLD; error?: string }> {
    return products.map(({ type, data }) => {
      try {
        const schema = this.generate(type, data);
        return { success: true, schema };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  }
}