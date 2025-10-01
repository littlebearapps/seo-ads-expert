# SEO & Google Ads Expert Tool - AI Context

## 🎯 Project Overview

**What**: SEO & Google Ads Expert Tool - Intelligent marketing automation system with budget optimization
**Platform**: Node.js CLI Tool with Thompson Sampling engine and comprehensive SEO intelligence
**Revenue Model**: Internal Infrastructure Tool (3+ hours manual → 11 seconds automated)

**Current Version**: v2.0 INTELLIGENT BUDGET OPTIMIZER ✅
- **Thompson Sampling Engine**: Bayesian optimization for budget allocation (Beta-Binomial CVR + Gamma value)
- **Safe Write Operations**: Comprehensive guardrails, validation, rollback, audit logging
- **Technical SEO**: Internal crawler, XML sitemaps, GSC indexation, robots.txt audit, IndexNow integration
- **A/B Testing**: Statistical framework with Google Ads/Analytics integration
- **Alert System**: 8 detectors + 7 automated remediation playbooks
- **Content Intelligence**: Entity coverage, schema generation, content planning, link optimization
- **Cross-Platform**: Microsoft Ads integration and store optimization

**Test Status**: 920/1,005 passing (91.5%) | See `docs/TESTS.md` for details
**API Integrations**: Google Search Console, Analytics, Ads, RapidAPI (SERP + Keywords)

## 🎯 NEXT TASK (IMPORTANT - 2025-09-30)

**🚀 START HERE**: `EXECUTION_START_HERE.md` ⭐

**What**: Execute comprehensive test remediation plan (181 failing tests → 100% pass rate)

**Why**: All test failures have been forensically analyzed, validated by GPT-5 (two rounds), and mapped to 8-phase execution plan with 12 surgical adjustments applied.

**Quick Start for New Claude Code Session**:
1. Read `EXECUTION_START_HERE.md` (5 minutes) - Your complete execution guide
2. Review `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` (main plan) - 2,100 lines, all fixes detailed with code examples
3. Start Phase 0: Shared Utilities (1.5 hours) - Build infrastructure (date-adapter, time-source, test fixtures)
4. Execute Phases 1-7 systematically (50-60 hours total) - Follow quality gates after each phase

**All Documents Ready for Execution**:
- ✅ `EXECUTION_START_HERE.md` - Quick start guide with first steps and success criteria
- ✅ `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` - Complete 8-phase plan (GPT-5 validated, all adjustments applied)
- ✅ `docs/GPT5_VALIDATION_SUMMARY.md` - Full GPT-5 validation record with strategic insights
- ✅ `docs/GPT5_SURGICAL_ADJUSTMENTS_CHECKLIST.md` - All 12 GPT-5 adjustments tracked and applied

**Estimated Time**: 50-60 hours (7-10 working days)
**Current Test Status** (2025-10-01):
- Total: 1,005 tests across 63 test files
- Passing: 920 tests (91.5%) | 46 test files passing
- Failing: 80 tests (8.0%) | 17 test files failing
- v2.0 Core: All critical systems 100% ✅ Production-ready
**Target**: 1,005/1,005 passing (100%)

## 📊 Test Documentation

**Primary Source**: `docs/TESTS.md` - Comprehensive test suite catalog

**What it contains**:
- All 63 test files organized by category (V2.0 Thompson Sampling, A/B Testing, Technical SEO, etc.)
- Pass/fail status for each test suite with test counts
- Failure analysis with issues and priorities linked to remediation phases
- Test execution instructions and performance metrics
- Mock systems, helpers, and infrastructure details

**Why it exists**:
- Single source of truth for all test information (previously scattered across CLAUDE.md and .claude-context)
- Easier to maintain and update as tests change
- Provides high-level view of test coverage by feature area

**When to update**:
- ✅ After completing any remediation phase (update pass/fail counts)
- ✅ After fixing test failures (move from "Failing" to "Passing" section)
- ✅ When adding new test suites (document in appropriate category)
- ✅ After major test infrastructure changes

**Quick Status Check**: Run `npm test -- --run` to get current test counts, then update TESTS.md accordingly

