/**
 * Date Adapter Utility
 * Phase 0.1 - Shared Utilities
 *
 * Purpose: Eliminate date handling inconsistencies across DB operations and tests
 *
 * Benefits:
 * - Eliminates "Invalid Date" test failures
 * - Consistent ISO 8601 handling everywhere
 * - Single source of truth for date logic
 * - Batch fix across 14+ date-related test failures
 */

/**
 * Parse a database date string to a Date object
 * @param dateStr - Date string from database (ISO 8601 format expected)
 * @returns Date object if valid, undefined otherwise
 */
export function parseDbDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return isValidDate(date) ? date : undefined;
}

/**
 * Format a Date object for database storage
 * @param date - Date object to format
 * @returns ISO 8601 string if valid, null otherwise
 */
export function formatDbDate(date: Date | undefined): string | null {
  if (!date || !isValidDate(date)) return null;
  return date.toISOString();
}

/**
 * Check if a value is a valid Date object
 * @param date - Value to check
 * @returns true if valid Date, false otherwise
 */
export function isValidDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Normalize input to ISO string format
 * @param input - Date object, string, or undefined
 * @returns ISO 8601 string if valid, undefined otherwise
 */
export function normalizeToIsoString(input: Date | string | undefined): string | undefined {
  if (!input) return undefined;
  const date = typeof input === 'string' ? parseDbDate(input) : input;
  return date ? formatDbDate(date) ?? undefined : undefined;
}

/**
 * Parse a date with flexible input handling
 * @param input - Date, string, number, or undefined
 * @returns Date object if valid, undefined otherwise
 */
export function parseFlexibleDate(input: Date | string | number | null | undefined): Date | undefined {
  if (!input) return undefined;

  if (input instanceof Date) {
    return isValidDate(input) ? input : undefined;
  }

  if (typeof input === 'number') {
    const date = new Date(input);
    return isValidDate(date) ? date : undefined;
  }

  if (typeof input === 'string') {
    return parseDbDate(input);
  }

  return undefined;
}

/**
 * Check if two dates are equal (by timestamp)
 * @param date1 - First date
 * @param date2 - Second date
 * @returns true if dates are equal, false otherwise
 */
export function datesEqual(date1: Date | undefined, date2: Date | undefined): boolean {
  if (!date1 || !date2) return date1 === date2;
  return date1.getTime() === date2.getTime();
}

/**
 * Add days to a date
 * @param date - Base date
 * @param days - Number of days to add (can be negative)
 * @returns New date with days added
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if date is in the past
 * @param date - Date to check
 * @returns true if date is before now
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Check if date is in the future
 * @param date - Date to check
 * @returns true if date is after now
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Get date range string for display
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Formatted date range string
 */
export function formatDateRange(startDate: Date | undefined, endDate: Date | undefined): string {
  if (!startDate && !endDate) return 'No dates set';
  if (!startDate) return `Until ${formatDbDate(endDate)}`;
  if (!endDate) return `From ${formatDbDate(startDate)}`;
  return `${formatDbDate(startDate)} to ${formatDbDate(endDate)}`;
}