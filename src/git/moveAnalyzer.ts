import { ASTFingerprinter } from '../ast/fingerprinter.js';
import { GraphStore } from '../graph/graphStore.js';
import { SymbolNode, LineageEdge, CommitRecord, LineageEdgeType } from '../types.js';

export interface FileChange {
  oldFilePath?: string;
  newFilePath?: string;
  oldContent?: string;
  newContent?: string;
}

export interface CommitIndexingResult {
  commitHash: string;
  symbolsIndexed: number;
  lineageEdgesCreated: number;
  edges: LineageEdge[];
}

export class GitMoveAnalyzer {
  private fingerprinter: ASTFingerprinter;
  private graphStore: GraphStore;

  constructor(graphStore: GraphStore, fingerprinter?: ASTFingerprinter) {
    this.graphStore = graphStore;
    this.fingerprinter = fingerprinter || new ASTFingerprinter();
  }

  /**
   * Processes a commit with file changes, indexing symbols and detecting relocations/renames/extractions.
   */
  public indexCommit(commit: CommitRecord, fileChanges: FileChange[]): CommitIndexingResult {
    this.graphStore.addCommit(commit);

    const deletedSymbols: SymbolNode[] = [];
    const addedSymbols: SymbolNode[] = [];
    const createdEdges: LineageEdge[] = [];
    let indexedSymbolCount = 0;

    // Phase 1: Extract symbols from old & new content of each changed file
    fileChanges.forEach((change) => {
      let oldFileSymbols: SymbolNode[] = [];
      let newFileSymbols: SymbolNode[] = [];

      if (change.oldFilePath && change.oldContent) {
        oldFileSymbols = this.fingerprinter.extractSymbols(change.oldFilePath, change.oldContent);
      }

      if (change.newFilePath && change.newContent) {
        newFileSymbols = this.fingerprinter.extractSymbols(change.newFilePath, change.newContent);
        newFileSymbols.forEach((sym) => {
          sym.commitHash = commit.commitHash;
          this.graphStore.addSymbol(sym);
          this.graphStore.linkSymbolToCommit(sym.id, commit.commitHash);
          indexedSymbolCount++;
        });
      }

      // If same file path modified, find deleted vs added
      if (change.oldFilePath && change.newFilePath && change.oldFilePath === change.newFilePath) {
        const newSymNames = new Set(newFileSymbols.map(s => s.name));
        const oldSymNames = new Set(oldFileSymbols.map(s => s.name));

        oldFileSymbols.forEach((oldSym) => {
          if (!newSymNames.has(oldSym.name)) {
            deletedSymbols.push(oldSym);
          }
        });

        newFileSymbols.forEach((newSym) => {
          if (!oldSymNames.has(newSym.name)) {
            addedSymbols.push(newSym);
          }
        });
      } else {
        // Different files (renamed file or file deletion / creation)
        deletedSymbols.push(...oldFileSymbols);
        addedSymbols.push(...newFileSymbols);
      }
    });

    // Phase 2: Cross-match deleted symbols with added symbols using AST Fingerprinting
    const matchedAddedIds = new Set<string>();

    deletedSymbols.forEach((delSym) => {
      let bestMatch: SymbolNode | null = null;
      let highestSimilarity = 0;

      addedSymbols.forEach((addSym) => {
        if (matchedAddedIds.has(addSym.id)) return;

        // Calculate similarity
        let similarity = 0;
        if (delSym.fingerprint === addSym.fingerprint) {
          similarity = 1.0;
        } else {
          similarity = this.fingerprinter.computeSimilarity(delSym.normalizedAST, addSym.normalizedAST);
        }

        // Boost similarity score if symbol names match exactly
        if (delSym.name === addSym.name && similarity > 0.5) {
          similarity = Math.min(1.0, similarity + 0.2);
        }

        if (similarity >= 0.75 && similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = addSym;
        }
      });

      if (bestMatch) {
        const target: SymbolNode = bestMatch;
        matchedAddedIds.add(target.id);

        let type: LineageEdgeType = 'MOVE';
        if (delSym.filePath !== target.filePath && delSym.name === target.name) {
          type = 'EXTRACT';
        } else if (delSym.filePath === target.filePath && delSym.name !== target.name) {
          type = 'RENAME';
        }

        const edge: LineageEdge = {
          sourceSymbolId: delSym.id,
          targetSymbolId: target.id,
          commitHash: commit.commitHash,
          confidence: highestSimilarity,
          type,
        };

        this.graphStore.addSymbol(delSym);
        this.graphStore.addLineageEdge(edge);
        createdEdges.push(edge);
      }
    });

    return {
      commitHash: commit.commitHash,
      symbolsIndexed: indexedSymbolCount,
      lineageEdgesCreated: createdEdges.length,
      edges: createdEdges,
    };
  }
}
