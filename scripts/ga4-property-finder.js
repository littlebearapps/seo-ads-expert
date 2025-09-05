#!/usr/bin/env node

/**
 * GA4 Property Investigation Tool
 * Helps identify which GA4 property to use
 */

import { google } from 'googleapis';
import { config } from 'dotenv';

config();

async function investigateGA4Properties() {
  console.log('🔍 GA4 Property Investigation\n');

  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    const authClient = await auth.getClient();
    
    // Use Google Analytics Admin API to list properties
    const analyticsadmin = google.analyticsadmin({ version: 'v1beta', auth: authClient });
    
    console.log('📊 Searching for GA4 properties...\n');
    
    // List all accounts first
    const accounts = await analyticsadmin.accounts.list();
    
    if (!accounts.data.accounts) {
      console.log('❌ No Google Analytics accounts found');
      console.log('💡 Make sure your service account has Analytics access');
      return;
    }

    console.log(`Found ${accounts.data.accounts.length} Analytics account(s):\n`);
    
    for (const account of accounts.data.accounts) {
      console.log(`📋 Account: ${account.displayName} (${account.name})`);
      
      // List properties for each account
      try {
        const properties = await analyticsadmin.accounts.properties.list({
          parent: account.name
        });
        
        if (properties.data.properties) {
          console.log(`   Properties: ${properties.data.properties.length} found`);
          
          for (const property of properties.data.properties) {
            console.log(`\n   🏠 Property: ${property.displayName}`);
            console.log(`      ID: ${property.name?.split('/')[1] || 'Unknown'}`);
            console.log(`      Type: ${property.propertyType || 'Unknown'}`);
            console.log(`      Currency: ${property.currencyCode || 'Not set'}`);
            console.log(`      Timezone: ${property.timeZone || 'Not set'}`);
            console.log(`      Created: ${property.createTime || 'Unknown'}`);
            
            // Check data streams
            try {
              const streams = await analyticsadmin.properties.dataStreams.list({
                parent: property.name
              });
              
              if (streams.data.dataStreams) {
                console.log(`      Data Streams: ${streams.data.dataStreams.length}`);
                
                streams.data.dataStreams.forEach(stream => {
                  console.log(`        • ${stream.displayName}`);
                  console.log(`          Type: ${stream.type}`);
                  if (stream.webStreamData) {
                    console.log(`          URL: ${stream.webStreamData.defaultUri}`);
                    console.log(`          Measurement ID: ${stream.webStreamData.measurementId}`);
                  }
                  console.log(`          Created: ${stream.createTime}`);
                });
              } else {
                console.log(`      Data Streams: None configured`);
              }
            } catch (streamError) {
              console.log(`      Data Streams: Unable to fetch (${streamError.message})`);
            }
          }
        } else {
          console.log(`   Properties: None found`);
        }
        
      } catch (propError) {
        console.log(`   Properties: Unable to fetch (${propError.message})`);
      }
      
      console.log('\n' + '─'.repeat(60) + '\n');
    }
    
    console.log('🎯 Recommendations:');
    console.log('\n1. **Check which property has actual data**:');
    console.log('   • Go to each property in GA4 web interface');
    console.log('   • Look at Reports → Realtime');
    console.log('   • Use the one that shows real traffic');
    
    console.log('\n2. **Check your website tracking code**:');
    console.log('   • Visit littlebearapps.com');
    console.log('   • View page source or use DevTools');
    console.log('   • Look for gtag or gtm tracking code');
    console.log('   • Note the measurement ID (G-XXXXXXXXXX)');
    
    console.log('\n3. **Plausible Integration Check**:');
    console.log('   • Log into your Plausible dashboard');
    console.log('   • Check if you enabled "Google Analytics Export"');
    console.log('   • Plausible may have created the secondary property');
    
    console.log('\n4. **For SEO Ads Expert**:');
    console.log('   • Use the property that tracks littlebearapps.com');
    console.log('   • Should have a web data stream with your domain');
    console.log('   • Should show actual organic search traffic');

  } catch (error) {
    console.error('❌ Error investigating GA4 properties:', error.message);
    
    if (error.message.includes('403') || error.message.includes('permission')) {
      console.log('\n💡 Permission Issues:');
      console.log('• Your service account needs Google Analytics access');
      console.log('• Go to GA4 → Admin → Account/Property → Access Management');
      console.log('• Add your service account email with Viewer permissions');
    } else if (error.message.includes('disabled')) {
      console.log('\n💡 API Issues:');
      console.log('• Enable Google Analytics Admin API');
      console.log('• Go to: https://console.cloud.google.com/apis/api/analyticsadmin.googleapis.com');
    }
  }
}

// Check if specific property IDs are set
console.log('🔧 Environment Check:');
console.log(`Service Account: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅' : '❌'}`);
console.log(`GA4 Property ID: ${process.env.GOOGLE_ANALYTICS_PROPERTY_ID || '❌ Not set'}`);
console.log('');

// Run the investigation
investigateGA4Properties().catch(console.error);