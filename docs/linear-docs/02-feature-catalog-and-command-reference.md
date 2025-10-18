# Feature Catalog & Command Reference

**Purpose**: Complete inventory of SEO Ads Expert features and CLI commands
**Last Updated**: 2025-10-09
**For**: Claude on iOS (Linear MCP access)

---

## 🎯 Command Overview

SEO Ads Expert is accessed via CLI with the following command structure:
```bash
tsx src/cli.ts [command] [product/options] [flags]
```

**Available Commands**:
- `plan` - Generate marketing plan with keyword research
- `analyze` - Analyze campaign performance
- `monitor` - Cross-platform monitoring (Google + Microsoft Ads)
- `apply` - Apply optimizations with safe write operations
- `history` - View command execution history
- `audit` - Review audit logs and compliance reports
- `experiment` - Manage A/B testing experiments
- `crawl` - Technical SEO crawling and sitemap generation

---

## 📋 Command Reference

### 1. `plan` - Marketing Plan Generation ⭐

**Purpose**: Generate comprehensive marketing plan with keyword research, budget recommendations, and campaign structure.

**Usage**:
```bash
tsx src/cli.ts plan <product> [options]
```

**Arguments**:
- `<product>` - Product name (e.g., convertmyfile, palettekit, notebridge)

**Options**:
- `--source` - Data source priority (csv,gsc,rapid | gsc,rapid | rapid)
- `--cache` - Cache strategy (use | skip | refresh)
- `--output` - Output directory (default: plans/[product]/[date]/)

**Examples**:
```bash
# Generate plan with default precedence (CSV > GSC > RapidAPI)
tsx src/cli.ts plan convertmyfile

# Force GSC data only
tsx src/cli.ts plan palettekit --source gsc,rapid

# Skip cache and regenerate fresh
tsx src/cli.ts plan notebridge --cache skip
```

**Output Files (8 per product)**:
1. `keywords.csv` - Keywords with volume, CPC, competition, source tracking
2. `microsoft-ads-bulk.csv` - Microsoft Ads bulk import file
3. `negative-keywords.txt` - Pre-seeded negative keyword list
4. `campaign-structure.json` - Campaign/ad group/keyword hierarchy
5. `budget-recommendations.json` - Thompson Sampling budget allocations
6. `quality-score-report.json` - Scoring analysis and insights
7. `audit-log.json` - All operations with timestamps
8. `plan-summary.md` - Human-readable summary

**Performance**: 11 seconds end-to-end generation

---

### 2. `analyze` - Campaign Performance Analysis

**Purpose**: Analyze Google Ads campaign performance with waste detection, quality scoring, and optimization recommendations.

**Usage**:
```bash
tsx src/cli.ts analyze <campaign-id> [options]
```

**Arguments**:
- `<campaign-id>` - Google Ads campaign ID

**Options**:
- `--date-range` - Analysis period (7d | 14d | 30d | 90d | custom)
- `--metrics` - Metrics to analyze (comma-separated: impressions,clicks,conversions,cost)
- `--alerts` - Enable alert detection (default: true)
- `--format` - Output format (json | csv | markdown)

**Examples**:
```bash
# Analyze last 30 days with all metrics
tsx src/cli.ts analyze 1234567890 --date-range 30d

# Custom date range with specific metrics
tsx src/cli.ts analyze 1234567890 --date-range 2025-09-01:2025-10-01 --metrics clicks,conversions,cost

# Generate markdown report
tsx src/cli.ts analyze 1234567890 --format markdown
```

**Output**:
- Waste detection (low-performing keywords, ad groups)
- Quality score breakdown
- CTR, CVR, CPC trends
- Alert triggers (if any detected)
- Optimization recommendations

---

### 3. `monitor` - Cross-Platform Monitoring

**Purpose**: Monitor performance across Google Ads and Microsoft Ads with comparative analysis.

**Usage**:
```bash
tsx src/cli.ts monitor [options]
```

**Options**:
- `--platform` - Platforms to monitor (google | microsoft | google,microsoft)
- `--interval` - Monitoring interval (hourly | daily | weekly)
- `--alerts` - Alert threshold configuration (json file path)
- `--dashboard` - Launch real-time dashboard (experimental)

**Examples**:
```bash
# Monitor both platforms daily
tsx src/cli.ts monitor --platform google,microsoft --interval daily

# Google Ads only with custom alerts
tsx src/cli.ts monitor --platform google --alerts ./alerts-config.json
```

**Output**:
- Cross-platform performance comparison
- Budget spend analysis
- Alert detection (8 detectors active)
- Remediation playbook recommendations

---

### 4. `apply` - Safe Write Operations

