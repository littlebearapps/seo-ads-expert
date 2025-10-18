# System Architecture & Core Components

**Purpose**: Foundational understanding of SEO Ads Expert architecture
**Last Updated**: 2025-10-09
**For**: Claude on iOS (Linear MCP access)

---

## 🎯 High-Level Architecture

SEO Ads Expert is a **Node.js/TypeScript CLI tool** that combines:
- **Thompson Sampling** optimization engine (Bayesian budget allocation)
- **Google API Integration** (Ads, Analytics, Search Console)
- **RapidAPI Intelligence** (SERP analysis, keyword expansion)
- **Safe Write Operations** (mutation validation, audit logging)
- **Comprehensive SEO Tools** (crawling, sitemaps, schema generation)

**Data Flow**:
```
Input Sources → Orchestrator → Analysis Engines → Writers → Output Files
     ↓              ↓              ↓                ↓           ↓
KWP CSV      Plan Generator  Thompson        CSV Export   8 Marketing
GSC Data     Command Router  Sampling        JSON Files   Files Per
RapidAPI     Precedence     A/B Testing     Audit Logs   Product
Google Ads   System         Alerts          Reports
```

---

## 📂 Directory Structure

```
seo-ads-expert/
├── src/
│   ├── cli.ts                    # Commander.js CLI interface
│   ├── orchestrator.ts           # Core planning logic with data precedence
│   │
│   ├── connectors/               # External API integrations
│   │   ├── kwp-csv.ts           # Keyword Planner CSV ingestion
│   │   ├── rapid-serp.ts        # RapidAPI SERP analysis
│   │   ├── search-console.ts    # GSC Search Analytics
│   │   └── google-ads-api.ts    # Google Ads API client
│   │
│   ├── analyzers/                # Data analysis engines
│   │   └── edge-store-analyzer.ts # Edge Add-ons Store optimization
│   │
│   ├── monitors/                 # Safety & monitoring systems
│   │   ├── cross-platform-monitor.ts # Google + Microsoft Ads
│   │   ├── mutation-guard.ts    # Mutation validation
│   │   ├── budget-enforcer.ts   # Budget limits
│   │   ├── audit-logger.ts      # Audit trail (90-day retention)
│   │   └── compliance-reporter.ts # GDPR/CCPA compliance
│   │
│   ├── alerts/                   # v1.7 Alert Detection System
│   │   ├── alert-manager.ts    # Core alert management
│   │   ├── detector-engine.ts  # Base detector class
│   │   └── detectors/          # 8 specialized detectors:
│   │       ├── budget-anomaly-detector.ts
│   │       ├── conversion-drop-detector.ts
│   │       ├── quality-score-detector.ts
│   │       └── [5 more...]
│   │
│   ├── experiments/              # v1.5 A/B Testing Framework
│   │   ├── experiment-manager.ts # Experiment lifecycle
│   │   ├── statistical-analyzer.ts # Statistical analysis
│   │   └── alert-integration.ts # Alert-experiment bridge
│   │
│   ├── playbooks/                # v1.7 Remediation Playbooks
│   │   └── strategies/          # 7 automated playbooks
│   │
│   ├── scoring.ts               # Enhanced scoring with source penalties
│   │
│   ├── entity/                   # v1.8 Entity Coverage System
│   │   └── entity-auditor.ts   # Entity extraction and analysis
│   │
│   ├── schema/                   # v1.8 Schema Generation
│   │   ├── types.ts            # Schema type definitions
│   │   ├── schema-generator.ts # Schema generation engine
│   │   ├── schema-validator.ts # Schema validation
│   │   └── templates/          # 5 JSON-LD templates
│   │
│   ├── content/                  # v1.8 Content Intelligence
│   │   ├── content-planner.ts  # Gap analysis and roadmap
│   │   ├── faq-extractor.ts    # FAQ extraction system
│   │   └── link-optimizer.ts   # Link opportunity detection
│   │
│   ├── v18-integration.ts        # v1.8 orchestration module
│   │
│   ├── writers/                  # Output generation
│   │   ├── csv.ts              # CSV output generators
│   │   ├── microsoft-ads-csv.ts # Microsoft Ads bulk import
│   │   ├── edge-store-audit-writer.ts # Store optimization
│   │   ├── experiment-report-writer.ts # A/B test reports
│   │   └── mutation-applier.ts # Safe write operations
│   │
│   └── utils/
│       └── rate-limiter.ts      # Rate limiting for API calls
│
├── tests/                        # 1,005 tests (920 passing)
│   ├── test-google-ads-api.ts  # API integration tests
│   ├── integration-workflows.test.ts # Cross-component tests
│   └── error-scenarios.test.ts # Edge cases & error handling
│
├── inputs/kwp_csv/              # Keyword Planner CSV exports
├── cache/                       # 7-day TTL API response cache
├── audit/                       # Audit logs (90-day retention)
└── plans/[product]/[date]/      # Generated marketing plans
```

---

## 🔌 Core Components

