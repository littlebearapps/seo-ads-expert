#!/usr/bin/env node

/**
 * Unified Google APIs Token Generator (Loopback Server)
 * Run this once to generate your refresh token for all Google APIs:
 * - Google Ads API
 * - Google Analytics API
 * - Google Search Console API
 *
 * Usage:
 * 1. Create Desktop app OAuth client in Google Cloud Console
 * 2. Download credentials JSON → save as credentials/google-ads-credentials.json
 * 3. Run: node scripts/generate-google-ads-token.js
 * 4. Browser opens automatically → approve OAuth consent
 * 5. Copy printed env vars to .env file
 */

import http from 'http';
import open from 'open';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CREDENTIALS_FILE = process.env.GOOGLE_OAUTH_CREDENTIALS || 
  path.join(__dirname, '..', 'credentials', 'google-ads-credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/analytics.readonly', 
  'https://www.googleapis.com/auth/webmasters.readonly'
];

async function main() {
  console.log('🔐 Unified Google APIs Token Generator\n');

  let client_id, client_secret;

  // Try to load from file first, fall back to environment variables
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
      const creds = credentials.installed || credentials.web;
      client_id = creds.client_id;
      client_secret = creds.client_secret;
      console.log('✅ Loaded credentials from file');
    } catch (error) {
      console.error('⚠️  Could not parse credentials file, trying environment variables...');
    }
  }

  // Fall back to environment variables if file not found or invalid
  if (!client_id || !client_secret) {
    client_id = process.env.GOOGLE_CLIENT_ID;
    client_secret = process.env.GOOGLE_CLIENT_SECRET;

    if (!client_id || !client_secret) {
      console.error('❌ Error: OAuth credentials not found!\n');
      console.error('📋 Option 1: Use environment variables (recommended):');
      console.error('   GOOGLE_CLIENT_ID="your-client-id" \\');
      console.error('   GOOGLE_CLIENT_SECRET="your-client-secret" \\');
      console.error('   node scripts/generate-google-ads-token.js\n');
      console.error('📋 Option 2: Create credentials file:');
      console.error('   1. Go to Google Cloud Console → APIs & Services → Credentials');
      console.error('   2. Create OAuth 2.0 Client ID (Desktop app)');
      console.error('   3. Create file: credentials/google-ads-credentials.json');
      console.error('   4. Add this content:');
      console.error('   {');
      console.error('     "installed": {');
      console.error('       "client_id": "your-client-id",');
      console.error('       "client_secret": "your-client-secret"');
      console.error('     }');
      console.error('   }\n');
      process.exit(1);
    }
    console.log('✅ Using credentials from environment variables');
  }

  console.log('✅ Loaded OAuth credentials');
  console.log(`   Client ID: ${client_id.substring(0, 20)}...`);
  console.log('');

  try {
    // Setup loopback server
    const port = 51762;
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oAuth2Client = new OAuth2Client({
      clientId: client_id,
      clientSecret: client_secret,
      redirectUri
    });

    console.log('📋 Requesting access to:');
    console.log('   • Google Ads API (read/write)');
    console.log('   • Google Analytics (read-only)');
    console.log('   • Google Search Console (read-only)\n');

    // Generate authorization URL
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      include_granted_scopes: true
    });

    // Start local server
    const server = http.createServer(async (req, res) => {
      if (!req.url) return;

      const url = new URL(req.url, `http://127.0.0.1:${port}`);

      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('Missing authorization code');
        return;
      }

      try {
        // Exchange code for tokens
        const r = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(r.tokens);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>OAuth Success</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✅ Success!</h1>
              <p>You can close this tab and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close();

        const refreshToken = r.tokens.refresh_token;
        if (!refreshToken) {
          console.error('\n❌ Error: No refresh_token returned');
          console.error('   This happens if you previously granted access.\n');
          console.error('📋 Fix: Revoke prior access and try again:');
          console.error('   1. Go to: https://myaccount.google.com/permissions');
          console.error('   2. Find and remove this app');
          console.error('   3. Run this script again\n');
          process.exit(1);
        }

        // Success! Print env vars
        console.log('\n🎉 OAuth complete! Copy these to your .env file:\n');
        console.log('─'.repeat(80));
        console.log(`GOOGLE_CLIENT_ID=${client_id}`);
        console.log(`GOOGLE_CLIENT_SECRET=${client_secret}`);
        console.log(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
        console.log('─'.repeat(80));
        console.log('');
        console.log('📋 Next steps:');
        console.log('   1. Add the above variables to your .env file');
        console.log('   2. Ensure you have: GOOGLE_ADS_DEVELOPER_TOKEN');
        console.log('   3. Ensure you have: GOOGLE_ADS_CUSTOMER_ID (your test account)');
        console.log('   4. Run: node scripts/test-unified-auth.js');
        console.log('');
        console.log('⚠️  Token expiration: 7 days (Testing mode)');
        console.log('   Generate new tokens before recording screencast!');
        console.log('');

        // Save tokens to a secure file for reference
        const tokenFile = path.join(__dirname, '..', 'credentials', 'tokens.json');
        fs.writeFileSync(tokenFile, JSON.stringify({
          client_id,
          client_secret,
          refresh_token: refreshToken,
          generated_at: new Date().toISOString()
        }, null, 2));

        console.log(`💾 Tokens also saved to: ${tokenFile}`);
        console.log('   (You can delete this file after updating your .env)\n');

      } catch (err) {
        console.error('\n❌ Token exchange failed:', err?.message || err);
        res.writeHead(500);
        res.end('Token exchange failed');
        server.close();
        process.exit(1);
      }
    });

    server.listen(port, async () => {
      console.log('🌐 Starting local OAuth server on port', port);
      console.log('🚀 Opening browser for OAuth consent...\n');

      try {
        await open(authorizeUrl, { wait: false });
      } catch (error) {
        console.error('⚠️  Could not open browser automatically');
        console.error('   Please open this URL manually:\n');
        console.error(authorizeUrl);
        console.error('');
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      console.error('\n⏱️  Timeout: OAuth flow took too long');
      console.error('   Please try again\n');
      server.close();
      process.exit(1);
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}