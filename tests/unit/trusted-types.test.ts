import { describe, expect, it } from 'vitest';
import { concealTrustedTypes } from '@/entrypoints/content/trusted-types';

describe('content script trusted types', () => {
  it('hides a page factory so Svelte does not call createPolicy', () => {
    const target: { trustedTypes?: { createPolicy: () => void } } = {
      trustedTypes: {
        createPolicy: () => {
          throw new Error('csp');
        },
      },
    };

    expect(concealTrustedTypes(target)).toBe(true);
    expect(target.trustedTypes).toBeUndefined();
  });

  it('reports when the factory cannot be hidden', () => {
    const target = {};
    Object.defineProperty(target, 'trustedTypes', { configurable: false, get: () => ({}) });
    expect(concealTrustedTypes(target)).toBe(false);
  });
});
