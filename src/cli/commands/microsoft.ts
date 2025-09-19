/**
 * Microsoft Command Module
 * Wraps Microsoft Ads integration from cli-microsoft.ts
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createMicrosoftCommand(): Command {
  const microsoft = new Command('microsoft');

  microsoft
    .description('Microsoft Ads and Edge Store management');

  // Export subcommand
  microsoft
    .command('export')
    .description('Export Google Ads campaigns to Microsoft Ads format')
    .requiredOption('--product <name>', 'Product name')
    .requiredOption('--date <date>', 'Plan date (YYYY-MM-DD)')
    .option('--output <dir>', 'Output directory')
    .action(async (options) => {
      const args = ['export'];
      args.push('--product', options.product);
      args.push('--date', options.date);
      if (options.output) args.push('--output', options.output);

      const cliPath = path.resolve(__dirname, '../../cli-microsoft.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Edge store audit subcommand
  microsoft
    .command('edge-store-audit')
    .description('Audit Edge Add-ons Store listing')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['edge-store-audit', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Cross-platform subcommand
  microsoft
    .command('cross-platform')
    .description('Cross-platform performance analysis')
    .requiredOption('--product <name>', 'Product name')
    .option('--days <n>', 'Number of days to analyze', '30')
    .action(async (options) => {
      const args = ['cross-platform', '--product', options.product];
      if (options.days) args.push('--days', options.days);

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return microsoft;
}