import { FileContext, PRInfo, RelatedTest, ADRWarning } from '../types';

export class SidebarProvider {
  private currentContext: FileContext | null = null;

  public updateContext(context: FileContext | null): void {
    this.currentContext = context;
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

    const featureHtml = ctx.featureOwnership
      ? `<div class="card">
          <h4>Feature Ownership</h4>
          <p><strong>Team:</strong> ${ctx.featureOwnership.team}</p>
          <p><strong>Owner:</strong> ${ctx.featureOwnership.owner}</p>
          <p><strong>Feature:</strong> ${ctx.featureOwnership.feature}</p>
        </div>`
      : `<div class="card"><h4>Feature Ownership</h4><p class="muted">No feature ownership tag found.</p></div>`;

    const prHtml =
      ctx.prHistory && ctx.prHistory.length > 0
        ? `<div class="card">
            <h4>PR History</h4>
            <ul>
              ${ctx.prHistory
                .map(
                  (pr: PRInfo) =>
                    `<li><strong>${pr.id}:</strong> ${pr.title} <em>by ${pr.author} on ${pr.date}</em></li>`
                )
                .join('')}
            </ul>
          </div>`
        : ctx.commitHistory && ctx.commitHistory.length > 0
        ? `<div class="card">
            <h4>PR & Commit History</h4>
            <ul>
              ${ctx.commitHistory
                .map(
                  (c) =>
                    `<li><strong>${c.hash}:</strong> ${c.message} <em>by ${c.author} on ${c.date}</em></li>`
                )
                .join('')}
            </ul>
          </div>`
        : `<div class="card"><h4>PR History</h4><p class="muted">No related PR history found.</p></div>`;

    const testsHtml =
      ctx.relatedTests && ctx.relatedTests.length > 0
        ? `<div class="card">
            <h4>Related Tests</h4>
            <ul>
              ${ctx.relatedTests
                .map((t: RelatedTest) => `<li><code>${t.file}</code> - ${t.testName}</li>`)
                .join('')}
            </ul>
          </div>`
        : `<div class="card"><h4>Related Tests</h4><p class="muted">No related tests found.</p></div>`;

    const adrHtml =
      ctx.adrWarnings && ctx.adrWarnings.length > 0
        ? `<div class="card warning">
            <h4>ADR Warnings</h4>
            <ul>
              ${ctx.adrWarnings
                .map(
                  (adr: ADRWarning) =>
                    `<li><strong style="color:#f14c4c;">[${adr.id}] ${adr.title}:</strong> ${adr.warning}</li>`
                )
                .join('')}
            </ul>
          </div>`
        : `<div class="card"><h4>ADR Warnings</h4><p class="muted">No ADR warnings for this file.</p></div>`;

    const astHtml = ctx.astSummary
      ? `<div class="card">
          <h4>AST Node Summary</h4>
          <p><strong>Functions:</strong> ${ctx.astSummary.functions.join(', ') || 'None'}</p>
          <p><strong>Classes:</strong> ${ctx.astSummary.classes.join(', ') || 'None'}</p>
        </div>`
      : '';

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
        </style>
      </head>
      <body>
        <h3>Context: <code>${ctx.filePath}</code></h3>
        ${featureHtml}
        ${adrHtml}
        ${prHtml}
        ${testsHtml}
        ${astHtml}
      </body>
      </html>
    `;
  }
}
