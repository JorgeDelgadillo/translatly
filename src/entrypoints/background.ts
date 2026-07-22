import { browser } from 'wxt/browser';
import { startEngineHost } from '@/lib/engine/engine-host';
import { isEngineInternalMessage, isUiToEngineMessage } from '@/lib/messaging/protocol';

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

export default defineBackground(() => {
  // Create context menu for translating selected text
  browser.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate with Translatly',
    contexts: ['selection'],
  });

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'translate-selection' && tab?.id) {
      // Send message to content script to trigger translation
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'translate-selection' });
      } catch (error) {
        console.error('Failed to send message to content script:', error);
      }
    }
  });

  if (supportsOffscreen()) {
    // Chromium MV3: relay UI messages to the offscreen engine host. Results
    // come back as engine broadcasts; no sendResponse is needed.
    browser.runtime.onMessage.addListener(async (msg: unknown) => {
      if (!isUiToEngineMessage(msg)) return undefined;
      await ensureOffscreenDocument();
      await whenEngineReady();
      browser.runtime.sendMessage(msg).catch(() => {});
      return undefined;
    });
  } else {
    // Firefox MV2 has no offscreen API: the persistent background page hosts
    // the engine itself and answers translation requests directly.
    startEngineHost();
  }
});
