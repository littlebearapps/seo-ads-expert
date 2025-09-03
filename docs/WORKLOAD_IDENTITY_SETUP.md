# Workload Identity Federation for SEO Ads Expert Tool

## Why Workload Identity Federation?

Instead of downloading JSON keys (security risk), Workload Identity Federation allows your local development machine to authenticate using short-lived tokens. This is Google's recommended approach for enhanced security.

## Option 1: Application Default Credentials (Simplest for Local Dev)

This is the easiest secure method for local development:

### Setup Steps

1. **Install Google Cloud CLI** (if not already installed):
```bash
# macOS
brew install google-cloud-sdk

# Or download from
# https://cloud.google.com/sdk/docs/install
```

2. **Authenticate your local machine**:
```bash
# Login with your Google account
gcloud auth login

# Set application default credentials
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

3. **Create service account** (for Search Console access):
```bash
# Create service account
gcloud iam service-accounts create seo-ads-expert \
  --display-name="SEO Ads Expert Tool"

# Get the service account email
export SA_EMAIL="seo-ads-expert@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

4. **Grant permissions**:
```bash
# Allow your user account to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding ${SA_EMAIL} \
  --member="user:YOUR_EMAIL@gmail.com" \
  --role="roles/iam.serviceAccountTokenCreator"

# Grant Search Console access to service account
# (Still need to add in Search Console UI)
```

5. **Update .env file**:
```bash
# Remove ALL Google credential lines
# No GOOGLE_APPLICATION_CREDENTIALS needed
# No GOOGLE_SERVICE_ACCOUNT_EMAIL needed
# No GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY needed

# Just add:
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=seo-ads-expert@YOUR_PROJECT_ID.iam.gserviceaccount.com
GOOGLE_PROJECT_ID=YOUR_PROJECT_ID
```

6. **Add to Search Console**:
- Go to Google Search Console
- Add `seo-ads-expert@YOUR_PROJECT_ID.iam.gserviceaccount.com` as a user

### Update the Code

Modify `src/connectors/search-console.ts` to support ADC:

```typescript
private async initializeClient(): Promise<void> {
  try {
    const env = validateEnvironment();
    
    // Use Application Default Credentials
    if (env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT) {
      // ADC with impersonation
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        clientOptions: {
          subject: env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT
        }
      });
      
      this.client = google.searchconsole({
        version: 'v1',
        auth: auth,
      });
      
      this.isInitialized = true;
      logger.info('✅ Search Console client initialized with ADC');
      return;
    }
    
    // Fall back to existing JSON key methods...
  }
}
```

## Option 2: Using gcloud CLI Directly (No Code Changes)

Even simpler - just run before using the tool:

```bash
# Set credentials for current session
export GOOGLE_APPLICATION_CREDENTIALS=$(gcloud auth application-default print-access-token)

# Run the tool
npm run plan --product convertmyfile --markets US
```

## Option 3: GitHub Actions / CI/CD (Workload Identity)

For automated deployments without keys:

```yaml
# .github/workflows/seo-planning.yml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/123/locations/global/workloadIdentityPools/github/providers/github'
    service_account: 'seo-ads-expert@PROJECT.iam.gserviceaccount.com'
```

## Security Benefits

### JSON Key Method (Current)
- ❌ Long-lived credentials (never expire)
- ❌ Can be leaked if committed to git
- ❌ Hard to rotate
- ❌ Full account access if compromised

### Workload Identity Federation
- ✅ Short-lived tokens (1 hour expiry)
- ✅ No downloadable keys to leak
- ✅ Automatic token refresh
- ✅ Granular access control
- ✅ Audit logging of all access

## Quick Migration Path

For immediate security improvement without code changes:

1. Delete any downloaded JSON keys
2. Use `gcloud auth application-default login`
3. Remove credential lines from .env
4. Set `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/application_default_credentials.json`

The tool will automatically use your gcloud credentials!

## Recommendation

For your use case (local development):
- **Start with Option 1** (Application Default Credentials)
- **No JSON keys needed** - more secure
- **Minimal code changes** - just credential detection
- **Easy to use** - just run `gcloud auth` once

Would you like me to implement the ADC support in the code?