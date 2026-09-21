/**
 * Pages with a `trusted-types` Content Security Policy reject
 * `createPolicy('svelte-trusted-html')`. Svelte calls that while the content
 * script is loading, and the thrown error stops the script on those pages.
 * Hiding the factory makes Svelte assign HTML strings directly. The content
 * script's own window is separate from the page's, so the page keeps its policy.
 */
export function concealTrustedTypes(target: object): boolean {
  try {
    Object.defineProperty(target, 'trustedTypes', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export function concealContentScriptTrustedTypes(): void {
  concealTrustedTypes(globalThis);
  if (typeof window !== 'undefined') concealTrustedTypes(window);
}
