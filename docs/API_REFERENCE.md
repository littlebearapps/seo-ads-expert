# API Reference

## Command Line Interface

### `plan` - Generate Marketing Plan

Generate a complete SEO and Google Ads plan for a product.

```bash
npx tsx src/cli.ts plan --product <name> [options]
```

**Arguments:**
- `--product <name>` - Product name (required)
  - Valid values: `convertmyfile`, `palettekit`, `notebridge`

**Options:**
- `--markets <markets>` - Target markets (comma-separated, default: `AU,US,GB`)
- `--max-keywords <number>` - Maximum keywords to analyze (default: `200`)
- `--max-serp-calls <number>` - Maximum SERP API calls (default: `30`)

**Examples:**
```bash
# Basic plan generation
npx tsx src/cli.ts plan --product convertmyfile

# Specific markets and limits
npx tsx src/cli.ts plan --product palettekit --markets US,GB --max-keywords 150

# Conservative SERP usage
npx tsx src/cli.ts plan --product notebridge --max-serp-calls 20
```

**Output:**
- Generates complete plan in `plans/[product]/[date]/`
- Displays summary with file locations
- Reports SERP calls used and cache hit rate

### `list` - List Previous Plans

Show all previously generated plans for a product.

```bash
npx tsx src/cli.ts list --product <name>
```

**Arguments:**
- `--product <name>` - Product name (required)

**Example:**
```bash
npx tsx src/cli.ts list --product convertmyfile
```

**Output:**
```
Plans for convertmyfile:

📊 2025-09-03 - AU, US, GB (187 keywords)
📊 2025-09-02 - US, GB (134 keywords)
📊 2025-09-01 - AU (98 keywords)
```

### `show` - Show Plan Details

Display detailed information about a specific plan.

```bash
npx tsx src/cli.ts show --product <name> --date <date>
```

**Arguments:**
- `--product <name>` - Product name (required)
- `--date <date>` - Plan date in YYYY-MM-DD format (required)

**Example:**
```bash
npx tsx src/cli.ts show --product palettekit --date 2025-09-03
```

**Output:**
```
📊 palettekit - 2025-09-03

Markets: US, GB
Keywords: 156
Ad Groups: 12
SERP Calls: 23
Cache Hit Rate: 76%

Files generated:
- plans/palettekit/2025-09-03/keywords.csv
- plans/palettekit/2025-09-03/ads.json
- plans/palettekit/2025-09-03/seo_pages.md
- plans/palettekit/2025-09-03/competitors.md
- plans/palettekit/2025-09-03/negatives.txt
- plans/palettekit/2025-09-03/summary.json
```

### `cache` - Cache Management

Manage the API response cache.

```bash
npx tsx src/cli.ts cache [options]
```

**Options:**
- `--stats` - Show cache statistics
- `--clear` - Clear all cached data

**Examples:**
```bash
# View cache statistics
npx tsx src/cli.ts cache --stats

# Clear all cached data
npx tsx src/cli.ts cache --clear
```

**Stats Output:**
```
📊 Cache Performance Report
==========================
Entries: 1,247
Size: 23.4 MB
Hit Rate: 82.3% (3,891 hits)
Miss Rate: 17.7% (835 misses)
Expired: 89 entries cleaned up

🎯 Quota Status
===============
SERP Calls: 18/30 (12 remaining)
Keyword Calls: 156
Reset Date: 2025-09-03
```

### `test` - Test API Connections

Test connectivity to all configured APIs.

```bash
npx tsx src/cli.ts test
```

**Output:**
```
🧪 Testing API connections...

🔍 RapidAPI SERP: ✅ Connected
🔤 RapidAPI Keywords: ✅ Connected  
📊 Google Search Console: ✅ Connected

🎉 Connection test completed!
```

### `validate` - Validate Product Configurations

Validate product configuration files.

```bash
npx tsx src/cli.ts validate [options]
```

**Options:**
- `--product <name>` - Validate specific product (optional)

**Examples:**
```bash
# Validate all products
npx tsx src/cli.ts validate

# Validate specific product
npx tsx src/cli.ts validate --product convertmyfile
```

**Output:**
```
🔍 Validating all product configurations...

✅ convertmyfile: Valid
✅ palettekit: Valid
✅ notebridge: Valid
```

## Data Sources & APIs

### Google Keyword Planner CSV

**Highest Priority Data Source**

The tool accepts manual CSV exports from Google Keyword Planner as the most authoritative source.

**Setup:**
1. Export keyword data from Google Keyword Planner
2. Save CSV files to `inputs/kwp_csv/[product]/`
3. Tool automatically detects and processes CSV data

