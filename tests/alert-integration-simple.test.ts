import { describe, it, expect } from 'vitest';
import { ExperimentAlertIntegration } from '../src/experiments/alert-integration.js';
import Database from 'better-sqlite3';

describe('ExperimentAlertIntegration Simple', () => {
  it('should create alert integration instance', () => {
    // Create a simple mock database manager
    const mockDb = {
      getDb: () => new Database(':memory:'),
      close: () => {}
    };

    const integration = new ExperimentAlertIntegration(mockDb as any, 'test-experiments');
    expect(integration).toBeDefined();
  });

  it('should monitor experiments and find alerts', async () => {
    // Create in-memory database
    const db = new Database(':memory:');

    // Create tables
    db.exec(`
      CREATE TABLE experiments (
        id TEXT PRIMARY KEY,
        product TEXT,
        name TEXT,
        type TEXT,
        status TEXT,
        config_json TEXT
      );

      CREATE TABLE experiment_measurements (
        experiment_id TEXT,
        variant_id TEXT,
        date TEXT,
        impressions INTEGER,
        clicks INTEGER,
        conversions INTEGER,
        cost REAL,
        conversion_rate REAL
      );

      CREATE TABLE experiment_alerts (
        experiment_id TEXT,
        alert_type TEXT,
        severity TEXT,
        message TEXT,
        metrics_json TEXT,
        suggested_action TEXT,
        created_at TEXT
      );

      CREATE TABLE alerts_history (
        alert_id TEXT PRIMARY KEY,
        seen_at TEXT,
        payload_json TEXT
      );

      CREATE TABLE alerts_state (
        alert_id TEXT PRIMARY KEY,
        status TEXT,
        snooze_until TEXT,
        notes TEXT,
        updated_at TEXT
      );

      CREATE TABLE fact_search_terms (
        product TEXT,
        campaign TEXT,
        ad_group TEXT,
        date TEXT
      );
    `);

    // Insert test data - experiment performing poorly
    db.prepare(`
      INSERT INTO experiments (id, product, name, type, status, config_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'exp_test',
      'testproduct',
      'Test Experiment',
      'rsa',
      'active',
      JSON.stringify({
        minimumSampleSize: 100,
        confidenceLevel: 0.95,
        startDate: new Date().toISOString()
      })
    );

    // Insert measurements showing poor variant performance
    db.prepare(`
      INSERT INTO experiment_measurements
      (experiment_id, variant_id, date, impressions, clicks, conversions, cost, conversion_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('exp_test', 'control', '2025-01-18', 1000, 100, 10, 50, 0.10);

    db.prepare(`
      INSERT INTO experiment_measurements
      (experiment_id, variant_id, date, impressions, clicks, conversions, cost, conversion_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('exp_test', 'variant_a', '2025-01-18', 1000, 100, 2, 50, 0.02);

    // Create mock database manager
    const mockDb = {
      getDb: () => db,
      close: () => db.close()
    };

    // Create integration and monitor
    const integration = new ExperimentAlertIntegration(mockDb as any, 'test-experiments');
    const alerts = await integration.monitorExperiments('testproduct');

    // Should find early stopping alert
    expect(alerts.length).toBeGreaterThan(0);

    const earlyStopAlert = alerts.find(a => a.alertType === 'early_stopping');
    expect(earlyStopAlert).toBeDefined();

    if (earlyStopAlert) {
      expect(earlyStopAlert.severity).toBe('critical');
      expect(earlyStopAlert.message).toContain('worse');
    }

    // Clean up
    db.close();
  });
});