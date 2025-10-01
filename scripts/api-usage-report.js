#!/usr/bin/env node

/**
 * API Usage Report for SEO Ads Expert
 * Shows current API usage tracking across all integrated services
 */

import { CostMonitor } from '../src/utils/cost-monitor.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

console.log('\n📊 SEO Ads Expert - API Usage Report\n');
console.log('=' .repeat(60));

// 1. Cost Monitor Usage (Google APIs and RapidAPI)
console.log('\n1. API Cost Tracking (CostMonitor)\n');
const costMonitor = new CostMonitor();
try {
  const summary = await costMonitor.getUsageSummary();

  console.log('Today\'s Usage:');
  console.log(`  Total Cost: $${summary.today.totalCost.toFixed(4)}`);
  console.log(`  Total Calls: ${summary.today.totalCalls}`);

  if (Object.keys(summary.today.services).length > 0) {
    console.log('\n  By Service:');
    for (const [service, data] of Object.entries(summary.today.services)) {
      console.log(`    ${service}: ${data.calls} calls, $${data.cost.toFixed(4)}`);
    }
  } else {
    console.log('  No API usage recorded today');
  }

  console.log('\nMonth-to-Date:');
  console.log(`  Total Cost: $${summary.month.toFixed(4)}`);

  console.log('\nLimits:');
  console.log(`  Daily Cost: $${summary.limits.dailyCost}`);
  console.log(`  Monthly Cost: $${summary.limits.monthlyCost}`);
  console.log(`  Daily Calls: ${summary.limits.dailyCalls}`);
  console.log(`  Hourly Calls: ${summary.limits.hourlyCalls}`);

  if (summary.alerts.length > 0) {
    console.log('\n⚠️  Alerts:');
    summary.alerts.forEach(alert => console.log(`  - ${alert}`));
  }
} catch (error) {
  console.log('  No usage data available yet');
}

// 2. IndexNow Quota Tracking
console.log('\n2. IndexNow Quota Tracking\n');
try {
  const db = new Database('data/seo-ads-expert.db', { readonly: true });
  const today = new Date().toISOString().split('T')[0];

  const quotaRows = db.prepare(`
    SELECT * FROM indexnow_quota
    WHERE date = ?
  `).all(today);

  if (quotaRows.length > 0) {
    quotaRows.forEach(row => {
      console.log(`  ${row.engine}: ${row.submitted} submitted, ${row.failed} failed`);
    });
  } else {
    console.log('  No IndexNow submissions today');
  }

  // Show weekly totals
  const weeklyTotals = db.prepare(`
    SELECT
      engine,
      SUM(submitted) as total_submitted,
      SUM(failed) as total_failed
    FROM indexnow_quota
    WHERE date >= date('now', '-7 days')
    GROUP BY engine
  `).all();

  if (weeklyTotals.length > 0) {
    console.log('\n  Last 7 Days:');
    weeklyTotals.forEach(row => {
      const successRate = row.total_submitted > 0
        ? ((row.total_submitted - row.total_failed) / row.total_submitted * 100).toFixed(1)
        : 0;
      console.log(`    ${row.engine}: ${row.total_submitted} submitted (${successRate}% success)`);
    });
  }

  db.close();
} catch (error) {
  console.log('  Database not initialized or no IndexNow data');
}

// 3. Rate Limiting Status
console.log('\n3. Rate Limiting Configuration\n');
console.log('  Google APIs:');
console.log(`    - Google Ads: 50 calls/hour, 500 calls/day (configurable)`);
console.log(`    - Analytics: Standard quotas apply`);
console.log(`    - Search Console: 1200 queries/minute`);
console.log('\n  RapidAPI Services (Upgraded Tiers):');
console.log(`    - Real-Time Web Search: 20,000 calls/month, 10 calls/second`);
console.log(`    - Google Keyword Insight: 2,000 calls/day, 20 calls/minute`);
console.log(`    - MAX_SERP_CALLS_PER_RUN: ${process.env.MAX_SERP_CALLS_PER_RUN || 3}`);

// 4. Cache Status
console.log('\n4. Cache Status\n');
const cacheDir = 'cache';
if (fs.existsSync(cacheDir)) {
  const files = fs.readdirSync(cacheDir);
  const cacheFiles = files.filter(f => f.endsWith('.json'));
  const totalSize = cacheFiles.reduce((sum, file) => {
    const stats = fs.statSync(path.join(cacheDir, file));
    return sum + stats.size;
  }, 0);

  console.log(`  Cached files: ${cacheFiles.length}`);
  console.log(`  Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`  Cache TTL: ${process.env.CACHE_TTL_HOURS || 168} hours`);
} else {
  console.log('  No cache directory found');
}

// 5. Environment Variables Check
console.log('\n5. API Configuration Status\n');
const apiConfigs = [
  { name: 'Google Ads', vars: ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_DEVELOPER_TOKEN'] },
  { name: 'Google Analytics', vars: ['GOOGLE_ANALYTICS_PROPERTY_ID'] },
  { name: 'Search Console', vars: ['SEARCH_CONSOLE_SITES'] },
  { name: 'RapidAPI', vars: ['RAPIDAPI_KEY', 'RAPIDAPI_HOST_SERP'] },
];

apiConfigs.forEach(config => {
  const configured = config.vars.every(v => process.env[v]);
  const status = configured ? '✓ Configured' : '✗ Missing';
  console.log(`  ${config.name}: ${status}`);
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ Report Complete\n');

// Recommendations
console.log('📌 Recommendations:\n');
console.log('1. To start tracking API usage, run any command that calls APIs');
console.log('2. Usage data is stored in data/api-usage.json (auto-created)');
console.log('3. Set cost limits via environment variables:');
console.log('   - DAILY_COST_LIMIT_USD (default: $1.00)');
console.log('   - MONTHLY_COST_LIMIT_USD (default: $10.00)');
console.log('4. Monitor Google Cloud usage: https://console.cloud.google.com/apis/dashboard');
console.log('5. Check RapidAPI usage: https://rapidapi.com/developer/dashboard\n');