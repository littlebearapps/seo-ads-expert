# User Guide

## Getting Started

### Prerequisites

1. **Node.js 18+** - Required for TypeScript execution
2. **RapidAPI Account** - Free tier sufficient for V1
3. **Google Cloud Account** - Optional but recommended for Search Console data

### Installation

```bash
# Clone the repository
git clone https://github.com/littlebearapps/seo-ads-expert.git
cd seo-ads-expert

# Install dependencies  
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API credentials
```

### Initial Configuration

#### 1. Environment Setup (.env)

```bash
# Required for keyword expansion and SERP analysis
RAPID_API_KEY=your_rapidapi_key_here

# Optional - enables Search Console data
GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project

# Optional - customize behavior
CACHE_TTL_HOURS=24
MAX_SERP_CALLS_PER_RUN=30
LOG_LEVEL=info
```

#### 2. API Setup

**RapidAPI (Required)**:
1. Sign up at [rapidapi.com](https://rapidapi.com)
2. Subscribe to free tiers of:
   - Real-Time Web Search
   - Keyword Insight
3. Copy your API key to `.env`

**Google Search Console (Optional)**:
1. Create Google Cloud project
2. Enable Search Console API
3. Create service account with Viewer permissions
4. Add service account to Search Console properties
5. Add project ID to `.env`

### Basic Usage

#### Generate Your First Plan

```bash
# Generate plan for ConvertMyFile extension
npm run plan -- --product convertmyfile

# Or use the direct command
npx tsx src/cli.ts plan --product convertmyfile
```

**Expected Output**:
```
🚀 SEO & Ads Expert - Plan Generation

📋 Product: convertmyfile
🌍 Markets: AU,US,GB  
🎯 Max Keywords: 200
📞 Max SERP Calls: 30

🔄 Starting keyword collection...
✅ Collected 187 keywords from 3 sources
🧠 Applied data precedence merging...
📊 Enhanced scoring completed  
🎯 Clustered into 12 ad groups
📝 Generated all output files

🎉 Plan generation completed successfully!
📊 View results: npx tsx src/cli.ts show --product convertmyfile --date 2025-09-03
```

#### View Generated Plans

```bash
# List all plans for a product
npm run list -- --product convertmyfile

# Show specific plan details
npm run show -- --product convertmyfile --date 2025-09-03
```

## Advanced Usage

### Product Configuration

Each Chrome extension is configured via YAML files in the `products/` directory.

#### Adding a New Product

1. Create `products/newproduct.yaml`:

```yaml
name: "New Chrome Extension"
description: "Brief description of the extension"

# Target markets (use standard country codes)
markets: ["AU", "US", "GB", "CA"]

# Seed keywords for expansion
seed_queries:
  - "chrome extension"
  - "browser tool"
  - "main functionality keyword"

# Landing pages for ad group mapping
target_pages:
  - path: "/main-feature"
    title: "Main Feature Page"
    primary_kw: "main feature keyword"
  - path: "/secondary-feature"  
    title: "Secondary Feature Page"
    primary_kw: "secondary feature keyword"

# Marketing messaging
value_propositions:
  - "Free and unlimited usage"
  - "Privacy-focused design"
  - "Instant results"

unique_selling_points:
  - "No file uploads required"
  - "Works completely offline" 
  - "Chrome Web Store's #1 rated tool"

# Prevent irrelevant traffic
pre_seeded_negatives:
  - "free"
  - "download"
  - "crack"
  - "tutorial"
```

2. Test the configuration:
```bash
npm run validate -- --product newproduct
```

3. Generate your first plan:
```bash
npm run plan -- --product newproduct
```

### Custom Market Targeting

Target specific geographical markets:

```bash
# US and UK only
npm run plan -- --product palettekit --markets US,GB

# Single market (Australia)
npm run plan -- --product notebridge --markets AU

# European markets
npm run plan -- --product convertmyfile --markets GB,DE,FR,ES
```

### Quota Management

The tool automatically manages API quotas to stay within free tier limits:

```bash
# Check current quota usage
npm run cache -- --stats

# Conservative usage (20 SERP calls instead of 30)
npm run plan -- --product palettekit --max-serp-calls 20

# Clear cache to reset counters (if needed)
npm run cache -- --clear
```

### Google Keyword Planner Integration

For the most authoritative keyword data, export CSV files from Google Keyword Planner:

#### 1. Export Keywords from GKP

1. Log into Google Ads
2. Navigate to Tools → Keyword Planner
3. Start with "Discover new keywords" or "Get search volume and forecasts"
4. Enter your seed keywords
5. Export results as CSV

#### 2. Import CSV Files

1. Create directory structure:
```bash
mkdir -p inputs/kwp_csv/convertmyfile/
mkdir -p inputs/kwp_csv/palettekit/
mkdir -p inputs/kwp_csv/notebridge/
```

2. Place exported CSV files:
```
inputs/kwp_csv/convertmyfile/
├── webp_keywords_2025-09-03.csv
├── pdf_keywords_2025-09-03.csv
└── compression_keywords_2025-09-03.csv
```

3. Run plan generation - CSV data will automatically be prioritized:
```bash
npm run plan -- --product convertmyfile
```

## Understanding Output Files

Each plan generation creates 6 output files in `plans/[product]/[date]/`:

### 1. keywords.csv
**Purpose**: Complete keyword dataset with analysis metrics

**Key Columns**:
- `final_score` - Composite scoring (0-10 scale)
- `data_source` - Source of data (kwp/gsc/estimated) 
- `cluster_name` - Ad group assignment
- `landing_page` - Target page for this keyword
- `intent_score` - Chrome extension relevance score

**Usage**: Import into Google Ads Keyword Planner for bid estimates, or use for content planning.

### 2. ads.json
**Purpose**: Complete Google Ads campaign structure

**Key Features**:
- Ad groups mapped to landing pages
- Headlines with pinned "Chrome Extension" + benefits
- Descriptions highlighting unique value props
- Keyword match types and bid suggestions

**Usage**: Copy ad copy directly into Google Ads interface, use as campaign structure template.

### 3. seo_pages.md  
**Purpose**: Landing page optimization recommendations

**Key Features**:
- Target keywords per page
- Content gap analysis  
- SEO optimization priorities
- Technical recommendations

**Usage**: Development team uses for page optimization, content team for editorial calendar.

### 4. competitors.md
**Purpose**: Competitive intelligence and positioning

**Key Features**:
- Top SERP competitors by keyword
- Competitive advantages analysis
- Positioning recommendations
- Market opportunity gaps

**Usage**: Marketing team uses for competitive strategy, sales team for objection handling.

### 5. negatives.txt
**Purpose**: Negative keywords to prevent irrelevant clicks

**Key Features**:
- Pre-seeded product negatives
- Format-specific excludes
- Competitor brand terms
- Commercial intent filters

**Usage**: Import directly into Google Ads campaigns to improve targeting.

### 6. summary.json
**Purpose**: Performance metrics and generation report

**Key Features**:
- API usage statistics
- Data source breakdown
- Cache performance
- Quality scores

**Usage**: Monitor tool performance, optimize for quota management.

## Troubleshooting Guide

### Common Issues

#### "Environment validation failed"

**Cause**: Missing or invalid environment variables.

**Solution**:
```bash
# Check your .env file
cat .env

# Verify required variables are set
echo $RAPID_API_KEY

# Test API connections
npm run test
```

#### "SERP call quota exceeded"

**Cause**: Used all 30 SERP calls for the day.

**Solutions**:
```bash
# Check quota status
npm run cache -- --stats

# Wait for daily reset (shows in stats)
# OR clear cache to reduce future API needs
npm run cache -- --clear

# OR reduce SERP calls for next run
npm run plan -- --product palettekit --max-serp-calls 15
```

#### "Product validation failed"

**Cause**: Invalid or missing product configuration file.

**Solution**:
```bash
# Check if product exists
ls products/convertmyfile.yaml

# Validate configuration
npm run validate -- --product convertmyfile

# Check for YAML syntax errors
npx tsx src/cli.ts validate
```

#### "No keywords collected"

**Possible Causes & Solutions**:

1. **All APIs failing**:
```bash
npm run test  # Check API connectivity
```

2. **No seed queries in product config**:
```yaml
# Add to products/[product].yaml
seed_queries:
  - "chrome extension"
  - "your main feature"
```

3. **All keywords filtered out**:
```bash
# Reduce filtering in next version or check logs for filter reasons
tail -f logs/app.log
```

#### "Google Search Console permission denied"

**Cause**: Service account lacks access to Search Console property.

**Solution**:
1. Add service account email to Search Console
2. Grant "Owner" or "Full User" permissions
3. Wait 10-15 minutes for propagation

### Performance Issues

#### "Plan generation takes >60 seconds"

**Causes & Solutions**:

1. **Poor cache performance**:
```bash
# Check cache hit rate
npm run cache -- --stats
# Should be >70% after first run
```

2. **Too many keywords**:
```bash
# Reduce keyword limit
npm run plan -- --product palettekit --max-keywords 100
```

3. **Slow API responses**:
```bash
# Reduce SERP calls
npm run plan -- --product notebridge --max-serp-calls 15
```

#### "High memory usage"

**Solutions**:
```bash
# Process products individually rather than batching
# Monitor with: ps aux | grep node

# Clear cache if it becomes too large
npm run cache -- --stats
npm run cache -- --clear  # If size >100MB
```

### Data Quality Issues

#### "Keywords don't match product"

**Causes**:
1. Generic seed queries
2. Insufficient negative keywords  
3. Wrong market targeting

**Solutions**:
1. **Improve seed queries**:
```yaml
# Instead of generic terms
seed_queries:
  - "chrome extension"  # ❌ Too generic
  
# Use specific functionality
seed_queries:
  - "webp to png converter chrome"  # ✅ Specific
  - "browser image converter"       # ✅ Targeted
```

2. **Add negatives**:
```yaml
pre_seeded_negatives:
  - "photoshop"     # Exclude competitor tools
  - "mobile"        # Exclude non-Chrome platforms
  - "tutorial"      # Exclude educational intent
```

#### "Ad groups don't align with landing pages"

**Cause**: Landing page configuration doesn't match actual site structure.

**Solution**:
```yaml
# Update target_pages to match your actual URLs
target_pages:
  - path: "/webp-to-png"           # ✅ Actual page
    title: "WebP to PNG Converter"
    primary_kw: "webp to png converter"
    
  - path: "/features"              # ❌ Too generic  
    title: "Features"              # ❌ Update this
```

#### "Headlines too generic"

The tool automatically generates headlines, but you can influence them via configuration:

```yaml
# More specific value propositions generate better headlines
value_propositions:
  - "Convert 50+ file formats instantly"     # ✅ Specific
  - "Works offline - no uploads required"    # ✅ Specific benefit
  - "Best tool ever"                         # ❌ Too generic
```

## Best Practices

### 1. Planning Workflow

**Weekly Schedule**:
- Monday: Generate fresh plans for all products
- Wednesday: Review performance of current campaigns  
- Friday: Update product configurations based on learnings

**Product Launch Process**:
1. Create product configuration
2. Export Google Keyword Planner data (if available)
3. Generate initial plan with conservative settings
4. Review outputs manually
5. Launch campaigns with 20% of recommended keywords
6. Scale based on performance

### 2. Data Source Strategy

**Optimal Data Mix**:
- **KWP CSV**: Use for high-volume core terms
- **Search Console**: Use for long-tail discovery  
- **RapidAPI**: Use for competitive intelligence

**Quality Validation**:
```bash
# Check data source distribution in summary.json
# Aim for: KWP 40%+, GSC 30%+, RapidAPI 30%-
```

### 3. Budget Management

**Free Tier Limits**:
- RapidAPI: 500-1000 calls/month per endpoint
- Google Search Console: 200 requests/day
- Tool quota: 30 SERP calls/day

**Cost Optimization**:
```bash
# Generate plans for multiple products on same day to share cache
npm run plan -- --product convertmyfile
npm run plan -- --product palettekit     # Benefits from shared cache
npm run plan -- --product notebridge     # Benefits from shared cache
```

### 4. Campaign Optimization

**Ad Group Structure**:
- Map each cluster to exactly one landing page
- Use theme-based ad groups (convert, organize, create, etc.)
- Start with exact match keywords, expand to phrase match

**Negative Keywords**:
- Apply product-level negatives from negatives.txt
- Monitor search terms weekly and add new negatives
- Use competitor brand terms as negatives

**Landing Page Alignment**:
- Every keyword cluster should map to existing page
- Create new pages for high-value gaps identified in seo_pages.md
- A/B test landing pages using cluster-specific copy

## Integration Guide

### Google Ads Integration

1. **Import Campaign Structure**:
   - Use ads.json as template for campaign creation
   - Copy ad groups structure directly
   - Import keywords with suggested match types

2. **Copy Ad Copy**:
   - Headlines are pre-formatted for Google Ads
   - Descriptions include key value propositions
   - Test multiple ad variations from value_propositions

3. **Apply Negative Keywords**:
   - Import negatives.txt at campaign level
   - Monitor for additional negatives in first week

### SEO Integration

1. **Content Planning**:
   - Use seo_pages.md for editorial calendar
   - Prioritize high-volume, low-competition gaps
   - Create dedicated pages for orphaned clusters

2. **Technical SEO**:
   - Implement schema markup suggested in seo_pages.md
   - Optimize meta titles with primary keywords
   - Add FAQ sections addressing keyword intent

### Analytics Integration

1. **Goal Tracking**:
   - Set up conversion goals for each landing page
   - Track keyword performance using UTM parameters
   - Monitor assisted conversions from organic traffic

2. **Performance Monitoring**:
   - Track summary.json metrics over time
   - Monitor cache hit rates for cost optimization
   - Alert on significant keyword volume changes

---

**Last Updated**: 2025-09-03  
**Version**: 1.0.0  
**Support**: Internal tool documentation