import { browser } from 'wxt/browser';
import { mount, unmount } from 'svelte';
import { sendTranslateCancel, sendTranslateRequest } from '@/lib/messaging/translate';
import { loadDefaultLanguages } from '@/lib/settings';

let bubbleHost: HTMLDivElement | null = null;
let bubbleShadow: ShadowRoot | null = null;
let bubbleComponent: ReturnType<typeof mount> | null = null;
let currentRequestId: string | null = null;
let defaults = { source: 'en', target: 'es' };

// Lazy load Bubble component to avoid SSR issues during pre-rendering
let Bubble: typeof import('./Bubble.svelte').default | null = null;
async function loadBubble() {
  if (!Bubble) {
    const module = await import('./Bubble.svelte');
    Bubble = module.default;
  }
  return Bubble;
}

// Load default languages on script initialization
loadDefaultLanguages().then((d) => {
  defaults = d;
});

async function showBubble(text: string, rect: DOMRect) {
  console.log('[Translatly] showBubble called with text:', text.substring(0, 50));
  // Remove existing bubble if any
  hideBubble();

  // Create host element
  bubbleHost = document.createElement('div');
  bubbleHost.id = 'translatly-bubble-host';
  bubbleHost.style.position = 'fixed';
  bubbleHost.style.zIndex = '2147483647';
  bubbleHost.style.pointerEvents = 'none';

  // Position near selection
  const top = rect.bottom + window.scrollY + 8;
  const left = rect.left + window.scrollX;
  bubbleHost.style.top = `${top}px`;
  bubbleHost.style.left = `${left}px`;
  console.log('[Translatly] Bubble position:', { top, left });

  document.body.appendChild(bubbleHost);
  console.log('[Translatly] Bubble host appended to body');

  // Create Shadow DOM
  bubbleShadow = bubbleHost.attachShadow({ mode: 'closed' });

  // Inject base styles into Shadow DOM
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #213547;
      background-color: #ffffff;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        color: rgba(255, 255, 255, 0.87);
        background-color: #242424;
      }
    }
  `;
  bubbleShadow.appendChild(style);

  // Load Bubble component dynamically
  console.log('[Translatly] Loading Bubble component...');
  const BubbleComponent = await loadBubble();
  console.log('[Translatly] Bubble component loaded');

  // Mount Svelte component
  const requestId = sendTranslateRequest(text, defaults.source, defaults.target);
  currentRequestId = requestId;
  console.log('[Translatly] Translation request sent:', requestId);

  bubbleComponent = mount(BubbleComponent, {
    target: bubbleShadow,
    props: {
      text,
      source: defaults.source,
      target: defaults.target,
      requestId,
      onClose: hideBubble,
    },
  });
  console.log('[Translatly] Bubble component mounted');

  // Enable pointer events after mount
  bubbleHost.style.pointerEvents = 'auto';
}

function hideBubble() {
  if (currentRequestId) {
    sendTranslateCancel(currentRequestId);
  }

  if (bubbleComponent) {
    unmount(bubbleComponent);
    bubbleComponent = null;
  }
  if (bubbleHost) {
    bubbleHost.remove();
    bubbleHost = null;
  }
  bubbleShadow = null;
  currentRequestId = null;
}

async function handleSelection() {
  console.log('[Translatly] handleSelection called');
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    console.log('[Translatly] No selection or collapsed');
    return;
  }

  const text = selection.toString().trim();
  console.log('[Translatly] Selected text:', text.substring(0, 50));
  if (!text || text.length > 5000) {
    console.log('[Translatly] Text empty or too long');
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  console.log('[Translatly] Selection rect:', rect);

  await showBubble(text, rect);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.log('[Translatly] Content script loaded');

    // Listen for mouseup to detect selection
    document.addEventListener('mouseup', (e) => {
      console.log('[Translatly] mouseup detected');
      // Ignore clicks inside the bubble
      if (bubbleHost && bubbleHost.contains(e.target as Node)) {
        return;
      }

      // Small delay to let selection finalize
      setTimeout(handleSelection, 10);
    });

    // Listen for clicks outside bubble to close it
    document.addEventListener('mousedown', (e) => {
      if (bubbleHost && !bubbleHost.contains(e.target as Node)) {
        hideBubble();
      }
    });

    // Listen for messages from background (e.g., context menu)
    browser.runtime.onMessage.addListener((msg: unknown) => {
      console.log('[Translatly] Message received:', msg);

      // Log all engine broadcasts for debugging
      if (typeof msg === 'object' && msg !== null && 'type' in msg) {
        const type = (msg as any).type;
        if (
          type === 'translate:queued' ||
          type === 'translate:progress' ||
          type === 'translate:result' ||
          type === 'translate:error'
        ) {
          console.log('[Translatly] Engine broadcast:', type, msg);
        }

        if (type === 'translate-selection') {
          console.log('[Translatly] translate-selection triggered');
          handleSelection();
          return true;
        }
      }
      return false;
    });

    console.log('[Translatly] Event listeners registered');
  },
});
