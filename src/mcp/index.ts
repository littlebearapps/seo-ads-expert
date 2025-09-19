#!/usr/bin/env node

/**
 * SEO Ads Expert MCP Server Entry Point
 *
 * Starts the Model Context Protocol server for Thompson Sampling budget optimization.
 */

import { SEOAdsMCPServer } from './seo-ads-mcp-server.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
function loadConfig(): any {
  // Check for environment-specific config
  const env = process.env.NODE_ENV || 'development';
  const configPath = join(__dirname, '..', '..', 'config', `mcp.${env}.json`);
  const defaultConfigPath = join(__dirname, '..', '..', 'config', 'mcp.json');

  let config: any = {};

  // Try environment-specific config first
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } else if (existsSync(defaultConfigPath)) {
    config = JSON.parse(readFileSync(defaultConfigPath, 'utf-8'));
  }

  // Override with environment variables
  return {
    databasePath: process.env.SEO_ADS_DB_PATH ||
                  config.databasePath ||
                  join(__dirname, '..', '..', 'data', 'seo-ads.db'),
    artifactPath: process.env.SEO_ADS_ARTIFACT_PATH ||
                  config.artifactPath ||
                  join(__dirname, '..', '..', 'plans', '_optimizer'),
    logLevel: (process.env.SEO_ADS_LOG_LEVEL || config.logLevel || 'info') as any,
    googleAdsConfig: {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || config.googleAdsConfig?.developerToken,
      clientId: process.env.GOOGLE_ADS_CLIENT_ID || config.googleAdsConfig?.clientId,
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || config.googleAdsConfig?.clientSecret,
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || config.googleAdsConfig?.refreshToken,
    },
  };
}

// Main function
async function main() {
  try {
    console.error('===========================================');
    console.error('  SEO Ads Expert MCP Server v2.0');
    console.error('  Thompson Sampling Budget Optimizer');
    console.error('===========================================');
    console.error('');

    const config = loadConfig();

    // Log configuration (without secrets)
    console.error('Configuration:');
    console.error(`  Database: ${config.databasePath}`);
    console.error(`  Artifacts: ${config.artifactPath}`);
    console.error(`  Log Level: ${config.logLevel}`);
    console.error(`  Google Ads: ${config.googleAdsConfig.developerToken ? 'Configured' : 'Not configured'}`);
    console.error('');

    // Create and start server
    const server = new SEOAdsMCPServer(config);

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      console.error('\nShutting down gracefully...');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('\nShutting down gracefully...');
      await server.close();
      process.exit(0);
    });

    // Start the server
    await server.start();

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SEOAdsMCPServer } from './seo-ads-mcp-server.js';