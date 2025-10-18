# Google Ads API Application & Integration Guide

**Purpose**: Complete guide to Google Ads API integration and production access application
**Last Updated**: 2025-10-09
**For**: Claude on iOS (Linear MCP access)

---

## 🎯 Overview

**What**: SEO Ads Expert requires Google Ads API **Basic Access** for production use

**Why**: Read campaign data + apply user-approved optimizations to Google Ads accounts

**Current Status**:
- ✅ Test Access obtained (customer ID 9495806872)
- ⏳ Privacy Policy & Terms of Service documented (not yet live)
- ⏳ OAuth Consent Screen configured (awaiting verification)
- ⏳ Demo mode implementation pending
- ⏳ Screencast recording pending
- 📋 Ready for Basic Access application when prerequisites complete

---

## 📋 Application Prerequisites (Must Complete First)

### 1. OAuth Consent Screen Verification

**File**: `docs/google-ads-api-application/oauth-consent-screen-setup.md`

**Status**: ⚠️ **BLOCKER** - Must be "Published" before applying

**Required Steps**:
1. Configure OAuth consent screen in Google Cloud Console
2. Add app information (name, logo, support email)
3. Add privacy policy URL: `https://littlebearapps.com/privacy`
4. Add terms of service URL: `https://littlebearapps.com/terms`
5. Add authorized domain: `littlebearapps.com`
6. Add scope: `https://www.googleapis.com/auth/adwords`
7. Submit for verification
8. **Wait 2-5 business days** for "Published" status

**Why Required**: Google rejects API applications with unverified consent screens

**Current Checklist**:
- [ ] OAuth consent screen submitted for verification
- [ ] Status changed from "Testing" to "Published"
- [ ] All URLs accessible and correct
- [ ] Domain verification complete

---

### 2. Privacy Policy (Must Be Live)

**File**: `docs/google-ads-api-application/privacy-policy-requirements.md`

**Status**: ✅ **DOCUMENTED** (not yet published to website)

**URL**: `https://littlebearapps.com/privacy` (must be live)

**Required Sections** (9 total):
1. **What Data We Collect** - Google Ads API data types, retention periods
2. **How We Use Your Data** - Budget optimization, performance analysis, ML training
3. **Data Storage & Security** - Encryption (AES-256), access controls, audit logs
4. **Data Sharing** - "We do NOT share your Google Ads data with third parties"
5. **Third-Party Services** - Google APIs, RapidAPI (no data sharing)
6. **Your Rights** - GDPR/CCPA rights (access, deletion, portability, opt-out)
7. **Data Retention** - 7-day cache, 90-day audit logs, deletion procedures
8. **Cookies & Tracking** - OAuth tokens only, no tracking cookies
9. **Contact Information** - privacy@littlebearapps.com, support@littlebearapps.com

**Why Required**: Google's API policy mandates comprehensive privacy policy

**Current Checklist**:
- [x] Privacy policy drafted with all 9 sections
- [ ] Published to littlebearapps.com/privacy
- [ ] URL accessible (no 404 errors)
- [ ] Professionally formatted (not plain text)
- [ ] Mentions Google Ads API compliance
- [ ] Includes GDPR/CCPA compliance statements

---

### 3. Terms of Service (Must Be Live)

**File**: `docs/google-ads-api-application/terms-of-service-draft.md`

**Status**: ✅ **DOCUMENTED** (not yet published to website)

**URL**: `https://littlebearapps.com/terms` (must be live)

**Required Sections** (15 total):
1. Agreement to Terms
2. Service Description (Google Ads optimization with human-in-the-loop)
3. User Account and Access
4. User Responsibilities (account ownership, review/approval required)
5. Acceptable Use Policy
6. Google Ads API Compliance
7. Service Availability and Modifications
8. Fees and Payment
9. Intellectual Property
10. Limitation of Liability
11. Indemnification
12. Termination
13. General Provisions
14. Contact Information
15. Acknowledgment

**Why Required**: Legal protection and Google API policy compliance

**Current Checklist**:
- [x] Terms of Service drafted with all 15 sections
- [ ] Published to littlebearapps.com/terms
- [ ] URL accessible (no 404 errors)
- [ ] Professionally formatted (not plain text)
- [ ] Mentions Google Ads API compliance
- [ ] User responsibilities clearly stated

