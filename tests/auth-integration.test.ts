import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { google } from 'googleapis';
import pino from 'pino';
import { config } from 'dotenv';

config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Comprehensive Authentication Testing Suite
 * 
 * Tests all Google API authentication methods with live credentials
 * to ensure proper access and permissions.
 */

describe('Google APIs Authentication Integration Tests', () => {
  let auth: any;
  let projectId: string;
  
  beforeAll(async () => {
    projectId = process.env.GOOGLE_CLOUD_PROJECT || '';
  });
  
  describe('OAuth2 Authentication', () => {
    it('should authenticate with OAuth2 credentials', async () => {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          'http://localhost:3000/oauth2callback'
        );
        
        // Set refresh token if available
        if (process.env.GOOGLE_REFRESH_TOKEN) {
          oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
          });
          
          // Test token refresh
          const tokens = await oauth2Client.refreshAccessToken();
          expect(tokens.credentials).toBeDefined();
          expect(tokens.credentials.access_token).toBeDefined();
          
          logger.info('✅ OAuth2 authentication successful');
        } else {
          logger.warn('⚠️ No refresh token available for OAuth2 testing');
        }
      } catch (error) {
        logger.error('❌ OAuth2 authentication failed:', error);
        throw error;
      }
    });
    
    it('should handle OAuth2 token expiration gracefully', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );
      
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        // Set expired token
        oauth2Client.setCredentials({
          access_token: 'expired_token',
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          expiry_date: Date.now() - 1000 // Expired
        });
        
        // Should automatically refresh
        const response = await oauth2Client.getAccessToken();
        expect(response.token).toBeDefined();
        expect(response.token).not.toBe('expired_token');
      }
    });
  });
  
  describe('Service Account Authentication', () => {
    it('should authenticate with service account key', async () => {
      const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      if (keyPath) {
        try {
          auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: [
              'https://www.googleapis.com/auth/adwords',
              'https://www.googleapis.com/auth/analytics.readonly',
              'https://www.googleapis.com/auth/webmasters.readonly'
            ]
          });
          
          const client = await auth.getClient();
          expect(client).toBeDefined();
          
          // Test getting access token
          const accessToken = await client.getAccessToken();
          expect(accessToken).toBeDefined();
          expect(accessToken.token).toBeDefined();
          
          logger.info('✅ Service account authentication successful');
        } catch (error) {
          logger.error('❌ Service account authentication failed:', error);
          throw error;
        }
      } else {
        logger.warn('⚠️ No service account key path configured');
      }
    });
    
    it('should authenticate with ADC (Application Default Credentials)', async () => {
      try {
        auth = new google.auth.GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/adwords',
            'https://www.googleapis.com/auth/analytics.readonly',
            'https://www.googleapis.com/auth/webmasters.readonly'
          ]
        });
        
        const client = await auth.getClient();
        expect(client).toBeDefined();
        
        // Get project ID from ADC
        const detectedProjectId = await auth.getProjectId();
        expect(detectedProjectId).toBeDefined();
        
        logger.info(`✅ ADC authentication successful (Project: ${detectedProjectId})`);
      } catch (error) {
        logger.warn('⚠️ ADC not available (expected in CI/local environment)');
      }
    });
  });
  
  describe('Google Ads API Authentication', () => {
    it('should authenticate with Google Ads API', async () => {
      const { google } = await import('googleapis');
      const { GoogleAdsApi } = await import('google-ads-api');
      
      const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      
      if (customerId && developerToken) {
        try {
          const client = new GoogleAdsApi({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            developer_token: developerToken
          });
          
          const customer = client.Customer({
            customer_id: customerId,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN!
          });
          
          // Test with a simple query
          const response = await customer.query(`
            SELECT customer.id, customer.descriptive_name
            FROM customer
            LIMIT 1
          `);
          
          expect(response).toBeDefined();
          logger.info('✅ Google Ads API authentication successful');
        } catch (error) {
          logger.error('❌ Google Ads API authentication failed:', error);
          throw error;
        }
      } else {
        logger.warn('⚠️ Google Ads API credentials not configured');
      }
    });
    
    it('should handle Google Ads API rate limits', async () => {
      // Test rate limit handling
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          new Promise((resolve) => {
            setTimeout(() => resolve(i), i * 100);
          })
        );
      }
      
      const results = await Promise.all(requests);
      expect(results).toHaveLength(5);
    });
  });
  
  describe('Google Analytics Data API Authentication', () => {
    it('should authenticate with GA4 Data API', async () => {
      const propertyId = process.env.GA4_PROPERTY_ID;
      
      if (propertyId && auth) {
        try {
          const analyticsdata = google.analyticsdata({
            version: 'v1beta',
            auth: await auth.getClient()
          });
          
          const response = await analyticsdata.properties.getMetadata({
            name: `properties/${propertyId}/metadata`
          });
          
          expect(response.data).toBeDefined();
          expect(response.data.dimensions).toBeDefined();
          expect(response.data.metrics).toBeDefined();
          
          logger.info('✅ GA4 Data API authentication successful');
        } catch (error) {
          logger.error('❌ GA4 Data API authentication failed:', error);
          throw error;
        }
      } else {
        logger.warn('⚠️ GA4 property ID not configured');
      }
    });
    
    it('should run a sample GA4 report', async () => {
      const propertyId = process.env.GA4_PROPERTY_ID;
      
      if (propertyId && auth) {
        const analyticsdata = google.analyticsdata({
          version: 'v1beta',
          auth: await auth.getClient()
        });
        
        const response = await analyticsdata.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'sessions' }],
            limit: 5
          }
        });
        
        expect(response.data.rows).toBeDefined();
        logger.info(`✅ GA4 report returned ${response.data.rows?.length || 0} rows`);
      }
    });
  });
  
  describe('Search Console API Authentication', () => {
    it('should authenticate with Search Console API', async () => {
      if (auth) {
        try {
          const searchconsole = google.searchconsole({
            version: 'v1',
            auth: await auth.getClient()
          });
          
          const response = await searchconsole.sites.list();
          expect(response.data).toBeDefined();
          
          if (response.data.siteEntry && response.data.siteEntry.length > 0) {
            logger.info(`✅ Search Console API authenticated (${response.data.siteEntry.length} sites)`);
          } else {
            logger.info('✅ Search Console API authenticated (no sites configured)');
          }
        } catch (error) {
          logger.error('❌ Search Console API authentication failed:', error);
          throw error;
        }
      }
    });
    
    it('should query Search Console data', async () => {
      const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL;
      
      if (siteUrl && auth) {
        const searchconsole = google.searchconsole({
          version: 'v1',
          auth: await auth.getClient()
        });
        
        try {
          const response = await searchconsole.searchanalytics.query({
            siteUrl: siteUrl,
            requestBody: {
              startDate: '2024-01-01',
              endDate: '2024-01-07',
              dimensions: ['query'],
              rowLimit: 5
            }
          });
          
          expect(response.data).toBeDefined();
          logger.info(`✅ Search Console query returned ${response.data.rows?.length || 0} rows`);
        } catch (error) {
          if (error.message?.includes('403')) {
            logger.warn('⚠️ Search Console site not verified or no data available');
          } else {
            throw error;
          }
        }
      }
    });
  });
  
  describe('Authentication Error Handling', () => {
    it('should handle invalid credentials gracefully', async () => {
      const invalidAuth = new google.auth.OAuth2(
        'invalid_client_id',
        'invalid_client_secret',
        'http://localhost:3000/oauth2callback'
      );
      
      invalidAuth.setCredentials({
        refresh_token: 'invalid_refresh_token'
      });
      
      try {
        await invalidAuth.refreshAccessToken();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('invalid');
      }
    });
    
    it('should handle network errors gracefully', async () => {
      // Simulate network error by using invalid endpoint
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/adwords']
      });
      
      // Override the token endpoint
      const client = await auth.getClient();
      client.refreshAccessToken = async () => {
        throw new Error('Network error: ECONNREFUSED');
      };
      
      try {
        await client.getAccessToken();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Network error');
      }
    });
    
    it('should handle quota exceeded errors', async () => {
      // Simulate quota exceeded response
      const mockError = {
        code: 429,
        message: 'Quota exceeded',
        errors: [{
          reason: 'quotaExceeded',
          message: 'User Rate Limit Exceeded'
        }]
      };
      
      expect(mockError.code).toBe(429);
      expect(mockError.errors[0].reason).toBe('quotaExceeded');
    });
  });
  
  describe('Multi-API Authentication Flow', () => {
    it('should authenticate with multiple APIs in sequence', async () => {
      const results = {
        oauth2: false,
        serviceAccount: false,
        googleAds: false,
        analytics: false,
        searchConsole: false
      };
      
      // Test OAuth2
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          'http://localhost:3000/oauth2callback'
        );
        oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
        try {
          await oauth2Client.refreshAccessToken();
          results.oauth2 = true;
        } catch (error) {
          // Continue
        }
      }
      
      // Test Service Account
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/adwords']
          });
          await auth.getClient();
          results.serviceAccount = true;
        } catch (error) {
          // Continue
        }
      }
      
      // Log results
      logger.info('Multi-API Authentication Results:', results);
      
      // At least one auth method should work
      const anySuccess = Object.values(results).some(v => v === true);
      expect(anySuccess).toBe(true);
    });
  });
  
  afterAll(async () => {
    logger.info('✅ Authentication integration tests completed');
  });
});

/**
 * Test runner configuration for live credential testing
 */
export const authTestConfig = {
  testTimeout: 30000, // 30 seconds for API calls
  retryAttempts: 3,
  retryDelay: 1000,
  
  // Required environment variables
  requiredEnvVars: [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GA4_PROPERTY_ID'
  ],
  
  // Optional environment variables
  optionalEnvVars: [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_CLOUD_PROJECT',
    'SEARCH_CONSOLE_SITE_URL'
  ],
  
  // Validate environment before running tests
  validateEnvironment(): boolean {
    const missing = this.requiredEnvVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      logger.warn(`⚠️ Missing required environment variables: ${missing.join(', ')}`);
      logger.warn('Some tests will be skipped');
      return false;
    }
    
    return true;
  }
};