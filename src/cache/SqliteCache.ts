import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  FileContext,
  GitMetadata,
  FeatureOwnership,
  PRInfo,
  CommitInfo,
  RelatedTest,
  ADRWarning,
  ASTNodeSummary,
  DbSchemaContext,
} from '../types/index';

export interface SqliteCacheOptions {
  dbPath?: string;
  workspaceRoot?: string;
  readonly?: boolean;
}

export class SqliteCache {
  private db: Database.Database;
  private dbPath: string;
  private isReadOnly: boolean;

  // Prepared statements for high performance
  private stmtGetFileContext: Database.Statement | null = null;
  private stmtUpsertFileContext: Database.Statement | null = null;
  private stmtDeleteFileContext: Database.Statement | null = null;
  private stmtGetGitMeta: Database.Statement | null = null;
  private stmtUpsertGitMeta: Database.Statement | null = null;

  constructor(options: SqliteCacheOptions = {}) {
    const workspaceRoot = options.workspaceRoot || process.cwd();
    if (options.dbPath) {
      this.dbPath = options.dbPath;
    } else {
      const contextDir = path.join(workspaceRoot, '.contextbuilder');
      if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
      }
      this.dbPath = path.join(contextDir, 'cache.db');
    }

    // Ensure parent dir exists
    const parentDir = path.dirname(this.dbPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    this.isReadOnly = !!options.readonly;
    this.db = new Database(this.dbPath, {
      readonly: this.isReadOnly,
      fileMustExist: false,
    });

    // Enable WAL mode for fast concurrent operations if writable
    if (!this.isReadOnly) {
      try {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
      } catch (err) {
        // Fallback gracefully if WAL fails (e.g., read-only filesystem)
      }
      this.runMigrations();
    }

    this.prepareStatements();
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const currentVersionRow = this.db
      .prepare('SELECT MAX(version) as version FROM schema_migrations')
      .get() as { version: number | null };

    const currentVersion = currentVersionRow?.version || 0;

    if (currentVersion < 1) {
      this.db.exec(`
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS file_context (
          file_path TEXT PRIMARY KEY,
          feature_ownership TEXT,
          pr_history TEXT,
          commit_history TEXT,
          related_tests TEXT,
          adr_warnings TEXT,
          ast_summary TEXT,
          db_schema_context TEXT,
          last_indexed_at INTEGER NOT NULL,
          content_hash TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_file_context_indexed_at ON file_context(last_indexed_at);

        CREATE TABLE IF NOT EXISTS git_metadata (
          branch TEXT PRIMARY KEY,
          last_commit_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cache_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        INSERT INTO schema_migrations (version, applied_at) VALUES (1, ${Date.now()});

        COMMIT;
      `);
    }
  }

  private prepareStatements(): void {
    try {
      this.stmtGetFileContext = this.db.prepare(
        'SELECT * FROM file_context WHERE file_path = ?'
      );
      this.stmtGetGitMeta = this.db.prepare(
        'SELECT * FROM git_metadata WHERE branch = ?'
      );

      if (!this.isReadOnly) {
        this.stmtUpsertFileContext = this.db.prepare(`
          INSERT INTO file_context (
            file_path, feature_ownership, pr_history, commit_history,
            related_tests, adr_warnings, ast_summary, db_schema_context,
            last_indexed_at, content_hash
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          ON CONFLICT(file_path) DO UPDATE SET
            feature_ownership = excluded.feature_ownership,
            pr_history = excluded.pr_history,
            commit_history = excluded.commit_history,
            related_tests = excluded.related_tests,
            adr_warnings = excluded.adr_warnings,
            ast_summary = excluded.ast_summary,
            db_schema_context = excluded.db_schema_context,
            last_indexed_at = excluded.last_indexed_at,
            content_hash = excluded.content_hash;
        `);

        this.stmtDeleteFileContext = this.db.prepare(
          'DELETE FROM file_context WHERE file_path = ?'
        );

        this.stmtUpsertGitMeta = this.db.prepare(`
          INSERT INTO git_metadata (branch, last_commit_hash, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(branch) DO UPDATE SET
            last_commit_hash = excluded.last_commit_hash,
            updated_at = excluded.updated_at;
        `);
      }
    } catch (err) {
      // Prepared statements error handling
    }
  }

