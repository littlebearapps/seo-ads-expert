/**
 * Monitor Command Module
 * Wraps monitoring and cost tracking functionality
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createMonitorCommand(): Command {
  const monitor = new Command('monitor');

  monitor
    .description('Monitor costs, usage, and system health')
    .option('--detailed', 'Show detailed metrics')
    .option('--product <name>', 'Filter by product')
    .option('--days <n>', 'Number of days to monitor', '7')
    .action(async (options) => {
      const args = ['monitor'];
      if (options.detailed) args.push('--detailed');
      if (options.product) args.push('--product', options.product);
      if (options.days) args.push('--days', options.days);

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return monitor;
}