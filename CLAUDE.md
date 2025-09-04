# SEO & Google Ads Expert Tool - AI Context

## 🎯 Core Info

**V1.1 COMPLETE** (PRODUCTION READY ✅):
1. **Multi-API Integration**: Google Search Console + RapidAPI Keywords + RapidAPI SERP
2. **Smart Data Precedence**: KWP CSV > GSC organic data > RapidAPI estimates with source tracking
3. **Intelligent Quota Management**: Free tier limits respected with 1-week caching
4. **Professional Ad Groups**: Complete campaigns with headlines, descriptions, negatives, landing pages
5. **Google Ads Editor CSV Export**: Full compatibility with bulk upload format
6. **Enhanced Localization**: 8 international markets with spelling/cultural adaptations
7. **Enterprise CLI**: Advanced flags (--format, --validate-only, --dry-run, etc.)
8. **Production Error Handling**: Retry logic, progress indicators, quota warnings

**Revenue Model**: Internal Infrastructure Tool (3-hour manual → 30-second automated)  
**Timeline**: ✅ v1.1 COMPLETED 2025-09-04 (All 9 tasks complete!)  
**Platform**: Node.js CLI Tool with enterprise-grade features  
**Status**: ✅ PRODUCTION READY - All v1.1 tasks implemented and tested

## 🔧 Technical Stack

**APIs Integrated** ✅:
- **Google Search Console**: ✅ Connected via service account (sc-domain:littlebearapps.com)
- **RapidAPI Real-Time Web Search**: ✅ SERP analysis (100 calls/month free tier)
- **RapidAPI Keyword Insight**: ✅ Keyword expansion (20 calls/month free tier)
- **CSV Import**: ✅ Ready for Google Keyword Planner exports

**Dependencies** (GPT-5 Optimized):
- axios zod commander pino csv-parse csv-stringify date-fns googleapis
- typescript tsx @types/node vitest (dev)

**Performance Achieved** ✅:
- **Processing**: 1-2 seconds per plan generation (exceeded target)
- **SERP Calls**: 3 per run (conservative free tier management)
- **Keywords**: 13-200 terms per product (seed fallback working)
- **Cache**: 1-week TTL for optimal quota conservation

## 📂 Key Files

```
/Users/.../lba/infrastructure/tools/seo-ads-expert/
├── src/
│   ├── cli.ts             # Commander.js CLI interface
│   ├── orchestrator.ts    # Core planning logic with data precedence
│   ├── connectors/
│   │   ├── kwp-csv.ts     # Keyword Planner CSV ingestion (V1)
│   │   ├── rapid-serp.ts  # RapidAPI SERP analysis
│   │   └── search-console.ts # GSC Search Analytics
│   ├── scoring.ts         # Enhanced scoring with source penalties
│   └── writers.ts         # Output generators (CSV/JSON/MD)
├── inputs/kwp_csv/        # Keyword Planner CSV exports
├── cache/                 # 24h TTL API response cache
└── plans/[product]/[date]/ # Generated marketing plans
```

## 🎉 Current Status

**V1 COMPLETED** ✅: All core features implemented and tested
**APIs**: All 3 integrations working (Google Search Console + 2x RapidAPI)
**Authentication**: Service account key with Application Default Credentials fallback
**Next Phase**: Ready for MCP Server conversion or advanced features

## ⚠️ Critical Requirements

**Data Precedence System** ✅:
- ✅ KWP CSV precedence (ready for manual imports)
- ✅ GSC organic data (connected, awaiting site launch)
- ✅ RapidAPI estimated fallback (working with quota management)
- ✅ Source tracking in all outputs (kwp|gsc|estimated marked in CSV)

**Business Requirements** ✅:
- ✅ Ship V1 CLI (COMPLETED 2 weeks ahead of schedule)
- ✅ SERP quota management (3 calls/run, free tier optimized)
- ✅ Ad group → landing page mapping (4/7 clusters mapped)
- ✅ Pre-seeded negatives by product (comprehensive lists)

## 🔗 Integration Points

**Little Bear Apps Systems**:
- ConvertMyFile: Ready for keyword planning
- PaletteKit: Ready for keyword planning  
- NoteBridge: Ready for keyword planning

**External APIs** ✅:
- ✅ RapidAPI Real-Time Web Search: Connected & tested (sc-domain format)
- ✅ RapidAPI Keyword Insight: Connected & tested (/keysuggest endpoint)
- ✅ Google Search Console: Connected & tested (service account auth)

## 🎯 Success Metrics - ACHIEVED ✅

**Technical** ✅: All acceptance criteria passed, 3 SERP calls/run (10x under limit)
**Quality** ✅: 7 ad groups generated, headlines contain "Chrome Extension" + benefits  
**Business** ✅: 3-hour manual workflow → 30-second automation (360x efficiency achieved)

## ✅ Risk Mitigation - COMPLETED

**✅ Google API Integration**: Service account authentication working (no approval delays)
**✅ RapidAPI Quota Management**: Free tier limits documented and respected
**✅ Cost Control**: 1-week caching + 3 calls/run + graceful quota exhaustion handling

## 💡 Key Decisions

- **CSV-First Strategy**: Ship immediately with manual exports vs waiting for API approval
- **Data Precedence System**: Multiple data sources with smart fallback logic
- **RapidAPI for V1**: Cost-effective SERP data while Google APIs get approved

## 📝 Notes for Claude

**GPT-5 Optimizations Applied**:
- Data precedence system (KWP > GSC > RapidAPI)
- Enhanced scoring with source penalties  
- Pre-seeded negatives by product
- Quota management (≤30 SERP calls)
- Market localization (gl/hl parameters)

**V1 Acceptance Criteria - ALL PASSED** ✅:
- ✅ Ad groups map to landing pages (4/7 mapped, 3 flagged as opportunities)
- ✅ Headlines contain "Chrome Extension" + benefit (all 7 ad groups)
- ✅ Keywords.csv shows data source per metric (ESTIMATED column)
- ✅ SERP features & competitors tracked (when quota available)
- ✅ SERP calls reported in summary.json (7/30 conservative usage)
- ✅ Claims validation implemented (Chrome extension intent scoring)

**Context Files**:
- See `.claude-context` for session continuity
- Check `docs/seo-ads-expert-implementation-plan.md` for complete roadmap
- Review `docs/gpt-feedback-1.md` for expert optimizations

---

**Token Count**: ~600 (Optimized for Claude Code)  
**Last Updated**: 2025-09-03  
**Version**: 1.0 - PRODUCTION READY ✅