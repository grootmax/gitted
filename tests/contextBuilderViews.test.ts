import { describe, expect, it } from 'vitest';
import { CodeGraph } from '../src/graph/codeGraph.js';
import { ContextBuilderViewRenderer } from '../src/ui/contextBuilderViews.js';

describe('ContextBuilderViewRenderer UI diagnostic badges', () => {
  const renderer = new ContextBuilderViewRenderer();

  function setupTestGraph(): CodeGraph {
    const graph = new CodeGraph();

    // Degraded file node
    graph.addNode({
      id: 'src/components/DynamicWidget.js',
      filePath: 'src/components/DynamicWidget.js',
      language: 'javascript',
      parse_status: 'degraded_fallback',
      dependencies: [
        {
          source: 'src/components/DynamicWidget.js',
          target: 'src/utils/math.js',
          type: 'dynamic_import',
          confidence: 'fallback_heuristic',
        },
      ],
    });

    // OK dependency node
    graph.addNode({
      id: 'src/utils/math.js',
      filePath: 'src/utils/math.js',
      language: 'javascript',
      parse_status: 'ok',
      dependencies: [],
    });

    // Dependent consumer file
    graph.addNode({
      id: 'src/pages/Dashboard.js',
      filePath: 'src/pages/Dashboard.js',
      language: 'javascript',
      parse_status: 'ok',
      dependencies: [
        {
          source: 'src/pages/Dashboard.js',
          target: 'src/components/DynamicWidget.js',
          type: 'import',
          confidence: 'ast_high',
        },
      ],
    });

    // Related test file
    graph.addNode({
      id: 'tests/components/DynamicWidget.test.js',
      filePath: 'tests/components/DynamicWidget.test.js',
      language: 'javascript',
      parse_status: 'degraded_fallback',
      dependencies: [
        {
          source: 'tests/components/DynamicWidget.test.js',
          target: 'src/components/DynamicWidget.js',
          type: 'require',
          confidence: 'fallback_heuristic',
        },
      ],
    });

    return graph;
  }

  it('renders diagnostic warning badge "Degraded Parse / Fallback Extracted" in Change Radius view', () => {
    const graph = setupTestGraph();
    const result = renderer.renderChangeRadiusView(graph, 'src/components/DynamicWidget.js');

    expect(result.hasDegradedNodes).toBe(true);
    expect(result.degradedNodeCount).toBe(2); // DynamicWidget and test node
    expect(result.summaryWarning).toContain('degraded parse coverage');

    const degradedNode = result.nodes.find((n) => n.nodeId === 'src/components/DynamicWidget.js');
    expect(degradedNode?.badge.badgeText).toBe('Degraded Parse / Fallback Extracted');
    expect(degradedNode?.badge.badgeLevel).toBe('warning');

    const html = ContextBuilderViewRenderer.formatChangeRadiusHTML(result);
    expect(html).toContain('Degraded Parse / Fallback Extracted');
    expect(html).toContain('warning-banner');
  });

  it('renders warning badges in Related Tests view', () => {
    const graph = setupTestGraph();
    const result = renderer.renderRelatedTestsView(graph, 'src/components/DynamicWidget.js');

    expect(result.testFiles).toHaveLength(1);
    expect(result.testFiles[0].filePath).toBe('tests/components/DynamicWidget.test.js');
    expect(result.testFiles[0].badge.badgeText).toBe('Degraded Parse / Fallback Extracted');
    expect(result.hasDegradedNodes).toBe(true);
    expect(result.summaryWarning).toContain('degraded fallback parse coverage');
  });

  it('renders diagnostic warning badge in "Before You Change This" contextual panel', () => {
    const graph = setupTestGraph();
    const result = renderer.renderBeforeYouChangeThisView(graph, 'src/components/DynamicWidget.js');

    expect(result.targetNodeStatus).toBe('degraded_fallback');
    expect(result.targetBadge.badgeText).toBe('Degraded Parse / Fallback Extracted');
    expect(result.hasDegradedDependencies).toBe(true);
    expect(result.contextualWarnings.some((w) => w.includes('DEGRADED PARSE WARNING'))).toBe(true);
  });
});
