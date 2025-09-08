# Ground-Truth CSV Samples - Google Ads Editor Export Format

## Purpose

This directory contains **ground-truth CSV exports** from Google Ads Editor that serve as the schema reference for v1.1 CSV generation. These samples prevent import failures by ensuring our generated CSVs match the exact format expected by Ads Editor.

## Files Created (v1.1 Implementation)

### Core Campaign Structure Files

1. **campaigns.csv** - Campaign-level configuration
   - 5 campaigns for ConvertMyFile (WebP to PNG, HEIC to JPG, PDF to JPG)
   - Markets: Australia (AU) and United States (US)
   - Settings: Daily budgets ($10), Manual CPC, Search networks
   - Status: Paused (ready for activation)

2. **ad_groups.csv** - Ad group structure  
   - 15 ad groups across campaigns
   - Segments: General, Photography, Web Design, iPhone Users, Business, Students
   - Max CPC bids ranging from $1.50 to $4.00 based on segment value

3. **keywords.csv** - Keyword targeting
   - 22 keywords with exact, phrase, and broad match types
   - Quality scores: 6-9 (realistic distribution)
   - Bid estimates and final URLs included
   - First page and top of page bid estimates

4. **ads.csv** - Responsive Search Ads (RSAs)
   - 6 RSAs with full 15 headlines and 4 descriptions each
   - Targeted messaging for each segment
   - Display paths and final URLs configured

5. **negative_keywords.csv** - Negative keyword lists
   - 45+ negative keywords covering:
     - Competitors (Adobe, GIMP, Paint.net)
     - Irrelevant terms (free, download, crack, torrent)
     - Inappropriate content
     - Off-topic searches (tutorial, job, career)

6. **sitelinks.csv** - Sitelink extensions
   - 20 sitelinks across campaigns
   - Deep links to specific features and tools
   - Descriptions highlighting key benefits

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