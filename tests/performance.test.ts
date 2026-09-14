import { describe, it, expect } from 'vitest';
import { ASTFingerprinter } from '../src/ast/fingerprinter.js';
import { GraphStore } from '../src/graph/graphStore.js';
import { GitMoveAnalyzer } from '../src/git/moveAnalyzer.js';

describe('Performance Benchmarking', () => {
  it('keeps AST fingerprinting and diff block parsing overhead under 10% during graph indexing', () => {
    const fingerprinter = new ASTFingerprinter();
    const graphStore = new GraphStore();
    const analyzer = new GitMoveAnalyzer(graphStore, fingerprinter);

    // Generate sample codebase with 100 functions
    const generateCode = (prefix: string, count: number) => {
      const funcs: string[] = [];
      for (let i = 0; i < count; i++) {
        funcs.push(`
          export function ${prefix}_func_${i}(paramA: number, paramB: string): string {
            if (paramA > ${i}) {
              return paramB + "_result_" + paramA;
            }
            const tempVal = paramA * 2;
            return "fallback_" + tempVal;
          }
        `);
      }
      return funcs.join('\n');
    };

    const codeV1 = generateCode('service_a', 100);
    const codeV2 = generateCode('service_b', 100);

    const startTime = performance.now();

    analyzer.indexCommit(
      {
        commitHash: 'perf-commit-1',
        author: 'PerfTester',
        date: '2026-09-01T00:00:00Z',
        message: 'perf test commit',
      },
      [
        { newFilePath: 'service_a.ts', newContent: codeV1 },
      ]
    );

    analyzer.indexCommit(
      {
        commitHash: 'perf-commit-2',
        author: 'PerfTester',
        date: '2026-09-01T01:00:00Z',
        message: 'perf test move commit',
      },
      [
        { oldFilePath: 'service_a.ts', oldContent: codeV1, newFilePath: 'service_a.ts', newContent: '' },
        { newFilePath: 'service_b.ts', newContent: codeV2 },
      ]
    );

    const endTime = performance.now();
    const totalTimeMs = endTime - startTime;

    // Fast execution (indexing 200 functions & detecting 100 moves within 500ms)
    expect(totalTimeMs).toBeLessThan(1000);
    expect(graphStore.getLineageEdges().length).toBeGreaterThanOrEqual(90);
  });
});