**Purpose**: Apply optimizations to Google Ads account with comprehensive safety guardrails.

**Usage**:
```bash
tsx src/cli.ts apply [options]
```

**Options**:
- `--plan` - Plan file or directory to apply (latest | path/to/plan)
- `--dry-run` - Validate only, no mutations (default: true)
- `--confirm` - Apply mutations (requires explicit flag)
- `--budget-limit` - Override budget limit (per mutation, per day)
- `--validate-only` - Use Google Ads validateOnly mode

**Examples**:
```bash
# Dry-run validation (safe)
tsx src/cli.ts apply --plan latest --dry-run

# Apply with confirmation
tsx src/cli.ts apply --plan latest --confirm

# validateOnly mode (Google Ads API validation)
tsx src/cli.ts apply --plan latest --validate-only
```

**Safety Guardrails**:
- Mutation Guard validation (budget, quality score, health checks)
- Budget Enforcer limits (multi-tenant budgets)
- Rollback capability (audit log retention: 90 days)
- Tamper-evident audit trail
- Circuit breaker protection

---

### 5. `history` - Command Execution History

**Purpose**: View history of plan generation, analysis, and optimization commands.

**Usage**:
```bash
tsx src/cli.ts history [options]
```

**Options**:
- `--limit` - Number of records to show (default: 50)
- `--filter` - Filter by command type (plan | analyze | apply)
- `--product` - Filter by product name
- `--date` - Filter by date range

**Examples**:
```bash
# Show last 20 commands
tsx src/cli.ts history --limit 20

# Show plan commands only for convertmyfile
tsx src/cli.ts history --filter plan --product convertmyfile
```

**Output**:
- Command timestamp
- Command type and arguments
- Execution status (success/failure)
- Output file locations

---

### 6. `audit` - Audit Logs & Compliance

**Purpose**: Review audit logs, compliance reports, and mutation history.

**Usage**:
```bash
tsx src/cli.ts audit [options]
```

**Options**:
- `--date-range` - Audit period (7d | 30d | 90d)
- `--type` - Log type (mutation | alert | experiment)
- `--format` - Output format (json | csv | markdown)
- `--compliance` - Generate GDPR/CCPA compliance report

**Examples**:
```bash
# Review last 30 days of mutations
tsx src/cli.ts audit --date-range 30d --type mutation

# Generate GDPR compliance report
tsx src/cli.ts audit --compliance gdpr --format markdown
```

**Output**:
- Mutation history (before/after values)
- Alert triggers and resolutions
- Experiment launches and results
- Compliance reports

**Retention**: 90-day audit log retention policy

---

### 7. `experiment` - A/B Testing Management

**Purpose**: Create, monitor, and analyze A/B testing experiments.

**Usage**:
```bash
tsx src/cli.ts experiment <action> [options]
```

**Actions**:
- `create` - Create new experiment
- `list` - List active experiments
- `status` - Check experiment status
- `analyze` - Analyze experiment results
- `report` - Generate experiment report

**Examples**:
```bash
# Create new experiment
tsx src/cli.ts experiment create --name "Ad Copy Test A/B" --variants 2 --duration 14d

# Check experiment status
tsx src/cli.ts experiment status EXP-001

# Generate final report
tsx src/cli.ts experiment report EXP-001 --format markdown
```

**Statistical Methods**:
- Sequential testing with early stopping
- Bayesian credible intervals
- Sample size calculations
- Multiple comparison corrections

**Output**:
- Experiment configuration
- Traffic allocation
- Metric tracking
- Statistical significance results
- Winner recommendation

---

### 8. `crawl` - Technical SEO Crawling

**Purpose**: Internal site crawling, XML sitemap generation, and indexation monitoring.

**Usage**:
```bash
tsx src/cli.ts crawl <url> [options]
```

**Arguments**:
- `<url>` - Website URL to crawl

**Options**:
- `--depth` - Crawl depth (1-5, default: 3)
- `--sitemap` - Generate XML sitemap (default: true)
- `--robots` - Audit robots.txt (default: true)
- `--indexnow` - Submit to IndexNow (default: false)
- `--gsc` - Compare with GSC indexation status

**Examples**:
```bash
# Full crawl with sitemap generation
tsx src/cli.ts crawl https://littlebearapps.com --depth 3

# Robots.txt audit only
tsx src/cli.ts crawl https://littlebearapps.com --robots --depth 1

# IndexNow submission
tsx src/cli.ts crawl https://littlebearapps.com --indexnow
```

**Output**:
- Site structure analysis
- XML sitemap (sitemap.xml)
- Robots.txt audit report
- IndexNow submission status
- GSC indexation comparison (if enabled)

---

## 🚀 v2.0 Core Features (Production-Ready ✅)

