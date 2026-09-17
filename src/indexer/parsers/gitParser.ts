import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
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

    let logOutput = logRes.stdout;
    if (!logOutput) {
      // Fallback to repository-wide git log if file-specific git log is empty
      const repoLog = await execAsync(
        `git log -n 5 --pretty=format:"%H|%an|%s|%ad" --date=short`,
        { cwd: workspaceRoot, timeout: 3000 }
      ).catch(() => ({ stdout: '' }));
      logOutput = repoLog.stdout;
    }

    if (logOutput) {
      const lines = logOutput.split('\n').filter(Boolean);
      for (const line of lines) {
        const [hash, author, message, date] = line.split('|');
        if (hash) {
          const shortHash = hash.trim().slice(0, 7);
          commits.push({
            hash: shortHash,
            author: author?.trim() || 'Unknown',
            message: message?.trim() || 'Update file',
            date: date?.trim() || new Date().toISOString().slice(0, 10),
            url: `https://github.com/commit/${shortHash}`,
          });

          // Check if commit message references PR using expanded patterns
          const prPatterns = [
            /#(\d+)/,
            /PR[- #]?(\d+)/i,
            /pull request #?(\d+)/i,
            /merge.*#?(\d+)/i,
            /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#?(\d+)/i,
          ];
          let foundPrId: string | null = null;
          for (const pattern of prPatterns) {
            const match = message?.match(pattern);
            if (match && match[1]) {
              foundPrId = match[1];
              break;
            }
          }

          if (foundPrId && !prMap.has(foundPrId)) {
            prMap.add(foundPrId);
            prs.push({
              id: `#${foundPrId}`,
              title: message.trim(),
              author: author?.trim() || 'developer',
              date: date?.trim() || new Date().toISOString().slice(0, 10),
              url: `https://github.com/pull/${foundPrId}`,
            });
          }
        }
      }
    }

    // Check .contextbuilder/timeline.json for persisted PR entries
    const timelinePath = path.join(workspaceRoot, '.contextbuilder', 'timeline.json');
    if (fs.existsSync(timelinePath)) {
      try {
        const raw = fs.readFileSync(timelinePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.entries)) {
          for (const entry of data.entries) {
            if (entry.pr_number) {
              const prId = String(entry.pr_number);
              if (!prMap.has(prId)) {
                prMap.add(prId);
                prs.push({
                  id: `#${prId}`,
                  title: entry.reason || `${entry.change_type || 'PR'} #${prId}`,
                  author: 'developer',
                  date: entry.timestamp
                    ? String(entry.timestamp).slice(0, 10)
                    : new Date().toISOString().slice(0, 10),
                  url: `https://github.com/pull/${prId}`,
                });
              }
            }
          }
        }
      } catch {
        // Ignore JSON parse error
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
