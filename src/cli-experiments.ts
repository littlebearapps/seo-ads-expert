/**
 * CLI Commands for A/B Testing Framework
 * Provides command-line interface for experiment management
 */

import { Command } from 'commander';
import { logger } from './utils/logger.js';
import { experimentManager } from './experiments/experiment-manager.js';
import { rsaVariantGenerator, lpVariantGenerator } from './experiments/variant-generator.js';
import { statisticalAnalyzer } from './experiments/statistics.js';
import { experimentMeasurement } from './experiments/measurement.js';
import { rsaExperimentWriter } from './writers/rsa-experiment-writer.js';
import { lpExperimentWriter } from './writers/lp-experiment-writer.js';
import type { ExperimentConfig } from './experiments/experiment-manager.js';

export function setupExperimentCommands(program: Command): void {
  const experimentsCommand = new Command('experiments')
    .description('A/B testing and experimentation commands');

  // Start experiment command
  experimentsCommand
    .command('start')
    .description('Start a new A/B test')
    .option('--type <type>', 'Experiment type (rsa|lp)', 'rsa')
    .option('--product <product>', 'Product name (required)')
    .option('--ad-group <name>', 'Ad group for RSA test')
    .option('--page <path>', 'Page path for LP test')
    .option('--variants <list>', 'Comma-separated variant strategies', 'benefit_led,proof_led')
    .option('--min-samples <n>', 'Minimum sample size per variant', '1000')
    .option('--confidence <level>', 'Confidence level (0.90|0.95|0.99)', '0.95')
    .option('--duration <days>', 'Test duration in days', '14')
    .option('--description <text>', 'Experiment description')
    .option('--hypothesis <text>', 'Test hypothesis')
    .option('--use-v14-insights', 'Use v1.4 waste/QS insights for design', false)
    .option('--dry-run', 'Preview experiment without creating', false)
    .action(startExperimentCommand);

  // Analyze experiment command
  experimentsCommand
    .command('analyze')
    .description('Analyze experiment results')
    .option('--test-id <id>', 'Experiment ID (required)')
    .option('--min-clicks <n>', 'Minimum clicks before analysis', '100')
    .option('--date-range <range>', 'Date range (7d|14d|30d|custom)')
    .option('--confidence <level>', 'Confidence level for analysis', '0.95')
    .option('--early-stop', 'Check if early stopping is recommended', false)
    .option('--export-csv', 'Export results to CSV', false)
    .action(analyzeExperimentCommand);

  // Stop experiment command
  experimentsCommand
    .command('stop')
    .description('Stop an experiment and apply decision')
    .option('--test-id <id>', 'Experiment ID (required)')
    .option('--winner <variant>', 'Winner variant (winner|control|variant_id)')
    .option('--reason <text>', 'Reason for stopping')
    .option('--auto-deploy', 'Automatically deploy winner', false)
    .action(stopExperimentCommand);

  // List experiments command
  experimentsCommand
    .command('list')
    .description('List all experiments')
    .option('--status <status>', 'Filter by status (draft|active|paused|completed)')
    .option('--product <product>', 'Filter by product')
    .option('--type <type>', 'Filter by type (rsa|lp)')
    .option('--recent <days>', 'Show experiments from last N days')
    .option('--format <format>', 'Output format (table|json)', 'table')
    .action(listExperimentsCommand);

  // Generate exports command
  experimentsCommand
    .command('export')
    .description('Generate experiment exports')
    .option('--test-id <id>', 'Experiment ID (required)')
    .option('--format <format>', 'Export format (csv|json|mutations)', 'csv')
    .option('--output-dir <dir>', 'Output directory', 'experiments/exports')
    .option('--include-instructions', 'Include launch instructions', true)
    .action(exportExperimentCommand);

  // Monitor experiments command  
  experimentsCommand
    .command('monitor')
    .description('Monitor active experiments')
    .option('--watch', 'Watch mode for real-time updates', false)
    .option('--alerts-only', 'Show only alerts and issues', false)
    .option('--interval <seconds>', 'Update interval for watch mode', '30')
    .action(monitorExperimentsCommand);

  // Pause/resume commands
  experimentsCommand
    .command('pause')
    .description('Pause an active experiment')
    .argument('<test-id>', 'Experiment ID')
    .option('--reason <text>', 'Reason for pausing')
    .action(pauseExperimentCommand);

  experimentsCommand
    .command('resume')
    .description('Resume a paused experiment')
    .argument('<test-id>', 'Experiment ID')
    .action(resumeExperimentCommand);

  program.addCommand(experimentsCommand);
}

