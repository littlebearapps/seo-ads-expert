/**
 * Plan Command Module
 * Wraps existing plan functionality from cli.ts
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createPlanCommand(): Command {
  const plan = new Command('plan');

  plan
    .description('Generate SEO & Google Ads marketing plans')
    .requiredOption('-p, --product <name>', 'Product name (e.g., palettekit, convertmyfile)')
    .option('-m, --markets <markets>', 'Comma-separated markets (AU,US,GB,CA,DE,FR,ES,IT)', 'AU,US,GB')
    .option('--format <type>', 'Output format (standard|ads-editor)', 'standard')
    .option('--validate-only', 'Run validation checks only')
    .option('--dry-run', 'Preview without execution')
    .option('--diff-only', 'Show differences from last run')
    .option('--export <type>', 'Export type (utm-template)', '')
    .option('--skip-health-check', 'Skip URL health validation')
    .action(async (options) => {
      try {
        // Build the command arguments
        const args = ['plan'];
        if (options.product) args.push('--product', options.product);
        if (options.markets) args.push('--markets', options.markets);
        if (options.format) args.push('--format', options.format);
        if (options.validateOnly) args.push('--validate-only');
        if (options.dryRun) args.push('--dry-run');
        if (options.diffOnly) args.push('--diff-only');
        if (options.export) args.push('--export', options.export);
        if (options.skipHealthCheck) args.push('--skip-health-check');

        // Execute the original CLI command
        const cliPath = path.resolve(__dirname, '../../cli.ts');
        const command = `npx tsx ${cliPath} ${args.join(' ')}`;

        execSync(command, { stdio: 'inherit' });
      } catch (error) {
        console.error('Error executing plan command:', error);
        process.exit(1);
      }
    });

  // Add list subcommand
  plan
    .command('list')
    .description('List generated plans')
    .option('-p, --product <name>', 'Filter by product')
    .action(async (options) => {
      const args = ['list'];
      if (options.product) args.push('--product', options.product);

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Add show subcommand
  plan
    .command('show')
    .description('Show plan details')
    .requiredOption('-p, --product <name>', 'Product name')
    .requiredOption('-d, --date <date>', 'Plan date (YYYY-MM-DD)')
    .action(async (options) => {
      const args = ['show', '--product', options.product, '--date', options.date];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Add validate subcommand
  plan
    .command('validate')
    .description('Validate plan configuration')
    .requiredOption('-p, --product <name>', 'Product name')
    .action(async (options) => {
      const args = ['validate', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return plan;
}