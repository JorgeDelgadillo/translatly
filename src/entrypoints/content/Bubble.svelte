<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import type { EngineBroadcast } from '@/lib/messaging/protocol';
  import { openTranslatorPage } from '@/lib/messaging/navigation';
  import { loadPreferences, type Locale, type ThemePreference } from '@/lib/settings';
  import { languageLabel, translate, type MessageKey } from '@/lib/i18n';

  type Status = 'idle' | 'translating' | 'done' | 'error';

  interface Props {
    text: string;
    source: string;
    target: string;
    requestId: string;
    onClose: () => void;
  }

  let { text, source, target, requestId, onClose }: Props = $props();

  let status = $state<Status>('translating');
  let translation = $state('');
  let errorMessage = $state('');
  let copied = $state(false);
  let locale = $state<Locale>('en');
  let theme = $state<ThemePreference>('system');

  function tx(key: MessageKey, values: Record<string, string | number> = {}): string {
    return translate(key, locale, values);
  }

  onMount(async () => {
    const preferences = await loadPreferences();
    locale = preferences.locale;
    theme = preferences.theme;
  });

  $effect(() => {
    console.log('[Translatly Bubble] Setting up message listener');
    const listener = (msg: unknown) => {
      console.log('[Translatly Bubble] Message received:', msg);
      if (!isEngineBroadcast(msg)) return;
      if (msg.requestId !== requestId) {
        console.log('[Translatly Bubble] Ignoring message for different requestId');
        return;
      }

      console.log('[Translatly Bubble] Processing message:', msg.type);
      switch (msg.type) {
        case 'translate:result':
          console.log('[Translatly Bubble] Translation result:', msg.translation);
          status = 'done';
          translation = msg.translation;
          break;
        case 'translate:error':
          console.log('[Translatly Bubble] Translation error:', msg.error);
          status = 'error';
          errorMessage = tx('translationError') + ': ' + msg.error;
          break;
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  });

  async function copyTranslation() {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      errorMessage = tx('failedToCopy');
    }
  }

  function openFullPage() {
    openTranslatorPage({ text, source, target });
  }

  function isEngineBroadcast(msg: unknown): msg is EngineBroadcast {
    return (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      ['translate:queued', 'translate:progress', 'translate:result', 'translate:error'].includes(
        msg.type as string,
      )
    );
  }
</script>

<div class="bubble" class:dark={theme === 'dark'} class:light={theme === 'light'} role="dialog" aria-label={tx('translation')}>
  <div class="header">
    <span class="lang">{languageLabel(source, locale)} → {languageLabel(target, locale)}</span>
    <button class="close" onclick={onClose} aria-label={tx('close')}>×</button>
  </div>

  {#if status === 'translating'}
    <div class="content translating" role="status" aria-live="polite">{tx('translatingEllipsis')}</div>
  {:else if status === 'error'}
    <div class="content error" role="alert">{errorMessage}</div>
  {:else if status === 'done'}
    <div class="content done">
      <p class="translation">{translation}</p>
      <div class="actions">
        <button onclick={copyTranslation}>{copied ? tx('copiedBang') : tx('copy')}</button>
        <button onclick={openFullPage}>{tx('openInFullPage')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .bubble {
    --bubble-bg: #fffdf7;
    --bubble-surface: #f4f0e8;
    --bubble-ink: #213547;
    --bubble-line: #d4d9d6;
    --bubble-accent: #ed7259;
    position: relative;
    background: var(--bubble-bg);
    border: 1px solid var(--bubble-line);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 400px;
    min-width: 200px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
  }

  .bubble.dark {
    --bubble-bg: #182733;
    --bubble-surface: #101a24;
    --bubble-ink: #f4f0e8;
    --bubble-line: #65717a;
    --bubble-accent: #ff947c;
  }

  @media (prefers-color-scheme: dark) {
    .bubble:not(.light) {
      --bubble-bg: #182733;
      --bubble-surface: #101a24;
      --bubble-ink: #f4f0e8;
      --bubble-line: #65717a;
      --bubble-accent: #ff947c;
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--bubble-line);
    background: var(--bubble-surface);
    border-radius: 8px 8px 0 0;
  }

  .lang {
    font-size: 12px;
    color: var(--bubble-ink);
    font-weight: 500;
  }

  .close {
    background: none;
    border: none;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: var(--bubble-ink);
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close:hover {
    color: #333;
  }

  .content {
    padding: 12px;
  }

  .translating {
    color: var(--bubble-ink);
    font-style: italic;
  }

  .error {
    color: #b44f43;
    font-size: 13px;
  }

  .done .translation {
    margin: 0 0 12px 0;
    line-height: 1.5;
    color: var(--bubble-ink);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions button {
    padding: 6px 12px;
    border: 1px solid var(--bubble-line);
    border-radius: 4px;
    background: var(--bubble-bg);
    cursor: pointer;
    font-size: 12px;
    color: var(--bubble-ink);
    transition: all 0.2s;
  }

  .actions button:hover {
    background: var(--bubble-surface);
    border-color: var(--bubble-accent);
  }

  button:focus-visible {
    outline: 3px solid var(--bubble-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
    }
  }
</style>
