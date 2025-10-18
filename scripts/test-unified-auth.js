#!/usr/bin/env tsx

/**
 * Test Unified OAuth Authentication
 * Tests all Google APIs with single OAuth token
 */

import { unifiedAuth } from '../src/utils/unified-auth.js';
import dotenv from 'dotenv';

dotenv.config();

async function testUnifiedAuth() {
  console.log('🔍 Testing Unified OAuth Authentication\n');

  // Check authentication status
  const status = unifiedAuth.getAuthStatus();
  console.log('📋 Authentication Status:');
  console.log(`   Method: ${status.method}`);
  console.log(`   Client Credentials: ${status.hasClientCredentials ? '✅' : '❌'}`);
  console.log(`   Refresh Token: ${status.hasRefreshToken ? '✅' : '❌'}`);
  console.log(`   Google Ads Tokens: ${status.hasGoogleAdsTokens ? '✅' : '❌'}`);
  console.log(`   Ready for Use: ${status.isReady ? '✅' : '❌'}\n`);

  if (!status.hasRefreshToken) {
    console.log('⚠️  OAuth token not configured');
    console.log('📋 Next Steps:');
    console.log('1. Download OAuth credentials from Google Cloud Console');
    console.log('2. Save as: credentials/google-ads-credentials.json');  
    console.log('3. Run: node scripts/generate-google-ads-token.js');
    console.log('4. Follow the URL and authorize all APIs');
    console.log('5. Add the tokens to your .env file\n');
    return;
  }

  // Test all API connections
  console.log('🧪 Testing API Connections...\n');
  
  try {
    const results = await unifiedAuth.testAllConnections();
    
    console.log('📊 API Connection Results:');
    console.log(`   Search Console: ${results.searchConsole ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   Google Analytics: ${results.analytics ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   Google Ads: ${results.googleAds ? '✅ Ready' : '❌ Failed'}\n`);
    
    if (results.errors.length > 0) {
      console.log('❌ Errors encountered:');
      results.errors.forEach(error => console.log(`   • ${error}`));
      console.log('');
    }

    // Test specific API functionality
    if (results.analytics) {
      console.log('📈 Testing Google Analytics Data...');
      try {
        const analyticsAdmin = await unifiedAuth.getAnalyticsAdminClient();
        const accounts = await analyticsAdmin.accounts.list();
        
        if (accounts.data.accounts) {
          console.log(`✅ Found ${accounts.data.accounts.length} Analytics account(s):`);
          
          for (const account of accounts.data.accounts) {
            console.log(`   📋 ${account.displayName}`);
            
            // List properties
            try {
              const properties = await analyticsAdmin.properties.list({
                filter: `parent:${account.name}`
              });
              
              if (properties.data.properties && properties.data.properties.length > 0) {
                console.log(`      Properties: ${properties.data.properties.length}`);
                properties.data.properties.forEach(prop => {
                  const propId = prop.name?.split('/')[1] || 'Unknown';
                  console.log(`      • ${prop.displayName} (ID: ${propId})`);
                });
              } else {
                console.log(`      Properties: No properties found for this account`);
              }
            } catch (propError) {
              console.log(`      Properties: Unable to fetch (${propError.message})`);
            }
          }
        }
        console.log('');
      } catch (error) {
        console.log(`❌ Analytics test failed: ${error.message}\n`);
      }
    }

    if (results.searchConsole) {
      console.log('📊 Testing Search Console Data...');
      try {
        const webmasters = await unifiedAuth.getSearchConsoleClient();
        const sites = await webmasters.sites.list();
        
        if (sites.data.siteEntry) {
          console.log(`✅ Found ${sites.data.siteEntry.length} Search Console site(s):`);
          sites.data.siteEntry.forEach(site => {
            console.log(`   • ${site.siteUrl} (${site.permissionLevel})`);
          });
        }
        console.log('');
      } catch (error) {
        console.log(`❌ Search Console test failed: ${error.message}\n`);
      }
    }

    // Summary and recommendations
    const successCount = [results.searchConsole, results.analytics, results.googleAds].filter(Boolean).length;
    console.log('🎯 Summary:');
    console.log(`   APIs Connected: ${successCount}/3`);
    
    if (successCount === 3) {
      console.log('   🎉 All APIs ready! Unified OAuth is working perfectly.');
      
      if (!process.env.GOOGLE_ANALYTICS_PROPERTY_ID) {
        console.log('\n💡 Optional: Add GOOGLE_ANALYTICS_PROPERTY_ID to .env for data analysis');
      }
      
      console.log('\n✅ You can now use all SEO Ads Expert features:');
      console.log('   • npx tsx src/cli.ts performance ingest-ads --from google-ads');
      console.log('   • npx tsx src/cli.ts performance paid-organic-gaps');
      console.log('   • npx tsx src/cli.ts monitor');
    } else {
      console.log('   ⚠️  Some APIs need attention (see errors above)');
    }

  } catch (error) {
    console.error('❌ Authentication test failed:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.log('\n💡 Token expired or invalid - regenerate:');
      console.log('   node scripts/generate-google-ads-token.js');
    }
  }
}

// Run the test
testUnifiedAuth().catch(console.error);