# SEO & Google Ads Expert Tool - Implementation Plan

## Overview

A Claude Code-integrated tool for automated SEO/SEM planning that reads product configurations, uses **Keyword Planner CSV exports + RapidAPI** for immediate functionality, scores keywords with data precedence, and generates complete marketing plans with landing page briefs and ad group recommendations.

**Phase 1 Approach**: Simple CLI tool using CSV exports + RapidAPI (ships immediately)  
**Phase 2 Upgrade**: Add official Google Ads API when approved + Convert to MCP server

**Key Innovation**: Data precedence system (KWP CSV > GSC proxy > RapidAPI estimated) ensures reliability while maintaining speed to market.

## Project Structure

```
/Users/nathanschram/Library/Mobile Documents/com~apple~CloudDocs/claude-code-tools/lba/infrastructure/tools/seo-ads-expert/
├── package.json
├── tsconfig.json
├── .env.example
├── .env                    # Your API credentials
├── docs/
│   └── seo-ads-expert-implementation-plan.md  # This document
├── src/
│   ├── cli.ts             # Main entry point
│   ├── orchestrator.ts    # Core planning logic with data precedence
│   ├── connectors/
│   │   ├── kwp-csv.ts     # Keyword Planner CSV ingestion (V1)
│   │   ├── rapid-keywords.ts # RapidAPI keyword expansion
│   │   ├── rapid-serp.ts  # RapidAPI Real-Time Web Search
│   │   ├── search-console.ts # Google Search Console API
│   │   ├── google-ads.ts  # Google Ads API (V2 upgrade)
│   │   └── types.ts       # API response types
│   ├── scoring.ts         # Enhanced scoring with source penalties
│   ├── writers.ts         # Output generators with negatives pre-seeding
│   └── utils/
│       ├── cache.ts       # 24h TTL caching with quota limits
│       ├── logger.ts      # Structured logging
│       ├── validation.ts  # Input validation + CSV freshness checks
│       └── precedence.ts  # Data source precedence logic
├── products/              # Product configuration files
│   ├── convertmyfile.yaml
│   ├── palettekit.yaml
│   └── notebridge.yaml
├── inputs/                # Manual data inputs
│   └── kwp_csv/           # Keyword Planner CSV exports
│       ├── convertmyfile/
│       ├── palettekit/
│       └── notebridge/
├── cache/                 # API response cache (24h TTL, ≤30 SERP calls)
└── plans/                 # Generated marketing plans
    └── [product]/
        └── [YYYY-MM-DD]/
            ├── keywords.csv
            ├── ads.json
            ├── seo_pages.md
            ├── competitors.md
            ├── negatives.txt
            └── summary.json
```

## Phase 1: CLI Tool (Week 1-2)

### Task 1: Project Setup & Dependencies
**Time**: 2 hours

- [ ] Create `/Users/nathanschram/Library/Mobile Documents/com~apple~CloudDocs/claude-code-tools/lba/infrastructure/tools/seo-ads-expert/` directory
- [ ] Initialize Node.js project with TypeScript
- [ ] Install dependencies (GPT-5 optimized):
  ```bash
  npm init -y
  npm install --save axios zod commander pino csv-parse csv-stringify date-fns googleapis
  npm install --save-dev typescript tsx @types/node vitest
  ```
- [ ] Set up TypeScript configuration
- [ ] Create basic CLI structure with Commander.js

**Deliverable**: Working TypeScript project with CLI skeleton

---

### Task 2: V1 Data Sources & Authentication  
**Time**: 2 hours (reduced from 3 - no Google Ads API setup needed)

- [ ] **Google Ads Account Setup** (Manual):
  - [ ] Create Google Ads account in Expert Mode (no campaigns)
  - [ ] Set up Keyword Planner access
  - [ ] Link Search Console ↔ Ads for future Paid/Organic view
  - [ ] Export sample CSV for ConvertMyFile (AU/US/GB markets)

- [ ] **Search Console API Setup**:
  - [ ] Create Google Cloud service account  
  - [ ] Download service account JSON key
  - [ ] Add service account to Search Console property
  - [ ] Test searchanalytics.query access

- [ ] **RapidAPI Setup** (V1 SERP + Keywords):
  - [ ] Sign up for RapidAPI account
  - [ ] Subscribe to "Real-Time Web Search" API
  - [ ] Subscribe to "Google Keyword Insight" or "Smart Keyword Research" 
  - [ ] Test basic SERP + keyword expansion queries

- [ ] **Environment Configuration**:
  - [ ] Create `.env.example` for GSC + RapidAPI credentials
  - [ ] Set up `.env` with actual credentials
  - [ ] Add validation for required environment variables

**Deliverable**: CSV import working + GSC + RapidAPI connections tested

