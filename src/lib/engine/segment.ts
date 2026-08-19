/**
 * Splits text into translatable segments while preserving the whitespace
 * between them. The translation models normalize whitespace in their output,
 * so the original structure only survives if each line is translated on its
 * own and the segments are rejoined with their exact separators.
 */

export interface TextSegment {
  text: string;
  /** Whitespace that followed this segment in the original text. */
  separator: string;
}

const MAX_SEGMENT_CHARS = 400;

export function splitIntoSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let current = '';
  let pendingNewlines = '';

  const flush = (separator: string): void => {
    if (current) {
      segments.push({ text: current, separator });
      current = '';
      return;
    }
    // Consecutive blank lines merge into the previous separator.
    if (segments.length > 0) segments[segments.length - 1]!.separator += separator;
  };

  for (const char of text) {
    if (char === '\n') {
      pendingNewlines += char;
      continue;
    }
    if (pendingNewlines) {
      flush(pendingNewlines);
      pendingNewlines = '';
    }
    current += char;
    if (current.length >= MAX_SEGMENT_CHARS) {
      const spaceIndex = current.lastIndexOf(' ');
      if (spaceIndex > MAX_SEGMENT_CHARS / 2) {
        segments.push({ text: current.slice(0, spaceIndex).trimEnd(), separator: ' ' });
        current = current.slice(spaceIndex + 1);
      } else {
        // No usable word boundary: cut exactly to keep the text reversible.
        segments.push({ text: current, separator: '' });
        current = '';
      }
    }
  }

  flush(pendingNewlines);
  flush('');

  if (segments.length === 0) segments.push({ text: '', separator: '' });
  return segments;
}
