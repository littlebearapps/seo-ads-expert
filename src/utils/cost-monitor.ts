/**
 * Cost Monitoring and Budget Controls
 * Prevents runaway API costs and monitors usage
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

interface UsageRecord {
  timestamp: string;
  service: 'google-ads' | 'google-analytics' | 'rapidapi-serp' | 'rapidapi-keywords';
  operation: string;
  estimatedCost: number;
  callCount: number;
}

interface DailyUsage {
  date: string;
  totalCost: number;
  totalCalls: number;
  services: Record<string, { cost: number; calls: number }>;
}

export class CostMonitor {
  private usageFile: string;
  private dailyCostLimit: number;
  private monthlyCostLimit: number;
  private maxCallsPerDay: number;
  private maxCallsPerHour: number;

  constructor() {
    this.usageFile = path.join(process.cwd(), 'data', 'api-usage.json');
    this.dailyCostLimit = parseFloat(process.env.DAILY_COST_LIMIT_USD || '1.00');
    this.monthlyCostLimit = parseFloat(process.env.MONTHLY_COST_LIMIT_USD || '10.00');
    this.maxCallsPerDay = parseInt(process.env.MAX_GOOGLE_ADS_CALLS_PER_DAY || '500');
    this.maxCallsPerHour = parseInt(process.env.MAX_GOOGLE_ADS_CALLS_PER_HOUR || '50');
  }

  /**
   * Check if an API call is within budget limits
   */
  async checkBudgetLimits(service: UsageRecord['service'], estimatedCost: number = 0.0001): Promise<boolean> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const usage = await this.getTodayUsage();

      // Check daily cost limit
      if (usage.totalCost + estimatedCost > this.dailyCostLimit) {
        logger.error(`Daily cost limit exceeded: $${usage.totalCost + estimatedCost} > $${this.dailyCostLimit}`);
        return false;
      }

      // Check daily call limit
      if (usage.totalCalls >= this.maxCallsPerDay) {
        logger.error(`Daily call limit exceeded: ${usage.totalCalls} >= ${this.maxCallsPerDay}`);
        return false;
      }

      // Check hourly call limit for Google Ads
      if (service === 'google-ads') {
        const hourlyUsage = await this.getHourlyUsage();
        if (hourlyUsage >= this.maxCallsPerHour) {
          logger.error(`Hourly call limit exceeded: ${hourlyUsage} >= ${this.maxCallsPerHour}`);
          return false;
        }
      }

      // Check monthly cost limit
      const monthlyUsage = await this.getMonthlyUsage();
      if (monthlyUsage + estimatedCost > this.monthlyCostLimit) {
        logger.error(`Monthly cost limit exceeded: $${monthlyUsage + estimatedCost} > $${this.monthlyCostLimit}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking budget limits:', error);
      // Fail safe - deny the request if we can't check limits
      return false;
    }
  }

  /**
   * Record an API call for cost tracking
   */
  async recordUsage(record: Omit<UsageRecord, 'timestamp'>): Promise<void> {
    try {
      const usage: UsageRecord = {
        ...record,
        timestamp: new Date().toISOString()
      };

      // Ensure data directory exists
      const dataDir = path.dirname(this.usageFile);
      await fs.mkdir(dataDir, { recursive: true });

      // Read existing usage
      let allUsage: UsageRecord[] = [];
      try {
        const data = await fs.readFile(this.usageFile, 'utf-8');
        allUsage = JSON.parse(data);
      } catch {
        // File doesn't exist yet, start with empty array
      }

      // Add new record
      allUsage.push(usage);

      // Keep only last 30 days of records
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      allUsage = allUsage.filter(u => new Date(u.timestamp) > thirtyDaysAgo);

      // Save updated usage
      await fs.writeFile(this.usageFile, JSON.stringify(allUsage, null, 2));

      logger.info('API usage recorded', {
        service: record.service,
        operation: record.operation,
        cost: record.estimatedCost,
        calls: record.callCount
      });

    } catch (error) {
      logger.error('Error recording usage:', error);
    }
  }

  /**
   * Get today's usage summary
   */
  async getTodayUsage(): Promise<DailyUsage> {
    const today = new Date().toISOString().split('T')[0];
    return this.getDayUsage(today);
  }

  /**
   * Get usage for a specific day
   */
  async getDayUsage(date: string): Promise<DailyUsage> {
    try {
      const data = await fs.readFile(this.usageFile, 'utf-8');
      const allUsage: UsageRecord[] = JSON.parse(data);

      const dayUsage = allUsage.filter(u => u.timestamp.startsWith(date));
      
      const summary: DailyUsage = {
        date,
        totalCost: 0,
        totalCalls: 0,
        services: {}
      };

      for (const usage of dayUsage) {
        summary.totalCost += usage.estimatedCost;
        summary.totalCalls += usage.callCount;

        if (!summary.services[usage.service]) {
          summary.services[usage.service] = { cost: 0, calls: 0 };
        }
        summary.services[usage.service].cost += usage.estimatedCost;
        summary.services[usage.service].calls += usage.callCount;
      }

      return summary;
    } catch {
      return {
        date,
        totalCost: 0,
        totalCalls: 0,
        services: {}
      };
    }
  }

  /**
   * Get current month's total usage
   */
  async getMonthlyUsage(): Promise<number> {
    try {
      const data = await fs.readFile(this.usageFile, 'utf-8');
      const allUsage: UsageRecord[] = JSON.parse(data);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const monthUsage = allUsage.filter(u => new Date(u.timestamp) >= monthStart);
      
      return monthUsage.reduce((total, usage) => total + usage.estimatedCost, 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get current hour's API call count
   */
  async getHourlyUsage(): Promise<number> {
    try {
      const data = await fs.readFile(this.usageFile, 'utf-8');
      const allUsage: UsageRecord[] = JSON.parse(data);

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const hourlyUsage = allUsage.filter(u => new Date(u.timestamp) > oneHourAgo);
      
      return hourlyUsage.reduce((total, usage) => total + usage.callCount, 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get usage summary for monitoring dashboard
   */
  async getUsageSummary(): Promise<{
    today: DailyUsage;
    month: number;
    limits: {
      dailyCost: number;
      monthlyCost: number;
      dailyCalls: number;
      hourlyCalls: number;
    };
    alerts: string[];
  }> {
    const today = await this.getTodayUsage();
    const month = await this.getMonthlyUsage();
    const hourly = await this.getHourlyUsage();

    const alerts: string[] = [];

    // Generate alerts
    if (today.totalCost > this.dailyCostLimit * 0.8) {
      alerts.push(`Daily cost at ${((today.totalCost / this.dailyCostLimit) * 100).toFixed(1)}% of limit`);
    }
    if (month > this.monthlyCostLimit * 0.8) {
      alerts.push(`Monthly cost at ${((month / this.monthlyCostLimit) * 100).toFixed(1)}% of limit`);
    }
    if (today.totalCalls > this.maxCallsPerDay * 0.8) {
      alerts.push(`Daily calls at ${((today.totalCalls / this.maxCallsPerDay) * 100).toFixed(1)}% of limit`);
    }
    if (hourly > this.maxCallsPerHour * 0.8) {
      alerts.push(`Hourly calls at ${((hourly / this.maxCallsPerHour) * 100).toFixed(1)}% of limit`);
    }

    return {
      today,
      month,
      limits: {
        dailyCost: this.dailyCostLimit,
        monthlyCost: this.monthlyCostLimit,
        dailyCalls: this.maxCallsPerDay,
        hourlyCalls: this.maxCallsPerHour
      },
      alerts
    };
  }
}

// Export singleton instance
export const costMonitor = new CostMonitor();