import {
  SymbolNode,
  LineageEdge,
  CommitRecord,
  PullRequestRecord,
  IncidentWarning,
  SymbolHistoryResult,
  ContextualWarningResult,
} from '../types.js';

export class GraphStore {
  private symbols: Map<string, SymbolNode> = new Map();
  private lineageEdges: LineageEdge[] = [];
  private commits: Map<string, CommitRecord> = new Map();
  private pullRequests: Map<number, PullRequestRecord> = new Map();
  private incidentWarnings: Map<string, IncidentWarning> = new Map();

  // Mapping symbolId -> Set of commitHashes
  private symbolCommitMap: Map<string, Set<string>> = new Map();

  /**
   * Register or update a symbol in graph store.
   */
  public addSymbol(symbol: SymbolNode): void {
    this.symbols.set(symbol.id, symbol);
  }

  public getSymbol(symbolId: string): SymbolNode | undefined {
    return this.symbols.get(symbolId);
  }

  public getAllSymbols(): SymbolNode[] {
    return Array.from(this.symbols.values());
  }

  public findSymbolsByName(name: string): SymbolNode[] {
    return Array.from(this.symbols.values()).filter(s => s.name === name);
  }

  /**
   * Add a lineage edge connecting source (old) symbol to target (new) symbol.
   */
  public addLineageEdge(edge: LineageEdge): void {
    // Avoid duplicate edges
    const exists = this.lineageEdges.some(
      e => e.sourceSymbolId === edge.sourceSymbolId &&
           e.targetSymbolId === edge.targetSymbolId &&
           e.commitHash === edge.commitHash
    );
    if (!exists) {
      this.lineageEdges.push(edge);
    }
  }

  public getLineageEdges(): LineageEdge[] {
    return [...this.lineageEdges];
  }

  public getLineageEdgesForTarget(targetSymbolId: string): LineageEdge[] {
    return this.lineageEdges.filter(e => e.targetSymbolId === targetSymbolId);
  }

  public getLineageEdgesForSource(sourceSymbolId: string): LineageEdge[] {
    return this.lineageEdges.filter(e => e.sourceSymbolId === sourceSymbolId);
  }

  /**
   * Register a commit record.
   */
  public addCommit(commit: CommitRecord): void {
    this.commits.set(commit.commitHash, commit);
    if (commit.prNumber && !this.pullRequests.has(commit.prNumber)) {
      // Stub PR record if not already added
      this.addPullRequest({
        prNumber: commit.prNumber,
        title: `PR #${commit.prNumber}`,
      });
    }
  }

  public getCommit(commitHash: string): CommitRecord | undefined {
    return this.commits.get(commitHash);
  }

  /**
   * Link a symbol to a commit.
   */
  public linkSymbolToCommit(symbolId: string, commitHash: string): void {
    if (!this.symbolCommitMap.has(symbolId)) {
      this.symbolCommitMap.set(symbolId, new Set());
    }
    this.symbolCommitMap.get(symbolId)!.add(commitHash);
  }

  /**
   * Register a pull request record.
   */
  public addPullRequest(pr: PullRequestRecord): void {
    this.pullRequests.set(pr.prNumber, pr);
  }

  public getPullRequest(prNumber: number): PullRequestRecord | undefined {
    return this.pullRequests.get(prNumber);
  }

  /**
   * Register an incident warning against a symbol.
   */
  public addIncidentWarning(warning: IncidentWarning): void {
    this.incidentWarnings.set(warning.id, warning);
  }

  /**
   * Traverses backward through lineage edges to find all ancestor symbols.
   * Returns ordered list from oldest ancestor to current symbol.
   */
  public getAncestryChain(symbolId: string): SymbolNode[] {
    const chain: SymbolNode[] = [];
    const visited = new Set<string>();

    const traverseBackwards = (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const incomingEdges = this.getLineageEdgesForTarget(currentId);
      for (const edge of incomingEdges) {
        traverseBackwards(edge.sourceSymbolId);
      }

      const sym = this.getSymbol(currentId);
      if (sym) {
        chain.push(sym);
      } else {
        // Fallback placeholder node if symbol metadata wasn't fully indexed
        const [filePath, symbolName] = currentId.split(':');
        chain.push({
          id: currentId,
          name: symbolName || currentId,
          filePath: filePath || currentId,
          kind: 'function',
          fingerprint: '',
          normalizedAST: '',
          startLine: 0,
          endLine: 0,
        });
      }
    };

    traverseBackwards(symbolId);
    return chain;
  }

