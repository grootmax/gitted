import { CodeGraphNode, ParseStatus } from '../types.js';

export class CodeGraph {
  private nodes: Map<string, CodeGraphNode> = new Map();

  public addNode(node: CodeGraphNode): void {
    // If node already exists with higher confidence / AST 'ok' status, do not overwrite with degraded unless explicit
    const existing = this.nodes.get(node.id);
    if (existing && existing.parse_status === 'ok' && node.parse_status !== 'ok') {
      return;
    }
    this.nodes.set(node.id, node);
  }

  public getNode(id: string): CodeGraphNode | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): CodeGraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Returns direct dependencies target IDs for a given node.
   */
  public getDependencies(id: string): string[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.dependencies.map((dep) => dep.target);
  }

  /**
   * Returns all nodes that directly import or require the specified target ID.
   */
  public getDependents(id: string): string[] {
    const dependents: string[] = [];
    for (const [nodeId, node] of this.nodes.entries()) {
      if (nodeId === id) continue;
      const references = node.dependencies.some(
        (dep) => dep.target === id || dep.target.endsWith(id) || id.endsWith(dep.target)
      );
      if (references) {
        dependents.push(nodeId);
      }
    }
    return dependents;
  }

  /**
   * Calculates the Change Radius for a file node up to maxDepth.
   * Traverses dependents (files that depend on the target file) and dependencies.
   */
  public getChangeRadius(targetFile: string, maxDepth: number = 3): {
    nodeId: string;
    filePath: string;
    parse_status: ParseStatus;
    distance: number;
    dependencies: string[];
  }[] {
    const visited = new Map<string, number>();
    const queue: { id: string; depth: number }[] = [{ id: targetFile, depth: 0 }];
    visited.set(targetFile, 0);

    const result: {
      nodeId: string;
      filePath: string;
      parse_status: ParseStatus;
      distance: number;
      dependencies: string[];
    }[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth > maxDepth) continue;

      const node = this.nodes.get(current.id);
      const parse_status = node ? node.parse_status : 'ok';
      const deps = node ? node.dependencies.map((d) => d.target) : [];

      result.push({
        nodeId: current.id,
        filePath: node?.filePath || current.id,
        parse_status,
        distance: current.depth,
        dependencies: deps,
      });

      if (current.depth < maxDepth) {
        // Collect dependents and dependencies
        const neighbors = new Set<string>([
          ...this.getDependents(current.id),
          ...this.getDependencies(current.id),
        ]);

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.set(neighbor, current.depth + 1);
            queue.push({ id: neighbor, depth: current.depth + 1 });
          }
        }
      }
    }

    return result;
  }
}
