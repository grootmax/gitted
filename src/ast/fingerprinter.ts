import * as crypto from 'crypto';
import * as ts from 'typescript';
import { SymbolNode, SymbolKind } from '../types.js';

export interface ASTFingerprintOptions {
  similarityThreshold?: number; // Default 0.75
}

export class ASTFingerprinter {
  private threshold: number;

  constructor(options: ASTFingerprintOptions = {}) {
    this.threshold = options.similarityThreshold ?? 0.75;
  }

  /**
   * Extracts exported functions and classes from code with normalized fingerprints.
   */
  public extractSymbols(filePath: string, code: string): SymbolNode[] {
    if (filePath.endsWith('.ts') || filePath.endsWith('.js') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return this.extractFromTypeScript(filePath, code);
    }
    return this.extractGeneric(filePath, code);
  }

  /**
   * Parse TS/JS source code and extract functions and classes.
   */
  private extractFromTypeScript(filePath: string, code: string): SymbolNode[] {
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
    const symbols: SymbolNode[] = [];

    const visit = (node: ts.Node) => {
      let isExported = false;
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (modifiers) {
        isExported = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      }

      // Check if root level or exported
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.getText(sourceFile);
        const { startLine, endLine } = this.getLineRange(sourceFile, node);
        const normalizedAST = this.normalizeASTNode(node, sourceFile);
        const fingerprint = this.hashString(normalizedAST);

        symbols.push({
          id: `${filePath}:${name}`,
          name,
          filePath,
          kind: 'function',
          fingerprint,
          normalizedAST,
          startLine,
          endLine,
          exported: isExported || node.parent.kind === ts.SyntaxKind.SourceFile,
        });
      } else if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.getText(sourceFile);
        const { startLine, endLine } = this.getLineRange(sourceFile, node);
        const normalizedAST = this.normalizeASTNode(node, sourceFile);
        const fingerprint = this.hashString(normalizedAST);

        symbols.push({
          id: `${filePath}:${name}`,
          name,
          filePath,
          kind: 'class',
          fingerprint,
          normalizedAST,
          startLine,
          endLine,
          exported: isExported || node.parent.kind === ts.SyntaxKind.SourceFile,
        });

        // Also extract class methods
        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = member.name.getText(sourceFile);
            const fullMethodName = `${name}.${methodName}`;
            const range = this.getLineRange(sourceFile, member);
            const normMethod = this.normalizeASTNode(member, sourceFile);
            symbols.push({
              id: `${filePath}:${fullMethodName}`,
              name: fullMethodName,
              filePath,
              kind: 'method',
              fingerprint: this.hashString(normMethod),
              normalizedAST: normMethod,
              startLine: range.startLine,
              endLine: range.endLine,
              exported: isExported,
            });
          }
        });
      } else if (ts.isVariableStatement(node)) {
        // e.g. export const processRefund = () => ...
        const statementExported = isExported;
        node.declarationList.declarations.forEach((declaration) => {
          if (declaration.name && ts.isIdentifier(declaration.name) && declaration.initializer) {
            if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
              const name = declaration.name.getText(sourceFile);
              const { startLine, endLine } = this.getLineRange(sourceFile, node);
              const normalizedAST = this.normalizeASTNode(declaration.initializer, sourceFile);
              const fingerprint = this.hashString(normalizedAST);

              symbols.push({
                id: `${filePath}:${name}`,
                name,
                filePath,
                kind: 'function',
                fingerprint,
                normalizedAST,
                startLine,
                endLine,
                exported: statementExported || node.parent.kind === ts.SyntaxKind.SourceFile,
              });
            }
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return symbols;
  }

  /**
   * Generic fallback extraction for other language extensions (e.g., Python).
   */
  private extractGeneric(filePath: string, code: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];
    const lines = code.split('\n');

    // Simple regex matching for functions / classes
    const funcRegex = /^(?:export\s+)?(?:def|function|class)\s+([A-Za-z0-9_]+)/;

    interface GenericSymbolAcc {
      name: string;
      kind: SymbolKind;
      startLine: number;
      lines: string[];
    }
    let currentSymbol: GenericSymbolAcc | null = null;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const lineNum = index + 1;
      const match = line.match(funcRegex);
      if (match) {
        if (currentSymbol) {
          const bodyCode = currentSymbol.lines.join('\n');
          const normalizedAST = this.normalizeGenericCode(bodyCode);
          symbols.push({
            id: `${filePath}:${currentSymbol.name}`,
            name: currentSymbol.name,
            filePath,
            kind: currentSymbol.kind,
            fingerprint: this.hashString(normalizedAST),
            normalizedAST,
            startLine: currentSymbol.startLine,
            endLine: lineNum - 1,
            exported: true,
          });
        }
        const isClass = line.includes('class ');
        currentSymbol = {
          name: match[1],
          kind: isClass ? 'class' : 'function',
          startLine: lineNum,
          lines: [line],
        };
      } else if (currentSymbol) {
        currentSymbol.lines.push(line);
      }
    }

    if (currentSymbol) {
      const bodyCode = currentSymbol.lines.join('\n');
      const normalizedAST = this.normalizeGenericCode(bodyCode);
      symbols.push({
        id: `${filePath}:${currentSymbol.name}`,
        name: currentSymbol.name,
        filePath,
        kind: currentSymbol.kind,
        fingerprint: this.hashString(normalizedAST),
        normalizedAST,
        startLine: currentSymbol.startLine,
        endLine: lines.length,
        exported: true,
      });
    }

    return symbols;
  }

  /**
   * Normalizes TS/JS AST by replacing parameter & variable identifiers with canonical markers.
   */
  public normalizeASTNode(node: ts.Node, sourceFile: ts.SourceFile): string {
    const paramMap = new Map<string, string>();
    const varMap = new Map<string, string>();
    let paramCounter = 1;
    let varCounter = 1;

    // Collect parameter names first
    const collectParams = (n: ts.Node) => {
      if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
        const paramName = n.name.getText(sourceFile);
        if (!paramMap.has(paramName)) {
          paramMap.set(paramName, `$PARAM_${paramCounter++}`);
        }
      }
      ts.forEachChild(n, collectParams);
    };
    collectParams(node);

    // Build normalized AST token sequence
    const tokens: string[] = [];

    const traverse = (n: ts.Node) => {
      // Ignore comments
      const syntaxKindName = ts.SyntaxKind[n.kind];

      if (ts.isIdentifier(n)) {
        const text = n.getText(sourceFile);
        if (paramMap.has(text)) {
          tokens.push(paramMap.get(text)!);
        } else {
          // Check if variable declaration
          if (n.parent && (ts.isVariableDeclaration(n.parent) || ts.isBindingElement(n.parent)) && n.parent.name === n) {
            if (!varMap.has(text)) {
              varMap.set(text, `$VAR_${varCounter++}`);
            }
          }
          if (varMap.has(text)) {
            tokens.push(varMap.get(text)!);
          } else {
            tokens.push(text);
          }
        }
      } else if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) {
        tokens.push(`LITERAL:${n.kind}`);
      } else {
        tokens.push(syntaxKindName);
        ts.forEachChild(n, traverse);
      }
    };

    traverse(node);
    return tokens.join(' ');
  }

  /**
   * Generic code normalizer (fallback).
   */
  public normalizeGenericCode(code: string): string {
    // Strip comments
    let cleaned = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    cleaned = cleaned.replace(/#.*/g, '');

    // Tokenize
    const rawTokens = cleaned.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || [];
    const identifierMap = new Map<string, string>();
    let varCount = 1;

    const keywords = new Set([
      'function', 'def', 'class', 'if', 'else', 'for', 'while', 'return',
      'const', 'let', 'var', 'import', 'export', 'from', 'async', 'await',
      'try', 'catch', 'throw', 'new', 'self', 'this',
    ]);

    const normalizedTokens = rawTokens.map(tok => {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
        if (keywords.has(tok)) return tok;
        if (!identifierMap.has(tok)) {
          identifierMap.set(tok, `$ID_${varCount++}`);
        }
        return identifierMap.get(tok)!;
      }
      return tok;
    });

    return normalizedTokens.join(' ');
  }

  /**
   * Computes SHA-256 hash of normalized AST.
   */
  public hashString(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Computes structural similarity ratio between two normalized AST representations (0.0 to 1.0).
   */
  public computeSimilarity(normalizedAST1: string, normalizedAST2: string): number {
    if (normalizedAST1 === normalizedAST2) return 1.0;

    const tokens1 = normalizedAST1.split(' ');
    const tokens2 = normalizedAST2.split(' ');

    if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

    // Use Jaccard Similarity on 3-gram sets for structural similarity
    const nGrams1 = this.getNGrams(tokens1, 3);
    const nGrams2 = this.getNGrams(tokens2, 3);

    let intersection = 0;
    const set2 = new Set(nGrams2);

    for (const gram of nGrams1) {
      if (set2.has(gram)) {
        intersection++;
      }
    }

    const union = new Set([...nGrams1, ...nGrams2]).size;
    if (union === 0) return 0.0;

    return intersection / union;
  }

  private getNGrams(tokens: string[], n: number): string[] {
    const grams: string[] = [];
    if (tokens.length < n) {
      grams.push(tokens.join(' '));
      return grams;
    }
    for (let i = 0; i <= tokens.length - n; i++) {
      grams.push(tokens.slice(i, i + n).join(' '));
    }
    return grams;
  }

  /**
   * Checks if two symbol nodes match above similarity threshold.
   */
  public matches(symbol1: SymbolNode, symbol2: SymbolNode): boolean {
    if (symbol1.fingerprint === symbol2.fingerprint) {
      return true;
    }
    const sim = this.computeSimilarity(symbol1.normalizedAST, symbol2.normalizedAST);
    return sim >= this.threshold;
  }

  private getLineRange(sourceFile: ts.SourceFile, node: ts.Node): { startLine: number; endLine: number } {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      startLine: start.line + 1,
      endLine: end.line + 1,
    };
  }
}
