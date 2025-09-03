import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import * as yaml from 'js-yaml';
import { KeywordCluster } from '../clustering.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ClaimsValidationConfig {
  claims_validation: {
    [useCase: string]: {
      local_processing?: boolean;
      privacy_first?: boolean;
      no_uploads_required?: boolean;
      no_account_required?: boolean;
      free_tier_available?: boolean;
      browser_extension?: boolean;
      offline_capable?: boolean;
      fast_processing?: boolean;
      secure_processing?: boolean;
      no_data_storage?: boolean;
    };
  };
}

export interface ClaimValidationResult {
  claim_name: string;
  use_case: string;
  is_valid: boolean;
  configured_value: boolean | undefined;
  reason: string;
  impact: 'high' | 'medium' | 'low';
  remediation: string;
}

export interface ClusterClaimsReport {
  cluster_name: string;
  use_case: string;
  total_claims_checked: number;
  valid_claims: number;
  invalid_claims: number;
  validation_results: ClaimValidationResult[];
  content_actions: {
    headlines_to_modify: string[];
    descriptions_to_modify: string[];
    claims_to_remove: string[];
    alternative_claims: string[];
  };
  compliance_status: 'pass' | 'warning' | 'fail';
}

export interface ProductClaimsValidation {
  product: string;
  timestamp: string;
  version: string;
  cluster_reports: ClusterClaimsReport[];
  summary: {
    total_clusters: number;
    clusters_passed: number;
    clusters_with_warnings: number;
    clusters_failed: number;
    most_common_violations: string[];
    recommended_actions: string[];
  };
}

// ============================================================================
// CORE CLAIMS VALIDATOR
// ============================================================================

export class UseCaseLevelClaimsValidator {
  private validationConfig: ClaimsValidationConfig;
  private claimDetectionRules: Map<string, RegExp[]>;

  constructor(productConfigPath?: string) {
    this.validationConfig = this.loadValidationConfig(productConfigPath);
    this.claimDetectionRules = this.initializeClaimDetectionRules();
  }

  /**
   * Validate claims for all clusters in a product
   */
  async validateProductClaims(
    clusters: KeywordCluster[],
    productName: string
  ): Promise<ProductClaimsValidation> {
    logger.info(`🛡️ Starting claims validation for product: ${productName}`);
    
    const clusterReports: ClusterClaimsReport[] = [];
    
    for (const cluster of clusters) {
      const report = await this.validateClusterClaims(cluster);
      clusterReports.push(report);
    }

    const summary = this.generateProductSummary(clusterReports);
    
    const validation: ProductClaimsValidation = {
      product: productName,
      timestamp: new Date().toISOString(),
      version: 'v1.1',
      cluster_reports: clusterReports,
      summary
    };

    logger.info(`✅ Claims validation completed: ${summary.clusters_passed}/${summary.total_clusters} clusters passed`);
    
    return validation;
  }

  /**
   * Validate claims for a specific keyword cluster
   */
  private async validateClusterClaims(cluster: KeywordCluster): Promise<ClusterClaimsReport> {
    const useCase = this.extractUseCase(cluster);
    const useCaseConfig = this.validationConfig.claims_validation[useCase];
    
    if (!useCaseConfig) {
      logger.warn(`⚠️ No claims configuration found for use case: ${useCase}`);
      return this.createWarningReport(cluster, useCase, 'No configuration found for use case');
    }

    const validationResults: ClaimValidationResult[] = [];
    
    // Extract all text content from cluster
    const allContent = this.extractClusterContent(cluster);
    
    // Validate each configured claim
    for (const [claimName, expectedValue] of Object.entries(useCaseConfig)) {
      if (typeof expectedValue === 'boolean') {
        const result = this.validateSpecificClaim(claimName, expectedValue, allContent, useCase);
        validationResults.push(result);
      }
    }

    // Analyze content and generate remediation actions
    const contentActions = this.generateContentActions(validationResults, allContent);
    
    // Determine overall compliance status
    const complianceStatus = this.determineComplianceStatus(validationResults);
    
    const report: ClusterClaimsReport = {
      cluster_name: cluster.name,
      use_case: useCase,
      total_claims_checked: validationResults.length,
      valid_claims: validationResults.filter(r => r.is_valid).length,
      invalid_claims: validationResults.filter(r => !r.is_valid).length,
      validation_results: validationResults,
      content_actions: contentActions,
      compliance_status: complianceStatus
    };

    logger.debug(`📋 Cluster "${cluster.name}": ${report.valid_claims}/${report.total_claims_checked} claims valid`);
    
    return report;
  }

