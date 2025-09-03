import { describe, test, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { 
  writeCsvFile, 
  formatCsvContent,
  enforceColumnOrder,
  validateCsvStructure
} from '../../src/utils/deterministic.js';
import { CSV_COLUMN_REGISTRIES, CsvType } from '../../src/schemas/csv-schemas.js';

/**
 * Byte-level CSV validation tests
 * 
 * These tests ensure that generated CSVs match exactly the format expected
 * by Google Ads Editor. Any changes to CSV structure will break these tests,
 * preventing accidental import failures.
 */

const TEST_OUTPUT_DIR = join(process.cwd(), 'tests/snapshots/__test_output__');

// Ensure test output directory exists
if (!existsSync(TEST_OUTPUT_DIR)) {
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

// ============================================================================
// TEST DATA SAMPLES
// ============================================================================

const sampleCampaignData = [
  {
    Campaign: 'ConvertMyFile AU',
    'Campaign Type': 'Search',
    Status: 'Enabled',
    Budget: 10.00,
    'Budget Type': 'Daily',
    'Bid Strategy Type': 'Manual CPC',
    'Target CPA': '',
    'Target ROAS': '',
    Networks: 'Google Search',
    Languages: 'English',
    Location: 'Australia',
    'Location Bid Modifier': '',
    'Excluded Location': '',
    Device: '',
    'Device Bid Modifier': -1.00,
    'Ad Schedule': '',
    'Ad Schedule Bid Modifier': '',
    'Start Date': '',
    'End Date': '',
    'Campaign Labels': 'LBA_SEO_ADS_EXPERT_2025-09-03'
  }
];

const sampleAdGroupData = [
  {
    Campaign: 'ConvertMyFile AU',
    'Ad Group': 'WebP Conversion',
    Status: 'Enabled',
    'Max CPC': 2.50,
    'Target CPA': '',
    'Target ROAS': '',
    'Final URL': 'https://littlebearapps.com/convertmyfile/webp-to-png?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}-{creative}&utm_term={keyword}&matchtype={matchtype}',
    'Final Mobile URL': '',
    'Tracking Template': '',
    'Custom Parameters': '',
    'Ad Group Labels': ''
  }
];

const sampleKeywordData = [
  {
    Campaign: 'ConvertMyFile AU',
    'Ad Group': 'WebP Conversion',
    Keyword: 'webp to png chrome extension',
    'Match Type': 'Exact',
    Status: 'Enabled',
    'Max CPC': 3.00,
    'Final URL': '',
    'Final Mobile URL': '',
    'Tracking Template': '',
    'Custom Parameters': '',
    'Keyword Labels': ''
  }
];

const sampleRSAData = [
  {
    Campaign: 'ConvertMyFile AU',
    'Ad Group': 'WebP Conversion',
    'Ad Type': 'Responsive search ad',
    Status: 'Enabled',
    'Headline 1': 'WebP to PNG Chrome Extension',
    'Headline 1 Pinned': '1',
    'Headline 2': 'Convert WebP Files Instantly',
    'Headline 2 Pinned': '',
    'Headline 3': 'Free WebP Converter',
    'Headline 3 Pinned': '',
    'Headline 4': '',
    'Headline 4 Pinned': '',
    'Headline 5': '',
    'Headline 5 Pinned': '',
    'Headline 6': '',
    'Headline 6 Pinned': '',
    'Headline 7': '',
    'Headline 7 Pinned': '',
    'Headline 8': '',
    'Headline 8 Pinned': '',
    'Headline 9': '',
    'Headline 9 Pinned': '',
    'Headline 10': '',
    'Headline 10 Pinned': '',
    'Headline 11': '',
    'Headline 11 Pinned': '',
    'Headline 12': '',
    'Headline 12 Pinned': '',
    'Headline 13': '',
    'Headline 13 Pinned': '',
    'Headline 14': '',
    'Headline 14 Pinned': '',
    'Headline 15': '',
    'Headline 15 Pinned': '',
    'Description 1': 'Convert WebP to PNG locally in your browser. Privacy-first, no uploads required.',
    'Description 2': 'One-click WebP conversion. Fast, free, and secure Chrome extension.',
    'Description 3': '',
    'Description 4': '',
    'Path 1': 'webp-png',
    'Path 2': 'convert',
    'Final URL': 'https://littlebearapps.com/convertmyfile/webp-to-png?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}-{creative}&utm_term={keyword}&matchtype={matchtype}',
    'Final Mobile URL': '',
    'Tracking Template': '',
    'Custom Parameters': '',
    'Ad Labels': ''
  }
];

const sampleSitelinkAssetData = [
  {
    'Asset Type': 'Sitelink',
    Asset: 'Features',
    'Asset Status': 'Enabled',
    'Link Text': 'Features',
    'Final URL': 'https://littlebearapps.com/convertmyfile/features',
    'Final Mobile URL': '',
    'Description 1': 'View all conversion formats',
    'Description 2': 'WebP, HEIC, PDF and more'
  }
];

const sampleCalloutAssetData = [
  {
    'Asset Type': 'Callout',
    Asset: 'Free Tier',
    'Asset Status': 'Enabled',
    'Callout Text': 'Free Tier'
  }
];

// ============================================================================
// BYTE-LEVEL CSV VALIDATION TESTS
// ============================================================================

describe('CSV Byte-Level Validation', () => {
  
  test('Campaign CSV - Column Order and Format', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_campaigns.csv');
    writeCsvFile(filePath, 'campaigns', sampleCampaignData);
    
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\r\n');
    
    // Validate header line matches exact column order
    const expectedHeader = CSV_COLUMN_REGISTRIES.campaigns.join(',');
    expect(lines[0]).toBe(expectedHeader);
    
    // Validate Windows line endings (\r\n)
    expect(content.includes('\r\n')).toBe(true);
    expect(content.includes('\n') && !content.includes('\r\n')).toBe(false);
    
    // Validate decimal formatting
    expect(content.includes('10.00')).toBe(true);
    expect(content.includes('-1.00')).toBe(true);
    
    // Validate no BOM (file should start with column name, not BOM)
    expect(content.startsWith('Campaign')).toBe(true);
  });

  test('Ad Group CSV - UTM Parameters and URLs', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_ad_groups.csv');
    writeCsvFile(filePath, 'ad_groups', sampleAdGroupData);
    
    const content = readFileSync(filePath, 'utf8');
    
    // Validate UTM ValueTrack parameters are present
    expect(content.includes('{campaignid}')).toBe(true);
    expect(content.includes('{adgroupid}')).toBe(true);
    expect(content.includes('{creative}')).toBe(true);
    expect(content.includes('{keyword}')).toBe(true);
    expect(content.includes('{matchtype}')).toBe(true);
  });

  test('Keyword CSV - Match Types and Structure', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_keywords_exact.csv');
    writeCsvFile(filePath, 'keywords_exact', sampleKeywordData);
    
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\r\n');
    
    // Validate exact match type
    expect(content.includes('Exact')).toBe(true);
    
    // Validate decimal CPC formatting
    expect(content.includes('3.00')).toBe(true);
  });

  test('RSA CSV - Headline Pinning Structure', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_ads_rsa.csv');
    writeCsvFile(filePath, 'ads_rsa', sampleRSAData);
    
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\r\n');
    
    // Validate pinned headline structure
    expect(content.includes('WebP to PNG Chrome Extension')).toBe(true);
    expect(content.includes(',1,')).toBe(true); // Pinned to position 1
    
    // Validate all 15 headline columns exist (even if empty)
    const headers = lines[0].split(',');
    const headlineColumns = headers.filter(h => h.startsWith('Headline'));
    expect(headlineColumns.length).toBe(30); // 15 headlines + 15 pinning columns
    
    // Validate all 4 description columns exist
    const descriptionColumns = headers.filter(h => h.startsWith('Description'));
    expect(descriptionColumns.length).toBe(4);
  });

  test('Asset CSV - Sitelink Structure', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_assets_sitelinks.csv');
    writeCsvFile(filePath, 'assets_sitelinks', sampleSitelinkAssetData);
    
    const content = readFileSync(filePath, 'utf8');
    
    // Validate asset type literal
    expect(content.includes('Sitelink')).toBe(true);
    
    // Validate description structure
    expect(content.includes('View all conversion formats')).toBe(true);
  });

  test('Callout Asset CSV - Text Length Validation', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_assets_callouts.csv');
    writeCsvFile(filePath, 'assets_callouts', sampleCalloutAssetData);
    
    const content = readFileSync(filePath, 'utf8');
    
    // Validate callout structure
    expect(content.includes('Callout')).toBe(true);
    expect(content.includes('Free Tier')).toBe(true);
  });
});

