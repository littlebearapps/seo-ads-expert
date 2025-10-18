# OAuth Consent Screen Setup Guide

**Purpose**: Step-by-step instructions for configuring Google OAuth consent screen for SEO Ads Expert
**Version**: 1.0
**Created**: 2025-10-08

---

## 🎯 Overview

The OAuth consent screen is what users see when they authorize SEO Ads Expert to access their Google Ads account. Google requires this to be properly configured and verified before granting API production access.

**Critical Requirements**:
- ✅ App must be verified (moves from "Testing" to "Published" status)
- ✅ Privacy Policy URL must be live and publicly accessible
- ✅ Terms of Service URL must be live and publicly accessible
- ✅ Support email must be functional
- ✅ App domain must match your website

---

## 📋 Step-by-Step Setup

### Step 1: Access OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (the one with Google Ads API enabled)
3. Navigate to: **APIs & Services** → **OAuth consent screen** (left sidebar)
4. If you haven't created a consent screen yet, you'll see a setup wizard

---

### Step 2: Choose User Type

**Question**: "Who will use this app?"

**Answer**: **External**
- Select "External" (allows any Google account holder to authorize)
- Click "Create"

**Why External?**:
- "Internal" is only for Google Workspace organizations
- SEO Ads Expert will be used by external Google Ads customers
- This is the standard choice for public applications

---

### Step 3: App Information

**Fill out the following fields**:

#### **App name***
```
SEO Ads Expert
```
**Why**: This is the name users see when authorizing your app

---

#### **User support email***
```
support@littlebearapps.com
```
**Why**: Users contact this email for help with authorization
**Verify**: Make sure this email is set up and monitored

---

#### **App logo** (Optional but recommended)
- Upload a 120x120px logo for SEO Ads Expert
- PNG or JPG format
- Shows on consent screen (builds trust)

**If you don't have a logo yet**: Skip for now, can add later

---

#### **Application home page** (Optional but recommended)
```
https://littlebearapps.com
```
**Why**: Links to your main website
**Verify**: Make sure littlebearapps.com is live and professional

---

#### **Application privacy policy link***
```
https://littlebearapps.com/privacy
```
**Why**: Required by Google to show how you handle user data
**CRITICAL**: This page MUST be live before submitting for verification

**Verify**:
- [ ] URL is publicly accessible (no login required)
- [ ] Page includes all 9 sections from privacy-policy-requirements.md
- [ ] Page mentions Google Ads API data handling
- [ ] Contact emails are listed (privacy@, security@, support@)

---

#### **Application terms of service link***
```
https://littlebearapps.com/terms
```
**Why**: Required by Google to define user agreements
**CRITICAL**: This page MUST be live before submitting for verification

**Verify**:
- [ ] URL is publicly accessible (no login required)
- [ ] Page includes all sections from terms-of-service-draft.md
- [ ] Page mentions Google Ads API compliance
- [ ] User responsibilities clearly stated

---

#### **Authorized domains***
```
littlebearapps.com
```
**Why**: Restricts redirect URIs and links to this domain only
**Format**: No "https://" or "www." prefix - just the domain

**If you need multiple domains** (e.g., staging):
```
littlebearapps.com
staging.littlebearapps.com
```

---

#### **Developer contact information***
```
nathan@littlebearapps.com
```
**Why**: Google contacts this email during the review process
**CRITICAL**: Monitor this email closely during application review

---

**Click "SAVE AND CONTINUE"**

---

### Step 4: Scopes

**What are scopes?**: Permissions your app requests from users

**Required Scope for SEO Ads Expert**:

1. Click "ADD OR REMOVE SCOPES"
2. In the search box, enter: `adwords`
3. Check the box for:
   ```
   https://www.googleapis.com/auth/adwords
   ```
   **Description**: "View and manage your Google Ads accounts"

4. Scroll down and click "UPDATE"

**Verify**:
- [ ] Only `https://www.googleapis.com/auth/adwords` is selected
- [ ] No other unnecessary scopes are added

**Why only one scope?**:
- Google prefers minimal necessary permissions
- More scopes = longer review process
- Easier to justify in application

**Click "SAVE AND CONTINUE"**

---

### Step 5: Test Users (Testing Mode Only)

**What this section is for**: While your app is in "Testing" status, only these email addresses can authorize it.

**During Development**:
1. Click "ADD USERS"
2. Add your own Google account email(s):
   ```
   nathan@littlebearapps.com
   your-test-account@gmail.com
   ```
3. Add any team members who need to test
4. Click "SAVE AND CONTINUE"

