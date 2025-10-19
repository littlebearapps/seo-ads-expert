# CLAUDE.md - SEO & Google Ads Expert Tool

**Language:** Australian English
**Scope:** Working directory instructions for SEO & Google Ads Expert within Claude Code Tools.
**This file extends the global rules defined in the root `CLAUDE.md`.**

---

## 1. Quick Facts
- **Project:** SEO & Google Ads Expert Tool v2.0
- **Language/Runtime:** Node.js (Node 20), TypeScript
- **Package Manager:** npm
- **Entrypoints:** `src/cli.ts`, `src/orchestrator.ts`
- **Purpose:** Intelligent marketing automation with Thompson Sampling budget optimization
- **Version:** v2.0 INTELLIGENT BUDGET OPTIMIZER ✅
- **Test Status:** 920/1,005 passing (91.5%) | See `docs/TESTS.md` for details

---

## 2. Install / Run / Test
- Install: `npm install`
- Run: `npm run cli -- generate <product>`
- Test: `npm test` (Vitest, 1,005 tests)
- Lint: `npm run lint` (if configured)
- Build: `npm run build` (if applicable)

---

## 3. Code Style & Conventions
- Follow house style defined in root `CLAUDE.md`
- TypeScript with strict typing
- Commander.js CLI interface
- Zod schemas for validation
- Australian English spelling throughout
- Production code methods (no raw SQL queries)

---

## 4. Git Workflow
- Never commit directly to `main`
- Create branch: `feature/<short-slug>` or `fix/<short-slug>` or `chore/<short-slug>`
- Keep PRs focused and testable
- All PRs require passing tests before merge
- Auto-delete merged branches enabled
- Use git-workflow-manager subagent for automated PR workflow

---

## 5. Repository Map (key paths)

| Path | Description |
|:--|:--|
| **Root Configuration** | |
| `package.json` | Node.js dependencies and scripts |
| `tsconfig.json` | TypeScript compiler configuration |
| `vitest.config.ts` | Test framework configuration |
| `.envrc` | direnv configuration for Keychain secrets |
| `.mcp.json` → `.mcp.lean.json` | MCP server configuration (profile-based) |
| **Documentation** | |
| `EXECUTION_START_HERE.md` | Test remediation roadmap (START HERE) |
| `AGENTS.md` | AI agent coordination (directs Codex to read CLAUDE.md) |
| `README.md` | Project overview and setup guide |
| `docs/TESTS.md` | Complete test suite catalog (63 test files) |
| `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` | 8-phase test remediation plan (GPT-5 validated) |
| `docs/GPT5_VALIDATION_SUMMARY.md` | GPT-5 validation record with strategic insights |
| `docs/GPT5_SURGICAL_ADJUSTMENTS_CHECKLIST.md` | 12 GPT-5 adjustments tracked and applied |
| `docs/API_REFERENCE.md` | API integration documentation |
| `docs/ARCHITECTURE.md` | System architecture overview |
| `docs/google-ads-api-setup.md` | Google Ads API setup guide |
| **Source Code** | |
| `src/cli.ts` | Commander.js CLI interface |
| `src/orchestrator.ts` | Core planning logic with data precedence |
| `src/connectors/` | API clients (KWP CSV, RapidAPI, GSC, Google Ads) |
| `src/analyzers/` | Edge Store analyzer |
| `src/monitors/` | Cross-platform monitor, mutation guard, budget enforcer |
| `src/alerts/` | Alert detection system (8 detectors) |
| `src/experiments/` | A/B testing framework |
| `src/playbooks/` | Remediation playbooks (7 strategies) |
| `src/entity/` | Entity coverage system |
| `src/schema/` | Schema generation (5 JSON-LD templates) |
| `src/content/` | Content intelligence (planner, FAQ, links) |
| `src/writers/` | CSV generators, mutation applier |
| `src/scoring.ts` | Enhanced scoring with source penalties |
| `src/v18-integration.ts` | v1.8 orchestration module |
| **Testing** | |
| `tests/` | Test suites (1,005 tests across 63 files) |
| `tests/v2-thompson-sampling/` | v2.0 Thompson Sampling tests |
| `tests/ab-testing/` | A/B testing framework tests |
| `tests/technical-seo/` | SEO crawling and indexation tests |
| **Scripts & Automation** | |
| `scripts/phase-2/verify.sh` | Comprehensive pre-PR verification |
| `.git-hooks/` | Git hooks (pre-commit, pre-push, prepare-commit-msg) |
| **Data Directories** | |
| `inputs/kwp_csv/` | Keyword Planner CSV exports |
| `plans/[product]/[date]/` | Generated marketing plans |
| `audit/` | Audit logs (90-day retention) |
| `cache/` | 7-day TTL API response cache |
| `serp-snapshots/` | SERP monitoring snapshots |