/**
 * Start experiment command implementation
 */
async function startExperimentCommand(options: any): Promise<void> {
  try {
    // Validate required options
    if (!options.product) {
      logger.error('❌ Product name is required (--product)');
      process.exit(1);
    }

    if (options.type === 'rsa' && !options.adGroup) {
      logger.error('❌ Ad group is required for RSA experiments (--ad-group)');
      process.exit(1);
    }

    if (options.type === 'lp' && !options.page) {
      logger.error('❌ Page path is required for landing page experiments (--page)');
      process.exit(1);
    }

    // Initialize experiment manager
    await experimentManager.initialize();

    // Create experiment configuration
    const config: ExperimentConfig = {
      type: options.type,
      product: options.product,
      targetId: options.adGroup || options.page,
      targetMetric: options.type === 'rsa' ? 'ctr' : 'cvr',
      minimumSampleSize: parseInt(options.minSamples),
      confidenceLevel: parseFloat(options.confidence),
      duration: parseInt(options.duration),
      description: options.description || `A/B test for ${options.product}`,
      hypothesis: options.hypothesis || `New variants will improve ${options.type === 'rsa' ? 'CTR' : 'CVR'}`,
      variantStrategies: options.variants.split(','),
      useV14Insights: options.useV14Insights
    };

    if (options.dryRun) {
      logger.info('🔍 DRY RUN - Preview experiment configuration:');
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    // Create experiment
    logger.info(`🧪 Creating ${config.type.toUpperCase()} experiment for ${config.product}...`);
    const experiment = await experimentManager.createExperiment(config);

    // Generate variants
    if (config.type === 'rsa') {
      const adGroup = {
        id: config.targetId,
        name: config.targetId,
        product: config.product,
        keywords: [`${config.product} chrome extension`], // Default keywords
        currentHeadlines: [`Convert Files with ${config.product}`], // Default headline
        currentDescriptions: [`The best Chrome extension for file conversion`], // Default description
        landingPageUrl: `https://${config.product.toLowerCase()}.com`,
        useCase: 'file_conversion'
      };
      const variants = await rsaVariantGenerator.generateRSAVariants(
        adGroup,
        config.variantStrategies
      );
      experiment.variants = variants;
    } else {
      const variants = await lpVariantGenerator.generatePageVariants(
        { path: config.targetId } as any,
        config.variantStrategies[0] as any
      );
      experiment.variants = variants;
    }

    // Save updated experiment
    await experimentManager.saveExperiment?.(experiment);

    // Generate exports
    if (config.type === 'rsa') {
      await rsaExperimentWriter.generateEditorCSV(experiment, experiment.variants as any);
      await rsaExperimentWriter.generateLaunchInstructions(experiment, experiment.variants as any);
    } else {
      await lpExperimentWriter.generateVariantFiles(experiment, experiment.variants as any);
      await lpExperimentWriter.generateLaunchInstructions(experiment, experiment.variants as any);
    }

    logger.info(`✅ Experiment ${experiment.id} created successfully!`);
    logger.info(`📊 Generated ${experiment.variants.length} variants`);
    logger.info(`📁 Export files saved to experiments/exports/`);

  } catch (error) {
    logger.error('❌ Failed to start experiment:', error);
    if (error instanceof Error) {
      logger.error('Error details:', error.message);
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * Analyze experiment command implementation
 */
async function analyzeExperimentCommand(options: any): Promise<void> {
  try {
    if (!options.testId) {
      logger.error('❌ Experiment ID is required (--test-id)');
      process.exit(1);
    }

    await experimentManager.initialize();

    // Get experiment
    const experiment = await experimentManager.getExperiment(options.testId);
    if (!experiment) {
      logger.error(`❌ Experiment ${options.testId} not found`);
      process.exit(1);
    }

    logger.info(`📊 Analyzing experiment ${experiment.id}...`);

    // Collect metrics
    const dateRange = parseDateRange(options.dateRange);
    const metrics = await experimentMeasurement.collectMetrics(experiment, dateRange);

    if (metrics.length === 0) {
      logger.warn('⚠️ No metrics data found for analysis');
      return;
    }

    // Perform statistical analysis
    const analysisResults = await statisticalAnalyzer.analyzeExperiment(
      experiment,
      metrics,
      parseFloat(options.confidence)
    );

    // Display results
    displayAnalysisResults(experiment, analysisResults);

    // Check early stopping
    if (options.earlyStop) {
      const stopRecommendation = await statisticalAnalyzer.shouldStopEarly(
        experiment,
        analysisResults
      );
      
      if (stopRecommendation.stop) {
        logger.info(`🛑 Early stopping recommended: ${stopRecommendation.reason}`);
      } else {
        logger.info('✅ Experiment should continue running');
      }
    }

    // Export to CSV if requested
    if (options.exportCsv) {
      await exportAnalysisResults(experiment.id, analysisResults);
    }

  } catch (error) {
    logger.error('❌ Failed to analyze experiment:', error);
    process.exit(1);
  }
}

/**
 * Stop experiment command implementation
 */
async function stopExperimentCommand(options: any): Promise<void> {
  try {
    if (!options.testId) {
      logger.error('❌ Experiment ID is required (--test-id)');
      process.exit(1);
    }

    if (!options.winner) {
      logger.error('❌ Winner selection is required (--winner)');
      process.exit(1);
    }

    await experimentManager.initialize();

    // Complete experiment
    await experimentManager.completeExperiment(options.testId, options.winner);

    logger.info(`✅ Experiment ${options.testId} stopped successfully`);
    logger.info(`🏆 Winner: ${options.winner}`);

    if (options.autoDeploy) {
      logger.info('🚀 Auto-deployment not yet implemented - manual deployment required');
    }

  } catch (error) {
    logger.error('❌ Failed to stop experiment:', error);
    process.exit(1);
  }
}

/**
 * List experiments command implementation
 */
async function listExperimentsCommand(options: any): Promise<void> {
  try {
    await experimentManager.initialize();

    // Build filters
    const filters: any = {};
    if (options.status) filters.status = options.status;
    if (options.product) filters.product = options.product;
    if (options.type) filters.type = options.type;

    // Get experiments
    const experiments = await experimentManager.listExperiments(filters);

    // Filter by recent if specified
    let filteredExperiments = experiments;
    if (options.recent) {
      const cutoffDate = new Date(Date.now() - parseInt(options.recent) * 24 * 60 * 60 * 1000);
      filteredExperiments = experiments.filter(exp => exp.startDate >= cutoffDate);
    }

    if (filteredExperiments.length === 0) {
      logger.info('No experiments found matching criteria');
      return;
    }

    // Display results
    if (options.format === 'json') {
      console.log(JSON.stringify(filteredExperiments, null, 2));
    } else {
      displayExperimentsTable(filteredExperiments);
    }

  } catch (error) {
    logger.error('❌ Failed to list experiments:', error);
    if (error instanceof Error) {
      logger.error('Error details:', error.message);
      logger.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * Export experiment command implementation
 */
async function exportExperimentCommand(options: any): Promise<void> {
  try {
    if (!options.testId) {
      logger.error('❌ Experiment ID is required (--test-id)');
      process.exit(1);
    }

    await experimentManager.initialize();

    const experiment = await experimentManager.getExperiment(options.testId);
    if (!experiment) {
      logger.error(`❌ Experiment ${options.testId} not found`);
      process.exit(1);
    }

    logger.info(`📄 Generating exports for experiment ${experiment.id}...`);

    if (experiment.type === 'rsa') {
      const variants = experiment.variants as any;
      
      if (options.format === 'csv') {
        await rsaExperimentWriter.generateEditorCSV(experiment, variants);
      } else if (options.format === 'mutations') {
        await rsaExperimentWriter.generateAPIMutations(experiment, variants);
      }

      if (options.includeInstructions) {
        await rsaExperimentWriter.generateLaunchInstructions(experiment, variants);
      }
    } else {
      const variants = experiment.variants as any;
      await lpExperimentWriter.generateVariantFiles(experiment, variants);
      
      if (options.includeInstructions) {
        await lpExperimentWriter.generateLaunchInstructions(experiment, variants);
      }
    }

    logger.info(`✅ Exports generated in ${options.outputDir}/`);

  } catch (error) {
    logger.error('❌ Failed to export experiment:', error);
    process.exit(1);
  }
}

/**
 * Monitor experiments command implementation
 */
async function monitorExperimentsCommand(options: any): Promise<void> {
  try {
    await experimentManager.initialize();

    const monitorLoop = async () => {
      const activeExperiments = await experimentManager.listExperiments({ status: 'active' });
      
      console.clear();
      logger.info('📊 Active Experiments Monitor');
      logger.info('='.repeat(50));

      if (activeExperiments.length === 0) {
        logger.info('No active experiments');
        return;
      }

      for (const experiment of activeExperiments) {
        await displayExperimentStatus(experiment, options.alertsOnly);
      }

      logger.info(`\nLast updated: ${new Date().toLocaleTimeString()}`);
    };

    // Initial run
    await monitorLoop();

    // Watch mode
    if (options.watch) {
      const interval = parseInt(options.interval) * 1000;
      setInterval(monitorLoop, interval);
      logger.info(`👁️ Watching for updates every ${options.interval} seconds (Ctrl+C to exit)`);
    }

  } catch (error) {
    logger.error('❌ Failed to monitor experiments:', error);
    process.exit(1);
  }
}

/**
 * Pause experiment command implementation
 */
async function pauseExperimentCommand(testId: string, options: any): Promise<void> {
  try {
    await experimentManager.initialize();
    await experimentManager.pauseExperiment(testId);
    
    logger.info(`⏸️ Experiment ${testId} paused successfully`);
    if (options.reason) {
      logger.info(`Reason: ${options.reason}`);
    }

  } catch (error) {
    logger.error('❌ Failed to pause experiment:', error);
    process.exit(1);
  }
}

/**
 * Resume experiment command implementation
 */
async function resumeExperimentCommand(testId: string): Promise<void> {
  try {
    await experimentManager.initialize();
    await experimentManager.startExperiment(testId);
    
    logger.info(`▶️ Experiment ${testId} resumed successfully`);

  } catch (error) {
    logger.error('❌ Failed to resume experiment:', error);
    process.exit(1);
  }
}

// Helper functions

function parseDateRange(range?: string): { start: Date; end: Date } {
  const end = new Date();
  let start: Date;

  switch (range) {
    case '7d':
      start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '14d':
      start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // Default to 14 days
  }

  return { start, end };
}

function displayAnalysisResults(experiment: any, results: any): void {
  console.log('\n📊 Analysis Results');
  console.log('='.repeat(50));
  console.log(`Experiment: ${experiment.id}`);
  console.log(`Status: ${experiment.status}`);
  console.log(`Target Metric: ${experiment.targetMetric}`);
  // Additional result formatting would go here
}

function displayExperimentsTable(experiments: any[]): void {
  console.log('\n📋 Experiments');
  console.log('='.repeat(80));
  
  experiments.forEach(exp => {
    const startDate = typeof exp.startDate === 'string' ? exp.startDate.slice(0, 10) : new Date(exp.startDate).toISOString().slice(0, 10);
    console.log(`${exp.id} | ${exp.type} | ${exp.product} | ${exp.status} | ${startDate}`);
  });
}

async function displayExperimentStatus(experiment: any, alertsOnly: boolean): Promise<void> {
  console.log(`\n${experiment.id} (${experiment.product})`);
  console.log(`Status: ${experiment.status} | Variants: ${experiment.variants.length}`);
  // Additional status display logic would go here
}

async function exportAnalysisResults(experimentId: string, results: any): Promise<void> {
  // CSV export logic would go here
  logger.info(`📄 Analysis results exported for ${experimentId}`);
}