# Unified CLI Organization for v1.4-v1.6

## Executive Summary

This document addresses the CLI command organization challenge identified during implementation plan analysis. With 25+ commands across v1.4, v1.5, and v1.6, we need a clear hierarchical structure to maintain usability.

## Proposed Command Structure

### Core Commands (v1.3 - Existing)
```bash
seo-ads plan --product <name> --markets <list>     # Generate keyword plans
seo-ads list --product <name>                      # List generated plans  
seo-ads show --product <name> --date <date>        # Show specific plan
seo-ads test                                        # Test API connections
```

### Performance Analysis Commands (v1.4)
```bash
seo-ads performance ingest-ads --product <name> --from gaql|csv
seo-ads performance analyze-waste --product <name> --window 30d  
seo-ads performance quality-score --product <name>
seo-ads performance paid-organic-gaps --product <name>
```

### Experimentation Commands (v1.5)
```bash
seo-ads experiments start --type rsa --product <name> --ad-group <name>
seo-ads experiments analyze --test-id <id> --min-clicks 200
seo-ads experiments stop --test-id <id> --accept winner
seo-ads experiments list --status active --product <name>
```

### Microsoft Ads Commands (v1.6)
```bash
seo-ads microsoft export --product <name> --markets <list>
seo-ads microsoft validate --path ./msads_export/ --strict
seo-ads microsoft sync --product <name> --direction google-to-microsoft
seo-ads microsoft edge-audit --product <name>
```

### Cross-Platform Monitoring Commands (v1.6)
```bash
seo-ads monitor cross-platform --product <name> --window 7d
seo-ads monitor alerts --check-thresholds
seo-ads monitor dashboard --format json|html
```

## Command Organization Strategy

### 1. Hierarchical Grouping
Commands are organized into logical groups:
- **Core**: Basic planning and listing functionality
- **Performance**: Data ingestion and waste analysis (v1.4)  
- **Experiments**: A/B testing and optimization (v1.5)
- **Microsoft**: Cross-platform integration (v1.6)
- **Monitor**: Cross-version monitoring and alerts

### 2. Consistent Option Patterns
All commands follow consistent patterns:
```bash
--product <name>        # Always required for product-specific commands
--format <type>         # Output format (json, csv, html, etc.)  
--dry-run              # Preview without executing
--validate-only        # Validation mode
--memory-limit <mb>    # Memory management
--batch-size <n>       # Batch processing size
--concurrent <n>       # Concurrency control
```

### 3. Progressive Disclosure
```bash
seo-ads --help                    # Shows main command groups
seo-ads performance --help        # Shows performance subcommands  
seo-ads experiments start --help  # Shows specific command options
```

## Implementation Approach

### Phase 1: Core CLI Refactoring
```typescript
// src/cli.ts - Main CLI structure
const program = new Command();

// Core commands (existing)
program
  .command('plan')
  .description('Generate keyword plans')
  .action(planCommand);

// v1.4 Performance commands
program
  .command('performance')
  .description('Performance analysis and optimization')
  .addCommand(new Command('ingest-ads').description('Import performance data'))
  .addCommand(new Command('analyze-waste').description('Analyze wasted spend'))
  .addCommand(new Command('quality-score').description('QS optimization'))
  .addCommand(new Command('paid-organic-gaps').description('Gap analysis'));

// v1.5 Experiment commands  
program
  .command('experiments')
  .description('A/B testing and experimentation')
  .addCommand(new Command('start').description('Start new experiment'))
  .addCommand(new Command('analyze').description('Analyze results'))
  .addCommand(new Command('stop').description('Stop experiment'))
  .addCommand(new Command('list').description('List experiments'));

// v1.6 Microsoft commands
program
  .command('microsoft')
  .description('Microsoft Ads integration')
  .addCommand(new Command('export').description('Export to Microsoft'))
  .addCommand(new Command('validate').description('Validate exports'))
  .addCommand(new Command('sync').description('Sync platforms'))
  .addCommand(new Command('edge-audit').description('Edge store audit'));

// v1.6 Monitoring commands
program
  .command('monitor')
  .description('Cross-platform monitoring')
  .addCommand(new Command('cross-platform').description('Platform comparison'))
  .addCommand(new Command('alerts').description('Check alerts'))
  .addCommand(new Command('dashboard').description('Generate dashboard'));
```

### Phase 2: Memory Management Integration
```typescript
// src/utils/memory-manager.ts
export class MemoryManager {
  private readonly maxMemoryMB: number;
  private readonly batchSize: number;
  
  constructor(options: { maxMemoryMB?: number; batchSize?: number } = {}) {
    this.maxMemoryMB = options.maxMemoryMB || 1024;
    this.batchSize = options.batchSize || 1000;
  }
  
  async processWithMemoryControl<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options: { 
      progressCallback?: (processed: number, total: number) => void;
      memoryCheckInterval?: number;
    } = {}
  ): Promise<R[]> {
    const results: R[] = [];
    const { progressCallback, memoryCheckInterval = 10 } = options;
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      
      // Memory check every N batches
      if (i % (this.batchSize * memoryCheckInterval) === 0) {
        await this.checkMemoryPressure();
      }
      
      const batchResults = await processor(batch);
      results.push(...batchResults);
      
      // Progress reporting
      if (progressCallback) {
        progressCallback(Math.min(i + this.batchSize, items.length), items.length);
      }
    }
    
    return results;
  }
  
  private async checkMemoryPressure(): Promise<void> {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > this.maxMemoryMB) {
      logger.warn(`Memory usage ${heapUsedMB.toFixed(1)}MB exceeds limit ${this.maxMemoryMB}MB`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection');
      }
      
      // Brief pause to allow GC
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}
```

