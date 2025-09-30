# Zen MCP Reconnection for SEO Ads Expert

## Issue Resolved
SEO Ads Expert was disconnected from Zen MCP (Project B) because the `.mcp.json` configuration was missing the zen server definition.

## Configuration Fixed

### 1. Updated `.mcp.json` in SEO Ads Expert directory
- Added zen MCP server configuration
- Points to `/mcp/zen/instances/instB/`
- Uses instance name: `zen-seo-ads-expert`
- API key is read from instB's `.env` file (not embedded in .mcp.json)

### 2. Updated Project B Workspace Documentation
- `/mcp/zen/workspaces/projectB/README.md` now correctly shows SEO Ads Expert
- `/mcp/zen/workspaces/projectB/.mcp.json` uses correct instance name

### 3. Instance Configuration (Already Correct)
- `/mcp/zen/instances/instB/.env` has:
  - `ZEN_INSTANCE_NAME=zen-seo-ads-expert`
  - OpenAI API Key #2 configured
  - GPT-5 model restriction
  - $2.50 daily budget
  - 60 calls/minute rate limit

## Testing the Connection

To verify Zen MCP is working:

1. Restart Claude Code in the SEO Ads Expert directory:
```bash
cd "/Users/nathanschram/Library/Mobile Documents/com~apple~CloudDocs/claude-code-tools/lba/infrastructure/tools/seo-ads-expert"
claude
```

2. Check MCP servers are connected:
```
/mcp
```

3. Test Zen functionality:
```
Can you use zen to chat about SEO optimization strategies?
```

## Security Notes
- API keys are stored only in `.env` files, not in `.mcp.json`
- The zen-mcp-server reads the API key from instB's `.env` file
- This prevents accidental exposure of API keys in version control

## Project Mapping Confirmation
- **Zen Proj A** (instA): Brand Copilot
- **Zen Proj B** (instB): SEO Ads Expert ✅
- **Zen Proj C** (instC): Homeless Hounds website