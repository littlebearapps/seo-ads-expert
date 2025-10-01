/**
 * Configuration Schema for SEO Ads Expert v2.0
 * Centralized config validation with runtime checking and defaults
 */

import { z } from 'zod';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CORE SCHEMAS
// =============================================================================

/**
 * Database configuration schema with defaults
 */
export const DatabaseConfigSchema = z.object({
  path: z.string().min(1, 'Database path is required'),
  enableWAL: z.boolean().default(true),
  enableForeignKeys: z.boolean().default(true),
  busyTimeout: z.number().min(0).default(30000),
}).strict();

/**
 * Google Ads API configuration schema
 */
export const GoogleAdsConfigSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  developerToken: z.string().min(1, 'Developer token is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  refreshToken: z.string().min(1, 'Refresh token is required'),
}).strict();

/**
 * API rate limiting configuration
 */
export const RateLimitConfigSchema = z.object({
  rapidApiCalls: z.number().min(1).default(100),
  googleAdsCalls: z.number().min(1).default(50),
  searchConsoleCalls: z.number().min(1).default(30),
  intervalMs: z.number().min(1000).default(60000), // 1 minute
}).strict();

/**
 * Thompson Sampling configuration schema
 */
export const ThompsonSamplingConfigSchema = z.object({
  explorationFloor: z.number().min(0).max(1).default(0.1),
  decayFactor: z.number().min(0).max(1).default(0.95),
  minSampleSize: z.number().min(1).default(10),
  confidenceLevel: z.number().min(0).max(1).default(0.95),
  hierarchicalPriors: z.boolean().default(true),
  lagAdjustment: z.boolean().default(true),
}).strict();

/**
 * Feature flags configuration schema
 */
export const FeatureFlagsConfigSchema = z.object({
  thompsonSamplingV2: z.number().min(0).max(1).default(0), // 0-100% rollout
  hierarchicalBayesian: z.number().min(0).max(1).default(0),
  lagAwareOptimization: z.number().min(0).max(1).default(0),
  creativeFatigue: z.number().min(0).max(1).default(0),
  crossPlatformBidding: z.number().min(0).max(1).default(0),
}).strict();

/**
 * Main application configuration schema
 */
export const AppConfigSchema = z.object({
  database: DatabaseConfigSchema,
  googleAds: GoogleAdsConfigSchema.optional(),
  rateLimits: RateLimitConfigSchema,
  thompsonSampling: ThompsonSamplingConfigSchema,
  featureFlags: FeatureFlagsConfigSchema,
  environment: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).strict();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type GoogleAdsConfig = z.infer<typeof GoogleAdsConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type ThompsonSamplingConfig = z.infer<typeof ThompsonSamplingConfigSchema>;
export type FeatureFlagsConfig = z.infer<typeof FeatureFlagsConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

// =============================================================================
// CONFIGURATION LOADER
// =============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<AppConfig> = {
  database: {
    path: path.join(__dirname, '../../data/seo-ads-expert.db'),
    enableWAL: true,
    enableForeignKeys: true,
    busyTimeout: 30000,
  },
  rateLimits: {
    rapidApiCalls: 100,
    googleAdsCalls: 50,
    searchConsoleCalls: 30,
    intervalMs: 60000,
  },
  thompsonSampling: {
    explorationFloor: 0.1,
    decayFactor: 0.95,
    minSampleSize: 10,
    confidenceLevel: 0.95,
    hierarchicalPriors: true,
    lagAdjustment: true,
  },
  featureFlags: {
    thompsonSamplingV2: 0,
    hierarchicalBayesian: 0,
    lagAwareOptimization: 0,
    creativeFatigue: 0,
    crossPlatformBidding: 0,
  },
  environment: 'development',
  logLevel: 'info',
};

/**
 * Environment-specific configuration overrides
 */
const ENV_CONFIGS: Record<string, Partial<AppConfig>> = {
  test: {
    database: {
      path: ':memory:',
      enableWAL: false,
    },
    logLevel: 'error',
    featureFlags: {
      thompsonSamplingV2: 1, // Enable all features in tests
      hierarchicalBayesian: 1,
      lagAwareOptimization: 1,
      creativeFatigue: 1,
      crossPlatformBidding: 1,
    },
  },
  production: {
    logLevel: 'warn',
    featureFlags: {
      thompsonSamplingV2: 0.1, // 10% rollout
      hierarchicalBayesian: 0.05, // 5% rollout
      lagAwareOptimization: 0.05,
      creativeFatigue: 0.02,
      crossPlatformBidding: 0,
    },
  },
};

/**
 * Load and validate configuration from environment and defaults
 */
export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const environment = process.env.NODE_ENV || 'development';
  const envConfig = ENV_CONFIGS[environment] || {};

  // Merge configurations: defaults < env-specific < overrides
  const rawConfig = {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...overrides,
    environment,
  };

  // Apply Google Ads config from environment if available
  if (process.env.GOOGLE_ADS_CUSTOMER_ID) {
    rawConfig.googleAds = {
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
      clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
    };
  }

  // Validate and return normalized configuration
  try {
    return AppConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      throw new Error(`Configuration validation failed:\n${formattedErrors}`);
    }
    throw error;
  }
}

/**
 * Create normalized database configuration
 * Provides backward compatibility for legacy string paths
 */
export function createDatabaseConfig(input: string | Partial<DatabaseConfig>): DatabaseConfig {
  if (typeof input === 'string') {
    // Legacy support: convert string path to config object
    console.warn('⚠️  DEPRECATED: Pass database config object instead of string path');
    return DatabaseConfigSchema.parse({ path: input });
  }

  return DatabaseConfigSchema.parse(input);
}

/**
 * Validate partial configuration objects
 */
export function validatePartialConfig<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context: string = 'configuration'
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      throw new Error(`${context} validation failed:\n${formattedErrors}`);
    }
    throw error;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Global configuration instance
 * Loaded once at startup with environment-specific defaults
 */
export const appConfig = loadConfig();