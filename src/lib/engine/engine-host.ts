import { browser } from 'wxt/browser';
import { translate } from './translator';
import type { EngineTranslateRequest, EngineProgressMessage, TranslateResponse } from './protocol';

/** Runs a translation request against the local engine, broadcasting progress. */
export async function handleEngineTranslate(
  request: EngineTranslateRequest,
): Promise<TranslateResponse> {
  try {
    const translation = await translate(request.text, {
      // runtime.getURL only accepts typed file paths, so derive the directory
      // URL from one of the bundled WASM binaries.
      wasmBaseUrl: browser.runtime
        .getURL('/ort/ort-wasm-simd-threaded.wasm')
        .replace(/[^/]+$/, ''),
      onProgress: (progress) => {
        const message: EngineProgressMessage = { type: 'engine:progress', ...progress };
        // Broadcast to any listening surface (e.g. the popup). Fails silently
        // when no receiver is open.
        void browser.runtime.sendMessage(message).catch(() => {});
      },
    });
    return { ok: true, translation };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Registers the engine message listener. Must run inside the engine host
 * context (the offscreen document on Chromium).
 */
export function startEngineHost(): void {
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'engine:translate') return undefined;
    return handleEngineTranslate(message as EngineTranslateRequest);
  });
}
