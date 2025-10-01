/**
 * Clock abstraction for deterministic date/time handling
 * Allows for easy mocking in tests while using real system time in production
 */

export interface Clock {
  /**
   * Get current date/time
   */
  now(): Date;

  /**
   * Get today's date in UTC as YYYY-MM-DD string
   */
  todayUTC(): string;

  /**
   * Get start of day in UTC
   */
  startOfDayUTC(date?: Date): Date;

  /**
   * Get current hour in UTC (0-23)
   */
  currentUTCHour(): number;
}

/**
 * Real system clock implementation
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  startOfDayUTC(date: Date = this.now()): Date {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ));
  }

  currentUTCHour(): number {
    return this.now().getUTCHours();
  }
}

/**
 * Fixed clock for testing - always returns the same time
 */
export class FixedClock implements Clock {
  constructor(private fixed: Date) {}

  now(): Date {
    return new Date(this.fixed);
  }

  todayUTC(): string {
    return this.fixed.toISOString().slice(0, 10);
  }

  startOfDayUTC(date: Date = this.fixed): Date {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ));
  }

  currentUTCHour(): number {
    return this.fixed.getUTCHours();
  }
}

// Singleton instance - defaults to system clock
let activeClock: Clock = new SystemClock();

/**
 * Get the current active clock instance
 */
export function getClock(): Clock {
  return activeClock;
}

/**
 * Set a custom clock for testing
 */
export function setClockForTests(clock: Clock): void {
  activeClock = clock;
}

/**
 * Reset to system clock (useful in test cleanup)
 */
export function resetClock(): void {
  activeClock = new SystemClock();
}

// Convenience functions for minimal refactoring
export const now = (): Date => getClock().now();
export const todayUTC = (): string => getClock().todayUTC();
export const startOfDayUTC = (date?: Date): Date => getClock().startOfDayUTC(date);
export const currentUTCHour = (): number => getClock().currentUTCHour();

/**
 * Format date as YYYY-MM-DD in UTC
 */
export function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Add days to a date (UTC-safe)
 */
export function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Get date range for last N days from today
 */
export function getLastNDaysRange(days: number): { start: string; end: string } {
  const clock = getClock();
  const end = clock.todayUTC();
  const startDate = addDaysUTC(clock.startOfDayUTC(), -days);
  const start = formatDateUTC(startDate);
  return { start, end };
}