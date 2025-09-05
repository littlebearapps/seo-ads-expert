#!/usr/bin/env node

/**
 * Unified Google APIs Token Generator
 * Run this once to generate your refresh token for all Google APIs:
 * - Google Ads API
 * - Google Analytics API  
 * - Google Search Console API
 * 
 * Usage:
 * 1. node scripts/generate-google-ads-token.js
 * 2. Follow the URL and get authorization code
 * 3. node scripts/generate-google-ads-token.js YOUR_AUTH_CODE
 */

import { google } from 'googleapis';
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
  console.log('🔑 Unified Google APIs Token Generator\n');

  // Check if credentials file exists
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error('❌ Error: Credentials file not found!');
    console.error(`Expected location: ${CREDENTIALS_FILE}`);
    console.error('\nPlease:');
    console.error('1. Download your OAuth2 credentials JSON from Google Cloud Console');
    console.error('2. Save it as google-ads-credentials.json in the credentials/ folder');
    console.error('3. Or set GOOGLE_OAUTH_CREDENTIALS environment variable');
    process.exit(1);
  }

  try {
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
    const { client_id, client_secret } = credentials.installed || credentials.web;

    if (!client_id || !client_secret) {
      console.error('❌ Error: Invalid credentials file format');
      console.error('Expected "installed" or "web" OAuth2 credentials');
      process.exit(1);
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    const authCode = process.argv[2];

    if (!authCode) {
      // Step 1: Generate authorization URL
      console.log('📋 Step 1: Get Authorization Code\n');
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force refresh token generation
      });

      console.log('🌐 Go to this URL in your browser:');
      console.log('─'.repeat(60));
      console.log(authUrl);
      console.log('─'.repeat(60));
      console.log('\n📝 Steps:');
      console.log('1. Click the URL above');
      console.log('2. Sign in with your Google account that has Google Ads access');
      console.log('3. Grant permissions to the app');
      console.log('4. Copy the authorization code from the page');
      console.log('\n🔄 Then run:');
      console.log(`node ${__filename} YOUR_AUTHORIZATION_CODE`);
      
    } else {
      // Step 2: Exchange code for tokens
      console.log('🔄 Step 2: Exchanging authorization code for tokens...\n');
      
      try {
        const { tokens } = await oauth2Client.getToken(authCode);
        
        if (!tokens.refresh_token) {
          console.error('❌ Error: No refresh token received');
          console.error('This usually means you need to revoke existing permissions and try again.');
          console.error('\nGo to: https://myaccount.google.com/permissions');
          console.error('Remove "SEO Ads Expert" app and re-run this script.');
          process.exit(1);
        }

        console.log('✅ Success! Here are your tokens:\n');
        console.log('📋 Add these to your .env file:');
        console.log('─'.repeat(50));
        console.log(`GOOGLE_ADS_CLIENT_ID="${client_id}"`);
        console.log(`GOOGLE_ADS_CLIENT_SECRET="${client_secret}"`);
        console.log(`GOOGLE_ADS_REFRESH_TOKEN="${tokens.refresh_token}"`);
        console.log('─'.repeat(50));
        
        console.log('\n🔒 Security Notes:');
        console.log('• Keep these tokens SECRET and secure');
        console.log('• Add .env to your .gitignore file');
        console.log('• The refresh token does not expire (unless revoked)');
        console.log('• You can regenerate tokens anytime by re-running this script');

        console.log('\n📋 Still needed:');
        console.log('• GOOGLE_ADS_DEVELOPER_TOKEN (from Google Ads API Center)');
        console.log('• GOOGLE_ADS_CUSTOMER_IDS (your Google Ads account ID)');

        // Save tokens to a secure file for reference
        const tokenFile = path.join(__dirname, '..', 'credentials', 'tokens.json');
        fs.writeFileSync(tokenFile, JSON.stringify({
          client_id,
          client_secret,
          refresh_token: tokens.refresh_token,
          generated_at: new Date().toISOString()
        }, null, 2));
        
        console.log(`\n💾 Tokens also saved to: ${tokenFile}`);
        console.log('(You can delete this file after updating your .env)');
        
      } catch (error) {
        console.error('❌ Error exchanging code for tokens:', error.message);
        process.exit(1);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}