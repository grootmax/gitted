import { CodeGraph } from '../graph/codeGraph.js';
import { isSourceFile } from '../indexer/parsers/testMapper.js';
import {
  BeforeYouChangeThisViewResult,
  ChangeRadiusViewResult,
  ParseStatus,
  RelatedTestViewResult,
  ViewDiagnosticBadge,
} from '../types.js';

export class ContextBuilderViewRenderer {
  public static getDiagnosticBadge(status: ParseStatus): ViewDiagnosticBadge {
    switch (status) {
      case 'ok':
        return {
          status: 'ok',
          badgeText: 'Parse OK',
          badgeLevel: 'success',
          description: 'Full AST parsed with high confidence.',
        };
      case 'degraded_fallback':
        return {
          status: 'degraded_fallback',
          badgeText: 'Degraded Parse / Fallback Extracted',
          badgeLevel: 'warning',
          description: 'AST parse failed. Dependency edges recovered via regex heuristic scanner.',
        };
      case 'parse_failed':
        return {
          status: 'parse_failed',
          badgeText: 'Parse Failed',
          badgeLevel: 'error',
          description: 'Primary AST and fallback regex parsing both failed to parse source.',
        };
    }
  }

  /**
   * Renders the Change Radius view for a file node.
   */
  public renderChangeRadiusView(
    graph: CodeGraph,
    targetFile: string,
    maxDepth: number = 3
  ): ChangeRadiusViewResult {
    const rawNodes = graph.getChangeRadius(targetFile, maxDepth);

    const nodes = rawNodes.map((rn) => ({
      nodeId: rn.nodeId,
      filePath: rn.filePath,
      parse_status: rn.parse_status,
      badge: ContextBuilderViewRenderer.getDiagnosticBadge(rn.parse_status),
      distance: rn.distance,
      dependencies: rn.dependencies,
    }));

    const degradedNodeCount = nodes.filter(
      (n) => n.parse_status === 'degraded_fallback' || n.parse_status === 'parse_failed'
    ).length;

    const hasDegradedNodes = degradedNodeCount > 0;
    const summaryWarning = hasDegradedNodes
      ? `Warning: ${degradedNodeCount} node(s) in Change Radius have degraded parse coverage. Graph edges were recovered using fallback heuristic scanning.`
      : undefined;

    return {
      targetFile,
      nodes,
      hasDegradedNodes,
      degradedNodeCount,
      summaryWarning,
    };
  }

  /**
   * Renders the Related Tests view for a target file.
   */
  public renderRelatedTestsView(graph: CodeGraph, targetFile: string): RelatedTestViewResult {
    if (!isSourceFile(targetFile)) {
      return {
        targetFile,
        testFiles: [],
        hasDegradedNodes: false,
        summaryWarning: undefined,
      };
    }

    const dependents = graph.getDependents(targetFile);
    const allNodes = graph.getAllNodes();

    const isTestFile = (path: string) =>
      /\.(test|spec)\.(js|ts|jsx|tsx)$/i.test(path) ||
      /_spec\.rb$/i.test(path) ||
      /Test\.java$/i.test(path) ||
      path.includes('/test/') ||
      path.includes('/spec/');

    // Find test files that depend on targetFile or vice versa
    const testFilesMap = new Map<string, ParseStatus>();

    for (const depId of dependents) {
      if (isTestFile(depId)) {
        const node = graph.getNode(depId);
        testFilesMap.set(depId, node ? node.parse_status : 'ok');
      }
    }

    // Also check if any test node in graph has dependency on targetFile
    for (const node of allNodes) {
      if (isTestFile(node.filePath)) {
        if (node.dependencies.some((d) => d.target === targetFile || targetFile.endsWith(d.target))) {
          testFilesMap.set(node.filePath, node.parse_status);
        }
      }
    }

    const testFiles = Array.from(testFilesMap.entries()).map(([filePath, parse_status]) => ({
      filePath,
      parse_status,
      badge: ContextBuilderViewRenderer.getDiagnosticBadge(parse_status),
    }));

    const hasDegradedNodes = testFiles.some(
      (tf) => tf.parse_status === 'degraded_fallback' || tf.parse_status === 'parse_failed'
    );

    const summaryWarning = hasDegradedNodes
      ? 'Warning: One or more related test files rely on degraded fallback parse coverage.'
      : undefined;

    return {
      targetFile,
      testFiles,
      hasDegradedNodes,
      summaryWarning,
    };
  }

  /**
   * Renders the "Before You Change This" contextual warning view.
   */
  public renderBeforeYouChangeThisView(
    graph: CodeGraph,
    targetFile: string
  ): BeforeYouChangeThisViewResult {
    const targetNode = graph.getNode(targetFile);
    const targetNodeStatus = targetNode ? targetNode.parse_status : 'ok';
    const targetBadge = ContextBuilderViewRenderer.getDiagnosticBadge(targetNodeStatus);

    const dependentIds = graph.getDependents(targetFile);
    const affectedDependents = dependentIds.map((depId) => {
      const depNode = graph.getNode(depId);
      const status = depNode ? depNode.parse_status : 'ok';
      return {
        filePath: depId,
        parse_status: status,
        badge: ContextBuilderViewRenderer.getDiagnosticBadge(status),
      };
    });

    const hasDegradedTarget = targetNodeStatus !== 'ok';
    const hasDegradedDependents = affectedDependents.some((d) => d.parse_status !== 'ok');
    const hasDegradedDependencies = hasDegradedTarget || hasDegradedDependents;

    const contextualWarnings: string[] = [];

    if (hasDegradedTarget) {
      contextualWarnings.push(
        `⚠️ DEGRADED PARSE WARNING: Primary AST parsing failed for target file '${targetFile}'. Fallback regex scanning extracted dependencies. Graph radius coverage may be incomplete.`
      );
    }

    for (const dep of affectedDependents) {
      if (dep.parse_status === 'degraded_fallback') {
        contextualWarnings.push(
          `⚠️ DEGRADED DEPENDENT WARNING: Affected dependent '${dep.filePath}' uses fallback regex extraction [${dep.badge.badgeText}].`
        );
      }
    }

    if (affectedDependents.length > 0) {
      contextualWarnings.push(
        `Modifying '${targetFile}' will directly impact ${affectedDependents.length} downstream component(s).`
      );
    }

    return {
      targetFile,
      targetNodeStatus,
      targetBadge,
      affectedDependents,
      hasDegradedDependencies,
      contextualWarnings,
    };
  }

  /**
   * Formats the view result into an HTML / UI component fragment.
   */
  public static formatChangeRadiusHTML(result: ChangeRadiusViewResult): string {
    const warningHeader = result.hasDegradedNodes
      ? `<div class="warning-banner" data-testid="degraded-warning-banner">
          <span class="warning-icon">⚠️</span> ${result.summaryWarning}
         </div>`
      : '';

    const nodesList = result.nodes
      .map(
        (n) => `<li class="node-item ${n.parse_status}" data-node-id="${n.nodeId}">
        <span class="file-path">${n.filePath}</span>
        <span class="badge badge-${n.badge.badgeLevel}" data-testid="parse-status-badge">${n.badge.badgeText}</span>
       </li>`
      )
      .join('\n');

    return `<div class="change-radius-container">
      ${warningHeader}
      <ul class="radius-node-list">
        ${nodesList}
      </ul>
    </div>`;
  }
}
