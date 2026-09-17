import * as path from 'path';
import { FileContext, PRInfo, CommitInfo, RelatedTest, ADRWarning } from '../types';
import { isSupportedCodeFile } from '../indexer/parsers/astParser';

export class SidebarProvider {
  private currentContext: FileContext | null = null;
  private workspaceRoot: string = '';
  private messageListener?: (message: { command: string; filePath?: string; prId?: string; hash?: string; url?: string }) => void;

  constructor(workspaceRoot?: string) {
    if (workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
    }
  }

  public setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  public updateContext(context: FileContext | null): void {
    this.currentContext = context;
  }

  public getCurrentContext(): FileContext | null {
    return this.currentContext;
  }

  public onDidReceiveMessage(
    listener: (message: { command: string; filePath?: string; prId?: string; hash?: string; url?: string }) => void
  ): void {
    this.messageListener = listener;
  }

  public handleMessage(message: { command: string; filePath?: string; prId?: string; hash?: string; url?: string }): void {
    if (this.messageListener) {
      this.messageListener(message);
    }
  }

  private getRelativePath(filePath: string): string {
    if (!filePath) return '';
    if (this.workspaceRoot && path.isAbsolute(filePath)) {
      const rel = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
      if (!rel.startsWith('..')) {
        return rel;
      }
    }
    return filePath.replace(/\\/g, '/');
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private renderBadge(status: 'found' | 'inferred' | 'unavailable' | 'still loading'): string {
    const labelMap: Record<string, string> = {
      'found': 'FOUND',
      'inferred': 'INFERRED',
      'unavailable': 'UNAVAILABLE',
      'still loading': 'STILL LOADING',
    };
    const label = labelMap[status] || status.toUpperCase();
    const cssClass = status.replace(/\s+/g, '-');
    return `<span class="badge badge-${cssClass}">${label}</span>`;
  }

  public renderHtml(): string {
    if (!this.currentContext) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 12px; color: #cccccc; background: #1e1e1e; }
            .empty { color: #888888; font-style: italic; }
          </style>
        </head>
        <body>
          <h3>Gitted Sidebar Context</h3>
          <p class="empty">Select an active code editor file to inspect context.</p>
        </body>
        </html>
      `;
    }

    const ctx = this.currentContext;
    const relativeFilePath = this.getRelativePath(ctx.filePath);
    const isIndexing = !!ctx.isIndexing;

    // 1. Feature Ownership Card
    let featureState: 'found' | 'inferred' | 'unavailable' | 'still loading' = isIndexing
      ? 'still loading'
      : ctx.featureOwnership
      ? ctx.featureOwnership.source === 'inferred'
        ? 'inferred'
        : 'found'
      : 'unavailable';

    const featureHtml = `
      <div class="card">
        <div class="card-header">
          <h4>Feature Ownership</h4>
          ${this.renderBadge(featureState)}
        </div>
        ${
          featureState === 'still loading'
            ? `<p class="muted">Loading feature ownership...</p>`
            : featureState === 'unavailable' || !ctx.featureOwnership
            ? `<p class="muted">No feature ownership tag found.</p>`
            : `<p><strong>Team:</strong> ${this.escapeHtml(ctx.featureOwnership.team)}</p>
               <p><strong>Owner:</strong> ${this.escapeHtml(ctx.featureOwnership.owner)}</p>
               <p><strong>Feature:</strong> ${this.escapeHtml(ctx.featureOwnership.feature)}</p>
               ${featureState === 'inferred' ? `<p class="muted info-note">Inferred from directory path structure.</p>` : ''}`
        }
      </div>
    `;

    // 2. ADR Warnings Card
    const realAdrs = (ctx.adrWarnings || []).filter(
      (adr: ADRWarning) => adr.id !== 'NO_ADR_DOCS' && adr.id !== 'NO_ADR_MATCH'
    );
    const hasAdrDocsSentinel = ctx.adrWarnings?.find((adr) => adr.id === 'NO_ADR_DOCS');

    let adrState: 'found' | 'inferred' | 'unavailable' | 'still loading' = isIndexing
      ? 'still loading'
      : realAdrs.length > 0
      ? 'found'
      : 'unavailable';

    const adrHtml = `
      <div class="card ${realAdrs.some((a) => a.needsAttention || a.status === 'Stale Anchor') ? 'warning' : ''}">
        <div class="card-header">
          <h4>ADR Warnings</h4>
          ${this.renderBadge(adrState)}
        </div>
        ${
          adrState === 'still loading'
            ? `<p class="muted">Loading ADR warnings...</p>`
            : adrState === 'unavailable' || realAdrs.length === 0
            ? `<p class="muted">${hasAdrDocsSentinel ? 'No ADR documents found in project.' : 'No ADR warnings for this file.'}</p>`
            : `<ul>
                ${realAdrs
                  .map(
                    (adr: ADRWarning) =>
                      `<li>
                        ${adr.filePath ? `<a href="#" onclick="openFile('${this.escapeHtml(adr.filePath)}')"><code>${this.escapeHtml(this.getRelativePath(adr.filePath))}</code></a>: ` : ''}
                        <strong style="color:${adr.needsAttention || adr.status === 'Stale Anchor' ? '#f14c4c' : '#4ec9b0'};">[${this.escapeHtml(adr.id)}] ${this.escapeHtml(adr.title)}:</strong> ${this.escapeHtml(adr.warning)}
                      </li>`
                  )
                  .join('')}
              </ul>`
        }
      </div>
    `;

    // 3. PR & Commit History Card
    let prState: 'found' | 'inferred' | 'unavailable' | 'still loading' = isIndexing
      ? 'still loading'
      : ctx.prHistory && ctx.prHistory.length > 0
      ? 'found'
      : ctx.commitHistory && ctx.commitHistory.length > 0
      ? 'inferred'
      : 'unavailable';

    const prCardTitle = prState === 'inferred' || (ctx.commitHistory && ctx.commitHistory.length > 0)
      ? 'PR History & File Commits'
      : 'PR History';

    const prHtml = `
      <div class="card">
        <div class="card-header">
          <h4>${prCardTitle}</h4>
          ${this.renderBadge(prState)}
        </div>
        ${
          prState === 'still loading'
            ? `<p class="muted">Loading PR & commit history...</p>`
            : prState === 'found' && ctx.prHistory && ctx.prHistory.length > 0
            ? `<ul>
                ${ctx.prHistory
                  .map(
                    (pr: PRInfo) =>
                      `<li>
                        <a href="#" onclick="openPr('${this.escapeHtml(pr.id)}', '${this.escapeHtml(pr.url || '')}')"><strong>${this.escapeHtml(pr.id)}</strong></a>:
                        ${this.escapeHtml(pr.title)} <em>by ${this.escapeHtml(pr.author)} on ${this.escapeHtml(pr.date)}</em>
                        ${pr.url ? ` <a href="${this.escapeHtml(pr.url)}" target="_blank" class="inspect-link">View PR</a>` : ''}
                      </li>`
                  )
                  .join('')}
              </ul>`
            : prState === 'inferred' && ctx.commitHistory && ctx.commitHistory.length > 0
            ? `<p class="muted">No linked PR found.</p>
              <ul>
                ${ctx.commitHistory
                  .map(
                    (c) =>
                      `<li>
                        <a href="#" onclick="openCommit('${this.escapeHtml(c.hash)}')"><strong>${this.escapeHtml(c.hash)}</strong></a>:
                        ${this.escapeHtml(c.message)} <em>by ${this.escapeHtml(c.author)} on ${this.escapeHtml(c.date)}</em>
                        <a href="${this.escapeHtml(c.url || `https://github.com/commit/${c.hash}`)}" target="_blank" class="inspect-link">Inspect change</a>
                      </li>`
                  )
                  .join('')}
              </ul>
              <p class="muted info-note">Derived from git commit history (no PR ID matched).</p>`
            : `<p class="muted">No linked PR found. No related PR history found.</p>`
        }
      </div>
    `;

    let commitsHtml = '';
    if (ctx.commitHistory && ctx.commitHistory.length > 0 && prState === 'found') {
      commitsHtml = `
        <div class="card">
          <div class="card-header">
            <h4>File Commits</h4>
            ${this.renderBadge('found')}
          </div>
          <ul>
            ${ctx.commitHistory
              .map(
                (c: CommitInfo) =>
                  `<li>
                    <code>${this.escapeHtml(c.hash)}</code>: ${this.escapeHtml(c.message)} <em>by ${this.escapeHtml(c.author)} on ${this.escapeHtml(c.date)}</em>
                    <a href="${this.escapeHtml(c.url || `https://github.com/commit/${c.hash}`)}" target="_blank" class="inspect-link">Inspect change</a>
                  </li>`
              )
              .join('')}
          </ul>
        </div>
      `;
    }

    // 4. Related Tests Card
    let testsState: 'found' | 'inferred' | 'unavailable' | 'still loading' = isIndexing
      ? 'still loading'
      : ctx.relatedTests && ctx.relatedTests.length > 0
      ? 'found'
      : 'unavailable';

    const testsHtml = `
      <div class="card">
        <div class="card-header">
          <h4>Related Tests</h4>
          ${this.renderBadge(testsState)}
        </div>
        ${
          testsState === 'still loading'
            ? `<p class="muted">Loading related tests...</p>`
            : testsState === 'unavailable' || !ctx.relatedTests || ctx.relatedTests.length === 0
            ? `<p class="muted">No related tests found.</p>`
            : `<ul>
                ${ctx.relatedTests
                  .map(
                    (t: RelatedTest) =>
                      `<li>
                        <a href="#" onclick="openFile('${this.escapeHtml(t.file)}')"><code>${this.escapeHtml(this.getRelativePath(t.file))}</code></a>
                        - ${this.escapeHtml(t.testName)}
                      </li>`
                  )
                  .join('')}
              </ul>`
        }
      </div>
    `;

    // 5. AST Node Summary / Functions & Classes Summary Card
    const isCode = isSupportedCodeFile(ctx.filePath);
    const hasAstData =
      ctx.astSummary &&
      ((ctx.astSummary.functions && ctx.astSummary.functions.length > 0) ||
        (ctx.astSummary.classes && ctx.astSummary.classes.length > 0) ||
        (ctx.astSummary.exports && ctx.astSummary.exports.length > 0) ||
        (ctx.astSummary.imports && ctx.astSummary.imports.length > 0));

    let astState: 'found' | 'inferred' | 'unavailable' | 'still loading' = isIndexing
      ? 'still loading'
      : hasAstData
      ? 'found'
      : 'unavailable';

    const renderSymbolLinks = (items: string[] | undefined, kind: 'function' | 'class') => {
      if (!items || items.length === 0) return 'None';
      return items
        .map(
          (item) =>
            `<a href="command:gitted.gotoSymbol?${encodeURIComponent(
              JSON.stringify([item, ctx.filePath])
            )}" onclick="gotoSymbol('${this.escapeHtml(item)}', '${this.escapeHtml(ctx.filePath)}')" class="symbol-link" data-symbol="${this.escapeHtml(item)}" data-kind="${kind}">${this.escapeHtml(item)}</a>`
        )
        .join(', ');
    };

    let astCardBody = '';
    if (astState === 'still loading') {
      astCardBody = `<p class="muted">Loading AST summary...</p>`;
    } else if (!isCode || ctx.astSummary?.parseStatus === 'not_applicable') {
      astCardBody = `<p class="muted">Not applicable</p>`;
    } else if (ctx.astSummary?.parseStatus === 'failed') {
      astCardBody = `<p style="color: #f14c4c; margin: 0;">Parsing failed for this file.</p>`;
    } else if (hasAstData) {
      astCardBody = `
        <p><strong>Functions:</strong> ${renderSymbolLinks(ctx.astSummary?.functions, 'function')}</p>
        <p><strong>Classes:</strong> ${renderSymbolLinks(ctx.astSummary?.classes, 'class')}</p>
        ${
          ctx.astSummary?.exports && ctx.astSummary.exports.length > 0
            ? `<p><strong>Exports:</strong> ${ctx.astSummary.exports.map((e) => `<code>${this.escapeHtml(e)}</code>`).join(', ')}</p>`
            : ''
        }
      `;
    } else {
      astCardBody = `<p class="muted">No AST symbols found for this file.</p>`;
    }

    const astHtml = `
      <div class="card ${ctx.astSummary?.parseStatus === 'failed' ? 'warning' : ''}">
        <div class="card-header">
          <h4>Functions & Classes Summary</h4>
          ${this.renderBadge(astState)}
        </div>
        ${astCardBody}
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 12px;
            color: #d4d4d4;
            background-color: #1e1e1e;
            font-size: 13px;
          }
          .sidebar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #3c3c3c;
          }
          .sidebar-header h3 {
            margin: 0;
            font-size: 13px;
            word-break: break-all;
          }
          .refresh-btn {
            background: #2d2d2d;
            color: #cccccc;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
          }
          .refresh-btn:hover {
            background: #3c3c3c;
            color: #ffffff;
          }
          .card {
            background-color: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
          }
          .card.warning {
            border-left: 4px solid #f14c4c;
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          .card-header h4 {
            margin: 0;
            color: #569cd6;
            font-size: 13px;
            font-weight: 600;
          }
          .badge {
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 3px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .badge-found {
            background-color: #1e4620;
            color: #4ec9b0;
            border: 1px solid #2e6633;
          }
          .badge-inferred {
            background-color: #3d3200;
            color: #dcdcaa;
            border: 1px solid #665400;
          }
          .badge-unavailable {
            background-color: #2d2d2d;
            color: #808080;
            border: 1px solid #444444;
          }
          .badge-still-loading {
            background-color: #002b4d;
            color: #569cd6;
            border: 1px solid #004b80;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
          li {
            margin-bottom: 4px;
          }
          .muted {
            color: #808080;
            font-style: italic;
            margin: 0;
          }
          .info-note {
            margin-top: 6px;
            font-size: 11px;
          }
          code {
            background: #2d2d2d;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: monospace;
          }
          a {
            color: #3794ff;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          a.inspect-link {
            color: #3794ff;
            text-decoration: none;
            margin-left: 4px;
            font-size: 12px;
          }
          a.inspect-link:hover {
            text-decoration: underline;
          }
          .symbol-link {
            color: #4ec9b0;
            text-decoration: none;
            font-family: monospace;
            font-weight: 500;
            cursor: pointer;
          }
          .symbol-link:hover {
            text-decoration: underline;
            color: #64d1b8;
          }
        </style>
      </head>
      <body>
        <div class="sidebar-header">
          <div class="file-info">
            <h3 title="${this.escapeHtml(ctx.filePath)}">Context: <code>${this.escapeHtml(relativeFilePath)}</code></h3>
          </div>
          <button id="refresh-btn" class="refresh-btn" onclick="refreshContext()" title="Refresh Context">🔄 Refresh</button>
        </div>

        ${featureHtml}
        ${adrHtml}
        ${prHtml}
        ${commitsHtml}
        ${testsHtml}
        ${astHtml}
        <script>
          const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
          function refreshContext() {
            if (vscode) {
              vscode.postMessage({ command: 'refresh' });
            }
          }
          function openFile(filePath) {
            if (vscode) {
              vscode.postMessage({ command: 'openFile', filePath: filePath });
            }
          }
          function openPr(prId, url) {
            if (vscode) {
              vscode.postMessage({ command: 'openPr', prId: prId, url: url });
            }
          }
          function openCommit(hash) {
            if (vscode) {
              vscode.postMessage({ command: 'openCommit', hash: hash });
            }
          }
          function gotoSymbol(symbol, filePath) {
            if (vscode) {
              vscode.postMessage({ command: 'gotoSymbol', symbol: symbol, filePath: filePath });
            }
          }
        </script>
      </body>
      </html>
    `;
  }
}
