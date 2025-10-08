# Google API Reviewer Validation Checklist

**Purpose**: Step-by-step validation that Google reviewers will perform
**Version**: 1.0
**Created**: 2025-10-08

---

## 🎯 Reviewer Success Criteria

**A Google reviewer will approve if they can successfully:**

1. ✅ Understand what the product does and why it needs API access
2. ✅ Link a test Google Ads account via OAuth
3. ✅ See ML-driven recommendations with clear explanations
4. ✅ Preview proposed changes before they're applied
5. ✅ Approve changes through explicit confirmation workflow
6. ✅ Observe changes reflected in Google Ads
7. ✅ View comprehensive audit logs
8. ✅ Rollback at least one change
9. ✅ Configure auto-apply settings with safety controls
10. ✅ Use kill switch to disable automation
11. ✅ Find and review privacy policy & terms of service
12. ✅ Verify data security and deletion procedures

---

## 📋 Detailed Validation Steps

### Step 1: Documentation Review (5 minutes)

**Reviewer will check:**
- [ ] Privacy Policy accessible at public URL
- [ ] Terms of Service accessible at public URL
- [ ] Privacy policy includes all required sections:
  - Data collection (what)
  - Data usage (why)
  - Data storage (where/how long)
  - Encryption (how secured)
  - Third-party sharing (statement of no sharing)
  - User rights (deletion, access)
  - Contact information
- [ ] Terms include Google Ads API compliance clause
- [ ] Company website professional and legitimate
- [ ] Product descriptions match application

**Pass Criteria**: All documents live, complete, and professional

---

### Step 2: OAuth Authentication (3 minutes)