  /**
   * Validate a specific claim against content
   */
  private validateSpecificClaim(
    claimName: string,
    expectedValue: boolean,
    content: string[],
    useCase: string
  ): ClaimValidationResult {
    const detectionRules = this.claimDetectionRules.get(claimName) || [];
    const claimFound = this.detectClaimInContent(detectionRules, content);
    
    const result: ClaimValidationResult = {
      claim_name: claimName,
      use_case: useCase,
      is_valid: claimFound === expectedValue,
      configured_value: expectedValue,
      reason: '',
      impact: 'medium',
      remediation: ''
    };

    // Generate specific validation logic
    if (expectedValue && !claimFound) {
      // Claim should be present but isn't found
      result.reason = `Expected ${claimName} claim but none found in content`;
      result.impact = 'low';
      result.remediation = `Add ${claimName} messaging to headlines or descriptions`;
    } else if (!expectedValue && claimFound) {
      // Claim should not be present but is found
      result.reason = `Found ${claimName} claim but it's not valid for ${useCase}`;
      result.impact = this.getClaimImpact(claimName);
      result.remediation = this.getRemediationAction(claimName, useCase);
    } else {
      // Claim status matches expectation
      result.reason = claimFound ? 
        `Valid ${claimName} claim present and correctly configured` :
        `No ${claimName} claim present, which is correct for ${useCase}`;
      result.impact = 'low';
      result.remediation = 'No action required';
    }

    // Ensure remediation is always set
    if (!result.remediation || result.remediation.trim() === '') {
      result.remediation = 'Review claim configuration and content alignment';
    }

    return result;
  }

  /**
   * Initialize claim detection rules
   */
  private initializeClaimDetectionRules(): Map<string, RegExp[]> {
    const rules = new Map<string, RegExp[]>();
    
    rules.set('local_processing', [
      /local(?:ly)?.*process/i,
      /process.*local(?:ly)?/i,
      /(?:in.?)?(?:your )?browser/i,
      /client.?side/i,
      /no.*server/i,
      /offline/i
    ]);

    rules.set('privacy_first', [
      /privacy.?first/i,
      /private/i,
      /confidential/i,
      /secure.*data/i,
      /protect.*privacy/i
    ]);

    rules.set('no_uploads_required', [
      /no.*upload/i,
      /without.*upload/i,
      /no.*server.*transfer/i,
      /local.*only/i,
      /stays.*(?:on.*)?device/i
    ]);

    rules.set('no_account_required', [
      /no.*account/i,
      /no.*(?:sign.?up|registration)/i,
      /anonymous/i,
      /instant.*access/i
    ]);

    rules.set('free_tier_available', [
      /free/i,
      /no.*cost/i,
      /complimentary/i,
      /at.*no.*charge/i
    ]);

    rules.set('browser_extension', [
      /browser.*extension/i,
      /chrome.*extension/i,
      /firefox.*(?:add.?on|extension)/i,
      /safari.*extension/i
    ]);

    rules.set('fast_processing', [
      /fast/i,
      /quick/i,
      /instant/i,
      /rapid/i,
      /immediate/i,
      /real.?time/i
    ]);

    rules.set('secure_processing', [
      /secure/i,
      /encrypted/i,
      /protected/i,
      /safe/i
    ]);

    return rules;
  }

  /**
   * Detect if claim is present in content
   */
  private detectClaimInContent(rules: RegExp[], content: string[]): boolean {
    const allText = content.join(' ').toLowerCase();
    
    const detected = rules.some(rule => rule.test(allText));
    return detected;
  }

