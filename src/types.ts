export type ParseStatus = 'ok' | 'degraded_fallback' | 'parse_failed';

export type Language = 'javascript' | 'typescript' | 'ruby' | 'java' | 'unknown';

export type EdgeConfidence = 'ast_high' | 'fallback_heuristic';

export type DependencyType =
  | 'import'
  | 'require'
  | 'require_relative'
  | 'dynamic_import'
  | 'export'
  | 'annotation'
  | 'autoload';

export interface DependencyEdge {
  source: string;
  target: string;
  type: DependencyType;
  confidence: EdgeConfidence;
  rawMatch?: string;
  lineNumber?: number;
}

export interface ParseErrorDetails {
  filePath: string;
  errorMessage: string;
  line?: number;
  column?: number;
  timestamp: string;
}

export interface CodeGraphNode {
  id: string;
  filePath: string;
  language: Language;
  parse_status: ParseStatus;
  error_details?: ParseErrorDetails;
  dependencies: DependencyEdge[];
  metadata?: Record<string, any>;
}

export interface ViewDiagnosticBadge {
  status: ParseStatus;
  badgeText: string;
  badgeLevel: 'success' | 'warning' | 'error';
  description: string;
}

export interface ChangeRadiusNodeView {
  nodeId: string;
  filePath: string;
  parse_status: ParseStatus;
  badge: ViewDiagnosticBadge;
  distance: number;
  dependencies: string[];
}

export interface ChangeRadiusViewResult {
  targetFile: string;
  nodes: ChangeRadiusNodeView[];
  hasDegradedNodes: boolean;
  degradedNodeCount: number;
  summaryWarning?: string;
}

export interface RelatedTestViewResult {
  targetFile: string;
  testFiles: Array<{
    filePath: string;
    parse_status: ParseStatus;
    badge: ViewDiagnosticBadge;
  }>;
  hasDegradedNodes: boolean;
  summaryWarning?: string;
}

export interface BeforeYouChangeThisViewResult {
  targetFile: string;
  targetNodeStatus: ParseStatus;
  targetBadge: ViewDiagnosticBadge;
  affectedDependents: Array<{
    filePath: string;
    parse_status: ParseStatus;
    badge: ViewDiagnosticBadge;
  }>;
  hasDegradedDependencies: boolean;
  contextualWarnings: string[];
}

export interface ParseResult {
  filePath: string;
  language: Language;
  status: ParseStatus;
  dependencies: DependencyEdge[];
  errorDetails?: ParseErrorDetails;
}

export interface FallbackParserOptions {
  timeoutMs?: number;
}

export * from './types/index';
