import { browser } from 'wxt/browser';
import { getTranslationRoute } from './engine/registry';

const HISTORY_KEY = 'translationHistory';
const MAX_HISTORY_ENTRIES = 50;
const MAX_HISTORY_TEXT_LENGTH = 20_000;

export interface TranslationHistoryEntry {
  id: string;
  text: string;
  translation: string;
  source: string;
  target: string;
  createdAt: number;
}

function isHistoryEntry(value: unknown): value is TranslationHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<TranslationHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.text === 'string' &&
    entry.text.length <= MAX_HISTORY_TEXT_LENGTH &&
    typeof entry.translation === 'string' &&
    entry.translation.length <= MAX_HISTORY_TEXT_LENGTH &&
    typeof entry.source === 'string' &&
    typeof entry.target === 'string' &&
    getTranslationRoute(entry.source, entry.target) !== undefined &&
    typeof entry.createdAt === 'number' &&
    Number.isFinite(entry.createdAt) &&
    entry.createdAt >= 0
  );
}

/** Loads recent translations from local storage. History never syncs off-device. */
export async function loadTranslationHistory(): Promise<TranslationHistoryEntry[]> {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  const entries = stored[HISTORY_KEY];
  if (!Array.isArray(entries)) return [];
  return entries.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
}

/** Adds a translation to the front of local history and caps its size. */
export async function addTranslationHistory(
  entry: Omit<TranslationHistoryEntry, 'id' | 'createdAt'>,
): Promise<TranslationHistoryEntry> {
  const created: TranslationHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const history = await loadTranslationHistory();
  await browser.storage.local.set({
    [HISTORY_KEY]: [created, ...history].slice(0, MAX_HISTORY_ENTRIES),
  });
  return created;
}

/** Removes one item from local history. */
export async function deleteTranslationHistory(id: string): Promise<void> {
  const history = await loadTranslationHistory();
  await browser.storage.local.set({
    [HISTORY_KEY]: history.filter((entry) => entry.id !== id),
  });
}

/** Clears all locally stored translations. */
export async function clearTranslationHistory(): Promise<void> {
  await browser.storage.local.remove(HISTORY_KEY);
}
