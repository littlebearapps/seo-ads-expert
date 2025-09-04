# Claude Integration Guide for SEO & Ads Expert MCP Server

## Overview
This guide shows how to use the SEO & Ads Expert tool through Claude using the MCP (Model Context Protocol) server.

## Prerequisites
1. MCP server installed and configured in `.mcp.json`
2. Google Ads API credentials (for write operations)
3. Bing API key (optional, for Edge/Bing analysis)

## MCP Server Configuration

Add to your `.mcp.json`:
```json
{
  "servers": {
    "seo-ads-expert": {
      "command": "node",
      "args": ["path/to/seo-ads-expert/dist/mcp/seo-ads-server.js"],
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "your-token",
        "GOOGLE_ADS_CLIENT_ID": "your-client-id", 
        "GOOGLE_ADS_CLIENT_SECRET": "your-secret",
        "GOOGLE_ADS_REFRESH_TOKEN": "your-refresh-token",
        "BING_API_KEY": "your-bing-key"
      }
    }
  }
}
```

## Available Tools

### 1. Generate SEO & Ads Plan
```
Tool: seo_ads_plan
Generate strategic keyword research and campaign structure

Parameters:
- product: Product name (e.g., "convert-my-file")
- market: Target market (default: "AU")
- includeCompetitors: Include competitor analysis (default: true)
- includeNegatives: Include negative keywords (default: true) 
- outputFormat: "json" | "csv" | "markdown" | "all" (default: "json")

Example:
"Please generate an SEO and Ads plan for palette-kit targeting the AU market"
```

### 2. Preview Campaign Changes
```
Tool: preview_changes
Preview changes before applying (dry run mode)

Parameters:
- customerId: Google Ads customer ID
- product: Product name
- changes: Planned changes object

Example:
"Preview the campaign changes for customer 123-456-7890 for palette-kit"
```

### 3. Apply Campaign Changes
```
Tool: apply_changes
Apply changes to Google Ads (requires confirmation)

Parameters:
- customerId: Google Ads customer ID  
- product: Product name
- changes: Planned changes object
- skipGuardrails: Skip safety checks (not recommended, default: false)
- autoRollback: Auto-rollback on failure (default: true)

Example:
"Apply the approved changes to Google Ads for palette-kit"
```

### 4. Export Campaigns
```
Tool: export_campaigns
Export campaigns to various formats

Parameters:
- campaigns: Campaign data
- format: "google-csv" | "microsoft-csv" | "json"
- outputPath: Optional output file path

Example:
"Export the palette-kit campaigns in Microsoft CSV format"
```

### 5. View Audit History
```
Tool: audit_history
Review change history and operations

Parameters:
- startDate: Start date (ISO format)
- endDate: End date (ISO format)
- user: Optional user filter
- action: Optional action type filter

Example:
"Show me the audit history for the last 7 days"
```

### 6. Reconcile Campaigns
```
Tool: reconcile_campaigns
Compare planned vs live campaigns

Parameters:
- customerId: Google Ads customer ID
- product: Product name
- plannedData: Original planned structure

Example:
"Reconcile the live palette-kit campaigns with our planned structure"
```

### 7. Manage Negative Keywords
```
Tool: negative_keywords
Sync, add, remove, or export negative keywords

Parameters:
- product: Product name
- customerId: Optional Google Ads customer ID
- action: "sync" | "add" | "remove" | "export" (default: "sync")
- keywords: Keywords for add/remove actions

Example:
"Sync negative keywords for notebridge from waste analysis"
```

### 8. Analyze Bing/Edge Opportunity
```
Tool: bing_opportunity
Analyze Microsoft Ads opportunity

Parameters:
- product: Product name
- keywords: Keywords to analyze
- market: Target market (default: "en-AU")

Example:
"Analyze Bing opportunity for convert-my-file keywords"
```

### 9. Check System Status
```
Tool: get_status
Get current configuration and capabilities

Example:
"Check the SEO Ads Expert system status"
```

## Common Workflows

