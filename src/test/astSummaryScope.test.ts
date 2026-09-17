import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GittedExtension } from '../extension';
import { parseAstAsync, isSupportedCodeFile } from '../indexer/parsers/astParser';
import { SidebarProvider } from '../sidebar/SidebarProvider';
import { FileContext } from '../types';

describe('AST Functions & Classes Summary Scope & Navigation Tests', () => {
  let tmpDir: string;
  let extension: GittedExtension;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-scope-test-'));
    extension = new GittedExtension(tmpDir);
    await extension.activate();
  });

  afterEach(() => {
    extension.deactivate();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Requirement 1: Scope Distinction (isSupportedCodeFile)', () => {
    it('identifies source code files as supported and configuration files as unsupported', () => {
      expect(isSupportedCodeFile('src/payment.ts')).toBe(true);
      expect(isSupportedCodeFile('services/user.py')).toBe(true);
      expect(isSupportedCodeFile('pkg/main.go')).toBe(true);

      expect(isSupportedCodeFile('.gitignore')).toBe(false);
      expect(isSupportedCodeFile('config.json')).toBe(false);
      expect(isSupportedCodeFile('.contextbuilder/features.yml')).toBe(false);
      expect(isSupportedCodeFile('README.md')).toBe(false);
      expect(isSupportedCodeFile('Dockerfile')).toBe(false);
    });

    it('renders "Not applicable" for configuration files like .gitignore in SidebarProvider', async () => {
      const gitignoreFile = path.join(tmpDir, '.gitignore');
      fs.writeFileSync(gitignoreFile, 'node_modules/\nout/\n.venv/\n');

      const parseRes = await parseAstAsync(gitignoreFile);
      expect(parseRes.astSummary.parseStatus).toBe('not_applicable');

      const context: FileContext = {
        filePath: gitignoreFile,
        prHistory: [],
        commitHistory: [],
        relatedTests: [],
        adrWarnings: [],
        astSummary: parseRes.astSummary,
        lastIndexedAt: Date.now(),
      };

      const sidebar = new SidebarProvider();
      sidebar.updateContext(context);
      const html = sidebar.renderHtml();

      expect(html).toContain('Functions & Classes Summary');
      expect(html).toContain('Not applicable');
      expect(html).not.toContain('command:gitted.gotoSymbol');
    });
  });

  describe('Requirement 2: Symbol Click Navigation for Code Files', () => {
    it('extracts functions and classes and renders clickable navigation links for code files', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const codeFile = path.join(srcDir, 'payment.ts');
      fs.writeFileSync(
        codeFile,
        `
        export class PaymentService {
          processPayment() {}
        }
        export function validateCard() {}
        `
      );

      const parseRes = await parseAstAsync(codeFile);
      expect(parseRes.astSummary.parseStatus).toBe('success');
      expect(parseRes.astSummary.classes).toContain('PaymentService');
      expect(parseRes.astSummary.functions).toContain('validateCard');

      const context: FileContext = {
        filePath: codeFile,
        prHistory: [],
        commitHistory: [],
        relatedTests: [],
        adrWarnings: [],
        astSummary: parseRes.astSummary,
        lastIndexedAt: Date.now(),
      };

      const sidebar = new SidebarProvider();
      sidebar.updateContext(context);
      const html = sidebar.renderHtml();

      expect(html).toContain('PaymentService');
      expect(html).toContain('validateCard');
      expect(html).toContain('command:gitted.gotoSymbol');
      expect(html).toContain('data-symbol="PaymentService"');
      expect(html).toContain('data-symbol="validateCard"');
    });

    it('gotoSymbol method in GittedExtension locates symbol line numbers accurately', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const codeFile = path.join(srcDir, 'order.ts');
      fs.writeFileSync(
        codeFile,
        `// Line 1: Header
// Line 2: Comments
class OrderProcessor {
  processOrder() {}
}

function calculateTotal() {
  return 100;
}
`
      );

      const classNav = extension.gotoSymbol('OrderProcessor', codeFile);
      expect(classNav.success).toBe(true);
      expect(classNav.line).toBe(3);

      const funcNav = extension.gotoSymbol('calculateTotal', codeFile);
      expect(funcNav.success).toBe(true);
      expect(funcNav.line).toBe(7);
    });
  });

  describe('Requirement 3: Parse Failure Indication', () => {
    it('displays explicit parse failure message when source file contains syntax errors', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const brokenFile = path.join(srcDir, 'broken.ts');
      fs.writeFileSync(brokenFile, '// SYNTAX_ERROR\nconst x = ;');

      const parseRes = await parseAstAsync(brokenFile);
      expect(parseRes.astSummary.parseStatus).toBe('failed');

      const context: FileContext = {
        filePath: brokenFile,
        prHistory: [],
        commitHistory: [],
        relatedTests: [],
        adrWarnings: [],
        astSummary: parseRes.astSummary,
        lastIndexedAt: Date.now(),
      };

      const sidebar = new SidebarProvider();
      sidebar.updateContext(context);
      const html = sidebar.renderHtml();

      expect(html).toContain('Parsing failed for this file.');
      expect(html).not.toContain('Functions: None');
      expect(html).not.toContain('Classes: None');
    });
  });
});