  /**
   * Fast read-only context lookup for active editor changes (<2ms execution).
   */
  public getFileContext(filePath: string): FileContext | null {
    if (!this.stmtGetFileContext) {
      this.stmtGetFileContext = this.db.prepare(
        'SELECT * FROM file_context WHERE file_path = ?'
      );
    }

    const row = this.stmtGetFileContext.get(filePath) as any;
    if (!row) {
      return null;
    }

    return {
      filePath: row.file_path,
      featureOwnership: row.feature_ownership
        ? (JSON.parse(row.feature_ownership) as FeatureOwnership)
        : undefined,
      prHistory: row.pr_history ? (JSON.parse(row.pr_history) as PRInfo[]) : [],
      commitHistory: row.commit_history
        ? (JSON.parse(row.commit_history) as CommitInfo[])
        : [],
      relatedTests: row.related_tests
        ? (JSON.parse(row.related_tests) as RelatedTest[])
        : [],
      adrWarnings: row.adr_warnings
        ? (JSON.parse(row.adr_warnings) as ADRWarning[])
        : [],
      astSummary: row.ast_summary
        ? (JSON.parse(row.ast_summary) as ASTNodeSummary)
        : undefined,
      dbSchemaContext: row.db_schema_context
        ? (JSON.parse(row.db_schema_context) as DbSchemaContext)
        : undefined,
      lastIndexedAt: row.last_indexed_at,
      contentHash: row.content_hash || undefined,
    };
  }

  /**
   * Upsert pre-computed context entry (called by background worker).
   */
  public upsertFileContext(context: FileContext): void {
    if (this.isReadOnly) {
      throw new Error('Cannot write to read-only SQLite database.');
    }
    if (!this.stmtUpsertFileContext) {
      this.prepareStatements();
    }

    this.stmtUpsertFileContext!.run(
      context.filePath,
      context.featureOwnership ? JSON.stringify(context.featureOwnership) : null,
      JSON.stringify(context.prHistory || []),
      JSON.stringify(context.commitHistory || []),
      JSON.stringify(context.relatedTests || []),
      JSON.stringify(context.adrWarnings || []),
      context.astSummary ? JSON.stringify(context.astSummary) : null,
      context.dbSchemaContext ? JSON.stringify(context.dbSchemaContext) : null,
      context.lastIndexedAt || Date.now(),
      context.contentHash || null
    );
  }

  public removeFileContext(filePath: string): void {
    if (this.isReadOnly) return;
    if (!this.stmtDeleteFileContext) {
      this.stmtDeleteFileContext = this.db.prepare(
        'DELETE FROM file_context WHERE file_path = ?'
      );
    }
    this.stmtDeleteFileContext.run(filePath);
  }

  public getGitMetadata(branch: string): GitMetadata | null {
    if (!this.stmtGetGitMeta) {
      this.stmtGetGitMeta = this.db.prepare(
        'SELECT * FROM git_metadata WHERE branch = ?'
      );
    }
    const row = this.stmtGetGitMeta.get(branch) as any;
    if (!row) return null;
    return {
      branch: row.branch,
      lastCommitHash: row.last_commit_hash,
      updatedAt: row.updated_at,
    };
  }

  public upsertGitMetadata(metadata: GitMetadata): void {
    if (this.isReadOnly) return;
    if (!this.stmtUpsertGitMeta) {
      this.prepareStatements();
    }
    this.stmtUpsertGitMeta!.run(
      metadata.branch,
      metadata.lastCommitHash,
      metadata.updatedAt
    );
  }

  public getDbSizeBytes(): number {
    try {
      if (fs.existsSync(this.dbPath)) {
        return fs.statSync(this.dbPath).size;
      }
    } catch {
      // Ignore
    }
    return 0;
  }

  public getIndexedFileCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM file_context')
      .get() as { cnt: number };
    return row?.cnt || 0;
  }

  /**
   * Enforces lightweight storage (<50MB max per repo) with automatic cleanup & vacuum.
   */
  public enforceMaxDatabaseSize(maxSizeBytes: number = 50 * 1024 * 1024): boolean {
    if (this.isReadOnly) return false;
    const currentSize = this.getDbSizeBytes();
    if (currentSize > maxSizeBytes) {
      // Delete oldest 20% of indexed records
      this.db.exec(`
        DELETE FROM file_context
        WHERE file_path IN (
          SELECT file_path FROM file_context
          ORDER BY last_indexed_at ASC
          LIMIT (SELECT COUNT(*) / 5 FROM file_context)
        );
      `);
      this.db.exec('VACUUM;');
      return true;
    }
    return false;
  }

  public clearCache(): void {
    if (this.isReadOnly) return;
    this.db.exec('DELETE FROM file_context; DELETE FROM git_metadata;');
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore
    }
  }
}
