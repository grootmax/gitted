import { describe, it, expect } from 'vitest';
import { ASTFingerprinter } from '../src/ast/fingerprinter.js';
import { GraphStore } from '../src/graph/graphStore.js';
import { GitMoveAnalyzer } from '../src/git/moveAnalyzer.js';
import { ContextBuilder } from '../src/context/contextBuilder.js';

describe('Symbol Lineage and Multi-File Extractions', () => {
  it('preserves full PR and commit timeline when relocating processRefund across files', () => {
    const graphStore = new GraphStore();
    const analyzer = new GitMoveAnalyzer(graphStore);
    const contextBuilder = new ContextBuilder(graphStore);

    // Initial commit (C1): processRefund created in checkout-service.ts
    const initialCheckoutCode = `
      export function processRefund(transactionId: string, amount: number) {
        if (amount <= 0) {
          throw new Error("Invalid amount");
        }
        return { status: "success", txId: transactionId, refunded: amount };
      }

      export function calculateTotal(items: any[]) {
        return items.reduce((sum, item) => sum + item.price, 0);
      }
    `;

    analyzer.indexCommit(
      {
        commitHash: 'commit-101',
        author: 'Alice <alice@example.com>',
        date: '2026-01-10T10:00:00Z',
        message: 'feat: add initial refund handling in checkout-service',
        prNumber: 42,
      },
      [
        {
          newFilePath: 'checkout-service.ts',
          newContent: initialCheckoutCode,
        },
      ]
    );

    graphStore.addPullRequest({
      prNumber: 42,
      title: 'Initial Checkout Service Implementation',
      designDecisions: ['Use simple refund calculation', 'Validate amount > 0'],
    });

    // Second commit (C2): processRefund modified to fix edge case in checkout-service.ts
    const updatedCheckoutCode = `
      export function processRefund(transactionId: string, amount: number) {
        if (amount <= 0) {
          throw new Error("Invalid amount");
        }
        // Fix edge case: guard against negative fee calculation
        if (!transactionId || transactionId.trim() === "") {
          throw new Error("Invalid transaction ID");
        }
        return { status: "success", txId: transactionId, refunded: amount };
      }

      export function calculateTotal(items: any[]) {
        return items.reduce((sum, item) => sum + item.price, 0);
      }
    `;

    analyzer.indexCommit(
      {
        commitHash: 'commit-102',
        author: 'Bob <bob@example.com>',
        date: '2026-02-15T14:30:00Z',
        message: 'fix: handle empty transaction ID in processRefund',
        prNumber: 88,
      },
      [
        {
          oldFilePath: 'checkout-service.ts',
          oldContent: initialCheckoutCode,
          newFilePath: 'checkout-service.ts',
          newContent: updatedCheckoutCode,
        },
      ]
    );

    graphStore.addPullRequest({
      prNumber: 88,
      title: 'Fix empty transaction ID bug',
    });

    // Third commit (C3): Refactor! Extract processRefund from checkout-service.ts into payment-service.ts
    const finalCheckoutCode = `
      export function calculateTotal(items: any[]) {
        return items.reduce((sum, item) => sum + item.price, 0);
      }
    `;

    const paymentServiceCode = `
      export function processRefund(txId: string, refundAmount: number) {
        if (refundAmount <= 0) {
          throw new Error("Invalid amount");
        }
        // Fix edge case: guard against negative fee calculation
        if (!txId || txId.trim() === "") {
          throw new Error("Invalid transaction ID");
        }
        return { status: "success", txId: txId, refunded: refundAmount };
      }
    `;

    analyzer.indexCommit(
      {
        commitHash: 'commit-103',
        author: 'Charlie <charlie@example.com>',
        date: '2026-03-01T09:15:00Z',
        message: 'refactor: extract processRefund to payment-service.ts',
        prNumber: 150,
      },
      [
        {
          oldFilePath: 'checkout-service.ts',
          oldContent: updatedCheckoutCode,
          newFilePath: 'checkout-service.ts',
          newContent: finalCheckoutCode,
        },
        {
          newFilePath: 'payment-service.ts',
          newContent: paymentServiceCode,
        },
      ]
    );

    graphStore.addPullRequest({
      prNumber: 150,
      title: 'Extract payment service module',
    });

    // Verify symbol history for payment-service.ts:processRefund
    const history = contextBuilder.getSymbolHistory('payment-service.ts:processRefund');

    expect(history.currentLocation.filePath).toBe('payment-service.ts');
    expect(history.currentLocation.symbolName).toBe('processRefund');

    // History must contain initial PR 42, fix PR 88, and refactor PR 150
    const prNumbers = history.pullRequests.map(p => p.prNumber);
    expect(prNumbers).toContain(42);
    expect(prNumbers).toContain(88);
    expect(prNumbers).toContain(150);

    // Lineage chain must link old checkout-service.ts:processRefund to payment-service.ts:processRefund
    expect(history.lineageChain.some(item => item.filePath === 'checkout-service.ts')).toBe(true);
    expect(history.lineageChain.some(item => item.filePath === 'payment-service.ts')).toBe(true);
  });
});