### 1. **Orchestrator** (`orchestrator.ts`)
**Role**: Central controller for plan generation and workflow coordination

**Responsibilities**:
- Coordinate data collection from multiple sources (KWP CSV, GSC, RapidAPI)
- Implement data precedence system (KWP CSV > GSC > RapidAPI)
- Route commands to appropriate modules
- Manage workflow state and error recovery

**Key Methods**:
- `generatePlan(product, options)` - Main entry point for plan generation
- `analyzeCampaign(campaignId)` - Performance analysis
- `applyOptimizations(mutations, options)` - Safe mutation application

---

### 2. **Connectors** (API Integration Layer)

#### **Google Ads API** (`google-ads-api.ts`)
- OAuth2 authentication (unified with Analytics & Search Console)
- Campaign/Ad Group/Keyword CRUD operations
- Mutation operations with validateOnly support
- Rate limiting and quota management

#### **Google Search Console** (`search-console.ts`)
- Organic performance data
- Search query analysis
- Indexation status monitoring
- Connected via unified OAuth

#### **Google Analytics** (`analytics-connector.ts`)
- GA4 property integration
- Conversion tracking
- User behavior metrics
- Property ID: 497547311

#### **RapidAPI** (`rapid-serp.ts`)
- SERP analysis (20,000 calls/month tier)
- Keyword expansion (2,000 calls/day tier)
- Smart quota management
- Fallback intelligence source

#### **CSV Import** (`kwp-csv.ts`)
- Google Keyword Planner CSV ingestion
- Highest priority data source (precedence system)
- Volume, CPC, competition metrics

---

### 3. **Monitors** (Safety & Compliance Layer)

#### **Mutation Guard** (`mutation-guard.ts`)
**Purpose**: Validate all mutations before application

**Checks**:
- Budget limits (per mutation, per account, per day)
- Quality score thresholds (reject low QS changes)
- Health checks (account status, policy compliance)
- Custom validation rules

#### **Audit Logger** (`audit-logger.ts`)
**Purpose**: Tamper-evident audit trail

**Features**:
- 90-day retention policy
- Immutable log records
- Change tracking (before/after values)
- Rollback support

#### **Budget Enforcer** (`budget-enforcer.ts`)
**Purpose**: Enforce budget constraints

**Capabilities**:
- Multi-tenant budget tracking
- Daily/weekly/monthly limits
- Alert triggers on threshold breaches
- Auto-pause on limit exceeded

---

### 4. **Alerts** (Detection & Remediation)

**8 Specialized Detectors**:
1. Budget Anomaly Detector - Unexpected spend patterns
2. Conversion Drop Detector - Sudden CVR decreases
3. Quality Score Detector - QS degradation alerts
4. Cost Spike Detector - Abnormal CPC increases
5. Click Fraud Detector - Suspicious click patterns
6. Impression Share Detector - Lost impression share
7. Position Drop Detector - Ranking deterioration
8. CTR Drop Detector - Click-through rate declines

**7 Automated Remediation Playbooks**:
- Budget reallocation strategies
- Bid adjustment recommendations
- Keyword pause/enable workflows
- Quality score improvement tactics
- Negative keyword additions
- Ad copy testing triggers
- Landing page optimization alerts

---

### 5. **Experiments** (A/B Testing Framework)

**Experiment Lifecycle**:
1. **Design** - Define hypothesis, variants, metrics, duration
2. **Launch** - Deploy experiment with traffic allocation
3. **Monitor** - Track metrics with Bayesian updates
4. **Analyze** - Statistical significance testing
5. **Decide** - Winner selection or continue testing
6. **Report** - Generate comprehensive experiment reports

**Statistical Methods**:
- Sequential testing (early stopping)
- Bayesian credible intervals
- Sample size calculations
- Multiple comparison corrections

**Integration**:
- Alert-experiment bridge (alerts can trigger experiments)
- Google Ads integration (create ad variants)
- Google Analytics integration (conversion tracking)

---

### 6. **Writers** (Output Generation)

**8 Output File Types Generated Per Product**:
1. **CSV Export** - Keywords with volume, CPC, competition, source tracking
2. **Microsoft Ads Bulk Import** - Cross-platform campaign setup
3. **Negative Keywords List** - Pre-seeded exclusions
4. **Campaign Structure** - Ad groups, keywords, targeting
5. **Budget Recommendations** - Thompson Sampling allocations
6. **Quality Score Report** - Scoring analysis
7. **Audit Log** - All operations with timestamps
8. **Experiment Reports** - A/B test results (if applicable)

---

## 🔄 Data Precedence System

**Priority Order**:
1. **KWP CSV** (highest) - Manual exports from Google Keyword Planner
2. **GSC** (medium) - Organic performance data from Search Console
3. **RapidAPI** (lowest) - Estimated metrics as fallback

**Source Tracking**: All outputs marked with source (`kwp|gsc|estimated`) in CSV

**Benefits**:
- Prefer real data over estimates
- Graceful fallback when sources unavailable
- Transparent data provenance

---

