#!/usr/bin/env node

/**
 * v1.7 Alert System CLI Commands
 */

import { Command } from 'commander';
import { DatabaseManager } from './database/database-manager.js';
import { AlertManager } from './alerts/alert-manager.js';
import { logger } from './utils/logger.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// Initialize database
async function initDatabase(): Promise<DatabaseManager> {
  const dbPath = path.join(process.cwd(), 'data', 'seo-ads-expert.db');
  const db = new DatabaseManager({ path: dbPath });
  await db.initialize();
  
  // Apply v1.7 schema if needed
  const schemaPath = path.join(__dirname, 'database', 'schema-v1.7.sql');
  try {
    const schema = await fs.readFile(schemaPath, 'utf-8');
    const dbInstance = db.getDb();
    dbInstance.exec(schema);
  } catch (error) {
    logger.warn('Could not apply v1.7 schema', error);
  }
  
  return db;
}

// Check command - run anomaly detection
program
  .command('check')
  .description('Run anomaly detection across all metrics')
  .requiredOption('-p, --product <name>', 'Product name (or "all" for all products)')
  .option('--window <window>', 'Time window (e.g., "14d:3d" for 14-day baseline, 3-day current)', '14d:3d')
  .option('--output <path>', 'Output path for alerts.json')
  .option('--sensitivity <level>', 'Detection sensitivity (low|medium|high)', 'medium')
  .action(async (options) => {
    try {
      const db = await initDatabase();
      const alertManager = new AlertManager(db);
      
      // Parse time window
      const [baselineDays, currentDays] = options.window.split(':').map((d: string) => 
        parseInt(d.replace('d', ''))
      );
      
      const window = {
        baseline_days: baselineDays || 14,
        current_days: currentDays || 3
      };
      
      // Get products to check
      let products: string[] = [];
      if (options.product === 'all') {
        // Get all products from database
        const dbInstance = db.getDb();
        const stmt = dbInstance.prepare(`
          SELECT DISTINCT product 
          FROM fact_search_terms 
          WHERE date >= date('now', '-30 days')
        `);
        const results = stmt.all() as Array<{ product: string }>;
        products = results.map(r => r.product);
      } else {
        products = [options.product];
      }
      
      console.log(`\n🔍 Checking ${products.length} product(s) for anomalies...\n`);
      
      // Check each product
      for (const product of products) {
        console.log(`\nChecking ${product}...`);
        
        const batch = await alertManager.checkProduct(product, window);
        
        // Display results
        console.log(alertManager.formatConsoleOutput(batch));
        
        // Write to file if specified
        if (options.output || batch.alerts.length > 0) {
          const outputPath = options.output || 
            path.join('plans', product, new Date().toISOString().split('T')[0], 'alerts.json');
          
          await alertManager.writeAlertsJson(batch, outputPath);
          console.log(`\n📁 Alerts saved to: ${outputPath}`);
        }
      }
      
      await db.close();
      
    } catch (error) {
      logger.error('Alert check failed', error);
      process.exit(1);
    }
  });

// List alerts command
program
  .command('list')
  .description('List current alerts')
  .option('-p, --product <name>', 'Filter by product')
  .option('-s, --status <status>', 'Filter by status (open|ack|snoozed|closed)')
  .action(async (options) => {
    try {
      const db = await initDatabase();
      const alertManager = new AlertManager(db);
      
      const alerts = await alertManager.listAlerts(options.product, options.status);
      
      if (alerts.length === 0) {
        console.log('No alerts found');
      } else {
        console.log(`\n📋 ${alerts.length} alert(s) found:\n`);
        
        for (const alert of alerts) {
          const icon = alert.severity === 'critical' ? '🚨' : 
                       alert.severity === 'high' ? '⚠️' : 
                       '📊';
          
          console.log(`${icon} [${alert.id}] ${alert.type.toUpperCase()}`);
          console.log(`   Severity: ${alert.severity}`);
          console.log(`   Entity: ${alert.entity.product} - ${alert.entity.campaign || alert.entity.ad_group || alert.entity.keyword || alert.entity.url}`);
          console.log(`   Reason: ${alert.why}`);
          console.log('');
        }
      }
      
      await db.close();
      
    } catch (error) {
      logger.error('List alerts failed', error);
      process.exit(1);
    }
  });

// Acknowledge alert
program
  .command('ack <alertId>')
  .description('Acknowledge an alert')
  .option('--notes <notes>', 'Add notes')
  .action(async (alertId, options) => {
    try {
      const db = await initDatabase();
      const alertManager = new AlertManager(db);
      
      await alertManager.acknowledgeAlert(alertId, options.notes);
      console.log(`✅ Alert ${alertId} acknowledged`);
      
      await db.close();
      
    } catch (error) {
      logger.error('Acknowledge failed', error);
      process.exit(1);
    }
  });

// Snooze alert
program
  .command('snooze <alertId>')
  .description('Snooze an alert')
  .requiredOption('--until <date>', 'Snooze until date (YYYY-MM-DD)')
  .action(async (alertId, options) => {
    try {
      const db = await initDatabase();
      const alertManager = new AlertManager(db);
      
      await alertManager.snoozeAlert(alertId, options.until);
      console.log(`😴 Alert ${alertId} snoozed until ${options.until}`);
      
      await db.close();
      
    } catch (error) {
      logger.error('Snooze failed', error);
      process.exit(1);
    }
  });

// Close alert
program
  .command('close <alertId>')
  .description('Close an alert')
  .option('--notes <notes>', 'Add closing notes')
  .action(async (alertId, options) => {
    try {
      const db = await initDatabase();
      const alertManager = new AlertManager(db);
      
      await alertManager.closeAlert(alertId, options.notes);
      console.log(`🔒 Alert ${alertId} closed`);
      
      await db.close();
      
    } catch (error) {
      logger.error('Close failed', error);
      process.exit(1);
    }
  });

// Simulate alert for testing
program
  .command('simulate')
  .description('Simulate an alert for testing')
  .requiredOption('--type <type>', 'Alert type (ctr_drop|spend_spike|cpc_jump|etc)')
  .requiredOption('--entity <entity>', 'Entity (e.g., "AdGroup:PaletteKit AU")')
  .option('--factor <factor>', 'Change factor (e.g., 0.6 for 40% drop)', '0.6')
  .action(async (options) => {
    try {
      console.log('🧪 Simulating alert...\n');
      
      const simulatedAlert = {
        id: 'simulated_' + Date.now(),
        type: options.type,
        severity: 'high',
        entity: {
          id: options.entity,
          type: 'ad_group',
          product: 'simulation',
          ad_group: options.entity
        },
        window: {
          baseline_days: 14,
          current_days: 3
        },
        metrics: {
          baseline: { mean: 100, stdDev: 10, median: 100, count: 14, min: 80, max: 120, period: { start: '', end: '' } },
          current: { value: 100 * parseFloat(options.factor), count: 3, period: { start: '', end: '' } },
          change_percentage: (parseFloat(options.factor) - 1) * 100
        },
        why: `Simulated ${options.type} with factor ${options.factor}`,
        playbook: `pb_${options.type}`,
        detection: {
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          occurrences: 1
        },
        suggested_actions: [
          {
            action: 'review_simulation',
            dry_run: true,
            priority: 'high'
          }
        ]
      };
      
      console.log('Simulated Alert:');
      console.log(JSON.stringify(simulatedAlert, null, 2));
      
    } catch (error) {
      logger.error('Simulation failed', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}