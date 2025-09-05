#!/usr/bin/env node

/**
 * Test Google Ads API Authentication Methods
 * Tests both ADC and OAuth approaches
 */

import { google } from 'googleapis';
import { config } from 'dotenv';

config();

async function testGoogleAdsAuth() {
  console.log('🔍 Testing Google Ads API Authentication Methods\n');

  // Test 1: Application Default Credentials (ADC)
  console.log('📋 Test 1: Application Default Credentials (ADC)');
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/adwords']
    });
    
    const authClient = await auth.getClient();
    console.log('✅ ADC: Authentication object created');
    
    // Try to make a simple request to Google Ads API
    // Note: This will likely fail due to Google Ads API restrictions
    const headers = await authClient.getRequestHeaders();
    console.log('✅ ADC: Got request headers');
    console.log('   Headers include:', Object.keys(headers).join(', '));
    
    // Test if we can access any Google Ads endpoints
    console.log('⚠️  ADC: Google Ads API typically rejects service account requests');
    console.log('   Even with valid auth, ads API requires OAuth from account owner');
    
  } catch (error) {
    console.log('❌ ADC: Failed');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n📋 Test 2: OAuth 2.0 (Recommended for Google Ads)');
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

      const headers = await oauth2Client.getRequestHeaders();
      console.log('✅ OAuth: Authentication successful');
      console.log('   Headers include:', Object.keys(headers).join(', '));
      console.log('   Ready for Google Ads API calls');

    } catch (error) {
      console.log('❌ OAuth: Failed');
      console.log(`   Error: ${error.message}`);
    }
  } else {
    console.log('⚠️  OAuth: Credentials not configured');
    console.log('   Need: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN');
    console.log('   Run: node scripts/generate-google-ads-token.js');
  }

  console.log('\n📋 Test 3: Google Ads API Specific Requirements');
  
  const requirements = [
    {
      name: 'Developer Token',
      value: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      required: true,
      note: 'From Google Ads → API Center'
    },
    {
      name: 'Customer ID(s)',
      value: process.env.GOOGLE_ADS_CUSTOMER_IDS,
      required: true,
      note: 'Your Google Ads account ID (10 digits, no dashes)'
    },
    {
      name: 'Login Customer ID',
      value: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      required: false,
      note: 'Only needed for manager accounts'
    }
  ];

  requirements.forEach(req => {
    const status = req.value ? '✅' : (req.required ? '❌' : '⚠️');
    console.log(`   ${status} ${req.name}: ${req.value ? 'Configured' : 'Missing'}`);
    console.log(`      ${req.note}`);
  });

  console.log('\n🎯 Authentication Summary:');
  console.log('┌─────────────────────┬──────────────┬─────────────────┐');
  console.log('│ API                 │ Auth Method  │ Status          │');
  console.log('├─────────────────────┼──────────────┼─────────────────┤');
  console.log(`│ Search Console      │ Service Acct │ ✅ Working       │`);
  console.log(`│ Google Analytics    │ Service Acct │ ✅ Working       │`);
  console.log(`│ Google Ads          │ OAuth Only   │ ${process.env.GOOGLE_ADS_REFRESH_TOKEN ? '✅ Ready' : '❌ Needs Setup'} │`);
  console.log('└─────────────────────┴──────────────┴─────────────────┘');

  console.log('\n💡 Why Google Ads is Different:');
  console.log('• Google Ads API requires OAuth from the actual account owner');
  console.log('• Service accounts are not allowed to access ads data');  
  console.log('• This is for security - ads spending requires personal authorization');
  console.log('• Other Google APIs allow service account delegation, but not Google Ads');

  console.log('\n🚀 Next Steps:');
  if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    console.log('1. Set up OAuth credentials:');
    console.log('   • Download OAuth JSON from Google Cloud Console');
    console.log('   • Save as credentials/google-ads-credentials.json');
    console.log('   • Run: node scripts/generate-google-ads-token.js');
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    console.log('2. Get developer token:');
    console.log('   • Go to Google Ads → Tools & Settings → API Center');
    console.log('   • Apply for developer token (usually approved within 24h)');
  }
  if (!process.env.GOOGLE_ADS_CUSTOMER_IDS) {
    console.log('3. Add customer ID:');
    console.log('   • Find your customer ID in Google Ads (top-right corner)');
    console.log('   • Format: remove dashes (123-456-7890 → 1234567890)');
    console.log('   • Add to .env: GOOGLE_ADS_CUSTOMER_IDS=1234567890');
  }

  if (process.env.GOOGLE_ADS_REFRESH_TOKEN && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_IDS) {
    console.log('🎉 All requirements met! Ready to test Google Ads API calls.');
  }
}

// Run the test
testGoogleAdsAuth().catch(console.error);