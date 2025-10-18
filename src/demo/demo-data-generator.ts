/**
 * Demo Data Generator
 *
 * Generates realistic test data for Google Ads API screencast/demo
 * All data is obviously synthetic (no real customer data)
 */

export interface DemoCampaign {
  id: string;
  name: string;
  budget: number;
  clicks: number;
  conversions: number;
  cost: number;
  impressions: number;
}

export interface DemoRecommendation {
  id: string;
  type: 'budget' | 'bid' | 'keyword';
  priority: 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  expectedLift: number; // percentage
  description: string;
  before: Record<string, any>;
  after: Record<string, any>;
  affectedEntities: {
    campaigns: number;
    adGroups: number;
    keywords: number;
  };
}

export class DemoDataGenerator {
  /**
   * Generate demo campaigns with realistic performance data
   */
  generateDemoCampaigns(): DemoCampaign[] {
    return [
      {
        id: '1234567890',
        name: 'Campaign A - Brand Keywords',
        budget: 100,
        clicks: 450,
        conversions: 23,
        cost: 95.50,
        impressions: 5200,
      },
      {
        id: '1234567891',
        name: 'Campaign B - Product Keywords',
        budget: 50,
        clicks: 380,
        conversions: 42,
        cost: 48.25,
        impressions: 4100,
      },
      {
        id: '1234567892',
        name: 'Campaign C - Competitor Keywords',
        budget: 75,
        clicks: 220,
        conversions: 8,
        cost: 72.00,
        impressions: 3500,
      },
    ];
  }

  /**
   * Generate Thompson Sampling recommendations with ML confidence scores
   */
  generateDemoRecommendations(): DemoRecommendation[] {
    return [
      {
        id: 'rec-001',
        type: 'budget',
        priority: 'high',
        confidence: 82,
        expectedLift: 12.5,
        description: 'Reallocate budget from Campaign C (low CVR) to Campaign B (high CVR)',
        before: {
          campaignA: { budget: 100 },
          campaignB: { budget: 50 },
          campaignC: { budget: 75 },
        },
        after: {
          campaignA: { budget: 100 },
          campaignB: { budget: 75 },
          campaignC: { budget: 50 },
        },
        affectedEntities: {
          campaigns: 2,
          adGroups: 0,
          keywords: 0,
        },
      },
      {
        id: 'rec-002',
        type: 'bid',
        priority: 'medium',
        confidence: 75,
        expectedLift: 8.3,
        description: 'Increase bids on high-performing keywords in Campaign B',
        before: {
          keyword1: { bid: 1.25 },
          keyword2: { bid: 1.50 },
          keyword3: { bid: 1.00 },
        },
        after: {
          keyword1: { bid: 1.50 },
          keyword2: { bid: 1.75 },
          keyword3: { bid: 1.25 },
        },
        affectedEntities: {
          campaigns: 1,
          adGroups: 1,
          keywords: 3,
        },
      },
      {
        id: 'rec-003',
        type: 'keyword',
        priority: 'medium',
        confidence: 68,
        expectedLift: 5.2,
        description: 'Add 5 high-volume keywords to Campaign A based on search query data',
        before: {
          keywords: 25,
        },
        after: {
          keywords: 30,
        },
        affectedEntities: {
          campaigns: 1,
          adGroups: 2,
          keywords: 5,
        },
      },
    ];
  }

  /**
   * Generate demo audit log entries
   */
  generateDemoAuditLog() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return [
      {
        id: 'log-001',
        timestamp: oneHourAgo.toISOString(),
        user: 'nathan@littlebearapps.com',
        action: 'budget_change',
        entity: {
          type: 'campaign',
          id: '1234567891',
          name: 'Campaign B - Product Keywords',
        },
        before: { budget: 50.00 },
        after: { budget: 75.00 },
        status: 'applied',
        canRollback: true,
      },
      {
        id: 'log-002',
        timestamp: oneHourAgo.toISOString(),
        user: 'nathan@littlebearapps.com',
        action: 'budget_change',
        entity: {
          type: 'campaign',
          id: '1234567892',
          name: 'Campaign C - Competitor Keywords',
        },
        before: { budget: 75.00 },
        after: { budget: 50.00 },
        status: 'applied',
        canRollback: true,
      },
      {
        id: 'log-003',
        timestamp: twoDaysAgo.toISOString(),
        user: 'nathan@littlebearapps.com',
        action: 'bid_change',
        entity: {
          type: 'keyword',
          id: 'kwd-123',
          name: 'chrome extension tools',
        },
        before: { bid: 1.25 },
        after: { bid: 1.50 },
        status: 'applied',
        canRollback: true,
      },
    ];
  }

  /**
   * Generate demo security/privacy stats
   */
  generateDemoSecurityStats() {
    return {
      apiUsage: {
        today: 347,
        dailyLimit: 15000,
        percentage: 2.3,
      },
      dataRetention: {
        performanceCache: '7 days',
        auditLogs: '90 days',
        autoDeleteAfter: true,
      },
      encryption: {
        tokensAtRest: 'AES-256',
        dataInTransit: 'TLS 1.3',
      },
      compliance: {
        gdpr: true,
        ccpa: true,
        dataExportAvailable: true,
        deletionWindow: '30 days',
      },
      incidents: {
        total: 0,
        lastChecked: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate demo automation settings
   */
  generateDemoAutomationSettings() {
    return {
      autoApply: {
        budgetOptimizations: {
          enabled: false,
          dailyCap: 50,
          scope: 'selected_campaigns',
          emailSummary: 'nathan@littlebearapps.com',
        },
        bidAdjustments: {
          enabled: false,
          dailyCap: 100,
          scope: 'all_campaigns',
          emailSummary: 'nathan@littlebearapps.com',
        },
        keywordAdditions: {
          enabled: false,
          dailyCap: 25,
          scope: 'selected_campaigns',
          emailSummary: 'nathan@littlebearapps.com',
        },
      },
      killSwitch: {
        available: true,
        status: 'active', // 'active' or 'disabled_all'
      },
    };
  }
}
