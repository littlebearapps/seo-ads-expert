# Plausible Analytics Integration Guide

**Status**: Post-v2.0 Enhancement (Implement AFTER Google Ads API approval)
**Priority**: Medium (Privacy-focused alternative to GA4)
**Effort**: 1-2 sprints
**GPT-5 Validation**: 2025-10-10

---

## Executive Summary

This document outlines the strategy for integrating **Plausible Analytics** as a privacy-focused replacement for Google Analytics 4 in SEO Ads Expert's Thompson Sampling engine.

**Key Decision**: Keep GA4 for Google Ads API application approval, then switch to Plausible for production usage.

### Why Plausible?

1. **Privacy-First**: No cookies, GDPR-compliant, no PII collection
2. **95%+ Feature Parity**: All core metrics needed for Thompson Sampling
3. **Simpler Attribution**: Last-click attribution (vs GA4's complex multi-touch)
4. **Lightweight**: 600 requests/hour sufficient for SEO Ads Expert's needs
5. **First-Party Data**: Custom domain reduces ad-blocker impact

### Trade-offs Accepted

❌ **Missing in Plausible (vs GA4)**:
- Multi-touch attribution models (data-driven, position-based, etc.)
- User demographics (age, gender, interests)
- Advanced user journey analysis and path exploration
- Complex audience segmentation

✅ **Impact on SEO Ads Expert**: Minimal - Thompson Sampling only needs conversion rates and revenue, which Plausible provides fully.

---

## Architecture Overview

### Data Flow

```
┌─────────────────┐
│   Website       │
│ (littlebearapps)│
│                 │
│  Plausible JS   │◄─── Client-side events
│  + Events API   │◄─── Server-side events (ad-blocker resistant)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Plausible Stats │
│      API        │◄─── SEO Ads Expert queries
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│   Data Joiner   │◄────►│ Google Ads   │
│  (New Module)   │      │     API      │
└────────┬────────┘      └──────────────┘
         │
         ▼
┌─────────────────┐
│   Thompson      │
│   Sampling      │
│    Engine       │
└─────────────────┘
```

### Components to Build

1. **Plausible Connector** (`src/connectors/plausible.ts`)
   - Stats API client
   - Goal conversion queries
   - Revenue tracking queries
   - UTM dimension breakdowns

2. **Data Joiner** (`src/analysis/plausible-ads-joiner.ts`)
   - Join Plausible conversions to Google Ads metrics by UTM parameters
   - Currency normalization
   - Delayed conversion handling

3. **Dual-Tracking Validation** (`src/monitors/analytics-validator.ts`)
   - Compare GA4 vs Plausible conversion counts (±10-15% tolerance)
   - Alert on significant discrepancies
   - 2-4 week validation period before full switch

---

## Phase 1: Google Ads UTM Configuration

### 1.1 Final URL Suffix Setup

Configure Google Ads to automatically append UTM parameters with campaign/adgroup/ad IDs:

**Final URL Suffix Template**:
```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={adgroupid}&utm_content={creative}
```

**Why This Matters**:
- Enables joining Plausible conversions to Google Ads metrics by exact IDs
- No ambiguity from name-based matching
- Works with Google Ads API mutations

**Implementation**:
```typescript
// src/mutations/utm-configuration.ts
export async function configureUTMTracking(
  campaignId: string,
  client: GoogleAdsClient
): Promise<void> {
  const urlSuffix =
    'utm_source=google&utm_medium=cpc' +
    '&utm_campaign={campaignid}' +
    '&utm_term={adgroupid}' +
    '&utm_content={creative}';

  const mutation = {
    campaignOperation: {
      update: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        urlCustomParameters: [],
        finalUrlSuffix: urlSuffix
      },
      updateMask: { paths: ['final_url_suffix'] }
    }
  };

  await client.campaignService.mutateCampaigns({
    customerId,
    operations: [mutation]
  });
}
```

### 1.2 Auto-Tagging (Keep Enabled)

- Keep `gclid` auto-tagging enabled in Google Ads
- Used for potential offline conversion uploads
- Plausible won't decode gclid - UTMs are the primary join key

---

## Phase 2: Plausible Event Schema

### 2.1 Client-Side Tracking

**Install Plausible Script**:
```html
<!-- littlebearapps.com -->
<script defer
  data-domain="littlebearapps.com"
  src="https://plausible.io/js/script.js">
</script>
```

**Custom Goals** (configure in Plausible dashboard):
- `Purchase` - E-commerce conversion
- `Signup` - Lead generation
- `Lead` - Contact form submission

**Custom Properties**:
```javascript
// Example: Track purchase with revenue
plausible('Purchase', {
  props: {
    revenue: 49.99,
    currency: 'USD',
    order_id: 'order-12345',
    product: 'chrome-extension-pro'
  }
});
```

### 2.2 Server-Side Tracking (Ad-Blocker Resistant)

**Events API Implementation**:
```typescript
// src/connectors/plausible-events.ts
import axios from 'axios';

interface PlausibleEvent {
  name: string;
  url: string;
  domain: string;
  revenue?: {
    amount: number;
    currency: string;
  };
  props?: Record<string, string | number>;
}

export async function trackServerSideEvent(
  event: PlausibleEvent
): Promise<void> {
  await axios.post('https://plausible.io/api/event', {
    name: event.name,
    url: event.url,
    domain: event.domain,
    revenue: event.revenue,
    props: {
      ...event.props,
      order_id: event.props?.order_id // For de-duplication
    }
  }, {
    headers: {
      'User-Agent': 'SEO-Ads-Expert/2.0',
      'Content-Type': 'application/json',
      'X-Forwarded-For': 'user-ip-address' // Pass through user IP
    }
  });
}
```

**De-Duplication Strategy**:
- Use `order_id` to ensure same conversion not counted twice (client + server)
- Plausible automatically de-duplicates by domain + url + event name + props within 24 hours
- Server-side acts as fallback for ad-blocked client events

---

## Phase 3: Plausible Stats API Connector

### 3.1 Authentication

**API Key Setup**:
```bash
# Add to .env
PLAUSIBLE_API_KEY=your-stats-api-key-here
PLAUSIBLE_SITE_ID=littlebearapps.com
```

**Create API Key**:
1. Log in to Plausible Analytics
2. Top-right menu → Settings
3. "API Keys" section → "New API Key"
4. Choose "Stats API" → Save (shown once!)

### 3.2 Connector Implementation

```typescript
// src/connectors/plausible.ts
import axios from 'axios';
import { logger } from '../utils/logger.js';

export interface PlausibleMetrics {
  visitors: number;
  visits: number;
  pageviews: number;
  events: number; // Total conversions
  conversion_rate: number;
  total_revenue: {
    value: number;
    currency: string;
  } | null;
}

export interface PlausibleDimensions {
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  utm_source?: string;
  utm_medium?: string;
}

export interface PlausibleBreakdown {
  dimensions: PlausibleDimensions;
  metrics: PlausibleMetrics;
}

export class PlausibleConnector {
  private apiKey: string;
  private siteId: string;
  private baseUrl = 'https://plausible.io/api/v2/query';

  constructor() {
    this.apiKey = process.env.PLAUSIBLE_API_KEY || '';
    this.siteId = process.env.PLAUSIBLE_SITE_ID || '';

    if (!this.apiKey || !this.siteId) {
      throw new Error('PLAUSIBLE_API_KEY and PLAUSIBLE_SITE_ID required');
    }
  }

  /**
   * Query Plausible Stats API
   */
  async query(params: {
    metrics: string[];
    date_range: string | [string, string];
    dimensions?: string[];
    filters?: any[];
    order_by?: [string, 'asc' | 'desc'][];
  }): Promise<PlausibleBreakdown[]> {
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          site_id: this.siteId,
          ...params
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.results.map((result: any) => ({
        dimensions: this.parseDimensions(result.dimensions, params.dimensions),
        metrics: this.parseMetrics(result.metrics, params.metrics)
      }));
    } catch (error) {
      logger.error('Plausible API query failed', error);
      throw error;
    }
  }

  /**
   * Get conversions by UTM campaign/adgroup/ad
   */
  async getConversionsByUTM(
    dateRange: string | [string, string],
    goalName: string
  ): Promise<PlausibleBreakdown[]> {
    return this.query({
      metrics: ['events', 'conversion_rate', 'total_revenue'],
      date_range: dateRange,
      dimensions: ['visit:utm_campaign', 'visit:utm_term', 'visit:utm_content'],
      filters: [
        ['is', 'event:goal', [goalName]]
      ],
      order_by: [['events', 'desc']]
    });
  }

  /**
   * Get daily timeseries for a specific campaign
   */
  async getCampaignTimeseries(
    campaignId: string,
    dateRange: string | [string, string]
  ): Promise<PlausibleBreakdown[]> {
    return this.query({
      metrics: ['visitors', 'events', 'total_revenue'],
      date_range: dateRange,
      dimensions: ['time:day'],
      filters: [
        ['is', 'visit:utm_campaign', [campaignId]]
      ],
      order_by: [['time:day', 'asc']]
    });
  }

  private parseDimensions(
    values: any[],
    dimensions?: string[]
  ): PlausibleDimensions {
    if (!dimensions || !values) return {};

    const result: PlausibleDimensions = {};
    dimensions.forEach((dim, index) => {
      const key = dim.replace('visit:', '') as keyof PlausibleDimensions;
      result[key] = values[index];
    });

    return result;
  }

  private parseMetrics(
    values: any[],
    metrics: string[]
  ): PlausibleMetrics {
    const result: any = {};
    metrics.forEach((metric, index) => {
      result[metric] = values[index];
    });

    return result as PlausibleMetrics;
  }
}

// Export singleton
export const plausibleConnector = new PlausibleConnector();
```

---

## Phase 4: Data Joiner (Plausible ↔ Google Ads)

### 4.1 Join Strategy

**Join Keys**:
- `utm_campaign` → Google Ads `campaign.id`
- `utm_term` → Google Ads `ad_group.id`
- `utm_content` → Google Ads `ad_group_ad.ad.id`

**Join Logic**:
```typescript
// src/analysis/plausible-ads-joiner.ts
import { plausibleConnector } from '../connectors/plausible.js';
import { googleAdsClient } from '../connectors/google-ads-api.js';

export interface JoinedMetrics {
  campaign_id: string;
  ad_group_id: string;
  ad_id: string;

  // Google Ads metrics
  impressions: number;
  clicks: number;
  cost_micros: number;

  // Plausible metrics
  conversions: number;
  conversion_rate: number;
  revenue: number;
  currency: string;

  // Calculated
  cpa: number;
  roas: number;
}

export async function joinPlausibleWithAds(
  dateRange: [string, string],
  goalName: string
): Promise<JoinedMetrics[]> {
  // 1. Get Plausible conversions by UTM
  const plausibleData = await plausibleConnector.getConversionsByUTM(
    dateRange,
    goalName
  );

  // 2. Get Google Ads metrics
  const adsData = await googleAdsClient.query(`
    SELECT
      campaign.id,
      ad_group.id,
      ad_group_ad.ad.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
  `);

  // 3. Join on UTM parameters
  const joined: JoinedMetrics[] = [];

  for (const plausible of plausibleData) {
    const campaignId = plausible.dimensions.utm_campaign;
    const adGroupId = plausible.dimensions.utm_term;
    const adId = plausible.dimensions.utm_content;

    // Find matching Google Ads row
    const adsRow = adsData.find(
      row =>
        row.campaign.id === campaignId &&
        row.ad_group.id === adGroupId &&
        row.ad_group_ad.ad.id === adId
    );

    if (adsRow) {
      const costUsd = adsRow.metrics.cost_micros / 1_000_000;
      const revenue = plausible.metrics.total_revenue?.value || 0;

      joined.push({
        campaign_id: campaignId!,
        ad_group_id: adGroupId!,
        ad_id: adId!,
        impressions: adsRow.metrics.impressions,
        clicks: adsRow.metrics.clicks,
        cost_micros: adsRow.metrics.cost_micros,
        conversions: plausible.metrics.events,
        conversion_rate: plausible.metrics.conversion_rate,
        revenue,
        currency: plausible.metrics.total_revenue?.currency || 'USD',
        cpa: costUsd / plausible.metrics.events,
        roas: revenue / costUsd
      });
    }
  }

  return joined;
}
```

### 4.2 Currency Normalization

```typescript
// src/utils/currency.ts
const EXCHANGE_RATES: Record<string, number> = {
  'USD': 1.0,
  'EUR': 1.08,
  'GBP': 1.26,
  'AUD': 0.65
  // Add more as needed
};

export function normalizeToUSD(
  amount: number,
  currency: string
): number {
  const rate = EXCHANGE_RATES[currency] || 1.0;
  return amount * rate;
}
```

---

## Phase 5: Thompson Sampling Integration

### 5.1 Reward Definition

**Conversion Rate Thompson Sampling**:
```typescript
// src/thompson-sampling/plausible-rewards.ts
import { joinPlausibleWithAds } from '../analysis/plausible-ads-joiner.js';

export async function updateThompsonPosteriors(
  dateRange: [string, string]
): Promise<void> {
  const joined = await joinPlausibleWithAds(dateRange, 'Purchase');

  for (const row of joined) {
    // Update Beta distribution for conversion rate
    updateArmPosterior(row.campaign_id, {
      successes: row.conversions,
      trials: row.clicks,
      alpha: row.conversions + 1, // Beta(1,1) prior
      beta: row.clicks - row.conversions + 1
    });
  }
}
```

**Revenue Thompson Sampling** (Gamma distribution):
```typescript
export async function updateRevenuePosteriors(
  dateRange: [string, string]
): Promise<void> {
  const joined = await joinPlausibleWithAds(dateRange, 'Purchase');

  for (const row of joined) {
    const avgRevenue = row.revenue / row.conversions;

    // Update Gamma distribution for revenue per conversion
    updateArmPosterior(row.campaign_id, {
      shape: row.conversions, // α parameter
      scale: avgRevenue, // β parameter
      expectedValue: row.conversions * avgRevenue
    });
  }
}
```

### 5.2 Delayed Conversion Handling

```typescript
// src/thompson-sampling/delayed-conversions.ts
export class DelayedConversionTracker {
  private pendingWindows = new Map<string, Set<string>>();

  /**
   * Track pending conversion attribution window
   */
  trackPendingConversion(
    armId: string,
    orderId: string,
    clickTimestamp: Date,
    attributionWindowDays: number = 30
  ): void {
    const windowKey = `${armId}:${orderId}`;
    const expiry = new Date(clickTimestamp);
    expiry.setDate(expiry.getDate() + attributionWindowDays);

    this.pendingWindows.set(windowKey, new Set([orderId]));

    // Auto-expire after attribution window
    setTimeout(() => {
      this.pendingWindows.delete(windowKey);
    }, attributionWindowDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Update posterior when delayed conversion arrives
   */
  async handleDelayedConversion(
    orderId: string,
    plausibleData: PlausibleBreakdown
  ): Promise<void> {
    const campaignId = plausibleData.dimensions.utm_campaign;

    // Find which arm this conversion belongs to
    const windowKey = `${campaignId}:${orderId}`;

    if (this.pendingWindows.has(windowKey)) {
      // Update the arm's posterior with +1 success
      incrementArmSuccess(campaignId!);
      this.pendingWindows.delete(windowKey);
    }
  }
}
```

---

## Phase 6: Dual-Tracking Validation

### 6.1 GA4 vs Plausible Comparison

```typescript
// src/monitors/analytics-validator.ts
import { plausibleConnector } from '../connectors/plausible.js';
import { unifiedAuth } from '../utils/unified-auth.js';

export interface ValidationReport {
  date: string;
  ga4_conversions: number;
  plausible_conversions: number;
  discrepancy_percent: number;
  ga4_revenue: number;
  plausible_revenue: number;
  revenue_discrepancy_percent: number;
  within_tolerance: boolean;
}

export async function validateAnalytics(
  dateRange: [string, string],
  tolerancePercent: number = 15
): Promise<ValidationReport[]> {
  // Get GA4 conversions
  const ga4Client = await unifiedAuth.getAnalyticsClient();
  const ga4Data = await ga4Client.properties.runReport({
    property: `properties/${process.env.GOOGLE_ANALYTICS_PROPERTY_ID}`,
    dateRanges: [{ startDate: dateRange[0], endDate: dateRange[1] }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'conversions' },
      { name: 'totalRevenue' }
    ]
  });

  // Get Plausible conversions
  const plausibleData = await plausibleConnector.query({
    metrics: ['events', 'total_revenue'],
    date_range: dateRange,
    dimensions: ['time:day'],
    filters: [['is', 'event:goal', ['Purchase']]]
  });

  // Compare daily
  const reports: ValidationReport[] = [];

  for (let i = 0; i < plausibleData.length; i++) {
    const ga4Row = ga4Data.data.rows?.[i];
    const plausibleRow = plausibleData[i];

    const ga4Conversions = Number(ga4Row?.metricValues?.[0]?.value || 0);
    const plausibleConversions = plausibleRow.metrics.events;

    const ga4Revenue = Number(ga4Row?.metricValues?.[1]?.value || 0);
    const plausibleRevenue = plausibleRow.metrics.total_revenue?.value || 0;

    const conversionDiscrepancy =
      Math.abs(ga4Conversions - plausibleConversions) / ga4Conversions * 100;

    const revenueDiscrepancy =
      Math.abs(ga4Revenue - plausibleRevenue) / ga4Revenue * 100;

    reports.push({
      date: plausibleRow.dimensions.time || dateRange[0],
      ga4_conversions: ga4Conversions,
      plausible_conversions: plausibleConversions,
      discrepancy_percent: conversionDiscrepancy,
      ga4_revenue: ga4Revenue,
      plausible_revenue: plausibleRevenue,
      revenue_discrepancy_percent: revenueDiscrepancy,
      within_tolerance:
        conversionDiscrepancy <= tolerancePercent &&
        revenueDiscrepancy <= tolerancePercent
    });
  }

  return reports;
}
```

### 6.2 Validation Alert System

```typescript
// src/monitors/analytics-validator.ts (continued)
export async function runDailyValidation(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  const reports = await validateAnalytics([dateStr, dateStr], 15);

  for (const report of reports) {
    if (!report.within_tolerance) {
      logger.warn('Analytics discrepancy detected', {
        date: report.date,
        ga4_conversions: report.ga4_conversions,
        plausible_conversions: report.plausible_conversions,
        discrepancy: `${report.discrepancy_percent.toFixed(1)}%`
      });

      // Alert via Slack, email, etc.
      await sendAlert({
        severity: 'warning',
        message: `GA4 vs Plausible discrepancy: ${report.discrepancy_percent.toFixed(1)}%`,
        details: report
      });
    }
  }
}
```

---

## Phase 7: Migration Checklist

### 7.1 Pre-Migration (Before Google Ads API Approval)

- [ ] Keep GA4 integrated and OAuth working
- [ ] Don't mention Plausible in application
- [ ] Focus screencast on GA4 integration

### 7.2 Post-Approval Setup (After Google Ads API Approval)

- [ ] Install Plausible script on littlebearapps.com
- [ ] Configure custom goals: Purchase, Signup, Lead
- [ ] Set up server-side Events API fallback
- [ ] Create Plausible Stats API key
- [ ] Add `PLAUSIBLE_API_KEY` and `PLAUSIBLE_SITE_ID` to `.env`

### 7.3 Dual-Tracking Period (2-4 weeks)

- [ ] Run both GA4 and Plausible simultaneously
- [ ] Implement `analytics-validator.ts` monitoring
- [ ] Set tolerance threshold: ±15% discrepancy acceptable
- [ ] Investigate and resolve major discrepancies (>20%)
- [ ] Document any systematic biases (ad blockers, cross-domain, etc.)

### 7.4 Final Switch

- [ ] Confirm ±10-15% validation tolerance met for 2+ weeks
- [ ] Update Thompson Sampling to use Plausible data
- [ ] Disable GA4 data collection (keep OAuth for compliance)
- [ ] Remove GA4-specific code from hot paths
- [ ] Update documentation to reflect Plausible as primary source

---

## Implementation Timeline

### Sprint 1 (Week 1-2): Foundation
- Configure Google Ads Final URL Suffix with UTM parameters
- Install Plausible on littlebearapps.com
- Set up server-side Events API
- Create Plausible Stats API connector
- Implement basic query functionality

### Sprint 2 (Week 3-4): Integration
- Build data joiner (Plausible ↔ Google Ads)
- Integrate with Thompson Sampling engine
- Implement delayed conversion tracking
- Add currency normalization

### Sprint 3 (Week 5-6): Validation
- Deploy dual-tracking (GA4 + Plausible)
- Implement analytics validator with alerts
- Monitor discrepancies and investigate causes
- Tune tolerance thresholds

### Sprint 4 (Week 7-8): Production Cutover
- Confirm validation passes 2-week test
- Switch Thompson Sampling to Plausible data
- Deprecate GA4 queries (keep OAuth)
- Update documentation

---

## Testing Strategy

### Unit Tests

```typescript
// tests/connectors/plausible.test.ts
import { describe, it, expect } from 'vitest';
import { plausibleConnector } from '../../src/connectors/plausible.js';

describe('PlausibleConnector', () => {
  it('should query conversions by UTM', async () => {
    const results = await plausibleConnector.getConversionsByUTM(
      '7d',
      'Purchase'
    );

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dimensions.utm_campaign).toBeDefined();
  });

  it('should handle revenue metrics', async () => {
    const results = await plausibleConnector.query({
      metrics: ['events', 'total_revenue'],
      date_range: '7d',
      filters: [['is', 'event:goal', ['Purchase']]]
    });

    expect(results[0].metrics.total_revenue).toHaveProperty('value');
    expect(results[0].metrics.total_revenue).toHaveProperty('currency');
  });
});
```

### Integration Tests

```typescript
// tests/integration/plausible-ads-joiner.test.ts
import { describe, it, expect } from 'vitest';
import { joinPlausibleWithAds } from '../../src/analysis/plausible-ads-joiner.js';

describe('Plausible + Google Ads Joiner', () => {
  it('should join conversions to ads metrics', async () => {
    const joined = await joinPlausibleWithAds(
      ['2025-10-01', '2025-10-07'],
      'Purchase'
    );

    expect(joined.length).toBeGreaterThan(0);
    expect(joined[0]).toHaveProperty('campaign_id');
    expect(joined[0]).toHaveProperty('conversions');
    expect(joined[0]).toHaveProperty('cost_micros');
    expect(joined[0]).toHaveProperty('roas');
  });
});
```

---

## Risks and Mitigations

### Risk 1: Attribution Mismatch vs Google Ads Conversion Tracking

**Issue**: Plausible uses last-click attribution, Google Ads uses various models.
**Impact**: Discrepancies between Plausible conversions and Google Ads reported conversions.
**Mitigation**:
- Document Plausible as "source of truth" for Thompson Sampling
- Use Google Ads conversions only for dashboard comparison
- Accept ±15-20% variance as normal

### Risk 2: Ad Blockers Reducing Conversion Tracking

**Issue**: Plausible JS blocked by ad blockers, leading to undercounted conversions.
**Impact**: Lower conversion rates, biased Thompson Sampling decisions.
**Mitigation**:
- Use custom Plausible domain (analytics.littlebearapps.com)
- Implement server-side Events API as fallback
- De-duplicate via `order_id` to avoid double-counting

### Risk 3: Currency and Timezone Drift

**Issue**: Different timezone settings between Plausible and Google Ads.
**Impact**: Daily aggregates misaligned, incorrect join results.
**Mitigation**:
- Set Plausible site timezone to UTC
- Set Google Ads reporting timezone to UTC
- Normalize all currencies to USD in data joiner

### Risk 4: Rate Limiting on Plausible Stats API

**Issue**: 600 requests/hour limit, throttling during peak usage.
**Impact**: Failed queries, incomplete Thompson Sampling updates.
**Mitigation**:
- Batch queries using dimension breakdowns
- Cache results for 1 hour
- Implement exponential backoff retry logic
- Monitor API usage via Plausible dashboard

---

## Success Criteria

### Phase 1-2 (Setup & Integration)
- ✅ Plausible JS installed on littlebearapps.com
- ✅ Server-side Events API working
- ✅ UTM parameters correctly captured in Plausible
- ✅ Stats API connector returning valid data

### Phase 3-4 (Validation)
- ✅ GA4 vs Plausible discrepancy within ±15% for 2+ weeks
- ✅ No systematic biases identified (or documented if found)
- ✅ 95%+ conversion events tracked successfully

### Phase 5 (Production)
- ✅ Thompson Sampling using Plausible data exclusively
- ✅ Budget optimization accuracy maintained or improved
- ✅ No degradation in recommendation quality
- ✅ Privacy benefits realized (no cookies, GDPR compliance)

---

## References

- [Plausible Stats API Documentation](https://plausible.io/docs/stats-api)
- [Plausible Events API Documentation](https://plausible.io/docs/events-api)
- [Plausible Goal Conversions Guide](https://plausible.io/docs/goal-conversions)
- [Google Ads API - UTM Parameters](https://developers.google.com/google-ads/api/docs/tracking-urls)
- GPT-5 Analysis (2025-10-10): Continuation ID `babe406d-44ab-4f0a-8ba4-442b7845b230`

---

**Last Updated**: 2025-10-10
**Status**: Ready for Implementation (Post-Google Ads API Approval)
**Owner**: SEO Ads Expert Team
**Priority**: Medium (Privacy Enhancement)
