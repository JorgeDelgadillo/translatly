import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addTranslationHistory,
  clearTranslationHistory,
  deleteTranslationHistory,
  loadTranslationHistory,
} from '@/lib/history';
import { loadPreferences, savePreferences } from '@/lib/settings';

describe('extension storage helpers', () => {
  it('loads safe defaults and persists validated preferences', async () => {
    expect(await loadPreferences()).toEqual({
      source: 'en',
      target: 'es',
      locale: 'en',
      theme: 'system',
      onboardingSeen: false,
    });

    await savePreferences({ locale: 'es', theme: 'dark', onboardingSeen: true });
    expect(await loadPreferences()).toMatchObject({
      locale: 'es',
      theme: 'dark',
      onboardingSeen: true,
    });

    await fakeBrowser.storage.sync.set({ locale: 'fr', theme: 'solarized', onboardingSeen: 1 });
    expect(await loadPreferences()).toMatchObject({
      locale: 'en',
      theme: 'system',
      onboardingSeen: false,
    });
  });

  it('adds, deletes, caps, and clears local translation history', async () => {
    const first = await addTranslationHistory({
      text: 'Hello',
      translation: 'Hola',
      source: 'en',
      target: 'es',
    });
    expect(first.id).toMatch(/[0-9a-f-]{36}/);
    expect((await loadTranslationHistory()).map((entry) => entry.id)).toEqual([first.id]);

    await deleteTranslationHistory(first.id);
    expect(await loadTranslationHistory()).toEqual([]);

    for (let index = 0; index < 51; index += 1) {
      await addTranslationHistory({
        text: `Text ${index}`,
        translation: `Translation ${index}`,
        source: 'en',
        target: 'es',
      });
    }
    const capped = await loadTranslationHistory();
    expect(capped).toHaveLength(50);
    expect(capped[0]?.text).toBe('Text 50');

    await clearTranslationHistory();
    expect(await loadTranslationHistory()).toEqual([]);
  });
});
