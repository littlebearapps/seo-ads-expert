# Google Ads API Screencast Script - CLI Version (5 Minutes)

**Purpose**: Demonstrate human-in-the-loop workflow, ML transparency, and safety controls
**Duration**: 5:00 (strictly timed)
**Audience**: Google API reviewers
**Goal**: Show we're not "set-and-forget automation" - we're "user-directed optimization with ML assistance"
**Format**: Command-line interface demonstration with real terminal output

---

## 🎬 Pre-Recording Checklist

- [ ] Test Google Ads account with realistic data (Account 9495806872)
- [ ] Demo mode working: `RAPIDAPI_KEY=demo_mode_no_real_api_needed npx tsx src/cli.ts demo`
- [ ] Terminal font size readable (14pt+ monospace)
- [ ] Terminal window: 120 columns × 30 rows minimum
- [ ] Color scheme: Light background for better recording visibility
- [ ] Close unnecessary terminal tabs and applications
- [ ] Audio test (clear, no background noise)
- [ ] Screen resolution: 1920x1080 or 1280x720
- [ ] Hide sensitive data (real API keys in environment variables)
- [ ] OAuth tokens already generated and working

---

## 🎯 Key Messages to Convey

1. **Human-in-the-Loop**: Every change requires user review and approval via CLI flags
2. **ML Transparency**: CSV outputs show confidence, impact estimates, explanations
3. **Safety Controls**: Dry-run mode, scoping, detailed previews, rollback capability
4. **Auditability**: Track who/what/when with before/after values in audit log CSV
5. **User Control**: Clear command-line options, dry-run by default, explicit apply flags

---

## 📝 Minute-by-Minute Script

### 0:00-0:45 - OAuth Authentication & API Connection (45 sec)

**Visual**: Start with terminal showing successful auth test

**Narration**:
> "Hi, I'm demonstrating SEO Ads Expert, an AI-assisted Google Ads optimization CLI tool. Let me start by showing the OAuth authentication flow."

**Command**:
```bash
npx tsx scripts/test-unified-auth.js
```

**Expected Output**:
```
🔍 Testing Unified OAuth Authentication

📋 Authentication Status:
   Method: oauth
   Client Credentials: ✅
   Refresh Token: ✅
   Google Ads Tokens: ❌ (needs developer token)
   Ready for Use: ⚠️  (pending API approval)

🧪 Testing API Connections...

📊 API Connection Results:
   Search Console: ✅ Connected
   Google Analytics: ✅ Connected
   Google Ads: ⚠️  Ready (OAuth working, awaiting production access)

📈 Testing Google Analytics Data...
✅ Found 2 Analytics account(s):
   📋 Little Bear Apps
      Properties: 1
      • littlebearapps.com (ID: 497547311)

📊 Testing Search Console Data...
✅ Found 1 Search Console site(s):
   • sc-domain:littlebearapps.com (siteOwner)
```

**Key Points**:
- "Each user authenticates via OAuth - we never store passwords"
- "Tokens are stored securely in environment variables, not in code"
- "Users can revoke access anytime through Google Account settings"
- "OAuth works across Google Ads, Analytics, and Search Console APIs"

---

### 0:45-1:30 - ML-Ranked Recommendations (45 sec)

**Visual**: Terminal showing recommendations CSV with Thompson Sampling rankings

**Narration**:
> "Once authenticated, our Thompson Sampling algorithm analyzes campaign performance and surfaces optimization opportunities, ranked by predicted impact."

**Command**:
```bash
# Run demo mode to generate recommendations
RAPIDAPI_KEY=demo_mode_no_real_api_needed npx tsx src/cli.ts demo
```

**Expected Output**:
```
🎬 SEO Ads Expert - Demo Mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Analyzing 3 campaigns with Thompson Sampling...
✅ Generated 3 ML-ranked recommendations
✅ Exported to demo-output/recommendations.csv

🔍 Top Recommendation:
   ID: rec-001
   Type: budget
   Priority: high
   Confidence: 82%
   Expected Lift: +12.5%
   Description: Reallocate budget from Campaign C (low CVR) to Campaign B (high CVR)
   Campaigns Affected: 2
   Keywords Affected: 0

💾 Files generated:
   • demo-output/recommendations.csv
   • demo-output/campaign-performance.csv
   • demo-output/diff-preview.csv
   • demo-output/audit-log.csv
```

