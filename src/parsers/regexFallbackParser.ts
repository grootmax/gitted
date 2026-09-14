import { DependencyEdge, FallbackParserOptions, Language } from '../types.js';

export class FallbackTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Regex fallback parsing timed out after ${timeoutMs}ms (ReDoS protection guardrail triggered).`);
    this.name = 'FallbackTimeoutError';
  }
}

export class RegexFallbackParser {
  private readonly defaultTimeoutMs: number;

  constructor(options?: FallbackParserOptions) {
    this.defaultTimeoutMs = options?.timeoutMs ?? 200;
  }

  /**
   * Scans source code using heuristic regexes to extract dependency targets.
   * Guaranteed to complete within timeoutMs or throw FallbackTimeoutError.
   */
  public parse(filePath: string, sourceCode: string, language: Language, options?: FallbackParserOptions): DependencyEdge[] {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();
    const dependencies: DependencyEdge[] = [];
    const seenEdges = new Set<string>();

    const checkTimeout = () => {
      if (Date.now() - startTime > timeoutMs) {
        throw new FallbackTimeoutError(timeoutMs);
      }
    };

    const lines = sourceCode.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      checkTimeout();
      const line = lines[i];
      const lineNumber = i + 1;

      if (!line || line.trim().length === 0) continue;

      if (language === 'javascript' || language === 'typescript' || language === 'unknown') {
        this.extractJavaScriptDependencies(filePath, line, lineNumber, dependencies, seenEdges);
      }
      
      if (language === 'ruby' || language === 'unknown') {
        this.extractRubyDependencies(filePath, line, lineNumber, dependencies, seenEdges);
      }

      if (language === 'java' || language === 'unknown') {
        this.extractJavaDependencies(filePath, line, lineNumber, dependencies, seenEdges);
      }
    }

    return dependencies;
  }

  private addDependency(
    filePath: string,
    target: string,
    type: DependencyEdge['type'],
    rawMatch: string,
    lineNumber: number,
    dependencies: DependencyEdge[],
    seenEdges: Set<string>
  ) {
    const key = `${type}:${target}:${lineNumber}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      dependencies.push({
        source: filePath,
        target,
        type,
        confidence: 'fallback_heuristic',
        rawMatch: rawMatch.trim(),
        lineNumber,
      });
    }
  }

  private extractJavaScriptDependencies(
    filePath: string,
    line: string,
    lineNumber: number,
    dependencies: DependencyEdge[],
    seenEdges: Set<string>
  ) {
    // Standard ES imports: import ... from '...' or import '...'
    const importRegex = /(?:import\s+(?:[\s\w{},*]+\s+from\s+)?['"]([^'"]+)['"])|(?:import\(['"]([^'"]+)['"]\))/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(line)) !== null) {
      const target = match[1] || match[2];
      const type = match[2] ? 'dynamic_import' : 'import';
      if (target) {
        this.addDependency(filePath, target, type, match[0], lineNumber, dependencies, seenEdges);
      }
    }

    // CommonJS require: require('...') or require("...")
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(line)) !== null) {
      if (match[1]) {
        this.addDependency(filePath, match[1], 'require', match[0], lineNumber, dependencies, seenEdges);
      }
    }

    // ES exports: export ... from '...'
    const exportRegex = /export\s+[\s\w{},*]+\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = exportRegex.exec(line)) !== null) {
      if (match[1]) {
        this.addDependency(filePath, match[1], 'export', match[0], lineNumber, dependencies, seenEdges);
      }
    }
  }

  private extractRubyDependencies(
    filePath: string,
    line: string,
    lineNumber: number,
    dependencies: DependencyEdge[],
    seenEdges: Set<string>
  ) {
    // require 'foo' or require "foo"
    const reqRegex = /\brequire\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = reqRegex.exec(line)) !== null) {
      if (match[1]) {
        this.addDependency(filePath, match[1], 'require', match[0], lineNumber, dependencies, seenEdges);
      }
    }

    // require_relative 'foo' or require_relative "foo"
    const reqRelRegex = /\brequire_relative\s+['"]([^'"]+)['"]/g;
    while ((match = reqRelRegex.exec(line)) !== null) {
      if (match[1]) {
        this.addDependency(filePath, match[1], 'require_relative', match[0], lineNumber, dependencies, seenEdges);
      }
    }

    // autoload :Symbol, 'foo' or autoload :Symbol, "foo"
    const autoloadRegex = /\bautoload\s+:\w+,\s*['"]([^'"]+)['"]/g;
    while ((match = autoloadRegex.exec(line)) !== null) {
      if (match[1]) {
        this.addDependency(filePath, match[1], 'autoload', match[0], lineNumber, dependencies, seenEdges);
      }
    }
  }

  private extractJavaDependencies(
    filePath: string,
    line: string,
    lineNumber: number,
    dependencies: DependencyEdge[],
    seenEdges: Set<string>
  ) {
    // import package.Class; or import static package.Class.*;
    const importRegex = /\bimport\s+(?:static\s+)?([\w.*]+);/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(line)) !== null) {
      if (match[1]) {
        this.addDependency(filePath, match[1], 'import', match[0], lineNumber, dependencies, seenEdges);
      }
    }

    // Java Annotation dependency patterns:
    // e.g. @Import(Foo.class), @Use(Bar.class), @Entity, @Component, @Autowired, @Rule, @Test
    const annotationRegex = /@([A-Z]\w*)(?:\(([^)]+)\))?/g;
    while ((match = annotationRegex.exec(line)) !== null) {
      const annotationName = match[1];
      const annotationArgs = match[2];

      if (annotationArgs) {
        // Look for referenced class names inside annotation args, e.g., Foo.class or "target"
        const classRefMatch = annotationArgs.match(/([\w.]+)(?:\.class)?/);
        if (classRefMatch && classRefMatch[1]) {
          const target = classRefMatch[1].replace(/\.class$/, '');
          this.addDependency(filePath, target, 'annotation', match[0], lineNumber, dependencies, seenEdges);
        } else {
          this.addDependency(filePath, annotationName, 'annotation', match[0], lineNumber, dependencies, seenEdges);
        }
      } else {
        this.addDependency(filePath, annotationName, 'annotation', match[0], lineNumber, dependencies, seenEdges);
      }
    }
  }
}
