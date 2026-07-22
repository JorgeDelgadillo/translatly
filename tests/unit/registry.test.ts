import { describe, expect, it } from 'vitest';
import {
  getModelDescriptor,
  getTranslationRoute,
  languageName,
  pairKey,
  supportedTargets,
  NLLB_MODEL_ID,
} from '@/lib/engine/registry';

describe('translation registry', () => {
  it('prefers a direct OPUS route when a curated pair exists', () => {
    expect(getTranslationRoute('en', 'es')).toEqual({
      kind: 'opus',
      modelId: 'Xenova/opus-mt-en-es',
    });
  });

  it('uses NLLB as the fallback for another supported pair', () => {
    expect(getTranslationRoute('es', 'de')).toEqual({
      kind: 'nllb',
      modelId: NLLB_MODEL_ID,
      srcModelCode: 'spa_Latn',
      tgtModelCode: 'deu_Latn',
    });
  });

  it('rejects same-language and unknown routes', () => {
    expect(getTranslationRoute('en', 'en')).toBeUndefined();
    expect(getTranslationRoute('xx', 'es')).toBeUndefined();
    expect(getTranslationRoute('en', 'xx')).toBeUndefined();
  });

  it('lists every supported target except the source language', () => {
    expect(supportedTargets('en')).toEqual(['es', 'fr', 'de', 'it', 'pt']);
    expect(supportedTargets('xx')).toEqual([]);
  });

  it('resolves model descriptors and safe display labels', () => {
    expect(pairKey('fr', 'en')).toBe('fr->en');
    expect(getModelDescriptor('Xenova/opus-mt-en-fr')?.kind).toBe('opus');
    expect(getModelDescriptor(NLLB_MODEL_ID)?.kind).toBe('nllb');
    expect(languageName('en')).toBe('English');
    expect(languageName('xx')).toBe('xx');
  });
});