---

## 6. Claude-Code-Tools Index (reference pointers)

⭐ START HERE: ~/claude-code-tools/docs/QUICK-REFERENCE.md
- Comprehensive quick reference for ALL Claude Code workflows and enhancements
- Common workflows (features, shipping, testing), key file locations, MCP profiles
- Git workflow, commit formats, secrets management, backups, cache monitoring
- Zen MCP system, enhancement initiatives, safety rules

**Global Infrastructure** (all paths relative to `~/claude-code-tools/`):
- **MCP servers:** `mcp/` (zen instances, profiles, troubleshooting)
  - **Configuration**: `.mcp.json` (profile-based: lean/research/full)
  - **Troubleshooting**: `mcp/MCP_TROUBLESHOOTING.md`
  - **Profiles**: `mcp/profiles/` (token optimization system)
  - **Zen instances**: `mcp/zen/instances/instB/` (this project's dedicated instance)
- **Subagents:** `subagents/` (git-workflow-manager, multi-project-tester, microtool-creator)
  - **git-workflow-manager**: `subagents/git-workflow-manager/` (v0.2.0 - automated PR workflow)
  - **multi-project-tester**: `subagents/multi-project-tester/` (cross-project testing)
  - **microtool-creator**: `subagents/microtool-creator/` (project scaffolding)
- **Backups:** `backups/` (automated S3 backups, keychain backups)
  - **Keychain backups**: Hourly age-encrypted backups to UpCloud S3
  - **Restic snapshots**: Hourly repository snapshots
  - **Documentation**: `backups/QUICK-REFERENCE.md`, `backups/README.md`
- **Keychain:** `keychain/` (secrets management, quick reference)
  - **Quick reference**: `keychain/KEYCHAIN-QUICK-REFERENCE.md`
  - **Inventory**: `keychain/secrets-inventory.md`
  - **Test suite**: `keychain/test-keychain.sh`
- **Monitoring:** `monitoring/` (cache health, backup monitoring)
  - **Cache health**: `monitoring/cache-health.sh` (weekly automated checks)
  - **Usage tracking**: Claude Code usage and API cost monitoring
- **Session Hooks:** `.claude-session-start.sh` (automated startup validation, if applicable)
- **Templates:** `templates/` (ignore fragments, project templates)
  - **Gitignore fragments**: `templates/gitignore-fragments/`
  - **Project templates**: `templates/project-templates/`
- **Documentation:** `docs/` (standards, ADRs, guides)
  - **Standards**: `docs/standards/` (commit standards, PR templates, gitignore standards)
  - **ADRs**: Architecture Decision Records
  - **MCP docs**: `docs/mcp/` (profile system, phase findings)

---

## 7. Online / Offline Behaviour
- **Offline:** Default mode for testing
- **Online:** Required for API calls (Google Search Console, Analytics, Ads, RapidAPI)
  - **Codex:** Allowed domains, GET/HEAD/OPTIONS only, include citations
  - **Claude:** MCP access permitted (brave-search, context7, linear), cite sources

---

## 8. Known Quirks & Risks

**API Integrations:**
- **Google Search Console**: Connected via unified OAuth (sc-domain:littlebearapps.com)
- **Google Analytics**: Connected with property ID 497547311
- **Google Ads**: Connected with customer ID 9495806872
- **RapidAPI SERP**: Upgraded to 20,000 calls/month
- **RapidAPI Keyword Insight**: Upgraded to 2,000 calls/day

**Technical Details:**
- **Authentication**: Application Default Credentials (ADC) + OAuth2 refresh token
- **Rate Limiting**: Intelligent rate limiter for API calls
- **Cost Control**: Real-time monitoring, budget controls, 7-day cache TTL
- **Data Precedence**: KWP CSV > GSC > RapidAPI (estimated fallback)
- **Source Tracking**: All outputs marked with source (kwp|gsc|estimated)

**Testing:**
- **Test Status**: 920/1,005 passing (91.5%)
- **Failing**: 80 tests (8.0%) across 17 test files
- **v2.0 Core**: All critical systems 100% ✅ Production-ready
- **Remediation Plan**: See `EXECUTION_START_HERE.md` and `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md`

**Performance:**
- **Processing**: 11 seconds per plan generation (full end-to-end)
- **File Generation**: 8 professional marketing files created
- **API Efficiency**: 3-10 SERP calls per run (smart quota management)
- **Keywords**: 10-200 terms per product (multi-source expansion)

---

## 9. Delegation & Authority
> For global context (MCP configs, shared subagents, backups, or templates), read the root `/Claude-Code-Tools/CLAUDE.md`.
> For strict safety rules, see this directory's `AGENTS.md`.
> This `CLAUDE.md` governs all day-to-day behaviour inside this working directory.
> **IMPORTANT**: Read `EXECUTION_START_HERE.md` for test remediation plan (START HERE).

---

## 📖 Global Instructions

**⚠️ IMPORTANT**: Before working in this project, review these critical files:

1. **`/Users/nathanschram/claude-code-tools/.claude-instructions`** - Global development standards
   - File management principles
   - Documentation usage hierarchy
   - Git worktree workflow
   - MCP server configuration
   - Environment variable handling
   - Commit conventions

2. **`EXECUTION_START_HERE.md`** - Test remediation roadmap ⭐ **START HERE**
   - Quick start guide with first steps and success criteria
   - 8-phase execution plan (GPT-5 validated)
   - All adjustments documented and applied
   - Estimated time: 50-60 hours (7-10 working days)
   - Target: 1,005/1,005 passing (100%)

---

## 🎯 NEXT TASK (IMPORTANT - 2025-09-30)

**🚀 START HERE**: `EXECUTION_START_HERE.md` ⭐

**What**: Execute comprehensive test remediation plan (80 failing tests → 100% pass rate)

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

---

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

---

## 🚨 CRITICAL: LOCAL DEVELOPMENT ONLY

**⚠️ ALL CLAUDE CODE WORK MUST BE DONE IN LOCAL `~/claude-code-tools/`**

- ✅ **Use**: `/Users/nathanschram/claude-code-tools/lba/infrastructure/tools/seo-ads-expert/` (LOCAL)
- ❌ **Do NOT use**: `/Users/nathanschram/Library/Mobile Documents/com~apple~CloudDocs/claude-code-tools/` (iCloud)
- **iCloud directory is for reference only** - never work in it unless explicitly directed

---

## 🗄️ Git Worktree Setup

**Working Directory Structure**:
```
~/claude-code-tools/lba/infrastructure/tools/seo-ads-expert/
├── .bare/              # Bare git repository (hidden)
├── main/               # ← YOU ARE HERE (production branch)
│   ├── .mcp.json      # MCP server configuration
│   └── [project files]
└── dev/                # Development worktree (dev branch)
    ├── .mcp.json      # MCP server configuration
    └── [project files]
```

**Current Worktree**: `/main/` (production branch - main)
**Sibling Worktree**: `/dev/` (development branch - dev)
**Shared Repository**: `/.bare/` (all git data stored here)

**Important**:
- Each worktree is completely independent
- Commits in `/main/` stay on main branch
- Commits in `/dev/` stay on dev branch
- Both worktrees share the same `.bare/` repository
- Remote: `github.com/littlebearapps/seo-ads-expert` (private)

---

## 🤖 MCP Server Configuration

**This working directory has `.mcp.json` configured with**:

**Zen MCP** (Dedicated Instance):
- **Instance**: Zen Proj B (instB)
- **Port**: 7512
- **Instance Path**: `~/claude-code-tools/mcp/zen/instances/instB/`
- **Zen Server**: `~/claude-code-tools/mcp/zen/zen-mcp-server/zen-mcp-server`
- **Model**: GPT-5 only (cost control)
- **Budget**: $2.50/day, 60 calls/minute rate limit

**Shared MCP Servers** (via npx):
- **brave-search**: Web search functionality (API key in .mcp.json)
- **context7**: Library documentation (API key in .mcp.json)
- **mult-fetch**: Web content fetching (config in .mcp.json)
- **linear-server**: Task management with dual-board access (API key in .mcp.json)
  - **Primary**: "SEO Ads Expert" board (project-specific tasks)
  - **Secondary**: "LBA - Systems & Infrastructure" board (cross-project infrastructure)

**MCP Profile System** (Token Optimization):
- **Current Profile**: lean (zen only, ~3.2k tokens)
- **Available Profiles**: lean, research (zen + brave + context7), full (all 5 servers)
- **Switch Profiles**: `mcp-lean`, `mcp-research`, `mcp-full` (then restart Claude Code)
- **Check Status**: `mcp-status`

**Testing MCP Connection**:
```bash
cd ~/claude-code-tools/lba/infrastructure/tools/seo-ads-expert/main/
claude
# In Claude Code session, run: /mcp
```

**Expected Output**:
- ✅ zen connected (instance: zen-seo-ads-expert)
- (Additional servers if using research/full profile)

**MCP Documentation**:
- **Health Check**: Run `/mcp` in Claude Code to verify server status
- **Troubleshooting**: `~/claude-code-tools/mcp/MCP_TROUBLESHOOTING.md`
- **Configuration Guide**: `~/claude-code-tools/mcp/CLAUDE.md`
- **Profile System**: `~/claude-code-tools/docs/mcp/` (phase findings and implementation)

---

## 🔐 Keychain Secrets Management

**⚠️ IMPORTANT**: All secrets now stored in macOS Keychain (NO .env files!)

**Status**: ✅ Production Ready (5 secrets for this project)

**How It Works**:
- Secrets automatically load via `direnv` when you `cd` into this directory
- Project-specific secrets (SEO Ads Expert + shared MCP credentials) loaded from Keychain
- All secrets encrypted in macOS Keychain (T2/SEP chip hardware protection)
- Zero plaintext .env files in codebase

**This Project Uses**:
- **Shared MCP Secrets**: BRAVE_API_KEY, CONTEXT7_API_KEY, LINEAR_ACCESS_TOKEN, MULT_FETCH_CONFIG
- **Zen Instance B**: OPENAI_API_KEY (instB, port 7512), ZEN_INSTANCE=instB, ZEN_PORT=7512

**Documentation**:
- Quick Reference: `~/claude-code-tools/keychain/KEYCHAIN-QUICK-REFERENCE.md`
- Complete Inventory: `~/claude-code-tools/keychain/secrets-inventory.md`
- Test Suite: `~/claude-code-tools/keychain/test-keychain.sh`

**Common Commands**:
```bash
source ~/bin/kc.sh
kc_list              # View all secrets
kc_get <secret-name> # Get secret value
kc_set <secret-name> # Add/update secret
kc_doctor <secrets>  # Health check
```

---

## 🤖 Claude Code Subagents

**Available Subagents** (invoke via Task tool - no installation needed):

### 1. git-workflow-manager (v0.2.0)
**Use when**: Ready to ship a feature to main branch

```
User: "Use git-workflow-manager to ship this feature"
```

**What it does**: Complete PR workflow (verify → push → PR → CI wait → merge → cleanup)
**Time savings**: 10-15 min → <2 min (>60% automation)

### 2. multi-project-tester
**Use when**: Need to test all 15 working directories at once

```
User: "Use multi-project-tester to run tests across all projects"
```

**What it does**: Runs tests across all projects, aggregates results, reports failures
**Time savings**: 20-30 min → 2-5 min

### 3. microtool-creator
**Use when**: Creating a new Chrome extension, marketing site, or infrastructure tool

```
User: "Use microtool-creator to create a new Chrome extension called 'quick-notes' with MINIMAL pattern"
```

**What it does**: Scaffolds complete project structure (minimal or production-ready)
**Time savings**: 1-2 hours → <10 min

**Documentation**: `~/claude-code-tools/subagents/README.md` (full guide)
**Quick Reference**: `~/claude-code-tools/subagents/git-workflow-manager/QUICK-REFERENCE.md`

---

## 🔄 Git Workflow (Feature-Branch Flow)

**Current Workflow**: Feature branches from main (GitHub Flow)
- Create feature/fix/chore branches as needed
- Work in main worktree, switch branches with git checkout
- Use git-workflow-manager subagent for automated PR workflow

**Branch Types**:
- `feature/*` - New features
- `fix/*` - Bug fixes
- `chore/*` - Maintenance tasks

**Workflow**:
```bash
cd ~/claude-code-tools/lba/infrastructure/tools/seo-ads-expert/main/
git checkout -b feature/my-feature
# Make changes, commit

# Ship feature (automated PR workflow)
User: "Use git-workflow-manager to ship this feature"
# Runs verify.sh, creates PR, waits for CI, merges, cleans up
```

**Manual PR Workflow**:
```bash
git push origin feature/my-feature
gh pr create --base main --head feature/my-feature --fill
gh pr merge --squash
```

---

## 🪝 Git Hooks (Phase 2 Active)

**Pre-commit Hook** (<2s):
- Blocks commits to main branch
- Runs quick lint check (if available)
- Fast checks only (no build/test)
- Bypass with: `git commit --no-verify`

**Pre-push Hook** (<2s):
- Blocks pushes to main branch
- Reminds to run verify.sh if not recent
- Fast validation only

**Prepare-commit-msg Hook**:
- Adds Instance-ID trailer to all commits
- Tracks which instance made each commit
- Auto-skips for merge/squash commits

**Manual Verify Script**:
```bash
# Run before creating PR
bash scripts/phase-2/verify.sh

# Comprehensive checks (30-120s):
# - Lint, typecheck, tests, build
# - All must pass before PR
```

**Multi-Instance Coordination**:
- Hooks coordinate via lock files in `.bare/lba/locks/`
- 10-minute stale lock auto-cleanup
- Instance-ID trailers track which instance made changes
- Verify script uses locking to prevent simultaneous runs

**Bypass (Emergency Only)**:
```bash
git commit --no-verify -m "emergency fix"
git push --no-verify
```

---

## 📂 SEO Ads Expert-Specific Information

### Current Status
- **Version**: v2.0 INTELLIGENT BUDGET OPTIMIZER ✅
- **Test Status**: 920/1,005 passing (91.5%)
- **Performance**: 11 seconds end-to-end plan generation
- **APIs Integrated**: Google Search Console, Analytics, Ads, RapidAPI (SERP + Keywords)

### Core Features (Max 3)
1. **Thompson Sampling Engine** - Bayesian optimization for budget allocation (Beta-Binomial CVR + Gamma value)
2. **Multi-Source Intelligence** - KWP CSV > GSC > RapidAPI with smart precedence and source tracking
3. **Safe Write Operations** - Comprehensive guardrails, validation, rollback, audit logging

### Key Systems
- **Technical SEO**: Internal crawler, XML sitemaps, GSC indexation, robots.txt audit, IndexNow
- **A/B Testing**: Statistical framework with Google Ads/Analytics integration
- **Alert System**: 8 detectors + 7 automated remediation playbooks
- **Content Intelligence**: Entity coverage, schema generation, content planning, link optimization
- **Cross-Platform**: Microsoft Ads integration and store optimization

### API Integrations
- **Google Search Console**: Connected via unified OAuth (sc-domain:littlebearapps.com)
- **Google Analytics**: Connected with property ID 497547311
- **Google Ads**: Connected with customer ID 9495806872
- **RapidAPI Real-Time Web Search**: Upgraded to 20,000 calls/month
- **RapidAPI Keyword Insight**: Upgraded to 2,000 calls/day

### Authentication Strategy
- **Application Default Credentials (ADC)** via gcloud
- **OAuth2 Refresh Token** for Google Ads, Analytics, Search Console
- **Setup**: `gcloud auth application-default login` for ADC refresh
- **Why not service account JSON**: Security risk (long-lived keys), can be leaked

### Data Precedence System
- ✅ KWP CSV precedence (ready for manual imports)
- ✅ GSC organic data (connected, awaiting site launch)
- ✅ RapidAPI estimated fallback (working with quota management)
- ✅ Source tracking in all outputs (kwp|gsc|estimated marked in CSV)

### Documentation Structure
- **Test Documentation**: `docs/TESTS.md` - Complete test suite catalog (63 test files)
- **Execution Guide**: `EXECUTION_START_HERE.md` - Test remediation roadmap
- **Implementation Plan**: `docs/OPTION_A_COMPREHENSIVE_FIX_PLAN.md` - Detailed 8-phase plan
- **Session State**: `.claude-context` - Current work, recent changes

### Quick Commands
```bash
npm run cli -- generate <product>  # Generate marketing plan
npm test                           # Run all tests (1,005 tests)
npm run lint                       # Lint codebase
npm run build                      # Build (if applicable)
```

### Critical Reminders
- **Test Remediation**: See `EXECUTION_START_HERE.md` for 8-phase plan (50-60 hours estimated)
- **Data Sources**: Multi-source with precedence (KWP CSV > GSC > RapidAPI)
- **API Quota**: SERP quota management (3 calls/run, free tier optimized)
- **Australian English**: All content (realise, organise, colour)
- **Production Methods**: Use production code, no raw SQL queries

---

**Token Count**: ~1,100 tokens (optimized for Claude Code)
**Last Updated**: 2025-10-19
**Version**: v2.0-intelligent-budget-optimizer
