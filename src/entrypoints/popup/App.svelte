<script lang="ts">
  import { onMount } from 'svelte';
  import {
    sendTranslateRequest,
    sendTranslateCancel,
    onEngineBroadcast,
  } from '@/lib/messaging/translate';
  import { LANGUAGES, getTranslationRoute, supportedTargets } from '@/lib/engine/registry';
  import { loadPreferences, savePreferences, type Locale, type ThemePreference } from '@/lib/settings';
  import { languageLabel, translate, type MessageKey } from '@/lib/i18n';
  import { applyDocumentPreferences } from '@/lib/theme';
  import { openTranslatorPage } from '@/lib/messaging/navigation';

  type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; text: string }
    | { kind: 'error'; text: string };

  let loaded = $state(false);
  let source = $state('en');
  let target = $state('es');
  let locale = $state<Locale>('en');
  let theme = $state<ThemePreference>('system');
  let text = $state('');
  let result = $state('');
  let resultPair = $state<{ source: string; target: string } | null>(null);
  let activePair = $state<{ source: string; target: string } | null>(null);
  let status = $state<Status>({ kind: 'idle' });
  let busy = $state(false);
  let copied = $state(false);
  let currentRequestId: string | null = null;

  const availableTargets = $derived(supportedTargets(source));

  function tx(key: MessageKey, values: Record<string, string | number> = {}): string {
    return translate(key, locale, values);
  }

  function localizedLanguageName(code: string): string {
    return languageLabel(code, locale);
  }

  $effect(() => {
    applyDocumentPreferences(locale, theme);
  });

  onMount(async () => {
    const preferences = await loadPreferences();
    source = preferences.source;
    target = preferences.target;
    locale = preferences.locale;
    theme = preferences.theme;
    loaded = true;
  });

  $effect(() => {
    if (!loaded) return;
    if (availableTargets.length > 0 && !availableTargets.includes(target)) {
      target = availableTargets[0]!;
      return;
    }
    void savePreferences({ source, target, locale, theme });
  });

  $effect(() => {
    const off = onEngineBroadcast((msg) => {
      if (currentRequestId == null || msg.requestId !== currentRequestId) return;
      switch (msg.type) {
        case 'translate:queued':
          status = { kind: 'busy', text: tx('queued', { position: msg.position }) };
          break;
        case 'translate:progress':
          status = {
            kind: 'busy',
            text:
              msg.progress != null
                ? tx('loadingModelProgress', { progress: msg.progress.toFixed(0) })
                : tx('loadingModel', { status: msg.status }),
          };
          break;
        case 'translate:result':
          result = msg.translation;
          resultPair = activePair;
          activePair = null;
          status = { kind: 'idle' };
          busy = false;
          currentRequestId = null;
          copied = false;
          break;
        case 'translate:error':
          status = {
            kind: 'error',
            text: msg.cancelled ? tx('cancelled') : msg.error || tx('translationFailed'),
          };
          activePair = null;
          busy = false;
          currentRequestId = null;
          break;
      }
    });
    return off;
  });

  function runTranslate() {
    if (busy || !text.trim() || !source || !target) return;
    if (!getTranslationRoute(source, target)) {
      status = {
        kind: 'error',
        text: tx('noModel', { source: localizedLanguageName(source), target: localizedLanguageName(target) }),
      };
      return;
    }
    result = '';
    resultPair = null;
    copied = false;
    activePair = { source, target };
    const id = sendTranslateRequest(text, source, target);
    currentRequestId = id;
    busy = true;
    status = { kind: 'busy', text: tx('translating') };
  }

  function cancel() {
    if (currentRequestId) {
      sendTranslateCancel(currentRequestId);
      status = { kind: 'busy', text: tx('cancelling') };
    }
  }

  function swap() {
    const previous = source;
    source = target;
    target = previous;
    result = '';
    resultPair = null;
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      status = { kind: 'error', text: tx('couldNotCopy') };
    }
  }

  function openFullTranslator() {
    openTranslatorPage({ text, source, target });
  }
</script>

