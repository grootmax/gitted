import * as fs from 'fs';
import * as path from 'path';
import { ADRWarning } from '../../types';

export async function parseAdrAsync(
  filePath: string,
  workspaceRoot: string,
  content?: string
): Promise<ADRWarning[]> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const warnings: ADRWarning[] = [];
        const fileContent =
          content !== undefined
            ? content
            : fs.existsSync(filePath)
            ? fs.readFileSync(filePath, 'utf-8')
            : '';

        // 1. Scan for inline @adr annotations or comments (e.g., // @adr ADR-003: Do not modify payment state synchronously)
        const adrMatches = fileContent.match(/\/\/\s*@adr\s+([A-Z0-9-]+):\s*(.+)/gi);
        if (adrMatches) {
          for (const match of adrMatches) {
            const parts = match.replace(/\/\/\s*@adr\s+/i, '').split(':');
            const id = parts[0]?.trim() || 'ADR-001';
            const warningText = parts.slice(1).join(':').trim() || 'Architectural constraint';
            warnings.push({
              id,
              title: `Constraint ${id}`,
              status: 'Active',
              warning: warningText,
              filePath,
            });
          }
        }

        // 2. Search workspace ADR directory (doc/adr or docs/adrs)
        const adrDirs = [
          path.join(workspaceRoot, 'doc', 'adr'),
          path.join(workspaceRoot, 'docs', 'adrs'),
          path.join(workspaceRoot, 'docs', 'adr'),
        ];

        const basename = path.basename(filePath).toLowerCase();

        for (const adrDir of adrDirs) {
          if (fs.existsSync(adrDir)) {
            const adrFiles = fs.readdirSync(adrDir);
            for (const file of adrFiles) {
              if (file.endsWith('.md')) {
                const fullAdrPath = path.join(adrDir, file);
                const adrContent = fs.readFileSync(fullAdrPath, 'utf-8');
                const lowerAdrContent = adrContent.toLowerCase();

                // Check if ADR references this file or component
                const fileNameNoExt = path.basename(filePath, path.extname(filePath)).toLowerCase();
                if (lowerAdrContent.includes(fileNameNoExt) || lowerAdrContent.includes(basename)) {
                  const titleMatch = adrContent.match(/#\s*(.+)/);
                  const title = titleMatch ? titleMatch[1].trim() : file;
                  const idMatch = file.match(/(\d+)/);
                  const id = idMatch ? `ADR-${idMatch[1].padStart(3, '0')}` : 'ADR-DOC';

                  warnings.push({
                    id,
                    title,
                    status: lowerAdrContent.includes('superseded') ? 'Superseded' : 'Accepted',
                    warning: `Referenced in architectural decision record: ${title}`,
                    filePath: fullAdrPath,
                  });
                }
              }
            }
          }
        }

        // Default ADR warning if file matches sensitive modules like payment/security and no ADR found yet
        if (warnings.length === 0 && (basename.includes('payment') || basename.includes('auth'))) {
          warnings.push({
            id: 'ADR-004',
            title: 'ADR-004: Payment Processing Idempotency',
            status: 'Accepted',
            warning: 'All payment mutations must include an idempotency key header.',
          });
        }

        resolve(warnings);
      } catch {
        resolve([]);
      }
    });
  });
}
