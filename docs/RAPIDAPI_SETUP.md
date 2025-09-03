# RapidAPI Setup Guide for SEO & Ads Expert Tool

## Required API Subscriptions

To use this tool with full functionality, you need to subscribe to specific APIs on RapidAPI. The tool can work without these (using seed queries only), but for best results, subscribe to at least one from each category.

### Option 1: Free APIs (Recommended for Testing)

#### For SERP Analysis (Choose One):
1. **Google Search** by apigeek
   - URL: https://rapidapi.com/apigeek/api/google-search3
   - Free Tier: 100 requests/month
   - Endpoint: `google-search3.p.rapidapi.com`

2. **Real-Time Google Search** by Glavier
   - URL: https://rapidapi.com/Glavier/api/real-time-google-search
   - Free Tier: 100 requests/month
   - Endpoint: `real-time-google-search.p.rapidapi.com`

3. **SERP API** by serpapi
   - URL: https://rapidapi.com/serpapi/api/serpapi
   - Free Tier: 100 searches/month
   - Endpoint: `serpapi.p.rapidapi.com`

#### For Keyword Research (Choose One):
1. **Keyword Tool** by keyword-tool
   - URL: https://rapidapi.com/keyword-tool/api/keyword-tool
   - Free Tier: Limited requests
   - Endpoint: `keyword-tool.p.rapidapi.com`

2. **Keywords Everywhere** by axesso
   - URL: https://rapidapi.com/axesso/api/keywords-everywhere
   - Free Tier: 100 requests/month
   - Endpoint: `keywords-everywhere.p.rapidapi.com`

### Option 2: Previously Configured APIs (Need Subscription)

These are the APIs the tool was originally configured for. They may require paid subscriptions:

1. **Contextual Web Search**
   - URL: https://rapidapi.com/contextualwebsearch/api/web-search
   - Status: Rate limited (429) - subscription may be inactive

2. **Google Keyword Insight**
   - URL: https://rapidapi.com/keyword-insight/api/google-keyword-insight1
   - Status: Not found (404) - needs subscription

## How to Subscribe

1. **Login to RapidAPI**
   - Visit https://rapidapi.com
   - Sign in or create an account

2. **Find the API**
   - Search for one of the APIs listed above
   - Or use the direct URLs provided

3. **Subscribe to Free Tier**
   - Click "Subscribe to Test"
   - Select "Basic" (Free) plan
   - Confirm subscription

4. **Get Your API Key**
   - Go to https://rapidapi.com/developer/dashboard
   - Copy your API key (starts with something like `f04bb605e2...`)
   - Add to `.env` file as `RAPIDAPI_KEY`

5. **Update Configuration**
   Once subscribed, update your `.env` file with the correct hosts:
   ```bash
   # Example for Google Search API
   RAPIDAPI_HOST_SERP=google-search3.p.rapidapi.com
   
   # Example for Keyword Tool
   RAPIDAPI_HOST_KEYWORDS=keyword-tool.p.rapidapi.com
   ```

## Testing Your Setup

After subscribing and updating `.env`, test your configuration:

```bash
# Test RapidAPI connections
npx tsx test-rapidapi.ts

# Test the full tool
npx tsx src/cli.ts test
```

## Working Without RapidAPI

The tool will still function without RapidAPI by:
1. Using seed queries from product configurations
2. Importing Google Keyword Planner CSV files (if available)
3. Using Google Search Console data (if configured)

To maximize effectiveness without RapidAPI:
1. Export keyword data from Google Keyword Planner as CSV
2. Place CSV files in `inputs/kwp_csv/[product]/`
3. Configure Google Search Console access (see main README)

## Troubleshooting

### "404 Not Found" Errors
- You haven't subscribed to the API
- The API endpoint has changed
- Solution: Subscribe to the API on RapidAPI

### "403 Forbidden" Errors  
- Invalid API key
- API key not authorized for this API
- Solution: Check your API key and subscription

### "429 Too Many Requests" Errors
- Rate limit exceeded
- Solution: Wait and retry, or upgrade your plan

### "ENOTFOUND" Errors
- Incorrect host configuration
- Solution: Verify the `RAPIDAPI_HOST_*` values in `.env`

## Updating Connector Code

If you've subscribed to different APIs than originally configured, you may need to update the connector code:

1. **Update SERP Connector** (`src/connectors/rapid-serp.ts`):
   - Change the `baseUrl` to match your API
   - Update the request parameters to match API documentation
   - Modify response parsing to match the API's response format

2. **Update Keywords Connector** (`src/connectors/rapid-keywords.ts`):
   - Change the `baseUrl` to match your API
   - Update request parameters
   - Modify response parsing

Example connector update for Google Search API:
```typescript
// In rapid-serp.ts
private baseUrl = 'https://google-search3.p.rapidapi.com';

// Update the request options
const options = {
  method: 'GET',
  url: `${this.baseUrl}/api/v1/search`,
  params: {
    q: keyword,
    num: 10
  },
  headers: {
    'X-RapidAPI-Key': this.apiKey,
    'X-RapidAPI-Host': 'google-search3.p.rapidapi.com'
  }
};
```

## Recommended Setup for Production

For production use, we recommend:

1. **Google Keyword Planner CSV Export** (Primary)
   - Most accurate volume and CPC data
   - Direct from Google Ads
   - No API limits

2. **Google Search Console API** (Secondary)
   - Real organic performance data
   - Free with no limits
   - Requires site ownership

3. **RapidAPI** (Tertiary)
   - For keyword expansion only
   - Use conservatively due to limits
   - Cache aggressively (24h TTL)

---

Last Updated: 2025-09-03  
Version: 1.0.0