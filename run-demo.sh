#!/bin/bash
# Demo Mode Launcher
# Runs the SEO Ads Expert demo without requiring real API credentials

echo "🎬 Starting SEO Ads Expert Demo Mode..."
echo ""
echo "This demo uses synthetic data and does not require:"
echo "  • Google Ads API credentials"
echo "  • Google Analytics credentials"
echo "  • Google Search Console credentials"
echo "  • RapidAPI key"
echo ""

# Set minimal env vars to bypass validation
export RAPIDAPI_KEY="demo_mode_no_real_api_needed"

# Run the demo
npx tsx src/cli.ts demo "$@"
