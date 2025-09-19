/**
 * Google Search Console Sitemap Submitter
 * Submits sitemaps to Google Search Console via API
 */

import { google } from 'googleapis';
import { logger } from '../utils/logger.js';
import { OAuth2Client } from 'google-auth-library';

export interface SubmitResult {
  success: boolean;
  submitted: string[];
  failed: string[];
  errors: string[];
}

export class GSCSitemapSubmitter {
  private searchconsole: any;
  private auth: OAuth2Client;

  constructor() {
    // Initialize OAuth2 client
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    // Set credentials from refresh token
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }

    // Initialize Search Console API
    this.searchconsole = google.searchconsole({
      version: 'v1',
      auth: this.auth
    });
  }

  /**
   * Submit a sitemap to Google Search Console
   */
  async submitSitemap(siteUrl: string, sitemapUrl: string): Promise<boolean> {
    try {
      logger.info('Submitting sitemap to GSC', { siteUrl, sitemapUrl });

      // Submit sitemap
      await this.searchconsole.sitemaps.submit({
        siteUrl: this.formatSiteUrl(siteUrl),
        feedpath: sitemapUrl
      });

      logger.info('Sitemap submitted successfully', { sitemapUrl });
      return true;

    } catch (error: any) {
      logger.error('Failed to submit sitemap', { error: error.message, sitemapUrl });
      return false;
    }
  }

  /**
   * Submit multiple sitemaps
   */
  async submitMultipleSitemaps(siteUrl: string, sitemapUrls: string[]): Promise<SubmitResult> {
    const submitted: string[] = [];
    const failed: string[] = [];
    const errors: string[] = [];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const success = await this.submitSitemap(siteUrl, sitemapUrl);

        if (success) {
          submitted.push(sitemapUrl);
        } else {
          failed.push(sitemapUrl);
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        failed.push(sitemapUrl);
        errors.push(`${sitemapUrl}: ${error.message}`);
      }
    }

    return {
      success: failed.length === 0,
      submitted,
      failed,
      errors
    };
  }

  /**
   * Get list of submitted sitemaps
   */
  async listSitemaps(siteUrl: string): Promise<any[]> {
    try {
      const response = await this.searchconsole.sitemaps.list({
        siteUrl: this.formatSiteUrl(siteUrl)
      });

      return response.data.sitemap || [];

    } catch (error: any) {
      logger.error('Failed to list sitemaps', { error: error.message });
      return [];
    }
  }

  /**
   * Get sitemap status and details
   */
  async getSitemapStatus(siteUrl: string, sitemapUrl: string): Promise<any> {
    try {
      const response = await this.searchconsole.sitemaps.get({
        siteUrl: this.formatSiteUrl(siteUrl),
        feedpath: sitemapUrl
      });

      return response.data;

    } catch (error: any) {
      logger.error('Failed to get sitemap status', { error: error.message });
      return null;
    }
  }

  /**
   * Delete a sitemap from Google Search Console
   */
  async deleteSitemap(siteUrl: string, sitemapUrl: string): Promise<boolean> {
    try {
      await this.searchconsole.sitemaps.delete({
        siteUrl: this.formatSiteUrl(siteUrl),
        feedpath: sitemapUrl
      });

      logger.info('Sitemap deleted successfully', { sitemapUrl });
      return true;

    } catch (error: any) {
      logger.error('Failed to delete sitemap', { error: error.message });
      return false;
    }
  }

  /**
   * Format site URL for GSC API
   * GSC requires specific format: sc-domain:example.com or https://example.com/
   */
  private formatSiteUrl(siteUrl: string): string {
    // If already formatted, return as is
    if (siteUrl.startsWith('sc-domain:') || siteUrl.startsWith('http')) {
      return siteUrl;
    }

    // If it's a domain property, format as sc-domain:
    if (!siteUrl.includes('/')) {
      return `sc-domain:${siteUrl}`;
    }

    // Otherwise, ensure it has protocol
    if (!siteUrl.startsWith('http')) {
      return `https://${siteUrl}`;
    }

    return siteUrl;
  }

  /**
   * Validate GSC authentication
   */
  async validateAuth(): Promise<boolean> {
    try {
      // Try to list sites to validate auth
      const response = await this.searchconsole.sites.list();
      return response.data.siteEntry && response.data.siteEntry.length > 0;

    } catch (error: any) {
      logger.error('GSC authentication failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get indexation coverage for a site
   */
  async getIndexCoverage(siteUrl: string): Promise<any> {
    try {
      // This would need the Index Coverage API which is not publicly available
      // Using Search Analytics API as alternative
      const response = await this.searchconsole.searchanalytics.query({
        siteUrl: this.formatSiteUrl(siteUrl),
        requestBody: {
          startDate: this.getDateDaysAgo(30),
          endDate: this.getDateDaysAgo(1),
          dimensions: ['page'],
          rowLimit: 25000
        }
      });

      const indexedPages = response.data.rows || [];

      return {
        indexedCount: indexedPages.length,
        pages: indexedPages.map((row: any) => ({
          url: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions
        }))
      };

    } catch (error: any) {
      logger.error('Failed to get index coverage', { error: error.message });
      return {
        indexedCount: 0,
        pages: []
      };
    }
  }

  /**
   * Get URL inspection data (requires URL Inspection API access)
   */
  async inspectUrl(siteUrl: string, inspectUrl: string): Promise<any> {
    try {
      // Note: URL Inspection API requires special access
      // This is a placeholder for when access is available
      const response = await this.searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: inspectUrl,
          siteUrl: this.formatSiteUrl(siteUrl)
        }
      });

      return response.data;

    } catch (error: any) {
      logger.warn('URL Inspection API not available', { error: error.message });
      return null;
    }
  }

  /**
   * Helper to get date string for API queries
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}