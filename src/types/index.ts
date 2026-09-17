export interface FeatureOwnership {
  team: string;
  owner: string;
  feature: string;
}

export interface PRInfo {
  id: string;
  title: string;
  author: string;
  date: string;
  url?: string;
}

export interface CommitInfo {
  hash: string;
  author: string;
  message: string;
  date: string;
}

export interface RelatedTest {
  file: string;
  testName: string;
  suite?: string;
}

export interface ADRWarning {
  id: string;
  title: string;
  status: string;
  warning: string;
  filePath?: string;
  needsAttention?: boolean;
  hasAdrDocs?: boolean;
}

export interface ASTNodeSummary {
  functions: string[];
  classes: string[];
  exports: string[];
  imports: string[];
}

export interface DbSchemaContext {
  tables: string[];
  models: string[];
  ddlOperations?: { operation: 'CREATE' | 'ALTER' | 'DROP'; table: string }[];
}

export interface FileContext {
  filePath: string;
  branch?: string;
  featureOwnership?: FeatureOwnership;
  prHistory: PRInfo[];
  commitHistory: CommitInfo[];
  relatedTests: RelatedTest[];
  adrWarnings: ADRWarning[];
  astSummary?: ASTNodeSummary;
  dbSchemaContext?: DbSchemaContext;
  lastIndexedAt: number;
  contentHash?: string;
}

export interface GitMetadata {
  branch: string;
  lastCommitHash: string;
  updatedAt: number;
}

export interface IndexerStats {
  totalIndexedFiles: number;
  dbSizeBytes: number;
  lastIndexDurationMs: number;
}
