/**
 * Unified OAuth Authentication
 * Single authentication system for all Google APIs
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.js';

export class UnifiedAuth {
  private oauth2Client: any;
  private isInitialized = false;

  constructor() {
    // Initialize will be called when needed
  }

  /**
   * Initialize OAuth authentication for all Google APIs
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.oauth2Client) {
      return true;
    }

    try {
      // Check for required OAuth environment variables
      if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_REFRESH_TOKEN) {
        logger.error('Missing OAuth credentials. Run: node scripts/generate-google-ads-token.js');
        return false;
      }

      // Create OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_ADS_CLIENT_ID,
        process.env.GOOGLE_ADS_CLIENT_SECRET,
        'http://localhost'
      );

      // Set refresh token
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN
      });

      // Test the authentication
      await this.oauth2Client.getAccessToken();

      this.isInitialized = true;
      logger.info('✅ Unified OAuth authentication initialized');
      return true;

    } catch (error) {
      logger.error('Failed to initialize OAuth authentication:', error);
      return false;
    }
  }

  /**
   * Get authenticated client for Google Ads API
   */
  async getGoogleAdsClient() {
    if (!await this.initialize()) {
      throw new Error('Authentication not initialized');
    }

    // Verify Google Ads specific requirements
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not set');
    }

    if (!process.env.GOOGLE_ADS_CUSTOMER_IDS) {
      throw new Error('GOOGLE_ADS_CUSTOMER_IDS not set');
    }

    return this.oauth2Client;
  }

  /**
   * Get authenticated client for Google Analytics
   */
  async getAnalyticsClient() {
    if (!await this.initialize()) {
      throw new Error('Authentication not initialized');
    }

    return google.analyticsdata({ version: 'v1beta', auth: this.oauth2Client });
  }

  /**
   * Get authenticated client for Google Analytics Admin
   */
  async getAnalyticsAdminClient() {
    if (!await this.initialize()) {
      throw new Error('Authentication not initialized');
    }

    return google.analyticsadmin({ version: 'v1beta', auth: this.oauth2Client });
  }

  /**
   * Get authenticated client for Search Console
   */
  async getSearchConsoleClient() {
    if (!await this.initialize()) {
      throw new Error('Authentication not initialized');
    }

    return google.webmasters({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Get authenticated client for Service Usage (quotas)
   */
  async getServiceUsageClient() {
    if (!await this.initialize()) {
      throw new Error('Authentication not initialized');
    }

    return google.serviceusage({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Get authenticated client for Cloud Resource Manager
   */
  async getCloudResourceClient() {
    if (!await this.initialize()) {
      throw new Error('Authentication not initialized');
    }

    return google.cloudresourcemanager({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Test all API connections
   */
  async testAllConnections(): Promise<{
    searchConsole: boolean;
    analytics: boolean;
    googleAds: boolean;
    errors: string[];
  }> {
    const results = {
      searchConsole: false,
      analytics: false,
      googleAds: false,
      errors: [] as string[]
    };

    // Test Search Console
    try {
      const webmasters = await this.getSearchConsoleClient();
      const sites = await webmasters.sites.list();
      results.searchConsole = true;
      logger.info(`✅ Search Console: ${sites.data.siteEntry?.length || 0} sites accessible`);
    } catch (error) {
      results.errors.push(`Search Console: ${error instanceof Error ? error.message : error}`);
    }

    // Test Google Analytics
    try {
      const analyticsAdmin = await this.getAnalyticsAdminClient();
      const accounts = await analyticsAdmin.accounts.list();
      results.analytics = true;
      logger.info(`✅ Google Analytics: ${accounts.data.accounts?.length || 0} accounts accessible`);
    } catch (error) {
      results.errors.push(`Google Analytics: ${error instanceof Error ? error.message : error}`);
    }

    // Test Google Ads (basic auth, not actual API call)
    try {
      await this.getGoogleAdsClient();
      results.googleAds = true;
      logger.info('✅ Google Ads: Authentication ready (needs developer token for API calls)');
    } catch (error) {
      results.errors.push(`Google Ads: ${error instanceof Error ? error.message : error}`);
    }

    return results;
  }

  /**
   * Get current authentication status
   */
  getAuthStatus(): {
    method: 'oauth' | 'none';
    hasRefreshToken: boolean;
    hasClientCredentials: boolean;
    hasGoogleAdsTokens: boolean;
    isReady: boolean;
  } {
    return {
      method: this.isInitialized ? 'oauth' : 'none',
      hasRefreshToken: !!process.env.GOOGLE_ADS_REFRESH_TOKEN,
      hasClientCredentials: !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET),
      hasGoogleAdsTokens: !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_IDS),
      isReady: this.isInitialized && 
               !!process.env.GOOGLE_ADS_REFRESH_TOKEN && 
               !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && 
               !!process.env.GOOGLE_ADS_CUSTOMER_IDS
    };
  }

  /**
   * Get OAuth client for manual operations
   */
  getOAuthClient() {
    return this.oauth2Client;
  }
}

// Export singleton
export const unifiedAuth = new UnifiedAuth();