#!/usr/bin/env node

/**
 * Google API Usage Monitor
 * Checks your current API quota usage and costs
 * 
 * Usage: node scripts/monitor-api-usage.js
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'seo-ads-expert-api';
const CREDENTIALS_FILE = path.join(__dirname, '..', 'credentials', 'google-ads-credentials.json');

async function getAuthClient() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
    const { client_id, client_secret } = credentials.installed || credentials.web;
    
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN
    });
    
    return oauth2Client;
  } catch (error) {
    console.error('❌ Error setting up authentication:', error.message);
    return null;
  }
}

async function checkQuotaUsage(auth) {
  console.log('📊 Current API Quota Usage\n');
  
  try {
    const serviceusage = google.serviceusage({ version: 'v1', auth });
    
    // Google Ads API quotas
    console.log('🎯 Google Ads API:');
    const adsQuotas = await serviceusage.services.consumerQuotaMetrics.list({
      parent: `projects/${PROJECT_ID}/services/googleads.googleapis.com`
    });
    
    if (adsQuotas.data.metrics) {
      adsQuotas.data.metrics.forEach(metric => {
        console.log(`  • ${metric.metric}: ${metric.displayName}`);
        if (metric.consumerQuotaLimits) {
          metric.consumerQuotaLimits.forEach(limit => {
            console.log(`    - Limit: ${limit.quota?.limit || 'Unknown'}`);
            console.log(`    - Usage: ${limit.quota?.usage || 0}`);
          });
        }
      });
    } else {
      console.log('  No quota data available (API may not be enabled yet)');
    }
    
    console.log('\n📈 Google Analytics API:');
    const analyticsQuotas = await serviceusage.services.consumerQuotaMetrics.list({
      parent: `projects/${PROJECT_ID}/services/analyticsdata.googleapis.com`
    });
    
    if (analyticsQuotas.data.metrics) {
      analyticsQuotas.data.metrics.forEach(metric => {
        console.log(`  • ${metric.displayName}`);
      });
    } else {
      console.log('  No quota data available');
    }
    
  } catch (error) {
    console.log('⚠️  Could not fetch quota data:', error.message);
    console.log('This is normal if APIs are not fully enabled yet.\n');
  }
}

async function estimateCurrentCosts() {
  console.log('💰 Cost Estimation\n');
  
  // Read from cache to estimate API calls made today
  const cacheDir = path.join(__dirname, '..', 'cache');
  let estimatedCalls = 0;
  
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      const today = new Date().toISOString().split('T')[0];
      
      files.forEach(file => {
        if (file.includes(today)) {
          estimatedCalls++;
        }
      });
    }
  } catch (error) {
    // Ignore cache read errors
  }
  
  console.log(`📞 Estimated API calls today: ${estimatedCalls}`);
  console.log(`💵 Estimated cost today: $${(estimatedCalls * 0.0001).toFixed(4)}`);
  console.log(`📅 Estimated monthly cost: $${(estimatedCalls * 0.0001 * 30).toFixed(2)}`);
  
  // Cost breakdown
  console.log('\n💡 Cost Breakdown:');
  console.log('• Google Ads API: ~$0.0001 per operation');
  console.log('• Google Analytics API: Free (25K requests/day)');
  console.log('• Search Console API: Free');
  console.log('• Other Google Cloud services: Minimal for this use case');
}

async function showRecommendations() {
  console.log('\n🎯 Cost Optimization Tips:\n');
  
  const tips = [
    '💾 Cache API responses (24h TTL already implemented)',
    '📊 Batch API requests when possible',
    '🔄 Use incremental data pulls instead of full dumps',
    '⏰ Schedule data imports during off-peak hours',
    '🎚️  Start with daily imports, not real-time',
    '🔍 Filter API requests to only needed data fields',
    '📈 Monitor usage weekly and adjust quotas accordingly',
    '🚨 Set up SMS alerts for budget thresholds'
  ];
  
  tips.forEach(tip => console.log(tip));
  
  console.log('\n⚠️  Budget Alert Status:');
  console.log('Current budget: $10/month');
  console.log('Recommended for testing: $5/month initially');
  console.log('Production budget: $25-50/month depending on usage');
}

async function main() {
  console.log('🔍 SEO Ads Expert - API Usage Monitor\n');
  console.log('═'.repeat(50));
  
  // Check environment
  if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    console.log('⚠️  GOOGLE_ADS_REFRESH_TOKEN not set');
    console.log('Run the token generator script first.\n');
  }
  
  if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.log('⚠️  GOOGLE_CLOUD_PROJECT_ID not set');
    console.log('Add your project ID to .env file.\n');
  }
  
  // Try to get auth
  const auth = await getAuthClient();
  
  if (auth) {
    await checkQuotaUsage(auth);
  }
  
  await estimateCurrentCosts();
  await showRecommendations();
  
  console.log('\n═'.repeat(50));
  console.log('💡 Run this script weekly to monitor usage and costs');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}