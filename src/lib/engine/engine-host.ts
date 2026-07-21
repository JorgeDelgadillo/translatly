import { browser } from 'wxt/browser';
import { TranslationQueue } from './queue';
import { isUiToEngineMessage } from '@/lib/messaging/protocol';

const queue = new TranslationQueue();

/**
 * Registers the engine message listener. Must run inside the engine host
 * context (the offscreen document on Chromium; the background page on Firefox).
 */
export function startEngineHost(): void {
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