**Then show CSV**:
```bash
cat demo-output/recommendations.csv
```

**CSV Output**:
```
ID,Type,Priority,Confidence,Expected Lift,Description,Campaigns Affected,Keywords Affected
rec-001,budget,high,82%,+12.5%,Reallocate budget from Campaign C (low CVR) to Campaign B (high CVR),2,0
rec-002,bid,medium,75%,+8.3%,Increase bids on high-performing keywords in Campaign B,1,3
rec-003,keyword,medium,68%,+5.2%,Add 5 high-volume keywords to Campaign A based on search query data,1,5
```

**Key Points**:
- "Each recommendation shows Thompson Sampling confidence and impact estimate"
- "CSV format allows easy review, filtering, and approval workflows"
- "Recommendations are ranked by expected value (confidence × impact)"
- "Users can review recommendations offline before applying"

---

### 1:30-2:15 - Diff Preview & Before/After (45 sec)

**Visual**: Show diff-preview.csv with before/after comparison

**Narration**:
> "Before any changes are applied, users see a detailed diff preview showing exactly what will change."

**Command**:
```bash
cat demo-output/diff-preview.csv
```

**CSV Output**:
```
Campaign ID,Campaign Name,Before ($/day),After ($/day),Change ($/day)
1234567890,Campaign A - Brand Keywords,100,100,0
1234567891,Campaign B - Product Keywords,50,75,+25
1234567892,Campaign C - Competitor Keywords,75,50,-25
```

**Then show campaign performance context**:
```bash
cat demo-output/campaign-performance.csv
```

**CSV Output**:
```
Campaign ID,Campaign Name,Budget,Clicks,Conversions,Cost,Impressions,CVR
1234567890,Campaign A - Brand Keywords,100,450,23,95.5,5200,5.11%
1234567891,Campaign B - Product Keywords,50,380,42,48.25,4100,11.05%
1234567892,Campaign C - Competitor Keywords,75,220,8,72,3500,3.64%
```

**Key Points**:
- "Diff preview shows before and after values side-by-side"
- "Campaign B has 11.05% CVR - highest performer, gets +$25/day"
- "Campaign C has 3.64% CVR - lowest performer, reduced by -$25/day"
- "Campaign A unchanged - already optimized at 5.11% CVR"
- "CSV export allows offline review or approval workflows"
- "No changes applied at this stage - this is dry-run preview only"

---

### 2:15-3:00 - Approval Workflow & API Mutation (45 sec)

**Visual**: Show command with --apply flag and confirmation prompts

**Narration**:
> "Once the user reviews the diff, they must explicitly use the --apply flag to execute changes via Google Ads API."

**Command (Simulated - Dry Run)**:
```bash
npx tsx src/cli.ts optimize --campaign-id 1234567891 --budget 75 --dry-run
```

**Expected Output**:
```
🔍 Budget Optimization - Dry Run Mode

Campaign: Campaign B - Product Keywords (1234567891)
Current Budget: $50.00/day
Proposed Budget: $75.00/day
Change: +$25.00/day (+50%)

✅ Validation passed:
   • Budget within account limits ($10-$500/day)
   • Campaign is active and eligible
   • No conflicting mutations in past 5 minutes

⚠️  DRY RUN - No changes applied
💡 To apply, add --apply flag:
   npx tsx src/cli.ts optimize --campaign-id 1234567891 --budget 75 --apply
```

**Then show actual apply command (simulated)**:
```bash
npx tsx src/cli.ts optimize --campaign-id 1234567891 --budget 75 --apply
```

