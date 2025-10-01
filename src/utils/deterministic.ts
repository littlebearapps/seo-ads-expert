import { writeFileSync } from 'fs';
import { CSV_COLUMN_REGISTRIES, CsvType } from '../schemas/csv-schemas.js';

/**
 * Deterministic Output Utilities
 * 
 * Ensures byte-identical outputs across multiple runs for meaningful diffs
 * and Windows-compatible CSV formats for Google Ads Editor imports.
 */

// ============================================================================
// DECIMAL PRECISION CONTROL
// ============================================================================

/**
 * Fix decimal precision to exactly 2 places for consistent output
 */
export function fixDecimals(value: number, precision: number = 2): string {
  return Number(value).toFixed(precision);
}

/**
 * Fix decimals for all numeric values in an object
 * Converts numbers to fixed-precision strings for deterministic output
 */
export function fixObjectDecimals<T extends Record<string, any>>(obj: T, precision: number = 2): T {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'number') {
      // Convert to fixed-precision string for deterministic output
      result[key] = fixDecimals(value, precision) as any;
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'number' ?
          fixDecimals(item, precision) :
        typeof item === 'object' && item !== null ? fixObjectDecimals(item, precision) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = fixObjectDecimals(value, precision);
    }
  }

  return result;
}

// ============================================================================
// ARRAY SORTING FOR CONSISTENT ORDERING
// ============================================================================

/**
 * Sort arrays recursively for consistent ordering
 */
export function sortArraysRecursively<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj
      .map(item => sortArraysRecursively(item))
      .sort((a, b) => {
        // Sort by string representation for consistent ordering
        const aStr = typeof a === 'object' ? JSON.stringify(a) : String(a);
        const bStr = typeof b === 'object' ? JSON.stringify(b) : String(b);
        return aStr.localeCompare(bStr);
      }) as T;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result = {} as T;
    // Sort object keys for consistent property ordering
    const sortedKeys = Object.keys(obj).sort();
    
    for (const key of sortedKeys) {
      (result as any)[key] = sortArraysRecursively((obj as any)[key]);
    }
    
    return result;
  }
  
  return obj;
}

/**
 * Sort keywords by: score desc → alphabetically → market
 */
export function sortKeywords(keywords: any[]): any[] {
  return keywords.sort((a, b) => {
    // Primary: Score descending
    if (a.final_score !== b.final_score) {
      return b.final_score - a.final_score;
    }
    
    // Secondary: Alphabetical
    if (a.keyword !== b.keyword) {
      return a.keyword.localeCompare(b.keyword);
    }
    
    // Tertiary: Market
    return (a.market || '').localeCompare(b.market || '');
  });
}

/**
 * Sort campaigns → ad groups → keywords → assets hierarchy
 */
export function sortCampaignHierarchy(data: any): any {
  const result = { ...data };
  
  // Sort campaigns
  if (result.campaigns) {
    result.campaigns = result.campaigns.sort((a: any, b: any) => 
      a.name.localeCompare(b.name)
    );
  }
  
  // Sort ad groups within campaigns
  if (result.ad_groups) {
    result.ad_groups = result.ad_groups.sort((a: any, b: any) => {
      // Primary: Campaign name
      if (a.campaign !== b.campaign) {
        return a.campaign.localeCompare(b.campaign);
      }
      // Secondary: Ad group name
      return a.name.localeCompare(b.name);
    });
  }
  
  // Sort keywords
  if (result.keywords) {
    result.keywords = sortKeywords(result.keywords);
  }
  
  // Sort assets by type and name
  if (result.assets) {
    result.assets = result.assets.sort((a: any, b: any) => {
      // Primary: Asset type
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      // Secondary: Asset name/text
      return (a.text || a.name || '').localeCompare(b.text || b.name || '');
    });
  }
  
  return result;
}

// ============================================================================
// CSV FORMATTING AND ENCODING
// ============================================================================

/**
 * Enforce exact column order for CSV output based on ground-truth schema
 */
export function enforceColumnOrder<T extends Record<string, any>>(
  data: T[], 
  csvType: CsvType
): Record<string, any>[] {
  const columns = CSV_COLUMN_REGISTRIES[csvType];
  
  return data.map(row => {
    const orderedRow: Record<string, any> = {};
    
    // Add columns in exact schema order
    for (const column of columns) {
      orderedRow[column] = row[column] || '';
    }
    
    return orderedRow;
  });
}

/**
 * Generate UTF-8 CSV content with Windows line endings (\r\n) and no BOM
 */
