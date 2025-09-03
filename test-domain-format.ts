#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import { SearchConsoleConnector } from './src/connectors/search-console.js';

config();

async function test() {
  const connector = new SearchConsoleConnector();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  console.log('Testing sc-domain:littlebearapps.com format...\n');
  
  try {
    const result = await connector.getSearchAnalytics({
      site: 'sc-domain:littlebearapps.com',  // Domain property format
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      markets: ['usa'],
      targetPages: []
    });
    
    console.log('✅ SUCCESS! Search Console is working!');
    console.log(`📊 Results:`);
    console.log(`  - Keywords found: ${result.keywords.length}`);
    console.log(`  - Total clicks: ${result.totalClicks}`);
    console.log(`  - Total impressions: ${result.totalImpressions}`);
    
    if (result.keywords.length > 0) {
      console.log('\n📝 Keywords:');
      result.keywords.forEach(kw => {
        console.log(`  - "${kw.keyword}"`);
      });
    } else {
      console.log('\nNo keywords yet (site is new, this is normal)');
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
  }
}

test();