### Phase 3: Database Connection Pool Enhancement
```typescript
// src/database/connection-pool.ts
export class DatabaseConnectionPool {
  private pool: Database[] = [];
  private inUse: Set<Database> = new Set();
  private readonly maxConnections: number;
  private readonly connectionTimeout: number;
  private readonly maxRetries: number;
  
  constructor(options: {
    maxConnections?: number;
    connectionTimeout?: number; 
    maxRetries?: number;
  } = {}) {
    this.maxConnections = options.maxConnections || 10;
    this.connectionTimeout = options.connectionTimeout || 30000;
    this.maxRetries = options.maxRetries || 3;
  }
  
  async withTransaction<T>(
    operation: (db: Database) => Promise<T>,
    options: {
      isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
      timeout?: number;
    } = {}
  ): Promise<T> {
    const { isolationLevel = 'READ_COMMITTED', timeout = this.connectionTimeout } = options;
    const connection = await this.getConnection();
    
    try {
      // Set isolation level
      await connection.run(`PRAGMA read_uncommitted = ${isolationLevel === 'READ_UNCOMMITTED' ? 1 : 0}`);
      
      await connection.run('BEGIN IMMEDIATE'); // Immediate lock for write operations
      
      const result = await Promise.race([
        operation(connection),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), timeout)
        )
      ]);
      
      await connection.run('COMMIT');
      return result;
    } catch (error) {
      await connection.run('ROLLBACK');
      
      // Retry logic for deadlock/busy errors
      if (this.isRetryableError(error) && options.maxRetries > 0) {
        logger.warn(`Retryable database error, retrying: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief backoff
        return this.withTransaction(operation, { ...options, maxRetries: options.maxRetries - 1 });
      }
      
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }
  
  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('database is locked') || 
           message.includes('busy') || 
           message.includes('deadlock');
  }
}
```

## Command Usage Examples

### Complete Workflow Examples
```bash
# 1. Initial setup and analysis (v1.4)
seo-ads performance ingest-ads --product convertmyfile --from gaql
seo-ads performance analyze-waste --product convertmyfile --min-spend 10
seo-ads performance quality-score --product convertmyfile

# 2. Start optimization experiments (v1.5)
seo-ads experiments start --type rsa --product convertmyfile \
  --ad-group "WebP Conversion" --variants benefit,proof --use-v14-insights

# 3. Monitor and analyze experiments
seo-ads experiments analyze --test-id EXP-001 --min-clicks 200 --streaming

# 4. Expand to Microsoft platform (v1.6)
seo-ads microsoft export --product convertmyfile --markets US,AU \
  --use-v14-negatives --use-v15-winners

# 5. Cross-platform monitoring
seo-ads monitor cross-platform --product convertmyfile --window 7d
```

### Memory-Conscious Operations
```bash
# Large dataset processing with memory limits
seo-ads performance analyze-waste --product convertmyfile \
  --memory-limit 512 --batch-size 500 --window 90d

# Statistical analysis with streaming
seo-ads experiments analyze --test-id EXP-001 \
  --streaming --memory-limit 1024

# Large Microsoft export with batching
seo-ads microsoft export --product convertmyfile \
  --memory-limit 1024 --batch-size 250
```

## Help System Enhancement

### Contextual Help
```bash
seo-ads --help                           # Main categories
seo-ads performance --help               # Performance commands
seo-ads experiments start --help         # Specific command details
seo-ads microsoft export --help          # Microsoft export options
```

### Interactive Command Builder
```bash
seo-ads interactive                      # Launch interactive mode
? Select command category: Performance Analysis
? Select command: Analyze Waste  
? Product name: convertmyfile
? Analysis window: 30d
? Memory limit: 512MB
→ Generated: seo-ads performance analyze-waste --product convertmyfile --window 30d --memory-limit 512
```

## Migration Strategy

### Backward Compatibility
- All existing v1.3 commands remain unchanged
- New commands are purely additive
- Existing workflows continue to function

### Gradual Adoption
1. **Week 1**: Core functionality with performance commands
2. **Week 2**: Add experimentation capabilities
3. **Week 3**: Microsoft platform integration
4. **Week 4**: Complete monitoring and cross-platform features

## Testing Strategy

### CLI Integration Tests
```typescript
describe('CLI Organization', () => {
  it('should show correct help hierarchy', async () => {
    const output = await execCommand('seo-ads --help');
    expect(output).toContain('performance');
    expect(output).toContain('experiments');
    expect(output).toContain('microsoft');
  });
  
  it('should handle memory limits across all commands', async () => {
    const commands = [
      'performance analyze-waste --memory-limit 256',
      'experiments analyze --memory-limit 512',
      'microsoft export --memory-limit 1024'
    ];
    
    for (const cmd of commands) {
      const result = await execCommand(`seo-ads ${cmd} --dry-run`);
      expect(result.exitCode).toBe(0);
    }
  });
});
```

## Documentation Updates Required

1. **User Guide**: New command structure examples
2. **CLI Reference**: Complete command catalog  
3. **Migration Guide**: v1.3 → v1.4+ transition
4. **Memory Management Guide**: Best practices for large datasets
5. **Troubleshooting**: Common memory and concurrency issues

## Expected Benefits

1. **Improved Usability**: Logical command grouping reduces cognitive load
2. **Better Performance**: Memory management prevents crashes on large datasets
3. **Reliable Concurrency**: Database connection pooling handles simultaneous operations
4. **Consistent Experience**: Uniform option patterns across all commands
5. **Progressive Learning**: Users can master one category at a time

This unified CLI organization transforms the complex multi-version system into an intuitive, hierarchical interface that scales with user expertise and dataset size.