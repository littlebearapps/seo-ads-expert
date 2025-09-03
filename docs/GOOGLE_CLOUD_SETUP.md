# Google Cloud Service Account Setup for Search Console API

## For New "Secure-by-Default" Google Cloud Organizations

If your Google Cloud organization was created after May 15, 2024, it has enhanced security settings that may block service account key creation by default.

## Step 1: Check if Key Creation is Blocked

```bash
# Check organization policies
gcloud resource-manager org-policies describe \
  constraints/iam.disableServiceAccountKeyCreation \
  --organization=YOUR_ORG_ID
```

If you see `enforced: true`, key creation is blocked.

## Step 2: Enable Service Account Key Creation (if needed)

### Option A: Temporary Override for Your Project
```bash
# Allow key creation for your specific project
gcloud resource-manager org-policies set-policy \
  --project=YOUR_PROJECT_ID \
  policy.yaml
```

Create `policy.yaml`:
```yaml
constraint: constraints/iam.disableServiceAccountKeyCreation
booleanPolicy:
  enforced: false
```

### Option B: Use Workload Identity Federation (Recommended)
Instead of JSON keys, use more secure workload identity. However, for local development, JSON keys are simpler.

## Step 3: Create Service Account and JSON Key

### 1. Create Service Account
```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create service account
gcloud iam service-accounts create seo-ads-expert \
  --display-name="SEO Ads Expert Tool" \
  --description="Service account for Search Console API access"
```

### 2. Grant Search Console Permissions
```bash
# Get the service account email
export SA_EMAIL="seo-ads-expert@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# Grant required role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/webmasters.readOnly"
```

### 3. Create JSON Key
```bash
# Create key and save to file
gcloud iam service-accounts keys create \
  ~/seo-ads-expert-key.json \
  --iam-account=${SA_EMAIL}
```

## Step 4: Enable Search Console API

```bash
# Enable the API
gcloud services enable searchconsole.googleapis.com
```

## Step 5: Add Service Account to Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click on your property
3. Go to Settings → Users and permissions
4. Click "Add user"
5. Enter your service account email: `seo-ads-expert@YOUR_PROJECT_ID.iam.gserviceaccount.com`
6. Set permission to "Full" or "Restricted" (read-only is sufficient)

## Step 6: Configure the Tool

### Option 1: Using JSON Key File (Recommended)
```bash
# In your .env file
GOOGLE_APPLICATION_CREDENTIALS=/Users/you/seo-ads-expert-key.json

# Remove or comment out the individual credential lines
# GOOGLE_SERVICE_ACCOUNT_EMAIL=...
# GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...
```

### Option 2: Using Individual Credentials
```bash
# Extract from JSON key file
cat ~/seo-ads-expert-key.json

# Copy values to .env
GOOGLE_SERVICE_ACCOUNT_EMAIL=seo-ads-expert@YOUR_PROJECT_ID.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=YOUR_PROJECT_ID
```

## Troubleshooting

### Error: "Service account keys are disabled"
- Your organization has key creation disabled
- Follow Step 2 to temporarily allow it for your project
- Or ask your org admin to grant an exception

### Error: "Permission denied" 
- Ensure the Search Console API is enabled
- Verify the service account has been added to Search Console
- Check that the property URL in SEARCH_CONSOLE_SITES matches exactly

### Error: "DECODER routines::unsupported"
- This usually means the private key format is incorrect
- Use the JSON key file method instead of copying individual values
- Ensure no extra spaces or line breaks in the private key

## Security Best Practices

1. **Restrict Key Permissions**: Only grant necessary roles
2. **Rotate Keys Regularly**: Delete old keys after creating new ones
3. **Use Key File Method**: Safer than embedding credentials in .env
4. **Store Securely**: Never commit key files to git
5. **Consider Workload Identity**: For production, use federated identity

## Quick Test

After setup, test the connection:
```bash
npx tsx src/cli.ts test
```

This will verify both RapidAPI and Google Search Console connections.