**After Verification** (Published status):
- This section becomes irrelevant
- Any Google account holder can authorize your app
- No need to pre-approve users

**Click "SAVE AND CONTINUE"**

---

### Step 6: Summary and Verification

**Review Page**: Double-check all information

**Verification Status**:

You'll see one of these statuses:

#### **Status: "Testing"** (Default)
- App is not verified
- Only test users can authorize
- Limited to 100 users maximum
- **Action Required**: Submit for verification

#### **Status: "In Review"**
- Verification submitted
- Google is reviewing your app
- Typically takes 2-5 business days
- Monitor your developer contact email

#### **Status: "Published"** (Goal)
- App is verified and live
- Any Google account holder can authorize
- Ready for Google Ads API production access
- ✅ You can proceed with API application

---

### Step 7: Submit for Verification

**If your status is "Testing"**:

1. Click **"PUBLISH APP"** button (top of OAuth consent screen page)
2. A dialog will appear asking you to confirm
3. Review the checklist:
   - [ ] Privacy policy URL is live
   - [ ] Terms of service URL is live
   - [ ] Support email is functional
   - [ ] App logo uploaded (optional but recommended)
   - [ ] Authorized domains match your website

4. Click **"CONFIRM"** or **"SUBMIT FOR VERIFICATION"**

**What happens next**:
- Google's Trust & Safety team reviews your app
- They check your privacy policy, terms, and app functionality
- They may contact your developer email with questions
- Review typically takes **2-5 business days** (can be longer)
- You'll receive an email when verification is complete

---

### Step 8: While Waiting for Verification

**During the review period**:

✅ **You CAN**:
- Continue using test users (up to 100)
- Test OAuth flow with your own account
- Develop and test SEO Ads Expert functionality
- Prepare demo materials for API application
- Work on privacy policy and terms of service improvements

❌ **You CANNOT**:
- Allow arbitrary users to authorize your app
- Submit Google Ads API application (wait for "Published" status)
- Use production Google Ads accounts (unless added as test users)

**Monitoring**:
- Check developer contact email daily
- Respond to Google promptly if they request changes
- Be prepared to provide additional documentation if asked

---

## 🔍 Verification Checklist

**Before submitting for verification, confirm**:

### Required Pages (Must Be Live)
- [ ] `https://littlebearapps.com` - Professional landing page
- [ ] `https://littlebearapps.com/privacy` - Complete privacy policy (9 sections)
- [ ] `https://littlebearapps.com/terms` - Complete terms of service

### Required Emails (Must Be Functional)
- [ ] `support@littlebearapps.com` - User support email
- [ ] `privacy@littlebearapps.com` - Privacy requests email
- [ ] `security@littlebearapps.com` - Security incidents email
- [ ] `nathan@littlebearapps.com` - Developer contact email

### OAuth Consent Screen Fields
- [ ] App name: "SEO Ads Expert"
- [ ] User support email: support@littlebearapps.com
- [ ] Developer contact: nathan@littlebearapps.com
- [ ] Privacy policy URL: https://littlebearapps.com/privacy
- [ ] Terms of service URL: https://littlebearapps.com/terms
- [ ] Authorized domain: littlebearapps.com
- [ ] Scope: https://www.googleapis.com/auth/adwords (only)

### Content Requirements
- [ ] Privacy policy mentions Google Ads data handling
- [ ] Privacy policy includes "we do NOT share" statement
- [ ] Terms of service mentions Google Ads API compliance
- [ ] Both pages are professionally formatted (not plain text)
- [ ] Both pages load quickly on mobile devices
- [ ] No broken links or images on either page

---

## 🚨 Common Verification Issues

### Issue 1: "Privacy Policy Does Not Meet Requirements"

**Symptoms**:
- Google rejects verification
- Email says "privacy policy insufficient"

**Solutions**:
- Verify all 9 sections from privacy-policy-requirements.md are included
- Add explicit "we do NOT share Google Ads data" statement
- Mention GDPR/CCPA compliance and user rights
- Include contact emails for privacy requests
- Link privacy policy from app footer and consent screen

---

### Issue 2: "App Domain Mismatch"

**Symptoms**:
- Verification rejected
- Email mentions domain verification failure

**Solutions**:
- Ensure authorized domain matches exactly: `littlebearapps.com`
- Don't include "https://" or "www."
- Verify domain ownership in Google Search Console if needed
- Make sure privacy/terms URLs use the same domain

---

### Issue 3: "Scope Justification Required"

**Symptoms**:
- Google asks why you need `adwords` scope

