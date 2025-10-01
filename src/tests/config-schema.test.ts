/**
 * Configuration Schema Tests
 * Validates the Zod configuration schema and normalization functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadConfig,
  createDatabaseConfig,
  validatePartialConfig,
  DatabaseConfigSchema,
  AppConfigSchema,
  type DatabaseConfig,
  type AppConfig
} from '../config/schema.js';

describe('Configuration Schema', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.GOOGLE_ADS_CUSTOMER_ID;
  });

  describe('DatabaseConfig', () => {
    it('should validate complete database config', () => {
      const config: DatabaseConfig = {
        path: '/tmp/test.db',
        enableWAL: true,
        enableForeignKeys: true,
        busyTimeout: 5000
      };

      const result = DatabaseConfigSchema.parse(config);
      expect(result).toEqual(config);
    });

    it('should apply defaults for optional fields', () => {
      const result = DatabaseConfigSchema.parse({ path: '/tmp/test.db' });

      expect(result).toEqual({
        path: '/tmp/test.db',
        enableWAL: true,
        enableForeignKeys: true,
        busyTimeout: 30000
      });
    });

    it('should reject empty path', () => {
      expect(() => DatabaseConfigSchema.parse({ path: '' }))
        .toThrow('Database path is required');
    });

    it('should reject negative timeout', () => {
      expect(() => DatabaseConfigSchema.parse({
        path: '/tmp/test.db',
        busyTimeout: -1
      })).toThrow();
    });
  });

  describe('createDatabaseConfig', () => {
    it('should handle string input (legacy support)', () => {
      const originalWarn = console.warn;
      const warnCalls: any[] = [];
      console.warn = (...args: any[]) => warnCalls.push(args);

      const result = createDatabaseConfig('/tmp/legacy.db');

      expect(result).toEqual({
        path: '/tmp/legacy.db',
        enableWAL: true,
        enableForeignKeys: true,
        busyTimeout: 30000
      });

      expect(warnCalls.length).toBe(1);
      expect(warnCalls[0][0]).toContain('DEPRECATED');

      console.warn = originalWarn;
    });

    it('should handle config object input', () => {
      const config = { path: '/tmp/test.db', enableWAL: false };
      const result = createDatabaseConfig(config);

      expect(result).toEqual({
        path: '/tmp/test.db',
        enableWAL: false,
        enableForeignKeys: true,
        busyTimeout: 30000
      });
    });
  });

  describe('loadConfig', () => {
    it('should load default configuration', () => {
      const config = loadConfig();

      expect(config.environment).toBe('development');
      expect(config.logLevel).toBe('info');
      expect(config.database.enableWAL).toBe(true);
      expect(config.featureFlags.thompsonSamplingV2).toBe(0);
    });

    it('should apply test environment overrides', () => {
      process.env.NODE_ENV = 'test';
      const config = loadConfig();

      expect(config.environment).toBe('test');
      expect(config.logLevel).toBe('error');
      expect(config.database.path).toBe(':memory:');
      expect(config.database.enableWAL).toBe(false);
      expect(config.featureFlags.thompsonSamplingV2).toBe(1);
    });

    it('should apply production environment overrides', () => {
      process.env.NODE_ENV = 'production';
      const config = loadConfig();

      expect(config.environment).toBe('production');
      expect(config.logLevel).toBe('warn');
      expect(config.featureFlags.thompsonSamplingV2).toBe(0.1);
    });

    it('should apply custom overrides', () => {
      const overrides: Partial<AppConfig> = {
        logLevel: 'debug',
        featureFlags: {
          thompsonSamplingV2: 0.5,
          hierarchicalBayesian: 0.3,
          lagAwareOptimization: 0.2,
          creativeFatigue: 0.1,
          crossPlatformBidding: 0.05,
        }
      };

      const config = loadConfig(overrides);

      expect(config.logLevel).toBe('debug');
      expect(config.featureFlags.thompsonSamplingV2).toBe(0.5);
      expect(config.featureFlags.hierarchicalBayesian).toBe(0.3);
    });

    it('should load Google Ads config from environment', () => {
      process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-token';
      process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_ADS_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_ADS_REFRESH_TOKEN = 'test-refresh-token';

      const config = loadConfig();

      expect(config.googleAds).toEqual({
        customerId: '1234567890',
        developerToken: 'test-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        refreshToken: 'test-refresh-token'
      });
    });

    it('should validate configuration and throw descriptive errors', () => {
      const invalidOverrides = {
        thompsonSampling: {
          explorationFloor: 1.5, // Invalid: > 1
          confidenceLevel: -0.1   // Invalid: < 0
        }
      };

      expect(() => loadConfig(invalidOverrides as any))
        .toThrow('Configuration validation failed');
    });
  });

  describe('validatePartialConfig', () => {
    it('should validate valid partial config', () => {
      const input = { enableWAL: false, busyTimeout: 5000 };
      const result = validatePartialConfig(
        DatabaseConfigSchema.partial(),
        input,
        'test config'
      );

      expect(result).toEqual(input);
    });

    it('should throw descriptive error for invalid config', () => {
      const input = { busyTimeout: -1 };

      expect(() => validatePartialConfig(
        DatabaseConfigSchema.partial(),
        input,
        'test config'
      )).toThrow('test config validation failed');
    });
  });

  describe('Feature Flags', () => {
    it('should validate feature flag percentages', () => {
      const validFlags = {
        thompsonSamplingV2: 0.5,
        hierarchicalBayesian: 0.25,
        lagAwareOptimization: 0.1,
        creativeFatigue: 0,
        crossPlatformBidding: 1
      };

      const config = loadConfig({ featureFlags: validFlags });
      expect(config.featureFlags).toEqual(validFlags);
    });

    it('should reject invalid feature flag percentages', () => {
      const invalidFlags = {
        thompsonSamplingV2: 1.5, // > 1
        hierarchicalBayesian: -0.1 // < 0
      };

      expect(() => loadConfig({ featureFlags: invalidFlags } as any))
        .toThrow('Configuration validation failed');
    });
  });

  describe('Thompson Sampling Config', () => {
    it('should validate Thompson Sampling parameters', () => {
      const validConfig = {
        explorationFloor: 0.05,
        decayFactor: 0.9,
        minSampleSize: 20,
        confidenceLevel: 0.99,
        hierarchicalPriors: false,
        lagAdjustment: false
      };

      const config = loadConfig({ thompsonSampling: validConfig });
      expect(config.thompsonSampling).toEqual(validConfig);
    });

    it('should reject invalid Thompson Sampling parameters', () => {
      const invalidConfigs = [
        { explorationFloor: 1.1 }, // > 1
        { decayFactor: -0.1 },     // < 0
        { minSampleSize: 0 },      // < 1
        { confidenceLevel: 1.1 }   // > 1
      ];

      invalidConfigs.forEach(invalidConfig => {
        expect(() => loadConfig({ thompsonSampling: invalidConfig } as any))
          .toThrow('Configuration validation failed');
      });
    });
  });
});

