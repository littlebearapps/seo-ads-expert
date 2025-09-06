#!/usr/bin/env node

/**
 * v1.7 Remediation CLI Command
 */

import { Command } from 'commander';
import { DatabaseManager } from './database/database-manager.js';
import { PlaybookEngine } from './playbooks/playbook-engine.js';
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

// Get alert by ID
async function getAlert(db: DatabaseManager, alertId: string): Promise<any> {
  const dbInstance = db.getDb();
  const stmt = dbInstance.prepare(`
    SELECT payload_json
    FROM alerts_history
    WHERE alert_id = ?
    ORDER BY seen_at DESC
    LIMIT 1
  `);
  
  const result = stmt.get(alertId) as { payload_json: string } | undefined;
  
  if (!result) {
    throw new Error(`Alert ${alertId} not found`);
  }
  
  return JSON.parse(result.payload_json);
}

// Remedy command
program
  .name('seo-ads-remedy')
  .description('Apply remediation for alerts')
  .version('1.7.0');

program
  .command('apply')
  .description('Apply remediation for an alert')
  .requiredOption('--alert-id <id>', 'Alert ID to remediate')
  .option('--dry-run', 'Preview actions without applying (default)', true)
  .option('--apply', 'Apply remediation for real')
  .option('--allow-bid-changes', 'Allow bid adjustments')
  .option('--max-budget-impact <amount>', 'Maximum budget impact allowed', '100')
  .action(async (options) => {
    try {
      const db = await initDatabase();
      const engine = new PlaybookEngine(db);
      
      console.log(`\n🔧 Remediation System v1.7\n`);
      
      // Get alert
      console.log(`📋 Loading alert ${options.alertId}...`);
      const alert = await getAlert(db, options.alertId);
      
      console.log(`\nAlert Details:`);
      console.log(`  Type: ${alert.type}`);
      console.log(`  Severity: ${alert.severity}`);
      console.log(`  Entity: ${alert.entity.product} - ${alert.entity.campaign || alert.entity.ad_group}`);
      console.log(`  Reason: ${alert.why}\n`);
      
      // Execute remediation
      const isDryRun = !options.apply;
      console.log(`Mode: ${isDryRun ? '🧪 DRY RUN' : '⚡ APPLY'}\n`);
      
      const remediation = await engine.remediate(alert, {
        dryRun: isDryRun,
        allowBidChanges: options.allowBidChanges,
        maxBudgetImpact: parseFloat(options.maxBudgetImpact)
      });
      
      // Display report
      const report = engine.generateReport(remediation);
      console.log(report);
      
      // Write artifacts if any
      if (remediation.artifacts && Object.keys(remediation.artifacts).length > 0) {
        const outputDir = path.join('plans', alert.entity.product, 'remediation', alert.id);
        await fs.mkdir(outputDir, { recursive: true });
        
        for (const [name, content] of Object.entries(remediation.artifacts)) {
          const outputPath = path.join(outputDir, `${name}.json`);
          await fs.writeFile(outputPath, JSON.stringify(content, null, 2));
          console.log(`\n📁 Artifact saved: ${outputPath}`);
        }
      }
      
      // Summary
      if (remediation.guardrailsPassed && !isDryRun) {
        console.log(`\n✅ Remediation applied successfully!`);
      } else if (remediation.guardrailsPassed) {
        console.log(`\n✅ Remediation ready. Use --apply to execute.`);
      } else {
        console.log(`\n❌ Remediation blocked by guardrails.`);
      }
      
      await db.close();
      
    } catch (error) {
      logger.error('Remediation failed', error);
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// List available playbooks
program
  .command('list-playbooks')
  .description('List available playbooks')
  .action(async () => {
    try {
      const db = await initDatabase();
      const engine = new PlaybookEngine(db);
      
      console.log('\n📚 Available Playbooks:\n');
      
      const playbooks = engine.getPlaybooks();
      for (const [id, playbook] of playbooks) {
        console.log(`  ${id}:`);
        console.log(`    Alert Type: ${playbook.alertType}`);
        console.log(`    Description: ${playbook.description}`);
        console.log('');
      }
      
      await db.close();
      
    } catch (error) {
      logger.error('Failed to list playbooks', error);
      process.exit(1);
    }
  });

// Simulate remediation
program
  .command('simulate')
  .description('Simulate remediation for testing')
  .requiredOption('--type <type>', 'Alert type to simulate')
  .requiredOption('--entity <entity>', 'Entity description')
  .action(async (options) => {
    try {
      const db = await initDatabase();
      const engine = new PlaybookEngine(db);
      
      // Create mock alert
      const mockAlert = {
        id: `mock_${Date.now()}`,
        type: options.type,
        severity: 'high',
        entity: {
          id: options.entity,
          type: 'ad_group',
          product: 'test',
          ad_group: options.entity
        },
        metrics: {
          baseline: { mean: 100, stdDev: 10 },
          current: { value: 60, count: 100 },
          change_percentage: -40
        },
        why: 'Simulated alert for testing'
      };
      
      console.log('\n🧪 Simulating remediation...\n');
      
      const remediation = await engine.remediate(mockAlert as any, {
        dryRun: true,
        allowBidChanges: true
      });
      
      const report = engine.generateReport(remediation);
      console.log(report);
      
      await db.close();
      
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