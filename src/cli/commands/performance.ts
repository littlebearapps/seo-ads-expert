/**
 * Performance Command Module
 * Wraps performance analysis functionality
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createPerformanceCommand(): Command {
  const performance = new Command('performance');

  performance
    .description('Performance analysis and optimization');

  // Paid-organic gaps
  performance
    .command('paid-organic-gaps')
    .description('Analyze gaps between paid and organic performance')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['performance', 'paid-organic-gaps', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Analyze waste
  performance
    .command('analyze-waste')
    .description('Identify wasted ad spend')
    .requiredOption('--product <name>', 'Product name')
    .option('--days <n>', 'Number of days to analyze', '30')
    .action(async (options) => {
      const args = ['performance', 'analyze-waste', '--product', options.product];
      if (options.days) args.push('--days', options.days);

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Quality score
  performance
    .command('quality-score')
    .description('Analyze quality score metrics')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['performance', 'quality-score', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return performance;
}