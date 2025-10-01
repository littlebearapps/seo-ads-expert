/**
 * Common types for optimization strategies
 * Compatible with existing ThompsonSamplingOptimizer
 */

// Re-export existing types from thompson-sampling.ts for compatibility
export {
  Arm,
  BudgetConstraints,
  AllocationResult,
  BayesianPosterior
} from './thompson-sampling.js';

/**
 * Extended optimization result for strategy patterns
 */
export interface OptimizationResult {
  success: boolean;
  allocations: AllocationResult[];
  totalAllocated: number;
  reasoning: string;
  metadata: {
    optimizationTime?: number;
    iterations?: number;
    error?: string;
    strategyInfo?: Record<string, string>;
    [key: string]: unknown;
  };
}