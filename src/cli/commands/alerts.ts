/**
 * Alerts Command Module
 * Wraps alert detection and remediation from cli-alerts.ts
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createAlertsCommand(): Command {
  const alerts = new Command('alerts');

  alerts
    .description('Manage alert detection and remediation');

  // Check subcommand
  alerts
    .command('check')
    .description('Run anomaly detection')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['check', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli-alerts.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // List subcommand
  alerts
    .command('list')
    .description('List current alerts')
    .option('--status <status>', 'Filter by status (open|acknowledged|closed)')
    .option('--product <name>', 'Filter by product')
    .action(async (options) => {
      const args = ['list'];
      if (options.status) args.push('--status', options.status);
      if (options.product) args.push('--product', options.product);

      const cliPath = path.resolve(__dirname, '../../cli-alerts.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Acknowledge subcommand
  alerts
    .command('ack <id>')
    .description('Acknowledge an alert')
    .action(async (id) => {
      const args = ['ack', id];

      const cliPath = path.resolve(__dirname, '../../cli-alerts.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Snooze subcommand
  alerts
    .command('snooze <id>')
    .description('Snooze an alert')
    .option('--until <date>', 'Snooze until date')
    .action(async (id, options) => {
      const args = ['snooze', id];
      if (options.until) args.push('--until', options.until);

      const cliPath = path.resolve(__dirname, '../../cli-alerts.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Close subcommand
  alerts
    .command('close <id>')
    .description('Close an alert')
    .option('--reason <reason>', 'Reason for closure')
    .action(async (id, options) => {
      const args = ['close', id];
      if (options.reason) args.push('--reason', options.reason);

      const cliPath = path.resolve(__dirname, '../../cli-alerts.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return alerts;
}