---

### Task 3: Product Configuration Schema
**Time**: 2 hours

- [ ] Design and implement product YAML schema using Zod
- [ ] Create `products/convertmyfile.yaml` with:
  ```yaml
  product: ConvertMyFile
  summary: >
    Free, privacy-first Chrome extension to convert files (WebP→PNG, HEIC→JPG, PDF↔JPG)
    locally in the browser. No uploads required.
  value_props:
    - "Private: runs locally"
    - "Fast 1-click converts" 
    - "Free tier, no login"
  seed_queries:
    - "file converter chrome extension"
    - "webp to png chrome"
    - "heic to jpg chrome"
    - "pdf to jpg chrome"
    - "compress pdf chrome extension"
  target_pages:
    - url: "https://littlebearapps.com/extensions/chrome/convertmyfile"
      purpose: "main"
    - url: "https://littlebearapps.com/convertmyfile/webp-to-png"
      purpose: "use-case"
  markets: ["AU", "US", "GB"]
  brand_rules:
    pinned_headline: "Chrome Extension"
    banned_words: ["AI", "cloud-only"]
    claims_validation:
      local_processing: true  # Only claim if no server uploads
      privacy_first: true     # Only if no external tracking
  market_localization:
    AU: {gl: "au", hl: "en-AU"}
    US: {gl: "us", hl: "en"}
    GB: {gl: "gb", hl: "en-GB"}
  pre_seeded_negatives:
    - "android"
    - "iphone" 
    - "ios"
    - "safari"
    - "online"
    - "api"
    - "tutorial"
    - "jobs"
    - "course"
  ```

- [ ] Create enhanced files for PaletteKit and NoteBridge with product-specific negatives
- [ ] Add validation and error handling
- [ ] Implement market localization mapping

**Deliverable**: Complete product configuration system

---

### Task 4: V1 Connectors Implementation (GPT-5 Optimized)
**Time**: 6 hours (reduced from 8)

#### KWP CSV Connector (2 hours)
- [ ] Implement `kwp-csv.ts`:
  - [ ] CSV parser for Keyword Planner exports
  - [ ] Support multiple markets (AU/US/GB files)
  - [ ] Extract volume, CPC, competition data
  - [ ] Add CSV freshness validation (warn if >30 days old)
  - [ ] Handle malformed/missing CSV files gracefully

#### Search Console Connector (2 hours)  
- [ ] Implement `search-console.ts` (unchanged):
  - [ ] Set up Search Console API client with service account
  - [ ] Implement `getSearchAnalytics(site, startDate, endDate, markets)`
  - [ ] Group results by {query, page, device, country}
  - [ ] Extract top-performing queries for each target page

#### RapidAPI Connectors (2 hours)
- [ ] Implement `rapid-keywords.ts`:
  - [ ] RapidAPI "Google Keyword Insight" integration
  - [ ] Seed expansion (mark metrics as "estimated")
  - [ ] Rate limiting and error handling
- [ ] Implement `rapid-serp.ts`:
  - [ ] RapidAPI "Real-Time Web Search" integration  
  - [ ] Market localization (gl/hl parameters)
  - [ ] Extract organic results, PAA, SERP features
  - [ ] Identify AI Overview and SERP blockers
  - [ ] Limit to ≤30 calls per run with aggressive caching

**Deliverable**: CSV ingestion + GSC + RapidAPI connectors working

---

### Task 5: Enhanced Caching System (GPT-5 Optimized)
**Time**: 2 hours

- [ ] Implement `cache.ts` with quota management:
  - [ ] File-based caching with 24-hour TTL
  - [ ] Hash-based cache keys: {query, market, device, timestamp}
  - [ ] SERP call quota enforcement (≤30 calls per run)
  - [ ] Cache hit/miss logging and statistics
  - [ ] Automatic cleanup of expired entries

- [ ] Implement `precedence.ts` for data source logic:
  - [ ] KWP CSV precedence (authoritative)
  - [ ] GSC proxy fallback (real but rough)
  - [ ] RapidAPI estimated fallback (marked as estimated)
  - [ ] Source tracking in all outputs

- [ ] Integrate caching into RapidAPI connectors only
- [ ] Add cache statistics and call counts to summary.json

**Deliverable**: Quota-managed caching + data precedence system

---

### Task 6: Enhanced Keyword Scoring & Clustering (GPT-5 Optimized)
**Time**: 4 hours

