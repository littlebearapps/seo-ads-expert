# SEO & Google Ads Expert Tool - AI Context

## 🎯 Core Info

**MVP Features** (V1 CLI):
1. CSV-First Keyword Planning - Import Google Keyword Planner exports for authoritative data
2. Data Precedence System - Smart fallback (KWP CSV > GSC proxy > RapidAPI estimated) 
3. Enhanced Scoring & Clustering - Chrome extension intent boost + source penalties + SERP blockers

**Revenue Model**: Internal Infrastructure Tool (Transforms 3-hour manual process into 30-second automation)  
**Timeline**: 2 weeks (Ship by 2025-09-17)  
**Platform**: Node.js CLI Tool → MCP Server  
**Status**: Phase 1 - Project Setup & Dependencies

## 🔧 Technical Stack

**APIs Required**:
- Google Search Console: Search Analytics API for organic performance data
- RapidAPI Real-Time Web Search: SERP analysis and competitor intelligence  
- RapidAPI Keyword Insight: Keyword expansion and volume estimates
- CSV Import: Google Keyword Planner exports (authoritative volume/CPC data)

**Dependencies** (GPT-5 Optimized):
- axios zod commander pino csv-parse csv-stringify date-fns googleapis
- typescript tsx @types/node vitest (dev)

**Performance Targets**:
- Processing: <30 seconds per plan generation
- SERP Calls: ≤30 per run (quota-managed with 24h caching)
- Keywords: 150-200 relevant terms per product
- Cache Hit Ratio: >80% on subsequent runs

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

## 🚧 Current Focus

**Active Task**: Task 1.1 - Project Setup & Dependencies  
**Blocking Issue**: Need Google Ads account setup + RapidAPI subscriptions  
**Next Milestone**: Complete Phase 1 setup by 2025-09-05

## ⚠️ Critical Requirements

**Data Precedence (GPT-5 Innovation)**:
- [ ] KWP CSV precedence (authoritative when available)
- [ ] GSC proxy fallback (real but rough click/impression data)
- [ ] RapidAPI estimated fallback (marked as estimated)
- [ ] Source tracking in all outputs (kwp|gsc|estimated)

**Business Constraints**:
- Ship V1 CLI in 2 weeks max
- ≤30 SERP calls per run (quota management)
- Every ad group maps to landing page
- Pre-seeded negatives by product

## 🔗 Integration Points

**Little Bear Apps Systems**:
- ConvertMyFile: Ready for keyword planning
- PaletteKit: Ready for keyword planning  
- NoteBridge: Ready for keyword planning

**External APIs**:
- RapidAPI Real-Time Web Search: Not Started
- RapidAPI Keyword Insight: Not Started
- Google Search Console: Not Started

## 📊 Success Metrics

**Technical**: All acceptance criteria pass, ≤30 SERP calls per run  
**Quality**: Every ad group maps to landing page, headlines contain "Chrome Extension"  
**Business**: Transform manual 3-hour workflow into 30-second automation (360x efficiency)

## 🚨 Risks & Mitigations

**Primary Risk**: Google Ads API approval delays for official integration  
**Mitigation**: CSV-first approach allows immediate shipping with manual exports

**Secondary Risk**: RapidAPI quota/cost management for SERP data  
**Mitigation**: Aggressive 24h caching + ≤30 calls per run hard limit

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

**V1 Acceptance Criteria**:
- Every ad group maps to landing page
- Headlines contain pinned "Chrome Extension" + benefit
- Keywords.csv shows data source per metric
- SERP blockers populated, competitors listed
- ≤30 SERP calls reported in summary.json
- Claims validation (only accurate per format)

**Context Files**:
- See `.claude-context` for session continuity
- Check `docs/seo-ads-expert-implementation-plan.md` for complete roadmap
- Review `docs/gpt-feedback-1.md` for expert optimizations

---

**Token Count**: ~500 (Optimized for Claude Code)  
**Last Updated**: 2025-09-03  
**Version**: 0.1