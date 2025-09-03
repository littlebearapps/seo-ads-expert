# SEO & Google Ads Expert Tool

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/littlebearapps/seo-ads-expert.git
cd seo-ads-expert

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API credentials

# Run keyword planning for ConvertMyFile
npm run plan -- --product convertmyfile --markets AU,US,GB

# List previous plans
npm run plans -- --product convertmyfile

# Show plan summary
npm run show -- --product convertmyfile --date 2025-09-03
```

## 📊 Progress Tracker

### Development Phases
- [ ] **Phase 1**: Project Setup & Dependencies ⏳
- [ ] **Phase 2**: V1 Data Sources & Authentication ⏳  
- [ ] **Phase 3**: Product Configuration Schema ⏳
- [ ] **Phase 4**: V1 Connectors Implementation ⏳
- [ ] **Phase 5**: Enhanced Caching System ⏳
- [ ] **Phase 6**: Enhanced Keyword Scoring & Clustering ⏳
- [ ] **Phase 7**: Output Writers ⏳
- [ ] **Phase 8**: CLI Interface & Orchestration ⏳
- [ ] **Phase 9**: Testing & Documentation ⏳
- [ ] **Phase 10**: MCP Server Conversion ⏳

## 📈 Current Status

**Active Phase**: Phase 1 - Project Setup  
**Completion**: 0%  
**Version**: 0.1  
**Sprint**: Week 1 of 2  
**Next Checkpoint**: 2025-09-10  

### Blockers
- [ ] Google Ads account setup in Expert Mode
- [ ] RapidAPI subscriptions for SERP data

### In Progress
- [ ] Task 1.1: Create project directory structure
- [ ] Task 1.2: Initialize TypeScript + dependencies
- [ ] Task 1.3: Set up CLI structure with Commander.js

## ✅ Success Metrics Dashboard

| Metric | Status | Target | Current |
|--------|--------|--------|---------|
| Data Quality | ⏳ | Every ad group maps to landing page | Not Started |
| Brand Compliance | ⏳ | Headlines contain "Chrome Extension" | Not Started |  
| Data Transparency | ⏳ | Keywords.csv shows data sources | Not Started |
| SERP Intelligence | ⏳ | Blockers populated for sampled terms | Not Started |
| Quota Management | ⏳ | ≤30 SERP calls per run | Not Started |
| Claims Validation | ⏳ | Only accurate claims per format | Not Started |

## 📁 Document Index

### Core Documentation
- [Implementation Plan](docs/seo-ads-expert-implementation-plan.md) - Complete technical roadmap
- [GPT-5 Feedback](docs/gpt-feedback-1.md) - Expert review and optimizations

### Key Features
- **Data Precedence System**: KWP CSV > GSC proxy > RapidAPI estimated
- **Enhanced Scoring**: Intent detection + source penalties + SERP blockers
- **Pre-seeded Negatives**: Product-specific negative keywords included
- **Quota Management**: ≤30 SERP calls per run with 24h caching
- **Landing Page Alignment**: Every cluster maps to exactly one page

## 🛠 Technical Stack

**Platform**: Node.js CLI Tool (Phase 1) → MCP Server (Phase 2)  
**Core Technologies**:
- TypeScript + Node.js
- Commander.js (CLI)
- CSV parsing (csv-parse/csv-stringify)
- RapidAPI integrations
- Google Search Console API

**Build Tools**:
- tsx (TypeScript execution)
- Vitest (Testing)
- Pino (Logging)

## 📋 Features

### V1 Features (CLI Tool)
1. **CSV-First Approach**: Import Keyword Planner CSVs for authoritative data
2. **Data Precedence System**: Smart fallback (KWP > GSC > RapidAPI)
3. **Enhanced Scoring**: Chrome extension intent boost + source penalties
4. **Complete Output Suite**: keywords.csv, ads.json, seo_pages.md, competitors.md, negatives.txt

### V2 Upgrade Path
- Official Google Ads API integration
- MCP Server for seamless Claude Code chat integration  
- Landing page auto-generation
- Performance tracking with Google Analytics

### Revenue Model
- **Type**: Infrastructure Tool (Internal Use)
- **Value**: Transforms 3-hour manual process into 30-second automated workflow
- **ROI**: 360x efficiency gain across all Little Bear Apps extensions

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# All tests
npm test

# Test with sample data
npm run plan -- --product convertmyfile --markets AU,US --dry-run
```

## 📦 Deployment

### Phase 1: CLI Tool
- [ ] Environment variables configured
- [ ] Google Ads account in Expert Mode
- [ ] Keyword Planner CSV exports ready
- [ ] RapidAPI subscriptions active
- [ ] Search Console service account added

### Phase 2: MCP Integration
- [ ] MCP server configuration
- [ ] Integration with existing Zen MCP setup
- [ ] Claude Code tool registration
- [ ] Chat-based workflow testing

## 🔗 Quick Links

**Internal Resources**:
- [Implementation Plan](docs/seo-ads-expert-implementation-plan.md) - Technical roadmap
- [CLAUDE.md](CLAUDE.md) - AI Context for Claude Code
- [.claude-context](.claude-context) - Session continuity

**External Resources**:
- [Google Ads API Documentation](https://developers.google.com/google-ads/api)
- [Search Console API](https://developers.google.com/webmaster-tools/search-console-api)
- [RapidAPI Real-Time Web Search](https://rapidapi.com/contextualwebsearch/api/web-search)

**Little Bear Apps Resources**:
- [ConvertMyFile Extension](https://littlebearapps.com/extensions/chrome/convertmyfile)
- [PaletteKit Extension](https://littlebearapps.com/extensions/chrome/palettekit)  
- [NoteBridge Extension](https://littlebearapps.com/extensions/chrome/notebridge)

## 🎯 GPT-5 Immediate Action Items

1. **Create Google Ads Account** (Expert Mode, no campaigns)
2. **Export Keyword Planner CSVs** for ConvertMyFile (AU/US/GB markets)  
3. **Set up RapidAPI subscriptions** (Real-Time Web Search + Keyword Insight)
4. **Link Search Console ↔ Ads** for future Paid/Organic integration
5. **Create `/inputs/kwp_csv/convertmyfile/` directory structure**

## 📝 License

© 2025 Little Bear Apps. All rights reserved.

---

**Last Updated**: 2025-09-03  
**Maintainer**: Nathan @ Little Bear Apps  
**Repository**: github.com/littlebearapps/seo-ads-expert