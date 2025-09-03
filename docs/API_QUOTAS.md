# API Quotas and Rate Limits

## RapidAPI Free Tier Limits

### Google Keyword Insight API
- **Monthly Quota**: 20 requests/month
- **Daily Limit**: ~0.67 requests/day
- **Rate Limit**: Unknown (appears immediate)
- **Reset**: Monthly
- **Cost**: Free tier

### Real-Time Web Search API  
- **Monthly Quota**: 100 requests/month
- **Daily Limit**: ~3.3 requests/day
- **Rate Limit**: 1000 requests/hour (free tier cap)
- **Reset**: Monthly
- **Cost**: Free tier

## Current Usage Strategy

### Quota Conservation
1. **Aggressive Caching**: 24-hour cache TTL for all API responses
2. **SERP Call Limit**: Max 30 calls per run (configurable)
3. **Keyword Expansion**: Limited to seed queries only
4. **Smart Sampling**: Only analyze top keywords for SERP

### Monthly Budget Planning

With free tier limits:
- **Google Keyword Insight**: 20 calls/month = ~5 product plans/month (4 calls each)
- **Real-Time Web Search**: 100 calls/month = ~3-4 full SERP analyses/month (30 calls each)

### Recommended Usage Pattern

#### Development/Testing Mode
```bash
# Minimal API calls for testing
MAX_SERP_CALLS_PER_RUN=3
CACHE_TTL_HOURS=168  # 1 week cache
```

#### Production Mode (Monthly Planning)
```bash
# Conservative settings for free tier
MAX_SERP_CALLS_PER_RUN=10
CACHE_TTL_HOURS=720  # 30 day cache
```

## Monitoring Usage

### Check Current Month Usage
1. Log into [RapidAPI Dashboard](https://rapidapi.com/developer/dashboard)
2. View each API's usage metrics
3. Monitor "Requests This Billing Period"

### In-App Tracking
The tool tracks API calls per session:
- See `cache/quota_stats.json` for session metrics
- Check logs for "API calls made: X/Y" messages

## Quota Exceeded Handling

When quotas are exhausted:
1. **Keyword Expansion**: Falls back to seed queries only
2. **SERP Analysis**: Skips competitor analysis
3. **Data Source**: Shows "ESTIMATED" for all metrics

## Cost-Effective Alternatives

### For More Calls
1. **RapidAPI Basic Plans**:
   - Google Keyword Insight: $5/month = 500 requests
   - Real-Time Web Search: $9/month = 15,000 requests

2. **Official APIs** (when approved):
   - Google Ads API: Free with Google Ads account
   - Google Search Console: Free, 50,000 queries/day

### Optimization Tips
1. **Batch Planning**: Generate all product plans on same day to maximize cache hits
2. **Reuse Cache**: Run `show` command instead of regenerating plans
3. **Export Data**: Save CSV/JSON outputs for offline analysis
4. **Test Locally**: Use cached data for development

## Implementation in Code

### Current Safeguards
- `MAX_SERP_CALLS_PER_RUN=30` in .env
- Cache manager prevents redundant calls
- Graceful fallback when APIs fail
- Warning messages when approaching limits

### Future Improvements
- [ ] Add monthly quota tracking to cache
- [ ] Implement daily rate limiting
- [ ] Add quota warning at 80% usage
- [ ] Create offline mode using only cached data