---

## 🎥 Demo Materials Requirements

### 1. Screencast (5-Minute Video)

**File**: `docs/google-ads-api-application/screencast-script.md`

**Status**: ⏳ **PENDING** - Script ready, recording not started

**Required Demonstrations** (7 key features):
1. **OAuth Authorization** - User links Google Ads account via browser
2. **Data Analysis** - CLI shows campaign performance analysis
3. **ML Recommendations** - Thompson Sampling budget allocations with confidence scores
4. **Human-in-the-Loop** - Preview changes in CSV format (before → after)
5. **Approval Workflow** - User confirms changes via `--confirm` flag
6. **Audit Trail** - SQLite query showing change history
7. **Rollback** - Undo a change using audit log

**Format**:
- 5 minutes maximum (Google guideline)
- Screen recording + voiceover explanation
- Use test account only (no real customer data)
- Upload to YouTube (unlisted) or Loom

**Why Required**: Google reviewers need to see the product in action

**Current Checklist**:
- [x] Screencast script written (7 scenes documented)
- [ ] Test Google Ads account prepared with sample data
- [ ] Screen recording software ready (QuickTime, Loom, etc.)
- [ ] Voiceover script reviewed and practiced
- [ ] Recording completed and uploaded
- [ ] URL accessible (not private/restricted)

---

### 2. Screenshots (Minimum 8)

**File**: `docs/google-ads-api-application/SUBMISSION_CHECKLIST.md` Section "Demo Materials"

**Status**: ⏳ **PENDING** - Template ready, screenshots not taken

**Required Screenshots** (CLI demonstration):
1. OAuth consent screen in browser (during CLI auth flow)
2. Terminal showing recommendations output with ML confidence scores
3. Generated CSV file with before → after diffs
4. Terminal showing approval prompt and user confirmation
5. SQLite query showing audit log entries
6. Terminal showing rollback command execution
7. Config file showing auto-apply settings (disabled by default)
8. Documentation page showing security measures (privacy policy)

**Format**: PNG or JPG, clearly labeled, no sensitive data

**Why Required**: Visual evidence of compliance features

**Current Checklist**:
- [ ] Test account data populated (campaigns, ads, keywords)
- [ ] Screenshots taken and saved
- [ ] All images clearly labeled (01-oauth-consent.png, etc.)
- [ ] No sensitive data visible (customer IDs, real budgets)
- [ ] Screenshots show all 8 required features

---

### 3. Demo Account

**Status**: ✅ **CREATED** - Google Ads account 9495806872 (Test Access approved)

**Requirements**:
- Test Google Ads account with sample campaigns
- Populated with realistic data (not empty)
- Recommendations visible and ready to demo
- Temporary credentials prepared (no 2FA blocking access)
- Instructions document for reviewers

**Current Checklist**:
- [x] Test account created (customer ID 9495806872)
- [x] Sample campaigns created
- [ ] Sample data populated (ads, keywords, performance)
- [ ] Recommendations ready to demonstrate
- [ ] Temporary credentials prepared for reviewers
- [ ] Instructions document written

---

## 🔐 Authentication & Integration Status

### Current Integration

**APIs Integrated** ✅:
- **Google Search Console**: Connected via unified OAuth (sc-domain:littlebearapps.com)
- **Google Analytics**: Connected with GA4 property 497547311
- **Google Ads**: Connected with customer ID 9495806872 and developer token
- **RapidAPI Real-Time Web Search**: SERP analysis (20,000 calls/month)
- **RapidAPI Keyword Insight**: Keyword expansion (2,000 calls/day)

**Authentication Strategy**:
- **Application Default Credentials (ADC)**: Short-lived tokens via `gcloud auth application-default login`
- **OAuth2 Refresh Token**: For Google Ads, Analytics, Search Console APIs
- **Unified OAuth Flow**: Single authorization for all 3 Google APIs
- **No Service Account JSON**: Security risk (long-lived keys), ADC provides auto-rotation

---

### API Access Levels

**Current**: ✅ **Test Access** (approved for customer ID 9495806872)
- 15,000 operations/day
- Access to test account only
- Sufficient for development and testing
- Cannot access other Google Ads accounts

