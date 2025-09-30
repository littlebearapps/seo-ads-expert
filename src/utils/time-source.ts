/**
 * Time Source Provider
 * Phase 0.2 - Shared Utilities
 *
 * Purpose: Make all time-dependent code deterministic and testable
 *
 * Benefits:
 * - Eliminates time-drift test flakes
 * - No more Date.now() scattered everywhere
 * - Fake timers work reliably
 * - Batch fix across 8+ time-sensitive test failures
 *
 * GPT-5 Final Adjustment: Use module-local variable instead of Object.assign
 * to avoid method binding issues
 */

export interface TimeSource {
  now(): Date;
  timestamp(): number;
}

class SystemTimeSource implements TimeSource {
  now(): Date {
    return new Date();
  }

  timestamp(): number {
    return Date.now();
  }
}

// Module-local current source (not exported directly)
let current: TimeSource = new SystemTimeSource();

/**
 * Get current time as Date object
 * In production: returns system time
 * In tests: returns frozen time if setTimeSource called
 */
export function now(): Date {
  return current.now();
}

/**
 * Get current time as Unix timestamp (milliseconds)
 * In production: returns Date.now()
 * In tests: returns frozen timestamp if setTimeSource called
 */
export function timestamp(): number {
  return current.timestamp();
}

/**
 * Set the time source for testing
 * @param source - TimeSource implementation (e.g., freezeTime())
 */
export function setTimeSource(source: TimeSource): void {
  current = source;  // Simple assignment, no Object.assign weirdness
}

/**
 * Reset to system time (for cleanup in tests)
 */
export function resetTimeSource(): void {
  current = new SystemTimeSource();
}

/**
 * Create a frozen time source for testing
 * @param date - Date to freeze time at
 * @returns TimeSource that always returns the same date/timestamp
 *
 * @example
 * ```typescript
 * import { freezeTime, setTimeSource, resetTimeSource } from '@/utils/time-source';
 *
 * beforeEach(() => {
 *   setTimeSource(freezeTime(new Date('2025-09-30T12:00:00Z')));
 * });
 *
 * afterEach(() => {
 *   resetTimeSource();
 * });
 * ```
 */
export function freezeTime(date: Date): TimeSource {
  return {
    now: () => new Date(date),
    timestamp: () => date.getTime()
  };
}

/**
 * Create a controllable time source for testing
 * @param initialDate - Starting date
 * @returns TimeSource with advance() method to move time forward
 *
 * @example
 * ```typescript
 * const timeSource = advancingTime(new Date('2025-09-30T12:00:00Z'));
 * setTimeSource(timeSource);
 * timeSource.advance(3600000); // Advance 1 hour
 * ```
 */
export function advancingTime(initialDate: Date): TimeSource & { advance(ms: number): void } {
  let currentTime = initialDate.getTime();

  return {
    now: () => new Date(currentTime),
    timestamp: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
    }
  };
}

/**
 * Get a date relative to current time
 * @param ms - Milliseconds to add (negative for past)
 * @returns Date object
 */
export function relativeDate(ms: number): Date {
  return new Date(timestamp() + ms);
}

/**
 * Check if a date is in the past (relative to current time source)
 * @param date - Date to check
 * @returns true if date is before current time
 */
export function isPast(date: Date): boolean {
  return date.getTime() < timestamp();
}

/**
 * Check if a date is in the future (relative to current time source)
 * @param date - Date to check
 * @returns true if date is after current time
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > timestamp();
}

/**
 * Get milliseconds until a future date
 * @param date - Target date
 * @returns Milliseconds until date (0 if date is in past)
 */
export function millisecondsUntil(date: Date): number {
  const diff = date.getTime() - timestamp();
  return Math.max(0, diff);
}

/**
 * Get milliseconds since a past date
 * @param date - Past date
 * @returns Milliseconds since date (0 if date is in future)
 */
export function millisecondsSince(date: Date): number {
  const diff = timestamp() - date.getTime();
  return Math.max(0, diff);
}