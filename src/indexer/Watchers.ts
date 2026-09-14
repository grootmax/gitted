import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';

export interface WatcherCallbacks {
  onFileChanged: (filePath: string) => void;
  onFileDeleted: (filePath: string) => void;
  onBranchSwitched: (branchName: string) => void;
}

export class WorkspaceWatchers {
  private fileWatcher: chokidar.FSWatcher | null = null;
  private gitWatcher: chokidar.FSWatcher | null = null;
  private workspaceRoot: string;
  private callbacks: WatcherCallbacks;

  constructor(workspaceRoot: string, callbacks: WatcherCallbacks) {
    this.workspaceRoot = workspaceRoot;
    this.callbacks = callbacks;
  }

  public start(): void {
    // Watch workspace source files
    this.fileWatcher = chokidar.watch(this.workspaceRoot, {
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.contextbuilder/**',
        '**/out/**',
        '**/dist/**',
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.fileWatcher
      .on('add', (filePath) => this.callbacks.onFileChanged(filePath))
      .on('change', (filePath) => this.callbacks.onFileChanged(filePath))
      .on('unlink', (filePath) => this.callbacks.onFileDeleted(filePath));

    // Watch .git/HEAD for branch switch events
    const gitHeadPath = path.join(this.workspaceRoot, '.git', 'HEAD');
    if (fs.existsSync(gitHeadPath)) {
      this.gitWatcher = chokidar.watch(gitHeadPath, {
        persistent: true,
        ignoreInitial: true,
      });

      this.gitWatcher.on('change', () => {
        try {
          const headContent = fs.readFileSync(gitHeadPath, 'utf-8').trim();
          const branchMatch = headContent.match(/ref:\s*refs\/heads\/(.+)/);
          const branchName = branchMatch ? branchMatch[1] : 'HEAD';
          this.callbacks.onBranchSwitched(branchName);
        } catch {
          this.callbacks.onBranchSwitched('main');
        }
      });
    }
  }

  public stop(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    if (this.gitWatcher) {
      this.gitWatcher.close();
      this.gitWatcher = null;
    }
  }
}
