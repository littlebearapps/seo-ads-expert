#!/usr/bin/env tsx
import axios from 'axios';

async function testUpdatedRapidAPIEndpoints() {
  console.log('🔍 Testing Updated RapidAPI Endpoints...\n');
  
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.log('❌ RAPIDAPI_KEY not found in environment');
    return;
  }
  
  console.log(`🔑 Using API Key: ${apiKey.substring(0, 10)}...${apiKey.slice(-4)}\n`);
  
  const endpoints = [
    {
      name: 'Real-Time Web Search (Updated)',
      url: 'https://real-time-web-search.p.rapidapi.com/search',
      host: 'real-time-web-search.p.rapidapi.com',
      params: { q: 'chrome extension', limit: '5' }
    },
    {
      name: 'Google Search (SerpApi alternative)',
      url: 'https://google-search3.p.rapidapi.com/api/v1/search',
      host: 'google-search3.p.rapidapi.com', 
      params: { q: 'chrome extension', num: '5' }
    },
    {
      name: 'SEO Content API',
      url: 'https://seo-content-api.p.rapidapi.com/search',
      host: 'seo-content-api.p.rapidapi.com',
      params: { keyword: 'chrome extension' }
    },
    {
      name: 'Keyword Research Alternative',
      url: 'https://keyword-research-for-seo.p.rapidapi.com/api/keywords',
      host: 'keyword-research-for-seo.p.rapidapi.com',
      params: { keyword: 'chrome extension' }
    }
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`📍 Testing: ${endpoint.name}`);
      console.log(`   URL: ${endpoint.url}`);
      
      const response = await axios.get(endpoint.url, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': endpoint.host
        },
        params: endpoint.params,
        timeout: 10000
      });
      
      console.log(`   ✅ SUCCESS (${response.status}) - ${JSON.stringify(response.data).length} bytes`);
      results.push({ ...endpoint, status: 'success', code: response.status });
      
    } catch (error: any) {
      if (error.response) {
        console.log(`   ❌ ${error.response.status === 404 ? 'NOT FOUND (404)' : 
                    error.response.status === 429 ? 'RATE LIMITED (429)' : 
                    error.response.status === 403 ? 'FORBIDDEN (403)' : 
                    `ERROR (${error.response.status})`} - ${error.response.statusText || 'No message'}`);
        results.push({ ...endpoint, status: 'error', code: error.response.status });
      } else {
        console.log(`   ❌ CONNECTION ERROR - ${error.message}`);
        results.push({ ...endpoint, status: 'connection_error', error: error.message });
      }
    }
    console.log('');
  }
  
  console.log('============================================================');
  console.log('📊 SUMMARY\n');
  
  const working = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status !== 'success');
  
  if (working.length > 0) {
    console.log(`✅ Working endpoints (${working.length}):`);
    working.forEach(r => console.log(`   - ${r.name}`));
    console.log('');
  }
  
  if (failed.length > 0) {
    console.log(`❌ Failed endpoints (${failed.length}):`);
    failed.forEach(r => console.log(`   - ${r.name}`));
    console.log('');
  }
  
  if (working.length === 0) {
    console.log('⚠️  No working endpoints found. Recommendations:');
    console.log('   1. Check your RapidAPI subscription is active');
    console.log('   2. Verify you have subscribed to the required APIs');
    console.log('   3. Your API key might need regeneration');
    console.log('   4. Visit https://rapidapi.com/developer/dashboard to manage subscriptions');
    console.log('   5. Consider alternative API providers or mock data for development');
  } else {
    console.log('💡 Recommendation: Update your connector configuration to use working endpoints');
  }
}

testUpdatedRapidAPIEndpoints().catch(console.error);