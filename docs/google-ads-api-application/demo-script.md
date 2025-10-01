# Google Ads API Demo Script

## If Google requests a demo, use this script:

### 1. Show Authentication Flow
```bash
# Show OAuth authentication
npx tsx scripts/test-unified-auth.js
```
Expected output: "✅ All authentication tests passed"

### 2. Generate Performance Report
```bash
# Generate marketing plan for our product
npx tsx src/cli.ts plan --product convertmyfile
```
This creates reports in `plans/convertmyfile/[date]/`

### 3. Show Generated Reports
```bash
# List generated files
ls -la plans/convertmyfile/2025-09-27/
```
Shows 8 professional marketing files (CSV, JSON, MD formats)

### 4. Display Sample Report
```bash
# Show markdown report
cat plans/convertmyfile/2025-09-27/convertmyfile_marketing_plan.md | head -50
```

### 5. Show Budget Optimization
```bash
# Run Thompson Sampling optimizer
npx tsx src/cli.ts optimize-budget --product convertmyfile
```

## Key Points to Emphasize:
- ✅ Internal use only for our accounts
- ✅ Read-only operations for analysis
- ✅ All changes reviewed manually
- ✅ Complements Google Ads UI
- ✅ Custom reports for our specific KPIs