### Workflow 1: Full Campaign Creation
```
1. "Generate an SEO plan for convert-my-file"
2. Review the generated plan
3. "Export this plan as Google Ads CSV"
4. "Generate negative keywords for convert-my-file"
5. "Export the complete campaign with negatives"
```

### Workflow 2: Campaign Optimization
```
1. "Reconcile convert-my-file campaigns with planned structure"
2. Review discrepancies
3. "Sync negative keywords from waste analysis"
4. "Preview the optimization changes"
5. "Apply the approved optimizations"
```

### Workflow 3: Cross-Platform Export
```
1. "Generate campaign for palette-kit"
2. "Export as Google CSV for Google Ads"
3. "Export as Microsoft CSV for Bing Ads"
4. "Analyze Bing opportunity for these keywords"
```

### Workflow 4: Audit and Compliance
```
1. "Show audit history for the last 30 days"
2. "Filter for budget changes only"
3. "Export audit trail as CSV"
4. "Show all changes by user john.doe"
```

## Safety Features

### Guardrails
- Budget limits enforced at multiple levels
- Landing page validation
- Device targeting checks
- Bid range validation
- Keyword quality checks

### Dry Run Mode
All changes can be previewed before applying:
- Shows exact mutations
- Estimates impact
- Lists warnings and blockers

### Rollback
- Automatic rollback on failure
- Manual rollback available
- Rollback IDs tracked in audit log

## Progress Indicators
The MCP server sends real-time progress updates:
- Plan generation: 0% → 20% → 60% → 80% → 100%
- Campaign sync: Progress per operation
- Export: Progress per format

## Error Handling

Common errors and solutions:

### Authentication Error
```
Error: Google Ads authentication failed
Solution: Check refresh token and credentials in .mcp.json
```

### Quota Exceeded
```
Error: API quota exceeded
Solution: Wait for quota reset or use cached data
```

### Guardrail Violation
```
Error: Budget exceeds account limit
Solution: Reduce budget or request limit increase
```

## Best Practices

1. **Always Preview First**
   - Use preview_changes before apply_changes
   - Review all warnings and recommendations

2. **Use Negative Keywords**
   - Sync regularly from waste analysis
   - Export and review quarterly

3. **Monitor Audit Trail**
   - Review weekly for unexpected changes
   - Export monthly for compliance

4. **Cross-Platform Strategy**
   - Export to both Google and Microsoft formats
   - Analyze Bing opportunity for all products

5. **Regular Reconciliation**
   - Weekly reconciliation recommended
   - Address drift immediately

## Examples

### Example 1: Complete Campaign Setup
```
User: "Create a complete Google Ads campaign for palette-kit"

Claude will:
1. Use seo_ads_plan to generate strategic plan
2. Use negative_keywords to add product-specific negatives
3. Use export_campaigns to create importable CSV
4. Provide instructions for Google Ads import
```

### Example 2: Campaign Health Check
```
User: "Check if our convert-my-file campaigns are healthy"

Claude will:
1. Use reconcile_campaigns to find discrepancies
2. Use audit_history to review recent changes
3. Use negative_keywords to check waste prevention
4. Provide optimization recommendations
```

### Example 3: Multi-Platform Launch
```
User: "Prepare notebridge for launch on Google and Bing"

Claude will:
1. Use seo_ads_plan for keyword research
2. Use export_campaigns for Google CSV
3. Use export_campaigns for Microsoft CSV
4. Use bing_opportunity for Edge-specific insights
5. Provide platform-specific recommendations
```

## Troubleshooting

### MCP Server Not Found
```bash
# Check MCP configuration
cat .mcp.json

# Verify server path
node dist/mcp/seo-ads-server.js --version
```

### Progress Not Showing
```bash
# Check Claude supports progress notifications
# Update to latest Claude version if needed
```

### Tools Not Available
```bash
# List available tools
claude mcp list-tools seo-ads-expert

# Restart Claude to reload MCP servers
```

## Support

For issues or questions:
1. Check audit logs for detailed error messages
2. Review system status for configuration issues
3. Consult API documentation for specific features
4. File issues in the project repository