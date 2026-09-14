import { describe, it, expect } from 'vitest';
import { GraphStore } from '../src/graph/graphStore.js';
import { GitMoveAnalyzer } from '../src/git/moveAnalyzer.js';
import { ContextBuilder } from '../src/context/contextBuilder.js';

describe('Contextual Warnings Retention', () => {
  it('triggers "Before You Change This" alerts on relocated functions based on legacy incident markers', () => {
    const graphStore = new GraphStore();
    const analyzer = new GitMoveAnalyzer(graphStore);
    const contextBuilder = new ContextBuilder(graphStore);

    const legacyCode = `
      export function validatePaymentGuard(amount: number, currency: string) {
        if (amount <= 0) return false;
        if (currency === "JPY" && !Number.isInteger(amount)) {
          return false;
        }
        return true;
      }
    `;

    analyzer.indexCommit(
      {
        commitHash: 'commit-legacy-01',
        author: 'Dev <dev@example.com>',
        date: '2025-11-01T12:00:00Z',
        message: 'fix(currency): add JPY zero-decimal validation check',
        prNumber: 301,
      },
      [
        {
          newFilePath: 'legacy-payment.ts',
          newContent: legacyCode,
        },
      ]
    );

    // Register incident warning on legacy location
    graphStore.addIncidentWarning({
      id: 'inc-99',
      symbolId: 'legacy-payment.ts:validatePaymentGuard',
      prNumber: 301,
      commitHash: 'commit-legacy-01',
      title: 'JPY Zero-Decimal Edge Case Fix',
      description: 'Do not allow fractional numbers for JPY currency; past production incident #INC-99 caused doubled charges.',
      severity: 'critical',
      createdAt: '2025-11-01T12:00:00Z',
    });

    // Relocate symbol to new module: new-payment-guard.ts
    const relocatedCode = `
      export function validatePaymentGuard(amt: number, curr: string) {
        if (amt <= 0) return false;
        if (curr === "JPY" && !Number.isInteger(amt)) {
          return false;
        }
        return true;
      }
    `;

    analyzer.indexCommit(
      {
        commitHash: 'commit-relocate-02',
        author: 'RefactorBot <bot@example.com>',
        date: '2026-03-10T15:00:00Z',
        message: 'refactor: move validatePaymentGuard to new-payment-guard.ts',
        prNumber: 405,
      },
      [
        {
          oldFilePath: 'legacy-payment.ts',
          oldContent: legacyCode,
          newFilePath: 'legacy-payment.ts',
          newContent: '',
        },
        {
          newFilePath: 'new-payment-guard.ts',
          newContent: relocatedCode,
        },
      ]
    );

    // Query "Before You Change This" contextual warnings for relocated symbol
    const warningResult = contextBuilder.getBeforeYouChangeThisWarnings('new-payment-guard.ts:validatePaymentGuard');

    expect(warningResult.warnings.length).toBe(1);
    expect(warningResult.warnings[0].warningId).toBe('inc-99');
    expect(warningResult.warnings[0].title).toBe('JPY Zero-Decimal Edge Case Fix');
    expect(warningResult.warnings[0].severity).toBe('critical');
    expect(warningResult.warnings[0].sourceFilePath).toBe('legacy-payment.ts');
  });
});
