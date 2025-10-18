# Google Ads API Demo Script (Quick Reference)

**Purpose**: Quick CLI demo for Google reviewers (if requested)
**Version**: 2.0 - Human-in-the-Loop Platform
**Updated**: 2025-10-08

---

## ⚠️ Important Note

**For v2.0 Application**: Use `screencast-script.md` for the comprehensive 5-minute video demo showing the full web UI workflow.

**This document**: Quick CLI commands if Google requests a live command-line demonstration (less likely with v2.0's emphasis on UI).

---

## 🎬 CLI Demo Commands (If Web UI Not Available)

### 0. Run Complete Demo Mode (NEW - Recommended) ✅
```bash
# Run complete interactive demo (no API credentials required)
bash run-demo.sh

# Or with custom output directory
bash run-demo.sh -o my-demo-output
```

**What it shows**:
- 7 scenes matching the screencast script
- Campaign performance overview with realistic data
- ML-ranked recommendations with Thompson Sampling
- Before/after diff preview
- Human approval workflow
- Audit trail with rollback capability
- Automation settings & kill switch
- Security & privacy measures

**Output**:
- Professional terminal visualization with box-drawing tables
- 4 CSV files for offline review:
  - `campaign-performance.csv` - Current campaign data
  - `recommendations.csv` - ML-ranked suggestions with confidence scores
  - `diff-preview.csv` - Before/after comparison
  - `audit-log.csv` - Change history with rollback info

**Advantages**:
- ✅ No API credentials required (uses synthetic data)
- ✅ Matches screencast script exactly (7 scenes)
- ✅ Shows complete human-in-the-loop workflow
- ✅ Demonstrates all safety controls
- ✅ Fast (completes in ~1 second)

---

### 1. Show Authentication (OAuth)
```bash
# Generate OAuth URL
npx tsx scripts/generate-auth-url.js

# After user authorizes, exchange code for token
npx tsx scripts/exchange-code.js [AUTH_CODE]

# Test authenticated connection
npx tsx scripts/test-google-ads-auth.js
```

**Expected Output**: "✅ Authentication successful"

---

### 2. Generate Performance Analysis
```bash
# Generate marketing plan for product
npx tsx src/cli.ts plan --product convertmyfile

# Alternative: Direct analysis
npx tsx src/cli.ts analyze --customer-id 9495806872
```

**Expected Output**: Creates `plans/convertmyfile/[date]/` with 8 files

---

### 3. Show Generated Reports
```bash
# List generated files
ls -la plans/convertmyfile/2025-10-08/

# Display sample markdown report
cat plans/convertmyfile/2025-10-08/convertmyfile_marketing_plan.md | head -50

# Show CSV with recommendations
cat plans/convertmyfile/2025-10-08/recommendations.csv
```

**Expected Output**: Professional marketing files with recommendations

---

### 4. Show Thompson Sampling Optimizer
```bash
# Run budget optimization algorithm
npx tsx src/cli.ts optimize-budget --product convertmyfile --dry-run

# Show optimization recommendations
cat plans/convertmyfile/2025-10-08/budget_optimization.json
```

**Expected Output**: ML-driven budget reallocation suggestions with confidence scores

---

### 5. Show Audit Trail (if available via CLI)
```bash
# View recent changes
npx tsx src/cli.ts audit --recent

# Export audit log
npx tsx src/cli.ts audit --export --output audit.csv
```

**Expected Output**: Change history with before/after values

---

## 🎯 Key Points to Emphasize (During Demo)

### Human-in-the-Loop:
> "Notice that all commands generate recommendations and reports. No changes are applied automatically. In the web UI (see screencast), users review diffs and explicitly approve each change."

### ML Transparency:
> "Thompson Sampling calculations include confidence intervals and expected impact estimates. Users see why the algorithm suggests each change, not just what to change."

### Safety Controls:
> "The `--dry-run` flag shows what would happen without applying changes. In production, users configure daily caps, entity scoping, and have a kill switch."

### Auditability:
> "Every API operation is logged with who/what/when details. Users can export audit logs and rollback recent changes."

### Compliance:
> "OAuth tokens are encrypted at rest. Performance data cached for 7 days, then auto-deleted. GDPR/CCPA compliant data deletion available."

---

## 📺 Preferred Demo Method

**Instead of CLI**: Show the 5-minute screencast (see `screencast-script.md`)

**Why**:
- Visual demonstration of human-in-the-loop workflow
- Shows OAuth consent screen
- Demonstrates diff preview and approval confirmation
- Highlights safety controls (kill switch, rollback)
- More professional and polished

**CLI Demo Only If**:
- Google specifically requests live/interactive demo
- Web UI not built yet
- Need to show backend capabilities

---

## 🔗 Additional Resources

- **Full Screencast Script**: `screencast-script.md`
- **Application Answers**: `application-form-answers.md`
- **Reviewer Checklist**: `reviewer-checklist.md`

---

**Document Version**: 2.0
**Last Updated**: 2025-10-08
**Status**: Supplementary (use screencast as primary demo)
