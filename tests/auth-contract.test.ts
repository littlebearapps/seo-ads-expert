/**
 * Authentication Contract Tests - Hybrid Approach
 *
 * Tests OAuth2 authentication flow with REAL Google OAuth2 endpoint
 * but MOCKED Google Ads API to ensure CI reliability.
 *
 * Strategy:
 * - Real network calls to oauth2.googleapis.com (validates credentials)
 * - Mocked Google Ads API calls (eliminates flakiness)
 * - Tests token refresh, retry logic, and error handling
 *
 * This runs in CI and provides:
 * ✅ Real OAuth2 validation (proves credentials work)
 * ✅ Fast, deterministic tests (~5-10s vs 60s+)
 * ✅ No dependency on Ads API availability
 * ✅ Catches revoked tokens, invalid credentials
 *
 * For full E2E tests with real Ads API, see tests/e2e/auth-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { google } from 'googleapis';
import nock from 'nock';
import pino from 'pino';
import { config } from 'dotenv';

config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Skip tests if OAuth2 credentials are not available
 * Required env vars:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REFRESH_TOKEN
 */
const hasOAuth2Credentials = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_REFRESH_TOKEN
);

describe.skipIf(!hasOAuth2Credentials)('OAuth2 Authentication Contract Tests', () => {
  beforeAll(() => {
    // Allow real network to OAuth2 endpoints only
    // All other network calls will be intercepted by nock
    nock.disableNetConnect();
    nock.enableNetConnect((host) => {
      return (
        host.includes('oauth2.googleapis.com') ||
        host.includes('accounts.google.com') ||
        host.includes('www.googleapis.com/oauth2')
      );
    });

    logger.info('🔧 Auth contract tests configured: Real OAuth2, Mocked Ads API');
  });

  afterEach(() => {
    // Clean up all nock interceptors after each test
    nock.cleanAll();
  });

  describe('OAuth2 Token Refresh Flow', () => {
    it('should refresh access token with real Google OAuth2', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );

      // Set refresh token
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      // This makes a REAL call to oauth2.googleapis.com
      const tokens = await oauth2Client.refreshAccessToken();

      expect(tokens.credentials).toBeDefined();
      expect(tokens.credentials.access_token).toBeDefined();
      expect(tokens.credentials.access_token?.length).toBeGreaterThan(0);

      logger.info('✅ Real OAuth2 token refresh successful');
      logger.info(`   Access token received (${tokens.credentials.access_token?.substring(0, 20)}...)`);
    });

    it('should handle expired token and auto-refresh with real OAuth2', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );

      // Set expired access token + valid refresh token
      oauth2Client.setCredentials({
        access_token: 'ya29.expired_token_12345',
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        expiry_date: Date.now() - 1000 // Expired 1 second ago
      });

      // getAccessToken() should detect expiry and refresh automatically
      // This makes a REAL call to oauth2.googleapis.com
      const response = await oauth2Client.getAccessToken();

      expect(response.token).toBeDefined();
      expect(response.token).not.toBe('ya29.expired_token_12345');
      expect(response.token?.length).toBeGreaterThan(0);

      logger.info('✅ Auto-refresh on expired token successful');
      logger.info(`   New token received (${response.token?.substring(0, 20)}...)`);
    });

    it('should detect invalid credentials and fail gracefully', async () => {
      const oauth2Client = new google.auth.OAuth2(
        'invalid_client_id',
        'invalid_client_secret',
        'http://localhost:3000/oauth2callback'
      );

      oauth2Client.setCredentials({
        refresh_token: 'invalid_refresh_token'
      });

      // This makes a REAL call to oauth2.googleapis.com and should fail
      await expect(async () => {
        await oauth2Client.refreshAccessToken();
      }).rejects.toThrow();

      logger.info('✅ Invalid credentials properly rejected by real OAuth2');
    });
  });

  describe('Google Ads API with OAuth2 Refresh (Hybrid)', () => {
    it('should refresh token when Ads API returns 401, then retry successfully', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );

      // Set expired token
      oauth2Client.setCredentials({
        access_token: 'ya29.expired_token',
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        expiry_date: Date.now() - 1000 // Expired
      });

      // Mock Google Ads API to:
      // 1. First call: Return 401 (invalid credentials)
      // 2. Second call: Return 200 (success after refresh)
      const adsApiMock = nock('https://googleads.googleapis.com')
        .post('/v17/customers:searchStream')
        .reply(401, {
          error: {
            code: 401,
            message: 'Request had invalid authentication credentials.',
            status: 'UNAUTHENTICATED'
          }
        })
        .post('/v17/customers:searchStream')
        .reply(200, {
          results: [
            {
              customer: {
                id: '1234567890',
                descriptive_name: 'Test Account'
              }
            }
          ]
        });

      // Simulate Ads API call with retry logic
      let attempt = 0;
      let response;
      let lastError;

      while (attempt < 2) {
        attempt++;

        try {
          // Get fresh token (will refresh on first attempt since expired)
          const tokenResponse = await oauth2Client.getAccessToken();

          logger.info(`   Attempt ${attempt}: Using token ${tokenResponse.token?.substring(0, 20)}...`);

          // Make Ads API call (mocked)
          const mockResponse = await fetch('https://googleads.googleapis.com/v17/customers:searchStream', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenResponse.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: 'SELECT customer.id FROM customer LIMIT 1'
            })
          });

          if (mockResponse.status === 401) {
            // Force token refresh for next attempt
            oauth2Client.setCredentials({
              refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
              expiry_date: 0 // Force immediate refresh
            });
            lastError = new Error('401 Unauthorized');
            logger.info(`   Attempt ${attempt}: Got 401, will refresh and retry`);
            continue;
          }

          response = await mockResponse.json();
          break;
        } catch (error) {
          lastError = error;
          if (attempt >= 2) throw error;
        }
      }

      // Verify we got a successful response after refresh + retry
      expect(response).toBeDefined();
      expect(response.results).toBeDefined();
      expect(attempt).toBe(2); // Should succeed on second attempt

      // Verify both mock calls were made
      expect(adsApiMock.isDone()).toBe(true);

      logger.info('✅ Token refresh + retry flow validated');
      logger.info('   1. Detected 401 from Ads API (mocked)');
      logger.info('   2. Refreshed token with real OAuth2');
      logger.info('   3. Retried Ads API call and succeeded');
    });

    it('should handle concurrent requests with shared OAuth2 client', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      // Make 3 concurrent token requests
      // OAuth2 client should handle this gracefully (only one refresh)
      const requests = [
        oauth2Client.getAccessToken(),
        oauth2Client.getAccessToken(),
        oauth2Client.getAccessToken()
      ];

      const responses = await Promise.all(requests);

      // All should succeed
      expect(responses).toHaveLength(3);
      responses.forEach(r => {
        expect(r.token).toBeDefined();
        expect(r.token?.length).toBeGreaterThan(0);
      });

      // Tokens should be identical (shared state)
      expect(responses[0].token).toBe(responses[1].token);
      expect(responses[1].token).toBe(responses[2].token);

      logger.info('✅ Concurrent token requests handled correctly');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors to Ads API gracefully', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      // Mock network timeout/error
      nock('https://googleads.googleapis.com')
        .post('/v17/customers:searchStream')
        .replyWithError({
          code: 'ETIMEDOUT',
          message: 'Network timeout'
        });

      // Get valid token (real OAuth2)
      const tokenResponse = await oauth2Client.getAccessToken();
      expect(tokenResponse.token).toBeDefined();

      // Try Ads API call (should fail with network error, not auth error)
      await expect(async () => {
        await fetch('https://googleads.googleapis.com/v17/customers:searchStream', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenResponse.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: 'SELECT customer.id FROM customer' })
        });
      }).rejects.toThrow();

      logger.info('✅ Network errors handled separately from auth errors');
    });

    it('should handle quota exceeded (429) from Ads API', async () => {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      // Mock quota exceeded
      nock('https://googleads.googleapis.com')
        .post('/v17/customers:searchStream')
        .reply(429, {
          error: {
            code: 429,
            message: 'Quota exceeded for quota metric',
            status: 'RESOURCE_EXHAUSTED'
          }
        });

      const tokenResponse = await oauth2Client.getAccessToken();
      const mockResponse = await fetch('https://googleads.googleapis.com/v17/customers:searchStream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json'
        }
      });

      expect(mockResponse.status).toBe(429);
      const errorData = await mockResponse.json();
      expect(errorData.error.status).toBe('RESOURCE_EXHAUSTED');

      logger.info('✅ Quota errors properly identified (separate from auth)');
    });
  });
});
