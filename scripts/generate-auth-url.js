#!/usr/bin/env node

/**
 * Quick OAuth URL Generator
 * Creates the authorization URL for Google APIs
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_FILE = path.join(__dirname, '..', 'credentials', 'google-ads-credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/analytics.readonly', 
  'https://www.googleapis.com/auth/webmasters.readonly'
];

async function generateAuthUrl() {
  console.log('🔑 Unified Google APIs Token Generator\n');

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

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force refresh token generation
    });

    console.log('🌐 Go to this URL in your browser:');
    console.log('─'.repeat(80));
    console.log(authUrl);
    console.log('─'.repeat(80));
    console.log('\n🔗 Copy this URL (it\'s long but complete):');
    console.log(authUrl);
    console.log('\n📝 Steps:');
    console.log('1. Click the URL above');
    console.log('2. Sign in with your Google account that has Google Ads access');
    console.log('3. Grant permissions to all APIs');
    console.log('4. After authorization, the browser will redirect to localhost');
    console.log('5. Copy the "code" parameter from the localhost URL');
    console.log('   Example: http://localhost/?code=YOUR_CODE&scope=...');
    console.log('   Copy just the YOUR_CODE part');
    console.log('\n🔄 Then run:');
    console.log('npx tsx scripts/exchange-code.js YOUR_AUTHORIZATION_CODE');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateAuthUrl();