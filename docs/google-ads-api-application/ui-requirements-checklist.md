# UI Requirements - Product Gap Assessment

**Purpose**: Identify missing features for Google Ads API v2.0 compliance
**Version**: 1.0
**Created**: 2025-10-08

---

## 🎯 Overview

This checklist helps identify which UI components need to be built or enhanced before applying for Google Ads API production access.

**Current Status**: SEO Ads Expert v2.0 is primarily a CLI tool. Many required UI components for Google approval **may not exist yet**.

---

## ⚠️ CRITICAL BLOCKERS (Must Build Before Application)

### 1. OAuth Account Linking UI
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] "Link Google Ads Account" button/page
- [ ] OAuth flow initiated from UI (not just CLI script)
- [ ] Account selection interface (if multiple accounts)
- [ ] "Account linked successfully" confirmation
- [ ] "Unlink Account" option
- [ ] List of currently linked accounts

**Current Implementation**:
- CLI: `npm run auth` or `npx tsx scripts/generate-google-ads-token.js`
- Issue: No web UI for reviewers to test

**Action Required**:
```
Priority: CRITICAL
Effort: 2-3 days
Build: Simple web page with OAuth button → callback handler → success message
```

---

### 2. Recommendations Dashboard
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] List of ML-ranked optimization opportunities
- [ ] Each recommendation shows:
  - Title and description
  - "ML-Suggested" badge
  - Confidence interval (e.g., "75-85%")
  - Expected impact (e.g., "+12% CVR")
  - Brief explanation
  - [Review] [Dismiss] [Postpone] buttons
- [ ] Sort/filter options
- [ ] Empty state ("No recommendations at this time")

**Current Implementation**:
- CLI: Generates recommendations in markdown/CSV files
- Issue: No interactive UI to browse and select recommendations

**Action Required**:
```
Priority: CRITICAL
Effort: 3-5 days
Build: React/HTML dashboard displaying JSON recommendations with actions
```

---

### 3. Diff Preview Interface
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Before → After comparison table
- [ ] Visual highlighting of changes
- [ ] Summary counts (e.g., "2 budgets, 5 keywords, 0 ads")
- [ ] Expandable details per entity
- [ ] [Export CSV] button
- [ ] [Approve] [Cancel] buttons

**Example Layout**:
```
Campaign A
  Budget: $100/day → $75/day (-25%) 🔴

Campaign B
  Budget: $50/day → $75/day (+50%) 🟢

---
Total Changes: 2 budgets modified
[Export CSV] [Cancel] [Approve Changes]
```

**Current Implementation**:
- CLI: Shows diffs in terminal output or markdown files
- Issue: No interactive preview UI

**Action Required**:
```
Priority: CRITICAL
Effort: 2-3 days
Build: Diff table component with color coding and export
```

---

### 4. Approval Confirmation Dialog
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Modal/dialog overlay
- [ ] Summary of changes to be applied
- [ ] Entity count and change type summary
- [ ] Warning/notice text
- [ ] [Cancel] and [Confirm and Apply] buttons
- [ ] Progress indicator during application
- [ ] Success/error feedback

**Example Dialog**:
```
┌─────────────────────────────────────┐
│ Confirm Changes                      │
├─────────────────────────────────────┤
│ Apply 2 budget changes to           │
│ Account 9495806872?                 │
│                                     │
│ • Campaign A: -$25/day              │
│ • Campaign B: +$25/day              │
│                                     │
│ This action will modify your        │
│ Google Ads account immediately.     │
│                                     │
│     [Cancel]  [Confirm and Apply]   │
└─────────────────────────────────────┘
```

**Current Implementation**:
- CLI: Prompts in terminal (if any)
- Issue: No visual confirmation dialog

**Action Required**:
```
Priority: CRITICAL
Effort: 1-2 days
Build: Modal component with summary and two-button confirmation
```

---

### 5. Audit Log Interface
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Table/list of recent changes
- [ ] Columns: Timestamp | User | Entity | Change | Status | Actions
- [ ] Before → After values displayed
- [ ] [Rollback] button for applicable changes
- [ ] [Export] button for CSV download
- [ ] Search/filter capabilities
- [ ] Pagination for long histories

**Example Table**:
```
Timestamp            | User         | Entity           | Change            | Status   | Actions
---------------------|--------------|------------------|-------------------|----------|----------
2025-10-08 14:32 UTC | nathan@...   | Campaign 123456  | Budget $100→$75   | Applied  | [Rollback]
2025-10-08 13:15 UTC | nathan@...   | Keyword "shoes"  | Bid $2.50→$3.00   | Applied  | [Rollback]
```

**Current Implementation**:
- Backend: Audit logs likely stored in SQLite or files
- Issue: No UI to view/export logs

**Action Required**:
```
Priority: CRITICAL
Effort: 2-3 days
Build: Audit log table with rollback and export functionality
```

---

### 6. Auto-Apply Settings Page
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Per-feature toggle switches (default: OFF)
- [ ] For each enabled feature:
  - Daily operation cap input
  - Entity scoping dropdown (all campaigns / selected campaigns)
  - Email summary address input
- [ ] [Save Settings] button
- [ ] Clear descriptions of what each feature does
- [ ] Status indicators (enabled/disabled)

**Example UI**:
```
Automation Settings

☐ Auto-apply budget optimizations
  └─ Daily cap: [50] changes
  └─ Scope: [All campaigns ▼]
  └─ Email: [nathan@littlebearapps.com]

☐ Auto-apply bid adjustments
  └─ (configuration hidden when disabled)

☐ Auto-apply keyword additions
  └─ (configuration hidden when disabled)

[Save Settings]
```

