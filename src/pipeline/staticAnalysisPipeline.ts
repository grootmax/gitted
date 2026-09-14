import { ASTParseError, PrimaryASTParser } from '../parsers/astParser.js';
import { FallbackTimeoutError, RegexFallbackParser } from '../parsers/regexFallbackParser.js';
import { CodeGraphNode, FallbackParserOptions, Language, ParseErrorDetails, ParseResult, ParseStatus } from '../types.js';

export interface FileAnalysisInput {
  filePath: string;
  sourceCode: string;
  language?: Language;
}

export class StaticAnalysisPipeline {
  private astParser: PrimaryASTParser;
  private fallbackParser: RegexFallbackParser;
  private errorLogs: ParseErrorDetails[] = [];

  constructor(options?: FallbackParserOptions) {
    this.astParser = new PrimaryASTParser();
    this.fallbackParser = new RegexFallbackParser(options);
  }

  /**
   * Processes a single file. Catches primary AST parser exceptions gracefully
   * without aborting repository indexing or dropping the file node.
   */
  public analyzeFile(input: FileAnalysisInput): CodeGraphNode {
    const language = input.language || this.detectLanguage(input.filePath);
    let parseStatus: ParseStatus = 'ok';
    let dependencies: CodeGraphNode['dependencies'] = [];
    let errorDetails: ParseErrorDetails | undefined;

    try {
      // 1. Attempt Primary AST Parse
      const astResult = this.astParser.parse(input.filePath, input.sourceCode, language);
      dependencies = astResult.dependencies;
      parseStatus = 'ok';
    } catch (err: any) {
      // Catch uncaught AST parser exception gracefully
      const timestamp = new Date().toISOString();
      const line = err instanceof ASTParseError ? err.line : undefined;
      const column = err instanceof ASTParseError ? err.column : undefined;

      errorDetails = {
        filePath: input.filePath,
        errorMessage: err.message || 'Unknown AST parse exception',
        line,
        column,
        timestamp,
      };

      this.logError(errorDetails);

      // 2. Invoke Regex Fallback Parser
      try {
        const fallbackEdges = this.fallbackParser.parse(input.filePath, input.sourceCode, language);
        dependencies = fallbackEdges;
        parseStatus = 'degraded_fallback';
      } catch (fallbackErr: any) {
        // Fallback parser failed or timed out
        parseStatus = 'parse_failed';
        errorDetails.errorMessage += ` | Fallback error: ${fallbackErr.message}`;
      }
    }

    return {
      id: input.filePath,
      filePath: input.filePath,
      language,
      parse_status: parseStatus,
      error_details: errorDetails,
      dependencies,
    };
  }

  /**
   * Processes a batch of repository files without aborting on individual failures.
   */
  public analyzeRepository(files: FileAnalysisInput[]): CodeGraphNode[] {
    return files.map((file) => this.analyzeFile(file));
  }

  public getErrorLogs(): ParseErrorDetails[] {
    return [...this.errorLogs];
  }

  public clearLogs(): void {
    this.errorLogs = [];
  }

  private logError(details: ParseErrorDetails): void {
    this.errorLogs.push(details);
    console.warn(`[Pipeline] AST Parse Warning [${details.filePath}]: ${details.errorMessage} (line ${details.line ?? '?'}, col ${details.column ?? '?'})`);
  }

  private detectLanguage(filePath: string): Language {
    if (/\.(mjs|cjs|js|jsx|ts|tsx)$/i.test(filePath)) return 'javascript';
    if (/\.rb$/i.test(filePath)) return 'ruby';
    if (/\.java$/i.test(filePath)) return 'java';
    return 'unknown';
  }
}
