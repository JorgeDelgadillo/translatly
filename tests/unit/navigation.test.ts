import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  buildTranslatorUrl,
  consumeTranslatorContext,
  saveTranslatorContext,
} from '@/lib/messaging/navigation';

describe('translator navigation context', () => {
  it('keeps text out of the URL and consumes session context once', async () => {
    const text = 'Private text that must not be placed in a URL';
    const contextId = await saveTranslatorContext({ text, source: 'en', target: 'es' });
    const url = buildTranslatorUrl('chrome-extension://test/translator.html', contextId);

    expect(url).not.toContain(text);
    expect(url).toContain(`context=${contextId}`);
    await expect(consumeTranslatorContext(contextId)).resolves.toEqual({
      text,
      source: 'en',
      target: 'es',
    });
    await expect(consumeTranslatorContext(contextId)).resolves.toBeUndefined();
    await expect(fakeBrowser.storage.session.get()).resolves.toEqual({});
  });

  it('returns a base URL when there is no context', () => {
    expect(buildTranslatorUrl('chrome-extension://test/translator.html')).toBe(
      'chrome-extension://test/translator.html',
    );
  });
});
