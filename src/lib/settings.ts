import { browser } from 'wxt/browser';

const DEFAULTS = { source: 'en', target: 'es' } as const;
export type Locale = 'en' | 'es';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface UserPreferences {
  source: string;
  target: string;
  locale: Locale;
  theme: ThemePreference;
  onboardingSeen: boolean;
}

const PREFERENCE_DEFAULTS: UserPreferences = {
  ...DEFAULTS,
  locale: 'en',
  theme: 'system',
  onboardingSeen: false,
};

export interface DefaultLanguages {
  source: string;
  target: string;
}

export async function loadPreferences(): Promise<UserPreferences> {
  const stored = (await browser.storage.sync.get(PREFERENCE_DEFAULTS)) as Partial<UserPreferences>;
  return {
    source: stored.source ?? PREFERENCE_DEFAULTS.source,
    target: stored.target ?? PREFERENCE_DEFAULTS.target,
    locale: stored.locale === 'es' ? 'es' : 'en',
    theme:
      stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : PREFERENCE_DEFAULTS.theme,
    onboardingSeen: stored.onboardingSeen === true,
  };
}

export async function savePreferences(value: Partial<UserPreferences>): Promise<void> {
  await browser.storage.sync.set(value);
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
