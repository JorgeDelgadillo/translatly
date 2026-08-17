import { browser } from 'wxt/browser';
import { isEngineBroadcast, type EngineBroadcast } from './protocol';

/** Sends a translation request and returns its request id. */
export function sendTranslateRequest(
  text: string,
  srcLang: string,
  tgtLang: string,
  requestId = crypto.randomUUID(),
): string {
  void browser.runtime.sendMessage({ type: 'translate:request', requestId, text, srcLang, tgtLang });
  return requestId;
}

/** Cancels a single in-flight or queued translation. */
export function sendTranslateCancel(requestId: string): void {
  void browser.runtime.sendMessage({ type: 'translate:cancel', requestId });
}

/** Cancels every translation. */
export function sendTranslateCancelAll(): void {
  void browser.runtime.sendMessage({ type: 'translate:cancelAll' });
}

/**
 * Subscribes to all engine lifecycle broadcasts (queued, progress, result, error).
 * Returns an unsubscribe function. Safe to call from any extension context.
 */
export function onEngineBroadcast(handler: (msg: EngineBroadcast) => void): () => void {
  const listener = (msg: unknown) => {
    if (isEngineBroadcast(msg)) handler(msg);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