**Current Implementation**:
- CLI: Config file or environment variables
- Issue: No UI for users to toggle automation

**Action Required**:
```
Priority: CRITICAL
Effort: 2-3 days
Build: Settings form with toggle switches and conditional config inputs
```

---

### 7. Kill Switch
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Prominent button (big, red, hard to miss)
- [ ] Located on every page or in main navigation
- [ ] Confirmation dialog before disabling
- [ ] Disables ALL auto-apply features immediately
- [ ] Success feedback after disabling

**Example Placement**:
```
┌──────────────────────────────────────────┐
│ [🔴 DISABLE ALL AUTOMATION]              │ ← Fixed header
├──────────────────────────────────────────┤
│ Dashboard content...                     │
│                                          │
└──────────────────────────────────────────┘
```

**Current Implementation**:
- CLI: Unknown
- Issue: No visual kill switch

**Action Required**:
```
Priority: CRITICAL
Effort: 0.5-1 day
Build: Prominent button component that calls disable-all API endpoint
```

---

## 🔧 IMPORTANT BUT NOT BLOCKING

### 8. Security & Privacy Page
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Token encryption explanation
- [ ] Data retention policy display
- [ ] Current API usage stats
- [ ] [Request Data Deletion] button
- [ ] Security contact information
- [ ] Links to privacy policy and ToS

**Current Implementation**:
- Documentation: Privacy policy and ToS (external)
- Issue: No in-app security information page

**Action Required**:
```
Priority: MEDIUM
Effort: 1 day
Build: Static informational page with key security details
```

---

### 9. Thompson Sampling Transparency
**Status**: [ ] Exists  [ ] Partially exists  [ ] Needs building

**Required Elements**:
- [ ] Confidence interval visualization
- [ ] Expected impact estimate with range
- [ ] Explanation of why recommendation was made
- [ ] "Learn more about Thompson Sampling" link/tooltip
- [ ] Visual badge indicating ML-generated

**Example Display**:
```
🤖 ML-Suggested Budget Reallocation

Confidence: ███████░░░ 78%
Expected CVR lift: +12% (range: +8% to +15%)

Why: Campaign B has shown higher conversion rates
in recent tests, but needs more traffic to confirm.
Thompson Sampling suggests reallocating budget to
explore this variant further.

[Learn More] [Preview Changes] [Dismiss]
```

**Current Implementation**:
- Backend: Thompson Sampling calculations exist
- Issue: Confidence/impact not shown in UI

**Action Required**:
```
Priority: MEDIUM
Effort: 2 days
Build: Recommendation detail component with TS metrics
```

---

## 📊 Current vs Required Comparison

| Feature | Current Status | Required for Approval | Gap |
|---------|---------------|----------------------|-----|
| OAuth Linking | CLI script | Web UI | LARGE |
| Recommendations Dashboard | CLI/files | Interactive UI | LARGE |
| Diff Preview | Terminal/markdown | Visual comparison | LARGE |
| Approval Workflow | CLI prompts (maybe) | Two-step confirmation | LARGE |
| Audit Log | Backend exists | User-visible UI | LARGE |
| Auto-Apply Settings | Config files | Settings page | LARGE |
| Kill Switch | None | Prominent button | CRITICAL |
| Security Page | External docs | In-app display | MEDIUM |
| TS Transparency | Backend only | UI visualization | MEDIUM |

---

## 🚀 Development Roadmap

### Phase 1: MVP for Approval (2-3 weeks)

**Week 1**: Core Workflow
- [ ] OAuth linking page
- [ ] Recommendations dashboard (basic)
- [ ] Diff preview table
- [ ] Approval confirmation dialog

**Week 2**: Audit & Controls
- [ ] Audit log table
- [ ] Rollback functionality
- [ ] Auto-apply settings page
- [ ] Kill switch button

**Week 3**: Polish & Demo
- [ ] Security information page
- [ ] TS transparency enhancements
- [ ] Screenshots for application
- [ ] Record 5-minute screencast

### Phase 2: Post-Approval Enhancements
- Advanced filtering and search
- Real-time notifications
- Mobile-responsive design
- Multi-account support

---

## 💡 Implementation Notes

### Technology Stack Recommendations:

**Option A: Lightweight Web UI (Fastest)**
- Express server + EJS templates
- Vanilla JavaScript
- Bootstrap CSS
- SQLite backend (already exists)
- **Effort**: 2-3 weeks
- **Pros**: Quick to build, minimal dependencies
- **Cons**: Less polished, harder to scale

**Option B: Modern Web App (Better UX)**
- React or Vue.js frontend
- Node.js API backend
- Tailwind CSS
- SQLite backend (already exists)
- **Effort**: 3-4 weeks
- **Pros**: Better UX, easier to enhance later
- **Cons**: More setup time, steeper learning curve

**Recommendation**: Start with Option A for approval, refactor to Option B post-approval.

---

## ✅ Minimum Viable Product for Approval

**Must Have (Blocker Features)**:
1. ✅ OAuth linking page
2. ✅ Recommendations list (even if basic)
3. ✅ Diff preview table
4. ✅ Approval confirmation dialog
5. ✅ Audit log view
6. ✅ Auto-apply settings page
7. ✅ Kill switch button

**Nice to Have (Can defer)**:
- Advanced TS visualization
- Real-time updates
- Mobile responsiveness
- Search/filter capabilities
- Batch operations UI

---

**Document Version**: 1.0
**Created**: 2025-10-08
**Purpose**: Product gap assessment for Google Ads API compliance
**Next Review**: Weekly during development phase
