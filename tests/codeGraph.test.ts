import { describe, expect, it } from 'vitest';
import { CodeGraph } from '../src/graph/codeGraph.js';
import { CodeGraphNode } from '../src/types.js';

describe('CodeGraph', () => {
  it('stores parse_status metadata and graph node dependencies', () => {
    const graph = new CodeGraph();

    const nodeA: CodeGraphNode = {
      id: 'src/A.js',
      filePath: 'src/A.js',
      language: 'javascript',
      parse_status: 'degraded_fallback',
      dependencies: [
        {
          source: 'src/A.js',
          target: 'src/B.js',
          type: 'require',
          confidence: 'fallback_heuristic',
        },
      ],
    };

    const nodeB: CodeGraphNode = {
      id: 'src/B.js',
      filePath: 'src/B.js',
      language: 'javascript',
      parse_status: 'ok',
      dependencies: [],
    };

    graph.addNode(nodeA);
    graph.addNode(nodeB);

    expect(graph.getNode('src/A.js')?.parse_status).toBe('degraded_fallback');
    expect(graph.getNode('src/B.js')?.parse_status).toBe('ok');
    expect(graph.getDependencies('src/A.js')).toEqual(['src/B.js']);
    expect(graph.getDependents('src/B.js')).toEqual(['src/A.js']);
  });

  it('computes Change Radius traversal containing parse status for all nodes', () => {
    const graph = new CodeGraph();

    graph.addNode({
      id: 'src/core.js',
      filePath: 'src/core.js',
      language: 'javascript',
      parse_status: 'degraded_fallback',
      dependencies: [{ source: 'src/core.js', target: 'src/utils.js', type: 'import', confidence: 'fallback_heuristic' }],
    });

    graph.addNode({
      id: 'src/utils.js',
      filePath: 'src/utils.js',
      language: 'javascript',
      parse_status: 'ok',
      dependencies: [],
    });

    graph.addNode({
      id: 'src/app.js',
      filePath: 'src/app.js',
      language: 'javascript',
      parse_status: 'ok',
      dependencies: [{ source: 'src/app.js', target: 'src/core.js', type: 'import', confidence: 'ast_high' }],
    });

    const radius = graph.getChangeRadius('src/core.js', 2);
    expect(radius).toHaveLength(3);

    const coreNode = radius.find((r) => r.nodeId === 'src/core.js');
    expect(coreNode?.parse_status).toBe('degraded_fallback');
    expect(coreNode?.distance).toBe(0);
  });
});
