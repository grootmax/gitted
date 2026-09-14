import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SqliteCache } from '../cache/SqliteCache';
import { FileContext } from '../types';

describe('SqliteCache Unit Tests', () => {
  let tmpDir: string;
  let cache: SqliteCache;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-cache-test-'));
    cache = new SqliteCache({ workspaceRoot: tmpDir });
  });

  afterEach(() => {
    cache.close();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should initialize database and create schema migration tables automatically', () => {
    const dbFile = path.join(tmpDir, '.contextbuilder', 'cache.db');
    expect(fs.existsSync(dbFile)).toBe(true);
    expect(cache.getDbSizeBytes()).toBeGreaterThan(0);
  });

  it('should insert and retrieve file context in sub-5ms latency', () => {
    const filePath = path.join(tmpDir, 'src', 'payment-service.ts');
    const sampleContext: FileContext = {
      filePath,
      featureOwnership: {
        team: 'Billing Team',
        owner: 'payment-devs',
        feature: 'Checkout Gateway',
      },
      prHistory: [
        { id: '#101', title: 'Add Stripe Integration', author: 'alice', date: '2026-09-10' },
      ],
      commitHistory: [
        { hash: 'a1b2c3d', author: 'alice', message: 'Implement payment flow', date: '2026-09-10' },
      ],
      relatedTests: [
        { file: 'test/payment-service.test.ts', testName: 'should process charges' },
      ],
      adrWarnings: [
        { id: 'ADR-004', title: 'Payment Idempotency', status: 'Accepted', warning: 'Must send key' },
      ],
      astSummary: {
        functions: ['processPayment', 'verifyCharge'],
        classes: ['PaymentService'],
        exports: ['PaymentService'],
        imports: ['stripe'],
      },
      lastIndexedAt: Date.now(),
      contentHash: 'hash123',
    };

    cache.upsertFileContext(sampleContext);

    const start = performance.now();
    const retrieved = cache.getFileContext(filePath);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5); // Requirement: <5ms context fetch latency
    expect(retrieved).not.toBeNull();
    expect(retrieved?.filePath).toBe(filePath);
    expect(retrieved?.featureOwnership?.team).toBe('Billing Team');
    expect(retrieved?.prHistory.length).toBe(1);
    expect(retrieved?.adrWarnings.length).toBe(1);
  });

  it('should return null for non-existent file path without error', () => {
    const retrieved = cache.getFileContext('non-existent-file.ts');
    expect(retrieved).toBeNull();
  });

  it('should enforce 50MB storage limit by purging old records and vacuuming', () => {
    // Fill cache with records
    for (let i = 0; i < 50; i++) {
      cache.upsertFileContext({
        filePath: `file_${i}.ts`,
        branch: i % 2 === 0 ? 'main' : 'feature/v1',
        prHistory: [],
        commitHistory: [],
        relatedTests: [],
        adrWarnings: [],
        lastIndexedAt: Date.now() - (100 - i) * 1000,
      });
    }

    expect(cache.getIndexedFileCount()).toBe(50);

    // Trigger max size enforcement with tiny threshold for test
    const reduced = cache.enforceMaxDatabaseSize(100); // 100 bytes threshold to force purge
    expect(reduced).toBe(true);
    expect(cache.getIndexedFileCount()).toBeLessThan(50);
  });

  it('should store and isolate context per branch for the same file path', () => {
    const filePath = path.join(tmpDir, 'src', 'payment.ts');

    const mainContext: FileContext = {
      filePath,
      branch: 'main',
      featureOwnership: { team: 'Core', owner: 'alice', feature: 'Legacy Billing' },
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    const featureContext: FileContext = {
      filePath,
      branch: 'feature/payment-v2',
      featureOwnership: { team: 'Payments', owner: 'bob', feature: 'Stripe V2' },
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    cache.upsertFileContext(mainContext);
    cache.upsertFileContext(featureContext);

    const retrievedMain = cache.getFileContext(filePath, 'main');
    const retrievedFeature = cache.getFileContext(filePath, 'feature/payment-v2');

    expect(retrievedMain).not.toBeNull();
    expect(retrievedMain?.featureOwnership?.feature).toBe('Legacy Billing');

    expect(retrievedFeature).not.toBeNull();
    expect(retrievedFeature?.featureOwnership?.feature).toBe('Stripe V2');
  });

  it('should migrate database from schema version 1 to version 2 seamlessly', () => {
    const v1Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-v1-migration-'));
    const contextDir = path.join(v1Dir, '.contextbuilder');
    fs.mkdirSync(contextDir, { recursive: true });
    const dbPath = path.join(contextDir, 'cache.db');

    // Create a raw SQLite db with Version 1 schema
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      INSERT INTO schema_migrations VALUES (1, 10000);
      CREATE TABLE file_context (
        file_path TEXT PRIMARY KEY,
        feature_ownership TEXT,
        pr_history TEXT,
        commit_history TEXT,
        related_tests TEXT,
        adr_warnings TEXT,
        ast_summary TEXT,
        db_schema_context TEXT,
        last_indexed_at INTEGER NOT NULL,
        content_hash TEXT
      );
      INSERT INTO file_context (file_path, feature_ownership, last_indexed_at)
      VALUES ('src/index.ts', '{"team":"v1-team"}', 20000);
    `);
    db.close();

    // Opening with SqliteCache should auto-migrate to version 2
    const cacheV2 = new SqliteCache({ workspaceRoot: v1Dir });
    const migratedContext = cacheV2.getFileContext('src/index.ts', 'main');

    expect(migratedContext).not.toBeNull();
    expect(migratedContext?.featureOwnership?.team).toBe('v1-team');
    expect(migratedContext?.branch).toBe('main');

    cacheV2.close();
    if (fs.existsSync(v1Dir)) {
      fs.rmSync(v1Dir, { recursive: true, force: true });
    }
  });
});