**Target**: **Basic Access** (application pending)
- 15,000 operations/day (same as Test Access)
- Access to any linked Google Ads account (with user OAuth consent)
- Enables production use with real customers
- Requires completed application + demo materials

**Future**: **Standard Access** (not requesting yet)
- 1,000,000+ operations/day
- Requires usage history and compliance track record
- Apply after 90 days of Basic Access usage

---

### Rate Limiting & Quota Management

**Google Ads API Quotas**:
- 15,000 operations/day (Basic Access limit)
- Rate limiting handled by `src/utils/rate-limiter.ts`
- Intelligent caching (7-day TTL) reduces API calls
- Smart batching for bulk operations

**Cost Controls**:
- Real-time monitoring via audit logs
- Budget limits enforced (per mutation, per account, per day)
- Alert triggers on threshold breaches (80%, 95%, 100%)
- Auto-pause on limit exceeded

**Performance**:
- Plan generation: 11 seconds end-to-end
- API efficiency: 3-10 SERP calls per run
- Smart precedence: KWP CSV > GSC > RapidAPI

---

## 📝 Application Form Preparation

### Company Information

**File**: `docs/google-ads-api-application/SUBMISSION_CHECKLIST.md`

**Required Fields**:
- Company name: **Little Bear Apps**
- Website: **https://littlebearapps.com** (must be live and professional)
- Contact email: **nathan@littlebearapps.com**
- Business type: **Software Development / SaaS Tools**

**Current Checklist**:
- [x] Company information documented
- [ ] Website live and professional (littlebearapps.com)
- [ ] Contact email functional (nathan@littlebearapps.com)
- [ ] All support emails configured (support@, privacy@, security@)

---

### Use Case Description

**Template**: See `docs/google-ads-api-application/SUBMISSION_CHECKLIST.md` Section "Use Case Description"

**Key Points to Emphasize**:
- **Human-in-the-loop workflow** - All changes require user approval
- **Thompson Sampling ML** - Transparent budget optimization with confidence scores
- **Safety guardrails** - Budget caps, rollback, kill switch
- **Audit trail** - 90-day retention, GDPR/CCPA compliant
- **SaaS future plans** - CLI now, web UI for production SaaS

**Current Status**: ✅ Template ready (400-500 words, emphasizes compliance)

---

### Technical Details

**Platform**: Node.js/TypeScript CLI (sufficient for Basic Access; web UI for future SaaS)

**Authentication**: OAuth 2.0 with user consent (unified flow for Google APIs)

**Storage**: SQLite with 7-day cache, 90-day audit log retention

**Operations**: Read + Write (with human approval required)

**Daily Operations**: 1,000-2,000 during testing phase

**Compliance**: GDPR/CCPA, AES-256 encryption, tamper-evident audit logs

**Current Checklist**:
- [x] Technical architecture documented
- [x] Storage strategy defined (SQLite, 7-day cache, 90-day audit)
- [x] Compliance features implemented (GDPR/CCPA, encryption, audit)
- [ ] All features demonstrated in screencast

---

## 🚀 Human-in-the-Loop Compliance

### Required Features (All Implemented)

**1. Preview/Diff Display**:
- ✅ CSV files show before → after values
- ✅ Terminal output displays change summary
- ✅ Confidence scores included (Thompson Sampling)

**2. Approval Workflow**:
- ✅ Explicit user confirmation required (`--confirm` flag)
- ✅ Interactive prompts for batch operations
- ✅ Summary counts before applying changes

**3. Auditability**:
- ✅ Audit log accessible (SQLite database)
- ✅ Who/What/When tracked (user ID, timestamp, change details)
- ✅ Before/After values stored
- ✅ Rollback capability (restore previous state)
- ✅ CSV/JSON export for compliance reports

**4. Auto-Apply Controls** (if implemented):
- ✅ Per-feature toggles (config file settings)
- ✅ Daily operation caps (max_operations parameter)
- ✅ Entity scoping (target_campaigns flag)
- ✅ Kill switch (disable_all config or --dry-run)
- ✅ Email summaries (notification config)
- ✅ Default: OFF (opt-in via config)

**5. ML Transparency**:
- ✅ Confidence intervals displayed (CSV output)
- ✅ Expected impact estimates (budget recommendations)
- ✅ "ML-Suggested" labeling (marked in output files)
- ✅ Explanations provided (reason column in CSV)
- ✅ User approval required (--confirm flag)

