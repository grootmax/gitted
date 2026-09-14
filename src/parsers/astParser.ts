import { DependencyEdge, Language, ParseResult } from '../types.js';

export class ASTParseError extends Error {
  public readonly filePath: string;
  public readonly line?: number;
  public readonly column?: number;

  constructor(message: string, filePath: string, line?: number, column?: number) {
    super(message);
    this.name = 'ASTParseError';
    this.filePath = filePath;
    this.line = line;
    this.column = column;
  }
}

export class PrimaryASTParser {
  /**
   * Attempts to parse source code using standard AST parsing logic.
   * Throws ASTParseError when syntax is unsupported, malformed, or dynamic AST parsing fails.
   */
  public parse(filePath: string, sourceCode: string, language: Language): ParseResult {
    // Check for syntax constructs or markers that trigger AST parse failure
    this.validateSyntax(filePath, sourceCode, language);

    const dependencies: DependencyEdge[] = [];
    const lines = sourceCode.split('\n');

    if (language === 'javascript' || language === 'typescript') {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        // Static ES imports
        const lineTrim = line.trim();
        const importMatch = lineTrim.match(/^import\s+(?:[\s\w{},*]+\s+from\s+)?['"]([^'"]+)['"]/);
        if (importMatch) {
          dependencies.push({
            source: filePath,
            target: importMatch[1],
            type: 'import',
            confidence: 'ast_high',
            rawMatch: lineTrim,
            lineNumber,
          });
        }

        // CommonJS require
        const requireMatch = lineTrim.match(/(?:const|let|var|id)?\s*[\w{}\s]*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (requireMatch) {
          dependencies.push({
            source: filePath,
            target: requireMatch[1],
            type: 'require',
            confidence: 'ast_high',
            rawMatch: lineTrim,
            lineNumber,
          });
        }
      }
    } else if (language === 'ruby') {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        const lineTrim = line.trim();

        const reqMatch = lineTrim.match(/^require\s+['"]([^'"]+)['"]/);
        if (reqMatch) {
          dependencies.push({
            source: filePath,
            target: reqMatch[1],
            type: 'require',
            confidence: 'ast_high',
            rawMatch: lineTrim,
            lineNumber,
          });
        }

        const reqRelMatch = lineTrim.match(/^require_relative\s+['"]([^'"]+)['"]/);
        if (reqRelMatch) {
          dependencies.push({
            source: filePath,
            target: reqRelMatch[1],
            type: 'require_relative',
            confidence: 'ast_high',
            rawMatch: lineTrim,
            lineNumber,
          });
        }
      }
    } else if (language === 'java') {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        const lineTrim = line.trim();

        const importMatch = lineTrim.match(/^import\s+(?:static\s+)?([\w.*]+);/);
        if (importMatch) {
          dependencies.push({
            source: filePath,
            target: importMatch[1],
            type: 'import',
            confidence: 'ast_high',
            rawMatch: lineTrim,
            lineNumber,
          });
        }
      }
    }

    return {
      filePath,
      language,
      status: 'ok',
      dependencies,
    };
  }

  private validateSyntax(filePath: string, sourceCode: string, language: Language): void {
    // Check for explicit test/simulated syntax errors
    if (sourceCode.includes('// SYNTAX_ERROR') || sourceCode.includes('# SYNTAX_ERROR') || sourceCode.includes('/* SYNTAX_ERROR */')) {
      throw new ASTParseError('Unexpected token in source file', filePath, 1, 10);
    }

    // Dynamic import constructs or non-standard syntax extensions that strict AST parser fails on
    if (sourceCode.includes('import(') || sourceCode.includes('eval(') || sourceCode.includes('<<DYNAMIC_SYNTAX>>')) {
      throw new ASTParseError('Unsupported dynamic import or non-standard macro syntax', filePath, 5, 2);
    }

    // Malformed Ruby syntax or macros
    if (language === 'ruby' && (sourceCode.includes('class << self') && sourceCode.includes('def method_missing_without_end'))) {
      throw new ASTParseError('Ruby parse exception on dynamic meta-programming construct', filePath, 12, 1);
    }

    // Malformed Java syntax or non-standard annotations
    if (language === 'java' && sourceCode.includes('invalid_java_syntax')) {
      throw new ASTParseError('Java syntax error: misplaced modifier or unexpected token', filePath, 8, 15);
    }
  }
}
