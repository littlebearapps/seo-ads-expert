/**
 * Seasonality Detector
 *
 * Detects and predicts seasonal patterns in campaign performance.
 * Uses statistical analysis to identify daily, weekly, monthly, and yearly patterns.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';

export interface SeasonalPattern {
  type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'event';
  strength: number; // 0-1, how strong the pattern is
  confidence: number; // 0-1, statistical confidence
  peakPeriods: PeakPeriod[];
  troughPeriods: TroughPeriod[];
  multipliers: Map<string, number>; // Period -> performance multiplier
  nextPeak?: Date;
  nextTrough?: Date;
}

export interface PeakPeriod {
  start: string;
  end: string;
  multiplier: number;
  historicalPerformance: {
    conversions: number;
    conversionRate: number;
    avgCPC: number;
    ROAS: number;
  };
}

export interface TroughPeriod {
  start: string;
  end: string;
  multiplier: number;
  recommendation: 'reduce_budget' | 'maintain' | 'test_optimization';
}

export interface SeasonalForecast {
  date: Date;
  expectedPerformance: {
    conversions: number;
    clicks: number;
    impressions: number;
    cost: number;
    conversionRate: number;
  };
  confidence: number;
  seasonalMultiplier: number;
  recommendations: string[];
}

export interface EventImpact {
  eventName: string;
  eventType: 'holiday' | 'sale' | 'industry' | 'custom';
  historicalImpact: number; // Multiplier
  daysBeforeImpact: number; // When to start adjusting
  daysAfterImpact: number; // When impact ends
  confidence: number;
}

export class SeasonalityDetector {
  private readonly MIN_DATA_POINTS = 4; // Minimum data points per period
  private readonly SIGNIFICANCE_THRESHOLD = 0.2; // 20% variation to be significant

  constructor(
    private database: Database.Database,
    private logger: Logger
  ) {}

  /**
   * Comprehensive seasonality analysis
   */
  async detectSeasonality(
    campaignId: string,
    lookbackDays: number = 365
  ): Promise<{
    patterns: SeasonalPattern[];
    events: EventImpact[];
    forecast: SeasonalForecast[];
    currentPhase: 'peak' | 'rising' | 'normal' | 'declining' | 'trough';
    recommendations: string[];
  }> {
    this.logger.info('Detecting seasonality', { campaignId, lookbackDays });

    // Analyze different time patterns
    const [hourly, daily, weekly, monthly, yearly] = await Promise.all([
      this.detectHourlyPattern(campaignId, Math.min(lookbackDays, 30)),
      this.detectDailyPattern(campaignId, lookbackDays),
      this.detectWeeklyPattern(campaignId, lookbackDays),
      this.detectMonthlyPattern(campaignId, lookbackDays),
      this.detectYearlyPattern(campaignId, lookbackDays)
    ]);

    // Detect special events
    const events = await this.detectEventImpacts(campaignId);

    // Generate forecast
    const forecast = await this.generateForecast(
      campaignId,
      [hourly, daily, weekly, monthly, yearly].filter(p => p !== null) as SeasonalPattern[],
      events,
      30 // 30 days forecast
    );

    // Determine current phase
    const currentPhase = this.getCurrentPhase(
      [hourly, daily, weekly, monthly, yearly].filter(p => p !== null) as SeasonalPattern[]
    );

    // Generate recommendations
    const recommendations = this.generateSeasonalRecommendations(
      [hourly, daily, weekly, monthly, yearly].filter(p => p !== null) as SeasonalPattern[],
      events,
      currentPhase
    );

    return {
      patterns: [hourly, daily, weekly, monthly, yearly].filter(p => p !== null) as SeasonalPattern[],
      events,
      forecast,
      currentPhase,
      recommendations
    };
  }

  /**
   * Detect hourly patterns (for intraday optimization)
   */
  private async detectHourlyPattern(campaignId: string, lookbackDays: number): Promise<SeasonalPattern | null> {
    const hourlyData = this.database.prepare(`
      SELECT
        CAST(strftime('%H', datetime) as INTEGER) as hour,
        AVG(conversions) as avg_conversions,
        AVG(clicks) as avg_clicks,
        AVG(cost) as avg_cost,
        AVG(conversion_value) as avg_value,
        COUNT(*) as data_points
      FROM fact_channel_spend_hourly
      WHERE campaign_id = ?
        AND datetime >= datetime('now', '-' || ? || ' days')
      GROUP BY hour
      HAVING data_points >= ?
    `).all(campaignId, lookbackDays, this.MIN_DATA_POINTS) as any[];

    if (hourlyData.length < 12) {
      return null; // Not enough hourly data
    }

    const pattern = this.analyzePattern(hourlyData, 'hour', 'hourly');
    if (!pattern) return null;

    // Find peak and trough hours
    const avgConversions = hourlyData.reduce((sum, h) => sum + h.avg_conversions, 0) / hourlyData.length;

    pattern.peakPeriods = hourlyData
      .filter(h => h.avg_conversions > avgConversions * 1.2)
      .map(h => ({
        start: `${h.hour}:00`,
        end: `${h.hour}:59`,
        multiplier: h.avg_conversions / avgConversions,
        historicalPerformance: {
          conversions: h.avg_conversions,
          conversionRate: h.avg_clicks > 0 ? h.avg_conversions / h.avg_clicks : 0,
          avgCPC: h.avg_clicks > 0 ? h.avg_cost / h.avg_clicks : 0,
          ROAS: h.avg_cost > 0 ? h.avg_value / h.avg_cost : 0
        }
      }));

    pattern.troughPeriods = hourlyData
      .filter(h => h.avg_conversions < avgConversions * 0.8)
      .map(h => ({
        start: `${h.hour}:00`,
        end: `${h.hour}:59`,
        multiplier: h.avg_conversions / avgConversions,
        recommendation: h.avg_conversions < avgConversions * 0.5 ? 'reduce_budget' : 'maintain' as const
      }));

    return pattern;
  }

  /**
   * Detect daily patterns (day of week)
   */
  private async detectDailyPattern(campaignId: string, lookbackDays: number): Promise<SeasonalPattern | null> {
    const dailyData = this.database.prepare(`
      SELECT
        CAST(strftime('%w', date) as INTEGER) as day_of_week,
        AVG(conversions) as avg_conversions,
        AVG(clicks) as avg_clicks,
        AVG(cost) as avg_cost,
        AVG(conversion_value) as avg_value,
        COUNT(*) as data_points
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-' || ? || ' days')
      GROUP BY day_of_week
      HAVING data_points >= ?
    `).all(campaignId, lookbackDays, this.MIN_DATA_POINTS) as any[];

    if (dailyData.length < 5) {
      return null; // Not enough daily data
    }

    const pattern = this.analyzePattern(dailyData, 'day_of_week', 'daily');
    if (!pattern) return null;

    // Map day numbers to names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const avgConversions = dailyData.reduce((sum, d) => sum + d.avg_conversions, 0) / dailyData.length;

    pattern.peakPeriods = dailyData
      .filter(d => d.avg_conversions > avgConversions * 1.2)
      .map(d => ({
        start: dayNames[d.day_of_week],
        end: dayNames[d.day_of_week],
        multiplier: d.avg_conversions / avgConversions,
        historicalPerformance: {
          conversions: d.avg_conversions,
          conversionRate: d.avg_clicks > 0 ? d.avg_conversions / d.avg_clicks : 0,
          avgCPC: d.avg_clicks > 0 ? d.avg_cost / d.avg_clicks : 0,
          ROAS: d.avg_cost > 0 ? d.avg_value / d.avg_cost : 0
        }
      }));

    // Calculate next peak
    const today = new Date().getDay();
    const nextPeakDay = pattern.peakPeriods.length > 0 ?
      pattern.peakPeriods[0].start : null;

    if (nextPeakDay) {
      const targetDay = dayNames.indexOf(nextPeakDay);
      const daysUntilPeak = (targetDay - today + 7) % 7 || 7;
      const nextPeak = new Date();
      nextPeak.setDate(nextPeak.getDate() + daysUntilPeak);
      pattern.nextPeak = nextPeak;
    }

    return pattern;
  }

  /**
   * Detect weekly patterns
   */
  private async detectWeeklyPattern(campaignId: string, lookbackDays: number): Promise<SeasonalPattern | null> {
    const weeklyData = this.database.prepare(`
      SELECT
        CAST(strftime('%W', date) as INTEGER) % 4 as week_of_month,
        AVG(conversions) as avg_conversions,
        AVG(clicks) as avg_clicks,
        AVG(cost) as avg_cost,
        AVG(conversion_value) as avg_value,
        COUNT(*) as data_points
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-' || ? || ' days')
      GROUP BY week_of_month
      HAVING data_points >= ?
    `).all(campaignId, lookbackDays, this.MIN_DATA_POINTS * 2) as any[];

    if (weeklyData.length < 3) {
      return null;
    }

    const pattern = this.analyzePattern(weeklyData, 'week_of_month', 'weekly');
    if (!pattern) return null;

    const avgConversions = weeklyData.reduce((sum, w) => sum + w.avg_conversions, 0) / weeklyData.length;

    pattern.peakPeriods = weeklyData
      .filter(w => w.avg_conversions > avgConversions * 1.15)
      .map(w => ({
        start: `Week ${w.week_of_month + 1}`,
        end: `Week ${w.week_of_month + 1}`,
        multiplier: w.avg_conversions / avgConversions,
        historicalPerformance: {
          conversions: w.avg_conversions,
          conversionRate: w.avg_clicks > 0 ? w.avg_conversions / w.avg_clicks : 0,
          avgCPC: w.avg_clicks > 0 ? w.avg_cost / w.avg_clicks : 0,
          ROAS: w.avg_cost > 0 ? w.avg_value / w.avg_cost : 0
        }
      }));

    return pattern;
  }

  /**
   * Detect monthly patterns
   */
  private async detectMonthlyPattern(campaignId: string, lookbackDays: number): Promise<SeasonalPattern | null> {
    const monthlyData = this.database.prepare(`
      SELECT
        CAST(strftime('%m', date) as INTEGER) as month,
        AVG(conversions) as avg_conversions,
        AVG(clicks) as avg_clicks,
        AVG(cost) as avg_cost,
        AVG(conversion_value) as avg_value,
        COUNT(*) as data_points
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-' || ? || ' days')
      GROUP BY month
      HAVING data_points >= ?
    `).all(campaignId, Math.max(lookbackDays, 365), this.MIN_DATA_POINTS) as any[];

    if (monthlyData.length < 6) {
      return null;
    }

    const pattern = this.analyzePattern(monthlyData, 'month', 'monthly');
    if (!pattern) return null;

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const avgConversions = monthlyData.reduce((sum, m) => sum + m.avg_conversions, 0) / monthlyData.length;

    pattern.peakPeriods = monthlyData
      .filter(m => m.avg_conversions > avgConversions * 1.2)
      .map(m => ({
        start: monthNames[m.month],
        end: monthNames[m.month],
        multiplier: m.avg_conversions / avgConversions,
        historicalPerformance: {
          conversions: m.avg_conversions,
          conversionRate: m.avg_clicks > 0 ? m.avg_conversions / m.avg_clicks : 0,
          avgCPC: m.avg_clicks > 0 ? m.avg_cost / m.avg_clicks : 0,
          ROAS: m.avg_cost > 0 ? m.avg_value / m.avg_cost : 0
        }
      }));

    return pattern;
  }

  /**
   * Detect yearly patterns
   */
  private async detectYearlyPattern(campaignId: string, lookbackDays: number): Promise<SeasonalPattern | null> {
    if (lookbackDays < 365) {
      return null; // Need at least a year of data
    }

    const yearlyData = this.database.prepare(`
      SELECT
        CAST(strftime('%j', date) as INTEGER) / 30 as month_group,
        AVG(conversions) as avg_conversions,
        AVG(clicks) as avg_clicks,
        AVG(cost) as avg_cost,
        AVG(conversion_value) as avg_value,
        COUNT(*) as data_points
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-' || ? || ' days')
      GROUP BY month_group
      HAVING data_points >= ?
    `).all(campaignId, lookbackDays, this.MIN_DATA_POINTS * 10) as any[];

    if (yearlyData.length < 6) {
      return null;
    }

    const pattern = this.analyzePattern(yearlyData, 'month_group', 'yearly');
    if (!pattern) return null;

    const avgConversions = yearlyData.reduce((sum, y) => sum + y.avg_conversions, 0) / yearlyData.length;

    // Identify Q4 holiday season, summer peaks, etc.
    pattern.peakPeriods = yearlyData
      .filter(y => y.avg_conversions > avgConversions * 1.25)
      .map(y => ({
        start: `Month ${y.month_group * 30}-${(y.month_group + 1) * 30}`,
        end: `Month ${y.month_group * 30}-${(y.month_group + 1) * 30}`,
        multiplier: y.avg_conversions / avgConversions,
        historicalPerformance: {
          conversions: y.avg_conversions,
          conversionRate: y.avg_clicks > 0 ? y.avg_conversions / y.avg_clicks : 0,
          avgCPC: y.avg_clicks > 0 ? y.avg_cost / y.avg_clicks : 0,
          ROAS: y.avg_cost > 0 ? y.avg_value / y.avg_cost : 0
        }
      }));

    return pattern;
  }

  /**
   * Detect special event impacts
   */
  private async detectEventImpacts(campaignId: string): Promise<EventImpact[]> {
    const events: EventImpact[] = [];

    // Check for known holidays
    const holidays = [
      { name: 'Black Friday', type: 'holiday' as const, dayOfYear: 329 },
      { name: 'Cyber Monday', type: 'holiday' as const, dayOfYear: 332 },
      { name: 'Christmas', type: 'holiday' as const, dayOfYear: 359 },
      { name: 'New Year', type: 'holiday' as const, dayOfYear: 1 },
      { name: 'Valentine\'s Day', type: 'holiday' as const, dayOfYear: 45 },
      { name: 'Easter', type: 'holiday' as const, dayOfYear: 100 }, // Approximate
      { name: 'Independence Day', type: 'holiday' as const, dayOfYear: 185 },
      { name: 'Halloween', type: 'holiday' as const, dayOfYear: 304 }
    ];

    for (const holiday of holidays) {
      const holidayData = this.database.prepare(`
        SELECT
          AVG(conversions) as holiday_conversions,
          AVG(cost) as holiday_cost
        FROM fact_channel_spend
        WHERE campaign_id = ?
          AND CAST(strftime('%j', date) as INTEGER) BETWEEN ? AND ?
      `).get(campaignId, holiday.dayOfYear - 3, holiday.dayOfYear + 3) as any;

      const normalData = this.database.prepare(`
        SELECT
          AVG(conversions) as normal_conversions,
          AVG(cost) as normal_cost
        FROM fact_channel_spend
        WHERE campaign_id = ?
          AND CAST(strftime('%j', date) as INTEGER) NOT BETWEEN ? AND ?
      `).get(campaignId, holiday.dayOfYear - 7, holiday.dayOfYear + 7) as any;

      if (holidayData && normalData && normalData.normal_conversions > 0) {
        const impact = holidayData.holiday_conversions / normalData.normal_conversions;

        if (impact > 1.3 || impact < 0.7) {
          events.push({
            eventName: holiday.name,
            eventType: holiday.type,
            historicalImpact: impact,
            daysBeforeImpact: 3,
            daysAfterImpact: 3,
            confidence: 0.8
          });
        }
      }
    }

    return events;
  }

  /**
   * Analyze pattern significance
   */
  private analyzePattern(
    data: any[],
    periodKey: string,
    patternType: SeasonalPattern['type']
  ): SeasonalPattern | null {
    if (data.length === 0) return null;

    const values = data.map(d => d.avg_conversions);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;

    // Not significant if coefficient of variation is too low
    if (cv < this.SIGNIFICANCE_THRESHOLD) {
      return null;
    }

    // Calculate multipliers
    const multipliers = new Map<string, number>();
    data.forEach(d => {
      multipliers.set(d[periodKey].toString(), d.avg_conversions / mean);
    });

    return {
      type: patternType,
      strength: Math.min(cv / 0.5, 1), // Normalize to 0-1
      confidence: this.calculatePatternConfidence(data),
      peakPeriods: [],
      troughPeriods: [],
      multipliers
    };
  }

  /**
   * Calculate pattern confidence based on data quality
   */
  private calculatePatternConfidence(data: any[]): number {
    const avgDataPoints = data.reduce((sum, d) => sum + (d.data_points || 0), 0) / data.length;
    const dataQuality = Math.min(avgDataPoints / 30, 1); // Max confidence at 30+ data points

    const consistency = this.calculateConsistency(data.map(d => d.avg_conversions));

    return dataQuality * 0.6 + consistency * 0.4;
  }

  /**
   * Calculate consistency of pattern
   */
  private calculateConsistency(values: number[]): number {
    if (values.length < 2) return 0;

    // Calculate autocorrelation
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    let numerator = 0;
    let denominator = 0;

    for (let i = 1; i < values.length; i++) {
      numerator += (values[i] - mean) * (values[i - 1] - mean);
    }

    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }

    const autocorrelation = denominator > 0 ? numerator / denominator : 0;
    return Math.max(0, Math.min(1, (autocorrelation + 1) / 2)); // Normalize to 0-1
  }

  /**
   * Generate forecast based on detected patterns
   */
  private async generateForecast(
    campaignId: string,
    patterns: SeasonalPattern[],
    events: EventImpact[],
    daysAhead: number
  ): Promise<SeasonalForecast[]> {
    const forecasts: SeasonalForecast[] = [];

    // Get baseline performance
    const baseline = this.database.prepare(`
      SELECT
        AVG(conversions) as avg_conversions,
        AVG(clicks) as avg_clicks,
        AVG(impressions) as avg_impressions,
        AVG(cost) as avg_cost,
        AVG(conversions * 1.0 / NULLIF(clicks, 0)) as avg_cvr
      FROM fact_channel_spend
      WHERE campaign_id = ?
        AND date >= date('now', '-30 days')
    `).get(campaignId) as any;

    for (let i = 1; i <= daysAhead; i++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i);

      // Calculate seasonal multiplier
      let multiplier = 1;
      let confidence = 0.5;

      // Apply pattern multipliers
      for (const pattern of patterns) {
        const periodMultiplier = this.getMultiplierForDate(forecastDate, pattern);
        multiplier *= periodMultiplier;
        confidence = Math.max(confidence, pattern.confidence * 0.8);
      }

      // Check for events
      const dayOfYear = this.getDayOfYear(forecastDate);
      for (const event of events) {
        // Simple check - would need proper holiday calculation
        if (Math.abs(dayOfYear - 329) <= event.daysBeforeImpact) { // Black Friday example
          multiplier *= event.historicalImpact;
          confidence = Math.max(confidence, event.confidence);
        }
      }

      const forecast: SeasonalForecast = {
        date: forecastDate,
        expectedPerformance: {
          conversions: baseline.avg_conversions * multiplier,
          clicks: baseline.avg_clicks * multiplier,
          impressions: baseline.avg_impressions * multiplier,
          cost: baseline.avg_cost * multiplier,
          conversionRate: baseline.avg_cvr
        },
        confidence,
        seasonalMultiplier: multiplier,
        recommendations: this.getForecastRecommendations(multiplier)
      };

      forecasts.push(forecast);
    }

    return forecasts;
  }

  /**
   * Get multiplier for a specific date based on pattern
   */
  private getMultiplierForDate(date: Date, pattern: SeasonalPattern): number {
    let key: string;

    switch (pattern.type) {
      case 'hourly':
        key = date.getHours().toString();
        break;
      case 'daily':
      case 'weekly':
        key = date.getDay().toString();
        break;
      case 'monthly':
        key = (date.getMonth() + 1).toString();
        break;
      case 'yearly':
        key = Math.floor(this.getDayOfYear(date) / 30).toString();
        break;
      default:
        return 1;
    }

    return pattern.multipliers.get(key) || 1;
  }

  /**
   * Get day of year for a date
   */
  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get recommendations based on forecast multiplier
   */
  private getForecastRecommendations(multiplier: number): string[] {
    const recommendations: string[] = [];

    if (multiplier > 1.5) {
      recommendations.push('Strong peak period expected - increase budgets');
      recommendations.push('Prepare landing pages for increased traffic');
      recommendations.push('Consider increasing bids to capture more volume');
    } else if (multiplier > 1.2) {
      recommendations.push('Above average performance expected');
      recommendations.push('Moderate budget increase recommended');
    } else if (multiplier < 0.5) {
      recommendations.push('Significant trough expected - reduce budgets');
      recommendations.push('Focus on efficiency over volume');
      recommendations.push('Good time for testing and optimization');
    } else if (multiplier < 0.8) {
      recommendations.push('Below average performance expected');
      recommendations.push('Consider reducing bids to maintain efficiency');
    }

    return recommendations;
  }

  /**
   * Determine current phase based on patterns
   */
  private getCurrentPhase(patterns: SeasonalPattern[]): 'peak' | 'rising' | 'normal' | 'declining' | 'trough' {
    if (patterns.length === 0) return 'normal';

    const now = new Date();
    let currentMultiplier = 1;

    // Get current multiplier from all patterns
    for (const pattern of patterns) {
      currentMultiplier *= this.getMultiplierForDate(now, pattern);
    }

    // Compare to recent average
    if (currentMultiplier > 1.3) return 'peak';
    if (currentMultiplier > 1.1) return 'rising';
    if (currentMultiplier < 0.7) return 'trough';
    if (currentMultiplier < 0.9) return 'declining';

    return 'normal';
  }

  /**
   * Generate seasonal recommendations
   */
  private generateSeasonalRecommendations(
    patterns: SeasonalPattern[],
    events: EventImpact[],
    currentPhase: string
  ): string[] {
    const recommendations: string[] = [];

    // Phase-based recommendations
    switch (currentPhase) {
      case 'peak':
        recommendations.push('Currently in peak period - maximize volume');
        recommendations.push('Increase budgets to capture high-converting traffic');
        break;
      case 'rising':
        recommendations.push('Performance trending upward - prepare for peak');
        recommendations.push('Gradually increase bids to capture momentum');
        break;
      case 'trough':
        recommendations.push('Currently in low period - focus on efficiency');
        recommendations.push('Reduce budgets and test optimizations');
        break;
      case 'declining':
        recommendations.push('Performance trending downward - adjust expectations');
        recommendations.push('Start reducing bids to maintain profitability');
        break;
    }

    // Pattern-based recommendations
    const strongestPattern = patterns.reduce((strongest, pattern) =>
      pattern.strength > (strongest?.strength || 0) ? pattern : strongest, patterns[0]
    );

    if (strongestPattern) {
      switch (strongestPattern.type) {
        case 'hourly':
          recommendations.push('Strong hourly patterns detected - implement dayparting');
          break;
        case 'daily':
        case 'weekly':
          recommendations.push('Weekly patterns detected - adjust daily budgets');
          break;
        case 'monthly':
          recommendations.push('Monthly seasonality detected - plan budget allocation');
          break;
        case 'yearly':
          recommendations.push('Annual patterns detected - prepare for seasonal changes');
          break;
      }
    }

    // Event-based recommendations
    const upcomingEvents = events.filter(e => {
      const dayOfYear = this.getDayOfYear(new Date());
      return Math.abs(dayOfYear - 329) <= 30; // Example for Black Friday
    });

    if (upcomingEvents.length > 0) {
      recommendations.push(`${upcomingEvents.length} events in next 30 days - prepare campaigns`);
    }

    return recommendations;
  }
}