**6. Security**:
- ✅ Token encryption at rest (AES-256)
- ✅ Access logging for token usage
- ✅ Data retention policy enforced (7-day cache, 90-day audit)
- ✅ Deletion procedure documented and functional

---

## 📅 Application Timeline

### Pre-Submission Phase (2-4 Weeks)

**Week 1-2**: Prerequisites
- [ ] Publish privacy policy to littlebearapps.com/privacy
- [ ] Publish terms of service to littlebearapps.com/terms
- [ ] Submit OAuth consent screen for verification
- [ ] Wait 2-5 business days for "Published" status

**Week 2-3**: Demo Materials
- [ ] Prepare test account with sample data
- [ ] Record 5-minute screencast (7 scenes)
- [ ] Take 8 required screenshots
- [ ] Upload screencast to YouTube (unlisted)
- [ ] Write reviewer instructions document

**Week 3-4**: Final Preparation
- [ ] Verify all URLs accessible (privacy, ToS, screencast)
- [ ] Test demo credentials (can log in without 2FA)
- [ ] Proofread application form answers
- [ ] Run all quality checks (OAuth, privacy, ToS, demo)

---

### Submission Phase (1 Day)

**Optimal Submission Window**:
- **Day**: Tuesday, Wednesday, or Thursday
- **Time**: 9:00 AM - 11:00 AM PST
- **Avoid**: Mondays (review backlog), Fridays (rushed review), holidays

**Pre-Submission Final Check** (30 minutes before):
- [ ] All URLs clicked and verified accessible
- [ ] Screencast plays without errors
- [ ] Demo credentials tested (can log in)
- [ ] Application form saved as draft (proofread once more)

**Submit Application**: https://developers.google.com/google-ads/api/docs/access-levels

---

### Review Phase (2-10 Business Days)

**Daily Monitoring**:
- [ ] Check nathan@littlebearapps.com daily
- [ ] Check support@littlebearapps.com daily
- [ ] Check Google Cloud Console for notifications
- [ ] **Response deadline**: Within 24 hours of any Google inquiry

**If Clarification Requested**:
- [ ] Respond within 24 hours (critical!)
- [ ] Provide additional materials if requested
- [ ] Offer live demo if helpful
- [ ] Document all communications

---

### Approval Phase (Immediate After Review)

**If Approved** ✅:
- [ ] Test immediately with production token
- [ ] Update environment variables with approved token
- [ ] Run authentication test: `npx tsx scripts/test-google-ads-auth.js`
- [ ] Document approval date and token details (securely)
- [ ] Set up monitoring for API usage and quotas

**If Rejected** ❌:
- [ ] Carefully analyze rejection reasons
- [ ] Document specific concerns raised
- [ ] Wait 30 days before resubmitting
- [ ] Address all issues before reapplication

---

## 🔍 Common Review Issues

### Issue 1: Privacy Policy Insufficient

**Symptoms**:
- Google rejects verification
- Email says "privacy policy does not meet requirements"

**Solutions**:
- ✅ Verify all 9 sections included (see privacy-policy-requirements.md)
- ✅ Add explicit "we do NOT share Google Ads data" statement
- ✅ Mention GDPR/CCPA compliance and user rights
- ✅ Include contact emails for privacy requests (privacy@littlebearapps.com)
- ✅ Link privacy policy from app footer and consent screen

---

### Issue 2: App Domain Mismatch

**Symptoms**:
- Verification rejected
- Email mentions domain verification failure

**Solutions**:
- ✅ Ensure authorized domain matches exactly: `littlebearapps.com`
- ✅ Don't include "https://" or "www."
- ✅ Verify domain ownership in Google Search Console if needed
- ✅ Make sure privacy/terms URLs use the same domain

---

### Issue 3: Scope Justification Required

**Symptoms**:
- Google asks why you need `adwords` scope

**Solutions**:
- Provide detailed explanation:
  ```
  SEO Ads Expert uses the Google Ads API to:
  1. Read campaign performance data (impressions, clicks, costs, conversions)
  2. Apply user-approved optimizations (budget adjustments, bid changes, keyword additions)
  3. Maintain audit logs of all changes for rollback capability

  The "adwords" scope is the only scope that provides access to the Google Ads API.
  Users explicitly approve all changes before they are applied to their accounts.
  ```

