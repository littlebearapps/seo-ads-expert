# Google Ads API Screencast Script (5 Minutes)

**Purpose**: Demonstrate human-in-the-loop workflow, ML transparency, and safety controls
**Duration**: 5:00 (strictly timed)
**Audience**: Google API reviewers
**Goal**: Show we're not "set-and-forget automation" - we're "user-directed optimization with ML assistance"

---

## 🎬 Pre-Recording Checklist

- [ ] Test Google Ads account with realistic data
- [ ] Sample recommendations pre-loaded
- [ ] Browser zoom set to 100% (readable)
- [ ] Close unnecessary tabs and applications
- [ ] Audio test (clear, no background noise)
- [ ] Screen resolution: 1920x1080 or 1280x720
- [ ] Hide sensitive data (real customer IDs, emails, etc.)

---

## 🎯 Key Messages to Convey

1. **Human-in-the-Loop**: Every change requires user review and approval
2. **ML Transparency**: Show confidence, impact estimates, explanations
3. **Safety Controls**: Caps, scoping, kill switch, rollback
4. **Auditability**: Track who/what/when with before/after values
5. **User Control**: Easy to enable/disable, clear visual feedback

---

## 📝 Minute-by-Minute Script

### 0:00-0:45 - OAuth Account Linking & Security (45 sec)

**Visual**: Start on login/home screen

**Narration**:
> "Hi, I'm demonstrating SEO Ads Expert, an AI-assisted Google Ads optimization platform. Let me start by showing how users link their Google Ads accounts."

