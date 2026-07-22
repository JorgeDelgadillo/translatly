import { browser } from 'wxt/browser';

interface TranslatorContext {
  text?: string;
  source?: string;
  target?: string;
}

/** Opens the full translator and optionally carries text from another surface. */
export function openTranslatorPage(context: TranslatorContext = {}): void {
  void browser.runtime
    .sendMessage({ type: 'translator:open', ...context })
    .catch(() => {});
}
