import { browser } from 'wxt/browser';
import { handleEngineTranslate, startEngineHost } from '@/lib/engine/engine-host';
import type { TranslateRequest, TranslateResponse } from '@/lib/engine/protocol';

const supportsOffscreen = (): boolean => typeof browser.offscreen !== 'undefined';

async function ensureOffscreenDocument(): Promise<void> {
  if (await browser.offscreen.hasDocument()) return;
  await browser.offscreen.createDocument({
    url: browser.runtime.getURL('/offscreen.html'),
    reasons: ['WORKERS'],
    justification:
      'Run local machine translation inference (WASM) outside the service worker, which may be terminated at any time.',
  });
}

export default defineBackground(() => {
  if (supportsOffscreen()) {
    // Chromium MV3: relay translation requests to the offscreen engine host.
    browser.runtime.onMessage.addListener(
      async (message): Promise<TranslateResponse | undefined> => {
        if (message?.type !== 'translate') return undefined;
        const { text, srcLang, tgtLang } = message as TranslateRequest;
        await ensureOffscreenDocument();
        return (await browser.runtime.sendMessage({
          type: 'engine:translate',
          text,
          srcLang,
          tgtLang,
        })) as TranslateResponse;
      },
    );
  } else {
    // Firefox MV2 has no offscreen API: the persistent background page hosts
    // the engine itself and answers translation requests directly.
    startEngineHost();
    browser.runtime.onMessage.addListener(
      async (message): Promise<TranslateResponse | undefined> => {
        if (message?.type !== 'translate') return undefined;
        const { text, srcLang, tgtLang } = message as TranslateRequest;
        return handleEngineTranslate({ type: 'engine:translate', text, srcLang, tgtLang });
      },
    );
  }
});
