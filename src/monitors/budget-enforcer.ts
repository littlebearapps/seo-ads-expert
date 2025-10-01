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

  constructor(limits?: BudgetLimits) {
    this.limits = limits || {
      dailyMax: 1000,
      campaignMax: 10000,
      accountMax: 50000,
      enforcementLevel: 'soft'
    };
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
   * Record actual spend (supports both old and new signatures)
   * Old: recordSpend(amount, campaignId?)
   * New: recordSpend(customerId, campaignId, amount)
   */
  recordSpend(amountOrCustomerId: number | string, campaignIdOrCampaignId?: string, amountIfMultiTenant?: number): void {
    // New signature: recordSpend(customerId, campaignId, amount)
    if (typeof amountOrCustomerId === 'string' && typeof amountIfMultiTenant === 'number') {
      const customerId = amountOrCustomerId;
      const campaignId = campaignIdOrCampaignId!;
      const amount = amountIfMultiTenant;

      const customer = this.getCustomerData(customerId);
      const campaign = this.getCampaignData(customerId, campaignId);

      campaign.dailySpend += amount;
      campaign.totalSpend += amount;
      customer.dailySpend += amount;
      customer.accountSpend += amount;

      logger.info('Multi-tenant spend recorded', {
        customerId,
        campaignId,
        amount,
        campaignDailySpend: campaign.dailySpend,
        accountSpend: customer.accountSpend
      });
      return;
    }

    // Old signature: recordSpend(amount, campaignId?)
    const amount = amountOrCustomerId as number;
    const campaignId = campaignIdOrCampaignId;

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

  // ========================================
  // Multi-Tenant Budget Management
  // ========================================

  private customerBudgets = new Map<string, {
    dailySpend: number;
    campaigns: Map<string, {
      dailySpend: number;
      totalSpend: number;
      dailyLimit: number;
      campaignLimit: number;
      emergencyStop?: { reason: string; timestamp: string };
    }>;
    accountSpend: number;
    accountLimit: number;
    lastResetDate: string;
  }>();

  private getCustomerData(customerId: string) {
    if (!this.customerBudgets.has(customerId)) {
      this.customerBudgets.set(customerId, {
        dailySpend: 0,
        campaigns: new Map(),
        accountSpend: 0,
        accountLimit: this.limits.accountMax,
        lastResetDate: new Date().toISOString().split('T')[0]
      });
    }
    return this.customerBudgets.get(customerId)!;
  }

  private getCampaignData(customerId: string, campaignId: string) {
    const customer = this.getCustomerData(customerId);
    if (!customer.campaigns.has(campaignId)) {
      customer.campaigns.set(campaignId, {
        dailySpend: 0,
        totalSpend: 0,
        dailyLimit: this.limits.dailyMax,
        campaignLimit: this.limits.campaignMax,
      });
    }
    return customer.campaigns.get(campaignId)!;
  }

  async setDailyBudget(customerId: string, campaignId: string, amount: number): Promise<void> {
    const campaign = this.getCampaignData(customerId, campaignId);
    campaign.dailyLimit = amount;
    logger.info('Daily budget set', { customerId, campaignId, amount });
  }

  async getDailySpend(customerId: string, campaignId: string): Promise<number> {
    const campaign = this.getCampaignData(customerId, campaignId);
    return campaign.dailySpend;
  }

  async canSpend(customerId: string, campaignId: string, amount: number): Promise<boolean> {
    const customer = this.getCustomerData(customerId);
    const campaign = this.getCampaignData(customerId, campaignId);

    // Check emergency stop
    if (campaign.emergencyStop) {
      return false;
    }

    // Check daily limit
    if (campaign.dailySpend + amount > campaign.dailyLimit) {
      return false;
    }

    // Check campaign limit
    if (campaign.totalSpend + amount > campaign.campaignLimit) {
      return false;
    }

    // Check account limit
    if (customer.accountSpend + amount > customer.accountLimit) {
      return false;
    }

    return true;
  }

  async resetDailyBudgets(): Promise<void> {
    for (const customer of Array.from(this.customerBudgets.values())) {
      customer.dailySpend = 0;
      for (const campaign of Array.from(customer.campaigns.values())) {
        campaign.dailySpend = 0;
      }
      customer.lastResetDate = new Date().toISOString().split('T')[0];
    }
    logger.info('All daily budgets reset');
  }

  async setCampaignBudget(customerId: string, campaignId: string, amount: number): Promise<void> {
    const campaign = this.getCampaignData(customerId, campaignId);
    campaign.campaignLimit = amount;
    logger.info('Campaign budget set', { customerId, campaignId, amount });
  }

  async validateBudgetChange(customerId: string, campaignId: string, amount: number): Promise<{allowed: boolean, reason: string}> {
    const customer = this.getCustomerData(customerId);
    const campaign = this.getCampaignData(customerId, campaignId);

    // Check if new budget is lower than current spend
    if (amount < campaign.totalSpend) {
      return {
        allowed: false,
        reason: `New budget (${amount}) is lower than current spend (${campaign.totalSpend})`
      };
    }

    // Check if it exceeds account budget
    if (amount > customer.accountLimit) {
      return {
        allowed: false,
        reason: `Campaign budget (${amount}) exceeds account limit (${customer.accountLimit})`
      };
    }

    return {
      allowed: true,
      reason: 'Budget change allowed'
    };
  }

  async setAccountBudget(customerId: string, amount: number): Promise<void> {
    const customer = this.getCustomerData(customerId);
    customer.accountLimit = amount;
    logger.info('Account budget set', { customerId, amount });
  }

  async canSpendAccount(customerId: string, amount: number): Promise<boolean> {
    const customer = this.getCustomerData(customerId);
    return customer.accountSpend + amount <= customer.accountLimit;
  }

  async getAccountSpend(customerId: string): Promise<number> {
    const customer = this.getCustomerData(customerId);
    return customer.accountSpend;
  }

  async getBudgetAlerts(customerId: string): Promise<Array<{type: string, percentage: number, campaignId?: string}>> {
    const customer = this.getCustomerData(customerId);
    const alerts: Array<{type: string, percentage: number, campaignId?: string}> = [];

    // Check account-level alerts
    const accountPercent = (customer.accountSpend / customer.accountLimit) * 100;
    if (accountPercent >= 100) {
      alerts.push({ type: 'BUDGET_EXCEEDED', percentage: accountPercent });
    } else if (accountPercent >= 80) {
      alerts.push({ type: 'BUDGET_WARNING', percentage: accountPercent });
    }

    // Check campaign-level alerts
    for (const [campaignId, campaign] of Array.from(customer.campaigns)) {
      const dailyPercent = (campaign.dailySpend / campaign.dailyLimit) * 100;
      if (dailyPercent >= 100) {
        alerts.push({ type: 'BUDGET_EXCEEDED', percentage: dailyPercent, campaignId });
      } else if (dailyPercent >= 80) {
        alerts.push({ type: 'BUDGET_WARNING', percentage: dailyPercent, campaignId });
      }
    }

    return alerts;
  }

  async setEmergencyStop(customerId: string, campaignId: string, reason: string): Promise<void> {
    const campaign = this.getCampaignData(customerId, campaignId);
    campaign.emergencyStop = {
      reason,
      timestamp: new Date().toISOString()
    };
    logger.warn('Emergency stop activated', { customerId, campaignId, reason });
  }

  async removeEmergencyStop(customerId: string, campaignId: string): Promise<void> {
    const campaign = this.getCampaignData(customerId, campaignId);
    delete campaign.emergencyStop;
    logger.info('Emergency stop removed', { customerId, campaignId });
  }
}