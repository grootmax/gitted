import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GittedExtension } from '../extension';

describe('Performance & Frame Budget Compliance Benchmarks', () => {
  let tmpDir: string;
  let extension: GittedExtension;
  const filePaths: string[] = [];

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-perf-test-'));

    // Create 50 simulated workspace files
    for (let i = 0; i < 50; i++) {
      const filePath = path.join(tmpDir, `module_${i}.ts`);
      fs.writeFileSync(
        filePath,
        `
        // @team Team_${i % 5}
        // @owner dev_${i}
        // @feature Feature_${i % 10}
        export class Module${i} {
          public run() { return ${i}; }
        }
        `
      );
      filePaths.push(filePath);
    }

    extension = new GittedExtension(tmpDir);
    await extension.activate();

    // Index all 50 files
    for (const file of filePaths) {
      extension.getIndexer().indexFileAsync(file, 'high');
    }

    // Wait for index queue to clear
    await new Promise((res) => setTimeout(res, 600));
  });

  afterEach(() => {
    extension.deactivate();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('MUST process 100 rapid file switches with 100% frame budget compliance (<16ms) and average latency <2ms', () => {
    const latencies: number[] = [];

    // Simulate 100 rapid active editor switches across files
    for (let i = 0; i < 100; i++) {
      const selectedFile = filePaths[i % filePaths.length];
      const mockEditor = {
        document: {
          fileName: selectedFile,
          getText: () => 'content',
        },
      };

      const start = performance.now();
      extension.onDidChangeActiveTextEditor(mockEditor);
      const duration = performance.now() - start;

      latencies.push(duration);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const violations = latencies.filter((l) => l >= 16); // 16ms frame budget threshold

    // SUCCESS METRICS VERIFICATION:
    // 1. Sub-5ms context fetch latency for sidebar panel updates
    // 2. Average latency < 2ms
    // 3. 100% frame budget compliance (<16ms rendering delay)
    expect(avgLatency).toBeLessThan(2.0);
    expect(maxLatency).toBeLessThan(16.0);
    expect(violations.length).toBe(0);
  });
});