- [ ] Implement enhanced `scoring.ts`:
  - [ ] **Updated Scoring Formula**:
    ```typescript
    score = 0.35 * norm(volume) + 0.25 * intent + 0.15 * longtail_bonus 
            - 0.15 * norm(competition) - 0.10 * serp_blockers - 0.10 * source_penalty
    ```
  - [ ] **Enhanced Intent Detection**:
    - 2.3: "chrome extension", "install", "download" (GPT-5 boost)
    - 2.0: "convert", "free chrome", "browser extension"
    - 1.5: "free", "online", "browser"  
    - 1.0: baseline
  - [ ] **Source Penalty**: -0.1 if metrics are RapidAPI estimated, 0 if KWP/GSC
  - [ ] **Long-tail Bonus**: +0.3 for 3+ words, not brand-heavy
  - [ ] **Graduated SERP Blockers**: 
    - 0.6 penalty for single features (PAA only)
    - 1.0 penalty for AI Overview + video/shopping coexistence

- [ ] **Enhanced Clustering Algorithm**:
  - [ ] N-gram similarity clustering with use-case focus
  - [ ] Enforce: Each cluster maps to exactly one landing page
  - [ ] Auto-generate landing page briefs for missing clusters
  - [ ] Identify primary vs secondary keywords per cluster

**Deliverable**: Enhanced scoring with data source tracking + cluster-to-page mapping

---

### Task 7: Output Writers
**Time**: 6 hours

#### Keywords CSV (1 hour)
- [ ] `keywords.csv` with enhanced columns:
  - keyword, cluster, volume, cpc, competition, intent_score, final_score, data_source, recommended_match_type

#### Ads JSON (2 hours) - GPT-5 Enhanced
- [ ] `ads.json` structure with mandatory elements:
  ```json
  {
    "ad_groups": [
      {
        "name": "WebP PNG Conversion",
        "keywords_exact": ["webp to png chrome extension"],
        "keywords_phrase": ["webp png converter", "convert webp files"],
        "headlines": [
          "WebP to PNG Chrome Extension",  // PINNED
          "Convert WebP Files Instantly", 
          "Free WebP Converter - No Upload"
        ],
        "descriptions": [
          "Convert WebP to PNG locally in your browser. Privacy-first, no uploads required.",
          "One-click WebP conversion. Fast, free, and secure Chrome extension."
        ],
        "sitelinks": ["Docs", "Privacy", "Formats", "Changelog"],
        "landing_page": "/convertmyfile/webp-to-png",
        "negatives": ["firefox", "safari", "mobile", "android", "ios"]
      }
    ]
  }
  ```

#### SEO Pages Markdown (2 hours) - Enhanced Briefs
- [ ] `seo_pages.md` with comprehensive structure:
  - Current page keyword mapping with data sources
  - Auto-generated landing page briefs for unmapped clusters
  - Each brief: Title, H1, meta description, content outline, PAA-derived FAQs, internal links

#### Pre-seeded Negatives & Competitors (1 hour) 
- [ ] `negatives.txt`: Pre-filled product-specific negatives (per GPT-5 suggestions)
- [ ] `competitors.md`: Top SERP domains per cluster with content angles

**Deliverable**: Complete output generation system

---

### Task 8: CLI Interface & Orchestration  
**Time**: 3 hours

- [ ] Implement `cli.ts` with commands:
  ```bash
  # Generate new plan
  npm run plan -- --product convertmyfile --markets AU,US,GB
  
  # List previous plans  
  npm run plans -- --product convertmyfile
  
  # Show plan summary
  npm run show -- --product convertmyfile --date 2025-09-03
  ```

- [ ] Implement `orchestrator.ts` with GPT-5 flow:
  ```typescript
  // V1 Orchestrator Flow (pseudo-code)
  load product.yaml
  kwp = readAllCSV('/inputs/kwp_csv/<product>/*')   // by market
  gsc = getSearchAnalytics(site, last_90d, by=[query,page,device,country])
  ideas = rapid_keywords.expand(seed_queries)       // ideas only (estimated)
  serp = sample_serps(top_clusters, markets, limit=30) // quota-limited, cached
  
  keywords = merge_dedupe(seed + ideas + gsc.queries + kwp.terms)
  metrics = attach_metrics(keywords, kwp>gsc>rapid) // data precedence
  flags = attach_serp_features(keywords, serp)
  score = compute_score(metrics, intent, longtail, blockers, source_penalty)
  clusters = cluster_by_use_case(keywords)
  
  // Generate outputs with GPT-5 enhancements
  ads.json = groups from clusters + pinned headlines + sitelinks
  seo_pages.md = map existing + auto-generate briefs for unmapped clusters  
  competitors.md = top domains per cluster from SERP samples
  negatives.txt = pre-seeded + SERP-derived terms
  keywords.csv = export with data sources
  summary.json = markets, counts, cache stats, call quotas, top opportunities
  ```
  - [ ] Handle errors gracefully (partial plans on connector failures)
  - [ ] Progress indicators and timing logs
  - [ ] Enforce ≤30 SERP calls per run

