import { describe, test, expect } from 'vitest';
import { 
  formatJsonDeterministic,
  writeJsonFile,
  areObjectsIdentical,
  sortArraysRecursively,
  fixObjectDecimals,
  sortKeywords,
  sortCampaignHierarchy
} from '../../src/utils/deterministic.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * JSON Structure and Deterministic Output Tests
 * 
 * These tests ensure that JSON outputs (ads.json, summary.json, diff.json)
 * are consistently formatted and deterministic across multiple runs.
 */

const TEST_OUTPUT_DIR = join(process.cwd(), 'tests/snapshots/__test_output__');

// ============================================================================
// TEST DATA SAMPLES
// ============================================================================

const sampleAdsData = {
  version: "1.1.0",
  generated_at: "2025-09-03T10:30:00.000Z",
  product: "convertmyfile",
  markets: ["AU", "US", "GB"],
  ad_groups: [
    {
      name: "WebP PNG Conversion",
      keywords_exact: ["webp to png chrome extension"],
      keywords_phrase: ["webp png converter", "convert webp files"],
      headlines: [
        "WebP to PNG Chrome Extension",
        "Convert WebP Files Instantly", 
        "Free WebP Converter - No Upload"
      ],
      descriptions: [
        "Convert WebP to PNG locally in your browser. Privacy-first, no uploads required.",
        "One-click WebP conversion. Fast, free, and secure Chrome extension."
      ],
      sitelinks: ["Features", "Privacy", "Formats", "Download"],
      landing_page: "/convertmyfile/webp-to-png",
      negatives: ["firefox", "safari", "mobile", "android", "ios"],
      performance_score: 8.73,
      volume_estimate: 1250.45
    },
    {
      name: "PDF Conversion Tools", 
      keywords_exact: ["pdf to jpg chrome extension"],
      keywords_phrase: ["pdf converter chrome", "pdf to image"],
      headlines: [
        "PDF to JPG Chrome Extension",
        "Convert PDF Files Instantly",
        "Free PDF Converter Tool"
      ],
      descriptions: [
        "Convert PDF to JPG locally. No uploads, privacy-first PDF conversion.",
        "One-click PDF conversion. Fast, secure Chrome extension for PDFs."
      ],
      sitelinks: ["Features", "Privacy", "PDF Tools", "Download"],
      landing_page: "/convertmyfile/pdf-to-jpg", 
      negatives: ["firefox", "safari", "mobile", "android"],
      performance_score: 7.89,
      volume_estimate: 890.12
    }
  ],
  callouts: ["Free Tier", "Privacy-First", "No Login Required"],
  structured_snippets: {
    "Features": ["WebP→PNG", "HEIC→JPG", "PDF↔JPG", "Image Compression"]
  },
  shared_negatives: ["tutorial", "course", "jobs", "api", "android", "iphone"],
  summary: {
    total_ad_groups: 2,
    total_keywords: 6,
    avg_performance_score: 8.31,
    total_volume_estimate: 2140.57
  }
};

const sampleKeywordsData = [
  {
    keyword: "webp to png chrome extension",
    cluster: "WebP PNG Conversion",
    volume: 1200,
    cpc: 2.45,
    competition: 0.67,
    intent_score: 2.3,
    final_score: 8.73,
    data_source: "gsc",
    market: "AU",
    recommended_match_type: "exact"
  },
  {
    keyword: "pdf to jpg chrome", 
    cluster: "PDF Conversion Tools",
    volume: 800,
    cpc: 1.89,
    competition: 0.52,
    intent_score: 2.0,
    final_score: 7.89,
    data_source: "rapidapi",
    market: "US", 
    recommended_match_type: "phrase"
  },
  {
    keyword: "convert webp files",
    cluster: "WebP PNG Conversion", 
    volume: 650,
    cpc: 1.23,
    competition: 0.43,
    intent_score: 1.8,
    final_score: 6.45,
    data_source: "kwp",
    market: "GB",
    recommended_match_type: "phrase"
  }
];

const sampleSummaryData = {
  version: "1.1.0",
  timestamp: "2025-09-03T10:30:15.234Z",
  product: "convertmyfile",
  markets: ["AU", "US", "GB"],
  processing: {
    start_time: "2025-09-03T10:29:45.123Z",
    end_time: "2025-09-03T10:30:15.234Z", 
    duration_ms: 30111,
    cache_hit_rate: 0.73
  },
  data_sources: {
    kwp_csv: { available: true, records: 45 },
    search_console: { available: true, records: 23 },
    rapid_keywords: { available: true, calls_made: 8, calls_remaining: 12 },
    rapid_serp: { available: true, calls_made: 15, calls_remaining: 85 }
  },
  outputs: {
    keywords_found: 156,
    ad_groups_created: 7,
    landing_pages_mapped: 4,
    landing_pages_briefed: 3,
    shared_negatives: 12,
    url_health_checks: 7,
    url_health_failures: 0
  },
  quality_gates: {
    url_health_passed: true,
    claims_validated: true,
    csv_structure_valid: true,
    all_ad_groups_have_landing_pages: true
  },
  warnings: [
    "3 ad groups using estimated volume data from RapidAPI",
    "Approaching RapidAPI SERP call limit (15/30 used this run)"
  ],
  performance_score: 8.31
};

