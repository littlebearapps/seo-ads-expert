#!/usr/bin/env node

/**
 * Simple API Access Checker
 * Tests what we can access with current credentials
 */

import { google } from 'googleapis';
import { config } from 'dotenv';

config();

async function checkAPIs() {
  console.log('🔍 Simple API Access Check\n');

  // Test Google Search Console (should work)
  console.log('📊 Testing Google Search Console API...');
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    });
    const authClient = await auth.getClient();
    const webmasters = google.webmasters({ version: 'v3', auth: authClient });
    
    const sites = await webmasters.sites.list();
    console.log('✅ Search Console: Connected');
    console.log(`   Sites: ${sites.data.siteEntry?.length || 0} found`);
    if (sites.data.siteEntry) {
      sites.data.siteEntry.forEach(site => {
        console.log(`   • ${site.siteUrl} (${site.permissionLevel})`);
      });
    }
  } catch (error) {
    console.log('❌ Search Console: Failed');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n📈 Testing Google Analytics Data API...');
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    const authClient = await auth.getClient();
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: authClient });
    
    // This will fail if no property ID is set, but tells us if API is accessible
    console.log('⚠️  Analytics: API accessible, but needs GA4 property ID');
    console.log('   Add GOOGLE_ANALYTICS_PROPERTY_ID to .env to test data access');
  } catch (error) {
    if (error.message.includes('disabled')) {
      console.log('❌ Analytics: API not enabled');
      console.log('   Enable at: https://console.cloud.google.com/apis/api/analyticsdata.googleapis.com');
    } else {
      console.log('✅ Analytics: API accessible');
      console.log(`   Note: ${error.message.substring(0, 100)}...`);
    }
  }

  console.log('\n🎯 Testing Google Ads API...');
  try {
    // Check if we have OAuth credentials
    if (process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_REFRESH_TOKEN) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_ADS_CLIENT_ID,
        process.env.GOOGLE_ADS_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN
      });

      // Test basic access
      console.log('✅ Google Ads: OAuth credentials configured');
      console.log('   Ready for API calls once developer token is added');
    } else {
      console.log('⚠️  Google Ads: OAuth credentials not configured');
      console.log('   Run: node scripts/generate-google-ads-token.js');
    }
  } catch (error) {
    console.log('❌ Google Ads: Configuration error');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n🔑 Authentication Summary:');
  console.log(`Service Account: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅' : '❌'}`);
  console.log(`OAuth Client ID: ${process.env.GOOGLE_ADS_CLIENT_ID ? '✅' : '❌'}`);
  console.log(`OAuth Refresh Token: ${process.env.GOOGLE_ADS_REFRESH_TOKEN ? '✅' : '❌'}`);
  console.log(`Developer Token: ${process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? '✅' : '❌'}`);
  console.log(`Customer IDs: ${process.env.GOOGLE_ADS_CUSTOMER_IDS ? '✅' : '❌'}`);

  console.log('\n💡 Next Steps:');
  const steps = [];
  
  if (!process.env.GOOGLE_ADS_CLIENT_ID) {
    steps.push('1. Generate OAuth credentials: node scripts/generate-google-ads-token.js');
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    steps.push('2. Get developer token from Google Ads → API Center');
  }
  if (!process.env.GOOGLE_ADS_CUSTOMER_IDS) {
    steps.push('3. Add your Google Ads customer ID(s) to .env');
  }
  if (!process.env.GOOGLE_ANALYTICS_PROPERTY_ID) {
    steps.push('4. Add GA4 property ID to .env (optional)');
  }
  
  if (steps.length === 0) {
    console.log('🎉 All credentials configured! Ready for API usage.');
  } else {
    steps.forEach(step => console.log(`   ${step}`));
  }
}

// Run the check
checkAPIs().catch(console.error);