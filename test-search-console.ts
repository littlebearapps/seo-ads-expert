#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import { SearchConsoleConnector } from './src/connectors/search-console.js';

// Load environment variables
config();

console.log('🧪 Testing Google Search Console Connection...\n');

async function testSearchConsole() {
  const connector = new SearchConsoleConnector();
  
  // Wait a bit for async initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('✅ Connector initialized');
  console.log(`📊 Available: ${connector.isAvailable()}`);
  console.log(`🔗 Sites: ${connector.getConfiguredSites()}\n`);
  
  if (!connector.isAvailable()) {
    console.log('❌ Search Console not available');
    return;
  }
  
  // Try to list sites
  console.log('📋 Listing available sites...');
  try {
    const sites = await connector.listSites();
    console.log(`✅ Found ${sites.length} sites:`);
    sites.forEach(site => console.log(`  - ${site}`));
  } catch (error) {
    console.log('❌ Failed to list sites:', error);
  }
  
  // Try to query data
  console.log('\n🔍 Testing Search Analytics query...');
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // Last 30 days
  
  // Try different property formats
  const propertyFormats = [
    'https://littlebearapps.com',
    'https://littlebearapps.com/',
    'http://littlebearapps.com',
    'sc-domain:littlebearapps.com'  // Domain property format
  ];
  
  for (const siteUrl of propertyFormats) {
    console.log(`\nTrying format: ${siteUrl}`);
    try {
      const result = await connector.getSearchAnalytics({
        site: siteUrl,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        markets: ['usa'],
        targetPages: []
      });
      
      console.log(`✅ Query successful for ${siteUrl}!`);
    console.log(`📊 Results:`);
    console.log(`  - Keywords found: ${result.keywords.length}`);
    console.log(`  - Total clicks: ${result.totalClicks}`);
    console.log(`  - Total impressions: ${result.totalImpressions}`);
    console.log(`  - Average CTR: ${(result.averageCTR * 100).toFixed(2)}%`);
    console.log(`  - Average position: ${result.averagePosition.toFixed(1)}`);
    
    if (result.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${result.warnings.join(', ')}`);
    }
    
    if (result.keywords.length > 0) {
      console.log('\n📝 Top 5 keywords:');
      result.keywords.slice(0, 5).forEach(kw => {
        console.log(`  - "${kw.keyword}" (volume: ${kw.volume || 'N/A'})`);
      });
    }
    break; // Success, no need to try other formats
  } catch (error: any) {
    console.log('❌ Search Analytics query failed:', error.message || error);
    
    // More detailed error info
    if (error.response) {
      console.log('📋 Error details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    }
  }
}

testSearchConsole().catch(console.error);