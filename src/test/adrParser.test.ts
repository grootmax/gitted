import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseAdrAsync } from '../indexer/parsers/adrParser';

describe('parseAdrAsync Engine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitted-adr-test-'));
    fs.mkdirSync(path.join(tmpDir, 'docs', 'adr'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses YAML frontmatter ADR with anchored file and symbol', async () => {
    const adrPath = path.join(tmpDir, 'docs', 'adr', '0082-payment-gateway.md');
    fs.writeFileSync(
      adrPath,
      `---
id: ADR-082
title: Payment Gateway Standard
status: Accepted
anchors:
  - file: src/payment.ts
    symbol: processPayment
---
# Rationale: Use unified gateway interface.
`
    );

    const sourcePath = path.join(tmpDir, 'src', 'payment.ts');
    const sourceContent = `
      export function processPayment(amount: number) {
        return true;
      }
    `;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    expect(warnings.length).toBe(1);
    expect(warnings[0].id).toBe('ADR-082');
    expect(warnings[0].title).toBe('Payment Gateway Standard');
    expect(warnings[0].status).toBe('Accepted');
    expect(warnings[0].warning).toContain('Use unified gateway interface');
  });

  it('marks ADR status as Stale Anchor when referenced symbol is missing in source file', async () => {
    const adrPath = path.join(tmpDir, 'docs', 'adr', '0082-payment-gateway.md');
    fs.writeFileSync(
      adrPath,
      `---
id: ADR-082
title: Payment Gateway Standard
status: Accepted
anchors:
  - file: src/payment.ts
    symbol: missingSymbolMethod
---
# Payment Gateway
`
    );

    const sourcePath = path.join(tmpDir, 'src', 'payment.ts');
    const sourceContent = `
      export function processPayment(amount: number) {
        return true;
      }
    `;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    expect(warnings.length).toBe(1);
    expect(warnings[0].id).toBe('ADR-082');
    expect(warnings[0].status).toBe('Stale Anchor');
    expect(warnings[0].warning).toContain('Stale Anchor');
    expect(warnings[0].warning).toContain('missingSymbolMethod');
  });

  it('filters out Superseded ADRs from primary active warnings', async () => {
    const adrPath = path.join(tmpDir, 'docs', 'adr', '0024-old-stripe.md');
    fs.writeFileSync(
      adrPath,
      `---
id: ADR-024
title: Direct Stripe Calls
status: Superseded
superseded_by: ADR-082
anchors:
  - src/payment.ts
---
Old Stripe rule.
`
    );

    const sourcePath = path.join(tmpDir, 'src', 'payment.ts');
    const sourceContent = `export function processPayment() {}`;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    const adr24 = warnings.find((w) => w.id === 'ADR-024');
    expect(adr24).toBeUndefined();
  });

  it('matches unanchored general ADRs across workspace files', async () => {
    const adrPath = path.join(tmpDir, 'docs', 'adr', '0001-architecture.md');
    fs.writeFileSync(
      adrPath,
      `---
id: ADR-001
title: Monorepo Architecture Guidelines
status: Accepted
---
# Decision: Keep code modular and enforce zero circular imports.
`
    );

    const sourcePath = path.join(tmpDir, 'src', 'service.ts');
    const sourceContent = `export class CoreService {}`;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    expect(warnings.length).toBe(1);
    expect(warnings[0].id).toBe('ADR-001');
    expect(warnings[0].title).toBe('Monorepo Architecture Guidelines');
  });

  it('parses inline @adr annotations from source code comments', async () => {
    const sourcePath = path.join(tmpDir, 'src', 'order.ts');
    const sourceContent = `
      // @adr ADR-009: Orders must be processed asynchronously via queue
      export function createOrder() {}
    `;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    expect(warnings.length).toBe(1);
    expect(warnings[0].id).toBe('ADR-009');
    expect(warnings[0].warning).toContain('Orders must be processed asynchronously');
  });

  it('returns NO_ADR_DOCS sentinel when project has no ADR documents', async () => {
    // Delete the empty docs/adr folder created in beforeEach
    fs.rmSync(path.join(tmpDir, 'docs'), { recursive: true, force: true });

    const sourcePath = path.join(tmpDir, 'src', 'payment.ts');
    const sourceContent = `export function processPayment() {}`;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toBe('NO_ADR_DOCS');
    expect(warnings[0].hasAdrDocs).toBe(false);
  });

  it('returns NO_ADR_MATCH sentinel when project has ADR documents but none match open file', async () => {
    const adrPath = path.join(tmpDir, 'docs', 'adr', '0099-unrelated.md');
    fs.writeFileSync(
      adrPath,
      `---
id: ADR-099
title: Unrelated ADR
status: Accepted
anchors:
  - file: src/other.ts
---
Decision for other.ts
`
    );

    const sourcePath = path.join(tmpDir, 'src', 'payment.ts');
    const sourceContent = `export function processPayment() {}`;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toBe('NO_ADR_MATCH');
    expect(warnings[0].hasAdrDocs).toBe(true);
  });

  it('never generates a warning solely because a filename contains "payment"', async () => {
    // Project with no matching ADR for payment_gateway.ts
    const sourcePath = path.join(tmpDir, 'src', 'payment_gateway.ts');
    const sourceContent = `export function charge() {}`;
    fs.writeFileSync(sourcePath, sourceContent);

    const warnings = await parseAdrAsync(sourcePath, tmpDir, sourceContent);
    const adr4 = warnings.find((w) => w.id === 'ADR-004');
    expect(adr4).toBeUndefined();
  });
});