**Reviewer will perform:**
1. Click "Link Google Ads Account" in demo
2. Observe OAuth consent screen (Google's standard flow)
3. Check requested scopes (should be ONLY `adwords` scope)
4. Grant permission to test account
5. Return to application
6. Verify account linked successfully

**Expected Behavior**:
- Clean OAuth flow (no errors)
- Consent screen shows correct app name and logo
- Only requests necessary scope
- Clear explanation of what access entails
- Account appears linked in UI

**Pass Criteria**: Standard OAuth, minimal scopes, successful linking

---

### Step 3: ML Recommendations Review (5 minutes)

**Reviewer will observe:**
- [ ] Recommendations list populated with opportunities
- [ ] Each recommendation shows:
  - Clear title/description
  - "ML-Suggested" or "Experimental" label
  - Confidence interval (e.g., "75-85% confidence")
  - Expected impact estimate (e.g., "+12% CVR")
  - Brief explanation of reasoning
- [ ] User can dismiss, postpone, or review each item
- [ ] Recommendations ranked by predicted impact

**Expected Behavior**:
- ML insights are assistive, not directive
- Users understand WHY recommendations matter
- Confidence and uncertainty clearly communicated
- No pressure to accept all suggestions

**Pass Criteria**: Transparency, clear explanations, user control

---

### Step 4: Diff Preview (5 minutes)

**Reviewer will test:**
1. Click "Review" on a recommendation
2. Observe detailed diff preview showing:
   - Before values
   - After values
   - Percentage/absolute changes
   - Affected entity counts (campaigns, keywords, ads)
3. Export proposed changes as CSV
4. Review CSV contents for completeness

**Expected Display**:
```
Campaign A Budget: $100/day → $75/day (-25%)
Campaign B Budget: $50/day → $75/day (+50%)
---
Total changes: 2 budgets, 0 bids, 0 keywords
```

**Pass Criteria**: Clear before/after, counts accurate, CSV export works

---

### Step 5: Approval Workflow (5 minutes)

**Reviewer will perform:**
1. Click "Approve Changes" after reviewing diff
2. Observe confirmation dialog:
   - Summary of changes
   - Number of entities affected
   - [Cancel] and [Confirm] buttons
3. Click "Confirm and Apply"
4. Observe progress indicator
5. See success confirmation
6. Verify changes applied in Google Ads UI (via separate tab)

**Expected Behavior**:
- Two-step approval (Review → Confirm)
- Cannot accidentally apply changes
- Clear feedback on success/failure
- Changes actually applied to Google Ads

**Pass Criteria**: Deliberate approval process, changes actually work

---

### Step 6: Audit Log Review (5 minutes)

**Reviewer will check:**
- [ ] Navigate to "Audit Log" or "Change History"
- [ ] See list of recent changes with:
  - Timestamp (UTC)
  - User ID (who made the change)
  - Entity type and ID (what changed)
  - Before → After values
  - Status (Success, Failed, Rolled Back)
  - Action buttons (Rollback, Export)
- [ ] Export audit log as CSV
- [ ] Verify CSV contains complete change history

**Expected Data**:
```
2025-10-08 14:32:15 UTC | nathan@littlebearapps.com | Campaign 12345678
Budget: $100.00 → $75.00 | Status: Applied | [Rollback]
```

**Pass Criteria**: Complete audit trail, exportable, who/what/when tracked

---

### Step 7: Rollback Capability (3 minutes)

**Reviewer will test:**
1. Click "Rollback" on a recent budget change
2. See confirmation dialog: "Revert budget to $100.00?"
3. Confirm rollback
4. Observe success message
5. Verify change reverted in audit log
6. (Optional) Check Google Ads UI to confirm reversion

**Expected Behavior**:
- One-click rollback for applicable changes
- Confirmation prevents accidents
- Audit log shows rollback event
- Original value restored

**Pass Criteria**: Rollback works, logged in audit trail

---

### Step 8: Auto-Apply Controls (5 minutes)

**Reviewer will navigate to:**
- "Automation Settings" or "Auto-Apply" configuration page

**Reviewer will verify:**
- [ ] All features OFF by default
- [ ] Per-feature toggles:
  - ☐ Auto-apply budget optimizations
  - ☐ Auto-apply bid adjustments
  - ☐ Auto-apply keyword additions
- [ ] When enabled, shows required config:
  - Daily operation cap (max changes/day)
  - Entity scoping (which campaigns)
  - Email summary address
- [ ] Prominent "DISABLE ALL AUTOMATION" kill switch
- [ ] Clear descriptions of what each feature does

**Reviewer will test:**
1. Enable one auto-apply feature
2. Set daily cap to 10 changes
3. Scope to specific campaign
4. Save settings
5. Verify settings persisted

**Pass Criteria**: Opt-in required, caps configurable, kill switch visible

---

### Step 9: Kill Switch Test (2 minutes)

**Reviewer will:**
1. Locate "DISABLE ALL AUTOMATION" button
2. Click button
3. Observe confirmation: "Disable all auto-apply features?"
4. Confirm
5. Verify all auto-apply toggles switched to OFF
6. See success message

**Expected Visual**:
```
[🔴 DISABLE ALL AUTOMATION]  ← Big, red, prominent button
```

**Pass Criteria**: Easily accessible, one-click disable, clear feedback

---

### Step 10: Data Security Review (5 minutes)

**Reviewer will check:**
- [ ] "Security & Privacy" documentation page exists
- [ ] States token encryption method (AES-256)
- [ ] Explains data retention (7-day cache, 90-day logs)
- [ ] Documents data deletion procedure
- [ ] Provides security contact email
- [ ] Shows current API usage stats
- [ ] Privacy policy links work

**Expected Information**:
- Encryption at rest and in transit
- Automatic data purging after retention
- GDPR/CCPA compliance statements
- Clear contact for security issues

**Pass Criteria**: Comprehensive security documentation, publicly accessible

---

## ✅ Overall Pass/Fail Criteria

### **PASS** if:
- ✅ All 10 validation steps complete successfully
- ✅ Human-in-the-loop workflow clearly demonstrated
- ✅ ML transparency evident (confidence, explanations)
- ✅ Safety controls functional (caps, kill switch, rollback)
- ✅ Audit trail comprehensive
- ✅ Documentation complete and accessible
- ✅ OAuth implementation standard
- ✅ No red flags (bulk automation, missing controls, vague use case)

### **FAIL** if:
- ❌ Missing human approval step
- ❌ Auto-apply enabled by default
- ❌ No kill switch or difficult to find
- ❌ Privacy policy missing or incomplete
- ❌ OAuth requests unnecessary scopes
- ❌ Audit log missing or incomplete
- ❌ No rollback capability
- ❌ Changes apply without user confirmation
- ❌ ML recommendations opaque (no explanations)
- ❌ Use case vague or suspicious

### **REQUEST CLARIFICATION** if:
- ⚠️ Some features work but not all
- ⚠️ Documentation unclear or incomplete
- ⚠️ Safety controls present but not prominent
- ⚠️ Unsure about data handling practices
- ⚠️ Need live demo to understand workflow

---

## 🎯 Tips for Passing Review

### Before Reviewer Tests:

1. **Test yourself first** - Go through this entire checklist as if you're the reviewer
2. **Fix broken links** - Verify all URLs work (privacy, ToS, demo, screenshots)
3. **Populate demo account** - Have realistic data and recommendations ready
4. **Test on fresh browser** - Clear cookies, test as new user
5. **Record screencast** - Shows reviewer what to expect
6. **Write clear instructions** - Make it easy for reviewer to validate

### During Review Period:

1. **Respond quickly** - Within 24 hours of any questions
2. **Provide additional materials** - Screenshots, videos, docs as requested
3. **Offer live demo** - If reviewer wants to see features in action
4. **Be transparent** - Honest about current vs planned features

---

**Document Version**: 1.0
**Created**: 2025-10-08
**Purpose**: Internal validation and reviewer expectation setting
**Last Review**: Before application submission
