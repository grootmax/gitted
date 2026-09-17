import { describe, it, expect } from 'vitest';
import { SidebarProvider } from '../sidebar/SidebarProvider';
import { FileContext } from '../types';

describe('SidebarProvider Feature Ownership Rendering', () => {
  it('renders "Ownership unknown" when feature ownership is undefined', () => {
    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/unknown.ts',
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };
    provider.updateContext(context);
    const html = provider.renderHtml();
    expect(html).toContain('Feature Ownership');
    expect(html).toContain('Ownership unknown');
  });

  it('renders team, owner, feature, and source provenance when feature ownership is present', () => {
    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/checkout.ts',
      featureOwnership: {
        team: 'Billing Team',
        owner: 'payment-devs',
        feature: 'Checkout V2',
        source: 'file',
      },
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };
    provider.updateContext(context);
    const html = provider.renderHtml();
    expect(html).toContain('Billing Team');
    expect(html).toContain('payment-devs');
    expect(html).toContain('Checkout V2');
    expect(html).toContain('Source:</strong> In-file annotation');
  });

  it('renders CODEOWNERS file as source provenance', () => {
    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/auth.ts',
      featureOwnership: {
        team: 'auth-devs Team',
        owner: 'auth-devs',
        source: 'codeowners',
      },
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };
    provider.updateContext(context);
    const html = provider.renderHtml();
    expect(html).toContain('auth-devs');
    expect(html).toContain('Source:</strong> CODEOWNERS file');
  });

  it('renders Feature configuration as source provenance', () => {
    const provider = new SidebarProvider();
    const context: FileContext = {
      filePath: 'src/search.ts',
      featureOwnership: {
        team: 'Catalog Team',
        owner: 'search-devs',
        feature: 'Product Search',
        source: 'feature_config',
      },
      prHistory: [],
      commitHistory: [],
      relatedTests: [],
      adrWarnings: [],
      lastIndexedAt: Date.now(),
    };
    provider.updateContext(context);
    const html = provider.renderHtml();
    expect(html).toContain('Catalog Team');
    expect(html).toContain('Source:</strong> Feature configuration');
  });
});
