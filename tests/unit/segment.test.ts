import { describe, expect, it } from 'vitest';
import { splitIntoSegments } from '@/lib/engine/segment';

function roundTrip(text: string): string {
  return splitIntoSegments(text)
    .map((segment) => segment.text + segment.separator)
    .join('');
}

describe('text segmentation for structure-preserving translation', () => {
  it('keeps plain text as a single segment', () => {
    expect(splitIntoSegments('Hello world')).toEqual([{ text: 'Hello world', separator: '' }]);
  });

  it('preserves single line breaks', () => {
    expect(splitIntoSegments('Hello\nWorld')).toEqual([
      { text: 'Hello', separator: '\n' },
      { text: 'World', separator: '' },
    ]);
  });

  it('preserves blank lines as paragraph separators', () => {
    expect(splitIntoSegments('One\n\nTwo')).toEqual([
      { text: 'One', separator: '\n\n' },
      { text: 'Two', separator: '' },
    ]);
    expect(splitIntoSegments('One\n\n\nTwo')).toEqual([
      { text: 'One', separator: '\n\n\n' },
      { text: 'Two', separator: '' },
    ]);
  });

  it('preserves trailing line breaks', () => {
    expect(splitIntoSegments('Text\n\n')).toEqual([{ text: 'Text', separator: '\n\n' }]);
  });

  it('drops leading line breaks', () => {
    expect(splitIntoSegments('\n\nText')).toEqual([{ text: 'Text', separator: '' }]);
  });

  it('keeps spacing inside a line untouched', () => {
    expect(splitIntoSegments('two  spaces   here')).toEqual([
      { text: 'two  spaces   here', separator: '' },
    ]);
  });

  it('splits long lines at the last word boundary', () => {
    const longLine = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
    const segments = splitIntoSegments(longLine);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.text.length).toBeLessThanOrEqual(400);
      expect(segment.text.trim()).toBe(segment.text);
    }
    expect(roundTrip(longLine)).toBe(longLine);
  });

  it('splits unbroken long text exactly at the limit', () => {
    const unbroken = 'x'.repeat(950);
    const segments = splitIntoSegments(unbroken);
    expect(segments).toEqual([
      { text: 'x'.repeat(400), separator: '' },
      { text: 'x'.repeat(400), separator: '' },
      { text: 'x'.repeat(150), separator: '' },
    ]);
  });

  it('rejoins back into the original text', () => {
    const samples = [
      'Single line.',
      'Line one\nLine two',
      'Para one\n\nPara two\n\n\nPara three',
      '  indented\n\ntext with trailing newline\n\n',
      'A long line '.repeat(30) + '\n\n' + 'Another one '.repeat(25),
    ];
    for (const sample of samples) {
      expect(roundTrip(sample)).toBe(sample);
    }
  });
});
