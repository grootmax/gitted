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
});
