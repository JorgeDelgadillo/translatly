import { browser } from 'wxt/browser';
import { mount, unmount } from 'svelte';
import { sendTranslateRequest } from '@/lib/messaging/translate';
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
  bubbleHost.style.pointerEvents = 'none';

  // Position near selection
  const top = rect.bottom + window.scrollY + 8;
  const left = rect.left + window.scrollX;
  bubbleHost.style.top = `${top}px`;
  bubbleHost.style.left = `${left}px`;

  document.body.appendChild(bubbleHost);

  // Create Shadow DOM
  bubbleShadow = bubbleHost.attachShadow({ mode: 'closed' });

  // Load Bubble component dynamically
  const BubbleComponent = await loadBubble();

  // Mount Svelte component
  const requestId = sendTranslateRequest(text, defaults.source, defaults.target);
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
}

function hideBubble() {
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
    if (msg.type === 'translate-selection') {
      handleSelection();
      return true;
    }
  }
  return false;
});

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Content script initialized
  },
});
