import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { ProductConfig, ProductConfigSchema } from '../connectors/types.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export function loadProductConfig(productName: string): ProductConfig {
  try {
    const configPath = join(process.cwd(), 'products', `${productName}.yaml`);
    const configContent = readFileSync(configPath, 'utf8');
    const rawConfig = yaml.load(configContent);
    
    const config = ProductConfigSchema.parse(rawConfig);
    
    logger.info(`✅ Loaded product configuration for: ${config.product}`);
    logger.debug('Product config:', {
      markets: config.markets,
      seedQueries: config.seed_queries.length,
      targetPages: config.target_pages.length,
      negatives: config.pre_seeded_negatives.length
    });
    
    return config;
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        logger.error(`❌ Product configuration file not found: products/${productName}.yaml`);
        logger.error('Available products should be: convertmyfile, palettekit, notebridge');
      } else {
        logger.error(`❌ Failed to load product configuration: ${error.message}`);
      }
    } else {
      logger.error('❌ Unknown error loading product configuration:', error);
    }
    
    process.exit(1);
  }
}

export function validateProductExists(productName: string): boolean {
  const validProducts = ['convertmyfile', 'palettekit', 'notebridge'];
  
  if (!validProducts.includes(productName)) {
    logger.error(`❌ Invalid product name: ${productName}`);
    logger.error(`Valid products: ${validProducts.join(', ')}`);
    return false;
  }
  
  return true;
}

export function getAvailableProducts(): string[] {
  return ['convertmyfile', 'palettekit', 'notebridge'];
}