import { describe, test, expect } from 'vitest';
import { 
  formatJsonDeterministic,
  fixDecimals,
  fixObjectDecimals,
  sortKeywords
} from '../../src/utils/deterministic.js';
import { CSV_COLUMN_REGISTRIES, SCHEMA_METADATA } from '../../src/schemas/csv-schemas.js';

/**
 * Basic validation tests for Task 1 completion
 * 
 * These tests validate the core functionality is working correctly.
 */

describe('Task 1: Ground-Truth Schema & Data Contracts', () => {
  
  test('CSV schemas are properly defined', () => {
    // Validate that all expected CSV types have column registries
    expect(CSV_COLUMN_REGISTRIES.campaigns).toBeDefined();
    expect(CSV_COLUMN_REGISTRIES.ad_groups).toBeDefined();
    expect(CSV_COLUMN_REGISTRIES.keywords_exact).toBeDefined();
    expect(CSV_COLUMN_REGISTRIES.ads_rsa).toBeDefined();
    expect(CSV_COLUMN_REGISTRIES.assets_sitelinks).toBeDefined();
    
    // Validate campaign columns include required fields
    expect(CSV_COLUMN_REGISTRIES.campaigns).toContain('Campaign');
    expect(CSV_COLUMN_REGISTRIES.campaigns).toContain('Campaign Type');
    expect(CSV_COLUMN_REGISTRIES.campaigns).toContain('Status');
    expect(CSV_COLUMN_REGISTRIES.campaigns).toContain('Budget');
  });

  test('Schema metadata is correctly configured', () => {
    expect(SCHEMA_METADATA.version).toBe('1.1.0');
    expect(SCHEMA_METADATA.lastUpdated).toBe('2025-09-03');
    expect(SCHEMA_METADATA.columnCount.campaigns).toBe(CSV_COLUMN_REGISTRIES.campaigns.length);
    expect(SCHEMA_METADATA.requiredFields.campaigns).toContain('Campaign');
  });

  test('Decimal precision fixing works correctly', () => {
    expect(fixDecimals(8.7346789)).toBe('8.73');
    expect(fixDecimals(1250.454545)).toBe('1250.45');
    expect(fixDecimals(2.4)).toBe('2.40');
    expect(fixDecimals(0.7333333)).toBe('0.73');
  });

  test('Object decimal fixing preserves structure', () => {
    const testObj = {
      score: 8.7346789,
      volume: 1250.454545,
      nested: {
        rate: 0.7333333
      }
    };
    
    const fixed = fixObjectDecimals(testObj);
    expect(fixed.score).toBe('8.73');
    expect(fixed.volume).toBe('1250.45');
    expect(fixed.nested.rate).toBe('0.73');
  });

  test('Keyword sorting works correctly', () => {
    const keywords = [
      { keyword: "zebra", final_score: 5.0, market: "US" },
      { keyword: "alpha", final_score: 8.0, market: "AU" },
      { keyword: "beta", final_score: 6.0, market: "GB" }
    ];
    
    const sorted = sortKeywords(keywords);
    
    // Should be sorted by score descending
    expect(sorted[0].final_score).toBe(8.0);
    expect(sorted[1].final_score).toBe(6.0);
    expect(sorted[2].final_score).toBe(5.0);
    
    // Highest score should have keyword "alpha"
    expect(sorted[0].keyword).toBe("alpha");
  });

  test('JSON output is deterministic', () => {
    const testObj = {
      version: "1.1.0",
      score: 8.7346789,
      keywords: ["zebra", "alpha", "beta"],
      metadata: {
        timestamp: "2025-09-03T10:30:00.000Z",
        rate: 0.7333333
      }
    };
    
    const json1 = formatJsonDeterministic(testObj);
    const json2 = formatJsonDeterministic(testObj);
    
    // Should be identical
    expect(json1).toBe(json2);
    
    // Should have fixed decimals
    expect(json1.includes('8.73')).toBe(true);
    expect(json1.includes('0.73')).toBe(true);
    
    // Should end with newline
    expect(json1.endsWith('\n')).toBe(true);
    
    // Should be valid JSON
    expect(() => JSON.parse(json1)).not.toThrow();
  });

  test('RSA schema includes all headline and description fields', () => {
    const rsaColumns = CSV_COLUMN_REGISTRIES.ads_rsa;
    
    // Should have 15 headline fields
    const headlineFields = rsaColumns.filter(col => col.startsWith('Headline') && !col.includes('Pinned'));
    expect(headlineFields.length).toBe(15);
    
    // Should have 15 pinning fields
    const pinningFields = rsaColumns.filter(col => col.includes('Headline') && col.includes('Pinned'));
    expect(pinningFields.length).toBe(15);
    
    // Should have 4 description fields
    const descriptionFields = rsaColumns.filter(col => col.startsWith('Description'));
    expect(descriptionFields.length).toBe(4);
    
    // Should have required fields
    expect(rsaColumns).toContain('Campaign');
    expect(rsaColumns).toContain('Ad Group');
    expect(rsaColumns).toContain('Ad Type');
    expect(rsaColumns).toContain('Final URL');
  });

  test('Asset schemas include proper asset types', () => {
    // Sitelink assets
    expect(CSV_COLUMN_REGISTRIES.assets_sitelinks).toContain('Asset Type');
    expect(CSV_COLUMN_REGISTRIES.assets_sitelinks).toContain('Link Text');
    expect(CSV_COLUMN_REGISTRIES.assets_sitelinks).toContain('Final URL');
    
    // Callout assets
    expect(CSV_COLUMN_REGISTRIES.assets_callouts).toContain('Asset Type');
    expect(CSV_COLUMN_REGISTRIES.assets_callouts).toContain('Callout Text');
    
    // Structured snippet assets
    expect(CSV_COLUMN_REGISTRIES.assets_structured).toContain('Asset Type');
    expect(CSV_COLUMN_REGISTRIES.assets_structured).toContain('Header');
    expect(CSV_COLUMN_REGISTRIES.assets_structured).toContain('Values');
  });

  test('Shared negatives schema is properly defined', () => {
    expect(CSV_COLUMN_REGISTRIES.shared_negatives).toContain('Shared Set');
    expect(CSV_COLUMN_REGISTRIES.shared_negatives).toContain('Shared Set Type');
    expect(CSV_COLUMN_REGISTRIES.shared_negatives).toContain('Status');
    
    expect(CSV_COLUMN_REGISTRIES.negative_associations).toContain('Campaign');
    expect(CSV_COLUMN_REGISTRIES.negative_associations).toContain('Shared Set');
    expect(CSV_COLUMN_REGISTRIES.negative_associations).toContain('Status');
  });
});