**Expected CSV Format:**
```csv
Keyword,Avg. monthly searches,Competition,Top of page bid (low range),Top of page bid (high range)
webp to png converter,1000-10K,Low,0.50,1.20
convert webp to png,100-1K,Medium,0.80,2.10
```

### Google Search Console API

**Second Priority Data Source**

Provides organic performance data as a proxy for keyword value.

**Setup:**
1. Enable Search Console API in Google Cloud Console
2. Create service account with Viewer permissions
3. Add service account to Search Console property
4. Export credentials as JSON file
5. Set `GOOGLE_CLOUD_PROJECT_ID` in environment

**Data Retrieved:**
- Query terms from organic search
- Click and impression data
- Average position
- CTR (click-through rate)

### RapidAPI Integrations

**Third Priority Data Source**

Provides keyword expansion and SERP intelligence.

**Required Subscriptions:**
- **Real-Time Web Search** - SERP analysis and competitor intelligence
- **Keyword Insight** - Keyword expansion and volume estimates

**Setup:**
1. Subscribe to free tiers on RapidAPI
2. Copy API key to `RAPID_API_KEY` environment variable
3. Tool automatically manages quotas and caching

## Output File Formats

### keywords.csv

Enhanced keyword dataset with all analysis metrics.

```csv
keyword,volume,cpc,competition,final_score,data_source,markets,serp_features,use_case,cluster_name,landing_page,intent_score,source_penalty
webp to png converter,5400,1.25,0.3,8.7,kwp,"US,AU,GB","organic,images",conversion,WebP Conversion,/webp-to-png,9.2,0.0
color picker chrome,3600,0.85,0.4,7.9,gsc,"US,GB","organic,featured_snippet",selection,Color Tools,/color-picker,7.8,0.05
```

**Column Descriptions:**
- `keyword` - The keyword phrase
- `volume` - Average monthly search volume
- `cpc` - Cost per click estimate
- `competition` - Competition level (0.0-1.0)
- `final_score` - Composite scoring algorithm result
- `data_source` - Source of data (kwp/gsc/estimated)
- `markets` - Geographic markets (comma-separated)
- `serp_features` - SERP features present (comma-separated)
- `use_case` - Detected user intent/use case
- `cluster_name` - Keyword cluster assignment
- `landing_page` - Mapped landing page URL
- `intent_score` - Chrome extension intent score
- `source_penalty` - Data source quality penalty

### ads.json

Complete Google Ads campaign structure.

```json
{
  "metadata": {
    "product": "convertmyfile",
    "generated_date": "2025-09-03T10:30:00Z",
    "markets": ["AU", "US", "GB"],
    "total_keywords": 187,
    "ad_groups": 12
  },
  "campaigns": [
    {
      "name": "ConvertMyFile - Chrome Extension",
      "budget": 50.00,
      "target_markets": ["AU", "US", "GB"],
      "ad_groups": [
        {
          "name": "WebP Conversion Tools",
          "landing_page": "/webp-to-png",
          "keywords": [
            {
              "text": "webp to png converter",
              "match_type": "exact",
              "bid": 1.25
            }
          ],
          "ads": [
            {
              "headlines": [
                "Chrome Extension - WebP to PNG Converter",
                "Convert WebP Files Instantly",
                "Free Browser Tool"
              ],
              "descriptions": [
                "Convert WebP images to PNG format directly in your browser. No upload required - works offline!",
                "Fast, secure, and privacy-focused. Convert unlimited files with our Chrome extension."
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### seo_pages.md

SEO optimization recommendations for landing pages.

```markdown
# SEO Page Optimization - ConvertMyFile

Generated: 2025-09-03

## Target Pages Analysis

### /webp-to-png (WebP Conversion)
**Target Keywords:** webp to png converter, convert webp to png, webp converter chrome
**Search Volume:** 8,400/month combined
**Competition Level:** Medium

**Content Recommendations:**
- Add H2 section: "How to Convert WebP to PNG in Chrome"
- Include step-by-step conversion guide
- Add FAQ section addressing format differences
- Optimize meta title: "WebP to PNG Converter - Free Chrome Extension"

**Technical SEO:**
- Current page speed: Good (needs verification)
- Mobile optimization: Required
- Schema markup: Product/SoftwareApplication recommended

### /color-picker (Color Tools)
**Target Keywords:** color picker chrome, eyedropper tool, hex color picker
**Search Volume:** 6,200/month combined  
**Competition Level:** High