---

### Issue 4: Demo Account Required

**Symptoms**:
- Google requests a test account for review

**Solutions**:
- ✅ Provide test credentials in follow-up email
- ✅ Ensure test account shows OAuth flow clearly
- ✅ Have sample Google Ads data ready to demonstrate
- ✅ Explain CLI workflow (no web UI yet, but compliance features visible)

---

## 📚 Documentation Resources

### Internal Documentation

**Primary Documents**:
1. `docs/google-ads-api-application/oauth-consent-screen-setup.md` - OAuth setup guide
2. `docs/google-ads-api-application/privacy-policy-requirements.md` - Privacy policy draft
3. `docs/google-ads-api-application/terms-of-service-draft.md` - Terms of service draft
4. `docs/google-ads-api-application/screencast-script.md` - 5-minute demo script
5. `docs/google-ads-api-application/SUBMISSION_CHECKLIST.md` - Complete application checklist

**Supporting Documents**:
- `CLAUDE.md` - Project context and current status
- `.claude-context` - Session state and recent changes
- `docs/TESTS.md` - Test suite documentation

---

### External Resources

**Google Documentation**:
- OAuth Verification Guide: https://support.google.com/cloud/answer/10311615
- User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- OAuth Best Practices: https://developers.google.com/identity/protocols/oauth2/production-readiness
- Google Ads API Docs: https://developers.google.com/google-ads/api/docs/start

**Google Cloud Console**:
- OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent
- API Library: https://console.cloud.google.com/apis/library
- Credentials: https://console.cloud.google.com/apis/credentials

---

## ✅ Final Checklist (Before Submission)

### Prerequisites Complete
- [ ] OAuth consent screen status: "Published" (not "Testing" or "In Review")
- [ ] Privacy policy live at: https://littlebearapps.com/privacy
- [ ] Terms of service live at: https://littlebearapps.com/terms
- [ ] All support emails functional (support@, privacy@, security@, nathan@)

### Demo Materials Ready
- [ ] 5-minute screencast recorded and uploaded (URL accessible)
- [ ] 8 screenshots taken and clearly labeled
- [ ] Test account prepared with sample data
- [ ] Demo credentials tested (no 2FA blocking)
- [ ] Reviewer instructions document written

### Application Form Complete
- [ ] Company information filled out (name, website, email, business type)
- [ ] Use case description written (emphasizes human-in-the-loop + ML transparency)
- [ ] Technical details documented (platform, auth, storage, compliance)
- [ ] Access level: Basic Access (15,000 ops/day)
- [ ] All URLs verified accessible

### Quality Checks Pass
- [ ] All URLs load without errors (privacy, ToS, website, screencast)
- [ ] Screencast demonstrates all 7 required features
- [ ] Screenshots show human-in-the-loop workflow clearly
- [ ] Privacy policy mentions Google Ads API data handling
- [ ] Terms of service includes Google Ads API compliance clause
- [ ] No sensitive data visible in screenshots or screencast

### Submission Timing Optimal
- [ ] Day: Tuesday, Wednesday, or Thursday
- [ ] Time: 9:00 AM - 11:00 AM PST
- [ ] Not during holidays or long weekends

---

## 🎯 Success Criteria

**Before Clicking "Submit"**, ask yourself: **Can a Google reviewer...**

- [ ] Link a Google Ads account via OAuth? (Demo shows this)
- [ ] See ML-ranked recommendations with explanations? (Screenshots show this)
- [ ] Preview detailed diffs before/after? (Screencast demonstrates this)
- [ ] Approve changes and see them applied? (Demo account ready)
- [ ] View comprehensive audit logs? (Feature implemented)
- [ ] Rollback at least one change? (Functionality exists)
- [ ] Enable/disable auto-apply for features? (Controls visible)
- [ ] Use kill switch to stop automation? (Config file shows this)
- [ ] Find privacy policy and ToS? (Public URLs work)
- [ ] Understand data handling and security? (Documentation clear)

**If ANY answer is "No" → DO NOT SUBMIT YET**

---

**Document Created**: 2025-10-09
**For**: SEO Ads Expert Linear Project
**Claude iOS Compatibility**: ✅ Complete Google Ads API application guide without GitHub access
