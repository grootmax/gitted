import { describe, expect, test } from 'vitest';
import { DependencyGraph } from '../src/graph.js';
import { ScoringEngine } from '../src/scorer.js';
import { ChangeRadiusAnalyzer } from '../src/changeRadius.js';
import { FeatureDefinition } from '../src/types.js';

describe('Performance & Benchmark Tests', () => {
  test('Graph indexing and change radius evaluation completes strictly under 50ms', () => {
    const graph = new DependencyGraph();
    const scorer = new ScoringEngine();

    // Create 20 domain features
    const features: FeatureDefinition[] = [];
    for (let f = 1; f <= 20; f++) {
      features.push({
        id: `feature_${f}`,
        name: `Domain Feature ${f}`,
        pathPatterns: [`src/features/feature_${f}/*`],
      });
    }

    // Index 500 files and thousands of import relationships
    const sharedUtilities = [
      'src/utils/http.ts',
      'src/utils/logger.ts',
      'src/utils/storage.ts',
      'db/migrations/001_initial.sql',
      'src/common/config.ts',
    ];

    for (const util of sharedUtilities) {
      graph.addFile(util);
    }

    for (let f = 1; f <= 20; f++) {
      for (let fileIdx = 1; fileIdx <= 25; fileIdx++) {
        const filePath = `src/features/feature_${f}/file_${fileIdx}.ts`;
        graph.addFile({ path: filePath, domainModule: `feature_${f}` });

        // Connect to shared utilities
        for (const util of sharedUtilities) {
          graph.addImport({ sourcePath: filePath, targetPath: util });
        }
      }
    }

    // Analyze changeset containing 5 modified files
    const modifiedFiles = [
      'src/utils/http.ts',
      'src/features/feature_1/file_1.ts',
      'src/features/feature_2/file_5.ts',
      'db/migrations/001_initial.sql',
      'src/common/config.ts',
    ];

    const analyzer = new ChangeRadiusAnalyzer(graph, scorer, features);

    // Warm up V8 JIT & cache before recording benchmark execution time
    analyzer.analyze([modifiedFiles[0]]);

    const start = performance.now();
    const result = analyzer.analyze(modifiedFiles);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50); // Requirement: maintain graph calculation latency under 50ms
    expect(result.executionTimeMs).toBeLessThan(50);
    expect(result.fileResults.length).toBe(5);
  });

  test('Repeated analyses do not cause memory leaks or excessive heap growth', () => {
    const graph = new DependencyGraph();
    const scorer = new ScoringEngine();

    const features: FeatureDefinition[] = [
      { id: 'feat1', name: 'Feature 1', pathPatterns: ['src/feat1/*'] },
    ];

    for (let i = 0; i < 100; i++) {
      graph.addImport({
        sourcePath: `src/feat1/file_${i}.ts`,
        targetPath: 'src/utils/http.ts',
      });
    }

    const analyzer = new ChangeRadiusAnalyzer(graph, scorer, features);

    if (global.gc) {
      global.gc();
    }
    const initialMemory = process.memoryUsage().heapUsed;

    for (let iter = 0; iter < 100; iter++) {
      analyzer.analyze(['src/utils/http.ts']);
    }

    if (global.gc) {
      global.gc();
    }
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDiffMb = (finalMemory - initialMemory) / (1024 * 1024);

    // Assert heap growth is minimal (< 5MB)
    expect(memoryDiffMb).toBeLessThan(5);
  });
});