### 1. **Thompson Sampling Budget Optimization Engine**

**What**: Bayesian optimization for budget allocation across campaigns

**Algorithm**:
- Beta-Binomial CVR modeling (conversion rate distribution)
- Gamma value estimation (expected value per conversion)
- Uncertainty quantification (exploration vs exploitation)
- Multi-armed bandit optimization (budget reallocation)

**Input**:
- Historical campaign performance (impressions, clicks, conversions, cost)
- Budget constraints (min/max per campaign)
- Optimization goal (maximize conversions | maximize ROAS | minimize CPA)

**Output**:
- Recommended budget allocations per campaign
- Expected performance improvements
- Confidence intervals
- Exploration/exploitation balance metrics

**Tests**: 120+ tests passing ✅

**Usage**: Integrated into `plan` and `analyze` commands

---

### 2. **Safe Write Operations System**

**What**: Comprehensive mutation validation with guardrails, rollback, and audit logging

**Components**:

#### **Mutation Guard** (validation layer)
- Budget limit validation (per mutation, per account, per day)
- Quality score thresholds (reject low QS changes)
- Health checks (account status, policy compliance)
- Custom validation rules (user-defined)

#### **Budget Enforcer** (limit enforcement)
- Multi-tenant budget tracking
- Daily/weekly/monthly limits
- Alert triggers on threshold breaches
- Auto-pause on limit exceeded

#### **Audit Logger** (compliance layer)
- Tamper-evident logging (immutable records)
- 90-day retention policy
- Change tracking (before/after values)
- Rollback support

#### **Mutation Applier** (execution layer)
- Dry-run mode (validation only)
- validateOnly mode (Google Ads API validation)
- Circuit breaker protection (auto-pause on repeated failures)
- Retry logic with exponential backoff

**Tests**: 60+ tests passing ✅

**Usage**: `apply` command with `--confirm` flag

---

### 3. **Technical SEO Intelligence**

**What**: Comprehensive site health and indexation monitoring

**Features**:

#### **Internal Crawler**
- JavaScript-aware crawling (Puppeteer-based)
- Depth-limited traversal (configurable 1-5 levels)
- Rate limiting (respectful crawling)
- Link extraction and validation

#### **XML Sitemap Generation**
- Automatic sitemap.xml creation
- Priority and change frequency calculation
- Image and video sitemap support
- Sitemap index for large sites (>50k URLs)

#### **GSC Indexation Monitoring**
- Search Console API integration
- Indexation status tracking
- Coverage issue detection
- Mobile usability checks

#### **Robots.txt Audit**
- Syntax validation
- Disallow rule analysis
- Sitemap directive verification
- User-agent specificity checks

#### **IndexNow Integration**
- Instant indexation submission
- Bing, Yandex support
- Bulk URL submission
- Submission status tracking

**Tests**: 46+ tests passing ✅

**Usage**: `crawl` command

---

### 4. **A/B Testing Framework**

**What**: Statistical experiment framework with Google Ads/Analytics integration

**Lifecycle**:
1. **Design** - Hypothesis, variants, metrics, duration, traffic allocation
2. **Launch** - Deploy experiment with proper controls
3. **Monitor** - Real-time metric tracking with Bayesian updates
4. **Analyze** - Statistical significance testing, credible intervals
5. **Decide** - Winner selection or continue testing
6. **Report** - Comprehensive experiment documentation

**Statistical Methods**:
- Sequential testing (early stopping if significance reached)
- Bayesian credible intervals (posterior distributions)
- Sample size calculations (power analysis)
- Multiple comparison corrections (Bonferroni, Benjamini-Hochberg)

**Integration**:
- Google Ads API (create ad variants, split traffic)
- Google Analytics (conversion tracking, goal measurement)
- Alert system (alerts can trigger experiments)

**Tests**: 26+ tests passing ✅

**Usage**: `experiment` command

---

### 5. **Alert Detection System**

**What**: 8 specialized detectors with 7 automated remediation playbooks

**8 Detectors**:
1. **Budget Anomaly Detector** - Unexpected spend patterns (z-score analysis)
2. **Conversion Drop Detector** - Sudden CVR decreases (trend analysis)
3. **Quality Score Detector** - QS degradation alerts (threshold monitoring)
4. **Cost Spike Detector** - Abnormal CPC increases (rolling average)
5. **Click Fraud Detector** - Suspicious click patterns (behavioral analysis)
6. **Impression Share Detector** - Lost impression share (opportunity analysis)
7. **Position Drop Detector** - Ranking deterioration (SERP tracking)
8. **CTR Drop Detector** - Click-through rate declines (statistical testing)

