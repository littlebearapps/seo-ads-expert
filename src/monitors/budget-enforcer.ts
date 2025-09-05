import pino from 'pino';
import { z } from 'zod';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export interface BudgetLimits {
  dailyMax: number;
  campaignMax: number;
  accountMax: number;
  enforcementLevel: 'soft' | 'hard';
}

export interface BudgetValidationResult {
  allowed: boolean;
  reason: string;
  severity: 'warning' | 'error' | 'critical';
  currentSpend: number;
  proposedSpend: number;
  limit: number;
  suggestedAmount?: number;
  warnings: string[];
}

export interface BudgetTracking {
  dailySpend: number;
  campaignSpends: Map<string, number>;
  totalSpend: number;
  lastResetDate: string;
}

export class BudgetEnforcer {
  private limits: BudgetLimits;
  private tracking: BudgetTracking;

  constructor(limits: BudgetLimits) {
    this.limits = limits;
    this.tracking = {
      dailySpend: 0,
      campaignSpends: new Map(),
      totalSpend: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    };
    
    // Load existing tracking data if available
    this.loadTrackingData();
  }

  /**
   * Validate a budget change
   */
  async validateBudget(
    amount: number, 
    resource: string,
    campaignId?: string
  ): Promise<BudgetValidationResult> {
    // Reset daily tracking if new day
    this.resetDailyIfNeeded();

    const result: BudgetValidationResult = {
      allowed: true,
      reason: '',
      severity: 'warning',
      currentSpend: this.tracking.dailySpend,
      proposedSpend: this.tracking.dailySpend + amount,
      limit: this.limits.dailyMax,
      warnings: []
    };

    // Check for negative values
    if (amount < 0) {
      result.allowed = false;
      result.reason = `Invalid budget amount: negative values not allowed ($${amount.toFixed(2)})`;
      result.severity = 'error';
      result.suggestedAmount = 0;
      return result;
    }

    // Check daily limit
    if (result.proposedSpend > this.limits.dailyMax) {
      result.allowed = false;
      result.reason = `Daily budget limit exceeded: $${result.proposedSpend.toFixed(2)} > $${this.limits.dailyMax.toFixed(2)}`;
      result.severity = 'error';
      result.suggestedAmount = Math.max(0, this.limits.dailyMax - this.tracking.dailySpend);
    }

    // Check campaign limit
    if (campaignId && resource === 'campaign') {
      const currentCampaignSpend = this.tracking.campaignSpends.get(campaignId) || 0;
      const proposedCampaignSpend = currentCampaignSpend + amount;
      
      if (proposedCampaignSpend > this.limits.campaignMax) {
        result.allowed = false;
        result.reason = `Campaign budget limit exceeded: $${proposedCampaignSpend.toFixed(2)} > $${this.limits.campaignMax.toFixed(2)}`;
        result.severity = 'critical';
        result.suggestedAmount = Math.max(0, this.limits.campaignMax - currentCampaignSpend);
      }
    }

    // Check account total limit
    const proposedTotal = this.tracking.totalSpend + amount;
    if (proposedTotal > this.limits.accountMax) {
      result.allowed = false;
      result.reason = `Account budget limit exceeded: $${proposedTotal.toFixed(2)} > $${this.limits.accountMax.toFixed(2)}`;
      result.severity = 'critical';
      result.suggestedAmount = Math.max(0, this.limits.accountMax - this.tracking.totalSpend);
    }

    // Add warnings for approaching limits
    if (result.proposedSpend > this.limits.dailyMax * 0.8) {
      result.warnings.push(`Approaching daily budget limit (${((result.proposedSpend / this.limits.dailyMax) * 100).toFixed(1)}% used)`);
    }

    if (proposedTotal > this.limits.accountMax * 0.8) {
      result.warnings.push(`Approaching account budget limit (${((proposedTotal / this.limits.accountMax) * 100).toFixed(1)}% used)`);
    }

    // Log budget check
    logger.info('Budget validation performed', {
      amount,
      resource,
      campaignId,
      result: result.allowed ? 'allowed' : 'blocked',
      reason: result.reason
    });

    return result;
  }

  /**
   * Record actual spend
   */
  recordSpend(amount: number, campaignId?: string): void {
    this.resetDailyIfNeeded();
    
    this.tracking.dailySpend += amount;
    this.tracking.totalSpend += amount;
    
    if (campaignId) {
      const current = this.tracking.campaignSpends.get(campaignId) || 0;
      this.tracking.campaignSpends.set(campaignId, current + amount);
    }

    this.saveTrackingData();
    
    logger.info('Spend recorded', {
      amount,
      campaignId,
      dailyTotal: this.tracking.dailySpend,
      accountTotal: this.tracking.totalSpend
    });
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): {
    daily: { spent: number; limit: number; remaining: number; percentUsed: number };
    account: { spent: number; limit: number; remaining: number; percentUsed: number };
    campaigns: Array<{ id: string; spent: number; limit: number; remaining: number }>;
  } {
    this.resetDailyIfNeeded();

    return {
      daily: {
        spent: this.tracking.dailySpend,
        limit: this.limits.dailyMax,
        remaining: Math.max(0, this.limits.dailyMax - this.tracking.dailySpend),
        percentUsed: (this.tracking.dailySpend / this.limits.dailyMax) * 100
      },
      account: {
        spent: this.tracking.totalSpend,
        limit: this.limits.accountMax,
        remaining: Math.max(0, this.limits.accountMax - this.tracking.totalSpend),
        percentUsed: (this.tracking.totalSpend / this.limits.accountMax) * 100
      },
      campaigns: Array.from(this.tracking.campaignSpends.entries()).map(([id, spent]) => ({
        id,
        spent,
        limit: this.limits.campaignMax,
        remaining: Math.max(0, this.limits.campaignMax - spent)
      }))
    };
  }

  /**
   * Reset daily tracking if new day
   */
  private resetDailyIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    
    if (today !== this.tracking.lastResetDate) {
      logger.info('Resetting daily budget tracking', {
        previousDate: this.tracking.lastResetDate,
        previousSpend: this.tracking.dailySpend,
        newDate: today
      });
      
      this.tracking.dailySpend = 0;
      this.tracking.lastResetDate = today;
      this.saveTrackingData();
    }
  }

  /**
   * Load tracking data from storage
   */
  private loadTrackingData(): void {
    // In a real implementation, this would load from a database or file
    // For now, we'll just use in-memory storage
    logger.debug('Loading budget tracking data');
  }

  /**
   * Save tracking data to storage
   */
  private saveTrackingData(): void {
    // In a real implementation, this would save to a database or file
    // For now, we'll just use in-memory storage
    logger.debug('Saving budget tracking data', this.tracking);
  }

  /**
   * Reset all tracking
   */
  resetTracking(): void {
    this.tracking = {
      dailySpend: 0,
      campaignSpends: new Map(),
      totalSpend: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    };
    this.saveTrackingData();
    logger.info('Budget tracking reset');
  }

  /**
   * Update budget limits
   */
  updateLimits(limits: Partial<BudgetLimits>): void {
    this.limits = { ...this.limits, ...limits };
    logger.info('Budget limits updated', this.limits);
  }
}