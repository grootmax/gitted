import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BackgroundIndexer } from '../indexer/BackgroundIndexer';

describe('BackgroundIndexer Integration Tests', () => {
  let tmpDir: string;
  let indexer: BackgroundIndexer;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-indexer-test-'));

    // Create sample files in temp directory
    const srcDir = path.join(tmpDir, 'src');
    const docDir = path.join(tmpDir, 'doc', 'adr');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(docDir, { recursive: true });

    // Sample source file with comments
    const paymentFile = path.join(srcDir, 'payment-service.ts');
    fs.writeFileSync(
      paymentFile,
      `
      // @team Billing Team
      // @owner payment-devs
      // @feature Payment Gateway
      // @adr ADR-004: All charges must be idempotent
      import { Stripe } from 'stripe';

      export class PaymentService {
        public async processCharge(amount: number): Promise<boolean> {
          return true;
        }
      }
      `
    );

    // Sample ADR file
    fs.writeFileSync(
      path.join(docDir, '0004-payment-idempotency.md'),
      `# 4. Payment Idempotency
      Status: Accepted
      Referenced by payment-service.
      All charges must pass idempotency key.
      `
    );

    indexer = new BackgroundIndexer({
      workspaceRoot: tmpDir,
      enableWatchers: false,
    });
    await indexer.start();
  });

  afterEach(() => {
    indexer.stop();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should parse AST, ADR warnings, and related tests off-thread and cache in SQLite', async () => {
    const paymentFile = path.join(tmpDir, 'src', 'payment-service.ts');
    
    // Enqueue file for background indexing
    indexer.indexFileAsync(paymentFile, 'high');

    // Wait for background queue to finish
    await new Promise((res) => setTimeout(res, 300));

    const cached = indexer.getCache().getFileContext(paymentFile);

    expect(cached).not.toBeNull();
    expect(cached?.filePath).toBe(paymentFile);
    expect(cached?.featureOwnership?.team).toBe('Billing Team');
    expect(cached?.featureOwnership?.feature).toBe('Payment Gateway');
    expect(cached?.astSummary?.classes).toContain('PaymentService');
    expect(cached?.adrWarnings.length).toBeGreaterThan(0);
  });

  it('should update cache entry when file content is modified and re-indexed', async () => {
    const paymentFile = path.join(tmpDir, 'src', 'payment-service.ts');
    
    // Index initial version
    indexer.indexFileAsync(paymentFile, 'high');
    await new Promise((res) => setTimeout(res, 200));

    // Modify file
    fs.writeFileSync(
      paymentFile,
      `
      // @team Core Platform
      // @owner platform-devs
      export class UpdatedService {}
      `
    );

    indexer.indexFileAsync(paymentFile, 'high');
    await new Promise((res) => setTimeout(res, 200));

    const updatedCached = indexer.getCache().getFileContext(paymentFile);
    expect(updatedCached?.featureOwnership?.team).toBe('Core Platform');
    expect(updatedCached?.astSummary?.classes).toContain('UpdatedService');
  });
});
