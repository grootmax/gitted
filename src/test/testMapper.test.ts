import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { isSourceFile, mapRelatedTestsAsync } from '../indexer/parsers/testMapper';
import { SidebarProvider } from '../sidebar/SidebarProvider';
import { FileContext } from '../types';

describe('testMapper & Related Tests Card Unit Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-testmapper-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('isSourceFile correctly identifies source vs non-source files', () => {
    expect(isSourceFile('.gitignore')).toBe(false);
    expect(isSourceFile('.env')).toBe(false);
    expect(isSourceFile('.prettierrc')).toBe(false);
    expect(isSourceFile('README.md')).toBe(false);
    expect(isSourceFile('package.json')).toBe(false);
    expect(isSourceFile('LICENSE')).toBe(false);

    expect(isSourceFile('src/index.ts')).toBe(true);
    expect(isSourceFile('app/main.py')).toBe(true);
    expect(isSourceFile('service.go')).toBe(true);
    expect(isSourceFile('component.jsx')).toBe(true);
  });

  it('avoids looking for code tests when selected file is .gitignore', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\ndist\n');

    const result = await mapRelatedTestsAsync(gitignorePath, tmpDir);
    expect(result).toEqual([]);
  });

  it('returns "No related test found" when source file has no matching test on disk', async () => {
    const sourcePath = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(sourcePath, 'export const processData = () => {};');

    const result = await mapRelatedTestsAsync(sourcePath, tmpDir);
    expect(result).toEqual([]);

    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'service.ts',
      relatedTests: result,
      prHistory: [],
      commitHistory: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };
    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('No related test found.');
    expect(html).not.toContain('test/.gitignore.test.ts');
    expect(html).not.toContain('should process service functionality correctly');
  });

  it('finds matching test files that actually exist on disk and provides open/run options', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const sourcePath = path.join(srcDir, 'auth.ts');
    const testPath = path.join(srcDir, 'auth.test.ts');

    fs.writeFileSync(sourcePath, 'export function login() {}');
    fs.writeFileSync(
      testPath,
      `describe('auth', () => {
        it('authenticates valid users', () => {});
      });`
    );

    const result = await mapRelatedTestsAsync(sourcePath, tmpDir);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].file).toBe(path.join('src', 'auth.test.ts'));
    expect(result[0].testName).toBe('authenticates valid users');

    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/auth.ts',
      relatedTests: result,
      prHistory: [],
      commitHistory: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };
    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('Related Tests');
    expect(html).toContain('Open');
    expect(html).toContain('Run');
    expect(html).toContain('authenticates valid users');
  });
});
