import { browser } from 'wxt/browser';
import {
  isEngineBroadcast,
  isEngineInternalMessage,
  isOpenTranslatorMessage,
  isUiToEngineMessage,
  type EngineBroadcast,
  type OpenTranslatorMessage,
} from '@/lib/messaging/protocol';
import { isExtensionPageSender, isPrivilegedEngineMessage } from '@/lib/messaging/sender';
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
    const onReady = (msg: unknown, sender: { url?: string }) => {
      if (!isEngineInternalMessage(msg)) return;
      if (!isExtensionPageSender(sender.url, browser.runtime.getURL('/'))) return;
      browser.runtime.onMessage.removeListener(onReady);
      resolve();
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

/** Content-script translations are delivered only back to the tab that asked. */
const translationTabs = new Map<string, number>();

function noteTranslationOrigin(message: unknown, sender: { url?: string; tab?: { id?: number } }): void {
  if (!isUiToEngineMessage(message) || message.type !== 'translate:request') return;
  if (isExtensionPageSender(sender.url, browser.runtime.getURL('/'))) return;
  if (sender.tab?.id == null) return;
  translationTabs.set(message.requestId, sender.tab.id);
}

function forwardEngineBroadcast(message: EngineBroadcast): void {
  const tabId = translationTabs.get(message.requestId);
  if (message.type === 'translate:result' || message.type === 'translate:error') {
    translationTabs.delete(message.requestId);
  }
  if (tabId == null) return;
  void browser.tabs.sendMessage(tabId, message).catch(() => undefined);
}

/**
 * Firefox hosts the engine in this background page, so it cannot rely on
 * receiving its own runtime broadcast to perform the tab forwarding.
 */
function publishFirefoxBroadcast(message: EngineBroadcast): void {
  void browser.runtime.sendMessage(message).catch(() => {});
  forwardEngineBroadcast(message);
}

/**
 * The Firefox engine is loaded dynamically to keep it out of Chromium's
 * service worker. Buffer engine messages synchronously so startup cannot lose
 * a request while that local module is being evaluated.
 */
function startFirefoxEngine(): void {
  const pendingMessages: unknown[] = [];
  const bufferMessage = (message: unknown, sender: { url?: string }) => {
    if (isPrivilegedEngineMessage(message) && !isExtensionPageSender(sender.url, browser.runtime.getURL('/'))) {
      return undefined;
    }
    if (isUiToEngineMessage(message)) pendingMessages.push(message);
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
 * Fallback for pages whose content script is missing. The context-menu click
 * already carries the selected text, so the extension does not inject a script
 * into the page. Browsers may truncate `selectionText`.
 */
async function openSelectionFallback(selectionText: string | undefined): Promise<void> {
  const text = selectionText?.trim() ?? '';
  if (text) await openTranslatorPage({ type: 'translator:open', text });
}

export default defineBackground(() => {
  console.log('[Translatly] Background script loaded');

  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    noteTranslationOrigin(msg, sender);
  });

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
      console.error('[Translatly] Content script not reachable; opening the translator for tab', tab.id);
      await openSelectionFallback(info.selectionText).catch((error) =>
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
    browser.runtime.onMessage.addListener(async (msg: unknown, sender) => {
      if (isEngineBroadcast(msg)) {
        forwardEngineBroadcast(msg);
        return undefined;
      }
      if (!isUiToEngineMessage(msg)) return undefined;
      // Relaying repeats the message as the background page. Never upgrade a
      // content-script command into a privileged extension-page command.
      if (isPrivilegedEngineMessage(msg) && !isExtensionPageSender(sender.url, browser.runtime.getURL('/'))) {
        return undefined;
      }
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
