import { SourceFile, ImportRelation, FileGraphNode } from './types.js';

/**
 * DependencyGraph indexes source files and import relationships,
 * and dynamically calculates in-degree fan-out for each file.
 */
export class DependencyGraph {
  private nodes: Map<string, FileGraphNode> = new Map();

  /**
   * Helper to resolve or derive a domain module from a file path.
   * e.g., 'src/features/checkout/components/Cart.tsx' -> 'checkout'
   * 'src/services/payments/api.ts' -> 'payments'
   * 'src/utils/http.ts' -> 'shared:utils'
   */
  public deriveDomainModule(filePath: string, explicitDomainModule?: string): string {
    if (explicitDomainModule) {
      return explicitDomainModule;
    }
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    
    // Check common patterns like src/features/<feature>/... or src/modules/<module>/...
    const featureIdx = parts.findIndex(p => p === 'features' || p === 'modules' || p === 'domains');
    if (featureIdx !== -1 && featureIdx + 1 < parts.length) {
      return parts[featureIdx + 1];
    }

    // Check directory under src/ e.g. src/checkout/...
    if (parts.length >= 3 && parts[0] === 'src' && !['utils', 'common', 'shared', 'core', 'db', 'lib'].includes(parts[1])) {
      return parts[1];
    }

    // Default domain module based on top-level or subfolder
    if (parts.length > 1) {
      return parts.slice(0, parts.length - 1).join('/');
    }
    return 'default';
  }

  /**
   * Register a source file into the graph.
   */
  public addFile(file: SourceFile | string): FileGraphNode {
    const path = typeof file === 'string' ? file : file.path;
    const domainModule = typeof file === 'string' ? this.deriveDomainModule(file) : this.deriveDomainModule(file.path, file.domainModule);

    let node = this.nodes.get(path);
    if (!node) {
      node = {
        path,
        domainModule,
        importingFiles: new Set<string>(),
        importingDomainModules: new Set<string>(),
        importedFiles: new Set<string>(),
      };
      this.nodes.set(path, node);
    } else {
      node.domainModule = domainModule;
    }
    return node;
  }

  /**
   * Register an import relationship between sourcePath (importing) and targetPath (imported).
   */
  public addImport(relation: ImportRelation): void {
    const sourceNode = this.addFile(relation.sourcePath);
    const targetNode = this.addFile(relation.targetPath);

    // source imports target
    sourceNode.importedFiles.add(targetNode.path);

    // target is imported by source
    targetNode.importingFiles.add(sourceNode.path);
    if (sourceNode.domainModule) {
      targetNode.importingDomainModules.add(sourceNode.domainModule);
    }
  }

  /**
   * Bulk add files and imports.
   */
  public buildIndex(files: (SourceFile | string)[], imports: ImportRelation[]): void {
    for (const file of files) {
      this.addFile(file);
    }
    for (const rel of imports) {
      this.addImport(rel);
    }
  }

  /**
   * Get graph node for a file.
   */
  public getNode(path: string): FileGraphNode | undefined {
    return this.nodes.get(path);
  }

  /**
   * Get in-degree reference fan-out for a file.
   * Returns the count of independent importing modules / files.
   */
  public getFanOut(path: string): number {
    const node = this.nodes.get(path);
    if (!node) return 0;
    
    // Fan-out is the max of independent domain modules or total importing files
    const domainModuleCount = node.importingDomainModules.size;
    const fileCount = node.importingFiles.size;
    return Math.max(domainModuleCount, fileCount);
  }

  /**
   * Get count of independent domain modules importing a file.
   */
  public getDomainModuleFanOut(path: string): number {
    const node = this.nodes.get(path);
    if (!node) return 0;
    return node.importingDomainModules.size;
  }

  /**
   * Get all registered file paths.
   */
  public getAllPaths(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Clear the graph to prevent memory leaks in long-running processes.
   */
  public clear(): void {
    this.nodes.clear();
  }
}
