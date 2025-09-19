/**
 * Structured Logger for v1.9
 * Provides consistent structured logging across all components
 */

import pino from 'pino';
import { EventEmitter } from 'events';

// Log Levels
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Log Categories
export enum LogCategory {
  CRAWL = 'crawl',
  INDEXATION = 'indexation',
  SITEMAP = 'sitemap',
  HEALTH = 'health',
  ROBOTS = 'robots',
  INDEXNOW = 'indexnow',
  GSC = 'gsc',
  DATABASE = 'database',
  API = 'api',
  PERFORMANCE = 'performance'
}

// Structured Log Entry
export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  component: string;
  message: string;
  data?: any;
  metadata?: {
    sessionId?: string;
    requestId?: string;
    userId?: string;
    duration?: number;
    count?: number;
  };
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    startTime?: number;
    endTime?: number;
    duration?: number;
    memoryUsed?: number;
  };
}

// Log Context
export interface LogContext {
  sessionId?: string;
  requestId?: string;
  userId?: string;
  component?: string;
}

export class StructuredLogger {
  private logger: pino.Logger;
  private context: LogContext;
  private eventEmitter: EventEmitter;
  private performanceMarks: Map<string, number>;

  constructor(context?: LogContext) {
    this.context = context || {};
    this.eventEmitter = new EventEmitter();
    this.performanceMarks = new Map();

    // Configure Pino
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => {
          return { level: label };
        },
        bindings: () => {
          return {};
        }
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        error: pino.stdSerializers.err
      }
    });
  }

  // ============= Core Logging Methods =============

  trace(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.TRACE, category, message, data);
  }

  debug(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  warn(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  error(category: LogCategory, message: string, error?: Error | any, data?: any): void {
    const logEntry: StructuredLogEntry = this.createLogEntry(
      LogLevel.ERROR,
      category,
      message,
      data
    );

    if (error) {
      logEntry.error = {
        message: error.message || String(error),
        stack: error.stack,
        code: error.code
      };
    }

    this.emit(logEntry);
  }

  fatal(category: LogCategory, message: string, error?: Error, data?: any): void {
    const logEntry: StructuredLogEntry = this.createLogEntry(
      LogLevel.FATAL,
      category,
      message,
      data
    );

    if (error) {
      logEntry.error = {
        message: error.message,
        stack: error.stack,
        code: error.code
      };
    }

    this.emit(logEntry);
  }

  // ============= Specialized Logging Methods =============

  /**
   * Log crawl operation
   */
  logCrawl(operation: string, url: string, data?: any): void {
    this.info(LogCategory.CRAWL, `${operation}: ${url}`, {
      operation,
      url,
      ...data
    });
  }

  /**
   * Log indexation operation
   */
  logIndexation(operation: string, data: any): void {
    this.info(LogCategory.INDEXATION, operation, data);
  }

  /**
   * Log sitemap operation
   */
  logSitemap(operation: string, data: any): void {
    this.info(LogCategory.SITEMAP, operation, data);
  }

  /**
   * Log health check
   */
  logHealth(check: string, result: any): void {
    this.info(LogCategory.HEALTH, `Health check: ${check}`, result);
  }

  /**
   * Log robots.txt operation
   */
  logRobots(operation: string, data: any): void {
    this.info(LogCategory.ROBOTS, operation, data);
  }

  /**
   * Log IndexNow submission
   */
  logIndexNow(engine: string, result: any): void {
    this.info(LogCategory.INDEXNOW, `IndexNow submission to ${engine}`, result);
  }

  /**
   * Log GSC operation
   */
  logGSC(operation: string, data: any): void {
    this.info(LogCategory.GSC, `GSC: ${operation}`, data);
  }

  /**
   * Log database operation
   */
  logDatabase(operation: string, table: string, data?: any): void {
    this.debug(LogCategory.DATABASE, `DB ${operation} on ${table}`, data);
  }

  /**
   * Log API call
   */
  logAPI(method: string, endpoint: string, data?: any): void {
    this.info(LogCategory.API, `${method} ${endpoint}`, data);
  }

  // ============= Performance Logging =============

  /**
   * Start performance measurement
   */
  startPerformance(label: string): void {
    this.performanceMarks.set(label, Date.now());
  }

  /**
   * End performance measurement and log
   */
  endPerformance(label: string, metadata?: any): void {
    const startTime = this.performanceMarks.get(label);
    if (!startTime) {
      this.warn(LogCategory.PERFORMANCE, `No start mark found for: ${label}`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    const logEntry: StructuredLogEntry = this.createLogEntry(
      LogLevel.INFO,
      LogCategory.PERFORMANCE,
      `Performance: ${label}`,
      metadata
    );

    logEntry.performance = {
      startTime,
      endTime,
      duration,
      memoryUsed: process.memoryUsage().heapUsed
    };

    this.emit(logEntry);
    this.performanceMarks.delete(label);
  }

  // ============= Context Management =============

  /**
   * Create child logger with additional context
   */
  child(additionalContext: LogContext): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext
    });
  }

  /**
   * Update context
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  // ============= Batch Logging =============

  /**
   * Log batch operation progress
   */
  logBatch(operation: string, progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  }): void {
    const percentage = Math.round((progress.processed / progress.total) * 100);

    this.info(LogCategory.PERFORMANCE, `Batch ${operation}: ${percentage}%`, {
      operation,
      ...progress,
      percentage
    });
  }

  // ============= Audit Logging =============

  /**
   * Log audit trail entry
   */
  logAudit(action: string, resource: string, details: any): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      resource,
      userId: this.context.userId,
      sessionId: this.context.sessionId,
      details
    };

    this.info(LogCategory.API, `Audit: ${action} on ${resource}`, auditEntry);
  }

  // ============= Helper Methods =============

  private log(level: LogLevel, category: LogCategory, message: string, data?: any): void {
    const logEntry = this.createLogEntry(level, category, message, data);
    this.emit(logEntry);
  }

  private createLogEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: any
  ): StructuredLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      component: this.context.component || 'unknown',
      message,
      data,
      metadata: {
        sessionId: this.context.sessionId,
        requestId: this.context.requestId,
        userId: this.context.userId
      }
    };
  }

  private emit(entry: StructuredLogEntry): void {
    // Emit to Pino
    const pinoLevel = entry.level as string;
    const logObject = {
      category: entry.category,
      component: entry.component,
      ...entry.metadata,
      ...entry.data,
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.performance ? { performance: entry.performance } : {})
    };

    this.logger[pinoLevel](logObject, entry.message);

    // Emit event for external listeners
    this.eventEmitter.emit('log', entry);
  }

  // ============= Event Subscription =============

  /**
   * Subscribe to log events
   */
  on(event: 'log', listener: (entry: StructuredLogEntry) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Unsubscribe from log events
   */
  off(event: 'log', listener: (entry: StructuredLogEntry) => void): void {
    this.eventEmitter.off(event, listener);
  }

  // ============= Log Formatting =============

  /**
   * Format log entry for console output
   */
  static formatForConsole(entry: StructuredLogEntry): string {
    const levelEmoji = {
      [LogLevel.TRACE]: '🔍',
      [LogLevel.DEBUG]: '🐛',
      [LogLevel.INFO]: '📘',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌',
      [LogLevel.FATAL]: '💀'
    };

    const parts = [
      entry.timestamp,
      levelEmoji[entry.level],
      `[${entry.category}]`,
      entry.message
    ];

    if (entry.data) {
      parts.push(JSON.stringify(entry.data, null, 2));
    }

    if (entry.error) {
      parts.push(`\nError: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(entry.error.stack);
      }
    }

    if (entry.performance) {
      parts.push(`\nDuration: ${entry.performance.duration}ms`);
    }

    return parts.join(' ');
  }

  /**
   * Format log entry as JSON
   */
  static formatAsJSON(entry: StructuredLogEntry): string {
    return JSON.stringify(entry, null, 2);
  }
}

// ============= Global Logger Instance =============

let globalLogger: StructuredLogger | null = null;

export function initializeLogger(context?: LogContext): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger(context);
  }
  return globalLogger;
}

export function getLogger(): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger();
  }
  return globalLogger;
}

// ============= Convenience Exports =============

export const structuredLogger = getLogger();