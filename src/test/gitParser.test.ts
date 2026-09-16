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

  it('renders commit history fallback in SidebarProvider if prHistory is empty', () => {
    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/service.ts',
      prHistory: [],
      commitHistory: [
        {
          hash: 'a1b2c3d',
          author: 'Alice',
          message: 'feat: add payment gateway',
          date: '2026-09-15',
        },
      ],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('PR & Commit History');
    expect(html).toContain('a1b2c3d');
    expect(html).toContain('feat: add payment gateway');
    expect(html).not.toContain('No related PR history found.');
  });
});