**Content Gap Analysis:**
- Missing: Color palette generation features
- Opportunity: Accessibility color contrast checker
- Competitor advantage: Adobe has comprehensive color tools

**Priority Actions:**
1. Expand color picker functionality
2. Add color accessibility features  
3. Create comparison chart vs competitors
```

### competitors.md

Competitive intelligence and positioning analysis.

```markdown
# Competitor Analysis - ConvertMyFile

Generated: 2025-09-03

## SERP Competitors

### WebP Conversion Market
1. **Online-Convert.com**
   - Position: #1 for "webp to png converter"
   - Advantage: Comprehensive format support
   - Weakness: Requires file upload (privacy concern)

2. **CloudConvert**
   - Position: #2 for "convert webp to png"  
   - Advantage: API integration options
   - Weakness: Usage limits on free tier

3. **Adobe Express**
   - Position: #3 for "webp converter"
   - Advantage: Brand recognition
   - Weakness: Requires account signup

## Competitive Advantages
- ✅ **Privacy-First**: No file uploads required
- ✅ **Offline Functionality**: Works without internet
- ✅ **Chrome Integration**: Native browser experience
- ✅ **Free Unlimited**: No conversion limits

## Positioning Strategy
Focus on privacy and convenience benefits:
- "Convert files privately in your browser"
- "No uploads, no accounts, no limits"
- "Instant conversion with Chrome extension"
```

### negatives.txt

Negative keywords to prevent irrelevant traffic.

```text
# Negative Keywords - ConvertMyFile
# Generated: 2025-09-03

# Pre-seeded negatives (product-specific)
free
download
crack
torrent
software

# Format-specific negatives  
pdf
doc
video
mp4
audio
mp3

# Competitor terms
photoshop
illustrator
canva
figma

# Commercial intent excludes
jobs
salary
course
tutorial
learning

# Platform excludes
android
ios
mobile
app store
```

### summary.json

Performance metrics and generation summary.

```json
{
  "metadata": {
    "product": "convertmyfile", 
    "generated_date": "2025-09-03T10:30:00Z",
    "processing_time_ms": 24567,
    "version": "1.0.0"
  },
  "metrics": {
    "keywords": {
      "total_collected": 234,
      "total_processed": 187,
      "filtered_out": 47
    },
    "data_sources": {
      "kwp_csv": 89,
      "search_console": 45, 
      "rapid_api": 53
    },
    "api_usage": {
      "serp_calls_made": 23,
      "serp_calls_limit": 30,
      "serp_calls_remaining": 7,
      "cache_hit_rate": 0.76
    },
    "clustering": {
      "total_clusters": 12,
      "mapped_to_existing_pages": 8,
      "content_gaps_identified": 4
    }
  },
  "quality_scores": {
    "data_completeness": 0.89,
    "landing_page_coverage": 0.92,
    "brand_compliance": 1.0
  }
}
```

## Error Codes

### CLI Error Codes

- **Exit Code 0** - Success
- **Exit Code 1** - General error (API failure, validation error)

### Common Error Messages

**Environment Issues:**
```
❌ Environment validation failed: Missing RAPID_API_KEY
```
Fix: Add required environment variables to `.env`

**Product Issues:** 
```
❌ Product validation failed: convertmyfile.yaml not found
```
Fix: Ensure product configuration exists in `products/` directory

**API Issues:**
```
❌ RapidAPI connection failed: Invalid API key
```
Fix: Verify RapidAPI subscription and key

**Quota Issues:**
```
🚫 SERP call quota exceeded: 30/30
```
Fix: Wait for daily reset or clear cache to reduce API calls

## Configuration Reference

### Environment Variables

**Required:**
- `RAPID_API_KEY` - RapidAPI subscription key

**Optional:**
- `GOOGLE_CLOUD_PROJECT_ID` - Google Cloud project for Search Console
- `CACHE_TTL_HOURS` - Cache expiration (default: 24)
- `MAX_SERP_CALLS_PER_RUN` - SERP API call limit (default: 30)
- `LOG_LEVEL` - Logging level (default: info)

### Product Configuration Schema

```yaml
# products/[product].yaml
name: string
description: string
markets: [string]  # Market codes (AU, US, GB, etc)
seed_queries: [string]  # Base keywords for expansion
target_pages:
  - path: string  # URL path
    title: string  # Page title
    primary_kw: string  # Primary target keyword
value_propositions: [string]  # Key benefits
unique_selling_points: [string]  # Differentiators  
pre_seeded_negatives: [string]  # Product-specific negative keywords
```

---

**Last Updated**: 2025-09-03  
**Version**: 1.0.0