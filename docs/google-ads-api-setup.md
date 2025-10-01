# Google Ads & Microsoft Ads API Setup Guide

Complete setup guide for integrating Google Ads API and Microsoft Advertising API with SEO Ads Expert tool.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Google Cloud Console Setup](#google-cloud-console-setup)
3. [Google Ads API Configuration](#google-ads-api-configuration)
4. [Microsoft Ads API Configuration](#microsoft-ads-api-configuration)
5. [Authentication Setup](#authentication-setup)
6. [Environment Configuration](#environment-configuration)
7. [Testing Your Setup](#testing-your-setup)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- Google Ads account with **Admin** access
- Google Cloud Console account
- Node.js 16+ installed
- Basic understanding of API authentication

## Google Cloud Console Setup

### Step 1: Create a New Project (or Use Existing)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Name your project (e.g., "SEO Ads Expert API")
5. Click **"Create"**

### Step 2: Enable Google Ads API

1. In your project, go to **APIs & Services > Library**
2. Search for **"Google Ads API"**
3. Click on the result and click **"Enable"**

### Step 3: Create Credentials

1. Go to **APIs & Services > Credentials**
2. Click **"+ Create Credentials"**
3. Select **"OAuth 2.0 Client IDs"**
4. If prompted, configure the OAuth consent screen:
   - Choose **"External"** user type
   - Fill in required fields (App name, User support email, Developer contact)
   - Add your Google account as a test user
   - Click **"Save and Continue"** through all screens
5. Back in Credentials, click **"+ Create Credentials"** again
6. Select **"OAuth 2.0 Client IDs"**
7. Choose **"Desktop application"**
8. Name it (e.g., "SEO Ads Expert Client")
9. Click **"Create"**
10. **Download the JSON file** and save it securely

## Google Ads API Configuration

### Step 1: Apply for Google Ads API Access

1. Go to [Google Ads API Access Request](https://developers.google.com/google-ads/api/docs/access)
2. Fill out the application form:
   - **Use case**: Account management and reporting for SEO optimization
   - **Daily API calls**: Start with 10,000 (can be increased later)
   - **Description**: Tool for analyzing Google Ads performance, waste detection, and quality score optimization
3. Submit and wait for approval (typically 1-3 business days)

### Step 2: Get Your Developer Token

1. Go to [Google Ads](https://ads.google.com)
2. Navigate to **Tools & Settings > Setup > API Center**
3. Apply for a **Developer Token**
4. Copy the token once approved

### Step 3: Get Customer IDs

1. In Google Ads, note your **Customer ID** (10-digit number at top right)
2. Format: Remove dashes (e.g., 123-456-7890 becomes 1234567890)

## Microsoft Ads API Configuration

### Step 1: Create Microsoft Advertising Account

1. Go to [Microsoft Advertising](https://ads.microsoft.com)
2. Sign up for an account if you don't have one
3. Note your **Account ID** and **Customer ID** from the top of the interface

### Step 2: Apply for API Access

1. Go to [Microsoft Advertising Developer Portal](https://developers.ads.microsoft.com/)
2. Sign in with your Microsoft Advertising account
3. Navigate to **"Request API Access"**
4. Fill out the application form:
   - **Primary Use Case**: Campaign management and reporting
   - **Application Type**: Desktop application
   - **Expected Call Volume**: Start with 20,000 calls/day
   - **Description**: SEO and PPC optimization tool for campaign performance analysis
5. Submit application (approval typically takes 1-3 business days)

### Step 3: Get Developer Token

1. Once approved, go to **Developer Portal > Account**
2. Find your **Developer Token** (starts with a letter, followed by numbers)
3. Copy and save this token securely

### Step 4: Register Application in Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory > App registrations**
3. Click **"New registration"**
4. Configure your application:
   - **Name**: SEO Ads Expert Microsoft Ads
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**:
     - Type: Public client/native
     - URI: `http://localhost:3000/callback` (for development)
5. Click **"Register"**
6. Note down:
   - **Application (client) ID**: Your OAuth Client ID
   - **Directory (tenant) ID**: Your Tenant ID

### Step 5: Configure API Permissions

1. In your Azure app registration, go to **"API permissions"**
2. Click **"Add a permission"**
3. Choose **"APIs my organization uses"**
4. Search for **"Microsoft Advertising"**
5. Select **"Delegated permissions"**
6. Check:
   - `ads.manage` - Manage advertising campaigns
   - `ads.read` - View advertising campaigns
7. Click **"Add permissions"**
8. Click **"Grant admin consent"** (if you have admin rights)

### Step 6: Create Client Secret (Optional for Confidential Clients)

1. In your app registration, go to **"Certificates & secrets"**
2. Click **"New client secret"**
3. Add a description (e.g., "SEO Ads Expert Secret")
4. Choose expiration (recommend 12 months)
5. Click **"Add"**
6. **IMPORTANT**: Copy the secret value immediately (it won't be shown again)

### Step 7: Microsoft Ads Account Linking

1. In Microsoft Advertising, go to **Tools > Accounts & Billing > Users**
2. Click **"Invite user"**
3. Enter the email associated with your Azure app
4. Set permissions to **"Admin"** or **"Standard"**
5. Click **"Send invitation"**

## Authentication Setup

### Method 1: OAuth 2.0 Flow (Recommended for Development)

1. **Install Google Auth Library** (already included in project):
   ```bash
   npm install googleapis
   ```

2. **Generate Refresh Token**:
   Create a temporary script `generate-token.js`:
   ```javascript
   const { google } = require('googleapis');
   const fs = require('fs');

   // Load your OAuth2 credentials
   const credentials = JSON.parse(fs.readFileSync('path/to/your/credentials.json'));
   
   const oauth2Client = new google.auth.OAuth2(
     credentials.installed.client_id,
     credentials.installed.client_secret,
     'urn:ietf:wg:oauth:2.0:oob'
   );

   const authUrl = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: ['https://www.googleapis.com/auth/adwords']
   });

   console.log('Go to this URL:', authUrl);
   console.log('Copy the authorization code and run:');
   console.log('node generate-token.js YOUR_AUTH_CODE');
   
   // After getting auth code, run with: node generate-token.js YOUR_CODE
   if (process.argv[2]) {
     oauth2Client.getToken(process.argv[2])
       .then(({ tokens }) => {
         console.log('Refresh Token:', tokens.refresh_token);
         console.log('Save this token securely!');
       })
       .catch(console.error);
   }
   ```

3. **Run the script**:
   ```bash
   node generate-token.js
   # Follow the URL, get the code, then run:
   node generate-token.js YOUR_AUTHORIZATION_CODE
   ```

4. **Save the refresh token** from the output

### Method 2: Service Account (Recommended for Production)

1. In Google Cloud Console, go to **APIs & Services > Credentials**
2. Click **"+ Create Credentials"** > **"Service Account"**
3. Name the service account and click **"Create"**
4. Skip role assignment (click **"Continue"**)
5. Click **"Done"**
6. Click on the created service account
7. Go to **"Keys"** tab
8. Click **"Add Key"** > **"Create new key"**
9. Choose **JSON** format
10. Download and save the key file securely

## Environment Configuration

Create or update your `.env` file:

```env
# Google Ads API Configuration
GOOGLE_ADS_CLIENT_ID=your_oauth_client_id
GOOGLE_ADS_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_ADS_CUSTOMER_IDS=1234567890,0987654321

# For Service Account (alternative)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Optional: Login Customer ID (for manager accounts)
GOOGLE_ADS_LOGIN_CUSTOMER_ID=your_manager_account_id

# Microsoft Ads API Configuration
MICROSOFT_ADS_CLIENT_ID=your_azure_app_client_id
MICROSOFT_ADS_CLIENT_SECRET=your_azure_app_secret
MICROSOFT_ADS_TENANT_ID=your_azure_tenant_id
MICROSOFT_ADS_DEVELOPER_TOKEN=your_microsoft_developer_token
MICROSOFT_ADS_CUSTOMER_ID=your_microsoft_customer_id
MICROSOFT_ADS_ACCOUNT_ID=your_microsoft_account_id
MICROSOFT_ADS_REFRESH_TOKEN=your_microsoft_refresh_token

# Optional: Bing Ads API via RapidAPI (simpler alternative)
RAPIDAPI_BING_KEY=your_rapidapi_key
```

### Environment Variables Explained

#### Google Ads
- **CLIENT_ID/SECRET**: From OAuth2 credentials JSON
- **REFRESH_TOKEN**: Generated from OAuth2 flow
- **DEVELOPER_TOKEN**: From Google Ads API Center
- **CUSTOMER_IDS**: Comma-separated list of account IDs to access
- **LOGIN_CUSTOMER_ID**: Only needed if using manager account access

#### Microsoft Ads
- **CLIENT_ID**: Azure App Registration Application ID
- **CLIENT_SECRET**: Azure App Registration secret (if using confidential client)
- **TENANT_ID**: Azure Active Directory Tenant ID
- **DEVELOPER_TOKEN**: From Microsoft Advertising Developer Portal
- **CUSTOMER_ID**: Microsoft Advertising Customer ID
- **ACCOUNT_ID**: Microsoft Advertising Account ID
- **REFRESH_TOKEN**: Generated from OAuth2 flow

## Testing Your Setup

### Google Ads Tests

#### Test 1: Basic Authentication

```bash
npx tsx src/cli.ts test google-ads-auth
```

#### Test 2: Account Access

```bash
npx tsx src/cli.ts test google-ads-accounts
```

#### Test 3: Data Retrieval

```bash
npx tsx src/cli.ts performance ingest-ads --product testproduct --from google-ads --account 1234567890
```

### Microsoft Ads Tests

#### Test 1: Authentication

```bash
npx tsx src/cli.ts test microsoft-ads-auth
```

#### Test 2: Account List

```bash
npx tsx src/cli.ts test microsoft-ads-accounts
```

#### Test 3: Export to CSV

```bash
npx tsx src/cli.ts microsoft export-csv --product testproduct --output microsoft-ads-import.csv
```

#### Test 4: Bing Keywords API

```bash
npx tsx src/cli.ts test bing-keywords --product testproduct
```

## API Quotas and Limits

### Google Ads API Limits

- **Basic access**: 15,000 operations per day
- **Standard access**: 50,000 operations per day (requires application)
- **Rate limit**: 100 queries per 100 seconds per account

### Microsoft Ads API Limits

- **Developer access**: 20,000 calls per day
- **Standard access**: 100,000 calls per day (requires justification)
- **Rate limit**: 100 calls per minute per customer
- **Sandbox**: Unlimited calls for testing (separate environment)

### Operation Costs

Different API calls have different "operation" costs:
- **Account info**: 1 operation
- **Campaign list**: 1 operation per 10,000 campaigns
- **Keyword performance**: 1 operation per report row
- **Search terms report**: 1 operation per report row

### Optimization Tips

1. **Batch requests** when possible
2. **Use date ranges** to limit data volume  
3. **Cache results** (tool already includes 24-hour caching)
4. **Filter fields** to only get what you need

## Common Query Examples

### Get Campaign Performance

```javascript
const query = `
  SELECT 
    campaign.id,
    campaign.name,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC
`;
```

### Get Search Terms Report

```javascript
const query = `
  SELECT
    campaign.id,
    ad_group.id,
    search_term_view.search_term,
    search_term_view.status,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
  FROM search_term_view
  WHERE segments.date DURING LAST_30_DAYS
    AND search_term_view.status IN ('ADDED', 'NONE')
`;
```

### Get Quality Score Data

```javascript
const query = `
  SELECT
    campaign.id,
    ad_group.id,
    ad_group_criterion.keyword.text,
    ad_group_criterion.quality_info.quality_score,
    ad_group_criterion.quality_info.creative_quality_score,
    ad_group_criterion.quality_info.post_click_quality_score,
    ad_group_criterion.quality_info.search_predicted_ctr
  FROM keyword_view
  WHERE segments.date DURING LAST_7_DAYS
    AND ad_group_criterion.quality_info.quality_score IS NOT NULL
`;
```

## Troubleshooting

### Common Issues

#### 1. "Invalid developer token"
- **Solution**: Verify your developer token in Google Ads API Center
- **Check**: Token must be from the same Google account that owns the ads account

#### 2. "OAuth2 authentication failed"
- **Solution**: Regenerate refresh token using the OAuth2 flow
- **Check**: Client ID and secret match your Google Cloud project

#### 3. "Customer not found" 
- **Solution**: Verify Customer ID format (10 digits, no dashes)
- **Check**: Your Google account has access to this customer

#### 4. "Insufficient permissions"
- **Solution**: Ensure your Google account has Admin access to Google Ads account
- **Check**: If using manager account, set LOGIN_CUSTOMER_ID

#### 5. "Quota exceeded"
- **Solution**: Implement caching and reduce query frequency
- **Check**: Monitor your daily operations in Google Cloud Console

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=debug
```

This will show:
- API request details
- Response data structure
- Authentication flow steps
- Quota usage information

### Support Resources

- **Google Ads API Documentation**: https://developers.google.com/google-ads/api/docs
- **Client Library Docs**: https://developers.google.com/google-ads/api/docs/client-libs/nodejs
- **Community Support**: https://developers.google.com/google-ads/api/support
- **Issue Tracker**: https://issuetracker.google.com/issues/new?component=187191&template=0

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use service accounts** in production environments
3. **Rotate tokens regularly** (every 6-12 months)
4. **Limit scope** to minimum required permissions
5. **Monitor API usage** for unexpected spikes
6. **Encrypt credential files** at rest

## Next Steps

Once your Google Ads API is set up:

1. **Test data ingestion**: Run `ingest-ads` command with your account
2. **Verify data quality**: Check generated reports for accuracy
3. **Set up monitoring**: Monitor API quotas and error rates
4. **Configure scheduling**: Set up regular data imports
5. **Explore advanced features**: Implement automated bid management and budget optimization

## Microsoft Ads Specific Resources

- **Microsoft Advertising API Documentation**: https://docs.microsoft.com/en-us/advertising/guides/
- **API Reference**: https://docs.microsoft.com/en-us/advertising/campaign-management-service/
- **SDK Downloads**: https://docs.microsoft.com/en-us/advertising/guides/client-libraries
- **Sandbox Environment**: https://developers.ads.microsoft.com/Account/Sandbox
- **Support Forum**: https://social.msdn.microsoft.com/Forums/en-US/home?forum=BingAds

---

*Last updated: 2025-09-29*
*SEO Ads Expert Tool v2.0*
*Now with Microsoft Advertising API support*