  /**
   * Extract use case from cluster
   */
  private extractUseCase(cluster: KeywordCluster): string {
    // Use explicit useCase property if provided
    if (cluster.useCase) {
      return cluster.useCase;
    }
    
    // Extract use case from cluster name or primary keywords
    if (cluster.name.toLowerCase().includes('webp') && cluster.name.toLowerCase().includes('png')) {
      return 'webp_to_png';
    }
    if (cluster.name.toLowerCase().includes('heic') && cluster.name.toLowerCase().includes('jpg')) {
      return 'heic_to_jpg';
    }
    if (cluster.name.toLowerCase().includes('pdf') && cluster.name.toLowerCase().includes('jpg')) {
      return 'pdf_to_jpg';
    }
    if (cluster.name.toLowerCase().includes('svg') && cluster.name.toLowerCase().includes('png')) {
      return 'svg_to_png';
    }
    
    // Fallback to generic use case based on primary keywords
    const primaryKeyword = cluster.primaryKeywords?.[0]?.keyword || '';
    if (primaryKeyword.includes('webp')) return 'webp_to_png';
    if (primaryKeyword.includes('heic')) return 'heic_to_jpg';
    if (primaryKeyword.includes('pdf')) return 'pdf_to_jpg';
    if (primaryKeyword.includes('svg')) return 'svg_to_png';
    
    // Default to generic conversion
    return 'generic_conversion';
  }

  /**
   * Extract all text content from cluster
   */
  private extractClusterContent(cluster: KeywordCluster): string[] {
    const content: string[] = [];
    
    // Add cluster name
    content.push(cluster.name);
    
    // Add headlines if available
    if (cluster.headlines) {
      content.push(...cluster.headlines);
    }
    
    // Add descriptions if available
    if (cluster.descriptions) {
      content.push(...cluster.descriptions);
    }
    
    // Add primary keywords
    if (cluster.primaryKeywords) {
      content.push(...cluster.primaryKeywords.map(k => k.keyword));
    }
    
    return content;
  }

  /**
   * Generate content modification actions
   */
  private generateContentActions(
    validationResults: ClaimValidationResult[],
    content: string[]
  ): ClusterClaimsReport['content_actions'] {
    const actions = {
      headlines_to_modify: [] as string[],
      descriptions_to_modify: [] as string[],
      claims_to_remove: [] as string[],
      alternative_claims: [] as string[]
    };

    // Find invalid claims that need to be removed
    const invalidClaims = validationResults.filter(r => !r.is_valid && r.configured_value === false);
    
    for (const invalidClaim of invalidClaims) {
      actions.claims_to_remove.push(invalidClaim.claim_name);
      actions.alternative_claims.push(this.getAlternativeClaim(invalidClaim.claim_name, invalidClaim.use_case));
      
      // Find content containing invalid claims
      const rules = this.claimDetectionRules.get(invalidClaim.claim_name) || [];
      for (const contentItem of content) {
        if (rules.some(rule => rule.test(contentItem.toLowerCase()))) {
          if (contentItem.length > 30) { // Likely a description
            actions.descriptions_to_modify.push(contentItem);
          } else { // Likely a headline
            actions.headlines_to_modify.push(contentItem);
          }
        }
      }
    }

    return actions;
  }

  /**
   * Get alternative claim for invalid ones
   */
  private getAlternativeClaim(claimName: string, useCase: string): string {
    const alternatives: { [key: string]: { [useCase: string]: string } } = {
      'local_processing': {
        'heic_to_jpg': 'Professional cloud conversion',
        'default': 'Reliable online processing'
      },
      'privacy_first': {
        'heic_to_jpg': 'Secure server processing',
        'default': 'Trusted processing'
      },
      'no_uploads_required': {
        'heic_to_jpg': 'Simple upload and convert',
        'default': 'Easy file processing'
      }
    };

    return alternatives[claimName]?.[useCase] || 
           alternatives[claimName]?.['default'] || 
           'Feature-rich converter';
  }

  /**
   * Get claim impact level
   */
  private getClaimImpact(claimName: string): 'high' | 'medium' | 'low' {
    const highImpactClaims = ['privacy_first', 'no_uploads_required', 'secure_processing'];
    const mediumImpactClaims = ['local_processing', 'no_account_required'];
    
    if (highImpactClaims.includes(claimName)) return 'high';
    if (mediumImpactClaims.includes(claimName)) return 'medium';
    return 'low';
  }

