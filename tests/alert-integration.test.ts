import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/database/database-manager.js';
import { ExperimentAlertIntegration } from '../src/experiments/alert-integration.js';
import { ExperimentManager } from '../src/experiments/experiment-manager.js';

describe('ExperimentAlertIntegration', () => {
  let db: DatabaseManager;
  let integration: ExperimentAlertIntegration;
  let experimentManager: ExperimentManager;
  const testDbPath = 'data/test-alert-integration.db';

  beforeEach(() => {
    // Initialize database
    db = new DatabaseManager(testDbPath);
    db.initialize(); // Initialize the database connection
    integration = new ExperimentAlertIntegration(db, 'test-experiments');
    experimentManager = new ExperimentManager('test-experiments');

    // Create necessary tables
    const database = db.getDb();

    // Create experiments table
    database.exec(`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        product TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        config_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create experiment_measurements table
    database.exec(`
      CREATE TABLE IF NOT EXISTS experiment_measurements (
        experiment_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        date TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        conversion_rate REAL DEFAULT 0,
        PRIMARY KEY (experiment_id, variant_id, date)
      )
    `);

    // Create experiment_alerts table
    database.exec(`
      CREATE TABLE IF NOT EXISTS experiment_alerts (
        experiment_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        metrics_json TEXT,
        suggested_action TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (experiment_id, alert_type, created_at)
      )
    `);

    // Create alerts tables for AlertManager
    database.exec(`
      CREATE TABLE IF NOT EXISTS alerts_history (
        alert_id TEXT PRIMARY KEY,
        seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        payload_json TEXT NOT NULL
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS alerts_state (
        alert_id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'open',
        snooze_until TEXT,
        notes TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create fact_search_terms table for AlertManager entity queries
    database.exec(`
      CREATE TABLE IF NOT EXISTS fact_search_terms (
        product TEXT,
        campaign TEXT,
        ad_group TEXT,
        date TEXT
      )
    `);
  });

  afterEach(() => {
    // Clean up
    db.close();
  });

  describe('monitorExperiments', () => {
    it('should detect early stopping conditions', async () => {
      const database = db.getDb();

      // Insert a test experiment
      database.prepare(`
        INSERT INTO experiments (id, product, name, type, status, config_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'exp_001',
        'testproduct',
        'Test Experiment',
        'rsa',
        'active',
        JSON.stringify({
          minimumSampleSize: 1000,
          confidenceLevel: 0.95,
          startDate: new Date().toISOString()
        })
      );

      // Insert measurements showing variant performing worse
      const measurements = [
        { variant_id: 'control', impressions: 10000, clicks: 500, conversions: 50, cost: 250, conversion_rate: 0.10 },
        { variant_id: 'variant_a', impressions: 10000, clicks: 500, conversions: 20, cost: 250, conversion_rate: 0.04 }
      ];

      const insertMeasurement = database.prepare(`
        INSERT INTO experiment_measurements
        (experiment_id, variant_id, date, impressions, clicks, conversions, cost, conversion_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of measurements) {
        insertMeasurement.run(
          'exp_001',
          m.variant_id,
          new Date().toISOString().split('T')[0],
          m.impressions,
          m.clicks,
          m.conversions,
          m.cost,
          m.conversion_rate
        );
      }

      // Monitor experiments
      const alerts = await integration.monitorExperiments('testproduct');

      // Should have early stopping alert
      const earlyStopAlert = alerts.find(a => a.alertType === 'early_stopping');
      expect(earlyStopAlert).toBeDefined();
      expect(earlyStopAlert?.severity).toBe('critical');
      expect(earlyStopAlert?.message).toContain('significantly worse');
    });

    it('should detect traffic anomalies', async () => {
      const database = db.getDb();

      // Insert experiment
      database.prepare(`
        INSERT INTO experiments (id, product, name, type, status, config_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'exp_002',
        'testproduct',
        'Traffic Test',
        'landing_page',
        'active',
        JSON.stringify({ startDate: new Date().toISOString() })
      );

      // Insert measurements with traffic drop
      const dates = [
        { date: '2025-01-10', impressions: 1000 },
        { date: '2025-01-11', impressions: 1100 },
        { date: '2025-01-12', impressions: 1050 },
        { date: '2025-01-13', impressions: 300 },  // Drop
        { date: '2025-01-14', impressions: 250 },  // Drop
        { date: '2025-01-15', impressions: 280 },  // Drop
        { date: '2025-01-16', impressions: 260 }   // Drop
      ];

      const insertMeasurement = database.prepare(`
        INSERT INTO experiment_measurements
        (experiment_id, variant_id, date, impressions)
        VALUES (?, ?, ?, ?)
      `);

      for (const d of dates) {
        insertMeasurement.run('exp_002', 'control', d.date, d.impressions);
      }

      const alerts = await integration.monitorExperiments('testproduct');

      const trafficAlert = alerts.find(a =>
        a.alertType === 'anomaly' && a.message.includes('Traffic dropped')
      );

      expect(trafficAlert).toBeDefined();
      expect(trafficAlert?.severity).toBe('high');
    });

    it('should detect when winner can be declared', async () => {
      const database = db.getDb();

      // Insert experiment
      database.prepare(`
        INSERT INTO experiments (id, product, name, type, status, config_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'exp_003',
        'testproduct',
        'Winner Test',
        'rsa',
        'active',
        JSON.stringify({
          minimumSampleSize: 100,
          confidenceLevel: 0.95,
          startDate: new Date().toISOString()
        })
      );

      // Insert measurements showing clear winner
      const measurements = [
        { variant_id: 'control', clicks: 2000, conversions: 80, conversion_rate: 0.04 },
        { variant_id: 'variant_a', clicks: 2000, conversions: 160, conversion_rate: 0.08 }
      ];

      const insertMeasurement = database.prepare(`
        INSERT INTO experiment_measurements
        (experiment_id, variant_id, date, clicks, conversions, conversion_rate)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const m of measurements) {
        insertMeasurement.run(
          'exp_003',
          m.variant_id,
          new Date().toISOString().split('T')[0],
          m.clicks,
          m.conversions,
          m.conversion_rate
        );
      }

      const alerts = await integration.monitorExperiments('testproduct');

      const winnerAlert = alerts.find(a => a.alertType === 'winner_found');
      expect(winnerAlert).toBeDefined();
      expect(winnerAlert?.severity).toBe('low');
      expect(winnerAlert?.message).toContain('statistical significance');
      expect(winnerAlert?.metrics?.difference).toBeCloseTo(1.0, 1); // 100% improvement
    });
  });

  describe('getExperimentAlerts', () => {
    it('should retrieve stored alerts', async () => {
      const database = db.getDb();

      // Insert some test alerts
      const insertAlert = database.prepare(`
        INSERT INTO experiment_alerts
        (experiment_id, alert_type, severity, message, metrics_json, suggested_action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertAlert.run(
        'exp_test',
        'anomaly',
        'high',
        'Test alert message',
        JSON.stringify({ control: 0.05, variant: 0.03 }),
        'Check implementation',
        new Date().toISOString()
      );

      insertAlert.run(
        'exp_test',
        'winner_found',
        'low',
        'Winner found',
        JSON.stringify({ control: 0.05, variant: 0.08 }),
        'Declare winner',
        new Date().toISOString()
      );

      // Retrieve alerts
      const alerts = await integration.getExperimentAlerts('exp_test');

      expect(alerts).toHaveLength(2);
      expect(alerts[0].alertType).toBe('winner_found'); // Most recent first
      expect(alerts[1].alertType).toBe('anomaly');
    });
  });
});