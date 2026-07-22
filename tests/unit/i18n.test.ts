import { describe, expect, it } from 'vitest';
import { languageLabel, translate } from '@/lib/i18n';

describe('localization helpers', () => {
  it('interpolates values in the selected locale', () => {
    expect(translate('queued', 'en', { position: 2 })).toBe('Queued · position 2');
    expect(translate('queued', 'es', { position: 2 })).toBe('En cola · posición 2');
  });

  it('keeps an unknown placeholder visible instead of dropping it', () => {
    expect(translate('removeModelConfirm', 'en')).toContain('{model}');
  });

  it('localizes language labels and falls back to unknown codes', () => {
    expect(languageLabel('fr', 'en')).toBe('French');
    expect(languageLabel('fr', 'es')).toBe('Francés');
    expect(languageLabel('xx', 'es')).toBe('xx');
  });
});
