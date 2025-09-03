#!/usr/bin/env node

// Quick connection test script
import { validateEnvironment } from './src/utils/validation.js';
import { RapidApiSerpConnector } from './src/connectors/rapid-serp.js';
import { RapidApiKeywordConnector } from './src/connectors/rapid-keywords.js';
import { SearchConsoleConnector } from './src/connectors/search-console.js';

console.log('🧪 Testing API connections...\n');

try {
  // Test environment validation
  console.log('1️⃣ Testing environment configuration...');
  const env = validateEnvironment();
  console.log('✅ Environment validation passed\n');

  // Test RapidAPI SERP connector
  console.log('2️⃣ Testing RapidAPI SERP connector...');
  const serpConnector = new RapidApiSerpConnector();
  if (serpConnector.isConnected()) {
    console.log('✅ RapidAPI SERP connector initialized');
    console.log(`📊 SERP call limit: ${serpConnector.getMaxCalls()} per run\n`);
  } else {
    console.log('❌ RapidAPI SERP connector failed to initialize\n');
  }

  // Test RapidAPI Keywords connector  
  console.log('3️⃣ Testing RapidAPI Keywords connector...');
  const keywordsConnector = new RapidApiKeywordConnector();
  if (keywordsConnector.isConnected()) {
    console.log('✅ RapidAPI Keywords connector initialized\n');
  } else {
    console.log('❌ RapidAPI Keywords connector failed to initialize\n');
  }

  // Test Search Console connector
  console.log('4️⃣ Testing Google Search Console connector...');
  const gscConnector = new SearchConsoleConnector();
  if (gscConnector.isAvailable()) {
    console.log('✅ Google Search Console connector initialized');
    const sites = gscConnector.getConfiguredSites();
    console.log(`🔗 Configured sites: ${sites.join(', ')}\n`);
  } else {
    console.log('⚠️  Google Search Console connector not available (optional)\n');
  }

  console.log('🎉 Connection test complete! You can now run:');
  console.log('   npx tsx src/cli.ts plan --product convertmyfile');

} catch (error) {
  console.error('❌ Connection test failed:', error.message);
  console.error('\n💡 Please check your .env file configuration');
}