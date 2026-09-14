import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { PRInfo, CommitInfo, GitMetadata } from '../../types';

const execAsync = promisify(exec);

export interface GitParseResult {
  prHistory: PRInfo[];
  commitHistory: CommitInfo[];
  currentBranch?: string;
  headHash?: string;
}

export async function parseGitAsync(
  filePath: string,
  workspaceRoot: string
): Promise<GitParseResult> {
  try {
    const relativePath = path.relative(workspaceRoot, filePath) || filePath;

    // Asynchronously fetch last 5 commits for file
    const logPromise = execAsync(
      `git log -n 5 --pretty=format:"%H|%an|%s|%ad" --date=short -- "${relativePath}"`,
      { cwd: workspaceRoot, timeout: 5000 }
    ).catch(() => ({ stdout: '' }));

    // Asynchronously fetch current branch & commit hash
    const branchPromise = execAsync(
      `git rev-parse --abbrev-ref HEAD`,
      { cwd: workspaceRoot, timeout: 3000 }
    ).catch(() => ({ stdout: 'main' }));

    const headPromise = execAsync(
      `git rev-parse HEAD`,
      { cwd: workspaceRoot, timeout: 3000 }
    ).catch(() => ({ stdout: 'head' }));

    const [logRes, branchRes, headRes] = await Promise.all([
      logPromise,
      branchPromise,
      headPromise,
    ]);

    const commits: CommitInfo[] = [];
    const prs: PRInfo[] = [];
    const prMap = new Set<string>();

    if (logRes.stdout) {
      const lines = logRes.stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        const [hash, author, message, date] = line.split('|');
        if (hash) {
          commits.push({
            hash: hash.trim().slice(0, 7),
            author: author?.trim() || 'Unknown',
            message: message?.trim() || 'Update file',
            date: date?.trim() || new Date().toISOString().slice(0, 10),
          });

          // Check if commit message references PR (e.g., #123 or Merge pull request #123)
          const prMatch = message?.match(/#(\d+)/);
          if (prMatch && prMatch[1] && !prMap.has(prMatch[1])) {
            const prId = prMatch[1];
            prMap.add(prId);
            prs.push({
              id: `#${prId}`,
              title: message.trim(),
              author: author?.trim() || 'developer',
              date: date?.trim() || new Date().toISOString().slice(0, 10),
              url: `https://github.com/pull/${prId}`,
            });
          }
        }
      }
    }

    const currentBranch = branchRes.stdout?.trim() || 'main';
    const headHash = headRes.stdout?.trim() || '';

    return {
      prHistory: prs,
      commitHistory: commits,
      currentBranch,
      headHash,
    };
  } catch (error) {
    return {
      prHistory: [],
      commitHistory: [],
    };
  }
}

export async function getCurrentGitBranchAsync(
  workspaceRoot: string
): Promise<GitMetadata> {
  try {
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: workspaceRoot,
      timeout: 3000,
    });
    const { stdout: hash } = await execAsync('git rev-parse HEAD', {
      cwd: workspaceRoot,
      timeout: 3000,
    });

    return {
      branch: branch.trim() || 'main',
      lastCommitHash: hash.trim() || 'head',
      updatedAt: Date.now(),
    };
  } catch {
    return {
      branch: 'main',
      lastCommitHash: 'head',
      updatedAt: Date.now(),
    };
  }
}
