import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { 
  UseCaseLevelClaimsValidator, 
  validateProductClaims,
  generateDefaultClaimsConfig,
  ClusterClaimsReport,
  ProductClaimsValidation
} from '../../src/validators/claims.js';
import { KeywordCluster } from '../../src/clustering.js';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Use-Case Level Claims Validation Tests
 * 
 * Tests the comprehensive claims validation system including:
 * - Use-case specific claim validation (WebP vs HEIC processing)
 * - Content filtering and modification recommendations
 * - Compliance status determination (pass/warning/fail)
 * - YAML configuration loading and validation
 * - Content action generation for invalid claims
 * - Product-level validation reporting
 */

describe('Use-Case Level Claims Validation System', () => {
  let validator: UseCaseLevelClaimsValidator;
  const testOutputDir = join(process.cwd(), 'tests/__temp_claims_test__');
  
  beforeEach(() => {
    // Clean setup for each test
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
    
    validator = new UseCaseLevelClaimsValidator();
  });
  
  afterEach(() => {
    // Clean up test directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  test('Validates WebP to PNG claims correctly (local processing)', async () => {
    const webpCluster: KeywordCluster = {
      name: 'WebP PNG Conversion',
      useCase: 'webp_to_png',
      primaryKeywords: [
        { keyword: 'webp to png chrome extension', final_score: 8.5, recommended_match_type: 'exact' }
      ],
      keywords: [],
      headlines: [
        'WebP to PNG Chrome Extension',
        'Convert WebP Files Locally in Your Browser', // Valid local processing claim
        'Privacy-First WebP Converter' // Valid privacy claim
      ],
      descriptions: [
        'Convert WebP to PNG files directly in your browser. No uploads required, privacy-first conversion.',
        'Fast, secure WebP to PNG conversion with our Chrome extension. All processing happens locally.'
      ],
      landingPage: '/webp-to-png'
    };

    const validation = await validateProductClaims([webpCluster], 'convertmyfile');
    
    expect(validation.cluster_reports).toHaveLength(1);
    
    const report = validation.cluster_reports[0];
    expect(report.cluster_name).toBe('WebP PNG Conversion');
    expect(report.use_case).toBe('webp_to_png');
    expect(report.compliance_status).toBe('pass');
    
    // Should have valid claims for local processing, privacy, no uploads
    const localProcessingResult = report.validation_results.find(r => r.claim_name === 'local_processing');
    expect(localProcessingResult?.is_valid).toBe(true);
    expect(localProcessingResult?.reason).toContain('Valid local_processing claim present');
    
    const privacyResult = report.validation_results.find(r => r.claim_name === 'privacy_first');
    expect(privacyResult?.is_valid).toBe(true);
    
    const noUploadsResult = report.validation_results.find(r => r.claim_name === 'no_uploads_required');
    expect(noUploadsResult?.is_valid).toBe(true);
  });

  test('Detects invalid claims for HEIC to JPG (server processing)', async () => {
    const heicCluster: KeywordCluster = {
      name: 'HEIC JPG Conversion',
      useCase: 'heic_to_jpg',
      primaryKeywords: [
        { keyword: 'heic to jpg converter', final_score: 7.8, recommended_match_type: 'phrase' }
      ],
      keywords: [],
      headlines: [
        'HEIC to JPG Chrome Extension',
        'Convert HEIC Files Locally in Your Browser', // INVALID - should be server processing
        'Privacy-First HEIC Converter' // INVALID - uses external service
      ],
      descriptions: [
        'Convert HEIC to JPG files directly in your browser. No uploads required, privacy-first conversion.', // INVALID claims
        'Fast, secure HEIC to JPG conversion with professional results.'
      ],
      landingPage: '/heic-to-jpg'
    };

    const validation = await validateProductClaims([heicCluster], 'convertmyfile');
    
    const report = validation.cluster_reports[0];
    expect(report.compliance_status).toBe('fail'); // Should fail due to high-impact violations
    
    // Should detect invalid local processing claim
    const localProcessingResult = report.validation_results.find(r => r.claim_name === 'local_processing');
    expect(localProcessingResult?.is_valid).toBe(false);
    expect(localProcessingResult?.configured_value).toBe(false);
    expect(localProcessingResult?.reason).toContain('Found local_processing claim but it\'s not valid for heic_to_jpg');
    expect(localProcessingResult?.impact).toBe('medium');
    
    // Should detect invalid privacy claim
    const privacyResult = report.validation_results.find(r => r.claim_name === 'privacy_first');
    expect(privacyResult?.is_valid).toBe(false);
    expect(privacyResult?.impact).toBe('high');
    
    // Should detect invalid no uploads claim
    const noUploadsResult = report.validation_results.find(r => r.claim_name === 'no_uploads_required');
    expect(noUploadsResult?.is_valid).toBe(false);
    expect(noUploadsResult?.impact).toBe('high');
    
    // Should have content modification suggestions
    expect(report.content_actions.headlines_to_modify.length).toBeGreaterThan(0);
    expect(report.content_actions.descriptions_to_modify.length).toBeGreaterThan(0);
    expect(report.content_actions.claims_to_remove).toContain('local_processing');
    expect(report.content_actions.claims_to_remove).toContain('privacy_first');
    expect(report.content_actions.alternative_claims).toContain('Professional cloud conversion');
  });

  test('Generates proper remediation actions for invalid claims', async () => {
    const clusterWithInvalidClaims: KeywordCluster = {
      name: 'Test Conversion',
      useCase: 'heic_to_jpg',
      primaryKeywords: [{ keyword: 'test converter', final_score: 6.0, recommended_match_type: 'phrase' }],
      keywords: [],
      headlines: ['Test Converter - Process Files Locally'], // Invalid claim
      descriptions: ['Privacy-first file conversion without uploads.'], // Invalid claims
      landingPage: '/test'
    };

    const validation = await validateProductClaims([clusterWithInvalidClaims], 'testproduct');
    const report = validation.cluster_reports[0];
    
    // Should provide specific remediation actions
    const localProcessingResult = report.validation_results.find(r => r.claim_name === 'local_processing');
    expect(localProcessingResult?.remediation).toContain('Remove "local" or "browser" processing claims');
    expect(localProcessingResult?.remediation).toContain('cloud-based');
    
    const privacyResult = report.validation_results.find(r => r.claim_name === 'privacy_first');
    expect(privacyResult?.remediation).toContain('Remove privacy-first claims');
    expect(privacyResult?.remediation).toContain('professional');
    
    const noUploadsResult = report.validation_results.find(r => r.claim_name === 'no_uploads_required');
    expect(noUploadsResult?.remediation).toContain('Remove "no upload" claims');
    expect(noUploadsResult?.remediation).toContain('simple upload');
  });

  test('Handles missing use case configuration gracefully', async () => {
    const unknownCluster: KeywordCluster = {
      name: 'Unknown Format Conversion',
      useCase: 'unknown_format',
      primaryKeywords: [{ keyword: 'unknown converter', final_score: 7.0, recommended_match_type: 'phrase' }],
      keywords: [],
      headlines: ['Unknown Format Converter'],
      descriptions: ['Convert unknown formats easily.'],
      landingPage: '/unknown'
    };

    const validation = await validateProductClaims([unknownCluster], 'testproduct');
    const report = validation.cluster_reports[0];
    
    expect(report.compliance_status).toBe('warning');
    expect(report.total_claims_checked).toBe(0);
    expect(report.validation_results).toHaveLength(1);
    expect(report.validation_results[0].claim_name).toBe('configuration');
    expect(report.validation_results[0].reason).toContain('No configuration found for use case');
    expect(report.validation_results[0].remediation).toContain('Add claims configuration for unknown_format');
  });

  test('Loads custom YAML configuration correctly', async () => {
    // Create custom configuration
    const configPath = join(testOutputDir, 'custom-claims.yaml');
    const customConfig = `claims_validation:
  webp_to_png:
    local_processing: true
    privacy_first: true
    no_uploads_required: true
    custom_claim: true
  test_conversion:
    local_processing: false
    privacy_first: true
    fast_processing: true`;
    
    writeFileSync(configPath, customConfig, 'utf8');
    
    const customValidator = new UseCaseLevelClaimsValidator(configPath);
    
    const testCluster: KeywordCluster = {
      name: 'Test Conversion',
      useCase: 'test_conversion',
      primaryKeywords: [{ keyword: 'test', final_score: 8.0, recommended_match_type: 'exact' }],
      keywords: [],
      headlines: ['Test Converter - Local Processing'], // Should be invalid
      descriptions: ['Fast, privacy-first conversion.'], // Should be valid
      landingPage: '/test'
    };

    const validation = await customValidator.validateProductClaims([testCluster], 'testproduct');
    const report = validation.cluster_reports[0];
    
    // Should use custom configuration
    expect(report.use_case).toBe('test_conversion');
    
    const localProcessingResult = report.validation_results.find(r => r.claim_name === 'local_processing');
    expect(localProcessingResult?.configured_value).toBe(false); // From custom config
    expect(localProcessingResult?.is_valid).toBe(false); // Claim present but shouldn't be
    
    const privacyResult = report.validation_results.find(r => r.claim_name === 'privacy_first');
    expect(privacyResult?.configured_value).toBe(true); // From custom config
    expect(privacyResult?.is_valid).toBe(true); // Claim present and should be
  });

  test('Content filtering removes invalid claims correctly', async () => {
    const content = [
      'Convert WebP files locally in your browser', // Contains local processing claim
      'Privacy-first file conversion', // Contains privacy claim
      'Fast and reliable converter', // No problematic claims
      'No uploads required - all processing happens offline' // Contains no uploads + offline claims
    ];

    // Mock validation results indicating local_processing and no_uploads_required are invalid
    const validationResults = [
      {
        claim_name: 'local_processing',
        use_case: 'heic_to_jpg',
        is_valid: false,
        configured_value: false,
        reason: 'Invalid for server processing',
        impact: 'medium' as const,
        remediation: 'Remove local processing claims'
      },
      {
        claim_name: 'no_uploads_required',
        use_case: 'heic_to_jpg',
        is_valid: false,
        configured_value: false,
        reason: 'Invalid for upload-required process',
        impact: 'high' as const,
        remediation: 'Remove no uploads claims'
      }
    ];

    const filteredContent = await validator.filterContent(content, validationResults);
    
    // Should remove or modify content with invalid claims
    expect(filteredContent).not.toContain('Convert WebP files locally in your browser');
    expect(filteredContent).not.toContain('No uploads required - all processing happens offline');
    
    // Should keep content without problematic claims
    expect(filteredContent).toContain('Fast and reliable converter');
    
    // Privacy claim should be kept (not in invalid list)
    expect(filteredContent).toContain('Privacy-first file conversion');
  });

  test('Product-level summary calculates statistics correctly', async () => {
    const clusters: KeywordCluster[] = [
      {
        name: 'WebP Conversion',
        useCase: 'webp_to_png',
        primaryKeywords: [{ keyword: 'webp converter', final_score: 8.5, recommended_match_type: 'exact' }],
        keywords: [],
        headlines: ['WebP Converter - Local Processing'], // Valid
        descriptions: ['Convert WebP files in your browser.'], // Valid
        landingPage: '/webp'
      },
      {
        name: 'HEIC Conversion',
        useCase: 'heic_to_jpg',
        primaryKeywords: [{ keyword: 'heic converter', final_score: 7.5, recommended_match_type: 'phrase' }],
        keywords: [],
        headlines: ['HEIC Converter - Local Processing'], // Invalid
        descriptions: ['Privacy-first HEIC conversion.'], // Invalid
        landingPage: '/heic'
      },
      {
        name: 'PDF Conversion',
        useCase: 'pdf_to_jpg',
        primaryKeywords: [{ keyword: 'pdf converter', final_score: 8.0, recommended_match_type: 'exact' }],
        keywords: [],
        headlines: ['PDF Converter'], // No claims - should be warning for missing claims
        descriptions: ['Convert PDF files.'], // No claims
        landingPage: '/pdf'
      }
    ];

    const validation = await validateProductClaims(clusters, 'testproduct');
    
    expect(validation.summary.total_clusters).toBe(3);
    // WebP has 1 valid claim but 5 missing claims = warning
    // HEIC has invalid claims (high impact) = fail  
    // PDF has only missing claims = warning
    expect(validation.summary.clusters_passed).toBe(0); // No clusters fully pass
    expect(validation.summary.clusters_with_warnings).toBeGreaterThanOrEqual(2); // WebP and PDF get warnings
    expect(validation.summary.clusters_failed).toBeGreaterThanOrEqual(1); // HEIC should fail
    
    // Should identify most common violations
    expect(validation.summary.most_common_violations.length).toBeGreaterThan(0);
    // privacy_first appears as violation in all 3 clusters, so it should be the most common
    expect(validation.summary.most_common_violations).toContain('privacy_first');
    
    // Should provide recommendations
    expect(validation.summary.recommended_actions.length).toBeGreaterThan(0);
    expect(validation.summary.recommended_actions[0]).toContain('high-impact claim violations');
  });

  test('generateDefaultClaimsConfig creates valid YAML', () => {
    const configPath = join(testOutputDir, 'default-config.yaml');
    
    generateDefaultClaimsConfig(configPath);
    
    expect(existsSync(configPath)).toBe(true);
    
    const configContent = require('fs').readFileSync(configPath, 'utf8');
    expect(configContent).toContain('claims_validation:');
    expect(configContent).toContain('webp_to_png:');
    expect(configContent).toContain('heic_to_jpg:');
    expect(configContent).toContain('local_processing: true');
    expect(configContent).toContain('local_processing: false');
    expect(configContent).toContain('privacy_first: true');
    expect(configContent).toContain('privacy_first: false');
  });

  test('Claim detection rules work correctly', async () => {
    const testCases = [
      {
        content: ['Process files locally in your browser'],
        expectedClaim: 'local_processing',
        shouldDetect: true
      },
      {
        content: ['Privacy-first file conversion'],
        expectedClaim: 'privacy_first',
        shouldDetect: true
      },
      {
        content: ['No uploads required'],
        expectedClaim: 'no_uploads_required',
        shouldDetect: true
      },
      {
        content: ['Free Chrome extension'],
        expectedClaim: 'free_tier_available',
        shouldDetect: true
      },
      {
        content: ['Fast and reliable'],
        expectedClaim: 'fast_processing',
        shouldDetect: true
      },
      {
        content: ['Simple file converter'],
        expectedClaim: 'privacy_first',
        shouldDetect: false
      }
    ];

    for (const testCase of testCases) {
      const cluster: KeywordCluster = {
        name: 'Test Cluster',
        useCase: 'webp_to_png',
        primaryKeywords: [{ keyword: 'test', final_score: 8.0, recommended_match_type: 'exact' }],
        keywords: [],
        headlines: testCase.content,
        descriptions: [],
        landingPage: '/test'
      };

      const validation = await validateProductClaims([cluster], 'testproduct');
      const report = validation.cluster_reports[0];
      
      const claimResult = report.validation_results.find(r => r.claim_name === testCase.expectedClaim);
      
      if (testCase.shouldDetect) {
        // Claim should be detected and found in content
        expect(claimResult?.is_valid).toBe(true);
      } else {
        // Claim should not be detected in content - this means for webp_to_png config,
        // the expected claims will be marked as missing (is_valid: false) which is correct
        // for content that doesn't contain the required claims
        if (claimResult) {
          // For webp_to_png, all claims are required (configured as true)
          // So missing claims will be is_valid: false, which is expected
          expect(claimResult.is_valid).toBe(false); // Missing expected claim
          expect(claimResult.reason).toContain('Expected');
        }
      }
    }
  });
});