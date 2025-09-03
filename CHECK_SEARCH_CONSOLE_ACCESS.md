# Verify Search Console Access

## Quick Checklist

Please verify in Google Search Console:

1. **Go to**: https://search.google.com/search-console

2. **Check which property you have**:
   - Do you see `littlebearapps.com` (Domain property)?
   - Or do you see `https://littlebearapps.com` (URL prefix)?

3. **Click on your property** to select it

4. **Go to Settings** → **Users and permissions**

5. **Check if you see**:
   - `seo-ads-expert@seo-ads-expert.iam.gserviceaccount.com` in the user list
   - What permission level it has (should be "Restricted" or "Full")

## If the service account is NOT listed:

1. Click **"ADD USER"**
2. Enter: `seo-ads-expert@seo-ads-expert.iam.gserviceaccount.com`
3. Select permission: **"Full"** (to ensure it has all needed access)
4. Click **"Add"**

## Important Notes:

- It can take 5-10 minutes for permissions to propagate
- Domain properties use format: `sc-domain:littlebearapps.com`
- URL properties use format: `https://littlebearapps.com`

## Alternative: Use Service Account Key

If ADC continues to have issues, we can create a service account key:

```bash
# Create a key for the service account
gcloud iam service-accounts keys create ~/seo-ads-expert-key.json \
  --iam-account=seo-ads-expert@seo-ads-expert.iam.gserviceaccount.com

# Then in .env, add:
GOOGLE_APPLICATION_CREDENTIALS=~/seo-ads-expert-key.json
```

This bypasses the impersonation issue by using the service account directly.