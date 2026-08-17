<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { isEngineBroadcast } from '@/lib/messaging/protocol';
  import { openTranslatorPage } from '@/lib/messaging/navigation';
  import { loadPreferences, type Locale, type ThemePreference } from '@/lib/settings';
  import { languageLabel, translate, type MessageKey } from '@/lib/i18n';
  import bubbleStyles from './bubble.css?raw';

  type Status = 'translating' | 'done' | 'error';

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
  let loadingText = $state('');
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
    const listener = (msg: unknown) => {
      if (!isEngineBroadcast(msg) || msg.requestId !== requestId) return;

      switch (msg.type) {
        case 'translate:queued':
          loadingText = tx('queued', { position: msg.position });
          break;
        case 'translate:progress':
          loadingText =
            msg.progress != null
              ? tx('loadingModelProgress', { progress: msg.progress.toFixed(0) })
              : tx('loadingModel', { status: msg.status });
          break;
        case 'translate:result':
          status = 'done';
          translation = msg.translation;
          break;
        case 'translate:error':
          status = 'error';
          errorMessage = msg.cancelled
            ? tx('cancelled')
            : `${tx('translationError')}: ${msg.error}`;
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
      status = 'error';
    }
  }

  function openFullPage() {
    openTranslatorPage({ text, source, target });
  }
</script>

<svelte:element this={'style'}>{bubbleStyles}</svelte:element>

<div
  class="bubble"
  class:dark={theme === 'dark'}
  class:light={theme === 'light'}
  role="dialog"
  aria-label={tx('translation')}
>
  <div class="top-accent" aria-hidden="true"></div>

  <header class="header">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">T</span>
      <span class="brand-name">Translatly</span>
      <span class="local-badge">
        <span class="local-dot" aria-hidden="true"></span>
        {tx('inferenceLocal')}
      </span>
    </div>
    <button class="close" onclick={onClose} aria-label={tx('close')} title={tx('close')}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 5 10 10M15 5 5 15" />
      </svg>
    </button>
  </header>

  <div class="language-bar">
    <span class="language-chip">{languageLabel(source, locale)}</span>
    <span class="language-arrow" aria-hidden="true">→</span>
    <span class="language-chip target">{languageLabel(target, locale)}</span>
  </div>

  <div class="translation-stack">
    <section class="text-panel source-panel" aria-labelledby="source-label">
      <div class="panel-heading">
        <span id="source-label" class="panel-label">{tx('original')}</span>
        <span class="panel-hint">{tx('staysOnDevice')}</span>
      </div>
      <p class="source-text">{text}</p>
    </section>

    <div class="flow-divider" aria-hidden="true">
      <span class="flow-line"></span>
      <span class="flow-icon">↓</span>
      <span class="flow-line"></span>
    </div>

    <section class="text-panel result-panel" aria-labelledby="result-label" aria-live="polite">
      <div class="panel-heading">
        <span id="result-label" class="panel-label">{tx('translation')}</span>
        <span class="panel-hint">{tx('localModelOutput')}</span>
      </div>

      {#if status === 'translating'}
        <div class="loading-state" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <span>{loadingText || tx('translatingEllipsis')}</span>
        </div>
      {:else if status === 'error'}
        <p class="error-text" role="alert">{errorMessage}</p>
      {:else}
        <p class="result-text">{translation}</p>
      {/if}
    </section>
  </div>

  <footer class="footer">
    <span class="footer-note">
      <span class="footer-dot" aria-hidden="true"></span>
      {tx('inferenceLocal')}
    </span>

    {#if status === 'done'}
      <div class="actions">
        <button class="action-button" onclick={copyTranslation} title={tx('copy')}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="6.5" y="6.5" width="8" height="9" rx="1.5" />
            <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-5A1.5 1.5 0 0 0 4 4.5v7A1.5 1.5 0 0 0 5.5 13H6" />
          </svg>
          {copied ? tx('copied') : tx('copy')}
        </button>
        <button class="action-button primary" onclick={openFullPage}>
          {tx('openInFullPage')}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 15 15 5M7 5h8v8" />
          </svg>
        </button>
      </div>
    {:else if status === 'error'}
      <button class="action-button primary" onclick={openFullPage}>
        {tx('openInFullPage')}
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 15 15 5M7 5h8v8" />
        </svg>
      </button>
    {/if}
  </footer>
</div>
