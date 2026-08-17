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
  // Remove existing bubble if any
  hideBubble();

  // Create host element
  bubbleHost = document.createElement('div');
  bubbleHost.id = 'translatly-bubble-host';
  bubbleHost.style.position = 'fixed';
  bubbleHost.style.zIndex = '2147483647';
  bubbleHost.style.width = 'min(380px, calc(100vw - 24px))';
  bubbleHost.style.pointerEvents = 'none';

  // Position in viewport coordinates because the host is fixed to the viewport.
  const margin = 12;
  const bubbleWidth = Math.min(380, window.innerWidth - margin * 2);
  const estimatedHeight = 270;
  const maxTop = Math.max(margin, window.innerHeight - estimatedHeight - margin);
  const topSpace = rect.top - estimatedHeight - 8;
  const top =
    rect.bottom + 8 + estimatedHeight > window.innerHeight && topSpace >= margin
      ? Math.min(topSpace, maxTop)
      : Math.max(margin, Math.min(rect.bottom + 8, maxTop));
  const maxLeft = Math.max(margin, window.innerWidth - bubbleWidth - margin);
  const left = Math.min(Math.max(rect.left, margin), maxLeft);
  bubbleHost.style.top = `${top}px`;
  bubbleHost.style.left = `${left}px`;

  document.body.appendChild(bubbleHost);

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
  const BubbleComponent = await loadBubble();

  // Mount Svelte component
  const requestId = crypto.randomUUID();
  currentRequestId = requestId;

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
  // Enable pointer events after mount
  bubbleHost.style.pointerEvents = 'auto';

  // Let the component register its listener before the engine can answer.
  queueMicrotask(() => {
    if (currentRequestId === requestId) {
      sendTranslateRequest(text, defaults.source, defaults.target, requestId);
    }
  });
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
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return;
  }

  const text = selection.toString().trim();
  if (!text || text.length > 5000) {
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  await showBubble(text, rect);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Listen for mouseup to detect selection
    document.addEventListener('mouseup', (e) => {
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
      if (typeof msg === 'object' && msg !== null && 'type' in msg) {
        const type = (msg as { type?: unknown }).type;
        if (type === 'translate-selection') {
          handleSelection();
          return true;
        }
      }
      return false;
    });
  },
});
