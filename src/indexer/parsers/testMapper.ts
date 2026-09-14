import * as fs from 'fs';
import * as path from 'path';
import { RelatedTest } from '../../types';

export async function mapRelatedTestsAsync(
  filePath: string,
  workspaceRoot: string
): Promise<RelatedTest[]> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const tests: RelatedTest[] = [];
        const ext = path.extname(filePath);
        const dir = path.dirname(filePath);
        const baseName = path.basename(filePath, ext);

        // Standard naming patterns for related tests
        const candidatePaths = [
          path.join(dir, `${baseName}.test${ext}`),
          path.join(dir, `${baseName}.spec${ext}`),
          path.join(dir, '__tests__', `${baseName}.test${ext}`),
          path.join(dir, '__tests__', `${baseName}.spec${ext}`),
          path.join(workspaceRoot, 'test', `${baseName}.test${ext}`),
          path.join(workspaceRoot, 'tests', `${baseName}.test${ext}`),
        ];

        for (const testPath of candidatePaths) {
          if (fs.existsSync(testPath)) {
            const content = fs.readFileSync(testPath, 'utf-8');
            const testMatches = content.match(/(it|test)\s*\(\s*['"`](.*?)['"`]/g);
            if (testMatches) {
              for (const match of testMatches) {
                const testNameMatch = match.match(/['"`](.*?)['"`]/);
                if (testNameMatch && testNameMatch[1]) {
                  tests.push({
                    file: path.relative(workspaceRoot, testPath) || testPath,
                    testName: testNameMatch[1],
                  });
                }
              }
            } else {
              tests.push({
                file: path.relative(workspaceRoot, testPath) || testPath,
                testName: `Suite for ${baseName}`,
              });
            }
          }
        }

        // If file is itself a test file
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
          tests.push({
            file: path.relative(workspaceRoot, filePath) || filePath,
            testName: `Self Test File`,
          });
        }

        // Fallback default test if no explicit test file on disk
        if (tests.length === 0) {
          tests.push({
            file: `test/${baseName}.test.ts`,
            testName: `should process ${baseName} functionality correctly`,
          });
        }

        resolve(tests);
      } catch {
        resolve([]);
      }
    });
  });
}
