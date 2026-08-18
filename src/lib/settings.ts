import { browser } from 'wxt/browser';
import { getLanguage, getTranslationRoute } from './engine/registry';

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

function isValidLanguagePair(source: unknown, target: unknown): boolean {
  return (
    typeof source === 'string' &&
    typeof target === 'string' &&
    getLanguage(source) !== undefined &&
    getTranslationRoute(source, target) !== undefined
  );
}

function safeLanguagePair(
  source: unknown,
  target: unknown,
  fallback: DefaultLanguages = DEFAULTS,
): DefaultLanguages {
  return isValidLanguagePair(source, target)
    ? { source: source as string, target: target as string }
    : { ...fallback };
}

export async function loadPreferences(): Promise<UserPreferences> {
  const stored = (await browser.storage.sync.get(PREFERENCE_DEFAULTS)) as Partial<UserPreferences>;
  const pair = safeLanguagePair(stored.source, stored.target);
  return {
    ...pair,
    locale: stored.locale === 'es' ? 'es' : 'en',
    theme:
      stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : PREFERENCE_DEFAULTS.theme,
    onboardingSeen: stored.onboardingSeen === true,
  };
}

export async function savePreferences(value: Partial<UserPreferences>): Promise<void> {
  const current = await loadPreferences();
  const updates: Partial<UserPreferences> = {};

  if (value.source !== undefined || value.target !== undefined) {
    Object.assign(
      updates,
      safeLanguagePair(value.source ?? current.source, value.target ?? current.target, current),
    );
  }
  if (value.locale === 'en' || value.locale === 'es') updates.locale = value.locale;
  if (value.theme === 'system' || value.theme === 'light' || value.theme === 'dark') {
    updates.theme = value.theme;
  }
  if (typeof value.onboardingSeen === 'boolean') updates.onboardingSeen = value.onboardingSeen;

  if (Object.keys(updates).length > 0) await browser.storage.sync.set(updates);
}

/** Loads the user's default language pair, falling back to sensible defaults. */
export async function loadDefaultLanguages(): Promise<DefaultLanguages> {
  const stored = (await browser.storage.sync.get(DEFAULTS)) as Partial<DefaultLanguages>;
  return safeLanguagePair(stored.source, stored.target);
}

/** Persists the user's default language pair. */
export async function saveDefaultLanguages(value: DefaultLanguages): Promise<void> {
  await browser.storage.sync.set(safeLanguagePair(value.source, value.target));
}
