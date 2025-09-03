# Google Cloud Service Account Setup for Search Console API

## Step-by-Step Guide

### 1. Choose Credential Type
When prompted "Which API are you using?":
- **Select: "Application data"**
- This creates a service account (not OAuth client)

### 2. Create Service Account
On the "Create a service account" screen:

**Service account details:**
- **Service account name**: `seo-ads-expert`
- **Service account ID**: `seo-ads-expert` (auto-fills)
- **Description**: "Service account for SEO Ads Expert tool to access Search Console data"
- Click **"Create and Continue"**

### 3. Grant Service Account Access (Optional)
On the "Grant this service account access to project" screen:
- **Skip this step** - Click **"Continue"**
- (We don't need project-level roles, just Search Console access)

### 4. Grant Users Access (Optional)
On the "Grant users access to this service account" screen:
- **Skip this step** - Click **"Done"**

### 5. Service Account Created!
You'll now see your service account listed. The email will be:
```
seo-ads-expert@YOUR-PROJECT-ID.iam.gserviceaccount.com
```

### 6. Create Key (Optional - Skip if using ADC)

**IMPORTANT**: Since you already have Application Default Credentials (ADC) set up, you can SKIP creating a JSON key! ADC is more secure.

If you need a key for production/CI:
1. Click on the service account email
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON" format
5. Save the downloaded file securely

### 7. Add Service Account to Search Console

**This is the critical step!**

1. Copy the service account email: `seo-ads-expert@YOUR-PROJECT-ID.iam.gserviceaccount.com`
2. Go to [Google Search Console](https://search.google.com/search-console)
3. Select your property (e.g., `https://littlebearapps.com`)
4. Click **Settings** (gear icon) in the left sidebar
5. Click **Users and permissions**
6. Click **Add user** button
7. Enter the service account email
8. Set permission level to **"Restricted"** (read-only is sufficient)
9. Click **Add**

### 8. Test the Connection

Since you're using ADC (already set up with `gcloud auth`), just run:

```bash
# Make sure Google credentials are commented out in .env
# Then test:
npx tsx src/cli.ts test
```

You should see:
```
📊 Google Search Console: ✅ Connected
```

## Troubleshooting

### "Permission denied" error
- Verify the service account is added to Search Console
- Check the property URL matches exactly in your .env file
- Wait 5-10 minutes for permissions to propagate

### "API not enabled" error
- Make sure Search Console API is enabled in your project
- Go to: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com

### ADC not working
- Run: `gcloud auth application-default login` again
- Check: `ls ~/.config/gcloud/application_default_credentials.json`
- Ensure all Google credential lines are commented out in .env

## Security Notes

With your current ADC setup:
- ✅ No JSON keys to download or manage
- ✅ Credentials automatically refresh
- ✅ Most secure option for local development
- ✅ Service account only has access to Search Console (minimal permissions)

## Summary

1. Choose "Application data" ✅
2. Create service account named `seo-ads-expert` ✅
3. Skip role grants ✅
4. Skip key creation (using ADC) ✅
5. Add service account to Search Console ✅
6. Test the connection ✅

The key part is adding the service account email to your Search Console property - that's what grants access!