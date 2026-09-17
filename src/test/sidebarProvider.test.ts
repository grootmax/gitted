import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { SidebarProvider } from '../sidebar/SidebarProvider';
import { FileContext } from '../types';

describe('SidebarProvider Status Badges, Relative Paths, and Refresh Button Tests', () => {
  const workspaceRoot = '/app/workspace';

  it('renders STILL LOADING status badges for all cards when isIndexing is true', () => {
    const provider = new SidebarProvider(workspaceRoot);
    const context: FileContext = {
      filePath: path.join(workspaceRoot, 'src', 'components', 'Button.tsx'),
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
      isIndexing: true,
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('badge-still-loading');
    expect(html).toContain('STILL LOADING');
    expect(html).toContain('Loading feature ownership...');
    expect(html).toContain('Loading ADR warnings...');
    expect(html).toContain('Loading PR & commit history...');
    expect(html).toContain('Loading related tests...');
    expect(html).toContain('Loading AST summary...');
  });

  it('renders short project-relative file path and refresh button in header', () => {
    const provider = new SidebarProvider(workspaceRoot);
    const absPath = path.join(workspaceRoot, 'src', 'components', 'Button.tsx');
    const context: FileContext = {
      filePath: absPath,
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('src/components/Button.tsx');
    expect(html).not.toContain('/app/workspace/src/components/Button.tsx</code>');
    expect(html).toContain('id="refresh-btn"');
    expect(html).toContain('refreshContext()');
    expect(html).toContain('🔄 Refresh');
  });

  it('renders FOUND status for explicit feature ownership, PR history, ADR warnings, and AST summary', () => {
    const provider = new SidebarProvider(workspaceRoot);
    const context: FileContext = {
      filePath: path.join(workspaceRoot, 'src', 'payment.ts'),
      featureOwnership: {
        team: 'Billing Team',
        owner: 'payment-devs',
        feature: 'Payment Gateway',
        source: 'found',
      },
      prHistory: [
        {
          id: '#101',
          title: 'Implement Payment Gateway',
          author: 'alice',
          date: '2026-09-15',
          url: 'https://github.com/pull/101',
        },
      ],
      commitHistory: [],
      relatedTests: [
        {
          file: path.join(workspaceRoot, 'tests', 'payment.test.ts'),
          testName: 'should charge credit card',
        },
      ],
      adrWarnings: [
        {
          id: 'ADR-082',
          title: 'Payment Gateway Standard',
          status: 'Accepted',
          warning: 'Use unified gateway interface',
          filePath: path.join(workspaceRoot, 'docs', 'adr', '0082-payment.md'),
        },
      ],
      astSummary: {
        functions: ['processPayment'],
        classes: ['PaymentGateway'],
        exports: [],
        imports: ['stripe'],
      },
      lastIndexedAt: Date.now(),
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('badge-found');
    expect(html).toContain('FOUND');
    expect(html).toContain('Billing Team');
    expect(html).toContain('Payment Gateway');
    expect(html).toContain('#101');
    expect(html).toContain('ADR-082');
    expect(html).toContain('tests/payment.test.ts');
    expect(html).toContain('PaymentGateway');
  });

  it('renders INFERRED status for derived feature ownership and git commit history fallback', () => {
    const provider = new SidebarProvider(workspaceRoot);
    const context: FileContext = {
      filePath: path.join(workspaceRoot, 'src', 'search', 'query.ts'),
      featureOwnership: {
        team: 'Search Team',
        owner: 'search-devs',
        feature: 'Search Engine',
        source: 'inferred',
      },
      prHistory: [],
      commitHistory: [
        {
          hash: 'c0ff333',
          author: 'bob',
          message: 'refactor: optimize search query',
          date: '2026-09-16',
        },
      ],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('badge-inferred');
    expect(html).toContain('INFERRED');
    expect(html).toContain('Inferred from directory path structure.');
    expect(html).toContain('Derived from git commit history (no PR ID matched).');
    expect(html).toContain('c0ff333');
  });

  it('renders UNAVAILABLE status for empty context cards without misleading fake data', () => {
    const provider = new SidebarProvider(workspaceRoot);
    const context: FileContext = {
      filePath: path.join(workspaceRoot, 'src', 'utils', 'helper.ts'),
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };

    provider.updateContext(context);
    const html = provider.renderHtml();

    expect(html).toContain('badge-unavailable');
    expect(html).toContain('UNAVAILABLE');
    expect(html).toContain('No feature ownership tag found.');
    expect(html).toContain('No ADR warnings for this file.');
    expect(html).toContain('No related PR history found.');
    expect(html).toContain('No related tests found.');
    expect(html).toContain('No AST symbols found for this file.');
  });

  it('handles message forwarding when refresh or navigation actions are triggered', () => {
    const provider = new SidebarProvider(workspaceRoot);
    let receivedMessage: any = null;
    provider.onDidReceiveMessage((msg) => {
      receivedMessage = msg;
    });

    provider.handleMessage({ command: 'refresh' });
    expect(receivedMessage).toEqual({ command: 'refresh' });

    provider.handleMessage({ command: 'openFile', filePath: 'src/payment.ts' });
    expect(receivedMessage).toEqual({ command: 'openFile', filePath: 'src/payment.ts' });
  });
});
