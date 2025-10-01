# API Usage Limits & Monitoring

## Overview
SEO Ads Expert implements comprehensive API usage tracking and rate limiting to prevent quota overages and unexpected costs.

## API Limits Configuration

### RapidAPI Services (Upgraded Tiers)

#### 1. Real-Time Web Search API
- **Plan**: Upgraded Tier
- **Monthly Limit**: 20,000 requests/month
- **Rate Limit**: 10 requests/second
- **Configured In**: `src/utils/rate-limiter.ts` (line 239)
- **Token Bucket**: 10 tokens, 10/second refill rate

#### 2. Google Keyword Insight API
- **Plan**: Upgraded Tier
- **Daily Limit**: 2,000 requests/day
- **Rate Limit**: 20 requests/minute
- **Configured In**: `src/utils/rate-limiter.ts` (line 242)
- **Token Bucket**: 20 tokens, 0.333/second refill rate

### Google Cloud APIs

#### 1. Google Ads API
- **Default Limits**:
  - 50 calls/hour
  - 500 calls/day
- **Configurable via Environment Variables**:
  - `MAX_GOOGLE_ADS_CALLS_PER_HOUR` (default: 50)
  - `MAX_GOOGLE_ADS_CALLS_PER_DAY` (default: 500)
- **Cost Monitoring**: `src/utils/cost-monitor.ts`
- **Rate Limiter**: 10 requests/second token bucket

#### 2. Google Analytics API
- **Standard Google Quotas Apply**:
  - 50,000 requests/day per project
  - 10 queries/second per IP
  - 100 requests/100 seconds per user
- **Rate Limiter**: Shared with Google APIs (10/second)

#### 3. Google Search Console API
- **Standard Quotas**:
  - 1,200 queries/minute
  - 50,000 queries/day
- **Rate Limiter**: 10 requests/second token bucket

## Usage Tracking Systems

### 1. CostMonitor (`src/utils/cost-monitor.ts`)
Tracks all API calls with estimated costs and enforces budget limits.

**Features**:
- Records to `data/api-usage.json`
- Tracks per-service usage
- Daily/monthly cost limits
- Alert generation at 80% threshold
- 30-day rolling history

**Environment Variables**:
```bash
DAILY_COST_LIMIT_USD=1.00      # Default: $1.00/day
MONTHLY_COST_LIMIT_USD=10.00   # Default: $10.00/month
MAX_GOOGLE_ADS_CALLS_PER_DAY=500
MAX_GOOGLE_ADS_CALLS_PER_HOUR=50
```

### 2. Rate Limiter Manager (`src/utils/rate-limiter.ts`)
Implements token bucket and sliding window rate limiting.

**Token Bucket Limiters**:
- `google-ads`: 10 tokens, 10/s refill
- `google-search-console`: 10 tokens, 10/s refill
- `rapid-serp`: 10 tokens, 10/s refill (20K/month limit)
- `rapid-keywords`: 20 tokens, 0.333/s refill (2K/day limit)

**Sliding Window Limiters**:
- `file-operations`: 100/second
- `cache-operations`: 1000/second

### 3. Database Tracking
- **IndexNow Quota**: `indexnow_quota` table tracks Bing/Yandex submissions (10K/day limit)

### 4. Cache System
- **TTL**: 168 hours (7 days) default
- **Purpose**: Minimize duplicate API calls
- **Location**: `cache/` directory

## Monitoring Tools

### API Usage Report Script
```bash
npx tsx scripts/api-usage-report.js
```

Shows:
- Today's usage by service
- Month-to-date costs
- Current limits
- Alert status
- Cache statistics
- Configuration status

### Google Cloud Monitoring
```bash
npx tsx scripts/monitor-api-usage.js
```

Checks Google Cloud API quotas directly (requires credentials).

### Manual Monitoring URLs
- **Google Cloud Console**: https://console.cloud.google.com/apis/dashboard
- **RapidAPI Dashboard**: https://rapidapi.com/developer/dashboard

## Protection Mechanisms

1. **Pre-flight Checks**: CostMonitor checks limits before each API call
2. **Rate Limiting**: Token buckets prevent burst traffic
3. **Cache Layer**: 7-day cache reduces redundant calls
4. **Quota Tracking**: Real-time tracking in `data/api-usage.json`
5. **Alert System**: Warnings at 80% of limits
6. **Hard Stops**: Requests blocked when limits exceeded

## Best Practices

1. **Always use cached data when available** - Check cache before API calls
2. **Batch requests** - Combine multiple operations when possible
3. **Monitor daily** - Run `api-usage-report.js` regularly
4. **Set conservative limits** - Start low and increase as needed
5. **Use environment variables** - Configure limits per environment

## Troubleshooting

### "Quota exceeded" errors
1. Check current usage: `npx tsx scripts/api-usage-report.js`
2. Review `data/api-usage.json` for patterns
3. Increase cache TTL if appropriate
4. Consider upgrading API tiers

### Rate limiting delays
1. Check token bucket status in logs
2. Adjust burst size in `rate-limiter.ts`
3. Implement retry logic with exponential backoff

### Cost overruns
1. Lower `DAILY_COST_LIMIT_USD` and `MONTHLY_COST_LIMIT_USD`
2. Reduce `MAX_SERP_CALLS_PER_RUN`
3. Increase `CACHE_TTL_HOURS`
4. Review API call patterns in usage logs

## API Costs Reference

### Estimated Costs per Call
- Google Ads API: ~$0.0001 per operation
- Google Analytics: Free (within quotas)
- Search Console: Free (within quotas)
- RapidAPI SERP: Included in monthly subscription
- RapidAPI Keywords: Included in daily subscription

Note: Actual costs depend on your Google Cloud pricing tier and RapidAPI subscriptions.