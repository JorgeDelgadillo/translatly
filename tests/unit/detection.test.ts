import { describe, expect, it } from 'vitest';
import { detectLanguage } from '@/lib/engine/detection';

describe('local language detection', () => {
  it('detects supported English text', () => {
    expect(
      detectLanguage('This is a sufficiently long English sentence for the local detector.'),
    ).toBe('en');
  });

  it('detects supported Spanish text', () => {
    expect(
      detectLanguage('Esta es una oración suficientemente larga para detectar español localmente.'),
    ).toBe('es');
  });

  it('waits for enough text before detecting', () => {
    expect(detectLanguage('short')).toBeUndefined();
    expect(detectLanguage('   ')).toBeUndefined();
  });
});