## 🏗️ Technology Stack

**Runtime**:
- Node.js 18+
- TypeScript 5.x
- tsx (TypeScript execution)

**Core Dependencies**:
- `commander` - CLI interface
- `axios` - HTTP client
- `zod` - Schema validation
- `pino` - Structured logging
- `csv-parse` / `csv-stringify` - CSV processing
- `date-fns` - Date utilities
- `googleapis` - Google API client library

**Dev Dependencies**:
- `vitest` - Test framework (1,005 tests)
- `@types/node` - TypeScript definitions

**Performance**:
- 11 seconds per plan generation (full end-to-end)
- 8 professional marketing files created
- 3-10 SERP calls per run (smart quota management)
- 7-day cache TTL with intelligent precedence

---

## 🔐 Authentication Strategy

**Current Setup**: Application Default Credentials (ADC) + OAuth2

**Google APIs**:
- **ADC via gcloud**: Short-lived tokens for API access
- **OAuth2 Refresh Token**: For Google Ads, Analytics, Search Console
- **Setup**: `gcloud auth application-default login`

**Why not service account JSON**:
- Security risk (long-lived keys can be leaked)
- ADC provides automatic rotation
- No key management overhead

**RapidAPI**:
- API key-based authentication
- Stored in macOS Keychain (via direnv)
- Shared across SERP + Keyword Insight APIs

---

## 📊 Key Performance Metrics

**Efficiency Gains**:
- **Before**: 3+ hours manual workflow per product
- **After**: 11 seconds automated generation
- **Improvement**: 1000x+ efficiency achieved

**Test Coverage**:
- Total: 1,005 tests across 63 test files
- Passing: 920 tests (91.5%)
- Failing: 80 tests (8.0% - test remediation in progress)
- Critical v2.0 Core: 100% passing ✅

**API Efficiency**:
- Smart caching (7-day TTL)
- Rate limiting per API
- Quota management (3-10 SERP calls/run)
- Batch operations where possible

---

## 🔗 Integration Points

**Little Bear Apps Systems**:
- ConvertMyFile - Ready for keyword planning
- PaletteKit - Ready for keyword planning
- NoteBridge - Ready for keyword planning

**External Systems**:
- Google Ads (customer ID: 9495806872)
- Google Analytics (property: 497547311)
- Google Search Console (sc-domain:littlebearapps.com)
- RapidAPI Real-Time Web Search (20K calls/month)
- RapidAPI Keyword Insight (2K calls/day)

---

## 🎯 Component Relationships

```
CLI (cli.ts)
  ├── Orchestrator (orchestrator.ts)
  │   ├── Connectors Layer
  │   │   ├── KWP CSV → Data Precedence #1
  │   │   ├── Search Console → Data Precedence #2
  │   │   ├── RapidAPI → Data Precedence #3
  │   │   └── Google Ads API → Performance Data
  │   │
  │   ├── Analysis Layer
  │   │   ├── Thompson Sampling → Budget Optimization
  │   │   ├── Scoring Engine → Keyword Quality
  │   │   ├── Entity Auditor → Content Coverage
  │   │   └── Schema Generator → SEO Structure
  │   │
  │   ├── Monitoring Layer
  │   │   ├── Alert Manager → 8 Detectors
  │   │   ├── Experiment Manager → A/B Testing
  │   │   └── Cross-Platform Monitor → Google + Microsoft
  │   │
  │   └── Safety Layer
  │       ├── Mutation Guard → Validation
  │       ├── Budget Enforcer → Limits
  │       └── Audit Logger → Compliance
  │
  └── Writers Layer
      ├── CSV Writer → Keyword Lists
      ├── Microsoft Ads Writer → Bulk Import
      ├── Mutation Applier → Safe Write Ops
      └── Experiment Reporter → A/B Results
```

---

## 📝 Usage Examples

### Generate Marketing Plan
```bash
tsx src/cli.ts plan convertmyfile
# Output: plans/convertmyfile/2025-10-09/
# Files: 8 marketing files (CSV, budget, negatives, etc.)
```

### Analyze Campaign Performance
```bash
tsx src/cli.ts analyze 1234567890
# Output: Performance analysis with waste detection
```

### Monitor Cross-Platform
```bash
tsx src/cli.ts monitor --platform google,microsoft
# Output: Cross-platform performance comparison
```

### Apply Optimizations (Safe Write)
```bash
tsx src/cli.ts apply --plan latest --dry-run
# Output: Validation results, no mutations
tsx src/cli.ts apply --plan latest --confirm
# Output: Mutations applied with audit trail
```

---

## 🔍 For More Details

- **Feature Catalog**: See Document #2 for complete command reference
- **Thompson Sampling**: See Document #3 for algorithm deep dive
- **Test Suite**: See Document #4 for test structure and remediation plan
- **Google API Application**: See Document #5 for OAuth and API integration details

---

**Document Created**: 2025-10-09
**For**: SEO Ads Expert Linear Project
**Claude iOS Compatibility**: ✅ Complete architectural context without GitHub access
