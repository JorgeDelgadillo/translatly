import { franc } from 'franc-min';
import { LANGUAGES } from './registry';

export const AUTO_DETECT_CODE = 'auto';

const supportedIsoCodes = LANGUAGES.map((language) => language.iso6393);

/** Detects one of the languages supported by the local translation registry. */
export function detectLanguage(text: string): string | undefined {
  const sample = text.trim();
  if (sample.length < 10) return undefined;

  const detected = franc(sample, { only: supportedIsoCodes, minLength: 10 });
  if (detected === 'und') return undefined;
  return LANGUAGES.find((language) => language.iso6393 === detected)?.code;
}
