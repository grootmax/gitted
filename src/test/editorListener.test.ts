import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execSync: vi.fn((...args: any[]) => {
      throw new Error('execSync called on main thread!');
    }),
    spawnSync: vi.fn((...args: any[]) => {
      throw new Error('spawnSync called on main thread!');
    }),
  };
});

import { GittedExtension } from '../extension';

describe('Editor Change Listener & Main Thread Non-Blocking Guardrails', () => {
  let tmpDir: string;
  let extension: GittedExtension;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-editor-test-'));

    // Create test files
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const targetFile = path.join(srcDir, 'payment-service.ts');
    fs.writeFileSync(
      targetFile,
      `
      // @team Billing Team
      // @owner payment-devs
      // @feature Payment Gateway
      export class PaymentService {}
      `
    );

    extension = new GittedExtension(tmpDir);
    await extension.activate();

    // Pre-populate cache via background indexer
    extension.getIndexer().indexFileAsync(targetFile, 'high');
    await new Promise((res) => setTimeout(res, 250));
  });

  afterEach(() => {
    extension.deactivate();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('MUST NOT call execSync or spawnSync during onDidChangeActiveTextEditor', () => {
    const targetFile = path.join(tmpDir, 'src', 'payment-service.ts');
    const mockEditor = {
      document: {
        fileName: targetFile,
        getText: () => 'export class PaymentService {}',
      },
    };

    // Trigger active editor switch event - will throw if execSync or spawnSync is called
    expect(() => {
      extension.onDidChangeActiveTextEditor(mockEditor);
    }).not.toThrow();
  });

  it('MUST fetch context in less than 5ms and render sidebar Webview HTML', () => {
    const targetFile = path.join(tmpDir, 'src', 'payment-service.ts');
    const mockEditor = {
      document: {
        fileName: targetFile,
        getText: () => 'export class PaymentService {}',
      },
    };

    // Warm-up call
    extension.onDidChangeActiveTextEditor(mockEditor);

    const start = performance.now();
    const context = extension.onDidChangeActiveTextEditor(mockEditor);
    const latency = performance.now() - start;

    // ACCEPTANCE CRITERIA: Sub-5ms context fetch latency
    expect(latency).toBeLessThan(5);
    expect(context).not.toBeNull();
    expect(context?.featureOwnership?.team).toBe('Billing Team');

    // Sidebar Webview rendering check
    const html = extension.getSidebarHtml();
    expect(html).toContain('Billing Team');
    expect(html).toContain('Payment Gateway');
    expect(html).toContain('payment-service.ts');
  });

  it('MUST return immediate non-blocking fallback for unindexed file and enqueue background task', () => {
    const newFile = path.join(tmpDir, 'src', 'unindexed-service.ts');
    fs.writeFileSync(newFile, 'export class UnindexedService {}');

    const mockEditor = {
      document: {
        fileName: newFile,
        getText: () => 'export class UnindexedService {}',
      },
    };

    // Warm-up JIT
    extension.getCache().getFileContext('dummy.ts');

    const start = performance.now();
    const context = extension.onDidChangeActiveTextEditor(mockEditor);
    const latency = performance.now() - start;

    expect(latency).toBeLessThan(5);
    expect(context).not.toBeNull();
    expect(context?.filePath).toBe(newFile);
  });
});
