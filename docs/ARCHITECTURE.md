# Architecture Overview

## System Architecture

The SEO & Google Ads Expert Tool follows a modular, data-driven architecture optimized for Chrome extension marketing intelligence.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Interface                            │
│                     (Commander.js)                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                   Orchestration Engine                          │
│                 (SEOAdsOrchestrator)                           │
└─────────┬─────────────────────────────────────┬─────────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────────┐                ┌──────────────────────┐
│   Data Collection   │                │   Data Processing    │
│                     │                │                      │
│ ┌─────────────────┐ │                │ ┌──────────────────┐ │
│ │ KWP CSV Import  │ │                │ │ Data Precedence  │ │
│ └─────────────────┘ │                │ │     Engine       │ │
│ ┌─────────────────┐ │                │ └──────────────────┘ │
│ │ Search Console  │ │                │ ┌──────────────────┐ │
│ │   Connector     │ │                │ │ Enhanced Scoring │ │
│ └─────────────────┘ │                │ │     Engine       │ │
│ ┌─────────────────┐ │                │ └──────────────────┘ │
│ │   RapidAPI      │ │                │ ┌──────────────────┐ │
│ │  Connectors     │ │                │ │   Clustering     │ │
│ └─────────────────┘ │                │ │    Algorithm     │ │
└─────────────────────┘                │ └──────────────────┘ │
                                       └──────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Output Generation                            │
│                                                                 │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐ │
│ │ Keywords CSV │ │   Ads JSON   │ │  SEO Pages   │ │ Others  │ │
│ │    Writer    │ │   Writer     │ │   Writer     │ │ Writers │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Caching & Storage Layer                       │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                   │
│  │  File-based     │    │ Quota Management│                   │  
│  │     Cache       │    │   & Statistics  │                   │
│  │   (24h TTL)     │    │                 │                   │
│  └─────────────────┘    └─────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Interface (`src/cli.ts`)

**Purpose**: Commander.js-based command-line interface providing user interaction layer.

**Key Features**:
- Product-specific plan generation
- Historical plan management (list, show)  
- Cache management and statistics
- API connection testing
- Product configuration validation

**Commands**:
- `plan` - Generate complete marketing plan
- `list` - Show historical plans
- `show` - Display plan details
- `cache` - Manage API response cache
- `test` - Test API connectivity
- `validate` - Verify product configurations

### 2. Orchestration Engine (`src/orchestrator.ts`)

**Purpose**: Central coordination engine managing the complete 9-step pipeline.

**Pipeline Steps**:
1. **Environment Validation** - Verify API keys and configuration
2. **Product Configuration** - Load product-specific settings  
3. **Data Collection** - Gather keywords from all sources
4. **Data Precedence** - Apply smart source merging
5. **Scoring & Analysis** - Calculate enhanced keyword scores
6. **Clustering** - Group keywords by use case and intent
7. **Landing Page Mapping** - Align clusters to existing pages
8. **Output Generation** - Create all marketing plan files
9. **Performance Reporting** - Track metrics and API usage

**Key Responsibilities**:
- Coordinate all system components
- Manage performance metrics collection
- Handle comprehensive error recovery
- Provide detailed progress reporting

### 3. Data Collection Layer

#### KWP CSV Connector (`src/connectors/kwp-csv.ts`)
**Purpose**: Process Google Keyword Planner CSV exports (highest priority data source).

**Features**:
- Automatic CSV format detection
- Volume range parsing (1K-10K → 5500)
- Competition level normalization
- Multi-market data handling

#### Search Console Connector (`src/connectors/search-console.ts`)  
**Purpose**: Retrieve organic performance data as keyword value proxy.

**Google APIs**:
- Search Analytics API for query data
- OAuth2/Service Account authentication
- 16 months historical data access
- Multi-dimensional filtering (query, page, country, device)

#### RapidAPI Connectors (`src/connectors/rapid-*.ts`)
**Purpose**: Keyword expansion and SERP intelligence from third-party APIs.

**SERP Connector** (`rapid-serp.ts`):
- Real-time search results analysis
- SERP feature detection (AI Overview, Featured Snippets, Images)
- Competitor identification and positioning
- Quota-managed with caching

**Keywords Connector** (`rapid-keywords.ts`):
- Keyword expansion from seed terms
- Volume and competition estimates
- Related keyword suggestions
- Market-specific localization

### 4. Data Processing Layer

#### Data Precedence Engine (`src/utils/precedence.ts`)
**Purpose**: Smart merging of multiple data sources using precedence rules.

**Precedence Logic**:
1. **KWP CSV** - Authoritative Google data (0% penalty)
2. **Search Console** - Real proxy data (5% penalty)  
3. **RapidAPI** - Third-party estimates (10% penalty)

**Features**:
- Duplicate keyword resolution
- Metric gap filling from lower precedence sources
- Source quality tracking
- Data completeness scoring

#### Enhanced Scoring Engine (`src/scoring.ts`)
**Purpose**: Multi-factor algorithm optimized for Chrome extension marketing.

**Scoring Formula**:
```
score = 0.35 × norm(volume) + 0.25 × intent + 0.15 × longtail_bonus 
        - 0.15 × norm(competition) - 0.10 × serp_blockers - 0.10 × source_penalty
```

