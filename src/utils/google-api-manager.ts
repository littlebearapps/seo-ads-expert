/**
 * Google API Manager
 * Comprehensive API setup checker and quota manager
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.js';

export interface APIStatus {
  service: string;
  enabled: boolean;
  hasQuota: boolean;
  quotaDetails?: any;
  credentials: 'none' | 'oauth' | 'service-account' | 'adc';
  error?: string;
}

export interface ProjectInfo {
  projectId: string;
  projectName: string;
  billingEnabled: boolean;
  budgetAlerts: any[];
}

export class GoogleAPIManager {
  private auth: any;
  private projectId: string;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
  }

  /**
   * Initialize authentication using available methods
   */
  async initializeAuth(): Promise<boolean> {
    try {
      // Method 1: Try service account from GOOGLE_APPLICATION_CREDENTIALS
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          this.auth = new google.auth.GoogleAuth({
            scopes: [
              'https://www.googleapis.com/auth/cloud-platform',
              'https://www.googleapis.com/auth/adwords',
              'https://www.googleapis.com/auth/analytics.readonly',
              'https://www.googleapis.com/auth/webmasters.readonly'
            ]
          });
          
          const authClient = await this.auth.getClient();
          const projectId = await this.auth.getProjectId();
          this.projectId = projectId;
          
          logger.info('✅ Service Account authentication successful');
          return true;
        } catch (error) {
          logger.warn('Service account auth failed, trying OAuth...');
        }
      }

      // Method 2: Try OAuth with refresh token
      if (process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_REFRESH_TOKEN) {
        try {
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_ADS_CLIENT_ID,
            process.env.GOOGLE_ADS_CLIENT_SECRET,
            'urn:ietf:wg:oauth:2.0:oob'
          );

          oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN
          });

          this.auth = oauth2Client;
          logger.info('✅ OAuth authentication successful');
          return true;
        } catch (error) {
          logger.warn('OAuth auth failed:', error);
        }
      }

      // Method 3: Try Application Default Credentials
      try {
        this.auth = new google.auth.GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/adwords',
            'https://www.googleapis.com/auth/analytics.readonly',
            'https://www.googleapis.com/auth/webmasters.readonly'
          ]
        });

        const authClient = await this.auth.getClient();
        const projectId = await this.auth.getProjectId();
        this.projectId = projectId;
        
        logger.info('✅ Application Default Credentials successful');
        return true;
      } catch (error) {
        logger.error('All authentication methods failed:', error);
        return false;
      }

    } catch (error) {
      logger.error('Authentication initialization failed:', error);
      return false;
    }
  }

  /**
   * Check project information and billing status
   */
  async checkProjectInfo(): Promise<ProjectInfo> {
    if (!this.auth) throw new Error('Authentication not initialized');

    try {
      const cloudresourcemanager = google.cloudresourcemanager({ version: 'v1', auth: this.auth });
      const cloudbilling = google.cloudbilling({ version: 'v1', auth: this.auth });

      // Get project info
      const project = await cloudresourcemanager.projects.get({
        projectId: this.projectId
      });

      // Check billing
      let billingEnabled = false;
      try {
        const billingInfo = await cloudbilling.projects.getBillingInfo({
          name: `projects/${this.projectId}`
        });
        billingEnabled = !!billingInfo.data.billingEnabled;
      } catch (error) {
        logger.warn('Could not check billing status:', error);
      }

      return {
        projectId: this.projectId,
        projectName: project.data.name || 'Unknown',
        billingEnabled,
        budgetAlerts: [] // TODO: Implement budget checking
      };

    } catch (error) {
      logger.error('Error checking project info:', error);
      throw error;
    }
  }

  /**
   * Check status of all required APIs
   */
  async checkAPIStatuses(): Promise<APIStatus[]> {
    if (!this.auth) throw new Error('Authentication not initialized');

    const requiredAPIs = [
      {
        service: 'Google Ads API',
        name: 'googleads.googleapis.com',
        quotaService: 'googleads.googleapis.com'
      },
      {
        service: 'Google Analytics Data API',
        name: 'analyticsdata.googleapis.com',
        quotaService: 'analyticsdata.googleapis.com'
      },
      {
        service: 'Google Search Console API',
        name: 'searchconsole.googleapis.com',
        quotaService: 'webmasters.googleapis.com'
      }
    ];

    const results: APIStatus[] = [];

    try {
      const serviceusage = google.serviceusage({ version: 'v1', auth: this.auth });

      for (const api of requiredAPIs) {
        try {
          // Check if API is enabled
          const service = await serviceusage.services.get({
            name: `projects/${this.projectId}/services/${api.name}`
          });

          const enabled = service.data.state === 'ENABLED';

          // Get quota information
          let quotaDetails = null;
          let hasQuota = false;

          if (enabled) {
            try {
              const quotas = await serviceusage.services.consumerQuotaMetrics.list({
                parent: `projects/${this.projectId}/services/${api.quotaService}`
              });

              if (quotas.data.metrics && quotas.data.metrics.length > 0) {
                hasQuota = true;
                quotaDetails = quotas.data.metrics.map(metric => ({
                  name: metric.displayName,
                  metric: metric.metric,
                  unit: metric.unit
                }));
              }
            } catch (quotaError) {
              logger.warn(`Could not fetch quota for ${api.service}:`, quotaError);
            }
          }

          results.push({
            service: api.service,
            enabled,
            hasQuota,
            quotaDetails,
            credentials: this.getCredentialsType(),
            error: undefined
          });

        } catch (error) {
          results.push({
            service: api.service,
            enabled: false,
            hasQuota: false,
            credentials: this.getCredentialsType(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

    } catch (error) {
      logger.error('Error checking API statuses:', error);
      throw error;
    }

    return results;
  }

  /**
   * Enable APIs that are not enabled
   */
  async enableAPIs(apiNames: string[]): Promise<{ [key: string]: boolean }> {
    if (!this.auth) throw new Error('Authentication not initialized');

    const results: { [key: string]: boolean } = {};
    const serviceusage = google.serviceusage({ version: 'v1', auth: this.auth });

    for (const apiName of apiNames) {
      try {
        logger.info(`Enabling API: ${apiName}`);
        
        const operation = await serviceusage.services.enable({
          name: `projects/${this.projectId}/services/${apiName}`
        });

        // Wait for operation to complete
        if (operation.data.name) {
          // Poll for completion (simplified)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        results[apiName] = true;
        logger.info(`✅ Successfully enabled ${apiName}`);

      } catch (error) {
        logger.error(`❌ Failed to enable ${apiName}:`, error);
        results[apiName] = false;
      }
    }

    return results;
  }

  /**
   * Set conservative quotas for APIs
   */
  async setConservativeQuotas(): Promise<void> {
    if (!this.auth) throw new Error('Authentication not initialized');

    logger.info('Setting conservative API quotas...');

    // Note: Quota modification requires special permissions and is usually done via Console
    logger.warn('Quota modification requires administrative access through Google Cloud Console');
    logger.info('Recommended conservative quotas:');
    logger.info('- Google Ads API: 1,000 operations/day');
    logger.info('- Analytics Data API: 5,000 requests/day');
    logger.info('- Search Console API: 1,000 requests/day');
  }

  /**
   * Generate comprehensive API setup report
   */
  async generateAPIReport(): Promise<string> {
    const report: string[] = [];
    
    report.push('# Google APIs Setup Report');
    report.push(`*Generated: ${new Date().toISOString()}*\n`);

    try {
      // Project information
      const projectInfo = await this.checkProjectInfo();
      report.push('## Project Information\n');
      report.push(`- **Project ID**: ${projectInfo.projectId}`);
      report.push(`- **Project Name**: ${projectInfo.projectName}`);
      report.push(`- **Billing Enabled**: ${projectInfo.billingEnabled ? '✅ Yes' : '❌ No'}`);
      report.push('');

      // API statuses
      const apiStatuses = await this.checkAPIStatuses();
      report.push('## API Status\n');
      
      for (const api of apiStatuses) {
        report.push(`### ${api.service}\n`);
        report.push(`- **Status**: ${api.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        report.push(`- **Credentials**: ${api.credentials}`);
        
        if (api.error) {
          report.push(`- **Error**: ${api.error}`);
        }

        if (api.hasQuota && api.quotaDetails) {
          report.push('- **Available Quotas**:');
          api.quotaDetails.forEach((quota: any) => {
            report.push(`  - ${quota.name}: ${quota.unit}`);
          });
        }
        
        report.push('');
      }

      // Recommendations
      report.push('## Recommendations\n');
      
      const disabledAPIs = apiStatuses.filter(api => !api.enabled);
      if (disabledAPIs.length > 0) {
        report.push('### Enable Required APIs\n');
        report.push('Run the following commands to enable missing APIs:\n');
        report.push('```bash');
        report.push('npx tsx src/cli.ts api enable');
        report.push('```\n');
      }

      const noCredentialsAPIs = apiStatuses.filter(api => api.credentials === 'none');
      if (noCredentialsAPIs.length > 0) {
        report.push('### Setup Authentication\n');
        report.push('Complete the authentication setup:');
        report.push('1. Run token generator: `node scripts/generate-google-ads-token.js`');
        report.push('2. Update .env file with credentials');
        report.push('3. Set GOOGLE_CLOUD_PROJECT_ID in .env\n');
      }

      if (projectInfo.billingEnabled) {
        report.push('### Budget Controls\n');
        report.push('✅ Billing is enabled - set up budget alerts:');
        report.push('1. Go to Google Cloud Console → Billing → Budgets');
        report.push('2. Create budget with $10/month limit');
        report.push('3. Set alerts at 50%, 75%, 90%\n');
      } else {
        report.push('### Enable Billing\n');
        report.push('❌ Billing must be enabled for API access:');
        report.push('1. Go to Google Cloud Console → Billing');
        report.push('2. Link a billing account to your project');
        report.push('3. Set up budget controls immediately\n');
      }

    } catch (error) {
      report.push(`## Error\n\n❌ Failed to generate report: ${error instanceof Error ? error.message : error}`);
    }

    return report.join('\n');
  }

  /**
   * Get the type of credentials being used
   */
  private getCredentialsType(): 'none' | 'oauth' | 'service-account' | 'adc' {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return 'service-account';
    }
    if (process.env.GOOGLE_ADS_REFRESH_TOKEN) {
      return 'oauth';
    }
    if (this.auth) {
      return 'adc';
    }
    return 'none';
  }
}

// Export singleton
export const googleAPIManager = new GoogleAPIManager();