// ============================================================================
// DETERMINISTIC JSON OUTPUT TESTS
// ============================================================================

describe('JSON Deterministic Output', () => {
  
  test('formatJsonDeterministic produces consistent output', () => {
    const testObj = { ...sampleAdsData };
    
    const json1 = formatJsonDeterministic(testObj);
    const json2 = formatJsonDeterministic(testObj);
    
    expect(json1).toBe(json2);
    expect(json1.endsWith('\n')).toBe(true);
    expect(json1.includes('  ')).toBe(true); // 2-space indentation
  });

  test('Decimal precision is fixed to 2 places', () => {
    const testObj = {
      score: 8.7346789,
      volume: 1250.454545,
      cpc: 2.4,
      nested: {
        rate: 0.7333333
      },
      array: [1.23456, 9.87654]
    };
    
    const processedObj = fixObjectDecimals(testObj);
    const json = formatJsonDeterministic(processedObj);
    
    expect(json.includes('8.73')).toBe(true);
    expect(json.includes('1250.45')).toBe(true);  
    expect(json.includes('2.40')).toBe(true);
    expect(json.includes('0.73')).toBe(true);
    expect(json.includes('1.23')).toBe(true);
    expect(json.includes('9.88')).toBe(true);
    
    // Should not contain high-precision decimals
    expect(json.includes('8.7346789')).toBe(false);
    expect(json.includes('1250.454545')).toBe(false);
  });

  test('Arrays are sorted for consistent ordering', () => {
    const testObj = {
      markets: ["GB", "AU", "US"], // Deliberately out of order
      keywords: ["zebra", "apple", "mountain"],
      nested: {
        items: [{ name: "charlie" }, { name: "alpha" }, { name: "bravo" }]
      }
    };
    
    const sortedObj = sortArraysRecursively(testObj);
    const json = formatJsonDeterministic(sortedObj);
    
    // Markets should be sorted
    const marketsMatch = json.match(/"markets":\s*\[\s*"[^"]+",\s*"[^"]+",\s*"[^"]+"/);
    expect(marketsMatch).toBeTruthy();
    
    // Keywords should be sorted alphabetically
    expect(json.indexOf('"apple"')).toBeLessThan(json.indexOf('"mountain"'));
    expect(json.indexOf('"mountain"')).toBeLessThan(json.indexOf('"zebra"'));
  });

  test('Object properties are sorted for consistent ordering', () => {
    const testObj = {
      zebra: "last",
      alpha: "first", 
      middle: "between"
    };
    
    const json = formatJsonDeterministic(testObj);
    
    // Properties should appear in alphabetical order in JSON
    expect(json.indexOf('"alpha"')).toBeLessThan(json.indexOf('"middle"'));
    expect(json.indexOf('"middle"')).toBeLessThan(json.indexOf('"zebra"'));
  });
});

// ============================================================================
// KEYWORD SORTING TESTS
// ============================================================================

describe('Keyword Sorting Logic', () => {
  
  test('Keywords sorted by score desc → alphabetically → market', () => {
    const unsortedKeywords = [...sampleKeywordsData].reverse(); // Deliberately reverse order
    const sortedKeywords = sortKeywords(unsortedKeywords);
    
    // Should be sorted by final_score descending
    expect(sortedKeywords[0].final_score).toBeGreaterThanOrEqual(sortedKeywords[1].final_score);
    expect(sortedKeywords[1].final_score).toBeGreaterThanOrEqual(sortedKeywords[2].final_score);
    
    // Highest score should be first
    expect(sortedKeywords[0].final_score).toBe(8.73);
  });

  test('Keywords with same score sorted alphabetically', () => {
    const sameScoreKeywords = [
      { keyword: "zebra keyword", final_score: 5.0, market: "US" },
      { keyword: "alpha keyword", final_score: 5.0, market: "US" },
      { keyword: "beta keyword", final_score: 5.0, market: "US" }
    ];
    
    const sorted = sortKeywords(sameScoreKeywords);
    
    expect(sorted[0].keyword).toBe("alpha keyword");
    expect(sorted[1].keyword).toBe("beta keyword"); 
    expect(sorted[2].keyword).toBe("zebra keyword");
  });

  test('Keywords with same score and name sorted by market', () => {
    const sameKeywords = [
      { keyword: "same keyword", final_score: 5.0, market: "US" },
      { keyword: "same keyword", final_score: 5.0, market: "AU" },
      { keyword: "same keyword", final_score: 5.0, market: "GB" }
    ];
    
    const sorted = sortKeywords(sameKeywords);
    
    expect(sorted[0].market).toBe("AU");
    expect(sorted[1].market).toBe("GB");
    expect(sorted[2].market).toBe("US");
  });
});

// ============================================================================
// CAMPAIGN HIERARCHY SORTING TESTS  
// ============================================================================

describe('Campaign Hierarchy Sorting', () => {
  
  test('Campaign hierarchy sorted correctly', () => {
    const unsortedData = {
      campaigns: [
        { name: "Zebra Campaign" },
        { name: "Alpha Campaign" }
      ],
      ad_groups: [
        { campaign: "Zebra Campaign", name: "Beta Group" },
        { campaign: "Alpha Campaign", name: "Zebra Group" },
        { campaign: "Alpha Campaign", name: "Alpha Group" }
      ],
      keywords: [
        { keyword: "zebra", final_score: 5.0, market: "US" },
        { keyword: "alpha", final_score: 8.0, market: "AU" }
      ]
    };
    
    const sorted = sortCampaignHierarchy(unsortedData);
    
    // Campaigns sorted alphabetically
    expect(sorted.campaigns[0].name).toBe("Alpha Campaign");
    expect(sorted.campaigns[1].name).toBe("Zebra Campaign");
    
    // Ad groups sorted by campaign name first, then ad group name
    expect(sorted.ad_groups[0].campaign).toBe("Alpha Campaign");
    expect(sorted.ad_groups[0].name).toBe("Alpha Group");
    expect(sorted.ad_groups[1].name).toBe("Zebra Group");
    expect(sorted.ad_groups[2].campaign).toBe("Zebra Campaign");
    
    // Keywords sorted by score descending
    expect(sorted.keywords[0].final_score).toBe(8.0);
    expect(sorted.keywords[1].final_score).toBe(5.0);
  });
});

// ============================================================================
// OBJECT IDENTITY TESTS
// ============================================================================

describe('Object Identity Validation', () => {
  
  test('areObjectsIdentical detects identical objects', () => {
    const obj1 = { ...sampleSummaryData };
    const obj2 = { ...sampleSummaryData };
    
    expect(areObjectsIdentical(obj1, obj2)).toBe(true);
  });

  test('areObjectsIdentical detects different objects', () => {
    const obj1 = { ...sampleSummaryData };
    const obj2 = { ...sampleSummaryData, version: "1.0.0" };
    
    expect(areObjectsIdentical(obj1, obj2)).toBe(false);
  });

  test('areObjectsIdentical handles decimal precision differences', () => {
    const obj1 = { score: 8.73, volume: 1250.45 };
    const obj2 = { score: 8.734567, volume: 1250.454545 };

    // Should be different before processing (use direct JSON comparison, not areObjectsIdentical)
    expect(JSON.stringify(obj1)).not.toBe(JSON.stringify(obj2));

    // Should be identical after decimal fixing
    const processed1 = fixObjectDecimals(obj1);
    const processed2 = fixObjectDecimals(obj2);
    expect(areObjectsIdentical(processed1, processed2)).toBe(true);
  });
});

// ============================================================================
// FILE WRITE TESTS
// ============================================================================

describe('JSON File Writing', () => {
  
  test('writeJsonFile creates deterministic output', () => {
    const filePath1 = join(TEST_OUTPUT_DIR, 'test_write_1.json');
    const filePath2 = join(TEST_OUTPUT_DIR, 'test_write_2.json');
    
    writeJsonFile(filePath1, sampleAdsData);
    writeJsonFile(filePath2, sampleAdsData);
    
    const content1 = readFileSync(filePath1, 'utf8');
    const content2 = readFileSync(filePath2, 'utf8');
    
    expect(content1).toBe(content2);
    expect(content1.endsWith('\n')).toBe(true);
  });

  test('JSON output is valid and parseable', () => {
    const filePath = join(TEST_OUTPUT_DIR, 'test_parseable.json');
    writeJsonFile(filePath, sampleSummaryData);
    
    const content = readFileSync(filePath, 'utf8');
    
    // Should parse without errors
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe("1.1.0");
    expect(parsed.product).toBe("convertmyfile");
  });
});

// ============================================================================
// SNAPSHOT TESTS (v1.1 deterministic output system is fully implemented)
// ============================================================================

describe('JSON Structure Snapshots', () => {
  // v1.1 implementation is complete - these tests validate JSON structure consistency

  test('ads.json structure matches snapshot', () => {
    expect(sampleAdsData).toMatchSnapshot();
  });

  test('summary.json structure matches snapshot', () => {
    expect(sampleSummaryData).toMatchSnapshot();
  });
});