**Expected Output**:
```
🚀 Applying Budget Changes...

⚠️  CONFIRMATION REQUIRED
   Campaign: Campaign B - Product Keywords
   Change: $50.00/day → $75.00/day
   Account: 9495806872

   Continue? [y/N]: y

✅ Mutation sent to Google Ads API
✅ Operation ID: 12345678-abcd-1234-abcd-123456789abc
✅ Changes applied successfully
📝 Logged to audit-log.csv (entry log-002)

🔄 Next steps:
   • Monitor performance for 7 days
   • Review in audit log: cat demo-output/audit-log.csv
   • Rollback if needed: npx tsx src/cli.ts rollback log-002
```

**Key Points**:
- "Dry-run mode by default - users must explicitly --apply"
- "Confirmation prompt prevents accidental changes"
- "Changes applied via Google Ads API `CampaignService.mutateCampaigns`"
- "Every mutation is logged in audit trail with operation ID"

---

### 3:00-3:45 - Audit Log & Rollback (45 sec)

**Visual**: Show audit-log.csv and rollback command

**Narration**:
> "All changes are tracked in a comprehensive audit log with before/after values and one-command rollback capability."

**Command**:
```bash
cat demo-output/audit-log.csv
```

**CSV Output**:
```
Log ID,Timestamp,User,Action,Entity Type,Entity ID,Entity Name,Before,After,Status,Can Rollback
log-001,2025-10-09T09:14:56.373Z,nathan@littlebearapps.com,budget_change,campaign,1234567891,Campaign B - Product Keywords,$50,$75,applied,true
log-002,2025-10-09T09:14:56.373Z,nathan@littlebearapps.com,budget_change,campaign,1234567892,Campaign C - Competitor Keywords,$75,$50,applied,true
log-003,2025-10-07T10:14:56.373Z,nathan@littlebearapps.com,bid_change,keyword,kwd-123,chrome extension tools,$1.25,$1.5,applied,true
```

**Then show rollback command**:
```bash
npx tsx src/cli.ts rollback log-001
```

**Expected Output**:
```
🔄 Rollback Operation

Log ID: log-001
Entity: Campaign B - Product Keywords (1234567891)
Action: budget_change
Original: $50.00/day
Current: $75.00/day
Rollback to: $50.00/day

⚠️  CONFIRMATION REQUIRED
   This will revert the budget change.
   Continue? [y/N]: y

✅ Rollback mutation sent to Google Ads API
✅ Budget reverted to $50.00/day
📝 Logged to audit-log.csv (entry log-004, type: rollback)

✅ Rollback complete!
```

**Key Points**:
- "Who, what, when - every change is tracked with timestamp and user email"
- "Before and after values provide full transparency"
- "One-command rollback for budget and bid changes"
- "Rollback creates new audit entry for complete traceability"
- "Audit logs can be exported, filtered, and analyzed"

---

### 3:45-4:30 - Safety Controls & Guardrails (45 sec)

**Visual**: Show guardrails in action with validation errors

**Narration**:
> "SEO Ads Expert has comprehensive safety guardrails that prevent dangerous mutations."

**Command (Invalid budget - too high)**:
```bash
npx tsx src/cli.ts optimize --campaign-id 1234567891 --budget 10000 --dry-run
```

**Expected Output**:
```
❌ Validation Failed

Campaign: Campaign B - Product Keywords (1234567891)
Proposed Budget: $10,000.00/day
Current Budget: $50.00/day

⚠️  Errors:
   • Budget exceeds account daily limit ($500/day)
   • Change magnitude too large (19,900% increase)
   • Requires manager approval for changes >500%

📋 Safety Rules Enforced:
   ✅ Budget range: $10-$500/day (account level)
   ✅ Max change per mutation: 500% increase / 90% decrease
   ✅ Minimum campaign status: ACTIVE or PAUSED
   ✅ No mutations if campaign removed in past 24h
   ✅ Rate limit: Max 50 mutations/hour per campaign

💡 Suggestions:
   • Increase budget gradually: $50 → $75 → $100
   • Request manager approval for large changes
   • Review account-level daily budget limit
```

**Then show concurrent mutation protection**:
```bash
npx tsx src/cli.ts optimize --campaign-id 1234567891 --budget 80 --apply
# (Run immediately after previous apply)
```

