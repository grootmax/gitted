import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseGitAsync } from '../indexer/parsers/gitParser';
import { SidebarProvider } from '../sidebar/SidebarProvider';
import { FileContext } from '../types';

describe('gitParser and SidebarProvider PR History tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-gitparser-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses PR intent from .contextbuilder/timeline.json if present', async () => {
    const cbDir = path.join(tmpDir, '.contextbuilder');
    fs.mkdirSync(cbDir, { recursive: true });
    const timelinePath = path.join(cbDir, 'timeline.json');

    fs.writeFileSync(
      timelinePath,
      JSON.stringify({
        entries: [
          {
            timestamp: '2026-09-14T15:00:00Z',
            pr_number: 99,
            reason: '[PAY-100] Add refund processor',
            change_type: 'Feature',
          },
        ],
      })
    );

    const testFile = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(testFile, 'export const a = 1;');

    const res = await parseGitAsync(testFile, tmpDir);
    expect(res.prHistory.some((pr) => pr.id === '#99')).toBe(true);
  });

  it('renders File Commits and "No linked PR found" in SidebarProvider if prHistory is empty', () => {
    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/service.ts',
      prHistory: [],
      commitHistory: [
        {
          hash: '1077cff',
          author: 'Alice',
          message: 'feat: add payment gateway',
          date: '2026-09-15',
          url: 'https://github.com/commit/1077cff',
        },
      ],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('File Commits');
    expect(html).toContain('No linked PR found');
    expect(html).toContain('1077cff');
    expect(html).toContain('feat: add payment gateway');
    expect(html).toContain('Inspect change');
    expect(html).toContain('https://github.com/commit/1077cff');
  });

  it('does not synthesize PR entries from commits when no PR references exist', async () => {
    const testFile = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(testFile, 'export const a = 1;');

    const res = await parseGitAsync(testFile, tmpDir);
    // Since tmpDir is a fresh dir without PR references, prHistory should be empty
    expect(res.prHistory).toEqual([]);
  });
});
