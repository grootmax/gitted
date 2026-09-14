import { beforeEach, describe, expect, test } from 'vitest';
import { DependencyGraph } from '../src/graph.js';
import { ScoringEngine } from '../src/scorer.js';
import { ChangeRadiusAnalyzer } from '../src/changeRadius.js';
import { FeatureDefinition } from '../src/types.js';

describe('ChangeRadiusAnalyzer & Context Builder PR Analysis', () => {
  let graph: DependencyGraph;
  let scorer: ScoringEngine;
  let features: FeatureDefinition[];

  beforeEach(() => {
    graph = new DependencyGraph();
    scorer = new ScoringEngine();

    features = [
      { id: 'checkout', name: 'Checkout', pathPatterns: ['src/features/checkout/*'] },
      { id: 'payments', name: 'Payments', pathPatterns: ['src/features/payments/*'] },
      { id: 'search', name: 'Search', pathPatterns: ['src/features/search/*'] },
    ];
  });

  test('Shared utility modification generates suppressed associations for unrelated features', () => {
    const sharedUtil = 'src/utils/http.ts';
    graph.addFile(sharedUtil);

    // 15 domain modules import http.ts
    for (let i = 1; i <= 15; i++) {
      const source = `src/features/domain${i}/api.ts`;
      graph.addImport({ sourcePath: source, targetPath: sharedUtil });
    }

    // Also checkout and payments import http.ts
    graph.addImport({ sourcePath: 'src/features/checkout/service.ts', targetPath: sharedUtil });
    graph.addImport({ sourcePath: 'src/features/payments/service.ts', targetPath: sharedUtil });

    const analyzer = new ChangeRadiusAnalyzer(graph, scorer, features);
    const analysis = analyzer.analyze([sharedUtil]);

    expect(analysis.modifiedFiles).toContain(sharedUtil);
    expect(analysis.executionTimeMs).toBeLessThan(50);

    // Because http.ts is a shallow utility with fan-out = 17 (> 10),
    // scores for checkout, payments, search should all be suppressed (<30)
    expect(analysis.activeAssociations.length).toBe(0);
    expect(analysis.suppressedAssociations.length).toBeGreaterThan(0);
  });

  test('Domain feature specific file change produces active high-confidence associations', () => {
    const checkoutFile = 'src/features/checkout/components/CheckoutButton.tsx';
    graph.addFile(checkoutFile);

    const analyzer = new ChangeRadiusAnalyzer(graph, scorer, features);
    const analysis = analyzer.analyze([checkoutFile]);

    // Path match (+40) >= threshold (30) -> Active association!
    expect(analysis.activeAssociations.length).toBe(1);
    expect(analysis.activeAssociations[0].featureId).toBe('checkout');
    expect(analysis.activeAssociations[0].suppressed).toBe(false);
  });
});
