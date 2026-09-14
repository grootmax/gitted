import { beforeEach, describe, expect, test } from 'vitest';
import { DependencyGraph } from '../src/graph.js';
import { ScoringEngine } from '../src/scorer.js';
import { FeatureDefinition } from '../src/types.js';

describe('ScoringEngine & Fan-Out Dampening', () => {
  let graph: DependencyGraph;
  let scorer: ScoringEngine;

  beforeEach(() => {
    graph = new DependencyGraph();
    scorer = new ScoringEngine();
  });

  const checkoutFeature: FeatureDefinition = {
    id: 'checkout',
    name: 'Checkout Domain Feature',
    pathPatterns: ['src/features/checkout/*', 'checkout/*'],
  };

  test('Requirement 1 & Acceptance Criterion 1: >10 independent domain modules trigger dynamic score dampening', () => {
    const sharedUtil = 'src/utils/http.ts';
    graph.addFile(sharedUtil);

    // Register 12 independent domain modules importing the shared utility
    const domains = [
      'checkout', 'payments', 'search', 'user', 'cart',
      'inventory', 'shipping', 'recommendations', 'auth',
      'notifications', 'catalog', 'analytics'
    ];

    for (const domain of domains) {
      const importingFile = `src/features/${domain}/api.ts`;
      graph.addFile({ path: importingFile, domainModule: domain });
      graph.addImport({ sourcePath: importingFile, targetPath: sharedUtil });
    }

    const fanOut = graph.getFanOut(sharedUtil);
    expect(fanOut).toBe(12);
    expect(fanOut).toBeGreaterThan(10);

    const scoreResult = scorer.calculateScore(sharedUtil, checkoutFeature, graph);

    // Fan-out dampening factor = 1 / log2(12 + 1) = 1 / log2(13) ~ 0.27024
    const expectedDampeningFactor = 1 / Math.log2(13);
    expect(scoreResult.breakdown.fanOut).toBe(12);
    expect(scoreResult.breakdown.fanOutDampeningFactor).toBeCloseTo(expectedDampeningFactor, 4);

    // Effective import score = 15 * 0.27024 ~ 4.0536
    expect(scoreResult.breakdown.effectiveImportScore).toBeCloseTo(15 * expectedDampeningFactor, 4);
  });

  test('Fan-out <= 10 does not trigger dampening (dampening factor = 1.0)', () => {
    const domainUtil = 'src/features/checkout/utils/calc.ts';
    graph.addFile(domainUtil);

    // 5 importing files
    for (let i = 1; i <= 5; i++) {
      const source = `src/features/checkout/step${i}.ts`;
      graph.addImport({ sourcePath: source, targetPath: domainUtil });
    }

    const fanOut = graph.getFanOut(domainUtil);
    expect(fanOut).toBe(5);

    const scoreResult = scorer.calculateScore(domainUtil, checkoutFeature, graph);
    expect(scoreResult.breakdown.fanOutDampeningFactor).toBe(1.0);
    expect(scoreResult.breakdown.effectiveImportScore).toBe(15);
  });

  test('Requirement 3 & Acceptance Criterion 2: Shallow shared directories apply path depth weighting and remain suppressed (<30 threshold)', () => {
    const sharedUtil = 'src/utils/http.ts';
    graph.addFile(sharedUtil);

    // 12 modules importing sharedUtil
    for (let i = 1; i <= 12; i++) {
      const source = `src/features/domain${i}/index.ts`;
      graph.addImport({ sourcePath: source, targetPath: sharedUtil });
    }

    const utilFeature: FeatureDefinition = {
      id: 'utils',
      name: 'Utility Feature',
      pathPatterns: ['src/utils/*'],
    };

    const scoreResult = scorer.calculateScore(sharedUtil, utilFeature, graph);

    // Shallow path weight = 0.25 (basePathMatch = 40 * 0.25 = 10)
    expect(scoreResult.breakdown.pathDepthWeight).toBe(0.25);
    expect(scoreResult.breakdown.effectivePathMatchScore).toBe(10);

    // Total score = 10 + 0 = 10 < 30 threshold
    expect(scoreResult.score).toBeLessThan(30);
    expect(scoreResult.suppressed).toBe(true);
  });

  test('Explicit developer tag (+50) bypasses fan-out dampening and path depth weighting', () => {
    const sharedUtil = 'src/utils/http.ts';
    graph.addFile(sharedUtil);

    // checkout feature imports sharedUtil
    graph.addImport({ sourcePath: 'src/features/checkout/index.ts', targetPath: sharedUtil });

    for (let i = 1; i <= 12; i++) {
      const source = `src/features/domain${i}/index.ts`;
      graph.addImport({ sourcePath: source, targetPath: sharedUtil });
    }

    const taggedCheckoutFeature: FeatureDefinition = {
      ...checkoutFeature,
      tags: ['checkout-tag'],
    };

    // Score with tag
    const scoreResult = scorer.calculateScore(
      sharedUtil,
      taggedCheckoutFeature,
      graph,
      ['checkout-tag']
    );

    expect(scoreResult.breakdown.explicitTagScore).toBe(50);
    expect(scoreResult.breakdown.bypassedDampening).toBe(true);
    expect(scoreResult.breakdown.pathDepthWeight).toBe(1.0);
    expect(scoreResult.breakdown.fanOutDampeningFactor).toBe(1.0);

    // Total score = 50 + 0 (path match) + 15 (import without dampening) = 65
    expect(scoreResult.score).toBe(65);
    expect(scoreResult.score).toBeGreaterThanOrEqual(30);
    expect(scoreResult.suppressed).toBe(false);
  });

  test('Explicit path declarations in feature definition bypass shallow path depth dampening', () => {
    const explicitFeature: FeatureDefinition = {
      id: 'migration-feat',
      name: 'Migration Feature',
      explicitPaths: ['db/migrations/001_init.sql'],
    };

    const filePath = 'db/migrations/001_init.sql';
    graph.addFile(filePath);

    const scoreResult = scorer.calculateScore(filePath, explicitFeature, graph);

    expect(scoreResult.breakdown.bypassedDampening).toBe(true);
    expect(scoreResult.breakdown.effectivePathMatchScore).toBe(40); // Not reduced to 10
  });
});
