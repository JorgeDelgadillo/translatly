import { browser } from 'wxt/browser';

const DEFAULTS = { source: 'en', target: 'es' } as const;
export interface DefaultLanguages {
  source: string;
  target: string;
}

/** Loads the user's default language pair, falling back to sensible defaults. */
export async function loadDefaultLanguages(): Promise<DefaultLanguages> {
  const stored = (await browser.storage.sync.get(DEFAULTS)) as Partial<DefaultLanguages>;
  return { source: stored.source ?? DEFAULTS.source, target: stored.target ?? DEFAULTS.target };
}

/** Persists the user's default language pair. */
export async function saveDefaultLanguages(value: DefaultLanguages): Promise<void> {
  await browser.storage.sync.set(value);
}
