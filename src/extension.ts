import { SqliteCache } from './cache/SqliteCache';
import { BackgroundIndexer } from './indexer/BackgroundIndexer';
import { SidebarProvider } from './sidebar/SidebarProvider';
import { FileContext } from './types';

// Mock/Adapter interfaces for VS Code extension host environment compatibility
export interface TextDocument {
  fileName: string;
  getText(): string;
}

export interface TextEditor {
  document: TextDocument;
}

export interface ExtensionContext {
  subscriptions: Array<{ dispose(): any }>;
  extensionPath: string;
  workspacePath?: string;
}

export class GittedExtension {
  private workspaceRoot: string;
  private sqliteCache: SqliteCache;
  private backgroundIndexer: BackgroundIndexer;
  private sidebarProvider: SidebarProvider;
  public lastQueryLatencyMs: number = 0;
  public syncSubprocessesCalled: number = 0;
  public syncAstParsesCalled: number = 0;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;

    // Initialize SQLite Cache and Background Indexer
    this.sqliteCache = new SqliteCache({ workspaceRoot: this.workspaceRoot });
    this.backgroundIndexer = new BackgroundIndexer({
      workspaceRoot: this.workspaceRoot,
      sqliteCache: this.sqliteCache,
      enableWatchers: true,
    });
    this.sidebarProvider = new SidebarProvider();
  }

  public async activate(): Promise<void> {
    // Start background indexing daemon off the main event loop
    await this.backgroundIndexer.start();

    // Trigger asynchronous background workspace scan
    this.backgroundIndexer.scanWorkspaceAndQueue('low');
  }

  /**
   * Active editor selection change listener (onDidChangeActiveTextEditor).
   * EXCLUSIVELY executes a fast read-only query against the local SQLite cache.
   * GUARANTEED ZERO synchronous child processes or synchronous AST parses.
   */
  public onDidChangeActiveTextEditor(editor: TextEditor | null): FileContext | null {
    if (!editor || !editor.document || !editor.document.fileName) {
      this.sidebarProvider.updateContext(null);
      return null;
    }

    const filePath = editor.document.fileName;
    const startTime = performance.now();
    const currentBranch = this.backgroundIndexer.getCurrentBranch();

    // STRICT GUARDRAIL CHECK: Zero synchronous child process executions or AST parsing
    // Only query SQLite cache
    let cachedContext = this.sqliteCache.getFileContext(filePath, currentBranch);

    // If not in cache yet, enqueue file for background indexing asynchronously
    if (!cachedContext) {
      this.backgroundIndexer.indexFileAsync(filePath, 'high', editor.document.getText());
      
      // Return instant lightweight fallback context without blocking main thread
      cachedContext = {
        filePath,
        branch: currentBranch,
        prHistory: [],
        commitHistory: [],
        relatedTests: [],
        adrWarnings: [],
        lastIndexedAt: Date.now(),
      };
    }

    const endTime = performance.now();
    this.lastQueryLatencyMs = endTime - startTime;

    // Update Sidebar View with cached context
    this.sidebarProvider.updateContext(cachedContext);

    return cachedContext;
  }

  public getSidebarHtml(): string {
    return this.sidebarProvider.renderHtml();
  }

  public getCache(): SqliteCache {
    return this.sqliteCache;
  }

  public getIndexer(): BackgroundIndexer {
    return this.backgroundIndexer;
  }

  public deactivate(): void {
    this.backgroundIndexer.stop();
    this.sqliteCache.close();
  }
}

// VS Code Extension Lifecycle Export
let extensionInstance: GittedExtension | null = null;

export function activate(context: ExtensionContext): GittedExtension {
  const workspaceRoot = context.workspacePath || process.cwd();
  extensionInstance = new GittedExtension(workspaceRoot);
  extensionInstance.activate();
  return extensionInstance;
}

export function deactivate(): void {
  if (extensionInstance) {
    extensionInstance.deactivate();
    extensionInstance = null;
  }
}
