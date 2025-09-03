import { z } from 'zod';
import pino from 'pino';
import { config } from 'dotenv';

// Load environment variables
config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export const EnvironmentSchema = z.object({
  // Google Search Console API
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(), // JSON key file path
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),
  SEARCH_CONSOLE_SITES: z.string().optional(),
  
  // RapidAPI Configuration
  RAPIDAPI_KEY: z.string().min(10, 'RapidAPI key is required'),
  RAPIDAPI_HOST_SERP: z.string().default('real-time-web-search.p.rapidapi.com'),
  RAPIDAPI_HOST_KEYWORDS: z.string().default('google-keyword-insight1.p.rapidapi.com'),
  
  // Caching & Rate Limiting
  CACHE_TTL_HOURS: z.string().transform(val => parseInt(val)).default('24'),
  MAX_SERP_CALLS_PER_RUN: z.string().transform(val => parseInt(val)).default('30'),
  MAX_CONCURRENT_REQUESTS: z.string().transform(val => parseInt(val)).default('5'),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  LOG_FILE: z.string().optional(),
  
  // Output Configuration
  OUTPUT_BASE_PATH: z.string().default('plans'),
  BACKUP_PLANS: z.string().transform(val => val === 'true').default('true'),
  COMPRESS_OLD_PLANS: z.string().transform(val => val === 'true').default('true'),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(): Environment {
  try {
    const env = EnvironmentSchema.parse(process.env);
    
    // Check for critical dependencies
    const missingCritical: string[] = [];
    
    if (!env.RAPIDAPI_KEY || env.RAPIDAPI_KEY === 'your-rapidapi-key-here') {
      missingCritical.push('RAPIDAPI_KEY (required for SERP data and keyword expansion)');
    }
    
    if (missingCritical.length > 0) {
      logger.error('❌ Critical environment variables are missing:');
      missingCritical.forEach(missing => logger.error(`  - ${missing}`));
      logger.error('Please update your .env file. See .env.example for reference.');
      process.exit(1);
    }
    
    // Warn about optional dependencies
    const missingOptional: string[] = [];
    
    // Check if either JSON key file or individual credentials are provided
    const hasJsonKey = env.GOOGLE_APPLICATION_CREDENTIALS && env.GOOGLE_APPLICATION_CREDENTIALS !== 'path/to/your/service-account-key.json';
    const hasIndividualCreds = env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    
    if (!hasJsonKey && !hasIndividualCreds) {
      missingOptional.push('Google Search Console credentials (organic performance data will be unavailable)');
    }
    
    if (missingOptional.length > 0) {
      logger.warn('⚠️  Optional environment variables are missing:');
      missingOptional.forEach(missing => logger.warn(`  - ${missing}`));
      logger.warn('The tool will use fallback data sources where possible.');
    }
    
    logger.info('✅ Environment validation passed');
    return env;
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        logger.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      logger.error('❌ Environment validation error:', error);
    }
    
    process.exit(1);
  }
}