import * as fs from 'fs';
import * as path from 'path';
import { RelatedTest } from '../../types';

export function isSourceFile(filePath: string): boolean {
  if (!filePath) return false;
  const fileName = path.basename(filePath);

  // Dotfiles like .gitignore, .env, .eslintrc, .prettierrc are not source files
  if (fileName.startsWith('.')) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    // Files without extension like LICENSE, Dockerfile, Makefile are not source files
    return false;
  }

  const SOURCE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.java',
    '.go',
    '.rs',
    '.rb',
    '.c',
    '.cpp',
    '.cc',
    '.cxx',
    '.h',
    '.hpp',
    '.cs',
    '.php',
    '.swift',
    '.kt',
    '.scala',
    '.sh',
    '.bash',
    '.vue',
    '.svelte',
  ]);

  return SOURCE_EXTENSIONS.has(ext);
}

export async function mapRelatedTestsAsync(
  filePath: string,
  workspaceRoot: string
): Promise<RelatedTest[]> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        if (!isSourceFile(filePath)) {
          resolve([]);
          return;
        }

        const tests: RelatedTest[] = [];
        const absFilePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(workspaceRoot, filePath);

        const ext = path.extname(absFilePath);
        const dir = path.dirname(absFilePath);
        const baseName = path.basename(absFilePath, ext);

        // Standard naming patterns for related tests
        const candidatePaths = [
          path.join(dir, `${baseName}.test${ext}`),
          path.join(dir, `${baseName}.spec${ext}`),
          path.join(dir, '__tests__', `${baseName}.test${ext}`),
          path.join(dir, '__tests__', `${baseName}.spec${ext}`),
          path.join(dir, `test_${baseName}${ext}`),
          path.join(dir, `${baseName}_test${ext}`),
          path.join(workspaceRoot, 'test', `${baseName}.test${ext}`),
          path.join(workspaceRoot, 'tests', `${baseName}.test${ext}`),
          path.join(workspaceRoot, 'tests', `test_${baseName}${ext}`),
          path.join(workspaceRoot, 'tests', `${baseName}_test${ext}`),
        ];

        for (const testPath of candidatePaths) {
          if (fs.existsSync(testPath)) {
            const content = fs.readFileSync(testPath, 'utf-8');
            const testMatches = content.match(/(it|test)\s*\(\s*['"`](.*?)['"`]/g);
            if (testMatches) {
              for (const match of testMatches) {
                const testNameMatch = match.match(/['"`](.*?)['"`]/);
                if (testNameMatch && testNameMatch[1]) {
                  const relPath = path.relative(workspaceRoot, testPath) || testPath;
                  if (!tests.some((t) => t.file === relPath && t.testName === testNameMatch[1])) {
                    tests.push({
                      file: relPath,
                      testName: testNameMatch[1],
                    });
                  }
                }
              }
            } else {
              const relPath = path.relative(workspaceRoot, testPath) || testPath;
              if (!tests.some((t) => t.file === relPath)) {
                tests.push({
                  file: relPath,
                  testName: `Suite for ${baseName}`,
                });
              }
            }
          }
        }

        // If file is itself a test file and exists on disk
        if (
          (absFilePath.includes('.test.') ||
            absFilePath.includes('.spec.') ||
            absFilePath.includes('test_') ||
            absFilePath.includes('_test.')) &&
          fs.existsSync(absFilePath)
        ) {
          const relPath = path.relative(workspaceRoot, absFilePath) || absFilePath;
          if (!tests.some((t) => t.file === relPath)) {
            tests.push({
              file: relPath,
              testName: `Self Test File`,
            });
          }
        }

        resolve(tests);
      } catch {
        resolve([]);
      }
    });
  });
}

