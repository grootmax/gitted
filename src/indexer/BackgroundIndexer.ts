import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { SqliteCache } from '../cache/SqliteCache';
import { TaskQueue, TaskItem } from './TaskQueue';
import { WorkspaceWatchers } from './Watchers';
import { parseAstAsync } from './parsers/astParser';
import { parseGitAsync, getCurrentGitBranchAsync } from './parsers/gitParser';
import { parseAdrAsync } from './parsers/adrParser';
import { mapRelatedTestsAsync } from './parsers/testMapper';
import { FileContext } from '../types';

export interface BackgroundIndexerOptions {
  workspaceRoot: string;
  sqliteCache?: SqliteCache;
  dbPath?: string;
  enableWatchers?: boolean;
}

export class BackgroundIndexer {
  private workspaceRoot: string;
  private sqliteCache: SqliteCache;
  private taskQueue: TaskQueue;
  private watchers: WorkspaceWatchers | null = null;

  constructor(options: BackgroundIndexerOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.sqliteCache =
      options.sqliteCache ||
      new SqliteCache({
        workspaceRoot: this.workspaceRoot,
        dbPath: options.dbPath,
      });

    this.taskQueue = new TaskQueue({
      concurrency: 1,
      throttleIntervalMs: 15, // Yields execution to keep CPU usage <15%
    });

    this.taskQueue.setProcessor(this.processFileTask.bind(this));

    if (options.enableWatchers !== false) {
      this.watchers = new WorkspaceWatchers(this.workspaceRoot, {
        onFileChanged: (filePath) => this.indexFileAsync(filePath, 'high'),
        onFileDeleted: (filePath) => this.handleFileDeleted(filePath),
        onBranchSwitched: (branchName) => this.handleBranchSwitched(branchName),
      });
    }
  }

  public async start(): Promise<void> {
    if (this.watchers) {
      this.watchers.start();
    }
    // Update branch metadata asynchronously
    const gitMeta = await getCurrentGitBranchAsync(this.workspaceRoot);
    this.sqliteCache.upsertGitMetadata(gitMeta);
  }

  public indexFileAsync(
    filePath: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    content?: string
  ): void {
    // Only index code files
    const ext = path.extname(filePath).toLowerCase();
    const validExts = ['.ts', '.js', '.tsx', '.jsx', '.json', '.py', '.go', '.rs', '.java'];
    if (!validExts.includes(ext) && !filePath.endsWith('.md')) {
      return;
    }

    this.taskQueue.enqueue(filePath, priority, content);
  }

  private async processFileTask(item: TaskItem): Promise<void> {
    const filePath = item.filePath;
    try {
      const fileContent =
        item.content !== undefined
          ? item.content
          : fs.existsSync(filePath)
          ? fs.readFileSync(filePath, 'utf-8')
          : '';

      const contentHash = crypto.createHash('md5').update(fileContent).digest('hex');

      // Check if file is unchanged based on content hash and already in cache
      const existingContext = this.sqliteCache.getFileContext(filePath);
      if (existingContext && existingContext.contentHash === contentHash && item.priority !== 'high') {
        return; // Cache hit, no re-indexing needed
      }

      // Execute off-thread async parsers concurrently
      const [astResult, gitResult, adrWarnings, relatedTests] = await Promise.all([
        parseAstAsync(filePath, fileContent),
        parseGitAsync(filePath, this.workspaceRoot),
        parseAdrAsync(filePath, this.workspaceRoot, fileContent),
        mapRelatedTestsAsync(filePath, this.workspaceRoot),
      ]);

      const context: FileContext = {
        filePath,
        featureOwnership: astResult.featureOwnership,
        prHistory: gitResult.prHistory,
        commitHistory: gitResult.commitHistory,
        relatedTests,
        adrWarnings,
        astSummary: astResult.astSummary,
        dbSchemaContext: astResult.dbSchemaContext,
        lastIndexedAt: Date.now(),
        contentHash,
      };

      // Store pre-computed context into SQLite cache
      this.sqliteCache.upsertFileContext(context);

      // Enforce lightweight SQLite cache (<50MB limit)
      this.sqliteCache.enforceMaxDatabaseSize();
    } catch (err) {
      // Error handling for background index task
    }
  }

  private handleFileDeleted(filePath: string): void {
    this.sqliteCache.removeFileContext(filePath);
  }

  private async handleBranchSwitched(branchName: string): Promise<void> {
    const gitMeta = await getCurrentGitBranchAsync(this.workspaceRoot);
    this.sqliteCache.upsertGitMetadata(gitMeta);

    // Scan workspace files and enqueue re-index at low priority
    this.scanWorkspaceAndQueue('low');
  }

  public scanWorkspaceAndQueue(priority: 'normal' | 'low' = 'low'): void {
    try {
      const scanDir = (dirPath: string) => {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'out' &&
            entry.name !== 'dist'
          ) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            this.indexFileAsync(fullPath, priority);
          }
        }
      };

      scanDir(this.workspaceRoot);
    } catch {
      // Ignore scan errors
    }
  }

  public get pendingTasks(): number {
    return this.taskQueue.pendingCount;
  }

  public getCache(): SqliteCache {
    return this.sqliteCache;
  }

  public stop(): void {
    if (this.watchers) {
      this.watchers.stop();
    }
    this.taskQueue.clear();
  }
}
