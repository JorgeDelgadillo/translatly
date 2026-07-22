import { browser } from 'wxt/browser';
import { TranslationQueue } from './queue';
import { isUiToEngineMessage, type EngineBroadcast } from '@/lib/messaging/protocol';

export interface EngineHostOptions {
  onBroadcast?: (message: EngineBroadcast) => void;
}

/**
 * Returns the directory URL where the bundled ONNX Runtime WASM binaries are
 * served. `runtime.getURL` only accepts typed file paths, so the URL is
 * derived from one of the known files and trimmed to its directory.
 */
export function getDefaultWasmBaseUrl(): string {
  return browser.runtime.getURL('/ort/ort-wasm-simd-threaded.wasm').replace(/[^/]+$/, '');
}

/**
 * Registers the engine message listener. Must run inside the engine host
 * context (the offscreen document on Chromium; the background page on Firefox).
 */
export function startEngineHost(options: EngineHostOptions = {}): void {
  const queue = new TranslationQueue(options.onBroadcast);

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (!isUiToEngineMessage(msg)) return undefined;
    switch (msg.type) {
      case 'translate:request':
        queue.enqueue(msg);
        break;
      case 'translate:cancel':
        queue.cancel(msg.requestId);
        break;
      case 'translate:cancelAll':
        queue.cancelAll();
        break;
    }
    return undefined;
  });
}
