// Curated language and model registry. Direct OPUS-MT pairs are preferred
// whenever they exist; NLLB provides the local fallback for every other
// combination in this registry.

export interface Language {
  code: string;
  name: string;
  iso6393: string;
  nllbCode: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', iso6393: 'eng', nllbCode: 'eng_Latn' },
  { code: 'es', name: 'Spanish', iso6393: 'spa', nllbCode: 'spa_Latn' },
  { code: 'fr', name: 'French', iso6393: 'fra', nllbCode: 'fra_Latn' },
  { code: 'de', name: 'German', iso6393: 'deu', nllbCode: 'deu_Latn' },
  { code: 'it', name: 'Italian', iso6393: 'ita', nllbCode: 'ita_Latn' },
  { code: 'pt', name: 'Portuguese', iso6393: 'por', nllbCode: 'por_Latn' },
];

export const NLLB_MODEL_ID = 'Xenova/nllb-200-distilled-600M';

export interface PairEntry {
  modelId: string;
}

const PAIRS: Record<string, PairEntry> = {
  'en->es': { modelId: 'Xenova/opus-mt-en-es' },
  'es->en': { modelId: 'Xenova/opus-mt-es-en' },
  'en->fr': { modelId: 'Xenova/opus-mt-en-fr' },
  'fr->en': { modelId: 'Xenova/opus-mt-fr-en' },
};

export type TranslationRoute =
  | {
      kind: 'opus';
      modelId: string;
    }
  | {
      kind: 'nllb';
      modelId: typeof NLLB_MODEL_ID;
      srcModelCode: string;
      tgtModelCode: string;
    };

export type ModelKind = 'opus' | 'nllb';

export interface ModelDescriptor {
  modelId: string;
  kind: ModelKind;
  label: string;
  description: string;
  estimatedBytes: number;
  languageCodes: string[];
}

const OPUS_ESTIMATED_BYTES = 110 * 1024 * 1024;
const NLLB_ESTIMATED_BYTES = 900 * 1024 * 1024;

const nllbLanguageCodes = LANGUAGES.map((language) => language.code);

export const MODEL_REGISTRY: ModelDescriptor[] = [
  ...Object.entries(PAIRS).map(([key, entry]) => {
    const [source, target] = key.split('->');
    return {
      modelId: entry.modelId,
      kind: 'opus' as const,
      label: `${languageName(source!)} → ${languageName(target!)}`,
      description: 'Fast, compact pair model',
      estimatedBytes: OPUS_ESTIMATED_BYTES,
      languageCodes: [source!, target!],
    };
  }),
  {
    modelId: NLLB_MODEL_ID,
    kind: 'nllb',
    label: 'NLLB universal fallback',
    description: 'Any-to-any translation across the curated languages',
    estimatedBytes: NLLB_ESTIMATED_BYTES,
    languageCodes: nllbLanguageCodes,
  },
];

export function pairKey(src: string, tgt: string): string {
  return `${src}->${tgt}`;
}

export function getLanguage(code: string): Language | undefined {
  return LANGUAGES.find((language) => language.code === code);
}

export function getPair(src: string, tgt: string): PairEntry | undefined {
  return PAIRS[pairKey(src, tgt)];
}

/** Returns the direct OPUS route or the NLLB fallback for a language pair. */
export function getTranslationRoute(src: string, tgt: string): TranslationRoute | undefined {
  if (src === tgt) return undefined;

  const directPair = getPair(src, tgt);
  if (directPair) return { kind: 'opus', modelId: directPair.modelId };

  const source = getLanguage(src);
  const target = getLanguage(tgt);
  if (!source || !target) return undefined;

  return {
    kind: 'nllb',
    modelId: NLLB_MODEL_ID,
    srcModelCode: source.nllbCode,
    tgtModelCode: target.nllbCode,
  };
}

/** Language codes that can be translated to from `src`. */
export function supportedTargets(src: string): string[] {
  return LANGUAGES.filter((language) => getTranslationRoute(src, language.code)).map(
    (language) => language.code,
  );
}

export function getModelDescriptor(modelId: string): ModelDescriptor | undefined {
  return MODEL_REGISTRY.find((model) => model.modelId === modelId);
}

export function languageName(code: string): string {
  return getLanguage(code)?.name ?? code;
}
