/**
 * Experiment Command Module
 * Wraps A/B testing functionality from cli-experiments.ts
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createExperimentCommand(): Command {
  const experiment = new Command('experiment');

  experiment
    .description('Manage A/B testing experiments');

  // Create subcommand
  experiment
    .command('create')
    .description('Create a new experiment')
    .requiredOption('--type <type>', 'Experiment type (rsa|landing-page)')
    .requiredOption('--product <name>', 'Product name')
    .option('--name <name>', 'Experiment name')
    .option('--description <desc>', 'Experiment description')
    .action(async (options) => {
      const args = ['create'];
      args.push('--type', options.type);
      args.push('--product', options.product);
      if (options.name) args.push('--name', options.name);
      if (options.description) args.push('--description', options.description);

      const cliPath = path.resolve(__dirname, '../../cli-experiments.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // List subcommand
  experiment
    .command('list')
    .description('List experiments')
    .option('--product <name>', 'Filter by product')
    .option('--status <status>', 'Filter by status')
    .action(async (options) => {
      const args = ['list'];
      if (options.product) args.push('--product', options.product);
      if (options.status) args.push('--status', options.status);

      const cliPath = path.resolve(__dirname, '../../cli-experiments.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Start subcommand
  experiment
    .command('start')
    .description('Start an experiment')
    .requiredOption('--id <id>', 'Experiment ID')
    .action(async (options) => {
      const args = ['start', '--id', options.id];

      const cliPath = path.resolve(__dirname, '../../cli-experiments.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Analyze subcommand
  experiment
    .command('analyze')
    .description('Analyze experiment results')
    .requiredOption('--id <id>', 'Experiment ID')
    .action(async (options) => {
      const args = ['analyze', '--id', options.id];

      const cliPath = path.resolve(__dirname, '../../cli-experiments.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Complete subcommand
  experiment
    .command('complete')
    .description('Complete an experiment')
    .requiredOption('--id <id>', 'Experiment ID')
    .option('--winner <variant>', 'Winning variant ID')
    .action(async (options) => {
      const args = ['complete', '--id', options.id];
      if (options.winner) args.push('--winner', options.winner);

      const cliPath = path.resolve(__dirname, '../../cli-experiments.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Measure subcommand
  experiment
    .command('measure')
    .description('Collect measurements for experiment')
    .requiredOption('--id <id>', 'Experiment ID')
    .action(async (options) => {
      const args = ['measure', '--id', options.id];

      const cliPath = path.resolve(__dirname, '../../cli-experiments.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return experiment;
}