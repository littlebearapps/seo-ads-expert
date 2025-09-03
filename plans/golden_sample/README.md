# Ground-Truth CSV Samples

## Purpose

This directory contains **ground-truth CSV exports** from Google Ads Editor that serve as the schema reference for v1.1 CSV generation. These samples prevent import failures by ensuring our generated CSVs match the exact format expected by Ads Editor.

## Setup Process

### Step 1: Create Minimal Campaign Structure

In a scratch Google Ads account, create:

**Campaign Structure:**
- 1 Campaign: "LBA SEO Test Campaign" 
- 2 Ad Groups: "WebP Conversion", "PDF Tools"
- Keywords: Mix of exact/phrase match
- 1 RSA per ad group with headline pinning
- Extensions: Sitelinks, Callouts, Structured Snippets (as Assets)
- 1 Shared Negative List: "LBA Common Negatives"

**Required Elements for Schema Analysis:**
- Campaign with budget, geo targeting (AU/US/GB), device modifiers
- Ad groups with final URLs and CPC settings
- Exact and phrase match keywords
- RSAs with pinned headlines (position 1 = "Chrome Extension")
- Asset-based extensions:
  - Sitelinks: "Features", "Privacy", "Support", "Download"
  - Callouts: "Free Tier", "Privacy-First", "No Login Required"
  - Structured Snippets: Header="Features", Values="WebP→PNG, PDF↔JPG"
- Shared negative list with associations

### Step 2: Export from Ads Editor

1. Open Google Ads Editor
2. Download account data
3. Select campaign: "LBA SEO Test Campaign"
4. Go to Account → Export → "Export selected campaigns and ad groups"
5. Choose export format (likely multiple CSV files or single multi-sheet CSV)
6. Save exported files to this directory

### Step 3: Document Schema Details

For each exported CSV file:
- Document exact column names and order
- Note data types and format requirements
- Identify required vs optional columns
- Document any special formatting (UTF-8, line endings, etc.)

## Files Expected

Based on modern Google Ads Editor exports:

- `campaigns.csv` - Campaign structure and settings
- `ad_groups.csv` - Ad group details and targeting
- `keywords.csv` - All keywords (or separate exact/phrase files)
- `ads.csv` - Responsive Search Ads with pinning
- `assets.csv` - All asset types (sitelinks, callouts, structured snippets)
- `asset_associations.csv` - Links between assets and campaigns/ad groups
- `shared_sets.csv` - Shared negative keyword lists
- `shared_set_associations.csv` - Links between shared sets and campaigns

## Schema Documentation

After export, create:
- `schema_analysis.md` - Detailed column analysis for each CSV
- `column_orders.json` - Exact column ordering for deterministic output
- `data_types.json` - Field types and validation rules
- `required_fields.json` - Mandatory vs optional columns

## Usage

These files serve as the **single source of truth** for CSV generation in:
- `src/schemas/csv-schemas.ts` - Schema definitions
- `src/writers/ads-editor.ts` - CSV writers
- `tests/snapshots/csv-bytes.test.ts` - Byte-level validation tests

## Important Notes

⚠️ **Critical**: The exact structure from these exports determines import success. Any deviation in column names, order, or formatting can cause Ads Editor import failures.

✅ **Validation**: After implementing CSV generation, test by importing generated files back into Ads Editor to ensure round-trip compatibility.