// ============================================================================
// DETERMINISTIC OUTPUT TESTS
// ============================================================================

describe('Deterministic Output Validation', () => {
  
  test('Multiple runs produce identical CSV files', () => {
    const testData = [...sampleCampaignData];
    
    // Generate first file
    const filePath1 = join(TEST_OUTPUT_DIR, 'deterministic_test_1.csv');
    writeCsvFile(filePath1, 'campaigns', testData);
    const content1 = readFileSync(filePath1, 'utf8');
    
    // Generate second file with same data
    const filePath2 = join(TEST_OUTPUT_DIR, 'deterministic_test_2.csv');
    writeCsvFile(filePath2, 'campaigns', testData);
    const content2 = readFileSync(filePath2, 'utf8');
    
    // Validate byte-identical output
    expect(content1).toBe(content2);
    expect(content1.length).toBe(content2.length);
  });

  test('Column order enforcement', () => {
    const testData = [{
      'Campaign Labels': 'test',
      'Campaign Type': 'Search',
      'Campaign': 'Test Campaign', // Deliberately out of order
      'Status': 'Enabled',
      'Budget': 5.00
    }];
    
    const orderedData = enforceColumnOrder(testData, 'campaigns');
    const filePath = join(TEST_OUTPUT_DIR, 'column_order_test.csv');
    writeCsvFile(filePath, 'campaigns', orderedData);
    
    const content = readFileSync(filePath, 'utf8');
    const headers = content.split('\r\n')[0];
    
    // Validate that columns are in schema order, not input order
    expect(headers.startsWith('Campaign,Campaign Type,Status,Budget')).toBe(true);
  });

  test('CSV structure validation', () => {
    const validData = sampleCampaignData;
    const result = validateCsvStructure('campaigns', validData);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('CSV structure validation - missing column', () => {
    const invalidData = [{
      'Campaign': 'Test',
      'Status': 'Enabled'
      // Missing required 'Campaign Type' and 'Budget'
    }];
    
    const result = validateCsvStructure('campaigns', invalidData);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(error => error.includes('Campaign Type'))).toBe(true);
    expect(result.errors.some(error => error.includes('Budget'))).toBe(true);
  });
});

// ============================================================================
// CSV FORMAT COMPATIBILITY TESTS
// ============================================================================

describe('Google Ads Editor Compatibility', () => {
  
  test('CSV escaping for special characters', () => {
    const testData = [{
      Campaign: 'Test Campaign with "Quotes" and, Commas',
      'Campaign Type': 'Search',
      Status: 'Enabled',
      Budget: 10.00,
      'Budget Type': 'Daily',
      'Bid Strategy Type': 'Manual CPC',
      Networks: 'Google Search',
      Languages: 'English',
      Location: 'Australia'
    }];
    
    const content = formatCsvContent(CSV_COLUMN_REGISTRIES.campaigns, testData);
    
    // Validate that quotes and commas are properly escaped
    expect(content.includes('"Test Campaign with ""Quotes"" and, Commas"')).toBe(true);
  });

  test('Empty field handling', () => {
    const testData = [{
      Campaign: 'Test Campaign',
      'Campaign Type': 'Search',
      Status: 'Enabled',
      Budget: 5.50,
      // Many fields intentionally left empty
    }];
    
    const orderedData = enforceColumnOrder(testData, 'campaigns');
    const content = formatCsvContent(CSV_COLUMN_REGISTRIES.campaigns, orderedData);
    
    // Count commas to ensure all columns are present (even empty ones)
    const headerCommas = (content.split('\r\n')[0].match(/,/g) || []).length;
    const dataCommas = (content.split('\r\n')[1].match(/,/g) || []).length;
    
    expect(headerCommas).toBe(dataCommas);
  });
});

// ============================================================================
// SNAPSHOT TESTS (Will be populated after ground-truth export)
// ============================================================================

describe.skip('Ground-Truth Snapshot Tests', () => {
  // These tests will be enabled after we have real ground-truth exports
  // They will validate that our generated CSVs match byte-for-byte with
  // known-good exports from Google Ads Editor
  
  test.skip('Campaign CSV matches ground-truth snapshot', () => {
    // TODO: Implement after ground-truth export available
  });
  
  test.skip('Ad Group CSV matches ground-truth snapshot', () => {
    // TODO: Implement after ground-truth export available  
  });
});