#!/usr/bin/env node

/**
 * Exchange OAuth Authorization Code for Tokens
 * Second step of OAuth flow
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_FILE = path.join(__dirname, '..', 'credentials', 'google-ads-credentials.json');

async function exchangeCode() {
  const authCode = process.argv[2];
  
  if (!authCode) {
    console.error('❌ Error: Please provide authorization code');
    console.error('Usage: npx tsx scripts/exchange-code.js YOUR_AUTHORIZATION_CODE');
    process.exit(1);
  }

  console.log('🔄 Exchanging authorization code for tokens...\n');
  
  try {
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
    const { client_id, client_secret } = credentials.installed || credentials.web;

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'http://localhost'
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(authCode);
    
    if (!tokens.refresh_token) {
      console.error('❌ Error: No refresh token received');
      console.error('This usually means you need to revoke existing permissions and try again.');
      console.error('\nGo to: https://myaccount.google.com/permissions');
      console.error('Remove "seo-ads-expert" app and re-run the auth flow.');
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
    
    console.log('\n✅ Next step: Run "npx tsx scripts/test-unified-auth.js" to verify setup');
    
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error.message);
    process.exit(1);
  }
}

exchangeCode();