// Curated language → OPUS-MT model registry. Phase 4 ships a small,
// en-centric set of pairs to keep the proof-of-concept lean. Phase 7
// (model manager) will formalise availability, download progress, and
// expand coverage (NLLB for any-to-any).
//
// Each entry maps a directed language pair to a Xenova/opus-mt ONNX model
// that has been converted for use with @huggingface/transformers.

export interface Language {
  code: string;
  name: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
];

interface PairEntry {
  modelId: string;
}

const PAIRS: Record<string, PairEntry> = {
  'en->es': { modelId: 'Xenova/opus-mt-en-es' },
  'es->en': { modelId: 'Xenova/opus-mt-es-en' },
  'en->fr': { modelId: 'Xenova/opus-mt-en-fr' },
  'fr->en': { modelId: 'Xenova/opus-mt-fr-en' },
};

export function pairKey(src: string, tgt: string): string {
  return `${src}->${tgt}`;
}

export function getPair(src: string, tgt: string): PairEntry | undefined {
  return PAIRS[pairKey(src, tgt)];
}

/** Language codes that can be translated to from `src` (i.e. have a registered model). */
export function supportedTargets(src: string): string[] {
  return Object.keys(PAIRS)
    .filter((k) => k.startsWith(`${src}->`))
    .map((k) => k.split('->')[1]!);
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}
