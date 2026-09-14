import { describe, it, expect } from 'vitest';
import { ASTFingerprinter } from '../src/ast/fingerprinter.js';

describe('ASTFingerprinter', () => {
  const fingerprinter = new ASTFingerprinter();

  it('computes identical fingerprints for functions differing only in parameter names and whitespace', () => {
    const code1 = `
      export function processRefund(transactionId: string, amount: number) {
        if (amount <= 0) {
          throw new Error("Invalid amount");
        }
        const result = executeRefund(transactionId, amount);
        return result;
      }
    `;

    const code2 = `
      export function processRefund(txId: string, refundAmt: number) {
        if (refundAmt <= 0) {
          throw new Error("Invalid amount");
        }

        const res = executeRefund(txId, refundAmt);

        return res;
      }
    `;

    const symbols1 = fingerprinter.extractSymbols('checkout-service.ts', code1);
    const symbols2 = fingerprinter.extractSymbols('payment-service.ts', code2);

    expect(symbols1.length).toBe(1);
    expect(symbols2.length).toBe(1);

    expect(symbols1[0].name).toBe('processRefund');
    expect(symbols2[0].name).toBe('processRefund');

    expect(fingerprinter.matches(symbols1[0], symbols2[0])).toBe(true);
  });

  it('detects moves when internal parameters or local formatting are modified', () => {
    const code1 = `
      export function calculateTax(price: number, taxRate: number): number {
        const tax = price * taxRate;
        return Math.round(tax * 100) / 100;
      }
    `;

    const code2 = `
      export function calculateTax(basePrice: number, rate: number): number {
        const computedTax = basePrice * rate;
        // round to two decimal places
        return Math.round(computedTax * 100) / 100;
      }
    `;

    const s1 = fingerprinter.extractSymbols('a.ts', code1)[0];
    const s2 = fingerprinter.extractSymbols('b.ts', code2)[0];

    expect(fingerprinter.matches(s1, s2)).toBe(true);
  });

  it('distinguishes between unrelated functions with different structural logic', () => {
    const code1 = `
      export function processRefund(transactionId: string, amount: number) {
        if (amount <= 0) throw new Error("Invalid amount");
        return executeRefund(transactionId, amount);
      }
    `;

    const code2 = `
      export function generateInvoice(user: User, items: Item[]) {
        const total = items.reduce((sum, item) => sum + item.price, 0);
        return createInvoicePdf(user.id, total);
      }
    `;

    const s1 = fingerprinter.extractSymbols('checkout.ts', code1)[0];
    const s2 = fingerprinter.extractSymbols('invoice.ts', code2)[0];

    const similarity = fingerprinter.computeSimilarity(s1.normalizedAST, s2.normalizedAST);
    expect(similarity).toBeLessThan(0.75);
    expect(fingerprinter.matches(s1, s2)).toBe(false);
  });
});
