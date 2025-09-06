/**
 * Alert Detectors Index
 * Export all detector classes for v1.7
 */

export { CTRDetector } from './ctr-detector.js';
export { SpendDetector } from './spend-detector.js';
export { CPCDetector } from './cpc-detector.js';

// Placeholder exports for remaining detectors (to be implemented)
// These will be implemented in the next phase but are stubbed for now
export class ConversionDetector {
  async detect() {
    return { triggered: false, reason: 'Conversion detector not yet implemented' };
  }
}

export class QualityScoreDetector {
  async detect() {
    return { triggered: false, reason: 'Quality Score detector not yet implemented' };
  }
}

export class SERPDriftDetector {
  async detect() {
    return { triggered: false, reason: 'SERP Drift detector not yet implemented' };
  }
}

export class LPRegressionDetector {
  async detect() {
    return { triggered: false, reason: 'LP Regression detector not yet implemented' };
  }
}