/**
 * v1.7 Alert System Type Definitions
 */

export type AlertType = 
  | 'spend_spike' 
  | 'spend_drop' 
  | 'ctr_drop' 
  | 'cpc_jump' 
  | 'conversion_drop' 
  | 'quality_score' 
  | 'serp_drift' 
  | 'lp_regression';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'open' | 'ack' | 'snoozed' | 'closed';

export interface TimeWindow {
  baseline_days: number;
  current_days: number;
  start?: string;
  end?: string;
}

export interface Entity {
  id: string;
  type: 'campaign' | 'ad_group' | 'keyword' | 'url' | 'cluster';
  product: string;
  market?: string;
  campaign?: string;
  ad_group?: string;
  keyword?: string;
  url?: string;
}

export interface BaselineData {
  mean: number;
  stdDev: number;
  median: number;
  count: number;
  min: number;
  max: number;
  period: {
    start: string;
    end: string;
  };
}

export interface CurrentData {
  value: number;
  count: number;
  period: {
    start: string;
    end: string;
  };
}

export interface AlertMetrics {
  baseline: BaselineData;
  current: CurrentData;
  change_percentage?: number;
  change_absolute?: number;
  z_score?: number;
  additional?: Record<string, any>;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  entity: Entity;
  window: TimeWindow;
  metrics: AlertMetrics;
  why: string;
  playbook?: string;
  suggested_actions?: SuggestedAction[];
  detection: {
    first_seen: string;
    last_seen: string;
    occurrences: number;
    consecutive_occurrences?: number;
  };
}

export interface SuggestedAction {
  action: string;
  params?: Record<string, any>;
  dry_run: boolean;
  priority?: 'immediate' | 'high' | 'medium' | 'low';
  estimated_impact?: string;
}

export interface AlertState {
  alert_id: string;
  status: AlertStatus;
  severity: AlertSeverity;
  first_seen: string;
  last_seen: string;
  consecutive_occurrences: number;
  snooze_until?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AlertConfig {
  type: AlertType;
  enabled: boolean;
  thresholds: {
    baseline_days: number;
    current_days: number;
    min_volume?: number;
    change_factor?: number;
    severity_bands?: {
      critical?: number;
      high?: number;
      medium?: number;
    };
  };
  noise_control: {
    strategy: 'consecutive' | 'cooldown' | 'both';
    consecutive_checks: number;
    cooldown_hours: number;
  };
  hysteresis?: number;
}

export interface AlertBatch {
  generated_at: string;
  product: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    new: number;
    persistent: number;
  };
  alerts: Alert[];
}

export interface DetectorResult {
  triggered: boolean;
  alert?: Alert;
  reason?: string;
}

export interface NoiseControlConfig {
  strategy: 'consecutive' | 'cooldown' | 'both';
  consecutive_checks: number;
  cooldown_hours: number;
}