- [ ] Add console output with pino logging (GPT-5 suggested)
- [ ] Comprehensive error handling and validation

**Deliverable**: Working CLI tool ready for Claude Code integration

---

### Task 9: Testing & Documentation
**Time**: 2 hours

- [ ] Create comprehensive `README.md` with:
  - [ ] Setup instructions
  - [ ] API credential configuration
  - [ ] Usage examples
  - [ ] Troubleshooting guide

- [ ] Test with all three products
- [ ] Validate output quality against manual research
- [ ] Performance optimization (target <30 seconds per plan)

**Deliverable**: Production-ready tool with documentation

---

## Phase 2: MCP Server Conversion (Week 3)

### Task 10: MCP Server Architecture
**Time**: 4 hours

- [ ] Create new `seo-ads-expert-mcp/` directory
- [ ] Extract core logic into reusable modules
- [ ] Implement MCP server with 3 tools:
  - `plan_extension(product, markets, options)`
  - `list_plans(product)` 
  - `open_plan(product, date)`

### Task 11: MCP Integration
**Time**: 2 hours

- [ ] Add to existing Zen MCP configuration
- [ ] Test integration with Claude Code
- [ ] Update documentation for MCP usage

**Deliverable**: Seamless chat-based SEO planning

---

## Usage Examples

### Phase 1 (CLI)
```bash
cd "/Users/nathanschram/Library/Mobile Documents/com~apple~CloudDocs/claude-code-tools/lba/infrastructure/tools/seo-ads-expert"
npm run plan -- --product convertmyfile --markets AU,US,GB --max-keywords 150
```

### Phase 2 (MCP)  
```
Claude, run SEO & Ads Expert for ConvertMyFile in AU, US, GB markets. 
Then draft 3 RSA ad variations and 4 landing page briefs based on the results.
```

---

## Success Metrics

- [ ] **Performance**: Plans generated in <30 seconds
- [ ] **Coverage**: 150-200 relevant keywords per product
- [ ] **Quality**: 80%+ of recommended keywords validate against manual research
- [ ] **Actionability**: Generated ad groups ready for Google Ads import
- [ ] **SEO Value**: Landing page briefs drive 20%+ increase in organic traffic

---

## Risk Mitigation

- [ ] **API Quotas**: Implement conservative rate limits + caching
- [ ] **Cost Control**: Monitor API usage, set monthly budget alerts  
- [ ] **Data Quality**: Validate outputs against known competitors
- [ ] **Reliability**: Graceful degradation if APIs fail
- [ ] **Security**: Secure credential storage, no API keys in code

---

## Future Enhancements (v2+)

- [ ] **Google Ads Script Export**: Generate importable campaign scripts
- [ ] **Landing Page Generator**: Auto-create Astro pages from briefs  
- [ ] **Performance Tracking**: Connect Google Analytics for ROI measurement
- [ ] **Competitor Monitoring**: Weekly SERP position tracking
- [ ] **Seasonal Analysis**: Google Trends integration for timing
- [ ] **Multi-Language Support**: International market expansion

---

## Total Estimated Time: 26 hours (1.5-2 weeks) - GPT-5 Optimized

**Week 1**: Tasks 1-5 (Setup, CSV/RapidAPI, caching) - 13 hours  
**Week 2**: Tasks 6-9 (Enhanced scoring, output, CLI, testing) - 13 hours  
**Week 3**: Tasks 10-11 (Optional MCP conversion) - 6 hours

## GPT-5 Immediate Action Items (Start Today)

1. **Create Google Ads Account** (Expert Mode, no campaigns) 
2. **Export Keyword Planner CSVs** for ConvertMyFile (AU/US/GB markets)
3. **Set up RapidAPI subscriptions** (Real-Time Web Search + Keyword Insight)
4. **Link Search Console ↔ Ads** for future Paid/Organic integration
5. **Create `/inputs/kwp_csv/convertmyfile/` directory structure**

## V1 Acceptance Criteria (GPT-5 Quality Gates)

✅ **Data Quality**: Every ad group maps to a landing page (existing or briefed)  
✅ **Brand Compliance**: Headlines contain one pinned "Chrome Extension" + benefit  
✅ **Data Transparency**: Keywords.csv shows source per metric (kwp|gsc|estimated)  
✅ **SERP Intelligence**: Blockers populated for sampled terms, competitors listed  
✅ **Quota Management**: summary.json reports ≤30 SERP calls and cache hit ratio  
✅ **Claims Validation**: Only claim "local/no uploads" if technically accurate per format

This tool will transform your marketing workflow from manual keyword research to data-driven, repeatable SEO/SEM planning integrated directly into your development process.