<main class="popup-shell" aria-labelledby="popup-title">
  <header class="header">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">T<span>.</span></span>
      <div>
        <h1 id="popup-title">Translatly</h1>
        <span class="local-note"><span aria-hidden="true"></span>{tx('inferenceLocal')}</span>
      </div>
    </div>
    <span class="surface-label">{tx('localDesk')}</span>
  </header>

  <div class="language-bar" aria-label={tx('language')}>
    <label class="language-field">
      <span>{tx('from')}</span>
      <select bind:value={source} disabled={busy}>
        {#each LANGUAGES as lang (lang.code)}
          <option value={lang.code}>{localizedLanguageName(lang.code)}</option>
        {/each}
      </select>
    </label>

    <button class="swap" onclick={swap} disabled={busy} title={tx('swapLanguages')} aria-label={tx('swapLanguages')}>
      ⇄
    </button>

    <label class="language-field">
      <span>{tx('to')}</span>
      <select bind:value={target} disabled={busy || availableTargets.length === 0}>
        {#each availableTargets as code (code)}
          <option value={code}>{localizedLanguageName(code)}</option>
        {/each}
      </select>
    </label>
  </div>

  <section class="editor-card" aria-labelledby="input-title">
    <div class="editor-heading">
      <span id="input-title">{localizedLanguageName(source)}</span>
      <span>{text.length}/5000</span>
    </div>
    <textarea
      bind:value={text}
      rows="5"
      maxlength="5000"
      aria-label={tx('textToTranslate')}
      placeholder={tx('textPlaceholder')}
      onkeydown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          runTranslate();
        }
      }}
    ></textarea>
    <div class="editor-footer">
      <span><span class="privacy-dot" aria-hidden="true"></span>{tx('staysOnDevice')}</span>
      {#if text}
        <button class="clear-button" onclick={() => (text = '')}>{tx('clear')}</button>
      {/if}
    </div>
  </section>

  <div class="actions">
    <button class="primary" onclick={runTranslate} disabled={busy || !text.trim()}>
      {busy ? tx('working') : tx('translate')}
      <span aria-hidden="true">↗</span>
    </button>
    {#if busy}
      <button class="quiet" onclick={cancel}>{tx('cancel')}</button>
    {/if}
    <button class="full-page" onclick={openFullTranslator}>{tx('openFullTranslator')}</button>
  </div>

  {#if result && resultPair}
    <section class="result-card" aria-live="polite" aria-labelledby="result-title">
      <div class="result-heading">
        <span id="result-title">{localizedLanguageName(resultPair.source)} <b aria-hidden="true">→</b> {localizedLanguageName(resultPair.target)}</span>
        <button class="copy-button" onclick={copyResult}>{copied ? tx('copied') : tx('copy')}</button>
      </div>
      <p>{result}</p>
    </section>
  {/if}

  {#if status.kind !== 'idle'}
    <p class="status" class:error={status.kind === 'error'} aria-live="polite" role={status.kind === 'error' ? 'alert' : 'status'}>
      {status.text}
    </p>
  {/if}
</main>

<style>
  .popup-shell {
    --canvas: #f2eee4;
    --paper: #fffdf8;
    --surface: #ebe5d7;
    --ink: #112337;
    --muted: #6d7b7c;
    --line: #d1d8d1;
    --accent: #ed7259;
    --accent-soft: #f7ddd5;
    width: 380px;
    min-height: 470px;
    box-sizing: border-box;
    padding: 16px;
    background: var(--canvas);
    color: var(--ink);
  }

  .header,
  .brand,
  .local-note,
  .language-bar,
  .editor-heading,
  .editor-footer,
  .actions,
  .result-heading {
    display: flex;
    align-items: center;
  }

  .header {
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .brand {
    gap: 9px;
  }

  .brand-mark {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 9px;
    background: var(--ink);
    color: var(--paper);
    font-family: Georgia, serif;
    font-size: 17px;
    font-weight: 700;
  }

  .brand-mark span {
    color: var(--accent);
  }

  h1 {
    margin: 0;
    font-size: 15px;
    letter-spacing: -0.02em;
  }

  .local-note {
    gap: 5px;
    margin-top: 2px;
    color: var(--muted);
    font-size: 9px;
  }

  .local-note span,
  .privacy-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4e9b79;
    box-shadow: 0 0 0 3px rgba(78, 155, 121, 0.14);
  }

  .surface-label {
    color: var(--accent);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .language-bar {
    gap: 8px;
    margin-bottom: 12px;
  }

  .language-field {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 5px;
  }

  .language-field > span,
  .editor-heading,
  .editor-footer,
  .result-heading,
  .status {
    color: var(--muted);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  select,
  textarea,
  button {
    font: inherit;
  }

  select {
    width: 100%;
    min-width: 0;
    padding: 8px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    outline: none;
    background: var(--paper);
    color: var(--ink);
    font-size: 12px;
  }

  .swap {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    align-self: end;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    font-size: 17px;
  }

  .editor-card,
  .result-card {
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--paper);
  }

  .editor-card {
    padding: 12px;
  }

  .editor-heading {
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .editor-heading span:first-child {
    color: var(--accent);
    font-weight: 700;
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 130px;
    box-sizing: border-box;
    resize: vertical;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    font-size: 16px;
    line-height: 1.45;
  }

  textarea::placeholder {
    color: #a0aaa4;
  }

  .editor-footer {
    justify-content: space-between;
    gap: 8px;
    padding-top: 9px;
    border-top: 1px solid var(--line);
  }

  .editor-footer > span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .clear-button,
  .full-page,
  .copy-button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .actions {
    flex-wrap: wrap;
    gap: 7px;
    margin: 12px 0;
  }

  .actions button {
    min-height: 34px;
    padding: 8px 11px;
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
    font-size: 11px;
  }

  .actions .primary {
    flex: 1;
    border-color: var(--accent);
    background: var(--accent);
    color: #fffdf8;
    font-weight: 700;
  }

  .actions .quiet {
    background: transparent;
    color: var(--ink);
  }

  .actions .full-page {
    border: 0;
    color: var(--accent);
  }

  button:hover:not(:disabled),
  .clear-button:hover,
  .full-page:hover,
  .copy-button:hover {
    filter: brightness(0.95);
  }

  button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .result-card {
    padding: 12px;
    background: #edf5ef;
  }

  .result-heading {
    justify-content: space-between;
    gap: 8px;
  }

  .result-heading b {
    color: var(--accent);
    font-weight: 400;
  }

  .result-card p {
    margin: 10px 0 0;
    color: var(--ink);
    font-size: 15px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .status {
    margin: 0;
    line-height: 1.5;
  }

  .status.error {
    color: #b44f43;
  }

  :global(html[data-theme='dark']) .popup-shell {
    --canvas: #101a24;
    --paper: #182733;
    --surface: #26343d;
    --ink: #f4f0e8;
    --muted: #b2c0bd;
    --line: #50636b;
    --accent: #ff947c;
    --accent-soft: #4a2d2d;
  }

  @media (prefers-color-scheme: light) {
    :global(html[data-theme='system']) .popup-shell {
      --canvas: #f2eee4;
      --paper: #fffdf8;
      --surface: #ebe5d7;
      --ink: #112337;
      --muted: #6d7b7c;
      --line: #d1d8d1;
      --accent: #ed7259;
      color-scheme: light;
    }
  }

  :global(html[data-theme='dark']) .result-card {
    background: #1d3836;
  }

  :global(html[data-theme='light']) .popup-shell {
    color-scheme: light;
  }

  :global(html[data-theme='dark']) .popup-shell {
    color-scheme: dark;
  }

  @media (prefers-color-scheme: dark) {
    :global(html[data-theme='system']) .popup-shell {
      --canvas: #101a24;
      --paper: #182733;
      --surface: #26343d;
      --ink: #f4f0e8;
      --muted: #b2c0bd;
      --line: #50636b;
      --accent: #ff947c;
      --accent-soft: #4a2d2d;
      color-scheme: dark;
    }

    :global(html[data-theme='system']) .result-card {
      background: #1d3836;
    }
  }

  button:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  @media (max-width: 380px) {
    .popup-shell {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