**Solutions**:
- Provide detailed explanation in follow-up email:
  ```
  SEO Ads Expert uses the Google Ads API to:
  1. Read campaign performance data (impressions, clicks, costs, conversions)
  2. Apply user-approved optimizations (budget adjustments, bid changes, keyword additions)
  3. Maintain audit logs of all changes for rollback capability

  The "adwords" scope is the only scope that provides access to the Google Ads API.
  Users explicitly approve all changes before they are applied to their accounts.
  ```

---

### Issue 4: "Test Account Required"

**Symptoms**:
- Google requests a demo/test account

**Solutions**:
- Provide test credentials in follow-up email
- Ensure test account shows OAuth flow clearly
- Have sample Google Ads data ready to demonstrate
- Explain CLI workflow in email if no web UI yet

---

## 📧 Sample Response to Google Verification Request

**If Google asks for more information**:

```
Subject: Re: OAuth Verification - SEO Ads Expert

Dear Google Trust & Safety Team,

Thank you for reviewing SEO Ads Expert. I'm happy to provide additional information:

APPLICATION PURPOSE:
SEO Ads Expert is a Google Ads optimization tool that helps advertisers improve
campaign performance through machine learning-driven recommendations. The tool
analyzes performance data and provides budget allocation suggestions with
human-in-the-loop approval required before any changes are applied.

SCOPE JUSTIFICATION:
We request the "adwords" scope (https://www.googleapis.com/auth/adwords) to:
1. Read campaign performance data for analysis
2. Apply user-approved optimizations to Google Ads accounts
3. Track changes for audit logging and rollback functionality

DATA HANDLING:
- User data is stored in encrypted SQLite database
- Performance cache: 7-day retention, then auto-deleted
- Audit logs: 90-day retention
- No third-party data sharing
- Complete privacy policy: https://littlebearapps.com/privacy

DEMO ACCESS:
[If requested] I've created a test account for your review:
- Email: [test-account@domain.com]
- Password: [temporary-password]
- Instructions: [link to demo documentation]

Please let me know if you need any additional information.

Best regards,
Nathan
nathan@littlebearapps.com
```

---

## ✅ Verification Success

**When your app is verified, you'll receive an email**:

Subject: "Your app SEO Ads Expert has been verified"

**Status changes to "Published"**:
- OAuth consent screen shows "Verified by Google" badge
- Any Google account holder can now authorize your app
- No more 100 user limit
- ✅ **You can now apply for Google Ads API Basic Access**

**Next Steps After Verification**:
1. Update OAuth consent screen status in your notes
2. Proceed with Google Ads API application (SUBMISSION_CHECKLIST.md)
3. Begin implementing --demo mode for screencast
4. Prepare application form answers

---

## 🔗 Quick Links

**Google Cloud Console**:
- OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent
- API Library: https://console.cloud.google.com/apis/library
- Credentials: https://console.cloud.google.com/apis/credentials

**Documentation**:
- OAuth Verification Guide: https://support.google.com/cloud/answer/10311615
- User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- OAuth Best Practices: https://developers.google.com/identity/protocols/oauth2/production-readiness

---

## 📝 Troubleshooting

### "Cannot submit for verification - missing fields"

**Check**:
- Privacy policy URL is entered and accessible
- Terms of service URL is entered and accessible
- Support email is valid
- Developer contact email is valid
- At least one scope is selected

---

### "Domain not verified"

**Solution**:
1. Go to Google Search Console: https://search.google.com/search-console
2. Add property: `littlebearapps.com`
3. Verify ownership via DNS TXT record or HTML file upload
4. Return to OAuth consent screen and retry

---

### "Privacy policy URL not accessible"

**Check**:
- URL returns 200 OK (not 404 or 500)
- Page is publicly accessible (no login required)
- HTTPS is working (certificate valid)
- Page loads in under 3 seconds
- No broken images or CSS

---

## 🎯 Timeline Expectations

| Task | Duration | Notes |
|------|----------|-------|
| Fill out OAuth form | 15-30 min | First time setup |
| Privacy policy live | 1-2 days | Writing + publishing |
| Terms of service live | 1-2 days | Writing + publishing |
| Submit for verification | 5 min | Click "Publish App" |
| **Google review** | **2-5 business days** | Monitor email closely |
| Status → "Published" | Instant | After approval |

**Total Time**: 3-7 days from start to "Published" status

---

**Document Version**: 1.0
**Created**: 2025-10-08
**Purpose**: OAuth consent screen configuration guide for Google Ads API application
