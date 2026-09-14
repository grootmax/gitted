import { GraphStore } from '../graph/graphStore.js';
import { SymbolHistoryResult, ContextualWarningResult } from '../types.js';

export class ContextBuilder {
  private graphStore: GraphStore;

  constructor(graphStore: GraphStore) {
    this.graphStore = graphStore;
  }

  /**
   * Retrieves full chronological timeline of a symbol, including legacy PRs, original design decisions,
   * and past incident fixes across file renames and module extractions.
   */
  public getSymbolHistory(symbolId: string): SymbolHistoryResult {
    return this.graphStore.getHistoricalContext(symbolId);
  }

  /**
   * Presents "Before You Change This" contextual warnings for a symbol, including edge-case fixes
   * introduced in earlier PRs before code was relocated.
   */
  public getBeforeYouChangeThisWarnings(symbolId: string): ContextualWarningResult {
    return this.graphStore.getContextualWarnings(symbolId);
  }
}