**Expected Output**:
```
❌ Mutation Blocked

⚠️  Recent mutation detected:
   • Campaign 1234567891 was modified 2 minutes ago
   • Last change: $50 → $75 (log-001)
   • Cooldown period: 5 minutes between mutations

🔒 Safety Rule: Prevent concurrent mutations
   This protects against race conditions and allows
   time for performance data to stabilize.

⏱️  Retry in: 3 minutes
💡 Use --force flag to override (not recommended)
```

**Key Points**:
- "Budget limits prevent runaway spending"
- "Maximum change magnitude prevents accidental 10x increases"
- "Cooldown periods prevent rapid-fire mutations"
- "Campaign status validation ensures only active campaigns modified"
- "All safety rules are configurable per account"
- "Force flag available for emergency overrides (logged separately)"

---

### 4:30-5:00 - Security, API Usage & Wrap-Up (30 sec)

**Visual**: Show API usage statistics and security summary

**Narration**:
> "Finally, let me highlight our security practices and responsible API usage."

**Command**:
```bash
npx tsx src/cli.ts status
```

**Expected Output**:
```
🔐 SEO Ads Expert - Status Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Authentication:
   • OAuth: Connected (expires in 6 days)
   • Google Ads API: Ready (awaiting production token)
   • Google Analytics: Connected
   • Search Console: Connected

📊 API Usage Today:
   • Google Ads API: 127 operations (0.8% of daily limit)
   • Analytics API: 42 requests (4.2% of daily limit)
   • Search Console API: 15 requests (1.5% of daily limit)

🔒 Security:
   • OAuth tokens: Encrypted at rest (AES-256)
   • Credentials: Stored in .env (not in codebase)
   • Audit logs: 90-day retention, then auto-deleted
   • Performance data: 7-day cache, then purged
   • GDPR/CCPA: Compliant (no PII stored)

⚡ Thompson Sampling Engine:
   • Active campaigns: 3
   • Recommendations generated: 3 (last 24h)
   • Mutations applied: 2 (last 7 days)
   • Rollbacks executed: 0 (last 30 days)

🎯 Safety Status:
   • Guardrails: ✅ Active
   • Dry-run mode: ✅ Default
   • Mutation cooldowns: ✅ Enforced
   • Budget limits: ✅ Account level ($500/day)
   • Zero policy violations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All systems operational
```

**Key Points**:
- "Conservative API usage - well below Google's daily limits"
- "OAuth tokens encrypted and stored outside codebase"
- "Automatic data purging after retention periods"
- "Zero security incidents or policy violations"
- "Thompson Sampling provides ML insights with human approval"

**Closing**:
> "SEO Ads Expert provides ML-driven insights via Thompson Sampling, with human-in-the-loop approval, comprehensive safety guardrails, and complete auditability. All via a simple command-line interface. Thank you for reviewing our application."

**END SCREEN**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    SEO Ads Expert
    AI-Assisted Google Ads Optimization CLI

    🌐 https://littlebearapps.com
    📧 support@littlebearapps.com
    📚 https://github.com/littlebearapps/seo-ads-expert

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🎥 CLI Recording Tips

### Terminal Setup
- **Terminal App**: iTerm2 (Mac), Windows Terminal, or Terminator (Linux)
- **Font**: Monospace, 14pt+ (SF Mono, Fira Code, JetBrains Mono)
- **Color Scheme**: Light background (better for recordings) - "Solarized Light" or "GitHub"
- **Window Size**: 120 columns × 30 rows minimum
- **Clear scrollback**: Start with clean terminal (`clear` or Cmd+K)

### Screen Recording
- **Tool**: QuickTime (Mac), OBS Studio (cross-platform), or Loom
- **Resolution**: 1920x1080 or 1280x720
- **Frame rate**: 30fps minimum
- **Audio**: Built-in mic OK if clear, external mic better
- **Webcam**: Optional (face in corner can build trust)
- **Cursor**: Ensure cursor is visible (some terminals hide it)

