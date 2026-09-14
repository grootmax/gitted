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

export type SymbolKind = 'function' | 'class' | 'method';

export interface SymbolNode {
  id: string; // e.g., "checkout-service.ts:processRefund"
  name: string;
  filePath: string;
  kind: SymbolKind;
  fingerprint: string;
  normalizedAST: string;
  startLine: number;
  endLine: number;
  commitHash?: string;
  exported?: boolean;
}

export type LineageEdgeType = 'MOVE' | 'RENAME' | 'EXTRACT';

export interface LineageEdge {
  sourceSymbolId: string; // Old location
  targetSymbolId: string; // New location
  commitHash: string;
  confidence: number; // 0.0 to 1.0
  type: LineageEdgeType;
}

export interface CommitRecord {
  commitHash: string;
  author: string;
  date: string;
  message: string;
  prNumber?: number;
}

export interface PullRequestRecord {
  prNumber: number;
  title: string;
  body?: string;
  mergedAt?: string;
  designDecisions?: string[];
}

export interface IncidentWarning {
  id: string;
  symbolId: string;
  commitHash?: string;
  prNumber?: number;
  title: string;
  description: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface SymbolHistoryResult {
  symbolId: string;
  currentLocation: {
    filePath: string;
    symbolName: string;
  };
  lineageChain: Array<{
    symbolId: string;
    filePath: string;
    symbolName: string;
    commitHash?: string;
  }>;
  commits: CommitRecord[];
  pullRequests: PullRequestRecord[];
  incidentWarnings: IncidentWarning[];
}

export interface ContextualWarningResult {
  symbolId: string;
  filePath: string;
  symbolName: string;
  warnings: Array<{
    warningId: string;
    title: string;
    description: string;
    severity: string;
    sourceSymbolId: string;
    sourceFilePath: string;
    prNumber?: number;
    commitHash?: string;
  }>;
}

export interface FingerprintMatchResult {
  similarity: number;
  matched: boolean;
}