  /**
   * Get remediation action for invalid claim
   */
  private getRemediationAction(claimName: string, useCase: string): string {
    const actions: { [key: string]: string } = {
      'local_processing': `Remove "local" or "browser" processing claims. Use "cloud-based" or "online" instead.`,
      'privacy_first': `Remove privacy-first claims. Focus on "reliable" or "professional" processing.`,
      'no_uploads_required': `Remove "no upload" claims. Emphasize "simple upload" or "easy file handling".`,
      'no_account_required': `Remove "no account" claims if registration is required.`,
      'free_tier_available': `Remove "free" claims if no free tier exists.`,
      'offline_capable': `Remove "offline" claims for server-dependent features.`
    };

    return actions[claimName] || `Review and remove ${claimName} claims for ${useCase}.`;
  }

  /**
   * Determine overall compliance status
   */
  private determineComplianceStatus(results: ClaimValidationResult[]): 'pass' | 'warning' | 'fail' {
    const invalidHighImpact = results.filter(r => !r.is_valid && r.impact === 'high');
    const invalidMediumImpact = results.filter(r => !r.is_valid && r.impact === 'medium');
    const invalidLowImpact = results.filter(r => !r.is_valid && r.impact === 'low');

    if (invalidHighImpact.length > 0) return 'fail';
    if (invalidMediumImpact.length > 1 || invalidLowImpact.length > 2) return 'warning';
    return 'pass';
  }

  /**
   * Create warning report for missing configuration
   */
  private createWarningReport(cluster: KeywordCluster, useCase: string, reason: string): ClusterClaimsReport {
    return {
      cluster_name: cluster.name,
      use_case: useCase,
      total_claims_checked: 0,
      valid_claims: 0,
      invalid_claims: 0,
      validation_results: [{
        claim_name: 'configuration',
        use_case: useCase,
        is_valid: false,
        configured_value: undefined,
        reason: reason,
        impact: 'medium',
        remediation: `Add claims configuration for ${useCase} in product YAML`
      }],
      content_actions: {
        headlines_to_modify: [],
        descriptions_to_modify: [],
        claims_to_remove: [],
        alternative_claims: []
      },
      compliance_status: 'warning'
    };
  }

  /**
   * Generate product-level summary
   */
  private generateProductSummary(reports: ClusterClaimsReport[]): ProductClaimsValidation['summary'] {
    const passedClusters = reports.filter(r => r.compliance_status === 'pass').length;
    const warningClusters = reports.filter(r => r.compliance_status === 'warning').length;
    const failedClusters = reports.filter(r => r.compliance_status === 'fail').length;

    // Find most common violations
    const violations = reports
      .flatMap(r => r.validation_results)
      .filter(v => !v.is_valid)
      .map(v => v.claim_name);
    
    const violationCounts = violations.reduce((counts, claim) => {
      counts[claim] = (counts[claim] || 0) + 1;
      return counts;
    }, {} as { [claim: string]: number });

    const mostCommonViolations = Object.entries(violationCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([claim]) => claim);

    // Generate recommended actions
    const recommendedActions = [];
    if (failedClusters > 0) {
      recommendedActions.push('Review and fix high-impact claim violations before campaign launch');
    }
    if (warningClusters > 0) {
      recommendedActions.push('Address medium-impact claim inconsistencies for better compliance');
    }
    if (mostCommonViolations.length > 0) {
      recommendedActions.push(`Most common violations: ${mostCommonViolations.join(', ')} - review use case configurations`);
    }

    return {
      total_clusters: reports.length,
      clusters_passed: passedClusters,
      clusters_with_warnings: warningClusters,
      clusters_failed: failedClusters,
      most_common_violations: mostCommonViolations,
      recommended_actions: recommendedActions
    };
  }

