import { z } from 'zod';
import pino from 'pino';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * CSV Import Validation System
 * 
 * Validates CSV files before import to ensure data integrity
 * and compatibility with Google Ads requirements.
 */

// ============================================================================
// KEYWORD PLANNER CSV SCHEMAS
// ============================================================================

/**
 * Google Keyword Planner CSV row schema
 */
export const KeywordPlannerRowSchema = z.object({
  'Keyword': z.string().min(1).max(80),
  'Currency': z.string().optional(),
  'Avg. monthly searches': z.union([
    z.string(),
    z.number(),
    z.literal('–')
  ]).optional(),
  'Three month change': z.union([
    z.string(),
    z.number()
  ]).optional(),
  'YoY change': z.union([
    z.string(),
    z.number()
  ]).optional(),
  'Competition': z.enum(['Low', 'Medium', 'High', '']).optional(),
  'Competition (indexed value)': z.union([
    z.string(),
    z.number()
  ]).optional(),
  'Top of page bid (low range)': z.union([
    z.string(),
    z.number()
  ]).optional(),
  'Top of page bid (high range)': z.union([
    z.string(),
    z.number()
  ]).optional(),
  'Keyword Ideas': z.string().optional()
}).passthrough(); // Allow additional columns

/**
 * Alternative column mappings for different KWP export formats
 */
const COLUMN_MAPPINGS = {
  keyword: ['Keyword', 'Keyword text', 'Search term'],
  volume: ['Avg. monthly searches', 'Average monthly searches', 'Search volume'],
  competition: ['Competition', 'Competition level'],
  cpc_low: ['Top of page bid (low range)', 'Min bid', 'Low bid'],
  cpc_high: ['Top of page bid (high range)', 'Max bid', 'High bid']
};

// ============================================================================
// GOOGLE ADS EDITOR CSV SCHEMAS
// ============================================================================

/**
 * Google Ads Editor Campaign import schema
 */
export const EditorCampaignImportSchema = z.object({
  'Campaign': z.string().min(1).max(255),
  'Campaign Type': z.enum(['Search', 'Display', 'Shopping', 'Video']).optional(),
  'Status': z.enum(['Enabled', 'Paused', 'Removed']).optional(),
  'Budget': z.union([z.string(), z.number()]).optional(),
  'Budget Type': z.enum(['Daily', 'Monthly']).optional(),
  'Bid Strategy Type': z.string().optional(),
  'Networks': z.string().optional(),
  'Languages': z.string().optional(),
  'Location': z.string().optional()
}).passthrough();

/**
 * Google Ads Editor Keyword import schema
 */
export const EditorKeywordImportSchema = z.object({
  'Campaign': z.string().min(1),
  'Ad Group': z.string().min(1),
  'Keyword': z.string().min(1).max(80),
  'Match Type': z.enum(['Exact', 'Phrase', 'Broad']).optional(),
  'Status': z.enum(['Enabled', 'Paused', 'Removed']).optional(),
  'Max CPC': z.union([z.string(), z.number()]).optional(),
  'Final URL': z.string().url().optional()
}).passthrough();

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: ValidationStats;
  data?: any[];
}

export interface ValidationError {
  row: number;
  column: string;
  value: any;
  message: string;
}

export interface ValidationWarning {
  row: number;
  column: string;
  value: any;
  message: string;
}

export interface ValidationStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  missingValues: Record<string, number>;
}

/**
 * Validates Keyword Planner CSV data
 */
export function validateKeywordPlannerCsv(csvPath: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const stats: ValidationStats = {
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    warningRows: 0,
    missingValues: {}
  };
  
  try {
    // Read and parse CSV
    const csvContent = readFileSync(csvPath, 'utf-8');
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    stats.totalRows = rows.length;
    const validatedRows: any[] = [];
    
    // Validate each row
    rows.forEach((row: any, index: number) => {
      const rowNum = index + 2; // Account for header row
      
      try {
        // Normalize column names
        const normalizedRow = normalizeKwpRow(row);
        
        // Validate against schema
        const validated = KeywordPlannerRowSchema.parse(normalizedRow);
        
        // Check for data quality issues
        checkKwpDataQuality(validated, rowNum, warnings, stats);
        
        validatedRows.push(validated);
        stats.validRows++;
        
      } catch (error) {
        stats.errorRows++;
        
        if (error instanceof z.ZodError) {
          error.errors.forEach(err => {
            errors.push({
              row: rowNum,
              column: err.path.join('.'),
              value: row[err.path[0]],
              message: err.message
            });
          });
        }
      }
    });
    
    // Calculate warning rows
    stats.warningRows = new Set(warnings.map(w => w.row)).size;
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
      data: validatedRows
    };
    
  } catch (error) {
    logger.error({ error, csvPath }, 'Failed to validate CSV file');
    
    return {
      valid: false,
      errors: [{
        row: 0,
        column: 'file',
        value: csvPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      }],
      warnings: [],
      stats
    };
  }
}

