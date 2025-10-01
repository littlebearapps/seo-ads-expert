/**
 * Shared test utilities for Clock abstraction and fake timers
 * Provides consistent setup/teardown for deterministic date/time testing
 */

import { vi } from 'vitest';
import { setClockForTests, FixedClock, resetClock, getClock } from '../core/clock.js';
import { setupSeededRandom, teardownSeededRandom, SeededRandomProvider } from './seeded-random.js';

/**
 * Setup fake timers with fixed clock for deterministic testing
 */
export function setupFixedClock(dateString: string = '2025-01-20T12:00:00Z'): void {
  vi.useFakeTimers();
  const testDate = new Date(dateString);
  vi.setSystemTime(testDate);
  setClockForTests(new FixedClock(testDate));
}

/**
 * Setup deterministic environment for Thompson sampling tests
 * Combines fixed clock and seeded random for full determinism
 */
export function setupDeterministicEnvironment(
  dateString: string = '2025-01-20T12:00:00Z',
  randomSeed: number = 12345
): { clock: FixedClock; random: SeededRandomProvider } {
  setupFixedClock(dateString);
  const randomProvider = setupSeededRandom(randomSeed);
  return {
    clock: new FixedClock(new Date(dateString)),
    random: randomProvider
  };
}

/**
 * Teardown fake timers and reset clock to system time
 */
export function teardownClock(): void {
  vi.useRealTimers();
  resetClock();
}

/**
 * Teardown deterministic environment
 */
export function teardownDeterministicEnvironment(): void {
  teardownClock();
  teardownSeededRandom();
}

/**
 * Get current time from the active clock
 */
export function clockNow(): Date {
  return new Date(getClock().now());
}

/**
 * Get a date N days ago from the current clock time
 */
export function daysAgoUTC(days: number): Date {
  return new Date(getClock().now().getTime() - days * 86_400_000);
}

/**
 * Generate an array of dates for the last N days (chronological order)
 */
export function rangeDays(days: number): Date[] {
  return Array.from({ length: days }, (_, i) => daysAgoUTC(days - 1 - i));
}

/**
 * Format date as YYYY-MM-DD string (UTC)
 */
export function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Build historical test data for a given number of days
 * @param days Number of days of historical data
 * @param makeItem Function to create data item for each day
 */
export function buildHistory<T>(
  days: number,
  makeItem: (params: { date: Date; dateString: string; dayIndex: number }) => T
): T[] {
  return Array.from({ length: days }, (_, i) => {
    const date = daysAgoUTC(i);
    const dateString = formatDateUTC(date);
    return makeItem({ date, dateString, dayIndex: i });
  }).reverse(); // Return in chronological order (oldest first)
}

/**
 * Advance fake timers by specified milliseconds
 */
export function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}

/**
 * Run all currently pending timers
 */
export function runPendingTimers(): void {
  vi.runOnlyPendingTimers();
}

/**
 * Flush any pending microtasks (useful after timer advancement)
 */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

/**
 * Common test assertion to verify fake timers are working
 */
export function assertFixedTime(expectedDate: string = '2025-01-20T12:00:00Z'): void {
  const expected = new Date(expectedDate).getTime();
  expect(Date.now()).toBe(expected);
  expect(getClock().now().getTime()).toBe(expected);
}

/**
 * Generate campaign performance data for testing
 */
export interface CampaignData {
  date: string;
  campaignId: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
}

export function generateCampaignData(
  campaignId: string,
  days: number,
  baseSpend: number = 100
): CampaignData[] {
  return buildHistory(days, ({ dateString, dayIndex }) => ({
    date: dateString,
    campaignId,
    spend: baseSpend + (Math.sin(dayIndex * 0.1) * 20), // Realistic variation
    clicks: Math.floor((baseSpend + dayIndex * 2) / 2), // Realistic CTR
    impressions: (baseSpend + dayIndex * 2) * 20, // Realistic impression volume
    conversions: Math.floor(Math.random() * 5) + 1, // 1-5 conversions per day
    conversionValue: (Math.floor(Math.random() * 5) + 1) * 50, // $50-250 per conversion
  }));
}

/**
 * Generate budget depletion test data
 */
export interface BudgetData {
  campaignId: string;
  budgetAmount: number;
  budgetSpent: number;
  depletionRate: number;
}

export function generateBudgetData(
  campaignId: string,
  depletionRate: number = 0.9
): BudgetData {
  const budgetAmount = 1000;
  const budgetSpent = budgetAmount * depletionRate;

  return {
    campaignId,
    budgetAmount,
    budgetSpent,
    depletionRate,
  };
}