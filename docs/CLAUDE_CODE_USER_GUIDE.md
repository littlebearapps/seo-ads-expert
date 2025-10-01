# SEO & Ads Expert - Claude Code MCP User Guide

## Overview
This guide is specifically designed for Claude Code instances using the SEO & Ads Expert tool via the MCP (Model Context Protocol) integration. The tool provides comprehensive SEO and Google Ads management capabilities through both CLI commands and MCP server endpoints.

## Table of Contents
1. [Quick Start](#quick-start)
2. [MCP Server Setup](#mcp-server-setup)
3. [Core Features](#core-features)
4. [Command Reference](#command-reference)
5. [Workflows](#workflows)
6. [Configuration](#configuration)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### For Claude Code Users
```bash
# Navigate to the tool directory
cd /lba/infrastructure/tools/seo-ads-expert

# Initialize the MCP server (if not already running)
npm run mcp:start

# Generate a marketing plan for a product
npx tsx src/cli.ts plan --product convertmyfile

# Run v2.0 Thompson Sampling budget optimization
npx tsx src/cli.ts optimize-budget --product convertmyfile --mode thompson
```

### MCP Tools Available
When the MCP server is running, Claude Code has access to these tools:
- `seo_plan_generate` - Generate comprehensive SEO/Ads plans
- `seo_performance_analyze` - Analyze campaign performance
- `seo_experiment_create` - Create A/B tests
- `seo_alert_check` - Monitor for anomalies
- `seo_entity_audit` - Analyze entity coverage
- `seo_crawl_site` - Crawl website for SEO audit
- `seo_budget_optimize` - Optimize budget allocation
- `seo_content_plan` - Generate content strategy
- `seo_competitor_analyze` - Analyze competitor strategies

---

## MCP Server Setup

### Starting the Server
```bash
# Start MCP server (runs on port 3000 by default)
npm run mcp:start

# Or run in development mode with auto-restart
npm run mcp:dev
```

### MCP Configuration
Add to your Claude Code's `.mcp.json`:
```json
{
  "servers": {
    "seo-ads-expert": {
      "command": "node",
      "args": ["./src/mcp/server.js"],
      "cwd": "/lba/infrastructure/tools/seo-ads-expert",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## Core Features

### 1. Marketing Plan Generation
Generate comprehensive SEO and Google Ads plans with competitor analysis:

```bash
# Basic plan generation
npx tsx src/cli.ts plan --product palettekit

# Multi-market plan with specific countries
npx tsx src/cli.ts plan --product palettekit --markets AU,US,GB

# With custom output format
npx tsx src/cli.ts plan --product palettekit --format ads-editor
```

**Via MCP:**
```javascript
await seo_plan_generate({
  product: "palettekit",
  markets: ["AU", "US"],
  includeCompetitors: true
});
```

### 2. V2.0 Thompson Sampling Budget Optimizer
Intelligent budget allocation using Bayesian optimization:

```bash
# Optimize budget across campaigns
npx tsx src/cli.ts optimize-budget --product convertmyfile

# With specific constraints
npx tsx src/cli.ts optimize-budget --product convertmyfile --budget 1000 --roas-target 4.0
```

**Via MCP:**
```javascript
await seo_budget_optimize({
  product: "convertmyfile",
  budget: 1000,
  roasTarget: 4.0,
  mode: "thompson"
});
```

### 3. A/B Testing Framework
Create and manage experiments with statistical rigor:

```bash
# Create RSA (Responsive Search Ad) experiment
npx tsx src/cli-experiments.ts create --type rsa --product palettekit

# Create landing page experiment
npx tsx src/cli-experiments.ts create --type landing_page --product palettekit

# Analyze experiment results
npx tsx src/cli-experiments.ts analyze --id exp_rsa_palettekit_20250927_abc123

# Complete experiment with winner
npx tsx src/cli-experiments.ts complete --id exp_rsa_palettekit_20250927_abc123 --winner variant_1
```

**Via MCP:**
```javascript
await seo_experiment_create({
  type: "rsa",
  product: "palettekit",
  variants: ["benefit_led", "feature_led"]
});
```

### 4. Alert Detection & Remediation
Monitor campaigns and automatically remediate issues:

```bash
# Check for anomalies
npx tsx src/cli-alerts.ts check --product palettekit

# List active alerts
npx tsx src/cli-alerts.ts list

# Acknowledge alert
npx tsx src/cli-alerts.ts ack ALERT_ID

# Apply remediation playbook
npx tsx src/cli-alerts.ts remediate ALERT_ID --playbook pb-ctr-drop
```

**Via MCP:**
```javascript
await seo_alert_check({
  product: "palettekit",
  autoRemediate: true
});
```

### 5. Entity Coverage & Content Optimization
Analyze entity coverage and generate content strategies:

```bash
# Audit entity coverage
npx tsx src/cli.ts entity-audit --product palettekit

# Generate FAQ content
npx tsx src/cli.ts faq-extract --product palettekit

# Create content roadmap
npx tsx src/cli.ts content-roadmap --product palettekit

# Find internal linking opportunities
npx tsx src/cli.ts link-suggest --product palettekit
```

**Via MCP:**
```javascript
await seo_entity_audit({
  product: "palettekit",
  compareWith: ["competitor1.com", "competitor2.com"]
});
```

### 6. Technical SEO Intelligence
Crawl sites and generate technical SEO insights:

```bash
# Crawl website
npx tsx src/cli.ts crawl --domain littlebearapps.com

# Generate XML sitemap
npx tsx src/cli.ts generate-sitemap --domain littlebearapps.com

# Check GSC indexation
npx tsx src/cli.ts gsc-indexation --property sc-domain:littlebearapps.com

# Audit robots.txt
npx tsx src/cli.ts robots-audit --url https://littlebearapps.com

# Submit to IndexNow
npx tsx src/cli.ts indexnow --urls ./urls.txt --engine bing
```

**Via MCP:**
```javascript
await seo_crawl_site({
  domain: "littlebearapps.com",
  maxPages: 500,
  generateSitemap: true
});
```

---

## Command Reference

### Core Commands (src/cli.ts)
| Command | Description | Example |
|---------|-------------|---------|
| `plan` | Generate marketing plan | `plan --product palettekit` |
| `performance` | Analyze performance | `performance paid-organic-gaps --product palettekit` |
| `monitor` | Monitor costs/usage | `monitor --detailed` |
| `list` | List plan history | `list --product palettekit` |
| `show` | Show specific plan | `show --product palettekit --date 2025-09-27` |

### Experiment Commands (src/cli-experiments.ts)
| Command | Description | Example |
|---------|-------------|---------|
| `create` | Create experiment | `create --type rsa --product palettekit` |
| `start` | Start experiment | `start --id EXP_ID` |
| `pause` | Pause experiment | `pause --id EXP_ID` |
| `analyze` | Analyze results | `analyze --id EXP_ID` |
| `complete` | Complete with winner | `complete --id EXP_ID --winner VARIANT_ID` |

### Alert Commands (src/cli-alerts.ts)
| Command | Description | Example |
|---------|-------------|---------|
| `check` | Check for anomalies | `check --product palettekit` |
| `list` | List active alerts | `list --status active` |
| `ack` | Acknowledge alert | `ack ALERT_ID` |
| `remediate` | Apply playbook | `remediate ALERT_ID --playbook pb-ctr-drop` |

### Microsoft Ads Commands (src/cli-microsoft.ts)
| Command | Description | Example |
|---------|-------------|---------|
| `export` | Export to Microsoft format | `export --product palettekit` |
| `validate` | Validate export | `validate --file export.csv` |

### Opportunity Commands (src/cli-opportunity.ts)
| Command | Description | Example |
|---------|-------------|---------|
| `find` | Find opportunities | `find --product palettekit` |
| `analyze` | Analyze opportunity | `analyze --opportunity OPP_ID` |
| `prioritize` | Prioritize opportunities | `prioritize --product palettekit` |

---

## Workflows

### 1. New Product Launch Workflow
```bash
# Step 1: Generate initial marketing plan
npx tsx src/cli.ts plan --product newproduct --markets AU,US,GB

# Step 2: Analyze competitor landscape
npx tsx src/cli.ts performance competitor-analysis --product newproduct

# Step 3: Create A/B tests for ads
npx tsx src/cli-experiments.ts create --type rsa --product newproduct

# Step 4: Set up monitoring
npx tsx src/cli-alerts.ts setup --product newproduct --thresholds conservative

# Step 5: Generate content strategy
npx tsx src/cli.ts content-roadmap --product newproduct
```

### 2. Optimization Workflow
```bash
# Step 1: Check current performance
npx tsx src/cli.ts performance summary --product palettekit

# Step 2: Identify gaps
npx tsx src/cli.ts performance paid-organic-gaps --product palettekit

# Step 3: Run budget optimization
npx tsx src/cli.ts optimize-budget --product palettekit --mode thompson

# Step 4: Apply recommendations
npx tsx src/cli.ts apply-recommendations --product palettekit --auto-approve false
```

### 3. Alert Response Workflow
```bash
# Step 1: Check for alerts
npx tsx src/cli-alerts.ts check --product all

# Step 2: Review alert details
npx tsx src/cli-alerts.ts show ALERT_ID

# Step 3: Apply remediation
npx tsx src/cli-alerts.ts remediate ALERT_ID --playbook auto

# Step 4: Monitor recovery
npx tsx src/cli.ts monitor --product palettekit --interval 15m
```

---

## Configuration

### Required Environment Variables
Create `.env` file from `.env.example`:

```bash
# Google APIs (choose one method)
# Method 1: Application Default Credentials (RECOMMENDED)
# Run: gcloud auth application-default login

# Method 2: OAuth2 (for production)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Google Ads Configuration
GOOGLE_ADS_CUSTOMER_ID=9495806872
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token
GOOGLE_ADS_LOGIN_CUSTOMER_ID=your-manager-account-id

# Google Analytics
GOOGLE_ANALYTICS_PROPERTY_ID=497547311
GOOGLE_ANALYTICS_MEASUREMENT_ID=G-XXXXXXXXXX

# RapidAPI (for SERP analysis)
RAPIDAPI_KEY=your-rapidapi-key
RAPIDAPI_HOST_SERP=real-time-web-search.p.rapidapi.com
RAPIDAPI_HOST_KEYWORDS=google-keyword-insight1.p.rapidapi.com

# Database
DATABASE_PATH=./data/seo-ads-expert.db

# MCP Server
MCP_PORT=3000
MCP_HOST=localhost
```

### Directory Structure Required
```
seo-ads-expert/
├── inputs/
│   ├── kwp_csv/           # Keyword Planner CSV imports
│   └── google_ads/        # Google Ads exports
├── plans/                 # Generated marketing plans
├── cache/                 # API response cache
├── audit/                 # Audit logs
├── data/                  # SQLite databases
└── test-output/          # Test outputs
```

### Initial Setup Checklist
- [ ] Copy `.env.example` to `.env` and configure
- [ ] Run `gcloud auth application-default login` for Google APIs
- [ ] Create required directories: `mkdir -p inputs/kwp_csv plans cache audit data`
- [ ] Initialize database: `npx tsx scripts/init-database.js`
- [ ] Test authentication: `npx tsx scripts/test-unified-auth.js`
- [ ] Apply for Google Ads API production access (if needed)

---

## Troubleshooting

### Common Issues

#### 1. Google Ads API Access
**Error:** "Developer token only approved for test accounts"
**Solution:** Apply for production access at https://developers.google.com/google-ads/api/docs/access

#### 2. Rate Limiting
**Error:** "API quota exceeded"
**Solution:**
- Check `MAX_SERP_CALLS_PER_RUN` in `.env` (default: 30)
- Upgrade RapidAPI tier if needed
- Enable caching with `CACHE_TTL_HOURS`

#### 3. Database Issues
**Error:** "Database schema mismatch"
**Solution:**
```bash
# Backup existing database
cp data/seo-ads-expert.db data/seo-ads-expert.db.backup

# Re-initialize
npx tsx scripts/init-database.js --force
```

#### 4. MCP Connection Issues
**Error:** "Cannot connect to MCP server"
**Solution:**
```bash
# Check if server is running
ps aux | grep "mcp/server"

# Restart server
npm run mcp:restart

# Check logs
tail -f logs/mcp-server.log
```

### Debug Mode
Enable verbose logging:
```bash
# Set in .env
LOG_LEVEL=debug

# Or per command
DEBUG=* npx tsx src/cli.ts plan --product palettekit
```

### Getting Help
1. Check test files for usage examples
2. Run commands with `--help` flag
3. Review source code documentation
4. Check `docs/` folder for additional guides

---

## Advanced Features

### Custom Scoring Weights
Adjust importance scoring in `src/config/scoring.json`:
```json
{
  "serpFrequency": 0.5,
  "queryVolume": 0.3,
  "intentBoost": 0.2
}
```

### Batch Processing
Process multiple products:
```bash
# Create batch file
echo "palettekit,convertmyfile,notebridge" > products.txt

# Run batch processing
npx tsx scripts/batch-process.js --file products.txt --command plan
```

### Export Formats
- **CSV**: Standard spreadsheet format
- **JSON**: Structured data for APIs
- **Markdown**: Human-readable reports
- **Google Ads Editor**: Direct import format
- **Microsoft Ads**: Bulk import format

---

## Version History
- **v2.0**: Thompson Sampling Budget Optimizer
- **v1.9**: Technical SEO Intelligence
- **v1.8**: Entity Coverage & Content Optimization
- **v1.7**: Alert Detection & Remediation
- **v1.6**: Microsoft Ads Integration
- **v1.5**: A/B Testing Framework
- **v1.0**: Initial release with core features

---

## Notes for Claude Code
- All commands support `--dry-run` for testing without execution
- Use `--format json` for structured output suitable for processing
- The MCP server maintains state between calls for efficiency
- Database is automatically initialized on first run
- Cache is shared across all instances for API efficiency