**Chrome Extension Intelligence**:
- Extension-specific terms: 2.3x intent multiplier
- Product-specific terms: 1.5x intent multiplier  
- Generic browser terms: 1.2x intent multiplier

**SERP Blocker Penalties**:
- AI Overview: -0.3 (hardest to compete with)
- Featured Snippets: -0.2 (reduced click-through)
- Image/Video carousels: -0.1 (attention split)

#### Clustering Algorithm (`src/clustering.ts`)
**Purpose**: Intelligent keyword grouping with use-case detection and landing page mapping.

**Algorithm**: N-gram similarity with semantic enhancement

**Features**:
- Use case detection (conversion, selection, organization, etc.)
- Product-specific pattern recognition  
- Automatic landing page assignment
- Content gap identification
- Cluster quality scoring

### 5. Output Generation Layer (`src/writers.ts`)

**Purpose**: Generate comprehensive marketing plan files in multiple formats.

#### Keywords CSV Writer
- Enhanced keyword dataset with 12 analysis columns
- Data source transparency (kwp/gsc/estimated)
- SERP feature analysis
- Landing page mapping
- Intent and quality scoring

#### Ads JSON Writer  
- Complete Google Ads campaign structure
- Ad groups mapped to landing pages
- Headlines with pinned "Chrome Extension" + benefits
- Market-specific targeting
- Keyword match types and bid recommendations

#### SEO Pages Writer
- Landing page optimization briefs
- Target keyword assignments  
- Content gap analysis
- Technical SEO recommendations
- Competitive positioning advice

#### Competitors & Negatives Writers
- SERP competitor analysis with positioning
- Recommended negative keywords
- Market opportunity identification
- Brand differentiation strategies

### 6. Caching & Storage Layer

#### Cache Manager (`src/utils/cache.ts`)
**Purpose**: File-based caching with quota management and performance optimization.

**Features**:
- 24-hour TTL with automatic cleanup
- Hierarchical file organization by source
- Quota tracking (≤30 SERP calls per run)
- Cache hit/miss statistics
- Daily quota reset automation

**Storage Structure**:
```
cache/
├── g/  # GSC cache files
├── r/  # RapidAPI cache files  
├── k/  # KWP cache files
└── quota-stats.json
```

#### Product Configuration (`products/*.yaml`)
**Purpose**: Product-specific marketing configuration using YAML schema.

**Configuration Elements**:
- Target markets with localization
- Seed queries for keyword expansion
- Landing pages with primary keywords
- Value propositions and USPs
- Pre-seeded negative keywords

## Data Flow Architecture

### 1. Request Processing Flow
```
CLI Command → Orchestrator → Config Loading → Data Collection
```

### 2. Data Collection Flow  
```
KWP CSV ──┐
          ├─→ Data Precedence Engine → Enhanced Dataset
GSC API ──┤
          │
RapidAPI ─┘
```

### 3. Processing Pipeline
```
Raw Keywords → Scoring Engine → Clustering → Landing Page Mapping → Outputs
```

### 4. Output Generation
```
Processed Data → Multiple Writers → File System → User Notification
```

## Performance Architecture

### Quota Management
- **SERP Calls**: ≤30 per run with 24h caching
- **Daily Tracking**: Persistent quota state across sessions
- **Cache Optimization**: >80% hit rate target
- **Processing Speed**: <30 seconds per plan generation

### Memory Management  
- **Streaming Processing**: Large datasets processed in chunks
- **Memory Pool**: Reuse objects to reduce GC pressure
- **Peak Usage**: <100MB during plan generation

### Error Handling Strategy
- **Graceful Degradation**: Continue with available data sources
- **Circuit Breakers**: Prevent cascade failures
- **Retry Logic**: Exponential backoff for transient failures
- **User Communication**: Clear error messages with resolution steps

## Security Architecture

### API Key Management
- Environment variable isolation
- No hardcoded credentials
- Validation on startup
- Secure error messages (no key exposure)

### Data Privacy
- No persistent user data storage
- Cache files contain only public search data
- Optional Google Cloud integration
- Local processing (no data sent to third parties beyond APIs)

### Input Validation
- Zod schema validation throughout
- SQL injection prevention (no SQL used)
- File path sanitization
- Rate limiting compliance

## Scalability Considerations

### Horizontal Scaling
- **MCP Server Conversion**: Future integration with Claude Code
- **API Parallelization**: Concurrent data source queries
- **Product Expansion**: Easy addition of new Chrome extensions
- **Market Expansion**: Configuration-driven localization

### Performance Optimization
- **Caching Strategy**: Aggressive caching with smart invalidation
- **API Efficiency**: Minimize API calls through intelligent precedence
- **Batch Processing**: Group related operations
- **Memory Efficiency**: Stream processing for large datasets

### Monitoring & Observability
- **Performance Metrics**: Processing time, API usage, cache efficiency
- **Quality Metrics**: Data completeness, landing page coverage
- **Error Tracking**: Comprehensive logging with context
- **Usage Analytics**: Plan generation frequency and patterns

---

**Last Updated**: 2025-09-03  
**Version**: 1.0.0  
**Architecture Review**: Approved for Production