**Actions**:
1. Click "Link Google Ads Account"
2. Show OAuth consent screen (Google's standard flow)
3. Select test account, grant permission
4. Return to app, show "Account linked successfully"

**Key Points**:
- "Each user authenticates via OAuth - we never store passwords"
- "Tokens are encrypted at rest using AES-256"
- "Users can revoke access anytime through Google Account settings"

---

### 0:45-1:30 - ML-Ranked Recommendations Dashboard (45 sec)

**Visual**: Recommendations list with Thompson Sampling rankings

**Narration**:
> "Once linked, our Thompson Sampling algorithm analyzes campaign performance and surfaces optimization opportunities, ranked by predicted impact."

**Actions**:
1. Show recommendations list with 5-7 items
2. Hover over recommendation to show tooltip with details
3. Point out ML confidence badges and impact estimates

**Key Points**:
- "Each recommendation shows a confidence interval - for example, '75-85% confidence'"
- "Expected impact estimates help users prioritize - '+12% CVR lift projected'"
- "The algorithm balances exploration and exploitation using Bayesian optimization"
- "Users can dismiss, postpone, or review any suggestion"

**Visual Callouts**:
- 🤖 "ML-Suggested" badge
- 📊 Confidence: 78%
- 📈 Expected lift: +12% CVR

---

### 1:30-2:15 - Diff Preview & Before/After (45 sec)

**Visual**: Click into a recommendation to show diff preview

**Narration**:
> "Before any changes are applied, users see a detailed diff preview showing exactly what will change."

**Actions**:
1. Click "Review" on a budget optimization recommendation
2. Show before → after comparison:
   - Campaign A: $100/day → $75/day (-25%)
   - Campaign B: $50/day → $75/day (+50%)
3. Show affected entity counts: "2 campaigns, 0 keywords, 0 ads"
4. Click "Export CSV" to show downloadable preview

**Key Points**:
- "Users see before and after values side-by-side"
- "Change counts provide a quick summary"
- "CSV export allows offline review or approval workflows"
- "No changes are applied at this stage - this is preview only"

---

### 2:15-3:00 - Approval Workflow & Confirmation (45 sec)

**Visual**: Approve the changes and show confirmation dialog

**Narration**:
> "Once the user reviews the diff, they must explicitly approve before changes are applied to Google Ads."

**Actions**:
1. Click "Approve Changes"
2. Show confirmation dialog:
   - "Apply 2 budget changes to Account 9495806872?"
   - Summary: "Campaign A -$25/day, Campaign B +$25/day"
   - [Cancel] [Confirm and Apply]
3. Click "Confirm and Apply"
4. Show progress indicator
5. Show success message: "Changes applied successfully"

**Key Points**:
- "A confirmation dialog prevents accidental clicks"
- "Users can cancel at this stage"
- "Changes are applied via Google Ads API mutations"
- "Every change is logged in the audit trail"

---

### 3:00-3:45 - Audit Log & Rollback (45 sec)

**Visual**: Navigate to audit log

**Narration**:
> "All changes are tracked in a comprehensive audit log with before/after values and rollback capability."

**Actions**:
1. Open "Audit Log" tab
2. Show recent changes table:
   - Timestamp: 2025-10-08 14:32:15 UTC
   - User: nathan@littlebearapps.com
   - Entity: Campaign 12345678 "Campaign A"
   - Change: Budget $100.00 → $75.00
   - Status: Applied ✅
   - [Rollback] button
3. Click "Rollback" on one entry
4. Show confirmation: "Revert budget to $100.00?"
5. Confirm and show success

**Key Points**:
- "Who, what, when - every change is tracked"
- "Before and after values provide transparency"
- "One-click rollback for budget and bid changes"
- "Audit logs can be exported as CSV for compliance"

---

### 3:45-4:30 - Auto-Apply Controls & Kill Switch (45 sec)

**Visual**: Navigate to auto-apply settings

**Narration**:
> "For users who want automation, we offer optional auto-apply with strict safety controls."

**Actions**:
1. Open "Automation Settings" page
2. Show per-feature toggles (all OFF by default):
   - ☐ Auto-apply budget optimizations
   - ☐ Auto-apply bid adjustments
   - ☐ Auto-apply keyword additions
3. Enable "Auto-apply budget optimizations"
4. Show required configuration:
   - Daily cap: [50] changes
   - Scope: [Selected campaigns ▼]
   - Email summary: [nathan@littlebearapps.com]
5. Save settings
6. Point to big red "DISABLE ALL AUTOMATION" button at top

**Key Points**:
- "Auto-apply is OFF by default - users must explicitly enable"
- "Daily operation caps prevent runaway automation"
- "Entity scoping limits changes to selected campaigns only"
- "Email summaries keep users informed"
- "Kill switch disables all automation immediately"

**Visual Emphasis**:
- Show [🔴 DISABLE ALL AUTOMATION] button prominently

---

### 4:30-5:00 - Security & Data Handling Wrap-Up (30 sec)

**Visual**: Show security documentation page or settings

**Narration**:
> "Finally, let me highlight our security and data handling practices."

**Actions**:
1. Show "Security & Privacy" page with key points:
   - 🔒 OAuth tokens encrypted at rest (AES-256)
   - 📅 Performance data: 7-day cache, then auto-deleted
   - 📋 Audit logs: 90-day retention
   - 🗑️ Data deletion: Honored within 30 days
   - 🔐 GDPR/CCPA compliant

2. Show quick stats:
   - "Current API usage: 347 operations today (2.3% of daily limit)"
   - "Zero security incidents"

**Key Points**:
- "We take data security seriously"
- "Automatic data purging after retention periods"
- "Users can request data deletion anytime"
- "Conservative API usage - well below limits"

**Closing**:
> "SEO Ads Expert provides ML-driven insights with human oversight, transparent safeguards, and complete user control. Thank you for reviewing our application."

**END SCREEN**:
- Little Bear Apps logo
- Contact: support@littlebearapps.com
- Website: https://littlebearapps.com

---

## 🎥 Recording Tips

### Technical Setup
- **Tool**: Loom (easiest) or OBS Studio (more control)
- **Resolution**: 1920x1080 or 1280x720
- **Frame rate**: 30fps minimum
- **Audio**: Built-in mic OK if clear, external mic better
- **Webcam**: Optional (face can build trust)

### Narration Best Practices
- **Pace**: Slow and clear (reviewers may not be native English speakers)
- **Tone**: Professional but friendly
- **Volume**: Consistent, not too quiet or too loud
- **Pauses**: Brief pause after each key point
- **Script**: Practice 2-3 times before recording
- **Errors**: OK to edit/splice if needed

### Visual Best Practices
- **Mouse movements**: Slow and deliberate
- **Highlights**: Circle or arrow cursor for emphasis
- **Zoom**: Use browser zoom if text too small
- **Transitions**: Smooth, not jarring
- **Test data**: Use realistic but obviously test data
- **Sensitive info**: Hide real customer IDs, emails, revenue

### Common Mistakes to Avoid
- ❌ Rushing through features (speak slowly!)
- ❌ Skipping the approval step (critical to show!)
- ❌ Not showing the kill switch (Google wants to see it)
- ❌ Using real production data (privacy risk)
- ❌ Audio levels too low or inconsistent
- ❌ Screen too cluttered with tabs/notifications
- ❌ Going over 5:00 (strict time limit)

---

## ✅ Post-Recording Checklist

- [ ] Video length ≤ 5:00
- [ ] Audio clear throughout
- [ ] All 7 key features demonstrated
- [ ] No sensitive data visible
- [ ] Uploaded to YouTube (unlisted) or Loom
- [ ] URL tested (plays without login)
- [ ] Shared URL with reviewers (not embed code)

---

## 📋 Alternative: Live Demo Script

If Google requests a live demo instead of pre-recorded:

**Prep**:
- Same test account setup
- Same feature walkthrough
- Have troubleshooting plan (if OAuth fails, etc.)
- Screen share ready (Zoom/Meet)

**During Demo**:
- Follow same 5-minute script
- Pause for questions
- Have backup examples ready
- Take notes on concerns raised

---

**Document Version**: 1.0
**Created**: 2025-10-08
**Purpose**: Google Ads API Production Access Application
**Estimated Recording Time**: 2-3 attempts to perfect