## 🔧 Technical Stack

**APIs Integrated** ✅:
- **Google Search Console**: ✅ Connected via unified OAuth (sc-domain:littlebearapps.com)
- **Google Analytics**: ✅ Connected with property ID 497547311 (littlebearapps.com)
- **Google Ads**: ✅ Connected with customer ID 9495806872 and developer token
- **RapidAPI Real-Time Web Search**: ✅ SERP analysis (upgraded to 20,000 calls/month)
- **RapidAPI Keyword Insight**: ✅ Keyword expansion (upgraded to 2,000 calls/day)
- **CSV Import**: ✅ Ready for Google Keyword Planner exports

**Dependencies** (GPT-5 Optimized):
- axios zod commander pino csv-parse csv-stringify date-fns googleapis
- typescript tsx @types/node vitest (dev)

**Performance Achieved** ✅:
- **Processing**: 11 seconds per plan generation (full end-to-end)
- **File Generation**: 8 professional marketing files created
- **API Efficiency**: 3-10 SERP calls per run (smart quota management)
- **Keywords**: 10-200 terms per product (multi-source expansion)
- **Cache**: 1-week TTL with intelligent precedence system
- **Success Rate**: 100% functional across all command types

## 📂 Key Files

```
/Users/.../lba/infrastructure/tools/seo-ads-expert/
├── src/
│   ├── cli.ts                    # Commander.js CLI interface
│   ├── orchestrator.ts           # Core planning logic with data precedence
│   ├── connectors/
│   │   ├── kwp-csv.ts           # Keyword Planner CSV ingestion
│   │   ├── rapid-serp.ts        # RapidAPI SERP analysis
│   │   ├── search-console.ts    # GSC Search Analytics (v1.6 enhanced)
│   │   └── google-ads-api.ts    # Google Ads API client with mutations
│   ├── analyzers/
│   │   └── edge-store-analyzer.ts # Edge Add-ons Store optimization engine
│   ├── monitors/
│   │   ├── cross-platform-monitor.ts # Google + Microsoft Ads performance analysis
│   │   ├── mutation-guard.ts    # Mutation validation & guardrails
│   │   ├── budget-enforcer.ts   # Budget limit enforcement
│   │   ├── audit-logger.ts      # Audit trail & compliance logging
│   │   └── compliance-reporter.ts # GDPR/CCPA compliance
│   ├── utils/
│   │   └── rate-limiter.ts      # Rate limiting for API calls
│   ├── alerts/                  # v1.7 Alert Detection System
│   │   ├── alert-manager.ts    # Core alert management
│   │   ├── detector-engine.ts  # Base detector class
│   │   └── detectors/          # 8 specialized detectors
│   ├── experiments/            # v1.5 A/B Testing Framework
│   │   ├── experiment-manager.ts # Experiment lifecycle
│   │   ├── statistical-analyzer.ts # Statistical analysis
│   │   └── alert-integration.ts # Alert-experiment bridge
│   ├── playbooks/              # v1.7 Remediation Playbooks
│   │   └── strategies/         # 7 automated playbooks
│   ├── scoring.ts              # Enhanced scoring with source penalties
│   ├── entity/                 # v1.8 Entity Coverage System
│   │   └── entity-auditor.ts  # Entity extraction and analysis
│   ├── schema/                 # v1.8 Schema Generation
│   │   ├── types.ts           # Schema type definitions
│   │   ├── schema-generator.ts # Schema generation engine
│   │   ├── schema-validator.ts # Schema validation
│   │   └── templates/         # 5 JSON-LD templates
│   ├── content/                # v1.8 Content Intelligence
│   │   ├── content-planner.ts # Gap analysis and roadmap
│   │   ├── faq-extractor.ts   # FAQ extraction system
│   │   └── link-optimizer.ts  # Link opportunity detection
│   ├── v18-integration.ts      # v1.8 orchestration module
│   └── writers/
│       ├── csv.ts              # CSV output generators
│       ├── microsoft-ads-csv.ts # Microsoft Ads bulk import CSV
│       ├── edge-store-audit-writer.ts # Store optimization reports
│       ├── experiment-report-writer.ts # v1.5 Experiment reports
│       └── mutation-applier.ts # Safe write operations
├── tests/                       # 100% test coverage
│   ├── test-google-ads-api.ts  # API integration tests
│   ├── integration-workflows.test.ts # Cross-component tests
│   └── error-scenarios.test.ts # Edge cases & error handling
├── inputs/kwp_csv/             # Keyword Planner CSV exports
├── cache/                      # 7-day TTL API response cache
├── audit/                      # Audit logs (90-day retention)
└── plans/[product]/[date]/     # Generated marketing plans
```

