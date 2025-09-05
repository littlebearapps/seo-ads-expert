/**
 * Landing Page Experiment Writer - Generates A/B test configurations and content
 * Creates variant files and routing logic for landing page experiments
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import type { Experiment, PageVariant } from '../experiments/experiment-manager.js';

export interface LandingPageVariantFiles {
  variantA: string;
  variantB: string;
  routing: string;
  config: string;
}

export interface ABTestConfig {
  experimentId: string;
  variants: {
    id: string;
    name: string;
    weight: number;
    path: string;
    isControl: boolean;
  }[];
  cookieName: string;
  cookieExpiry: number;
  trackingEvents: string[];
  analyticsConfig: {
    googleAnalytics?: {
      measurementId: string;
      customDimensions: Record<string, number>;
    };
    plausible?: {
      domain: string;
      customProps: string[];
    };
  };
}

export interface RoutingRule {
  condition: string;
  variant: string;
  weight: number;
}

export class LandingPageExperimentWriter {
  private outputDir: string;

  constructor(outputDir: string = 'experiments/exports') {
    this.outputDir = outputDir;
  }

  /**
   * Generate variant content files for landing page experiment
   */
  async generateVariantFiles(
    experiment: Experiment,
    variants: PageVariant[]
  ): Promise<LandingPageVariantFiles> {
    logger.info(`📄 Generating landing page variants for experiment ${experiment.id}`);

    // Ensure output directory exists
    const experimentDir = path.join(this.outputDir, experiment.id);
    await fs.mkdir(experimentDir, { recursive: true });

    const files: Partial<LandingPageVariantFiles> = {};

    // Generate content for each variant
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const variantKey = `variant${String.fromCharCode(65 + i)}` as keyof LandingPageVariantFiles; // A, B, C...
      
      if (variantKey === 'routing' || variantKey === 'config') continue; // Skip non-variant keys

      const content = await this.generateVariantContent(experiment, variant);
      const filename = `${variantKey.toLowerCase()}.html`;
      const filepath = path.join(experimentDir, filename);
      
      await fs.writeFile(filepath, content, 'utf-8');
      files[variantKey] = content;

      logger.debug(`✅ Generated ${variantKey}: ${filepath}`);
    }

    // Generate routing configuration
    const routingConfig = this.generateRoutingConfig(experiment, variants);
    const routingPath = path.join(experimentDir, 'routing.js');
    await fs.writeFile(routingPath, routingConfig, 'utf-8');
    files.routing = routingConfig;

    // Generate A/B test configuration
    const abTestConfig = await this.generateTestConfig(experiment, variants);
    const configPath = path.join(experimentDir, 'ab-test-config.json');
    await fs.writeFile(configPath, JSON.stringify(abTestConfig, null, 2), 'utf-8');
    files.config = JSON.stringify(abTestConfig, null, 2);

    logger.info(`✅ Generated landing page experiment files in ${experimentDir}`);

    return files as LandingPageVariantFiles;
  }

  /**
   * Generate HTML content for a variant
   */
  private async generateVariantContent(experiment: Experiment, variant: PageVariant): Promise<string> {
    const baseContent = await this.getBasePageContent(variant.contentPath);
    const modifications = this.extractContentModifications(variant);

    // Apply content modifications
    let modifiedContent = baseContent;
    
    for (const [selector, changes] of Object.entries(modifications)) {
      modifiedContent = this.applyContentChanges(modifiedContent, selector, changes);
    }

    // Add A/B test tracking script
    const trackingScript = this.generateTrackingScript(experiment, variant);
    modifiedContent = modifiedContent.replace(
      '</head>', 
      `${trackingScript}\n</head>`
    );

    // Add experiment metadata
    const metaTag = `<meta name="ab-experiment" content="${experiment.id}" data-variant="${variant.id}" data-variant-name="${variant.name}" data-is-control="${variant.isControl}">`;
    modifiedContent = modifiedContent.replace(
      '</head>',
      `${metaTag}\n</head>`
    );

    return modifiedContent;
  }

  /**
   * Get base page content (placeholder - would integrate with actual CMS)
   */
  private async getBasePageContent(contentPath: string): Promise<string> {
    // Placeholder implementation - in practice would load from CMS or template system
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title data-testable="title">Product Landing Page</title>
    <meta name="description" content="Convert your files easily with our Chrome extension" data-testable="description">
    
    <!-- CSS and other head elements -->
    <link rel="stylesheet" href="/css/landing.css">
</head>
<body>
    <header data-testable="header">
        <nav>
            <div class="logo">
                <h1 data-testable="logo-text">ConvertMyFile</h1>
            </div>
        </nav>
    </header>

    <main>
        <section class="hero" data-testable="hero-section">
            <div class="container">
                <h1 data-testable="hero-headline">Convert Files Instantly in Your Browser</h1>
                <p data-testable="hero-subheadline">The fastest Chrome extension for file conversion</p>
                <div class="cta-buttons">
                    <a href="#" class="btn-primary" data-testable="primary-cta">Add to Chrome - Free</a>
                    <a href="#" class="btn-secondary" data-testable="secondary-cta">Watch Demo</a>
                </div>
            </div>
        </section>

        <section class="features" data-testable="features-section">
            <div class="container">
                <h2 data-testable="features-headline">Why Choose ConvertMyFile?</h2>
                <div class="feature-grid">
                    <div class="feature-card" data-testable="feature-1">
                        <h3>Lightning Fast</h3>
                        <p>Convert files in seconds, not minutes</p>
                    </div>
                    <div class="feature-card" data-testable="feature-2">
                        <h3>100% Secure</h3>
                        <p>All conversions happen locally in your browser</p>
                    </div>
                    <div class="feature-card" data-testable="feature-3">
                        <h3>No Limits</h3>
                        <p>Convert unlimited files for free</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="social-proof" data-testable="social-proof-section">
            <div class="container">
                <h2 data-testable="social-proof-headline">Trusted by 50,000+ Users</h2>
                <div class="testimonials" data-testable="testimonials">
                    <blockquote>
                        <p>"This extension saved me hours of work!"</p>
                        <cite>- Sarah M., Designer</cite>
                    </blockquote>
                </div>
            </div>
        </section>

        <section class="faq" data-testable="faq-section">
            <div class="container">
                <h2 data-testable="faq-headline">Frequently Asked Questions</h2>
                <div class="faq-list" data-testable="faq-list">
                    <div class="faq-item">
                        <h3>Is it really free?</h3>
                        <p>Yes, completely free with no hidden costs.</p>
                    </div>
                    <div class="faq-item">
                        <h3>What file types are supported?</h3>
                        <p>We support over 50 file formats including PDF, DOCX, images, and more.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="final-cta" data-testable="final-cta-section">
            <div class="container">
                <h2 data-testable="final-cta-headline">Ready to Get Started?</h2>
                <p data-testable="final-cta-text">Join thousands of users who convert files effortlessly</p>
                <a href="#" class="btn-primary large" data-testable="final-cta-button">Add to Chrome Now</a>
            </div>
        </section>
    </main>

    <footer data-testable="footer">
        <div class="container">
            <p>&copy; 2024 ConvertMyFile. All rights reserved.</p>
        </div>
    </footer>

    <!-- JavaScript -->
    <script src="/js/landing.js"></script>
</body>
</html>`;
  }

  /**
   * Extract content modifications from variant metadata
   */
  private extractContentModifications(variant: PageVariant): Record<string, any> {
    // Default modifications based on common A/B test strategies
    const modifications: Record<string, any> = {};

    if (variant.metadata.strategy === 'headline_benefit') {
      modifications['[data-testable="hero-headline"]'] = {
        text: 'Save Hours with Instant File Conversion'
      };
      modifications['[data-testable="hero-subheadline"]'] = {
        text: 'Convert any file format in seconds with our powerful Chrome extension'
      };
    }

    if (variant.metadata.strategy === 'headline_feature') {
      modifications['[data-testable="hero-headline"]'] = {
        text: 'Convert 50+ File Formats Instantly'
      };
      modifications['[data-testable="hero-subheadline"]'] = {
        text: 'The most comprehensive file converter for Chrome'
      };
    }

    if (variant.metadata.strategy === 'social_proof_emphasis') {
      modifications['[data-testable="social-proof-headline"]'] = {
        text: 'Join 50,000+ Happy Users Who Love ConvertMyFile'
      };
      modifications['[data-testable="hero-headline"]'] = {
        text: 'The #1 File Converter Trusted by 50,000+ Users'
      };
    }

    if (variant.metadata.strategy === 'urgency_driven') {
      modifications['[data-testable="primary-cta"]'] = {
        text: 'Start Converting Now - Free'
      };
      modifications['[data-testable="final-cta-button"]'] = {
        text: 'Get Instant Access'
      };
      modifications['[data-testable="final-cta-headline"]'] = {
        text: 'Stop Wasting Time with Slow Converters'
      };
    }

    if (variant.metadata.strategy === 'faq_reorder') {
      modifications['[data-testable="faq-list"]'] = {
        reorder: ['pricing', 'features', 'security', 'support']
      };
    }

    return modifications;
  }

  /**
   * Apply content changes to HTML
   */
  private applyContentChanges(html: string, selector: string, changes: any): string {
    // Simple text replacement for demo - in practice would use proper DOM manipulation
    if (changes.text) {
      const regex = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>)([^<]*)(</[^>]*>)`, 'i');
      html = html.replace(regex, `$1${changes.text}$3`);
    }

    return html;
  }

  /**
   * Generate JavaScript routing configuration
   */
  private generateRoutingConfig(experiment: Experiment, variants: PageVariant[]): string {
    return `/**
 * A/B Test Routing Configuration for ${experiment.id}
 * Generated by SEO Ads Expert v1.5
 */

class ABTestRouter {
  constructor(config) {
    this.experimentId = config.experimentId;
    this.variants = config.variants;
    this.cookieName = config.cookieName || 'ab_test_assignment';
    this.cookieExpiry = config.cookieExpiry || 30; // days
  }

  // Get or create user assignment
  getUserAssignment() {
    // Check existing cookie
    const existingAssignment = this.getCookie(this.cookieName);
    if (existingAssignment) {
      try {
        const assignment = JSON.parse(existingAssignment);
        if (assignment.experimentId === this.experimentId && !this.isExpired(assignment.expiresAt)) {
          return assignment;
        }
      } catch (e) {
        // Invalid cookie, create new assignment
      }
    }

    // Create new assignment
    return this.createNewAssignment();
  }

  // Create new random assignment
  createNewAssignment() {
    const random = Math.random();
    let cumulativeWeight = 0;
    
    for (const variant of this.variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        const assignment = {
          experimentId: this.experimentId,
          variantId: variant.id,
          variantName: variant.name,
          isControl: variant.isControl,
          assignedAt: Date.now(),
          expiresAt: Date.now() + (this.cookieExpiry * 24 * 60 * 60 * 1000)
        };
        
        this.setCookie(this.cookieName, JSON.stringify(assignment), this.cookieExpiry);
        return assignment;
      }
    }
    
    // Fallback to control
    const controlVariant = this.variants.find(v => v.isControl) || this.variants[0];
    const assignment = {
      experimentId: this.experimentId,
      variantId: controlVariant.id,
      variantName: controlVariant.name,
      isControl: true,
      assignedAt: Date.now(),
      expiresAt: Date.now() + (this.cookieExpiry * 24 * 60 * 60 * 1000)
    };
    
    this.setCookie(this.cookieName, JSON.stringify(assignment), this.cookieExpiry);
    return assignment;
  }

  // Route user to appropriate variant
  routeUser() {
    const assignment = this.getUserAssignment();
    const variant = this.variants.find(v => v.id === assignment.variantId);
    
    if (!variant) {
      console.warn(\`Variant \${assignment.variantId} not found, using control\`);
      const controlVariant = this.variants.find(v => v.isControl) || this.variants[0];
      window.location.href = controlVariant.path;
      return;
    }

    // Track exposure
    this.trackExposure(assignment);

    // Redirect if needed (avoid infinite loops)
    const currentPath = window.location.pathname;
    if (currentPath !== variant.path && !currentPath.includes(variant.path)) {
      window.location.href = variant.path;
    }
  }

  // Track variant exposure
  trackExposure(assignment) {
    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
      gtag('event', 'ab_test_exposure', {
        experiment_id: this.experimentId,
        variant_id: assignment.variantId,
        variant_name: assignment.variantName,
        is_control: assignment.isControl,
        custom_map: {
          custom_dimension_1: assignment.variantId
        }
      });
    }

    // Plausible Analytics
    if (typeof plausible !== 'undefined') {
      plausible('AB Test Exposure', {
        props: {
          experiment: this.experimentId,
          variant: assignment.variantId,
          is_control: assignment.isControl
        }
      });
    }

    // Custom tracking endpoint
    fetch('/api/ab-test/exposure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        experimentId: this.experimentId,
        variantId: assignment.variantId,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        referrer: document.referrer
      })
    }).catch(console.error);
  }

  // Utility methods
  getCookie(name) {
    const value = \`; \${document.cookie}\`;
    const parts = value.split(\`; \${name}=\`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  }

  setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = \`\${name}=\${value}; expires=\${expires}; path=/; SameSite=Lax\`;
  }

  isExpired(timestamp) {
    return Date.now() > timestamp;
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const config = ${JSON.stringify(this.generateTestConfig(experiment, variants), null, 2)};
  const router = new ABTestRouter(config);
  router.routeUser();
});`;
  }

  /**
   * Generate A/B test configuration
   */
  async generateTestConfig(experiment: Experiment, variants: PageVariant[]): Promise<ABTestConfig> {
    return {
      experimentId: experiment.id,
      variants: variants.map(variant => ({
        id: variant.id,
        name: variant.name,
        weight: variant.weight,
        path: variant.contentPath,
        isControl: variant.isControl
      })),
      cookieName: `ab_${experiment.id}`,
      cookieExpiry: 30, // days
      trackingEvents: [
        'page_view',
        'cta_click',
        'form_submit',
        'download_start',
        'conversion'
      ],
      analyticsConfig: {
        googleAnalytics: {
          measurementId: 'G-XXXXXXXXXX', // To be configured
          customDimensions: {
            experiment_id: 1,
            variant_id: 2,
            variant_name: 3
          }
        },
        plausible: {
          domain: experiment.product.toLowerCase() + '.com',
          customProps: [
            'experiment',
            'variant',
            'is_control'
          ]
        }
      }
    };
  }

  /**
   * Generate launch instructions for landing page experiment
   */
  async generateLaunchInstructions(
    experiment: Experiment,
    variants: PageVariant[]
  ): Promise<string> {
    const instructions = `# Landing Page Experiment Launch Instructions

## Experiment Details
- **ID**: ${experiment.id}
- **Product**: ${experiment.product}
- **Target Metric**: ${experiment.targetMetric.toUpperCase()}
- **Page Path**: ${experiment.targetId}
- **Minimum Sample Size**: ${experiment.minimumSampleSize} per variant
- **Confidence Level**: ${(experiment.confidenceLevel * 100).toFixed(1)}%

## Hypothesis
${experiment.metadata.hypothesis}

## Variants (${variants.length})

${variants.map((variant, index) => `
### ${index + 1}. ${variant.name} ${variant.isControl ? '(Control)' : ''}
- **Weight**: ${(variant.weight * 100).toFixed(1)}%
- **Path**: ${variant.contentPath}
- **Strategy**: ${variant.metadata.strategy || 'baseline'}

**Key Changes:**
${variant.metadata.changes ? Object.entries(variant.metadata.changes).map(([key, value]) => `- ${key}: ${value}`).join('\n') : '- None (control variant)'}
`).join('\n')}

## Technical Setup

### 1. Deploy Variant Files
Upload the generated HTML files to your web server:
\`\`\`bash
# Copy variant files
cp ${experiment.id}/varianta.html /var/www/html/${variants[0].contentPath}
cp ${experiment.id}/variantb.html /var/www/html/${variants[1]?.contentPath || 'variant-b.html'}

# Deploy routing script
cp ${experiment.id}/routing.js /var/www/html/js/
\`\`\`

### 2. Configure Analytics
Update the analytics configuration in \`ab-test-config.json\`:
- Set your Google Analytics Measurement ID
- Configure custom dimensions
- Update Plausible domain settings

### 3. A/B Test Integration
Add the routing script to your base template:
\`\`\`html
<script src="/js/routing.js"></script>
\`\`\`

### 4. Conversion Tracking Setup
Ensure conversion events are properly tracked:
\`\`\`javascript
// Example: Track form submission
document.getElementById('signup-form').addEventListener('submit', (e) => {
  gtag('event', 'conversion', {
    experiment_id: '${experiment.id}',
    variant_id: getCurrentVariant(),
    conversion_type: 'signup'
  });
});
\`\`\`

## Launch Steps

### 1. Pre-Launch Checklist
- [ ] All variant pages render correctly
- [ ] Routing script is deployed and functional
- [ ] Analytics tracking is configured
- [ ] Conversion events are firing
- [ ] Mobile responsiveness tested
- [ ] Page load times are acceptable (<3s)

### 2. Traffic Allocation
${variants.map(v => `- ${v.name}: ${(v.weight * 100).toFixed(1)}%`).join('\n')}

### 3. Go Live Process
1. Deploy all files simultaneously
2. Test the routing for a few users
3. Monitor real-time analytics for issues
4. Gradually increase traffic if stable

### 4. Monitoring Setup
- Real-time conversion tracking
- Page performance monitoring
- Error tracking and alerting
- Daily statistical analysis

## Success Criteria
${experiment.metadata.successCriteria}

## Analysis Schedule
- **Daily**: Performance monitoring and quality checks
- **Weekly**: Statistical significance testing
- **End of Test**: Winner implementation

## Emergency Rollback
If issues occur:
1. Remove routing script to serve only control
2. Monitor analytics for return to baseline
3. Investigate and fix issues before retry

## Expected Results Timeline
- **Day 1-3**: Traffic stabilization
- **Day 4-7**: Initial trend detection
- **Day 8-14**: Statistical significance
- **Day 15+**: Winner declaration and implementation

---
Generated by SEO Ads Expert v1.5 on ${new Date().toISOString()}
`;

    // Save instructions to file
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const instructionsFile = path.join(this.outputDir, `${experiment.id}_lp_launch_instructions_${timestamp}.md`);
    await fs.writeFile(instructionsFile, instructions, 'utf-8');

    logger.info(`✅ Generated LP launch instructions: ${instructionsFile}`);

    return instructions;
  }

  /**
   * Generate tracking script for variant
   */
  private generateTrackingScript(experiment: Experiment, variant: PageVariant): string {
    return `
<script>
// A/B Test Variant Tracking for ${experiment.id}
(function() {
  const variantData = {
    experimentId: '${experiment.id}',
    variantId: '${variant.id}',
    variantName: '${variant.name}',
    isControl: ${variant.isControl},
    weight: ${variant.weight}
  };

  // Store variant data for use by other scripts
  window.abTestVariant = variantData;

  // Track page view with variant info
  if (typeof gtag !== 'undefined') {
    gtag('event', 'ab_test_page_view', {
      experiment_id: variantData.experimentId,
      variant_id: variantData.variantId,
      variant_name: variantData.variantName,
      is_control: variantData.isControl
    });
  }

  // Plausible tracking
  if (typeof plausible !== 'undefined') {
    plausible('AB Test Page View', {
      props: {
        experiment: variantData.experimentId,
        variant: variantData.variantId,
        is_control: variantData.isControl
      }
    });
  }
})();
</script>`;
  }
}

// Export singleton instance
export const lpExperimentWriter = new LandingPageExperimentWriter();