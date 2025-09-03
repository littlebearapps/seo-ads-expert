#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

console.log('🧪 Testing Updated RapidAPI Endpoints...\n');

const testConfigs = [
  {
    name: 'Google Keyword Insight - keysuggest',
    method: 'GET',
    url: 'https://google-keyword-insight1.p.rapidapi.com/keysuggest/',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'google-keyword-insight1.p.rapidapi.com'
    },
    params: {
      keyword: 'chrome extension',
      location: 'US',
      lang: 'en',
      mode: 'all',
      intent: 'transactional',
      return_intent: 'true'
    }
  },
  {
    name: 'Real-Time Web Search - search (Light)',
    method: 'GET',
    url: 'https://real-time-web-search.p.rapidapi.com/search',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'real-time-web-search.p.rapidapi.com'
    },
    params: {
      q: 'chrome extension development',
      limit: '5'
    }
  }
];

async function testEndpoint(config: any) {
  console.log(`\n📍 Testing: ${config.name}`);
  console.log(`   URL: ${config.url}`);
  console.log(`   Params:`, config.params);
  
  try {
    const response = await axios.request({
      ...config,
      timeout: 30000,
      validateStatus: (status) => true // Don't throw on any status
    });
    
    const status = response.status;
    const statusText = response.statusText;
    
    if (status === 200) {
      console.log(`   ✅ SUCCESS (${status} ${statusText})`);
      
      // Show sample of response structure
      if (response.data) {
        // For Google Keyword Insight
        if (config.name.includes('Keyword')) {
          if (Array.isArray(response.data)) {
            console.log(`   📊 Keywords returned: ${response.data.length}`);
            if (response.data.length > 0) {
              const sample = response.data[0];
              console.log(`   📝 Sample keyword:`, {
                keyword: sample.keyword || sample.text,
                volume: sample.search_volume || sample.volume,
                competition: sample.competition,
                intent: sample.intent
              });
            }
          }
        }
        
        // For Real-Time Web Search
        if (config.name.includes('Web Search')) {
          if (response.data.status === 'OK' && response.data.data) {
            const results = response.data.data.organic_results || [];
            console.log(`   📊 Search results: ${results.length}`);
            console.log(`   📈 Total results: ${response.data.data.total_organic_results?.toLocaleString()}`);
            if (results.length > 0) {
              console.log(`   📝 Sample result:`, {
                title: results[0].title,
                url: results[0].url,
                snippet: results[0].snippet?.substring(0, 100) + '...'
              });
            }
          } else if (response.data.status === 'ERROR') {
            console.log(`   ❌ API Error: ${response.data.error?.message}`);
          }
        }
      }
      
      return true;
    } else if (status === 403) {
      console.log(`   ❌ FORBIDDEN (${status}) - Not subscribed to this API`);
      console.log(`   💡 Subscribe at: https://rapidapi.com/hub`);
      if (response.data?.message) {
        console.log(`   💬 Message: ${response.data.message}`);
      }
    } else if (status === 404) {
      console.log(`   ❌ NOT FOUND (${status}) - Endpoint or parameters incorrect`);
    } else if (status === 429) {
      console.log(`   ⚠️  RATE LIMITED (${status}) - Too many requests`);
    } else {
      console.log(`   ❌ ERROR (${status} ${statusText})`);
      if (response.data) {
        console.log(`   💬 Response:`, JSON.stringify(response.data, null, 2));
      }
    }
    
    return false;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      console.log(`   ⏱️  TIMEOUT - Request took too long`);
    } else if (error.code === 'ENOTFOUND') {
      console.log(`   🌐 DNS ERROR - Host not found`);
    } else {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your-rapidapi-key-here') {
    console.error('❌ RAPIDAPI_KEY not configured in .env file');
    process.exit(1);
  }
  
  console.log(`🔑 Using API Key: ${RAPIDAPI_KEY.substring(0, 10)}...${RAPIDAPI_KEY.substring(RAPIDAPI_KEY.length - 4)}\n`);
  
  const results = [];
  for (const config of testConfigs) {
    const success = await testEndpoint(config);
    results.push({ name: config.name, success });
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  
  const working = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (working.length > 0) {
    console.log('✅ Working endpoints:');
    working.forEach(r => console.log(`   - ${r.name}`));
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed endpoints:');
    failed.forEach(r => console.log(`   - ${r.name}`));
  }
  
  if (failed.length > 0) {
    console.log('\n📚 Next Steps:');
    console.log('1. Subscribe to the required APIs at:');
    console.log('   - Google Keyword Insight: https://rapidapi.com/keyword-insight/api/google-keyword-insight1');
    console.log('   - Real-Time Web Search: https://rapidapi.com/letscrape-6bRBa3QguO5/api/real-time-web-search');
    console.log('2. Ensure you are subscribed to at least the free/basic plan');
    console.log('3. Verify your API key is valid');
  } else {
    console.log('\n🎉 All APIs are working! The tool is ready to use.');
  }
}

main().catch(console.error);