  /**
   * Traverses symbol lineage backwards to compile full historical timeline
   * including legacy PRs, original design decisions, and past incident fixes.
   */
  public getHistoricalContext(symbolId: string): SymbolHistoryResult {
    const ancestry = this.getAncestryChain(symbolId);
    const currentSym = ancestry[ancestry.length - 1] || { id: symbolId, name: symbolId.split(':')[1] || symbolId, filePath: symbolId.split(':')[0] || '' };

    const lineageChain = ancestry.map((sym) => {
      const incoming = this.getLineageEdgesForTarget(sym.id);
      return {
        symbolId: sym.id,
        filePath: sym.filePath,
        symbolName: sym.name,
        commitHash: incoming.length > 0 ? incoming[0].commitHash : sym.commitHash,
      };
    });

    const commitHashes = new Set<string>();
    const prNumbers = new Set<number>();
    const incidents: IncidentWarning[] = [];

    ancestry.forEach((sym) => {
      // Collect commits directly linked
      const commitsForSym = this.symbolCommitMap.get(sym.id);
      if (commitsForSym) {
        commitsForSym.forEach(hash => commitHashes.add(hash));
      }
      if (sym.commitHash) {
        commitHashes.add(sym.commitHash);
      }

      // Collect incident warnings
      this.incidentWarnings.forEach((warning) => {
        if (warning.symbolId === sym.id) {
          incidents.push(warning);
          if (warning.commitHash) commitHashes.add(warning.commitHash);
          if (warning.prNumber) prNumbers.add(warning.prNumber);
        }
      });
    });

    // Also collect commits from lineage edges
    this.lineageEdges.forEach((edge) => {
      if (ancestry.some(s => s.id === edge.targetSymbolId || s.id === edge.sourceSymbolId)) {
        if (edge.commitHash) commitHashes.add(edge.commitHash);
      }
    });

    const commitsList: CommitRecord[] = [];
    commitHashes.forEach((hash) => {
      const c = this.commits.get(hash);
      if (c) {
        commitsList.push(c);
        if (c.prNumber) prNumbers.add(c.prNumber);
      }
    });

    // Sort commits chronologically by date if available, or maintain order
    commitsList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const prsList: PullRequestRecord[] = [];
    prNumbers.forEach((prNum) => {
      const pr = this.pullRequests.get(prNum);
      if (pr) prsList.push(pr);
    });

    return {
      symbolId,
      currentLocation: {
        filePath: currentSym.filePath,
        symbolName: currentSym.name,
      },
      lineageChain,
      commits: commitsList,
      pullRequests: prsList,
      incidentWarnings: incidents,
    };
  }

  /**
   * Compiles "Before You Change This" contextual warnings by traversing symbol lineage.
   */
  public getContextualWarnings(symbolId: string): ContextualWarningResult {
    const ancestry = this.getAncestryChain(symbolId);
    const currentSym = ancestry[ancestry.length - 1];

    const warningsList: ContextualWarningResult['warnings'] = [];

    ancestry.forEach((sym) => {
      this.incidentWarnings.forEach((warning) => {
        if (warning.symbolId === sym.id) {
          warningsList.push({
            warningId: warning.id,
            title: warning.title,
            description: warning.description,
            severity: warning.severity || 'high',
            sourceSymbolId: sym.id,
            sourceFilePath: sym.filePath,
            prNumber: warning.prNumber,
            commitHash: warning.commitHash,
          });
        }
      });
    });

    return {
      symbolId,
      filePath: currentSym ? currentSym.filePath : symbolId.split(':')[0],
      symbolName: currentSym ? currentSym.name : symbolId.split(':')[1],
      warnings: warningsList,
    };
  }
}
