import { FileContext, PRInfo, CommitInfo, RelatedTest, ADRWarning } from '../types';
import { isSupportedCodeFile } from '../indexer/parsers/astParser';

export class SidebarProvider {
  private currentContext: FileContext | null = null;

  public updateContext(context: FileContext | null): void {
    this.currentContext = context;
  }

  public getCurrentContext(): FileContext | null {
    return this.currentContext;
  }

  public renderHtml(): string {
    if (!this.currentContext) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 12px; color: #cccccc; background: #1e1e1e; }
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

    const formatSource = (src?: string) => {
      if (src === 'file') return 'In-file annotation';
      if (src === 'codeowners') return 'CODEOWNERS file';
      if (src === 'feature_config') return 'Feature configuration';
      return src || 'Unknown';
    };

    const hasOwnership = ctx.featureOwnership && (ctx.featureOwnership.team || ctx.featureOwnership.owner || ctx.featureOwnership.feature);

    const featureHtml = hasOwnership
      ? `<div class="card">
          <h4>Feature Ownership</h4>
          <p><strong>Team:</strong> ${ctx.featureOwnership?.team || 'Unknown'}</p>
          <p><strong>Owner:</strong> ${ctx.featureOwnership?.owner || 'Unknown'}</p>
          ${ctx.featureOwnership?.feature ? `<p><strong>Feature:</strong> ${ctx.featureOwnership.feature}</p>` : ''}
          <p><strong>Source:</strong> ${formatSource(ctx.featureOwnership?.source)}</p>
        </div>`
      : `<div class="card"><h4>Feature Ownership</h4><p class="muted">Ownership unknown</p></div>`;

    const prHtml =
      ctx.prHistory && ctx.prHistory.length > 0
        ? `<div class="card">
            <h4>PR History</h4>
            <ul>
              ${ctx.prHistory
                .map(
                  (pr: PRInfo) =>
                    `<li><strong>${pr.id}:</strong> ${pr.title} <em>by ${pr.author} on ${pr.date}</em>${
                      pr.url ? ` <a href="${pr.url}" target="_blank" class="inspect-link">View PR</a>` : ''
                    }</li>`
                )
                .join('')}
            </ul>
          </div>`
        : `<div class="card"><h4>PR History</h4><p class="muted">No linked PR found</p></div>`;

    const commitsHtml =
      ctx.commitHistory && ctx.commitHistory.length > 0
        ? `<div class="card">
            <h4>File Commits</h4>
            <ul>
              ${ctx.commitHistory
                .map(
                  (c: CommitInfo) =>
                    `<li><code>${c.hash}</code>: ${c.message} <em>by ${c.author} on ${c.date}</em> <a href="${
                      c.url || `https://github.com/commit/${c.hash}`
                    }" target="_blank" class="inspect-link">Inspect change</a></li>`
                )
                .join('')}
            </ul>
          </div>`
        : `<div class="card"><h4>File Commits</h4><p class="muted">No commit history found.</p></div>`;

    const testsHtml =
      ctx.relatedTests && ctx.relatedTests.length > 0
        ? `<div class="card">
            <h4>Related Tests</h4>
            <ul>
              ${ctx.relatedTests
                .map(
                  (t: RelatedTest) =>
                    `<li>
                      <code>${t.file}</code> - ${t.testName}
                      <span class="test-actions">
                        <button class="test-btn" onclick="openTest('${t.file}')">Open</button>
                        <button class="test-btn" onclick="runTest('${t.file}')">Run</button>
                      </span>
                    </li>`
                )
                .join('')}
            </ul>
          </div>`
        : `<div class="card"><h4>Related Tests</h4><p class="muted">No related test found.</p></div>`;

    const realAdrs = (ctx.adrWarnings || []).filter(
      (adr: ADRWarning) => adr.id !== 'NO_ADR_DOCS' && adr.id !== 'NO_ADR_MATCH'
    );
    const hasAdrDocsSentinel = ctx.adrWarnings?.find((adr) => adr.id === 'NO_ADR_DOCS');
    const hasNoMatchSentinel = ctx.adrWarnings?.find((adr) => adr.id === 'NO_ADR_MATCH');

    let adrHtml = '';

    if (realAdrs.length === 0) {
      if (hasAdrDocsSentinel || ctx.adrWarnings?.some((a) => a.hasAdrDocs === false)) {
        adrHtml = `<div class="card"><h4>Architecture Decisions</h4><p class="muted">No ADR documents found in project.</p></div>`;
      } else {
        adrHtml = `<div class="card"><h4>Architecture Decisions</h4><p class="muted">No ADR matches this file.</p></div>`;
      }
    } else {
      const usefulAdrs = realAdrs.filter((a) => !a.needsAttention && a.status !== 'Stale Anchor');
      const attentionAdrs = realAdrs.filter((a) => a.needsAttention || a.status === 'Stale Anchor');

      const usefulList = usefulAdrs
        .map(
          (adr: ADRWarning) =>
            `<li><strong style="color:#4ec9b0;">[${adr.id}] ${adr.title}:</strong> ${adr.warning}</li>`
        )
        .join('');

      const attentionList = attentionAdrs
        .map(
          (adr: ADRWarning) =>
            `<li><strong style="color:#f14c4c;">⚠️ [${adr.id}] ${adr.title} (${adr.status}):</strong> ${adr.warning}</li>`
        )
        .join('');

      const statusMsg =
        attentionAdrs.length === 0
          ? `<p class="muted status-ok" style="color:#89d185; margin-top:6px;">✓ Matching ADR checked with no problem found.</p>`
          : '';

      adrHtml = `
        <div class="card ${attentionAdrs.length > 0 ? 'warning' : ''}">
          <h4>Architecture Decisions</h4>
          ${usefulList ? `<ul>${usefulList}</ul>` : ''}
          ${attentionList ? `<ul style="margin-top:4px;">${attentionList}</ul>` : ''}
          ${statusMsg}
        </div>
      `;
    }

    const isCode = isSupportedCodeFile(ctx.filePath);
    const astSummary = ctx.astSummary;

    let astHtml = '';
    if (!isCode || astSummary?.parseStatus === 'not_applicable') {
      astHtml = `
        <div class="card">
          <h4>Functions & Classes Summary</h4>
          <p class="muted">Not applicable</p>
        </div>
      `;
    } else if (astSummary?.parseStatus === 'failed') {
      astHtml = `
        <div class="card warning">
          <h4>Functions & Classes Summary</h4>
          <p style="color: #f14c4c; margin: 0;">Parsing failed for this file.</p>
        </div>
      `;
    } else if (astSummary) {
      const renderSymbolLinks = (items: string[], kind: 'function' | 'class') => {
        if (!items || items.length === 0) return 'None';
        return items
          .map(
            (item) =>
              `<a href="command:gitted.gotoSymbol?${encodeURIComponent(
                JSON.stringify([item, ctx.filePath])
              )}" onclick="gotoSymbol('${item}', '${ctx.filePath}')" class="symbol-link" data-symbol="${item}" data-kind="${kind}">${item}</a>`
          )
          .join(', ');
      };

      astHtml = `
        <div class="card">
          <h4>Functions & Classes Summary</h4>
          <p><strong>Functions:</strong> ${renderSymbolLinks(astSummary.functions, 'function')}</p>
          <p><strong>Classes:</strong> ${renderSymbolLinks(astSummary.classes, 'class')}</p>
        </div>
      `;
    } else {
      astHtml = `
        <div class="card">
          <h4>Functions & Classes Summary</h4>
          <p class="muted">Not applicable</p>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 12px; color: #d4d4d4; background-color: #1e1e1e; font-size: 13px; }
          .card { background-color: #252526; border: 1px solid #3c3c3c; border-radius: 4px; padding: 10px; margin-bottom: 10px; }
          .card.warning { border-left: 4px solid #f14c4c; }
          h4 { margin: 0 0 6px 0; color: #569cd6; font-size: 14px; }
          ul { margin: 0; padding-left: 18px; }
          li { margin-bottom: 4px; }
          .muted { color: #808080; font-style: italic; margin: 0; }
          code { background: #2d2d2d; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
          a.inspect-link { color: #3794ff; text-decoration: none; margin-left: 4px; font-size: 12px; }
          a.inspect-link:hover { text-decoration: underline; }
          .test-actions { margin-left: 6px; display: inline-block; }
          .test-btn { background: #0e639c; color: #ffffff; border: none; border-radius: 2px; padding: 2px 6px; font-size: 11px; cursor: pointer; margin-right: 2px; }
          .test-btn:hover { background: #1177bb; }
          .symbol-link { color: #4ec9b0; text-decoration: none; font-family: monospace; font-weight: 500; cursor: pointer; }
          .symbol-link:hover { text-decoration: underline; color: #64d1b8; }
        </style>
      </head>
      <body>
        <h3>Context: <code>${ctx.filePath}</code></h3>
        ${featureHtml}
        ${adrHtml}
        ${prHtml}
        ${commitsHtml}
        ${testsHtml}
        ${astHtml}
        <script>
          const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
          function openTest(file) {
            if (vscode) vscode.postMessage({ command: 'open', file: file });
          }
          function runTest(file) {
            if (vscode) vscode.postMessage({ command: 'run', file: file });
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