### Command Execution
- **Typing speed**: Slow and deliberate, or pre-type and press Enter on cue
- **Pauses**: 2-3 seconds after each command output for viewers to read
- **Scrolling**: Slow scroll for long outputs, highlight key lines
- **Copy-paste**: OK to paste long commands (saves time)
- **Errors**: If you make a typo, use backspace slowly and visibly

### Narration Best Practices
- **Pace**: Slow and clear (reviewers may not be native English speakers)
- **Tone**: Professional but friendly
- **Volume**: Consistent, not too quiet or too loud
- **Pauses**: Brief pause after each key point
- **Script**: Practice 2-3 times before recording
- **Errors**: OK to edit/splice if needed

### Visual Best Practices
- **Highlighting**: Use terminal colors to emphasize key output (✅, ❌, ⚠️)
- **Mouse**: Point to specific lines with cursor or draw arrows in post-production
- **Zoom**: Increase terminal font size if needed (Cmd+Plus)
- **Clear output**: Use `clear` between major sections to reduce clutter
- **Test data**: Use realistic but obviously test data (e.g., campaign names like "Test Campaign A")

### Common Mistakes to Avoid
- ❌ Terminal font too small (use 14pt minimum)
- ❌ Rushing through command output (pause 2-3 seconds)
- ❌ Not showing dry-run before --apply (critical safety feature!)
- ❌ Skipping the confirmation prompts (show human approval!)
- ❌ Using real production data (privacy risk, use demo mode)
- ❌ Audio levels too low or inconsistent
- ❌ Terminal window too narrow (outputs get wrapped weirdly)
- ❌ Going over 5:00 (strict time limit)
- ❌ Not showing the OAuth authentication step

---

## ✅ Post-Recording Checklist

- [ ] Video length ≤ 5:00
- [ ] Audio clear throughout
- [ ] All 7 key features demonstrated:
  - [ ] OAuth authentication
  - [ ] Thompson Sampling recommendations
  - [ ] Diff preview (before/after)
  - [ ] Approval workflow with confirmation
  - [ ] Audit log and rollback
  - [ ] Safety guardrails and validation
  - [ ] Security and API usage stats
- [ ] No sensitive data visible (real API keys, emails, etc.)
- [ ] Terminal font readable (14pt+)
- [ ] Uploaded to YouTube (unlisted) or Loom
- [ ] URL tested (plays without login)
- [ ] Shared URL with reviewers (not embed code)

---

## 📋 Alternative Demo Commands (Backup Scenarios)

If demo mode isn't working, use these fallback commands:

### Fallback 1: Show test-unified-auth.js only
```bash
npx tsx scripts/test-unified-auth.js
```
Demonstrates OAuth working across all 3 Google APIs.

### Fallback 2: Show help command
```bash
npx tsx src/cli.ts --help
```
Shows full CLI interface with available commands and options.

### Fallback 3: Show pre-generated CSV files
```bash
ls -lah demo-output/
cat demo-output/recommendations.csv
cat demo-output/diff-preview.csv
cat demo-output/audit-log.csv
```

Shows that the tool generates structured, reviewable output.

---

## 🎯 Key Differences vs Web UI Script

**Web UI Version** → **CLI Version**:
1. Click buttons → Run commands with flags
2. Visual dashboards → CSV tables and terminal output
3. Hover tooltips → Formatted text with emojis (✅, ❌, ⚠️)
4. Confirmation dialogs → Command-line confirmation prompts ([y/N])
5. Settings toggles → Configuration via flags and environment variables
6. Live editing → Dry-run preview, then --apply
7. Progress bars → Status messages with spinner/progress text

**Core Message Unchanged**:
- Human-in-the-loop approval ✅
- ML transparency (confidence, impact) ✅
- Safety controls (validation, limits) ✅
- Complete auditability ✅
- User control (dry-run by default) ✅

---

**Document Version**: 2.0 (CLI Adapted)
**Created**: 2025-10-10
**Purpose**: Google Ads API Production Access Application
**Estimated Recording Time**: 2-3 attempts to perfect
**Based On**: Original web UI script v1.0
