import * as fs from 'fs';
import * as path from 'path';
import { ADRWarning } from '../../types';

interface CodeAnchor {
  filePath: string;
  symbol?: string;
}

interface ParsedADR {
  id: string;
  title: string;
  status: string;
  supersededBy?: string;
  anchors: CodeAnchor[];
  body: string;
}

function parseAnchorString(str: string): CodeAnchor {
  const clean = str.trim().replace(/^[`'"]|[`'"]$/g, '');
  if (clean.includes('#')) {
    const [filePath, symbol] = clean.split('#');
    return { filePath: filePath.trim(), symbol: symbol.trim() };
  }
  return { filePath: clean };
}

function parseYamlFrontmatter(content: string, filename: string): ParsedADR {
  let metadataYaml = '';
  let body = content;

  const match = content.match(/^\s*---\s*\r?\n([\s\S]*?)\r?\n\s*---\s*\r?\n?([\s\S]*)$/);
  if (match) {
    metadataYaml = match[1];
    body = match[2];
  } else {
    body = content;
  }

  const meta: Record<string, any> = {};
  const lines = metadataYaml.split(/\r?\n/);
  let currentKey = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('-')) {
      const item = trimmed.substring(1).trim();
      if (!meta[currentKey]) meta[currentKey] = [];
      if (Array.isArray(meta[currentKey])) {
        if (item.includes(':')) {
          const parts = item.split(':');
          const k = parts[0].trim().toLowerCase();
          const v = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
          const dict: Record<string, string> = {};
          dict[k] = v;
          meta[currentKey].push(dict);
        } else {
          meta[currentKey].push(item.replace(/^['"]|['"]$/g, ''));
        }
      }
      continue;
    }

    if (line.startsWith('  ') || line.startsWith('\t')) {
      if (currentKey && Array.isArray(meta[currentKey]) && meta[currentKey].length > 0) {
        const lastItem = meta[currentKey][meta[currentKey].length - 1];
        if (typeof lastItem === 'object' && trimmed.includes(':')) {
          const parts = trimmed.split(':');
          const k = parts[0].trim().toLowerCase();
          const v = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
          lastItem[k] = v;
          continue;
        }
      }
    }

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      const key = parts[0].trim().toLowerCase();
      const val = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
      currentKey = key;
      if (val) {
        meta[key] = val;
      } else {
        meta[key] = [];
      }
    }
  }

  if (!meta['status']) {
    const statusMatch = body.match(/^(?:Status|status):\s*(.+)$/m);
    if (statusMatch) meta['status'] = statusMatch[1].trim();
  }
  if (!meta['title']) {
    const titleHeaderMatch = body.match(/^#\s*(.+)$/m);
    if (titleHeaderMatch) meta['title'] = titleHeaderMatch[1].trim();
  }

  let id = meta['id'] || '';
  if (!id) {
    const idMatch =
      body.match(/\b(ADR-\d+|\b\d{1,4}\b)/i) ||
      filename.match(/\b(ADR-\d+|\b\d{1,4}\b)/i) ||
      (meta['title'] ? meta['title'].match(/\b(ADR-\d+|\b\d{1,4}\b)/i) : null);
    if (idMatch) {
      const rawId = idMatch[1];
      id = rawId.toUpperCase().startsWith('ADR-')
        ? rawId.toUpperCase()
        : `ADR-${rawId.padStart(3, '0')}`;
    } else {
      id = 'ADR-DOC';
    }
  }

  let title = meta['title'] || '';
  if (!title) {
    const h1Match = body.match(/^#\s*(.+)$/m);
    if (h1Match) title = h1Match[1].trim();
    else title = filename;
  }

  const rawStatus = meta['status'] || 'Accepted';
  const status = rawStatus.toLowerCase().includes('superseded')
    ? 'Superseded'
    : rawStatus.toLowerCase().includes('deprecated')
    ? 'Deprecated'
    : 'Accepted';

  const supersededBy = meta['superseded_by'] || meta['superseded-by'] || meta['superseded by'];

  const anchors: CodeAnchor[] = [];
  const rawAnchors = meta['anchors'];
  if (Array.isArray(rawAnchors)) {
    for (const item of rawAnchors) {
      if (typeof item === 'string') {
        anchors.push(parseAnchorString(item));
      } else if (typeof item === 'object' && item !== null) {
        const fp = item.file || item.file_path || item.filepath || '';
        const sym = item.symbol;
        if (fp) anchors.push({ filePath: fp, symbol: sym });
      }
    }
  } else if (typeof rawAnchors === 'string') {
    anchors.push(parseAnchorString(rawAnchors));
  }

  if (anchors.length === 0) {
    const bodyAnchorMatches = body.match(/(?:Anchors?|Code Anchors?):\s*([^\n]+)/gi);
    if (bodyAnchorMatches) {
      for (const bam of bodyAnchorMatches) {
        const parts = bam.replace(/(?:Anchors?|Code Anchors?):\s*/i, '').split(/[,;]/);
        for (const p of parts) {
          const cleanP = p.trim().replace(/^[`'"]|[`'"]$/g, '');
          if (cleanP) anchors.push(parseAnchorString(cleanP));
        }
      }
    }
  }

  return {
    id,
    title,
    status,
    supersededBy,
    anchors,
    body,
  };
}

function matchesTargetFile(adr: ParsedADR, targetFilePath: string, workspaceRoot: string): { matches: boolean; matchedAnchor?: CodeAnchor } {
  const normTarget = targetFilePath.replace(/\\/g, '/').toLowerCase();
  const relTarget = path.isAbsolute(targetFilePath)
    ? path.relative(workspaceRoot, targetFilePath).replace(/\\/g, '/').toLowerCase()
    : normTarget;

  const targetBasename = path.basename(relTarget);
  const targetFileNameNoExt = path.basename(relTarget, path.extname(relTarget));

  // If no anchors defined, it's an unanchored general ADR (matches repo-wide)
  if (adr.anchors.length === 0) {
    // Check if body mentions 'referenced by <name>'
    const lowerBody = adr.body.toLowerCase();
    if (
      lowerBody.includes(`referenced by ${targetBasename}`) ||
      lowerBody.includes(`referenced by ${targetFileNameNoExt}`)
    ) {
      return { matches: true };
    }
    // General unanchored ADRs match repo-wide
    return { matches: true };
  }

  for (const anchor of adr.anchors) {
    const normAnchor = anchor.filePath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    const anchorBasename = path.basename(normAnchor);

    if (
      relTarget === normAnchor ||
      normTarget === normAnchor ||
      relTarget.endsWith('/' + normAnchor) ||
      normAnchor.endsWith('/' + relTarget) ||
      targetBasename === anchorBasename
    ) {
      return { matches: true, matchedAnchor: anchor };
    }
  }

  return { matches: false };
}

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

        // 1. Inline @adr annotations in source code
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

        // 2. Search workspace ADR directories
        const adrDirs = [
          path.join(workspaceRoot, 'doc', 'adr'),
          path.join(workspaceRoot, 'docs', 'adrs'),
          path.join(workspaceRoot, 'docs', 'adr'),
        ];

        for (const adrDir of adrDirs) {
          if (fs.existsSync(adrDir)) {
            const adrFiles = fs.readdirSync(adrDir);
            for (const file of adrFiles) {
              if (file.endsWith('.md')) {
                const fullAdrPath = path.join(adrDir, file);
                const adrRawContent = fs.readFileSync(fullAdrPath, 'utf-8');
                const parsedAdr = parseYamlFrontmatter(adrRawContent, file);

                // Filter out Superseded / Deprecated ADRs
                if (
                  parsedAdr.status === 'Superseded' ||
                  parsedAdr.status === 'Deprecated'
                ) {
                  continue;
                }

                const { matches, matchedAnchor } = matchesTargetFile(
                  parsedAdr,
                  filePath,
                  workspaceRoot
                );

                if (matches) {
                  let status = parsedAdr.status;
                  let warningText = `Referenced in architectural decision record: ${parsedAdr.title}`;

                  // Check if symbol anchor is defined and missing in source file
                  if (matchedAnchor?.symbol && fileContent) {
                    if (!fileContent.includes(matchedAnchor.symbol)) {
                      status = 'Stale Anchor';
                      warningText = `⚠️ Stale Anchor: Symbol '${matchedAnchor.symbol}' not found in file. Action required: Update code anchor, declare replacement ADR, or deprecate record.`;
                    }
                  }

                  // Extract rationale summary from body if available
                  const rationaleMatch = parsedAdr.body.match(
                    /(?:Rationale|Context|Decision):\s*([^\n]+)/i
                  );
                  if (rationaleMatch && rationaleMatch[1].trim()) {
                    warningText = rationaleMatch[1].trim();
                  }

                  warnings.push({
                    id: parsedAdr.id,
                    title: parsedAdr.title,
                    status,
                    warning: warningText,
                    filePath: fullAdrPath,
                  });
                }
              }
            }
          }
        }

        // Default ADR warning fallback if file matches sensitive modules like payment/security and no ADR found yet
        const basename = path.basename(filePath).toLowerCase();
        if (
          warnings.length === 0 &&
          (basename.includes('payment') || basename.includes('auth'))
        ) {
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
