/**
 * RSA Experiment Writer - Generates Google Ads exports for RSA A/B tests
 * Creates CSV files for Google Ads Editor and API mutations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { stringify } from 'csv-stringify/sync';
import { logger } from '../utils/logger.js';
import type { Experiment, RSAVariant } from '../experiments/experiment-manager.js';

export interface GoogleAdsEditorCSV {
  ads: string;
  labels: string;
}

export interface GoogleAdsMutation {
  operationType: 'CREATE' | 'UPDATE' | 'REMOVE';
  resource: 'ad_group_ad' | 'label' | 'ad_group_ad_label';
  fields: Record<string, any>;
}

export interface RSAAdRow {
  'Ad group': string;
  'Ad type': string;
  'Status': string;
  'Headline 1': string;
  'Headline 2': string;
  'Headline 3': string;
  'Headline 4'?: string;
  'Headline 5'?: string;
  'Description 1': string;
  'Description 2': string;
  'Description 3'?: string;
  'Final URL': string;
  'Labels': string;
}

export interface LabelRow {
  'Label': string;
  'Description': string;
}

export class RSAExperimentWriter {
  private outputDir: string;

  constructor(outputDir: string = 'experiments/exports') {
    this.outputDir = outputDir;
  }

  /**
   * Generate Google Ads Editor CSV files for RSA experiment
   */
  async generateEditorCSV(
    experiment: Experiment,
    variants: RSAVariant[]
  ): Promise<GoogleAdsEditorCSV> {
    logger.info(`📊 Generating Google Ads Editor CSV for experiment ${experiment.id}`);

    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });

    // Generate ads CSV
    const adRows: RSAAdRow[] = [];
    const labelSet = new Set<string>();

    for (const variant of variants) {
      const label = `EXP_${experiment.id.toUpperCase()}_${variant.id.toUpperCase()}`;
      labelSet.add(label);

      // Create ad row
      const adRow: RSAAdRow = {
        'Ad group': experiment.targetId,
        'Ad type': 'Responsive search ad',
        'Status': 'Paused', // Always create paused for safety
        'Headline 1': variant.headlines[0] || '',
        'Headline 2': variant.headlines[1] || '',
        'Headline 3': variant.headlines[2] || '',
        'Description 1': variant.descriptions[0] || '',
        'Description 2': variant.descriptions[1] || '',
        'Final URL': variant.finalUrls[0] || '',
        'Labels': label
      };

      // Add optional headlines and descriptions
      if (variant.headlines[3]) adRow['Headline 4'] = variant.headlines[3];
      if (variant.headlines[4]) adRow['Headline 5'] = variant.headlines[4];
      if (variant.descriptions[2]) adRow['Description 3'] = variant.descriptions[2];

      adRows.push(adRow);
    }

    // Generate labels CSV
    const labelRows: LabelRow[] = Array.from(labelSet).map(label => ({
      'Label': label,
      'Description': `A/B test variant for ${experiment.product} - ${experiment.metadata.description}`
    }));

    // Convert to CSV strings
    const adsCSV = stringify(adRows, { 
      header: true,
      columns: [
        'Ad group', 'Ad type', 'Status', 
        'Headline 1', 'Headline 2', 'Headline 3', 'Headline 4', 'Headline 5',
        'Description 1', 'Description 2', 'Description 3',
        'Final URL', 'Labels'
      ]
    });

    const labelsCSV = stringify(labelRows, { 
      header: true,
      columns: ['Label', 'Description']
    });

    // Save CSV files
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const adsFile = path.join(this.outputDir, `${experiment.id}_ads_${timestamp}.csv`);
    const labelsFile = path.join(this.outputDir, `${experiment.id}_labels_${timestamp}.csv`);

    await fs.writeFile(adsFile, adsCSV, 'utf-8');
    await fs.writeFile(labelsFile, labelsCSV, 'utf-8');

    logger.info(`✅ Generated CSV files:
      - Ads: ${adsFile}
      - Labels: ${labelsFile}`);

    return {
      ads: adsCSV,
      labels: labelsCSV
    };
  }

  /**
   * Generate Google Ads API mutations
   */
  async generateAPIMutations(
    experiment: Experiment,
    variants: RSAVariant[]
  ): Promise<GoogleAdsMutation[]> {
    logger.info(`🔧 Generating Google Ads API mutations for experiment ${experiment.id}`);

    const mutations: GoogleAdsMutation[] = [];
    const createdLabels = new Set<string>();

    for (const variant of variants) {
      const label = `EXP_${experiment.id.toUpperCase()}_${variant.id.toUpperCase()}`;

      // Create label if not already created
      if (!createdLabels.has(label)) {
        mutations.push({
          operationType: 'CREATE',
          resource: 'label',
          fields: {
            name: label,
            description: `A/B test variant for ${experiment.product} - ${experiment.metadata.description}`,
            color: this.getLabelColor(variant.isControl)
          }
        });
        createdLabels.add(label);
      }

      // Create responsive search ad
      mutations.push({
        operationType: 'CREATE',
        resource: 'ad_group_ad',
        fields: {
          adGroup: experiment.targetId,
          status: 'PAUSED', // Always create paused for safety
          ad: {
            type: 'RESPONSIVE_SEARCH_AD',
            responsiveSearchAd: {
              headlines: variant.headlines.map((headline, index) => ({
                text: headline,
                pinnedField: index === 0 ? 'HEADLINE_1' : undefined // Pin first headline
              })),
              descriptions: variant.descriptions.map(description => ({
                text: description
              })),
              path1: this.extractPathFromUrl(variant.finalUrls[0], 1),
              path2: this.extractPathFromUrl(variant.finalUrls[0], 2)
            },
            finalUrls: variant.finalUrls
          }
        }
      });

      // Apply label to ad
      mutations.push({
        operationType: 'CREATE',
        resource: 'ad_group_ad_label',
        fields: {
          adGroupAd: `customers/{customer_id}/adGroupAds/{ad_group_id}~{ad_id}`, // Template
          label: `customers/{customer_id}/labels/{label_id}` // Template
        }
      });
    }

    // Save mutations to file
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const mutationsFile = path.join(this.outputDir, `${experiment.id}_mutations_${timestamp}.json`);
    await fs.writeFile(mutationsFile, JSON.stringify(mutations, null, 2), 'utf-8');

    logger.info(`✅ Generated ${mutations.length} API mutations: ${mutationsFile}`);

    return mutations;
  }

  /**
   * Generate experiment launch instructions
   */
  async generateLaunchInstructions(
    experiment: Experiment,
    variants: RSAVariant[]
  ): Promise<string> {
    const instructions = `# RSA Experiment Launch Instructions

## Experiment Details
- **ID**: ${experiment.id}
- **Product**: ${experiment.product}
- **Target Metric**: ${experiment.targetMetric.toUpperCase()}
- **Ad Group**: ${experiment.targetId}
- **Minimum Sample Size**: ${experiment.minimumSampleSize} per variant
- **Confidence Level**: ${(experiment.confidenceLevel * 100).toFixed(1)}%

## Hypothesis
${experiment.metadata.hypothesis}

## Variants (${variants.length})

${variants.map((variant, index) => `
### ${index + 1}. ${variant.name} ${variant.isControl ? '(Control)' : ''}
- **Weight**: ${(variant.weight * 100).toFixed(1)}%
- **Label**: EXP_${experiment.id.toUpperCase()}_${variant.id.toUpperCase()}

**Headlines:**
${variant.headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}

**Descriptions:**
${variant.descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

**Final URLs:**
${variant.finalUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}
`).join('\n')}

## Launch Steps

### 1. Upload to Google Ads Editor
1. Import the generated CSV files:
   - \`${experiment.id}_ads_[timestamp].csv\`
   - \`${experiment.id}_labels_[timestamp].csv\`
2. Review all ads for compliance with brand guidelines
3. Verify final URLs are working correctly
4. Post changes to Google Ads (ads will be PAUSED)

### 2. Traffic Allocation
- Control variant: ${(variants.find(v => v.isControl)?.weight || 0.5) * 100}%
- Test variants: ${variants.filter(v => !v.isControl).map(v => `${v.name} ${(v.weight * 100).toFixed(1)}%`).join(', ')}

### 3. Pre-Launch Checklist
- [ ] All ads approved by Google Ads
- [ ] Landing pages are live and functional
- [ ] Conversion tracking is active
- [ ] Budget sufficient for ${experiment.minimumSampleSize * variants.length} samples
- [ ] Team notified of experiment start

### 4. Launch Process
1. Enable ads simultaneously (set to ENABLED)
2. Monitor for first 24 hours for any issues
3. Run daily analysis after minimum sample size reached

### 5. Monitoring
- Check daily performance via experiment dashboard
- Watch for statistical significance
- Monitor budget consumption
- Alert if performance degrades significantly

### 6. Success Criteria
${experiment.metadata.successCriteria}

### 7. Expected Duration
- Minimum: ${experiment.guards.find(g => g.type === 'duration')?.threshold || 7} days
- Expected: Based on traffic volume to reach ${experiment.minimumSampleSize} samples per variant

## Emergency Stop Conditions
- Significant decrease in conversion rate (>20%)
- Budget consumption exceeding daily limits
- Technical issues with landing pages
- Compliance violations

## Analysis Schedule
- **Daily**: Basic performance monitoring
- **Weekly**: Full statistical analysis
- **End of Test**: Winner declaration and rollout plan

---
Generated by SEO Ads Expert v1.5 on ${new Date().toISOString()}
`;

    // Save instructions to file
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const instructionsFile = path.join(this.outputDir, `${experiment.id}_launch_instructions_${timestamp}.md`);
    await fs.writeFile(instructionsFile, instructions, 'utf-8');

    logger.info(`✅ Generated launch instructions: ${instructionsFile}`);

    return instructions;
  }

  /**
   * Generate ValueTrack URL parameters for variant tracking
   */
  generateValueTrackParams(experiment: Experiment, variant: RSAVariant): Record<string, string> {
    return {
      exp_id: experiment.id,
      var_id: variant.id,
      var_name: variant.name.replace(/\s+/g, '_').toLowerCase(),
      is_control: variant.isControl ? '1' : '0',
      utm_campaign: `${experiment.product}_${experiment.type}_test`,
      utm_content: `${variant.id}_${variant.isControl ? 'control' : 'variant'}`,
      utm_term: '{keyword}',
      gclid: '{gclid}',
      device: '{device}',
      placement: '{placement}'
    };
  }

  /**
   * Get label color based on variant type
   */
  private getLabelColor(isControl: boolean): string {
    return isControl ? 'BLUE' : 'GREEN';
  }

  /**
   * Extract path segments from URL for Google Ads
   */
  private extractPathFromUrl(url: string, segment: number): string {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      return pathSegments[segment - 1] || '';
    } catch {
      return '';
    }
  }

  /**
   * Validate RSA ad assets
   */
  validateRSAAssets(variant: RSAVariant): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Headlines validation
    if (variant.headlines.length < 3) {
      errors.push('At least 3 headlines required');
    }
    if (variant.headlines.length > 15) {
      errors.push('Maximum 15 headlines allowed');
    }
    variant.headlines.forEach((headline, index) => {
      if (headline.length > 30) {
        errors.push(`Headline ${index + 1} exceeds 30 characters`);
      }
    });

    // Descriptions validation
    if (variant.descriptions.length < 2) {
      errors.push('At least 2 descriptions required');
    }
    if (variant.descriptions.length > 4) {
      errors.push('Maximum 4 descriptions allowed');
    }
    variant.descriptions.forEach((description, index) => {
      if (description.length > 90) {
        errors.push(`Description ${index + 1} exceeds 90 characters`);
      }
    });

    // Final URLs validation
    if (variant.finalUrls.length === 0) {
      errors.push('At least 1 final URL required');
    }
    variant.finalUrls.forEach((url, index) => {
      try {
        new URL(url);
      } catch {
        errors.push(`Final URL ${index + 1} is not valid`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const rsaExperimentWriter = new RSAExperimentWriter();