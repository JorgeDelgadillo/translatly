import { browser } from 'wxt/browser';
import {
  isEngineBroadcast,
  isEngineInternalMessage,
  isModelManagerMessage,
  isOpenTranslatorMessage,
  isUiToEngineMessage,
  type EngineBroadcast,
  type OpenTranslatorMessage,
} from '@/lib/messaging/protocol';
import {
  buildTranslatorUrl,
  discardTranslatorContext,
  saveTranslatorContext,
} from '@/lib/messaging/navigation';

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

/**
 * Resolves once the offscreen engine host has registered its message listener.
 * The first message after the background service worker starts is held back
 * until the offscreen document's script has finished loading; subsequent
 * messages resolve immediately (the promise is memoised).
 */
let engineReadyPromise: Promise<void> | null = null;
function whenEngineReady(): Promise<void> {
  if (engineReadyPromise) return engineReadyPromise;
  engineReadyPromise = new Promise<void>((resolve) => {
    const onReady = (msg: unknown) => {
      if (isEngineInternalMessage(msg)) {
        browser.runtime.onMessage.removeListener(onReady);
        resolve();
      }
    };
    browser.runtime.onMessage.addListener(onReady);
    // Safety: if the offscreen document was created in a previous service
    // worker lifetime we will never see another `engine:ready`; do not block
    // the user forever in that case.
    setTimeout(() => {
      browser.runtime.onMessage.removeListener(onReady);
      resolve();
    }, 2000);
  });
  return engineReadyPromise;
}

/**
 * Delivers engine lifecycle messages to content scripts. Runtime messages
 * reach extension pages (popup/background/offscreen), but content scripts
 * must be addressed through their tab.
 */
function forwardToContentScripts(message: EngineBroadcast): void {
  void browser.tabs
    .query({})
    .then((tabs) =>
      Promise.all(
        tabs.map((tab) => {
          if (tab.id == null) return undefined;
          return browser.tabs.sendMessage(tab.id, message).catch(() => undefined);
        }),
      ),
    )
    .catch(() => {});
}

/**
 * Firefox hosts the engine in this background page, so it cannot rely on
 * receiving its own runtime broadcast to perform the tab forwarding.
 */
function publishFirefoxBroadcast(message: EngineBroadcast): void {
  void browser.runtime.sendMessage(message).catch(() => {});
  forwardToContentScripts(message);
}

/**
 * The Firefox engine is loaded dynamically to keep it out of Chromium's
 * service worker. Buffer engine messages synchronously so startup cannot lose
 * a request while that local module is being evaluated.
 */
function startFirefoxEngine(): void {
  const pendingMessages: unknown[] = [];
  const bufferMessage = (message: unknown) => {
    if (isUiToEngineMessage(message) || isModelManagerMessage(message)) {
      pendingMessages.push(message);
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(bufferMessage);

  void import('@/lib/engine/engine-host').then(({ startEngineHost }) => {
    browser.runtime.onMessage.removeListener(bufferMessage);
    startEngineHost({ onBroadcast: publishFirefoxBroadcast });
    for (const message of pendingMessages) {
      void browser.runtime.sendMessage(message).catch(() => {});
    }
  });
}

async function openTranslatorPage(message: OpenTranslatorMessage): Promise<void> {
  const context = { text: message.text, source: message.source, target: message.target };
  const contextId = await saveTranslatorContext(context);
  const url = buildTranslatorUrl(browser.runtime.getURL('/translator.html'), contextId);

  try {
    await browser.tabs.create({ url });
  } catch {
    await discardTranslatorContext(contextId).catch(() => {});
  }
}

/**
 * Tries to deliver the context-menu translation to the page's content script.
 * Resolves false when the script is not reachable (for example, in a tab that
 * was opened before the extension was installed or reloaded).
 */
async function deliverTranslateSelection(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'translate-selection' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fallback for pages whose content script is missing: reads the selected text
 * directly from the page and opens the full translator with it.
 */
async function translateSelectionFallback(tabId: number): Promise<void> {
  let text = '';
  if (import.meta.env.FIREFOX) {
    // Firefox's scripting.executeScript does not support `func`, so use the
    // tabs.executeScript equivalent. `<all_urls>` host permission covers it.
    const results = await browser.tabs.executeScript(tabId, {
      allFrames: true,
      code: 'window.getSelection()?.toString().trim() ?? ""',
    });
    text = (results ?? []).find((result) => typeof result === 'string' && result) ?? '';
  } else {
    const results = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => window.getSelection()?.toString().trim() ?? '',
    });
    text =
      results.find((result) => typeof result.result === 'string' && result.result)?.result ?? '';
  }
  if (text) await openTranslatorPage({ type: 'translator:open', text });
}

export default defineBackground(() => {
  console.log('[Translatly] Background script loaded');

  // Create context menu for translating selected text
  browser.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate with Translatly',
    contexts: ['selection'],
  });
  console.log('[Translatly] Context menu created');

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'translate-selection' || !tab?.id) return;
    const delivered = await deliverTranslateSelection(tab.id);
    if (!delivered) {
      console.error('[Translatly] Content script not reachable; using fallback for tab', tab.id);
      await translateSelectionFallback(tab.id).catch((error) =>
        console.error('[Translatly] Fallback translation failed:', error),
      );
    }
  });

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (!isOpenTranslatorMessage(msg)) return undefined;
    void openTranslatorPage(msg);
    return undefined;
  });

  if (supportsOffscreen()) {
    // Chromium MV3: relay UI messages to the offscreen engine host. Results
    // come back as engine broadcasts and are forwarded to content scripts.
    browser.runtime.onMessage.addListener(async (msg: unknown) => {
      if (isEngineBroadcast(msg)) {
        forwardToContentScripts(msg);
        return undefined;
      }
      if (!isUiToEngineMessage(msg)) return undefined;
      await ensureOffscreenDocument();
      await whenEngineReady();
      browser.runtime.sendMessage(msg).catch(() => {});
      return undefined;
    });
  } else {
    // Firefox MV2 has no offscreen API: the persistent background page hosts
    // the engine itself and publishes results to extension pages and tabs.
    if (import.meta.env.FIREFOX) startFirefoxEngine();
  }
});
