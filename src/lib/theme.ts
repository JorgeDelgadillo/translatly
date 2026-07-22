import type { Locale, ThemePreference } from './settings';

export function applyDocumentPreferences(locale: Locale, theme: ThemePreference): void {
  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme;
}
