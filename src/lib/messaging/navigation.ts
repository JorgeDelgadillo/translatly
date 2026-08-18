import { browser } from 'wxt/browser';

export interface TranslatorContext {
  text?: string;
  source?: string;
  target?: string;
}

const CONTEXT_KEY_PREFIX = 'translator-context:';

function contextKey(id: string): string {
  return `${CONTEXT_KEY_PREFIX}${id}`;
}

function isTranslatorContext(value: unknown): value is TranslatorContext {
  if (typeof value !== 'object' || value === null) return false;
  const context = value as TranslatorContext;
  return (
    (context.text === undefined || typeof context.text === 'string') &&
    (context.source === undefined || typeof context.source === 'string') &&
    (context.target === undefined || typeof context.target === 'string')
  );
}

/** Stores navigation context in session storage and returns an opaque id. */
export async function saveTranslatorContext(context: TranslatorContext): Promise<string> {
  const id = crypto.randomUUID();
  await browser.storage.session.set({ [contextKey(id)]: context });
  return id;
}

/** Reads and removes one-time translator context from session storage. */
export async function consumeTranslatorContext(id: string): Promise<TranslatorContext | undefined> {
  const key = contextKey(id);
  const stored = await browser.storage.session.get(key);
  await browser.storage.session.remove(key);
  const context = stored[key];
  return isTranslatorContext(context) ? context : undefined;
}

export async function discardTranslatorContext(id: string): Promise<void> {
  await browser.storage.session.remove(contextKey(id));
}

/** Builds a translator URL without placing user text in its query string. */
export function buildTranslatorUrl(baseUrl: string, contextId?: string): string {
  if (!contextId) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}context=${encodeURIComponent(contextId)}`;
}

/** Opens the full translator and optionally carries text from another surface. */
export function openTranslatorPage(context: TranslatorContext = {}): void {
  void browser.runtime
    .sendMessage({ type: 'translator:open', ...context })
    .catch(() => {});
}