## 🎯 Production Status

**All Systems Operational** ✅
- Marketing automation (11s plan generation, 8 professional file types)
- Multi-source intelligence (KWP CSV > GSC > RapidAPI with smart precedence)
- Performance analysis (waste detection, quality scoring, gap analysis)
- Real-time monitoring (cost tracking, usage quotas, budget controls)
- Safe write operations (guardrails, validation, rollback, audit trails)

**See** `.claude-context` for session history and recent changes

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
- ✅ Google Search Console: Connected via unified OAuth (sc-domain:littlebearapps.com)
- ✅ Google Analytics: Connected with GA4 property 497547311
- ✅ Google Ads: Connected with customer ID 9495806872 and developer token
- ✅ RapidAPI Real-Time Web Search: Upgraded to 20K calls/month
- ✅ RapidAPI Keyword Insight: Upgraded to 2K calls/day

## 🎯 Success Metrics - ACHIEVED ✅

**Technical** ✅: All 5 APIs integrated, unified OAuth working, 11s end-to-end generation
**Quality** ✅: 8 professional marketing files, comprehensive competitor analysis
**Business** ✅: 3+ hour manual workflow → 11-second automation (1000x+ efficiency achieved)
**Functionality** ✅: Plan generation, performance analysis, monitoring, history management all working

## ✅ Risk Mitigation - COMPLETED

**✅ Google API Integration**: Unified OAuth authentication for all 3 Google APIs
**✅ RapidAPI Quota Management**: Upgraded tiers with intelligent rate limiting
**✅ Cost Control**: Real-time monitoring + budget controls + intelligent caching

## 💡 Key Decisions

- **Unified OAuth Strategy**: Single authentication flow for all Google APIs vs mixed approaches
- **Data Precedence System**: Multi-source intelligence with smart fallback logic
- **Upgraded RapidAPI**: Production-ready quotas for enterprise-level keyword research
- **Complete System**: End-to-end functionality vs incremental feature releases

## 📝 Important Context Files

- **Session State**: `.claude-context` - Current work, recent changes, session history
- **Test Documentation**: `docs/TESTS.md` - Complete test suite catalog and status
- **Execution Guide**: `EXECUTION_START_HERE.md` - Test remediation roadmap
- **Implementation Plan**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` - Detailed 8-phase plan

---

## 🔐 Authentication Strategy

**Current Setup**: Application Default Credentials (ADC) + OAuth2
- **ADC via gcloud**: Secure, short-lived tokens, no JSON files to manage
- **OAuth2 Refresh Token**: For Google Ads, Analytics, Search Console APIs
- **Why not service account JSON**: Security risk (long-lived keys), can be leaked
- **Setup**: `gcloud auth application-default login` for ADC refresh



---

## 📁 Git Repository Configuration

**Git Directory**: `/Users/nathanschram/GitHub/seo-ads-expert.git`
- Main repository moved from GitMeta to GitHub folder (2025-09-29)
- Worktrees configured at `.worktrees/dev/` and `.worktrees/test/`
- Remote: `https://github.com/littlebearapps/seo-ads-expert.git`

---

**Token Count**: ~680 (Optimized for Claude Code best practices)
**Last Updated**: 2025-10-01
**Version**: 2.0 - INTELLIGENT BUDGET OPTIMIZER TESTS COMPLETE ✅
**Optimization**: Reduced from 359 to 246 lines (31% reduction) by removing redundancies