export function formatCsvContent(headers: readonly string[], rows: Record<string, any>[]): string {
  const lines: string[] = [];
  
  // Add header row
  lines.push(headers.join(','));
  
  // Add data rows
  for (const row of rows) {
    const values = headers.map(header => {
      let value = row[header] || '';
      
      // Handle numeric values with consistent decimal places
      if (typeof value === 'number') {
        value = fixDecimals(value);
      }
      
      // Escape CSV values that contain commas, quotes, or newlines
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    });
    
    lines.push(values.join(','));
  }
  
  // Use Windows line endings for Ads Editor compatibility
  return lines.join('\r\n') + '\r\n';
}

/**
 * Write CSV file with deterministic formatting
 */
export function writeCsvFile(
  filePath: string, 
  csvType: CsvType, 
  data: Record<string, any>[]
): void {
  const columns = CSV_COLUMN_REGISTRIES[csvType];
  const orderedData = enforceColumnOrder(data, csvType);
  const content = formatCsvContent(columns, orderedData);
  
  // Write as UTF-8 without BOM
  writeFileSync(filePath, content, { encoding: 'utf8' });
}

// ============================================================================
// JSON FORMATTING FOR DETERMINISTIC OUTPUT
// ============================================================================

/**
 * Generate deterministic JSON string with consistent formatting
 */
export function formatJsonDeterministic(obj: any): string {
  // Apply decimal fixing and sorting
  const processedObj = sortArraysRecursively(fixObjectDecimals(obj));
  
  // Use consistent JSON formatting (2-space indentation)
  return JSON.stringify(processedObj, null, 2) + '\n';
}

/**
 * Write JSON file with deterministic formatting
 */
export function writeJsonFile(filePath: string, data: any): void {
  const content = formatJsonDeterministic(data);
  writeFileSync(filePath, content, { encoding: 'utf8' });
}

// ============================================================================
// MARKDOWN FORMATTING
// ============================================================================

/**
 * Ensure consistent markdown formatting for deterministic output
 */
export function formatMarkdownDeterministic(content: string): string {
  return content
    .replace(/\r\n/g, '\n') // Normalize line endings to \n for markdown
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines to double
    .trim() + '\n'; // Ensure single trailing newline
}

/**
 * Write markdown file with deterministic formatting
 */
export function writeMarkdownFile(filePath: string, content: string): void {
  const formattedContent = formatMarkdownDeterministic(content);
  writeFileSync(filePath, formattedContent, { encoding: 'utf8' });
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that two objects produce identical JSON output
 */
export function areObjectsIdentical(obj1: any, obj2: any): boolean {
  const json1 = formatJsonDeterministic(obj1);
  const json2 = formatJsonDeterministic(obj2);
  return json1 === json2;
}

/**
 * Validate that CSV data matches expected column structure
 */
export function validateCsvStructure(csvType: CsvType, data: Record<string, any>[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const expectedColumns = CSV_COLUMN_REGISTRIES[csvType];
  
  if (data.length === 0) {
    return { valid: true, errors: [] };
  }
  
  const actualColumns = Object.keys(data[0]);
  
  // Check for missing required columns
  for (const column of expectedColumns) {
    if (!actualColumns.includes(column)) {
      errors.push(`Missing required column: ${column}`);
    }
  }
  
  // Check for unexpected columns
  for (const column of actualColumns) {
    if (!expectedColumns.includes(column as any)) {
      errors.push(`Unexpected column: ${column}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

export interface DeterministicOutputSummary {
  timestamp: string;
  csvFiles: {
    type: CsvType;
    rowCount: number;
    columnCount: number;
    filePath: string;
  }[];
  jsonFiles: {
    name: string;
    filePath: string;
    size: number;
  }[];
  totalFiles: number;
  processingTimeMs: number;
}

/**
 * Generate summary of deterministic output process
 */
export function generateOutputSummary(
  startTime: number,
  csvFiles: Array<{ type: CsvType; rowCount: number; filePath: string }>,
  jsonFiles: Array<{ name: string; filePath: string; size: number }>
): DeterministicOutputSummary {
  return {
    timestamp: new Date().toISOString(),
    csvFiles: csvFiles.map(file => ({
      ...file,
      columnCount: CSV_COLUMN_REGISTRIES[file.type].length
    })),
    jsonFiles,
    totalFiles: csvFiles.length + jsonFiles.length,
    processingTimeMs: Date.now() - startTime
  };
}