**7 Remediation Playbooks**:
1. **Budget Reallocation** - Shift budget from low to high performers
2. **Bid Adjustment** - Automated bid changes based on performance
3. **Keyword Pause/Enable** - Toggle keywords based on quality score
4. **Quality Score Improvement** - Tactics for QS improvement (landing page, ad relevance)
5. **Negative Keyword Addition** - Auto-add poor-performing search terms
6. **Ad Copy Testing** - Trigger A/B tests for low CTR ads
7. **Landing Page Optimization** - Flag pages needing optimization

**Integration**: Works with `monitor` and `analyze` commands

**Tests**: Production-ready monitoring system ✅

---

### 6. **Content Intelligence System**

**What**: Entity coverage, schema generation, content planning, link optimization

**Features**:

#### **Entity Coverage Auditor**
- Extract entities from content (people, places, organizations, products)
- Compare with competitor coverage
- Identify entity gaps
- Recommend entity additions

#### **Schema Generation**
- 5 JSON-LD templates (Organization, Product, Article, FAQ, BreadcrumbList)
- Auto-generate schema from content
- Validation against Schema.org specs
- Rich snippet optimization

#### **Content Gap Analysis**
- Compare content coverage with competitors
- Identify missing topics and subtopics
- Recommend content roadmap
- Prioritize by search volume and competition

#### **FAQ Extraction**
- Extract questions from SERP "People Also Ask"
- Generate FAQ schema
- Recommend FAQ page structure

#### **Link Optimization**
- Internal link opportunity detection
- External link quality analysis
- Anchor text optimization recommendations

**Tests**: Entity auditor tested, other features in development

**Usage**: Integrated into `plan` command for content planning

---

### 7. **Multi-Source API Integration**

**What**: Unified OAuth + data precedence system

**APIs Integrated** ✅:
- **Google Search Console** - Organic performance data (sc-domain:littlebearapps.com)
- **Google Analytics** - GA4 property 497547311 (conversion tracking)
- **Google Ads** - Customer ID 9495806872 (campaign management)
- **RapidAPI Real-Time Web Search** - SERP analysis (20,000 calls/month)
- **RapidAPI Keyword Insight** - Keyword expansion (2,000 calls/day)
- **CSV Import** - Google Keyword Planner manual exports

**Authentication**:
- Unified OAuth2 flow for Google APIs (single authorization)
- Application Default Credentials (ADC) via gcloud
- Refresh token management with automatic rotation
- RapidAPI key-based authentication (stored in Keychain)

**Data Precedence System**:
1. **KWP CSV** (highest priority) - Real data from Google Keyword Planner
2. **GSC** (medium priority) - Organic search analytics
3. **RapidAPI** (lowest priority) - Estimated metrics as fallback

**Source Tracking**: All outputs marked with data source (`kwp|gsc|estimated`)

**Tests**: 100% functional across all command types ✅

---

## 🎨 Cross-Platform Capabilities

### **Microsoft Ads Integration**

**Features**:
- Bulk import CSV generation (compatible with Microsoft Ads Editor)
- Campaign structure conversion (Google Ads → Microsoft Ads)
- Budget recommendations (Thompson Sampling applies to both platforms)
- Cross-platform monitoring (compare Google vs Microsoft performance)

**Output**: `microsoft-ads-bulk.csv` in every plan generation

**Status**: Bulk export ready, monitoring implemented ✅

---

### **Edge Add-ons Store Optimization**

**Features**:
- Store listing analyzer (title, description, keywords)
- Competitor analysis (feature comparison)
- Keyword optimization recommendations
- Pricing strategy insights

**Output**: Store optimization audit report

**Status**: Analyzer implemented ✅

---

## 📊 Output Formats

### **CSV Files**
- Keywords with metrics (volume, CPC, competition, source)
- Microsoft Ads bulk import
- Performance reports
- Audit logs

### **JSON Files**
- Campaign structure (hierarchy of campaigns/ad groups/keywords)
- Budget recommendations (Thompson Sampling allocations)
- Quality score reports
- Audit logs
- Experiment results

### **Markdown Files**
- Plan summaries (human-readable overview)
- Experiment reports (statistical analysis)
- Compliance reports (GDPR/CCPA)

### **XML Files**
- Sitemap.xml (technical SEO)

---

## 🔍 For More Details

- **Architecture**: See Document #1 for component relationships
- **Thompson Sampling Deep Dive**: See Document #3 for algorithm details
- **Test Suite**: See Document #4 for test structure and coverage
- **Google API Application**: See Document #5 for OAuth setup and API integration

---

**Document Created**: 2025-10-09
**For**: SEO Ads Expert Linear Project
**Claude iOS Compatibility**: ✅ Complete feature reference without GitHub access
