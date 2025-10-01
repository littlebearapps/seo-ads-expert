/**
 * Financial Mathematics Utilities
 *
 * Provides precision-controlled financial calculations with banker's rounding
 * and compensated summation for accurate budget and currency operations.
 */

export class FinancialMath {
  private static readonly CURRENCY_PRECISION = 2; // cents precision
  private static readonly TOLERANCE = 0.01; // $0.01 tolerance

  /**
   * Round using banker's rounding (round half to even) for consistency
   */
  static round(value: number, precision: number = FinancialMath.CURRENCY_PRECISION): number {
    if (!isFinite(value)) return value;

    const factor = Math.pow(10, precision);
    const shifted = value * factor;

    // Handle exact halves with banker's rounding
    if (Math.abs(shifted - Math.round(shifted)) < Number.EPSILON) {
      return Math.round(shifted) / factor;
    }

    // For exact halves, round to nearest even
    if (Math.abs(shifted - Math.floor(shifted) - 0.5) < Number.EPSILON) {
      const floored = Math.floor(shifted);
      return (floored % 2 === 0 ? floored : Math.ceil(shifted)) / factor;
    }

    return Math.round(shifted) / factor;
  }

  /**
   * Check if two financial values are equal within tolerance
   */
  static isEqual(a: number, b: number, tolerance: number = FinancialMath.TOLERANCE): boolean {
    return Math.abs(a - b) <= tolerance;
  }

  /**
   * Sum array of values using Kahan compensated summation for precision
   */
  static sum(values: number[]): number {
    let sum = 0;
    let compensation = 0;

    for (const value of values) {
      const rounded = FinancialMath.round(value);
      const y = rounded - compensation;
      const t = sum + y;
      compensation = (t - sum) - y;
      sum = t;
    }

    return FinancialMath.round(sum);
  }

  /**
   * Get appropriate tolerance for financial calculations
   */
  static getTolerance(): number {
    return FinancialMath.TOLERANCE;
  }
}

export class MetricMath {
  /**
   * Round percentage values (for display as %)
   */
  static roundPercentage(value: number, precision: number = 2): number {
    return FinancialMath.round(value * 100, precision);
  }

  /**
   * Round ratio values (CVR, CTR, etc.)
   */
  static roundRatio(value: number, precision: number = 4): number {
    return FinancialMath.round(value, precision);
  }

  /**
   * Round currency values
   */
  static roundCurrency(value: number): number {
    return FinancialMath.round(value, 2);
  }

  /**
   * Calculate ROAS with appropriate precision
   */
  static calculateROAS(revenue: number, spend: number): number {
    if (spend === 0) return 0;
    return MetricMath.roundRatio(revenue / spend, 2);
  }

  /**
   * Calculate CVR with appropriate precision
   */
  static calculateCVR(conversions: number, clicks: number): number {
    if (clicks === 0) return 0;
    return MetricMath.roundRatio(conversions / clicks, 4);
  }

  /**
   * Calculate CTR with appropriate precision
   */
  static calculateCTR(clicks: number, impressions: number): number {
    if (impressions === 0) return 0;
    return MetricMath.roundRatio(clicks / impressions, 4);
  }

  /**
   * Calculate CPC with appropriate precision
   */
  static calculateCPC(spend: number, clicks: number): number {
    if (clicks === 0) return 0;
    return MetricMath.roundCurrency(spend / clicks);
  }

  /**
   * Calculate CPA with appropriate precision
   */
  static calculateCPA(spend: number, conversions: number): number {
    if (conversions === 0) return 0;
    return MetricMath.roundCurrency(spend / conversions);
  }

  /**
   * Get tolerance for performance metrics
   */
  static getTolerances() {
    return {
      currency: 0.01,    // ±$0.01 for CPC, CPA
      ratio: 0.0001,     // ±0.0001 for CTR, CVR
      roas: 0.01,        // ±0.01 for ROAS
      statistical: 0.001  // ±0.001 for Thompson scores
    };
  }
}