  /**
   * Load validation configuration from YAML file
   */
  private loadValidationConfig(configPath?: string): ClaimsValidationConfig {
    const defaultConfig: ClaimsValidationConfig = {
      claims_validation: {
        webp_to_png: {
          local_processing: true,
          privacy_first: true,
          no_uploads_required: true,
          browser_extension: true,
          free_tier_available: true,
          fast_processing: true
        },
        heic_to_jpg: {
          local_processing: false, // Server processing required
          privacy_first: false,    // External service used
          no_uploads_required: false, // Uploads needed
          browser_extension: true,
          free_tier_available: true,
          fast_processing: true
        },
        pdf_to_jpg: {
          local_processing: true,
          privacy_first: true,
          no_uploads_required: true,
          browser_extension: true,
          free_tier_available: true,
          fast_processing: true
        },
        generic_conversion: {
          browser_extension: true,
          free_tier_available: true,
          fast_processing: true
        }
      }
    };

    if (!configPath) {
      logger.debug('Using default claims validation configuration');
      return defaultConfig;
    }

    const fullPath = configPath.startsWith('/') ? configPath : join(process.cwd(), configPath);
    
    if (!existsSync(fullPath)) {
      logger.warn(`Claims config file not found at ${fullPath}, using defaults`);
      return defaultConfig;
    }

    try {
      const yamlContent = readFileSync(fullPath, 'utf8');
      const loadedConfig = yaml.load(yamlContent) as ClaimsValidationConfig;
      
      logger.info(`✅ Loaded claims validation config from ${fullPath}`);
      return { ...defaultConfig, ...loadedConfig };
    } catch (error) {
      logger.error(`Failed to load claims config from ${fullPath}:`, error);
      return defaultConfig;
    }
  }

  /**
   * Apply content filtering based on validation results
   */
  async filterContent(
    content: string[],
    validationResults: ClaimValidationResult[]
  ): Promise<string[]> {
    const filteredContent: string[] = [];
    
    // Get rules for invalid claims that need to be removed
    const invalidClaims = validationResults.filter(r => !r.is_valid && r.configured_value === false);
    const removalRules: RegExp[] = [];
    
    for (const invalidClaim of invalidClaims) {
      const rules = this.claimDetectionRules.get(invalidClaim.claim_name) || [];
      removalRules.push(...rules);
    }

    // Filter each content item
    for (const item of content) {
      let filteredItem = item;
      
      // Check if item contains invalid claims
      const hasInvalidClaim = removalRules.some(rule => rule.test(item.toLowerCase()));
      
      if (hasInvalidClaim) {
        // Try to remove just the problematic parts
        let modifiedItem = item;
        for (const rule of removalRules) {
          modifiedItem = modifiedItem.replace(rule, '');
        }
        
        // Clean up extra spaces and punctuation
        modifiedItem = modifiedItem.replace(/\s+/g, ' ').trim();
        modifiedItem = modifiedItem.replace(/^[,\-\s]+|[,\-\s]+$/g, '');
        
        if (modifiedItem.length > 5) { // Keep if still meaningful
          filteredContent.push(modifiedItem);
        }
      } else {
        filteredContent.push(filteredItem);
      }
    }

    return filteredContent;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create default claims validation configuration file
 */
export function generateDefaultClaimsConfig(outputPath: string): void {
  const defaultYaml = `# Claims Validation Configuration
# Configure which claims are valid for each use case

claims_validation:
  webp_to_png:
    local_processing: true        # Processed in browser
    privacy_first: true          # No data sent to servers
    no_uploads_required: true    # Files stay local
    browser_extension: true      # Chrome extension
    free_tier_available: true    # Free to use
    fast_processing: true        # Quick conversion

  heic_to_jpg:
    local_processing: false      # Server processing required
    privacy_first: false         # External service used  
    no_uploads_required: false   # Upload required
    browser_extension: true      # Chrome extension
    free_tier_available: true    # Free tier available
    fast_processing: true        # Fast service

  pdf_to_jpg:
    local_processing: true       # Browser-based
    privacy_first: true          # Local processing
    no_uploads_required: true    # No uploads needed
    browser_extension: true      # Chrome extension
    free_tier_available: true    # Free to use
    fast_processing: true        # Quick conversion

  generic_conversion:
    browser_extension: true      # Chrome extension
    free_tier_available: true    # Free features
    fast_processing: true        # Fast processing
`;

  const fs = require('fs');
  fs.writeFileSync(outputPath, defaultYaml, 'utf8');
  logger.info(`✅ Default claims configuration written to ${outputPath}`);
}

/**
 * Validate claims for a product and generate report
 */
export async function validateProductClaims(
  clusters: KeywordCluster[],
  productName: string,
  configPath?: string
): Promise<ProductClaimsValidation> {
  const validator = new UseCaseLevelClaimsValidator(configPath);
  return await validator.validateProductClaims(clusters, productName);
}