/**
 * Entity Command Module
 * Wraps entity coverage and content optimization from cli-entity.ts
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createEntityCommand(): Command {
  const entity = new Command('entity');

  entity
    .description('Entity coverage and content intelligence');

  // Entity audit
  entity
    .command('audit')
    .description('Audit entity coverage for products')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['entity-audit', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // FAQ extract
  entity
    .command('faq-extract')
    .description('Extract and generate FAQs')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['faq-extract', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Coverage compare
  entity
    .command('coverage-compare')
    .description('Compare entity coverage between products')
    .requiredOption('--products <list>', 'Comma-separated product list')
    .action(async (options) => {
      const args = ['coverage-compare', '--products', options.products];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Entity glossary
  entity
    .command('glossary')
    .description('Generate entity glossary with definitions')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['entity-glossary', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Schema emit
  entity
    .command('schema-emit')
    .description('Generate JSON-LD schemas')
    .requiredOption('--product <name>', 'Product name')
    .requiredOption('--type <type>', 'Schema type (faq|software|howto|breadcrumb|article)')
    .action(async (options) => {
      const args = ['schema-emit', '--product', options.product, '--type', options.type];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Content roadmap
  entity
    .command('content-roadmap')
    .description('Create content plan with calendar')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['content-roadmap', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  // Link suggest
  entity
    .command('link-suggest')
    .description('Find internal linking opportunities')
    .requiredOption('--product <name>', 'Product name')
    .action(async (options) => {
      const args = ['link-suggest', '--product', options.product];

      const cliPath = path.resolve(__dirname, '../../cli.ts');
      const command = `npx tsx ${cliPath} ${args.join(' ')}`;

      execSync(command, { stdio: 'inherit' });
    });

  return entity;
}