#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

console.log('🧪 Testing RapidAPI Endpoints...\n');

// Test configurations for different RapidAPI endpoints
const testConfigs = [
  {
    name: 'Web Search (Contextual)',
    method: 'GET',
    url: 'https://contextualwebsearch-websearch-v1.p.rapidapi.com/api/Search/WebSearchAPI',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'contextualwebsearch-websearch-v1.p.rapidapi.com'
    },
    params: {
      q: 'chrome extension',
      pageNumber: '1',
      pageSize: '3',
      autoCorrect: 'true'
    }
  },
  {
    name: 'Web Search (Alternative endpoint)',
    method: 'GET',
    url: 'https://contextualwebsearch-websearch-v1.p.rapidapi.com/api/search/NewsSearchAPI',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'contextualwebsearch-websearch-v1.p.rapidapi.com'
    },
    params: {
      q: 'chrome extension',
      pageNumber: '1',
      pageSize: '3',
      autoCorrect: 'true'
    }
  },
  {
    name: 'Google Search (SerpAPI alternative)',
    method: 'GET',
    url: 'https://google-search3.p.rapidapi.com/api/v1/search/q=chrome+extension',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'google-search3.p.rapidapi.com'
    }
  },
  {
    name: 'Real-Time Google Search',
    method: 'GET',
    url: 'https://real-time-google-search.p.rapidapi.com/search',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'real-time-google-search.p.rapidapi.com'
    },
    params: {
      q: 'chrome extension',
      limit: '3'
    }
  },
  {
    name: 'Keywords - Google Keyword Insight',
    method: 'GET',
    url: 'https://google-keyword-insight1.p.rapidapi.com/keywords/related',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'google-keyword-insight1.p.rapidapi.com'
    },
    params: {
      keyword: 'chrome extension',
      country: 'us',
      language: 'en',
      limit: '5'
    }
  },
  {
    name: 'Keywords - Keyword Research',
    method: 'GET',
    url: 'https://keyword-research4.p.rapidapi.com/v2/related',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'keyword-research4.p.rapidapi.com'
    },
    params: {
      keyword: 'chrome extension',
      country: 'us',
      language: 'en'
    }
  }
];

async function testEndpoint(config: any) {
  console.log(`\n📍 Testing: ${config.name}`);
  console.log(`   URL: ${config.url}`);
  
  try {
    const response = await axios.request({
      ...config,
      timeout: 10000,
      validateStatus: (status) => true // Don't throw on any status
    });
    
    const status = response.status;
    const statusText = response.statusText;
    
    if (status === 200) {
      console.log(`   ✅ SUCCESS (${status} ${statusText})`);
      
      // Show sample of response structure
      if (response.data) {
        const dataKeys = Object.keys(response.data).slice(0, 5);
        console.log(`   📦 Response keys: ${dataKeys.join(', ')}`);
        
        // Show first result if it's an array or has results
        if (Array.isArray(response.data)) {
          console.log(`   📊 Results count: ${response.data.length}`);
        } else if (response.data.value && Array.isArray(response.data.value)) {
          console.log(`   📊 Results count: ${response.data.value.length}`);
        } else if (response.data.results && Array.isArray(response.data.results)) {
          console.log(`   📊 Results count: ${response.data.results.length}`);
        } else if (response.data.organic_results) {
          console.log(`   📊 Organic results: ${response.data.organic_results.length}`);
        }
      }
      
      return true;
    } else if (status === 403) {
      console.log(`   ❌ FORBIDDEN (${status}) - Check subscription or API key`);
      if (response.data?.message) {
        console.log(`   💬 Message: ${response.data.message}`);
      }
    } else if (status === 404) {
      console.log(`   ❌ NOT FOUND (${status}) - Endpoint may have changed`);
    } else if (status === 429) {
      console.log(`   ⚠️  RATE LIMITED (${status}) - Too many requests`);
    } else {
      console.log(`   ❌ ERROR (${status} ${statusText})`);
      if (response.data?.message || response.data?.error) {
        console.log(`   💬 Message: ${response.data.message || response.data.error}`);
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
    
    // Small delay between tests to avoid rate limiting
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
  
  if (working.length === 0) {
    console.log('\n⚠️  No working endpoints found. Please check:');
    console.log('   1. Your RapidAPI subscription is active');
    console.log('   2. You have subscribed to the required APIs');
    console.log('   3. Your API key is valid');
    console.log('   4. Visit https://rapidapi.com/developer/dashboard to manage subscriptions');
  }
}

main().catch(console.error);