/**
 * Validates Google Ads Editor import CSV
 */
export function validateEditorImportCsv(
  csvPath: string,
  type: 'campaigns' | 'keywords' | 'ads'
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const stats: ValidationStats = {
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    warningRows: 0,
    missingValues: {}
  };
  
  try {
    // Read and parse CSV
    const csvContent = readFileSync(csvPath, 'utf-8');
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    stats.totalRows = rows.length;
    const validatedRows: any[] = [];
    
    // Select appropriate schema
    const schema = type === 'campaigns' ? EditorCampaignImportSchema :
                   type === 'keywords' ? EditorKeywordImportSchema :
                   null;
    
    if (!schema) {
      throw new Error(`Unsupported import type: ${type}`);
    }
    
    // Validate each row
    rows.forEach((row: any, index: number) => {
      const rowNum = index + 2;
      
      try {
        const validated = schema.parse(row);
        
        // Check for Google Ads specific issues
        checkEditorDataQuality(validated, type, rowNum, warnings, stats);
        
        validatedRows.push(validated);
        stats.validRows++;
        
      } catch (error) {
        stats.errorRows++;
        
        if (error instanceof z.ZodError) {
          error.errors.forEach(err => {
            errors.push({
              row: rowNum,
              column: err.path.join('.'),
              value: row[err.path[0]],
              message: err.message
            });
          });
        }
      }
    });
    
    stats.warningRows = new Set(warnings.map(w => w.row)).size;
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
      data: validatedRows
    };
    
  } catch (error) {
    logger.error({ error, csvPath, type }, 'Failed to validate Editor import CSV');
    
    return {
      valid: false,
      errors: [{
        row: 0,
        column: 'file',
        value: csvPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      }],
      warnings: [],
      stats
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalizes KWP row by mapping various column formats
 */
function normalizeKwpRow(row: any): any {
  const normalized: any = {};
  
  // Copy all original fields
  Object.assign(normalized, row);
  
  // Map alternative column names to standard names
  for (const [standard, alternatives] of Object.entries(COLUMN_MAPPINGS)) {
    for (const alt of alternatives) {
      if (row[alt] !== undefined && normalized[alternatives[0]] === undefined) {
        normalized[alternatives[0]] = row[alt];
      }
    }
  }
  
  return normalized;
}

/**
 * Checks KWP data quality and generates warnings
 */
function checkKwpDataQuality(
  row: any,
  rowNum: number,
  warnings: ValidationWarning[],
  stats: ValidationStats
): void {
  // Check for missing volume data
  if (!row['Avg. monthly searches'] || row['Avg. monthly searches'] === '–') {
    warnings.push({
      row: rowNum,
      column: 'Avg. monthly searches',
      value: row['Avg. monthly searches'],
      message: 'Missing search volume data'
    });
    stats.missingValues['volume'] = (stats.missingValues['volume'] || 0) + 1;
  }
  
  // Check for missing CPC data
  if (!row['Top of page bid (low range)']) {
    warnings.push({
      row: rowNum,
      column: 'Top of page bid (low range)',
      value: null,
      message: 'Missing CPC data'
    });
    stats.missingValues['cpc'] = (stats.missingValues['cpc'] || 0) + 1;
  }
  
  // Check for unrealistic values
  const volume = parseFloat(row['Avg. monthly searches']);
  if (volume > 10000000) {
    warnings.push({
      row: rowNum,
      column: 'Avg. monthly searches',
      value: volume,
      message: 'Unusually high search volume (>10M)'
    });
  }
  
  // Check keyword length
  if (row['Keyword'] && row['Keyword'].length > 50) {
    warnings.push({
      row: rowNum,
      column: 'Keyword',
      value: row['Keyword'],
      message: 'Keyword exceeds recommended length (50 chars)'
    });
  }
}

/**
 * Checks Google Ads Editor data quality
 */
function checkEditorDataQuality(
  row: any,
  type: string,
  rowNum: number,
  warnings: ValidationWarning[],
  stats: ValidationStats
): void {
  if (type === 'campaigns') {
    // Check budget
    const budget = parseFloat(row['Budget']);
    if (budget && budget < 1) {
      warnings.push({
        row: rowNum,
        column: 'Budget',
        value: budget,
        message: 'Budget below minimum ($1)'
      });
    }
    if (budget && budget > 10000) {
      warnings.push({
        row: rowNum,
        column: 'Budget',
        value: budget,
        message: 'Very high daily budget (>$10,000)'
      });
    }
  }
  
  if (type === 'keywords') {
    // Check keyword format
    const keyword = row['Keyword'];
    if (keyword) {
      if (keyword.includes('[') && !keyword.endsWith(']')) {
        warnings.push({
          row: rowNum,
          column: 'Keyword',
          value: keyword,
          message: 'Malformed exact match keyword'
        });
      }
      if (keyword.includes('"') && (keyword.match(/"/g) || []).length !== 2) {
        warnings.push({
          row: rowNum,
          column: 'Keyword',
          value: keyword,
          message: 'Malformed phrase match keyword'
        });
      }
    }
    
    // Check CPC
    const cpc = parseFloat(row['Max CPC']);
    if (cpc && cpc > 100) {
      warnings.push({
        row: rowNum,
        column: 'Max CPC',
        value: cpc,
        message: 'Very high Max CPC (>$100)'
      });
    }
  }
}

/**
 * Batch validation function for multiple CSV files
 */
export async function validateBatch(
  files: Array<{ path: string; type: 'kwp' | 'campaigns' | 'keywords' | 'ads' }>
): Promise<Record<string, ValidationResult>> {
  const results: Record<string, ValidationResult> = {};
  
  for (const file of files) {
    logger.info(`Validating ${file.type} CSV: ${file.path}`);
    
    if (file.type === 'kwp') {
      results[file.path] = validateKeywordPlannerCsv(file.path);
    } else {
      results[file.path] = validateEditorImportCsv(file.path, file.type);
    }
  }
  
  // Log summary
  const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);
  
  logger.info({
    filesValidated: files.length,
    totalErrors,
    totalWarnings
  }, 'Batch validation complete');
  
  return results;
}

/**
 * Generates validation report
 */
export function generateValidationReport(results: Record<string, ValidationResult>): string {
  let report = '# CSV Validation Report\n\n';
  
  for (const [file, result] of Object.entries(results)) {
    report += `## ${file}\n\n`;
    report += `- **Status**: ${result.valid ? '✅ Valid' : '❌ Invalid'}\n`;
    report += `- **Total Rows**: ${result.stats.totalRows}\n`;
    report += `- **Valid Rows**: ${result.stats.validRows}\n`;
    report += `- **Error Rows**: ${result.stats.errorRows}\n`;
    report += `- **Warning Rows**: ${result.stats.warningRows}\n\n`;
    
    if (result.errors.length > 0) {
      report += '### Errors\n\n';
      result.errors.slice(0, 10).forEach(err => {
        report += `- Row ${err.row}, Column "${err.column}": ${err.message}\n`;
      });
      if (result.errors.length > 10) {
        report += `- ... and ${result.errors.length - 10} more errors\n`;
      }
      report += '\n';
    }
    
    if (result.warnings.length > 0) {
      report += '### Warnings\n\n';
      result.warnings.slice(0, 10).forEach(warn => {
        report += `- Row ${warn.row}, Column "${warn.column}": ${warn.message}\n`;
      });
      if (result.warnings.length > 10) {
        report += `- ... and ${result.warnings.length - 10} more warnings\n`;
      }
      report += '\n';
    }
    
    if (Object.keys(result.stats.missingValues).length > 0) {
      report += '### Missing Values Summary\n\n';
      for (const [field, count] of Object.entries(result.stats.missingValues)) {
        report += `- ${field}: ${count} rows\n`;
      }
      report += '\n';
    }
  }
  
  return report;
}