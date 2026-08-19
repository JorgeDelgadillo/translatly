import { browser } from 'wxt/browser';
import { mount, unmount } from 'svelte';
import { sendTranslateCancel, sendTranslateRequest } from '@/lib/messaging/translate';
import { loadDefaultLanguages } from '@/lib/settings';

let bubbleHost: HTMLDivElement | null = null;
let bubbleShadow: ShadowRoot | null = null;
let bubbleComponent: ReturnType<typeof mount> | null = null;
let currentRequestId: string | null = null;
let defaults = { source: 'en', target: 'es' };

let triggerHost: HTMLDivElement | null = null;
let triggerShadow: ShadowRoot | null = null;
let triggerComponent: ReturnType<typeof mount> | null = null;
let pendingTrigger: { text: string; rect: DOMRect } | null = null;

// Lazy load components to avoid SSR issues during pre-rendering
let Bubble: typeof import('./Bubble.svelte').default | null = null;
async function loadBubble() {
  if (!Bubble) {
    const module = await import('./Bubble.svelte');
    Bubble = module.default;
  }
  return Bubble;
}

let TranslateTrigger: typeof import('./TranslateTrigger.svelte').default | null = null;
async function loadTrigger() {
  if (!TranslateTrigger) {
    const module = await import('./TranslateTrigger.svelte');
    TranslateTrigger = module.default;
  }
  return TranslateTrigger;
}

// Load default languages on script initialization
loadDefaultLanguages().then((d) => {
  defaults = d;
});

const MAX_SELECTION_LENGTH = 5000;

function getSelectionInfo(): { text: string; rect: DOMRect } | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return undefined;

  const text = selection.toString().trim();
  if (!text || text.length > MAX_SELECTION_LENGTH) return undefined;

  const range = selection.getRangeAt(0);
  return { text, rect: range.getBoundingClientRect() };
}

// ---- Translation bubble ---------------------------------------------------

async function showBubble(text: string, rect: DOMRect) {
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

// ---- Translate trigger icon ------------------------------------------------

const TRIGGER_SIZE = 30;
const TRIGGER_MARGIN = 8;
const TRIGGER_GAP = 8;

async function showTrigger(text: string, rect: DOMRect) {
  hideBubble();
  hideTrigger();

  triggerHost = document.createElement('div');
  triggerHost.id = 'translatly-trigger-host';
  triggerHost.style.position = 'fixed';
  triggerHost.style.zIndex = '2147483647';
  triggerHost.style.width = `${TRIGGER_SIZE}px`;
  triggerHost.style.height = `${TRIGGER_SIZE}px`;
  triggerHost.style.pointerEvents = 'none';

  positionTrigger(rect);
  document.body.appendChild(triggerHost);

  triggerShadow = triggerHost.attachShadow({ mode: 'open' });

  const TriggerComponent = await loadTrigger();
  pendingTrigger = { text, rect };
  triggerComponent = mount(TriggerComponent, {
    target: triggerShadow,
    props: {
      onClick: () => {
        if (!pendingTrigger) return;
        const { text: pendingText, rect: pendingRect } = pendingTrigger;
        hideTrigger();
        void showBubble(pendingText, pendingRect);
      },
    },
  });
  // Enable pointer events after mount
  triggerHost.style.pointerEvents = 'auto';
}

function positionTrigger(rect: DOMRect) {
  if (!triggerHost) return;
  let left = rect.right + TRIGGER_GAP;
  let top = rect.top;
  // Flip to the left side of the selection when there is no room on the right.
  if (left + TRIGGER_SIZE > window.innerWidth - TRIGGER_MARGIN) {
    left = rect.left - TRIGGER_SIZE - TRIGGER_GAP;
  }
  left = Math.max(TRIGGER_MARGIN, Math.min(left, window.innerWidth - TRIGGER_SIZE - TRIGGER_MARGIN));
  top = Math.max(TRIGGER_MARGIN, Math.min(top, window.innerHeight - TRIGGER_SIZE - TRIGGER_MARGIN));
  triggerHost.style.left = `${left}px`;
  triggerHost.style.top = `${top}px`;
}

function hideTrigger() {
  pendingTrigger = null;
  if (triggerComponent) {
    unmount(triggerComponent);
    triggerComponent = null;
  }
  if (triggerHost) {
    triggerHost.remove();
    triggerHost = null;
  }
  triggerShadow = null;
}

// ---- Selection handling ----------------------------------------------------

async function handleSelection() {
  const info = getSelectionInfo();
  if (info) await showTrigger(info.text, info.rect);
}

async function translateSelection() {
  const info = getSelectionInfo();
  if (info) {
    hideTrigger();
    await showBubble(info.text, info.rect);
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  // Some pages (LinkedIn, Google Docs, …) render content in iframes or stop
  // event propagation on their own handlers; capture-phase listeners and
  // per-frame injection keep the inline surface working everywhere.
  allFrames: true,
  main() {
    // Listen for mouseup to detect selection and show the translate trigger.
    // Capture phase so page scripts cannot swallow the event.
    document.addEventListener(
      'mouseup',
      (e) => {
        // Ignore interactions inside the extension's own surfaces
        if (bubbleHost && bubbleHost.contains(e.target as Node)) return;
        if (triggerHost && triggerHost.contains(e.target as Node)) return;

        // Small delay to let selection finalize
        setTimeout(handleSelection, 10);
      },
      true,
    );

    // Listen for clicks outside the bubble or trigger to close them
    document.addEventListener(
      'mousedown',
      (e) => {
        const target = e.target as Node;
        if (bubbleHost && bubbleHost.contains(target)) return;
        if (triggerHost && triggerHost.contains(target)) return;
        hideBubble();
        hideTrigger();
      },
      true,
    );

    // Close surfaces with Escape
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          hideBubble();
          hideTrigger();
        }
      },
      true,
    );

    // The trigger floats near the selection; drop it when the page moves.
    document.addEventListener('scroll', () => hideTrigger(), true);

    // Listen for messages from background (e.g., context menu). The listener
    // returns false so the sender's sendMessage promise settles immediately;
    // otherwise the channel stays open waiting for a response that never comes.
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { type?: unknown }).type === 'translate-selection'
      ) {
        void translateSelection();
      }
      return false;
    });
  },
});
